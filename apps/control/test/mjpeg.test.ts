import { describe, expect, it } from 'vitest';
import { boundaryOf, MjpegParser, normalizeBoundary, type MjpegOptions } from '../src/lib/mjpeg';
import {
  bytesOf,
  chunked,
  concat,
  jpegLike,
  randomSizes,
  rng,
  sameBytes,
  stream,
  type FixturePart,
  type StreamOptions,
} from './mjpegFixtures';

const B = 'boundarydonotcross';

/** A part is a view until the next feed – the tests copy what they keep, as a consumer must */
interface Kept {
  headers: Record<string, string>;
  bytes: Uint8Array;
}

function parse(chunks: Uint8Array[], boundary = B, options?: MjpegOptions) {
  const parser = new MjpegParser(boundary, options);
  const parts: Kept[] = [];
  for (const chunk of chunks) {
    for (const p of parser.feed(chunk))
      parts.push({ headers: { ...p.headers }, bytes: p.bytes.slice() });
  }
  return { parser, parts, end: parser.finish() };
}

const three: FixturePart[] = [
  { headers: { 'X-Timestamp': '1779800000.123000' }, body: jpegLike(1, 3000) },
  { headers: { 'X-Timestamp': '1779800000.163000' }, body: jpegLike(2, 5000) },
  { headers: { 'X-Timestamp': '1779800000.203000' }, body: jpegLike(3, 1200) },
];

function expectThree(parts: Kept[]) {
  expect(parts).toHaveLength(3);
  parts.forEach((p, i) => {
    expect(sameBytes(p.bytes, three[i]!.body)).toBe(true);
    expect(p.headers['x-timestamp']).toBe(three[i]!.headers!['X-Timestamp']);
    expect(p.headers['content-type']).toBe('image/jpeg');
  });
}

describe('the Content-Type of a camera stream', () => {
  it('gives the boundary, quoted or not, with other parameters around it', () => {
    expect(boundaryOf('multipart/x-mixed-replace;boundary=boundarydonotcross')).toBe(B);
    expect(boundaryOf('multipart/x-mixed-replace; boundary="my boundary 1"; charset=utf-8')).toBe(
      'my boundary 1',
    );
    expect(boundaryOf('Multipart/X-Mixed-Replace ; Boundary = abc123 ;x=y')).toBe('abc123');
    expect(boundaryOf('multipart/x-mixed-replace;boundary=123456789000000000000987654321')).toBe(
      '123456789000000000000987654321',
    );
  });

  it('takes a leading -- as part of the delimiter, not of the name', () => {
    expect(boundaryOf('multipart/x-mixed-replace;boundary=--frame')).toBe('frame');
    expect(normalizeBoundary('--frame')).toBe('frame');
    expect(normalizeBoundary('frame')).toBe('frame');
    // the same stream is read whichever way the boundary was written down
    const data = stream(three, { boundary: 'frame' });
    expectThree(parse([data], '--frame').parts);
    expectThree(parse([data], 'frame').parts);
  });

  it('gives nothing for a type that is no multipart, has no boundary or an unusable one', () => {
    expect(boundaryOf(null)).toBeNull();
    expect(boundaryOf(undefined)).toBeNull();
    expect(boundaryOf('')).toBeNull();
    expect(boundaryOf('image/jpeg')).toBeNull();
    expect(boundaryOf('text/html; boundary=abc')).toBeNull();
    expect(boundaryOf('multipart/x-mixed-replace')).toBeNull();
    expect(boundaryOf('multipart/x-mixed-replace; boundary=')).toBeNull();
    expect(boundaryOf('multipart/x-mixed-replace; boundary=""')).toBeNull();
    expect(boundaryOf('multipart/x-mixed-replace; boundary="--"')).toBeNull();
    expect(boundaryOf('multipart/x-mixed-replace; boundary=" lead"')).toBeNull();
    expect(boundaryOf(`multipart/x-mixed-replace; boundary=${'x'.repeat(201)}`)).toBeNull();
    expect(boundaryOf('multipart/x-mixed-replace; boundary="ä"')).toBeNull();
  });

  it('refuses to be made with a boundary it cannot search for', () => {
    expect(() => new MjpegParser('')).toThrow(RangeError);
    expect(() => new MjpegParser('--')).toThrow(RangeError);
    expect(() => new MjpegParser('a\r\nb')).toThrow(RangeError);
  });
});

