import { describe, expect, it, vi } from 'vitest';
import {
  HOLD_SLOP,
  holdCount,
  holdStart,
  releaseAllHolds,
  watchHolds,
  withinHold,
} from '../src/lib/holds';

/** A window or document that can fire events. */
function target(extra: Record<string, unknown> = {}) {
  const listeners = new Map<string, Set<() => void>>();
  return {
    ...extra,
    addEventListener(type: string, listener: () => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener(type: string, listener: () => void) {
      listeners.get(type)?.delete(listener);
    },
    fire(type: string) {
      for (const listener of [...(listeners.get(type) ?? [])]) listener();
    },
  };
}

describe('holds', () => {
  it('lets go of everything that is held, once', () => {
    const a = vi.fn();
    const b = vi.fn();
    const endA = holdStart(a);
    holdStart(b);
    expect(holdCount()).toBe(2);
    endA();
    expect(holdCount()).toBe(1);
    releaseAllHolds();
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    expect(holdCount()).toBe(0);
    releaseAllHolds();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('a release that ends its own registration is fine', () => {
    let end = () => undefined as void;
    const release = vi.fn(() => end());
    end = holdStart(release);
    releaseAllHolds();
    expect(release).toHaveBeenCalledTimes(1);
    expect(holdCount()).toBe(0);
  });

  it('lets go when the page is hidden, loses the focus or is left', () => {
    const win = target();
    const doc = target({ visibilityState: 'visible' }) as ReturnType<typeof target> & {
      visibilityState: string;
    };
    const stop = watchHolds(win, doc);
    const release = vi.fn();

    holdStart(release);
    doc.fire('visibilitychange');
    expect(release).toHaveBeenCalledTimes(0);
    doc.visibilityState = 'hidden';
    doc.fire('visibilitychange');
    expect(release).toHaveBeenCalledTimes(1);

    holdStart(release);
    win.fire('blur');
    expect(release).toHaveBeenCalledTimes(2);

    holdStart(release);
    win.fire('pagehide');
    expect(release).toHaveBeenCalledTimes(3);

    stop();
    const end = holdStart(release);
    win.fire('blur');
    win.fire('pagehide');
    doc.fire('visibilitychange');
    expect(release).toHaveBeenCalledTimes(3);
    end();
  });

  it('a finger may wander a little past the edge, not further', () => {
    const rect = { left: 100, right: 200, top: 50, bottom: 110 };
    expect(withinHold(rect, 150, 80)).toBe(true);
    expect(withinHold(rect, 100 - HOLD_SLOP, 50 - HOLD_SLOP)).toBe(true);
    expect(withinHold(rect, 200 + HOLD_SLOP + 1, 80)).toBe(false);
    expect(withinHold(rect, 150, 110 + HOLD_SLOP + 1)).toBe(false);
    expect(withinHold(rect, 99, 80, 0)).toBe(false);
    expect(withinHold(rect, 150, 49, 0)).toBe(false);
  });
});
