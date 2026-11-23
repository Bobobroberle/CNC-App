import { useState } from 'react';
import { t } from '../i18n';
import { browserStorage, loadJson, saveJson } from '../lib/persist';
import { canAddToHomeScreen } from '../lib/platform';
import { Button } from '../ui/button';

const KEY = 'lowrider-control.install-hint';

/**
 * One line in Safari on the iPad, until it is dismissed: the app can be put
 * on the home screen and then starts full screen like any other app. Never
 * shown once it runs from there.
 */
export function InstallHint() {
  const [dismissed, setDismissed] = useState(() =>
    loadJson(browserStorage, KEY, (v) => (v === true ? true : null), false),
  );
  const applies =
    typeof navigator !== 'undefined' &&
    canAddToHomeScreen(navigator, (query) => matchMedia(query).matches);
  if (dismissed || !applies) return null;
  return (
    <p className="install-hint" data-testid="install-hint">
      <span>{t('app.installHint')}</span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          saveJson(browserStorage, KEY, true);
          setDismissed(true);
        }}
      >
        {t('app.installHintDismiss')}
      </Button>
    </p>
  );
}
