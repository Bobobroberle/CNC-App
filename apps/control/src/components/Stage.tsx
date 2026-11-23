import { useEffect } from 'react';
import { t, type MessageKey } from '../i18n';
import { useCamera } from '../store/camera';
import { useJob, type ViewMode } from '../store/job';
import { hasPicture, shellParts, useUi } from '../store/ui';
import { CameraView } from './CameraView';
import { Icon } from './Icon';
import { LiveInset } from './LiveInset';
import { MiniMap } from './MiniMap';
import { Stage3D } from './Stage3D';
import { TableView } from './TableView';
import { StageDock, ToolStrip } from './ToolStrip';
import { ZGauge } from './ZGauge';
import { Button } from '../ui/button';
import { SegmentedControl, SegmentedControlItem } from '../ui/segmented-control';

const MODES: { mode: ViewMode; label: MessageKey }[] = [
  { mode: 'table', label: 'stage.table' },
  { mode: 'camera', label: 'stage.camera' },
  { mode: '3d', label: 'stage.view3d' },
];

/**
 * The stage: always visible, in one of three modes. Tisch is the table from
 * above (photo map, job, tool), Kamera the live picture, 3D the check with
 * material removal. One row of tap tools serves table and camera alike; the
 * corner inset always shows the other of the two and swaps on a tap.
 */
export function Stage({ monitor = false }: { monitor?: boolean }) {
  // The drawing workspace shows the table with the drawing and nothing else: the view is the
  // place's, not whatever the keys or the search set last, and none of the stage's tools show.
  // The phone's monitor has no row of tabs to leave the drawing workspace by: it keeps the choice
  // of the view whatever place the app was left in.
  const tools = useUi((s) => monitor || shellParts(s.place).stageTools);
  const chosen = useJob((s) => s.view);
  const view: ViewMode = tools ? chosen : 'table';
  const showView = useJob((s) => s.setView);
  // A view chosen by hand in a step is that step's view from then on.
  const setView = (mode: ViewMode) => {
    const { place, setStageView } = useUi.getState();
    if (hasPicture(place)) setStageView(place, mode);
    showView(mode);
  };
  const requestFit = useJob((s) => s.requestFit);
  const cameraOn = useCamera((s) => s.source !== null) && tools;
  const stick = useUi((s) => s.stageStick) && tools;
  const panelHidden = useUi((s) => s.panelHidden);
  const setPanelHidden = useUi((s) => s.setPanelHidden);
  const follow = useUi((s) => s.follow);
  const setFollow = useUi((s) => s.setFollow);

  // Simulation clock.
  const playing = useJob((s) => s.playing);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const { simTime, speed, analysis: a, setSimTime, setPlaying } = useJob.getState();
      const total = a?.timeline?.total ?? 0;
      const next = simTime + ((now - last) / 1000) * speed;
      last = now;
      setSimTime(next);
      if (next >= total) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  return (
    <section className="stage" aria-label={t('stage.live')}>
      <div className="stage-main">
        {/* Two rows where the stage is narrow, one where it has the width. */}
        <div className="stage-head">
          {tools ? (
            <SegmentedControl className="stage-modes" role="group" aria-label={t('stage.mode')}>
              {MODES.map((m) => (
                <SegmentedControlItem
                  key={m.mode}
                  pressed={view === m.mode}
                  data-find={`stage-${m.mode}`}
                  onClick={() => setView(m.mode)}
                >
                  {t(m.label)}
                </SegmentedControlItem>
              ))}
            </SegmentedControl>
          ) : null}
          <div className="stage-options">
            {/* Only what does something in this mode. */}
            {view !== 'camera' ? (
              <Button
                variant="outline"
                data-find="fit"
                onClick={() => {
                  setFollow(false);
                  requestFit();
                }}
              >
                <span className="with-icon">
                  <Icon name="fit" size={20} /> {t('job.fit')}
                </span>
              </Button>
            ) : null}
            {view === 'table' && tools ? (
              <Button
                variant="outline"
                className="chip"
                pressed={follow}
                data-find="follow"
                onClick={() => setFollow(!follow)}
              >
                <span className="chip-led" aria-hidden="true" />
                {t('job.follow')}
              </Button>
            ) : null}
            {/* The stage alone, edge to edge; any room on the rail brings the panel back. */}
            <Button
              variant="outline"
              className="chip stage-wide"
              pressed={panelHidden}
              aria-label={t('stage.wide')}
              title={t('stage.wideHint')}
              data-testid="stage-wide"
              data-find="wide"
              onClick={() => setPanelHidden(!panelHidden)}
            >
              <Icon name="wide" size={22} />
              <span className="stage-wide-label">{t('stage.wide')}</span>
            </Button>
          </div>
          {view !== '3d' && tools ? <ToolStrip /> : null}
        </div>
        <div
          className={`stage-canvas${stick && view !== '3d' ? ' with-stick' : ''}${cameraOn && view !== '3d' ? ' with-inset' : ''}`}
        >
          {view === 'table' ? (
            <TableView follow={follow && tools} onPan={() => setFollow(false)} />
          ) : null}
          {view === '3d' ? <Stage3D /> : null}
          {view === 'camera' ? <CameraView /> : null}
          {/* One inset, always the other view: a tap swaps table and camera. */}
          {/* On the 3D view the live picture is the picture in the picture (§5 ⑤). */}
          {tools && (view === 'table' || view === '3d') ? <LiveInset /> : null}
          {view === 'camera' && cameraOn ? <MiniMap /> : null}
          {view !== '3d' && tools ? <StageDock /> : null}
        </div>
      </div>
      {tools ? <ZGauge /> : null}
    </section>
  );
}
