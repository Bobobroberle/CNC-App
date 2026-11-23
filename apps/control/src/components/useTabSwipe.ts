import { useEffect, type RefObject } from 'react';
import { swipeAxis, swipeStep } from '../lib/gesture';
import { inEdgeZone } from '../lib/platform';
import { reducedMotion, rubberband, Spring, SPRINGS, VelocityTracker } from '../lib/spring';

/**
 * Where a sideways swipe must not start: anything that is dragged itself
 * (sliders, the handwheel, the joystick, the stage), anything that is held
 * to move the machine, and text fields.
 */
const NO_SWIPE =
  'input, textarea, select, [contenteditable], [role="slider"], canvas, .jogstick, .wheel, .jogpad, .hold, .stage, [data-no-swipe]';

/** How far the page follows the finger at most (CSS px) */
const FOLLOW = 140;
/** The new page slides in from this far */
const ENTER = 48;

/** Something between the touched element and the panel scrolls sideways itself. */
function scrollsSideways(from: Element, panel: Element): boolean {
  for (let el: Element | null = from; el && el !== panel; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth + 1) {
      const overflow = getComputedStyle(el).overflowX;
      if (overflow === 'auto' || overflow === 'scroll') return true;
    }
  }
  return false;
}

/**
 * A sideways swipe with a finger on the side panel goes to the next or the
 * previous view of the room – whatever `SubNav` is shown there, so new views
 * need nothing extra. The page follows the finger a little, and where the
 * flick would come to rest decides. Up and down stays the panel's own
 * scrolling. The mouse does not swipe.
 */
export function useTabSwipe(panel: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    const page = () => el.querySelector<HTMLElement>('.room-switch');
    const tabs = () => {
      const buttons = [
        ...el.querySelectorAll<HTMLButtonElement>('.subnav [data-slot="segmented-control-item"]'),
      ];
      return {
        buttons,
        index: buttons.findIndex((b) => b.getAttribute('aria-pressed') === 'true'),
      };
    };
    const offset = new Spring(0, (x) => {
      const p = page();
      if (p) p.style.transform = x === 0 ? '' : `translateX(${x}px)`;
    });
    const tracker = new VelocityTracker();
    let start: { id: number; x: number; y: number } | null = null;
    let swiping = false;

    const end = () => {
      start = null;
      swiping = false;
    };
    const down = (e: PointerEvent) => {
      if (start || e.pointerType === 'mouse' || !e.isPrimary) return;
      const target = e.target as Element;
      if (target.closest(NO_SWIPE) || scrollsSideways(target, el)) return;
      // The screen edges belong to the system (back, Slide Over).
      if (inEdgeZone(e.clientX, window.innerWidth)) return;
      if (tabs().index < 0) return;
      start = { id: e.pointerId, x: e.clientX, y: e.clientY };
      swiping = false;
      tracker.reset();
    };
    const move = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x;
      if (!swiping) {
        const axis = swipeAxis(dx, e.clientY - start.y);
        if (axis === 'vertical') end();
        if (axis !== 'horizontal') return;
        swiping = true;
        // From here on the swipe is ours; the pan starts where it was recognised.
        start = { ...start, x: e.clientX, y: e.clientY };
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          // the pointer is already gone
        }
        return;
      }
      tracker.add(e.clientX, e.clientY, e.timeStamp);
      if (reducedMotion()) return;
      // Less give towards a side where there is no further view.
      const { buttons, index } = tabs();
      const open = dx < 0 ? index < buttons.length - 1 : index > 0;
      offset.set(rubberband(dx, open ? FOLLOW : FOLLOW / 4));
    };
    const up = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x;
      const wasSwiping = swiping;
      end();
      if (!wasSwiping) return;
      const velocity = tracker.velocity(e.timeStamp).x;
      const step = swipeStep(dx, velocity, el.clientWidth);
      const { buttons, index } = tabs();
      const next = buttons[index + step];
      if (step !== 0 && next && !next.disabled) {
        next.click();
        // The new view comes in from the side the finger pulled it from.
        offset.set(step * ENTER);
        offset.to(0, { config: SPRINGS.momentum });
      } else {
        offset.to(0, { config: SPRINGS.default, velocity });
      }
    };
    const cancel = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      end();
      offset.to(0, { config: SPRINGS.default });
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      offset.stop();
    };
  }, [panel]);
}
