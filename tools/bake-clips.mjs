// Bakes the home camera's recordings (docs/STORY.md) from the game itself, headless: the flat at night through the
// infrared pass of src/seccam.js, frame by frame, into sprite sheets public/assets/clips/<id>.jpg + <id>.json
// ({ w, h, cols, frames, fps }), and the polaroid (public/assets/clips/polaroid.jpg: a flash photo of your bed taken from
// inside the wardrobe, then made to look like instant film). Afterwards `node tools/props/build.mjs polaroids` prints
// the polaroid into the photos' model.
//   00:47  zoomed on the wardrobe: the right door opens a hand's width, a white face in the gap, it closes.
//   02:58  the empty bed (you were sleepwalking), a man at its foot; he turns to the lens and looks up into it.
//   0314   one frame for Sweet Dreams: you asleep, and him standing at the foot of the bed.
// The sleeper is the unmasked Rocketbox man (assets-src/intruder/intruder-plain.glb, MIT; tools/intruder/build.mjs
// plain) lying under the duvet: only the head on the pillow shows, grey in the grain.
// Usage: npm run build && node tools/intruder/build.mjs plain && NODE_PATH=$(npm root -g) node tools/bake-clips.mjs [id ...]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import sharp from 'sharp';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = path.resolve('dist'), OUT = path.resolve('public/assets/clips'), SLEEPER = path.resolve('assets-src/intruder/intruder-plain.glb');
const only = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = url === '/bake/sleeper.glb' ? SLEEPER : path.join(ROOT, url === '/' ? 'index.html' : url);
  if (!file.startsWith(ROOT) && file !== SLEEPER) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.setDefaultTimeout(3600000);
page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
page.on('pageerror', e => console.log('[pageerror]', e.message));
const frames = new Map();
await page.exposeFunction('__frame', (id, i, b64, w, h) => { (frames.get(id) || frames.set(id, []).get(id))[i] = { data: Buffer.from(b64, 'base64'), w, h }; });
console.log('loading the flat (software rendering: minutes)…');
await page.goto(`http://127.0.0.1:${server.address().port}/#webgl&q=2&shot=12,0.5,0`);
await page.waitForFunction('window.__state?.ready || window.__state?.error', null, { timeout: 3600000 });

