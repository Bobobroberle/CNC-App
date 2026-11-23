/**
 * What the app needs to know about where it runs: opened from the home
 * screen or in the browser, where the on-screen keyboard is, and where the
 * system's own edge gestures live. No DOM globals at module level, so it
 * can be tested.
 */

interface NavigatorLike {
  /** Safari on iPadOS/iOS only: true when started from the home screen */
  standalone?: boolean;
  maxTouchPoints?: number;
}

type Match = (query: string) => boolean;

/** Started from the home screen: own window, no browser bars. */
export function isStandalone(nav: NavigatorLike | undefined, match: Match): boolean {
  return nav?.standalone === true || match('(display-mode: standalone)');
}

/**
 * Safari on an iPad or iPhone, not yet opened from the home screen: the
 * place where "Teilen → Zum Home-Bildschirm" exists and helps. (Only Safari
 * on Apple's touch devices has `navigator.standalone`.)
 */
export function canAddToHomeScreen(nav: NavigatorLike | undefined, match: Match): boolean {
  return (
    nav !== undefined &&
    nav.standalone === false &&
    (nav.maxTouchPoints ?? 0) > 1 &&
    !isStandalone(nav, match)
  );
}

export interface ViewportBox {
  /** Visible height and its distance from the top of the page, CSS px */
  height: number;
  top: number;
  /** The on-screen keyboard covers part of the page */
  keyboard: boolean;
}

/** The on-screen keyboard is at least this high (a pinch zoom or a toolbar is not) */
const KEYBOARD_MIN = 120;

/**
 * Where the app can be seen. iPadOS and Android lay the keyboard over the
 * page instead of resizing it, so the page itself has to move out from
 * under it: `layout` is the page's height, `visual` what is visible of it.
 */
export function viewportBox(
  layout: number,
  visual: { height: number; offsetTop: number; scale: number } | null | undefined,
): ViewportBox {
  if (!visual) return { height: layout, top: 0, keyboard: false };
  // Zoomed in by the user: the visible part is small for another reason.
  const zoomed = Math.abs(visual.scale - 1) > 0.01;
  const keyboard = !zoomed && layout - visual.height >= KEYBOARD_MIN;
  return keyboard
    ? {
        height: Math.round(visual.height),
        top: Math.max(0, Math.round(visual.offsetTop)),
        keyboard,
      }
    : { height: layout, top: 0, keyboard: false };
}

/** Strip along the left and right screen edge that belongs to system gestures (back, Slide Over) */
export const EDGE_ZONE = 24;

/** Whether a touch starts where the system's own edge swipes begin. */
export function inEdgeZone(x: number, width: number, zone = EDGE_ZONE): boolean {
  return x < zone || x > width - zone;
}

interface VisualViewportLike {
  height: number;
  offsetTop: number;
  scale: number;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

interface WindowLike {
  innerHeight: number;
  visualViewport?: VisualViewportLike | null;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

interface RootLike {
  style: { setProperty(name: string, value: string): void; removeProperty(name: string): void };
  classList: { toggle(name: string, on: boolean): void };
}

/**
 * Keeps the app inside the visible part of the page: while the on-screen
 * keyboard is up, `--app-height` and `--app-top` on the root element shrink
 * the layout to what is left, so the top bar with NOT-HALT stays on screen
 * and the panel can scroll the focused field into view. `onKeyboard` is
 * called when the keyboard comes or goes. Returns the function that stops it.
 */
export function watchViewport(
  win: WindowLike,
  root: RootLike,
  onKeyboard: (open: boolean) => void = () => undefined,
): () => void {
  const vv = win.visualViewport;
  if (!vv) return () => undefined;
  let open = false;
  const update = () => {
    const box = viewportBox(win.innerHeight, vv);
    if (box.keyboard) {
      root.style.setProperty('--app-height', `${box.height}px`);
      root.style.setProperty('--app-top', `${box.top}px`);
    } else {
      root.style.removeProperty('--app-height');
      root.style.removeProperty('--app-top');
    }
    root.classList.toggle('keyboard', box.keyboard);
    if (box.keyboard !== open) {
      open = box.keyboard;
      onKeyboard(open);
    }
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  win.addEventListener('resize', update);
  update();
  return () => {
    vv.removeEventListener('resize', update);
    vv.removeEventListener('scroll', update);
    win.removeEventListener('resize', update);
  };
}
