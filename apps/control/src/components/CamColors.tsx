import { t } from '../i18n';
import {
  COLOR_IDS,
  colorCount,
  colorOf,
  colorsInUse,
  isColorId,
  type ColorId,
  type ColorValues,
} from '../lib/camGroups';
import type { MessageKey } from '../i18n';
import { isSelected, partsOf } from '../lib/camItems';
import { formatNumber } from '../lib/format';
import { useCam } from '../store/cam';
import { useUi } from '../store/ui';
import { useWorkshop } from '../store/workshop';
import { mm, NumberField } from './camParts';
import { Deviation, Depth } from './Depth';
import { Fold } from './Fold';
import { Field, FieldLabel } from '../ui/field';
import { NativeSelect } from '../ui/native-select';
import type { ReactNode } from 'react';

/** The letter of a colour as it is written: "A" */
export const colorLetter = (id: ColorId) => id.toUpperCase();

/** The name of a colour: "Orange" */
export const colorName = (id: ColorId) => t(`cam.colors.names.${id}`);

/** What a colour is called to assistive technology: "Farbe A, Orange" */
export const colorLabel = (id: ColorId) =>
  t('cam.colors.pill', { letter: colorLetter(id), name: colorName(id) });

/**
 * A setting of a project file that was left out, in words – what `parseProject` reports as `dropped`: a cutting
 * setting by its name in the list of settings, a value of a colour as "Farbe A, Orange: Tiefe (mm)".
 */
export function droppedName(key: string): string {
  const [head, id, field, sub] = key.split('.');
  // The peck of a hole that would have made too many passes, by the hole's number in the list: `peck.3`
  if (head === 'peck') return t('cam.project.peckDropped', { n: id ?? '' });
  if (head !== 'colors') return t(`cam.${key === 'tabs' ? 'tabCount' : key}` as 'cam.depth');
  if (!isColorId(id)) return t('cam.colors.droppedTable');
  const named: Record<string, MessageKey> = {
    depth: 'cam.colors.depth',
    engraveDepth: 'cam.colors.engraveDepth',
    climb: 'cam.colors.direction',
    toolId: 'cam.colors.tool',
  };
  const tabs: Record<string, MessageKey> = {
    count: 'cam.colors.tabCount',
    width: 'cam.colors.tabWidth',
    height: 'cam.colors.tabHeight',
  };
  const what =
    field === 'tabs' ? (tabs[sub ?? ''] ?? 'cam.colors.tabs') : (named[field ?? ''] ?? null);
  return what === null
    ? colorLabel(id)
    : t('cam.colors.droppedOf', { letter: colorLetter(id), field: t(what) });
}

/**
 * The colour of a part in the head of its row: a small mark of a fixed size – the letter in the text colour on the
 * card's fill, the colour only as the frame – so a part that gets a colour changes no height and no width but the
 * name's (it is cut short on one line). The letter says the colour; the frame agrees.
 */
export function ColorPill({ id }: { id: ColorId }) {
  const label = colorLabel(id);
  return (
    <span
      className="cam-color-pill"
      data-color={id}
      data-testid="cam-color-pill"
      role="img"
      aria-label={label}
      title={label}
    >
      <span aria-hidden="true">{colorLetter(id)}</span>
    </span>
  );
}

/**
 * "Farbe" of the selection: one choice for every part that is selected (a file with fifty contours is one tap, not
 * fifty). Mixed colours show "verschieden". Always the same height, with any selection, so the rows below it never
 * move; a selection of nothing but registration holes has none (they cannot have one).
 */
