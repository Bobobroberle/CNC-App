import { useEffect, useState } from 'react';
import { t } from '../i18n';
import type { Macro } from '../lib/macros';
import { useMachine } from '../store/machine';
import { useMacros } from '../store/macros';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Field, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Fold } from './Fold';

export function MacroEditor() {
  const macros = useMacros((s) => s.macros);
  const setMacros = useMacros((s) => s.setMacros);
  const addLog = useMachine((s) => s.addLog);
  const [draft, setDraft] = useState<Macro[]>(macros);
  useEffect(() => setDraft(macros), [macros]);
  const update = (i: number, patch: Partial<Macro>) =>
    setDraft(draft.map((m, k) => (k === i ? { ...m, ...patch } : m)));
  const valid = draft.every((m) => m.name.trim() !== '');

  return (
    <Card className="gap-3 p-4" data-find="macro-editor">
      <Fold title={t('macros.edit')}>
        <div className="flex flex-col gap-3">
          {draft.map((m, i) => (
            <div key={i} className="macro-row">
              <Field>
                <FieldLabel>{t('macros.name')}</FieldLabel>
                <Input
                  type="text"
                  value={m.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel>{t('macros.gcode')}</FieldLabel>
                <Textarea
                  rows={3}
                  spellCheck={false}
                  value={m.gcode}
                  onChange={(e) => update(i, { gcode: e.target.value })}
                />
              </Field>
              <Button variant="outline" onClick={() => setDraft(draft.filter((_, k) => k !== i))}>
                {t('macros.remove')}
              </Button>
            </div>
          ))}
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setDraft([...draft, { name: `Makro ${draft.length + 1}`, gcode: '' }])}
            >
              {t('macros.add')}
            </Button>
            <Button
              variant="outline"
              reason="missing"
              className="flex-1"
              disabled={!valid}
              onClick={() => {
                setMacros(draft.map((m) => ({ name: m.name.trim(), gcode: m.gcode })));
                addLog('info', t('macros.saved'));
              }}
            >
              {t('macros.save')}
            </Button>
          </div>
        </div>
      </Fold>
    </Card>
  );
}
