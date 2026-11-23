import { FLASH_SETTINGS, releaseVersion, type RadioVariant } from '@lowrider/fluidnc-client';
import { useRef, useState } from 'react';
import { t } from '../i18n';
import { downloadText } from '../lib/download';
import {
  fetchReleases,
  imagesFromZip,
  type FirmwareImage,
  type ReleaseInfo,
} from '../lib/firmware';
import { formatNumber } from '../lib/format';
import { useMachine } from '../store/machine';
import { HoldButton } from './HoldButton';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import { SegmentedControl, SegmentedControlItem } from '../ui/segmented-control';
import { Progress } from '../ui/progress';

const VARIANTS: RadioVariant[] = ['wifi', 'bt', 'noradio'];

/**
 * Flashes a FluidNC release over USB (Web Serial + esptool-js). The config
 * partition (littlefs) is never written, so config.yaml survives; it is
 * still downloaded first as a backup.
 */
export function FirmwareCard() {
  const connected = useMachine((s) => s.connection === 'connected');
  const { readConfigFile, addLog } = useMachine.getState();
  const supported = typeof navigator !== 'undefined' && 'serial' in navigator;
  const zipInput = useRef<HTMLInputElement>(null);
  const [variant, setVariant] = useState<RadioVariant>('wifi');
  const [zip, setZip] = useState<{ name: string; data: Uint8Array } | null>(null);
  const [images, setImages] = useState<FirmwareImage[] | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [releases, setReleases] = useState<ReleaseInfo[] | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [backedUp, setBackedUp] = useState(false);

  const choose = (data: Uint8Array, name: string, v = variant) => {
    setZip({ name, data });
    try {
      const r = imagesFromZip(data, v);
      if ('missing' in r) {
        setImages(null);
        setMissing(r.missing);
      } else {
        setImages(r.images);
        setMissing([]);
      }
    } catch {
      setImages(null);
      setMissing([t('firmware.notZip')]);
    }
  };

  const backup = async () => {
    const file = await readConfigFile();
    if (!file) return;
    downloadText(file.name, file.text);
    setBackedUp(true);
    addLog('info', t('firmware.backedUp', { name: file.name }));
  };

  const flash = async () => {
    if (!images) return;
    setBusy(true);
    setLog([]);
    const write = (line: string) => setLog((l) => [...l.slice(-200), line]);
    let transport: { disconnect(): Promise<void> } | null = null;
    try {
      const { ESPLoader, Transport } = await import('esptool-js');
      const port = await navigator.serial.requestPort();
      const tr = new Transport(port, false);
      transport = tr;
      const loader = new ESPLoader({
        transport: tr,
        baudrate: FLASH_SETTINGS.baudRate,
        terminal: { clean: () => setLog([]), writeLine: write, write },
      });
      const chip = await loader.main();
      write(t('firmware.chip', { chip }));
      const total = images.reduce((s, i) => s + i.data.length, 0);
      const done = images.map(() => 0);
      await loader.writeFlash({
        fileArray: images.map((i) => ({ data: i.data, address: i.address })),
        flashMode: FLASH_SETTINGS.flashMode,
        flashFreq: FLASH_SETTINGS.flashFreq,
        flashSize: 'keep',
        eraseAll: false,
        compress: true,
        reportProgress: (index, written, size) => {
          done[index] = (written / size) * images[index]!.data.length;
          setProgress(done.reduce((s, v) => s + v, 0) / total);
        },
      });
      await loader.after('hard_reset');
      write(t('firmware.done'));
      addLog(
        'info',
        t('firmware.flashed', { version: releaseVersion(zip?.name ?? '') ?? zip?.name ?? '' }),
      );
    } catch (error) {
      write(`${t('firmware.failed')}: ${(error as Error).message}`);
      addLog('error', t('firmware.failed'), 'firmware.failed');
    } finally {
      await transport?.disconnect().catch(() => undefined);
      setBusy(false);
    }
  };

  return (
    <Card className="gap-3 p-4" data-testid="firmware-card" data-find="firmware">
      <CardTitle render={<h2 />}>{t('firmware.title')}</CardTitle>
      <p className="text-muted-foreground text-sm">{t('firmware.intro')}</p>
      {!supported ? <Alert variant="warning">{t('firmware.unsupported')}</Alert> : null}
      <ol className="steps">
        <li>
          {t('firmware.step1')}{' '}
          <Button
            reason="machine"
            variant="outline"
            size="sm"
            disabled={!connected}
            onClick={() => void backup()}
          >
            {backedUp ? `${t('firmware.backup')} ✓` : t('firmware.backup')}
          </Button>
        </li>
        <li>{t('firmware.step2')}</li>
        <li>{t('firmware.step3')}</li>
      </ol>
      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={() => zipInput.current?.click()}>
          {t('firmware.chooseZip')}
        </Button>
        <Button
          variant="outline"
          className="flex-1"
          onClick={() =>
            void fetchReleases()
              .then(setReleases)
              .catch(() => addLog('error', t('firmware.releasesFailed'), 'firmware.releasesFailed'))
          }
        >
          {t('firmware.releases')}
        </Button>
      </div>
      <input
        ref={zipInput}
        type="file"
        accept=".zip"
        hidden
        data-testid="firmware-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void file.arrayBuffer().then((b) => choose(new Uint8Array(b), file.name));
          e.target.value = '';
        }}
      />
      {releases ? (
        <ul className="parts">
          {releases.slice(0, 5).map((r) => (
            <li key={r.tag} className="part">
              <strong>{r.name}</strong>
              <span className="text-muted-foreground text-sm">{r.published.slice(0, 10)}</span>
              {r.assets
                .filter((a) => /posix|win64/.test(a.name))
                .slice(0, 1)
                .map((a) => (
                  <Button
                    key={a.url}
                    variant="outline"
                    render={<a href={a.url} target="_blank" rel="noreferrer" />}
                  >
                    {t('firmware.download', { name: a.name })}
                  </Button>
                ))}
            </li>
          ))}
        </ul>
      ) : null}
      <SegmentedControl
        className="w-full flex-wrap *:flex-auto"
        role="group"
        aria-label={t('firmware.variant')}
      >
        {VARIANTS.map((v) => (
          <SegmentedControlItem
            key={v}
            pressed={variant === v}
            onClick={() => {
              setVariant(v);
              if (zip) choose(zip.data, zip.name, v);
            }}
          >
            {t(`firmware.variants.${v}`)}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
      {zip ? (
        <p>
          <code>{zip.name}</code> {releaseVersion(zip.name) ? `· ${releaseVersion(zip.name)}` : ''}
        </p>
      ) : null}
      {missing.length > 0 ? (
        <Alert variant="warning">{t('firmware.missing', { files: missing.join(', ') })}</Alert>
      ) : null}
      {images ? (
        <table className="table-list" data-testid="firmware-images">
          <tbody>
            {images.map((i) => (
              <tr key={i.address}>
                <td>
                  <code>0x{i.address.toString(16)}</code>
                </td>
                <td>{i.file}</td>
                <td className="num">{formatNumber(i.data.length / 1024)} KB</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {images ? <Alert variant="success">{t('firmware.configSafe')}</Alert> : null}
      <HoldButton
        variant="danger"
        duration={1500}
        disabled={!supported || !images || busy}
        onConfirm={() => void flash()}
      >
        {busy ? t('firmware.flashing') : t('firmware.flash')}
      </HoldButton>
      {progress !== null ? (
        <Progress aria-label={t('firmware.progress')} value={Math.round(progress * 100)} />
      ) : null}
      {log.length > 0 ? <pre className="config-text">{log.join('\n')}</pre> : null}
    </Card>
  );
}
