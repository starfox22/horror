// Boot: graphics device (WebGPU, else WebGL2), decoders, the apartment, lighting, post-processing, player, ambience.
// Hash options (the only URL part that survives in a claude.ai artifact): #webgl forces WebGL2, #stats shows timings,
// #shot=x,z,yaw[,pitch] places the camera and skips the intro (used by tools/shoot.mjs for screenshots),
// #q=1|2|3 picks the quality level, #ev=<number> and #amb=<number> override exposure and bounce light (for tuning),
// #dark switches every light off, #allon every switch on, #flash starts with the flashlight in hand, #open opens the wardrobe.
import * as pc from 'playcanvas';
import { SHADOWUPDATE_THISFRAME } from 'playcanvas';
import { WalkGrid } from './walkgrid.js';
import { Player } from './player.js';
import { setupLighting, addDownlights, fixShadowAtlas, effectsLayer } from './lighting.js';
import { Probes, ZONES, baseName } from './probes.js';
import { setupPost, EyeAdaptation } from './post.js';
import { GraphicsPreferences, GraphicsSettings } from './graphics-settings.js';
import { SceneQuality, backingPixelRatio, sceneQualityOptions } from './scene-quality.js';
import { installFrameLimiter } from './frame-limiter.js';
import { WakeSequence, WAKE_EXIT } from './wake-sequence.js';
import { Fridge } from './fridge.js';
import { DrinkSequence } from './drink-sequence.js';
import './wake-sequence.css';
import { Ambience } from './ambience.js';
import { Interactions } from './interact.js';
import { Switches } from './switches.js';
import { Closets, FLASHLIGHT_SPOT } from './closets.js';
import { Flashlight } from './flashlight.js';
import { Rain } from './rain.js';
import { Doors } from './doors.js';
import { Devices } from './devices.js';
import { DevMenu } from './devmenu.js';
import { warmUp, revealInFront } from './warmup.js';
import { Director } from './story-events.js';
import { FallingGlass } from './falling-glass.js';
import { Thought } from './thought.js';
import { setPacked } from './packed.js';
import { Intruder } from './intruder.js';

const ASSETS = new URL('./assets/apartment/', location.href).href;
const SPAWN = { x: WAKE_EXIT.x, z: WAKE_EXIT.z, yaw: WAKE_EXIT.yaw }; // clear bedside landing
const AMBIENT = 0.9;                                  // strength of the room probes' bounce light (probes.js)
const hash = new URLSearchParams(location.hash.slice(1));
const shot = hash.get('shot')?.split(',').map(Number);
let graphicsStorage = null;
try { graphicsStorage = window.localStorage; } catch { /* browser privacy mode */ }
const graphicsPreferences = new GraphicsPreferences({ storage: graphicsStorage, qualityOverride: hash.get('q'), forceFps: hash.has('stats') });

const $ = (id) => document.getElementById(id);
// Film grain tile for the #grain overlay (style.css animates it).
{
  const c = document.createElement('canvas'); c.width = c.height = 192;
  const g = c.getContext('2d'), img = g.createImageData(192, 192);
  for (let i = 0; i < img.data.length; i += 4) { const v = 128 + (Math.random() + Math.random() - 1) * 110; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  $('grain').style.backgroundImage = `url(${c.toDataURL()})`;
}
const status = (text, frac) => {
  if (window.__state?.error) return;
  $('status').textContent = text;
  if (frac !== undefined) $('bar').style.width = `${Math.round(frac * 100)}%`;
};
window.__state = { ready: false, error: null };
const showError = (error) => {
  if (window.__state.error) return;  // keep the useful cause instead of a later generic 'Script error'
  const message = error?.message || String(error || 'Unknown loading error');
  window.__state = { ready: false, error: message };
  if (document.pointerLockElement) document.exitPointerLock?.();
  $('loading').hidden = false;
  $('status').textContent = `Unable to load the apartment: ${message}`;
  $('enter').hidden = true;
  $('graphics-open').hidden = true;
  document.getElementById('graphics-dialog')?.close();
  const waking = document.getElementById('wake-sequence');
  if (waking) waking.hidden = true;
  $('retry').hidden = false;
  $('intro').classList.remove('gone');
  $('intro').style.display = '';
};
const failLoad = (error) => { showError(error); throw error; };
window.addEventListener('error', (event) => showError(event.error || event.message));
window.addEventListener('unhandledrejection', (event) => showError(event.reason));
$('retry').addEventListener('click', () => location.reload());

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
}).catch(failLoad);
device.maxPixelRatio = backingPixelRatio(sceneQualityOptions(graphicsPreferences.effective.quality),
  window.innerWidth, window.innerHeight, window.devicePixelRatio);

