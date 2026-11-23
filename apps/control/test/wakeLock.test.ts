import { describe, expect, it, vi } from 'vitest';
import { KEEP_AWAKE_MP4, KEEP_AWAKE_WEBM } from '../src/lib/keepAwakeMedia';
import { ScreenKeeper, type KeepAwake, type KeepAwakeVideo } from '../src/lib/wakeLock';

/** A video element that plays when allowed. */
function fakeVideo(allow: { value: boolean | 'broken' }) {
  const listeners = new Map<string, () => void>();
  const video = {
    paused: true,
    duration: 10,
    currentTime: 0,
    loop: false,
    plays: 0,
    play: vi.fn(async () => {
      video.plays++;
      if (allow.value === 'broken')
        throw Object.assign(new Error('no codec'), { name: 'NotSupportedError' });
      if (!allow.value) throw Object.assign(new Error('gesture'), { name: 'NotAllowedError' });
      video.paused = false;
    }),
    pause: vi.fn(() => {
      video.paused = true;
    }),
    addEventListener: (type: string, listener: () => void) => void listeners.set(type, listener),
    fire: (type: string) => listeners.get(type)?.(),
  };
  return video satisfies KeepAwakeVideo;
}

/** A keeper on plain http: no Screen Wake Lock API, only the video. */
function onHttp(allowed: boolean | 'broken' = false) {
  const allow = { value: allowed };
  const video = fakeVideo(allow);
  const states: KeepAwake[] = [];
  const page = { visible: true };
  const keeper = new ScreenKeeper({} as Navigator, {
    createVideo: () => video,
    visible: () => page.visible,
    onChange: (s) => states.push(s),
    random: () => 0.25,
  });
  return { keeper, video, states, allow, page };
}

