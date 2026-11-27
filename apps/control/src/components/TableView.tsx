import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../i18n';
import { zoneHandles } from '../lib/clamps';
import { flipFor, nearestOnContour, pointInPolygon, type Bounds } from '@lowrider/cam';
import {
  frameAngle,
  frameCorners as selectionCorners,
  frameSize,
  handleAt,
  handleCursor,
  HANDLE_PX,
  insideFrame,
  selectionFrame,
} from '../lib/camEdit';
import { holeCentre, isSelected, itemAt, itemsBounds } from '../lib/camItems';
import { MEASURE_SNAP_PX, measureFeatures, measurement, snapMeasure } from '../lib/camMeasure';
import { SNAP_PX, type SnapGuide } from '../lib/camSnap';
import { itemTabMarks, placeNear, tabNear } from '../lib/camTabs';
import { provideTableBox } from '../lib/tableBox';
import { formatNumber, formatSigned } from '../lib/format';
import { jigsWithTag, tagCorners, tagLabel } from '../lib/jigs';
import { CHUNK_MM, frameCorners } from '../lib/photomap';
import {
  additive,
  DOUBLE_TAP_MS,
  DOUBLE_TAP_SLOP,
  sameView,
  zoomAround,
  type Limits,
  type Modifiers,
  type Point,
  type Transform,
} from '../lib/gesture';
import {
  cachedDoneCount,
  drawBackground,
  drawJobLayer,
  drawOverlay,
  drawPhotos,
  drawTable,
  fitViewport,
  gridStep,
  readColors,
  screenToWorld,
  type Colors,
  type BlankMark,
  type GapMark,
  type MeasureMark,
  type TagMark,
  type Scene,
  type Viewport,
} from '../render/draw';
import { LayerCache } from '../render/layer';
import { buildPaths, projection, type Extent, type JobPaths } from '../render/paths';
import { useCam, useCamToolDiameter, type DragHints } from '../store/cam';
import { useClampHits, useWorkFixtures } from '../store/clamps';
import { cameraElement, pictureSize, useCamera } from '../store/camera';
import { useJigs } from '../store/jigs';
import { surfaceZ, useJob } from '../store/job';
import { useMachine } from '../store/machine';
import { cameraCalibrated, mapChunks, usePhotoMap } from '../store/photomap';
import { useSeries, useSeriesLoaded, useSeriesPlan } from '../store/series';
import { useStageTools } from '../store/tools';
import { useTrack } from '../store/track';
import { useUi } from '../store/ui';
import { useWorkshop } from '../store/workshop';
import { mm } from './camParts';
import { provideLoupe } from './Loupe';
import { activeTool, grabStage, tapStage } from './StageTools';
import { usePanZoom } from './usePanZoom';
import { useSectionsOverlay } from './useSectionsOverlay';

/** The sharp redraw follows this long after the last pan/zoom step. */
const SETTLE_MS = 150;

const pathsIds = new WeakMap<JobPaths, number>();
let nextPathsId = 1;
function pathsId(paths: JobPaths): number {
  let id = pathsIds.get(paths);
  if (id === undefined) {
    id = nextPathsId++;
    pathsIds.set(paths, id);
  }
  return id;
}

/** Room the live inset takes in the top right corner (CSS px, with its gap) */
const INSET = { width: 156, height: 124 };

/** A finger takes hold of a point or a clamp within this distance, CSS px (a 48 px target) */
export const GRAB_PX = 24;

/** A double tap on the fitted view zooms in by this much on the spot */
const DOUBLE_TAP_ZOOM = 2.5;
/** Closest zoom, px per mm */
const MAX_SCALE = 400;

const toTransform = (vp: Viewport): Transform => ({
  scale: vp.scale,
  x: vp.originX,
  y: vp.originY,
});

function union(a: Extent | null, b: Extent | null): Extent | null {
  if (!a || !b) return a ?? b;
  return {
    minU: Math.min(a.minU, b.minU),
    maxU: Math.max(a.maxU, b.maxU),
    minV: Math.min(a.minV, b.minV),
    maxV: Math.max(a.maxV, b.maxV),
  };
}

/**
 * The table from above: the photo map (once the camera has laid pictures
 * down) with grid, machine travel, stock, clamps, the job's toolpath, the
 * tool and where the camera looks – all in work coordinates. One finger
 * pans, two pinch, a double tap fits (`lib/gesture.ts`) – all of it moves
 * only the view; a tap gives the active stage tool a machine point, and a
 * finger that comes down on a tapped point or a clamp moves that instead of
 * the view. Seen from the side or unwrapped it shows the toolpath alone.
 */
