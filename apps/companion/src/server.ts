import { createReadStream, existsSync } from 'node:fs';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { validateJig, validateMaterial, validateSavedZero, validateTool } from '@lowrider/workshop';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Store } from './db';
import {
  DEFAULT_NOTIFY,
  sendNotification,
  validateNotifySettings,
  type NotifyEvent,
} from './notify';
import { Recorder, RecorderError, validateStart } from './recorder';
import { FluidNCRelay, type RelayClient } from './relay';
import { SensorHub, validateSample } from './sensors';
import type { BackupStatus } from './backup';
import { isStateKey, readWrite, STATE_KEYS, type StateDocument } from './state';

export const VERSION = '0.1.0';

/** Library collections and how their documents are checked. */
const hasId = (v: unknown) =>
  typeof v === 'object' && v !== null && typeof (v as { id?: unknown }).id === 'string' ? v : null;
export const COLLECTIONS: Record<string, (v: unknown) => unknown> = {
  tools: validateTool,
  materials: validateMaterial,
  zeros: validateSavedZero,
  jigs: validateJig,
  macros: hasId,
  history: hasId,
  learning: hasId,
  profiles: hasId,
  heightmaps: hasId,
  fixtures: hasId,
  // What was measured, one entry each (a log, like the history)
  measurements: hasId,
};

const SAFE_NAME = /^[\w][\w .-]{0,99}$/;
const NOTIFY_EVENTS: NotifyEvent[] = ['job-done', 'job-failed', 'alarm', 'tool-change', 'test'];

export interface ServerOptions {
  store: Store;
  /** Built app (apps/control/dist) to serve at / */
  staticDir?: string;
  /** FluidNC WebSocket, e.g. ws://fluidnc.local:81 */
  fluidncUrl?: string;
  /**
   * Camera stream the app should use, e.g. `http://pi.local:8081/stream`, or
   * `:8081/stream` for a port on the companion's own host.
   */
  cameraUrl?: string;
  relay?: FluidNCRelay;
  sensors?: SensorHub;
  fetch?: typeof fetch;
  logger?: boolean;
  /**
   * Powers the host down (the Pi). Called shortly after the reply so the app still
   * receives the acknowledgement; without it the route answers 501. A rejection is
   * reported in /api/health as `shutdownError`, so the app can stop waiting.
   */
  shutdown?: () => void | Promise<void>;
  /** Delay between the reply and `shutdown`, in ms (default 500). */
  shutdownDelayMs?: number;
  /** Camera recording during jobs; without it the recording routes answer 501. */
  recorder?: Recorder;
  /** What the daily backup of the database did last (null: switched off, or not yet run) */
  backup?: () => BackupStatus | null;
}

/** Parses a single-range `Range: bytes=a-b` header against a file size. */
export function parseRange(header: string | undefined, size: number): [number, number] | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header ?? '');
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start: number;
  let end: number;
  if (m[1] === '') {
    // Suffix: the last n bytes
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  return start <= end && start < size ? [start, end] : null;
}

