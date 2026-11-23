import { describe, expect, it } from 'vitest';
import { convexHull, findBlanks, smallestBox, type BlankShape } from '../src/lib/blanks';

/** A shape of the test pictures; angles as seen with y up (counter-clockwise), like the finder's. */
type Shape =
  | { rect: [x: number, y: number, length: number, width: number, angle: number]; round?: number }
  | { disc: [x: number, y: number, r: number] }
  | { poly: [number, number][] };

function inside(s: Shape, px: number, py: number): boolean {
  if ('disc' in s) {
    const [x, y, r] = s.disc;
    return (px - x) ** 2 + (py - y) ** 2 <= r * r;
  }
  if ('poly' in s) {
    let hit = false;
    for (let i = 0, j = s.poly.length - 1; i < s.poly.length; j = i++) {
      const [ax, ay] = s.poly[i]!;
      const [bx, by] = s.poly[j]!;
      if (ay > py !== by > py && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) hit = !hit;
    }
    return hit;
  }
  const [x, y, length, width, angle] = s.rect;
  const a = (angle * Math.PI) / 180;
  // The long side points along (cos a, −sin a): y runs down in a picture.
  const lx = Math.abs((px - x) * Math.cos(a) - (py - y) * Math.sin(a));
  const ly = Math.abs((px - x) * Math.sin(a) + (py - y) * Math.cos(a));
  if (lx > length / 2 || ly > width / 2) return false;
  // Rounded corners
  const r = s.round ?? 0;
  const cx = lx - (length / 2 - r);
  const cy = ly - (width / 2 - r);
  return cx <= 0 || cy <= 0 || cx * cx + cy * cy <= r * r;
}

/** A picture of light shapes on a darker table (4 × 4 samples per pixel), with holes cut out. */
function picture(
  width: number,
  height: number,
  shapes: Shape[],
  { table = 110, blank = 205, holes = [] as Shape[] } = {},
) {
  const gray = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let on = 0;
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          const px = x + (sx + 0.5) / 4;
          const py = y + (sy + 0.5) / 4;
          if (shapes.some((s) => inside(s, px, py)) && !holes.some((s) => inside(s, px, py))) on++;
        }
      }
      gray[y * width + x] = Math.round(table + ((blank - table) * on) / 16);
    }
  }
  return gray;
}

const only = (found: { blanks: BlankShape[] }) => {
  expect(found.blanks).toHaveLength(1);
  return found.blanks[0]!;
};

