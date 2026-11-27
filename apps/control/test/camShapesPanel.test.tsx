// @vitest-environment jsdom
import { circle, rectangle } from '@lowrider/cam';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CamCard } from '../src/components/CamCard';
import { t } from '../src/i18n';
import { itemsBounds } from '../src/lib/camItems';
import { START } from '../src/lib/camStart';
import { useCam } from '../src/store/cam';
import { openCam } from '../src/store/camPlace';
import { useFlip } from '../src/store/flip';
import { useJob } from '../src/store/job';
import { useUi } from '../src/store/ui';
import { useWorkshop } from '../src/store/workshop';

// jsdom has no observers; the segmented controls want them
class Quiet {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', Quiet);

const cam = () => useCam.getState();
const items = () => cam().project!.items;
const button = (name: string) => screen.getByRole('button', { name });
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const type = (label: string, value: string) =>
  fireEvent.change(field(label), { target: { value } });
const boxes = () =>
  items().map((i) => {
    const b = itemsBounds([i])!;
    return [b.minX, b.minY, b.maxX, b.maxY].map((v) => Math.round(v * 1e6) / 1e6 + 0);
  });
const stock = (w: number, h: number) =>
  useWorkshop.getState().setSetup({
    stock: { min: { x: 0, y: 0, z: -18 }, max: { x: w, y: h, z: 0 } },
    fixtures: [],
    fixtureFrame: 'machine',
  });

function scene() {
  cam().close();
  useJob.getState().unload();
  useFlip.getState().cancel();
  cam().setSettings({ toolId: 't2', depth: 6, allowance: 0, engraveDepth: 1 });
  useWorkshop.getState().setSetup({ stock: null, fixtures: [], fixtureFrame: 'machine' });
  useUi.getState().setDepth('camShapes', 'simple');
  useUi.getState().setDepth('camRadii', 'simple');
  useUi.getState().setDepth('camAlign', 'more');
  openCam();
}

describe('the further basic shapes in the add card', () => {
  beforeEach(scene);
  afterEach(cleanup);

  it('folds the four tiles away under "Weitere Grundformen", and keeps the fold as it was left', () => {
    render(<CamCard />);
    const fold = screen.getByTestId('cam-shapes-more');
    const trigger = fold.querySelector<HTMLElement>('[data-fold-trigger]')!;
    expect(trigger.textContent).toBe(t('cam.moreShapes'));
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    // closed: the row of tiles has the older ones only
    expect(screen.queryByRole('button', { name: t('cam.shapes.star') })).toBeNull();
    for (const shape of ['rect', 'circle', 'slot', 'grid'] as const) {
      expect(button(t(`cam.shapes.${shape}`))).not.toBeNull();
    }
    fireEvent.click(trigger);
    expect(useUi.getState().depth.camShapes).toBe('more');
    for (const shape of ['ellipse', 'star', 'gear', 'spiral'] as const) {
      expect(button(t(`cam.shapes.${shape}`))).not.toBeNull();
    }
    fireEvent.click(trigger);
    expect(useUi.getState().depth.camShapes).toBe('simple');
  });

  it('puts a shape on the table with one tap each – selected, at its usual size', () => {
    useUi.getState().setDepth('camShapes', 'more');
    render(<CamCard />);
    for (const shape of ['ellipse', 'star', 'gear', 'spiral'] as const) {
      fireEvent.click(button(t(`cam.shapes.${shape}`)));
      expect(items().at(-1)!.sketch).toEqual(START[shape]);
      expect(cam().selected).toBe(items().at(-1)!.group);
    }
    expect(items()).toHaveLength(4);
  });
});

describe('the numbers of the further shapes', () => {
  beforeEach(scene);
  afterEach(cleanup);

  it('shows each shape its own fields, and a number typed changes the drawing at once', () => {
    cam().addSketch(START.ellipse);
    render(<CamCard />);
    type(t('cam.fields.rx'), '55');
    expect(items()[0]!.sketch).toEqual({ type: 'ellipse', rx: 55, ry: 25 });
    type(t('cam.fields.ry'), '30,5');
    expect(items()[0]!.sketch).toEqual({ type: 'ellipse', rx: 55, ry: 30.5 });
    expect(boxes()[0]![2]! - boxes()[0]![0]!).toBeCloseTo(110, 6);
    // placed by its middle, as a circle is
    expect(screen.getByLabelText(t('cam.arrange.cx'))).not.toBeNull();

    act(() => cam().addSketch(START.star));
    type(t('cam.fields.points'), '7');
    type(t('cam.fields.outer'), '40');
    type(t('cam.fields.inner'), '16');
    expect(items()[1]!.sketch).toEqual({ type: 'star', points: 7, outer: 40, inner: 16 });
    // a star has no middle of its box: placed by its lower left corner, like a rectangle
    expect(screen.queryByLabelText(t('cam.arrange.cx'))).toBeNull();
    expect(screen.getByLabelText(t('cam.arrange.x'))).not.toBeNull();

    act(() => cam().addSketch(START.gear));
    type(t('cam.fields.teeth'), '24');
    type(t('cam.fields.root'), '27');
    expect(items()[2]!.sketch).toEqual({ type: 'gear', teeth: 24, outer: 30, root: 27 });

    act(() => cam().addSketch(START.spiral));
    type(t('cam.fields.turns'), '2,5');
    type(t('cam.fields.start'), '0');
    type(t('cam.fields.end'), '20');
    expect(items()[3]!.sketch).toEqual({ type: 'spiral', turns: 2.5, start: 0, end: 20 });
  });

  it('shows a number as it is drawn: 99 tips are 32, and the field says so', () => {
    cam().addSketch(START.star);
    render(<CamCard />);
    type(t('cam.fields.points'), '99');
    // what was typed is kept, what is drawn and said is what the star can be
    expect(items()[0]!.sketch).toMatchObject({ points: 99 });
    expect(field(t('cam.fields.points')).value).toBe('32');
    expect(screen.getByTestId('cam-selected').textContent).toContain('Stern mit 32 Spitzen');
    // an inner radius beyond the outer one is shown as the outer one
    type(t('cam.fields.inner'), '50');
    expect(field(t('cam.fields.inner')).value).toBe('30');
  });

  it('does not take a number below what a shape can be', () => {
    cam().addSketch(START.gear);
    render(<CamCard />);
    // 5 teeth are fewer than a gear can have (6): ignored, the shape stays as it is
    type(t('cam.fields.teeth'), '5');
    expect(items()[0]!.sketch).toMatchObject({ teeth: 16 });
    type(t('cam.fields.teeth'), '6');
    expect(items()[0]!.sketch).toMatchObject({ teeth: 6 });
  });
});

describe('the radii of the corners of a rectangle', () => {
  beforeEach(scene);
  afterEach(cleanup);

  const fold = () => screen.getByTestId('cam-radii');
  const open = () => {
    const trigger = fold().querySelector<HTMLElement>('[data-fold-trigger]')!;
    if (trigger.getAttribute('aria-expanded') === 'false') fireEvent.click(trigger);
  };

  it('is folded away under "Ecken einzeln", only for a rectangle, remembered once opened', () => {
    cam().addSketch(START.circle);
    render(<CamCard />);
    expect(screen.queryByTestId('cam-radii')).toBeNull();
    act(() => cam().addSketch(START.rect));
    const trigger = fold().querySelector<HTMLElement>('[data-fold-trigger]')!;
    expect(trigger.textContent).toBe(t('cam.radii.title'));
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('textbox', { name: t('cam.radii.ul') })).toBeNull();
    fireEvent.click(trigger);
    expect(useUi.getState().depth.camRadii).toBe('more');
    for (const corner of ['ul', 'ur', 'll', 'lr'] as const) {
      expect(field(t(`cam.radii.${corner}`)).value).toBe('0');
    }
    // a text of the way it works
    expect(fold().textContent).toContain(t('cam.radii.hint'));
  });

  it('puts the number of a corner on that corner – and the field for all says "verschieden"', () => {
    cam().addSketch(START.rect);
    render(<CamCard />);
    open();
    // the one radius for all is a number as long as the corners are alike
    expect(field(t('cam.fields.r')).value).toBe('0');
    type(t('cam.radii.ul'), '12');
    expect(items()[0]!.sketch).toMatchObject({ type: 'rect', radii: [0, 0, 0, 12] });
    // the others are as they were: upper left is the fourth place (lower left, lower right, upper right, upper left)
    expect(field(t('cam.radii.ul')).value).toBe('12');
    expect(field(t('cam.radii.ur')).value).toBe('0');
    expect(field(t('cam.radii.ll')).value).toBe('0');
    // the field for all is empty and says why
    expect(field(t('cam.fields.r')).value).toBe('');
    expect(field(t('cam.fields.r')).placeholder).toBe(t('cam.radii.mixed'));
    type(t('cam.radii.lr'), '5');
    type(t('cam.radii.ur'), '20');
    type(t('cam.radii.ll'), '8');
    expect(items()[0]!.sketch).toMatchObject({ radii: [8, 5, 20, 12] });
    // the contour is the one the library draws for those radii
    expect(items()[0]!.source[0]).toEqual(
      expect.objectContaining({
        closed: true,
        points: expect.arrayContaining([expect.objectContaining({ x: 50, y: 10 })]),
      }),
    );
    // each number is its own step of undo
    act(() => cam().undo());
    expect(items()[0]!.sketch).toMatchObject({ radii: [0, 5, 20, 12] });
  });

  it('takes all four corners with the radius for all – and shows it as one radius again', () => {
    cam().addSketch(START.rect);
    render(<CamCard />);
    open();
    type(t('cam.radii.ul'), '12');
    type(t('cam.radii.lr'), '3');
    expect(field(t('cam.fields.r')).value).toBe('');
    type(t('cam.fields.r'), '7');
    // the radii that were there are gone: all are 7
    expect(items()[0]!.sketch).toEqual({ type: 'rect', w: 100, h: 60, r: 7 });
    for (const corner of ['ul', 'ur', 'll', 'lr'] as const) {
      expect(field(t(`cam.radii.${corner}`)).value).toBe('7');
    }
    expect(field(t('cam.fields.r')).value).toBe('7');
    // emptying the field changes nothing
    type(t('cam.radii.ul'), '1');
    fireEvent.change(field(t('cam.fields.r')), { target: { value: '' } });
    expect(items()[0]!.sketch).toMatchObject({ radii: [7, 7, 7, 1] });
  });

  it('holds a radius to half of the shorter side in what it draws, and shows it so', () => {
    cam().addSketch(START.rect);
    render(<CamCard />);
    open();
    type(t('cam.radii.ll'), '500');
    // 100 × 60: 30 at most
    expect(field(t('cam.radii.ll')).value).toBe('30');
    expect(items()[0]!.source[0]!.points.some((p) => Math.abs(p.x + 20) < 1e-9)).toBe(true);
  });
});