export function ColorSelect() {
  const project = useCam((s) => s.project);
  const selected = useCam((s) => s.selected);
  if (!project) return null;
  const parts = partsOf(project.items.filter((i) => isSelected(i, selected)));
  if (parts.length === 0) return null;
  const mine = new Set(parts.map((i) => colorOf(i) ?? ''));
  const value = mine.size === 1 ? [...mine][0]! : 'mixed';
  return (
    <Field data-find="cam-color" data-testid="cam-color">
      <FieldLabel>{t('cam.colors.select')}</FieldLabel>
      <NativeSelect
        aria-label={t('cam.colors.select')}
        data-testid="cam-color-select"
        value={value}
        onChange={(e) =>
          useCam.getState().setColor(e.target.value === '' ? null : (e.target.value as ColorId))
        }
      >
        {value === 'mixed' ? (
          <option value="mixed" disabled>
            {t('cam.colors.mixed')}
          </option>
        ) : null}
        <option value="">{t('cam.colors.none')}</option>
        {COLOR_IDS.map((id) => (
          <option key={id} value={id}>
            {t('cam.colors.option', { letter: colorLetter(id), name: colorName(id) })}
          </option>
        ))}
      </NativeSelect>
    </Field>
  );
}

/**
 * A labelled control of a colour's card. The label is plain text and the control carries its own name ("Tiefe (mm)
 * von Farbe A": the visible label first): four colours in one card must not each have a field called "Tiefe (mm)", and
 * a Base UI `FieldLabel` would take the name over from the control.
 */
function Labelled({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col items-stretch gap-1.5">
      <span className="inline-flex items-center gap-2 font-medium text-foreground text-sm/4.5">
        {label}
      </span>
      {children}
    </div>
  );
}

/** A cutter as the lists name it: "T2 V-Fräser (Ø 6,0)" */
const toolText = (x: { number: number; name: string; diameter: number }) =>
  `T${x.number} ${x.name} (Ø ${formatNumber(x.diameter, 1)})`;

const DIRECTIONS = ['job', 'climb', 'conventional'] as const;

