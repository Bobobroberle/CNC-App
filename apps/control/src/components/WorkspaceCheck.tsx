import { useMemo } from 'react';
import { t } from '../i18n';
import { formatNumber } from '../lib/format';
import { travelViolations } from '../lib/workspace';
import { useJob } from '../store/job';
import { useMachine } from '../store/machine';
import { Alert } from '../ui/alert';
import { Card, CardTitle } from '../ui/card';

/** Checks the loaded job against the machine travel, using the controller's current zero point. */
export function WorkspaceCheck() {
  const lines = useJob((s) => s.lines);
  const profile = useJob((s) => s.profile);
  const homed = useMachine((s) => s.homed);
  const wcoKey = useMachine((s) => s.status?.wco.join(',') ?? null);
  // Rounded so the check does not rerun on every status report while moving.
  const mposKey = useMachine((s) => s.status?.mpos.map((v) => Math.round(v)).join(',') ?? null);

  const violations = useMemo(() => {
    if (wcoKey === null || mposKey === null || lines.length === 0) return null;
    const numbers = (key: string) => key.split(',').map(Number);
    return travelViolations(lines.join('\n'), profile, numbers(wcoKey), numbers(mposKey));
  }, [wcoKey, mposKey, lines, profile]);

  return (
    <Card
      id="workspace-check"
      className="gap-3 p-4"
      data-testid="workspace-check"
      data-find="workspace-check"
    >
      <CardTitle render={<h2 />}>{t('job.workspace')}</CardTitle>
      {violations === null ? (
        <p className="text-muted-foreground text-sm">{t('job.workspaceOffline')}</p>
      ) : (
        <>
          {!homed ? <Alert variant="warning">{t('drive.notHomed')}</Alert> : null}
          {profile.placeholder ? (
            <Alert variant="warning">{t('drive.travelPlaceholder')}</Alert>
          ) : null}
          {violations.length === 0 ? (
            <p className="text-success-foreground">{t('job.workspaceOk')}</p>
          ) : (
            <ul className="diagnostics">
              {violations.map((v) => (
                <li key={v.axis + v.side} className="error">
                  {t('job.workspaceViolation', {
                    axis: v.axis.toUpperCase(),
                    side: t(v.side === 'min' ? 'job.sideMin' : 'job.sideMax'),
                    mm: formatNumber(Math.abs(v.value - v.limit), 1),
                    line: v.lineIndex + 1,
                  })}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}
