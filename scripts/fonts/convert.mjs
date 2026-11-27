#!/usr/bin/env node
/**
 * Converter for the single-line font faces of the CAM library (packages/cam/src/fonts/*.ts).
 *
 *   node scripts/fonts/convert.mjs <input-dir>            (writes packages/cam/src/fonts/{simplex,script,modern}.ts)
 *   node scripts/fonts/convert.mjs <input-dir> --check    (writes nothing, fails when a file would change)
 *   node scripts/fonts/convert.mjs <input-dir> --out <dir>
 *
 * It runs offline, needs nothing but Node (no packages), reads only the three files below and is deterministic: the same
 * inputs give byte-identical output (the generated files are formatted the way `prettier` formats them, so
 * `prettier --check packages/cam/src/fonts` passes without a second step). The downloads are NOT committed – put them
 * into one directory under exactly these names. The converter checks their SHA-256 and refuses anything else, so
 * a changed upstream file cannot slip in unseen:
 *
 *   futural.jhf   Hershey Sans 1-stroke ("simplex").
 *                 https://raw.githubusercontent.com/kamalmostafa/hershey-fonts/master/hershey-fonts/futural.jhf
 *   scripts.jhf   Hershey Script 1-stroke ("script").
 *                 https://raw.githubusercontent.com/kamalmostafa/hershey-fonts/master/hershey-fonts/scripts.jhf
 *   ReliefSingleLineSVG-Regular.svg   Relief SingleLine ("modern"), the SVG font of github.com/isdat-type/Relief-SingleLine
 *                 (fonts/open_svg/, branch master as fetched on 2026-11-27, commit not pinned – the hash below is what was read)
 *
 * What it does with them
 * - Hershey (.jhf: one record per character, 96 records = ASCII 32 to 126 and one more that is skipped): the vertices
 *   are read as they are (integers, y down, relative to the ASCII value of 'R'), turned into "y up, baseline 0, glyph cell
 *   starting at x = 0": x_cell = x − left, y_up = (−y) + 9 (the baseline of both faces is y = −9: the lowest point of
 *   'H', checked), so the capitals are 21 high; the x is 14 high and the descenders reach −7 in Sans, 9 and −12 in Script (the
 *   small letters of the Script are small). The advance of a glyph is the font's own
 *   (right − left), NOT ink width + a gap: Hershey's letters have designed room (an A sits close to a V, an H
 *   far from an H) and the Script face is drawn so that its letters meet (the exit stroke of an `a` ends where the
 *   entry stroke of the next letter starts) – a uniform gap would break both. `ink` is where the strokes really lie
 *   inside the cell (the library uses it to put the ink of a line, not its cell, on the anchor). `ı` and `ȷ`
 *   (dotless i and j: where an accent takes the dot's place) are `i` and `j` without their dot stroke.
 *   Accents, ß, „, € and every character the data lacks are NOT taken from here: the library composes them from its own
 *   glyphs at load time (font.ts), so no own work sits under the licence of the data.
 * - Relief SingleLine (SVG font, units 1000, y up, baseline 0, glyph origin at the cell's left edge): the paths (M, relative
 *   h v l c s, z) become absolute `M L C` in the library's own packed grammar (C = cubic Bézier, integers). Cubics
 *   are kept as cubics (exact) rather than split into quadratics: the library draws them with `cubicPoints`. The
 *   2-unit stub strokes the design has on a few glyphs (`M141 680h-2` on I, i, |) are dropped: a stroke shorter than
 *   `STUB` units would only plunge the cutter. The advance of a glyph is its `horiz-adv-x` (default 280); kerning
 *   pairs (`hkern`) are ignored. Accents are not copied one by one: for each combining mark the converter takes
 *   the strokes that the font's accented glyph (ö, ó …) has more than its base letter (it asserts the base's strokes come
 *   first and unchanged), puts them relative to the middle of the base's cell (where the font centres its accents),
 *   and measures how far the font lifts them over a capital (`lift`, 125 – not cap − x-height, which is 135).
 * - What is kept: ASCII 32–126, ß ẞ Ø ø · × ° € – — ‘ ’ “ ” ‚ „ … − and the two dotless letters (Relief), the same
 *   characters the standard face has plus the rest of ASCII; the accented letters come from base + mark at run time.
 *
 * What the numbers mean and where they are checked: test/fontFaces.test.ts pins the character list, the heights, the
 * advances and a hash of the contours of a sample text per face.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const INPUTS = {
  'futural.jhf': '4958a1d06ea04709feb530deaab53d1efa1285d0d3e92a4a3edd74d279871ced',
  'scripts.jhf': '6b391b2ea3a0771cf18caff0ed111db3d05681fa586d423a740cc0b2b155a873',
  'ReliefSingleLineSVG-Regular.svg':
    '75f05a5b64ed6039c9816628ee051d98e16c19148a8268c63f5eccf8382479e2',
};

/** Strokes shorter than this (Relief units) are artefacts of the design, not lines to cut. */
const STUB = 4;

