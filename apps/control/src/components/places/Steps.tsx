import { t } from '../../i18n';
import { formatNumber } from '../../lib/format';
import { useCam } from '../../store/cam';
import { useJob } from '../../store/job';
import { useMachine } from '../../store/machine';
import { useJobTools } from '../../store/steps';
import { useUi } from '../../store/ui';
import { Button } from '../../ui/button';
import { Card, CardTitle } from '../../ui/card';
import { AlignCard } from '../AlignCard';
import { AutolevelCard } from '../AutolevelCard';
import { CamCard } from '../CamCard';
import { CameraCard } from '../CameraCard';
import { DiagnosticsCard, SimulationCards } from '../CheckCards';
import { CuttingAdvisor } from '../CuttingAdvisor';
import { FlipCard } from '../FlipCard';
import { JigCard } from '../JigCard';
import { JigsCard } from '../JigsCard';
import { JobDashboard, JobFileInput } from '../JobDashboard';
import { JobToolsCard } from '../JobTools';
import { WorkpieceCard } from '../WorkpieceCard';
import { Notice } from '../Notice';
import { PrepareCard } from '../PrepareCard';
import { ProbeTiles } from '../ProbeTiles';
import { ReadinessCard } from '../Readiness';
import { RunBar } from '../RunBar';
import { RunScreen } from '../RunScreen';
import { SavedZerosCard } from '../SavedZerosCard';
import { SdCard } from '../SdCard';
import { SectionsCard } from '../SectionsCard';
import { SetZeroCard, ZeroHistoryCard } from '../SetZeroCard';
import { Depth } from '../Depth';
import { FixturesEditor } from '../FixturesEditor';
import { SubNav } from '../SubNav';
import { WcsCard } from '../WcsCard';
import { WorkspaceCheck } from '../WorkspaceCheck';
import { ZeroCard } from '../ZeroCard';

/**
 * What every step of the flow starts with: the flows that carry a job across
 * steps (both sides, sections, a jig) say where they stand, and a running job
 * is in reach.
 */
function FlowCards() {
  return (
    <>
      {/* A job for both sides: where it stands and what leads from one side to the other. */}
      <FlipCard />
      {/* A part longer than the table: from section to section – slide it along, find it again. */}
      <SectionsCard />
      {/* A jig with printed tags on the table: recognised, it brings its job and its zero. */}
      <JigCard />
    </>
  );
}

/** The flows, and – on every step but ⑤ – the running job in one line with the way to it. */
function Flows() {
  return (
    <>
      <FlowCards />
      <RunBar here />
    </>
  );
}

/** A step that needs a program says so, with the one way to get one. */
function NoProgram() {
  const go = useUi((s) => s.go);
  return (
    <Notice
      testId="no-program"
      action={
        <Button variant="outline" size="sm" onClick={() => go('job')}>
          {t('nav.toJob')}
        </Button>
      }
    >
      {t('nav.noProgram')}
    </Notice>
  );
}

/**
 * ① Job – what am I making? The program as a card (recently used on top, a
 * place to drop files while nothing is loaded), the workpiece, and the
 * drawing workspace in place of the cards.
 */
