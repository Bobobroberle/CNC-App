import type { Material } from './materials';
import type { Tool } from './tools';

export interface SpindleLimits {
  /** Lowest and highest spindle speed; a router without speed control has min = max */
  rpmMin: number;
  rpmMax: number;
  /** Highest usable cutting feed of the machine, mm/min */
  maxFeed: number;
}

export interface CuttingSuggestion {
  rpm: number;
  /** mm/min */
  feed: number;
  plunge: number;
  depthPerPass: number;
  stepover: number;
  /** Chip load actually achieved per tooth, mm */
  chipLoad: number;
  /** Learned correction applied to the feed */
  learnedFactor: number;
  /** Hints such as "feed limited by the machine" (stable keys for the UI) */
  limits: ('rpm-low' | 'rpm-high' | 'feed-machine')[];
}

/** Chip load scales roughly with the diameter; 6 mm is the reference. */
export function chipLoad(material: Material, diameter: number): number {
  return material.fz6 * Math.min(2, Math.max(0.3, diameter / 6));
}

/**
 * Feeds and speeds from cutting speed and chip load:
 * n = vc·1000 / (π·d), f = fz·z·n, with the machine's limits and the
 * correction learned from earlier jobs.
 */
/** V-bits and chamfer cutters cut with at most two edges. */
const flutesOf = (tool: Tool) =>
  tool.kind === 'vbit' || tool.kind === 'chamfer' ? Math.min(tool.flutes, 2) : tool.flutes;

export function suggestCutting(
  tool: Tool,
  material: Material,
  spindle: SpindleLimits,
  learnedFactor = 1,
): CuttingSuggestion {
  const limits: CuttingSuggestion['limits'] = [];
  const ideal = (material.vc * 1000) / (Math.PI * tool.diameter);
  let rpm = ideal;
  if (rpm < spindle.rpmMin) {
    rpm = spindle.rpmMin;
    limits.push('rpm-high');
  } else if (rpm > spindle.rpmMax) {
    rpm = spindle.rpmMax;
    limits.push('rpm-low');
  }
  const flutes = flutesOf(tool);
  let feed = chipLoad(material, tool.diameter) * flutes * rpm * learnedFactor;
  if (feed > spindle.maxFeed) {
    feed = spindle.maxFeed;
    limits.push('feed-machine');
  }
  return {
    rpm: Math.round(rpm),
    feed: Math.round(feed),
    plunge: Math.round(feed * material.plungeFactor),
    depthPerPass: Number((tool.diameter * material.depthFactor).toFixed(2)),
    stepover: Number((tool.diameter * material.stepoverFactor).toFixed(2)),
    chipLoad: Number((feed / (flutes * rpm)).toFixed(4)),
    learnedFactor,
    limits,
  };
}

/** What the tool's own values say, as the CAM takes them: within the machine's limits, nothing guessed. */
export type OwnValues = Partial<
  Pick<CuttingSuggestion, 'rpm' | 'feed' | 'plunge' | 'depthPerPass' | 'stepover'>
>;

/**
 * The values the operator typed for a tool (`Tool.cutting`), cut to what the spindle and the machine
 * can do – and nothing for what they left empty. The learned correction does not touch them.
 */
export function toolOwnValues(tool: Tool, spindle: SpindleLimits): OwnValues {
  const c = tool.cutting;
  const out: OwnValues = {};
  if (!c) return out;
  if (c.rpm !== undefined)
    out.rpm = Math.round(Math.min(spindle.rpmMax, Math.max(spindle.rpmMin, c.rpm)));
  if (c.feed !== undefined) out.feed = Math.round(Math.min(spindle.maxFeed, c.feed));
  if (c.plungeFeed !== undefined) out.plunge = Math.round(Math.min(spindle.maxFeed, c.plungeFeed));
  if (c.stepdown !== undefined) out.depthPerPass = Number(c.stepdown.toFixed(2));
  if (c.stepover !== undefined) out.stepover = Number((c.stepover * tool.diameter).toFixed(2));
  return out;
}

/**
 * The suggestion of the material, with the tool's own values over it: what the CAM applies and what
 * the check compares the program with. A typed feed without a typed plunge feed keeps the material's
 * plunge ratio; a typed feed is not scaled by what was learned.
 */
export function suggestFor(
  tool: Tool,
  material: Material,
  spindle: SpindleLimits,
  learned = 1,
): CuttingSuggestion {
  const base = suggestCutting(tool, material, spindle, learned);
  const own = toolOwnValues(tool, spindle);
  const rpm = own.rpm ?? base.rpm;
  const feed = own.feed ?? base.feed;
  return {
    ...base,
    rpm,
    feed,
    plunge:
      own.plunge ??
      (own.feed === undefined ? base.plunge : Math.round(feed * material.plungeFactor)),
    depthPerPass: own.depthPerPass ?? base.depthPerPass,
    stepover: own.stepover ?? base.stepover,
    chipLoad: Number((feed / (flutesOf(tool) * rpm)).toFixed(4)),
    learnedFactor: own.feed === undefined ? base.learnedFactor : 1,
  };
}

/** What a finished job tells about a tool/material pair. */
export interface CutObservation {
  toolId: string;
  materialId: string;
  /** Mean feed override during cutting, percent */
  feedOverride: number;
  completed: boolean;
  chatter: boolean;
  /** Mean spindle load, percent, if measured */
  load?: number;
}

export type LearningModel = Record<string, { factor: number; jobs: number }>;

const LEARNING_RATE = 0.3;
const MIN_FACTOR = 0.5;
const MAX_FACTOR = 1.5;

export const learningKey = (toolId: string, materialId: string) => `${toolId}|${materialId}`;

/**
 * Updates the feed correction for a tool/material pair. The override the
 * operator settled on is the best signal; chatter or an abort pull the
 * factor down, a low spindle load nudges it up.
 */
export function learn(model: LearningModel, o: CutObservation): LearningModel {
  const key = learningKey(o.toolId, o.materialId);
  const current = model[key] ?? { factor: 1, jobs: 0 };
  let target = current.factor * (o.feedOverride / 100);
  if (o.chatter || !o.completed) target = Math.min(target, current.factor * 0.9);
  else if (o.load !== undefined && o.load < 40) target *= 1.05;
  const factor = Math.min(
    MAX_FACTOR,
    Math.max(MIN_FACTOR, current.factor + (target - current.factor) * LEARNING_RATE),
  );
  return { ...model, [key]: { factor: Number(factor.toFixed(3)), jobs: current.jobs + 1 } };
}

export function learnedFactor(model: LearningModel, toolId: string, materialId: string): number {
  return model[learningKey(toolId, materialId)]?.factor ?? 1;
}
