import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyHeightMap,
  checkClamps,
  checkCollisions,
  frameProgram,
  HeightField,
  HeightMap,
  interpret,
  probeGridPoints,
  resumeFrom,
  toolProfile,
  type CollisionSetup,
  type Fixture,
} from '../src';

const real = readFileSync(
  join(import.meta.dirname, 'golden', 'fusion360-1002-parallel-kugel.nc'),
  'utf8',
);

describe('resumeFrom', () => {
  const job =
    'G21 G90 G54\nT2 M6\nS18000 M3 M8\nG0 X0 Y0 Z5\nG1 Z-2 F300\nG1 X10 F1200\nG1 Y10\nG1 X0\nM30\n';

  it('restores modal state, spindle and position, then continues', () => {
    const r = resumeFrom(job, 6, { safeMachineZ: 0 });
    expect(r.text.split('\n')).toEqual([
      '(LowRider Control: resume at line 7)',
      'G21 G90 G91.1 G17 G94 G54',
      'T2',
      'S18000 M3',
      'M8',
      'G53 G0 Z0',
      'G0 X10 Y0',
      'G1 Z-2 F1200',
      'F1200',
      'G1 Y10',
      'G1 X0',
      'M30',
      '',
    ]);
    expect(r.startLine).toBe(6);
    expect(r.warnings).toEqual([]);
  });

  it('ends at the same place as the original program', () => {
    const r = resumeFrom(real, 3000, { safeMachineZ: 0, plungeFeed: 200 });
    expect(interpret(r.text).finalPosition).toEqual(interpret(real).finalPosition);
    expect(interpret(r.text).diagnostics.filter((d) => d.code !== 'tool-length-table')).toEqual([]);
    expect(r.text).toContain('F200');
  });

  it('handles inches, incremental mode, mist, G93 and offsets', () => {
    const inch = resumeFrom('G20 G91\nM4 S1000 M7\nG93 G1 X1 F2\nG92 X0\nG0 X1', 4, {
      safeMachineZ: -1,
    });
    const lines = inch.text.split('\n');
    expect(lines[1]).toBe('G20 G90 G91.1 G17 G94 G54');
    expect(lines).toContain('S1000 M4');
    expect(lines).toContain('M7');
    expect(lines).toContain('G1 Z0 F3.93701');
    expect(lines).toContain('G91 G93');
    expect(inch.warnings.map((w) => w.message)).toEqual([
      'G92/G10 before the resume line: offsets are not restored',
      'Inverse time feed (G93): plunge uses G94',
    ]);
    // no tool, spindle off, no feed yet
    const plain = resumeFrom('G0 X1\nG0 X2', 1, { safeMachineZ: 0 });
    expect(plain.text.split('\n').slice(2)).toEqual([
      'G53 G0 Z0',
      'G0 X1 Y0',
      'G1 Z0 F100',
      'G0 X2',
    ]);
  });

  it('rejects lines outside the program', () => {
    expect(() => resumeFrom('G0 X1', 3, { safeMachineZ: 0 })).toThrow(RangeError);
    // The first line after the end is outside, too (not a TypeError further in).
    expect(() => resumeFrom('G0 X1', 1, { safeMachineZ: 0 })).toThrow(RangeError);
    expect(() => resumeFrom('G0 X1', -1, { safeMachineZ: 0 })).toThrow(RangeError);
  });
});

describe('frameProgram', () => {
  it('traces the rectangle at a safe machine height', () => {
    expect(
      frameProgram({
        minX: -82.1,
        minY: -24.6,
        maxX: 82.1,
        maxY: 24.6,
        safeMachineZ: 0,
        feed: 3000,
      }),
    ).toEqual([
      '(LowRider Control: frame)',
      'G21 G90 G94',
      'G53 G0 Z0',
      'G0 X-82.1 Y-24.6',
      'G1 X82.1 F3000',
      'G1 Y24.6',
      'G1 X-82.1',
      'G1 Y-24.6',
    ]);
  });
});

