import type { MessageKey } from '../i18n';

/**
 * Why a control cannot be used (DESIGN.md §6.2: "Voraussetzung fehlt – mit
 * Angabe, welche"). A disabled button carries its reason as `data-reason`;
 * the app's `ReasonLayer` shows it on a tap.
 */

/** What the machine's state has against an action that needs it at rest – or null. */
export function machineReason(
  connection: string,
  state: string | undefined | null,
  viewer = false,
): MessageKey | null {
  if (connection === 'connecting') return 'reason.connecting';
  if (connection !== 'connected') return 'jog.reason.offline';
  if (viewer) return 'reason.viewer';
  if (!state) return 'reason.connecting';
  if (state === 'Alarm') return 'reason.alarm';
  if (state.startsWith('Hold')) return 'reason.hold';
  return state === 'Idle' ? null : 'jog.reason.busy';
}

/** What marks a disabled control that says why */
export const REASON_SELECTOR = '[data-reason]';

interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Where the reason of a control lies: above it, or below where there is no
 * room above; kept inside the page sideways. `size` is the hint's own size.
 */
export function reasonPlace(
  control: Rect,
  size: { width: number; height: number },
  page: { width: number; height: number },
  gap = 8,
): { left: number; top: number } {
  const above = control.top - gap - size.height;
  const top =
    above >= gap ? above : Math.min(control.bottom + gap, page.height - size.height - gap);
  const centred = (control.left + control.right) / 2 - size.width / 2;
  const left = Math.max(gap, Math.min(centred, page.width - size.width - gap));
  return { left, top: Math.max(gap, top) };
}
