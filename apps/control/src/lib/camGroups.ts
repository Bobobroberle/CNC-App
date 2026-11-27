import type { Tabs } from '@lowrider/cam';
import type { CamSettings } from '../store/cam';
import type { CamItem } from './camItems';
import { TAB_LIMITS } from './camTabs';

/**
 * Colour groups ("Farbgruppen") of the drawing: four colours A–D, a part has at most one, and a colour holds the
 * values its parts share – so a drawing of an outline, some pockets and an engraving is told once how deep each
 * kind is cut, in which direction and with which cutter instead of part by part.
 *
 * **A colour carries only what can already be "unset" on a part**: the depth of the cut and of an engraving, the
 * direction, the cutter and the defaults of the holding tabs (count, width, height). It carries not the kind of
 * cut, not the tabs on or off and not the relief (those are always concrete on a part), and not the order of the
 * cuts (how that would compose with the place a part was given by hand is open – Merkliste). A value is looked up
 * part > colour > drawing, and `effective` is the one function that does it: everything that makes a program or
 * draws or measures what it will cut asks it, so what is drawn is what is cut. A colour with no values changes
 * nothing – the program is the one of a drawing without colours, byte for byte.
 *
 * All of it is pure (no store): the items, the table and the drawing's settings go in.
 */

/** The colours, in the order the card lists them. More are not told apart under the guide's reserved colours. */
export const COLOR_IDS = ['a', 'b', 'c', 'd'] as const;
export type ColorId = (typeof COLOR_IDS)[number];

export const isColorId = (v: unknown): v is ColorId =>
  typeof v === 'string' && (COLOR_IDS as readonly string[]).includes(v);

/** What a colour sets for its parts; a key that is absent is left to the drawing */
export interface ColorValues {
  /** Depth of a cut that is no engraving (outside, inside, pocket, drill), mm */
  depth?: number;
  /** Depth of an engraving along a line (`kind: 'on'`), mm */
  engraveDepth?: number;
  /** Climb (true) or conventional (false) milling; the direction of a part that has one to choose */
  climb?: boolean;
  /** The cutter: an id of the tool list */
  toolId?: string;
  /** Defaults of the holding tabs of its parts that have them (the part's own spec still wins value by value) */
  tabs?: { count?: number; width?: number; height?: number };
}

/** The colours of a drawing by id – only the ones a part carries, and only what they set (nothing: no entry) */
export type ColorTable = Partial<Record<ColorId, ColorValues>>;

/** The ranges of a colour's numbers: the fields of the card and what a project file may hold */
export const COLOR_LIMITS = {
  depth: { min: 0.01, max: 500 },
  engraveDepth: { min: 0.01, max: 500 },
  count: TAB_LIMITS.count,
  width: TAB_LIMITS.width,
  height: TAB_LIMITS.height,
} as const;

/** The tab values a colour can set */
export type ColorTabKey = 'count' | 'width' | 'height';

/** A change of a colour's values: a key with `undefined` takes the value away (the drawing's again) */
export interface ColorPatch {
  depth?: number | undefined;
  engraveDepth?: number | undefined;
  climb?: boolean | undefined;
  toolId?: string | undefined;
  tabs?: { [K in ColorTabKey]?: number | undefined };
}

/** Where the value in force comes from: the part itself, its colour, or the drawing */
export type Source = 'part' | 'color' | 'drawing';

/** What a colour sets as the depth of a cut of this kind: its engraving depth for an engraving, else its depth */
const colorDepth = (own: ColorValues | undefined, kind: CamItem['kind']): number | undefined =>
  kind === 'on' ? own?.engraveDepth : own?.depth;

/** The parts a colour can be given: not a registration hole (there are two, drilled with the drawing's cutter) */
export const colorable = (item: Pick<CamItem, 'registration'>): boolean =>
  item.registration === undefined;

/** The colour of a part – never one for a registration hole */
export const colorOf = (item: Pick<CamItem, 'color' | 'registration'>): ColorId | undefined =>
  colorable(item) ? item.color : undefined;

/** What `effective` reads of a part */
export type EffectiveItem = Pick<
  CamItem,
  'kind' | 'depth' | 'climb' | 'toolId' | 'tabSpec' | 'color' | 'registration'
>;

/** What `effective` reads of the drawing */
export type EffectiveSettings = Pick<
  CamSettings,
  'depth' | 'engraveDepth' | 'climb' | 'toolId' | 'tabs'
