import {
  CONTEXT_FACTS_MAX,
  CONTEXT_LINE_MAX,
  CONTEXT_RECENT_MAX,
  type Level,
  type Message,
  type MessageContext,
} from './messages';

/**
 * The diagnostic report (Service → Meldungen): one text file with what a person – or whoever looks for the
 * cause – needs: the messages of the session with what surrounded each, how the machine and the way to it
 * stood, what was sent and what came back, and the settings that matter. Pure: the store collects, this
 * writes. **The report is always German** (like a log file it is read by people who speak German and by the
 * support, whatever the language of the screen); the messages in it are as they were shown.
 *
 * It sends nothing to the machine and holds no credentials: what could be one is taken out by `redact`.
 */
export const REPORT_FORMAT = 1;

/** A line of the machine's log, as far as the report needs it. */
export interface LogLine {
  time: number;
  kind: 'in' | 'out' | 'info' | 'error';
  text: string;
  code?: string;
}

/** How many lines of the machine's log the report carries */
export const REPORT_LOG_LINES = 200;
/** A line of the log longer than this is cut (a `$CD` answer is a page long) */
export const REPORT_LINE_MAX = 300;

const REMOVED = '[entfernt]';
/**
 * A line is cut to this before it is redacted: the patterns run in a time that grows with the length of a line without
 * a space, and nothing beyond the cut of the report (or of a message's context) is written anyway.
 */
const REDACT_MAX = 2000;

/**
 * Takes out what could be a credential from a text: `name=value` and `name: value` where the name says password,
 * secret, token, api key …, the user and password in front of a host (`ws://user:pw@host`), and every string in
 * `secrets` (the ones the app itself holds, like the login token of the Pi).
 *
 * No look-behind in here: an iPad with an older Safari (before 16.4) would not parse it, and the whole app is one script.
 */
export function redact(text: string, secrets: readonly string[] = []): string {
  let out = text;
  for (const secret of secrets) {
    // A secret of a few characters would take out ordinary words
    if (secret.length >= 6) out = out.split(secret).join(REMOVED);
  }
  // user and password in front of a host – with a scheme (`ws://u:p@host`) or without (`u:p@host:81`); a password
  // may hold an `@`: the login ends at the last one in front of the path
  out = out.replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/?#]*@/gi, '$1');
  out = out.replace(
    /(^|[^\w.@/-])[\w.-]+:[^\s/:]+@(?=[\w-]+(?:\.[\w-]+)*(?::\d+)?(?:[/\s)\]]|$))/g,
    '$1',
  );
  // the commands that write a credential in the other spellings FluidNC knows (`[ESP101]…`, `$ESP106=…`,
  // `$Notification/Setup=…`, `[ESP401]P=Sta/Password … V=…`): the value is the rest of the line
  out = out.replace(SECRET_COMMAND, `$1${REMOVED}`);
  // `$Notification/T1` and `T2` carry credentials, `$…/Password` and the like: the value of a setting is the rest of the line
  out = out.replace(SECRET_SETTING, `$1${REMOVED}`);
  // the name is a word of its own (`$Sta/Password`, `api_key`, `Passwort`), not a part of one (`Passmarken`, `compass`)
  out = out.replace(
    /((?:passwort|password|passwd|passphrase|psk|secret|token|credential|authorization|api[-_]?key)\w*)([ \t]*[=:][ \t]*)((?:(?:Bearer|Basic)[ \t]+)?(?:"[^"]*"|'[^']*'|\S+))/gi,
    `$1$2${REMOVED}`,
  );
  return out;
}

/**
 * FluidNC takes everything after the first `=` of `$name=value` as the value, spaces included: a Wi-Fi passphrase
 * of several words is one value. So for the settings that hold a credential the whole rest of the line goes.
 */
const SECRET_SETTING =
  /((?:^|[\s>:])\$[^\s=]{0,200}?(?:pass(?:word|wd|phrase)?|psk|secret|token|credential|notification\/t[12])[^\s=]{0,200}[ \t]*=[ \t]*).*$/gim;

/**
 * The same credentials written the other ways FluidNC takes them: `[ESP101]value` (Sta/Password), `[ESP106]` (AP/Password),
 * `[ESP555]` (login), `[ESP610]` and `$Notification/Setup` (T1, T2), a `[name]value` whose name says password, and the
 * `[ESP401]P=… V=…` that sets any setting – where P= names one that holds a credential.
 */
