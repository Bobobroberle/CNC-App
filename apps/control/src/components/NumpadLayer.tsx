import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import { getLocale } from '../lib/format';
import { pressKey, separatorOf, unitOf, type NumpadKey } from '../lib/numpad';
import { Numpad } from '../ui/numpad';

/** For this long after the finger that opened the pad has lifted, its keys take nothing: that tap may end on one, ms */
const OPENING_MS = 80;
const FIELDS = 'input[inputmode="decimal"], input[inputmode="numeric"], input[data-numpad]';

/** Writes into a field the way typing does: React hears the `input` event. */
function write(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function labelOf(input: HTMLInputElement): string {
  return (
    input.getAttribute('aria-label') ??
    input.labels?.[0]?.textContent ??
    input.closest('[data-slot="field"]')?.querySelector('label')?.textContent ??
    input.placeholder ??
    ''
  ).trim();
}

/**
 * The app's own number pad (DESIGN.md §8): a number field touched with a
 * finger or a pen gets our pad instead of the system keyboard. The field
 * keeps the focus, so a hardware keyboard still types into it; with a mouse
 * nothing changes. `parseNumber` reads what was entered, as before.
 */
export function NumpadLayer() {
  const [field, setField] = useState<HTMLInputElement | null>(null);
  const [value, setValue] = useState('');
  const current = useRef<HTMLInputElement | null>(null);
  current.current = field;
  /** Until when the keys take nothing: the tap that opened the pad must not press one of them */
  const opening = useRef(0);

  useEffect(() => {
    const close = () => {
      const input = current.current;
      if (!input) return;
      const mode = input.dataset.numpad;
      if (mode) input.setAttribute('inputmode', mode);
      setField(null);
    };
    const down = (e: PointerEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('[data-slot="numpad"]')) return;
      const input = target?.closest<HTMLInputElement>(FIELDS) ?? null;
      if (!input || input.disabled || input.readOnly || e.pointerType === 'mouse') {
        // Anywhere else: the pad goes (the field loses the focus by itself).
        if (input !== current.current) close();
        return;
      }
      if (input === current.current) return;
      close();
      // The system keyboard stays down for this field while our pad serves it.
      input.dataset.numpad ??= input.getAttribute('inputmode') ?? 'decimal';
      input.setAttribute('inputmode', 'none');
      setValue(input.value);
      setField(input);
      // The pad may come up right under the finger (a field at the bottom right): the tap
      // then ends on the pad and would never give the field the focus – so it gets it here.
      // The system keyboard stays down (`inputmode="none"`).
      const finger = e.pointerId;
      opening.current = Number.POSITIVE_INFINITY;
      const lifted = (up: PointerEvent) => {
        if (up.pointerId !== finger) return;
        opening.current = performance.now() + OPENING_MS;
        window.removeEventListener('pointerup', lifted, true);
        window.removeEventListener('pointercancel', lifted, true);
      };
      window.addEventListener('pointerup', lifted, true);
      window.addEventListener('pointercancel', lifted, true);
      input.focus({ preventScroll: true });
    };
    const typed = (e: Event) => {
      if (e.target === current.current) setValue((e.target as HTMLInputElement).value);
    };
    const left = (e: FocusEvent) => {
      if (e.target === current.current) close();
    };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('input', typed, true);
    document.addEventListener('focusout', left, true);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('input', typed, true);
      document.removeEventListener('focusout', left, true);
    };
  }, []);

  // The field stays in sight above the pad.
  useEffect(() => {
    if (field) field.scrollIntoView({ block: 'nearest' });
  }, [field]);

  if (!field) return null;
  const whole = field.dataset.numpad === 'numeric';
  const separator = separatorOf(getLocale());
  const label = labelOf(field);
  const onKey = (key: NumpadKey) => {
    if (performance.now() < opening.current) return;
    const next = pressKey(field.value, key, { separator, whole });
    write(field, next);
    setValue(next);
  };
  return (
    <Numpad
      className="numpad-layer"
      data-no-swipe
      label={label}
      value={value}
      unit={unitOf(label)}
      separator={separator}
      whole={whole}
      labels={{
        back: t('numpad.back'),
        sign: t('numpad.sign'),
        separator: t('numpad.separator'),
        clear: t('numpad.clear'),
        done: t('numpad.done'),
      }}
      onKey={onKey}
      onDone={() => field.blur()}
    />
  );
}
