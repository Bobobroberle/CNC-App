import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FONT,
  FONT_CHARACTERS,
  FONT_CREDITS,
  FONT_IDS,
  bounds,
  fontCharacters,
  isFontId,
  textContours,
  type Contour,
  type FaceData,
  type FontId,
  type Point,
  type TextLayout,
} from '../src';
import { MODERN } from '../src/fonts/modern';
import { SCRIPT } from '../src/fonts/script';
import { SIMPLEX } from '../src/fonts/simplex';

/**
 * The faces of text. Numbers marked "from the source" were read off the font data the faces are converted from
 * (the .jhf records of futural / scripts, the SVG paths of Relief SingleLine) with a second, independent script,
 * not with the converter: left and right of a Hershey record, `horiz-adv-x` and the path of a Relief glyph.
 * A text is set with `height` = the face's capital height, so that one mm is one glyph unit.
 */

const all = (contours: Contour[]) => contours.flatMap((c) => c.points);
const ys = (contours: Contour[]) => all(contours).map((p) => p.y);
const near = (p: Point, x: number, y: number, digits = 6) => {
  expect(p.x).toBeCloseTo(x, digits);
  expect(p.y).toBeCloseTo(y, digits);
};

const round = (v: number) => Math.round(v * 1e6) / 1e6;
/** A short hash of what a layout draws: any change of the data or the set-up shows. */
const digest = (t: TextLayout) =>
  createHash('sha256')
    .update(
      JSON.stringify([
        t.missing,
        round(t.width),
        round(t.height),
        t.contours.map((c) => [c.closed, c.points.map((p) => [round(p.x), round(p.y)])]),
      ]),
    )
    .digest('hex')
    .slice(0, 16);

const SAMPLE = 'Fräse\nNr. 1: ÄÖÜ äöü ß € „x“ (a–z)';

/** What each face measures its capitals in. */
const CAP: Record<FontId, number> = { standard: 10, simplex: 21, script: 21, modern: 680 };
const set = (text: string, font: FontId, extra: object = {}) =>
  textContours(text, { height: CAP[font], font, ...extra });

describe('the choice of a face', () => {
  it('knows four faces, the standard one first and the default', () => {
    expect(FONT_IDS).toEqual(['standard', 'simplex', 'script', 'modern']);
    expect(DEFAULT_FONT).toBe('standard');
    for (const id of FONT_IDS) expect(isFontId(id)).toBe(true);
    for (const v of ['Standard', '', 'simple', 'toString', 'constructor', 0, null, undefined, {}]) {
      expect(isFontId(v)).toBe(false);
    }
  });

  it('keeps the standard face as it was: no font, the default and an unknown id are one and the same', () => {
    const plain = textContours(SAMPLE, { height: 10, align: 'center', angle: 20 });
    expect(
      textContours(SAMPLE, { height: 10, align: 'center', angle: 20, font: 'standard' }),
    ).toEqual(plain);
    // An id nobody knows (a file from a newer version, unchecked) is read as the default, never a crash.
    expect(
      textContours(SAMPLE, { height: 10, align: 'center', angle: 20, font: 'nope' as FontId }),
    ).toEqual(plain);
    expect(fontCharacters()).toEqual(FONT_CHARACTERS);
    expect(fontCharacters('standard')).toEqual(FONT_CHARACTERS);
    // The standard face's output is pinned: text drawn before the faces came is drawn the same now.
    expect(digest(textContours(SAMPLE, { height: 10 }))).toBe('dac424b4bb6a97bb');
  });

  it('has a notice for each face that needs one', () => {
    expect(FONT_CREDITS.standard).toBeNull();
    for (const id of ['simplex', 'script'] as const) {
      expect(FONT_CREDITS[id]).toContain('A. V. Hershey');
      expect(FONT_CREDITS[id]).toContain('James Hurt');
    }
    expect(FONT_CREDITS.modern).toContain(
      'Copyright 2022 The Relief SingleLine Project Authors (https://github.com/isdat-type/Relief-SingleLine)',
    );
    expect(FONT_CREDITS.modern).toContain('SIL Open Font License, Version 1.1');
    expect(FONT_CREDITS.modern).toContain('modified version');
  });
});

