import { describe, expect, it } from 'vitest';
import {
  decodeTag,
  isTagId,
  rotateCode,
  TAG_COUNT,
  TAG_DISTANCE,
  tagCells,
  tagCodes,
  tagPaper,
  tagPose,
  tagSvg,
} from '../src';

const ones = (v: number) => v.toString(2).replace(/0/g, '').length;
const bit = (row: number, column: number) => 1 << (row * 5 + column);

describe('the dictionary of tags', () => {
  const codes = tagCodes();

  it('is the same for ever: printed tags must stay readable', () => {
    expect(codes).toHaveLength(TAG_COUNT);
    expect(codes.slice(0, 4)).toEqual([8015154, 26261278, 30236457, 5045461]);
    expect(codes[47]).toBe(6489912);
    // All 48 in one number.
    expect(codes.reduce((s, v) => (s * 31 + v) % 1000000007, 7)).toBe(803029178);
    expect(tagCodes()).toEqual(codes);
  });

  it('keeps every two tags at least eight cells apart, however they are turned', () => {
    let closest = 25;
    for (let i = 0; i < codes.length; i++) {
      let turned = codes[i]!;
      for (let k = 0; k < 4; k++) {
        for (let j = 0; j < codes.length; j++) {
          // A tag against itself only when turned.
          if (i === j && k === 0) continue;
          closest = Math.min(closest, ones(codes[j]! ^ turned));
        }
        turned = rotateCode(turned);
      }
    }
    expect(closest).toBeGreaterThanOrEqual(TAG_DISTANCE);
    expect(closest).toBe(8);
  });

  it('makes tags about half dark', () => {
    for (const code of codes) {
      expect(ones(code)).toBeGreaterThanOrEqual(10);
      expect(ones(code)).toBeLessThanOrEqual(15);
    }
  });

  it('turns a code clockwise as seen', () => {
    // The cell top left goes to the top right, on to the bottom right, the bottom left and back.
    expect(rotateCode(bit(0, 0))).toBe(bit(0, 4));
    expect(rotateCode(bit(0, 4))).toBe(bit(4, 4));
    expect(rotateCode(bit(4, 4))).toBe(bit(4, 0));
    expect(rotateCode(bit(4, 0))).toBe(bit(0, 0));
    // The second cell of the top row goes to the second row at the right edge.
    expect(rotateCode(bit(0, 1))).toBe(bit(1, 4));
    expect(rotateCode(bit(2, 2))).toBe(bit(2, 2));
    for (const code of codes) {
      expect(rotateCode(rotateCode(rotateCode(rotateCode(code))))).toBe(code);
    }
  });

  it('gives the cells of a tag as printed', () => {
    const rows = tagCells(1)!.map((row) => row.map((dark) => (dark ? '#' : '.')).join(''));
    expect(rows).toEqual(['.#..#', '#..#.', '##..#', '..#.#', '###..']);
    expect(tagCells(0)).toBeNull();
    expect(tagCells(49)).toBeNull();
    expect(tagCells(1.5)).toBeNull();
    expect(isTagId(48)).toBe(true);
    expect(isTagId('1')).toBe(false);
  });
});

describe('reading a tag', () => {
  const codes = tagCodes();

  it('finds the tag and how it is turned', () => {
    expect(decodeTag(codes[0]!)).toEqual({ id: 1, turns: 0, errors: 0 });
    let turned = codes[16]!;
    for (const turns of [1, 2, 3] as const) {
      turned = rotateCode(turned);
      expect(decodeTag(turned)).toEqual({ id: 17, turns, errors: 0 });
    }
  });

  it('forgives one wrong cell and no more', () => {
    expect(decodeTag(codes[4]! ^ bit(3, 1))).toEqual({ id: 5, turns: 0, errors: 1 });
    expect(decodeTag(rotateCode(codes[4]!) ^ bit(0, 0))).toEqual({ id: 5, turns: 1, errors: 1 });
    expect(decodeTag(codes[4]! ^ bit(3, 1) ^ bit(0, 2))).toBeNull();
    expect(decodeTag(codes[4]! ^ bit(3, 1), 0)).toBeNull();
    // With more forgiveness the nearest code still wins.
    expect(decodeTag(codes[4]! ^ bit(3, 1) ^ bit(0, 2), 3)).toEqual({ id: 5, turns: 0, errors: 2 });
    expect(decodeTag(codes[9]! ^ bit(1, 1), 25)).toEqual({ id: 10, turns: 0, errors: 1 });
    expect(decodeTag(0)).toBeNull();
    expect(decodeTag((1 << 25) - 1)).toBeNull();
  });
});

