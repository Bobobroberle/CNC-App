import { describe, expect, it } from 'vitest';
import { mapPixel } from '../src/lib/series';
import { findTags, squareMap, tagOnTable, type FoundTag } from '../src/lib/tagFinder';
import { drawnCorner, tagPicture, type DrawnTag } from './tagPicture';

// Pictures at 4 px per mm, like the photo map: a 40 mm tag is 160 px wide.
const MAP = { pxPerMm: 4 };

const only = (search: ReturnType<typeof findTags>): FoundTag => {
  expect(search.rejected).toEqual([]);
  expect(search.tags).toHaveLength(1);
  return search.tags[0]!;
};

function expectCorners(found: FoundTag, drawn: DrawnTag, within = 0.15) {
  found.corners.forEach((corner, i) => {
    const want = drawnCorner(drawn, i);
    expect(Math.hypot(corner.x - want.x, corner.y - want.y), `corner ${i}`).toBeLessThan(within);
  });
}

describe('finding a tag', () => {
  it('reads its number, its corners and its middle', () => {
    // The test pictures have four samples per pixel: places on quarter pixels are exact.
    const drawn = { id: 7, x: 150.25, y: 120.5, side: 160 };
    const found = only(findTags(tagPicture(300, 240, [drawn]), 300, 240, MAP));
    expect(found.id).toBe(7);
    expect(found.errors).toBe(0);
    expect(found.size).toBe(40);
    expect(found.measured).toBeCloseTo(40, 1);
    expect(found.contrast).toBeGreaterThan(200);
    // Top left as printed first: here also top left in the picture.
    expectCorners(found, drawn);
    expectCorners(found, drawn, 0.02);
    expect(found.corners[0].x).toBeCloseTo(70.25, 1);
    expect(found.corners[0].y).toBeCloseTo(40.5, 1);
    expect(Math.hypot(found.x - 150.25, found.y - 120.5)).toBeLessThan(0.02);
  });

  it('knows which way round it lies, at every quarter turn', () => {
    for (const id of [1, 30]) {
      for (const angle of [0, 90, 180, 270]) {
        const drawn = { id, x: 140, y: 130, side: 120, angle };
        const found = only(findTags(tagPicture(280, 260, [drawn]), 280, 260, MAP));
        expect(found.id).toBe(id);
        expect(found.size).toBe(30);
        // The corner printed top left: at 90° (counter-clockwise) it is bottom left in the picture.
        expectCorners(found, drawn);
      }
    }
    const quarter = { id: 1, x: 140, y: 130, side: 120, angle: 90 };
    const found = only(findTags(tagPicture(280, 260, [quarter]), 280, 260, MAP));
    expect(found.corners[0].x).toBeCloseTo(80, 0);
    expect(found.corners[0].y).toBeCloseTo(190, 0);
  });

  it('measures a tag lying at any angle, through grain', () => {
    for (const angle of [3, 17.3, -28, 45, 133.7, -161]) {
      const drawn = { id: 12, x: 151.7, y: 149.2, side: 160, angle };
      const gray = tagPicture(300, 300, [drawn], { noise: 10 });
      const found = only(findTags(gray, 300, 300, MAP));
      expect(found.id).toBe(12);
      expectCorners(found, drawn, 0.3);
      // On the table: the angle counts counter-clockwise with y up, as everywhere else.
      const table = tagOnTable(found, mapPixel(100, 500, 4));
      expect(table.angle).toBeCloseTo(angle, 0);
      expect(Math.abs(table.angle - angle)).toBeLessThan(0.15);
      expect(table.x).toBeCloseTo(100 + 151.7 / 4, 1);
      expect(table.y).toBeCloseTo(500 - 149.2 / 4, 1);
      expect(table.scale).toBeCloseTo(1, 2);
    }
  });

  it('finds every tag of a picture, small and large, light or dark around', () => {
    const tags = [
      { id: 2, x: 70, y: 70, side: 80, angle: 10 },
      { id: 3, x: 300, y: 130, side: 160, angle: -5 },
      { id: 4, x: 200, y: 420, side: 240, angle: 92 },
    ];
    for (const table of [60, 150, 215]) {
      const search = findTags(tagPicture(440, 600, tags, { table }), 440, 600, MAP);
      expect(search.rejected).toEqual([]);
      expect(search.tags.map((t) => [t.id, t.size]).sort()).toEqual([
        [2, 20],
        [3, 40],
        [4, 60],
      ]);
    }
  });

  it('reads the live picture too: 10 px per mm', () => {
    const drawn = { id: 44, x: 612.4, y: 431.8, side: 400, angle: 4 };
    const gray = tagPicture(1200, 900, [drawn], { noise: 6 });
    const found = only(findTags(gray, 1200, 900, { pxPerMm: 10 }));
    expect(found.id).toBe(44);
    expect(found.size).toBe(40);
    expectCorners(found, drawn, 0.3);
  });

  it('takes a tag seen at a small angle, and one cell read wrongly', () => {
    // The far edge about 2 % shorter than the near one: a camera tilted by a few degrees.
    const tilted = { id: 9, x: 150, y: 150, side: 160, keystone: 0.00012 };
    expect(only(findTags(tagPicture(300, 300, [tilted]), 300, 300, MAP)).id).toBe(9);
    // A speck on one cell.
    const speck = { id: 9, x: 150, y: 150, side: 160, wrong: [7] };
    const found = only(findTags(tagPicture(300, 300, [speck]), 300, 300, MAP));
    expect(found.id).toBe(9);
    expect(found.errors).toBe(1);
  });

  it('looks only for the sizes it is asked for', () => {
    const gray = tagPicture(300, 300, [{ id: 5, x: 150, y: 150, side: 160 }]);
    expect(findTags(gray, 300, 300, { pxPerMm: 4, sizes: [40] }).tags).toHaveLength(1);
    expect(findTags(gray, 300, 300, { pxPerMm: 4, sizes: [] })).toEqual({ tags: [], rejected: [] });
    expect(findTags(gray, 300, 300, { pxPerMm: 0 })).toEqual({ tags: [], rejected: [] });
    expect(findTags(new Uint8Array(4), 2, 2, MAP)).toEqual({ tags: [], rejected: [] });
  });
});

