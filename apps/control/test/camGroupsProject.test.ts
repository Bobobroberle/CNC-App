import { rectangle } from '@lowrider/cam';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  parseProject,
  PROJECT_VERSION,
  projectToFile,
  projectVersion,
} from '../src/lib/camProject';
import { useWorkshop } from '../src/store/workshop';
import { cam, changes, items, program, resetTools, scene, VBIT } from './camToolsFixtures';

let plate = 0;
let text = 0;
function drawing() {
  scene();
  cam().add([rectangle(0, 0, 40, 30)]);
  cam().addText('Hi', { height: 8 });
  [plate, text] = items().map((i) => i.id) as [number, number];
  cam().select(null);
}
const saved = () => JSON.parse(cam().saveProject()!);
const result = (file: unknown) =>
  parseProject(typeof file === 'string' ? file : JSON.stringify(file));
const error = (file: unknown) => {
  const parsed = result(file);
  return 'error' in parsed ? parsed.error : null;
};
const colors = () => cam().project!.colors;

/** A file of the drawing with colour A on the plate (a depth and a direction) and the text on the V-bit's colour B */
function coloured() {
  cam().setColor('a', [plate]);
  cam().setColorValue('a', { depth: 3, climb: false, tabs: { count: 2 } });
  cam().setColor('b', [text]);
  cam().setColorValue('b', { engraveDepth: 0.5, toolId: 'v1' });
  return saved();
}

describe('the version of a file is a function of what is in it – colours included', () => {
  beforeEach(drawing);

  it('a drawing with no colour is written exactly as it always was: version 1, the same keys', () => {
    const file = saved();
    expect(file.version).toBe(PROJECT_VERSION);
    expect(Object.keys(file)).toEqual([
      'format',
      'version',
      'savedAt',
      'name',
      'twoSided',
      'items',
      'settings',
      'toolDiameter',
    ]);
    expect(file.items.some((i: object) => 'color' in i)).toBe(false);
    expect(projectVersion(cam().project!)).toBe(1);
  });

  it('every combination: neither → 1, a colour or a table or a cutter → 2', () => {
    // a part with a colour that sets nothing: a colour is in use – an older build would drop the grouping
    cam().setColor('a', [plate]);
    expect(saved().version).toBe(2);
    expect(saved()).not.toHaveProperty('colors');
    // a colour that sets something: the table is written
    cam().setColorValue('a', { depth: 3 });
    const file = saved();
    expect(file.version).toBe(2);
    expect(file.colors).toEqual({ a: { depth: 3 } });
    expect(file.items.find((i: { id: number }) => i.id === plate).color).toBe('a');
    expect(file.items.find((i: { id: number }) => i.id === text)).not.toHaveProperty('color');
    // colours and a cutter of a part together
    cam().setItem(text, { toolId: 'v1' });
    expect(saved().version).toBe(2);
    expect(saved().toolDiameters).toEqual({ v1: 3 });
    // a cutter of a part alone (the colour taken away): 2 as before
    cam().setColor(null, [plate]);
    expect(saved().version).toBe(2);
    expect(saved()).not.toHaveProperty('colors');
    // neither: back to version 1, with nothing left of the second
    cam().setItem(text, { toolId: undefined });
    const back = saved();
    expect(back.version).toBe(1);
    expect(back).not.toHaveProperty('colors');
    expect(back).not.toHaveProperty('toolDiameters');
  });

  it('the helper decides on the project alone: a part’s colour, a table that says something, a part’s cutter', () => {
    const project = cam().project!;
    const [first] = project.items;
    expect(projectVersion({ items: project.items })).toBe(1);
    expect(projectVersion({ items: project.items, colors: {} })).toBe(1);
    expect(projectVersion({ items: project.items, colors: { a: {} } })).toBe(1);
    expect(projectVersion({ items: project.items, colors: { a: { depth: 3 } } })).toBe(2);
    expect(projectVersion({ items: [{ ...first!, color: 'd' }] })).toBe(2);
    expect(projectVersion({ items: [{ ...first!, toolId: 't3' }] })).toBe(2);
    expect(projectVersion({ items: [{ ...first!, toolId: 't3', color: 'b' }] })).toBe(2);
  });

  it('what is written says nothing the table does not: an entry that says nothing is left out', () => {
    cam().setColor('a', [plate]);
    const at = new Date(0);
    const file = projectToFile(
      { ...cam().project!, colors: { a: {}, b: { depth: 2 } } },
      cam().settings,
      at,
    );
    expect(file.colors).toEqual({ b: { depth: 2 } });
    expect(
      projectToFile({ ...cam().project!, colors: { a: {} } }, cam().settings, at),
    ).not.toHaveProperty('colors');
  });
});

