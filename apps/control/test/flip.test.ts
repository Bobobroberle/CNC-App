import {
  applyToPoint,
  compose,
  flipFor,
  flipPoint,
  IDENTITY,
  poseOf,
  rotation,
  translation,
} from '@lowrider/cam';
import { describe, expect, it } from 'vitest';
import { backHoles, expectedHoles, flipReadiness, loadedSide, locateBack } from '../src/lib/flip';
import { useJob } from '../src/store/job';

/** Holes left and right of a 200 mm part, turned like a page: the flip line is x = 100. */
const holes = { a: { x: -15, y: 40 }, b: { x: 215, y: 40 } };
const plan = { flip: flipFor('x', holes), holes };
/** Machine XY of the work zero the front was cut with */
const zero = { x: 500, y: 300 };

const near = (p: { x: number; y: number }, x: number, y: number, digits = 6) => {
  expect(p.x).toBeCloseTo(x, digits);
  expect(p.y).toBeCloseTo(y, digits);
};

/** Where the back program puts a point drawn on the front (work XY), after locating. */
function backOnTable(fit: NonNullable<ReturnType<typeof locateBack>>, drawn: typeof zero) {
  const inProgram = flipPoint(plan.flip, drawn);
  const turned = applyToPoint(rotation(fit.rotation), inProgram);
  return { x: fit.origin.x + turned.x, y: fit.origin.y + turned.y };
}

describe('finding a turned part again', () => {
  it('knows where the holes are in the back program and on the table', () => {
    // Hole 1 was drilled at −15/40; turned over, it lies where hole 2 was.
    expect(backHoles(plan)).toEqual({ a: { x: 215, y: 40 }, b: { x: -15, y: 40 } });
    const on = expectedHoles(plan, zero, IDENTITY);
    near(on.a, 715, 340);
    near(on.b, 485, 340);
  });

  it('follows a front that was cut turned to an edge', () => {
    // The front program had been turned by 90° about its zero: −15/40 was drilled at −40/−15.
    const on = expectedHoles(plan, zero, rotation(90));
    // The back program's hole 1 at 215/40 turns to −40/215.
    near(on.a, 460, 515);
    near(on.b, 460, 285);
    expect(poseOf(rotation(90)).rotation).toBeCloseTo(90, 9);
    expect(poseOf({ ...IDENTITY, e: 3, f: -4 })).toEqual({ rotation: 0, offset: { x: 3, y: -4 } });
  });

  it('a part turned on the spot needs no turn and keeps the zero', () => {
    const fit = locateBack(plan, expectedHoles(plan, zero, IDENTITY))!;
    expect(fit.rotation).toBeCloseTo(0, 9);
    near(fit.origin, 500, 300);
    expect(fit.distanceError).toBeCloseTo(0, 9);
    // A pocket drawn at 30/10 on the front is cut at 170/10 from the back.
    near(backOnTable(fit, { x: 30, y: 10 }), 670, 310);
  });

  it('a part put down a quarter turn round hole 1', () => {
    // Hole 1 found where it was expected, hole 2 not 230 mm to its left but 230 mm in front of it.
    const fit = locateBack(plan, { a: { x: 715, y: 340 }, b: { x: 715, y: 110 } })!;
    expect(fit.rotation).toBeCloseTo(90, 9);
    // The zero: hole 1 less its place in the back program (215/40) turned by 90° (−40/215).
    near(fit.origin, 755, 125);
    // The pocket lay at 670/310, that is −45/−30 from hole 1; a quarter turn makes that 30/−45.
    near(backOnTable(fit, { x: 30, y: 10 }), 745, 295);
  });

  it('a part put down a few degrees off and shifted', () => {
    // Turned on the spot the holes are at 715/340 and 485/340. The part lies turned by 3°
    // about 600/340 (the middle between them) and shifted by 4/−2:
    // sin 3° = 0.052336, cos 3° = 0.998630, so 115 mm from the middle become 114.842 / 6.019.
    const found = {
      a: { x: 600 + 114.842 + 4, y: 340 + 6.019 - 2 },
      b: { x: 600 - 114.842 + 4, y: 340 - 6.019 - 2 },
    };
    const fit = locateBack(plan, found)!;
    expect(fit.rotation).toBeCloseTo(3, 3);
    expect(Math.abs(fit.distanceError)).toBeLessThan(0.001);
    // The pocket at 670/310 is 70/−30 from the middle: turned by 3° that is
    // 70·cos + 30·sin = 71.474 and 70·sin − 30·cos = −26.295, then shifted.
    near(backOnTable(fit, { x: 30, y: 10 }), 600 + 71.474 + 4, 340 - 26.295 - 2, 2);
    // Mirrored about the wrong line it would be a long way off: 30/10 not flipped lies at 530/310.
    expect(backOnTable(fit, { x: 170, y: 10 }).x).toBeLessThan(540);
  });

  it('refuses holes that do not fit', () => {
    expect(locateBack(plan, { a: { x: 715, y: 340 }, b: { x: 715.2, y: 340 } })).toBeNull();
    const far = locateBack(plan, { a: { x: 715, y: 340 }, b: { x: 480, y: 340 } })!;
    expect(far.distanceError).toBeCloseTo(5, 9);
  });
});

