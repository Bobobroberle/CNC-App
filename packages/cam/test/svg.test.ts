import { describe, expect, it } from 'vitest';
import { bounds, pathCommands, readSvg, signedArea, type Contour, type Point } from '../src';

/** A page of 200 × 100 units shown as 100 × 50 mm: half a millimetre per unit. */
const page = (body: string, head = 'width="100mm" height="50mm" viewBox="0 0 200 100"') =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" ${head}>${body}</svg>`;

const box = (c: Contour) => {
  const b = bounds(c.points);
  return [b.minX, b.minY, b.maxX, b.maxY].map((v) => Math.round(v * 1000) / 1000);
};
const rounded = (points: Point[]) =>
  points.map((p) => [Math.round(p.x * 1000) / 1000, Math.round(p.y * 1000) / 1000]);

describe('SVG import', () => {
  it('reads sizes in millimetres through the viewBox and turns y upwards', () => {
    const { contours, notes, unitScale } = readSvg(
      page('<rect x="20" y="10" width="40" height="20"/>'),
    );
    expect(unitScale).toBe(0.5);
    expect(notes).toEqual([]);
    expect(contours).toHaveLength(1);
    expect(contours[0]!.closed).toBe(true);
    // 10 from the top of a 50 mm page is 45 from its lower edge.
    expect(rounded(contours[0]!.points)).toEqual([
      [10, 45],
      [30, 45],
      [30, 35],
      [10, 35],
    ]);
  });

  it('knows the units of width and height', () => {
    const size = (head: string) => {
      const d = readSvg(page('<line x1="0" y1="0" x2="100" y2="0"/>', head));
      return { scale: d.unitScale, notes: d.notes.map((n) => n.code) };
    };
    expect(size('width="10cm" viewBox="0 0 100 100"')).toEqual({ scale: 1, notes: [] });
    expect(size('height="1in" viewBox="0 0 100 100"')).toEqual({ scale: 0.254, notes: [] });
    expect(size('width="72pt" height="72pt" viewBox="0 0 100 100"').scale).toBeCloseTo(0.254);
    expect(size('width="6pc" viewBox="0 0 100 100"').scale).toBeCloseTo(0.254);
    // Width and height disagree: the smaller scale, so nothing is cut off.
    expect(size('width="100mm" height="50mm" viewBox="0 0 100 100"').scale).toBe(0.5);
    // No real unit anywhere: a unit is 1/96 inch, and the reader says so.
    const px = 25.4 / 96;
    expect(size('width="96" height="96" viewBox="0 0 96 96"')).toEqual({
      scale: px,
      notes: ['svg-units'],
    });
    expect(size('width="192px" viewBox="0 0 96 96"').scale).toBeCloseTo(2 * px);
    expect(size('viewBox="0 0 96 96"')).toEqual({ scale: px, notes: ['svg-units'] });
    expect(size('width="100%" height="1e2%" viewBox="0 0 96 96"').notes).toEqual(['svg-units']);
    expect(size('width="50mm" viewBox="0 0 0 0"').scale).toBe(px);
    expect(size('').scale).toBe(px);
  });

  it('stands the drawing on the lower edge of its page, or on its own', () => {
    const y = (head: string) =>
      box(readSvg(page('<rect x="96" y="96" width="96" height="192"/>', head)).contours[0]!);
    const u = 25.4;
    // A page of 4 in: the rectangle from 1 in to 3 in below the top lies 1 in above the lower edge.
    expect(y('width="4in" height="4in"')).toEqual([25.4, 25.4, 50.8, 76.2]);
    // The viewBox starts at 96, 96: there the rectangle hangs in the page's upper left corner.
    expect(y('width="4in" height="4in" viewBox="96 96 384 384"')).toEqual([0, 50.8, 25.4, 101.6]);
    // No page at all: the lowest point becomes y = 0.
    expect(y('')).toEqual([25.4, 0, 50.8, 50.8]);
    const d = readSvg(
      page('<circle cx="96" cy="96" r="96"/><line x1="0" y1="0" x2="9" y2="0"/>', ''),
    );
    expect(d.contours[0]!.circle!.cy).toBeCloseTo(u);
    expect(readSvg(page('', '')).contours).toEqual([]);
  });

  it('follows path data: lines, absolute and relative, with implicit repeats', () => {
    const d = readSvg(page('<path d="M20 20 L60 20 60 40 H20 Z m100 0 l20 0 v20 h-20 z"/>'));
    expect(d.contours.map(box)).toEqual([
      [10, 30, 30, 40],
      [60, 30, 70, 40],
    ]);
    expect(d.contours.every((c) => c.closed)).toBe(true);
    // After z the pen stands at the start of the subpath; drawing goes on from there.
    const on = readSvg(page('<path d="M20 20 h20 v20 z l-10 0"/>')).contours;
    expect(on.map((c) => c.closed)).toEqual([true, false]);
    expect(rounded(on[1]!.points)).toEqual([
      [10, 40],
      [5, 40],
    ]);
    // Coordinates after a relative move are relative lines.
    const m = readSvg(page('<path d="m20,20 20,0 0,20"/>')).contours[0]!;
    expect(rounded(m.points)).toEqual([
      [10, 40],
      [20, 40],
      [20, 30],
    ]);
    expect(readSvg(page('<path d="M20 20 V40 v20"/>')).contours.map(box)).toEqual([
      [10, 20, 10, 40],
    ]);
  });

  it('reads numbers the way SVG writes them', () => {
    expect(pathCommands('M1.5.5-3-4e1,+.25 1e-1l2. 3')).toEqual({
      complete: true,
      commands: [
        { command: 'M', args: [1.5, 0.5] },
        { command: 'L', args: [-3, -40] },
        { command: 'L', args: [0.25, 0.1] },
        { command: 'l', args: [2, 3] },
      ],
    });
    // The flags of an arc may stand without separators.
    expect(pathCommands('M0 0a5 5 0 015 5').commands[1]).toEqual({
      command: 'a',
      args: [5, 5, 0, 0, 1, 5, 5],
    });
    expect(pathCommands('').complete).toBe(true);
  });

  it('stops at an error in path data and keeps what came before', () => {
    const stops = (d: string) => pathCommands(d).commands.length;
    expect(pathCommands('M0 0 L10 10 L20').complete).toBe(false);
    expect(stops('M0 0 L10 10 L20')).toBe(2);
    expect(pathCommands('10 10 L20 20')).toEqual({ commands: [], complete: false });
    expect(pathCommands('M0 0 Z 5 5').complete).toBe(false);
    expect(pathCommands('M0 0 X 5 5').complete).toBe(false);
    expect(pathCommands('M0 0 A5 5 0 2 1 5 5').complete).toBe(false);
    const d = readSvg(page('<path d="M20 20 L60 20 L60 x"/>'));
    expect(d.notes).toEqual([{ code: 'svg-path', count: 1 }]);
    expect(rounded(d.contours[0]!.points)).toEqual([
      [10, 40],
      [30, 40],
    ]);
  });

  it('flattens curves within the tolerance, in millimetres on the table', () => {
    // A quarter circle of radius 100 units = 50 mm, as an arc and as the usual cubic.
    const arc = readSvg(page('<path d="M0 100 A100 100 0 0 1 100 0"/>')).contours[0]!;
    const off = (p: Point) => Math.abs(Math.hypot(p.x - 50, p.y - 0) - 50);
    let worst = 0;
    arc.points.forEach((p, i) => {
      expect(off(p)).toBeLessThan(1e-9);
      const q = arc.points[i + 1];
      if (q) worst = Math.max(worst, off({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }));
    });
    expect(worst).toBeLessThanOrEqual(0.01);
    expect(worst).toBeGreaterThan(0.002);
    expect(rounded([arc.points[0]!, arc.points.at(-1)!])).toEqual([
      [0, 0],
      [50, 50],
    ]);
    const coarse = readSvg(page('<path d="M0 100 A100 100 0 0 1 100 0"/>'), { tolerance: 0.5 });
    expect(coarse.contours[0]!.points.length).toBeLessThan(arc.points.length / 4);
    // The cubic approximation of that quarter circle is within 0.03 % of the radius.
    const k = 55.22847;
    const cubic = readSvg(page(`<path d="M0 100 C0 ${100 - k} ${100 - k} 0 100 0"/>`)).contours[0]!;
    for (const p of cubic.points) expect(off(p)).toBeLessThan(0.02);
    expect(cubic.points.length).toBeGreaterThan(20);
  });

  it('mirrors control points for the smooth commands', () => {
    // S after C: the first control point mirrors the last one – a symmetric S-curve.
    const s = readSvg(page('<path d="M0 50 C0 0 50 0 50 50 S100 100 100 50"/>')).contours[0]!;
    expect(box(s)).toEqual([0, 6.25, 50, 43.75]);
    // S without a curve before it starts straight: both curves are the same.
    const alone = readSvg(page('<path d="M0 50 S50 0 50 50"/>')).contours[0]!;
    const explicit = readSvg(page('<path d="M0 50 C0 50 50 0 50 50"/>')).contours[0]!;
    expect(rounded(alone.points)).toEqual(rounded(explicit.points));
    // T after Q mirrors the quadratic control point; relative forms give the same.
    const q = readSvg(page('<path d="M0 50 Q25 0 50 50 T100 50"/>')).contours[0]!;
    expect(box(q)).toEqual([0, 12.5, 50, 37.5]);
    const rel = readSvg(page('<path d="M0 50 q25 -50 50 0 t50 0"/>')).contours[0]!;
    expect(rounded(rel.points)).toEqual(rounded(q.points));
    const t = readSvg(page('<path d="M0 50 T50 50 T100 50"/>')).contours[0]!;
    expect(box(t)).toEqual([0, 25, 50, 25]);
    // A smooth cubic after a quadratic does not take its control point.
    const mixed = readSvg(page('<path d="M0 50 Q25 0 50 50 s25 0 50 0"/>')).contours[0]!;
    expect(box(mixed)).toEqual([0, 25, 50, 37.5]);
    const relC = readSvg(page('<path d="M0 50 c0 -50 50 -50 50 0 s50 50 50 0"/>')).contours[0]!;
    expect(rounded(relC.points)).toEqual(rounded(s.points));
  });

  it('draws arcs as SVG does: a zero radius is a line, the same point nothing', () => {
    const d = readSvg(
      page('<path d="M20 20 A0 10 0 0 1 60 20 A10 10 0 0 1 60 20 a10 10 0 0 0 20 0"/>'),
    );
    const p = d.contours[0]!.points;
    expect(rounded(p.slice(0, 2))).toEqual([
      [10, 40],
      [30, 40],
    ]);
    expect(rounded([p.at(-1)!])).toEqual([[40, 40]]);
    // Sweep 0 to the right runs over the top of the screen's circle – below the line on the table…
    expect(box(d.contours[0]!)).toEqual([10, 35, 40, 40]);
  });

  it('reads the basic shapes', () => {
    const d = readSvg(
      page(
        `<circle cx="40" cy="40" r="20"/>
         <ellipse cx="100" cy="50" rx="40" ry="20"/>
         <line x1="0" y1="0" x2="20" y2="20"/>
         <polyline points="0,100 20,80 40,100"/>
         <polygon points="100 100, 120 100, 120 80"/>
         <rect x="150" y="10" width="40" height="20" rx="4"/>
         <rect x="150" y="50" width="40" height="20" ry="50"/>
         <rect width="0" height="20"/><circle r="0"/><ellipse rx="5"/><polyline points="5"/>
         <path/><polygon/>`,
      ),
    );
    expect(d.notes).toEqual([]);
    // Closed shapes first, then the open lines.
    const [circle, ellipse, polygon, round, pill, line, polyline] = d.contours;
    // A circle stays an exact circle: it can be drilled.
    expect(circle!.circle).toEqual({ cx: 20, cy: 30, r: 10 });
    expect(box(ellipse!)).toEqual([30, 15, 70, 35]);
    expect(ellipse!.closed).toBe(true);
    expect(ellipse!.circle).toBeUndefined();
    expect(Math.abs(signedArea(ellipse!.points))).toBeCloseTo(Math.PI * 20 * 10, 0);
    expect(line).toMatchObject({ closed: false });
    expect(rounded(polyline!.points)).toEqual([
      [0, 0],
      [10, 10],
      [20, 0],
    ]);
    expect(polyline!.closed).toBe(false);
    expect(polygon!.closed).toBe(true);
    expect(polygon!.points).toHaveLength(3);
    // Rounded corners: one radius counts for both, and never more than half the side.
    expect(box(round!)).toEqual([75, 35, 95, 45]);
    expect(Math.abs(signedArea(round!.points))).toBeCloseTo(200 - (4 - Math.PI) * 4, 0);
    expect(box(pill!)).toEqual([75, 15, 95, 25]);
    // Radii of half the sides on both axes: what is left is an ellipse.
    expect(Math.abs(signedArea(pill!.points))).toBeCloseTo(Math.PI * 10 * 5, 0);
    expect(d.contours).toHaveLength(7);
  });

  it('applies the transforms of groups and elements, innermost first', () => {
    const one = (body: string) => box(readSvg(page(body)).contours[0]!);
    const rect = '<rect width="20" height="10"/>';
    expect(one(`<g transform="translate(40 20)">${rect}</g>`)).toEqual([20, 35, 30, 40]);
    expect(one(`<g transform="translate(40)">${rect}</g>`)).toEqual([20, 45, 30, 50]);
    expect(one(`<g transform="scale(2)">${rect}</g>`)).toEqual([0, 40, 20, 50]);
    expect(one(`<g transform="scale(2, 4)">${rect}</g>`)).toEqual([0, 30, 20, 50]);
    // On the screen a positive angle turns clockwise: the bar hangs down from the corner.
    expect(one(`<g transform="rotate(90)">${rect}</g>`)).toEqual([-5, 40, 0, 50]);
    expect(one(`<g transform="rotate(90 20 10)">${rect}</g>`)).toEqual([10, 45, 15, 55]);
    expect(one(`<g transform="matrix(1 0 0 1 40 20)">${rect}</g>`)).toEqual([20, 35, 30, 40]);
    expect(one(`<g transform="skewX(45)">${rect}</g>`)).toEqual([0, 45, 15, 50]);
    expect(one(`<g transform="skewY(45)">${rect}</g>`)).toEqual([0, 35, 10, 50]);
    // The group moves, then the element is doubled inside it.
    expect(
      one(
        `<g transform="translate(40 20)"><rect transform="scale(2)" width="20" height="10"/></g>`,
      ),
    ).toEqual([20, 30, 40, 40]);
    // Two steps in one attribute, comma or blank between them.
    expect(one(`<g transform="translate(40,20), scale(2)">${rect}</g>`)).toEqual([20, 30, 40, 40]);
    const bad = readSvg(
      page(`<g transform="spin(3)">${rect}</g><g transform="scale(1 2 3)">${rect}</g>`),
    );
    expect(bad.notes).toEqual([{ code: 'svg-transform', count: 2 }]);
    expect(bad.contours.map(box)).toEqual([
      [0, 45, 10, 50],
      [0, 45, 10, 50],
    ]);
    for (const t of ['matrix(1 2)', 'translate()', 'rotate(1 2)', 'skewX()', 'skewY(1 2)']) {
      expect(readSvg(page(`<g transform="${t}">${rect}</g>`)).notes[0]!.code).toBe('svg-transform');
    }
  });

  it('keeps a circle exact under moves, turns and even scaling – and flattens it otherwise', () => {
    const round = readSvg(
      page(
        '<g transform="translate(100 50) rotate(45) scale(2)"><circle cx="0" cy="0" r="10"/></g>',
      ),
    ).contours[0]!;
    expect(round.circle!.r).toBeCloseTo(10);
    expect(round.circle!.cx).toBeCloseTo(50);
    expect(round.circle!.cy).toBeCloseTo(25);
    const oval = readSvg(page('<circle transform="scale(2 1)" cx="20" cy="20" r="10"/>'))
      .contours[0]!;
    expect(oval.circle).toBeUndefined();
    expect(box(oval)).toEqual([10, 35, 30, 45]);
    expect(oval.closed).toBe(true);
    // Cut for its size on the table: 20 mm across needs more points than 2 mm.
    const small = readSvg(page('<circle transform="scale(0.2 0.1)" cx="20" cy="20" r="10"/>'));
    expect(small.contours[0]!.points.length).toBeLessThan(oval.points.length / 2);
  });

  it('leaves out what is not geometry and says what it skipped', () => {
    const d = readSvg(
      page(
        `<defs><rect id="a" width="5" height="5"/><clipPath><circle r="9"/></clipPath></defs>
         <metadata><rdf:RDF><cc:Work/></rdf:RDF></metadata>
         <sodipodi:namedview><inkscape:grid/><rect width="1" height="1"/></sodipodi:namedview>
         <style>rect { fill: red }</style><title>Schild</title>
         <text x="5" y="5">Hallo <tspan>Welt</tspan></text><text>2</text>
         <image href="a.png" width="10" height="10"/>
         <use href="#a" x="10"/>
         <foreignObject><div/></foreignObject><blink/>
         <g display="none"><rect width="9" height="9"/></g>
         <rect style="fill:none; display : none" width="9" height="9"/>
         <svg:rect x="20" y="20" width="20" height="20"><title>Loch</title></svg:rect>`,
      ),
    );
    expect(d.contours.map(box)).toEqual([[10, 30, 20, 40]]);
    expect(d.notes).toEqual([
      { code: 'svg-text', count: 2 },
      { code: 'svg-image', count: 1 },
      { code: 'svg-use', count: 1 },
      { code: 'svg-element', count: 2 },
    ]);
  });

  it('copes with what real files contain around the drawing', () => {
    const d = readSvg(
      `<?xml version='1.0'?>
       <!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
       <!-- made by hand <rect width="5" height="5"/> -->
       <svg:svg xmlns:svg='http://www.w3.org/2000/svg' width='10mm' height='10mm' viewBox='0 0 10 10'>
         <![CDATA[ <rect width="5" height="5"/> ]]>
         <a href="x?a=1&amp;b=2"><switch><svg x="2" y="3" viewBox="0 0 1 1">
           <path id="p&lt;1&gt;" d='M0 0 L1 1'/>
         </svg></switch></a>
       </svg:svg>
       </svg:svg>`,
    );
    expect(d.notes).toEqual([]);
    expect(rounded(d.contours[0]!.points)).toEqual([
      [2, 7],
      [3, 6],
    ]);
    expect(() => readSvg('<html><body/></html>')).toThrow('SVG');
    expect(() => readSvg('')).toThrow('SVG');
  });

  it('joins pieces that meet into one contour', () => {
    const d = readSvg(
      page(
        `<line x1="0" y1="0" x2="20" y2="0"/><line x1="20" y1="20" x2="20" y2="0"/>
         <path d="M0 0 L0 20 L20 20"/>
         <path d="M100 0 L120 0 L120 20 L100 0"/>`,
      ),
    );
    expect(d.contours).toHaveLength(2);
    expect(d.contours.every((c) => c.closed)).toBe(true);
    expect(d.contours.map((c) => c.points.length).sort()).toEqual([3, 4]);
    // Kept apart when asked: nothing joins at a tolerance of zero … but exact ends still meet.
    const apart = readSvg(
      page('<line x1="0" y1="0" x2="20" y2="0"/><line x1="20.1" y1="0" x2="40" y2="0"/>'),
    );
    expect(apart.contours).toHaveLength(2);
    const joined = readSvg(
      page('<line x1="0" y1="0" x2="20" y2="0"/><line x1="20.1" y1="0" x2="40" y2="0"/>'),
      { joinTolerance: 0.1 },
    );
    expect(joined.contours).toHaveLength(1);
  });
});