const opts = new pc.AppOptions();
opts.graphicsDevice = device;
opts.componentSystems = [pc.RenderComponentSystem, pc.CameraComponentSystem, pc.LightComponentSystem, pc.ParticleSystemComponentSystem, pc.AnimComponentSystem];
opts.resourceHandlers = [pc.TextureHandler, pc.ContainerHandler];
const app = new pc.AppBase(canvas);
app.init(opts);
const frameLimiter = installFrameLimiter(app, { limit: graphicsPreferences.state.fpsLimit });
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);
window.addEventListener('resize', () => app.resizeCanvas());
app.start();
status(`Loading the apartment… (${device.isWebGPU ? 'WebGPU' : 'WebGL 2'})`, 0.1);

const [grid, container] = await Promise.all([
  fetch(`${ASSETS}collision.json`).then(r => {
    if (!r.ok) throw new Error(`Collision data: HTTP ${r.status}`);
    return r.json();
  }).then(j => new WalkGrid(j)),
  modelFile().then((file) => new Promise((resolve, reject) => {
    const asset = new pc.Asset('apartment', 'container', file);
    const release = () => { if (file.url.startsWith('blob:')) URL.revokeObjectURL(file.url); };
    asset.once('load', () => { release(); resolve(asset.resource); });
    asset.once('error', (error) => { release(); reject(new Error(`Apartment model: ${error}`)); });
    app.assets.add(asset);
    app.assets.load(asset);
    if (file.filename.endsWith('.glb')) { status('Preparing the apartment…', 0.85); return; }
    // An unpacked glTF gives no byte progress; creep the bar so it is clear something is happening.
    let f = 0.1; const t = setInterval(() => { f = Math.min(0.85, f + 0.02); status($('status').textContent, f); }, 400);
    asset.once('load', () => clearInterval(t)); asset.once('error', () => clearInterval(t));
  })),
]).catch(failLoad);
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
effectsLayer(app, camera);                   // particles: the player's camera only (lighting.js)
app.scene.envAtlas = ZONES.main.atlas;       // for the few materials made at run time (switch plates, bezels)
app.scene.skyboxIntensity = ambientLevel;
const lit = setupLighting(app);
const downlights = addDownlights(app, grid);
const frame = setupPost(app, camera, graphicsPreferences.effective);
$('grain').hidden = !graphicsPreferences.effective.filmGrain;

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
  FLASHLIGHT_SPOT, grid, player);
frontDoor(apartment);
// The flashlight is stored far below the flat in the file (so its probe guess is the open-plan room); it lies in the bedroom.
for (const r of flashlight.root.findComponents('render')) for (const mi of r.meshInstances) probes.assign(mi.material, 'bed');

let capturing = null, rain = null, captured = false;
// Re-measures the bounce light and reflections after the lights change (probes.js). The first capture (loading) is
// done in one go; later ones are spread over frames and fade in, restarting if the lights change again meanwhile.
const recapture = () => {
  if (capturing) { capturing.again = true; return capturing.promise; }
  const capture = { again: false };
  capturing = capture;
  capture.promise = (async () => {
    try {
      do {
        capture.again = false;
        // Wait for fades/overrides (and a lightning flash: the probes must not keep it) before capturing.
        do await new Promise(r => app.once('frameend', r)); while (rain?.flashing);
        const on = app.root.findComponents('light').filter(l => l.enabled && l.intensity > 0.01 && !/flashlight|moon/.test(l.entity.name)).length;
        if (rain) rain.roomLight = Math.min(1, on / 12);
        await probes.captureAll({ instant: !captured, abort: () => capture.again });
        captured = true;
      } while (capture.again);
    } finally {
      capturing = null;
    }
  })();
  return capture.promise;
};
const switches = new Switches(app, grid, apartment, interactions, ambience, recapture, downlights);
for (const { material, zone } of switches.surfaceMaterials) probes.assign(material, zone);
const devices = new Devices(app, apartment, interactions, ambience, recapture);
devices.configureCoffeeMaterial = material => probes.assign(material, 'main');
const fridge = await Fridge.create({ app, apartment, interactions, grid, player, sounds: ambience,
  recapture, configureMaterial: material => probes.assign(material, 'main') }).catch(failLoad);
const drink = await DrinkSequence.create({ app, camera, player, fridge, interactions,
  configureMaterial: material => probes.assign(material, 'main'),
  onStart: () => { $('reticle').hidden = true; interactions.enabled = false; interactions.update(); },
  onComplete: () => { $('reticle').hidden = !player.active; interactions.enabled = player.active; },
}).catch(failLoad);
const playerCam = camera.camera.camera;
const intruder = await Intruder.create({ app, sounds: null, isPlayerCamera: cam => cam === playerCam || cam.node?.name === 'security camera' }).catch(failLoad);
app.on('update', () => intruder.update());
// Scripted events (story-events.js), in story order; the developer menu can play any of them.
const thought = new Thought();
const fallingGlass = await FallingGlass.create({ sounds: ambience, thought, listener: () => camera.getPosition() });
const events = new Director({ app, ctx: { fallingGlass: () => fallingGlass.play() },
  isPlaying: () => document.pointerLockElement === canvas && !document.hidden });
