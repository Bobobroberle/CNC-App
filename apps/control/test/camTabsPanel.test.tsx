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
    useJob.getState().unload();
    useFlip.getState().cancel();
    openCam();
  });
  afterEach(cleanup);

  it('opens for the one part that is selected – a single thing of its own group', () => {
    cam().addSketch({ type: 'rect', w: 60, h: 40, r: 0 });
    render(<CamCard />);
    expect(rows()).toHaveLength(1);
    expect(panels()).toHaveLength(1);
    expect(within(rows()[0]!).queryByTestId('cam-tabs')).not.toBeNull();
    // nothing to move it to
    expect(screen.queryByTestId('cam-tabs-open')).toBeNull();
  });

  it('opens for one row only where the contours of a file came in as one group', () => {
    cam().add([rectangle(0, 0, 40, 30), rectangle(60, 0, 40, 30), rectangle(120, 0, 40, 30)]);
    expect(new Set(items().map((i) => i.group)).size).toBe(1);
    expect(items().every((i) => i.tabs)).toBe(true);
    render(<CamCard />);
    expect(rows()).toHaveLength(3);
    // one panel, in the first row, and the other two rows offer to take it
    expect(panels()).toHaveLength(1);
    expect(within(rows()[0]!).queryByTestId('cam-tabs')).not.toBeNull();
    expect(within(rows()[0]!).queryByTestId('cam-tabs-open')).toBeNull();
    for (const row of rows().slice(1)) {
      const open = within(row).getByTestId('cam-tabs-open');
      expect(open.getAttribute('aria-label')).toMatch(/3|2/);
    }
    // the panel belongs to part 1: its fields are named by its number
    expect(within(panels()[0]!).getAllByRole('textbox').length).toBeGreaterThan(0);
    // Moving it to the third row: there it is, and nowhere else
    fireEvent.click(within(rows()[2]!).getByTestId('cam-tabs-open'));
    expect(panels()).toHaveLength(1);
    expect(within(rows()[2]!).queryByTestId('cam-tabs')).not.toBeNull();
    expect(within(rows()[0]!).queryByTestId('cam-tabs-open')).not.toBeNull();
    expect(within(rows()[2]!).queryByTestId('cam-tabs-open')).toBeNull();
  });

  it('ends the putting of tabs on the part it was for when the panel goes to another', () => {
    cam().add([rectangle(0, 0, 40, 30), rectangle(60, 0, 40, 30)]);
    const [one, two] = items();
    cam().manualTabs(one!.id);
    cam().setPlacing(one!.id);
    render(<CamCard />);
    expect(cam().placing).toBe(one!.id);
    fireEvent.click(within(rows()[1]!).getByTestId('cam-tabs-open'));
    expect(cam().placing).toBeNull();
    expect(within(rows()[1]!).queryByTestId('cam-tabs')).not.toBeNull();
    // A tab box ticked on again opens that part's panel
    fireEvent.click(within(rows()[0]!).getByTestId('cam-tabs-open'));
    expect(within(rows()[0]!).queryByTestId('cam-tabs')).not.toBeNull();
    fireEvent.click(within(rows()[1]!).getByRole('checkbox', { name: 'Haltestege' }));
    expect(items().find((i) => i.id === two!.id)!.tabs).toBe(false);
    // its panel is gone with the tabs, the first part's is the one that is left
    expect(panels()).toHaveLength(1);
    expect(within(rows()[0]!).queryByTestId('cam-tabs')).not.toBeNull();
    fireEvent.click(within(rows()[1]!).getByRole('checkbox', { name: 'Haltestege' }));
    expect(items().find((i) => i.id === two!.id)!.tabs).toBe(true);
    expect(panels()).toHaveLength(1);
    expect(within(rows()[1]!).queryByTestId('cam-tabs')).not.toBeNull();
  });

  it('shows no panel with nothing, or everything, selected', () => {
    cam().add([rectangle(0, 0, 40, 30), rectangle(60, 0, 40, 30)]);
    render(<CamCard />);
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
});
