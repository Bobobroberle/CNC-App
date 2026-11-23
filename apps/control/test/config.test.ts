import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { checkConfig } from '../src/lib/configCheck';
import { compactDiff, lineDiff } from '../src/lib/diff';
import { fetchReleases, imagesFromZip } from '../src/lib/firmware';

const stock = readFileSync(join(import.meta.dirname, '../../../machine/config.yaml'), 'utf8');

describe('config check', () => {
  it('accepts the stock LowRider config', () => {
    expect(checkConfig(stock).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('finds layout errors and implausible numbers', () => {
    const text = [
      'name: x',
      'axes:',
      '  x:',
      '    steps_per_mm: abc',
      '    max_travel_mm: -5',
      '\t  y:',
      '   odd: 1',
      'name: y',
      'nonsense line',
    ].join('\n');
    const codes = checkConfig(text).map((i) => `${i.code}:${i.line}:${i.detail}`);
    expect(codes).toEqual(
      expect.arrayContaining([
        'tab:6:',
        'indent:7:',
        'duplicate:8:name',
        'syntax:9:nonsense line',
        'no-board:0:',
        'missing-axis:0:Y',
        'missing-axis:0:Z',
        'not-number:4:x/steps_per_mm',
        'not-positive:5:x/max_travel_mm',
      ]),
    );
  });

  it('allows the same key under different parents', () => {
    const text =
      'board: j\naxes:\n  x:\n    max_travel_mm: 1\n  y:\n    max_travel_mm: 2\n  z:\n    max_travel_mm: 3\n';
    expect(checkConfig(text)).toEqual([]);
  });
});

describe('diff', () => {
  it('shows added and removed lines', () => {
    const d = lineDiff('a\nb\nc\nd', 'a\nB\nc\nd\ne');
    expect(d.map((l) => `${l.kind[0]}${l.text}`)).toEqual(['sa', 'db', 'aB', 'sc', 'sd', 'ae']);
    expect(lineDiff('a\nx', 'a').map((l) => l.kind)).toEqual(['same', 'del']);
  });

  it('keeps context around changes only', () => {
    const before = Array.from({ length: 20 }, (_, i) => `l${i}`).join('\n');
    const after = before.replace('l10', 'X');
    const c = compactDiff(lineDiff(before, after), 1);
    expect(c.map((l) => (l ? `${l.kind[0]}${l.text}` : '…'))).toEqual([
      '…',
      'sl9',
      'dl10',
      'aX',
      'sl11',
      '…',
    ]);
    expect(compactDiff(lineDiff('a', 'b'), 0).map((l) => l?.kind)).toEqual(['del', 'add']);
    const tail = compactDiff(lineDiff('a\nb\nc\nd', 'A\nb\nc\nd'), 0);
    expect(tail.map((l) => l?.kind ?? null)).toEqual(['del', 'add', null]);
  });
});

describe('firmware zip', () => {
  const zip = (names: string[]) => zipSync(Object.fromEntries(names.map((n) => [n, strToU8(n)])));

  it('selects the wifi images and never littlefs', () => {
    const r = imagesFromZip(
      zip([
        'fluidnc-v3.9.5-posix/wifi/bootloader.bin',
        'fluidnc-v3.9.5-posix/wifi/partitions.bin',
        'fluidnc-v3.9.5-posix/wifi/firmware.bin',
        'fluidnc-v3.9.5-posix/wifi/littlefs.bin',
        'fluidnc-v3.9.5-posix/common/boot_app0.bin',
        'fluidnc-v3.9.5-posix/install-wifi.sh',
      ]),
    );
    expect('images' in r).toBe(true);
    if (!('images' in r)) return;
    expect(
      r.images.map((i) => [
        i.address,
        new TextDecoder().decode(i.data).split('/').slice(-2).join('/'),
      ]),
    ).toEqual([
      [0x1000, 'wifi/bootloader.bin'],
      [0x8000, 'wifi/partitions.bin'],
      [0xe000, 'common/boot_app0.bin'],
      [0x10000, 'wifi/firmware.bin'],
    ]);
  });

  it('reports missing images', () => {
    expect(imagesFromZip(zip(['wifi/firmware.bin']))).toEqual({
      missing: ['wifi/bootloader.bin', 'wifi/partitions.bin', 'common/boot_app0.bin'],
    });
  });

  it('lists releases', async () => {
    const f = vi.fn(
      async () =>
        new Response(
          JSON.stringify([
            {
              tag_name: 'v3.9.5',
              name: '',
              published_at: '2026-01-01',
              assets: [
                {
                  name: 'fluidnc-v3.9.5-posix.zip',
                  browser_download_url: 'https://x/a.zip',
                  size: 5,
                },
                { name: 'notes.txt', browser_download_url: 'https://x/n', size: 1 },
              ],
            },
          ]),
        ),
    ) as unknown as typeof fetch;
    expect(await fetchReleases(f)).toEqual([
      {
        tag: 'v3.9.5',
        name: 'v3.9.5',
        published: '2026-01-01',
        assets: [{ name: 'fluidnc-v3.9.5-posix.zip', url: 'https://x/a.zip', size: 5 }],
      },
    ]);
    await expect(fetchReleases(async () => new Response('', { status: 403 }))).rejects.toThrow(
      '403',
    );
  });
});
