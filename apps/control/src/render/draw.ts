import type { Segment, Vec4 } from '@lowrider/gcode-core';
import { frameCorners, frameHandles, type Frame } from '../lib/camEdit';
import type { SnapGuide } from '../lib/camSnap';
import { DEPTH_BUCKETS, traceSegment, type Extent, type JobPaths } from './paths';

export interface Viewport {
  /** CSS pixels */
  width: number;
  height: number;
  dpr: number;
  /** px per mm */
  scale: number;
  /** Screen position (CSS px) of world origin */
  originX: number;
  originY: number;
}

export interface Colors {
  bg: string;
  grid: string;
  gridMajor: string;
  axis: string;
  rapid: string;
  air: string;
  danger: string;
  done: string;
  current: string;
  tool: string;
  live: string;
  text: string;
}

export function readColors(element: Element): Colors {
  const css = getComputedStyle(element);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    bg: v('--stage-bg'),
    grid: v('--stage-grid'),
    gridMajor: v('--stage-grid-major'),
    axis: v('--stage-muted'),
    rapid: v('--stage-rapid'),
    air: v('--stage-air'),
    danger: v('--stage-cut'),
    done: v('--stage-done'),
    current: v('--stage-current'),
    tool: v('--stage-text'),
    live: v('--stage-select'),
    text: v('--stage-muted'),
  };
}

export interface Scene {
  paths: JobPaths | null;
  segments: readonly Segment[];
  /** Segments before this index are done */
  done: number;
  /** Current segment and parameter on it */
  current: { index: number; t: number } | null;
  showRapids: boolean;
  /** Top of the material; the tool is drawn red below it */
  surfaceZ: number;
  /** Simulated or tracked tool position on the path */
  tool: Vec4 | null;
  /** Real machine position (work coordinates) when connected */
  live: Vec4 | null;
  toolDiameter: number;
  /** Machine travel in work coordinates (needs WCO), drawn as a boundary */
  workspace: Extent | null;
  /** Points tapped for the stage tool (projected stage coordinates) */
  marks?: readonly [number, number][];
  /** Join the marks with a line (an edge) */
  marksLine?: boolean;
  /** What stands at that line (a measured distance) */
  marksLabel?: string | null;
  /** The photo map under the job; top view only */
  photos?: PhotoLayer | null;
  /** Where the camera looks right now: corners of its frame, work XY */
  footprint?: readonly [number, number][] | null;
  /** Stock outline, work XY; top view only */
  stock?: Extent | null;
  /** Clamps and screws, work XY; top view only */
  fixtures?: readonly ZoneShape[];
  /** Moves that run into a clamp or pass too low over it, as segment indexes */
  warned?: readonly number[];
  /** The blanks of a series as the camera found them, work XY; top view only */
  blanks?: readonly BlankMark[];
  /** Printed tags the camera has seen on the table, work XY; top view only */
  tags?: readonly TagMark[];
  /** Outline of the drawing being edited (CAM), work XY */
  drawing?: Path2D | null;
  /** What of it is cut from the back of a two-sided part (drawn as seen from the front): dashed */
  drawingBack?: Path2D | null;
  /** The parts that are hidden (not cut): faint and dashed, in the muted colour – never the colour of a fault */
  drawingHidden?: Path2D | null;
  /** The frame a finger is drawing across the table ("Rahmen aufziehen"), work XY: dashed, in the selection colour */
  drawingMarquee?: Extent | null;
  /** The lines a dragged part has snapped to, work XY: thin, dashed, in the selection colour – only while it is dragged */
  drawingGuides?: readonly SnapGuide[];
  /** The room from a dragged part to its neighbours, as dimension lines with their numbers – only while it is dragged */
  drawingGaps?: readonly GapMark[];
  /** The measurement of "Messen": its points and what stands at the line between them */
  drawingMeasure?: MeasureMark | null;
  /** The line a two-sided part is turned over: from x/y to x/y, work XY */
  flipLine?: readonly [number, number, number, number] | null;
  /** The part of it that is selected for arranging, with the box around it */
  drawingSelected?: {
    outline: Path2D;
    box: Extent;
    /** The frame the handles sit on: its own box and how that lies on the table */
    frame: Frame;
    /** Squares on the frame for the size and a dot beyond its upper side for turning */
    handles: boolean;
    /** What stands at the frame while a finger changes it: its size, angle or place */
    label?: string | null;
  } | null;
  /**
   * The holding tabs of the things of the drawing that have them: each the stretch of the line it
   * covers (a bar of its true width – the material that stays), with a short tick across at either
   * end; the selected thing's bold, the others muted. Work XY.
   */
  drawingTabs?: readonly TabBar[];
  /** Tabs are being put by hand: every tab of the selected thing carries a grip to take hold of */
  drawingTabsGrip?: boolean;
  /** A part longer than the table, around the section that is the job; top view only */
  sections?: SectionsMark | null;
}

/** One gap as the table draws it: a dimension line across the room between two parts, with its number */
export interface GapMark {
  /** The side of the dragged part it lies on */
  side: 'left' | 'right' | 'up' | 'down';
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** What stands at the line: the number, with the equals sign where the gap on the other side is as large */
  text: string;
  /** As large as the one on the opposite side: both are drawn in the selection colour */
  equal: boolean;
}

/** The measurement as the table draws it, work XY */
export interface MeasureMark {
  a: { x: number; y: number };
  b: { x: number; y: number } | null;
  /** The names of the two points beside them */
  names: readonly [string, string];
  /** The distance, and below it ΔX, ΔY and the angle – empty while there is only A */
  label: string;
  detail: string;
}

