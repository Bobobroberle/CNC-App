# DESIGN.md – UX-/HMI-Guide LR4-Steuerung (CNC-Steuerung + CAM)

> Verbindliche Gestaltungs- und Bedienregeln für dieses Projekt. Gilt für jede neue oder geänderte Oberfläche.
> Widerspricht eine Anforderung diesem Guide: **erst nachfragen, nicht eigenmächtig abweichen.**
>
> **Stand:** Der Betreiber hat entschieden, die fünf festen Schritte durch **sechs Bereiche** zu ersetzen (§3.2). Dieser
> Guide beschreibt das Zielbild; der Umbau läuft in Stufen (`docs/umbau-guide.md`, Abschnitt „Umbau 2“), der Code zeigt bis
> zur Stufe 1 noch die fünf Schritte.

---

## 0. Kontext

- **Maschine:** V1E LowRider v4, Jackpot-Controller mit FluidNC, optional 4. Achse (Drehachse, A).
- **Companion-Rechner:** Raspberry Pi 4 mit Kamera zur Werkstückerfassung.
- **Bedienorte:** (1) Touchscreen an der Maschine – Staub, Handschuhe, Licht/Reflexion, Blick schräg oder aus 1–2 m; (2) Desktop-Browser zur Jobvorbereitung; (3) Smartphone nur zur Überwachung.
- **Nutzer:** vom Einsteiger bis zum Profi – **eine** Software mit kontextabhängiger Tiefe, keine getrennten Versionen.

---

## 1. Leitbild und Prinzipien

**Einfacher Einstieg. Professionelle Tiefe.**
Die Maschine darf technisch komplex sein – die Bedienung spiegelt die Einfachheit der Aufgabe, nicht die Komplexität der Technik. Vorbilder: die geführte, visuelle Einfachheit von **DATRON next** und die Pragmatik von **Estlcam** (siehe §12).

1. **Aufgabe statt Funktion.** Navigation folgt den Arbeitsschritten des Nutzers, nicht der Software- oder Maschinenstruktur.
2. **Ein Ziel pro Screen, eine Primäraktion.** Jeder Screen beantwortet eine Frage; genau eine primäre Schaltfläche, immer unten rechts.
3. **Zeigen statt eintippen.** Visuelle Auswahl (Kamerabild, 3D-Ansicht, Werkstück antippen) zuerst; Zahlenfelder nur zur Feinkorrektur.
4. **Wichtiges zuerst, Details bei Bedarf.** Bedientiefe wächst mit der Aufgabe (§2).
5. **Konsistenz.** Gleiche Komponenten, Farben und Interaktionsregeln überall (§10).
6. **Fehler verhindern statt melden.** Ungültige Eingaben gar nicht erst zulassen, Folgen vorher zeigen, Korrekturen immer ermöglichen.
7. **Sicherheit sichtbar.** Maschinenzustand jederzeit erkennbar, keine Bewegung ohne explizite Aktion, Pause immer erreichbar (§6).
8. **Lernen durch Benutzen.** Die Bedienung erschließt sich ohne Handbuch; Hilfe ist kontextbezogen („?“), nicht vorgeschaltet.

---

## 2. Bedientiefe: Einfach · Erweitert · Experte

Keine globalen Benutzerstufen und kein Login-Rollensystem. Tiefe wird **pro Bereich** aufgeklappt; die Software merkt sich den zuletzt gewählten Zustand je Bereich.

| Ebene | Was sichtbar ist | Umsetzung |
|---|---|---|
| **Einfach** (Standard) | Geführte Schritte, empfohlene Werte, reduzierte Auswahl, Grafik | Default-Ansicht jedes Panels |
| **Erweitert** | Wichtige Prozessparameter (Drehzahl, Vorschub, Zustellung …) | Abschnitt „Mehr Optionen“ im Panel |
| **Experte** | Alle Parameter, Spezialoptionen, direkte Konfiguration, G-Code/MDI | „Alle Parameter“ bzw. Konsole |

**Beispiel Werkzeug:** Einfach = Werkzeug grafisch wählen, Empfehlung sehen, „Übernehmen“ · Erweitert = Drehzahl, Vorschub, Zustellung · Experte = alle Werte inkl. Spezialoptionen.

