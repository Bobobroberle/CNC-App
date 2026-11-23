import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { alarmName, FluidNCConnection, type MachineStatus } from '../src';
import { FakeSocket } from './fake-socket';

/** Replays a recorded session (see fixtures/*.log) into a connection. */
async function replay(file: string) {
  let socket!: FakeSocket;
  const c = new FluidNCConnection({
    url: 'ws://jackpot:81',
    createSocket: (url) => (socket = new FakeSocket(url)),
    statusIntervalMs: 0,
  });
  const statuses: MachineStatus[] = [];
  const alarms: number[] = [];
  const meta: string[] = [];
  const resets: string[] = [];
  c.on('status', (s) => statuses.push(s));
  c.on('alarm', (a) => alarms.push(a));
  c.on('meta', (m) => meta.push(m));
  c.on('reset', (r) => resets.push(r));
  const connecting = c.connect();
  socket.open();

  const text = readFileSync(join(import.meta.dirname, 'fixtures', file), 'utf8');
  for (const raw of text.split('\n')) {
    const m = /^(\d+) ([~<]) (.*)$/.exec(raw);
    if (!m) continue;
    const at = Number(m[1]);
    if (m[2] === '~') {
      socket.receiveText(m[3]!);
    } else {
      // Status timestamps come from the recording, not the wall clock.
      const original = Date.now;
      Date.now = () => at;
      socket.receive(`${m[3]}\n`);
      Date.now = original;
    }
  }
  // FluidNC's greeting made it a connection.
  await connecting;
  return { c, statuses, alarms, meta, resets };
}

describe('recorded session: run, hold, hard limit alarm, unlock', () => {
  it('tracks state, positions, line numbers and overrides', async () => {
    const { statuses, alarms, meta, resets } = await replay('session-run-hold-alarm.log');
    expect(resets).toHaveLength(1);
    expect(meta).toEqual(['CURRENT_ID:0', 'ACTIVE_ID:0', 'PING:60000:60000']);
    expect(
      statuses.map((s) => (s.subState === undefined ? s.state : `${s.state}:${s.subState}`)),
    ).toEqual([
      'Idle',
      'Idle',
      'Idle',
      'Run',
      'Run',
      'Hold:1',
      'Hold:0',
      'Run',
      'Alarm',
      'Alarm',
      'Idle',
    ]);
    // WCO from the first report is kept and applied to later ones.
    const run = statuses[3]!;
    expect(run.wpos).toEqual([2.5, 0, 2, 0]);
    expect(run.lineNumber).toBe(20);
    expect(run.buffer).toEqual({ planner: 14, rx: 96 });
    expect(statuses[4]!.overrides.feed).toBe(120);
    expect(statuses[7]!.overrides.feed).toBe(120);
    expect(statuses[4]!.accessories.spindle).toBe('cw');
    expect(statuses[8]!.pins).toBe('X');
    expect(statuses[9]!.pins).toBe('');
    expect(statuses[10]!.lineNumber).toBeUndefined();
    expect(statuses[10]!.updatedAt).toBe(2400);
    expect(alarms.map(alarmName)).toEqual(['HardLimit']);
  });
});
