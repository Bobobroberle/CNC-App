import { sketchContours, type Sketch, type TextAlign } from '@lowrider/cam';
import { useEffect, useRef, useState } from 'react';
import { t, type MessageKey } from '../i18n';
import { frameAngle, frameSize, selectionFrame } from '../lib/camEdit';
import { isSelected, itemsBounds, type CamItem } from '../lib/camItems';
import { useCam } from '../store/cam';
import { describeItem, mm, NumberField } from './camParts';
import { Icon } from './Icon';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Field, FieldLabel } from '../ui/field';
import { SegmentedControl, SegmentedControlItem } from '../ui/segmented-control';
import { Textarea } from '../ui/textarea';
import { Fold } from './Fold';

/** Whole numbers for columns and rows, at least 1. */
const count = (v: number | undefined) => Math.max(1, Math.round(v ?? 1));

const ALIGNS: TextAlign[] = ['left', 'center', 'right'];

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
  // One part by its name, several by their number (the rows of the list).
  const what = one ? describeItem(one) : t('cam.arrange.parts', { n: chosen.length });
  // A registration hole is only moved: there are two, round, and they stay in line.
  const hole = chosen.length > 0 && chosen.every((i) => i.registration !== undefined);
  // Round things are placed by their middle, like a hole on a drawing.
  const byCentre = sketch?.type === 'circle' || sketch?.type === 'slot';
  // Everything that lies the same way has an angle of its own.
  const own = frame?.own === true;

  if (!box || !frame) {
    return (
      <div className="cam-selection flex gap-3 justify-between" data-testid="cam-arrange">
        <p className="text-muted-foreground text-sm">{t('cam.arrange.hint')}</p>
        <Button variant="outline" onClick={() => cam.select('all')}>
          {t('cam.arrange.all')}
        </Button>
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
          {sketch ? null : (
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
