import { typingInto, type KeyLike } from './shortcuts';

/** What a key means in the drawing workspace. */
export type CamKey =
  | { do: 'delete' | 'deselect' | 'undo' | 'redo' | 'duplicate' | 'copy' | 'paste' | 'all' }
  | { do: 'nudge'; dx: number; dy: number };

// The keys are listed for the operator in `lib/shortcuts.ts` (a test holds the two together).
export { typingInto };

const ARROWS: Record<string, readonly [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
};

/**
 * The keys of the drawing, as in any drawing program: Entf/Backspace
 * deletes, Esc lets go, the arrows nudge by 1 mm (Shift: 10 mm, Alt:
 * 0.1 mm), Ctrl/Cmd+Z undoes, with Shift or as Ctrl+Y redoes, Ctrl/Cmd+D
 * duplicates, +C/+V copy and paste, +A selects everything. Null for every
 * other key: it is left to the browser.
 */
export function camKey(e: KeyLike): CamKey | null {
  const command = e.ctrlKey || e.metaKey;
  const letter = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (command) {
    if (e.altKey) return null;
    if (letter === 'z') return { do: e.shiftKey ? 'redo' : 'undo' };
    if (e.shiftKey) return null;
    if (letter === 'y') return { do: 'redo' };
    if (letter === 'd') return { do: 'duplicate' };
    if (letter === 'c') return { do: 'copy' };
    if (letter === 'v') return { do: 'paste' };
    if (letter === 'a') return { do: 'all' };
    return null;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') return { do: 'delete' };
  if (e.key === 'Escape') return { do: 'deselect' };
  const arrow = ARROWS[e.key];
  if (!arrow) return null;
  const step = e.altKey ? 0.1 : e.shiftKey ? 10 : 1;
  return { do: 'nudge', dx: arrow[0] * step, dy: arrow[1] * step };
}
