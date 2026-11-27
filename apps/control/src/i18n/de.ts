/**
 * German UI texts. English will be another file with the same shape.
 * Alarm texts: what happened + the next step, one sentence each.
 */
export const de = {
  app: {
    installHint:
      'Als App aufs iPad: „Teilen“ antippen (Quadrat mit Pfeil), dann „Zum Home-Bildschirm“.',
    installHintDismiss: 'Ausblenden',
  },
  tiles: {
    positionMachine: 'Position (Maschine)',
    toggleFrame: 'Position: zwischen Werkstück und Maschine umschalten',
    job: 'Job',
    estimate: 'geschätzt',
    load: 'Last',
    label: 'Live-Werte',
    position: 'Position (Werkstück)',
  },
  dash: {
    program: 'Programm',
    noProgram: 'Kein Programm geladen',
    estimate: 'Laufzeit (geschätzt)',
    tool: 'Werkzeug',
    zero: 'Nullpunkt',
  },
  stage: {
    live: 'Live-Ansicht',
    legend: 'Legende',
    zGauge: 'Z-Pegel',
    grid: 'Raster {mm} mm',
    mode: 'Ansicht der Bühne',
    table: 'Tisch',
    camera: 'Kamera',
    view3d: '3D',
    mini: 'Übersicht – antippen für den Tisch',
    liveInset: 'Kamerabild – antippen für die große Ansicht',
    cameraOff: 'Die Kamera ist aus.',
    cameraOn: 'Kamera einschalten',
    zoomReset: 'Zoom {zoom}× – ganzes Bild',
    wide: 'Großbild',
    wideHint:
      'Die Bühne über die ganze Breite. Ein Reiter in der Leiste bringt das Bedienfeld zurück.',
  },
  stageTools: {
    label: 'Antippen auf Tisch oder Kamerabild',
    goto: 'Hinfahren',
    zero: 'Nullpunkt',
    measure: 'Messen',
    hints: {
      goto: 'Stelle antippen, dann Kamera oder Fräser dorthin fahren.',
      zero: 'Ecke des Werkstücks antippen – im Kamerabild rastet der Tipp auf die Ecke ein, die Lupe setzt fein nach.',
      edge: 'Brett liegt schräg? Zwei Punkte entlang einer geraden Kante antippen – der Job wird danach ausgerichtet.',
      measure:
        'Zwei Punkte antippen; ein dritter misst vom letzten weiter. Im Kamerabild rastet ein Tipp auf ein Loch in dessen Mitte ein.',
      clamp:
        'Antippen, wo eine Zwinge oder Schraube sitzt. Die Markierung ziehen verschiebt sie, an den Ecken ziehen ändert die Größe.',
    },
    zeroSteps: {
      label: 'Schritte zum Nullpunkt',
      corner: 'Ecke',
      edge: 'Kante',
    },
    setZero: 'Nullpunkt X/Y setzen',
    zeroShift: 'Nullpunkt wandert um X {dx} · Y {dy} mm',
    zeroFromTo: 'Maschine: X {x0} → {x1} · Y {y0} → {y1}',
    edgeAngle: 'Kante liegt {angle}° schräg',
    zeroDone:
      'Nullpunkt gesetzt. Liegt das Brett schräg? Dann jetzt zwei Punkte entlang einer geraden Kante antippen.',
    loupe: 'Lupe – darin ziehen verschiebt die Marke fein',
    nudge: {
      label: 'Marke fein verschieben',
      up: 'Marke nach hinten (Y+)',
      down: 'Marke nach vorn (Y−)',
      left: 'Marke nach links (X−)',
      right: 'Marke nach rechts (X+)',
      step: 'Schritt {mm} mm – antippen für {other} mm',
    },
    measureSecond: 'Zweiten Punkt antippen.',
    measureAngle: 'Winkel {angle}°',
    hole: 'Loch Ø {mm} mm',
    freePoint: 'freier Punkt',
    measureBetween: '{a} → {b}',
    snapped: 'Eingerastet: {what}',
    snaps: {
      corner: 'Ecke im Kamerabild',
      edge: 'Kante im Kamerabild',
    },
    accuracyCamera: 'Am Fadenkreuz genau, zum Bildrand hin etwa 0,2–0,5 mm.',
    accuracyTable: 'Auf der Fotokarte etwa 0,2–0,5 mm genau.',
    clamp: {
      label: 'Spannmittel',
      kind: 'Was der nächste Tipp markiert',
      height: 'Höhe über dem Werkstück, mm',
      lower: '5 mm niedriger',
      higher: '5 mm höher',
      deselect: 'Auswahl aufheben',
      sizeBox: '{x} × {y} mm',
      sizeRound: 'Ø {d} mm',
    },
    secondPoint: 'Zweiten Punkt entlang der Kante antippen.',
    clear: 'Punkt verwerfen',
    connectFirst: 'Zum Antippen und Hinfahren zuerst verbinden.',
    setupNeeded: 'Kamera noch nicht eingerichtet – Antippen trifft erst danach.',
    settingUp: 'Kamera einrichten ({mode}): Tippen auf das Bild misst jetzt die Kamera.',
    settingUpDone: 'Fertig',
    sideView: 'Seitenansicht (X/Z): zeigt, wie tief die Bahnen gehen.',
    unwrappedView: 'Abwicklung der Drehachse (X/A).',
    toTop: 'Zur Draufsicht',
  },
  nav: {
    label: 'Navigation',
    start: 'Start',
    stepper: 'Ablauf',
    // The short names of the tabs (they must fit in the row; the long names are the titles)
    tabs: {
      job: 'Job',
      cam: 'CAM',
      setup: 'Einrichten',
      run: 'Fräsen',
      service: 'Service',
      settings: 'Einstellungen',
    },
    steps: {
      job: 'Job',
      cam: 'Zeichnen/CAM',
      tools: 'Werkzeuge',
      setup: 'Einrichten',
      check: 'Prüfen',
      run: 'Fräsen',
    },
    states: {
      done: 'erledigt',
      warn: 'Warnung',
      block: 'blockiert',
      open: 'offen',
    },
    areas: {
      toollist: 'Werkzeugliste',
      service: 'Service & Diagnose',
      settings: 'Einstellungen',
      console: 'Konsole',
    },
    areaHints: {
      toollist: 'Werkzeuge und Materialien anlegen und pflegen',
      service: 'Eingänge, Meldungen, Verlauf, Genauigkeit',
      settings: 'Verbindung, Maschine, Kamera, Darstellung',
      console: 'G-Code von Hand senden, Rohlog',
    },
    views: {
      job: {
        label: 'Bereich in Job',
        prepare: 'Vorbereiten',
        extras: 'Extras',
      },
      setup: {
        label: 'Bereich in Einrichten',
        zero: 'Nullpunkte',
        probe: 'Antasten',
        camera: 'Kamera',
        align: 'Ausrichten',
      },
      run: {
        label: 'Bereich in Fräsen',
        cut: 'Fräsen',
        check: 'Prüfen',
      },
      service: {
        label: 'Bereich in Service',
        diagnose: 'Diagnose',
        messages: 'Meldungen',
        history: 'Historie',
        calibrate: 'Kalibrieren',
      },
      settings: {
        label: 'Bereich in Einstellungen',
        connection: 'Verbindung',
        machine: 'Maschine',
        camera: 'Kamera',
        expert: 'Experte',
      },
    },
    menu: 'Menü',
    menuTitle: 'Hauptmenü',
    menuClose: 'Menü schließen',
    jog: 'Jog',
    jogTitle: 'Jog / Manuell',
    jogClose: 'Jog schließen',
    next: 'Weiter: {step}',
    actions: 'Aktionen',
    panelShow: 'Aufklappen',
    panelHide: 'Zuklappen',
    panelSmaller: 'Kleiner',
    panelLarger: 'Größer',
    noProgram: 'Für diesen Schritt fehlt ein Programm.',
    toJob: 'Zum Job',
  },
  bar: {
    label: 'Statusleiste',
    spindle: 'Spindel',
    feed: 'Vorschub',
    connection: {
      connected: 'Verbunden',
      connecting: 'Verbinde …',
      disconnected: 'Getrennt',
      retrying: 'Neuer Versuch …',
    },
    messages: 'Meldungen',
    messagesOpen: '{count} neue Meldungen mit Handlungsbedarf ansehen',
    messagesNone: 'Meldungen ansehen – keine neuen',
    pause: 'PAUSE',
    pauseHint: 'Vorschub halten – ein Tipp, ohne Rückfrage (Leertaste)',
  },
  start: {
    machine: 'Maschine',
    nextLabel: 'Als Nächstes',
    job: 'Aktueller Job',
    lastJob: 'Letzter Job',
    noJob: 'Noch kein Job geladen.',
    toolMaterial: 'Werkzeug und Material',
    tool: 'Werkzeug',
    material: 'Material',
    noMaterial: 'noch nicht gewählt',
    message: 'Letzte Meldung',
    noMessage: 'Keine Meldung mit Handlungsbedarf.',
    toMessages: 'Meldungen ansehen',
    quick: 'Schnellzugriff',
    quickNew: 'Neuer Job',
    quickRecent: 'Zuletzt verwendet',
    quickJog: 'Jog',
    quickHome: 'Referenzfahrt',
    next: {
      alarm: {
        title: 'Alarm beheben',
      },
      connect: {
        title: 'Maschine verbinden',
        text: 'Die Steuerung ist nicht verbunden. Ohne Verbindung lässt sich nichts fahren und nichts fräsen.',
        action: 'Weiter: Verbindung',
      },
      connecting: {
        title: 'Verbindung wird aufgebaut',
        text: 'Einen Moment – die Steuerung meldet sich gleich.',
      },
      toolChange: {
        title: 'Werkzeugwechsel wartet',
        text: 'Der Job hält für den Werkzeugwechsel. Werkzeug tauschen, messen, dann geht es weiter.',
      },
      running: {
        title: 'Job „{name}“ läuft',
        text: 'Fortschritt, Vorschub und Pause stehen unter Fräsen.',
      },
      paused: {
        title: 'Job „{name}“ ist pausiert',
        text: 'Fortsetzen oder abbrechen unter Fräsen.',
      },
      resume: {
        title: 'Job „{name}“ bei {percent} % unterbrochen',
        text: 'Er lässt sich ab der letzten gefrästen Zeile fortsetzen.',
        action: 'Job fortsetzen',
      },
      home: {
        title: 'Referenzfahrt nötig',
        text: 'Die Maschine kennt ihre Position noch nicht. Erst nach der Referenzfahrt gelten die Endlagen.',
        action: 'Referenzfahrt starten',
      },
      continue: {
        title: 'Job „{name}“: weiter bei {step}',
        text: 'Dort ist der nächste offene Punkt dieses Jobs.',
      },
      newJob: {
        title: 'Neuen Job beginnen',
        text: 'Die Maschine ist bereit. Ein Programm öffnen oder eines zeichnen.',
      },
    },
  },
  numpad: {
    back: 'Letzte Ziffer löschen',
    sign: 'Vorzeichen wechseln',
    separator: 'Komma',
    clear: 'Feld leeren',
    done: 'Übernehmen',
  },
  features: {
    title: 'Funktionen',
    hint: 'Selten gebrauchte Funktionen ausblenden: ihre Karten und Knöpfe verschwinden, die Schnellsuche führt hierher zurück. Ein Ablauf, der für den geladenen Job gerade läuft, bleibt sichtbar. Was im Hintergrund läuft – etwa das Erkennen von Markern –, läuft weiter.',
    items: {
      series: 'Serie auf Rohlingen',
      jigs: 'Vorrichtungen mit Markern',
      macros: 'Makros',
    },
    underWay: 'Ausgeblendet, aber der Ablauf läuft für den geladenen Job: er bleibt sichtbar.',
  },
  appearance: {
    title: 'Darstellung',
    theme: 'Farbschema',
    themes: {
      dark: 'Dunkel',
      light: 'Hell',
    },
    hint: 'Dunkel für die Werkstatt, Hell für viel Licht und Spiegelungen. Die Wahl bleibt gespeichert.',
  },
  abort: {
    title: 'Job abbrechen?',
    text: 'Die Maschine hält an und die Steuerung wird zurückgesetzt. Der Job lässt sich danach unter Fräsen ab einer Zeile fortsetzen.',
    keep: 'Job weiterlaufen lassen',
    confirm: 'Job abbrechen',
  },
  monitor: {
    paused: 'pausiert',
    abort: 'Job abbrechen …',
    noAddress:
      'Am Bildschirm der Maschine oder am Rechner zuerst die Adresse der Steuerung eintragen.',
    idle: 'Es läuft kein Job.',
    hint: 'Auf dem Telefon wird nur überwacht. Eingerichtet und gestartet wird am Bildschirm der Maschine oder am Rechner.',
  },
  depth: {
    more: 'Mehr Optionen',
    all: 'Alle Parameter',
    recommended: 'empfohlen',
    deviates: 'Weicht von der Empfehlung ab ({value})',
  },
  run5: {
    remaining: 'Restzeit',
    operation: 'Operation',
    operationOf: '{n} von {total}',
    noOperation: 'Das Programm nennt keine Operationen',
    held: 'Pausiert: Vorschub steht. Weiter geht es mit „Fortsetzen“ unten rechts.',
    doneTitle: 'Job fertig',
    parts: 'Teile (Werkzeuge)',
    pieces: 'Stück in dieser Sitzung',
    nextHint:
      'Für das nächste Stück: fertiges Teil abnehmen, neuen Rohling an dieselbe Stelle spannen. Der Nullpunkt bleibt, wie er ist.',
    nextPiece: 'Nächstes Teil: gleicher Job',
    resume: 'Fräsen fortsetzen',
    pause: 'Fräsen pausieren',
    waitingInPanel: 'Der Job wartet auf dich: im Feld oben geht es weiter.',
  },
  startConfirm: {
    title: 'Vor dem Start bestätigen',
    text: 'Der Job kann so starten – aber sieh dir das vorher an:',
    back: 'Zurück, nicht starten',
    start: 'Trotzdem starten',
    zero: {
      title: 'Kein Nullpunkt gesetzt',
      text: 'Der Nullpunkt liegt im Maschinennullpunkt. Der Job würde dort fräsen, nicht auf dem Werkstück.',
    },
    lowZ: {
      title: 'Z steht unter der Sicherheitshöhe',
      text: 'Das Programm fährt zuerst seitlich, ohne vorher anzuheben. Der Fräser kann dabei an Werkstück oder Spannmittel stoßen.',
    },
    probe: {
      title: 'Messtaster als Werkzeug',
      text: 'Ein Werkzeug dieses Jobs ist als Messtaster markiert, und das Programm schaltet die Spindel ein. Ein Messtaster darf nie drehen – ist wirklich ein Fräser eingespannt?',
    },
  },
  console: {
    filter: 'Zeilen im Protokoll',
    filters: { all: 'Alles', wire: 'Gesendet und empfangen', app: 'Meldungen der App' },
    placeholder: 'G-Code oder $-Befehl',
    history: 'Zuletzt gesendet:',
    hint: 'Was hier gesendet wird, führt die Steuerung sofort aus – ohne die Prüfungen der App. Im Feld holen ↑ und ↓ frühere Zeilen zurück; ein Tipp auf eine Zeile füllt nur das Feld.',
  },
  service: {
    unknown: 'nicht bekannt',
    messages: 'Meldungshistorie',
    axis: {
      title: 'Achstest',
      hint: 'Fährt eine Achse ein bekanntes Stück – mit Halten. Vorher nachsehen: Ist der Weg frei?',
      distance: 'Strecke des Achstests',
      move: '{axis}{sign} {distance} mm',
      way: {
        X: '+ fährt nach rechts',
        Y: '+ fährt von dir weg',
        Z: '+ fährt nach oben',
      },
      untested: 'noch nicht getestet',
      running: 'fährt …',
      ok: 'Soll {expected} mm · gemeldet {reported} mm – passt',
      short:
        'Soll {expected} mm · gemeldet {reported} mm – nicht angekommen (Grenze oder gestoppt?)',
      honest:
        'Die Steuerung meldet den Weg, den sie selbst gezählt hat. Ob die Achse ihn wirklich gefahren ist, misst die Genauigkeitsprüfung unter „Kalibrieren“ – oder ein Maßstab.',
    },
    connection: {
      title: 'Verbindung zur Steuerung (FluidNC)',
      state: 'Verbindung',
      address: 'Adresse',
      firmware: 'Firmware',
      machine: 'Zustand der Steuerung',
      homed: 'Referenziert',
      homedAll: 'ja – X, Y und Z',
      homedSome: 'nur {axes}',
      homedNone: 'nein',
      wcs: 'Koordinatensystem',
      alarm: 'Alarm',
      noAlarm: 'keiner',
    },
    hours: {
      title: 'Laufzeit',
      value: '{hours} h {minutes} min',
      from: 'in {jobs} aufgezeichneten Jobs seit {since}',
      none: 'Noch kein Job aufgezeichnet – also auch keine Laufzeit.',
      honest:
        'Die Steuerung zählt keine Betriebsstunden der Spindel. Gezählt ist die Laufzeit der Jobs aus der Historie; wer die Historie löscht, löscht auch diese Zahl.',
    },
  },
  messages: {
    title: 'Meldungen',
    empty: 'Keine Meldungen.',
    emptyFilter: 'Keine Meldungen dieser Stufe.',
    filter: 'Stufe',
    all: 'Alle',
    levels: {
      critical: 'Kritisch',
      fault: 'Störung',
      warning: 'Warnung',
      hint: 'Hinweis',
      info: 'Information',
    },
    cause: 'Ursache',
    effect: 'Auswirkung',
    action: 'Nächste Maßnahme',
    acknowledge: 'Warnung bestätigen',
    acknowledgeAll: 'Alle Warnungen bestätigen',
    acknowledged: 'bestätigt',
    open: 'offen – bitte bestätigen',
    resolved: 'behoben',
    active: 'steht an',
    close: 'Meldungen schließen',
    clear: 'Erledigte Meldungen löschen',
    toHistory: 'Zur Historie',
    report: {
      button: 'Diagnosebericht speichern',
      hint: 'Eine Textdatei mit allen Meldungen dieser Sitzung, ihrem Umfeld (Zustand, Befehle davor), der Verbindung und dem Protokoll – zum Weitergeben bei der Fehlersuche. Zugangsdaten sind nicht enthalten.',
      done: 'Gespeichert: {name}',
    },
    blocks: 'Sperrt Fahren und Starten, bis die Störung behoben ist.',
    unlock: 'Entsperren ($X)',
    toHoming: 'Jog öffnen: Referenzfahrt',
    last: { open: '{count} Meldungen warten auf dich.' },
    // The controller's file system failed (error:60 …): the line was fine, the card or the file was not
    rejectedSd: {
      title: 'SD-Karte der Steuerung: Zugriff fehlgeschlagen',
      effect:
        'Dateien auf der SD-Karte der Steuerung lassen sich nicht lesen oder schreiben; Jobs von der SD-Karte starten nicht. Streamen vom Tablet geht weiter.',
      action:
        'SD-Karte der Steuerung prüfen: steckt sie richtig, ist sie FAT32 (nicht exFAT) und nicht schreibgeschützt? Karte neu einstecken, dann die Dateiliste neu laden. Bleibt es dabei, passt der SD-Teil der config.yaml nicht zur Platine.',
    },
    // Another file of the controller failed (the SD card or its flash): the line was fine, the file was not
    rejectedFile: {
      title: 'Dateizugriff der Steuerung fehlgeschlagen',
      effect: 'Der Vorgang mit dieser Datei wurde nicht ausgeführt.',
      action:
        'Name und Ort der Datei prüfen (liegt sie auf der SD-Karte oder im Flash der Steuerung?), die Dateiliste neu laden und es wiederholen. Hilft das nicht, die SD-Karte neu einstecken.',
    },
    rejected: {
      title: 'Die Steuerung hat einen Befehl abgelehnt',
      effect:
        'Der Befehl wurde nicht ausgeführt. Ein gestreamter Job bleibt an dieser Zeile stehen.',
      action: 'Eingabe oder Programmzeile prüfen; im Protokoll steht der Befehl direkt davor.',
    },
    alarm: {
      locked: 'Steuerung im Alarm – gesperrt',
      lockedCause:
        'Die Steuerung meldet Alarm, ohne einen Grund zu nennen. Nach dem Einschalten oder einem Reset ist das üblich: Sie kennt ihre Position noch nicht.',
      lockedAction:
        'Referenzfahrt starten (Jog → Referenzfahrt) – oder entsperren, wenn der Weg frei ist.',
      effect:
        'Die Steuerung ist gesperrt: Sie fährt nicht und startet keinen Job, bis entsperrt oder neu referenziert ist.',
    },
    groups: {
      connection: {
        cause: 'Es besteht keine Verbindung zur Steuerung (WLAN, Adresse oder Strom).',
        effect: 'Die Maschine bekommt keine Befehle der App.',
        action: 'Unter Einstellungen → Verbindung die Adresse prüfen und verbinden.',
      },
      companion: {
        cause: 'Der Companion-Rechner (Raspberry Pi) antwortet nicht.',
        effect:
          'Aufnahmen, Sensoren und Benachrichtigungen über den Companion fehlen. Fräsen geht weiter.',
        action: 'Läuft der Pi? Unter Einstellungen → Verbindung die Adresse des Companion prüfen.',
      },
      sd: {
        cause: 'Die SD-Karte der Steuerung hat den Auftrag nicht angenommen oder nicht beendet.',
        effect: 'Die Datei liegt nicht sicher auf der Karte, oder der Job lief nicht zu Ende.',
        action: 'SD-Karte prüfen (steckt sie, ist Platz frei?) und den Vorgang wiederholen.',
      },
      stream: {
        cause: 'Beim Senden des Programms Zeile für Zeile ist etwas schiefgegangen.',
        effect: 'Der gestreamte Job steht. Das Werkstück ist nur bis zu dieser Zeile gefräst.',
        action: 'Unter Fräsen → Alle Parameter ab der letzten Zeile fortsetzen – oder neu starten.',
      },
      motion: {
        cause:
          'Eine Fahrt wurde nicht ausgeführt oder abgebrochen. Der Grund steht meist in der Meldung davor: Verfahrweg, Verbindung oder Steuerung.',
        effect: 'Die Maschine steht womöglich woanders als geplant.',
        action: 'Position in der Statusleiste prüfen, dann wiederholen.',
      },
      probe: {
        cause: 'Der Taster hat nicht wie erwartet ausgelöst.',
        effect: 'Es wurde kein Messwert übernommen. Der Nullpunkt ist unverändert.',
        action: 'Kabel, Klemme und Abstand prüfen, dann erneut antasten.',
      },
      camera: {
        cause:
          'Im Kamerabild war nicht sicher zu erkennen, was gemessen werden sollte – oder das Ziel liegt außerhalb des Verfahrwegs.',
        effect: 'Es wurde nichts übernommen: lieber kein Wert als ein falscher.',
        action: 'Licht, Schärfe und Lage prüfen, dann die Messung wiederholen.',
      },
      config: {
        cause: 'Die Einstellungen der Steuerung ließen sich nicht lesen oder schreiben.',
        effect: 'Die Steuerung arbeitet mit dem bisherigen Stand weiter.',
        action: 'Verbindung prüfen und wiederholen. Eine Sicherung liegt neben der Datei.',
      },
      file: {
        cause: 'Die Datei ließ sich nicht lesen oder passt nicht.',
        effect: 'Es wurde nichts geladen. Der bisherige Job bleibt.',
        action: 'Datei prüfen (Format, Inhalt) und erneut öffnen.',
      },
      flow: {
        cause: 'Ein Schritt des Ablaufs ist nicht gelungen.',
        effect: 'Der Ablauf bleibt an diesem Schritt stehen. Nichts wurde übernommen.',
        action: 'Den Schritt im Ablauf wiederholen – dort steht, was fehlt.',
      },
      sync: {
        cause:
          'Beim Abgleich der Einstellungen mit dem Pi waren zwei Stände verschieden, oder der Pi hatte etwas, das diese App nicht lesen kann.',
        effect:
          'Wo die Meldung „ersetzt“ sagt, gilt jetzt der andere Wert; sonst wurde nichts überschrieben. Die Maschine selbst wurde nicht bewegt.',
        action:
          'Die Werte ansehen (Kamera und Kalibrierung unter Service, Orte unter Einstellungen). Ist ein Dokument auf dem Pi unbrauchbar: unter Einstellungen → Verbindung den Stand dieses Geräts auf den Pi schreiben.',
      },
      jobLocked: {
        cause:
          'Ein Job ist unterwegs: Er läuft von der SD-Karte oder wird gestreamt, steht zwischen zwei Teilen, oder die Verbindung riss unter ihm ab.',
        effect: 'Das Programm auf dem Tisch ist geblieben, wie es ist; nichts wurde verändert.',
        action:
          'Den Job zu Ende laufen lassen – oder in Fräsen beenden („Job abbrechen“, zwischen zwei Teilen „Restliche Teile abbrechen“) – und es dann noch einmal versuchen.',
      },
      limit: {
        cause: 'Die Bewegung hätte den Verfahrweg verlassen.',
        effect: 'Gefahren wurde höchstens bis zur Grenze.',
        action: 'Kleinere Schrittweite wählen oder in die andere Richtung fahren.',
      },
      linkPi: {
        cause:
          'Dieses Gerät erreicht den Raspberry Pi nicht: Er ist aus, startet noch oder ist in einem anderen Netz.',
        effect: 'Die App hat keine Verbindung zur Maschine.',
        action:
          'Pi einschalten oder warten, bis er gestartet ist; WLAN dieses Geräts prüfen. Die App versucht es von selbst weiter, solange kein Job läuft.',
      },
      linkRelay: {
        cause:
          'Der Raspberry Pi läuft, erreicht aber den Jackpot (FluidNC) nicht unter der Adresse, die bei ihm eingetragen ist.',
        effect: 'Die App hat keine Verbindung zur Maschine.',
        action:
          'Jackpot eingeschaltet? Im WLAN? FluidNC wählt sich nur beim Einschalten ins WLAN ein: erst den Router, dann den Jackpot einschalten – bleibt er draußen, den Jackpot aus- und wieder einschalten.',
      },
      linkDirect: {
        cause: 'Unter der eingegebenen Adresse meldet sich keine FluidNC.',
        effect: 'Die App hat keine Verbindung zur Maschine.',
        action:
          'Jackpot eingeschaltet? Im WLAN? Adresse richtig (Einstellungen → Verbindung)? FluidNC wählt sich nur beim Einschalten ins WLAN ein – nach dem Router einschalten, sonst neu starten.',
      },
      done: {
        cause: 'Ein Vorgang ist abgeschlossen.',
        effect: 'Es geht mit dem nächsten Schritt weiter.',
        action: 'Keine Maßnahme nötig.',
      },
      general: {
        cause: 'Die App konnte den Vorgang nicht ausführen.',
        effect: 'Es wurde nichts verändert.',
        action: 'Vorgang wiederholen. Einzelheiten stehen im Protokoll unter Service & Diagnose.',
      },
    },
  },
  critical: {
    job: 'Job',
    cause: 'Ursache',
    effect: 'Auswirkung',
    action: 'Was jetzt tun',
    since: 'Seit',
    acknowledge: 'Meldung quittieren',
    toConnection: 'Quittieren und zur Verbindung',
    lost: {
      title: 'Verbindung während des Jobs verloren',
      cause: 'WLAN, Strom oder die Steuerung: Die App erreicht die Maschine nicht mehr.',
      effectSd:
        'Die Maschine fräst von ihrer SD-Karte weiter. PAUSE und NOT-HALT der App erreichen sie jetzt nicht.',
      effectStream:
        'Die Maschine bekommt keine Zeilen mehr und bleibt stehen, sobald ihr Puffer leer ist. Der Job ist unterbrochen.',
      action:
        'Zur Maschine gehen. Im Notfall den Not-Aus an der Maschine drücken. Danach von Hand neu verbinden – die App verbindet sich nicht von selbst und setzt nichts von selbst fort.',
    },
  },
  recent: {
    several:
      '{count} Dateien geöffnet: „{name}“ ist geladen, die anderen stehen unter „Zuletzt verwendet“.',
  },
  jobCard: {
    recent: 'Zuletzt verwendet',
    sizeLabel: 'Größe',
    size: '{x} × {y} mm, {z} mm tief',
    noCut: 'fräst nichts',
    zero: 'Nullpunkt zuletzt: {wcs} X {x} · Y {y}',
    noZero: 'Noch nicht gefräst',
    tooLarge: 'Das Programm war zu groß zum Merken – die Datei bitte neu öffnen.',
    drop: 'G-Code-Dateien hierher ziehen oder unten rechts öffnen – auch mehrere auf einmal.',
    openOther: 'Andere Datei öffnen',
    tools: '{count} Werkzeuge – siehe Fräsen › Prüfen',
  },
  zeroFlow: {
    title: 'Nullpunkt setzen',
    unknown: 'Ohne Verbindung ist der Nullpunkt nicht bekannt.',
    notSet: 'Noch kein Nullpunkt gesetzt (er liegt im Maschinennullpunkt).',
    now: 'Nullpunkt {wcs}: X {x} · Y {y} · Z {z} (Maschine)',
    step1: '1 · Ziel im Bild antippen',
    pick: 'Ziel antippen',
    pickHint:
      'Jetzt im Bild die Stelle antippen. Das zeigt nur das Ziel – gefahren wird erst im nächsten Schritt.',
    pickIdle: 'Antippen zeigt nur das Ziel. Gefahren wird erst mit „Hinfahren“.',
    target: { x: 'Ziel X (mm)', y: 'Ziel Y (mm)' },
    step2: '2 · Hinfahren',
    reference: 'Was über das Ziel fährt',
    references: { camera: 'Fadenkreuz', tool: 'Fräser' },
    drive: { camera: 'Kamera hinfahren', tool: 'Fräser hinfahren' },
    needTarget: 'Erst im Bild ein Ziel antippen (Schritt 1).',
    low: 'Z steht unter der Sicherheitshöhe, und „vorher anheben“ ist aus: Der Fräser fährt auf dieser Höhe seitlich.',
    lowConfirm: 'Ich habe nachgesehen: Der Weg ist frei.',
    needClear:
      'Z steht unter der Sicherheitshöhe: erst bestätigen, dass der Weg frei ist – oder „vorher anheben“ einschalten.',
    step3: '3 · Fein korrigieren',
    ownStep: 'Eigener Schritt (mm)',
    at: {
      camera: 'Fadenkreuz steht auf X {x} · Y {y}',
      tool: 'Fräser steht auf X {x} · Y {y}',
    },
    step4: '4 · Nullpunkt setzen',
    set: {
      camera: 'Nullpunkt hier setzen (Fadenkreuz)',
      tool: 'Nullpunkt hier setzen (Fräser)',
    },
    done: 'Nullpunkt X/Y gesetzt. Für die Höhe: Z antasten (Bereich „Antasten“).',
    history: 'Nullpunkte dieses Jobs',
    historyEmpty:
      'Noch keiner: Beim Start merkt sich die App, mit welchem Nullpunkt der Job gefräst wurde (die letzten 5).',
    historyHint: 'Wiederhergestellt werden X und Y. Z hängt vom Werkzeug ab – neu antasten.',
    restore: 'X/Y wiederherstellen',
  },
  probeTiles: {
    z: 'Z-Oberfläche',
    angle: 'Winkel ausrichten',
    hints: {
      z: 'von oben auf die Tastplatte',
      corner: 'von außen an zwei Kanten',
      edge: 'seitlich an eine Kante',
      center: 'in der Bohrung nach vier Seiten',
      toolLength: 'von oben auf den Sensor',
      angle: 'zwei Punkte entlang einer Kante',
    },
    angleText:
      'Liegt das Brett schief, wird der Job gedreht statt das Brett: im Bild zwei Punkte entlang einer Kante antippen. Dabei fährt nichts.',
    angleStart: 'Kante im Bild antippen',
    angleNumbers: 'Winkel als Zahl eingeben',
  },
  timeline: {
    operations: 'Operationen',
    operation: 'Operation {n}',
  },
  toolsStep: {
    title: 'Werkzeuge des Jobs',
    empty: 'Noch kein Programm geladen – dann stehen hier seine Werkzeuge.',
    noNumber: 'Ohne T-Nummer',
    fluteLength: 'Schneide {mm} mm',
    depth: 'fräst {mm} mm tief',
    states: { ok: 'passt', warn: 'prüfen', block: 'fehlt' },
    issues: {
      none: 'Die Werkzeugliste ist leer: Für dieses Werkzeug steht nichts bereit.',
      unknown:
        'Steht nicht in der Werkzeugliste – gezeigt wird das nächstliegende. Bitte prüfen oder wählen.',
      fluteShort: 'Der Job fräst {depth} mm tief, die Schneide ist nur {flute} mm lang.',
      diameter: 'Der Durchmesser passt nicht zu dem, den das CAM nennt.',
      probe: 'Als Messtaster markiert: Spindelstart gesperrt – der Start fragt jedes Mal nach.',
    },
    alternative: 'Passt aus der Werkzeugliste:',
    use: '{tool} übernehmen',
    measure: 'Länge messen',
    noSetter:
      'Kein Werkzeuglängensensor eingerichtet. Seine Position steht unter Einrichten → Antasten → Werkzeuglänge.',
    toProbe: 'Sensor einrichten',
    toList: 'Werkzeugliste öffnen',
  },
  state: {
    kinds: {
      offline: 'Nicht verbunden',
      connecting: 'Verbinde …',
      ready: 'Bereit',
      run: 'Läuft',
      hold: 'Pausiert',
      probe: 'Antasten',
      alarm: 'Alarm',
    },
    alarmText: 'Alarm – {text}',
    Alarm: 'Alarm',
    Door: 'Tür offen',
  },
  status: {
    deviation: 'Abweichung',
    deviationMax: 'max.',
    deviationShort: 'Abw.',
    line: 'Zeile',
    work: 'Werkstück',
  },
  estop: {
    label: 'NOT-HALT',
    hint: 'Hält sofort an und setzt die Steuerung zurück',
    notConnected: 'Not-Halt nicht gesendet: keine Verbindung. Hardware-Not-Aus benutzen!',
    holdNotSent: 'Halt nicht gesendet: keine Verbindung. Hardware-Not-Aus benutzen!',
    sent: 'Not-Halt gesendet (Vorschub-Halt + Soft-Reset)',
  },
  hold: {
    holdToConfirm: 'Halten zum Bestätigen',
  },
  reason: {
    connecting: 'Die Verbindung wird gerade aufgebaut – einen Moment.',
    alarm: 'Die Steuerung ist im Alarm: erst entsperren oder neu referenzieren.',
    hold: 'Die Maschine ist pausiert: erst fortsetzen oder den Job abbrechen (Fräsen).',
    viewer: 'Nur Ansicht: ein anderes Gerät steuert die Maschine. PAUSE und NOT-HALT gehen weiter.',
    missing: 'Dafür fehlt noch eine Voraussetzung – sie steht in dieser Karte.',
  },
  jog: {
    stop: 'Stopp',
    reason: {
      offline: 'Nicht verbunden: erst unter Einstellungen → Verbindung verbinden.',
      busy: 'Geht nur, wenn die Maschine steht (Zustand „Bereit“).',
      noZero: 'Noch kein Nullpunkt gesetzt (Reiter Einrichten).',
      notHomed: 'Erst die Referenzfahrt: ohne sie kennt die Maschine ihre Position nicht.',
      noPark: 'Noch keine Parkposition gemerkt (hier unter „Mehr Optionen“).',
      noChange: 'Noch keine Werkzeugwechsel-Position gemerkt (hier unter „Mehr Optionen“).',
    },
    quick: {
      label: 'Schnellaktionen',
      zero: 'Gehe zu Null',
      park: 'Parkposition',
      change: 'Werkzeugwechsel',
      home: 'Referenzfahrt',
    },
    wheel: {
      title: 'Mausrad-Feinjog: {axis} in {step} mm',
      titleNoAxis: 'Mausrad-Feinjog',
      hint: 'Maustaste hier halten und das Rad drehen.',
      armed: 'Aktiv – Rad drehen. Loslassen beendet.',
      noAxis: 'Erst eine Achse bewegen: Das Mausrad fährt die zuletzt bewegte Achse.',
    },
    park: {
      title: 'Parkposition',
      none: 'Noch keine Parkposition gemerkt.',
      at: 'Gemerkt: X {x} · Y {y} mm (Maschinenkoordinaten)',
      set: 'Aktuelle Position merken',
      clear: 'Parkposition vergessen',
      hint: '„Parkposition“ (Halten) hebt erst auf die Sicherheitshöhe und fährt dann dorthin.',
      saved: 'Parkposition gemerkt: X {x} · Y {y}.',
    },
    change: {
      title: 'Werkzeugwechsel-Position',
      none: 'Noch keine Werkzeugwechsel-Position gemerkt – der Job hält zum Wechseln dort, wo er steht.',
      at: 'Gemerkt: X {x} · Y {y} mm (Maschinenkoordinaten)',
      set: 'Aktuelle Position merken',
      clear: 'Werkzeugwechsel-Position vergessen',
      hint: '„Werkzeugwechsel“ (Halten) hebt erst auf die Sicherheitshöhe und fährt dann dorthin; ein Job fährt beim Wechsel von selbst hin. Dieselben Werte stehen unter Einstellungen → Maschine → Werkstatt.',
      saved: 'Werkzeugwechsel-Position gemerkt: X {x} · Y {y}.',
      locked:
        'Ein Job ist unterwegs – er fährt zum Wechseln dorthin; die Position ändert sich erst danach.',
    },
    waypoints: {
      title: 'Merkpunkte',
      empty: 'Noch kein Merkpunkt. Position anfahren, Namen eintragen, „Position merken“.',
      name: 'Name des Merkpunkts',
      set: 'Position merken',
      go: 'Anfahren: {name}',
      remove: 'Merkpunkt „{name}“ löschen',
      at: 'X {x} · Y {y} mm (Maschinenkoordinaten)',
      hint: '„Anfahren“ (Halten) hebt erst auf die Sicherheitshöhe und fährt dann zum Merkpunkt. Derselbe Name noch einmal verschiebt den Merkpunkt an die neue Stelle.',
      saved: 'Merkpunkt „{name}“ gemerkt: X {x} · Y {y}.',
      full: 'Mehr als {max} Merkpunkte gibt es nicht – erst einen löschen.',
      needName: 'Erst einen Namen eintragen.',
    },
    more: { homing: 'Einzelne Achsen und Entsperren' },
  },
  drive: {
    inputsLabel: 'Eingänge',
    inputX: 'Endschalter X',
    inputY: 'Endschalter Y',
    inputZ: 'Endschalter Z',
    inputProbe: 'Tastplatte',
    inputOn: 'ausgelöst',
    inputOff: 'frei',
    inputsHint:
      'Leuchtet, solange der Schalter gedrückt ist. Vor der ersten Referenzfahrt jeden Schalter von Hand drücken und hier prüfen.',
    homedPartly:
      'Referenziert: {axes} – es fehlt {missing}. Software-Endschalter erst, wenn alle Achsen referenziert sind.',
    input: 'Bedienart',
    inputs: {
      buttons: 'Steuerkreuz',
      wheel: 'Handrad',
      stick: 'Joystick',
    },
    position: 'Position',
    unlock: 'Entsperren ($X)',
    feedHold: 'Pause',
    resume: 'Fortsetzen',
    offline: 'Zum Fahren zuerst unter „Maschine“ verbinden.',
    jog: 'Joggen',
    step: 'Schrittweite',
    jogStop: 'Jog stoppen',
    remaining: 'noch {distance}',
    atLimit: '{axis}: Grenze des Verfahrwegs erreicht – Jog nicht gesendet.',
    limited: '{axis}: Jog an der Grenze des Verfahrwegs gekürzt.',
    notAtRest:
      '{axis}: Die Maschine kommt nicht zur Ruhe – Schritt nicht gesendet. Bitte noch einmal tippen.',
    homed: 'Referenzfahrt abgeschlossen ({axes}) – Software-Endschalter aktiv.',
    notHomed: 'Nicht referenziert – Position unbekannt, Endschalter inaktiv.',
    limitsOff: 'Software-Endschalter sind im Maschinenprofil ausgeschaltet.',
    zero: 'Nullpunkt (Werkstück)',
    zeroHint: 'Setzt die aktuelle Position als Nullpunkt des aktiven Koordinatensystems.',
    zeroSet: '{axes}: Nullpunkt gesetzt.',
    homeAxis: 'Ref. {axis}',
    travelPlaceholder: 'Verfahrweg im Profil fehlt – Grenzen sind Platzhalter.',
    continuous: 'Dauer',
    continuousHint: 'Halten zum Fahren, loslassen stoppt sofort.',
    wheel: 'Handrad',
    wheelAxis: 'Achse des Handrads',
    keyboardHint: 'Tastatur: Pfeiltasten X/Y, Bild↑/↓ Z, Esc stoppt.',
    gamepad: 'Gamepad: {name}',
  },
  wcs: {
    title: 'Koordinatensystem',
    hint: 'Je Spannposition ein eigenes System (G54–G59); der Job nutzt das aktive.',
    offset: 'Nullpunkt {wcs} (Maschine)',
    tlo: 'Werkzeuglängenkorrektur aktiv: {mm} mm',
    refresh: 'Neu lesen ($G, $#)',
    selected: '{wcs} ist aktiv.',
  },
  zeros: {
    title: 'Nullpunkt-Speicher',
    hint: 'Nullpunkte wiederkehrender Aufspannungen mit Namen und Foto merken.',
    empty: 'Noch keine Nullpunkte gespeichert.',
    restore: 'Übernehmen',
    remove: 'Löschen',
    saveCurrent: 'Aktuellen Nullpunkt ({wcs}) speichern',
    name: 'Name der Aufspannung',
    photo: 'Foto aufnehmen',
    photoTaken: 'Foto ✓',
    save: 'Speichern',
    saved: 'Nullpunkt „{name}“ gespeichert.',
    restored: 'Nullpunkt „{name}“ übernommen.',
    noOffset: 'Nullpunkt konnte nicht gelesen werden ($#).',
  },
  probeWizard: {
    title: 'Tastzyklen',
    corner: 'Ecke',
    edge: 'Kante',
    center: 'Bohrungsmitte',
    toolLength: 'Werkzeuglänge',
    cornerHint:
      'Ecken-Tastplatte auf die Werkstückecke legen, Klemme an den Fräser, Fräser über die Platte fahren – innen an der Ecke, im eingestellten Abstand zu beiden Kanten. Ergebnis: X, Y und Z.',
    edgeHint:
      'Fräser neben das Werkstück unterhalb der Oberkante fahren; die Richtung zeigt zum Werkstück. Der Nullpunkt liegt auf der Kante.',
    centerHint:
      'Fräser ungefähr in die Mitte der Bohrung unterhalb der Oberkante fahren. Ergebnis: X und Y der Mitte und der Durchmesser.',
    toolLengthHint:
      'Misst die Länge auf dem Werkzeuglängensensor. Erst das Referenzwerkzeug messen, dann nach jedem Wechsel: die App setzt die Längenkorrektur (G43.1).',
    whichCorner: 'Welche Ecke',
    corners: {
      'back-left': 'hinten links',
      'back-right': 'hinten rechts',
      'front-left': 'vorne links',
      'front-right': 'vorne rechts',
    },
    direction: 'Richtung zum Werkstück',
    edges: {
      'x+': 'X+ (rechts)',
      'x-': 'X− (links)',
      'y+': 'Y+ (hinten)',
      'y-': 'Y− (vorne)',
    },
    toolDiameter: 'Werkzeug-Ø (mm)',
    inset: 'Abstand zu den Kanten (mm)',
    depth: 'Tasttiefe unter Oberkante (mm)',
    setter: {
      x: 'Sensor X (Maschine)',
      y: 'Sensor Y (Maschine)',
      safeZ: 'Sichere Höhe Z (Maschine)',
    },
    saveSetter: 'Sensorposition speichern',
    setterHere: 'Aktuelle Position',
    setterSaved: 'Position des Werkzeuglängensensors gespeichert.',
    noSetter: 'Kein Werkzeuglängensensor eingetragen.',
    reference: 'Referenz: Z {z} (Maschine)',
    start: 'Tastzyklus starten',
    running: 'Taste …',
    bore: 'Bohrung: Ø X {x} mm, Ø Y {y} mm',
    measured: 'Gemessen: Z {z} (Maschine)',
    asReference: 'Als Referenz merken',
    referenceSaved: 'Referenzlänge gespeichert.',
    applyTlo: 'Längenkorrektur setzen',
    tloApplied: 'Werkzeuglängenkorrektur gesetzt: {cmd}',
    zeroApplied: 'Nullpunkt übernommen.',
    discarded: 'Verworfen – der Nullpunkt bleibt, wie er war.',
    zeroAxis: 'Nullpunkt {axis}',
    deviation: '{mm} mm gegenüber bisher',
    apply: 'Nullpunkt übernehmen',
    discard: 'Messung verwerfen',
    done: 'Tastzyklus abgeschlossen.',
    failed: 'Tastzyklus abgebrochen – kein Kontakt oder Befehl abgelehnt. Position prüfen.',
    plate: 'Tastplatte',
    withPlate: 'Ecken-Tastplatte',
    withoutPlate: 'Ohne Platte',
    withoutPlateHint: 'Nur bei leitendem Werkstück (Alu): Der Fräser berührt das Werkstück selbst.',
    plateTop: 'Plattendicke oben (mm)',
    plateWall: 'Wandstärke seitlich (mm)',
    plateMissing: 'Maße der Tastplatte mit dem Messschieber messen und eintragen.',
  },
  toolChange: {
    title: 'Werkzeugwechsel',
    held: 'Job hält für Werkzeugwechsel auf T{tool}.',
    unknownTool: 'Werkzeug nicht in der Bibliothek.',
    line: 'Zeile {line}',
    step1: 'Spindel ist aus, Z ist oben. Spindel stillstehen lassen.',
    step2: 'Werkzeug wechseln und Spannzange fest anziehen.',
    step3: 'Länge messen: Werkzeuglängensensor oder Z mit der Platte neu antasten.',
    measureSetter: 'Mit Sensor messen',
    probePlate: 'Z mit Platte antasten',
    plateHint: 'Zum Antasten mit der Platte vorher unter „Fahren“ über das Werkstück fahren.',
    measured: 'Gemessen – Platte und Klemme entfernen!',
    continue: 'Job fortsetzen',
    abort: 'Job abbrechen',
  },
  stream: {
    started: 'Job {name} wird gestreamt.',
    done: 'Job {name} fertig.',
    aborted: 'Job {name} abgebrochen.',
    failed: 'Job nicht gestartet: {reason}',
    lineError: 'Zeile {line} abgelehnt (Fehler {code}).',
    lines: 'Zeilen',
  },
  frame: {
    started: 'Rahmen wird abgefahren.',
    failed: 'Rahmen abgebrochen.',
  },
  run: {
    toolChanges:
      '{count} Werkzeugwechsel: Der Job hält jeweils an und führt durch Wechsel und Messung.',
    frame: 'Rahmen abfahren',
    stream: 'Programm starten',
    streamHint:
      'Die App sendet den Job Zeile für Zeile – das Tablet muss verbunden bleiben. Für lange Jobs ohne Tablet: SD-Karte.',
    saveCompanion: 'Im Companion ablegen',
    savedCompanion: '{name} im Companion abgelegt.',
    singleStep: 'Einzelschritt',
    singleStepHint:
      'Einzelschritt: Der Job hält vor jedem Satz; „Nächster Satz“ sendet genau eine Zeile.',
    stepAt: 'Wartet vor Zeile {line}:',
    nextBlock: 'Nächster Satz',
    stepOff: 'Einzelschritt aus',
  },
  measurements: {
    title: 'Messprotokoll',
    hint: 'Was an der Maschine gemessen und an der Steuerung korrigiert wurde, mit Zeit und Werten. Mit einem Pi als Companion liegt es auch dort und ist auf jedem Gerät da. Was im Simulator gemessen wird, steht nicht darin.',
    more: 'Die letzten {shown} von {total} Einträgen.',
    empty: 'Noch nichts gemessen.',
    kinds: {
      'camera-scale': 'Kamera: Maßstab',
      'camera-offset': 'Kamera: Versatz',
      'machine-grid': 'Maschine vermessen: Raster',
      'machine-backlash': 'Umkehrspiel',
      'machine-tilt': 'Z-Schiefe',
      'ruler-check': 'Genauigkeits-Check mit Lineal',
      correction: 'Korrektur in config.yaml geschrieben',
      'tool-reference': 'Referenz-Werkzeug',
    },
    summary: {
      cameraScale: '{px} px/mm · Drehung {angle}° · Kamerahöhe Z {z}',
      cameraOffset: 'Versatz X {x} · Y {y} mm',
      machineGrid: 'Maßstab X {sx} % · Y {sy} % · Rechtwinkligkeit {sq}° · {points} Punkte{turned}',
      turned: ' (Tafel gedreht)',
      machineBacklash: 'Umkehrspiel X {x} · Y {y} mm',
      machineTilt: 'Neigung X {x}° · Y {y}° ({per100} mm auf 100 mm)',
      rulerCheck: '{w} × {h} mm: Maßstab X {sx} % · Y {sy} % · Rechtwinkligkeit {sq}°',
      correction: '{list}',
      toolReference: 'Z {z}',
    },
  },
  access: {
    title: 'Anmeldung am Pi',
    intro:
      'Damit nicht jeder im WLAN Code auf den Pi laden oder ihn ausschalten kann, brauchen das Aktualisieren und das Herunterfahren eine Anmeldung. Einmal pro Gerät: den Pi-Code eingeben (die App auf dem Home-Bildschirm und Safari zählen als zwei Geräte). Er steht am Ende der Einrichtung auf dem Pi – ging das Fenster zu: update-pi.bat noch einmal ausführen, er steht wieder am Ende – und hier, auf einem Gerät, das schon angemeldet ist.',
    oldCompanion:
      'Der Companion auf dem Pi hat noch keine Anmeldung. Einmal die neue Version einspielen: update-pi.bat auf dem PC (sie liegt in lowrider-pi.zip).',
    offline: 'Der Pi antwortet nicht – die Anmeldung geht, sobald er wieder da ist.',
    code: 'Pi-Code',
    codeHint: '12 Zeichen, zum Beispiel ABCD-EFGH-JKLM – groß oder klein, mit oder ohne Striche.',
    name: 'Name dieses Geräts',
    login: 'Anmelden',
    loggedIn: 'Angemeldet als „{name}“.',
    logout: 'Dieses Gerät abmelden',
    showCode: 'Pi-Code anzeigen',
    hideCode: 'Code verbergen',
    codeShown: 'Pi-Code: {code}',
    codeUse:
      'Mit diesem Code meldest du ein weiteres Gerät an. Wer ihn kennt, darf den Pi aktualisieren und herunterfahren.',
    devices: 'Angemeldete Geräte',
    thisDevice: 'dieses Gerät',
    device: {
      androidPhone: 'Android-Handy',
      androidTablet: 'Android-Tablet',
      windows: 'Windows-PC',
      linux: 'Linux-PC',
      other: 'Gerät',
    },
    removeDevice: '{name} entfernen',
    lastSeen: 'zuletzt gesehen {time}',
    remove: 'Entfernen',
    renew: 'Neuen Pi-Code erzeugen (halten)',
    renewHint: 'Der alte Code gilt dann nicht mehr. Die angemeldeten Geräte bleiben angemeldet.',
    revokeOthers: 'Alle anderen Geräte abmelden (halten)',
    revokeHint:
      'Erzeugt zugleich einen neuen Pi-Code. Danach muss sich jedes andere Gerät neu anmelden.',
    renewed: 'Neuer Pi-Code: {code}',
    expired:
      'Diese Anmeldung gilt nicht mehr (das Gerät wurde auf dem Pi entfernt, oder der Pi ist ein anderer). Bitte neu anmelden.',
    plain:
      'Hinweis: Code und Anmeldung gehen unverschlüsselt durchs WLAN. Sie halten fremde Webseiten und Gäste-Geräte fern – nicht jemanden, der den Funkverkehr mitliest.',
    errors: {
      'wrong-code': 'Der Code stimmt nicht.',
      locked: 'Zu viele falsche Versuche – bitte {seconds} s warten.',
      network: 'Der Pi antwortet nicht.',
      other: 'Das hat nicht geklappt.',
    },
  },
  update: {
    title: 'Update des Pi',
    intro:
      'Spielt eine neue Version der App und des Companions auf dem Pi ein – ohne Eingabeaufforderung: die Datei lowrider-pi.zip wählen, prüfen, einspielen. Die Datenbank bleibt, vorher wird sie gesichert. Startet die neue Version nicht, kehrt der Pi von selbst zur alten zurück.',
    notEnabled:
      'Dieser Pi kann sich noch nicht aus der App aktualisieren. Einmal update-pi.bat auf dem PC ausführen – danach geht es hier.',
    needLogin: 'Zum Aktualisieren erst anmelden (Karte „Anmeldung am Pi“).',
    running: 'Läuft: Version {version}, Stand {date} ({commit}).',
    before: 'Davor: Stand {date} ({commit}).',
    trial: 'Die neue Version bestätigt sich noch (sie muss eine halbe Minute laufen) …',
    last: {
      ok: 'Letztes Update: gelungen ({date}).',
      'rolled-back':
        'Letztes Update: die neue Version ist nicht angelaufen – der Pi ist von selbst zur alten zurückgekehrt ({date}).',
      'rolled-back-by-hand': 'Zuletzt von Hand zur vorherigen Version zurückgestellt ({date}).',
      pending: 'Letztes Update: läuft noch an …',
    },
    checksum: 'Prüfsumme (SHA-256) der Datei – empfohlen',
    checksumHint:
      'Die lange Zahl (64 Zeichen), die dir getrennt von der Datei genannt wurde – zum Beispiel in der Nachricht, mit der du die Datei bekommen hast. Der Pi prüft damit, dass die Datei unterwegs nicht verändert wurde. Ohne sie prüft er nur, ob die Datei in sich stimmt.',
    choose: 'Datei wählen (lowrider-pi.zip)',
    uploading: 'Die Datei wird zum Pi geschickt und geprüft …',
    found: 'Gefunden: Version {version}, Stand {date} ({commit}), {files} Dateien.',
    newer: 'Neuer als die laufende Version.',
    notNewer: 'Nicht neuer als die laufende Version.',
    allowOlder: 'Trotzdem einspielen (gleiche oder ältere Version)',
    sha: 'Prüfsumme der Datei, vom Pi berechnet: {sha}',
    checked: 'Die Prüfsumme stimmt.',
    unchecked: 'Ohne Prüfsumme: vergleiche die Zahl oben mit der, die du bekommen hast.',
    apply: 'Auf dem Pi einspielen (halten)',
    discard: 'Verwerfen',
    blocked: {
      job: 'Ein Job läuft oder wartet – erst beenden.',
      moving: 'Die Maschine bewegt sich – erst warten.',
      none: 'Erst eine Datei wählen.',
      working: 'Es läuft schon etwas.',
    },
    applying: 'Wird eingespielt … (der Pi sichert die Datenbank und probiert die neue Version aus)',
    restarting:
      'Der Pi startet neu – die Verbindung zur Maschine über den Pi ist weg und muss danach neu hergestellt werden …',
    done: 'Fertig: der Pi läuft mit Stand {date}. Die Verbindung zur Maschine bitte neu herstellen.',
    settling:
      'Der Pi läuft mit Stand {date} und bestätigt sich noch – gleich ist es fertig. Bis dahin nichts neu laden …',
    unconfirmed:
      'Der Pi läuft mit Stand {date}, hat sich aber noch nicht bestätigt. Bitte in einer Minute noch einmal prüfen.',
    recheck: 'Neu prüfen',
    reload: 'Neue Version laden',
    rollback: 'Zur vorherigen Version zurück (halten)',
    rollbackHint:
      'Stellt die Version wieder her, die davor lief – ein zweites Mal gehalten, wieder die neue.',
    busyWhy: {
      'machine-connected':
        'Ein anderes Gerät ist über den Pi mit der Maschine verbunden. Dort trennen, dann noch einmal.',
      recording: 'Eine Aufnahme läuft.',
      other: 'Auf dem Pi läuft gerade ein anderes Update.',
    },
    errors: {
      unauthorized: 'Nicht angemeldet – bitte unter „Anmeldung am Pi“ anmelden.',
      'not-enabled':
        'Dieser Pi kann sich nicht aus der App aktualisieren – einmal update-pi.bat auf dem PC.',
      'bad-zip':
        'Das ist keine gültige lowrider-pi.zip (oder sie ist beschädigt). Technischer Grund (englisch): {detail}',
      'bad-release':
        'In der Datei fehlt etwas, oder es ist etwas Fremdes darin. Technischer Grund (englisch): {detail}',
      'checksum-mismatch':
        'Die Prüfsumme stimmt nicht – das ist nicht die Datei, die du bekommen hast. Die Datei hat die Prüfsumme {detail}.',
      'no-staged': 'Die hochgeladene Datei ist nicht mehr da – bitte noch einmal wählen.',
      'not-newer': 'Diese Version ist nicht neuer als die laufende.',
      'needs-setup':
        'Diese Version braucht eine neue Einrichtung des Pi: update-pi.bat auf dem PC ausführen.',
      busy: 'Gerade nicht möglich: {why}',
      'backup-failed':
        'Die Datenbank konnte nicht gesichert werden – darum wurde nichts geändert. Meist ist die Karte zu voll: Platz schaffen (alte Aufnahmen löschen) oder die Sicherungen auf einen USB-Stick legen. Technischer Grund (englisch): {detail}',
      'check-failed':
        'Die neue Version startet nicht (Probelauf) – nichts wurde geändert. Technischer Grund (englisch): {detail}',
      'no-previous': 'Es gibt keine vorherige Version.',
      failed: 'Das hat nicht geklappt. Technischer Grund (englisch): {detail}',
      'expected-zip': 'Das ist keine Zip-Datei.',
      'too-large': 'Die Datei ist zu groß.',
      network: 'Der Pi antwortet nicht.',
      other: 'Das hat nicht geklappt.',
      'rolled-back':
        'Die neue Version ist nicht angelaufen – der Pi ist von selbst zur alten Version zurückgekehrt. Es ist nichts kaputt.',
      'not-applied':
        'Ob das Update beim Pi angekommen ist, ist unklar: er läuft noch mit der alten Version. In einer Minute den Stand prüfen (er erscheint hier von selbst), sonst noch einmal versuchen.',
      'no-answer':
        'Der Pi hat sich nach dem Neustart nicht wieder gemeldet. Gib ihm ein paar Minuten; sonst update-pi.bat auf dem PC – das stellt ihn wieder auf.',
    },
  },
  sync: {
    title: 'Einstellungen und Messwerte auf dem Pi',
    state: {
      off: 'Kein Companion verbunden – Einstellungen und Messwerte bleiben in diesem Browser.',
      syncing: 'Wird abgeglichen …',
      ok: 'Auf dem Pi gesichert (zuletzt {time}).',
      offline: 'Der Pi antwortet nicht – es gilt vorerst nur auf diesem Gerät und wird nachgeholt.',
      unsupported:
        'Der Companion auf dem Pi kennt diesen Speicher noch nicht – die neue Version einspielen: update-pi.bat auf dem PC.',
      paused: 'Pausiert, solange der Simulator läuft – was dort eingestellt wird, gilt nur dort.',
      deferred:
        'Der Abgleich wartet, bis die Maschine steht – neuere Werte vom Pi liegen bereit, Änderungen dieses Geräts gehen danach hinaus.',
      refused:
        'Auf dem Pi liegen Einstellungen, die nicht zu dieser App passen – nichts übernommen.',
      failed:
        'Der Pi hat geantwortet, aber der Abgleich ist nicht gelungen – er wird beim nächsten Mal wieder versucht.',
    },
    notThrough:
      'Die Bibliotheken sind abgeglichen, die Einstellungen und Messwerte noch nicht – die Zeile darunter sagt, woran es liegt.',
    overwrite: 'Stand dieses Geräts auf den Pi schreiben',
    overwriteHint:
      'Ersetzt, was auf dem Pi liegt und nicht zu dieser App passt, durch die Einstellungen dieses Geräts.',
    overwritten: 'Auf dem Pi ersetzt durch den Stand dieses Geräts: {list}.',
    applyFailed:
      'Die Werte vom Pi ({field}) konnten nicht übernommen werden – dieses Gerät behält seinen Stand.',
    rewound:
      'Der Pi hat einen älteren Stand als beim letzten Abgleich (Wiederherstellung?) – übernommen: {list}.',
    macrosFromPi: 'Makros vom Pi übernommen: {list}. Vor dem ersten Einsatz den Text ansehen.',
    refused:
      'Die Einstellungen auf dem Pi sind unbrauchbar ({field}) – nichts übernommen, nichts überschrieben.',
    replacedLocal: 'Vom Pi übernommen: {list}. Abweichende Werte dieses Geräts sind ersetzt.',
    replacedOther:
      'Ein anderes Gerät hatte {list} gleichzeitig geändert – der Stand dieses Geräts gilt jetzt.',
    simulatorEnded: 'Simulator beendet: die Einstellungen sind wieder wie vor dem Simulator.',
    keys: {
      camera: 'Kamera',
      calibration: 'Kalibrierung',
      spindle: 'Spindel',
      toolSetter: 'Werkzeuglängensensor',
      toolChangePosition: 'Werkzeugwechsel-Position',
      parkPosition: 'Parkposition',
      waypoints: 'Merkpunkte',
      hiddenFeatures: 'ausgeblendete Funktionen',
      safeMachineZ: 'sichere Höhe',
      notifyCompanion: 'Benachrichtigung über den Pi',
      adaptive: 'adaptiver Vorschub',
      cornerPlate: 'Eckenplatte',
      recording: 'Aufzeichnung',
    },
    // The other documents are named as a whole
    slices: {
      settings: 'Einstellungen',
      clamps: 'Spannmittel',
      toolReference: 'Referenzwerkzeug',
      macros: 'Makros',
      learning: 'Lernwerte',
      profile: 'Maschinenwerte',
    },
    lastOk: 'Zuletzt gesichert: {time}.',
  },
  companion: {
    shutdownTitle: 'Pi herunterfahren',
    shutdownHint:
      'Vor dem Ausstecken: fährt den Pi sauber herunter, damit seine SD-Karte nicht beschädigt wird. Die Fräse bleibt an, nur Companion, Kamera und Weiterleitung gehen aus.',
    shutdown: 'Pi herunterfahren (halten)',
    shutdownBusy: 'Erst wenn die Maschine steht.',
    shutdownRequesting: 'Pi wird benachrichtigt …',
    shutdownStopping: 'Pi fährt herunter … noch nicht ausstecken.',
    shutdownSettling:
      'Pi antwortet nicht mehr und schaltet ab – noch {seconds} s, noch nicht ausstecken.',
    shutdownDone:
      'Pi ist aus. Bleibt die grüne LED am Pi dunkel, kannst du den Stecker jetzt ziehen.',
    shutdownAgain: 'Pi läuft wieder',
    shutdownNotSupported:
      'Dieser Companion kann den Pi noch nicht herunterfahren. Neue Version einspielen: update-pi.bat auf dem PC.',
    shutdownRequestFailed: 'Companion nicht erreichbar – der Pi wurde nicht heruntergefahren.',
    shutdownRefused:
      'Der Pi hat das Herunterfahren abgelehnt ({detail}). update-pi.bat noch einmal ausführen – es richtet die Berechtigung ein.',
    shutdownNeedsLogin: 'Zum Herunterfahren erst anmelden (Karte „Anmeldung am Pi“).',
    shutdownStillRunning:
      'Der Pi antwortet nach einer Minute noch. Nicht ausstecken – per SSH „sudo poweroff“ eingeben.',
    offline: 'Companion nicht erreichbar.',
    title: 'Companion-Rechner',
    intro:
      'Optional: ein Raspberry Pi oder Mini-PC an der Maschine hält Werkzeuge, Materialien und Historie, puffert Jobs, leitet FluidNC weiter und liefert Sensordaten.',
    address: 'Adresse des Companion',
    test: 'Verbindung testen',
    sync: 'Jetzt abgleichen',
    synced: 'Bibliotheken mit dem Companion abgeglichen.',
    online: 'Companion {version} erreichbar.',
    noRelay: 'Keine FluidNC-Weiterleitung eingerichtet.',
    backup: 'Datensicherung des Pi: zuletzt {name} ({count} aufbewahrt, einmal am Tag).',
    backupNone: 'Datensicherung des Pi: noch keine – die erste kommt beim nächsten Lauf.',
    backupFailed:
      'Die tägliche Datensicherung des Pi ist fehlgeschlagen: {error}. Platz auf der Karte und der Sicherungsordner (LOWRIDER_BACKUP_DIR) prüfen.',
    camera: 'Kamera-Stream: {url}',
  },
  resume: {
    title: 'Wiederaufnahme ab Zeile',
    hint: 'Nach einem Abbruch: stellt die Modalzustände her, fährt sicher über den Startpunkt und setzt dort fort.',
    line: 'Zeile (1–{max})',
    invalid: 'Zeile liegt nicht im Programm.',
    warning: 'Achtung: {text}',
    needsHoming: 'Erst referenzieren – die sichere Höhe ist eine Maschinenkoordinate.',
    start: 'Ab Zeile {line} starten',
  },
  history: {
    deviationTrend: 'Abweichung über den Job',
    title: 'Job-Historie',
    empty: 'Noch keine Jobs aufgezeichnet.',
    wearWarning: 'Die Abweichung steigt über die Jobs – Riemen, Rollen und Schrauben prüfen.',
    wearOk: 'Abweichung über die Jobs stabil.',
    wearNumbers: '(anfangs {baseline} mm, zuletzt {latest} mm, Trend {slope} mm je 10 Jobs)',
    wearNeedsJobs: 'Für den Verschleiß-Trend braucht es mindestens 5 gemessene Jobs.',
    acrossJobs: 'Mittlere Abweichung je Job',
    accuracy: 'Zeitschätzung im Mittel {percent} % daneben.',
    results: {
      done: 'fertig',
      aborted: 'abgebrochen',
      alarm: 'Alarm',
    },
    duration: 'Dauer',
    estimate: 'geschätzt',
    material: 'Material',
    override: 'Ø Override',
    alarms: 'Alarme',
    deviationValues: 'Ø {mean} · 95 % {p95} · max {max} mm',
    export: 'Exportieren (JSON)',
    clear: 'Historie löschen',
  },
  job: {
    open: 'G-Code öffnen',
    sample: 'Beispiel laden',
    lines: 'Zeilen',
    segments: 'Bewegungen',
    tools: 'Werkzeuge',
    range: 'Bereich (Fräsen)',
    feeds: 'Vorschübe',
    distance: 'Weg Vorschub / Eilgang',
    estimate: 'Geschätzte Laufzeit',
    rotary: 'Rotary-Job (Achse A)',
    toolDiameter: 'Werkzeug-Ø',
    simulation: 'Simulation',
    play: 'Abspielen',
    pause: 'Anhalten',
    rewind: 'Zum Anfang',
    speed: 'Zeitfaktor',
    currentLine: 'Aktuelle Zeile',
    diagnostics: 'Hinweise zum G-Code',
    noDiagnostics: 'Keine Probleme gefunden.',
    errorsFound: '{count} Fehler – die Steuerung würde diese Zeilen ablehnen.',
    view: 'Ansicht',
    viewTop: 'Draufsicht',
    viewSide: 'Seite',
    viewUnwrapped: 'Abwicklung',
    rotaryDiameter: 'Rotary-Ø',
    fit: 'Einpassen',
    loadError: 'Datei konnte nicht gelesen werden: {reason}',
    locked:
      'Ein Job ist unterwegs: das Programm auf dem Tisch bleibt, wie es ist. Nach dem Job – oder wenn er in Fräsen beendet wird – lässt es sich ändern.',
    issueToolChange:
      'Werkzeugwechsel auf T{tool}: FluidNC selbst hält bei M6 nicht an. Aus der App gestartet hält der Job hier; für die SD-Karte wird er pro Werkzeug geteilt.',
    issueOptionalStop: 'M1 (optionaler Halt) ignoriert FluidNC – die Maschine hält hier nicht.',
    issuesFound: '{count} gefährliche Stelle(n) für FluidNC – so nicht starten.',
    workspace: 'Verfahrweg-Prüfung',
    workspaceOffline: 'Erst verbinden – die Lage des Nullpunkts ist sonst unbekannt.',
    workspaceOk: 'Der Job liegt vollständig im Verfahrweg.',
    workspaceViolation: '{axis} {side} um {mm} mm überschritten (ab Zeile {line})',
    sideMin: 'unter min',
    sideMax: 'über max',
    follow: 'Folgen',
    rapids: 'Eilgänge',
    resetProgress: 'Fortschritt zurücksetzen',
    progress: 'Fortschritt',
    legendRapid: 'Eilgang',
    legendAir: 'über Z0',
    legendCut: 'im Material',
    legendDone: 'gefahren',
    legendCurrent: 'aktuell',
    trackingLive: 'Live (Maschine)',
  },
  ack: {
    none: 'Noch kein Befehl an die Steuerung gesendet.',
    busy: 'Läuft …',
    ok: 'Erledigt',
    failed: 'Nicht möglich',
    sent: 'Gesendet, wartet auf die Steuerung:',
    answerOk: 'Steuerung meldet ok:',
    answerNone: 'Keine Antwort der Steuerung auf',
    answerError: 'Steuerung meldet error:{code} ({text}) auf',
    saved: 'Gespeichert',
  },
  limits: {
    title: 'Grenzen der Steuerung (FluidNC)',
    intro:
      'So schnell darf jede Achse höchstens fahren und so kräftig beschleunigen. FluidNC begrenzt jede Bewegung darauf – auch das Tippen der App. Die Werte stehen in der config.yaml der Steuerung.',
    notRead: 'Noch nicht von der Steuerung gelesen.',
    read: 'Von der Steuerung lesen',
    reading: 'Lese die Grenzen der Steuerung …',
    maxRate: 'Höchstgeschwindigkeit (mm/min)',
    acceleration: 'Beschleunigung (mm/s²)',
    field: '{axis} {item}',
    before: 'bisher {value}',
    items: {
      maxRate: 'Höchstgeschwindigkeit',
      acceleration: 'Beschleunigung',
    },
    problem: {
      invalid: '{axis} {item}: bitte eine Zahl eintragen.',
      low: '{axis} {item}: mindestens {min}.',
      high: '{axis} {item}: höchstens {max}.',
    },
    raised:
      'Schneller fahren oder kräftiger beschleunigen kann Schritte verlieren lassen: Die Maschine steht dann woanders, als die Steuerung glaubt. In kleinen Schritten erhöhen – etwa 20 % auf einmal – und nach jeder Änderung die Wiederholprobe machen (Service & Diagnose → Kalibrieren).',
    bigStep:
      '{axis} {item}: +{percent} % auf einmal – empfohlen sind höchstens 20 % (z. B. {next}).',
    keep: 'Auch in der config.yaml speichern – gilt dann auch nach einem Neustart',
    keepHint:
      'Vorher wird die alte Datei als {backup} daneben gesichert. Geändert werden nur diese Werte; alles andere in der Datei bleibt, wie es ist.',
    keepNotPossible:
      'Dauerhaft speichern geht nur, wenn die App über den Pi (Companion) verbunden ist: Nur er kann die config.yaml unverändert lesen. So gelten die Werte bis zum nächsten Neustart der Steuerung.',
    write: 'In die Steuerung schreiben',
    writing: 'Schreibe in die Steuerung und lese zurück …',
    reason: {
      noChange: 'Es ist nichts geändert.',
      problems: 'Erst die markierten Werte korrigieren.',
      notRead: 'Erst die Grenzen von der Steuerung lesen.',
    },
    resultTitle: 'Geschrieben',
    resultLine: '{axis} {item}: {from} → {to} – FluidNC meldet {read}',
    resultMissing: '{axis} {item}: FluidNC meldet keinen Wert zurück',
    saved: {
      saved: 'Gespeichert in {file} (Sicherung: {backup}) – gilt auch nach einem Neustart.',
      runtime:
        'Gilt bis zum nächsten Neustart der Steuerung – nicht in der config.yaml gespeichert.',
      notPossible:
        'Gilt bis zum nächsten Neustart der Steuerung: Die config.yaml ließ sich nicht unverändert lesen (geht nur über den Pi).',
      failed:
        'Gilt bis zum nächsten Neustart der Steuerung: Das Speichern in der config.yaml wurde nicht bestätigt. Die bisherige Datei liegt als Sicherung daneben.',
    },
    restart:
      'Ein Neustart ist nicht nötig: Die Werte gelten sofort. Startet die Steuerung neu, liest sie die config.yaml – der WLAN-Router muss dann schon laufen.',
    readFailed: 'Die Grenzen ließen sich nicht von der Steuerung lesen.',
    notIdle: 'Grenzen nur schreiben, wenn die Maschine steht und kein Alarm ansteht.',
    refused: 'Die Steuerung hat den Wert {item} abgelehnt.',
    unconfirmed: 'Die Steuerung meldet nicht den geschriebenen Wert zurück – bitte erneut lesen.',
    writtenSaved: 'Grenzen geschrieben und in der config.yaml gespeichert.',
    writtenRuntime: 'Grenzen geschrieben – gelten bis zum nächsten Neustart der Steuerung.',
  },
  link: {
    pi: 'Pi nicht erreichbar ({via})',
    relay: 'Pi erreicht den Jackpot nicht ({target})',
    direct: 'Jackpot nicht erreichbar ({target})',
    explain: {
      pi: 'Dieses Gerät erreicht den Raspberry Pi unter {via} nicht. Ist der Pi eingeschaltet und im selben WLAN?',
      relay:
        'Der Pi ({via}) antwortet, kommt aber nicht zum Jackpot unter {target}. Ist der Jackpot eingeschaltet und im WLAN? FluidNC wählt sich nur beim Einschalten ins WLAN ein: Lief der Router da noch nicht, den Jackpot aus- und wieder einschalten.',
      direct:
        'Unter {target} meldet sich keine FluidNC. Ist der Jackpot eingeschaltet, im WLAN und die Adresse richtig? FluidNC wählt sich nur beim Einschalten ins WLAN ein – lief der Router da noch nicht, den Jackpot neu starten.',
    },
    connecting: 'Verbinde mit {target} … wartet auf eine Antwort von FluidNC.',
    connectingVia:
      'Verbinde über den Pi ({via}) mit dem Jackpot ({target}) … wartet auf eine Antwort von FluidNC.',
    retryIn: 'Neuer Versuch in {seconds} s',
    retryNow: 'Jetzt versuchen',
    stop: 'Aufhören',
    stopped: 'Die App versucht es nicht mehr von selbst.',
    afterJob:
      'Die Verbindung ging während eines Jobs verloren. Bis wieder von Hand verbunden wird, versucht die App es nicht von selbst.',
    auto: 'Von selbst neu verbinden, solange kein Job läuft',
    autoHint:
      'Ein neuer Versuch fragt nur nach dem Zustand – er sendet keine Bewegung und nichts, was an der Maschine etwas ändert. Während eines Jobs verbindet die App nie von selbst.',
    route: 'Weg: dieses Gerät → Pi ({via}) → Jackpot ({target})',
    unknownTarget: 'die Adresse, die beim Pi eingetragen ist',
    viaPi: 'Über den Pi verbinden',
    other: 'Andere Verbindung',
    cancel: 'Verbinden abbrechen',
    relayed: 'Der Pi leitet zur Maschine weiter ({target}).',
  },
  machine: {
    workshop: 'Werkstatt und Benachrichtigungen',
    macros: 'Makros',
    expertMode: 'Expertenfunktionen anzeigen',
    expertHint:
      'Konfiguration, $-Einstellungen, Firmware und Konsole – für die Ersteinrichtung und Fehlersuche.',
    connection: 'Verbindung',
    screen: {
      system: 'Der Bildschirm bleibt an, solange verbunden.',
      video:
        'Der Bildschirm bleibt an, solange verbunden – über ein stilles Video, weil die Seite ohne https läuft. Geht er trotzdem aus: am iPad „Einstellungen → Anzeige & Helligkeit → Automatische Sperre → Nie“.',
      waiting: 'Der Bildschirm bleibt ab der nächsten Berührung an.',
      failed:
        'Dieser Browser kann den Bildschirm nicht anlassen. Am iPad hilft „Einstellungen → Anzeige & Helligkeit → Automatische Sperre → Nie“.',
      off: 'Der Bildschirm darf ausgehen („Bildschirm anlassen“ ist unter Einrichtung abgeschaltet).',
    },
    address: 'IP-Adresse des Jackpot',
    addressHint: 'z. B. 192.168.178.40',
    addressMissing: 'Bitte zuerst die IP-Adresse des Jackpot eingeben.',
    connect: 'Verbinden',
    disconnect: 'Trennen',
    firmware: 'Firmware',
    profile: 'Maschinenprofil',
    profilePlaceholder:
      'Platzhalterwerte – bitte Verfahrweg aus config.yaml bzw. nach Referenzfahrt eintragen.',
    travel: 'Verfahrweg',
    travelHint:
      'Maschinenkoordinaten (MPos) nach der Referenzfahrt. Jog stoppt an diesen Grenzen, Jobs werden dagegen geprüft.',
    min: 'min',
    max: 'max',
    jogFeed: 'Tippgeschwindigkeit der App',
    jogFeedHint:
      'So schnell fährt die App beim Tippen und Hinfahren – höchstens so schnell, wie die Steuerung erlaubt (Grenzen der Steuerung).',
    jogEffective: '{axis}: {set} eingestellt, fährt max. {max} mm/min',
    jogWithin: '{axis}: {set} mm/min',
    softLimits: 'Software-Endschalter beim Joggen',
    apply: 'Übernehmen',
    applied: 'Maschinenprofil gespeichert.',
    invalid: 'Ungültige Werte: min muss kleiner als max sein, Vorschub größer 0.',
    useCurrent: 'Aktuelle Position als {side}',
    configTitle: 'Steuerung (config.yaml)',
    configSource: 'Werte aus: {source}',
    configImport: 'config.yaml laden',
    configRead: 'Von der Maschine lesen ($CD)',
    configImported: 'config.yaml übernommen: Verfahrweg, Geschwindigkeiten und Beschleunigungen.',
    configInvalid: 'Die Datei enthält keine Achsen X, Y und Z – keine FluidNC-config.yaml?',
    configSoftLimitsOff:
      'soft_limits ist in der config.yaml aus: FluidNC selbst stoppt Jogs und Jobs nicht am Verfahrweg. Empfehlung: je Achse soft_limits: true.',
    configSoftLimitsOn:
      'soft_limits ist an: FluidNC begrenzt Jogs selbst und stoppt Jobs außerhalb.',
    configNoToolChange:
      'Kein M6-Makro/Werkzeugwechsler: FluidNC hält bei M6 nicht an. Jobs mit Werkzeugwechsel aufteilen.',
    configNoLineNumbers:
      'use_line_numbers ist aus: Zeilenverfolgung erfolgt geometrisch über die Position.',
    maxRate: 'Max. Geschwindigkeit',
    acceleration: 'Beschleunigung',
    log: 'Protokoll',
    console: 'Konsole (Experten)',
    send: 'Senden',
    httpsWarning:
      'Diese Seite läuft über https – Browser blockieren dann ws://-Verbindungen. Bitte über http oder als Datei öffnen.',
    connectedVia: 'Verbunden mit dem Jackpot ({target}) über den Pi ({via})',
    viewer:
      'Nur Ansicht: ein anderes Gerät steuert die Maschine. Dieses zeigt an und kann pausieren und anhalten.',
    controller: 'Dieses Gerät steuert jetzt die Maschine.',
    viewerRefused: 'Nur Ansicht: dieses Gerät sendet nichts, ein anderes steuert die Maschine.',
    connected: 'Verbunden mit {url}',
    disconnected: 'Verbindung getrennt',
  },
  units: {
    mmPerMin: 'mm/min',
    rpm: 'U/min',
    mmPerS2: 'mm/s²',
  },
  alarm: {
    title: 'Alarm {code}',
    unlock: 'Entsperren',
    HardLimit: {
      short: 'Endschalter ausgelöst',
      text: 'Ein Endschalter hat ausgelöst – die Position ist nicht mehr sicher bekannt.',
      action: 'Ursache prüfen, entsperren, von Hand freifahren und neu referenzieren.',
    },
    SoftLimit: {
      short: 'Verfahrweg überschritten',
      text: 'Der Befehl hätte den Verfahrweg verlassen und wurde nicht ausgeführt.',
      action: 'Nullpunkt und Job-Grenzen prüfen, dann entsperren.',
    },
    AbortCycle: {
      short: 'Bewegung abgebrochen',
      text: 'Die Bewegung wurde durch einen Reset abgebrochen; die Position kann verloren sein.',
      action: 'Entsperren und neu referenzieren, bevor weitergearbeitet wird.',
    },
    ProbeFailInitial: {
      short: 'Taster schon ausgelöst',
      text: 'Der Taster war schon vor dem Tasten ausgelöst.',
      action: 'Tasterkabel und Klemme prüfen, dann erneut tasten.',
    },
    ProbeFailContact: {
      short: 'Taster ohne Kontakt',
      text: 'Der Taster hat innerhalb des Suchwegs nicht ausgelöst.',
      action: 'Näher an das Werkstück fahren oder den Suchweg vergrößern.',
    },
    HomingFailReset: {
      short: 'Referenzfahrt abgebrochen',
      text: 'Die Referenzfahrt wurde durch einen Reset abgebrochen.',
      action: 'Referenzfahrt erneut starten.',
    },
    HomingFailDoor: {
      short: 'Referenzfahrt: Tür offen',
      text: 'Die Tür wurde während der Referenzfahrt geöffnet.',
      action: 'Tür schließen und Referenzfahrt erneut starten.',
    },
    HomingFailPulloff: {
      short: 'Referenzfahrt: Schalter hängt',
      text: 'Der Endschalter blieb nach dem Freifahren ausgelöst.',
      action: 'Pull-off-Weg in config.yaml vergrößern oder Schalter prüfen.',
    },
    HomingFailApproach: {
      short: 'Referenzfahrt: Schalter nicht gefunden',
      text: 'Der Endschalter wurde während der Referenzfahrt nicht gefunden.',
      action: 'Schalter und Kabel prüfen; Suchweg in config.yaml kontrollieren.',
    },
    SpindleControl: {
      short: 'Spindel reagiert nicht',
      text: 'Die Spindel hat die Solldrehzahl nicht erreicht.',
      action: 'Spindel und Ansteuerung prüfen, dann entsperren.',
    },
    StartupPin: {
      short: 'Eingang beim Start aktiv',
      text: 'Ein Steuer- oder Endschaltereingang ist beim Start aktiv.',
      action: 'Not-Aus, Endschalter und Taster prüfen; Pn: im Protokoll zeigt den Eingang.',
    },
    HomingAmbiguousSwitch: {
      short: 'Referenzfahrt: Schalter unklar',
      text: 'Bei der Referenzfahrt war nicht eindeutig, welcher Schalter ausgelöst hat.',
      action: 'Schalterverdrahtung und Pin-Zuordnung in config.yaml prüfen.',
    },
    HardStop: {
      short: 'Not-Halt',
      text: 'Die Maschine wurde hart gestoppt.',
      action: 'Ursache prüfen, entsperren und neu referenzieren.',
    },
    Unhomed: {
      short: 'nicht referenziert',
      text: 'Die Maschine ist nicht referenziert.',
      action: 'Referenzfahrt ($H) ausführen.',
    },
    Init: {
      short: 'Start der Steuerung',
      text: 'Die Steuerung konnte nicht initialisiert werden.',
      action: 'config.yaml und Meldungen im Protokoll prüfen.',
    },
    ExpanderReset: {
      short: 'Erweiterung zurückgesetzt',
      text: 'Ein I/O-Erweiterungsmodul wurde zurückgesetzt.',
      action: 'Verkabelung des Moduls prüfen, entsperren und neu referenzieren.',
    },
    GCodeError: {
      short: 'Fehler im G-Code',
      text: 'Ein Fehler im G-Code hat den laufenden Job angehalten.',
      action: 'Fehlermeldung im Protokoll lesen, Zeile im Job prüfen, dann entsperren.',
    },
    ProbeHardLimit: {
      short: 'Endschalter beim Tasten',
      text: 'Beim Tasten hat ein Endschalter ausgelöst.',
      action: 'Tastweg und Startposition prüfen, entsperren und neu referenzieren.',
    },
    Unknown: {
      short: 'unbekannte Ursache',
      text: 'Unbekannter Alarm.',
      action: 'Meldungen im Protokoll prüfen und FluidNC-Dokumentation zum Code nachschlagen.',
    },
  },
  error: {
    title: 'Fehler {code}',
    GcodeUnsupportedCommand: 'Befehl wird von FluidNC nicht unterstützt.',
    GcodeUndefinedFeedRate: 'Vorschub fehlt (F-Wort).',
    GcodeModalGroupViolation: 'Zwei Befehle derselben Gruppe in einer Zeile.',
    GcodeArcRadiusError: 'Bogen ist geometrisch nicht möglich.',
    SoftLimitError: 'Ziel liegt außerhalb des Verfahrwegs.',
    SystemGcLock: 'Steuerung ist gesperrt – erst entsperren oder referenzieren.',
    IdleError: 'Befehl nur im Zustand „Bereit“ möglich.',
    InvalidJogCommand: 'Ungültiger Jog-Befehl.',
    JogCancelled: 'Jog abgebrochen.',
    SingleAxisHoming: 'Referenzfahrt einzelner Achsen von der Steuerung abgelehnt.',
    CheckStartupPins:
      'Ein Steuereingang (Not-Halt, Reset, Vorschub halten, Zyklusstart, Tür) ist gerade aktiv: $X und $H werden abgelehnt. Welche Eingänge anliegen, steht als „Pn:“ im Statusbericht.',
    FsFailedMount:
      'Die Steuerung konnte das Dateisystem nicht einbinden. Beim Auflisten der SD-Karte heißt das: Karte fehlt, sitzt nicht richtig, ist nicht lesbar oder hat ein Format, das FluidNC nicht kennt (nur FAT32 – exFAT, wie es Karten über 32 GB meist ab Werk haben, kann es nicht).',
    FsFailedRead: 'Die Steuerung konnte eine Datei nicht lesen.',
    FsFailedOpenDir:
      'Die Steuerung konnte ein Verzeichnis nicht öffnen (SD-Karte oder Flash der Steuerung).',
    FsDirNotFound: 'Das Verzeichnis gibt es nicht (SD-Karte oder Flash der Steuerung).',
    FsFileEmpty: 'Die Datei ist leer.',
    FsFileNotFound: 'Die Datei gibt es nicht (SD-Karte oder Flash der Steuerung).',
    FsFailedOpenFile: 'Die Steuerung konnte die Datei nicht öffnen.',
    FsFailedBusy: 'Das Dateisystem ist gerade belegt: ein Job läuft oder ein anderer Zugriff.',
    FsFailedDelDir: 'Das Verzeichnis konnte nicht gelöscht werden.',
    FsFailedDelFile: 'Die Datei konnte nicht gelöscht werden.',
    FsFailedRenameFile: 'Die Datei konnte nicht umbenannt werden.',
    FsFailedCreateFile:
      'Die Datei konnte nicht angelegt werden (Speicher voll oder schreibgeschützt?).',
    FsFailedFormat: 'Das Formatieren des Dateisystems ist fehlgeschlagen.',
    NumberRange: 'Der Zahlenwert liegt außerhalb dessen, was die Einstellung annimmt.',
    InvalidValue: 'Der Wert passt nicht zur Einstellung.',
    MessageFailed: 'Eine Meldung der Steuerung konnte nicht gesendet werden.',
    NvsSetFailed: 'Die Steuerung konnte eine Einstellung nicht im Flash speichern.',
    NvsGetStatsFailed: 'Die Steuerung konnte den Zustand ihres Flash-Speichers nicht lesen.',
    AuthenticationFailed: 'Anmeldung an der Steuerung fehlgeschlagen.',
    AnotherInterfaceBusy:
      'Die Steuerung ist gerade belegt (Job, Fahrt oder eine andere Schnittstelle) und nimmt den Befehl jetzt nicht an.',
    BadPinSpecification: 'Eine Pin-Angabe in der config.yaml ist ungültig.',
    BadRuntimeConfigSetting: 'Diese Einstellung der config.yaml lässt sich so nicht ändern.',
    ConfigurationInvalid: 'Die config.yaml der Steuerung ist ungültig.',
    UploadFailed: 'Das Hochladen der Datei ist fehlgeschlagen.',
    DownloadFailed: 'Das Herunterladen der Datei ist fehlgeschlagen.',
    ReadOnlySetting: 'Diese Einstellung ist schreibgeschützt.',
    ExpressionDivideByZero: 'Division durch null in einem Ausdruck.',
    ExpressionInvalidArgument: 'Ungültiges Argument in einem Ausdruck.',
    ExpressionInvalidResult: 'Ein Ausdruck hat ein ungültiges Ergebnis.',
    ExpressionUnknownOp: 'Unbekannter Operator in einem Ausdruck.',
    ExpressionArgumentOutOfRange: 'Ein Argument liegt außerhalb des erlaubten Bereichs.',
    ExpressionSyntaxError: 'Syntaxfehler in einem Ausdruck.',
    FlowControlSyntaxError: 'Syntaxfehler in einer Ablaufsteuerung (IF, WHILE …).',
    FlowControlNotExecutingMacro: 'Ablaufsteuerung außerhalb eines Makros.',
    FlowControlOutOfMemory: 'Ablaufsteuerung: der Speicher reicht nicht.',
    FlowControlStackOverflow: 'Ablaufsteuerung: zu tief verschachtelt.',
    ParameterAssignmentFailed: 'Ein Parameter konnte nicht gesetzt werden.',
    GcodeValueWordInvalid: 'Ungültiger Wert hinter einem Buchstaben der Zeile.',
    GcodeNoSavedModalState: 'Es ist kein Zustand gespeichert, der wiederhergestellt werden könnte.',
    Unknown: 'Die Steuerung hat die Zeile abgelehnt.',
  },
  diagnostic: {
    'unexpected-character': 'Unerwartetes Zeichen',
    'unclosed-comment': 'Kommentar ohne schließende Klammer',
    'unsupported-expression': 'Ausdrücke und Parameter (# oder [ ]) werden nicht unterstützt',
    'misplaced-line-number': 'N-Wort muss am Zeilenanfang stehen',
    'duplicate-word': 'Wort doppelt in der Zeile',
    'unsupported-word': 'Wort wird nicht unterstützt',
    'unsupported-axis': 'Achse ist an dieser Maschine nicht vorhanden',
    'unsupported-gcode': 'G-Befehl wird nicht unterstützt',
    'tool-length-table':
      'G43 mit H-Wort (Werkzeugtabelle) lehnt FluidNC ab – Postprozessor ohne Längenkorrektur verwenden',
    'unsupported-mcode': 'M-Befehl wird nicht unterstützt',
    'modal-group-conflict': 'Zwei Befehle derselben Gruppe in einer Zeile',
    'axis-words-without-motion': 'Koordinaten ohne aktive Bewegungsart (nach G80)',
    'missing-axis-words': 'Achsangabe fehlt',
    'missing-feed-rate': 'Vorschub fehlt',
    'arc-missing-offsets': 'Bogen ohne I/J/K oder R',
    'arc-radius-too-small': 'Bogenradius kleiner als halbe Sehne',
    'arc-radius-mismatch': 'Endpunkt liegt nicht auf dem Bogen',
    'arc-full-circle-radius': 'Vollkreis kann nicht mit R programmiert werden',
    'arc-offset-in-wrong-plane': 'Bogen-Offset passt nicht zur Ebene',
    'invalid-value': 'Ungültiger Wert',
    'unknown-position': 'Ziel hängt von gespeicherter/getasteter Position ab – Vorschau ungenau',
    'transform-unsupported': 'Zeile kann nicht transformiert werden',
    'transform-assumed-position': 'Startposition unbekannt, 0 angenommen',
  },
  probe: {
    title: 'Z antasten',
    step1: 'Tastplatte unter den Fräser legen und Klemme am Fräser anbringen.',
    step2: 'Kontakt prüfen: Platte kurz an den Fräser halten – die Anzeige muss umschalten.',
    contact: 'Taster',
    contactOpen: 'offen',
    contactClosed: 'Kontakt',
    plate: 'Plattendicke',
    maxTravel: 'Suchweg',
    feed: 'Antastvorschub',
    retract: 'Rückzug',
    plateHint: 'Plattendicke messen! Jeder Fehler hier geht direkt in die Frästiefe.',
    start: 'Antasten starten',
    done: 'Z angetastet: Oberfläche unter der Platte ist jetzt Z0 (Platte {mm} mm).',
    failed: 'Antasten fehlgeschlagen – Klemme, Platte und Suchweg prüfen, ggf. entsperren.',
    removePlate: 'Platte und Klemme entfernen, bevor der Job startet!',
    save: 'Werte merken',
    saved: 'Antastwerte gespeichert.',
    result: 'Z-Nullpunkt liegt jetzt bei {z} mm (Maschine): {mm} mm gegenüber bisher.',
    discard: 'Verwerfen: zurück zum bisherigen Z-Nullpunkt',
    undone: 'Verworfen – der Z-Nullpunkt ist wieder wie vorher.',
  },
  files: {
    title: 'Auf die Maschine',
    repaired: '{count} Zeile(n) mit „G43 … H“ bereinigt – FluidNC kennt keine Werkzeugtabelle.',
    split:
      'Werkzeugwechsel: in {count} Teile getrennt. Nach jedem Teil Werkzeug wechseln und Z neu antasten.',
    ready: 'Für FluidNC bereit, keine Änderung nötig.',
    part: 'Teil {n}',
    tool: 'T{tool}',
    partInfo: '{lines} Zeilen · ca. {time}',
    download: 'Herunterladen',
    upload: 'Auf SD laden',
    uploading: 'Lade hoch …',
    uploaded: '{name} liegt auf der SD-Karte.',
    uploadUnverified:
      '{name}: Upload nicht bestätigt – Datei fehlt auf der SD-Karte oder die Größe stimmt nicht.',
    uploadFailed: '{name}: Upload fehlgeschlagen – Verbindung zum Jackpot prüfen.',
    sd: 'SD-Karte',
    refresh: 'Aktualisieren',
    empty: 'Keine Dateien auf der SD-Karte.',
    listFailed: 'SD-Karte konnte nicht gelesen werden.',
    start: 'Starten',
    unchecked: 'Diese Datei wurde nicht in der App geprüft.',
    notHomed: 'Maschine nicht referenziert.',
    blocked: 'Start gesperrt: Der Job hat Fehler oder verlässt den Verfahrweg.',
    started: 'Job {name} gestartet.',
    finished: 'Job {name} fertig.',
    ended: 'Job {name} beendet: {reason}',
    stopped: 'Job angehalten und Steuerung zurückgesetzt. Position bleibt erhalten.',
    running: 'Läuft: {name}',
    progress: 'Fortschritt',
    elapsed: 'Laufzeit',
    pause: 'Pause',
    resume: 'Fortsetzen',
  },
  overrides: {
    title: 'Override',
    feed: 'Vorschub',
    spindle: 'Spindel',
    rapid: 'Eilgang',
    less: '{label} 10 % weniger',
    more: '{label} 10 % mehr',
    reset: '{label} zurück auf 100 %',
  },
  macros: {
    title: 'Makros',
    running: 'Makro „{name}“ …',
    failed: 'Makro „{name}“ abgebrochen bei: {line}',
    edit: 'Makros bearbeiten',
    name: 'Name',
    gcode: 'G-Code (ein Befehl pro Zeile)',
    add: 'Makro hinzufügen',
    remove: 'Entfernen',
    save: 'Speichern',
    saved: 'Makros gespeichert.',
    empty: 'Keine Makros. Unter Maschine → Makros anlegen.',
  },
  config: {
    title: 'config.yaml ändern',
    intro:
      'Die wichtigsten Einstellungen. Vor dem Schreiben legt die App eine Sicherung der laufenden Konfiguration auf der Maschine ab.',
    load: 'Von der Maschine lesen',
    download: 'Original herunterladen',
    commentsLost:
      'FluidNC schreibt die Datei neu – Kommentare der Originaldatei gehen verloren. Deshalb vorher das Original herunterladen.',
    softLimits: 'soft_limits für X, Y, Z (FluidNC stoppt am Verfahrweg)',
    maxTravel: 'max_travel_mm {axis}',
    lineNumbers: 'use_line_numbers (Zeilennummer im Status)',
    mustHome: 'must_home (vor jeder Bewegung referenzieren)',
    changes: '{count} Änderung(en)',
    none: 'Keine Änderung.',
    apply: 'Sichern und schreiben',
    applied: '{count} Einstellung(en) geschrieben, Sicherung: {backup}.',
    failed: 'Konfiguration nicht geändert: {reason}',
    restart: 'Neustart ($Bye)',
    view: 'Datei ansehen',
    notLoaded: 'Erst von der Maschine lesen.',
    backupUnverified: 'Sicherung konnte nicht geprüft werden – nichts geschrieben.',
    uploadUnverified:
      'Neue Datei stimmt nach dem Hochladen nicht – Sicherung liegt auf der Maschine.',
    uploaded: '{name} geschrieben, Sicherung: {backup}. Neustart übernimmt die Änderung.',
  },
  configFile: {
    title: 'config.yaml komplett bearbeiten (Experten)',
    intro:
      'Die ganze Datei mit Kommentaren. Vor dem Schreiben wird geprüft und das Original als Sicherung auf der Maschine abgelegt.',
    file: 'Datei: {name}',
    valid: 'Keine Probleme gefunden.',
    diff: 'Änderungen gegenüber der Maschine',
    upload: 'Sichern und hochladen',
    blocked: 'Fehler beheben – mit dieser Datei würde FluidNC nicht starten.',
    restartHint: 'FluidNC liest die Datei beim Neustart. Danach neu verbinden und referenzieren.',
    issue: {
      tab: 'Tabulator – YAML erlaubt nur Leerzeichen',
      indent: 'Ungerade Einrückung – üblich sind 2 Leerzeichen je Ebene',
      duplicate: '„{detail}“ doppelt auf derselben Ebene',
      syntax: 'Zeile ohne „Name: Wert“: {detail}',
      'missing-axis': 'Achse {detail} fehlt',
      'not-number': '{detail} ist keine Zahl',
      'not-positive': '{detail} muss größer als 0 sein',
      'no-board': 'Kein „board:“-Eintrag',
    },
  },
  settingsBrowser: {
    title: '$-Einstellungen',
    intro: 'Einstellungen außerhalb der config.yaml (Netzwerk, Meldungen) mit Erklärung.',
    load: 'Von der Maschine lesen ($S)',
    filter: 'Suchen',
    value: 'Wert',
    risky:
      'Achtung: Diese Einstellung kann die WLAN-Verbindung trennen. Danach ggf. per USB zurücksetzen.',
    write: 'Setzen',
  },
  settingsHelp: {
    unknown: 'Keine Erklärung hinterlegt – siehe FluidNC-Wiki.',
    Hostname: 'Name im Netzwerk (z. B. fluidnc.local).',
    WiFi_Mode:
      'WLAN-Betrieb: STA (Heimnetz), AP (eigenes Netz), STA>AP (Heimnetz, sonst eigenes) oder Off.',
    Sta_SSID: 'Name des Heim-WLANs.',
    Sta_Password: 'Passwort des Heim-WLANs (wird nicht angezeigt).',
    Sta_IPMode: 'DHCP (automatisch) oder Static (feste Adresse).',
    Sta_IP: 'Feste IP-Adresse im Heimnetz (nur bei Static).',
    Sta_Gateway: 'Router-Adresse (nur bei Static).',
    Sta_Netmask: 'Netzmaske (nur bei Static), meist 255.255.255.0.',
    Sta_MinSecurity: 'Mindest-Verschlüsselung des Heim-WLANs.',
    AP_SSID: 'Name des eigenen WLANs des Jackpot.',
    AP_Password: 'Passwort des eigenen WLANs.',
    AP_IP: 'Adresse des Jackpot im eigenen WLAN (Standard 192.168.0.1).',
    AP_Channel: 'Funkkanal des eigenen WLANs.',
    AP_Country: 'Ländercode für erlaubte Funkkanäle.',
    HTTP_Enable: 'Weboberfläche und Datei-Upload ein/aus.',
    HTTP_Port: 'Port der Weboberfläche (Standard 80).',
    HTTP_BlockDuringMotion:
      'Weboberfläche während Bewegung sperren (schont die Bewegungssteuerung).',
    Telnet_Enable: 'Telnet-Zugang ein/aus.',
    Telnet_Port: 'Port für Telnet (Standard 23).',
    Notification_Type: 'Benachrichtigungsdienst der Steuerung (Pushover, E-Mail, Line).',
    Notification_T1: 'Zugangsdaten 1 für den Benachrichtigungsdienst.',
    Notification_T2: 'Zugangsdaten 2 für den Benachrichtigungsdienst.',
    Notification_TS: 'Server-Einstellung für den Benachrichtigungsdienst.',
    Config_Filename: 'Name der Konfigurationsdatei, die beim Start gelesen wird.',
    Message_Level: 'Wie viele Meldungen die Steuerung sendet (Error … Debug).',
    Report_Status: 'Inhalt der Statusmeldung (Grbl $10).',
    Report_Interval: 'Automatische Statusmeldungen in ms (0 = nur auf Anfrage).',
    Start_Message: 'Text, der beim Start gemeldet wird.',
    GCode_Echo: 'Jede empfangene Zeile zurücksenden (nur zur Fehlersuche).',
    SD_FallbackCS: 'Ersatz-Pin für die SD-Karte.',
    Firmware_Build: 'Kennung der Firmware (nur lesen).',
    Bluetooth_Name: 'Name für Bluetooth.',
  },
  firmware: {
    title: 'Firmware flashen (USB)',
    intro:
      'Aktualisiert FluidNC über das USB-Kabel aus dem Browser (Chrome/Edge). Die Konfiguration (config.yaml) bleibt erhalten.',
    unsupported:
      'Dieser Browser kann nicht über USB flashen. Chrome oder Edge am Rechner verwenden.',
    step1: 'Konfiguration sichern:',
    step2:
      'Release-ZIP von FluidNC laden (posix oder win64 – der Inhalt ist gleich) und hier auswählen.',
    step3: 'Jackpot per USB verbinden, Flashen halten und den Port wählen.',
    backup: 'config.yaml herunterladen',
    backedUp: '{name} gesichert.',
    chooseZip: 'Release-ZIP wählen',
    releases: 'Releases anzeigen',
    releasesFailed: 'Releases konnten nicht geladen werden (Internet?).',
    download: '{name} herunterladen',
    variant: 'Funk-Variante',
    variants: {
      wifi: 'WLAN',
      bt: 'Bluetooth',
      noradio: 'ohne Funk',
    },
    notZip: 'keine ZIP-Datei',
    missing: 'Im ZIP fehlt: {files}',
    configSafe: 'littlefs (config.yaml) wird nicht überschrieben.',
    flash: 'Flashen',
    flashing: 'Flasht …',
    progress: 'Fortschritt',
    chip: 'Chip: {chip}',
    done: 'Fertig – der Jackpot startet neu.',
    flashed: 'Firmware {version} geflasht.',
    failed: 'Flashen fehlgeschlagen',
  },
  tools: {
    probe: 'Das ist ein Messtaster (darf nie drehen: sperrt den Spindelstart)',
    probeShort: 'Messtaster',
    title: 'Werkzeugbibliothek',
    name: 'Name',
    edit: 'Ändern',
    add: 'Werkzeug hinzufügen',
    kind: 'Art',
    kinds: {
      flat: 'Schaftfräser',
      ball: 'Kugelfräser',
      vbit: 'V-Nut',
      drill: 'Bohrer',
      chamfer: 'Fase',
    },
    flutesShort: '{n} Schneiden',
    fields: {
      number: 'T-Nummer',
      name: 'Name',
      diameter: 'Durchmesser (mm)',
      flutes: 'Schneiden',
      angle: 'Winkel (°, V-Nut/Fase)',
      fluteLength: 'Schneidenlänge (mm)',
      stickout: 'Auskraglänge (mm)',
      holder: 'Halter / Spannzange',
      holderDiameter: 'Halter-Ø (mm)',
      notes: 'Notiz',
      cutRpm: 'Drehzahl (U/min)',
      cutFeed: 'Vorschub (mm/min)',
      cutPlunge: 'Eintauchvorschub (mm/min)',
      cutStepdown: 'Zustellung (mm)',
      cutStepover: 'Bahnabstand (Anteil vom Ø, 0–1)',
    },
    cuttingTitle: 'Eigene Schnittwerte (optional)',
    cuttingHint:
      'Was hier steht, ersetzt den Vorschlag aus Material und Lernen – auch ganz ohne Material. Leer lassen, was das Material bestimmen soll.',
    photo: 'Foto',
    invalid:
      'Bitte Name, T-Nummer und positive Maße eintragen (Winkel bei V-Nut/Fase); Schnittwerte nur als positive Zahlen, der Bahnabstand von 0 bis 1.',
    save: 'Speichern',
    saved: 'Werkzeug „{name}“ gespeichert.',
    cancel: 'Abbrechen',
    remove: 'Löschen',
  },
  materials: {
    title: 'Materialbibliothek',
    name: 'Material',
    add: 'Material hinzufügen',
    group: 'Gruppe',
    groups: {
      wood: 'Holz',
      board: 'Platte',
      plastic: 'Kunststoff',
      metal: 'Metall',
    },
    fields: {
      vc: 'Schnittgeschw. vc (m/min)',
      fz6: 'Zahnvorschub fz bei Ø6 (mm)',
      depthFactor: 'Zustellung (× Ø)',
      stepoverFactor: 'Bahnabstand (× Ø)',
      plungeFactor: 'Eintauchen (× Vorschub)',
    },
    notes: 'Notiz',
    invalid: 'Bitte Name und positive Werte eintragen (Faktoren höchstens 1).',
  },
  cutting: {
    title: 'Schnittwerte',
    tool: 'Werkzeug',
    material: 'Material',
    rpm: 'Drehzahl (1/min)',
    feed: 'Vorschub (mm/min)',
    plunge: 'Eintauchen',
    depth: 'Zustellung',
    stepover: 'Bahnabstand',
    chipLoad: 'Zahnvorschub',
    limits: {
      'rpm-low': 'Die Spindel erreicht die ideale Drehzahl nicht – Vorschub entsprechend kleiner.',
      'rpm-high': 'Kleinste Spindeldrehzahl liegt über dem Ideal – auf Hitze und Späne achten.',
      'feed-machine': 'Vorschub durch die Maschine begrenzt (Einstellungen → max. Vorschub).',
    },
    learned: 'Aus {jobs} Job(s) gelernt: Vorschub {factor} % des Tabellenwerts.',
    notLearned: 'Noch nicht gelernt – Startwerte aus der Tabelle.',
    resetLearning: 'Gelerntes zurücksetzen',
  },
  share: {
    title: 'Profil teilen',
    intro: 'Maschinenprofil, {tools} Werkzeuge, {materials} Materialien und Makros als JSON-Datei.',
    export: 'Exportieren',
    import: 'Importieren',
    builtIn: 'Mitgeliefertes Profil laden: {name}',
    error: 'Profil nicht übernommen: {reason}',
    errors: {
      'invalid-json': 'keine gültige JSON-Datei',
      'wrong-format': 'kein LowRider-Control-Profil',
      'newer-version': 'mit einer neueren Version erstellt',
      'missing-name': 'Name fehlt',
      'invalid-machine': 'Maschinenwerte ungültig',
      'invalid-tool': 'ein Werkzeug ist ungültig',
      'invalid-material': 'ein Material ist ungültig',
      'invalid-macro': 'ein Makro ist ungültig',
    },
    imported: 'Profil „{name}“ übernommen ({tools} Werkzeuge, {materials} Materialien).',
  },
  workshop: {
    title: 'Werkstatt-Einstellungen',
    spindle: 'Spindel',
    rpmMin: 'Drehzahl min (1/min)',
    rpmMax: 'Drehzahl max (1/min)',
    maxFeed: 'Max. Fräsvorschub (mm/min)',
    heights: 'Sichere Höhe',
    safeZ: 'Sichere Höhe Z (Maschine, leer = automatisch)',
    safeZHint: 'Automatisch: Z {z} (2 mm unter dem oberen Ende).',
    toolChange: 'Werkzeugwechsel-Position (Maschine)',
    changeX: 'X',
    changeY: 'Y',
    here: 'Aktuelle Position',
    noChangePosition: 'Keine (an Ort und Stelle)',
    saved: 'Werkstatt-Einstellungen gespeichert.',
    language: 'Sprache',
    languages: {
      de: 'Deutsch',
      en: 'English',
    },
    keepAwake: 'Bildschirm anlassen, solange verbunden',
  },
  assistant: {
    namedTools: 'Laut Datei ({source}): {list}',
    steps: {
      material: 'Material',
    },
    materialQuestion: 'Woraus wird gefräst?',
    stock: 'Rohteil',
    stockEntered: 'Eingetragen:',
    stockFromJob: 'Aus dem Job abgeleitet:',
    size: {
      x: 'Länge X (mm)',
      y: 'Breite Y (mm)',
      z: 'Dicke Z (mm)',
    },
    useSize: 'Maße übernehmen (Nullpunkt vorne links oben)',
    sizeFromJob: 'Aus dem Job',
    toolFor: 'T{n} im Job',
    toolSingle: 'Werkzeug',
    suggestion: 'Vorschlag: {rpm} 1/min, {feed} mm/min, Zustellung {depth} mm.',
    chooseMaterialFirst: 'Für einen Vorschlag erst das Material wählen.',
    feedHigh:
      'Der Job fährt bis zu {percent} % schneller als vorgeschlagen – Override bereithalten.',
  },
  goto: {
    camera: 'Kamera hierhin',
    tool: 'Fräser hierhin',
    lift: 'Vorher auf sichere Höhe anheben',
    liftNeedsHoming: 'Nicht referenziert: fährt relativ, ohne Anheben',
    limited: 'Ziel außerhalb des Verfahrwegs – fährt nur bis zur Grenze.',
    moving: 'Fahre zu X {x}, Y {y} (Maschine).',
  },
  stick: {
    label: 'Joystick',
    hint: 'Ziehen zum Fahren – je weiter, desto schneller. Loslassen stoppt sofort.',
  },
  camera: {
    setupTitle: 'Kamera einrichten',
    title: 'Kamera',
    source: 'Bildquelle',
    sources: {
      device: 'Gerätekamera',
      stream: 'Companion-Stream',
      sim: 'Simulator-Kamera',
    },
    setupNeeded:
      'Die Kamera ist noch nicht eingerichtet. Einmal Maßstab und Versatz messen – danach treffen Fadenkreuz, Antippen und Fotokarte.',
    focusShort: 'Kamerahöhe Z {z}',
    change: 'ändern',
    which: 'Kamera',
    insecure:
      'Kamera nur über http://localhost, als Datei oder https nutzbar – sonst den Companion-Stream verwenden.',
    error: 'Kamera nicht verfügbar: {reason}',
    modes: {
      scale: 'Maßstab',
      offset: 'Versatz',
    },
    hints: {
      scale:
        'Ein Merkmal antippen, X um 10 mm joggen, dasselbe Merkmal erneut antippen. Auf einem Punktraster mit 10 mm Abstand sieht das Bild danach gleich aus und man tippt leicht den Nachbarpunkt: ein Merkmal nehmen, das es nur einmal gibt (Ecke der Platte, Aufkleber, Kratzer).',
      offset:
        'Mit dem Fräser eine kleine Markierung setzen, „Position merken“, dann Kamera darüber fahren und die Markierung antippen.',
    },
    useAngle: 'Winkel zum Ausrichten übernehmen',
    angleKept: 'Kantenwinkel {angle}° gemerkt – im Job unter „Ausrichten“.',
    jog10: 'X +10 mm joggen',
    markHere: 'Position der Markierung merken',
    marked: 'Markierung gemerkt ✓',
    markKept: 'Position der Markierung gemerkt.',
    scaled: 'Kamera kalibriert: {px} px/mm, gedreht {angle}°.',
    scaleFailed: 'Kalibrieren fehlgeschlagen: Merkmal hat sich nicht bewegt.',
    holesTitle: 'Bohrung als Nullpunkt',
    holesHint:
      'Kamera grob über eine Bohrung fahren: Die App zentriert sie selbst und setzt dort den Nullpunkt X/Y. Die Bohrung muss ganz im Bild sein.',
    holeSeen: 'Erkannt: Ø {d} mm, {off} mm neben dem Fadenkreuz',
    holeNotSeen: 'Keine Bohrung erkannt.',
    lightMarker: 'Helle Bohrung auf dunklem Material',
    zeroOnHole: 'Bohrung zentrieren → Nullpunkt X/Y',
    twoHoles: 'Zwei Bohrungen: Nullpunkt und Drehung',
    twoHolesHint:
      'Lage der beiden Bohrungen im Job eintragen, dann jede zentrieren. Bohrung 1 legt den Nullpunkt fest, Bohrung 2 den Winkel; der Job wird passend gedreht.',
    holeX: 'Bohrung {label} im Job X (mm)',
    holeY: 'Bohrung {label} im Job Y (mm)',
    findHole: 'Bohrung {n} zentrieren',
    holeAt: 'Gefunden bei X {x}, Y {y} (Maschine)',
    holeOpen: 'Noch nicht gemessen.',
    holeFound: 'Bohrung {n} gefunden: X {x}, Y {y}.',
    holesResult:
      'Werkstück liegt {angle}° gedreht; Abstand der Bohrungen {error} mm anders als im Job.',
    holesOff:
      'Abstand der Bohrungen {error} mm anders als im Job – falsche Bohrung oder falsche Lage eingetragen.',
    holesMismatch: 'Bohrungen passen nicht zum Job – Lage im Job prüfen.',
    applyTwoHoles: 'Nullpunkt und Drehung übernehmen',
    holesApplied: 'Nullpunkt an Bohrung 1 gesetzt, Job um {angle}° gedreht.',
    findMarkHint:
      'Fräser hochfahren, Kamera grob über die Markierung fahren – die App findet sie selbst.',
    findMark: 'Markierung automatisch finden',
    offsetSet: 'Kamera-Versatz: X {x}, Y {y} mm.',
    calibration: 'Kalibrierung: {px} px/mm, {angle}°, Versatz X {x} Y {y} mm',
    streamUrl: 'Stream-Adresse (MJPEG) am Companion',
    timelapse: 'Zeitraffer',
    timelapseOn: 'Zeitraffer bei jedem Job aufnehmen',
    interval: 'Bild alle … Sekunden',
    recording: 'Zeitraffer läuft …',
    timelapseDone: 'Zeitraffer mit {frames} Bildern erstellt.',
    alignJob: 'Job danach ausrichten',
    aligned: 'Job um {angle}° gedreht.',
    streamFailed: 'Stream nicht erreichbar – Adresse prüfen.',
    calibrationTitle: 'Kalibrieren',
    focusTitle: 'Kamerahöhe',
    focusUnknown: 'Noch nicht kalibriert – Maßstab kalibrieren legt die Höhe fest.',
    focusAt: 'Maßstab gilt bei Z {z} über dem Nullpunkt (Z0 auf der Werkstückoberfläche).',
    toFocus: 'Auf Kamerahöhe fahren',
    focusHere: 'Aktuelle Höhe übernehmen',
    focusOff: 'Nicht auf Kamerahöhe ({mm} mm daneben) – angetippte Punkte am Bildrand ungenau.',
  },
  align: {
    title: 'Ausrichten (Drehen/Verschieben)',
    hint: 'Liegt das Werkstück schief, wird der Job im G-Code gedreht und verschoben – FluidNC kennt kein G68.',
    useMeasured: 'Kamera-Winkel {angle}° übernehmen',
    rotation: 'Drehung (°, gegen Uhrzeigersinn)',
    dx: 'Verschieben X (mm)',
    dy: 'Verschieben Y (mm)',
    pivot: 'Drehpunkt',
    pivots: {
      zero: 'Nullpunkt',
      center: 'Job-Mitte',
    },
    diagnostics: '{count} Hinweis(e) beim Umrechnen.',
    apply: 'Ausgerichteten Job laden',
    restore: 'Original wiederherstellen ({name})',
    summary: 'Gedreht {angle}°, verschoben X {x} Y {y} mm',
  },
  autolevel: {
    title: 'Autolevel (Höhenraster)',
    hint: 'Für V-Carve auf welligen Platten: tastet ein Raster über dem Job ab und führt jede Bahn der Oberfläche nach. Klemme an den Fräser, Oberfläche leitend (Folie) oder Taster.',
    cols: 'Punkte in X',
    rows: 'Punkte in Y',
    margin: 'Rand (mm)',
    clearance: 'Sicherheitshöhe Z (mm)',
    depth: 'Suchweg unter Z0 (mm)',
    points: '{count} Punkte über {w} × {h} mm',
    start: 'Raster tasten',
    measured: 'Höhenraster gemessen: Unterschied {range} mm.',
    range: 'Höchster − tiefster Punkt: {range} mm',
    apply: 'Auf den Job anwenden',
    applied: 'Job an das Höhenraster angepasst ({warnings} Hinweise).',
  },
  sensors: {
    load: 'Spindellast',
    chatter: 'Rattern erkannt ({hz} Hz) – Vorschub oder Zustellung verringern.',
    adaptive: 'Vorschub nach Last regeln (Ziel {target} %, max. {max} %)',
    adaptiveTitle: 'Adaptiver Vorschub',
    connected: 'Sensordaten vom Companion empfangen.',
    notConnected: 'Keine Sensordaten – Companion mit Spindellast/Beschleunigungssensor nötig.',
    target: 'Ziel-Last (%)',
    maxOverride: 'Höchster Override (%)',
  },
  notify: {
    title: 'Benachrichtigungen',
    browser: 'Im Browser benachrichtigen (Tablet/Handy)',
    companion: 'Über den Companion ans Handy (ntfy)',
    ntfyUrl: 'ntfy-Thema (Adresse)',
    saveNtfy: 'Im Companion speichern',
    saved: 'Benachrichtigung im Companion eingerichtet.',
    test: 'Testnachricht senden',
    testTitle: 'LowRider Control',
    testText: 'Testnachricht – Benachrichtigungen funktionieren.',
    doneTitle: 'Job fertig',
    done: '{name} ist fertig ({time}).',
    failedTitle: 'Job abgebrochen',
    failed: '{name} wurde nicht fertig.',
    toolChange: 'Werkzeugwechsel auf T{tool} – die Maschine wartet.',
  },
  fixtures: {
    title: 'Spannmittel',
    hint: 'Zwingen und Schrauben, die dem Fräser im Weg sein können. Sie bleiben auf dem Tisch, wo sie sind – auch wenn der Nullpunkt wandert.',
    kinds: {
      clamp: 'Zwinge',
      screw: 'Schraube',
    },
    mark: 'Auf dem Tisch antippen',
    edit: 'Maße',
    save: 'Maße übernehmen',
    entry: 'X {x1}…{x2} · Y {y1}…{y2} · Höhe {h} mm',
    entryRound: 'Ø {d} mm bei X {x} · Y {y} · Höhe {h} mm',
    fromWorkZero: 'X und Y zählen ab dem Nullpunkt, die Höhe ab Z0 (Werkstück-Oberfläche).',
    fromMachineZero: 'Nicht verbunden: X und Y zählen ab dem Maschinen-Nullpunkt, die Höhe ab Z0.',
    name: 'Name',
    x1: 'X von',
    x2: 'X bis',
    y1: 'Y von',
    y2: 'Y bis',
    height: 'Oberkante Z',
    add: 'Spannmittel hinzufügen',
    manual: 'Maße von Hand',
    none: 'Noch keine Spannmittel eingetragen.',
  },
  view3d: {
    removed: 'Abgetragen: {cm3} cm³',
    collisions: '{count} Kollision(en) – rote Punkte',
    loadStl: 'Rohteil-STL laden',
    stlLoaded: 'STL: {name}',
    removeStl: 'STL entfernen',
  },
  collision: {
    'holder-stock': 'Halter im Rohteil',
    'tool-fixture': 'Fräser im Spannmittel',
    'holder-fixture': 'Halter im Spannmittel',
    gantry: 'Portal zu niedrig',
    stock: 'Rohteil',
  },
  calibration: {
    title: 'Maschine vermessen (Kamera)',
    intro:
      'Die Kamera dient als Zielfernrohr: Die App fährt jede Marke einer Referenztafel genau ins Bildzentrum und misst dabei, wie weit die Maschine wirklich fährt und ob X und Y rechtwinklig stehen.',
    cameraOff: 'Zuerst das Kamerabild einschalten und auf die Bühne holen.',
    showCamera: 'Kamerabild zeigen',
    seen: 'Marke erkannt: Ø {d} mm, {off} mm neben dem Fadenkreuz',
    notSeen: 'Keine Marke im Bild – Kamera über einen Punkt der Tafel fahren.',
    notHomed:
      'Nicht referenziert: Messen geht, für die Korrektur der Rechtwinkligkeit danach referenzieren. Der Verfahrweg kann nicht geprüft werden – das Messfeld muss vom Eckpunkt aus nach +X und +Y passen.',
    sizeOff:
      'Der Punkt erscheint Ø {d} mm, die Platte hat Ø {nominal} mm: Kamera-Maßstab prüfen (Einstellungen → Kamera).',
    plate: 'Referenztafel',
    plateHint:
      'Kreisraster mit dunklen Punkten auf hellem Grund. Voreinstellung ist docs/kalibriertafel.svg: 19 × 19 Punkte, 10 mm Abstand, Ø 3 mm. Messfeld = Abstand der äußeren Punkte.',
    plateKind: 'Art der Tafel',
    precise: 'Präzisionsplatte',
    print: 'Ausdruck (nur Winkel)',
    preciseHint:
      'Präzisionsplatte nur, wenn die äußeren Punkte nachgemessen und als Messfeld eingetragen sind. Sonst schreibt die Korrektur den Fehler der Platte in steps_per_mm.',
    printHint:
      'Ausdruck oder 3D-Druck: Der Maßstab der Platte wird nicht übernommen, nur der Winkel – nach dem Drehen der Platte um 90°.',
    pitch: 'Rastermaß (mm)',
    dots: 'Punkte je Seite',
    dotDiameter: 'Punktdurchmesser (mm)',
    warn: {
      spanOffPitch:
        'Das Messfeld ist kein Vielfaches des Rastermaßes ({pitch} mm): Die äußeren Messpunkte liegen zwischen zwei Punkten, die Messung kann auf einen Nachbarpunkt springen.',
      pointsOffPitch:
        'Bei {n} × {n} Messpunkten liegen die Messpunkte nicht auf Punkten der Platte (Abstand {sx} × {sy} mm, Rastermaß {pitch} mm): Die Messung kann auf einen Nachbarpunkt springen. Eine Punktzahl aus der Auswahl wählen.',
      pointsFarApart:
        'Bei {n} × {n} Messpunkten liegen {k} Rastermaße ({sx} mm) zwischen den Messpunkten: Steht die Platte um 1° schief, kann die Messung auf die Nachbarreihe springen. Mehr Messpunkte wählen.',
      spanBeyondPlate: 'Das Messfeld ist größer als die Platte ({plate} mm).',
    },
    roomShort:
      'Von hier reicht der Verfahrweg nicht: Es fehlen {short} mm an {axis}{side}. Kamera weiter weg vom Rand stellen oder das Messfeld verkleinern.',
    sideMax: '+',
    sideMin: '−',
    noRoom:
      'Messung nicht gestartet: Der Verfahrweg reicht von hier nicht ({axis}{side}: {short} mm zu kurz). Kamera weiter weg vom Rand fahren oder das Messfeld verkleinern.',
    spanX: 'Messfeld X (mm)',
    spanY: 'Messfeld Y (mm)',
    settle: 'Beruhigungszeit (ms)',
    points: 'Messpunkte',
    pointsN: '{n} × {n}',
    measure: 'Messen',
    measureHint:
      'Tafel möglichst gerade auflegen (±1°), Fräser über der Tafeloberfläche. Kamera mit dem Joystick über den Eckpunkt unten links fahren (kleinster X- und Y-Wert), dann messen: Die Messung fährt von dort {x} mm nach +X und {y} mm nach +Y.',
    centre: 'Marke zentrieren',
    measureGrid: 'Raster messen',
    measureAgain: 'Raster neu messen',
    turnHint:
      'Für die Rechtwinkligkeit ohne Präzisionsplatte: Tafel um 90° drehen, Kamera über den neuen Punkt unten links fahren, dann messen.',
    measureTurned: 'Gedrehte Tafel messen',
    measureBacklash: 'Umkehrspiel messen',
    measureTilt: 'Z-Schiefe messen (Z +{mm} mm)',
    progress: 'Punkt {done} von {total} …',
    task: {
      centre: 'Zentriere die Marke …',
      grid: 'Messe das Raster …',
      backlash: 'Messe das Umkehrspiel …',
      tilt: 'Messe die Z-Schiefe …',
    },
    cancel: 'Abbrechen',
    cancelled: 'Messung abgebrochen.',
    noMarker:
      'Keine Marke gefunden oder nicht zentriert – Licht, Schärfe und Kamera-Maßstab prüfen.',
    outside: 'Messpunkt außerhalb des Verfahrwegs – Messfeld verkleinern.',
    moveFailed: 'Fahrbefehl fehlgeschlagen: {reason}',
    measured: 'Raster mit {points} Punkten gemessen.',
    result: 'Ergebnis',
    scaleX: 'Maßstab X',
    scaleY: 'Maßstab Y',
    scaleValue: '{percent} % ({mm} mm auf 1 m)',
    scaleUntrusted: 'mit einem Ausdruck nicht verlässlich',
    angle: 'Winkel X zu Y',
    angleValue: '{angle}° ({mm} mm auf 1 m)',
    angleNeedsTurn: 'Tafel um 90° drehen und erneut messen',
    fit: 'Restfehler',
    fitValue: 'RMS {rms} mm, max. {max} mm · Tafel liegt {angle}° schräg',
    backlash: 'Umkehrspiel',
    tilt: 'Z-Schiefe',
    tiltValue: 'X {x}°, Y {y}° ({mm} mm auf 100 mm)',
    tiltHint:
      'Z steht schief: Das lässt sich nicht per Config korrigieren. Z-Platten bzw. die Höhe der beiden Z-Motoren nachstellen und erneut messen.',
    correct: 'Korrektur',
    gantryWidth: 'Abstand der Y-Schienen (mm)',
    motor1Side: 'Y-Motor 1 (Anschluss A)',
    side: {
      xMin: 'Motor 1 links (X−)',
      xMax: 'Motor 1 rechts (X+)',
    },
    missing: {
      turnPlate: 'Rechtwinkligkeit: mit einem Ausdruck erst die gedrehte Tafel messen.',
      gantry: 'Rechtwinkligkeit: Abstand der Y-Schienen und Seite von Motor 1 angeben.',
      config: 'Config-Werte noch nicht gelesen – Maschine verbinden.',
    },
    nothingToDo: 'Innerhalb der Messgenauigkeit – nichts zu korrigieren.',
    apply: 'Korrektur in config.yaml schreiben (mit Sicherung)',
    applied: 'Korrektur geschrieben.',
    afterApply:
      'Steuerung neu starten, referenzieren und zur Kontrolle erneut messen. Die Sicherung steht im Protokoll.',
  },
  sim: {
    start: 'Simulator starten',
    startHint:
      'Ohne Maschine ausprobieren: eine LowRider samt Kamera, simuliert im Browser. Nichts bewegt sich wirklich.',
    badge: 'Simulator',
    title: 'Simulator',
    intro:
      'Simulierte LowRider mit Jackpot/FluidNC und Kamera am Fräskopf. Die Mechanik hat absichtlich kleine Fehler – die Kalibrierung sollte genau diese Werte finden.',
    errors: 'Eingebaute Fehler',
    errorsValue:
      'X {x} %, Y {y} %, Winkel {angle}°, Umkehrspiel X {play} mm, Z-Schiefe {tilt} mm/100 mm',
    camera: 'Kamera (wahr)',
    cameraValue: 'Versatz X {x} · Y {y} mm, {px} px/mm',
    plate: 'Kalibriertafel (erster Punkt)',
    holes: 'Bohrungen im Brett',
    surface: 'Materialoberfläche',
    howTo:
      'Kamera: Fahren → Kamera → Simulator-Kamera. Unter Z der Oberfläche hinterlässt der Fräser Spuren – so lässt sich auch der Versatz kalibrieren. Bohrung 1 und 2 liegen 200 mm auseinander. Das Brett ist 12 mm dick; bei einem beidseitigen Job wendet es sich im Schritt „Teil wenden“ von selbst – von Hand etwas schief, auf Passstiften genau.',
    speed: 'Zeitraffer',
    scene: 'Auf dem Tisch',
    scenes: {
      board: 'Brett und Kalibriertafel',
      blanks: 'Rohlinge für eine Serie',
      jig: 'Vorrichtung mit Markern',
      long: 'Langes Brett',
    },
    jigValue:
      'Ein Rahmen mit einem Untersetzer und zwei Markern (Nr. 1 und 2, 40 mm). Er liegt jedes Mal etwas anders – verschoben und verdreht. Weiter im Reiter Job: Dort wird die Vorrichtung erkannt.',
    moveJig: 'Vorrichtung woanders hinlegen',
    jigMoved: 'Simulator: Die Vorrichtung liegt jetzt woanders ({angle}° gedreht).',
    sceneChanged: 'Simulator: Tisch umgeräumt ({scene}).',
    blanksValue:
      '{count} Stück: Anhänger, ein runder und ein quadratischer Untersetzer, ein langes Schild – zwei Anhänger liegen aufeinander. Weiter im Reiter CAM → „Serie: auf Rohlinge verteilen“.',
    reset: 'Tisch zurücksetzen (Spuren und Nullpunkte löschen)',
    longValue:
      'Ein Brett von 2,6 m – mehr als doppelt so lang, wie die Maschine in X fährt. Der Beispieljob passt nicht in den Verfahrweg; unter Job bietet die App an, ihn in Abschnitten zu fräsen. Marker kleben und Brett weiterschieben macht der Simulator im Ablauf selbst – jedes Mal etwas ungenau und leicht verdreht.',
    loadLong: 'Beispiel „Regalseite“ laden und Nullpunkt setzen',
    longLoaded:
      'Simulator: Regalseite (2,48 m) geladen, X/Y-Nullpunkt auf dem langen Brett gesetzt.',
    wasReset: 'Simulator zurückgesetzt – bitte neu referenzieren.',
  },
  demo: {
    start: 'Demo: eingerichtete Maschine',
    startHint:
      'Wie fertig eingerichtet: simulierte Maschine referenziert, Kamera kalibriert, Fläche gescannt, Beispieljob auf dem Brett. Deine Einstellungen bleiben unberührt.',
    badge: 'Demo',
    notice:
      'Demo: alles simuliert, nichts wird gespeichert. Nach dem Neuladen ist die Demo wieder im Ausgangszustand.',
    leave: 'Demo beenden',
    ready:
      'Demo bereit: Maschine referenziert, Kamera kalibriert, Fläche gescannt, Beispieljob geladen.',
    failed: 'Demo konnte nicht vollständig eingerichtet werden – Seite neu laden.',
  },
  log: {
    empty: 'Noch keine Einträge.',
  },
  ready: {
    title: 'Startklar?',
    connected: 'Maschine verbunden',
    offline: 'Keine Verbindung zur Maschine',
    busy: 'Maschine ist nicht bereit (läuft, Pause oder Alarm)',
    homed: 'Referenziert – Software-Endschalter aktiv',
    notHomed: 'Nicht referenziert – Endschalter in der Steuerung inaktiv',
    errors: '{count} Fehler im G-Code',
    noErrors: 'G-Code ohne Fehler',
    controller: '{count} Stelle(n), die FluidNC anders ausführt – die App hält dort an',
    outside: 'Verlässt den Verfahrweg ({count}×)',
    inside: 'Liegt im Verfahrweg',
    zeroMissing: 'Nullpunkt liegt im Maschinennullpunkt – noch nicht gesetzt?',
    zeroSet: 'Nullpunkt gesetzt',
    collisions: '{count} Kollision(en) mit Rohteil, Spannmitteln oder Portal:',
    clampCut: '{name} liegt in der Fräsbahn – versetzen oder Job verschieben',
    clampRapid: 'Eilgang fährt in {name} – versetzen oder Sicherheitshöhe im Job anheben',
    clampLow: 'Nur {mm} mm Luft über {name} – versetzen oder Sicherheitshöhe im Job anheben',
    placeholder: 'Verfahrweg im Maschinenprofil noch nicht eingetragen',
    toConnect: 'Verbinden',
    toHome: 'Referenzfahrt',
    show: 'Zeigen',
    toZero: 'Nullpunkt',
    toSetup: 'Aufspannung',
    toProfile: 'Profil',
    levels: { ok: 'in Ordnung', warn: 'Hinweis', block: 'sperrt den Start' },
    toStock: 'Rohteil',
    toTools: 'Werkzeuge',
    depthOk: 'Z-Tiefe plausibel: {mm} mm tief, Rohteil {stock} mm',
    depthAbove: 'Z-Tiefe: Der Job fräst nicht unter seinen Nullpunkt',
    depthThrough:
      'Z-Tiefe: {mm} mm tief, das Rohteil ist {stock} mm dick – {over} mm in die Opferplatte',
    toolsOk: 'Werkzeuge: {count} in Ordnung',
    toolsOpen: 'Werkzeuge: {count} bitte prüfen',
    limitsOk: 'Drehzahl und Vorschub innerhalb der Grenzen',
    feedOver: 'Vorschub {feed} mm/min ist schneller, als die Maschine fährt ({max} mm/min)',
    rpmOver: 'Drehzahl {rpm} U/min liegt über der Spindel ({max} U/min)',
    rpmUnder: 'Drehzahl {rpm} U/min liegt unter der Spindel ({min} U/min)',
    flipFirst: 'Vorderseite eines beidseitigen Jobs – danach wird gewendet',
    flipFront: 'Rückseite: Erst die Vorderseite fräsen',
    flipTurn: 'Rückseite: Das Teil ist noch nicht gewendet',
    flipLocate: 'Rückseite: Die Passlöcher sind noch nicht gefunden',
    flipReady: 'Teil gewendet und wiedergefunden',
    flipCutAgain: 'Diese Seite des beidseitigen Jobs ist schon gefräst',
    toFlip: 'Zum Wenden',
    seriesOk: 'Serie liegt auf {count} Rohling(en), wie die Kamera sie gefunden hat',
    seriesMoved:
      'Der Nullpunkt wurde verschoben: Die Serie liegt nicht mehr auf den Rohlingen – in „Zeichnen“ neu auf die Rohlinge verteilen',
    seriesTurned:
      'Die Serie wurde nachträglich gedreht oder verschoben (Ausrichten): Sie liegt nicht mehr auf den Rohlingen – in „Zeichnen“ neu auf die Rohlinge verteilen',
    toSeries: 'Zeichnen',
    jigOk: 'Vorrichtung „{name}“ erkannt – Nullpunkt aus Marker',
    jigUnmeasured: 'Vorrichtung „{name}“ ist in dieser Sitzung noch nicht eingemessen',
    jigMoved: 'Vorrichtung „{name}“ liegt woanders als beim Einmessen – neu einmessen',
    jigZeroMoved:
      'Der Nullpunkt wurde nach dem Einmessen der Vorrichtung „{name}“ verschoben – neu einmessen',
    jigTurned:
      'Der Job wurde nach dem Einmessen der Vorrichtung „{name}“ gedreht oder verschoben – neu einmessen',
    toJig: 'Einmessen',
    blocked: 'Start gesperrt: {count} Punkt(e) offen',
    toCheck: 'Prüfen',
    ready: 'Startklar',
    readyWithNotes: 'Startklar – {count} Hinweis(e)',
    outsideLong:
      'Teil ist länger als der Tisch: Der Job verlässt den Verfahrweg in {axis} ({count}×). In Abschnitten fräsen – nach jedem Abschnitt wird das Teil weitergeschoben',
    toSections: 'In Abschnitten fräsen',
    toSectionsFlow: 'Zum Ablauf',
    sectionsReady: 'Abschnitt {n} von {total} eines Teils, das länger ist als der Tisch',
    sectionsCutAgain: 'Abschnitt {n} ist schon gefräst',
    sectionsEarlier: 'Abschnitt {n}: Erst Abschnitt {at} fräsen',
    sectionsPast:
      'Abschnitt {n} ist gefräst und das Teil liegt schon für Abschnitt {at} – dieses Programm würde an der falschen Stelle fräsen',
    sectionsSlid:
      'Abschnitt {n} ist gefräst und das Teil wird weitergeschoben – erst die Passmarken finden',
    sectionsMoved:
      'Nullpunkt oder Programm wurden geändert, seit das Teil wiedergefunden wurde – Passmarken neu finden',
    toRun: 'Zum Start',
  },
  runBar: {
    left: 'noch {time}',
    open: 'Zum Job',
  },
  runPanel: {
    preamble:
      'Die Datei setzt Einheit und Absolutmaß nicht selbst – „G21 G90“ wird vorangestellt, damit sie nie relativ oder in Zoll läuft.',
    manualSpindle:
      'Fräsmotor von Hand einschalten: Die Steuerung hat keine Spindel eingerichtet, M3/M5 schalten nichts.',
    title: 'Fräsen',
    start: 'Fräsen starten',
    readyHint: 'Startklar. Zum Start unten rechts „Fräsen starten“ gedrückt halten.',
    probeLock:
      'Spindelstart gesperrt: Ein Werkzeug dieses Jobs ist als Messtaster markiert. Der Start fragt jedes Mal nach.',
    startPart: 'Teil {n}/{total} starten (T{tool})',
    uploading: 'Lade auf die SD-Karte …',
    hint: 'Der Job läuft von der SD-Karte der Steuerung – WLAN und iPad dürfen zwischendurch ausfallen.',
    partDone: 'Teil {n} fertig – Spindel aus, Z oben. Werkzeug T{next} einsetzen.',
    abortParts: 'Restliche Teile abbrechen',
    stream: 'Vom iPad streamen (Einzelschritt, Halt am Werkzeugwechsel)',
  },
  cam: {
    open: 'Zeichnen / DXF',
    title: 'Zeichnung: {name}',
    back: 'Zurück zum Job',
    advanced: 'Erweitert',
    steps: {
      draw: '1 · Zeichnen',
      how: '2 · Wie wird gefräst?',
      done: '3 · Ansehen und übergeben',
    },
    addHint:
      'Antippen – die Form liegt sofort auf dem Tisch-Bild. Dort mit dem Finger oder der Maus verschieben, an den Griffen größer ziehen und drehen.',
    otherJob:
      'Auf dem Tisch liegt gerade „{file}“, nicht diese Zeichnung. Das Programm bleibt, wie es ist – erst der Knopf legt die Zeichnung dorthin. Ein ausgerichtetes Programm danach neu ausrichten.',
    otherJobRunning:
      'Auf dem Tisch liegt gerade „{file}“, und ein Job läuft. Du kannst weiterzeichnen – das Programm bleibt, wie es ist. Nach dem Job legt ein Tipp die Zeichnung auf den Tisch.',
    ahead: {
      running:
        'Ein Job läuft. Das Programm „{file}“ bleibt, wie es ist – nach dem Job legt ein Tipp die Änderungen auf den Tisch.',
      done: 'Die Zeichnung wurde geändert, während der Job lief. Auf dem Tisch liegt noch „{file}“ von vorher.',
      nothing:
        'Ein Job läuft. Die Zeichnung kommt von selbst auf den Tisch, sobald er zu Ende ist – riss die Verbindung ab, legt sie ein Tipp dorthin.',
      empty:
        'Die Zeichnung wurde geändert, während der Job lief. Auf dem Tisch liegt noch nichts davon.',
    },
    aheadReason:
      'Die Zeichnung ist weiter als das Programm auf dem Tisch – erst auf den Tisch legen, dann herunterladen.',
    jobRuns: 'Ein Job läuft – das Programm auf dem Tisch bleibt, bis er zu Ende ist.',
    showDrawing: 'Zeichnung auf den Tisch legen',
    undo: 'Rückgängig',
    redo: 'Wiederholen',
    live: {
      size: '{w} × {h} mm',
      angle: '{a}°',
      place: 'X {x} · Y {y}',
    },
    importFile: 'Datei (DXF, SVG)',
    project: {
      open: 'Projekt öffnen …',
      save: 'Projekt speichern',
      opened: 'Projekt „{name}“ geöffnet – „Rückgängig“ bringt die vorige Zeichnung zurück.',
      saved: 'Projekt gespeichert: {name}',
      toolMissing:
        'Das Werkzeug des Projekts gibt es in dieser Werkzeugliste nicht – es bleibt das gewählte.',
      settingsDropped:
        'Aus der Datei nicht übernommen (Werte, die keine Maschine hat): {list} – es bleibt, was jetzt eingestellt ist.',
      toolDiffers:
        'Das Werkzeug des Projekts hatte {file} mm Durchmesser, hier hat es {now} mm – die Bahnen werden mit dem jetzigen gerechnet.',
      errors: {
        'too-large': 'Die Datei ist zu groß für eine Zeichnung (über 20 MB).',
        'invalid-json': 'Das ist keine Projektdatei: sie lässt sich nicht lesen.',
        'wrong-format': 'Das ist keine Projektdatei dieser App (Format falsch).',
        'newer-version': 'Die Projektdatei ist von einer neueren Version der App.',
        'invalid-project':
          'Die Projektdatei ist beschädigt oder unvollständig – es wurde nichts geöffnet.',
      },
    },
    fileError: 'Datei nicht lesbar: {reason}',
    fileEmpty: 'In der Datei war nichts, das sich fräsen lässt.',
    skipped: 'Nicht übernommen: {list} (Text, Blöcke, Schraffuren gehen nicht).',
    notes: {
      'svg-text':
        '{count}× Text nicht übernommen – im Zeichenprogramm in Pfade umwandeln oder hier unter „Text“ neu setzen.',
      'svg-image': '{count}× Bild übersprungen – Fotos lassen sich nicht fräsen.',
      'svg-use': '{count}× Klon oder Verweis übersprungen – im Zeichenprogramm in Pfade umwandeln.',
      'svg-element': '{count}× unbekanntes Element übersprungen.',
      'svg-path': '{count}× Pfad mit Fehler – nur bis zur fehlerhaften Stelle übernommen.',
      'svg-transform':
        '{count}× Verschiebung oder Drehung nicht lesbar – das Teil liegt womöglich falsch.',
      'svg-units':
        'Die Datei nennt keine Größe in mm – gelesen mit 96 Punkten pro Zoll. Bitte ein Maß nachprüfen.',
    },
    addShape: 'Hinzufügen',
    shapes: {
      rect: 'Rechteck',
      circle: 'Kreis',
      slot: 'Langloch',
      grid: 'Lochraster',
      text: 'Text',
    },
    fields: {
      w: 'Breite (mm)',
      h: 'Höhe (mm)',
      r: 'Eckenradius (mm)',
      d: 'Durchmesser (mm)',
      l: 'Länge (mm)',
      slotW: 'Breite (mm)',
      nx: 'Löcher quer',
      ny: 'Löcher hoch',
      px: 'Lochabstand X (mm)',
      py: 'Lochabstand Y (mm)',
    },
    text: {
      sample: 'Text',
      label: 'Text (mehrere Zeilen möglich)',
      placeholder: 'z. B. Werkstatt',
      height: 'Schrifthöhe (mm)',
      more: 'Schrift: Ausrichtung und Abstände',
      align: 'Zeilen ausrichten',
      aligns: {
        left: 'Links',
        center: 'Mittig',
        right: 'Rechts',
      },
      spacing: 'Buchstabenabstand (± %)',
      lineSpacing: 'Zeilenabstand (%)',
      hint: 'Die Schrifthöhe ist die Höhe der Großbuchstaben. Einlinien-Schrift zum Gravieren: Der Fräser fährt jeden Buchstaben einmal nach, die Strichbreite kommt vom Werkzeug (V-Fräser oder dünner Schaftfräser).',
      missing: 'Diese Zeichen kennt die Schrift nicht, sie bleiben frei: {list}',
    },
    arrange: {
      hint: 'Zum Ändern ein Teil auf dem Tisch oder in der Liste antippen.',
      all: 'Alles auswählen',
      invert: 'Auswahl umkehren',
      multi: 'Mehrfachauswahl',
      multiHint:
        'Ein Tipp auf ein Teil nimmt es in die Auswahl oder wieder heraus. Ein Tipp daneben lässt die Auswahl, wie sie ist. Am Rechner geht das auch ohne diesen Schalter: Umschalt- oder Strg-Taste halten und tippen.',
      marquee: 'Rahmen aufziehen',
      marqueeHint:
        'Über den Tisch ziehen: Beim Loslassen kommen alle Teile in die Auswahl, die der Rahmen berührt. Mit „Mehrfachauswahl“ oder gehaltener Umschalt-/Strg-Taste kommen sie zur Auswahl dazu, sonst ersetzen sie sie. Dabei wird nichts verschoben. Die Ansicht verschieben und zoomen: zwei Finger oder das Mausrad.',
      aids: 'Fangen und Abstände',
      snap: 'Fangen',
      snapHint:
        'Beim Ziehen rastet ein Teil an Kanten und Mitten anderer Teile und am Rohteil ein.',
      snapAlt: 'Am Rechner schaltet die Alt-Taste (Option) das Einrasten für einen Zug aus.',
      gaps: 'Abstände zeigen',
      measure: 'Messen',
      measureHint:
        'Auf den Tisch tippen setzt Punkt A, der nächste Tipp Punkt B, ein dritter beginnt von vorn. Die Punkte rasten an Ecken, Kantenmitten und Kreismitten ein (Alt-Taste: frei) und lassen sich verschieben. Dabei wird nichts ausgewählt und nichts verändert.',
      parts: '{n} Teile',
      partsOf: '{n} Teile, {m} Konturen',
      groupOf: 'Gruppe aus {m} Konturen',
      size: '{w} × {h} mm',
      deselect: 'Auswahl aufheben',
      x: 'X links (mm)',
      y: 'Y unten (mm)',
      cx: 'X Mitte (mm)',
      cy: 'Y Mitte (mm)',
      evenly: 'Breite und Höhe ändern sich zusammen: Das Teil behält seine Form.',
      turnLeft: '↺ 90°',
      turnLeftLabel: 'Um 90° nach links drehen',
      turnRight: '↻ 90°',
      turnRightLabel: 'Um 90° nach rechts drehen',
      mirrorX: 'Spiegeln ↔',
      mirrorXLabel: 'Links und rechts spiegeln',
      mirrorY: 'Spiegeln ↕',
      mirrorYLabel: 'Oben und unten spiegeln',
      duplicate: 'Duplizieren',
      remove: 'Löschen',
      more: 'Mehrfach anordnen',
      angle: 'Winkel (°)',
      columns: 'Spalten',
      rows: 'Reihen',
      gap: 'Abstand (mm)',
      array: 'Auf {n} Stück vervielfältigen',
    },
    align: {
      title: 'Ausrichten und verteilen',
      hint: 'Ausgerichtet wird an der Auswahl: Das Teil, das am weitesten außen liegt, bleibt, wo es ist. Eine Gruppe zählt als ein Teil ({n} Teile).',
      left: 'Links',
      leftLabel: 'Linksbündig ausrichten',
      centre: 'Mitte ↔',
      centreLabel: 'Waagerecht mittig ausrichten',
      right: 'Rechts',
      rightLabel: 'Rechtsbündig ausrichten',
      top: 'Oben',
      topLabel: 'Oben ausrichten',
      middle: 'Mitte ↕',
      middleLabel: 'Senkrecht mittig ausrichten',
      bottom: 'Unten',
      bottomLabel: 'Unten ausrichten',
      spreadTitle: 'Verteilen',
      spreadHint:
        'Das äußerste Teil auf jeder Seite bleibt, die anderen rücken gleichmäßig dazwischen – mit gleichem Abstand oder mit gleichen Mitten.',
      needThree:
        'Zum Verteilen mindestens drei Teile oder Gruppen auswählen – eine Gruppe zählt als eines.',
      spread: {
        h: {
          gaps: 'Abstände ↔',
          gapsLabel: 'Waagerecht verteilen: gleiche Abstände',
          centres: 'Mitten ↔',
          centresLabel: 'Waagerecht verteilen: gleiche Mitten',
        },
        v: {
          gaps: 'Abstände ↕',
          gapsLabel: 'Senkrecht verteilen: gleiche Abstände',
          centres: 'Mitten ↕',
          centresLabel: 'Senkrecht verteilen: gleiche Mitten',
        },
      },
    },
    gap: {
      label: '{mm} mm',
      equal: '= {mm} mm',
    },
    measure: {
      pointA: 'A',
      pointB: 'B',
      live: '{d} mm',
      liveDetail: 'ΔX {dx} · ΔY {dy} · {a}°',
      title: 'Messung',
      onlyA: 'Punkt A steht. Auf den Tisch tippen setzt Punkt B.',
      distance: 'Abstand',
      dx: 'ΔX',
      dy: 'ΔY',
      angle: 'Winkel',
      mm: '{v} mm',
      deg: '{v}°',
      angleNote: 'Gegen den Uhrzeigersinn von der X-Achse, Y nach hinten.',
      clear: 'Messung löschen',
    },
    hide: {
      hide: 'Teil ausblenden',
      hideOf: 'Teil {n} ausblenden',
      showOf: 'Teil {n} einblenden',
      state: 'ausgeblendet',
      showAll: 'Alle einblenden',
      note: 'Ausgeblendete Teile werden nicht gefräst, lassen sich auf dem Tisch nicht antippen und fehlen bei „Alles auswählen“ und beim Ausrichten. In der Liste bleiben sie.',
      allHidden: 'Alle Teile sind ausgeblendet – es gibt nichts zu fräsen.',
      noTabs: 'Ein ausgeblendetes Teil hat keine Stege auf dem Tisch – erst einblenden.',
    },
    group: {
      group: 'Gruppieren',
      ungroup: 'Gruppierung aufheben',
      needTwo:
        'Zum Gruppieren mindestens zwei Teile oder Gruppen auswählen – eine Gruppe zählt als eines.',
      nothingToUngroup: 'Die Auswahl enthält keine Gruppe aus mehreren Teilen.',
    },
    pick: 'Kontur {n} zur Auswahl',
    empty: 'Noch nichts gezeichnet – oben eine Form, einen Text oder eine Datei antippen.',
    rectLabel: 'Rechteck {w} × {h} mm',
    slotLabel: 'Langloch {l} × {w} mm',
    gridLabel: 'Lochraster {nx} × {ny}, Ø {d} mm',
    circleLabel: 'Kreis Ø {d} mm',
    lineLabel: 'Linie {l} mm',
    contourLabel: 'Kontur {w} × {h} mm',
    textLabel: 'Text „{text}“',
    manyLabel: '{n} × {what}',
    operation: 'Bearbeitung Kontur {n}',
    depthOf: 'Tiefe Kontur {n} (mm)',
    deep: 'mm',
    relief: 'Ecken Kontur {n}',
    reliefs: {
      none: 'Ecken rund',
      dogbone: 'Ecken frei (diagonal)',
      tbone: 'Ecken frei (längs)',
    },
    reliefHint:
      'Ecken frei: Der runde Fräser lässt in jeder Innenecke seinen Radius stehen. „Frei“ fährt kurz in die Ecke hinein, damit ein eckiges Teil hineinpasst – diagonal (Dogbone) oder längs der langen Kante (T-Bone), die dann gerade bleibt.',
    remove: 'Kontur {n} entfernen',
    clear: 'Zeichnung leeren',
    kinds: {
      outside: 'Außen',
      inside: 'Innen',
      on: 'Linie gravieren',
      pocket: 'Tasche',
      drill: 'Bohren',
      none: 'Nicht fräsen',
    },
    tabs: 'Haltestege',
    tabPanel: 'Haltestege von Teil {n}',
    tabMode: 'Verteilung der Haltestege von Teil {n}',
    tabAuto: 'Automatisch',
    tabManual: 'Von Hand',
    tabCountField: 'Anzahl',
    tabWidthField: 'Breite (mm)',
    tabHeightField: 'Höhe (mm)',
    tabCountOf: 'Anzahl der Stege von Teil {n}',
    tabWidthOf: 'Stegbreite von Teil {n} (mm)',
    tabHeightOf: 'Steghöhe von Teil {n} (mm)',
    tabSpread: 'Gleichmäßig verteilen',
    tabSpreadAuto: 'Im Modus „Automatisch“ sind die Stege schon gleichmäßig verteilt.',
    tabPlace: 'Stege setzen',
    tabPlaceHint:
      'Auf die Kontur tippen setzt einen Steg, einen Steg ziehen verschiebt ihn, antippen entfernt ihn. Bis zu {max} Stege.',
    tabNone: 'Keine Stege gesetzt – das Teil wird nicht gehalten.',
    tabSome: '{n} von {m} Konturen haben keinen Steg – sie werden nicht gehalten.',
    tabZero: 'Anzahl 0 – das Teil wird nicht gehalten.',
    tabsOpenOf: 'Stege von Teil {n} einstellen',
    tabsOpen: 'Stege einstellen',
    tabsCloseOf: 'Haltestege von Teil {n} schließen',
    tabsClose: 'Schließen',
    tabTooMany:
      'Zu viele Konturen für das Setzen von Hand: höchstens {max} Stege. Die Stege bleiben automatisch.',
    tabNote:
      'Die Breite ist das Material, das am Teil stehen bleibt (der Fräser hebt sich darüber noch um seinen Durchmesser). Leere Felder nehmen die Standardwerte unter „Erweitert“.',
    tool: 'Werkzeug',
    suggest: 'Werte aus Werkzeug und Material vorschlagen',
    suggestNeedsMaterial:
      'Für Vorschläge erst unter „Vorbereiten“ das Material wählen – oder am Werkzeug eigene Schnittwerte eintragen',
    depth: 'Tiefe (mm)',
    engraveDepth: 'Gravurtiefe (mm)',
    allowance: 'Schlichtzugabe (mm, 0 = aus)',
    stepdown: 'Zustellung (mm)',
    feed: 'Vorschub (mm/min)',
    plungeFeed: 'Eintauchen (mm/min)',
    rpm: 'Drehzahl (1/min)',
    rampAngle: 'Rampe (°, 90 = senkrecht)',
    stepover: 'Bahnabstand Tasche (%)',
    safeZ: 'Sichere Höhe (mm)',
    tabWidth: 'Standard-Stegbreite (mm)',
    tabHeight: 'Standard-Steghöhe (mm)',
    tabCount: 'Standard-Anzahl Stege je Kontur',
    climb: 'Gleichlauf (sonst Gegenlauf)',
    direction: 'Laufrichtung von Teil {n}',
    directions: { job: 'Laufrichtung wie der Job', climb: 'Gleichlauf', conventional: 'Gegenlauf' },
    problems: {
      'tool-too-large': 'Kontur {n}: Werkzeug zu groß dafür.',
      'open-contour': 'Kontur {n} ist offen – nur „Linie gravieren“ möglich.',
      'hole-too-small': 'Kontur {n}: Bohren nur bei Kreisen ab Werkzeugdurchmesser.',
    },
    look: 'Die Fräsbahnen stehen schon auf dem Tisch-Bild. Gefräst wird in dieser Reihenfolge: Bohrungen, Taschen und Gravuren, Ausschnitte – und die Außenkontur jedes Teils zuletzt.',
    generate: 'G-Code erzeugen',
    generated: 'G-Code aus der Zeichnung {name} erzeugt.',
    download: 'Als .nc speichern',
  },
  flip: {
    both: 'Von beiden Seiten fräsen',
    intro:
      'Alles so zeichnen, wie es von vorn aussieht – auch die Rückseite (auf dem Tisch-Bild gestrichelt); gespiegelt wird beim Fräsen von selbst. Zum Wiederfinden bohrt die Vorderseite zwei Passlöcher: Bohrungen neben dem Teil, nach denen die Rückseite ausgerichtet wird.',
    way: 'So wird das Teil gewendet',
    ways: {
      x: 'Wie eine Buchseite',
      y: 'Über die Vorderkante',
    },
    swaps: {
      x: 'links und rechts tauschen',
      y: 'vorn und hinten tauschen',
    },
    over: {
      long: 'über die lange Seite',
      short: 'über die kurze Seite',
    },
    thickness: 'Materialdicke (mm)',
    thicknessFromStock: 'Leer gelassen gelten die {mm} mm des Rohteils.',
    find: 'Gewendetes Teil wiederfinden',
    methods: {
      camera: 'Mit der Kamera',
      pins: 'Mit Passstiften',
    },
    byCamera:
      'Die Passlöcher (Ø {d} mm) gehen durchs Material. Nach dem Wenden fährt die Kamera zu beiden und richtet die Rückseite danach aus – das Teil muss nicht genau liegen.',
    byPins:
      'Die Passlöcher (Ø {d} mm) gehen {into} mm in die Opferplatte. Nach dem Wenden steckt das Teil auf zwei Passstiften Ø {d} mm – so dick, wie der Fräser bohrt. Es sitzt so genau, wie die Stifte in die Löcher passen.',
    byPinsNoCamera:
      'Die Passlöcher (Ø {d} mm) gehen {into} mm in die Opferplatte. Nach dem Wenden steckt das Teil auf zwei Passstiften Ø {d} mm – so dick, wie der Fräser bohrt. Es sitzt so genau, wie die Stifte in die Löcher passen. Mit eingerichteter Kamera geht es auch ohne Stifte.',
    holes: 'Passlöcher: Ø {d} mm, {apart} mm auseinander',
    proposeHoles: 'Neu vorschlagen',
    holesHint:
      'Die Passlöcher liegen als Kreise mit Kreuz auf dem Tisch-Bild, die Strichpunktlinie ist die Wendeachse. Ein Passloch lässt sich mit dem Finger verschieben.',
    holeLabel: 'Passloch {n}',
    holeMoves:
      'Ein Passloch rastet waagrecht oder senkrecht zum anderen ein – so passt das gewendete Teil.',
    sideOf: 'Seite Kontur {n}',
    sides: {
      front: 'Vorderseite',
      back: 'Rückseite',
    },
    backText:
      'Text auf der Rückseite steht in der Zeichnung spiegelverkehrt – so ist er am gewendeten Teil lesbar.',
    twoPrograms:
      'Es entstehen zwei Programme: Vorderseite (mit den Passlöchern) und Rückseite. Der Reiter Job führt durchs Wenden.',
    notes: {
      meet: 'Kontur {front} (Vorderseite) und Kontur {back} (Rückseite) sind dieselbe Form und treffen sich im Material: Sie geht von beiden Seiten durch.',
      through:
        'Kontur {front} (Vorderseite) und Kontur {back} (Rückseite) überlappen und sind zusammen {mm} mm tiefer als das Material dick ist: Dort entsteht ein Loch. Wenn das nicht gewollt ist, eine Tiefe verringern.',
      thin: 'Zwischen Kontur {front} (Vorderseite) und Kontur {back} (Rückseite) bleiben nur {mm} mm Material stehen.',
      loose:
        'Kontur {front} wird auf der Vorderseite ohne Haltestege ganz durchgeschnitten: Das Teil löst sich von den Passlöchern und lässt sich nicht mehr wiederfinden. Haltestege einschalten oder den Umriss auf die Rückseite legen.',
      'hole-on-cut':
        'Passloch {n} liegt auf einer Fräsbahn oder zu dicht daran. Mit dem Finger verschieben oder neu vorschlagen lassen.',
      'hole-in-part':
        'Passloch {n} liegt im Teil selbst – das Loch bleibt im fertigen Teil. Gewollt? Sonst neben das Teil oder in einen Ausschnitt schieben.',
      'hole-off-stock': 'Passloch {n} liegt neben dem Rohteil aus „Vorbereiten“.',
      'no-thickness':
        'Materialdicke fehlt: Ohne sie weiß die App nicht, wie tief die Passlöcher gehen müssen.',
      'no-back':
        'Noch nichts auf der Rückseite: bei einer Kontur „Rückseite“ wählen. Bis dahin entsteht ein normaler Job für eine Seite.',
      askew:
        'Die Passlöcher liegen schräg zueinander: So passt das gewendete Teil nicht auf die Stifte. Eines verschieben (es rastet ein) oder neu vorschlagen lassen.',
    },
    title: 'Beidseitig: {name}',
    stepsLabel: 'Ablauf beidseitig fräsen',
    steps: {
      front: 'Vorderseite fräsen',
      turn: 'Teil wenden',
      turnPins: 'Teil wenden, auf die Stifte',
      locate: 'Passlöcher finden',
      back: 'Rückseite fräsen',
    },
    frontHint:
      'Zuerst die Vorderseite, wie jeden Job. Sie bohrt auch die zwei Passlöcher (Ø {d} mm). Danach geht es hier mit dem Wenden weiter.',
    frontHintPins:
      'Zuerst die Vorderseite, wie jeden Job. Sie bohrt auch die zwei Passlöcher bis in die Opferplatte – zwei Passstifte Ø {d} mm bereitlegen. Danach geht es hier mit dem Wenden weiter.',
    loadFront: 'Vorderseite laden',
    discard: 'Verwerfen',
    alreadyCut: 'Die Vorderseite ist schon gefräst',
    alreadyCutHint:
      'Nur wenn sie mit dem jetzigen Nullpunkt gefräst wurde: Von ihm aus kennt die App die Passlöcher.',
    markCut: 'Weiter zum Wenden',
    frontDone: 'Vorderseite fertig – jetzt das Teil wenden (Reiter Job).',
    turn: {
      x: 'Wie eine Buchseite umblättern: Die linke Kante kommt nach rechts, vorn bleibt vorn.',
      y: 'Über die Vorderkante kippen: Die vordere Kante kommt nach hinten, links bleibt links.',
      loosen: 'Spannmittel lösen, Späne wegfegen.',
      how: {
        x: 'Teil wie eine Buchseite wenden.',
        y: 'Teil über die Vorderkante wenden.',
      },
      putCamera:
        'Etwa an dieselbe Stelle legen – ein paar Millimeter oder Grad daneben macht nichts, die Kamera findet die Passlöcher.',
      putPins:
        'Zwei Passstifte Ø {d} mm in die Löcher im Tisch stecken und das Teil mit seinen Passlöchern daraufsetzen: Die Löcher tauschen dabei die Plätze.',
      putPinsAlong:
        'Zwei Passstifte Ø {d} mm in die Löcher im Tisch stecken und das Teil mit seinen Passlöchern daraufsetzen: Jedes Loch kommt wieder auf seinen Stift.',
      clamp:
        'Wieder festspannen. Die markierten Spannmittel bleiben auf dem Tisch stehen und werden unter „Prüfen“ gegen die Rückseite geprüft – umgesetzte mit dem Werkzeug „Spannmittel“ nachziehen.',
      z: 'Z-Null bleibt, solange Fräser und Unterlage dieselben sind.',
      done: 'Teil ist gewendet und fest',
      donePins: 'Teil sitzt auf den Stiften und ist fest',
    },
    needsMachine: 'Dafür muss die Maschine verbunden und bereit sein.',
    locate: {
      hint: 'Die Kamera fährt über jedes Passloch und zentriert sich darauf. Aus beiden ergeben sich Nullpunkt und Drehung für die Rückseite.',
      find: 'Passloch {n} anfahren und suchen',
      again: 'Passloch {n} noch einmal suchen',
      seeking: 'Suche Passloch {n} …',
      here: 'Passloch {n} hier suchen',
      noMove:
        'Die Maschine ist nicht bis zum Passloch gekommen (Verfahrweg, Alarm?). Kamera mit dem Joystick über das Passloch fahren und dort suchen lassen.',
      noHole:
        'Kein Loch im Bild gefunden. Kamera mit dem Joystick über das Passloch fahren und dort suchen lassen.',
      mismatch:
        'Die zwei gefundenen Löcher liegen {error} mm anders auseinander als gebohrt – vermutlich ist eines ein anderes Loch. Beide noch einmal suchen.',
    },
    located:
      'Teil gefunden: {angle}° gedreht, der Lochabstand passt auf {error} mm. Die Rückseite liegt jetzt richtig – weiter mit Prüfen und Fräsen.',
    onPins:
      'Rückseite geladen, der Nullpunkt ist der der Vorderseite. Weiter mit Prüfen und Fräsen.',
    otherJob: 'Geladen ist gerade ein anderes Programm, nicht die Rückseite.',
    findAgain: 'Teil neu suchen',
    backToTurn: 'Zurück zum Wenden',
    done: 'Beide Seiten sind gefräst.',
    bothDone: 'Beidseitiger Job {name}: beide Seiten sind gefräst.',
    close: 'Abschließen',
    cancel: 'Beidseitigen Job abbrechen',
  },
  series: {
    entry: 'Viele gleiche Teile?',
    open: 'Serie: auf Rohlinge verteilen',
    openHint:
      'Dasselbe Motiv – oder je ein Name – auf viele Rohlinge, die verstreut auf dem Tisch liegen: Untersetzer, Schlüsselanhänger, Brettchen. Die Kamera findet Lage und Drehung, einzeln ausrichten entfällt.',
    needsMotif: 'Zuerst das Motiv zeichnen: einen Text, ein Logo, eine Form.',
    notTwoSided: 'Eine Serie wird von einer Seite gefräst: „Von beiden Seiten fräsen“ ausschalten.',
    title: 'Serie: {name}',
    back: 'Zur Zeichnung',
    stepsLabel: 'Schritte der Serie',
    steps: {
      find: 'Rohlinge finden',
      check: 'Motiv prüfen',
      cut: 'Fräsen',
    },
    one: '1 Rohling',
    many: '{count} Rohlinge',
    find: {
      how: 'Rohlinge auf den Tisch legen: mit etwas Abstand, alle gleich dick, mit Doppelklebeband festgeklebt oder an einem Anschlag. Z0 auf die Oberfläche eines Rohlings setzen – von dort zählt die Kamerahöhe. Dann sucht die App die Rohlinge auf dem Bild vom Tisch.',
      onPicture: 'Auf dem Tisch-Bild suchen',
      pictures: 'Auf dem Tisch liegen {count} Bilder. Wurde seitdem etwas verschoben: neu scannen.',
      noPictures: 'Vom Tisch gibt es noch kein Bild: den Bereich mit den Rohlingen scannen.',
      scan: 'Tisch scannen (halten)',
      rescan: 'Tisch neu scannen (halten)',
      area: 'Bereich ändern',
      areaHint:
        'Bereich in Werkstück-Koordinaten, wie das Raster im Tisch-Bild. Ohne Y-Achse: Y von = Y bis, dann entsteht ein Streifen entlang X.',
      estimate: '{count} Bilder, etwa {minutes} min',
      scanning: 'Scan läuft: Bild {done} von {total}',
      cancel: 'Abbrechen',
      cameraNeeded: 'Dafür braucht es die eingerichtete Kamera (Maßstab und Versatz).',
      toCamera: 'Kamera einrichten',
      none: 'Keine Rohlinge gefunden. Liegen sie ganz im Bild und heben sie sich vom Tisch ab – hell auf dunkel oder umgekehrt?',
      flat: 'Das Tisch-Bild zeigt keine zwei klaren Töne. Helle Rohlinge auf dunkler Unterlage (oder umgekehrt) und gleichmäßiges Licht helfen.',
      noMap: 'Auf dem Tisch liegt noch kein Bild.',
      again: 'Neu suchen',
    },
    found: '{blanks} gefunden',
    refused: {
      title: 'Nicht übernommen (im Bild gelb gestrichelt):',
      border: 'Liegt am Rand des Tisch-Bilds – größeren Bereich scannen.',
      touching:
        'Rohlinge berühren sich (oder die Form hat eine Einbuchtung) – etwas auseinanderlegen.',
      faint: 'Hebt sich zu wenig vom Tisch ab – anderes Licht oder eine andere Unterlage.',
      short: {
        border: 'am Bildrand',
        touching: 'berühren sich',
        faint: 'zu blass',
      },
    },
    tapHint:
      'Die Nummern im Bild sind die Reihenfolge beim Fräsen. Ein Tipp auf einen Rohling lässt ihn aus oder nimmt ihn wieder dazu.',
    list: 'Rohlinge',
    row: {
      out: 'ausgelassen',
      rect: '{l} × {w} mm, {angle}° gedreht',
      square: '{l} × {w} mm (quadratisch), {angle}° gedreht',
      round: 'rund, Ø {d} mm',
      other: '{l} × {w} mm',
      measured: 'nachgemessen',
      unnamed: 'kein Name mehr – bleibt frei',
      misfit: 'Motiv ragt über den Rand',
      include: 'Rohling {n} gravieren',
      turn: 'Drehen',
      turnLabel: 'Motiv auf Rohling {n} drehen',
    },
    turnHint:
      '„Drehen“ stellt das Motiv auf den Kopf – ein Rechteck sieht von beiden Seiten gleich aus.',
    turnHintQuarter:
      'Quadratische und runde Rohlinge: „Drehen“ dreht um 90°. Runde haben keine erkennbare Drehung, dort liegt das Motiv zunächst gerade.',
    what: 'Was kommt auf jeden Rohling?',
    modes: {
      same: 'Das Motiv',
      names: 'Ein Name je Rohling',
      numbers: 'Laufende Nummer',
    },
    names: 'Namen: eine Zeile pro Rohling, in der Reihenfolge der Nummern',
    namesPlaceholder: 'Anna',
    replaces:
      'Ersetzt den Text „{text}“ der Zeichnung: gleiche Schrifthöhe, mittig an seiner Stelle.',
    firstNumber: 'Erste Nummer',
    needsText:
      'Namen oder Nummern je Rohling: Dafür zuerst einen Text in die Zeichnung setzen – er gibt Größe und Platz vor.',
    unnamed: 'Kein Name mehr für {blanks} – ohne Gravur.',
    spare: '{count} Namen bleiben übrig: kein Rohling mehr dafür.',
    missing: 'Diese Zeichen kann die Schrift nicht gravieren: {list}',
    misfit:
      'Das Motiv ragt über den Rand (oder kommt ihm näher als 1 mm): Rohling {list}. Das Motiv kleiner machen oder diese Rohlinge antippen und auslassen.',
    accuracy: {
      title: 'Wie genau liegt das Motiv?',
      map: 'Vom Tisch-Bild: auf etwa 0,2–0,5 mm, bei dicken Rohlingen eher mehr.',
      measure: 'Mit der Kamera nachmessen (halten)',
      measureHint:
        'Die Kamera fährt über jeden Rohling und misst ihn in der Bildmitte: auf etwa 0,1 mm. Etwa {seconds} s je Rohling.',
      measuring: 'Messe Rohling {done} von {total} …',
      measured: '{count} von {total} nachgemessen: auf etwa 0,1 mm.',
      tooLarge: 'Größer als ein Kamerabild, Lage bleibt die vom Tisch-Bild: Rohling {list}.',
      unseen: 'Im Livebild nicht sicher erkannt, Lage bleibt die vom Tisch-Bild: Rohling {list}.',
      cameraOff: 'Zum Nachmessen die Kamera einschalten.',
    },
    zero: 'Kein Nullpunkt je Rohling: Das Programm liegt dort, wo die Rohlinge auf dem Tisch gefunden wurden – auch wenn der X/Y-Nullpunkt danach neu gesetzt wird. Nur Z0 muss auf der Oberfläche eines Rohlings stehen, deshalb alle gleich dick. Von Rohling zu Rohling fährt der Fräser {mm} mm über der Oberfläche.',
    make: 'Serie für {blanks} erzeugen',
    nothing: 'Kein Rohling zum Gravieren.',
    offline:
      'Ohne Verbindung zur Maschine lässt sich die Serie nicht erzeugen: Die Rohlinge liegen in Maschinenkoordinaten.',
    programName: '{name} Serie {count} Rohlinge',
    onTable: 'Auf dem Tisch liegt: {name}',
    made: 'Serie {name} für {blanks} erzeugt. Z0 gehört auf die Oberfläche eines Rohlings.',
    log: {
      found: 'Tisch-Bild: {count} Rohlinge gefunden, {refused} Stellen nicht übernommen.',
      measured: '{count} von {total} Rohlingen mit der Kamera nachgemessen.',
      measureCancelled: 'Nachmessen abgebrochen.',
      measureFailed: 'Nachmessen abgebrochen: Fahrbefehl nicht ausgeführt.',
      zeroMoved: 'Nullpunkt neu gesetzt: Serie neu berechnet, sie liegt weiter auf den Rohlingen.',
    },
  },
  sections: {
    title: 'In Abschnitten: {name}',
    stepsLabel: 'Ablauf in Abschnitten fräsen',
    steps: {
      cut: 'Abschnitt {n}',
      slide: 'Schieben',
    },
    intro:
      'Das Teil ist länger als der Tisch. Es wird in {count} Abschnitten gefräst und dazwischen {slides}-mal um etwa {slide} mm weitergeschoben ({direction}). Damit die App es danach wiederfindet, klebst du vor jedem Schieben zwei gedruckte Marker aufs Teil – die Passmarken. Die Kamera misst sie vor und nach dem Schieben; daraus ergibt sich, wie das Teil jetzt liegt.',
    direction: {
      x: 'in Richtung −X, auf dem Tisch-Bild nach links',
      y: 'in Richtung −Y, auf dem Tisch-Bild nach unten',
    },
    cutHint:
      'Abschnitt {n} von {total} fräst das Teil von {axis} {from} bis {to} mm. Wie jeden Job: Prüfen, dann Fräsen.',
    nothing: 'In diesem Abschnitt gibt es nichts zu fräsen – er kann als gefräst abgehakt werden.',
    seamNone:
      'Naht bei {axis} {at} mm (Strichpunktlinie auf dem Tisch-Bild): Dort wird kein Schnitt geteilt.',
    seamCuts:
      'Naht bei {axis} {at} mm (Strichpunktlinie auf dem Tisch-Bild): Dort enden {count} Schnitte und gehen im nächsten Abschnitt weiter, 1 mm überlappend. Was ganz in einen Abschnitt passt – Bohrungen, Buchstaben, kleine Taschen –, bleibt ganz.',
    load: 'Abschnitt {n} laden',
    otherJob: 'Geladen ist gerade ein anderes Programm, nicht Abschnitt {n}.',
    alreadyCut: 'Abschnitt {n} ist schon gefräst',
    alreadyCutHint:
      'Nur wenn er mit dem jetzigen Nullpunkt gefräst wurde: Von ihm aus rechnet die App weiter.',
    markCut: 'Weiter zum Schieben',
    found: 'Teil wiedergefunden: {mm} mm geschoben, {angle}° gedreht.',
    foundDistance: 'Der Abstand der Passmarken passt auf {error} mm.',
    findAgain: 'Passmarken neu finden',
    marks: {
      lead: 'Abschnitt {n} ist gefräst. Bevor das Teil weitergeschoben wird, braucht es Passmarken:',
      stick:
        'Zwei gedruckte Marker aufs Teil kleben – in den gelben Streifen auf dem Tisch-Bild, so weit auseinander wie möglich, flach und auf saubere Fläche.',
      stickFence:
        'Einen gedruckten Marker (besser zwei) aufs Teil kleben – in den gelben Streifen auf dem Tisch-Bild, flach und auf saubere Fläche.',
      hint: 'Dann „Passmarken einmessen“ halten: Die Kamera fährt den Streifen ab, bis sie die Marker sieht, und misst sie in der Bildmitte.',
      fence: 'Das Teil liegt an einem geraden Anschlag',
      fenceHint:
        'An einem Anschlag längs der Schieberichtung kann sich das Teil nicht verdrehen: Die App übernimmt dann nur die Verschiebung, und ein Marker genügt.',
      measure: 'Passmarken einmessen',
      measuring: 'Die Kamera sucht die Passmarken …',
      print: 'Marker drucken',
    },
    slide: {
      measuredTwo: 'Marker {a} und {b} eingemessen, {mm} mm auseinander.',
      measuredOne: 'Marker {a} eingemessen.',
      accuracy:
        'Am fernen Ende des nächsten Abschnitts, {reach} mm von den Passmarken, ist etwa ± {mm} mm zu erwarten; an der Naht etwa ± 0,2 mm.',
      accuracyFence:
        'Mit Anschlag ist etwa ± {mm} mm zu erwarten – und so gerade, wie der Anschlag ist.',
      weak: 'Das ist viel für ein Teil, das passen soll. Genauer wird es mit Markern, die weiter auseinander kleben („Passmarken neu einmessen“), oder mit einem geraden Anschlag längs der Schieberichtung.',
      how: {
        x: 'Teil etwa {mm} mm nach links schieben (Richtung −X).',
        y: 'Teil etwa {mm} mm nach vorn schieben (Richtung −Y).',
      },
      exact: 'Auf ein paar Zentimeter genau reicht – die Kamera misst nach.',
      loosen: 'Spannmittel lösen, Späne wegfegen. Die Marker bleiben kleben.',
      push: 'Teil etwa {mm} mm in Pfeilrichtung schieben und möglichst gerade wieder hinlegen.',
      pushFence: 'Teil etwa {mm} mm am Anschlag entlang schieben und fest andrücken.',
      clamp:
        'Wieder festspannen. Markierte Spannmittel, die jetzt woanders stehen, mit dem Werkzeug „Spannmittel“ nachziehen – unter „Prüfen“ werden sie gegen den nächsten Abschnitt geprüft.',
      z: 'Z-Null bleibt, solange das Teil auf derselben Unterlage liegt.',
      done: 'Teil ist weitergeschoben und fest',
      again: 'Passmarken neu einmessen',
    },
    find: {
      hint: 'Die Kamera fährt dorthin, wo die Passmarken jetzt liegen müssten, und misst sie nach. Daraus setzt die App den X/Y-Nullpunkt neu und lädt Abschnitt {n} so gedreht, wie das Teil liegt.',
      go: 'Passmarken finden',
      finding: 'Die Kamera sucht die Passmarken …',
      here: 'Hier suchen',
      notYet: 'Zurück: Das Teil ist noch nicht geschoben',
    },
    notReady:
      'Dafür muss die Maschine verbunden und in Ruhe sein und die Kamera eingerichtet (Maßstab, Kamerahöhe).',
    trouble: {
      noMarks:
        'Im gelben Streifen ist kein Marker zu sehen. Marker aufs Teil kleben („Marker drucken“ führt zur Druckseite) und noch einmal einmessen.',
      oneMark:
        'Nur Marker {n} gefunden. Einen zweiten aufkleben, weit weg vom ersten – oder das Teil an einen geraden Anschlag legen und das hier ankreuzen.',
      machine: 'Der X/Y-Nullpunkt ließ sich nicht setzen (Verbindung, Alarm?).',
      notThere:
        'Marker {n} ist nicht dort, wo er nach dem Schieben liegen müsste. Kamera mit dem Joystick über einen der Marker fahren und „Hier suchen“ halten.',
      missing: 'Eine Passmarke wurde nicht gelesen. Noch einmal suchen.',
      distance:
        'Die Passmarken liegen {mm} mm anders auseinander als vor dem Schieben: Ein Marker ist verrutscht, oder es ist ein anderer. So wird nicht weitergefräst. Noch einmal suchen; bleibt es dabei, den nächsten Abschnitt von Hand an schon Gefrästem ausrichten.',
      turned:
        'Marker {n} klebt anders auf dem Teil als vor dem Schieben. So wird nicht weitergefräst. Noch einmal suchen; bleibt es dabei, den nächsten Abschnitt von Hand an schon Gefrästem ausrichten.',
      'one-mark':
        'Mit einem Marker allein geht es nur an einem geraden Anschlag. „Zurück“ und einen zweiten Marker einmessen – das geht nur, solange das Teil noch nicht geschoben ist.',
      fence:
        'Die Passmarken zeigen das Teil um {deg}° verdreht: Es liegt nicht am Anschlag an. Andrücken und noch einmal suchen.',
    },
    refused: {
      title: 'In Abschnitten fräsen geht so nicht',
      'start-outside':
        'Der Anfang des Jobs liegt außerhalb des Verfahrwegs. Teil und Nullpunkt so legen, dass der Anfang erreichbar ist – das Ende darf überstehen.',
      travel: 'Der Verfahrweg ist zu kurz, um ein Teil darauf weiterzuschieben.',
      'no-seam':
        'Es gibt keine Stelle für eine Naht, die nicht durch einen Haltesteg ginge. Haltestege versetzen oder das Teil anders auflegen.',
      empty: 'Der Job fräst nichts.',
      fits: 'Der Job passt in den Verfahrweg.',
      outside: 'Der Job ließ sich nicht teilen.',
      unsupported: 'Das Programm benutzt {what}. Das lässt sich nicht in Abschnitte teilen.',
      what: {
        errors: 'Zeilen mit Fehlern',
        G91: 'Kettenmaße (G91)',
        G93: 'Vorschub als Zeit (G93)',
        'absolute-arcs': 'absolute Kreismittelpunkte (G90.1)',
        G18: 'Kreisbögen in einer anderen Ebene (G18/G19)',
        offsets: 'eigene Nullpunkt-Verschiebungen (G10, G92, G43.1)',
        probe: 'Antasten (G38)',
        wcs: 'mehrere Nullpunkte (G55–G59)',
        rotary: 'die Drehachse',
        'no-z': 'keine Höhe über dem Schnitt, auf der sich fahren ließe',
      },
      close: 'Schließen',
    },
    done: 'Alle {count} Abschnitte sind gefräst.',
    close: 'Abschließen',
    discard: 'Doch nicht in Abschnitten',
    cancel: 'Abschnitte abbrechen',
    table: {
      seam: 'Naht',
      seamCuts: 'Naht · teilt {count} Schnitte',
      zone: 'Passmarken hierhin',
      mark: 'Passmarke {n}',
    },
    log: {
      made: 'In {count} Abschnitte geteilt; dazwischen wird das Teil um etwa {slide} mm weitergeschoben.',
      undone: 'Der Nullpunkt wurde versetzt: Der Job ist wieder am Stück geladen.',
      failed: 'Passmarken: Das hat nicht geklappt – der Reiter Job sagt, warum.',
      marks: '{count} Passmarke(n) eingemessen – jetzt das Teil weiterschieben (Reiter Job).',
      found:
        'Teil wiedergefunden ({mm} mm geschoben, {angle}° gedreht): Abschnitt {n} ist geladen.',
      cut: 'Abschnitt {n} fertig – jetzt Passmarken aufkleben und das Teil weiterschieben (Reiter Job).',
      allDone: '{name}: Alle Abschnitte sind gefräst.',
    },
  },
  jigs: {
    title: 'Vorrichtungen mit Markern',
    intro:
      'Eine Vorrichtung, die du immer wieder benutzt – ein Rahmen für Untersetzer, ein Anschlag für Brettchen –, bekommt einen Marker: ein gedrucktes Kennzeichen, das die Kamera lesen kann. Einmal anlernen; danach erkennt die App die Vorrichtung, wo immer sie auf dem Tisch liegt, lädt ihren Job und setzt den X/Y-Nullpunkt – ohne Messen.',
    empty: 'Noch keine Vorrichtung angelernt.',
    tagOne: 'Marker {n}',
    tagMany: 'Marker {list} und {last}',
    teach: 'Vorrichtung anlernen',
    notNow: 'Nicht jetzt',
    cancel: 'Abbrechen',
    found: 'Vorrichtung „{name}“ erkannt',
    offerOne:
      'Die Kamera fährt über den Marker und misst ihn in der Bildmitte nach. Dann wird der X/Y-Nullpunkt gesetzt und der Job „{file}“ geladen – so gedreht, wie die Vorrichtung liegt.',
    offerTwo:
      'Die Kamera fährt über beide Marker und misst sie in der Bildmitte nach. Dann wird der X/Y-Nullpunkt gesetzt und der Job „{file}“ geladen – so gedreht, wie die Vorrichtung liegt.',
    offerZ:
      'Der Fräser muss dabei frei über die Vorrichtung kommen. Die Höhe kennt ein Marker nicht: Den Z-Nullpunkt setzt du danach wie gewohnt.',
    measure: 'Einmessen und Job laden',
    notReady:
      'Zum Einmessen muss die Maschine verbunden sein und stillstehen, die Kamera eingeschaltet und eingerichtet.',
    measuring: 'Die Kamera misst Marker {n} von {total} …',
    placedTitle: 'Vorrichtung „{name}“ eingemessen',
    placed: 'X/Y-Nullpunkt aus dem Marker gesetzt, Job um {angle}° mitgedreht.',
    accuracy: 'Am fernsten Punkt des Jobs ({reach} mm entfernt) ist mit etwa ± {mm} mm zu rechnen.',
    oneTagWeak:
      'Ein einzelner kleiner Marker gibt den Winkel nur grob. Für diesen Job besser einen zweiten Marker weit entfernt aufkleben und neu anlernen.',
    oneTagFine: 'Für diesen Job reicht ein Marker.',
    twoTags: 'Zwei Marker weit auseinander geben auch den Winkel genau.',
    zNext: 'Als Nächstes: Z-Nullpunkt auf dem Werkstück setzen.',
    toZ: 'Z-Nullpunkt setzen',
    stale: {
      unmeasured: 'Vorrichtung „{name}“ ist noch nicht eingemessen',
      moved: 'Vorrichtung „{name}“ liegt woanders als beim Einmessen',
      zeroMoved: 'Vorrichtung „{name}“: Der Nullpunkt wurde seitdem verschoben',
      turned: 'Vorrichtung „{name}“: Der Job wurde seitdem gedreht oder verschoben',
    },
    unseen:
      'Die Kamera hat {tags} noch nicht gesehen. Mit der Kamera über den Marker fahren oder den Tisch scannen – dann erscheint hier „Einmessen und Job laden“.',
    unknownOne: '{tags} gesehen – er gehört noch zu keiner Vorrichtung.',
    unknownMany: '{tags} gesehen – sie gehören noch zu keiner Vorrichtung.',
    trouble: {
      notReady:
        'Einmessen geht gerade nicht: Ist die Maschine verbunden und steht still? Ist die Kamera an und eingerichtet?',
      unseen:
        'Kein Marker dieser Vorrichtung ist zu sehen. Mit der Kamera über den Marker fahren oder den Tisch scannen.',
      notThere:
        'Marker {n} ist nicht dort, wo er zuletzt gesehen wurde. Mit der Kamera über den Marker fahren oder den Tisch neu scannen.',
      refused: 'Dort liegt etwas wie ein Marker, wird aber nicht genommen. {why}',
      distance:
        'Die beiden Marker liegen anders auseinander als beim Anlernen (mehr als 1 mm). Ist ein Marker verrutscht – oder ist es eine andere Vorrichtung? Dann neu anlernen.',
      turned:
        'Marker {n} klebt anders auf der Vorrichtung als beim Anlernen. Wurde er neu aufgeklebt, die Vorrichtung neu anlernen.',
      machine:
        'Die Maschine hat die Fahrt oder das Setzen des Nullpunkts nicht ausgeführt – siehe Protokoll.',
      cancelled: 'Einmessen abgebrochen.',
    },
    refused: {
      cut: 'Er ist am Bildrand abgeschnitten.',
      blurred:
        'Er ist unscharf: Steht die Kamera auf ihrer Höhe über dem Marker? Ist die Linse sauber?',
      faint:
        'Schwarz und Weiß heben sich zu wenig ab: mehr Licht, matt drucken, nichts Glänzendes darüber.',
      tilted: 'Er liegt nicht flach oder wird schräg gesehen: flach aufkleben.',
      size: 'Seine Größe ({mm} mm) passt zu keiner Druckgröße: Hat der Drucker skaliert, oder steht die Kamera nicht auf ihrer Höhe über dem Marker?',
      unreadable:
        'Sein Muster ist nicht lesbar: verschmutzt, verdeckt – oder kein Marker von hier.',
    },
    short: {
      cut: 'Marker am Bildrand',
      blurred: 'Marker unscharf',
      faint: 'Marker zu blass',
      tilted: 'Marker liegt schräg',
      size: 'Marker: Größe passt nicht',
      unreadable: 'Marker nicht lesbar',
    },
    teachSteps: {
      label: 'Schritte beim Anlernen',
      setup: 'Einrichten',
      measure: 'Marker einmessen',
      name: 'Benennen',
    },
    teachHow:
      'Alles einmal einrichten wie immer: Vorrichtung auf den Tisch, Job laden, Nullpunkt setzen, Spannmittel markieren, falls es welche gibt. Der Marker klebt flach auf der Vorrichtung.',
    check: {
      job: 'Job „{file}“ ist geladen',
      noJob: 'Zuerst den Job laden, der zur Vorrichtung gehört',
      zero: 'X/Y-Nullpunkt ist gesetzt',
      noZero: 'X/Y-Nullpunkt auf der Vorrichtung setzen',
      toZero: 'Nullpunkt',
      camera: 'Kamera ist an und eingerichtet',
      cameraOff: 'Kamera einschalten',
      cameraOn: 'Einschalten',
      noCamera: 'Kamera einrichten (Maßstab und Versatz)',
      toCamera: 'Einrichten',
      tags: 'Die Kamera sieht {tags}',
      noTags: 'Noch kein Marker gesehen: mit der Kamera über den Marker fahren',
      searchMap: 'Auf dem Tisch-Bild suchen',
    },
    pickLabel: 'Marker dieser Vorrichtung',
    pickHint: 'Angetippt heißt: gehört zu dieser Vorrichtung. Höchstens zwei.',
    teachMeasure: 'Marker einmessen',
    measuredOne: '{tags} eingemessen.',
    measuredTwo: '{tags} eingemessen, {mm} mm auseinander.',
    name: 'Name der Vorrichtung',
    namePlaceholder: 'z. B. Untersetzer-Rahmen',
    keeps:
      'Gespeichert werden der Job „{file}“ und wo sein X/Y-Nullpunkt auf der Vorrichtung liegt.',
    keepsClamps: 'Dazu {count} markierte(s) Spannmittel – sie wandern mit der Vorrichtung mit.',
    save: 'Vorrichtung speichern',
    onTable: 'liegt auf dem Tisch',
    rowOne: '{tags} ({size} mm)',
    rowTwo: '{tags} ({size} mm), {mm} mm auseinander',
    rowAccuracy: 'etwa ± {mm} mm',
    loadJob: 'Job laden',
    rename: 'Umbenennen',
    renameOk: 'OK',
    remove: 'Löschen',
    log: {
      placed: 'Vorrichtung „{name}“ eingemessen: X/Y-Nullpunkt gesetzt, Job um {angle}° gedreht.',
      failed: 'Vorrichtung „{name}“ konnte nicht eingemessen werden.',
      cancelled: 'Einmessen abgebrochen.',
      taught: 'Vorrichtung „{name}“ angelernt.',
    },
    print: {
      open: 'Marker drucken',
      title: 'Marker drucken',
      size: 'Größe',
      count: 'Anzahl',
      first: 'Ab Nummer',
      name: 'Name (wird dazugedruckt)',
      namePlaceholder: 'z. B. Untersetzer-Rahmen',
      sizeHint:
        '40 mm passt für die meisten Vorrichtungen. Ein größerer Marker gibt den Winkel genauer, ein kleiner passt auf schmale Leisten. Er muss ganz in ein Kamerabild passen.',
      print: 'Drucken',
      close: 'Schließen',
      pageTitle: 'Marker für Vorrichtungen',
      caption: 'Marker {n} · {size} mm',
      ruler:
        'Diese Linie muss {mm} mm lang sein. Ist sie es nicht, hat der Drucker skaliert: mit 100 % („Tatsächliche Größe“) drucken.',
      inUse: 'gehört schon zu einer Vorrichtung',
      svg: 'Als SVG speichern',
      hintScale: 'Nach dem Drucken die Linie oben mit dem Lineal nachmessen.',
      hintPaper:
        'Auf mattem Papier oder einem matten Etikett drucken. Kein glänzendes Klebeband darüber: Spiegelungen machen den Marker unlesbar.',
      hintWhere:
        'Mit dem weißen Rand ausschneiden und flach auf die Vorrichtung kleben, möglichst auf Höhe der Werkstück-Oberfläche – dorthin, wo weder Fräser noch Spannmittel hinkommen und Späne ihn nicht zudecken.',
      hintTwo:
        'Für große Vorrichtungen zwei Marker mit verschiedenen Nummern, so weit auseinander wie möglich: Dann stimmt auch der Winkel genau.',
    },
  },
  accuracy: {
    step1Again: 'Prüfmuster noch einmal fräsen',
    step2Again: 'Neu messen und eintragen',
    blocked:
      'Korrektur geschrieben. Jetzt die Steuerung neu starten und referenzieren – erst danach das Prüfmuster noch einmal fräsen. Ein Muster aus der Zeit davor zeigt noch den alten Fehler, und eine zweite Korrektur darauf würde doppelt wirken.',
    nowControl:
      'Die Maschine wurde neu referenziert. Jetzt das Prüfmuster noch einmal fräsen, neu messen und eintragen – dann stehen Vorher und Nachher nebeneinander.',
    discardBefore: 'Neue Prüfung beginnen (Vorher verwerfen)',
    steps: {
      title: 'Ablauf',
      cut: 'Prüfmuster fräsen',
      measure: 'Messen und eintragen',
      evaluate: 'Auswerten',
      write: 'Korrektur schreiben',
      restart: 'Steuerung neu starten und referenzieren',
      cut2: 'Prüfmuster noch einmal fräsen',
      measure2: 'Neu messen und eintragen',
      evaluate2: 'Auswerten – Vorher und Nachher',
      now: 'jetzt',
    },
    sketch: {
      label: 'Prüfmuster von oben: die Marken A bis D und die sechs Strecken, die gemessen werden',
      front: 'vorne (Bediener)',
      back: 'hinten',
      selfCheck:
        'Gegenprobe: In der Jog-Anzeige läuft +X von A nach B (nach rechts) und +Y von A nach D (nach hinten). A ist vorne links, dort steht der Nullpunkt.',
    },
    compare: {
      title: 'Vorher und Nachher',
      before: 'Vorher',
      after: 'Nachher',
      lean: 'Rechtwinkligkeit (mm auf 1 m Y)',
    },
    verdict: {
      good: 'Fertig: Die Maschine ist innerhalb der Messgenauigkeit des Lineals rechtwinklig (etwa 0,3 mm auf einen Meter). Nichts mehr zu korrigieren.',
      better:
        'Besser: Der Fehler ist deutlich kleiner geworden. Wenn nötig, mit diesen neuen Messwerten einmal nachkorrigieren.',
      unchanged:
        'Fast unverändert: Die Korrektur hat nicht gewirkt. Wurde die Steuerung neu gestartet und referenziert, und das Prüfmuster erst danach gefräst?',
      doubled:
        'Etwa doppelt so groß, auf derselben Seite: Die Korrektur ging in die falsche Richtung. Y-Motor 1 sitzt auf der anderen Seite – Seite umstellen und mit diesen Werten erneut korrigieren.',
      overshot:
        'Zu viel korrigiert: Der Fehler steht jetzt auf der anderen Seite. Prüfen, ob der Schienenabstand zu groß eingetragen ist, und noch einmal korrigieren.',
    },
    gantry: {
      label:
        'Die Maschine von oben: die zwei Y-Schienen, das Portal dazwischen, der Schienenabstand und die Seite von Y-Motor 1',
      distance: 'Abstand der Y-Schienen',
      railLeft: 'Schiene links',
      railRight: 'Schiene rechts',
      gantry: 'Portal',
      help: 'Von Mitte Schiene links bis Mitte Schiene rechts gemessen, dort, wo die Motoren das Portal schieben. Ein Fehler von 1 % hier ist ein Fehler von 1 % der Korrektur.',
      motorHelp:
        'Welche Seite hängt an Y-Motor 1 (Anschluss A am Jackpot)? Von vorn gesehen, Blick nach hinten (+Y): links ist X−, rechts ist X+. Im Bild ist Motor 1 ausgefüllt und mit „1“ beschriftet, der andere trägt die „2“.',
    },
    story: {
      lean: 'Das Portal steht schief: Die Seite {side} steht um {mm} mm weiter hinten (+Y) als die andere Seite – bei {width} mm Schienenabstand. Auf einen Meter Y sind das {per} mm.',
      leanNoWidth:
        'Das Portal steht schief: Die Seite {side} steht weiter hinten (+Y) als die andere Seite – auf einen Meter Y sind das {per} mm. Für die Korrektur den Schienenabstand angeben.',
      moveFront:
        'Die Korrektur setzt beim nächsten Referenzieren die Seite X+ um {mm} mm nach vorne (−Y) gegenüber X− – auf beide Motoren verteilt, je zur Hälfte.',
      moveBack:
        'Die Korrektur setzt beim nächsten Referenzieren die Seite X+ um {mm} mm nach hinten (+Y) gegenüber X− – auf beide Motoren verteilt, je zur Hälfte.',
      side: { xMin: 'links (X−)', xMax: 'rechts (X+)' },
    },
    title: 'Genauigkeits-Check mit Lineal',
    intro:
      'Die Maschine fräst vier Markierungen in ein Rechteck, du misst Seiten und Diagonalen mit Stahllineal, Maßband oder Messschieber. Daraus rechnet die App Maßstab X/Y und Rechtwinkligkeit. Nachmessen mit der eigenen Kamera ginge nicht: Die Markierungen tragen die Fehler der Maschine schon in sich.',
    step1: '1. Prüfmuster fräsen',
    size: {
      x: 'Breite X (mm)',
      y: 'Höhe Y (mm)',
    },
    depth: 'Tiefe (mm)',
    cutHint:
      'Groß wählen (z. B. 500 × 400 auf einer planen Platte), Nullpunkt vorne links. Läuft wie jeder Job: Prüfen, Fräsen.',
    cut: 'Als Job laden',
    loaded: 'Prüfmuster {name} geladen.',
    step2: '2. Messen und eintragen',
    measureHint:
      'Immer von derselben Kante messen (linke Kante zu linker Kante, vordere zu vorderer) – das ist der Abstand der Mitten. Auf 0,1 mm, wenn es das Werkzeug hergibt.',
    fields: {
      bottom: 'A → B, vorne (X)',
      top: 'D → C, hinten (X)',
      left: 'A → D, links (Y)',
      right: 'B → C, rechts (Y)',
      diagonalAC: 'Diagonale A → C',
      diagonalBD: 'Diagonale B → D',
    },
    evaluate: 'Auswerten',
    implausible: 'Die Maße passen nicht zu einem Rechteck – Werte und Zuordnung A–D prüfen.',
    result: 'Ergebnis',
    fit: 'Messungen passen',
    fitValue: 'auf ±{mm} mm zusammen',
    trapezoid:
      'Gegenüberliegende Seiten unterscheiden sich um {mm} mm – das Portal verwindet sich oder ein Riemen ist anders gespannt. Erst mechanisch prüfen; die Werte sind dann nur Mittelwerte.',
    badFit:
      'Seiten und Diagonalen passen schlecht zusammen – vermutlich ein Messfehler. Lieber noch einmal messen, bevor du korrigierst.',
  },
  photomap: {
    hint: 'Jedes Kamerabild wird an der Stelle abgelegt, an der es aufgenommen wurde. Die Karte wächst beim Herumfahren auf Kamerahöhe – oder per Scan.',
    tiles: 'Bilder auf der Karte: {count}',
    empty: 'Noch keine Bilder auf der Karte.',
    clear: 'Karte leeren',
    cleared: 'Fotokarte geleert.',
    calibrationChanged: 'Kamera-Kalibrierung geändert – Fotokarte geleert.',
    noCamera: 'Kamera einschalten (Gerätekamera oder Companion-Stream).',
    uncalibrated:
      'Kamera nicht kalibriert: Der Maßstab ist noch nicht gemessen, ohne ihn landen die Bilder an falscher Stelle. Unter Maschine → Einrichtung → Kamera einrichten den Maßstab messen (legt auch die Kamerahöhe fest), danach den Versatz, damit „Kamera/Fräser hierhin“ trifft.',
    offHeight:
      'Nicht auf Kamerahöhe ({mm} mm daneben) – es kommen keine neuen Bilder auf die Karte.',
    notConnected: 'Zum Scannen zuerst verbinden.',
    scanTitle: 'Fläche scannen',
    scanHint:
      'Bereich in Werkstück-Koordinaten. Ohne Y-Achse: Y von = Y bis setzen, dann entsteht ein Streifen entlang X.',
    fromX: 'X von (mm)',
    toX: 'X bis (mm)',
    fromY: 'Y von (mm)',
    toY: 'Y bis (mm)',
    areaFromJob: 'Bereich vom Job übernehmen',
    estimate: '{count} Bilder, etwa {minutes} min',
    scan: 'Fläche scannen (halten)',
    scanning: 'Scan läuft: Bild {done} von {total}, noch etwa {minutes} min',
    cancel: 'Scan abbrechen',
    scanDone: 'Scan fertig: {count} Bilder auf der Karte.',
    scanCancelled: 'Scan abgebrochen nach {count} Bildern.',
    scanFailed: 'Scan abgebrochen: Fahrbefehl nicht ausgeführt.',
    scanHeld: 'Scan abgebrochen: Die Steuerung wurde angehalten (Pause oder Alarm).',
    scanLost: 'Scan abgebrochen: Die Verbindung zur Steuerung ist abgerissen.',
    stripsNeedPixels:
      'Das Kamerabild lässt sich nicht auslesen (Stream ohne Freigabe) – der Scan läuft mit Halt für jedes Bild.',
    stripsGiveUp:
      'Auf diesem Tisch ist zu wenig Struktur, um die Bilder der Fahrt einzupassen – der Rest wird mit Halt gescannt.',
    stripsSkipped:
      'Die Fahrt hat auf diesem Tisch nicht getaugt (zu wenig Struktur) – es geht mit Halt. „In Fahrt“ erneut wählen, um es noch einmal zu versuchen.',
    stripsRefill:
      'Nach der Fahrt fehlen Stellen (zu wenig Struktur zum Einpassen, oder ein Streifen war zu kurz): {count} Bilder werden mit Halt nachgeholt.',
    mode: 'Art des Scans',
    modes: { strips: 'In Fahrt (schnell)', stops: 'Mit Halt (genau)' },
    modeHint:
      'In Fahrt: die Kamera fährt in Streifen, ohne anzuhalten; die Bilder werden an ihrer Überlappung eingepasst. Mit Halt: ein Bild nach dem anderen, jedes im Stillstand.',
    tempo: 'Tempo der Fahrt',
    tempos: { gentle: 'Sanft', normal: 'Normal', fast: 'Schnell' },
    tempoHint:
      'Je schneller, desto mehr Bewegungsunschärfe – bei wenig Licht oder feinen Strukturen langsamer fahren.',
    estimateStrips: '{count} Streifen, etwa {minutes} min',
    estimateCompare: 'Mit Halt wären es {count} Bilder, etwa {minutes} min.',
    scanningStrips: 'Scan läuft: Streifen {done} von {total}, noch etwa {minutes} min',
    stripsTooSlow:
      'Bei dieser Belichtung wäre die Fahrt langsamer als {speed} mm/s – dann geht es mit Halt schneller. Der Scan läuft mit Halt für jedes Bild.',
    exposure: 'Belichtung (ms)',
    exposureHint:
      'Wie lange die Kamera ein Bild belichtet (0 = unbekannt, dann gibt es keine Begrenzung). Daraus folgt das schnellste Tempo, bei dem ein Bild nicht mehr als 0,3 mm verwischt.',
    blur: 'Unschärfe bei diesem Tempo etwa {mm} mm',
    capped: 'Tempo auf {speed} mm/s begrenzt, damit ein Bild nicht mehr als 0,3 mm verwischt.',
    tooSlow:
      'Bei dieser Belichtung wäre die Fahrt langsamer als {speed} mm/s – mit Halt geht es schneller.',
    clockFallback:
      'Die Zeitstempel des Pi werden nicht genutzt: {why}. Die Bilder der Fahrt werden nach der Uhr dieser Seite abgelegt.',
    clockLost:
      'Die Uhr des Pi ist während des Scans weggefallen: {why}. Die Fahrt endet hier, der Rest wird mit Halt gescannt.',
    // Why the Pi's clock was not taken when the scan chose its clock (before anything moved)
    clockWhy: {
      relay:
        'die Meldungen der Steuerung kommen ohne Zeitstempel des Pi (nicht über den Pi verbunden, oder ein älterer Companion)',
      device: 'die Kamera ist kein Stream des Pi (Gerätekamera oder keine Adresse)',
      stream: 'der Kamera-Stream lässt sich von dieser Seite nicht mit Zeitstempeln lesen',
      noDecode:
        'die Bilder des Kamera-Streams lassen sich in diesem Browser nicht in Pixel verwandeln',
      window:
        'die Zeitstempel der Kamerabilder liegen in einer anderen Uhr als die der Meldungen (mehr als 3 s Unterschied)',
    },
    // What more is known of a stream that could not be read (its failure code; the code itself stays beside it, small)
    clockDetail: {
      'no-fetch': 'dieser Browser kann den Stream nicht selbst abrufen',
      unreachable:
        'der Kamera-Server antwortet nicht, oder der Browser erlaubt dieser Seite das Lesen nicht (CORS)',
      'no-response':
        'der Kamera-Server antwortet nicht rechtzeitig (eine Kamera, die nur einen Zuschauer bedient, lässt eine zweite Verbindung warten)',
      'http-status': 'der Kamera-Server antwortet mit einem Fehler',
      'no-body-stream':
        'dieser Browser liest einen Datenstrom nicht stückweise (manche Safari-Versionen)',
      'not-multipart': 'die Adresse liefert keinen Bilderstrom (Motion-JPEG)',
      'bad-stream': 'der Bilderstrom ist fehlerhaft aufgebaut',
      silent: 'der Kamera-Server schickt keine Bilder',
      offline: 'die Kamera ist nicht da (der Server schickt nur Platzhalterbilder)',
      'no-stamp': 'die Bilder tragen keinen Zeitstempel, den die App lesen kann',
      ended: 'der Kamera-Server hat den Strom beendet',
      'read-failed': 'das Lesen des Stroms ist abgebrochen',
      closed: 'der Strom wurde geschlossen',
    },
    // Why the Pi's clock went away in the middle of a scan
    clockLostWhy: {
      relay: 'die Meldungen der Steuerung kommen nicht mehr mit dem Zeitstempel des Pi',
      stream: 'der Kamera-Stream ist abgerissen oder liefert keine neuen Bilder mehr',
      window:
        'die Zeitstempel der Kamerabilder liegen nicht mehr in der Uhr der Meldungen (mehr als 3 s Unterschied)',
    },
    clock: {
      title: 'Uhr des letzten Scans in Fahrt',
      pi: 'Pi – Meldungen und Kamerabilder tragen den Zeitstempel des Pi: {source}, gemessen in der {domain}.',
      domains: { mono: 'Monotonuhr', wall: 'Echtzeituhr' },
      // The header of the camera server the stamp is read from (the header's own name stays beside it, small)
      sources: {
        'x-ustreamer-grab-begin-time': 'Aufnahmezeit des Kameratreibers (Anfang)',
        'x-ustreamer-grab-time': 'Aufnahmezeit des Kameratreibers',
        'x-ustreamer-grab-end-time':
          'Zeit nach dem Holen des Bildes (etwas später als die Aufnahme)',
        'x-timestamp': 'Sendezeit des Kamera-Servers (die ungenaueste Wahl)',
        other: 'Zeit aus einer Kopfzeile des Kamera-Servers',
      },
      code: 'Code: {code}',
      browser:
        'Browser – Meldungen und Bilder liegen dort, wo diese Seite sie zuerst sah (später und ungleichmäßiger als die Zeit auf dem Pi).',
      why: 'Grund: {why}.',
      lost: 'Die Uhr des Pi fiel während des Scans weg: {why}.',
      noise: 'Zeitrauschen der Uhr: etwa {ms} ms.',
    },
    trace: {
      label: 'Scan für die Auswertung aufzeichnen',
      hint: 'Speichert die Kamerabilder, die Zeitpunkte und die Meldungen der Steuerung zu den Scans in einer Datei (bis etwa 40 MB). Sie enthält Fotos deines Tisches. Nichts davon geht irgendwohin, bis du die Datei weitergibst. Mit Aufzeichnung gibt die Fahrt nicht auf, auch wenn die Bilder sich schlecht einpassen lassen.',
      packing: 'Aufzeichnung wird verpackt: noch {count} Bilder …',
      have: 'Aufgezeichnet: {count} Scans, {mb} MB',
      save: 'Aufzeichnung speichern',
      discard: 'Aufzeichnung verwerfen',
    },
  },
  recording: {
    title: 'Mitschnitt',
    hint: 'Der Pi nimmt die Fräser-Kamera während des Jobs auf – auch wenn das Tablet schläft.',
    auto: 'Bei jedem Job automatisch aufnehmen',
    mode: 'Art der Aufnahme',
    modes: { timelapse: 'Zeitraffer', video: 'Video', both: 'Beides' },
    interval: 'Zeitraffer: Bild alle … Sekunden',
    safeHeight: 'Zeitraffer nur auf Sicherheitshöhe (gleich scharf, gleich groß)',
    safeHeightNeedsRelay:
      'Nur möglich, wenn die Maschine über den Companion verbunden ist – er muss Z sehen.',
    videoSize: 'Video: etwa 1–2 GB pro Stunde.',
    startNow: 'Jetzt aufnehmen',
    stopNow: 'Aufnahme beenden',
    running: 'Aufnahme läuft seit {time} ({mode}, {frames} Bilder)',
    started: 'Mitschnitt auf dem Pi gestartet.',
    stopped: 'Mitschnitt beendet.',
    startFailed: 'Mitschnitt nicht gestartet: {reason}',
    errors: {
      noFfmpeg: 'ffmpeg fehlt auf dem Pi.',
      diskFull: 'Weniger als 1 GB frei auf der SD-Karte des Pi.',
      already: 'Es läuft schon eine Aufnahme.',
    },
    list: 'Aufnahmen',
    none: 'Noch keine Aufnahmen.',
    item: '{date} · {duration}',
    states: {
      recording: 'nimmt auf',
      encoding: 'wird erstellt …',
      done: 'fertig',
      failed: 'fehlgeschlagen',
    },
    reasons: {
      app: '',
      idle: 'Job-Ende erkannt',
      'max-duration': 'nach 8 Stunden beendet',
      disk: 'SD-Karte fast voll',
      interrupted: 'unterbrochen (Strom weg?)',
      error: 'Fehler',
    },
    watchTimelapse: 'Zeitraffer ansehen',
    watchVideo: 'Video ansehen',
    download: 'Herunterladen',
    remove: 'Löschen (halten)',
    close: 'Schließen',
    noCompanion:
      'Ohne Companion nimmt der Browser einen Zeitraffer auf – das Tablet muss dabei wach bleiben und die Kamera offen sein.',
    outdated:
      'Die Companion-Version auf dem Pi kann noch nicht aufnehmen: neue Version installieren (setup.sh erneut ausführen). Bis dahin nimmt der Browser einen Zeitraffer auf.',
    noFfmpeg:
      'ffmpeg fehlt auf dem Pi. Den Pi einmal mit dem Internet verbinden (LAN-Kabel an den Heim-Router) und setup.sh erneut ausführen. Bis dahin nimmt der Browser einen Zeitraffer auf.',
    browserOn: 'Zeitraffer im Browser bei jedem Job',
  },
  find: {
    open: 'Suchen',
    openHint: 'Schnellsuche: jede Funktion finden, auch mit einem anderen Wort',
    title: 'Schnellsuche',
    placeholder: 'Was suchst du? z. B. Nullpunkt, Zwinge, DXF …',
    results: 'Treffer',
    quick: 'Schnellzugriff',
    recent: 'Zuletzt benutzt',
    none: 'Nichts gefunden für „{query}“. Ein anderes Wort probieren – oder hier weiter:',
    safety: 'Die Suche führt nur hin. Sie fährt nichts und startet nichts.',
    close: 'Schließen',
    needs: {
      program: 'zeigt sich mit einem geladenen Programm',
      expert: 'nur mit Expertenfunktionen',
      series: 'ausgeblendet – einschalten unter Einstellungen · Maschine · Funktionen',
      jigs: 'ausgeblendet – einschalten unter Einstellungen · Maschine · Funktionen',
      macros: 'ausgeblendet – einschalten unter Einstellungen · Maschine · Funktionen',
    },
    places: {
      stage: 'Bühne',
      top: 'Statusleiste',
      nav: 'Navigation',
      bar: 'Aktionsleiste',
    },
    shortcuts: {
      title: 'Tastenkürzel',
      hint: 'Tastenkürzel: ? drücken',
      intro:
        'Die Tasten gelten, solange in kein Feld getippt wird. Keine davon startet einen Job; gefahren wird nur mit den Pfeiltasten bei offenem Jog-Feld.',
      groups: {
        general: 'Allgemein',
        machine: 'Maschine',
        view: 'Ansicht',
        drawing: 'Zeichnen',
        drive: 'Fahren',
      },
      notes: {
        drawing: 'Solange die Zeichnung offen ist.',
        drive: 'Nur bei offenem Jog-Feld, mit der Schrittweite dort.',
      },
      or: 'oder',
    },
    keys: {
      palette: 'Schnellsuche öffnen',
      shortcuts: 'Tastenkürzel zeigen',
      pause: 'Pause: Vorschub halten, solange sich etwas bewegt',
      abort: 'Job abbrechen (mit Rückfrage)',
      jogStep: 'Schrittweite: 0,01 · 0,1 · 1 · 10 mm · Dauerlauf',
      stageTable: 'Ansicht Tisch',
      stageCamera: 'Ansicht Kamera',
      stage3d: 'Ansicht 3D',
      fit: 'Einpassen',
      camDelete: 'Auswahl löschen',
      camNudge: 'Auswahl um 1 mm schieben',
      camNudgeFar: 'um 10 mm schieben',
      camNudgeFine: 'um 0,1 mm schieben',
      camUndo: 'Rückgängig',
      camRedo: 'Wiederholen',
      camDuplicate: 'Kopie daneben legen',
      camCopy: 'Kopieren und einfügen',
      camAll: 'Alles auswählen',
      camDeselect: 'Auswahl loslassen',
      camTapAdd: 'Teil in die Auswahl nehmen oder herausnehmen (ohne „Mehrfachauswahl“)',
      camBandAdd: 'Rahmen aufziehen: zur Auswahl hinzufügen',
      camSnapOff: 'Teil ziehen ohne Einrasten (Fangen für diesen Zug aus)',
      jogXY: 'X und Y fahren',
      jogZ: 'Z heben und senken',
      jogStop: 'Fahrt anhalten',
      jogWheel: 'Feinjog der zuletzt bewegten Achse',
    },
    caps: {
      mod: 'Strg',
      modMac: '⌘',
      shift: 'Umschalt',
      alt: 'Alt',
      del: 'Entf',
      backspace: 'Rück',
      esc: 'Esc',
      arrows: 'Pfeiltasten',
      pageUp: 'Bild ↑',
      space: 'Leertaste',
      pageDown: 'Bild ↓',
      wheel: 'Mausrad (Taste gehalten)',
      tap: 'Tippen',
      drag: 'Ziehen',
    },
    // What else a function is found by: other names, wrong names, jargon.
    words: {
      placeToollist:
        'bereich werkzeugliste, werkzeugverwaltung, werkzeuge pflegen, werkzeuge anlegen, materialliste, bibliothek',
      placeService:
        'service, diagnose, wartung, fehlersuche, test, log, verlauf, service und diagnose',
      placeSettings:
        'einstellungen, zahnrad, optionen, konfiguration, setup, settings, maschine einstellen, preferences',
      placeConsole: 'konsole, terminal, mdi, g-code senden, befehl, rohlog, kommandozeile, console',
      pause:
        'pause, pausieren, anhalten, halten, vorschub halten, feed hold, stopp, unterbrechen, leertaste, hold',
      messages:
        'meldungen, meldung, fehler, hinweise, warnungen, flagge, benachrichtigung, störung, messages, meldungszentrum',
      placeStart:
        'start, startseite, dashboard, übersicht, home, anfang, was als nächstes, hauptseite',
      placeJob: 'job, auftrag, programm, was mache ich, datei, werkstück, material',
      placeCam: 'cam bereich, zeichenbereich, cam öffnen, bereich zeichnen',
      placeSetup:
        'einrichten, schritt 3, wo liegt das werkstück, nullpunkt, antasten, fahren, ausrichten, setup',
      placeRun: 'fräsen, fertigen, starten, start, laufen, job starten, run, cut',
      menu: 'menü, hauptmenü, mehr, bereiche, nebenbereiche, hamburger, menu, weitere',
      next: 'als nächstes, empfehlung, was tun, nächster schritt, was jetzt, hinweis, todo',
      recent:
        'zuletzt verwendet, letzte jobs, verlauf, zuletzt geöffnet, noch einmal fräsen, recent, wiederholen, letzte datei',
      zeroHistory:
        'nullpunkt historie, letzte nullpunkte, nullpunkt wiederherstellen, alter nullpunkt, nullpunkt verlauf, zero history, gemerkter nullpunkt',
      overrides:
        'override, vorschub ändern, schneller, langsamer, spindel drehzahl ändern, prozent, 100 %, feed override, geschwindigkeit',
      jobTools:
        'werkzeuge des jobs, werkzeugabgleich, t-nummer, werkzeugliste abgleichen, job tools, welches werkzeug, fräser wählen, bit, endmill, durchmesser, länge messen, werkzeuglänge, messtaster, alternative',
      jogPanel:
        'jog, joggen, manuell, handbetrieb, fahren, achsen fahren, bewegen, verfahren, jog panel',
      inputs:
        'eingänge, endschalter, schalter, sensoren, taster, pins, limit switch, inputs, endlagen testen',
      features:
        'funktionen, ausblenden, einblenden, verstecken, anzeigen, schalter, serie ausblenden, vorrichtungen ausblenden, makros ausblenden, weniger karten, aufgeräumt, selten gebraucht, features, hide',
      appearance:
        'darstellung, farbschema, hell, dunkel, theme, dark mode, light mode, aussehen, design, kontrast',
      toolZero:
        'null, nullen, zero, ursprung, origin, werkstück null, werkstücknullpunkt, nullpunkt setzen, antippen, ecke, kante, xy null, g54, anfangspunkt, bezugspunkt',
      toolClamp:
        'zwinge, zwingen, klemme, klemmen, schraubzwinge, clamp, niederhalter, spanner, spannpratze, schraube, befestigung, hindernis, sperrzone',
      toolGoto:
        'dorthin fahren, anfahren, position anfahren, punkt anfahren, goto, go to, move to, fahre zu, kamera hinfahren, werkzeug hinfahren',
      toolMeasure:
        'abstand, länge, distanz, maß nehmen, lineal, maßband, ausmessen, measure, distance, wie weit, entfernung',
      stageTable: 'tischansicht, draufsicht, von oben, karte, table, top, 2d, übersicht, plan',
      stageCamera: 'livebild, kamerabild, video, bild, camera, live, webcam, usb kamera',
      stage3d:
        'dreidimensional, vorschau, 3d ansicht, modell, abtrag, materialabtrag, perspektive, preview, drei d',
      fit: 'alles zeigen, ganze ansicht, zoom zurück, zentrieren, zoom reset, fit, zoom alles, übersicht, ganz zeigen, einmitten',
      wide: 'vollbild, groß, breit, bedienfeld ausblenden, panel ausblenden, fullscreen, nur bühne, maximieren',
      follow:
        'mitlaufen, werkzeug folgen, verfolgen, nachführen, follow, mitfahren, ansicht folgt werkzeug',
      stick: 'joystick, steuerknüppel, stick, knüppel, auf der bühne fahren, analog, daumen',
      tiles:
        'position, koordinaten, anzeige, dro, mpos, wpos, maschinenkoordinaten, werkstückkoordinaten, vorschub anzeige, drehzahl anzeige, fortschritt, wo steht die maschine',
      estop:
        'stopp, stop, notaus, not aus, nothalt, e-stop, estop, abbrechen, halt, sofort anhalten, notstopp, reset, panik, roter knopf',
      shortcuts:
        'tasten, tastatur, kürzel, shortcuts, hotkeys, tastenkombination, keyboard, tastaturbefehle, hilfe tasten',
      open: 'datei laden, datei öffnen, gcode laden, g-code, nc datei, programm laden, importieren, hochladen, beispiel laden, demo job, .nc, .gcode, file open, load',
      draw: 'cam, zeichnen, skizze, sketch, zeichnung, konstruieren, entwerfen, cad, dxf, svg, neues teil, selbst zeichnen, estlcam, form, schild, werkstück zeichnen',
      readiness:
        'startklar, checkliste, bereit, fertig zum start, was fehlt, offene punkte, prüfen, ready, check, vor dem start, warum startet es nicht, start gesperrt',
      setupZero:
        'nullpunkt setzen, null, zero, ursprung, origin, werkstück null, hinfahren, ziel antippen, g54, nullen, wo liegt das werkstück',
      material:
        'holz, werkstoff, materialwahl, sperrholz, mdf, plattenmaterial, material auswählen, stoff',
      stock:
        'rohteil, rohling, platte, brett, werkstück größe, abmessungen, dicke, materialstärke, stock, blank, plattengröße',
      fixtures:
        'zwinge, zwingen, klemme, schraubzwinge, clamp, niederhalter, spannpratzen, schrauben, befestigung, spannen, kollision, hindernisse',
      simulation:
        'simulieren, vorschau, abspielen, durchlauf, trockenlauf, probelauf, seitenansicht, eilgänge, werkzeugweg ansehen, simulate, preview, playback, zeitleiste',
      summary:
        'laufzeit, dauer, wie lange, zeit, schätzung, zeilen, strecke, fräserdurchmesser, zusammenfassung, info, statistik, estimate, duration',
      workspace:
        'verfahrweg, arbeitsraum, grenzen, passt es, außerhalb, soft limits, softlimits, endlagen, travel, reichweite, zu groß, bounds',
      diagnostics:
        'fehler, warnungen, hinweise, probleme, gcode fehler, diagnose, errors, warnings, unbekannter befehl, meldungen',
      sections:
        'zu lang, länger als der tisch, langes teil, kacheln, tiling, verschieben, teilen, abschnitte, stückweise, nachschieben, durchschieben, überlänge, passt nicht auf den tisch, sections',
      run: 'start, starten, los, fräsen starten, job starten, ausführen, run, go, loslegen, abfahren, cycle start',
      stream:
        'streamen, einzelschritt, schritt für schritt, zeilenweise, vom tablet senden, stream, single step, ohne sd karte, direkt senden',
      sd: 'sd karte, speicherkarte, dateien auf der maschine, sd card, karte, datei von sd starten, dateiliste, löschen von sd',
      resume:
        'wiederaufnahme, fortsetzen ab zeile, weitermachen, abgebrochenen job fortsetzen, ab zeile starten, resume, restart from line, neustart mitten im job, stromausfall',
      upload:
        'hochladen, auf sd speichern, auf die maschine, übertragen, upload, senden, datei reparieren, prüfsumme, auf karte kopieren',
      align:
        'ausrichten, drehen, verschieben, schräg, schief, rotation, winkel, job drehen, align, rotate, translate, schräg liegendes brett',
      autolevel:
        'autolevel, höhenraster, höhenkarte, unebene platte, oberfläche abtasten, heightmap, mesh, leveling, verzogen, wellig',
      jigs: 'vorrichtung, jig, schablone, marker, tag, aufnahme, anschlag, rahmen, wiederkehrendes teil, anlernen, aruco, april tag, fixture, lehre',
      tagSheet:
        'marker drucken, tags drucken, ausdrucken, druckbogen, etiketten, aufkleber, passermarken, print, registermarken, drucker',
      shapeRect:
        'rechteck, viereck, quadrat, kasten, box, rectangle, square, eckig, abgerundete ecken',
      shapeCircle: 'kreis, rund, loch, bohrung, scheibe, circle, hole, ronde, durchmesser',
      shapeSlot: 'langloch, schlitz, nut, slot, oval, längliches loch',
      shapeGrid:
        'lochraster, lochreihe, raster, mehrere löcher, bohrbild, grid, pattern, reihe, dübellöcher',
      shapeText:
        'text, schrift, beschriftung, buchstaben, gravieren, gravur, name, schild, engrave, font, wörter',
      projectOpen:
        'projekt öffnen, zeichnung öffnen, projekt laden, gespeicherte zeichnung, projektdatei, lowrider json, weiterarbeiten, zeichnung wieder öffnen',
      projectSave:
        'projekt speichern, zeichnung speichern, sichern, projektdatei, zeichnung sichern, auf den stick, kopie der zeichnung, backup der zeichnung',
      importFile:
        'dxf, svg, importieren, datei einlesen, vektor, inkscape, zeichnung laden, fusion, freecad, import, vector, kontur aus datei',
      camHow:
        'operation, bearbeitung, kontur, ausschneiden, außen, innen, tasche, taschen, pocket, bohren, drill, gravieren, tiefe, frästiefe, vorschub, wie fräsen, außenkontur, innenkontur, auf der linie',
      tabs: 'haltestege, stege, tabs, anbindung, anbindungen, haltenasen, brücken, bridges, hold-bridges, teil festhalten, damit das teil nicht wegfliegt, stegbreite, steghöhe, anzahl der stege, estlcam, automatisch verteilen',
      tabsPlace:
        'stege setzen, stege von hand, haltestege platzieren, manuell setzen, stege verschieben, stege löschen, stege antippen, tabs manuell, anbindung setzen, estlcam',
      tabsSpread:
        'gleichmäßig verteilen, stege verteilen, automatisch verteilen, stege neu verteilen, stege zurücksetzen, automatik, anzahl der stege, estlcam, tabs verteilen',
      camTool: 'fräser wählen, werkzeug für die zeichnung, fräserdurchmesser, bit, endmill, tool',
      camAdvanced:
        'erweitert, zustellung, eintauchen, rampe, drehzahl, aufmaß, schlichten, gleichlauf, gegenlauf, bahnabstand, sichere höhe, stegbreite, steghöhe, advanced, stepdown, stepover, plunge, climb, rpm',
      bothSides:
        'wenden, zweiseitig, rückseite, umdrehen, flip, beidseitig, beide seiten, doppelseitig, passstifte, passlöcher, zweite seite, two sided, vorderseite',
      camDone:
        'gcode erzeugen, g-code erstellen, generieren, übergeben, fertig, exportieren, speichern als nc, herunterladen, generate, export, postprozessor, werkzeugweg berechnen',
      camUndo:
        'rückgängig, zurück, undo, wiederholen, redo, letzter schritt zurück, versehentlich gelöscht',
      camMulti:
        'mehrfachauswahl, mehrere auswählen, mehrere teile, mehrfach, auswahl erweitern, mehrere markieren, mehrere teile anfassen, mehrere antippen, multi select, shift, umschalt, umschalt tipp, strg tipp, ctrl klick, shift klick, illustrator',
      camMarquee:
        'rahmen aufziehen, auswahlrahmen, rechteck aufziehen, gummiband, lasso, mehrere mit einem zug, über mehrere teile ziehen, marquee, rubber band, rahmen, box select',
      camSnap:
        'fangen, einrasten, einrasten an kanten, rasten, magnet, hilfslinie, hilfslinien, ausrichten beim schieben, an kante ausrichten, an mitte ausrichten, am rohteil ausrichten, snap, snapping, smart guides, alt taste, option taste, ohne einrasten, magnetisch',
      camGaps:
        'abstände zeigen, abstand, abstände, abstand zum nachbarn, lücke, spalt, maß, maße beim schieben, gleiche abstände, gleichen abstand, bemaßung, distanz, gap, spacing, smart spacing, dimension',
      camMeasure:
        'messen, messen in der zeichnung, abstand messen, maß nehmen, lineal, maßband, zwei punkte, länge messen, winkel messen, entfernung, delta x, delta y, ruler, measure, distance, angle, tape measure',
      camHide:
        'teil ausblenden, ausblenden, auge, augensymbol, verstecken, unsichtbar, nicht fräsen, teil weglassen, sichtbarkeit, hide, eye, layer aus',
      camShowAll:
        'alle einblenden, einblenden, wieder zeigen, alles sichtbar, ausgeblendete teile, auge, verstecktes zeigen, show all, unhide',
      camSelectAll:
        'alles auswählen, alles markieren, alle teile, ganze zeichnung, select all, strg a, ctrl a, alles anfassen',
      camInvert:
        'auswahl umkehren, invertieren, umgekehrt auswählen, den rest auswählen, alles außer, invert selection, gegenteil',
      camAlign:
        'ausrichten, bündig, linksbündig, rechtsbündig, obenbündig, untenbündig, mittig, zentrieren, zentriert, in einer linie, an einer kante, auf eine höhe, waagerecht, senkrecht, align, illustrator, cad',
      camDistribute:
        'verteilen, gleichmäßig verteilen, gleiche abstände, gleicher abstand, gleiche mitten, abstände angleichen, gleichmäßig anordnen, distribute, spacing, illustrator, in einer reihe',
      camGroup:
        'gruppieren, gruppe, zusammenfassen, teile verbinden, zu einer gruppe, zusammen bewegen, gruppe bilden, group, illustrator',
      camUngroup:
        'gruppierung aufheben, gruppe auflösen, gruppe trennen, einzelne konturen, konturen einzeln wählen, aus einer datei einzeln wählen, aufteilen, ungroup, entgruppieren',
      series:
        'serie, viele gleiche, mehrere teile, rohlinge, verteilen, kopien, stapel, batch, nesting, mehrfach, auf rohlinge, untersetzer, reststücke',
      jog: 'joggen, jog, fahren, bewegen, verfahren, achsen bewegen, handrad, steuerkreuz, schrittweite, manuell fahren, x y z bewegen, pfeiltasten, gamepad, controller',
      homing:
        'homing, home, referenz, referenzieren, endschalter, $h, nullfahrt, maschinennull, referenzpunkt, anfahren, initialisieren, kalibrierfahrt, eingänge, schalter testen',
      jogZero:
        'gehe zu null, zum nullpunkt fahren, nullpunkt anfahren, go to zero, g0 x0 y0, zurück zum nullpunkt, werkstücknull anfahren',
      jogPark:
        'parkposition, parken, park, wegfahren, aus dem weg, ablage, ruheposition, parkplatz, maschine parken',
      jogChange:
        'werkzeugwechsel, wechselposition anfahren, werkzeug wechseln, wechselstelle, zum werkzeugwechsel fahren',
      changeSet:
        'werkzeugwechsel-position merken, wechselposition festlegen, wechselposition setzen, wechselstelle speichern, werkzeugwechsel position ändern',
      waypoints:
        'merkpunkte, merkpunkt, stelle merken, position merken, positionen speichern, lesezeichen, anfahrpunkt, punkt speichern, lieblingsposition, haltepunkt, wegpunkt, waypoint',
      parkSet:
        'parkposition merken, parkposition festlegen, parkposition setzen, parkposition ändern, parkplatz speichern',
      wheelFine:
        'mausrad, scrollrad, feinjog, fein fahren, mouse wheel, rad drehen, zuletzt bewegte achse, feinjustieren',
      homeAxes:
        'einzelne achse referenzieren, ref x, ref y, ref z, $hx, $hy, $hz, nur z referenzieren, achse einzeln',
      unlock:
        'entsperren, alarm löschen, alarm quittieren, unlock, $x, freigeben, alarm aufheben, gesperrt, kill alarm',
      feedHold:
        'pause, pausieren, anhalten, halten, feed hold, hold, fortsetzen, weiter, resume, cycle start, unterbrechen',
      macros:
        'makros, makro, eigene befehle, tasten, schnellbefehle, macro, buttons, eigene knöpfe, parken',
      zero: 'nullpunkt setzen, nullen, zero, x null, y null, z null, hier ist null, ursprung, origin, werkstücknullpunkt, g10, g92, auf null setzen',
      wcs: 'koordinatensystem, g54, g55, g56, g57, g58, g59, wcs, work offset, werkstückkoordinaten, zweiter nullpunkt, offset',
      savedZeros:
        'nullpunkt speichern, gespeicherte nullpunkte, merken, wiederherstellen, favoriten, saved zero, nullpunkt laden, anschlag nullpunkt',
      probe:
        'antasten, taster, z null, tastplatte, touch plate, probe, werkzeuglänge, z höhe, z nullen, touchplate, g38',
      probeWizard:
        'tastzyklen, kante antasten, ecke antasten, mitte finden, bohrung antasten, zyklen, probe cycle, kantentaster, 3d taster, zentrum',
      camera: 'kamera, livebild, webcam, kamera einschalten, usb kamera, fadenkreuz, camera, bild',
      crosshair:
        'fadenkreuz, crosshair, nullpunkt mit kamera, kamera nullpunkt, hier ist null, zielkreuz, feinjustieren, fein korrigieren, feinschritt',
      holeZero:
        'bohrung, loch, lochmitte, loch als nullpunkt, kreis finden, hole, zentrieren auf loch, bohrungsmitte',
      twoHoles:
        'zwei bohrungen, zwei löcher, drehung, schräg, ausrichten mit kamera, rotation, winkel messen, two holes, passbohrungen',
      photomap:
        'fotokarte, scan, scannen, tischfoto, übersicht, karte, foto, tisch fotografieren, luftbild, panorama, mosaik, photo map, abfotografieren, tischbild, in fahrt, ohne halt, streifen, tempo, schneller scannen, nahtlos, kacheln, aufzeichnung, aufzeichnen, mitschneiden, trace, auswertung, kamera messen, belichtung, belichtungszeit, exposure, unschärfe, bewegungsunschärfe, verwischt, verwackelt, blur, uhr, pi-uhr, uhr des pi, zeitstempel, stempel, timestamp, clock, zeitrauschen',
      recording:
        'mitschnitt, aufnahme, video, film, zeitraffer, aufzeichnen, recording, timelapse, mitfilmen, clip',
      connection:
        'verbinden, verbindung, adresse, ip, wlan, wifi, netzwerk, connect, offline, fluidnc, websocket, trennen, nicht verbunden, hostname, bildschirm wach',
      simulator:
        'simulator, simulation, ohne maschine, üben, testmaschine, virtuell, ausprobieren, sim, trocken üben',
      demo: 'demo, vorführung, beispiel, ausprobieren, eingerichtete maschine, tour, zeigen, test',
      companion:
        'companion, raspberry, pi, begleitrechner, kamera server, raspi, zusatzrechner, sensoren, bibliothek sichern',
      shutdown:
        'herunterfahren, ausschalten, shutdown, pi aus, abschalten, raspberry ausschalten, strom aus, poweroff',
      piLogin:
        'anmeldung, anmelden, pi-code, code, login, passwort, pin, gerät anmelden, abmelden, geräte, zugang, pi code vergessen',
      piUpdate:
        'update, aktualisieren, neue version, pi aktualisieren, version einspielen, lowrider-pi.zip, zip, upgrade, prüfsumme, zurück zur alten version, rollback, update-pi.bat',
      connectionInfo:
        'verbindungsinfo, verbindungsdaten, firmware version, fluidnc version, adresse, ip, status der steuerung, welche firmware',
      axisTest:
        'achstest, achse testen, achsen prüfen, richtung prüfen, motor testen, fährt die achse, testfahrt, motortest, schritte prüfen',
      messageHistory:
        'meldungshistorie, alte meldungen, fehlerliste, störungen, warnungen, verlauf der meldungen, was war los, alarm historie, filter nach stufe, diagnosebericht, bericht, export, exportieren, meldungen speichern, protokoll speichern, log, logdatei, support, fehlersuche, diagnose',
      runTime:
        'laufzeit, betriebsstunden, spindelstunden, stundenzähler, wie lange gelaufen, wartung, wartungszähler, stunden',
      log: 'protokoll, log, meldungen, verlauf, ausgabe, nachrichten, was ist passiert, fehlermeldung, terminal',
      console:
        'konsole, terminal, befehl senden, gcode eingeben, kommando, console, mdi, befehlszeile, handeingabe',
      toolLibrary:
        'werkzeuge, fräser, fräserliste, werkzeugliste, bits, endmills, werkzeug anlegen, tool library, durchmesser, schneiden, schnittwerte, eigene schnittwerte, vorschub pro werkzeug, drehzahl pro werkzeug, zustellung, ohne material',
      materialLibrary:
        'materialien, materialliste, holzarten, werkstoffe, material anlegen, materials, sperrholz, mdf',
      cutting:
        'schnittwerte, vorschub, drehzahl, zustellung, rechner, empfehlung, feeds and speeds, feeds, speeds, schnittdaten, spanlast, chipload, wie schnell',
      history:
        'historie, verlauf, vergangene jobs, protokoll der jobs, statistik, history, letzte jobs, was wurde gefräst, logbuch',
      profile:
        'maschinenprofil, profil, maschine einrichten, tischgröße, maschinendaten, profile, lowrider, abmessungen der maschine',
      travel:
        'verfahrweg, tischgröße, arbeitsbereich, x länge, y länge, z höhe, travel, maximale größe, wie groß ist der tisch, achslänge',
      machineLimits:
        'grenzen, höchstgeschwindigkeit, max rate, max_rate_mm_per_min, beschleunigung, acceleration, eilgang, z zu langsam, schneller fahren, geschwindigkeit der achsen, schrittverlust',
      jogFeed:
        'tippgeschwindigkeit, jog vorschub, jog geschwindigkeit, tippen schneller, verfahrgeschwindigkeit, wie schnell fährt die app',
      controllerConfig:
        'steuerung, config, config.yaml, jackpot, fluidnc einstellungen, controller, board, einlesen',
      share:
        'profil teilen, exportieren, importieren, sichern, backup, weitergeben, qr, share, profil speichern, einstellungen sichern',
      calibrate:
        'kalibrieren, kalibrierung, vermessen, genauigkeit, justieren, einmessen, calibrate, schritte pro mm, steps',
      measurements:
        'messprotokoll, messwerte, gemessen, protokoll, kalibrierwerte, messungen, verlauf der messungen, was wurde gemessen, korrektur geschrieben, versatz der kamera, werte wiederfinden, measurements, log',
      accuracy:
        'genauigkeit, lineal, maßhaltigkeit, stimmt das maß, schritte pro mm, steps per mm, nachmessen, accuracy, zu kurz gefahren, zu weit gefahren, rechtwinklig, rechtwinkligkeit, schief, portal, diagonale, endschalter, schraube, pulloff, rückzug, motor 1, vier punkte, rechteck bohren',
      calibration:
        'maschine vermessen, kalibrieren, kalibrierung, punktplatte, rechtwinkligkeit, winkel, squareness, schritte pro mm, mit kamera messen, kalibriertafel, rastermaß, punktabstand, punktdurchmesser, punkte je seite, gedruckte platte, 3d-druck, ausdruck, präzisionsplatte',
      cameraSetup:
        'kamera einrichten, kamera einstellen, kamera kalibrieren, kameraeinstellungen, camera setup, kamera installieren',
      cameraSource:
        'bildquelle, welche kamera, gerätekamera, companion stream, usb kamera, quelle, kamera auswählen, source, stream adresse',
      cameraCalibration:
        'kamera kalibrieren, maßstab, versatz, pixel pro mm, kameraversatz, offset, scale, kamera zum fräser, drehung der kamera',
      cameraHeight:
        'kamerahöhe, fokus, scharf, höhe der kamera, focus, z für kamera, schärfe, bildhöhe',
      timelapse: 'zeitraffer, timelapse, film vom job, aufnahme, video, mitschneiden',
      workshop:
        'einstellungen, werkstatt, settings, optionen, allgemein, grundeinstellungen, bildschirm an lassen, wach bleiben, preferences',
      language: 'sprache, englisch, deutsch, language, english, german, übersetzung',
      spindle:
        'spindel, fräsmotor, oberfräse, drehzahl, rpm, spindle, router, kress, makita, m3, m5',
      safeHeight:
        'sichere höhe, sicherheitshöhe, safe z, anheben, rückzug, freifahrhöhe, clearance, z sicher',
      toolChangePos:
        'werkzeugwechsel, fräser wechseln, wechselposition, tool change, m6, wechselpunkt, bit wechseln',
      notify:
        'benachrichtigung, meldung, ton, piepen, push, fertig melden, notification, alarm ton, hinweis wenn fertig, klingeln',
      adaptive:
        'adaptiver vorschub, last, lastregelung, sensor, strommessung, automatisch langsamer, adaptive feed, überlast',
      macroEditor:
        'makros bearbeiten, makro anlegen, eigene befehle, macro editor, knopf belegen, schnellbefehl erstellen',
      expertMode:
        'experte, expertenmodus, erweiterte funktionen, profi, advanced, expert, mehr einstellungen, versteckte funktionen',
      configEditor:
        'config.yaml, konfiguration ändern, fluidnc config, steps, max rate, beschleunigung, acceleration, yaml',
      configFile:
        'config.yaml bearbeiten, yaml editor, komplette konfiguration, datei bearbeiten, config file',
      settingsBrowser:
        'dollar einstellungen, $ einstellungen, grbl settings, $$, parameter, fluidnc settings, $-werte',
      firmware:
        'firmware, flashen, update, aktualisieren, usb, esp32, fluidnc installieren, firmware update, neu aufspielen',
    },
  },
} as const;
