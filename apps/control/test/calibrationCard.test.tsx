// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { MachineStatus } from '@lowrider/fluidnc-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalibrationWizard } from '../src/components/CalibrationWizard';
import { LOWRIDER_V4_PROFILE } from '../src/lib/profile';
import { insane } from '../src/lib/stateSync';
import { useCalibration } from '../src/store/calibration';
import { useCamera } from '../src/store/camera';
import { useJob } from '../src/store/job';
import { useMachine } from '../src/store/machine';
import { DEFAULT_SETTINGS, useWorkshop } from '../src/store/workshop';

// jsdom has no observers; the segmented controls want them
class Quiet {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', Quiet);

// What the camera sees right now is not what these tests are about: they say it
const seen = vi.hoisted(() => ({ live: null as { off: number; diameter: number } | null }));
vi.mock('../src/components/useLiveMarker', () => ({ useLiveMarker: () => seen.live }));

afterEach(cleanup);

const cal = () => useWorkshop.getState().settings.calibration;
const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value } });
const field = (label: string) => screen.getByLabelText(new RegExp(`^${label}`)) as HTMLInputElement;
const counts = () =>
  within(screen.getByRole('group', { name: 'Messpunkte' }))
    .getAllByRole('button')
    .map((b) => b.textContent);

const status = (mpos: number[]): MachineStatus =>
  ({ state: 'Idle', mpos, wpos: mpos, wco: [0, 0, 0] }) as unknown as MachineStatus;

