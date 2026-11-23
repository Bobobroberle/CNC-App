import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STAGE_TOOLS } from '../src/components/StageTools';
import { hasKey } from '../src/i18n';
import { de } from '../src/i18n/de';
import { en } from '../src/i18n/en';
import { findCommands, keywordsOf, placeOf, titleOf } from '../src/lib/commandSearch';
import {
  commandById,
  COMMANDS,
  NEED_FALLBACK,
  needMet,
  placeKeys,
  QUICK_COUNT,
  quickAccess,
  RECENT_COUNT,
  validRecent,
  VIEW_ACTIONS,
  placeLabelKey,
  viewLabelKey,
  withRecent,
  type Situation,
} from '../src/lib/commands';
import { useCam } from '../src/store/cam';
import { runCommand, useFind } from '../src/store/find';
import { useJob } from '../src/store/job';
import { useMachine } from '../src/store/machine';
import { useStageTools } from '../src/store/tools';
import { AREAS, PLACES, STEPS, useUi, VIEWS } from '../src/store/ui';
import { useWorkshop } from '../src/store/workshop';

const SRC = join(__dirname, '../src');
const COMPONENTS = join(SRC, 'components');
const read = (path: string) => readFileSync(path, 'utf8');
const componentFiles = [
  ...readdirSync(COMPONENTS)
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => join(COMPONENTS, f)),
  ...readdirSync(join(COMPONENTS, 'places')).map((f) => join(COMPONENTS, 'places', f)),
  join(SRC, 'App.tsx'),
];
const sources = componentFiles.map(read).join('\n');

