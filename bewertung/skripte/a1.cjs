const { run } = require('./stepper.cjs');
run({ name: 'A', steps: [
  { click: 'Neuer Job' },
  { opener: 'G-Code öffnen', file: '/home/user/CNC-App/bewertung/testdaten/rechteck-aussen.nc' },
] });
