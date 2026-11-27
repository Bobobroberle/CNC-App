import { describe, expect, it } from 'vitest';
import {
  FONT_IDS,
  magnifySketch,
  scaleSketch,
  sketchContours,
  sketchTextOptions,
  textContours,
  tidySketch,
  validateSketch,
  type FontId,
  type Sketch,
} from '../src';

/** The face of a text sketch: `font` on the sketch, absent for the standard face. */

type Text = Sketch & { type: 'text' };
const text = (extra: object = {}): Text => ({
  type: 'text',
  text: 'Fräse',
  height: 12,
  spacing: 0,
  lineSpacing: 1.6,
  align: 'left',
  ...extra,
});

describe('the face of a text sketch', () => {
  it('has the standard face where the sketch has no font, and then nothing about it changes', () => {
    const plain = text();
    expect(tidySketch(plain)).toEqual(plain);
    expect(JSON.stringify(tidySketch(plain))).toBe(JSON.stringify(plain));
    expect('font' in tidySketch(plain)).toBe(false);
    expect(sketchTextOptions(plain)).toEqual({
      height: 12,
      spacing: 0,
      lineSpacing: 1.6,
      align: 'left',
    });
    expect('font' in sketchTextOptions(plain)).toBe(false);
    expect(sketchContours(plain).contours).toEqual(
      textContours('Fräse', { height: 12, spacing: 0, lineSpacing: 1.6, align: 'left' }).contours,
    );
  });

  it('drops the font where it is the default or no face at all: one spelling for the standard face', () => {
    expect(tidySketch(text({ font: 'standard' }))).toEqual(text());
    expect(JSON.stringify(tidySketch(text({ font: 'standard' })))).toBe(JSON.stringify(text()));
    expect(tidySketch(text({ font: undefined }))).toEqual(text());
    expect('font' in tidySketch(text({ font: undefined }))).toBe(false);
    expect(tidySketch(text({ font: 'nope' as FontId }))).toEqual(text());
  });

  it('keeps another face, last of the keys, and sets the text in it', () => {
    for (const font of ['simplex', 'script', 'modern'] as const) {
      const kept = tidySketch(text({ font, height: 0.1 }));
      expect(kept).toMatchObject({ font, height: 0.5 });
      expect(Object.keys(kept)).toEqual([
        'type',
        'text',
        'height',
        'spacing',
        'lineSpacing',
        'align',
        'font',
      ]);
      // a font written between the others is moved to the end: one order for the JSON
      expect(Object.keys(tidySketch({ ...text(), font } as Sketch)).at(-1)).toBe('font');
      expect(sketchTextOptions(text({ font }))).toEqual({
        height: 12,
        spacing: 0,
        lineSpacing: 1.6,
        align: 'left',
        font,
      });
      const set = sketchContours(text({ font }));
      expect(set.contours).toEqual(
        textContours('Fräse', { height: 12, spacing: 0, lineSpacing: 1.6, align: 'left', font })
          .contours,
      );
      expect(set.missing).toEqual([]);
      // not the standard face's strokes
      expect(set.contours).not.toEqual(sketchContours(text()).contours);
    }
  });

  it('names the characters the chosen face lacks', () => {
    expect(sketchContours(text({ text: 'A☺', font: 'script' })).missing).toEqual(['☺']);
  });

  it('keeps the face when the text is scaled or magnified', () => {
    for (const font of ['simplex', 'modern'] as const) {
      expect(scaleSketch(text({ font }), 2, 9)).toMatchObject({ font, height: 24 });
      expect(magnifySketch(text({ font }), 1.5)).toMatchObject({ font, height: 18 });
    }
    expect('font' in scaleSketch(text(), 2, 9)).toBe(false);
  });

  it('reads the face from a file, and refuses a sketch with a face it does not know', () => {
    for (const font of FONT_IDS.filter((f) => f !== 'standard')) {
      expect(validateSketch(text({ font }))).toEqual(text({ font }));
    }
    // 'standard' is valid, and written as no font
    expect(validateSketch(text({ font: 'standard' }))).toEqual(text());
    expect('font' in validateSketch(text({ font: 'standard' }))!).toBe(false);
    expect(validateSketch(text())).toEqual(text());
    expect(validateSketch(text({ font: undefined }))).toEqual(text());
    // like every other bad field it refuses the whole sketch (the item keeps its contours)
    for (const bad of ['Standard', 'serif', '', 7, null, true, ['simplex'], {}]) {
      expect(validateSketch(text({ font: bad }))).toBeNull();
    }
    // the other fields still count
    expect(validateSketch(text({ font: 'simplex', height: 0 }))).toBeNull();
    expect(validateSketch(text({ font: 'simplex', align: 'justify' }))).toBeNull();
  });
});
