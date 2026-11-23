# Zählskripte (Playwright, Chromium vorinstalliert, `require('playwright')`)

Die Skripte öffnen die gebaute App des Repositorys (`pnpm build`, `pnpm --filter ./apps/control preview`), Standard `http://localhost:4173`, per `APP_URL` umstellbar, als `#simulator` (frisch, nicht referenziert).

- `stepper.cjs` – führt eine Liste von Eingaben aus und zählt: 1 Klick/Tipp = 1, Halten = 1, Tastendruck = 1,
  Dateiauswahl im Systemdialog = +1 (zusätzlich zum Klick, der ihn öffnet), Scrollen = +1 nur, wenn ein Treffertest (`elementFromPoint` im Knopfmittelpunkt) den Knopf als verdeckt oder außerhalb zeigt.
  Warten auf „Bereit“ zählt nicht. Kein Zugriff auf den Store.
- `a8.cjs` Aufgabe A (G-Code laden), `b3.cjs` Aufgabe B (Rechteck zeichnen), `p1.cjs` Leertaste im Lauf,
  `z1.cjs` sichtbare Bedienelemente je Schritt, `d1.cjs` die vorbefüllte Demo.
- `aktionsleiste.cjs` – Screenshot des unteren Rands und die Primäraktion je Bereich bei 1280×800, 800×600 und 820×1180.
- Fenstergröße: `VP=1180x820 node a8.cjs` (Standard 1440x900). Screenshots landen in `../screenshots/`.

- `sicherheit/` – Tests zu Aufgabe 4 (sie halten den Stand der Bewertung fest und bestätigen die damals gefundenen Fehler; B1, B2 und B3 sind inzwischen im Repository behoben, dort stehen die Tests in `apps/control/test`, `apps/companion/test` und `packages/fluidnc-client/test`) (`sicherheit.test.ts` vitest, `ui.spec.ts` Playwright); die Importpfade zeigen auf die Scratchpad-Kopie des Projekts.
