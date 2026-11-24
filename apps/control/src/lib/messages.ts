/**
 * The messages of the app (DESIGN.md §6.3): five levels, each with its look
 * and its behaviour, and every message with a name, a cause, an effect and
 * the next thing to do. Pure: what a log entry becomes, what still asks for
 * the operator, how the list is filtered. The store that listens to the
 * machine is `store/messages.ts`.
 */

/** The levels, most urgent first */
export const LEVELS = ['critical', 'fault', 'warning', 'hint', 'info'] as const;
export type Level = (typeof LEVELS)[number];

export interface Message {
  id: number;
  /** When it came, ms since the epoch */
  at: number;
  level: Level;
  /** Bezeichnung */
  title: string;
  /** Ursache */
  cause: string;
  /** Auswirkung */
  effect: string;
  /** Nächste Maßnahme */
  action: string;
  /** The controller's own code, shown small behind the text (`ALARM:2`, `error:20`) */
  code?: string;
  /** Warnings and critical messages: the operator has acknowledged it */
  acknowledged: boolean;
  /** Faults: what caused it is gone (the alarm is cleared) */
  resolved: boolean;
}

/**
 * What kind of thing a message of the app is about. Each group has its
 * cause, effect and next step in the dictionary (`messages.groups.<group>`).
 */
export type MessageGroup =
  | 'connection'
  | 'linkPi'
  | 'linkRelay'
  | 'linkDirect'
  | 'companion'
  | 'sd'
  | 'stream'
  | 'motion'
  | 'probe'
  | 'camera'
  | 'config'
  | 'file'
  | 'flow'
  | 'limit'
  | 'jobLocked'
  | 'done'
  | 'general';

/** The first part of a message key says the group. */
const GROUPS: Record<string, MessageGroup> = {
  machine: 'connection',
  estop: 'connection',
  companion: 'companion',
  recording: 'companion',
  files: 'sd',
  stream: 'stream',
  frame: 'motion',
  macros: 'motion',
  calibration: 'camera',
  accuracy: 'camera',
  camera: 'camera',
  photomap: 'camera',
  probe: 'probe',
  probeWizard: 'probe',
  config: 'config',
  limits: 'config',
  firmware: 'config',
  job: 'file',
  cam: 'file',
  share: 'file',
  jigs: 'flow',
  sections: 'flow',
  series: 'flow',
  zeros: 'flow',
};

/** Keys that say otherwise than their first part. */
const GROUP_OF_KEY: Record<string, MessageGroup> = {
  // Which device was missing on the way to the machine (lib/link.ts)
  'link.pi': 'linkPi',
  'link.relay': 'linkRelay',
  'link.direct': 'linkDirect',
  'machine.configInvalid': 'config',
  'photomap.notConnected': 'connection',
  'drive.atLimit': 'limit',
  'drive.limited': 'limit',
  'goto.limited': 'limit',
  // The program stays while a job is under way: nothing went wrong, nothing was changed
  'job.locked': 'jobLocked',
};

export function groupOf(key: string | undefined): MessageGroup {
  if (!key) return 'general';
  if (INFO_KEYS.has(key)) return 'done';
  return GROUP_OF_KEY[key] ?? GROUPS[key.split('.')[0]!] ?? 'general';
}

/** The key of the log line an alarm writes */
export const ALARM_LOG_KEY = 'alarm.title';
/** The key of the log line a rejected command writes (`error:n`) */
export const ERROR_LOG_KEY = 'error.title';

/** Log lines of kind `info` that are worth a toast: something the operator waited for is done. */
const INFO_KEYS = new Set([
  'machine.connected',
  'limits.written',
  'drive.homed',
  'drive.zeroSet',
  'files.finished',
  'stream.done',
  'probe.done',
  'probeWizard.done',
]);

/** Log lines of kind `info` that are advice: they stay in the centre, without a toast. */
const HINT_KEYS = new Set(['drive.atLimit', 'drive.limited', 'goto.limited', 'drive.notAtRest']);

/**
 * The level of a line of the app's log – or null when it is a line for the
 * log only. Every `error` line asks for the operator: a warning (it is
 * acknowledged, it blocks nothing). Alarms and a lost connection are not log
 * lines; the store makes them faults and critical messages from the
 * machine's state.
 */
