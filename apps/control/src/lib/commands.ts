import type { MessageKey } from '../i18n';
import type { FeatureId } from './features';
import type { ReadinessId, ReadinessItem } from './readiness';

/**
 * Everything the operator can look for in the quick search ("Schnellsuche"):
 * one entry per function, with the label it has on screen, where it lives
 * and where to land. The words it is also found by – other names, wrong
 * names, jargon – are in the dictionaries under `find.words.<id>`.
 *
 * The rule that keeps the search harmless: an entry is either `go` – it
 * leads to the place of a control and shows it, the operator then uses that
 * control – or `view` – one of the few actions of `VIEW_ACTIONS`, which
 * change what the screen shows and nothing else. Nothing here moves the
 * machine, starts, stops or changes a job. A new function of the app gets
 * its entry here, with keywords; `test/commands.test.ts` holds the table
 * against the places, the stage tools and the anchors in the components.
 */

/** Where a command lives: the start screen, a step of the flow or a side area (`store/ui.ts`) */
export type CommandPlace =
  | 'start'
  | 'job'
  | 'cam'
  | 'setup'
  | 'run'
  | 'toollist'
  | 'service'
  | 'settings'
  | 'console';

const FLOW: readonly CommandPlace[] = ['job', 'cam', 'setup', 'run'];

/** Harmless things the search does itself: they change the view, nothing else. */
export const VIEW_ACTIONS = [
  'stageTable',
  'stageCamera',
  'stage3d',
  'fit',
  'wide',
  'shortcuts',
] as const;
export type ViewAction = (typeof VIEW_ACTIONS)[number];

/**
 * What has to be there before a place shows: a loaded program, the expert switch, or a function
 * that is not hidden (Einstellungen → Maschine → Funktionen).
 */
export type CommandNeed = 'program' | 'expert' | FeatureId;

export type CommandIcon =
  | 'drive'
  | 'job'
  | 'machine'
  | 'frame'
  | 'zero'
  | 'tool'
  | 'camera'
  | 'fit'
  | 'follow'
  | 'goto'
  | 'measure'
  | 'clamp'
  | 'stick'
  | 'wide'
  | 'rect'
  | 'circle'
  | 'slot'
  | 'grid'
  | 'text'
  | 'file'
  | 'undo'
  | 'alignLeft'
  | 'spreadH'
  | 'group'
  | 'ungroup'
  | 'select'
  | 'eye'
  | 'play'
  | 'keyboard'
  | 'stop';

export interface Command {
  id: string;
  /** The label of the thing on screen */
  title: MessageKey;
  kind: 'go' | 'view';
  icon: CommandIcon;
  /** The place it lives in, and the view of that place */
  place?: CommandPlace;
  view?: string;
  /** It lives in the jog panel, which opens over any place */
  jog?: boolean;
  /**
   * It lives outside the places: above the picture (`stage`), in the status
   * bar (`top`), in the row of the steps (`nav`) or in the action bar (`bar`)
   */
  on?: 'stage' | 'top' | 'nav' | 'bar';
  /** A tap tool of the stage to choose on arrival */
  tool?: string;
  /** It shows on the table seen from above */
  table?: boolean;
  /** `data-find` of the element to show; the first one that is on screen */
  anchor: readonly string[];
  needs?: CommandNeed;
  /** `view` only */
  action?: ViewAction;
}

type Entry = Omit<Command, 'kind' | 'anchor' | 'icon'> & {
  anchor: string | readonly string[];
  icon?: CommandIcon;
  kind?: 'view';
};

function entry(e: Entry): Command {
  return {
    ...e,
    kind: e.kind ?? 'go',
    icon:
      e.icon ??
      (e.place === 'cam'
        ? 'rect'
        : e.jog
          ? 'drive'
          : e.place
            ? FLOW.includes(e.place) || e.place === 'start'
              ? 'job'
              : 'machine'
            : 'frame'),
    anchor: typeof e.anchor === 'string' ? [e.anchor] : e.anchor,
  };
}

