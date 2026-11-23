import { Emitter } from './emitter';
import { parseMessage, type ControllerMessage } from './messages';
import { Realtime } from './realtime';
import { StatusTracker, type MachineStatus } from './status';
import { CharacterCountingStreamer, prepareProgram, type StreamerOptions } from './streamer';

/** The subset of the browser WebSocket API the client uses. */
export interface WebSocketLike {
  binaryType: string;
  readonly readyState: number;
  send(data: string | Uint8Array): void;
  close(): void;
  onopen: ((event: unknown) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
}

export type WebSocketFactory = (url: string) => WebSocketLike;

export type ConnectionState = 'disconnected' | 'connecting' | 'connected';

export interface ConnectionEvents {
  state: ConnectionState;
  /** Every complete line received from the controller */
  line: string;
  message: ControllerMessage;
  /** Every line or realtime byte sent, for the protocol log */
  sent: string;
  status: MachineStatus;
  alarm: number;
  /** FluidNC restarted or was soft-reset */
  reset: string;
  /** WebSocket meta messages such as CURRENT_ID:0 or PING:… */
  meta: string;
  /** The socket closed by itself (not through `disconnect()`) */
  closed: CloseInfo;
}

/** How a socket ended that the app did not close itself. */
export interface CloseInfo {
  /** The WebSocket close code (1006: dropped without a close frame) */
  code: number;
  /** The close reason, e.g. the companion relay's `FluidNC unreachable: ws://…` */
  reason: string;
  /** The socket was open at some point */
  opened: boolean;
  /** The controller had answered: the connection was really up */
  answered: boolean;
}

/**
 * Why `connect()` failed. `unreachable`: the socket never opened;
 * `closed`: it opened and closed again before the controller answered;
 * `silent`: it opened, but nothing answered within the answer timeout.
 */
export class ConnectError extends Error {
  constructor(
    readonly kind: 'unreachable' | 'closed' | 'silent',
    readonly url: string,
    readonly code = 0,
    readonly reason = '',
  ) {
    super(
      kind === 'unreachable'
        ? `Cannot connect to ${url}`
        : kind === 'closed'
          ? `Connection to ${url} closed${reason ? `: ${reason}` : ''}`
          : `No answer from ${url}`,
    );
    this.name = 'ConnectError';
  }
}

export interface ConnectionOptions {
  /** e.g. ws://192.168.1.50:81 */
  url: string;
  createSocket?: WebSocketFactory;
  /** Status poll interval in ms; 0 disables polling. Default 200 (5 Hz). */
  statusIntervalMs?: number;
  /** Timeout for `command()` in ms. Default 10 s. */
  commandTimeoutMs?: number;
  /**
   * How long `connect()` waits after the socket opened for the controller's
   * first line (the answer to a status query). Default 8 s. A socket that
   * opens is not yet a connection: a relay accepts it before it reaches FluidNC.
   */
  answerTimeoutMs?: number;
}

export class CommandError extends Error {
  constructor(
    readonly command: string,
    readonly code: number,
    readonly lines: string[] = [],
  ) {
    super(code < 0 ? `${command}: ${lines.join(' ')}` : `${command}: error:${code}`);
    this.name = 'CommandError';
  }
}

interface PendingCommand {
  command: string;
  lines: string[];
  resolve: (lines: string[]) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
  /** A file job ($SD/Run): FluidNC acknowledges it only when the job ends. */
  job?: boolean;
}

export interface CommandOptions {
  /** Overrides the connection's command timeout; 0 waits forever (e.g. probing). */
  timeoutMs?: number;
}

const WS_OPEN = 1;
// WebUI v2 sends CURRENT_ID/ACTIVE_ID, newer builds currentID/activeID.
const META = /^(CURRENT_?ID|ACTIVE_?ID|PING|DHT|ERROR):/i;

function defaultFactory(url: string): WebSocketLike {
  const Impl = (globalThis as { WebSocket?: new (url: string) => WebSocketLike }).WebSocket;
  if (!Impl) throw new Error('No WebSocket implementation available');
  return new Impl(url);
}

/**
 * Connection to FluidNC over its WebSocket (port 81 with WebUI v2).
 * Controller output arrives as binary frames, meta information as text frames.
 */
export class FluidNCConnection extends Emitter<ConnectionEvents> {
  readonly tracker = new StatusTracker();
  private socket: WebSocketLike | null = null;
  private connectionState: ConnectionState = 'disconnected';
  private readonly options: Required<Omit<ConnectionOptions, 'createSocket'>> & {
    createSocket: WebSocketFactory;
  };
  private partial = '';
  private readonly decoder = new TextDecoder();
  private pending: PendingCommand[] = [];
  private streamer: CharacterCountingStreamer | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  /** Resolves `connect()` once the controller answered */
  private answered: (() => void) | null = null;
  private answerTimer: ReturnType<typeof setTimeout> | null = null;
  private opened = false;
  /** Rejects a `connect()` that has not settled yet */
  private failConnect: ((error: ConnectError) => void) | null = null;

