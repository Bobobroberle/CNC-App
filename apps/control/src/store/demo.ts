import { circle, rotation, textContours, toGcode, toolpaths, type Operation } from '@lowrider/cam';
import { transformProgram } from '@lowrider/gcode-core';
import { jigFrame, jigReach, teachJig, toJig, type Jig } from '@lowrider/workshop';
import { t } from '../i18n';
import { newZone } from '../lib/clamps';
import {
  DEMO_CAMERA_HEIGHT,
  DEMO_CAMERA_SPOT,
  DEMO_CLAMP,
  DEMO_JIG,
  DEMO_LONG,
  DEMO_SCAN_AREA,
  DEMO_TEXT,
  demoJigFrame,
  demoJobSketches,
  demoLongContours,
  placeOn,
} from '../lib/demo';
import { isFullDemo } from '../lib/persist';
import {
  resetSimulator,
  SIM_ADDRESS,
  SIM_BOARD,
  SIM_CAMERA,
  SIM_JIG,
  simulator,
  simulatorFrame,
  SURFACE_Z,
} from '../sim';
import { camToolDiameter, useCam } from './cam';
import { useCamera } from './camera';
import { scanDemoMap } from './demoMap';
import { useJob } from './job';
import { useMachine } from './machine';
import { useUi } from './ui';
import { useWorkshop } from './workshop';

/**
 * Demo start: opened as `…#simulator` (or built as the simulator page), the
 * app connects to the simulated LowRider and switches its camera on, so it
 * can be tried on a tablet without any hardware. Opened as `…#demo` (or built
 * as the demo page) it goes further: see `startFullDemo`.
 */
export function startDemo(
  hash: string = typeof location === 'undefined' ? '' : location.hash,
  forced = (globalThis as { LOWRIDER_DEMO?: unknown }).LOWRIDER_DEMO === true,
) {
  if (isFullDemo(undefined, hash)) {
    void startFullDemo();
    return true;
  }
  if (hash !== '#simulator' && !forced) return false;
  const machine = useMachine.getState();
  machine.setUrl(SIM_ADDRESS);
  void machine.connect().then(() => {
    if (useMachine.getState().connection === 'connected') useCamera.getState().setSource('sim');
  });
  return true;
}

/**
 * The demo's jig as if it had been taught: the simulator's coaster frame
 * with its two tags, the work zero in the middle of the coaster and a small
 * engraving job on it, straight along the frame.
 */
export function demoJig(): Jig {
  const { settings } = useCam.getState();
  const tool = camToolDiameter(settings);
  const { text, hole } = DEMO_JIG;
  const words = textContours(text.text, {
    height: text.height,
    align: 'center',
    vertical: 'middle',
  }).contours;
  // The hole as wide as the cutter: one plunge.
  const contours = [demoJigFrame(), ...words, circle(hole.x, hole.y, tool)];
  const operations = contours.map(
    (_, i): Operation =>
      i === contours.length - 1
        ? { contour: i, kind: 'drill', depth: hole.depth }
        : { contour: i, kind: 'on', depth: settings.engraveDepth },
  );
  const { moves } = toolpaths(contours, operations, { ...settings, toolDiameter: tool });
  const program = toGcode(moves, { name: DEMO_JIG.name, rpm: settings.rpm, safeZ: settings.safeZ });
  // Taught with the frame lying square at the table's origin: the tags as they are stuck on.
  const readings = SIM_JIG.tags.map((tag) => ({ ...tag }));
  const zero = { x: SIM_JIG.blank.x, y: SIM_JIG.blank.y };
  const kept = teachJig(readings, zero)!;
  const frame = jigFrame(readings)!;
  const half = DEMO_JIG.frame.size / 2;
  const corners = [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half],
  ].map(([x, y]) => toJig(frame, { x: zero.x + x!, y: zero.y + y! }));
  return {
    id: 'jig-demo',
    name: DEMO_JIG.name,
    ...kept,
    job: { fileName: DEMO_JIG.fileName, text: program, toolDiameter: tool },
    reach: Number(jigReach(kept.tags, corners).toFixed(3)),
    clamps: [],
    createdAt: 0,
  };
}

