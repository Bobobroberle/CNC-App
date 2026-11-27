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
  /** What is running: the time of its commit in seconds (a newer build is a larger number) and the commit */
  build?: number;
  commit?: string;
  /** It has a login (`/api/auth`); an older companion has none */
  auth?: boolean;
  /** The update from the app can be done here (the Pi was set up with the layout of releases) */
  update?: boolean;
  /** The camera's picture settings can be read and set here (`/api/camera/controls`); an older companion has no such field */
  cameraControls?: boolean;
}

/** A setting of the USB camera as the camera reports it (`GET /api/camera/controls`): ranges and menus are the camera's own. */
export interface CameraControl {
  name: string;
  type: 'int' | 'bool' | 'menu';
  min: number;
  max: number;
  step: number;
  default: number;
  value: number;
  /** The camera does not act on it now (the exposure time while auto exposure is on) */
  inactive: boolean;
  readOnly: boolean;
  menu?: { value: number; label: string }[];
}

/** What became of one control of a write: taken (with the value the camera reads back) or refused with `refused:<why>`. */
export type CameraControlResult =
  | { ok: true; value: number }
  | { ok: false; error: string; detail?: string };

/** The answer to a write: the list read again afterwards (the camera's answer is the truth) and a result per control. */
export interface CameraControlsAnswer {
  controls: CameraControl[];
  results: Record<string, CameraControlResult>;
}

/** A device that is logged in at the Pi. */
export interface PiDevice {
  id: string;
  name: string;
  createdAt: number;
  lastSeen: number;
  current: boolean;
}

/** What the companion says about its version and the update (`GET /api/update`). */
export interface UpdateStatus {
  enabled: boolean;
  running: { name: string | null; version: string; build: number; commit: string };
  previous: { name: string; version: string; build: number; commit: string } | null;
  setupLevel: number | null;
  last: {
    result: 'pending' | 'ok' | 'rolled-back' | 'rolled-back-by-hand';
    name?: string;
    from?: string;
    at: number;
    detail?: string;
  } | null;
  trial: boolean;
  staged: StagedUpdate | null;
  /** Why an update must not happen now (`machine-connected`, `recording`), or null */
  busy: string | null;
}

/** A version that was uploaded and waits to be put in place. */
export interface StagedUpdate {
  id: string;
  release: { version: string; build: number; commit: string; setupLevel: number };
  sha256: string;
  files: number;
  at: number;
  newer: boolean;
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
    /** What more the companion said (the checksum it computed, why it is busy), if anything */
    readonly detail: string | null = null,
    /** Seconds to wait (a login that was refused for too many tries) */
    readonly retryAfter: number | null = null,
  ) {
    super(`HTTP ${status}`);
  }
}

