import type { JogAxis } from '@lowrider/fluidnc-client';
import { SquareIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import { formatNumber } from '../lib/format';
import { holdStart, withinHold } from '../lib/holds';
import {
  canJog,
  fineStep,
  JOG_STEP_FAR,
  JOG_STEPS,
  quickReason,
  stepDigits,
  wheelSteps,
  type JogStep,
  type QuickAction,
} from '../lib/jog';
import { JOG_KEYS, JOG_STEP_KEYS, keysFree } from '../lib/shortcuts';
import { useJob } from '../store/job';
import {
  goToChange,
  goToPark,
  goToZero,
  jogFine,
  jogHold,
  jogRotary,
  jogStep,
  jogStop,
  useJog,
} from '../store/jog';
import { useMachine } from '../store/machine';
import { useUi } from '../store/ui';
import { useWorkshop } from '../store/workshop';
import { Button, buttonVariants } from '../ui/button';
import { Card } from '../ui/card';
import { SegmentedControl, SegmentedControlItem } from '../ui/segmented-control';
import { Reason } from '../ui/tooltip';
import { cn } from '../ui/utils';
import { HoldButton } from './HoldButton';
import { JogStick } from './JogStick';
import { JogWheel } from './JogWheel';
import { Notice } from './Notice';

/** One way of moving at a time: buttons, handwheel or joystick. */
type JogInput = 'buttons' | 'wheel' | 'stick';
const INPUTS: JogInput[] = ['buttons', 'wheel', 'stick'];

const AXES = ['X', 'Y', 'Z'] as const;

/** Keyboard: arrows for X/Y, Page Up/Down for Z, Escape stops (listed in `lib/shortcuts.ts`). */
const KEYS: Record<string, [JogAxis, 1 | -1]> = JOG_KEYS;

interface JogButtonProps {
  axis: JogAxis;
  direction: 1 | -1;
  step: JogStep;
  className?: string;
}

function JogButton({ axis, direction, step, className }: JogButtonProps) {
  const status = useMachine((s) => s.status);
  const homed = useMachine((s) => s.homed);
  const profile = useJob((s) => s.profile);
  const index = AXES.indexOf(axis);
  const pos = status?.mpos[index];
  const range = profile.travel[axis.toLowerCase() as 'x' | 'y' | 'z'];
  const limited = homed && profile.softLimits && pos !== undefined;
  const remaining = limited ? Math.max(0, direction > 0 ? range.max - pos : pos - range.min) : null;
  const canMove = canJog(status?.state);
  const label = `${axis}${direction > 0 ? '+' : '−'}`;
  const continuous = step === 'continuous';
  // Continuous jog runs only while the finger is on the button: it stops when
  // the finger lifts or slides off, when the system takes the touch and when
  // the app goes to the background (the action layer registers it as a hold).
  const holding = useRef<(() => void) | null>(null);
  const stop = () => {
    holding.current?.();
    holding.current = null;
  };
  useEffect(() => stop, []);
  const blocked = !canMove || (remaining !== null && remaining < 0.001);
  // A button that goes grey under the finger gets no pointerup any more.
  useEffect(() => {
    if (blocked) stop();
  });
  return (
    <button
      type="button"
      className={cn(
        buttonVariants({ variant: 'outline', size: 'xl' }),
        'jog',
        `jog-axis-${axis.toLowerCase()}`,
        className,
      )}
      disabled={blocked}
      onClick={() => {
        if (!continuous) jogStep(axis, direction);
      }}
      onPointerDown={(e) => {
        if (!continuous || holding.current) return;
        // Keep receiving moves when the finger slips over the edge.
        e.currentTarget.setPointerCapture?.(e.pointerId);
        holding.current = jogHold(axis, direction);
      }}
      onPointerMove={(e) => {
        if (!holding.current) return;
        if (!withinHold(e.currentTarget.getBoundingClientRect(), e.clientX, e.clientY)) stop();
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="jog-label">{label}</span>
      {remaining !== null ? (
        <span className="jog-hint">
          {t('drive.remaining', { distance: shortDistance(remaining) })}
        </span>
      ) : null}
    </button>
  );
}

/**
 * The rotary axis A, where the machine has one: a step to either side, in
 * degrees (the step width's number; continuous: 1°). Prepared only – A has
 * no limits and no continuous jog here.
 */
function RotaryJog({ step }: { step: JogStep }) {
  const canMove = useMachine((s) => canJog(s.status?.state));
  const degrees = step === 'continuous' ? 1 : step;
  return (
    <div className="jog-rotary" data-testid="jog-rotary">
      {([-1, 1] as const).map((direction) => (
        <Button
          reason="machine"
          key={direction}
          variant="outline"
          size="xl"
          className="jog jog-axis-a flex-1"
          disabled={!canMove}
          onClick={() => jogRotary(direction)}
        >
          <span className="jog-label">A{direction > 0 ? '+' : '−'}</span>
          <span className="jog-hint">{formatNumber(degrees, stepDigits(degrees))}°</span>
        </Button>
      ))}
    </div>
  );
}

/** A distance that fits under a jog button: tenths below 100 mm, whole mm up to a metre, then metres. */
function shortDistance(mm: number): string {
  if (mm >= 1000) return `${formatNumber(mm / 1000, 2)} m`;
  return `${formatNumber(mm, mm < 100 ? 1 : 0)} mm`;
}

/** Keyboard jogging while the jog panel is open and no text field has the focus. */
function useKeyboardJog(step: JogStep, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    // Not while something is typed, and not while a dialog (the quick search, the key
    // overview, a tool change) has the keys.
    const typing = (e: KeyboardEvent) => !keysFree(e.target, document);
    let held: (() => void) | null = null;
    const release = () => {
      held?.();
      held = null;
    };
    const down = (e: KeyboardEvent) => {
      if (typing(e)) return;
      if (e.key === 'Escape') {
        release();
        jogStop();
        return;
      }
      // A key with Ctrl, Cmd or Alt belongs to something else (Ctrl+→: the next step).
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // 1–5 choose the step width; they move nothing.
      const width = JOG_STEP_KEYS[e.key];
      if (width !== undefined) {
        e.preventDefault();
        if (!e.repeat) useJog.getState().setStep(width);
        return;
      }
      const key = KEYS[e.key];
      if (!key) return;
      e.preventDefault();
      if (e.repeat) return;
      if (step === 'continuous') {
        // A key held while the window loses the focus never gets its keyup: the hold lets go.
        release();
        held = jogHold(key[0], key[1]);
      } else jogStep(key[0], key[1]);
    };
    const up = (e: KeyboardEvent) => {
      // A key that is let go always stops what it started, whatever has the keys by now.
      if (step === 'continuous' && KEYS[e.key] && (held || !typing(e))) {
        release();
        jogStop();
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      release();
    };
  }, [step, enabled]);
}

/**
 * Gamepad: left stick X/Y and right stick Z jog continuously (speed by
 * deflection), the D-pad and shoulder buttons jog one step, B stops.
 */
function useGamepadJog(enabled: boolean): string | null {
  const [pad, setPad] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !navigator.getGamepads) return;
    let frame = 0;
    let active: { axis: JogAxis; dir: 1 | -1 } | null = null;
    let held: (() => void) | null = null;
    const pressed = new Set<number>();
    const loop = () => {
      const gp = [...navigator.getGamepads()].find((g) => g !== null) ?? null;
      setPad((prev) => (prev === (gp?.id ?? null) ? prev : (gp?.id ?? null)));
      if (gp) {
        const sticks: [JogAxis, number][] = [
          ['X', gp.axes[0] ?? 0],
          ['Y', -(gp.axes[1] ?? 0)],
          ['Z', -(gp.axes[3] ?? 0)],
        ];
        const [axis, value] = sticks.reduce((a, b) => (Math.abs(b[1]) > Math.abs(a[1]) ? b : a));
        const want = Math.abs(value) > 0.5 ? { axis, dir: (value > 0 ? 1 : -1) as 1 | -1 } : null;
        if (want?.axis !== active?.axis || want?.dir !== active?.dir) {
          // A stick still held when the app goes to the background lets go there (the hold).
          held?.();
          held = want ? jogHold(want.axis, want.dir, Math.abs(value) > 0.9 ? 1 : 0.4) : null;
          active = want;
        }
        const buttons: [number, JogAxis, 1 | -1][] = [
          [12, 'Y', 1],
          [13, 'Y', -1],
          [14, 'X', -1],
          [15, 'X', 1],
          [5, 'Z', 1],
          [4, 'Z', -1],
        ];
        for (const [b, ax, dir] of buttons) {
          const down = gp.buttons[b]?.pressed ?? false;
          if (down && !pressed.has(b)) jogStep(ax, dir);
          if (down) pressed.add(b);
          else pressed.delete(b);
        }
        if (gp.buttons[1]?.pressed) jogStop();
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      held?.();
    };
  }, [enabled]);
  return pad;
}

