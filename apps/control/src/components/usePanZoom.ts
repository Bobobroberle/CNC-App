import { useEffect, useRef } from 'react';
import {
  PanZoom,
  TAP_SLOP,
  type Modifiers,
  type PanZoomHost,
  type Point,
  type PointerKind,
} from '../lib/gesture';
import { holdStart } from '../lib/holds';

/** One wheel notch zooms by this factor */
const WHEEL_STEP = 1.2;

/** Something lying on the view that a finger has taken hold of. */
export interface ViewGrab {
  /**
   * The finger is at `p` now (CSS px inside the view) – less the way it went inside the tap slop, so a thing that
   * follows it starts without a jump. `finger` is where the finger really is, for a thing that is drawn to it
   * (the corner of a frame). `modifiers` is passed only where Alt is held at this move (a key held down
   * during the drag counts, not only one held as the finger came down).
   */
  move(p: Point, finger?: Point, modifiers?: Modifiers): void;
  /**
   * The finger let go, or the touch was lost. `lifted` is `true` only for a finger that was lifted – not for a
   * second finger that took the grab away, a lost touch or the app being left (it is not passed then): a thing
   * that is only decided by letting go (a frame drawn across the table) must not be decided by those.
   */
  end(lifted?: boolean): void;
  /**
   * The finger went down on the thing and came up again on the spot, never moving it: called after
   * `end`, and only then – not when a second finger or a lost touch ends the grab. How a thing that
   * is taken by a finger is also tapped (a marker that a tap removes and a drag moves).
   */
  tap?(): void;
  /**
   * A second finger lets go of the thing where it is – and, if it had not
   * moved yet, the two fingers pinch the view. Without this, further fingers
   * do nothing while the thing is held.
   */
  yields?: boolean;
}

/** A view on the stage: what the gesture layer needs, plus things that can be dragged on it. */
export interface StageViewHost extends PanZoomHost {
  /**
   * Asked when a finger comes down alone: a thing under it (a measured point,
   * a clamp) that should follow the finger instead of the view. A grab is
   * never a tap and never moves the view. `modifiers` is there only when Shift or Ctrl was held as it
   * came down.
   */
  grab?(p: Point, kind: PointerKind, modifiers?: Modifiers): ViewGrab | null;
}

/**
 * Connects an element to the stage's gesture layer (`lib/gesture.ts`): its
 * pointers pan, pinch, tap and double-tap the view the host describes. The
 * host may be a new object on every render; the gesture state lives on. The
 * element is passed as a value (keep it in state, set by a callback ref), so
 * the pointers are connected whenever it appears.
 */
export function usePanZoom(el: HTMLElement | null, host: StageViewHost): PanZoom {
  const latest = useRef(host);
  latest.current = host;
  const gesture = useRef<PanZoom | null>(null);
  gesture.current ??= new PanZoom({
    read: () => latest.current.read(),
    write: (t) => latest.current.write(t),
    limits: () => latest.current.limits(),
    size: () => latest.current.size(),
    tap: (p, kind, modifiers) =>
      modifiers ? latest.current.tap?.(p, kind, modifiers) : latest.current.tap?.(p, kind),
    doubleTap: (p) => latest.current.doubleTap?.(p),
    grabbed: (how) => latest.current.grabbed?.(how),
  });

  useEffect(() => {
    const pz = gesture.current!;
    if (!el) return;
    const local = (e: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const kind = (e: PointerEvent): PointerKind =>
      e.pointerType === 'mouse' ? 'mouse' : e.pointerType === 'pen' ? 'pen' : 'touch';
    // Shift, Ctrl or Cmd, and Alt: only given on where one is held (the wheel's own Ctrl – a pinch – is not
    // asked); `alt` is left off where it is not held
    const modifiers = (e: PointerEvent): Modifiers | undefined =>
      e.shiftKey || e.ctrlKey || e.metaKey || e.altKey
        ? e.altKey
          ? { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: true }
          : { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey }
        : undefined;
    // A thing on the view that follows one finger; the view rests meanwhile.
    let drag: {
      id: number;
      grab: ViewGrab;
      start: Point;
      kind: PointerKind;
      slop: number;
      /** Where the finger left the tap slop: the thing starts from there without a jump */
      offset: Point | null;
      release: () => void;
    } | null = null;
    const endDrag = (lifted = false) => {
      const d = drag;
      if (!d) return;
      drag = null;
      d.release();
      if (lifted) d.grab.end(true);
      else d.grab.end();
      // Down and up on the spot, never past the slop: a tap on the thing
      if (lifted && d.offset === null) d.grab.tap?.();
    };
    const down = (e: PointerEvent) => {
      // Only the main mouse button moves the view.
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      // Controls lying on the view (inset, joystick, tool result) keep their own touches.
      if ((e.target as Element).closest('button, a, input, [data-no-gesture]')) return;
      // While a thing is being dragged, further fingers do nothing – unless the
      // thing yields: then a second finger lets go of it where it is, and if it
      // had not moved yet, the two fingers were meant for the view: they pinch.
      const held = drag;
      if (held && !held.grab.yields) return;
      if (held && held.offset !== null) {
        endDrag();
        return;
      }
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // a pointer that is already gone cannot be captured
      }
      const p = local(e);
      if (held) {
        endDrag();
        pz.down(held.id, held.start, e.timeStamp, held.kind);
        pz.down(e.pointerId, p, e.timeStamp, kind(e));
        return;
      }
      const keys = modifiers(e);
      const grab =
        pz.touching === 0
          ? keys
            ? latest.current.grab?.(p, kind(e), keys)
            : latest.current.grab?.(p, kind(e))
          : null;
      if (grab) {
        pz.stop();
        // Like everything that is held: let go when the app loses the operator.
        drag = {
          id: e.pointerId,
          grab,
          start: p,
          kind: kind(e),
          slop: TAP_SLOP[kind(e)],
          offset: null,
          release: holdStart(endDrag),
        };
        return;
      }
      pz.down(e.pointerId, p, e.timeStamp, kind(e));
    };
    const move = (e: PointerEvent) => {
      if (drag?.id === e.pointerId) {
        const p = local(e);
        if (!drag.offset) {
          // A finger that only rolls on the spot selects, it does not shift.
          if (Math.hypot(p.x - drag.start.x, p.y - drag.start.y) <= drag.slop) return;
          drag.offset = { x: p.x - drag.start.x, y: p.y - drag.start.y };
        }
        const at = { x: p.x - drag.offset.x, y: p.y - drag.offset.y };
        // Alt held now (not only as the finger came down) is told to the thing that is dragged
        if (e.altKey) drag.grab.move(at, p, modifiers(e));
        else drag.grab.move(at, p);
        return;
      }
      pz.move(e.pointerId, local(e), e.timeStamp);
    };
    const up = (e: PointerEvent) => {
      if (drag?.id === e.pointerId) endDrag(true);
      else pz.up(e.pointerId, local(e), e.timeStamp, modifiers(e));
    };
    const cancel = (e: PointerEvent) => {
      if (drag?.id === e.pointerId) endDrag();
      else pz.cancel(e.pointerId);
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      // A trackpad pinch arrives as a fine ctrl+wheel; a wheel in notches.
      const factor = e.ctrlKey
        ? Math.exp(-e.deltaY / 100)
        : e.deltaY < 0
          ? WHEEL_STEP
          : 1 / WHEEL_STEP;
      pz.wheel(local(e), factor);
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      el.removeEventListener('wheel', wheel);
      endDrag();
      pz.reset();
    };
  }, [el]);

  return gesture.current;
}
