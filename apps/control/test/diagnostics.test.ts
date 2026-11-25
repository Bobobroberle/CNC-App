import { describe, expect, it } from 'vitest';
import {
  buildReport,
  clock,
  contextOf,
  factsOf,
  logLine,
  redact,
  REPORT_LINE_MAX,
  REPORT_LOG_LINES,
  safeHost,
  stamp,
  when,
  type ContextInput,
  type LogLine,
  type ReportInput,
} from '../src/lib/diagnostics';
import type { Message } from '../src/lib/messages';

const at = (h: number, m: number, s: number) => new Date(2026, 10, 25, h, m, s).getTime();

describe('what must not stand in a report', () => {
  it('takes the whole value of a setting that holds a credential – a passphrase of several words is one value', () => {
    expect(redact('$Sta/Password=Mein Werkstatt WLAN 2026')).toBe('$Sta/Password=[entfernt]');
    expect(redact('> $AP/Password=zwei Worte')).toBe('> $AP/Password=[entfernt]');
    expect(redact('$Notification/T1=abcdef 123456')).toBe('$Notification/T1=[entfernt]');
    expect(redact('$Notification/T2=token-xyz')).toBe('$Notification/T2=[entfernt]');
    // the settings around it stay readable
    expect(redact('$Sta/SSID=Werkstatt Netz')).toBe('$Sta/SSID=Werkstatt Netz');
    expect(redact('$Hostname=lowrider')).toBe('$Hostname=lowrider');
  });

  it("does not mangle words that only contain a name: the app's own texts, compass, bypass", () => {
    for (const text of [
      'Passmarken: Das hat nicht geklappt',
      'Compass: 3',
      'bypass=on',
      'Die Tokens: keine',
      'passed: ok',
    ]) {
      expect(redact(text), text).toBe(
        text.replace(/^Die Tokens: keine$/, 'Die Tokens: [entfernt]'),
      );
    }
  });

  it('takes the whole login out of an address – a password may hold an @', () => {
    expect(redact('ws://bob:p@ss@192.168.0.198:8080/fluidnc')).toBe(
      'ws://192.168.0.198:8080/fluidnc',
    );
    expect(redact('ws://bob:@secret@192.168.0.198/x')).toBe('ws://192.168.0.198/x');
    expect(redact('Pi nicht erreichbar (bob:p@ss@192.168.0.200:81)')).toBe(
      'Pi nicht erreichbar (192.168.0.200:81)',
    );
    expect(safeHost('ws://bob:p@ss@192.168.0.198:8080/fluidnc?x=1')).toBe(
      'ws://192.168.0.198:8080/fluidnc',
    );
    expect(safeHost('bob:p@ss@192.168.0.198')).toBe('192.168.0.198');
  });

  it('takes the credential out of the other spellings FluidNC knows for writing one', () => {
    for (const [text, kept] of [
      ['$Notification/Setup=TYPE=PUSHOVER T1=abcDEF123 T2=ghiJKL456', '$Notification/Setup='],
      ['[ESP610]TYPE=PUSHOVER T1=abc T2=def', '[ESP610]'],
      ['[ESP101]Mein Heim WLAN', '[ESP101]'],
      ['$ESP106=zwei Worte', '$ESP106='],
      ['> [ESP555]admin geheim', '> [ESP555]'],
      ['[Sta/Password]geheim wort', '[Sta/Password]'],
      ['[ESP401]P=Sta/Password T=S V=geheim wort', '[ESP401]'],
      ['$WebUI/Set=P=Notification/T1 T=S V=token wert', '$WebUI/Set='],
    ] as const) {
      const out = redact(text);
      expect(out, text).toBe(
        `${kept}${kept.endsWith('=') || kept.endsWith(']') ? '' : ' '}[entfernt]`,
      );
    }
    // what is not a credential stays: the SSID, the hostname, a normal [ESP…] command
    expect(redact('[ESP100]')).toBe('[ESP100]');
    expect(redact('[ESP401]P=Sta/SSID T=S V=Werkstatt Netz')).toBe(
      '[ESP401]P=Sta/SSID T=S V=Werkstatt Netz',
    );
    expect(redact('$Sta/SSID=Werkstatt Netz')).toBe('$Sta/SSID=Werkstatt Netz');
    // an empty value does not take the next line with it
    expect(redact('$sta/password=\n$sta/ssid=Home').split('\n')[1]).toBe('$sta/ssid=Home');
  });

  it('is fast on a line with no spaces – the log can hold a page-long answer', () => {
    for (const filler of ['a', ':', '/', '@', '$', '=', '.']) {
      const long = filler.repeat(200_000);
      const started = performance.now();
      redact(long);
      logLine(line(at(1, 2, 3), 'in', long));
      expect(performance.now() - started, `${filler} x 200000`).toBeLessThan(1500);
    }
  });

  it('cuts a line before it is redacted: nothing beyond the cut is written, whatever its length', () => {
    const long = line(at(1, 2, 3), 'in', 'x'.repeat(10_000));
    expect(logLine(long).length).toBeLessThan(2100);
    expect(logLine(long)).toMatch(/^01:02:03 < x{1990,}$/);
  });

  it('has no look-behind in it: an iPad with an older Safari could not parse the single script of the app', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(new URL('../src/lib/diagnostics.ts', import.meta.url), 'utf8');
    expect(source).not.toContain('(?<=');
    expect(source).not.toContain('(?<!');
  });

  it('takes user and password out of an address without a scheme, too', () => {
    expect(redact('Pi nicht erreichbar (bob:pw123@192.168.0.198:8080)')).toBe(
      'Pi nicht erreichbar (192.168.0.198:8080)',
    );
    expect(redact('Weg: Pi bob:pw123@192.168.0.198:8080 → Jackpot x')).toBe(
      'Weg: Pi 192.168.0.198:8080 → Jackpot x',
    );
    // the clock and ordinary text are no address
    expect(redact('15:21:03 > $SD/List')).toBe('15:21:03 > $SD/List');
    expect(redact('Zeit 15:21:03 @ Werkstatt')).toBe('Zeit 15:21:03 @ Werkstatt');
  });

  it('takes the value out of what is named password, secret, token, key …', () => {
    expect(redact('$Sta/Password=geheim123')).toBe('$Sta/Password=[entfernt]');
    expect(redact('$AP/Password = "mein passwort"')).toBe('$AP/Password = [entfernt]');
    expect(redact('Passwort: abc123')).toBe('Passwort: [entfernt]');
    expect(redact('psk=abcdef12 ssid=Werkstatt')).toBe('psk=[entfernt] ssid=Werkstatt');
    expect(redact('GET /api?token=abc.def-123&x=1')).toBe('GET /api?token=[entfernt]');
    expect(redact('Authorization: Bearer abc.def-123')).toBe('Authorization: [entfernt]');
    expect(redact('Authorization: Basic dXNlcjpwdw==')).toBe('Authorization: [entfernt]');
    expect(redact('api_key=XYZ')).toBe('api_key=[entfernt]');
    expect(redact('apiKey: XYZ')).toBe('apiKey: [entfernt]');
  });

  it('takes user and password out of an address – and keeps the host', () => {
    expect(redact('ws://bobo:pw123@192.168.0.198:8080/fluidnc')).toBe(
      'ws://192.168.0.198:8080/fluidnc',
    );
    expect(redact('http://u@host/x')).toBe('http://host/x');
  });

  it('takes out the strings the app holds itself – wherever they stand', () => {
    expect(redact('Token war abc123xyz789 im Header', ['abc123xyz789'])).toBe(
      'Token war [entfernt] im Header',
    );
    expect(redact('a abc123xyz789 b abc123xyz789', ['abc123xyz789'])).toBe(
      'a [entfernt] b [entfernt]',
    );
    // a short one would take out ordinary words: it is left alone
    expect(redact('ein Test', ['Test'])).toBe('ein Test');
  });

  it('leaves ordinary text alone – the words of the messages must stay readable', () => {
    for (const text of [
      'Die SD-Karte konnte nicht gelesen werden.',
      'error:60',
      '$SD/List',
      '$H',
      'G90 G53 G0 X1100 Y500 Z-20',
      'Anmeldung an der Steuerung fehlgeschlagen.',
      'Das Token der Anmeldung ist abgelaufen',
      '<Idle|MPos:0.000,0.000,0.000|FS:0,0>',
    ]) {
      expect(redact(text), text).toBe(text);
    }
  });

  it('keeps an address to its host, port and path', () => {
    expect(safeHost('http://u:p@192.168.0.198:8080/api?token=x#frag')).toBe(
      'http://192.168.0.198:8080/api',
    );
    expect(safeHost('  192.168.0.200  ')).toBe('192.168.0.200');
    expect(safeHost('ws://192.168.0.198:8080/fluidnc')).toBe('ws://192.168.0.198:8080/fluidnc');
    expect(safeHost('bob:pw123@192.168.0.198')).toBe('192.168.0.198');
  });
});

