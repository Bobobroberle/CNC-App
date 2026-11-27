import { nestingDepths, type Contour } from './geometry';
import type { Operation, Tabs } from './toolpath';

/**
 * Sensible first choices, like Estlcam: the outline of a part is cut
 * outside with tabs, holes and cut-outs in it inside, round holes that fit
 * the cutter drilled, open lines engraved.
 *
 * `toolDiameter` is one cutter's for all the contours, or – with several tools – a list of the diameters
 * each contour is cut with (the same places as `contours`; one that is missing counts as no cutter, so that
 * nothing is drilled). The operations carry no `tool`: whoever names the cutters sets `Operation.tool`.
 */
export function defaultOperations(
  contours: readonly Contour[],
  toolDiameter: number | readonly number[],
  tabs: Tabs,
): Operation[] {
  const depths = nestingDepths(contours);
  return contours.map((c, i) => {
    if (!c.closed) return { contour: i, kind: 'on' };
    const tool = typeof toolDiameter === 'number' ? toolDiameter : (toolDiameter[i] ?? 0);
    if (c.circle && c.circle.r * 2 <= tool * 1.2 && depths[i]! % 2 === 1) {
      return { contour: i, kind: 'drill' };
    }
    if (depths[i]! % 2 === 1) return { contour: i, kind: 'inside' };
    return { contour: i, kind: 'outside', tabs };
  });
}
