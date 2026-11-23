import { useMessages } from '../store/messages';
import { Toast, ToastRegion, type ToastLevel } from '../ui/toast';

/**
 * New messages lie over the page for a moment (DESIGN.md §6.3): an
 * information goes by itself, a warning and a fault stay in the centre and
 * in the flag after their toast. Hints and the critical message have none.
 */
export function Toasts() {
  const toasts = useMessages((s) => s.toasts);
  return (
    <ToastRegion className="toasts" data-testid="toasts">
      {toasts.map((message) => (
        <Toast key={message.id} level={message.level as ToastLevel}>
          {message.title}
        </Toast>
      ))}
    </ToastRegion>
  );
}
