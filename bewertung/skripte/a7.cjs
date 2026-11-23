const { run } = require('./stepper.cjs');
run({ name: 'A7', steps: [
  { label: 'Neuer Job', click: 'Neuer Job' },
  { label: 'G-Code öffnen + Datei', opener: 'G-Code öffnen', file: '/home/user/CNC-App/bewertung/testdaten/rechteck-aussen.nc' },
  { label: 'Schritt Einrichten', click: /Einrichten/ },
  { label: 'Tab Antasten', click: /^Antasten/ },
], dump: true });
