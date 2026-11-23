import { tagCells } from '@lowrider/workshop';

/** A tag of a test picture. */
export interface DrawnTag {
  id: number;
  /** Middle, px */
  x: number;
  y: number;
  /** Side of the dark square, px */
  side: number;
  /** Turned counter-clockwise as seen (y up), degrees */
  angle?: number;
  ink?: number;
  paper?: number;
  /** Cells drawn the other way round (row · 5 + column) */
  wrong?: number[];
  /** Seen at an angle: the far edge is this share shorter per pixel of height */
  keystone?: number;
  /** Stretched along its own x axis by this factor */
  stretch?: number;
  /** White modules around the dark square (1 as printed) */
  quiet?: number;
  /** Own cells instead of a tag's (rows from the top, true = dark) */
  cells?: boolean[][];
}

/**
 * A grey picture of tags on a table, 4 × 4 samples per pixel. A tag's own x
 * axis points along (cos a, −sin a) in the picture, its rows run down along
 * (sin a, cos a): y runs down in a picture.
 */
export function tagPicture(
  width: number,
  height: number,
  tags: readonly DrawnTag[],
  { table = 150, noise = 0, blur = 0 } = {},
): Uint8Array {
  const tone = new Float32Array(width * height).fill(table);
  for (const tag of tags) {
    const cells = tag.cells ?? tagCells(tag.id)!;
    const a = ((tag.angle ?? 0) * Math.PI) / 180;
    const module = tag.side / 7;
    const quiet = tag.quiet ?? 1;
    const reach = tag.side * 1.1 * (tag.stretch ?? 1) + 2;
    const ink = tag.ink ?? 25;
    const paper = tag.paper ?? 235;
    for (let y = Math.max(0, Math.floor(tag.y - reach)); y < Math.min(height, tag.y + reach); y++) {
      for (
        let x = Math.max(0, Math.floor(tag.x - reach));
        x < Math.min(width, tag.x + reach);
        x++
      ) {
        let sum = 0;
        for (let sy = 0; sy < 4; sy++) {
          for (let sx = 0; sx < 4; sx++) {
            const dx = x + (sx + 0.5) / 4 - tag.x;
            const dy = y + (sy + 0.5) / 4 - tag.y;
            let lx = (dx * Math.cos(a) - dy * Math.sin(a)) / (tag.stretch ?? 1);
            const ly = dx * Math.sin(a) + dy * Math.cos(a);
            if (tag.keystone) lx /= 1 + tag.keystone * ly;
            // In modules from the top left corner of the dark square.
            const u = lx / module + 3.5;
            const v = ly / module + 3.5;
            if (u < -quiet || v < -quiet || u >= 7 + quiet || v >= 7 + quiet) sum += table;
            else if (u < 0 || v < 0 || u >= 7 || v >= 7) sum += paper;
            else if (u < 1 || v < 1 || u >= 6 || v >= 6) sum += ink;
            else {
              const index = (Math.floor(v) - 1) * 5 + Math.floor(u) - 1;
              const dark = cells[Math.floor(v) - 1]![Math.floor(u) - 1]!;
              sum += dark !== (tag.wrong?.includes(index) ?? false) ? ink : paper;
            }
          }
        }
        // What lies under a later tag is covered by it.
        if (sum !== 16 * table) tone[y * width + x] = sum / 16;
      }
    }
  }
  let picture = tone;
  // Out of focus: a box of the given radius, twice.
  for (let pass = 0; pass < (blur > 0 ? 2 : 0); pass++) {
    const next = new Float32Array(picture.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let n = 0;
        for (let v = Math.max(0, y - blur); v <= Math.min(height - 1, y + blur); v++) {
          for (let u = Math.max(0, x - blur); u <= Math.min(width - 1, x + blur); u++) {
            sum += picture[v * width + u]!;
            n++;
          }
        }
        next[y * width + x] = sum / n;
      }
    }
    picture = next;
  }
  // The same grain every time.
  let seed = 12345;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = Math.max(0, Math.min(255, Math.round(picture[i]! + (random() - 0.5) * 2 * noise)));
  }
  return gray;
}

/** Where a corner of a drawn tag lies: 0 top left as printed, then clockwise. */
export function drawnCorner(tag: DrawnTag, corner: number): { x: number; y: number } {
  const a = ((tag.angle ?? 0) * Math.PI) / 180;
  const [u, v] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ][corner]!;
  const lx = (u! * tag.side) / 2;
  const ly = (v! * tag.side) / 2;
  return {
    x: tag.x + lx * Math.cos(a) + ly * Math.sin(a),
    y: tag.y - lx * Math.sin(a) + ly * Math.cos(a),
  };
}
