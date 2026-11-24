// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Result } from '../src/ui/dock';

// What a docked action leaves behind lies below the dock's stuck place when the card is taller than
// its panel: it is brought into view once, when it shows – not again at every render.
describe('the result of a docked action', () => {
  afterEach(() => {
    cleanup();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('is brought into view when it shows, once, the nearest way', () => {
    const reveal = vi.fn();
    Element.prototype.scrollIntoView = reveal;
    const { rerender, getByText } = render(<Result>done</Result>);
    expect(reveal).toHaveBeenCalledTimes(1);
    expect(reveal).toHaveBeenCalledWith({ block: 'nearest' });
    expect(reveal.mock.contexts[0]).toBe(getByText('done'));
    // The reports of the machine re-render the card: the view is not pulled back every time
    rerender(<Result>done still</Result>);
    rerender(<Result>and still</Result>);
    expect(reveal).toHaveBeenCalledTimes(1);
  });

  it('shows without it where a browser does not know how to scroll', () => {
    expect(() => render(<Result>done</Result>)).not.toThrow();
  });

  it('is a plain block of the card', () => {
    const { container } = render(<Result className="x">done</Result>);
    expect(container.firstElementChild?.getAttribute('data-slot')).toBe('result');
    expect(container.firstElementChild?.className).toBe('x');
  });
});
