// @vitest-environment jsdom
import { circle, rectangle } from '@lowrider/cam';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CamArrange } from '../src/components/CamArrange';
import { CamCard } from '../src/components/CamCard';
import { droppedName } from '../src/components/CamColors';
import { t } from '../src/i18n';
import { findCommands } from '../src/lib/commandSearch';
import { COMMANDS } from '../src/lib/commands';
import { openCam } from '../src/store/camPlace';
import { useMachine } from '../src/store/machine';
import { useUi } from '../src/store/ui';
import { useWorkshop } from '../src/store/workshop';
import { cam, changes, items, program, resetTools, scene, SMALL } from './camToolsFixtures';

// jsdom has no observers; the segmented controls want them
class Quiet {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', Quiet);

const rows = () => screen.getAllByRole('listitem').filter((li) => li.classList.contains('cam-row'));
/** The choice of the colour in the card of the selection */
const choice = () =>
  screen.queryByRole<HTMLSelectElement>('combobox', { name: t('cam.colors.select') });
const card = (id: string) => screen.queryByTestId(`cam-color-${id}`);
const colourField = (id: string, key: string) =>
  screen.getByRole<HTMLInputElement>('textbox', {
    name: t(`cam.colors.${key}` as 'cam.colors.depthOf', { letter: id.toUpperCase() }),
  });
const colors = () => cam().project!.colors;
const type = (input: HTMLElement, value: string) => fireEvent.change(input, { target: { value } });
/** The card of the colours and the tab defaults of each colour unfolded (they are folded until they are opened once) */
const unfold = () =>
  act(() =>
    useUi.setState({
      depth: { camColors: 'more', camColorA: 'more', camColorB: 'more', camColorC: 'more' },
    }),
  );

describe('the colours in the workspace', () => {
  let plate = 0;
  let text = 0;
  beforeEach(() => {
    scene();
    openCam();
    useUi.setState({ depth: {} });
    cam().add([rectangle(0, 0, 40, 30)]);
    cam().addText('Hi', { height: 8 });
    [plate, text] = items().map((i) => i.id) as [number, number];
    cam().select(null);
  });
  afterEach(() => {
    cleanup();
    resetTools();
  });

  describe('the choice of a colour in the card of the selection', () => {
    it('is there with a selection only – not with nothing selected, not for a registration hole alone', () => {
      render(<CamCard />);
      expect(choice()).toBeNull();
      act(() => cam().select(items()[0]!.group));
      expect(choice()).not.toBeNull();
      act(() => {
        cam().setTwoSided({ thickness: 12 });
        cam().setItem(text, { side: 'back' });
        cam().select(items().find((i) => i.registration === 1)!.group);
      });
      expect(choice()).toBeNull();
    });

    it('offers none and the four colours by letter and name, and gives the selection the one that is chosen', () => {
      render(<CamCard />);
      act(() => cam().select(items()[0]!.group));
      const select = choice()!;
      expect([...select.querySelectorAll('option')].map((o) => [o.value, o.textContent])).toEqual([
        ['', t('cam.colors.none')],
        ['a', 'A · Orange'],
        ['b', 'B · Limette'],
        ['c', 'C · Türkis'],
        ['d', 'D · Rosa'],
      ]);
      expect(select.value).toBe('');
      fireEvent.change(select, { target: { value: 'c' } });
      expect(items().map((i) => i.color)).toEqual(['c', undefined]);
      expect(choice()!.value).toBe('c');
      fireEvent.change(choice()!, { target: { value: '' } });
      expect(items().some((i) => i.color !== undefined)).toBe(false);
    });

    it('gives every selected part the colour in one step, and says "verschieden" where they differ', () => {
      render(<CamCard />);
      act(() => {
        cam().setColor('a', [plate]);
        cam().selectAll();
      });
      const select = choice()!;
      expect(select.value).toBe('mixed');
      const mixed = [...select.querySelectorAll('option')].find((o) => o.value === 'mixed')!;
      expect(mixed.textContent).toBe(t('cam.colors.mixed'));
      expect(mixed.disabled).toBe(true);
      const before = cam().past.length;
      fireEvent.change(select, { target: { value: 'b' } });
      expect(items().map((i) => i.color)).toEqual(['b', 'b']);
      expect(cam().past.length).toBe(before + 1);
      expect(choice()!.value).toBe('b');
      expect(choice()!.querySelector('option[value="mixed"]')).toBeNull();
    });

    it('is anchored for the quick search, and the select keeps one place in the card with any selection', () => {
      render(<CamCard />);
      act(() => cam().select(items()[0]!.group));
      expect(document.querySelectorAll('[data-find="cam-color"]')).toHaveLength(1);
      const at = (e: Element | null) =>
        [...document.querySelectorAll('select')].indexOf(e as never);
      const first = at(choice());
      act(() => cam().selectAll());
      expect(at(choice())).toBe(first);
    });
  });

  describe('the colour in the list', () => {
    it('marks a part with a small mark that is named "Farbe A, Orange" – and no row gets another control', () => {
      render(<CamCard />);
      const controls = () =>
        rows().map((r) => r.querySelectorAll('select, input, button, textarea, a').length);
      const before = controls();
      expect(screen.queryAllByTestId('cam-color-pill')).toHaveLength(0);
      act(() => cam().setColor('a', [plate]));
      const pills = screen.getAllByTestId('cam-color-pill');
      expect(pills).toHaveLength(1);
      expect(pills[0]!.getAttribute('aria-label')).toBe('Farbe A, Orange');
      expect(pills[0]!.textContent).toBe('A');
      expect(pills[0]!.getAttribute('data-color')).toBe('a');
      // it is in the head of the row of the part that has it – and nothing else came or went in any row
      expect(rows()[0]!.querySelector('.cam-head [data-testid="cam-color-pill"]')).not.toBeNull();
      expect(rows()[1]!.querySelector('[data-testid="cam-color-pill"]')).toBeNull();
      expect(controls()).toEqual(before);
      // the letter is the carrier: in the text colour on the card's fill, the colour is the frame only
      expect(pills[0]!.className).toBe('cam-color-pill');
    });

    it('shows the depth of the colour where the part has none of its own: the placeholder is the colour’s', () => {
      render(<CamCard />);
      const depth = (n: number) =>
        screen.getByRole<HTMLInputElement>('textbox', { name: t('cam.depthOf', { n }) });
      expect(depth(1).placeholder).toBe('6');
      act(() => {
        cam().setColor('a', [plate, text]);
        cam().setColorValue('a', { depth: 3, engraveDepth: 0.5 });
      });
      expect(depth(1).placeholder).toBe('3');
      // the engraved text: the colour's engraving depth
      expect(depth(2).placeholder).toBe('0,5');
    });

    it('names the colour in the direction and the cutter where the colour decides', () => {
      render(<CamCard />);
      act(() => cam().setColor('b', [plate, text]));
      const direction = () =>
        screen.getByRole<HTMLSelectElement>('combobox', { name: t('cam.direction', { n: 1 }) });
      const tool = () =>
        screen.getByRole<HTMLSelectElement>('combobox', { name: t('cam.partTool', { n: 2 }) });
      const first = (select: HTMLSelectElement) => select.querySelector('option')!.textContent;
      // the colour sets neither: as before
      expect(first(direction())).toBe(t('cam.directions.job'));
      expect(first(tool())).toBe(
        t('cam.tools.likeDrawing', { tool: 'T3 Schaftfräser 6 mm, Ø 6,0' }),
      );
      act(() => cam().setColorValue('b', { climb: false, toolId: 'v1' }));
      expect(first(direction())).toBe(
        t('cam.colors.likeColor', { letter: 'B', value: t('cam.directions.conventional') }),
      );
      expect(first(tool())).toBe(
        t('cam.colors.likeColor', { letter: 'B', value: 'T4 V-Fräser 60°, Ø 3,0' }),
      );
      // a part that chooses its own is its own
      fireEvent.change(tool(), { target: { value: 't3' } });
      expect(tool().value).toBe('t3');
      expect(changes()).toEqual([]);
    });
  });

  describe('the card "Farbgruppen" below the list', () => {
    it('is a folded part below the list, closed until opened once – and then as it was left', () => {
      const { unmount } = render(<CamCard />);
      const fold = screen.getByTestId('cam-colors');
      expect(fold.getAttribute('data-find')).toBe('cam-colors');
      const list = screen.getByTestId('cam-contours');
      // below the rows, never above them
      expect(list.compareDocumentPosition(fold) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(useUi.getState().depth.camColors).toBeUndefined();
      const trigger = within(fold).getByRole('button', { name: t('cam.colors.title') });
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      fireEvent.click(trigger);
      expect(useUi.getState().depth.camColors).toBe('more');
      unmount();
      render(<CamCard />);
      expect(
        within(screen.getByTestId('cam-colors'))
          .getByRole('button', { name: t('cam.colors.title') })
          .getAttribute('aria-expanded'),
      ).toBe('true');
    });

    it('says how to give a colour while none is in use, and lists only the colours some part carries', () => {
      render(<CamCard />);
      const fold = screen.getByTestId('cam-colors');
      expect(within(fold).getByText(t('cam.colors.empty'))).not.toBeNull();
      expect(card('a')).toBeNull();
      act(() => cam().setColor('c', [plate]));
      expect(card('a')).toBeNull();
      expect(card('b')).toBeNull();
      expect(card('c')).not.toBeNull();
      expect(card('d')).toBeNull();
      expect(within(fold).queryByText(t('cam.colors.empty'))).toBeNull();
      act(() => cam().setColor('a', [text]));
      expect([card('a'), card('c')].every((c) => c !== null)).toBe(true);
      // in the order of the colours, not of the parts
      const order = [...fold.querySelectorAll('section')].map((s) => s.getAttribute('data-testid'));
      expect(order).toEqual(['cam-color-a', 'cam-color-c']);
      // and one that is given up goes
      act(() => cam().setColor(null, [text]));
      expect(card('a')).toBeNull();
    });

    it('says what a colour does not do: parts keep their own values, the order of the cuts is not its matter', () => {
      render(<CamCard />);
      act(() => cam().setColor('a', [plate]));
      const hint = within(screen.getByTestId('cam-colors')).getByText(t('cam.colors.hint'));
      expect(hint.textContent).toContain('Was ein Teil selbst eingestellt hat, geht vor');
      expect(hint.textContent).toContain('Reihenfolge der Schnitte');
    });

    it('counts the parts of a colour and says how many of them are hidden', () => {
      render(<CamCard />);
      act(() => cam().setColor('a', [plate, text]));
      expect(screen.getByTestId('cam-color-a-count').textContent).toBe('Teile: 2');
      act(() => cam().setHidden(text, true));
      expect(screen.getByTestId('cam-color-a-count').textContent).toBe(
        'Teile: 2 · davon ausgeblendet: 1',
      );
      // a colour of hidden parts is still in use, and still has its values
      act(() => {
        cam().setColorValue('a', { depth: 3 });
        cam().setHidden(plate, true);
      });
      expect(card('a')).not.toBeNull();
      expect(colors()).toEqual({ a: { depth: 3 } });
    });

    it('sets the depth: typed with a comma or a point, the placeholder is the drawing’s, emptied it is the drawing’s again', () => {
      render(<CamCard />);
      unfold();
      act(() => cam().setColor('a', [plate]));
      const depth = () => colourField('a', 'depthOf');
      expect(depth().placeholder).toBe('6');
      type(depth(), '3,5');
      expect(colors()).toEqual({ a: { depth: 3.5 } });
      expect(program()).toContain('Z-3.5');
      // a Deviation mark beside the label while it differs from the drawing's
      const fold = screen.getByTestId('cam-color-a');
      expect(fold.querySelectorAll('.deviation-dot')).toHaveLength(1);
      type(depth(), '6');
      expect(fold.querySelectorAll('.deviation-dot')).toHaveLength(0);
      type(depth(), '');
      expect(colors()).toBeUndefined();
      expect(depth().value).toBe('');
      // the same for the engraving depth
      type(colourField('a', 'engraveDepthOf'), '0.4');
      expect(colors()).toEqual({ a: { engraveDepth: 0.4 } });
    });

    it('sets the direction: as the drawing, climb, conventional', () => {
      render(<CamCard />);
      unfold();
      act(() => cam().setColor('a', [plate]));
      const select = () =>
        screen.getByRole<HTMLSelectElement>('combobox', {
          name: t('cam.colors.directionOf', { letter: 'A' }),
        });
      expect([...select().querySelectorAll('option')].map((o) => o.textContent)).toEqual([
        t('cam.colors.likeDrawing', { value: t('cam.directions.climb') }),
        t('cam.directions.climb'),
        t('cam.directions.conventional'),
      ]);
      expect(select().value).toBe('job');
      fireEvent.change(select(), { target: { value: 'conventional' } });
      expect(colors()).toEqual({ a: { climb: false } });
      fireEvent.change(select(), { target: { value: 'climb' } });
      expect(colors()).toEqual({ a: { climb: true } });
      fireEvent.change(select(), { target: { value: 'job' } });
      expect(colors()).toBeUndefined();
      // (the drawing's own direction is named in the first choice)
      act(() => cam().setSettings({ climb: false }));
      expect(select().querySelector('option')!.textContent).toBe(
        t('cam.colors.likeDrawing', { value: t('cam.directions.conventional') }),
      );
    });

    it('sets the cutter: every tool that is no probe, "wie die Zeichnung" first, a missing one stays visible, a V-bit comes with its warning', () => {
      render(<CamCard />);
      unfold();
      act(() => {
        cam().setColor('a', [text]);
        useWorkshop
          .getState()
          .saveTool({ ...SMALL, id: 'probe1', number: 9, probe: true, name: 'Taster' });
      });
      const select = () =>
        screen.getByRole<HTMLSelectElement>('combobox', {
          name: t('cam.colors.toolOf', { letter: 'A' }),
        });
      const values = () => [...select().querySelectorAll('option')].map((o) => o.value);
      expect(values()).toEqual(['', 't1', 't2', 't3', 'v1', 'f2']);
      expect(select().querySelector('option')!.textContent).toBe(
        t('cam.tools.likeDrawing', { tool: 'T3 Schaftfräser 6 mm (Ø 6,0)' }),
      );
      expect(screen.queryByText(t('cam.colors.toolHint'))).toBeNull();
      fireEvent.change(select(), { target: { value: 'v1' } });
      expect(colors()).toEqual({ a: { toolId: 'v1' } });
      expect(changes()).toEqual(['T4 M6', 'T3 M6']);
      expect(screen.getByText(t('cam.colors.toolHint'))).not.toBeNull();
      fireEvent.change(select(), { target: { value: 'f2' } });
      expect(screen.queryByText(t('cam.colors.toolHint'))).toBeNull();
      // a cutter that has gone from the list stays visible
      act(() => useWorkshop.getState().removeTool('f2'));
      expect(select().value).toBe('f2');
      expect(select().querySelector('option[value="f2"]')!.textContent).toBe(
        t('cam.tools.gone', { id: 'f2' }),
      );
      fireEvent.change(select(), { target: { value: '' } });
      expect(colors()).toBeUndefined();
    });

    it('sets the tab defaults under "Mehr Optionen": count, width and height, the drawing’s values as placeholders', () => {
      render(<CamCard />);
      unfold();
      act(() => cam().setColor('a', [plate]));
      expect(colourField('a', 'tabCountOf').placeholder).toBe('4');
      expect(colourField('a', 'tabWidthOf').placeholder).toBe('6');
      expect(colourField('a', 'tabHeightOf').placeholder).toBe('2');
      type(colourField('a', 'tabCountOf'), '2');
      type(colourField('a', 'tabWidthOf'), '9');
      type(colourField('a', 'tabHeightOf'), '1,5');
      expect(colors()).toEqual({ a: { tabs: { count: 2, width: 9, height: 1.5 } } });
      type(colourField('a', 'tabCountOf'), '');
      expect(colors()).toEqual({ a: { tabs: { width: 9, height: 1.5 } } });
      // the fold of the tabs is the "Mehr Optionen" of this colour, remembered
      expect(screen.getByTestId('depth-more-camColorA')).not.toBeNull();
    });

    it('the dot of a colour’s field says what it is compared with – the drawing’s setting, with its unit – and not a recommendation', () => {
      render(<CamCard />);
      unfold();
      act(() => cam().setColor('a', [plate]));
      const dots = () =>
        [...screen.getByTestId('cam-color-a').querySelectorAll<HTMLElement>('.deviation-dot')].map(
          (d) => [d.getAttribute('title'), d.querySelector('.sr-only')!.textContent],
        );
      expect(dots()).toEqual([]);
      // the drawing is 6 mm deep, engraves 1 mm deep, has four tabs of 6 × 2 mm
      type(colourField('a', 'depthOf'), '3');
      type(colourField('a', 'engraveDepthOf'), '0.4');
      type(colourField('a', 'tabCountOf'), '2');
      type(colourField('a', 'tabWidthOf'), '9');
      type(colourField('a', 'tabHeightOf'), '1,5');
      const said = [
        'Weicht von der Zeichnung ab (6 mm)',
        'Weicht von der Zeichnung ab (1 mm)',
        'Weicht von der Zeichnung ab (4)',
        'Weicht von der Zeichnung ab (6 mm)',
        'Weicht von der Zeichnung ab (2 mm)',
      ];
      expect(dots()).toEqual(said.map((text) => [text, text]));
      for (const [title] of dots()) {
        expect(title).toContain('Zeichnung');
        expect(title).not.toContain('Empfehlung');
      }
      // a deviation that really is from a recommendation says so as ever
      expect(t('depth.deviates', { value: '100 %' })).toBe('Weicht von der Empfehlung ab (100 %)');
    });

    it('names the peck a project file left out by the number of the hole', () => {
      expect(droppedName('peck.3')).toBe(t('cam.project.peckDropped', { n: '3' }));
      expect(droppedName('peck.3')).toContain('Teil 3');
    });

    it('a part keeps its own value: the panel of its tabs shows the colour’s as the default', () => {
      render(<CamCard />);
      act(() => {
        cam().setColor('a', [plate]);
        cam().setColorValue('a', { tabs: { count: 2, width: 9 } });
        cam().openTabs(plate);
      });
      const panel = screen.getByTestId('cam-tabs');
      // (its field is named by its label, "Anzahl")
      const count = within(panel).getByRole<HTMLInputElement>('textbox', { name: 'Anzahl' });
      expect(count.placeholder).toBe('2');
      type(count, '5');
      expect(items().find((i) => i.id === plate)!.tabSpec?.count).toBe(5);
      // its own value differs from the default it follows, and says so
      expect(panel.querySelectorAll('.deviation-dot').length).toBeGreaterThan(0);
    });
  });

  describe('the search', () => {
    it('finds the card and the choice by the words an operator uses – in either language', () => {
      const top = (query: string, n = 5) =>
        findCommands(query)
          .slice(0, n)
          .map((c) => c.id);
      for (const query of [
        'farbgruppen',
        'farben',
        'ebene',
        'layer',
        'tiefe je farbe',
        'werkzeug je farbe',
        'estlcam',
        'colour groups',
        'depth per colour',
      ]) {
        expect(top(query), query).toContain('camColors');
      }
      for (const query of ['farbe', 'farbe zuweisen', 'einfärben', 'colour', 'assign a colour']) {
        expect(top(query), query).toContain('camColor');
      }
      expect(top('farbgruppen', 1)).toEqual(['camColors']);
    });

    it('leads to anchors that are on the page: the fold with parts, the card of the list without, the field with a selection', () => {
      expect(COMMANDS.find((c) => c.id === 'camColors')!.anchor).toEqual(['cam-colors', 'cam-how']);
      expect(COMMANDS.find((c) => c.id === 'camColor')!.anchor).toEqual([
        'cam-color',
        'cam-multi',
        'cam-draw',
      ]);
      render(
        <>
          <CamCard />
        </>,
      );
      expect(document.querySelector('[data-find="cam-colors"]')).not.toBeNull();
      // with a selection the field of the colour is there; without, the chain ends in the card that always is
      expect(document.querySelector('[data-find="cam-color"]')).toBeNull();
      expect(document.querySelector('[data-find="cam-multi"]')).not.toBeNull();
      act(() => cam().select(items()[0]!.group));
      expect(document.querySelector('[data-find="cam-color"]')).not.toBeNull();
      // with nothing drawn: no fold, the card of the list is the end of the chain
      act(() => cam().clear());
      expect(document.querySelector('[data-find="cam-colors"]')).toBeNull();
      expect(document.querySelector('[data-find="cam-how"]')).not.toBeNull();
      expect(document.querySelector('[data-find="cam-draw"]')).not.toBeNull();
    });
  });
});

describe('the colours alone, in the card of the selection', () => {
  beforeEach(() => {
    scene();
    openCam();
    cam().add([rectangle(0, 0, 40, 30)]);
    cam().add([circle(10, 10, 4)]);
    cam().select(items()[0]!.group);
  });
  afterEach(cleanup);

  it('the select of the card is the same height of markup with one part, with several and with all', () => {
    render(<CamArrange />);
    const one = screen.getByTestId('cam-color').outerHTML.length;
    act(() => cam().selectAll());
    const all = screen.getByTestId('cam-color').outerHTML.length;
    // (the same field – the only difference is the word of the choice that is shown)
    expect(Math.abs(one - all)).toBeLessThan(40);
    expect(screen.getAllByTestId('cam-color')).toHaveLength(1);
  });
});

describe('what the log says of a colour a file could not give', () => {
  it('names the colour and the value in words; a whole table as "Farben"; a setting as before', () => {
    expect(droppedName('colors.a.depth')).toBe('Farbe A: Tiefe (mm)');
    expect(droppedName('colors.b.engraveDepth')).toBe('Farbe B: Gravurtiefe (mm)');
    expect(droppedName('colors.c.climb')).toBe('Farbe C: Laufrichtung');
    expect(droppedName('colors.d.toolId')).toBe('Farbe D: Werkzeug');
    expect(droppedName('colors.a.tabs')).toBe('Farbe A: Stege');
    expect(droppedName('colors.a.tabs.count')).toBe('Farbe A: Anzahl Stege');
    expect(droppedName('colors.a.tabs.width')).toBe('Farbe A: Stegbreite (mm)');
    expect(droppedName('colors.a.tabs.height')).toBe('Farbe A: Steghöhe (mm)');
    // an entry that is none: the colour's own name
    expect(droppedName('colors.a')).toBe('Farbe A, Orange');
    // the table as a whole, a colour there is not
    expect(droppedName('colors')).toBe(t('cam.colors.droppedTable'));
    expect(droppedName('colors.z.depth')).toBe(t('cam.colors.droppedTable'));
    // a cutting setting as ever
    expect(droppedName('depth')).toBe(t('cam.depth'));
    expect(droppedName('tabs')).toBe(t('cam.tabCount'));
    expect(droppedName('colors.a.something')).toBe('Farbe A, Orange');
  });
});

describe('opening a project file whose peck was left out', () => {
  beforeEach(() => {
    scene();
    openCam();
    useUi.setState({ depth: {} });
  });
  afterEach(() => {
    cleanup();
    resetTools();
  });

  it('says so in a message of its own – the peck is gone, it is no setting that stays as it is now', async () => {
    // a hole the cutter drills straight (6 mm), a peck of 0.05 mm: 500 mm would be ten thousand passes
    cam().addSketch({ type: 'circle', d: 6 });
    const hole = items()[0]!;
    cam().setItem(hole.id, { kind: 'drill', depth: 40 });
    cam().setPath(hole.id, { peck: 0.05, peckRetract: 1 });
    const file = JSON.parse(cam().saveProject()!);
    file.items[0].depth = 500;
    const text = JSON.stringify(file);
    cam().close();
    // (an empty drawing again – the file is opened from the card that is there with nothing drawn)
    openCam();
    useMachine.setState({ log: [] });
    render(<CamCard />);
    const input = screen.getByTestId('cam-project-file');
    fireEvent.change(input, {
      target: { files: [{ size: text.length, text: () => Promise.resolve(text) }] },
    });
    await vi.waitFor(() =>
      expect(useMachine.getState().log.some((l) => l.key === 'cam.project.pecksDropped')).toBe(
        true,
      ),
    );
    const log = useMachine.getState().log;
    const said = log.find((l) => l.key === 'cam.project.pecksDropped')!;
    expect(said.text).toBe(t('cam.project.pecksDropped', { list: 'Teil 1' }));
    expect(said.text).not.toContain(t('cam.project.settingsDropped', { list: '' }).slice(-30));
    // nothing else was dropped: the message about settings that stay is not there
    expect(log.some((l) => l.key === 'cam.project.settingsDropped')).toBe(false);
  });
});
