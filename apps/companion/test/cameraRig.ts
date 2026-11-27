import type { Run, RunResult } from '../src/camera';

/**
 * A camera behind `v4l2-ctl`: it keeps its values and prints them the way v4l2-ctl does (`--list-ctrls-menus`), and what is
 * inactive follows its switches – exposure time while auto exposure is on, the white balance temperature while the automatic
 * is on, the focus while autofocus is on. The driver answers a set of an inactive control with "Permission denied", as
 * uvcvideo does. Used by the unit tests and by the e2e tests of the app (`e2e/helpers.ts`), so both run the companion's own
 * code against the same camera.
 */
export interface Spec {
  name: string;
  id: number;
  kind: 'int' | 'bool' | 'menu';
  min?: number;
  max?: number;
  step?: number;
  def: number;
  value: number;
  menu?: [number, string][];
}

/** A camera that keeps its values and prints them the way v4l2-ctl does: what is inactive follows its switches. */
export function fakeCamera(
  options: {
    round?: (name: string, value: number) => number;
    driverRefuses?: string[];
    specs?: Spec[];
  } = {},
) {
  const specs: Spec[] = options.specs ?? [
    { name: 'brightness', id: 0x980900, kind: 'int', min: -64, max: 64, step: 1, def: 0, value: 0 },
    { name: 'contrast', id: 0x980901, kind: 'int', min: 0, max: 64, step: 1, def: 32, value: 32 },
    { name: 'gain', id: 0x980913, kind: 'int', min: 0, max: 100, step: 1, def: 0, value: 0 },
    { name: 'white_balance_automatic', id: 0x98090c, kind: 'bool', def: 1, value: 1 },
    {
      name: 'white_balance_temperature',
      id: 0x98091a,
      kind: 'int',
      min: 2800,
      max: 6500,
      step: 1,
      def: 4600,
      value: 4600,
    },
    {
      name: 'power_line_frequency',
      id: 0x980918,
      kind: 'menu',
      min: 0,
      max: 2,
      def: 1,
      value: 1,
      menu: [
        [0, 'Disabled'],
        [1, '50 Hz'],
        [2, '60 Hz'],
      ],
    },
    {
      name: 'auto_exposure',
      id: 0x9a0901,
      kind: 'menu',
      min: 0,
      max: 3,
      def: 3,
      value: 3,
      menu: [
        [1, 'Manual Mode'],
        [3, 'Aperture Priority Mode'],
      ],
    },
    {
      name: 'exposure_time_absolute',
      id: 0x9a0902,
      kind: 'int',
      min: 1,
      max: 5000,
      step: 1,
      def: 157,
      value: 157,
    },
    { name: 'exposure_dynamic_framerate', id: 0x9a0903, kind: 'bool', def: 0, value: 1 },
    { name: 'focus_automatic_continuous', id: 0x9a090c, kind: 'bool', def: 1, value: 1 },
    {
      name: 'focus_absolute',
      id: 0x9a090a,
      kind: 'int',
      min: 0,
      max: 250,
      step: 5,
      def: 0,
      value: 0,
    },
    { name: 'hue', id: 0x980903, kind: 'int', min: -40, max: 40, step: 1, def: 0, value: 0 },
  ];
  const get = (name: string) => specs.find((s) => s.name === name)!;
  const inactive = (s: Spec) =>
    (s.name === 'exposure_time_absolute' && get('auto_exposure').value !== 1) ||
    (s.name === 'white_balance_temperature' && get('white_balance_automatic').value === 1) ||
    (s.name === 'focus_absolute' && get('focus_automatic_continuous').value === 1);
  const text = () =>
    `User Controls\n\n${specs
      .map((s) => {
        const head =
          `${s.name.padStart(31)} 0x${s.id.toString(16).padStart(8, '0')} (${s.kind})`.padEnd(52);
        const range =
          s.kind === 'int'
            ? `min=${s.min} max=${s.max} step=${s.step} `
            : s.kind === 'menu'
              ? `min=${s.min} max=${s.max} `
              : '';
        const label = s.menu?.find(([v]) => v === s.value)?.[1];
        const flags = inactive(s) ? ' flags=inactive' : '';
        const entries = (s.menu ?? []).map(([v, l]) => `\t\t\t\t${v}: ${l}`);
        return [
          `${head}: ${range}default=${s.def} value=${s.value}${label ? ` (${label})` : ''}${flags}`,
          ...entries,
        ].join('\n');
      })
      .join('\n')}\n`;
  const calls: string[][] = [];
  const run: Run = async (args): Promise<RunResult> => {
    calls.push([...args]);
    if (args[2] === '--list-ctrls-menus') return { code: 0, stdout: text(), stderr: '' };
    if (args[2] === '--set-ctrl') {
      const [name, raw] = args[3]!.split('=') as [string, string];
      const spec = specs.find((s) => s.name === name);
      if (!spec) return { code: 1, stdout: '', stderr: `unknown control '${name}'` };
      // the driver answers a set of an inactive control – or one it does not take – with "Permission denied"
      if (inactive(spec) || options.driverRefuses?.includes(name))
        return { code: 1, stdout: '', stderr: 'VIDIOC_S_EXT_CTRLS: failed: Permission denied\n' };
      spec.value = options.round ? options.round(name, Number(raw)) : Number(raw);
      return { code: 0, stdout: '', stderr: '' };
    }
    return { code: 1, stdout: '', stderr: 'unexpected' };
  };
  return { run, calls, specs, get };
}
