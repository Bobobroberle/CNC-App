import { HeightField, isEmptyBounds, type Box } from '@lowrider/gcode-core';
import { DEFAULT_TOOLS } from '@lowrider/workshop';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { t } from '../i18n';
import { formatNumber } from '../lib/format';
import { DOUBLE_TAP_MS, DOUBLE_TAP_SLOP, TAP_MS, TAP_SLOP } from '../lib/gesture';
import { reducedMotion } from '../lib/spring';
import {
  defaultStock,
  GANTRY_CLEARANCE,
  GANTRY_DEPTH,
  jobCollisions,
  toolForJob,
} from '../lib/setup';
import { readColors } from '../render/draw';
import {
  alignToZero,
  pathBuffers,
  pathColors,
  rasterizeTop,
  trianglesBounds,
  type Rgb,
} from '../render/scene3d';
import { useJob } from '../store/job';
import { useMachine } from '../store/machine';
import { useTrack } from '../store/track';
import { useClampHits, useWorkFixtures } from '../store/clamps';
import { useWorkshop } from '../store/workshop';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

/** Height field cells for the material removal; more looks finer but costs time per frame. */
const MAX_CELLS = 90_000;
/** Time per frame spent on material removal, ms */
const CUT_BUDGET = 10;

const rgb = (css: string): Rgb => {
  const c = new THREE.Color(css || '#888888');
  return [c.r, c.g, c.b];
};

interface Built {
  field: HeightField;
  surface: THREE.Mesh;
  /** Original heights to reset the removal */
  initial: Float32Array;
}

/**
 * The 3D stage: table, stock with material removal (height field), toolpaths,
 * tool and holder, the LowRider gantry, clamps and collision points. Follows
 * the simulation, or the real machine while it runs.
 */
