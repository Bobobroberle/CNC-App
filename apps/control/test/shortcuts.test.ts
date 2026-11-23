import { describe, expect, it } from 'vitest';
import { hasKey } from '../src/i18n';
import { camKey } from '../src/lib/camKeys';
import { commandById } from '../src/lib/commands';
import {
  eventOf,
  globalShortcut,
  JOG_KEYS,
  JOG_STEP_KEYS,
  keysFree,
  machineKey,
  matchesKey,
  PALETTE,
  SHORTCUT_GROUPS,
  shortcutFor,
  SHORTCUTS,
  typingInto,
  type KeyLike,
  type Shortcut,
} from '../src/lib/shortcuts';

const key = (k: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  key: k,
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  ...mods,
});
const scope = (name: Shortcut['scope']) => SHORTCUTS.filter((s) => s.scope === name);
const events = (list: readonly Shortcut[]) => list.flatMap((s) => s.keys.map(eventOf));

describe('the table of keys', () => {
  it('has a unique id, a label, a group and key caps for every way to press each key', () => {
    const ids = SHORTCUTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SHORTCUTS) {
      expect(hasKey(s.label), s.id).toBe(true);
      expect(SHORTCUT_GROUPS, s.id).toContain(s.group);
      expect(s.caps.length, s.id).toBeGreaterThan(0);
      // The mouse wheel is no key: it counts only while its field in the jog panel is held.
      if (s.id === 'jogWheel') expect(s.keys).toEqual([]);
      else expect(s.keys.length, s.id).toBeGreaterThan(0);
    }
    for (const group of SHORTCUT_GROUPS) {
      expect(hasKey(`find.shortcuts.groups.${group}`)).toBe(true);
      expect(
        SHORTCUTS.some((s) => s.group === group),
        group,
      ).toBe(true);
    }
  });

  it('gives no key two meanings where both could apply', () => {
    // The global keys are there together with the keys of the drawing or with the jog keys,
    // and with the two machine keys. (Esc is the one key with more than one meaning: while a
    // job runs it asks whether to abort – `store/keys.ts` takes it first, and nothing can be
    // jogged then; at rest it stops a jog or lets go of the selection.)
    for (const together of [
      [...scope('global'), ...scope('drawing')],
      [...scope('global'), ...scope('drive')],
      [...scope('global'), ...scope('machine')],
      [...scope('machine').filter((s) => s.acts === 'pause'), ...scope('drawing')],
      [...scope('machine').filter((s) => s.acts === 'pause'), ...scope('drive')],
    ]) {
      for (const e of events(together)) {
        const meanings = together.filter((s) => s.keys.some((spec) => matchesKey(e, spec)));
        expect(
          meanings.map((s) => s.id),
          JSON.stringify(e),
        ).toHaveLength(1);
      }
    }
  });

  it('keeps the global keys away from the keys of the drawing and of jogging', () => {
    for (const e of events(scope('global'))) {
      expect(camKey(e), JSON.stringify(e)).toBeNull();
      // Jogging reads bare keys only: with Ctrl, Cmd or Alt a key is not its own.
      if (!e.ctrlKey && !e.altKey) expect(JOG_KEYS[e.key], JSON.stringify(e)).toBeUndefined();
      expect(e.key).not.toBe('Escape');
    }
    for (const e of [...events(scope('drawing')), ...events(scope('drive'))]) {
      expect(globalShortcut(e), JSON.stringify(e)).toBeNull();
    }
  });

  it('lists the keys of the drawing as the drawing reads them', () => {
    const does = (id: string) =>
      SHORTCUTS.find((s) => s.id === id)!.keys.map((spec) => camKey(eventOf(spec)));
    expect(does('camDelete')).toEqual([{ do: 'delete' }, { do: 'delete' }]);
    expect(does('camNudge')[1]).toEqual({ do: 'nudge', dx: 1, dy: 0 });
    expect(does('camNudgeFar')[2]).toEqual({ do: 'nudge', dx: 0, dy: 10 });
    expect(does('camNudgeFine')[0]).toEqual({ do: 'nudge', dx: -0.1, dy: 0 });
    expect(does('camUndo')).toEqual([{ do: 'undo' }]);
    expect(does('camRedo')).toEqual([{ do: 'redo' }, { do: 'redo' }]);
    expect(does('camDuplicate')).toEqual([{ do: 'duplicate' }]);
    expect(does('camCopy')).toEqual([{ do: 'copy' }, { do: 'paste' }]);
    expect(does('camAll')).toEqual([{ do: 'all' }]);
    expect(does('camDeselect')).toEqual([{ do: 'deselect' }]);
    // Nothing the drawing reads is missing from the table.
    for (const s of scope('drawing')) {
      for (const spec of s.keys) expect(camKey(eventOf(spec)), s.id).not.toBeNull();
    }
  });

  it('lists the jog keys as jogging reads them', () => {
    const listed = scope('drive')
      .filter((s) => s.id !== 'jogStep')
      .flatMap((s) => s.keys.map((spec) => spec.key))
      .filter((k) => k !== 'Escape');
    expect(listed.sort()).toEqual(Object.keys(JOG_KEYS).sort());
    // 1–5 choose the step width (DESIGN.md §8): 0,01 · 0,1 · 1 · 10 mm · continuous.
    const steps = SHORTCUTS.find((s) => s.id === 'jogStep')!.keys.map((spec) => spec.key);
    expect(steps).toEqual(Object.keys(JOG_STEP_KEYS));
    expect(Object.values(JOG_STEP_KEYS)).toEqual([0.01, 0.1, 1, 10, 'continuous']);
    expect(JOG_KEYS.ArrowRight).toEqual(['X', 1]);
    expect(JOG_KEYS.ArrowDown).toEqual(['Y', -1]);
    expect(JOG_KEYS.PageUp).toEqual(['Z', 1]);
  });

  it('lets a global key only open the search or run one of its commands', () => {
    for (const s of scope('global')) {
      expect(s.runs, s.id).toBeDefined();
      expect(s.acts, s.id).toBeUndefined();
      if (s.runs !== PALETTE) expect(commandById(s.runs!), s.id).toBeDefined();
    }
    // No global key reaches the machine: none for NOT-HALT, start, pause or a move.
    const runs = scope('global').map((s) => s.runs);
    for (const id of ['estop', 'run', 'feedHold', 'pause', 'homing', 'jog', 'unlock', 'stream']) {
      expect(runs).not.toContain(id);
    }
    expect(scope('drawing').every((s) => s.runs === undefined)).toBe(true);
    expect(scope('drive').every((s) => s.runs === undefined)).toBe(true);
  });

  it('has exactly two keys that reach the machine: pause and the question to abort', () => {
    expect(scope('machine').map((s) => [s.id, s.acts])).toEqual([
      ['pause', 'pause'],
      ['abort', 'abort'],
    ]);
    expect(scope('machine').every((s) => s.runs === undefined)).toBe(true);
    expect(machineKey(key(' '))).toBe('pause');
    expect(machineKey(key(' ', { shiftKey: true }))).toBe('pause');
    expect(machineKey(key('Escape'))).toBe('abort');
    expect(machineKey(key('Enter'))).toBeNull();
    expect(machineKey(key(' ', { ctrlKey: true }))).toBeNull();
    // No key for NOT-HALT, a start or homing – anywhere in the table.
    for (const s of SHORTCUTS) {
      expect(['estop', 'run', 'start', 'home', 'homing', 'unlock'], s.id).not.toContain(s.id);
    }
  });
});

