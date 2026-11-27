import { DEFAULT_TOOLS, type Tool } from '@lowrider/workshop';
import { useCam } from '../src/store/cam';
import { useFlip } from '../src/store/flip';
import { useJob } from '../src/store/job';
import { useMachine } from '../src/store/machine';
import { useRun } from '../src/store/run';
import { useSeries } from '../src/store/series';
import { useWorkshop } from '../src/store/workshop';

/** A V-bit with values of its own (T4, Ø 3) */
export const VBIT: Tool = {
  id: 'v1',
  number: 4,
  name: 'V-Fräser 60°',
  kind: 'vbit',
  angle: 60,
  diameter: 3,
  flutes: 2,
  fluteLength: 10,
  stickout: 30,
  holder: 'Spannzange',
  holderDiameter: 20,
  cutting: { rpm: 12000, feed: 600, plungeFeed: 200, stepdown: 0.5, stepover: 0.3 },
};

/** A small flat cutter without values of its own (T5, Ø 2) */
export const SMALL: Tool = {
  id: 'f2',
  number: 5,
  name: 'Schaftfräser 2 mm',
  kind: 'flat',
  diameter: 2,
  flutes: 2,
  fluteLength: 8,
  stickout: 25,
  holder: 'Spannzange',
  holderDiameter: 20,
};

export const LIST: Tool[] = [...DEFAULT_TOOLS, VBIT, SMALL];

export const cam = () => useCam.getState();
export const items = () => cam().project!.items;
export const program = () => useJob.getState().lines.join('\n');
/** The lines of a program that change the cutter */
export const changes = (text = program()) => text.split('\n').filter((l) => /\bM6\b/.test(l));

/**
 * A clean drawing with the 6 mm flat cutter T3 as the drawing's own, the tool list of the app plus a V-bit
 * with values of its own and a small flat cutter without, nothing running, nothing on the table.
 */
export function scene() {
  cam().close();
  cam().setPlacing(null);
  useJob.getState().unload();
  useFlip.getState().cancel();
  useRun.getState().reset();
  useSeries.setState({ open: false, made: null });
  useMachine.setState({ fileJob: null, stream: null, lostInJob: null });
  useWorkshop.setState({ tools: LIST.map((t) => ({ ...t })) });
  useWorkshop.getState().setSetup({ stock: null, fixtures: [], fixtureFrame: 'machine' });
  // (the cutting values a new drawing starts with: the session keeps what the last drawing left, so they are set here)
  cam().setSettings({
    toolId: 't3',
    depth: 6,
    allowance: 0,
    engraveDepth: 1,
    rpm: 18000,
    stepdown: 2,
    stepover: 0.4,
    feed: 1500,
    plungeFeed: 400,
    rampAngle: 5,
    safeZ: 5,
    climb: true,
    routeShort: true,
    tabs: { count: 4, width: 6, height: 2, avoidCorners: true },
  });
}

/** Puts the tool list back as the app has it (a test that edited it) */
export const resetTools = () => useWorkshop.setState({ tools: LIST.map((t) => ({ ...t })) });
