// @vitest-environment jsdom
import { FONT_IDS, type Sketch } from '@lowrider/cam';
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
import { useWorkshop } from '../src/store/workshop';

// jsdom has no observers; the segmented controls want them
class Quiet {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', Quiet);

const cam = () => useCam.getState();
const items = () => cam().project!.items;
const program = () => useJob.getState().lines.join('\n');
const sketch = () => items()[0]!.sketch as Sketch & { type: 'text' };
const button = (name: string) => screen.getByRole('button', { name });
const select = () => screen.getByLabelText(t('cam.text.font')) as HTMLSelectElement;
const words = () => screen.getByTestId('cam-text') as HTMLTextAreaElement;
const warning = () => screen.queryByTestId('cam-text-missing');
const type = (value: string) => fireEvent.change(words(), { target: { value } });
const pick = (face: string) => fireEvent.change(select(), { target: { value: face } });
const before = (a: Element, b: Element) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

function scene() {
  cam().close();
  useJob.getState().unload();
  useFlip.getState().cancel();
  cam().setSettings({ toolId: 't2', depth: 6, allowance: 0, engraveDepth: 1 });
  useWorkshop.getState().setSetup({ stock: null, fixtures: [], fixtureFrame: 'machine' });
  useUi.getState().setDepth('camShapes', 'simple');
  openCam();
}

describe('the block "Schrift" of a selected text', () => {
  beforeEach(scene);
  afterEach(cleanup);

  it('has the words, the face and the height together – at the top of the card, above the switches', () => {
    render(<CamCard />);
    fireEvent.click(button(t('cam.shapes.text')));
    const block = screen.getByTestId('cam-text-block');
    // the words, the face (names only) and the height are all in it …
    expect(within(block).getByTestId('cam-text')).toBe(words());
    expect(block.contains(select())).toBe(true);
    expect(block.contains(screen.getByLabelText(t('cam.text.height')))).toBe(true);
    expect([...select().options].map((o) => o.textContent)).toEqual(
      FONT_IDS.map((id) => t(`cam.text.fonts.${id}`)),
    );
    expect([...select().options].map((o) => o.textContent)).toEqual([
      'Standard',
      'Einfach',
      'Schreibschrift',
      'Modern',
    ]);
    expect(select().value).toBe('standard');
    // … and it comes before the switches and the buttons of the selection
    const card = screen.getByTestId('cam-arrange');
    expect(card.firstElementChild!.contains(screen.getByTestId('cam-selected'))).toBe(true);
    for (const later of [
      screen.getByTestId('cam-multi'),
      screen.getByTestId('cam-marquee'),
      screen.getByRole('button', { name: t('cam.arrange.all') }),
      screen.getByRole('button', { name: t('cam.arrange.duplicate') }),
    ]) {
      expect(before(block, later)).toBe(true);
    }
    // the height is no longer in the generic grid of numbers
    expect(screen.getAllByLabelText(t('cam.text.height'))).toHaveLength(1);
    // the spacing and the lines are folded away, and are still there to be opened
    const more = screen.getByTestId('cam-text-more');
    expect(more.querySelector('[data-fold-trigger]')!.getAttribute('aria-expanded')).toBe('false');
    expect(within(more).getByLabelText(t('cam.text.spacing'))).not.toBeNull();
    expect(within(more).getByLabelText(t('cam.text.lineSpacing'))).not.toBeNull();
    expect(block.contains(more)).toBe(true);
  });

  it('adds a text in the standard face exactly as before – no key for it', () => {
    render(<CamCard />);
    fireEvent.click(button(t('cam.shapes.text')));
    expect(sketch()).toEqual({
      type: 'text',
      text: 'Text',
      height: 20,
      spacing: 0,
      lineSpacing: 1.6,
      align: 'center',
    });
    expect('font' in sketch()).toBe(false);
  });

  it('puts a face on the text with one pick – one step of undo – and the table follows', () => {
    render(<CamCard />);
    fireEvent.click(button(t('cam.shapes.text')));
    const standard = program();
    const steps = cam().past.length;
    pick('script');
    expect(sketch().font).toBe('script');
    expect(select().value).toBe('script');
    expect(program()).not.toBe(standard);
    expect(cam().past.length).toBe(steps + 1);
    act(() => cam().undo());
    // the select and the drawing are back where they were – and so is the program, byte for byte
    expect(select().value).toBe('standard');
    expect('font' in sketch()).toBe(false);
    expect(program()).toBe(standard);
    act(() => cam().redo());
    expect(select().value).toBe('script');
    // picking the standard face again leaves no key
    pick('standard');
    expect('font' in sketch()).toBe(false);
    expect(program()).toBe(standard);
  });

  it('says what the typed words lack in the chosen face, and which face has it – before anything is stored', () => {
    render(<CamCard />);
    fireEvent.click(button(t('cam.shapes.text')));
    expect(warning()).toBeNull();
    type('A{');
    // `{` is not in the standard face: the A is engraved, the gap is named – with the way out
    expect(sketch().text).toBe('A{');
    expect(warning()!.textContent).toContain(
      t('cam.text.missing', { font: 'Standard', list: '{' }),
    );
    expect(warning()!.textContent).toContain(
      t('cam.text.elsewhere', { faces: 'Einfach, Schreibschrift, Modern' }),
    );
    // another face that has it: the warning is gone
    pick('simplex');
    expect(warning()).toBeNull();
    // and back: it is there again, from the typed words and the face chosen – not from what was stored
    pick('standard');
    expect(warning()!.textContent).toContain('{');
  });

  it('shows the warning for a text of nothing but missing characters, and says what stays engraved', () => {
    render(<CamCard />);
    fireEvent.click(button(t('cam.shapes.text')));
    const engraved = program();
    type('☺');
    // nothing is stored for it: the text that was there is still engraved – and the warning says so, with its face
    expect(sketch().text).toBe('Text');
    expect(program()).toBe(engraved);
    const note = warning()!;
    expect(note.textContent).toContain(
      t('cam.text.nothing', { font: 'Standard', kept: 'Standard', list: '☺' }),
    );
    // no face has a smiley: said so
    expect(note.textContent).toContain(t('cam.text.nowhere'));
    // the field shows what was typed
    expect(words().value).toBe('☺');
    // typing something that can be engraved takes the warning away and stores the words
    type('Ok');
    expect(warning()).toBeNull();
    expect(sketch().text).toBe('Ok');
  });

  it('takes the typed words along when a face is picked that can write them – the way out', () => {
    render(<CamCard />);
    fireEvent.click(button(t('cam.shapes.text')));
    type('{}');
    expect(sketch().text).toBe('Text');
    expect(warning()!.textContent).toContain(
      t('cam.text.elsewhere', { faces: 'Einfach, Schreibschrift, Modern' }),
    );
    const steps = cam().past.length;
    pick('simplex');
    // the words and the face go in together: one step
    expect(sketch()).toMatchObject({ text: '{}', font: 'simplex' });
    expect(cam().past.length).toBe(steps + 1);
    expect(warning()).toBeNull();
    expect(words().value).toBe('{}');
  });

  it('keeps a face that cannot write the words where it was: the select shows the pick, the note the reason', () => {
    cam().addText('{}', { height: 12, font: 'simplex' });
    render(<CamCard />);
    expect(select().value).toBe('simplex');
    const steps = cam().past.length;
    pick('standard');
    // nothing was changed – the select shows the pick (it does not bounce back in silence) and the note says why and
    // what is engraved
    expect(select().value).toBe('standard');
    expect(sketch().font).toBe('simplex');
    expect(cam().past.length).toBe(steps);
    expect(warning()!.textContent).toContain(
      t('cam.text.nothing', { font: 'Standard', kept: 'Einfach', list: '{ }' }),
    );
    // picking the face it is in again takes the note away, and stores nothing
    pick('simplex');
    expect(select().value).toBe('simplex');
    expect(warning()).toBeNull();
    expect(cam().past.length).toBe(steps);
  });

  it('puts the note below the fields, so none of them moves when it comes and goes', () => {
    render(<CamCard />);
    fireEvent.click(button(t('cam.shapes.text')));
    type('A☺');
    const note = warning()!;
    for (const field of [words(), select(), screen.getByLabelText(t('cam.text.height'))]) {
      expect(before(field, note)).toBe(true);
    }
    // the fold of the spacing comes after it – it is no field of the "every time" block
    expect(before(note, screen.getByTestId('cam-text-more'))).toBe(true);
  });

  it('changes the height without touching the face, as a field of its own', () => {
    render(<CamCard />);
    fireEvent.click(button(t('cam.shapes.text')));
    pick('modern');
    fireEvent.change(screen.getByLabelText(t('cam.text.height')), { target: { value: '30' } });
    expect(sketch()).toMatchObject({ height: 30, font: 'modern' });
  });

  it('follows an undo of the words and of the face under the fields', () => {
    render(<CamCard />);
    fireEvent.click(button(t('cam.shapes.text')));
    type('Eins');
    pick('script');
    expect(words().value).toBe('Eins');
    act(() => cam().undo());
    expect(select().value).toBe('standard');
    expect(words().value).toBe('Eins');
    act(() => cam().undo());
    expect(words().value).toBe('Text');
  });

  it('is where the quick search leads for the face: the select with a text selected, else the card of the drawing', () => {
    const anchors = COMMANDS.find((c) => c.id === 'textFont')!.anchor;
    const first = () =>
      anchors.find((a) => document.querySelector(`[data-find~="${a}"]`) !== null) ?? 'nothing';
    const view = render(<CamCard />);
    expect(first()).toBe('cam-draw');
    fireEvent.click(button(t('cam.shapes.text')));
    expect(first()).toBe('text-font');
    expect(document.querySelector('[data-find~="text-font"]')!.contains(select())).toBe(true);
    view.unmount();
  });
});

describe('what a text needs is brought into view where the panel lies before it', () => {
  const into = vi.fn();
  let fieldsTop = 100;
  let noteTop = 100;
  const rect = (top: number, height: number) =>
    ({ top, bottom: top + height, height, left: 0, right: 0, width: 0, x: 0, y: top }) as DOMRect;
  const panel = () => (
    <div className="panel-body">
      <CamCard />
    </div>
  );
  const tile = () => fireEvent.click(button(t('cam.shapes.text')));
  beforeEach(() => {
    scene();
    into.mockClear();
    fieldsTop = 100;
    noteTop = 100;
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: into });
    // The panel shows 0 … 300, the way back of the workspace covers its top 50; the rest is where the test says
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      if (this.classList.contains('panel-body')) return rect(0, 300);
      if (this.classList.contains('workspace-head')) return rect(0, 50);
      const id = (this as HTMLElement).dataset?.testid;
      if (id === 'cam-text-fields') return rect(fieldsTop, 200);
      if (id === 'cam-text-missing') return rect(noteTop, 46);
      return rect(0, 0);
    });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('the words, the face and the height, for the tile "Text": only where they lie out of sight, and the focus does not scroll alone', () => {
    const focus = vi.spyOn(HTMLTextAreaElement.prototype, 'focus');
    const view = render(panel());
    // in the visible part (100 … 300): nothing moves
    tile();
    expect(into).not.toHaveBeenCalled();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    view.unmount();
    cam().close();
    openCam();
    // below the fold (280 … 480 of 300): the block is brought in, by the least that does it
    fieldsTop = 280;
    render(panel());
    tile();
    expect(into).toHaveBeenCalledTimes(1);
    expect(into).toHaveBeenCalledWith({ block: 'nearest' });
    expect(into.mock.contexts[0]).toBe(screen.getByTestId('cam-text-fields'));
  });

