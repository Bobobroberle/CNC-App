/**
 * Relays one FluidNC WebSocket to any number of browsers: FluidNC sees a
 * single client, every tablet sees the same output. One browser controls –
 * the first to attach – and its commands go upstream unchanged; every other
 * one only watches: it may ask for the status and stop the machine (`?`, `!`,
 * reset), nothing else. Answers (`ok`) go to every browser and cannot be told
 * apart by sender, so a second sender would end the first one's job in its head.
 * FluidNC stays the only motion authority.
 */
export interface RelayClient {
  send(data: string | Uint8Array, options: { binary: boolean }): void;
  close(code?: number, reason?: string): void;
  /**
   * The client asked for stamps (`?stamp=1`): every message from FluidNC is preceded by a `STAMP:` text
   * frame. Opt-in because an older app would glue an unknown text frame onto the next line and lose
   * the report; a client without it sees exactly the frames it always did.
   */
  readonly stamp?: boolean;
}

/**
 * The Pi's clock in one reading: `mono` is CLOCK_MONOTONIC in ms with 3 decimals (what `process.hrtime`
 * counts on Linux, and the clock ustreamer stamps its frames in), `wall` the real time in ms since 1970.
 */
export interface ClockReading {
  mono: number;
  wall: number;
}
export type Clock = () => ClockReading;

/** The real clock. */
export const systemClock: Clock = () => ({
  // ns → µs as a whole number first: a bigint holds it exactly, a double does not past about 104 days of uptime
  mono: Number(process.hrtime.bigint() / 1000n) / 1000,
  wall: Date.now(),
});

/** The text frame that goes before a message from FluidNC for a client that asked for stamps. */
export function stampFrame(reading: ClockReading): string {
  return `STAMP:${reading.mono.toFixed(3)}:${Math.round(reading.wall)}`;
}

