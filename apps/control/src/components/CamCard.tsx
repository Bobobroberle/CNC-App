import { reliefCorners, type OperationKind, type Relief, type Side } from '@lowrider/cam';
import { useEffect } from 'react';
import { t } from '../i18n';
import { camKey, typingInto } from '../lib/camKeys';
import { isSelected, partsOf } from '../lib/camItems';
import { downloadText } from '../lib/download';
import { formatNumber } from '../lib/format';
import {
  blocksFlip,
  jobNames,
  useCam,
  type CamFlipNote,
  type CamItem,
  type CamSettings,
} from '../store/cam';
import { useFlip } from '../store/flip';
import { useJob } from '../store/job';
import { useMachine } from '../store/machine';
import { useSeries } from '../store/series';
import { useUi } from '../store/ui';
import { useWorkshop } from '../store/workshop';
import { CamAdd } from './CamAdd';
import { CamArrange } from './CamArrange';
import { CamSides } from './CamSides';
import { describeItem, mm, NumberField } from './camParts';
import { Icon } from './Icon';
import { SeriesCard } from './SeriesCard';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import { Checkbox } from '../ui/checkbox';
import { Field, FieldLabel } from '../ui/field';
import { Label } from '../ui/label';
import { NativeSelect } from '../ui/native-select';
import { Fold } from './Fold';

const KINDS: OperationKind[] = ['outside', 'inside', 'on', 'pocket', 'drill', 'none'];
const RELIEFS: (Relief | 'none')[] = ['none', 'dogbone', 'tbone'];

const SIDES: Side[] = ['front', 'back'];

const through = (kind: OperationKind) => kind === 'outside' || kind === 'inside';

/** A note about the two sides in words; rows are named by their number in the list. */
function flipNoteText(note: CamFlipNote): string {
  switch (note.code) {
    case 'meet':
    case 'through':
    case 'thin':
      return t(`flip.notes.${note.code}`, {
        front: note.front + 1,
        back: note.back + 1,
        mm: mm(Math.abs(note.left)),
      });
    case 'loose':
      return t('flip.notes.loose', { front: note.front + 1 });
    case 'hole-on-cut':
    case 'hole-in-part':
    case 'hole-off-stock':
      return t(`flip.notes.${note.code}`, { n: note.hole });
    default:
      return t(`flip.notes.${note.code}`);
  }
}
/**
 * Whether the item has corners the cutter cannot reach as it is cut now:
 * the corners of a cut-out or pocket, the notches of an outline. Only then
 * is there anything to choose.
 */
const hasCorners = (item: CamItem) =>
  (through(item.kind) || item.kind === 'pocket') &&
  item.contours.some(
    (c) =>
      c.closed &&
      !c.circle &&
      reliefCorners(c.points, item.kind === 'outside' ? 'outside' : 'inside', 1, 'dogbone').length >
        0,
  );

