import { buildReport, redact, safeHost, type LogLine, type ReportInput } from '../lib/diagnostics';
import { downloadText } from '../lib/download';
import { isSimulatorAddress } from '../sim';
import { useJob } from './job';
import { heldSecrets, jobOf } from './context';
import { useMachine } from './machine';
import { useMessages } from './messages';
import { useUi } from './ui';
import { useWorkshop } from './workshop';

/**
 * The diagnostic report (Service → Meldungen): collects what the stores know and hands it to the pure writer
 * (`lib/diagnostics.ts`). **Only reads**: no command goes to the machine, no request to the Pi – it also works
 * during a job and without the Pi, and says what it does not know.
 */

/** When this page was loaded: the messages from then on are "this session". */
export const SESSION_START = Date.now();

/** The settings that matter for a cause, picked by name – never the whole document, never an address as typed. */
function pickedSettings(): Record<string, unknown> {
  const s = useWorkshop.getState().settings;
  return {
    language: s.language,
    safeMachineZ: s.safeMachineZ,
    companion: s.companionUrl ? safeHost(s.companionUrl) : null,
    camera: {
      source: s.camera.source,
      offsetX: s.camera.offsetX,
      offsetY: s.camera.offsetY,
      pxPerMm: s.camera.pxPerMm,
      rotation: s.camera.rotation,
      scaleCalibrated: s.camera.scaleCalibrated,
      focusHeight: s.camera.focusHeight,
      lightMarker: s.camera.lightMarker,
    },
    calibration: s.calibration,
    spindle: s.spindle,
  };
}

/** What the Pi's companion said last, picked by name. */
function companionFacts(): ReportInput['companion'] {
  const h = useWorkshop.getState().companionHealth;
  if (!h) return null;
  return {
    version: h.version,
    build: h.build ?? null,
    commit: h.commit ?? null,
    fluidncConnected: h.fluidnc?.connected ?? null,
    fluidncClients: h.fluidnc?.clients ?? null,
    update: h.update ?? null,
    login: h.auth ?? null,
    recordings: h.recordings ?? null,
    backupLast: h.backup?.last ?? null,
    backupError: h.backup?.error ?? null,
  };
}

/** Everything the report is made of, read now. */
export function collectReport(now = Date.now()): ReportInput {
  const m = useMachine.getState();
  const { profile } = useJob.getState();
  const log: LogLine[] = m.log.map((e) => ({
    time: e.time,
    kind: e.kind,
    text: e.text,
    ...(e.code ? { code: e.code } : {}),
  }));
  const sdRunning = m.status?.sd
    ? `${m.status.sd.file} ${Math.round(m.status.sd.percent)} %`
    : null;
  return {
    now,
    sessionStart: SESSION_START,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'unbekannt',
    app: {
      area: useUi.getState().place,
      origin: typeof location === 'undefined' ? '' : safeHost(location.origin),
      userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
      language: typeof navigator === 'undefined' ? '' : navigator.language,
      viewport: typeof window === 'undefined' ? '' : `${window.innerWidth} × ${window.innerHeight}`,
      online: typeof navigator === 'undefined' ? true : navigator.onLine,
    },
    companion: companionFacts(),
    machine: {
      connection: m.connection,
      address: m.url.trim() === '' ? '' : safeHost(m.url),
      firmware: m.firmware,
      simulator: isSimulatorAddress(m.url),
      ...(m.status
        ? {
            state: m.status.state,
            mpos: m.status.mpos,
            wpos: m.status.wpos,
            wco: m.status.wco,
            feed: m.status.feed,
            spindle: m.status.spindle,
          }
        : {}),
      homed: m.homed,
      homedAxes: m.homedAxes,
      alarm: m.alarm,
      modal: m.parserState ? JSON.stringify(m.parserState) : null,
      link: {
        phase: m.link.phase,
        failure: m.link.failure,
        via: m.link.via,
        target: m.link.target,
        attempt: m.link.attempt,
      },
      job: jobOf(m),
      lastCommand: m.lastCommand
        ? { line: m.lastCommand.line, state: m.lastCommand.state, code: m.lastCommand.code }
        : null,
      autoRetry: m.autoRetry,
      viewer: m.viewer,
      lostInJob: m.lostInJob ? `${m.lostInJob.name}${m.lostInJob.sd ? ' (SD-Karte)' : ''}` : null,
      sd: {
        files: m.sdFiles ? m.sdFiles.map((f) => f.name) : null,
        running: m.fileJob?.name ?? sdRunning,
        lastResult: m.lastFileResult,
      },
    },
    profile: { softLimits: profile.softLimits, travel: profile.travel },
    settings: pickedSettings(),
    messages: useMessages.getState().messages,
    log,
    secrets: heldSecrets(),
  };
}

/** The file name of a report made at `now`: `lowrider-diagnose-20261125-152103.txt` (the time of the device). */
export function reportFileName(now: number): string {
  const d = new Date(now);
  const two = (n: number) => String(n).padStart(2, '0');
  return `lowrider-diagnose-${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}.txt`;
}

/** Writes the report and offers it as a file. Returns its name. */
export function exportReport(now = Date.now()): string {
  const name = reportFileName(now);
  // Whatever the file name could carry is no secret – but the text is passed through once more, as a whole
  downloadText(name, redact(buildReport(collectReport(now)), heldSecrets()));
  return name;
}
