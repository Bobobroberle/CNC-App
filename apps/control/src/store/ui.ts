import { create } from 'zustand';
import { browserStorage, loadJson, saveJson } from '../lib/persist';
import type { SheetLevel } from '../ui/sheet';

/**
 * The areas of the work that run with the picture (DESIGN.md §3.2), in their order. Werkzeuge and
 * Prüfen are no places of their own any more: they are the view "check" of `run` (Fräsen).
 */
export const STEPS = ['job', 'setup', 'run'] as const;
export type Step = (typeof STEPS)[number];
/** The areas beside the flow (§3.3); the jog panel is no place, it opens over any of them */
export const AREAS = ['toollist', 'service', 'settings', 'console'] as const;
export type Area = (typeof AREAS)[number];
/**
 * The drawing workspace (CAM): a place of its own with the table picture but no state of the
 * readiness list – so it is no `Step`.
 */
export const CAM = 'cam' as const;
/** Where the operator is: the start screen, a step of the flow, the CAM or a side area */
export type Place = 'start' | Step | typeof CAM | Area;
export const PLACES: readonly Place[] = ['start', ...STEPS, CAM, ...AREAS];

/** The second level, where a place has one: at most two levels of navigation (§3.4) */
export type JobView = 'prepare' | 'extras';
export type SetupView = 'zero' | 'probe' | 'camera' | 'align';
/** Fräsen: the cutting itself, or the check before it (readiness list, simulation, the job's tools) */
export type RunView = 'cut' | 'check';
export type ServiceView = 'diagnose' | 'messages' | 'history' | 'calibrate';
export type SettingsView = 'connection' | 'machine' | 'camera' | 'expert';
export interface PlaceViews {
  job: JobView;
  setup: SetupView;
  run: RunView;
  service: ServiceView;
  settings: SettingsView;
}
export type ViewedPlace = keyof PlaceViews;
export type AnyView = PlaceViews[ViewedPlace];
export const VIEWS: { readonly [P in ViewedPlace]: readonly PlaceViews[P][] } = {
  job: ['prepare', 'extras'],
  setup: ['zero', 'probe', 'camera', 'align'],
  run: ['cut', 'check'],
  service: ['diagnose', 'messages', 'history', 'calibrate'],
  settings: ['connection', 'machine', 'camera', 'expert'],
};

/** A step of the flow: it has a state in the readiness list */
export const isStep = (place: Place): place is Step => (STEPS as readonly string[]).includes(place);
/** The places that work with the picture: the steps and the CAM */
export const hasPicture = (place: Place): place is Step | typeof CAM =>
  isStep(place) || place === CAM;

/**
 * What the shell shows around a place. The drawing workspace shows only itself and the status bar
 * (DESIGN.md §4): no action bar with the jog button, no bar of a running job, no jog panel over
 * it and none of the stage's tools (tap tools, joystick, the live inset, the other views). Every
 * piece of the shell that is left out there asks this one function.
 */
export interface ShellParts {
  /** The bar at the bottom: jog button, the job at a glance, the area's primary action */
  actionBar: boolean;
  /** The bar of a running job at the top of the panel */
  runBar: boolean;
  /** The jog panel may lie over the place */
  jog: boolean;
  /** The stage's tools: mode switch, tap tools, joystick, live inset, follow, the Z gauge */
  stageTools: boolean;
}
export function shellParts(place: Place): ShellParts {
  const bare = place === CAM;
  return { actionBar: !bare, runBar: !bare, jog: !bare, stageTools: !bare };
}

/**
 * Whether a place works with the picture. The steps do; of the side areas
 * only the two that measure in it – calibrating and setting up the camera.
 * The others are lists and get the whole width (DESIGN.md §4: the main area
 * shows the view, the picture **or lists**).
 */
export function placeHasStage(place: Place, views: PlaceViews): boolean {
  if (place === 'service') return views.service === 'calibrate';
  if (place === 'settings') return views.settings === 'camera';
  return hasPicture(place);
}
export const hasViews = (place: Place): place is ViewedPlace => place in VIEWS;

export type Theme = 'dark' | 'light';
const THEME_KEY = 'lowrider-control.theme';
const validTheme = (value: unknown): Theme | null =>
  value === 'dark' || value === 'light' ? value : null;