  constructor(options: ConnectionOptions) {
    super();
    this.options = {
      statusIntervalMs: 200,
      commandTimeoutMs: 10_000,
      answerTimeoutMs: 8_000,
      createSocket: defaultFactory,
      ...options,
    };
  }

  get state(): ConnectionState {
    return this.connectionState;
  }

  get status(): MachineStatus | null {
    return this.tracker.status;
  }

  get activeStream(): CharacterCountingStreamer | null {
    return this.streamer;
  }

  /**
   * Opens the socket and resolves once the controller has answered – the
   * state stays `connecting` until then. Rejects with a `ConnectError`.
   */
  connect(): Promise<void> {
    if (this.socket) return Promise.reject(new Error('Already connected'));
    const { url } = this.options;
    return new Promise((resolve, reject) => {
      const socket = this.options.createSocket(url);
      socket.binaryType = 'arraybuffer';
      this.socket = socket;
      this.opened = false;
      this.setState('connecting');
      let settled = false;
      const fail = (error: ConnectError) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      this.failConnect = fail;
      this.answered = () => {
        settled = true;
        this.setState('connected');
        resolve();
      };
      socket.onopen = () => {
        this.opened = true;
        this.answerTimer = setTimeout(() => {
          fail(new ConnectError('silent', url));
          this.disconnect();
        }, this.options.answerTimeoutMs);
        // Ask at once; the answer makes the connection (it may come back synchronously).
        socket.send('?');
        this.startPolling();
      };
      socket.onerror = () => {
        if (!this.opened) fail(new ConnectError('unreachable', url));
      };
      socket.onclose = (event) => {
        const { code = 1006, reason = '' } = event as { code?: number; reason?: string };
        const answered = this.connectionState === 'connected';
        fail(new ConnectError(this.opened ? 'closed' : 'unreachable', url, code, reason));
        this.emit('closed', { code, reason, opened: this.opened, answered });
        this.teardown('Connection closed');
      };
      socket.onmessage = (event) => this.receive(event.data);
    });
  }

  disconnect(): void {
    const socket = this.socket;
    this.teardown('Disconnected');
    socket?.close();
  }

  /** Sends a line as-is (newline appended). Prefer `command()` to get the response. */
  sendLine(line: string): void {
    this.requireOpen().send(`${line}\n`);
    this.emit('sent', line);
  }

  /** Sends a realtime byte. Bytes ≥ 0x80 must go as a binary frame. */
  realtime(byte: number): void {
    const socket = this.requireOpen();
    if (byte < 0x80) socket.send(String.fromCharCode(byte));
    else socket.send(new Uint8Array([byte]));
    if (byte !== Realtime.StatusReport)
      this.emit('sent', `0x${byte.toString(16).padStart(2, '0')}`);
  }

  /** Sends a command and resolves with the lines received before its `ok`. */
  command(line: string, options: CommandOptions = {}): Promise<string[]> {
    if (this.streamer?.awaitingResponses) {
      return Promise.reject(new Error('A job is streaming; commands are blocked'));
    }
    if (this.jobRunning) {
      return Promise.reject(new Error('A file job is running; commands are blocked'));
    }
    const timeoutMs = options.timeoutMs ?? this.options.commandTimeoutMs;
    return new Promise((resolve, reject) => {
      const entry: PendingCommand = { command: line, lines: [], resolve, reject, timer: null };
      if (timeoutMs > 0) {
        entry.timer = setTimeout(() => {
          this.pending = this.pending.filter((p) => p !== entry);
          reject(new CommandError(line, -1, ['timeout']));
        }, timeoutMs);
      }
      this.pending.push(entry);
      try {
        this.sendLine(line);
      } catch (error) {
        if (entry.timer) clearTimeout(entry.timer);
        this.pending.pop();
        reject(error as Error);
      }
    });
  }

  /** True while a file started with `runFile()` is running. */
  get jobRunning(): boolean {
    return this.pending.some((p) => p.job);
  }

  /**
   * Runs a file from the SD card (`$SD/Run=`). FluidNC acknowledges the
   * command only when the job has finished, so the promise resolves at the
   * end of the job and rejects if it fails or is aborted. Other commands are
   * blocked meanwhile; realtime commands (hold, resume, overrides) work.
   */
  runFile(path: string): Promise<void> {
    if (this.pending.length > 0 || this.streamer?.awaitingResponses) {
      return Promise.reject(new Error('Controller is busy'));
    }
    const line = `$SD/Run=${path}`;
    return new Promise((resolve, reject) => {
      this.pending.push({
        command: line,
        lines: [],
        resolve: () => resolve(),
        reject,
        timer: null,
        job: true,
      });
      try {
        this.sendLine(line);
      } catch (error) {
        this.pending.pop();
        reject(error as Error);
      }
    });
  }

