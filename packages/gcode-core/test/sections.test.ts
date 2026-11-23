import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  closestPoint,
  interpret,
  planSections,
  pointAt,
  removeToolLengthTable,
  splitSections,
  type SectionOptions,
  type SectionPlan,
  type SectionProgram,
  type Segment,
  type Vec4,
} from '../src';

const golden = (name: string) => readFileSync(join(import.meta.dirname, 'golden', name), 'utf8');

function plan(text: string, o: SectionOptions): SectionPlan {
  const p = planSections(text, o);
  if ('problem' in p) throw new Error(`no plan: ${JSON.stringify(p)}`);
  return p;
}

function split(text: string, p: SectionPlan, touch?: number): SectionProgram[] {
  const out = splitSections(text, p, { touch });
  if ('problem' in out) throw new Error(`no sections: ${JSON.stringify(out)}`);
  return out;
}

const body = (s: SectionProgram) => s.text.split('\n').slice(1);

const cutting = (text: string) =>
  interpret(text).segments.filter((s) => s.motion !== 'rapid' && !s.machineCoordinates);

/** Points along a move, about every half millimetre. */
function along(s: Segment): Vec4[] {
  const n = Math.max(1, Math.ceil(s.length / 0.5));
  return Array.from({ length: n + 1 }, (_, i) => pointAt(s, i / n));
}

const xyz = (a: Vec4, b: Vec4) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Whether a cutting move of `segments` passes through `p` at `feed`. */
const covers = (segments: readonly Segment[], p: Vec4, feed: number) =>
  segments.some((s) => {
    if (Math.abs(s.feed - feed) > 1e-6) return false;
    if (!s.arc) return closestPoint(s, p, 'xyz').distance < 2e-3;
    const c = closestPoint(s, p, 'xy');
    return c.distance < 2e-3 && Math.abs(c.point.z - p.z) < 2e-3;
  });

/**
 * What must hold for any program cut in sections: every cutting move of the
 * original is cut by exactly one section – by two only within the overlap at
 * a seam – at the same depth and feed; a section cuts nowhere else, except
 * straight down onto the original path when it enters at a seam (at the
 * plunge feed); nothing is cut outside the section's window; and below the
 * program's highest Z a section moves at rapid only where the original does.
 */
function expectSound(text: string, p: SectionPlan, sections: SectionProgram[]) {
  const original = cutting(text);
  const all = interpret(text).segments;
  const safeZ = Math.max(...all.filter((s) => !s.machineCoordinates).map((s) => s.to.z));
  const parts = sections.map((s) => cutting(s.text));
  const slowest = Math.min(...original.map((s) => s.feed));
  const inBand = (v: number) =>
    p.seams.some((seam) => v > seam.at - p.overlap - 0.01 && v < seam.at + 0.01);

  for (const s of original) {
    for (const point of along(s)) {
      const by = parts.filter((part) => covers(part, point, s.feed)).length;
      if (by !== 1 && !(by === 2 && inBand(point[p.axis]))) {
        throw new Error(`cut ${by} times: ${JSON.stringify(point)} (line ${s.lineIndex + 1})`);
      }
    }
  }
  parts.forEach((part, k) => {
    const w = p.windows[k]!;
    for (const s of part) {
      for (const point of along(s)) {
        expect(point[p.axis]).toBeGreaterThanOrEqual(w.min - 1e-3);
        expect(point[p.axis]).toBeLessThanOrEqual(w.max + 1e-3);
        if (covers(original, point, s.feed)) continue;
        // An entry: straight above a place the original cuts at least as deep, and slow.
        const below = original
          .map((o) => closestPoint(o, point, 'xy'))
          .filter((c) => c.distance < 2e-3)
          .map((c) => c.point.z);
        if (below.length === 0 || Math.min(...below) > point.z + 2e-3 || s.feed > slowest + 1e-6) {
          throw new Error(`section ${k + 1} cuts beside the job: ${JSON.stringify(point)}`);
        }
      }
    }
    const moves = interpret(sections[k]!.text).segments;
    for (const [i, s] of moves.entries()) {
      if (s.motion !== 'rapid' || s.machineCoordinates) continue;
      const low = i === 0 ? s.to.z : Math.min(s.from.z, s.to.z);
      // Up to the travel height on the spot is always the section's right.
      const lift = s.to.z > safeZ - 1e-6 && Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y) < 1e-9;
      if (low > safeZ - 1e-6 || lift) continue;
      const same = all.some(
        (o) =>
          o.motion === 'rapid' && xyz(o.to, s.to) < 1e-3 && (i === 0 || xyz(o.from, s.from) < 1e-3),
      );
      if (!same)
        throw new Error(`section ${k + 1}: rapid below the travel height, line ${s.lineIndex + 1}`);
    }
  });
}