describe('reading a stream as ustreamer sends it', () => {
  it('gives every part with its headers (lower case) and its bytes', () => {
    const { parts, end, parser } = parse([stream(three, { length: true })]);
    expectThree(parts);
    expect(parts[0]!.headers['content-length']).toBe('3000');
    expect(end).toBe('clean');
    expect(parser.failure).toBeNull();
  });

  it('finds the end of a part by the boundary where there is no Content-Length', () => {
    const { parts, end } = parse([stream(three)]);
    expectThree(parts);
    expect(end).toBe('clean');
  });

  it('is not fooled by dashes, line breaks and pieces of the boundary inside a body', () => {
    const tricky: FixturePart[] = [
      {
        body: concat(
          jpegLike(4, 400),
          bytesOf(`\r\n--${B}X\r\n--${B.slice(0, -2)}`),
          jpegLike(5, 50),
        ),
      },
      { body: bytesOf(`\n--${B}x and more`) },
    ];
    const { parts } = parse([stream(tricky)]);
    expect(parts).toHaveLength(2);
    expect(sameBytes(parts[0]!.bytes, tricky[0]!.body)).toBe(true);
    expect(sameBytes(parts[1]!.bytes, tricky[1]!.body)).toBe(true);
  });

  it('reads LF-only streams, with and without a length', () => {
    expectThree(parse([stream(three, { eol: '\n' })]).parts);
    expectThree(parse([stream(three, { eol: '\n', length: true })]).parts);
  });

  it('allows spaces after a boundary and skips a short preamble', () => {
    expectThree(parse([stream(three, { padding: '  \t' })]).parts);
    const withPreamble = stream(three, { length: true, preamble: 'HTTP noise\r\nmore noise\r\n' });
    expectThree(parse([withPreamble]).parts);
  });

  it('knows the closing boundary and ignores what follows it', () => {
    const closed = concat(
      stream(three, { trailing: 'closing' }),
      bytesOf('epilogue --boundarydonotcross\r\nX'),
    );
    const { parts, end, parser } = parse([closed]);
    expectThree(parts);
    expect(end).toBe('done');
    expect(parser.state).toBe('done');
  });

  it('knows a stream that begins with its closing boundary, and a lone CR inside a header block', () => {
    const closed = parse([bytesOf(`--${B}--\r\n`)]);
    expect(closed.parts).toEqual([]);
    expect(closed.end).toBe('done');
    const lone = bytesOf(`--${B}\r\nX-A: 1\r\n\rX-B: 2\r\n\r\nabc\r\n--${B}\r\n`);
    expect(parse([lone]).parts[0]!.headers['x-a']).toBe('1');
    const lf = bytesOf(`--${B}\nX-A: 1\n\rX-B: 2\n\r\nabc\n--${B}\n`);
    expect(new TextDecoder().decode(parse([lf]).parts[0]!.bytes)).toBe('abc');
  });

  it('gives a part of zero bytes – with a length, after a blank line, and with no blank line before the boundary', () => {
    const empty: FixturePart[] = [{ body: new Uint8Array(0) }, { body: jpegLike(6, 100) }];
    for (const options of [{ length: true }, {}, { eol: '\n' as const }]) {
      const { parts } = parse([stream(empty, options)]);
      expect(parts).toHaveLength(2);
      expect(parts[0]!.bytes.length).toBe(0);
      expect(sameBytes(parts[1]!.bytes, empty[1]!.body)).toBe(true);
    }
    // a server that writes the boundary right after the blank line
    const tight = bytesOf(
      `--${B}\r\nContent-Type: image/jpeg\r\n\r\n--${B}\r\nX: 1\r\n\r\nabc\r\n--${B}\r\n`,
    );
    const { parts } = parse([tight]);
    expect(parts.map((p) => p.bytes.length)).toEqual([0, 3]);
    // a final boundary right after the blank line, too
    const last = bytesOf(`--${B}\r\nX: 1\r\n\r\n--${B}--\r\n`);
    expect(parse([last]).parts.map((p) => p.bytes.length)).toEqual([0]);
  });

  it('reads a part with no headers at all, and ignores header lines that are none', () => {
    const none = bytesOf(`--${B}\r\n\r\nabc\r\n--${B}\r\n`);
    const a = parse([none]).parts[0]!;
    expect(a.headers).toEqual({});
    expect(new TextDecoder().decode(a.bytes)).toBe('abc');
    const lf = bytesOf(`--${B}\n\nabc\n--${B}\n`);
    expect(new TextDecoder().decode(parse([lf]).parts[0]!.bytes)).toBe('abc');
    const messy = bytesOf(
      `--${B}\r\nX-Timestamp:   12.5  \r\nno colon here\r\n: nameless\r\nbad name: 1\r\nX-TIMESTAMP: 99\r\nA-B_c: ok\r\n\r\nxy\r\n--${B}\r\n`,
    );
    expect(parse([messy]).parts[0]!.headers).toEqual({ 'x-timestamp': '99', 'a-b_c': 'ok' });
  });

  it('uses a Content-Length that is digits and reads on by the boundary where it is not', () => {
    const odd = (value: string) =>
      bytesOf(`--${B}\r\nContent-Length: ${value}\r\n\r\nhello\r\n--${B}\r\n`);
    for (const bad of ['abc', '-5', '1e3', '', '5 5']) {
      const { parts, parser } = parse([odd(bad)]);
      expect(parser.failure).toBeNull();
      expect(new TextDecoder().decode(parts[0]!.bytes)).toBe('hello');
    }
    expect(new TextDecoder().decode(parse([odd('5')]).parts[0]!.bytes)).toBe('hello');
  });
});

