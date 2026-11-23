/**
 * Reads the parts of a FluidNC `config.yaml` (or `$CD` output) the app needs.
 * Defaults and the travel formula follow FluidNC's Machine/Axis.h,
 * Machine/Homing.h and Limit.cpp.
 */

export type YamlValue = string | YamlMap;
export interface YamlMap {
  [key: string]: YamlValue;
}

const unquote = (v: string) => v.replace(/^(['"])(.*)\1$/, '$2');

/**
 * Minimal YAML reader for FluidNC configs: nested maps by indentation,
 * scalar values, `#` comments. A key without value opens a map.
 */
export function parseConfigYaml(text: string): YamlMap {
  const root: YamlMap = {};
  const stack: { indent: number; node: YamlMap }[] = [{ indent: -1, node: root }];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/(^|\s)#.*$/, '').trimEnd();
    if (line.trim() === '') continue;
    const m = /^(\s*)([^:\s][^:]*):\s*(.*)$/.exec(line);
    if (!m) continue;
    const indent = m[1]!.length;
    while (stack[stack.length - 1]!.indent >= indent) stack.pop();
    const parent = stack[stack.length - 1]!.node;
    const key = m[2]!.trim();
    if (m[3] === '') {
      const child: YamlMap = {};
      parent[key] = child;
      stack.push({ indent, node: child });
    } else {
      parent[key] = unquote(m[3]!.trim());
    }
  }
  return root;
}

export type ConfigAxis = 'x' | 'y' | 'z' | 'a' | 'b' | 'c';
const AXIS_NAMES: ConfigAxis[] = ['x', 'y', 'z', 'a', 'b', 'c'];

export interface AxisHoming {
  cycle: number;
  positiveDirection: boolean;
  /** Machine position after homing */
  mpos: number;
}

export interface AxisConfig {
  maxRate: number;
  acceleration: number;
  maxTravel: number;
  softLimits: boolean;
  homing: AxisHoming | null;
  /** Number of motors (2 for squared gantry axes) */
  motors: number;
}

export interface MachineConfig {
  board: string | null;
  name: string | null;
  axes: Partial<Record<ConfigAxis, AxisConfig>>;
  junctionDeviation: number;
  arcTolerance: number;
  useLineNumbers: boolean;
  mustHome: boolean;
  /** A spindle defines an ATC or an m6_macro, so M6 actually does something */
  toolChangeHandled: boolean;
  /** A spindle section exists (PWM, Relay, VFD …); without one M3/M5 switch nothing */
  spindleControlled: boolean;
}

const map = (v: YamlValue | undefined): YamlMap => (typeof v === 'object' ? v : {});
const str = (v: YamlValue | undefined): string | undefined =>
  typeof v === 'string' ? v : undefined;
const num = (v: YamlValue | undefined, fallback: number) => {
  const n = Number(str(v));
  return str(v) !== undefined && Number.isFinite(n) ? n : fallback;
};
const bool = (v: YamlValue | undefined, fallback: boolean) => {
  const s = str(v)?.toLowerCase();
  return s === 'true' ? true : s === 'false' ? false : fallback;
};

function readAxis(node: YamlMap): AxisConfig {
  const homingNode = node.homing;
  const homing =
    typeof homingNode === 'object'
      ? {
          cycle: num(homingNode.cycle, 0),
          positiveDirection: bool(homingNode.positive_direction, true),
          mpos: num(homingNode.mpos_mm, 0),
        }
      : null;
  return {
    maxRate: num(node.max_rate_mm_per_min, 1000),
    acceleration: num(node.acceleration_mm_per_sec2, 25),
    maxTravel: num(node.max_travel_mm, 1000),
    softLimits: bool(node.soft_limits, false),
    homing,
    motors: Object.keys(node).filter((k) => /^motor\d$/.test(k)).length,
  };
}

export function readMachineConfig(text: string): MachineConfig {
  const doc = parseConfigYaml(text);
  const axesNode = map(doc.axes);
  const axes: MachineConfig['axes'] = {};
  for (const name of AXIS_NAMES) {
    const node = axesNode[name];
    if (typeof node === 'object') axes[name] = readAxis(node);
  }
  const toolChangeHandled = Object.values(doc).some((section) => {
    const s = map(section);
    return (str(s.atc) ?? '') !== '' || (str(s.m6_macro) ?? '') !== '';
  });
  // Spindle sections are named after their type; they all have one of these keys.
  const spindleKeys = ['output_pin', 'forward_pin', 'speed_map', 'spinup_ms', 'uart', 'uart_num'];
  const spindleControlled = Object.values(doc).some((section) => {
    const s = map(section);
    return spindleKeys.some((k) => {
      const v = str(s[k]);
      // A nested map (uart: …) counts when it has entries; a value when it names a pin.
      return v === undefined
        ? Object.keys(map(s[k])).length > 0
        : v.trim() !== '' && v !== 'NO_PIN';
    });
  });
  return {
    board: str(doc.board) ?? null,
    name: str(doc.name) ?? null,
    axes,
    junctionDeviation: num(doc.junction_deviation_mm, 0.01),
    arcTolerance: num(doc.arc_tolerance_mm, 0.002),
    useLineNumbers: bool(doc.use_line_numbers, false),
    mustHome: bool(map(doc.start).must_home, true),
    toolChangeHandled,
    spindleControlled,
  };
}

/**
 * Machine-coordinate range FluidNC uses for soft limits: homing towards
 * negative puts the switch at the minimum, towards positive at the maximum.
 */
export function axisTravel(axis: AxisConfig): { min: number; max: number } {
  const mpos = axis.homing?.mpos ?? 0;
  const towardsMax = !axis.homing || axis.homing.positiveDirection;
  return towardsMax
    ? { min: mpos - axis.maxTravel, max: mpos }
    : { min: mpos, max: mpos + axis.maxTravel };
}

/**
 * Runtime change of a config item (`$/axes/x/soft_limits=true`). FluidNC
 * validates it immediately; `$CD=<file>` then writes the running config.
 */
export function settingCommand(path: string, value: string | number | boolean): string {
  if (!/^[a-z0-9_]+(\/[a-z0-9_]+)*$/i.test(path)) throw new Error(`Invalid setting path ${path}`);
  return `$/${path}=${String(value)}`;
}
