const { run } = require('./stepper.cjs');
run({ name: 'B2', steps: [
  { label: 'Neuer Job', click: 'Neuer Job' },
  { label: 'Zeichnen / DXF', click: /Zeichnen/ },
  { label: 'Rechteck', click: /^Rechteck/ },
], dump: true });
