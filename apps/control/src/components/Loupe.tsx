import { useEffect, useRef, useState, type ReactNode } from 'react';
import { t } from '../i18n';
import type { Point } from '../lib/camera';
import { formatNumber } from '../lib/format';
import { holdStart } from '../lib/holds';
import { Button } from '../ui/button';

/** Side of the loupe, CSS px */
export const LOUPE_SIZE = 164;
/** Magnification of the loupe, px per mm: it shows about 14 mm of the table */
export const LOUPE_SCALE = 12;
/** Fine steps of the nudge pad, mm */
export const NUDGE_STEPS = [0.1, 1] as const;

/**
 * Paints what lies around a machine point into the loupe: `scale` px per mm,
 * the point in the middle of a `size` × `size` canvas (CSS px, times `dpr`),
 * machine +Y up. The stage view that is shown provides it – the table its
 * photo map and drawing, the camera its live picture.
 */
export type LoupeSource = (
  ctx: CanvasRenderingContext2D,
  centre: Point,
  scale: number,
  size: number,
  dpr: number,
) => void;

let source: LoupeSource | null = null;

/** Called by the stage view that is on screen; returns how to take it back. */
export function provideLoupe(next: LoupeSource): () => void {
  source = next;
  return () => {
    if (source === next) source = null;
  };
}

/**
 * The surroundings of a tapped point, magnified, with a crosshair on the
 * point. Dragging inside moves the picture under the crosshair – the point
 * moves by a twelfth of the finger's way, so a fingertip places it to a
 * tenth of a millimetre. It moves a mark only, never the machine.
 */
export function Loupe({ point, onMove }: { point: Point; onMove: (to: Point) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef(point);
  latest.current = point;
  const move = useRef(onMove);
  move.current = onMove;
  const drag = useRef<{ id: number; x: number; y: number; from: Point; end: () => void } | null>(
    null,
  );

  useEffect(() => {
    let frame = requestAnimationFrame(function paint() {
      const el = canvas.current;
      const ctx = el?.getContext('2d');
      if (el && ctx) {
        const dpr = window.devicePixelRatio || 1;
        const px = Math.round(LOUPE_SIZE * dpr);
        if (el.width !== px) el.width = px;
        if (el.height !== px) el.height = px;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, px, px);
        ctx.save();
        source?.(ctx, latest.current, LOUPE_SCALE, LOUPE_SIZE, dpr);
        ctx.restore();
        // The crosshair: open in the middle, so the corner under it stays visible.
        const css = getComputedStyle(el);
        const mid = LOUPE_SIZE / 2;
        const cross = new Path2D();
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          cross.moveTo(mid + dx * 5, mid + dy * 5);
          cross.lineTo(mid + dx * (mid - 6), mid + dy * (mid - 6));
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.lineCap = 'round';
        ctx.strokeStyle = css.getPropertyValue('--stage-bg').trim() || '#161616';
        ctx.lineWidth = 3.5;
        ctx.stroke(cross);
        ctx.strokeStyle = css.getPropertyValue('--stage-current').trim() || '#fe9a00';
        ctx.lineWidth = 1.5;
        ctx.stroke(cross);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fillRect(mid - 0.75, mid - 0.75, 1.5, 1.5);
      }
      frame = requestAnimationFrame(paint);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const end = () => {
    drag.current?.end();
    drag.current = null;
  };
  useEffect(() => end, []);

  return (
    <canvas
      ref={canvas}
      className="loupe"
      data-testid="loupe"
      data-no-gesture
      data-no-swipe
      role="img"
      aria-label={t('stageTools.loupe')}
      title={t('stageTools.loupe')}
      style={{ width: LOUPE_SIZE, height: LOUPE_SIZE }}
      onPointerDown={(e) => {
        if (drag.current) return;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        drag.current = {
          id: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          from: latest.current,
          end: holdStart(() => (drag.current = null)),
        };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (d?.id !== e.pointerId) return;
        // The picture follows the finger, so the point goes the other way.
        move.current({
          x: d.from.x - (e.clientX - d.x) / LOUPE_SCALE,
          y: d.from.y + (e.clientY - d.y) / LOUPE_SCALE,
        });
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
    />
  );
}

const ARROWS = [
  { key: 'up', glyph: '↑', dx: 0, dy: 1 },
  { key: 'left', glyph: '←', dx: -1, dy: 0 },
  { key: 'down', glyph: '↓', dx: 0, dy: -1 },
  { key: 'right', glyph: '→', dx: 1, dy: 0 },
] as const;

/**
 * Four arrows, laid out like the arrow keys, that shift a tapped point by a
 * fine step – and the step beside them (a tap switches between 0.1 and 1 mm).
 * The corner that the arrow keys leave free can hold one more button.
 */
export function NudgePad({
  point,
  onMove,
  corner,
}: {
  point: Point;
  onMove: (to: Point) => void;
  /** What sits in the free corner beside "up" (the tool's "discard") */
  corner?: ReactNode;
}) {
  const [step, setStep] = useState<(typeof NUDGE_STEPS)[number]>(NUDGE_STEPS[0]);
  const other = NUDGE_STEPS[step === NUDGE_STEPS[0] ? 1 : 0];
  return (
    <div className="nudge" role="group" aria-label={t('stageTools.nudge.label')} data-no-swipe>
      <Button
        variant="outline"
        className="nudge-step tabular-nums"
        aria-label={t('stageTools.nudge.step', {
          mm: formatNumber(step, 1),
          other: formatNumber(other, 1),
        })}
        onClick={() => setStep(other)}
      >
        {formatNumber(step, 1)} mm
      </Button>
      {ARROWS.map((a) => (
        <Button
          key={a.key}
          variant="outline"
          className={`nudge-${a.key}`}
          aria-label={t(`stageTools.nudge.${a.key}`)}
          onClick={() => onMove({ x: point.x + a.dx * step, y: point.y + a.dy * step })}
        >
          {a.glyph}
        </Button>
      ))}
      {corner ? <span className="nudge-corner">{corner}</span> : null}
    </div>
  );
}