describe('what is not taken for a tag, and why', () => {
  const reasons = (search: ReturnType<typeof findTags>) => {
    expect(search.tags).toEqual([]);
    return search.rejected.map((r) => r.reason);
  };

  it('a size that is none of the print sizes: scaled by the printer, or the camera is not at its height', () => {
    // 35 mm: 12.5 % smaller than 40, 17 % larger than 30.
    const gray = tagPicture(300, 300, [{ id: 5, x: 150, y: 150, side: 140 }]);
    const search = findTags(gray, 300, 300, MAP);
    expect(reasons(search)).toEqual(['size']);
    expect(search.rejected[0]!.measured).toBeCloseTo(35, 1);
    // 8 % too large is still the 40 mm tag – the place is measured at the crosshair anyway.
    const near = tagPicture(340, 340, [{ id: 5, x: 170, y: 170, side: 172.8 }]);
    const found = only(findTags(near, 340, 340, MAP));
    expect(found.size).toBe(40);
    expect(found.measured).toBeCloseTo(43.2, 1);
  });

  it('cut off by the edge of the picture', () => {
    const gray = tagPicture(300, 300, [{ id: 5, x: 250, y: 150, side: 160 }]);
    expect(reasons(findTags(gray, 300, 300, MAP))).toEqual(['cut']);
    // All of the dark square is there, but its paper runs out of the picture.
    const close = tagPicture(300, 300, [{ id: 5, x: 214, y: 150, side: 160 }]);
    expect(reasons(findTags(close, 300, 300, MAP))).toEqual(['cut']);
  });

  it('cut off by a gap in the photo map', () => {
    const gray = tagPicture(300, 300, [{ id: 5, x: 150, y: 150, side: 160 }]);
    const valid = new Uint8Array(300 * 300).fill(1);
    for (let y = 0; y < 300; y++) for (let x = 190; x < 300; x++) valid[y * 300 + x] = 0;
    expect(reasons(findTags(gray, 300, 300, { ...MAP, valid }))).toEqual(['cut']);
    // A gap elsewhere does not matter.
    const far = new Uint8Array(300 * 300).fill(1);
    for (let y = 0; y < 300; y++) for (let x = 280; x < 300; x++) far[y * 300 + x] = 0;
    expect(findTags(gray, 300, 300, { ...MAP, valid: far }).tags).toHaveLength(1);
  });

  it('out of focus', () => {
    const gray = tagPicture(300, 300, [{ id: 5, x: 150, y: 150, side: 160 }], { blur: 6 });
    expect(reasons(findTags(gray, 300, 300, MAP))).toEqual(['blurred']);
    // A little soft is fine.
    const soft = tagPicture(300, 300, [{ id: 5, x: 150, y: 150, side: 160 }], { blur: 1 });
    expect(only(findTags(soft, 300, 300, MAP)).id).toBe(5);
  });

  it('ink barely darker than paper', () => {
    const gray = tagPicture(
      300,
      300,
      [{ id: 5, x: 150, y: 150, side: 160, ink: 125, paper: 180 }],
      {
        table: 170,
      },
    );
    expect(reasons(findTags(gray, 300, 300, MAP))).toEqual(['faint']);
  });

  it('not flat, or seen from the side', () => {
    const stretched = tagPicture(340, 300, [{ id: 5, x: 170, y: 150, side: 160, stretch: 1.09 }]);
    expect(reasons(findTags(stretched, 340, 300, MAP))).toEqual(['tilted']);
    const steep = tagPicture(300, 300, [{ id: 5, x: 150, y: 150, side: 160, keystone: 0.0008 }]);
    expect(reasons(findTags(steep, 300, 300, MAP))).toEqual(['tilted']);
  });

  it('cells that are no code of ours', () => {
    // Three cells wrong: nearer to no tag than one cell.
    const dirty = tagPicture(300, 300, [{ id: 5, x: 150, y: 150, side: 160, wrong: [0, 12, 24] }]);
    expect(reasons(findTags(dirty, 300, 300, MAP))).toEqual(['unreadable']);
    // A chequerboard looks the same after half a turn: no tag of ours does.
    const cells = [0, 1, 2, 3, 4].map((r) => [0, 1, 2, 3, 4].map((c) => (r + c) % 2 === 0));
    const other = tagPicture(300, 300, [{ id: 1, x: 150, y: 150, side: 160, cells }]);
    expect(reasons(findTags(other, 300, 300, MAP))).toEqual(['unreadable']);
  });

  it('passes over dark things that do not look like a tag at all', () => {
    const solid = [0, 1, 2, 3, 4].map(() => [true, true, true, true, true]);
    const gray = tagPicture(
      420,
      300,
      [
        // A black square on paper, a tag without paper around it on a dark table.
        { id: 1, x: 110, y: 150, side: 160, cells: solid },
        { id: 5, x: 310, y: 150, side: 160, quiet: 0 },
      ],
      { table: 60 },
    );
    expect(findTags(gray, 420, 300, MAP)).toEqual({ tags: [], rejected: [] });
    // An empty table, with grain.
    const empty = tagPicture(300, 300, [], { noise: 12 });
    expect(findTags(empty, 300, 300, MAP)).toEqual({ tags: [], rejected: [] });
  });
});

describe('the map onto four corners', () => {
  it('keeps a square a square and follows a tilt', () => {
    const map = squareMap([
      { x: 10, y: 20 },
      { x: 110, y: 20 },
      { x: 110, y: 120 },
      { x: 10, y: 120 },
    ]);
    expect(map(0.5, 0.5)).toEqual({ x: 60, y: 70 });
    expect(map(0.25, 1)).toEqual({ x: 35, y: 120 });
    // A trapezoid: the top edge half as long. The middle of the square lies nearer the long edge.
    const tilted = squareMap([
      { x: 25, y: 0 },
      { x: 75, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ]);
    expect(tilted(0, 0)).toEqual({ x: 25, y: 0 });
    expect(tilted(1, 1)).toEqual({ x: 100, y: 100 });
    const middle = tilted(0.5, 0.5);
    expect(middle.x).toBeCloseTo(50, 9);
    // The diagonals cut each other at a third of the height.
    expect(middle.y).toBeCloseTo(100 / 3, 9);
  });
});