/** Lets the promises of an un-awaited apply() settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('ScreenKeeper with the Screen Wake Lock API', () => {
  it('requests and releases the screen lock', async () => {
    const release = vi.fn(async () => undefined);
    const request = vi.fn(async () => ({ release, released: false }));
    const states: KeepAwake[] = [];
    const keeper = new ScreenKeeper({ wakeLock: { request } } as unknown as Navigator, {
      onChange: (s) => states.push(s),
      visible: () => true,
      createVideo: () => null,
    });
    expect(keeper.supported).toBe(true);
    expect(keeper.state).toBe('off');
    await keeper.set(true);
    await keeper.set(true);
    expect(request).toHaveBeenCalledTimes(1);
    expect(keeper.state).toBe('system');
    await keeper.set(false);
    expect(release).toHaveBeenCalledTimes(1);
    await keeper.set(false);
    expect(release).toHaveBeenCalledTimes(1);
    expect(states).toEqual(['system', 'off']);
  });

  it('takes the lock again after the browser dropped it', async () => {
    const sentinels: { release: () => Promise<void>; released: boolean }[] = [];
    const request = vi.fn(async () => {
      const s = { release: vi.fn(async () => undefined), released: false };
      sentinels.push(s);
      return s;
    });
    const page = { visible: true };
    const keeper = new ScreenKeeper({ wakeLock: { request } } as unknown as Navigator, {
      visible: () => page.visible,
      createVideo: () => null,
    });
    await keeper.set(true);
    // The page was hidden: the browser released the lock by itself.
    sentinels[0]!.released = true;
    page.visible = false;
    await keeper.set(true);
    expect(request).toHaveBeenCalledTimes(1);
    expect(keeper.state).toBe('system');
    page.visible = true;
    await keeper.set(true);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('falls back to the video when the browser refuses the lock', async () => {
    const allow = { value: true as boolean | 'broken' };
    const video = fakeVideo(allow);
    const keeper = new ScreenKeeper(
      {
        wakeLock: { request: async () => Promise.reject(new Error('battery saver')) },
      } as unknown as Navigator,
      { createVideo: () => video, visible: () => true },
    );
    await keeper.set(true);
    expect(keeper.state).toBe('video');
    expect(video.paused).toBe(false);
  });

  it('says so when it can do neither', async () => {
    const keeper = new ScreenKeeper(
      {
        wakeLock: { request: async () => Promise.reject(new Error('hidden')) },
      } as unknown as Navigator,
      { createVideo: () => null, visible: () => true },
    );
    await expect(keeper.set(true)).resolves.toBeUndefined();
    expect(keeper.state).toBe('failed');
    const none = new ScreenKeeper({} as Navigator, {
      createVideo: () => null,
      visible: () => true,
    });
    expect(none.supported).toBe(false);
    await none.set(true);
    expect(none.state).toBe('failed');
    expect(new ScreenKeeper(undefined).supported).toBe(false);
  });

  it('releases a lock that arrives after it is no longer wanted', async () => {
    const release = vi.fn(async () => undefined);
    let answer: (s: unknown) => void = () => undefined;
    const request = vi.fn(() => new Promise((resolve) => (answer = resolve)));
    const keeper = new ScreenKeeper({ wakeLock: { request } } as unknown as Navigator, {
      visible: () => true,
      createVideo: () => null,
    });
    const first = keeper.set(true);
    const off = keeper.set(false);
    answer({ release, released: false });
    await Promise.all([first, off]);
    expect(release).toHaveBeenCalledTimes(1);
    expect(keeper.state).toBe('off');
  });
});

describe('ScreenKeeper on plain http (silent video)', () => {
  it('ships both clips as data, so nothing has to be fetched', () => {
    expect(KEEP_AWAKE_MP4.startsWith('data:video/mp4;base64,')).toBe(true);
    expect(KEEP_AWAKE_WEBM.startsWith('data:video/webm;base64,')).toBe(true);
    // "ftyp" at byte 4 of an MP4, the EBML magic at the start of a WebM
    expect(Buffer.from(KEEP_AWAKE_MP4.split(',')[1]!, 'base64').subarray(4, 8).toString()).toBe(
      'ftyp',
    );
    expect(
      Buffer.from(KEEP_AWAKE_WEBM.split(',')[1]!, 'base64').subarray(0, 4).toString('hex'),
    ).toBe('1a45dfa3');
  });

  it('waits for a touch, then plays; pauses when the screen may go dark', async () => {
    const { keeper, video, states, allow } = onHttp(false);
    await keeper.set(true);
    expect(keeper.state).toBe('waiting');
    // A touch while the browser still refuses changes nothing.
    keeper.gesture();
    await settle();
    expect(keeper.state).toBe('waiting');
    allow.value = true;
    keeper.gesture();
    // play() is called inside the touch itself, not a tick later.
    expect(video.play).toHaveBeenCalledTimes(3);
    await settle();
    expect(keeper.state).toBe('video');
    // Further touches do not start it again.
    keeper.gesture();
    await settle();
    expect(video.play).toHaveBeenCalledTimes(3);
    await keeper.set(false);
    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(keeper.state).toBe('off');
    expect(states).toEqual(['waiting', 'video', 'off']);
  });

  it('starts at once where the browser allows it', async () => {
    const { keeper, video } = onHttp(true);
    await keeper.set(true);
    expect(keeper.state).toBe('video');
    await keeper.set(true);
    expect(video.play).toHaveBeenCalledTimes(1);
  });

  it('keeps the long clip from ever ending and loops the short one', async () => {
    const { keeper, video } = onHttp(true);
    await keeper.set(true);
    video.fire('loadedmetadata');
    expect(video.loop).toBe(false);
    video.currentTime = 0.4;
    video.fire('timeupdate');
    expect(video.currentTime).toBe(0.4);
    video.currentTime = 0.7;
    video.fire('timeupdate');
    expect(video.currentTime).toBe(0.25);
    // The WebM clip is one second long: it just loops.
    (video as { duration: number }).duration = 1;
    video.fire('loadedmetadata');
    expect(video.loop).toBe(true);
    video.currentTime = 0.9;
    video.fire('timeupdate');
    expect(video.currentTime).toBe(0.9);
  });

  it('pauses while the page is hidden and takes up again on return', async () => {
    const { keeper, video, page } = onHttp(true);
    await keeper.set(true);
    page.visible = false;
    await keeper.set(true);
    expect(video.paused).toBe(true);
    // Still what the operator will get on return.
    expect(keeper.state).toBe('video');
    video.fire('pause');
    await settle();
    expect(video.paused).toBe(true);
    page.visible = true;
    await keeper.set(true);
    expect(video.paused).toBe(false);
  });

  it('starts again when the system pauses the clip', async () => {
    const { keeper, video, allow } = onHttp(true);
    await keeper.set(true);
    video.paused = true;
    video.fire('pause');
    await settle();
    expect(video.paused).toBe(false);
    expect(keeper.state).toBe('video');
    // …or waits for the next touch if the browser wants one again.
    allow.value = false;
    video.paused = true;
    video.fire('pause');
    await settle();
    expect(keeper.state).toBe('waiting');
  });

  it('gives up honestly when the clip cannot be played at all', async () => {
    const { keeper } = onHttp('broken');
    await keeper.set(true);
    expect(keeper.state).toBe('failed');
    keeper.gesture();
    await settle();
    expect(keeper.state).toBe('failed');
  });

  it('ignores an answer that arrives after it is no longer wanted', async () => {
    const { keeper, video } = onHttp(true);
    const on = keeper.set(true);
    const off = keeper.set(false);
    await Promise.all([on, off]);
    expect(keeper.state).toBe('off');
    expect(video.paused).toBe(true);
  });
});
