import type { AnySketch, AnySketchType } from '@lowrider/cam';
import { useRef, useState } from 'react';
import { t, tDynamic } from '../i18n';
import { MORE_SHAPES, SHAPES, START } from '../lib/camStart';
import { PROJECT_MAX_BYTES } from '../lib/camProject';
import { formatNumber } from '../lib/format';
import { tableBox } from '../lib/tableBox';
import { useCam } from '../store/cam';
import { useMachine } from '../store/machine';
import { useUi } from '../store/ui';
import { focusNewText } from './CamArrange';
import { droppedName } from './CamColors';
import { Fold } from './Fold';
import { Icon, type IconName } from './Icon';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';

const ICONS: Record<AnySketchType, IconName> = {
  rect: 'rect',
  circle: 'circle',
  slot: 'slot',
  grid: 'grid',
  text: 'text',
  ellipse: 'ellipse',
  star: 'star',
  gear: 'gear',
  spiral: 'spiral',
};

/**
 * What is to be made, one tap each: a shape or a text appears on the table
 * picture at once, selected, where the eye is – its size, place and words
 * are changed there and in the fields of the selection. A DXF or SVG file
 * comes in the same way.
 */
export function CamAdd() {
  const project = useCam((s) => s.project);
  const more = useUi((s) => s.depth.camShapes === 'more');
  const cam = useCam.getState();
  const addLog = useMachine((s) => s.addLog);
  const fileInput = useRef<HTMLInputElement>(null);
  const projectInput = useRef<HTMLInputElement>(null);
  /** The last file held nothing that can be cut */
  const [empty, setEmpty] = useState(false);
  if (!project) return null;

  const skipped = Object.entries(project.skipped);
  const add = (sketch: AnySketch) => {
    setEmpty(false);
    cam.addSketch(sketch, tableBox());
  };

  return (
    <div className="cam-add" data-testid="cam-add">
      <div className="cam-tools" role="group" aria-label={t('cam.addShape')}>
        {SHAPES.map((shape) => (
          <Button
            key={shape}
            variant="outline"
            data-find={`shape-${shape}`}
            onClick={() => add(START[shape])}
          >
            <Icon name={ICONS[shape]} size={22} />
            <span>{t(`cam.shapes.${shape}`)}</span>
          </Button>
        ))}
        <Button
          variant="outline"
          data-find="shape-text"
          onClick={() => {
            add({
              type: 'text',
              text: t('cam.text.sample'),
              height: 20,
              spacing: 0,
              lineSpacing: 1.6,
              align: 'center',
            });
            // The words are typed next: the field takes the keyboard.
            focusNewText();
          }}
        >
          <Icon name="text" size={22} />
          <span>{t('cam.shapes.text')}</span>
        </Button>
        <Button variant="outline" data-find="shape-file" onClick={() => fileInput.current?.click()}>
          <Icon name="file" size={22} />
          <span>{t('cam.importFile')}</span>
        </Button>
      </div>
      {/* Seldom needed: folded away until opened once, then as it was left (DESIGN.md §2) */}
      <Fold
        title={t('cam.moreShapes')}
        testId="cam-shapes-more"
        open={more}
        onOpenChange={(next) => useUi.getState().setDepth('camShapes', next ? 'more' : 'simple')}
      >
        <div className="cam-tools" role="group" aria-label={t('cam.moreShapes')}>
          {MORE_SHAPES.map((shape) => (
            <Button
              key={shape}
              variant="outline"
              data-find={`shape-${shape}`}
              onClick={() => add(START[shape])}
            >
              <Icon name={ICONS[shape]} size={22} />
              <span>{t(`cam.shapes.${shape}`)}</span>
            </Button>
          ))}
        </div>
      </Fold>
      {project.items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('cam.addHint')}</p>
      ) : null}
      {/* A saved drawing replaces this one (one step of undo brings it back): its own control, not "Datei". */}
      <Button
        variant="outline"
        data-find="project-open"
        data-testid="cam-project-open"
        onClick={() => projectInput.current?.click()}
      >
        {t('cam.project.open')}
      </Button>
      {/* Only where there is a keyboard to press them on; the keys themselves are on their sheet. */}
      <p className="text-muted-foreground text-sm cam-keys">{t('find.shortcuts.hint')}</p>
      {empty ? <Alert variant="warning">{t('cam.fileEmpty')}</Alert> : null}
      {skipped.length > 0 ? (
        <Alert variant="warning">
          {t('cam.skipped', { list: skipped.map(([k, n]) => `${n}× ${k}`).join(', ') })}
        </Alert>
      ) : null}
      {project.notes.length > 0 ? (
        <ul className="diagnostics" data-testid="cam-notes">
          {project.notes.map((n) => (
            <li key={n.code} className="warning">
              {tDynamic(`cam.notes.${n.code}`, 'cam.notes.svg-element', { count: n.count })}
            </li>
          ))}
        </ul>
      ) : null}
      <input
        ref={projectInput}
        type="file"
        accept=".json,application/json"
        hidden
        data-testid="cam-project-file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          const failed = (code: string) =>
            addLog(
              'error',
              t(`cam.project.errors.${code}` as 'cam.project.errors.invalid-json'),
              'cam.project.error',
            );
          // Too large to be a drawing: refused before it is read
          if (file.size > PROJECT_MAX_BYTES) return failed('too-large');
          void file.text().then((content) => {
            const result = cam.openProject(content);
            if ('error' in result) return failed(result.error);
            setEmpty(false);
            addLog(
              'info',
              t('cam.project.opened', { name: useCam.getState().project?.name ?? '' }),
            );
            if (result.toolMissing) {
              addLog('error', t('cam.project.toolMissing'), 'cam.project.toolMissing');
            }
            if (result.dropped) {
              const names = result.dropped.map(droppedName);
              addLog(
                'error',
                t('cam.project.settingsDropped', { list: names.join(', ') }),
                'cam.project.settingsDropped',
              );
            }
            // Tools of single parts: one the list lacks stays chosen (the part is cut with the drawing's meanwhile) – said
            if (result.partTools?.missing.length) {
              addLog(
                'error',
                t('cam.project.partToolsMissing', { list: result.partTools.missing.join(', ') }),
                'cam.project.partToolsMissing',
              );
            }
            if (result.partTools?.differ.length) {
              addLog(
                'error',
                t('cam.project.partToolsDiffer', {
                  list: result.partTools.differ
                    .map(
                      (d) =>
                        `${d.name} (${formatNumber(d.file, 2)} → ${formatNumber(d.now, 2)} mm)`,
                    )
                    .join(', '),
                }),
                'cam.project.partToolsDiffer',
              );
            }
            if (result.toolDiffers) {
              addLog(
                'error',
                t('cam.project.toolDiffers', {
                  file: formatNumber(result.toolDiffers.file, 2),
                  now: formatNumber(result.toolDiffers.now, 2),
                }),
                'cam.project.toolDiffers',
              );
            }
          });
        }}
      />
      <input
        ref={fileInput}
        type="file"
        accept=".dxf,.svg,image/svg+xml"
        hidden
        data-testid="cam-file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          void file.text().then((content) => {
            try {
              const before = useCam.getState().project?.items.length ?? 0;
              cam.importFile(file.name, content);
              setEmpty((useCam.getState().project?.items.length ?? 0) === before);
            } catch (error) {
              addLog(
                'error',
                t('cam.fileError', { reason: (error as Error).message }),
                'cam.fileError',
              );
            }
          });
        }}
      />
    </div>
  );
}
