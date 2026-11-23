import { IDENTITY, rotation } from '@lowrider/cam';
import { locateJig, teachJig, type Jig, type JigPlace } from '@lowrider/workshop';
import { describe, expect, it } from 'vitest';
import { imageToMachine, type CameraCalibration } from '../src/lib/camera';
import {
  clampsToJig,
  hasMoved,
  jigFileName,
  jigState,
  jigsWithTag,
  jobReach,
  tagCorners,
  tagLabel,
  turnedProgram,
  withJigClamps,
  withSightings,
  type Sighting,
} from '../src/lib/jigs';
import { findTags, tagOnTable } from '../src/lib/tagFinder';
import { tagPicture, type DrawnTag } from './tagPicture';

const seen = (id: number, x: number, y: number, from: Sighting['from'], map = 1): Sighting => ({
  id,
  x,
  y,
  angle: 0,
  size: 40,
  scale: 1,
  off: 0,
  from,
  map,
});

const jig: Jig = {
  id: 'jig-1',
  name: 'Rahmen',
  tags: [
    { id: 1, size: 40, x: 0, y: 0, angle: 0 },
    { id: 2, size: 40, x: 200, y: 0, angle: 90 },
  ],
  zero: { x: 50, y: 20 },
  turn: 0,
  job: { fileName: 'rahmen.nc', text: 'G0 X10 Y0\nG1 X10 Y5 F300', toolDiameter: 3 },
  reach: 80,
  clamps: [],
  createdAt: 1,
};

