/**
 * Geometry of a camera on the Z axis looking down. The image centre sits at
 * a fixed offset from the spindle axis; pixels map to millimetres by a
 * scale and a rotation (camera not mounted square to X).
 */
export interface CameraCalibration {
  /** Machine offset of the image centre from the spindle axis, mm */
  offsetX: number;
  offsetY: number;
  /** Pixels per mm at working height */
  pxPerMm: number;
  /** Angle of the image's +u axis against the machine +X axis, degrees (counter-clockwise) */
  rotation: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Image pixel (u right, v down) relative to the image centre → machine offset in mm. */
export function pixelToMm(c: CameraCalibration, du: number, dv: number): Point {
  const r = (c.rotation * Math.PI) / 180;
  const x = du / c.pxPerMm;
  const y = -dv / c.pxPerMm;
  return { x: x * Math.cos(r) - y * Math.sin(r), y: x * Math.sin(r) + y * Math.cos(r) };
}

/** Machine XY under an image pixel, given where the spindle is. */
export function imageToMachine(
  c: CameraCalibration,
  pixel: Point,
  size: { width: number; height: number },
  spindle: Point,
): Point {
  const d = pixelToMm(c, pixel.x - size.width / 2, pixel.y - size.height / 2);
  return { x: spindle.x + c.offsetX + d.x, y: spindle.y + c.offsetY + d.y };
}

/** Image pixel of a machine XY point. */
export function machineToImage(
  c: CameraCalibration,
  point: Point,
  size: { width: number; height: number },
  spindle: Point,
): Point {
  const r = (-c.rotation * Math.PI) / 180;
  const dx = point.x - spindle.x - c.offsetX;
  const dy = point.y - spindle.y - c.offsetY;
  const x = dx * Math.cos(r) - dy * Math.sin(r);
  const y = dx * Math.sin(r) + dy * Math.cos(r);
  return { x: size.width / 2 + x * c.pxPerMm, y: size.height / 2 - y * c.pxPerMm };
}

/**
 * Scale and rotation from one feature seen twice: before and after the
 * machine moved by `moved` (mm). The feature stands still, so in the image it
 * moves opposite to the machine.
 */
export function calibrateFromMove(
  before: Point,
  after: Point,
  moved: Point,
): { pxPerMm: number; rotation: number } | null {
  const du = before.x - after.x;
  const dv = before.y - after.y;
  const px = Math.hypot(du, dv);
  const mm = Math.hypot(moved.x, moved.y);
  if (px < 1 || mm <= 0) return null;
  // Image direction of the machine move, with v pointing down.
  const imageAngle = Math.atan2(-dv, du);
  const machineAngle = Math.atan2(moved.y, moved.x);
  let rotation = ((machineAngle - imageAngle) * 180) / Math.PI;
  rotation = ((((rotation + 180) % 360) + 360) % 360) - 180;
  return { pxPerMm: px / mm, rotation };
}

/**
 * Spindle-to-camera offset: a mark was made with the tool at `markedAt`
 * (spindle position); now the spindle is at `spindle` and the mark appears
 * at `pixel`.
 */
export function offsetFromMark(
  c: Pick<CameraCalibration, 'pxPerMm' | 'rotation'>,
  markedAt: Point,
  spindle: Point,
  pixel: Point,
  size: { width: number; height: number },
): Point {
  const d = pixelToMm(
    { ...c, offsetX: 0, offsetY: 0 },
    pixel.x - size.width / 2,
    pixel.y - size.height / 2,
  );
  return { x: markedAt.x - spindle.x - d.x, y: markedAt.y - spindle.y - d.y };
}

/** Angle of a line through two machine points against +X, degrees in (−90, 90]. */
export function edgeAngle(a: Point, b: Point): number {
  let angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle <= -90) angle += 180;
  return angle;
}

/**
 * How far a workpiece edge through two machine points is turned away from
 * the machine axis it runs along (X or Y, whichever is nearer), degrees in
 * (−45, 45]. Any straight edge of a rectangular board gives the same answer.
 */
export function skewAngle(a: Point, b: Point): number {
  const angle = edgeAngle(a, b);
  if (angle > 45) return angle - 90;
  if (angle <= -45) return angle + 90;
  return angle;
}
