import type { SvgNoteCode } from '@lowrider/cam';
import { ALARM_CODES, ERROR_CODES } from '@lowrider/fluidnc-client';
import type { DiagnosticCode, SectionObstacle, SectionProblem } from '@lowrider/gcode-core';
import type { SlideProblem } from '@lowrider/workshop';
import { describe, expect, it } from 'vitest';
import { hasKey, setDictionary, t, tDynamic, type DictionaryShape } from '../src/i18n';
import { de } from '../src/i18n/de';
import { en } from '../src/i18n/en';
import { applyLanguage } from '../src/i18n/language';
import { COMMANDS } from '../src/lib/commands';
import { formatNumber } from '../src/lib/format';
import type { JigState, JigTroubleKind } from '../src/lib/jigs';
import type { SectionsState, SectionsTrouble } from '../src/lib/sections';
import { SHORTCUTS } from '../src/lib/shortcuts';
import type { TagReject } from '../src/lib/tagFinder';
import type { CamFlipNote } from '../src/store/cam';

// Compile-time completeness: adding a diagnostic code without listing it here fails typecheck.
const DIAGNOSTICS: Record<DiagnosticCode, true> = {
  'unexpected-character': true,
  'unclosed-comment': true,
  'unsupported-expression': true,
  'misplaced-line-number': true,
  'duplicate-word': true,
  'unsupported-word': true,
  'unsupported-axis': true,
  'unsupported-gcode': true,
  'tool-length-table': true,
  'unsupported-mcode': true,
  'modal-group-conflict': true,
  'axis-words-without-motion': true,
  'missing-axis-words': true,
  'missing-feed-rate': true,
  'arc-missing-offsets': true,
  'arc-radius-too-small': true,
  'arc-radius-mismatch': true,
  'arc-full-circle-radius': true,
  'arc-offset-in-wrong-plane': true,
  'invalid-value': true,
  'unknown-position': true,
  'transform-unsupported': true,
  'transform-assumed-position': true,
};

// What the SVG reader can report: every code needs its German text, too.
const SVG_NOTES: Record<SvgNoteCode, true> = {
  'svg-text': true,
  'svg-image': true,
  'svg-use': true,
  'svg-element': true,
  'svg-path': true,
  'svg-transform': true,
  'svg-units': true,
};

// What a two-sided drawing can say about itself: every note needs its German text.
const FLIP_NOTES: Record<CamFlipNote['code'], true> = {
  meet: true,
  through: true,
  thin: true,
  loose: true,
  'no-thickness': true,
  'no-back': true,
  askew: true,
  'hole-on-cut': true,
  'hole-in-part': true,
  'hole-off-stock': true,
  tools: true,
};

// Why a printed marker is not taken, and why a jig cannot be measured: every reason needs
// its text – the long one and the word that stands in the picture.
const TAG_REJECTS: Record<TagReject, true> = {
  cut: true,
  blurred: true,
  faint: true,
  tilted: true,
  size: true,
  unreadable: true,
};
const JIG_TROUBLES: Record<JigTroubleKind, true> = {
  notReady: true,
  unseen: true,
  notThere: true,
  refused: true,
  distance: true,
  turned: true,
  machine: true,
  cancelled: true,
};
const JIG_STATES: Record<JigState, true> = {
  ok: true,
  unmeasured: true,
  moved: true,
  zeroMoved: true,
  turned: true,
};

// A part cut in sections: why a job cannot be divided, why the part was not found again,
// and what the readiness list says about a section – every one needs its text.
const SECTION_PROBLEMS: Record<SectionProblem['problem'], true> = {
  unsupported: true,
  empty: true,
  fits: true,
  'start-outside': true,
  travel: true,
  'no-seam': true,
  outside: true,
};
const SECTION_OBSTACLES: Record<SectionObstacle, true> = {
  errors: true,
  G91: true,
  G93: true,
  'absolute-arcs': true,
  G18: true,
  offsets: true,
  probe: true,
  wcs: true,
  rotary: true,
  'no-z': true,
};
const SLIDE_PROBLEMS: Record<SlideProblem, true> = {
  missing: true,
  distance: true,
  turned: true,
  'one-mark': true,
  fence: true,
};
const SECTIONS_TROUBLES: Record<Exclude<SectionsTrouble['kind'], 'tag' | 'fit'>, true> = {
  noMarks: true,
  oneMark: true,
  machine: true,
};
const SECTIONS_STATES: Record<SectionsState, true> = {
  ready: true,
  cutAgain: true,
  earlier: true,
  past: true,
  slid: true,
  moved: true,
};

