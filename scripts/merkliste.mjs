#!/usr/bin/env node
// The "Merkliste" (living checklist, the artifact "LowRider Ideenliste"): the catalog lives in
// docs/merkliste.katalog.mjs; this script writes the project copy and the seed files for the artifact's database.
//   node scripts/merkliste.mjs md             writes docs/merkliste.md
//   node scripts/merkliste.mjs seed <dir>     writes one JSON file per document (cats__<id>.json, items__<id>.json)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATS, ITEMS, KINDS } from '../docs/merkliste.katalog.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [cmd, arg] = process.argv.slice(2);

function markdown() {
  const out = [];
  out.push('# Merkliste (Ideen, Zurückgestelltes, Offenes)');
  out.push('');
  out.push(
    'Die lebende Fassung zum Abhaken ist die Artifact-Seite **LowRider Ideenliste** (Adresse und Pflege: CLAUDE.md, ' +
      'Abschnitt „Merkliste“). Diese Datei ist der Stand im Projekt, erzeugt aus `docs/merkliste.katalog.mjs` mit ' +
      '`node scripts/merkliste.mjs md`. ★ = will ich haben, ✓ = erledigt, „in Arbeit“ = wird gerade gebaut. ' +
      'Ältere Ausführungen zu den Ideen: [ideen.md](ideen.md).',
  );
  out.push('');
  const total = ITEMS.length;
  const done = ITEMS.filter((i) => i.done).length;
  out.push(`${done} von ${total} erledigt.`);
  out.push('');
  for (const c of CATS) {
    out.push(`## ${c.title}`);
    out.push('');
    out.push(`_${c.note}_`);
    out.push('');
    const groups = [];
    for (const it of ITEMS.filter((i) => i.cat === c.id)) {
      let g = groups.find((x) => x.name === it.grp);
      if (!g) groups.push((g = { name: it.grp, items: [] }));
      g.items.push(it);
    }
    for (const g of groups) {
      out.push(`### ${g.name}`);
      out.push('');
      for (const it of g.items) {
        const tags = [KINDS[it.kind] ?? it.kind];
        if (it.building) tags.push('in Arbeit');
        out.push(
          `- [${it.done ? 'x' : ' '}] ${it.want ? '★ ' : ''}**${it.title}** (${tags.join(', ')}) – ${it.text}`,
        );
      }
      out.push('');
    }
  }
  return out.join('\n');
}

if (cmd === 'md') {
  writeFileSync(join(root, 'docs/merkliste.md'), markdown());
  console.log('docs/merkliste.md written');
} else if (cmd === 'seed' && arg) {
  mkdirSync(arg, { recursive: true });
  const now = new Date().toISOString();
  CATS.forEach((c, i) =>
    writeFileSync(
      join(arg, `cats__${c.id}.json`),
      JSON.stringify({ title: c.title, note: c.note, order: i }),
    ),
  );
  for (const it of ITEMS) {
    const data = {
      cat: it.cat,
      grp: it.grp,
      title: it.title,
      text: it.text,
      kind: it.kind,
      done: !!it.done,
      want: !!it.want,
      building: !!it.building,
      src: 'claude',
      added: now,
      order: it.order,
    };
    if (it.done) data.doneAt = now;
    writeFileSync(join(arg, `items__${it.id}.json`), JSON.stringify(data));
  }
  console.log(`${CATS.length + ITEMS.length} documents written to ${arg}`);
} else {
  console.error('usage: node scripts/merkliste.mjs md | seed <dir>');
  process.exit(2);
}