/** Says the theme on the page itself: the class the tokens hang on, and the browser's own colours. */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.background = theme === 'dark' ? '#0f1115' : '#f4f5f7';
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#0f1115' : '#f4f5f7');
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', theme);
}

/**
 * How deep a panel is unfolded (DESIGN.md §2): `simple` is the guided default,
 * `more` shows "Mehr Optionen", `all` also "Alle Parameter". Kept per area.
 */
export type Depth = 'simple' | 'more' | 'all';
const DEPTH_KEY = 'lowrider-control.depth';
const validDepth = (value: unknown): Record<string, Depth> | null => {
  if (typeof value !== 'object' || value === null) return null;
  const out: Record<string, Depth> = {};
  for (const [area, depth] of Object.entries(value)) {
    if (depth === 'simple' || depth === 'more' || depth === 'all') out[area] = depth;
  }
  return out;
};

/** How far the bottom sheet is up (`ui/sheet.tsx`), kept per place; `jog` is the jog panel's */
const SHEET_KEY = 'lowrider-control.sheet';
const validSheet = (value: unknown): Record<string, SheetLevel> | null => {
  if (typeof value !== 'object' || value === null) return null;
  const out: Record<string, SheetLevel> = {};
  for (const [place, level] of Object.entries(value)) {
    if (level === 'peek' || level === 'half' || level === 'full') out[place] = level;
  }
  return out;
};

/**
 * What helps a finger that drags a part of the drawing: its box snaps to the lines of the other parts and of
 * the stock (`snap`) and the room to the neighbours shows (`gaps`). Both are on until the operator switches
 * one off – this device's choice, remembered, no step of the drawing.
 */
export interface DragAids {
  snap: boolean;
  gaps: boolean;
}
const AIDS_KEY = 'lowrider-control.dragAids';
const validAids = (value: unknown): DragAids | null => {
  if (typeof value !== 'object' || value === null) return null;
  const { snap, gaps } = value as Record<string, unknown>;
  return { snap: snap !== false, gaps: gaps !== false };
};

/** What the stage shows in a step when the operator has not chosen otherwise (DESIGN.md §5) */
export type StageView = 'table' | 'camera' | '3d';
export const STEP_STAGE: Record<Step | typeof CAM, StageView> = {
  job: 'table',
  cam: 'table',
  setup: 'table',
  run: '3d',
};

export type PositionFrame = 'work' | 'machine';
/** Parts of the settings that other places link to */
export type SetupSection = 'camera';

interface UiStore {
  place: Place;
  views: PlaceViews;
  /** Goes to a place (and a view of it); the context panel comes back, the jog panel closes */
  go<P extends Place>(place: P, view?: P extends ViewedPlace ? PlaceViews[P] : never): void;
  setView<P extends ViewedPlace>(place: P, view: PlaceViews[P]): void;
  /** The jog panel lies over the context panel, from any place */
  jogOpen: boolean;
  setJogOpen(open: boolean): void;
  theme: Theme;
  setTheme(theme: Theme): void;
  /** Depth of the panels per area (§2), remembered */
  depth: Record<string, Depth>;
  setDepth(area: string, depth: Depth): void;
  /** Snapping and the gaps while a part of the drawing is dragged (switches of the CAM card), remembered */
  aids: DragAids;
  setAids(patch: Partial<DragAids>): void;
  /** The bottom sheet's rest per place (600–1023 px and upright), remembered */
  sheet: Record<string, SheetLevel>;
  setSheet(place: string, level: SheetLevel): void;
  /** The stage view the operator chose in a step; without one the step's own (`STEP_STAGE`) */
  stageViews: Partial<Record<Step | typeof CAM, StageView>>;
  setStageView(step: Step | typeof CAM, view: StageView): void;
  /**
   * A view asked for by name (the quick search) for the place it leads to: the place shows it once
   * on arrival, then its own again – nothing is remembered as the operator's choice.
   */
  arrival: { place: Place; view: StageView } | null;
  setArrival(place: Place, view: StageView): void;
  /** "Drive here" lifts to the safe height first */
  liftBeforeMove: boolean;
  setLiftBeforeMove(lift: boolean): void;
  /** The joystick lies on the stage (table and camera view) */
  stageStick: boolean;
  setStageStick(shown: boolean): void;
  /** The table view keeps the tool in the middle ("Folgen") */
  follow: boolean;
  setFollow(follow: boolean): void;
  /** The context panel is put away: the stage has the whole width ("Großbild") */
  panelHidden: boolean;
  setPanelHidden(hidden: boolean): void;
  /** Leaves the CAM for the Job – only where the CAM is what shows (a program loaded elsewhere changes nothing) */
  leaveCam(): void;
  /** Goes to the part of the settings a link asked for (Einstellungen → Kamera) */
  openSetup(section: SetupSection): void;
  /** Which coordinates the position shows; a tap on it switches */
  positionFrame: PositionFrame;
  togglePositionFrame(): void;
}

