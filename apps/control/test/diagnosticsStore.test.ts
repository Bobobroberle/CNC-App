import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOWRIDER_V4_PROFILE } from '../src/lib/profile';
import { useJob } from '../src/store/job';
import { useMachine } from '../src/store/machine';
import { useMessages, startMessages } from '../src/store/messages';
import { usePiLogin } from '../src/store/piLogin';
import { collectReport, exportReport, reportFileName } from '../src/store/diagnostics';
import { captureContext, contextInput, jobOf } from '../src/store/context';
import { useWorkshop } from '../src/store/workshop';

const download = vi.hoisted(() => ({ calls: [] as { name: string; text: string }[] }));
vi.mock('../src/lib/download', () => ({
  downloadText: (name: string, text: string) => void download.calls.push({ name, text }),
  downloadBlob: () => {},
}));

const status = (extra: Record<string, unknown> = {}) =>
  ({
    state: 'Idle',
    mpos: [1100, 500, -20],
    wpos: [0, 0, 0],
    wco: [1100, 500, -20],
    feed: 0,
    spindle: 0,
    overrides: { feed: 100, rapid: 100, spindle: 100 },
    accessories: {},
    pins: '',
    updatedAt: 1,
    ...extra,
  }) as never;

let stop: () => void;
beforeEach(() => {
  download.calls = [];
  stop = () => {};
  useMachine.setState({
    connection: 'connected',
    url: 'ws://192.168.0.198:8080/fluidnc',
    status: status(),
    homed: false,
    homedAxes: '',
    alarm: null,
    lostInJob: null,
    fileJob: null,
    stream: null,
    sdFiles: null,
    lastCommand: null,
    log: [],
  });
  useMessages.setState({ messages: [], toasts: [] });
  useJob.setState({ profile: LOWRIDER_V4_PROFILE });
  usePiLogin.setState({ login: null });
  stop = startMessages();
});
afterEach(() => stop());

describe('a rejected SD command', () => {
  it('is a message about the card with its own effect and next step – and keeps what surrounded it', () => {
    const { addLog } = useMachine.getState();
    addLog('out', '$SD/List');
    useMachine.setState({
      lastCommand: { id: 1, line: '$SD/List', state: 'error', at: 1, code: 60 },
    });
    addLog('in', 'error:60');
    addLog(
      'error',
      'Fehler 60: Die Steuerung konnte die SD-Karte nicht einbinden.',
      'error.title',
      'error:60',
    );
    const [m] = useMessages.getState().messages;
    expect(m).toMatchObject({
      level: 'warning',
      title: 'SD-Karte der Steuerung: Zugriff fehlgeschlagen',
      code: 'error:60',
    });
    expect(m!.cause).toContain('Dateisystem nicht einbinden');
    expect(m!.cause).toContain('Beim Auflisten der SD-Karte');
    expect(m!.effect).toContain('Jobs von der SD-Karte starten nicht');
    expect(m!.effect).not.toContain('gestreamter Job bleibt an dieser Zeile');
    expect(m!.action).toContain('FAT32');
    // what surrounded it: the state, and what was sent and what came back
    expect(m!.context!.key).toBe('error.title');
    expect(m!.context!.facts).toContain('Zustand: Idle');
    expect(m!.context!.facts).toContain('Letzter Bedienbefehl: $SD/List → error:60');
    expect(m!.context!.recent.join('\n')).toContain('> $SD/List');
    expect(m!.context!.recent.join('\n')).toContain('< error:60');
  });

  it('is an ordinary rejection for a line that was bad – the old text stays for those', () => {
    useMachine.getState().addLog('error', 'Fehler 22', 'error.title', 'error:22');
    const [m] = useMessages.getState().messages;
    expect(m!.title).toBe('Die Steuerung hat einen Befehl abgelehnt');
    expect(m!.action).toContain('Eingabe oder Programmzeile prüfen');
  });

  it('is a file of the controller – not claimed to be the card – for the errors that happen to one file', () => {
    useMachine.getState().addLog('error', 'Fehler 65', 'error.title', 'error:65');
    const file = useMessages.getState().messages.at(-1)!;
    expect(file.title).toBe('Dateizugriff der Steuerung fehlgeschlagen');
    expect(file.cause).toContain('Die Datei gibt es nicht');
    // not "the card holds nothing sure", not "jobs from the SD card do not start"
    expect(file.effect).not.toContain('SD-Karte');
    useMachine.getState().addLog('error', 'Fehler 83', 'error.title', 'error:83');
    const format = useMessages.getState().messages.at(-1)!;
    expect(format.title).toBe('Dateizugriff der Steuerung fehlgeschlagen');
    expect(format.cause).toBe('Das Formatieren des Dateisystems ist fehlgeschlagen.');
    expect(format.cause).not.toContain('SD-Karte');
  });

  it('does not say how the command ended while the error that answers it is only now arriving', () => {
    useMachine.setState({ lastCommand: { id: 7, line: '$X', state: 'sent', at: 1, code: null } });
    const { addLog } = useMachine.getState();
    addLog('out', '$X');
    addLog('in', 'error:20');
    addLog('error', 'Fehler 20', 'error.title', 'error:20');
    const [m] = useMessages.getState().messages;
    // the lines show what was sent and what came back; the fact would say "ohne Antwort" next to "< error:20"
    expect(m!.context!.facts.some((f) => f.startsWith('Letzter Bedienbefehl'))).toBe(false);
    expect(m!.context!.recent.join('\n')).toContain('> $X');
    expect(m!.context!.recent.join('\n')).toContain('< error:20');
  });
});

