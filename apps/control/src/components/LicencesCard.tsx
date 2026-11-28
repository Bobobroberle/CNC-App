import { FONT_CREDITS } from '@lowrider/cam';
import { t } from '../i18n';
import { facesUnder, LICENCE_TEXTS, LICENCES, LICENSED_FACES } from '../lib/fontLicences';
import { Card, CardTitle } from '../ui/card';
import { Fold } from './Fold';

/**
 * Einstellungen → Maschine → Schriften und Lizenzen: for every face of the CAM that is not the app's own, its name,
 * the author's notice and the licence text. The licences of the Hershey data and of Relief SingleLine ask for them to
 * be handed on with the software; in the single HTML file of the release this is the only place they can be read
 * (a comment in the data and THIRD-PARTY.md do not travel). The texts are the files in `licenses/`, imported at build
 * time (`lib/fontLicences.ts`), and shown as they are: licence text is not translated.
 */
export function LicencesCard() {
  // The faces the notice names are the faces that carry a licence: "„Einfach“, „Schreibschrift“ und „Modern“" – a face
  // added to the library is named here without anyone editing the sentence
  const quoted = LICENSED_FACES.map((id) =>
    t('licences.quoted', { name: t(`cam.text.fonts.${id}`) }),
  );
  const faces =
    quoted.length > 1
      ? `${quoted.slice(0, -1).join(', ')} ${t('licences.and')} ${quoted[quoted.length - 1]}`
      : (quoted[0] ?? '');
  return (
    <Card className="gap-3 p-4" data-testid="licences-card" data-find="licences">
      <CardTitle render={<h2 />}>{t('licences.title')}</CardTitle>
      <p className="text-muted-foreground text-sm">{t('licences.hint', { faces })}</p>
      {LICENSED_FACES.map((id) => (
        <section key={id} className="flex flex-col gap-1" data-testid={`licence-face-${id}`}>
          <h3 className="font-medium">
            {t(`cam.text.fonts.${id}`)}
            <span className="font-normal text-muted-foreground text-sm">
              {' – '}
              {t('licences.source', { name: t(`licences.sources.${id}`) })}
            </span>
          </h3>
          <p className="text-muted-foreground text-sm">{t('licences.notice')}</p>
          <p lang="en" className="text-sm" data-testid={`licence-notice-${id}`}>
            {FONT_CREDITS[id]}
          </p>
        </section>
      ))}
      {LICENCES.map((licence) => (
        <Fold
          key={licence}
          title={t('licences.textOf', { name: t(`licences.names.${licence}`) })}
          testId={`licence-text-${licence}`}
        >
          <div className="contents">
            <p className="text-muted-foreground text-sm">
              {t('licences.usedBy', {
                faces: facesUnder(licence)
                  .map((face) => t(`cam.text.fonts.${face}`))
                  .join(', '),
              })}
            </p>
            <pre
              lang="en"
              role="group"
              tabIndex={0}
              aria-label={t(`licences.names.${licence}`)}
              className="config-text font-mono whitespace-pre-wrap break-words"
              data-testid={`licence-pre-${licence}`}
            >
              {LICENCE_TEXTS[licence]}
            </pre>
          </div>
        </Fold>
      ))}
    </Card>
  );
}
