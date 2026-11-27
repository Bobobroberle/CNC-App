// @vitest-environment jsdom
import { rectangle } from '@lowrider/cam';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CamCard } from '../src/components/CamCard';
import { t } from '../src/i18n';
import { findCommands } from '../src/lib/commandSearch';
import { COMMANDS } from '../src/lib/commands';
import { openCam } from '../src/store/camPlace';
import { useJob } from '../src/store/job';
import { useWorkshop } from '../src/store/workshop';
import { cam, changes, items, resetTools, scene, SMALL, VBIT } from './camToolsFixtures';

// jsdom has no observers; the segmented controls want them
class Quiet {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', Quiet);

const rows = () => screen.getAllByRole('listitem').filter((li) => li.classList.contains('cam-row'));
const field = (n: number) =>
  screen.queryByRole<HTMLSelectElement>('combobox', { name: t('cam.partTool', { n }) });
const fieldOf = (row: HTMLElement) =>
  row.querySelector<HTMLSelectElement>('[data-find="cam-part-tool"]');
const options = (select: HTMLElement) =>
  [...select.querySelectorAll('option')].map((o) => ({
    value: o.value,
    text: o.textContent ?? '',
    disabled: o.disabled,
  }));

describe('the cutter of a part in the list', () => {
  let plate = 0;
  let text = 0;
  beforeEach(() => {
    scene();
    openCam();
    cam().add([rectangle(0, 0, 40, 30)]);
    cam().addText('Hi', { height: 8 });
    [plate, text] = items().map((i) => i.id) as [number, number];
    cam().select(null);
  });
  afterEach(() => {
    cleanup();
    resetTools();
  });

  it('is a field in the row of every part that is cut, not in the row of one that is not – "wie die Zeichnung" first', () => {
    render(<CamCard />);
    expect(rows()).toHaveLength(2);
    for (const n of [1, 2]) {
      const select = field(n)!;
      expect(select).not.toBeNull();
      expect(select.value).toBe('');
      expect(options(select)[0]).toMatchObject({
        value: '',
        text: t('cam.tools.likeDrawing', { tool: 'T3 Schaftfräser 6 mm, Ø 6,0' }),
      });
    }
    // a part that is not cut has none: there is nothing to choose
    act(() => cam().setItem(plate, { kind: 'none' }));
    expect(field(1)).toBeNull();
    expect(field(2)).not.toBeNull();
    // (it is the tool list that offers: one with a single cutter has nothing to choose)
    act(() => useWorkshop.setState({ tools: [VBIT] }));
    expect(field(2)).toBeNull();
  });

  it('offers a V-bit, ball cutter and drill for engraving and drilling only – the others are listed, closed, with the reason in their label', () => {
    render(<CamCard />);
    const outline = options(field(1)!);
    const engraving = options(field(2)!);
    const closed = (o: { value: string; text: string; disabled: boolean }) => o.disabled;
    // the outline takes the flat cutters; the V-bit (T4) and the ball cutter (T2) are closed and say why
    expect(outline.filter(closed).map((o) => o.value)).toEqual(['t2', 'v1']);
    for (const o of outline.filter(closed)) expect(o.text).toContain(t('cam.tools.kindOnly'));
    expect(outline.find((o) => o.value === 't1')!.disabled).toBe(false);
    // the engraving takes every one
    expect(engraving.filter(closed)).toEqual([]);
    expect(engraving.map((o) => o.value)).toEqual(['', 't1', 't2', 't3', 'v1', 'f2']);
    // a probe is no cutter and is not listed at all
    act(() =>
      useWorkshop
        .getState()
        .saveTool({ ...SMALL, id: 'probe1', number: 9, probe: true, name: 'Taster' }),
    );
    expect(options(field(2)!).some((o) => o.value === 'probe1')).toBe(false);
  });

  it('choosing one is a step of the drawing, makes the summary appear – and no row changes: the same controls before and after', () => {
    render(<CamCard />);
    const before = rows().map((r) => r.querySelectorAll('select, input, button').length);
    const head = rows().map((r) => r.querySelector('.cam-head')!.textContent);
    expect(screen.queryByTestId('cam-tools-summary')).toBeNull();
    fireEvent.change(field(2)!, { target: { value: 'v1' } });
    expect(items().find((i) => i.id === text)!.toolId).toBe('v1');
    expect(changes()).toEqual(['T4 M6', 'T3 M6']);
    // the field stays where it was, in the same row, with what was chosen; nothing came or went in any row
    expect(field(2)!.value).toBe('v1');
    expect(rows().map((r) => r.querySelectorAll('select, input, button').length)).toEqual(before);
    expect(rows().map((r) => r.querySelector('.cam-head')!.textContent)).toEqual(head);
    expect(fieldOf(rows()[1]!)).toBe(field(2));
    // the summary says which cutters the program has – in the order the program uses them (read from it: the engraving
    // comes before the outline that frees the part, whatever order the list is in)
    const summary = screen.getByTestId('cam-tools-summary');
    expect(summary.textContent).toContain(
      t('cam.tools.several', { count: 2, list: 'T4 V-Fräser 60° · T3 Schaftfräser 6 mm' }),
    );
    expect(summary.textContent).toContain(t('cam.tools.changeHint'));
    // the V-bit has values of its own: nothing to say of values
    expect(screen.queryByTestId('cam-tools-values')).toBeNull();
    // and back to "wie die Zeichnung": no summary, the plain program
    fireEvent.change(field(2)!, { target: { value: '' } });
    expect(screen.queryByTestId('cam-tools-summary')).toBeNull();
    expect(changes()).toEqual([]);
  });

  it('a cutter without values of its own says so: it cuts with the drawing’s feed, speed and stepdown', () => {
    render(<CamCard />);
    fireEvent.change(field(2)!, { target: { value: 'f2' } });
    const said = screen.getAllByTestId('cam-tools-values');
    expect(said).toHaveLength(1);
    expect(said[0]!.textContent).toBe(t('cam.tools.noValues', { tool: 'T5 Schaftfräser 2 mm' }));
  });

  it('one cutter that is not the drawing’s is said too: the program cuts with it', () => {
    render(<CamCard />);
    act(() => cam().setItem(plate, { kind: 'none' }));
    fireEvent.change(field(2)!, { target: { value: 'v1' } });
    expect(screen.getByTestId('cam-tools-summary').textContent).toContain(
      t('cam.tools.one', { tool: 'T4 V-Fräser 60°' }),
    );
    expect(changes()).toEqual([]);
  });

  it('a choice that is no longer in the list stays visible in the field, with a word for it – never "wie die Zeichnung"', () => {
    render(<CamCard />);
    fireEvent.change(field(2)!, { target: { value: 'v1' } });
    act(() => useWorkshop.getState().removeTool('v1'));
    const select = field(2)!;
    expect(select.value).toBe('v1');
    expect(options(select).find((o) => o.value === 'v1')!.text).toBe(
      t('cam.tools.gone', { id: 'v1' }),
    );
    // the card says what the program does about it
    const differences = screen.getByTestId('cam-differences');
    expect(within(differences).getAllByTestId('cam-difference')[0]!.textContent).toContain(
      'Das gewählte Werkzeug „v1“ gibt es in der Werkzeugliste nicht mehr',
    );
    expect(within(differences).getAllByTestId('cam-difference')[0]!.getAttribute('data-code')).toBe(
      'tool-missing',
    );
    // …and the drawing is cut with its own, so the hand-over is not locked
    expect(screen.getByTestId('cam-hand-over').hasAttribute('disabled')).toBe(false);
  });

  it('a tool list that no program can be made from: the red list says it, the hand-over is closed with the reason', () => {
    render(<CamCard />);
    fireEvent.change(field(2)!, { target: { value: 'v1' } });
    act(() => useWorkshop.getState().saveTool({ ...SMALL, number: 4 }));
    const refused = screen.getByTestId('cam-tool-notes');
    expect(refused.textContent).toContain(
      'Die Nummer T4 haben „V-Fräser 60°“ und „Schaftfräser 2 mm“',
    );
    expect(refused.textContent).toContain('Es wird kein Programm gemacht');
    expect(refused.querySelector('li')!.className).toBe('error');
    expect(screen.queryByTestId('cam-tools-summary')).toBeNull();
    const handOver = screen.getByTestId('cam-hand-over');
    expect(
      handOver.hasAttribute('disabled') || handOver.getAttribute('aria-disabled') === 'true',
    ).toBe(true);
    expect(handOver.getAttribute('data-reason')).toBe(t('cam.tools.noProgram'));
  });

  it('closes the series with the reason where a part has a cutter of its own', () => {
    render(<CamCard />);
    expect(screen.queryByTestId('series-own-tools')).toBeNull();
    fireEvent.change(field(2)!, { target: { value: 'v1' } });
    expect(screen.getByTestId('series-own-tools').textContent).toBe(
      t('series.ownTools', { rows: '2' }),
    );
    const open = screen.getByRole('button', { name: t('series.open') });
    expect(open.hasAttribute('disabled') || open.getAttribute('aria-disabled') === 'true').toBe(
      true,
    );
  });

  it('a two-sided drawing says in the card of the sides why there is no program', () => {
    act(() => cam().setTwoSided({ thickness: 12 }));
    render(<CamCard />);
    fireEvent.change(field(2)!, { target: { value: 'v1' } });
    const notes = screen.getByTestId('cam-flip-notes');
    expect(notes.textContent).toContain(t('flip.notes.tools', { rows: '2' }));
    expect(notes.querySelector('li')!.className).toBe('error');
    expect(screen.getByTestId('cam-hand-over').hasAttribute('disabled')).toBe(true);
    // no summary of "2 Werkzeuge in einem Programm" above a note that says no program is made
    expect(screen.queryByTestId('cam-tools-summary')).toBeNull();
    // and "Zeichnung auf den Tisch legen" – the program of another drawing lies there – is closed with the reason
    act(() => useJob.getState().load('other.nc', 'G0 X1\n'));
    const show = screen.getByTestId('cam-show-drawing');
    expect(show.hasAttribute('disabled')).toBe(true);
    expect(show.getAttribute('data-reason')).toBe(t('cam.tools.noProgram'));
  });

  it('is found by the words an operator uses for several tools – in either language', () => {
    for (const query of [
      'mehrere werkzeuge',
      'werkzeug pro teil',
      'gravurfräser',
      'v-fräser',
      'vbit',
      'bohrer',
      'several tools',
      'tool per part',
      'm6',
    ]) {
      expect(
        findCommands(query)
          .slice(0, 5)
          .map((c) => c.id),
        query,
      ).toContain('camPartTool');
    }
  });

  it('is found by the quick search: an entry with an anchor on the field, a chain that ends in a card that is always there', () => {
    const entry = COMMANDS.find((c) => c.id === 'camPartTool')!;
    expect(entry).toBeDefined();
    expect(entry.anchor).toEqual(['cam-part-tool', 'cam-how']);
    render(<CamCard />);
    expect(document.querySelector('[data-find="cam-part-tool"]')).not.toBeNull();
    expect(document.querySelector('[data-find="cam-how"]')).not.toBeNull();
    // with nothing drawn the field is not there, the card it ends in is
    act(() => cam().clear());
    expect(document.querySelector('[data-find="cam-part-tool"]')).toBeNull();
    expect(document.querySelector('[data-find="cam-how"]')).not.toBeNull();
  });
});