const FINE_POINTER = '(hover: hover) and (pointer: fine)';

/**
 * Fine jog with the mouse wheel (DESIGN.md §8): the axis moved last, one fine
 * step per notch. A wheel turns by accident, so it only counts while the
 * mouse button is held on this field – a hold like every other: it lets go
 * when the button is released, the pointer slides off or the app is left.
 * Shown only where there is a mouse.
 */
function WheelFine({ step, canMove }: { step: JogStep; canMove: boolean }) {
  const axis = useJog((s) => s.lastAxis);
  const [mouse, setMouse] = useState(() => matchMedia(FINE_POINTER).matches);
  const [armed, setArmed] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const hold = useRef<(() => void) | null>(null);
  const rest = useRef(0);
  useEffect(() => {
    const list = matchMedia(FINE_POINTER);
    const update = () => setMouse(list.matches);
    list.addEventListener('change', update);
    // A mouse that is used is there, whatever the device says about itself.
    const seen = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') setMouse(true);
    };
    window.addEventListener('pointermove', seen);
    return () => {
      list.removeEventListener('change', update);
      window.removeEventListener('pointermove', seen);
    };
  }, []);
  const disarm = () => {
    hold.current?.();
    hold.current = null;
    rest.current = 0;
    setArmed(false);
  };
  useEffect(() => disarm, []);
  const reason = !canMove ? t('jog.reason.busy') : axis === null ? t('jog.wheel.noAxis') : null;
  useEffect(() => {
    if (reason) disarm();
  });
  // React listens to wheel passively; the page must not scroll under an armed wheel.
  useEffect(() => {
    const el = button.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (!hold.current) return;
      e.preventDefault();
      const turned = wheelSteps(rest.current, e.deltaY, e.deltaMode);
      rest.current = turned.rest;
      if (turned.steps !== 0) jogFine(turned.steps);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [mouse]);
  if (!mouse) return null;
  const width = fineStep(step);
  return (
    <Reason reason={reason} className="w-full">
      <button
        ref={button}
        type="button"
        className={cn(buttonVariants({ variant: 'outline', size: 'xl' }), 'wheel-fine')}
        disabled={reason !== null}
        aria-pressed={armed}
        data-testid="wheel-fine"
        data-find="wheel-fine"
        onPointerDown={(e) => {
          if (e.pointerType !== 'mouse' || e.button !== 0 || hold.current) return;
          e.currentTarget.setPointerCapture?.(e.pointerId);
          hold.current = holdStart(disarm);
          setArmed(true);
        }}
        onPointerMove={(e) => {
          if (!hold.current) return;
          if (!withinHold(e.currentTarget.getBoundingClientRect(), e.clientX, e.clientY)) disarm();
        }}
        onPointerUp={disarm}
        onPointerCancel={disarm}
        onLostPointerCapture={disarm}
        onBlur={disarm}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span className="jog-label">
          {axis
            ? t('jog.wheel.title', {
                axis,
                step: formatNumber(width, stepDigits(width)),
              })
            : t('jog.wheel.titleNoAxis')}
        </span>
        <span className="jog-hint">{t(armed ? 'jog.wheel.armed' : 'jog.wheel.hint')}</span>
      </button>
    </Reason>
  );
}