describe('toolProfile', () => {
  it('describes flat, ball and V-bit cutters', () => {
    expect(toolProfile({ kind: 'flat', diameter: 6 }, 2)).toBe(0);
    expect(toolProfile({ kind: 'flat', diameter: 6 }, 4)).toBe(Infinity);
    expect(toolProfile({ kind: 'ball', diameter: 6 }, 3)).toBeCloseTo(3);
    expect(toolProfile({ kind: 'ball', diameter: 6 }, 0)).toBe(0);
    expect(toolProfile({ kind: 'vbit', diameter: 10, angle: 90 }, 2)).toBeCloseTo(2);
    expect(toolProfile({ kind: 'vbit', diameter: 10 }, 1)).toBeCloseTo(1);
  });
});

describe('HeightField', () => {
  const area = { minX: 0, minY: 0, maxX: 20, maxY: 10 };

  it('lowers cells along a cut and reports the removed volume', () => {
    const f = new HeightField(area, 0.5, 0);
    expect(f.cols).toBe(40);
    expect(f.rows).toBe(20);
    const { segments } = interpret('G0 X2 Y5 Z5\nG1 Z-1 F100\nG1 X18');
    f.cut(segments, { kind: 'flat', diameter: 4 });
    expect(f.heightAt(10, 5)).toBe(-1);
    expect(f.heightAt(10, 9.9)).toBe(0);
    expect(f.heightAt(-5, 5)).toBe(0);
    expect(f.removedVolume()).toBeCloseTo(16 * 4 * 1 + Math.PI * 4, -1);
    f.reset();
    expect(f.removedVolume()).toBe(0);
  });

  it('cuts only up to a point of the current segment', () => {
    const f = new HeightField(area, 0.5, 0);
    const { segments } = interpret('G0 X2 Y5\nG1 Z-1 F100\nG1 X18\nG1 Y9');
    f.cut(segments, { kind: 'ball', diameter: 2 }, 0, 2, 0.5);
    expect(f.heightAt(6, 5)).toBeLessThan(-0.8);
    expect(f.heightAt(16, 5)).toBe(0);
    f.cut(segments, { kind: 'ball', diameter: 2 }, -1, 99);
    expect(f.heightAt(18, 8)).toBeLessThan(-0.8);
  });

  it('skips machine moves and moves above the stock', () => {
    const f = new HeightField(area, 1, 0);
    const { segments } = interpret('G53 G0 X5 Y5 Z-5\nG53 G0 Z5\nG1 X15 F100');
    f.cut(segments, { kind: 'flat', diameter: 2 });
    f.stamp(10, 5, 1, { kind: 'flat', diameter: 2 });
    expect(f.removedVolume()).toBe(0);
  });

  it('chooses a resolution for a cell budget and rejects bad areas', () => {
    const f = HeightField.fitting(area, 0, 800);
    expect(f.resolution).toBeCloseTo(0.5);
    expect(HeightField.fitting(area, 0, 1e9).resolution).toBe(0.1);
    expect(f.cellCenter(0, 0)).toEqual([0.25, 0.25]);
    expect(() => new HeightField(area, 0, 0)).toThrow(RangeError);
    expect(() => new HeightField({ ...area, maxX: 0 }, 1, 0)).toThrow(RangeError);
    expect(() => new HeightField({ ...area, maxY: 0 }, 1, 0)).toThrow(RangeError);
    expect(new HeightField({ minX: 0, minY: 0, maxX: 0.1, maxY: 0.1 }, 1, 0).cols).toBe(1);
  });
});

