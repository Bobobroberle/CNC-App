import type { Vec } from './calibration';

/**
 * Printed markers ("tags" in the code – the round dots of the calibration
 * plate had the name marker first): a small square code the camera can read.
 * A dark border one module wide around 5 × 5 data cells, with one module of
 * white paper around it. The number of a tag is what is printed beside it
 * (1 … `TAG_COUNT`); the dictionary is made here, deterministically, and is
 * our own – not ArUco.
 *
 * Every code differs from every other one, and from itself turned by a
 * quarter, a half or three quarters, in at least `TAG_DISTANCE` cells. A tag
 * read with one wrong cell is still taken; anything further off is no tag,
 * and it would take seven wrong cells to read one tag as another.
 */

/** Data cells per side */
export const TAG_CELLS = 5;
/** Modules per side of the dark square: the border and the data cells */
export const TAG_MODULES = TAG_CELLS + 2;
/** How many tags there are: numbers 1 … 48 */
export const TAG_COUNT = 48;
/** Least number of cells in which two codes differ, however they are turned */
export const TAG_DISTANCE = 8;
/** Side of the dark square of the tags that can be printed, mm */
export const TAG_SIZES = [20, 30, 40, 60] as const;

const BITS = TAG_CELLS * TAG_CELLS;

/** Number of set bits. */
function ones(v: number): number {
  let n = 0;
  for (let w = v; w !== 0; w &= w - 1) n++;
  return n;
}

/**
 * A code turned by a quarter turn clockwise, as seen. Bit `row · 5 + column`
 * is the cell in that row (from the top) and column (from the left); a set
 * bit is a dark cell.
 */
export function rotateCode(code: number): number {
  let out = 0;
  for (let r = 0; r < TAG_CELLS; r++) {
    for (let c = 0; c < TAG_CELLS; c++) {
      // The cell that was at the bottom of column r is now in row r.
      if (code & (1 << ((TAG_CELLS - 1 - c) * TAG_CELLS + r))) out |= 1 << (r * TAG_CELLS + c);
    }
  }
  return out;
}

interface Entry {
  code: number;
  /** The code turned by 0, 1, 2 and 3 quarter turns clockwise */
  turned: [number, number, number, number];
}

let table: Entry[] | null = null;

function dictionary(): Entry[] {
  if (table) return table;
  // The same sequence on every machine and for ever: printed tags must stay readable.
  let a = 20261111;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
  const found: Entry[] = [];
  while (found.length < TAG_COUNT) {
    const code = next() & ((1 << BITS) - 1);
    const dark = ones(code);
    // About half dark, half light: the reader takes its two tones from the tag itself.
    if (dark < 10 || dark > 15) continue;
    const r1 = rotateCode(code);
    const r2 = rotateCode(r1);
    const r3 = rotateCode(r2);
    const turned: [number, number, number, number] = [code, r1, r2, r3];
    // Which way round it lies must be as clear as which tag it is.
    if (turned.slice(1).some((r) => ones(code ^ r) < TAG_DISTANCE)) continue;
    if (found.some((f) => turned.some((r) => ones(f.code ^ r) < TAG_DISTANCE))) continue;
    found.push({ code, turned });
  }
  table = found;
  return table;
}

/** The codes of all tags; the code of tag `n` is at `n − 1`. */
export function tagCodes(): number[] {
  return dictionary().map((d) => d.code);
}

/** Whether `id` is the number of a tag. */
export const isTagId = (id: unknown): id is number =>
  typeof id === 'number' && Number.isInteger(id) && id >= 1 && id <= TAG_COUNT;

/** The data cells of a tag as printed: rows from the top, `true` is dark. Null for no such tag. */
export function tagCells(id: number): boolean[][] | null {
  if (!isTagId(id)) return null;
  const code = dictionary()[id - 1]!.code;
  return Array.from({ length: TAG_CELLS }, (_, r) =>
    Array.from({ length: TAG_CELLS }, (_, c) => (code & (1 << (r * TAG_CELLS + c))) !== 0),
  );
}

export interface DecodedTag {
  id: number;
  /**
   * Quarter turns clockwise (as seen) by which the tag is turned against
   * the way the cells were read: the corner printed top left is this many
   * corners further on, clockwise, from the corner the reading started at.
   */
  turns: 0 | 1 | 2 | 3;
  /** Cells read differently from the code */
  errors: number;
}

/**
 * The tag that was read: `bits` are the 25 cells, row by row from the
 * corner the reading started at. Null when no code is within `maxErrors`
 * cells of what was read, whichever way round.
 */
