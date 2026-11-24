import { describe, expect, it, vi } from 'vitest';
import {
  CompanionClient,
  CompanionError,
  type StagedUpdate,
  type UpdateStatus,
} from '../src/lib/companion';
import {
  BUSY_STATES,
  deviceKind,
  formatBuild,
  loginError,
  updateErrorCode,
  waitForRestart,
} from '../src/lib/piUpdate';
import {
  runApply,
  runRollback,
  runUpload,
  useUpdate,
  type UpdateFlow,
} from '../src/store/piUpdate';
import { tokenFor, usePiLogin } from '../src/store/piLogin';

// The update of the Pi as the app sees it: what the client sends (the login with every request, the zip as it is),
// how a refusal is named, how a device is called, and the wait for the Pi to come back – with a Pi that is faked.

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

describe('the client of the login and the update', () => {
  it('sends the token of the login with every request, and nothing where there is none', async () => {
    const calls: [string, RequestInit | undefined][] = [];
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      return json({ ok: true, devices: [], code: 'ABCD-EFGH-JKLM' });
    });
    const anonymous = new CompanionClient('http://pi:8080', fetchFn as unknown as typeof fetch);
    await anonymous.devices();
    expect(calls[0]![1]).toBeUndefined();
    const authed = new CompanionClient('http://pi:8080', fetchFn as unknown as typeof fetch, 'tok');
    await authed.devices();
    expect((calls[1]![1]!.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    // headers that a call sets itself are kept next to it
    await authed.renewPiCode(true);
    const renew = calls[2]![1]!;
    expect(renew.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer tok',
    });
    expect(JSON.parse(renew.body as string)).toEqual({ revokeOthers: true });
    expect(calls[2]![0]).toBe('http://pi:8080/api/auth/code');
  });

  it('tells the one who holds a token that the Pi refused it – and only then', async () => {
    const dead = vi.fn();
    const answer = (status: number) =>
      vi.fn(async () => json({ error: 'unauthorized' }, status)) as unknown as typeof fetch;
    // a token that is refused: the login is over
    await new CompanionClient('http://pi:8080', answer(401), 'tok', dead).devices().catch(() => {});
    expect(dead).toHaveBeenCalledTimes(1);
    // no token: a 401 is nobody's login ending
    await new CompanionClient('http://pi:8080', answer(401), null, dead).devices().catch(() => {});
    // another refusal, and a good answer
    await new CompanionClient('http://pi:8080', answer(500), 'tok', dead).devices().catch(() => {});
    await new CompanionClient('http://pi:8080', answer(200), 'tok', dead).devices().catch(() => {});
    expect(dead).toHaveBeenCalledTimes(1);
  });

  it('logs in without a token, and says a wrong code, a wait and a missing Pi as what they are', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(json({ token: 'T', device: { id: 'd', name: 'PC' } }))
      .mockResolvedValueOnce(json({ error: 'wrong-code' }, 401))
      .mockResolvedValueOnce(json({ error: 'locked', retryAfter: 42 }, 429));
    const c = new CompanionClient(
      'http://pi:8080',
      fetchFn as unknown as typeof fetch,
      'old-token',
    );
    expect(await c.login('ABCD', 'PC')).toEqual({ token: 'T', device: { id: 'd', name: 'PC' } });
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://pi:8080/api/auth/login');
    // a login has no token yet: an old one is not sent to it
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({ code: 'ABCD', name: 'PC' });
    const wrong = await c.login('x', 'PC').catch((e: CompanionError) => e);
    expect(wrong).toMatchObject({ status: 401, code: 'wrong-code' });
    const locked = await c.login('x', 'PC').catch((e: CompanionError) => e);
    expect(locked).toMatchObject({ status: 429, code: 'locked', retryAfter: 42 });
  });

  it('uploads the zip as it is, with the checksum in the address, and applies by id', async () => {
    const fetchFn = vi.fn(async () => json({ id: 'abc', ok: true, name: 'b1' }));
    const c = new CompanionClient('http://pi:8080', fetchFn as unknown as typeof fetch, 'tok');
    const file = new Blob(['zip bytes']);
    await c.uploadUpdate(file, 'ab cd');
    let [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://pi:8080/api/update/upload?sha256=ab%20cd');
    expect(init.body).toBe(file);
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/zip');
    await c.uploadUpdate(file);
    expect((fetchFn.mock.calls[1] as unknown as [string])[0]).toBe(
      'http://pi:8080/api/update/upload',
    );
    await c.applyUpdate('abc', true);
    [url, init] = fetchFn.mock.calls[2] as unknown as [string, RequestInit];
    expect(url).toBe('http://pi:8080/api/update/apply');
    expect(JSON.parse(init.body as string)).toEqual({ id: 'abc', allowOlder: true });
    await c.rollbackUpdate();
    await c.discardUpdate();
    await c.updateStatus();
    await c.me();
    await c.logout();
    await c.removeDevice('a/b');
    await c.piCode();
    expect(
      fetchFn.mock.calls
        .map((x) => (x as unknown as [string, RequestInit?])[0].replace('http://pi:8080', ''))
        .slice(3),
    ).toEqual([
      '/api/update/rollback',
      '/api/update/staged',
      '/api/update',
      '/api/auth/me',
      '/api/auth/logout',
      '/api/auth/devices/a%2Fb',
      '/api/auth/code',
    ]);
  });

  it('keeps what the Pi said about a refusal: its code, and the detail (the checksum it computed)', async () => {
    const fetchFn = vi.fn(async () => json({ error: 'checksum-mismatch', detail: 'abc123' }, 400));
    const c = new CompanionClient('http://pi:8080', fetchFn as unknown as typeof fetch);
    const error = await c.uploadUpdate(new Blob(['x']), 'zzz').catch((e: CompanionError) => e);
    expect(error).toMatchObject({
      status: 400,
      code: 'checksum-mismatch',
      detail: 'abc123',
      retryAfter: null,
    });
    const plain = new CompanionClient('http://pi:8080', (async () =>
      json(null, 500)) as unknown as typeof fetch);
    expect(await plain.updateStatus().catch((e: CompanionError) => e)).toMatchObject({
      status: 500,
      code: null,
      detail: null,
    });
  });
});