  /** Creates a streamer for a program; call `start()` on the result. */
  stream(
    programLines: readonly string[],
    options: Omit<StreamerOptions, 'send'> = {},
  ): CharacterCountingStreamer {
    if (this.pending.length > 0 || this.streamer?.awaitingResponses) {
      throw new Error('Controller is busy');
    }
    this.requireOpen();
    const streamer = new CharacterCountingStreamer(prepareProgram(programLines), {
      ...options,
      send: (text) => this.sendLine(text),
    });
    this.streamer = streamer;
    return streamer;
  }

  /** Feed hold, then soft reset: stops motion immediately and clears all buffers. */
  emergencyStop(): void {
    this.realtime(Realtime.FeedHold);
    this.realtime(Realtime.SoftReset);
    this.streamer?.abort();
    this.rejectPending('Soft reset');
  }

  private requireOpen(): WebSocketLike {
    if (!this.socket || this.socket.readyState !== WS_OPEN) throw new Error('Not connected');
    return this.socket;
  }

  private setState(state: ConnectionState) {
    this.connectionState = state;
    this.emit('state', state);
  }

  private startPolling() {
    if (this.options.statusIntervalMs <= 0) return;
    this.poll = setInterval(() => {
      if (this.socket?.readyState === WS_OPEN) this.realtime(Realtime.StatusReport);
    }, this.options.statusIntervalMs);
  }

  private teardown(reason: string) {
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
    if (this.answerTimer) clearTimeout(this.answerTimer);
    this.answerTimer = null;
    this.answered = null;
    // Closed by the app while still connecting: the attempt ends, too.
    this.failConnect?.(new ConnectError('closed', this.options.url, 1000, reason));
    this.failConnect = null;
    if (this.socket) {
      this.socket.onopen = this.socket.onclose = this.socket.onerror = this.socket.onmessage = null;
    }
    this.socket = null;
    this.partial = '';
    this.streamer?.abort();
    this.rejectPending(reason);
    this.tracker.reset();
    if (this.connectionState !== 'disconnected') this.setState('disconnected');
  }

  private rejectPending(reason: string) {
    for (const p of this.pending) {
      if (p.timer) clearTimeout(p.timer);
      p.reject(new CommandError(p.command, -1, [reason]));
    }
    this.pending = [];
  }

  private receive(data: unknown) {
    if (this.answered) {
      // The first word from FluidNC (a line or its WebSocket greeting): now it is a connection.
      // Data only comes once the socket is open, and opening set the timer.
      clearTimeout(this.answerTimer!);
      this.answerTimer = null;
      const answered = this.answered;
      this.answered = null;
      answered();
    }
    if (typeof data === 'string') {
      // Text frames carry WebUI meta messages; anything else is controller output.
      if (META.test(data)) {
        this.emit('meta', data);
        return;
      }
      this.receiveText(data);
    } else if (data instanceof ArrayBuffer) {
      this.receiveText(this.decoder.decode(data, { stream: true }));
    } else if (ArrayBuffer.isView(data)) {
      this.receiveText(this.decoder.decode(data, { stream: true }));
    }
  }

  private receiveText(text: string) {
    this.partial += text;
    let newline = this.partial.indexOf('\n');
    while (newline >= 0) {
      const line = this.partial.slice(0, newline).replace(/\r$/, '');
      this.partial = this.partial.slice(newline + 1);
      if (line.trim() !== '') this.handleLine(line);
      newline = this.partial.indexOf('\n');
    }
  }

  private handleLine(line: string) {
    this.emit('line', line);
    const message = parseMessage(line);
    this.emit('message', message);
    switch (message.type) {
      case 'ok':
      case 'error': {
        const code = message.type === 'error' ? message.code : undefined;
        const pending = this.pending.shift();
        if (pending) {
          if (pending.timer) clearTimeout(pending.timer);
          if (code === undefined) pending.resolve(pending.lines);
          else pending.reject(new CommandError(pending.command, code, pending.lines));
        } else {
          this.streamer?.acknowledge(code);
        }
        break;
      }
      case 'status':
        this.emit('status', this.tracker.update(message.report));
        break;
      case 'alarm':
        this.streamer?.abort();
        this.emit('alarm', message.code);
        break;
      case 'welcome':
        this.streamer?.abort();
        this.rejectPending('Controller reset');
        this.emit('reset', message.text);
        break;
      default:
        // Output during a file job is not collected; it can be very long.
        if (this.pending[0] && !this.pending[0].job) this.pending[0].lines.push(line);
    }
  }
}
