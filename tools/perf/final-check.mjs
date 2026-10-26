// After load-time warm-up: every gameplay step must reuse its shaders.
// Usage: node tools/perf/final-check.mjs <url> [webgpu] [--report file.json]
//        [--captures directory] [--max-shadow-faces N]
// Shadow counts are always reported. Older docs have different exceptions
// (coffee9 / flashlight8), so no unverified 0.15 per-step budget is invented.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);

export function failuresFor(report, maxShadowFaces = null) {
  const failures = [...(report.problems || [])];
  if (!report.initialized) failures.push('game did not initialize');
  if (report.error) failures.push(report.error);
  for (const step of report.steps || []) {
    if (step.shaders?.length || step.materials?.length) failures.push(`${step.name}: unexpected shader builds`);
    if (maxShadowFaces !== null && step.maxFacesPerFrame > maxShadowFaces) failures.push(`${step.name}: ${step.maxFacesPerFrame} shadow faces exceeds ${maxShadowFaces}`);
  }
  if (!report.steps?.length) failures.push('no gameplay steps completed');
  return failures;
}

function optionsFrom(args) {
  const options = { url: null, mode: 'webgl', report: null, captures: null, maxShadowFaces: null };
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (['--report', '--captures', '--max-shadow-faces'].includes(a)) {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${a}`);
      options[a === '--report' ? 'report' : a === '--captures' ? 'captures' : 'maxShadowFaces'] = value;
    } else if (a.startsWith('--')) throw new Error(`Unknown option ${a}`);
    else positional.push(a);
  }
  [options.url, options.mode = 'webgl'] = positional;
  if (!options.url || positional.length > 2 || !['webgl', 'webgpu'].includes(options.mode)) throw new Error('Usage: final-check.mjs <url> [webgpu] [--report file] [--captures dir]');
  if (options.maxShadowFaces !== null) {
    options.maxShadowFaces = Number(options.maxShadowFaces);
    if (!Number.isInteger(options.maxShadowFaces) || options.maxShadowFaces < 0) throw new Error('--max-shadow-faces needs a nonnegative integer');
  }
  return options;
}

async function main() {
  const options = optionsFrom(process.argv.slice(2));
  const { chromium } = require('playwright');
  const { mode, captures } = options;
  const report = { mode, url: options.url, initialized: false, steps: [], checks: [], problems: [], shadowBudget: options.maxShadowFaces };
  let browser, page;
  try {
    const flags = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
    if (mode === 'webgpu') flags.push('--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader');
    const launch = { args: flags, executablePath: process.env.CHROMIUM_PATH || (existsSync(chromium.executablePath()) ? chromium.executablePath() : '/usr/bin/chromium') };
    const target = new URL(options.url);
    if (!['localhost', '127.0.0.1', '::1'].includes(target.hostname)) {
      const proxyUrl = process.env[target.protocol === 'https:' ? 'HTTPS_PROXY' : 'HTTP_PROXY'];
      if (proxyUrl) {
        const proxy = new URL(proxyUrl);
        launch.proxy = { server: `${proxy.protocol}//${proxy.hostname}:${proxy.port || (proxy.protocol === 'https:' ? 443 : 80)}` };
        if (proxy.username) launch.proxy.username = decodeURIComponent(proxy.username);
        if (proxy.password) launch.proxy.password = decodeURIComponent(proxy.password);
      }
    }
    browser = await chromium.launch(launch);
    page = await browser.newPage({ viewport: { width: 320, height: 180 } });
    page.setDefaultTimeout(2400000);
    const optional = (address, status = 404) => status === 404 && /\/(?:assets\/apartment\/apartment\.json|favicon\.ico)$/.test(new URL(address, options.url).pathname);
    page.on('pageerror', error => report.problems.push(`pageerror ${error}`));
    page.on('console', message => { if (message.type() === 'error' && !optional(message.location().url || options.url)) report.problems.push(`console ${message.text()}`); });
    page.on('response', response => { if (response.status() >= 400 && !optional(response.url(), response.status())) report.problems.push(`HTTP ${response.status()} ${response.url()}`); });
    page.on('requestfailed', request => { if (!optional(request.url())) report.problems.push(`request failed ${request.url()} ${request.failure()?.errorText}`); });
    if (captures) {
      await mkdir(captures, { recursive: true });
      await page.exposeFunction('__savePerfCapture', async (index, name) => {
        await page.screenshot({ path: join(captures, `${String(index).padStart(2, '0')}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`) });
      });
    }
    target.hash = `${mode === 'webgl' ? 'webgl&' : ''}q=3&shot=1.30,0.40,-21,-18&warm`;
    const response = await page.goto(target.href);
    if (!response?.ok()) throw new Error(`Game HTML returned HTTP ${response?.status()}`);
    await page.waitForFunction('window.__state?.ready || window.__state?.error', null, { timeout: 2400000 });
    const startup = await page.evaluate(() => ({ state: window.__state, device: window.__app?.app.graphicsDevice.deviceType }));
    report.startup = startup;
    if (!startup.state?.ready || startup.state.error || !startup.device) throw new Error(`Initialization failed: ${JSON.stringify(startup)}`);
    if (startup.device !== (mode === 'webgpu' ? 'webgpu' : 'webgl2')) throw new Error(`Requested ${mode}, got ${startup.device}`);
    report.initialized = true;
    console.log('initialized', JSON.stringify(startup));
    const result = await page.evaluate(async ({ capture }) => {
    const s = window.__app, app = s.app, dev = app.graphicsDevice, out = window.__perfResult = { steps: [], checks: [] };
    let faces = 0, maxFaces = 0, frameFaces = 0;
    const sr = app.renderer.shadowRenderer, renderFace = sr.renderFace;
    const rf = (...args) => renderFace.apply(sr, args);
    sr.renderFace = (...a) => { faces++; frameFaces++; return rf(...a); };
    const endFrame = () => { maxFaces = Math.max(maxFaces, frameFaces); frameFaces = 0; };
    app.on('frameend', endFrame);
    const frames = n => new Promise(r => { let k = 0; const f = () => { if (++k >= n) { app.off('frameend', f); r(); } }; app.on('frameend', f); });
    // Which material (and pass, camera) built each new shader.
    const built = [], originals = [];
    const proto = Object.getPrototypeOf(s.pc.StandardMaterial.prototype);
    for (const P of [s.pc.StandardMaterial.prototype, proto]) {
      const orig = P.getShaderVariant; if (!orig || orig.__wrapped) continue;
      originals.push([P, 'getShaderVariant', Object.hasOwn(P, 'getShaderVariant'), orig]);
      P.getShaderVariant = function (params) { const before = dev.shaders.length, sh = orig.call(this, params); if (dev.shaders.length > before) built.push(`${this.name}|pass ${params?.pass}|${params?.cameraShaderParams?.toneMapping ?? ''}`); return sh; };
      P.getShaderVariant.__wrapped = true;
    }
    // ... and on which mesh (its node's name).
    const MI = s.pc.MeshInstance.prototype, gsi = MI.getShaderInstance;
    if (gsi) { originals.push([MI, 'getShaderInstance', Object.hasOwn(MI, 'getShaderInstance'), gsi]); MI.getShaderInstance = function (...a) { const before = dev.shaders.length, r = gsi.apply(this, a); if (dev.shaders.length > before) built.push(`  on ${this.node?.name} (${this.node?.parent?.name})`); return r; }; }
    const step = async (name, fn, n = 6) => {
      const before = dev.shaders.length; faces = 0; maxFaces = 0; frameFaces = 0;
      out.currentStep = name;
      await fn(); await frames(n);
      out.steps.push({ name, shaders: dev.shaders.slice(before).map(x => x.name), materials: built.splice(0), shadowFaces: faces, maxFacesPerFrame: maxFaces });
      if (capture) await window.__savePerfCapture(out.steps.length, name);
      delete out.currentStep;
    };
    try {
    s.player.camera = s.camera;
    await step('open fridge', async () => { s.fridge.toggle(); for (let i = 0; i < 400 && s.fridge.moving; i++) { s.fridge.update(1 / 60); await frames(1); } });
    await step('drink', async () => { s.drink.start(); for (const t of [0.5, 1.0, 1.5, 2.5, 3.5, 5.0, 6.5, 7.3, 8.0]) { s.drink.apply(t); await frames(1); } s.drink.finish(); });
    await step('close fridge', async () => { s.fridge.toggle(); for (let i = 0; i < 400 && s.fridge.moving; i++) { s.fridge.update(1 / 60); await frames(1); } });
    await step('falling glass', async () => { s.events.run('falling-glass'); });
    await step('lightning', async () => { s.rain.flash.next = 0; }, 10);
    await step('kitchen switch', async () => { s.switches.toggle(s.switches.rooms.find(r => r.id === 'kitchen')); }, 40);
    await step('flashlight', async () => { s.flashlight.pickUp({ on: true }); }, 8);
    await step('coffee', async () => { s.devices.brew(s.devices.coffee); }, 20);
    await step('taps', async () => { s.taps?.toggle('kitchen'); s.taps?.toggle('bathroom'); await frames(4); s.taps?.toggle('kitchen'); s.taps?.toggle('bathroom'); }, 8);
    // Build 0.13: the night. Story time is stepped by hand (software rendering runs at about a frame a second).
    const tick = async (seconds) => { for (let t = 0; t < seconds; t += 0.05) { s.story.update(0.05); s.power.update(0.05); s.seccam.update(0.05); s.fusebox.update(0.05); s.phone.update(0.05); } await frames(1); };
    s.player.update = () => {};
    s.power.paused = () => false;                 // build 0.15: the power stands still while paused (no pointer lock here)
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

    // The real bed interaction closes over main.js's key state and pause
    // predicate. A wall timer accepted before Esc must not finish an ending
    // while paused, even if E has not yet produced a keyup event.
    await step('paused bed hold', async () => {
      const bed = s.interactions.items.find(item => item.label?.().includes('go back to sleep'));
      if (!bed) throw new Error('Missing real bed interaction');
      const timeout = window.setTimeout, sleep = s.story.sleptAgain, focus = s.interactions.focus;
      const flags = new Set(s.story.flags), cutting = s.story.cutting;
      let callback, slept = 0;
      try {
        s.story.flags.add('glass'); s.story.flags.delete('power-cut'); s.story.cutting = false;
        s.interactions.focus = bed;
        s.story.sleptAgain = () => { slept++; };
        window.setTimeout = (fn, delay, ...args) => {
          if (delay === 1500) { callback = () => fn(...args); return -1; }
          return timeout(fn, delay, ...args);
        };
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', code: 'KeyE', bubbles: true }));
        bed.use();
        if (!callback) throw new Error('Bed action did not install its hold callback');
        callback();
        if (slept) throw new Error('Paused bed hold incorrectly started an ending');
        out.checks.push({ name: 'real bed hold stays paused', passed: true });
      } finally {
        window.setTimeout = timeout; s.story.sleptAgain = sleep; s.interactions.focus = focus;
        s.story.flags = flags; s.story.cutting = cutting;
        window.dispatchEvent(new KeyboardEvent('keyup', { key: 'e', code: 'KeyE', bubbles: true }));
      }
    }, 2);
    // The captured instance must receive the actual Rain, not only pass an
    // isolated Death-class test. Observe the real no-torch catch path calling it.
    await step('caught without torch', async () => {
      if (s.death.rain !== s.rain) throw new Error('Death is missing the real rain dependency');
      const strike = s.rain.strike, held = s.flashlight.held, on = s.flashlight.on;
      let calls = 0;
      try {
        s.rain.strike = function (...args) { calls++; return strike.apply(this, args); };
        s.flashlight.held = false; s.flashlight.on = false; s.flashlight.power = 0;
        s.flashlight.beam.light.enabled = s.flashlight.bounce.light.enabled = false;
        s.story.dying = false;
        s.story.caught();
        if (calls !== 1) throw new Error(`No-torch death expected one lightning strike, got ${calls}`);
        out.checks.push({ name: 'real no-torch death strikes lightning', passed: true, calls });
      } finally { s.rain.strike = strike; s.flashlight.held = held; s.flashlight.on = on; }
    }, 4);
    return out;
    } finally {
      sr.renderFace = renderFace; app.off('frameend', endFrame);
      for (const [object, key, own, fn] of originals.reverse()) { if (own) object[key] = fn; else delete object[key]; }
    }
    }, { capture: !!captures });
    Object.assign(report, result);
  } catch (error) {
    report.error = String(error?.stack || error);
    if (page && !page.isClosed()) {
      const partial = await page.evaluate(() => window.__perfResult).catch(() => null);
      if (partial) Object.assign(report, partial);
    }
  } finally {
    await browser?.close().catch(error => report.problems.push(`browser cleanup ${error}`));
  }
  report.failures = failuresFor(report, options.maxShadowFaces);
  report.status = report.failures.length ? 'FAIL' : 'PASS';
  for (const st of report.steps) console.log(st.name.padEnd(22), JSON.stringify(st));
  console.log('problems', JSON.stringify(report.problems));
  console.log('checks', JSON.stringify(report.checks));
  console.log('status', report.status, JSON.stringify(report.failures));
  if (options.report) { await mkdir(dirname(resolve(options.report)), { recursive: true }); await writeFile(options.report, JSON.stringify(report, null, 2) + '\n'); }
  if (report.failures.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error); process.exitCode = 1; });
