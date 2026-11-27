import { FONT_IDS, textContours, type FontId, type Sketch } from '@lowrider/cam';
import { beforeEach, describe, expect, it } from 'vitest';
import { canonicalFace, checkText, faceOf } from '../src/lib/camText';
import { textBlockCentre, withText, type MotifPart } from '../src/lib/series';
import { useCam } from '../src/store/cam';
import { useFlip } from '../src/store/flip';
import { useJob } from '../src/store/job';
import { seriesMotif } from '../src/store/series';
import { useWorkshop } from '../src/store/workshop';

const cam = () => useCam.getState();
const items = () => cam().project!.items;
const program = () => useJob.getState().lines.join('\n');
const text = (): Sketch & { type: 'text' } => items()[0]!.sketch as Sketch & { type: 'text' };
const TEXT: Sketch = {
  type: 'text',
  text: 'Fräse',
  height: 12,
  spacing: 0,
  lineSpacing: 1.6,
  align: 'center',
};

function scene() {
  cam().close();
  cam().setPlacing(null);
  useJob.getState().unload();
  useFlip.getState().cancel();
  cam().setSettings({ toolId: 't2', depth: 6, allowance: 0, engraveDepth: 1 });
  useWorkshop.getState().setSetup({ stock: null, fixtures: [], fixtureFrame: 'machine' });
}

describe('the face of a text in the drawing', () => {
  beforeEach(scene);

  it('is the standard face where there is no key – and never written for it', () => {
    cam().addSketch(TEXT);
    expect('font' in text()).toBe(false);
    expect('font' in items()[0]!.textStyle!.options).toBe(false);
    // the face asked for as "standard" is the same thing: no key
    cam().setSketch(items()[0]!.id, { ...text(), font: 'standard' }, 'font');
    expect('font' in text()).toBe(false);
    expect(Object.keys(text())).toEqual([
      'type',
      'text',
      'height',
      'spacing',
      'lineSpacing',
      'align',
    ]);
    // addText with the standard face and with none make the same sketch
    cam().close();
    cam().addText('Fräse', { height: 12, align: 'center', font: 'standard' });
    const withFace = JSON.stringify(text());
    cam().close();
    cam().addText('Fräse', { height: 12, align: 'center' });
    expect(JSON.stringify(text())).toBe(withFace);
    expect(faceOf(text())).toBe('standard');
  });

  it('puts a face on the sketch and in the style a series sets other words by – as the last key', () => {
    cam().addText('Fräse', { height: 12, align: 'center', font: 'script' });
    expect(text().font).toBe('script');
    expect(Object.keys(text()).at(-1)).toBe('font');
    expect(items()[0]!.textStyle!.options.font).toBe('script');
    // the same text with the face changed later: the same sketch as one made in that face
    const direct = JSON.stringify(text());
    cam().close();
    cam().addSketch(TEXT);
    cam().setSketch(items()[0]!.id, { ...text(), font: 'script' }, 'font');
    expect(JSON.stringify(text())).toBe(direct);
  });

  it('changes the program, and is the program of before when the standard face is picked again', () => {
    cam().addSketch(TEXT);
    const standard = program();
    expect(standard).not.toBe('');
    const id = items()[0]!.id;
    const seen = new Set<string>([standard]);
    for (const font of FONT_IDS.filter((f) => f !== 'standard')) {
      cam().setSketch(id, { ...text(), font }, 'font');
      expect(text().font).toBe(font);
      // every face writes the letters its own way: another program
      expect(seen.has(program()), font).toBe(false);
      seen.add(program());
    }
    cam().setSketch(id, { ...text(), font: 'standard' }, 'font');
    expect(program()).toBe(standard);
    expect('font' in text()).toBe(false);
  });

  it('is one step of undo – and a second pick in a row is the same step, as for every other field', () => {
    cam().addSketch(TEXT);
    const id = items()[0]!.id;
    const steps = cam().past.length;
    const before = program();
    cam().setSketch(id, { ...text(), font: 'simplex' }, 'font');
    expect(cam().past.length).toBe(steps + 1);
    const simplex = program();
    cam().setSketch(id, { ...text(), font: 'modern' }, 'font');
    expect(cam().past.length).toBe(steps + 1);
    // typing the words is a field of its own: another step
    cam().setSketch(id, { ...text(), text: 'Nr. 1' }, 'text');
    expect(cam().past.length).toBe(steps + 2);
    cam().undo();
    expect(text().text).toBe('Fräse');
    expect(text().font).toBe('modern');
    cam().undo();
    expect('font' in text()).toBe(false);
    expect(program()).toBe(before);
    cam().redo();
    expect(text().font).toBe('modern');
    expect(program()).not.toBe(simplex);
    expect(program()).not.toBe(before);
  });

  it('keeps the place of the text where it is: a face change moves the text by the anchor, not sideways', () => {
    cam().addSketch(TEXT);
    const id = items()[0]!.id;
    const before = items()[0]!.placement;
    for (const font of FONT_IDS) {
      cam().setSketch(id, { ...text(), font }, 'font');
      expect(items()[0]!.placement).toEqual(before);
    }
  });

  it('refuses a face that has none of the words – and says nothing was changed', () => {
    // `{ }` are written by the Hershey faces and by Relief, not by the standard face
    cam().addText('{}', { height: 12, font: 'simplex' });
    const id = items()[0]!.id;
    const before = program();
    const steps = cam().past.length;
    const missing = cam().setSketch(id, { ...text(), font: 'standard' }, 'font');
    expect(missing).toEqual(['{', '}']);
    expect(text().font).toBe('simplex');
    expect(cam().past.length).toBe(steps);
    expect(program()).toBe(before);
  });

  it('treats a text with the standard face and one with none as the same twin', () => {
    cam().addSketch(TEXT);
    cam().addSketch({ ...TEXT, font: 'standard' });
    const [one, two] = items();
    // the second does not lie exactly on the first: it was put a little beside it, as a twin is
    expect(
      Math.hypot(two!.placement.e - one!.placement.e, two!.placement.f - one!.placement.f),
    ).toBeGreaterThan(0.5);
    // and both are written the same way
    expect(JSON.stringify(two!.sketch)).toBe(JSON.stringify(one!.sketch));
    // another face is no twin of it: it may stand on the same place
    cam().close();
    cam().addSketch(TEXT);
    cam().addSketch({ ...TEXT, font: 'script' });
    const [a, b] = items();
    expect(
      Math.hypot(b!.placement.e - a!.placement.e, b!.placement.f - a!.placement.f),
    ).toBeLessThan(0.5);
  });

  it('is copied with the text: duplicate, copy and paste, and an array', () => {
    cam().addText('Fräse', { height: 12, font: 'modern' });
    cam().select('all');
    cam().duplicate();
    expect(items()).toHaveLength(2);
    cam().select('all');
    cam().copy();
    cam().paste();
    expect(items()).toHaveLength(4);
    cam().select(items()[0]!.group);
    cam().array(2, 2, 10);
    expect(items().length).toBeGreaterThanOrEqual(7);
    for (const item of items()) {
      expect((item.sketch as Sketch & { type: 'text' }).font, `item ${item.id}`).toBe('modern');
      expect(item.textStyle!.options.font).toBe('modern');
    }
  });

  it('keeps the face when the text is scaled', () => {
    cam().addText('Fräse', { height: 12, font: 'script' });
    cam().select('all');
    cam().scale(2);
    expect(text().font).toBe('script');
    expect(text().height).toBe(24);
  });

  it('puts the same strokes on the table as the library lays out for that face', () => {
    for (const font of FONT_IDS) {
      cam().close();
      cam().addText('Größe 5', { height: 12, font });
      const made = textContours('Größe 5', { height: 12, font });
      expect(items()[0]!.source).toEqual(made.contours);
    }
  });
});

