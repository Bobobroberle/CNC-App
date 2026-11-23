import { nestingDepths, type Contour } from './geometry';
import type { Operation, Tabs } from './toolpath';

/**
 * Sensible first choices, like Estlcam: the outline of a part is cut
 * outside with tabs, holes and cut-outs in it inside, round holes that fit
 * the cutter drilled, open lines engraved.
 */
export function defaultOperations(
  contours: readonly Contour[],
  toolDiameter: number,
  tabs: Tabs,
): Operation[] {
  const depths = nestingDepths(contours);
  return contours.map((c, i) => {
    if (!c.closed) return { contour: i, kind: 'on' };
    if (c.circle && c.circle.r * 2 <= toolDiameter * 1.2 && depths[i]! % 2 === 1) {
      return { contour: i, kind: 'drill' };
    }
    if (depths[i]! % 2 === 1) return { contour: i, kind: 'inside' };
    return { contour: i, kind: 'outside', tabs };
  });
}
