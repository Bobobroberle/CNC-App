import { SKETCH_LIMITS, tidySketch, type AnySketch, type Radii, type Sketch } from '@lowrider/cam';
import { useRef, useState } from 'react';
import { t, type MessageKey } from '../i18n';
import { EDGES, unitsOf, type Axis, type Edge, type Spread } from '../lib/camArrange';
import { frameAngle, frameSize, selectionFrame } from '../lib/camEdit';
import { isSelected, itemsBounds, partsOf, type CamItem } from '../lib/camItems';
import { measurement } from '../lib/camMeasure';
import { defaultNestGap } from '../lib/camNest';
import { formatNumber, formatSigned } from '../lib/format';
import { useCam } from '../store/cam';
import { useCamCutters } from '../store/camTools';
import { widestCutter } from '../lib/camTools';
import { useUi } from '../store/ui';
import { useWorkshop } from '../store/workshop';
import { describeItem, describeGroup, mm, NumberField } from './camParts';
import { Icon, type IconName } from './Icon';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { Fold } from './Fold';
import { OrderPanel, PathPanel } from './CamPath';
import { ColorSelect } from './CamColors';
import { TextBlock } from './CamText';

/** Whole numbers for columns and rows, at least 1. */
const count = (v: number | undefined) => Math.max(1, Math.round(v ?? 1));

/** The six ways to align, in the order of the buttons: the horizontal three, then the vertical three. */
const EDGE_ICONS: Record<Edge, IconName> = {
  left: 'alignLeft',
  centre: 'alignCentre',
  right: 'alignRight',
  top: 'alignTop',
  middle: 'alignMiddle',
  bottom: 'alignBottom',
};

/** The four ways to spread: along each axis, equal room or equal middles. */
const SPREADS: { axis: Axis; mode: Spread; icon: IconName }[] = [
  { axis: 'h', mode: 'gaps', icon: 'spreadH' },
  { axis: 'h', mode: 'centres', icon: 'centresH' },
  { axis: 'v', mode: 'gaps', icon: 'spreadV' },
  { axis: 'v', mode: 'centres', icon: 'centresV' },
];

/**
 * "Mehrfachauswahl": while it is on, a tap on a part – on the table – takes it into the selection or lets
 * go of it, and a tap beside everything keeps the selection. Without it a tap picks one part alone; the
 * checkboxes of the list work either way.
 */
function MultiSwitch() {
  const multi = useCam((s) => s.multi);
  return (
    <div className="flex flex-col" data-find="cam-multi">
      <Label className="min-h-target gap-3 font-normal">
        <Checkbox
          checked={multi}
          data-testid="cam-multi"
          onCheckedChange={(on) => useCam.getState().setMulti(on)}
        />
        <span>{t('cam.arrange.multi')}</span>
      </Label>
      {multi ? (
        <p className="text-muted-foreground text-sm" data-testid="cam-multi-hint">
          {t('cam.arrange.multiHint')}
        </p>
      ) : null}
    </div>
  );
}

/**
 * "Rahmen aufziehen": while it is on, a drag across the table draws a rectangle that takes the parts it
 * touches into the selection on release – nothing in the drawing moves meanwhile. It adds to the selection
 * where "Mehrfachauswahl" is on (or Shift/Ctrl is held), otherwise it replaces it. The two switches
 * combine: Mehrfachauswahl says what a tap and a rectangle do to the set, the rectangle says what a drag does.
 */
function MarqueeSwitch() {
  const marquee = useCam((s) => s.marquee);
  return (
    <div className="flex flex-col" data-find="cam-marquee">
      <Label className="min-h-target gap-3 font-normal">
        <Checkbox
          checked={marquee}
          data-testid="cam-marquee"
          onCheckedChange={(on) => useCam.getState().setMarquee(on)}
        />
        <span>{t('cam.arrange.marquee')}</span>
      </Label>
      {marquee ? (
        <p className="text-muted-foreground text-sm" data-testid="cam-marquee-hint">
          {t('cam.arrange.marqueeHint')}
        </p>
      ) : null}
    </div>
  );
}

/**
 * "Fangen": while a part is dragged on the table its box snaps to the lines of the other parts and of the stock.
 * On until switched off – this device's choice, no step of the drawing; Alt (Option) turns it off for one drag.
 */
