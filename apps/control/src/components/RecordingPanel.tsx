import { useEffect, useState } from 'react';
import { t } from '../i18n';
import type { Recording, RecordingMode } from '../lib/companion';
import { formatDuration, formatNumber, getLocale } from '../lib/format';
import { recordingSeconds, useRecording } from '../store/recording';
import { useTimelapse } from '../store/timelapse';
import { companion, useWorkshop } from '../store/workshop';
import { HoldButton } from './HoldButton';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Field, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { SegmentedControl, SegmentedControlItem } from '../ui/segmented-control';
import { Badge } from '../ui/badge';

const MODES: RecordingMode[] = ['timelapse', 'video', 'both'];
/** The list refreshes this often while the card is open */
const REFRESH_MS = 5000;

const megabytes = (bytes: number) => `${formatNumber(bytes / 1e6, bytes < 1e8 ? 1 : 0)} MB`;

/** The browser timelapse, for when the companion cannot record. */
function BrowserTimelapse() {
  const lapse = useTimelapse();
  return (
    <>
      <Label className="min-h-target gap-3 font-normal">
        <Checkbox
          checked={lapse.enabled}
          onCheckedChange={(checked) => lapse.setEnabled(checked)}
        />
        <span>{t('recording.browserOn')}</span>
      </Label>
      <Field>
        <FieldLabel>{t('camera.interval')}</FieldLabel>
        <Input
          type="text"
          inputMode="numeric"
          value={String(lapse.seconds)}
          onChange={(e) => lapse.setSeconds(Number(e.target.value.replace(/\D/g, '')) || 1)}
        />
      </Field>
    </>
  );
}