export function TableView({ follow, onPan }: { follow: boolean; onPan: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Also kept in state: the gesture layer connects to the element when it appears.
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const setCanvas = useCallback((el: HTMLCanvasElement | null) => {
    canvasRef.current = el;
    setCanvasEl(el);
  }, []);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0, dpr: 1 });
  const viewportRef = useRef<Viewport | null>(null);

  const analysis = useJob((s) => s.analysis);
  const view = useJob((s) => s.projection);
  const rotaryDiameter = useJob((s) => s.rotaryDiameter);
  const toolDiameter = useJob((s) => s.toolDiameter);
  const fitRequest = useJob((s) => s.fitRequest);
  const showRapids = useJob((s) => s.showRapids);
  const profile = useJob((s) => s.profile);
  const track = useTrack();
  const wco = useMachine((s) => s.status?.wco);
  const mposX = useMachine((s) => s.status?.mpos[0]);
  const mposY = useMachine((s) => s.status?.mpos[1]);
  const top = view === 'top';
  const surface = surfaceZ(analysis, rotaryDiameter);

  // What lies on the table, in machine or work coordinates.
  const tiles = usePhotoMap((s) => s.tiles);
  usePhotoMap((s) => s.version);
  const photoExtent = usePhotoMap((s) => s.extent);
  const cameraOn = useCamera((s) => s.source !== null && s.size !== null);
  const calibration = useWorkshop((s) => s.settings.camera);
  const stock = useWorkshop((s) => s.setup.stock);
  const fixtures = useWorkFixtures();
  const clampHits = useClampHits();
  const points = useStageTools((s) => s.points);
  const toolId = useStageTools((s) => s.active);
  const zone = useStageTools((s) => s.zone);
  const drawingOpen = useUi((s) => s.place === 'cam');
  const project = useCam((s) => s.project);
  const selected = useCam((s) => s.selected);
  // The holding tabs are drawn with the drawing's defaults and follow them; putting them by hand is a mode
  const tabDefaults = useCam((s) => s.settings.tabs);
  // … and the places of tabs kept off the corners are the cutter's: the picture follows its diameter
  const cutter = useCamToolDiameter();
  const placing = useCam((s) => s.placing);
  // "Messen": a mode of the screen; its two points are places on the table
  const measuring = useCam((s) => s.measure);
  const measured = useCam((s) => s.measured);
  // The series flow takes the place of the cards of the drawing – and so of the switches of its modes
  const seriesOpen = useSeries((s) => s.open);
  /** What a finger is doing to the selected part of the drawing right now */
  const [held, setHeld] = useState<'size' | 'turn' | 'move' | null>(null);

  const paths = useMemo(
    () => buildPaths(analysis?.segments ?? [], projection(view, rotaryDiameter), surface),
    [analysis, view, rotaryDiameter, surface],
  );

  // Machine travel in work coordinates; only known with a WCO from the controller.
  const workspace = useMemo<Extent | null>(() => {
    if (!wco || view === 'unwrapped') return null;
    const { x, y, z } = profile.travel;
    const [ox = 0, oy = 0, oz = 0] = wco;
    const v = view === 'top' ? { r: y, o: oy } : { r: z, o: oz };
    return { minU: x.min - ox, maxU: x.max - ox, minV: v.r.min - v.o, maxV: v.r.max - v.o };
  }, [wco, view, profile]);

  // The drawing being edited, whatever program lies on the table: it is drawn over the picture and
  // taken by the finger as long as the drawing workspace shows – also while another program runs.
  const drawing = useMemo(() => {
    if (!drawingOpen || !project || !top) return null;
    const outline = (items: typeof project.items) => {
      const path = new Path2D();
      for (const item of items) {
        for (const c of item.contours) {
          if (c.circle) {
            const { cx, cy, r } = c.circle;
            path.moveTo(cx + r, cy);
            path.arc(cx, cy, r, 0, Math.PI * 2);
            if (item.registration !== undefined) {
              // A registration hole: a cross through it, so it is not taken for a part's hole.
              path.moveTo(cx - 2 * r, cy);
              path.lineTo(cx + 2 * r, cy);
              path.moveTo(cx, cy - 2 * r);
              path.lineTo(cx, cy + 2 * r);
            }
            continue;
          }
          c.points.forEach((p, i) => (i ? path.lineTo(p.x, p.y) : path.moveTo(p.x, p.y)));
          if (c.closed) path.closePath();
        }
      }
      return path;
    };
    const chosen = project.items.filter((i) => isSelected(i, selected));
    const box = itemsBounds(chosen);
    const frame = selectionFrame(chosen);
    // What the finger is changing, in numbers beside the part.
    let label: string | null = null;
    if (frame && box && held === 'size') {
      const { w, h } = frameSize(frame);
      label = t('cam.live.size', { w: mm(w), h: mm(h) });
    } else if (frame && held === 'turn') {
      label = t('cam.live.angle', { a: mm(frameAngle(frame)) });
    } else if (box && held === 'move') {
      label = t('cam.live.place', { x: mm(box.minX), y: mm(box.minY) });
    }
    // The holding tabs of every thing that has them – the places the toolpath is cut with
    const marks = project.items.flatMap((i) => itemTabMarks(i, tabDefaults, cutter));
    const chosenIds = new Set(chosen.map((i) => i.id));
    const byItem = new Map<number, typeof marks>();
    for (const m of marks) byItem.set(m.item, [...(byItem.get(m.item) ?? []), m]);
    const fourth = (n: number) => Math.round(n * 1e4) / 1e4;
    const tabsData =
      marks.length > 0
        ? JSON.stringify(
            [...byItem].map(([item, ms]) => ({
              item,
              selected: chosenIds.has(item),
              sites: ms.map((m) => ({
                c: m.c,
                u: fourth(m.u),
                x: fourth(m.x),
                y: fourth(m.y),
                w: m.w,
                index: m.index,
              })),
            })),
          )
        : undefined;
    // Putting tabs by hand: the thing must still be the selected one
    const placingNow = placing !== null && chosenIds.has(placing);
    // Measuring (only where its switch can be seen): the two points and what lies between them
    const measureNow = measuring && !seriesOpen && project.items.length > 0;
    let measureMark: MeasureMark | null = null;
    let measureData: string | undefined;
    if (measureNow && measured.a) {
      const { a, b } = measured;
      const result = b ? measurement(a, b) : null;
      measureMark = {
        a,
        b,
        names: [t('cam.measure.pointA'), t('cam.measure.pointB')],
        label: result ? t('cam.measure.live', { d: formatNumber(result.distance, 2) }) : '',
        detail: result
          ? t('cam.measure.liveDetail', {
              dx: formatSigned(result.dx, 2, true),
              dy: formatSigned(result.dy, 2, true),
              a: formatSigned(result.angle, 1),
            })
          : '',
      };
      const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
      measureData = JSON.stringify({
        a: { x: r4(a.x), y: r4(a.y) },
        b: b ? { x: r4(b.x), y: r4(b.y) } : null,
        ...(result
          ? {
              distance: r4(result.distance),
              dx: r4(result.dx),
              dy: r4(result.dy),
              angle: r4(result.angle),
            }
          : {}),
      });
    }
    const all = itemsBounds(project.items);
    const backItems = project.items.filter((i) => i.side === 'back');
    const holes = project.items.filter((i) => i.registration !== undefined);
    // The flip line of a two-sided part: through the middle between its registration holes.
    let flipLine: [number, number, number, number] | null = null;
    if (project.twoSided && holes.length === 2 && all) {
      const { axis, at } = flipFor(project.twoSided.axis, {
        a: holeCentre(holes[0]!),
        b: holeCentre(holes[1]!),
      });
      flipLine =
        axis === 'x'
          ? [at, all.minY - 12, at, all.maxY + 12]
          : [all.minX - 12, at, all.maxX + 12, at];
    }
    // Hidden parts are drawn apart, faint and dashed (they are not cut); for the tests: where each one lies
    const hiddenItems = project.items.filter((i) => i.hidden === true);
    const hiddenBoxes = hiddenItems
      .map((i) => itemsBounds([i]))
      .map((b) => (b ? [b.minX, b.minY, b.maxX, b.maxY].map((n) => n.toFixed(1)).join() : ''))
      .join(';');
    return {
      outline: outline(project.items.filter((i) => i.side !== 'back' && i.hidden !== true)),
      back: backItems.some((i) => i.hidden !== true)
        ? outline(backItems.filter((i) => i.hidden !== true))
        : null,
      hidden: hiddenItems.length > 0 ? outline(hiddenItems) : null,
      hiddenBoxes: hiddenItems.length > 0 ? hiddenBoxes : undefined,
      flipLine,
      selected:
        box && frame
          ? {
              outline: outline(chosen),
              box: boundsExtent(box),
              frame,
              // A registration hole is only moved; while tabs are put by hand or a measurement is made the handles
              // stay away
              handles:
                !placingNow && !measureNow && !chosen.some((i) => i.registration !== undefined),
              label,
            }
          : null,
      tabs: marks.map((m) => ({
        span: m.span,
        ends: m.ends,
        at: { x: m.x, y: m.y },
        selected: chosenIds.has(m.item),
      })),
      marks,
      tabsData,
      placing: placingNow,
      measure: measureMark,
      measureData,
      extent: all ? boundsExtent(all) : null,
    };
  }, [
    drawingOpen,
    project,
    selected,
    top,
    held,
    tabDefaults,
    cutter,
    placing,
    measuring,
    measured,
    seriesOpen,
  ]);
  const drawingRef = useRef(drawing);
  // In the drawing workspace the tap tools and the clamps are out of reach of the finger.
  const drawingOpenRef = useRef(drawingOpen);
  drawingOpenRef.current = drawingOpen;
  drawingRef.current = drawing;

  // The blanks of a series: while it is being put together, and while its program is the job.
  const seriesLoaded = useSeriesLoaded();
  const seriesPlan = useSeriesPlan();
  const refused = useSeries((s) => s.refused);
  const [zx = 0, zy = 0] = wco ?? [];
  const blanks = useMemo<BlankMark[]>(() => {
    if (!top || !wco || !(seriesOpen || seriesLoaded)) return [];
    const work = (p: { x: number; y: number }): [number, number] => [p.x - zx, p.y - zy];
    return [
      ...(seriesPlan?.entries ?? []).map(
        (e): BlankMark => ({
          id: e.blank.id,
          outline: e.blank.outline.map(work),
          at: work(e.blank),
          label: e.n === null ? null : String(e.n),
          state: e.state !== 'cut' ? 'out' : e.fits ? 'cut' : 'misfit',
        }),
      ),
      ...refused.map(
        (r): BlankMark => ({
          id: -1,
          outline: r.outline.map(work),
          at: work(r),
          label: t(`series.refused.short.${r.reason}`),
          state: 'refused',
        }),
      ),
    ];
    // The work zero by its numbers: a status report brings a new array every time.
  }, [top, wco === undefined, zx, zy, seriesOpen, seriesLoaded, seriesPlan, refused]);
  // A part longer than the table: the whole of it around the section that is the job.
  const sections = useSectionsOverlay(top && wco ? { x: zx, y: zy } : null);
  // Printed tags the camera has seen, each with its number and the jig it belongs to.
  const seenTags = useJigs((s) => s.seen);
  const jigs = useWorkshop((s) => s.jigs);
  const tags = useMemo<TagMark[]>(() => {
    if (!top || !wco) return [];
    return (
      seenTags
        // A register mark of a part cut in sections is drawn as that, where it was measured.
        .filter((tag) => !sections.markIds.includes(tag.id))
        .map((tag) => ({
          outline: tagCorners(tag).map((p): [number, number] => [p.x - zx, p.y - zy]),
          label: tagLabel(jigs, tag.id, t('jigs.tagOne', { n: tag.id })),
          known: jigsWithTag(jigs, tag.id).length > 0,
        }))
    );
  }, [top, wco === undefined, zx, zy, seenTags, jigs, sections.markIds]);
  const blanksRef = useRef(blanks);
  blanksRef.current = blanks;
  const seriesOpenRef = useRef(seriesOpen);
  seriesOpenRef.current = seriesOpen;
  const blanksExtent = useMemo(
    () =>
      blanks.reduce<Extent | null>((e, b) => {
        const us = b.outline.map((p) => p[0]);
        const vs = b.outline.map((p) => p[1]);
        return union(e, {
          minU: Math.min(...us),
          maxU: Math.max(...us),
          minV: Math.min(...vs),
          maxV: Math.max(...vs),
        });
      }, null),
    [blanks],
  );

  // Track the canvas size.
  useEffect(() => {
    const el = containerRef.current!;
    const observer = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height, dpr: window.devicePixelRatio || 1 });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Clamps as the table draws them: yellow where the job is in their way, and
  // the selected one with its handles while the clamp tool is in the hand.
  const zones = useMemo(() => {
    if (!top) return [];
    const hit = new Set(clampHits.map((h) => h.fixture));
    return fixtures.map((f, i) => {
      // The drawing workspace has no tools in the hand: a clamp is shown, never taken.
      const selected = !drawingOpen && toolId === 'clamp' && zone === i;
      return {
        name: f.name,
        box: boxExtent(f),
        round: f.round,
        warned: hit.has(i),
        selected,
        handles: selected ? zoneHandles(f).map((h) => [h.x, h.y] as [number, number]) : undefined,
      };
    });
  }, [top, fixtures, clampHits, toolId, zone, drawingOpen]);
  const warned = useMemo(() => clampHits.flatMap((h) => h.segments), [clampHits]);

  const [ox = 0, oy = 0] = wco ?? [];
  const toWork = (p: { x: number; y: number }): [number, number] => [p.x - ox, p.y - oy];
  const picture = cameraOn ? cameraElement() : null;
  const footprint =
    !drawingOpen && top && wco && picture && mposX !== undefined && mposY !== undefined
      ? cameraCalibrated(calibration)
        ? frameCorners(calibration, { x: mposX, y: mposY }, pictureSize(picture), 1).map(toWork)
        : null
      : null;

  // Everything the painter needs, refreshed on every React render.
  const sceneRef = useRef<Scene | null>(null);
  // The frame being drawn across the table ("Rahmen aufziehen"): only the painter and the tests see it, while
  // the finger is down – it is not part of the drawing and never makes React render
  const marqueeRef = useRef<Extent | null>(null);
  // What a part that is dragged shows: the lines it snapped to and the gaps to its neighbours – like the frame
  // only while the finger is down, painted and told to the tests, never part of the drawing
  const hintsRef = useRef<{ guides: SnapGuide[]; gaps: GapMark[] } | null>(null);
  // The last tap of the measurement: where (CSS px), when and how to take it back. A finger that comes down on a
  // point of the measurement is the grab's, not the gesture layer's – which then never sees the second tap of a
  // double tap – so the grab asks this to tell the second tap from a new one (see `measureOn`)
  const measureTapRef = useRef<{ p: Point; at: number; undo: () => void } | null>(null);
  sceneRef.current = {
    paths,
    segments: analysis?.segments ?? [],
    done: track.done,
    current: analysis && analysis.segments.length > 0 ? { index: track.index, t: track.t } : null,
    showRapids,
    surfaceZ: surface,
    tool: track.position,
    live: track.live,
    toolDiameter,
    workspace,
    // The points a tap tool holds belong to Einrichten: the drawing workspace shows none.
    marks: top && wco && !drawingOpen ? points.map(toWork) : [],
    marksLine: drawingOpen ? undefined : activeTool(toolId).line,
    marksLabel: drawingOpen ? undefined : activeTool(toolId).lineLabel?.(points),
    photos:
      top && wco && tiles > 0 ? { chunks: mapChunks, chunkMm: CHUNK_MM, offset: [ox, oy] } : null,
    footprint,
    stock: top && stock ? boxExtent(stock) : null,
    fixtures: zones,
    warned: top ? warned : [],
    blanks,
    tags,
    drawing: drawing?.outline,
    drawingBack: drawing?.back,
    drawingHidden: drawing?.hidden,
    flipLine: drawing?.flipLine,
    drawingSelected: drawing?.selected,
    drawingTabs: drawing?.tabs,
    drawingTabsGrip: drawing?.placing,
    drawingMarquee: marqueeRef.current,
    drawingGuides: hintsRef.current?.guides,
    drawingGaps: hintsRef.current?.gaps,
    drawingMeasure: drawing?.measure,
    sections: sections.mark,
  };
  const followRef = useRef(follow);
  followRef.current = follow;

  const gridLabel = useRef<HTMLLIElement>(null);
  const shownStep = useRef(0);
  const layer = useRef(new LayerCache());
  const colors = useRef<Colors | null>(null);
  const frame = useRef<number | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMove = useRef(0);

  /** Draws one frame. Never triggers a React render. */
  const paint = useCallback(() => {
    frame.current = null;
    const canvas = canvasRef.current;
    const scene = sceneRef.current;
    let vp = viewportRef.current;
    if (!canvas || !scene?.paths || !vp || vp.width === 0) return;
    // Follow the simulated tool while simulating, the machine while it runs the job.
    const toolAt = scene.tool ?? scene.live;
    if (followRef.current && toolAt) {
      // Keep the tool in the middle of the stage.
      const [u, v] = scene.paths.project(toolAt);
      const followed = {
        ...vp,
        originX: vp.width / 2 - u * vp.scale,
        originY: vp.height / 2 + v * vp.scale,
      };
      if (followed.originX !== vp.originX || followed.originY !== vp.originY) {
        vp = followed;
        viewportRef.current = vp;
        noteMove();
      }
    }
    const width = Math.round(vp.width * vp.dpr);
    const height = Math.round(vp.height * vp.dpr);
    // Resizing the canvas reallocates and clears it, so only do it when needed.
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    colors.current ??= readColors(canvas);
    const c = colors.current;

    drawBackground(ctx, vp, c);
    if (scene.photos) drawPhotos(ctx, vp, scene.photos);
    drawTable(ctx, vp, scene, c);
    const key = [pathsId(scene.paths), scene.showRapids, cachedDoneCount(scene)].join('|');
    const moving = performance.now() - lastMove.current < SETTLE_MS;
    layer.current.paint(ctx, vp, key, moving, (layerCtx, layerVp) =>
      drawJobLayer(layerCtx, layerVp, scene, c),
    );
    drawOverlay(ctx, vp, scene, c);
    // For the tests: what the view shows, written only when it changes.
    const shown = `${vp.scale.toFixed(4)},${vp.originX.toFixed(1)},${vp.originY.toFixed(1)}`;
    if (containerRef.current && containerRef.current.dataset.view !== shown) {
      containerRef.current.dataset.view = shown;
    }
    // The grid size stands in the legend; written only when it changes.
    const step = gridStep(vp.scale);
    if (gridLabel.current && shownStep.current !== step) {
      shownStep.current = step;
      gridLabel.current.textContent = t('stage.grid', {
        mm: formatNumber(step, step >= 1 ? 0 : -Math.log10(step)),
      });
    }
  }, []);

  const scheduleDraw = useCallback(() => {
    frame.current ??= requestAnimationFrame(paint);
  }, [paint]);

  /** The view moved: draw cheaply now, sharp once it rests. */
  function noteMove() {
    lastMove.current = performance.now();
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(scheduleDraw, SETTLE_MS + 10);
  }

  // The numbers drawn on the picture (the gaps, the measurement) are set in the bundled mono face; a canvas does
  // not wait for a webfont, so it is asked for once and the picture drawn again when it is there
  useEffect(() => {
    try {
      void document.fonts
        ?.load('600 14px "JetBrains Mono Variable"')
        .then(scheduleDraw, () => undefined);
    } catch {
      // a browser without the font API keeps the fallback face
    }
  }, [scheduleDraw]);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      // Cleared, so a remount (React's strict mode runs effects twice) can schedule again.
      frame.current = null;
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    [],
  );

  // What "Einpassen" shows: the job; without one the pictures on the table,
  // else the machine's travel. Read when fitting, so a growing map does not
  // move the view by itself.
  // A drawing without a toolpath yet (nothing to cut so far) counts like the job it will be.
  // The blanks of a series belong to its picture, whichever of them are engraved just now.
  // A part cut in sections is shown whole, however little of it the job at hand cuts.
  const jobExtent = union(
    union(union(paths.extent, drawing?.extent ?? null), blanksExtent),
    sections.extent,
  );
  const fitSource = jobExtent ? 'job' : top && wco && photoExtent ? 'photos' : 'travel';
  const fitExtent = useRef<Extent | null>(null);
  fitExtent.current =
    fitSource === 'job'
      ? // With the clamps that hold the workpiece: they belong to the picture of the job.
        (top ? fixtures : []).reduce<Extent | null>((e, f) => union(e, boxExtent(f)), jobExtent)
      : fitSource === 'photos'
        ? {
            minU: photoExtent!.minX - ox,
            maxU: photoExtent!.maxX - ox,
            minV: photoExtent!.minY - oy,
            maxV: photoExtent!.maxY - oy,
          }
        : workspace;
  const hasExtent = fitExtent.current !== null;
  const cameraOnRef = useRef(cameraOn);
  cameraOnRef.current = cameraOn;

  // What the view may show: everything that lies on the table, never less than
  // half of it in the view, never closer than a hair.
  const content = union(
    union(fitExtent.current, workspace),
    top && stock ? boxExtent(stock) : null,
  );
  const contentRef = useRef(content);
  contentRef.current = content;
  const limits = (): Limits | null => {
    const c = contentRef.current;
    const vp = viewportRef.current;
    if (!c || !vp || vp.width === 0) return null;
    const fit = Math.min(
      vp.width / Math.max(1, c.maxU - c.minU),
      vp.height / Math.max(1, c.maxV - c.minV),
    );
    return {
      minScale: Math.min(MAX_SCALE, fit / 2),
      maxScale: MAX_SCALE,
      // The middle of the view stays on the content (screen y runs against v).
      origin: (scale) => ({
        x: { min: vp.width / 2 - c.maxU * scale, max: vp.width / 2 - c.minU * scale },
        y: { min: vp.height / 2 + c.minV * scale, max: vp.height / 2 + c.maxV * scale },
      }),
    };
  };
  const fitted = () =>
    fitViewport(
      fitExtent.current,
      size.width,
      size.height,
      size.dpr,
      cameraOnRef.current ? INSET : undefined,
    );

  /**
   * What a tap does in the drawing workspace, at a work point: puts a tab where tabs are being put by hand,
   * else selects the part under it – also the one it is inside of – and a tap beside everything lets go of the
   * selection. With "Mehrfachauswahl" on, or Shift/Ctrl held, a tap takes the part in or lets go of it, and a
   * tap beside everything keeps what is selected. Returns how to take it back if it turns out to be the first
   * of a double tap. The one place for it: a finger that lifted on a thing it had taken ends here too.
   */
  const tapDrawing = (vp: Viewport, u: number, v: number, modifiers?: Modifiers) => {
    const cam = useCam.getState();
    // Measuring: a tap sets a point (A, then B, then A again) – it selects nothing and changes nothing of the
    // drawing; taken back like every tap if it turns out to be the first of a double tap
    if (measureOn()) {
      const before = cam.measured;
      cam.measurePoint(measureSpot(vp, { x: u, y: v }, modifiers?.alt === true));
      return () => useCam.getState().restoreMeasure(before);
    }
    const more = additive(modifiers);
    // Putting tabs by hand: a tap on the line of that part puts a tab at the nearest place (taken
    // back, like every tap, if it turns out to be the first of a double tap); beside the line it
    // is a tap as ever.
    const placingItem = drawingRef.current?.placing
      ? cam.project?.items.find((i) => i.id === cam.placing)
      : undefined;
    const near = placingItem && placeNear(placingItem, { x: u, y: v }, GRAB_PX / vp.scale);
    if (placingItem && near) {
      return cam.addTab(placingItem.id, near.c, near.u)
        ? () => useCam.getState().undo()
        : undefined;
    }
    const before = cam.selected;
    if (cam.pick({ x: u, y: v }, GRAB_PX / vp.scale, true, more)) {
      return () => useCam.getState().select(before);
    }
    if (before !== null && !cam.multi && !more) {
      cam.select(null);
      return () => useCam.getState().select(before);
    }
    return undefined;
  };

  /**
   * Whether a drag draws a frame: the mode is on, and its switch can be seen – a drawing with parts on the table,
   * the series flow not open (it takes the place of the cards, the switch with them).
   */
  const frameOn = (on: boolean) =>
    on && !seriesOpenRef.current && (useCam.getState().project?.items.length ?? 0) > 0;

  /** The frame of "Rahmen aufziehen" while a finger draws it (null: gone): painted, and told to the tests */
  const showMarquee = (rect: Bounds | null) => {
    const shown = rect ? boundsExtent(rect) : null;
    marqueeRef.current = shown;
    if (sceneRef.current) sceneRef.current.drawingMarquee = shown;
    const el = containerRef.current;
    if (el) {
      if (rect) {
        el.dataset.drawingMarquee = [rect.minX, rect.minY, rect.maxX, rect.maxY]
          .map((n) => n.toFixed(1))
          .join();
      } else delete el.dataset.drawingMarquee;
    }
    scheduleDraw();
  };

  /**
   * What a dragged part shows (null: gone): the guides of what it snapped to and the gaps to its neighbours,
   * painted and told to the tests as data attributes. Cleared when the finger lets go, whichever way it does.
   */
  const showHints = (hints: DragHints | null | undefined) => {
    const shown =
      hints && (hints.guides.length > 0 || hints.gaps.length > 0)
        ? {
            guides: hints.guides,
            gaps: hints.gaps.map(
              (g): GapMark => ({
                side: g.side,
                from: g.from,
                to: g.to,
                equal: g.equal,
                text: t(g.equal ? 'cam.gap.equal' : 'cam.gap.label', { mm: mm(g.gap) }),
              }),
            ),
          }
        : null;
    hintsRef.current = shown;
    if (sceneRef.current) {
      sceneRef.current.drawingGuides = shown?.guides;
      sceneRef.current.drawingGaps = shown?.gaps;
    }
    const el = containerRef.current;
    if (el) {
      const r3 = (n: number) => Math.round(n * 1e3) / 1e3;
      if (shown && shown.guides.length > 0) {
        el.dataset.drawingSnap = JSON.stringify(
          shown.guides.map((g) => ({ axis: g.axis, at: r3(g.at), from: r3(g.from), to: r3(g.to) })),
        );
      } else delete el.dataset.drawingSnap;
      if (shown && shown.gaps.length > 0) {
        el.dataset.drawingGaps = JSON.stringify(
          shown.gaps.map((g, i) => ({
            side: g.side,
            gap: r3(hints!.gaps[i]!.gap),
            equal: g.equal,
            text: g.text,
            from: { x: r3(g.from.x), y: r3(g.from.y) },
            to: { x: r3(g.to.x), y: r3(g.to.y) },
          })),
        );
      } else delete el.dataset.drawingGaps;
    }
    scheduleDraw();
  };

  /**
   * Whether a tap or a drag measures: the mode is on, and its switch can be seen – a drawing with parts on the
   * table, the series flow not open (it takes the place of the cards, the switch with them).
   */
  const measureOn = () =>
    useCam.getState().measure &&
    !seriesOpenRef.current &&
    (useCam.getState().project?.items.length ?? 0) > 0;

  /** A point of the measurement as the finger or the pointer puts it: snapped to a clear feature, else free */
  const measureSpot = (vp: Viewport, free: { x: number; y: number }, alt: boolean) => {
    const items = useCam.getState().project?.items ?? [];
    const near = alt ? null : snapMeasure(free, measureFeatures(items), MEASURE_SNAP_PX / vp.scale);
    return near ? { x: near.x, y: near.y } : free;
  };

  /**
   * The tap of the measurement that a tap at `p` now is the second of – a double tap – or null. It lies within the
   * gesture layer's own time and slop of the first.
   */
  const firstOfDouble = (p: Point) => {
    const first = measureTapRef.current;
    return first !== null &&
      performance.now() - first.at < DOUBLE_TAP_MS &&
      Math.hypot(p.x - first.p.x, p.y - first.p.y) < DOUBLE_TAP_SLOP
      ? first
      : null;
  };

  // Fit on new job, view change or request; on resize only until the user pans or zooms.
  const userMoved = useRef(false);
  const gesture = usePanZoom(canvasEl, {
    read: () => (viewportRef.current ? toTransform(viewportRef.current) : null),
    write(t) {
      const vp = viewportRef.current;
      if (!vp) return;
      viewportRef.current = { ...vp, scale: t.scale, originX: t.x, originY: t.y };
      noteMove();
      scheduleDraw();
    },
    limits,
    size: () => ({
      width: viewportRef.current?.width ?? 0,
      height: viewportRef.current?.height ?? 0,
    }),
    grabbed(how) {
      userMoved.current = true;
      if (how === 'pan' && followRef.current) onPan();
    },
    // A short tap on the table gives the stage tool a machine point.
    tap(p, _kind, modifiers) {
      const vp = viewportRef.current;
      const { status } = useMachine.getState();
      if (!vp) return;
      const [u, v] = screenToWorld(vp, p.x, p.y);
      if (seriesOpenRef.current) {
        // A series is being put together: a tap on a blank leaves it out or takes it in again.
        const reach = GRAB_PX / vp.scale;
        const hit =
          blanksRef.current.find((b) => b.id >= 0 && pointInPolygon({ x: u, y: v }, toPoints(b))) ??
          blanksRef.current.find((b) => b.id >= 0 && Math.hypot(b.at[0] - u, b.at[1] - v) < reach);
        if (hit) {
          useSeries.getState().toggle(hit.id);
          return () => useSeries.getState().toggle(hit.id);
        }
      }
      if (drawingRef.current) {
        // The second tap of a double tap whose first was a finger on a point (the gesture layer knows nothing of
        // that one): the first is taken back and the view answers
        const first = measureOn() ? firstOfDouble(p) : null;
        if (first) {
          measureTapRef.current = null;
          first.undo();
          fitOrZoom(p);
          return;
        }
        const undo = tapDrawing(vp, u, v, modifiers);
        // A tap of the measurement is the first of a double tap, if one follows on the spot (the gesture layer
        // itself takes the tap back then, where the second one is its own)
        measureTapRef.current = undo && measureOn() ? { p, at: performance.now(), undo } : null;
        return undo;
      }
      if (drawingOpenRef.current || !top || !status?.wco) return;
      // Taken back if this tap turns out to be the first of a double tap.
      return tapStage(
        { x: u + (status.wco[0] ?? 0), y: v + (status.wco[1] ?? 0) },
        p.y > vp.height / 2,
      );
    },
    // A finger on a tapped point or a clamp takes that, not the view.
    grab(p, _kind, modifiers) {
      const vp = viewportRef.current;
      const { status } = useMachine.getState();
      if (!vp) return null;
      if (drawingRef.current) {
        // A finger on a line of the drawing (or on a text) selects that part and
        // moves it over the table; inside a shape it moves the view as ever.
        const cam = useCam.getState();
        const [u0, v0] = screenToWorld(vp, p.x, p.y);
        const at = { x: u0, y: v0 };
        // Whole millimetres, finer once the view is close enough to place by eye.
        const step = vp.scale < 12 ? 1 : vp.scale < 40 ? 0.5 : 0.1;
        const done = (end: () => void) => () => {
          setHeld(null);
          // Whichever way the finger lets go (lifted, a second finger, a lost touch) the guides and gaps go
          showHints(null);
          end();
        };
        // What helps while a part is dragged: snapping (a threshold the same on the screen at every zoom) unless
        // the switch is off or Alt is held – at the start or at any move –, and the gaps unless their switch is off
        const aids = useUi.getState().aids;
        const assist = (keys?: Modifiers) => ({
          snap: aids.snap && modifiers?.alt !== true && keys?.alt !== true ? SNAP_PX / vp.scale : 0,
          gaps: aids.gaps,
        });
        // Measuring: only the two points can be taken – by a finger that comes down on one of them; it follows
        // the finger (from where it lies, not jumping to it) and snaps to a clear feature unless Alt is held.
        // Anything else is the view's (a tap there sets a point). Nothing is selected, and nothing moves.
        if (measureOn()) {
          const reach = GRAB_PX / vp.scale;
          const taken = (['a', 'b'] as const)
            .filter((k) => cam.measured[k] !== null)
            .map((k) => ({ k, p: cam.measured[k]! }))
            .map((h) => ({ ...h, d: Math.hypot(h.p.x - u0, h.p.y - v0) }))
            .filter((h) => h.d <= reach)
            .sort((x, y) => x.d - y.d)[0];
          if (!taken) return null;
          return {
            move(q, _finger, keys) {
              const [u, v] = screenToWorld(vp, q.x, q.y);
              const free = { x: taken.p.x + (u - u0), y: taken.p.y + (v - v0) };
              cam.moveMeasure(
                taken.k,
                measureSpot(vp, free, modifiers?.alt === true || keys?.alt === true),
              );
            },
            end: () => undefined,
            // Lifted on the spot: a tap. With A alone a tap that close to it is B – the only way to a line shorter
            // than a finger (the finger takes A first); with both set it leaves them where they are. The second
            // tap of a double tap is none of these: the first is taken back and the view answers, as everywhere
            tap: () => {
              const first = firstOfDouble(p);
              if (first) {
                measureTapRef.current = null;
                first.undo();
                fitOrZoom(p);
                return;
              }
              const before = useCam.getState().measured;
              if (before.b === null) {
                cam.measurePoint(measureSpot(vp, at, modifiers?.alt === true));
              }
              // …and is itself the first of a double tap, if one follows
              measureTapRef.current = {
                p,
                at: performance.now(),
                undo: () => useCam.getState().restoreMeasure(before),
              };
            },
            yields: true,
          };
        }
        // Putting tabs by hand: a tab is taken first – dragged along the line it stands on, taken
        // back by a tap. On the part's own line a finger then moves the view (and a tap puts a tab):
        // no handle and no dragging of the part itself gets in the way.
        const placingItem = drawingRef.current.placing
          ? cam.project?.items.find((i) => i.id === cam.placing)
          : undefined;
        if (placingItem) {
          const reach = GRAB_PX / vp.scale;
          const tab = tabNear(drawingRef.current.marks, placingItem.id, at, reach);
          const drag = tab && tab.index >= 0 ? cam.dragTab(placingItem.id, tab.index) : null;
          if (tab && drag) {
            const contour = placingItem.contours[tab.c]!;
            return {
              move(q) {
                const [u, v] = screenToWorld(vp, q.x, q.y);
                // The tab follows the finger's way; it stays on its line, at the nearest place
                const near = nearestOnContour(contour, {
                  x: tab.x + (u - u0),
                  y: tab.y + (v - v0),
                });
                if (near) drag.move(near.u);
              },
              end: drag.end,
              tap: () => cam.removeTab(placingItem.id, tab.index),
              yields: true,
            };
          }
          if (placeNear(placingItem, at, reach)) return null;
        }
        // Shift or Ctrl held on a computer: the same as the switch "Mehrfachauswahl" – one way, never a second
        const more = additive(modifiers);
        // "Rahmen aufziehen": while it is on, a drag from anywhere draws a frame – it takes what it touches on
        // release, and nothing is moved by it (no handle, no part: the mode is how a drag is told from a move).
        // A tap is a tap. Not while tabs are being put: that mode has its own use of the finger.
        // Only where its switch is there to turn it off again: not in the series flow (which replaces the cards) and
        // not with nothing drawn (the card of the selection is not shown then)
        if (frameOn(cam.marquee) && !placingItem) {
          const add = cam.multi || more;
          let frame: Bounds | null = null;
          return {
            // The corner of the frame is under the finger itself (a part moves by how far the finger went
            // from where it left the tap slop – a corner that lagged behind by that would not be where it is drawn to)
            move(q, finger) {
              const [u, v] = screenToWorld(vp, (finger ?? q).x, (finger ?? q).y);
              frame = {
                minX: Math.min(u0, u),
                minY: Math.min(v0, v),
                maxX: Math.max(u0, u),
                maxY: Math.max(v0, v),
              };
              showMarquee(frame);
            },
            // Decided by letting go: a second finger, a lost touch or leaving the app only take the frame away
            end(lifted) {
              showMarquee(null);
              if (lifted && frame) cam.selectRect(frame, add);
            },
            tap: () => void tapDrawing(vp, u0, v0, modifiers),
            yields: true,
          };
        }
        // A handle of the selected part first: its corners and sides, the dot for turning.
        const sel = drawingRef.current.selected;
        const handle = sel?.handles ? handleAt(sel.frame, at, vp.scale) : null;
        const edit = handle ? cam.edit(handle, at) : null;
        if (handle && edit) {
          setHeld(handle === 'turn' ? 'turn' : 'size');
          return {
            move(q) {
              const [u, v] = screenToWorld(vp, q.x, q.y);
              edit.move({ x: u, y: v }, step);
            },
            end: done(edit.end),
            yields: true,
          };
        }
        // A small selected part is taken anywhere in its frame: its handles crowd its line.
        const small =
          sel !== null &&
          sel !== undefined &&
          Math.min(...Object.values(frameSize(sel.frame))) * vp.scale < 4 * HANDLE_PX &&
          insideFrame(sel.frame, at);
        if (cam.multi || more) {
          // "Mehrfachauswahl": a finger on a part that is selected takes the whole selection along (and,
          // lifted on the spot, lets go of that part); on one that is not, a tap takes it in and a
          // drag takes it in and then moves all of it.
          const hit = cam.project && itemAt(cam.project.items, at, GRAB_PX / vp.scale, false);
          const member = hit ? isSelected(hit, cam.selected) : false;
          if (hit || (small && cam.selected !== null)) {
            let drag = member || !hit ? cam.drag() : null;
            if (drag) setHeld('move');
            return {
              move(q, _finger, keys) {
                if (!drag) {
                  if (hit) cam.toggleSelect(hit.group);
                  drag = cam.drag();
                  if (!drag) return;
                  setHeld('move');
                }
                const [u, v] = screenToWorld(vp, q.x, q.y);
                showHints(drag.move(u - u0, v - v0, step, assist(keys)));
              },
              end: done(() => drag?.end()),
              // Lifted on the spot: a tap, as if the finger had not taken hold – with the mode on `pick`
              // takes the part under it in or out (also inside a small selected part, where a finger
              // always takes hold)
              tap: () => void cam.pick(at, GRAB_PX / vp.scale, true, more),
              yields: true,
            };
          }
        } else {
          const drag = cam.pick(at, GRAB_PX / vp.scale, false) || small ? cam.drag() : null;
          if (drag) {
            setHeld('move');
            return {
              move(q, _finger, keys) {
                const [u, v] = screenToWorld(vp, q.x, q.y);
                showHints(drag.move(u - u0, v - v0, step, assist(keys)));
              },
              end: done(drag.end),
              yields: true,
            };
          }
        }
      }
      if (drawingOpenRef.current || !top || !status?.wco) return null;
      const [wx = 0, wy = 0] = status.wco;
      const machine = (q: { x: number; y: number }) => {
        const [u, v] = screenToWorld(vp, q.x, q.y);
        return { x: u + wx, y: v + wy };
      };
      const grab = grabStage(machine(p), GRAB_PX / vp.scale);
      return grab ? { move: (q) => grab.move(machine(q)), end: () => undefined } : null;
    },
    doubleTap(p) {
      measureTapRef.current = null;
      fitOrZoom(p);
    },
  });
  // Double tap: back to the whole picture – or, from there, closer to the spot.
  function fitOrZoom(p: Point) {
    const vp = viewportRef.current;
    if (!vp || size.width === 0) return;
    const fit = toTransform(fitted());
    const now = toTransform(vp);
    if (sameView(now, fit)) {
      userMoved.current = true;
      gesture.glideTo(zoomAround(now, p, DOUBLE_TAP_ZOOM));
    } else {
      userMoved.current = false;
      gesture.glideTo(fit);
    }
  }

  // With a mouse, the pointer says what a press would take: a handle, a part, or the view.
  useEffect(() => {
    const el = canvasEl;
    if (!el) return;
    const hover = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.buttons !== 0) return;
      const vp = viewportRef.current;
      const sel = drawingRef.current?.selected;
      const items = useCam.getState().project?.items;
      let cursor = '';
      if (vp && drawingRef.current && items) {
        const r = el.getBoundingClientRect();
        const [u, v] = screenToWorld(vp, e.clientX - r.left, e.clientY - r.top);
        const handle = sel?.handles ? handleAt(sel.frame, { x: u, y: v }, vp.scale) : null;
        // With "Rahmen aufziehen" on a press draws a frame (nothing is taken by a handle or a line then)
        if (measureOn()) cursor = 'crosshair';
        else if (frameOn(useCam.getState().marquee) && !drawingRef.current.placing)
          cursor = 'crosshair';
        else if (sel && handle) cursor = handleCursor(sel.frame, handle);
        else if (itemAt(items, { x: u, y: v }, GRAB_PX / vp.scale, false)) cursor = 'move';
      }
      if (el.style.cursor !== cursor) el.style.cursor = cursor;
    };
    el.addEventListener('pointermove', hover);
    return () => {
      el.removeEventListener('pointermove', hover);
      el.style.cursor = '';
    };
  }, [canvasEl]);

  // The drawing workspace asks what is in view, so a new shape appears where the eye is.
  useEffect(
    () =>
      provideTableBox(() => {
        const vp = viewportRef.current;
        if (!vp || vp.width === 0) return null;
        const [minX, maxY] = screenToWorld(vp, 0, 0);
        const [maxX, minY] = screenToWorld(vp, vp.width, vp.height);
        return { minX, minY, maxX, maxY };
      }),
    [],
  );

  // The loupe of the stage tools shows this table, magnified around a point.
  useEffect(
    () =>
      provideLoupe((ctx, centre, scale, side, dpr) => {
        const scene = sceneRef.current;
        const canvas = canvasRef.current;
        const { status } = useMachine.getState();
        if (!scene || !canvas || !status?.wco) return;
        colors.current ??= readColors(canvas);
        const [wx = 0, wy = 0] = status.wco;
        const vp: Viewport = {
          width: side,
          height: side,
          dpr,
          scale,
          originX: side / 2 - (centre.x - wx) * scale,
          originY: side / 2 + (centre.y - wy) * scale,
        };
        drawBackground(ctx, vp, colors.current);
        if (scene.photos) drawPhotos(ctx, vp, scene.photos);
        drawTable(ctx, vp, scene, colors.current, false);
        drawJobLayer(ctx, vp, scene, colors.current);
      }),
    [],
  );

  // "Einpassen" on the same picture glides there; everything else jumps.
  const lastFit = useRef({ fitRequest, paths });
  useEffect(() => {
    userMoved.current = false;
  }, [fitRequest, paths]);
  useEffect(() => {
    if (size.width === 0) return;
    const vp = viewportRef.current;
    const requested = lastFit.current.fitRequest !== fitRequest && lastFit.current.paths === paths;
    const remade = lastFit.current.paths !== paths;
    lastFit.current = { fitRequest, paths };
    // While drawing, a part that was moved or changed stays where the eye left it,
    // as long as the whole job is still in view at a size one can work with.
    const steady =
      remade &&
      (drawingRef.current !== null || seriesOpenRef.current) &&
      vp !== null &&
      inView(vp, fitExtent.current);
    if (vp && (userMoved.current || steady)) {
      viewportRef.current = { ...vp, width: size.width, height: size.height, dpr: size.dpr };
    } else {
      const target = fitted();
      gesture.stop();
      if (vp && requested) {
        viewportRef.current = { ...vp, width: size.width, height: size.height, dpr: size.dpr };
        gesture.glideTo(toTransform(target));
      } else {
        viewportRef.current = target;
      }
    }
    scheduleDraw();
  }, [fitRequest, paths, size, fitSource, hasExtent, cameraOn, scheduleDraw]);

  // Any React update (track, toggles, job, map) only schedules a frame.
  useEffect(() => scheduleDraw());

  return (
    <div
      className="table-view"
      ref={containerRef}
      data-testid="table-view"
      data-photos={tiles > 0 && top ? tiles : 0}
      data-zones={zones.length}
      data-blanks={
        blanks.length > 0
          ? blanks
              .map((b) => `${b.id}:${b.state}:${b.at[0].toFixed(1)},${b.at[1].toFixed(1)}`)
              .join(';')
          : undefined
      }
      data-tags={
        tags.length > 0
          ? seenTags
              .map((s) => `${s.id}:${(s.x - zx).toFixed(1)},${(s.y - zy).toFixed(1)}`)
              .join(';')
          : undefined
      }
      data-sections={sections.state}
      data-warned={warned.length}
      data-drawing-selected={
        drawing?.selected
          ? [
              drawing.selected.box.minU,
              drawing.selected.box.minV,
              drawing.selected.box.maxU,
              drawing.selected.box.maxV,
            ]
              .map((n) => n.toFixed(1))
              .join()
          : undefined
      }
      data-drawing-frame={
        drawing?.selected?.handles
          ? selectionCorners(drawing.selected.frame)
              .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
              .join(';')
          : undefined
      }
      data-drawing-label={drawing?.selected?.label ?? undefined}
      data-drawing-hidden={drawing?.hiddenBoxes}
      data-drawing-tabs={drawing?.tabsData}
      data-drawing-placing={drawing?.placing ? '1' : undefined}
      data-drawing-measure={drawing?.measureData}
      data-zone={zones
        .filter((z) => z.selected)
        .map((z) => [z.box.minU, z.box.minV, z.box.maxU, z.box.maxV].map((n) => n.toFixed(1)))
        .join()}
    >
      <canvas ref={setCanvas} data-testid="stage-canvas" />
      <ul className="legend" aria-label={t('stage.legend')}>
        {analysis ? (
          <>
            <li>
              <i className="legend-rapid" />
              {t('job.legendRapid')}
            </li>
            <li>
              <i className="legend-air" />
              {t('job.legendAir')}
            </li>
            <li>
              <i className="legend-cut" />
              {t('job.legendCut')}
            </li>
            <li>
              <i className="legend-done" />
              {t('job.legendDone')}
            </li>
            <li>
              <i className="legend-current" />
              {t('job.legendCurrent')}
            </li>
          </>
        ) : null}
        <li ref={gridLabel} className="tabular-nums" />
      </ul>
    </div>
  );
}

const toPoints = (b: BlankMark) => b.outline.map(([x, y]) => ({ x, y }));

const boundsExtent = (b: { minX: number; minY: number; maxX: number; maxY: number }): Extent => ({
  minU: b.minX,
  maxU: b.maxX,
  minV: b.minY,
  maxV: b.maxY,
});

/** The extent lies in the view and fills at least a third of its width or height. */
function inView(vp: Viewport, e: Extent | null): boolean {
  if (!e) return false;
  const left = vp.originX + e.minU * vp.scale;
  const right = vp.originX + e.maxU * vp.scale;
  const top = vp.originY - e.maxV * vp.scale;
  const bottom = vp.originY - e.minV * vp.scale;
  const inside = left >= 0 && right <= vp.width && top >= 0 && bottom <= vp.height;
  return inside && (right - left >= vp.width / 3 || bottom - top >= vp.height / 3);
}

function boxExtent(b: { min: { x: number; y: number }; max: { x: number; y: number } }): Extent {
  return { minU: b.min.x, maxU: b.max.x, minV: b.min.y, maxV: b.max.y };
}