const at =
  (place: CommandPlace) =>
  (
    id: string,
    title: MessageKey,
    view: string | undefined,
    anchor: string | readonly string[],
    needs?: CommandNeed,
    icon?: CommandIcon,
  ) =>
    entry({ id, title, place, view, anchor, needs, icon });
const job = at('job');
const setup = at('setup');
// Fräsen has two views: what lives in the check (Prüfen) and what lives in the cutting itself.
const check = (
  id: string,
  title: MessageKey,
  view: string | undefined,
  anchor: string | readonly string[],
  needs?: CommandNeed,
  icon?: CommandIcon,
) => at('run')(id, title, view ?? 'check', anchor, needs, icon);
const tools = check;
const run = (
  id: string,
  title: MessageKey,
  view: string | undefined,
  anchor: string | readonly string[],
  needs?: CommandNeed,
  icon?: CommandIcon,
) => at('run')(id, title, view ?? 'cut', anchor, needs, icon);
const toollist = at('toollist');
const service = at('service');
const settings = at('settings');
const jog = (id: string, title: MessageKey, anchor: string) =>
  entry({ id, title, jog: true, anchor });
const draw = (id: string, title: MessageKey, anchor: string, icon?: CommandIcon) =>
  entry({ id, title, place: 'cam', anchor, icon });
const look = (
  id: string,
  title: MessageKey,
  action: ViewAction,
  anchor: string,
  icon: CommandIcon,
) => entry({ id, title, kind: 'view', action, on: 'stage', anchor, icon });
const tool = (id: string, title: MessageKey, toolId: string, icon: CommandIcon) =>
  entry({ id, title, on: 'stage', tool: toolId, anchor: `tool-${toolId}`, icon });
const nav = (id: string, title: MessageKey, place: CommandPlace, needs?: CommandNeed) =>
  entry({ id, title, place, on: 'nav', anchor: `place-${place}`, needs });

