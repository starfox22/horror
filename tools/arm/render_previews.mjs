// Render preview PNGs of the arm GLB with the repo's PlayCanvas in headless Chromium (software GL).
//   node work/arm/scripts/render_previews.mjs VIEWS.json OUT_DIR [GLB] [DATA_JSON]
// VIEWS.json: [{ name, pose: null|'relaxed'|'grip', glass: bool, holderEuler|holderQuat, camPos, target, fov, key }]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node-tools/node_modules/playwright'); }

const here = path.dirname(fileURLToPath(import.meta.url));
const ARM = path.resolve(here, '..');
const PC = path.resolve(ARM, '../../node_modules/playcanvas/build');
const [viewsFile, outDir, glb = 'build/drinking-arm.glb', dataJson = 'build/arm-data.json'] = process.argv.slice(2);
const views = JSON.parse(fs.readFileSync(viewsFile, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });

const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let file;
  if (url.startsWith('/pc/')) file = path.join(PC, url.slice(4));
  else if (url === '/' || url === '/index.html') file = path.join(ARM, 'viewer/index.html');
  else file = path.join(ARM, url);
  if (!file.startsWith(ARM) && !file.startsWith(PC)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await playwright.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));
await page.goto(`http://127.0.0.1:${port}/` + (process.env.BG ? `?bg=${process.env.BG}` : ""));
await page.waitForFunction(() => window.ready === true, null, { timeout: 60000 });
const hasData = fs.existsSync(path.join(ARM, dataJson));
await page.evaluate(([g, d]) => window.boot(g, d), ['/' + glb, hasData ? '/' + dataJson : null]);
for (const v of views) {
  await page.evaluate(v => { window.pose(v.pose); window.showGlass(!!v.glass); window.view(v); }, v);
  await page.evaluate(() => window.frames(4));
  await page.locator('canvas').screenshot({ path: path.join(outDir, v.name + '.png') });
  console.log('rendered', v.name);
}
if (errors.length) console.log('page messages:\n  ' + [...new Set(errors)].slice(0, 12).join('\n  '));
await browser.close();
server.close();