/** Whatever the data of a face has natively (the rest of a face is borrowed from the standard face). */
const DATA: Record<'simplex' | 'script' | 'modern', FaceData> = {
  simplex: SIMPLEX,
  script: SCRIPT,
  modern: MODERN,
};
const ASCII = Array.from({ length: 95 }, (_, k) => String.fromCharCode(32 + k)).join('');
/** The characters in order of their code points (an object lists digits first, whatever the order they were written in) */
const sorted = (chars: Iterable<string>) => [...chars].sort().join('');

describe('the characters of the faces', () => {
  it('pins the Hershey faces: all of ASCII, the two dotless letters, and what the standard face lends', () => {
    for (const id of ['simplex', 'script'] as const) {
      expect(sorted(Object.keys(DATA[id].glyphs))).toBe(sorted(`${ASCII}ıȷ`));
      // Lent by the standard face, scaled (in its order): ß · × „ ° € Ø ø. The en dash and the em dash are written as
      // the hyphen, the quotes and the ellipsis as the plain ones: they are not lent.
      expect(sorted(fontCharacters(id))).toBe(sorted(`${ASCII}ıȷß·×„°€Øø`));
      expect(fontCharacters(id)).toHaveLength(105);
    }
  });

  it('pins Relief SingleLine: all of ASCII, ß ẞ Ø ø · × ° € – — ‘ ’ “ ” ‚ „ … − and the two dotless letters', () => {
    expect(sorted(Object.keys(MODERN.glyphs))).toBe(sorted(`${ASCII}ßẞØø·×°€–—‘’“”‚„…−ıȷ`));
    // It lacks nothing the standard face has, so nothing is lent.
    expect(fontCharacters('modern')).toEqual(Object.keys(MODERN.glyphs));
    expect(fontCharacters('modern')).toHaveLength(115);
  });

  it('writes every character of the standard face in every face', () => {
    for (const id of FONT_IDS) {
      for (const ch of FONT_CHARACTERS) {
        expect(set(ch, id).missing).toEqual([]);
        if (ch !== ' ') expect(set(ch, id).contours.length).toBeGreaterThan(0);
      }
    }
  });

  it('writes the accented letters of the standard face from the letter and a mark, in every face', () => {
    for (const id of FONT_IDS) {
      for (const ch of 'ÄÖÜäöüéèçñÅåčàâãï') expect(set(ch, id).missing).toEqual([]);
    }
  });

  it('writes a tab and a no-break space as a blank, in every face', () => {
    for (const id of FONT_IDS) {
      for (const blank of ['\t', '\u00a0']) {
        const t = set(`I${blank}I`, id);
        expect(t.missing).toEqual([]);
        expect(t.contours).toEqual(set('I I', id).contours);
      }
    }
  });

  it('says what a face cannot write and leaves a blank for it, as the standard face does', () => {
    for (const id of FONT_IDS) {
      // ☺ is in no face; Æ and Ł are in the fonts but were left out (the standard face lacks them too).
      for (const ch of '☺ÆŁ') expect(set(ch, id).missing).toEqual([ch]);
      expect(set('I☺I', id).missing).toEqual(['☺']);
    }
    // I is 8 wide (the ink 4 to 4) and a blank is 16 wide: the second I stands 8 + 16 further on.
    const gap = set('I☺I', 'simplex').contours;
    expect(gap.map((c) => c.points[0]!.x)).toEqual([0, 24]);
    // Relief: I is 280, a blank 320.
    expect(set('I☺I', 'modern').contours.map((c) => c.points[0]!.x)).toEqual([0, 600]);
  });
});

