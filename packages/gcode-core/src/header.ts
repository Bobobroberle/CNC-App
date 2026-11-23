import { parseProgram, type ParsedLine } from './parser';

export interface CamTool {
  /** T number, where the CAM gives one */
  number: number | null;
  name: string;
  /** Diameter in mm, read from the name or a D= field */
  diameter: number | null;
}

export interface CamInfo {
  /** Program that wrote the file, e.g. "Estlcam 11", or null */
  generator: string | null;
  tools: CamTool[];
}

const HEADER_LINES = 80;

const diameterIn = (text: string): number | null => {
  const m = /(?:^|[^\w.])D\s*=\s*(\d+(?:\.\d+)?)|(\d+(?:[.,]\d+)?)\s*mm\b/i.exec(text);
  if (!m) return null;
  return Number((m[1] ?? m[2]!).replace(',', '.'));
};

const commentOnly = (l: ParsedLine) => l.words.length === 0 && l.comments.length > 0;

/**
 * What the CAM program says about itself in the comment header: Estlcam
 * names its tools after "(Benötigte Werkzeuge:)", Fusion 360 lists
 * "(T1 D=8 … )". Used to pick the right cutter when the file has no T words.
 */
export function camInfo(text: string): CamInfo {
  const lines = parseProgram(text.split(/\r?\n/, HEADER_LINES).join('\n'));
  let generator: string | null = null;
  const tools: CamTool[] = [];
  for (let i = 0; i < lines.length; i++) {
    for (const c of lines[i]!.comments) {
      const estlcam = /Estlcam\s+Version\s+(\d+)/i.exec(c.text);
      if (estlcam) generator = `Estlcam ${estlcam[1]}`;
      const fusion = /^T(\d+)\s+D\s*=/i.exec(c.text);
      if (fusion) {
        tools.push({ number: Number(fusion[1]), name: c.text, diameter: diameterIn(c.text) });
      }
    }
    // Estlcam: one comment line per tool, up to the first blank or code line.
    if (lines[i]!.comments.some((c) => /^(Benötigte Werkzeuge|Required tools):?$/i.test(c.text))) {
      for (i++; i < lines.length && commentOnly(lines[i]!); i++) {
        const name = lines[i]!.comments[0]!.text;
        tools.push({ number: null, name, diameter: diameterIn(name) });
      }
    }
  }
  return { generator, tools };
}

export interface PreambleResult {
  text: string;
  /** True when a preamble line was put in front */
  added: boolean;
}

const MOTION = new Set([0, 1, 2, 3]);
const isMotion = (l: ParsedLine) =>
  l.words.some(
    (w) =>
      (w.letter === 'G' && MOTION.has(w.value)) ||
      w.letter === 'X' ||
      w.letter === 'Y' ||
      w.letter === 'Z',
  );

/**
 * Puts `G21 G90 G17 G94` in front of a program that moves before setting
 * units and absolute distance itself (Estlcam does not). Otherwise it would
 * run in whatever mode the controller was left in – after a relative jog
 * or probe that could be G91. The program's own words still come after it.
 */
export function ensureModalPreamble(text: string): PreambleResult {
  let absolute = false;
  let unitsSet = false;
  for (const line of parseProgram(text)) {
    if (line.words.some((w) => w.letter === 'G' && w.value === 90)) absolute = true;
    if (line.words.some((w) => w.letter === 'G' && (w.value === 21 || w.value === 20))) {
      unitsSet = true;
    }
    if (isMotion(line)) break;
  }
  if (absolute && unitsSet) return { text, added: false };
  return { text: `G21 G90 G17 G94 (LowRider Control: safe modes)\n${text}`, added: true };
}