function SnapSwitch() {
  const snap = useUi((s) => s.aids.snap);
  return (
    <div className="flex flex-col" data-find="cam-snap">
      <Label className="min-h-target gap-3 font-normal">
        <Checkbox
          checked={snap}
          data-testid="cam-snap"
          onCheckedChange={(on) => useUi.getState().setAids({ snap: on })}
        />
        <span>{t('cam.arrange.snap')}</span>
      </Label>
      {snap ? (
        <>
          <p className="text-muted-foreground text-sm" data-testid="cam-snap-hint">
            {t('cam.arrange.snapHint')}
          </p>
          {/* Alt is a key of a computer: said only where a keyboard is likely (DESIGN.md §8) */}
          <p className="kbd-hint text-muted-foreground text-sm" data-testid="cam-snap-alt">
            {t('cam.arrange.snapAlt')}
          </p>
        </>
      ) : null}
    </div>
  );
}

/** "Abstände zeigen": while a part is dragged the room to its neighbours shows as dimension lines. Own switch, on. */
function GapsSwitch() {
  const gaps = useUi((s) => s.aids.gaps);
  return (
    <div className="flex flex-col" data-find="cam-gaps">
      <Label className="min-h-target gap-3 font-normal">
        <Checkbox
          checked={gaps}
          data-testid="cam-gaps"
          onCheckedChange={(on) => useUi.getState().setAids({ gaps: on })}
        />
        <span>{t('cam.arrange.gaps')}</span>
      </Label>
    </div>
  );
}

/**
 * "Fangen" and "Abstände zeigen" together, folded away until they are wanted: both are on from the start, so
 * nothing is needed from them every time – and their switches and words would otherwise stand above the real
 * actions of the card, most of all in the small sheet of the machine's screen (DESIGN.md §2). Closed until it is
 * opened once, then as it was left (`useUi.depth`); the quick search unfolds it for either switch.
 */
function DragAids() {
  const open = useUi((s) => s.depth.camAids === 'more');
  return (
    <Fold
      title={t('cam.arrange.aids')}
      testId="cam-aids"
      open={open}
      onOpenChange={(next) => useUi.getState().setDepth('camAids', next ? 'more' : 'simple')}
    >
      <div className="contents">
        <SnapSwitch />
        <GapsSwitch />
      </div>
    </Fold>
  );
}

/**
 * "Messen": a tap on the table sets the point A, the next one B, a third starts again; the distance, ΔX, ΔY and
 * the angle stand on the picture and here. Nothing is selected, changed or remembered by it. A mode of the
 * screen like the two above – it ends them (they give a tap or a drag another meaning) and they end it.
 */
