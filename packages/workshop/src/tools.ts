import type { ToolShape } from '@lowrider/gcode-core';

export type ToolKind = 'flat' | 'ball' | 'vbit' | 'drill' | 'chamfer';

export interface Tool {
  id: string;
  /** T number used in the G-code */
  number: number;
  name: string;
  kind: ToolKind;
  diameter: number;
  flutes: number;
  /** Included angle for V-bits and chamfer cutters, degrees */
  angle?: number;
  /** Cutting length, mm */
  fluteLength: number;
  /** Length out of the collet nut, mm */
  stickout: number;
  holder: string;
  holderDiameter: number;
  notes?: string;
  /**
   * This "tool" is a probe (3D touch probe, edge finder): it must never turn.
   * A job that uses it and switches the spindle on asks before every start.
   */
  probe?: boolean;
  /** Small photo as data URL */
  image?: string;
}

/** The tools of the operator's Fusion jobs (1001–1006) and the 6 mm cutter of the Estlcam jobs. */
export const DEFAULT_TOOLS: Tool[] = [
  {
    id: 't1',
    number: 1,
    name: 'Schaftfräser 8 mm',
    kind: 'flat',
    diameter: 8,
    flutes: 2,
    fluteLength: 25,
    stickout: 35,
    holder: 'Spannzange 8 mm',
    holderDiameter: 30,
  },
  {
    id: 't2',
    number: 2,
    name: 'Kugelfräser 6 mm',
    kind: 'ball',
    diameter: 6,
    flutes: 2,
    fluteLength: 20,
    stickout: 30,
    holder: 'Spannzange 6 mm',
    holderDiameter: 30,
  },
  {
    id: 't3',
    number: 3,
    name: 'Schaftfräser 6 mm',
    kind: 'flat',
    diameter: 6,
    flutes: 2,
    fluteLength: 22,
    stickout: 30,
    holder: 'Spannzange 6 mm',
    holderDiameter: 30,
  },
];

const positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
const KINDS: ToolKind[] = ['flat', 'ball', 'vbit', 'drill', 'chamfer'];

export function validateTool(value: unknown): Tool | null {
  if (typeof value !== 'object' || value === null) return null;
  const t = value as Partial<Tool>;
  if (
    typeof t.id !== 'string' ||
    t.id === '' ||
    typeof t.name !== 'string' ||
    t.name.trim() === ''
  ) {
    return null;
  }
  if (!Number.isInteger(t.number) || t.number! < 0 || !KINDS.includes(t.kind as ToolKind))
    return null;
  if (![t.diameter, t.fluteLength, t.stickout, t.holderDiameter].every(positive)) return null;
  if (!Number.isInteger(t.flutes) || t.flutes! < 1) return null;
  if ((t.kind === 'vbit' || t.kind === 'chamfer') && !positive(t.angle)) return null;
  if (typeof t.holder !== 'string') return null;
  return t as Tool;
}

/** Cutter shape for the material-removal simulation. */
export function toolShape(tool: Tool): ToolShape {
  if (tool.kind === 'ball') return { kind: 'ball', diameter: tool.diameter };
  if (tool.kind === 'vbit' || tool.kind === 'chamfer') {
    return { kind: 'vbit', diameter: tool.diameter, angle: tool.angle! };
  }
  return { kind: 'flat', diameter: tool.diameter };
}

export function toolByNumber(tools: readonly Tool[], number: number | undefined): Tool | undefined {
  return number === undefined ? undefined : tools.find((t) => t.number === number);
}