/** The quick actions (DESIGN.md §5): each moves the machine, so each is a hold. */
function QuickActions() {
  const connected = useMachine((s) => s.connection === 'connected');
  const state = useMachine((s) => s.status?.state);
  const homed = useMachine((s) => s.homed);
  const zeroSet = useMachine((s) => (s.status?.wco ?? []).some((v) => v !== 0));
  const park = useWorkshop((s) => s.settings.parkPosition);
  const change = useWorkshop((s) => s.settings.toolChangePosition);
  const quick = { connected, state, homed, zeroSet, park: park !== null, change: change !== null };
  const actions: [QuickAction, string, () => void][] = [
    ['zero', t('jog.quick.zero'), () => void goToZero()],
    ['park', t('jog.quick.park'), () => void goToPark()],
    // Only where there is a place to go to: no button that can never work
    ...(change !== null
      ? [
          ['change', t('jog.quick.change'), () => void goToChange()] as [
            QuickAction,
            string,
            () => void,
          ],
        ]
      : []),
    ['home', t('jog.quick.home'), () => void useMachine.getState().home()],
  ];
  return (
    <div
      className="jog-quick"
      data-count={actions.length}
      role="group"
      aria-label={t('jog.quick.label')}
      data-testid="jog-quick"
      data-find="jog-quick"
    >
      {actions.map(([id, label, run]) => {
        const reason = quickReason(id, quick);
        return (
          <Reason key={id} reason={reason ? t(reason) : null} className="min-w-0 flex-1">
            <span className="contents" data-testid={`quick-${id}`}>
              <HoldButton disabled={reason !== null} onConfirm={run}>
                {label}
              </HoldButton>
            </span>
          </Reason>
        );
      })}
    </div>
  );
}