/** A frame 280 × 50, a drilled hole inside its left half and a circle in its right half. */
const FRAME = [
  'G21 G90',
  'G0 Z5',
  'M3 S18000',
  'G0 X10 Y10',
  'G1 Z-2 F300',
  'G1 X290 F1200',
  'G1 Y60',
  'G1 X10',
  'G1 Y10',
  'G0 Z5',
  'G0 X40 Y35',
  'G1 Z-3 F300',
  'G0 Z5',
  'G0 X250 Y35',
  'G1 Z-1 F300',
  'G2 X250 Y35 I-20 J0 F900',
  'G0 Z5',
  'M5',
  'M30',
  '',
].join('\n');

const FRAME_OPTIONS: SectionOptions = {
  axis: 'x',
  reach: { min: 0, max: 200 },
  zone: 60,
  tolerance: 10,
  touch: 3,
};

describe('planSections', () => {
  it('needs as few sections as the travel allows, slid by a round amount', () => {
    // 290 to cut, 200 in reach: 100 more (90 and the 10 the hand may be off). One slide of at
    // most 200 − 60 − 10 = 130 does it: 100. The second window is counted 10 short at each end.
    expect(plan(FRAME, FRAME_OPTIONS)).toEqual({
      axis: 'x',
      windows: [
        { min: 0, max: 200 },
        { min: 110, max: 290 },
      ],
      shifts: [0, 100],
      // Both reach 111 … 200 (the later one starts 1 before the seam): the middle, 155.5 → 156.
      // The frame is the only thing too long for one section; its two long sides are divided.
      seams: [{ at: 156, cuts: 2 }],
      overlap: 1,
    });
    // Three sections: 690 to cut. 500 more over slides of at most 130 → 4 slides of 130
    // (125 rounded up to 130).
    const long = FRAME.replace('G1 X290 F1200', 'G1 X690 F1200');
    const p = plan(long, FRAME_OPTIONS);
    expect(p.shifts).toEqual([0, 130, 260, 390, 520]);
    expect(p.windows[4]).toEqual({ min: 530, max: 710 });
    // A slide that would not be round is cut down to what the travel allows.
    const odd = plan(long, { ...FRAME_OPTIONS, zone: 63 });
    expect(odd.shifts[1]).toBe(127);
  });

  it('puts a seam where it divides least, and reports how much that is', () => {
    // One cut that runs the whole length and comes back twice as far as X 130: right of 130
    // a seam divides it three times, left of it once.
    const comb = [
      'G21 G90',
      'G0 Z5',
      'G0 X10 Y10',
      'G1 Z-1 F300',
      'G1 X290 F1200',
      'G1 Y14',
      'G1 X130',
      'G1 Y18',
      'G1 X290',
      'G0 Z5',
      'M30',
    ].join('\n');
    const p = plan(comb, FRAME_OPTIONS);
    // From the middle (156) outwards. At 130 itself the turn would lie in the millimetre
    // both sections cut: 129 is the first place with one cut only.
    expect(p.seams).toEqual([{ at: 129, cuts: 1 }]);
    const parts = split(comb, p);
    expect(body(parts[0]!).slice(4, 7)).toEqual(['F1200', 'G1 X129 Y10 Z-1 F1200', 'G0 Z5']);
    expect(body(parts[1]!).slice(4)).toEqual([
      'G0 X128 Y10',
      'G1 Z-1 F300',
      'G1 X290 Y10 Z-1 F1200',
      'G1 Y14',
      'G1 X130',
      'G1 Y18',
      'G1 X290',
      'G0 Z5',
      'M30',
    ]);
    expectSound(comb, p, parts);
    // The turn just beyond what the first section reaches (200): a seam at 201 would divide
    // one cut only, but it is no place for a seam – it stays in the middle, dividing three.
    const beyond = comb
      .replace('G0 X10 Y10', 'G0 X290 Y10')
      .replace('G1 X290 F1200', 'G1 X10 F1200')
      .replace('G1 X130', 'G1 X200.5')
      .replace('G1 X290\n', 'G1 X10\n');
    expect(plan(beyond, FRAME_OPTIONS).seams).toEqual([{ at: 156, cuts: 3 }]);
    expectSound(beyond, plan(beyond, FRAME_OPTIONS), split(beyond, plan(beyond, FRAME_OPTIONS)));
    // A program that never plunges at a feed of its own: entries are made at its slowest feed.
    const dropped = comb.replace('G1 Z-1 F300', 'G0 Z-1');
    expect(body(split(dropped, plan(dropped, FRAME_OPTIONS))[1]!).slice(3, 5)).toEqual([
      'G0 X128 Y10',
      'G1 Z-1 F1200',
    ]);
    // Slots that fit a section whole are no matter of the seam, wherever they lie.
    const slots = [
      'G21 G90',
      'G0 Z5',
      ...[
        [10, 10],
        [140, 30],
        [150, 50],
      ].flatMap(([x, y]) => [`G0 X${x} Y${y}`, 'G1 Z-1 F300', 'G1 X290 F1200', 'G0 Z5']),
      'M30',
    ].join('\n');
    const q = plan(slots, FRAME_OPTIONS);
    expect(q.seams).toEqual([{ at: 156, cuts: 1 }]);
    expect(split(slots, q).map((part) => part.cuts)).toEqual([2, 5]);
    expectSound(slots, q, split(slots, q));
  });

  it('never puts a seam through a tab, and avoids plunges and ramps', () => {
    // A slot over the whole length with a tab from 150 to 162 (lifted by 1.5 mm).
    const tab = [
      'G21 G90',
      'G0 Z5',
      'G0 X10 Y10',
      'G1 Z-3 F300',
      'G1 X150 F1200',
      'G1 Z-1.5 F300',
      'G1 X162 F1200',
      'G1 Z-3 F300',
      'G1 X290 F1200',
      'G0 Z5',
      'M30',
    ].join('\n');
    // 156 lies in the tab; closer than 2 mm to it (overlap + 1) is forbidden too: 148 is the
    // first free place left of the middle (the later section then starts at 147).
    expect(plan(tab, FRAME_OPTIONS).seams).toEqual([{ at: 148, cuts: 1 }]);
    // Lifted over the tab at rapid, on the spot (as Estlcam does it): the same tab.
    const rapid = tab.replace('G1 Z-1.5 F300', 'G0 Z-1.5');
    expect(plan(rapid, FRAME_OPTIONS).seams).toEqual([{ at: 148, cuts: 1 }]);
    const parts = split(rapid, plan(rapid, FRAME_OPTIONS));
    expectSound(rapid, plan(rapid, FRAME_OPTIONS), parts);
    // A tab over all the reach of the seam: no seam.
    const wide = tab.replace('G1 X150 F1200', 'G1 X105 F1200').replace('X162', 'X205');
    expect(planSections(wide, FRAME_OPTIONS)).toEqual({ problem: 'no-seam' });
    // Moves in the air at the feed rate (lifted with G1 to where the cut began) are no tab.
    const air = tab.replace('G1 Z-1.5 F300', 'G1 Z5 F300').replace('G1 X162', 'G1 X190');
    expect(plan(air, FRAME_OPTIONS).seams[0]!.at).toBe(156);
    // A second depth pass that steps down at 156: the seam keeps clear of the plunge.
    const stepped = tab
      .replace('G1 Z-1.5 F300', 'G1 Z-3')
      .replace('G1 X162 F1200', 'G1 X156')
      .replace('G1 Z-3 F300\nG1 X290', 'G1 Z-4 F300\nG1 X290');
    expect(plan(stepped, FRAME_OPTIONS).seams).toEqual([{ at: 154, cuts: 1 }]);
  });

  it('divides a relief or a contour ramped down all around anywhere', () => {
    // Up and down all the way: there are no tabs to tell apart.
    const relief = [
      'G21 G90',
      'G0 Z5',
      'G0 X10 Y10',
      'G1 Z-1 F300',
      ...Array.from({ length: 14 }, (_, i) => `G1 X${30 + 20 * i} Z${i % 2 ? -1 : -3} F900`),
      'G0 Z5',
      'M30',
    ].join('\n');
    const p = plan(relief, FRAME_OPTIONS);
    expect(p.seams).toEqual([{ at: 156, cuts: 1 }]);
    const parts = split(relief, p);
    // The seam meets the slope from (150, −3) to (170, −1) at 156: 0.6 mm up.
    expect(body(parts[0]!)).toContain('G1 X156 Y10 Z-2.4 F900');
    expect(body(parts[1]!)).toContain('G0 X155 Y10');
    expect(body(parts[1]!)).toContain('G1 Z-2.5 F300');
    expect(body(parts[1]!)).toContain('G1 X170 Y10 Z-1 F900');
    expectSound(relief, p, parts);
  });

  it('says why a program cannot be cut in sections', () => {
    const no = (text: string, o: Partial<SectionOptions> = {}) =>
      planSections(text, { ...FRAME_OPTIONS, ...o });
    expect(no(FRAME, { reach: { min: 0, max: 300 } })).toEqual({ problem: 'fits' });
    expect(no(FRAME, { reach: { min: 20, max: 200 } })).toEqual({ problem: 'start-outside' });
    // Too little travel to slide the part along: the marks need 60, the hand 10.
    expect(no(FRAME, { reach: { min: 0, max: 75 } })).toEqual({ problem: 'travel' });
    expect(no(FRAME, { zone: 11 })).toEqual({ problem: 'travel' });
    expect(no('G21 G90\nG0 X10 Y10 Z5\nM30')).toEqual({ problem: 'empty' });
    const unsupported = (text: string) => {
      const r = no(text);
      return 'problem' in r && r.problem === 'unsupported' ? r.what : r;
    };
    expect(unsupported('G1 X10')).toBe('errors');
    expect(unsupported(`G38.2 Z-10 F50\n${FRAME}`)).toBe('probe');
    expect(unsupported(`G55\n${FRAME}`)).toBe('wcs');
    expect(unsupported(`G93\nG94\n${FRAME}`)).toBe('G93');
    expect(unsupported(`G90.1\n${FRAME}`)).toBe('absolute-arcs');
    expect(unsupported(`G92 X0\n${FRAME}`)).toBe('offsets');
    expect(unsupported('G21 G90\nG0 Z5\nG1 Z-1 F100\nG91 G1 X300')).toBe('G91');
    expect(unsupported('G21 G90\nG0 Z5\nG91\nG1 Z-6 F100')).toBe('G91');
    // Switched on and off again before anything moves (as Fusion does around G28): no matter.
    expect(no(FRAME.replace('G1 Y60', 'G91\nG90 G1 Y60'))).toEqual(plan(FRAME, FRAME_OPTIONS));
    expect(unsupported('G21 G90\nG0 Z5\nG0 X10\nG1 Z-1 F100\nG18 G3 X300 Z-1 I145 K0')).toBe('G18');
    expect(unsupported(FRAME.replace('G1 Y60', 'G1 Y60 A90'))).toBe('rotary');
    // No height above the cut is named: there is nowhere to travel.
    expect(unsupported('G21 G90\nG1 Z-1 F300\nG1 X300 F900')).toBe('no-z');
    expect(unsupported('G21 G90\nG1 X300 F900')).toBe('no-z');
    // The same from the splitting itself.
    expect(splitSections('G1 X10', plan(FRAME, FRAME_OPTIONS))).toEqual({
      problem: 'unsupported',
      what: 'errors',
    });
  });

  it('lets Fusion lift with G28 G91 Z0 and switch back', () => {
    const lifted = FRAME.replace('M5\nM30', 'M5\nG28 G91 Z0\nG90\nM30');
    const p = plan(lifted, FRAME_OPTIONS);
    for (const part of split(lifted, p, 3)) {
      expect(body(part).slice(-4)).toEqual(['G28 G91 Z0', 'G90', 'M30', '']);
    }
  });
});

