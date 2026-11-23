export type MaterialGroup = 'wood' | 'board' | 'plastic' | 'metal';

export interface Material {
  id: string;
  name: string;
  group: MaterialGroup;
  /** Cutting speed, m/min */
  vc: number;
  /** Chip load per tooth for a 6 mm cutter, mm; scaled with the diameter */
  fz6: number;
  /** Depth per pass as a fraction of the tool diameter */
  depthFactor: number;
  /** Stepover for pocketing as a fraction of the diameter */
  stepoverFactor: number;
  /** Plunge feed as a fraction of the cutting feed */
  plungeFactor: number;
  notes?: string;
}

/**
 * Starting values for a router spindle on a light gantry (LowRider): chip
 * loads are on the low side of the usual tables because the machine is not
 * stiff. They are refined by the learning model from real jobs.
 */
export const DEFAULT_MATERIALS: Material[] = [
  {
    id: 'softwood',
    name: 'Weichholz (Fichte, Kiefer)',
    group: 'wood',
    vc: 600,
    fz6: 0.08,
    depthFactor: 0.5,
    stepoverFactor: 0.4,
    plungeFactor: 0.3,
  },
  {
    id: 'hardwood',
    name: 'Hartholz (Buche, Eiche)',
    group: 'wood',
    vc: 500,
    fz6: 0.06,
    depthFactor: 0.35,
    stepoverFactor: 0.35,
    plungeFactor: 0.25,
  },
  {
    id: 'mdf',
    name: 'MDF',
    group: 'board',
    vc: 600,
    fz6: 0.08,
    depthFactor: 0.5,
    stepoverFactor: 0.4,
    plungeFactor: 0.3,
  },
  {
    id: 'plywood',
    name: 'Multiplex / Sperrholz',
    group: 'board',
    vc: 550,
    fz6: 0.07,
    depthFactor: 0.4,
    stepoverFactor: 0.4,
    plungeFactor: 0.25,
  },
  {
    id: 'acrylic',
    name: 'Acryl (PMMA)',
    group: 'plastic',
    vc: 300,
    fz6: 0.05,
    depthFactor: 0.3,
    stepoverFactor: 0.3,
    plungeFactor: 0.2,
    notes: 'Einschneider, Späne gut abführen',
  },
  {
    id: 'hdpe',
    name: 'HDPE / POM',
    group: 'plastic',
    vc: 400,
    fz6: 0.08,
    depthFactor: 0.5,
    stepoverFactor: 0.4,
    plungeFactor: 0.3,
  },
  {
    id: 'aluminium',
    name: 'Aluminium',
    group: 'metal',
    vc: 200,
    fz6: 0.02,
    depthFactor: 0.1,
    stepoverFactor: 0.2,
    plungeFactor: 0.15,
    notes: 'Einschneider, Kühlung/Luft, kleine Zustellung',
  },
];

const positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
const GROUPS: MaterialGroup[] = ['wood', 'board', 'plastic', 'metal'];

export function validateMaterial(value: unknown): Material | null {
  if (typeof value !== 'object' || value === null) return null;
  const m = value as Partial<Material>;
  if (
    typeof m.id !== 'string' ||
    m.id === '' ||
    typeof m.name !== 'string' ||
    m.name.trim() === ''
  ) {
    return null;
  }
  if (!GROUPS.includes(m.group as MaterialGroup)) return null;
  const factors = [m.depthFactor, m.stepoverFactor, m.plungeFactor];
  if (![m.vc, m.fz6].every(positive) || !factors.every((f) => positive(f) && f <= 1)) return null;
  return m as Material;
}
