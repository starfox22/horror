// Boot: graphics device (WebGPU, else WebGL2), decoders, the apartment, lighting, post-processing, player, ambience.
// Hash options (the only URL part that survives in a claude.ai artifact): #webgl forces WebGL2, #stats shows timings,
// #shot=x,z,yaw[,pitch] places the camera and skips the intro (used by tools/shoot.mjs for screenshots),
// #q=1|2|3 picks the quality level, #ev=<number> and #amb=<number> override exposure and bounce light (for tuning),
// #dark switches every light off, #allon every switch on, #flash starts with the flashlight in hand, #open opens the wardrobe.
import * as pc from 'playcanvas';
import { WalkGrid } from './walkgrid.js';
import { Player } from './player.js';
import { setupLighting, addDownlights } from './lighting.js';
import { Probes, ZONES, baseName } from './probes.js';
import { setupPost, setQuality, EyeAdaptation } from './post.js';
import { Ambience } from './ambience.js';
import { Interactions } from './interact.js';
import { Switches } from './switches.js';
import { Closets, FLASHLIGHT_SPOT } from './closets.js';
import { Flashlight } from './flashlight.js';
import { Rain } from './rain.js';
import { Doors } from './doors.js';
import { Devices } from './devices.js';
import { DevMenu } from './devmenu.js';

const ASSETS = new URL('./assets/apartment/', location.href).href;
const SPAWN = { x: 13.0, z: 3.55, yaw: 90 };          // entrance hall, looking down the corridor
const AMBIENT = 0.6;                                  // strength of the room probes' bounce light (probes.js)
const hash = new URLSearchParams(location.hash.slice(1));
const shot = hash.get('shot')?.split(',').map(Number);

const $ = (id) => document.getElementById(id);
// Film grain tile for the #grain overlay (style.css animates it).
{
  const c = document.createElement('canvas'); c.width = c.height = 192;
  const g = c.getContext('2d'), img = g.createImageData(192, 192);
  for (let i = 0; i < img.data.length; i += 4) { const v = 128 + (Math.random() + Math.random() - 1) * 110; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  $('grain').style.backgroundImage = `url(${c.toDataURL()})`;
}
const status = (text, frac) => { $('status').textContent = text; if (frac !== undefined) $('bar').style.width = `${Math.round(frac * 100)}%`; };
window.__state = { ready: false, error: null };
window.addEventListener('error', (e) => { window.__state.error = String(e.message); status(`Error: ${e.message}`); });

// Decoders: wasm where the page allows compiling it, the asm.js fallbacks otherwise (some sandboxes block wasm).
const wasmOk = await WebAssembly.compile(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])).then(() => true, () => false);
const lib = (name) => {
  const base = new URL(`./lib/${name}/`, location.href).href;
  return wasmOk ? { glueUrl: `${base}${name}.wasm.js`, wasmUrl: `${base}${name}.wasm.wasm`, fallbackUrl: `${base}${name}.js` }
    : { fallbackUrl: `${base}${name}.js` };
};
pc.WasmModule.setConfig('DracoDecoderModule', lib('draco'));
pc.basisInitialize({ ...lib('basis'), numWorkers: 2 });

const canvas = $('app');
const device = await pc.createGraphicsDevice(canvas, {
  deviceTypes: hash.has('webgl') ? [pc.DEVICETYPE_WEBGL2] : [pc.DEVICETYPE_WEBGPU, pc.DEVICETYPE_WEBGL2],
  antialias: false, powerPreference: 'high-performance',
});
device.maxPixelRatio = Math.min(window.devicePixelRatio, 1.5);

const opts = new pc.AppOptions();
opts.graphicsDevice = device;
opts.componentSystems = [pc.RenderComponentSystem, pc.CameraComponentSystem, pc.LightComponentSystem, pc.ParticleSystemComponentSystem];
opts.resourceHandlers = [pc.TextureHandler, pc.ContainerHandler];
const app = new pc.AppBase(canvas);
app.init(opts);
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);
window.addEventListener('resize', () => app.resizeCanvas());
app.start();
status(`Loading the apartment… (${device.isWebGPU ? 'WebGPU' : 'WebGL 2'})`, 0.1);

