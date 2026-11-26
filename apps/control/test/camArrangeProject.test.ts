import { circle, rectangle } from '@lowrider/cam';
import { beforeEach, describe, expect, it } from 'vitest';
import { itemsBounds } from '../src/lib/camItems';
import { parseProject } from '../src/lib/camProject';
import { useCam } from '../src/store/cam';
import { useJob } from '../src/store/job';

const cam = () => useCam.getState();
const items = () => cam().project!.items;
const groups = () => items().map((i) => i.group);
const lefts = () => items().map((i) => itemsBounds([i])!.minX);

/**
 * Grouping needs no new format: a group is a whole number per thing, as it always was. A drawing with
 * groups made by hand comes back from its file with the same groups, and what is made afterwards starts
 * above every number of the file.
 */
describe('the project file with groups made by hand', () => {
  beforeEach(() => {
    cam().close();
    useJob.getState().unload();
    cam().setSettings({ toolId: 't2', depth: 6, allowance: 0, engraveDepth: 1 });
    // a file's two contours in one group, a part and a hole beside them
    cam().add([rectangle(0, 0, 10, 10), rectangle(20, 0, 10, 10)]);
    cam().add([rectangle(60, 0, 20, 20)]);
    cam().add([circle(100, 10, 8)]);
  });

  /** The drawing as the file says it, and then opened again from a closed state */
  const through = () => {
    const text = cam().saveProject()!;
    cam().close();
    expect('error' in (cam().openProject(text) as object)).toBe(false);
    return text;
  };

  it('keeps a group of several things and the groups made by grouping', () => {
    const [file, part, hole] = [items()[0]!.group, items()[2]!.group, items()[3]!.group];
    expect(groups()).toEqual([file, file, part, hole]);
    const text = through();
    expect(groups()).toEqual([file, file, part, hole]);
    expect(parseProject(text)).toMatchObject({ highestId: expect.any(Number) });

    // part and hole into one group, and back out of the file the same
    cam().select([part, hole]);
    cam().group();
    const joined = items()[2]!.group;
    expect(groups()).toEqual([file, file, joined, joined]);
    through();
    expect(groups()).toEqual([file, file, joined, joined]);
    // the group is one unit again: aligned together – the part (60…80) and the hole (Ø 8 at 100) end at
    // 104, so the file's contours (0…30) move by 74, and the two of the new group stay
    cam().select([file, joined]);
    cam().align('right');
    expect(lefts()).toEqual([74, 94, 60, 96]);
  });

  it('keeps the groups made by taking one apart, and numbers new things above all of them', () => {
    const file = items()[0]!.group;
    cam().select(file);
    cam().ungroup();
    const apart = groups().slice(0, 2);
    expect(new Set(apart).size).toBe(2);
    const before = groups();
    through();
    expect(groups()).toEqual(before);
    // a part added now never takes a group or an id of the file
    const highest = Math.max(...items().flatMap((i) => [i.id, i.group]));
    cam().add([rectangle(200, 0, 10, 10)]);
    const added = items().at(-1)!;
    expect(added.group).toBeGreaterThan(highest);
    expect(added.id).toBeGreaterThan(highest);
    expect(new Set(items().map((i) => i.id)).size).toBe(items().length);
    // taken apart again after the file: still above everything
    cam().select(added.group);
    cam().group();
    cam().select([items()[0]!.group, items()[1]!.group]);
    cam().group();
    expect(Math.min(...groups().slice(0, 2))).toBeGreaterThan(highest);
  });

  it('refuses a group that is no whole number, as before', () => {
    const text = cam().saveProject()!;
    const broken = JSON.parse(text);
    broken.items[1].group = 2.5;
    expect(parseProject(JSON.stringify(broken))).toEqual({ error: 'invalid-project' });
    broken.items[1].group = 'a';
    expect(parseProject(JSON.stringify(broken))).toEqual({ error: 'invalid-project' });
  });
});