describe('where a two-sided job stands for the loaded program', () => {
  const files = {
    front: { fileName: 'teil_vorderseite.nc', text: '' },
    back: { fileName: 'teil_rueckseite.nc', text: '' },
  };

  it('knows the two programs by their names', () => {
    expect(loadedSide(files, 'teil_vorderseite.nc')).toBe('front');
    expect(loadedSide(files, 'teil_rueckseite.nc')).toBe('back');
    expect(loadedSide(files, 'etwas-anderes.nc')).toBeNull();
    expect(loadedSide(files, null)).toBeNull();
    expect(loadedSide(null, 'teil_vorderseite.nc')).toBeNull();
  });

  it('lets the front start first and the back only when the part is found again', () => {
    const front = (phase: Parameters<typeof flipReadiness>[1]) =>
      flipReadiness(files, phase, files.front.fileName);
    const back = (phase: Parameters<typeof flipReadiness>[1]) =>
      flipReadiness(files, phase, files.back.fileName);
    expect(front('front')).toBe('first');
    expect(['turn', 'locate', 'back', 'done'].map((p) => front(p as never))).toEqual(
      Array(4).fill('cutAgain'),
    );
    expect(back('front')).toBe('front');
    expect(back('turn')).toBe('turn');
    expect(back('locate')).toBe('locate');
    expect(back('back')).toBe('ready');
    expect(back('done')).toBe('cutAgain');
    // Any other program has nothing to do with it.
    expect(flipReadiness(files, 'turn', 'demo.nc')).toBeNull();
    expect(flipReadiness(null, 'front', 'teil_rueckseite.nc')).toBeNull();
  });
});

describe('how a derived program lies against the job as loaded', () => {
  const program = 'G21 G90\nG0 X10 Y0\nG1 X20 Y0 F600\n';

  it('remembers turns and shifts, from the original or on top of what is active', () => {
    const job = useJob.getState();
    job.load('teil.nc', program);
    expect(useJob.getState().pose).toEqual(IDENTITY);
    // Turned to a measured edge: counted from the job as loaded.
    job.loadDerived('teil_ausgerichtet.nc', program, { by: rotation(90), from: 'original' });
    near(applyToPoint(useJob.getState().pose, { x: 10, y: 0 }), 0, 10);
    // Measured again: not twice.
    job.loadDerived('teil_ausgerichtet.nc', program, { by: rotation(2), from: 'original' });
    expect(poseOf(useJob.getState().pose).rotation).toBeCloseTo(2, 9);
    // Shifted by hand on top of that.
    job.loadDerived('teil_ausgerichtet.nc', program, { by: translation(5, -3), from: 'current' });
    expect(useJob.getState().pose).toEqual(compose(translation(5, -3), rotation(2)));
    // Levelled or repaired: it lies where it lay.
    const before = useJob.getState().pose;
    job.loadDerived('teil_autolevel.nc', program);
    expect(useJob.getState().pose).toEqual(before);
    expect(useJob.getState().original?.fileName).toBe('teil.nc');
    // New machine values re-read the program; where it lies stays known.
    job.setProfileSettings(useJob.getState().profile);
    expect(useJob.getState().pose).toEqual(before);
    // Back to the job as loaded, or a new one: no turn.
    job.restoreOriginal();
    expect(useJob.getState().pose).toEqual(IDENTITY);
  });
});