describe('the dimensions of the faces', () => {
  // face: [capitals, x-height, descender of g, the H's width and its ink] – all from the source
  const FACE = {
    simplex: { cap: 21, x: 14, g: -7 },
    script: { cap: 21, x: 9, g: -12 },
    modern: { cap: 680, x: 555, g: -190 },
  } as const;

  for (const id of ['simplex', 'script', 'modern'] as const) {
    describe(id, () => {
      it('keeps `height` the height of the capitals, and measures the x-height and the descender', () => {
        expect(DATA[id].cap).toBe(FACE[id].cap);
        expect(DATA[id].small).toBe(FACE[id].x);
        const h = bounds(all(set('H', id).contours));
        expect(h.minY).toBeCloseTo(0, 9);
        expect(h.maxY).toBeCloseTo(FACE[id].cap, 9);
        // At any other height everything scales: 20 mm capitals.
        expect(bounds(all(textContours('H', { height: 20, font: id }).contours)).maxY).toBeCloseTo(
          20,
          9,
        );
        expect(bounds(all(set('x', id).contours)).maxY).toBeCloseTo(FACE[id].x, 1);
        const g = bounds(all(set('g', id).contours));
        expect(g.minY).toBeCloseTo(FACE[id].g, 1);
        // The x-height of the page: 10 mm capitals → a small letter is x/cap of that.
        expect(bounds(all(textContours('x', { height: 10, font: id }).contours)).maxY).toBeCloseTo(
          (10 * FACE[id].x) / FACE[id].cap,
          2,
        );
      });

      it('draws H, I, l and o as single lines: a handful of strokes, no outline', () => {
        // Strokes of H, I, l, o: from the source (Relief's I has a 2-unit stub in the font, taken out here).
        const strokes = { simplex: [3, 1, 1, 1], script: [2, 1, 1, 1], modern: [3, 1, 1, 1] }[id];
        expect(['H', 'I', 'l', 'o'].map((ch) => set(ch, id).contours.length)).toEqual(strokes);
        // Hershey's o is closed; the script's o has its tail and Relief's leaves a gap of 2 units (0.03 mm at 10 mm).
        expect(set('o', id).contours[0]!.closed).toBe(id === 'simplex');
        // No stroke without length: the tool would only plunge.
        for (const ch of fontCharacters(id)) {
          if (ch === ' ') continue;
          for (const c of set(ch, id).contours) expect(c.points.length).toBeGreaterThan(1);
        }
      });

      it('sets letters by their designed advance, and takes the ink to the anchor', () => {
        // [w of H, ink of H], [w of I, ink], [w of o, ink] from the source; the width of a line is the ink from the
        // left end of the first letter to the right end of the last.
        const w = {
          simplex: { II: 8, HH: 22 + 18 - 4, oo: 19 + 16 - 3 },
          script: { II: 17 + 14 - 1, HH: 24 + 24 - 1, oo: 14 + 14 - 0 },
          modern: { II: 280, HH: 706 + 566 - 140, oo: 592 + 502 - 90 },
        }[id];
        for (const pair of ['II', 'HH', 'oo'] as const) {
          // `II` etc. set at the face's capital height: mm = glyph units; Relief's tessellation is within 0.01.
          expect(set(pair, id).width).toBe(w[pair]);
          const box = bounds(all(set(pair, id).contours));
          expect(box.minX).toBeCloseTo(0, 1);
          expect(box.maxX - box.minX).toBeCloseTo(w[pair], 1);
        }
      });

      it('puts the ink of every glyph on the anchor and reports the ink as the width', () => {
        // At 68 mm capitals (Relief: one unit is 0.1 mm; the ink is rounded to whole units, 0.05 mm).
        const height = id === 'modern' ? 68 : 21;
        // (a glyph lent by the standard face has arcs, whose chords lie up to the tolerance, 0.01 mm, inside the ink, and ink
        // that differs from its advance by up to 0.07 of a unit there: the ink of a lent glyph is its advance)
        const slack = (ch: string) =>
          id === 'modern' ? 0.07 : Object.hasOwn(DATA[id].glyphs, ch) ? 1e-9 : 0.2;
        for (const ch of fontCharacters(id)) {
          if (ch === ' ') continue;
          for (const align of ['left', 'center', 'right'] as const) {
            const t = textContours(ch, { height, font: id, align });
            const b = bounds(all(t.contours));
            const left = { left: 0, center: -t.width / 2, right: -t.width }[align];
            expect(Math.abs(b.minX - left)).toBeLessThan(slack(ch));
            expect(Math.abs(b.maxX - b.minX - t.width)).toBeLessThan(slack(ch));
          }
        }
        // Several lines, centred: every line is set as it is alone (only lower by the line pitch).
        const two = textContours('Hi\nj', { height, font: id, align: 'center' });
        const first = textContours('Hi', { height, font: id, align: 'center' });
        const second = textContours('j', { height, font: id, align: 'center' });
        const xs = (cs: Contour[]) => cs.map((c) => c.points.map((p) => p.x));
        expect(two.contours.slice(0, first.contours.length)).toEqual(first.contours);
        expect(xs(two.contours.slice(first.contours.length))).toEqual(xs(second.contours));
        expect(two.width).toBe(first.width);
      });

      it('keeps a blank at the start or the end of a line as room, like the standard face', () => {
        // A blank counts with its whole advance (simplex and script 16, Relief 320), a letter with its ink.
        // ' I': the I (simplex w 8, ink 4–4; script w 17, ink 1–14; Relief w 280, ink 140–140) starts after the blank.
        const lead = set(' I', id);
        expect(bounds(all(lead.contours)).minX).toBeCloseTo(
          { simplex: 20, script: 17, modern: 460 }[id],
          1,
        );
        expect(lead.width).toBe({ simplex: 20, script: 30, modern: 460 }[id]);
        // 'I ': from the ink of the I to the end of the blank.
        expect(set('I ', id).width).toBe({ simplex: 20, script: 32, modern: 460 }[id]);
      });

      it('spreads the letters by `spacing` as a fraction of the capital height', () => {
        // Hershey I is 8 wide at 21 high: with spacing 0.1 the next stands 2.1 further; Relief I 280 at 680: 68.
        const first = set('II', id);
        const wide = set('II', id, { spacing: 0.1 });
        const dx = wide.contours[1]!.points[0]!.x - first.contours[1]!.points[0]!.x;
        expect(dx).toBeCloseTo(0.1 * CAP[id], 9);
        expect(wide.width - first.width).toBeCloseTo(0.1 * CAP[id], 9);
      });

      it('writes the umlauts with their marks lifted over capitals by what the face says', () => {
        // The marks of the Hershey faces are the standard face's, scaled and set over the face's own x-height; over a
        // capital they are lifted by the capitals minus the x-height. Relief has its own, lifted by 125 (not 135).
        const lift = { simplex: 21 - 14, script: 21 - 9, modern: 125 }[id];
        const dots = (ch: string, base: string) =>
          set(ch, id).contours.slice(set(base, id).contours.length);
        for (const [cap, small] of [
          ['Ä', 'ä'],
          ['Ö', 'ö'],
          ['Ü', 'ü'],
        ] as const) {
          const up = dots(cap, cap.normalize('NFD')[0]!);
          const low = dots(small, small.normalize('NFD')[0]!);
          expect(up).toHaveLength(2);
          expect(low).toHaveLength(2);
          expect(Math.min(...ys(up)) - Math.min(...ys(low))).toBeCloseTo(lift, 5);
          expect(Math.max(...ys(up)) - Math.max(...ys(low))).toBeCloseTo(lift, 5);
        }
        // And they are over the letter: the two dots lie symmetrically about the middle of its advance.
        const a = set('ä', id).contours;
        const [d1, d2] = a.slice(-2);
        const mid = (bounds(d1!.points).minX + bounds(d2!.points).maxX) / 2;
        const base = bounds(all(set('a', id).contours));
        expect(Math.abs(mid - (base.minX + base.maxX) / 2)).toBeLessThan(
          { simplex: 2, script: 2, modern: 20 }[id],
        );
      });

      it('lets the mark take the dot of i and j, hangs the cedilla below the baseline and closes the ring', () => {
        expect(set('i', id).contours).toHaveLength(2);
        expect(set('ï', id).contours).toHaveLength(3);
        expect(set('ĵ', id).contours).toHaveLength(2);
        const cedilla = set('ç', id).contours.at(-1)!;
        expect(bounds(cedilla.points).minY).toBeLessThan(0);
        expect(bounds(cedilla.points).maxY).toBeLessThanOrEqual(0.5);
        expect(set('å', id).contours.at(-1)!.closed).toBe(true);
        const ring =
          bounds(set('Å', id).contours.at(-1)!.points).minY -
          bounds(set('å', id).contours.at(-1)!.points).minY;
        expect(ring).toBeCloseTo({ simplex: 7, script: 12, modern: 125 }[id], 5);
      });

      it('writes the same letters the same way every time', () => {
        expect(set(SAMPLE, id)).toEqual(set(SAMPLE, id));
      });
    });
  }

  it('sets the Hershey script so that its letters meet', () => {
    // The last point of an a is where the next letter starts: an l, a j (drawn from the left of its cell), an n.
    const al = textContours('al', { height: 21, font: 'script' }).contours;
    expect(al).toHaveLength(2);
    near(al[0]!.points.at(-1)!, al[1]!.points[0]!.x, al[1]!.points[0]!.y);
    // at x = 16: the advance of a is 16, the l begins at its own x = 0
    near(al[0]!.points.at(-1)!, 16, 5);
  });

  it('lends the standard face its glyphs scaled to the capital height, with room at both sides', () => {
    // ß of the standard face: 5.5 wide and 10 + 0 high; in a face with capitals of 21 it is 11.55 wide.
    const ss = set('ß', 'simplex');
    expect(ss.width).toBeCloseTo(11.55, 9);
    const b = bounds(all(ss.contours));
    expect(b.minX).toBeCloseTo(0, 9);
    expect(b.maxX).toBeCloseTo(11.55, 2);
    expect(b.maxY).toBeCloseTo(21, 1);
    // and sits in an advance of 11.55 + 2 · 3 (the room a Hershey capital has at each side)
    const pair = set('ßI', 'simplex');
    expect(pair.contours.at(-1)!.points[0]!.x).toBeCloseTo(11.55 + 3 + 3 + 4 - 3, 9);
    expect(SIMPLEX.side).toBe(3);
  });

  it('writes the dashes and quotes the face lacks as the nearest it has, and uses its own where it has them', () => {
    const same = (a: string, b: string, id: FontId) =>
      expect(set(a, id).contours).toEqual(set(b, id).contours);
    for (const id of ['simplex', 'script'] as const) {
      same('–', '-', id);
      same('—', '-', id);
      same('−', '-', id);
      same('“x”', '"x"', id);
      same('‘x’', "'x'", id);
      same('‚', ',', id);
      same('…', '...', id);
      same('ẞ', 'SS', id);
      same('a\tb', 'a b', id);
      same('a\u00a0b', 'a b', id);
    }
    // Relief has its own, and they are not the plain ones.
    expect(set('–', 'modern').contours).not.toEqual(set('-', 'modern').contours);
    expect(set('—', 'modern').width).toBeGreaterThan(set('–', 'modern').width);
    expect(set('“', 'modern').contours).not.toEqual(set('"', 'modern').contours);
    expect(set('…', 'modern').contours).toHaveLength(3);
    expect(set('ẞ', 'modern').contours).not.toEqual(set('SS', 'modern').contours);
    // …but a tab and a no-break space are blanks, and so is the minus its hyphen.
    same('a\tb', 'a b', 'modern');
    same('a\u00a0b', 'a b', 'modern');
    // The minus sign is Relief's own, longer than its hyphen.
    expect(set('−', 'modern').width).toBeGreaterThan(set('-', 'modern').width);
  });

  it('draws an empty line as nothing', () => {
    for (const id of ['simplex', 'script', 'modern'] as const) {
      expect(set('', id)).toEqual({ contours: [], missing: [], width: 0, height: CAP[id] });
      expect(set('\n', id).contours).toEqual([]);
    }
  });

  it('keeps the data in order: only M L (and C in Relief), finite numbers, the ink inside the advance or the strokes', () => {
    const grammar = /^(?:[MLC](?:-?\d+(?:\.\d+)?)(?: -?\d+(?:\.\d+)?)*(?: |$))*$/;
    for (const [id, face] of Object.entries(DATA)) {
      for (const [ch, g] of Object.entries(face.glyphs)) {
        expect(g.d, `${id} ${ch}`).toMatch(grammar);
        if (id !== 'modern') expect(g.d).not.toContain('C');
        expect(Number.isFinite(g.w)).toBe(true);
        if (ch === ' ') {
          expect(g.d).toBe('');
          expect(g.ink).toBeUndefined();
        } else {
          expect(g.ink![0]).toBeLessThanOrEqual(g.ink![1]);
        }
      }
      for (const [m, mark] of Object.entries(face.marks ?? {})) {
        expect(mark.d, `${id} ${m}`).toMatch(grammar);
      }
      // The tall letters are letters of the face.
      for (const ch of face.tall) expect(face.glyphs[ch]).toBeDefined();
      expect(face.space).toBe(face.glyphs[' ']!.w);
    }
  });
});

describe('what a face draws is pinned', () => {
  // A hash of every point of the sample: a change of the data, the converter or the layout shows here and has to be
  // looked at (and the number taken over on purpose).
  const PINS: Record<FontId, string> = {
    standard: 'dac424b4bb6a97bb',
    simplex: '6cae5a98cf547da1',
    script: '7a109d4a35c0b0bb',
    modern: '9a8573575a86c1b4',
  };
  for (const id of FONT_IDS) {
    it(`draws the sample the same way: ${id}`, () => {
      expect(digest(textContours(SAMPLE, { height: 10, font: id }))).toBe(PINS[id]);
    });
  }
});
