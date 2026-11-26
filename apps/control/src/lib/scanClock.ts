/**
 * Which clock a strip scan puts its pictures on the time line with – decided once per scan, all or nothing.
 *
 * A picture of a run is put where the camera was when it was taken, and that is told by a clock: the position of the
 * machine at a time. There are two ways to have both on one clock:
 *
 * - **`pi`** – the companion's relay stamps every report of FluidNC with the Pi's clock (`RelayStamp`), and the Pi's
 *   camera server stamps every picture (`lib/frameStamp.ts`). Both are the Pi's, so no browser delay or jitter is in
 *   either. It holds only where reports *and* pictures are stamped and the two stamps are in the same clock.
 * - **`browser`** – both are stamped when this page sees them (what the app always did). Late by an unknown, uneven time;
 *   the constant part is learned (`stripLag`).
 *
 * A mixture is silently wrong (a picture's Pi stamp against a report's arrival here is off by the clock offset – hours,
 * or decades), so a scan is one or the other. The decision is made from what is known before the strip runs, in two
 * steps – what rules the Pi out before a stream is opened at all (`clockBlocker`), and what the opened stream says
 * (`clockFromStream`). Pure: the store gathers the facts.
 */
import type { RelayStamp } from '@lowrider/fluidnc-client';
import { domainFits, type FrameStamp, type StampDomain } from './frameStamp';
import type { PositionTrack } from './strips';

/**
 * Why the Pi's clock was not used although a Pi is part of the connection – stable keys, the panel words them:
 * - `relay`: the reports come without a stamp (an older companion, or the relay was not asked)
 * - `device`: the camera is not a stream of the Pi (the device's own camera, none) – there is nothing to read stamps from
 * - `stream`: the stream cannot be read by this page with stamps (the server, the browser, the stream itself)
 * - `window`: the stamps of the pictures are not in the clock of the reports
 */
export type ClockReason = 'relay' | 'device' | 'stream' | 'window';

export interface PiClock {
  kind: 'pi';
  domain: StampDomain;
  /** The header the picture stamps are read from (`x-ustreamer-grab-begin-time` …) */
  source: string;
}

export interface BrowserClock {
  kind: 'browser';
  /** Why not the Pi's, where one was to be had; null where no Pi is part of the connection (nothing to say) */
  reason: ClockReason | null;
  /** More of the reason for a stream that could not be used: its failure code (never an address) */
  detail?: string;
}

export type ScanClock = PiClock | BrowserClock;

export const BROWSER_CLOCK: BrowserClock = { kind: 'browser', reason: null };

/**
 * One name per clock: what was learned about the lag of the pictures (a number of seconds in *that* clock) is kept per
 * name and only used under the same one.
 */
export function clockKey(clock: ScanClock): string {
  return clock.kind === 'pi' ? `pi:${clock.domain}:${clock.source}` : 'browser';
}

/** The seconds of a report's relay stamp in the given clock (`RelayStamp` is in ms). */
export function reportSeconds(stamp: RelayStamp, domain: StampDomain): number {
  return (domain === 'mono' ? stamp.mono : stamp.wall) / 1000;
}

export interface ClockFacts {
  /** A Pi is part of the connection: the companion relays FluidNC (or the simulator plays one) */
  piConfigured: boolean;
  /** The stamp of the newest status report, null where it came without one */
  reportStamp: RelayStamp | null;
  /** The camera is a stream whose address is known – a device camera or none cannot be read for stamps */
  streamAvailable: boolean;
}

/**
 * What rules the Pi's clock out before anything is opened: no Pi at all (nothing to explain), reports without a stamp,
 * a camera that is no stream. Null where the stream is worth trying.
 */
export function clockBlocker(facts: ClockFacts): BrowserClock | null {
  if (!facts.piConfigured) return BROWSER_CLOCK;
  if (!facts.reportStamp) return { kind: 'browser', reason: 'relay' };
  if (!facts.streamAvailable) return { kind: 'browser', reason: 'device' };
  return null;
}

export interface StreamFacts {
  /** The stream opened and delivered a stamped picture */
  ok: boolean;
  /** Why not – `StampedFailure` (a code) */
  reason?: string;
  /** The stamp of the newest picture, null where there is none */
  frame: FrameStamp | null;
  /** The stamp of the newest report (it was there at `clockBlocker`) */
  reportStamp: RelayStamp | null;
  /** How far apart the two may lie (`STAMP_WINDOW_S`) */
  windowS?: number;
}

