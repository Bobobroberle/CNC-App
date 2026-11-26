import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { clockChoiceText, clockLostText, stampSourceText } from '../src/lib/clockText';
import type { ClockReason } from '../src/lib/scanClock';

// The panel and the log say why the Pi's clock was not used in the operator's words – never a bare code or header name.

const REASONS: ClockReason[] = ['relay', 'device', 'stream', 'window'];

/** The failure codes of the stamped stream, read from its source so that a new code cannot come without a German sentence */
function failureCodes(): string[] {
  const source = readFileSync(new URL('../src/store/stampedFrames.ts', import.meta.url), 'utf8');
  const declaration = /export type StampedFailure =([^;]*);/.exec(source)![1]!;
  return [...declaration.matchAll(/^\s*\|\s*'([a-z-]+)'/gm)].map((m) => m[1]!);
}

describe('the words for why the Pi’s clock was not used', () => {
  it('has a sentence for every reason at the choice, and none is the bare key', () => {
    for (const reason of REASONS) {
      const text = clockChoiceText(reason);
      expect(text.length, reason).toBeGreaterThan(20);
      expect(text, reason).not.toMatch(/photomap\./);
    }
  });

  it('knows every failure code of the stream (and the one the scan adds): a sentence with the cause, the code itself not in it', () => {
    const codes = failureCodes();
    // the read of the source found them all (a typo in the pattern would find none)
    expect(codes).toEqual(
      expect.arrayContaining([
        'no-fetch',
        'unreachable',
        'no-body-stream',
        'read-failed',
        'closed',
      ]),
    );
    expect(codes.length).toBeGreaterThanOrEqual(13);
    for (const code of codes) {
      const text = clockChoiceText('stream', code);
      expect(text, code).toContain(clockChoiceText('stream'));
      expect(text.length, code).toBeGreaterThan(clockChoiceText('stream').length + 10);
      expect(text, code).not.toContain(code);
      expect(text, code).not.toMatch(/photomap\./);
    }
  });

  it('says of pictures that cannot be made into pixels that they cannot – not that the stream cannot be read', () => {
    const text = clockChoiceText('stream', 'no-decode');
    expect(text).toMatch(/Pixel/);
    expect(text).not.toContain('Zeitstempeln lesen');
    expect(text).not.toContain('no-decode');
  });

  it('keeps to the plain sentence for a code it does not know, and for the other reasons whatever detail comes', () => {
    expect(clockChoiceText('stream', 'something-new')).toBe(clockChoiceText('stream'));
    expect(clockChoiceText('window', 'no-fetch')).toBe(clockChoiceText('window'));
    expect(clockChoiceText('relay', null)).toBe(clockChoiceText('relay'));
  });

  it('tells a clock that went away during the scan in other words than one that never was there', () => {
    for (const reason of ['relay', 'stream', 'window'] as const) {
      const lost = clockLostText(reason);
      expect(lost.length, reason).toBeGreaterThan(20);
      expect(lost, reason).not.toMatch(/photomap\./);
      expect(lost, reason).not.toBe(clockChoiceText(reason));
    }
    // "not connected through the Pi" cannot be said of a connection that was up when the scan began
    expect(clockLostText('relay')).not.toMatch(/nicht über den Pi verbunden|älterer Companion/);
    expect(clockLostText('stream')).toMatch(/abgerissen|keine neuen Bilder/);
    // a reason that cannot happen mid-scan still has words
    expect(clockLostText('device')).toBe(clockChoiceText('device'));
  });

  it('names the header the stamp is read from in words, and a header it does not know in neutral ones', () => {
    for (const header of [
      'x-ustreamer-grab-begin-time',
      'x-ustreamer-grab-time',
      'x-ustreamer-grab-end-time',
      'x-timestamp',
    ]) {
      const text = stampSourceText(header);
      expect(text, header).not.toContain(header);
      expect(text, header).not.toMatch(/photomap\./);
    }
    expect(stampSourceText('x-ustreamer-grab-time')).toMatch(/Aufnahmezeit/);
    expect(stampSourceText('x-timestamp')).toMatch(/Sendezeit/);
    expect(stampSourceText('x-something-else')).toBe(stampSourceText('x-other-thing'));
    expect(stampSourceText('x-something-else')).not.toContain('x-something-else');
  });
});