describe('from the camera picture to the program on the jig', () => {
  // The live picture: 1200 × 900 at 10 px per mm, its middle 35 mm right of the cutter and
  // 20 mm in front of it. The cutter stands at (100, 200): the crosshair is over (135, 180).
  const camera: CameraCalibration = { offsetX: 35, offsetY: -20, pxPerMm: 10, rotation: 0 };
  const size = { width: 1200, height: 900 };
  const spindle = { x: 100, y: 200 };
  const read = (drawn: DrawnTag, cal = camera) => {
    const found = findTags(tagPicture(1200, 900, [drawn]), 1200, 900, { pxPerMm: 10 });
    expect(found.rejected).toEqual([]);
    expect(found.tags).toHaveLength(1);
    return tagOnTable(found.tags[0]!, (px) => imageToMachine(cal, px, size, spindle));
  };
  const placed = (r: ReturnType<typeof locateJig>): JigPlace => {
    if ('problem' in r) throw new Error(r.problem);
    return r;
  };
  /** Where the two points of the program end up on the table. */
  const cuts = (place: JigPlace, text: string) => {
    const turned = turnedProgram(text, place.rotation) ?? text;
    return turned.split('\n').map((line) => ({
      x: place.zero.x + Number(/X(-?[\d.]+)/.exec(line)![1]),
      y: place.zero.y + Number(/Y(-?[\d.]+)/.exec(line)![1]),
    }));
  };
  const program = 'G0 X10 Y0\nG1 X10 Y5 F300';

  // Taught: a 40 mm tag, upright, 100 px right of the picture's middle and 100 px above
  // it – on the table 10 mm right of the crosshair and 10 mm behind it: (145, 190). The
  // work zero 30 mm right of the tag and 20 behind: (175, 210). The cut runs from (185, 210)
  // to (185, 215), that is from 40 right / 20 behind the tag to 40 right / 25 behind.
  const taughtTag = read({ id: 6, x: 700, y: 350, side: 400 });
  const taught = teachJig([taughtTag], { x: 175, y: 210 })!;

  it('reads the tag where it lies: the picture runs down, the table up', () => {
    expect(taughtTag.id).toBe(6);
    expect(taughtTag.x).toBeCloseTo(145, 2);
    expect(taughtTag.y).toBeCloseTo(190, 2);
    expect(taughtTag.angle).toBeCloseTo(0, 2);
    expect(taughtTag.scale).toBeCloseTo(1, 3);
    expect(taught.zero.x).toBeCloseTo(30, 2);
    expect(taught.zero.y).toBeCloseTo(20, 2);
    // The printed top left corner is the one behind and to the left on the table.
    expect(taughtTag.corners[0]!.x).toBeCloseTo(125, 1);
    expect(taughtTag.corners[0]!.y).toBeCloseTo(210, 1);
  });

  it('follows the jig turned by a quarter', () => {
    // The tag 100 px left of the middle and 50 px below it: (125, 175) on the table; turned
    // a quarter counter-clockwise. What was right of the tag is behind it now, what was
    // behind is to its left: zero at (105, 205), the cut from (105, 215) to (100, 215).
    const place = placed(
      locateJig(taught, [read({ id: 6, x: 500, y: 500, side: 400, angle: 90 })]),
    );
    expect(place.rotation).toBeCloseTo(90, 1);
    expect(place.zero.x).toBeCloseTo(105, 1);
    expect(place.zero.y).toBeCloseTo(205, 1);
    const [a, b] = cuts(place, program);
    expect(a!.x).toBeCloseTo(105, 1);
    expect(a!.y).toBeCloseTo(215, 1);
    expect(b!.x).toBeCloseTo(100, 1);
    expect(b!.y).toBeCloseTo(215, 1);
  });

  it('follows the jig turned by a half', () => {
    // The tag under the crosshair, (135, 180), upside down: zero 30 left and 20 in front
    // of it, the cut from (95, 160) towards the front to (95, 155).
    const place = placed(
      locateJig(taught, [read({ id: 6, x: 600, y: 450, side: 400, angle: 180 })]),
    );
    expect(Math.abs(place.rotation)).toBeCloseTo(180, 1);
    expect(place.zero.x).toBeCloseTo(105, 1);
    expect(place.zero.y).toBeCloseTo(160, 1);
    const [a, b] = cuts(place, program);
    expect(a!.x).toBeCloseTo(95, 1);
    expect(a!.y).toBeCloseTo(160, 1);
    expect(b!.x).toBeCloseTo(95, 1);
    expect(b!.y).toBeCloseTo(155, 1);
  });

  it('follows a jig that lies a few degrees askew, as found', () => {
    // Shifted to (140, 185) and turned by −4°: the zero lies where (30, 20) turned by −4°
    // does, (31.322, 17.859) from the tag; the cut starts at (40, 20) turned: (41.298, 17.161).
    const place = placed(
      locateJig(taught, [read({ id: 6, x: 650, y: 400, side: 400, angle: -4 })]),
    );
    expect(place.rotation).toBeCloseTo(-4, 1);
    expect(place.zero.x).toBeCloseTo(140 + 31.322, 1);
    expect(place.zero.y).toBeCloseTo(185 + 17.859, 1);
    const [a] = cuts(place, program);
    expect(a!.x).toBeCloseTo(140 + 41.298, 1);
    expect(a!.y).toBeCloseTo(185 + 17.161, 1);
  });

  it('takes a camera that is mounted turned into account', () => {
    // The camera a quarter turn round on the head, no offset: the picture's right is the
    // table's back. The tag 100 px right and 100 px above the middle lies 10 mm to the
    // left of the cutter and 10 mm behind it, and what stands upright in the picture is
    // turned by a quarter on the table.
    const turned = read(
      { id: 6, x: 700, y: 350, side: 400 },
      { offsetX: 0, offsetY: 0, pxPerMm: 10, rotation: 90 },
    );
    expect(turned.x).toBeCloseTo(90, 2);
    expect(turned.y).toBeCloseTo(210, 2);
    expect(turned.angle).toBeCloseTo(90, 2);
  });
});