export function levelOfLog(kind: string, key: string | undefined): Level | null {
  // The line an alarm writes into the log: the alarm itself is the fault.
  if (key === ALARM_LOG_KEY) return null;
  if (kind === 'error') return 'warning';
  if (kind !== 'info' || !key) return null;
  if (INFO_KEYS.has(key)) return 'info';
  return HINT_KEYS.has(key) ? 'hint' : null;
}

/** Whether a message still asks for the operator (it counts in the status bar's flag). */
export function needsAttention(m: Message): boolean {
  if (m.level === 'fault') return !m.resolved;
  if (m.level === 'warning' || m.level === 'critical') return !m.acknowledged;
  return false;
}

/** The most urgent level that still asks for the operator, if any. */
export function openLevel(list: readonly Message[]): Level | null {
  return LEVELS.find((level) => list.some((m) => m.level === level && needsAttention(m))) ?? null;
}

export type LevelFilter = Level | 'all';

/**
 * The messages of a level: what still asks for the operator first – the most
 * urgent level on top –, then the rest, newest first.
 */
export function filterMessages(list: readonly Message[], filter: LevelFilter): Message[] {
  const rank = (m: Message) => (needsAttention(m) ? LEVELS.indexOf(m.level) : LEVELS.length);
  return list
    .filter((m) => filter === 'all' || m.level === filter)
    .sort((a, b) => rank(a) - rank(b) || b.id - a.id);
}

export function countByLevel(list: readonly Message[]): Record<LevelFilter, number> {
  const counts: Record<LevelFilter, number> = {
    all: list.length,
    critical: 0,
    fault: 0,
    warning: 0,
    hint: 0,
    info: 0,
  };
  for (const m of list) counts[m.level] += 1;
  return counts;
}

/** How many messages are kept */
export const MESSAGE_LIMIT = 200;

/** Adds a message; the oldest that ask for nothing any more go first when the list is full. */
export function withMessage(
  list: readonly Message[],
  message: Message,
  limit = MESSAGE_LIMIT,
): Message[] {
  const next = [...list, message];
  while (next.length > limit) {
    const settledAt = next.findIndex((m) => !needsAttention(m));
    next.splice(settledAt < 0 ? 0 : settledAt, 1);
  }
  return next;
}

/** Acknowledges one message (a fault is not acknowledged away: it goes with its cause). */
export function acknowledge(list: readonly Message[], id: number): Message[] {
  return list.map((m) => (m.id === id && m.level !== 'fault' ? { ...m, acknowledged: true } : m));
}

/** Acknowledges every warning. Critical messages are acknowledged one by one, where they show. */
export function acknowledgeWarnings(list: readonly Message[]): Message[] {
  return list.map((m) => (m.level === 'warning' ? { ...m, acknowledged: true } : m));
}

/** The cause of the faults is gone: they stay in the history, resolved. */
export function resolveFaults(list: readonly Message[]): Message[] {
  return list.map((m) => (m.level === 'fault' && !m.resolved ? { ...m, resolved: true } : m));
}

/** How long a toast of a level lies over the page, ms; 0: no toast */
export const TOAST_MS: Record<Level, number> = {
  info: 4000,
  hint: 0,
  warning: 6000,
  fault: 6000,
  critical: 0,
};

/** What comes back from storage: a list of messages, or nothing usable. */
export function validMessages(value: unknown): Message[] | null {
  if (!Array.isArray(value)) return null;
  const text = (v: unknown): v is string => typeof v === 'string';
  return value
    .filter(
      (m): m is Message =>
        typeof m === 'object' &&
        m !== null &&
        typeof m.id === 'number' &&
        typeof m.at === 'number' &&
        (LEVELS as readonly string[]).includes(m.level) &&
        text(m.title) &&
        text(m.cause) &&
        text(m.effect) &&
        text(m.action),
    )
    .map((m) => ({
      ...m,
      acknowledged: m.acknowledged === true,
      // A fault of an earlier session is history: whether the machine still is in alarm shows anew.
      resolved: true,
    }))
    .slice(-MESSAGE_LIMIT);
}
