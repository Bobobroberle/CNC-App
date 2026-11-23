# Golden-Files

Jede `*.nc`-Datei wird mit `analyzeProgram` ausgewertet; die Zusammenfassung
(Segmente, Grenzen, Werkzeuge, Diagnosen, Zeitschätzung) liegt daneben als
`*.golden.json`. Ändert sich das Ergebnis, schlägt der Test fehl. Gewollte
Änderungen werden mit `pnpm --filter @lowrider/gcode-core test -u` übernommen
und im Review geprüft.

**Stand:**

- `fusion360-1002-*.nc` und `fusion360-1003-*.nc` sind echte Fusion-360-Posts der LowRider (Jobs 1002
  und 1003, Schaftfräser 8 mm und Kugelfräser 6 mm). Sie enthalten `G43 … H1/H2`, das FluidNC
  ablehnt; die Golden-Files halten diese Fehler bewusst fest.
- `estlcam-*.nc` sind echte Estlcam-11-Jobs von der SD-Karte der Maschine: der kleine Spiegel
  (Kontur mit Haltestegen, die Estlcam mit `G00 Z` im Material anhebt) und der Genauigkeits-Check
  (vier Markierungen im Rechteck 500 × 400 mm). Ohne `G21`/`G90` am Anfang und ohne `T`-Wörter.
- `fusion360-contour-pocket.nc`, `vectric-*.nc` sind von Hand im Stil der jeweiligen Posts
  geschrieben. `vectric-rotary-wrap-a.nc` bleibt als Test der A-Achse in der Bibliothek, obwohl die
  Maschine keine Rotary hat.

Neue echte Jobs einfach hier ablegen – der Test nimmt jede `*.nc`-Datei automatisch auf.
