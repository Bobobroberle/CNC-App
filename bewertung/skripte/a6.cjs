const { run } = require('./stepper.cjs');
run({ name: 'A6', steps: [
  { label: 'Neuer Job', click: 'Neuer Job' },
  { label: 'G-Code öffnen + Datei', opener: 'G-Code öffnen', file: '/home/user/CNC-App/bewertung/testdaten/rechteck-aussen.nc' },
  { label: 'Schritt Einrichten', click: /Einrichten/ },
  { label: 'Ziel im Bild antippen', tap: [250, 650] },
  { label: 'Fräser hierhin (halten)', hold: /Fräser hierhin/, ms: 1500, wait: 5000 },
  { label: 'Nullpunkt hier setzen (halten)', hold: /Nullpunkt hier setzen/, ms: 3500 },
], dump: true });
