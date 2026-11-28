import { analyzeProgram } from '@lowrider/gcode-core';
import { describe, expect, it } from 'vitest';
import { operationAt, operationsOf } from '../src/lib/operations';
import { PREVIEW_BOX, previewPath } from '../src/lib/preview';
import { pendingWarnings, startWarnings, type StartInput } from '../src/lib/startChecks';
import { clampOverride, OVERRIDE_RANGE } from '../src/components/Override';
import { useRun } from '../src/store/run';
import { sizeOf, validRecent, withZero, ZERO_HISTORY, type UsedZero } from '../src/store/recent';
import { Simulator } from '../src/sim/simulator';

const FUSION = `(1001)
(T1 D=6 - flat end mill)
G90 G94
G21
(2D Contour1)
T1 M6
S18000 M3
G0 X0 Y0
G0 Z5
G1 Z-2 F300
G1 X50 F900
G0 Z5
(2D Pocket1)
G0 X10 Y10
G1 Z-1 F300
G1 X20
G0 Z5
(Drill1)
T2 M6
G0 X30 Y30
G1 Z-3 F200
G0 Z5
M5
M30`;

describe('the operations of a program', () => {
  const lines = FUSION.split('\n');
  const { segments } = analyzeProgram(FUSION);
  const operations = operationsOf(lines, segments);

  it('takes the comment right before the moves as the name, with the tool that cuts', () => {
    expect(operations.map((o) => o.name)).toEqual(['2D Contour1', '2D Pocket1', 'Drill1']);
    expect(operations.map((o) => o.tool)).toEqual([1, 1, 2]);
    expect(lines[operations[1]!.lineIndex]).toBe('G0 X10 Y10');
  });

  it('says which operation a line belongs to', () => {
    expect(operationAt(operations, null)).toBeNull();
    expect(operationAt(operations, 0)).toBeNull();
    expect(operationAt(operations, 10)).toMatchObject({ n: 1 });
    expect(operationAt(operations, 15)?.operation.name).toBe('2D Pocket1');
    expect(operationAt(operations, 99)).toMatchObject({ n: 3 });
  });

  it('has only its tools when the program names nothing', () => {
    const text = 'G90 G21\nT1 M6\nG0 X0 Y0\nG1 X5 F100\nT2 M6\nG1 X9\n';
    const plain = operationsOf(text.split('\n'), analyzeProgram(text).segments);
    expect(plain.map((o) => [o.name, o.tool])).toEqual([
      ['', 1],
      ['', 2],
    ]);
  });

  it('does not take a comment at every move for operations', () => {
    const text = Array.from({ length: 60 }, (_, i) => `(move ${i})\nG1 X${i + 1} F100`).join('\n');
    const many = operationsOf(text.split('\n'), analyzeProgram(text).segments);
    expect(many).toHaveLength(1);
    expect(many[0]!.name).toBe('');
  });

  it('names a tool change inside a named program too, and reads ; comments', () => {
    const text = '; Outline\nT1 M6\nG1 X5 F100\nT2 M6\nG1 X9\n';
    const ops = operationsOf(text.split('\n'), analyzeProgram(text).segments);
    expect(ops.map((o) => [o.name, o.tool])).toEqual([
      ['Outline', 1],
      ['', 2],
    ]);
  });
});

describe('what a start asks to confirm (§6.4)', () => {
  const SAFE: StartInput = {
    zeroAtOrigin: false,
    machineZ: 80,
    safeMachineZ: 80,
    homed: true,
    firstMove: { xy: 100, machine: false },
    spindleOn: true,
    probeTool: false,
  };

  it('asks nothing when all is as it should be', () => {
    expect(startWarnings(SAFE)).toEqual([]);
  });

  it('asks about a zero at the machine origin', () => {
    expect(startWarnings({ ...SAFE, zeroAtOrigin: true })).toEqual(['zero']);
  });

  it('asks about a low tool only when the program travels before it lifts', () => {
    expect(startWarnings({ ...SAFE, machineZ: 30 })).toEqual(['lowZ']);
    expect(startWarnings({ ...SAFE, machineZ: 79.8 })).toEqual([]);
    expect(startWarnings({ ...SAFE, machineZ: 30, firstMove: { xy: 0, machine: false } })).toEqual(
      [],
    );
    expect(startWarnings({ ...SAFE, machineZ: 30, firstMove: null })).toEqual([]);
    // Without homing the machine height means nothing.
    expect(startWarnings({ ...SAFE, machineZ: 30, homed: false })).toEqual([]);
    expect(startWarnings({ ...SAFE, machineZ: null })).toEqual([]);
  });

  it('asks about a probe only when the spindle would turn', () => {
    expect(startWarnings({ ...SAFE, probeTool: true })).toEqual(['probe']);
    expect(startWarnings({ ...SAFE, probeTool: true, spindleOn: false })).toEqual([]);
  });

  it('remembers a confirmation – but never the one for a probe', () => {
    expect(pendingWarnings(['zero', 'lowZ', 'probe'], [])).toEqual(['zero', 'lowZ', 'probe']);
    expect(pendingWarnings(['zero', 'lowZ', 'probe'], ['zero', 'lowZ', 'probe'])).toEqual([
      'probe',
    ]);
    expect(pendingWarnings(['zero'], ['zero'])).toEqual([]);
  });

  it('asks after a tool change – every time: a new cutter is a new length', () => {
    expect(startWarnings({ ...SAFE, toolChanged: true })).toEqual(['toolChange']);
    expect(startWarnings({ ...SAFE, toolChanged: false })).toEqual([]);
    // (a start that follows no change – the first part, or a part with the tool before it – is as ever)
    expect(startWarnings(SAFE)).toEqual([]);
    expect(pendingWarnings(['toolChange'], ['toolChange'])).toEqual(['toolChange']);
    expect(pendingWarnings(['zero', 'toolChange'], ['zero', 'toolChange'])).toEqual(['toolChange']);
  });
});

