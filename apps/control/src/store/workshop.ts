import type { Box, Fixture } from '@lowrider/gcode-core';
import {
  DEFAULT_ADAPTIVE,
  DEFAULT_MATERIALS,
  DEFAULT_TOOLS,
  learn,
  mergeById,
  validateJig,
  validateMaterial,
  validateSavedZero,
  validateTool,
  type AdaptiveSettings,
  type Jig,
  type JobRecord,
  type LearningModel,
  type Material,
  type SavedZero,
  type SpindleLimits,
  type Tool,
  type ToolSetter,
} from '@lowrider/workshop';
import { create } from 'zustand';
import {
  CompanionClient,
  companionBase,
  resolveCameraUrl,
  type CompanionHealth,
  type RecordingMode,
} from '../lib/companion';
import { validHiddenFeatures, type FeatureId } from '../lib/features';
import { pinFixtures, type FixtureFrame } from '../lib/clamps';
import { browserStorage, listOf, loadJson, saveJson } from '../lib/persist';
import { validWaypoints, type Waypoint } from '../lib/spots';

export interface CameraSettings {
  /** Machine offset of the image centre from the spindle axis, mm */
  offsetX: number;
  offsetY: number;
  /** Image pixels per mm at working height */
  pxPerMm: number;
  /** Image rotation against the machine X axis, degrees */
  rotation: number;
  /** MJPEG URL of a camera at the companion; empty = camera of this device */
  streamUrl: string;
  /**
   * Picture source chosen in the camera setup; "Kamera einschalten" uses it.
   * null = automatic: the simulator's camera, else the stream if one is set,
   * else the camera of this device.
   */
  source: 'device' | 'stream' | 'sim' | null;
  /**
   * Work Z of the spindle when the scale was calibrated: the scale is only
   * right at this distance above the zero surface. null = not calibrated.
   */
  focusHeight: number | null;
  /**
   * The scale (pxPerMm, rotation) was measured, not just the default. Setting
   * the camera height alone does not make the picture usable for the map.
   */
  scaleCalibrated: boolean;
  /** Markers and holes look light on dark (lit hole bottom) instead of dark on light */
  lightMarker: boolean;
}

/** How the companion records the tool camera during jobs. */
export interface RecordingSettings {
  /** Start with every job, stop at its end */
  auto: boolean;
  mode: RecordingMode;
  /** Seconds between two timelapse pictures */
  intervalSeconds: number;
  /** Timelapse pictures only when Z is at the job's safe height */
  safeHeightOnly: boolean;
}

export interface WorkshopSettings {
  spindle: SpindleLimits;
  /** Tool length sensor in machine coordinates; null = none */
  toolSetter: ToolSetter | null;
  /** Machine XY where tools are changed; null = change where the job stopped */
  toolChangePosition: { x: number; y: number } | null;
  /** Machine XY the machine is parked at ("Parkposition" of the jog panel); null = none stored */
  parkPosition: { x: number; y: number } | null;
  /** Places the operator remembered by name ("Merkpunkte" of the jog panel), machine X/Y */
  waypoints: Waypoint[];
  /** Rare functions whose entry points are hidden (Einstellungen → Maschine → Funktionen) */
  hiddenFeatures: FeatureId[];
  /** Machine Z for safe travel; null = 2 mm below the top of the Z travel */
  safeMachineZ: number | null;
  companionUrl: string;
  notifyBrowser: boolean;
  notifyCompanion: boolean;
  adaptive: AdaptiveSettings & { enabled: boolean };
  camera: CameraSettings;
  language: 'de' | 'en';
  /** Shows config, $ settings, firmware and the console under Maschine */
  expertMode: boolean;
  /** Keep the screen on while connected */
  keepAwake: boolean;
  /**
   * XYZ corner plate for corner/edge probing (wood does not conduct). `use`
   * false: the workpiece itself is conductive and touched directly.
   */
  cornerPlate: { use: boolean; top: number; wall: number };
  calibration: CalibrationSettings;
  recording: RecordingSettings;
}

