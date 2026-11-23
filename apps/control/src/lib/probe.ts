import type { ProbeSettings } from './profile';

const fmt = (n: number) => String(Number(n.toFixed(3)));

/**
 * Z touch-off in absolute coordinates only, so an aborted probe never leaves
 * the controller in G91: probe down from the current work Z, set the touching
 * tool tip to Z = plate thickness (the surface under the plate becomes Z0),
 * then lift to `retract` above the plate.
 */
export function probeZCommands(currentWorkZ: number, p: ProbeSettings) {
  return {
    probe: `G90 G38.2 Z${fmt(currentWorkZ - p.maxTravel)} F${fmt(p.feed)}`,
    setZero: `G10 L20 P0 Z${fmt(p.plateThickness)}`,
    retract: `G90 G0 Z${fmt(p.plateThickness + p.retract)}`,
  };
}

/** `G10 L20 P0 X0 Y0`: the current position becomes zero of the active work system. */
export function zeroCommand(axes: string): string {
  return `G10 L20 P0 ${[...axes].map((a) => `${a}0`).join(' ')}`;
}
