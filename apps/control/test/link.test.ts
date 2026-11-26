import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  classifyFailure,
  hostOf,
  isRelayUrl,
  mayRetry,
  relayTarget,
  retryDelay,
  secondsUntil,
  socketUrl,
  viaFor,
} from '../src/lib/link';
import { useMachine } from '../src/store/machine';
import { startMessages, useMessages } from '../src/store/messages';

describe('the way to the machine (pure)', () => {
  it('knows the relay path and the address the operator recognises', () => {
    expect(isRelayUrl('ws://192.168.0.198:8080/fluidnc')).toBe(true);
    expect(isRelayUrl('ws://192.168.0.200:81/')).toBe(false);
    expect(hostOf('ws://192.168.0.200:81/')).toBe('192.168.0.200:81');
    // what is typed with a login in front is not said with it
    expect(hostOf('ws://bob:pw123@192.168.0.198:8080/fluidnc')).toBe('192.168.0.198:8080');
    expect(hostOf('bob:pw123@192.168.0.200:81')).toBe('192.168.0.200:81');
    // a password may hold an @: the login ends at the last one
    expect(hostOf('ws://bob:p@ss@192.168.0.198:8080/fluidnc')).toBe('192.168.0.198:8080');
    expect(hostOf('bob:@secret@192.168.0.200')).toBe('192.168.0.200');
    expect(relayTarget('FluidNC unreachable: ws://192.168.0.200:81')).toBe('192.168.0.200:81');
    expect(relayTarget('FluidNC disconnected: ws://jackpot.local:81/')).toBe('jackpot.local:81');
    expect(relayTarget('No FluidNC address configured')).toBeNull();
    expect(relayTarget(undefined)).toBeNull();
  });

  it("asks the companion's relay for stamps – on the socket only, and for no other address", () => {
    expect(socketUrl('ws://192.168.0.198:8080/fluidnc')).toBe(
      'ws://192.168.0.198:8080/fluidnc?stamp=1',
    );
    expect(socketUrl(' wss://pi.local/fluidnc/ ')).toBe('wss://pi.local/fluidnc/?stamp=1');
    // FluidNC typed in directly, or the simulator: unchanged
    expect(socketUrl('ws://192.168.0.200:81/')).toBe('ws://192.168.0.200:81/');
    expect(socketUrl('sim://lowrider')).toBe('sim://lowrider');
    // the address with the parameter is no relay path for `isRelayUrl`: the typed one stays what is compared
    expect(isRelayUrl(socketUrl('ws://192.168.0.198:8080/fluidnc'))).toBe(false);
    expect(isRelayUrl('ws://192.168.0.198:8080/fluidnc')).toBe(true);
  });

  it('tells a failure with the address of the Pi – the series knows it, else the one that was typed', () => {
    expect(viaFor('192.168.0.198:8080', true, 'ws://other:1/fluidnc')).toBe('192.168.0.198:8080');
    expect(viaFor(null, true, 'ws://192.168.0.198:8080/fluidnc')).toBe('192.168.0.198:8080');
    // direct to FluidNC there is no Pi to name
    expect(viaFor(null, false, 'ws://192.168.0.200:81/')).toBeNull();
    expect(viaFor('', true, 'ws://192.168.0.198:8080/fluidnc')).toBe('192.168.0.198:8080');
    // nothing typed, nothing to say
    expect(viaFor(null, true, '')).toBeNull();
  });

  it('tells which device was missing', () => {
    // Straight to FluidNC: whatever happened, FluidNC did not answer there.
    expect(classifyFailure({ kind: 'unreachable' }, false)).toBe('direct');
    expect(classifyFailure({ kind: 'silent' }, false)).toBe('direct');
    // Through the Pi: no socket at all – the Pi is not reached.
    expect(classifyFailure({ kind: 'unreachable' }, true)).toBe('pi');
    // The Pi took it and said FluidNC is not there (1011 and its reason), or nothing answered.
    expect(classifyFailure({ kind: 'closed', code: 1011, reason: '' }, true)).toBe('relay');
    expect(classifyFailure({ kind: 'closed', code: 1000, reason: 'FluidNC x' }, true)).toBe(
      'relay',
    );
    expect(classifyFailure({ kind: 'silent' }, true)).toBe('relay');
    // Closed otherwise (the Pi's server went away): the Pi.
    expect(classifyFailure({ kind: 'closed', code: 1006 }, true)).toBe('pi');
  });

  it('waits longer each time, at most 30 s, and only where it may', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(retryDelay)).toEqual([
      2000, 4000, 8000, 16000, 30000, 30000, 30000,
    ]);
    expect(retryDelay(-1)).toBe(2000);
    const ok = { autoRetry: true, jobRunning: false, lostDuringJob: false, simulator: false };
    expect(mayRetry(ok)).toBe(true);
    expect(mayRetry({ ...ok, autoRetry: false })).toBe(false);
    expect(mayRetry({ ...ok, jobRunning: true })).toBe(false);
    expect(mayRetry({ ...ok, lostDuringJob: true })).toBe(false);
    expect(mayRetry({ ...ok, simulator: true })).toBe(false);
    expect(secondsUntil(10_500, 1000)).toBe(10);
    expect(secondsUntil(1000, 5000)).toBe(0);
  });
});