describe('reading a key', () => {
  it('opens the search with Ctrl+K, Cmd+K and /', () => {
    expect(globalShortcut(key('k', { ctrlKey: true }))?.id).toBe('palette');
    expect(globalShortcut(key('K', { metaKey: true }))?.id).toBe('palette');
    expect(globalShortcut(key('/'))?.id).toBe('palette');
    // On a German keyboard "/" is Shift+7, "?" is Shift+ß.
    expect(globalShortcut(key('/', { shiftKey: true }))?.id).toBe('palette');
    expect(globalShortcut(key('?', { shiftKey: true }))?.id).toBe('shortcuts');
    expect(globalShortcut(key('?'))?.id).toBe('shortcuts');
  });

  it('reads the views from bare keys, in either case, and the next step from Ctrl+→', () => {
    expect(globalShortcut(key('ArrowRight', { ctrlKey: true }))?.runs).toBe('nextStep');
    expect(globalShortcut(key('ArrowRight', { metaKey: true }))?.runs).toBe('nextStep');
    expect(globalShortcut(key('ArrowRight'))).toBeNull();
    // The digits belong to the jog panel's step width, not to the places.
    expect(globalShortcut(key('1'))).toBeNull();
    expect(globalShortcut(key('t'))?.runs).toBe('stageTable');
    expect(globalShortcut(key('K'))?.runs).toBe('stageCamera');
    expect(globalShortcut(key('d'))?.runs).toBe('stage3d');
    expect(globalShortcut(key('e'))?.runs).toBe('fit');
  });

  it('leaves keys with other modifiers and other keys alone', () => {
    expect(globalShortcut(key('t', { ctrlKey: true }))).toBeNull();
    expect(globalShortcut(key('d', { ctrlKey: true }))).toBeNull();
    expect(globalShortcut(key('t', { altKey: true }))).toBeNull();
    expect(globalShortcut(key('T', { shiftKey: true }))).toBeNull();
    expect(globalShortcut(key('k', { ctrlKey: true, altKey: true }))).toBeNull();
    expect(globalShortcut(key('x'))).toBeNull();
    expect(globalShortcut(key('Enter'))).toBeNull();
    expect(globalShortcut(key(' '))).toBeNull();
  });

  it('knows the key of a command', () => {
    expect(shortcutFor('fit')?.caps).toEqual([['E']]);
    expect(shortcutFor('nextStep')?.caps).toEqual([['mod', 'right']]);
    expect(shortcutFor('pause')).toBeNull();
    expect(shortcutFor('homing')).toBeNull();
    expect(shortcutFor('camUndo')).toBeNull();
  });

  it('stays out of fields and of dialogs', () => {
    const page = (dialog: boolean) => ({ querySelector: () => (dialog ? {} : null) });
    expect(typingInto({ tagName: 'INPUT' })).toBe(true);
    expect(typingInto({ tagName: 'textarea' })).toBe(true);
    expect(typingInto({ tagName: 'SELECT' })).toBe(true);
    expect(typingInto({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(typingInto({ tagName: 'BUTTON' })).toBe(false);
    expect(typingInto(null)).toBe(false);
    expect(keysFree({ tagName: 'BODY' }, page(false))).toBe(true);
    expect(keysFree({ tagName: 'INPUT' }, page(false))).toBe(false);
    expect(keysFree({ tagName: 'BODY' }, page(true))).toBe(false);
    expect(keysFree({ tagName: 'BODY' }, undefined)).toBe(true);
  });
});
