import { describe, expect, it } from 'vitest';
// The one place the CAM library meets the G-code library: a program the CAM writes is split and run apart the way
// the app does it from the SD card. (A relative path, because `@lowrider/cam` does not depend on gcode-core – the
// source of the CAM never imports it, and no other test does.)
import {
  analyzeProgram,
  camInfo,
  interpret,
  splitAtToolChanges,
  ZERO,
  type Segment,
  type Vec4,
} from '../../gcode-core/src';
import { twoToolSign } from './toolsFixture';

/** What a move is, apart from where in the file it stands: this is what two runs of the same move must agree on */
const motionOf = (s: Segment) => ({
  motion: s.motion,
  from: s.from,
  to: s.to,
  feed: s.feed,
  feedMode: s.feedMode,
  spindle: s.spindle,
  spindleSpeed: s.spindleSpeed,
  tool: s.tool,
  length: s.length,
});

describe.each([
  ['with the feeds of each tool of its own', false],
  ['with the same feeds for both tools', true],
])('a program with two tools %s, split at its tool change and run apart', (_, sameFeeds) => {
  const { program } = twoToolSign([1, 2], sameFeeds);
  const parts = splitAtToolChanges(program);
  const full = analyzeProgram(program);

  it('is three parts – T1, T2, T1 – that each begin at their tool change, with no error and no missing feed', () => {
    expect(parts.map((p) => p.tool)).toEqual([1, 2, 1]);
    const lines = program.split('\n');
    parts.forEach((p, k) => {
      const first = p.text.split('\n').filter((l) => l !== '');
      // Part 1 is the program from its first line; the others are a header and the modes, then the change itself
      if (k === 0) expect(first[0]).toBe(lines[0]);
      else
        expect(first.slice(2, 4)).toEqual([`T${p.tool} M6`, `S${p.tool === 2 ? 12000 : 18000} M3`]);
      const a = analyzeProgram(p.text);
      expect(a.diagnostics, `part ${p.number}`).toEqual([]);
      expect(a.diagnostics.filter((d) => d.code === 'missing-feed-rate')).toEqual([]);
    });
    // The lift and the spindle off before a change stay in the part that ends there
    expect(parts[0]!.text.endsWith('\nG0 Z5\nM5\n')).toBe(true);
    expect(parts[1]!.text.endsWith('\nG0 Z5\nM5\n')).toBe(true);
  });

  it('makes in each part, started where the one before ended, exactly the moves it makes in the whole program', () => {
    // The machine is where the last part left it; the part has no memory of anything before its first line
    let position: Vec4 = { ...ZERO };
    let compared = 0;
    for (const p of parts) {
      const alone = interpret(p.text, { initialPosition: position });
      expect(alone.diagnostics).toEqual([]);
      // The moves of the whole program that stand on this part's lines
      const mine = full.segments.filter(
        (s) => s.lineIndex >= p.firstLine && s.lineIndex < p.endLine,
      );
      expect(alone.segments.map(motionOf)).toEqual(mine.map(motionOf));
      compared += mine.length;
      position = alone.finalPosition;
    }
    // Every move of the program was compared – and there are many of them
    expect(compared).toBe(full.segments.length);
    expect(compared).toBeGreaterThan(500);
  });

  it('turns the spindle on in every part, at the speed of its tool, before the first cut', () => {
    for (const p of parts) {
      const a = analyzeProgram(p.text);
      const feed = a.segments.filter((s) => s.motion !== 'rapid');
      expect(feed.length).toBeGreaterThan(0);
      for (const s of feed) {
        expect(s.spindle).toBe('cw');
        expect(s.spindleSpeed).toBe(s.tool === 2 ? 12000 : 18000);
        expect(s.tool).toBe(p.tool);
      }
    }
  });

  it('says in every part, in its first move, the mode and the axes, and the feed in the first cut', () => {
    for (const p of parts) {
      const lines = p.text.split('\n');
      const move = lines.findIndex((l) => /^(G\d+ )?[XYZ]/.test(l));
      expect(lines[move], `part ${p.number}`).toMatch(/^G0 Z5$/);
      const cutting = lines.find((l) => /^G1 /.test(l))!;
      expect(cutting).toMatch(/ F\d+$/);
    }
  });

  it('names its tools where the app reads them: header, first tool, and the order of use', () => {
    expect(camInfo(program).tools).toEqual([
      { number: 1, name: 'T1 D=3 End mill 3', diameter: 3 },
      { number: 2, name: 'T2 D=1 V-bit 60', diameter: 1 },
    ]);
    expect(full.tools).toEqual([1, 2]);
    expect(full.toolOrder).toEqual([1, 2]);
    // A job whose first tool has the higher number: sorted, T1 would be taken for the first tool
    const swapped = analyzeProgram(twoToolSign([2, 1]).program);
    expect(swapped.tools).toEqual([1, 2]);
    expect(swapped.toolOrder).toEqual([2, 1]);
    expect(splitAtToolChanges(twoToolSign([2, 1]).program).map((p) => p.tool)).toEqual([2, 1, 2]);
  });
});