/** How the next socket behaves: answers, refuses, or the relay closes it saying FluidNC is gone. */
type Script = 'answer' | 'refuse' | 'relay-down' | 'silent';

class ScriptedSocket {
  static scripts: Script[] = [];
  /** What the machine answers to a command line, as FluidNC does it – in a binary frame: a line, or null for none */
  static replies: Record<string, string | null> = {};
  static opened: ScriptedSocket[] = [];
  static last: ScriptedSocket | null = null;
  binaryType = 'blob';
  readyState = 0;
  sent: string[] = [];
  silent = false;
  onopen: ((e: unknown) => void) | null = null;
  onclose: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  constructor(readonly url: string) {
    ScriptedSocket.opened.push(this);
    ScriptedSocket.last = this;
    const script = ScriptedSocket.scripts.shift() ?? 'refuse';
    queueMicrotask(() => {
      if (script === 'refuse') {
        this.onerror?.({});
        this.drop(1006, '');
        return;
      }
      this.readyState = 1;
      this.silent = script === 'relay-down' || script === 'silent';
      this.onopen?.({});
      if (script === 'relay-down') this.drop(1011, 'FluidNC unreachable: ws://192.168.0.200:81');
    });
  }
  send(data: string | Uint8Array) {
    const text = typeof data === 'string' ? data : '';
    this.sent.push(text);
    const reply = ScriptedSocket.replies[text.trim()];
    if (reply !== undefined && text.endsWith('\n')) {
      // (a text frame starting with "error:" would be taken for a WebUI meta message and dropped)
      // after the line has been sent, as a socket does it (the app logs "sent" when send() has returned)
      if (reply !== null) {
        queueMicrotask(() =>
          this.onmessage?.({ data: new TextEncoder().encode(`${reply}\n`).buffer }),
        );
      }
    } else if (text === '?' && this.readyState === 1 && !this.silent)
      this.onmessage?.({ data: '<Idle|MPos:0.000,0.000,0.000|FS:0,0>\n' });
    else if (text.endsWith('\n')) this.onmessage?.({ data: 'ok\n' });
  }
  close() {
    this.drop(1000, '');
  }
  drop(code: number, reason: string) {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
}

const sockets = () => ScriptedSocket.opened.length;
const flush = () => vi.advanceTimersByTimeAsync(0);

describe('coming back by itself', () => {
  const original = (globalThis as { WebSocket?: unknown }).WebSocket;
  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as { WebSocket?: unknown }).WebSocket = ScriptedSocket;
    ScriptedSocket.scripts = [];
    ScriptedSocket.replies = {};
    ScriptedSocket.opened = [];
    useMachine.getState().disconnect();
    useMachine.setState({
      autoRetry: true,
      fileJob: null,
      stream: null,
      lostInJob: null,
      log: [],
      link: { ...useMachine.getState().link, lostDuringJob: false },
    });
  });
  afterEach(() => {
    useMachine.getState().disconnect();
    (globalThis as { WebSocket?: unknown }).WebSocket = original;
    vi.useRealTimers();
  });

  it('keeps trying through the Pi outside a job, says once why, and stops when asked', async () => {
    useMachine.getState().setUrl('ws://192.168.0.198:8080/fluidnc');
    ScriptedSocket.scripts = ['relay-down', 'relay-down', 'relay-down'];
    await useMachine.getState().connect();
    let { link, connection, log } = useMachine.getState();
    expect(connection).toBe('disconnected');
    expect(link).toMatchObject({
      phase: 'waiting',
      failure: 'relay',
      target: '192.168.0.200:81',
      via: '192.168.0.198:8080',
      attempt: 1,
    });
    // The socket opened and closed at once: no "Verbunden", one warning that names the Jackpot.
    expect(log.filter((l) => l.key === 'machine.connected')).toHaveLength(0);
    expect(log.filter((l) => l.key === 'link.relay').map((l) => l.text)).toEqual([
      'Pi erreicht den Jackpot nicht (192.168.0.200:81)',
    ]);
    expect(link.retryAt! - Date.now()).toBe(2000);
    await vi.advanceTimersByTimeAsync(2000);
    expect(sockets()).toBe(2);
    ({ link, log } = useMachine.getState());
    expect(link.attempt).toBe(2);
    expect(link.retryAt! - Date.now()).toBe(4000);
    // The same failure again is not said again.
    expect(log.filter((l) => l.kind === 'error')).toHaveLength(1);
    // "Jetzt versuchen": at once, the series goes on.
    useMachine.getState().retryNow();
    await flush();
    expect(sockets()).toBe(3);
    expect(useMachine.getState().link.attempt).toBe(3);
    // "Aufhören": nothing more by itself, and it is remembered.
    useMachine.getState().stopRetry();
    expect(useMachine.getState()).toMatchObject({ autoRetry: false, link: { phase: 'failed' } });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(sockets()).toBe(3);
  });

  it('tells a Pi that cannot be reached apart, and connects once FluidNC answers', async () => {
    useMachine.getState().setUrl('ws://192.168.0.198:8080/fluidnc');
    ScriptedSocket.scripts = ['refuse', 'answer'];
    await useMachine.getState().connect();
    expect(useMachine.getState().link).toMatchObject({ phase: 'waiting', failure: 'pi' });
    expect(useMachine.getState().log.at(-1)).toMatchObject({
      kind: 'error',
      key: 'link.pi',
      text: 'Pi nicht erreichbar (192.168.0.198:8080)',
    });
    await vi.advanceTimersByTimeAsync(2000);
    const { connection, link, log } = useMachine.getState();
    expect(connection).toBe('connected');
    expect(link.phase).toBe('idle');
    expect(log.filter((l) => l.key === 'machine.connected')).toHaveLength(1);
    // A reconnect only asks: the status, the banner, the modal state, the offsets.
    const lines = ScriptedSocket.last!.sent.map((d) => d.trim()).filter(Boolean);
    expect(new Set(lines)).toEqual(new Set(['?', '$I', '$G', '$#']));
  });

  it('names the Pi when it is lost after the connection was up – not "Pi nicht erreichbar ()"', async () => {
    useMachine.getState().setUrl('ws://192.168.0.198:8080/fluidnc');
    ScriptedSocket.scripts = ['answer', 'refuse'];
    await useMachine.getState().connect();
    expect(useMachine.getState().connection).toBe('connected');
    // a successful connection ends the series: the address of the Pi is not kept in it
    expect(useMachine.getState().link.via).toBeNull();
    // the Pi goes away (switched off, out of the Wi-Fi): the socket closes without the relay's reason
    ScriptedSocket.last!.drop(1006, '');
    const { link, log } = useMachine.getState();
    expect(link).toMatchObject({ phase: 'waiting', failure: 'pi', via: '192.168.0.198:8080' });
    expect(log.filter((l) => l.key === 'link.pi').map((l) => l.text)).toEqual([
      'Pi nicht erreichbar (192.168.0.198:8080)',
    ]);
  });

  describe('what is kept with the message about it', () => {
    let stop: () => void;
    beforeEach(() => {
      useMessages.setState({ messages: [], toasts: [] });
      stop = startMessages();
    });
    afterEach(() => stop());

    it('is the failure and the way – not the try before it', async () => {
      useMachine.getState().setUrl('ws://192.168.0.198:8080/fluidnc');
      ScriptedSocket.scripts = ['refuse'];
      await useMachine.getState().connect();
      const m = useMessages.getState().messages.find((x) => x.context?.key === 'link.pi')!;
      expect(m).toBeDefined();
      expect(m.context!.facts).toContain('Verbindungsversuch: waiting, fehlt: pi, Versuch 1');
      expect(m.context!.facts).toContain('Weg: Pi 192.168.0.198:8080 → Jackpot ?');
      expect(m.context!.facts.join('\n')).not.toContain('connecting');
    });

    describe('listing the SD card', () => {
      const listed = async (reply: string | null) => {
        useMachine.getState().setUrl('ws://192.168.0.198:8080/fluidnc');
        ScriptedSocket.scripts = ['answer'];
        await useMachine.getState().connect();
        // what the connection asks for by itself ($I, $G, $#) is answered first: one command at a time, as at the machine
        await vi.advanceTimersByTimeAsync(200);
        ScriptedSocket.replies['$SD/List'] = reply;
        useMessages.setState({ messages: [] });
        useMachine.setState({ log: [] });
        const listing = useMachine.getState().refreshSdFiles();
        // no answer at all: the command ends after its time limit
        await vi.advanceTimersByTimeAsync(11_000);
        await listing;
        const warnings = useMessages.getState().messages.filter((m) => m.level === 'warning');
        const log = useMachine.getState().log.filter((l) => l.kind === 'error');
        return { warnings, log };
      };

      it('says one warning – the card – where the controller cannot mount it (error:60)', async () => {
        const { warnings, log } = await listed('error:60');
        expect(warnings.map((m) => m.title)).toEqual([
          'SD-Karte der Steuerung: Zugriff fehlgeschlagen',
        ]);
        expect(log.map((l) => l.key)).toEqual(['error.title']);
        // the controller's answer is in the warning, with the command that was sent
        expect(warnings[0]!.context!.recent.join('\n')).toContain('> $SD/List');
      });

      it('says the list failed where the controller did not answer at all', async () => {
        const { warnings, log } = await listed(null);
        expect(warnings.map((m) => m.title)).toEqual(['SD-Karte konnte nicht gelesen werden.']);
        expect(log.map((l) => l.key)).toEqual(['files.listFailed']);
      });

      it('says both where the controller names no card: a file error, or a line it rejects', async () => {
        // an error that happens to one file does not say the list failed – this does
        const file = await listed('error:65');
        expect(file.log.map((l) => l.key).sort()).toEqual(['error.title', 'files.listFailed']);
        expect(file.warnings).toHaveLength(2);
        const line = await listed('error:9');
        expect(line.log.map((l) => l.key).sort()).toEqual(['error.title', 'files.listFailed']);
      });

      it('forgets the list it had where the listing fails – a stale one shows files that cannot start', async () => {
        await listed('[FILE: rahmen.nc|SIZE:1200]\nok');
        expect(useMachine.getState().sdFiles).toEqual([{ name: 'rahmen.nc', size: 1200 }]);
        ScriptedSocket.replies['$SD/List'] = 'error:60';
        await useMachine.getState().refreshSdFiles();
        expect(useMachine.getState().sdFiles).toBeNull();
        // the same where the controller does not answer
        ScriptedSocket.replies['$SD/List'] = '[FILE: a.nc|SIZE:1]\nok';
        await useMachine.getState().refreshSdFiles();
        expect(useMachine.getState().sdFiles).toHaveLength(1);
        ScriptedSocket.replies['$SD/List'] = null;
        const silent = useMachine.getState().refreshSdFiles();
        await vi.advanceTimersByTimeAsync(11_000);
        await silent;
        expect(useMachine.getState().sdFiles).toBeNull();
      });

      it('says nothing of the card where this device only watches: nothing was sent, what was read stays', async () => {
        await listed('[FILE: rahmen.nc|SIZE:1200]\nok');
        // the Pi says another device controls
        ScriptedSocket.last!.onmessage?.({ data: 'ROLE:viewer' });
        expect(useMachine.getState().viewer).toBe(true);
        useMessages.setState({ messages: [] });
        useMachine.setState({ log: [] });
        const sentBefore = ScriptedSocket.last!.sent.length;
        await useMachine.getState().refreshSdFiles();
        expect(ScriptedSocket.last!.sent.slice(sentBefore).join('')).not.toContain('$SD/List');
        expect(useMachine.getState().log.filter((l) => l.kind === 'error')).toEqual([]);
        expect(useMessages.getState().messages).toEqual([]);
        expect(useMachine.getState().sdFiles).toEqual([{ name: 'rahmen.nc', size: 1200 }]);
      });

      it('does not warn where the list is read', async () => {
        const { warnings, log } = await listed('[FILE: rahmen.nc|SIZE:1200]\nok');
        expect(warnings).toEqual([]);
        expect(log).toEqual([]);
        expect(useMachine.getState().sdFiles).toEqual([{ name: 'rahmen.nc', size: 1200 }]);
      });
    });

    it('says the connection gone for the Pi that is lost after it was up, too – and names the Pi', async () => {
      useMachine.getState().setUrl('ws://192.168.0.198:8080/fluidnc');
      ScriptedSocket.scripts = ['answer', 'refuse'];
      await useMachine.getState().connect();
      ScriptedSocket.last!.drop(1006, '');
      const m = useMessages.getState().messages.find((x) => x.context?.key === 'link.pi')!;
      expect(m.title).toBe('Pi nicht erreichbar (192.168.0.198:8080)');
      expect(m.context!.facts).toContain('Verbindung: disconnected');
      expect(m.context!.facts).toContain('Weg: Pi 192.168.0.198:8080 → Jackpot ?');
    });

    it('says the connection gone for the critical message of a connection lost in a job', async () => {
      useMachine.getState().setUrl('ws://192.168.0.198:8080/fluidnc');
      ScriptedSocket.scripts = ['answer'];
      await useMachine.getState().connect();
      useMachine.setState({ fileJob: { name: 'rahmen.nc', startedAt: Date.now() } });
      ScriptedSocket.last!.drop(1006, '');
      const critical = useMessages.getState().messages.find((x) => x.level === 'critical')!;
      expect(critical.context!.facts).toContain('Verbindung: disconnected');
      expect(critical.context!.facts).not.toContain('Verbindung: connected');
      expect(critical.context!.facts).toContain('Job: SD-Karte: rahmen.nc');
    });
  });

  it('comes back after a drop outside a job – direct to FluidNC', async () => {
    useMachine.getState().setUrl('192.168.0.200');
    ScriptedSocket.scripts = ['answer', 'refuse', 'answer'];
    await useMachine.getState().connect();
    expect(useMachine.getState().connection).toBe('connected');
    ScriptedSocket.last!.drop(1006, '');
    expect(useMachine.getState()).toMatchObject({
      connection: 'disconnected',
      lostInJob: null,
      link: { phase: 'waiting', failure: 'direct', target: '192.168.0.200:81' },
    });
    await vi.advanceTimersByTimeAsync(2000);
    expect(useMachine.getState().link).toMatchObject({ phase: 'waiting', attempt: 2 });
    await vi.advanceTimersByTimeAsync(4000);
    expect(useMachine.getState().connection).toBe('connected');
  });

  it('never reconnects by itself during a job or after a connection lost during one', async () => {
    useMachine.getState().setUrl('192.168.0.200');
    ScriptedSocket.scripts = ['answer'];
    await useMachine.getState().connect();
    useMachine.setState({ fileJob: { name: 'schild.nc', startedAt: Date.now() } });
    ScriptedSocket.last!.drop(1006, '');
    expect(useMachine.getState().lostInJob).toMatchObject({ name: 'schild.nc', sd: true });
    expect(useMachine.getState().link).toMatchObject({ phase: 'idle', lostDuringJob: true });
    await vi.advanceTimersByTimeAsync(300_000);
    expect(sockets()).toBe(1);
    // Acknowledged – still nothing by itself; a try by hand that fails waits for the operator.
    useMachine.getState().acknowledgeLost();
    useMachine.setState({ fileJob: null });
    await vi.advanceTimersByTimeAsync(300_000);
    expect(sockets()).toBe(1);
    await useMachine.getState().connect();
    expect(useMachine.getState().link).toMatchObject({ phase: 'failed', lostDuringJob: true });
    await vi.advanceTimersByTimeAsync(300_000);
    expect(sockets()).toBe(2);
    // Connected by hand: the latch is gone, coming back by itself is allowed again.
    ScriptedSocket.scripts = ['answer'];
    await useMachine.getState().connect();
    expect(useMachine.getState().link.lostDuringJob).toBe(false);
  });

  it('a streamed job whose connection drops is the critical message, too', async () => {
    useMachine.getState().setUrl('192.168.0.200');
    ScriptedSocket.scripts = ['answer'];
    await useMachine.getState().connect();
    // FluidNC never answers the lines: the job is still running when the link drops.
    const socket = ScriptedSocket.last!;
    socket.send = (data) => void socket.sent.push(String(data));
    expect(useMachine.getState().streamJob('t.nc', 'G1 X1\nG1 X2')).toBe(true);
    expect(useMachine.getState().stream?.result).toBe('running');
    socket.drop(1006, '');
    expect(useMachine.getState().lostInJob).toMatchObject({ name: 't.nc', sd: false });
    expect(useMachine.getState().stream?.result).toBe('aborted');
  });

  it('PAUSE, NOT-HALT and the jog stop say so instead of throwing when the socket is closing', async () => {
    useMachine.getState().setUrl('192.168.0.200');
    ScriptedSocket.scripts = ['answer'];
    await useMachine.getState().connect();
    ScriptedSocket.last!.readyState = 3; // closing; onclose has not fired yet
    const m = useMachine.getState();
    expect(() => {
      m.feedHold();
      m.jogCancel();
      m.emergencyStop();
    }).not.toThrow();
    const keys = useMachine.getState().log.map((l) => l.key);
    expect(keys).toEqual(expect.arrayContaining(['estop.holdNotSent', 'estop.notConnected']));
  });

  it('knows when another device controls: says so once, refuses commands, forgets it on disconnect', async () => {
    useMachine.getState().setUrl('192.168.0.200');
    ScriptedSocket.scripts = ['answer'];
    await useMachine.getState().connect();
    const socket = ScriptedSocket.last!;
    socket.onmessage?.({ data: 'ROLE:controller' });
    expect(useMachine.getState().viewer).toBe(false);
    socket.onmessage?.({ data: 'ROLE:viewer' });
    socket.onmessage?.({ data: 'ROLE:viewer' });
    expect(useMachine.getState().viewer).toBe(true);
    expect(useMachine.getState().log.filter((l) => l.key === 'machine.viewer')).toHaveLength(1);
    expect(await useMachine.getState().command('$H')).toBe(false);
    socket.onmessage?.({ data: 'ROLE:controller' });
    expect(useMachine.getState().viewer).toBe(false);
    expect(useMachine.getState().log.at(-1)?.key).toBe('machine.controller');
    socket.onmessage?.({ data: 'ROLE:viewer' });
    useMachine.getState().disconnect();
    expect(useMachine.getState().viewer).toBe(false);
  });

  describe("the Pi's stamp of a report", () => {
    const frame = (text: string) => ({ data: new TextEncoder().encode(text).buffer });

    it('opens the socket with `stamp=1` through the Pi – and only then', async () => {
      useMachine.getState().setUrl('ws://192.168.0.198:8080/fluidnc');
      ScriptedSocket.scripts = ['answer'];
      await useMachine.getState().connect();
      expect(ScriptedSocket.last!.url).toBe('ws://192.168.0.198:8080/fluidnc?stamp=1');
      useMachine.getState().disconnect();
      useMachine.getState().setUrl('192.168.0.200');
      ScriptedSocket.scripts = ['answer'];
      await useMachine.getState().connect();
      expect(ScriptedSocket.last!.url).toBe('ws://192.168.0.200:81/');
    });

    it('is set with the report it belongs to, and null for one that came without', async () => {
      useMachine.getState().setUrl('ws://192.168.0.198:8080/fluidnc');
      ScriptedSocket.scripts = ['answer'];
      await useMachine.getState().connect();
      const socket = ScriptedSocket.last!;
      // the first report came from a relay that did not stamp it (an older companion)
      expect(useMachine.getState().status).not.toBeNull();
      expect(useMachine.getState().statusStamp).toBeNull();
      // every state the store passes through: a report and its stamp are never apart
      const seen: { x: number; stamp: unknown }[] = [];
      const off = useMachine.subscribe((s, prev) => {
        if (s.status !== prev.status) seen.push({ x: s.status!.mpos[0]!, stamp: s.statusStamp });
      });
      socket.onmessage?.({ data: 'STAMP:5000.250:1700000000100' });
      socket.onmessage?.(frame('<Run|MPos:1,2,3>\n'));
      socket.onmessage?.({ data: 'STAMP:5200.750:1700000000300' });
      socket.onmessage?.(frame('<Run|MPos:2,2,3>\n'));
      // a report that came plain does not keep the stamp of the one before
      socket.onmessage?.(frame('<Run|MPos:3,2,3>\n'));
      off();
      expect(seen).toEqual([
        { x: 1, stamp: { mono: 5000.25, wall: 1700000000100 } },
        { x: 2, stamp: { mono: 5200.75, wall: 1700000000300 } },
        { x: 3, stamp: null },
      ]);
      expect(useMachine.getState().statusStamp).toBeNull();
    });

    it('is gone with the connection', async () => {
      useMachine.getState().setUrl('ws://192.168.0.198:8080/fluidnc');
      ScriptedSocket.scripts = ['answer'];
      await useMachine.getState().connect();
      const socket = ScriptedSocket.last!;
      socket.onmessage?.({ data: 'STAMP:1.000:2' });
      socket.onmessage?.(frame('<Idle|MPos:1,2,3>\n'));
      expect(useMachine.getState().statusStamp).toEqual({ mono: 1, wall: 2 });
      // lost: the report and its stamp go together
      socket.drop(1006, '');
      expect(useMachine.getState().status).toBeNull();
      expect(useMachine.getState().statusStamp).toBeNull();
      // and "Trennen" does the same
      ScriptedSocket.scripts = ['answer'];
      await useMachine.getState().connect();
      ScriptedSocket.last!.onmessage?.({ data: 'STAMP:3.000:4' });
      ScriptedSocket.last!.onmessage?.(frame('<Idle|MPos:1,2,3>\n'));
      expect(useMachine.getState().statusStamp).toEqual({ mono: 3, wall: 4 });
      useMachine.getState().disconnect();
      expect(useMachine.getState().statusStamp).toBeNull();
    });

    it('is null for FluidNC typed in directly: nothing stamps there', async () => {
      useMachine.getState().setUrl('192.168.0.200');
      ScriptedSocket.scripts = ['answer'];
      await useMachine.getState().connect();
      expect(useMachine.getState().status).not.toBeNull();
      expect(useMachine.getState().statusStamp).toBeNull();
    });
  });

  it('"Verbinden abbrechen" ends a try that waits for FluidNC – quietly, without a retry', async () => {
    useMachine.getState().setUrl('ws://192.168.0.198:8080/fluidnc');
    ScriptedSocket.scripts = ['silent'];
    const attempt = useMachine.getState().connect();
    await flush();
    expect(useMachine.getState().link.phase).toBe('connecting');
    useMachine.getState().disconnect();
    await attempt;
    expect(useMachine.getState().link.phase).toBe('idle');
    expect(useMachine.getState().log.filter((l) => l.kind === 'error')).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets()).toBe(1);
  });

  it('does not try by itself while a job runs, and not after "Trennen"', async () => {
    useMachine.getState().setUrl('192.168.0.200');
    useMachine.setState({ fileJob: { name: 'x.nc', startedAt: 0 } });
    await useMachine.getState().connect();
    expect(useMachine.getState().link.phase).toBe('failed');
    useMachine.setState({ fileJob: null });
    ScriptedSocket.scripts = ['answer'];
    await useMachine.getState().connect();
    useMachine.getState().disconnect();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(sockets()).toBe(2);
    expect(useMachine.getState().link.phase).toBe('idle');
    // Switched off and on again: the choice is the operator's.
    useMachine.getState().setAutoRetry(false);
    expect(useMachine.getState().autoRetry).toBe(false);
    useMachine.getState().setAutoRetry(true);
    expect(useMachine.getState().autoRetry).toBe(true);
  });
});