describe('what the words come to in a face', () => {
  it('says what is missing and which other face has it, from the library – not from a list', () => {
    // the standard face lacks `{ }`: nothing to cut at all; the Hershey faces and Relief write them
    expect(checkText('{}', 'standard')).toEqual({
      strokes: 0,
      missing: ['{', '}'],
      elsewhere: ['simplex', 'script', 'modern'],
    });
    expect(checkText('{}', 'simplex')).toEqual({ strokes: 6, missing: [], elsewhere: [] });
    // something that is cut and something that is not: the strokes of what is there, the gap named
    const some = checkText('A{☺', 'standard');
    expect(some.strokes).toBeGreaterThan(0);
    expect(some.missing).toEqual(['{', '☺']);
    // no face has a smiley, and one face that has `{` is not "a face with all of them"
    expect(some.elsewhere).toEqual([]);
    expect(checkText('A{', 'standard').elsewhere).toEqual(['simplex', 'script', 'modern']);
    // a face is never offered as the way out of itself
    for (const font of FONT_IDS) expect(checkText('☺', font).elsewhere).not.toContain(font);
  });

  it('pins what no face writes – the limits the README and the catalog name', () => {
    // read from the library's layout, one character at a time: each of these is a gap in all four faces
    const nowhere = [...'§©®™µ¿¡´ÆæŒœŁłÐðÞþαβγδΩДЖщ'];
    for (const font of FONT_IDS) {
      for (const ch of nowhere) {
        expect(textContours(ch, { height: 10, font }).missing, `${font}: ${ch}`).toEqual([ch]);
      }
    }
    // and what the Hershey faces and Relief write that the standard face does not: `{ } ` – in that order of faces
    for (const ch of ['{', '}', '`']) {
      expect(checkText(ch, 'standard').missing, ch).toEqual([ch]);
      for (const font of ['simplex', 'script', 'modern'] as const) {
        expect(checkText(ch, font).missing, `${font}: ${ch}`).toEqual([]);
      }
    }
    // what the Hershey faces lend from the standard face – and the dashes they write as the hyphen – is no gap
    for (const font of ['simplex', 'script'] as const) {
      expect(checkText('ß×„°€Øø–—Äé', font).missing, font).toEqual([]);
    }
  });

  it('puts the standard face down as no key and leaves everything else as typed', () => {
    const typed = { ...TEXT, height: 0.001, spacing: 5, font: 'standard' as FontId };
    expect(canonicalFace(typed)).toEqual({ ...TEXT, height: 0.001, spacing: 5 });
    expect('font' in canonicalFace(typed)).toBe(false);
    // a sketch without the key is the same object, not a copy
    expect(canonicalFace(TEXT)).toBe(TEXT);
    // another shape is none of its business
    const rect: Sketch = { type: 'rect', w: 1, h: 1, r: 0 };
    expect(canonicalFace(rect)).toBe(rect);
    // an id that is none is dropped (the library reads it as the standard face too)
    expect('font' in canonicalFace({ ...TEXT, font: 'serif' as FontId })).toBe(false);
    expect(canonicalFace({ ...TEXT, font: 'script' }).font).toBe('script');
  });
});