describe('the time as the device has it', () => {
  it('is hours, minutes, seconds – and the date', () => {
    expect(clock(at(15, 21, 3))).toBe('15:21:03');
    expect(clock(at(0, 5, 9))).toBe('00:05:09');
    expect(stamp(at(15, 21, 3))).toBe('2026-11-25 15:21:03');
  });
});

const line = (time: number, kind: LogLine['kind'], text: string, code?: string): LogLine => ({
  time,
  kind,
  text,
  ...(code ? { code } : {}),
});

describe('a line of the log', () => {
  it('says its direction, and its code', () => {
    expect(logLine(line(at(15, 21, 3), 'out', '$SD/List'))).toBe('15:21:03 > $SD/List');
    expect(logLine(line(at(15, 21, 3), 'in', 'error:60'))).toBe('15:21:03 < error:60');
    expect(logLine(line(at(15, 21, 4), 'info', 'Verbunden'))).toBe('15:21:04 · Verbunden');
    expect(logLine(line(at(15, 21, 4), 'error', 'Fehler 60', 'error:60'))).toBe(
      '15:21:04 ! Fehler 60 [error:60]',
    );
  });

  it('is redacted – a command with a password never stands there', () => {
    expect(logLine(line(at(1, 2, 3), 'out', '$Sta/Password=geheim99'))).toBe(
      '01:02:03 > $Sta/Password=[entfernt]',
    );
    expect(logLine(line(at(1, 2, 3), 'out', 'token xyz123456'), ['xyz123456'])).toBe(
      '01:02:03 > token [entfernt]',
    );
  });
});

