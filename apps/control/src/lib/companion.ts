/**
 * Client for the companion computer (apps/companion). Every call is
 * optional: without a companion the app keeps working from the browser
 * storage alone.
 */
export interface CompanionHealth {
  ok: boolean;
  version: string;
  fluidnc: { url: string; connected: boolean; clients: number } | null;
  sensors: string;
  /** Camera stream it advertises (`CAMERA_URL`), possibly relative to its host */
  camera?: string | null;
  /** Whether it can power its host down (`POST /api/system/shutdown`) */
  shutdown?: boolean;
  /** Why the last power-down failed, e.g. a missing sudoers rule */
  shutdownError?: string | null;
  /** Whether it can record the camera during jobs (`/api/recordings`) */
  recordings?: boolean;
  /** The daily backup of its database: the newest file, how many are kept, why the last run failed (null: off) */
  backup?: { last: string | null; count: number; error: string | null } | null;
}

export type RecordingMode = 'timelapse' | 'video' | 'both';

/** A recording on the companion (apps/companion/src/recorder.ts). */
export interface Recording {
  id: string;
  jobName: string;
  mode: RecordingMode;
  intervalSeconds: number;
  safeHeightOnly: boolean;
  startedAt: number;
  endedAt: number | null;
  state: 'recording' | 'encoding' | 'done' | 'failed';
  stopReason: 'app' | 'idle' | 'max-duration' | 'disk' | 'interrupted' | 'error' | null;
  frames: number;
  video: { name: string; size: number } | null;
  timelapse: { name: string; size: number } | null;
  error: string | null;
}

export interface RecordingList {
  capabilities: { ffmpeg: boolean; hwEncoder: boolean; observe: boolean };
  active: Recording | null;
  recordings: Recording[];
}

export interface RecordingRequest {
  mode: RecordingMode;
  intervalSeconds: number;
  jobName: string;
  safeHeightOnly: boolean;
  safeZ: number | null;
}

/** Error from the companion with its HTTP status and error code. */
export class CompanionError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
  ) {
    super(`HTTP ${status}`);
  }
}