/** One thing of the drawing in the list: what it is, how it is cut and how deep. */
function ItemRow({ item, n }: { item: CamItem; n: number }) {
  const selected = useCam((s) => isSelected(item, s.selected));
  // A tap on the one selected part lets go of it; from "everything" it picks this part.
  const alone = useCam((s) => s.selected === item.group);
  const settings = useCam((s) => s.settings);
  const twoSided = useCam((s) => s.project?.twoSided != null);
  const sided = twoSided && item.kind !== 'none';
  const cam = useCam.getState();
  const usual = item.kind === 'on' ? settings.engraveDepth : settings.depth;
  return (
    <li className={`cam-row${selected ? ' selected' : ''}`}>
      <button
        type="button"
        className="cam-name"
        aria-pressed={selected}
        onClick={() => cam.select(alone ? null : item.group)}
      >
        {n}. {describeItem(item)}
      </button>
      <NativeSelect
        aria-label={t('cam.operation', { n })}
        value={item.kind}
        onChange={(e) => cam.setItem(item.id, { kind: e.target.value as OperationKind })}
      >
        {KINDS.map((k) => (
          <option key={k} value={k}>
            {t(`cam.kinds.${k}`)}
          </option>
        ))}
      </NativeSelect>
      {item.kind === 'none' ? (
        <span />
      ) : (
        <span className="cam-depth">
          <NumberField
            bare
            label={{ text: t('cam.depthOf', { n }) }}
            value={item.depth}
            min={0.01}
            placeholder={mm(usual)}
            onChange={(depth) => cam.setItem(item.id, { depth })}
          />
          <span className="text-muted-foreground text-sm">{t('cam.deep')}</span>
        </span>
      )}
      <Button
        variant="outline"
        size="sm"
        aria-label={t('cam.remove', { n })}
        onClick={() => cam.removeItem(item.id)}
      >
        ×
      </Button>
      {through(item.kind) || hasCorners(item) || sided ? (
        <div className="cam-options">
          {sided ? (
            <NativeSelect
              aria-label={t('flip.sideOf', { n })}
              value={item.side}
              onChange={(e) => cam.setItem(item.id, { side: e.target.value as Side })}
            >
              {SIDES.map((side) => (
                <option key={side} value={side}>
                  {t(`flip.sides.${side}`)}
                </option>
              ))}
            </NativeSelect>
          ) : null}
          {through(item.kind) ? (
            <Label className="min-h-target gap-3 font-normal">
              <Checkbox
                checked={item.tabs}
                onCheckedChange={(checked) => cam.setItem(item.id, { tabs: checked })}
              />
              <span>{t('cam.tabs')}</span>
            </Label>
          ) : null}
          {hasCorners(item) ? (
            <NativeSelect
              aria-label={t('cam.relief', { n })}
              value={item.relief ?? 'none'}
              onChange={(e) =>
                cam.setItem(item.id, {
                  relief: e.target.value === 'none' ? null : (e.target.value as Relief),
                })
              }
            >
              {RELIEFS.map((r) => (
                <option key={r} value={r}>
                  {t(`cam.reliefs.${r}`)}
                </option>
              ))}
            </NativeSelect>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * The keys of a drawing program, while the drawing workspace is on the
 * screen and the keys are not being typed into a field. They act on the
 * drawing alone – never on the machine.
 */
function useCamKeys() {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (typingInto(e.target) || document.querySelector('dialog[open], [role="dialog"]')) return;
      const key = camKey(e);
      const cam = useCam.getState();
      if (!key || !cam.project) return;
      // Without a selection the keys that act on it stay the browser's (arrows scroll the page).
      const onSelection = ['delete', 'nudge', 'duplicate', 'copy'].includes(key.do);
      if (onSelection && cam.selected === null) return;
      e.preventDefault();
      switch (key.do) {
        case 'delete':
          return cam.removeSelection();
        case 'deselect':
          return cam.select(null);
        case 'nudge':
          return cam.nudge(key.dx, key.dy);
        case 'undo':
          return cam.undo();
        case 'redo':
          return cam.redo();
        case 'duplicate':
          return cam.duplicate();
        case 'copy':
          return cam.copy();
        case 'paste':
          return cam.paste();
        case 'all':
          return cam.select('all');
      }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, []);
}

/** The drawing itself; the keys of a drawing program belong to it while it shows. */
function Drawing() {
  useCamKeys();
  const project = useCam((s) => s.project);
  const fileName = useJob((s) => s.fileName);
  if (!project) return null;
  const names = jobNames(project.name);
  // Another program lies on the table (this drawing's job, aligned; a file opened since):
  // the drawing cannot be shown over it – one tap puts it there.
  const other =
    fileName !== null &&
    fileName !== names.single &&
    fileName !== names.front &&
    partsOf(project.items).length > 0;
  return (
    <Card className="gap-3 p-4" data-testid="cam-draw" data-find="cam-draw">
      <CardTitle render={<h2 />}>{t('cam.steps.draw')}</CardTitle>
      {other ? (
        <Alert
          variant="warning"
          className="justify-items-start gap-y-2"
          data-testid="cam-other-job"
        >
          <p>{t('cam.otherJob', { file: fileName })}</p>
          <Button variant="outline" onClick={() => useCam.getState().remake()}>
            {t('cam.showDrawing')}
          </Button>
        </Alert>
      ) : null}
      <CamAdd />
      <CamArrange />
    </Card>
  );
}

/**
 * The drawing workspace of the Job room, a simple CAM like Estlcam, as one
 * short sequence: what is to be made (shapes, text, a DXF or SVG file),
 * where it lies, how it is cut and how deep – and with the toolpaths on the
 * table, the job is handed to the Job room for checking and cutting like any
 * other. It takes the place of the job's steps while it is open.
 */
export function CamCard() {
  const project = useCam((s) => s.project);
  const settings = useCam((s) => s.settings);
  const problems = useCam((s) => s.problems);
  const flipNotes = useCam((s) => s.flipNotes);
  const flipPlan = useFlip((s) => s.plan);
  const cam = useCam.getState();
  const tools = useWorkshop((s) => s.tools);
  const material = useWorkshop((s) => s.setup.materialId);
  const addLog = useMachine((s) => s.addLog);
  const lines = useJob((s) => s.lines);
  const fileName = useJob((s) => s.fileName);
  const seriesOpen = useSeries((s) => s.open);
  const canUndo = useCam((s) => s.past.length > 0);
  const canRedo = useCam((s) => s.future.length > 0);
  if (!project) return null;
  // A series on scattered blanks takes the place of the drawing's cards while it is put together.
  if (seriesOpen) return <SeriesCard />;

  // Cutting values change the toolpath on the table at once.
  const set = (patch: Partial<CamSettings>) => {
    cam.setSettings(patch);
    cam.remake();
  };
  const back = () => useUi.getState().setDrawing(false);
  const names = jobNames(project.name);
  // A job for both sides is two programs: the front is the one on the table.
  const both = flipPlan !== null && fileName === names.front ? flipPlan : null;
  const made = fileName === names.single || both !== null;
  const parts = partsOf(project.items);
  const relieved = parts.some((i) => i.relief !== null && hasCorners(i));
  const backText = parts.some((i) => i.side === 'back' && i.text !== undefined);

  return (
    <div className="workspace" data-testid="cam-card">
      <div className="workspace-head">
        <Button variant="outline" onClick={back} data-testid="cam-back">
          <span className="with-icon">
            <Icon name="back" size={20} /> {t('cam.back')}
          </span>
        </Button>
        <h2>{t('cam.title', { name: project.name })}</h2>
        <Button
          reason="missing"
          variant="outline"
          size="icon"
          aria-label={t('cam.undo')}
          data-find="cam-undo"
          title={t('cam.undo')}
          disabled={!canUndo}
          onClick={cam.undo}
        >
          <Icon name="undo" size={22} />
        </Button>
        <Button
          reason="missing"
          variant="outline"
          size="icon"
          aria-label={t('cam.redo')}
          title={t('cam.redo')}
          disabled={!canRedo}
          onClick={cam.redo}
        >
          <Icon name="redo" size={22} />
        </Button>
      </div>

      <Drawing />

      <Card className="gap-3 p-4" data-find="cam-how">
        <CardTitle render={<h2 />}>{t('cam.steps.how')}</CardTitle>
        {parts.length > 0 ? (
          <>
            <ul className="cam-list" data-testid="cam-contours">
              {parts.map((item, i) => (
                <ItemRow key={item.id} item={item} n={i + 1} />
              ))}
            </ul>
            {relieved ? (
              <p className="text-muted-foreground text-sm">{t('cam.reliefHint')}</p>
            ) : null}
            {backText ? (
              <p className="text-muted-foreground text-sm">{t('flip.backText')}</p>
            ) : null}
            <Button variant="outline" className="cam-clear" onClick={cam.clear}>
              {t('cam.clear')}
            </Button>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">{t('cam.empty')}</p>
        )}
        <CamSides />
        {/* The few values every job needs; the rest keeps its defaults under "Erweitert". */}
        <Field data-find="cam-tool">
          <FieldLabel>{t('cam.tool')}</FieldLabel>
          <NativeSelect value={settings.toolId} onChange={(e) => set({ toolId: e.target.value })}>
            {tools.map((x) => (
              <option key={x.id} value={x.id}>
                T{x.number} {x.name} (Ø {formatNumber(x.diameter, 1)})
              </option>
            ))}
          </NativeSelect>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="cam.depth"
            value={settings.depth}
            min={0.01}
            onChange={(depth) => depth !== undefined && set({ depth })}
          />
          <NumberField
            label="cam.feed"
            value={settings.feed}
            min={1}
            onChange={(feed) => feed !== undefined && set({ feed })}
          />
        </div>
        <Button
          reason="missing"
          variant="outline"
          disabled={!material}
          onClick={() => {
            cam.suggest();
            cam.remake();
          }}
        >
          {material ? t('cam.suggest') : t('cam.suggestNeedsMaterial')}
        </Button>
        <Fold title={t('cam.advanced')} testId="cam-advanced" find="cam-advanced">
          <div className="contents">
            <div className="grid grid-cols-2 gap-2">
              <NumberField
                label="cam.engraveDepth"
                value={settings.engraveDepth}
                min={0.01}
                onChange={(engraveDepth) => engraveDepth !== undefined && set({ engraveDepth })}
              />
              <NumberField
                label="cam.allowance"
                value={settings.allowance}
                onChange={(allowance) => allowance !== undefined && set({ allowance })}
              />
              <NumberField
                label="cam.stepdown"
                value={settings.stepdown}
                min={0.01}
                onChange={(stepdown) => stepdown !== undefined && set({ stepdown })}
              />
              <NumberField
                label="cam.plungeFeed"
                value={settings.plungeFeed}
                min={1}
                onChange={(plungeFeed) => plungeFeed !== undefined && set({ plungeFeed })}
              />
              <NumberField
                label="cam.rpm"
                value={settings.rpm}
                onChange={(rpm) => rpm !== undefined && set({ rpm })}
              />
              <NumberField
                label="cam.rampAngle"
                value={settings.rampAngle}
                onChange={(rampAngle) => rampAngle !== undefined && set({ rampAngle })}
              />
              <NumberField
                label="cam.stepover"
                value={Math.round(settings.stepover * 100)}
                min={1}
                onChange={(p) => p !== undefined && set({ stepover: p / 100 })}
              />
              <NumberField
                label="cam.safeZ"
                value={settings.safeZ}
                onChange={(safeZ) => safeZ !== undefined && set({ safeZ })}
              />
              <NumberField
                label="cam.tabWidth"
                value={settings.tabs.width}
                onChange={(width) =>
                  width !== undefined && set({ tabs: { ...settings.tabs, width } })
                }
              />
              <NumberField
                label="cam.tabHeight"
                value={settings.tabs.height}
                onChange={(height) =>
                  height !== undefined && set({ tabs: { ...settings.tabs, height } })
                }
              />
              <NumberField
                label="cam.tabCount"
                value={settings.tabs.count}
                onChange={(count) =>
                  count !== undefined &&
                  set({ tabs: { ...settings.tabs, count: Math.round(count) } })
                }
              />
            </div>
            <Label className="min-h-target gap-3 font-normal">
              <Checkbox
                checked={settings.climb}
                onCheckedChange={(checked) => set({ climb: checked })}
              />
              <span>{t('cam.climb')}</span>
            </Label>
          </div>
        </Fold>
      </Card>

      <Card className="gap-3 p-4" data-find="cam-done">
        <CardTitle render={<h2 />}>{t('cam.steps.done')}</CardTitle>
        <p className="text-muted-foreground text-sm">{t('cam.look')}</p>
        {problems.length > 0 ? (
          <ul className="diagnostics" data-testid="cam-problems">
            {problems.map((p, i) => (
              <li key={i} className="error">
                {t(`cam.problems.${p.code}`, { n: p.row + 1 })}
              </li>
            ))}
          </ul>
        ) : null}
        {flipNotes.length > 0 ? (
          <ul className="diagnostics" data-testid="cam-flip-notes">
            {flipNotes.map((note, i) => (
              <li
                key={i}
                className={blocksFlip(note) ? 'error' : note.code === 'meet' ? 'fine' : 'warning'}
              >
                {flipNoteText(note)}
              </li>
            ))}
          </ul>
        ) : null}
        {both ? <p className="text-muted-foreground text-sm">{t('flip.twoPrograms')}</p> : null}
        <Button
          reason="missing"
          disabled={parts.length === 0 || flipNotes.some(blocksFlip)}
          onClick={() => {
            // With the job made, the next step is the job itself.
            if (cam.remake()) {
              addLog('info', t('cam.generated', { name: project.name }));
              cam.select(null);
              useUi.getState().setView('job', 'prepare');
              back();
            }
          }}
        >
          {t('cam.generate')}
        </Button>
        <Button
          reason="missing"
          variant="outline"
          disabled={!made}
          onClick={() => {
            if (!both) downloadText(names.single, lines.join('\n'));
            else for (const side of [both.front, both.back]) downloadText(side.fileName, side.text);
          }}
        >
          {t('cam.download')}
        </Button>
      </Card>

      <Card className="gap-3 p-4" data-testid="series-entry" data-find="series">
        <CardTitle render={<h2 />}>{t('series.entry')}</CardTitle>
        <p className="text-muted-foreground text-sm">{t('series.openHint')}</p>
        <Button
          reason="missing"
          variant="outline"
          disabled={!parts.some((i) => i.kind !== 'none') || project.twoSided !== null}
          onClick={() => {
            cam.select(null);
            useSeries.getState().begin();
          }}
        >
          {t('series.open')}
        </Button>
        {project.twoSided !== null ? (
          <p className="text-muted-foreground text-sm">{t('series.notTwoSided')}</p>
        ) : !parts.some((i) => i.kind !== 'none') ? (
          <p className="text-muted-foreground text-sm">{t('series.needsMotif')}</p>
        ) : null}
      </Card>
    </div>
  );
}
