/**
 * Everything the operator holds to keep something going: a hold-to-confirm
 * button, continuous jog, the joystick. Each one registers how to let go.
 * When the page loses the operator – it is hidden, the window loses the
 * focus, the app goes to the background – all of them let go at once, as if
 * the finger had lifted. (This is the app's side of "hold to move"; limits
 * and stops stay with FluidNC.)
 */
const active = new Set<() => void>();

/** Registers a hold; returns the function that ends the registration. */
export function holdStart(release: () => void): () => void {
  active.add(release);
  return () => void active.delete(release);
}

/** Number of holds right now */
export function holdCount(): number {
  return active.size;
}

/** Lets go of everything that is being held. */
export function releaseAllHolds(): void {
  for (const release of [...active]) {
    active.delete(release);
    release();
  }
}

interface Listenable {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

/**
 * Lets go of all holds when the page is hidden, left or loses the focus.
 * Returns the function that stops watching.
 */
export function watchHolds(
  win: Listenable,
  doc: Listenable & { visibilityState?: string },
): () => void {
  const hidden = () => {
    if (doc.visibilityState !== 'visible') releaseAllHolds();
  };
  doc.addEventListener('visibilitychange', hidden);
  win.addEventListener('blur', releaseAllHolds);
  win.addEventListener('pagehide', releaseAllHolds);
  return () => {
    doc.removeEventListener('visibilitychange', hidden);
    win.removeEventListener('blur', releaseAllHolds);
    win.removeEventListener('pagehide', releaseAllHolds);
  };
}

/** How far a finger may wander past a held control's edge before it counts as let go (CSS px) */
export const HOLD_SLOP = 12;

/** Whether a pointer is still on a held control, give or take the slop. */
export function withinHold(
  rect: { left: number; right: number; top: number; bottom: number },
  x: number,
  y: number,
  slop = HOLD_SLOP,
): boolean {
  return (
    x >= rect.left - slop &&
    x <= rect.right + slop &&
    y >= rect.top - slop &&
    y <= rect.bottom + slop
  );
}
