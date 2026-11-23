import { KEEP_AWAKE_MP4, KEEP_AWAKE_WEBM } from './keepAwakeMedia';

/**
 * How the screen is being kept on right now:
 * `off` – not asked for; `system` – the browser's Screen Wake Lock is held;
 * `video` – the silent video plays instead; `waiting` – the video may only
 * start with the next touch; `failed` – this browser can do neither.
 */
export type KeepAwake = 'off' | 'system' | 'video' | 'waiting' | 'failed';

/** The part of a video element the fallback uses */
export interface KeepAwakeVideo {
  play(): Promise<void>;
  pause(): void;
  readonly paused: boolean;
  readonly duration: number;
  currentTime: number;
  loop: boolean;
  addEventListener(type: string, listener: () => void): void;
}

interface Sentinel {
  release(): Promise<void>;
  released?: boolean;
}

interface Options {
  /** Makes the fallback video; null where there is no document */
  createVideo?: () => KeepAwakeVideo | null;
  /** The page is visible (a hidden page needs no screen) */
  visible?: () => boolean;
  onChange?: (state: KeepAwake) => void;
  random?: () => number;
}

/**
 * A video element that is never shown: black, silent, but with a sound
 * track and not muted – only then does a browser treat it as a film that
 * keeps the display awake. It may only start from a touch.
 */
function createVideo(): KeepAwakeVideo | null {
  if (typeof document === 'undefined') return null;
  const video = document.createElement('video');
  video.setAttribute('title', 'LowRider Control');
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.preload = 'auto';
  for (const [type, src] of [
    ['video/mp4', KEEP_AWAKE_MP4],
    ['video/webm', KEEP_AWAKE_WEBM],
  ] as const) {
    const source = document.createElement('source');
    source.type = type;
    source.src = src;
    video.append(source);
  }
  return video;
}

/**
 * Keeps the tablet screen on while connected to the machine. First choice
 * is the Screen Wake Lock API (Safari on iPadOS 16.4+, Chrome) – but browsers
 * only offer it on https or localhost, and the app comes from the Pi over
 * plain http. There a silent, looping video does the same job: it starts
 * with the first touch (browsers demand that) and is paused as soon as the
 * screen may go dark again. The browser drops either one when the page is
 * hidden, so both are taken again on return.
 */
export class ScreenKeeper {
  private sentinel: Sentinel | null = null;
  private video: KeepAwakeVideo | null | undefined;
  private wanted = false;
  private current: KeepAwake = 'off';
  /** Counts apply() runs, so a slow answer does not overwrite a newer one */
  private run = 0;
  private readonly makeVideo: () => KeepAwakeVideo | null;
  private readonly visible: () => boolean;
  private readonly onChange: (state: KeepAwake) => void;
  private readonly random: () => number;

  constructor(
    private readonly nav: Navigator | undefined = typeof navigator === 'undefined'
      ? undefined
      : navigator,
    options: Options = {},
  ) {
    this.makeVideo = options.createVideo ?? createVideo;
    this.visible =
      options.visible ??
      (() => typeof document === 'undefined' || document.visibilityState === 'visible');
    this.onChange = options.onChange ?? (() => undefined);
    this.random = options.random ?? Math.random;
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => void this.apply());
    }
  }

  /** The browser has the Screen Wake Lock API (secure pages only) */
  get supported(): boolean {
    return !!this.nav && 'wakeLock' in this.nav;
  }

  get state(): KeepAwake {
    return this.current;
  }

  set(wanted: boolean): Promise<void> {
    this.wanted = wanted;
    return this.apply();
  }

  /**
   * Call from a touch, click or key press: the only moment a browser lets
   * the fallback video start.
   */
  gesture(): void {
    if (this.current === 'waiting') void this.apply();
  }

  private report(state: KeepAwake) {
    if (state === this.current) return;
    this.current = state;
    this.onChange(state);
  }

  private async apply(): Promise<void> {
    const run = ++this.run;
    const want = this.wanted && this.visible();
    if (!want) {
      await this.dropSentinel();
      if (this.video && !this.video.paused) this.video.pause();
      // A hidden page keeps its last answer; it is taken up again on return.
      if (!this.wanted) this.report('off');
      return;
    }
    if (this.supported) {
      if (this.sentinel !== null && !this.sentinel.released) {
        this.report('system');
        return;
      }
      try {
        const sentinel = await (
          this.nav as Navigator & { wakeLock: { request(t: 'screen'): Promise<Sentinel> } }
        ).wakeLock.request('screen');
        if (run !== this.run) {
          // No longer wanted by the time the browser answered.
          await sentinel.release().catch(() => undefined);
          return;
        }
        this.sentinel = sentinel;
        this.report('system');
        return;
      } catch {
        // refused (battery saver, policy): the video is the second way
        this.sentinel = null;
        if (run !== this.run) return;
      }
    }
    await this.playVideo(run);
  }

  private async dropSentinel(): Promise<void> {
    const s = this.sentinel;
    this.sentinel = null;
    if (s && !s.released) await s.release().catch(() => undefined);
  }

  private async playVideo(run: number): Promise<void> {
    if (this.video === undefined) {
      this.video = this.makeVideo();
      this.video?.addEventListener('loadedmetadata', () => {
        // The short clip simply loops.
        if (this.video && this.video.duration <= 1) this.video.loop = true;
      });
      this.video?.addEventListener('timeupdate', () => {
        // The long clip never reaches its end: it jumps back to a random spot
        // near the start, which keeps counting as playing where a loop does not.
        const v = this.video;
        if (v && v.duration > 1 && v.currentTime > 0.5) v.currentTime = this.random();
      });
      // The system paused it (app in the background, a phone call): take it up again.
      this.video?.addEventListener('pause', () => {
        if (this.wanted && this.visible() && this.current === 'video') void this.apply();
      });
    }
    const video = this.video;
    if (!video) {
      this.report('failed');
      return;
    }
    if (!video.paused) {
      this.report('video');
      return;
    }
    try {
      await video.play();
      if (run !== this.run) return;
      this.report('video');
    } catch (error) {
      if (run !== this.run) return;
      // Not allowed yet: the next touch may start it. Anything else will not get better.
      this.report((error as { name?: string })?.name === 'NotAllowedError' ? 'waiting' : 'failed');
    }
  }
}
