// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { NativeSelect } from '../src/ui/native-select';

afterEach(cleanup);

describe('the native select', () => {
  /** The classes of the frame around the <select> – what fades it */
  const frame = (disabled: boolean) => {
    const { container } = render(
      <NativeSelect disabled={disabled} aria-label="x" defaultValue="a">
        <option value="a">a</option>
        <option value="b" disabled>
          b – closed
        </option>
      </NativeSelect>,
    );
    return container.querySelector<HTMLElement>('[data-slot="select-control"]')!.className;
  };

  it('fades only where the select itself is disabled: a closed choice in its list is no reason', () => {
    const classes = frame(false);
    // `has-disabled` would match the closed <option> and fade the whole field to 64 % (below DESIGN.md §7's contrast)
    expect(classes).not.toMatch(/(^|\s)has-disabled:opacity-64/);
    expect(classes).toContain('has-[select:disabled]:opacity-64');
    // and the select that is disabled does fade (the selector is still there)
    expect(document.querySelector('select')!.disabled).toBe(false);
    cleanup();
    frame(true);
    expect(document.querySelector('select')!.disabled).toBe(true);
    expect(
      document.querySelector('[data-slot="select-control"]')!.matches(':has(select:disabled)'),
    ).toBe(true);
  });
});
