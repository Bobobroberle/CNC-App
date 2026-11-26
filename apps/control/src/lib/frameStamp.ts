/**
 * The stamp a camera picture carries on the Pi, and how it is compared with the stamp of a status report.
 *
 * A strip scan places its pictures by *when* they were taken. The browser's own clock cannot say that – a picture
 * is seen late, by an unknown time and unevenly – so the Pi's camera server (ustreamer) is asked for the time it
 * puts on each picture (`/stream?extra_headers=1`, parsed by `lib/mjpeg.ts`), and the relay of the companion stamps
 * every status report of FluidNC with its own clock (`RelayStamp`: `mono` and `wall`, in ms). Picture and report
 * can be put on one time line only if both come from the same clock: `domainFits` is the run-time check of that.
 *
 * ## What ustreamer sends per part on /stream – only what was read in its source
 *
 * Read in `server.c` of v4.13, v5.0, v5.41, v6.0, v6.20 and of the master branch (of 2026-11; master's `libs/tools.h`
 * for the time helpers). Part framing in all of them: `--boundarydonotcross CRLF`,
 * the part's headers, the JPEG, `CRLF --boundarydonotcross CRLF`; the response is HTTP/1.0 (no chunking) with
 * `Content-Type: multipart/x-mixed-replace;boundary=boundarydonotcross`.
 *
 *   header                           from                     unit / clock                                 value
 *   -------------------------------  -----------------------  -------------------------------------------  ------------------------------------
 *   X-Timestamp                      v4.13 … master (always)  seconds, CLOCK_REALTIME (wall)               the moment the part's header was
 *                                                                                                          written for sending – **send time**
 *   X-UStreamer-Grab-Time            v4.13 … v6.20            seconds, CLOCK_MONOTONIC as far as it is     `frame->grab_ts`
 *                                    (`extra_headers=1`)      the driver's; see below
 *   X-UStreamer-Grab-Begin-Time      master (`extra_headers`) the same                                     `frame->grab_begin_ts`
 *   X-UStreamer-Grab-End-Time        master (`extra_headers`) seconds, CLOCK_MONOTONIC of ustreamer        `frame->grab_end_ts`: its own clock
 *                                                                                                          right after it took the buffer
 *   X-UStreamer-Send-Time, -Latency  v4.13 … master           seconds, CLOCK_MONOTONIC of ustreamer        the send time again (not used)
 *   X-UStreamer-Online               v4.13 … master           `true` / `false`                             `false`: a placeholder picture,
 *                                                                                                          not the camera's
 *
 * - Every number is printed `%.06Lf` (seconds with six decimals) from a value ustreamer **rounded to milliseconds**
 *   (`us_get_now` in master's `libs/tools.h`: `round(tv_nsec / 1e6)`; the time helper of the older versions was not
 *   available here – the app does not depend on the rounding). The resolution of every stamp is 1 ms.
 * - **Where the grab time comes from** (seen only for v6.20 and master): the V4L2 buffer's own timestamp
 *   (`buf.timestamp`, cut to ms) – the *driver's* clock. Which clock that is, ustreamer does not say; general V4L2
 *   knowledge (not from the source) is CLOCK_MONOTONIC for most drivers and the real-time clock for some. In master `Grab-End-Time` is ustreamer's own `us_get_now_monotonic()` taken after the buffer was
 *   dequeued, so it is certainly monotonic but later than the exposure by the transfer and the dequeue (the part of
 *   the delay that jitters). For v4.13 – v6.0 the capture source was not seen (`cap_v5.41_capture.c` was a 404 stub), so
 *   what `grab_ts` is there is **not known** from the source.
 * - `X-Timestamp` is taken when the part is written, so it is *not* the time of the picture: a picture that waited in
 *   ustreamer for the network carries a later one. It is used only where no grab time comes.
 * - With `advance_headers=1` ustreamer sends **no** `Content-Length` and **no** `X-UStreamer-*` headers, and the
 *   `X-Timestamp` there is the time the headers of the *next* picture were written. The app never asks for it.
 * - **A picture is sent again** when ustreamer got no new one for more than a second (`_http_refresher`, "Repeating
 *   exposed", in every version read): the same frame, the same grab time – but a new `X-Timestamp`. Hence a picture is
 *   told to be a repeat by its grab time where there is one, and by its bytes where there is not
 *   (`store/stampedFrames.ts`).
 * - The app asks for `extra_headers=1` itself; a server that does not act on it (ustreamer reads only the query names
 *   it knows – `PARSE_PARAM`) sends the `X-Timestamp` alone.
 *
 * The Pi's real ustreamer version is not known; `stampOf` takes what is there, in the order of what is best, and says
 * which header it took (`source`). `domainFits` then checks the claim "this is the clock the reports are in".
 */
import type { RelayStamp } from '@lowrider/fluidnc-client';

/** `mono`: the Pi's CLOCK_MONOTONIC (the clock of the grab times); `wall`: its real-time clock (`X-Timestamp`) */
export type StampDomain = 'mono' | 'wall';

export interface FrameStamp {
  domain: StampDomain;
  /** Seconds in that clock (the headers' unit; a `RelayStamp` is in ms – convert in `stampOffsetS` only) */
  t: number;
  /** The header it was read from, lower case */
  source: string;
}

