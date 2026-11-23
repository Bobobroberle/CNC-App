import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import { holdStart } from '../lib/holds';
import { STICK_DEAD_ZONE } from '../lib/motion';
import { rubberband, Spring, SPRINGS } from '../lib/spring';
import { jogStick, jogStickStop } from '../store/jog';

const RADIUS = 60;
const KNOB = 64;
/** Ring the knob's edge must leave before the machine moves. */
const ZONE = KNOB + 2 * STICK_DEAD_ZONE * RADIUS;

/**
 * Touch joystick for X/Y: the further the knob is pulled, the faster the
 * machine moves; letting go stops it at once (jog cancel). The knob follows
 * the finger from the first touch, gives way softly past full speed and
 * springs home on release – only the knob, the machine stops immediately.
 */
export function JogStick({ disabled }: { disabled: boolean }) {
  const knob = useRef<HTMLSpanElement>(null);
  const centre = useRef<{ x: number; y: number } | null>(null);
  const [live, setLive] = useState(false);

  // X and Y spring independently, so a diagonal return stays straight.
  const springs = useRef<{ x: Spring; y: Spring } | null>(null);
  springs.current ??= (() => {
    const draw = () => {
      const s = springs.current;
      if (s && knob.current)
        knob.current.style.transform = `translate(${s.x.value}px, ${s.y.value}px)`;
    };
    return { x: new Spring(0, draw), y: new Spring(0, draw) };
  })();
  useEffect(
    () => () => {
      // Taken off the screen in mid-pull: the machine stops as on release.
      if (centre.current) {
        held.current?.();
        jogStickStop();
      }
      springs.current?.x.stop();
      springs.current?.y.stop();
    },
    [],
  );

  const follow = (clientX: number, clientY: number) => {
    const c = centre.current;
    if (!c) return;
    const dx = clientX - c.x;
    const dy = clientY - c.y;
    const d = Math.hypot(dx, dy);
    // Speed is capped at the rim; the knob itself rubber-bands a little further.
    const shown = d > RADIUS ? RADIUS + rubberband(d - RADIUS, RADIUS) : d;
    const k = d > 0 ? shown / d : 0;
    springs.current!.x.set(dx * k);
    springs.current!.y.set(dy * k);
    const reach = Math.min(1, d / RADIUS);
    setLive(reach >= STICK_DEAD_ZONE);
    const n = d > 0 ? reach / d : 0;
    jogStick(dx * n, -dy * n);
  };

  /** The finger that steers */
  const pointer = useRef<number | null>(null);
  const own = (fn: () => void) => (e: { pointerId: number }) => {
    if (e.pointerId === pointer.current) fn();
  };
  /** Ends the registration as a hold (`lib/holds.ts`) */
  const held = useRef<(() => void) | null>(null);
  const release = () => {
    if (!centre.current) return;
    centre.current = null;
    held.current?.();
    held.current = null;
    jogStickStop();
    setLive(false);
    springs.current!.x.to(0, { config: SPRINGS.snappy });
    springs.current!.y.to(0, { config: SPRINGS.snappy });
  };

  return (
    <div
      className={`jogstick${disabled ? ' disabled' : ''}${live ? ' live' : ''}`}
      role="application"
      aria-label={t('stick.label')}
      data-testid="jogstick"
      onPointerDown={(e) => {
        // One finger steers; a second one on the stick changes nothing.
        if (disabled || centre.current) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        pointer.current = e.pointerId;
        held.current = holdStart(release);
        const r = e.currentTarget.getBoundingClientRect();
        centre.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        follow(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (e.pointerId === pointer.current) follow(e.clientX, e.clientY);
      }}
      onPointerUp={own(release)}
      onPointerCancel={own(release)}
      onLostPointerCapture={own(release)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="jogstick-zone" aria-hidden="true" style={{ width: ZONE, height: ZONE }} />
      <span className="jogstick-knob" ref={knob} />
      <span className="jogstick-label">XY</span>
    </div>
  );
}