/** The table. Its order is the order of equally good hits: everyday things first. */
export const COMMANDS: readonly Command[] = [
  // The stage and what lies around it
  tool('toolZero', 'stageTools.zero', 'zero', 'zero'),
  tool('toolClamp', 'stageTools.clamp.label', 'clamp', 'clamp'),
  tool('toolGoto', 'stageTools.goto', 'goto', 'goto'),
  tool('toolMeasure', 'stageTools.measure', 'measure', 'measure'),
  look('stageTable', 'stage.table', 'stageTable', 'stage-table', 'frame'),
  look('stageCamera', 'stage.camera', 'stageCamera', 'stage-camera', 'camera'),
  look('stage3d', 'stage.view3d', 'stage3d', 'stage-3d', 'frame'),
  look('fit', 'job.fit', 'fit', 'fit', 'fit'),
  look('wide', 'stage.wide', 'wide', 'wide', 'wide'),
  entry({
    id: 'follow',
    title: 'job.follow',
    on: 'stage',
    table: true,
    anchor: 'follow',
    icon: 'follow',
  }),
  entry({
    id: 'stick',
    title: 'stick.label',
    on: 'stage',
    table: true,
    anchor: 'stick',
    icon: 'stick',
  }),

  // The status bar: the same on every screen
  entry({ id: 'tiles', title: 'tiles.label', on: 'top', anchor: 'tiles', icon: 'frame' }),
  entry({ id: 'estop', title: 'estop.label', on: 'top', anchor: 'estop', icon: 'stop' }),
  entry({ id: 'pause', title: 'bar.pause', on: 'top', anchor: 'pause', icon: 'stop' }),
  entry({ id: 'messages', title: 'bar.messages', on: 'top', anchor: 'messages', icon: 'machine' }),
  entry({
    id: 'shortcuts',
    title: 'find.shortcuts.title',
    kind: 'view',
    action: 'shortcuts',
    on: 'top',
    anchor: [],
    icon: 'keyboard',
  }),

  // Start, the five steps and the side areas
  nav('placeStart', 'nav.start', 'start'),
  nav('placeJob', 'nav.steps.job', 'job'),
  nav('placeCam', 'nav.steps.cam', 'cam'),
  nav('placeSetup', 'nav.steps.setup', 'setup'),
  nav('placeRun', 'nav.steps.run', 'run'),
  nav('placeToollist', 'nav.areas.toollist', 'toollist'),
  nav('placeService', 'nav.areas.service', 'service'),
  nav('placeSettings', 'nav.areas.settings', 'settings'),
  nav('placeConsole', 'nav.areas.console', 'console', 'expert'),
  entry({ id: 'menu', title: 'nav.menuTitle', on: 'nav', anchor: 'menu', icon: 'machine' }),
  entry({ id: 'next', title: 'start.nextLabel', place: 'start', anchor: 'next' }),

  // ① Job: the program, the workpiece
  entry({ id: 'open', title: 'job.open', place: 'job', anchor: 'program', icon: 'file' }),
  draw('draw', 'cam.open', 'cam-draw'),
  job('material', 'assistant.steps.material', 'prepare', 'setup-material', 'program'),
  job('stock', 'assistant.stock', 'prepare', 'stock', 'program'),
  job('recent', 'jobCard.recent', undefined, ['recent', 'program']),
  job('upload', 'files.title', 'extras', 'upload', 'program'),
  job('jigs', 'jigs.title', 'extras', 'jigs', 'jigs'),
  job('tagSheet', 'jigs.print.title', 'extras', ['tag-print', 'jigs'], 'jigs'),

  // ① Job: the drawing workspace
  draw('shapeRect', 'cam.shapes.rect', 'shape-rect', 'rect'),
  draw('shapeCircle', 'cam.shapes.circle', 'shape-circle', 'circle'),
  draw('shapeSlot', 'cam.shapes.slot', 'shape-slot', 'slot'),
  draw('shapeGrid', 'cam.shapes.grid', 'shape-grid', 'grid'),
  draw('shapeText', 'cam.shapes.text', 'shape-text', 'text'),
  draw('importFile', 'cam.importFile', 'shape-file', 'file'),
  draw('projectOpen', 'cam.project.open', 'project-open'),
  draw('projectSave', 'cam.project.save', 'project-save'),
  draw('camHow', 'cam.steps.how', 'cam-how'),
  // The tabs of a part: the panel is open on demand (the button "Stege einstellen" of the first row that has tabs
  // opens it); where no part has tabs the card of the list is the place
  entry({ id: 'tabs', title: 'cam.tabs', place: 'cam', anchor: ['cam-tabs-open', 'cam-how'] }),
  entry({
    id: 'tabsPlace',
    title: 'cam.tabPlace',
    place: 'cam',
    anchor: ['cam-tabs', 'cam-tabs-open', 'cam-how'],
  }),
  entry({
    id: 'tabsSpread',
    title: 'cam.tabSpread',
    place: 'cam',
    anchor: ['cam-tabs', 'cam-tabs-open', 'cam-how'],
  }),
  draw('camTool', 'cam.tool', 'cam-tool', 'tool'),
  draw('camAdvanced', 'cam.advanced', 'cam-advanced'),
  draw('bothSides', 'flip.both', 'cam-sides'),
  draw('camDone', 'cam.steps.done', 'cam-done'),
  draw('camUndo', 'cam.undo', 'cam-undo', 'undo'),
  // The arranging tools show with a part on the table (the buttons of the selection with a selection, the align panel
  // with two things or more); where one is not there yet the next of its chain is, down to the card that always is
  entry({
    id: 'camMulti',
    title: 'cam.arrange.multi',
    place: 'cam',
    anchor: ['cam-multi', 'cam-draw'],
    icon: 'select',
  }),
  entry({
    id: 'camSelectAll',
    title: 'cam.arrange.all',
    place: 'cam',
    anchor: ['cam-select-all', 'cam-multi', 'cam-draw'],
    icon: 'select',
  }),
  entry({
    id: 'camInvert',
    title: 'cam.arrange.invert',
    place: 'cam',
    anchor: ['cam-invert', 'cam-multi', 'cam-draw'],
    icon: 'select',
  }),
  entry({
    id: 'camAlign',
    title: 'cam.align.title',
    place: 'cam',
    anchor: ['cam-align', 'cam-multi', 'cam-draw'],
    icon: 'alignLeft',
  }),
  entry({
    id: 'camDistribute',
    title: 'cam.align.spreadTitle',
    place: 'cam',
    anchor: ['cam-align', 'cam-multi', 'cam-draw'],
    icon: 'spreadH',
  }),
  entry({
    id: 'camGroup',
    title: 'cam.group.group',
    place: 'cam',
    anchor: ['cam-group', 'cam-multi', 'cam-draw'],
    icon: 'group',
  }),
  entry({
    id: 'camUngroup',
    title: 'cam.group.ungroup',
    place: 'cam',
    anchor: ['cam-group', 'cam-multi', 'cam-draw'],
    icon: 'ungroup',
  }),
  // A frame drawn across the table, and the eye of a part: the switch and the eyes are only there with parts on
  // the table – the chains end in the card that always is
  entry({
    id: 'camMarquee',
    title: 'cam.arrange.marquee',
    place: 'cam',
    anchor: ['cam-marquee', 'cam-multi', 'cam-draw'],
    icon: 'select',
  }),
  entry({
    id: 'camSnap',
    title: 'cam.arrange.snap',
    place: 'cam',
    anchor: ['cam-snap', 'cam-multi', 'cam-draw'],
    icon: 'alignLeft',
  }),
  entry({
    id: 'camGaps',
    title: 'cam.arrange.gaps',
    place: 'cam',
    anchor: ['cam-gaps', 'cam-multi', 'cam-draw'],
    icon: 'spreadH',
  }),
  entry({
    id: 'camMeasure',
    title: 'cam.arrange.measure',
    place: 'cam',
    anchor: ['cam-measure', 'cam-multi', 'cam-draw'],
    icon: 'measure',
  }),
  entry({
    id: 'camHide',
    title: 'cam.hide.hide',
    place: 'cam',
    anchor: ['cam-hide', 'cam-how'],
    icon: 'eye',
  }),
  entry({
    id: 'camShowAll',
    title: 'cam.hide.showAll',
    place: 'cam',
    anchor: ['cam-show-all', 'cam-hide', 'cam-how'],
    icon: 'eye',
  }),
  entry({ id: 'series', title: 'series.open', place: 'cam', anchor: 'series', needs: 'series' }),

  // ② Werkzeuge
  tools('jobTools', 'toolsStep.title', undefined, 'job-tools', 'program', 'tool'),

  // ③ Einrichten
  setup('setupZero', 'zeroFlow.title', 'zero', 'setup-zero', undefined, 'zero'),
  setup('crosshair', 'zeroFlow.step3', 'zero', ['crosshair', 'setup-zero'], undefined, 'camera'),
  setup('zeroHistory', 'zeroFlow.history', 'zero', 'zero-history', 'program', 'zero'),
  setup('fixtures', 'fixtures.title', 'zero', 'fixtures', undefined, 'clamp'),
  setup('zero', 'drive.zero', 'zero', 'zero', undefined, 'zero'),
  setup('wcs', 'wcs.title', 'zero', 'wcs', undefined, 'zero'),
  setup('savedZeros', 'zeros.title', 'zero', 'saved-zeros', undefined, 'zero'),
  setup('probe', 'probe.title', 'probe', 'probe'),
  setup('probeWizard', 'probeWizard.title', 'probe', 'probe-wizard'),
  setup('camera', 'camera.title', 'camera', 'camera', undefined, 'camera'),
  setup('holeZero', 'camera.holesTitle', 'camera', ['hole-zero', 'camera'], undefined, 'camera'),
  setup('twoHoles', 'camera.twoHoles', 'camera', ['two-holes', 'camera'], undefined, 'camera'),
  setup('photomap', 'photomap.scanTitle', 'camera', ['photomap', 'camera'], undefined, 'camera'),
  setup('recording', 'recording.title', 'camera', 'recording', undefined, 'camera'),
  setup('align', 'align.title', 'align', 'align', 'program'),
  setup('autolevel', 'autolevel.title', 'align', 'autolevel', 'program'),

  // ④ Prüfen
  check('readiness', 'ready.title', undefined, 'readiness', 'program'),
  check('simulation', 'job.simulation', undefined, 'simulation', 'program', 'play'),
  check('summary', 'job.estimate', undefined, 'job-summary', 'program'),
  check('workspace', 'job.workspace', undefined, 'workspace-check', 'program'),
  check('diagnostics', 'job.diagnostics', undefined, 'diagnostics', 'program'),
  check('sections', 'ready.toSections', undefined, ['sections', 'readiness'], 'program'),

  // ⑤ Fräsen
  run('run', 'runPanel.title', undefined, 'run-panel', 'program', 'play'),
  run('overrides', 'overrides.title', undefined, ['overrides', 'run-panel'], 'program', 'play'),
  run('stream', 'runPanel.stream', undefined, 'stream', 'program', 'play'),
  run('sd', 'files.sd', undefined, 'sd-card'),
  run('resume', 'resume.title', undefined, 'resume', 'program'),

  // Jog / Manuell: the panel that opens from every screen
  entry({ id: 'jogPanel', title: 'nav.jogTitle', on: 'bar', anchor: 'jog-toggle', icon: 'drive' }),
  jog('jog', 'drive.jog', 'jog'),
  jog('homing', 'jog.quick.home', 'jog-quick'),
  jog('jogZero', 'jog.quick.zero', 'jog-quick'),
  jog('jogPark', 'jog.quick.park', 'jog-quick'),
  jog('wheelFine', 'jog.wheel.titleNoAxis', 'wheel-fine'),
  jog('parkSet', 'jog.park.title', 'park'),
  jog('jogChange', 'jog.quick.change', 'jog-quick'),
  jog('changeSet', 'jog.change.title', 'change-spot'),
  jog('waypoints', 'jog.waypoints.title', 'waypoints'),
  jog('homeAxes', 'jog.more.homing', 'homing'),
  jog('unlock', 'drive.unlock', 'homing'),
  jog('feedHold', 'drive.feedHold', 'homing'),
  entry({ id: 'macros', title: 'macros.title', jog: true, anchor: 'macros', needs: 'macros' }),

  // Werkzeugliste
  toollist('toolLibrary', 'tools.title', undefined, 'tool-library', undefined, 'tool'),
  toollist('materialLibrary', 'materials.title', undefined, 'material-library'),
  toollist('cutting', 'cutting.title', undefined, 'cutting'),

  // Service & Diagnose
  service('connectionInfo', 'service.connection.title', 'diagnose', 'connection-info'),
  service('inputs', 'drive.inputsLabel', 'diagnose', 'inputs'),
  service('axisTest', 'service.axis.title', 'diagnose', 'axis-test'),
  service('log', 'machine.log', 'diagnose', 'log'),
  service('messageHistory', 'service.messages', 'messages', 'message-history'),
  service('runTime', 'service.hours.title', 'history', 'run-time'),
  service('history', 'history.title', 'history', 'history'),
  service('calibrate', 'nav.views.service.calibrate', 'calibrate', [
    'accuracy',
    'calibration',
    'measurements',
  ]),
  service('accuracy', 'accuracy.title', 'calibrate', 'accuracy'),
  service('calibration', 'calibration.title', 'calibrate', 'calibration'),
  service('measurements', 'measurements.title', 'calibrate', 'measurements'),

  // Einstellungen
  settings('connection', 'machine.connection', 'connection', 'connection'),
  settings('simulator', 'sim.title', 'connection', 'simulator'),
  settings('demo', 'demo.start', 'connection', 'connection'),
  settings('companion', 'companion.title', 'connection', 'companion'),
  settings('shutdown', 'companion.shutdownTitle', 'connection', ['pi-shutdown', 'companion']),
  settings('piLogin', 'access.title', 'connection', 'pi-login'),
  settings('piUpdate', 'update.title', 'connection', 'pi-update'),
  settings('appearance', 'appearance.title', 'machine', 'appearance'),
  settings('features', 'features.title', 'machine', 'features'),
  settings('profile', 'machine.profile', 'machine', 'profile'),
  settings('travel', 'machine.travel', 'machine', 'travel'),
  settings('machineLimits', 'limits.title', 'machine', 'machine-limits'),
  settings('jogFeed', 'machine.jogFeed', 'machine', 'jog-feed'),
  settings('controllerConfig', 'machine.configTitle', 'machine', 'controller-config'),
  settings('share', 'share.title', 'machine', 'share'),
  settings('cameraSetup', 'camera.setupTitle', 'camera', 'camera-setup', undefined, 'camera'),
  settings('cameraSource', 'camera.source', 'camera', 'camera-source', undefined, 'camera'),
  settings(
    'cameraCalibration',
    'camera.calibrationTitle',
    'camera',
    'camera-calibration',
    undefined,
    'camera',
  ),
  settings('cameraHeight', 'camera.focusTitle', 'camera', 'camera-height', undefined, 'camera'),
  settings('timelapse', 'camera.timelapse', 'camera', 'timelapse', undefined, 'camera'),
  settings('workshop', 'workshop.title', 'machine', 'workshop'),
  settings('language', 'workshop.language', 'machine', 'language'),
  settings('spindle', 'workshop.spindle', 'machine', 'spindle'),
  settings('safeHeight', 'workshop.heights', 'machine', 'safe-height'),
  settings('toolChangePos', 'workshop.toolChange', 'machine', 'tool-change', undefined, 'tool'),
  settings('notify', 'notify.title', 'machine', 'notify'),
  settings('adaptive', 'sensors.adaptiveTitle', 'machine', 'adaptive'),
  settings('macroEditor', 'macros.edit', 'machine', 'macro-editor', 'macros'),
  settings('expertMode', 'machine.expertMode', 'machine', 'expert-mode'),
  settings('configEditor', 'config.title', 'expert', 'config-editor', 'expert'),
  settings('configFile', 'configFile.title', 'expert', 'config-file', 'expert'),
  settings('settingsBrowser', 'settingsBrowser.title', 'expert', 'settings-browser', 'expert'),
  settings('firmware', 'firmware.title', 'expert', 'firmware', 'expert'),

  // Konsole (experts)
  entry({
    id: 'console',
    title: 'machine.console',
    place: 'console',
    anchor: 'console',
    needs: 'expert',
  }),
];

