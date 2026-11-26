import { hasKey, t, tDynamic } from '../i18n';
import type { ClockReason } from './scanClock';

/**
 * The words for the clock of a scan: what the panel and the log say. The codes (`ClockReason`, the failure codes of the
 * stamped stream, the names of the headers) are stable and stay in the data; the operator reads German (or the other
 * language), and the raw code is shown beside it only as small detail.
 */

/**
 * Why the Pi's clock was not taken when the scan chose its clock, before anything moved: the reason's sentence and, for a
 * stream that could not be read, what more is known of it (a code the stream gave, as a sentence). A stream whose pictures
 * cannot be made into pixels (`no-decode`) has a sentence of its own: its stamps are fine.
 */
export function clockChoiceText(reason: ClockReason, detail?: string | null): string {
  if (reason !== 'stream' || !detail) return t(`photomap.clockWhy.${reason}`);
  if (detail === 'no-decode') return t('photomap.clockWhy.noDecode');
  const key = `photomap.clockDetail.${detail}`;
  return hasKey(key)
    ? `${t('photomap.clockWhy.stream')} – ${tDynamic(key, 'photomap.clockWhy.stream')}`
    : t('photomap.clockWhy.stream');
}

/** Why the Pi's clock went away in the middle of a scan (not the same sentences as at the choice: the connection was fine then) */
export function clockLostText(reason: ClockReason): string {
  return reason === 'device' ? t('photomap.clockWhy.device') : t(`photomap.clockLostWhy.${reason}`);
}

/** The header the stamps are read from, in words (the header's own name is shown beside it, small) */
export function stampSourceText(source: string): string {
  return tDynamic(`photomap.clock.sources.${source}`, 'photomap.clock.sources.other');
}