describe('what the camera has seen of the tags', () => {
  it('replaces what the table picture showed by what it shows now', () => {
    const before = [seen(1, 10, 10, 'map'), seen(2, 50, 10, 'map'), seen(3, 90, 10, 'live')];
    const after = withSightings(before, [seen(2, 300, 40, 'map', 2)], { from: 'map', map: 2 });
    // Tag 1 is no longer on the picture; tag 3 was seen live and stays.
    expect(after.map((s) => [s.id, s.x, s.from])).toEqual([
      [2, 300, 'map'],
      [3, 90, 'live'],
    ]);
  });

  it('does not let an unchanged table picture overrule the live picture', () => {
    const live = seen(1, 100, 100, 'live', 5);
    // The same state of the map as when the tag was seen live: the map is the older one.
    expect(withSightings([live], [seen(1, 10, 10, 'map', 5)], { from: 'map', map: 5 })).toEqual([
      live,
    ]);
    // The table was scanned anew since: now the map says where it lies.
    const scanned = withSightings([live], [seen(1, 10, 10, 'map', 6)], { from: 'map', map: 6 });
    expect(scanned[0]!.x).toBe(10);
  });

  it('forgets what should be in the live picture but is not', () => {
    const before = [seen(1, 10, 10, 'map'), seen(2, 500, 10, 'map'), seen(3, 20, 20, 'live')];
    const inView = (p: { x: number }) => p.x < 100;
    const after = withSightings(before, [seen(3, 21, 20, 'live')], {
      from: 'live',
      covers: inView,
    });
    // Tag 1 lay in view and is gone; tag 2 is elsewhere on the table; tag 3 was seen again.
    expect(after.map((s) => [s.id, s.x])).toEqual([
      [2, 500],
      [3, 21],
    ]);
  });

  it('keeps the first of two tags with the same number', () => {
    const twice = [seen(4, 10, 10, 'live'), seen(4, 200, 10, 'live')];
    expect(withSightings([], twice, { from: 'live', covers: () => false })).toEqual([twice[0]]);
  });

  it('knows which jigs a tag belongs to and what stands at it', () => {
    const other = { ...jig, id: 'jig-2', name: 'Rahmen rund' };
    expect(jigsWithTag([jig, other], 2)).toEqual([jig, other]);
    expect(jigsWithTag([jig], 9)).toEqual([]);
    expect(tagLabel([jig, other], 1, 'Marker 1')).toBe('Marker 1 · Rahmen, Rahmen rund');
    expect(tagLabel([jig], 9, 'Marker 9')).toBe('Marker 9');
  });

  it('gives the corners of a tag from its middle and its angle', () => {
    // 40 mm at (100, 50), upright: top left first, then clockwise.
    expect(tagCorners({ x: 100, y: 50, angle: 0, size: 40 })).toEqual([
      { x: 80, y: 70 },
      { x: 120, y: 70 },
      { x: 120, y: 30 },
      { x: 80, y: 30 },
    ]);
    const quarter = tagCorners({ x: 100, y: 50, angle: 90, size: 40 });
    expect(quarter[0]!.x).toBeCloseTo(80, 9);
    expect(quarter[0]!.y).toBeCloseTo(30, 9);
  });
});

describe('a jig that was measured', () => {
  const measured = [
    { id: 1, x: 100, y: 100, angle: 0, size: 40 },
    { id: 2, x: 300, y: 100, angle: 90, size: 40 },
  ];

  it('counts as moved when a tag is seen somewhere else', () => {
    // The live picture off its middle is good to about a millimetre, the table picture to two.
    expect(hasMoved(measured, [seen(1, 101, 100.5, 'live')])).toBe(false);
    expect(hasMoved(measured, [seen(1, 102, 100, 'live')])).toBe(true);
    expect(hasMoved(measured, [seen(2, 302, 100, 'map')])).toBe(false);
    expect(hasMoved(measured, [seen(2, 303, 100, 'map')])).toBe(true);
    // Seen 60 mm off the crosshair, where the lens bends the picture: 1.8 mm more are allowed.
    expect(hasMoved(measured, [{ ...seen(1, 103, 100, 'live'), off: 60 }])).toBe(false);
    expect(hasMoved(measured, [{ ...seen(1, 103.5, 100, 'live'), off: 60 }])).toBe(true);
    // Another tag says nothing about this jig.
    expect(hasMoved(measured, [seen(7, 0, 0, 'live')])).toBe(false);
  });

  it('tells the readiness list what has happened since', () => {
    const placed = { zero: { x: 480, y: 150 }, pose: rotation(90), moved: false };
    expect(jigState(null, [480, 150, -80], IDENTITY)).toBe('unmeasured');
    expect(jigState(placed, [480, 150, -80], rotation(90))).toBe('ok');
    // The Z zero may change – it is set after the jig is measured.
    expect(jigState(placed, [480, 150, -60], rotation(90))).toBe('ok');
    expect(jigState(placed, null, rotation(90))).toBe('ok');
    expect(jigState(placed, [480.01, 150, -80], rotation(90))).toBe('zeroMoved');
    expect(jigState(placed, [480, 150, -80], rotation(91))).toBe('turned');
    expect(jigState({ ...placed, moved: true }, [0, 0, 0], IDENTITY)).toBe('moved');
  });
});

