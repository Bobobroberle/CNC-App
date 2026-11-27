import {
  DEFAULT_FONT,
  FONT_IDS,
  isFontId,
  textContours,
  type AnySketch,
  type FontId,
} from '@lowrider/cam';

/**
 * The face of a text as the drawing keeps it. The standard face is the absence of the key – one spelling for it, so
 * the JSON of a text that was never given a face, of one that was given the standard face and of one read from a file
 * is the same – and any other face is the last key of the sketch. Nothing else is touched: what is typed in the fields
 * stays as typed (`tidySketch` would bring the measures into their ranges, which a field must not do under a finger).
 */
export function canonicalFace<T extends AnySketch>(sketch: T): T {
  if (sketch.type !== 'text') return sketch;
  const { font, ...rest } = sketch;
  if (font === undefined) return sketch;
  return (isFontId(font) && font !== DEFAULT_FONT ? { ...rest, font } : rest) as T;
}

/** The face a text is set in: the standard one where the key is absent. */
export const faceOf = (s: { font?: FontId }): FontId => s.font ?? DEFAULT_FONT;

/** What words come to in one face. */
export interface TextCheck {
  /** How many strokes it engraves: none means nothing would be cut (every character is missing) */
  strokes: number;
  /** The characters this face has no glyph for – each leaves a gap */
  missing: string[];
  /**
   * The other faces that write every one of those characters (in the order of `FONT_IDS`): the way out. Empty where
   * nothing is missing, and where no other face has them all.
   */
  elsewhere: FontId[];
}

/**
 * What typed words come to in a face: read from the library's own layout (`textContours`), so the answer is the one
 * the program would have, never a second list of what a face can write. A face covers more or fewer characters
 * than another (the Hershey faces and "Modern" write `{ }`, the standard face does not), which is why the words
 * and the face chosen are looked at together.
 */
export function checkText(words: string, font: FontId): TextCheck {
  const here = textContours(words, { height: 10, font });
  if (here.missing.length === 0)
    return { strokes: here.contours.length, missing: [], elsewhere: [] };
  const elsewhere = FONT_IDS.filter((other) => {
    if (other === font) return false;
    const there = textContours(words, { height: 10, font: other }).missing;
    return here.missing.every((ch) => !there.includes(ch));
  });
  return { strokes: here.contours.length, missing: here.missing, elsewhere };
}
