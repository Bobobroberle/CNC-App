import { watchHolds } from '../lib/holds';
import { isStandalone, watchViewport } from '../lib/platform';

/** The focused text field, if any */
function focusedField(): HTMLElement | null {
  const el = document.activeElement;
  return el instanceof HTMLElement && el.matches('input, textarea, select') ? el : null;
}

/** Brings the focused field into the part of the panel the keyboard leaves free. */
function revealField(): void {
  // Two frames: the layout has to shrink to the visible part first.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => focusedField()?.scrollIntoView({ block: 'center' })),
  );
}

/**
 * Makes the page behave like an app on a touch screen: held controls let go
 * when the app is left, the layout stays above the on-screen keyboard, the
 * page itself never zooms, and CSS knows whether it runs from the home screen.
 */
export function startPlatform(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const root = document.documentElement;
  watchHolds(window, document);
  watchViewport(window, root, (open) => {
    if (open) revealField();
  });
  document.addEventListener('focusin', () => {
    if (root.classList.contains('keyboard')) revealField();
  });
  // Safari: two fingers beside the stage would zoom the whole page.
  for (const type of ['gesturestart', 'gesturechange']) {
    document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
  }
  root.classList.toggle(
    'standalone',
    isStandalone(navigator, (query) => matchMedia(query).matches),
  );
}