export function JobStep() {
  const analysis = useJob((s) => s.analysis);
  const view = useUi((s) => s.views.job);
  const setView = useUi((s) => s.setView);
  const hasDrawing = useCam((s) => s.project !== null);
  const drawing = useUi((s) => s.drawing) && hasDrawing;

  // Drawing takes the place of the program; a running job comes first in any case.
  if (drawing) {
    return (
      <div className="flex flex-col gap-3 job-room">
        <JobFileInput />
        <JobDashboard compact />
        <RunBar here />
        <CamCard />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 job-room">
      <JobFileInput />
      <JobDashboard />
      {analysis ? (
        <SubNav
          label="nav.views.job.label"
          value={view}
          onChange={(v) => setView('job', v)}
          options={[
            { id: 'prepare', label: 'nav.views.job.prepare' },
            { id: 'extras', label: 'nav.views.job.extras' },
          ]}
        />
      ) : null}
      <Flows />
      {!analysis ? (
        <>
          <SdCard />
          <JigsCard />
        </>
      ) : null}
      {analysis && view === 'prepare' ? <WorkpieceCard /> : null}
      {analysis && view === 'extras' ? (
        <>
          <PrepareCard />
          <JigsCard />
        </>
      ) : null}
    </div>
  );
}

/** ② Werkzeuge – do I have the right one in? The job's tools against the tool list. */
export function ToolsStep() {
  const analysis = useJob((s) => s.analysis);
  return (
    <div className="flex flex-col gap-3">
      <Flows />
      {!analysis ? <NoProgram /> : null}
      <JobToolsCard />
      <Depth area="tools" more={<CuttingAdvisor />} />
    </div>
  );
}

/**
 * ③ Einrichten – where does the workpiece lie? The picture is the main area
 * (live camera or table, the path laid over it); here the one way to the
 * zero, the probing assistants as tiles, the camera's helpers and aligning.
 */
export function SetupStep() {
  const online = useMachine((s) => s.connection === 'connected');
  const analysis = useJob((s) => s.analysis);
  const view = useUi((s) => s.views.setup);
  const setView = useUi((s) => s.setView);
  const go = useUi((s) => s.go);
  return (
    <div className="flex flex-col gap-3">
      {!online ? (
        <Notice
          action={
            <Button variant="outline" size="sm" onClick={() => go('settings', 'connection')}>
              {t('ready.toConnect')}
            </Button>
          }
        >
          {t('drive.offline')}
        </Notice>
      ) : null}
      <SubNav
        label="nav.views.setup.label"
        value={view}
        onChange={(v) => setView('setup', v)}
        options={[
          { id: 'zero', label: 'nav.views.setup.zero' },
          { id: 'probe', label: 'nav.views.setup.probe' },
          { id: 'camera', label: 'nav.views.setup.camera' },
          { id: 'align', label: 'nav.views.setup.align' },
        ]}
      />
      <Flows />
      {view === 'zero' ? (
        <>
          <SetZeroCard />
          <ZeroHistoryCard />
          <Card className="gap-3 p-4" data-testid="setup-fixtures">
            <FixturesEditor />
          </Card>
          <Depth
            area="setup-zero"
            more={
              <>
                <ZeroCard />
                <WcsCard />
              </>
            }
            all={<SavedZerosCard />}
          />
        </>
      ) : null}
      {view === 'probe' ? <ProbeTiles /> : null}
      {view === 'camera' ? <CameraCard /> : null}
      {view === 'align' ? (
        analysis ? (
          <>
            <AlignCard />
            <AutolevelCard />
          </>
        ) : (
          <NoProgram />
        )
      ) : null}
    </div>
  );
}

/**
 * ④ Prüfen – does it all fit? The 3D simulation is the main area, its
 * timeline under it; here the checklist read from the readiness list, with
 * the simulation's options, the travel and the reader's findings below.
 */
export function CheckStep() {
  const analysis = useJob((s) => s.analysis);
  return (
    <div className="flex flex-col gap-3">
      <Flows />
      {analysis ? (
        <>
          <ReadinessCard />
          <Depth
            area="check"
            more={
              <>
                <SimulationCards />
                <WorkspaceCheck />
              </>
            }
            all={<DiagnosticsCard />}
          />
        </>
      ) : (
        <NoProgram />
      )}
    </div>
  );
}

/**
 * ⑤ Fräsen – is it going well? Before the start what will run, while it runs
 * the figures readable from two metres and the overrides, at the end the
 * summary. The start itself is the action bar's hold.
 */
export function RunStep() {
  const analysis = useJob((s) => s.analysis);
  return (
    <div className="flex flex-col gap-3">
      <FlowCards />
      {!analysis ? <NoProgram /> : null}
      <RunScreen />
    </div>
  );
}