const SECRET_COMMAND =
  /((?:^|[\s>:])(?:\[(?:esp(?:101|106|555|610)|notification\/setup|[^\]\s]{0,100}?(?:pass|psk|secret|token|credential)[^\]\s]{0,100})\][ \t]*|\$(?:esp(?:101|106|555|610)|notification\/setup)[ \t]*=[ \t]*|(?:\[esp401\]|\$webui\/set=)(?=[^\n]{0,300}?\bp=[^\s=]{0,100}?(?:pass|psk|secret|token|credential|notification\/t[12]))[ \t]*))(?=\S).*$/gim;

/** An address without what must not leave: user and password in front of the host, a query, a fragment. */
export function safeHost(address: string): string {
  return address
    .trim()
    .replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/?#]*@/i, '$1')
    .replace(/^[^\s/?#]*@/, '')
    .replace(/[?#].*$/, '');
}

const two = (n: number) => String(n).padStart(2, '0');

/** `15:21:03` in the time of the device. */
export function clock(ms: number): string {
  const d = new Date(ms);
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
}

/** `2026-11-25 15:21:03` in the time of the device. */
export function stamp(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${clock(ms)}`;
}

/** The time of day – with the date where it is not the day the report is made (a message kept from yesterday). */
export function when(ms: number, now: number): string {
  return new Date(ms).toDateString() === new Date(now).toDateString() ? clock(ms) : stamp(ms);
}

const ARROW: Record<LogLine['kind'], string> = { out: '>', in: '<', info: '·', error: '!' };

const cut = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max)}… (+${text.length - max} Zeichen)` : text;

/** A line of the log as the report shows it (`now`: the time of the report, to put the date where it is another day). */
export function logLine(line: LogLine, secrets: readonly string[] = [], now?: number): string {
  const code = line.code ? ` [${line.code}]` : '';
  const time = now === undefined ? clock(line.time) : when(line.time, now);
  return redact(
    `${time} ${ARROW[line.kind]} ${line.text.trim().slice(0, REDACT_MAX)}${code}`,
    secrets,
  );
}

/** What the machine and the way to it looked like when something happened. */
export interface ContextInput {
  /** The key of the log line it came from */
  key?: string;
  connection: string;
  state?: string;
  homed: boolean;
  homedAxes: string;
  mpos?: readonly number[];
  link: {
    phase: string;
    failure: string | null;
    via: string | null;
    target: string | null;
    attempt: number;
  };
  /** What the machine does for a job, if anything (`SD: rahmen.nc 42 %`, `Stream: …`) */
  job: string | null;
  lastCommand: { line: string; state: 'sent' | 'ok' | 'error'; code: number | null } | null;
  /** The log up to – not including – the line that is the message, newest last */
  log: readonly LogLine[];
}

const place = (mpos: readonly number[]) =>
  ['X', 'Y', 'Z', 'A']
    .map((axis, i) => (mpos[i] === undefined ? null : `${axis} ${mpos[i]!.toFixed(2)}`))
    .filter((v) => v !== null)
    .join('  ');

/** The facts about the machine for one line each – the same for the report's own section. */
export function factsOf(input: Omit<ContextInput, 'log' | 'key'>): string[] {
  const facts = [`Verbindung: ${input.connection}`];
  if (input.state) facts.push(`Zustand: ${input.state}`);
  facts.push(
    `Referenziert: ${input.homed ? 'ja' : input.homedAxes ? `nur ${input.homedAxes}` : 'nein'}`,
  );
  if (input.mpos && input.mpos.length > 0) facts.push(`Position (Maschine): ${place(input.mpos)}`);
  const { link } = input;
  if (link.via) facts.push(`Weg: Pi ${link.via} → Jackpot ${link.target ?? '?'}`);
  else if (link.target) facts.push(`Weg: direkt → Jackpot ${link.target}`);
  if (link.phase !== 'idle') {
    const failure = link.failure ? `, fehlt: ${link.failure}` : '';
    facts.push(`Verbindungsversuch: ${link.phase}${failure}, Versuch ${link.attempt}`);
  }
  if (input.job) facts.push(`Job: ${input.job}`);
  if (input.lastCommand) {
    const c = input.lastCommand;
    const result =
      c.state === 'ok' ? 'ok' : c.state === 'sent' ? 'ohne Antwort' : `error:${c.code ?? '?'}`;
    // Only what was sent from the screens and the console (`command()`): what the app asks by itself – the list
    // of the SD card, the status – stands in the log
    facts.push(`Letzter Bedienbefehl: ${c.line} → ${result}`);
  }
  return facts;
}

/**
 * The context of a message: facts and the last lines of the log, each one short and without credentials.
 * Capped (a message is kept with it in the browser's storage, up to 200 of them).
 */
export function contextOf(input: ContextInput, secrets: readonly string[] = []): MessageContext {
  // Redacted first, then cut: a secret cut in half would no longer be found
  const line = (text: string) => redact(text, secrets).slice(0, CONTEXT_LINE_MAX);
  return {
    ...(input.key ? { key: line(input.key) } : {}),
    facts: factsOf(input).slice(0, CONTEXT_FACTS_MAX).map(line),
    recent: input.log.slice(-CONTEXT_RECENT_MAX).map((l) => line(logLine(l, secrets))),
  };
}

const LEVEL_NAME: Record<Level, string> = {
  critical: 'Kritisch',
  fault: 'Störung',
  warning: 'Warnung',
  hint: 'Hinweis',
  info: 'Information',
};

/** Everything the report is made of. */
export interface ReportInput {
  now: number;
  /** When this page was loaded: the messages from then on are "this session" */
  sessionStart: number;
  timeZone: string;
  app: {
    area: string;
    origin: string;
    userAgent: string;
    language: string;
    viewport: string;
    online: boolean;
  };
  /** What the Pi's companion said last (null: none answers) */
  companion: Record<string, string | number | boolean | null> | null;
  /** The machine and the way to it – the facts of `factsOf` and more */
  machine: Omit<ContextInput, 'log' | 'key'> & {
    address: string;
    firmware: string | null;
    simulator: boolean;
    wpos?: readonly number[];
    wco?: readonly number[];
    feed?: number;
    spindle?: number;
    alarm: number | null;
    modal: string | null;
    autoRetry: boolean;
    viewer: boolean;
    lostInJob: string | null;
    sd: { files: string[] | null; running: string | null; lastResult: string | null };
  };
  profile: {
    softLimits: boolean;
    travel: {
      x: { min: number; max: number };
      y: { min: number; max: number };
      z: { min: number; max: number };
    };
  };
  /** The settings that matter, picked by name – never the whole document */
  settings: Record<string, unknown>;
  messages: readonly Message[];
  log: readonly LogLine[];
  /** Strings the app holds that must not appear (the login token of the Pi …) */
  secrets: readonly string[];
}

const heading = (title: string) => `\n== ${title} ==`;
const pair = (label: string, value: string | number | boolean | null | undefined) =>
  `${label}: ${value === null || value === undefined || value === '' ? '–' : String(value)}`;

function messageBlock(m: Message, now: number): string[] {
  const code = m.code ? `  (${m.code})` : '';
  const state =
    m.level === 'fault'
      ? m.resolved
        ? 'behoben'
        : 'steht an'
      : m.level === 'warning' || m.level === 'critical'
        ? m.acknowledged
          ? 'bestätigt'
          : 'offen'
        : '';
  const lines = [
    `[${when(m.at, now)}] ${LEVEL_NAME[m.level]} · ${m.title}${code}${state ? `  [${state}]` : ''}`,
    `    Ursache: ${m.cause}`,
    `    Auswirkung: ${m.effect}`,
    `    Maßnahme: ${m.action}`,
  ];
  if (m.context) {
    if (m.context.key) lines.push(`    Schlüssel: ${m.context.key}`);
    if (m.context.facts.length > 0) {
      lines.push('    Umfeld:');
      for (const fact of m.context.facts) lines.push(`      ${fact}`);
    }
    if (m.context.recent.length > 0) {
      lines.push('    Davor im Protokoll:');
      for (const recent of m.context.recent) lines.push(`      ${recent}`);
    }
  }
  return lines;
}

/** The report as text. */
export function buildReport(input: ReportInput): string {
  const { machine, profile, app } = input;
  const out: string[] = [];
  out.push(`LowRider Control – Diagnosebericht (Format ${REPORT_FORMAT})`);
  out.push(
    `Erstellt: ${stamp(input.now)} (${input.timeZone}), UTC ${new Date(input.now).toISOString()}`,
  );
  out.push(`Seite geladen: ${stamp(input.sessionStart)}`);
  out.push('Der Bericht enthält keine Zugangsdaten und sendet nichts an die Maschine.');

  out.push(heading('Gerät'));
  out.push(pair('Bereich der App', app.area));
  out.push(pair('Von', app.origin));
  out.push(pair('Browser', app.userAgent));
  out.push(pair('Sprache', app.language));
  out.push(pair('Fenster', app.viewport));
  out.push(pair('Netz', app.online ? 'online' : 'offline'));

  out.push(heading('Pi (Companion)'));
  if (input.companion === null) out.push('antwortet nicht oder ist nicht eingerichtet');
  else for (const [k, v] of Object.entries(input.companion)) out.push(pair(k, v));

  out.push(heading('Maschine und Verbindung'));
  out.push(pair('Adresse', machine.address));
  out.push(pair('Simulator', machine.simulator ? 'ja' : 'nein'));
  out.push(pair('Firmware', machine.firmware));
  for (const fact of factsOf(machine)) out.push(fact);
  out.push(
    pair(
      'Alarm',
      machine.alarm !== null
        ? `ALARM:${machine.alarm}`
        : machine.state === 'Alarm'
          ? 'ja, Code nicht gemeldet'
          : 'keiner',
    ),
  );
  if (machine.wpos) out.push(pair('Position (Werkstück)', place(machine.wpos)));
  if (machine.wco) out.push(pair('Nullpunkt-Versatz', place(machine.wco)));
  out.push(
    pair('Vorschub / Spindel', `${machine.feed ?? '–'} mm/min / ${machine.spindle ?? '–'} U/min`),
  );
  out.push(pair('Aktive Befehle ($G)', machine.modal));
  out.push(pair('Wiederverbinden von selbst', machine.autoRetry ? 'an' : 'aus'));
  out.push(pair('Nur zuschauen (anderes Gerät steuert)', machine.viewer ? 'ja' : 'nein'));
  out.push(pair('Verbindung im Job verloren', machine.lostInJob));
  out.push(pair('SD-Karte: laufende Datei', machine.sd.running));
  out.push(pair('SD-Karte: letzter Job', machine.sd.lastResult));
  out.push(
    pair(
      'SD-Karte: Dateiliste',
      machine.sd.files === null
        ? 'noch nicht gelesen (freier Platz wird nicht erfasst)'
        : `${machine.sd.files.length} Dateien${machine.sd.files.length > 0 ? `: ${machine.sd.files.slice(0, 30).join(', ')}` : ''}`,
    ),
  );
  const t = profile.travel;
  out.push(
    pair(
      'Verfahrweg (Maschine)',
      `X ${t.x.min}…${t.x.max}, Y ${t.y.min}…${t.y.max}, Z ${t.z.min}…${t.z.max}, Soft-Limits der App ${profile.softLimits ? 'an' : 'aus'}`,
    ),
  );

  out.push(heading('Einstellungen (Auswahl, ohne Zugangsdaten)'));
  out.push(JSON.stringify(input.settings, null, 2));

  const sorted = [...input.messages].sort((a, b) => a.at - b.at);
  const now = sorted.filter((m) => m.at >= input.sessionStart);
  const before = sorted.filter((m) => m.at < input.sessionStart);
  out.push(heading(`Meldungen dieser Sitzung (${now.length})`));
  if (now.length === 0) out.push('keine');
  for (const m of now) out.push(...messageBlock(m, input.now));
  out.push(heading(`Frühere Meldungen aus dem Verlauf (${before.length})`));
  if (before.length === 0) out.push('keine');
  for (const m of before) out.push(...messageBlock(m, input.now));

  const log = input.log.slice(-REPORT_LOG_LINES);
  out.push(
    heading(
      `Protokoll der Steuerung (die letzten ${log.length} Zeilen; > gesendet, < empfangen, · App, ! Fehler)`,
    ),
  );
  if (log.length === 0) out.push('leer');
  for (const line of log) {
    // Redacted before it is cut: a secret cut in half would no longer be found
    out.push(cut(logLine(line, input.secrets, input.now), REPORT_LINE_MAX));
  }
  out.push('');
  return redact(out.join('\n'), input.secrets);
}
