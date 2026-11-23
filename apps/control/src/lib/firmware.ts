import { selectImages, type FlashImage, type RadioVariant } from '@lowrider/fluidnc-client';
import { unzipSync } from 'fflate';

export interface FirmwareImage extends FlashImage {
  name: string;
  data: Uint8Array;
}

/**
 * Picks the flash images of one radio variant out of a FluidNC release zip.
 * littlefs.bin is never selected: it holds config.yaml.
 */
export function imagesFromZip(
  zip: Uint8Array,
  variant: RadioVariant = 'wifi',
): { images: FirmwareImage[] } | { missing: string[] } {
  const files = unzipSync(zip, { filter: (f) => f.name.endsWith('.bin') });
  const chosen = selectImages(Object.keys(files), variant);
  if ('missing' in chosen) return chosen;
  return { images: chosen.images.map((i) => ({ ...i, data: files[i.name]! })) };
}

export interface ReleaseInfo {
  tag: string;
  name: string;
  published: string;
  /** Download links of the release zips */
  assets: { name: string; url: string; size: number }[];
}

/** Releases of bdring/FluidNC from the GitHub API (the zips are downloaded by the browser). */
export async function fetchReleases(fetchFn: typeof fetch = fetch): Promise<ReleaseInfo[]> {
  const response = await fetchFn(
    'https://api.github.com/repos/bdring/FluidNC/releases?per_page=10',
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = (await response.json()) as {
    tag_name: string;
    name: string;
    published_at: string;
    assets: { name: string; browser_download_url: string; size: number }[];
  }[];
  return data.map((r) => ({
    tag: r.tag_name,
    name: r.name || r.tag_name,
    published: r.published_at,
    assets: r.assets
      .filter((a) => a.name.endsWith('.zip'))
      .map((a) => ({ name: a.name, url: a.browser_download_url, size: a.size })),
  }));
}