export function JogCard() {
  const connection = useMachine((s) => s.connection);
  const canMove = useMachine((s) => canJog(s.status?.state));
  const homed = useMachine((s) => s.homed);
  const homedAxes = useMachine((s) => s.homedAxes);
  const profile = useJob((s) => s.profile);
  const go = useUi((s) => s.go);
  const deep = useUi((s) => (s.depth.jog ?? 'simple') !== 'simple');
  const step = useJog((s) => s.step);
  const setStep = useJog((s) => s.setStep);
  const [input, setInput] = useState<JogInput>('buttons');
  const online = connection === 'connected';
  useKeyboardJog(step, online);
  const pad = useGamepadJog(online);
  const toProfile = (
    <Button variant="outline" size="sm" onClick={() => go('settings', 'machine')}>
      {t('ready.toProfile')}
    </Button>
  );
  const steps: JogStep[] = [...JOG_STEPS];
  // The long step and the other ways of moving belong to "Mehr Optionen"; what is chosen stays in sight.
  if (deep || step === JOG_STEP_FAR) steps.push(JOG_STEP_FAR);
  const showInputs = deep || input !== 'buttons';

  return (
    <Card
      render={<section />}
      className="jog-card gap-3 p-4"
      aria-label={t('drive.jog')}
      data-find="jog"
    >
      <div className="jog-notices">
        {!online ? <Notice>{t('jog.reason.offline')}</Notice> : null}
        {online && !homed ? (
          <Notice>
            {homedAxes
              ? t('drive.homedPartly', {
                  axes: homedAxes,
                  missing: [...'XYZ'].filter((a) => !homedAxes.includes(a)).join(', '),
                })
              : t('drive.notHomed')}
          </Notice>
        ) : null}
        {online && homed && !profile.softLimits ? (
          <Notice action={toProfile}>{t('drive.limitsOff')}</Notice>
        ) : null}
        {profile.placeholder ? (
          <Notice action={toProfile}>{t('drive.travelPlaceholder')}</Notice>
        ) : null}
      </div>
      {showInputs ? (
        <SegmentedControl
          className="w-full flex-wrap *:flex-auto"
          role="group"
          aria-label={t('drive.input')}
        >
          {INPUTS.map((i) => (
            <SegmentedControlItem key={i} pressed={input === i} onClick={() => setInput(i)}>
              {t(`drive.inputs.${i}`)}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
      ) : null}
      <div className="jog-main">
        <div className="jog-move">
          {input === 'buttons' ? (
            <>
              <div className="jogpad">
                <JogButton axis="Y" direction={1} step={step} className="jog-yp" />
                <JogButton axis="X" direction={-1} step={step} className="jog-xm" />
                <JogButton axis="X" direction={1} step={step} className="jog-xp" />
                <JogButton axis="Y" direction={-1} step={step} className="jog-ym" />
                <JogButton axis="Z" direction={1} step={step} className="jog-zp" />
                <JogButton axis="Z" direction={-1} step={step} className="jog-zm" />
                {/* In the middle of the cross, where a pendant has it; Esc does the same. */}
                <Button
                  reason="machine"
                  variant="outline"
                  size="xl"
                  className="jog-stop"
                  disabled={!online}
                  aria-label={t('drive.jogStop')}
                  onClick={jogStop}
                >
                  <SquareIcon aria-hidden="true" />
                  {t('jog.stop')}
                </Button>
              </div>
              {profile.hasRotary ? <RotaryJog step={step} /> : null}
            </>
          ) : null}
          {input === 'wheel' ? (
            <JogWheel step={step === 'continuous' ? 0.1 : step} disabled={!online} />
          ) : null}
          {input === 'stick' ? (
            <div className="jogstick-wrap">
              <JogStick disabled={!online} />
              <p className="text-muted-foreground text-sm">{t('stick.hint')}</p>
            </div>
          ) : null}
        </div>
        <div className="jog-side">
          {input !== 'stick' ? (
            <SegmentedControl
              className="jog-steps w-full flex-wrap *:flex-auto"
              role="group"
              aria-label={t('drive.step')}
            >
              {steps.map((s) =>
                s === 'continuous' ? null : (
                  <SegmentedControlItem key={s} pressed={step === s} onClick={() => setStep(s)}>
                    {formatNumber(s, stepDigits(s))} mm
                  </SegmentedControlItem>
                ),
              )}
              {input === 'buttons' ? (
                <SegmentedControlItem
                  pressed={step === 'continuous'}
                  onClick={() => setStep('continuous')}
                >
                  {t('drive.continuous')}
                </SegmentedControlItem>
              ) : null}
            </SegmentedControl>
          ) : null}
          {input === 'buttons' && step === 'continuous' ? (
            <p className="text-muted-foreground text-sm">{t('drive.continuousHint')}</p>
          ) : null}
          <QuickActions />
          {input !== 'buttons' ? (
            <Button reason="machine" variant="outline" disabled={!online} onClick={jogStop}>
              {t('drive.jogStop')}
            </Button>
          ) : null}
          <WheelFine step={step} canMove={online && canMove} />
        </div>
      </div>
      <p className="kbd-hint text-muted-foreground text-sm">
        {t('drive.keyboardHint')}
        {pad ? ` ${t('drive.gamepad', { name: pad })}` : ''}
      </p>
    </Card>
  );
}