describe('finding blanks', () => {
  it('measures a rectangle lying askew: centre, sides and how it is turned', () => {
    // 100 × 60 px around (120.3, 80.6), its long side turned 25° counter-clockwise as seen:
    // the right end is higher up in the picture (smaller y).
    const gray = picture(240, 170, [{ rect: [120.3, 80.6, 100, 60, 25] }]);
    const found = findBlanks(gray, 240, 170);
    expect(found.flat).toBe(false);
    expect(found.rejected).toEqual([]);
    const b = only(found);
    expect(b.kind).toBe('rect');
    expect(b.x).toBeCloseTo(120.3, 1);
    expect(b.y).toBeCloseTo(80.6, 1);
    expect(b.length).toBeCloseTo(100, 0);
    expect(Math.abs(b.length - 100)).toBeLessThan(0.2);
    expect(Math.abs(b.width - 60)).toBeLessThan(0.2);
    expect(b.angle).toBeCloseTo(25, 1);
    // 205 on 110: 95 grey levels, a little less through the soft rim.
    expect(b.contrast).toBeGreaterThan(85);
    expect(b.contrast).toBeLessThan(96);
    // The corners, by hand: the middle ± 50 along (cos 25°, −sin 25°) ± 30 along (sin 25°, cos 25°).
    const corner = (i: number, j: number) => ({
      x: 120.3 + i * 50 * 0.9063 + j * 30 * 0.4226,
      y: 80.6 - i * 50 * 0.4226 + j * 30 * 0.9063,
    });
    for (const want of [corner(1, 1), corner(1, -1), corner(-1, -1), corner(-1, 1)]) {
      const nearest = Math.min(...b.outline.map((p) => Math.hypot(p.x - want.x, p.y - want.y)));
      expect(nearest).toBeLessThan(0.25);
    }
  });

  it('gives the direction of the long side between −90° and 90°, whichever way it lies', () => {
    for (const angle of [-80, -33.5, 0, 12, 77, 90]) {
      const gray = picture(200, 200, [{ rect: [100, 100, 120, 50, angle] }]);
      const b = only(findBlanks(gray, 200, 200));
      expect(b.kind).toBe('rect');
      expect(Math.abs(b.angle! - angle)).toBeLessThan(0.1);
    }
    // Turned on by half a turn it is the same rectangle.
    const b = only(findBlanks(picture(200, 200, [{ rect: [100, 100, 120, 50, 200] }]), 200, 200));
    expect(b.angle).toBeCloseTo(20, 1);
  });

  it('takes a square by one of its sides, between −45° and 45°', () => {
    const b = only(findBlanks(picture(200, 200, [{ rect: [90.5, 104.2, 80, 80, 12] }]), 200, 200));
    expect(b.kind).toBe('square');
    expect(b.angle).toBeCloseTo(12, 1);
    expect(b.x).toBeCloseTo(90.5, 1);
    expect(b.y).toBeCloseTo(104.2, 1);
    const turned = only(
      findBlanks(picture(200, 200, [{ rect: [100, 100, 80, 80, 70] }]), 200, 200),
    );
    // 70° is the same square as −20°.
    expect(turned.angle).toBeCloseTo(-20, 1);
  });

  it('finds a round blank by its rim and says it has no direction', () => {
    const b = only(findBlanks(picture(200, 180, [{ disc: [97.3, 88.8, 40] }]), 200, 180));
    expect(b.kind).toBe('round');
    expect(b.angle).toBeNull();
    expect(b.x).toBeCloseTo(97.3, 1);
    expect(b.y).toBeCloseTo(88.8, 1);
    expect(Math.abs(b.length - 80)).toBeLessThan(0.2);
    expect(b.width).toBe(b.length);
  });

  it('is not misled by a hole or an engraving in the blank', () => {
    // A key tag: 120 × 50 with a Ø 12 hole near its left end and a dark line across.
    const gray = picture(220, 140, [{ rect: [110, 70, 120, 50, -8] }], {
      holes: [{ disc: [62, 63, 6] }, { rect: [125, 72, 60, 3, -8] }],
    });
    const b = only(findBlanks(gray, 220, 140));
    expect(b.kind).toBe('rect');
    expect(b.x).toBeCloseTo(110, 1);
    expect(b.y).toBeCloseTo(70, 1);
    expect(b.angle).toBeCloseTo(-8, 1);
  });

  it('takes rounded corners for what they are', () => {
    const gray = picture(220, 160, [{ rect: [110, 80, 140, 80, 33], round: 12 }]);
    const b = only(findBlanks(gray, 220, 160));
    expect(b.kind).toBe('rect');
    expect(b.angle).toBeCloseTo(33, 1);
    expect(Math.abs(b.length - 140)).toBeLessThan(0.3);
    expect(Math.abs(b.width - 80)).toBeLessThan(0.3);
  });

  it('finds dark blanks on a light table as well', () => {
    const gray = picture(220, 160, [{ rect: [110, 80, 100, 60, -15] }], { table: 200, blank: 80 });
    const b = only(findBlanks(gray, 220, 160));
    expect(b.kind).toBe('rect');
    expect(b.angle).toBeCloseTo(-15, 1);
    expect(b.x).toBeCloseTo(110, 1);
  });

  it('keeps other compact shapes, with a direction only when they are long', () => {
    // A regular hexagon (no direction) and a long triangle-ish wedge.
    const hexagon = Array.from({ length: 6 }, (_, k): [number, number] => [
      100 + 50 * Math.cos((k * Math.PI) / 3),
      90 + 50 * Math.sin((k * Math.PI) / 3),
    ]);
    const hex = only(findBlanks(picture(200, 180, [{ poly: hexagon }]), 200, 180));
    expect(hex.kind).toBe('other');
    expect(hex.angle).toBeNull();
    expect(hex.x).toBeCloseTo(100, 0);
    expect(hex.y).toBeCloseTo(90, 0);
    const wedge = only(
      findBlanks(
        picture(260, 140, [
          {
            poly: [
              [30, 50],
              [230, 60],
              [230, 90],
              [30, 100],
            ],
          },
        ]),
        260,
        140,
      ),
    );
    expect(wedge.kind).toBe('other');
    expect(Math.abs(wedge.angle!)).toBeLessThan(4);
    expect(wedge.length).toBeGreaterThan(195);
  });

  it('refuses two blanks that touch, and says so', () => {
    // The corner of the upper one pokes into the top edge of the lower one.
    const gray = picture(260, 220, [
      { rect: [120, 150, 140, 60, 0] },
      { rect: [150, 78, 140, 60, 20] },
    ]);
    const found = findBlanks(gray, 260, 220);
    expect(found.blanks).toEqual([]);
    expect(found.rejected.map((r) => r.reason)).toEqual(['touching']);
    // The outline shown is around both.
    const xs = found.rejected[0]!.outline.map((p) => p.x);
    expect(Math.min(...xs)).toBeLessThan(55);
    expect(Math.max(...xs)).toBeGreaterThan(215);
  });

  it('refuses two blanks side by side with a narrow gap between them that does not go through', () => {
    // Two 100 × 50 boards edge to edge; the dark gap between them reaches 70 % of the way.
    const gray = picture(260, 180, [{ rect: [130, 90, 200, 50, 0] }], {
      holes: [{ rect: [130, 82.5, 3, 35, 0] }],
    });
    const found = findBlanks(gray, 260, 180);
    expect(found.blanks).toEqual([]);
    expect(found.rejected.map((r) => r.reason)).toEqual(['touching']);
  });

  it('refuses what the picture cuts off', () => {
    const gray = picture(200, 160, [
      { rect: [10, 80, 100, 60, 10] },
      { rect: [130, 80, 80, 50, -20] },
    ]);
    const found = findBlanks(gray, 200, 160);
    expect(found.blanks).toHaveLength(1);
    expect(found.blanks[0]!.x).toBeCloseTo(130, 1);
    expect(found.rejected.map((r) => r.reason)).toEqual(['border']);
  });

  it('refuses what ends where the photo map has no picture', () => {
    const gray = picture(200, 160, [{ rect: [100, 80, 120, 60, 0] }]);
    // No picture right of x = 150: the blank runs into the gap.
    const valid = new Uint8Array(200 * 160).fill(1);
    for (let y = 0; y < 160; y++) for (let x = 150; x < 200; x++) valid[y * 200 + x] = 0;
    const found = findBlanks(gray, 200, 160, { valid });
    expect(found.blanks).toEqual([]);
    expect(found.rejected.map((r) => r.reason)).toEqual(['border']);
    // With the gap far from the blank it is found as ever.
    const far = new Uint8Array(200 * 160).fill(1);
    for (let y = 0; y < 160; y++) for (let x = 185; x < 200; x++) far[y * 200 + x] = 0;
    expect(only(findBlanks(gray, 200, 160, { valid: far })).kind).toBe('rect');
    // No picture at all: nothing to find.
    expect(findBlanks(gray, 200, 160, { valid: new Uint8Array(200 * 160) }).flat).toBe(true);
  });

  it('finds nothing on a picture without two clear tones', () => {
    expect(findBlanks(new Uint8Array(100 * 80).fill(140), 100, 80).flat).toBe(true);
    // A blank barely lighter than the table: 20 grey levels.
    const dim = picture(200, 160, [{ rect: [100, 80, 100, 60, 0] }], { table: 120, blank: 140 });
    const found = findBlanks(dim, 200, 160);
    expect(found.flat).toBe(true);
    expect(found.blanks).toEqual([]);
  });

  it('refuses a blank whose border is unclear where it lies', () => {
    // The light falls unevenly: the table is dark on the left (90) and lighter on the right
    // (160). The left blank stands out by about 100 grey levels, the right one by about 60 –
    // too little when 65 are asked for.
    const shapes: Shape[] = [{ rect: [90, 100, 100, 60, 5] }, { rect: [310, 100, 100, 60, 5] }];
    const mask = picture(400, 200, shapes, { table: 0, blank: 255 });
    const gray = mask.map((v, i) => {
      const table = 90 + (70 * (i % 400)) / 400;
      return Math.round(table + ((205 - table) * v) / 255);
    });
    const found = findBlanks(gray, 400, 200, { minContrast: 65 });
    expect(found.blanks).toHaveLength(1);
    expect(found.blanks[0]!.x).toBeCloseTo(90, 0);
    expect(found.rejected.map((r) => r.reason)).toEqual(['faint']);
    expect(found.rejected[0]!.x).toBeCloseTo(310, 0);
  });

  it('is not put off by camera noise or by a fibre across the edge', () => {
    const gray = picture(240, 170, [{ rect: [120.3, 80.6, 100, 60, 25] }], {
      // A dark fibre one pixel wide running 25 px into the blank from its lower edge.
      holes: [{ rect: [120, 100, 1, 50, 115] }],
    });
    // Noise of ± 10 grey levels, the same on every run.
    let seed = 12345;
    const noisy = gray.map((v) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return Math.max(0, Math.min(255, v + Math.round((seed / 4294967296 - 0.5) * 20)));
    });
    const found = findBlanks(noisy, 240, 170);
    expect(found.rejected).toEqual([]);
    const b = only(found);
    expect(b.kind).toBe('rect');
    expect(Math.hypot(b.x - 120.3, b.y - 80.6)).toBeLessThan(0.2);
    expect(Math.abs(b.angle! - 25)).toBeLessThan(0.15);
    expect(Math.abs(b.length - 100)).toBeLessThan(0.4);
  });

  it('ignores chips and specks, and several blanks come back each on its own', () => {
    const gray = picture(400, 240, [
      { rect: [80, 70, 100, 50, 30] },
      { disc: [220, 80, 35] },
      { rect: [320, 160, 90, 90, -10] },
      { disc: [150, 190, 4] },
      { rect: [40, 200, 14, 6, 40] },
    ]);
    const found = findBlanks(gray, 400, 240, { minSide: 24 });
    expect(found.rejected).toEqual([]);
    expect(found.blanks.map((b) => b.kind).sort()).toEqual(['rect', 'round', 'square']);
    const rect = found.blanks.find((b) => b.kind === 'rect')!;
    expect(rect.angle).toBeCloseTo(30, 1);
    const square = found.blanks.find((b) => b.kind === 'square')!;
    expect(square.angle).toBeCloseTo(-10, 1);
  });
});

describe('hull and box', () => {
  it('wraps points and lays the smallest rectangle around them', () => {
    const hull = convexHull([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 2 },
      { x: 0, y: 2 },
      { x: 2, y: 1 },
      { x: 1, y: 1 },
    ]);
    expect(hull).toHaveLength(4);
    const box = smallestBox(hull);
    expect(box).toMatchObject({ x: 2, y: 1, a: 2, b: 1 });
    expect(Math.abs(box.ux)).toBeCloseTo(1, 9);
    expect(convexHull([{ x: 1, y: 1 }])).toHaveLength(1);
    expect(smallestBox([{ x: 3, y: 4 }])).toMatchObject({ x: 3, y: 4, a: 0, b: 0 });
  });
});
