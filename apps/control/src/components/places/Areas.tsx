import { t } from '../../i18n';
import { Feature } from '../Feature';
import { FeaturesCard } from '../FeaturesCard';
import { needsAttention } from '../../lib/messages';
import { useJob } from '../../store/job';
import { useMessages } from '../../store/messages';
import { useUi, type Theme } from '../../store/ui';
import { useWorkshop } from '../../store/workshop';
import { Alert } from '../../ui/alert';
import { Card, CardTitle } from '../../ui/card';
import { SegmentedControl, SegmentedControlItem } from '../../ui/segmented-control';
import { AccuracyCheck } from '../AccuracyCheck';
import { CalibrationWizard } from '../CalibrationWizard';
import { MeasurementLog } from '../MeasurementLog';
import { CameraSetupCard } from '../CameraSetupCard';
import { CompanionCard } from '../CompanionCard';
import { ConfigEditor } from '../ConfigEditor';
import { ConfigFileEditor } from '../ConfigFileEditor';
import { ConnectionCard, ConsoleCard, ExpertSwitch, LogCard } from '../ConnectionCard';
import { ControllerConfig } from '../ControllerConfig';
import { CuttingAdvisor } from '../CuttingAdvisor';
import { FirmwareCard } from '../FirmwareCard';
import { HistoryCard } from '../HistoryCard';
import { InputsCard } from '../HomingCard';
import { MachineLimitsCard } from '../MachineLimitsCard';
import { MacroEditor } from '../MacroEditor';
import { MaterialLibrary } from '../MaterialLibrary';
import { NotifySettingsCard } from '../NotifySettingsCard';
import { ProfileEditor } from '../ProfileEditor';
import { ProfileShareCard } from '../ProfileShareCard';
import { AxisTestCard, ConnectionInfoCard, MessageHistoryCard, RunTimeCard } from '../ServiceCards';
import { Section } from '../Section';
import { SettingsBrowser } from '../SettingsBrowser';
import { SimulatorCard } from '../SimulatorCard';
import { SubNav } from '../SubNav';
import { ToolLibrary } from '../ToolLibrary';
import { WorkshopSettingsCard } from '../WorkshopSettingsCard';

/** Werkzeugliste – tools and materials, and the cutting values they give together. */
export function ToolListArea() {
  return (
    <div className="area">
      <div className="area-cards">
        <ToolLibrary />
        <MaterialLibrary />
        <CuttingAdvisor />
      </div>
    </div>
  );
}

/**
 * Service & Diagnose (DESIGN.md §5): the live state of the inputs, the axis
 * test, what is known about the connection and the log; the history of the
 * messages; what the machine has cut and how long; and calibrating, the one
 * view here that works with the picture.
 */
export function ServiceArea() {
  const view = useUi((s) => s.views.service);
  const setView = useUi((s) => s.setView);
  const open = useMessages((s) => s.messages.filter(needsAttention).length);
  return (
    <div className="area">
      <SubNav
        label="nav.views.service.label"
        value={view}
        onChange={(v) => setView('service', v)}
        options={[
          { id: 'diagnose', label: 'nav.views.service.diagnose' },
          {
            id: 'messages',
            label: 'nav.views.service.messages',
            ...(open > 0 ? { badge: open } : {}),
          },
          { id: 'history', label: 'nav.views.service.history' },
          { id: 'calibrate', label: 'nav.views.service.calibrate' },
        ]}
      />
      <div className="area-cards" data-testid={`service-${view}`}>
        {view === 'diagnose' ? (
          <>
            <ConnectionInfoCard />
            <InputsCard />
            <AxisTestCard />
            <LogCard />
          </>
        ) : null}
        {view === 'messages' ? <MessageHistoryCard /> : null}
        {view === 'history' ? (
          <>
            <RunTimeCard />
            <HistoryCard />
          </>
        ) : null}
        {view === 'calibrate' ? (
          <>
            <AccuracyCheck />
            <CalibrationWizard />
            <MeasurementLog />
          </>
        ) : null}
      </div>
    </div>
  );
}

const THEMES: readonly Theme[] = ['dark', 'light'];

/** Darstellung: dark for the workshop as it is, light for a bright one. Remembered. */
function AppearanceCard() {
  const theme = useUi((s) => s.theme);
  const setTheme = useUi((s) => s.setTheme);
  return (
    <Card className="gap-3 p-4" data-testid="appearance" data-find="appearance">
      <CardTitle render={<h2 />}>{t('appearance.title')}</CardTitle>
      <SegmentedControl role="group" aria-label={t('appearance.theme')} className="w-full *:flex-1">
        {THEMES.map((id) => (
          <SegmentedControlItem key={id} pressed={theme === id} onClick={() => setTheme(id)}>
            {t(`appearance.themes.${id}`)}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
      <p className="text-muted-foreground text-sm">{t('appearance.hint')}</p>
    </Card>
  );
}

/**
 * Einstellungen (DESIGN.md §3.3): the connection, the machine with the
 * workshop and the look, the camera (the one view here that works with the
 * picture) – and the expert tools, where they are switched on.
 */
export function SettingsArea() {
  const profile = useJob((s) => s.profile);
  const view = useUi((s) => s.views.settings);
  const setView = useUi((s) => s.setView);
  const expert = useWorkshop((s) => s.settings.expertMode);
  const shown = view === 'expert' && !expert ? 'machine' : view;
  return (
    <div className="area">
      <SubNav
        label="nav.views.settings.label"
        value={shown}
        onChange={(v) => setView('settings', v)}
        options={[
          { id: 'connection', label: 'nav.views.settings.connection' },
          { id: 'machine', label: 'nav.views.settings.machine' },
          { id: 'camera', label: 'nav.views.settings.camera' },
          ...(expert
            ? [{ id: 'expert' as const, label: 'nav.views.settings.expert' as const }]
            : []),
        ]}
      />
      <div className="area-cards" data-testid={`settings-${shown}`}>
        {shown === 'connection' ? (
          <>
            <ConnectionCard />
            <SimulatorCard />
            <CompanionCard />
          </>
        ) : null}
        {shown === 'machine' ? (
          <>
            <AppearanceCard />
            <Section title="machine.profile" find="profile">
              <p>{profile.name}</p>
              {profile.placeholder ? (
                <Alert variant="warning">{t('machine.profilePlaceholder')}</Alert>
              ) : null}
              <ProfileEditor />
              <MachineLimitsCard />
              <ControllerConfig />
              <ProfileShareCard />
            </Section>
            <Section title="machine.workshop">
              <WorkshopSettingsCard />
              <NotifySettingsCard />
            </Section>
            <Feature id="macros">
              <Section title="machine.macros">
                <MacroEditor />
              </Section>
            </Feature>
            <FeaturesCard />
            <ExpertSwitch />
          </>
        ) : null}
        {shown === 'camera' ? <CameraSetupCard /> : null}
        {shown === 'expert' ? (
          <>
            <ConfigEditor />
            <ConfigFileEditor />
            <SettingsBrowser />
            <FirmwareCard />
          </>
        ) : null}
      </div>
    </div>
  );
}

/** Konsole – G-code by hand and the raw log; only with the expert functions switched on. */
export function ConsoleArea() {
  return (
    <div className="area area-console">
      <ConsoleCard />
    </div>
  );
}