describe('colours make a round trip', () => {
  beforeEach(drawing);

  it('opened again it is the same drawing, the same table and the same program, byte for byte', () => {
    const file = JSON.stringify(coloured());
    const made = program();
    expect(changes()).toHaveLength(2);
    drawing();
    expect(program()).not.toBe(made);
    expect(cam().openProject(file)).toEqual({ toolMissing: false });
    expect(colors()).toEqual({
      a: { depth: 3, climb: false, tabs: { count: 2 } },
      b: { engraveDepth: 0.5, toolId: 'v1' },
    });
    expect(items().map((i) => i.color)).toEqual(['a', 'b']);
    expect(program()).toBe(made);
    const again = saved();
    const first = JSON.parse(file);
    delete again.savedAt;
    delete first.savedAt;
    expect(again).toEqual(first);
  });

  it('is one step of undo that brings the colours of the drawing before back – or none', () => {
    coloured();
    const before = colors();
    const made = program();
    const open = JSON.stringify(saved());
    // a file without colours: the table is replaced by none …
    cam().openProject(
      JSON.stringify({
        ...saved(),
        version: 1,
        colors: undefined,
        items: saved().items.map(
          ({ color: _c, toolId: _t, ...rest }: Record<string, unknown>) => rest,
        ),
      }),
    );
    expect(colors()).toBeUndefined();
    expect(items().some((i) => i.color !== undefined)).toBe(false);
    cam().undo();
    expect(colors()).toEqual(before);
    expect(program()).toBe(made);
    // … and a file with colours replaces none by its own, and undo gives back none
    cam().clear();
    cam().openProject(open);
    expect(colors()).toEqual(before);
    cam().undo();
    expect(colors()).toBeUndefined();
  });

  it('a table that names a colour no part carries is left with the ones in use', () => {
    const file = coloured();
    file.colors.c = { depth: 9 };
    cam().openProject(JSON.stringify(file));
    expect(Object.keys(colors()!)).toEqual(['a', 'b']);
  });
});

describe('a part’s colour is read strictly', () => {
  beforeEach(drawing);
  const withItem = (patch: object) => {
    const file = coloured();
    file.items = file.items.map((i: { id: number }) => (i.id === plate ? { ...i, ...patch } : i));
    return file;
  };

  it('takes A to D and nothing else', () => {
    for (const color of ['a', 'b', 'c', 'd']) expect(error(withItem({ color })), color).toBeNull();
    for (const color of ['e', 'A', 'ab', '', 0, 1, null, true, [], {}, 'a\n']) {
      expect(error(withItem({ color })), JSON.stringify(color)).toBe('invalid-project');
    }
  });

  it('refuses a registration hole with a colour: there are two, drilled with the drawing’s cutter', () => {
    cam().setTwoSided({});
    const file = saved();
    const hole = file.items.find((i: { registration?: number }) => i.registration !== undefined);
    expect(hole).toBeDefined();
    file.items = file.items.map((i: object) => (i === hole ? { ...i, color: 'a' } : i));
    expect(error(file)).toBe('invalid-project');
  });

  it('is whole or nothing: a file with one broken colour opens nothing and leaves the drawing as it was', () => {
    const file = coloured();
    const made = program();
    const steps = cam().past.length;
    const before = colors();
    file.items.push({ ...file.items[0], id: 999, group: 999, color: 'z' });
    expect(cam().openProject(JSON.stringify(file))).toEqual({ error: 'invalid-project' });
    expect(items().map((i) => i.id)).toEqual([plate, text]);
    expect(colors()).toBe(before);
    expect(program()).toBe(made);
    expect(cam().past.length).toBe(steps);
  });
});

