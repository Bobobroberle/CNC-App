import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  IDLE_STOP_MS,
  parseStatus,
  Recorder,
  type Observer,
  type StartRequest,
  validateStart,
} from '../src/recorder';
import { rig } from './recorderRig';

const timelapse: StartRequest = {
  mode: 'timelapse',
  intervalSeconds: 5,
  jobName: 'sign.nc',
  safeHeightOnly: false,
  safeZ: null,
};

class FakeObserver implements Observer {
  connected = true;
  sent: string[] = [];
  listeners = new Set<(t: string) => void>();
  listen(fn: (t: string) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  send(t: string) {
    this.sent.push(t);
  }
  emit(t: string) {
    for (const l of this.listeners) l(t);
  }
}

describe('status reports', () => {
  it('reads state and work Z from WPos or MPos and the last WCO', () => {
    const wco = { z: null as number | null };
    expect(parseStatus('<Idle|MPos:1,2,3|FS:0,0>', wco)).toEqual([{ state: 'Idle', workZ: null }]);
    expect(parseStatus('ok\n<Run|MPos:1,2,-10|FS:500,0|WCO:0,0,-60>\n', wco)).toEqual([
      { state: 'Run', workZ: 50 },
    ]);
    expect(parseStatus('<Hold:0|MPos:1,2,-20>', wco)).toEqual([{ state: 'Hold', workZ: 40 }]);
    expect(parseStatus('<Idle|WPos:0,0,5.5><Run|WPos:0,0,x>', wco)).toEqual([
      { state: 'Idle', workZ: 5.5 },
      { state: 'Run', workZ: null },
    ]);
    expect(parseStatus('<Alarm>', wco)).toEqual([{ state: 'Alarm', workZ: null }]);
    expect(parseStatus('[MSG:INFO]', wco)).toEqual([]);
  });

  it('checks start requests', () => {
    expect(validateStart(null)).toBeNull();
    expect(validateStart({ mode: 'gif' })).toBeNull();
    expect(validateStart({ mode: 'video', intervalSeconds: 0 })).toBeNull();
    expect(validateStart({ mode: 'video' })).toEqual({
      mode: 'video',
      intervalSeconds: 5,
      jobName: '',
      safeHeightOnly: false,
      safeZ: null,
    });
    expect(
      validateStart({
        mode: 'timelapse',
        intervalSeconds: 2.4,
        jobName: 'a.nc',
        safeHeightOnly: true,
        safeZ: 5,
      }),
    ).toEqual({
      mode: 'timelapse',
      intervalSeconds: 2,
      jobName: 'a.nc',
      safeHeightOnly: true,
      safeZ: 5,
    });
    // Safe height needs a height.
    expect(validateStart({ mode: 'timelapse', safeHeightOnly: true })?.safeHeightOnly).toBe(false);
  });
});

describe('recorder', () => {
  it('knows whether ffmpeg and the hardware encoder are there', async () => {
    expect(await new Recorder(rig({ ffmpeg: false }).deps).capabilities()).toEqual({
      ffmpeg: false,
      hwEncoder: false,
      observe: false,
    });
    const r = rig({ hw: false });
    const rec = new Recorder(r.deps);
    expect(await rec.capabilities()).toMatchObject({ ffmpeg: true, hwEncoder: false });
    await rec.capabilities();
    expect(r.runs).toHaveLength(1);
    rec.setObserver(new FakeObserver());
    expect((await rec.capabilities()).observe).toBe(true);
  });

  it('refuses without ffmpeg, twice at once, or with a full disk', async () => {
    await expect(new Recorder(rig({ ffmpeg: false }).deps).start(timelapse)).rejects.toMatchObject({
      code: 'no-ffmpeg',
    });
    const full = rig();
    full.free.bytes = 1e8;
    await expect(new Recorder(full.deps).start(timelapse)).rejects.toMatchObject({
      code: 'disk-full',
    });
    const r = rig();
    const rec = new Recorder(r.deps);
    await rec.start(timelapse);
    await expect(rec.start(timelapse)).rejects.toMatchObject({ code: 'already-recording' });
    await rec.stop();
    await expect(rec.stop()).rejects.toMatchObject({ code: 'not-recording' });
  });

  it('takes a picture every interval and makes a timelapse of them at the end', async () => {
    const r = rig();
    const rec = new Recorder(r.deps);
    const meta = await rec.start(timelapse);
    expect(meta).toMatchObject({ state: 'recording', jobName: 'sign.nc', frames: 0 });
    await r.advance(21_000);
    expect(rec.current?.frames).toBe(5);
    // A camera that does not answer for a moment costs a picture, nothing more.
    r.fetchOk.ok = false;
    await r.advance(5000);
    r.fetchOk = { ok: true, throws: true };
    await r.advance(5000);
    r.fetchOk = { ok: true };
    expect(rec.current?.frames).toBe(5);
    expect(await readdir(join(r.dir, meta.id, 'frames'))).toHaveLength(5);
    const stopped = await rec.stop();
    expect(stopped).toMatchObject({ state: 'encoding', stopReason: 'app' });
    await rec.settled();
    const [done] = await rec.list();
    expect(done).toMatchObject({ state: 'done', frames: 5, timelapse: { name: 'timelapse.mp4' } });
    const encode = r.runs.at(-1)!;
    expect(encode).toEqual(expect.arrayContaining(['-framerate', '12', 'h264_v4l2m2m']));
    // The pictures are gone once the video exists.
    await expect(readdir(join(r.dir, meta.id, 'frames'))).rejects.toThrow();
    expect(await rec.file(meta.id, 'timelapse')).toMatchObject({ size: 3 });
    expect(await rec.file(meta.id, 'video')).toBeNull();
  });

  it('falls back to software encoding, and reports a failed encode', async () => {
    const r = rig();
    r.encodeCodes = [1, 0];
    const rec = new Recorder(r.deps);
    await rec.start(timelapse);
    await r.advance(10_000);
    await rec.stop();
    await rec.settled();
    expect(r.runs.at(-1)).toContain('libx264');
    expect((await rec.list())[0]).toMatchObject({ state: 'done' });

    const bad = rig({ hw: false });
    bad.encodeCodes = [1];
    const rec2 = new Recorder(bad.deps);
    await rec2.start(timelapse);
    await bad.advance(10_000);
    await rec2.stop();
    await rec2.settled();
    expect((await rec2.list())[0]).toMatchObject({ state: 'failed', error: 'encoder broke' });

    // No pictures at all: nothing to encode.
    const empty = rig();
    const rec3 = new Recorder(empty.deps);
    await rec3.start(timelapse);
    await rec3.stop();
    await rec3.settled();
    expect((await rec3.list())[0]).toMatchObject({ state: 'failed', error: 'no-frames' });
  });

  it('records video with the hardware encoder into fragmented MP4 and stops it cleanly', async () => {
    const r = rig();
    const rec = new Recorder(r.deps);
    const meta = await rec.start({ ...timelapse, mode: 'video' });
    expect(r.spawns).toHaveLength(1);
    expect(r.spawns[0]).toEqual(
      expect.arrayContaining([
        'http://cam/stream',
        'h264_v4l2m2m',
        '+frag_keyframe+empty_moov+default_base_moof',
      ]),
    );
    const done = await rec.stop();
    expect(r.children[0]!.killed).toEqual(['SIGINT']);
    expect(done).toMatchObject({ state: 'done', video: { name: 'video.mp4', size: 11 } });
    expect(await rec.file(meta.id, 'video')).toMatchObject({ size: 11 });
  });

  it('falls back to libx264 when the hardware encoder dies, and gives up if both do', async () => {
    const r = rig();
    r.spawnDies = [1];
    const rec = new Recorder(r.deps);
    const meta = await rec.start({ ...timelapse, mode: 'video' });
    expect(r.spawns[1]).toContain('libx264');
    expect(meta.error).toBeNull();
    await rec.stop();

    const bad = rig();
    bad.spawnDies = [1, 1];
    const rec2 = new Recorder(bad.deps);
    const failed = await rec2.start({ ...timelapse, mode: 'video' });
    expect(failed).toMatchObject({ state: 'failed', stopReason: 'error' });
    expect(failed.error).toMatch(/libx264/);
    expect(rec2.current).toBeNull();
  });

  it('kills an ffmpeg that does not stop', async () => {
    const r = rig();
    const rec = new Recorder(r.deps);
    await rec.start({ ...timelapse, mode: 'both' });
    const child = r.children[0]!;
    child.kill = (signal) => void child.killed.push(signal);
    await r.advance(5000);
    const done = await rec.stop();
    expect(child.killed).toEqual(['SIGINT', 'SIGKILL']);
    expect(done.state).toBe('encoding');
    await rec.settled();
    expect((await rec.list())[0]).toMatchObject({
      state: 'done',
      video: { name: 'video.mp4' },
      timelapse: { name: 'timelapse.mp4' },
    });
  });

  it('stops by itself at the time limit and when the disk fills up', async () => {
    const r = rig();
    const rec = new Recorder({ ...r.deps, maxDurationMs: 60_000 });
    await rec.start(timelapse);
    await r.advance(61_000);
    expect(rec.current).toBeNull();
    await rec.settled();
    expect((await rec.list())[0]!.stopReason).toBe('max-duration');

    const d = rig();
    const rec2 = new Recorder(d.deps);
    await rec2.start(timelapse);
    d.free.bytes = 5e8;
    await d.advance(31_000);
    expect(rec2.current).toBeNull();
    await rec2.settled();
    expect((await rec2.list())[0]!.stopReason).toBe('disk');
  });

  it('watches the machine: asks for status, stops when the job is over', async () => {
    const r = rig();
    const rec = new Recorder(r.deps);
    const obs = new FakeObserver();
    rec.setObserver(obs);
    await rec.start(timelapse);
    await r.advance(2000);
    expect(obs.sent).toEqual(['?', '?']);
    obs.connected = false;
    await r.advance(1000);
    expect(obs.sent).toHaveLength(2);
    // Idle before the job started does not end anything.
    obs.emit('<Idle|MPos:0,0,0|WCO:0,0,0>');
    await r.advance(IDLE_STOP_MS + 1000);
    expect(rec.current).not.toBeNull();
    obs.emit('<Run|MPos:0,0,0>');
    await r.advance(3000);
    obs.emit('<Idle|MPos:0,0,0>');
    await r.advance(5000);
    obs.emit('<Run|MPos:0,0,0>');
    obs.emit('<Idle|MPos:0,0,0>');
    await r.advance(5000);
    expect(rec.current).not.toBeNull();
    obs.emit('<Idle|MPos:0,0,0>');
    await r.advance(5000);
    obs.emit('<Idle|MPos:0,0,0>');
    await r.advance(1000);
    expect(rec.current).toBeNull();
    expect(obs.listeners.size).toBe(0);
    await rec.settled();
    expect((await rec.list())[0]!.stopReason).toBe('idle');
  });

  it('takes pictures only at safe height when asked', async () => {
    const r = rig();
    const rec = new Recorder(r.deps);
    // Without status reports the option is off.
    expect((await rec.start({ ...timelapse, safeHeightOnly: true, safeZ: 5 })).safeHeightOnly).toBe(
      false,
    );
    await rec.stop();
    await rec.settled();

    const obs = new FakeObserver();
    rec.setObserver(obs);
    await rec.start({ ...timelapse, intervalSeconds: 1, safeHeightOnly: true, safeZ: 5 });
    await r.advance(3000);
    expect(rec.current?.frames).toBe(0);
    obs.emit('<Run|WPos:0,0,-2>');
    await r.advance(3000);
    expect(rec.current?.frames).toBe(0);
    obs.emit('<Run|WPos:10,0,4.8>');
    await r.advance(3000);
    expect(rec.current?.frames).toBe(3);
  });

  it('lists, serves and deletes recordings, and ignores strange ids', async () => {
    const r = rig();
    const rec = new Recorder(r.deps);
    const a = await rec.start({ ...timelapse, mode: 'video' });
    expect(await rec.remove(a.id)).toBe('active');
    expect((await rec.list())[0]).toMatchObject({ id: a.id, state: 'recording' });
    await rec.stop();
    await r.advance(1000);
    const b = await rec.start({ ...timelapse, mode: 'video' });
    await rec.stop();
    expect((await rec.list()).map((m) => m.id)).toEqual([b.id, a.id]);
    expect(await rec.remove('../etc')).toBe('not-found');
    expect(await rec.file('../etc', 'video')).toBeNull();
    expect(await rec.remove(a.id)).toBe('ok');
    expect(await rec.remove(a.id)).toBe('not-found');
    await rm(join(r.dir, b.id, 'video.mp4'));
    expect(await rec.file(b.id, 'video')).toBeNull();
  });

  it('finishes recordings a power loss interrupted', async () => {
    const r = rig();
    const rec = new Recorder(r.deps);
    const t = await rec.start(timelapse);
    await r.advance(10_000);
    const v = await rec.start.call(new Recorder(r.deps), { ...timelapse, mode: 'video' });
    // Power gone: nobody stopped them. A new companion starts.
    const after = new Recorder(r.deps);
    await after.recover();
    await after.settled();
    const list = await after.list();
    expect(list.find((m) => m.id === t.id)).toMatchObject({
      state: 'done',
      stopReason: 'interrupted',
      frames: 2,
      timelapse: { name: 'timelapse.mp4' },
    });
    expect(list.find((m) => m.id === v.id)).toMatchObject({
      state: 'done',
      stopReason: 'interrupted',
      video: { name: 'video.mp4' },
    });
  });
});
