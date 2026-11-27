import { circle, rectangle, type Contour, type Move, type Operation } from '../src';

/**
 * What the tests use to look at a program: a heightmap of the stock (every cell begins at the surface, 0)
 * that a flat cutter of the given diameter lowers, move by move. Kept apart from the library: it knows
 * nothing of how the moves were made.
 */
export interface Stock {
  /** Height of the material in each cell, mm (0 = the surface, −6 = cut 6 deep) */
  height: Float64Array;
  /** Cells per row */
  nx: number;
  ny: number;
  /** Where cell 0 lies (mm) and the cell size */
  x0: number;
  y0: number;
  res: number;
  /** The most material one position of the cutter took at once: how far its bottom went below what was under it, mm */
  thickest: number;
  /** Where the cutter was then: x, y, z and the height of the material under its edge (for the failure message) */
  thickestAt: { x: number; y: number; z: number; height: number; cell: number[] };
  /** Rapid positions where the cutter's body was in material (the cell, the height there and the cutter's height), at most 20 kept */
  collisions: { x: number; y: number; material: number; z: number }[];
  /** Positions at which a feed move put the cutter outside the area of the stock */
  outside: number;
}

export function simulate(
  moves: readonly Move[],
  tool: number,
  area: { minX: number; minY: number; maxX: number; maxY: number },
  start = { x: 0, y: 0, z: 5 },
  res = 0.25,
): Stock {
  const nx = Math.ceil((area.maxX - area.minX) / res) + 1;
  const ny = Math.ceil((area.maxY - area.minY) / res) + 1;
  const stock: Stock = {
    height: new Float64Array(nx * ny),
    nx,
    ny,
    x0: area.minX,
    y0: area.minY,
    res,
    thickest: 0,
    thickestAt: { x: 0, y: 0, z: 0, height: 0, cell: [0, 0] },
    collisions: [],
    outside: 0,
  };
  // A cell exactly a radius from a straight path is in or out by where the samples happen to fall: the
  // cutter is taken 0.02 mm smaller, so that every pass sees the same cells
  const r = tool / 2 - 0.02;
  const reach = Math.ceil(r / res);
  /** The cells under the cutter at a position: calls back with each cell's index */
  const under = (px: number, py: number, each: (i: number) => void) => {
    const cx = Math.round((px - stock.x0) / res);
    const cy = Math.round((py - stock.y0) / res);
    for (let j = cy - reach; j <= cy + reach; j++) {
      for (let i = cx - reach; i <= cx + reach; i++) {
        const dx = stock.x0 + i * res - px;
        const dy = stock.y0 + j * res - py;
        if (dx * dx + dy * dy > r * r) continue;
        if (i < 0 || j < 0 || i >= nx || j >= ny) {
          stock.outside++;
          continue;
        }
        each(j * nx + i);
      }
    }
  };
  const cut = (px: number, py: number, pz: number) => {
    under(px, py, (i) => {
      if (stock.height[i]! - pz > stock.thickest) {
        stock.thickest = stock.height[i]! - pz;
        stock.thickestAt = {
          x: px,
          y: py,
          z: pz,
          height: stock.height[i]!,
          cell: [stock.x0 + (i % nx) * res, stock.y0 + Math.floor(i / nx) * res],
        };
      }
      if (pz < stock.height[i]!) stock.height[i] = pz;
    });
  };
  const touch = (px: number, py: number, pz: number) => {
    under(px, py, (i) => {
      if (stock.height[i]! > pz + 1e-6 && stock.collisions.length < 20) {
        stock.collisions.push({ x: px, y: py, material: stock.height[i]!, z: pz });
      }
    });
  };

  let { x, y, z } = start;
  for (const m of moves) {
    const nxp = m.x ?? x;
    const nyp = m.y ?? y;
    const nzp = m.z ?? z;
    // Samples along the move, from just after its start to its end
    let samples: [number, number, number][];
    if (m.arc) {
      const cx = x + m.arc.i;
      const cy = y + m.arc.j;
      const radius = Math.hypot(m.arc.i, m.arc.j);
      const a0 = Math.atan2(y - cy, x - cx);
      let a1 = Math.atan2(nyp - cy, nxp - cx);
      // A turn that ends where it began is a full one
      const full = Math.hypot(nxp - x, nyp - y) < 1e-9;
      let sweep = a1 - a0;
      if (m.arc.cw) {
        while (sweep >= 0) sweep -= 2 * Math.PI;
        if (full) sweep = -2 * Math.PI;
      } else {
        while (sweep <= 0) sweep += 2 * Math.PI;
        if (full) sweep = 2 * Math.PI;
      }
      a1 = a0 + sweep;
      const n = Math.max(1, Math.ceil((Math.abs(sweep) * radius) / (res / 2)));
      samples = Array.from({ length: n }, (_, k) => {
        const t = (k + 1) / n;
        const a = a0 + sweep * t;
        return [cx + radius * Math.cos(a), cy + radius * Math.sin(a), z + (nzp - z) * t];
      });
    } else {
      const length = Math.hypot(nxp - x, nyp - y, nzp - z);
      const n = Math.max(1, Math.ceil(length / (res / 2)));
      samples = Array.from({ length: n }, (_, k) => {
        const t = (k + 1) / n;
        return [x + (nxp - x) * t, y + (nyp - y) * t, z + (nzp - z) * t];
      });
    }
    for (const [px, py, pz] of samples) (m.feed === null ? touch : cut)(px, py, pz);
    x = nxp;
    y = nyp;
    z = nzp;
  }
  return stock;
}

