import { describe, expect, it } from 'vitest';
import {
  onBlank,
  SIM_BLANKS,
  SIM_JIG,
  SIM_JIG_PLACES,
  Simulator,
  SIM_ERRORS,
  SURFACE_Z,
  toBlank,
} from '../src/sim/simulator';

/** Runs the machine for `seconds` in 20 ms steps and collects what it says. */
function run(sim: Simulator, seconds: number): string[] {
  const out: string[] = [];
  for (let t = 0; t < seconds; t += 0.02) out.push(...sim.tick(0.02));
  return out;
}

const mpos = (sim: Simulator) => /MPos:([^|]+)/.exec(sim.status())![1]!.split(',').map(Number);

describe('simulated FluidNC', () => {
  it('answers like the controller', () => {
    const sim = new Simulator();
    expect(sim.line('$I')).toContain('ok');
    expect(sim.line('$G')[0]).toMatch(/^\[GC:G0 G54 .* T1 /);
    expect(sim.line('$#')).toContain('[TLO:0.000]');
    expect(sim.line('$Config/Filename')[0]).toBe('$Config/Filename=config.yaml');
    expect(sim.line('$LocalFS/Show=config.yaml').join('\n')).toContain('steps_per_mm: 50.000');
    expect(sim.line('$/axes/x/steps_per_mm=49.925')).toEqual(['ok']);
    expect(sim.line('$CD').join('\n')).toContain('steps_per_mm: 49.925');
    expect(sim.line('(comment only)')).toEqual(['ok']);
    expect(sim.status()).toMatch(/^<Idle\|MPos:160\.000,140\.000,-60\.000\|FS:0,0\|WCO:/);
  });

  it('moves in real time and waits with G4 P0 until it stands still', () => {
    const sim = new Simulator();
    expect(sim.line('G90 G53 G1 X220 F1200')).toEqual(['ok']);
    expect(sim.line('G4 P0')).toEqual([]); // answered later
    expect(sim.status()).toMatch(/^<Run/);
    const half = run(sim, 1.5); // 60 mm at 20 mm/s takes 3 s
    expect(half).toEqual([]);
    expect(mpos(sim)[0]).toBeCloseTo(190, 0);
    expect(run(sim, 2)).toEqual(['ok']);
    expect(mpos(sim)[0]).toBeCloseTo(220, 3);
    expect(sim.status()).toMatch(/^<Idle/);
  });

  it('never goes faster than an axis may: max_rate_mm_per_min caps a jog, set and read at runtime', () => {
    const sim = new Simulator();
    expect(sim.line('$/axes/z/max_rate_mm_per_min')).toEqual([
      '$/axes/z/max_rate_mm_per_min=1200.000',
      'ok',
    ]);
    // The app's jog feed asks for 4000 mm/min; Z goes at most 1200.
    expect(sim.line('$J=G91 G21 Z10 F4000')).toEqual(['ok']);
    run(sim, 0.1);
    expect(sim.status()).toContain('|FS:1200,');
    run(sim, 1);
    expect(mpos(sim)[2]).toBeCloseTo(-50, 3);
    expect(sim.line('$/axes/z/max_rate_mm_per_min=600')).toEqual(['ok']);
    expect(sim.line('$/axes/z/max_rate_mm_per_min')[0]).toBe(
      '$/axes/z/max_rate_mm_per_min=600.000',
    );
    expect(sim.line('$/axes/z/max_rate_mm_per_min=-5')).toEqual(['error:3']);
    expect(sim.line('$CD').join('\n')).toContain('max_rate_mm_per_min: 600.000');
    expect(sim.line('$J=G91 G21 Z-5 F4000')).toEqual(['ok']);
    run(sim, 0.1);
    expect(sim.status()).toContain('|FS:600,');
    // A diagonal: the share of each axis counts (X 9000, Z 600).
    run(sim, 1);
    expect(sim.line('$J=G91 G21 X100 Z1 F20000')).toEqual(['ok']);
    run(sim, 0.05);
    expect(Number(/FS:(\d+)/.exec(sim.status())![1])).toBe(9000);
    // The flash: a file written back is shown as it is, without its blank lines.
    sim.localFiles.set('config.yaml', 'a: 1\n\nb: 2\n');
    expect(sim.line('$LocalFS/Show=config.yaml')).toEqual(['a: 1', 'b: 2', 'ok']);
  });

  it('sets the work zero where it stands, or to given machine coordinates', () => {
    const sim = new Simulator(); // stands at 160 / 140 / −60
    expect(sim.line('G10 L20 P0 X0 Y5')).toEqual(['ok']);
    expect(sim.status()).toContain('WCO:160.000,135.000,0.000');
    expect(sim.line('G10 L2 P0 Z-80')).toEqual(['ok']);
    expect(sim.status()).toContain('WCO:160.000,135.000,-80.000');
    // Another work system, by its number.
    expect(sim.line('G10 L20 P2 Z10')).toEqual(['ok']);
    expect(sim.line('$#')).toContain('[G55:0.000,0.000,-70.000]');
  });

  it('jogs, cancels a jog and holds a job', () => {
    const sim = new Simulator();
    sim.line('$J=G91 G21 X100 F6000');
    run(sim, 0.2);
    expect(sim.status()).toMatch(/^<Jog/);
    sim.realtime(0x85);
    expect(sim.status()).toMatch(/^<Idle/);
    const x = mpos(sim)[0]!;
    run(sim, 1);
    expect(mpos(sim)[0]).toBe(x);
    sim.line('G0 X400');
    sim.realtime(0x21);
    run(sim, 1);
    expect(mpos(sim)[0]).toBe(x);
    sim.realtime(0x7e);
    run(sim, 10);
    expect(mpos(sim)[0]).toBeCloseTo(400, 3);
    expect(sim.realtime(0x18)[0]).toMatch(/^Grbl 3\.7 \[FluidNC/);
  });

  it('homes, sets work offsets and keeps the planner to 16 blocks', () => {
    const sim = new Simulator();
    expect(sim.line('$H')).toEqual([]);
    const said = run(sim, 120);
    expect(said).toEqual(['[MSG:Homed:ZXY]', 'ok']);
    expect(mpos(sim)).toEqual([3, 3, 3]);
    sim.line('G10 L2 P0 X100 Y50 Z-80');
    expect(sim.status()).toContain('WCO:100.000,50.000,-80.000');
    sim.line('G90 G0 X0 Y0 Z5');
    run(sim, 60);
    expect(mpos(sim)).toEqual([100, 50, -75]);
    const answers = Array.from({ length: 20 }, (_, i) => sim.line(`G1 X${i + 1} F600`));
    expect(answers.filter((a) => a.length === 0).length).toBeGreaterThan(0);
    expect(run(sim, 5).filter((l) => l === 'ok').length).toBeGreaterThan(0);
  });

  it('probes down to the material and fails above it', () => {
    const sim = new Simulator();
    expect(sim.line('G91 G38.2 Z-50 F300')).toEqual([]);
    const said = run(sim, 15);
    expect(said[0]).toBe(`[PRB:160.000,140.000,${SURFACE_Z.toFixed(3)}:1]`);
    expect(said[1]).toBe('ok');
    const miss = new Simulator();
    miss.line('G91 G38.2 Z-5 F300');
    expect(run(miss, 5)).toContain('ALARM:4');
    expect(miss.line('G0 X1')).toEqual(['error:9']);
    miss.line('$X');
    expect(miss.status()).toMatch(/^<Idle/);
  });

  it('leaves a mark where the tool dips into the material, with the machine errors', () => {
    const sim = new Simulator();
    sim.line('G90 G53 G1 Z-81 F600');
    run(sim, 5);
    sim.line('G90 G53 G1 Z-60 F600');
    run(sim, 5);
    expect(sim.marks).toHaveLength(1);
    const g = (SIM_ERRORS.gamma * Math.PI) / 180;
    expect(sim.marks[0]!.y).toBeCloseTo(SIM_ERRORS.ky * Math.cos(g) * 140, 6);
    // Cutting along leaves a groove.
    sim.line('G90 G53 G1 Z-81 F600');
    sim.line('G1 X170');
    run(sim, 5);
    expect(sim.marks.some((m) => m.x2 !== undefined)).toBe(true);
  });

  it('runs a file from its SD card and answers when it is through', () => {
    const sim = new Simulator();
    sim.files.set('teil.nc', 'G90 G53 G0 X170 Y140\n(only a comment)\nG53 G1 X180 F600\nM30\n');
    expect(sim.line('$SD/List')).toEqual(['[FILE: teil.nc|SIZE:59]', 'ok']);
    expect(sim.line('$SD/Run=/fehlt.nc')).toEqual(['error:60']);
    expect(sim.line('$SD/Run=/teil.nc')).toEqual([]);
    expect(sim.status()).toMatch(/^<Run.*\|SD:[\d.]+,\/sd\/teil\.nc>$/);
    // Held, it waits; resumed, it runs on; the one ok comes at the end.
    run(sim, 0.1);
    sim.realtime(0x21);
    expect(run(sim, 3)).toEqual([]);
    sim.realtime(0x7e);
    expect(sim.status()).toMatch(/^<Run/);
    expect(run(sim, 5)).toEqual(['ok']);
    expect(mpos(sim).slice(0, 2)).toEqual([180, 140]);
    expect(sim.status()).toMatch(/^<Idle/);
    expect(sim.status()).not.toContain('SD:');
    // A reset ends a running file without the ok.
    sim.line('$SD/Run=/teil.nc');
    run(sim, 0.1);
    sim.realtime(0x18);
    expect(run(sim, 5)).toEqual([]);
    expect(sim.status()).toMatch(/^<Idle/);
    // A long file goes through the planner without an ok per line.
    sim.files.set(
      'lang.nc',
      Array.from({ length: 60 }, (_, i) => `G53 G1 X${160 + (i % 2)} F6000`).join('\n'),
    );
    sim.line('$SD/Run=/lang.nc');
    expect(run(sim, 10)).toEqual(['ok']);
  });

  it('goes round arcs and helixes', () => {
    const sim = new Simulator();
    sim.line('G90 G53 G1 X200 Y140 F6000');
    run(sim, 2);
    // A quarter circle counter-clockwise around 190/140, then a full helix turn clockwise.
    sim.line('G53 G3 X190 Y150 I-10 J0 F600');
    let far = 0;
    for (let t = 0; t < 3; t += 0.02) {
      sim.tick(0.02);
      const [x, y] = mpos(sim) as [number, number];
      expect(Math.abs(Math.hypot(x - 190, y - 140) - 10)).toBeLessThan(0.1);
      far = Math.max(far, x + y);
    }
    expect(mpos(sim).slice(0, 2)).toEqual([190, 150]);
    // Through 45°: 190 + 7.07 and 140 + 7.07.
    expect(far).toBeCloseTo(190 + 140 + 2 * 7.071, 0);
    sim.line('G53 G2 X190 Y150 I0 J-10 Z-70');
    let low = 200;
    for (let t = 0; t < 8; t += 0.02) {
      sim.tick(0.02);
      low = Math.min(low, mpos(sim)[1]!);
    }
    expect(low).toBeCloseTo(130, 1);
    expect(mpos(sim)).toEqual([190, 150, -70]);
  });

  it('cuts as wide as its cutter and remembers how deep', () => {
    const sim = new Simulator();
    sim.toolRadius = 3;
    for (const z of [-84, -60, -93, -60]) {
      sim.line(`G90 G53 G1 Z${z} F6000`);
      run(sim, 2);
    }
    // Pecking the same hole twice is one hole, as deep as the deeper peck.
    expect(sim.marks).toHaveLength(1);
    expect(sim.marks[0]).toMatchObject({ r: 3, z: -93 });
  });

  it('takes the width of the cutter of a T number at its tool change – and what was queued before the change keeps its own', () => {
    const sim = new Simulator();
    sim.toolRadius = 3;
    sim.toolDiameters = { 1: 6, 2: 3 };
    // all of it is queued before anything moves: the change to T2 is already known when the first hole is cut
    for (const line of [
      'T1 M6',
      'G90 G53 G1 Z-84 F6000',
      'G90 G53 G1 Z-60 F6000',
      'G90 G53 G0 X200',
      'T2 M6',
      'G90 G53 G1 Z-84 F6000',
    ]) {
      sim.line(line);
    }
    run(sim, 6);
    // the holes of T1 (where the machine stood) are 6 wide, the one of T2 (200 along) is 3 wide
    const near = sim.marks.filter((m) => m.x < 180);
    const far = sim.marks.filter((m) => m.x > 190);
    expect(near.length).toBeGreaterThan(0);
    expect(far.length).toBeGreaterThan(0);
    expect(near.every((m) => m.r === 3)).toBe(true);
    expect(far.every((m) => m.r === 1.5)).toBe(true);
    expect(sim.marks.some((m) => m.z === -84)).toBe(true);
  });

  it('a tool change changes nothing about the width where the app told no diameter (as it always was)', () => {
    const sim = new Simulator();
    sim.toolRadius = 3;
    for (const line of [
      'T1 M6',
      'G90 G53 G1 Z-84 F6000',
      'G90 G53 G0 X200',
      'T2 M6',
      'G90 G53 G1 Z-84 F6000',
    ]) {
      sim.line(line);
    }
    run(sim, 6);
    expect(sim.marks.length).toBeGreaterThan(1);
    expect(sim.marks.every((m) => m.r === 3)).toBe(true);
    // …and a T number it was not told about keeps the cutter that was in
    sim.toolDiameters = { 1: 6 };
    for (const line of ['T9 M6', 'G90 G53 G0 X300', 'G90 G53 G1 Z-90 F6000']) sim.line(line);
    run(sim, 6);
    expect(sim.marks.every((m) => m.r === 3)).toBe(true);
  });

  describe('turning its board over', () => {
    /** A board lying square at 100/100, so the numbers can be checked by hand. */
    const square = () => {
      const sim = new Simulator();
      sim.board = { x: 100, y: 100, angle: 0, flipped: false };
      // Two holes right through (the board is 12 mm, its top at −80) and into the table,
      // a groove 4 mm deep, and a mark beside the board.
      sim.marks.push(
        { x: 150, y: 200, r: 3, z: -98 },
        { x: 450, y: 200, r: 3, z: -98 },
        { x: 200, y: 150, x2: 220, y2: 150, r: 3, z: -84 },
        { x: 50, y: 50, r: 0.5, z: -81 },
      );
      return sim;
    };
    const near = (p: { x: number; y: number }, x: number, y: number) => {
      expect(p.x).toBeCloseTo(x, 6);
      expect(p.y).toBeCloseTo(y, 6);
    };

    it('on pins: like a page of a book around the middle between the holes', () => {
      const sim = square();
      // The holes are named roughly; the drilled ones count.
      sim.flipBoard({ x: 151, y: 201 }, { x: 449, y: 199 }, 'across', true);
      // The flip line is x = 300: the corner at 100/100 lies at 500/100, the board runs to the left.
      expect(sim.board.flipped).toBe(true);
      near(sim.board, 500, 100);
      expect(sim.board.angle).toBeCloseTo(180, 6);
      // Hole 1 (50/100 on the board) now lies where hole 2 was, and the other way round.
      near(sim.fromBoard({ x: 50, y: 100 }), 450, 200);
      near(sim.fromBoard({ x: 350, y: 100 }), 150, 200);
      near(sim.toBoard({ x: 450, y: 200 }), 50, 100);
      // The board took its cuts along; the holes also stay in the table, the mark beside it too.
      expect(sim.marks).toEqual([{ x: 50, y: 50, r: 0.5, z: -81 }]);
      expect(sim.spoil.map((m) => m.x)).toEqual([150, 450]);
      const cuts = sim.boardCuts();
      expect(cuts.map((c) => [c.x, c.y, c.back, c.through])).toEqual([
        [50, 100, false, true],
        [350, 100, false, true],
        [100, 50, false, false],
      ]);
      // A cut into the back on the flip line hits the place that lay there before: 200/50.
      sim.marks.push({ x: 300, y: 150, r: 3, z: -85 });
      const back = sim.boardCuts().at(-1)!;
      near(back, 200, 50);
      expect(back).toMatchObject({ back: true, through: false });
      // Turned once more it lies as at the start.
      sim.flipBoard({ x: 150, y: 200 }, { x: 450, y: 200 }, 'across', true);
      expect(sim.board.flipped).toBe(false);
      near(sim.board, 100, 100);
      expect(Math.cos((sim.board.angle * Math.PI) / 180)).toBeCloseTo(1, 9);
      expect(sim.boardCuts()).toHaveLength(4);
    });

    it('with both holes on the flip line each stays where it is', () => {
      const sim = square();
      sim.marks.push({ x: 300, y: 120, r: 3, z: -98 }, { x: 300, y: 330, r: 3, z: -98 });
      sim.flipBoard({ x: 300, y: 120 }, { x: 300, y: 330 }, 'along', true);
      near(sim.board, 500, 100);
      near(sim.fromBoard({ x: 200, y: 20 }), 300, 120);
      near(sim.fromBoard({ x: 200, y: 230 }), 300, 330);
      // Over the front edge instead: holes level on the line y = 200.
      const over = square();
      over.flipBoard({ x: 150, y: 200 }, { x: 450, y: 200 }, 'along', true);
      near(over.board, 100, 300);
      near(over.fromBoard({ x: 50, y: 100 }), 150, 200);
      near(over.fromBoard({ x: 0, y: 250 }), 100, 50);
      // The flip line can also be named by its direction: straight up through the middle.
      const named = square();
      named.flipBoard({ x: 150, y: 190 }, { x: 450, y: 210 }, Math.PI / 2, true);
      near(named.board, 500, 100);
    });

    it('put down by hand it lies a little off and turned, differently each time', () => {
      const sim = square();
      sim.flipBoard({ x: 150, y: 200 }, { x: 450, y: 200 }, 'across', false);
      // Exactly turned, the middle of the board would lie at 300/225.
      near(sim.fromBoard({ x: 200, y: 125 }), 302.6, 223.1);
      expect(sim.board.angle).toBeCloseTo(181.4, 6);
      const first = { ...sim.board };
      sim.flipBoard({ x: 150, y: 200 }, { x: 450, y: 200 }, 'across', false);
      sim.flipBoard({ x: 150, y: 200 }, { x: 450, y: 200 }, 'across', false);
      expect(sim.board.x).not.toBeCloseTo(first.x, 1);
    });
  });
});

describe('blanks for a series', () => {
  it('lie apart from each other, except the two that touch', () => {
    const corners = (a: (typeof SIM_BLANKS)[number]) =>
      [-1, 1].flatMap((sx) =>
        [-1, 1].map((sy) => {
          const r = (a.angle * Math.PI) / 180;
          const x = (sx * a.length) / 2;
          const y = (sy * a.width) / 2;
          return {
            x: a.x + x * Math.cos(r) - y * Math.sin(r),
            y: a.y + x * Math.sin(r) + y * Math.cos(r),
          };
        }),
      );
    // A corner of one on the other: enough for boxes of this size.
    const overlapping: string[] = [];
    SIM_BLANKS.forEach((a, i) => {
      for (const b of SIM_BLANKS.slice(i + 1)) {
        const hit = corners(a).some((c) => onBlank(b, c)) || corners(b).some((c) => onBlank(a, c));
        if (hit) overlapping.push(`${a.id}/${b.id}`);
      }
    });
    expect(overlapping).toEqual(['pair-1/pair-2']);
    expect(SIM_BLANKS.filter((b) => b.touching).map((b) => b.id)).toEqual(['pair-1', 'pair-2']);
  });

  it('knows a point of the table in the coordinates of a blank', () => {
    const tag = SIM_BLANKS[0]!; // 70 × 40 around 450 / 175, turned 20°
    // 10 mm along its long side from the middle: (cos 20°, sin 20°) · 10.
    const p = toBlank(tag, { x: 450 + 9.397, y: 175 + 3.42 });
    expect(p.x).toBeCloseTo(10, 2);
    expect(p.y).toBeCloseTo(0, 2);
    expect(onBlank(tag, { x: 450, y: 175 })).toBe(true);
    // 30 mm straight above the middle is off this blank (20 mm half width).
    expect(onBlank(tag, { x: 450, y: 205 })).toBe(false);
    const round = SIM_BLANKS.find((b) => b.shape === 'round')!;
    expect(onBlank(round, { x: round.x + 29, y: round.y })).toBe(true);
    expect(onBlank(round, { x: round.x + 22, y: round.y + 22 })).toBe(false);
  });

  it('sorts what was cut by the blank it is on', () => {
    const sim = new Simulator();
    sim.scene = 'blanks';
    const tag = SIM_BLANKS[0]!;
    // A groove along the long side of the first tag, a dot on the round one, a dot on the table.
    const a = (20 * Math.PI) / 180;
    sim.marks.push(
      {
        x: tag.x - 20 * Math.cos(a),
        y: tag.y - 20 * Math.sin(a),
        x2: tag.x + 20 * Math.cos(a),
        y2: tag.y + 20 * Math.sin(a),
        r: 0.5,
        z: -81,
      },
      { x: 455, y: 295, r: 0.5, z: -81 },
      { x: 300, y: 300, r: 0.5, z: -81 },
    );
    const { blanks, stray } = sim.blankCuts();
    const groove = blanks.find((b) => b.id === 'tag-1')!.cuts[0]!;
    expect(groove.x).toBeCloseTo(-20, 6);
    expect(groove.y).toBeCloseTo(0, 6);
    expect(groove.x2).toBeCloseTo(20, 6);
    expect(groove.y2).toBeCloseTo(0, 6);
    expect(blanks.find((b) => b.id === 'round')!.cuts).toEqual([{ x: 0, y: 0, r: 0.5, z: -81 }]);
    expect(blanks.filter((b) => b.cuts.length > 0)).toHaveLength(2);
    expect(stray).toEqual([{ x: 300, y: 300, r: 0.5, z: -81 }]);
  });
});

describe('the jig scene', () => {
  it('puts the jig somewhere else every time it comes onto the table', () => {
    const sim = new Simulator();
    expect(sim.jig).toEqual(SIM_JIG_PLACES[0]);
    // The first time it lies at its first place; put down again, at the next.
    sim.setScene('jig');
    expect(sim.jig).toEqual(SIM_JIG_PLACES[0]);
    sim.setScene('board');
    sim.setScene('jig');
    expect(sim.jig).toEqual(SIM_JIG_PLACES[1]);
    sim.setScene('jig');
    expect(sim.jig).toEqual(SIM_JIG_PLACES[1]);
    sim.moveJig();
    expect(sim.jig.angle).toBe(92);
    sim.moveJig({ x: 500, y: 200, angle: 180 });
    expect(sim.jig).toEqual({ x: 500, y: 200, angle: 180 });
    // All places keep both tags on the part of the table the demo has pictures of.
    for (const place of SIM_JIG_PLACES) {
      for (const tag of SIM_JIG.tags) {
        const at = sim.fromJig(tag, place);
        expect(at.x).toBeGreaterThan(140);
        expect(at.x).toBeLessThan(820);
        expect(at.y).toBeGreaterThan(130);
        expect(at.y).toBeLessThan(380);
      }
    }
  });

  it('knows a point of the jig on the table and back', () => {
    const sim = new Simulator();
    sim.moveJig({ x: 500, y: 200, angle: 90 });
    // A quarter turn round: 30 along the plate is 30 up the table, 10 across is 10 to the left.
    const at = sim.fromJig({ x: 30, y: 10 });
    expect(at.x).toBeCloseTo(490, 9);
    expect(at.y).toBeCloseTo(230, 9);
    const back = sim.toJig(at);
    expect(back.x).toBeCloseTo(30, 9);
    expect(back.y).toBeCloseTo(10, 9);
  });

  it('keeps what was cut into the jig when the jig is moved', () => {
    const sim = new Simulator();
    sim.setScene('jig');
    sim.moveJig({ x: 400, y: 100, angle: 0 });
    // A groove across the coaster (its middle is at 110 / 75 on the plate), a dot on the
    // plate beside it, a dot on the table.
    sim.marks.push(
      { x: 400 + 100, y: 100 + 75, x2: 400 + 120, y2: 100 + 75, r: 0.5, z: -81 },
      { x: 400 + 10, y: 100 + 140, r: 0.5, z: -81 },
      { x: 100, y: 100, r: 0.5, z: -81 },
    );
    const before = sim.jigCuts();
    expect(before.blank).toEqual([{ x: -10, y: 0, x2: 10, y2: 0, r: 0.5, z: -81 }]);
    expect(before.plate).toEqual([{ x: 10, y: 140, r: 0.5, z: -81 }]);
    expect(before.stray).toEqual([{ x: 100, y: 100, r: 0.5, z: -81 }]);
    // Moved and turned: the cuts are where they were on the jig; the table keeps its own.
    sim.moveJig({ x: 600, y: 300, angle: 90 });
    expect(sim.marks).toEqual([{ x: 100, y: 100, r: 0.5, z: -81 }]);
    const after = sim.jigCuts();
    expect(after.blank).toEqual(before.blank);
    expect(after.plate).toEqual(before.plate);
    // A new cut where the coaster's middle lies now: 75 to the left and 110 behind the corner.
    sim.marks.push({ x: 600 - 75, y: 300 + 110, r: 0.5, z: -82 });
    const again = sim.jigCuts().blank;
    expect(again).toHaveLength(2);
    expect(again[1]!.x).toBeCloseTo(0, 9);
    expect(again[1]!.y).toBeCloseTo(0, 9);
  });

  it('slides its long board along with its cuts and tags, a little off by hand', () => {
    const sim = new Simulator();
    sim.setScene('long');
    sim.long = { x: 100, y: 200, angle: 0 };
    // A groove on the board, a dot on it, a dot beside it on the table.
    sim.marks.push(
      { x: 600, y: 250, x2: 700, y2: 250, r: 1.5, z: -81 },
      { x: 1000, y: 300, r: 1.5, z: -84 },
      { x: 500, y: 100, r: 1.5, z: -81 },
    );
    expect(sim.longCuts().board).toEqual([
      { x: 500, y: 50, x2: 600, y2: 50, r: 1.5, z: -81 },
      { x: 900, y: 100, r: 1.5, z: -84 },
    ]);
    expect(sim.longCuts().stray).toEqual([{ x: 500, y: 100, r: 1.5, z: -81 }]);
    // Two tags stuck on where the table has them at (900, 280) and (1200, 420).
    sim.stickTags([
      { id: 7, x: 900, y: 280, angle: 12 },
      { id: 8, x: 1200, y: 420, angle: -100 },
    ]);
    expect(sim.longTags).toEqual([
      { id: 7, x: 800, y: 80, angle: 12, size: 40 },
      { id: 8, x: 1100, y: 220, angle: -100, size: 40 },
    ]);
    // Slid exactly: everything on the board is 700 further left on the table.
    sim.slideLong(-700, 0, true);
    expect(sim.long).toEqual({ x: -600, y: 200, angle: 0 });
    expect(sim.marks).toEqual([{ x: 500, y: 100, r: 1.5, z: -81 }]);
    expect(sim.longCuts().board).toHaveLength(2);
    expect(sim.fromJig(sim.longTags[0]!, sim.long)).toEqual({ x: 200, y: 280 });
    // By hand: 14 further, 6 towards the front, turned by 0.35° about the middle of its tags –
    // that middle, (950, 150) on the board, moves by exactly (−686, −6).
    const before = sim.fromJig({ x: 950, y: 150 }, sim.long);
    sim.slideLong(-700, 0);
    const after = sim.fromJig({ x: 950, y: 150 }, sim.long);
    expect(after.x - before.x).toBeCloseTo(-686, 9);
    expect(after.y - before.y).toBeCloseTo(-6, 9);
    expect(sim.long.angle).toBeCloseTo(0.35, 9);
    // The next time it comes to lie differently; the cuts are still where they were on it.
    sim.slideLong(0, -300);
    expect(sim.long.angle).toBeCloseTo(0.05, 9);
    expect(sim.longCuts().board[0]).toEqual({ x: 500, y: 50, x2: 600, y2: 50, r: 1.5, z: -81 });
    // Without tags it turns about its own middle; on another scene its cuts stay the table's.
    const bare = new Simulator();
    bare.long = { x: 0, y: 0, angle: 0 };
    bare.marks.push({ x: 10, y: 10, r: 1, z: -81 });
    bare.slideLong(100, 0);
    expect(bare.fromJig({ x: 1300, y: 150 }, bare.long).x).toBeCloseTo(1300 + 114, 9);
    expect(bare.marks).toHaveLength(1);
    expect(bare.longMarks).toHaveLength(0);
  });
});
