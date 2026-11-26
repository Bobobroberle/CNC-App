// @vitest-environment jsdom
import { rectangle } from '@lowrider/cam';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CamCard } from '../src/components/CamCard';
import { t } from '../src/i18n';
import { COMMANDS } from '../src/lib/commands';
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
const eye = (n: number) =>
  screen.getByRole('button', { name: new RegExp(`^(Teil ${n} (aus|ein)blenden)$`) });

describe('the eye of a part in the list', () => {
  let a = 0;
  let b = 0;
  let c = 0;
  beforeEach(() => {
    cam().close();
    cam().setMarquee(false);
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

  it('hides and shows a part: the row is set apart and says so in a word, the eye changes its name', () => {
    render(<CamCard />);
    expect(rows()).toHaveLength(3);
    expect(eye(2).getAttribute('aria-label')).toBe(t('cam.hide.hideOf', { n: 2 }));
    expect(rows()[1]!.classList.contains('hidden-part')).toBe(false);
    expect(within(rows()[1]!).queryByText(t('cam.hide.state'))).toBeNull();
    fireEvent.click(eye(2));
    expect(items()[1]!.hidden).toBe(true);
    // still in the list, in its place, with every control it had
    expect(rows()).toHaveLength(3);
    expect(rows()[1]!.classList.contains('hidden-part')).toBe(true);
    expect(within(rows()[1]!).getByText(t('cam.hide.state'))).not.toBeNull();
    expect(eye(2).getAttribute('aria-label')).toBe(t('cam.hide.showOf', { n: 2 }));
    expect(within(rows()[1]!).getAllByRole('combobox').length).toBeGreaterThan(0);
    // the other rows are as they were
    expect(rows()[0]!.classList.contains('hidden-part')).toBe(false);
    expect(eye(1).getAttribute('aria-label')).toBe(t('cam.hide.hideOf', { n: 1 }));
    fireEvent.click(eye(2));
    expect('hidden' in items()[1]!).toBe(false);
    expect(rows()[1]!.classList.contains('hidden-part')).toBe(false);
  });

  it('can be selected in the list while it is hidden', () => {
    render(<CamCard />);
    fireEvent.click(eye(2));
    fireEvent.click(within(rows()[1]!).getByRole('checkbox', { name: t('cam.pick', { n: 2 }) }));
    expect(cam().selected).toBe(b);
    fireEvent.click(screen.getByRole('button', { name: /^3\. / }));
    expect(cam().selected).toBe(c);
    fireEvent.click(screen.getByRole('button', { name: /^2\. / }));
    expect(cam().selected).toBe(b);
  });

  it('offers "Alle einblenden" below the list while a part is hidden – never above it', () => {
    render(<CamCard />);
    expect(screen.queryByTestId('cam-hidden')).toBeNull();
    fireEvent.click(eye(1));
    const note = screen.getByTestId('cam-hidden');
    const list = screen.getByTestId('cam-contours');
    // after the list in the document, so what the eye just tapped does not move away from the finger
    expect(list.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(note).getByText(t('cam.hide.note'))).not.toBeNull();
    fireEvent.click(eye(3));
    fireEvent.click(within(note).getByRole('button', { name: t('cam.hide.showAll') }));
    expect(items().some((i) => i.hidden)).toBe(false);
    expect(screen.queryByTestId('cam-hidden')).toBeNull();
  });

  it('says so when every part is hidden, and keeps the hand-over closed with the reason', () => {
    render(<CamCard />);
    const handOver = () => screen.getByTestId('cam-hand-over');
    expect(handOver().hasAttribute('disabled')).toBe(false);
    for (const n of [1, 2, 3]) fireEvent.click(eye(n));
    expect(
      within(screen.getByTestId('cam-hidden')).getByText(t('cam.hide.allHidden')),
    ).not.toBeNull();
    expect(handOver().hasAttribute('disabled')).toBe(true);
    expect(handOver().getAttribute('data-reason')).toBe(t('cam.hide.allHidden'));
    fireEvent.click(screen.getByRole('button', { name: t('cam.hide.showAll') }));
    expect(handOver().hasAttribute('disabled')).toBe(false);
  });

  it('aligns by the parts in sight: a hidden part ticked beside one is no pair', () => {
    render(<CamCard />);
    act(() => cam().setHidden(items()[1]!.id, true));
    // a part in sight and a hidden one: nothing to align
    act(() => cam().select([a, b]));
    expect(screen.queryByTestId('cam-align')).toBeNull();
    // two in sight and a hidden one: the hint counts two, and spreading needs three
    act(() => cam().select([a, b, c]));
    expect(screen.getByTestId('cam-align').textContent).toContain(t('cam.align.hint', { n: 2 }));
    const spread = within(screen.getByTestId('cam-align')).getByRole('button', {
      name: t('cam.align.spread.h.gapsLabel'),
    });
    expect(spread.hasAttribute('disabled')).toBe(true);
  });

  it('switches "Rahmen aufziehen" on and off, with nothing selected and with a selection', () => {
    render(<CamCard />);
    const frame = () => screen.getByRole('checkbox', { name: t('cam.arrange.marquee') });
    expect(frame().getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByTestId('cam-marquee-hint')).toBeNull();
    fireEvent.click(frame());
    expect(cam().marquee).toBe(true);
    expect(screen.getByTestId('cam-marquee-hint').textContent).toBe(t('cam.arrange.marqueeHint'));
    act(() => cam().select(a));
    expect(frame().getAttribute('aria-checked')).toBe('true');
    // independent of "Mehrfachauswahl": both can be on
    fireEvent.click(screen.getByRole('checkbox', { name: t('cam.arrange.multi') }));
    expect(cam().multi && cam().marquee).toBe(true);
    fireEvent.click(frame());
    expect(cam().marquee).toBe(false);
    expect(cam().multi).toBe(true);
    // the drawing closed: the mode is off (like the other one)
    fireEvent.click(frame());
    act(() => cam().close());
    expect(cam().marquee).toBe(false);
  });

  it('leads the quick search to something that is there – with nothing drawn, with parts, with one hidden', () => {
    const chain = (id: string) => COMMANDS.find((cmd) => cmd.id === id)!.anchor;
    const first = (id: string) =>
      chain(id).find((anchor) => document.querySelector(`[data-find~="${anchor}"]`) !== null) ??
      `${id}: nothing`;
    // an empty drawing: the list card and the card of the drawing are the places
    cam().close();
    openCam();
    const view = render(<CamCard />);
    expect(first('camHide')).toBe('cam-how');
    expect(first('camShowAll')).toBe('cam-how');
    expect(first('camMarquee')).toBe('cam-draw');
    view.unmount();
    cleanup();
    // parts: the eye of the first row, the switch of the frame
    cam().add([rectangle(0, 0, 10, 10)]);
    cam().add([rectangle(30, 20, 20, 10)]);
    render(<CamCard />);
    expect(first('camHide')).toBe('cam-hide');
    expect(first('camShowAll')).toBe('cam-hide');
    expect(first('camMarquee')).toBe('cam-marquee');
    // one hidden: "Alle einblenden" has its own button
    act(() => cam().setHidden(items()[0]!.id, true));
    expect(first('camShowAll')).toBe('cam-show-all');
  });
});
