import type { Move, ToolBlock } from './toolpath';

/** What `toGcode` needs of a tool block (`Toolpath.blocks` has it all) */
export type ProgramBlock = Pick<ToolBlock, 'number' | 'name' | 'diameter' | 'rpm' | 'start'>;

export interface ProgramOptions {
  name: string;
  rpm: number;
  safeZ: number;
  /**
   * The runs of cutters, as `toolpaths` returns them (`Toolpath.blocks`). Two or more make a program with
   * several tools (see `toGcode`); none or one: the program of one cutter, written exactly as it always was
   * – no T word, no header – with `rpm`. The first block begins with the program, whatever its `start` says;
   * every later one is where the tool is changed (the move `moves[start]` is the first of the new cutter).
   */
  blocks?: readonly ProgramBlock[];
}

const f = (v: number) => {
  const r = Math.round(v * 1000) / 1000;
  return (Object.is(r, -0) ? 0 : r).toString();
};

/** A name made fit for a comment: no brackets, no control characters, no `;`, one space between words */
const tidy = (text: string) =>
  text
    .replace(/[()\u0000-\u001f\u007f;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** The tool as the header and the block say it: its T number and, where it has one, its name */
const named = (b: ProgramBlock, before: string) => {
  const name = b.name === undefined ? '' : tidy(b.name);
  return `${before}${name === '' ? '' : ` ${name}`}`;
};

/**
 * G-code for FluidNC: metric, absolute, XY plane; spindle on at the start,
 * off and program end at the end. Repeated words are left out.
 *
 * **With several tools** (`o.blocks` has two or more) the program says which cutters it needs and changes them
 * where the blocks begin, in the form the app reads (`camInfo`, the split of a job at `M6`, the operations of a
 * program):
 *
 * ```
 * (LowRider Control CAM: name)
 * (T1 D=3 V-bit)                  one line per cutter, in the order they are first used
 * (T2 D=6 End mill)
 * G21 G90 G17 G94
 * T1 M6                           the first cutter, before the first move, tool and M6 on ONE line
 * (tool T1 V-bit)                 names what follows (the operations of a program are named by the comment before them)
 * G0 Z5
 * S18000 M3
 * …                               the cuts of T1
 * G0 Z5                           every later change: lift (never lower than the last move), spindle off,
 * M5                              the new cutter, spindle on at its speed
 * T2 M6
 * S18000 M3
 * (tool T2 End mill)
 * G0 Z5                           the first move of a block carries the whole modal state: G0/G1, every axis it
 * G0 X10 Y5                       moves, F on the first feed move – a block is split off and run alone from the
 * …                               SD card, where nothing of the blocks before it is known
 * G0 Z5
 * M5
 * M30
 * ```
 */
export function toGcode(moves: readonly Move[], o: ProgramOptions): string {
  const blocks = o.blocks && o.blocks.length > 1 ? o.blocks : undefined;
  const out = [`(LowRider Control CAM: ${o.name.replace(/[()]/g, '')})`];
  const speed = (b: ProgramBlock) => `S${Math.round(b.rpm ?? o.rpm)} M3`;
  if (blocks) {
    const listed = new Set<number>();
    for (const b of blocks) {
      if (listed.has(b.number)) continue;
      listed.add(b.number);
      out.push(`(${named(b, `T${b.number} D=${f(b.diameter)}`)})`);
    }
  }
  out.push('G21 G90 G17 G94');
  if (blocks) {
    // The first cutter, before anything moves; the comment first, so that the lift is the first thing it names
    out.push(`T${blocks[0]!.number} M6`, `(${named(blocks[0]!, `tool T${blocks[0]!.number}`)})`);
    out.push(`G0 Z${f(o.safeZ)}`, speed(blocks[0]!));
  } else {
    out.push(`G0 Z${f(o.safeZ)}`, `M3 S${Math.round(o.rpm)}`);
  }
  let x: number | undefined;
  let y: number | undefined;
  let z: number | undefined;
  let mode = '';
  let feed: number | null = null;
  let next = 1;
  moves.forEach((m, k) => {
    // A new block: up to where the last one left the tool, spindle off, the new cutter, spindle on – and
    // everything that was written before is forgotten, so that this move says it all
    while (blocks && next < blocks.length && k >= blocks[next]!.start) {
      const b = blocks[next++]!;
      out.push(
        `G0 Z${f(Math.max(o.safeZ, z ?? o.safeZ))}`,
        'M5',
        `T${b.number} M6`,
        speed(b),
        `(${named(b, `tool T${b.number}`)})`,
      );
      x = y = z = undefined;
      mode = '';
      feed = null;
    }
    const g = m.feed === null ? 'G0' : m.arc ? (m.arc.cw ? 'G2' : 'G3') : 'G1';
    const words: string[] = [];
    if (m.x !== undefined && (m.x !== x || m.arc)) words.push(`X${f(m.x)}`);
    if (m.y !== undefined && (m.y !== y || m.arc)) words.push(`Y${f(m.y)}`);
    if (m.z !== undefined && m.z !== z) words.push(`Z${f(m.z)}`);
    if (m.arc) words.push(`I${f(m.arc.i)}`, `J${f(m.arc.j)}`);
    if (words.length === 0) return;
    if (m.feed !== null && m.feed !== feed) {
      words.push(`F${Math.round(m.feed)}`);
      feed = m.feed;
    }
    out.push(`${g === mode && !m.arc ? '' : `${g} `}${words.join(' ')}`.trim());
    mode = g;
    x = m.x ?? x;
    y = m.y ?? y;
    z = m.z ?? z;
  });
  out.push(`G0 Z${f(o.safeZ)}`, 'M5', 'M30', '');
  return out.join('\n');
}