const input = (extra: Partial<ContextInput> = {}): ContextInput => ({
  connection: 'connected',
  state: 'Idle',
  homed: false,
  homedAxes: '',
  mpos: [1100, 500.123, -20],
  link: { phase: 'idle', failure: null, via: null, target: null, attempt: 0 },
  job: null,
  lastCommand: null,
  log: [],
  ...extra,
});

describe('the facts of the machine', () => {
  it('say the state, whether it is homed, where it stands and what was last sent', () => {
    expect(factsOf(input({ lastCommand: { line: '$SD/List', state: 'error', code: 60 } }))).toEqual(
      [
        'Verbindung: connected',
        'Zustand: Idle',
        'Referenziert: nein',
        'Position (Maschine): X 1100.00  Y 500.12  Z -20.00',
        'Letzter Bedienbefehl: $SD/List → error:60',
      ],
    );
  });

  it('say homed axes, the way through the Pi, a try that goes on and the job', () => {
    const facts = factsOf(
      input({
        homed: false,
        homedAxes: 'XY',
        link: {
          phase: 'waiting',
          failure: 'relay',
          via: '192.168.0.198:8080',
          target: '192.168.0.200:81',
          attempt: 3,
        },
        job: 'SD-Karte: rahmen.nc 42 %',
        lastCommand: { line: 'G0 X1', state: 'sent', code: null },
      }),
    );
    expect(facts).toContain('Referenziert: nur XY');
    expect(facts).toContain('Weg: Pi 192.168.0.198:8080 → Jackpot 192.168.0.200:81');
    expect(facts).toContain('Verbindungsversuch: waiting, fehlt: relay, Versuch 3');
    expect(facts).toContain('Job: SD-Karte: rahmen.nc 42 %');
    expect(facts).toContain('Letzter Bedienbefehl: G0 X1 → ohne Antwort');
    expect(factsOf(input({ homed: true }))).toContain('Referenziert: ja');
    expect(factsOf(input({ lastCommand: { line: 'G0', state: 'ok', code: null } }))).toContain(
      'Letzter Bedienbefehl: G0 → ok',
    );
    expect(factsOf(input({ lastCommand: { line: 'G0', state: 'error', code: null } }))).toContain(
      'Letzter Bedienbefehl: G0 → error:?',
    );
  });

  it('are what is known: no state and no position without a status report', () => {
    const facts = factsOf({ ...input(), state: undefined, mpos: undefined });
    expect(facts.some((f) => f.startsWith('Zustand'))).toBe(false);
    expect(facts.some((f) => f.startsWith('Position'))).toBe(false);
  });
});