export function commandById(id: string): Command | undefined {
  return COMMANDS.find((c) => c.id === id);
}

/** Where to land instead while what a command needs is not there, and what to show there. */
export const NEED_FALLBACK: Record<
  CommandNeed,
  { place: CommandPlace; view?: string; anchor: string }
> = {
  program: { place: 'job', anchor: 'program' },
  expert: { place: 'settings', view: 'machine', anchor: 'expert-mode' },
  // A hidden function is led to where it is switched on again.
  series: { place: 'settings', view: 'machine', anchor: 'features' },
  jigs: { place: 'settings', view: 'machine', anchor: 'features' },
  macros: { place: 'settings', view: 'machine', anchor: 'features' },
};

/** The name of a place as the dictionary has it. */
export function placeLabelKey(place: CommandPlace): string {
  if (place === 'start') return 'nav.start';
  return FLOW.includes(place) ? `nav.steps.${place}` : `nav.areas.${place}`;
}

/** The view of a place as the dictionary calls it: `nav.views.setup.zero`. */
export function viewLabelKey(place: CommandPlace, view: string): string {
  return `nav.views.${place}.${view}`;
}

/** The words that say where a command lives ("Einrichten · Nullpunkte"), as dictionary keys in order. */
export function placeKeys(c: Command): string[] {
  if (c.on === 'stage') return ['find.places.stage'];
  if (c.on === 'top') return ['find.places.top'];
  if (c.on === 'nav') return ['find.places.nav'];
  if (c.on === 'bar') return ['find.places.bar'];
  if (c.jog) return ['nav.jogTitle'];
  const place = c.place ?? 'job';
  const keys = [placeLabelKey(place)];
  if (c.view) keys.push(viewLabelKey(place, c.view));
  return keys;
}

