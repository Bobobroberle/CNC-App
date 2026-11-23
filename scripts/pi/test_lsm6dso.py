"""Tests for lsm6dso.py against a fake I2C bus: python3 -m unittest discover -s scripts/pi"""

import struct
import unittest

import lsm6dso


def word(x, y, z, tag=lsm6dso.TAG_ACCEL):
    return bytes([tag << 3]) + struct.pack('<hhh', x, y, z)


class FakeBus:
    def __init__(self, fifo=b'', who=0x6C):
        self.registers = {lsm6dso.WHO_AM_I: who}
        self.fifo = bytearray(fifo)
        self.writes = []

    def write_byte_data(self, address, register, value):
        self.writes.append((register, value))

    def read_i2c_block_data(self, address, register, length):
        if register == lsm6dso.FIFO_STATUS1:
            words = len(self.fifo) // 7
            return [words & 0xFF, (words >> 8) & 0x03]
        if register == lsm6dso.FIFO_DATA_OUT_TAG:
            out, self.fifo = self.fifo[:length], self.fifo[length:]
            return list(out)
        return [self.registers.get(register, 0)] * length


class Decoding(unittest.TestCase):
    def test_words_to_g_skipping_other_sensors(self):
        data = word(4096, -4096, 0) + word(1, 2, 3, tag=0x01) + word(0, 0, 4096)
        samples = lsm6dso.decode_words(data, 0.244e-3)
        self.assertEqual(len(samples), 2)
        self.assertAlmostEqual(samples[0][0], 0.999, places=3)
        self.assertAlmostEqual(samples[0][1], -0.999, places=3)
        self.assertAlmostEqual(samples[1][2], 0.999, places=3)

    def test_vibration_removes_gravity(self):
        block = lsm6dso.vibration([(0, 0, 1.0), (0, 0, 1.2), (0, 0, 0.8)])
        self.assertEqual(block, [0.0, 0.2, -0.2])
        self.assertEqual(lsm6dso.vibration([]), [])


class Sensor(unittest.TestCase):
    def test_setup_configures_fifo_and_rate(self):
        bus = FakeBus()
        lsm6dso.LSM6DSO(bus, rate=3333, full_scale=8).setup()
        self.assertEqual(
            bus.writes,
            [
                (lsm6dso.CTRL3_C, 0x01),
                (lsm6dso.CTRL3_C, 0x44),
                (lsm6dso.CTRL1_XL, 0x9C),
                (lsm6dso.FIFO_CTRL3, 0x09),
                (lsm6dso.FIFO_CTRL4, 0x06),
            ],
        )

    def test_refuses_another_chip(self):
        with self.assertRaises(RuntimeError):
            lsm6dso.LSM6DSO(FakeBus(who=0x69)).setup()

    def test_drains_word_by_word(self):
        bus = FakeBus(word(0, 0, 4096) * 3)
        samples, overrun = lsm6dso.LSM6DSO(bus, burst=False).drain()
        self.assertEqual(len(samples), 3)
        self.assertFalse(overrun)

    def test_run_posts_blocks(self):
        bus = FakeBus(b''.join(word(0, 0, 4096 + (i % 2) * 400) for i in range(100)))
        sent = []
        block = lsm6dso.run(
            lsm6dso.LSM6DSO(bus, burst=False),
            'http://localhost:8080/api/sensors',
            0.25,
            once=True,
            clock=lambda: 0.0,
            sleep=lambda s: None,
            send=lambda url, payload: sent.append((url, payload)),
        )
        self.assertEqual(len(block), 100)
        self.assertEqual(sent[0][1]['sampleRate'], 3333)
        self.assertAlmostEqual(sum(sent[0][1]['accel']), 0, places=3)


if __name__ == '__main__':
    unittest.main()
