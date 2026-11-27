import {
  MIN_PECK,
  PROBLEM_EFFECT,
  reliefCorners,
  type OperationKind,
  type Relief,
  type Side,
} from '@lowrider/cam';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { t } from '../i18n';
import { camKey, typingInto } from '../lib/camKeys';
import { colorOf, effective } from '../lib/camGroups';
import { isSelected, partsOf } from '../lib/camItems';
import { wishedPlace } from '../lib/camOrder';
import { cutterLabel, fitsKind, TOOL_NOTE_EFFECT } from '../lib/camTools';
import { downloadText } from '../lib/download';
import { formatNumber } from '../lib/format';
import {
  blocksFlip,
  jobNames,
  ownsTable,
  useCam,
  type CamFlipNote,
  type CamItem,
  type CamSettings,
} from '../store/cam';
import { useFlip } from '../store/flip';
import { useJob } from '../store/job';
import { useMachine } from '../store/machine';
import { useCamCutters } from '../store/camTools';
import { useSeries } from '../store/series';
import { CamTabs } from './CamTabs';
import { ColorGroups, ColorPill, colorLetter } from './CamColors';
import { Feature } from './Feature';
import { useUi } from '../store/ui';
import { useJobUnderWay } from '../store/underway';
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
    case 'tools':
      return t('flip.notes.tools', { rows: note.rows.map((r) => r + 1).join(', ') });
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

/** Whether the item has a way round to choose: a closed contour that is cut around or cleared. */
const hasDirection = (item: CamItem) =>
  (through(item.kind) || item.kind === 'pocket') && item.contours.some((c) => c.closed);

const DIRECTIONS = ['job', 'climb', 'conventional'] as const;

/**
 * The mark of a part that has a place of its own among the parts cut the same way. What it says is where the
 * program really cuts the part (`place`, from the program that was made) – "Nr. 2". Where that is not the place
 * that was asked for (`wish`: an order the library cannot keep, a number several parts share) the mark says both
 * in words, and a part that is not cut at all (hidden, a cutter too large for it) says only the wish – a number
 * of the wish must never stand for a place the program does not have. One line, never taller than the row.
 */