// ---------------------------------------------------------------------------------------------------------------------
// Notices. They go into the header of every generated file: the Hershey acknowledgements "must be distributed with the
// font data", and the OFL (§2) wants the copyright line and the licence with every copy.
// ---------------------------------------------------------------------------------------------------------------------

const HERSHEY_NOTICE = `The Hershey Fonts are a set of vector fonts with a liberal license.

USE RESTRICTION:
    This distribution of the Hershey Fonts may be used by anyone for
    any purpose, commercial or otherwise, providing that:
        1. The following acknowledgements must be distributed with
            the font data:
            - The Hershey Fonts were originally created by Dr.
                A. V. Hershey while working at the U. S.
                National Bureau of Standards.
            - The format of the Font data in this distribution
                was originally created by
                    James Hurt
                    Cognition, Inc.
                    900 Technology Park Drive
                    Billerica, MA 01821
                    (mit-eddie!ci-dandelion!hurt)
        2. The font data in this distribution may be converted into
            any other format *EXCEPT* the format distributed by
            the U.S. NTIS where each point is described
            in eight bytes as "xxx yyy:", where xxx and yyy are
            the coordinate values as ASCII numbers.`;

const HERSHEY_NOTES_ITEM2 = `        2. The font data in this distribution may be converted into
            any other format *EXCEPT* the format distributed by
            the U.S. NTIS (which organization holds the rights
            to the distribution and use of the font data in that
            particular format). Not that anybody would really
            *want* to use their format... each point is described
            in eight bytes as "xxx yyy:", where xxx and yyy are
            the coordinate values as ASCII numbers.`;

const hersheyHeader = (title, file) => `/*
 * ${title}
 *
 * GENERATED by scripts/fonts/convert.mjs from ${file} (kamalmostafa/hershey-fonts, which has them from
 * http://emergent.unpythonic.net/software/hershey). Do not edit by hand: change the converter and run it again.
 * The coordinates are the font's own, moved to "y up, baseline 0, glyph cell from x = 0" (see the converter);
 * only the format is ours (a packed stroke string, not the NTIS format "xxx yyy:", which the licence excludes).
 *
 * Notice that must travel with the Hershey font data (as distributed in the SVG fonts of the same set, "Hershey Fonts
 * in SVG", www.evilmadscientist.com):
 *
${indent(HERSHEY_NOTICE, ' *   ')}
 *
 * COPYING of that repository names for these .jhf data: "Copyright: 1967 Dr. A. V. Hershey, James Hurt" (its GNU
 * General Public License 2 is for its library code, none of which is used here), and the item 2 reads like this in
 * its hershey-fonts.notes (same two conditions):
 *
${indent(HERSHEY_NOTES_ITEM2, ' *   ')}
 */`;

const RELIEF_COPYRIGHT =
  'Copyright 2022 The Relief SingleLine Project Authors (https://github.com/isdat-type/Relief-SingleLine)';