/** The height of the material at a place (mm) */
export function heightAt(stock: Stock, x: number, y: number): number {
  const i = Math.round((x - stock.x0) / stock.res);
  const j = Math.round((y - stock.y0) / stock.res);
  return stock.height[j * stock.nx + i]!;
}

/**
 * What a drilled program must keep to, replayed move by move with no idea how it was made: every rapid
 * ends in air – above the surface, or above the lowest point a cut has reached at that very spot – and
 * moves sideways only above the surface. Returns what it found wrong.
 */
export function rapidsEndInAir(moves: readonly Move[], start = { x: 0, y: 0, z: 5 }): string[] {
  const wrong: string[] = [];
  const floor = new Map<string, number>();
  const key = (x: number, y: number) => `${Math.round(x * 1e6)},${Math.round(y * 1e6)}`;
  let { x, y, z } = start;
  moves.forEach((m, k) => {
    const nx = m.x ?? x;
    const ny = m.y ?? y;
    const nz = m.z ?? z;
    if (m.feed === null) {
      const sideways = nx !== x || ny !== y;
      if (sideways && (z < 0 || nz < 0)) wrong.push(`move ${k}: sideways rapid below the surface`);
      const bottom = floor.get(key(nx, ny)) ?? 0;
      if (nz < bottom - 1e-9)
        wrong.push(`move ${k}: rapid to z ${nz}, the hole is cut to ${bottom} only`);
    } else {
      const bottom = floor.get(key(nx, ny)) ?? 0;
      if (nz < bottom) floor.set(key(nx, ny), nz);
    }
    x = nx;
    y = ny;
    z = nz;
  });
  return wrong;
}

/** A small seeded generator (mulberry32): the same numbers on every run and every machine */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const line = (x0: number, y0: number, x1: number, y1: number): Contour => ({
  closed: false,
  points: [
    { x: x0, y: y0 },
    { x: x1, y: y1 },
  ],
});

/**
 * A drawing made by a seeded generator: parts with holes, cut-outs (with a disc in some), pockets, lines and
 * closed engravings in them, and alone on the sheet – one operation to a contour, the contour's index is the
 * operation's. It says which contour lies in which, so a test need not ask the library.
 */
export interface Drawing {
  contours: Contour[];
  operations: Operation[];
  /** The contour each one lies in (null: on the sheet) */
  parent: (number | null)[];
}

export const generateDrawing = (rand: () => number, withNumbers: boolean): Drawing => {
  const contours: Contour[] = [];
  const operations: Operation[] = [];
  const parent: (number | null)[] = [];
  const add = (c: Contour, op: Omit<Operation, 'contour'>, inside: number | null) => {
    contours.push(c);
    operations.push({ contour: contours.length - 1, ...op });
    parent.push(inside);
    return contours.length - 1;
  };
  const pick = <T>(items: T[]) => items[Math.floor(rand() * items.length)]!;
  const columns = 1 + Math.floor(rand() * 4);
  const rows = 1 + Math.floor(rand() * 3);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const x = column * 80 + rand() * 10;
      const y = row * 80 + rand() * 10;
      const kind = rand();
      if (kind < 0.55) {
        const w = 30 + Math.floor(rand() * 20);
        const h = 30 + Math.floor(rand() * 20);
        const tabs = {
          count: 3 + Math.floor(rand() * 3),
          width: 3,
          height: 1,
          avoidCorners: rand() < 0.5,
        };
        const part = add(
          rectangle(x, y, w, h),
          { kind: 'outside', tabs: rand() < 0.5 ? tabs : undefined, climb: rand() < 0.5 },
          null,
        );
        for (let slot = 0; slot < 4; slot++) {
          const sx = x + (slot % 2) * (w / 2) + 2;
          const sy = y + Math.floor(slot / 2) * (h / 2) + 2;
          const what = rand();
          if (what < 0.2) {
            add(circle(sx + 5, sy + 5, pick([3, 8])), { kind: 'drill' }, part);
          } else if (what < 0.4) {
            const cutout = add(
              rectangle(sx, sy, 10, 10),
              { kind: 'inside', relief: rand() < 0.3 ? 'dogbone' : undefined },
              part,
            );
            if (rand() < 0.5) add(circle(sx + 5, sy + 5, 4), { kind: 'outside' }, cutout);
          } else if (what < 0.55) {
            add(rectangle(sx, sy, 10, 10), { kind: 'pocket' }, part);
          } else if (what < 0.7) {
            add(line(sx, sy + 5, sx + 10, sy + 5 + rand()), { kind: 'on' }, part);
          } else if (what < 0.8) {
            add(rectangle(sx + 1, sy + 1, 8, 8), { kind: 'on' }, part);
          }
        }
      } else if (kind < 0.7) {
        add(circle(x + 30, y + 30, pick([3, 8])), { kind: 'drill' }, null);
      } else if (kind < 0.8) {
        add(line(x, y, x + 40, y + rand() * 40), { kind: 'on' }, null);
      } else if (kind < 0.9) {
        add(rectangle(x, y, 20 + rand() * 20, 20 + rand() * 20), { kind: 'pocket' }, null);
      } else {
        add(rectangle(x, y, 20, 30), { kind: 'on' }, null);
      }
    }
  }
  if (withNumbers) {
    for (const op of operations) if (rand() < 0.4) op.seq = 1 + Math.floor(rand() * 4);
  }
  return { contours, operations, parent };
};
