// After the warm-up, nothing the player does should build a shader or re-render a burst of shadows.
// node tools/perf/final-check.mjs <url> [webgpu]
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [url, mode = 'webgl'] = process.argv.slice(2);
(async () => {
  const flags = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  if (mode === 'webgpu') flags.push('--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader');
  const browser = await chromium.launch({ args: flags });
  const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
  page.setDefaultTimeout(2400000);
  const problems = [];
  page.on('pageerror', e => problems.push('pageerror ' + e));
  page.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) problems.push('console ' + m.text()); });
  await page.goto(`${url}#${mode === 'webgl' ? 'webgl&' : ''}q=3&shot=1.30,0.40,-21,-18&warm`);
  await page.waitForFunction('window.__state?.ready || window.__state?.error', null, { timeout: 2400000 });
  const result = await page.evaluate(async () => {
    const s = window.__app, app = s.app, dev = app.graphicsDevice, out = { steps: [] };
    let faces = 0, maxFaces = 0, frameFaces = 0;
    const sr = app.renderer.shadowRenderer, rf = sr.renderFace.bind(sr);
    sr.renderFace = (...a) => { faces++; frameFaces++; return rf(...a); };
    app.on('frameend', () => { maxFaces = Math.max(maxFaces, frameFaces); frameFaces = 0; });
    const frames = n => new Promise(r => { let k = 0; const f = () => { if (++k >= n) { app.off('frameend', f); r(); } }; app.on('frameend', f); });
    const step = async (name, fn, n = 6) => {
      const before = dev.shaders.length; faces = 0; maxFaces = 0;
      await fn(); await frames(n);
      out.steps.push({ name, shaders: dev.shaders.slice(before).map(x => x.name), shadowFaces: faces, maxFacesPerFrame: maxFaces });
    };
    s.player.camera = s.camera;
    await step('open fridge', async () => { s.fridge.toggle(); for (let i = 0; i < 400 && s.fridge.moving; i++) { s.fridge.update(1 / 60); await frames(1); } });
    await step('drink', async () => { s.drink.start(); for (const t of [0.5, 1.0, 1.5, 2.5, 3.5, 5.0, 6.5, 7.3, 8.0]) { s.drink.apply(t); await frames(1); } s.drink.finish(); });
    await step('close fridge', async () => { s.fridge.toggle(); for (let i = 0; i < 400 && s.fridge.moving; i++) { s.fridge.update(1 / 60); await frames(1); } });
    await step('falling glass', async () => { s.events.run('falling-glass'); });
    await step('lightning', async () => { s.rain.flash.next = 0; }, 10);
    await step('kitchen switch', async () => { s.switches.toggle(s.switches.rooms.find(r => r.id === 'kitchen')); }, 40);
    await step('flashlight', async () => { s.flashlight.pickUp(); }, 8);
    await step('coffee', async () => { s.devices.brew(s.devices.coffee); }, 20);
    return out;
  });
  for (const st of result.steps) console.log(st.name.padEnd(16), JSON.stringify({ shaders: st.shaders, shadowFaces: st.shadowFaces, maxFacesPerFrame: st.maxFacesPerFrame }));
  console.log('problems', JSON.stringify(problems));
  await browser.close();
})();