describe('splitSections', () => {
  it('cuts a frame at the seam, pass for pass, and leaves small features whole', () => {
    const p = plan(FRAME, FRAME_OPTIONS);
    const [one, two] = split(FRAME, p, 3);
    expect(one!.text.split('\n')[0]).toBe('(LowRider Control: section 1 of 2, X 0 to 200)');
    expect(body(one!)).toEqual([
      'G21 G90',
      'G0 Z5',
      'M3 S18000',
      'G0 X10 Y10',
      'G1 Z-2 F300',
      // The lower side up to the seam, then up; the feed word of the divided line stays.
      'F1200',
      'G1 X156 Y10 Z-2 F1200',
      'G0 Z5',
      // The right side is the second section's. Back in on the upper side, at the seam.
      'G0 X156 Y60',
      'G1 Z-2 F300',
      'G1 X10 Y60 Z-2 F1200',
      'G1 Y10',
      'G0 Z5',
      // The drilled hole: whole, here.
      'G0 X40 Y35',
      'G1 Z-3 F300',
      'G0 Z5',
      // The circle is the second section's: only its feed words are left.
      'F300',
      'F900',
      'M5',
      'M30',
      '',
    ]);
    expect(two!.text.split('\n')[0]).toBe('(LowRider Control: section 2 of 2, X 110 to 290)');
    expect(body(two!)).toEqual([
      'G21 G90',
      'G0 Z5',
      'M3 S18000',
      'F300',
      'F1200',
      // In 1 mm before the seam, in the slot the first section has cut.
      'G0 X155 Y10',
      'G1 Z-2 F300',
      'G1 X290 Y10 Z-2 F1200',
      'G1 Y60',
      'G1 X155 Y60 Z-2 F1200',
      'G0 Z5',
      'F300',
      // The circle (230 … 270): whole, as the program has it.
      'G0 X250 Y35',
      'G1 Z-1 F300',
      'G2 X250 Y35 I-20 J0 F900',
      'G0 Z5',
      'M5',
      'M30',
      '',
    ]);
    expect(one!.cuts).toBe(5);
    expect(two!.cuts).toBe(5);
    expect(one!.bounds!.max.x).toBe(156);
    expect(two!.bounds!.min.x).toBe(155);
    expectSound(FRAME, p, [one!, two!]);
    // Meeting exactly, without the millimetre of overlap, and a plunge feed of one's own.
    const exact = splitSections(FRAME, { ...p, overlap: 0 }, { plungeFeed: 120 });
    expect('problem' in exact).toBe(false);
    const parts = exact as SectionProgram[];
    expect(body(parts[1]!).slice(5, 7)).toEqual(['G0 X156 Y10', 'G1 Z-2 F120']);
    expectSound(FRAME, { ...p, overlap: 0 }, parts);
  });

  it('divides arcs where they cross the seam, along Y, in inches', () => {
    // A circle of 2 in radius about (1, 6), cut counter-clockwise from its lowest point.
    const circle = [
      'G20 G90',
      'G0 Z0.2',
      'M3 S18000',
      'G0 X1 Y4',
      'G1 Z-0.1 F10',
      'G3 X1 Y4 I0 J2 F40',
      'G0 Z0.2',
      'M5',
      'M30',
    ].join('\n');
    // In mm: Y 101.6 … 203.2, 127 in reach. Slides of at most 127 − 50.8 − 12.7 = 63.5;
    // 88.9 more are needed: two slides of 50.
    const p = plan(circle, {
      axis: 'y',
      reach: { min: 0, max: 127 },
      zone: 50.8,
      tolerance: 12.7,
      touch: 3,
    });
    expect(p.shifts).toEqual([0, 50, 100]);
    // The first seam (95) is below the circle; the second (139 mm = 5.47244 in) crosses it
    // where sin = (139 − 152.4) / 50.8, x = 1 ± 2 · 0.96458 in.
    expect(p.seams).toEqual([
      { at: 95, cuts: 0 },
      { at: 139, cuts: 2 },
    ]);
    const [one, two, three] = split(circle, p, 3);
    expect(one!.cuts).toBe(0);
    expect(one!.bounds).toBeNull();
    expect(body(one!)).toEqual(['G20 G90', 'G0 Z0.2', 'M3 S18000', 'F10', 'F40', 'M5', 'M30']);
    expect(body(two!)).toEqual([
      'G20 G90',
      'G0 Z0.2',
      'M3 S18000',
      'G0 X1 Y4',
      'G1 Z-0.1 F10',
      'F40',
      'G3 X2.92917 Y5.47244 Z-0.1 I0 J2 F40',
      'G0 Z0.2',
      // Back in where the circle comes down through the seam; the centre from there.
      'G0 X-0.92917 Y5.47244',
      'G1 Z-0.1 F10',
      'G3 X1 Y4 Z-0.1 I1.92917 J0.52756 F40',
      'G0 Z0.2',
      'M5',
      'M30',
    ]);
    // The third starts 1 mm before the seam (138 mm = 5.43307 in) and goes over the top:
    // more than half a turn, so in two arcs that meet at the highest point.
    expect(body(three!)).toEqual([
      'G20 G90',
      'G0 Z0.2',
      'M3 S18000',
      'F10',
      'F40',
      'G0 X2.91797 Y5.43307',
      'G1 Z-0.1 F10',
      'G3 X1 Y8 Z-0.1 I-1.91797 J0.56693 F40',
      'G3 X-0.91797 Y5.43307 Z-0.1 I0 J-2 F40',
      'G0 Z0.2',
      'M5',
      'M30',
    ]);
    expectSound(circle, p, [one!, two!, three!]);
    // Clockwise and in millimetres (set on the line that moves), along X.
    const cw = ['G0 Z5', 'G21 G0 X150 Y60', 'G1 Z-1 F200', 'G2 X150 Y60 I0 J50 F800', 'G0 Z5'].join(
      '\n',
    );
    const q = plan(cw, { ...FRAME_OPTIONS, reach: { min: 90, max: 180 }, zone: 30, tolerance: 5 });
    expect(q.seams).toEqual([{ at: 153, cuts: 2 }]);
    const halves = split(cw, q);
    // Clockwise from the lowest point: left and up first. x = 153 at y = 110 ∓ √(50² − 3²).
    // Up to the seam on the far side that is 183.44°: two arcs of 91.72°, the first ending
    // at 150 + 50 · cos 178.28°, 110 + 50 · sin 178.28°.
    expect(body(halves[0]!)).toEqual([
      'G0 Z5',
      'G21 G0 X150 Y60',
      'G1 Z-1 F200',
      'F800',
      'G2 X100.0225 Y111.5007 Z-1 I0 J50 F800',
      'G2 X153 Y159.9099 Z-1 I49.9775 J-1.5007 F800',
      'G0 Z5',
      'G0 X153 Y60.0901',
      'G1 Z-1 F200',
      'G2 X150 Y60 Z-1 I-3 J49.9099 F800',
      'G0 Z5',
    ]);
    expect(body(halves[1]!)).toEqual([
      'G0 Z5',
      'G21',
      'F200',
      'F800',
      'G0 X152 Y159.96',
      'G1 Z-1 F200',
      'G2 X152 Y60.04 Z-1 I-2 J-49.96 F800',
      'G0 Z5',
    ]);
    expectSound(cw, q, halves);
  });

  it('keeps a piece of arc too short to tell its ends apart a straight line', () => {
    // A circle of radius 50 about (150, 100) whose lowest point lies 0.00002 mm right of the
    // seam the plan is given: the first section's piece is 0.00002 mm long.
    const circle = [
      'G21 G90',
      'G0 Z5',
      'G0 X150 Y50',
      'G1 Z-1 F200',
      'G3 X150 Y50 I0 J50 F800',
      'G0 Z5',
    ].join('\n');
    const p: SectionPlan = {
      axis: 'x',
      windows: [
        { min: 90, max: 160 },
        { min: 140, max: 210 },
      ],
      shifts: [0, 60],
      seams: [{ at: 150.00002, cuts: 2 }],
      overlap: 0,
    };
    const parts = split(circle, p);
    // Had it been written as an arc from (150, 50) to (150, 50), it would be a full circle.
    expect(body(parts[0]!)).toEqual([
      'G21 G90',
      'G0 Z5',
      'G0 X150 Y50',
      'G1 Z-1 F200',
      'F800',
      'G1 X150 Y50 Z-1 F800',
      'G0 Z5',
      // The right half is the second section's; the left half, a hair more than half a turn,
      // comes in two arcs.
      'G0 X150 Y150',
      'G1 Z-1 F200',
      'G3 X100 Y100 Z-1 I0 J-50 F800',
      'G3 X150 Y50 Z-1 I50 J0 F800',
      'G0 Z5',
    ]);
    expect(body(parts[1]!).slice(4)).toEqual([
      'G0 X150 Y50',
      'G1 Z-1 F200',
      'G3 X150 Y150 Z-1 I0 J50 F800',
      'G0 Z5',
    ]);
    expectSound(circle, p, parts);
  });

  it('follows the original only as long as it stays inside, and comes back at the plunge feed', () => {
    // Features in an order that goes to and fro between the sections, a G1 without a word
    // of its own after an entry, a move at the feed rate in the air across the seam, lifts
    // in machine coordinates and a tool that parks at the end.
    const job = [
      'G21 G90',
      'G53 G0 Z0',
      'T1 M6',
      'M3 S12000',
      'G0 X20 Y20',
      'G0 Z2',
      'G1 Z-1 F100',
      'X60 F600',
      'G0 Z5',
      'G0 X250 Y20',
      'G1 Z-1 F100',
      'G1 X280 F600',
      'G0 Z5',
      'G0 X30 Y40',
      'Z2',
      'G1 Z-1 F100',
      'X50 F600',
      'G1 Z5',
      'G1 X270 Y40',
      'G1 Z-1 F100',
      'G1 X285 F600',
      'G53 G0 Z0',
      'G53 G0 X0 Y0',
      'M5',
      'M30',
    ].join('\n');
    const p = plan(job, FRAME_OPTIONS);
    // The move in the air from 50 to 270 joins the two slots on Y40 to one feature too long
    // for a section; it alone crosses the seam.
    expect(p.seams).toEqual([{ at: 156, cuts: 1 }]);
    const [one, two] = split(job, p);
    expect(body(one!)).toEqual([
      'G21 G90',
      'G53 G0 Z0',
      'T1 M6',
      'M3 S12000',
      'G0 X20 Y20',
      'G0 Z2',
      'G1 Z-1 F100',
      'X60 F600',
      'G0 Z5',
      // The slot at 250 … 280 is the second section's: only the feeds stay.
      'F100',
      'F600',
      'G0 X30 Y40',
      'Z2',
      'G1 Z-1 F100',
      'X50 F600',
      'G1 Z5',
      // In the air to the seam; already at the travel height, so no lift.
      'G1 X156 Y40 Z5 F600',
      'F100',
      'F600',
      'G53 G0 Z0',
      'G53 G0 X0 Y0',
      'M5',
      'M30',
    ]);
    expect(body(two!)).toEqual([
      'G21 G90',
      'G53 G0 Z0',
      'T1 M6',
      'M3 S12000',
      // Not the first slot: down from the machine's top to the program's travel height.
      'G0 Z5',
      'F100',
      'F600',
      'G0 X250 Y20',
      'G1 Z-1 F100',
      'G1 X280 F600',
      'G0 Z5',
      'F100',
      'F600',
      // Into the move in the air at the seam: it starts at the travel height, nothing to plunge.
      'G0 X155 Y40',
      'G1 X270 Y40 Z5 F600',
      'G1 Z-1 F100',
      'G1 X285 F600',
      'G53 G0 Z0',
      'G53 G0 X0 Y0',
      'M5',
      'M30',
    ]);
    expectSound(job, p, [one!, two!]);
  });

  it('comes back to a place the original reaches at rapid, and names what a line relies on', () => {
    const job = [
      'G21 G90 G0 Z10',
      'G0 X250 Y10',
      'G0 Z1',
      'G1 Z-1 F100',
      'X280 F500',
      'G0 Z10',
      'X20 Y10',
      'Z1',
      'G1 Z-1 F100',
      'X60 F500',
      'G0 Z10',
      'G0 X260 Y30 Z1',
      'Z0.5',
      'G1 Z-1',
      'X270',
      'G0 Z10',
      'G1 F400',
      'G0 X30 Y30',
      'G0 Z1',
      'G1 Z-2',
      'G1 X65',
      'G0 Z10',
      'G0 X0 Y0',
    ].join('\n');
    const p = plan(job, FRAME_OPTIONS);
    const [one, two] = split(job, p);
    expect(body(one!)).toEqual([
      // The first line moves and sets modes: the modes stay, the lift is the section's own.
      'G21 G90 G0 Z10',
      'F100',
      'F500',
      // Back to where the original stands after its rapid, and on with it move for move.
      'G0 X20 Y10',
      'Z1',
      'G1 Z-1 F100',
      'X60 F500',
      'G0 Z10',
      'G1 F400',
      'G0 X30 Y30',
      'G0 Z1',
      'G1 Z-2',
      'G1 X65',
      'G0 Z10',
    ]);
    expect(body(two!)).toEqual([
      'G21 G90 G0 Z10',
      'G0 X250 Y10',
      'G0 Z1',
      'G1 Z-1 F100',
      'X280 F500',
      'G0 Z10',
      'F100',
      'F500',
      // A rapid that names its height: across at the travel height, then down slowly. The
      // lines after it get what they relied on: the rapid, and the feed of the slot before.
      'G0 X260 Y30',
      'G1 Z1 F100',
      'G0 Z0.5',
      'G1 Z-1 F500',
      'X270',
      'G0 Z10',
      'G1 F400',
    ]);
    expectSound(job, p, [one!, two!]);
    // The same in inches that the program switches off again on a line that moves.
    const mixed = `G20\n${job.replace('G21 G90 G0 Z10', 'G90 G21 G0 Z10')}`;
    expect(body(split(mixed, plan(mixed, FRAME_OPTIONS))[0]!).slice(0, 3)).toEqual([
      'G20',
      'G90 G21 G0 Z10',
      'F100',
    ]);
  });

  it('enters a move it joins half-way with the words that move needs', () => {
    // Two tools without a move across between them, a line numbered and commented, the
    // height unknown after a G53 lift when the section comes back.
    const job = [
      'G21 G90',
      'G0 Z5',
      'G0 X10 Y10',
      'G1 Z-1 F100',
      'N40 G1 X290 F700 (long side)',
      'T2',
      'G1 Y30',
      'G1 X10',
      'G53 G0 Z0',
      'G0 X120 Y50',
      'G0 Z5',
      'G1 Z-1 F100',
      'G1 X130 F700',
      'G0 Z5',
    ].join('\n');
    const p = plan(job, FRAME_OPTIONS);
    const [one, two] = split(job, p);
    expect(body(one!)).toEqual([
      'G21 G90',
      'G0 Z5',
      'G0 X10 Y10',
      'G1 Z-1 F100',
      'N40 F700 (long side)',
      'G1 X156 Y10 Z-1 F700',
      'G0 Z5',
      'T2',
      'G0 X156 Y30',
      'G1 Z-1 F100',
      'G1 X10 Y30 Z-1 F700',
      'G53 G0 Z0',
      'G0 X120 Y50',
      'G0 Z5',
      'G1 Z-1 F100',
      'G1 X130 F700',
      'G0 Z5',
    ]);
    expect(body(two!)).toEqual([
      'G21 G90',
      'G0 Z5',
      'F100',
      'N40 F700 (long side)',
      'G0 X155 Y10',
      'G1 Z-1 F100',
      'G1 X290 Y10 Z-1 F700',
      'T2',
      'G1 Y30',
      'G1 X155 Y30 Z-1 F700',
      'G0 Z5',
      'G53 G0 Z0',
      // The slot at 120 … 130 was cut by the first section.
      'F100',
      'F700',
    ]);
    expectSound(job, p, [one!, two!]);
  });

  it('refuses a plan that does not fit the program', () => {
    const p = plan(FRAME, FRAME_OPTIONS);
    const narrow = { ...p, windows: [{ min: 20, max: 200 }, p.windows[1]!] };
    expect(splitSections(FRAME, narrow)).toEqual({ problem: 'outside' });
    const short = { ...p, windows: [p.windows[0]!, { min: 110, max: 280 }] };
    expect(splitSections(FRAME, short)).toEqual({ problem: 'outside' });
  });

  it('holds for real programs: Estlcam with tabs, Fusion, VCarve', () => {
    // Estlcam: a part 626 mm along Y cut in five passes with four tabs, lifted at rapid.
    const estlcam = golden('estlcam-spie-kl-haltestege.nc');
    const pe = plan(estlcam, {
      axis: 'y',
      reach: { min: -10, max: 400 },
      zone: 100,
      tolerance: 20,
    });
    expect(pe.shifts).toEqual([0, 250]);
    // Tabs at Y 165.6 … 174.6 and 431.2 … 445.2 and their twins: the seam lies between them.
    expect(pe.seams).toEqual([{ at: 331, cuts: 12 }]);
    const estlcamParts = split(estlcam, pe);
    expectSound(estlcam, pe, estlcamParts);
    // Every tab is cut whole by one section: the lift over it and the way down again.
    expect(estlcamParts[0]!.text.match(/G00 Z-16\.5000/g)).toHaveLength(4);
    expect(estlcamParts[1]!.text.match(/G00 Z-16\.5000/g)).toHaveLength(4);

    // Fusion: a contour in three passes, a round pocket and a drilled hole; G43 repaired.
    const fusion = removeToolLengthTable(golden('fusion360-contour-pocket.nc')).text;
    const pf = plan(fusion, { axis: 'x', reach: { min: -4, max: 60 }, zone: 20, tolerance: 2 });
    const fusionParts = split(fusion, pf);
    expectSound(fusion, pf, fusionParts);
    // The pocket (X 20 … 50) is cut whole by the first section, the hole at X 80 by the last.
    expect(fusionParts[0]!.text).toContain('G2 X20 Y31.5 R15');
    expect(fusionParts.filter((s) => s.text.includes('G1 Z-5 F200'))).toHaveLength(1);

    // VCarve: no spaces, spindle on a line that moves, moves in three axes.
    const vcarve = golden('vectric-vcarve-mm.nc');
    const pv = plan(vcarve, { axis: 'x', reach: { min: -4, max: 60 }, zone: 20, tolerance: 2 });
    const vcarveParts = split(vcarve, pv);
    expectSound(vcarve, pv, vcarveParts);
    for (const part of vcarveParts) expect(part.text).toMatch(/S18000 ?M3/);
  });

  it('plans and divides a large program in reasonable time', () => {
    const big = removeToolLengthTable(golden('fusion360-1003-adaptiv-kontur-parallel.nc')).text;
    const p = plan(big, { axis: 'x', reach: { min: -83, max: 17 }, zone: 30, tolerance: 4 });
    const parts = split(big, p);
    expect(parts).toHaveLength(p.windows.length);
    const length = (text: string) => cutting(text).reduce((sum, s) => sum + s.length, 0);
    // Nothing lost: the sections cut at least what the original cuts.
    expect(parts.reduce((sum, s) => sum + length(s.text), 0)).toBeGreaterThan(length(big));
  });
});
