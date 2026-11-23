import { interpret, MM_PER_INCH, type InterpreterOptions } from './interpreter';
import { parseProgram, type ParsedLine, type Word } from './parser';
import type { Diagnostic, ModalState, Plane } from './types';

/**
 * Work-coordinate transformation applied to G-code before streaming.
 * Order: scale about the pivot, rotate about the pivot, then offset.
 */
export interface Transform {
  /** mm */
  offset?: { x?: number; y?: number; z?: number };
  /** Degrees, counter-clockwise about Z */
  rotation?: number;
  /** mm, work coordinates */
  pivot?: { x: number; y: number };
  /** Uniform XY scale factor (> 0) */
  scale?: number;
  /** Apply `scale` to Z as well */
  scaleZ?: boolean;
}

export interface TransformResult {
  text: string;
  diagnostics: Diagnostic[];
}

interface Effective {
  units: ModalState['units'];
  distance: ModalState['distance'];
  arcDistance: ModalState['arcDistance'];
  plane: Plane;
  motion: ModalState['motion'];
  machineCoordinates: boolean;
}

function effectiveModes(words: Word[], before: ModalState): Effective {
  const e: Effective = {
    units: before.units,
    distance: before.distance,
    arcDistance: before.arcDistance,
    plane: before.plane,
    motion: before.motion,
    machineCoordinates: false,
  };
  for (const w of words) {
    if (w.letter !== 'G') continue;
    const code = Math.round(w.value * 10);
    if (code === 200) e.units = 'inch';
    else if (code === 210) e.units = 'mm';
    else if (code === 900) e.distance = 'absolute';
    else if (code === 910) e.distance = 'incremental';
    else if (code === 901) e.arcDistance = 'absolute';
    else if (code === 911) e.arcDistance = 'incremental';
    else if (code === 170) e.plane = 'XY';
    else if (code === 180) e.plane = 'ZX';
    else if (code === 190) e.plane = 'YZ';
    else if (code === 0) e.motion = 'G0';
    else if (code === 10) e.motion = 'G1';
    else if (code === 20) e.motion = 'G2';
    else if (code === 30) e.motion = 'G3';
    else if (code === 530) e.machineCoordinates = true;
  }
  return e;
}

export function formatNumber(value: number, units: ModalState['units'] = 'mm'): string {
  const text = value.toFixed(units === 'inch' ? 5 : 4).replace(/\.?0+$/, '');
  return text === '-0' ? '0' : text;
}

const COORDINATE_LETTERS = ['X', 'Y', 'Z', 'I', 'J', 'K', 'R'];

function rebuildLine(line: ParsedLine, replaced: Map<string, string>): string {
  const tokens: { letter: string; text: string }[] = [];
  for (const w of line.words) {
    tokens.push({ letter: w.letter, text: `${w.letter}${replaced.get(w.letter) ?? w.value}` });
  }
  // Words added by the transform go next to their neighbours in X Y Z I J K R order.
  for (const letter of COORDINATE_LETTERS) {
    const text = replaced.get(letter);
    if (text === undefined || tokens.some((t) => t.letter === letter)) continue;
    const rank = COORDINATE_LETTERS.indexOf(letter);
    let at = tokens.findIndex((t) => COORDINATE_LETTERS.indexOf(t.letter) > rank);
    if (at < 0) at = tokens.findLastIndex((t) => replaced.has(t.letter)) + 1;
    tokens.splice(at, 0, { letter, text: `${letter}${text}` });
  }
  let text = tokens.map((t) => t.text).join(' ');
  if (line.lineNumber !== undefined) text = `N${line.lineNumber} ${text}`;
  for (const c of line.comments) {
    text += c.style === 'paren' ? ` (${c.text})` : ` ;${c.text}`;
  }
  return text;
}

/**
 * Rewrites a program with a work-coordinate transformation, line by line.
 * Lines without coordinates, G53 machine moves and comments stay verbatim.
 */
