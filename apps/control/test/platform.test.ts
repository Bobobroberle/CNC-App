import { describe, expect, it, vi } from 'vitest';
import {
  canAddToHomeScreen,
  EDGE_ZONE,
  inEdgeZone,
  isStandalone,
  viewportBox,
  watchViewport,
} from '../src/lib/platform';

const never = () => false;

describe('home-screen app', () => {
  it('knows when it runs from the home screen', () => {
    expect(isStandalone({ standalone: true }, never)).toBe(true);
    expect(isStandalone({ standalone: false }, never)).toBe(false);
    expect(isStandalone({}, (q) => q === '(display-mode: standalone)')).toBe(true);
    expect(isStandalone(undefined, never)).toBe(false);
  });

  it('offers the home screen only in Safari on a touch device, and never from the home screen', () => {
    // Safari on the iPad, in the browser
    expect(canAddToHomeScreen({ standalone: false, maxTouchPoints: 5 }, never)).toBe(true);
    // Started from the home screen
    expect(canAddToHomeScreen({ standalone: true, maxTouchPoints: 5 }, never)).toBe(false);
    // Chrome on Windows or Android: no navigator.standalone at all
    expect(canAddToHomeScreen({ maxTouchPoints: 10 }, never)).toBe(false);
    // Safari on a Mac has the property but no touch screen
    expect(canAddToHomeScreen({ standalone: false, maxTouchPoints: 0 }, never)).toBe(false);
    expect(canAddToHomeScreen({ standalone: false }, never)).toBe(false);
    expect(canAddToHomeScreen(undefined, never)).toBe(false);
    expect(canAddToHomeScreen({ standalone: false, maxTouchPoints: 5 }, () => true)).toBe(false);
  });
});

describe('on-screen keyboard', () => {
  it('shrinks the app to what the keyboard leaves', () => {
    expect(viewportBox(820, { height: 420, offsetTop: 0, scale: 1 })).toEqual({
      height: 420,
      top: 0,
      keyboard: true,
    });
    // Safari scrolled the page up to show the field: the app follows.
    expect(viewportBox(1180, { height: 760.4, offsetTop: 96.2, scale: 1 })).toEqual({
      height: 760,
      top: 96,
      keyboard: true,
    });
  });

  it('leaves the app alone without a keyboard', () => {
    const whole = { height: 820, top: 0, keyboard: false };
    expect(viewportBox(820, { height: 820, offsetTop: 0, scale: 1 })).toEqual(whole);
    // A browser toolbar is not a keyboard.
    expect(viewportBox(820, { height: 760, offsetTop: 0, scale: 1 })).toEqual(whole);
    // Zoomed in by the user: the visible part is small for another reason.
    expect(viewportBox(820, { height: 410, offsetTop: 100, scale: 2 })).toEqual(whole);
    expect(viewportBox(820, null)).toEqual(whole);
    expect(viewportBox(820, undefined)).toEqual(whole);
  });

  it('writes the visible box to the root element and says when the keyboard comes and goes', () => {
    const listeners = new Map<string, () => void>();
    const vv = {
      height: 820,
      offsetTop: 0,
      scale: 1,
      addEventListener: (type: string, l: () => void) => void listeners.set(`vv:${type}`, l),
      removeEventListener: (type: string) => void listeners.delete(`vv:${type}`),
    };
    const win = {
      innerHeight: 820,
      visualViewport: vv,
      addEventListener: (type: string, l: () => void) => void listeners.set(`win:${type}`, l),
      removeEventListener: (type: string) => void listeners.delete(`win:${type}`),
    };
    const props = new Map<string, string>();
    const classes = new Set<string>();
    const root = {
      style: {
        setProperty: (name: string, value: string) => void props.set(name, value),
        removeProperty: (name: string) => void props.delete(name),
      },
      classList: {
        toggle: (name: string, on: boolean) => void (on ? classes.add(name) : classes.delete(name)),
      },
    };
    const onKeyboard = vi.fn();
    const stop = watchViewport(win, root, onKeyboard);
    expect(props.size).toBe(0);
    expect(classes.has('keyboard')).toBe(false);
    expect(onKeyboard).not.toHaveBeenCalled();

    vv.height = 430;
    vv.offsetTop = 40;
    listeners.get('vv:resize')!();
    expect(props.get('--app-height')).toBe('430px');
    expect(props.get('--app-top')).toBe('40px');
    expect(classes.has('keyboard')).toBe(true);
    expect(onKeyboard).toHaveBeenLastCalledWith(true);

    vv.offsetTop = 60;
    listeners.get('vv:scroll')!();
    expect(props.get('--app-top')).toBe('60px');
    expect(onKeyboard).toHaveBeenCalledTimes(1);

    vv.height = 820;
    vv.offsetTop = 0;
    listeners.get('win:resize')!();
    expect(props.size).toBe(0);
    expect(classes.has('keyboard')).toBe(false);
    expect(onKeyboard).toHaveBeenLastCalledWith(false);

    stop();
    expect(listeners.size).toBe(0);
  });

  it('does nothing in a browser without a visual viewport', () => {
    const win = { innerHeight: 800, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const root = {
      style: { setProperty: vi.fn(), removeProperty: vi.fn() },
      classList: { toggle: vi.fn() },
    };
    watchViewport(win, root)();
    expect(win.addEventListener).not.toHaveBeenCalled();
    expect(root.classList.toggle).not.toHaveBeenCalled();
  });
});

describe('screen edges', () => {
  it('leaves the strips along the left and right edge to the system', () => {
    expect(inEdgeZone(5, 1180)).toBe(true);
    expect(inEdgeZone(1180 - 5, 1180)).toBe(true);
    expect(inEdgeZone(EDGE_ZONE, 1180)).toBe(false);
    expect(inEdgeZone(600, 1180)).toBe(false);
    expect(inEdgeZone(30, 1180, 40)).toBe(true);
  });
});