/** Camera calibration of the machine with a reference plate of dots. */
export interface CalibrationSettings {
  /** Distance between the outer measured dots along X and Y, mm */
  spanX: number;
  spanY: number;
  /** Dots per axis (2–5) */
  points: number;
  /** Precision plate (scale is trusted) or a print (angle only, after turning it) */
  precise: boolean;
  /** Wait after each move before the picture counts, ms (vibration, stream delay) */
  settleMs: number;
  /** Distance between the two Y rails, mm; null = not entered */
  gantryWidth: number | null;
  /** Side of the gantry Y motor 1 (connector A on the Jackpot) sits on */
  motor1Side: 'xMin' | 'xMax' | null;
  /** Z rise for the tilt measurement, mm */
  zRise: number;
}

export const DEFAULT_SETTINGS: WorkshopSettings = {
  // Makita RT0701-class router: 10 000–30 000 rpm; the LowRider cuts well below 3 m/min.
  spindle: { rpmMin: 10000, rpmMax: 30000, maxFeed: 3000 },
  toolSetter: null,
  toolChangePosition: null,
  parkPosition: null,
  waypoints: [],
  hiddenFeatures: [],
  safeMachineZ: null,
  companionUrl: '',
  notifyBrowser: false,
  notifyCompanion: false,
  adaptive: { ...DEFAULT_ADAPTIVE, enabled: false },
  camera: {
    offsetX: 0,
    offsetY: 0,
    pxPerMm: 10,
    rotation: 0,
    streamUrl: '',
    source: null,
    focusHeight: null,
    scaleCalibrated: false,
    lightMarker: false,
  },
  language: 'de',
  expertMode: false,
  keepAwake: true,
  cornerPlate: { use: false, top: 0, wall: 0 },
  calibration: {
    spanX: 180,
    spanY: 180,
    points: 3,
    precise: true,
    settleMs: 600,
    gantryWidth: null,
    motor1Side: null,
    zRise: 20,
  },
  recording: { auto: false, mode: 'timelapse', intervalSeconds: 5, safeHeightOnly: false },
};

/** What the current job is cut from and held with (assistant, 3D view, collision check). */
export interface JobSetup {
  materialId: string | null;
  /** Raw stock in work coordinates; null = derived from the job */
  stock: Box | null;
  /**
   * Clamps and screws on the table. X/Y are machine coordinates – a clamp
   * stays where it is when the work zero moves; Z counts from the work zero
   * (height above the work surface). See `lib/clamps.ts`.
   */
  fixtures: Fixture[];
  /**
   * `work` only for fixtures stored by older versions, relative to the work
   * zero: they are pinned to the table the first time the machine reports
   * its work offset (`pinFixturesAt`).
   */
  fixtureFrame: FixtureFrame;
  /** T number in the program → library tool id */
  toolMap: Record<number, string>;
}

const KEYS = {
  tools: 'lowrider-control.tools',
  materials: 'lowrider-control.materials',
  zeros: 'lowrider-control.zeros',
  jigs: 'lowrider-control.jigs',
  history: 'lowrider-control.history',
  learning: 'lowrider-control.learning',
  settings: 'lowrider-control.settings',
  setup: 'lowrider-control.setup',
  reference: 'lowrider-control.toolReference',
};

const HISTORY_LIMIT = 500;

const isRecord = (v: unknown): v is JobRecord =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as JobRecord).id === 'string' &&
  typeof (v as JobRecord).startedAt === 'number';

export function validateSettings(value: unknown): WorkshopSettings | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Partial<WorkshopSettings>;
  // Unknown or missing parts fall back to the defaults, so new settings never break old storage.
  return {
    ...DEFAULT_SETTINGS,
    ...v,
    spindle: { ...DEFAULT_SETTINGS.spindle, ...v.spindle },
    adaptive: { ...DEFAULT_SETTINGS.adaptive, ...v.adaptive },
    camera: { ...DEFAULT_SETTINGS.camera, ...v.camera },
    cornerPlate: { ...DEFAULT_SETTINGS.cornerPlate, ...v.cornerPlate },
    calibration: { ...DEFAULT_SETTINGS.calibration, ...v.calibration },
    recording: { ...DEFAULT_SETTINGS.recording, ...v.recording },
    waypoints: validWaypoints(v.waypoints),
    hiddenFeatures: validHiddenFeatures(v.hiddenFeatures),
  };
}