  it('under the way back of the workspace counts as out of sight too', () => {
    fieldsTop = 20;
    render(panel());
    tile();
    expect(into).toHaveBeenCalledTimes(1);
  });

  it('not for a text taken up by a tap on its row (the row stays where the finger put it), nor for one that has a note', () => {
    render(panel());
    tile();
    type('A☺');
    expect(warning()).not.toBeNull();
    into.mockClear();
    // a plate takes the selection, then the text is taken up again: the block and its note show for the first time
    fieldsTop = 280;
    noteTop = 330;
    act(() => cam().addSketch({ type: 'rect', w: 60, h: 40, r: 0 }));
    expect(screen.queryByTestId('cam-text-block')).toBeNull();
    fireEvent.click(
      screen
        .getAllByRole('button', { name: /Text/ })
        .find((b) => b.className.includes('cam-name'))!,
    );
    expect(words().value).toBe('A☺');
    expect(warning()).not.toBeNull();
    expect(into).not.toHaveBeenCalled();
  });

  it('the note: when it comes or changes its kind, where it lies out of sight – and not again for more of the same', () => {
    render(panel());
    tile();
    expect(warning()).toBeNull();
    // it comes (below the fold)
    noteTop = 320;
    type('Hallo ☺');
    expect(into).toHaveBeenCalledTimes(1);
    expect(into.mock.contexts[0]).toBe(warning());
    // another character of the same kind: the note stays, the panel is not moved again
    type('Hallo ☺☺');
    expect(into).toHaveBeenCalledTimes(1);
    // it changes its kind (nothing is left to cut): the other note is brought in
    type('☺');
    expect(warning()!.hasAttribute('data-nothing')).toBe(true);
    expect(into).toHaveBeenCalledTimes(2);
    // gone and back: brought in again
    type('Hallo');
    expect(warning()).toBeNull();
    type('Hallo ☺');
    expect(into).toHaveBeenCalledTimes(3);
  });

  it('the note in the visible part does not move the panel', () => {
    render(panel());
    tile();
    noteTop = 100;
    type('Hallo ☺');
    expect(warning()).not.toBeNull();
    expect(into).not.toHaveBeenCalled();
  });
});
