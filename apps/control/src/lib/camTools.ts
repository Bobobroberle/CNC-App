import type { CutSettings, OperationKind } from '@lowrider/cam';
import { toolOwnValues, type SpindleLimits, type Tool } from '@lowrider/workshop';
import type { CamSettings } from '../store/cam';
import type { CamItem } from './camItems';
import { itemTabMarks } from './camTabs';

/**
 * Which cutter each part of a drawing is cut with – the one place that says it. `generate` makes the program
 * from it, and everything that draws or measures what the program will cut (the places of the tabs, the helix
 * range, the gap of the nesting, the summary under "Ansehen und übergeben") asks the same plan, so what is
 * drawn is what is cut.
 *
 * A part names a cutter of the tool list (`CamItem.toolId`) or takes the drawing's (`settings.toolId`). With one
 * cutter in use the program is made exactly as it always was (no T word, one set of cutting values); with two or
 * more it is one program with a tool change between the runs of cutters (`toolpaths` with a list of
 * `ToolSettings`, `toGcode` with its blocks).
 */

/** What a drawing is cut with when its cutter is not in the tool list (any more), mm */
export const DEFAULT_TOOL = 6;

/**
 * The library models every cutter as a flat cylinder of its diameter: nothing in it reads a tool's kind or angle.
 * That is right for what a V-bit, a chamfer cutter, a ball cutter or a drill does along a line (engraving) or
 * straight down (drilling), and wrong for what they do beside it – cut a contour, clear a pocket – so those take
 * a flat cutter only.
 */
export const fitsKind = (tool: Pick<Tool, 'kind'>, kind: OperationKind): boolean =>
  tool.kind === 'flat' || kind === 'on' || kind === 'drill';

/**
 * What a cutter in the list has that a program with several tools cannot go without, or that the app cannot
 * tell the machine: why a part's own choice does not stand (the part is then cut with the drawing's cutter and
 * the note says so: `cut-differently`), or why no program can be made at all (`refused`).
 */
export type ToolNoteCode =
  /** the part's cutter is no longer in the list */
  | 'missing'
  /** the part's cutter is marked as a probe: it must never turn */
  | 'probe'
  /** the part's cutter is a V-bit, ball cutter … and the cut needs a flat one */
  | 'kind'
  /** a cutter's T number is not a whole number from 1: a program with several tools cannot name it */
  | 'number'
  /** a T number belongs to two tools of the list: the machine could not tell which is meant */
  | 'clash'
  /** the drawing's own cutter is gone from the list and parts are cut with it beside others: it has no T number */
  | 'gone';

export const TOOL_NOTE_EFFECT: Readonly<Record<ToolNoteCode, 'refused' | 'cut-differently'>> = {
  missing: 'cut-differently',
  probe: 'cut-differently',
  kind: 'cut-differently',
  number: 'refused',
  clash: 'refused',
  gone: 'refused',
};

export interface ToolNote {
  code: ToolNoteCode;
  /** The rows (0-based, in the list) it is about: the parts that use the cutter, or the part that asked for it */
  rows: number[];
  /** The cutter it names: its name – or, for a cutter that is gone, the id the part asked for */
  tool?: string;
  /** `clash`: the other tool with the number */
  other?: string;
  /** `number`, `clash`: the T number */
  number?: number;
}

/** A cutter that cuts in the program: what it cuts with and which parts it cuts */
export interface Cutter {
  /** The tool list's id (the drawing's own id where that tool is gone) */
  id: string;
  /** The tool of the list; null where the drawing's own is not in it (it is then cut as `DEFAULT_TOOL` mm, as ever) */
  tool: Tool | null;
  diameter: number;
  /** Spindle speed of its run, rpm */
  rpm: number;
  /** Everything it cuts with */
  cut: CutSettings;
  /** The cutter has values of its own that replace the drawing's (feed, plunge feed, stepdown, stepover, speed) */
  ownValues: boolean;
  /** The rows (0-based, in the list) of the parts it cuts */
  rows: number[];
}

