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
