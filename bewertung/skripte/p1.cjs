const { run } = require('./stepper.cjs');
run({ name: 'P1', steps: [
  { label: 'Neuer Job', click: 'Neuer Job' },
  { label: 'G-Code öffnen + Datei', opener: 'G-Code öffnen', file: '/home/user/CNC-App/bewertung/testdaten/rechteck-aussen.nc' },
  { label: 'Schritt Einrichten', click: /Einrichten/ },
  { label: 'Ziel im Bild antippen', tapRel: [0.26, 0.68] },
  { label: 'Fräser hierhin (halten)', hold: /Fräser hierhin/, ms: 1500, wait: 5000 },
  { label: 'Nullpunkt hier setzen (halten)', hold: /Nullpunkt hier setzen/, ms: 1500 },
  { label: 'Tab Antasten', click: /^Antasten/ },
  { label: 'Antasten starten (halten)', hold: /Antasten starten/, ms: 1500, wait: 6000 },
  { waitIdle: true },
  { label: 'Schritt Fräsen', click: /Fräsen/ },
  { label: 'Fräsen starten (halten)', hold: /Fräsen starten/, ms: 2500, wait: 2500 },
  { label: 'Leertaste', key: ' ', wait: 1500 },
], dump: true });
