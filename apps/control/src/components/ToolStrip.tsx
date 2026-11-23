import { t } from '../i18n';
import { formatNumber } from '../lib/format';
import { FOCUS_TOLERANCE, focusError, useCamera } from '../store/camera';
import { useJob } from '../store/job';
import { useMachine } from '../store/machine';
import { cameraCalibrated } from '../store/photomap';
import { useStageTools } from '../store/tools';
import { useUi } from '../store/ui';
import { useWorkshop } from '../store/workshop';
import { HoldButton } from './HoldButton';
import { Icon } from './Icon';
import { JogStick } from './JogStick';
import { activeTool, STAGE_TOOLS } from './StageTools';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';

/**
 * What a tap on the stage does right now:
 * `tools` – it goes to the active tool; `flat` – the table is seen from the
 * side or unwrapped, where a tap has no X/Y; `setup` – the camera is being
 * set up and taps measure it; `off` – no picture; `uncalibrated` – the
 * picture cannot give machine points yet.
 */
type TapState = 'tools' | 'flat' | 'setup' | 'off' | 'uncalibrated';

function useTapState(): TapState {
  const view = useJob((s) => s.view);
  const projection = useJob((s) => s.projection);
  const tapMode = useCamera((s) => s.tapMode);
  const source = useCamera((s) => s.source);
  const calibrated = useWorkshop((s) => cameraCalibrated(s.settings.camera));
  if (view === 'table') return projection === 'top' ? 'tools' : 'flat';
  if (!source) return 'off';
  if (tapMode) return 'setup';
  return calibrated ? 'tools' : 'uncalibrated';
}

/**
 * The row under the mode switch: the tap tools, the same on the table and on
 * the camera picture, and the joystick switch. Where a tap cannot give a
 * point, the row says why and offers the way out instead.
 */
export function ToolStrip() {
  const state = useTapState();
  const projection = useJob((s) => s.projection);
  const tapMode = useCamera((s) => s.tapMode);
  const active = useStageTools((s) => s.active);
  const stick = useUi((s) => s.stageStick);
  const setStick = useUi((s) => s.setStageStick);
  const beside = useUi((s) => s.place === 'setup' && s.views.setup === 'camera' && !s.jogOpen);
  const select = (id: string) => {
    useStageTools.getState().select(id);
  };

  return (
    <div className="tool-strip" data-testid="tool-strip">
      {state === 'tools' ? (
        <div className="tool-buttons" role="group" aria-label={t('stageTools.label')}>
          {STAGE_TOOLS.map((tool) => (
            <Button
              key={tool.id}
              variant="outline"
              className="tool"
              pressed={active === tool.id}
              data-find={`tool-${tool.id}`}
              onClick={() => select(tool.id)}
            >
              <Icon name={tool.icon} size={22} />
              <span>{t(tool.label)}</span>
            </Button>
          ))}
        </div>
      ) : null}
      {state === 'flat' ? (
        <div className="tool-note">
          <p className="text-muted-foreground text-sm">
            {t(projection === 'side' ? 'stageTools.sideView' : 'stageTools.unwrappedView')}
          </p>
          <Button variant="outline" onClick={() => useJob.getState().setProjection('top')}>
            {t('stageTools.toTop')}
          </Button>
        </div>
      ) : null}
      {state === 'setup' && tapMode ? (
        <div className="tool-note">
          <p className="text-muted-foreground text-sm">
            {t('stageTools.settingUp', { mode: t(`camera.modes.${tapMode}`) })}
          </p>
          <Button variant="outline" onClick={() => useCamera.getState().setTapMode(null)}>
            {t('stageTools.settingUpDone')}
          </Button>
        </div>
      ) : null}
      {state === 'uncalibrated' ? (
        <div className="tool-note" data-testid="stage-setup-cta">
          <p className="text-muted-foreground text-sm">{t('stageTools.setupNeeded')}</p>
          {/* Fahren → Kamera offers the same step right beside the stage: one call, not two. */}
          {beside ? null : (
            <Button variant="outline" onClick={() => useUi.getState().openSetup('camera')}>
              {t('camera.setupTitle')}
            </Button>
          )}
        </div>
      ) : null}
      <Button
        variant="outline"
        className="tool tool-stick"
        pressed={stick}
        data-find="stick"
        onClick={() => setStick(!stick)}
      >
        <Icon name="stick" size={22} />
        <span>{t('stick.label')}</span>
      </Button>
    </div>
  );
}

/** "Not at camera height": taps near the picture's edge are off until Z is back. */
function FocusWarning() {
  const idle = useMachine((s) => s.connection === 'connected' && s.status?.state === 'Idle');
  const focusHeight = useWorkshop((s) => s.settings.camera.focusHeight);
  // Re-render with the position so the warning follows Z.
  useMachine((s) => s.status?.wpos[2]);
  const off = focusError();
  if (off === null || Math.abs(off) <= FOCUS_TOLERANCE) return null;
  return (
    <Alert variant="warning" className="justify-items-start gap-y-2" data-testid="focus-warning">
      <p>{t('camera.focusOff', { mm: formatNumber(off, 1) })}</p>
      <HoldButton
        disabled={!idle}
        onConfirm={() => focusHeight !== null && void useMachine.getState().moveZ(focusHeight)}
      >
        {t('camera.toFocus')}
      </HoldButton>
    </Alert>
  );
}

/**
 * What lies on the picture for the tools: the joystick in the lower left
 * corner when it is switched on, and the active tool's result – or its
 * one-line hint – along the lower edge. A result for a point tapped down
 * there moves to the upper edge instead, so it never hides its own point.
 */
export function StageDock() {
  const state = useTapState();
  const view = useJob((s) => s.view);
  const connected = useMachine((s) => s.connection === 'connected');
  const canJog = useMachine(
    (s) =>
      s.connection === 'connected' && (s.status?.state === 'Idle' || s.status?.state === 'Jog'),
  );
  const stick = useUi((s) => s.stageStick);
  const points = useStageTools((s) => s.points);
  const tappedLow = useStageTools((s) => s.tappedLow);
  const tool = activeTool(useStageTools((s) => s.active));
  // Nothing tapped or selected yet: the panel only offers the tool's choices.
  const idle = useStageTools((s) => s.points.length === 0 && s.zone === null);
  const Panel = tool.Panel;
  const warn = view === 'camera' && connected && state === 'tools';
  // A tool's panel shows its result – or, for a tool with choices, those from the start.
  const shown =
    state === 'tools' &&
    connected &&
    Panel !== undefined &&
    (points.length > 0 || tool.always === true);
  const result = shown && !idle;

  return (
    <>
      {stick ? (
        <div className="stage-stick">
          <JogStick disabled={!canJog} />
        </div>
      ) : null}
      {state === 'tools' ? (
        <div
          className={`tool-panel${result ? ' has-result' : shown ? ' has-choices' : ''}${result && tappedLow ? ' at-top' : ''}`}
          data-testid="tool-panel"
          data-tool={tool.id}
          data-no-swipe
        >
          {warn ? <FocusWarning /> : null}
          {shown ? (
            <Panel points={points} />
          ) : (
            <p className="text-muted-foreground text-sm tool-hint">
              {connected ? t(tool.hint) : t('stageTools.connectFirst')}
            </p>
          )}
        </div>
      ) : null}
    </>
  );
}