describe('the surroundings of a message', () => {
  it('are the facts and the last lines of the log before it – a few, and short', () => {
    const log = Array.from({ length: 20 }, (_, i) =>
      line(at(15, 21, i), i % 2 ? 'in' : 'out', `Zeile ${i} ${'x'.repeat(300)}`),
    );
    const context = contextOf(input({ key: 'files.listFailed', log }));
    expect(context.key).toBe('files.listFailed');
    expect(context.recent).toHaveLength(6);
    expect(context.recent[5]).toMatch(/^15:21:19 < Zeile 19 x+/);
    expect(context.facts.length).toBeLessThanOrEqual(8);
    for (const l of [...context.facts, ...context.recent])
      expect(l.length).toBeLessThanOrEqual(120);
    // no key, no key
    expect(contextOf(input())).not.toHaveProperty('key');
  });

  it('have no credentials – not in the log lines before, not in the held strings', () => {
    const context = contextOf(
      input({
        log: [
          line(at(1, 1, 1), 'out', '$Sta/Password=top-secret-1'),
          line(at(1, 1, 2), 'info', 'Token tok-123456-abc'),
        ],
      }),
      ['tok-123456-abc'],
    );
    const text = JSON.stringify(context);
    expect(text).not.toContain('top-secret-1');
    expect(text).not.toContain('tok-123456-abc');
  });
});

const message = (extra: Partial<Message> = {}): Message => ({
  id: 1,
  at: at(15, 21, 3),
  level: 'warning',
  title: 'SD-Karte der Steuerung: Zugriff fehlgeschlagen',
  cause: 'Die Steuerung konnte die SD-Karte nicht einbinden.',
  effect: 'Jobs von der SD-Karte starten nicht.',
  action: 'Karte prüfen.',
  code: 'error:60',
  acknowledged: false,
  resolved: false,
  context: { key: 'error.title', facts: ['Zustand: Idle'], recent: ['15:21:03 > $SD/List'] },
  ...extra,
});

const report = (extra: Partial<ReportInput> = {}): ReportInput => ({
  now: at(15, 30, 0),
  sessionStart: at(15, 0, 0),
  timeZone: 'Europe/Berlin',
  app: {
    area: 'service',
    origin: 'http://192.168.0.198:8080',
    userAgent: 'Test/1.0',
    language: 'de-DE',
    viewport: '1280 × 800',
    online: true,
  },
  companion: { version: '0.1.0', commit: 'f9d4029' },
  machine: {
    ...input(),
    address: 'ws://192.168.0.198:8080/fluidnc',
    firmware: 'FluidNC v3.9',
    simulator: false,
    alarm: null,
    modal: null,
    autoRetry: true,
    viewer: false,
    lostInJob: null,
    sd: { files: null, running: null, lastResult: null },
  },
  profile: {
    softLimits: true,
    travel: { x: { min: 3, max: 1223 }, y: { min: 3, max: 2443 }, z: { min: -297, max: 3 } },
  },
  settings: { language: 'de', calibration: { pitch: 10 } },
  messages: [message()],
  log: [line(at(15, 21, 3), 'out', '$SD/List'), line(at(15, 21, 3), 'in', 'error:60')],
  secrets: [],
  ...extra,
});