/**
 * How far a picture's stamp may lie from the newest report's stamp of the same clock, s, for the clock to count as
 * the same one. A picture arrives a fraction of a second after its report at most; a driver that stamps with
 * another clock is off by hours or by decades.
 */
export const STAMP_WINDOW_S = 3;

/** The headers a stamp is read from, best first */
const SOURCES: readonly { header: string; domain: StampDomain }[] = [
  // master: the driver's own buffer timestamp – nearest to the exposure
  { header: 'x-ustreamer-grab-begin-time', domain: 'mono' },
  // v4.13 … v6.20: `grab_ts`
  { header: 'x-ustreamer-grab-time', domain: 'mono' },
  // master: ustreamer's own clock after the buffer was taken – certainly monotonic, but later
  { header: 'x-ustreamer-grab-end-time', domain: 'mono' },
  // every version: the time of sending
  { header: 'x-timestamp', domain: 'wall' },
];

/** Seconds as ustreamer prints them (`%.06Lf`): digits, a point, digits – nothing else, and more than zero */
function seconds(value: string | undefined): number | null {
  if (value === undefined || !/^\d{1,12}(?:\.\d{1,9})?$/.test(value.trim())) return null;
  const t = Number(value);
  return Number.isFinite(t) && t > 0 ? t : null;
}

/**
 * The stamp of a picture from the headers of its part (names in lower case, as `lib/mjpeg.ts` gives them), or
 * null where none is usable. A header that is there but is no positive number (a driver that gave no time:
 * `0.000000`) is passed over for the next one.
 */
export function stampOf(headers: Readonly<Record<string, string>>): FrameStamp | null {
  for (const { header, domain } of SOURCES) {
    const t = seconds(headers[header]);
    if (t !== null) return { domain, t, source: header };
  }
  return null;
}

/** Whether the part is a picture of the camera: ustreamer marks the placeholder it sends while the camera is away `false` */
export function isOnline(headers: Readonly<Record<string, string>>): boolean {
  return headers['x-ustreamer-online']?.trim().toLowerCase() !== 'false';
}

/** The stamp's time minus the report stamp's time in the same clock, s (a `RelayStamp` is in ms). */
export function stampOffsetS(stamp: FrameStamp, clock: RelayStamp): number {
  return stamp.t - (stamp.domain === 'mono' ? clock.mono : clock.wall) / 1000;
}

/**
 * Whether the picture's stamp is in the clock the reports are in: it lies within `windowS` of the latest report's stamp
 * of the same domain. Where it does not, the two are not one clock (the driver stamps its buffers with another one,
 * the Pi's clock was set meanwhile) and the scan must use the browser's clock instead – never a mixture.
 */
export function domainFits(
  stamp: FrameStamp,
  clock: RelayStamp,
  windowS: number = STAMP_WINDOW_S,
): boolean {
  const offset = stampOffsetS(stamp, clock);
  return Number.isFinite(offset) && Math.abs(offset) <= windowS;
}

/**
 * One camera picture with its place on the Pi's time line. What the scan needs of a source of pictures:
 * the stamp, when the page got it (for the recording and for the checks) and – on request, never before – the pixels.
 */
export interface SourceFrame {
  stamp: FrameStamp;
  /** `performance.now()` of the page when the picture arrived (ms) */
  arrival: number;
}

/** What `decode` gives: anything `drawImage` takes and the scan can read pixels from */
export type Drawable = ImageBitmap | HTMLCanvasElement | OffscreenCanvas;

/**
 * A source of stamped pictures. The stamped stream of the camera server implements it (`store/stampedFrames.ts`), and
 * so does the simulator's camera (it has canvases, not JPEGs – hence `decode` gives something drawable).
 *
 * - `ok` is live: false from the moment the source can deliver no more (it ended, failed, was closed, or never
 *   opened); `reason` then says why, as a stable code. What was kept stays readable.
 * - `domain` is the clock all frames are in, once known (null before the first stamp).
 * - During a run only stamps and bytes are copied; pixels exist only after `decode`.
 * - The source holds a bounded number of pictures and lets the oldest go first, which would cut off the start of a run
 *   that overflows it. The scan therefore says how closely it wants the pictures (`setMinSpacing`, from the distance
 *   between the pictures it takes and the speed of the run), which keeps a run far below the bound. `evicted` counts what
 *   was pushed out; the scan puts it into the recording (`stamped-pictures`) and does nothing else with it – the solver
 *   places the pictures that are there, and what a run left out is scanned by stops afterwards.
 */
export interface FrameSource<F extends SourceFrame = SourceFrame> {
  readonly ok: boolean;
  readonly reason?: string;
  readonly domain: StampDomain | null;
  /** How many kept pictures were pushed out of the ring by newer ones since the source began */
  readonly evicted: number;
  /** The least distance between two pictures kept, s – what the scan wants per strip (a bad number changes nothing) */
  setMinSpacing(seconds: number): void;
  /** The frames kept now, oldest first (a copy of the list) */
  frames(): readonly F[];
  /** Pixels of one frame – null where it cannot be decoded. The caller releases it (`releaseDrawable`). */
  decode(frame: F): Promise<Drawable | null>;
  /** Forgets the frames kept (the start of a new strip) */
  clear(): void;
  close(): void;
}

/** Frees the memory behind a decoded picture where it has a way to (an `ImageBitmap` does). */
export function releaseDrawable(drawable: Drawable | null) {
  if (drawable && 'close' in drawable && typeof drawable.close === 'function') drawable.close();
}
