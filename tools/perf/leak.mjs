// Light-leak renders: only the lights of `group` on (developer overrides), probes recaptured, then views of the
// neighbouring rooms. node tools/perf/leak.mjs <url> <outdir> <group regex> name=x,z,yaw[,pitch] ...
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
import { mkdirSync } from 'fs';
const [url, out, group, ...specs] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const views = specs.map(s => { const [n, v] = s.split('='); return [n, v.split(',').map(Number)]; });
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  page.setDefaultTimeout(1800000);
  await page.goto(`${url}#webgl&q=3&shot=${views[0][1].join(',')}`);
  await page.waitForFunction('window.__state?.ready || window.__state?.error', null, { timeout: 1800000 });
  const info = await page.evaluate((group) => {
    const s = window.__app, re = new RegExp(group, 'i');
    const on = [];
    s.devMenu.entries.forEach(en => { en.force = re.test(`${en.group} ${en.name}`); if (en.force) on.push(`${en.group}: ${en.name}`); });
    s.devMenu.changed();
    s.eyes.enabled = false; s.eyes.fixed = 1;
    document.getElementById('stats')?.remove();
    return { on, lights: s.app.root.findComponents('light').filter(l => l.enabled && l.intensity > 0).map(l => `${l.entity.name} ${l.type} ${l.castShadows ? 'S' : '-'} ${l.entity.getPosition().toString()}`) };
  }, group);
  console.log(JSON.stringify(info, null, 1));
  // Let the override settle and the sliced probe capture + fade finish.
  await page.evaluate(() => new Promise(r => setTimeout(r, 400)));
  await page.waitForFunction(() => !window.__app.probes.capturing, null, { timeout: 1800000 });
  await page.evaluate(() => new Promise(r => { let n = 0; const f = () => { if (++n > 45) { window.__app.app.off('frameend', f); r(); } }; window.__app.app.on('frameend', f); }));
  for (const [name, [x, z, yaw, pitch = 0]] of views) {
    await page.evaluate(([x, z, yaw, pitch]) => { const p = window.__app.player; p.pos.x = x; p.pos.z = z; p.yaw = yaw; p.pitch = pitch; p.apply(0); }, [x, z, yaw, pitch]);
    await page.evaluate(() => new Promise(r => { let n = 0; const f = () => { if (++n > 6) { window.__app.app.off('frameend', f); r(); } }; window.__app.app.on('frameend', f); }));
    await page.screenshot({ path: `${out}/${name}.png` });
    console.log('shot', name);
  }
  await browser.close();
})();