const [grid, container] = await Promise.all([
  fetch(`${ASSETS}collision.json`).then(r => r.json()).then(j => new WalkGrid(j)),
  modelFile().then((file) => new Promise((resolve, reject) => {
    const asset = new pc.Asset('apartment', 'container', file);
    asset.once('load', () => resolve(asset.resource));
    asset.once('error', reject);
    app.assets.add(asset);
    app.assets.load(asset);
    if (file.filename.endsWith('.glb')) { status('Preparing the apartment…', 0.85); return; }
    // An unpacked glTF gives no byte progress; creep the bar so it is clear something is happening.
    let f = 0.1; const t = setInterval(() => { f = Math.min(0.85, f + 0.02); status($('status').textContent, f); }, 400);
    asset.once('load', () => clearInterval(t)); asset.once('error', () => clearInterval(t));
  })),
]);
status('Lighting the rooms…', 0.9);

const apartment = container.instantiateRenderEntity({ castShadows: true, receiveShadows: true });
app.root.addChild(apartment);
tuneMaterials(apartment);

const camera = new pc.Entity('camera');
camera.addComponent('camera', { fov: 68, nearClip: 0.05, farClip: 60, clearColor: new pc.Color(0, 0, 0) });
app.root.addChild(camera);
// Reflection and bounce-light probes (probes.js): set up on every apartment material before the doors, wardrobe and
// flashlight take their parts out of the apartment; captured from the lit rooms once everything is in place, and again
// whenever a switch or lamp changes the lighting, with the flashlight beam held out of them.
const ambientLevel = hash.has('amb') ? Number(hash.get('amb')) : AMBIENT;
const probes = new Probes(app, camera, apartment, { ambient: ambientLevel });
app.scene.envAtlas = ZONES.main.atlas;       // for the few materials made at run time (switch plates, bezels)
app.scene.skyboxIntensity = ambientLevel;
const lit = setupLighting(app);
const downlights = addDownlights(app, grid);
const frame = setupPost(app, camera);
if (hash.has('q')) setQuality(frame, Number(hash.get('q')));

const start = shot ? { x: shot[0], z: shot[1], yaw: shot[2] } : SPAWN;
const player = new Player(app, camera, grid, start);
if (shot && shot.length > 3) { player.pitch = shot[3]; player.apply(0); }

const ambience = new Ambience();
const interactions = new Interactions(camera, $('prompt'), $('reticle'));
const toast = (text) => { const t = $('toast'); t.textContent = text; t.hidden = false; t.classList.remove('fade'); clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.add('fade'), 4000); };
const closets = new Closets(app, apartment, interactions, ambience, grid);
closets.player = player;
const doors = new Doors(app, apartment, interactions, grid, player, ambience);
if (hash.has('open')) closets.doors.forEach(d => closets.toggle(d));
const flashlight = new Flashlight(app, camera, apartment, interactions, ambience, toast,
  { x: FLASHLIGHT_SPOT.pos.x, z: FLASHLIGHT_SPOT.pos.z, shelf: 1.84, yaw: 0 }, grid, player);
frontDoor(apartment);
// The flashlight is stored far below the flat in the file (so its probe guess is the open-plan room); it lies in the bedroom.
for (const r of flashlight.root.findComponents('render')) for (const mi of r.meshInstances) probes.assign(mi.material, 'bed');

let capturing = null, rain = null;
const recapture = async (passes = 1) => {
  if (capturing) { capturing.again = true; return; }
  capturing = {};
  do {
    capturing.again = false;
    flashlight.suspend(true);
    await probes.captureAll(passes);
    flashlight.suspend(false);
    // The window drops glow faintly with the room's light (they refract the lit room); dark flat, dark drops.
    const lit = switches.rooms.filter(r => r.on).length / switches.rooms.length;
    if (rain) rain.roomLight = 0.25 + 0.75 * lit;
  } while (capturing.again);
  capturing = null;
};
const switches = new Switches(app, grid, apartment, interactions, ambience, recapture, downlights);
const devices = new Devices(app, apartment, interactions, ambience, recapture);
if (hash.has('dark')) {
  switches.rooms.forEach(r => { if (r.on) switches.toggle(r); });
  devices.lamps.forEach(l => { if (l.on) devices.toggleLamp(l); });
}
if (hash.has('allon')) switches.rooms.forEach(r => { if (!r.on) switches.toggle(r); });
if (hash.has('flash')) flashlight.pickUp();
rain = new Rain(app, apartment, ambience, lit);

