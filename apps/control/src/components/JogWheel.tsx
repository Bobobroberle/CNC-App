import type { JogAxis } from '@lowrider/fluidnc-client';
import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import { formatNumber } from '../lib/format';
import { Spring, SPRINGS } from '../lib/spring';
import { jogStep } from '../store/jog';
import { SegmentedControl, SegmentedControlItem } from '../ui/segmented-control';

/** Degrees of rotation per jog step, like the detents of a handwheel. */
const DETENT = 24;

/**
 * Touch handwheel: turning clockwise jogs the chosen axis in + by one step per
 * detent. Each step flashes the knob; on release the wheel settles into the
 * last detent that was sent, so what you see is what the machine got.
 */
export function JogWheel({ step, disabled }: { step: number; disabled: boolean }) {
  const [axis, setAxis] = useState<JogAxis>('X');
  const [angle, setAngle] = useState(0);
  const [pulse, setPulse] = useState(0);
  const last = useRef<number | null>(null);
  /** Part of a detent turned since the last step */
  const accumulated = useRef(0);
  /** Rotation at the last step sent */
  const committed = useRef(0);
  const ref = useRef<SVGSVGElement>(null);
  const settle = useRef<Spring | null>(null);
  settle.current ??= new Spring(0, (a) => setAngle(committed.current + a));
  useEffect(() => () => settle.current?.stop(), []);

  const angleAt = (e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    return (
      (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) /
      Math.PI
    );
  };

  /** Hand off: an unfinished detent is dropped and springs back. */
  const release = () => {
    if (last.current === null) return;
    last.current = null;
    const rest = accumulated.current;
    accumulated.current = 0;
    settle.current!.set(rest);
    settle.current!.to(0, { config: SPRINGS.snappy });
  };

  return (
    <div className="jogwheel">
      <SegmentedControl role="group" aria-label={t('drive.wheelAxis')}>
        {(['X', 'Y', 'Z'] as const).map((a) => (
          <SegmentedControlItem key={a} pressed={axis === a} onClick={() => setAxis(a)}>
            {a}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
      <svg
        ref={ref}
        viewBox="-100 -100 200 200"
        className={`wheel${disabled ? ' disabled' : ''}`}
        role="slider"
        aria-label={t('drive.wheel')}
        aria-valuetext={`${axis} ${formatNumber(step, step < 0.1 ? 2 : step < 1 ? 1 : 0)} mm`}
        onPointerDown={(e) => {
          if (disabled) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          // Grabbing a settling wheel takes it where it is.
          settle.current!.stop();
          accumulated.current = 0;
          last.current = angleAt(e);
        }}
        onPointerMove={(e) => {
          if (last.current === null) return;
          const a = angleAt(e);
          let delta = a - last.current;
          if (delta > 180) delta -= 360;
          if (delta < -180) delta += 360;
          last.current = a;
          accumulated.current += delta;
          let stepped = false;
          while (Math.abs(accumulated.current) >= DETENT) {
            const dir = accumulated.current > 0 ? 1 : -1;
            accumulated.current -= dir * DETENT;
            committed.current += dir * DETENT;
            jogStep(axis, dir, step);
            stepped = true;
          }
          if (stepped) setPulse((p) => p + 1);
          setAngle(committed.current + accumulated.current);
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
      >
        <circle r="96" className="wheel-ring" />
        {Array.from({ length: 360 / DETENT }, (_, i) => (
          <line
            key={i}
            x1="0"
            y1="-96"
            x2="0"
            y2="-84"
            className="wheel-tick"
            transform={`rotate(${i * DETENT + angle})`}
          />
        ))}
        <circle
          key={pulse}
          r="18"
          cx="0"
          cy="-58"
          className={`wheel-knob${pulse > 0 ? ' pulse' : ''}`}
          transform={`rotate(${angle})`}
        />
        <text y="10" textAnchor="middle" className="wheel-label">
          {axis}
        </text>
      </svg>
    </div>
  );
}
