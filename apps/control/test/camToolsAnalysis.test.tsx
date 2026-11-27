// @vitest-environment jsdom
import { rectangle } from '@lowrider/cam';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { firstTool } from '../src/lib/setup';
import { useClampHits } from '../src/store/clamps';
import { useJob } from '../src/store/job';
import { useReadiness } from '../src/store/readiness';
import { useJobTools } from '../src/store/jobTools';
import { useWorkshop } from '../src/store/workshop';
import { cam, items, LIST, scene, VBIT } from './camToolsFixtures';

const load = (text: string) => useJob.getState().load('job.nc', text);

describe('the first tool of a program is the first it uses, not the one with the lowest number', () => {
  it('toolOrder says it; the sorted list does not', () => {
    // T2 first (a 20 mm cutter), T1 after: the program starts with T2
    load(
      [
        'G21 G90 G17 G94',
        'T2 M6',
        'S10000 M3',
        'G0 Z5',
        'G0 X10 Y10',
        'G1 Z-1 F300',
        'G1 X20 F800',
        'G0 Z5',
        'M5',
        'T1 M6',
        'S10000 M3',
        'G0 X30 Y10',
        'G1 Z-1 F300',
        'G1 X40 F800',
        'G0 Z5',
        'M5',
        'M30',
      ].join('\n'),
    );
    const { analysis } = useJob.getState();
    expect(analysis!.tools).toEqual([1, 2]);
    expect(analysis!.toolOrder).toEqual([2, 1]);
    expect(firstTool(analysis!)).toBe(2);
    // a program without T words has the tool 0; one with a lone tool is that tool
    load('G21 G90\nG0 Z5\nG0 X1 Y1\nG1 Z-1 F100\nM30\n');
    expect(firstTool(useJob.getState().analysis!)).toBe(0);
  });

  it('the clamps are checked with that tool’s diameter: a wide cutter first runs into a clamp a narrow one passes', () => {
    useWorkshop.setState({
      tools: [
        { ...LIST[0]!, id: 'narrow', number: 1, diameter: 2, name: 'schmal' },
        { ...LIST[0]!, id: 'wide', number: 2, diameter: 20, name: 'breit' },
      ],
      setup: {
        ...useWorkshop.getState().setup,
        toolMap: {},
        fixtureFrame: 'work',
        // a clamp 6 mm beside the cut: a 2 mm cutter passes it, a 20 mm one does not
        fixtures: [
          { name: 'Zwinge', min: { x: 5, y: -30, z: -1000 }, max: { x: 8, y: -4, z: 30 } },
        ],
      },
    });
    const program = (first: number, second: number) =>
      [
        'G21 G90 G17 G94',
        `T${first} M6`,
        'S10000 M3',
        'G0 Z5',
        'G0 X0 Y0',
        'G1 Z-1 F300',
        'G1 X50 F800',
        'G0 Z5',
        'M5',
        `T${second} M6`,
        'S10000 M3',
        'G0 X0 Y40',
        'G1 Z-1 F300',
        'G1 X50 F800',
        'G0 Z5',
        'M5',
        'M30',
      ].join('\n');
    // the wide cutter first: the hit is there – the lowest number (the narrow one) would have said nothing
    load(program(2, 1));
    expect(useJob.getState().analysis!.tools[0]).toBe(1);
    expect(renderHook(() => useClampHits()).result.current.length).toBeGreaterThan(0);
    // the narrow one first: it passes
    load(program(1, 2));
    expect(renderHook(() => useClampHits()).result.current).toEqual([]);
  });
});

describe('the collision check is made with the tool the program starts with', () => {
  it('a short tool first: its holder reaches into the stock – the one with the lowest number would not', () => {
    useWorkshop.setState({
      tools: [
        { ...LIST[0]!, id: 'long', number: 1, name: 'lang', stickout: 30 },
        { ...LIST[0]!, id: 'short', number: 2, name: 'kurz', stickout: 5 },
      ],
      setup: { ...useWorkshop.getState().setup, toolMap: {}, stock: null, fixtures: [] },
    });
    const program = (first: number, second: number) =>
      [
        'G21 G90 G17 G94',
        `T${first} M6`,
        'S10000 M3',
        'G0 Z5',
        'G0 X0 Y0',
        'G1 Z-10 F300',
        'G1 X50 F800',
        'G0 Z5',
        'M5',
        `T${second} M6`,
        'S10000 M3',
        'G0 X0 Y40',
        'G1 Z-10 F300',
        'G1 X50 F800',
        'G0 Z5',
        'M5',
        'M30',
      ].join('\n');
    // the short tool (T2, 5 mm out of the collet) first, 10 mm deep: its holder is 5 mm below the top of the stock
    load(program(2, 1));
    expect(useJob.getState().analysis!.tools[0]).toBe(1);
    expect(renderHook(() => useReadiness()).result.current!.collisions.length).toBeGreaterThan(0);
    // the long one first: the check is made with it
    load(program(1, 2));
    expect(renderHook(() => useReadiness()).result.current!.collisions).toEqual([]);
  });
});

describe('the tools of a program as the card lists them', () => {
  beforeEach(() => {
    scene();
    cam().add([rectangle(0, 0, 40, 30)]);
    cam().addText('Hi', { height: 8 });
    cam().setItem(items()[1]!.id, { toolId: 'v1' });
    useWorkshop.getState().setSetup({ toolMap: {} });
  });

  it('are in the order the program uses them: the first row is the one the pictures draw', () => {
    const rows = renderHook(() => useJobTools()).result.current;
    expect(rows.map((r) => r.number)).toEqual([4, 3]);
    expect(rows.map((r) => r.tool?.id)).toEqual(['v1', 't3']);
    expect(rows.every((r) => r.state === 'ok')).toBe(true);
  });

  it('each is held against the diameter the header names for ITS number – not the first one for all', () => {
    // the operator maps T4 to a 2 mm cutter: the header of the program says T4 is 3 mm
    useWorkshop.getState().setSetup({ toolMap: { 4: 'f2' } });
    const rows = renderHook(() => useJobTools()).result.current;
    const v = rows.find((r) => r.number === 4)!;
    const flat = rows.find((r) => r.number === 3)!;
    expect(v.issues).toContain('diameter');
    expect(v.state).toBe('warn');
    // T3 is as the header says (6 mm): nothing – the first header diameter (3 mm, the V-bit's) is no verdict on it
    expect(flat.issues).not.toContain('diameter');
    expect(flat.state).toBe('ok');
    // and the other way round: T3 mapped to a tool of another diameter is the one that is flagged
    useWorkshop.getState().setSetup({ toolMap: { 3: 'f2' } });
    const other = renderHook(() => useJobTools()).result.current;
    expect(other.find((r) => r.number === 3)!.issues).toContain('diameter');
    expect(other.find((r) => r.number === 4)!.issues).not.toContain('diameter');
    expect(VBIT.diameter).toBe(3);
  });
});