// One frame of the lit rooms first, then capture the probes from them (three times: light bouncing round the rooms).
await new Promise(r => app.once('frameend', r));
await recapture(3);
const eyes = new EyeAdaptation(app, camera, probes, flashlight);
if (hash.has('ev')) { eyes.enabled = false; app.on('update', () => { app.scene.exposure = Number(hash.get('ev')); }); }

player.onStep = (surface, speed) => ambience.step(surface, speed);
const fwd = new pc.Vec3(), up = new pc.Vec3();
app.on('update', (dt) => {
  player.update(dt);
  interactions.enabled = player.active;
  interactions.update();
  fwd.copy(camera.forward); up.copy(camera.up);
  ambience.listen(camera.getPosition(), fwd, up);
});

// Quality: keys 1-3, or automatic during the first seconds of walking (drops a level while below ~40 / ~24 fps).
let quality = hash.has('q') ? Number(hash.get('q')) : 3, manual = hash.has('q'), probe = { t: 0, frames: 0 };
window.addEventListener('keydown', (e) => {
  if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') { quality = Number(e.code.slice(5)); manual = true; setQuality(frame, quality); }
});
app.on('update', (dt) => {
  if (manual || !player.active || quality === 1) return;
  probe.t += dt; probe.frames++;
  if (probe.t < 4) return;
  const fps = probe.frames / probe.t;
  probe.t = 0; probe.frames = 0;
  if (fps < (quality === 3 ? 40 : 24)) { quality--; setQuality(frame, quality); console.info(`quality ${quality} (${fps.toFixed(0)} fps)`); }
  else manual = true;   // fast enough: stop checking
});
if (hash.has('stats')) stats(app, device);
const devMenu = new DevMenu({ app, flashlight, switches, devices, closets, rain, recapture, eyes,
  stats: () => { if (!document.getElementById('stats')) stats(app, device); } });
interactions.blockKey = (key) => devMenu.typing(key);

status('Ready.', 1);
$('loading').hidden = true;
const enter = $('enter');
enter.hidden = false;
const intro = $('intro');
const lock = () => canvas.requestPointerLock?.()?.catch?.(() => {});
enter.addEventListener('click', () => { ambience.start(); lock(); });
canvas.addEventListener('click', () => { if (player.active && document.pointerLockElement !== canvas) lock(); });
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  player.active = locked;
  intro.classList.toggle('gone', locked);
  $('reticle').hidden = !locked;
  enter.textContent = locked ? 'Click to enter' : 'Click to continue';
  if (locked) showHint();
});
if (shot) { intro.classList.add('gone'); intro.style.display = 'none'; player.active = false; }
window.__state.ready = true;
window.__app = { app, player, frame, camera, flashlight, interactions, switches, rain, doors, devices, closets, probes, devMenu, eyes };