describe('checkCollisions', () => {
  const setup: CollisionSetup = {
    stock: { min: { x: 0, y: 0, z: -18 }, max: { x: 100, y: 50, z: 0 } },
    fixtures: [
      { name: 'Spanner links', min: { x: -30, y: 10, z: -18 }, max: { x: -10, y: 40, z: 15 } },
    ],
    toolDiameter: 6,
    stickout: 20,
    holderDiameter: 30,
    gantry: { clearance: 30, depth: 120 },
  };

  it('accepts a job that stays clear', () => {
    const { segments } = interpret('G0 X10 Y10 Z5\nG1 Z-10 F300\nG1 X90');
    expect(checkCollisions(segments, setup)).toEqual([]);
  });

  it('finds holder in stock, tool and holder in clamps and the gantry', () => {
    const { segments } = interpret(
      [
        'G0 X10 Y10 Z5',
        'G1 Z-25 F300', // holder 5 mm deep in the stock, gantry 5 mm below the clamp top
        'G0 Z5',
        'G0 X-5 Y20', // tool passes 5 mm beside the clamp
        'G1 Z-10 F300', // holder (Ø30) reaches over the clamp below its top
        'G0 Z5',
        'G0 X-15 Y20', // tool right above the clamp, below its top
        'G53 G0 Z-90',
      ].join('\n'),
    );
    const hits = checkCollisions(segments, setup).map(
      (c) => `${c.kind}:${c.object}@${c.lineIndex}`,
    );
    expect(hits).toEqual([
      'holder-stock:stock@1',
      'gantry:Spanner links@1',
      'holder-fixture:Spanner links@4',
      'tool-fixture:Spanner links@6',
    ]);
  });

  it('only checks the gantry when configured and touches at the radius are fine', () => {
    const { gantry: _unused, ...noGantry } = setup;
    const { segments } = interpret('G0 X-7 Y20 Z10\nG0 X50 Y25 Z-1');
    expect(checkCollisions(segments, { ...noGantry, holderDiameter: 6 })).toEqual([]);
  });

  it('takes a round fixture as a circle, not as its box', () => {
    const screw = { name: 'Schraube', round: true, ...box(-20, 10, -10, 20, 5) };
    const tight = { ...setup, fixtures: [screw], gantry: undefined, toolDiameter: 0 };
    // Beside the circle but inside the corner of its box: clear. Over the circle: hit.
    const corner = interpret('G0 X-11 Y11 Z2').segments;
    expect(checkCollisions(corner, tight)).toEqual([]);
    const over = interpret('G0 X-15 Y15 Z2').segments;
    expect(checkCollisions(over, tight).map((c) => c.kind)).toContain('tool-fixture');
  });
});

/** A fixture box from X/Y ranges, reaching from far below up to `top`. */
function box(x1: number, y1: number, x2: number, y2: number, top: number) {
  return { min: { x: x1, y: y1, z: -1000 }, max: { x: x2, y: y2, z: top } };
}