export function validateSetup(value: unknown): JobSetup | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Partial<JobSetup>;
  const fixtures = Array.isArray(v.fixtures) ? v.fixtures : [];
  return {
    materialId: typeof v.materialId === 'string' ? v.materialId : null,
    stock: v.stock ?? null,
    fixtures,
    // Storage without the mark is from before clamps were pinned to the table.
    fixtureFrame: v.fixtureFrame === 'machine' || fixtures.length === 0 ? 'machine' : 'work',
    toolMap: typeof v.toolMap === 'object' && v.toolMap !== null ? v.toolMap : {},
  };
}

const s = browserStorage;

interface WorkshopStore {
  tools: Tool[];
  materials: Material[];
  zeros: SavedZero[];
  /** Jigs with printed tags, each with its job and where the zero lies on it */
  jigs: Jig[];
  history: JobRecord[];
  learning: LearningModel;
  settings: WorkshopSettings;
  setup: JobSetup;
  /** Machine Z where the reference tool touched the tool setter (for G43.1) */
  toolReferenceZ: number | null;
  companionOnline: boolean | null;
  /** Last health check of the companion (what it offers) */
  companionHealth: CompanionHealth | null;
  saveTool(tool: Tool): void;
  removeTool(id: string): void;
  saveMaterial(material: Material): void;
  removeMaterial(id: string): void;
  saveZero(zero: SavedZero): void;
  removeZero(id: string): void;
  saveJig(jig: Jig): void;
  removeJig(id: string): void;
  addRecord(record: JobRecord, learnFrom?: { chatter: boolean; load?: number }): void;
  clearHistory(): void;
  setSettings(patch: Partial<WorkshopSettings>): void;
  /** Takes settings that came from the Pi: kept like any other, but not sent back (the sync knows them). */
  adoptSettings(settings: WorkshopSettings): void;
  setSetup(patch: Partial<JobSetup>): void;
  /**
   * Pins fixtures that are still stored relative to the work zero to the
   * table, given the work offset of this moment. Does nothing once pinned.
   */
  pinFixturesAt(wco: readonly number[]): void;
  setToolReferenceZ(z: number | null): void;
  /** Adds or replaces tools and materials from an imported profile. */
  importLibraries(tools: Tool[], materials: Material[]): void;
  /** Pulls the libraries from the companion and pushes local entries it lacks. */
  syncCompanion(): Promise<boolean>;
  resetLearning(): void;
}

export function companion(): CompanionClient | null {
  const base = companionBase(useWorkshop.getState().settings.companionUrl);
  return base ? new CompanionClient(base) : null;
}

/**
 * Takes over what a companion offers: remembers its health check and takes its
 * camera stream, unless one is already set.
 */
export function adoptCompanion(health: CompanionHealth) {
  useWorkshop.setState({ companionHealth: health });
  const base = companionBase(useWorkshop.getState().settings.companionUrl);
  const { camera } = useWorkshop.getState().settings;
  if (!base || !health.camera || camera.streamUrl) return;
  useWorkshop
    .getState()
    .setSettings({ camera: { ...camera, streamUrl: resolveCameraUrl(base, health.camera) } });
}

/**
 * When the app is served by the companion itself (the Pi on the machine),
 * it is found without typing an address: same origin, `/api/health`.
 */
export async function detectCompanion(
  origin: string = location.origin,
  fetchFn: typeof fetch = (...args) => fetch(...args),
): Promise<boolean> {
  // A companion typed in earlier is asked too, so what it offers (power-off,
  // recording) shows without pressing "Verbindung testen" first.
  const configured = companionBase(useWorkshop.getState().settings.companionUrl);
  if (configured) {
    try {
      const health = await new CompanionClient(configured, fetchFn).health();
      if (health.ok !== true) return false;
      useWorkshop.setState({ companionOnline: true });
      adoptCompanion(health);
      return true;
    } catch {
      return false;
    }
  }
  if (!/^https?:/.test(origin)) return false;
  try {
    const health = await new CompanionClient(origin, fetchFn).health();
    if (health.ok !== true || typeof health.version !== 'string') return false;
    useWorkshop.getState().setSettings({ companionUrl: origin });
    useWorkshop.setState({ companionOnline: true });
    adoptCompanion(health);
    return true;
  } catch {
    return false;
  }
}