// The artifact build (tools/make-artifact.mjs) ships the apartment as one GLB split into base64 text parts listed in
// apartment.json; download them with real progress and reassemble the GLB in memory. Otherwise load the glTF.
async function modelFile() {
  const manifest = await fetch(`${ASSETS}apartment.json`).then(r => (r.ok ? r.json() : null), () => null);
  if (!manifest) return { url: `${ASSETS}scene.gltf`, filename: 'scene.gltf' };
  const glb = new Uint8Array(manifest.bytes);
  const offsets = manifest.parts.reduce((a, p) => [...a, a[a.length - 1] + p.bytes], [0]);
  let done = 0;
  const one = async (p, i) => {
    const text = await fetch(`${ASSETS}${p.file}`).then(r => { if (!r.ok) throw new Error(`${p.file}: HTTP ${r.status}`); return r.text(); });
    const bytes = Uint8Array.fromBase64 ? Uint8Array.fromBase64(text) : Uint8Array.from(atob(text), c => c.charCodeAt(0));
    glb.set(bytes, offsets[i]);
    done += p.bytes;
    status(`Loading the apartment… ${(done / 1e6).toFixed(0)} / ${(manifest.bytes / 1e6).toFixed(0)} MB`, 0.1 + 0.7 * done / manifest.bytes);
  };
  // Three downloads at a time.
  const queue = manifest.parts.map((p, i) => [p, i]);
  await Promise.all([0, 1, 2].map(async () => { while (queue.length) await one(...queue.shift()); }));
  return { url: URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' })), filename: 'apartment.glb' };
}

// The front door (downloaded model, materials 'Prop_front_door.*') is the way out, and it is locked.
function frontDoor(root) {
  const parts = root.findComponents('render').filter(r => r.meshInstances.some(mi => mi.material.name.startsWith('Prop_front_door.')));
  if (!parts.length) return;
  const box = parts[0].meshInstances[0].aabb.clone();
  for (const r of parts) for (const mi of r.meshInstances) box.add(mi.aabb);
  const c = box.center;
  interactions.add({ pos: new pc.Vec3(c.x, 1.05, box.getMin().z), size: 0.45, label: () => 'Front door',
    use: () => { ambience.lockedDoor(); toast('It is locked.'); } });
}

function showHint() {
  const h = $('hint');
  if (h.dataset.shown) return;
  h.dataset.shown = '1'; h.hidden = false;
  setTimeout(() => h.classList.add('fade'), 6000);
}

// Glass stays see-through but reflective; screens and lamp emitters glow into the bloom without blinding.
function tuneMaterials(root) {
  const seen = new Set(), hidden = new Set(), noShadow = new Set(), noCast = new Set();
  for (const r of root.findComponents('render')) for (const mi of r.meshInstances) {
    const m = mi.material, name = baseName(m.name);
    if (seen.has(m)) continue;
    seen.add(m);
    if (/^Glass/i.test(name)) { m.gloss = 0.95; m.metalness = 0; m.useMetalness = true; m.depthWrite = false; }
    if (/Screen/i.test(name)) m.emissiveIntensity = 0.35;
    if (name === 'Keylight') m.emissiveIntensity = 0.6;
    if (name === 'Light') m.emissiveIntensity = 3;
    if (name === '97.001') { m.opacity = 0; m.update(); hidden.add(m); }   // sheer curtains across the windows: drawn back, so the rain shows
    if (name.startsWith('Plain_Natural_Sheer') || name === 'White1.curtain') noShadow.add(m);   // thin double-sided drapes: shadow acne streaks
    if (name === 'White1.curtain') m.gloss = 0.12;     // the model's curtains were glossy (roughness 0.36): fabric is matte
    // Opal glass globes of the dining pendants: they glow when the pendants are on (switches.js) and cast no shadow.
    if (name === 'White1.pendant') { m.emissive = new pc.Color(1, 0.78, 0.55); m.emissiveIntensity = 1.3; noCast.add(m); }
    // See-through things cast no shadows (the shower screen, glasses, the pendants' glass round their bulbs, windows).
    if (m.blendType !== pc.BLEND_NONE || /^Glass|WindowGlass/i.test(name)) noCast.add(m);
    m.update();
  }
  for (const r of root.findComponents('render')) for (const mi of r.meshInstances) {
    if (hidden.has(mi.material)) mi.visible = false;
    if (noShadow.has(mi.material)) mi.receiveShadow = false;
    if (noCast.has(mi.material)) mi.castShadow = false;
  }
}

function stats(app, device) {
  const el = document.createElement('div'); el.id = 'stats'; document.body.appendChild(el);
  let frames = 0, last = performance.now();
  app.on('frameend', () => {
    frames++;
    const now = performance.now();
    if (now - last < 500) return;
    const s = app.stats.drawCalls, f = app.stats.frame;
    el.textContent = `${(frames * 1000 / (now - last)).toFixed(0)} fps  ${device.isWebGPU ? 'WebGPU' : 'WebGL2'}\ndraw calls ${s.total}  tris ${(f.triangles / 1e3).toFixed(0)}k`;
    frames = 0; last = now;
  });
}
