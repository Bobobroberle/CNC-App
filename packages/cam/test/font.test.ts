import { describe, expect, it } from 'vitest';
import { bounds, FONT_CHARACTERS, textContours, type Contour, type Point } from '../src';

const all = (contours: Contour[]) => contours.flatMap((c) => c.points);
const near = (p: Point, x: number, y: number) => {
  expect(p.x).toBeCloseTo(x, 6);
  expect(p.y).toBeCloseTo(y, 6);
};

describe('text as strokes', () => {
  it('draws letters at the height of the capitals, from the baseline at the anchor', () => {
    const i = textContours('I', { height: 10 });
    expect(i.contours).toEqual([
      {
        closed: false,
        points: [
          { x: 0, y: 0 },
          { x: 0, y: 10 },
        ],
      },
    ]);
    expect(i.missing).toEqual([]);
    // L is 5 wide on a height of 10; at twice the height everything doubles.
    const l = textContours('L', { height: 20, x: 100, y: 50 });
    expect(l.contours[0]!.points).toEqual([
      { x: 100, y: 70 },
      { x: 100, y: 50 },
      { x: 110, y: 50 },
    ]);
    expect(l.width).toBe(10);
    expect(l.height).toBe(20);
  });

  it('closes the round letters and keeps their curves within the tolerance', () => {
    const { contours } = textContours('O', { height: 100 });
    expect(contours).toHaveLength(1);
    const o = contours[0]!;
    expect(o.closed).toBe(true);
    const b = bounds(o.points);
    expect(b.minX).toBeCloseTo(0, 1);
    expect(b.maxX).toBeCloseTo(70, 1);
    expect(b.minY).toBeCloseTo(0, 6);
    expect(b.maxY).toBeCloseTo(100, 6);
    // Every chord of the ellipse (35 × 50 around 35, 50) stays within 0.01 mm of it.
    const off = (p: Point) =>
      Math.abs(Math.sqrt(((p.x - 35) / 35) ** 2 + ((p.y - 50) / 50) ** 2) - 1) * 50;
    let worst = 0;
    o.points.forEach((p, k) => {
      const q = o.points[(k + 1) % o.points.length]!;
      expect(off(p)).toBeLessThan(1e-9);
      worst = Math.max(worst, off({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }));
    });
    expect(worst).toBeLessThanOrEqual(0.01);
    expect(worst).toBeGreaterThan(0.004);
    // A coarser tolerance needs fewer points.
    const coarse = textContours('O', { height: 100, tolerance: 0.5 }).contours[0]!;
    expect(coarse.points.length).toBeLessThan(o.points.length / 4);
  });

  it('sets letters side by side with the room between them', () => {
    // I is a single stroke; the font leaves 2/10 of the height to the next letter.
    const two = textContours('II', { height: 10 });
    expect(two.contours.map((c) => c.points[0]!.x)).toEqual([0, 2]);
    expect(two.width).toBe(2);
    const wide = textContours('II', { height: 10, spacing: 0.1 });
    expect(wide.contours.map((c) => c.points[0]!.x)).toEqual([0, 3]);
    const tight = textContours('II', { height: 10, spacing: -0.1 });
    expect(tight.contours.map((c) => c.points[0]!.x)).toEqual([0, 1]);
    // A blank is 3 wide: I, room, blank, room, I.
    expect(textContours('I I', { height: 10 }).contours[1]!.points[0]!.x).toBe(7);
    expect(textContours('I\tI', { height: 10 }).contours[1]!.points[0]!.x).toBe(7);
  });

  it('aligns every line on the anchor: left, centred or right', () => {
    // "LL" is 5 + 2 + 5 = 12 wide, "L" 5.
    const xs = (align: 'left' | 'center' | 'right') =>
      textContours('LL\nL', { height: 10, align, x: 100 }).contours.map(
        (c) => bounds(c.points).minX,
      );
    expect(xs('left')).toEqual([100, 107, 100]);
    expect(xs('center')).toEqual([94, 101, 97.5]);
    expect(xs('right')).toEqual([88, 95, 95]);
    expect(textContours('LL\nL', { height: 10 }).width).toBe(12);
  });

  it('puts further lines below, 1.6 heights apart unless told otherwise', () => {
    const lines = textContours('I\r\nI\nI', { height: 10 });
    expect(lines.contours.map((c) => c.points[0]!.y)).toEqual([0, -16, -32]);
    expect(lines.height).toBe(42);
    const close = textContours('I\nI', { height: 10, lineSpacing: 1.2 });
    expect(close.contours[1]!.points[0]!.y).toBe(-12);
    // Centred in height: the block from the top of the capitals to the last baseline.
    const middle = textContours('I', { height: 10, vertical: 'middle' });
    expect(middle.contours[0]!.points).toEqual([
      { x: 0, y: -5 },
      { x: 0, y: 5 },
    ]);
    const block = textContours('I\nI', { height: 10, vertical: 'middle', y: 100 });
    expect(block.contours[0]!.points[1]!.y).toBe(113);
    expect(block.contours[1]!.points[0]!.y).toBe(87);
  });

  it('turns the text around its anchor', () => {
    const up = textContours('L', { height: 10, x: 100, y: 50, angle: 90 });
    // Reading upwards: the stem lies to the left, the foot points up.
    const p = up.contours[0]!.points;
    near(p[0]!, 90, 50);
    near(p[1]!, 100, 50);
    near(p[2]!, 100, 55);
    const slanted = textContours('I', { height: 10, angle: 30 });
    near(slanted.contours[0]!.points[1]!, -5, 8.660254);
  });

  it('writes German: umlauts above the letter, the sharp s, the euro', () => {
    // A is two strokes; the two dots sit above the capital height.
    const a = textContours('Ä', { height: 10 }).contours;
    expect(a).toHaveLength(4);
    expect(bounds(all(a.slice(2)))).toMatchObject({ minY: 11.8, maxY: 12.6 });
    // Centred over the letter (7 wide), 1.3 to either side.
    expect(a.slice(2).map((c) => c.points[0]!.x)).toEqual([2.2, 4.8]);
    const small = textContours('ä', { height: 10 }).contours;
    expect(bounds(all(small.slice(-2)))).toMatchObject({ minY: 8.8, maxY: 9.6 });
    for (const ch of 'ÄÖÜäöüß€') {
      const t = textContours(ch, { height: 10 });
      expect(t.missing).toEqual([]);
      expect(t.contours.length).toBeGreaterThan(0);
    }
    // The capital sharp s is written SS.
    expect(textContours('ẞ', { height: 10 }).contours).toEqual(
      textContours('SS', { height: 10 }).contours,
    );
  });

  it('builds other accented letters from the letter and its mark', () => {
    // é = e + acute; the dot of the i makes room for the mark.
    expect(textContours('é', { height: 10 }).contours).toHaveLength(2);
    expect(textContours('i', { height: 10 }).contours).toHaveLength(2);
    expect(textContours('ï', { height: 10 }).contours).toHaveLength(3);
    expect(textContours('ĵ', { height: 10 }).contours).toHaveLength(2);
    // The cedilla hangs below the baseline and leaves the i its dot.
    const c = textContours('ç', { height: 10 }).contours;
    expect(bounds(c.at(-1)!.points).minY).toBe(-2);
    expect(textContours('i̧', { height: 10 }).contours).toHaveLength(3);
    // The ring of å is a closed circle; over a capital it sits three units higher.
    const ring = textContours('å', { height: 10 }).contours.at(-1)!;
    expect(ring.closed).toBe(true);
    expect(bounds(ring.points).maxY).toBeCloseTo(10.2, 1);
    expect(bounds(textContours('Å', { height: 10 }).contours.at(-1)!.points).maxY).toBeCloseTo(
      13.2,
      1,
    );
    for (const ch of 'àâñčã') expect(textContours(ch, { height: 10 }).missing).toEqual([]);
    // A mark with nothing to sit on is left out.
    expect(textContours('̈', { height: 10 }).contours).toEqual([]);
  });

  it('leaves a gap for what it cannot write and says which characters those were', () => {
    const t = textContours('I☺I☺́', { height: 10 });
    expect(t.missing).toEqual(['☺']);
    expect(t.contours).toHaveLength(2);
    expect(t.contours[1]!.points[0]!.x).toBe(7);
    expect(textContours('', { height: 10 })).toEqual({
      contours: [],
      missing: [],
      width: 0,
      height: 10,
    });
  });

  it('knows typographic quotes, dashes and the ellipsis', () => {
    const same = (a: string, b: string) =>
      expect(textContours(a, { height: 10 }).contours).toEqual(
        textContours(b, { height: 10 }).contours,
      );
    same('“x”', '"x"');
    same('‘x’', "'x'");
    same('a—b', 'a–b');
    same('1−2', '1-2');
    same('…', '...');
    same('a b', 'a b');
    expect(textContours('„', { height: 10 }).contours).toHaveLength(2);
  });

  it('has a glyph for every character it lists, inside the line', () => {
    expect(FONT_CHARACTERS.length).toBeGreaterThan(100);
    for (const ch of FONT_CHARACTERS) {
      const t = textContours(ch, { height: 10 });
      expect(t.missing).toEqual([]);
      if (ch === ' ') continue;
      const b = bounds(all(t.contours));
      expect(b.minY).toBeGreaterThanOrEqual(-3.01);
      expect(b.maxY).toBeLessThanOrEqual(11.01);
      expect(b.minX).toBeGreaterThanOrEqual(-0.7);
      expect(b.maxX).toBeLessThanOrEqual(t.width + 0.05);
      // No stroke without length: the tool would only plunge.
      for (const c of t.contours) expect(c.points.length).toBeGreaterThan(1);
    }
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,:;!?-+/()') {
      expect(FONT_CHARACTERS).toContain(ch);
    }
  });
});