const reliefHeader = () => `/*
 * Relief SingleLine
 *
 * ${RELIEF_COPYRIGHT}
 * (The SVG font file this was read from names 2021 in its metadata, OFL.txt of the project 2022: both are the project's.)
 *
 * This Font Software is licensed under the SIL Open Font License, Version 1.1.
 * The licence text is kept in the repository as licenses/Relief-SingleLine-OFL.txt and is available with a FAQ at
 * https://openfontlicense.org (https://scripts.sil.org/OFL).
 *
 * THIS FILE IS A MODIFIED VERSION of the Font Software in the sense of the OFL: the outlines of the glyphs are the
 * project's, converted by scripts/fonts/convert.mjs from ReliefSingleLineSVG-Regular.svg into this packed stroke
 * format (relative path commands made absolute, 2-unit stub strokes dropped, kerning pairs and all glyphs the library does
 * not use left out, accents kept as separate marks). GENERATED – do not edit by hand. As a Modified Version this file
 * stays under the SIL Open Font License 1.1 (condition 5); the project's Reserved Font Name clause does not apply (the
 * copyright line names none).
 */`;

const hersheyCredit = (title) =>
  `${title}: the Hershey Fonts, originally created by Dr. A. V. Hershey while working at the U. S. National Bureau of Standards; ` +
  'the format of the font data was originally created by James Hurt, Cognition, Inc. Converted into stroke data for this app.';
const RELIEF_CREDIT = `Relief SingleLine: ${RELIEF_COPYRIGHT}. Licensed under the SIL Open Font License, Version 1.1; this is a modified version (the outlines converted into stroke data).`;

function indent(text, prefix) {
  return text
    .split('\n')
    .map((line) => (line ? prefix + line : prefix.trimEnd()))
    .join('\n');
}

// ---------------------------------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------------------------------

const fail = (message) => {
  throw new Error(message);
};
const round = (v, digits = 1) => {
  const f = 10 ** digits;
  const r = Math.round(v * f) / f;
  return Object.is(r, -0) ? 0 : r;
};
const num = (v) => String(round(v, 3));
const median = (values) => {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** A stroke is {points: [[x, y]...], curves: false} for polylines; Relief strokes are segment lists. */
// Segment lists: [{type: 'M'|'L'|'C', p: [x, y, ...]}]

/** The exact bounds of a segment list (cubics by their extrema). */
function segmentBounds(strokes) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const take = (x, y) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };
  for (const stroke of strokes) {
    let at = null;
    for (const seg of stroke) {
      if (seg.type === 'C') {
        const [x3, y3] = seg.p.slice(4);
        take(x3, y3);
        for (const axis of [0, 1]) {
          const p0 = at[axis];
          const p1 = seg.p[axis];
          const p2 = seg.p[2 + axis];
          const p3 = seg.p[4 + axis];
          // derivative of a cubic: a t² + b t + c
          const a = -p0 + 3 * p1 - 3 * p2 + p3;
          const b = 2 * (p0 - 2 * p1 + p2);
          const c = p1 - p0;
          const roots = [];
          if (Math.abs(a) < 1e-12) {
            if (Math.abs(b) > 1e-12) roots.push(-c / b);
          } else {
            const disc = b * b - 4 * a * c;
            if (disc >= 0) {
              roots.push((-b + Math.sqrt(disc)) / (2 * a), (-b - Math.sqrt(disc)) / (2 * a));
            }
          }
          for (const t of roots) {
            if (t > 0 && t < 1) {
              const u = 1 - t;
              const v = u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
              if (axis === 0) take(v, at[1]);
              else take(at[0], v);
            }
          }
        }
        at = [x3, y3];
      } else {
        take(seg.p[0], seg.p[1]);
        at = [seg.p[0], seg.p[1]];
      }
    }
  }
  return { minX, maxX, minY, maxY };
}

/** The packed string of a segment list: "M x y L x y C x1 y1 x2 y2 x y". */
const pack = (strokes) =>
  strokes.map((stroke) => stroke.map((s) => s.type + s.p.map(num).join(' ')).join(' ')).join(' ');

const segLength = (stroke) => {
  let len = 0;
  let at = null;
  for (const s of stroke) {
    const end = [s.p[s.p.length - 2], s.p[s.p.length - 1]];
    if (at) len += Math.hypot(end[0] - at[0], end[1] - at[1]);
    at = end;
  }
  return len;
};

// ---------------------------------------------------------------------------------------------------------------------
// Hershey (.jhf)
// ---------------------------------------------------------------------------------------------------------------------