/** The error a refused answer makes: its status, its code, and what the companion said besides. */
async function refusal(response: Response): Promise<CompanionError> {
  const body = (await response.json().catch(() => null)) as {
    error?: unknown;
    detail?: unknown;
    retryAfter?: unknown;
  } | null;
  return new CompanionError(
    response.status,
    typeof body?.error === 'string' ? body.error : null,
    typeof body?.detail === 'string' ? body.detail : null,
    typeof body?.retryAfter === 'number' ? body.retryAfter : null,
  );
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
    /** The token of this device's login at this companion (sent with every request – the open ones ignore it) */
    private readonly token: string | null = null,
    /** Called when the Pi refuses the token: the login is over (another device removed it, or the Pi was set up anew) */
    private readonly onUnauthorized: (() => void) | null = null,
  ) {}

  /** `init` with the login added where there is one. */
  private withLogin(init?: RequestInit): RequestInit | undefined {
    if (!this.token) return init;
    const headers = {
      ...(init?.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${this.token}`,
    };
    return { ...init, headers };
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetchFn(`${this.base}${path}`, this.withLogin(init));
    if (!response.ok) {
      // A token that is sent and refused is dead: whoever holds it must not keep showing "logged in"
      if (response.status === 401 && this.token) this.onUnauthorized?.();
      throw await refusal(response);
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

  /** Logs in with the Pi code; the token is what the app keeps (never the code). */
  async login(
    code: string,
    name: string,
  ): Promise<{ token: string; device: { id: string; name: string } }> {
    // Not through `request`: a login has no token yet, and a wrong code must come out as the error it is
    const response = await this.fetchFn(`${this.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, name }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw await refusal(response);
    return (await response.json()) as { token: string; device: { id: string; name: string } };
  }

  /** Who this token belongs to; a token the Pi does not know (removed, or another Pi) answers 401. */
  me(): Promise<{ device: { id: string; name: string } }> {
    return this.request('/api/auth/me', { signal: AbortSignal.timeout(8000) });
  }

  logout(): Promise<unknown> {
    return this.request('/api/auth/logout', { method: 'POST' });
  }

  async devices(): Promise<PiDevice[]> {
    return (await this.request<{ devices: PiDevice[] }>('/api/auth/devices')).devices;
  }

  removeDevice(id: string): Promise<unknown> {
    return this.request(`/api/auth/devices/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  async piCode(): Promise<string> {
    return (await this.request<{ code: string }>('/api/auth/code')).code;
  }

  /** A new Pi code (the old one stops working); `revokeOthers` also takes every other device off. */
  renewPiCode(revokeOthers: boolean): Promise<{ code: string; revoked: number }> {
    return this.request('/api/auth/code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revokeOthers }),
    });
  }

  updateStatus(): Promise<UpdateStatus> {
    return this.request('/api/update', { signal: AbortSignal.timeout(8000), cache: 'no-store' });
  }

  /** Hands the zip to the Pi; it checks it (and the checksum, if given) and waits for `applyUpdate`. */
  uploadUpdate(file: Blob, sha256?: string): Promise<StagedUpdate> {
    const query = sha256 ? `?sha256=${encodeURIComponent(sha256)}` : '';
    return this.request(`/api/update/upload${query}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/zip' },
      body: file,
      signal: AbortSignal.timeout(120_000),
    });
  }

  applyUpdate(
    id: string,
    allowOlder: boolean,
  ): Promise<{ ok: true; name: string; release: { build: number } }> {
    return this.request('/api/update/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, allowOlder }),
      // The Pi copies its database first (up to ten minutes where the disk is slow) and tries the new version: a
      // client that gave up sooner would call a running update a failure
      signal: AbortSignal.timeout(12 * 60_000),
    });
  }

  rollbackUpdate(): Promise<{ ok: true; name: string }> {
    return this.request('/api/update/rollback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(60_000),
    });
  }

  discardUpdate(): Promise<unknown> {
    return this.request('/api/update/staged', { method: 'DELETE' });
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

  /** The camera's picture settings, read from the camera now (the companion runs `v4l2-ctl` – up to 3 s a call). */
  async cameraControls(): Promise<CameraControl[]> {
    return (
      await this.request<{ controls: CameraControl[] }>('/api/camera/controls', {
        signal: AbortSignal.timeout(10_000),
        cache: 'no-store',
      })
    ).controls;
  }

  /**
   * Sets picture settings (`name → whole number`). Every value is checked by the companion against what the
   * camera reports; a refusal of one control is in `results`, not an error. Longer time limit than a read: a
   * switch (auto exposure) is set, the list read again, and only then the rest.
   */
  setCameraControls(controls: Record<string, number>): Promise<CameraControlsAnswer> {
    return this.request('/api/camera/controls', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ controls }),
      signal: AbortSignal.timeout(30_000),
    });
  }

  /** `timeoutMs` (here and in `put`, `putAll`) gives up on a Pi that stops answering half-way: a round must not wait for ever. */
  list<T>(collection: string, timeoutMs?: number): Promise<T[]> {
    return this.request(
      `/api/library/${collection}`,
      timeoutMs === undefined ? undefined : { signal: AbortSignal.timeout(timeoutMs) },
    );
  }

  put(collection: string, doc: { id: string }, timeoutMs?: number): Promise<unknown> {
    return this.request(`/api/library/${collection}/${encodeURIComponent(doc.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(doc),
      ...(timeoutMs === undefined ? {} : { signal: AbortSignal.timeout(timeoutMs) }),
    });
  }

  putAll(
    collection: string,
    docs: readonly { id: string }[],
    timeoutMs?: number,
  ): Promise<unknown> {
    return this.request(`/api/library/${collection}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(docs),
      ...(timeoutMs === undefined ? {} : { signal: AbortSignal.timeout(timeoutMs) }),
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
