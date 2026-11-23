import { parseConfigYaml, readMachineConfig, type YamlMap } from '@lowrider/fluidnc-client';

export type ConfigIssueCode =
  | 'tab'
  | 'indent'
  | 'duplicate'
  | 'syntax'
  | 'missing-axis'
  | 'not-number'
  | 'not-positive'
  | 'no-board';

export interface ConfigIssue {
  severity: 'error' | 'warning';
  code: ConfigIssueCode;
  /** 1-based line, 0 for the whole file */
  line: number;
  detail: string;
}

/** Numbers that must be positive for every axis that exists. */
const AXIS_NUMBERS = [
  'steps_per_mm',
  'max_rate_mm_per_min',
  'acceleration_mm_per_sec2',
  'max_travel_mm',
];

/**
 * Checks a config.yaml before it goes to the controller: YAML layout errors
 * that FluidNC would refuse at boot (leaving the machine without config),
 * missing axes and implausible numbers.
 */
export function checkConfig(text: string): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  const lines = text.split(/\r?\n/);
  const seen: { indent: number; keys: Set<string> }[] = [];
  lines.forEach((raw, i) => {
    const line = i + 1;
    if (/^\s*\t/.test(raw)) issues.push({ severity: 'error', code: 'tab', line, detail: '' });
    const code = raw.replace(/(^|\s)#.*$/, '').trimEnd();
    if (code.trim() === '') return;
    const indent = code.length - code.trimStart().length;
    if (indent % 2 !== 0) issues.push({ severity: 'warning', code: 'indent', line, detail: '' });
    const m = /^\s*([^:\s][^:]*):(\s|$)/.exec(code);
    if (!m) {
      issues.push({ severity: 'error', code: 'syntax', line, detail: code.trim() });
      return;
    }
    while (seen.length > 0 && seen[seen.length - 1]!.indent > indent) seen.pop();
    let level = seen[seen.length - 1];
    if (!level || level.indent < indent) {
      level = { indent, keys: new Set() };
      seen.push(level);
    }
    const key = m[1]!.trim();
    if (level.keys.has(key))
      issues.push({ severity: 'error', code: 'duplicate', line, detail: key });
    level.keys.add(key);
  });

  const yaml = parseConfigYaml(text);
  if (typeof yaml.board !== 'string')
    issues.push({ severity: 'warning', code: 'no-board', line: 0, detail: '' });
  const axes = (yaml.axes ?? {}) as YamlMap;
  for (const axis of ['x', 'y', 'z']) {
    if (typeof axes[axis] !== 'object') {
      issues.push({ severity: 'error', code: 'missing-axis', line: 0, detail: axis.toUpperCase() });
    }
  }
  for (const [axis, node] of Object.entries(axes)) {
    if (typeof node !== 'object') continue;
    for (const key of AXIS_NUMBERS) {
      const value = node[key];
      if (value === undefined || typeof value !== 'string') continue;
      const n = Number(value);
      const where = `${axis}/${key}`;
      const at = lines.findIndex((l) => new RegExp(`^\\s*${key}\\s*:`).test(l)) + 1;
      if (!Number.isFinite(n))
        issues.push({ severity: 'error', code: 'not-number', line: at, detail: where });
      else if (n <= 0)
        issues.push({ severity: 'error', code: 'not-positive', line: at, detail: where });
    }
  }
  // The same reader the profile uses must understand the file.
  readMachineConfig(text);
  return issues;
}