export function transformProgram(
  text: string,
  transform: Transform,
  options: InterpreterOptions = {},
): TransformResult {
  const parsed = parseProgram(text);
  const result = interpret(parsed, { ...options, recordLines: true });
  const diagnostics: Diagnostic[] = [];

  const scale = transform.scale ?? 1;
  if (!(scale > 0)) throw new RangeError('scale must be greater than 0');
  const zScale = transform.scaleZ ? scale : 1;
  const theta = ((transform.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const rotated = theta !== 0;
  const pivot = transform.pivot ?? { x: 0, y: 0 };
  const ox = transform.offset?.x ?? 0;
  const oy = transform.offset?.y ?? 0;
  const oz = transform.offset?.z ?? 0;

  const point = (x: number, y: number) => {
    const dx = (x - pivot.x) * scale;
    const dy = (y - pivot.y) * scale;
    return { x: pivot.x + dx * cos - dy * sin + ox, y: pivot.y + dx * sin + dy * cos + oy };
  };
  const vector = (x: number, y: number) => ({
    x: (x * cos - y * sin) * scale,
    y: (x * sin + y * cos) * scale,
  });

  const known = { X: false, Y: false };
  const out: string[] = [];

  for (let i = 0; i < parsed.length; i++) {
    const line = parsed[i]!;
    const info = result.lines[i]!;
    const issue = (severity: Diagnostic['severity'], code: Diagnostic['code'], message: string) =>
      diagnostics.push({ severity, code, lineIndex: line.index, message });

    if (info.skipped || info.axisUse === 'none') {
      out.push(line.raw);
      continue;
    }
    if (info.axisUse === 'offset') {
      issue('error', 'transform-unsupported', 'G10/G92 offsets cannot be transformed');
      out.push(line.raw);
      continue;
    }
    if (info.axisUse === 'ignored') {
      issue(
        'warning',
        'transform-unsupported',
        'Move to stored/probed position left untransformed',
      );
      out.push(line.raw);
      continue;
    }

    const e = effectiveModes(line.words, info.stateBefore);
    const value = (letter: string) => line.words.find((w) => w.letter === letter)?.value;
    if (e.machineCoordinates) {
      // Machine moves are never transformed but they do define the position.
      if (value('X') !== undefined) known.X = true;
      if (value('Y') !== undefined) known.Y = true;
      out.push(line.raw);
      continue;
    }

    const uf = e.units === 'inch' ? MM_PER_INCH : 1;
    const fmt = (mm: number) => formatNumber(mm / uf, e.units);
    const replaced = new Map<string, string>();
    const X = value('X');
    const Y = value('Y');
    const Z = value('Z');

    if (X !== undefined || Y !== undefined) {
      if (e.distance === 'absolute') {
        const p = point(info.workAfter.x, info.workAfter.y);
        if (rotated) {
          for (const axis of ['X', 'Y'] as const) {
            if (!known[axis] && value(axis) === undefined) {
              issue('warning', 'transform-assumed-position', `${axis} position unknown, assumed 0`);
            }
          }
          replaced.set('X', fmt(p.x));
          replaced.set('Y', fmt(p.y));
          known.X = known.Y = true;
        } else {
          if (X !== undefined) replaced.set('X', fmt(p.x));
          if (Y !== undefined) replaced.set('Y', fmt(p.y));
        }
        if (X !== undefined) known.X = true;
        if (Y !== undefined) known.Y = true;
      } else {
        const v = vector((X ?? 0) * uf, (Y ?? 0) * uf);
        if (rotated || X !== undefined) replaced.set('X', fmt(v.x));
        if (rotated || Y !== undefined) replaced.set('Y', fmt(v.y));
      }
    }
    if (Z !== undefined) {
      const z = Z * uf;
      replaced.set('Z', fmt(e.distance === 'absolute' ? z * zScale + oz : z * zScale));
    }

    if (e.motion === 'G2' || e.motion === 'G3') {
      const I = value('I');
      const J = value('J');
      const K = value('K');
      const R = value('R');
      if (e.plane === 'XY') {
        if (I !== undefined || J !== undefined) {
          if (e.arcDistance === 'absolute') {
            // Absolute centres are work coordinates; a missing word means 0.
            const c = point((I ?? 0) * uf, (J ?? 0) * uf);
            replaced.set('I', fmt(c.x));
            replaced.set('J', fmt(c.y));
          } else {
            const v = vector((I ?? 0) * uf, (J ?? 0) * uf);
            if (rotated || I !== undefined) replaced.set('I', fmt(v.x));
            if (rotated || J !== undefined) replaced.set('J', fmt(v.y));
          }
        }
        if (R !== undefined) replaced.set('R', fmt(R * uf * scale));
      } else if (rotated || zScale !== scale) {
        issue(
          'error',
          'transform-unsupported',
          `Arc in plane ${e.plane} cannot be rotated or scaled in XY only`,
        );
        out.push(line.raw);
        continue;
      } else {
        const absolute = e.arcDistance === 'absolute';
        if (I !== undefined) replaced.set('I', fmt(absolute ? point(I * uf, 0).x : I * uf * scale));
        if (J !== undefined) replaced.set('J', fmt(absolute ? point(0, J * uf).y : J * uf * scale));
        if (K !== undefined)
          replaced.set('K', fmt(absolute ? K * uf * zScale + oz : K * uf * zScale));
        if (R !== undefined) replaced.set('R', fmt(R * uf * scale));
      }
    }

    // Keep words whose value does not change so untouched lines stay verbatim.
    for (const [letter, text] of replaced) {
      const original = value(letter);
      if (original !== undefined && formatNumber(original, e.units) === text)
        replaced.delete(letter);
    }
    out.push(replaced.size === 0 ? line.raw : rebuildLine(line, replaced));
  }

  const trailingNewline = /\r?\n$/.test(text);
  return { text: out.join('\n') + (trailingNewline ? '\n' : ''), diagnostics };
}
