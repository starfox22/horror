// The phone model with its screen as the game sets it up (phone.js useScreen: the screen canvas drawn by
// phone-screen.js as the emissive map of the model's Lock_Screen mesh), rendered alone from the front and at 3/4, without
// the flat: a quick check of the model, its screen mapping and its materials. node tools/phone/model-check.mjs <out.png>
// (NODE_PATH=$(npm root -g) for Playwright; serves the repo root.)
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, resolve, relative } from 'node:path';

const out = process.argv[2];
if (!out) throw new Error('Usage: node tools/phone/model-check.mjs <out.png>');
const root = resolve(new URL('../..', import.meta.url).pathname);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.jpg': 'image/jpeg', '.json': 'application/json', '.glb': 'model/gltf-binary' };
const page = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#111"><canvas id="c" width="1200" height="800"></canvas>
<script type="importmap">{"imports":{"playcanvas":"/node_modules/playcanvas/build/playcanvas.mjs"}}</script>
<script type="module">
import * as pc from 'playcanvas';
import { W, H, drawScreen, makeWallpaper } from '/src/phone-screen.js';
const canvas = document.getElementById('c');
const app = new pc.Application(canvas, { graphicsDeviceOptions: { preserveDrawingBuffer: true } });
app.start();
app.scene.ambientLight = new pc.Color(0.25, 0.25, 0.27);
const cam = new pc.Entity(); cam.addComponent('camera', { clearColor: new pc.Color(0.06, 0.06, 0.07), fov: 30, nearClip: 0.01 }); app.root.addChild(cam);
const light = new pc.Entity(); light.addComponent('light', { type: 'directional', intensity: 1.6 }); light.setEulerAngles(40, 30, 0); app.root.addChild(light);
const sc = document.createElement('canvas'); sc.width = W; sc.height = H;
drawScreen(sc.getContext('2d'), { mode: 'lock', time: new Date(2026, 9, 25, 3, 14), charge: 23, held: true, options: [['Home Cam'], ['Emergency call']], sel: 0,
  notifications: [{ id: '0047', time: '00:47', ago: '2h ago', unread: true }, { id: '0258', time: '02:58', ago: '16m ago', unread: true }] }, makeWallpaper(document));
const tex = new pc.Texture(app.graphicsDevice, { width: W, height: H, format: pc.PIXELFORMAT_RGBA8, mipmaps: false, minFilter: pc.FILTER_LINEAR, magFilter: pc.FILTER_LINEAR, addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE });
tex.setSource(sc);
const asset = new pc.Asset('phone', 'container', { url: '/public/assets/props/story/phone.glb' });
app.assets.add(asset);
asset.ready(() => {
  const report = [];
  // Variants (VARIANT): 'red' the screen plain red; 'glass' the cover glass hidden; default as the game.
  const variants = ${JSON.stringify((process.env.VARIANTS || 'game,red,glass').split(','))};
  variants.forEach((v, i) => {
    const e = asset.resource.instantiateRenderEntity();
    e.setLocalPosition((i - (variants.length - 1) / 2) * 0.1, 0, 0); e.setLocalEulerAngles(0, v === 'back' ? 180 : 0, 0);
    app.root.addChild(e);
    for (const r of e.findComponents('render')) for (const mi of r.meshInstances) {
      if (v === 'glass' && /^Glass/.test(mi.material.name)) mi.visible = false;
      if (!/^Lock_Screen/.test(mi.material.name)) continue;
      const m = new pc.StandardMaterial(); m.diffuse = pc.Color.BLACK; m.emissive = v === 'red' ? new pc.Color(1, 0, 0) : pc.Color.WHITE;
      if (v !== 'red') m.emissiveMap = tex;
      m.emissiveIntensity = 1.1; m.useLighting = false; m.update();
      mi.material = m;
      const uv = []; const n = mi.mesh.getUvs(0, uv); let lo = [9, 9], hi = [-9, -9];
      for (let k = 0; k < n * 2; k += 2) { lo = [Math.min(lo[0], uv[k]), Math.min(lo[1], uv[k + 1])]; hi = [Math.max(hi[0], uv[k]), Math.max(hi[1], uv[k + 1])]; }
      report.push({ v, n, lo, hi, layers: mi.layer, order: mi.drawOrder });
    }
  });
  cam.setPosition(0, 0, 0.62);
  window.report = report;
  setTimeout(() => { window.done = canvas.toDataURL('image/png'); }, 1500);
});
asset.on('error', e => { window.report = String(e); window.done = 'x'; });
app.assets.load(asset);
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
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const tab = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = []; tab.on('pageerror', e => errors.push(String(e))); tab.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await tab.goto(`http://127.0.0.1:${server.address().port}/`);
await tab.waitForFunction('window.done', null, { timeout: 300000 });
const url = await tab.evaluate(() => window.done);
if (url.startsWith('data:')) await writeFile(out, Buffer.from(url.split(',')[1], 'base64'));
console.log(JSON.stringify(await tab.evaluate(() => window.report)), errors.join('\n'));
await browser.close(); server.close();