describe('a tag to print', () => {
  it('is drawn in exact millimetres with a white module around it', () => {
    expect(tagPaper(40)).toBeCloseTo(51.4286, 4);
    const svg = tagSvg(1, 40);
    expect(svg).toContain('width="51.429mm" height="51.429mm" viewBox="0 0 51.429 51.429"');
    // The dark square starts one module in and is 40 mm wide; its inside is 5 modules.
    expect(svg).toContain('M5.714 5.714h40v40h-40z');
    expect(svg).toContain('M11.429 11.429h28.571v28.571h-28.571z');
    // The first dark cell of tag 1 is the second of the top row.
    expect(svg).toContain('M17.143 11.429h5.714v5.714h-5.714z');
    // Border ring (two squares) and one square per dark cell.
    const dark = tagCells(1)!.flat().filter(Boolean).length;
    expect(svg.match(/h-5\.714z/g)).toHaveLength(dark);
    expect(svg).not.toContain('<text');
  });

  it('prints its number and a name below, whatever the name contains', () => {
    const svg = tagSvg(7, 20, ['Marker 7 · 20 mm', 'Rahmen <A> & "B"']);
    expect(svg).toContain('Marker 7 · 20 mm</text>');
    expect(svg).toContain('Rahmen &lt;A&gt; &amp; &quot;B&quot;</text>');
    // 20 mm tag: paper 25.714, two lines of 2.4 mm text below with 2 mm of room.
    expect(svg).toContain('width="25.714mm" height="33.954mm"');
    // A large tag gets larger text, up to 4 mm.
    expect(tagSvg(7, 60, ['x'])).toContain('font-size="4"');
    expect(tagSvg(7, 30, ['x'])).toContain('font-size="3"');
  });

  it('is empty for a number that is no tag', () => {
    expect(tagSvg(0, 40)).toBe('');
  });
});

describe('the pose of a tag from its corners', () => {
  it('takes the middle and the direction of its top edge', () => {
    // 40 mm, upright, middle at (100, 50); y up: top left is up and left.
    const upright = tagPose([
      { x: 80, y: 70 },
      { x: 120, y: 70 },
      { x: 120, y: 30 },
      { x: 80, y: 30 },
    ]);
    expect(upright).toEqual({ x: 100, y: 50, angle: 0, size: 40 });
  });

  it('follows a tag turned by a quarter, a half and a little', () => {
    // A quarter turn counter-clockwise: the printed top left corner is now bottom left.
    const quarter = tagPose([
      { x: 80, y: 30 },
      { x: 80, y: 70 },
      { x: 120, y: 70 },
      { x: 120, y: 30 },
    ]);
    expect(quarter.angle).toBeCloseTo(90, 9);
    const half = tagPose([
      { x: 120, y: 30 },
      { x: 80, y: 30 },
      { x: 80, y: 70 },
      { x: 120, y: 70 },
    ]);
    expect(half.angle).toBeCloseTo(180, 9);
    // Turned by −30° about (0, 0), 20 mm: the top right corner (10, 10) goes to (13.66, 3.66).
    const c = Math.cos(-Math.PI / 6);
    const s = Math.sin(-Math.PI / 6);
    const at = (x: number, y: number) => ({ x: c * x - s * y, y: s * x + c * y });
    const tilted = tagPose([at(-10, 10), at(10, 10), at(10, -10), at(-10, -10)]);
    expect(at(10, 10).x).toBeCloseTo(13.66, 2);
    expect(tilted.angle).toBeCloseTo(-30, 9);
    expect(tilted.size).toBeCloseTo(20, 9);
    expect(tilted.x).toBeCloseTo(0, 9);
  });

  it('shares out the error of one corner', () => {
    // One corner 0.4 mm off along the edge: the angle moves by a quarter of what that corner says.
    const pose = tagPose([
      { x: 80, y: 70 },
      { x: 120, y: 70.4 },
      { x: 120, y: 30 },
      { x: 80, y: 30 },
    ]);
    // Around the middle (100, 50.1) the sums are 0.4 (cross) and 160.4 (dot): atan2 = 0.1429°,
    // a quarter of the 0.573° the top edge alone would say.
    expect(pose.angle).toBeCloseTo((Math.atan2(8, 3208) * 180) / Math.PI, 6);
    expect(pose.angle).toBeCloseTo(0.1429, 3);
    expect(pose.y).toBeCloseTo(50.1, 9);
  });
});
