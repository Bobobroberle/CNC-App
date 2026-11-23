import { describe, expect, it } from 'vitest';
import {
  CharacterCountingStreamer,
  DEFAULT_PARSER_STATE,
  flashLayout,
  groupSettings,
  isRiskySetting,
  isToolChange,
  parseParserState,
  parseSettingLine,
  parseSettingsList,
  prepareProgram,
  releaseVersion,
  selectImages,
  wcsIndex,
  type StreamLine,
} from '../src';

describe('stream breakpoints', () => {
  const setup = (lines: string[]) => {
    const sent: string[] = [];
    const holds: StreamLine[] = [];
    const states: string[] = [];
    const s = new CharacterCountingStreamer(prepareProgram(lines), {
      send: (t) => sent.push(t),
      breakAt: isToolChange,
    });
    s.on('hold', (l) => holds.push(l));
    s.on('done', (p) => states.push(p.state));
    return { s, sent, holds, states };
  };

  it('recognises tool changes', () => {
    const line = (text: string) => ({ sourceIndex: 0, text });
    expect(isToolChange(line('T2M6'))).toBe(true);
    expect(isToolChange(line('M06T1'))).toBe(true);
    expect(isToolChange(line('M6'))).toBe(true);
    expect(isToolChange(line('M61'))).toBe(false);
    expect(isToolChange(line('G1X10M60'))).toBe(false);
    expect(isToolChange(line('G1X1.M6'))).toBe(true);
    expect(isToolChange(line('X1.6'))).toBe(false);
    expect(isToolChange(line('$H'))).toBe(false);
  });

  it('holds before a tool change until released', () => {
    const { s, sent, holds, states } = setup(['G0 X1', 'T2 M6', 'G0 X2']);
    s.start();
    expect(sent).toEqual(['G0X1']);
    expect(holds).toEqual([]);
    s.acknowledge();
    expect(s.progress.state).toBe('held');
    expect(holds).toEqual([{ sourceIndex: 1, text: 'T2M6' }]);
    expect(s.heldAt).toEqual({ sourceIndex: 1, text: 'T2M6' });
    s.pause();
    expect(s.progress.state).toBe('held');
    s.release();
    expect(sent).toEqual(['G0X1', 'T2M6', 'G0X2']);
    expect(s.heldAt).toBeNull();
    s.release();
    s.acknowledge();
    s.acknowledge();
    expect(states).toEqual(['done']);
  });

  it('holds at a breakpoint on the first line and the last line', () => {
    const { s, sent, holds, states } = setup(['M6', 'G0 X1', 'M6']);
    s.start();
    expect(sent).toEqual([]);
    expect(holds.length).toBe(1);
    s.release();
    s.acknowledge();
    s.acknowledge();
    expect(holds.length).toBe(2);
    s.release();
    expect(sent).toEqual(['M6', 'G0X1', 'M6']);
    s.acknowledge();
    expect(states).toEqual(['done']);
  });

  it('can be aborted while held', () => {
    const { s } = setup(['M6']);
    s.start();
    s.abort();
    expect(s.progress.state).toBe('aborted');
  });
});

describe('parser state', () => {
  it('parses $G words', () => {
    expect(parseParserState('G0 G54 G17 G21 G90 G94 M5 M9 T0 F0 S0'.split(' '))).toEqual(
      DEFAULT_PARSER_STATE,
    );
    expect(
      parseParserState('G1 G55 G18 G20 G91 G93 M3 M8 M7 T2 F1200 S18000 X'.split(' ')),
    ).toEqual({
      motion: 'G1',
      wcs: 'G55',
      plane: 'G18',
      units: 'inch',
      distance: 'incremental',
      feedMode: 'inverseTime',
      spindle: 'cw',
      flood: true,
      mist: true,
      tool: 2,
      feed: 1200,
      speed: 18000,
    });
    expect(parseParserState(['G38.2', 'M4', 'G19', 'M7', 'M9', 'Fx'])).toMatchObject({
      motion: 'G38.2',
      spindle: 'ccw',
      plane: 'G19',
      mist: false,
      feed: 0,
    });
  });

  it('maps coordinate systems to P numbers', () => {
    expect(wcsIndex('G54')).toBe(1);
    expect(wcsIndex('G59')).toBe(6);
  });
});

