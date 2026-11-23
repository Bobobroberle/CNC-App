const { run } = require('./stepper.cjs');
run({ name: 'A2', steps: [
  { click: 'Neuer Job' },
  { opener: 'G-Code öffnen', file: '/home/user/CNC-App/bewertung/testdaten/rechteck-aussen.nc' },
  { click: '5 Fräsen' },
] });
