# Konfiguration des Jackpot

Hier liegen die Sicherungen der echten Maschine.

- `config-ist-jackpot1.yaml` – **was wirklich auf der Maschine läuft** (Stand 2026-11-01, Ausgabe
  von `$CD`): **Jackpot (v1) mit TMC2209**, meta 03-15-2024 RyanZ. X ein Motor, 645 mm Verfahrweg;
  Y und Z je zwei Motoren mit eigenem Endschalter (Y: Platzhalter 2440 mm, Z: Platzhalter 300 mm);
  `soft_limits` und `hard_limits` überall aus, `must_home: false`, keine Spindel. Referenzfahrt:
  Zyklus 1 = Z (nach oben), Zyklus 2 = X und Y gemeinsam (nach minus).
- `config.yaml` – V1E-Standard „Jackpot V2 TMC2226 / LowRider“ (meta 07-10-2025 RyanZ), anfangs als
  Annahme genommen; bleibt als Referenz für Tests. Empfehlungen dazu:
  [docs/offene-fragen.md](../docs/offene-fragen.md).

Weitere Sicherungen:

- `config.yaml` – herunterladen über die FluidNC-WebUI oder später über _Maschine_ in der App
- `settings.txt` – Ausgabe von `$S` (alle `$`-Settings)
- `config-dump.txt` – Ausgabe von `$CD` (aktive Konfiguration)

Vor jeder Änderung an der Maschine neu sichern und mit Datum committen. Siehe auch
[docs/maschinenprofil.md](../docs/maschinenprofil.md).