/** What an opened stream decides: the Pi's clock where its stamps fit the reports', else the browser's with the reason. */
export function clockFromStream(facts: StreamFacts): ScanClock {
  if (!facts.ok || !facts.frame)
    return facts.reason === undefined
      ? { kind: 'browser', reason: 'stream' }
      : { kind: 'browser', reason: 'stream', detail: facts.reason };
  // the reports lost their stamp meanwhile: nothing to compare with, and nothing to run by
  if (!facts.reportStamp) return { kind: 'browser', reason: 'relay' };
  if (!domainFits(facts.frame, facts.reportStamp, facts.windowS))
    return { kind: 'browser', reason: 'window' };
  return { kind: 'pi', domain: facts.frame.domain, source: facts.frame.source };
}

/** What `pickStripFrames` needs to know about the run */
export interface PickOptions {
  /** The reports of the run, in the clock of the pictures */
  track: PositionTrack;
  /** The lag the pictures have, s: a picture stamped `t` shows where the camera was at `t − lag` */
  lag: number;
  /** Where the run began, along the strip, mm */
  startAlong: number;
  /** Stamps (the clock of the pictures, s) of the first and the last report that said the machine was jogging */
  jogFrom: number;
  jogTo: number;
  /** A picture closer than this to the start is the one taken there at rest (its anchor), mm */
  minFromStart?: number;
  /** Most pictures to take; more are thinned evenly */
  max: number;
}

/**
 * The pictures of a run to put on the map from the ones the stream kept: those the camera took while it was jogging –
 * the reports' span with the lag allowed for – and at least `minFromStart` (3 mm, as the browser's path) away from where
 * it began. A picture the reports cannot place (fewer than two) is not taken: its position would be a guess outside them.
 * Oldest first; thinned evenly past `max`.
 */
export function pickStripFrames<F extends { stamp: { t: number } }>(
  frames: readonly F[],
  o: PickOptions,
): F[] {
  const minFromStart = o.minFromStart ?? 3;
  const moving = frames.filter((f) => {
    const at = f.stamp.t - o.lag;
    if (at < o.jogFrom || at > o.jogTo) return false;
    const fit = o.track.fit(at);
    return fit !== null && Math.abs(fit.position - o.startAlong) >= minFromStart;
  });
  if (moving.length <= o.max) return moving;
  // evenly across the run, first and last included
  return Array.from(
    { length: o.max },
    (_, i) => moving[o.max === 1 ? 0 : Math.round((i * (moving.length - 1)) / (o.max - 1))]!,
  );
}

/**
 * The scatter of the clock over a whole scan, ms: the strips' own figures (`timingNoiseMs`) taken together, each weighted by
 * the pictures it was worked out from (root mean square). Null where no strip had enough pictures moving fast enough.
 */
export function pooledNoise(strips: readonly { ms: number; count: number }[]): number | null {
  const count = strips.reduce((n, s) => n + s.count, 0);
  if (count === 0) return null;
  return Math.sqrt(strips.reduce((sum, s) => sum + s.count * s.ms ** 2, 0) / count);
}

/**
 * How old the newest picture of the stream may be when the clock is checked between two strips, ms (page time): a stream
 * that has delivered nothing for this long is a stream that stopped, whatever its last stamp said.
 */
export const STALE_PICTURE_MS = 5000;

export interface HoldFacts {
  /** The stream of stamped pictures is still alive */
  streamOk: boolean;
  /** The stamp of the newest report (null: it came without one) */
  reportStamp: RelayStamp | null;
  /** The newest picture the stream kept, with its stamp and when the page got it (null: none kept yet) */
  newest: { stamp: FrameStamp; arrival: number } | null;
  /** The page's clock now, ms (`performance.now()`) */
  nowMs: number;
  windowS?: number;
  staleMs?: number;
}

/**
 * Whether the Pi's clock still holds between two strips, or why it does not: the stream ended (`stream`), the reports lost
 * their stamp (`relay`), the newest picture is a stale one – the stream stopped delivering (`stream`) – or its stamp left the
 * window around the newest report's (`window`: the Pi's clock was set, a driver changed its mind). Null while it holds, and where
 * there is no picture yet to compare. **The newest picture must be a fresh one** – the caller keeps the stream's spacing short
 * between the runs – or a slow run's long spacing would be mistaken for a clock that went away.
 */
export function clockLost(facts: HoldFacts): ClockReason | null {
  if (!facts.streamOk) return 'stream';
  if (!facts.reportStamp) return 'relay';
  if (!facts.newest) return null;
  if (facts.nowMs - facts.newest.arrival > (facts.staleMs ?? STALE_PICTURE_MS)) return 'stream';
  return domainFits(facts.newest.stamp, facts.reportStamp, facts.windowS) ? null : 'window';
}