fridge.onShutAfterDrink = () => events.signal('fridge-shut-after-drink');
app.on('update', dt => thought.update(dt));
if (hash.has('dark')) {
  switches.rooms.forEach(r => { if (r.on) switches.toggle(r); });
  devices.lamps.forEach(l => { if (l.on) devices.toggleLamp(l); });
}
if (hash.has('allon')) switches.rooms.forEach(r => { if (!r.on) switches.toggle(r); });
if (hash.has('flash')) flashlight.pickUp();
rain = new Rain(app, apartment, ambience, lit);
fixShadowAtlas(app);
const sceneQuality = new SceneQuality(app, { rain });
sceneQuality.apply(graphicsPreferences.effective);

// One frame of the lit rooms first, then capture the probes from them.
await new Promise(r => app.once('frameend', r));
await recapture().catch(failLoad);
// Build every shader now rather than mid-game (warmup.js), with the things that only show up later on view.
if (!shot || hash.has('warm')) {
  status('Preparing the rooms…', 0.92);
  const coffee = devices.coffee;
  if (coffee) {
    coffee.effects ||= devices.createCoffeeEffects();
    // The coffee's liquid is the player's to see only: a probe capture during a brew would otherwise build shaders for
    // it mid-game (and the probes have no use for a few millimetres of espresso).
    const playerCamera = camera.camera.camera;
    for (const r of coffee.effects.root.findComponents('render')) for (const mi of r.meshInstances) {
      mi.isVisibleFunc = cam => cam === playerCamera && cam.frustum.containsAabb(mi.aabb);
    }
  }
  // The lightning's sky light renders its shadow (fitted to the view) on every warm-up frame, so its shadow shaders for
  // everything in the flat are built too.
  await warmUp({ app, camera, progress: f => { lit.moon.light.shadowUpdateMode = SHADOWUPDATE_THISFRAME; status('Preparing the rooms…', 0.92 + 0.08 * f); }, reveal: [
    revealInFront(drink.handCarrier),
    () => {
      if (!coffee?.effects) return null;
      const fx = coffee.effects;
      [...fx.streams, ...fx.drops, ...fx.surfaces, ...fx.ripples].forEach(e => { e.enabled = true; });
      fx.steam.forEach(s => s.entity.particlesystem.play());
      return () => fx.reset();
    },
    () => { rain.revealing = true; return () => { rain.revealing = false; }; },
    // Every shadowed lamp that starts off, on at zero for the sweep: its shadow is drawn (and its shadow shaders built)
    // now, so switching it on later costs nothing; it keeps its cell of the fixed shadow atlas (fixShadowAtlas).
    () => {
      const off = app.root.findComponents('light').filter(l => l.castShadows && !l.enabled && l.type !== 'directional' && !/^flashlight/.test(l.entity.name));
      const saved = off.map(l => [l, l.intensity, l.shadowUpdateMode]);
      for (const l of off) { l.intensity = 0; l.enabled = true; l.shadowUpdateMode = SHADOWUPDATE_THISFRAME; }
      return () => { for (const [l, intensity] of saved) { l.enabled = false; l.intensity = intensity; } };
    },
  ] }).catch(failLoad);
}
const eyes = new EyeAdaptation(app, camera, frame, probes, flashlight, hash.has('ev') ? Number(hash.get('ev')) : null);
const wake = shot ? null : new WakeSequence({ camera, player, onComplete: () => {
  $('reticle').hidden = !player.active;
  if (player.active) showHint();
} });

player.onStep = (surface, speed) => ambience.step(surface, speed);
const fwd = new pc.Vec3(), up = new pc.Vec3();
app.on('update', (dt) => {
  if (wake && !wake.completed) wake.update();
  else if (drink.running) drink.update();
  else player.update(dt);
  interactions.enabled = player.active && !drink.running;
  interactions.update();
  fwd.copy(camera.forward); up.copy(camera.up);
  ambience.listen(camera.getPosition(), fwd, up);
});

// Settings, hotkeys and Auto quality share one persisted preference model.
const fps = stats(app);
const graphics = new GraphicsSettings({ app, frame, player, canvas, grain: $('grain'), fps, frameLimiter,
  sceneQuality, canSample: () => !capturing,
  preferences: graphicsPreferences, button: $('graphics-open'),
  canOpen: () => window.__state.ready && !window.__state.error });
const devMenu = new DevMenu({ app, flashlight, switches, devices, closets, fridge, rain, recapture, eyes, events,
  stats: () => graphics.setShowFps(true) });