function parseJhf(text, label) {
  const lines = text.split('\n').filter((l) => l.trim() !== '');
  const records = [];
  let i = 0;
  while (i < lines.length) {
    const head = /^([ 0-9]{5})([ 0-9]{3})(.*)$/.exec(lines[i]);
    if (!head) fail(`${label}: line ${i + 1} is no record header`);
    const count = Number(head[2]);
    let body = head[3];
    i += 1;
    while (body.length < 2 * count) {
      if (i >= lines.length) fail(`${label}: record ends inside its vertices`);
      body += lines[i];
      i += 1;
    }
    if (body.length !== 2 * count)
      fail(`${label}: a record has ${body.length / 2} vertices, not ${count}`);
    records.push(body);
  }
  return records;
}

function decodeJhf(body) {
  const left = body.charCodeAt(0) - 82;
  const right = body.charCodeAt(1) - 82;
  const strokes = [[]];
  for (let k = 2; k < body.length; k += 2) {
    const a = body[k];
    const b = body[k + 1];
    if (a === ' ' && b === 'R') {
      strokes.push([]);
      continue;
    }
    strokes[strokes.length - 1].push([a.charCodeAt(0) - 82, 82 - b.charCodeAt(0)]);
  }
  return { left, right, strokes: strokes.filter((s) => s.length > 0) };
}

function hersheyFace({ title, text, label, variable }) {
  const records = parseJhf(text, label);
  if (records.length !== 96) fail(`${label}: expected 96 records, found ${records.length}`);
  const decoded = {};
  for (let k = 0; k < 95; k++) decoded[String.fromCharCode(32 + k)] = decodeJhf(records[k]);
  // Baseline and capital height from the 'H' (the baseline is not y = 0 in the .jhf files).
  const hYs = decoded.H.strokes.flat().map((p) => p[1]);
  const baseline = -Math.min(...hYs);
  const cap = Math.max(...hYs) + baseline;
  if (baseline !== 9 || cap !== 21) fail(`${label}: H is not 21 high on a baseline at -9`);
  // The x-height is the top of the x (14 in Sans, 9 in Script: its small letters are small).
  const small = Math.max(...decoded.x.strokes.flat().map((p) => p[1])) + baseline;

  const glyph = (ch, strokes, left, right) => {
    const cell = strokes.map((s) => s.map(([x, y]) => [x - left, y + baseline]));
    const xs = cell.flat().map((p) => p[0]);
    return {
      ch,
      w: right - left,
      ink: xs.length ? [Math.min(...xs), Math.max(...xs)] : null,
      strokes: cell.map((s) => s.map(([x, y], n) => ({ type: n === 0 ? 'M' : 'L', p: [x, y] }))),
      top: xs.length ? Math.max(...cell.flat().map((p) => p[1])) : 0,
    };
  };

  const glyphs = [];
  const dropped = [];
  for (let k = 0; k < 95; k++) {
    const ch = String.fromCharCode(32 + k);
    const { left, right, strokes } = decoded[ch];
    // A stroke of a single point could only plunge the cutter: leave it out (none in these two faces, checked).
    const real = strokes.filter(
      (s) => s.length >= 2 && !s.every((p) => p[0] === s[0][0] && p[1] === s[0][1]),
    );
    if (real.length !== strokes.length) dropped.push(ch);
    glyphs.push(glyph(ch, real, left, right));
  }
  if (dropped.length) fail(`${label}: strokes without length in ${dropped.join(' ')}`);

  // Dotless i and j: the same glyph without the dot stroke (the one that lies above the x-height and is small).
  for (const [ch, key] of [
    ['i', 'ı'],
    ['j', 'ȷ'],
  ]) {
    const g = glyphs.find((x) => x.ch === ch);
    const isDot = (s) => {
      const ys = s.map((q) => q.p[1]);
      const xs = s.map((q) => q.p[0]);
      return (
        Math.min(...ys) > small &&
        Math.max(...xs) - Math.min(...xs) <= 4 &&
        Math.max(...ys) - Math.min(...ys) <= 4
      );
    };
    const dots = g.strokes.filter(isDot);
    if (dots.length !== 1) fail(`${label}: ${ch} has ${dots.length} dot strokes`);
    const strokes = g.strokes.filter((s) => !isDot(s));
    const xs = strokes.flat().map((s) => s.p[0]);
    glyphs.push({
      ch: key,
      w: g.w,
      ink: [Math.min(...xs), Math.max(...xs)],
      strokes,
      top: small,
    });
  }
  return finishFace({
    title,
    variable,
    glyphs,
    cap,
    small,
    spaceOf: ' ',
    header: hersheyHeader(title, label.split('/').pop()),
    credit: hersheyCredit(title),
    marks: [],
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Relief SingleLine (SVG font)
// ---------------------------------------------------------------------------------------------------------------------

const ENTITY = { quot: '"', amp: '&', apos: "'", lt: '<', gt: '>' };
const unescapeXml = (s) =>
  s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-z]+);/g, (m, e) => {
    if (e[0] === '#')
      return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    return ENTITY[e] ?? fail(`unknown XML entity ${m}`);
  });

