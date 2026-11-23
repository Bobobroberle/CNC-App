#!/usr/bin/env python3
"""Reads an LSM6DSO accelerometer (e.g. SparkFun Qwiic) over I2C and reports
vibration blocks to the LowRider companion for chatter detection.

The sensor samples into its FIFO at up to 3.33 kHz; every 250 ms this script
drains the FIFO, turns X/Y/Z into the magnitude without gravity and POSTs

    {"accel": [g, ...], "sampleRate": 3333}

to http://localhost:8080/api/sensors (see docs/companion.md).

Not yet tested against the real sensor: run `--selftest` first.
Needs python3-smbus2 and I2C enabled (scripts/pi/setup.sh does both).
"""

import argparse
import json
import math
import sys
import time
import urllib.request

WHO_AM_I = 0x0F
WHO_AM_I_VALUE = 0x6C
FIFO_CTRL3 = 0x09  # BDR_XL [3:0], BDR_GY [7:4]
FIFO_CTRL4 = 0x0A  # FIFO_MODE [2:0]
CTRL1_XL = 0x10  # ODR_XL [7:4], FS_XL [3:2]
CTRL3_C = 0x12  # BOOT, BDU, ..., IF_INC, SW_RESET
FIFO_STATUS1 = 0x3A  # DIFF_FIFO [7:0]; FIFO_STATUS2 holds [9:8] and the overrun flag
FIFO_DATA_OUT_TAG = 0x78  # tag, then X, Y, Z as little-endian int16 (0x79–0x7E)

TAG_ACCEL = 0x02
FIFO_CONTINUOUS = 0x06
FIFO_DEPTH = 512 // 7 * 7  # bytes per burst read, whole words

# ODR / batch-rate code per sample rate (same table for ODR_XL and BDR_XL)
RATES = {417: 0x6, 833: 0x7, 1667: 0x8, 3333: 0x9, 6667: 0xA}
# FS_XL code and sensitivity in g per LSB per full scale
RANGES = {2: (0b00, 0.061e-3), 4: (0b10, 0.122e-3), 8: (0b11, 0.244e-3), 16: (0b01, 0.488e-3)}


def int16(lo, hi):
    v = lo | (hi << 8)
    return v - 0x10000 if v & 0x8000 else v


def decode_words(data, scale):
    """FIFO bytes (7 per word) → accelerometer samples (x, y, z) in g."""
    out = []
    for i in range(0, len(data) - len(data) % 7, 7):
        if data[i] >> 3 != TAG_ACCEL:
            continue
        out.append(tuple(int16(data[i + 1 + 2 * k], data[i + 2 + 2 * k]) * scale for k in range(3)))
    return out


def vibration(samples):
    """Magnitude of each sample with the block mean (gravity) removed."""
    mags = [math.sqrt(x * x + y * y + z * z) for x, y, z in samples]
    if not mags:
        return []
    mean = sum(mags) / len(mags)
    return [round(m - mean, 5) for m in mags]


