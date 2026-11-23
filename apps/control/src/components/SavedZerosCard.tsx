import { wcsCode, wcsFromCode, type SavedZero } from '@lowrider/workshop';
import { useRef, useState } from 'react';
import { t } from '../i18n';
import { formatCoordinate } from '../lib/format';
import { fileToThumbnail } from '../lib/image';
import { newId } from '../lib/persist';
import { useMachine } from '../store/machine';
import { useWorkshop } from '../store/workshop';
import { HoldButton } from './HoldButton';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import { Field, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';

/** Zero memory per fixture: name, photo, offset; restored with one hold. */
export function SavedZerosCard() {
  const idle = useMachine((s) => s.connection === 'connected' && s.status?.state === 'Idle');
  const parser = useMachine((s) => s.parserState);
  const { refreshState, restoreZero, addLog } = useMachine.getState();
  const zeros = useWorkshop((s) => s.zeros);
  const { saveZero, removeZero } = useWorkshop.getState();
  const [name, setName] = useState('');
  const [photo, setPhoto] = useState<string | undefined>();
  const photoInput = useRef<HTMLInputElement>(null);

  const save = async () => {
    await refreshState();
    const { parserState, offsets } = useMachine.getState();
    const code = parserState?.wcs ?? 'G54';
    const wcs = wcsFromCode(code);
    const offset = offsets?.wcs[code as 'G54'];
    if (!wcs || !offset) {
      addLog('error', t('zeros.noOffset'), 'zeros.noOffset');
      return;
    }
    const zero: SavedZero = {
      id: newId('zero'),
      name: name.trim(),
      wcs,
      offset,
      createdAt: Date.now(),
      ...(photo ? { photo } : {}),
    };
    saveZero(zero);
    addLog('info', t('zeros.saved', { name: zero.name }));
    setName('');
    setPhoto(undefined);
  };

  return (
    <Card className="gap-3 p-4" data-testid="saved-zeros" data-find="saved-zeros">
      <CardTitle render={<h2 />}>{t('zeros.title')}</CardTitle>
      <p className="text-muted-foreground text-sm">{t('zeros.hint')}</p>
      {zeros.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('zeros.empty')}</p>
      ) : null}
      <ul className="parts">
        {zeros.map((z) => (
          <li key={z.id} className="part">
            <div className="flex gap-3">
              {z.photo ? <img className="thumb" src={z.photo} alt="" /> : null}
              <div>
                <strong>{z.name}</strong> <Badge variant="outline">{wcsCode(z.wcs)}</Badge>
                <div className="text-muted-foreground text-sm tabular-nums">
                  X {formatCoordinate(z.offset.x, 2)} · Y {formatCoordinate(z.offset.y, 2)} · Z{' '}
                  {formatCoordinate(z.offset.z, 2)}
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <HoldButton variant="accent" disabled={!idle} onConfirm={() => restoreZero(z)}>
                {t('zeros.restore')}
              </HoldButton>
              <HoldButton onConfirm={() => removeZero(z.id)}>{t('zeros.remove')}</HoldButton>
            </div>
          </li>
        ))}
      </ul>
      <h3 className="font-medium text-muted-foreground text-sm">
        {t('zeros.saveCurrent', { wcs: parser?.wcs ?? 'G54' })}
      </h3>
      <Field>
        <FieldLabel>{t('zeros.name')}</FieldLabel>
        <Input type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={() => photoInput.current?.click()}>
          {photo ? t('zeros.photoTaken') : t('zeros.photo')}
        </Button>
        <Button
          reason="machine"
          className="flex-1"
          disabled={!idle || name.trim() === ''}
          onClick={() => void save()}
        >
          {t('zeros.save')}
        </Button>
      </div>
      {photo ? <img className="thumb large" src={photo} alt="" /> : null}
      <input
        ref={photoInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void fileToThumbnail(file).then(setPhoto);
          e.target.value = '';
        }}
      />
    </Card>
  );
}
