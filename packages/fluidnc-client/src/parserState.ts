/**
 * Modal state from `$G` (`[GC:G0 G54 G17 G21 G90 G94 M5 M9 T0 F0 S0]`).
 */
export interface ParserState {
  motion: string;
  /** G54 … G59 */
  wcs: string;
  plane: 'G17' | 'G18' | 'G19';
  units: 'mm' | 'inch';
  distance: 'absolute' | 'incremental';
  feedMode: 'unitsPerMinute' | 'inverseTime';
  spindle: 'off' | 'cw' | 'ccw';
  flood: boolean;
  mist: boolean;
  tool: number;
  feed: number;
  speed: number;
}

export const DEFAULT_PARSER_STATE: ParserState = {
  motion: 'G0',
  wcs: 'G54',
  plane: 'G17',
  units: 'mm',
  distance: 'absolute',
  feedMode: 'unitsPerMinute',
  spindle: 'off',
  flood: false,
  mist: false,
  tool: 0,
  feed: 0,
  speed: 0,
};

export function parseParserState(words: readonly string[]): ParserState {
  const s: ParserState = { ...DEFAULT_PARSER_STATE };
  for (const raw of words) {
    const w = raw.toUpperCase();
    const value = Number(w.slice(1));
    if (/^G(0|1|2|3|38\.[2-5]|80)$/.test(w)) s.motion = w;
    else if (/^G5[4-9]$/.test(w)) s.wcs = w;
    else if (w === 'G17' || w === 'G18' || w === 'G19') s.plane = w;
    else if (w === 'G20') s.units = 'inch';
    else if (w === 'G21') s.units = 'mm';
    else if (w === 'G90') s.distance = 'absolute';
    else if (w === 'G91') s.distance = 'incremental';
    else if (w === 'G93') s.feedMode = 'inverseTime';
    else if (w === 'G94') s.feedMode = 'unitsPerMinute';
    else if (w === 'M3') s.spindle = 'cw';
    else if (w === 'M4') s.spindle = 'ccw';
    else if (w === 'M5') s.spindle = 'off';
    else if (w === 'M7') s.mist = true;
    else if (w === 'M8') s.flood = true;
    else if (w === 'M9') {
      s.mist = false;
      s.flood = false;
    } else if (/^[TFS]/.test(w) && Number.isFinite(value)) {
      if (w[0] === 'T') s.tool = value;
      else if (w[0] === 'F') s.feed = value;
      else s.speed = value;
    }
  }
  return s;
}

/** Index of the coordinate system for `G10 L2 P…` (G54 → 1). */
export const wcsIndex = (wcs: string): number => Number(wcs.slice(1)) - 53;
