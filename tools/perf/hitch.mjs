// Hitch diagnostics: counts shader links and shadow-map face renders per scripted action (WebGL, SwiftShader).
// node tools/perf/hitch.mjs [url] [hash]
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://127.0.0.1:4175/';
const hash = process.argv[3] || '#webgl&q=3';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
  page.setDefaultTimeout(900000);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  await page.goto(url + hash);
  await page.waitForFunction('window.__state?.ready || window.__state?.error', null, { timeout: 900000 });
  console.log('state', JSON.stringify(await page.evaluate('window.__state')));
  await page.evaluate(() => {
    const s = window.__app, app = s.app, dev = app.graphicsDevice;
    window.__log = [];
    let faces = 0, draws = 0, shaders = dev.shaders.length;
    const sr = app.renderer.shadowRenderer, rf = sr.renderFace.bind(sr);
    sr.renderFace = (...a) => { faces++; return rf(...a); };
    const dr = dev.draw.bind(dev);
    dev.draw = (...a) => { draws++; return dr(...a); };
    let t0 = performance.now();
    app.on('frameupdate', () => { t0 = performance.now(); });
    app.on('frameend', () => {
      window.__log.push({ shadow: faces, linked: dev.shaders.length - shaders, names: dev.shaders.slice(shaders).map(x => x.name), draws, ms: performance.now() - t0 });
      faces = 0; draws = 0; shaders = dev.shaders.length;
    });
    window.__frames = (n) => new Promise(r => { let k = 0; const f = () => { if (++k >= n) { app.off('frameend', f); r(); } }; app.on('frameend', f); });
    window.__take = () => { const l = window.__log; window.__log = []; return { frames: l.length, shadowFaces: l.reduce((a, b) => a + b.shadow, 0), maxShadow: Math.max(0, ...l.map(b => b.shadow)), linked: l.reduce((a, b) => a + b.linked, 0), maxDraws: Math.max(0, ...l.map(b => b.draws)), medDraws: l.map(b => b.draws).sort((a, b) => a - b)[l.length >> 1], maxMs: Math.round(Math.max(0, ...l.map(b => b.ms))), names: l.flatMap(b => b.names) }; };
  });
  const act = async (name, fn, frames = 4, arg = null) => {
    await page.evaluate(() => window.__take());
    await page.evaluate(fn, arg);
    await page.evaluate(n => window.__frames(n), frames);
    const r = await page.evaluate(() => window.__take());
    console.log(name.padEnd(34), JSON.stringify(r));
  };
  await act('idle', () => {}, 4);
  const spots = [[11.2, 0.5], [11.6, 3.55], [7.6, 3.55], [2.6, 3.55], [-1.2, 0.6], [-4.6, 1.5], [4.2, 0.8], [7.7, 0.45]];
  for (const [x, z] of spots) for (const yaw of [0, 90, 180, 270]) {
    await act(`look ${x},${z} yaw ${yaw}`, ([x, z, yaw]) => { const p = window.__app.player; p.pos.x = x; p.pos.z = z; p.yaw = yaw; p.pitch = 0; p.apply(0); }, 2, [x, z, yaw]);
  }
  await act('dev all on', () => { const d = window.__app.devMenu; d.entries.forEach(en => { en.force = true; }); d.changed(); }, 40);
  for (const [x, z] of spots) for (const yaw of [0, 180]) {
    await act(`allon look ${x},${z} yaw ${yaw}`, ([x, z, yaw]) => { const p = window.__app.player; p.pos.x = x; p.pos.z = z; p.yaw = yaw; p.pitch = 0; p.apply(0); }, 2, [x, z, yaw]);
  }
  await act('dev back to switches', () => window.__app.devMenu.reset(), 40);
  // Interactions that once froze the game.
  await act('switch bedroom', () => { const s = window.__app.switches; s.toggle(s.rooms.find(r => r.id === 'bedroom')); }, 30);
  await act('lightning', () => { window.__app.rain.flash.next = 0; }, 8);
  await act('lightning 2', () => { window.__app.rain.flash.next = 0; }, 8);
  await act('flashlight', () => window.__app.flashlight.pickUp(), 6);
  await act('fridge open', () => window.__app.fridge.toggle(), 40);
  console.log('errors', errors.slice(0, 10));
  await browser.close();
})();
