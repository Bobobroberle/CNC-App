import { FileUpIcon, PenLineIcon } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { t } from '../i18n';
import { formatCoordinate, formatDuration, formatNumber } from '../lib/format';
import { PREVIEW_BOX, previewPath } from '../lib/preview';
import { toolForJob } from '../lib/setup';
import demo from '../samples/demo.nc?raw';
import { useCam } from '../store/cam';
import { useJob } from '../store/job';
import { useMachine } from '../store/machine';
import {
  openJobFiles,
  openRecent,
  requestOpenFile,
  sizeOf,
  useRecent,
  type RecentJob,
} from '../store/recent';
import { useUi } from '../store/ui';
import { useWorkshop } from '../store/workshop';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardTitle } from '../ui/card';
import { Reason } from '../ui/tooltip';

/** The cutting moves of a job from above, small. */
function JobPreview({ path }: { path: string }) {
  return (
    <svg
      className="job-preview"
      viewBox={`0 0 ${PREVIEW_BOX} ${PREVIEW_BOX}`}
      aria-hidden="true"
      data-testid="job-preview"
    >
      {path ? <path d={path} /> : null}
    </svg>
  );
}

const sizeText = (size: RecentJob['size']) =>
  size
    ? t('jobCard.size', {
        x: formatNumber(size.x, 0),
        y: formatNumber(size.y, 0),
        z: formatNumber(size.z, 1),
      })
    : t('jobCard.noCut');

/** Opens the drawing workspace (CAM) on the table, seen from above. */
function openDrawing() {
  useCam.getState().open();
  useUi.getState().setDrawing(true);
  useJob.getState().setProjection('top');
}

/**
 * The file dialog of step ①, there once whatever the step shows: the action
 * bar's "G-Code öffnen" and the buttons of the cards all open this one. It
 * takes several files at once.
 */
export function JobFileInput() {
  const input = useRef<HTMLInputElement>(null);
  const request = useRecent((s) => s.openRequest);
  const seen = useRef(request);
  useEffect(() => {
    if (request === seen.current) return;
    seen.current = request;
    input.current?.click();
  }, [request]);
  return (
    <input
      ref={input}
      type="file"
      accept=".nc,.gcode,.gc,.ngc,.tap,.cnc,.txt"
      multiple
      hidden
      data-testid="file-input"
      onChange={(e) => {
        const files = [...(e.target.files ?? [])];
        if (files.length > 0) void openJobFiles(files);
        e.target.value = '';
      }}
    />
  );
}

/** The loaded program as its card: picture, name, size, time, tool and zero. */
function LoadedJob() {
  const fileName = useJob((s) => s.fileName);
  const analysis = useJob((s) => s.analysis);
  const toolDiameter = useJob((s) => s.toolDiameter);
  const parser = useMachine((s) => s.parserState);
  const tools = useWorkshop((s) => s.tools);
  const toolMap = useWorkshop((s) => s.setup.toolMap);
  const headerDiameter = useJob((s) => s.header?.tools.find((x) => x.diameter)?.diameter);
  const path = useMemo(() => (analysis ? previewPath(analysis.segments) : ''), [analysis]);
  if (!fileName || !analysis) return null;
  const toolNumber = parser?.tool || analysis.tools[0] || 0;
  const tool = toolForJob(tools, toolMap, toolNumber, headerDiameter);
  const toolText = `${toolNumber ? `T${toolNumber} · ` : ''}Ø ${formatNumber(tool?.diameter ?? toolDiameter, 1)} mm${
    analysis.tools.length > 1 ? ` (+${analysis.tools.length - 1})` : ''
  }`;
  return (
    <Card className="job-card job-card-loaded" data-testid="job-loaded">
      <JobPreview path={path} />
      <div className="job-card-text">
        <span className="tile-label">{t('dash.program')}</span>
        <strong className="dash-title">{fileName}</strong>
        <dl className="dash-facts">
          <div>
            <dt>{t('jobCard.sizeLabel')}</dt>
            <dd>{sizeText(sizeOf(analysis.cutBounds))}</dd>
          </div>
          <div>
            <dt>{t('dash.estimate')}</dt>
            <dd>{formatDuration(analysis.timeline?.total ?? 0)}</dd>
          </div>
          <div>
            <dt>{t('dash.tool')}</dt>
            <dd>{toolText}</dd>
          </div>
          <div>
            <dt>{t('dash.zero')}</dt>
            <dd>{parser?.wcs ?? 'G54'}</dd>
          </div>
        </dl>
      </div>
    </Card>
  );
}

