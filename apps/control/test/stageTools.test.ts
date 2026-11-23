import { beforeEach, describe, expect, it } from 'vitest';
import { activeTool, grabStage, STAGE_TOOLS, tapStage } from '../src/components/StageTools';
import { alignJobTo } from '../src/components/ZeroTool';
import { distanceLabel } from '../src/components/MeasureTool';
import { hasKey } from '../src/i18n';
import { removeZone } from '../src/store/clamps';
import { useJob } from '../src/store/job';
import { useStageTools } from '../src/store/tools';
import { useWorkshop, validateSetup } from '../src/store/workshop';

const reset = () => {
  useStageTools.setState({
    active: 'goto',
    points: [],
    tappedLow: false,
    zeroStep: 'corner',
    clampKind: 'clamp',
    zone: null,
  });
  useWorkshop.getState().setSetup({ fixtures: [], fixtureFrame: 'machine' });
};

describe('stage tools', () => {
  beforeEach(reset);

  it('have a unique id, a label and a hint each – four tools beside the joystick', () => {
    const ids = STAGE_TOOLS.map((tool) => tool.id);
    expect(ids).toEqual(['goto', 'zero', 'measure', 'clamp']);
    for (const tool of STAGE_TOOLS) {
      expect(hasKey(tool.label), tool.id).toBe(true);
      expect(hasKey(tool.hint), tool.id).toBe(true);
    }
  });

  it('give every tap to the active tool: one point to drive to', () => {
    tapStage({ x: 1, y: 2 });
    tapStage({ x: 3, y: 4 }, true);
    expect(useStageTools.getState().points).toEqual([{ x: 3, y: 4 }]);
    expect(useStageTools.getState().tappedLow).toBe(true);
    useStageTools.getState().clear();
    expect(useStageTools.getState().points).toEqual([]);
  });

  it('the zero tool takes one point for the corner, then two along the edge', () => {
    useStageTools.getState().select('zero');
    tapStage({ x: 0, y: 0 });
    tapStage({ x: 5, y: 5 });
    expect(useStageTools.getState().points).toEqual([{ x: 5, y: 5 }]);

    useStageTools.getState().setZeroStep('edge');
    expect(useStageTools.getState().points).toEqual([]);
    tapStage({ x: 0, y: 0 });
    tapStage({ x: 10, y: 0 });
    tapStage({ x: 10, y: 10 });
    expect(useStageTools.getState().points).toEqual([
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);
    expect(activeTool().line).toBe(true);
    // Choosing the tool again starts at the corner.
    useStageTools.getState().select('zero');
    expect(useStageTools.getState().zeroStep).toBe('corner');
  });

  it('measuring chains: a third tap measures on from the last point', () => {
    useStageTools.getState().select('measure');
    expect(distanceLabel(useStageTools.getState().points)).toBeNull();
    tapStage({ x: 0, y: 0, hole: 8 });
    tapStage({ x: 200, y: 0, hole: 8 });
    expect(distanceLabel(useStageTools.getState().points)).toBe('200,0 mm');
    expect(activeTool().lineLabel?.(useStageTools.getState().points)).toBe('200,0 mm');
    tapStage({ x: 200, y: 30 });
    expect(useStageTools.getState().points).toEqual([
      { x: 200, y: 0, hole: 8 },
      { x: 200, y: 30 },
    ]);
    expect(distanceLabel(useStageTools.getState().points)).toBe('30,0 mm');
    expect(activeTool().snap?.()).toBe('hole');
  });

  it('a tapped point can be taken and dragged; it is a free point from then on', () => {
    useStageTools.getState().select('measure');
    tapStage({ x: 0, y: 0, hole: 8 });
    tapStage({ x: 100, y: 0, hole: 6 });
    // Nothing under the finger: the view pans.
    expect(grabStage({ x: 50, y: 20 }, 5)).toBeNull();
    // The finger comes down 2 mm beside the second point and moves 10 mm up.
    const grab = grabStage({ x: 102, y: 1 }, 5)!;
    grab.move({ x: 102, y: 11 });
    expect(useStageTools.getState().points).toEqual([
      { x: 0, y: 0, hole: 8 },
      { x: 100, y: 10 },
    ]);
    // The go-to tool has nothing to take hold of.
    useStageTools.getState().select('goto');
    tapStage({ x: 1, y: 1 });
    expect(grabStage({ x: 1, y: 1 }, 5)).toBeNull();
  });

  it('the clamp tool puts a zone down per tap; a double tap takes its first tap back', () => {
    useStageTools.getState().select('clamp');
    const undo = tapStage({ x: 500, y: 300 }, true);
    let { fixtures } = useWorkshop.getState().setup;
    expect(fixtures.map((f) => f.name)).toEqual(['Zwinge 1']);
    expect(fixtures[0]!.max.z).toBe(30);
    expect(useStageTools.getState().zone).toBe(0);
    expect(useStageTools.getState().tappedLow).toBe(true);
    expect(useStageTools.getState().points).toEqual([]);

    useStageTools.getState().setClampKind('screw');
    const undoScrew = tapStage({ x: 700, y: 300 });
    fixtures = useWorkshop.getState().setup.fixtures;
    expect(fixtures.map((f) => f.name)).toEqual(['Zwinge 1', 'Schraube 2']);
    expect(fixtures[1]!.round).toBe(true);
    expect(useStageTools.getState().zone).toBe(1);
    undoScrew();
    expect(useWorkshop.getState().setup.fixtures.map((f) => f.name)).toEqual(['Zwinge 1']);
    expect(useStageTools.getState().zone).toBe(0);
    undo();
    expect(useWorkshop.getState().setup.fixtures).toEqual([]);
    expect(useStageTools.getState().zone).toBeNull();
  });

  it('a clamp is moved by its body and resized by a corner; removing it keeps the selection right', () => {
    useStageTools.getState().select('clamp');
    tapStage({ x: 500, y: 300 });
    tapStage({ x: 700, y: 300 });
    // Take the first clamp in its middle: it is selected and follows the finger.
    const body = grabStage({ x: 495, y: 300 }, 5)!;
    expect(useStageTools.getState().zone).toBe(0);
    body.move({ x: 505, y: 320 });
    let f = useWorkshop.getState().setup.fixtures[0]!;
    expect([f.min.x, f.min.y, f.max.x, f.max.y]).toEqual([480, 300, 540, 340]);
    // Its upper right corner, taken 1 mm inside: the corner follows, the rest stays.
    const corner = grabStage({ x: 539, y: 339 }, 5)!;
    corner.move({ x: 559, y: 349 });
    f = useWorkshop.getState().setup.fixtures[0]!;
    expect([f.min.x, f.min.y, f.max.x, f.max.y]).toEqual([480, 300, 560, 350]);
    expect(grabStage({ x: 600, y: 200 }, 5)).toBeNull();

    // Removing the first: the second stays selected under its new index.
    useStageTools.getState().selectZone(1);
    removeZone(0);
    expect(useWorkshop.getState().setup.fixtures.map((z) => z.name)).toEqual(['Zwinge 2']);
    expect(useStageTools.getState().zone).toBe(0);
    removeZone(0);
    expect(useStageTools.getState().zone).toBeNull();
  });

  it('fall back to the first tool for an unknown id', () => {
    expect(activeTool('nope').id).toBe(STAGE_TOOLS[0]!.id);
  });
});

describe('aligning the job to a measured edge', () => {
  it('turns the job as loaded, so measuring twice does not turn it twice', () => {
    useJob.getState().load('teil.nc', 'G21 G90\nG0 X0 Y0 Z5\nG1 X100 F600\n');
    expect(alignJobTo(90)).toBe(true);
    const first = useJob.getState();
    expect(first.fileName).toBe('teil_ausgerichtet.nc');
    expect(first.original?.fileName).toBe('teil.nc');
    expect(first.measuredAngle).toBe(90);
    const end = () => useJob.getState().analysis!.segments.at(-1)!.to;
    expect(end().x).toBeCloseTo(0, 6);
    expect(end().y).toBeCloseTo(100, 6);
    // Again with a corrected angle: from the original, not on top of the first turn.
    expect(alignJobTo(1.5)).toBe(true);
    expect(useJob.getState().fileName).toBe('teil_ausgerichtet.nc');
    expect(end().x).toBeCloseTo(100 * Math.cos((1.5 * Math.PI) / 180), 3);
    expect(end().y).toBeCloseTo(100 * Math.sin((1.5 * Math.PI) / 180), 3);
    useJob.getState().restoreOriginal();
    expect(useJob.getState().fileName).toBe('teil.nc');
  });

  it('does nothing without a job', () => {
    useJob.setState({ fileName: null, lines: [], analysis: null, original: null });
    expect(alignJobTo(2)).toBe(false);
  });
});

describe('fixtures in storage', () => {
  it('marks fixtures of older storage as relative to the work zero, and pins them once', () => {
    const old = validateSetup({
      materialId: 'mdf',
      fixtures: [
        { name: 'Zwinge', min: { x: -40, y: -10, z: -1000 }, max: { x: -20, y: 10, z: 15 } },
      ],
    })!;
    expect(old.fixtureFrame).toBe('work');
    expect(validateSetup({ fixtures: [] })!.fixtureFrame).toBe('machine');
    expect(validateSetup({ fixtures: old.fixtures, fixtureFrame: 'machine' })!.fixtureFrame).toBe(
      'machine',
    );
    expect(validateSetup(null)).toBeNull();

    useWorkshop.setState({ setup: old });
    useWorkshop.getState().pinFixturesAt([600, 1200, -60]);
    const pinned = useWorkshop.getState().setup;
    expect(pinned.fixtureFrame).toBe('machine');
    expect(pinned.fixtures[0]!.min).toEqual({ x: 560, y: 1190, z: -1000 });
    // A second offset does not move it again: it is a thing on the table now.
    useWorkshop.getState().pinFixturesAt([0, 0, 0]);
    expect(useWorkshop.getState().setup.fixtures[0]!.min.x).toBe(560);
    reset();
  });
});
