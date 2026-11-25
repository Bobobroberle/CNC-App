import { contextOf, type ContextInput, type LogLine } from '../lib/diagnostics';
import type { Message, MessageContext } from '../lib/messages';
import { usePiLogin } from './piLogin';
import { useMachine } from './machine';

/**
 * What surrounded a moment, read from the machine's store: for the message that is made from it, and for the
 * diagnostic report. Only reads – nothing here sends a thing.
 */
type MachineState = ReturnType<typeof useMachine.getState>;

/** What the machine does for a job, in a few words – or null. */
export function jobOf(state: Pick<MachineState, 'fileJob' | 'stream' | 'status'>): string | null {
  const sd = state.status?.sd;
  if (state.fileJob) {
    return `SD-Karte: ${state.fileJob.name}${sd ? ` ${Math.round(sd.percent)} %` : ''}`;
  }
  if (sd) return `SD-Karte meldet ${sd.file} ${Math.round(sd.percent)} %`;
  if (state.stream && state.stream.result === 'running') return `Stream: ${state.stream.name}`;
  return null;
}

/** The facts of the machine's store, as `lib/diagnostics` wants them. */
export function contextInput(
  state: MachineState,
  key: string | undefined,
  log: readonly LogLine[],
): ContextInput {
  return {
    ...(key ? { key } : {}),
    connection: state.connection,
    ...(state.status ? { state: state.status.state, mpos: state.status.mpos } : {}),
    homed: state.homed,
    homedAxes: state.homedAxes,
    link: {
      phase: state.link.phase,
      failure: state.link.failure,
      via: state.link.via,
      target: state.link.target,
      attempt: state.link.attempt,
    },
    job: jobOf(state),
    lastCommand: state.lastCommand
      ? {
          line: state.lastCommand.line,
          state: state.lastCommand.state,
          code: state.lastCommand.code,
        }
      : null,
    log,
  };
}

/** Strings the app holds that must never stand in a report or a message's context. */
export function heldSecrets(): string[] {
  const login = usePiLogin.getState().login;
  return login ? [login.token] : [];
}

/** The levels that ask for a cause – and so are kept with their surroundings. */
const WITH_CONTEXT: readonly Message['level'][] = ['warning', 'fault', 'critical'];

/**
 * The surroundings of a message that is made now. `before`: the machine's log up to – not including – the line
 * the message is made from (what was sent and what came back).
 */
export function captureContext(
  level: Message['level'],
  state: MachineState,
  key: string | undefined,
  before: readonly LogLine[],
): MessageContext | undefined {
  if (!WITH_CONTEXT.includes(level)) return undefined;
  return contextOf(contextInput(state, key, before), heldSecrets());
}
