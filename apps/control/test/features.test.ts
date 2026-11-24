import { beforeEach, describe, expect, it } from 'vitest';
import { de } from '../src/i18n/de';
import { en } from '../src/i18n/en';
import { COMMANDS, NEED_FALLBACK, commandById, needMet, quickAccess } from '../src/lib/commands';
import {
  FEATURES,
  featureShown,
  shownFeatures,
  validHiddenFeatures,
  withHidden,
  type FeatureId,
} from '../src/lib/features';
import { runCommand } from '../src/store/find';
import { useUi } from '../src/store/ui';
import { DEFAULT_SETTINGS, useWorkshop, validateSettings } from '../src/store/workshop';

const item = (id: 'series' | 'jig' | 'zero') => ({ id });

describe('functions that can be hidden', () => {
  it('knows the functions it lists, once each, and drops the rest of a stored list', () => {
    expect(FEATURES).toEqual(['series', 'jigs', 'macros']);
    expect(validHiddenFeatures(['macros', 'flip', 'series', 'series', 7, null])).toEqual([
      'series',
      'macros',
    ]);
    expect(validHiddenFeatures('series')).toEqual([]);
    expect(validHiddenFeatures(undefined)).toEqual([]);
  });

  it('shows what is not hidden, and hides what is – unless its flow is under way', () => {
    expect(featureShown('series', [], [])).toBe(true);
    expect(featureShown('series', ['series'], [])).toBe(false);
    // The readiness point of the flow is the sign that it is under way …
    expect(featureShown('series', ['series'], [item('series')])).toBe(true);
    expect(featureShown('jigs', ['jigs'], [item('jig')])).toBe(true);
    // … and another point, or the flow of another function, says nothing
    expect(featureShown('series', ['series'], [item('jig'), item('zero')])).toBe(false);
    expect(featureShown('jigs', ['jigs'], [item('series')])).toBe(false);
    // Macros have no flow: hidden is hidden
    expect(featureShown('macros', ['macros'], [item('series'), item('jig')])).toBe(false);
  });

  it('says for every function whether it shows', () => {
    expect(shownFeatures(['jigs'], [])).toEqual({ series: true, jigs: false, macros: true });
    expect(shownFeatures(['jigs', 'macros'], [item('jig')])).toEqual({
      series: true,
      jigs: true,
      macros: false,
    });
  });

  it('puts a function in the list once and takes it out again', () => {
    expect(withHidden([], 'jigs', true)).toEqual(['jigs']);
    expect(withHidden(['jigs'], 'jigs', true)).toEqual(['jigs']);
    expect(withHidden(['macros'], 'series', true)).toEqual(['series', 'macros']);
    expect(withHidden(['series', 'macros'], 'series', false)).toEqual(['macros']);
    expect(withHidden([], 'series', false)).toEqual([]);
  });

  it('keeps the list in the settings: nothing hidden by default, only known ids kept', () => {
    expect(DEFAULT_SETTINGS.hiddenFeatures).toEqual([]);
    // Old storage without the field: nothing is hidden
    expect(validateSettings({})?.hiddenFeatures).toEqual([]);
    expect(
      validateSettings({ hiddenFeatures: ['macros', 'bogus', 'jigs'] })?.hiddenFeatures,
    ).toEqual(['jigs', 'macros']);
    expect(validateSettings({ hiddenFeatures: 'jigs' })?.hiddenFeatures).toEqual([]);
  });
});

describe('the search and the hidden functions', () => {
  const ANCHORS: Record<FeatureId, string[]> = {
    series: ['series'],
    jigs: ['jigs', 'tag-print'],
    macros: ['macros', 'macro-editor'],
  };
  const all = { series: true, jigs: true, macros: true };

  beforeEach(() => {
    useWorkshop.getState().setSettings({ hiddenFeatures: [] });
    useUi.getState().go('start');
  });

  it('marks every entry that leads to a function with its need – and no other', () => {
    for (const [feature, anchors] of Object.entries(ANCHORS)) {
      for (const command of COMMANDS) {
        const leads = command.anchor.some((a) => anchors.includes(a));
        expect(command.needs === feature, `${command.id} / ${feature}`).toBe(leads);
      }
    }
  });

  it('leads a hidden function to the switch, with a text of its own in both languages', () => {
    for (const id of FEATURES) {
      expect(NEED_FALLBACK[id]).toEqual({ place: 'settings', view: 'machine', anchor: 'features' });
      expect(de.find.needs[id]).toContain('Funktionen');
      expect(en.find.needs[id]).toContain('Functions');
    }
    expect(commandById('features')).toMatchObject({ place: 'settings', view: 'machine' });
    expect(needMet('series', { program: true, expert: false, features: all })).toBe(true);
    expect(
      needMet('series', {
        program: true,
        expert: false,
        features: { ...all, series: false },
      }),
    ).toBe(false);
  });

  it('goes to the function while it shows, to the switch while it is hidden', () => {
    runCommand('macros');
    expect(useUi.getState().jogOpen).toBe(true);
    useUi.getState().setJogOpen(false);
    useUi.getState().go('start');

    useWorkshop.getState().setSettings({ hiddenFeatures: ['macros', 'jigs', 'series'] });
    runCommand('macros');
    expect(useUi.getState()).toMatchObject({ place: 'settings', jogOpen: false });
    expect(useUi.getState().views.settings).toBe('machine');
    runCommand('jigs');
    expect(useUi.getState().place).toBe('settings');
    useUi.getState().go('start');
    runCommand('series');
    expect(useUi.getState().place).toBe('settings');
    // A series that is under way stays reachable: the palette passes what shows
    useUi.getState().go('start');
    runCommand('series', shownFeatures(['macros', 'jigs', 'series'], [item('series')]));
    expect(useUi.getState().place).toBe('cam');
  });

  it('keeps a hidden function out of the quick access', () => {
    const base = {
      connected: true,
      homed: true,
      program: true,
      running: false,
      drawing: false,
      expert: false,
      features: { series: false, jigs: false, macros: false },
      readiness: [{ id: 'series' as const, level: 'block' as const, key: 'seriesMoved' as const }],
    };
    // The blocked point leads to the series card only while the series shows
    expect(quickAccess(base)).not.toContain('series');
    expect(quickAccess({ ...base, features: { ...base.features, series: true } })).toContain(
      'series',
    );
  });
});
