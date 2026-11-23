import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeProgram, LOWRIDER_V4_KINEMATICS, type Bounds } from '../src';

const dir = join(import.meta.dirname, 'golden');
const files = readdirSync(dir).filter((f) => f.endsWith('.nc'));

const round = (v: number, digits = 3) => Number(v.toFixed(digits));
const roundBounds = (b: Bounds) => ({
  min: { x: round(b.min.x), y: round(b.min.y), z: round(b.min.z), a: round(b.min.a) },
  max: { x: round(b.max.x), y: round(b.max.y), z: round(b.max.z), a: round(b.max.a) },
});

describe('golden files', () => {
  it('has samples', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(file, async () => {
      const text = readFileSync(join(dir, file), 'utf8');
      const a = analyzeProgram(text, { kinematics: LOWRIDER_V4_KINEMATICS });
      const motions: Record<string, number> = {};
      for (const s of a.segments) motions[s.motion] = (motions[s.motion] ?? 0) + 1;
      const summary = {
        lineCount: a.lineCount,
        segments: a.segments.length,
        motions,
        events: a.events.map((e) => `${e.kind}@${e.lineIndex + 1}`),
        diagnostics: a.diagnostics.map((d) => `${d.severity}:${d.code}@${d.lineIndex + 1}`),
        bounds: roundBounds(a.bounds),
        cutBounds: roundBounds(a.cutBounds),
        tools: a.tools,
        usesRotary: a.usesRotary,
        feedRange: a.feedRange,
        rapidLength: round(a.rapidLength),
        feedLength: round(a.feedLength),
        estimatedSeconds: round(a.timeline!.total, 1),
      };
      await expect(`${JSON.stringify(summary, null, 2)}\n`).toMatchFileSnapshot(
        join(dir, file.replace(/\.nc$/, '.golden.json')),
      );
    });
  }
});