class LSM6DSO:
    def __init__(self, bus, address=0x6B, rate=3333, full_scale=8, burst=True):
        self.bus = bus
        self.address = address
        self.rate = rate
        self.scale = RANGES[full_scale][1]
        self.fs_code = RANGES[full_scale][0]
        self.burst = burst

    def read(self, register, length):
        return bytes(self.bus.read_i2c_block_data(self.address, register, length))

    def write(self, register, value):
        self.bus.write_byte_data(self.address, register, value)

    def setup(self):
        who = self.read(WHO_AM_I, 1)[0]
        if who != WHO_AM_I_VALUE:
            raise RuntimeError(f'WHO_AM_I is 0x{who:02X}, expected 0x6C – wrong sensor or address?')
        self.write(CTRL3_C, 0x01)  # software reset
        time.sleep(0.05)
        self.write(CTRL3_C, 0x44)  # block data update, address auto-increment
        code = RATES[self.rate]
        self.write(CTRL1_XL, (code << 4) | (self.fs_code << 2))
        self.write(FIFO_CTRL3, code)  # accelerometer into the FIFO, gyro not
        self.write(FIFO_CTRL4, FIFO_CONTINUOUS)

    def pending(self):
        """Words waiting in the FIFO and whether it overran since the last read."""
        lo, hi = self.read(FIFO_STATUS1, 2)
        return lo | ((hi & 0x03) << 8), bool(hi & 0x40)

    def drain(self):
        words, overrun = self.pending()
        data = bytearray()
        while words > 0:
            if self.burst:
                # With IF_INC the address wraps from 0x7E back to the tag
                # register, so one long read returns several words.
                n = min(words, FIFO_DEPTH // 7)
                data += self.read_long(FIFO_DATA_OUT_TAG, 7 * n)
            else:
                n = 1
                data += self.read(FIFO_DATA_OUT_TAG, 7)
            words -= n
        return decode_words(bytes(data), self.scale), overrun

    def read_long(self, register, length):
        from smbus2 import i2c_msg  # only on the Pi

        write = i2c_msg.write(self.address, [register])
        read = i2c_msg.read(self.address, length)
        self.bus.i2c_rdwr(write, read)
        return bytes(read)


def post(url, payload):
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    with urllib.request.urlopen(request, timeout=2) as response:
        response.read()


def selftest(sensor):
    sensor.setup()
    time.sleep(0.3)
    samples, overrun = sensor.drain()
    if not samples:
        print('No samples from the FIFO – try --no-burst.')
        return 1
    mean = [sum(s[k] for s in samples) / len(samples) for k in range(3)]
    g = math.sqrt(sum(m * m for m in mean))
    rate = len(samples) / 0.3
    print(f'{len(samples)} samples (~{rate:.0f}/s), mean X {mean[0]:+.3f} Y {mean[1]:+.3f} Z {mean[2]:+.3f} g')
    print(f'gravity {g:.3f} g (should be close to 1.000){" – FIFO overran" if overrun else ""}')
    return 0 if 0.9 < g < 1.1 else 1


def run(sensor, url, interval, once=False, clock=time.monotonic, sleep=time.sleep, send=post):
    sensor.setup()
    next_at = clock()
    while True:
        next_at += interval
        sleep(max(0.0, next_at - clock()))
        samples, overrun = sensor.drain()
        if overrun:
            print('FIFO overran – the Pi read too slowly; lower --rate', file=sys.stderr)
        block = vibration(samples)[-8192:]
        if len(block) >= 64:
            try:
                send(url, {'accel': block, 'sampleRate': sensor.rate})
            except OSError as error:
                print(f'companion not reachable: {error}', file=sys.stderr)
        if once:
            return block


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--bus', type=int, default=1, help='I2C bus (Pi: 1)')
    parser.add_argument('--address', type=lambda v: int(v, 0), default=0x6B, help='0x6B (SparkFun) or 0x6A')
    parser.add_argument('--rate', type=int, choices=sorted(RATES), default=3333, help='samples per second')
    parser.add_argument('--range', type=int, choices=sorted(RANGES), default=8, help='full scale in g')
    parser.add_argument('--url', default='http://localhost:8080/api/sensors')
    parser.add_argument('--interval', type=float, default=0.25, help='seconds per block')
    parser.add_argument('--no-burst', action='store_true', help='read the FIFO word by word')
    parser.add_argument('--selftest', action='store_true', help='check the sensor and exit')
    args = parser.parse_args(argv)

    from smbus2 import SMBus  # only on the Pi

    with SMBus(args.bus) as bus:
        sensor = LSM6DSO(bus, args.address, args.rate, args.range, burst=not args.no_burst)
        if args.selftest:
            return selftest(sensor)
        run(sensor, args.url, args.interval)
    return 0


if __name__ == '__main__':
    sys.exit(main())
