/**
 * Finds a dark round marker (a dot of the reference plate) in a camera frame
 * and returns its centre with sub-pixel precision: threshold by Otsu, dark
 * blobs by flood fill, keep the round ones, take the one nearest the centre.
 */

export interface Marker {
  /** Centre in image pixels */
  x: number;
  y: number;
  /** Equivalent diameter, px */
  diameter: number;
}

/** Luminance of RGBA pixels. */
export function toGray(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const gray = new Uint8Array(width * height);
  for (let i = 0, j = 0; j < gray.length; i += 4, j++) {
    gray[j] = (rgba[i]! * 77 + rgba[i + 1]! * 150 + rgba[i + 2]! * 29) >> 8;
  }
  return gray;
}

/** Threshold that best separates dark from light (Otsu). */
export function otsu(gray: Uint8Array): number {
  const hist = new Array<number>(256).fill(0);
  for (const v of gray) hist[v]!++;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i]!;
  let sumB = 0;
  let weightB = 0;
  let best = 0;
  let threshold = 127;
  for (let i = 0; i < 256; i++) {
    weightB += hist[i]!;
    if (weightB === 0) continue;
    const weightF = total - weightB;
    if (weightF === 0) break;
    sumB += i * hist[i]!;
    const meanB = sumB / weightB;
    const meanF = (sum - sumB) / weightF;
    const between = weightB * weightF * (meanB - meanF) ** 2;
    if (between > best) {
      best = between;
      threshold = i;
    }
  }
  return threshold;
}

export interface FindOptions {
  /** Smallest marker diameter in px (noise below) */
  minDiameter?: number;
  /** Largest marker diameter as a share of the shorter image side */
  maxShare?: number;
  /** Look for a light marker on a dark ground (a hole with a lit bottom) */
  light?: boolean;
}

/** The round dark marker nearest the image centre, or null. */
export function findMarker(
  picture: Uint8Array,
  width: number,
  height: number,
  options: FindOptions = {},
): Marker | null {
  const gray = options.light ? picture.map((v) => 255 - v) : picture;
  const minArea = Math.PI * ((options.minDiameter ?? 6) / 2) ** 2;
  const maxD = Math.min(width, height) * (options.maxShare ?? 0.6);
  const maxArea = Math.PI * (maxD / 2) ** 2;
  const threshold = otsu(gray);
  // Too little contrast: an empty or blurred picture, not a plate.
  let lo = 255;
  let hi = 0;
  for (const v of gray) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (hi - lo < 40) return null;

  const seen = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  let best: Marker | null = null;
  let bestDistance = Infinity;
  for (let start = 0; start < gray.length; start++) {
    if (seen[start] || gray[start]! > threshold) continue;
    // Flood fill one dark blob; weight each pixel by how dark it is.
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    let area = 0;
    let weight = 0;
    let sx = 0;
    let sy = 0;
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    let touchesEdge = false;
    while (top > 0) {
      const i = stack[--top]!;
      const x = i % width;
      const y = (i - x) / width;
      const w = threshold + 1 - gray[i]!;
      area++;
      weight += w;
      sx += x * w;
      sy += y * w;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesEdge = true;
      for (const n of [i - 1, i + 1, i - width, i + width]) {
        if (n < 0 || n >= gray.length || seen[n]) continue;
        // No wrap-around between the end of one row and the next.
        if ((n === i - 1 && x === 0) || (n === i + 1 && x === width - 1)) continue;
        if (gray[n]! > threshold) continue;
        seen[n] = 1;
        stack[top++] = n;
      }
    }
    if (touchesEdge || area < minArea || area > maxArea) continue;
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    const aspect = w / h;
    // A filled circle covers π/4 of its bounding box.
    const fill = area / (w * h);
    if (aspect < 0.7 || aspect > 1.4 || fill < 0.6 || fill > 0.92) continue;
    // Pixel i covers [i, i + 1): its centre is at i + 0.5.
    const marker = {
      x: sx / weight + 0.5,
      y: sy / weight + 0.5,
      diameter: 2 * Math.sqrt(area / Math.PI),
    };
    const distance = Math.hypot(marker.x - width / 2, marker.y - height / 2);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = marker;
    }
  }
  return best;
}