/** What the quick access looks at: where the operator stands right now. */
export interface Situation {
  connected: boolean;
  homed: boolean;
  /** A program is loaded */
  program: boolean;
  /** A job runs */
  running: boolean;
  /** The drawing workspace is open */
  drawing: boolean;
  /** Expert functions are switched on */
  expert: boolean;
  /** Which of the rare functions show (hidden ones stay while their flow is under way) */
  features: Readonly<Record<FeatureId, boolean>>;
  /** The readiness list of the loaded job, if there is one */
  readiness: readonly Pick<ReadinessItem, 'id' | 'level' | 'key'>[];
}

/** The place that deals with an open point of the readiness list. */
const FOR_READINESS: Partial<Record<ReadinessId, string>> = {
  connection: 'connection',
  homed: 'homing',
  errors: 'diagnostics',
  controller: 'diagnostics',
  travel: 'workspace',
  zero: 'toolZero',
  flip: 'readiness',
  sections: 'sections',
  series: 'series',
  jig: 'readiness',
  collisions: 'fixtures',
  clamp: 'toolClamp',
  profile: 'profile',
  depth: 'stock',
  tools: 'jobTools',
  limits: 'jobTools',
};

/** Whether what a command needs is there. */
export function needMet(
  need: CommandNeed | undefined,
  s: Pick<Situation, 'program' | 'expert' | 'features'>,
) {
  if (need === undefined) return true;
  if (need === 'program') return s.program;
  if (need === 'expert') return s.expert;
  return s.features[need];
}

