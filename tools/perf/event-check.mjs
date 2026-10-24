// Falling-glass event in the real game: drink (finished directly), shut the fridge, count 3 s of play, check the
// story run, the thought text and the developer menu's Events button. node tools/perf/event-check.mjs <url> [webgpu]
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [url, mode = 'webgl'] = process.argv.slice(2);
(async () => {
  const flags = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
  if (mode === 'webgpu') flags.push('--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader');
  const browser = await chromium.launch({ args: flags });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.setDefaultTimeout(1800000);
  const problems = [];
  page.on('pageerror', e => problems.push('pageerror ' + e));
  page.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) problems.push('console ' + m.text()); });
  await page.goto(`${url}#${mode === 'webgl' ? 'webgl&' : ''}q=1&shot=1.30,0.40,-21,-18`);
  await page.waitForFunction('window.__state?.ready || window.__state?.error', null, { timeout: 1800000 });
  const result = await page.evaluate(async () => {
    const s = window.__app, out = {};
    const frames = n => new Promise(r => { let k = 0; const f = () => { if (++k >= n) { s.app.off('frameend', f); r(); } }; s.app.on('frameend', f); });
    s.player.camera = s.camera;
    s.fridge.toggle(); for (let i = 0; i < 400 && s.fridge.moving; i++) s.fridge.update(1 / 60);
    out.open = s.fridge.angle; out.canDrink = s.fridge.canDrink();
    out.started = s.drink.start();
    s.drink.finish();
    out.hasDrunk = s.fridge.hasDrunk;
    s.events.isPlaying = () => true;            // headless has no pointer lock
    s.fridge.toggle(); for (let i = 0; i < 400 && s.fridge.moving; i++) s.fridge.update(1 / 60);
    out.shut = s.fridge.angle;
    out.pendingAfterShut = s.events.pending.map(p => p.event.id);
    // 3 s of play at 60 updates/s.
    for (let i = 0; i < 175; i++) s.events.update(1 / 60);
    out.before3s = s.events.log.length;
    for (let i = 0; i < 10; i++) s.events.update(1 / 60);
    out.after3s = s.events.log.map(e => e.how + ':' + e.id);
    for (let i = 0; i < 40; i++) s.thought.update(1 / 30);
    out.thought = { text: s.thought.el.textContent, visible: s.thought.visible };
    out.soundLoaded = !!s.fallingGlass.buffer;
    // The developer menu: mode on, the Events list, click the first event.
    s.devMenu.setMode(true);
    const buttons = [...document.querySelectorAll('#dev-event-list button')].map(b => b.textContent);
    document.querySelector('#dev-events-open').click();
    document.querySelector('#dev-event-list button').click();
    out.menu = { buttons, open: !document.getElementById('dev-events').hidden, log: s.events.log.map(e => e.how + ':' + e.id) };
    await frames(2);
    return out;
  });
  console.log(JSON.stringify(result, null, 1));
  console.log('problems', JSON.stringify(problems));
  await page.screenshot({ path: 'work/shots/event-menu.png' });
  await browser.close();
})();