describe('the diagnostic report', () => {
  it('has its parts, in order, and says the messages with what surrounded them', () => {
    const text = buildReport(report());
    const order = [
      'LowRider Control – Diagnosebericht (Format 1)',
      '== Gerät ==',
      '== Pi (Companion) ==',
      '== Maschine und Verbindung ==',
      '== Einstellungen (Auswahl, ohne Zugangsdaten) ==',
      '== Meldungen dieser Sitzung (1) ==',
      '== Frühere Meldungen aus dem Verlauf (0) ==',
      '== Protokoll der Steuerung',
    ];
    let from = 0;
    for (const part of order) {
      const found = text.indexOf(part, from);
      expect(found, part).toBeGreaterThanOrEqual(from);
      from = found;
    }
    expect(text).toContain(
      '[15:21:03] Warnung · SD-Karte der Steuerung: Zugriff fehlgeschlagen  (error:60)  [offen]',
    );
    expect(text).toContain('    Ursache: Die Steuerung konnte die SD-Karte nicht einbinden.');
    expect(text).toContain('    Davor im Protokoll:\n      15:21:03 > $SD/List');
    expect(text).toContain('      Zustand: Idle');
    expect(text).toContain('15:21:03 < error:60');
    expect(text).toContain(
      'Verfahrweg (Maschine): X 3…1223, Y 3…2443, Z -297…3, Soft-Limits der App an',
    );
    expect(text).toContain('Erstellt: 2026-11-25 15:30:00 (Europe/Berlin)');
  });

  it('separates this session from what the history kept from before', () => {
    const older = message({ id: 2, at: at(14, 0, 0), title: 'Früher', acknowledged: true });
    const text = buildReport(report({ messages: [message(), older] }));
    expect(text).toContain('== Meldungen dieser Sitzung (1) ==');
    expect(text).toContain('== Frühere Meldungen aus dem Verlauf (1) ==');
    expect(text.indexOf('Früher')).toBeGreaterThan(text.indexOf('== Frühere Meldungen'));
    expect(text).toContain('[bestätigt]');
  });

  it('says what a fault and a critical message are, and has hints without a state', () => {
    const text = buildReport(
      report({
        messages: [
          message({ id: 2, level: 'fault', title: 'Alarm', resolved: false, code: 'ALARM:2' }),
          message({ id: 3, level: 'fault', title: 'Alarm vorbei', resolved: true }),
          message({ id: 4, level: 'critical', title: 'Verbindung verloren', acknowledged: true }),
          message({ id: 5, level: 'hint', title: 'Hinweis' }),
        ],
      }),
    );
    expect(text).toContain('Störung · Alarm  (ALARM:2)  [steht an]');
    expect(text).toContain('Störung · Alarm vorbei  (error:60)  [behoben]');
    expect(text).toContain('Kritisch · Verbindung verloren  (error:60)  [bestätigt]');
    expect(text).toMatch(/Hinweis · Hinweis {2}\(error:60\)\n/);
  });

  it('says what it does not know – no Pi, no list of the SD card, no state', () => {
    const text = buildReport(report({ companion: null, messages: [], log: [] }));
    expect(text).toContain('antwortet nicht oder ist nicht eingerichtet');
    expect(text).toContain(
      'SD-Karte: Dateiliste: noch nicht gelesen (freier Platz wird nicht erfasst)',
    );
    expect(text).toContain('== Meldungen dieser Sitzung (0) ==\nkeine');
    expect(text).toContain('\nleer');
  });

  it("lists what the SD card has, and the machine's answers about it", () => {
    const files = Array.from({ length: 40 }, (_, i) => `datei${i}.nc`);
    const text = buildReport(
      report({
        machine: {
          ...report().machine,
          sd: { files, running: 'rahmen.nc', lastResult: 'aborted' },
        },
      }),
    );
    expect(text).toContain('SD-Karte: Dateiliste: 40 Dateien: datei0.nc');
    expect(text).toContain('datei29.nc');
    expect(text).not.toContain('datei30.nc');
    expect(text).toContain('SD-Karte: laufende Datei: rahmen.nc');
    expect(text).toContain('SD-Karte: letzter Job: aborted');
  });

  it('carries only the last lines of the log, and cuts a long one', () => {
    const log = Array.from({ length: REPORT_LOG_LINES + 50 }, (_, i) =>
      line(at(15, 0, 0) + i * 1000, 'in', `L${i}`),
    );
    log.push(line(at(16, 0, 0), 'in', 'y'.repeat(REPORT_LINE_MAX * 3)));
    const text = buildReport(report({ log }));
    expect(text).toContain(`die letzten ${REPORT_LOG_LINES} Zeilen`);
    expect(text).not.toContain(' L0\n');
    expect(text).not.toContain(' L50\n');
    expect(text).toContain(' L249\n');
    expect(text).toMatch(/y{250,}… \(\+\d+ Zeichen\)/);
  });

  it('holds no credentials: not in a log line, a message, the settings or the address – tested with a token and a password', () => {
    const text = buildReport(
      report({
        secrets: ['tok-9f8e7d6c5b4a'],
        log: [
          line(at(15, 1, 1), 'out', '$Sta/Password=Wlan-Passwort-77'),
          line(at(15, 1, 2), 'info', 'Anmeldung mit tok-9f8e7d6c5b4a'),
        ],
        messages: [
          message({ cause: 'GET http://bobo:pw-secret-5@pi/x?token=abc999 – fehlgeschlagen' }),
        ],
        settings: { note: 'psk=Netz-Schluessel-1' },
        machine: { ...report().machine, address: 'ws://user:addr-pass-3@192.168.0.198/fluidnc' },
      }),
    );
    for (const secret of [
      'Wlan-Passwort-77',
      'tok-9f8e7d6c5b4a',
      'pw-secret-5',
      'abc999',
      'Netz-Schluessel-1',
      'addr-pass-3',
    ]) {
      expect(text, secret).not.toContain(secret);
    }
    expect(text).toContain('[entfernt]');
  });
});

