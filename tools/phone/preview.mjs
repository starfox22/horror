// The phone's screens without the game (src/phone-screen.js): every screen drawn from sample states into a contact
// sheet, for looking at the design. node tools/phone/preview.mjs <out.png> [--scale 0.5]
// (NODE_PATH=$(npm root -g) for Playwright.)
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, resolve, relative } from 'node:path';

const args = process.argv.slice(2);
const out = args[0];
if (!out) throw new Error('Usage: node tools/phone/preview.mjs <out.png> [--scale 0.5]');
const scale = args.includes('--scale') ? Number(args[args.indexOf('--scale') + 1]) : 0.5;
const root = resolve(new URL('../..', import.meta.url).pathname);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.json': 'application/json' };
const page = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#222"><script type="module">
import { W, H, drawScreen, makeWallpaper } from '/src/phone-screen.js';
const sheet = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = '/public/assets/clips/0258.jpg'; });
const sheet2 = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = '/public/assets/clips/0047.jpg'; });
const thumb = (img, frame) => { const c = document.createElement('canvas'); c.width = 384; c.height = 216; c.getContext('2d').drawImage(img, (frame % 6) * 384, Math.floor(frame / 6) * 216, 384, 216, 0, 0, 384, 216); return c; };
const thumbs = { '0258': thumb(sheet, 14), '0047': thumb(sheet2, 10) };
const wp = makeWallpaper(document);
const time = new Date(2026, 9, 25, 3, 14);
const notes = [{ id: '0047', time: '00:47', ago: '2h ago', unread: true }, { id: '0258', time: '02:58', ago: '16m ago', unread: true }];
const base = { time, charge: 6, charging: false, thumbs, notifications: notes };
const states = [
  { name: 'dead on charger', mode: 'dead', charging: true },
  { name: 'boot', mode: 'boot', boot: 1.6 },
  { name: 'lock on nightstand', mode: 'lock', charging: true, charge: 4 },
  { name: 'lock in hand', mode: 'lock', held: true, options: [['Home Cam'], ['Emergency call']], sel: 0 },
  { name: 'home cam', mode: 'cam', held: true, options: [['00:47', null, { id: '0047', time: '00:47', unread: true, duration: 4 }], ['02:58', null, { id: '0258', time: '02:58', unread: false, duration: 4 }], ['LIVE', null, { live: true, id: '0258' }]], sel: 1 },
  { name: 'clip', mode: 'clip', held: true, clip: { id: '0258', time: '02:58', t: 1.6, duration: 4 } },
  { name: 'live', mode: 'live', held: true, live: { status: '8 s delay' } },
  { name: 'call', mode: 'call', held: true, call: { line: 'Officers are on their way. Two minutes. Stay on the line if you can. Is there somewhere you can hide?', connected: true, t: 41 }, options: [['"He’s in the ceiling. Above my wardrobe."'], ['"It’s the man they evicted. From 5B."'], ['Hang up']], sel: 0 },
  { name: 'calling', mode: 'call', held: true, call: { line: 'Calling 112…' }, options: [['Hang up']], sel: 0 },
  { name: 'incoming', mode: 'call', held: true, call: { incoming: true }, options: [['Answer']], sel: 0 },
];
const sw = Math.round(W * ${scale}), sh = Math.round(H * ${scale}), cols = 5, rows = Math.ceil(states.length / cols);
const big = document.createElement('canvas'); big.width = cols * (sw + 24) + 24; big.height = rows * (sh + 64) + 24;
const bg = big.getContext('2d'); bg.fillStyle = '#2a2a2e'; bg.fillRect(0, 0, big.width, big.height);
states.forEach((st, i) => {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  drawScreen(c.getContext('2d'), { ...base, ...st }, wp);
  const x = 24 + (i % cols) * (sw + 24), y = 24 + Math.floor(i / cols) * (sh + 64);
  bg.save(); bg.beginPath(); bg.roundRect(x, y, sw, sh, 40 * ${scale}); bg.clip(); bg.drawImage(c, x, y, sw, sh); bg.restore();
  bg.fillStyle = '#ddd'; bg.font = '20px sans-serif'; bg.fillText(st.name, x, y + sh + 34);
});
window.done = big.toDataURL('image/png');
</script>`;
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  if (path === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }).end(page); return; }
  const file = resolve(root, `.${path}`);
  if (relative(root, file).startsWith('..')) { res.writeHead(403).end(); return; }
  try { const data = await readFile(file); res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }).end(data); }
  catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
const tab = await browser.newPage();
const errors = []; tab.on('pageerror', e => errors.push(String(e)));
await tab.goto(`http://127.0.0.1:${server.address().port}/`);
await tab.waitForFunction('window.done || false', null, { timeout: 120000 }).catch(() => {});
const url = await tab.evaluate(() => window.done);
if (url) await writeFile(out, Buffer.from(url.split(',')[1], 'base64'));
console.log(url ? `wrote ${out}` : 'no image', errors.join('\n'));
await browser.close(); server.close();