function RecordingItem({
  r,
  playing,
  play,
}: {
  r: Recording;
  playing: string | null;
  play: (key: string | null) => void;
}) {
  const c = companion();
  const remove = useRecording((s) => s.remove);
  const date = new Date(r.startedAt).toLocaleString(getLocale(), {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const reason = r.stopReason ? t(`recording.reasons.${r.stopReason}`) : '';
  const files = (['timelapse', 'video'] as const).filter((k) => r[k] !== null);
  return (
    <li className="recording" data-testid="recording-item">
      <div className="recording-head">
        <strong>{r.jobName || r.id}</strong>
        <span className="text-muted-foreground text-sm tabular-nums">
          {t('recording.item', { date, duration: formatDuration(recordingSeconds(r)) })}
        </span>
        <Badge variant={r.state === 'failed' ? 'error' : 'outline'}>
          {t(`recording.states.${r.state}`)}
          {reason ? ` · ${reason}` : ''}
        </Badge>
      </div>
      {r.error && r.state === 'failed' ? (
        <p className="text-muted-foreground text-sm">{r.error}</p>
      ) : null}
      {c && files.length > 0 ? (
        <div className="flex gap-3 flex-wrap">
          {files.map((kind) => (
            <Button
              key={kind}
              variant="outline"
              className="flex-1"
              aria-pressed={playing === `${r.id}:${kind}`}
              onClick={() => play(playing === `${r.id}:${kind}` ? null : `${r.id}:${kind}`)}
            >
              {t(kind === 'video' ? 'recording.watchVideo' : 'recording.watchTimelapse')} (
              {megabytes(r[kind]!.size)})
            </Button>
          ))}
        </div>
      ) : null}
      {c &&
        files.map((kind) =>
          playing === `${r.id}:${kind}` ? (
            <div key={kind} className="recording-player">
              <video
                controls
                playsInline
                preload="metadata"
                src={c.recordingUrl(r.id, kind)}
                data-testid="recording-video"
              />
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  render={<a href={c.recordingUrl(r.id, kind, true)} download />}
                >
                  {t('recording.download')}
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => play(null)}>
                  {t('recording.close')}
                </Button>
              </div>
            </div>
          ) : null,
        )}
      {r.state !== 'recording' && r.state !== 'encoding' ? (
        <HoldButton onConfirm={() => void remove(r.id)}>{t('recording.remove')}</HoldButton>
      ) : null}
    </li>
  );
}

/**
 * Recording of the tool camera on the companion during jobs: settings, the
 * running recording and the list to watch, download and delete. Without a
 * companion that can record, the browser timelapse stands in.
 */
export function RecordingPanel() {
  const list = useRecording((s) => s.list);
  const unavailable = useRecording((s) => s.unavailable);
  const busy = useRecording((s) => s.busy);
  const { refresh, start, stop } = useRecording.getState();
  const settings = useWorkshop((s) => s.settings.recording);
  const companionUrl = useWorkshop((s) => s.settings.companionUrl);
  const { setSettings } = useWorkshop.getState();
  const [playing, setPlaying] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const set = (patch: Partial<typeof settings>) =>
    setSettings({ recording: { ...settings, ...patch } });

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void refresh();
      setTick((n) => n + 1);
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh, companionUrl]);

  const active = list?.active ?? null;
  const caps = list?.capabilities;

  return (
    <div className="recording-panel" data-testid="recording-panel">
      {unavailable ? (
        <>
          <Alert variant="warning" data-testid="recording-unavailable">
            {t(
              unavailable === 'no-companion'
                ? 'recording.noCompanion'
                : unavailable === 'outdated'
                  ? 'recording.outdated'
                  : 'recording.noFfmpeg',
            )}
          </Alert>
          <BrowserTimelapse />
        </>
      ) : null}
      {list && !unavailable ? (
        <>
          <p className="text-muted-foreground text-sm">{t('recording.hint')}</p>
          <Label className="min-h-target gap-3 font-normal">
            <Checkbox
              checked={settings.auto}
              onCheckedChange={(checked) => set({ auto: checked })}
            />
            <span>{t('recording.auto')}</span>
          </Label>
          <SegmentedControl role="group" aria-label={t('recording.mode')}>
            {MODES.map((m) => (
              <SegmentedControlItem
                key={m}
                pressed={settings.mode === m}
                onClick={() => set({ mode: m })}
              >
                {t(`recording.modes.${m}`)}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
          {settings.mode !== 'video' ? (
            <>
              <Field>
                <FieldLabel>{t('recording.interval')}</FieldLabel>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={String(settings.intervalSeconds)}
                  onChange={(e) =>
                    set({
                      intervalSeconds: Math.min(
                        600,
                        Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1),
                      ),
                    })
                  }
                />
              </Field>
              <Label className="min-h-target gap-3 font-normal">
                <Checkbox
                  checked={settings.safeHeightOnly && Boolean(caps?.observe)}
                  disabled={!caps?.observe}
                  onCheckedChange={(checked) => set({ safeHeightOnly: checked })}
                />
                <span>{t('recording.safeHeight')}</span>
              </Label>
              {!caps?.observe ? (
                <p className="text-muted-foreground text-sm">
                  {t('recording.safeHeightNeedsRelay')}
                </p>
              ) : null}
            </>
          ) : null}
          {settings.mode !== 'timelapse' ? (
            <p className="text-muted-foreground text-sm">{t('recording.videoSize')}</p>
          ) : null}
          {active ? (
            <>
              <Alert variant="warning" className="tabular-nums" data-testid="recording-active">
                {t('recording.running', {
                  time: formatDuration(recordingSeconds(active)),
                  mode: t(`recording.modes.${active.mode}`),
                  frames: active.frames,
                })}
              </Alert>
              <Button variant="outline" onClick={() => void stop()}>
                {t('recording.stopNow')}
              </Button>
            </>
          ) : (
            <Button reason="machine" variant="outline" disabled={busy} onClick={() => void start()}>
              {t('recording.startNow')}
            </Button>
          )}
          <h3 className="font-medium text-muted-foreground text-sm">{t('recording.list')}</h3>
          {list.recordings.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('recording.none')}</p>
          ) : (
            <ul className="recordings">
              {list.recordings.map((r) => (
                <RecordingItem key={r.id} r={r} playing={playing} play={setPlaying} />
              ))}
            </ul>
          )}
        </>
      ) : null}
    </div>
  );
}
