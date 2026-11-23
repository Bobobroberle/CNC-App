// Belege fuer Teil 4 (Sicherheit am Geraet). Nur LESEND gegen den Projektbaum:
// Quellcode wird per absolutem Pfad importiert, im Projekt wird nichts veraendert.
// Start (vom Scratchpad aus):
//   <projekt>/apps/control/node_modules/.bin/vitest run --config <dieses Verzeichnis>/vitest.config.ts
import { FluidNCRelay } from '/tmp/claude-0/-home-user-CNC-App/1ce98923-8f91-56af-9afb-756f81efa0a2/scratchpad/src/cnc-steuerung/apps/companion/src/relay';
import { FluidNCConnection } from '/tmp/claude-0/-home-user-CNC-App/1ce98923-8f91-56af-9afb-756f81efa0a2/scratchpad/src/cnc-steuerung/packages/fluidnc-client/src/index';
import { releaseAllHolds } from '/tmp/claude-0/-home-user-CNC-App/1ce98923-8f91-56af-9afb-756f81efa0a2/scratchpad/src/cnc-steuerung/apps/control/src/lib/holds';
import { jogHold, jogStop } from '/tmp/claude-0/-home-user-CNC-App/1ce98923-8f91-56af-9afb-756f81efa0a2/scratchpad/src/cnc-steuerung/apps/control/src/store/jog';
import { startKeys } from '/tmp/claude-0/-home-user-CNC-App/1ce98923-8f91-56af-9afb-756f81efa0a2/scratchpad/src/cnc-steuerung/apps/control/src/store/keys';
import { useJob } from '/tmp/claude-0/-home-user-CNC-App/1ce98923-8f91-56af-9afb-756f81efa0a2/scratchpad/src/cnc-steuerung/apps/control/src/store/job';
import { currentParts, useRun } from '/tmp/claude-0/-home-user-CNC-App/1ce98923-8f91-56af-9afb-756f81efa0a2/scratchpad/src/cnc-steuerung/apps/control/src/store/run';
import { useWorkshop } from '/tmp/claude-0/-home-user-CNC-App/1ce98923-8f91-56af-9afb-756f81efa0a2/scratchpad/src/cnc-steuerung/apps/control/src/store/workshop';
import { useMachine } from '/tmp/claude-0/-home-user-CNC-App/1ce98923-8f91-56af-9afb-756f81efa0a2/scratchpad/src/cnc-steuerung/apps/control/src/store/machine';

const tick = (ms = 15) => new Promise<void>((r) => setTimeout(r, ms));
const text = (d: string | Uint8Array) =>
  typeof d === 'string' ? d : `0x${[...d].map((b) => b.toString(16)).join('')}`;

