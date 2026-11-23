import { TAG_COUNT, TAG_SIZES, tagPaper, tagSvg } from '@lowrider/workshop';
import { useEffect, useLayoutEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../i18n';
import { downloadBlob } from '../lib/download';
import { useWorkshop } from '../store/workshop';
import { Button } from '../ui/button';
import { Field, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';
import { SegmentedControl, SegmentedControlItem } from '../ui/segmented-control';

/** Length of the line that shows whether the printer kept the scale, mm */
const RULER = 50;
const COUNTS = [1, 2, 4, 6] as const;

/** The first number that no stored jig uses yet (and its neighbour, for a pair). */
function firstFree(used: ReadonlySet<number>): number {
  for (let n = 1; n < TAG_COUNT; n++) if (!used.has(n) && !used.has(n + 1)) return n;
  return 1;
}

/** What is printed below a tag: its number and size, and the name it was given. */
const caption = (id: number, size: number, name: string) => [
  t('jigs.print.caption', { n: id, size }),
  ...(name.trim() === '' ? [] : [name.trim()]),
];

/**
 * The page tags are printed from: a sheet in exact millimetres with a line
 * to check the scale, each tag with its number and a name beside it. The
 * browser prints it; each tag can also be saved as an SVG for a label printer.
 */
export function TagSheet({ onClose }: { onClose: () => void }) {
  const jigs = useWorkshop((s) => s.jigs);
  const used = new Set(jigs.flatMap((j) => j.tags.map((tag) => tag.id)));
  const [size, setSize] = useState<number>(40);
  const [count, setCount] = useState<number>(2);
  const [first, setFirst] = useState(() => firstFree(used));
  const [name, setName] = useState('');

  // While the sheet is open, printing the page prints the sheet and nothing else.
  useEffect(() => {
    document.documentElement.classList.add('tag-sheet-open');
    return () => document.documentElement.classList.remove('tag-sheet-open');
  }, []);
  // On screen the sheet starts below the top bar: NOT-HALT stays visible and one tap away.
  const [top, setTop] = useState(0);
  useLayoutEffect(() => {
    const bar = document.querySelector('.topbar');
    if (!bar) return;
    const measure = () => setTop(Math.round(bar.getBoundingClientRect().bottom));
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const ids = Array.from({ length: count }, (_, i) => ((first - 1 + i) % TAG_COUNT) + 1);
  const paper = tagPaper(size);
  const step = (by: number) => setFirst(((first - 1 + by + TAG_COUNT) % TAG_COUNT) + 1);

  return createPortal(
    <div
      className="tag-sheet"
      style={{ '--tag-sheet-top': `${top}px` } as CSSProperties}
      data-testid="tag-sheet"
      role="dialog"
      aria-label={t('jigs.print.title')}
    >
      <div className="tag-sheet-bar no-print">
        <h2>{t('jigs.print.title')}</h2>
        <div className="tag-sheet-fields">
          <div>
            <span className="field-label">{t('jigs.print.size')}</span>
            <SegmentedControl role="group" aria-label={t('jigs.print.size')}>
              {TAG_SIZES.map((s) => (
                <SegmentedControlItem key={s} pressed={size === s} onClick={() => setSize(s)}>
                  {s} mm
                </SegmentedControlItem>
              ))}
            </SegmentedControl>
          </div>
          <div>
            <span className="field-label">{t('jigs.print.count')}</span>
            <SegmentedControl role="group" aria-label={t('jigs.print.count')}>
              {COUNTS.map((n) => (
                <SegmentedControlItem key={n} pressed={count === n} onClick={() => setCount(n)}>
                  {n}
                </SegmentedControlItem>
              ))}
            </SegmentedControl>
          </div>
          <div className="stepper">
            <span>{t('jigs.print.first')}</span>
            <Button
              variant="outline"
              aria-label={`${t('jigs.print.first')} −`}
              onClick={() => step(-1)}
            >
              −
            </Button>
            <output data-testid="tag-first">{first}</output>
            <Button
              variant="outline"
              aria-label={`${t('jigs.print.first')} +`}
              onClick={() => step(1)}
            >
              +
            </Button>
          </div>
          <Field>
            <FieldLabel>{t('jigs.print.name')}</FieldLabel>
            <Input
              type="text"
              value={name}
              placeholder={t('jigs.print.namePlaceholder')}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
        </div>
        <p className="text-muted-foreground text-sm">{t('jigs.print.sizeHint')}</p>
        <div className="flex gap-3">
          <Button className="flex-1" onClick={() => window.print()}>
            {t('jigs.print.print')}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {t('jigs.print.close')}
          </Button>
        </div>
      </div>

      <div className="tag-page" data-testid="tag-page">
        <h1>{t('jigs.print.pageTitle')}</h1>
        <div className="tag-ruler">
          <svg
            width={`${RULER + 2}mm`}
            height="6mm"
            viewBox={`0 0 ${RULER + 2} 6`}
            data-testid="tag-ruler"
            data-length={RULER}
          >
            <path
              d={`M1 3H${RULER + 1}M1 0.5V5.5M${RULER + 1} 0.5V5.5`}
              fill="none"
              stroke="#000"
              strokeWidth="0.3"
            />
          </svg>
          <p>{t('jigs.print.ruler', { mm: RULER })}</p>
        </div>
        <div className="tag-grid">
          {ids.map((id) => {
            const lines = caption(id, size, name);
            const svg = tagSvg(id, size, lines);
            return (
              <figure key={id} className="tag-figure" data-testid={`tag-${id}`}>
                <img
                  alt={lines.join(', ')}
                  src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
                  style={{ width: `${paper}mm`, height: 'auto' }}
                />
                {used.has(id) ? (
                  <figcaption className="no-print text-muted-foreground text-sm">
                    {t('jigs.print.inUse')}
                  </figcaption>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  className="no-print"
                  onClick={() =>
                    downloadBlob(
                      `marker-${id}-${size}mm.svg`,
                      new Blob([svg], { type: 'image/svg+xml' }),
                    )
                  }
                >
                  {t('jigs.print.svg')}
                </Button>
              </figure>
            );
          })}
        </div>
        <ul className="tag-hints">
          <li>{t('jigs.print.hintScale')}</li>
          <li>{t('jigs.print.hintPaper')}</li>
          <li>{t('jigs.print.hintWhere')}</li>
          <li>{t('jigs.print.hintTwo')}</li>
        </ul>
      </div>
    </div>,
    document.body,
  );
}
