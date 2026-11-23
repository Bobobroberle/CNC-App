import { afterEach, describe, expect, it, vi } from 'vitest';
import { startKeys } from '../src/store/keys';
import { useMachine } from '../src/store/machine';

describe('Space while something moves', () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { document?: unknown }).document;
  });

  it('holds the feed from a button, a slider, a checkbox and a list – but not from a text field', () => {
    const handlers: Record<string, (e: unknown) => void> = {};
    (globalThis as { window?: unknown }).window = {
      addEventListener: (type: string, h: (e: unknown) => void) => (handlers[type] = h),
      removeEventListener: () => undefined,
    };
    (globalThis as { document?: unknown }).document = { querySelector: () => null };
    const feedHold = vi.fn();
    useMachine.setState({ feedHold, status: { state: 'Run' } as never });
    const stop = startKeys();
    const press = (target: { tagName: string; type?: string }) =>
      handlers.keydown!({
        key: ' ',
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        repeat: false,
        target,
        preventDefault: () => undefined,
        stopPropagation: () => undefined,
      });
    press({ tagName: 'INPUT', type: 'text' });
    press({ tagName: 'TEXTAREA' });
    expect(feedHold).not.toHaveBeenCalled();
    press({ tagName: 'BUTTON' });
    press({ tagName: 'INPUT', type: 'range' });
    press({ tagName: 'INPUT', type: 'checkbox' });
    press({ tagName: 'SELECT' });
    expect(feedHold).toHaveBeenCalledTimes(4);
    // At rest Space keeps its own meaning for the focused control.
    useMachine.setState({ status: { state: 'Idle' } as never });
    press({ tagName: 'INPUT', type: 'range' });
    expect(feedHold).toHaveBeenCalledTimes(4);
    stop();
  });
});