Regeln: Empfohlene Werte sind immer vorbelegt und als „empfohlen“ markiert. Abweichungen von Empfehlungen werden sichtbar (z. B. Punkt am Feld), nicht verhindert. Assistenten lassen sich überspringen, wenn es fachlich und sicherheitstechnisch zulässig ist.

---

## 3. Informationsarchitektur

### 3.1 Start (Dashboard)

Einstiegsscreen und Arbeitsoberfläche, keine Funktionssammlung. Beantwortet drei Fragen:
**Wie ist der Maschinenzustand? Was ist als Nächstes zu tun? Wie erreiche ich meine wichtigste Aufgabe?**
Er reagiert kontextabhängig (z. B. nach Unterbrechung: „Job fortsetzen“; bei Alarm: Lösungsweg zuerst). Inhalt in §5.

### 3.2 Bereiche (Reiter)

```
Start │ Job │ Zeichnen/CAM │ Einrichten & Fahren │ Fräsen │ Service │ Einstellungen
```

Keine vorgegebenen Schritte: jeder Bereich wird je nach Absicht angewählt. Im Bereich sieht man nur das, was dort gebraucht wird.

| Bereich | Leitfrage | Enthält |
|---|---|---|
| **Job** | Was mache ich? | Datei/Programm wählen, Zuletzt verwendet, SD-Karte, Werkstück |
| **Zeichnen/CAM** | Was zeichne ich? | Das CAM – und nur das (Statusleiste mit PAUSE und NOT-HALT bleibt) |
| **Einrichten & Fahren** | Wo liegt das Werkstück? | Kamerabild, Nullpunkt, Antasten, Ausrichten, Jog |
| **Fräsen** | Passt es und läuft es gut? | Ansicht *Prüfen* (Startklar-Liste, Simulation, Werkzeuge des Jobs) und Ansicht *Fräsen* (Fortschritt, Overrides, Pause/Abbruch) |
| **Service** | Was sagt die Maschine? | Diagnose, Meldungen, Historie, Kalibrieren |
| **Einstellungen** | Wie ist alles eingerichtet? | Verbindung, Maschine, Kamera, Experte |

- Jeder Bereich zeigt seinen Zustand (✓ erledigt · ⚠ Warnung · ✕ blockiert · ○ offen), wo es einen gibt – gelesen aus der einen Startklar-Liste: ein Punkt gehört zu dem Bereich, in dem man ihn behebt.
- Bereiche sind frei anwählbar. Der **Start** in „Fräsen“ bleibt gesperrt, solange etwas **blockiert** (z. B. Verfahrweg verletzt, solange `soft_limits` in der Steuerung aus sind); Warnungen werden einmal bestätigt.
- Es gibt **keine Kette „Weiter: …“**: kein Bereich schlägt den nächsten vor. Der Startbildschirm bleibt als Übersicht.
- Die Werkzeugliste und die Konsole (nur Experten) liegen im Hauptmenü.

### 3.3 Nebenbereiche (außerhalb des Steppers)

| Bereich | Zugang | Zweck |
|---|---|---|
| **Jog / Manuell** | Einblendbares Panel aus jedem Bereich außer Zeichnen/CAM | Achsen fahren, Schnellaktionen |
| **Werkzeugliste** | Hauptmenü | Werkzeuge anlegen/pflegen (Schnittwerte je Werkzeug) |
| **Konsole** | Hauptmenü, nur Experten | G-Code/MDI, Rohlog |

Service und Einstellungen sind Bereiche (§3.2), keine Nebenbereiche mehr.

Die klassischen Rollen (Bediener, Einrichter, Service, Admin) sind hier **Aufgabenbereiche**, keine Berechtigungen: Bedienen = Fräsen · Einrichten = Job, Zeichnen/CAM, Einrichten & Fahren · Service = Service · Konfiguration = Einstellungen.

### 3.4 Regeln

- Maximal **2 Navigationsebenen**; Häufiges in höchstens 2 Taps erreichbar.
- Standort immer erkennbar (Stepper-Markierung bzw. Bereichstitel).
- Keine Hamburger-Menüs für Kernfunktionen; höchstens **ein** Dialog gleichzeitig.
- Fachbegriffe nur, wo sie für die Aufgabe nötig sind.

---

