// After the warm-up, nothing the player does should build a shader or re-render a burst of shadows: Act I's
// interactions, then the night (build 0.14: the taps, the light under the bathroom door, the cut, the fuse box, the man
// running into the bedroom, the phone booting on the nightstand, the nest's hanger, LIVE, the hunt, the crow, the death
// with its blood and fall).
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
    // Which material (and pass, camera) built each new shader.
    const built = [];
    const proto = Object.getPrototypeOf(s.pc.StandardMaterial.prototype);
    for (const P of [s.pc.StandardMaterial.prototype, proto]) {
      const orig = P.getShaderVariant; if (!orig || orig.__wrapped) continue;
      P.getShaderVariant = function (params) { const before = dev.shaders.length, sh = orig.call(this, params); if (dev.shaders.length > before) built.push(`${this.name}|pass ${params?.pass}|${params?.cameraShaderParams?.toneMapping ?? ''}`); return sh; };
      P.getShaderVariant.__wrapped = true;
    }
    // ... and on which mesh (its node's name).
    const MI = s.pc.MeshInstance.prototype, gsi = MI.getShaderInstance;
    if (gsi) MI.getShaderInstance = function (...a) { const before = dev.shaders.length, r = gsi.apply(this, a); if (dev.shaders.length > before) built.push(`  on ${this.node?.name} (${this.node?.parent?.name})`); return r; };
    const step = async (name, fn, n = 6) => {
      const before = dev.shaders.length; faces = 0; maxFaces = 0;
      await fn(); await frames(n);
      out.steps.push({ name, shaders: dev.shaders.slice(before).map(x => x.name), materials: built.splice(0), shadowFaces: faces, maxFacesPerFrame: maxFaces });
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
    await step('taps', async () => { s.taps?.toggle('kitchen'); s.taps?.toggle('bathroom'); await frames(4); s.taps?.toggle('kitchen'); s.taps?.toggle('bathroom'); }, 8);
    // Build 0.13: the night. Story time is stepped by hand (software rendering runs at about a frame a second).
    const tick = async (seconds) => { for (let t = 0; t < seconds; t += 0.05) { s.story.update(0.05); s.power.update(0.05); s.seccam.update(0.05); s.fusebox.update(0.05); s.phone.update(0.05); } await frames(1); };
    s.player.update = () => {};
    await step('light under the door', async () => { s.story.glassBreaks(); s.world.bathroomOccupied(true); s.camera.setPosition(10.9, 1.6, 0.82); s.camera.lookAt(new s.pc.Vec3(9.3, 0.2, 0.82)); await tick(0.2); }, 8);
    await step('bathroom light out', async () => { s.story.bathroomTried(); await tick(3.2); }, 10);
    await step('power cut', async () => { s.story.powerCut('test'); await tick(2); }, 10);
    await step('fuse box', async () => { s.camera.setPosition(2.4, 1.6, 3.95); s.camera.lookAt(new s.pc.Vec3(2.33, 1.6, 4.3)); s.fusebox.toggleCover(); await tick(1.5); }, 6);
    await step('levers', async () => { for (const id of ['bathroom', 'kitchen', 'rcd']) s.fusebox.flip(s.fusebox.switches.find(x => x.id === id)); await tick(2); }, 10);
    await step('the figure', async () => { s.camera.setPosition(3.4, 1.62, 3.55); s.camera.lookAt(new s.pc.Vec3(12.3, 1.3, 3.55)); s.intruder.show(true); s.intruder.place(12.35, 3.55, -90); s.intruder.play('idle_breathe_01', { blend: 0 }); }, 6);
    await step('his run', async () => { s.story.flags.delete('silhouette'); s.story.sighting = null; s.story.startSighting({ seen: true }); for (let t = 0; t < 4; t += 0.05) { s.story.update(0.05); s.intruder.update?.(); if (Math.round(t * 20) % 10 === 0) await frames(1); } }, 6);
    await step('nest hanger', async () => { s.story.flags.delete('hanger'); s.story.wardrobeOpened({ id: 'right' }); await tick(2.5); for (let t = 0; t < 1.5; t += 0.05) s.nest.update(0.05); }, 6);
    await step('phone boots', async () => { s.intruder.show(false); s.camera.setPosition(12.75, 1.5, 1.05); s.camera.lookAt(new s.pc.Vec3(13.6, 0.57, 1.8)); s.phone.booted = false; s.phone.onCharger = true; s.phone.pluggedIn = true; s.phone.charger?.(true); s.phone.boot(); await tick(3.5); }, 6);
    await step('phone', async () => { s.phone.take(); s.phone.charge = 40; s.phone.booted = true; s.phone.dirty = true; s.phone.raised = true; await tick(1); }, 6);
    await step('LIVE', async () => { s.phone.openLive(); await tick(8); }, 10);
    await step('hunt', async () => { s.phone.raised = false; s.seccam.stopLive(); s.story.huntStart('test'); await tick(6); }, 10);
    await step('crow', async () => { s.crow?.strike?.({ force: true }); for (let t = 0; t < 3; t += 0.05) { s.crow?.update?.(0.05); if (Math.round(t * 20) % 10 === 0) await frames(1); } }, 6);
    await step('caught', async () => { s.story.caught(); for (let t = 0; t < 3.4; t += 0.05) { s.death.update(0.05); s.intruder.update?.(); if (Math.round(t * 20) % 5 === 0) await frames(1); } }, 6);
    await step('wake', async () => { for (let t = 0; t < 3.4; t += 0.05) { s.death.update(0.05); if (Math.round(t * 20) % 10 === 0) await frames(1); } }, 6);
    return out;
  });
  for (const st of result.steps) console.log(st.name.padEnd(16), JSON.stringify({ shaders: st.shaders, materials: st.materials, shadowFaces: st.shadowFaces, maxFacesPerFrame: st.maxFacesPerFrame }));
  console.log('problems', JSON.stringify(problems));
  await browser.close();
})();
