import {
  alarmName,
  clampJogTarget,
  CommandError,
  errorName,
  FluidNCConnection,
  jogRelative,
  jogToMachine,
  Realtime,
  type JogAxis,
  type ConnectionState,
  type ControllerFile,
  type MachineStatus,
  FluidNCHttp,
  httpBaseFromWebSocket,
  overrideBytes,
  parseFileList,
  rapidOverrideByte,
  settingCommand,
  isToolChange,
  parseParserState,
  type CharacterCountingStreamer,
  type ParserState,
  type StreamProgress,
  parseSettingsList,
  sameConfigText,
  type SettingEntry,
} from '@lowrider/fluidnc-client';
import type { Bounds } from '@lowrider/gcode-core';
import {
  parseOffsets,
  parseProbeReport,
  restoreCommand,
  type Axis as ProbeAxis,
  type OffsetTable,
  type ProbeRoutine,
  type Results,
  type SavedZero,
} from '@lowrider/workshop';
import { create } from 'zustand';
import { t, tDynamic } from '../i18n';
import { toWebSocketUrl } from '../lib/address';
import {
  classifyFailure,
  hostOf,
  isRelayUrl,
  mayRetry,
  relayTarget,
  retryDelay,
  type FailedAttempt,
  type LinkFailure,
} from '../lib/link';
import { macroLines, type Macro } from '../lib/macros';
import { browserStorage } from '../lib/persist';
import {
  continuousJogTarget,
  UNHOMED_JOG_MM,
  frameLines,
  moveToCommands,
  safeLift,
  spindleRestore,
  stickStep,
  toolAtLine,
} from '../lib/motion';
import { probeZCommands, zeroCommand } from '../lib/probe';
import { isSimulatorAddress, simulator, SimulatorSocket } from '../sim';
import { useJob } from './job';
import { companion, safeMachineZ, useWorkshop } from './workshop';

export type LogKind = 'in' | 'out' | 'info' | 'error';

export interface LogEntry {
  id: number;
  time: number;
  kind: LogKind;
  text: string;
  /** The message key the text came from: the message centre reads its group from it */
  key?: string;
  /** The controller's own code behind the text, e.g. `error:20` */
  code?: string;
}

const LOG_LIMIT = 500;
const URL_KEY = 'lowrider-control.url';
const RETRY_KEY = 'lowrider-control.autoRetry';

function storedAutoRetry(): boolean {
  try {
    return browserStorage?.getItem(RETRY_KEY) !== 'off';
  } catch {
    return true;
  }
}

/**
 * Where the way to the machine stands (DESIGN.md §6.2): trying, waiting for
 * the next try, or given up – and which device was missing.
 */
export interface LinkState {
  phase: 'idle' | 'connecting' | 'waiting' | 'failed';
  failure: LinkFailure | null;
  /** FluidNC's address as the operator knows it, e.g. `192.168.0.200:81` */
  target: string | null;
  /** The companion's address when the way goes through its relay */
  via: string | null;
  /** Failed tries in a row */
  attempt: number;
  /** When the next try starts (ms since the epoch), while waiting */
  retryAt: number | null;
  /**
   * The connection was lost during a job: nothing reconnects by itself until
   * the operator has connected again by hand.
   */
  lostDuringJob: boolean;
}

const IDLE_LINK: LinkState = {
  phase: 'idle',
  failure: null,
  target: null,
  via: null,
  attempt: 0,
  retryAt: null,
  lostDuringJob: false,
};

function storedAddress(): string {
  try {
    return browserStorage?.getItem(URL_KEY) ?? '';
  } catch {
    // storage may be unavailable (file://, private mode)
    return '';
  }
}

const JOG_INDEX: Record<JogAxis, number> = { X: 0, Y: 1, Z: 2 };

