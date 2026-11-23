import { safeFileName } from '@lowrider/fluidnc-client';
import {
  analyzeProgram,
  ensureModalPreamble,
  removeToolLengthTable,
  splitAtToolChanges,
  type Kinematics,
} from '@lowrider/gcode-core';

export interface PreparedPart {
  number: number;
  tool: number | undefined;
  /** File name for the SD card */
  fileName: string;
  text: string;
  lineCount: number;
  /** Estimated run time, seconds */
  seconds: number;
  /** Errors left after repair (should be none) */
  errors: number;
}

export interface PreparedJob {
  /** Lines where G43 H was removed */
  repairedLines: number[];
  /** `G21 G90 G17 G94` was put in front because the file moves before setting them */
  addedPreamble: boolean;
  parts: PreparedPart[];
}

/**
 * Makes a CAM file safe to run from FluidNC's SD card: sets units and
 * absolute distance where the file does not (Estlcam), removes tool-table
 * offsets and splits at tool changes, which FluidNC would run through.
 */
export function prepareJob(text: string, fileName: string, kinematics: Kinematics): PreparedJob {
  const repaired = removeToolLengthTable(text);
  const safe = ensureModalPreamble(repaired.text);
  const parts = splitAtToolChanges(safe.text);
  const base = safeFileName(fileName.replace(/\.[^.]*$/, ''));
  return {
    repairedLines: repaired.changedLines,
    addedPreamble: safe.added,
    parts: parts.map((p) => {
      const analysis = analyzeProgram(p.text, { kinematics, rotaryAxis: false });
      const suffix =
        parts.length === 1
          ? ''
          : `_${p.number}of${parts.length}${p.tool === undefined ? '' : `_T${p.tool}`}`;
      return {
        number: p.number,
        tool: p.tool,
        fileName: `${base}${suffix}.nc`,
        text: p.text,
        lineCount: analysis.lineCount,
        seconds: analysis.timeline?.total ?? 0,
        errors: analysis.diagnostics.filter((d) => d.severity === 'error').length,
      };
    }),
  };
}

let cache: {
  fileName: string;
  lines: readonly string[];
  kinematics: Kinematics;
  result: PreparedJob;
} | null = null;

/**
 * The prepared parts of the loaded job, computed once per job: the start,
 * the readiness check and the parts list all ask for them.
 */
export function preparedFor(
  fileName: string,
  lines: readonly string[],
  kinematics: Kinematics,
): PreparedJob {
  if (
    cache &&
    cache.fileName === fileName &&
    cache.lines === lines &&
    cache.kinematics === kinematics
  ) {
    return cache.result;
  }
  const result = prepareJob(lines.join('\n'), fileName, kinematics);
  cache = { fileName, lines, kinematics, result };
  return result;
}
