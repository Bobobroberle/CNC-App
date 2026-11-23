import { validateTool, type Tool, type ToolKind } from '@lowrider/workshop';
import { useRef, useState } from 'react';
import { t } from '../i18n';
import { formatNumber, parseNumber } from '../lib/format';
import { fileToThumbnail } from '../lib/image';
import { newId } from '../lib/persist';
import { useMachine } from '../store/machine';
import { useWorkshop } from '../store/workshop';
import { HoldButton } from './HoldButton';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import { Checkbox } from '../ui/checkbox';
import { Field, FieldLabel } from '../ui/field';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { SegmentedControl, SegmentedControlItem } from '../ui/segmented-control';

const KINDS: ToolKind[] = ['flat', 'ball', 'vbit', 'drill', 'chamfer'];
type Draft = Record<
  | 'number'
  | 'name'
  | 'diameter'
  | 'flutes'
  | 'angle'
  | 'fluteLength'
  | 'stickout'
  | 'holder'
  | 'holderDiameter'
  | 'notes',
  string
> & { kind: ToolKind; image?: string; id: string; probe: boolean };

const toDraft = (tool: Tool): Draft => ({
  id: tool.id,
  number: String(tool.number),
  name: tool.name,
  kind: tool.kind,
  diameter: String(tool.diameter),
  flutes: String(tool.flutes),
  angle: tool.angle === undefined ? '' : String(tool.angle),
  fluteLength: String(tool.fluteLength),
  stickout: String(tool.stickout),
  holder: tool.holder,
  holderDiameter: String(tool.holderDiameter),
  notes: tool.notes ?? '',
  probe: tool.probe === true,
  ...(tool.image ? { image: tool.image } : {}),
});

const num = (s: string) => parseNumber(s);

function fromDraft(d: Draft): Tool | null {
  return validateTool({
    id: d.id,
    number: num(d.number),
    name: d.name.trim(),
    kind: d.kind,
    diameter: num(d.diameter),
    flutes: num(d.flutes),
    ...(d.angle.trim() !== '' ? { angle: num(d.angle) } : {}),
    fluteLength: num(d.fluteLength),
    stickout: num(d.stickout),
    holder: d.holder,
    holderDiameter: num(d.holderDiameter),
    ...(d.notes.trim() !== '' ? { notes: d.notes.trim() } : {}),
    ...(d.probe ? { probe: true } : {}),
    ...(d.image ? { image: d.image } : {}),
  });
}

const FIELDS: { key: keyof Omit<Draft, 'kind' | 'image' | 'id' | 'probe'>; decimal?: boolean }[] = [
  { key: 'number' },
  { key: 'name' },
  { key: 'diameter', decimal: true },
  { key: 'flutes' },
  { key: 'angle', decimal: true },
  { key: 'fluteLength', decimal: true },
  { key: 'stickout', decimal: true },
  { key: 'holder' },
  { key: 'holderDiameter', decimal: true },
  { key: 'notes' },
];

/** Tool library: diameter, flutes, lengths, holder, photo. */
export function ToolLibrary() {
  const tools = useWorkshop((s) => s.tools);
  const { saveTool, removeTool } = useWorkshop.getState();
  const addLog = useMachine((s) => s.addLog);
  const [draft, setDraft] = useState<Draft | null>(null);
  const photo = useRef<HTMLInputElement>(null);
  const valid = draft ? fromDraft(draft) : null;

  const blank = (): Draft =>
    toDraft({
      id: newId('tool'),
      number: Math.max(0, ...tools.map((x) => x.number)) + 1,
      name: '',
      kind: 'flat',
      diameter: 6,
      flutes: 2,
      fluteLength: 20,
      stickout: 30,
      holder: '',
      holderDiameter: 30,
    });

  return (
    <Card className="gap-3 p-4" data-testid="tool-library" data-find="tool-library">
      <CardTitle render={<h2 />}>{t('tools.title')}</CardTitle>
      <table className="table-list">
        <thead>
          <tr>
            <th>T</th>
            <th>{t('tools.name')}</th>
            <th>Ø</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {tools.map((tool) => (
            <tr key={tool.id}>
              <td className="num">{tool.number}</td>
              <td>
                {tool.image ? <img className="thumb" src={tool.image} alt="" /> : null} {tool.name}
                <div className="text-muted-foreground text-sm">
                  {t(`tools.kinds.${tool.kind}`)} · {t('tools.flutesShort', { n: tool.flutes })}
                  {tool.probe ? ` · ${t('tools.probeShort')}` : ''}
                </div>
              </td>
              <td className="num">{formatNumber(tool.diameter, 1)}</td>
              <td>
                <Button variant="outline" size="sm" onClick={() => setDraft(toDraft(tool))}>
                  {t('tools.edit')}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Button variant="outline" onClick={() => setDraft(blank())}>
        {t('tools.add')}
      </Button>
      {draft ? (
        <div className="flex flex-col gap-3">
          <SegmentedControl
            className="w-full flex-wrap *:flex-auto"
            role="group"
            aria-label={t('tools.kind')}
          >
            {KINDS.map((k) => (
              <SegmentedControlItem
                key={k}
                pressed={draft.kind === k}
                onClick={() => setDraft({ ...draft, kind: k })}
              >
                {t(`tools.kinds.${k}`)}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
          <div className="grid grid-cols-2 gap-2">
            {FIELDS.map((f) => (
              <Field key={f.key}>
                <FieldLabel>{t(`tools.fields.${f.key}`)}</FieldLabel>
                <Input
                  type="text"
                  inputMode={
                    f.decimal
                      ? 'decimal'
                      : f.key === 'number' || f.key === 'flutes'
                        ? 'numeric'
                        : 'text'
                  }
                  value={draft[f.key]}
                  onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                />
              </Field>
            ))}
          </div>
          {/* A probe must never turn: a job that uses it asks before every start. */}
          <Label className="min-h-target gap-3 font-normal" data-testid="tool-probe">
            <Checkbox
              checked={draft.probe}
              onCheckedChange={(checked) => setDraft({ ...draft, probe: checked })}
            />
            <span>{t('tools.probe')}</span>
          </Label>
          <div className="flex gap-3">
            {draft.image ? <img className="thumb large" src={draft.image} alt="" /> : null}
            <Button variant="outline" className="flex-1" onClick={() => photo.current?.click()}>
              {t('tools.photo')}
            </Button>
          </div>
          <input
            ref={photo}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file)
                void fileToThumbnail(file).then((image) =>
                  setDraft((d) => (d ? { ...d, image } : d)),
                );
              e.target.value = '';
            }}
          />
          {!valid ? <Alert variant="warning">{t('tools.invalid')}</Alert> : null}
          <div className="flex gap-3">
            <Button
              variant="outline"
              reason="missing"
              className="flex-1"
              disabled={!valid}
              onClick={() => {
                if (!valid) return;
                saveTool(valid);
                addLog('info', t('tools.saved', { name: valid.name }));
                setDraft(null);
              }}
            >
              {t('tools.save')}
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setDraft(null)}>
              {t('tools.cancel')}
            </Button>
          </div>
          {tools.some((x) => x.id === draft.id) ? (
            <HoldButton
              variant="danger"
              onConfirm={() => {
                removeTool(draft.id);
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
