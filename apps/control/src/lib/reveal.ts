/**
 * Shows the place the quick search led to: the element marked
 * `data-find="…"` is unfolded, brought into view and outlined for a moment.
 * Nothing here presses anything – the operator does that.
 */

/** How long the outline stays, ms (the CSS fades it over the same time) */
export const FOUND_MS = 1800;
/** Frames to wait for a place that has to be drawn first */
const PATIENCE = 40;

interface FoundElement extends HTMLElement {
  foundTimer?: ReturnType<typeof setTimeout>;
}

function find(anchors: readonly string[]): FoundElement | null {
  for (const anchor of anchors) {
    const el = document.querySelector<FoundElement>(`[data-find~="${anchor}"]`);
    if (el) return el;
  }
  return null;
}

/** How long to wait for an unfolded part to be laid out, ms (it unfolds without a transition) */
export const UNFOLD_MS = 80;

/** The folded parts on the page (`components/Fold.tsx`), each with the way to unfold it */
const folds = new WeakMap<Element, () => boolean>();

/**
 * A folded part says how it is unfolded (`open` returns whether it was folded);
 * returns the function that takes that back.
 */
export function registerFold(el: Element, open: () => boolean): () => void {
  folds.set(el, open);
  return () => {
    if (folds.get(el) === open) folds.delete(el);
  };
}

/**
 * Unfolds every folded part the element lies in, and the element itself if it
 * is one. Returns whether anything had to be unfolded.
 */
function unfold(el: HTMLElement): boolean {
  let unfolded = false;
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    if (folds.get(node)?.()) unfolded = true;
  }
  return unfolded;
}

function mark(el: FoundElement): void {
  clearTimeout(el.foundTimer);
  el.classList.remove('found');
  // Read the layout once, so a second visit starts the outline anew.
  void el.offsetWidth;
  el.classList.add('found');
  el.foundTimer = setTimeout(() => el.classList.remove('found'), FOUND_MS);
}

/**
 * Brings the first of `anchors` that is on the page into view and outlines
 * it. The place may still have to be drawn (another room, a folded
 * section): it is looked for over the next frames.
 */
export function reveal(anchors: readonly string[]): void {
  if (anchors.length === 0 || typeof document === 'undefined') return;
  let tries = 0;
  const look = () => {
    const el = find(anchors);
    if (!el) {
      tries += 1;
      if (tries < PATIENCE) requestAnimationFrame(look);
      return;
    }
    const show = () => {
      const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
      // A card goes to the top of its panel; a button on the stage only has to be on screen.
      const card = el.closest('.panel-body') !== null && el.offsetHeight > 120;
      el.scrollIntoView({ block: card ? 'start' : 'nearest', behavior: calm ? 'auto' : 'smooth' });
      mark(el);
    };
    // A part that unfolds grows for a moment: the place is where it ends up.
    if (unfold(el)) setTimeout(show, UNFOLD_MS);
    else requestAnimationFrame(show);
  };
  // Two frames: the room and its view are drawn first.
  requestAnimationFrame(() => requestAnimationFrame(look));
}