const result = await page.evaluate(async (only) => {
  const s = window.__app, pc = s.pc, app = s.app, cam = s.seccam, man = s.intruder;
  const frame = () => new Promise(r => app.once('frameend', r));
  const frames = async (n) => { for (let i = 0; i < n; i++) await frame(); };
  const log = [];
  // Night: every light off, no lightning, the rain's glow only; the player out of the way.
  s.rain.flash.next = 1e9;
  s.switches.rooms.forEach(r => { if (r.on) s.switches.toggle(r); });
  s.devices.lamps.forEach(l => { if (l.on) s.devices.toggleLamp(l); });
  s.player.pos.x = 1; s.player.pos.z = 3.4; s.player.apply(0);
  // The sleeper: the plain man on his back under the duvet, head on the pillow (east).
  const sleeper = await new Promise((resolve, reject) => {
    const asset = new pc.Asset('sleeper', 'container', { url: '/bake/sleeper.glb' });
    asset.once('load', () => {
      const e = asset.resource.instantiateRenderEntity({ castShadows: true, receiveShadows: true });
      // Arms at the sides (a standing idle's first frame), frozen.
      e.addComponent('anim', { activate: true });
      for (const a of asset.resource.animations) e.anim.assignAnimation(a.resource.name, a.resource, undefined, true);
      e.anim.baseLayer.transition('idle_neutral_01', 0); e.anim.speed = 0;
      resolve(e);
    });
    asset.once('error', reject);
    app.assets.add(asset); app.assets.load(asset);
  });
  app.root.addChild(sleeper);
  sleeper.setRotation(new pc.Quat().setFromEulerAngles(-90, 0, 0).mul(new pc.Quat().setFromEulerAngles(0, 0, -90)));
  sleeper.setPosition(12.35, 0.5, 0.42);
  for (const r of sleeper.findComponents('render')) for (const mi of r.meshInstances) mi.isVisibleFunc = c => c.node?.name === 'security camera' && c.frustum.containsAabb(mi.aabb);
  sleeper.enabled = false;
  await frames(4);

  const rightDoor = s.closets.doors.find(d => d.id === 'right');
  const setDoor = (k) => { rightDoor.angle = k; rightDoor.pivot.setEulerAngles(0, rightDoor.sign * 100 * k, 0); };
  const ease = (t) => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
  const pose = (clip, t) => { man.play(clip, { blend: 0 }); man.body.anim.speed = 0; man.body.anim.baseLayer.activeStateCurrentTime = t; };
  const camera = cam.entity, CAM = { pos: camera.getPosition().clone(), rot: camera.getRotation().clone(), fov: camera.camera.fov };
  const aim = (look, fov) => { camera.setPosition(CAM.pos); camera.lookAt(new pc.Vec3(...look)); camera.camera.fov = fov; };
  const restore = () => { camera.setPosition(CAM.pos); camera.setRotation(CAM.rot); camera.camera.fov = CAM.fov; };
  const grab = async (id, i, texture = cam.ir, rt = cam.irTarget) => {
    camera.camera.enabled = true;
    await frames(3);
    const px = await texture.read(0, 0, texture.width, texture.height, { renderTarget: rt, immediate: true });
    let bin = ''; const bytes = new Uint8Array(px.buffer, px.byteOffset, px.byteLength);
    for (let k = 0; k < bytes.length; k += 32768) bin += String.fromCharCode(...bytes.subarray(k, k + 32768));
    await window.__frame(id, i, btoa(bin), texture.width, texture.height);
  };
  const clips = {
    // 00:47 — six frames a second, 4 s, zoomed on the wardrobe's right door.
    '0047': { fps: 6, n: 24, setup: () => {
      sleeper.enabled = true; aim([9.72, 1.15, -0.12], 46);
      man.show(true); man.setTorch(false); man.place(9.47, -0.2, 90, 0.17); pose('idle_neutral_01', 0.4);
    }, step: (i, t) => {
      setDoor(0.16 * (ease((t - 0.6) / 0.9) - ease((t - 2.7) / 0.8)));
      man.headPitch = -4;
    } },
    // 02:58 — 5 s: he stands at the foot of the empty bed; at 2 s he turns to the lens and lifts his face to it.
    '0258': { fps: 6, n: 30, setup: () => {
      sleeper.enabled = false; setDoor(0); restore();
      man.show(true); man.setTorch(false); man.place(10.85, 0.45, 90); pose('idle_breathe_01', 0);
    }, step: (i, t) => {
      const k = ease((t - 2) / 1.4);
      man.place(10.85, 0.45, 90 - 27 * k); pose('idle_breathe_01', 0.2 + t * 0.9); man.headPitch = -26 * ease((t - 2.8) / 1.2);
    } },
    // 03:14 — one frame: you asleep, him at the foot of the bed looking at you.
    '0314': { fps: 1, n: 1, setup: () => {
      sleeper.enabled = true; setDoor(0); restore();
      man.show(true); man.setTorch(false); man.place(10.95, 0.5, 90); pose('idle_neutral_01', 1.0); man.headPitch = 8;
    }, step: () => {} },
  };
  for (const [id, c] of Object.entries(clips)) {
    if (only.length && !only.includes(id)) continue;
    c.setup(); await frames(3);
    for (let i = 0; i < c.n; i++) { c.step(i, i / c.fps); await grab(id, i); }
    log.push(`${id}: ${c.n} frames`);
  }
  // The polaroid: a flash photograph from the gap of the right wardrobe door, of your bed and you in it.
  if (!only.length || only.includes('polaroid')) {
    sleeper.enabled = true; man.show(false); setDoor(0.2);
    camera.setPosition(9.78, 1.32, 0.06); camera.lookAt(new pc.Vec3(12.6, 0.62, 0.48)); camera.camera.fov = 58;
    const flash = new pc.Entity('bake flash');
    flash.addComponent('light', { type: 'spot', color: new pc.Color(1, 0.97, 0.92), intensity: 9, range: 9, innerConeAngle: 30, outerConeAngle: 55, castShadows: true, shadowResolution: 1024 });
    flash.setPosition(9.8, 1.36, 0.06); flash.lookAt(new pc.Vec3(12.6, 0.62, 0.48)); flash.rotateLocal(-90, 0, 0);
    app.root.addChild(flash);
    await frames(4);
    await grab('polaroid', 0, cam.raw, cam.rt);
    flash.destroy();
    log.push('polaroid');
  }
  restore(); setDoor(0); man.show(false); man.headPitch = 0; sleeper.destroy(); camera.camera.enabled = false;
  return log;
}, only);
console.log(result.join('\n'));

// Sprite sheets (the readback is bottom-up: flip each frame).
const COLS = 6;
const flipped = async ({ data, w, h }) => sharp(data, { raw: { width: w, height: h, channels: 4 } }).flip().removeAlpha().png().toBuffer();
for (const [id, list] of frames) {
  if (id === 'polaroid') {
    // Instant film: lifted blacks, warm highlights, cyan shadows, a soft falloff to the corners, a little blur.
    const { w, h } = list[0];
    const photo = await sharp(await flipped(list[0])).extract({ left: Math.round((w - h) / 2), top: 0, width: h, height: h }).resize(512, 512)
      .blur(0.7).modulate({ saturation: 0.82, brightness: 1.05 }).linear([0.86, 0.82, 0.76], [22, 20, 26]).png().toBuffer();
    const vignette = Buffer.from(`<svg width="512" height="512"><defs><radialGradient id="g" cx="50%" cy="48%" r="72%"><stop offset="55%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.55"/></radialGradient></defs><rect width="512" height="512" fill="url(#g)"/></svg>`);
    await sharp(photo).composite([{ input: vignette }]).jpeg({ quality: 88 }).toFile(path.join(OUT, 'polaroid.jpg'));
    console.log('polaroid.jpg');
    continue;
  }
  const { w, h } = list[0], rows = Math.ceil(list.length / COLS);
  const tiles = await Promise.all(list.map(async (f, i) => ({ input: await flipped(f), left: (i % COLS) * w, top: Math.floor(i / COLS) * h })));
  await sharp({ create: { width: w * Math.min(COLS, list.length), height: h * rows, channels: 3, background: '#000' } }).composite(tiles)
    .jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(OUT, `${id}.jpg`));
  const fps = id === '0314' ? 1 : 6;
  fs.writeFileSync(path.join(OUT, `${id}.json`), JSON.stringify({ w, h, cols: Math.min(COLS, list.length), frames: list.length, fps }) + '\n');
  console.log(`${id}.jpg`, list.length, 'frames');
}
await browser.close();
server.close();
