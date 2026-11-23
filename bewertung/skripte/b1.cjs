const { run } = require('./stepper.cjs');
run({ name: 'B1', steps: [
  { label: 'Neuer Job', click: 'Neuer Job' },
  { label: 'Zeichnen / DXF', click: /Zeichnen/ },
], dump: true });
