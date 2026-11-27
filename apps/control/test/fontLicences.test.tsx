// @vitest-environment jsdom
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_FONT, FONT_CREDITS, FONT_IDS } from '@lowrider/cam';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LicencesCard } from '../src/components/LicencesCard';
import { hasKey, t } from '../src/i18n';
import { de } from '../src/i18n/de';
import { en } from '../src/i18n/en';
import {
  FACE_LICENCE,
  facesUnder,
  LICENCE_TEXTS,
  LICENCES,
  LICENSED_FACES,
} from '../src/lib/fontLicences';

// jsdom has no observers
class Quiet {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', Quiet);

const file = (path: string) => readFileSync(join(__dirname, '../../..', path), 'utf8');
const OFL = file('licenses/Relief-SingleLine-OFL.txt');
const HERSHEY = file('licenses/Hershey-Fonts-notice.txt');

describe('the licences of the faces of the CAM', () => {
  afterEach(cleanup);

  it("has a notice, a licence and a name for every face that is not the app's own – a new face fails here", () => {
    expect(DEFAULT_FONT).toBe('standard');
    expect(FONT_CREDITS.standard).toBeNull();
    const foreign = FONT_IDS.filter((id) => id !== 'standard');
    expect(foreign.length).toBeGreaterThanOrEqual(3);
    expect([...LICENSED_FACES]).toEqual(foreign);
    for (const id of foreign) {
      const credit = FONT_CREDITS[id];
      expect(typeof credit, `${id}: notice`).toBe('string');
      expect(credit!.trim().length, `${id}: notice`).toBeGreaterThan(40);
      expect(LICENCES, id).toContain(FACE_LICENCE[id]);
      expect(LICENCE_TEXTS[FACE_LICENCE[id]].trim().length, `${id}: licence text`).toBeGreaterThan(
        200,
      );
      for (const dictionary of [de, en] as const) {
        const names = dictionary.cam.text.fonts as Record<string, string>;
        const sources = dictionary.licences.sources as Record<string, string>;
        expect(names[id], `${id}: name`).toBeTruthy();
        expect(sources[id], `${id}: source`).toBeTruthy();
      }
    }
    // every licence is the licence of some face – and has its name
    for (const licence of LICENCES) {
      expect(facesUnder(licence).length, licence).toBeGreaterThan(0);
      expect(hasKey(`licences.names.${licence}`), licence).toBe(true);
    }
    // the faces the licences cover are the faces there are
    expect(LICENCES.flatMap((l) => facesUnder(l)).sort()).toEqual([...foreign].sort());
  });

  it('shows, for every face but the standard one, its name, its notice and the licence text', () => {
    render(<LicencesCard />);
    for (const id of FONT_IDS) {
      const section = screen.queryByTestId(`licence-face-${id}`);
      if (id === 'standard') {
        // the app's own face needs none
        expect(section).toBeNull();
        continue;
      }
      expect(section, id).not.toBeNull();
      expect(within(section!).getByRole('heading').textContent).toContain(
        t(`cam.text.fonts.${id}`),
      );
      expect(section!.textContent).toContain(t(`licences.sources.${id}`));
      // the notice as the library has it, whole
      expect(screen.getByTestId(`licence-notice-${id}`).textContent).toBe(FONT_CREDITS[id]);
      // and the licence it is under
      const licence = FACE_LICENCE[id];
      expect(screen.getByTestId(`licence-text-${licence}`).textContent).toContain(
        t(`cam.text.fonts.${id}`),
      );
    }
    // the acknowledgements the Hershey licence asks for are among what is shown
    const shown = screen.getByTestId('licences-card').textContent!;
    expect(shown).toContain('Dr. A. V. Hershey');
    expect(shown).toContain('James Hurt');
    expect(shown).toContain('Relief SingleLine Project Authors');
  });

  it('shows the licence texts as the files in licenses/ hold them – byte for byte', () => {
    render(<LicencesCard />);
    expect(screen.getByTestId('licence-pre-ofl').textContent).toBe(OFL);
    expect(screen.getByTestId('licence-pre-hershey').textContent).toBe(HERSHEY);
    expect(LICENCE_TEXTS).toEqual({ ofl: OFL, hershey: HERSHEY });
    // the text is no UI text: it is in no dictionary
    for (const dictionary of [JSON.stringify(de), JSON.stringify(en)]) {
      expect(dictionary).not.toContain('SIL OPEN FONT LICENSE');
      expect(dictionary).not.toContain('USE RESTRICTION');
    }
  });

  it('keeps the OFL text exactly as the upstream file: it must never be edited', () => {
    // sha256 of the OFL.txt of Relief SingleLine as fetched on 2026-11-27 (4404 bytes)
    expect(createHash('sha256').update(OFL).digest('hex')).toBe(
      '005834fd32a01fb021a44167cafd4fa3df8058a7b0fb7319bd19b445d2fe24a3',
    );
    expect(OFL).toContain('SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007');
    expect(OFL).toContain('Copyright 2022 The Relief SingleLine Project Authors');
  });

  it('shows the Hershey conditions as THIRD-PARTY.md quotes them', () => {
    const lines = file('THIRD-PARTY.md').split('\n');
    const from = lines.findIndex((l) =>
      l.startsWith('> The Hershey Fonts are a set of vector fonts'),
    );
    expect(from).toBeGreaterThan(0);
    const quote: string[] = [];
    for (let i = from; i < lines.length && lines[i]!.startsWith('>'); i++) {
      quote.push(lines[i]!.replace(/^> ?/, ''));
    }
    // (markdown writes the asterisks of *EXCEPT* escaped)
    expect(`${quote.join('\n').replace(/\\\*/g, '*')}\n`).toBe(HERSHEY);
    // the two acknowledgements and the one thing the licence excludes
    expect(HERSHEY).toContain('Dr. A. V. Hershey while working at the U. S. National');
    expect(HERSHEY).toContain('James Hurt, Cognition,');
    expect(HERSHEY).toContain('*EXCEPT* the format');
  });

  it('is said in THIRD-PARTY.md that the app shows them – and where', () => {
    const text = file('THIRD-PARTY.md');
    expect(text).toContain('Einstellungen → Maschine → Schriften und Lizenzen');
    expect(text).not.toContain('The app shows no licences screen yet');
    expect(text).not.toContain('open item of the wiring of the faces');
  });
});
