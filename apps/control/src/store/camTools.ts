import { useMemo } from 'react';
import { diameterOfItem, planCutters, type CutterPlan } from '../lib/camTools';
import type { CamItem } from '../lib/camItems';
import { useCam } from './cam';
import { useWorkshop } from './workshop';

/**
 * The cutters of the drawing as a hook: which part is cut with which (`lib/camTools.ts` – the plan `generate` makes
 * the program from). What is drawn depends on it (the places of tabs kept off the corners are the cutter's, the
 * helix range is), so a picture must follow a choice of a part's cutter, of the drawing's, and an edit of any
 * of them in the tool list.
 */
export function useCamCutters(): CutterPlan {
  const items = useCam((s) => s.project?.items);
  const settings = useCam((s) => s.settings);
  const tools = useWorkshop((s) => s.tools);
  const spindle = useWorkshop((s) => s.settings.spindle);
  return useMemo(
    () => planCutters(items ?? [], settings, tools, spindle),
    [items, settings, tools, spindle],
  );
}

/** The diameter of the cutter a part is cut with now, mm, as a hook (see `useCamCutters`) */
export function useItemDiameter(item: Pick<CamItem, 'id'>): number {
  return diameterOfItem(useCamCutters(), item);
}
