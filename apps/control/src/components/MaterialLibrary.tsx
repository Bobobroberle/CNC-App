import { validateMaterial, type Material, type MaterialGroup } from '@lowrider/workshop';
import { useState } from 'react';
import { t } from '../i18n';
import { formatNumber, parseNumber } from '../lib/format';
import { newId } from '../lib/persist';
import { useWorkshop } from '../store/workshop';
import { HoldButton } from './HoldButton';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import { Field, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';
import { SegmentedControl, SegmentedControlItem } from '../ui/segmented-control';

const GROUPS: MaterialGroup[] = ['wood', 'board', 'plastic', 'metal'];
const NUMBERS = ['vc', 'fz6', 'depthFactor', 'stepoverFactor', 'plungeFactor'] as const;
type Draft = { id: string; name: string; group: MaterialGroup; notes: string } & Record<
  (typeof NUMBERS)[number],
  string
>;

const toDraft = (m: Material): Draft => ({
  id: m.id,
  name: m.name,
  group: m.group,
  notes: m.notes ?? '',
  vc: String(m.vc),
  fz6: String(m.fz6),
  depthFactor: String(m.depthFactor),
  stepoverFactor: String(m.stepoverFactor),
  plungeFactor: String(m.plungeFactor),
});

const num = (s: string) => parseNumber(s);

/** Material library with the cutting data the suggestions start from. */
export function MaterialLibrary() {
  const materials = useWorkshop((s) => s.materials);
  const { saveMaterial, removeMaterial } = useWorkshop.getState();
  const [draft, setDraft] = useState<Draft | null>(null);
  const valid = draft
    ? validateMaterial({
        id: draft.id,
        name: draft.name.trim(),
        group: draft.group,
        ...Object.fromEntries(NUMBERS.map((k) => [k, num(draft[k])])),
        ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
      })
    : null;

  return (
    <Card className="gap-3 p-4" data-testid="material-library" data-find="material-library">
      <CardTitle render={<h2 />}>{t('materials.title')}</CardTitle>
      <table className="table-list">
        <thead>
          <tr>
            <th>{t('materials.name')}</th>
            <th>vc</th>
            <th>fz (Ø6)</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {materials.map((m) => (
            <tr key={m.id}>
              <td>
                {m.name}
                <div className="text-muted-foreground text-sm">
                  {t(`materials.groups.${m.group}`)}
                </div>
              </td>
              <td className="num">{formatNumber(m.vc)}</td>
              <td className="num">{formatNumber(m.fz6, 3)}</td>
              <td>
                <Button variant="outline" size="sm" onClick={() => setDraft(toDraft(m))}>
                  {t('tools.edit')}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Button
        variant="outline"
        onClick={() =>
          setDraft(
            toDraft({
              id: newId('mat'),
              name: '',
              group: 'wood',
              vc: 500,
              fz6: 0.06,
              depthFactor: 0.4,
              stepoverFactor: 0.4,
              plungeFactor: 0.3,
            }),
          )
        }
      >
        {t('materials.add')}
      </Button>
      {draft ? (
        <div className="flex flex-col gap-3">
          <Field>
            <FieldLabel>{t('materials.name')}</FieldLabel>
            <Input
              type="text"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </Field>
          <SegmentedControl
            className="w-full flex-wrap *:flex-auto"
            role="group"
            aria-label={t('materials.group')}
          >
            {GROUPS.map((g) => (
              <SegmentedControlItem
                key={g}
                pressed={draft.group === g}
                onClick={() => setDraft({ ...draft, group: g })}
              >
                {t(`materials.groups.${g}`)}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
          <div className="grid grid-cols-2 gap-2">
            {NUMBERS.map((k) => (
              <Field key={k}>
                <FieldLabel>{t(`materials.fields.${k}`)}</FieldLabel>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={draft[k]}
                  onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                />
              </Field>
            ))}
          </div>
          <Field>
            <FieldLabel>{t('materials.notes')}</FieldLabel>
            <Input
              type="text"
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
          </Field>
          {!valid ? <Alert variant="warning">{t('materials.invalid')}</Alert> : null}
          <div className="flex gap-3">
            <Button
              variant="outline"
              reason="missing"
              className="flex-1"
              disabled={!valid}
              onClick={() => {
                if (valid) saveMaterial(valid);
                setDraft(null);
              }}
            >
              {t('tools.save')}
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setDraft(null)}>
              {t('tools.cancel')}
            </Button>
          </div>
          {materials.some((m) => m.id === draft.id) ? (
            <HoldButton
              variant="danger"
              onConfirm={() => {
                removeMaterial(draft.id);
                setDraft(null);
              }}
            >
              {t('tools.remove')}
            </HoldButton>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
