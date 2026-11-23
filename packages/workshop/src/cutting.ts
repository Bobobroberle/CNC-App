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
  const flutes =
    tool.kind === 'vbit' || tool.kind === 'chamfer' ? Math.min(tool.flutes, 2) : tool.flutes;
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