describe('cutting the stream anywhere', () => {
  it('gives the same parts for every position of a split into two pieces – with and without a length', () => {
    const small = three.map((p, i) => ({ ...p, body: jpegLike(20 + i, 150) }));
    for (const options of [{ length: true }, {}, { eol: '\n' as const }, { padding: ' ' }]) {
      const data = stream(small, options);
      for (let cut = 0; cut <= data.length; cut += 1) {
        const { parts, parser } = parse([data.slice(0, cut), data.slice(cut)]);
        expect(parser.failure).toBeNull();
        expect(parts.length).toBe(3);
        parts.forEach((p, i) => expect(sameBytes(p.bytes, small[i]!.body)).toBe(true));
      }
    }
  });

  it('gives the same parts for random cuts into pieces of 1 to 6000 bytes, many times over', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const rand = rng(seed);
      const options: StreamOptions = {
        length: rand() < 0.5,
        eol: rand() < 0.3 ? '\n' : '\r\n',
        padding: rand() < 0.2 ? ' ' : '',
        preamble: rand() < 0.3 ? 'preamble\r\n' : '',
      };
      const parts = Array.from({ length: 1 + Math.floor(rand() * 6) }, (_, i) => ({
        headers: { 'X-Timestamp': `${1000 + i}.5` },
        body: rand() < 0.1 ? new Uint8Array(0) : jpegLike(seed * 10 + i, Math.floor(rand() * 9000)),
      }));
      const data = stream(parts, options);
      const max = [1, 7, 100, 6000][seed % 4]!;
      const got = parse(chunked(data, randomSizes(rng(seed + 1000), max)));
      expect(got.parser.failure).toBeNull();
      expect(got.end).toBe('clean');
      expect(got.parts).toHaveLength(parts.length);
      got.parts.forEach((p, i) => {
        expect(sameBytes(p.bytes, parts[i]!.body)).toBe(true);
        expect(p.headers['x-timestamp']).toBe(`${1000 + i}.5`);
      });
    }
  });

  it('takes a body longer than its first buffer, and many parts in one chunk, and parts for a long time', () => {
    const big: FixturePart[] = [{ body: jpegLike(7, 300_000) }, { body: jpegLike(8, 150_000) }];
    for (const length of [true, false]) {
      expect(parse([stream(big, { length })]).parts.map((p) => p.bytes.length)).toEqual([
        300_000, 150_000,
      ]);
      expect(
        parse(chunked(stream(big, { length }), randomSizes(rng(3), 20_000))).parts,
      ).toHaveLength(2);
    }
    const many = Array.from({ length: 300 }, (_, i) => ({ body: jpegLike(i, 700) }));
    const got = parse([stream(many)]);
    expect(got.parts).toHaveLength(300);
    expect(sameBytes(got.parts[299]!.bytes, many[299]!.body)).toBe(true);
    // a stream that goes on far past the size of its buffer: consumed bytes are compacted away
    const long = Array.from({ length: 500 }, (_, i) => ({ body: jpegLike(1000 + i, 20_000) }));
    const parser = new MjpegParser(B);
    let count = 0;
    for (const piece of chunked(stream(long, { length: true }), randomSizes(rng(77), 3000))) {
      count += parser.feed(piece).length;
    }
    expect(count).toBe(500);
    expect(parser.failure).toBeNull();
  });

  it('keeps nothing of a part that was cut off: it is not given, and the end says so', () => {
    for (const options of [{ length: true }, {}]) {
      const whole = stream(three, options);
      const cut = whole.slice(0, whole.length - 700);
      const got = parse([cut]);
      expect(got.parts.length).toBe(2);
      expect(got.end).toBe('truncated');
    }
    // cut inside a header block, inside a boundary, before anything
    const head = stream(three, { length: true });
    const at = head.length - 1 - jpegLike(3, 1200).length - 20;
    expect(parse([head.slice(0, at)]).end).toBe('truncated');
    expect(parse([bytesOf(`--${B}\r\nContent-Ty`)]).end).toBe('truncated');
    expect(parse([bytesOf(`--${B.slice(0, 5)}`)]).end).toBe('truncated');
    expect(parse([new Uint8Array(0)]).end).toBe('clean');
    expect(parse([bytesOf(`--${B}\r\n`)]).end).toBe('clean');
  });

  it('answers the same when asked twice, and parses nothing after the end', () => {
    const parser = new MjpegParser(B);
    expect(parser.feed(stream(three, { length: true })).length).toBe(3);
    expect(parser.finish()).toBe('clean');
    expect(parser.finish()).toBe('clean');
    expect(parser.feed(stream(three, { length: true }))).toEqual([]);
    expect(parser.state).toBe('done');
  });
});