/** One holding tab as the table draws it. */
export interface TabBar {
  /** The bar along the contour, round its corners */
  span: readonly { x: number; y: number }[];
  /** Unit vectors across the line at the start and the end of the bar */
  ends: readonly [{ x: number; y: number }, { x: number; y: number }];
  /** The middle of the bar */
  at: { x: number; y: number };
  /** The tab of a selected thing */
  selected: boolean;
}

/** A part cut in sections as the table draws it around the section at hand. */
export interface SectionsMark {
  /** The part's coordinates → work XY, as a canvas transform */
  frame: readonly [number, number, number, number, number, number];
  /** What the sections already cut have cut, in the part's coordinates */
  done: readonly Path2D[];
  /** What the sections still to come will cut */
  coming: readonly Path2D[];
  /** Where cuts too long for one section are divided: from x/y to x/y, work XY */
  seams: readonly { line: readonly [number, number, number, number]; label: string }[];
  /** Where the register marks are to be stuck on, work XY */
  zone: { box: Extent; label: string } | null;
  /** The register marks as measured: their corners, work XY */
  marks: readonly { outline: readonly [number, number][]; label: string }[];
}

/** A printed tag as the table draws it. */
export interface TagMark {
  /** Its four corners */
  outline: readonly [number, number][];
  /** What stands at it: its number, and the jig it belongs to */
  label: string;
  /** It belongs to a jig that has been taught */
  known: boolean;
}

/** A blank of a series as the table draws it. */
export interface BlankMark {
  /** The blank's number among those found; −1 for a place that was not taken for a blank */
  id: number;
  outline: readonly [number, number][];
  /** Its middle */
  at: readonly [number, number];
  /** Its number in the order of cutting, or why it was not taken */
  label: string | null;
  /**
   * Engraved (`cut`), left out (`out`), engraved although the motif runs
   * over its edge (`misfit`), or not a blank at all (`refused`)
   */
  state: 'cut' | 'out' | 'misfit' | 'refused';
}

/** A clamp zone as the table draws it. */
export interface ZoneShape {
  name: string;
  box: Extent;
  /** A screw head: the circle inscribed in the box */
  round?: boolean;
  /** The job runs into it or passes too low: drawn in the warning colour */
  warned?: boolean;
  /** Selected with the clamp tool: outlined in the accent, with its handles */
  selected?: boolean;
  /** Resize handles of the selected zone, work XY */
  handles?: readonly [number, number][];
}

/** Pictures of the photo map: square canvases on a machine-XY raster. */
export interface PhotoLayer {
  /** The chunk canvases as they are now (the map grows while it is shown) */
  chunks(): Iterable<{ canvas: CanvasImageSource; cx: number; cy: number }>;
  /** Side of one chunk, mm */
  chunkMm: number;
  /** Work offset: machine = work + offset */
  offset: readonly [number, number];
}

export function worldToScreen(vp: Viewport, u: number, v: number): [number, number] {
  return [vp.originX + u * vp.scale, vp.originY - v * vp.scale];
}

export function screenToWorld(vp: Viewport, x: number, y: number): [number, number] {
  return [(x - vp.originX) / vp.scale, (vp.originY - y) / vp.scale];
}

/**
 * In-between view for gliding from `a` to `b` (t = 0…1): the centre moves in a
 * straight line and the zoom changes evenly (geometric), so the picture
 * neither swerves nor zooms in jumps.
 */
export function blendViewport(a: Viewport, b: Viewport, t: number): Viewport {
  const [au, av] = screenToWorld(a, a.width / 2, a.height / 2);
  const [bu, bv] = screenToWorld(b, b.width / 2, b.height / 2);
  const u = au + (bu - au) * t;
  const v = av + (bv - av) * t;
  const scale = a.scale * (b.scale / a.scale) ** t;
  return {
    ...b,
    scale,
    originX: b.width / 2 - u * scale,
    originY: b.height / 2 + v * scale,
  };
}

/**
 * Viewport that shows `extent` with a margin. `corner` is a box in the top
 * right corner that should stay clear (the stage's inset): the extent goes
 * beside it or below it, whichever leaves it larger – unless that would
 * cost more than 40 % of its size.
 */
export function fitViewport(
  extent: Extent | null,
  width: number,
  height: number,
  dpr: number,
  corner: { width: number; height: number } = { width: 0, height: 0 },
): Viewport {
  const e = extent ?? { minU: 0, maxU: 100, minV: 0, maxV: 100 };
  const w = Math.max(e.maxU - e.minU, 1);
  const h = Math.max(e.maxV - e.minV, 1);
  // Keep the legend at the top of the view clear of the job.
  const margin = 32;
  const top = 64;
  const fit = (right: number, above: number) => {
    const availW = width - 2 * margin - right;
    const availH = height - margin - above;
    return { scale: Math.min(availW / w, availH / h), right, above };
  };
  const beside = fit(corner.width, top);
  const below = fit(0, Math.max(top, corner.height + margin / 2));
  const clear = beside.scale >= below.scale ? beside : below;
  // On a small stage, keeping clear of the corner would shrink the picture to
  // a stamp: then the corner may cover a bit of it instead.
  const whole = fit(0, top);
  const best = clear.scale >= 0.6 * whole.scale ? clear : whole;
  const scale = Math.max(0.01, best.scale);
  const cu = (e.minU + e.maxU) / 2;
  const cv = (e.minV + e.maxV) / 2;
  const centerX = margin + (width - 2 * margin - best.right) / 2;
  const centerY = best.above + (height - margin - best.above) / 2;
  return {
    width,
    height,
    dpr,
    scale,
    originX: centerX - cu * scale,
    originY: centerY + cv * scale,
  };
}

/** Distance of the fine grid lines in mm: the smallest power of ten at least 16 px apart. */
export function gridStep(scale: number): number {
  return 10 ** Math.ceil(Math.log10(16 / scale));
}