describe('the table is read like the cutting settings: what is out of range is left out, and said', () => {
  beforeEach(drawing);
  const open = (table: unknown) => {
    const file = coloured();
    file.colors = table;
    return result(file);
  };
  const read = (table: unknown) => {
    const parsed = open(table);
    if ('error' in parsed) throw new Error(parsed.error);
    return parsed;
  };

  it('keeps what is right and says what is not – the file is not refused for it', () => {
    const parsed = read({
      a: {
        depth: 0,
        engraveDepth: 501,
        climb: 'yes',
        toolId: '',
        tabs: { count: 2.5, width: 0.01, height: 501 },
      },
      b: { depth: 2, tabs: { count: 3, width: 7, height: 1 } },
    });
    expect(parsed.project.colors).toEqual({
      b: { depth: 2, tabs: { count: 3, width: 7, height: 1 } },
    });
    expect(parsed.dropped).toEqual([
      'colors.a.depth',
      'colors.a.engraveDepth',
      'colors.a.climb',
      'colors.a.toolId',
      'colors.a.tabs.count',
      'colors.a.tabs.width',
      'colors.a.tabs.height',
    ]);
  });

  it('the bounds are those of the fields: the ends are in, a hair beyond is out', () => {
    const parsed = read({
      a: { depth: 0.01, engraveDepth: 500, tabs: { count: 0, width: 0.1, height: 500 } },
      b: { depth: 500.01, engraveDepth: 0.009, tabs: { count: 51 } },
    });
    expect(parsed.project.colors).toEqual({
      a: { depth: 0.01, engraveDepth: 500, tabs: { count: 0, width: 0.1, height: 500 } },
    });
    expect(parsed.dropped).toEqual([
      'colors.b.depth',
      'colors.b.engraveDepth',
      'colors.b.tabs.count',
    ]);
  });

  it('numbers that are none, an id that is none, a tabs that is no object', () => {
    const parsed = read({
      a: { depth: 'deep', engraveDepth: null, climb: 1, toolId: 7, tabs: 'many' },
      b: { toolId: 'x'.repeat(121) },
      c: { toolId: 'a\nb' },
      d: { depth: 2, tabs: { count: '2', width: Infinity } },
    });
    expect(parsed.project.colors).toEqual({ d: { depth: 2 } });
    expect(parsed.dropped).toEqual([
      'colors.a.depth',
      'colors.a.engraveDepth',
      'colors.a.climb',
      'colors.a.toolId',
      'colors.a.tabs',
      'colors.b.toolId',
      'colors.c.toolId',
      'colors.d.tabs.count',
      'colors.d.tabs.width',
    ]);
  });

  it('a table or an entry of the wrong kind, a colour there is not: said as a whole, and read as none', () => {
    for (const table of ['x', 5, null, [], true]) {
      const parsed = read(table);
      expect(parsed.project.colors, JSON.stringify(table)).toBeUndefined();
      expect(parsed.dropped, JSON.stringify(table)).toEqual(['colors']);
    }
    expect(read({ a: 'deep', b: [], c: null, d: { depth: 2 } }).dropped).toEqual([
      'colors.a',
      'colors.b',
      'colors.c',
    ]);
    const foreign = read({ e: { depth: 2 }, a: { depth: 3 }, __proto__: { depth: 1 } });
    expect(foreign.project.colors).toEqual({ a: { depth: 3 } });
    expect(foreign.dropped).toEqual(['colors']);
    expect(({} as Record<string, unknown>).depth).toBeUndefined();
    // a file that says no table at all says nothing of it
    const none = coloured();
    delete none.colors;
    const parsed = result(none);
    expect('error' in parsed).toBe(false);
    if (!('error' in parsed)) expect(parsed.dropped).toEqual([]);
  });

  it('is told to the store: the settings that were left out are named, and what is set stays', () => {
    const file = coloured();
    file.colors = { a: { depth: 0 }, b: { engraveDepth: 0.5 } };
    const opened = cam().openProject(JSON.stringify(file));
    expect(opened).toEqual({ toolMissing: false, dropped: ['colors.a.depth'] });
    expect(colors()).toEqual({ b: { engraveDepth: 0.5 } });
  });

  it('colours of a drawing that is pasted together by hand cannot make a project the reader refuses', () => {
    // the writer's ranges are the reader's: everything the setters take comes back
    cam().setColor('a', [plate]);
    cam().setColorValue('a', {
      depth: 9999,
      engraveDepth: -3,
      tabs: { count: 99, width: 0, height: 1e6 },
    });
    const parsed = result(cam().saveProject()!);
    expect('error' in parsed).toBe(false);
    if ('error' in parsed) return;
    expect(parsed.dropped).toEqual([]);
    expect(parsed.project.colors).toEqual(colors());
  });
});

