import { create } from 'zustand';
import {
  commandById,
  NEED_FALLBACK,
  needMet,
  validRecent,
  withRecent,
  type Command,
  type ViewAction,
} from '../lib/commands';
import { releaseAllHolds } from '../lib/holds';
import { browserStorage, loadJson, saveJson } from '../lib/persist';
import { reveal } from '../lib/reveal';
import { globalShortcut, keysFree, PALETTE, typingInto } from '../lib/shortcuts';
import { useCam } from './cam';
import { showTable, useJob } from './job';
import { useStageTools } from './tools';
import { placeHasStage, STEPS, useUi } from './ui';
import { useWorkshop } from './workshop';

const RECENT_KEY = 'lowrider-control.find-recent';

interface FindStore {
  /** What lies over the app: the quick search, the overview of the keys, or nothing */
  open: 'search' | 'keys' | null;
  /** Commands used last, newest first */
  recent: string[];
  /** A hardware keyboard has been used: key caps are worth showing */
  keyboard: boolean;
  show(what: 'search' | 'keys'): void;
  close(): void;
}

/** What had the focus when the search or the key sheet was opened */
let opener: HTMLElement | null = null;

/** Gives the focus back to where it was before the sheet took it. */
export function returnFocus(): void {
  if (useFind.getState().open === null) opener?.focus({ preventScroll: true });
}

export const useFind = create<FindStore>((set, get) => ({
  open: null,
  recent: loadJson(browserStorage, RECENT_KEY, validRecent, []),
  keyboard: false,
  show(open) {
    if (get().open === null && typeof document !== 'undefined') {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    // Whatever is being held – a jog key, a hold button – lets go: the keys go elsewhere now.
    releaseAllHolds();
    set({ open });
  },
  close: () => set({ open: null }),
}));

/**
 * The few things the search does itself. They change what the stage shows
 * and nothing else – this file reaches neither the machine nor a job's run
 * (`test/commands.test.ts` keeps it that way).
 */
const VIEW: Record<ViewAction, () => void> = {
  stageTable: () => useJob.getState().setView('table'),
  stageCamera: () => useJob.getState().setView('camera'),
  stage3d: () => useJob.getState().setView('3d'),
  fit: () => {
    useUi.getState().setFollow(false);
    useJob.getState().requestFit();
  },
  wide: () => useUi.getState().setPanelHidden(!useUi.getState().panelHidden),
  shortcuts: () => useFind.getState().show('keys'),
  // The next step of the flow; from the start screen or a side area, its first.
  nextStep: () => {
    const ui = useUi.getState();
    const at = (STEPS as readonly string[]).indexOf(ui.place);
    ui.go(STEPS[Math.min(at + 1, STEPS.length - 1)]!);
  },
};

/** Goes to where a command lives and returns what to show there. */
function goTo(command: Command): readonly string[] {
  const ui = useUi.getState();
  const met = needMet(command.needs, {
    program: useJob.getState().analysis !== null,
    expert: useWorkshop.getState().settings.expertMode,
  });
  if (!met) {
    // The place is not there yet: land where it comes from.
    const instead = NEED_FALLBACK[command.needs!];
    ui.go(instead.place, instead.view as never);
    if (instead.place === 'job') ui.setDrawing(false);
    return [instead.anchor];
  }
  if (command.place) ui.go(command.place, command.view as never);
  if (command.jog) ui.setJogOpen(true);
  if (command.drawing) {
    // As the button "Zeichnen" does it: the workspace, the table from above.
    useCam.getState().open();
    ui.setDrawing(true);
    useJob.getState().setProjection('top');
  } else if (command.place === 'job' && command.on !== 'nav') {
    ui.setDrawing(false);
  }
  // What lives on the picture needs a place that has one: from Start or a list area
  // (Werkzeugliste, Einstellungen …) the way leads to ③ Einrichten, where the tap tools are used.
  if ((command.on === 'stage' || command.tool || command.table) && !command.place && !command.jog) {
    const { place, views } = useUi.getState();
    if (!placeHasStage(place, views)) ui.go('setup');
  }
  if (command.tool) {
    showTable();
    useStageTools.getState().select(command.tool);
  } else if (command.table) {
    showTable();
  }
  return command.anchor;
}

/**
 * Runs a command of the quick search: goes to its place and shows it, or –
 * for the few `view` commands – changes the view. Never more than that.
 */
export function runCommand(id: string): void {
  const command = commandById(id);
  if (!command) return;
  const recent = withRecent(useFind.getState().recent, command.id);
  saveJson(browserStorage, RECENT_KEY, recent);
  useFind.setState({ open: null, recent });
  if (command.kind === 'view') {
    VIEW[command.action!]();
    reveal(command.anchor);
  } else {
    reveal(goTo(command));
  }
}

/**
 * The global keys (`lib/shortcuts.ts`): only while nothing is typed and no
 * dialog has the keys – except the key of the search itself, which also
 * closes it again. Returns the function that stops listening.
 */
export function startFind(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const down = (e: KeyboardEvent) => {
    // A key outside a field, or with Ctrl/Cmd: there is a real keyboard.
    if (!useFind.getState().keyboard && (!typingInto(e.target) || e.ctrlKey || e.metaKey)) {
      useFind.setState({ keyboard: true });
      document.documentElement.classList.add('has-keys');
    }
    if (e.repeat || e.defaultPrevented) return;
    const shortcut = globalShortcut(e);
    if (!shortcut) return;
    const { open, show, close } = useFind.getState();
    if (shortcut.runs === PALETTE) {
      // Ctrl/Cmd+K works from a field too; "/" is a letter there.
      const combo = e.ctrlKey || e.metaKey;
      if (open === 'search') {
        if (!combo) return;
        e.preventDefault();
        close();
      } else if (open === null && (combo ? !blocked() : keysFree(e.target, document))) {
        e.preventDefault();
        show('search');
      }
      return;
    }
    if (open !== null || !keysFree(e.target, document)) return;
    e.preventDefault();
    runCommand(shortcut.runs!);
  };
  window.addEventListener('keydown', down);
  return () => window.removeEventListener('keydown', down);
}

/** A dialog that asks something (a tool change) keeps the keys to itself. */
function blocked(): boolean {
  return !keysFree(null, document);
}
