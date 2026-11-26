// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { usePanZoom, type ViewGrab } from '../src/components/usePanZoom';

/** A view whose grabs are whatever the test hands out; what happens to them goes into `log`. */
function mount(make: (log: string[]) => ViewGrab | null) {
  const log: string[] = [];
  function Probe() {
    const [el, setEl] = useState<HTMLDivElement | null>(null);
    usePanZoom(el, {
      read: () => ({ scale: 1, x: 0, y: 0 }),
      write: () => undefined,
      limits: () => null,
      size: () => ({ width: 400, height: 300 }),
      grab: () => make(log),
    });
    return <div ref={setEl} data-testid="view" />;
  }
  const view = render(<Probe />).getByTestId('view');
  const fire = (type: string, id: number, x: number, y: number) => {
    const e = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true });
    Object.defineProperty(e, 'pointerId', { value: id });
    Object.defineProperty(e, 'pointerType', { value: 'touch' });
    view.dispatchEvent(e);
  };
  return { log, fire };
}

const grab = (log: string[], over: Partial<ViewGrab> = {}): ViewGrab => ({
  move: (p) => log.push(`move ${p.x},${p.y}`),
  end: () => log.push('end'),
  tap: () => log.push('tap'),
  ...over,
});

describe('a thing taken by a finger on the view', () => {
  afterEach(cleanup);

  it('is tapped when the finger goes down and up on the spot: the grab ends, then it is a tap', () => {
    const { log, fire } = mount((l) => grab(l));
    fire('pointerdown', 1, 50, 50);
    fire('pointermove', 1, 52, 51);
    fire('pointerup', 1, 52, 51);
    expect(log).toEqual(['end', 'tap']);
  });

  it('is moved, and not tapped, once the finger leaves the slop – however it ends', () => {
    const { log, fire } = mount((l) => grab(l));
    fire('pointerdown', 1, 50, 50);
    fire('pointermove', 1, 80, 50);
    fire('pointermove', 1, 90, 60);
    fire('pointerup', 1, 90, 60);
    // The first move comes from where the finger left the slop: no jump
    expect(log).toEqual(['move 50,50', 'move 60,60', 'end']);
  });

  it('is not tapped when the touch is lost', () => {
    const { log, fire } = mount((l) => grab(l));
    fire('pointerdown', 1, 50, 50);
    fire('pointercancel', 1, 50, 50);
    expect(log).toEqual(['end']);
  });

  it('is not tapped when a second finger lets go of it – the two fingers go to the view', () => {
    const { log, fire } = mount((l) => grab(l, { yields: true }));
    fire('pointerdown', 1, 50, 50);
    fire('pointerdown', 2, 120, 50);
    expect(log).toEqual(['end']);
    // The first finger lifting later is the view's business, not a tap on the thing
    fire('pointerup', 1, 50, 50);
    fire('pointerup', 2, 120, 50);
    expect(log).toEqual(['end']);
  });

  it('ignores a second finger where it does not yield, and is tapped when the first lifts', () => {
    const { log, fire } = mount((l) => grab(l));
    fire('pointerdown', 1, 50, 50);
    fire('pointerdown', 2, 120, 50);
    fire('pointerup', 2, 120, 50);
    expect(log).toEqual([]);
    fire('pointerup', 1, 50, 50);
    expect(log).toEqual(['end', 'tap']);
  });

  it('needs no tap: a grab without one just ends', () => {
    const { log, fire } = mount((l) => grab(l, { tap: undefined }));
    fire('pointerdown', 1, 50, 50);
    fire('pointerup', 1, 50, 50);
    expect(log).toEqual(['end']);
  });

  it('is not there where the host takes none: the finger is the view’s', () => {
    const { log, fire } = mount(() => null);
    fire('pointerdown', 1, 50, 50);
    fire('pointerup', 1, 50, 50);
    expect(log).toEqual([]);
  });
});