describe('checkClamps', () => {
  const clamp: Fixture = { name: 'Zwinge 1', ...box(40, 10, 100, 50, 30) };
  const screw: Fixture = { name: 'Schraube 2', round: true, ...box(194, 24, 206, 36, 5) };
  const check = (code: string, fixtures: Fixture[] = [clamp, screw], toolDiameter = 6) =>
    checkClamps(interpret(code).segments, fixtures, { toolDiameter });

  it('accepts moves beside the clamps and high above them', () => {
    expect(
      check(
        [
          'G0 X0 Y0 Z40', // above everything
          'G0 X150 Y30', // over the clamp at Z40: 10 mm to spare
          'G1 Z-3 F300', // plunge between clamp and screw
          'G1 Y0', // cut beside both
          'G1 X36.9 Y0', // 3.1 mm beside the clamp: clear with a 3 mm radius
          'G1 X36.9 Y60',
          'G53 G0 Z-5', // machine moves are not checked
          'G0 Z8', // still beside the clamp
          'G0 X150 Y60', // past it, 7 mm behind its back edge
          'G0 X200 Y30', // over the screw at Z8: 3 mm to spare
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  it('names the clamp a cut runs through, with every move in it', () => {
    const hits = check('G0 X0 Y30 Z5\nG1 Z-2 F300\nG1 X20\nG1 X120\nG1 X150\nG0 Z40');
    expect(hits).toEqual([
      {
        fixture: 0,
        name: 'Zwinge 1',
        kind: 'cut',
        segments: [3],
        lineIndex: 3,
        clearance: -32,
      },
    ]);
  });

  it('counts the tool radius: a cut passing close beside a clamp is in it', () => {
    // 2 mm beside the box with a 3 mm radius; along its front edge and past its corner.
    expect(check('G0 X0 Y8 Z-1\nG1 X150 F300').map((h) => h.kind)).toEqual(['cut']);
    expect(check('G0 X38 Y0 Z-1\nG1 Y60 F300').map((h) => h.kind)).toEqual(['cut']);
    // Diagonally past a corner: inside the corner circle only.
    expect(check('G0 X35 Y10 Z-1\nG1 X40 Y5 F300')).toEqual([]);
    expect(check('G0 X36 Y10 Z-1\nG1 X40 Y6 F300').map((h) => h.kind)).toEqual(['cut']);
    // A tool without a diameter only counts where its tip is.
    expect(check('G0 X38 Y0 Z-1\nG1 Y60 F300', [clamp], 0)).toEqual([]);
    expect(check('G0 X40 Y0 Z-1\nG1 Y60 F300', [clamp], 0).length).toBe(1);
  });

  it('tells a rapid into a clamp from a move that only passes too low', () => {
    const hits = check(
      [
        'G0 X0 Y30 Z31', // 1 mm above the clamp top
        'G0 X150', // passes over the clamp: too low
        'G0 Z6',
        'G0 X250', // over the screw (top 5) at Z6: too low
        'G0 Z3',
        'G0 X150', // back through the screw: a rapid into it
      ].join('\n'),
    );
    expect(hits.map((h) => [h.name, h.kind, h.segments, h.lineIndex])).toEqual([
      ['Zwinge 1', 'low', [1], 1],
      ['Schraube 2', 'rapid', [3, 5], 5],
    ]);
    expect(hits[0]!.clearance).toBeCloseTo(1);
    expect(hits[1]!.clearance).toBeCloseTo(-2);
  });

  it('keeps the worst kind and its line when a milder one follows', () => {
    const hits = check('G0 X0 Y30 Z1\nG1 X150 F300\nG0 Z31\nG0 X0');
    expect(hits.map((h) => [h.kind, h.segments, h.lineIndex])).toEqual([['cut', [1, 3], 1]]);
  });

  it('follows a move in Z: only the part over the clamp counts', () => {
    // Ramps down from Z40 to Z0 while crossing: over the clamp it is between Z29.3 and Z13.3.
    const ramp = check('G0 X0 Y30 Z40\nG1 X150 Z0 F300', [clamp]);
    expect(ramp[0]!.kind).toBe('cut');
    expect(ramp[0]!.clearance).toBeCloseTo(40 - (103 / 150) * 40 - 30, 3);
    // A plunge over the clamp, and one beside it.
    expect(check('G0 X70 Y30 Z40\nG1 Z20 F300', [clamp]).map((h) => h.kind)).toEqual(['cut']);
    expect(check('G0 X0 Y30 Z40\nG1 Z-5 F300', [clamp])).toEqual([]);
  });

  it('checks arcs along their curve and round fixtures as circles', () => {
    // A half circle from X50 to X90 in front of the clamp, bulging into it (up to Y20).
    const through = check('G0 X50 Y0 Z-1\nG2 X90 Y0 I20 J0 F300', [clamp]);
    expect(through.map((h) => h.kind)).toEqual(['cut']);
    // The same arc bulging away from it.
    expect(check('G0 X50 Y0 Z-1\nG3 X90 Y0 I20 J0 F300', [clamp])).toEqual([]);
    // An arc high above the clamp is looked at and found clear.
    expect(check('G0 X50 Y0 Z40\nG2 X90 Y0 I20 J0 F300', [clamp])).toEqual([]);
    // The screw is a circle of radius 6: its box corner is free, its rim is not.
    expect(check('G0 X194 Y24 Z0\nG1 X190 Y28 F300', [screw], 0)).toEqual([]);
    expect(check('G0 X190 Y30 Z0\nG1 X197 F300', [screw], 0).map((h) => h.kind)).toEqual(['cut']);
    // Standing on it.
    expect(check('G0 X200 Y30 Z10\nG1 Z4 F300', [screw], 0).map((h) => h.kind)).toEqual(['cut']);
    expect(check('G0 X220 Y30 Z10\nG1 Z4 F300', [screw], 0)).toEqual([]);
  });
});

describe('autolevel', () => {
  const grid = { minX: 0, minY: 0, maxX: 10, maxY: 10, cols: 2, rows: 2 };

  it('lists probe points in serpentine order', () => {
    expect(probeGridPoints({ ...grid, cols: 3 }).map((p) => [p.x, p.y])).toEqual([
      [0, 0],
      [5, 0],
      [10, 0],
      [10, 10],
      [5, 10],
      [0, 10],
    ]);
    expect(() => probeGridPoints({ ...grid, cols: 1 })).toThrow(RangeError);
  });

  it('interpolates bilinearly and clamps outside', () => {
    const map = new HeightMap(grid, [0, 1, 2, 3]);
    expect(map.at(5, 5)).toBeCloseTo(1.5);
    expect(map.at(10, 0)).toBe(1);
    expect(map.at(-5, 20)).toBe(2);
    expect(map.range()).toBe(3);
    expect(() => new HeightMap(grid, [0])).toThrow(RangeError);
  });

  it('splits moves and follows the surface', () => {
    const map = new HeightMap(grid, [0, 1, 0, 1]);
    const r = applyHeightMap('G21\nG0 X0 Y0 Z1 (start)\nG1 Z-1 F100\nG1 X10\nM5\n', map, 5);
    expect(r.text).toBe(
      [
        'G21',
        'G90 G0 X0 Y0 Z1 (start)',
        'G90 G1 X0 Y0 Z-1 F100',
        'G90 G1 X5 Y0 Z-0.5 F100',
        'G90 G1 X10 Y0 Z0',
        'M5',
        '',
      ].join('\n'),
    );
    expect(r.warnings).toEqual([]);
  });

  it('linearises arcs, keeps modal words, converts inches and A', () => {
    const map = new HeightMap(grid, [0, 0, 0, 0]);
    const arc = applyHeightMap('G0 X10 Y5\nG54 G3 X0 Y5 I-5 J0 F100 M3', map).text.split('\n');
    expect(arc.length).toBe(1 + 8);
    expect(arc[1]).toContain('G54');
    expect(arc[1]).toContain('M3');
    const inch = applyHeightMap('G20 G1 X1 F10\nG1 X2\nG21 G1 X3', map, 100).text.split('\n');
    expect(inch[0]).toMatch(/^G90 G1 X1 Y0 Z0 F10/);
    expect(inch.at(-1)).toMatch(/X3 Y0 Z0/);
    expect(applyHeightMap('G1 X1 A90 F100', map).text).toContain('A90');
    expect(applyHeightMap('G0 X1 ;note', map).text).toBe('G90 G0 X1 Y0 Z0 ;note');
  });

  it('leaves machine moves, offsets and inverse time alone', () => {
    const map = new HeightMap(grid, [1, 1, 1, 1]);
    const r = applyHeightMap('G53 G0 Z0\nG92 X0\nG93 G1 X5 F2\nG94\nG1 X1 (open', map);
    expect(r.text.split('\n').slice(0, 3)).toEqual(['G53 G0 Z0', 'G92 X0', 'G93 G1 X5 F2']);
    expect(r.warnings.map((w) => w.lineIndex)).toEqual([1, 2]);
  });
});
