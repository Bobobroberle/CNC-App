import { circle, holeGrid, rectangle, type Sketch } from '@lowrider/cam';
import { frameAngle, selectionFrame } from '../src/lib/camEdit';
import { beforeEach, describe, expect, it } from 'vitest';
import { holeCentre, isSelected, itemAt, itemsBounds, partsOf } from '../src/lib/camItems';
import { blocksFlip, useCam } from '../src/store/cam';
import { useFlip } from '../src/store/flip';
import { useJob } from '../src/store/job';
import { useWorkshop } from '../src/store/workshop';

const DXF = [
  '0',
  'SECTION',
  '2',
  'ENTITIES',
  '0',
  'LWPOLYLINE',
  '70',
  '1',
  '10',
  '0',
  '20',
  '0',
  '10',
  '80',
  '20',
  '0',
  '10',
  '80',
  '20',
  '40',
  '10',
  '0',
  '20',
  '40',
  '0',
  'CIRCLE',
  '10',
  '40',
  '20',
  '20',
  '40',
  '3',
  '0',
  'TEXT',
  '0',
  'ENDSEC',
  '0',
  'EOF',
].join('\n');

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="80mm" height="40mm" viewBox="0 0 80 40">
  <rect x="0" y="0" width="80" height="40"/><circle cx="40" cy="20" r="3"/><text>Hallo</text>
