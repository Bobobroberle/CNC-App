// @vitest-environment jsdom
import { cleanup, render, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { usePanZoom, type ViewGrab } from '../src/components/usePanZoom';

/** A view whose grabs are whatever the test hands out; what happens to them goes into `log`. */
function mount(make: (log: string[]) => ViewGrab | null) {
  const log: string[] = [];
  /** What the view was asked: the arguments of its `grab` and of its `tap` */
  const asked: unknown[][] = [];
  function Probe() {
    const [el, setEl] = useState<HTMLDivElement | null>(null);
    usePanZoom(el, {
      read: () => ({ scale: 1, x: 0, y: 0 }),
      write: () => undefined,
      limits: () => null,
      size: () => ({ width: 400, height: 300 }),
      grab: (...args: unknown[]) => {
        asked.push(['grab', ...args]);
        return make(log);
      },
      tap: (...args: unknown[]) => void asked.push(['tap', ...args]),
    });
    return <div ref={setEl} data-testid="view" />;
  }
  // (of this mount only: a test may mount several views)
  const view = within(render(<Probe />).container).getByTestId('view');
  const fire = (
    type: string,
    id: number,
    x: number,
    y: number,
    keys: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean } = {},
  ) => {
    const e = new MouseEvent(type, {
      clientX: x,
      clientY: y,
      bubbles: true,
      cancelable: true,
      ...keys,
    });
    Object.defineProperty(e, 'pointerId', { value: id });
    Object.defineProperty(e, 'pointerType', { value: 'touch' });
    view.dispatchEvent(e);
  };
  return { log, fire, asked };
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

describe('how a thing taken by a finger ends – and what keys were held', () => {
  afterEach(cleanup);

  /** A grab that says how it ended: `end` is given `true` only for a finger that was lifted */
  const noting = (log: string[]): ViewGrab => ({
    move: () => undefined,
    end: (...args) => log.push(`end ${JSON.stringify(args)}`),
    tap: () => log.push('tap'),
    yields: true,
  });

  it('is told that the finger was lifted – and only then', () => {
    const lifted = mount((l) => noting(l));
    lifted.fire('pointerdown', 1, 50, 50);
    lifted.fire('pointermove', 1, 90, 60);
    lifted.fire('pointerup', 1, 90, 60);
    expect(lifted.log).toEqual(['end [true]']);
    // a touch the system took away, a second finger, the app being left: no word of it
    const lost = mount((l) => noting(l));
    lost.fire('pointerdown', 1, 50, 50);
    lost.fire('pointermove', 1, 90, 60);
    lost.fire('pointercancel', 1, 90, 60);
    expect(lost.log).toEqual(['end []']);
    const second = mount((l) => noting(l));
    second.fire('pointerdown', 1, 50, 50);
    second.fire('pointermove', 1, 90, 60);
    second.fire('pointerdown', 2, 200, 100);
    expect(second.log).toEqual(['end []']);
  });

  it('says where the finger really is, beside where the thing it carries goes', () => {
    const moves: unknown[][] = [];
    const { fire } = mount(() => ({ move: (...args) => moves.push(args), end: () => undefined }));
    fire('pointerdown', 1, 50, 50);
    fire('pointermove', 1, 80, 50);
    fire('pointermove', 1, 90, 60);
    // the thing starts from where the finger left the slop (50,50) – the finger itself is further on
    expect(moves).toEqual([
      [
        { x: 50, y: 50 },
        { x: 80, y: 50 },
      ],
      [
        { x: 60, y: 60 },
        { x: 90, y: 60 },
      ],
    ]);
  });

  it('hands Shift and Ctrl to the grab and to the tap – and nothing where none is held', () => {
    const held = mount((l) => noting(l));
    held.fire('pointerdown', 1, 50, 50, { shiftKey: true });
    expect(held.asked).toEqual([['grab', { x: 50, y: 50 }, 'touch', { shift: true, ctrl: false }]]);
    const cmd = mount(() => null);
    cmd.fire('pointerdown', 1, 50, 50, { metaKey: true });
    cmd.fire('pointerup', 1, 50, 50, { metaKey: true });
    // Cmd is Ctrl; the tap of the view, where no grab took the finger, says so as well
    expect(cmd.asked).toEqual([
      ['grab', { x: 50, y: 50 }, 'touch', { shift: false, ctrl: true }],
      ['tap', { x: 50, y: 50 }, 'touch', { shift: false, ctrl: true }],
    ]);
    // no key: called as ever – two arguments for the grab, two for the tap
    const bare = mount(() => null);
    bare.fire('pointerdown', 1, 50, 50);
    bare.fire('pointerup', 1, 50, 50);
    expect(bare.asked).toEqual([
      ['grab', { x: 50, y: 50 }, 'touch'],
      ['tap', { x: 50, y: 50 }, 'touch'],
    ]);
  });
});