/**
 * The example for the simulator's long board, on the table: the X/Y work
 * zero is set on the board and the side of a shelf loaded, turned as the
 * board lies – far too long for the travel, so the readiness list offers to
 * cut it in sections.
 */
export async function loadLongDemo(): Promise<boolean> {
  const sim = simulator();
  const machine = useMachine.getState();
  if (!machine.status) return false;
  const { settings } = useCam.getState();
  const tool = camToolDiameter(settings);
  const { shapes, holes } = demoLongContours(tool);
  const { text, ...at } = DEMO_LONG.text;
  const words = textContours(text, { ...at, align: 'center' }).contours;
  const contours = [...shapes, ...words, ...holes];
  const operations = contours.map(
    (_, i): Operation =>
      i >= shapes.length + words.length
        ? { contour: i, kind: 'drill', depth: DEMO_LONG.pins.depth }
        : { contour: i, kind: 'on', depth: settings.engraveDepth },
  );
  const { moves } = toolpaths(contours, operations, { ...settings, toolDiameter: tool });
  const program = toGcode(moves, {
    name: DEMO_LONG.name,
    rpm: settings.rpm,
    safeZ: settings.safeZ,
  });
  // The zero on the board, where the cutter is brought to it.
  const zero = sim.commandedFor(sim.fromJig(DEMO_LONG.zero, sim.long), SURFACE_Z);
  if (!(await machine.setZeroAt({ x: zero.x, y: zero.y }))) return false;
  const job = useJob.getState();
  job.load(`${DEMO_LONG.name}.nc`, program);
  const turned = transformProgram(program, {
    rotation: sim.long.angle,
    offset: { x: 0, y: 0 },
    pivot: { x: 0, y: 0 },
  });
  useJob.getState().loadDerived(`${DEMO_LONG.name}_ausgerichtet.nc`, turned.text, {
    by: rotation(sim.long.angle),
    from: 'original',
  });
  useJob.getState().setToolDiameter(tool);
  // The clamp marked for the other board holds nothing here.
  useWorkshop.getState().setSetup({ fixtures: [], fixtureFrame: 'machine' });
  useUi.getState().leaveCam();
  useMachine.getState().addLog('info', t('sim.longLoaded'));
  return true;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function until(test: () => boolean, timeoutMs: number): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (test()) return true;
    await wait(25);
  }
  return test();
}

const idle = () => useMachine.getState().status?.state === 'Idle';

/**
 * The machine as if it had been set up and calibrated: simulator connected
 * and homed, work zero on board hole 1 with the job turned to the board,
 * camera calibrated to the simulator's true values, a pre-scanned photo map
 * of plate and board, and the camera at its height over the board; the stage
 * shows the table with all of it. Runs the
 * simulator fast while it sets up; nothing is written to real storage (the
 * demo uses memory storage, see `lib/persist`).
 */
