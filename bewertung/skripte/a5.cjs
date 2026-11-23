const { run } = require('./stepper.cjs');
run({ name: 'A5', steps: [
  { label: 'Neuer Job', click: 'Neuer Job' },
  { label: 'G-Code öffnen + Datei', opener: 'G-Code öffnen', file: '/home/user/CNC-App/bewertung/testdaten/rechteck-aussen.nc' },
  { label: 'Schritt Einrichten', click: /Einrichten/ },
  { label: 'Ziel im Bild antippen', tap: [250, 650] },
  { label: 'Fräser hinfahren (halten)', hold: /Fräser hinfahren/, ms: 2500, wait: 4000 },
  { label: 'Nullpunkt hier setzen (halten)', hold: /Nullpunkt hier setzen/, ms: 2500 },
] });
