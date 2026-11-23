import type { Move } from './toolpath';

export interface ProgramOptions {
  name: string;
  rpm: number;
  safeZ: number;
}

const f = (v: number) => {
  const r = Math.round(v * 1000) / 1000;
  return (Object.is(r, -0) ? 0 : r).toString();
};

/**
 * G-code for FluidNC: metric, absolute, XY plane; spindle on at the start,
 * off and program end at the end. Repeated words are left out.
 */
export function toGcode(moves: readonly Move[], o: ProgramOptions): string {
  const out = [
    `(LowRider Control CAM: ${o.name.replace(/[()]/g, '')})`,
    'G21 G90 G17 G94',
    `G0 Z${f(o.safeZ)}`,
    `M3 S${Math.round(o.rpm)}`,
  ];
  let x: number | undefined;
  let y: number | undefined;
  let z: number | undefined;
  let mode = '';
  let feed: number | null = null;
  for (const m of moves) {
    const g = m.feed === null ? 'G0' : m.arc ? (m.arc.cw ? 'G2' : 'G3') : 'G1';
    const words: string[] = [];
    if (m.x !== undefined && (m.x !== x || m.arc)) words.push(`X${f(m.x)}`);
    if (m.y !== undefined && (m.y !== y || m.arc)) words.push(`Y${f(m.y)}`);
    if (m.z !== undefined && m.z !== z) words.push(`Z${f(m.z)}`);
    if (m.arc) words.push(`I${f(m.arc.i)}`, `J${f(m.arc.j)}`);
    if (words.length === 0) continue;
    if (m.feed !== null && m.feed !== feed) {
      words.push(`F${Math.round(m.feed)}`);
      feed = m.feed;
    }
    out.push(`${g === mode && !m.arc ? '' : `${g} `}${words.join(' ')}`.trim());
    mode = g;
    x = m.x ?? x;
    y = m.y ?? y;
    z = m.z ?? z;
  }
  out.push(`G0 Z${f(o.safeZ)}`, 'M5', 'M30', '');
  return out.join('\n');
}