export async function startFullDemo(): Promise<boolean> {
  resetSimulator();
  const sim = simulator();
  sim.speed = 40;
  const machine = useMachine.getState();
  try {
    machine.setUrl(SIM_ADDRESS);
    await machine.connect();
    const ready = () => useMachine.getState().connection === 'connected' && idle();
    if (!(await until(ready, 8000))) throw new Error('connect');
    useCamera.getState().setSource('sim');

    await useMachine.getState().home();
    if (!(await until(() => useMachine.getState().homed && idle(), 8000))) throw new Error('home');

    // Work zero on board hole 1 (where "two holes" alignment would put it), Z0 on the material.
    const z = SURFACE_Z + DEMO_CAMERA_HEIGHT;
    const hole1 = sim.commandedFor(placeOn(SIM_BOARD, SIM_BOARD.holes[0]!), z);
    if (!(await useMachine.getState().setZeroAt({ x: hole1.x, y: hole1.y, z: SURFACE_Z }))) {
      throw new Error('zero');
    }

    // Camera at its height over the corner of the job: hole 1, the plate's corner and a mounting hole in view.
    const centre = placeOn(SIM_BOARD, DEMO_CAMERA_SPOT);
    const camAt = sim.commandedFor(centre, z);
    const spindle = { x: camAt.x - SIM_CAMERA.offset.x, y: camAt.y - SIM_CAMERA.offset.y };
    const { moveMachine } = useMachine.getState();
    if (!(await moveMachine({ x: spindle.x, y: spindle.y }, 6000))) throw new Error('move');
    if (!(await moveMachine({ z }, 1200))) throw new Error('move');

    // Machine profile adopted, as after the setup assistant.
    const { profile, setProfileSettings } = useJob.getState();
    setProfileSettings({
      travel: profile.travel,
      softLimits: profile.softLimits,
      jogFeed: profile.jogFeed,
      kinematics: profile.kinematics,
      controller: profile.controller,
      probe: profile.probe,
    });

    // Calibration as the scale and offset steps would find it.
    const { settings, setSettings } = useWorkshop.getState();
    setSettings({
      camera: {
        ...settings.camera,
        pxPerMm: SIM_CAMERA.pxPerMm,
        rotation: 0,
        offsetX: SIM_CAMERA.offset.x,
        offsetY: SIM_CAMERA.offset.y,
        scaleCalibrated: true,
        focusHeight: DEMO_CAMERA_HEIGHT,
      },
      // A park position at the front left, so the jog panel's quick action has somewhere to go.
      parkPosition: { x: 10, y: 10 },
    });

    // The example job, turned with the board as the two-hole alignment does.
    const cam = useCam.getState();
    cam.close();
    // Drawn like by hand: each shape by its measures, the text around the middle of its baseline.
    for (const { sketch, at } of demoJobSketches()) cam.addSketch(sketch, null, at);
    const { text: words, ...pose } = DEMO_TEXT;
    cam.addSketch(
      {
        type: 'text',
        text: words,
        height: pose.height,
        spacing: 0,
        lineSpacing: 1.6,
        align: 'center',
      },
      null,
      pose,
    );
    cam.select(null);
    // The demo starts as a finished drawing: nothing to take back.
    useCam.setState({ past: [], future: [] });
    useCam.setState((s) => ({ project: s.project ? { ...s.project, name: 'demo-schild' } : null }));
    cam.generate({ take: true });
    const job = useJob.getState();
    const text = job.lines.join('\n');
    if (text) {
      const turned = transformProgram(text, {
        rotation: SIM_BOARD.angle,
        offset: { x: 0, y: 0 },
        pivot: { x: 0, y: 0 },
      });
      job.loadDerived('demo-schild_ausgerichtet.nc', turned.text, {
        by: rotation(SIM_BOARD.angle),
        from: 'original',
      });
      job.setMeasuredAngle(SIM_BOARD.angle);
    }

    // One clamp marked beside the job, as the "Spannmittel" tool would put it down.
    useWorkshop.getState().setSetup({
      fixtures: [
        newZone('clamp', placeOn(SIM_BOARD, DEMO_CLAMP), `${t('fixtures.kinds.clamp')} 1`),
      ],
      fixtureFrame: 'machine',
    });

    // A jig that has been taught before: put on the table (the simulator card clears the
    // table for it), the camera recognises it by its tags.
    useWorkshop.getState().saveJig(demoJig());

    // Pre-scanned map: still pictures for a raster over plate and board.
    scanDemoMap();

    // The app opens on the start screen, which says where this set-up machine and its job
    // stand; the demo leaves the operator wherever they have gone meanwhile.
    useUi.getState().leaveCam();
    useJob.getState().setProjection('top');
    useMachine.getState().addLog('info', t('demo.ready'));
    return true;
  } catch {
    useMachine.getState().addLog('error', t('demo.failed'), 'demo.failed');
    return false;
  } finally {
    sim.speed = 1;
  }
}