/** The segments of an SVG path made of M c h l s v z (relative where lower case, M absolute), as absolute M/L/C. */
function parseSvgPath(d, label) {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const strokes = [];
  let stroke = null;
  let at = [0, 0];
  let start = [0, 0];
  let lastCtl = null;
  let i = 0;
  const read = (n) => {
    const out = [];
    for (let k = 0; k < n; k++) {
      const t = tokens[i++];
      if (t === undefined || /^[a-zA-Z]$/.test(t)) fail(`${label}: path ends inside a command`);
      out.push(Number(t));
    }
    return out;
  };
  const line = (x, y) => {
    stroke.push({ type: 'L', p: [x, y] });
    at = [x, y];
    lastCtl = null;
  };
  while (i < tokens.length) {
    let cmd = tokens[i++];
    if (!/^[a-zA-Z]$/.test(cmd)) fail(`${label}: number without command`);
    const again = () => i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i]);
    do {
      switch (cmd) {
        case 'M': {
          const [x, y] = read(2);
          stroke = [{ type: 'M', p: [x, y] }];
          strokes.push(stroke);
          at = [x, y];
          start = [x, y];
          lastCtl = null;
          cmd = 'L';
          break;
        }
        case 'h':
          line(at[0] + read(1)[0], at[1]);
          break;
        case 'v':
          line(at[0], at[1] + read(1)[0]);
          break;
        case 'l': {
          const [dx, dy] = read(2);
          line(at[0] + dx, at[1] + dy);
          break;
        }
        case 'c': {
          const [a, b, c, e, f, g] = read(6);
          const p = [at[0] + a, at[1] + b, at[0] + c, at[1] + e, at[0] + f, at[1] + g];
          stroke.push({ type: 'C', p });
          lastCtl = [p[2], p[3]];
          at = [p[4], p[5]];
          break;
        }
        case 's': {
          const [c, e, f, g] = read(4);
          const first = lastCtl ? [2 * at[0] - lastCtl[0], 2 * at[1] - lastCtl[1]] : at;
          const p = [first[0], first[1], at[0] + c, at[1] + e, at[0] + f, at[1] + g];
          stroke.push({ type: 'C', p });
          lastCtl = [p[2], p[3]];
          at = [p[4], p[5]];
          break;
        }
        case 'z':
        case 'Z':
          if (at[0] !== start[0] || at[1] !== start[1]) line(start[0], start[1]);
          break;
        default:
          fail(`${label}: path command ${cmd} is not handled`);
      }
    } while (cmd !== 'z' && cmd !== 'Z' && again());
  }
  return strokes;
}