>;

export interface Effective {
  /** The depth the part is cut to, mm: its own, its colour's or the drawing's – for the kind of cut it has */
  depth: number;
  /** What `depth` would be without the part's own value: the colour's or the drawing's (the placeholder of its field) */
  inherited: number;
  /** The depth of an engraving without a depth of its own: the colour's or the drawing's, mm */
  engraveDepth: number;
  /** Climb milling where the part has a direction to choose: its own, its colour's or the drawing's */
  climb: boolean;
  /** The tool-list id of the cutter: the part's own, its colour's or the drawing's */
  toolId: string;
  /**
   * The defaults of the part's holding tabs: the drawing's with the colour's count, width and height over them
   * (the part's own values go over these – `tabValues`). The drawing's `Tabs` itself where the colour sets none.
   */
  tabDefaults: Tabs;
  from: {
    depth: Source;
    engraveDepth: Exclude<Source, 'part'>;
    climb: Source;
    toolId: Source;
    count: Source;
    width: Source;
    height: Source;
  };
}

/**
 * The defaults of a part's holding tabs: the drawing's with the colour's count, width and height over them (the part's
 * own values go over these – `tabValues`); the drawing's `Tabs` itself where the colour sets none. `effective` asks
 * this; the table and the panel of a part's tabs, which need nothing else of it, may ask it alone.
 */
export function tabDefaultsOf(
  item: Pick<CamItem, 'color' | 'registration'>,
  colors: ColorTable | undefined,
  defaults: Tabs,
): Tabs {
  const id = colorOf(item);
  const tabs = id === undefined ? undefined : colors?.[id]?.tabs;
  const set = (['count', 'width', 'height'] as const).filter((k) => tabs?.[k] !== undefined);
  return set.length === 0
    ? defaults
    : { ...defaults, ...Object.fromEntries(set.map((k) => [k, tabs![k]])) };
}

/**
 * The values a part is cut with – part > colour > drawing for each of them. Pure; the same arguments, the same
 * answer. A colour that is not in the table (or has no value for it) is the drawing's, and so is any value of a
 * registration hole.
 */
export function effective(
  item: EffectiveItem,
  colors: ColorTable | undefined,
  settings: EffectiveSettings,
): Effective {
  const id = colorOf(item);
  const own = id === undefined ? undefined : colors?.[id];
  const fromColour = colorDepth(own, item.kind);
  const inherited = fromColour ?? (item.kind === 'on' ? settings.engraveDepth : settings.depth);
  const tabs = own?.tabs;
  const source = (mine: unknown, theirs: unknown): Source =>
    mine !== undefined ? 'part' : theirs !== undefined ? 'color' : 'drawing';
  return {
    depth: item.depth ?? inherited,
    inherited,
    engraveDepth: own?.engraveDepth ?? settings.engraveDepth,
    climb: item.climb ?? own?.climb ?? settings.climb,
    toolId: item.toolId ?? own?.toolId ?? settings.toolId,
    tabDefaults: tabDefaultsOf(item, colors, settings.tabs),
    from: {
      depth: source(item.depth, fromColour),
      engraveDepth: own?.engraveDepth !== undefined ? 'color' : 'drawing',
      climb: source(item.climb, own?.climb),
      toolId: source(item.toolId, own?.toolId),
      count: source(item.tabSpec?.count, tabs?.count),
      width: source(item.tabSpec?.width, tabs?.width),
      height: source(item.tabSpec?.height, tabs?.height),
    },
  };
}

/**
 * The depth the part or its colour sets explicitly, mm – undefined where the drawing's value is the one (the file
 * reader's bound for the number of passes asks this: it does not know the drawing's settings yet).
 */
export function ownedDepth(
  item: Pick<CamItem, 'kind' | 'depth' | 'color' | 'registration'>,
  colors: ColorTable | undefined,
): number | undefined {
  if (item.depth !== undefined) return item.depth;
  const id = colorOf(item);
  const own = id === undefined ? undefined : colors?.[id];
  return colorDepth(own, item.kind);
}

/** The colours some part carries, in the order of `COLOR_IDS` */
export function colorsInUse(items: readonly Pick<CamItem, 'color' | 'registration'>[]): ColorId[] {
  const used = new Set<ColorId>();
  for (const i of items) {
    const id = colorOf(i);
    if (id !== undefined) used.add(id);
  }
  return COLOR_IDS.filter((id) => used.has(id));
}