describe('how deep a colour can make a cut is held like a part’s own depth', () => {
  beforeEach(drawing);

  it('a stepdown that would make more than 2000 passes for the depth of a colour is left out, as for a part’s', () => {
    const file = coloured();
    file.settings.stepdown = 0.01;
    // the deepest cut is the colour's 3 mm: 300 passes
    expect(cam().openProject(JSON.stringify(file))).toEqual({ toolMissing: false });
    expect(cam().settings.stepdown).toBe(0.01);
    cam().setSettings({ stepdown: 2 });
    file.colors.a.depth = 100;
    // 100 / 0.01 = 10000 passes
    expect(cam().openProject(JSON.stringify(file))).toEqual({
      toolMissing: false,
      dropped: ['stepdown'],
    });
    expect(cam().settings.stepdown).toBe(2);
    // a colour that no part carries does not count
    delete file.items.find((i: { id: number }) => i.id === plate).color;
    expect(cam().openProject(JSON.stringify(file))).toEqual({ toolMissing: false });
  });

  it('the drawing’s own depth and a part’s own are as ever (a file without colours reads as before)', () => {
    const file = saved();
    file.settings.stepdown = 0.01;
    file.items.find((i: { id: number }) => i.id === plate).depth = 100;
    expect(cam().openProject(JSON.stringify(file))).toEqual({
      toolMissing: false,
      dropped: ['stepdown'],
    });
  });

  it('a hole drilled in so many pecks that it would stall the drawing refuses the file – with the depth its colour gives it', () => {
    cam().addSketch({ type: 'circle', d: 4 });
    const hole = items().at(-1)!;
    cam().setItem(hole.id, { kind: 'drill' });
    cam().setColor('c', [hole.id]);
    cam().setColorValue('c', { depth: 150 });
    cam().setPath(hole.id, { peck: 0.5 });
    // 150 / 0.5 = 300 pecks: well
    const file = saved();
    expect(error(file)).toBeNull();
    // 150 / 0.05 = 3000 pecks: refused – the part has no depth of its own, the colour's is the one
    const own = () => file.items.find((i: { id: number }) => i.id === hole.id);
    own().peck = 0.05;
    expect(error(file)).toBe('invalid-project');
    // a depth of the part's own goes over the colour's: 6 / 0.05 = 120
    own().depth = 6;
    expect(error(file)).toBeNull();
    delete own().depth;
    // the same peck with the colour taken away is the drawing's 6 / 0.05 = 120
    delete own().color;
    delete file.colors;
    expect(error(file)).toBeNull();
  });
});

describe('the cutter of a colour is said like those of single parts', () => {
  beforeEach(drawing);

  it('is saved with its diameter, so that another tool list can say when it is another there', () => {
    coloured();
    expect(saved().toolDiameters).toEqual({ v1: 3 });
  });

  it('one this workshop has not stays chosen and is said; the parts are cut with the drawing’s meanwhile', () => {
    const file = JSON.stringify(coloured());
    const plain = (() => {
      cam().setColorValue('b', { toolId: undefined });
      return program();
    })();
    useWorkshop.getState().removeTool('v1');
    const opened = cam().openProject(file);
    expect(opened).toEqual({ toolMissing: false, partTools: { missing: ['v1'], differ: [] } });
    expect(colors()!.b!.toolId).toBe('v1');
    expect(cam().toolNotes.map((n) => n.code)).toEqual(['missing']);
    expect(program()).toBe(plain);
    // saved again it still names the tool, without a diameter that is not known here
    expect(saved().colors.b.toolId).toBe('v1');
    expect(saved()).not.toHaveProperty('toolDiameters');
    useWorkshop.getState().saveTool(VBIT);
    expect(changes()).toHaveLength(2);
    expect(cam().toolNotes).toEqual([]);
  });

  it('with another diameter here than in the file is said with both numbers', () => {
    const file = JSON.stringify(coloured());
    useWorkshop.getState().saveTool({ ...VBIT, diameter: 4 });
    expect(cam().openProject(file)).toEqual({
      toolMissing: false,
      partTools: { missing: [], differ: [{ id: 'v1', name: VBIT.name, file: 3, now: 4 }] },
    });
    resetTools();
  });

  it('a tool of a colour no part carries is not said (the colour is not in the drawing)', () => {
    const file = coloured();
    file.colors.d = { toolId: 'nowhere' };
    expect(cam().openProject(JSON.stringify(file))).toEqual({ toolMissing: false });
  });
});
