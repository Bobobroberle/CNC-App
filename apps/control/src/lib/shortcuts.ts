import type { MessageKey } from '../i18n';

/**
 * Every key of the app in one table (DESIGN.md §8): the rows of the quick
 * search, the overview ("Tastenkürzel") and the handlers all read it.
 *
 * - `global` keys run a command of the quick search (`lib/commands.ts`),
 *   which can only go somewhere or change the view.
 * - `machine` keys are the two that reach the machine, and only to make it
 *   safer: Space holds the feed, Esc asks whether to abort the running job
 *   (`store/keys.ts`). There is no key for NOT-HALT, a start or homing.
 * - The keys of the drawing (`lib/camKeys.ts`) and of the jog panel keep
 *   their own handlers; they are listed here so the overview is complete,
 *   and a test holds the table against them.
 */

/** What is looked at in a key event. */
export interface KeyLike {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

/** A key as the table writes it down: `mod` is Ctrl, or Cmd on a Mac. */
export interface KeySpec {
  key: string;
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export type ShortcutGroup = 'general' | 'machine' | 'view' | 'drawing' | 'drive';
/** Where a key acts: everywhere, on the machine, in the drawing workspace, while the jog panel is open */
export type ShortcutScope = 'global' | 'machine' | 'drawing' | 'drive';
/** What a machine key does */
export type MachineKey = 'pause' | 'abort';

/** What a key cap shows; words come from the dictionary (`find.caps`), the rest is itself. */
export type Cap =
  | 'mod'
  | 'shift'
  | 'alt'
  | 'del'
  | 'backspace'
  | 'esc'
  | 'arrows'
  | 'pageUp'
  | 'pageDown'
  | 'space'
  | 'right'
  | 'wheel'
  | (string & {});

export interface Shortcut {
  id: string;
  group: ShortcutGroup;
  scope: ShortcutScope;
  label: MessageKey;
  /** The ways to press it, each a row of key caps */
  caps: readonly (readonly Cap[])[];
  /** The key events it stands for */
  keys: readonly KeySpec[];
  /** Global keys: the command of the quick search it runs, or the search itself */
  runs?: string;
  /** Machine keys: what the key does */
  acts?: MachineKey;
}

const ARROW_KEYS: readonly KeySpec[] = [
  { key: 'ArrowLeft' },
  { key: 'ArrowRight' },
  { key: 'ArrowUp' },
  { key: 'ArrowDown' },
];
const withKeys = (extra: Partial<KeySpec>): KeySpec[] =>
  ARROW_KEYS.map((k) => ({ ...k, ...extra }));

/** The command id the palette key stands for (it is not an entry of the search itself) */
export const PALETTE = 'palette';

export const SHORTCUTS: readonly Shortcut[] = [
  {
    id: 'palette',
    group: 'general',
    scope: 'global',
    label: 'find.keys.palette',
    caps: [['mod', 'K'], ['/']],
    keys: [{ key: 'k', mod: true }, { key: '/' }],
    runs: PALETTE,
  },
  {
    id: 'shortcuts',
    group: 'general',
    scope: 'global',
    label: 'find.keys.shortcuts',
    caps: [['?']],
    keys: [{ key: '?' }],
    runs: 'shortcuts',
  },
  {
    id: 'pause',
    group: 'machine',
    scope: 'machine',
    label: 'find.keys.pause',
    caps: [['space']],
    keys: [{ key: ' ' }],
    acts: 'pause',
  },
  {
    id: 'abort',
    group: 'machine',
    scope: 'machine',
    label: 'find.keys.abort',
    caps: [['esc']],
    keys: [{ key: 'Escape' }],
    acts: 'abort',
  },
  {
    id: 'stageTable',
    group: 'view',
    scope: 'global',
    label: 'find.keys.stageTable',
    caps: [['T']],
    keys: [{ key: 't' }],
    runs: 'stageTable',
  },
  {
    id: 'stageCamera',
    group: 'view',
    scope: 'global',
    label: 'find.keys.stageCamera',
    caps: [['K']],
    keys: [{ key: 'k' }],
    runs: 'stageCamera',
  },
  {
    id: 'stage3d',
    group: 'view',
    scope: 'global',
    label: 'find.keys.stage3d',
    caps: [['D']],
    keys: [{ key: 'd' }],
    runs: 'stage3d',
  },
  {
    id: 'fit',
    group: 'view',
    scope: 'global',
    label: 'find.keys.fit',
    caps: [['E']],
    keys: [{ key: 'e' }],
    runs: 'fit',
  },
  {
    id: 'camDelete',
    group: 'drawing',
    scope: 'drawing',
    label: 'find.keys.camDelete',
    caps: [['del'], ['backspace']],
    keys: [{ key: 'Delete' }, { key: 'Backspace' }],
  },
  {
    id: 'camNudge',
    group: 'drawing',
    scope: 'drawing',
    label: 'find.keys.camNudge',
    caps: [['arrows']],
    keys: ARROW_KEYS,
  },
  {
    id: 'camNudgeFar',
    group: 'drawing',
    scope: 'drawing',
    label: 'find.keys.camNudgeFar',
    caps: [['shift', 'arrows']],
    keys: withKeys({ shift: true }),
  },
  {
    id: 'camNudgeFine',
    group: 'drawing',
    scope: 'drawing',
    label: 'find.keys.camNudgeFine',
    caps: [['alt', 'arrows']],
    keys: withKeys({ alt: true }),
  },
  {
    id: 'camUndo',
    group: 'drawing',
    scope: 'drawing',
    label: 'find.keys.camUndo',
    caps: [['mod', 'Z']],
    keys: [{ key: 'z', mod: true }],
  },
  {
    id: 'camRedo',
    group: 'drawing',
    scope: 'drawing',
    label: 'find.keys.camRedo',
    caps: [
      ['mod', 'shift', 'Z'],
      ['mod', 'Y'],
    ],
    keys: [
      { key: 'z', mod: true, shift: true },
      { key: 'y', mod: true },
    ],
  },
  {
    id: 'camDuplicate',
    group: 'drawing',
    scope: 'drawing',
    label: 'find.keys.camDuplicate',
    caps: [['mod', 'D']],
    keys: [{ key: 'd', mod: true }],
  },
  {
    id: 'camCopy',
    group: 'drawing',
    scope: 'drawing',
    label: 'find.keys.camCopy',
    caps: [
      ['mod', 'C'],
      ['mod', 'V'],
    ],
    keys: [
      { key: 'c', mod: true },
      { key: 'v', mod: true },
    ],
  },
  {
    id: 'camAll',
    group: 'drawing',
    scope: 'drawing',
    label: 'find.keys.camAll',
    caps: [['mod', 'A']],
    keys: [{ key: 'a', mod: true }],
  },
  {
    id: 'camDeselect',
    group: 'drawing',
    scope: 'drawing',
    label: 'find.keys.camDeselect',
    caps: [['esc']],
    keys: [{ key: 'Escape' }],
  },
  {
    id: 'jogXY',
    group: 'drive',
    scope: 'drive',
    label: 'find.keys.jogXY',
    caps: [['arrows']],
    keys: ARROW_KEYS,
  },
  {
    id: 'jogZ',
    group: 'drive',
    scope: 'drive',
    label: 'find.keys.jogZ',
    caps: [['pageUp'], ['pageDown']],
    keys: [{ key: 'PageUp' }, { key: 'PageDown' }],
  },
  {
    id: 'jogStep',
    group: 'drive',
    scope: 'drive',
    label: 'find.keys.jogStep',
    caps: [['1'], ['2'], ['3'], ['4'], ['5']],
    keys: [{ key: '1' }, { key: '2' }, { key: '3' }, { key: '4' }, { key: '5' }],
  },
  {
    // No key: the wheel counts only while the mouse button is held on its field in the jog panel.
    id: 'jogWheel',
    group: 'drive',
    scope: 'drive',
    label: 'find.keys.jogWheel',
    caps: [['wheel']],
    keys: [],
  },
  {
    id: 'jogStop',
    group: 'drive',
    scope: 'drive',
    label: 'find.keys.jogStop',
    caps: [['esc']],
    keys: [{ key: 'Escape' }],
  },
];

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  'general',
  'machine',
  'view',
  'drawing',
  'drive',
];

/** Keyboard jogging: arrows for X/Y, Page Up/Down for Z (Escape stops). */
export const JOG_KEYS: Record<string, ['X' | 'Y' | 'Z', 1 | -1]> = {
  ArrowRight: ['X', 1],
  ArrowLeft: ['X', -1],
  ArrowUp: ['Y', 1],
  ArrowDown: ['Y', -1],
  PageUp: ['Z', 1],
  PageDown: ['Z', -1],
};

/** The jog step a digit chooses: 0,01 · 0,1 · 1 · 10 mm · continuous (DESIGN.md §5, §8). */
export const JOG_STEP_KEYS: Record<string, 0.01 | 0.1 | 1 | 10 | 'continuous'> = {
  '1': 0.01,
  '2': 0.1,
  '3': 1,
  '4': 10,
  '5': 'continuous',
};

const letter = (key: string) => (key.length === 1 ? key.toLowerCase() : key);

/**
 * Whether an event is this key. Letters and digits are pressed bare; a sign
 * such as `?` or `/` needs Shift on some keyboards and not on others, so
 * Shift only counts where the table asks for it or a named key is meant.
 */
export function matchesKey(e: KeyLike, spec: KeySpec): boolean {
  if (letter(e.key) !== letter(spec.key)) return false;
  if ((e.ctrlKey || e.metaKey) !== (spec.mod === true)) return false;
  if (e.altKey !== (spec.alt === true)) return false;
  const sign = spec.key.length === 1 && !/[a-z0-9]/i.test(spec.key);
  return sign || e.shiftKey === (spec.shift === true);
}

/** The event a key of the table stands for (for tests and for comparing keys). */
export function eventOf(spec: KeySpec): KeyLike {
  return {
    key: spec.key,
    shiftKey: spec.shift === true,
    altKey: spec.alt === true,
    ctrlKey: spec.mod === true,
    metaKey: false,
  };
}

/** The global key an event is, if any. */
export function globalShortcut(e: KeyLike): Shortcut | null {
  return (
    SHORTCUTS.find((s) => s.scope === 'global' && s.keys.some((spec) => matchesKey(e, spec))) ??
    null
  );
}

/** What a key does to the machine, if it is one of the two machine keys. */
export function machineKey(e: KeyLike): MachineKey | null {
  const hit = SHORTCUTS.find(
    (s) => s.scope === 'machine' && s.keys.some((spec) => matchesKey(e, spec)),
  );
  return hit?.acts ?? null;
}

/** The key of a command of the quick search, if it has one. */
export function shortcutFor(command: string): Shortcut | null {
  return SHORTCUTS.find((s) => s.scope === 'global' && s.runs === command) ?? null;
}

/** Whether the keys are being typed into something: a field, a list, editable text. */
export function typingInto(target: unknown): boolean {
  const el = target as { tagName?: string; isContentEditable?: boolean } | null;
  const tag = el?.tagName?.toUpperCase();
  return (
    tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable === true
  );
}

/** What asks the operator something and so takes the keys: any open dialog. */
export const DIALOGS = 'dialog[open], [role="dialog"], [role="alertdialog"]';

/** Whether a key may act on the app: nothing is being typed and no dialog is open. */
export function keysFree(
  target: unknown,
  doc: { querySelector(selector: string): unknown } | undefined,
): boolean {
  return !typingInto(target) && !doc?.querySelector(DIALOGS);
}
