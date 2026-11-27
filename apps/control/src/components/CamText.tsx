import { FONT_IDS, type FontId, type Sketch, type TextAlign } from '@lowrider/cam';
import { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../i18n';
import type { CamItem } from '../lib/camItems';
import { checkText, faceOf } from '../lib/camText';
import { useCam } from '../store/cam';
import { NumberField } from './camParts';
import { Fold } from './Fold';
import { Alert } from '../ui/alert';
import { Field, FieldLabel } from '../ui/field';
import { NativeSelect } from '../ui/native-select';
import { SegmentedControl, SegmentedControlItem } from '../ui/segmented-control';
import { Textarea } from '../ui/textarea';

type TextSketch = Sketch & { type: 'text' };

const ALIGNS: TextAlign[] = ['left', 'center', 'right'];

/** The German name of a face, as the select and the notes say it. */
const faceName = (face: FontId) => t(`cam.text.fonts.${face}`);

/** A text was just added: its field takes the keyboard as soon as it shows. */
let focusText = false;
export function focusNewText() {
  focusText = true;
}

/**
 * "Schrift" – everything a text needs every time, in one short block at the top of the card of the selection:
 * the words, the face and the height. How the lines are set (alignment, the room between letters and lines) is the
 * fold below it. The table is the preview: the select shows names only.
 *
 * What is typed and what is chosen are kept here while they cannot be engraved yet (words that need a face that is
 * not chosen, a face that has none of the words): the drawing keeps what it shows, and the note under the fields says
 * why and which face has the characters. A face picked takes the typed words along, so "type `{ }`, then pick
 * Einfach" is the way out and engraves them. The note is below the fields so that none of them moves when it comes
 * and goes. Every change goes through `setSketch`: one step of undo per field, the job lock and `ahead` as for any
 * other change of the drawing.
 */
export function TextBlock({ item, sketch }: { item: CamItem; sketch: TextSketch }) {
  const cam = useCam.getState();
  const field = useRef<HTMLTextAreaElement>(null);
  const kept = faceOf(sketch);
  // What is typed and what is chosen, also while it is nothing that can be engraved yet.
  const [words, setWords] = useState(sketch.text);
  const [face, setFace] = useState<FontId>(kept);
  const shown = useRef({ text: sketch.text, face: kept });
  useEffect(() => {
    // The drawing changed under the fields (undo, redo): show what it holds.
    if (sketch.text !== shown.current.text) {
      shown.current.text = sketch.text;
      setWords(sketch.text);
    }
    if (kept !== shown.current.face) {
      shown.current.face = kept;
      setFace(kept);
    }
  }, [sketch.text, kept]);
  useEffect(() => {
    if (!focusText) return;
    focusText = false;
    field.current?.focus();
    field.current?.select();
  }, []);

  // The typed words in the chosen face – not the stored sketch: a text of nothing but missing characters is never
  // stored, and still has to say why
  const check = useMemo(() => (words.trim() === '' ? null : checkText(words, face)), [words, face]);
  const store = (text: string, font: FontId, name: string) => {
    if (text === sketch.text && font === kept) return;
    cam.setSketch(item.id, { ...sketch, text, font }, name);
  };
  const way = check
    ? check.elsewhere.length > 0
      ? t('cam.text.elsewhere', { faces: check.elsewhere.map(faceName).join(', ') })
      : t('cam.text.nowhere')
    : '';

  return (
    <div className="flex flex-col gap-2" data-testid="cam-text-block">
      <h3 className="font-medium text-muted-foreground text-sm">{t('cam.text.block')}</h3>
      <Field>
        <FieldLabel>{t('cam.text.label')}</FieldLabel>
        <Textarea
          ref={field}
          rows={2}
          value={words}
          placeholder={t('cam.text.placeholder')}
          data-testid="cam-text"
          onChange={(e) => {
            setWords(e.target.value);
            if (e.target.value.trim() === '') return;
            shown.current.text = e.target.value;
            store(e.target.value, face, 'text');
          }}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2 items-end">
        <Field data-find="text-font">
          <FieldLabel>{t('cam.text.font')}</FieldLabel>
          <NativeSelect
            value={face}
            data-testid="cam-font"
            onChange={(e) => {
              const next = e.target.value as FontId;
              setFace(next);
              shown.current.face = next;
              // the typed words go with the face (they may be what the face is chosen for)
              store(words.trim() === '' ? sketch.text : words, next, 'font');
            }}
          >
            {FONT_IDS.map((id) => (
              <option key={id} value={id}>
                {faceName(id)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <NumberField
          label="cam.text.height"
          value={sketch.height}
          min={0.01}
          onChange={(v) =>
            v !== undefined && cam.setSketch(item.id, { ...sketch, height: v }, 'height')
          }
        />
      </div>
      {check && check.missing.length > 0 && check.strokes === 0 ? (
        <Alert variant="warning" data-testid="cam-text-missing" data-nothing="">
          {t('cam.text.nothing', {
            font: faceName(face),
            kept: faceName(kept),
            list: check.missing.join(' '),
          })}{' '}
          {way}
        </Alert>
      ) : check && check.missing.length > 0 ? (
        <Alert variant="warning" data-testid="cam-text-missing">
          {t('cam.text.missing', { font: faceName(face), list: check.missing.join(' ') })} {way}
        </Alert>
      ) : null}
      <Fold title={t('cam.text.more')} testId="cam-text-more">
        <div className="contents">
          <SegmentedControl role="group" aria-label={t('cam.text.align')}>
            {ALIGNS.map((a) => (
              <SegmentedControlItem
                key={a}
                pressed={sketch.align === a}
                onClick={() => cam.setSketch(item.id, { ...sketch, align: a })}
              >
                {t(`cam.text.aligns.${a}`)}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="cam.text.spacing"
              value={Math.round(sketch.spacing * 100)}
              min={-Infinity}
              onChange={(v) =>
                v !== undefined &&
                cam.setSketch(item.id, { ...sketch, spacing: v / 100 }, 'spacing')
              }
            />
            <NumberField
              label="cam.text.lineSpacing"
              value={Math.round(sketch.lineSpacing * 100)}
              min={10}
              onChange={(v) =>
                v !== undefined &&
                cam.setSketch(item.id, { ...sketch, lineSpacing: v / 100 }, 'lineSpacing')
              }
            />
          </div>
          <p className="text-muted-foreground text-sm">{t('cam.text.hint')}</p>
        </div>
      </Fold>
    </div>
  );
}
