// @vitest-environment jsdom
import { circle, rectangle } from '@lowrider/cam';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CamCard } from '../src/components/CamCard';
import { t } from '../src/i18n';
import { COMMANDS } from '../src/lib/commands';
import { useCam } from '../src/store/cam';
import { openCam } from '../src/store/camPlace';
import { useFlip } from '../src/store/flip';
import { useJob } from '../src/store/job';
import { useUi } from '../src/store/ui';

class Quiet {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', Quiet);

const cam = () => useCam.getState();
const items = () => cam().project!.items;
const rows = () => screen.getAllByRole('listitem').filter((li) => li.classList.contains('cam-row'));
const field = (name: string) => screen.getByRole('textbox', { name }) as HTMLInputElement;
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });

describe('the panels of the toolpath options', () => {
  beforeEach(() => {
    cam().close();
    cam().setPlacing(null);
    cam().closeTabs();
    useJob.getState().unload();
    useFlip.getState().cancel();
    cam().setSettings({
      toolId: 't2',
      depth: 6,
      stepdown: 3,
      rampAngle: 5,
      routeShort: true,
      tabs: { count: 4, width: 6, height: 2, avoidCorners: true },
    });
    useUi.getState().setDepth('camPath', 'simple');
    useUi.getState().setDepth('camOrder', 'simple');
    openCam();
  });
  afterEach(cleanup);

  it('"Eintauchen" is there for the one pocket that is selected: three ways, a hint for each, the hole of the helix', () => {
    cam().add([rectangle(0, 0, 60, 40)]);
    act(() => cam().setItem(items()[0]!.id, { kind: 'pocket', tabs: false }));
    render(<CamCard />);
    const fold = screen.getByTestId('cam-path');
    expect(fold.getAttribute('data-find')).toBe('cam-path-entry');
    // folded away until it is wanted – and open again as it was left
    expect(useUi.getState().depth.camPath).toBe('simple');
    fireEvent.click(within(fold).getByRole('button', { name: t('cam.path.entryTitle') }));
    expect(useUi.getState().depth.camPath).toBe('more');
    const ramp = screen.getByTestId('cam-entry-ramp');
    expect(ramp.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('cam-entry-note').textContent).toBe(t('cam.path.rampNote'));
    expect(screen.queryByTestId('cam-helix-note')).toBeNull();
    // the choice is the drawing's: one step, and the hint follows it
    fireEvent.click(screen.getByTestId('cam-entry-helix'));
    expect(items()[0]!.entry).toBe('helix');
    expect(screen.getByTestId('cam-entry-helix').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('cam-entry-note').textContent).toBe(t('cam.path.helixNote'));
    // the field shows what an empty one takes, and the range with the cutter's numbers (6 mm: 9, 6.5 … 12)
    const hole = field(t('cam.path.helixDiameter'));
    expect(hole.placeholder).toBe('9');
    expect(screen.getByTestId('cam-helix-note').textContent).toBe(
      t('cam.path.helixDiameterNote', { usual: '9', least: '6,5', most: '12' }),
    );
    type(hole, '8');
    expect(items()[0]!.helixDiameter).toBe(8);
    type(hole, '');
    expect(items()[0]!.helixDiameter).toBeUndefined();
    // straight down says what it risks
    fireEvent.click(screen.getByTestId('cam-entry-plunge'));
    expect(items()[0]!.entry).toBe('plunge');
    expect(screen.getByTestId('cam-entry-note').textContent).toBe(t('cam.path.plungeNote'));
    expect(screen.queryByTestId('cam-helix-note')).toBeNull();
    // back to the ramp: no key
    fireEvent.click(screen.getByTestId('cam-entry-ramp'));
    expect('entry' in items()[0]!).toBe(false);
  });

  it('"Bohren in Stufen" is there for a hole: the step, and the retract only with a step', () => {
    cam().add([circle(30, 20, 6)]);
    act(() => cam().setItem(items()[0]!.id, { kind: 'drill', tabs: false }));
    render(<CamCard />);
    const fold = screen.getByTestId('cam-path');
    expect(fold.getAttribute('data-find')).toBe('cam-path-peck');
    fireEvent.click(within(fold).getByRole('button', { name: t('cam.path.peckTitle') }));
    const peck = field(t('cam.path.peck'));
    const retract = field(t('cam.path.peckRetract'));
    expect(peck.placeholder).toBe(t('cam.path.off'));
    expect(retract.placeholder).toBe(t('cam.path.fullRetract'));
    // no step: the retract cannot be typed, and says why on a tap
    expect(retract.disabled).toBe(true);
    expect(screen.getByRole('tooltip').textContent).toBe(t('cam.path.peckRetractNeedsPeck'));
    expect(screen.getByTestId('cam-peck-note').textContent).toBe(
      t('cam.path.peckNote', { min: '0,05' }),
    );
    type(peck, '2');
    expect(items()[0]!.peck).toBe(2);
    expect(field(t('cam.path.peckRetract')).disabled).toBe(false);
    type(field(t('cam.path.peckRetract')), '1,5');
    expect(items()[0]!.peckRetract).toBe(1.5);
    // emptied: straight through again, and the retract goes with it
    type(field(t('cam.path.peck')), '');
    expect(items()[0]!.peck).toBeUndefined();
    expect(items()[0]!.peckRetract).toBeUndefined();
  });

  it('is not there for what has no choice, for several parts, or for a hole of the registration', () => {
    cam().add([rectangle(0, 0, 60, 40), rectangle(80, 0, 60, 40)]);
    act(() => cam().ungroup());
    render(<CamCard />);
    // outlines: nothing to choose
    act(() => cam().select(items()[0]!.group));
    expect(screen.queryByTestId('cam-path')).toBeNull();
    // two pockets selected: no panel (it is for the one part)
    act(() => {
      for (const i of items()) cam().setItem(i.id, { kind: 'pocket', tabs: false });
      cam().select([items()[0]!.group, items()[1]!.group]);
    });
    expect(screen.queryByTestId('cam-path')).toBeNull();
    act(() => cam().select(items()[1]!.group));
    expect(screen.queryByTestId('cam-path')).not.toBeNull();
  });

  it('"Ecken meiden" is in the panel of the tabs – automatic only – with the hint, and a part\'s own choice is marked', () => {
    cam().addSketch({ type: 'rect', w: 100, h: 60, r: 0 });
    render(<CamCard />);
    fireEvent.click(screen.getByTestId('cam-tabs-open'));
    const box = () =>
      within(screen.getByTestId('cam-tabs')).getByRole('checkbox', {
        name: t('cam.tabAvoidOf', { n: 1 }),
      });
    expect(box().getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('cam-tabs-avoid').textContent).toContain(t('cam.tabAvoidNote'));
    // off for this part: its own choice, said by the mark
    fireEvent.click(box());
    expect(items()[0]!.tabSpec).toEqual({ mode: 'auto', avoidCorners: false });
    expect(box().getAttribute('aria-checked')).toBe('false');
    expect(screen.getByTestId('cam-tabs-avoid').textContent).toContain(
      t('depth.deviates', { value: t('cam.tabAvoidOn') }),
    );
    // on again: it is what the drawing says, no choice of its own
    fireEvent.click(box());
    expect(items()[0]!.tabSpec).toBeUndefined();
    // an explicit choice that says what the drawing's default says is no deviation (the default may have moved since)
    act(() => cam().setSettings({ tabs: { ...cam().settings.tabs, avoidCorners: false } }));
    fireEvent.click(box());
    expect(items()[0]!.tabSpec).toEqual({ mode: 'auto', avoidCorners: true });
    expect(screen.getByTestId('cam-tabs-avoid').textContent).toContain(
      t('depth.deviates', { value: t('cam.tabAvoidOff') }),
    );
    act(() => cam().setSettings({ tabs: { ...cam().settings.tabs, avoidCorners: true } }));
    expect(box().getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('cam-tabs-avoid').textContent).not.toContain(
      t('depth.deviates', { value: t('cam.tabAvoidOn') }),
    );
    act(() => cam().setTabs(items()[0]!.id, { avoidCorners: undefined }));
    // by hand there is nothing to move – the box stays (the buttons below it must not move between the two modes),
    // closed, with its reason, and the part keeps its value
    fireEvent.click(screen.getByTestId('cam-tabs-manual'));
    expect(screen.queryByTestId('cam-tabs-avoid')).not.toBeNull();
    expect(box().hasAttribute('data-disabled')).toBe(true);
    expect(screen.getByTestId('cam-tabs-avoid').textContent).toContain(t('cam.tabAvoidByHand'));
    fireEvent.click(box());
    expect(items()[0]!.tabSpec!.avoidCorners).toBeUndefined();
    fireEvent.click(screen.getByTestId('cam-tabs-auto'));
    expect(box().hasAttribute('data-disabled')).toBe(false);
  });

  it('leads the quick search to something that is there – with nothing drawn, with a pocket, with a hole', () => {
    const ids = [
      'tabsAvoid',
      'camRoute',
      'camEntry',
      'camHelix',
      'camPeck',
      'camOrder',
      'camOrderReset',
    ];
    const first = (id: string) =>
      COMMANDS.find((c) => c.id === id)!.anchor.find(
        (anchor) => document.querySelector(`[data-find~="${anchor}"]`) !== null,
      ) ?? `${id}: nothing`;
    // an empty drawing: the panels of a part are not there, the cards that always are are – every chain ends in one
    cam().close();
    openCam();
    const view = render(<CamCard />);
    const there = (id: string) => first(id);
    expect(there('tabsAvoid')).toBe('cam-avoid-default');
    expect(there('camRoute')).toBe('cam-route');
    for (const id of ['camEntry', 'camHelix', 'camPeck', 'camOrder', 'camOrderReset']) {
      expect(there(id), id).toBe('cam-draw');
    }
    view.unmount();
    cleanup();
    // a pocket selected alone: its way in is there, the hole's is not (the chain ends at the switch beside it), the order is
    cam().add([rectangle(0, 0, 60, 40)]);
    act(() => cam().setItem(items()[0]!.id, { kind: 'pocket', tabs: false }));
    render(<CamCard />);
    expect(first('camEntry')).toBe('cam-path-entry');
    expect(first('camHelix')).toBe('cam-path-entry');
    expect(first('camPeck')).toBe('cam-multi');
    expect(first('camOrder')).toBe('cam-order');
    // (nothing is numbered: the number that takes every number away is the same card, which the chain leads to)
    expect(first('camOrderReset')).toBe('cam-order');
    // a hole: the other way round
    act(() => cam().setItem(items()[0]!.id, { kind: 'drill' }));
    expect(first('camPeck')).toBe('cam-path-peck');
    expect(first('camEntry')).toBe('cam-multi');
    // every entry of the table has the words it is found by, in both languages
    for (const id of ids) {
      expect(
        COMMANDS.find((c) => c.id === id),
        id,
      ).toBeDefined();
    }
  });

  it('has the drawing\'s defaults under "Erweitert": tabs off the corners, shorter travel', () => {
    cam().addSketch({ type: 'rect', w: 100, h: 60, r: 0 });
    render(<CamCard />);
    const avoid = screen.getByTestId('cam-avoid-default');
    const route = screen.getByTestId('cam-route');
    expect(avoid.getAttribute('aria-checked')).toBe('true');
    expect(route.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(avoid);
    expect(cam().settings.tabs.avoidCorners).toBe(false);
    fireEvent.click(route);
    expect(cam().settings.routeShort).toBe(false);
    expect(screen.getByText(t('cam.routeShortNote'))).not.toBeNull();
    fireEvent.click(route);
    expect(cam().settings.routeShort).toBe(true);
  });

  it('"Reihenfolge": where the part comes, earlier and later, automatic, and every number gone', () => {
    cam().add([circle(20, 20, 6), circle(80, 20, 6), circle(140, 20, 6)]);
    act(() => {
      cam().ungroup();
      for (const i of items()) cam().setItem(i.id, { kind: 'drill', tabs: false });
      cam().select(items()[1]!.group);
    });
    render(<CamCard />);
    const fold = screen.getByTestId('cam-order');
    expect(fold.getAttribute('data-find')).toBe('cam-order');
    fireEvent.click(within(fold).getByRole('button', { name: t('cam.order.title') }));
    expect(screen.getByTestId('cam-order-place').textContent).toBe(
      t('cam.order.place', { n: 2, m: 3, kind: t('cam.order.kinds.drill') }),
    );
    // no number yet: nothing to give back, and no badge in any row
    expect((screen.getByTestId('cam-order-auto') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryAllByTestId('cam-order-badge')).toHaveLength(0);
    // (the card is as tall with the first number as without: the count and the way back are there, closed, with no number)
    expect(screen.getByTestId('cam-order-counted').textContent).toBe(t('cam.order.countedNone'));
    expect((screen.getByTestId('cam-order-reset') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('cam-order-earlier'));
    expect(screen.getByTestId('cam-order-place').textContent).toBe(
      t('cam.order.place', { n: 1, m: 3, kind: t('cam.order.kinds.drill') }),
    );
    // the first cannot go earlier – and says why on a tap
    expect((screen.getByTestId('cam-order-earlier') as HTMLButtonElement).disabled).toBe(true);
    // every part of the kind has its place now: a small number in its row, in the head of the row (no row grows)
    const badges = screen.getAllByTestId('cam-order-badge');
    expect(badges.map((b) => b.textContent)).toEqual([
      `${t('cam.order.badge', { n: 2 })}${t('cam.order.badgeLabel', { n: 2 })}`,
      `${t('cam.order.badge', { n: 1 })}${t('cam.order.badgeLabel', { n: 1 })}`,
      `${t('cam.order.badge', { n: 3 })}${t('cam.order.badgeLabel', { n: 3 })}`,
    ]);
    for (const b of badges) expect(b.closest('.cam-head')).not.toBeNull();
    expect(screen.getByTestId('cam-order-counted').textContent).toBe(
      t('cam.order.counted', { n: 3 }),
    );
    // later; then the part back to the route
    fireEvent.click(screen.getByTestId('cam-order-later'));
    expect(items()[1]!.seq).toBe(1);
    fireEvent.click(screen.getByTestId('cam-order-auto'));
    expect(items()[1]!.seq).toBeUndefined();
    expect(screen.getAllByTestId('cam-order-badge')).toHaveLength(2);
    // every number gone, in one tap
    fireEvent.click(screen.getByTestId('cam-order-reset'));
    expect(items().every((i) => i.seq === undefined)).toBe(true);
    expect(screen.queryAllByTestId('cam-order-badge')).toHaveLength(0);
    expect((screen.getByTestId('cam-order-reset') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('cam-order-counted').textContent).toBe(t('cam.order.countedNone'));
  });

  it('says in a row the place the program really cuts a part at – and the wish beside it where that is not met', () => {
    // an outer plate and one inside it: whatever is wished, the inner one is cut first
    cam().add([rectangle(0, 0, 100, 100), rectangle(30, 30, 20, 20)]);
    act(() => {
      cam().ungroup();
      for (const i of items()) cam().setItem(i.id, { kind: 'outside', tabs: false });
      expect(cam().moveInOrder(items()[0]!.id, -1)).toBe(true);
    });
    // the numbers written are the wishes: the outer plate 1, the inner one 2 – the program cuts them the other way round
    expect(items().map((i) => i.seq)).toEqual([0, 1]);
    expect(cam().cutOrder[items()[0]!.id]!.n).toBe(2);
    render(<CamCard />);
    const text = (b: HTMLElement) => b.textContent;
    const badges = screen.getAllByTestId('cam-order-badge');
    // "Nr. 2 (Wunsch 1)" for the outer plate: where it is cut, and what was asked for – never the wish as its place
    expect(badges.map(text)).toEqual([
      `${t('cam.order.badgeWish', { n: 2, w: 1 })}${t('cam.order.badgeWishLabel', { n: 2, w: 1 })}`,
      `${t('cam.order.badgeWish', { n: 1, w: 2 })}${t('cam.order.badgeWishLabel', { n: 1, w: 2 })}`,
    ]);
    expect(badges[0]!.textContent).not.toContain(t('cam.order.badgeLabel', { n: 1 }));
    // a part that is not cut (hidden) has no place at all: the wish alone, and the words say it is not cut
    act(() => cam().setHidden(items()[0]!.id, true));
    const hidden = screen.getAllByTestId('cam-order-badge')[0]!;
    expect(hidden.textContent).toBe(
      `${t('cam.order.badgeIdle', { w: 1 })}${t('cam.order.badgeIdleLabel', { w: 1 })}`,
    );
    expect(hidden.getAttribute('title')).toBe(t('cam.order.badgeIdleLabel', { w: 1 }));
  });

  it('a gap in the numbers is no wish for a later place: the others read as they are cut, with no "Wunsch"', () => {
    cam().add([20, 60, 100, 140, 180, 220].map((x) => circle(x, 20, 6)));
    act(() => {
      cam().ungroup();
      for (const i of items()) cam().setItem(i.id, { kind: 'drill', tabs: false });
      // the whole rank numbered 0…5, one move; then the part with the number 2 given back to the route
      cam().moveInOrder(items()[2]!.id, -1);
      expect(items().map((i) => i.seq)).toEqual([0, 2, 1, 3, 4, 5]);
      cam().clearOrder(items()[1]!.id);
    });
    expect(items().map((i) => i.seq)).toEqual([0, undefined, 1, 3, 4, 5]);
    render(<CamCard />);
    const badges = screen.getAllByTestId('cam-order-badge');
    // the numbers 3, 4, 5 are cut at the places 3, 4, 5 (the part without a number comes last): all as asked
    const cut = [1, 2, 3, 4, 5];
    expect(badges.map((b) => b.textContent)).toEqual(
      cut.map((n) => `${t('cam.order.badge', { n })}${t('cam.order.badgeLabel', { n })}`),
    );
    expect(cam().cutOrder[items()[1]!.id]!.n).toBe(6);
    // the same after the kind of a numbered part changed (its number is dropped): the rest still read as cut
    act(() => cam().setItem(items()[0]!.id, { kind: 'on' }));
    const after = screen.getAllByTestId('cam-order-badge').map((b) => b.textContent);
    expect(after).toEqual(
      [1, 2, 3, 4].map((n) => `${t('cam.order.badge', { n })}${t('cam.order.badgeLabel', { n })}`),
    );
    // and after a numbered part is hidden: not cut, so the wish alone – the others close up
    act(() => cam().setHidden(items()[2]!.id, true));
    const texts = screen.getAllByTestId('cam-order-badge').map((b) => b.textContent);
    expect(texts.filter((x) => x!.includes(t('cam.order.badgeIdleLabel', { w: 1 })))).toHaveLength(
      1,
    );
    expect(texts.filter((x) => x!.includes('Wunsch ') && !x!.startsWith('Wunsch'))).toEqual([]);
  });

  it('says what a group is: no place for it, and the way out', () => {
    cam().add([rectangle(0, 0, 40, 30), rectangle(60, 0, 40, 30)]);
    act(() => cam().select(items()[0]!.group));
    render(<CamCard />);
    // (the contours of one file are one group)
    const fold = screen.getByTestId('cam-order');
    fireEvent.click(within(fold).getByRole('button', { name: t('cam.order.title') }));
    expect(within(fold).getByText(t('cam.order.group'))).not.toBeNull();
    expect(screen.queryByTestId('cam-order-earlier')).toBeNull();
  });

  it('is not there with nothing selected and no number in the drawing', () => {
    cam().add([circle(20, 20, 6), circle(80, 20, 6)]);
    act(() => cam().select(null));
    render(<CamCard />);
    expect(screen.queryByTestId('cam-order')).toBeNull();
    // with a number somewhere the way to take all of them away is there with any selection
    act(() => {
      cam().ungroup();
      for (const i of items()) cam().setItem(i.id, { kind: 'drill', tabs: false });
      cam().moveInOrder(items()[0]!.id, 1);
      cam().select(null);
    });
    expect(screen.queryByTestId('cam-order')).not.toBeNull();
    expect(screen.queryByTestId('cam-order-earlier')).toBeNull();
  });

  it('shows what is cut but not as asked apart from what is not cut at all – a note, not a fault', () => {
    cam().add([rectangle(0, 0, 10, 10), circle(60, 20, 12), rectangle(80, 0, 2, 2)]);
    act(() => {
      cam().ungroup();
      cam().setItem(items()[0]!.id, { kind: 'pocket', tabs: false });
      cam().setItem(items()[1]!.id, { kind: 'drill', tabs: false });
      cam().setItem(items()[2]!.id, { kind: 'inside', tabs: false });
      cam().setPath(items()[0]!.id, { entry: 'helix' });
      cam().setPath(items()[1]!.id, { peck: 2 });
    });
    render(<CamCard />);
    // not cut at all: the contour 3, a cutter too large for it – in the list of faults, as ever
    const faults = screen.getByTestId('cam-problems');
    expect(
      within(faults)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([t('cam.problems.tool-too-large', { n: 3 })]);
    expect(within(faults).getAllByRole('listitem')[0]!.classList.contains('error')).toBe(true);
    // cut, but differently: the helix of 1, the peck of 2 – under a word of their own, without the fault's edge
    const notes = screen.getByTestId('cam-differences');
    expect(within(notes).getByText(t('cam.differs'))).not.toBeNull();
    const list = within(notes).getAllByTestId('cam-difference');
    expect(list.map((li) => li.textContent).sort()).toEqual(
      [
        t('cam.problems.helix-too-big', { n: 1, min: '0,05' }),
        t('cam.problems.peck-not-possible', { n: 2, min: '0,05' }),
      ].sort(),
    );
    expect(list.map((li) => li.getAttribute('data-code')).sort()).toEqual([
      'helix-too-big',
      'peck-not-possible',
    ]);
    for (const li of list) expect(li.classList.contains('error')).toBe(false);
    // the text of the peck says what it takes – and the number it names is the library's
    expect(list.find((li) => li.dataset.code === 'peck-not-possible')!.textContent).toContain(
      '0,05',
    );
  });
});