function MeasureSwitch() {
  const measure = useCam((s) => s.measure);
  const { a, b } = useCam((s) => s.measured);
  const result = a && b ? measurement(a, b) : null;
  return (
    <div className="flex flex-col" data-find="cam-measure">
      <Label className="min-h-target gap-3 font-normal">
        <Checkbox
          checked={measure}
          data-testid="cam-measure"
          onCheckedChange={(on) => useCam.getState().setMeasure(on)}
        />
        <span>{t('cam.arrange.measure')}</span>
      </Label>
      {measure && !a ? (
        <p className="text-muted-foreground text-sm" data-testid="cam-measure-hint">
          {t('cam.arrange.measureHint')}
        </p>
      ) : null}
      {measure && a ? (
        <div className="flex flex-col gap-2" data-testid="cam-measure-result">
          {result ? (
            <>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 tabular-nums">
                <dt className="font-medium">{t('cam.measure.distance')}</dt>
                <dd className="font-mono" data-testid="cam-measure-distance">
                  {t('cam.measure.mm', { v: formatNumber(result.distance, 2) })}
                </dd>
                <dt className="font-medium">{t('cam.measure.dx')}</dt>
                <dd className="font-mono" data-testid="cam-measure-dx">
                  {t('cam.measure.mm', { v: formatSigned(result.dx, 2, true) })}
                </dd>
                <dt className="font-medium">{t('cam.measure.dy')}</dt>
                <dd className="font-mono" data-testid="cam-measure-dy">
                  {t('cam.measure.mm', { v: formatSigned(result.dy, 2, true) })}
                </dd>
                <dt className="font-medium">{t('cam.measure.angle')}</dt>
                <dd className="font-mono" data-testid="cam-measure-angle">
                  {t('cam.measure.deg', { v: formatSigned(result.angle, 1) })}
                </dd>
              </dl>
              <p className="text-muted-foreground text-sm">{t('cam.measure.angleNote')}</p>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">{t('cam.measure.onlyA')}</p>
          )}
          <Button variant="outline" onClick={() => useCam.getState().clearMeasure()}>
            {t('cam.measure.clear')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** What a button with an icon says: the icon, then the word. */
const withIcon = (icon: IconName, text: string) => (
  <span className="with-icon">
    <Icon name={icon} size={20} /> {text}
  </span>
);

/**
 * Aligning and spreading what is selected, as in a drawing program: the units are the groups, each rigid.
 * Aligned to the whole box of the selection (the part that lies furthest out stays); spread along an axis
 * with the two outermost staying. Each button is one step of undo.
 */
function AlignPanel({ units, nest }: { units: number; nest: NestFields }) {
  const cam = useCam.getState();
  // Open until it is folded once, and then as it was left: it shows and goes with the selection, so what was
  // chosen must not come back at every new one (the depth of the drawing's area, `useUi.depth`)
  const open = useUi((s) => (s.depth.camAlign ?? 'more') !== 'simple');
  return (
    <Fold
      title={t('cam.align.title')}
      find="cam-align"
      testId="cam-align"
      open={open}
      onOpenChange={(next) => useUi.getState().setDepth('camAlign', next ? 'more' : 'simple')}
    >
      <div className="contents">
        <p className="text-muted-foreground text-sm">{t('cam.align.hint', { n: units })}</p>
        <div className="cam-actions three">
          {EDGES.map((edge) => (
            <Button
              key={edge}
              variant="outline"
              aria-label={t(`cam.align.${edge}Label`)}
              onClick={() => cam.align(edge)}
            >
              {withIcon(EDGE_ICONS[edge], t(`cam.align.${edge}`))}
            </Button>
          ))}
        </div>
        <p className="text-sm font-medium">{t('cam.align.spreadTitle')}</p>
        <p className="text-muted-foreground text-sm">{t('cam.align.spreadHint')}</p>
        <div className="cam-actions two">
          {SPREADS.map(({ axis, mode, icon }) => (
            <Button
              key={`${axis}${mode}`}
              variant="outline"
              disabled={units < 3}
              reason={t('cam.align.needThree')}
              aria-label={t(`cam.align.spread.${axis}.${mode}Label`)}
              onClick={() => cam.distribute(axis, mode)}
            >
              {withIcon(icon, t(`cam.align.spread.${axis}.${mode}`))}
            </Button>
          ))}
        </div>
        <NestPanel {...nest} />
      </div>
    </Fold>
  );
}

/** What is typed for "Verschachteln": kept by the card of the selection, so it stays while the selection changes */
interface NestFields {
  /** The room between parts, mm; undefined is the default (the cutter and 2 mm) */
  gap: number | undefined;
  setGap(v: number | undefined): void;
  rotate: boolean;
  setRotate(on: boolean): void;
}

/**
 * "Verschachteln": the selected parts packed onto the entered stock by their boxes (`store/cam.ts` `nest`). The
 * button needs the stock (the Job room) and says so where it has none. What it did stands under it – in the
 * card, not a toast – for as long as the drawing and the selection are as it left them; "Rückgängig" is the
 * ordinary undo. The words are plain about what it is: boxes, no interlocking.
 */
function NestPanel({ gap, setGap, rotate, setRotate }: NestFields) {
  const cam = useCam.getState();
  const stock = useWorkshop((s) => s.setup.stock);
  // The gap leaves room for the widest cutter of the program
  const tool = widestCutter(useCamCutters());
  const twoSided = useCam((s) => s.project?.twoSided != null);
  const items = useCam((s) => s.project?.items);
  const selected = useCam((s) => s.selected);
  const report = useCam((s) => s.nested);
  const shown =
    report && report.items === items && JSON.stringify(report.selected) === JSON.stringify(selected)
      ? report
      : null;
  const placed = shown?.placed.length ?? 0;
  const unplaced = shown?.unplaced ?? [];
  const overlapped = shown?.overlapped ?? [];
  const answer = useRef<HTMLDivElement>(null);
  return (
    <>
      <p className="text-sm font-medium">{t('cam.nest.title')}</p>
      <p className="text-muted-foreground text-sm" data-testid="cam-nest-hint">
        {t('cam.nest.hint')}
      </p>
      {twoSided ? <p className="text-muted-foreground text-sm">{t('cam.nest.twoSided')}</p> : null}
      <div className="grid grid-cols-2 gap-2 items-end">
        <NumberField
          label="cam.nest.gap"
          value={gap}
          placeholder={mm(defaultNestGap(tool))}
          onChange={setGap}
        />
        <Label className="min-h-target gap-3 font-normal">
          <Checkbox
            checked={rotate}
            data-testid="cam-nest-rotate"
            onCheckedChange={(on) => setRotate(on)}
          />
          <span>{t('cam.nest.rotate')}</span>
        </Label>
      </div>
      <Button
        variant="outline"
        data-find="cam-nest"
        data-testid="cam-nest"
        disabled={!stock}
        reason={t('cam.nest.needStock')}
        onClick={() => {
          cam.nest({ gap, rotate });
          // The answer stands below the button, where the panel may end: brought into view once, by this tap (not
          // by showing it again with another selection – that would take a ticked row from under the finger)
          requestAnimationFrame(() => answer.current?.scrollIntoView?.({ block: 'nearest' }));
        }}
      >
        {withIcon('nest', t('cam.nest.button'))}
      </Button>
      {shown ? (
        <div
          ref={answer}
          className="flex flex-col gap-1 text-sm"
          role="status"
          data-testid="cam-nest-result"
          data-nest-placed={shown.placed.length}
          data-nest-moved={shown.moved}
          data-nest-unplaced={JSON.stringify(unplaced)}
          data-nest-overlapped={JSON.stringify(overlapped)}
        >
          {placed > 0 ? (
            <p>
              {shown.moved === 0
                ? t('cam.nest.nothingMoved')
                : placed === 1
                  ? t('cam.nest.placedOne')
                  : t('cam.nest.placedMany', { n: placed })}
            </p>
          ) : null}
          {shown.riders > 0 ? <p>{t('cam.nest.riders', { n: shown.riders })}</p> : null}
          {placed > 0 ? (
            <p className="text-muted-foreground">
              {t('cam.nest.used', { p: Math.round(shown.used * 100) })}
            </p>
          ) : null}
          {unplaced.length > 0 ? (
            <Alert variant="warning" data-testid="cam-nest-unplaced">
              {t(unplaced.length === 1 ? 'cam.nest.unplacedOne' : 'cam.nest.unplacedMany', {
                n: unplaced.length,
                names: unplaced.map((g) => describeGroup(items ?? [], g)).join(', '),
              })}
            </Alert>
          ) : null}
          {/* The packer knows no obstacles: a part that stays can lie under a packed one – said, not hidden */}
          {overlapped.length > 0 ? (
            <Alert variant="warning" data-testid="cam-nest-overlapped">
              {t(overlapped.length === 1 ? 'cam.nest.overlapOne' : 'cam.nest.overlapMany', {
                n: overlapped.length,
                names: overlapped.map((g) => describeGroup(items ?? [], g)).join(', '),
              })}
            </Alert>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

/** The measures of a drawn thing as fields: which value, its label, and the smallest it takes. */
type Measure = {
  field: string;
  label: MessageKey;
  value: number | undefined;
  min?: number;
  hint?: string;
};

const { radius, starPoints, gearTeeth, spiralTurns } = SKETCH_LIMITS;

/**
 * The sketch as the fields show it: the curved shapes and a rectangle with a radius for each corner as they are
 * drawn (what was typed beyond a range is shown as the range holds it, so a star never says 99 tips and draws
 * 32); the older types as they are stored, as they always were.
 */
function drawn(s: AnySketch): AnySketch {
  return (s.type === 'rect' && !s.radii) ||
    s.type === 'circle' ||
    s.type === 'slot' ||
    s.type === 'grid' ||
    s.type === 'text'
    ? s
    : tidySketch(s);
}

function measures(s: AnySketch): Measure[] {
  switch (s.type) {
    case 'rect':
      return [
        { field: 'w', label: 'cam.fields.w', value: s.w },
        { field: 'h', label: 'cam.fields.h', value: s.h },
        // With a radius for each corner that differ, this one says "alle gleich" by being empty: typing sets all four
        {
          field: 'r',
          label: 'cam.fields.r',
          value: s.radii ? undefined : s.r,
          min: 0,
          hint: s.radii ? t('cam.radii.mixed') : undefined,
        },
      ];
    case 'circle':
      return [{ field: 'd', label: 'cam.fields.d', value: s.d }];
    case 'slot':
      return [
        { field: 'l', label: 'cam.fields.l', value: s.l },
        { field: 'w', label: 'cam.fields.slotW', value: s.w },
      ];
    case 'grid':
      return [
        { field: 'd', label: 'cam.fields.d', value: s.d },
        { field: 'nx', label: 'cam.fields.nx', value: s.nx, min: 1 },
        { field: 'ny', label: 'cam.fields.ny', value: s.ny, min: 1 },
        { field: 'px', label: 'cam.fields.px', value: s.px },
        { field: 'py', label: 'cam.fields.py', value: s.py },
      ];
    case 'text':
      // (the height of a text is in its own block, "Schrift", with the words and the face)
      return [];
    case 'ellipse':
      return [
        { field: 'rx', label: 'cam.fields.rx', value: s.rx, min: radius.min },
        { field: 'ry', label: 'cam.fields.ry', value: s.ry, min: radius.min },
      ];
    case 'star':
      return [
        { field: 'points', label: 'cam.fields.points', value: s.points, min: starPoints.min },
        { field: 'outer', label: 'cam.fields.outer', value: s.outer, min: radius.min },
        { field: 'inner', label: 'cam.fields.inner', value: s.inner, min: radius.min },
      ];
    case 'gear':
      return [
        { field: 'teeth', label: 'cam.fields.teeth', value: s.teeth, min: gearTeeth.min },
        { field: 'outer', label: 'cam.fields.outer', value: s.outer, min: radius.min },
        { field: 'root', label: 'cam.fields.root', value: s.root, min: radius.min },
      ];
    case 'spiral':
      return [
        { field: 'turns', label: 'cam.fields.turns', value: s.turns, min: spiralTurns.min },
        { field: 'start', label: 'cam.fields.start', value: s.start, min: 0 },
        { field: 'end', label: 'cam.fields.end', value: s.end, min: 0 },
      ];
  }
}

/**
 * The sketch with one measure typed. A radius for all corners of a rectangle is the one radius: it takes the
 * four of the corners with it (`radii` would otherwise say what `r` is ignored for).
 */
function withMeasure(sketch: AnySketch, field: string, v: number): AnySketch {
  if (sketch.type === 'rect' && field === 'r') {
    const { radii: _single, ...rest } = sketch;
    return { ...rest, r: v };
  }
  return { ...sketch, [field]: v } as AnySketch;
}

/** The corners of a rectangle as the fields have them: the label, and the place in `Radii` (lower left first) */
const CORNERS: { key: 'ul' | 'ur' | 'll' | 'lr'; at: 0 | 1 | 2 | 3 }[] = [
  { key: 'ul', at: 3 },
  { key: 'ur', at: 2 },
  { key: 'll', at: 0 },
  { key: 'lr', at: 1 },
];

/**
 * A radius for each corner of the selected rectangle – folded away until wanted (one radius for all is the field
 * above). Each corner is its own number and its own steps of undo.
 */
function RadiiFold({ item, sketch }: { item: CamItem; sketch: Sketch & { type: 'rect' } }) {
  const cam = useCam.getState();
  const open = useUi((s) => s.depth.camRadii === 'more');
  const shown = tidySketch(sketch) as Sketch & { type: 'rect' };
  const all: Radii = shown.radii ?? [shown.r, shown.r, shown.r, shown.r];
  return (
    <Fold
      title={t('cam.radii.title')}
      find="cam-radii"
      testId="cam-radii"
      open={open}
      onOpenChange={(next) => useUi.getState().setDepth('camRadii', next ? 'more' : 'simple')}
    >
      <div className="contents">
        <div className="grid grid-cols-2 gap-2 items-end">
          {CORNERS.map(({ key, at }) => (
            <NumberField
              key={`i${item.id}${key}`}
              label={`cam.radii.${key}`}
              value={all[at]}
              min={0}
              onChange={(v) => {
                if (v === undefined) return;
                const next = [...all] as unknown as [number, number, number, number];
                next[at] = v;
                cam.setSketch(
                  item.id,
                  { ...sketch, r: Math.max(...next), radii: next },
                  `radius-${key}`,
                );
              }}
            />
          ))}
        </div>
        <p className="text-muted-foreground text-sm">{t('cam.radii.hint')}</p>
      </div>
    </Fold>
  );
}

/**
 * What is selected in the drawing, in numbers: the measures of a drawn
 * shape, the words of a text, where it lies and how it is turned – each
 * changing the picture at once – and what can be done with it (delete,
 * copy, turn, mirror). On the table the same thing follows the finger and
 * its handles.
 */
export function CamArrange() {
  const project = useCam((s) => s.project);
  const selected = useCam((s) => s.selected);
  // Where each part comes among the ones cut the same way, in the program that was made
  const cutOrder = useCam((s) => s.cutOrder);
  const cam = useCam.getState();
  const [columns, setColumns] = useState<number | undefined>(2);
  const [rows, setRows] = useState<number | undefined>(1);
  const [gap, setGap] = useState<number | undefined>(10);
  // What "Verschachteln" is asked for: the room between parts (the default is the cutter and 2 mm) and turning
  const [nestGap, setNestGap] = useState<number | undefined>(undefined);
  const [nestRotate, setNestRotate] = useState(false);
  if (!project || project.items.length === 0) return null;

  const chosen = project.items.filter((i) => isSelected(i, selected));
  const box = itemsBounds(chosen);
  const frame = selectionFrame(chosen);
  const one = chosen.length === 1 ? chosen[0]! : null;
  const sketch = one?.sketch;
  // What the fields show of it (see `drawn`)
  const shownSketch = sketch && drawn(sketch);
  // A registration hole is only moved: there are two, round, and they stay in line.
  const hole = chosen.length > 0 && chosen.every((i) => i.registration !== undefined);
  // Round things are placed by their middle, like a hole on a drawing.
  const byCentre =
    sketch?.type === 'circle' || sketch?.type === 'slot' || sketch?.type === 'ellipse';
  // Everything that lies the same way has an angle of its own.
  const own = frame?.own === true;
  // What is arranged against each other: the groups of the parts (a file's contours are one), not the contours
  const units = unitsOf(chosen);
  // What aligning and spreading work on: the groups by their parts in sight (a hidden part is left out of them)
  const alignable = unitsOf(chosen.filter((i) => !i.hidden));
  // The contours of those units (the registration holes are none): more than the units where a group has several
  const contours = partsOf(chosen);
  // What can be taken apart: a group of several things
  const apart = units.some((u) => contours.filter((i) => i.group === u.group).length > 1);
  // One part by its name; several by how many there are of them as the buttons below count them – the groups, each
  // as one – and, where a group holds several, of how many contours.
  const lone = contours.length === 1 ? contours[0]! : null;
  const what = one
    ? describeItem(one)
    : contours.length === 0
      ? // Nothing but registration holes (they are no part): counted as they are
        t('cam.arrange.parts', { n: chosen.length })
      : lone
        ? // One part that has its holes selected with it ("everything" of a two-sided part): the part
          describeItem(lone)
        : units.length === 1
          ? t('cam.arrange.groupOf', { m: contours.length })
          : contours.length > units.length
            ? t('cam.arrange.partsOf', { n: units.length, m: contours.length })
            : t('cam.arrange.parts', { n: units.length });

  if (!box || !frame) {
    return (
      <div className="cam-selection" data-testid="cam-arrange">
        <div className="flex gap-3 justify-between">
          <p className="text-muted-foreground text-sm">{t('cam.arrange.hint')}</p>
          <Button variant="outline" data-find="cam-select-all" onClick={cam.selectAll}>
            {t('cam.arrange.all')}
          </Button>
        </div>
        <MultiSwitch />
        <MarqueeSwitch />
        <DragAids />
        <MeasureSwitch />
        {/* (only where a part has a place of its own: then every number can be taken away from here too) */}
        <OrderPanel single={null} group={false} place={undefined} />
      </div>
    );
  }
  const size = frameSize(frame);
  // Fields start anew with every other thing that is selected.
  const key = one ? `i${one.id}` : `g${String(selected)}`;

  return (
    <div className="cam-selection" data-testid="cam-arrange">
      <div className="flex gap-3 justify-between">
        <p className="tabular-nums" data-testid="cam-selected">
          <strong>{what}</strong>{' '}
          {sketch || lone?.sketch ? null : (
            <span className="text-muted-foreground text-sm">
              {t('cam.arrange.size', { w: mm(box.maxX - box.minX), h: mm(box.maxY - box.minY) })}
            </span>
          )}
        </p>
        <Button
          variant="outline"
          size="sm"
          aria-label={t('cam.arrange.deselect')}
          title={t('cam.arrange.deselect')}
          onClick={() => cam.select(null)}
        >
          ×
        </Button>
      </div>
      {/* A text: the words, the face and the height come first – what it needs every time, above the switches */}
      {one && sketch?.type === 'text' ? <TextBlock key={key} item={one} sketch={sketch} /> : null}
      <MultiSwitch />
      <MarqueeSwitch />
      <DragAids />
      <MeasureSwitch />
      <div className="cam-actions two">
        <Button variant="outline" data-find="cam-select-all" onClick={cam.selectAll}>
          {t('cam.arrange.all')}
        </Button>
        <Button variant="outline" data-find="cam-invert" onClick={cam.invertSelection}>
          {t('cam.arrange.invert')}
        </Button>
      </div>
      <div className="cam-actions two" hidden={hole}>
        <Button variant="outline" onClick={cam.removeSelection}>
          <span className="with-icon">
            <Icon name="trash" size={20} /> {t('cam.arrange.remove')}
          </span>
        </Button>
        <Button variant="outline" onClick={cam.duplicate}>
          <span className="with-icon">
            <Icon name="copy" size={20} /> {t('cam.arrange.duplicate')}
          </span>
        </Button>
      </div>
      {/* Only where one of the two can act: a single plain part has nothing to group with and nothing to take apart */}
      {!hole && (units.length >= 2 || apart) ? (
        <div className="cam-actions two" data-find="cam-group">
          <Button
            variant="outline"
            disabled={units.length < 2}
            reason={t('cam.group.needTwo')}
            onClick={cam.group}
          >
            {withIcon('group', t('cam.group.group'))}
          </Button>
          <Button
            variant="outline"
            disabled={!apart}
            reason={t('cam.group.nothingToUngroup')}
            onClick={cam.ungroup}
          >
            {withIcon('ungroup', t('cam.group.ungroup'))}
          </Button>
        </div>
      ) : null}
      {/* One choice for the whole selection, always as tall as itself: the rows below the card never move */}
      {!hole ? <ColorSelect /> : null}
      <div className="grid gap-2 grid-cols-3 items-end">
        {one && sketch && shownSketch
          ? measures(shownSketch).map((m) => (
              <NumberField
                key={`${key}${m.field}`}
                label={m.label}
                value={m.value}
                min={m.min ?? 0.01}
                placeholder={m.hint}
                onChange={(v) =>
                  v !== undefined && cam.setSketch(one.id, withMeasure(sketch, m.field, v), m.field)
                }
              />
            ))
          : null}
        {!sketch && !hole ? (
          <>
            <NumberField
              key={`${key}w`}
              label="cam.fields.w"
              value={size.w}
              min={0.01}
              onChange={(w) => w !== undefined && size.w > 0 && cam.scale(w / size.w)}
            />
            <NumberField
              key={`${key}h`}
              label="cam.fields.h"
              value={size.h}
              min={0.01}
              onChange={(h) => h !== undefined && size.h > 0 && cam.scale(h / size.h)}
            />
          </>
        ) : null}
        {byCentre ? (
          <>
            <NumberField
              key={`${key}cx`}
              label="cam.arrange.cx"
              value={(box.minX + box.maxX) / 2}
              min={-Infinity}
              onChange={(x) => x !== undefined && cam.centreTo(x, (box.minY + box.maxY) / 2)}
            />
            <NumberField
              key={`${key}cy`}
              label="cam.arrange.cy"
              value={(box.minY + box.maxY) / 2}
              min={-Infinity}
              onChange={(y) => y !== undefined && cam.centreTo((box.minX + box.maxX) / 2, y)}
            />
          </>
        ) : (
          <>
            <NumberField
              key={`${key}x`}
              label="cam.arrange.x"
              value={box.minX}
              min={-Infinity}
              onChange={(x) => x !== undefined && cam.moveTo(x, box.minY)}
            />
            <NumberField
              key={`${key}y`}
              label="cam.arrange.y"
              value={box.minY}
              min={-Infinity}
              onChange={(y) => y !== undefined && cam.moveTo(box.minX, y)}
            />
          </>
        )}
        {own && !hole && sketch?.type !== 'circle' ? (
          <NumberField
            key={`${key}a`}
            label="cam.arrange.angle"
            value={frameAngle(frame)}
            min={-Infinity}
            onChange={(a) => a !== undefined && cam.setAngle(a)}
          />
        ) : null}
      </div>
      {one && sketch?.type === 'rect' ? <RadiiFold item={one} sketch={sketch} /> : null}
      {!sketch && !hole ? (
        <p className="text-muted-foreground text-sm">{t('cam.arrange.evenly')}</p>
      ) : null}
      {hole ? <p className="text-muted-foreground text-sm">{t('flip.holeMoves')}</p> : null}
      <div className="cam-actions" hidden={hole}>
        <Button
          variant="outline"
          aria-label={t('cam.arrange.turnLeftLabel')}
          onClick={() => cam.rotate(90)}
        >
          {t('cam.arrange.turnLeft')}
        </Button>
        <Button
          variant="outline"
          aria-label={t('cam.arrange.turnRightLabel')}
          onClick={() => cam.rotate(-90)}
        >
          {t('cam.arrange.turnRight')}
        </Button>
        <Button
          variant="outline"
          aria-label={t('cam.arrange.mirrorXLabel')}
          onClick={() => cam.mirror('x')}
        >
          {t('cam.arrange.mirrorX')}
        </Button>
        <Button
          variant="outline"
          aria-label={t('cam.arrange.mirrorYLabel')}
          onClick={() => cam.mirror('y')}
        >
          {t('cam.arrange.mirrorY')}
        </Button>
      </div>
      {alignable.length >= 2 && !hole ? (
        <AlignPanel
          units={alignable.length}
          nest={{ gap: nestGap, setGap: setNestGap, rotate: nestRotate, setRotate: setNestRotate }}
        />
      ) : null}
      {/* How the one part that is selected is entered or drilled, and where it comes in the order of the cuts */}
      {lone && !hole ? (
        <PathPanel item={lone} n={partsOf(project.items).indexOf(lone) + 1} />
      ) : null}
      {!hole ? (
        <OrderPanel
          single={lone}
          group={units.length === 1 && contours.length > 1}
          place={lone ? cutOrder[lone.id] : undefined}
        />
      ) : null}
      <Fold title={t('cam.arrange.more')} testId="cam-arrange-more" hidden={hole}>
        <div className="contents">
          <div className="grid gap-2 grid-cols-3 items-end">
            <NumberField
              label="cam.arrange.columns"
              value={columns}
              min={1}
              onChange={setColumns}
            />
            <NumberField label="cam.arrange.rows" value={rows} min={1} onChange={setRows} />
            <NumberField label="cam.arrange.gap" value={gap} onChange={setGap} />
          </div>
          <Button
            reason="missing"
            variant="outline"
            disabled={count(columns) * count(rows) < 2}
            onClick={() => cam.array(count(columns), count(rows), gap ?? 0)}
          >
            {t('cam.arrange.array', { n: count(columns) * count(rows) })}
          </Button>
        </div>
      </Fold>
    </div>
  );
}