export function decodeTag(bits: number, maxErrors = 1): DecodedTag | null {
  let best: DecodedTag | null = null;
  const entries = dictionary();
  for (let i = 0; i < entries.length; i++) {
    for (let turns = 0; turns < 4; turns++) {
      const errors = ones(bits ^ entries[i]!.turned[turns]!);
      if (errors <= maxErrors && (!best || errors < best.errors)) {
        best = { id: i + 1, turns: turns as DecodedTag['turns'], errors };
      }
    }
  }
  return best;
}

const escapeXml = (text: string) =>
  text.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);

const mm = (v: number) => String(Number(v.toFixed(3)));

/** Paper around the dark square: one module of white, so the tag stands clear of what it sticks on */
export const tagPaper = (size: number) => (size * (TAG_MODULES + 2)) / TAG_MODULES;

/**
 * A tag as an SVG in exact millimetres: the dark square is `size` mm wide,
 * with one module of white around it and thin cut marks at the corners of
 * the paper. `lines` are printed below it (its number, its size, a name).
 * Empty for no such tag.
 */
export function tagSvg(id: number, size: number, lines: readonly string[] = []): string {
  const cells = tagCells(id);
  if (!cells) return '';
  const m = size / TAG_MODULES;
  const paper = tagPaper(size);
  const text = Math.max(2.4, Math.min(4, size / 10));
  // Room for the lines below, and a little under the last one for its descenders.
  const height = paper + (lines.length > 0 ? 2 + lines.length * text * 1.3 : 0);
  // One path: the border as a ring (even-odd), then every dark cell.
  let path = `M${mm(m)} ${mm(m)}h${mm(size)}v${mm(size)}h${mm(-size)}z`;
  path += `M${mm(2 * m)} ${mm(2 * m)}h${mm(size - 2 * m)}v${mm(size - 2 * m)}h${mm(2 * m - size)}z`;
  cells.forEach((row, r) =>
    row.forEach((dark, c) => {
      if (dark) path += `M${mm((c + 2) * m)} ${mm((r + 2) * m)}h${mm(m)}v${mm(m)}h${mm(-m)}z`;
    }),
  );
  const tick = m / 3;
  const ticks = [
    [0, 0, 1, 1],
    [paper, 0, -1, 1],
    [paper, paper, -1, -1],
    [0, paper, 1, -1],
  ]
    .map(([x, y, dx, dy]) => `M${mm(x! + dx! * tick)} ${mm(y!)}H${mm(x!)}V${mm(y! + dy! * tick)}`)
    .join('');
  const labels = lines
    .map(
      (line, i) =>
        `<text x="${mm(m)}" y="${mm(paper + 1 + (i + 0.8) * text * 1.3)}" font-family="Helvetica, Arial, sans-serif" font-size="${mm(text)}" fill="#000">${escapeXml(line)}</text>`,
    )
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${mm(paper)}mm" height="${mm(height)}mm" viewBox="0 0 ${mm(paper)} ${mm(height)}">` +
    `<rect width="${mm(paper)}" height="${mm(height)}" fill="#fff"/>` +
    `<path d="${path}" fill="#000" fill-rule="evenodd" shape-rendering="crispEdges"/>` +
    `<path d="${ticks}" fill="none" stroke="#999" stroke-width="0.15"/>` +
    labels +
    `</svg>`
  );
}

/** Where a tag lies: its middle, how it is turned, and how large it was seen. */
export interface TagPose extends Vec {
  /**
   * Direction of the tag's own x axis – from its left edge to its right one
   * as printed – against +X, degrees counter-clockwise, in (−180, 180]
   */
  angle: number;
  /** Mean length of its four sides */
  size: number;
}

/**
 * The pose of a tag from its four corners, given in the order they are
 * printed – top left, top right, bottom right, bottom left – in a frame
 * with y up (the table). The middle is the mean of the corners, the angle
 * the turn that lays the printed square onto them best (all four count, so
 * the error of one corner is shared out).
 */
export function tagPose(corners: readonly [Vec, Vec, Vec, Vec]): TagPose {
  const x = corners.reduce((s, c) => s + c.x, 0) / 4;
  const y = corners.reduce((s, c) => s + c.y, 0) / 4;
  // The printed square around its middle, y up: top left is (−1, 1), then clockwise.
  const ideal = [
    { x: -1, y: 1 },
    { x: 1, y: 1 },
    { x: 1, y: -1 },
    { x: -1, y: -1 },
  ];
  let dot = 0;
  let cross = 0;
  let size = 0;
  corners.forEach((c, i) => {
    const p = ideal[i]!;
    dot += p.x * (c.x - x) + p.y * (c.y - y);
    cross += p.x * (c.y - y) - p.y * (c.x - x);
    const n = corners[(i + 1) % 4]!;
    size += Math.hypot(n.x - c.x, n.y - c.y) / 4;
  });
  return { x, y, angle: (Math.atan2(cross, dot) * 180) / Math.PI, size };
}