describe('what is kept with a message', () => {
  it('belongs to warnings, faults and the critical message – not to what only tells', () => {
    const state = useMachine.getState();
    expect(captureContext('info', state, 'x', [])).toBeUndefined();
    expect(captureContext('hint', state, 'x', [])).toBeUndefined();
    for (const level of ['warning', 'fault', 'critical'] as const) {
      expect(captureContext(level, state, 'x', [])!.facts).toContain('Verbindung: connected');
    }
  });

  it('is on the alarm, too, and on the connection lost in a job', () => {
    useMachine.setState({ alarm: 2, status: status({ state: 'Alarm' }) });
    const alarm = useMessages.getState().messages.find((m) => m.level === 'fault')!;
    expect(alarm.context!.facts).toContain('Zustand: Alarm');
    useMachine.setState({
      alarm: null,
      status: status(),
      lostInJob: { name: 'rahmen.nc', sd: false, at: 1 },
    });
    const lost = useMessages.getState().messages.find((m) => m.level === 'critical')!;
    expect(lost.context!.facts).toContain('Verbindung: connected');
  });

  it('says the job: from the SD card, or streamed', () => {
    const base = useMachine.getState();
    expect(jobOf(base)).toBeNull();
    expect(jobOf({ ...base, fileJob: { name: 'a.nc', startedAt: 1 } })).toBe('SD-Karte: a.nc');
    expect(
      jobOf({
        ...base,
        fileJob: { name: 'a.nc', startedAt: 1 },
        status: status({ sd: { percent: 41.6, file: 'a.nc' } }),
      }),
    ).toBe('SD-Karte: a.nc 42 %');
    expect(jobOf({ ...base, status: status({ sd: { percent: 10, file: 'b.nc' } }) })).toBe(
      'SD-Karte meldet b.nc 10 %',
    );
    expect(jobOf({ ...base, stream: { name: 's.nc', result: 'running' } as never })).toBe(
      'Stream: s.nc',
    );
    expect(jobOf({ ...base, stream: { name: 's.nc', result: 'done' } as never })).toBeNull();
    // without a status report there is nothing to ask
    expect(contextInput({ ...base, status: null }, undefined, []).state).toBeUndefined();
  });
});

describe('exporting the report', () => {
  it('names the file by the time of the device', () => {
    expect(reportFileName(new Date(2026, 10, 25, 15, 21, 3).getTime())).toBe(
      'lowrider-diagnose-20261125-152103.txt',
    );
    expect(reportFileName(new Date(2026, 0, 2, 3, 4, 5).getTime())).toBe(
      'lowrider-diagnose-20260102-030405.txt',
    );
  });

  it('collects what the stores know and sends nothing to the machine', () => {
    const sent = vi.fn();
    useMachine.setState({
      command: sent as never,
      sdFiles: [{ name: 'rahmen.nc', size: 10 } as never],
    });
    useWorkshop.setState({
      companionHealth: {
        ok: true,
        version: '0.1.0',
        build: 1,
        commit: 'abc1234',
        fluidnc: { url: 'x', connected: true, clients: 1 },
        sensors: '',
        update: true,
        auth: true,
      },
    });
    useMachine.getState().addLog('out', '$H');
    const report = collectReport(Date.now());
    expect(report.machine).toMatchObject({
      connection: 'connected',
      address: 'ws://192.168.0.198:8080/fluidnc',
      state: 'Idle',
      sd: { files: ['rahmen.nc'] },
    });
    expect(report.companion).toMatchObject({
      version: '0.1.0',
      commit: 'abc1234',
      fluidncConnected: true,
    });
    expect(report.log.map((l) => l.text)).toContain('$H');
    expect(report.settings).toHaveProperty('calibration');
    expect(sent).not.toHaveBeenCalled();
  });

  it('writes a file – with no credentials in it: not the Pi login, not a password typed in the console', () => {
    usePiLogin.setState({
      login: { base: 'http://192.168.0.198:8080', token: 'tok-abcdef123456', name: 'Tablet' },
    });
    useWorkshop
      .getState()
      .setSettings({ companionUrl: 'http://bobo:geheim-77@192.168.0.198:8080/?token=zzz' });
    const { addLog } = useMachine.getState();
    addLog('out', '$Sta/Password=Wlan-Passwort-77');
    addLog('info', 'Anmeldung tok-abcdef123456');
    addLog('error', 'Fehler 60', 'error.title', 'error:60');
    const name = exportReport();
    expect(download.calls).toHaveLength(1);
    const { text } = download.calls[0]!;
    expect(download.calls[0]!.name).toBe(name);
    expect(name).toMatch(/^lowrider-diagnose-\d{8}-\d{6}\.txt$/);
    expect(text).toContain('Diagnosebericht');
    expect(text).toContain('error:60');
    for (const secret of ['tok-abcdef123456', 'Wlan-Passwort-77', 'geheim-77', 'zzz']) {
      expect(text, secret).not.toContain(secret);
    }
    // the messages of this session are in it, with what surrounded them
    expect(text).toContain('Meldungen dieser Sitzung (1)');
    expect(text).toContain('Davor im Protokoll');
  });
});