function drawGrid(ctx: CanvasRenderingContext2D, vp: Viewport, c: Colors) {
  const step = gridStep(vp.scale);
  const [u0, v1] = screenToWorld(vp, 0, 0);
  const [u1, v0] = screenToWorld(vp, vp.width, vp.height);
  ctx.lineWidth = 1;
  for (const major of [false, true]) {
    const s = major ? step * 10 : step;
    ctx.strokeStyle = major ? c.gridMajor : c.grid;
    ctx.beginPath();
    for (let u = Math.floor(u0 / s) * s; u <= u1; u += s) {
      const [x] = worldToScreen(vp, u, 0);
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, vp.height);
    }
    for (let v = Math.floor(v0 / s) * s; v <= v1; v += s) {
      const [, y] = worldToScreen(vp, 0, v);
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(vp.width, Math.round(y) + 0.5);
    }
    ctx.stroke();
  }
}

/** Text that stays readable on the grid and on a photo: a dark rim under the letters. */
function rimText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, c: Colors) {
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = c.bg;
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
}

/** Coordinates on the major grid lines and the work origin. */
function drawScale(ctx: CanvasRenderingContext2D, vp: Viewport, c: Colors) {
  const step = gridStep(vp.scale);
  const [u0, v1] = screenToWorld(vp, 0, 0);
  const [u1, v0] = screenToWorld(vp, vp.width, vp.height);
  const major = step * 10;
  ctx.fillStyle = c.text;
  ctx.font = '12px system-ui, sans-serif';
  const label = (n: number) => String(Number(n.toFixed(3)));
  for (let u = Math.ceil(u0 / major) * major; u <= u1; u += major) {
    const [x] = worldToScreen(vp, u, 0);
    rimText(ctx, label(u), x + 3, vp.height - 6, c);
  }
  for (let v = Math.ceil(v0 / major) * major; v <= v1; v += major) {
    const [, y] = worldToScreen(vp, 0, v);
    rimText(ctx, label(v), 4, y - 3, c);
  }
  // Work origin
  const [ox, oy] = worldToScreen(vp, 0, 0);
  const cross = new Path2D();
  cross.moveTo(ox - 14, oy);
  cross.lineTo(ox + 14, oy);
  cross.moveTo(ox, oy - 14);
  cross.lineTo(ox, oy + 14);
  ctx.lineCap = 'round';
  ctx.strokeStyle = c.bg;
  ctx.lineWidth = 4;
  ctx.stroke(cross);
  ctx.strokeStyle = c.tool;
  ctx.lineWidth = 1.5;
  ctx.stroke(cross);
  ctx.lineCap = 'butt';
}

function depthColor(c: Colors, bucket: number): { color: string; alpha: number } {
  if (bucket === 0) return { color: c.air, alpha: 0.9 };
  return { color: c.danger, alpha: 0.45 + (0.55 * bucket) / (DEPTH_BUCKETS - 1) };
}

/** World transform: mm, Y up. */
function setWorld(ctx: CanvasRenderingContext2D, vp: Viewport) {
  ctx.setTransform(
    vp.dpr * vp.scale,
    0,
    0,
    -vp.dpr * vp.scale,
    vp.dpr * vp.originX,
    vp.dpr * vp.originY,
  );
}

/** Segments below this index are drawn in the cached job layer, the rest per frame. */
export function cachedDoneCount(scene: Pick<Scene, 'paths' | 'done'>): number {
  return scene.paths ? Math.floor(scene.done / scene.paths.chunkSize) * scene.paths.chunkSize : 0;
}

/** Background and grid. Cheap; drawn every frame. */
export function drawBackground(ctx: CanvasRenderingContext2D, vp: Viewport, c: Colors): void {
  ctx.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, vp.width, vp.height);
  drawGrid(ctx, vp, c);
}

/** The photo map: every picture where it was taken, in the job's coordinates. */
export function drawPhotos(ctx: CanvasRenderingContext2D, vp: Viewport, photos: PhotoLayer): void {
  ctx.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  const size = photos.chunkMm * vp.scale;
  const [ox, oy] = photos.offset;
  for (const ch of photos.chunks()) {
    const [x, y] = worldToScreen(
      vp,
      ch.cx * photos.chunkMm - ox,
      (ch.cy + 1) * photos.chunkMm - oy,
    );
    if (x > vp.width || y > vp.height || x + size < 0 || y + size < 0) continue;
    // Whole pixels, a hair larger: no seams between neighbouring chunks.
    ctx.drawImage(
      ch.canvas,
      Math.floor(x),
      Math.floor(y),
      Math.ceil(size) + 1,
      Math.ceil(size) + 1,
    );
  }
}

/**
 * What lies on the table besides the job: scale and work origin, machine
 * travel, stock, clamps and the drawing being edited. Drawn every frame, on
 * top of the photos.
 */
