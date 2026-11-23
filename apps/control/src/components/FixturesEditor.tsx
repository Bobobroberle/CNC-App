import { useState } from 'react';
import { t } from '../i18n';
import { boxZone, zoneCentre, zoneRadius } from '../lib/clamps';
import { formatNumber, formatSigned, parseNumber } from '../lib/format';
import { removeZone, updateZone } from '../store/clamps';
import { showTable } from '../store/job';
import { useMachine } from '../store/machine';
import { useStageTools } from '../store/tools';
import { useWorkshop } from '../store/workshop';
import { Button } from '../ui/button';
import { Field, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';
import { Fold } from './Fold';

const num = (s: string) => parseNumber(s);
const EMPTY = { name: '', x1: '', x2: '', y1: '', y2: '', height: '' };
/** A number as it is typed again: no thousands separators, at most two decimals */
const typed = (n: number) => String(Number(n.toFixed(2))).replace('.', ',');

/**
 * The clamps and screws on the table as a list with numbers – the precise
 * alternative to marking them with a finger (stage tool "Spannmittel"). Both
 * edit the same zones. They are stored where they lie on the table (machine
 * X/Y); the numbers here count from the work zero, like the grid on the
 * table, as long as the machine tells where that is.
 */
export function FixturesEditor() {
  const fixtures = useWorkshop((s) => s.setup.fixtures);
  const frame = useWorkshop((s) => s.setup.fixtureFrame);
  const wcoX = useMachine((s) => s.status?.wco[0]);
  const wcoY = useMachine((s) => s.status?.wco[1]);
  const { setSetup } = useWorkshop.getState();
  const [draft, setDraft] = useState(EMPTY);
  /** Index of the zone whose numbers are in the form, or null for a new one */
  const [editing, setEditing] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  // Shown = stored − shift. Without a work offset (not connected) pinned zones
  // can only be given from the machine zero.
  const fromWorkZero = frame === 'work' || wcoX !== undefined;
  const shift =
    frame === 'machine' && wcoX !== undefined ? { x: wcoX, y: wcoY ?? 0 } : { x: 0, y: 0 };

  const x1 = num(draft.x1);
  const x2 = num(draft.x2);
  const y1 = num(draft.y1);
  const y2 = num(draft.y2);
  const h = num(draft.height);
  const valid =
    draft.name.trim() !== '' &&
    [x1, x2, y1, y2, h].every((v) => Number.isFinite(v)) &&
    x2 > x1 &&
    y2 > y1 &&
    h > 0;

  const edit = (i: number) => {
    const f = fixtures[i]!;
    setDraft({
      name: f.name,
      x1: typed(f.min.x - shift.x),
      x2: typed(f.max.x - shift.x),
      y1: typed(f.min.y - shift.y),
      y2: typed(f.max.y - shift.y),
      height: typed(f.max.z),
    });
    setEditing(i);
    setOpen(true);
  };
  const save = () => {
    const round = editing !== null && fixtures[editing]?.round === true;
    const zone = boxZone(
      draft.name.trim(),
      x1 + shift.x,
      x2 + shift.x,
      y1 + shift.y,
      y2 + shift.y,
      h,
      round,
    );
    if (editing !== null && fixtures[editing]) updateZone(editing, zone);
    else setSetup({ fixtures: [...fixtures, zone] });
    setDraft(EMPTY);
    setEditing(null);
  };

  return (
    <div className="flex flex-col gap-3" data-testid="fixtures">
      <h3 className="font-medium text-muted-foreground text-sm" data-find="fixtures">
        {t('fixtures.title')}
      </h3>
      <p className="text-muted-foreground text-sm">{t('fixtures.hint')}</p>
      <Button
        variant="outline"
        onClick={() => {
          // The table from above with the tool that puts clamps down by a tap.
          showTable();
          useStageTools.getState().select('clamp');
        }}
      >
        {t('fixtures.mark')}
      </Button>
      {fixtures.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('fixtures.none')}</p>
      ) : null}
      <ul className="parts">
        {fixtures.map((f, i) => (
          <li
            key={`${f.name}-${i}`}
            className="part flex gap-3 justify-between"
            data-testid="fixture-entry"
          >
            <span>
              <strong>{f.name}</strong>{' '}
              <span className="text-muted-foreground text-sm tabular-nums">
                {f.round
                  ? t('fixtures.entryRound', {
                      d: formatNumber(2 * zoneRadius(f), 1),
                      x: formatSigned(zoneCentre(f).x - shift.x),
                      y: formatSigned(zoneCentre(f).y - shift.y),
                      h: formatNumber(f.max.z, 1),
                    })
                  : t('fixtures.entry', {
                      x1: formatSigned(f.min.x - shift.x),
                      x2: formatSigned(f.max.x - shift.x),
                      y1: formatSigned(f.min.y - shift.y),
                      y2: formatSigned(f.max.y - shift.y),
                      h: formatNumber(f.max.z, 1),
                    })}
              </span>
            </span>
            <span className="flex gap-3">
              <Button variant="outline" size="sm" onClick={() => edit(i)}>
                {t('fixtures.edit')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  removeZone(i);
                  setEditing(null);
                  setDraft(EMPTY);
                }}
              >
                {t('zeros.remove')}
              </Button>
            </span>
          </li>
        ))}
      </ul>
      {/* Typing a clamp's measures is the exception: folded away. */}
      <Fold
        title={t('fixtures.manual')}
        testId="fixtures-manual"
        open={open}
        onOpenChange={setOpen}
      >
        <div className="contents">
          <p className="text-muted-foreground text-sm">
            {t(fromWorkZero ? 'fixtures.fromWorkZero' : 'fixtures.fromMachineZero')}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Field>
              <FieldLabel>{t('fixtures.name')}</FieldLabel>
              <Input
                type="text"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>
            {(['x1', 'x2', 'y1', 'y2', 'height'] as const).map((k) => (
              <Field key={k}>
                <FieldLabel>{t(`fixtures.${k}`)}</FieldLabel>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={draft[k]}
                  onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                />
              </Field>
            ))}
          </div>
          <Button reason="missing" variant="outline" disabled={!valid} onClick={save}>
            {editing !== null ? t('fixtures.save') : t('fixtures.add')}
          </Button>
        </div>
      </Fold>
    </div>
  );
}
