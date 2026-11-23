import { alarmName, errorName } from '@lowrider/fluidnc-client';
import { create } from 'zustand';
import { t, tDynamic, type MessageKey } from '../i18n';
import {
  acknowledge,
  acknowledgeWarnings,
  ERROR_LOG_KEY,
  groupOf,
  levelOfLog,
  needsAttention,
  resolveFaults,
  TOAST_MS,
  validMessages,
  withMessage,
  type Level,
  type Message,
} from '../lib/messages';
import { DIALOGS } from '../lib/shortcuts';
import { browserStorage, loadJson, saveJson } from '../lib/persist';
import { useMachine, type LogEntry } from './machine';

/**
 * The message centre (DESIGN.md §6.3). Messages come from three places:
 *
 * - the app's log: every `error` line is a **warning** (acknowledged, blocks
 *   nothing), a few `info` lines are an **information** (a toast that goes by
 *   itself) or a **hint** (stays in the centre, no toast);
 * - the machine's alarm state: a **fault**. It blocks what FluidNC blocks –
 *   moving and starting – for as long as the alarm stands, and it cannot be
 *   acknowledged away: it goes when its cause is gone (unlock, home);
 * - a connection lost during a job: the one **critical** message. It covers
 *   the work area (`CriticalLayer`) until the operator acknowledges it.
 *
 * Every message has a name, a cause, an effect and the next thing to do; the
 * controller's code stands small behind it. The list is kept (the history of
 * Service & Diagnose) and survives a reload.
 */
interface MessagesStore {
  messages: Message[];
  /** What lies over the page right now */
  toasts: Message[];
  /** The centre is open (a dialog below the status bar) */
  centre: boolean;
  /** Opens the centre – unless another dialog already asks the operator something */
  openCentre(): void;
  closeCentre(): void;
  acknowledge(id: number): void;
  acknowledgeAll(): void;
  dismiss(id: number): void;
  clearHistory(): void;
}

const KEY = 'lowrider-control.messages';
const stored = loadJson(browserStorage, KEY, validMessages, []);
let nextId = stored.reduce((max, m) => Math.max(max, m.id), 0) + 1;

const keep = (messages: Message[]) => {
  saveJson(browserStorage, KEY, messages);
  return { messages };
};

export const useMessages = create<MessagesStore>((set) => ({
  messages: stored,
  toasts: [],
  centre: false,
  openCentre() {
    // At most one dialog at a time (§3.4): a question that is open is answered first.
    if (typeof document !== 'undefined' && document.querySelector(DIALOGS)) return;
    set({ centre: true });
  },
  closeCentre: () => set({ centre: false }),
  acknowledge: (id) => set((s) => keep(acknowledge(s.messages, id))),
  acknowledgeAll: () => set((s) => keep(acknowledgeWarnings(s.messages))),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((m) => m.id !== id) })),
  // What still asks for the operator stays.
  clearHistory: () => set((s) => keep(s.messages.filter(needsAttention))),
}));

type Parts = Pick<Message, 'title' | 'cause' | 'effect' | 'action'> & { code?: string };

/** Adds a message, shows its toast (where its level has one) and returns its id. */
export function addMessage(level: Level, parts: Parts): number {
  const message: Message = {
    id: nextId++,
    at: Date.now(),
    level,
    acknowledged: false,
    resolved: false,
    ...parts,
  };
  const toast = TOAST_MS[level];
  useMessages.setState((s) => ({
    ...keep(withMessage(s.messages, message)),
    toasts: toast > 0 ? [...s.toasts, message].slice(-3) : s.toasts,
  }));
  if (toast > 0) setTimeout(() => useMessages.getState().dismiss(message.id), toast);
  return message.id;
}

const group = (key: string | undefined, part: 'cause' | 'effect' | 'action') =>
  t(`messages.groups.${groupOf(key)}.${part}` as MessageKey);

/** What a line of the log says as a message. */
function fromLog(entry: LogEntry): Parts {
  if (entry.key === ERROR_LOG_KEY && entry.code) {
    const code = Number(entry.code.split(':')[1]);
    return {
      title: t('messages.rejected.title'),
      cause: tDynamic(`error.${errorName(code)}`, 'error.Unknown'),
      effect: t('messages.rejected.effect'),
      action: t('messages.rejected.action'),
      code: entry.code,
    };
  }
  return {
    title: entry.text,
    cause: group(entry.key, 'cause'),
    effect: group(entry.key, 'effect'),
    action: group(entry.key, 'action'),
  };
}

/** The fault an alarm is. Without a code the controller only said that it is in alarm. */
function fromAlarm(code: number | null): Parts {
  const name = code === null ? 'Unknown' : alarmName(code);
  return {
    title:
      code === null ? t('messages.alarm.locked') : tDynamic(`alarm.${name}.short`, 'state.Alarm'),
    cause:
      code === null
        ? t('messages.alarm.lockedCause')
        : tDynamic(`alarm.${name}.text`, 'alarm.Unknown.text'),
    effect: t('messages.alarm.effect'),
    action:
      code === null
        ? t('messages.alarm.lockedAction')
        : tDynamic(`alarm.${name}.action`, 'alarm.Unknown.action'),
    ...(code === null ? {} : { code: `ALARM:${code}` }),
  };
}

/** Watches the machine for what becomes a message. Returns the function that stops it. */
export function startMessages(): () => void {
  let known = useMachine.getState().log.at(-1)?.id ?? -1;
  let alarmId: number | null = null;
  let alarmCode: number | null = null;
  let lostId: number | null = null;
  return useMachine.subscribe((state) => {
    // The log.
    const fresh = state.log.filter((entry) => entry.id > known);
    known = state.log.at(-1)?.id ?? known;
    for (const entry of fresh) {
      const level = levelOfLog(entry.kind, entry.key);
      if (level) addMessage(level, fromLog(entry));
    }
    // The alarm: one fault while it stands; a code that comes later names it.
    const inAlarm = state.alarm !== null || state.status?.state === 'Alarm';
    if (inAlarm && alarmId === null) {
      alarmCode = state.alarm;
      alarmId = addMessage('fault', fromAlarm(alarmCode));
    } else if (inAlarm && state.alarm !== null && state.alarm !== alarmCode) {
      alarmCode = state.alarm;
      const parts = fromAlarm(alarmCode);
      useMessages.setState((s) =>
        keep(s.messages.map((m) => (m.id === alarmId ? { ...m, ...parts } : m))),
      );
    } else if (!inAlarm && alarmId !== null) {
      alarmId = null;
      alarmCode = null;
      useMessages.setState((s) => keep(resolveFaults(s.messages)));
    }
    // The connection lost during a job: critical until acknowledged where it shows.
    if (state.lostInJob && lostId === null) {
      // The critical message has the work area to itself.
      useMessages.getState().closeCentre();
      lostId = addMessage('critical', {
        title: t('critical.lost.title'),
        cause: t('critical.lost.cause'),
        effect: t(state.lostInJob.sd ? 'critical.lost.effectSd' : 'critical.lost.effectStream'),
        action: t('critical.lost.action'),
      });
    } else if (!state.lostInJob && lostId !== null) {
      useMessages.getState().acknowledge(lostId);
      lostId = null;
    }
  });
}
