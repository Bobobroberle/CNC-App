import {
  magnifySketch,
  scaleSketch,
  SKETCH_LIMITS,
  tidySketch,
  type AnySketch,
} from '@lowrider/cam';

/**
 * Making a drawn shape larger or smaller by a handle or a typed size without a measure leaving its range.
 *
 * `magnifySketch` (the library) brings every measure into its range on its own, so a star made ten times
 * as large that is already at half the largest radius would get an outer radius of the limit and an inner one
 * of the limit as well – a polygon on one circle, no star. The five older types do that at their smallest
 * (0.5 mm) and always did; the four curved shapes would do it at both ends. The app keeps their proportions
 * instead: the factor itself is held to what every measure can take, so the shape simply stops growing (or
 * shrinking) where the first of its measures reaches its limit. Only these four types are handled here – for
 * every other type the library's own functions are called as they always were.
 */

/** The factors a shape can be magnified by: from the smallest to the largest. */
export interface ScaleRange {
  min: number;
  max: number;
}

const { radius } = SKETCH_LIMITS;

/** The range of a shape whose smallest and largest radius are given: both must stay inside `radius`. */
const keeping = (smallest: number, largest: number): ScaleRange => ({
  min: radius.min / smallest,
  max: radius.max / largest,
});

/**
 * The factors by which a shape of the four curved types can be magnified with every measure staying in its
 * range (so the proportions hold), judged by the shape as it is drawn (`tidySketch`: what was typed beyond a
 * range does not count). Always contains 1. Null for any other type: those are not held.
 */
export function magnifyRange(sketch: AnySketch): ScaleRange | null {
  const s = tidySketch(sketch);
  switch (s.type) {
    case 'ellipse':
      return keeping(Math.min(s.rx, s.ry), Math.max(s.rx, s.ry));
    case 'star':
      // (the inner radius is never larger than the outer one)
      return keeping(s.inner, s.outer);
    case 'gear':
      return keeping(s.root, s.outer);
    case 'spiral': {
      // One end may be 0; the larger one carries the shape
      const far = Math.max(s.start, s.end);
      return keeping(far, far);
    }
    default:
      return null;
  }
}

/** The factor `k`, brought into what every shape in `sketches` can take; `k` itself where none is held. */
export function holdFactor(sketches: readonly (AnySketch | undefined)[], k: number): number {
  let held = k;
  for (const sketch of sketches) {
    const range = sketch && magnifyRange(sketch);
    if (range) held = Math.min(range.max, Math.max(range.min, held));
  }
  return held;
}

/**
 * The sketch magnified `k` times as a whole (`k` already held by `holdFactor` where it has to be): a shape of
 * the four curved types from what is drawn (`tidySketch` – the measures that were typed beyond their range
 * would otherwise carry their excess along), every other type exactly as the library does it.
 */
export function magnified(sketch: AnySketch, k: number): AnySketch {
  return magnifySketch(magnifyRange(sketch) ? tidySketch(sketch) : sketch, k);
}

/**
 * A shape for a size handle or a typed size: the shape `kx` times as wide and `ky` times as high – as the
 * library's `scaleSketch` does it – except that a star, a gear and a spiral (one size only, `kx`) keep their
 * proportions at the ends of the range (`holdFactor`), where the library would squeeze their measures
 * one by one. An ellipse has two measures and takes each of them as the library does.
 */
export function scaledShape(sketch: AnySketch, kx: number, ky: number): AnySketch {
  if (sketch.type === 'star' || sketch.type === 'gear' || sketch.type === 'spiral') {
    return magnified(sketch, holdFactor([sketch], kx));
  }
  return scaleSketch(sketch, kx, ky);
}
