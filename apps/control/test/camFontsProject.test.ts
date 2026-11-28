import { readFileSync } from 'node:fs';
import { FONT_IDS, textContours, type FontId, type Sketch } from '@lowrider/cam';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseProject, PROJECT_VERSION } from '../src/lib/camProject';
import { useCam } from '../src/store/cam';
import { useFlip } from '../src/store/flip';
import { useJob } from '../src/store/job';
import { useMachine } from '../src/store/machine';
import { useRun } from '../src/store/run';
import { useWorkshop } from '../src/store/workshop';
import '../src/store/underway';

const cam = () => useCam.getState();
const items = () => cam().project!.items;
const program = () => useJob.getState().lines.join('\n');
const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const sketchOf = (i: number) => items()[i]!.sketch as Sketch & { type: 'text' };

const TEXT: Sketch = {
  type: 'text',
  text: 'Größe 5',
  height: 12,
  spacing: 0,
  lineSpacing: 1.6,
  align: 'center',
};

function scene() {
  cam().close();
  useJob.getState().unload();
  useFlip.getState().cancel();
  useRun.getState().reset();
  useMachine.setState({ fileJob: null, stream: null, lostInJob: null });
  cam().setSettings({ toolId: 't2', depth: 6, allowance: 0, engraveDepth: 1, climb: true });
  useWorkshop.getState().setSetup({ stock: null, fixtures: [], fixtureFrame: 'machine' });
}

/** The saved file of the drawing, changed by `edit` (a damaged or unusual file) */
function filed(edit: (file: { items: Record<string, any>[] }) => void): string {
  const file = JSON.parse(cam().saveProject()!);
  edit(file);
  return JSON.stringify(file);
}