function parseReliefSvg(text) {
  const font = /<font\b[^>]*horiz-adv-x="(\d+)"/.exec(text);
  const face = /<font-face\b([^>]*)>/s.exec(text);
  if (!font || !face) fail('Relief: no <font> or <font-face>');
  const attrs = (s) =>
    Object.fromEntries([...s.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
  const fa = attrs(face[1]);
  const metrics = {
    cap: Number(fa['cap-height']),
    small: Number(fa['x-height']),
    units: Number(fa['units-per-em']),
    adv: Number(font[1]),
  };
  const glyphs = new Map();
  for (const m of text.matchAll(/<glyph\b([^>]*?)\/>/gs)) {
    const a = attrs(m[1]);
    if (a.unicode === undefined) continue;
    const ch = unescapeXml(a.unicode);
    if ([...ch].length !== 1) continue;
    glyphs.set(ch, {
      name: a['glyph-name'],
      w: a['horiz-adv-x'] === undefined ? metrics.adv : Number(a['horiz-adv-x']),
      strokes: a.d ? parseSvgPath(a.d, `glyph ${a['glyph-name']}`) : [],
    });
  }
  return { metrics, glyphs };
}

const MARKS = [
  // combining mark, its name, the letters to take it from (the first that has such a glyph): a letter that is
  // as wide as it is round, because the font centres its accents on the cell, not on the ink (measured: the marks on
  // a, o, u, w, y are within 1 unit of the middle of the cell, on e, c and r they are shifted towards the ink)
  ['\u0308', 'diaeresis', 'oauwy'],
  ['\u0301', 'acute', 'oauwy'],
  ['\u0300', 'grave', 'oauwy'],
  ['\u0302', 'circumflex', 'oauwy'],
  ['\u030c', 'caron', 'nsecz'],
  ['\u0303', 'tilde', 'oau'],
  ['\u030a', 'ring', 'au'],
  ['\u0327', 'cedilla', 'c'],
];

const sameSeg = (a, b) =>
  a.type === b.type && a.p.length === b.p.length && a.p.every((v, k) => v === b.p[k]);
const startsWithStrokes = (whole, base) =>
  whole.length > base.length &&
  base.every((s, k) => s.length === whole[k].length && s.every((q, n) => sameSeg(q, whole[k][n])));

function reliefFace(text, label) {
  const { metrics, glyphs: source } = parseReliefSvg(text);
  if (metrics.units !== 1000) fail(`${label}: units-per-em is ${metrics.units}`);
  const keep = [
    ...Array.from({ length: 95 }, (_, k) => String.fromCharCode(32 + k)),
    ...'ßẞØø·×°€–—‘’“”‚„…−ıȷ',
  ];
  const stubs = [];
  const take = (ch) => {
    const g = source.get(ch) ?? fail(`${label}: no glyph for ${ch}`);
    const strokes = g.strokes.filter((s) => {
      if (segLength(s) < STUB) {
        stubs.push(g.name);
        return false;
      }
      return true;
    });
    const b = strokes.length ? segmentBounds(strokes) : null;
    return {
      ch,
      w: g.w,
      ink: b ? [Math.round(b.minX), Math.round(b.maxX)] : null,
      // The exact (unrounded) box, for the measurements below.
      box: b,
      strokes,
      top: b ? b.maxY : 0,
    };
  };
  const glyphs = keep.map(take);

  // Cap height as drawn (the font says 680): the top of the H. The x-height as drawn is the top of the x (555; the
  // font says 545 – its round letters overshoot, the flat ones do not).
  const capDrawn = Math.round(glyphs.find((g) => g.ch === 'H').top);
  if (capDrawn !== metrics.cap)
    fail(`${label}: H is ${capDrawn} high, the font says ${metrics.cap}`);
  const smallDrawn = Math.round(glyphs.find((g) => g.ch === 'x').top);

  // Accents: what the accented glyph has more than its base, relative to the middle of the base's cell.
  const marks = [];
  const report = [];
  for (const [mark, name, bases] of MARKS) {
    const found = [];
    for (const [ch, g] of source) {
      const nfd = ch.normalize('NFD');
      if ([...nfd].length === 2 && nfd[1] === mark && /^[A-Za-z]$/.test(nfd[0]))
        found.push([nfd[0], g]);
    }
    const pick = [...bases]
      .map((b) => found.find(([base]) => base === b))
      .find((x) => x !== undefined);
    if (!pick) fail(`${label}: no accented glyph for ${name}`);
    const [base, accented] = pick;
    const plain = source.get(base);
    const baseStrokes = plain.strokes.filter((s) => segLength(s) >= STUB);
    const whole = accented.strokes.filter((s) => segLength(s) >= STUB);
    if (!startsWithStrokes(whole, baseStrokes))
      fail(`${label}: ${accented.name} does not start with ${plain.name}`);
    const extra = whole.slice(baseStrokes.length);
    // x is put relative to the middle of the base's cell: the library places a mark there.
    const centre = plain.w / 2;
    const eb = segmentBounds(extra);
    const below = eb.maxY < metrics.small / 2;
    const relative = extra.map((s) =>
      s.map((seg) => ({
        type: seg.type,
        p: seg.p.map((v, k) => round(k % 2 === 0 ? v - centre : v, 1)),
      })),
    );
    marks.push({ mark, name, below, strokes: relative });
    // How far the font lifts this mark over a capital: the same mark on the capital of that base.
    const cap = found.find(([b]) => b === base.toUpperCase() && base !== base.toUpperCase());
    if (cap && !below) {
      const capExtra = cap[1].strokes
        .filter((s) => segLength(s) >= STUB)
        .slice(source.get(base.toUpperCase()).strokes.filter((s) => segLength(s) >= STUB).length);
      report.push({ name, lift: segmentBounds(capExtra).minY - eb.minY });
    }
  }
  const lifts = report.map((r) => r.lift);
  const lift = Math.round(median(lifts));
  if (Math.max(...lifts) - Math.min(...lifts) > 6)
    fail(`${label}: the lift of the marks differs: ${JSON.stringify(report)}`);

  const face = finishFace({
    title: 'Relief SingleLine',
    variable: 'MODERN',
    glyphs,
    cap: metrics.cap,
    small: smallDrawn,
    spaceOf: ' ',
    header: reliefHeader(),
    credit: RELIEF_CREDIT,
    marks,
    lift,
  });
  face.stubs = [...new Set(stubs)];
  face.lifts = report;
  face.stubCount = stubs.length;
  return face;
}

// ---------------------------------------------------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------------------------------------------------

/** Which characters rise above the x-height by more than half of the way to the capitals. */
function finishFace({ title, variable, glyphs, cap, small, spaceOf, header, credit, marks, lift }) {
  const space = glyphs.find((g) => g.ch === spaceOf).w;
  const tallLine = small + (cap - small) / 2;
  const tall = glyphs
    .filter(
      (g) => g.ink && g.top > tallLine && !'ij'.includes(g.ch) && /[A-Za-z0-9ØøßẞÄÖÜ]/.test(g.ch),
    )
    .map((g) => g.ch)
    .join('');
  // The room a letter that stands alone has at each side (capitals and digits: the small letters of a script face
  // are drawn to touch their neighbours, so they say nothing about it). Borrowed glyphs get it.
  const isolated = glyphs.filter((g) => g.ink && /[A-Z0-9]/.test(g.ch));
  const side = round(median(isolated.map((g) => (g.ink[0] + (g.w - g.ink[1])) / 2)), 0);
  return { title, variable, glyphs, cap, small, space, tall, side, header, credit, marks, lift };
}

/** A string literal the way prettier prints it: single quotes unless the text holds more of them than double quotes. */
const q = (s) => {
  const singles = s.split("'").length - 1;
  const doubles = s.split('"').length - 1;
  const quote = singles > doubles ? '"' : "'";
  const body = s.replace(/\\/g, '\\\\').replaceAll(quote, `\\${quote}`);
  return quote + body + quote;
};
const isId = (ch) => /^[\p{ID_Start}_$]$/u.test(ch);
const key = (ch) =>
  isId(ch)
    ? ch
    : ch.length === 1 && ch.charCodeAt(0) < 128
      ? q(ch)
      : `'\\u${ch.codePointAt(0).toString(16).padStart(4, '0')}'`;

/** An object entry the way prettier prints it: on one line if it fits into 100 columns, else spread out. */
function entry(indentation, name, fields) {
  const one = `${indentation}${name}: { ${fields.join(', ')} },`;
  if (one.length <= 100) return one;
  return [
    `${indentation}${name}: {`,
    ...fields.map((f) => `${indentation}  ${f},`),
    `${indentation}},`,
  ].join('\n');
}

/** `name: value,` – on a line of its own below the name where it does not fit (prettier breaks it after the colon). */
function entryLine(indentation, name, value) {
  const one = `${indentation}${name}: ${value},`;
  return one.length <= 100 ? [one] : [`${indentation}${name}:`, `${indentation}  ${value},`];
}

function emit(face) {
  const out = [];
  out.push(face.header);
  out.push('');
  out.push("import type { FaceData } from '../font';");
  out.push('');
  out.push(`export const ${face.variable}: FaceData = {`);
  out.push(`  cap: ${face.cap},`);
  out.push(`  small: ${face.small},`);
  if (face.lift !== undefined) out.push(`  lift: ${face.lift},`);
  out.push(`  space: ${face.space},`);
  out.push(`  side: ${face.side},`);
  out.push(`  tall: ${q(face.tall)},`);
  out.push(...entryLine('  ', 'credit', q(face.credit)));
  out.push('  glyphs: {');
  for (const g of face.glyphs) {
    const fields = [`w: ${num(g.w)}`];
    if (g.ink) fields.push(`ink: [${g.ink.map(num).join(', ')}]`);
    fields.push(`d: ${q(pack(g.strokes.map((s) => s)))}`);
    out.push(entry('    ', key(g.ch), fields));
  }
  out.push('  },');
  if (face.marks.length) {
    out.push('  marks: {');
    for (const m of face.marks) {
      const fields = [`d: ${q(pack(m.strokes))}`];
      if (m.below) fields.push('below: true');
      out.push(entry('    ', key(m.mark), fields));
    }
    out.push('  },');
  }
  out.push('};');
  out.push('');
  return out.join('\n');
}

// ---------------------------------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------------------------------

function main(argv) {
  const args = argv.slice(2);
  const check = args.includes('--check');
  const outIndex = args.indexOf('--out');
  const outDir = resolve(
    outIndex >= 0
      ? args[outIndex + 1]
      : new URL('../../packages/cam/src/fonts/', import.meta.url).pathname,
  );
  const dir = args.find((a, k) => !a.startsWith('--') && args[k - 1] !== '--out');
  if (!dir) fail('usage: node scripts/fonts/convert.mjs <input-dir> [--check] [--out <dir>]');
  const read = (name) => {
    const file = join(resolve(dir), name);
    if (!existsSync(file))
      fail(`missing input ${file} (see the top of this script for where to get it)`);
    const buf = readFileSync(file);
    const hash = createHash('sha256').update(buf).digest('hex');
    if (hash !== INPUTS[name])
      fail(
        `${name}: SHA-256 ${hash} is not the file this converter was written for (${INPUTS[name]})`,
      );
    return buf.toString(name.endsWith('.svg') ? 'utf8' : 'ascii');
  };
  const faces = {
    simplex: hersheyFace({
      title: 'Hershey Sans 1-stroke',
      text: read('futural.jhf'),
      label: 'futural.jhf',
      variable: 'SIMPLEX',
    }),
    script: hersheyFace({
      title: 'Hershey Script 1-stroke',
      text: read('scripts.jhf'),
      label: 'scripts.jhf',
      variable: 'SCRIPT',
    }),
    modern: reliefFace(read('ReliefSingleLineSVG-Regular.svg'), 'ReliefSingleLineSVG-Regular.svg'),
  };
  if (!check) mkdirSync(outDir, { recursive: true });
  let changed = 0;
  for (const [id, face] of Object.entries(faces)) {
    const text = emit(face);
    const file = join(outDir, `${id}.ts`);
    const old = existsSync(file) ? readFileSync(file, 'utf8') : null;
    if (old !== text) changed += 1;
    if (!check) writeFileSync(file, text);
    const glyphBytes = Buffer.byteLength(text);
    console.log(
      `${id}: ${face.glyphs.length} glyphs, cap ${face.cap}, x-height ${face.small}, ${face.marks.length} marks, ` +
        `side ${face.side}, tall "${face.tall}", ${glyphBytes} bytes${old === text ? ' (unchanged)' : ''}`,
    );
    if (face.stubs)
      console.log(
        `  stub strokes dropped: ${face.stubCount} (${face.stubs.join(', ')}); lift ${face.lift}: ${JSON.stringify(face.lifts)}`,
      );
  }
  if (check && changed) fail(`${changed} generated file(s) differ from the converter's output`);
}

// Run as a script; importing it (to look at the parsers) does nothing.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main(process.argv);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

export { parseReliefSvg, segmentBounds };