describe('i18n', () => {
  it('interpolates parameters and keeps unknown placeholders', () => {
    expect(t('alarm.title', { code: 1 })).toBe('Alarm 1');
    expect(t('alarm.title')).toBe('Alarm {code}');
    expect(t('job.errorsFound', { other: 1 })).toContain('{count}');
  });

  it('falls back for runtime keys', () => {
    expect(tDynamic('alarm.HardLimit.text', 'alarm.Unknown.text')).toMatch(/Endschalter/);
    expect(tDynamic('alarm.Nope.text', 'alarm.Unknown.text')).toBe(de.alarm.Unknown.text);
    expect(tDynamic('x.y', 'x.z' as never)).toBe('x.y');
    expect(t('nope' as never)).toBe('nope');
    expect(hasKey('rooms')).toBe(false);
  });

  it('explains every alarm with text and next step', () => {
    for (const name of Object.values(ALARM_CODES)) {
      expect(hasKey(`alarm.${name}.text`), name).toBe(true);
      expect(hasKey(`alarm.${name}.action`), name).toBe(true);
    }
  });

  it('has a text for everything the SVG import can report', () => {
    for (const code of Object.keys(SVG_NOTES)) {
      expect(hasKey(`cam.notes.${code}`), code).toBe(true);
      expect(t(`cam.notes.${code}` as never, { count: 2 })).not.toContain('{');
    }
  });

  it('has a text for everything that can be said about markers and jigs', () => {
    for (const reason of Object.keys(TAG_REJECTS)) {
      expect(hasKey(`jigs.refused.${reason}`), reason).toBe(true);
      expect(hasKey(`jigs.short.${reason}`), reason).toBe(true);
      expect(t(`jigs.refused.${reason}` as never, { mm: 35 })).not.toContain('{');
    }
    for (const kind of Object.keys(JIG_TROUBLES)) {
      expect(hasKey(`jigs.trouble.${kind}`), kind).toBe(true);
      expect(t(`jigs.trouble.${kind}` as never, { n: 2, why: 'x' })).not.toContain('{');
    }
    for (const state of Object.keys(JIG_STATES)) {
      const key = `ready.jig${state[0]!.toUpperCase()}${state.slice(1)}`;
      expect(hasKey(key), key).toBe(true);
      if (state !== 'ok') expect(hasKey(`jigs.stale.${state}`), state).toBe(true);
    }
  });

  it('has a text for everything that can be said about a part cut in sections', () => {
    for (const problem of Object.keys(SECTION_PROBLEMS)) {
      expect(hasKey(`sections.refused.${problem}`), problem).toBe(true);
    }
    for (const what of Object.keys(SECTION_OBSTACLES)) {
      expect(hasKey(`sections.refused.what.${what}`), what).toBe(true);
    }
    for (const kind of [
      ...Object.keys(SLIDE_PROBLEMS),
      ...Object.keys(SECTIONS_TROUBLES),
      'notThere',
    ]) {
      expect(hasKey(`sections.trouble.${kind}`), kind).toBe(true);
      const text = t(`sections.trouble.${kind}` as never, { n: 7, mm: '0,8', deg: '0,5' });
      expect(text).not.toContain('{');
    }
    for (const state of Object.keys(SECTIONS_STATES)) {
      const key = `ready.sections${state[0]!.toUpperCase()}${state.slice(1)}`;
      expect(hasKey(key), key).toBe(true);
      expect(t(key as never, { n: 1, total: 3, at: 2 })).not.toContain('{');
    }
    for (const axis of ['x', 'y']) {
      expect(hasKey(`sections.slide.how.${axis}`)).toBe(true);
      expect(hasKey(`sections.direction.${axis}`)).toBe(true);
    }
  });

  it('has a text for everything a two-sided drawing can say', () => {
    for (const code of Object.keys(FLIP_NOTES)) {
      expect(hasKey(`flip.notes.${code}`), code).toBe(true);
      const text = t(`flip.notes.${code}` as never, { front: 1, back: 2, mm: 1, n: 1, rows: '1' });
      expect(text).not.toContain('{');
    }
  });

  it('has texts for every diagnostic code and the common errors', () => {
    for (const code of Object.keys(DIAGNOSTICS))
      expect(hasKey(`diagnostic.${code}`), code).toBe(true);
    for (const code of [20, 22, 21, 34, 10, 9, 8, 16]) {
      expect(hasKey(`error.${ERROR_CODES[code]}`), String(code)).toBe(true);
    }
  });

  it('has a name and words to be found by for everything in the quick search', () => {
    for (const command of COMMANDS) {
      expect(hasKey(command.title), command.id).toBe(true);
      expect(hasKey(`find.words.${command.id}`), command.id).toBe(true);
      expect(t(`find.words.${command.id}` as never).split(',').length, command.id).toBeGreaterThan(
        3,
      );
      if (command.needs) expect(hasKey(`find.needs.${command.needs}`)).toBe(true);
    }
    for (const shortcut of SHORTCUTS) {
      expect(hasKey(shortcut.label), shortcut.id).toBe(true);
      // A key cap is a letter or sign, or a word from the dictionary.
      for (const cap of shortcut.caps.flat()) {
        expect(cap.length === 1 || hasKey(`find.caps.${cap}`), cap).toBe(true);
      }
    }
  });

  it('can switch dictionaries', () => {
    const en = structuredClone(de) as unknown as DictionaryShape;
    (en.nav.steps as { setup: string }).setup = 'Set up';
    setDictionary(en);
    expect(t('nav.steps.setup')).toBe('Set up');
    setDictionary(de);
    expect(t('nav.steps.setup')).toBe('Einrichten');
  });
});

function leaves(node: unknown, prefix = ''): [string, string][] {
  if (typeof node === 'string') return [[prefix, node]];
  return Object.entries(node as object).flatMap(([k, v]) =>
    leaves(v, prefix ? `${prefix}.${k}` : k),
  );
}

describe('English dictionary', () => {
  it('has the same keys and placeholders as German', () => {
    const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const german = new Map(leaves(de));
    const english = leaves(en);
    expect(english.map(([k]) => k).sort()).toEqual([...german.keys()].sort());
    for (const [key, text] of english)
      expect(placeholders(text), key).toEqual(placeholders(german.get(key)!));
  });

  it('switches texts and number format', () => {
    applyLanguage('en');
    expect(t('nav.steps.run')).toBe('Cut');
    expect(formatNumber(1234.5, 1)).toBe('1,234.5');
    applyLanguage('de');
    expect(t('nav.steps.run')).toBe('Fräsen');
    expect(formatNumber(1234.5, 1)).toBe('1.234,5');
  });
});
