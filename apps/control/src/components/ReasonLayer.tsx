import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import { machineReason, REASON_SELECTOR, reasonPlace } from '../lib/reason';
import { useMachine } from '../store/machine';

interface Shown {
  text: string;
  rect: DOMRect;
}

/** The two general reasons in words, as things are at the tap (`ui/button.tsx`). */
function words(reason: string): string {
  if (reason !== 'machine' && reason !== 'missing') return reason;
  const { connection, status } = useMachine.getState();
  const machine = reason === 'machine' ? machineReason(connection, status?.state) : null;
  return t(machine ?? 'reason.missing');
}

/** How long a reason stays after the tap, ms */
const SHOWN_MS = 4000;

/**
 * Says why a disabled control cannot be used (DESIGN.md §6.2, §8): a tap on
 * it shows its reason for a moment – never hover alone. A disabled button
 * takes no pointer events, so the layer looks for the control under the tap
 * itself; nothing is wrapped around the buttons and no layout changes. The
 * hint takes no taps (`pointer-events: none`) and is no dialog.
 */
export function ReasonLayer() {
  const [shown, setShown] = useState<Shown | null>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  const hint = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const find = (x: number, y: number) =>
      document
        .elementsFromPoint(x, y)
        .find((el) => el.matches(REASON_SELECTOR) || el.closest(REASON_SELECTOR) !== null)
        ?.closest(REASON_SELECTOR) ?? null;
    const down = (e: PointerEvent) => {
      const control = find(e.clientX, e.clientY);
      // Where a control already shows its reason beside itself (ui/tooltip.tsx), that is the one.
      const text = control?.closest('[data-slot="reason"]')
        ? null
        : control?.getAttribute('data-reason');
      setShown(
        control && text ? { text: words(text), rect: control.getBoundingClientRect() } : null,
      );
    };
    window.addEventListener('pointerdown', down, true);
    return () => window.removeEventListener('pointerdown', down, true);
  }, []);
  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setShown(null), SHOWN_MS);
    return () => clearTimeout(timer);
  }, [shown]);
  useLayoutEffect(() => {
    const el = hint.current;
    if (!shown || !el) return setPlace(null);
    setPlace(
      reasonPlace(
        shown.rect,
        { width: el.offsetWidth, height: el.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [shown]);
  if (!shown) return null;
  return (
    <div
      ref={hint}
      role="status"
      className="reason-hint"
      data-testid="reason-hint"
      style={
        place ? { left: place.left, top: place.top } : { left: 0, top: 0, visibility: 'hidden' }
      }
    >
      {shown.text}
    </div>
  );
}
