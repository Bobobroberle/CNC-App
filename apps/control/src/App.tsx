import { XIcon } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AbortDialog } from './components/AbortDialog';
import { CriticalLayer } from './components/CriticalLayer';
import { StartConfirm } from './components/StartConfirm';
import { ActionBar } from './components/ActionBar';
import { AlarmBanner } from './components/AlarmBanner';
import { MessageCentre } from './components/Messages';
import { FindLayer } from './components/Find';
import { InstallHint } from './components/InstallHint';
import { JogPanel } from './components/JogPanel';
import { Monitor } from './components/Monitor';
import { NavRow } from './components/NavRow';
import { NumpadLayer } from './components/NumpadLayer';
import { ConsoleArea, ServiceArea, SettingsArea, ToolListArea } from './components/places/Areas';
import { CamStep, JobStep, RunStep, SetupStep } from './components/places/Steps';
import { ReasonLayer } from './components/ReasonLayer';
import { RunBar } from './components/RunBar';
import { Stage } from './components/Stage';
import { StartScreen } from './components/StartScreen';
import { StatusBar } from './components/StatusBar';
import { Timeline } from './components/Timeline';
import { Toasts } from './components/Toasts';
import { ToolChangeCard } from './components/ToolChangeCard';
import { useTabSwipe } from './components/useTabSwipe';
import { t } from './i18n';
import { holdCount } from './lib/holds';
import { useJob } from './store/job';
import { useCamera } from './store/camera';
import { cameraCalibrated } from './store/photomap';
import { openJobFiles } from './store/recent';
import {
  hasPicture,
  isStep,
  placeHasStage,
  shellParts,
  STEP_STAGE,
  useUi,
  type Place,
} from './store/ui';
import { useWorkshop } from './store/workshop';
import { DialogLayer } from './ui/dialog';
import { Button } from './ui/button';
import { Sheet, type SheetLevel } from './ui/sheet';

/** The machine's touch screen (DESIGN.md §4): the context panel lies as a sheet along the bottom */
const SHEET = '(max-width: 1023px), (orientation: portrait)';
/** A phone: watching only */
const PHONE = '(max-width: 599px)';

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const list = matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);
  return matches;
}

function PlaceContent({ place }: { place: Place }) {
  switch (place) {
    case 'job':
      return <JobStep />;
    case 'cam':
      return <CamStep />;
    case 'setup':
      return <SetupStep />;
    case 'run':
      return <RunStep />;
    case 'toollist':
      return <ToolListArea />;
    case 'service':
      return <ServiceArea />;
    case 'settings':
      return <SettingsArea />;
    case 'console':
      return <ConsoleArea />;
    default:
      return null;
  }
}

/** The name of where the operator is: the step, the area, or the jog panel over it. */
function usePlaceTitle(place: Place, jog: boolean): string {
  if (jog) return t('nav.jogTitle');
  if (place === 'start') return t('nav.start');
  return hasPicture(place) ? t(`nav.steps.${place}`) : t(`nav.areas.${place}`);
}

/**
 * The context panel's content: what the place shows, or the jog panel over it.
 * A component of its own, so its scrolling and the sideways swipe are set up
 * whenever the panel is there (Start has none).
 */
function PanelBody({ place, jogOpen, title }: { place: Place; jogOpen: boolean; title: string }) {
  // A new place starts at its top; a new view inside a place starts right under
  // the place's (sticky) view switch instead of somewhere down the old view.
  const panel = useRef<HTMLDivElement>(null);
  const subView = useUi((s) => `${Object.values(s.views).join('|')}|${s.place}`);
  useLayoutEffect(() => {
    if (panel.current) panel.current.scrollTop = 0;
  }, [place, jogOpen]);
  useLayoutEffect(() => {
    const el = panel.current;
    const before = el?.querySelector('.subnav, .workspace-head')?.previousElementSibling;
    if (!el) return;
    const top = before
      ? before.getBoundingClientRect().bottom - el.getBoundingClientRect().top + el.scrollTop
      : 0;
    if (el.scrollTop > top) el.scrollTop = top;
  }, [subView]);
  // A sideways swipe on the panel changes the view inside the place. The places
  // themselves change only in the row of the steps: a second swipe level would switch by accident.
  useTabSwipe(panel);
  return (
    <div className="panel-body" role="region" aria-label={title} ref={panel}>
      <ToolChangeCard />
      {shellParts(place).runBar ? <RunBar /> : null}
      <div key={jogOpen ? 'jog' : place} className="room-switch">
        {jogOpen ? <JogPanel /> : <PlaceContent place={place} />}
      </div>
    </div>
  );
}

