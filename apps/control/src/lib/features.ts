import type { ReadinessId } from './readiness';

/**
 * Functions the operator can hide because he rarely needs them (the cards stay in the app, only
 * their entry points go): a series on scattered blanks, jigs with printed tags, the macros.
 *
 * Not on the list, on purpose: turning a part over and cutting it in sections (their flow carries
 * readiness points that block the start – hiding them could leave a locked start without a way
 * to it) and the material (it is the source of the cutting values).
 */
export const FEATURES = ['series', 'jigs', 'macros'] as const;
export type FeatureId = (typeof FEATURES)[number];

/**
 * The point of the readiness list a flow stands at while it is under way. As long as it is there
 * the flow's entry points stay, hidden or not: its card is the way to what holds the start.
 * (Macros have no flow.)
 */
const UNDER_WAY: Record<FeatureId, ReadinessId | null> = {
  series: 'series',
  jigs: 'jig',
  macros: null,
};

/** The ids of a stored list that are functions, once each, in the order of `FEATURES`. */
export function validHiddenFeatures(value: unknown): FeatureId[] {
  if (!Array.isArray(value)) return [];
  return FEATURES.filter((id) => value.includes(id));
}

/** Whether a function shows: not hidden – or hidden but under way, which never disappears. */
export function featureShown(
  id: FeatureId,
  hidden: readonly FeatureId[],
  readiness: readonly { id: ReadinessId }[],
): boolean {
  if (!hidden.includes(id)) return true;
  const point = UNDER_WAY[id];
  return point !== null && readiness.some((item) => item.id === point);
}

/** Every function with whether it shows. */
export function shownFeatures(
  hidden: readonly FeatureId[],
  readiness: readonly { id: ReadinessId }[],
): Record<FeatureId, boolean> {
  return {
    series: featureShown('series', hidden, readiness),
    jigs: featureShown('jigs', hidden, readiness),
    macros: featureShown('macros', hidden, readiness),
  };
}

/** The list with a function put in or taken out (a hidden function is added once). */
export function withHidden(
  hidden: readonly FeatureId[],
  id: FeatureId,
  hide: boolean,
): FeatureId[] {
  return validHiddenFeatures(hide ? [...hidden, id] : hidden.filter((x) => x !== id));
}
