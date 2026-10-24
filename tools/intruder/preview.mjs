// Headless previews of the intruder (public/assets/props/intruder.glb) with the repo's PlayCanvas: a contact sheet of
// views around a bone, in the rest pose or a clip. Used to fit the mask (mask.json) and to show looks to the owner.
// Usage: NODE_PATH=$(npm root -g) node tools/intruder/preview.mjs out.png [glb] [clip[@seconds]]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const sharp = (await import('sharp')).default;

const [out, glb = 'public/assets/props/intruder.glb', clipArg] = process.argv.slice(2);
const [clip, at] = clipArg ? clipArg.split('@') : [null, 0];
const HERE = path.dirname(new URL(import.meta.url).pathname), PC = path.resolve('node_modules/playcanvas/build');
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = url === '/' ? path.join(HERE, 'preview.html') : url.startsWith('/pc/') ? path.join(PC, url.slice(4)) : url === '/model.glb' ? path.resolve(glb) : null;
  if (!file) { res.writeHead(404); res.end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': file.endsWith('.html') ? 'text/html' : file.endsWith('js') ? 'text/javascript' : 'application/octet-stream' });
    res.end(buf);
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.waitForFunction(() => window.ready === true);
console.log('clips:', (await page.evaluate(() => window.boot('/model.glb'))).join(' '));
await page.evaluate(([c, t]) => window.pose(c, t), [clip, Number(at)]);
const views = [['Bip01 Head', 0, 5, 0.75], ['Bip01 Head', 35, 10, 0.75], ['Bip01 Head', 90, 0, 0.75], ['Bip01 Head', 160, 15, 0.8],
  ['Bip01 Head', -20, -25, 0.9], ['Bip01 Spine', 25, 8, 3.6]];
const shots = [];
for (const v of views) {
  await page.evaluate(v => { window.view(...v); return window.frames(3); }, v);
  shots.push(await page.locator('canvas').screenshot());
}
await sharp({ create: { width: 512 * 3, height: 512 * 2, channels: 3, background: '#000' } })
  .composite(shots.map((b, i) => ({ input: b, left: (i % 3) * 512, top: Math.floor(i / 3) * 512 }))).png().toFile(out);
console.log('wrote', out);
await browser.close(); server.close();