export interface CutterPlan {
  /** The cutters of the parts that are cut (in sight, not "nicht fräsen"), in the order the list first names them */
  cutters: Cutter[];
  /** The drawing's own cutter – also where no part is cut, and for the registration holes */
  drawing: Cutter;
  /** Where in `cutters` the cutter of each part (by its id) stands; a part that is not cut has none */
  of: ReadonlyMap<number, number>;
  notes: ToolNote[];
  /** No program can be made: a note is `refused` */
  refused: boolean;
  /** A part is cut with another cutter than the drawing's: what series and two-sided jobs do not take */
  other: boolean;
}

/** The drawing's values a cutter's own replace – the part of `CamSettings` a plan reads */
export type PlanSettings = CamSettings;

/** A stepover in mm as the share of the cutter's diameter the drawing's field holds (0.01 … 1) */
export const stepoverShare = (mm: number, diameter: number, digits: number): number =>
  Math.min(1, Math.max(0.01, Number((mm / diameter).toFixed(digits))));

const cutterOf = (
  id: string,
  tool: Tool | null,
  settings: PlanSettings,
  spindle: SpindleLimits,
  own: boolean,
): Cutter => {
  if (!own) {
    // The drawing's own cutter cuts with the drawing's values as they stand – the program of every drawing that
    // never chose another cutter is made from exactly this, byte for byte
    const diameter = tool?.diameter ?? DEFAULT_TOOL;
    return {
      id,
      tool,
      diameter,
      rpm: settings.rpm,
      cut: { ...settings, toolDiameter: diameter },
      ownValues: false,
      rows: [],
    };
  }
  const t = tool!;
  const v = toolOwnValues(t, spindle);
  const cut: CutSettings = {
    ...settings,
    toolDiameter: t.diameter,
    ...(v.feed !== undefined ? { feed: v.feed } : {}),
    ...(v.plunge !== undefined ? { plungeFeed: v.plunge } : {}),
    ...(v.depthPerPass !== undefined ? { stepdown: v.depthPerPass } : {}),
    ...(v.stepover !== undefined ? { stepover: stepoverShare(v.stepover, t.diameter, 3) } : {}),
  };
  return {
    id,
    tool: t,
    diameter: t.diameter,
    rpm: v.rpm ?? settings.rpm,
    cut,
    ownValues: Object.keys(v).length > 0,
    rows: [],
  };
};

/**
 * The cutters of a drawing and which part is cut with which. Pure: the items, the drawing's settings, the tool
 * list and the spindle's limits go in.
 *
 * - A part that is not cut (hidden, "nicht fräsen"), and a registration hole, has no cutter of its own: the holes
 *   are drilled with the drawing's.
 * - A part whose cutter cannot stand (gone from the list, a probe, a V-bit for a contour) is cut with the drawing's
 *   and a note says so.
 * - Only where two or more cutters cut does the program name them, so only there must a T number be a whole number
 *   from 1 and belong to one tool of the list alone; a drawing with one cutter keeps its program as it was.
 */
