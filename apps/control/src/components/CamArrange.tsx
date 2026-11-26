import { sketchContours, type Sketch, type TextAlign } from '@lowrider/cam';
import { useEffect, useRef, useState } from 'react';
import { t, type MessageKey } from '../i18n';
import { EDGES, unitsOf, type Axis, type Edge, type Spread } from '../lib/camArrange';
import { frameAngle, frameSize, selectionFrame } from '../lib/camEdit';
import { isSelected, itemsBounds, partsOf, type CamItem } from '../lib/camItems';
import { useCam } from '../store/cam';
import { useUi } from '../store/ui';
import { describeItem, mm, NumberField } from './camParts';
import { Icon, type IconName } from './Icon';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Field, FieldLabel } from '../ui/field';
import { Label } from '../ui/label';
import { SegmentedControl, SegmentedControlItem } from '../ui/segmented-control';
import { Textarea } from '../ui/textarea';
import { Fold } from './Fold';

/** Whole numbers for columns and rows, at least 1. */
const count = (v: number | undefined) => Math.max(1, Math.round(v ?? 1));

const ALIGNS: TextAlign[] = ['left', 'center', 'right'];

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
function AlignPanel({ units }: { units: number }) {
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
      </div>
    </Fold>
  );
}

/** The measures of a drawn thing as fields: which value, its label, and the smallest it takes. */
type Measure = { field: string; label: MessageKey; value: number; min?: number };

function measures(s: Sketch): Measure[] {
  switch (s.type) {
    case 'rect':
      return [
        { field: 'w', label: 'cam.fields.w', value: s.w },
        { field: 'h', label: 'cam.fields.h', value: s.h },
        { field: 'r', label: 'cam.fields.r', value: s.r, min: 0 },
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
      return [{ field: 'height', label: 'cam.text.height', value: s.height }];
  }
}

/** A text was just added: its field takes the keyboard as soon as it shows. */
let focusText = false;
export function focusNewText() {
  focusText = true;
}

/** The words of a text and how its lines are set. */
function TextFields({ item, sketch }: { item: CamItem; sketch: Sketch & { type: 'text' } }) {
  const cam = useCam.getState();
  const field = useRef<HTMLTextAreaElement>(null);
  // What is typed, also while it is nothing that can be engraved yet.
  const [words, setWords] = useState(sketch.text);
  const shown = useRef(sketch.text);
  useEffect(() => {
    // The drawing changed under the field (undo): show what it holds.
    if (sketch.text !== shown.current) {
      shown.current = sketch.text;
      setWords(sketch.text);
    }
  }, [sketch.text]);
  useEffect(() => {
    if (!focusText) return;
    focusText = false;
    field.current?.focus();
    field.current?.select();
  }, []);
  const missing = sketchContours(sketch).missing;
  const set = (patch: Partial<typeof sketch>, name: string) =>
    cam.setSketch(item.id, { ...sketch, ...patch }, name);
  return (
    <>
      <Field>
        <FieldLabel>{t('cam.text.label')}</FieldLabel>
        <Textarea
          ref={field}
          rows={2}
          value={words}
          placeholder={t('cam.text.placeholder')}
          data-testid="cam-text"
          onChange={(e) => {
            setWords(e.target.value);
            if (e.target.value.trim() === '') return;
            shown.current = e.target.value;
            set({ text: e.target.value }, 'text');
          }}
        />
      </Field>
      {missing.length > 0 ? (
        <Alert variant="warning" data-testid="cam-text-missing">
          {t('cam.text.missing', { list: missing.join(' ') })}
        </Alert>
      ) : null}
    </>
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
  const cam = useCam.getState();
  const [columns, setColumns] = useState<number | undefined>(2);
  const [rows, setRows] = useState<number | undefined>(1);
  const [gap, setGap] = useState<number | undefined>(10);
  if (!project || project.items.length === 0) return null;

  const chosen = project.items.filter((i) => isSelected(i, selected));
  const box = itemsBounds(chosen);
  const frame = selectionFrame(chosen);
  const one = chosen.length === 1 ? chosen[0]! : null;
  const sketch = one?.sketch;
  // A registration hole is only moved: there are two, round, and they stay in line.
  const hole = chosen.length > 0 && chosen.every((i) => i.registration !== undefined);
  // Round things are placed by their middle, like a hole on a drawing.
  const byCentre = sketch?.type === 'circle' || sketch?.type === 'slot';
  // Everything that lies the same way has an angle of its own.
  const own = frame?.own === true;
  // What is arranged against each other: the groups of the parts (a file's contours are one), not the contours
  const units = unitsOf(chosen);
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
      <MultiSwitch />
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
      {one && sketch?.type === 'text' ? <TextFields key={key} item={one} sketch={sketch} /> : null}
      <div className="grid gap-2 grid-cols-3 items-end">
        {one && sketch
          ? measures(sketch).map((m) => (
              <NumberField
                key={`${key}${m.field}`}
                label={m.label}
                value={m.value}
                min={m.min ?? 0.01}
                onChange={(v) =>
                  v !== undefined &&
                  cam.setSketch(one.id, { ...sketch, [m.field]: v } as Sketch, m.field)
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
      {units.length >= 2 && !hole ? <AlignPanel units={units.length} /> : null}
      {one && sketch?.type === 'text' ? (
        <Fold title={t('cam.text.more')}>
          <div className="contents">
            <SegmentedControl role="group" aria-label={t('cam.text.align')}>
              {ALIGNS.map((a) => (
                <SegmentedControlItem
                  key={a}
                  pressed={sketch.align === a}
                  onClick={() => cam.setSketch(one.id, { ...sketch, align: a })}
                >
                  {t(`cam.text.aligns.${a}`)}
                </SegmentedControlItem>
              ))}
            </SegmentedControl>
            <div className="grid grid-cols-2 gap-2">
              <NumberField
                key={`${key}spacing`}
                label="cam.text.spacing"
                value={Math.round(sketch.spacing * 100)}
                min={-Infinity}
                onChange={(v) =>
                  v !== undefined &&
                  cam.setSketch(one.id, { ...sketch, spacing: v / 100 }, 'spacing')
                }
              />
              <NumberField
                key={`${key}line`}
                label="cam.text.lineSpacing"
                value={Math.round(sketch.lineSpacing * 100)}
                min={10}
                onChange={(v) =>
                  v !== undefined &&
                  cam.setSketch(one.id, { ...sketch, lineSpacing: v / 100 }, 'lineSpacing')
                }
              />
            </div>
            <p className="text-muted-foreground text-sm">{t('cam.text.hint')}</p>
          </div>
        </Fold>
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