describe('the face of a text in a project file', () => {
  beforeEach(scene);

  for (const font of FONT_IDS) {
    it(`keeps a text in the face "${font}": saved, read, and the same program – byte for byte`, () => {
      cam().addSketch({ ...TEXT, ...(font === 'standard' ? {} : { font }) });
      const before = program();
      expect(before).not.toBe('');
      const text = cam().saveProject()!;
      const saved = JSON.parse(text).items[0];
      if (font === 'standard') {
        // the standard face is no key – in the sketch and in the style
        expect(saved.sketch).not.toHaveProperty('font');
        expect(saved.textStyle.options).not.toHaveProperty('font');
      } else {
        expect(saved.sketch.font).toBe(font);
        expect(saved.textStyle.options.font).toBe(font);
        expect(Object.keys(saved.sketch).at(-1)).toBe('font');
      }
      const was = items()[0]!;
      cam().close();
      useJob.getState().unload();
      expect(cam().openProject(text)).toEqual({ toolMissing: false });
      expect(sketchOf(0)).toEqual(was.sketch);
      expect(items()[0]!.textStyle).toEqual(was.textStyle);
      expect(items()[0]!.source).toEqual(was.source);
      expect(program()).toBe(before);
      // and saved again, the same file: every value of it (the keys of an item come in the order the reader writes them)
      const body = (s: string) => {
        const file = JSON.parse(s);
        delete file.savedAt;
        return file;
      };
      expect(body(cam().saveProject()!)).toEqual(body(text));
    });
  }

  it('keeps the version: an older app reads the file, drops the key and shows the standard face', () => {
    expect(PROJECT_VERSION).toBe(1);
    cam().addSketch({ ...TEXT, font: 'script' });
    expect(JSON.parse(cam().saveProject()!).version).toBe(1);
  });

  it('keeps the faces of several texts in one drawing', () => {
    cam().addSketch({ ...TEXT, text: 'Eins', font: 'simplex' });
    cam().addSketch({ ...TEXT, text: 'Zwei' });
    cam().addSketch({ ...TEXT, text: 'Drei', font: 'modern' });
    const before = program();
    const text = cam().saveProject()!;
    cam().close();
    useJob.getState().unload();
    cam().openProject(text);
    expect(items().map((i) => (i.sketch as { font?: string }).font)).toEqual([
      'simplex',
      undefined,
      'modern',
    ]);
    expect(program()).toBe(before);
  });

  it('reads a file of before the faces as it was – the old fixtures give their programs', () => {
    expect(cam().openProject(fixture('oldSingle.lowrider.json'))).toEqual({ toolMissing: false });
    expect(program()).toBe(fixture('oldSingle.nc'));
    cam().close();
    useJob.getState().unload();
    cam().openProject(fixture('oldTwoSided.lowrider.json'));
    expect(program()).toBe(fixture('oldTwoSided.nc'));
    expect(useFlip.getState().plan?.back.text).toBe(fixture('oldTwoSidedBack.nc'));
  });

  describe('a file that is damaged or unusual', () => {
    beforeEach(() => {
      cam().addSketch({ ...TEXT, font: 'script' });
    });
    const read = (text: string) => {
      const opened = parseProject(text);
      expect('error' in opened).toBe(false);
      if ('error' in opened) throw new Error(opened.error);
      expect(opened.project.items).toHaveLength(1);
      return opened.project.items[0]!;
    };

    // a face this app does not know, or a value that is none
    const BAD: [string, unknown][] = [
      ['a face of a newer app', 'serif'],
      ['a wrong case', 'Standard'],
      ['an empty string', ''],
      ['a name that is on every object', 'toString'],
      ['a number', 7],
      ['null', null],
      ['an array', ['script']],
      ['an object', { id: 'script' }],
    ];
    for (const [what, font] of BAD) {
      it(`drops the sketch for ${what} – the item keeps its contours and is cut as before`, () => {
        const before = program();
        const damaged = filed((f) => (f.items[0]!.sketch.font = font));
        const item = read(damaged);
        expect(item.sketch).toBeUndefined();
        // (with no style beside it to disagree with: the sketch is judged by its own face – the older reading of a text
        // must not take it for the standard one)
        const alone = read(
          filed((f) => {
            f.items[0]!.sketch.font = font;
            delete f.items[0]!.textStyle;
          }),
        );
        expect(alone.sketch).toBeUndefined();
        // the strokes are the ones that were saved: nothing is made anew from a face that is not known
        expect(item.source).toEqual(items()[0]!.source);
        // …and the file still opens whole and cuts exactly what it did
        cam().close();
        useJob.getState().unload();
        expect(cam().openProject(damaged)).toEqual({ toolMissing: false });
        expect(items()).toHaveLength(1);
        expect(items()[0]!.sketch).toBeUndefined();
        expect(program()).toBe(before);
      });

      it(`drops the style too where the sketch's face is ${what} and the style names a face that is known – the face of the strokes is not known, so no series writes in another`, () => {
        // (the sketch was refused above; the style beside it names the face "modern", "script" – as the text was made – or none)
        for (const style of ['modern', 'script', undefined]) {
          const item = read(
            filed((f) => {
              f.items[0]!.sketch.font = font;
              if (style === undefined) delete f.items[0]!.textStyle.options.font;
              else f.items[0]!.textStyle.options.font = style;
            }),
          );
          expect(item.sketch, String(style)).toBeUndefined();
          expect(item.textStyle, String(style)).toBeUndefined();
          // the words and the strokes are what they were
          expect(item.text).toBe('Größe 5');
          expect(item.source).toEqual(items()[0]!.source);
        }
      });

      it(`drops the style of a series for ${what}, and still the sketch of the same face is judged alone`, () => {
        const item = read(
          filed((f) => {
            f.items[0]!.textStyle.options.font = font;
          }),
        );
        expect(item.textStyle).toBeUndefined();
        // (it also disagrees with nothing: a sketch is dropped for a bad face of its own, not for this)
        expect(item.sketch?.type).toBe('text');
      });
    }

    it('does not take the older reading for a text that names a face: a bad face is no "older sketch"', () => {
      // the older reading of a text drops the key and would take the face for the standard one – and then
      // `textContours` would never see a face that is none. A height beyond what `validateSketch` takes is the case
      // the older reading is there for.
      const huge = read(
        filed((f) => {
          f.items[0]!.sketch.height = 9000;
          delete f.items[0]!.sketch.font;
          delete f.items[0]!.textStyle.options.font;
        }),
      );
      expect(huge.sketch).toMatchObject({ type: 'text', height: 9000 });
      const named = read(
        filed((f) => {
          f.items[0]!.sketch.height = 9000;
          f.items[0]!.sketch.font = 'script';
        }),
      );
      expect(named.sketch).toBeUndefined();
    });

    it('reads the standard face written out as the one canonical form: no key', () => {
      const item = read(
        filed((f) => {
          f.items[0]!.sketch.font = 'standard';
          f.items[0]!.textStyle.options.font = 'standard';
        }),
      );
      // (the face of the text lies in its strokes: this file says "standard" for strokes made in the script
      // face – the file is trusted for its contours, the sketch makes them anew when it is edited)
      expect(item.sketch).not.toHaveProperty('font');
      expect(item.textStyle!.options).not.toHaveProperty('font');
    });

    it('keeps the sketch and drops the style when the style is damaged – the face is read alone for each', () => {
      const item = read(
        filed((f) => {
          f.items[0]!.textStyle.options.height = 'tall';
        }),
      );
      expect(item.textStyle).toBeUndefined();
      expect((item.sketch as { font?: FontId }).font).toBe('script');
    });

    it('drops both where the sketch and the style name different faces – a series must never set a name in a face the drawing does not show', () => {
      const item = read(
        filed((f) => {
          f.items[0]!.textStyle.options.font = 'modern';
        }),
      );
      expect(item.sketch).toBeUndefined();
      expect(item.textStyle).toBeUndefined();
      // the words and the strokes are kept
      expect(item.text).toBe('Größe 5');
      expect(item.source.length).toBeGreaterThan(0);
      // one that names a face and one that names none are different faces as well …
      const standard = read(
        filed((f) => {
          delete f.items[0]!.textStyle.options.font;
        }),
      );
      expect(standard.sketch).toBeUndefined();
      expect(standard.textStyle).toBeUndefined();
      // … and the same face on both is the normal case
      const same = read(filed(() => {}));
      expect(same.sketch).toMatchObject({ font: 'script' });
      expect(same.textStyle!.options.font).toBe('script');
    });

    it('never lets a face that is none reach the layout through the style of a series', () => {
      // however the file spells it, the style a series uses holds a face the library knows – or no style
      for (const [, font] of BAD) {
        const item = read(filed((f) => (f.items[0]!.textStyle.options.font = font)));
        const face = item.textStyle?.options.font;
        expect(face === undefined || (FONT_IDS as readonly string[]).includes(face)).toBe(true);
      }
      // and the layout reads an id that is none as the standard face rather than failing
      expect(() => textContours('A', { height: 10, font: 'serif' as FontId })).not.toThrow();
    });
  });
});