describe('a series sets the names in the face of the text', () => {
  beforeEach(scene);

  it('lets the face flow into every name – and reports what is missing per face', () => {
    cam().addText('Name', { height: 10, font: 'script', align: 'center' });
    const motif = seriesMotif();
    const target = motif.find((p) => p.text)!;
    expect(target.text!.options.font).toBe('script');
    const set = withText(motif, 'Anna');
    const made = set.parts.find((p) => p.text)!.contours;
    // set in the script face, not the standard one: other strokes than the standard face makes of the same name
    const inScript = textContours('Anna', {
      ...target.text!.options,
      align: 'center',
      vertical: 'middle',
      x: target.text!.centre.x,
      y: target.text!.centre.y,
      angle: 0,
    });
    const standardOptions = { ...target.text!.options };
    delete standardOptions.font;
    const inStandard = textContours('Anna', {
      ...standardOptions,
      align: 'center',
      vertical: 'middle',
      x: target.text!.centre.x,
      y: target.text!.centre.y,
      angle: 0,
    });
    expect(made).toHaveLength(inScript.contours.length);
    expect(inScript.contours).not.toEqual(inStandard.contours);
    // `{` is in the script face, not in the standard one
    expect(withText(motif, 'A{1}').missing).toEqual([]);
    cam().close();
    cam().addText('Name', { height: 10, align: 'center' });
    expect(withText(seriesMotif(), 'A{1}').missing).toEqual(['{', '}']);
  });

  it('keeps the middle of a block where the library centres it, in every face', () => {
    const lines = ['AH', 'Anna\nBen', 'Größe 5'];
    for (const font of FONT_IDS) {
      for (const align of ['left', 'center', 'right'] as const) {
        for (const words of lines) {
          const options = { height: 12, spacing: 0.1, lineSpacing: 1.5, align, font };
          const laid = textContours(words, options);
          const c = textBlockCentre(words, options, laid.width);
          const middle = textContours(words, { ...options, align: 'center', vertical: 'middle' });
          const shifted = laid.contours.map((k) =>
            k.points.map((p) => [p.x - c.x, p.y - c.y] as const),
          );
          expect(shifted.length, `${font} ${align}`).toBe(middle.contours.length);
          shifted.forEach((points, i) => {
            const want = middle.contours[i]!.points;
            expect(points.length).toBe(want.length);
            points.forEach(([x, y], k) => {
              // (the lines of a block are each set on the anchor by `align`: only one line lies where the
              // centred layout puts it – the height is the block's in any case)
              if (!words.includes('\n')) {
                expect(x, `${font} ${align} ${JSON.stringify(words)}`).toBeCloseTo(want[k]!.x, 6);
              }
              expect(y, `${font} ${align} ${JSON.stringify(words)}`).toBeCloseTo(want[k]!.y, 6);
            });
          });
        }
      }
    }
  });

  it('is built from the motif a text with a face has – a motif part is kept as it comes', () => {
    cam().addText('Name', { height: 10, font: 'modern' });
    const parts: MotifPart[] = seriesMotif();
    expect(parts.some((p) => p.text?.options.font === 'modern')).toBe(true);
  });
});