interactions.blockKey = (key) => devMenu.typing(key);

status('Ready.', 1);
$('loading').hidden = true;
const enter = $('enter');
enter.hidden = false;
enter.textContent = wake ? 'Wake up' : 'Click to enter';
const intro = $('intro');
const lock = () => canvas.requestPointerLock?.()?.catch?.(() => {});
enter.addEventListener('click', () => { ambience.start(); lock(); });
canvas.addEventListener('click', () => { if (player.active && document.pointerLockElement !== canvas) lock(); });
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  wake?.setLocked(locked);
  drink.setLocked(locked);
  player.active = locked && (!wake || wake.completed) && !drink.running;
  intro.classList.toggle('gone', locked);
  $('reticle').hidden = !player.active;
  enter.textContent = locked ? 'Click to enter' : 'Click to continue';
  if (player.active) showHint();
});
if (shot) { intro.classList.add('gone'); intro.style.display = 'none'; player.active = false; }
window.__state.ready = true;
window.__app = { app, player, frame, camera, flashlight, interactions, switches, rain, doors, devices, closets, fridge, drink, probes, devMenu, eyes, graphics, frameLimiter, sceneQuality, wake, events, thought, fallingGlass, intruder };

// The artifact build (tools/make-artifact.mjs) ships the apartment as one GLB split into base64 text parts listed in
// apartment.json; download them with real progress and reassemble the GLB in memory. Otherwise load the glTF.
async function modelFile() {
  const unpacked = { url: `${ASSETS}scene.gltf`, filename: 'scene.gltf' };
  const response = await fetch(`${ASSETS}apartment.json`);
  if (response.status === 404) return unpacked;
  if (!response.ok) throw new Error(`Apartment manifest: HTTP ${response.status}`);
  const text = await response.text();
  // Some static hosts rewrite absent paths to index.html. This optional manifest is absent in the normal glTF build.
  if (/^\s*</.test(text)) return unpacked;
  let manifest;
  try { manifest = JSON.parse(text); } catch { throw new Error('Apartment manifest is not valid JSON'); }
  setPacked(true);       // the artifact build: other GLBs ship as base64 text too (packed.js)
  if (!Number.isSafeInteger(manifest?.bytes) || manifest.bytes <= 0 || !Array.isArray(manifest.parts) || !manifest.parts.length ||
      manifest.parts.some(p => typeof p.file !== 'string' || !Number.isSafeInteger(p.bytes) || p.bytes <= 0) ||
      manifest.parts.reduce((sum, part) => sum + part.bytes, 0) !== manifest.bytes) {
    throw new Error('Apartment manifest has invalid part sizes');
  }
  const glb = new Uint8Array(manifest.bytes);
  const offsets = manifest.parts.reduce((a, p) => [...a, a[a.length - 1] + p.bytes], [0]);
  let done = 0;
  const one = async (p, i) => {
    const text = await fetch(`${ASSETS}${p.file}`).then(r => { if (!r.ok) throw new Error(`${p.file}: HTTP ${r.status}`); return r.text(); });
    const bytes = Uint8Array.fromBase64 ? Uint8Array.fromBase64(text) : Uint8Array.from(atob(text), c => c.charCodeAt(0));
    if (bytes.length !== p.bytes) throw new Error(`Apartment part ${p.file}: expected ${p.bytes} bytes, received ${bytes.length}`);
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
  const anisotropy = Math.min(8, device.maxAnisotropy || 1);
  const textureMaps = ['diffuseMap', 'normalMap', 'metalnessMap', 'glossMap', 'aoMap', 'emissiveMap', 'opacityMap'];
  for (const r of root.findComponents('render')) for (const mi of r.meshInstances) {
    const m = mi.material, name = baseName(m.name);
    if (seen.has(m)) continue;
    seen.add(m);
    // Keep floor grain, fabric and normal detail legible at grazing angles without changing their authored roughness.
    for (const name of textureMaps) if (m[name]) m[name].anisotropy = anisotropy;
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

function stats(app) {
  let el = document.getElementById('stats');
  const control = { get el() { return el; }, setVisible: visible => { el.hidden = !visible; } };
  if (el) return control;
  el = document.createElement('div'); el.id = 'stats';
  el.setAttribute('aria-label', 'Frame rate');
  el.textContent = 'FPS …';
  document.body.appendChild(el);
  let frames = 0, last = performance.now();
  app.on('frameend', () => {
    frames++;
    const now = performance.now(), elapsed = now - last;
    if (elapsed < 500) return;
    const fps = frames * 1000 / elapsed;
    el.textContent = `${fps.toFixed(0)} FPS · ${(elapsed / frames).toFixed(1)} ms`;
    frames = 0; last = now;
  });
  return control;
}
