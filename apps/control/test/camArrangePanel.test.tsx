// @vitest-environment jsdom
import { rectangle } from '@lowrider/cam';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CamCard } from '../src/components/CamCard';
import { describeItem } from '../src/components/camParts';
import { t } from '../src/i18n';
import { COMMANDS } from '../src/lib/commands';
import { itemsBounds, partsOf } from '../src/lib/camItems';
import { useCam } from '../src/store/cam';
import { openCam } from '../src/store/camPlace';
import { useFlip } from '../src/store/flip';
import { useJob } from '../src/store/job';
import { useUi } from '../src/store/ui';

// jsdom has no observers; the segmented controls want them
class Quiet {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', Quiet);

const cam = () => useCam.getState();
const items = () => cam().project!.items;
const picks = () => screen.getAllByRole('checkbox', { name: /zur Auswahl/ });
const button = (name: string) => screen.getByRole('button', { name });
const lefts = () => items().map((i) => itemsBounds([i])!.minX);

describe('the arranging tools of the drawing', () => {
  let a = 0;
  let b = 0;
  let c = 0;
  beforeEach(() => {
    cam().close();
    useJob.getState().unload();
    useFlip.getState().cancel();
    openCam();
    cam().add([rectangle(0, 0, 10, 10)]);
    cam().add([rectangle(30, 20, 20, 10)]);
    cam().add([rectangle(100, 5, 30, 40)]);
    [a, b, c] = items().map((i) => i.group) as [number, number, number];
    cam().select(null);
  });
  afterEach(cleanup);

  it('puts a box before every part of the list that takes it into the selection or out of it', () => {
    render(<CamCard />);
    expect(picks()).toHaveLength(3);
    expect(picks().map((p) => p.getAttribute('aria-checked'))).toEqual(['false', 'false', 'false']);
    fireEvent.click(picks()[1]!);
    expect(cam().selected).toBe(b);
    fireEvent.click(picks()[2]!);
    expect(cam().selected).toEqual([b, c]);
    expect(picks().map((p) => p.getAttribute('aria-checked'))).toEqual(['false', 'true', 'true']);
    // the name of the row still picks that part alone
    fireEvent.click(screen.getByRole('button', { name: /^1\. / }));
    expect(cam().selected).toBe(a);
    fireEvent.click(picks()[0]!);
    expect(cam().selected).toBeNull();
    // every box is a target of a finger: its label is the target
    expect(picks()[0]!.closest('label')).not.toBeNull();
  });

  it('switches "Mehrfachauswahl" on and off, in the empty state and with a selection', () => {
    render(<CamCard />);
    const multi = () => screen.getByRole('checkbox', { name: t('cam.arrange.multi') });
    expect(multi().getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByTestId('cam-multi-hint')).toBeNull();
    fireEvent.click(multi());
    expect(cam().multi).toBe(true);
    expect(screen.getByTestId('cam-multi-hint')).not.toBeNull();
    act(() => cam().select(a));
    // still there in the state with a selection
    expect(multi().getAttribute('aria-checked')).toBe('true');
    fireEvent.click(multi());
    expect(cam().multi).toBe(false);
  });

  it('selects everything and inverts, from the state with a selection', () => {
    render(<CamCard />);
    act(() => cam().select(b));
    fireEvent.click(button(t('cam.arrange.invert')));
    expect(cam().selected).toEqual([a, c]);
    fireEvent.click(button(t('cam.arrange.all')));
    expect(cam().selected).toBe('all');
    expect(screen.getByTestId('cam-selected').textContent).toContain(
      t('cam.arrange.parts', { n: 3 }),
    );
  });

  it('offers to align with two things selected, and to distribute with three', () => {
    render(<CamCard />);
    act(() => cam().select(a));
    expect(screen.queryByTestId('cam-align')).toBeNull();
    act(() => cam().select([a, c]));
    const panel = screen.getByTestId('cam-align');
    for (const edge of ['left', 'centre', 'right', 'top', 'middle', 'bottom']) {
      expect(
        within(panel).getByRole('button', { name: t(`cam.align.${edge}Label` as never) }),
      ).not.toBeNull();
    }
    // distributing needs three: shown, disabled, with the reason said
    const spread = within(panel).getByRole('button', {
      name: t('cam.align.spread.h.gapsLabel'),
    });
    expect(spread.hasAttribute('disabled')).toBe(true);
    expect(spread.getAttribute('aria-description')).toBe(t('cam.align.needThree'));
    expect(spread.getAttribute('data-reason')).toBe(t('cam.align.needThree'));
    act(() => cam().select([a, b, c]));
    expect(spread.hasAttribute('disabled')).toBe(false);
    expect(spread.getAttribute('data-reason')).toBeNull();
  });

  it('aligns and distributes with the buttons – each one step', () => {
    render(<CamCard />);
    act(() => cam().select([a, b, c]));
    const was = cam().past.length;
    fireEvent.click(button(t('cam.align.leftLabel')));
    expect(lefts()).toEqual([0, 0, 0]);
    fireEvent.click(button(t('cam.align.rightLabel')));
    // 0…30 (the big one) is the furthest right now
    expect(lefts()).toEqual([20, 10, 0]);
    expect(cam().past.length).toBe(was + 2);
    act(() => cam().undo());
    act(() => cam().undo());
    expect(lefts()).toEqual([0, 30, 100]);
    fireEvent.click(button(t('cam.align.spread.h.gapsLabel')));
    expect(lefts()).toEqual([0, 45, 100]);
    fireEvent.click(button(t('cam.align.spread.h.centresLabel')));
    expect(lefts()).toEqual([0, 50, 100]);
    // a vertical middle: all on 22.5
    fireEvent.click(button(t('cam.align.middleLabel')));
    expect(items().map((i) => itemsBounds([i])!.minY)).toEqual([17.5, 17.5, 2.5]);
    expect(cam().selected).toEqual([a, b, c]);
  });

  it('groups and ungroups with their buttons, each only where it can act', () => {
    render(<CamCard />);
    // one plain part has nothing to group with and nothing to take apart: no pair of buttons that cannot act
    act(() => cam().select(a));
    expect(screen.queryByRole('button', { name: t('cam.group.group') })).toBeNull();
    expect(screen.queryByRole('button', { name: t('cam.group.ungroup') })).toBeNull();
    act(() => cam().select([a, b]));
    expect(button(t('cam.group.group')).hasAttribute('disabled')).toBe(false);
    // two single things: nothing to take apart yet
    expect(button(t('cam.group.ungroup')).hasAttribute('disabled')).toBe(true);
    fireEvent.click(button(t('cam.group.group')));
    expect(
      new Set(
        items()
          .slice(0, 2)
          .map((i) => i.group),
      ).size,
    ).toBe(1);
    // one group now: one unit – no alignment, but it can be taken apart (and not grouped again: said why)
    expect(screen.queryByTestId('cam-align')).toBeNull();
    expect(button(t('cam.group.group')).hasAttribute('disabled')).toBe(true);
    expect(button(t('cam.group.group')).getAttribute('data-reason')).toBe(t('cam.group.needTwo'));
    expect(button(t('cam.group.ungroup')).hasAttribute('disabled')).toBe(false);
    fireEvent.click(button(t('cam.group.ungroup')));
    expect(
      new Set(
        items()
          .slice(0, 2)
          .map((i) => i.group),
      ).size,
    ).toBe(2);
    expect(Array.isArray(cam().selected)).toBe(true);
    // a registration hole is only moved: nothing of this for it
    expect(screen.getByTestId('cam-align')).not.toBeNull();
  });

  it('counts the same things in the header as the buttons do: the units, and the contours where a group has several', () => {
    render(<CamCard />);
    const header = () => screen.getByTestId('cam-selected').textContent ?? '';
    // three single parts: three units
    act(() => cam().select('all'));
    expect(header()).toContain(t('cam.arrange.parts', { n: 3 }));
    expect(header()).not.toContain(t('cam.arrange.partsOf', { n: 3, m: 3 }));
    // two of them as a group: two units of three contours – the align hint says two, so does the header
    act(() => cam().select([a, b]));
    fireEvent.click(button(t('cam.group.group')));
    act(() => cam().select('all'));
    expect(header()).toContain(t('cam.arrange.partsOf', { n: 2, m: 3 }));
    expect(screen.getByTestId('cam-align').textContent).toContain(t('cam.align.hint', { n: 2 }));
    // the group alone: one thing made of two contours – never "2 Teile" next to a Gruppieren that needs two
    act(() => cam().select(items()[0]!.group));
    expect(header()).toContain(t('cam.arrange.groupOf', { m: 2 }));
    expect(header()).not.toContain(t('cam.arrange.parts', { n: 2 }));
  });

  it('keeps the box that was ticked where it is on the screen while the cards above it grow', () => {
    // jsdom has no layout: the row's place on the screen is whatever the selection above it makes of it
    const rect = (top: number) =>
      ({
        top,
        bottom: top + 48,
        left: 0,
        right: 48,
        width: 48,
        height: 48,
        x: 0,
        y: top,
      }) as DOMRect;
    let shift = 0;
    const box = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        return this.classList.contains('cam-head') ? rect(300 + shift) : rect(0);
      });
    // the panel's scroll position: read and assigned, as the row asks to be held
    let scrollTop = 100;
    const body = document.createElement('div');
    body.className = 'panel-body';
    Object.defineProperty(body, 'scrollTop', {
      get: () => scrollTop,
      set: (v: number) => {
        scrollTop = v;
        moved.push(v);
      },
    });
    const moved: number[] = [];
    document.body.append(body);
    try {
      render(<CamCard />, { container: body.appendChild(document.createElement('div')) });
      // The finger is on the box where it is now; the selection changes the cards above it as it is handled
      const tap = (n: number, grows: number) => {
        shift = 0;
        const off = useCam.subscribe(() => {
          shift = grows;
        });
        fireEvent.click(picks()[n]!);
        off();
      };
      tap(0, 500);
      // the first tick swaps the small card for the whole one: the row is 500 px lower after it – the panel follows
      expect(moved).toEqual([600]);
      tap(1, -200);
      expect(moved).toEqual([600, 400]);
      // no change of place: nothing is scrolled
      tap(2, 0);
      expect(moved).toEqual([600, 400]);
    } finally {
      box.mockRestore();
      body.remove();
    }
  });

