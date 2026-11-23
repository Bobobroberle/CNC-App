import type { ReactNode } from 'react';
import { Alert, AlertAction, AlertDescription } from '../ui/alert';

const VARIANT = { info: 'warning', danger: 'error', ok: 'success' } as const;

/**
 * A hint that says what is wrong and, where it can, offers the fix right
 * next to it ("not homed" → home), instead of sending the operator searching.
 */
export function Notice({
  tone = 'info',
  children,
  action,
  testId,
}: {
  tone?: 'info' | 'danger' | 'ok';
  children: ReactNode;
  action?: ReactNode;
  testId?: string;
}) {
  return (
    <Alert variant={VARIANT[tone]} data-testid={testId}>
      <AlertDescription className="text-card-foreground">
        <p>{children}</p>
      </AlertDescription>
      {action ? <AlertAction>{action}</AlertAction> : null}
    </Alert>
  );
}
