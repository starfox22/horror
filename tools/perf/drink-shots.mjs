// Renders the drinking animation at fixed times in the real game. node tools/perf/drink-shots.mjs <url> <outdir> [x,z,yaw,pitch] [webgpu]
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
import { mkdirSync, appendFileSync } from 'fs';
const [url, out, spot = '1.62,0.25,0,-18', mode = 'webgl'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const log = (...a) => appendFileSync(`${out}/log.txt`, a.join(' ') + '\n');
const times = (process.env.TIMES || '0.45,0.9,1.25,2.1,2.9,3.8,5.0,6.0,6.9,7.4,7.9').split(',').map(Number);
(async () => {
  const flags = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  if (mode === 'webgpu') flags.push('--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader');
  const browser = await chromium.launch({ args: flags });
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  page.setDefaultTimeout(1800000);
  page.on('pageerror', e => log('pageerror', String(e)));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') log('console', m.type(), m.text()); });
  await page.goto(`${url}#${mode === 'webgl' ? 'webgl&' : ''}q=3&shot=${spot}`);
  await page.waitForFunction('window.__state?.ready || window.__state?.error', null, { timeout: 1800000 });
  const frames = n => page.evaluate(n => new Promise(r => { let k = 0; const a = window.__app.app; const f = () => { if (++k >= n) { a.off('frameend', f); r(); } }; a.on('frameend', f); }), n);
  log(await page.evaluate((lights) => {
    const s = window.__app; document.getElementById('stats')?.remove();
    for (const id of lights.split(',')) { const r = s.switches.rooms.find(r => r.id === id); if (r && !r.on) s.switches.toggle(r); }
    s.fridge.toggle(); for (let i = 0; i < 400 && s.fridge.moving; i++) s.fridge.update(1 / 60);
    s.player.camera = s.camera;
    return JSON.stringify({ angle: s.fridge.angle, can: s.fridge.canDrink(), dist: s.camera.getPosition().distance(s.fridge.glassTarget) });
  }, process.env.LIGHTS || 'kitchen,dining'));
  await page.waitForFunction(() => !window.__app.probes.capturing, null, { timeout: 1800000 });
  const ok = await page.evaluate(() => window.__app.drink.start());
  log('started', ok);
  for (const t of times) {
    await page.evaluate(t => { window.__app.drink.apply(t); }, t);
    await frames(4);
    await page.screenshot({ path: `${out}/t${t.toFixed(2)}.png` });
    log('shot', t, JSON.stringify(await page.evaluate(() => { const d = window.__app.drink; return { carried: d.carried, wrist: d.wrist.toArray().map(v => +v.toFixed(3)), cam: d.camera.getPosition().toArray().map(v => +v.toFixed(3)) }; })));
  }
  await browser.close();
})();
