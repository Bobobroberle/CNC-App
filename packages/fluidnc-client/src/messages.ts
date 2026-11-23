import { parseStatusReport, type StatusReport } from './status';

export type ControllerMessage =
  | { type: 'ok' }
  | { type: 'error'; code: number }
  | { type: 'alarm'; code: number }
  | { type: 'status'; report: StatusReport }
  | { type: 'welcome'; version: string; text: string }
  /** `[MSG:Homed:XYZ]` after a successful homing cycle (Machine/Homing.cpp) */
  | { type: 'homed'; axes: string }
  | { type: 'message'; level: string; text: string }
  | { type: 'parserState'; words: string[] }
  | { type: 'offset'; name: string; values: number[]; text: string }
  | { type: 'setting'; key: string; value: string }
  | { type: 'echo'; text: string }
  | { type: 'text'; text: string };

const OFFSET_NAMES = new Set([
  'G54',
  'G55',
  'G56',
  'G57',
  'G58',
  'G59',
  'G28',
  'G30',
  'G92',
  'TLO',
  'PRB',
]);

/** Classifies one line received from FluidNC. */
export function parseMessage(rawLine: string): ControllerMessage {
  const line = rawLine.trim();
  if (line === 'ok') return { type: 'ok' };
  let m = /^error:(\d+)$/i.exec(line);
  if (m) return { type: 'error', code: Number(m[1]) };
  m = /^ALARM:(\d+)$/i.exec(line);
  if (m) return { type: 'alarm', code: Number(m[1]) };
  const report = parseStatusReport(line);
  if (report) return { type: 'status', report };
  m = /^Grbl\s+(\S+)(?:.*\[FluidNC\s+(v[^\s\]]+))?/.exec(line);
  if (m) return { type: 'welcome', version: m[2] ?? m[1]!, text: line };
  m = /^\[MSG:Homed:([A-Z]*)\]$/.exec(line);
  if (m) return { type: 'homed', axes: m[1]! };
  m = /^\[MSG:(?:(\w+):\s*)?(.*)\]$/.exec(line);
  if (m) return { type: 'message', level: m[1] ?? 'INFO', text: m[2]! };
  m = /^\[GC:(.*)\]$/.exec(line);
  if (m) return { type: 'parserState', words: m[1]!.split(/\s+/).filter(Boolean) };
  m = /^\[echo:\s*(.*)\]$/.exec(line);
  if (m) return { type: 'echo', text: m[1]! };
  m = /^\[([A-Z0-9]+):([^\]]*)\]$/.exec(line);
  if (m && OFFSET_NAMES.has(m[1]!)) {
    const [values = ''] = m[2]!.split(':');
    return { type: 'offset', name: m[1]!, values: values.split(',').map(Number), text: m[2]! };
  }
  m = /^\$([^=\s]+)=(.*)$/.exec(line);
  if (m) return { type: 'setting', key: m[1]!, value: m[2]! };
  return { type: 'text', text: line };
}
