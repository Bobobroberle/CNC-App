export interface ControllerFile {
  name: string;
  /** Bytes */
  size: number;
}

/**
 * Reads the top-level files from `$SD/List` / `$LocalFS/List` output:
 * `[FILE: name|SIZE:123]`, `[DIR:name]`; nested entries are indented by depth
 * (FileCommands.cpp, listFilesystem).
 */
export function parseFileList(lines: readonly string[]): ControllerFile[] {
  const files: ControllerFile[] = [];
  for (const line of lines) {
    const m = /^\[FILE: (.*)\|SIZE:(\d+)\]$/.exec(line.trim());
    if (!m || m[1]!.startsWith(' ')) continue;
    files.push({ name: m[1]!, size: Number(m[2]) });
  }
  return files;
}

/** Characters FluidNC file names should avoid; spaces and umlauts break `$SD/Run=`. */
export function safeFileName(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return base === '' ? 'job.nc' : base;
}