export const useUi = create<UiStore>((set) => ({
  place: 'start',
  views: { job: 'prepare', setup: 'zero', run: 'cut', service: 'diagnose', settings: 'connection' },
  // Going anywhere brings the panel back: that is where a place's content is.
  go(place, view) {
    set((s) => ({
      place,
      // Fräsen opens on the cutting itself; the check is asked for ("Prüfen" on a locked start).
      views:
        view && hasViews(place)
          ? { ...s.views, [place]: view }
          : place === 'run'
            ? { ...s.views, run: 'cut' }
            : s.views,
      panelHidden: false,
      jogOpen: false,
    }));
  },
  setView: (place, view) => set((s) => ({ views: { ...s.views, [place]: view } })),
  jogOpen: false,
  // Where the place has no jog panel (the drawing workspace) it opens over Einrichten.
  setJogOpen: (jogOpen) =>
    set((s) =>
      !jogOpen
        ? { jogOpen }
        : shellParts(s.place).jog
          ? { jogOpen, panelHidden: false }
          : { place: 'setup', jogOpen, panelHidden: false },
    ),
  theme: loadJson(browserStorage, THEME_KEY, validTheme, 'dark'),
  setTheme(theme) {
    saveJson(browserStorage, THEME_KEY, theme);
    applyTheme(theme);
    set({ theme });
  },
  depth: loadJson(browserStorage, DEPTH_KEY, validDepth, {}),
  setDepth(area, depth) {
    set((s) => {
      const next = { ...s.depth, [area]: depth };
      saveJson(browserStorage, DEPTH_KEY, next);
      return { depth: next };
    });
  },
  aids: loadJson(browserStorage, AIDS_KEY, validAids, { snap: true, gaps: true }),
  setAids(patch) {
    set((s) => {
      const next = { ...s.aids, ...patch };
      saveJson(browserStorage, AIDS_KEY, next);
      return { aids: next };
    });
  },
  sheet: loadJson(browserStorage, SHEET_KEY, validSheet, {}),
  setSheet(place, level) {
    set((s) => {
      if ((s.sheet[place] ?? 'half') === level) return s;
      const next = { ...s.sheet, [place]: level };
      saveJson(browserStorage, SHEET_KEY, next);
      return { sheet: next };
    });
  },
  stageViews: {},
  arrival: null,
  setArrival: (place, view) => set({ arrival: { place, view } }),
  setStageView: (step, view) => set((s) => ({ stageViews: { ...s.stageViews, [step]: view } })),
  liftBeforeMove: true,
  setLiftBeforeMove: (liftBeforeMove) => set({ liftBeforeMove }),
  stageStick: false,
  setStageStick: (stageStick) => set({ stageStick }),
  follow: false,
  setFollow: (follow) => set({ follow }),
  panelHidden: false,
  setPanelHidden: (panelHidden) => set({ panelHidden }),
  leaveCam: () => set((s) => (s.place === CAM ? { place: 'job' } : {})),
  openSetup: (section) =>
    set((s) => ({
      place: 'settings',
      views: { ...s.views, settings: section },
      panelHidden: false,
      jogOpen: false,
    })),
  positionFrame: 'work',
  togglePositionFrame: () =>
    set((s) => ({ positionFrame: s.positionFrame === 'work' ? 'machine' : 'work' })),
}));
