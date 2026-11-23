import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { isFullDemo } from './lib/persist';
import { installPressFeedback } from './lib/press';
import { Root } from './Root';
import { startNotifications } from './store/notify';
import { startRecorder } from './store/recorder';
import { startSensorLink } from './store/sensors';
import { startClamps } from './store/clamps';
import { startDemo } from './store/demo';
import { startFind } from './store/find';
import { startKeys } from './store/keys';
import { startMessages } from './store/messages';
import { startJigs } from './store/jigs';
import { startSections } from './store/sections';
import { startPhotoMap } from './store/photomap';
import { startPlatform } from './store/platform';
import { startRecordingLink } from './store/recording';
import { startSeries } from './store/series';
import { startTimelapseRecorder } from './store/timelapse';
import { startScreenKeeper } from './store/wake';
import { startCompanionProbe } from './store/workshop';
import { startTrackingEngine } from './store/track';
import { applyTheme, useUi } from './store/ui';
import './styles/index.css';

// Dark is the default theme, light the other (styles/theme.css); the choice is remembered.
// The page starts dark by itself; what was chosen is said here, before the first picture.
applyTheme(useUi.getState().theme);

startPlatform();
installPressFeedback();
startTrackingEngine();
startRecorder();
startNotifications();
startSensorLink();
startScreenKeeper();
startTimelapseRecorder();
startPhotoMap();
startRecordingLink();
startClamps();
startSeries();
startJigs();
startSections();
startFind();
startKeys();
startMessages();
// The demo must not touch a real companion's libraries either.
if (!isFullDemo()) startCompanionProbe();
startDemo();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