interface MachineStore {
  /** What the operator typed: IP, host or ws:// URL */
  url: string;
  connection: ConnectionState;
  status: MachineStatus | null;
  /** Code of the last alarm; cleared when the machine leaves the Alarm state */
  alarm: number | null;
  /** A probing routine runs (the status bar says "Antasten") */
  probing: boolean;
  firmware: string | null;
  /**
   * Homing finished in this session, so MPos is trustworthy and the software
   * end stops apply. Cleared on alarm, reset and disconnect.
   */
  homed: boolean;
  /** Axes homed since the last reset, e.g. "XZ"; `homed` needs all of X, Y and Z */
  homedAxes: string;
  log: LogEntry[];
  setUrl(url: string): void;
  /**
   * Connects to the address. `auto`: a try of its own (after a failure), which
   * keeps the series; without it the operator starts a new one.
   */
  connect(options?: { auto?: boolean }): Promise<void>;
  disconnect(): void;
  link: LinkState;
  /** Try again by itself after a failure, while no job runs (remembered) */
  autoRetry: boolean;
  setAutoRetry(on: boolean): void;
  /** The next try now instead of waiting */
  retryNow(): void;
  /** No more tries by themselves ("Aufhören"); remembered until switched on again */
  stopRetry(): void;
  emergencyStop(): void;
  feedHold(): void;
  cycleStart(): void;
  /** Resolves true on `ok`, false on error or without connection */
  command(line: string): Promise<boolean>;
  /** The last command sent with `command()` and what the controller said to it (DESIGN.md §6.2) */
  lastCommand: SentCommand | null;
  /** Resolves true when FluidNC acknowledged the homing cycle */
  home(): Promise<boolean>;
  /** Config dump ($CD) of the running controller as YAML text */
  readConfig(): Promise<string | null>;
  /** Jog one axis by `distance` mm, stopping at the travel limits once homed */
  jog(axis: JogAxis, distance: number): void;
  /** Turns the rotary axis A by `degrees` (relative; A has no travel limits here) */
  jogRotary(degrees: number): void;
  jogCancel(): void;
  /** Homing of one axis ($HX, $HY, $HZ) */
  homeAxis(axis: JogAxis): Promise<boolean>;
  /** Current position becomes zero of the active work system for these axes, e.g. "XY" */
  zero(axes: string): Promise<void>;
  /** Z touch-off with the plate; resolves true on success */
  probeZ(): Promise<boolean>;
  setFeedOverride(percent: number): void;
  setSpindleOverride(percent: number): void;
  /**
   * The connection was lost while a job ran (DESIGN.md §6.4): a critical
   * message stands until it is acknowledged. `sd`: the job runs from the
   * machine's own card and goes on without the app.
   */
  lostInJob: { name: string; sd: boolean; at: number } | null;
  /** Another device controls the machine through the Pi: this one only watches and may stop */
  viewer: boolean;
  acknowledgeLost(): void;
  setRapidOverride(percent: 25 | 50 | 100): void;
  /** File job started with runSdFile, until FluidNC acknowledges its end */
  fileJob: { name: string; startedAt: number } | null;
  /** How the last SD job ended */
  lastFileResult: 'done' | 'aborted' | null;
  sdFiles: ControllerFile[] | null;
  refreshSdFiles(): Promise<void>;
  /** Uploads to the SD card root and checks the result via $SD/List */
  uploadToSd(name: string, text: string): Promise<boolean>;
  runSdFile(name: string): Promise<void>;
  /** Feed hold, wait until stopped, then soft reset: ends the job without losing position */
  stopJob(): Promise<void>;
  /** Resolves false when a line was refused */
  runMacro(macro: Macro): Promise<boolean>;
  /** The config file as stored on the controller, with comments */
  readConfigFile(): Promise<{ name: string; text: string } | null>;
  /**
   * Changes config items at runtime, keeps a backup of the running config on
   * the controller and writes the result to the config file.
   */
  applyConfigChanges(changes: { path: string; value: string }[]): Promise<boolean>;
  addLog(kind: LogKind, text: string, key?: string, code?: string): void;
  /** Modal state from `$G`, refreshed after commands that change it */
  parserState: ParserState | null;
  /** Work offsets from `$#` */
  offsets: OffsetTable | null;
  refreshState(): Promise<void>;
  /** Selects G54 … G59 */
  setWcs(code: string): Promise<void>;
  /** Jogs until `jogCancel()` (hold-to-jog, keyboard, gamepad) */
  jogStart(axis: JogAxis, direction: 1 | -1, feedFactor?: number): void;
  /**
   * Runs a probe routine step by step; resolves with the contact positions
   * (machine coordinates) or null if a probe missed or a command failed.
   */
  runProbeRoutine(routine: ProbeRoutine): Promise<Results | null>;
  /** Sets the work zero of the active system to machine positions, compensating a tool length offset. */
  setZeroAt(zero: Partial<Record<ProbeAxis, number>>): Promise<boolean>;
  restoreZero(zero: SavedZero): Promise<boolean>;
  /** Streams a program from the browser, holding at every M6 for the tool-change dialog */
  stream: StreamJob | null;
  streamJob(name: string, text: string): boolean;
  /** Lift, spindle back on as before, then continue after a tool change */
  continueAfterToolChange(): Promise<void>;
  /** Traces the job outline at a safe height */
  frame(bounds: Bounds): Promise<boolean>;
  /** Lifts to a safe height (G53 once homed) */
  lift(): Promise<boolean>;
  /**
   * "Drive here": spindle to a machine XY point, lifted to the safe height
   * first if asked (only once homed), clamped to the travel.
   */
  moveTo(target: { x: number; y: number }, lift: boolean): Promise<boolean>;
  /** Moves Z to a work height (camera height), clamped to the travel once homed */
  moveZ(workZ: number): Promise<boolean>;
  /**
   * Measuring move to machine coordinates (G53 G1) that resolves once the
   * machine stands still (G4 P0). Refused outside the travel once homed.
   */
  moveMachine(target: { x?: number; y?: number; z?: number }, feed: number): Promise<boolean>;
  /** Joystick deflection −1…1 (Y up); 0, 0 or `stickStop()` ends the motion */
  stick(vx: number, vy: number): void;
  stickStop(): void;
  /** Single block: the stream waits before every line until `stepNext()` */
  singleStep: boolean;
  setSingleStep(on: boolean): void;
  stepNext(): void;
  /** Non-config settings ($S): network, reports, … */
  readSettings(): Promise<SettingEntry[] | null>;
  /**
   * Writes a whole config file over HTTP to the controller's flash: first a
   * backup of the current file, then the new text, each checked by reading it back.
   */
  uploadConfigFile(
    name: string,
    text: string,
    backup: string,
    backupName?: string,
  ): Promise<string | null>;
  /**
   * A file of the controller's flash byte for byte – through the companion
   * (FluidNC serves files without CORS) or the simulator; null where that is
   * not possible (straight to FluidNC without a companion).
   */
  readFlashFile(name: string): Promise<string | null>;
  /** Sends a command and gives the lines of its answer; null on error or without connection */
  query(line: string): Promise<string[] | null>;
}

export interface SentCommand {
  id: number;
  line: string;
  /** `sent`: waiting for the answer; `ok`/`error`: FluidNC answered; a lost answer counts as error */
  state: 'sent' | 'ok' | 'error';
  at: number;
  /** FluidNC's `error:n`, when it said one */
  code: number | null;
}

