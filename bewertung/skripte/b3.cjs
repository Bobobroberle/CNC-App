const { run } = require('./stepper.cjs');
run({ name: 'B3', steps: [
  { label: 'Neuer Job', click: 'Neuer Job' },
  { label: 'Reiter CAM', click: /^CAM/ },
  { label: 'Rechteck (Standard 100×60, Außen)', click: /^Rechteck/ },
  { label: 'Schritt Einrichten', click: /Einrichten/ },
  { label: 'Tippen (hebt nur die Auswahl der gezeichneten Form auf)', tapRel: [0.89, 0.58] },
  { label: 'Ziel im Bild antippen', tapRel: [0.89, 0.58] },
  { label: 'Fräser hierhin (halten)', hold: /Fräser hierhin/, ms: 1500, wait: 5000 },
  { label: 'Nullpunkt hier setzen (halten)', hold: /Nullpunkt hier setzen/, ms: 1500 },
  { label: 'Tab Antasten', click: /^Antasten/ },
  { label: 'Antasten starten (halten)', hold: /Antasten starten/, ms: 1500, wait: 6000 },
  { waitIdle: true },
  { label: 'Schritt Fräsen', click: /Fräsen/ },
  { label: 'Fräsen starten (halten)', hold: /Fräsen starten/, ms: 2500, wait: 3000 },
], dump: true });