</svg>`;

const items = () => useCam.getState().project!.items;
const kinds = () => items().map((i) => i.kind);
const box = () => {
  const b = itemsBounds(items().filter((i) => isSelected(i, useCam.getState().selected)))!;
  return [b.minX, b.minY, b.maxX, b.maxY].map((v) => Math.round(v * 10) / 10 + 0);
};
const program = () => useJob.getState().lines.join('\n');
const errors = () => useJob.getState().analysis?.diagnostics.filter((d) => d.severity === 'error');

describe('CAM in the app', () => {
  beforeEach(() => {
    useCam.getState().close();
    useJob.getState().unload();
    // The 6 mm end mill of the tool library: 3 mm beside every line.
    useCam.getState().setSettings({ toolId: 't2', depth: 6, allowance: 0, engraveDepth: 1 });
  });

  it('turns a DXF into a checked job, outline last and with tabs', () => {
    useCam.getState().importFile('platte.dxf', DXF);
    const p = useCam.getState().project!;
    expect(p.name).toBe('platte');
    expect(p.skipped).toEqual({ TEXT: 1 });
    expect(kinds()).toEqual(['outside', 'drill']);
    expect(items()[0]!.tabs).toBe(true);
    expect(useCam.getState().generate()).toBe(true);
    const job = useJob.getState();
    expect(job.fileName).toBe('platte.nc');
    expect(errors()).toEqual([]);
    // The hole (pecked at its centre) comes before the outline.
    expect(program().indexOf('X40 Y20')).toBeLessThan(program().indexOf('X-3'));
  });

  it('reads an SVG the same way and says what it left out', () => {
    useCam.getState().importFile('schild.svg', SVG);
    const p = useCam.getState().project!;
    expect(p.name).toBe('schild');
    expect(p.notes).toEqual([{ code: 'svg-text', count: 1 }]);
    expect(p.skipped).toEqual({});
    expect(kinds()).toEqual(['outside', 'drill']);
    expect(errors()).toEqual([]);
    // What came in together is selected together, ready to be moved.
    expect(box()).toEqual([0, 0, 80, 40]);
    // A second file is added and keeps the name; without the ending the content decides.
    useCam.getState().importFile('zweite', SVG);
    expect(useCam.getState().project!.name).toBe('schild');
    expect(items()).toHaveLength(4);
    expect(() => useCam.getState().importFile('kaputt.svg', '<html/>')).toThrow();
    useCam.getState().importFile('leer.svg', '<svg width="1mm" height="1mm"/>');
    expect(items()).toHaveLength(4);
  });

  it('adds drawn shapes, keeps earlier choices, removes and re-numbers', () => {
    const cam = useCam.getState();
    cam.add([rectangle(0, 0, 100, 60)]);
    cam.setItem(items()[0]!.id, { kind: 'pocket' });
    cam.add([circle(50, 30, 20), circle(10, 10, 6)]);
    expect(kinds()).toEqual(['pocket', 'inside', 'drill']);
    cam.removeItem(items()[1]!.id);
    expect(kinds()).toEqual(['pocket', 'drill']);
    // Both circles came together: what is left of them is still selected.
    expect(box()).toEqual([7, 7, 13, 13]);
    cam.removeItem(items()[1]!.id);
    expect(useCam.getState().selected).toBeNull();
    cam.add([]);
    expect(items()).toHaveLength(1);
    // A hole grid is one row with one choice.
    cam.add(holeGrid(10, 10, 6, 3, 2, 20, 20), { single: true });
    expect(kinds()).toEqual(['pocket', 'drill']);
    expect(items()[1]!.contours).toHaveLength(6);
    cam.clear();
    expect(items()).toEqual([]);
    expect(cam.generate()).toBe(false);
  });

  it('engraves text on the sign: in its middle, at the engraving depth, before the outline', () => {
    const cam = useCam.getState();
    cam.add([rectangle(0, 0, 200, 80)]);
    expect(cam.addText('Größe 5', { height: 20 })).toEqual([]);
    const text = items()[1]!;
    expect(text.kind).toBe('on');
    expect(text.text).toBe('Größe 5');
    const b = itemsBounds([text])!;
    expect((b.minX + b.maxX) / 2).toBeCloseTo(100);
    expect((b.minY + b.maxY) / 2).toBeCloseTo(40);
    expect(errors()).toEqual([]);
    // Engraved 1 mm deep, the outline 6 mm – and the outline last.
    const lines = program().split('\n');
    const firstDeep = lines.findIndex((l) => /Z-[2-6]/.test(l));
    const lastShallow = lines.findLastIndex((l) => /G1 Z-1\b/.test(l) || l === 'Z-1');
    expect(lastShallow).toBeGreaterThan(0);
    expect(lastShallow).toBeLessThan(firstDeep);
    // Its own depth, and back to the usual one.
    cam.setItem(text.id, { depth: 0.5 });
    expect(program()).toContain('Z-0.5');
    expect(program()).not.toMatch(/Z-1\n/);
    cam.setItem(text.id, { depth: undefined });
    cam.setSettings({ engraveDepth: 1.5 });
    cam.generate();
    expect(program()).toContain('Z-1.5');
    // What the font cannot write is reported; nothing at all adds nothing.
    expect(cam.addText('☺', { height: 20 })).toEqual(['☺']);
    expect(cam.addText('  ', { height: 20 })).toEqual([]);
    expect(items()).toHaveLength(2);
    // The first thing of a drawing stands with its corner on the work zero.
    cam.clear();
    cam.addText('Hi', { height: 10 });
    expect(box().slice(0, 2)).toEqual([0, 0]);
  });

  it('moves, turns, mirrors and copies what is selected', () => {
    const cam = useCam.getState();
    cam.add([rectangle(0, 0, 40, 20), circle(10, 10, 6)]);
    expect(box()).toEqual([0, 0, 40, 20]);
    cam.moveTo(100, 50);
    expect(box()).toEqual([100, 50, 140, 70]);
    // Turned around its middle: 40 × 20 becomes 20 × 40.
    cam.rotate(90);
    expect(box()).toEqual([110, 40, 130, 80]);
    // The hole (at 10, 10 of the plate) is now at its lower right.
    expect(items()[1]!.contours[0]!.circle).toMatchObject({ cx: 120, cy: 50, r: 3 });
    cam.mirror('y');
    expect(items()[1]!.contours[0]!.circle!.cy).toBeCloseTo(70);
    cam.mirror('x');
    expect(items()[1]!.contours[0]!.circle!.cx).toBeCloseTo(120);
    expect(errors()).toEqual([]);
    // A copy beside it, 10 mm apart, selected in its place.
    cam.duplicate();
    expect(items()).toHaveLength(4);
    expect(box()).toEqual([140, 40, 160, 80]);
    expect(kinds()).toEqual(['outside', 'drill', 'outside', 'drill']);
    // 3 × 2 of the copy, 5 mm apart: five more, the selection stays.
    cam.array(3, 2, 5);
    expect(items()).toHaveLength(4 + 5 * 2);
    expect(box()).toEqual([140, 40, 160, 80]);
    cam.select('all');
    expect(box()).toEqual([110, 40, 210, 125]);
    cam.duplicate();
    expect(useCam.getState().selected).toBe('all');
    expect(items()).toHaveLength(28);
    cam.select(items()[0]!.group);
    cam.removeSelection();
    expect(items()).toHaveLength(26);
    expect(useCam.getState().selected).toBeNull();
    // Nothing selected: nothing happens.
    cam.moveTo(0, 0);
    cam.rotate(90);
    cam.mirror('x');
    cam.duplicate();
    cam.array(2, 2, 5);
    cam.removeSelection();
    expect(items()).toHaveLength(26);
    expect(cam.drag()).toBeNull();
  });

  it('lets a finger take a part and carry it; the job follows when it lets go', () => {
    const cam = useCam.getState();
    cam.add([rectangle(0, 0, 100, 60)]);
    cam.addText('AB', { height: 20 });
    cam.select(null);
    // A finger in the gap between the letters still takes the text; beside it the plate.
    const text = itemsBounds([items()[1]!])!;
    expect(cam.pick({ x: (text.minX + text.maxX) / 2 + 1, y: text.minY + 10 }, 2)).toBe(true);
    expect(useCam.getState().selected).toBe(items()[1]!.group);
    expect(cam.pick({ x: 5, y: 30 }, 2)).toBe(true);
    expect(useCam.getState().selected).toBe(items()[0]!.group);
    expect(cam.pick({ x: -50, y: -50 }, 2)).toBe(false);
    // Inside the plate, away from its lines: a tap means the plate, a finger taking hold does not.
    cam.select(null);
    expect(cam.pick({ x: 10, y: 50 }, 2, false)).toBe(false);
    expect(useCam.getState().selected).toBeNull();
    expect(cam.pick({ x: 10, y: 50 }, 2)).toBe(true);
    expect(useCam.getState().selected).toBe(items()[0]!.group);
    expect(itemAt(items(), { x: 100.5, y: 30 }, 2)).toBe(items()[0]);
    // With everything selected a finger on any part carries all of it.
    cam.select('all');
    cam.pick({ x: 0, y: 30 }, 2);
    expect(useCam.getState().selected).toBe('all');
    const before = program();
    const drag = cam.drag()!;
    drag.move(30, 10);
    drag.move(50, 20);
    expect(box().slice(0, 2)).toEqual([50, 20]);
    // Only the outline moved so far; the toolpath is made when the finger lets go.
    expect(program()).toBe(before);
    // On a grid, the corner lands on round numbers.
    drag.move(50.4, 19.7, 1);
    expect(box().slice(0, 2)).toEqual([50, 20]);
    drag.move(50.4, 19.7, 0.5);
    expect(box().slice(0, 2)).toEqual([50.5, 19.5]);
    drag.end();
    expect(program()).not.toBe(before);
    // A touch that never moved changes nothing.
    const again = program();
    cam.drag()!.end();
    expect(program()).toBe(again);
  });

  it('frees inside corners and finishes with an allowance when asked', () => {
    const cam = useCam.getState();
    cam.add([rectangle(0, 0, 100, 60), rectangle(30, 20, 40, 20)]);
    expect(kinds()).toEqual(['outside', 'inside']);
    const plain = program();
    cam.setItem(items()[1]!.id, { relief: 'dogbone' });
    const d = (3 / Math.SQRT2).toFixed(3);
    // The cutter (6 mm) runs into the corner at 30, 20 until it is 3 mm from it.
    expect(plain).not.toContain(`X${(30 + Number(d)).toFixed(3)} Y${(20 + Number(d)).toFixed(3)}`);
    expect(program()).toContain(`X${(30 + Number(d)).toFixed(3)} Y${(20 + Number(d)).toFixed(3)}`);
    // Relief means nothing for an engraved line.
    cam.setItem(items()[1]!.id, { kind: 'on' });
    expect(program()).not.toContain(`X${(30 + Number(d)).toFixed(3)}`);
    cam.setItem(items()[1]!.id, { kind: 'pocket' });
    expect(program()).toContain(`X${(30 + Number(d)).toFixed(3)} Y${(20 + Number(d)).toFixed(3)}`);
    cam.setSettings({ allowance: 0.5 });
    cam.generate();
    // Roughing 3.5 mm beside the plate, finishing 3 mm beside it.
    expect(program()).toContain('X-3.5');
    expect(program()).toContain('X-3 ');
    expect(errors()).toEqual([]);
  });

  it('reports what it cannot cut and suggests values from the libraries', () => {
    const cam = useCam.getState();
    cam.add([rectangle(0, 0, 2, 2)]);
    cam.setItem(items()[0]!.id, { kind: 'inside' });
    expect(cam.generate()).toBe(false);
    expect(useCam.getState().problems).toEqual([{ row: 0, code: 'tool-too-large' }]);
    // A text is many strokes but one row: one line of trouble.
    cam.addText('AB', { height: 10 });
    cam.setItem(items()[1]!.id, { kind: 'outside' });
    expect(useCam.getState().problems.filter((p) => p.row === 1)).toEqual([
      { row: 1, code: 'open-contour' },
    ]);
    const before = useCam.getState().settings.feed;
    useWorkshop.getState().setSetup({ materialId: null });
    cam.suggest();
    expect(useCam.getState().settings.feed).toBe(before);
    const material = useWorkshop.getState().materials[0]!;
    useWorkshop.getState().setSetup({ materialId: material.id });
    cam.suggest();
    expect(useCam.getState().settings.rpm).toBeGreaterThan(0);
    expect(useCam.getState().settings.stepover).toBeLessThan(1);
  });

  it('does nothing without a drawing', () => {
    const cam = useCam.getState();
    cam.removeItem(1);
    cam.setItem(1, { kind: 'none' });
    cam.clear();
    cam.removeSelection();
    expect(cam.pick({ x: 0, y: 0 }, 5)).toBe(false);
    expect(cam.drag()).toBeNull();
    expect(cam.generate()).toBe(false);
    expect(useCam.getState().project).toBeNull();
    cam.open();
    cam.open();
    expect(items()).toEqual([]);
  });
});

describe('a part for both sides in the drawing', () => {
  beforeEach(() => {
    useCam.getState().close();
    useJob.getState().unload();
    useFlip.getState().cancel();
    // The 6 mm end mill; no stock entered, no clamps, the camera not set up.
    useCam.getState().setSettings({ toolId: 't2', depth: 6, allowance: 0, engraveDepth: 1 });
    useWorkshop.getState().setSetup({ stock: null, fixtures: [], fixtureFrame: 'machine' });
    const { settings, setSettings } = useWorkshop.getState();
    setSettings({ camera: { ...settings.camera, scaleCalibrated: false, focusHeight: null } });
  });

  const holes = () =>
    items()
      .filter((i) => i.registration !== undefined)
      .map((i) => ({ n: i.registration, ...holeCentre(i) }));
  const notes = () => useCam.getState().flipNotes.map((n) => n.code);
  /** Every XY place a program goes to. */
  const places = (text: string) => {
    let at = { x: 0, y: 0 };
    const out: { x: number; y: number }[] = [];
    for (const line of text.split('\n')) {
      const x = /X(-?[\d.]+)/.exec(line);
      const y = /Y(-?[\d.]+)/.exec(line);
      if (!x && !y) continue;
      at = { x: x ? Number(x[1]) : at.x, y: y ? Number(y[1]) : at.y };
      out.push(at);
    }
    return out;
  };
  /** How far the places of a program are from a point, at most and at least. */
  const reach = (text: string, x: number, y: number) => {
    const d = places(text).map((p) => Math.hypot(p.x - x, p.y - y));
    return { max: Math.max(...d), min: Math.min(...d) };
  };

  it('brings two registration holes that follow the drawing, and makes two programs', () => {
    const cam = useCam.getState();
    cam.add([rectangle(0, 0, 200, 80)]);
    expect(holes()).toEqual([]);
    cam.setTwoSided({});
    // Beside the plate, level with its middle: 6 mm of cutter, 3 mm of hole and 6 mm of room.
    expect(holes()).toEqual([
      { n: 1, x: -15, y: 40 },
      { n: 2, x: 215, y: 40 },
    ]);
    expect(items().at(-1)!.contours[0]!.circle!.r).toBe(3);
    // They are not parts: the list of what is cut does not have them.
    expect(partsOf(items())).toHaveLength(1);
    // Moving the plate takes them along.
    cam.select(items()[0]!.group);
    cam.moveTo(10, 0);
    expect(holes().map((h) => h.x)).toEqual([-5, 225]);
    // Nothing on the back yet: an ordinary job for one side.
    expect(notes()).toEqual(['no-back']);
    expect(useJob.getState().fileName).toBe('zeichnung.nc');
    expect(program()).not.toContain('X225');
    expect(useFlip.getState().plan).toBeNull();

    // A round pocket on the back; without the thickness the holes have no depth.
    cam.add([circle(50, 40, 20)]);
    const pocket = items()[1]!;
    cam.setItem(pocket.id, { kind: 'pocket', side: 'back', depth: 3 });
    expect(notes()).toEqual(['no-thickness']);
    expect(useCam.getState().flipNotes.some(blocksFlip)).toBe(true);
    expect(useFlip.getState().plan).toBeNull();
    cam.setTwoSided({ thickness: 12 });
    expect(notes()).toEqual([]);

    // Two programs: the front is the job, the back waits in the flow.
    const plan = useFlip.getState().plan!;
    expect(useJob.getState().fileName).toBe('zeichnung_vorderseite.nc');
    expect(plan.back.fileName).toBe('zeichnung_rueckseite.nc');
    expect(plan).toMatchObject({
      name: 'zeichnung',
      flip: { axis: 'x', at: 110 },
      holes: { a: { x: -5, y: 40 }, b: { x: 225, y: 40 } },
      holeDiameter: 6,
      method: 'pins',
      thickness: 12,
    });
    expect(errors()).toEqual([]);
    // The front drills the holes first, through the 12 mm and 6 mm into the spoilboard …
    const front = program();
    expect(front.indexOf('X-5 Y40')).toBeGreaterThan(0);
    expect(front.indexOf('X-5 Y40')).toBeLessThan(front.indexOf('X225\n'));
    expect(front).toContain('Z-18');
    // (the outline, whose cutter runs 3 mm in front of the plate, comes after both)
    expect(front.lastIndexOf('Z-18')).toBeLessThan(front.indexOf('Y-3'));
    // … and has nothing of the pocket, which the back cuts mirrored about x = 110:
    // drawn around 50/40, cut around 170/40 (a Ø 20 pocket, the 6 mm cutter within 7 mm).
    expect(reach(front, 50, 40).min).toBeGreaterThan(20);
    expect(reach(plan.back.text, 170, 40).max).toBeLessThanOrEqual(7.01);
    expect(plan.back.text).toContain('Z-3');
    expect(plan.back.text).not.toContain('Z-18');

    // With the camera set up the holes only go through, and it finds them again.
    const { settings, setSettings } = useWorkshop.getState();
    setSettings({ camera: { ...settings.camera, scaleCalibrated: true, focusHeight: 30 } });
    expect(cam.remake()).toBe(true);
    expect(useFlip.getState().plan!.method).toBe('camera');
    expect(program()).toContain('Z-12.5');
    expect(program()).not.toContain('Z-18');
    // Pins stay a choice.
    cam.setTwoSided({ pins: true });
    expect(useFlip.getState().plan!.method).toBe('pins');
    // Over the front edge: the holes in front of and behind the plate, the pocket mirrored up–down.
    cam.setTwoSided({ axis: 'y' });
    expect(holes()).toEqual([
      { n: 1, x: 110, y: -15 },
      { n: 2, x: 110, y: 95 },
    ]);
    expect(useFlip.getState().plan!.flip).toEqual({ axis: 'y', at: 40 });
    expect(reach(useFlip.getState().plan!.back.text, 50, 40).max).toBeLessThanOrEqual(7.01);
  });

  it('a hole moved by a finger stays in line with the other one', () => {
    const cam = useCam.getState();
    cam.add([rectangle(0, 0, 200, 80)]);
    cam.setTwoSided({ thickness: 12 });
    // A finger on hole 1 takes it alone.
    expect(cam.pick({ x: -15, y: 41 }, 4, false)).toBe(true);
    const drag = cam.drag()!;
    drag.move(8, 3);
    drag.end();
    // Nearly level with hole 2: level. From now on the holes stay where they are put.
    expect(holes()).toEqual([
      { n: 1, x: -7, y: 40 },
      { n: 2, x: 215, y: 40 },
    ]);
    expect(useCam.getState().project!.twoSided!.autoHoles).toBe(false);
    cam.add([circle(100, 40, 20)]);
    expect(holes()[0]).toEqual({ n: 1, x: -7, y: 40 });
    // Nearly above hole 2: straight above it – both on the flip line then.
    cam.select(items().find((i) => i.registration === 1)!.group);
    cam.moveTo(207, 147);
    expect(holes()[0]).toEqual({ n: 1, x: 215, y: 150 });
    // Copies leave the holes alone: there are two.
    cam.select('all');
    cam.duplicate();
    expect(holes()).toHaveLength(2);
    expect(partsOf(items())).toHaveLength(4);
    // Proposed anew they go back beside the parts and follow them again.
    cam.proposeHoles();
    expect(useCam.getState().project!.twoSided!.autoHoles).toBe(true);
    const b = itemsBounds(partsOf(items()))!;
    expect(holes()).toEqual([
      { n: 1, x: b.minX - 15, y: 40 },
      { n: 2, x: b.maxX + 15, y: 40 },
    ]);
    // Removing everything removes them; the next part brings them back.
    cam.select('all');
    cam.removeSelection();
    expect(items()).toEqual([]);
    cam.add([rectangle(0, 0, 50, 50)]);
    expect(holes().map((h) => h.x)).toEqual([-15, 65]);
    cam.clear();
    expect(useCam.getState().project!.twoSided).not.toBeNull();
  });

  it('puts the holes where the stock has room and no clamp stands', () => {
    const cam = useCam.getState();
    // Stock with no room left and right of the plate, but in front of and behind it.
    useWorkshop.getState().setSetup({
      stock: { min: { x: -5, y: -40, z: -12 }, max: { x: 205, y: 120, z: 0 } },
    });
    cam.add([rectangle(0, 0, 200, 80)]);
    cam.setTwoSided({});
    expect(holes()).toEqual([
      { n: 1, x: 100, y: -15 },
      { n: 2, x: 100, y: 95 },
    ]);
    // The stock's height is the thickness unless one is typed in.
    cam.add([circle(50, 40, 20)]);
    cam.setItem(items()[1]!.id, { kind: 'pocket', side: 'back', depth: 3 });
    expect(useFlip.getState().plan!.thickness).toBe(12);
    cam.setTwoSided({ thickness: 18 });
    expect(useFlip.getState().plan!.thickness).toBe(18);
    // A hole dragged off the stock is named.
    cam.select(items().find((i) => i.registration === 1)!.group);
    cam.moveTo(97, -60);
    expect(notes()).toContain('hole-off-stock');
    // A clamp where the right hole would go (fixtures count from the work zero here).
    useWorkshop.getState().setSetup({
      stock: null,
      fixtureFrame: 'work',
      fixtures: [{ name: 'Zwinge 1', min: { x: 205, y: 25, z: 0 }, max: { x: 245, y: 55, z: 30 } }],
    });
    cam.proposeHoles();
    expect(holes().map((h) => h.x)).toEqual([100, 100]);
    useWorkshop.getState().setSetup({ fixtures: [] });
    cam.proposeHoles();
    expect(holes().map((h) => h.x)).toEqual([-15, 215]);
  });

  it('says what the two sides do to each other and where a hole lies badly', () => {
    const cam = useCam.getState();
    cam.add([rectangle(0, 0, 200, 80), circle(60, 40, 30), circle(70, 40, 30)]);
    cam.setTwoSided({ thickness: 12 });
    const [plate, first, second] = items();
    // The outline through on the front without tabs: the part would leave its holes.
    cam.setItem(plate!.id, { depth: 12.5, tabs: false });
    cam.setItem(first!.id, { kind: 'pocket', depth: 8 });
    cam.setItem(second!.id, { kind: 'pocket', depth: 6, side: 'back' });
    expect(useCam.getState().flipNotes).toEqual([
      { code: 'loose', front: 0 },
      { code: 'through', front: 1, back: 2, left: -2 },
    ]);
    // Warnings, not a lock: it may be meant.
    expect(useCam.getState().flipNotes.some(blocksFlip)).toBe(false);
    cam.setItem(plate!.id, { tabs: true });
    cam.setItem(second!.id, { depth: 3.5 });
    expect(useCam.getState().flipNotes).toEqual([{ code: 'thin', front: 1, back: 2, left: 0.5 }]);
    cam.setItem(second!.id, { depth: 3 });
    expect(notes()).toEqual([]);
    // A hole dragged onto the cut around the plate: that would not come out right.
    cam.select(items().find((i) => i.registration === 1)!.group);
    cam.moveTo(-7, 37);
    expect(notes()).toEqual(['hole-on-cut']);
    expect(useCam.getState().flipNotes.some(blocksFlip)).toBe(true);
    // Into the plate itself: it stays in the part – said, but allowed.
    cam.moveTo(20, 7);
    expect(useCam.getState().flipNotes).toContainEqual({ code: 'hole-in-part', hole: 1 });
    cam.proposeHoles();
    expect(notes()).toEqual([]);
    // Everything turned by 30° with the holes fixed: they lie askew, no good for pins.
    cam.select(items().find((i) => i.registration === 2)!.group);
    cam.moveTo(212, 37);
    cam.select('all');
    cam.rotate(30);
    expect(notes()).toContain('askew');
    expect(useCam.getState().flipNotes.some(blocksFlip)).toBe(true);
  });

  it('flips a text for the back in place and takes everything to the front again', () => {
    const cam = useCam.getState();
    cam.add([rectangle(0, 0, 200, 80)]);
    cam.addText('AB', { height: 20 });
    const text = () => items()[1]!;
    const drawn = text().contours.map((c) => c.points.map((p) => ({ ...p })));
    const box = itemsBounds([text()])!;
    cam.setTwoSided({ thickness: 12 });
    cam.setItem(text().id, { side: 'back' });
    // In its place, but mirrored left–right: it reads right on the turned part.
    const flipped = itemsBounds([text()])!;
    expect(flipped.minX).toBeCloseTo(box.minX, 9);
    expect(flipped.maxX).toBeCloseTo(box.maxX, 9);
    const mid = (box.minX + box.maxX) / 2;
    expect(text().contours[0]!.points[0]!.x).toBeCloseTo(2 * mid - drawn[0]![0]!.x, 9);
    expect(text().contours[0]!.points[0]!.y).toBeCloseTo(drawn[0]![0]!.y, 9);
    // Changing something else about it does not flip it again.
    cam.setItem(text().id, { depth: 0.5 });
    expect(text().contours[0]!.points[0]!.x).toBeCloseTo(2 * mid - drawn[0]![0]!.x, 9);
    // From the front only: the holes go, the text is as it was written, one program.
    expect(useFlip.getState().plan).not.toBeNull();
    cam.setTwoSided(null);
    cam.setTwoSided(null);
    expect(holes()).toEqual([]);
    expect(text().side).toBe('front');
    expect(text().contours[0]!.points[0]!.x).toBeCloseTo(drawn[0]![0]!.x, 9);
    expect(useJob.getState().fileName).toBe('zeichnung.nc');
    expect(useFlip.getState().plan).toBeNull();
    expect(notes()).toEqual([]);
  });

  it('keeps a front that is cut when only the back changes', () => {
    const cam = useCam.getState();
    cam.add([rectangle(0, 0, 200, 80), circle(60, 40, 30)]);
    cam.setTwoSided({ thickness: 12 });
    const pocket = items()[1]!;
    cam.setItem(pocket.id, { kind: 'pocket', depth: 3, side: 'back' });
    const cut = { zero: { x: 100, y: 50 }, pose: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 } };
    const frontCut = () => useFlip.setState({ phase: 'back', cut });
    frontCut();
    // The same drawing made again: nothing changes.
    cam.remake();
    expect(useFlip.getState().phase).toBe('back');
    // A deeper pocket on the back: the front stays cut, the back is laid onto the part anew.
    cam.setItem(pocket.id, { depth: 4 });
    expect(useFlip.getState().phase).toBe('turn');
    expect(useFlip.getState().cut).toEqual(cut);
    expect(useFlip.getState().plan!.back.text).toContain('Z-4');
    // A one-sided drawing in between does not end a job whose front is cut …
    cam.setItem(pocket.id, { side: 'front' });
    expect(useFlip.getState().plan).not.toBeNull();
    cam.setItem(pocket.id, { side: 'back' });
    expect(useFlip.getState().phase).toBe('turn');
    // … but a changed front is a new job.
    cam.setItem(items()[0]!.id, { depth: 5 });
    expect(useFlip.getState().phase).toBe('front');
    expect(useFlip.getState().cut).toBeNull();
    // Step back by hand, and out. (Finding the holes anew is for the camera.)
    frontCut();
    useFlip.getState().relocate();
    expect(useFlip.getState().phase).toBe('back');
    useFlip.getState().again();
    expect(useFlip.getState().phase).toBe('turn');
    useFlip.getState().finish();
    expect(useFlip.getState().phase).toBe('done');
    useFlip.getState().loadFront();
    expect(useJob.getState().fileName).toBe('zeichnung_vorderseite.nc');
    useFlip.getState().cancel();
    expect(useFlip.getState().plan).toBeNull();
  });
});

describe('the drawing as a drawing program', () => {
  beforeEach(() => {
    useCam.getState().close();
    useJob.getState().unload();
    useCam.getState().setSettings({ toolId: 't2', depth: 6, allowance: 0, engraveDepth: 1 });
  });
  const RECT: Sketch = { type: 'rect', w: 100, h: 60, r: 0 };
  const HOLE: Sketch = { type: 'circle', d: 20 };
  const selected = () => items().filter((i) => isSelected(i, useCam.getState().selected));
  const frame = () => selectionFrame(selected())!;

  it('puts a shape on the table at once, selected, where it is seen', () => {
    const cam = useCam.getState();
    // The first thing: its corner on the work zero, cut around the outside.
    expect(cam.addSketch(RECT)).toEqual([]);
    expect(box()).toEqual([0, 0, 100, 60]);
    expect(kinds()).toEqual(['outside']);
    expect(program()).toContain('X-3');
    // A hole goes into the middle of what is selected.
    cam.addSketch(HOLE);
    expect(box()).toEqual([40, 20, 60, 40]);
    expect(kinds()).toEqual(['outside', 'inside']);
    // The same again would lie hidden on its twin: a little beside it.
    cam.addSketch(HOLE);
    expect(box()).toEqual([50, 10, 70, 30]);
    // Nothing selected: the middle of the drawing. Out of view: the middle of the view.
    cam.select(null);
    cam.addSketch({ type: 'slot', l: 60, w: 10 });
    expect(box()).toEqual([20, 25, 80, 35]);
    cam.addSketch(
      { type: 'grid', d: 6, nx: 3, ny: 2, px: 30, py: 30 },
      {
        minX: 200,
        minY: 100,
        maxX: 400,
        maxY: 200,
      },
    );
    expect(box()).toEqual([267, 132, 333, 168]);
    expect(items()[4]!.contours).toHaveLength(6);
    // An empty drawing seen far from the work zero: the first thing goes where the eye is.
    cam.clear();
    cam.addSketch(RECT, { minX: 200, minY: 100, maxX: 400, maxY: 200 });
    expect(box()).toEqual([250, 120, 350, 180]);
    cam.clear();
    cam.addSketch(RECT, { minX: -10, minY: -10, maxX: 400, maxY: 200 });
    expect(box()).toEqual([0, 0, 100, 60]);
    // A text of nothing is nothing.
    expect(cam.addSketch({ ...TEXT, text: ' ' })).toEqual([]);
    expect(items()).toHaveLength(1);
  });
  const TEXT: Sketch & { type: 'text' } = {
    type: 'text',
    text: 'AB',
    height: 20,
    spacing: 0,
    lineSpacing: 1.6,
    align: 'center',
  };

  it('changes a drawn thing by its measures and keeps how it is cut', () => {
    const cam = useCam.getState();
    cam.addSketch(RECT);
    const id = items()[0]!.id;
    cam.setItem(id, { kind: 'pocket', depth: 3 });
    // Wider: the lower left corner stays, the pocket stays a pocket.
    cam.setSketch(id, { ...RECT, w: 150 }, 'w');
    expect(box()).toEqual([0, 0, 150, 60]);
    expect(items()[0]).toMatchObject({ kind: 'pocket', depth: 3, sketch: { w: 150 } });
    expect(program()).toContain('Z-3');
    // A circle and a long hole keep their middle.
    cam.addSketch(HOLE);
    cam.setSketch(items()[1]!.id, { type: 'circle', d: 40 });
    expect(box()).toEqual([55, 10, 95, 50]);
    // Turned a quarter, the rectangle still grows along its own width – upwards now.
    cam.select(items()[0]!.group);
    cam.rotate(90);
    expect(box()).toEqual([45, -45, 105, 105]);
    cam.setSketch(id, { ...RECT, w: 100 });
    expect(box()).toEqual([45, -45, 105, 55]);
    // A text gets other words around its anchor; nothing typed yet changes nothing.
    cam.addText('AB', { height: 20, align: 'center' });
    const text = items()[2]!;
    const before = itemsBounds([text])!;
    expect(cam.setSketch(text.id, { ...TEXT, text: 'ABBA' })).toEqual([]);
    const after = itemsBounds([items()[2]!])!;
    expect(after.maxX - after.minX).toBeGreaterThan(before.maxX - before.minX);
    expect((after.minX + after.maxX) / 2).toBeCloseTo((before.minX + before.maxX) / 2, 0);
    expect(cam.setSketch(text.id, { ...TEXT, text: 'ABAB☺' })).toEqual(['☺']);
    expect(items()[2]).toMatchObject({ text: 'ABAB☺', kind: 'on' });
    expect(items()[2]!.textStyle!.options.height).toBe(20);
    cam.setSketch(text.id, { ...TEXT, text: '  ' });
    expect(items()[2]!.text).toBe('ABAB☺');
    // What was not drawn here has no measures to change.
    cam.add([rectangle(0, 0, 10, 10)]);
    expect(cam.setSketch(items()[3]!.id, RECT)).toEqual([]);
    expect(cam.setSketch(999, RECT)).toEqual([]);
  });

  it('follows a handle: a shape by its measures, the side across staying', () => {
    const cam = useCam.getState();
    cam.addSketch(RECT);
    const made = program();
    // The right side pulled from 100 to 140.3, on whole millimetres.
    const pull = cam.edit('e', { x: 100, y: 30 })!;
    pull.move({ x: 140.3, y: 55 }, 1);
    expect(box()).toEqual([0, 0, 140, 60]);
    expect(items()[0]!.sketch).toEqual({ type: 'rect', w: 140, h: 60, r: 0 });
    // Only the outline so far; the toolpath follows when the finger lets go.
    expect(program()).toBe(made);
    pull.end();
    expect(program()).not.toBe(made);
    // The upper left corner: width and height at once, the lower right corner stays.
    const corner = cam.edit('nw', { x: 0, y: 60 })!;
    corner.move({ x: 40, y: 80 });
    corner.end();
    expect(box()).toEqual([40, 0, 140, 80]);
    // A circle only has one size.
    cam.addSketch(HOLE);
    const round = cam.edit('ne', { x: 100, y: 50 })!;
    round.move({ x: 110, y: 52 });
    round.end();
    expect(items()[1]!.sketch).toEqual({ type: 'circle', d: 30 });
    expect(box()).toEqual([80, 30, 110, 60]);
    // A handle that was only touched changes nothing and is no step to undo.
    const steps = useCam.getState().past.length;
    cam.edit('e', { x: 110, y: 45 })!.end();
    expect(useCam.getState().past).toHaveLength(steps);
    // Nothing selected, or a registration hole: no handles.
    cam.select(null);
    expect(cam.edit('e', { x: 0, y: 0 })).toBeNull();
  });

  it('turns by the turn handle and to a typed angle', () => {
    const cam = useCam.getState();
    cam.addSketch(RECT);
    const turn = cam.edit('turn', { x: 50, y: 75 })!;
    // From straight up to the left: a quarter turn around the middle.
    turn.move({ x: 5, y: 30 });
    turn.end();
    expect(box()).toEqual([20, -20, 80, 80]);
    expect(frameAngle(frame())).toBe(90);
    cam.setAngle(30);
    expect(frameAngle(frame())).toBe(30);
    expect(items()[0]!.sketch).toEqual(RECT);
    cam.setAngle(0);
    expect(box()).toEqual([0, 0, 100, 60]);
    cam.select(null);
    cam.setAngle(45);
    expect(box).toThrow();
  });

  it('scales what came from a file evenly – and a drawn shape among it by its measures', () => {
    const cam = useCam.getState();
    cam.add([rectangle(0, 0, 80, 40), circle(40, 20, 6)]);
    const pull = cam.edit('e', { x: 80, y: 20 })!;
    pull.move({ x: 160, y: 20 });
    pull.end();
    // Twice as wide means twice as high; the middle of the left side stays.
    expect(box()).toEqual([0, -20, 160, 60]);
    expect(items()[1]!.contours[0]!.circle).toMatchObject({ cx: 80, cy: 20, r: 6 });
    // By a typed size: the lower left corner stays.
    cam.scale(0.5);
    expect(box()).toEqual([0, -20, 80, 20]);
    cam.scale(0);
    expect(box()).toEqual([0, -20, 80, 20]);
    // Everything at once, a drawn rectangle among it: its measures take the scale.
    cam.addSketch(RECT);
    cam.select('all');
    const all = itemsBounds(items())!;
    cam.scale(2);
    const grown = itemsBounds(items())!;
    expect(grown.maxX - grown.minX).toBeCloseTo(2 * (all.maxX - all.minX));
    expect(grown.minX).toBeCloseTo(all.minX);
    expect(items()[2]!.sketch).toEqual({ type: 'rect', w: 200, h: 120, r: 0 });
    expect(Math.hypot(items()[2]!.placement.a, items()[2]!.placement.b)).toBeCloseTo(1);
    cam.select(null);
    cam.scale(2);
    expect(itemsBounds(items())).toEqual(grown);
  });

  it('nudges, places by the middle, and goes back and forth through its steps', () => {
    const cam = useCam.getState();
    cam.addSketch(RECT);
    cam.nudge(1, 0);
    cam.nudge(1, 0);
    cam.nudge(0, -10);
    expect(box()).toEqual([2, -10, 102, 50]);
    cam.centreTo(0, 0);
    expect(box()).toEqual([-50, -30, 50, 30]);
    // The nudges were one step, the placing another.
    cam.undo();
    expect(box()).toEqual([2, -10, 102, 50]);
    cam.undo();
    expect(box()).toEqual([0, 0, 100, 60]);
    cam.redo();
    expect(box()).toEqual([2, -10, 102, 50]);
    // Deleted – and back, selected as it was, with its toolpath.
    cam.removeSelection();
    expect(items()).toEqual([]);
    expect(useJob.getState().fileName).toBeNull();
    expect(useCam.getState().future).toEqual([]);
    cam.undo();
    expect(box()).toEqual([2, -10, 102, 50]);
    expect(useJob.getState().fileName).toBe('zeichnung.nc');
    // Typing a number is one step, however many keys it takes.
    const id = items()[0]!.id;
    const steps = useCam.getState().past.length;
    cam.setSketch(id, { ...RECT, w: 1 }, 'w');
    cam.setSketch(id, { ...RECT, w: 15 }, 'w');
    cam.setSketch(id, { ...RECT, w: 150 }, 'w');
    expect(useCam.getState().past).toHaveLength(steps + 1);
    cam.setSketch(id, { ...RECT, w: 150, h: 80 }, 'h');
    expect(useCam.getState().past).toHaveLength(steps + 2);
    // Selecting something in between starts a new step.
    cam.select(items()[0]!.group);
    cam.setSketch(id, { ...RECT, w: 150, h: 90 }, 'h');
    expect(useCam.getState().past).toHaveLength(steps + 3);
    // A finger's drag, the operation, an emptied drawing: each can be taken back.
    const drag = cam.drag()!;
    drag.move(10, 0);
    drag.end();
    cam.setItem(id, { kind: 'pocket' });
    cam.clear();
    expect(useJob.getState().fileName).toBeNull();
    cam.undo();
    expect(kinds()).toEqual(['pocket']);
    cam.undo();
    expect(kinds()).toEqual(['outside']);
    cam.undo();
    expect(box()).toEqual([2, -10, 152, 80]);
    // Nothing to go back or forward to: nothing happens.
    while (useCam.getState().past.length > 0) cam.undo();
    cam.undo();
    expect(items()).toEqual([]);
    // Forward again up to the emptying, which stays undone.
    while (useCam.getState().future.length > 1) cam.redo();
    expect(kinds()).toEqual(['pocket']);
    expect(box()).toEqual([12, -10, 162, 80]);
    cam.nudge(5, 5);
    expect(useCam.getState().future).toEqual([]);
    cam.redo();
    cam.select(null);
    cam.nudge(5, 5);
    cam.centreTo(0, 0);
    cam.removeItem(999);
    cam.select(items()[0]!.group);
    expect(box()).toEqual([17, -5, 167, 85]);
  });

  it('copies and pastes within the drawing', () => {
    const cam = useCam.getState();
    cam.paste();
    cam.addSketch(RECT);
    cam.copy();
    cam.paste();
    cam.paste();
    expect(items()).toHaveLength(3);
    // Each paste a little further from where it was copied; the copy is selected.
    expect(box()).toEqual([20, -20, 120, 40]);
    expect(items()[2]!.sketch).toEqual(RECT);
    cam.undo();
    expect(items()).toHaveLength(2);
    // Everything copied stays "everything"; nothing selected copies nothing new.
    cam.add([circle(0, 0, 6)]);
    cam.select('all');
    cam.copy();
    cam.paste();
    expect(items()).toHaveLength(6);
    expect(useCam.getState().selected).toBe('all');
    cam.select(null);
    cam.copy();
    cam.paste();
    expect(items()).toHaveLength(9);
    cam.close();
    cam.paste();
    cam.undo();
    cam.redo();
    expect(useCam.getState().project).toBeNull();
  });

  it('leaves a job that is not the drawing on the stage', () => {
    const cam = useCam.getState();
    cam.addSketch(RECT);
    useJob.getState().load('anderes.nc', 'G1 X1 F100');
    cam.removeSelection();
    expect(useJob.getState().fileName).toBe('anderes.nc');
    // A drawing never replaces a program that is not its own by itself – only the tap does.
    cam.addSketch({ type: 'rect', w: 2, h: 2, r: 0 });
    expect(useJob.getState().fileName).toBe('anderes.nc');
    expect(cam.remake({ take: true })).toBe(true);
    expect(useJob.getState().fileName).toBe('zeichnung.nc');
    // A drawing that cannot be cut takes its old toolpath away.
    cam.setItem(items()[0]!.id, { kind: 'inside' });
    expect(useCam.getState().problems).toEqual([{ row: 0, code: 'tool-too-large' }]);
    expect(useJob.getState().fileName).toBeNull();
    cam.setItem(items()[0]!.id, { kind: 'outside' });
    expect(useJob.getState().fileName).toBe('zeichnung.nc');
    cam.setItem(items()[0]!.id, { kind: 'none' });
    expect(useJob.getState().fileName).toBeNull();
  });
});