export interface StreamJob {
  name: string;
  lines: string[];
  startedAt: number;
  progress: StreamProgress;
  /** Set while held at a tool change */
  toolChange: { line: number; tool: number | null; spindleBefore: ParserState | null } | null;
  /** Set while single-stepping: the job waits before this source line */
  stepAt: number | null;
  /** How the stream ended */
  result: 'running' | 'done' | 'failed' | 'aborted';
}

let connection: FluidNCConnection | null = null;

/** A device that only watches writes nothing – no command, no upload, no job: said, not done. */
function watching(): boolean {
  const { viewer, addLog } = useMachine.getState();
  if (viewer) addLog('error', t('machine.viewerRefused'), 'machine.viewerRefused');
  return viewer;
}

/** A stop byte must never throw into a button or a release loop (a closing socket refuses it): said, not thrown. */
function sendStop(byte: number): void {
  try {
    connection?.realtime(byte);
  } catch {
    useMachine.getState().addLog('error', t('estop.holdNotSent'), 'estop.holdNotSent');
  }
}
let commandId = 0;
/** An attempt the operator cancelled while it was connecting */
let cancelled: FluidNCConnection | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * FluidNC's own HTTP address (uploads to the SD card and the flash). Through
 * the companion's relay the WebSocket ends at the Pi, so the address is the
 * one the Pi relays to: FluidNC serves HTTP on port 80 of that host.
 */
function fluidncHttpBase(wsUrl: string): string {
  const advertised = useWorkshop.getState().companionHealth?.fluidnc?.url;
  return httpBaseFromWebSocket(isRelayUrl(wsUrl) && advertised ? advertised : wsUrl);
}

function clearRetry() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}
let nextLogId = 1;
/** Targets of jogs still in motion, so quick repeated taps add up correctly. */
let jogTargets: Partial<Record<JogAxis, number>> = {};
let streamer: CharacterCountingStreamer | null = null;
/** Joystick: current deflection, planned position and the 10 Hz timer. */
const STICK_TICK = 0.1;
let stickVector = { x: 0, y: 0 };
let stickBase: { x: number; y: number } | null = null;
let stickTimer: ReturnType<typeof setInterval> | null = null;
let stickBusy = false;
/** Read by the streamer for every line, so switching takes effect at once. */
let singleStepOn = false;

/** The simulator cuts as wide as the job's cutter is, so its camera sees real holes and grooves. */
function simulatedCutter(url: string) {
  if (isSimulatorAddress(url)) simulator().toolRadius = useJob.getState().toolDiameter / 2;
}