/** Ein WebSocket-Double, das wie FluidNC antwortet: '?' -> Status; $I/$G/$#/$SD/List -> ok; Rest: still. */
class Sock {
  static all: Sock[] = [];
  binaryType = 'blob';
  readyState = 0;
  sent: (string | Uint8Array)[] = [];
  okAll = false;
  onopen: ((e: unknown) => void) | null = null;
  onclose: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  constructor(readonly url: string) {
    Sock.all.push(this);
    queueMicrotask(() => {
      this.readyState = 1;
      this.onopen?.({});
    });
  }
  send(d: string | Uint8Array) {
    this.sent.push(d);
    if (d === '?') this.onmessage?.({ data: '<Idle|MPos:0.000,0.000,0.000|FS:0,0>\n' });
    else if (typeof d === 'string' && /^\$(I|G|#|SD\/List)\n$/.test(d))
      this.onmessage?.({ data: 'ok\n' });
    else if (this.okAll && typeof d === 'string' && d.endsWith('\n') && !d.startsWith('$SD/Run'))
      this.onmessage?.({ data: 'ok\n' });
  }
  close() {
    this.drop(1000);
  }
  drop(code = 1006) {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.({ code, reason: '' });
  }
  emit(t: string) {
    this.onmessage?.({ data: t });
  }
  lines() {
    return this.sent.filter((d): d is string => typeof d === 'string' && d.endsWith('\n')).map((d) => d.slice(0, -1));
  }
  realtime() {
    return this.sent.filter((d) => !(typeof d === 'string' && d.endsWith('\n')) && d !== '?').map(text);
  }
}
const last = () => Sock.all[Sock.all.length - 1]!;

async function connected() {
  (globalThis as { WebSocket?: unknown }).WebSocket = Sock;
  Sock.all = [];
  const m = useMachine.getState();
  m.disconnect();
  useMachine.setState({ fileJob: null, stream: null, lostInJob: null, log: [], lastFileResult: null });
  m.setUrl('192.168.0.200');
  await useMachine.getState().connect();
  await tick(30); // $I, $G, $# werden von der App beantwortet
  expect(useMachine.getState().connection).toBe('connected');
  return last();
}

afterEach(() => {
  useMachine.getState().disconnect();
});

describe('3. Wer streamt? Verbindungsabbruch im Job', () => {
  it('SD-Job ($SD/Run): die App sendet danach nichts mehr; kritische Meldung mit sd=true', async () => {
    const s = await connected();
    void useMachine.getState().runSdFile('schild.nc');
    await tick();
    expect(s.lines()).toContain('$SD/Run=/schild.nc');
    s.drop(1006);
    const st = useMachine.getState();
    expect(st.lostInJob).toMatchObject({ name: 'schild.nc', sd: true });
    expect(s.realtime()).toEqual([]); // nie ! / 0x18 / 0x85 gesendet
  });

  it('Browser-Streaming: Abbruch -> Streamer "aborted"; WAS sagt die App? (lostInJob?)', async () => {
    const s = await connected();
    const lines = ['M3 S18000', ...Array.from({ length: 60 }, (_, i) => `G1 X${i + 1} F1000`)];
    expect(useMachine.getState().streamJob('t.nc', lines.join('\n'))).toBe(true);
    const sentBefore = s.lines().filter((l) => !l.startsWith('$'));
    const inFlightBytes = sentBefore.reduce((n, l) => n + l.length + 1, 0);
    console.log('STREAM: Zeilen im Steuerungspuffer beim Abbruch:', sentBefore.length, '(', inFlightBytes, 'Byte )');
    expect(useMachine.getState().stream?.result).toBe('running');
    s.drop(1006);
    const st = useMachine.getState();
    console.log('STREAM nach Abbruch: result =', st.stream?.result, '| lostInJob =', JSON.stringify(st.lostInJob),
      '| link.lostDuringJob =', st.link.lostDuringJob);
    console.log('STREAM Log (error):', st.log.filter((l) => l.kind === 'error').map((l) => `${l.key}: ${l.text}`));
    expect(s.realtime()).toEqual([]); // kein Feed-Hold, kein Reset, kein M5
    expect(s.lines().some((l) => l === 'M5')).toBe(false);
    expect(st.stream?.result).toBe('aborted');
    // BEFUND-Pruefung: die rote "kritische" Meldung (CriticalLayer) haengt an lostInJob:
    console.log('STREAM: kritische Meldung (lostInJob) gesetzt?', st.lostInJob !== null);
    expect(st.lostInJob).toBeNull(); // BEFUND B1: keine rote kritische Meldung beim Stream-Abbruch
    expect(st.link.lostDuringJob).toBe(true); // das Latch (kein Auto-Reconnect) wird dagegen gesetzt
  });
});

describe('2b. Jog-Dauerfahrt und Verbindungsabbruch', () => {
  it('Dauerfahrt nicht referenziert: eine relative Fahrt ueber den ganzen Verfahrweg; nach Abbruch kein Cancel moeglich', async () => {
    const s = await connected();
    const release = jogHold('Y', 1);
    expect(release).not.toBeNull();
    const jog = s.lines().find((l) => l.startsWith('$J='));
    console.log('JOG gesendet:', jog);
    s.drop(1006);
    expect(s.realtime()).toEqual([]); // 0x85 ging nicht raus (und kann nicht mehr)
    expect(() => releaseAllHolds()).not.toThrow(); // danach: still ohne Wirkung
    const mm = Number(/Y(-?[\d.]+)/.exec(jog!)![1]);
    const feed = Number(/F(\d+)/.exec(jog!)![1]);
    console.log(`JOG: ${mm} mm bei ${feed} mm/min = ${((mm / feed) * 60).toFixed(0)} s Fahrt ohne Gegenstelle`);
  });

  it('Socket tot, aber onclose noch nicht gefeuert: PAUSE/NOT-HALT/Jog-Stopp werfen statt zu melden', async () => {
    const s = await connected();
    jogHold('X', 1);
    s.readyState = 3; // Browser schliesst gerade; onclose kommt spaeter
    const m = useMachine.getState();
    let e1: unknown = null, e2: unknown = null, e3: unknown = null;
    try { m.feedHold(); } catch (e) { e1 = e; }
    try { m.emergencyStop(); } catch (e) { e2 = e; }
    try { releaseAllHolds(); } catch (e) { e3 = e; }
    console.log('feedHold wirft:', String(e1), '| emergencyStop wirft:', String(e2), '| releaseAllHolds wirft:', String(e3));
    expect(e1).toBeTruthy();
    expect(e2).toBeTruthy();
    expect(e3).toBeTruthy();
    expect(useMachine.getState().log.some((l) => l.key === 'estop.notConnected')).toBe(false);
    jogStop;
  });
});

describe('Stiller Linkausfall (kein close, keine Antworten)', () => {
  it('der Status bleibt "verbunden"; PAUSE/NOT-HALT melden "gesendet", obwohl nichts ankommt', async () => {
    vi.useFakeTimers();
    try {
      const s = await (async () => {
        (globalThis as { WebSocket?: unknown }).WebSocket = Sock;
        Sock.all = [];
        useMachine.setState({ log: [] });
        useMachine.getState().setUrl('192.168.0.200');
        const p = useMachine.getState().connect();
        await vi.advanceTimersByTimeAsync(50);
        await p;
        return last();
      })();
      s.send = (d: string | Uint8Array) => void s.sent.push(d); // Ab jetzt: Funkstille
      useMachine.getState().stream; // (nur Zugriff)
      await vi.advanceTimersByTimeAsync(120_000);
      const st = useMachine.getState();
      console.log('NACH 120 s Funkstille: connection =', st.connection, '| status.state =', st.status?.state);
      expect(st.connection).toBe('connected');
      useMachine.getState().emergencyStop();
      const log = useMachine.getState().log.map((l) => l.text);
      console.log('Log nach NOT-HALT:', log.slice(-2));
      expect(useMachine.getState().log.some((l) => l.text.startsWith('Not-Halt gesendet'))).toBe(true);
    } finally {
      useMachine.getState().disconnect();
      vi.useRealTimers();
    }
  });
});

describe('2d. Tastatur: Leertaste = PAUSE nur, wenn nicht getippt wird', () => {
  it('Leertaste bei Fokus in Eingabefeld / Auswahlliste waehrend "Run": KEIN Vorschub-Halt', () => {
    const handlers: Record<string, (e: unknown) => void> = {};
    (globalThis as { window?: unknown }).window = {
      addEventListener: (t: string, h: (e: unknown) => void) => (handlers[t] = h),
      removeEventListener: () => undefined,
    };
    (globalThis as { document?: unknown }).document = { querySelector: () => null };
    const feedHold = vi.fn();
    useMachine.setState({ feedHold, status: { state: 'Run' } as never });
    const stop = startKeys();
    const press = (tagName: string) =>
      handlers.keydown!({
        key: ' ', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, repeat: false,
        target: { tagName }, preventDefault: () => undefined, stopPropagation: () => undefined,
      });
    press('BUTTON');
    expect(feedHold).toHaveBeenCalledTimes(1); // Knopf im Fokus: Pause
    press('INPUT');
    press('TEXTAREA');
    press('SELECT');
    console.log('feedHold-Aufrufe nach Leertaste in INPUT/TEXTAREA/SELECT:', feedHold.mock.calls.length - 1, 'von 3');
    expect(feedHold).toHaveBeenCalledTimes(1); // Befund: bei Fokus im Feld keine Pause
    // Auch ein "Hold:0"/"Door"/"Check"-Zustand zaehlt nicht als "bewegt sich":
    useMachine.setState({ status: { state: 'Cycle' } as never });
    press('BUTTON');
    expect(feedHold).toHaveBeenCalledTimes(1);
    stop();
  });
});

describe('2e/3. Zwei Clients am Relay (echtes FluidNCRelay der Pi-Seite, FluidNC-Double)', () => {
  /** FluidNC-Double: '?' -> Status; Zeilen: ok (ausser $SD/Run: laeuft "ewig"); Streamzeilen: ok auf Verlangen. */
  class Upstream {
    binaryType = 'blob';
    readyState = 0;
    sent: string[] = [];
    onopen: ((e: unknown) => void) | null = null;
    onmessage: ((e: { data: unknown }) => void) | null = null;
    onclose: ((e: unknown) => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    autoOk = true;
    constructor() {
      queueMicrotask(() => {
        this.readyState = 1;
        this.onopen?.({});
      });
    }
    send(d: string | Uint8Array) {
      const t = typeof d === 'string' ? d : `0x${[...d].map((b) => b.toString(16)).join('')}`;
      this.sent.push(t);
      if (t === '?') this.reply('<Run|MPos:100.000,200.000,-5.000|FS:1000,18000>\n');
      else if (t.endsWith('\n') && !t.startsWith('$SD/Run') && this.autoOk) this.reply('ok\n');
    }
    reply(s: string) {
      this.onmessage?.({ data: new TextEncoder().encode(s).buffer });
    }
    close() {
      this.readyState = 3;
    }
  }
  const world = () => {
    const up = new Upstream();
    const relay = new FluidNCRelay('ws://fluidnc:81', () => up as never);
    const client = () => {
      const c = new FluidNCConnection({
        url: 'ws://pi/fluidnc',
        statusIntervalMs: 0,
        createSocket: () => {
          const sock: Record<string, unknown> = {
            binaryType: 'blob', readyState: 0, onopen: null, onclose: null, onerror: null, onmessage: null,
            send: (d: string | Uint8Array) => relay.fromClient(d),
            close: () => { sock.readyState = 3; relay.detach(rc); (sock.onclose as (e: unknown) => void)?.({ code: 1000, reason: '' }); },
          };
          const rc = {
            send: (data: string | Uint8Array) => (sock.onmessage as (e: { data: unknown }) => void)?.({ data: data instanceof Uint8Array ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data }),
            close: () => { sock.readyState = 3; (sock.onclose as (e: unknown) => void)?.({ code: 1011, reason: 'x' }); },
          };
          relay.attach(rc);
          queueMicrotask(() => { sock.readyState = 1; (sock.onopen as (e: unknown) => void)?.({}); });
          return sock as never;
        },
      });
      return c;
    };
    return { up, relay, client };
  };

  it('Fremd-"ok" beendet in Client A den SD-Job, obwohl die Maschine noch laeuft', async () => {
    const { up, client } = world();
    const a = client(), b = client();
    await a.connect(); await b.connect();
    let aDone = false;
    const job = a.runFile('/schild.nc').then(() => (aDone = true));
    await tick();
    expect(up.sent.some((l) => l.startsWith('$SD/Run'))).toBe(true);
    expect(aDone).toBe(false);
    // iPad (B) oeffnet die App: connect() fragt $I; FluidNC antwortet "ok" -> Relay -> an ALLE
    void b.command('$I');
    await tick();
    console.log('A: SD-Job gilt als beendet, nach Fremd-ok von B:', aDone, '| Maschine meldet weiter: Run');
    expect(aDone).toBe(true);
    await job;
    a.disconnect(); b.disconnect();
  });

  it('Fremd-"ok" in A verschiebt die Puffer-Buchfuehrung des Streamers (Ueberlauf des Steuerungspuffers moeglich)', async () => {
    const { up, client } = world();
    const a = client(), b = client();
    await a.connect(); await b.connect();
    up.autoOk = false; // Maschine puffert Streamzeilen, bestaetigt noch nichts
    const program = Array.from({ length: 60 }, (_, i) => `G1X${i + 1}F1000`);
    const s = a.stream(program);
    s.start();
    const real = () => up.sent.filter((l) => l.startsWith('G1')).length;
    const before = real();
    // B sendet harmlos "$G"; Maschine antwortet ok -> A zaehlt es als Quittung einer Streamzeile
    up.autoOk = true;
    void b.command('$G');
    await tick();
    up.autoOk = false;
    const after = real();
    const bytes = up.sent.filter((l) => l.startsWith('G1')).reduce((n, l) => n + l.length, 0);
    console.log(`A hat vor B's $G ${before} Zeilen gesendet, danach ${after} (nichts davon war von der Maschine quittiert);`,
      `Streamzeilen-Bytes ohne eine einzige echte Quittung: ${bytes} (Puffer 127)`);
    expect(after).toBeGreaterThan(before);
    a.disconnect(); b.disconnect();
  });

  it('Jeder Client darf !, 0x18, $-Befehle senden; Abbruch von A schickt nichts an die Maschine', async () => {
    const { up, relay, client } = world();
    const a = client(), b = client();
    await a.connect(); await b.connect();
    up.autoOk = false;
    a.stream(['G1X1F100', 'G1X2F100']).start();
    await tick();
    const marks = up.sent.length;
    a.disconnect(); // A (streamt gerade) verschwindet
    await tick();
    const afterDrop = up.sent.slice(marks);
    console.log('Relay->FluidNC nach Abbruch des streamenden Clients A:', afterDrop, '| Clients am Relay:', relay.clientCount);
    expect(afterDrop).toEqual([]);
    expect(relay.clientCount).toBe(1);
    b.realtime(0x21); // B kann trotzdem anhalten
    expect(up.sent).toContain('!');
    b.disconnect();
    expect(relay.connected).toBe(false); // letzter Client weg: Relay schliesst FluidNC-Socket, ohne etwas zu senden
    expect(up.sent.slice(-1)[0]).not.toBe('0x18');
  });
});


describe('W1 im echten Store: fremdes "ok" mitten im SD-Job (Zero-Touch: Zweitgeraet verbindet sich selbst wieder)', () => {
  const TWO_TOOLS = ['G21 G90 G17 G94', 'T1 M6', 'S18000 M3', 'G0 X10 Y10', 'G1 Z-1 F300', 'G1 X50 F800', 'M5',
    'T2 M6', 'S18000 M3', 'G0 X20 Y20', 'G1 Z-1 F300', 'G1 X60 F800', 'M5', 'M30'].join('\n');

  it('runSdFile: ein fremdes ok beendet den Job im Store (fileJob=null, lastFileResult=done), Maschine meldet weiter Run', async () => {
    const s = await connected();
    void useMachine.getState().runSdFile('schild.nc');
    await tick();
    s.emit('<Run|MPos:100.000,200.000,-5.000|FS:1000,18000|SD:42.0,/sd/schild.nc>\n');
    expect(useMachine.getState().fileJob).not.toBeNull();
    s.emit('ok\n'); // z. B. die Antwort auf $I eines zweiten Geraets, vom Relay an alle verteilt
    await tick();
    const st = useMachine.getState();
    console.log('Store nach Fremd-ok: fileJob =', st.fileJob, '| lastFileResult =', st.lastFileResult, '| status.state =', st.status?.state);
    expect(st.fileJob).toBeNull();
    expect(st.lastFileResult).toBe('done');
    expect(st.status?.state).toBe('Run');
  });

  it('startPart mit 2-Werkzeug-Job: nach Fremd-ok sendet die App M5, Anheben und G53 G0 an die laufende Maschine', async () => {
    const s = await connected();
    s.emit('[MSG:Homed:XYZ]\n');
    useWorkshop.getState().setSettings({ toolChangePosition: { x: 12, y: 34 } } as never);
    useJob.getState().load('zwei.nc', TWO_TOOLS);
    const parts = currentParts();
    console.log('Teile:', parts.map((p) => `${p.fileName} (T${p.tool})`));
    expect(parts.length).toBe(2);
    const bytes = new TextEncoder().encode(parts[0]!.text).length;
    useRun.setState({ uploaded: { [parts[0]!.fileName]: parts[0]!.text } });
    useMachine.setState({ sdFiles: [{ name: parts[0]!.fileName, size: bytes }] as never });
    void useRun.getState().startPart(0);
    await tick(30);
    expect(s.lines().some((l) => l.startsWith('$SD/Run='))).toBe(true);
    s.emit('<Run|MPos:100.000,200.000,-5.000|FS:1000,18000|SD:42.0,/sd/x>\n');
    s.okAll = true; // FluidNC quittiert die Folgebefehle
    const before = s.lines().length;
    s.emit('ok\n'); // fremdes ok, Maschine laeuft in Wahrheit weiter
    await tick(40);
    const after = s.lines().slice(before);
    console.log('Gesendet nach Fremd-ok (Maschine meldet weiter Run):', after);
    expect(after).toContain('M5');
    expect(after.some((l) => l.startsWith('G53 G0'))).toBe(true);
  });
});
