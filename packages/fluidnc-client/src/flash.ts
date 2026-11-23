/**
 * Firmware images of a FluidNC release zip and where they go in flash
 * (from the release's install scripts). The littlefs partition at 0x3d0000
 * holds config.yaml and is never written, so an update keeps the config.
 */
export type RadioVariant = 'wifi' | 'bt' | 'noradio';

export interface FlashImage {
  /** Path inside the release zip, relative to the variant folders */
  file: string;
  address: number;
}

export const FLASH_SETTINGS = {
  chip: 'esp32',
  baudRate: 230400,
  flashMode: 'dio',
  flashFreq: '80m',
  flashSize: 'detect',
} as const;

export const LITTLEFS_ADDRESS = 0x3d0000;

export function flashLayout(variant: RadioVariant = 'wifi'): FlashImage[] {
  return [
    { file: `${variant}/bootloader.bin`, address: 0x1000 },
    { file: `${variant}/partitions.bin`, address: 0x8000 },
    { file: 'common/boot_app0.bin', address: 0xe000 },
    { file: `${variant}/firmware.bin`, address: 0x10000 },
  ];
}

/**
 * Picks the images of a variant from the zip's file names (which may sit in a
 * top folder such as `fluidnc-v3.9.5-posix/`). Returns the missing files if
 * the zip is incomplete.
 */
export function selectImages(
  names: readonly string[],
  variant: RadioVariant = 'wifi',
): { images: (FlashImage & { name: string })[] } | { missing: string[] } {
  const images: (FlashImage & { name: string })[] = [];
  const missing: string[] = [];
  for (const image of flashLayout(variant)) {
    const name = names.find((n) => n === image.file || n.endsWith(`/${image.file}`));
    if (name) images.push({ ...image, name });
    else missing.push(image.file);
  }
  return missing.length > 0 ? { missing } : { images };
}

/** Version from a release zip name, e.g. `fluidnc-v3.9.5-posix.zip` → `v3.9.5`. */
export function releaseVersion(fileName: string): string | null {
  return /v\d+\.\d+\.\d+[\w.-]*?(?=-(?:posix|win64|macos)|\.zip$|$)/i.exec(fileName)?.[0] ?? null;
}
