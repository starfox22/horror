// Headless screenshots of a built game (dist/) for checking changes without a GPU.
// Usage: node tools/shoot.mjs <dist-dir> <out-dir> name=x,z,yaw[,pitch] ...  [--webgpu] [--wait 6] [--size 960x540]
// Serves <dist-dir> on a local port, opens index.html#shot=x,z,yaw,pitch per view and saves <out-dir>/<name>.png.
// Uses the cloud image's Playwright + Chromium (software rendering, a few fps); set PLAYWRIGHT_MODULE elsewhere.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const args = process.argv.slice(2);
const [dist, out] = args;
const views = args.slice(2).filter(a => a.includes('='));
const opt = (name, def) => (args.includes(name) ? args[args.indexOf(name) + 1] : def);
const wait = Number(opt('--wait', 6));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm', '.gltf': 'model/gltf+json' };
const server = createServer(async (req, res) => {
  try {
    const p = normalize(decodeURIComponent(req.url.split(/[?#]/)[0])).replace(/^(\.\.[/\\])+/, '');
    const data = await readFile(join(dist, p === '/' ? 'index.html' : p));
    res.writeHead(200, { 'Content-Type': types[extname(p)] || 'application/octet-stream' }).end(data);
  } catch { res.writeHead(404).end(); }
}).listen(0);
const port = server.address().port;

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
  ...(args.includes('--webgpu') ? ['--enable-unsafe-webgpu'] : [])] });
const size = opt('--size', '960x540').split('x').map(Number);
const page = await browser.newPage({ viewport: { width: size[0], height: size[1] } });
page.setDefaultTimeout(300000);
page.on('console', m => { if (['error', 'warning'].includes(m.type())) console.log(`[${m.type()}]`, m.text().slice(0, 300)); });
page.on('pageerror', e => console.log('[pageerror]', e.message));
await mkdir(out, { recursive: true });
for (const v of views) {
  const [name, spec] = v.split('=');
  await page.goto('about:blank');   // a hash-only change would not reload the page
  await page.goto(`http://127.0.0.1:${port}/index.html#shot=${spec}${args.includes('--webgpu') ? '' : '&webgl'}`);
  await page.waitForFunction(() => window.__state?.ready || window.__state?.error, null, { timeout: 600000 });
  const err = await page.evaluate(() => window.__state.error);
  if (err) { console.log(name, 'ERROR', err); continue; }
  await page.waitForTimeout(wait * 1000);   // let TAA and the fog settle
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log(name, 'ok');
}
await browser.close();
server.close();