describe('a stream that is not what it should be', () => {
  it('gives up on garbage before the first boundary – the preamble is short', () => {
    const noise = 'x'.repeat(9000);
    const got = parse([bytesOf(noise), stream(three)]);
    expect(got.parser.failure).toBe('garbage');
    expect(got.parser.state).toBe('failed');
    expect(got.parts).toEqual([]);
    expect(got.end).toBe('failed');
    // dashes and a boundary that never completes are garbage too
    expect(parse([bytesOf('-'.repeat(9000))]).parser.failure).toBe('garbage');
    expect(parse([bytesOf('--boundarydonotcrossXYZ'.repeat(500))]).parser.failure).toBe('garbage');
    // a short one is fine
    expect(parse([bytesOf('x'.repeat(100)), stream(three)]).parts).toHaveLength(3);
  });

  it('gives up on a header block that is too long – finished or not', () => {
    const long = `X-Junk: ${'a'.repeat(9000)}\r\n`;
    expect(parse([bytesOf(`--${B}\r\n${long}\r\nabc`)]).parser.failure).toBe('header-too-large');
    // not finished, and never going to be
    const endless = parse([bytesOf(`--${B}\r\n`), bytesOf('X-Junk: 1\r\n'.repeat(2000))]);
    expect(endless.parser.failure).toBe('header-too-large');
    // within the limit it goes
    const options = { maxHeaderBytes: 200 };
    expect(parse([stream(three)], B, options).parts).toHaveLength(3);
    expect(
      parse([bytesOf(`--${B}\r\nX: ${'a'.repeat(300)}\r\n\r\nabc\r\n--${B}\r\n`)], B, options)
        .parser.failure,
    ).toBe('header-too-large');
  });

  it('gives up on a body that is too long: by its length, and by never meeting a boundary', () => {
    const options = { maxPartBytes: 1000 };
    const tooLong = bytesOf(`--${B}\r\nContent-Length: 1001\r\n\r\n`);
    expect(parse([tooLong], B, options).parser.failure).toBe('part-too-large');
    expect(
      parse([bytesOf(`--${B}\r\nContent-Length: 99999999999999999999\r\n\r\n`)]).parser.failure,
    ).toBe('part-too-large');
    const endless = parse(
      [bytesOf(`--${B}\r\nX: 1\r\n\r\n`), jpegLike(1, 600), jpegLike(2, 600)],
      B,
      options,
    );
    expect(endless.parser.failure).toBe('part-too-large');
    // a big body arriving in one piece with its boundary, over the limit
    const bigOne = stream([{ body: jpegLike(1, 1500) }]);
    expect(parse([bigOne], B, options).parser.failure).toBe('part-too-large');
    // exactly the limit is fine, with and without a length
    expect(
      parse([stream([{ body: jpegLike(1, 1000) }], { length: true })], B, options).parts,
    ).toHaveLength(1);
    expect(parse([stream([{ body: jpegLike(1, 1000) }])], B, options).parts).toHaveLength(1);
    // the default cap is 8 MiB
    expect(
      parse([bytesOf(`--${B}\r\nContent-Length: ${8 * 1024 * 1024 + 1}\r\n\r\n`)]).parser.failure,
    ).toBe('part-too-large');
  });

  it('gives up where a body is not followed by the boundary: a wrong Content-Length', () => {
    const body = jpegLike(1, 500);
    const wrong = concat(
      bytesOf(`--${B}\r\nContent-Length: 400\r\n\r\n`),
      body,
      bytesOf(`\r\n--${B}\r\n`),
    );
    const got = parse([wrong]);
    expect(got.parser.failure).toBe('bad-framing');
    // what was there for the part was given before the framing after it could be seen wrong: the failure is what counts
    expect(got.parts).toHaveLength(1);
    // a body followed by a bare CR is no line break
    const cr = concat(bytesOf(`--${B}\r\nContent-Length: 3\r\n\r\nabc\rX--${B}\r\n`));
    expect(parse([cr]).parser.failure).toBe('bad-framing');
    // a longer token after the boundary is another boundary, not this one
    const longer = bytesOf(`--${B}\r\nContent-Length: 3\r\n\r\nabc\r\n--${B}ZZ\r\n`);
    expect(parse([longer]).parser.failure).toBe('bad-framing');
    // a dash and then not a dash
    expect(
      parse([bytesOf(`--${B}\r\nContent-Length: 3\r\n\r\nabc\r\n--${B}-x`)]).parser.failure,
    ).toBe('bad-framing');
    // nothing after the failure is read, and nothing is returned
    const parser = new MjpegParser(B);
    parser.feed(longer);
    expect(parser.failure).toBe('bad-framing');
    expect(parser.feed(stream(three))).toEqual([]);
    expect(parser.state).toBe('failed');
  });

  it('waits where a boundary may still come, and does not fail on a half boundary line', () => {
    const half = bytesOf(`--${B}\r\nContent-Length: 3\r\n\r\nabc\r\n--${B}`);
    const parser = new MjpegParser(B);
    expect(parser.feed(half).length).toBe(1);
    expect(parser.failure).toBeNull();
    expect(parser.feed(bytesOf('-')).length).toBe(0);
    expect(parser.failure).toBeNull();
    expect(parser.feed(bytesOf('-')).length).toBe(0);
    expect(parser.state).toBe('done');
    const spaces = new MjpegParser(B);
    spaces.feed(bytesOf(`--${B}${' '.repeat(80)}\r\n`));
    expect(spaces.state).toBe('preamble'); // too much padding is no boundary line
  });
});

describe('the parts are views of the parser – a consumer copies what it keeps', () => {
  it('gives parts that are right at once, and copies of them stay right after much more was fed', () => {
    const parser = new MjpegParser(B);
    const first = jpegLike(11, 2000);
    const kept: Uint8Array[] = [];
    const gotFirst = parser.feed(stream([{ body: first }], { length: true }));
    expect(sameBytes(gotFirst[0]!.bytes, first)).toBe(true);
    kept.push(gotFirst[0]!.bytes.slice());
    for (let i = 0; i < 200; i++) {
      const parts = parser.feed(stream([{ body: jpegLike(100 + i, 5000) }], { length: true }));
      for (const p of parts) expect(p.bytes.length).toBe(5000);
    }
    expect(sameBytes(kept[0]!, first)).toBe(true);
  });
});
