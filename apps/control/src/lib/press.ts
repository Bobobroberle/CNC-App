/**
 * Press feedback on every control (DESIGN.md §6.2: a visible pressed state
 * within 100 ms). CSS `:active` alone is not enough: Safari on the iPad
 * applies it late or not at all to a touch, and on a desktop the hover
 * surface already looks like the pressed one. So the control under a finger,
 * pen or mouse gets `data-press` at `pointerdown` – in the capture phase,
 * passive, before any handler of its own – and loses it when the pointer
 * goes up, is cancelled, or the app is left. `styles/controls.css` draws it.
 * It changes nothing else: no event is stopped, nothing is clicked.
 */
export const PRESSABLE =
  'button, [role="button"], [role="tab"], [role="checkbox"], [role="switch"], a[href], summary';

export function pressTarget(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest(PRESSABLE);
  if (!el || el.matches(':disabled, [aria-disabled="true"], [data-disabled]')) return null;
  return el;
}

export function installPressFeedback(doc: Document = document): () => void {
  let pressed: Element | null = null;
  const release = () => {
    pressed?.removeAttribute('data-press');
    pressed = null;
  };
  const down = (e: Event) => {
    release();
    pressed = pressTarget(e.target);
    pressed?.setAttribute('data-press', '');
  };
  const opts = { capture: true, passive: true } as const;
  doc.addEventListener('pointerdown', down, opts);
  for (const type of ['pointerup', 'pointercancel', 'dragstart'] as const)
    doc.addEventListener(type, release, opts);
  const view = doc.defaultView;
  view?.addEventListener('blur', release);
  doc.addEventListener('visibilitychange', release);
  return () => {
    release();
    doc.removeEventListener('pointerdown', down, opts);
    for (const type of ['pointerup', 'pointercancel', 'dragstart'] as const)
      doc.removeEventListener(type, release, opts);
    view?.removeEventListener('blur', release);
    doc.removeEventListener('visibilitychange', release);
  };
}