export async function buildServer(options: ServerOptions): Promise<FastifyInstance> {
  const { store } = options;
  const sensors = options.sensors ?? new SensorHub();
  const relay = options.relay ?? (options.fluidncUrl ? new FluidNCRelay(options.fluidncUrl) : null);
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 64 * 1024 * 1024 });
  let shutdownError: string | null = null;

  // The app may be opened from file:// or the board's address; the workshop network is trusted.
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type');
    if (request.method === 'OPTIONS') return reply.code(204).send();
  });
  app.addContentTypeParser(
    ['text/plain', 'application/octet-stream'],
    { parseAs: 'buffer' },
    (_req, body, done) => done(null, body),
  );

  await app.register(fastifyWebsocket);

  app.get('/api/health', async () => ({
    ok: true,
    version: VERSION,
    fluidnc: relay
      ? {
          url: relay.url,
          connected: relay.connected,
          clients: relay.clientCount,
          lastFailure: relay.lastFailure,
        }
      : null,
    sensors: sensors.current.source,
    camera: options.cameraUrl || null,
    shutdown: Boolean(options.shutdown),
    shutdownError,
    // Only true when it can really record (ffmpeg on the Pi).
    recordings: options.recorder ? (await options.recorder.capabilities()).ffmpeg : false,
    backup: options.backup?.() ?? null,
    // The state documents (`/api/state`): an older companion has none, the app then keeps its state here only.
    state: true,
  }));

  // Host power: the app shows feedback by polling /api/health until it stops answering.
  app.post('/api/system/shutdown', async (_req, reply) => {
    const { shutdown } = options;
    if (!shutdown) return reply.code(501).send({ error: 'not-supported' });
    shutdownError = null;
    setTimeout(() => {
      Promise.resolve()
        .then(shutdown)
        .catch((e: unknown) => {
          shutdownError = e instanceof Error ? e.message : String(e);
        });
    }, options.shutdownDelayMs ?? 500);
    return { ok: true };
  });

  // Libraries
  app.get<{ Params: { collection: string } }>('/api/library/:collection', async (req, reply) => {
    if (!(req.params.collection in COLLECTIONS))
      return reply.code(404).send({ error: 'unknown-collection' });
    return store.list(req.params.collection).map((d) => d.data);
  });
  app.get<{ Params: { collection: string; id: string } }>(
    '/api/library/:collection/:id',
    async (req, reply) => {
      if (!(req.params.collection in COLLECTIONS))
        return reply.code(404).send({ error: 'unknown-collection' });
      const doc = store.get(req.params.collection, req.params.id);
      return doc ? doc.data : reply.code(404).send({ error: 'not-found' });
    },
  );
  app.put<{ Params: { collection: string; id: string }; Body: unknown }>(
    '/api/library/:collection/:id',
    async (req, reply) => {
      const validate = COLLECTIONS[req.params.collection];
      if (!validate) return reply.code(404).send({ error: 'unknown-collection' });
      const doc = validate(req.body) as { id: string } | null;
      if (!doc || doc.id !== req.params.id)
        return reply.code(400).send({ error: 'invalid-document' });
      store.put(req.params.collection, doc.id, doc);
      return { ok: true };
    },
  );
  app.post<{ Params: { collection: string }; Body: unknown }>(
    '/api/library/:collection',
    async (req, reply) => {
      const validate = COLLECTIONS[req.params.collection];
      if (!validate) return reply.code(404).send({ error: 'unknown-collection' });
      if (!Array.isArray(req.body)) return reply.code(400).send({ error: 'expected-array' });
      const docs = req.body.map(validate) as ({ id: string } | null)[];
      const bad = docs.findIndex((d) => d === null);
      if (bad >= 0) return reply.code(400).send({ error: 'invalid-document', index: bad });
      store.transaction(() => {
        for (const d of docs) store.put(req.params.collection, d!.id, d);
      });
      return { ok: true, count: docs.length };
    },
  );
  app.delete<{ Params: { collection: string; id: string } }>(
    '/api/library/:collection/:id',
    async (req, reply) => {
      if (!(req.params.collection in COLLECTIONS))
        return reply.code(404).send({ error: 'unknown-collection' });
      return store.delete(req.params.collection, req.params.id)
        ? { ok: true }
        : reply.code(404).send({ error: 'not-found' });
    },
  );

  // State: what belongs to the machine, one document per key, written only from the revision read
  app.get('/api/state', async () => {
    const keys: Record<string, StateDocument> = {};
    for (const key of STATE_KEYS) {
      const doc = store.get('state', key);
      if (doc) keys[key] = doc.data as StateDocument;
    }
    return { keys };
  });
  app.put<{ Params: { key: string }; Body: unknown }>('/api/state/:key', async (req, reply) => {
    if (!isStateKey(req.params.key)) return reply.code(404).send({ error: 'unknown-key' });
    const write = readWrite(req.body);
    if (write === 'too-large') return reply.code(413).send({ error: 'too-large' });
    if (write === 'invalid') return reply.code(400).send({ error: 'invalid-document' });
    // No `await` between the read and the write: nobody else can write in between.
    const current = store.get('state', req.params.key)?.data as StateDocument | undefined;
    const rev = current?.rev ?? 0;
    if (write.baseRev !== rev) {
      return reply.code(409).send({ error: 'conflict', rev, data: current?.data ?? null });
    }
    store.put('state', req.params.key, { rev: rev + 1, data: write.data } satisfies StateDocument);
    return { ok: true, rev: rev + 1 };
  });

  // Job buffer
  app.get('/api/jobs', async () => store.listJobs());
  app.get<{ Params: { name: string } }>('/api/jobs/:name', async (req, reply) => {
    const content = store.getJob(req.params.name);
    if (!content) return reply.code(404).send({ error: 'not-found' });
    return reply.type('text/plain; charset=utf-8').send(Buffer.from(content));
  });
  app.put<{ Params: { name: string }; Body: Buffer }>('/api/jobs/:name', async (req, reply) => {
    if (!SAFE_NAME.test(req.params.name)) return reply.code(400).send({ error: 'invalid-name' });
    if (!Buffer.isBuffer(req.body)) return reply.code(415).send({ error: 'expected-text' });
    store.putJob(req.params.name, req.body);
    return { ok: true, size: req.body.length };
  });
  app.delete<{ Params: { name: string } }>('/api/jobs/:name', async (req, reply) =>
    store.deleteJob(req.params.name) ? { ok: true } : reply.code(404).send({ error: 'not-found' }),
  );

  // Notifications
  app.get('/api/notify', async () => store.getSetting('notify', DEFAULT_NOTIFY));
  app.put<{ Body: unknown }>('/api/notify', async (req, reply) => {
    const settings = validateNotifySettings(req.body);
    if (!settings) return reply.code(400).send({ error: 'invalid-settings' });
    store.setSetting('notify', settings);
    return { ok: true };
  });
  app.post<{ Body: { event?: unknown; title?: unknown; message?: unknown } }>(
    '/api/notify',
    async (req, reply) => {
      const { event, title, message } = req.body ?? {};
      if (
        !NOTIFY_EVENTS.includes(event as NotifyEvent) ||
        typeof title !== 'string' ||
        typeof message !== 'string'
      ) {
        return reply.code(400).send({ error: 'invalid-notification' });
      }
      try {
        const sent = await sendNotification(
          store.getSetting('notify', DEFAULT_NOTIFY),
          { event: event as NotifyEvent, title, message },
          options.fetch,
        );
        return { sent };
      } catch (e) {
        return reply.code(502).send({ error: 'notify-failed', detail: (e as Error).message });
      }
    },
  );

  // Sensors
  app.get('/api/sensors', async () => sensors.current);
  app.post<{ Body: unknown }>('/api/sensors', async (req, reply) => {
    const sample = validateSample(req.body);
    if (!sample) return reply.code(400).send({ error: 'invalid-sample' });
    return sensors.push(sample);
  });
  app.get('/api/sensors/stream', { websocket: true }, (socket) => {
    socket.send(JSON.stringify(sensors.current));
    const off = sensors.subscribe((s) => socket.send(JSON.stringify(s)));
    socket.on('close', off);
  });

  // Camera recording during jobs
  const { recorder } = options;
  if (recorder && relay) {
    // The recorder watches the machine through the relay as a client of its own,
    // so it still sees the job end when every tablet has gone to sleep.
    recorder.setObserver({
      get connected() {
        return relay.connected;
      },
      listen(onText) {
        let listening = true;
        let retry: ReturnType<typeof setTimeout> | null = null;
        const client: RelayClient = {
          send: (data) => onText(typeof data === 'string' ? data : new TextDecoder().decode(data)),
          // FluidNC went away: keep trying while the recording runs.
          close: () => {
            if (listening)
              retry = setTimeout(() => listening && relay.attach(client, { observer: true }), 5000);
          },
        };
        relay.attach(client, { observer: true });
        return () => {
          listening = false;
          if (retry) clearTimeout(retry);
          relay.detach(client);
        };
      },
      send: (text) => relay.fromClient(text),
    });
  }
  const noRecorder = (reply: { code(n: number): { send(b: unknown): unknown } }) =>
    reply.code(501).send({ error: 'not-supported' });
  app.get('/api/recordings', async (_req, reply) => {
    if (!recorder) return noRecorder(reply);
    return {
      capabilities: await recorder.capabilities(),
      active: recorder.current,
      recordings: await recorder.list(),
    };
  });
  app.post<{ Body: unknown }>('/api/recordings/start', async (req, reply) => {
    if (!recorder) return noRecorder(reply);
    const request = validateStart(req.body);
    if (!request) return reply.code(400).send({ error: 'invalid-request' });
    try {
      return reply.code(201).send(await recorder.start(request));
    } catch (e) {
      if (!(e instanceof RecorderError)) throw e;
      const status = { 'no-ffmpeg': 501, 'already-recording': 409, 'disk-full': 507 }[
        e.code as 'no-ffmpeg' | 'already-recording' | 'disk-full'
      ];
      return reply.code(status).send({ error: e.code });
    }
  });
  app.post('/api/recordings/stop', async (_req, reply) => {
    if (!recorder) return noRecorder(reply);
    try {
      return await recorder.stop('app');
    } catch (e) {
      if (!(e instanceof RecorderError)) throw e;
      return reply.code(404).send({ error: e.code });
    }
  });
  app.get<{ Params: { id: string }; Querystring: { kind?: string; download?: string } }>(
    '/api/recordings/:id/file',
    async (req, reply) => {
      if (!recorder) return noRecorder(reply);
      const kind = req.query.kind === 'video' ? 'video' : 'timelapse';
      const file = await recorder.file(req.params.id, kind);
      if (!file) return reply.code(404).send({ error: 'not-found' });
      reply.header('Accept-Ranges', 'bytes').type('video/mp4');
      if (req.query.download) {
        reply.header('Content-Disposition', `attachment; filename="${req.params.id}-${kind}.mp4"`);
      }
      const range = req.headers.range;
      if (range) {
        const r = parseRange(range, file.size);
        if (!r) {
          return reply.code(416).header('Content-Range', `bytes */${file.size}`).send();
        }
        reply
          .code(206)
          .header('Content-Range', `bytes ${r[0]}-${r[1]}/${file.size}`)
          .header('Content-Length', r[1] - r[0] + 1);
        return reply.send(createReadStream(file.path, { start: r[0], end: r[1] }));
      }
      reply.header('Content-Length', file.size);
      return reply.send(createReadStream(file.path));
    },
  );
  app.delete<{ Params: { id: string } }>('/api/recordings/:id', async (req, reply) => {
    if (!recorder) return noRecorder(reply);
    const r = await recorder.remove(req.params.id);
    if (r === 'active') return reply.code(409).send({ error: 'active' });
    if (r === 'not-found') return reply.code(404).send({ error: 'not-found' });
    return { ok: true };
  });

  // A file from FluidNC's flash, byte for byte (FluidNC serves it at /<name> without CORS,
  // so the app cannot read it itself). The app changes single values of config.yaml with it.
  app.get<{ Params: { name: string } }>('/api/fluidnc/files/:name', async (req, reply) => {
    if (!relay) return reply.code(404).send({ error: 'no-relay' });
    const { name } = req.params;
    if (!/^[\w][\w.-]{0,63}$/.test(name)) return reply.code(400).send({ error: 'bad-name' });
    const host = new URL(relay.url).hostname;
    try {
      const res = await (options.fetch ?? fetch)(`http://${host}/${name}`, {
        signal: AbortSignal.timeout(5000),
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (res.status === 404) return reply.code(404).send({ error: 'not-found' });
      if (!res.ok) return reply.code(502).send({ error: 'fluidnc', status: res.status });
      reply.header('Cache-Control', 'no-store');
      return reply.type('text/plain; charset=utf-8').send(Buffer.from(await res.arrayBuffer()));
    } catch {
      return reply.code(502).send({ error: 'unreachable' });
    }
  });

  // FluidNC relay
  app.get('/fluidnc', { websocket: true }, (socket) => {
    if (!relay) {
      socket.close(1011, 'No FluidNC address configured');
      return;
    }
    const client = {
      send: (data: string | Uint8Array, o: { binary: boolean }) => socket.send(data, o),
      close: (code?: number, reason?: string) => socket.close(code, reason),
    };
    relay.attach(client);
    socket.on('message', (data: Buffer, isBinary: boolean) =>
      relay.fromClient(isBinary ? new Uint8Array(data) : data.toString('utf8'), client),
    );
    socket.on('close', () => relay.detach(client));
  });

  if (options.staticDir && existsSync(options.staticDir)) {
    await app.register(fastifyStatic, { root: options.staticDir });
  }
  return app;
}
