import { t } from '../i18n';
import { useMachine } from '../store/machine';
import { useMacros } from '../store/macros';
import { HoldButton } from './HoldButton';
import { Card, CardTitle } from '../ui/card';

export function MacroButtons() {
  const macros = useMacros((s) => s.macros);
  const idle = useMachine((s) => s.connection === 'connected' && s.status?.state === 'Idle');
  const runMacro = useMachine((s) => s.runMacro);
  return (
    <Card className="gap-3 p-4" data-find="macros">
      <CardTitle render={<h2 />}>{t('macros.title')}</CardTitle>
      {macros.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('macros.empty')}</p>
      ) : null}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(6rem,1fr))] gap-2">
        {macros.map((m, i) => (
          <HoldButton key={i} duration={500} disabled={!idle} onConfirm={() => runMacro(m)}>
            {m.name}
          </HoldButton>
        ))}
      </div>
    </Card>
  );
}