describe('the job of a jig', () => {
  it('is loaded turned about the work zero, under its own name', () => {
    expect(jigFileName('untersetzer.nc')).toBe('untersetzer_vorrichtung.nc');
    expect(jigFileName('rahmen')).toBe('rahmen_vorrichtung.nc');
    expect(turnedProgram(jig.job.text, 0)).toBeNull();
    expect(turnedProgram(jig.job.text, 0.0004)).toBeNull();
    // A quarter turn: (10, 0) goes to (0, 10), (10, 5) to (−5, 10).
    expect(turnedProgram(jig.job.text, 90)).toBe('G0 X0 Y10\nG1 X-5 Y10 F300');
    expect(turnedProgram(jig.job.text, 180)).toBe('G0 X-10 Y0\nG1 X-10 Y-5 F300');
  });

  it('reaches as far as its farthest corner from the tags', () => {
    const frame = { x: 100, y: 100, angle: 0 };
    const bounds = { min: { x: -20, y: -8, z: -1 }, max: { x: 20, y: 8, z: 5 } };
    // Zero 50 right of the first tag and 20 behind; one tag: the far corner is (70, 28) away.
    expect(jobReach([jig.tags[0]!], frame, { x: 150, y: 120 }, bounds)).toBeCloseTo(
      Math.hypot(70, 28),
      9,
    );
    // Two tags: counted from the middle between them, (100, 0) in the jig: (−70, 28) away.
    expect(jobReach(jig.tags, frame, { x: 150, y: 120 }, bounds)).toBeCloseTo(
      Math.hypot(70, 28),
      9,
    );
    // The same jig lying a quarter turn round: the same reach.
    expect(
      jobReach(
        [jig.tags[0]!],
        { x: 0, y: 0, angle: 90 },
        { x: -20, y: 50 },
        {
          min: { x: -8, y: -20 },
          max: { x: 8, y: 20 },
        },
      ),
    ).toBeCloseTo(Math.hypot(70, 28), 9);
    // A program that cuts nothing reaches nowhere.
    const empty = {
      min: { x: Infinity, y: Infinity, z: 0 },
      max: { x: -Infinity, y: -Infinity, z: 0 },
    };
    expect(jobReach(jig.tags, frame, { x: 150, y: 120 }, empty)).toBe(0);
  });

  it('brings its clamps along, and leaves the others where they are', () => {
    const table = {
      name: 'Zwinge 1',
      min: { x: 150, y: 60, z: -1000 },
      max: { x: 210, y: 100, z: 30 },
    };
    const clamps = clampsToJig({ x: 100, y: 50, angle: 0 }, [table]);
    const own = { ...jig, clamps };
    const fixtures = [
      { ...table, jig: 'jig-1' },
      {
        name: 'Schraube 1',
        round: true,
        min: { x: 0, y: 0, z: -1000 },
        max: { x: 12, y: 12, z: 5 },
      },
      { ...table, name: 'Zwinge 9', jig: 'jig-other' },
    ];
    // The jig now a quarter turn round at (300, 200): its clamp 30 left and 80 behind.
    const after = withJigClamps(fixtures, own, { x: 300, y: 200, angle: 90 });
    expect(after.map((f) => f.name)).toEqual(['Schraube 1', 'Zwinge 9', 'Zwinge 1']);
    expect(after[2]).toEqual({
      name: 'Zwinge 1',
      jig: 'jig-1',
      min: { x: 250, y: 250, z: -1000 },
      max: { x: 290, y: 310, z: 30 },
    });
  });
});