/** Asks for the companion at start and every 30 s until it answers (the Pi may boot after the app). */
export function startCompanionProbe(every = 30_000): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const probe = () =>
    void detectCompanion().then((found) => {
      if (!found && !stopped) timer = setTimeout(probe, every);
    });
  probe();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

/** Fire-and-forget write to the companion; the browser copy is authoritative offline. */
function push(fn: (c: CompanionClient) => Promise<unknown>) {
  const c = companion();
  if (c) fn(c).catch(() => useWorkshop.setState({ companionOnline: false }));
}

export const useWorkshop = create<WorkshopStore>((set, get) => ({
  tools: loadJson(s, KEYS.tools, listOf(validateTool), DEFAULT_TOOLS),
  materials: loadJson(s, KEYS.materials, listOf(validateMaterial), DEFAULT_MATERIALS),
  zeros: loadJson(s, KEYS.zeros, listOf(validateSavedZero), []),
  jigs: loadJson(s, KEYS.jigs, listOf(validateJig), []),
  history: loadJson(
    s,
    KEYS.history,
    listOf((v) => (isRecord(v) ? v : null)),
    [],
  ),
  learning: loadJson(
    s,
    KEYS.learning,
    (v) => (typeof v === 'object' && v !== null ? (v as LearningModel) : null),
    {},
  ),
  settings: loadJson(s, KEYS.settings, validateSettings, DEFAULT_SETTINGS),
  setup: loadJson(s, KEYS.setup, validateSetup, {
    materialId: null,
    stock: null,
    fixtures: [],
    fixtureFrame: 'machine',
    toolMap: {},
  }),
  toolReferenceZ: loadJson(s, KEYS.reference, (v) => (typeof v === 'number' ? v : null), null),
  companionOnline: null,
  companionHealth: null,

  saveTool(tool) {
    const tools = mergeById(get().tools, [tool]).sort((a, b) => a.number - b.number);
    set({ tools });
    saveJson(s, KEYS.tools, tools);
    push((c) => c.put('tools', tool));
  },
  removeTool(id) {
    const tools = get().tools.filter((t) => t.id !== id);
    set({ tools });
    saveJson(s, KEYS.tools, tools);
    push((c) => c.remove('tools', id));
  },
  saveMaterial(material) {
    const materials = mergeById(get().materials, [material]);
    set({ materials });
    saveJson(s, KEYS.materials, materials);
    push((c) => c.put('materials', material));
  },
  removeMaterial(id) {
    const materials = get().materials.filter((m) => m.id !== id);
    set({ materials });
    saveJson(s, KEYS.materials, materials);
    push((c) => c.remove('materials', id));
  },
  saveZero(zero) {
    const zeros = mergeById(get().zeros, [zero]);
    set({ zeros });
    saveJson(s, KEYS.zeros, zeros);
    push((c) => c.put('zeros', zero));
  },
  removeZero(id) {
    const zeros = get().zeros.filter((z) => z.id !== id);
    set({ zeros });
    saveJson(s, KEYS.zeros, zeros);
    push((c) => c.remove('zeros', id));
  },
  saveJig(jig) {
    const jigs = mergeById(get().jigs, [jig]);
    set({ jigs });
    saveJson(s, KEYS.jigs, jigs);
    push((c) => c.put('jigs', jig));
  },
  removeJig(id) {
    const jigs = get().jigs.filter((j) => j.id !== id);
    set({ jigs });
    saveJson(s, KEYS.jigs, jigs);
    push((c) => c.remove('jigs', id));
  },
  addRecord(record, observation) {
    const history = [...get().history, record].slice(-HISTORY_LIMIT);
    let learning = get().learning;
    const { setup, tools } = get();
    // Only a finished cut in a known material teaches the cutting values.
    if (observation && setup.materialId && record.result !== 'alarm') {
      for (const number of record.tools) {
        const toolId = setup.toolMap[number] ?? tools.find((t) => t.number === number)?.id;
        if (!toolId) continue;
        learning = learn(learning, {
          toolId,
          materialId: setup.materialId,
          feedOverride: record.feedOverride,
          completed: record.result === 'done',
          chatter: observation.chatter,
          load: observation.load,
        });
      }
    }
    set({ history, learning });
    saveJson(s, KEYS.history, history);
    saveJson(s, KEYS.learning, learning);
    push((c) => c.put('history', record));
    push((c) => c.put('learning', { id: 'model', model: learning } as { id: string }));
  },
  clearHistory() {
    set({ history: [] });
    saveJson(s, KEYS.history, []);
  },
  setSettings(patch) {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    saveJson(s, KEYS.settings, settings);
  },
  adoptSettings(settings) {
    set({ settings });
    saveJson(s, KEYS.settings, settings);
  },
  setSetup(patch) {
    const setup = { ...get().setup, ...patch };
    set({ setup });
    saveJson(s, KEYS.setup, setup);
  },
  pinFixturesAt(wco) {
    const { setup } = get();
    if (setup.fixtureFrame === 'machine') return;
    get().setSetup({ fixtures: pinFixtures(setup.fixtures, wco), fixtureFrame: 'machine' });
  },
  setToolReferenceZ(z) {
    set({ toolReferenceZ: z });
    saveJson(s, KEYS.reference, z);
  },
  importLibraries(tools, materials) {
    const t = mergeById(get().tools, tools).sort((a, b) => a.number - b.number);
    const m = mergeById(get().materials, materials);
    set({ tools: t, materials: m });
    saveJson(s, KEYS.tools, t);
    saveJson(s, KEYS.materials, m);
    push((c) => c.putAll('tools', tools));
    push((c) => c.putAll('materials', materials));
  },
  async syncCompanion() {
    const c = companion();
    if (!c) return false;
    try {
      await c.health();
      const [tools, materials, zeros, history, jigs] = await Promise.all([
        c.list<Tool>('tools'),
        c.list<Material>('materials'),
        c.list<SavedZero>('zeros'),
        c.list<JobRecord>('history'),
        // A companion of an older version does not keep jigs yet: they stay in the browser.
        c.list<Jig>('jigs').catch(() => null),
      ]);
      const state = get();
      const merged = {
        tools: mergeById(
          state.tools,
          tools.map(validateTool).filter((t) => t !== null),
        ),
        materials: mergeById(
          state.materials,
          materials.map(validateMaterial).filter((m) => m !== null),
        ),
        zeros: mergeById(
          state.zeros,
          zeros.map(validateSavedZero).filter((z) => z !== null),
        ),
        history: mergeById(state.history, history.filter(isRecord))
          .sort((a, b) => a.startedAt - b.startedAt)
          .slice(-HISTORY_LIMIT),
        jigs: mergeById(
          state.jigs,
          (jigs ?? []).map(validateJig).filter((j) => j !== null),
        ),
      };
      set({ ...merged, companionOnline: true });
      saveJson(s, KEYS.tools, merged.tools);
      saveJson(s, KEYS.materials, merged.materials);
      saveJson(s, KEYS.zeros, merged.zeros);
      saveJson(s, KEYS.history, merged.history);
      saveJson(s, KEYS.jigs, merged.jigs);
      await Promise.all([
        ...(jigs ? [c.putAll('jigs', merged.jigs)] : []),
        c.putAll('tools', merged.tools),
        c.putAll('materials', merged.materials),
        c.putAll('zeros', merged.zeros),
        c.putAll('history', merged.history),
      ]);
      return true;
    } catch {
      set({ companionOnline: false });
      return false;
    }
  },
  resetLearning() {
    set({ learning: {} });
    saveJson(s, KEYS.learning, {});
  },
}));

/** Safe machine Z for lifts: the setting, else 2 mm below the top of the Z travel. */
export function safeMachineZ(settings: WorkshopSettings, zMax: number): number {
  return settings.safeMachineZ ?? zMax - 2;
}
