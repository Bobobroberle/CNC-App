// Turns the built app (apps/control/dist/index.html) into the simulator page
// release/lowrider-simulator.html: starts in demo mode (simulated LowRider and
// camera) and leaves out the document skeleton, which the page host adds.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const html = readFileSync('apps/control/dist/index.html', 'utf8');
const title = /<title>[\s\S]*?<\/title>/.exec(html)[0];
const head = /<head>([\s\S]*?)<\/head>/.exec(html)[1];
const body = /<body>([\s\S]*?)<\/body>/.exec(html)[1];
// Scripts and styles from the head, in order; metas and the title are handled here.
const assets = head.match(/<(script|style)[\s\S]*?<\/\1>/g) ?? [];
const page = [
  title.replace('LowRider Control', 'LowRider Simulator'),
  '<script>window.LOWRIDER_DEMO = true;</script>',
  // The app fills the screen: html, body and #root share its height.
  '<style>html, body, #root { height: 100%; } body { background: #161616; }</style>',
  ...assets,
  body.trim(),
].join('\n');
mkdirSync('release', { recursive: true });
writeFileSync('release/lowrider-simulator.html', page);
console.log(`release/lowrider-simulator.html (${Math.round(page.length / 1024)} kB)`);
