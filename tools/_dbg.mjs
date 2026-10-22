import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const dist = process.argv[2];
const server = createServer(async (req, res) => { try { const p = normalize(decodeURIComponent(req.url.split(/[?#]/)[0])); res.writeHead(200, {'Content-Type': {'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.wasm':'application/wasm'}[extname(p)]||'application/octet-stream'}).end(await readFile(join(dist, p === '/' ? 'index.html' : p))); } catch { res.writeHead(404).end(); } }).listen(0);
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 640, height: 360 } });
page.on('console', m => console.log('[c]', m.text().slice(0, 200)));
await page.goto(`http://127.0.0.1:${server.address().port}/index.html#${process.argv[3]}`);
await page.waitForFunction(() => window.__state?.ready || window.__state?.error, null, { timeout: 600000 });
console.log(await page.evaluate(process.argv[4]));
for (let i = 5; i < process.argv.length; i++) { await page.evaluate(process.argv[i]); await page.waitForTimeout(8000); await page.screenshot({ path: `/tmp/claude-0/-home-user/96f003c8-6743-593f-8c25-49f41e4b35ce/scratchpad/dbg${i}.png` }); console.log('shot', i, await page.evaluate('window.__frames||0')); }
await b.close(); server.close();