describe('settings', () => {
  it('parses setting lines with groups', () => {
    expect(parseSettingLine('$/axes/x/max_rate_mm_per_min=9000')).toEqual({
      key: '/axes/x/max_rate_mm_per_min',
      value: '9000',
      group: 'axes/x',
    });
    expect(parseSettingLine('$Sta/SSID=Werkstatt ')).toEqual({
      key: 'Sta/SSID',
      value: 'Werkstatt',
      group: 'Sta',
    });
    expect(parseSettingLine('$/name=LowRider')?.group).toBe('name');
    expect(parseSettingLine('$/=x')?.group).toBe('/');
    expect(parseSettingLine('ok')).toBeNull();
  });

  it('groups a list in order', () => {
    const list = parseSettingsList(['$Sta/SSID=a', 'ok', '$Hostname=fluidnc', '$Sta/IPMode=DHCP']);
    expect([...groupSettings(list).entries()].map(([g, e]) => [g, e.length])).toEqual([
      ['Sta', 2],
      ['Hostname', 1],
    ]);
  });

  it('flags settings that can lock you out', () => {
    expect(isRiskySetting('Sta/Password')).toBe(true);
    expect(isRiskySetting('WiFi/Mode')).toBe(true);
    expect(isRiskySetting('/axes/x/max_rate_mm_per_min')).toBe(false);
  });
});

describe('firmware flash layout', () => {
  it('lists the images without littlefs', () => {
    expect(flashLayout().map((i) => [i.file, i.address])).toEqual([
      ['wifi/bootloader.bin', 0x1000],
      ['wifi/partitions.bin', 0x8000],
      ['common/boot_app0.bin', 0xe000],
      ['wifi/firmware.bin', 0x10000],
    ]);
    expect(flashLayout('bt')[0]!.file).toBe('bt/bootloader.bin');
  });

  it('finds the images in a release zip', () => {
    const names = [
      'fluidnc-v3.9.5-posix/wifi/bootloader.bin',
      'fluidnc-v3.9.5-posix/wifi/partitions.bin',
      'fluidnc-v3.9.5-posix/common/boot_app0.bin',
      'fluidnc-v3.9.5-posix/wifi/firmware.bin',
      'fluidnc-v3.9.5-posix/wifi/littlefs.bin',
    ];
    const r = selectImages(names);
    expect('images' in r && r.images.map((i) => i.name)).toEqual(names.slice(0, 4));
    expect(selectImages(['wifi/firmware.bin'], 'wifi')).toEqual({
      missing: ['wifi/bootloader.bin', 'wifi/partitions.bin', 'common/boot_app0.bin'],
    });
  });

  it('reads the version from the zip name', () => {
    expect(releaseVersion('fluidnc-v3.9.5-posix.zip')).toBe('v3.9.5');
    expect(releaseVersion('fluidnc-v3.9.5-win64.zip')).toBe('v3.9.5');
    expect(releaseVersion('fluidnc-v4.0.0-rc1.zip')).toBe('v4.0.0-rc1');
    expect(releaseVersion('firmware.zip')).toBeNull();
  });
});

describe('synchronous transports', () => {
  it('counts a line before an immediate answer arrives', () => {
    const sent: string[] = [];
    let s: CharacterCountingStreamer;
    const done: string[] = [];
    s = new CharacterCountingStreamer(prepareProgram(['G0 X1', 'G0 X2', 'M6', 'G0 X3']), {
      send: (t) => {
        sent.push(t);
        s.acknowledge();
      },
      breakAt: isToolChange,
    });
    s.on('done', (p) => done.push(p.state));
    s.start();
    expect(sent).toEqual(['G0X1', 'G0X2']);
    expect(s.progress.state).toBe('held');
    s.release();
    expect(sent).toEqual(['G0X1', 'G0X2', 'M6', 'G0X3']);
    expect(done).toEqual(['done']);
  });
});
