import { t } from '../i18n';
import { useKeys } from '../store/keys';
import { useMachine } from '../store/machine';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '../ui/dialog';

/**
 * "Job abbrechen?" (DESIGN.md §6.4): Esc asks, it never stops by itself.
 * The job goes on while the question stands; PAUSE and NOT-HALT stay above it.
 */
export function AbortDialog() {
  const asking = useKeys((s) => s.abortAsked);
  const close = () => useKeys.setState({ abortAsked: false });
  return (
    <Dialog open={asking} onOpenChange={(open) => (open ? undefined : close())}>
      <DialogPopup className="max-w-md" data-testid="abort-dialog">
        <DialogHeader>
          <DialogTitle>{t('abort.title')}</DialogTitle>
        </DialogHeader>
        <DialogPanel>
          <DialogDescription>{t('abort.text')}</DialogDescription>
        </DialogPanel>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {t('abort.keep')}
          </Button>
          <Button
            onClick={() => {
              close();
              void useMachine.getState().stopJob();
            }}
          >
            {t('abort.confirm')}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
