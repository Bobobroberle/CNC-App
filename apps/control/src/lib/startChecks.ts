/**
 * What has to be confirmed before a job starts (DESIGN.md §6.4): a start
 * without a zero set, a start with the tool below the safe height while the
 * program's first move travels sideways, and a spindle start with a tool that
 * is marked as a probe. These do not block – the operator may know better –
 * but each is said and confirmed, never passed over.
 */
export type StartWarning = 'zero' | 'lowZ' | 'probe';

export interface StartInput {
  /** The work offset is all zero: the zero is probably not set */
  zeroAtOrigin: boolean;
  /** Machine Z of the tool now; null while unknown */
  machineZ: number | null;
  /** The safe machine height, valid once homed */
  safeMachineZ: number;
  homed: boolean;
  /**
   * The program's first move: how far it travels in X/Y and whether it is
   * given in machine coordinates (G53); null for a program without moves
   */
  firstMove: { xy: number; machine: boolean } | null;
  /** The program switches the spindle on */
  spindleOn: boolean;
  /** A tool of the job is marked as a probe in the tool list */
  probeTool: boolean;
}

/** How far below the safe height still counts as "at the safe height", mm */
const Z_TOLERANCE = 0.5;

export function startWarnings(s: StartInput): StartWarning[] {
  const out: StartWarning[] = [];
  if (s.zeroAtOrigin) out.push('zero');
  // A program that lifts first is safe from any height; one that travels first is not.
  if (
    s.homed &&
    s.machineZ !== null &&
    s.machineZ < s.safeMachineZ - Z_TOLERANCE &&
    s.firstMove !== null &&
    s.firstMove.xy > 0.01
  ) {
    out.push('lowZ');
  }
  if (s.probeTool && s.spindleOn) out.push('probe');
  return out;
}

/**
 * Warnings that are confirmed once per job and then stay confirmed; a probe
 * in the spindle is asked about at every start.
 */
export function pendingWarnings(
  warnings: readonly StartWarning[],
  confirmed: readonly StartWarning[],
): StartWarning[] {
  return warnings.filter((w) => w === 'probe' || !confirmed.includes(w));
}