describe('overrides', () => {
  it('stay between 50 and 150 %', () => {
    expect(OVERRIDE_RANGE).toEqual({ min: 50, max: 150 });
    expect(clampOverride(40)).toBe(50);
    expect(clampOverride(160)).toBe(150);
    expect(clampOverride(99.6)).toBe(100);
  });

  it('are taken by the simulator: slower feed, reported in the status, back to 100 %', () => {
    const sim = new Simulator();
    sim.realtime(0x92);
    sim.realtime(0x94);
    sim.realtime(0x9a);
    expect(sim.status()).toContain('|Ov:89,100,110');
    sim.realtime(0x90);
    sim.realtime(0x99);
    expect(sim.status()).toContain('|Ov:100,100,100');
    for (let i = 0; i < 30; i++) sim.realtime(0x92);
    expect(sim.overrides.feed).toBe(10);
    // A soft reset puts them back.
    sim.realtime(0x18);
    expect(sim.overrides).toEqual({ feed: 100, spindle: 100 });
  });
});

describe('the small picture of a job', () => {
  it('draws the cutting moves into the box, y turned over, rapids left out', () => {
    const { segments } = analyzeProgram('G90 G21\nG0 X0 Y0\nG1 X100 F500\nG1 Y50\nG0 X0 Y0\n');
    const d = previewPath(segments);
    expect(d).toBe('M4 73L96 73L96 27');
    for (const n of d.match(/[\d.]+/g)!) {
      expect(Number(n)).toBeGreaterThanOrEqual(0);
      expect(Number(n)).toBeLessThanOrEqual(PREVIEW_BOX);
    }
  });

  it('is empty for a program that cuts nothing, and short for a long one', () => {
    expect(previewPath(analyzeProgram('G0 X5 Y5\n').segments)).toBe('');
    const long = Array.from(
      { length: 5000 },
      (_, i) => `G1 X${(i % 100) + 1} Y${Math.floor(i / 100)} F500`,
    ).join('\n');
    const d = previewPath(analyzeProgram(long).segments);
    expect(d.split('L').length).toBeLessThan(700);
  });
});

describe('recently used jobs', () => {
  const zero = (x: number, at = 1): UsedZero => ({ wcs: 'G54', x, y: 0, z: 0, at });

  it('keeps the last five zeros, the newest first, none twice', () => {
    let zeros: UsedZero[] = [];
    for (let i = 0; i < 7; i++) zeros = withZero(zeros, zero(i, i));
    expect(zeros).toHaveLength(ZERO_HISTORY);
    expect(zeros[0]!.x).toBe(6);
    zeros = withZero(zeros, zero(4, 99));
    expect(zeros).toHaveLength(ZERO_HISTORY);
    expect(zeros[0]).toMatchObject({ x: 4, at: 99 });
  });

  it('reads only what is whole from the storage', () => {
    expect(validRecent('x')).toBeNull();
    const list = validRecent([
      { name: 'a.nc', seconds: 10, usedAt: 1, size: { x: 1, y: 2, z: 3 }, zeros: [zero(1), 5] },
      { name: '', seconds: 10, usedAt: 1 },
      { name: 'b.nc', seconds: 'x', usedAt: 1 },
      { name: 'c.nc', seconds: 1, usedAt: 2, text: 'G0', preview: 'M0 0' },
    ])!;
    expect(list.map((j) => j.name)).toEqual(['a.nc', 'c.nc']);
    expect(list[0]!.zeros).toHaveLength(1);
    expect(list[0]!.text).toBeUndefined();
    expect(list[1]).toMatchObject({ text: 'G0', preview: 'M0 0', size: null });
  });

  it('gives the size of what a job cuts', () => {
    const { cutBounds } = analyzeProgram('G0 Z5\nG1 Z-3 F100\nG1 X40 Y20\n');
    expect(sizeOf(cutBounds)).toEqual({ x: 40, y: 20, z: 3 });
    expect(sizeOf(analyzeProgram('').cutBounds)).toBeNull();
  });
});

describe('the tool the spindle holds (useRun.lastTool)', () => {
  it('is nothing before a first start, and kept by "Nächstes Teil" and by "Job abbrechen": it is the spindle’s, not the run’s', () => {
    // (the cases that start parts and ask the question are in startHook.test.ts)
    expect(useRun.getState().lastTool).toBeNull();
    const held = { key: 'a.nc:9', tool: 2 };
    useRun.setState({ lastTool: held, phase: 'done', partIndex: 0 });
    useRun.getState().nextPiece();
    expect(useRun.getState().lastTool).toBe(held);
    expect(useRun.getState().phase).toBe('idle');
    useRun.getState().reset();
    expect(useRun.getState().lastTool).toBe(held);
    useRun.setState({ lastTool: null });
  });
});
