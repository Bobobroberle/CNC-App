import { Emitter } from './emitter';

/**
 * Grbl-style RX buffer of 128 bytes, one byte kept free. FluidNC accepts the
 * same character-counting protocol.
 * TODO(verify): confirm the usable buffer size of the WebSocket channel.
 */
export const DEFAULT_RX_BUFFER = 127;

export interface StreamLine {
  /** 0-based line index in the source program */
  sourceIndex: number;
  /** What is sent, without newline */
  text: string;
}

/** Strips comments and whitespace so each line uses as little RX buffer as possible. */
export function prepareLine(raw: string): string {
  const withoutComments = raw
    .replace(/\([^)]*\)/g, '')
    .replace(/;.*$/, '')
    .trim();
  // System commands ($H, $X, $J=…) keep their spelling.
  if (withoutComments.startsWith('$')) return withoutComments;
  return withoutComments.replace(/\s+/g, '').toUpperCase();
}

export function prepareProgram(lines: readonly string[]): StreamLine[] {
  const out: StreamLine[] = [];
  lines.forEach((raw, sourceIndex) => {
    const text = prepareLine(raw);
    if (text !== '' && text !== '%') out.push({ sourceIndex, text });
  });
  return out;
}

export type StreamState = 'idle' | 'running' | 'paused' | 'held' | 'done' | 'failed' | 'aborted';

export interface StreamProgress {
  state: StreamState;
  total: number;
  sent: number;
  acknowledged: number;
  /** Bytes currently in the controller's RX buffer (by our count) */
  buffered: number;
  /** Source line of the last acknowledged block, -1 before the first */
  lastAcknowledgedSource: number;
}

export interface StreamError {
  code: number;
  line: StreamLine;
}

export interface StreamerEvents {
  progress: StreamProgress;
  error: StreamError;
  done: StreamProgress;
  /** Everything before a breakpoint line is acknowledged; waits for `release()` */
  hold: StreamLine;
}

export interface StreamerOptions {
  send: (text: string) => void;
  rxBufferSize?: number;
  /** Stop sending after `error:N` (default) or keep going */
  onError?: 'stop' | 'continue';
  /**
   * Lines before which the stream stops until `release()`, e.g. tool changes:
   * FluidNC does not stop at M6 without an ATC, so the app holds the job there.
   */
  breakAt?: (line: StreamLine) => boolean;
}

/** M6 tool changes as breakpoints (`T2 M6`, `M06`). */
export const isToolChange = (line: StreamLine): boolean =>
  (line.text.match(/M[\d.]+/g) ?? []).some((w) => Number(w.slice(1)) === 6);

/**
 * Character-counting streamer: keeps the controller's RX buffer as full as
 * possible without overflowing it. Transport-agnostic; the connection feeds
 * `ok`/`error` responses into `acknowledge()`.
 */
export class CharacterCountingStreamer extends Emitter<StreamerEvents> {
  readonly lines: StreamLine[];
  private readonly send: (text: string) => void;
  private readonly rxBufferSize: number;
  private readonly errorPolicy: 'stop' | 'continue';
  private readonly breakAt: (line: StreamLine) => boolean;
  private released = -1;
  private state: StreamState = 'idle';
  private next = 0;
  private acked = 0;
  private inFlight: number[] = [];
  private buffered = 0;

  constructor(lines: StreamLine[], options: StreamerOptions) {
    super();
    this.lines = lines;
    this.send = options.send;
    this.rxBufferSize = options.rxBufferSize ?? DEFAULT_RX_BUFFER;
    this.errorPolicy = options.onError ?? 'stop';
    this.breakAt = options.breakAt ?? (() => false);
    const tooLong = lines.find((l) => l.text.length + 1 > this.rxBufferSize);
    if (tooLong) {
      throw new RangeError(`Line ${tooLong.sourceIndex + 1} is longer than the RX buffer`);
    }
  }

  get progress(): StreamProgress {
    const last = this.acked > 0 ? this.lines[this.acked - 1]!.sourceIndex : -1;
    return {
      state: this.state,
      total: this.lines.length,
      sent: this.next,
      acknowledged: this.acked,
      buffered: this.buffered,
      lastAcknowledgedSource: last,
    };
  }

  /** True while responses for sent lines are outstanding. */
  get awaitingResponses(): boolean {
    return this.inFlight.length > 0;
  }

  start(): void {
    if (this.state !== 'idle') return;
    this.state = 'running';
    this.fill();
    this.finishIfDone();
  }

  /** Stops sending new lines; the controller finishes what it has buffered. */
  pause(): void {
    if (this.state === 'running') {
      this.state = 'paused';
      this.emit('progress', this.progress);
    }
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'running';
    this.fill();
    this.finishIfDone();
  }

  /** Continues after a hold, starting with the breakpoint line. */
  release(): void {
    if (this.state !== 'held') return;
    this.released = this.next;
    this.state = 'running';
    this.fill();
    this.emit('progress', this.progress);
    this.finishIfDone();
  }

  /** The line the stream is held before, if any */
  get heldAt(): StreamLine | null {
    return this.state === 'held' ? this.lines[this.next]! : null;
  }

  /** Forget everything in flight (soft reset, alarm, disconnect). */
  abort(): void {
    if (this.state === 'done' || this.state === 'failed' || this.state === 'aborted') return;
    this.state = 'aborted';
    this.inFlight = [];
    this.buffered = 0;
    this.emit('progress', this.progress);
  }

  /** Feed one `ok` (errorCode undefined) or `error:N` response. Returns false if none was expected. */
  acknowledge(errorCode?: number): boolean {
    const size = this.inFlight.shift();
    if (size === undefined) return false;
    this.buffered -= size;
    const line = this.lines[this.acked]!;
    this.acked++;
    if (errorCode !== undefined) {
      this.emit('error', { code: errorCode, line });
      if (this.errorPolicy === 'stop') this.state = 'failed';
    }
    if (this.state === 'running') this.fill();
    this.emit('progress', this.progress);
    this.finishIfDone();
    return true;
  }

  private fill(): void {
    while (this.next < this.lines.length) {
      const line = this.lines[this.next]!;
      if (this.next !== this.released && this.breakAt(line)) break;
      const text = line.text;
      const size = text.length + 1;
      if (this.buffered + size > this.rxBufferSize) break;
      // Count the line before sending: a transport may answer synchronously.
      this.inFlight.push(size);
      this.buffered += size;
      this.next++;
      this.send(text);
    }
  }

  private finishIfDone(): void {
    if (this.inFlight.length > 0) return;
    if (this.state === 'running' && this.next < this.lines.length) {
      // Only a breakpoint stops filling with an empty buffer.
      this.state = 'held';
      this.emit('progress', this.progress);
      this.emit('hold', this.lines[this.next]!);
    } else if (this.state === 'running') {
      this.state = 'done';
      this.emit('done', this.progress);
    } else if (this.state === 'failed') {
      this.emit('done', this.progress);
    }
  }
}
