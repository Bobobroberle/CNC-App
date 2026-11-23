import { useEffect, useRef } from 'react';
import { t } from '../i18n';
import { CHUNK_MM, fitView, frameCorners, toScreen, type Rect } from '../lib/photomap';
import { cameraElement, pictureSize } from '../store/camera';
import { useJob } from '../store/job';
import { useMachine } from '../store/machine';
import { mapChunks } from '../store/photomap';
import { useWorkshop } from '../store/workshop';

/** Width of the overview, CSS px; the height follows the machine's travel */
const WIDTH = 96;
/** The overview only needs a few updates a second */
const REFRESH_MS = 200;

/** Machine travel as a box. */
function travelRect(): Rect {
  const { x, y } = useJob.getState().profile.travel;
  return { minX: x.min, minY: y.min, maxX: x.max, maxY: y.max };
}

/** The job's cut area in machine XY, or null without a job or work offset. */
function jobRect(): Rect | null {
  const analysis = useJob.getState().analysis;
  const wco = useMachine.getState().status?.wco;
  const b = analysis?.cutBounds;
  if (!b || !wco || b.min.x > b.max.x) return null;
  const [ox = 0, oy = 0] = wco;
  return { minX: b.min.x + ox, minY: b.min.y + oy, maxX: b.max.x + ox, maxY: b.max.y + oy };
}

function colors(el: Element) {
  const css = getComputedStyle(el);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    surface: v('--stage-surface', '#262626'),
    line: v('--stage-line', '#404040'),
    text: v('--stage-text', '#f5f5f5'),
    danger: v('--stage-cut', '#fb2c36'),
    current: v('--stage-current', '#fe9a00'),
  };
}

/** Height for the travel's aspect, kept within sensible bounds. */
function heightFor(r: Rect): number {
  const aspect = (r.maxY - r.minY) / Math.max(1, r.maxX - r.minX);
  return Math.round(Math.min(112, Math.max(64, WIDTH * aspect)));
}

/**
 * Small overview in the corner of the live picture: machine table, job,
 * pictures of the photo map, where the camera looks and the tool. A tap
 * goes back to the table view.
 */
export function MiniMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const setView = useJob((s) => s.setView);
  const height = heightFor(travelRect());

  useEffect(() => {
    let palette: ReturnType<typeof colors> | null = null;
    const draw = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
      if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
      const c = (palette ??= colors(canvas));
      const travel = travelRect();
      const fit = fitView(travel, { width: w, height: h }, 6);
      const v = { scale: fit.scale * dpr, originX: fit.originX * dpr, originY: fit.originY * dpr };
      const rect = (r: Rect) => {
        const a = toScreen(v, { x: r.minX, y: r.maxY });
        const b = toScreen(v, { x: r.maxX, y: r.minY });
        return [a.x, a.y, b.x - a.x, b.y - a.y] as const;
      };
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = c.surface;
      ctx.fillRect(...rect(travel));
      for (const ch of mapChunks()) {
        const a = toScreen(v, { x: ch.cx * CHUNK_MM, y: (ch.cy + 1) * CHUNK_MM });
        const size = CHUNK_MM * v.scale;
        ctx.drawImage(ch.canvas, a.x, a.y, size, size);
      }
      ctx.lineWidth = dpr;
      ctx.strokeStyle = c.line;
      ctx.strokeRect(...rect(travel));
      const job = jobRect();
      if (job) {
        ctx.strokeStyle = c.danger;
        ctx.lineWidth = 1.5 * dpr;
        ctx.strokeRect(...rect(job));
      }
      const s = useMachine.getState().status;
      const el = cameraElement();
      const sp = s ? { x: s.mpos[0] ?? 0, y: s.mpos[1] ?? 0 } : null;
      if (sp && el && pictureSize(el).width) {
        const corners = frameCorners(
          useWorkshop.getState().settings.camera,
          sp,
          pictureSize(el),
          1,
        ).map((p) => toScreen(v, p));
        ctx.beginPath();
        corners.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath();
        ctx.strokeStyle = c.current;
        ctx.lineWidth = 2 * dpr;
        ctx.stroke();
      }
      if (sp) {
        const p = toScreen(v, sp);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = c.text;
        ctx.fill();
      }
    };
    draw();
    const timer = setInterval(draw, REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <button
      type="button"
      className="stage-inset"
      data-testid="camera-mini"
      aria-label={t('stage.mini')}
      title={t('stage.mini')}
      onClick={() => setView('table')}
    >
      <canvas ref={canvasRef} style={{ width: WIDTH, height }} aria-hidden="true" />
    </button>
  );
}
