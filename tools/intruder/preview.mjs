// Headless previews of the intruder with the repo's PlayCanvas.
//  - Contact sheet (fitting the mask, mask.json): views around a bone of the GLB alone, in the rest pose or a clip.
//      NODE_PATH=$(npm root -g) node tools/intruder/preview.mjs out.png [glb] [clip[@seconds]]
//  - Sheets through the game's own src/intruder.js (the knife in his hand, his fingers, knifePose, his phone light) in a
//    dim room at night (stage.html): 'look' (front and three-quarter, warm lamp light and a torch from the camera),
//    'raised' (knifePose), 'hand' (the grip), 'fit' (the mask under the hood through walk, run, idle, look-around).
//      NODE_PATH=$(npm root -g) node tools/intruder/preview.mjs --sheet look|raised|hand|clips|grip|fit out.jpg [--glb file] [--src dir] [--eval js]
//    --glb: the intruder GLB to show (default public/assets/props/intruder.glb); --src: a folder holding another
//    intruder.js (with packed.js and arm-rig.js) to run instead of src/ (the 'before' of a change); --eval: a script run
//    in the page once he is loaded (window.man: the Intruder), e.g. material trials.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const sharp = (await import('sharp')).default;

const HERE = path.dirname(new URL(import.meta.url).pathname), PC = path.resolve('node_modules/playcanvas/build');
const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : fallback; };
const sheet = option('--sheet', null), glbOption = option('--glb', null), srcDir = path.resolve(option('--src', 'src'));
const tweak = option('--eval', null);      // script run in the page after he is loaded (look development: material trials)
const [out, glbArg = 'public/assets/props/intruder.glb', clipArg] = args;
const glb = path.resolve(glbOption || glbArg);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = url === '/' ? path.join(HERE, sheet ? 'stage.html' : 'preview.html')
    : url.startsWith('/pc/') ? path.join(PC, url.slice(4))
    : url === '/model.glb' || url === '/assets/props/intruder.glb' ? glb
    : url.startsWith('/src/') ? path.join(srcDir, url.slice(5))
    : url.startsWith('/assets/') ? path.resolve('public', url.slice(1)) : null;
  if (!file) { res.writeHead(404); res.end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

// One labelled panel per shot, composed into rows.
async function compose(shots, columns, width, height, file) {
  const label = (text) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="26"><rect width="100%" height="100%" fill="#000" fill-opacity="0.55"/>` +
    `<text x="8" y="18" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" fill="#ddd">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></svg>`);
  const layers = [];
  shots.forEach(({ image, caption }, i) => {
    const left = (i % columns) * width, top = Math.floor(i / columns) * height;
    layers.push({ input: image, left, top });
    if (caption) layers.push({ input: label(caption), left, top: top + height - 26 });
  });
  const canvas = sharp({ create: { width: width * columns, height: height * Math.ceil(shots.length / columns), channels: 3, background: '#000' } }).composite(layers);
  await (file.endsWith('.png') ? canvas.png() : canvas.jpeg({ quality: 88, mozjpeg: true })).toFile(file);
  console.log('wrote', file);
}

if (!sheet) {
  const [clip, at] = clipArg ? clipArg.split('@') : [null, 0];
  const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(base);
  await page.waitForFunction(() => window.ready === true);
  console.log('clips:', (await page.evaluate(() => window.boot('/model.glb'))).join(' '));
  await page.evaluate(([c, t]) => window.pose(c, t), [clip, Number(at)]);
  const views = [['Bip01 Head', 0, 5, 0.75], ['Bip01 Head', 35, 10, 0.75], ['Bip01 Head', 90, 0, 0.75], ['Bip01 Head', 160, 15, 0.8],
    ['Bip01 Head', -20, -25, 0.9], ['Bip01 Spine', 25, 8, 3.6]];
  const shots = [];
  for (const v of views) {
    await page.evaluate(v => { window.view(...v); return window.frames(3); }, v);
    shots.push({ image: await page.locator('canvas').screenshot() });
  }
  await compose(shots, 3, 512, 512, out);
} else {
  // Panels: [caption, pose, view, lighting]. He faces +Z; his right hand is on -X.
  const HEAD = { bone: 'Bip01 Head', offset: [0, 0.075, 0], d: 0.82, fov: 30, pitch: 3 };
  const BODY = { at: [0, 0.92, 0], d: 4.3, fov: 30, pitch: 3 };
  const HAND = { bone: 'Bip01 R Hand', offset: [0, -0.06, 0], d: 0.8, fov: 32 };
  const idle = { clip: 'idle_breathe_01', time: 1.2 }, walk = { clip: 'walk_slow_01', time: 0.35 };
  const SHEETS = {
    look: { size: [400, 560], columns: 4, panels: [
      ['front, lamp light', idle, { ...BODY, yaw: 0 }, 'warm'],
      ['three-quarter, lamp light', idle, { ...BODY, yaw: 38 }, 'warm'],
      ['face, lamp light', idle, { ...HEAD, yaw: 0 }, 'warm'],
      ['face, three-quarter', idle, { ...HEAD, yaw: 40 }, 'warm'],
      ['walking, in a torch beam', { ...walk, phone: true }, { ...BODY, yaw: 0, torchAt: [0, 1.25, 0] }, 'torch'],
      ['three-quarter, torch', { ...idle, phone: true }, { ...BODY, yaw: -35, torchAt: [0, 1.25, 0] }, 'torch'],
      ['face, torch', idle, { ...HEAD, yaw: 0 }, 'torch'],
      ['profile, lamp light', idle, { ...HEAD, yaw: 90 }, 'warm'],
    ] },
    raised: { size: [440, 560], columns: 3, panels: [
      ['knifePose(1, 0): three-quarter', { ...idle, raise: 1 }, { at: [0, 1.25, 0], d: 3.3, fov: 34, yaw: -40, pitch: 4 }, 'warm'],
      ['knifePose(1, 0): side', { ...idle, raise: 1 }, { at: [0, 1.25, 0], d: 3.3, fov: 34, yaw: -90, pitch: 4 }, 'warm'],
      ['knifePose(1, 0): front', { ...idle, raise: 1 }, { at: [0, 1.25, 0], d: 3.3, fov: 34, yaw: 0, pitch: 4 }, 'warm'],
      ['knifePose(0.5, 0)', { ...idle, raise: 0.5 }, { at: [0, 1.25, 0], d: 3.3, fov: 34, yaw: -40, pitch: 4 }, 'warm'],
      ['knifePose(1, 0.5): the stab', { ...idle, raise: 1, strike: 0.5 }, { at: [0, 1.25, 0], d: 3.3, fov: 34, yaw: -40, pitch: 4 }, 'warm'],
      ['knifePose(1, 1): struck', { ...idle, raise: 1, strike: 1 }, { at: [0, 1.25, 0], d: 3.3, fov: 34, yaw: -40, pitch: 4 }, 'warm'],
    ] },
    hand: { size: [480, 480], columns: 3, panels: [
      ['idle: from his right', idle, { ...HAND, yaw: -90, pitch: 5 }, 'warm'],
      ['idle: front', idle, { ...HAND, yaw: -20, pitch: 10 }, 'warm'],
      ['idle: from behind', idle, { ...HAND, yaw: -150, pitch: 15 }, 'warm'],
      ['walking: from his right', walk, { ...HAND, yaw: -90, pitch: 5 }, 'warm'],
      ['raised: from his right', { ...idle, raise: 1 }, { ...HAND, offset: [0, 0, 0], yaw: -95, pitch: 0 }, 'warm'],
      ['raised: front, below', { ...idle, raise: 1 }, { ...HAND, offset: [0, 0, 0], yaw: -10, pitch: -25 }, 'warm'],
    ] },
    // Cloth trials (with --eval): the torch on him from the front, his face in it, and lamp light.
    cloth: { size: [360, 520], columns: 3, panels: [
      ['torch', { ...walk, phone: true }, { ...BODY, yaw: 0, torchAt: [0, 1.25, 0] }, 'torch'],
      ['torch, close', idle, { ...HEAD, offset: [0, -0.2, 0], d: 1.3, yaw: -20 }, 'torch'],
      ['lamp', idle, { ...BODY, yaw: 30 }, 'warm'],
    ] },
    // The knife held through the clips the game plays (three-quarter, from his right).
    clips: { size: [360, 560], columns: 4, panels: [['idle_breathe_01', 1.2], ['idle_look_around_01', 1.9], ['walk_slow_01', 0.2], ['walk_slow_01', 0.7],
      ['walk_neutral_01', 0.3], ['run_neutral_01', 0.15], ['run_neutral_01', 0.45], ['crouch_idle', 2.0]].map(([clip, time]) =>
      [`${clip} ${time}s`, { clip, time }, { ...BODY, at: [0, clip === 'crouch_idle' ? 0.6 : 0.92, 0], yaw: -42 }, 'warm']) },
    // Fitting the grip: the fist close up in even light, from the hand's own sides (Biped hand: +X to the knuckles, +Y
    // the palm, +Z the thumb), with and without the knife.
    grip: { size: [400, 400], columns: 3, panels: [
      ['thumb side (fist, no knife)', { ...idle, knife: false }, { local: 'Bip01 R Hand', eye: [0.075, 0.015, 0.3], target: [0.075, 0.015, 0], fov: 22 }, 'studio'],
      ['thumb side', idle, { local: 'Bip01 R Hand', eye: [0.075, 0.015, 0.3], target: [0.075, 0.015, 0], fov: 22 }, 'studio'],
      ['little finger side', idle, { local: 'Bip01 R Hand', eye: [0.075, 0.015, -0.3], target: [0.075, 0.015, 0], fov: 22 }, 'studio'],
      ['palm side', idle, { local: 'Bip01 R Hand', eye: [0.07, 0.3, 0], target: [0.07, 0, 0], fov: 24 }, 'studio'],
      ['back of the hand', idle, { local: 'Bip01 R Hand', eye: [0.07, -0.3, 0.02], target: [0.07, 0, 0], fov: 24 }, 'studio'],
      ['knuckles', idle, { local: 'Bip01 R Hand', eye: [0.35, 0.02, 0.05], target: [0.07, 0.01, 0], up: [0, 1, 0], fov: 24 }, 'studio'],
    ] },
    fit: { size: [320, 320], columns: 6, panels: [] },
  };
  // The mask under the hood: each clip at three moments, seen from his left, his right and above the brow.
  for (const [clip, times] of [['walk_slow_01', [0.2, 0.7]], ['run_neutral_01', [0.15, 0.45]], ['idle_breathe_01', [1.0]], ['idle_look_around_01', [0.8, 1.9, 3.2]],
    ['crouch_idle', [2.0]], ['cell_phone_textmessage', [6]]]) {
    for (const time of times) for (const [side, yaw, pitch] of [['left', 70, 4], ['right', -70, 4], ['front', 0, 25]]) {
      SHEETS.fit.panels.push([`${clip} ${time}s ${side}`, { clip, time }, { bone: 'Bip01 Head', offset: [0, 0.06, 0], d: 0.62, fov: 30, yaw, pitch }, 'warm']);
    }
  }
  const spec = SHEETS[sheet];
  if (!spec) throw new Error(`Unknown sheet ${sheet}`);
  const [width, height] = spec.size;
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text()); });
  await page.goto(`${base}?w=${width}&h=${height}`);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 120000 });
  console.log(await page.evaluate(() => window.boot()));
  if (tweak) console.log('eval:', await page.evaluate(tweak));
  const shots = [];
  for (const [caption, pose, view, light] of spec.panels) {
    await page.evaluate(async ([pose, view, light]) => {
      window.lighting(light);
      await window.pose(pose);
      window.view(view);
      await window.frames(3);
    }, [pose, view, light]);
    shots.push({ image: await page.locator('canvas').screenshot({ timeout: 120000 }), caption });
    process.stdout.write('.');
  }
  console.log();
  await compose(shots, spec.columns, width, height, out);
}
await browser.close(); server.close();