describe('what the review of the first version found', () => {
  it('a sent command with a passphrase of several words is cut after the = in the log, the facts and the context', () => {
    const sent = line(at(1, 2, 3), 'out', '$Sta/Password=Mein Werkstatt WLAN 2026');
    expect(logLine(sent)).toBe('01:02:03 > $Sta/Password=[entfernt]');
    const facts = factsOf(
      input({
        lastCommand: { line: '$Sta/Password=Mein Werkstatt WLAN 2026', state: 'ok', code: null },
      }),
    );
    const context = contextOf(
      input({
        log: [sent],
        lastCommand: { line: '$Sta/Password=Mein Werkstatt WLAN 2026', state: 'ok', code: null },
      }),
    );
    expect(JSON.stringify(context)).not.toContain('Werkstatt');
    expect(JSON.stringify(context)).not.toContain('2026');
    // the fact about the last command is redacted when it is written into the context (factsOf itself is plain)
    expect(facts.join('\n')).toContain('Letzter Bedienbefehl');
    const text = buildReport(
      report({
        log: [sent],
        machine: {
          ...report().machine,
          lastCommand: { line: '$Sta/Password=Mein Werkstatt WLAN 2026', state: 'ok', code: null },
        },
      }),
    );
    expect(text).not.toContain('Werkstatt WLAN');
    expect(text).not.toContain('Mein ');
  });

  it('says an alarm the controller is in even where its code was not reported', () => {
    const base = report().machine;
    expect(buildReport(report({ machine: { ...base, state: 'Alarm', alarm: null } }))).toContain(
      'Alarm: ja, Code nicht gemeldet',
    );
    expect(buildReport(report({ machine: { ...base, state: 'Alarm', alarm: 2 } }))).toContain(
      'Alarm: ALARM:2',
    );
    expect(buildReport(report({ machine: { ...base, state: 'Idle', alarm: null } }))).toContain(
      'Alarm: keiner',
    );
  });

  it('says the way direct to FluidNC as direct – no Pi that is not there', () => {
    const direct = factsOf(
      input({
        link: { phase: 'idle', failure: null, via: null, target: '192.168.0.200:81', attempt: 0 },
      }),
    );
    expect(direct).toContain('Weg: direkt → Jackpot 192.168.0.200:81');
    expect(direct.some((f) => f.includes('Pi'))).toBe(false);
    // through the Pi it still names it, and a Pi whose target is not known yet says so
    expect(
      factsOf(
        input({
          link: {
            phase: 'idle',
            failure: null,
            via: '192.168.0.198:8080',
            target: null,
            attempt: 0,
          },
        }),
      ),
    ).toContain('Weg: Pi 192.168.0.198:8080 → Jackpot ?');
    // no address at all: no way is told
    expect(factsOf(input()).some((f) => f.startsWith('Weg'))).toBe(false);
  });

  it('puts the date where a time is not of the day the report is made', () => {
    const now = at(15, 30, 0);
    expect(when(at(15, 21, 3), now)).toBe('15:21:03');
    expect(when(new Date(2026, 10, 24, 23, 59, 59).getTime(), now)).toBe('2026-11-24 23:59:59');
    const text = buildReport(
      report({
        now,
        messages: [message({ at: new Date(2026, 10, 24, 11, 57, 0).getTime(), title: 'Gestern' })],
        log: [line(new Date(2026, 10, 24, 11, 57, 1).getTime(), 'info', 'gestern')],
      }),
    );
    expect(text).toContain('[2026-11-24 11:57:00] Warnung · Gestern');
    expect(text).toContain('2026-11-24 11:57:01 · gestern');
  });

  it('redacts a log line before it is cut: a secret at the cut keeps no prefix', () => {
    const secret = 'S3cr3t-Token-0123456789';
    const text = buildReport(
      report({
        secrets: [secret],
        // the secret begins a few characters before the cut of the line
        log: [
          line(
            at(15, 1, 1),
            'in',
            `${'a'.repeat(REPORT_LINE_MAX - 20)} ${secret} ${'b'.repeat(100)}`,
          ),
        ],
      }),
    );
    expect(text).not.toContain(secret);
    expect(text).not.toContain('S3cr3t-T');
    expect(text).not.toContain('S3cr3t');
  });
});
