# Zählskripte (Playwright, Chromium vorinstalliert, `require('playwright')`)

Pfad zur entpackten Kopie steht in `lib.cjs` (`SRC`); die Skripte öffnen `lowrider-control.html#simulator` (frisch, nicht referenziert).

- `stepper.cjs` – führt eine Liste von Eingaben aus und zählt: 1 Klick/Tipp = 1, Halten = 1, Tastendruck = 1,
  Dateiauswahl im Systemdialog = +1 (zusätzlich zum Klick, der ihn öffnet), Scrollen, weil ein Knopf unter dem Rand liegt = +1.
  Warten auf „Bereit“ zählt nicht. Kein Zugriff auf den Store.
- `a8.cjs` Aufgabe A (G-Code laden), `b3.cjs` Aufgabe B (Rechteck zeichnen), `p1.cjs` Leertaste im Lauf,
  `z1.cjs` sichtbare Bedienelemente je Schritt, `d1.cjs` die vorbefüllte Demo.
- Fenstergröße: `VP=1180x820 node a8.cjs` (Standard 1440x900). Screenshots landen in `../screenshots/`.

- `sicherheit/` – Tests zu Aufgabe 4 (`sicherheit.test.ts` vitest, `ui.spec.ts` Playwright); die Importpfade zeigen auf die Scratchpad-Kopie des Projekts.