export function drawTable(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  scene: Pick<
    Scene,
    | 'workspace'
    | 'stock'
    | 'fixtures'
    | 'drawing'
    | 'drawingBack'
    | 'drawingHidden'
    | 'flipLine'
    | 'drawingSelected'
    | 'drawingTabs'
    | 'drawingTabsGrip'
    | 'drawingMarquee'
    | 'drawingGuides'
    | 'sections'
  >,
  c: Colors,
  labels = true,
): void {
  ctx.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
  if (labels) drawScale(ctx, vp, c);
  setWorld(ctx, vp);
  const px = (n: number) => n / vp.scale;
  const box = (e: Extent) => [e.minU, e.minV, e.maxU - e.minU, e.maxV - e.minV] as const;
  if (scene.workspace) {
    ctx.strokeStyle = c.axis;
    ctx.lineWidth = px(2);
    ctx.setLineDash([px(10), px(6)]);
    ctx.strokeRect(...box(scene.workspace));
    ctx.setLineDash([]);
  }
  if (scene.stock) {
    ctx.strokeStyle = c.axis;
    ctx.lineWidth = px(1.5);
    ctx.setLineDash([px(3), px(4)]);
    ctx.strokeRect(...box(scene.stock));
    ctx.setLineDash([]);
  }
  if (scene.sections) drawSections(ctx, vp, scene.sections, c, labels);
  for (const f of scene.fixtures ?? []) {
    const shape = new Path2D();
    if (f.round) {
      const r = Math.min(f.box.maxU - f.box.minU, f.box.maxV - f.box.minV) / 2;
      shape.arc((f.box.minU + f.box.maxU) / 2, (f.box.minV + f.box.maxV) / 2, r, 0, Math.PI * 2);
    } else {
      shape.rect(...box(f.box));
    }
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = f.warned ? c.current : c.axis;
    ctx.fill(shape);
    ctx.globalAlpha = 1;
    // A dark rim keeps the outline readable on a photo.
    ctx.strokeStyle = c.bg;
    ctx.lineWidth = px(f.selected || f.warned ? 5 : 3.5);
    ctx.stroke(shape);
    ctx.strokeStyle = f.selected ? c.live : f.warned ? c.current : c.tool;
    ctx.lineWidth = px(f.selected || f.warned ? 2.5 : 1.5);
    ctx.stroke(shape);
    for (const [u, v] of f.handles ?? []) {
      ctx.beginPath();
      ctx.arc(u, v, px(7), 0, Math.PI * 2);
      ctx.fillStyle = c.live;
      ctx.fill();
      ctx.strokeStyle = c.tool;
      ctx.lineWidth = px(2);
      ctx.stroke();
    }
  }
  if (scene.drawing) {
    ctx.strokeStyle = c.tool;
    ctx.lineWidth = px(1);
    ctx.stroke(scene.drawing);
  }
  if (scene.drawingHidden) {
    // A part the eye has hidden: still seen where it lies, but faint and dashed – it is not cut
    ctx.strokeStyle = c.axis;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = px(1);
    ctx.setLineDash([px(2), px(4)]);
    ctx.stroke(scene.drawingHidden);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
  if (scene.drawingBack) {
    // The back, seen through the part: dashed, like a hidden edge in a drawing.
    ctx.strokeStyle = c.tool;
    ctx.lineWidth = px(1);
    ctx.setLineDash([px(5), px(4)]);
    ctx.stroke(scene.drawingBack);
    ctx.setLineDash([]);
  }
  if (scene.flipLine) {
    // The flip line: dash-dot, like a centre line.
    const [x1, y1, x2, y2] = scene.flipLine;
    ctx.strokeStyle = c.tool;
    ctx.lineWidth = px(1);
    ctx.setLineDash([px(14), px(4), px(2), px(4)]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (scene.drawingSelected) {
    // Selected for arranging: the accent, as for every selection.
    ctx.strokeStyle = c.live;
    ctx.lineWidth = px(2.5);
    ctx.stroke(scene.drawingSelected.outline);
    ctx.lineWidth = px(1);
    ctx.setLineDash([px(6), px(5)]);
    ctx.beginPath();
    frameCorners(scene.drawingSelected.frame).forEach((p, i) =>
      i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
    );
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (scene.drawingTabs?.length) drawTabs(ctx, vp, scene.drawingTabs, !!scene.drawingTabsGrip, c);
  if (scene.drawingGuides?.length) {
    // What the dragged part snapped to: a thin dashed line through the lines that meet, in the selection colour
    ctx.strokeStyle = c.live;
    ctx.lineWidth = px(1.25);
    ctx.setLineDash([px(5), px(4)]);
    ctx.beginPath();
    for (const g of scene.drawingGuides) {
      if (g.axis === 'x') {
        ctx.moveTo(g.at, g.from);
        ctx.lineTo(g.at, g.to);
      } else {
        ctx.moveTo(g.from, g.at);
        ctx.lineTo(g.to, g.at);
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (scene.drawingMarquee) {
    // The frame of the selection being drawn: a light wash and a dashed line in the selection colour
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = c.live;
    ctx.fillRect(...box(scene.drawingMarquee));
    ctx.globalAlpha = 1;
    ctx.strokeStyle = c.live;
    ctx.lineWidth = px(1.5);
    ctx.setLineDash([px(6), px(4)]);
    ctx.strokeRect(...box(scene.drawingMarquee));
    ctx.setLineDash([]);
  }
  ctx.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
}

/**
 * The holding tabs: a bar along the line as wide as the material that stays, a tick across at each
 * end, the selected thing's in the selection colour and bold over the muted others. A dark rim keeps
 * them readable on a photo. While tabs are put by hand a dot marks the middle of each one that
 * belongs to the selected thing (the finger's target is larger than the dot).
 */
function drawTabs(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  tabs: readonly TabBar[],
  grip: boolean,
  c: Colors,
) {
  const px = (n: number) => n / vp.scale;
  const bar = (t: TabBar) => {
    const path = new Path2D();
    t.span.forEach((p, i) => (i ? path.lineTo(p.x, p.y) : path.moveTo(p.x, p.y)));
    return path;
  };
  const ticks = (t: TabBar) => {
    const path = new Path2D();
    const reach = px(t.selected ? 9 : 7);
    [t.span[0]!, t.span[t.span.length - 1]!].forEach((p, i) => {
      const n = t.ends[i]!;
      path.moveTo(p.x - n.x * reach, p.y - n.y * reach);
      path.lineTo(p.x + n.x * reach, p.y + n.y * reach);
    });
    return path;
  };
  ctx.setLineDash([]);
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  // The selected thing's last, so its tabs lie on top
  for (const selected of [false, true]) {
    for (const t of tabs) {
      if (t.selected !== selected) continue;
      const b = bar(t);
      const k = ticks(t);
      ctx.strokeStyle = c.bg;
      ctx.lineWidth = px(selected ? 9 : 7);
      ctx.stroke(b);
      ctx.lineWidth = px(selected ? 6 : 5);
      ctx.stroke(k);
      ctx.strokeStyle = selected ? c.live : c.axis;
      ctx.lineWidth = px(selected ? 6 : 4);
      ctx.stroke(b);
      ctx.lineWidth = px(selected ? 3 : 2);
      ctx.stroke(k);
    }
  }
  if (grip) {
    for (const t of tabs) {
      if (!t.selected) continue;
      ctx.beginPath();
      ctx.arc(t.at.x, t.at.y, px(7), 0, Math.PI * 2);
      ctx.fillStyle = c.tool;
      ctx.fill();
      ctx.strokeStyle = c.live;
      ctx.lineWidth = px(2.5);
      ctx.stroke();
    }
  }
}

/**
 * A part longer than the table: what its other sections cut – green where
 * it is cut already, dim where it is still to come –, the seams as
 * dash-dot lines, the band for the register marks in the colour of what is
 * on now, and the marks as measured.
 */
function drawSections(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  s: SectionsMark,
  c: Colors,
  labels: boolean,
) {
  const px = (n: number) => n / vp.scale;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (s.zone) {
    const { minU, minV, maxU, maxV } = s.zone.box;
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = c.current;
    ctx.fillRect(minU, minV, maxU - minU, maxV - minV);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = c.current;
    ctx.lineWidth = px(2);
    ctx.setLineDash([px(8), px(5)]);
    ctx.strokeRect(minU, minV, maxU - minU, maxV - minV);
    ctx.setLineDash([]);
  }
  // The part's own coordinates: the paths are kept in them.
  ctx.save();
  ctx.transform(...s.frame);
  for (const [list, color, width] of [
    [s.coming, c.axis, 1.5],
    [s.done, c.done, 2],
  ] as const) {
    for (const path of list) {
      // A dark rim keeps the lines readable on a photo.
      ctx.strokeStyle = c.bg;
      ctx.lineWidth = px(width + 2);
      ctx.stroke(path);
      ctx.strokeStyle = color;
      ctx.lineWidth = px(width);
      ctx.stroke(path);
    }
  }
  ctx.restore();
  for (const seam of s.seams) {
    const [x1, y1, x2, y2] = seam.line;
    const line = new Path2D();
    line.moveTo(x1, y1);
    line.lineTo(x2, y2);
    ctx.strokeStyle = c.bg;
    ctx.lineWidth = px(4);
    ctx.stroke(line);
    ctx.strokeStyle = c.tool;
    ctx.lineWidth = px(1.5);
    ctx.setLineDash([px(14), px(4), px(2), px(4)]);
    ctx.stroke(line);
    ctx.setLineDash([]);
  }
  for (const mark of s.marks) {
    const shape = new Path2D();
    mark.outline.forEach(([u, v], i) => (i ? shape.lineTo(u, v) : shape.moveTo(u, v)));
    shape.closePath();
    ctx.strokeStyle = c.bg;
    ctx.lineWidth = px(5);
    ctx.stroke(shape);
    ctx.strokeStyle = c.done;
    ctx.lineWidth = px(2.5);
    ctx.stroke(shape);
  }
  if (!labels) return;
  ctx.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const seam of s.seams) {
    // At the upper end of its line.
    const [x1, y1, x2, y2] = seam.line;
    const [x, y] = y2 >= y1 ? worldToScreen(vp, x2, y2) : worldToScreen(vp, x1, y1);
    ctx.fillStyle = c.tool;
    rimText(ctx, seam.label, x, y - 6, c);
  }
  for (const mark of s.marks) {
    const top = mark.outline.reduce((best, p) => (p[1] > best[1] ? p : best), mark.outline[0]!);
    const [x, y] = worldToScreen(vp, top[0], top[1]);
    ctx.fillStyle = c.done;
    rimText(ctx, mark.label, x, y - 7, c);
  }
  if (s.zone) {
    // Below the band: above it stand the seams.
    const { minU, maxU, minV } = s.zone.box;
    const [x, y] = worldToScreen(vp, (minU + maxU) / 2, minV);
    ctx.fillStyle = c.current;
    rimText(ctx, s.zone.label, x, y + 17, c);
  }
  ctx.textAlign = 'start';
  setWorld(ctx, vp);
}

/** Names of the clamps, upright and on top of the toolpath so they stay readable. */
function drawZoneNames(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  scene: Pick<Scene, 'fixtures'>,
  c: Colors,
) {
  ctx.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
  ctx.font = '12px system-ui, sans-serif';
  for (const f of scene.fixtures ?? []) {
    const [x, y] = worldToScreen(vp, f.box.minU, f.box.maxV);
    ctx.fillStyle = f.warned ? c.current : c.tool;
    // Beside a small zone (a screw), inside a large one.
    const small = (f.box.maxU - f.box.minU) * vp.scale < 56;
    if (small) rimText(ctx, f.name, x + (f.box.maxU - f.box.minU) * vp.scale + 6, y + 12, c);
    else rimText(ctx, f.name, x + 4, y + 14, c);
  }
}

/**
 * The expensive part: every move of the job plus the completed chunks of the
 * "done" overlay. Drawn on a transparent layer that the stage caches.
 */
export function drawJobLayer(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  scene: Pick<Scene, 'paths' | 'done' | 'showRapids'>,
  c: Colors,
): void {
  const { paths } = scene;
  if (!paths) return;
  setWorld(ctx, vp);
  const px = (n: number) => n / vp.scale;
  // Bevel joins and butt caps are much cheaper than round ones on 50k-move paths.
  ctx.lineJoin = 'bevel';
  ctx.lineCap = 'butt';
  if (scene.showRapids) {
    ctx.strokeStyle = c.rapid;
    ctx.lineWidth = px(1);
    ctx.setLineDash([px(4), px(4)]);
    ctx.stroke(paths.rapid);
    ctx.setLineDash([]);
  }
  ctx.lineWidth = px(1.5);
  paths.depth.forEach((path, bucket) => {
    const { color, alpha } = depthColor(c, bucket);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.stroke(path);
  });
  ctx.globalAlpha = 1;
  ctx.strokeStyle = c.done;
  ctx.lineWidth = px(2);
  const fullChunks = cachedDoneCount(scene) / paths.chunkSize;
  for (let i = 0; i < fullChunks; i++) ctx.stroke(paths.chunks[i]!);
}

/** Per-frame overlay: the rest of the done path, the current move and the tools. */
export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  scene: Scene,
  c: Colors,
): void {
  const { paths, current, segments, done } = scene;
  if (!paths) return;
  setWorld(ctx, vp);
  const px = (n: number) => n / vp.scale;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  ctx.strokeStyle = c.done;
  ctx.lineWidth = px(2);
  const partial = new Path2D();
  const isCut = (i: number) => {
    const s = segments[i];
    return s !== undefined && s.motion !== 'rapid' && !s.machineCoordinates;
  };
  for (let i = cachedDoneCount(scene); i < done; i++) {
    if (isCut(i)) traceSegment(partial, segments[i]!, paths.project);
  }
  if (current && current.index === done && isCut(current.index)) {
    traceSegment(partial, segments[current.index]!, paths.project, current.t);
  }
  ctx.stroke(partial);

  // Moves that hit a clamp or pass too low over it: the warning colour, on a dark rim.
  if (scene.warned && scene.warned.length > 0) {
    const warned = new Path2D();
    for (const i of scene.warned) {
      const s = segments[i];
      if (s) traceSegment(warned, s, paths.project);
    }
    ctx.strokeStyle = c.bg;
    ctx.lineWidth = px(7);
    ctx.stroke(warned);
    ctx.strokeStyle = c.current;
    ctx.lineWidth = px(4);
    ctx.stroke(warned);
  }

  const cur = current ? segments[current.index] : undefined;
  if (cur && !cur.machineCoordinates) {
    const path = new Path2D();
    traceSegment(path, cur, paths.project);
    ctx.strokeStyle = c.current;
    ctx.lineWidth = px(3);
    ctx.stroke(path);
  }

  const drawTool = (p: Vec4, color: string, fill: boolean) => {
    const [u, v] = paths.project(p);
    const r = Math.max(scene.toolDiameter / 2, px(4));
    ctx.beginPath();
    ctx.arc(u, v, r, 0, Math.PI * 2);
    if (fill) {
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = px(2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(u - px(6), v);
    ctx.lineTo(u + px(6), v);
    ctx.moveTo(u, v - px(6));
    ctx.lineTo(u, v + px(6));
    ctx.stroke();
  };
  // Red as soon as the tool is in the material.
  const toolColor = (p: Vec4, normal: string) => (p.z < scene.surfaceZ - 1e-6 ? c.danger : normal);
  if (scene.tool) drawTool(scene.tool, toolColor(scene.tool, c.tool), true);
  if (scene.live) drawTool(scene.live, toolColor(scene.live, c.live), false);
  if (scene.footprint && scene.footprint.length > 1) {
    ctx.beginPath();
    scene.footprint.forEach(([u, v], i) => (i ? ctx.lineTo(u, v) : ctx.moveTo(u, v)));
    ctx.closePath();
    ctx.strokeStyle = c.current;
    ctx.lineWidth = px(2);
    ctx.stroke();
  }
  const marks = scene.marks ?? [];
  if (marks.length > 0) {
    const path = new Path2D();
    for (const [u, v] of marks) {
      path.moveTo(u + px(10), v);
      path.arc(u, v, px(10), 0, Math.PI * 2);
      path.moveTo(u - px(16), v);
      path.lineTo(u + px(16), v);
      path.moveTo(u, v - px(16));
      path.lineTo(u, v + px(16));
    }
    if (scene.marksLine && marks.length > 1) {
      path.moveTo(marks[0]![0], marks[0]![1]);
      for (const [u, v] of marks.slice(1)) path.lineTo(u, v);
    }
    // A dark rim keeps the marks readable on a photo.
    ctx.strokeStyle = c.bg;
    ctx.lineWidth = px(4);
    ctx.stroke(path);
    ctx.strokeStyle = c.current;
    ctx.lineWidth = px(2);
    ctx.stroke(path);
    if (scene.marksLabel && marks.length > 1) {
      // The distance at the middle of its line, upright.
      const [au, av] = marks[marks.length - 2]!;
      const [bu, bv] = marks[marks.length - 1]!;
      const [x, y] = worldToScreen(vp, (au + bu) / 2, (av + bv) / 2);
      ctx.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
      ctx.font = '600 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = c.current;
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = c.bg;
      ctx.strokeText(scene.marksLabel, x, y - 10);
      ctx.fillText(scene.marksLabel, x, y - 10);
      ctx.textAlign = 'start';
    }
  }
  drawBlanks(ctx, vp, scene, c);
  drawTags(ctx, vp, scene, c);
  drawZoneNames(ctx, vp, scene, c);
  drawHandles(ctx, vp, scene, c);
  // Over the handles: a number that stands where a handle does (a gap of 0, at the middle of a side) must be read
  drawGaps(ctx, vp, scene, c);
  drawMeasure(ctx, vp, scene, c);
}

/** The numbers on the drawing are set in the mono face (the bundled webfont: the table view loads it once) */
const MONO =
  '600 14px "JetBrains Mono Variable", ui-monospace, "SF Mono", Menlo, Consolas, monospace';

/** Text on a light wash of the table's own background, so it reads over lines and photos alike */
function tag(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  vp: Viewport,
  c: Colors,
  colour: string,
  align: 'center' | 'left' = 'center',
) {
  ctx.font = MONO;
  const width = ctx.measureText(text).width;
  const w = width + 12;
  const h = 22;
  // Kept inside the picture: a number must not run off its edge
  const left = Math.min(
    Math.max(align === 'center' ? x - w / 2 : x, 4),
    Math.max(4, vp.width - w - 4),
  );
  const top = Math.min(Math.max(y - h / 2, 4), Math.max(4, vp.height - h - 4));
  ctx.globalAlpha = 0.88;
  ctx.fillStyle = c.bg;
  ctx.fillRect(left, top, w, h);
  ctx.globalAlpha = 1;
  ctx.fillStyle = colour;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, left + 6, top + h / 2 + 0.5);
  ctx.textBaseline = 'alphabetic';
}

/** A line on a dark rim, so it keeps its colour over a photo of the table */
function rimmed(
  ctx: CanvasRenderingContext2D,
  c: Colors,
  colour: string,
  width: number,
  trace: () => void,
) {
  ctx.beginPath();
  trace();
  ctx.strokeStyle = c.bg;
  ctx.lineWidth = width + 3;
  ctx.stroke();
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.stroke();
}

/**
 * The gaps of a dragged part: a dimension line across each, with a short tick at both ends and the number
 * beside it – above a line that runs across, to the right of one that runs up, never on the part's own
 * edge where the finger is. Two equal gaps on opposite sides have their lines in the selection colour and an "="
 * in their text, so the state never shows by colour alone.
 */
function drawGaps(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  scene: Pick<Scene, 'drawingGaps'>,
  c: Colors,
) {
  const gaps = scene.drawingGaps;
  if (!gaps || gaps.length === 0) return;
  ctx.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
  ctx.setLineDash([]);
  ctx.lineCap = 'butt';
  const TICK = 6;
  for (const g of gaps) {
    const [x1, y1] = worldToScreen(vp, g.from.x, g.from.y);
    const [x2, y2] = worldToScreen(vp, g.to.x, g.to.y);
    const colour = g.equal ? c.live : c.tool;
    const across = g.side === 'left' || g.side === 'right';
    rimmed(ctx, c, colour, 1.5, () => {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      for (const [x, y] of [
        [x1, y1],
        [x2, y2],
      ] as const) {
        if (across) {
          ctx.moveTo(x, y - TICK);
          ctx.lineTo(x, y + TICK);
        } else {
          ctx.moveTo(x - TICK, y);
          ctx.lineTo(x + TICK, y);
        }
      }
    });
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    // The words stay in the plain text colour (the selection colour is a line colour: 7:1 is for text) – the
    // equals sign in them says what the colour of the lines says
    if (across) tag(ctx, g.text, mx, my - 20, vp, c, c.tool);
    else tag(ctx, g.text, mx + 12, my, vp, c, c.tool, 'left');
  }
  // What the rest of the overlay (and the next frame's table) expects
  ctx.lineCap = 'round';
}

/**
 * The measurement: a line from A to B on a rim, a small round handle at each point (the finger's target is
 * larger than the dot) with its name beside it, and the distance with ΔX, ΔY and the angle at the middle of
 * the line, on the side that is up on the screen.
 */
function drawMeasure(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  scene: Pick<Scene, 'drawingMeasure'>,
  c: Colors,
) {
  const m = scene.drawingMeasure;
  if (!m) return;
  ctx.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
  ctx.setLineDash([]);
  ctx.lineCap = 'round';
  const [ax, ay] = worldToScreen(vp, m.a.x, m.a.y);
  const b = m.b ? worldToScreen(vp, m.b.x, m.b.y) : null;
  if (b) {
    rimmed(ctx, c, c.tool, 1.5, () => {
      ctx.moveTo(ax, ay);
      ctx.lineTo(b[0], b[1]);
    });
  }
  // The name stands beyond its dot, on the line's own way out – so a short line has its names apart and the
  // numbers (at the middle) clear of them; A alone has it to the upper right
  const dot = (x: number, y: number, name: string, from: readonly [number, number] | null) => {
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = c.live;
    ctx.fill();
    ctx.strokeStyle = c.tool;
    ctx.lineWidth = 2;
    ctx.stroke();
    const away = from ? Math.hypot(x - from[0], y - from[1]) : 0;
    const [ux, uy] = away > 1 ? [(x - from![0]) / away, (y - from![1]) / away] : [0.7, -0.7];
    tag(ctx, name, x + ux * 20, y + uy * 20, vp, c, c.tool);
  };
  dot(ax, ay, m.names[0], b);
  if (b) dot(b[0], b[1], m.names[1], [ax, ay]);
  if (b && m.label) {
    const mx = (ax + b[0]) / 2;
    const my = (ay + b[1]) / 2;
    // Beside the line, on its upper side (a vertical one: to the right), clear of the dots
    const steep = Math.abs(b[1] - ay) > 3 * Math.abs(b[0] - ax);
    if (steep) {
      tag(ctx, m.label, mx + 12, my - 14, vp, c, c.tool, 'left');
      tag(ctx, m.detail, mx + 12, my + 12, vp, c, c.tool, 'left');
    } else {
      tag(ctx, m.label, mx, my - 36, vp, c, c.tool);
      tag(ctx, m.detail, mx, my - 12, vp, c, c.tool);
    }
  }
  ctx.textAlign = 'start';
}

/** Drawn size of a handle of the selected part of the drawing, CSS px (its touch target is larger) */
const HANDLE_SIZE = 10;

/**
 * The handles of the selected part of the drawing, over everything else:
 * squares on the corners and sides of its frame, a dot on a stem for
 * turning – and, while a finger changes it, what it measures now.
 */
function drawHandles(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  scene: Pick<Scene, 'drawingSelected'>,
  c: Colors,
) {
  const selected = scene.drawingSelected;
  if (!selected) return;
  ctx.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
  ctx.setLineDash([]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = c.live;
  // Light, so they stand out on the dark table and on a photo of wood alike.
  ctx.fillStyle = c.tool;
  const corners = frameCorners(selected.frame).map((p) => worldToScreen(vp, p.x, p.y));
  for (const handle of selected.handles ? frameHandles(selected.frame, vp.scale) : []) {
    const [x, y] = worldToScreen(vp, handle.at.x, handle.at.y);
    ctx.beginPath();
    if (handle.id === 'turn') {
      // The stem from the middle of the upper side.
      const [ax, ay] = corners[2]!;
      const [bx, by] = corners[3]!;
      ctx.moveTo((ax + bx) / 2, (ay + by) / 2);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, HANDLE_SIZE / 2 + 1, 0, Math.PI * 2);
    } else {
      ctx.rect(x - HANDLE_SIZE / 2, y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
    }
    ctx.fill();
    ctx.stroke();
  }
  if (selected.label) {
    // In the middle of the frame, clear of the finger on its edge; a frame too
    // small for that has it below – or above, where below is out of the picture.
    const xs = corners.map((p) => p[0]);
    const ys = corners.map((p) => p[1]);
    const x = xs.reduce((sum, v) => sum + v, 0) / xs.length;
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    ctx.font = '600 15px system-ui, sans-serif';
    const roomy =
      Math.max(...xs) - Math.min(...xs) >= ctx.measureText(selected.label).width + 60 &&
      bottom - top >= 70;
    const y = roomy ? (top + bottom) / 2 + 5 : bottom + 40 < vp.height ? bottom + 28 : top - 48;
    ctx.textAlign = 'center';
    ctx.fillStyle = c.tool;
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = c.bg;
    ctx.strokeText(selected.label, x, y);
    ctx.fillText(selected.label, x, y);
    ctx.textAlign = 'start';
  }
}

/**
 * The printed tags the camera has seen: a frame around each with its number
 * – green when it belongs to a jig that has been taught, plain when not.
 */
function drawTags(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  scene: Pick<Scene, 'tags'>,
  c: Colors,
) {
  const tags = scene.tags ?? [];
  if (tags.length === 0) return;
  setWorld(ctx, vp);
  const px = (n: number) => n / vp.scale;
  ctx.lineJoin = 'round';
  ctx.setLineDash([]);
  for (const tag of tags) {
    const shape = new Path2D();
    tag.outline.forEach(([u, v], i) => (i ? shape.lineTo(u, v) : shape.moveTo(u, v)));
    shape.closePath();
    ctx.strokeStyle = c.bg;
    ctx.lineWidth = px(5);
    ctx.stroke(shape);
    ctx.strokeStyle = tag.known ? c.done : c.tool;
    ctx.lineWidth = px(2.5);
    ctx.stroke(shape);
  }
  ctx.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
  ctx.textAlign = 'center';
  ctx.font = '600 13px system-ui, sans-serif';
  for (const tag of tags) {
    // The name stands above the tag.
    const top = tag.outline.reduce((best, p) => (p[1] > best[1] ? p : best), tag.outline[0]!);
    const [x, y] = worldToScreen(vp, top[0], top[1]);
    ctx.fillStyle = tag.known ? c.done : c.tool;
    rimText(ctx, tag.label, x, y - 7, c);
  }
  ctx.textAlign = 'start';
}

/**
 * The blanks of a series: each outline with its number in the order of
 * cutting – plain when it is engraved, dashed and dim when it is left out,
 * in the warning colour when the motif does not fit or the place was not
 * taken for a blank at all.
 */
function drawBlanks(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  scene: Pick<Scene, 'blanks'>,
  c: Colors,
) {
  const blanks = scene.blanks ?? [];
  if (blanks.length === 0) return;
  setWorld(ctx, vp);
  const px = (n: number) => n / vp.scale;
  ctx.lineJoin = 'round';
  for (const b of blanks) {
    const shape = new Path2D();
    b.outline.forEach(([u, v], i) => (i ? shape.lineTo(u, v) : shape.moveTo(u, v)));
    shape.closePath();
    const warn = b.state === 'misfit' || b.state === 'refused';
    const dashed = b.state === 'out' || b.state === 'refused';
    // A dark rim keeps the outline readable on the photo.
    ctx.setLineDash([]);
    ctx.strokeStyle = c.bg;
    ctx.lineWidth = px(warn ? 5 : 4);
    ctx.stroke(shape);
    ctx.strokeStyle = warn ? c.current : b.state === 'out' ? c.axis : c.tool;
    ctx.lineWidth = px(warn ? 2.5 : 1.5);
    if (dashed) ctx.setLineDash([px(7), px(5)]);
    ctx.stroke(shape);
    ctx.setLineDash([]);
  }
  ctx.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
  ctx.textAlign = 'center';
  for (const b of blanks) {
    if (b.label === null) continue;
    if (b.state === 'refused') {
      const [x, y] = worldToScreen(vp, b.at[0], b.at[1]);
      ctx.font = '600 13px system-ui, sans-serif';
      ctx.fillStyle = c.current;
      rimText(ctx, b.label, x, y + 4, c);
      continue;
    }
    // The number stands above the blank, clear of the motif on it.
    const top = b.outline.reduce((best, p) => (p[1] > best[1] ? p : best), b.outline[0]!);
    const [x, y] = worldToScreen(vp, top[0], top[1]);
    ctx.font = '700 15px system-ui, sans-serif';
    ctx.fillStyle = b.state === 'misfit' ? c.current : b.state === 'out' ? c.text : c.tool;
    ctx.lineWidth = 4;
    rimText(ctx, b.label, x, y - 7, c);
  }
  ctx.textAlign = 'start';
}