describe('the plate on the calibration card', () => {
  beforeEach(() => {
    seen.live = null;
    useWorkshop.setState({ settings: { ...DEFAULT_SETTINGS } });
    useJob.setState({ profile: LOWRIDER_V4_PROFILE });
    useCamera.setState({ source: 'device', size: { width: 640, height: 480 } });
    useMachine.setState({ connection: 'disconnected', status: null, homed: false });
    useCalibration.setState({ task: null, progress: null });
  });

  it('starts as the printed plate of the repository: 19 × 19, 10 mm, Ø 3 mm, the field is the outer dots', () => {
    render(<CalibrationWizard />);
    expect(field('Rastermaß').value).toBe('10');
    expect(field('Punkte je Seite').value).toBe('19');
    expect(field('Punktdurchmesser').value).toBe('3');
    expect(field('Messfeld X').value).toBe('180');
    expect(field('Messfeld Y').value).toBe('180');
    // a print is trusted for the angle only, and the card says so
    expect(
      screen.getByRole('button', { name: 'Ausdruck (nur Winkel)' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.getByTestId('calibration-print-hint')).toBeTruthy();
    expect(screen.queryByTestId('calibration-precise-hint')).toBeNull();
  });

  it('offers only the counts of points that lie on dots – not 5 × 5 for 180 mm of 10 mm', () => {
    render(<CalibrationWizard />);
    expect(counts()).toEqual(['2 × 2', '3 × 3', '4 × 4', '7 × 7']);
    expect(screen.queryByTestId('calibration-plate-warning')).toBeNull();
  });

  it('keeps a stored count that is not on the list – shown, said, never changed by itself', () => {
    useWorkshop.getState().setSettings({ calibration: { ...cal(), points: 5 } });
    render(<CalibrationWizard />);
    expect(counts()).toEqual(['2 × 2', '3 × 3', '4 × 4', '5 × 5', '7 × 7']);
    expect(screen.getByTestId('calibration-plate-warning').textContent).toContain('5 × 5');
    expect(cal().points).toBe(5);
  });

  it('follows the plate with the field – until the field was set by hand', () => {
    render(<CalibrationWizard />);
    fill('Rastermaß', '12,5');
    expect(cal().pitch).toBe(12.5);
    expect(cal().spanX).toBe(225);
    expect(field('Messfeld X').value).toBe('225');
    fill('Punkte je Seite', '25');
    expect(cal()).toMatchObject({ dots: 25, spanX: 300, spanY: 300 });
    // measured: 299.7 mm. From now on the field is the operator's.
    fill('Messfeld X', '299,7');
    fill('Rastermaß', '10');
    expect(cal()).toMatchObject({ pitch: 10, spanX: 299.7, spanY: 240 });
    // the count list follows the plate: 240 mm is 24 pitches, 299.7 is 30 within a quarter of one – the divisors
    // of both (1, 2, 3, 6) – but 2 × 2 leaves 30 pitches between the points: too far apart for a plate that lies askew
    // (a count that is stored and not offered stays; this one is). The only thing said is that the field is larger
    // than the plate (240 mm)
    expect(counts()).toEqual(['3 × 3', '4 × 4', '7 × 7']);
    const warning = screen.getByTestId('calibration-plate-warning').textContent ?? '';
    expect(warning).toContain('größer als die Platte (240 mm)');
    expect(warning).not.toContain('zwischen zwei Punkten');
  });

  it('says a count of points that are so far apart that a plate askew by 1° jumps to the next row', () => {
    // a fine plate: 81 dots of 2.5 mm over 200 mm – with the stored 3 × 3 there are 40 pitches between the points
    useWorkshop.getState().setSettings({
      calibration: { ...cal(), dots: 81, pitch: 2.5, dotDiameter: 1, spanX: 200, spanY: 200 },
    });
    render(<CalibrationWizard />);
    expect(counts()).toEqual(['3 × 3', '5 × 5', '6 × 6']); // 3 × 3 stays: it is stored, said, never changed
    const warning = screen.getByTestId('calibration-plate-warning').textContent ?? '';
    expect(warning).toContain('40 Rastermaße (100 mm)');
    expect(warning).toContain('Nachbarreihe');
    fireEvent.click(screen.getByRole('button', { name: '5 × 5' }));
    expect(cal().points).toBe(5);
    expect(screen.queryByTestId('calibration-plate-warning')).toBeNull();
    expect(counts()).toEqual(['5 × 5', '6 × 6']);
  });

  it('warns about a field between dots and about one beyond the plate – and still takes it', () => {
    render(<CalibrationWizard />);
    fill('Messfeld X', '175');
    expect(cal().spanX).toBe(175);
    expect(screen.getByTestId('calibration-plate-warning').textContent).toContain('10');
    // nothing is on a dot: the stored count stays what it is – shown, not made up for the operator
    expect(counts()).toEqual(['3 × 3']);
    fill('Messfeld X', '500');
    expect(cal().spanX).toBe(500);
    expect(screen.getByTestId('calibration-plate-warning').textContent).toContain('180');
  });

  it('takes the plate’s numbers in exactly the ranges the Pi’s documents are held to', () => {
    render(<CalibrationWizard />);
    const ok = () => insane({ ...DEFAULT_SETTINGS, calibration: cal() });
    for (const [label, key, max] of [
      ['Rastermaß', 'pitch', 1000],
      ['Punkte je Seite', 'dots', 100],
      ['Punktdurchmesser', 'dotDiameter', 100],
    ] as const) {
      fill(label, String(max));
      expect(cal()[key], label).toBe(max);
      // the field only follows a plate that is a place of a table: 18 × 1000 mm is not, and stays as it was
      expect(cal().spanX, label).toBeLessThanOrEqual(10_000);
      expect(ok(), label).toBeNull();
      const before = cal()[key];
      fill(label, String(max + 1));
      expect(cal()[key], `${label} over its limit`).toBe(before);
      fill(label, '0');
      expect(cal()[key], `${label} zero`).toBe(before);
      fill(label, '-1');
      expect(cal()[key], `${label} negative`).toBe(before);
    }
    // dots are whole, and at least two
    fill('Punkte je Seite', '2,5');
    expect(cal().dots).toBe(100);
    fill('Punkte je Seite', '1');
    expect(cal().dots).toBe(100);
    fill('Punkte je Seite', '2');
    expect(cal().dots).toBe(2);
  });

  it('says what "precise" means when it is switched on, and takes the hint away again', () => {
    render(<CalibrationWizard />);
    fireEvent.click(screen.getByRole('button', { name: 'Präzisionsplatte' }));
    expect(cal().precise).toBe(true);
    expect(screen.getByTestId('calibration-precise-hint').textContent).toContain('nachgemessen');
    fireEvent.click(screen.getByRole('button', { name: 'Ausdruck (nur Winkel)' }));
    expect(cal().precise).toBe(false);
    expect(screen.queryByTestId('calibration-precise-hint')).toBeNull();
  });

  it('tells the corner dot the run starts from, and how far it drives', () => {
    render(<CalibrationWizard />);
    const text = document.body.textContent ?? '';
    expect(text).toContain('Eckpunkt unten links');
    expect(text).toContain('180 mm nach +X');
    expect(text).toContain('180 mm nach +Y');
    // the number as it was typed: no "180,0"
    expect(text).not.toContain('180,0');
  });

  it('says a dot that looks too big or too small: the camera scale is off – and measures all the same', () => {
    seen.live = { off: 0.2, diameter: 3.0 };
    const { rerender } = render(<CalibrationWizard />);
    expect(screen.queryByTestId('calibration-size')).toBeNull();
    seen.live = { off: 0.2, diameter: 3.3 };
    rerender(<CalibrationWizard />);
    expect(screen.queryByTestId('calibration-size')).toBeNull();
    seen.live = { off: 0.2, diameter: 3.4 };
    rerender(<CalibrationWizard />);
    expect(screen.getByTestId('calibration-size').textContent).toContain('Kamera-Maßstab prüfen');
    expect(screen.getByTestId('calibration-size').textContent).toContain('Ø 3,4 mm');
    expect(screen.getByTestId('calibration-size').textContent).toContain('Ø 3 mm');
    seen.live = { off: 0.2, diameter: 2.6 };
    rerender(<CalibrationWizard />);
    expect(screen.getByTestId('calibration-size')).toBeTruthy();
    // a hint, no gate: the measuring buttons are not disabled by it (they wait for the machine only)
    useMachine.setState({
      connection: 'connected',
      status: status([-500, -500, -20]),
      homed: true,
    });
    rerender(<CalibrationWizard />);
    const measure = screen.getByRole('button', { name: /Raster messen/ }) as HTMLButtonElement;
    expect(measure.disabled).toBe(false);
    // the plate with Ø 3,2 mm: a dot of 3,4 is within the tolerance
    useWorkshop.getState().setSettings({ calibration: { ...cal(), dotDiameter: 3.2 } });
    seen.live = { off: 0.2, diameter: 3.4 };
    rerender(<CalibrationWizard />);
    expect(screen.queryByTestId('calibration-size')).toBeNull();
  });

  it('knows nothing of the travel where the machine is not homed – and says so, never a pass', () => {
    useMachine.setState({ connection: 'connected', status: status([-10, -10, -20]), homed: false });
    render(<CalibrationWizard />);
    expect(screen.queryByTestId('calibration-room')).toBeNull();
    expect(document.body.textContent).toContain('Verfahrweg kann nicht geprüft werden');
  });

  it('says that the travel does not reach from the corner dot, with the axis and the shortfall', () => {
    // the placeholder travel is X 3 … 1223: a corner at 1100 leaves 123 mm for 180 mm and 5 mm of slack
    useMachine.setState({
      connection: 'connected',
      status: status([1100, 500, -20]),
      homed: true,
    });
    const { rerender } = render(<CalibrationWizard />);
    expect(screen.getByTestId('calibration-room').textContent).toContain('66 mm an X+');
    // far enough from the end: nothing
    useMachine.setState({ status: status([500, 500, -20]) });
    rerender(<CalibrationWizard />);
    expect(screen.queryByTestId('calibration-room')).toBeNull();
    // too near to the lower end – the approach comes from 0,3 mm below the first point, with room for a plate askew
    useMachine.setState({ status: status([3.2, 500, -20]) });
    rerender(<CalibrationWizard />);
    expect(screen.getByTestId('calibration-room').textContent).toContain('9,1 mm an X−');
    // a smaller field fits again
    useMachine.setState({ status: status([1100, 500, -20]) });
    rerender(<CalibrationWizard />);
    expect(screen.getByTestId('calibration-room')).toBeTruthy();
    fill('Messfeld X', '90');
    expect(screen.queryByTestId('calibration-room')).toBeNull();
  });
  it('does not talk about the start while a run is under way – the machine then stands where the run is', () => {
    useMachine.setState({
      connection: 'connected',
      status: status([1100, 500, -20]),
      homed: true,
    });
    const { rerender } = render(<CalibrationWizard />);
    expect(screen.getByTestId('calibration-room')).toBeTruthy();
    useCalibration.setState({ task: 'grid', progress: { done: 3, total: 9 } });
    rerender(<CalibrationWizard />);
    expect(screen.queryByTestId('calibration-room')).toBeNull();
    expect(screen.getByTestId('calibration-progress')).toBeTruthy();
    // the other tasks stand anywhere as well
    useCalibration.setState({ task: 'backlash', progress: null });
    rerender(<CalibrationWizard />);
    expect(screen.queryByTestId('calibration-room')).toBeNull();
    useCalibration.setState({ task: null });
    rerender(<CalibrationWizard />);
    expect(screen.getByTestId('calibration-room')).toBeTruthy();
  });

  it('asks the system for whole numbers where a count is typed, for decimals where a length is', () => {
    render(<CalibrationWizard />);
    expect(field('Punkte je Seite').getAttribute('inputmode')).toBe('numeric');
    for (const label of ['Rastermaß', 'Punktdurchmesser', 'Messfeld X', 'Messfeld Y']) {
      expect(field(label).getAttribute('inputmode'), label).toBe('decimal');
    }
  });
});
