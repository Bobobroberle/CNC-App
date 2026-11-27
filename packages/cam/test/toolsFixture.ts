import {
  circle,
  defaultOperations,
  rectangle,
  textContours,
  toGcode,
  toolpaths,
  type CutSettings,
  type Operation,
  type ToolSettings,
} from '../src';

/**
 * The sign of `golden.test.ts` with the text engraved by a V-bit and everything else cut by the 3 mm end mill:
 * T1 drills the two holes, T2 engraves, T1 cuts the slot and the outline – the cutter is changed twice. Used by the
 * golden program of several tools and by the proof that such a program is split and run apart correctly.
 */
const settings: CutSettings = {
  toolDiameter: 3,
  depth: 6,
  stepdown: 2,
  stepover: 0.4,
  feed: 1200,
  plungeFeed: 300,
  rampAngle: 10,
  safeZ: 5,
  climb: true,
  allowance: 0.3,
};

/**
 * `sameFeeds`: the V-bit cuts with the end mill's feeds (as when the app fills every tool from the one set of job
 * values): a part that begins with a feed move of the same feed as the last move before the tool change.
 */
export function twoToolSign(numbers: [number, number] = [1, 2], sameFeeds = false) {
  const text = textContours('Fräse\nNr. 1', { height: 12, x: 60, y: 42, align: 'center' });
  const shapes = [
    rectangle(0, 0, 120, 70, 8),
    circle(10, 60, 3),
    circle(110, 60, 3),
    rectangle(45, 6, 30, 6),
  ];
  const tabs = { count: 4, width: 6, height: 1.5 };
  const operations: Operation[] = [
    ...defaultOperations(shapes, settings.toolDiameter, tabs).map((o) => ({
      ...o,
      tool: 0,
      relief: o.contour === 3 ? ('dogbone' as const) : undefined,
    })),
    ...text.contours.map((_, i) => ({
      contour: shapes.length + i,
      kind: 'on' as const,
      depth: 0.8,
      tool: 1,
    })),
  ];
  const tools: ToolSettings[] = [
    { number: numbers[0], name: 'End mill 3', cut: settings },
    {
      number: numbers[1],
      name: 'V-bit 60',
      rpm: 12000,
      cut: {
        ...settings,
        toolDiameter: 1,
        ...(sameFeeds ? {} : { feed: 600, plungeFeed: 200 }),
        allowance: 0,
      },
    },
  ];
  const result = toolpaths([...shapes, ...text.contours], operations, tools);
  const program = toGcode(result.moves, {
    name: 'schild zwei werkzeuge',
    rpm: 18000,
    safeZ: 5,
    blocks: result.blocks,
  });
  return { result, program, operations, tools, strokes: text.contours.length };
}
