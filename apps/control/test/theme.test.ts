import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The tokens of both themes, held against DESIGN.md §7: text ≥ 7:1, controls ≥ 4.5:1, and the
// stage pictures get plain colours in each theme. Read from the stylesheet itself.

const css = readFileSync(join(__dirname, '../src/styles/theme.css'), 'utf8');

/** The custom properties of the first rule that starts with `selector {` (plain hex values only). */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`\n${selector} {`);
  expect(start, selector).toBeGreaterThan(-1);
  const body = css.slice(start, css.indexOf('\n}', start));
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map((m) => [m[1]!, m[2]!]),
  );
}

const light = tokens(':root');
// Dark overrides what it changes; what it does not say stays as in :root.
const dark = { ...light, ...tokens('.dark') };

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe.each([
  ['dark', dark],
  ['light', light],
])('the %s theme', (_name, theme) => {
  const on = (fg: string, bg: string) => contrast(theme[fg]!, theme[bg]!);

  it('writes text at 7:1 or more on the page, on cards and on raised surfaces', () => {
    for (const surface of ['--background', '--card', '--popover']) {
      expect(on('--foreground', surface), surface).toBeGreaterThanOrEqual(7);
    }
  });

  it('keeps secondary text and the signs of a state readable (4.5:1)', () => {
    for (const surface of ['--background', '--card', '--popover']) {
      expect(on('--muted-foreground', surface), surface).toBeGreaterThanOrEqual(4.5);
    }
    for (const sign of [
      '--success-foreground',
      '--warning-foreground',
      '--destructive-foreground',
      '--info-foreground',
      '--probe-foreground',
    ]) {
      expect(on(sign, '--card'), sign).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('labels its solid controls at 4.5:1: the primary action, a confirmed state, NOT-HALT', () => {
    expect(on('--primary-foreground', '--primary')).toBeGreaterThanOrEqual(4.5);
    expect(on('--on-solid', '--success')).toBeGreaterThanOrEqual(4.5);
    expect(on('--on-solid', '--warning')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#ffffff', theme['--estop']!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#ffffff', theme['--estop-pressed']!)).toBeGreaterThanOrEqual(4.5);
  });

  it('writes the text of a row of the drawing list at 7:1 on the fill of a row and of a selected one', () => {
    // The word of a hidden part ("ausgeblendet") says the state; the muted colour is 3.6:1 on the selected fill
    for (const fill of ['--muted', '--input']) {
      expect(on('--foreground', fill), fill).toBeGreaterThanOrEqual(7);
    }
  });

  it('gives the stage pictures plain colours, the cut never in red', () => {
    for (const name of [
      '--stage-bg',
      '--stage-grid',
      '--stage-text',
      '--stage-rapid',
      '--stage-air',
      '--stage-cut',
      '--stage-done',
      '--stage-current',
      '--stage-select',
    ]) {
      expect(theme[name], name).toMatch(/^#[0-9a-f]{6}$/i);
    }
    // "Im Material" is the accent; red belongs to faults, alarms and NOT-HALT.
    expect(theme['--stage-cut']).toBe(theme['--primary']);
    expect(theme['--stage-cut']).not.toBe(theme['--destructive']);
    // The toolpath stands out from the ground it is drawn on.
    expect(on('--stage-cut', '--stage-bg')).toBeGreaterThanOrEqual(4.5);
    expect(on('--stage-text', '--stage-bg')).toBeGreaterThanOrEqual(7);
  });

  it('sets the numbers on the picture – the gaps, the measurement – at 7:1, and its lines at 4.5:1, on the ground', () => {
    // The words are drawn on a light wash of `--stage-bg` in the text colour; the lines of two equal gaps and the
    // points of a measurement are in the selection colour – a colour for lines and dots, not for words
    expect(on('--stage-text', '--stage-bg')).toBeGreaterThanOrEqual(7);
    expect(on('--stage-select', '--stage-bg')).toBeGreaterThanOrEqual(4.5);
    // …and the selection colour is no colour of a fault
    expect(theme['--stage-select']).not.toBe(theme['--destructive']);
  });
});

describe.each([
  ['dark', dark],
  ['light', light],
])('the colour groups of a drawing, %s theme', (_name, theme) => {
  const GROUPS = ['--stage-group-a', '--stage-group-b', '--stage-group-c', '--stage-group-d'];
  const on = (fg: string, bg: string) => contrast(theme[fg]!, theme[bg]!);

  it('are plain colours the canvas can read, four of them', () => {
    for (const name of GROUPS) expect(theme[name], name).toMatch(/^#[0-9a-f]{6}$/i);
    expect(new Set(GROUPS.map((name) => theme[name])).size).toBe(4);
  });

  it('read as lines at 4.5:1 on the ground of the table and on the cards, where the swatch of a pill sits', () => {
    for (const name of GROUPS) {
      expect(on(name, '--stage-bg'), `${name} on the stage`).toBeGreaterThanOrEqual(4.5);
      expect(on(name, '--card'), `${name} on a card`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('are none of the colours that mean something: a fault, the selection, the cut, done, the current, the primary action', () => {
    const MEANING = [
      '--destructive',
      '--stage-select',
      '--stage-cut',
      '--stage-done',
      '--stage-current',
      '--primary',
      '--success',
      '--warning',
      '--probe',
      '--stage-text',
      '--stage-muted',
    ];
    for (const name of GROUPS) {
      for (const meaning of MEANING) {
        expect(theme[name], `${name} / ${meaning}`).not.toBe(theme[meaning]);
      }
    }
  });

  it('leave the letter that names them the carrier: the text colour on the card is 7:1 and on a wash of the ground too', () => {
    // the pill's letter is `--foreground` on `--card`; on the table it is `--stage-text` on a wash of `--stage-bg`
    expect(on('--foreground', '--card')).toBeGreaterThanOrEqual(7);
    expect(on('--stage-text', '--stage-bg')).toBeGreaterThanOrEqual(7);
  });
});

describe('the pill that carries a colour in the list', () => {
  const rooms = readFileSync(join(__dirname, '../src/styles/rooms.css'), 'utf8');
  const rule = (selector: string) =>
    [...rooms.matchAll(/([^{}]*)\{([^{}]*)\}/g)]
      .map((m) => ({ selector: m[1]!.replace(/\/\*[\s\S]*?\*\//g, '').trim(), body: m[2]! }))
      .find((r) => r.selector === selector)?.body;

  it('has a fixed size, writes its letter in the text colour on the card’s fill, and frames itself in the colour', () => {
    const body = rule('.cam-color-pill')!;
    expect(body).toMatch(/width:\s*1\.75rem/);
    expect(body).toMatch(/height:\s*1\.75rem/);
    expect(body).toMatch(/color:\s*var\(--foreground\)/);
    expect(body).toMatch(/background:\s*var\(--card\)/);
    expect(body).toMatch(/border:[^;]*var\(--swatch/);
    // no opacity anywhere in it (it would fall below the contrast of the guide), and it is no taller than a line
    expect(body).not.toMatch(/opacity/);
  });

  it('takes the swatch of each colour from the token of the same letter', () => {
    for (const id of ['a', 'b', 'c', 'd']) {
      expect(rule(`.cam-color-pill[data-color='${id}']`), id).toMatch(
        new RegExp(`--swatch:\\s*var\\(--stage-group-${id}\\)`),
      );
    }
  });
});

describe('the two themes', () => {
  it('use the tokens of DESIGN.md for dark', () => {
    expect(dark).toMatchObject({
      '--background': '#0f1115',
      '--card': '#171a21',
      '--popover': '#20242d',
      '--border': '#2c313c',
      '--foreground': '#e8eaed',
      '--muted-foreground': '#9aa0a6',
      '--primary': '#3b82f6',
      '--success': '#22c55e',
      '--warning': '#f59e0b',
      '--destructive': '#ef4444',
      '--probe': '#a855f7',
      '--axis-x': '#ef4444',
      '--axis-y': '#22c55e',
      '--axis-z': '#3b82f6',
      '--axis-a': '#f59e0b',
    });
  });

  it('differ where it matters: the ground, the text, the stage', () => {
    for (const name of ['--background', '--foreground', '--card', '--stage-bg', '--stage-text']) {
      expect(light[name], name).not.toBe(dark[name]);
    }
  });
});

describe('a hidden part in the list of a drawing', () => {
  const rooms = readFileSync(join(__dirname, '../src/styles/rooms.css'), 'utf8');
  // The rules whose selector names a hidden row: `selector { body }`
  const rules = [...rooms.matchAll(/([^{}]*hidden-part[^{}]*)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1]!.replace(/\/\*[\s\S]*?\*\//g, '').trim(),
    body: m[2]!,
  }));

  it('is never faded: half-transparent text and controls fall below 7:1 and 4.5:1 (measured at 0.7)', () => {
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) expect(rule.body, rule.selector).not.toMatch(/opacity/);
  });

  it('is set apart by an outline of another kind, not by the strength of what is in it', () => {
    const row = rules.find((r) => r.selector === '.cam-row.hidden-part');
    expect(row?.body).toMatch(/border-style:\s*dashed/);
  });
});
