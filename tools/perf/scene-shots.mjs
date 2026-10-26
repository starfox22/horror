// Headless captures of story moments (docs/build-0NN/): serves a built game (dist/), loads it once (#shot and the
// warm-up, like final-check.mjs), then for each scene of a scenes module runs its setup in the page and screenshots.
// node tools/perf/scene-shots.mjs <dist-dir> <out-dir> <scenes.mjs> [--webgpu] [--size 960x540] [--only a,b] [--quality 3]
// A scenes module exports default [{ name, setup, wait }]: setup is a function run in the page with the game's systems
// (window.__app) as its argument, so it must not use anything from the module; it may be async. The player's own
// update is switched off first (setup places the camera itself: s.camera.setPosition / setEulerAngles or lookAt), and
// `s.view(x, y, z, yaw, pitch)` does both. Story time does not pass by itself under software rendering (about a frame a
// second): setup steps what it needs by hand (s.story.update(dt), ...). wait: seconds of rendering before the
// screenshot (default 4: TAA and fog settle). Software rendering takes minutes to load the flat: run it in the
// background and poll its output.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, join, resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const [dist, out, scenesFile] = args;
if (!dist || !out || !scenesFile) throw new Error('Usage: node tools/perf/scene-shots.mjs <dist-dir> <out-dir> <scenes.mjs> [--webgpu] [--size 960x540] [--only a,b] [--quality 3]');
const opt = (name, fallback) => { const i = args.indexOf(name); return i > 0 ? args[i + 1] : fallback; };
const webgpu = args.includes('--webgpu');
const size = opt('--size', '960x540').split('x').map(Number);
const only = opt('--only', '')?.split(',').filter(Boolean);
const quality = Number(opt('--quality', 3));
const scenes = (await import(pathToFileURL(resolve(scenesFile)).href)).default.filter(s => !only.length || only.includes(s.name));
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm' };
const root = resolve(dist);
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(req.url.split(/[?#]/)[0]);
    const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (relative(root, file).startsWith('..')) { res.writeHead(403).end(); return; }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }).end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const executablePath = process.env.CHROMIUM_PATH || (existsSync(chromium.executablePath()) ? chromium.executablePath() : '/usr/bin/chromium');
const browser = await chromium.launch({ executablePath, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
  ...(webgpu ? ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader'] : [])] });
try {
  await mkdir(out, { recursive: true });
  const page = await browser.newPage({ viewport: { width: size[0], height: size[1] } });
  page.setDefaultTimeout(2400000);
  const errors = [];
  await page.addInitScript('Math.random=(()=>{let x=42;return()=>((x=Math.imul(x,1664525)+1013904223|0)>>>0)/4294967296;})()');
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/404|favicon/.test(m.text())) errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html#shot=1.3,0.4,-21,-18${args.includes('--skip-warm') ? '' : '&warm'}&q=${quality}${webgpu ? '' : '&webgl'}`);
  await page.waitForFunction('window.__state?.ready || window.__state?.error', null, { timeout: 2400000 });
  const state = await page.evaluate(() => window.__state);
  if (!state.ready) throw new Error(state.error || 'the game did not become ready');
  await page.evaluate(() => {
    const s = window.__app;
    s.player.update = () => {};
    s.view = (x, y, z, yaw = 0, pitch = 0) => { s.camera.setPosition(x, y, z); s.camera.setEulerAngles(pitch, yaw, 0); };
  });
  console.log('ready');
  for (const scene of scenes) {
    const before = errors.length;
    await page.evaluate(`(${scene.setup.toString()})(window.__app)`);
    await page.waitForTimeout((scene.wait ?? 4) * 1000);
    await page.screenshot({ path: join(out, `${scene.name}.png`) });
    console.log(scene.name, errors.length > before ? `errors: ${errors.slice(before).join('; ')}` : 'ok');
  }
  if (errors.length) throw new Error(`Capture errors: ${errors.join('; ')}`);
} finally {
  await browser.close();
  server.closeAllConnections(); server.close();
}