/** How many parts carry a colour, and how many of those the eye has hidden */
export function colorCount(
  items: readonly Pick<CamItem, 'color' | 'registration' | 'hidden'>[],
  id: ColorId,
): { parts: number; hidden: number } {
  let parts = 0;
  let hidden = 0;
  for (const i of items) {
    if (colorOf(i) !== id) continue;
    parts += 1;
    if (i.hidden === true) hidden += 1;
  }
  return { parts, hidden };
}

/** A colour's values with nothing in them that says anything: undefined – so no entry stays in the table */
function tidyValues(v: ColorValues): ColorValues | undefined {
  const out: ColorValues = {};
  if (v.depth !== undefined && Number.isFinite(v.depth)) out.depth = v.depth;
  if (v.engraveDepth !== undefined && Number.isFinite(v.engraveDepth)) {
    out.engraveDepth = v.engraveDepth;
  }
  if (typeof v.climb === 'boolean') out.climb = v.climb;
  if (typeof v.toolId === 'string' && v.toolId !== '') out.toolId = v.toolId;
  const tabs: NonNullable<ColorValues['tabs']> = {};
  for (const k of ['count', 'width', 'height'] as const) {
    const n = v.tabs?.[k];
    if (n !== undefined && Number.isFinite(n)) tabs[k] = n;
  }
  if (Object.keys(tabs).length > 0) out.tabs = tabs;
  return Object.keys(out).length > 0 ? out : undefined;
}

/** A table with no entry that says something is no table: undefined (the key is left off, as in an old file) */
export function tidyColors(table: ColorTable | undefined): ColorTable | undefined {
  if (!table) return undefined;
  const out: ColorTable = {};
  for (const id of COLOR_IDS) {
    const values = table[id] && tidyValues(table[id]!);
    if (values) out[id] = values;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * A typed number brought into the range of its field (the tab count into whole numbers); not a number: undefined,
 * the drawing's value again.
 */
export function clampColor(
  key: 'depth' | 'engraveDepth' | ColorTabKey,
  value: number | undefined,
): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  const { min, max } = COLOR_LIMITS[key];
  return Math.min(max, Math.max(min, key === 'count' ? Math.round(value) : value));
}

/**
 * The table with a colour's values changed: every number brought into its range, a key with `undefined` taken away,
 * an entry that says nothing left out. The same table (the object itself) where nothing changes.
 */
export function withColorValues(
  table: ColorTable | undefined,
  id: ColorId,
  patch: ColorPatch,
): ColorTable | undefined {
  const was = table?.[id] ?? {};
  const next: ColorValues = { ...was, tabs: was.tabs && { ...was.tabs } };
  for (const key of ['depth', 'engraveDepth'] as const) {
    if (key in patch) next[key] = clampColor(key, patch[key]);
  }
  if ('climb' in patch) next.climb = patch.climb;
  if ('toolId' in patch) next.toolId = patch.toolId;
  if (patch.tabs) {
    const tabs = { ...next.tabs };
    for (const key of ['count', 'width', 'height'] as const) {
      if (key in patch.tabs) tabs[key] = clampColor(key, patch.tabs[key]);
    }
    next.tabs = tabs;
  }
  const tidy = tidyValues(next);
  const rest = { ...table };
  delete rest[id];
  const out = tidyColors(tidy ? { ...rest, [id]: tidy } : rest);
  return JSON.stringify(out) === JSON.stringify(tidyColors(table)) ? table : out;
}

/**
 * The table without the colours no part carries (and without entries that say nothing): a colour that is not in
 * use has no values, so the card, the project file and the version it is written as always agree. The object
 * itself where nothing is left out.
 */
export function pruneColors(
  table: ColorTable | undefined,
  items: readonly Pick<CamItem, 'color' | 'registration'>[],
): ColorTable | undefined {
  if (!table) return undefined;
  const used = new Set(colorsInUse(items));
  const out: ColorTable = {};
  for (const id of COLOR_IDS) {
    const values = used.has(id) && table[id] ? tidyValues(table[id]!) : undefined;
    if (values) out[id] = values;
  }
  const kept = Object.keys(out).length > 0 ? out : undefined;
  return JSON.stringify(kept) === JSON.stringify(table) ? table : kept;
}