/** How many entries the quick access shows */
export const QUICK_COUNT = 7;

/**
 * The quick access of the empty search: what the situation asks for first –
 * connect, home, the next open point of the readiness list – then the
 * things used most. Ids of commands, most important first, no doubles.
 */
export function quickAccess(s: Situation): string[] {
  const ids: string[] = [];
  const add = (id: string | undefined) => {
    const command = id === undefined ? undefined : commandById(id);
    if (command && needMet(command.needs, s) && !ids.includes(command.id)) ids.push(command.id);
  };
  if (!s.connected) add('connection');
  else if (!s.homed && !s.running) add('homing');
  if (s.program && !s.running) {
    // The first point that keeps the start locked, else the first worth a look.
    const open =
      s.readiness.find((i) => i.level === 'block') ?? s.readiness.find((i) => i.level === 'warn');
    if (open) add(open.key === 'outsideLong' ? 'sections' : FOR_READINESS[open.id]);
    add('readiness');
  }
  if (s.drawing) add('camHow');
  if (!s.program) add('open');
  for (const id of ['toolZero', 'draw', 'open', 'stageCamera', 'fit', 'homing', 'toolClamp']) {
    add(id);
  }
  return ids.slice(0, QUICK_COUNT);
}

/** How many recently used entries are kept and shown */
export const RECENT_COUNT = 5;

/** The list of recently used commands with one more at its head. */
export function withRecent(recent: readonly string[], id: string): string[] {
  return [id, ...recent.filter((r) => r !== id)].slice(0, RECENT_COUNT);
}

/** A stored list of recently used commands: only what still exists. */
export function validRecent(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .filter((id): id is string => typeof id === 'string' && commandById(id) !== undefined)
    .slice(0, RECENT_COUNT);
}