/** One colour in use: its parts, and what it sets for them */
function ColorCard({ id }: { id: ColorId }) {
  const items = useCam((s) => s.project?.items);
  const values: ColorValues = useCam((s) => s.project?.colors?.[id]) ?? {};
  const settings = useCam((s) => s.settings);
  const tools = useWorkshop((s) => s.tools);
  const cam = useCam.getState();
  const letter = colorLetter(id);
  const { parts, hidden } = colorCount(items ?? [], id);
  const choosable = tools.filter((x) => x.probe !== true);
  const drawingTool = tools.find((x) => x.id === settings.toolId);
  const chosen = tools.find((x) => x.id === values.toolId);
  // A field with a value that differs from the drawing's carries the dot (§2): seen, never prevented
  const differs = (own: number | undefined, usual: number) => own !== undefined && own !== usual;
  const number = (key: 'depth' | 'engraveDepth', visible: string, name: string, usual: number) => (
    <Labelled
      label={
        <>
          {visible}
          {differs(values[key], usual) ? (
            <Deviation from="drawing" recommended={`${mm(usual)} mm`} />
          ) : null}
        </>
      }
    >
      <NumberField
        bare
        label={{ text: name }}
        value={values[key]}
        min={0.01}
        placeholder={mm(usual)}
        onChange={(v) => cam.setColorValue(id, { [key]: v })}
      />
    </Labelled>
  );
  const tab = (
    key: 'count' | 'width' | 'height',
    visible: string,
    name: string,
    usual: number,
    min: number,
  ) => (
    <Labelled
      label={
        <>
          {visible}
          {differs(values.tabs?.[key], usual) ? (
            // (the number of tabs is a bare number, the others are millimetres)
            <Deviation
              from="drawing"
              recommended={key === 'count' ? mm(usual) : `${mm(usual)} mm`}
            />
          ) : null}
        </>
      }
    >
      <NumberField
        bare
        label={{ text: name }}
        value={values.tabs?.[key]}
        min={min}
        placeholder={mm(usual)}
        onChange={(v) => cam.setColorValue(id, { tabs: { [key]: v } })}
      />
    </Labelled>
  );
  return (
    <section className="cam-color-card" data-testid={`cam-color-${id}`} aria-label={colorLabel(id)}>
      <div className="cam-color-head">
        <span className="cam-color-pill" data-color={id} aria-hidden="true">
          <span>{letter}</span>
        </span>
        <strong>{t('cam.colors.option', { letter, name: colorName(id) })}</strong>
        <span className="text-muted-foreground text-sm" data-testid={`cam-color-${id}-count`}>
          {t('cam.colors.parts', { n: parts })}
          {hidden > 0 ? ` · ${t('cam.colors.hiddenParts', { n: hidden })}` : ''}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {number(
          'depth',
          t('cam.colors.depth'),
          t('cam.colors.depthOf', { letter }),
          settings.depth,
        )}
        {number(
          'engraveDepth',
          t('cam.colors.engraveDepth'),
          t('cam.colors.engraveDepthOf', { letter }),
          settings.engraveDepth,
        )}
      </div>
      <Labelled label={t('cam.colors.direction')}>
        <NativeSelect
          aria-label={t('cam.colors.directionOf', { letter })}
          data-testid={`cam-color-${id}-direction`}
          value={values.climb === undefined ? 'job' : values.climb ? 'climb' : 'conventional'}
          onChange={(e) =>
            cam.setColorValue(id, {
              climb: e.target.value === 'job' ? undefined : e.target.value === 'climb',
            })
          }
        >
          {DIRECTIONS.map((d) => (
            <option key={d} value={d}>
              {d === 'job'
                ? t('cam.colors.likeDrawing', {
                    value: t(
                      settings.climb ? 'cam.directions.climb' : 'cam.directions.conventional',
                    ),
                  })
                : t(`cam.directions.${d}`)}
            </option>
          ))}
        </NativeSelect>
      </Labelled>
      <Labelled label={t('cam.colors.tool')}>
        <NativeSelect
          aria-label={t('cam.colors.toolOf', { letter })}
          data-testid={`cam-color-${id}-tool`}
          value={values.toolId ?? ''}
          onChange={(e) =>
            cam.setColorValue(id, { toolId: e.target.value === '' ? undefined : e.target.value })
          }
        >
          <option value="">
            {t('cam.tools.likeDrawing', {
              tool: drawingTool
                ? toolText(drawingTool)
                : t('cam.tools.gone', { id: settings.toolId }),
            })}
          </option>
          {values.toolId !== undefined && !choosable.some((x) => x.id === values.toolId) ? (
            <option value={values.toolId}>{t('cam.tools.gone', { id: values.toolId })}</option>
          ) : null}
          {choosable.map((x) => (
            <option key={x.id} value={x.id}>
              {toolText(x)}
            </option>
          ))}
        </NativeSelect>
        {chosen && chosen.kind !== 'flat' ? (
          <p className="text-muted-foreground text-sm">{t('cam.colors.toolHint')}</p>
        ) : null}
      </Labelled>
      <Depth
        area={`camColor${letter}`}
        more={
          <div className="grid grid-cols-3 gap-2">
            {tab(
              'count',
              t('cam.colors.tabCount'),
              t('cam.colors.tabCountOf', { letter }),
              settings.tabs.count,
              0,
            )}
            {tab(
              'width',
              t('cam.colors.tabWidth'),
              t('cam.colors.tabWidthOf', { letter }),
              settings.tabs.width,
              0.1,
            )}
            {tab(
              'height',
              t('cam.colors.tabHeight'),
              t('cam.colors.tabHeightOf', { letter }),
              settings.tabs.height,
              0.1,
            )}
          </div>
        }
      />
    </section>
  );
}

/**
 * "Farbgruppen", below the list (what the finger just tapped in the list must not move away): only the colours some
 * part carries, each with its parts and what it sets – depth, engraving depth, direction, cutter and, under "Mehr
 * Optionen", the defaults of the tabs – and one sentence about what a colour does not do. Folded until it is opened
 * once, then as it was left.
 */
export function ColorGroups() {
  const items = useCam((s) => s.project?.items);
  const open = useUi((s) => s.depth.camColors === 'more');
  const used = colorsInUse(items ?? []);
  return (
    <Fold
      title={t('cam.colors.title')}
      find="cam-colors"
      testId="cam-colors"
      open={open}
      onOpenChange={(next) => useUi.getState().setDepth('camColors', next ? 'more' : 'simple')}
    >
      {used.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('cam.colors.empty')}</p>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">{t('cam.colors.hint')}</p>
          {used.map((id) => (
            <ColorCard key={id} id={id} />
          ))}
        </>
      )}
    </Fold>
  );
}
