/**
 * Changes single values of a FluidNC `config.yaml` and leaves everything else
 * as it was – byte for byte: comments, blank lines, indentation, quotes, the
 * line endings. (`$CD=<file>` would write the whole running config instead and
 * lose every comment.) Paths are written like FluidNC's runtime settings:
 * `axes/z/max_rate_mm_per_min`.
 */

export interface ConfigChange {
  path: string;
  value: string;
}

export type ConfigEditProblem = 'invalid' | 'missing' | 'section';

/** Why a change cannot be written: a bad path, no such section, or the path names a section. */
export class ConfigEditError extends Error {
  constructor(
    readonly problem: ConfigEditProblem,
    readonly path: string,
  ) {
    super(`${problem}: ${path}`);
    this.name = 'ConfigEditError';
  }
}

const PATH = /^[a-z0-9_]+(\/[a-z0-9_]+)*$/i;
const KEY_LINE = /^(\s*)([^:\s#][^:]*?)(\s*):(.*)$/;

interface Section {
  /** Line index of the section's own key */
  line: number;
  indent: number;
  /** Indentation of its first child, once seen */
  childIndent: number | null;
}

/** Splits the part after `key:` into its leading space, the value, and what trails it. */
function splitValue(rest: string): { lead: string; value: string; trail: string } {
  const lead = /^\s*/.exec(rest)![0];
  const body = rest.slice(lead.length);
  const comment = body.startsWith('#') ? 0 : body.search(/\s#/);
  const valuePart = comment < 0 ? body : body.slice(0, comment);
  const value = valuePart.trimEnd();
  return { lead, value, trail: body.slice(value.length) };
}

function quoted(old: string, value: string): string {
  const q = /^(['"]).*\1$/.exec(old)?.[1];
  return q ? `${q}${value}${q}` : value;
}

/**
 * Writes `changes` into `text`. A key that is missing from an existing section
 * is added as its first entry (FluidNC fills defaults for keys left out); a
 * missing section, a path that names a section or an invalid path throws a
 * `ConfigEditError` and nothing is changed.
 */
export function setConfigValues(text: string, changes: readonly ConfigChange[]): string {
  for (const c of changes) if (!PATH.test(c.path)) throw new ConfigEditError('invalid', c.path);
  const wanted = new Map(changes.map((c) => [c.path.toLowerCase(), c.value]));
  // Lines with their own ending, so a CRLF file stays CRLF.
  const lines = text.split(/(?<=\n)/);
  const stack: { indent: number; path: string }[] = [];
  const sections = new Map<string, Section>();
  const done = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const eol = /\r?\n$/.exec(raw)?.[0] ?? '';
    const line = raw.slice(0, raw.length - eol.length);
    const m = KEY_LINE.exec(line);
    if (!m) continue;
    const indent = m[1]!.length;
    while (stack.length > 0 && stack[stack.length - 1]!.indent >= indent) stack.pop();
    const parent = stack[stack.length - 1]?.path;
    if (parent !== undefined) {
      const s = sections.get(parent)!;
      s.childIndent ??= indent;
    }
    const path = (parent === undefined ? '' : `${parent}/`) + m[2]!.trim().toLowerCase();
    const { lead, value, trail } = splitValue(m[4]!);
    if (value === '') {
      if (wanted.has(path)) throw new ConfigEditError('section', path);
      stack.push({ indent, path });
      sections.set(path, { line: i, indent, childIndent: null });
      continue;
    }
    const next = wanted.get(path);
    if (next === undefined) continue;
    lines[i] = `${m[1]}${m[2]}${m[3]}:${lead}${quoted(value, next)}${trail}${eol}`;
    done.add(path);
  }
  const fileEol = text.includes('\r\n') ? '\r\n' : '\n';
  // Keys a section does not have yet: right below the section's line, in its children's indent.
  const inserts: { at: number; line: string }[] = [];
  for (const [path, value] of wanted) {
    if (done.has(path)) continue;
    const cut = path.lastIndexOf('/');
    const section = cut < 0 ? undefined : sections.get(path.slice(0, cut));
    if (!section) throw new ConfigEditError('missing', path);
    const eol = /\r?\n$/.exec(lines[section.line]!)?.[0] ?? fileEol;
    if (!lines[section.line]!.endsWith('\n')) lines[section.line] += eol;
    const indent = ' '.repeat(section.childIndent ?? section.indent + 2);
    inserts.push({ at: section.line + 1, line: `${indent}${path.slice(cut + 1)}: ${value}${eol}` });
  }
  inserts.sort((a, b) => a.at - b.at);
  for (const { at, line } of inserts.reverse()) lines.splice(at, 0, line);
  return lines.join('');
}

/**
 * Whether two config texts are the same as FluidNC shows a file
 * (`$LocalFS/Show`): line by line, without blank lines and trailing spaces,
 * which the WebSocket output does not carry.
 */
export function sameConfigText(a: string, b: string): boolean {
  const lines = (s: string) =>
    s
      .split(/\r?\n/)
      .map((l) => l.trimEnd())
      .filter((l) => l !== '');
  const x = lines(a);
  const y = lines(b);
  return x.length === y.length && x.every((l, i) => l === y[i]);
}
