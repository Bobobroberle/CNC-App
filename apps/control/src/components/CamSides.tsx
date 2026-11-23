import { distance, PIN_DEPTH, registrationDiameter, type FlipAxis } from '@lowrider/cam';
import { t } from '../i18n';
import { holeCentre, itemsBounds, partsOf } from '../lib/camItems';
import { formatNumber } from '../lib/format';
import { flipMethod, knownThickness, useCam } from '../store/cam';
import { useMachine } from '../store/machine';
import { cameraCalibrated } from '../store/photomap';
import { useWorkshop } from '../store/workshop';
import { mm, NumberField } from './camParts';
import { FlipPicture } from './FlipPicture';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { SegmentedControl, SegmentedControlItem } from '../ui/segmented-control';

const AXES: FlipAxis[] = ['x', 'y'];

/**
 * Machining the part from both sides, in the drawing: one switch, and with
 * it on, how the part is turned over, how thick it is and how it is found
 * again. The two registration holes appear on the table by themselves.
 */
export function CamSides() {
  const project = useCam((s) => s.project);
  const toolId = useCam((s) => s.settings.toolId);
  const tools = useWorkshop((s) => s.tools);
  // The camera and the stock decide what is offered here.
  const camera = useWorkshop((s) => s.settings.camera);
  useWorkshop((s) => s.setup.stock);
  useMachine((s) => s.connection);
  const known = knownThickness();
  const cam = useCam.getState();
  if (!project) return null;
  const two = project.twoSided;
  const box = itemsBounds(partsOf(project.items));
  const holes = project.items.filter((i) => i.registration !== undefined);
  const tool = tools.find((x) => x.id === toolId)?.diameter ?? 6;
  const d = registrationDiameter(tool);
  const method = two ? flipMethod(two) : 'pins';
  // Which way round is "over the long side": the flip line runs along that side.
  const tall = box ? box.maxY - box.minY - (box.maxX - box.minX) : 0;
  const over = (axis: FlipAxis) =>
    Math.abs(tall) < 0.5 ? null : (axis === 'x') === tall > 0 ? 'long' : 'short';

  return (
    <div className="cam-sides" data-testid="cam-sides" data-find="cam-sides">
      <Label className="min-h-target gap-3 font-normal">
        <Checkbox
          checked={two !== null}
          onCheckedChange={(checked) => cam.setTwoSided(checked ? {} : null)}
        />
        <span>{t('flip.both')}</span>
      </Label>
      {two ? (
        <>
          <p className="text-muted-foreground text-sm">{t('flip.intro')}</p>
          <div className="flip-ways" role="group" aria-label={t('flip.way')}>
            {AXES.map((axis) => {
              const side = over(axis);
              return (
                <button
                  key={axis}
                  type="button"
                  className={`flip-way${two.axis === axis ? ' active' : ''}`}
                  aria-pressed={two.axis === axis}
                  onClick={() => cam.setTwoSided({ axis })}
                >
                  <FlipPicture axis={axis} />
                  <strong>{t(`flip.ways.${axis}`)}</strong>
                  <span className="text-muted-foreground text-sm">
                    {t(`flip.swaps.${axis}`)}
                    {side ? ` · ${t(`flip.over.${side}`)}` : ''}
                  </span>
                </button>
              );
            })}
          </div>
          <NumberField
            label="flip.thickness"
            value={two.thickness}
            min={0.1}
            placeholder={known === undefined ? '' : mm(known)}
            onChange={(v) => cam.setTwoSided({ thickness: v })}
          />
          {two.thickness === undefined && known !== undefined ? (
            <p className="text-muted-foreground text-sm">
              {t('flip.thicknessFromStock', { mm: mm(known) })}
            </p>
          ) : null}
          {cameraCalibrated(camera) ? (
            <SegmentedControl role="group" aria-label={t('flip.find')}>
              {(['camera', 'pins'] as const).map((m) => (
                <SegmentedControlItem
                  key={m}
                  pressed={method === m}
                  onClick={() => cam.setTwoSided({ pins: m === 'pins' })}
                >
                  {t(`flip.methods.${m}`)}
                </SegmentedControlItem>
              ))}
            </SegmentedControl>
          ) : null}
          <p className="text-muted-foreground text-sm" data-testid="flip-method">
            {method === 'camera'
              ? t('flip.byCamera', { d: mm(d) })
              : t(cameraCalibrated(camera) ? 'flip.byPins' : 'flip.byPinsNoCamera', {
                  d: mm(d),
                  into: mm(PIN_DEPTH),
                })}
          </p>
          {holes.length === 2 ? (
            <div className="flex gap-3 justify-between">
              <p className="text-muted-foreground text-sm tabular-nums" data-testid="flip-holes">
                {t('flip.holes', {
                  d: mm(d),
                  apart: formatNumber(distance(holeCentre(holes[0]!), holeCentre(holes[1]!)), 0),
                })}
              </p>
              {two.autoHoles ? null : (
                <Button variant="outline" size="sm" onClick={cam.proposeHoles}>
                  {t('flip.proposeHoles')}
                </Button>
              )}
            </div>
          ) : null}
          <p className="text-muted-foreground text-sm">{t('flip.holesHint')}</p>
        </>
      ) : null}
    </div>
  );
}