describe('packing the selected parts onto the stock', () => {
  beforeEach(() => {
    scene();
    cam().add([rectangle(300, 300, 60, 40)]);
    cam().add([rectangle(500, 100, 60, 40)]);
    cam().add([rectangle(700, 100, 60, 40)]);
  });
  afterEach(() => {
    cleanup();
    useWorkshop.getState().setSetup({ stock: null, fixtures: [], fixtureFrame: 'machine' });
  });

  const result = () => screen.queryByTestId('cam-nest-result');
  const gap = () => field(t('cam.nest.gap'));

  it('is in the align panel: shown from two units, with the words of what it is – boxes, no interlocking', () => {
    render(<CamCard />);
    const [a, b] = items().map((i) => i.group) as [number, number, number];
    act(() => cam().select(a));
    expect(screen.queryByTestId('cam-nest')).toBeNull();
    act(() => cam().select([a, b]));
    const panel = screen.getByTestId('cam-align');
    expect(within(panel).getByTestId('cam-nest')).not.toBeNull();
    const hint = within(panel).getByTestId('cam-nest-hint').textContent!;
    expect(hint).toBe(t('cam.nest.hint'));
    // said plainly: the boxes are packed, shapes do not interlock; what lies in a box goes with it; no rim
    expect(hint).toContain('Rahmen');
    expect(hint).toContain('nicht ineinander');
    expect(hint).toContain('Rand');
  });

  it('is closed with its reason where there is no stock – "Rohteil eingeben"', () => {
    render(<CamCard />);
    act(() => cam().select('all'));
    const nest = screen.getByTestId('cam-nest');
    expect(nest.hasAttribute('disabled')).toBe(true);
    expect(nest.getAttribute('data-reason')).toBe(t('cam.nest.needStock'));
    expect(nest.getAttribute('data-reason')).toContain('Rohteil eingeben');
    fireEvent.click(nest);
    expect(cam().nested).toBeNull();
    expect(result()).toBeNull();
    // the stock is entered: it can act (the panel follows the stock where it is, no reload)
    act(() => stock(130, 40));
    expect(screen.getByTestId('cam-nest').hasAttribute('disabled')).toBe(false);
    expect(screen.getByTestId('cam-nest').getAttribute('data-reason')).toBeNull();
  });

  it('shows the default gap as the placeholder – the cutter and 2 mm – and packs with the one typed', () => {
    stock(130, 40);
    render(<CamCard />);
    const [a, b] = items().map((i) => i.group) as [number, number, number];
    act(() => cam().select([a, b]));
    expect(gap().value).toBe('');
    // the 6 mm cutter
    expect(gap().placeholder).toBe('8');
    fireEvent.click(screen.getByTestId('cam-nest'));
    expect(boxes().slice(0, 2)).toEqual([
      [0, 0, 60, 40],
      [68, 0, 128, 40],
    ]);
    act(() => cam().undo());
    type(t('cam.nest.gap'), '10');
    fireEvent.click(screen.getByTestId('cam-nest'));
    expect(boxes().slice(0, 2)).toEqual([
      [0, 0, 60, 40],
      [70, 0, 130, 40],
    ]);
  });

  it('says what it did in the card, names what has no place, and is gone with the next change', () => {
    stock(130, 40);
    render(<CamCard />);
    act(() => cam().select('all'));
    type(t('cam.nest.gap'), '10');
    const was = cam().past.length;
    fireEvent.click(screen.getByTestId('cam-nest'));
    expect(cam().past.length).toBe(was + 1);
    const line = result()!;
    expect(line.textContent).toContain('2 Teile verschachtelt.');
    expect(line.textContent).toContain('Die Rahmen belegen 92 % des Rohteils.');
    // the third part: named by what it is, and said to stay where it was
    const unplaced = within(line).getByTestId('cam-nest-unplaced');
    expect(unplaced.textContent).toBe(
      '1 Teil passt nicht auf das Rohteil und bleibt, wo es war: Kontur 60 × 40 mm.',
    );
    expect(line.getAttribute('data-nest-moved')).toBe('2');
    expect(JSON.parse(line.getAttribute('data-nest-unplaced')!)).toEqual([items()[2]!.group]);
    // "Rückgängig" is the ordinary undo: the report goes with it
    fireEvent.click(button(t('cam.undo')));
    expect(boxes()[0]).toEqual([300, 300, 360, 340]);
    expect(result()).toBeNull();
    // redone, it is the drawing it was made for again – but a report is of one moment: it does not come back
    expect(cam().nested).not.toBeNull();
    // another change takes the report away
    fireEvent.click(screen.getByTestId('cam-nest'));
    expect(result()).not.toBeNull();
    act(() => cam().nudge(1, 0));
    expect(result()).toBeNull();
  });

  it('warns in the card when a packed part lands on one that stays – and names it', () => {
    // a fourth part lies on the stock, not selected: the first of the two packed lands on it
    cam().add([rectangle(10, 10, 60, 40)]);
    stock(200, 100);
    render(<CamCard />);
    const [a, b, , lying] = items().map((i) => i.group) as [number, number, number, number];
    act(() => cam().select([a, b]));
    // the hint says before the tap that this can happen
    expect(screen.getByTestId('cam-nest-hint').textContent).toContain('darauf zu liegen kommen');
    type(t('cam.nest.gap'), '8');
    fireEvent.click(screen.getByTestId('cam-nest'));
    const line = result()!;
    const warning = within(line).getByTestId('cam-nest-overlapped');
    expect(warning.textContent).toBe(
      'Achtung: 1 Teil, das liegen bleibt, überlappt ein verschachteltes Teil – beide würden ineinander gefräst: Kontur 60 × 40 mm. Eines von beiden verschieben oder ausblenden.',
    );
    expect(JSON.parse(line.getAttribute('data-nest-overlapped')!)).toEqual([lying]);
    // no warning where nothing is covered: the part that stays is moved away, the report is of an older drawing
    act(() => {
      cam().select(lying);
      cam().nudge(300, 300);
      cam().select([a, b]);
    });
    expect(result()).toBeNull();
    fireEvent.click(screen.getByTestId('cam-nest'));
    expect(within(result()!).queryByTestId('cam-nest-overlapped')).toBeNull();
  });

  it('counts more than one part that has no place', () => {
    stock(70, 40);
    render(<CamCard />);
    act(() => cam().select('all'));
    type(t('cam.nest.gap'), '10');
    fireEvent.click(screen.getByTestId('cam-nest'));
    expect(screen.getByTestId('cam-nest-unplaced').textContent).toBe(
      '2 Teile passen nicht auf das Rohteil und bleiben, wo sie waren: Kontur 60 × 40 mm, Kontur 60 × 40 mm.',
    );
  });

  it('says so where the parts lie so already, and where a hole went with its plate', () => {
    stock(130, 40);
    render(<CamCard />);
    const [a, b] = items().map((i) => i.group) as [number, number, number];
    act(() => cam().select([a, b]));
    type(t('cam.nest.gap'), '10');
    fireEvent.click(screen.getByTestId('cam-nest'));
    // the same again: nothing to move
    fireEvent.click(screen.getByTestId('cam-nest'));
    expect(result()!.textContent).toContain(t('cam.nest.nothingMoved'));
    expect(result()!.getAttribute('data-nest-moved')).toBe('0');
    // a hole that lies in the first plate rides along with it – said, though nothing has to move
    act(() => cam().add([circle(20, 20, 10)]));
    act(() => cam().select([a, b]));
    fireEvent.click(screen.getByTestId('cam-nest'));
    expect(result()!.textContent).toContain(t('cam.nest.riders', { n: 1 }));
    expect(result()!.textContent).toContain(t('cam.nest.nothingMoved'));
  });

  it('stays while the selection changes, and does not say a word of the old one about a new one', () => {
    stock(130, 40);
    render(<CamCard />);
    const [a, b, c] = items().map((i) => i.group) as [number, number, number];
    act(() => cam().select([a, b]));
    type(t('cam.nest.gap'), '10');
    fireEvent.click(screen.getByTestId('cam-nest'));
    expect(result()).not.toBeNull();
    // another selection is another question
    act(() => cam().select([b, c]));
    expect(result()).toBeNull();
    // what was typed stays with the card
    expect(gap().value).toBe('10');
    act(() => cam().select([a, b]));
    expect(result()).not.toBeNull();
  });

  it('asks for turning with a box of its own, off at first – 90° only', () => {
    // 45 wide and 200 high: a plate of 60 × 40 fits only turned (40 × 60), three of them one above the other
    stock(45, 200);
    render(<CamCard />);
    act(() => cam().select('all'));
    const box = () => screen.getByRole('checkbox', { name: t('cam.nest.rotate') });
    expect(t('cam.nest.rotate')).toContain('90°');
    expect(box().getAttribute('aria-checked')).toBe('false');
    // each box is a full target: the label around it is the target
    expect(box().closest('label')).not.toBeNull();
    type(t('cam.nest.gap'), '0');
    fireEvent.click(screen.getByTestId('cam-nest'));
    expect(cam().nested!.rotate).toBe(false);
    expect(cam().nested!.placed).toEqual([]);
    expect(boxes()[0]).toEqual([300, 300, 360, 340]);
    fireEvent.click(box());
    expect(box().getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByTestId('cam-nest'));
    expect(cam().nested!.rotate).toBe(true);
    expect(cam().nested!.unplaced).toEqual([]);
    // every plate stands turned: 40 wide, 60 high, one above the other
    expect(boxes()).toEqual([
      [0, 0, 40, 60],
      [0, 60, 40, 120],
      [0, 120, 40, 180],
    ]);
  });

  it('warns a two-sided drawing to group what belongs together first', () => {
    stock(400, 100);
    cam().setTwoSided({});
    render(<CamCard />);
    act(() => cam().select('all'));
    expect(
      within(screen.getByTestId('cam-align')).queryByText(t('cam.nest.twoSided')),
    ).not.toBeNull();
  });
});