/** "Zuletzt verwendet": the jobs opened here before, each with its picture and its last zero. */
function RecentJobs() {
  const jobs = useRecent((s) => s.jobs);
  const loaded = useJob((s) => s.fileName);
  const others = jobs.filter((j) => j.name !== loaded);
  if (others.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" data-testid="recent-jobs" data-find="recent">
      <h2 className="font-heading font-semibold text-base">{t('jobCard.recent')}</h2>
      <ul className="job-cards">
        {others.map((job) => {
          const zero = job.zeros[0];
          const card = (
            <button
              type="button"
              className="job-card job-card-button"
              disabled={!job.text}
              onClick={() => openRecent(job.name)}
            >
              <JobPreview path={job.preview} />
              <span className="job-card-text">
                <strong className="dash-title">{job.name}</strong>
                <span className="text-muted-foreground text-sm tabular-nums">
                  {sizeText(job.size)} · {formatDuration(job.seconds)}
                </span>
                <span className="text-muted-foreground text-sm tabular-nums">
                  {zero
                    ? t('jobCard.zero', {
                        wcs: zero.wcs,
                        x: formatCoordinate(zero.x, 1),
                        y: formatCoordinate(zero.y, 1),
                      })
                    : t('jobCard.noZero')}
                </span>
              </span>
            </button>
          );
          return (
            <li key={job.name}>
              {job.text ? (
                card
              ) : (
                <Reason reason={t('jobCard.tooLarge')} className="block w-full">
                  {card}
                </Reason>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * ① Job, the program: "Zuletzt verwendet" on top, the loaded job as its card
 * – or, with nothing loaded, the place to drop a file with one sentence – and
 * the ways to a program: open G-code (several files at once), draw one.
 * `compact` is the one-line form for the drawing workspace.
 */
export function JobDashboard({ compact = false }: { compact?: boolean }) {
  const fileName = useJob((s) => s.fileName);
  const analysis = useJob((s) => s.analysis);
  const load = useJob((s) => s.load);

  // In the drawing workspace: one line, so the drawing has the room.
  if (compact) {
    return (
      <div className="dash-line" data-testid="job-dashboard">
        <span className="dash-title">{fileName ?? t('dash.noProgram')}</span>
        {analysis ? (
          <span className="text-muted-foreground text-sm tabular-nums">
            {formatDuration(analysis.timeline?.total ?? 0)}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="job-dashboard" data-find="program">
      {fileName === null ? <RecentJobs /> : null}
      {fileName === null ? (
        // The empty state: one sentence and one action (DESIGN.md §9).
        <Card className="drop-zone" data-testid="drop-zone">
          <FileUpIcon aria-hidden="true" className="size-8 text-muted-foreground" />
          <CardTitle render={<h2 />}>{t('dash.noProgram')}</CardTitle>
          <p className="text-muted-foreground">{t('jobCard.drop')}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button variant="outline" onClick={openDrawing}>
              <PenLineIcon aria-hidden="true" />
              {t('cam.open')}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                load('demo.nc', demo);
                useRecent.getState().rememberLoaded();
              }}
            >
              {t('job.sample')}
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <LoadedJob />
          <div className="flex flex-wrap gap-3 dash-actions">
            <Button variant="outline" className="flex-1" onClick={requestOpenFile}>
              {t('jobCard.openOther')}
            </Button>
            <Button variant="outline" className="flex-1" onClick={openDrawing}>
              <PenLineIcon aria-hidden="true" />
              {t('cam.open')}
            </Button>
          </div>
          <RecentJobs />
        </>
      )}
      {analysis && analysis.tools.length > 1 ? (
        <Badge variant="outline" className="self-start">
          {t('jobCard.tools', { count: analysis.tools.length })}
        </Badge>
      ) : null}
    </div>
  );
}