function OrderBadge({ wish, place }: { wish: number; place: number | undefined }) {
  const [text, label] =
    place === undefined
      ? [t('cam.order.badgeIdle', { w: wish }), t('cam.order.badgeIdleLabel', { w: wish })]
      : place === wish
        ? [t('cam.order.badge', { n: place }), t('cam.order.badgeLabel', { n: place })]
        : [
            t('cam.order.badgeWish', { n: place, w: wish }),
            t('cam.order.badgeWishLabel', { n: place, w: wish }),
          ];
  return (
    <span className="cam-order-badge" data-testid="cam-order-badge" title={label}>
      <span aria-hidden="true">{text}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/**
 * One thing of the drawing in the list: what it is, how it is cut and how deep. A row that has tabs has the
 * button "Stege einstellen" – always, selected or not, so that selecting never changes a row's height; the panel
 * of its tabs opens only on demand (that button, the box of the tabs ticked on, "Stege setzen") and only
 * for a thing that is the one selected.
 */
function ItemRow({ item, n }: { item: CamItem; n: number }) {
  const selected = useCam((s) => isSelected(item, s.selected));
  // A tap on the one selected part lets go of it; from "everything" it picks this part.
  const alone = useCam((s) => s.selected === item.group);
  // The panel of this row's tabs is open (and then it is the one selected: the store ends it otherwise)
  const open = useCam((s) => s.tabsOpen === item.id || s.placing === item.id);
  const panel = alone && open && item.tabs && through(item.kind);
  // The eye: a hidden part is not cut and out of reach on the table; its row is set apart (dashed, a word), never faded and never smaller
  const hidden = item.hidden === true;
  const settings = useCam((s) => s.settings);
  // What its colour (`lib/camGroups.ts`) sets: the values the fields below show where the part has none of its own
  const colors = useCam((s) => s.project?.colors);
  const eff = effective(item, colors, settings);
  const color = colorOf(item);
  const drawingTool = useWorkshop((s) => s.tools.find((x) => x.id === settings.toolId));
  // The cutter the part has when it names none: its colour's, else the drawing's
  const inheritedTool = useWorkshop((s) => s.tools.find((x) => x.id === eff.toolId));
  // Where the program cuts it among the parts cut the same way (none: it is not cut – hidden, too large …)
  const cutPlace = useCam((s) => s.cutOrder[item.id]);
  // … and where its number asks to be cut: the number is a key to sort by, so it is compared by its place among the
  // numbered parts of the rank, never as it stands (a gap in the numbers is no wish for a later place)
  const wish = useCam((s) =>
    item.seq === undefined || !s.project
      ? undefined
      : wishedPlace(item, s.project.items, s.cutOrder),
  );
  const twoSided = useCam((s) => s.project?.twoSided != null);
  const sided = twoSided && item.kind !== 'none';
  // The cutter of this part: every tool of the list that is no probe (a V-bit, ball cutter or drill only where the cut
  // can be made with it – the others are listed, closed, with the reason in their own words); a choice that is no
  // longer in that list stays visible, so the field never says "wie die Zeichnung" for a part that asks for another
  const tools = useWorkshop((s) => s.tools);
  const choosable = tools.filter((x) => x.probe !== true);
  const asked = item.toolId;
  const showTool = item.kind !== 'none' && (choosable.length > 1 || asked !== undefined);
  // (what the cards above the list make of any change of the selection – all of it, not only this row's box)
  const selection = useCam((s) => s.selected);
  const cam = useCam.getState();
  const usual = eff.inherited;
  // The box is tapped where it is, again and again. What grows or shrinks above it with the selection (the card
  // of the selection, the align panel) or with the eye (a part of a set hidden takes the align panel away, shown
  // it brings it back) must not take the row from under the finger: after the change it goes back to where it
  // was on the screen. Measured, not guessed – no browser keeps it (Safari has no scroll anchoring).
  const head = useRef<HTMLDivElement>(null);
  const was = useRef<number | null>(null);
  useLayoutEffect(() => {
    const top = was.current;
    was.current = null;
    const el = head.current;
    const scroller = el?.closest<HTMLElement>('.panel-body');
    if (top === null || !el || !scroller) return;
    const by = el.getBoundingClientRect().top - top;
    // Assigned, not `scrollTo({ behavior: 'instant' })`: an older Safari knows only 'auto' and 'smooth' there and
    // throws – and nothing in the app's styles makes a scroll smooth, so the assignment is at once
    if (Math.abs(by) > 0.5) scroller.scrollTop += by;
    // (the selection may stay as it is while the cards above change: the eye alone takes a part out of what is
    // aligned, so this row's own `hidden` is a reason to look again)
  }, [selection, hidden, item.kind]);
  // Whatever in this row changes what the cards above the list make of it – its box, its name, its kind, "Stege einstellen",
  // the tabs box, its eye – is held in place: the card of the selection becomes the whole one, or loses its align
  // panel, and the row would be taken from under the finger.
  const hold = () => {
    was.current = head.current?.getBoundingClientRect().top ?? null;
    // A tap that changes nothing here must not leave the mark for the next change
    requestAnimationFrame(() => (was.current = null));
  };
  const pick = () => {
    hold();
    cam.toggleSelect(item.group);
  };
  return (
    <li className={`cam-row${selected ? ' selected' : ''}${hidden ? ' hidden-part' : ''}`}>
      <div className="cam-head" ref={head}>
        {/* Takes the part's group into the selection or out of it – with or without "Mehrfachauswahl" */}
        <Label className="cam-pick" data-testid="cam-pick">
          <Checkbox checked={selected} aria-label={t('cam.pick', { n })} onCheckedChange={pick} />
        </Label>
        <button
          type="button"
          className="cam-name"
          title={`${n}. ${describeItem(item)}`}
          aria-pressed={selected}
          onClick={() => {
            hold();
            cam.select(alone ? null : item.group);
          }}
        >
          {n}. {describeItem(item)}
        </button>
        {/* The colour group: a mark of a fixed size, the letter in the text colour – it changes no height */}
        {color !== undefined ? <ColorPill id={color} /> : null}
        {hidden ? <span className="cam-state">{t('cam.hide.state')}</span> : null}
        {/* A part with a place of its own among the parts cut the same way. The number is where the program really cuts
            it (read from the program that was made); where that is not the place that was asked for – a wish that
            lies inside a contour, numbers shared – the wish is said beside it, in words */}
        {wish !== undefined ? <OrderBadge wish={wish} place={cutPlace?.n} /> : null}
        <Button
          variant="outline"
          size="icon"
          aria-label={t(hidden ? 'cam.hide.showOf' : 'cam.hide.hideOf', { n })}
          title={t(hidden ? 'cam.hide.showOf' : 'cam.hide.hideOf', { n })}
          data-find="cam-hide"
          data-testid="cam-eye"
          onClick={() => {
            hold();
            cam.setHidden(item.id, !hidden);
          }}
        >
          <Icon name={hidden ? 'eyeOff' : 'eye'} size={22} />
        </Button>
      </div>
      <NativeSelect
        aria-label={t('cam.operation', { n })}
        value={item.kind}
        onChange={(e) => {
          // A pocket and a hole have a panel of their own in the card above the list (how they are entered,
          // how they are drilled): the kind that is changed here brings it or takes it away, and the row stays
          hold();
          cam.setItem(item.id, { kind: e.target.value as OperationKind });
        }}
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
      {through(item.kind) || hasCorners(item) || hasDirection(item) || sided || showTool ? (
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
                onCheckedChange={(checked) => {
                  hold();
                  cam.setItem(item.id, { tabs: checked });
                  // The tabs are shown on the table with the part selected: that is where they are set
                  if (checked) cam.openTabs(item.id);
                }}
              />
              <span>{t('cam.tabs')}</span>
            </Label>
          ) : null}
          {item.tabs && through(item.kind) && !panel ? (
            <Button
              variant="outline"
              aria-label={t('cam.tabsOpenOf', { n })}
              data-find="cam-tabs-open"
              data-testid="cam-tabs-open"
              // (a hidden part has no tabs on the table: its panel would close at once)
              disabled={hidden}
              reason={t('cam.hide.noTabs')}
              onClick={() => {
                hold();
                cam.openTabs(item.id);
              }}
            >
              {t('cam.tabsOpen')}
            </Button>
          ) : null}
          {hasDirection(item) ? (
            <NativeSelect
              aria-label={t('cam.direction', { n })}
              value={item.climb === undefined ? 'job' : item.climb ? 'climb' : 'conventional'}
              onChange={(e) =>
                cam.setItem(item.id, {
                  climb: e.target.value === 'job' ? undefined : e.target.value === 'climb',
                })
              }
            >
              {DIRECTIONS.map((d) => (
                <option key={d} value={d}>
                  {d === 'job' && color !== undefined && eff.from.climb === 'color'
                    ? t('cam.colors.likeColor', {
                        letter: colorLetter(color),
                        value: t(
                          eff.climb ? 'cam.directions.climb' : 'cam.directions.conventional',
                        ),
                      })
                    : t(`cam.directions.${d}`)}
                </option>
              ))}
            </NativeSelect>
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
          {showTool ? (
            <NativeSelect
              aria-label={t('cam.partTool', { n })}
              data-find="cam-part-tool"
              data-testid="cam-part-tool"
              value={asked ?? ''}
              onChange={(e) => {
                hold();
                cam.setItem(item.id, {
                  toolId: e.target.value === '' ? undefined : e.target.value,
                });
              }}
            >
              <option value="">
                {/* what the part is cut with where it names none: its colour's cutter, else the drawing's */}
                {t(
                  color !== undefined && eff.from.toolId === 'color'
                    ? 'cam.colors.likeColor'
                    : 'cam.tools.likeDrawing',
                  {
                    letter: color === undefined ? '' : colorLetter(color),
                    value: inheritedTool
                      ? `T${inheritedTool.number} ${inheritedTool.name}, Ø ${formatNumber(inheritedTool.diameter, 1)}`
                      : t('cam.tools.gone', { id: eff.toolId }),
                    tool: drawingTool
                      ? `T${drawingTool.number} ${drawingTool.name}, Ø ${formatNumber(drawingTool.diameter, 1)}`
                      : t('cam.tools.gone', { id: settings.toolId }),
                  },
                )}
              </option>
              {asked !== undefined && !choosable.some((x) => x.id === asked) ? (
                <option value={asked}>{t('cam.tools.gone', { id: asked })}</option>
              ) : null}
              {choosable.map((x) => {
                const fits = fitsKind(x, item.kind);
                return (
                  <option key={x.id} value={x.id} disabled={!fits && x.id !== asked}>
                    T{x.number} {x.name} (Ø {formatNumber(x.diameter, 1)})
                    {fits ? '' : ` – ${t('cam.tools.kindOnly')}`}
                  </option>
                );
              })}
            </NativeSelect>
          ) : null}
        </div>
      ) : null}
      {panel ? <CamTabs item={item} n={n} /> : null}
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
          return cam.selectAll();
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
  const ahead = useCam((s) => s.ahead);
  const fileName = useJob((s) => s.fileName);
  const running = useJobUnderWay();
  // No program can be made from the drawing as it stands (a tool list it cannot be made from, a two-sided job with a
  // cutter of a part's own): the tap would do nothing – the button says why it is closed
  const noProgram = useCam(
    (s) =>
      s.toolNotes.some((n) => TOOL_NOTE_EFFECT[n.code] === 'refused') ||
      s.flipNotes.some((n) => n.code === 'tools'),
  );
  if (!project) return null;
  // Another program lies on the table (this drawing's job, aligned; a file opened since): the
  // drawing changes nothing there – one tap puts it there, and not while a job is under way.
  const other =
    fileName !== null && !ownsTable(fileName) && partsOf(project.items).some((i) => !i.hidden);
  // The drawing's own program lies there, but the drawing has moved on while a job was under way.
  const behind = ahead && !other;
  const why = other
    ? running
      ? t('cam.otherJobRunning', { file: fileName })
      : t('cam.otherJob', { file: fileName })
    : fileName === null
      ? t(running ? 'cam.ahead.nothing' : 'cam.ahead.empty')
      : running
        ? t('cam.ahead.running', { file: fileName })
        : t('cam.ahead.done', { file: fileName });
  return (
    <Card className="gap-3 p-4" data-testid="cam-draw" data-find="cam-draw">
      <CardTitle render={<h2 />}>{t('cam.steps.draw')}</CardTitle>
      {other || behind ? (
        <Alert
          variant="warning"
          className="justify-items-start gap-y-2"
          data-testid="cam-other-job"
        >
          <p>{why}</p>
          <Button
            variant="outline"
            disabled={running || noProgram}
            reason={running ? t('cam.jobRuns') : t('cam.tools.noProgram')}
            data-testid="cam-show-drawing"
            onClick={() => useCam.getState().remake({ take: true })}
          >
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
  const toolNotes = useCam((s) => s.toolNotes);
  const cutters = useCamCutters();
  // The order the program on the table uses its tools in (read from it, as the places of the order are)
  const toolsUsed = useJob((s) => s.analysis?.toolOrder);
  const flipPlan = useFlip((s) => s.plan);
  const cam = useCam.getState();
  const tools = useWorkshop((s) => s.tools);
  const material = useWorkshop((s) => s.setup.materialId);
  // The cutter has cutting values of its own: a suggestion needs no material then
  const ownValues = useWorkshop(
    (s) => Object.keys(s.tools.find((x) => x.id === settings.toolId)?.cutting ?? {}).length > 0,
  );
  const addLog = useMachine((s) => s.addLog);
  const lines = useJob((s) => s.lines);
  const fileName = useJob((s) => s.fileName);
  const seriesOpen = useSeries((s) => s.open);
  const ahead = useCam((s) => s.ahead);
  const running = useJobUnderWay();
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
  const back = () => useUi.getState().leaveCam();
  const names = jobNames(project.name);
  // A job for both sides is two programs: the front is the one on the table.
  const both = flipPlan !== null && fileName === flipPlan.front.fileName ? flipPlan : null;
  // The drawing's own program lies on the table (not the aligned back, not a file opened since).
  const made = ownsTable(fileName);
  const parts = partsOf(project.items);
  // What is cut: the parts the eye has not hidden
  const shown = parts.filter((i) => !i.hidden);
  const hiddenCount = parts.length - shown.length;
  const relieved = parts.some((i) => i.relief !== null && hasCorners(i));
  const backText = parts.some((i) => i.side === 'back' && i.text !== undefined);
  // The library says of every problem whether the contour is not cut at all or cut, but differently
  const notCut = problems.filter((p) => PROBLEM_EFFECT[p.code] === 'not-cut');
  const differently = problems.filter((p) => PROBLEM_EFFECT[p.code] === 'cut-differently');
  // The cutters: what the tool list says to the drawing – a part whose own cutter cannot stand is cut with the
  // drawing's (a note), a tool list a program cannot be made from makes none (the red list)
  const toolRefused = toolNotes.filter((n) => TOOL_NOTE_EFFECT[n.code] === 'refused');
  const toolDifferent = toolNotes.filter((n) => TOOL_NOTE_EFFECT[n.code] === 'cut-differently');
  const toolNoteText = (n: (typeof toolNotes)[number]) =>
    t(`cam.tools.notes.${n.code}`, {
      rows: n.rows.map((r) => r + 1).join(', '),
      tool: n.tool ?? '',
      other: n.other ?? '',
      number: n.number ?? 0,
    });
  // The cutters in the order the program uses them – where the program on the table is the drawing's own and as
  // current as the drawing; else as the list names them
  const inOrder =
    made &&
    !ahead &&
    toolsUsed &&
    cutters.cutters.every((c) => c.tool && toolsUsed.includes(c.tool.number))
      ? [...cutters.cutters].sort(
          (a, b) => toolsUsed.indexOf(a.tool!.number) - toolsUsed.indexOf(b.tool!.number),
        )
      : cutters.cutters;
  // A part with a cutter of its own is cut with it: series and two-sided jobs cut with the drawing's alone
  const ownRows = cutters.cutters
    .filter((c) => c.id !== settings.toolId)
    .flatMap((c) => c.rows)
    .sort((a, b) => a - b);

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
            {/* Below the list, never above it: what the eye just tapped must not move away from the finger */}
            {hiddenCount > 0 ? (
              <div className="cam-hidden" data-testid="cam-hidden">
                <p className="text-muted-foreground text-sm">
                  {shown.length === 0 ? t('cam.hide.allHidden') : t('cam.hide.note')}
                </p>
                <Button
                  variant="outline"
                  data-find="cam-show-all"
                  data-testid="cam-show-all"
                  onClick={cam.showAll}
                >
                  {t('cam.hide.showAll')}
                </Button>
              </div>
            ) : null}
            {relieved ? (
              <p className="text-muted-foreground text-sm">{t('cam.reliefHint')}</p>
            ) : null}
            {/* Below the list, folded: what the colours set (never above it – the finger in the list must not be moved) */}
            <ColorGroups />
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
          disabled={!material && !ownValues}
          onClick={() => {
            cam.suggest();
            cam.remake();
          }}
        >
          {material || ownValues ? t('cam.suggest') : t('cam.suggestNeedsMaterial')}
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
            {/* What a part's tabs do when it has no choice of its own: kept off the corners, or evenly spread as ever */}
            <Label className="min-h-target gap-3 font-normal" data-find="cam-avoid-default">
              <Checkbox
                checked={settings.tabs.avoidCorners === true}
                data-testid="cam-avoid-default"
                onCheckedChange={(avoidCorners) =>
                  set({ tabs: { ...settings.tabs, avoidCorners } })
                }
              />
              <span>{t('cam.tabAvoidDefault')}</span>
            </Label>
            <div className="flex flex-col" data-find="cam-route">
              <Label className="min-h-target gap-3 font-normal">
                <Checkbox
                  checked={settings.routeShort}
                  data-testid="cam-route"
                  onCheckedChange={(routeShort) => set({ routeShort })}
                />
                <span>{t('cam.routeShort')}</span>
              </Label>
              <p className="text-muted-foreground text-sm">{t('cam.routeShortNote')}</p>
            </div>
          </div>
        </Fold>
      </Card>

      <Card className="gap-3 p-4" data-find="cam-done">
        <CardTitle render={<h2 />}>{t('cam.steps.done')}</CardTitle>
        <p className="text-muted-foreground text-sm">{t('cam.look')}</p>
        {/* Which cutters the program uses – one that is not the drawing's, or several with a change between them */}
        {!cutters.refused &&
        !flipNotes.some((n) => n.code === 'tools') &&
        (cutters.cutters.length >= 2 || ownRows.length > 0) ? (
          <div className="flex flex-col gap-1" data-testid="cam-tools-summary">
            <p className="text-sm font-medium">
              {cutters.cutters.length >= 2
                ? t('cam.tools.several', {
                    count: cutters.cutters.length,
                    list: inOrder.map(cutterLabel).join(' · '),
                  })
                : t('cam.tools.one', { tool: cutterLabel(cutters.cutters[0]!) })}
            </p>
            {cutters.cutters.length >= 2 ? (
              <p className="text-muted-foreground text-sm">{t('cam.tools.changeHint')}</p>
            ) : null}
            {/* A cutter without values of its own cuts with the drawing's: a V-bit at an end mill's feed – said */}
            {cutters.cutters
              .filter((c) => c.id !== settings.toolId && !c.ownValues)
              .map((c) => (
                <p
                  key={c.id}
                  className="text-muted-foreground text-sm"
                  data-testid="cam-tools-values"
                >
                  {t('cam.tools.noValues', { tool: cutterLabel(c) })}
                </p>
              ))}
          </div>
        ) : null}
        {toolRefused.length > 0 ? (
          <ul className="diagnostics" data-testid="cam-tool-notes">
            {toolRefused.map((n, i) => (
              <li key={i} className="error" data-code={n.code}>
                {toolNoteText(n)}
              </li>
            ))}
          </ul>
        ) : null}
        {/* What is not cut at all, and – apart – what is cut but not as asked: the second is a note, not a fault */}
        {notCut.length > 0 ? (
          <ul className="diagnostics" data-testid="cam-problems">
            {notCut.map((p, i) => (
              <li key={i} className="error">
                {t(`cam.problems.${p.code}`, { n: p.row + 1, min: formatNumber(MIN_PECK, 2) })}
              </li>
            ))}
          </ul>
        ) : null}
        {differently.length > 0 || toolDifferent.length > 0 ? (
          <div className="flex flex-col gap-1" data-testid="cam-differences">
            <p className="text-sm font-medium">{t('cam.differs')}</p>
            <ul className="diagnostics">
              {differently.map((p, i) => (
                <li key={i} data-testid="cam-difference" data-code={p.code}>
                  {t(`cam.problems.${p.code}`, { n: p.row + 1, min: formatNumber(MIN_PECK, 2) })}
                </li>
              ))}
              {toolDifferent.map((n, i) => (
                <li key={`tool${i}`} data-testid="cam-difference" data-code={`tool-${n.code}`}>
                  {toolNoteText(n)}
                </li>
              ))}
            </ul>
          </div>
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
          reason={
            running
              ? t('cam.jobRuns')
              : parts.length > 0 && shown.length === 0
                ? t('cam.hide.allHidden')
                : toolRefused.length > 0
                  ? t('cam.tools.noProgram')
                  : 'missing'
          }
          disabled={
            shown.length === 0 || flipNotes.some(blocksFlip) || toolRefused.length > 0 || running
          }
          data-testid="cam-hand-over"
          onClick={() => {
            // With the job made, the next step is the job itself.
            if (cam.remake({ take: true })) {
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
          variant="outline"
          data-find="project-save"
          data-testid="cam-project-save"
          disabled={parts.length === 0}
          reason="missing"
          onClick={() => {
            const text = cam.saveProject();
            if (text === null) return;
            downloadText(`${project.name}.lowrider.json`, text);
            addLog('info', t('cam.project.saved', { name: `${project.name}.lowrider.json` }));
          }}
        >
          {t('cam.project.save')}
        </Button>
        <Button
          reason={ahead ? t('cam.aheadReason') : 'missing'}
          variant="outline"
          disabled={!made || ahead}
          onClick={() => {
            if (!both) downloadText(fileName ?? names.single, lines.join('\n'));
            else for (const side of [both.front, both.back]) downloadText(side.fileName, side.text);
          }}
        >
          {t('cam.download')}
        </Button>
      </Card>

      <Feature id="series">
        <Card className="gap-3 p-4" data-testid="series-entry" data-find="series">
          <CardTitle render={<h2 />}>{t('series.entry')}</CardTitle>
          <p className="text-muted-foreground text-sm">{t('series.openHint')}</p>
          <Button
            reason="missing"
            variant="outline"
            disabled={
              !shown.some((i) => i.kind !== 'none') ||
              project.twoSided !== null ||
              ownRows.length > 0
            }
            onClick={() => {
              cam.select(null);
              useSeries.getState().begin();
            }}
          >
            {t('series.open')}
          </Button>
          {project.twoSided !== null ? (
            <p className="text-muted-foreground text-sm">{t('series.notTwoSided')}</p>
          ) : ownRows.length > 0 ? (
            <p className="text-muted-foreground text-sm" data-testid="series-own-tools">
              {t('series.ownTools', { rows: ownRows.map((r) => r + 1).join(', ') })}
            </p>
          ) : !shown.some((i) => i.kind !== 'none') ? (
            <p className="text-muted-foreground text-sm">{t('series.needsMotif')}</p>
          ) : null}
        </Card>
      </Feature>
    </div>
  );
}
