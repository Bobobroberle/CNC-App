// @vitest-environment jsdom
import { rectangle } from '@lowrider/cam';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CamCard } from '../src/components/CamCard';
import { t } from '../src/i18n';
import { useCam } from '../src/store/cam';
import { openCam } from '../src/store/camPlace';
import { useFlip } from '../src/store/flip';
import { useJob } from '../src/store/job';

// jsdom has no observers; the segmented controls want them
class Quiet {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', Quiet);

const cam = () => useCam.getState();
const items = () => cam().project!.items;
const rows = () => screen.getAllByRole('listitem').filter((li) => li.classList.contains('cam-row'));
const panels = () => screen.queryAllByTestId('cam-tabs');

describe('the tab panel in the list of a drawing', () => {
  beforeEach(() => {
    cam().close();
    cam().setPlacing(null);
    cam().closeTabs();
    useJob.getState().unload();
    useFlip.getState().cancel();
    openCam();
  });
  afterEach(cleanup);

  it('opens only on demand: the button of the row opens it for that part, its own button closes it', () => {
    cam().addSketch({ type: 'rect', w: 60, h: 40, r: 0 });
    render(<CamCard />);
    expect(rows()).toHaveLength(1);
    // the part is selected and has tabs – and still there is no panel: nothing opens by itself
    expect(cam().selected).toBe(items()[0]!.group);
    expect(panels()).toHaveLength(0);
    const open = within(rows()[0]!).getByTestId('cam-tabs-open');
    expect(open.getAttribute('aria-label')).toBe(t('cam.tabsOpenOf', { n: 1 }));
    fireEvent.click(open);
    expect(panels()).toHaveLength(1);
    expect(within(rows()[0]!).queryByTestId('cam-tabs')).not.toBeNull();
    // the panel has the part's name and closes with its own button; the button to open it is back then
    expect(within(panels()[0]!).getByText(t('cam.tabPanel', { n: 1 }))).not.toBeNull();
    expect(screen.queryByTestId('cam-tabs-open')).toBeNull();
    fireEvent.click(within(panels()[0]!).getByTestId('cam-tabs-close'));
    expect(panels()).toHaveLength(0);
    expect(cam().tabsOpen).toBeNull();
    expect(screen.queryByTestId('cam-tabs-open')).not.toBeNull();
  });

  it('has the button in every row that has tabs, selected or not – so that selecting changes no row', () => {
    cam().add([rectangle(0, 0, 40, 30), rectangle(60, 0, 40, 30), rectangle(120, 0, 40, 30)]);
    expect(new Set(items().map((i) => i.group)).size).toBe(1);
    expect(items().every((i) => i.tabs)).toBe(true);
    render(<CamCard />);
    expect(rows()).toHaveLength(3);
    const buttons = () => screen.queryAllByTestId('cam-tabs-open');
    // the group of the file is selected: three buttons, no panel
    expect(buttons()).toHaveLength(3);
    expect(panels()).toHaveLength(0);
    // nothing selected, everything selected, a part picked with its box: the same three rows, the same buttons
    for (const select of [null, 'all', items()[0]!.group] as const) {
      act(() => cam().select(select));
      expect(buttons()).toHaveLength(3);
      expect(panels()).toHaveLength(0);
    }
    // one row asks for its panel: there it is, in that row only
    fireEvent.click(within(rows()[2]!).getByTestId('cam-tabs-open'));
    expect(panels()).toHaveLength(1);
    expect(within(rows()[2]!).queryByTestId('cam-tabs')).not.toBeNull();
    expect(within(rows()[2]!).queryByTestId('cam-tabs-open')).toBeNull();
    expect(buttons()).toHaveLength(2);
    // the panel belongs to part 3: its fields are named by its number
    expect(within(panels()[0]!).getByLabelText(t('cam.tabCountOf', { n: 3 }))).not.toBeNull();
    // and it moves on demand to the first row
    fireEvent.click(within(rows()[0]!).getByTestId('cam-tabs-open'));
    expect(panels()).toHaveLength(1);
    expect(within(rows()[0]!).queryByTestId('cam-tabs')).not.toBeNull();
    expect(within(rows()[2]!).queryByTestId('cam-tabs-open')).not.toBeNull();
  });

  it('opens the panel with the button – selecting the thing alone with it – and for the box of the tabs ticked on', () => {
    cam().add([rectangle(0, 0, 40, 30), rectangle(60, 0, 40, 30)]);
    cam().ungroup();
    const [one, two] = items();
    act(() => cam().select('all'));
    render(<CamCard />);
    expect(panels()).toHaveLength(0);
    fireEvent.click(within(rows()[1]!).getByTestId('cam-tabs-open'));
    expect(cam().selected).toBe(two!.group);
    expect(cam().tabsOpen).toBe(two!.id);
    expect(within(rows()[1]!).queryByTestId('cam-tabs')).not.toBeNull();
    // the tabs off: the panel goes with them, and so does the button
    fireEvent.click(within(rows()[1]!).getByRole('checkbox', { name: t('cam.tabs') }));
    expect(items().find((i) => i.id === two!.id)!.tabs).toBe(false);
    expect(panels()).toHaveLength(0);
    expect(cam().tabsOpen).toBeNull();
    expect(within(rows()[1]!).queryByTestId('cam-tabs-open')).toBeNull();
    // ticked on again: that part is selected alone and its panel opens
    fireEvent.click(within(rows()[1]!).getByRole('checkbox', { name: t('cam.tabs') }));
    expect(items().find((i) => i.id === two!.id)!.tabs).toBe(true);
    expect(cam().selected).toBe(two!.group);
    expect(within(rows()[1]!).queryByTestId('cam-tabs')).not.toBeNull();
    expect(one).toBeDefined();
  });

  it('ends the panel by itself when the part is no longer the selected one, is gone, or an undo takes it away', () => {
    cam().add([rectangle(0, 0, 40, 30), rectangle(60, 0, 40, 30)]);
    cam().ungroup();
    const [one, two] = items();
    render(<CamCard />);
    fireEvent.click(within(rows()[0]!).getByTestId('cam-tabs-open'));
    expect(panels()).toHaveLength(1);
    // another part picked, several, everything, nothing: no panel in any of them
    for (const select of [two!.group, [one!.group, two!.group], 'all', null] as const) {
      act(() => cam().openTabs(one!.id));
      expect(panels()).toHaveLength(1);
      act(() => cam().select(select));
      expect(panels()).toHaveLength(0);
      expect(cam().tabsOpen).toBeNull();
    }
    // the part removed
    act(() => cam().openTabs(two!.id));
    expect(panels()).toHaveLength(1);
    act(() => cam().removeItem(two!.id));
    expect(panels()).toHaveLength(0);
    expect(cam().tabsOpen).toBeNull();
    // an undo that brings the part back does not bring the panel back
    act(() => cam().undo());
    expect(panels()).toHaveLength(0);
    // a project that is closed
    act(() => cam().openTabs(one!.id));
    act(() => cam().close());
    expect(cam().tabsOpen).toBeNull();
  });

  it('ends the putting of tabs with the panel that held it – and opens the panel when it starts', () => {
    cam().add([rectangle(0, 0, 40, 30), rectangle(60, 0, 40, 30)]);
    cam().ungroup();
    const [one, two] = items();
    cam().select(one!.group);
    cam().manualTabs(one!.id);
    // putting tabs by hand is done in the panel: starting it opens it
    cam().setPlacing(one!.id);
    render(<CamCard />);
    expect(cam().tabsOpen).toBe(one!.id);
    expect(within(rows()[0]!).queryByTestId('cam-tabs')).not.toBeNull();
    // the panel closed by its own button: the mode ends with it
    fireEvent.click(within(rows()[0]!).getByTestId('cam-tabs-close'));
    expect(cam().placing).toBeNull();
    expect(panels()).toHaveLength(0);
    // the panel of another part: putting tabs on the first one ends
    act(() => cam().setPlacing(one!.id));
    fireEvent.click(within(rows()[1]!).getByTestId('cam-tabs-open'));
    expect(cam().placing).toBeNull();
    expect(cam().tabsOpen).toBe(two!.id);
    expect(within(rows()[1]!).queryByTestId('cam-tabs')).not.toBeNull();
    expect(panels()).toHaveLength(1);
  });

  it('shows no panel with nothing, or everything, selected', () => {
    cam().add([rectangle(0, 0, 40, 30), rectangle(60, 0, 40, 30)]);
    render(<CamCard />);
    fireEvent.click(within(rows()[0]!).getByTestId('cam-tabs-open'));
    expect(panels()).toHaveLength(1);
    act(() => cam().select(null));
    expect(screen.queryAllByTestId('cam-tabs')).toHaveLength(0);
    act(() => cam().select('all'));
    expect(screen.queryAllByTestId('cam-tabs')).toHaveLength(0);
  });

  it('says which contours of a part have no tab, where only some of them have', () => {
    cam().addSketch({ type: 'grid', d: 5, nx: 3, ny: 1, px: 30, py: 20 });
    const id = items()[0]!.id;
    cam().manualTabs(id);
    cam().openTabs(id);
    render(<CamCard />);
    expect(screen.queryByTestId('cam-tabs-warning')).toBeNull();
    // the places of the first hole go: one of three is cut free
    act(() => {
      while (items()[0]!.tabSpec!.at!.some((p) => p.c === 0)) {
        cam().removeTab(
          id,
          items()[0]!.tabSpec!.at!.findIndex((p) => p.c === 0),
        );
      }
    });
    expect(screen.getByTestId('cam-tabs-warning').textContent).toBe(
      t('cam.tabSome', { n: 1, m: 3 }),
    );
    // and when none has: the part is not held at all
    act(() => {
      while (items()[0]!.tabSpec!.at!.length > 0) cam().removeTab(id, 0);
    });
    expect(screen.getByTestId('cam-tabs-warning').textContent).toBe(t('cam.tabNone'));
    act(() => {
      cam().addTab(id, 0, 0.1);
      cam().addTab(id, 1, 0.1);
      cam().addTab(id, 2, 0.1);
    });
    expect(screen.queryByTestId('cam-tabs-warning')).toBeNull();
  });
  describe('is brought into view when it opens', () => {
    const into = vi.fn();
    let headTop = 100;
    const rect = (top: number, height: number) =>
      ({ top, bottom: top + height, height, left: 0, right: 0, width: 0, x: 0, y: top }) as DOMRect;
    beforeEach(() => {
      into.mockClear();
      Object.defineProperty(Element.prototype, 'scrollIntoView', {
        configurable: true,
        value: into,
      });
      // The list shows 0 … 300, the way back of the workspace covers its top 50; the head of the panel is where the test says
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: Element,
      ) {
        if (this.classList.contains('panel-body')) return rect(0, 300);
        if (this.classList.contains('workspace-head')) return rect(0, 50);
        if (this.classList.contains('cam-tabs-head')) return rect(headTop, 48);
        return rect(0, 0);
      });
    });
    afterEach(() => {
      vi.restoreAllMocks();
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    });

    it('only where its head – the name and the way to close it – lies out of sight', () => {
      cam().addSketch({ type: 'rect', w: 60, h: 40, r: 0 });
      render(
        <div className="panel-body">
          <CamCard />
        </div>,
      );
      const open = () => fireEvent.click(screen.getByTestId('cam-tabs-open'));
      const close = () => fireEvent.click(screen.getByTestId('cam-tabs-close'));
      // in the visible part: nothing moves (a tap on the box of the tabs is not taken from under the finger)
      headTop = 100;
      open();
      expect(panels()).toHaveLength(1);
      expect(into).not.toHaveBeenCalled();
      close();
      // below the fold (280 … 328 of 300): the panel itself is brought in, by the least that does it
      headTop = 280;
      open();
      expect(into).toHaveBeenCalledTimes(1);
      expect(into).toHaveBeenCalledWith({ block: 'nearest' });
      expect(into.mock.contexts[0]).toBe(panels()[0]);
      close();
      // under the way back (it covers the top 50): out of sight as well
      headTop = 20;
      open();
      expect(into).toHaveBeenCalledTimes(2);
      close();
      // the box of the tabs ticked off and on again is the same way in
      headTop = 290;
      const box = within(rows()[0]!).getByRole('checkbox', { name: t('cam.tabs') });
      fireEvent.click(box);
      fireEvent.click(box);
      expect(panels()).toHaveLength(1);
      expect(into).toHaveBeenCalledTimes(3);
    });

    it('and not at all without a list that scrolls around it, or a browser that can scroll to it', () => {
      cam().addSketch({ type: 'rect', w: 60, h: 40, r: 0 });
      // no scroll box around the card (a test, a place that does not scroll): nothing to bring it into
      headTop = 290;
      const bare = render(<CamCard />);
      fireEvent.click(screen.getByTestId('cam-tabs-open'));
      expect(panels()).toHaveLength(1);
      expect(into).not.toHaveBeenCalled();
      bare.unmount();
      cam().closeTabs();
      // a browser without `scrollIntoView` on elements is not asked for it
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
      render(
        <div className="panel-body">
          <CamCard />
        </div>,
      );
      fireEvent.click(screen.getByTestId('cam-tabs-open'));
      expect(panels()).toHaveLength(1);
    });
  });
});