  it('holds the row for every tap of it that changes the selection – its name, "Stege einstellen", the tabs box', () => {
    // jsdom has no layout: the row's place on the screen is whatever the selection above it makes of it
    const rect = (top: number) =>
      ({
        top,
        bottom: top + 48,
        left: 0,
        right: 48,
        width: 48,
        height: 48,
        x: 0,
        y: top,
      }) as DOMRect;
    let shift = 0;
    const box = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        return this.classList.contains('cam-head') ? rect(300 + shift) : rect(0);
      });
    let scrollTop = 1000;
    const moved: number[] = [];
    const body = document.createElement('div');
    body.className = 'panel-body';
    Object.defineProperty(body, 'scrollTop', {
      get: () => scrollTop,
      set: (v: number) => {
        scrollTop = v;
        moved.push(v);
      },
    });
    document.body.append(body);
    try {
      render(<CamCard />, { container: body.appendChild(document.createElement('div')) });
      // the cards above grow by `grows` as the selection changes: the row must be taken back by as much
      const tap = (click: () => void, grows: number) => {
        shift = 0;
        const off = useCam.subscribe(() => {
          shift = grows;
        });
        click();
        off();
      };
      // its name from nothing selected: the card of the selection appears
      tap(() => fireEvent.click(screen.getByRole('button', { name: /^2\. / })), 400);
      expect(moved).toEqual([1400]);
      // "Stege einstellen" of the row of a part that is one of a set: the set becomes this part alone, the align panel goes
      act(() => cam().select([a, b]));
      moved.length = 0;
      tap(() => fireEvent.click(screen.getAllByTestId('cam-tabs-open')[0]!), -150);
      expect(cam().selected).toBe(a);
      expect(cam().tabsOpen).toBe(items()[0]!.id);
      expect(moved).toEqual([1250]);
      // the tabs box of a row that is not selected: ticked off and on, it selects the part and opens its panel
      act(() => cam().select(null));
      moved.length = 0;
      const tabsBox = within(
        screen.getAllByRole('listitem').filter((li) => li.classList.contains('cam-row'))[2]!,
      ).getByRole('checkbox', { name: t('cam.tabs') });
      tap(() => fireEvent.click(tabsBox), 0);
      tap(() => fireEvent.click(tabsBox), 300);
      expect(cam().selected).toBe(c);
      expect(moved).toEqual([1550]);
    } finally {
      box.mockRestore();
      body.remove();
    }
  });

  it('remembers whether the align panel was folded: it does not open again with every new selection', () => {
    useUi.getState().setDepth('camAlign', 'more');
    render(<CamCard />);
    act(() => cam().select([a, b]));
    const panel = () => screen.getByTestId('cam-align');
    const open = () => within(panel()).getByRole('button', { name: t('cam.align.leftLabel') });
    expect(open()).not.toBeNull();
    // fold it with its heading
    fireEvent.click(within(panel()).getByText(t('cam.align.title')));
    expect(useUi.getState().depth.camAlign).toBe('simple');
    // the selection goes down to one part and comes back with two others: still folded
    act(() => cam().select(c));
    expect(screen.queryByTestId('cam-align')).toBeNull();
    act(() => cam().select([a, c]));
    expect(within(panel()).queryByRole('button', { name: t('cam.align.leftLabel') })).toBeNull();
    // and open again when it is asked for
    fireEvent.click(within(panel()).getByText(t('cam.align.title')));
    expect(useUi.getState().depth.camAlign).toBe('more');
    expect(open()).not.toBeNull();
  });

  it('leads the quick search to something that is there – with nothing drawn, with one part, with several', () => {
    const chains = (ids: string[]) =>
      ids.map((id) => [id, COMMANDS.find((c) => c.id === id)!.anchor] as const);
    const ids = [
      'camMulti',
      'camSelectAll',
      'camInvert',
      'camAlign',
      'camDistribute',
      'camGroup',
      'camUngroup',
    ];
    const first = (id: string, anchors: readonly string[]) =>
      anchors.find((anchor) => document.querySelector(`[data-find~="${anchor}"]`) !== null) ??
      `${id}: nothing`;
    // an empty drawing: the arranging card is not there at all, the card of the drawing is
    cam().close();
    openCam();
    const view = render(<CamCard />);
    for (const [id, anchors] of chains(ids)) expect(first(id, anchors), id).toBe('cam-draw');
    view.unmount();
    cleanup();
    // parts, nothing picked: select all is its own button, the rest is at the switch
    cam().add([rectangle(0, 0, 10, 10)]);
    cam().add([rectangle(30, 20, 20, 10)]);
    cam().select(null);
    render(<CamCard />);
    expect(first('camSelectAll', COMMANDS.find((c) => c.id === 'camSelectAll')!.anchor)).toBe(
      'cam-select-all',
    );
    expect(first('camInvert', COMMANDS.find((c) => c.id === 'camInvert')!.anchor)).toBe(
      'cam-multi',
    );
    expect(first('camAlign', COMMANDS.find((c) => c.id === 'camAlign')!.anchor)).toBe('cam-multi');
    // one part: invert has its button, grouping and aligning still lead to the switch (their rows are not there)
    act(() => cam().select(cam().project!.items[0]!.group));
    expect(first('camInvert', COMMANDS.find((c) => c.id === 'camInvert')!.anchor)).toBe(
      'cam-invert',
    );
    expect(first('camGroup', COMMANDS.find((c) => c.id === 'camGroup')!.anchor)).toBe('cam-multi');
    // two: each has its own place
    act(() => cam().select('all'));
    expect(first('camAlign', COMMANDS.find((c) => c.id === 'camAlign')!.anchor)).toBe('cam-align');
    expect(first('camDistribute', COMMANDS.find((c) => c.id === 'camDistribute')!.anchor)).toBe(
      'cam-align',
    );
    expect(first('camGroup', COMMANDS.find((c) => c.id === 'camGroup')!.anchor)).toBe('cam-group');
    expect(first('camUngroup', COMMANDS.find((c) => c.id === 'camUngroup')!.anchor)).toBe(
      'cam-group',
    );
  });

  it('names a selection with registration holes by its parts, and says nothing of the holes as parts', () => {
    cam().setTwoSided({});
    render(<CamCard />);
    const header = () => screen.getByTestId('cam-selected').textContent ?? '';
    // everything of a two-sided drawing: three parts and two holes – three, as the buttons count them
    act(() => cam().select('all'));
    expect(header()).toContain(t('cam.arrange.parts', { n: 3 }));
    expect(header()).not.toContain(t('cam.arrange.parts', { n: 5 }));
    expect(screen.getByTestId('cam-align').textContent).toContain(t('cam.align.hint', { n: 3 }));
    // one part with its holes ("everything" of a two-sided plate): the part, not "1 Teile"
    const [b1, c1] = [b, c];
    act(() => cam().select([b1, c1]));
    act(() => cam().removeSelection());
    act(() => cam().select('all'));
    expect(partsOf(items())).toHaveLength(1);
    expect(header()).toContain(describeItem(partsOf(items())[0]!));
    expect(header()).not.toContain(t('cam.arrange.parts', { n: 1 }));
    // nothing but the holes (the part is gone, they stay where they are): counted as they are, never "0 Teile"
    act(() =>
      useCam.setState((s) => ({
        project: {
          ...s.project!,
          items: s.project!.items.filter((i) => i.registration !== undefined),
        },
        selected: 'all',
      })),
    );
    expect(header()).toContain(t('cam.arrange.parts', { n: 2 }));
  });
});
