import { useEffect, useId, useState, type ReactNode } from 'react';
import { t, type MessageKey } from '../i18n';
import { Fold } from './Fold';

/**
 * A topic that is not needed every time, folded away until it is: one-off
 * setup under Maschine, the occasional camera functions under Fahren.
 * `openRequest` unfolds it and brings it into view when a link asked for it.
 */
export function Section({
  title,
  children,
  testId,
  find,
  openRequest = false,
  onOpened,
}: {
  title: MessageKey;
  children: ReactNode;
  testId?: string;
  /** What the quick search calls this section (`data-find`) */
  find?: string;
  openRequest?: boolean;
  onOpened?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  useEffect(() => {
    if (!openRequest) return;
    setOpen(true);
    document.getElementById(id)?.scrollIntoView({ block: 'start' });
    onOpened?.();
  }, [openRequest, onOpened, id]);
  return (
    <Fold
      variant="card"
      title={t(title)}
      open={open}
      onOpenChange={setOpen}
      testId={testId}
      find={find}
      id={id}
      className="section"
      bodyClassName="section-body"
    >
      {children}
    </Fold>
  );
}