export function planCutters(
  items: readonly CamItem[],
  settings: PlanSettings,
  tools: readonly Tool[],
  spindle: SpindleLimits,
): CutterPlan {
  const drawingTool = tools.find((x) => x.id === settings.toolId) ?? null;
  const drawing = cutterOf(settings.toolId, drawingTool, settings, spindle, false);
  const cutters: Cutter[] = [];
  const of = new Map<number, number>();
  const at = new Map<string, number>();
  const notes: ToolNote[] = [];
  const say = (note: ToolNote) => {
    const same = notes.find(
      (n) => n.code === note.code && n.tool === note.tool && n.other === note.other,
    );
    if (same) same.rows.push(...note.rows);
    else notes.push(note);
  };

  items.forEach((item, row) => {
    if (item.registration !== undefined || item.hidden === true || item.kind === 'none') return;
    let id = settings.toolId;
    let tool = drawingTool;
    const asked = item.toolId;
    if (asked !== undefined && asked !== settings.toolId) {
      const found = tools.find((x) => x.id === asked);
      if (!found) say({ code: 'missing', rows: [row], tool: asked });
      else if (found.probe === true) say({ code: 'probe', rows: [row], tool: found.name });
      else if (!fitsKind(found, item.kind)) say({ code: 'kind', rows: [row], tool: found.name });
      else {
        id = asked;
        tool = found;
      }
    }
    let k = at.get(id);
    if (k === undefined) {
      k = cutters.length;
      at.set(id, k);
      cutters.push(cutterOf(id, tool, settings, spindle, id !== settings.toolId));
    }
    cutters[k]!.rows.push(row);
    of.set(item.id, k);
  });

  if (cutters.length >= 2) {
    const pairs = new Set<string>();
    for (const c of cutters) {
      if (!c.tool) {
        say({ code: 'gone', rows: [...c.rows], tool: c.id });
        continue;
      }
      const { number, name } = c.tool;
      if (!Number.isSafeInteger(number) || number < 1) {
        say({ code: 'number', rows: [...c.rows], tool: name, number });
        continue;
      }
      // The whole list: the change card and every lookup name the first tool with a number, so a second one
      // anywhere in the list would be named for this cutter
      for (const other of tools) {
        if (other.id === c.id || other.number !== number) continue;
        const pair = [c.id, other.id].sort().join('\u0000');
        if (pairs.has(pair)) continue;
        pairs.add(pair);
        say({ code: 'clash', rows: [...c.rows], tool: name, other: other.name, number });
      }
    }
  }
  return {
    cutters,
    drawing,
    of,
    notes,
    refused: notes.some((n) => TOOL_NOTE_EFFECT[n.code] === 'refused'),
    other: cutters.some((c) => c.id !== settings.toolId),
  };
}

/** The diameter of the cutter a part is cut with, mm – the drawing's where it is not cut at all */
export const diameterOfItem = (plan: CutterPlan, item: Pick<CamItem, 'id'>): number =>
  plan.cutters[plan.of.get(item.id) ?? -1]?.diameter ?? plan.drawing.diameter;

/**
 * The tabs of every part as the table draws them: the places the cut lifts at, which depend on the diameter of the
 * cutter the part is cut with – each part's own (`itemTabMarks` asks `operationTabSites`, the function the cut asks).
 */
export const drawnTabMarks = (
  items: readonly CamItem[],
  defaults: Parameters<typeof itemTabMarks>[1],
  plan: CutterPlan,
) => items.flatMap((i) => itemTabMarks(i, defaults, diameterOfItem(plan, i)));

/** The widest cutter of the program, mm – what a gap between parts must leave room for */
export const widestCutter = (plan: CutterPlan): number =>
  Math.max(plan.drawing.diameter, ...plan.cutters.map((c) => c.diameter));

const toolKey = (t: Tool | null) =>
  t && [t.number, t.name, t.diameter, t.kind, t.probe === true, t.cutting ?? null];

/**
 * Everything of the tool list a program made from the plan depends on – the numbers, names, diameters, kinds,
 * probe marks and own values of the drawing's cutter and of those in use, the notes, the spindle's limits (they
 * hold an own speed). The same signature again is the same program: when the list is edited and the signature
 * of the drawing as it is now differs from the one of the program on the table, that program is made anew.
 */
export const planSignature = (plan: CutterPlan, spindle: SpindleLimits): string =>
  JSON.stringify([
    [plan.drawing.id, toolKey(plan.drawing.tool)],
    plan.cutters.map((c) => [c.id, toolKey(c.tool)]),
    plan.notes,
    spindle,
  ]);

/**
 * The cutters in the words of the summary ("T1 Schaftfräser 6 mm · T2 V-Fräser"): the number and the name –
 * a cutter that is not in the list by its id.
 */
export const cutterLabel = (c: Pick<Cutter, 'id' | 'tool'>): string =>
  c.tool ? `T${c.tool.number} ${c.tool.name}` : c.id;
