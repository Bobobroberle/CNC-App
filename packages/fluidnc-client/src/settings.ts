/**
 * FluidNC settings as listed by `$S` (`$Settings/List`) and `$CD`-backed
 * config paths (`$/axes/x/max_rate_mm_per_min=9000`).
 */
export interface SettingEntry {
  /** Name without the leading `$`, e.g. `/axes/x/max_rate_mm_per_min` or `Sta/SSID` */
  key: string;
  value: string;
  /** Group for display: first path segment or the part before `/` */
  group: string;
}

export function parseSettingLine(line: string): SettingEntry | null {
  const m = /^\$([^=\s]+)=(.*)$/.exec(line.trim());
  if (!m) return null;
  const key = m[1]!;
  const parts = key.split('/').filter(Boolean);
  const group =
    key.startsWith('/') && parts.length > 1 ? parts.slice(0, -1).join('/') : (parts[0] ?? key);
  return { key, value: m[2]!.trim(), group };
}

export function parseSettingsList(lines: readonly string[]): SettingEntry[] {
  return lines.map(parseSettingLine).filter((e): e is SettingEntry => e !== null);
}

/** Groups settings for a browser view, keeping the controller's order. */
export function groupSettings(entries: readonly SettingEntry[]): Map<string, SettingEntry[]> {
  const groups = new Map<string, SettingEntry[]>();
  for (const e of entries) {
    const list = groups.get(e.group) ?? [];
    list.push(e);
    groups.set(e.group, list);
  }
  return groups;
}

/** Settings that must never be typed blind: they can lock the operator out of the board. */
export const RISKY_SETTINGS = [
  /^WiFi\/Mode$/i,
  /^(Sta|AP)\/(SSID|Password|IPMode)$/i,
  /^Hostname$/i,
  /^HTTP\/(Port|Enable)$/i,
  /^Telnet\/(Port|Enable)$/i,
  /^Config\/Filename$/i,
];

export const isRiskySetting = (key: string): boolean => RISKY_SETTINGS.some((r) => r.test(key));
