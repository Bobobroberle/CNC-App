export interface DiffLine {
  kind: 'same' | 'add' | 'del';
  text: string;
}

/** Line diff by longest common subsequence; fine for config files of a few hundred lines. */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);
  const n = a.length;
  const m = b.length;
  const lcs: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] =
        a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: 'same', text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ kind: 'del', text: a[i++]! });
    } else {
      out.push({ kind: 'add', text: b[j++]! });
    }
  }
  while (i < n) out.push({ kind: 'del', text: a[i++]! });
  while (j < m) out.push({ kind: 'add', text: b[j++]! });
  return out;
}

/** Only the changed lines with `context` lines around them; gaps become null. */
export function compactDiff(diff: readonly DiffLine[], context = 2): (DiffLine | null)[] {
  const keep = diff.map(() => false);
  diff.forEach((d, i) => {
    if (d.kind === 'same') return;
    for (let k = Math.max(0, i - context); k <= Math.min(diff.length - 1, i + context); k++)
      keep[k] = true;
  });
  const out: (DiffLine | null)[] = [];
  diff.forEach((d, i) => {
    if (keep[i]) out.push(d);
    else if (out[out.length - 1] !== null) out.push(null);
  });
  return out;
}