## 4. App-Shell und Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ STATUSLEISTE: Zustand │ X Y Z A │ Spindel │ Vorschub │ Verbindung  │
│                                         Meldungen ⚑   [ PAUSE ]  │
├──────────────────────────────────────────────────────────────────┤
│ REITER (Bereiche), der aktive markiert                           │
├────────────────────────────────────────────┬─────────────────────┤
│ HAUPTFLÄCHE (≥ 60 % Breite)                │ KONTEXT-PANEL       │
│ 3D-/2D-Ansicht, Kamerabild, Listen         │ Eigenschaften,      │
│                                            │ Hinweise, Tiefe §2  │
├────────────────────────────────────────────┴─────────────────────┤
│ AKTIONSLEISTE: [Jog ▸] sekundäre Aktionen …        [ PRIMÄR → ]  │
└──────────────────────────────────────────────────────────────────┘
```

- **Statusleiste** auf jedem Screen identisch. **PAUSE** (Vorschub halten) oben rechts, nie verdeckt, nie deaktiviert, solange sich etwas bewegt.
- **Kontext-Panel** einklappbar; die Visualisierung hat Vorrang.
- **Aktionsleiste:** links sekundär (Jog), rechts die Primäraktion des Bereichs, **wo es eine gibt** („G-Code öffnen“ in Job, „Fräsen starten“/„Fortsetzen“ in Fräsen); Einrichten, Zeichnen/CAM, Service und Einstellungen haben keine. Im **Zeichnen/CAM** gibt es keine Aktionsleiste und keinen Jog-Knopf: dort ist nur das CAM zu sehen.

| Breite | Verhalten |
|---|---|
| ≥ 1280 px | Volle Shell |
| 1024–1279 px | Kontext-Panel schmaler, einklappbar |
| 600–1023 px (Maschinen-Touch) | Panel als Bottom Sheet, Stepper als Icons + aktueller Schrittname |
| < 600 px (Smartphone) | Nur Überwachung: Status, Fortschritt, Kamerabild, Pause, Abbruch |

---

## 5. Screens

> Die Beschreibungen ①–⑤ gelten als **Inhalte der Bereiche** nach §3.2: ① Job → *Job* und *Zeichnen/CAM*, ② Werkzeuge → in *Fräsen* (Ansicht Prüfen), ③ Einrichten → *Einrichten & Fahren*, ④ Prüfen und ⑤ Fräsen → *Fräsen* (zwei Ansichten). Karten und Reihenfolge innerhalb eines Bereichs ändern sich dadurch nicht.

**Start** – Maschinenzustand groß; „Als Nächstes“-Karte mit genau einer Handlungsempfehlung (z. B. „Referenzfahrt nötig“, „Job ‚Schild‘ bei 62 % unterbrochen – fortsetzen“); aktueller/letzter Job mit Fortschritt; Werkzeug- und Materialstatus; letzte Meldung mit Handlungsbedarf; Schnellzugriffe: Neuer Job, Zuletzt verwendet, Jog, Referenzfahrt.

**① Job** – Karten mit Bahnvorschau, Name, Werkstückmaßen, geschätzter Laufzeit. „Zuletzt verwendet“ oben, inklusive gemerktem Nullpunkt. Drag & Drop überall, mehrere Dateien gleichzeitig; leerer Zustand = Drop-Zone mit einem Satz Erklärung. Werkstück (Maße, Material) wird hier festgelegt und liefert die Grundlage für empfohlene Schnittwerte.

**② Werkzeuge** – Job-Werkzeuge in Reihenfolge: Typ-Icon, Ø, Schneidenlänge, Status ✓/⚠/✕. Bei Abweichung Alternativvorschlag mit einem Tap übernehmen. „Länge messen“ direkt in der Zeile. Ein als Messtaster markiertes Werkzeug **sperrt den Spindelstart** sichtbar.

**③ Einrichten** – Live-Kamerabild mit maßstäblich überlagerter Bahnkontur und Fadenkreuz. Nullpunkt: Punkt im Bild antippen → Ziel wird angezeigt → „Hinfahren“ → Feinkorrektur per Jog oder Numpad. Antast-Assistenten als Kacheln (Ecke XY, Mitte Bohrung, Z-Oberfläche, Winkel ausrichten, Drehachse Mitte); jeder zeigt Skizze und Bewegungsrichtung, dann Ergebnis mit Abweichung → übernehmen/verwerfen. Nullpunkte werden je Job gespeichert (Historie der letzten 5).

**④ Prüfen** – 3D-Simulation mit echten Werkzeugdaten auf Rohteil und Nullpunkt; Zeitleiste mit Scrubber und Operationsmarken; bei Drehachse zusätzlich abgewickelte Mantelansicht. Checkliste: Verfahrweg ✓, Z-Tiefe plausibel ✓, Werkzeuge ✓, Nullpunkt ✓, Drehzahl/Vorschub in Grenzen ✓. Sekundär: Probelauf in der Luft (Z-Offset).

**⑤ Fräsen** – Aus 2 m lesbar: Fortschritt %, Restzeit, aktuelle Operation. 3D-Ansicht mit Werkzeugposition, Kamerabild als Bild-in-Bild umschaltbar. Overrides für Vorschub und Spindel (50–150 %, „100 %“-Reset). Aktionen: Pause, „Nach Operation pausieren“, Job abbrechen. Am Ende: Zusammenfassung und „Nächstes Teil gleicher Job“.

**Jog-Panel** – XY-Kreuz, Z-Tasten, A falls aktiv; Schrittweite 0,01 · 0,1 · 1 · 10 mm · Dauerlauf; Schnellaktionen: Gehe zu Null, Parkposition, Referenzfahrt.

**Service & Diagnose** – Live-Status von Endschaltern und Eingängen, Achstest, Meldungshistorie mit Filter nach Stufe, Betriebsstunden der Spindel, Verbindungsinfos FluidNC.

---

## 6. Zustände, Rückmeldung, Meldungen, Sicherheit

### 6.1 Maschinenzustand (Badge in der Statusleiste)

| Zustand | Farbe | Text |
|---|---|---|
| Getrennt | Grau | Nicht verbunden |
| Bereit | Neutral | Bereit |
| Läuft (Run/Jog) | Blau | Läuft |
| Pausiert | Amber | Pausiert |
| Antasten | Violett | Antasten |
| Alarm / nicht referenziert | Rot | Alarm – <Klartext> |

### 6.2 Rückmeldung auf jede Aktion

Jede Aktion zeigt sofort einen von vier Zuständen: **erfolgreich · in Bearbeitung · nicht möglich · Voraussetzung fehlt** (mit Angabe, welche). Jede Berührung erhält sichtbares Feedback (Pressed-State ≤ 100 ms). Deaktivierte Schaltflächen erklären per Tipp, warum sie deaktiviert sind.

### 6.3 Meldungen

| Stufe | Darstellung | Verhalten |
|---|---|---|
| Information | Neutral, Icon ⓘ | Toast, verschwindet selbst |
| Hinweis | Neutral, Icon 💡 | Bleibt im Meldungszentrum |
| Warnung | Amber | Muss bestätigt werden, blockiert nicht |
| Störung | Rot | Blockiert betroffene Funktion, Lösungsweg angeboten |
| Kritisch | Rot, pulsierend, vollflächig | Stoppt/blockiert alles bis zur Quittierung |

Jede Meldung enthält **Bezeichnung · Ursache · Auswirkung · nächste Maßnahme**. Der FluidNC-/GRBL-Code steht klein dahinter (z. B. „ALARM:2“) und ersetzt nie den Klartext.

### 6.4 Sicherheit

- **Pause** (Vorschub halten): ein Tap, ohne Rückfrage, Taste Leertaste.
- **Job abbrechen:** mit Bestätigung.
- **Not-Halt ist Hardware.** Die Software ersetzt keinen physischen Not-Aus; sicherheitskritische Funktionen werden unabhängig von der UI normgerecht ausgelegt.
- Keine Bewegung als Nebeneffekt: Antippen im Kamerabild zeigt nur das Ziel, gefahren wird erst mit „Hinfahren“.
- Bestätigung nötig bei: Z unter Sicherheitshöhe, Start ohne gesetzten Nullpunkt, Spindelstart mit Messtaster.
- Plausibilitätsprüfung aller Eingaben (Wertebereich, Einheit, Verfahrweg); ungültige Werte lassen sich nicht übernehmen.
- Verbindungsverlust während eines Jobs = kritische Meldung; keine stille Wiederverbindung mit Bewegung.
- Optional Sprachausgabe für Schlüsselereignisse (Nullpunkt gesetzt, Werkzeugwechsel, Job fertig).

---

## 7. Visuelle Sprache

**Anmutung:** ruhig, technisch, hochwertig, reduziert – modernes Industriegerät, kein Gaming- oder Admin-Dashboard-Look. Keine Dekoration zulasten der Funktion.

**Themes:** Dark (Standard) und Light (für helle Werkstatt/Reflexion), beide mit hohem Kontrast (Text ≥ 7:1, Bedienelemente ≥ 4,5:1).

### Tokens (Dark)

```css
--bg:          #0F1115;  --surface: #171A21;  --surface-2: #20242D;  --border: #2C313C;
--text:        #E8EAED;  --text-muted: #9AA0A6;
--accent:      #3B82F6;  /* Primäraktion, Auswahl, „Läuft“ */
--success:     #22C55E;  /* ✓ erledigt */
--warning:     #F59E0B;  /* Warnung, Pause */
--danger:      #EF4444;  /* Störung, Alarm, kritisch – sonst nirgends */
--probe:       #A855F7;  /* Antasten */
--axis-x: #EF4444;  --axis-y: #22C55E;  --axis-z: #3B82F6;  --axis-a: #F59E0B;
```

- **Rot ausschließlich für Störung, Alarm und Kritisch.** Destruktive, aber ungefährliche Aktionen (Datei löschen) sind neutral mit Bestätigung.
- Achsfarben überall gleich (DRO, Jog, 3D-Achsenkreuz).
- Status nie nur über Farbe: immer Icon und/oder Text dazu.

### Typografie

- **Inter** für UI, **JetBrains Mono** für G-Code/Konsole.
- Zahlen: `tabular-nums`, feste Nachkommastellen, Einheit immer dabei, rechtsbündig, ohne Layoutsprung.
- Größen: Text 14 px (Desktop) / 16 px (Maschine) · Überschriften 20–24 px · DRO 28–40 px · Run-Kennzahlen 48–72 px.

### Layout, Formen, Icons, Bewegung

- 8-px-Raster; großzügige Abstände, klare Gruppierung, wenige Varianten.
- Radius 8 px (Controls) / 12 px (Karten, Panels); Tiefe über Flächenhelligkeit statt Schatten.
- Icons: **Lucide**, 24 px, **immer mit Label** – Ausnahmen nur Jog-Pfeile und Play/Pause.
- Animation 150–200 ms, ease-out, rein funktional; `prefers-reduced-motion` respektieren.

---

## 8. Touch und Eingabegeräte

- Touch-Ziele ≥ **48 px** (Desktop/Tablet), ≥ **56–64 px** an der Maschine; ≥ 8 px Abstand, kritische Aktionen ≥ 24 px voneinander getrennt.
- Gesten sind nie die einzige Bedienmöglichkeit – jede Geste hat eine Schaltfläche als Alternative.
- Zahleneingabe per eigenem Numpad (±, Komma, Einheit), nie Systemtastatur. Schieber immer mit Wertanzeige und ± Tasten.
- Keine Information nur per Hover.
- Tastatur, Maus, Gamepad und USB-Handrad laufen über **eine gemeinsame Aktionsschicht** und sind gleichwertig.

| Aktion | Taste |
|---|---|
| Pause | Leertaste |
| Job abbrechen | Esc (mit Bestätigung) |
| Jog XY / Z | Pfeiltasten / Bild↑ Bild↓ |
| Schrittweite | 1–5 |
| Nächster Schritt | Strg + → |
| Feinjog zuletzt bewegte Achse | Mausrad |
| Kürzelübersicht | ? |

---

## 9. Texte

- Deutsch, Werkstattbegriffe: Nullpunkt, Antasten, Vorschub, Spindel, Werkzeuglänge.
- Buttons = Verb + Objekt („Nullpunkt setzen“) – nie nur „OK“/„Ja“.
- Kurz; Erklärungen hinter „?“. Leerzustände: ein Satz plus eine Aktion.
- Einheiten immer: mm, mm/min, U/min, °.

---

## 10. Designsystem

- **Tokens zentral** (CSS-Variablen/Theme-Datei) für Farben, Typografie, Abstände, Größen, Radien. Keine hartkodierten Werte in Komponenten.
- **Komponenten**, je einmal gebaut und überall genutzt: Button (primär/sekundär/Icon), Input + Numpad, Dropdown, Segment-Control, Schieber, Dialog, Tabelle, Karte/Kachel, Stepper, Tabs, Statusbadge, DRO-Anzeige, Meldung/Toast, Tooltip, Fortschritt, Bottom Sheet.
- **Interaktionszustände** jeder Komponente: normal, gedrückt, Fokus, ausgewählt, deaktiviert (mit Grund), lädt, Fehler, bestätigt.
- **UX-Patterns** einheitlich: Workflow-Schritt, Parameter bearbeiten (inkl. §2-Tiefe), Meldung, Bestätigen, Abbrechen/Rückgängig, Feedback.

---

## 11. Vorgehen mit Claude Code

1. **Prototyp vor Logik:** UI zuerst gegen eine **simulierte Maschine** (Mock-FluidNC mit Zuständen, Positionen, Alarmen, Verbindungsabbruch). Hardware erst anbinden, wenn die Bedienung stimmt.
2. **Reihenfolge:** Designsystem-Grundlagen (Tokens + Kernkomponenten) → App-Shell + Statusleiste → Start → ⑤ Fräsen → ③ Einrichten → ① Job → ② Werkzeuge → ④ Prüfen → Jog → Service & Diagnose → Einstellungen.
3. **Vor jedem Screen:** ASCII-Layout und Elementliste vorlegen, Freigabe abwarten.
4. **Nach jeder UI-Änderung selbst prüfen:** Screenshots bei 1280 px und 800 px (z. B. Playwright), gegen diesen Guide abgleichen, Abweichungen beheben, dann melden.
5. **Bei Unklarheit fragen**, statt eine generische Standardlösung zu wählen.

### Abnahme je Screen

- [ ] Eine Primäraktion unten rechts; Statusleiste und Pause sichtbar
- [ ] Zustände leer · lädt · Fehler · Warnung · Erfolg umgesetzt
- [ ] Rückmeldung nach §6.2, Meldungen nach §6.3
- [ ] Nur Tokens und vorhandene Komponenten
- [ ] Touch-Ziele und Typografie nach §7/§8; geprüft bei 1280 und 800 px
- [ ] Tastenkürzel für die Hauptaktion
- [ ] Keine Bewegung ohne explizite Bestätigung

### Usability-Ziele (Kernaufgaben am Prototyp messen)

| Kriterium | Ziel |
|---|---|
| Effizienz | Bekannter Job von Start bis „Fräsen starten“ ≤ 8 Interaktionen; Pause = 1 Interaktion. **Einzelstück** (G-Code laden, Nullpunkt X/Y, Z antasten, Start; frischer Zustand, nicht referenziert): gemessen 10 Tipps/Halten + 1 Dateiauswahl + 2 Scrolls – darf nicht schlechter werden |
| Verständlichkeit | Jeder Schritt ohne Erklärung beim ersten Versuch lösbar |
| Orientierung | Auf jedem Screen klar: Wo bin ich, was fehlt, was kommt als Nächstes |
| Fehlertoleranz | Ungültige Eingaben nicht übernehmbar; jede Einrichtung korrigierbar ohne Neustart des Ablaufs |
| Ergonomie | Bedienbar mit Handschuhen, lesbar aus 2 m (⑤) bzw. 1 m (übrige Screens) |

---

## 12. Referenzen

| Referenz | Übernommen wird |
|---|---|
| **DATRON next** | Geführter Ablauf, Kacheln mit Icons, Nullpunkt im Live-Kamerabild, Simulation mit echten Werkzeugdaten, automatischer Werkzeugabgleich, Fernüberwachung |
| **Estlcam** | Bedienung per Tastatur/Maus/Gamepad/Handrad, Mausrad-Feinjog, Nullpunkt-Historie und Wiederaufnahme, Drag & Drop, Luftfräsen, Messtaster sperrt Spindel |
| **TRUMPF Touchpoint** | Konsequentes Designsystem: gleiche Navigation und Komponenten überall |
| **ROVEMA HMI** | Schritt-für-Schritt-Einrichtung mit Kontext |
| **Krones / Weber** | Start-Dashboard: Priorisierung, Zustände, Kennzahlen, Schnellzugriffe |
| **SIG CRUISER** | Visuelle Qualität: klare Hierarchie, reduzierte, hochwertige Gestaltung |
