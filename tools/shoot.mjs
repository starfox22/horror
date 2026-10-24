// Headless screenshots of a built game (dist/) for checking changes without a GPU.
// Usage: node tools/shoot.mjs <dist-dir> <out-dir> name=x,z,yaw[,pitch] ...
//        [--webgpu] [--wait 6] [--size 960x540] [--quality 1|2|3]
// Uses installed Playwright (including NODE_PATH). Override with PLAYWRIGHT_MODULE and/or CHROMIUM_PATH.
import { createServer } from 'node:http';
import { access, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, join, resolve, relative } from 'node:path';

const usage = 'Usage: node tools/shoot.mjs <dist-dir> <out-dir> name=x,z,yaw[,pitch] ... [--webgpu] [--wait 6] [--size 960x540] [--quality 1|2|3]';
const args = process.argv.slice(2);
const [dist, out] = args;
const views = [];
let webgpu = false, wait = 6, size = [960, 540], quality = 3;
if (!dist || !out || dist.startsWith('--') || out.startsWith('--')) throw new Error(usage);
for (let i = 2; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--webgpu') webgpu = true;
  else if (arg === '--wait') {
    wait = Number(args[++i]);
    if (!Number.isFinite(wait) || wait < 0) throw new Error('--wait must be a nonnegative number of seconds');
  } else if (arg === '--size') {
    const value = args[++i];
    if (!/^\d+x\d+$/.test(value || '')) throw new Error('--size must be WIDTHxHEIGHT');
    size = value.split('x').map(Number);
    if (size.some(n => n <= 0)) throw new Error('--size dimensions must be positive');
  } else if (arg === '--quality') {
    quality = Number(args[++i]);
    if (![1, 2, 3].includes(quality)) throw new Error('--quality must be 1, 2 or 3');
  } else {
    const match = /^([A-Za-z0-9][A-Za-z0-9_.-]*)=([^=]+)$/.exec(arg);
    const coordinates = match?.[2].split(',').map(Number);
    if (!match || ![3, 4].includes(coordinates.length) || coordinates.some(n => !Number.isFinite(n)) || match[2].split(',').some(n => !n.trim())) {
      throw new Error(`Invalid view or option: ${arg}\n${usage}`);
    }
    views.push({ name: match[1], spec: coordinates.join(',') });
  }
}
if (!views.length) throw new Error(`At least one named view is required.\n${usage}`);
const root = resolve(dist);
await access(join(root, 'index.html'));
const require = createRequire(import.meta.url);
const { chromium } = process.env.PLAYWRIGHT_MODULE ? await import(process.env.PLAYWRIGHT_MODULE) : require('playwright');
const executablePath = process.env.CHROMIUM_PATH || (!existsSync(chromium.executablePath()) && existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm', '.gltf': 'model/gltf+json' };
let server, browser;
try {
  server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(req.url.split(/[?#]/)[0]);
      const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (relative(root, file).startsWith('..')) { res.writeHead(403).end(); return; }
      const data = await readFile(file);
      res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }).end(data);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  browser = await chromium.launch({ executablePath, args: [
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    ...(webgpu ? ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader'] : []),
  ] });
  await mkdir(out, { recursive: true });
  for (const { name, spec } of views) {
    // Each view gets a fresh page: hash-only navigation would otherwise keep the previous scene alive.
    const page = await browser.newPage({ viewport: { width: size[0], height: size[1] } });
    page.setDefaultTimeout(300000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (['error', 'warning'].includes(message.type())) console.log(`[${message.type()}]`, message.text().slice(0, 300));
      // Missing optional manifest/favicon requests are normal for the unpacked build.
      if (message.type() === 'error' && !/\/(?:assets\/apartment\/apartment\.json|favicon\.ico)$/.test(message.location().url || '')) errors.push(message.text());
    });
    try {
      const response = await page.goto(`http://127.0.0.1:${port}/index.html#shot=${spec}&q=${quality}${webgpu ? '' : '&webgl'}`);
      if (!response?.ok()) throw new Error(`${name}: page returned HTTP ${response?.status()}`);
      await page.waitForFunction(() => window.__state?.ready || window.__state?.error, null, { timeout: 600000 });
      const state = await page.evaluate(() => window.__state);
      if (!state.ready || state.error) throw new Error(`${name}: ${state.error || 'game did not become ready'}`);
      if (webgpu && !await page.evaluate(() => window.__app.app.graphicsDevice.isWebGPU)) throw new Error(`${name}: requested WebGPU but the browser fell back to WebGL`);
      await page.waitForTimeout(wait * 1000); // let TAA and the fog settle
      if (errors.length) throw new Error(`${name}: ${errors.join('; ')}`);
      await page.screenshot({ path: join(out, `${name}.png`) });
      if (errors.length) throw new Error(`${name}: ${errors.join('; ')}`);
      console.log(name, 'ok');
    } finally {
      await page.close();
    }
  }
} finally {
  try { await browser?.close(); } finally {
    server?.closeAllConnections();
    if (server?.listening) await new Promise(resolve => server.close(resolve));
  }
}