/** Anchors written out in the components, and the ones built from a prefix (`tool-${id}`). */
const literal = new Set(
  [...sources.matchAll(/(?:data-find|\bfind)="([a-z0-9-]+)"/g)].map((m) => m[1]!),
);
const prefixes = [...sources.matchAll(/data-find=\{`([a-z0-9-]+)\$\{/g)].map((m) => m[1]!);
const onPage = (anchor: string) =>
  literal.has(anchor) || prefixes.some((prefix) => anchor.startsWith(prefix));

const first = (query: string) => findCommands(query)[0]?.id;
const top = (query: string, n = 3) =>
  findCommands(query)
    .slice(0, n)
    .map((c) => c.id);

const SITUATION: Situation = {
  connected: true,
  homed: true,
  program: true,
  running: false,
  drawing: false,
  expert: false,
  readiness: [],
};

describe('the table of commands', () => {
  it('has unique ids, and a label on screen for each', () => {
    const ids = COMMANDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of COMMANDS) {
      expect(c.id, c.id).toMatch(/^[a-z][A-Za-z0-9]*$/);
      expect(hasKey(c.title), c.id).toBe(true);
      expect(titleOf(c), c.id).not.toMatch(/^\d ·/);
      expect(placeOf(c), c.id).not.toBe('');
      for (const key of placeKeys(c)) expect(hasKey(key), `${c.id}: ${key}`).toBe(true);
    }
    expect(commandById('homing')?.title).toBe('jog.quick.home');
    expect(commandById('nope')).toBeUndefined();
  });

  it('has keywords for every command in both languages – and no keywords without a command', () => {
    const ids = COMMANDS.map((c) => c.id).sort();
    expect(Object.keys(de.find.words).sort()).toEqual(ids);
    expect(Object.keys(en.find.words).sort()).toEqual(ids);
    for (const c of COMMANDS) {
      for (const words of [de.find.words, en.find.words] as Record<string, string>[]) {
        const list = words[c.id]!.split(',').map((w) => w.trim());
        expect(list.length, c.id).toBeGreaterThanOrEqual(4);
        expect(
          list.every((w) => w !== ''),
          c.id,
        ).toBe(true);
        expect(new Set(list).size, c.id).toBe(list.length);
      }
      expect(keywordsOf(c).length, c.id).toBeGreaterThanOrEqual(8);
    }
  });

  it('only goes somewhere or changes the view – nothing else exists', () => {
    for (const c of COMMANDS) {
      expect(['go', 'view'], c.id).toContain(c.kind);
      if (c.kind === 'view') {
        expect(VIEW_ACTIONS, c.id).toContain(c.action);
        expect(c.place ?? c.tool ?? c.drawing ?? c.jog ?? c.needs, c.id).toBeUndefined();
      } else {
        expect(c.action, c.id).toBeUndefined();
        // It lives in a place, in the jog panel, on the stage or in one of the bars.
        expect(c.place !== undefined || c.jog === true || c.on !== undefined, c.id).toBe(true);
      }
    }
    expect([...VIEW_ACTIONS].sort()).toEqual(
      ['fit', 'nextStep', 'shortcuts', 'stage3d', 'stageCamera', 'stageTable', 'wide'].sort(),
    );
  });

  it('lands on something that is on the page', () => {
    for (const c of COMMANDS) {
      if (c.kind !== 'view' || c.on === 'stage') {
        expect(c.anchor.length, c.id).toBeGreaterThan(0);
      }
      for (const anchor of c.anchor) expect(onPage(anchor), `${c.id}: ${anchor}`).toBe(true);
      if (c.place) {
        expect(PLACES, c.id).toContain(c.place);
        expect(hasKey(placeLabelKey(c.place)), c.id).toBe(true);
      }
      if (c.place && c.view) {
        expect(VIEWS[c.place as keyof typeof VIEWS], c.id).toContain(c.view);
        expect(hasKey(viewLabelKey(c.place, c.view)), c.id).toBe(true);
      }
      if (c.drawing) expect(c.place, c.id).toBe('job');
    }
    for (const need of Object.values(NEED_FALLBACK)) expect(onPage(need.anchor)).toBe(true);
  });

  it('knows every marked place: no anchor in a component without a command', () => {
    const used = new Set([
      ...COMMANDS.flatMap((c) => c.anchor),
      ...Object.values(NEED_FALLBACK).map((need) => need.anchor),
    ]);
    for (const anchor of literal) expect(used.has(anchor), anchor).toBe(true);
    for (const prefix of prefixes) {
      expect(
        [...used].some((anchor) => anchor.startsWith(prefix)),
        prefix,
      ).toBe(true);
    }
  });

  it('covers every place, every view of a place and every tap tool of the stage', () => {
    // Start, the five steps and the side areas: each has its entry in the row of the steps
    // or in the menu, and each of its views has at least one function that lives there.
    for (const place of PLACES) {
      expect(
        COMMANDS.some((c) => c.place === place && c.on === 'nav'),
        place,
      ).toBe(true);
    }
    expect(STEPS).toEqual(['job', 'tools', 'setup', 'check', 'run']);
    expect(AREAS).toEqual(['toollist', 'service', 'settings', 'console']);
    for (const [place, views] of Object.entries(VIEWS)) {
      for (const view of views) {
        expect(
          COMMANDS.some((c) => c.place === place && c.view === view),
          `${place}/${view}`,
        ).toBe(true);
        expect(hasKey(viewLabelKey(place as never, view)), `${place}/${view}`).toBe(true);
      }
    }
    // The views are the buttons of the places' own switches.
    const places = readdirSync(join(COMPONENTS, 'places'))
      .map((f) => read(join(COMPONENTS, 'places', f)))
      .join('\n');
    const shown = [...places.matchAll(/label: 'nav\.views\.(\w+)\.(\w+)'/g)].map(
      (m) => `${m[1]}/${m[2]}`,
    );
    expect(shown.sort()).toEqual(
      Object.entries(VIEWS)
        .flatMap(([place, views]) => views.map((view) => `${place}/${view}`))
        .sort(),
    );
    expect(COMMANDS.some((c) => c.jog)).toBe(true);
    for (const tool of STAGE_TOOLS) {
      const command = COMMANDS.find((c) => c.tool === tool.id);
      expect(command?.title, tool.id).toBe(tool.label);
    }
  });

  // The convention: a new card of a place gets its place in the search.
  it('finds a marked place in every card the places show', () => {
    /** Parts and flows that are no place of their own */
    const NOT_A_PLACE = new Set([
      'SubNav',
      'Section',
      'HoldButton',
      'Notice',
      'LogView',
      // Shown only while their job is at hand; the readiness list leads there.
      'FlipCard',
      'JigCard',
      'RunBar',
      'Depth',
      // The controller's answer to the last command: a line under the jog pad, no card.
      'Ack',
    ]);
    for (const file of ['places/Steps', 'places/Areas', 'JogPanel']) {
      const text = read(join(COMPONENTS, `${file}.tsx`));
      // The cards are the components beside the file (places lie one folder down).
      const beside = file.startsWith('places/') ? /from '\.\.\/(\w+)'/g : /from '\.\/(\w+)'/g;
      const cards = [...text.matchAll(beside)].map((m) => m[1]!);
      expect(cards.length, file).toBeGreaterThanOrEqual(3);
      for (const card of cards.filter((name) => !NOT_A_PLACE.has(name))) {
        expect(read(join(COMPONENTS, `${card}.tsx`)), `${file}: ${card}`).toMatch(
          /data-find=|\bfind="/,
        );
      }
    }
  });
});

describe('what the search may do', () => {
  beforeEach(() => {
    useUi.getState().go('job', 'prepare');
    useUi.setState({ drawing: false });
    useWorkshop.getState().setSettings({ expertMode: false });
  });

  it('never reaches the machine and never touches the job, whatever is chosen', () => {
    // Every function of the machine store is replaced by a spy: none may be called.
    const machine = useMachine.getState() as unknown as Record<string, unknown>;
    const spies = Object.fromEntries(
      Object.entries(machine)
        .filter(([, value]) => typeof value === 'function')
        .map(([name]) => [name, vi.fn()]),
    );
    expect(Object.keys(spies)).toEqual(
      expect.arrayContaining(['command', 'jog', 'home', 'emergencyStop', 'feedHold']),
    );
    useMachine.setState(spies as never);
    useJob.getState().load('part.nc', 'G21 G90\nG0 X10 Y10\nG1 Z-1 F300\nG1 X20\n');
    const before = { name: useJob.getState().fileName, lines: useJob.getState().lines };

    for (const expert of [false, true]) {
      useWorkshop.getState().setSettings({ expertMode: expert });
      for (const c of COMMANDS) runCommand(c.id);
    }
    runCommand('nope');

    for (const [name, spy] of Object.entries(spies)) expect(spy, name).not.toHaveBeenCalled();
    expect(useJob.getState().fileName).toBe(before.name);
    expect(useJob.getState().lines).toBe(before.lines);
    // Opening the drawing workspace adds nothing to the drawing.
    expect(useCam.getState().project?.items ?? []).toEqual([]);
    expect(useCam.getState().past).toEqual([]);
    useJob.getState().unload();
    useCam.getState().close();
  });

  it('keeps the machine out of the search by construction', () => {
    // Neither the table nor what runs it knows the machine store, the run or the client.
    for (const file of [
      'lib/commands.ts',
      'lib/commandSearch.ts',
      'lib/reveal.ts',
      'store/find.ts',
    ]) {
      const text = read(join(SRC, file));
      expect(text, file).not.toMatch(
        /store\/machine|\.\/machine|store\/run|\.\/run'|fluidnc-client/,
      );
      expect(text, file).not.toMatch(/\.click\(\)|dispatchEvent/);
    }
    // The palette reads the machine's state for the quick access; it sends nothing.
    const palette = read(join(COMPONENTS, 'Find.tsx'));
    expect(palette).not.toMatch(/useMachine\.getState\(\)/);
  });

  it('goes to the place, the view and the tool of a command', () => {
    runCommand('zero');
    expect(useUi.getState()).toMatchObject({ place: 'setup', jogOpen: false });
    expect(useUi.getState().views.setup).toBe('zero');
    runCommand('toolLibrary');
    expect(useUi.getState().place).toBe('toollist');
    runCommand('toolClamp');
    expect(useStageTools.getState().active).toBe('clamp');
    expect(useJob.getState()).toMatchObject({ view: 'table', projection: 'top' });
    // A tool of the stage needs the picture: from a list area the way leads to ③ Einrichten …
    expect(useUi.getState().place).toBe('setup');
    // … and from a place that has the picture, the place stays.
    useUi.getState().go('check');
    runCommand('toolGoto');
    expect(useStageTools.getState().active).toBe('goto');
    expect(useUi.getState().place).toBe('check');
    useUi.getState().go('service', 'calibrate');
    runCommand('toolClamp');
    expect(useUi.getState().place).toBe('service');
    runCommand('stageCamera');
    expect(useJob.getState().view).toBe('camera');
    runCommand('stage3d');
    expect(useJob.getState().view).toBe('3d');
    runCommand('stageTable');
    expect(useJob.getState().view).toBe('table');
    useUi.getState().setFollow(true);
    const fits = useJob.getState().fitRequest;
    runCommand('fit');
    expect(useJob.getState().fitRequest).toBe(fits + 1);
    expect(useUi.getState().follow).toBe(false);
    runCommand('wide');
    expect(useUi.getState().panelHidden).toBe(true);
    runCommand('placeJob');
    expect(useUi.getState()).toMatchObject({ place: 'job', panelHidden: false });
    useStageTools.getState().select('goto');
  });

  it('opens the jog panel over the place for what lives there, and closes it on the way on', () => {
    runCommand('placeCheck');
    runCommand('homing');
    // The jog panel is no place: the step behind it stays.
    expect(useUi.getState()).toMatchObject({ place: 'check', jogOpen: true });
    runCommand('jog');
    expect(useUi.getState()).toMatchObject({ place: 'check', jogOpen: true });
    runCommand('placeStart');
    expect(useUi.getState()).toMatchObject({ place: 'start', jogOpen: false });
  });

  it('steps through the flow with "next step" and stops at the last', () => {
    runCommand('placeStart');
    const seen: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      runCommand('nextStep');
      seen.push(useUi.getState().place);
    }
    expect(seen).toEqual(['job', 'tools', 'setup', 'check', 'run', 'run']);
    runCommand('placeSettings');
    runCommand('nextStep');
    expect(useUi.getState().place).toBe('job');
  });

  it('opens the drawing workspace for what lives there, and leaves it for the program', () => {
    runCommand('shapeRect');
    expect(useUi.getState()).toMatchObject({ place: 'job', drawing: true });
    expect(useCam.getState().project).not.toBeNull();
    // The step alone keeps what it shows.
    runCommand('placeJob');
    expect(useUi.getState().drawing).toBe(true);
    runCommand('jigs');
    expect(useUi.getState()).toMatchObject({ place: 'job', drawing: false });
    expect(useUi.getState().views.job).toBe('extras');
    useCam.getState().close();
  });

  it('lands where a place comes from while it is not there yet', () => {
    // No program: step ④ has nothing to check – the program card of step ① is the way.
    runCommand('placeStart');
    runCommand('simulation');
    expect(useUi.getState().place).toBe('job');
    useJob.getState().load('part.nc', 'G0 X1\n');
    runCommand('simulation');
    expect(useUi.getState().place).toBe('check');
    useJob.getState().unload();
    // Expert tools: the switch for them, until it is on.
    runCommand('firmware');
    expect(useUi.getState()).toMatchObject({ place: 'settings' });
    expect(useUi.getState().views.settings).toBe('machine');
    runCommand('console');
    expect(useUi.getState().place).toBe('settings');
    useWorkshop.getState().setSettings({ expertMode: true });
    runCommand('firmware');
    expect(useUi.getState().views.settings).toBe('expert');
    runCommand('console');
    expect(useUi.getState().place).toBe('console');
    expect(needMet(undefined, SITUATION)).toBe(true);
    expect(needMet('program', { program: false, expert: true })).toBe(false);
    expect(needMet('expert', { program: false, expert: true })).toBe(true);
  });

  it('remembers what was used last, newest first, and closes itself', () => {
    useFind.setState({ recent: [], open: 'search' });
    runCommand('homing');
    runCommand('sd');
    runCommand('homing');
    expect(useFind.getState().recent).toEqual(['homing', 'sd']);
    expect(useFind.getState().open).toBeNull();
    runCommand('shortcuts');
    expect(useFind.getState().open).toBe('keys');
    useFind.getState().close();
    expect(withRecent(['a', 'b', 'c', 'd', 'e'], 'f')).toEqual(['f', 'a', 'b', 'c', 'd']);
    expect(withRecent(['a', 'b'], 'b')).toEqual(['b', 'a']);
    expect(validRecent(['homing', 'gone', 7, 'sd'])).toEqual(['homing', 'sd']);
    expect(validRecent('homing')).toBeNull();
    expect(validRecent(COMMANDS.map((c) => c.id))).toHaveLength(RECENT_COUNT);
  });
});

describe('quick access', () => {
  it('starts with the connection while there is none', () => {
    const ids = quickAccess({ ...SITUATION, connected: false, homed: false, program: false });
    expect(ids[0]).toBe('connection');
    expect(ids).toContain('open');
    expect(ids).toContain('draw');
    expect(ids).not.toContain('readiness');
  });

  it('asks for homing first on a machine that is not homed', () => {
    expect(quickAccess({ ...SITUATION, homed: false })[0]).toBe('homing');
    // Not while a job runs.
    expect(quickAccess({ ...SITUATION, homed: false, running: true })[0]).not.toBe('homing');
  });

  it('leads to the next open point of the readiness list', () => {
    const open = (id: string, level: 'block' | 'warn' | 'ok', key = id) =>
      quickAccess({ ...SITUATION, readiness: [{ id: id as never, level, key }] })[0];
    expect(open('zero', 'warn')).toBe('toolZero');
    expect(open('clamp', 'block')).toBe('toolClamp');
    expect(open('travel', 'block')).toBe('workspace');
    expect(open('travel', 'block', 'outsideLong')).toBe('sections');
    expect(open('errors', 'block')).toBe('diagnostics');
    expect(open('profile', 'warn')).toBe('profile');
    expect(open('busy', 'block')).toBe('readiness');
    expect(open('zero', 'ok')).toBe('readiness');
    // What keeps the start locked comes before what is only worth a look.
    expect(
      quickAccess({
        ...SITUATION,
        readiness: [
          { id: 'zero', level: 'warn', key: 'zero' },
          { id: 'errors', level: 'block', key: 'errors' },
        ],
      })[0],
    ).toBe('diagnostics');
  });

  it('shows a handful, without doubles, only what is there', () => {
    for (const s of [
      SITUATION,
      { ...SITUATION, program: false },
      { ...SITUATION, drawing: true },
      { ...SITUATION, connected: false, homed: false },
    ]) {
      const ids = quickAccess(s);
      expect(ids.length).toBeGreaterThanOrEqual(5);
      expect(ids.length).toBeLessThanOrEqual(QUICK_COUNT);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(needMet(commandById(id)!.needs, s), id).toBe(true);
    }
    expect(quickAccess({ ...SITUATION, drawing: true })).toContain('camHow');
    expect(quickAccess({ ...SITUATION, program: false })).not.toContain('readiness');
  });
});

describe('finding a function with another word', () => {
  it('takes the wrong word for the right thing', () => {
    expect(first('zwinge')).toBe('toolClamp');
    expect(first('homing')).toBe('homing');
    expect(first('skizze')).toBe('draw');
    expect(first('zu lang')).toBe('sections');
    expect(first('notaus')).toBe('estop');
    expect(first('fotokarte')).toBe('photomap');
    expect(first('flip')).toBe('bothSides');
    expect(first('wenden')).toBe('bothSides');
    expect(first('jig')).toBe('jigs');
    expect(first('$H')).toBe('homing');
    expect(first('tiling')).toBe('sections');
    expect(first('haltestege')).toBe('tabs');
    expect(first('tasche')).toBe('camHow');
    expect(first('sprache')).toBe('language');
    expect(first('tastatur')).toBe('shortcuts');
    expect(top('dxf')).toEqual(['draw', 'importFile']);
    expect(top('g54')).toContain('wcs');
    expect(top('fräser')).toContain('toolLibrary');
  });

  it('takes a typing mistake', () => {
    expect(first('nulpunkt')).toBe('toolZero');
    expect(first('refrenzfahrt')).toBe('homing');
    expect(first('zwnge')).toBe('toolClamp');
    expect(first('kallibrieren')).toBe('calibrate');
    expect(first('spanmittel')).toBe('toolClamp');
    expect(first('simualtion')).toBe('simulation');
  });

  it('finds a German word in the English app and the other way round', () => {
    expect(first('clamp')).toBe('toolClamp');
    expect(first('emergency stop')).toBe('estop');
    expect(first('zero')).toBe('toolZero');
    expect(first('keyboard shortcuts')).toBe('shortcuts');
  });

  it('puts the name before the other words, and says where each one lives', () => {
    expect(first('kamera')).toBe('stageCamera');
    expect(top('kamera', 2)).toEqual(['stageCamera', 'camera']);
    expect(first('spannmittel')).toBe('toolClamp');
    expect(placeOf(commandById('toolClamp')!)).toBe('Bühne');
    expect(placeOf(commandById('fixtures')!)).toBe('Einrichten · Nullpunkte');
    expect(placeOf(commandById('shapeRect')!)).toBe('Job · Zeichnen');
    expect(placeOf(commandById('estop')!)).toBe('Statusleiste');
    expect(placeOf(commandById('pause')!)).toBe('Statusleiste');
    expect(placeOf(commandById('placeSetup')!)).toBe('Navigation');
    expect(placeOf(commandById('homing')!)).toBe('Jog / Manuell');
    expect(placeOf(commandById('wcs')!)).toBe('Einrichten · Nullpunkte');
    expect(placeOf(commandById('toolLibrary')!)).toBe('Werkzeugliste');
    expect(placeOf(commandById('nextStep')!)).toBe('Aktionsleiste');
    expect(titleOf(commandById('camHow')!)).toBe('Wie wird gefräst?');
  });

  it('finds nothing for nonsense and not everything for a letter', () => {
    expect(findCommands('xyzq')).toEqual([]);
    expect(findCommands('')).toEqual([]);
    expect(findCommands('q').length).toBeLessThan(COMMANDS.length / 4);
  });
});
