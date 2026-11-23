import { describe, expect, it } from 'vitest';
import {
  CharacterCountingStreamer,
  prepareLine,
  prepareProgram,
  type StreamProgress,
} from '../src';

describe('prepareProgram', () => {
  it('strips comments and whitespace but keeps system commands', () => {
    expect(prepareLine('g1 x10 (cut) y5 ; end')).toBe('G1X10Y5');
    expect(prepareLine('$J=G91 X10 F100')).toBe('$J=G91 X10 F100');
    expect(prepareProgram(['%', '(header)', 'G0 X1', '', 'M30'])).toEqual([
      { sourceIndex: 2, text: 'G0X1' },
      { sourceIndex: 4, text: 'M30' },
    ]);
  });
});

function setup(
  lines: string[],
  options: { rxBufferSize?: number; onError?: 'stop' | 'continue' } = {},
) {
  const sent: string[] = [];
  const s = new CharacterCountingStreamer(prepareProgram(lines), {
    send: (t) => sent.push(t),
    ...options,
  });
  const done: StreamProgress[] = [];
  const errors: number[] = [];
  s.on('done', (p) => done.push(p));
  s.on('error', (e) => errors.push(e.code));
  return { s, sent, done, errors };
}

describe('CharacterCountingStreamer', () => {
  it('fills the buffer without overflowing it', () => {
    // each line "G1X1" + newline = 5 bytes; 12-byte buffer holds two
    const { s, sent } = setup(['G1 X1', 'G1 X2', 'G1 X3', 'G1 X4'], { rxBufferSize: 12 });
    s.start();
    expect(sent).toEqual(['G1X1', 'G1X2']);
    expect(s.progress).toMatchObject({ state: 'running', sent: 2, acknowledged: 0, buffered: 10 });
    expect(s.acknowledge()).toBe(true);
    expect(sent).toHaveLength(3);
    expect(s.progress.lastAcknowledgedSource).toBe(0);
  });

  it('finishes after the last ok', () => {
    const { s, done } = setup(['G0 X1', 'G0 X2']);
    s.start();
    s.acknowledge();
    expect(done).toHaveLength(0);
    s.acknowledge();
    expect(done[0]).toMatchObject({ state: 'done', acknowledged: 2 });
    expect(s.acknowledge()).toBe(false);
  });

  it('finishes immediately for an empty program and ignores a second start', () => {
    const { s, done } = setup(['(nothing)']);
    s.start();
    s.start();
    expect(done).toHaveLength(1);
  });

  it('pauses and resumes sending', () => {
    const { s, sent, done } = setup(['G0X1', 'G0X2', 'G0X3'], { rxBufferSize: 6 });
    s.start();
    s.pause();
    s.pause();
    s.acknowledge();
    expect(sent).toHaveLength(1);
    expect(s.progress.state).toBe('paused');
    s.resume();
    expect(sent).toHaveLength(2);
    s.resume();
    s.acknowledge();
    s.acknowledge();
    expect(done[0]?.state).toBe('done');
  });

  it('completes on resume when everything was acknowledged while paused', () => {
    const { s, done } = setup(['G0X1']);
    s.start();
    s.pause();
    s.acknowledge();
    expect(done).toHaveLength(0);
    s.resume();
    expect(done[0]?.state).toBe('done');
  });

  it('stops after an error by default', () => {
    const { s, sent, done, errors } = setup(['G0X1', 'G0X2', 'G0X3'], { rxBufferSize: 10 });
    s.start();
    s.acknowledge(22);
    expect(errors).toEqual([22]);
    expect(s.progress.state).toBe('failed');
    expect(sent).toHaveLength(2);
    expect(done).toHaveLength(0);
    s.acknowledge();
    expect(done[0]?.state).toBe('failed');
  });

  it('can continue after errors', () => {
    const { s, done, errors } = setup(['G0X1', 'G0X2'], { onError: 'continue' });
    s.start();
    s.acknowledge(33);
    s.acknowledge();
    expect(errors).toEqual([33]);
    expect(done[0]?.state).toBe('done');
  });

  it('aborts and ignores late responses', () => {
    const { s, errors } = setup(['G0X1', 'G0X2']);
    s.start();
    s.abort();
    expect(s.progress).toMatchObject({ state: 'aborted', buffered: 0 });
    expect(s.awaitingResponses).toBe(false);
    expect(s.acknowledge(1)).toBe(false);
    s.abort();
    expect(errors).toEqual([]);
  });

  it('takes a line that fills the buffer exactly and rejects one byte more', () => {
    // 'G1X1' is 4 characters plus the newline: 5 bytes.
    expect(() => setup(['G1 X1'], { rxBufferSize: 5 })).not.toThrow();
    expect(() => setup(['G1 X1'], { rxBufferSize: 4 })).toThrow(/line 1/i);
  });

  it('rejects lines longer than the buffer', () => {
    expect(() => setup(['G1 X1000000 Y1000000'], { rxBufferSize: 10 })).toThrow(/line 1/i);
  });
});