export interface Upstream {
  binaryType: string;
  readonly readyState: number;
  send(data: string | Uint8Array): void;
  close(): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

const OPEN = 1;

/** Jog cancel: sent upstream when the controlling browser goes, so a held jog stops. */
const JOG_CANCEL = new Uint8Array([0x85]);

/** What a watching browser may still send: status query, feed hold, soft reset – only ever to stop or look. */
function mayWatchingSend(data: string | Uint8Array): boolean {
  if (typeof data === 'string') return data === '?' || data === '!' || data === '\x18';
  return data.length === 1 && data[0] === 0x18;
}

/** Close code for the browsers when FluidNC cannot be reached or goes away */
export const RELAY_CLOSE_CODE = 1011;

/** Why the relay closed its browsers last: the app tells the operator from it. */
export interface RelayFailure {
  /** `unreachable`: FluidNC never answered the connection; `disconnected`: it went away */
  kind: 'unreachable' | 'disconnected';
  at: number;
}

/**
 * The close reason the browsers get. It names the address the Pi tries, so
 * the app can say which device is missing (WebSocket reasons are ≤ 123 bytes).
 */
export function relayCloseReason(kind: RelayFailure['kind'], url: string): string {
  return `FluidNC ${kind}: ${url}`.slice(0, 123);
}

export class FluidNCRelay {
  private upstream: Upstream | null = null;
  private readonly clients = new Set<RelayClient>();
  /** A status query waiting for the upstream to open – nothing else is ever held back */
  private queue: (string | Uint8Array)[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** The last time FluidNC could not be reached or went away; null once it answered again */
  lastFailure: RelayFailure | null = null;
  /** The browser whose commands pass; the others watch */
  private controller: RelayClient | null = null;
  /** Clients that never control (the recorder) and so are not told their role */
  private readonly observers = new Set<RelayClient>();
  private readonly lastSeen = new Map<RelayClient, number>();

  constructor(
    readonly url: string,
    private readonly connect: (url: string) => Upstream = (u) =>
      new WebSocket(u) as unknown as Upstream,
    /** How long the upstream may take to open before the browsers are told */
    private readonly openTimeoutMs = 5000,
    /** A controlling browser silent this long hands control on to the next one that speaks */
    private readonly silenceMs = 10_000,
    /** The clock the stamps are read from (the tests set their own) */
    readonly clock: Clock = systemClock,
  ) {}

  get clientCount(): number {
    return this.clients.size;
  }

  /** Browsers only: what listens for the recorder is no one who would lose a job when the companion restarts. */
  get browserCount(): number {
    return this.clients.size - this.observers.size;
  }

  get connected(): boolean {
    return this.upstream?.readyState === OPEN;
  }

  /** `observer`: only listens (the recorder); it never controls and is not told a role */
  attach(client: RelayClient, options: { observer?: boolean } = {}): void {
    this.clients.add(client);
    this.lastSeen.set(client, Date.now());
    if (options.observer) this.observers.add(client);
    else if (!this.controller) this.controller = client;
    if (!options.observer) this.tell(client);
    if (!this.upstream) this.open();
  }

  detach(client: RelayClient): void {
    this.clients.delete(client);
    this.observers.delete(client);
    this.lastSeen.delete(client);
    if (client === this.controller) this.handOn();
    if (this.clients.size === 0) this.shutdown();
  }

  /** The controlling browser is gone or silent: a held jog stops, the next browser in line controls. */
  private handOn(next?: RelayClient): void {
    const old = this.controller;
    if (this.upstream?.readyState === OPEN) this.upstream.send(JOG_CANCEL);
    this.controller =
      next ?? [...this.clients].find((c) => c !== old && !this.observers.has(c)) ?? null;
    if (old && this.clients.has(old)) this.tell(old);
    if (this.controller) this.tell(this.controller);
  }

  /** In-band, as a WebUI meta text frame the app's connection reads. */
  private tell(client: RelayClient): void {
    client.send(`ROLE:${client === this.controller ? 'controller' : 'viewer'}`, { binary: false });
  }

  /**
   * Passes a browser's data on. While FluidNC is not connected yet only a
   * status query waits for it: a command typed meanwhile must never reach a
   * machine later, by surprise – it is dropped.
   */
  fromClient(data: string | Uint8Array, from?: RelayClient): void {
    const now = Date.now();
    if (from) {
      this.lastSeen.set(from, now);
      const silent =
        this.controller && now - (this.lastSeen.get(this.controller) ?? now) > this.silenceMs;
      if (silent && from !== this.controller && !this.observers.has(from)) this.handOn(from);
    }
    if (from !== this.controller && !mayWatchingSend(data)) return;
    if (this.upstream?.readyState === OPEN) this.upstream.send(data);
    else if (data === '?' && this.queue.length === 0) this.queue.push(data);
  }

  private open(): void {
    const up = this.connect(this.url);
    up.binaryType = 'arraybuffer';
    this.upstream = up;
    let opened = false;
    this.timer = setTimeout(() => this.fail(up, opened), this.openTimeoutMs);
    up.onopen = () => {
      opened = true;
      this.clearTimer();
      this.lastFailure = null;
      for (const d of this.queue) up.send(d);
      this.queue = [];
    };
    up.onmessage = (ev) => {
      const binary = typeof ev.data !== 'string';
      const data = binary ? new Uint8Array(ev.data as ArrayBuffer) : (ev.data as string);
      // One reading per message, shared by every client that asked: the stamp goes right before it
      let stamp: string | null = null;
      for (const c of this.clients) {
        if (c.stamp) {
          stamp ??= stampFrame(this.clock());
          c.send(stamp, { binary: false });
        }
        c.send(data, { binary });
      }
    };
    up.onclose = () => this.fail(up, opened);
    up.onerror = () => up.close();
  }

  /** FluidNC is not there (any more): every browser is told why and where. */
  private fail(up: Upstream, opened: boolean): void {
    if (this.upstream !== up) return;
    this.clearTimer();
    this.upstream = null;
    this.queue = [];
    up.onclose = up.onerror = up.onmessage = up.onopen = null;
    up.close();
    const kind = opened ? 'disconnected' : 'unreachable';
    this.lastFailure = { kind, at: Date.now() };
    const reason = relayCloseReason(kind, this.url);
    for (const c of [...this.clients]) c.close(RELAY_CLOSE_CODE, reason);
    this.clients.clear();
    this.controller = null;
    this.lastSeen.clear();
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private shutdown(): void {
    const up = this.upstream;
    this.clearTimer();
    this.upstream = null;
    this.queue = [];
    up?.close();
  }
}
