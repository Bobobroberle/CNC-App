import { describe, expect, it } from 'vitest';
import {
  createSharedProfile,
  DEFAULT_MATERIALS,
  DEFAULT_TOOLS,
  mergeById,
  parseOffsets,
  parseSharedProfile,
  restoreCommand,
  validateSavedZero,
  wcsCode,
  wcsFromCode,
  type SavedZero,
} from '../src';

describe('zero memory', () => {
  const zero: SavedZero = {
    id: 'z1',
    name: 'Schraubstock links',
    wcs: 2,
    offset: { x: 100.12345, y: 200, z: -50.5 },
    createdAt: 1,
  };

  it('converts coordinate systems', () => {
    expect(wcsCode(1)).toBe('G54');
    expect(wcsCode(6)).toBe('G59');
    expect(wcsFromCode('g55')).toBe(2);
    expect(wcsFromCode('G53')).toBeNull();
  });

  it('builds the restore command', () => {
    expect(restoreCommand(zero)).toBe('G10 L2 P2 X100.123 Y200 Z-50.5');
  });

  it('parses $# output', () => {
    const t = parseOffsets([
      '[G54:1.000,2.000,3.000]',
      '[G55:-1.5,0,0]',
      '[G28:0.000,0.000,0.000]',
      '[G30:1,1,1]',
      '[G92:0,0,0.5]',
      '[TLO:2.500]',
      '[PRB:0.000,0.000,0.000:0]',
      '[G56:1,2]',
      '[G57:a,b,c]',
      '[G58:1,,2]',
      'ok',
    ]);
    expect(t).toEqual({
      wcs: { G54: { x: 1, y: 2, z: 3 }, G55: { x: -1.5, y: 0, z: 0 } },
      g28: { x: 0, y: 0, z: 0 },
      g30: { x: 1, y: 1, z: 1 },
      g92: { x: 0, y: 0, z: 0.5 },
      tlo: 2.5,
    });
  });

  it('validates stored zeros', () => {
    expect(validateSavedZero(zero)).toBe(zero);
    expect(validateSavedZero({ ...zero, photo: 'data:image/jpeg;base64,' })).not.toBeNull();
    const bad: unknown[] = [
      null,
      1,
      { ...zero, id: '' },
      { ...zero, id: 1 },
      { ...zero, name: '' },
      { ...zero, name: 2 },
      { ...zero, wcs: 0 },
      { ...zero, wcs: 7 },
      { ...zero, wcs: 1.5 },
      { ...zero, offset: null },
      { ...zero, offset: 5 },
      { ...zero, offset: { x: 1, y: 2 } },
      { ...zero, createdAt: 'x' },
      { ...zero, photo: 3 },
    ];
    for (const b of bad) expect(validateSavedZero(b)).toBeNull();
  });
});

describe('community profiles', () => {
  const machineOk = (v: unknown) => (typeof v === 'object' && v !== null ? (v as object) : null);
  const profile = createSharedProfile(
    {
      name: 'LowRider v4 Werkstatt',
      author: 'R.',
      machine: { travel: 1 },
      tools: DEFAULT_TOOLS,
      materials: DEFAULT_MATERIALS,
      macros: [{ name: 'Z hoch', gcode: 'G53 G0 Z0' }],
    },
    new Date('2026-01-02T03:04:05Z'),
  );
  const text = JSON.stringify(profile);

  it('round-trips', () => {
    expect(profile.createdAt).toBe('2026-01-02T03:04:05.000Z');
    expect(parseSharedProfile(text, machineOk)).toEqual({ profile });
    const withDescription = { ...profile, description: 'x' };
    expect(parseSharedProfile(JSON.stringify(withDescription), machineOk)).toEqual({
      profile: withDescription,
    });
  });

  it('keeps the own cutting values of a tool through sharing – and refuses broken ones', () => {
    const own = { rpm: 18000, feed: 1800, stepover: 0.4 };
    const tools = DEFAULT_TOOLS.map((t, i) => (i === 0 ? { ...t, cutting: own } : t));
    const shared = createSharedProfile(
      { name: 'x', machine: { travel: 1 }, tools, materials: DEFAULT_MATERIALS, macros: [] },
      new Date('2026-01-02T03:04:05Z'),
    );
    const back = parseSharedProfile(JSON.stringify(shared), machineOk);
    expect('profile' in back && back.profile.tools[0]!.cutting).toEqual(own);
    const broken = { ...shared, tools: [{ ...tools[0]!, cutting: { feed: -5 } }] };
    expect(parseSharedProfile(JSON.stringify(broken), machineOk)).toEqual({
      error: 'invalid-tool',
    });
  });

  it('fills in a missing date and drops odd fields', () => {
    const { createdAt: _c, ...rest } = profile;
    const r = parseSharedProfile(JSON.stringify({ ...rest, author: 5, extra: 1 }), machineOk);
    expect('profile' in r && r.profile.createdAt).toBe('');
    expect('profile' in r && 'author' in r.profile).toBe(false);
  });

  it('names what is wrong', () => {
    const variant = (patch: object) => JSON.stringify({ ...profile, ...patch });
    const cases: [string, string][] = [
      ['{', 'invalid-json'],
      ['null', 'wrong-format'],
      [variant({ format: 'x' }), 'wrong-format'],
      [variant({ version: 2 }), 'newer-version'],
      [variant({ version: '1' }), 'newer-version'],
      [variant({ name: ' ' }), 'missing-name'],
      [variant({ machine: null }), 'invalid-machine'],
      [variant({ tools: [{}] }), 'invalid-tool'],
      [variant({ tools: 'x' }), 'invalid-tool'],
      [variant({ materials: [{}] }), 'invalid-material'],
      [variant({ materials: 1 }), 'invalid-material'],
      [variant({ macros: [{ name: 'a' }] }), 'invalid-macro'],
      [variant({ macros: [null] }), 'invalid-macro'],
      [variant({ macros: {} }), 'invalid-macro'],
    ];
    for (const [input, error] of cases)
      expect(parseSharedProfile(input, machineOk)).toEqual({ error });
  });

  it('merges libraries by id', () => {
    const merged = mergeById(DEFAULT_TOOLS, [
      { ...DEFAULT_TOOLS[0]!, name: 'neu' },
      { ...DEFAULT_TOOLS[1]!, id: 't9' },
    ]);
    expect(merged.map((t) => [t.id, t.name])).toEqual([
      ['t1', 'neu'],
      ['t2', 'Kugelfräser 6 mm'],
      ['t3', 'Schaftfräser 6 mm'],
      ['t9', 'Kugelfräser 6 mm'],
    ]);
  });
});