describe('the login this device keeps – and the Pi taking it back', () => {
  it('ends for the address whose token the Pi refused, and for no other', () => {
    usePiLogin.getState().set({ base: 'http://pi:8080', token: 't', name: 'iPad' });
    usePiLogin.getState().expire('http://other:8080');
    expect(usePiLogin.getState().login).not.toBeNull();
    usePiLogin.getState().expire('http://pi:8080');
    expect(usePiLogin.getState().login).toBeNull();
    usePiLogin.getState().expire('http://pi:8080');
    expect(usePiLogin.getState().login).toBeNull();
  });
});

describe('the login this device keeps', () => {
  it('is for the address it was made at, and for no other', () => {
    usePiLogin.getState().set({ base: 'http://pi:8080', token: 'tok', name: 'PC' });
    expect(tokenFor('http://pi:8080')).toBe('tok');
    expect(tokenFor('http://other:8080')).toBeNull();
    expect(tokenFor('http://pi:8081')).toBeNull();
    usePiLogin.getState().clear();
    expect(tokenFor('http://pi:8080')).toBeNull();
    expect(usePiLogin.getState().login).toBeNull();
  });
});

describe('naming things', () => {
  it('a device is told by what the browser says it is', () => {
    expect(deviceKind('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe('iPad');
    expect(deviceKind('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe('iPhone');
    expect(deviceKind('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe('Mac');
    // an iPad that says it is a Mac
    expect(deviceKind('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe('iPad');
    expect(deviceKind('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile')).toBe('androidPhone');
    expect(deviceKind('Mozilla/5.0 (Linux; Android 14; SM-X900)')).toBe('androidTablet');
    expect(deviceKind('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows');
    expect(deviceKind('Mozilla/5.0 (X11; CrOS x86_64)')).toBe('Chromebook');
    expect(deviceKind('Mozilla/5.0 (X11; Linux x86_64)')).toBe('linux');
    expect(deviceKind('')).toBe('other');
  });

  it('a build is the time of its commit', () => {
    expect(formatBuild(1_795_532_882, 'de-DE')).toMatch(/2026/);
  });

  it('a refusal is named by its code – or by what is known where the Pi said nothing', () => {
    const err = (status: number, code: string | null, detail: string | null = null) =>
      new CompanionError(status, code, detail);
    expect(updateErrorCode(err(401, 'unauthorized'))).toEqual({
      code: 'unauthorized',
      detail: null,
    });
    // where the answer carries no code (a proxy, an older companion) the status says it
    expect(updateErrorCode(err(401, null))).toEqual({ code: 'unauthorized', detail: null });
    expect(updateErrorCode(err(415, null))).toEqual({ code: 'expected-zip', detail: null });
    expect(updateErrorCode(err(413, null))).toEqual({ code: 'too-large', detail: null });
    expect(updateErrorCode(err(415, 'expected-zip'))).toEqual({
      code: 'expected-zip',
      detail: null,
    });
    expect(updateErrorCode(err(409, 'busy', 'recording'))).toEqual({
      code: 'busy',
      detail: 'recording',
    });
    expect(updateErrorCode(err(400, 'checksum-mismatch', 'abc'))).toEqual({
      code: 'checksum-mismatch',
      detail: 'abc',
    });
    expect(updateErrorCode(err(500, 'something-new'))).toEqual({ code: 'other', detail: null });
    expect(updateErrorCode(err(502, null))).toEqual({ code: 'other', detail: null });
    // fetch itself failed
    expect(updateErrorCode(new TypeError('Failed to fetch'))).toEqual({
      code: 'network',
      detail: null,
    });
    expect(updateErrorCode(null)).toEqual({ code: 'network', detail: null });
  });

  it('a refused login is a wrong code, a wait, a Pi that does not answer – or something else', () => {
    expect(loginError(new CompanionError(401, 'wrong-code'))).toEqual({
      key: 'wrong-code',
      seconds: 0,
    });
    expect(loginError(new CompanionError(429, 'locked', null, 42))).toEqual({
      key: 'locked',
      seconds: 42,
    });
    expect(loginError(new CompanionError(429, 'locked'))).toEqual({ key: 'locked', seconds: 60 });
    expect(loginError(new CompanionError(500, null))).toEqual({ key: 'other', seconds: 0 });
    expect(loginError(new TypeError('Failed to fetch'))).toEqual({ key: 'network', seconds: 0 });
  });

  it('the machine states in which the Pi must stay up', () => {
    for (const s of ['Run', 'Hold', 'Jog', 'Home']) expect(BUSY_STATES.has(s)).toBe(true);
    for (const s of ['Idle', 'Alarm', '']) expect(BUSY_STATES.has(s)).toBe(false);
  });
});

/** A Pi that goes away and comes back: `script` says what the health check answers at each look. */
function pi(script: (number | 'down')[], last?: UpdateStatus['last']) {
  let at = 0;
  return {
    health: vi.fn(async () => {
      const step = script[Math.min(at++, script.length - 1)]!;
      if (step === 'down') throw new TypeError('Failed to fetch');
      return { ok: true, version: '0.1.0', fluidnc: null, sensors: 'push', build: step };
    }),
    updateStatus: vi.fn(async () => ({ last }) as UpdateStatus),
  };
}
const instant = { sleep: () => Promise.resolve(), pollMs: 1000, timeoutMs: 20_000, busyWaitMs: 0 };

describe('waiting for the Pi to come back', () => {
  it('waits for the process to go away – it answers for a moment with the old build – and then for the new one', async () => {
    const api = pi([100, 100, 'down', 'down', 200]);
    expect(await waitForRestart(api, 200, instant)).toEqual({ result: 'done', build: 200 });
    expect(api.health).toHaveBeenCalledTimes(5);
    expect(api.health).toHaveBeenCalledWith(2000);
  });

  it('does not take the old process for the new version, even where the build number is the same', async () => {
    const api = pi([200, 200, 200, 'down', 200]);
    expect(await waitForRestart(api, 200, instant)).toEqual({ result: 'done', build: 200 });
    expect(api.health).toHaveBeenCalledTimes(5);
  });

  it('says when the Pi is back with the old version: the guard took the new one away', async () => {
    const api = pi([100, 'down', 'down', 100]);
    expect(await waitForRestart(api, 200, instant)).toEqual({ result: 'rolled-back', build: 100 });
    // whatever comes back that is not the build asked for is the old one (a version that crashes never answers)
    expect(await waitForRestart(pi([100, 'down', 150]), 200, instant)).toEqual({
      result: 'rolled-back',
      build: 150,
    });
  });

  it('counts the wait in time, not in looks: a look that runs into its own limit costs that limit', async () => {
    let clock = 0;
    const now = vi.spyOn(Date, 'now').mockImplementation(() => clock);
    try {
      const slow = {
        // a host that vanished without a word: every look ends at its time limit
        health: vi.fn(async () => {
          clock += 2000;
          throw new TypeError('timed out');
        }),
      };
      const result = await waitForRestart(slow as never, 200, { ...instant, timeoutMs: 12_000 });
      expect(result).toEqual({ result: 'no-answer' });
      // 1 s of waiting and 2 s of looking per round: four rounds, not twelve
      expect(slow.health).toHaveBeenCalledTimes(4);
    } finally {
      now.mockRestore();
    }
  });

  it('says when the Pi never went away: what should have restarted it did not get there', async () => {
    const c = pi([100]);
    expect(await waitForRestart(c, 200, instant)).toEqual({ result: 'unchanged', build: 100 });
    // an answer without a build is no build
    const bare = { health: vi.fn(async () => ({ ok: true })) } as never;
    expect(await waitForRestart(bare, 200, instant)).toEqual({ result: 'unchanged', build: null });
    // never an answer at all is no answer
    expect(await waitForRestart(pi(['down']), 200, instant)).toEqual({ result: 'no-answer' });
  });

  it('gives up when the Pi does not come back in time – and keeps looking until then', async () => {
    const api = pi(['down']);
    const result = await waitForRestart(api, 200, { ...instant, timeoutMs: 5000 });
    expect(result).toEqual({ result: 'no-answer' });
    expect(api.health).toHaveBeenCalledTimes(5);
    // a Pi that never goes away (the restart did not happen) is no success either
    expect(await waitForRestart(pi([100]), 200, { ...instant, timeoutMs: 3000 })).toEqual({
      result: 'unchanged',
      build: 100,
    });
  });

  it('takes an answer without a build for what it is not: the new version (an older companion says none)', async () => {
    const api = pi([100]);
    api.health.mockResolvedValueOnce({
      ok: true,
      version: '0.1.0',
      fluidnc: null,
      sensors: 'push',
      build: 100,
    });
    api.health.mockRejectedValueOnce(new TypeError('x'));
    api.health.mockResolvedValue({
      ok: true,
      version: '0.1.0',
      fluidnc: null,
      sensors: 'push',
    } as never);
    expect(await waitForRestart(api, 200, instant)).toEqual({ result: 'rolled-back', build: null });
  });
});

const staged = (build = 200, newer = true): StagedUpdate => ({
  id: 'abc',
  release: { version: '0.1.0', build, commit: 'abcdef0', setupLevel: 2 },
  sha256: 'f'.repeat(64),
  files: 5,
  at: 1,
  newer,
});
const status = (previous = true): UpdateStatus =>
  ({
    enabled: true,
    running: { name: 'b200', version: '0.1.0', build: 200, commit: 'x' },
    previous: previous ? { name: 'b100', version: '0.1.0', build: 100, commit: 'y' } : null,
    setupLevel: 2,
    last: null,
    trial: false,
    staged: null,
    busy: null,
  }) as UpdateStatus;

function api(over: Record<string, unknown> = {}) {
  const base = pi([100, 'down', 200]);
  return {
    ...base,
    uploadUpdate: vi.fn(async () => staged()),
    applyUpdate: vi.fn(async () => ({ ok: true as const, name: 'b200', release: { build: 200 } })),
    rollbackUpdate: vi.fn(async () => ({ ok: true as const, name: 'b100' })),
    discardUpdate: vi.fn(async () => ({})),
    ...over,
  };
}
const phases = () => {
  const seen: UpdateFlow[] = [];
  return {
    seen,
    update: (s: UpdateFlow) => void seen.push(s),
    names: () => seen.map((s) => s.phase),
  };
};

describe('the steps of an update', () => {
  it('uploads and waits to be applied', async () => {
    const a = api();
    const p = phases();
    const end = await runUpload(a, new Blob(['z']), ' abc ', p.update);
    expect(p.names()).toEqual(['uploading', 'staged']);
    expect(end.staged?.id).toBe('abc');
    expect(a.uploadUpdate).toHaveBeenCalledWith(expect.any(Blob), 'abc');
    await runUpload(a, new Blob(['z']), '  ', p.update);
    expect(a.uploadUpdate).toHaveBeenLastCalledWith(expect.any(Blob), undefined);
  });

  it('says why an upload was refused – with what the Pi said', async () => {
    const a = api({
      uploadUpdate: vi.fn(async () => {
        throw new CompanionError(400, 'checksum-mismatch', 'abc');
      }),
    });
    const p = phases();
    const end = await runUpload(a, new Blob(['z']), 'zzz', p.update);
    expect(end).toMatchObject({
      phase: 'failed',
      error: { code: 'checksum-mismatch', detail: 'abc' },
      staged: null,
    });
    const offline = api({
      uploadUpdate: vi.fn(async () => {
        throw new TypeError('x');
      }),
    });
    expect((await runUpload(offline, new Blob(['z']), undefined, p.update)).error?.code).toBe(
      'network',
    );
  });

  it('applies, waits for the Pi to restart, and says which build it runs', async () => {
    const a = api();
    const p = phases();
    const end = await runApply(a, staged(), false, p.update, instant);
    expect(p.names()).toEqual(['applying', 'restarting', 'done']);
    expect(end).toMatchObject({ phase: 'done', kind: 'update', reached: 200 });
    expect(a.applyUpdate).toHaveBeenCalledWith('abc', false);
  });

  it('remembers whether the Pi compared the file with a checksum – from what was sent, not from what is typed later', async () => {
    const a = api();
    const p = phases();
    expect(await runUpload(a, new Blob(['x']), '  ', p.update)).toMatchObject({
      phase: 'staged',
      verified: false,
    });
    expect(await runUpload(a, new Blob(['x']), ' abc ', p.update)).toMatchObject({
      phase: 'staged',
      verified: true,
    });
    expect(await runUpload(a, new Blob(['x']), undefined, p.update)).toMatchObject({
      verified: false,
    });
    // and it goes on into the steps that follow
    const end = await runApply(a, staged(), false, p.update, instant, true);
    expect(end).toMatchObject({ phase: 'done', verified: true });
  });

  it('stays at the hold, with the reason, after a refusal that leaves the package on the Pi – and ends where it is gone', async () => {
    for (const code of ['busy', 'not-newer', 'needs-setup', 'backup-failed', 'check-failed']) {
      const a = api({
        applyUpdate: vi.fn(async () => {
          throw Object.assign(new Error(code), { status: 409, code, detail: null });
        }),
      });
      const p = phases();
      const end = await runApply(a, staged(), false, p.update, instant);
      expect(end, code).toMatchObject({ phase: 'staged', staged: staged(), error: { code } });
    }
    for (const status of [401, 404]) {
      const a = api({
        applyUpdate: vi.fn(async () => {
          throw Object.assign(new Error('x'), {
            status,
            code: status === 404 ? 'no-staged' : 'unauthorized',
            detail: null,
          });
        }),
      });
      expect(await runApply(a, staged(), false, phases().update, instant)).toMatchObject({
        phase: 'failed',
      });
    }
  });

  it('goes on looking for the Pi when the reply to the apply is lost: it may have swapped and be restarting', async () => {
    const lost = () => {
      throw new TypeError('Failed to fetch');
    };
    // it did: away, back with the new build
    const went = api({ applyUpdate: vi.fn(lost) });
    expect(await runApply(went, staged(), false, phases().update, instant)).toMatchObject({
      phase: 'done',
      reached: 200,
    });
    // it did not: it answers all the time with the old build
    const never = { ...api({ applyUpdate: vi.fn(lost) }), ...pi([100]) };
    const end = await runApply(never, staged(), false, phases().update, instant);
    expect(end).toMatchObject({ phase: 'failed', error: { code: 'not-applied' } });
    // the looking is short: a Pi that does not come back is not waited for as long as after a reply
    const quiet = { ...api({ applyUpdate: vi.fn(lost) }), ...pi(['down']) };
    const sleeps: number[] = [];
    await runApply(quiet, staged(), false, phases().update, {
      sleep: async (ms) => void sleeps.push(ms),
      pollMs: 1000,
      busyWaitMs: 0,
    });
    expect(sleeps.length).toBe(60);
    // and the same for the way back
    const back = api({ rollbackUpdate: vi.fn(lost), ...pi([200, 'down', 100]) });
    expect(await runRollback(back, status(), phases().update, instant)).toMatchObject({
      phase: 'done',
      kind: 'rollback',
      reached: 100,
    });
  });

  it('is refused while another device is on the machine – and asks again a moment later, a few times, but no more', async () => {
    const busy = new CompanionError(409, 'busy', 'machine-connected');
    const a = api({
      applyUpdate: vi
        .fn()
        .mockRejectedValueOnce(busy)
        .mockRejectedValueOnce(busy)
        .mockResolvedValue({ ok: true, name: 'b200', release: { build: 200 } }),
    });
    const sleeps: number[] = [];
    const end = await runApply(a, staged(), false, () => {}, {
      ...instant,
      busyWaitMs: 1500,
      sleep: async (ms) => void sleeps.push(ms),
    });
    expect(end.phase).toBe('done');
    expect(a.applyUpdate).toHaveBeenCalledTimes(3);
    expect(sleeps.slice(0, 2)).toEqual([1500, 1500]);
    const always = api({ applyUpdate: vi.fn().mockRejectedValue(busy) });
    const stuck = await runApply(always, staged(), false, () => {}, instant);
    // the package is still on the Pi: back at the hold, with the reason beside it
    expect(stuck).toMatchObject({
      phase: 'staged',
      error: { code: 'busy', detail: 'machine-connected' },
    });
    expect(always.applyUpdate).toHaveBeenCalledTimes(4);
    // a recording is no reason to ask again
    const recording = api({
      applyUpdate: vi.fn().mockRejectedValue(new CompanionError(409, 'busy', 'recording')),
    });
    expect((await runApply(recording, staged(), false, () => {}, instant)).error).toMatchObject({
      code: 'busy',
      detail: 'recording',
    });
    expect(recording.applyUpdate).toHaveBeenCalledTimes(1);
  });

  it('ends with the way back when the Pi runs the old version again, and with a failure when it does not answer', async () => {
    const back = api({ ...pi([100, 'down', 100], { result: 'rolled-back', at: 1 }) });
    expect(await runApply(back, staged(), false, () => {}, instant)).toMatchObject({
      phase: 'failed',
      error: { code: 'rolled-back' },
      reached: 100,
    });
    const lost = api({ ...pi(['down']) });
    expect(
      await runApply(lost, staged(), false, () => {}, { ...instant, timeoutMs: 3000 }),
    ).toMatchObject({ phase: 'failed', error: { code: 'no-answer' } });
    const refused = api({
      applyUpdate: vi.fn(async () => {
        throw new CompanionError(500, 'check-failed', 'boom');
      }),
    });
    expect(await runApply(refused, staged(), false, () => {}, instant)).toMatchObject({
      phase: 'staged',
      error: { code: 'check-failed', detail: 'boom' },
      staged: expect.anything(),
    });
  });

  it('goes back to the version before and waits for it', async () => {
    const a = api({ ...pi([200, 'down', 100]) });
    const p = phases();
    const end = await runRollback(a, status(), p.update, instant);
    expect(p.names()).toEqual(['applying', 'restarting', 'done']);
    expect(end).toMatchObject({ phase: 'done', kind: 'rollback', reached: 100 });
    // nothing to go back to
    expect(await runRollback(api(), status(false), () => {}, instant)).toMatchObject({
      phase: 'failed',
      error: { code: 'no-previous' },
    });
    // refused: a machine is on the Pi, the Pi has nothing, the Pi is away
    const busy = new CompanionError(409, 'busy', 'machine-connected');
    const retried = api({
      ...pi([200, 'down', 100]),
      rollbackUpdate: vi
        .fn()
        .mockRejectedValueOnce(busy)
        .mockResolvedValue({ ok: true, name: 'b100' }),
    });
    expect((await runRollback(retried, status(), () => {}, instant)).phase).toBe('done');
    const stuck = api({ rollbackUpdate: vi.fn().mockRejectedValue(busy) });
    expect((await runRollback(stuck, status(), () => {}, instant)).error?.code).toBe('busy');
    expect(stuck.rollbackUpdate).toHaveBeenCalledTimes(4);
    const gone = api({
      rollbackUpdate: vi.fn().mockRejectedValue(new CompanionError(409, 'no-previous')),
    });
    expect((await runRollback(gone, status(), () => {}, instant)).error?.code).toBe('no-previous');
  });
});

describe('the store of the update', () => {
  it('goes through upload, apply and discard – and does not start a second thing while one is under way', async () => {
    const a = api();
    useUpdate.getState().reset();
    await useUpdate.getState().apply(a, false, instant);
    expect(a.applyUpdate).not.toHaveBeenCalled(); // nothing staged
    await useUpdate.getState().upload(a, new Blob(['z']));
    expect(useUpdate.getState()).toMatchObject({ phase: 'staged', staged: { id: 'abc' } });
    await useUpdate.getState().discard(a);
    expect(useUpdate.getState().phase).toBe('idle');
    expect(a.discardUpdate).toHaveBeenCalled();
    await useUpdate.getState().upload(a, new Blob(['z']));
    await useUpdate.getState().apply(a, false, instant);
    expect(useUpdate.getState()).toMatchObject({ phase: 'done', reached: 200 });
    // applying again needs a new upload: the phase is not `staged` any more
    await useUpdate.getState().apply(a, false, instant);
    expect(a.applyUpdate).toHaveBeenCalledTimes(1);
    useUpdate.getState().reset();
    expect(useUpdate.getState().phase).toBe('idle');
  });

  it('ignores an upload and a way back while something is under way', async () => {
    const a = api();
    useUpdate.setState({ phase: 'restarting' });
    await useUpdate.getState().upload(a, new Blob(['z']));
    await useUpdate.getState().rollback(a, status(), instant);
    expect(a.uploadUpdate).not.toHaveBeenCalled();
    expect(a.rollbackUpdate).not.toHaveBeenCalled();
    for (const phase of ['uploading', 'applying'] as const) {
      useUpdate.setState({ phase });
      await useUpdate.getState().upload(a, new Blob(['z']));
      await useUpdate.getState().rollback(a, status(), instant);
    }
    expect(a.uploadUpdate).not.toHaveBeenCalled();
    useUpdate.getState().reset();
    const back = api({ ...pi([200, 'down', 100]) });
    await useUpdate.getState().rollback(back, status(), instant);
    expect(useUpdate.getState()).toMatchObject({ phase: 'done', kind: 'rollback', reached: 100 });
  });
});