export const useMachine = create<MachineStore>((set, get) => ({
  url: storedAddress(),
  connection: 'disconnected',
  status: null,
  alarm: null,
  probing: false,
  firmware: null,
  homed: false,
  homedAxes: '',
  fileJob: null,
  lastFileResult: null,
  sdFiles: null,
  log: [],
  lostInJob: null,
  viewer: false,
  link: IDLE_LINK,
  lastCommand: null,
  autoRetry: storedAutoRetry(),
  parserState: null,
  offsets: null,
  stream: null,
  singleStep: false,

  setUrl(url) {
    set({ url });
    try {
      browserStorage?.setItem(URL_KEY, url);
    } catch {
      // ignore
    }
  },

  async connect(options = {}) {
    if (connection) return;
    clearRetry();
    const { addLog } = get();
    // "simulator": a LowRider simulated in the page instead of a Jackpot.
    const sim = isSimulatorAddress(get().url);
    const url = sim ? 'sim://lowrider' : toWebSocketUrl(get().url);
    if (!url) {
      addLog('error', t('machine.addressMissing'), 'machine.addressMissing');
      return;
    }
    const relay = isRelayUrl(url);
    const advertised = useWorkshop.getState().companionHealth?.fluidnc?.url;
    const target = relay ? (advertised ? hostOf(advertised) : null) : hostOf(url);
    // A try by hand starts a new series; one of its own keeps counting.
    const before = options.auto
      ? get().link
      : { ...IDLE_LINK, lostDuringJob: get().link.lostDuringJob };
    set({
      link: {
        ...before,
        phase: 'connecting',
        retryAt: null,
        via: relay ? hostOf(url) : null,
        target: before.target ?? target,
      },
    });

    /** Says once per series which device was missing, then waits for the next try – or not. */
    const failed = (attempt: FailedAttempt) => {
      const failure = classifyFailure(attempt, relay);
      const { link } = get();
      const next: LinkState = {
        ...link,
        failure,
        target: relayTarget(attempt.reason) ?? link.target ?? target,
        attempt: link.attempt + 1,
        retryAt: null,
        phase: 'failed',
      };
      if (link.failure !== failure) {
        const key = `link.${failure}` as const;
        addLog('error', t(key, { target: next.target ?? '?', via: next.via ?? '' }), key);
      }
      const { fileJob, stream, autoRetry } = get();
      const retry = mayRetry({
        autoRetry,
        jobRunning: fileJob !== null || stream?.result === 'running',
        lostDuringJob: link.lostDuringJob,
        simulator: sim,
      });
      if (retry) {
        const wait = retryDelay(link.attempt);
        next.phase = 'waiting';
        next.retryAt = Date.now() + wait;
        retryTimer = setTimeout(() => {
          retryTimer = null;
          if (!connection && get().link.phase === 'waiting') void get().connect({ auto: true });
        }, wait);
      }
      set({ link: next });
    };

    const c = new FluidNCConnection(
      sim ? { url, createSocket: () => new SimulatorSocket() } : { url },
    );
    connection = c;
    c.on('closed', (info) => {
      // Failures before FluidNC answered are the attempt's own (below).
      if (connection !== c || !info.answered) return;
      const { fileJob, stream } = get();
      if (fileJob !== null || stream?.result === 'running') {
        clearRetry();
        set((s) => ({ link: { ...s.link, phase: 'idle', lostDuringJob: true } }));
        return;
      }
      failed({ kind: 'closed', code: info.code, reason: info.reason });
    });
    c.on('role', (role) => {
      if (connection !== c || (role === 'viewer') === get().viewer) return;
      set({ viewer: role === 'viewer' });
      get().addLog('info', t(`machine.${role}`), `machine.${role}`);
    });
    c.on('state', (state) => {
      if (state === 'disconnected' && connection === c) {
        // Lost while a job runs: said as a critical message. Nothing is taken up again by
        // itself – the app never reconnects on its own, and a stream that broke stays broken.
        const { fileJob, stream } = get();
        const name = fileJob?.name ?? (stream?.result === 'running' ? stream.name : null);
        if (name !== null) set({ lostInJob: { name, sd: fileJob !== null, at: Date.now() } });
      }
      set({ connection: state });
      if (state === 'disconnected') {
        set({ status: null, homed: false, homedAxes: '', viewer: false });
        if (connection === c) connection = null;
      }
    });
    c.on('line', (line) => {
      if (!line.startsWith('<')) addLog('in', line);
    });
    c.on('sent', (line) => addLog('out', line));
    c.on('status', (status) => {
      // A jog target is done once the machine stands still on it.
      for (const axis of Object.keys(jogTargets) as JogAxis[]) {
        const pos = status.mpos[JOG_INDEX[axis]] ?? 0;
        if (status.state !== 'Jog' && Math.abs(pos - jogTargets[axis]!) < 0.005)
          delete jogTargets[axis];
      }
      set((s) => ({ status, alarm: status.state === 'Alarm' ? s.alarm : null }));
    });
    c.on('reset', () => {
      jogTargets = {};
      set({ homed: false, homedAxes: '' });
    });
    c.on('alarm', (code) => {
      jogTargets = {};
      set({ alarm: code, homed: false, homedAxes: '' });
      addLog(
        'error',
        `${t('alarm.title', { code })}: ${tDynamic(`alarm.${alarmName(code)}.text`, 'alarm.Unknown.text')}`,
        'alarm.title',
        `ALARM:${code}`,
      );
    });
    c.on('message', (m) => {
      if (m.type === 'welcome') set({ firmware: m.text });
      // Homing done, whoever started it (app, WebUI, macro).
      // Single axes ($HX) count only for themselves: soft limits need all three.
      if (m.type === 'homed') {
        const axes = [...new Set(get().homedAxes + m.axes.toUpperCase())]
          .filter((a) => 'XYZ'.includes(a))
          .sort()
          .join('');
        set({ homedAxes: axes, homed: axes === 'XYZ' });
        addLog(
          'info',
          axes === 'XYZ'
            ? t('drive.homed', { axes: m.axes })
            : t('drive.homedPartly', {
                axes,
                missing: [...'XYZ'].filter((a) => !axes.includes(a)).join(', '),
              }),
          axes === 'XYZ' ? 'drive.homed' : 'drive.homedPartly',
        );
      }
      if (m.type === 'error') {
        addLog(
          'error',
          `${t('error.title', { code: m.code })}: ${tDynamic(`error.${errorName(m.code)}`, 'error.Unknown')}`,
          'error.title',
          `error:${m.code}`,
        );
      }
    });
    try {
      await c.connect();
      // Answered and dropped at once: the drop has said so already.
      if (connection !== c) return;
      const { link } = get();
      set({ link: IDLE_LINK });
      addLog(
        'info',
        relay
          ? t('machine.connectedVia', { target: link.target ?? '?', via: link.via ?? '' })
          : t('machine.connected', { url: sim ? url : hostOf(url) }),
        'machine.connected',
      );
      // Ask for the banner/build info so the firmware line is filled in.
      c.command('$I')
        .then(() => get().refreshState())
        .catch(() => undefined);
    } catch (error) {
      // "Verbinden abbrechen": the operator ended the attempt – nothing to say, nothing to retry.
      if (cancelled === c) {
        cancelled = null;
        return;
      }
      if (connection === c) connection = null;
      set({ connection: 'disconnected' });
      const e = error as Partial<FailedAttempt>;
      failed({ kind: e.kind ?? 'unreachable', code: e.code, reason: e.reason });
    }
  },

  disconnect() {
    // Asked for by the operator: not a lost connection, and no try of its own follows.
    clearRetry();
    set((s) => ({ link: { ...IDLE_LINK, lostDuringJob: s.link.lostDuringJob } }));
    const c = connection;
    connection = null;
    if (c?.state === 'connecting') cancelled = c;
    c?.disconnect();
    set({ connection: 'disconnected', status: null, firmware: null, homed: false, homedAxes: '' });
    get().addLog('info', t('machine.disconnected'));
  },

  setAutoRetry(on) {
    try {
      browserStorage?.setItem(RETRY_KEY, on ? 'on' : 'off');
    } catch {
      // ignore
    }
    set({ autoRetry: on });
    if (!on) get().stopRetry();
  },

  retryNow() {
    if (connection) return;
    void get().connect({ auto: true });
  },

  stopRetry() {
    clearRetry();
    if (get().autoRetry) get().setAutoRetry(false);
    set((s) => ({
      link: {
        ...s.link,
        retryAt: null,
        phase: s.link.phase === 'waiting' ? 'failed' : s.link.phase,
      },
    }));
  },

  emergencyStop() {
    if (!connection || connection.state !== 'connected') {
      get().addLog('error', t('estop.notConnected'), 'estop.notConnected');
      return;
    }
    try {
      connection.emergencyStop();
    } catch {
      get().addLog('error', t('estop.notConnected'), 'estop.notConnected');
      return;
    }
    get().addLog('info', t('estop.sent'));
  },

  feedHold() {
    sendStop(Realtime.FeedHold);
  },

  cycleStart() {
    connection?.realtime(Realtime.CycleStart);
  },

  async command(line) {
    if (!connection || watching()) return false;
    const id = ++commandId;
    set({ lastCommand: { id, line, state: 'sent', at: Date.now(), code: null } });
    const settle = (patch: Partial<SentCommand>) =>
      set((s) => (s.lastCommand?.id === id ? { lastCommand: { ...s.lastCommand, ...patch } } : {}));
    try {
      await connection.command(line);
      settle({ state: 'ok' });
      return true;
    } catch (error) {
      // errors are logged from the message stream; here only what the controller answered
      const code = error instanceof CommandError && error.code >= 0 ? error.code : null;
      settle({ state: 'error', code });
      return false;
    }
  },

  async home() {
    // FluidNC reports success with [MSG:Homed:…], which sets `homed`.
    set({ homed: false, homedAxes: '' });
    return get().command('$H');
  },

  async readConfig() {
    if (!connection) return null;
    try {
      return (await connection.command('$CD')).join('\n');
    } catch {
      return null;
    }
  },

  jog(axis, distance) {
    const { status, homed, addLog, command } = get();
    if (!connection || !status) return;
    const { profile } = useJob.getState();
    const feed = axis === 'Z' ? profile.jogFeed.z : profile.jogFeed.xy;
    if (!homed || !profile.softLimits) {
      void command(jogRelative(axis, distance, feed));
      return;
    }
    const range = profile.travel[axis.toLowerCase() as 'x' | 'y' | 'z'];
    const base = jogTargets[axis] ?? status.mpos[JOG_INDEX[axis]] ?? 0;
    const jog = clampJogTarget(base, distance, range);
    if (!jog) {
      addLog('info', t('drive.atLimit', { axis }), 'drive.atLimit');
      return;
    }
    jogTargets[axis] = jog.target;
    if (jog.limited) addLog('info', t('drive.limited', { axis }), 'drive.limited');
    void command(jogToMachine(axis, jog.target, feed)).then((ok) => {
      if (!ok) delete jogTargets[axis];
    });
  },

  jogRotary(degrees) {
    const { status, command } = get();
    if (!connection || !status || !Number.isFinite(degrees) || degrees === 0) return;
    const { kinematics } = useJob.getState().profile;
    // A is in degrees: its own rate from the profile, never faster than a full turn in 6 s.
    const feed = Math.min(kinematics.axes.a?.maxRate ?? 3600, 3600);
    void command(`$J=G91 G21 A${degrees.toFixed(3)} F${Math.round(feed)}`);
  },

  jogCancel() {
    jogTargets = {};
    // A watching device never started a jog: nothing to cancel, and no false "stop not sent".
    if (get().viewer) return;
    sendStop(Realtime.JogCancel);
  },

  async homeAxis(axis) {
    return get().command(`$H${axis}`);
  },

  async zero(axes) {
    if (await get().command(zeroCommand(axes))) {
      get().addLog('info', t('drive.zeroSet', { axes }), 'drive.zeroSet');
      await get().refreshState();
    }
  },

  async probeZ() {
    const { status, addLog } = get();
    if (!connection || !status) return false;
    const { probe } = useJob.getState().profile;
    const cmd = probeZCommands(status.wpos[2] ?? 0, probe);
    set({ probing: true });
    try {
      // Probing takes as long as the search: no command timeout.
      const lines = await connection.command(cmd.probe, { timeoutMs: 0 });
      if (!lines.some((l) => /^\[PRB:.*:1\]$/.test(l))) throw new Error('no contact');
      await connection.command(cmd.setZero);
      await connection.command(cmd.retract, { timeoutMs: 0 });
      addLog('info', t('probe.done', { mm: probe.plateThickness }), 'probe.done');
      return true;
    } catch {
      addLog('error', t('probe.failed'), 'probe.failed');
      return false;
    } finally {
      set({ probing: false });
    }
  },

  setFeedOverride(percent) {
    const current = get().status?.overrides.feed ?? 100;
    for (const byte of overrideBytes('feed', current, percent)) connection?.realtime(byte);
  },

  setSpindleOverride(percent) {
    const current = get().status?.overrides.spindle ?? 100;
    for (const byte of overrideBytes('spindle', current, percent)) connection?.realtime(byte);
  },

  acknowledgeLost: () => set({ lostInJob: null }),

  setRapidOverride(percent) {
    connection?.realtime(rapidOverrideByte(percent));
  },

  async refreshSdFiles() {
    if (!connection) return;
    try {
      set({ sdFiles: parseFileList(await connection.command('$SD/List')) });
    } catch {
      get().addLog('error', t('files.listFailed'), 'files.listFailed');
    }
  },

  async uploadToSd(name, text) {
    const url = toWebSocketUrl(get().url);
    if (!connection || !url || watching()) return false;
    const { addLog } = get();
    try {
      // The simulator has its card in the page; a Jackpot takes the file over HTTP.
      if (isSimulatorAddress(get().url)) simulator().files.set(name, text);
      else {
        await new FluidNCHttp({ baseUrl: fluidncHttpBase(url) }).upload('sd', '/', name, text);
      }
    } catch {
      addLog('error', t('files.uploadFailed', { name }), 'files.uploadFailed');
      return false;
    }
    // The HTTP answer is not readable (no CORS), so check the card itself.
    await get().refreshSdFiles();
    const size = new TextEncoder().encode(text).length;
    const ok = get().sdFiles?.some((f) => f.name === name && f.size === size) ?? false;
    addLog(ok ? 'info' : 'error', t(ok ? 'files.uploaded' : 'files.uploadUnverified', { name }));
    return ok;
  },

  async runSdFile(name) {
    if (!connection || watching()) return;
    const { addLog } = get();
    simulatedCutter(get().url);
    set({ fileJob: { name, startedAt: Date.now() } });
    addLog('info', t('files.started', { name }));
    try {
      await connection.runFile(`/${name}`);
      set({ lastFileResult: 'done' });
      addLog('info', t('files.finished', { name }), 'files.finished');
    } catch (error) {
      set({ lastFileResult: 'aborted' });
      addLog('error', t('files.ended', { name, reason: (error as Error).message }), 'files.ended');
    } finally {
      set({ fileJob: null });
    }
  },

  async stopJob() {
    if (!connection) return;
    connection.realtime(Realtime.FeedHold);
    // A reset while moving loses the position; wait for the hold to complete.
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const s = get().status;
      if (!s || s.state === 'Idle' || (s.state === 'Hold' && s.subState === 0)) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    connection.emergencyStop();
    get().addLog('info', t('files.stopped'));
  },

  async runMacro(macro) {
    const { command, addLog } = get();
    addLog('info', t('macros.running', { name: macro.name }));
    for (const line of macroLines(macro)) {
      if (!(await command(line))) {
        addLog('error', t('macros.failed', { name: macro.name, line }), 'macros.failed');
        return false;
      }
    }
    return true;
  },

  async readConfigFile() {
    if (!connection) return null;
    try {
      const nameLine = (await connection.command('$Config/Filename')).find((l) =>
        l.startsWith('$Config/Filename='),
      );
      const name = nameLine?.split('=')[1]?.trim() || 'config.yaml';
      const text = (await connection.command(`$LocalFS/Show=${name}`)).join('\n');
      return { name, text };
    } catch {
      return null;
    }
  },

  async applyConfigChanges(changes) {
    if (!connection) return false;
    const { addLog } = get();
    try {
      const file = await get().readConfigFile();
      if (!file) throw new Error('config file unknown');
      const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
      await connection.command(`$CD=config-backup-${stamp}.yaml`);
      for (const change of changes) {
        await connection.command(settingCommand(change.path, change.value));
      }
      await connection.command(`$CD=${file.name}`);
      addLog(
        'info',
        t('config.applied', { count: changes.length, backup: `config-backup-${stamp}.yaml` }),
      );
      return true;
    } catch (error) {
      addLog('error', t('config.failed', { reason: (error as Error).message }), 'config.failed');
      return false;
    }
  },

  async refreshState() {
    if (!connection || connection.jobRunning || streamer?.awaitingResponses) return;
    try {
      const gc = (await connection.command('$G')).find((l) => l.startsWith('[GC:'));
      if (gc) set({ parserState: parseParserState(gc.slice(4, -1).split(/\s+/).filter(Boolean)) });
      set({ offsets: parseOffsets(await connection.command('$#')) });
    } catch {
      // not essential; the display keeps the last known state
    }
  },

  async setWcs(code) {
    if (await get().command(code)) {
      get().addLog('info', t('wcs.selected', { wcs: code }));
      await get().refreshState();
    }
  },

  jogStart(axis, direction, feedFactor = 1) {
    const { status, homed, command, addLog } = get();
    if (!connection || !status) return;
    const { profile } = useJob.getState();
    const feed = (axis === 'Z' ? profile.jogFeed.z : profile.jogFeed.xy) * feedFactor;
    const range = profile.travel[axis.toLowerCase() as 'x' | 'y' | 'z'];
    const pos = status.mpos[JOG_INDEX[axis]] ?? 0;
    const target = continuousJogTarget(
      pos,
      direction,
      range,
      homed && profile.softLimits,
      axis === 'Z' ? UNHOMED_JOG_MM.z : UNHOMED_JOG_MM.xy,
    );
    if (!target) {
      addLog('info', t('drive.atLimit', { axis }), 'drive.atLimit');
      return;
    }
    jogTargets = {};
    void command(
      target.mode === 'machine'
        ? jogToMachine(axis, target.value, feed)
        : jogRelative(axis, target.value, feed),
    );
  },

  async runProbeRoutine(routine) {
    const { addLog } = get();
    if (!connection) return null;
    const results: Results = {};
    set({ probing: true });
    try {
      for (const step of routine.steps) {
        const line = step.gcode(results);
        if (step.kind === 'move') {
          await connection.command(line, { timeoutMs: 0 });
          continue;
        }
        const reply = await connection.command(line, { timeoutMs: 0 });
        const contact = reply.map(parseProbeReport).find((r) => r !== null);
        if (!contact) throw new Error('no contact');
        results[step.key] = contact[{ x: 0, y: 1, z: 2 }[step.axis]]!;
      }
      addLog('info', t('probeWizard.done'), 'probeWizard.done');
      return results;
    } catch {
      // Leave the controller in absolute mode whatever happened.
      await connection.command('G90').catch(() => undefined);
      addLog('error', t('probeWizard.failed'), 'probeWizard.failed');
      return null;
    } finally {
      set({ probing: false });
    }
  },

  async setZeroAt(zero) {
    if (!connection) return false;
    await get().refreshState();
    const tlo = get().offsets?.tlo ?? 0;
    const words = (['x', 'y', 'z'] as const)
      .filter((a) => zero[a] !== undefined)
      .map((a) => {
        // Work Z = MPos − offset − TLO, so the offset must leave room for the TLO.
        const value = a === 'z' ? zero.z! - tlo : zero[a]!;
        return `${a.toUpperCase()}${Number(value.toFixed(3))}`;
      });
    if (words.length === 0) return false;
    const ok = await get().command(`G10 L2 P0 ${words.join(' ')}`);
    if (ok) {
      get().addLog(
        'info',
        t('drive.zeroSet', { axes: Object.keys(zero).join('').toUpperCase() }),
        'drive.zeroSet',
      );
      await get().refreshState();
    }
    return ok;
  },

  async restoreZero(zero) {
    const ok = await get().command(restoreCommand(zero));
    if (ok) {
      get().addLog('info', t('zeros.restored', { name: zero.name }));
      await get().refreshState();
    }
    return ok;
  },

  streamJob(name, text) {
    const { addLog } = get();
    if (!connection || watching()) return false;
    const lines = text.split(/\r?\n/);
    let s: CharacterCountingStreamer;
    simulatedCutter(get().url);
    try {
      s = connection.stream(lines, { breakAt: (l) => isToolChange(l) || singleStepOn });
    } catch (error) {
      addLog('error', t('stream.failed', { reason: (error as Error).message }), 'stream.failed');
      return false;
    }
    streamer = s;
    const update = (patch: Partial<StreamJob>) =>
      set((st) => (st.stream ? { stream: { ...st.stream, progress: s.progress, ...patch } } : {}));
    set({
      stream: {
        name,
        lines,
        startedAt: Date.now(),
        progress: s.progress,
        toolChange: null,
        stepAt: null,
        result: 'running',
      },
    });
    s.on('progress', (p) => {
      const result =
        p.state === 'aborted' ? 'aborted' : p.state === 'failed' ? 'failed' : undefined;
      update(result ? { result, toolChange: null } : {});
      if (result) addLog('error', t('stream.aborted', { name }), 'stream.aborted');
    });
    s.on('error', (e) =>
      addLog(
        'error',
        t('stream.lineError', { line: e.line.sourceIndex + 1, code: e.code }),
        'stream.lineError',
      ),
    );
    s.on('done', (p) => {
      if (p.state === 'done') {
        update({ result: 'done' });
        addLog('info', t('stream.done', { name }), 'stream.done');
      }
    });
    s.on('hold', (line) => {
      if (!isToolChange(line)) {
        // Single block: just wait; nothing moves until the next step.
        update({ stepAt: line.sourceIndex });
        return;
      }
      void (async () => {
        const before = get().parserState;
        await get().refreshState();
        const spindleBefore = get().parserState ?? before;
        const tool = toolAtLine(lines, line.sourceIndex);
        update({ toolChange: { line: line.sourceIndex, tool, spindleBefore } });
        addLog('info', t('toolChange.held', { tool: tool ?? '?' }), 'toolChange.held');
        // Spindle off, tool up, and to the change position if there is one.
        const { settings } = useWorkshop.getState();
        const zMax = useJob.getState().profile.travel.z.max;
        const cmds = ['M5', ...safeLift(get().homed, safeMachineZ(settings, zMax))];
        if (settings.toolChangePosition && get().homed) {
          const { x, y } = settings.toolChangePosition;
          cmds.push(`G53 G0 X${x} Y${y}`);
        }
        for (const c of cmds) await get().command(c);
      })();
    });
    addLog('info', t('stream.started', { name }));
    s.start();
    return true;
  },

  async continueAfterToolChange() {
    const st = get().stream;
    if (!st?.toolChange || !streamer) return;
    const { settings } = useWorkshop.getState();
    const zMax = useJob.getState().profile.travel.z.max;
    for (const c of safeLift(get().homed, safeMachineZ(settings, zMax))) await get().command(c);
    const spindle = spindleRestore(st.toolChange.spindleBefore);
    if (spindle) await get().command(spindle);
    set({ stream: { ...st, toolChange: null } });
    get().addLog('info', t('toolChange.continue'));
    streamer.release();
  },

  async frame(bounds) {
    const { homed, command, addLog } = get();
    const { profile } = useJob.getState();
    const { settings } = useWorkshop.getState();
    const lines = frameLines(bounds, {
      homed,
      safeMachineZ: safeMachineZ(settings, profile.travel.z.max),
      feed: profile.jogFeed.xy,
    });
    addLog('info', t('frame.started'));
    for (const line of lines) {
      if (line.startsWith('(')) continue;
      if (!(await command(line))) {
        addLog('error', t('frame.failed'), 'frame.failed');
        return false;
      }
    }
    return true;
  },

  async lift() {
    const { settings } = useWorkshop.getState();
    const zMax = useJob.getState().profile.travel.z.max;
    for (const c of safeLift(get().homed, safeMachineZ(settings, zMax))) {
      if (!(await get().command(c))) return false;
    }
    return true;
  },

  async readSettings() {
    if (!connection) return null;
    try {
      return parseSettingsList(await connection.command('$S'));
    } catch {
      return null;
    }
  },

  async uploadConfigFile(name, text, backup, backupName) {
    const url = toWebSocketUrl(get().url);
    if (!connection || !url || watching()) return null;
    const { addLog } = get();
    const sim = isSimulatorAddress(get().url);
    const http = new FluidNCHttp({ baseUrl: fluidncHttpBase(url) });
    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
    const keep = backupName ?? `config-backup-${stamp}.yaml`;
    // Read back byte for byte where the companion can, else as FluidNC shows it (no blank lines).
    const verify = async (file: string, expected: string) => {
      const exact = await get().readFlashFile(file);
      if (exact !== null) return exact === expected;
      return sameConfigText(
        (await connection!.command(`$LocalFS/Show=${file}`)).join('\n'),
        expected,
      );
    };
    const put = async (file: string, content: string) => {
      if (sim) simulator().localFiles.set(file, content);
      else await http.upload('localfs', '/', file, content);
    };
    try {
      await put(keep, backup);
      if (!(await verify(keep, backup))) throw new Error(t('config.backupUnverified'));
      await put(name, text);
      if (!(await verify(name, text))) throw new Error(t('config.uploadUnverified'));
      addLog('info', t('config.uploaded', { name, backup: keep }));
      return keep;
    } catch (error) {
      addLog('error', t('config.failed', { reason: (error as Error).message }), 'config.failed');
      return null;
    }
  },

  async readFlashFile(name) {
    if (!connection) return null;
    if (isSimulatorAddress(get().url)) return simulator().localFiles.get(name) ?? null;
    const url = toWebSocketUrl(get().url) ?? '';
    const advertised = useWorkshop.getState().companionHealth?.fluidnc?.url;
    // Only when the companion relays to the very FluidNC this connection talks to.
    const same =
      isRelayUrl(url) || (advertised !== undefined && hostOf(advertised) === hostOf(url));
    const c = companion();
    if (!same || !advertised || !c) return null;
    try {
      return await c.fluidncFile(name);
    } catch {
      return null;
    }
  },

  async query(line) {
    if (!connection) return null;
    try {
      return await connection.command(line);
    } catch {
      return null;
    }
  },

  async moveTo(target, lift) {
    const { status, homed, command, addLog } = get();
    if (!connection || !status) return false;
    const { profile } = useJob.getState();
    const { settings } = useWorkshop.getState();
    const plan = moveToCommands(
      target,
      { x: status.mpos[0] ?? 0, y: status.mpos[1] ?? 0 },
      {
        homed,
        softLimits: profile.softLimits,
        travel: profile.travel,
        lift: lift && homed,
        safeMachineZ: safeMachineZ(settings, profile.travel.z.max),
        feedXY: profile.jogFeed.xy,
        feedZ: profile.jogFeed.z,
      },
    );
    if (!plan) return false;
    if (plan.limited) addLog('info', t('goto.limited'), 'goto.limited');
    jogTargets = {};
    for (const line of plan.lines) if (!(await command(line))) return false;
    addLog('info', t('goto.moving', { x: target.x.toFixed(2), y: target.y.toFixed(2) }));
    return true;
  },

  async moveMachine(target, feed) {
    const { status, homed, addLog } = get();
    if (!connection || !status) return false;
    const { profile } = useJob.getState();
    const words: string[] = [];
    for (const axis of ['x', 'y', 'z'] as const) {
      const v = target[axis];
      if (v === undefined) continue;
      const range = profile.travel[axis];
      if (homed && profile.softLimits && (v < range.min - 0.001 || v > range.max + 0.001)) {
        addLog('error', t('calibration.outside'), 'calibration.outside');
        return false;
      }
      words.push(`${axis.toUpperCase()}${Number(v.toFixed(3))}`);
    }
    if (words.length === 0) return true;
    try {
      jogTargets = {};
      await connection.command(`G90 G53 G1 ${words.join(' ')} F${Math.round(feed)}`, {
        timeoutMs: 0,
      });
      await connection.command('G4 P0', { timeoutMs: 0 });
      return true;
    } catch (error) {
      addLog(
        'error',
        t('calibration.moveFailed', { reason: (error as Error).message }),
        'calibration.moveFailed',
      );
      return false;
    }
  },

  async moveZ(workZ) {
    const { status, homed, command } = get();
    if (!connection || !status) return false;
    const { profile } = useJob.getState();
    const feed = profile.jogFeed.z;
    if (!homed || !profile.softLimits) {
      return command(`$J=G90 G21 Z${Number(workZ.toFixed(3))} F${Math.round(feed)}`);
    }
    const machineZ = workZ + (status.wco[2] ?? 0);
    const z = Math.min(profile.travel.z.max, Math.max(profile.travel.z.min, machineZ));
    if (Math.abs(z - machineZ) > 0.001) get().addLog('info', t('goto.limited'), 'goto.limited');
    jogTargets = {};
    return command(jogToMachine('Z', z, feed));
  },

  stick(vx, vy) {
    stickVector = { x: vx, y: vy };
    if (stickTimer || !connection) return;
    const tick = () => {
      const { status, homed } = get();
      if (stickBusy || !status || !connection) return;
      const { profile } = useJob.getState();
      stickBase ??= { x: status.mpos[0] ?? 0, y: status.mpos[1] ?? 0 };
      const step = stickStep(stickVector.x, stickVector.y, STICK_TICK, stickBase, {
        homed,
        softLimits: profile.softLimits,
        travel: profile.travel,
        feedXY: profile.jogFeed.xy,
      });
      if (!step) return;
      stickBusy = true;
      void get()
        .command(step.line)
        .then((ok) => {
          stickBusy = false;
          if (ok) stickBase = step.to;
          else get().stickStop();
        });
    };
    tick();
    stickTimer = setInterval(tick, STICK_TICK * 1000);
  },

  stickStop() {
    if (stickTimer) clearInterval(stickTimer);
    stickTimer = null;
    stickBase = null;
    stickVector = { x: 0, y: 0 };
    get().jogCancel();
  },

  setSingleStep(on) {
    singleStepOn = on;
    set({ singleStep: on });
    const st = get().stream;
    // Switching off while waiting at a step continues the job.
    if (!on && st?.stepAt !== null && st?.stepAt !== undefined) get().stepNext();
  },

  stepNext() {
    const st = get().stream;
    if (!st || st.stepAt === null || !streamer) return;
    set({ stream: { ...st, stepAt: null } });
    streamer.release();
  },

  addLog(kind, text, key, code) {
    set((s) => {
      const entry: LogEntry = { id: nextLogId++, time: Date.now(), kind, text };
      if (key) entry.key = key;
      if (code) entry.code = code;
      const log = [...s.log, entry];
      return { log: log.length > LOG_LIMIT ? log.slice(-LOG_LIMIT) : log };
    });
  },
}));
