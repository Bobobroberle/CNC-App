import { App } from './App';
import { applyLanguage } from './i18n/language';
import { useUi } from './store/ui';
import { useWorkshop } from './store/workshop';
import { DialogLayerProvider } from './ui/dialog';

/**
 * Re-mounts the app when the language changes, so every text is drawn again, and when the
 * theme changes, so the stage pictures read their colours anew.
 */
export function Root() {
  const language = useWorkshop((s) => s.settings.language);
  const theme = useUi((s) => s.theme);
  applyLanguage(language);
  return (
    <DialogLayerProvider>
      <App key={`${language}-${theme}`} />
    </DialogLayerProvider>
  );
}
