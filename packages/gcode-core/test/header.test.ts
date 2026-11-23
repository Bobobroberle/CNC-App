import { describe, expect, it } from 'vitest';
import { camInfo, ensureModalPreamble } from '../src';

const estlcam = `(Projekt Spie_kl)
(Erstellt mit Estlcam Version 11 Build 11,244)
(Laufzeit ca. 00:10:11 Stunden)

(Benötigte Werkzeuge:)
(Fräser 6mm lang)
(Planfraes)
(V-Nut 1,5 mm)

M03 S24000
G00 Z5.0000
G00 X-122.0000 Y170.1573
`;

describe('CAM header', () => {
  it('reads the generator and tools of an Estlcam file', () => {
    expect(camInfo(estlcam)).toEqual({
      generator: 'Estlcam 11',
      tools: [
        { number: null, name: 'Fräser 6mm lang', diameter: 6 },
        { number: null, name: 'Planfraes', diameter: null },
        { number: null, name: 'V-Nut 1,5 mm', diameter: 1.5 },
      ],
    });
  });

  it('reads the tool list of a Fusion 360 file', () => {
    const fusion =
      '%\n(1003)\n(T1 D=8 CR=0 - ZMIN=-17.4 - flat end mill)\n(T2  D=6. CR=3)\nG90 G94\n';
    expect(camInfo(fusion)).toEqual({
      generator: null,
      tools: [
        { number: 1, name: 'T1 D=8 CR=0 - ZMIN=-17.4 - flat end mill', diameter: 8 },
        { number: 2, name: 'T2  D=6. CR=3', diameter: 6 },
      ],
    });
    expect(camInfo('(Required tools:)\nG0 X1\n')).toEqual({ generator: null, tools: [] });
  });
});

describe('modal preamble', () => {
  it('puts safe modes in front of a file that moves without setting them', () => {
    const r = ensureModalPreamble(estlcam);
    expect(r.added).toBe(true);
    expect(r.text.split('\n')[0]).toBe('G21 G90 G17 G94 (LowRider Control: safe modes)');
    expect(r.text.endsWith(estlcam)).toBe(true);
    expect(ensureModalPreamble('G90\nG0 X1\nG21\n').added).toBe(true);
  });

  it('leaves files alone that set units and absolute distance before moving', () => {
    for (const text of ['G90 G21\nG0 X1\n', 'G20\nG90\nG1 X1 F10\n', 'G21 G90\n']) {
      expect(ensureModalPreamble(text)).toEqual({ text, added: false });
    }
  });
});