export function Stage3D() {
  const container = useRef<HTMLDivElement>(null);
  const analysis = useJob((s) => s.analysis);
  const profile = useJob((s) => s.profile);
  const toolDiameter = useJob((s) => s.toolDiameter);
  const stockModel = useJob((s) => s.stockModel);
  const setStockModel = useJob((s) => s.setStockModel);
  const setup = useWorkshop((s) => s.setup);
  const fixtures = useWorkFixtures();
  const tools = useWorkshop((s) => s.tools);
  const currentTool = useMachine((s) => s.parserState?.tool || null);
  const headerDiameter = useJob((s) => s.header?.tools.find((x) => x.diameter)?.diameter);
  const wcoKey = useMachine((s) => s.status?.wco.slice(0, 3).join(',') ?? null);
  const [removed, setRemoved] = useState(0);
  const stlInput = useRef<HTMLInputElement>(null);

  const tool = useMemo(() => {
    const n = currentTool ?? analysis?.tools[0] ?? 0;
    const t1 = toolForJob(tools, setup.toolMap, n, headerDiameter);
    return t1 ?? { ...DEFAULT_TOOLS[0]!, diameter: toolDiameter };
  }, [currentTool, analysis, tools, setup.toolMap, toolDiameter, headerDiameter]);

  const stock: Box | null = useMemo(() => {
    if (stockModel) return trianglesBounds(stockModel.triangles);
    return setup.stock ?? (analysis ? defaultStock(analysis.cutBounds) : null);
  }, [stockModel, setup.stock, analysis]);

  const clampHits = useClampHits();
  const warnedZones = useMemo(() => new Set(clampHits.map((h) => h.fixture)), [clampHits]);

  const toolRef = useRef(tool);
  toolRef.current = tool;
  const fitRequest = useJob((s) => s.fitRequest);
  const focusRef = useRef<Box | null>(null);

  const collisions = useMemo(
    () => (analysis && stock ? jobCollisions(analysis.segments, stock, fixtures, tool) : []),
    [analysis, stock, fixtures, tool],
  );

  // Three.js objects live outside React state; React only rebuilds them on input changes.
  const three = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    job: THREE.Group;
    toolGroup: THREE.Group;
    gantry: THREE.Mesh;
    paths: THREE.LineSegments | null;
    pathData: ReturnType<typeof pathBuffers> | null;
    built: Built | null;
    cutAt: { index: number; t: number };
    colorsDone: number;
    dirty: boolean;
  } | null>(null);

  const fitRef = useRef(fitCamera);
  fitRef.current = fitCamera;

  // Renderer, camera, lights, render loop.
  useEffect(() => {
    const el = container.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    } catch {
      return;
    }
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    el.appendChild(renderer.domElement);
    renderer.domElement.dataset.testid = 'stage-3d-canvas';
    const scene = new THREE.Scene();
    const colors = readColors(el);
    scene.background = new THREE.Color(colors.bg || '#161616');
    const camera = new THREE.PerspectiveCamera(40, 1, 1, 20000);
    camera.up.set(0, 0, 1);
    // One finger orbits, two pan and pinch (the controls' touch defaults). The
    // view keeps a little of the finger's speed, like the table, unless the
    // operator asked for less motion; a new touch takes it at once.
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !reducedMotion();
    controls.dampingFactor = 0.12;
    controls.zoomToCursor = true;
    controls.minDistance = 20;
    controls.maxDistance = 12000;
    // Double tap (or double click): back to the whole job, as on the table.
    const canvas = renderer.domElement;
    let downAt: { x: number; y: number; t: number; id: number } | null = null;
    let lastTap: { x: number; y: number; t: number } | null = null;
    let fingers = 0;
    const onDown = (e: PointerEvent) => {
      fingers += 1;
      downAt =
        fingers === 1 ? { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId } : null;
    };
    const onUp = (e: PointerEvent) => {
      fingers = Math.max(0, fingers - 1);
      const start = downAt;
      downAt = null;
      if (!start || start.id !== e.pointerId || e.type === 'pointercancel') return;
      const slop = TAP_SLOP[e.pointerType === 'mouse' ? 'mouse' : 'touch'];
      const still = Math.hypot(e.clientX - start.x, e.clientY - start.y) <= slop;
      if (!still || e.timeStamp - start.t >= TAP_MS) {
        lastTap = null;
        return;
      }
      const double =
        lastTap !== null &&
        e.timeStamp - lastTap.t < DOUBLE_TAP_MS &&
        Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < DOUBLE_TAP_SLOP;
      lastTap = double ? null : { x: e.clientX, y: e.clientY, t: e.timeStamp };
      if (double) fitRef.current();
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(-300, -500, 800);
    scene.add(sun);
    const job = new THREE.Group();
    scene.add(job);
    const toolGroup = new THREE.Group();
    scene.add(toolGroup);
    const gantry = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({
        color: 0x9e9e9e,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      }),
    );
    scene.add(gantry);
    const state = {
      renderer,
      scene,
      camera,
      controls,
      job,
      toolGroup,
      gantry,
      paths: null,
      pathData: null,
      built: null,
      cutAt: { index: 0, t: 0 },
      colorsDone: -1,
      dirty: true,
    };
    three.current = state;
    controls.addEventListener('change', () => (state.dirty = true));

    const resize = () => {
      const r = el.getBoundingClientRect();
      renderer.setSize(r.width, r.height, false);
      camera.aspect = r.width / Math.max(1, r.height);
      camera.updateProjectionMatrix();
      state.dirty = true;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();

    let frame = requestAnimationFrame(function loop() {
      stepRemoval();
      // With damping the controls glide on between events.
      if (controls.enableDamping) controls.update();
      if (state.dirty) {
        state.dirty = false;
        renderer.render(scene, camera);
      }
      frame = requestAnimationFrame(loop);
    });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      three.current = null;
    };
  }, []);

  /** Advances the height field towards the current position within the frame budget. */
  function stepRemoval() {
    const s = three.current;
    const a = useJob.getState().analysis;
    if (!s?.built || !a) return;
    const tr = useTrack.getState();
    const target = tr.mode === 'live' ? { index: tr.done, t: 0 } : { index: tr.index, t: tr.t };
    const tool = toolRef.current;
    const shape = {
      kind:
        tool.kind === 'ball'
          ? 'ball'
          : tool.kind === 'vbit' || tool.kind === 'chamfer'
            ? 'vbit'
            : 'flat',
      diameter: tool.diameter,
      ...(tool.angle ? { angle: tool.angle } : {}),
    } as const;
    const { field, initial, surface } = s.built;
    const behind =
      target.index < s.cutAt.index || (target.index === s.cutAt.index && target.t < s.cutAt.t);
    if (behind) {
      field.heights.set(initial);
      s.cutAt = { index: 0, t: 0 };
    }
    if (target.index === s.cutAt.index && target.t === s.cutAt.t && !behind) return;
    const start = performance.now();
    let i = s.cutAt.index;
    while (i < target.index && performance.now() - start < CUT_BUDGET) {
      field.cut(a.segments, shape, i, i + 1);
      i++;
    }
    if (i === target.index) {
      if (target.t > 0) field.cut(a.segments, shape, i, i, target.t);
      s.cutAt = { ...target };
    } else {
      s.cutAt = { index: i, t: 0 };
    }
    const pos = surface.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let k = 0; k < field.heights.length; k++) pos.setZ(k, field.heights[k]!);
    pos.needsUpdate = true;
    surface.geometry.computeVertexNormals();
    s.dirty = true;
    if (s.cutAt.index === target.index) setRemoved(field.removedVolume());
  }

  // Job, stock, table, clamps, collisions: rebuild the static scene.
  useEffect(() => {
    const s = three.current;
    if (!s) return;
    s.job.clear();
    s.paths = null;
    s.pathData = null;
    s.built = null;
    s.cutAt = { index: 0, t: 0 };
    s.colorsDone = -1;
    const el = container.current!;
    const c = readColors(el);
    const palette = { rapid: rgb(c.rapid), air: rgb(c.air), cut: rgb(c.danger), done: rgb(c.done) };

    if (analysis && analysis.segments.length > 0) {
      const data = pathBuffers(analysis.segments, stock?.max.z ?? 0);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(pathColors(data, 0, palette), 3));
      const lines = new THREE.LineSegments(
        geometry,
        new THREE.LineBasicMaterial({ vertexColors: true }),
      );
      lines.renderOrder = 2;
      s.job.add(lines);
      s.paths = lines;
      s.pathData = data;
    }

    if (stock) {
      const area = { minX: stock.min.x, minY: stock.min.y, maxX: stock.max.x, maxY: stock.max.y };
      const field = HeightField.fitting(area, stock.max.z, MAX_CELLS, 0.2);
      if (stockModel) rasterizeTop(field, stockModel.triangles, stock.min.z);
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(field.cols * field.rows * 3);
      for (let r = 0; r < field.rows; r++) {
        for (let col = 0; col < field.cols; col++) {
          const [x, y] = field.cellCenter(col, r);
          const k = (r * field.cols + col) * 3;
          positions[k] = x;
          positions[k + 1] = y;
          positions[k + 2] = field.heights[r * field.cols + col]!;
        }
      }
      const index: number[] = [];
      for (let r = 0; r + 1 < field.rows; r++) {
        for (let col = 0; col + 1 < field.cols; col++) {
          const a = r * field.cols + col;
          index.push(a, a + 1, a + field.cols, a + 1, a + field.cols + 1, a + field.cols);
        }
      }
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setIndex(index);
      geometry.computeVertexNormals();
      const surface = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ color: 0xc8a978, roughness: 0.9, side: THREE.DoubleSide }),
      );
      s.job.add(surface);
      // Sides and bottom of the stock as an outline box.
      const size = new THREE.Vector3(
        stock.max.x - stock.min.x,
        stock.max.y - stock.min.y,
        stock.max.z - stock.min.z,
      );
      const box = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, Math.max(0.1, size.z))),
        new THREE.LineBasicMaterial({ color: 0xc8a978 }),
      );
      box.position.set(
        stock.min.x + size.x / 2,
        stock.min.y + size.y / 2,
        stock.min.z + size.z / 2,
      );
      s.job.add(box);
      s.built = { field, surface, initial: field.heights.slice() };
    }

    // Table: machine travel in work coordinates when the offset is known.
    const wco = wcoKey?.split(',').map(Number);
    const tr = profile.travel;
    const extent =
      wco && wco.length === 3
        ? {
            minX: tr.x.min - wco[0]!,
            maxX: tr.x.max - wco[0]!,
            minY: tr.y.min - wco[1]!,
            maxY: tr.y.max - wco[1]!,
          }
        : stock
          ? {
              minX: stock.min.x - 100,
              maxX: stock.max.x + 100,
              minY: stock.min.y - 100,
              maxY: stock.max.y + 100,
            }
          : { minX: -100, maxX: 100, minY: -100, maxY: 100 };
    const tableZ = (stock?.min.z ?? -10) - 0.5;
    const table = new THREE.Mesh(
      new THREE.PlaneGeometry(extent.maxX - extent.minX, extent.maxY - extent.minY),
      new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 1 }),
    );
    table.position.set((extent.minX + extent.maxX) / 2, (extent.minY + extent.maxY) / 2, tableZ);
    s.job.add(table);
    const grid = new THREE.GridHelper(
      Math.max(extent.maxX - extent.minX, extent.maxY - extent.minY),
      20,
      0x636363,
      0x4a4a4a,
    );
    grid.rotation.x = Math.PI / 2;
    grid.position.set(table.position.x, table.position.y, tableZ + 0.1);
    s.job.add(grid);
    s.gantry.scale.set(extent.maxX - extent.minX, GANTRY_DEPTH, 60);
    s.gantry.position.x = (extent.minX + extent.maxX) / 2;

    for (const f of fixtures) {
      // From the table up to its top; a screw head as a cylinder.
      const bottom = Math.min(f.max.z - 1, Math.max(f.min.z, tableZ));
      const size = new THREE.Vector3(f.max.x - f.min.x, f.max.y - f.min.y, f.max.z - bottom);
      const geometry = f.round
        ? new THREE.CylinderGeometry(
            Math.min(size.x, size.y) / 2,
            Math.min(size.x, size.y) / 2,
            size.z,
            24,
          ).rotateX(Math.PI / 2)
        : new THREE.BoxGeometry(size.x, size.y, size.z);
      const clamp = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color: warnedZones.has(fixtures.indexOf(f)) ? c.current || '#fe9a00' : 0x8f8f8f,
        }),
      );
      clamp.position.set(f.min.x + size.x / 2, f.min.y + size.y / 2, bottom + size.z / 2);
      s.job.add(clamp);
    }
    for (const hit of collisions) {
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(2, tool.diameter / 2), 16, 12),
        new THREE.MeshBasicMaterial({ color: c.danger || '#fb2c36' }),
      );
      marker.position.set(hit.point.x, hit.point.y, hit.point.z);
      s.job.add(marker);
    }

    // Tool and holder, tip at the group origin.
    s.toolGroup.clear();
    const cutter = new THREE.Mesh(
      new THREE.CylinderGeometry(tool.diameter / 2, tool.diameter / 2, tool.stickout, 24),
      new THREE.MeshStandardMaterial({ color: 0xd0d3d8, metalness: 0.6, roughness: 0.3 }),
    );
    cutter.rotation.x = Math.PI / 2;
    cutter.position.z = tool.stickout / 2;
    const holder = new THREE.Mesh(
      new THREE.CylinderGeometry(tool.holderDiameter / 2, tool.holderDiameter / 2, 40, 24),
      new THREE.MeshStandardMaterial({ color: 0x636363, metalness: 0.4, roughness: 0.5 }),
    );
    holder.rotation.x = Math.PI / 2;
    holder.position.z = tool.stickout + 20;
    s.toolGroup.add(cutter, holder);

    focusRef.current =
      stock ?? (analysis && !isEmptyBounds(analysis.bounds) ? analysis.bounds : null);
    fitCamera();
    s.dirty = true;
    setRemoved(0);
  }, [
    analysis,
    stock,
    stockModel,
    fixtures,
    warnedZones,
    collisions,
    tool,
    profile.travel,
    wcoKey,
  ]);

  /** Looks at the stock (or the job) from the front left. */
  function fitCamera() {
    const s = three.current;
    const focus = focusRef.current;
    if (!s || !focus) return;
    const center = new THREE.Vector3(
      (focus.min.x + focus.max.x) / 2,
      (focus.min.y + focus.max.y) / 2,
      (focus.min.z + focus.max.z) / 2,
    );
    const corner = new THREE.Vector3(focus.max.x, focus.max.y, focus.max.z);
    const radius = Math.max(50, center.distanceTo(corner));
    s.camera.position
      .copy(center)
      .add(new THREE.Vector3(-0.7, -1.4, 1.1).multiplyScalar(radius * 1.6));
    s.controls.target.copy(center);
    s.controls.update();
    s.dirty = true;
  }

  useEffect(() => fitCamera(), [fitRequest]);

  // Tool position, gantry and done colours follow the track.
  useEffect(() => {
    const update = () => {
      const s = three.current;
      if (!s) return;
      const tr = useTrack.getState();
      // The simulated tool while simulating, the machine while it runs the job
      // (the simulation has no position in live mode).
      const p = tr.position ?? tr.live;
      s.toolGroup.visible = p !== null;
      container.current?.setAttribute(
        'data-tool',
        p ? `${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}` : '',
      );
      if (p) {
        s.toolGroup.position.set(p.x, p.y, p.z);
        s.gantry.position.y = p.y;
        s.gantry.position.z = p.z + tool.stickout + GANTRY_CLEARANCE + 30;
      }
      s.gantry.visible = p !== null;
      if (s.paths && s.pathData && tr.done !== s.colorsDone) {
        s.colorsDone = tr.done;
        const c = readColors(container.current!);
        const colors = pathColors(s.pathData, tr.done, {
          rapid: rgb(c.rapid),
          air: rgb(c.air),
          cut: rgb(c.danger),
          done: rgb(c.done),
        });
        const attr = s.paths.geometry.getAttribute('color') as THREE.BufferAttribute;
        (attr.array as Float32Array).set(colors);
        attr.needsUpdate = true;
      }
      s.dirty = true;
    };
    update();
    return useTrack.subscribe(update);
  }, [tool]);

  return (
    <div
      className="stage-3d"
      ref={container}
      data-testid="stage-3d"
      data-removed={Math.round(removed)}
    >
      <div className="stage-3d-info">
        {stock ? (
          <span className="text-muted-foreground text-sm">
            {t('view3d.removed', { cm3: formatNumber(removed / 1000, 1) })}
          </span>
        ) : null}
        {collisions.length > 0 ? (
          <Badge variant="destructive" size="lg" data-testid="stage-3d-collisions">
            {t('view3d.collisions', { count: collisions.length })}
          </Badge>
        ) : null}
        <Button variant="outline" onClick={() => stlInput.current?.click()}>
          {stockModel ? t('view3d.stlLoaded', { name: stockModel.name }) : t('view3d.loadStl')}
        </Button>
        {stockModel ? (
          <Button variant="outline" onClick={() => setStockModel(null)}>
            {t('view3d.removeStl')}
          </Button>
        ) : null}
      </div>
      <input
        ref={stlInput}
        type="file"
        accept=".stl"
        hidden
        data-testid="stl-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          void file.arrayBuffer().then((buffer) => {
            const geometry = new STLLoader().parse(buffer);
            const position = (geometry.index ? geometry.toNonIndexed() : geometry).getAttribute(
              'position',
            );
            setStockModel({
              name: file.name,
              triangles: alignToZero(new Float32Array(position.array)),
            });
          });
        }}
      />
    </div>
  );
}