/** `pi.local:8080`, `192.168.1.5` or a full URL → `http://host:port`. */
export function companionBase(input: string): string | null {
  const text = input.trim().replace(/\/+$/, '');
  if (text === '') return null;
  if (/^https?:\/\//i.test(text)) return text;
  return `http://${text.includes(':') ? text : `${text}:8080`}`;
}

/**
 * The camera address a companion advertises: `:8081/stream` is a port on the
 * companion's own host, `/stream` a path on the companion, anything else is
 * taken as it is.
 */
export function resolveCameraUrl(base: string, advertised: string): string {
  if (advertised.startsWith(':'))
    return `${new URL(base).protocol}//${new URL(base).hostname}${advertised}`;
  if (advertised.startsWith('/')) return `${base}${advertised}`;
  return advertised;
}

/** WebSocket address of the companion's FluidNC relay. */
export function relayUrl(base: string): string {
  return `${base.replace(/^http/i, 'ws')}/fluidnc`;
}

export function sensorStreamUrl(base: string): string {
  return `${base.replace(/^http/i, 'ws')}/api/sensors/stream`;
}

/** What the companion keeps of the machine's state: a document per key with the revision it was written at. */
export interface StateSnapshot {
  keys: Record<string, { rev: number; data: unknown }>;
}

/** The answer to a write: it went in (`rev` is the new revision), or the state had moved on (the current one). */
export type StatePut = { ok: true; rev: number } | { ok: false; rev: number; data: unknown };

export class CompanionClient {
  constructor(
    readonly base: string,
    private readonly fetchFn: typeof fetch = (...args) => fetch(...args),
  ) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetchFn(`${this.base}${path}`, init);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
      throw new CompanionError(
        response.status,
        typeof body?.error === 'string' ? body.error : null,
      );
    }
    return (await response.json()) as T;
  }

  /** `timeoutMs` gives up on a host that vanished without closing the connection. */
  health(timeoutMs?: number): Promise<CompanionHealth> {
    return this.request(
      '/api/health',
      timeoutMs === undefined ? undefined : { signal: AbortSignal.timeout(timeoutMs) },
    );
  }

  /**
   * A file of FluidNC's flash, byte for byte (blank lines and all), read by the
   * companion: FluidNC serves it without CORS, so the page cannot ask it itself.
   */
  async fluidncFile(name: string, timeoutMs = 8000): Promise<string> {
    const response = await this.fetchFn(
      `${this.base}/api/fluidnc/files/${encodeURIComponent(name)}`,
      { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' },
    );
    if (!response.ok) throw new CompanionError(response.status, null);
    return response.text();
  }

  /** Powers the companion's host down; it answers first, then shuts down. */
  shutdown(): Promise<unknown> {
    return this.request('/api/system/shutdown', { method: 'POST' });
  }

  /** The documents of the state (`/api/state`); an older companion answers 404. */
  state(timeoutMs = 8000): Promise<StateSnapshot> {
    return this.request('/api/state', {
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
  }

  /** Writes a document made from revision `baseRev`; a state that has moved on is refused with the current one. */
  async putState(key: string, baseRev: number, data: object, timeoutMs = 8000): Promise<StatePut> {
    const response = await this.fetchFn(`${this.base}/api/state/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseRev, data }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = (await response.json().catch(() => null)) as {
      rev?: unknown;
      data?: unknown;
      error?: unknown;
    } | null;
    if (response.status === 409 && typeof body?.rev === 'number') {
      return { ok: false, rev: body.rev, data: body.data };
    }
    if (!response.ok || typeof body?.rev !== 'number') {
      throw new CompanionError(
        response.status,
        typeof body?.error === 'string' ? body.error : null,
      );
    }
    return { ok: true, rev: body.rev };
  }

  list<T>(collection: string): Promise<T[]> {
    return this.request(`/api/library/${collection}`);
  }

  put(collection: string, doc: { id: string }): Promise<unknown> {
    return this.request(`/api/library/${collection}/${encodeURIComponent(doc.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(doc),
    });
  }

  putAll(collection: string, docs: readonly { id: string }[]): Promise<unknown> {
    return this.request(`/api/library/${collection}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(docs),
    });
  }

  remove(collection: string, id: string): Promise<unknown> {
    return this.request(`/api/library/${collection}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  notify(event: string, title: string, message: string): Promise<{ sent: boolean }> {
    return this.request('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, title, message }),
    });
  }

  notifySettings(): Promise<{ kind: 'off' | 'ntfy' | 'webhook'; url: string; events: string[] }> {
    return this.request('/api/notify');
  }

  setNotifySettings(settings: { kind: string; url: string; events: string[] }): Promise<unknown> {
    return this.request('/api/notify', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
  }

  recordings(): Promise<RecordingList> {
    return this.request('/api/recordings');
  }

  startRecording(request: RecordingRequest): Promise<Recording> {
    return this.request('/api/recordings/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  }

  stopRecording(): Promise<Recording> {
    return this.request('/api/recordings/stop', { method: 'POST' });
  }

  removeRecording(id: string): Promise<unknown> {
    return this.request(`/api/recordings/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  /** Address of a recording's video, for a `<video>` or a download link. */
  recordingUrl(id: string, kind: 'video' | 'timelapse', download = false): string {
    return `${this.base}/api/recordings/${encodeURIComponent(id)}/file?kind=${kind}${download ? '&download=1' : ''}`;
  }

  saveJob(name: string, text: string): Promise<unknown> {
    return this.request(`/api/jobs/${encodeURIComponent(name)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: text,
    });
  }

  jobs(): Promise<{ name: string; size: number; uploadedAt: number }[]> {
    return this.request('/api/jobs');
  }

  async job(name: string): Promise<string> {
    const response = await this.fetchFn(`${this.base}/api/jobs/${encodeURIComponent(name)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  }
}