export function App() {
  const stored = useUi((s) => s.place);
  const expert = useWorkshop((s) => s.settings.expertMode);
  // The console is there for experts only; without the switch its place is the settings.
  const place: Place = stored === 'console' && !expert ? 'settings' : stored;
  const jogOpen = useUi((s) => s.jogOpen);
  const panelHidden = useUi((s) => s.panelHidden);
  const sheet = useMediaQuery(SHEET);
  const phone = useMediaQuery(PHONE);
  const title = usePlaceTitle(place, jogOpen);
  const subView = useUi((s) => `${Object.values(s.views).join('|')}|${s.place}`);
  // The sheet's rest belongs to the place (the jog panel has its own) and is remembered.
  const sheetKey = jogOpen ? 'jog' : place;
  const sheetLevel = useUi((s) => s.sheet[sheetKey] ?? 'half');
  // The sheet never changes its size under a finger that holds something (a hold, a
  // continuous jog): what is held would move away from under it.
  const setSheetLevel = (level: SheetLevel) => {
    if (holdCount() === 0) useUi.getState().setSheet(sheetKey, level);
  };
  // Going somewhere, or opening the jog panel, brings a folded sheet back up.
  useEffect(() => {
    const { sheet: levels, setSheet } = useUi.getState();
    if (levels[sheetKey] === 'peek') setSheet(sheetKey, 'half');
  }, [sheetKey, subView]);
  // Each step brings its picture (DESIGN.md §5): the table for the job, the live picture for
  // setting up – where there is a calibrated one –, 3D for checking and cutting. A view the
  // operator chose in a step stays that step's view.
  useEffect(() => {
    if (!hasPicture(place)) return;
    const { stageViews } = useUi.getState();
    const { settings } = useWorkshop.getState();
    const live = useCamera.getState().source !== null && cameraCalibrated(settings.camera);
    // The drawing is always entered on the table, where it is drawn: a 3D view looked at inside it
    // would show nothing to draw on when it is opened again.
    const view =
      place === 'cam'
        ? STEP_STAGE.cam
        : (stageViews[place] ?? (place === 'setup' && live ? 'camera' : STEP_STAGE[place]));
    if (useJob.getState().view !== view) useJob.getState().setView(view);
  }, [place]);

  const stageView = useJob((s) => s.view);
  const checking = useUi((s) => s.views.run === 'check');
  const start = place === 'start';
  // The side areas that are lists get the whole width; the jog panel brings the picture back.
  const wide = useUi((s) => !start && !s.jogOpen && !placeHasStage(place, s.views));
  const showPanel = (!start || jogOpen) && (!panelHidden || wide);
  const content = <PanelBody place={place} jogOpen={jogOpen} title={title} />;

  return (
    <div
      className={`app${panelHidden ? ' panel-hidden' : ''}${phone ? ' phone' : ''}`}
      data-place={place}
      data-bare={!phone && !shellParts(place).actionBar ? '' : undefined}
      data-jog={jogOpen ? '' : undefined}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        // Anywhere on the app, one file or several (DESIGN.md §5 ①).
        const files = [...e.dataTransfer.files];
        if (files.length > 0) void openJobFiles(files);
      }}
    >
      <StatusBar />
      <InstallHint />
      {phone ? (
        <Monitor />
      ) : (
        <>
          <NavRow />
          <main
            className={`main${start ? ' main-start' : ''}${showPanel ? '' : ' main-wide'}${wide ? ' main-area' : ''}`}
          >
            {wide ? null : start ? (
              <StartScreen />
            ) : (
              <div className="stage-column">
                <div className="stage-wrap">
                  <Stage />
                  <AlarmBanner />
                </div>
                {/* ④ Prüfen: the simulation's timeline lies under its picture (3D). On the
                    table or the camera picture the room belongs to the tap tools; the
                    timeline is in the panel then ("Mehr Optionen"). */}
                {place === 'run' && checking && !jogOpen && stageView === '3d' ? (
                  <Timeline />
                ) : null}
              </div>
            )}
            {showPanel ? (
              wide ? (
                <section className="panel area-panel">
                  {/* An alarm shows wherever one is – here without the picture it lies over. */}
                  <AlarmBanner />
                  {content}
                </section>
              ) : sheet ? (
                <Sheet
                  className="panel"
                  data-key={sheetKey}
                  level={sheetLevel}
                  onLevelChange={setSheetLevel}
                  title={title}
                  labels={{
                    open: t('nav.panelShow'),
                    close: t('nav.panelHide'),
                    smaller: t('nav.panelSmaller'),
                    larger: t('nav.panelLarger'),
                  }}
                  actions={
                    jogOpen ? (
                      <Button
                        variant="outline"
                        data-testid="jog-close"
                        onClick={() => useUi.getState().setJogOpen(false)}
                      >
                        <XIcon aria-hidden="true" />
                        {t('nav.jogClose')}
                      </Button>
                    ) : null
                  }
                >
                  {content}
                </Sheet>
              ) : (
                <aside className="panel">{content}</aside>
              )
            ) : null}
          </main>
          {shellParts(place).actionBar ? <ActionBar /> : null}
        </>
      )}
      <Toasts />
      <ReasonLayer />
      {/* Dialogs lie here, below the status bar: PAUSE and NOT-HALT stay above them, one tap away. */}
      <DialogLayer className="dialog-layer" data-no-swipe />
      <NumpadLayer />
      <FindLayer />
      <MessageCentre />
      <AbortDialog />
      <StartConfirm />
      <CriticalLayer />
    </div>
  );
}
