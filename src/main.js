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
import { SoundBank } from './sound.js';
import { Music } from './music.js';
import { Power } from './power.js';
import { Fusebox } from './fusebox.js';
import { Story } from './story.js';
import { World } from './world.js';
import { Taps } from './taps.js';
import { Nest } from './nest.js';
import { Seccam } from './seccam.js';
import { Phone } from './phone.js';
import { Hunt } from './hunt.js';
import { Death } from './death.js';
import { Endings } from './endings.js';
import { Hud } from './hud.js';
import { Journal } from './journal.js';
import { Menu } from './menu.js';
import { NavGrid } from './navgrid.js';
import { creditsHtml } from './credits.js';
import { Props } from './props.js';
import { Crow } from './crow.js';

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
  menu?.setLoading(frac ?? lastFrac, text); if (frac !== undefined) lastFrac = frac;
};
let lastFrac = 0, menu = null;
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
  if (menu) menu.root.hidden = true;
};
const failLoad = (error) => { showError(error); throw error; };
// Before the flat has loaded, an error is the end (the load screen says so); after, it is logged and the night goes on.
window.addEventListener('error', (event) => (window.__state?.ready ? console.error(event.error || event.message) : showError(event.error || event.message)));
window.addEventListener('unhandledrejection', (event) => (window.__state?.ready ? console.error(event.reason) : showError(event.reason)));
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

// The title screen (menu.js) is up from the start, over the loading; the sounds load alongside the flat.
menu = shot ? null : new Menu({
  newGame: (difficulty) => startNight({ difficulty }),
  continueGame: () => startNight({ save: story.load() }),
  chapter: (act) => startNight({ chapter: act }),
  resume: () => lock(),
  restartCheckpoint: () => startNight({ save: story.load() }),
  quitToTitle: () => toTitle(),
  apply: (settings) => applySettings(settings),
  openGraphics: () => graphics?.open?.(),
  hasSave: () => story?.hasSave() ? `${['', 'I · Water', 'II · Dark', 'III · Steam', 'IV · Out'][story.load().act]}` : '',
  journal: () => journal?.entries() || [],
  everFound: () => journal?.ever || new Set(),
  status: () => story ? `${['', 'I · Water', 'II · Dark', 'III · Steam', 'IV · Out'][story.act]} · ${journal?.count || 0} in the journal` : '',
  checkpointName: () => story?.hasSave() ? ['', 'the start of the night', 'the dark', 'the light back on', 'the hunt'][story.load().act] : '',
  credits: creditsHtml(),
  sound: (kind) => bank?.play(kind === 'hover' ? 'latch_2' : 'breaker_1', { gain: kind === 'hover' ? 0.05 : 0.12, rate: kind === 'hover' ? 2.4 : 1.8, bus: 'ui' }),
});
if (menu) { $('intro').style.display = 'none'; menu.setBuild('Build 0.14'); menu.open('loading'); }
const ambience = new Ambience();
const bank = new SoundBank(ambience);
const soundsLoading = bank.load('./assets/audio/').catch(error => { console.warn(`Recorded sounds unavailable: ${error.message}`); return null; });
const [grid, container, sightData, props] = await Promise.all([
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
  fetch(`${ASSETS}sight.json`).then(r => { if (!r.ok) throw new Error(`Sight data: HTTP ${r.status}`); return r.json(); }),
  Props.load(app),
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

const interactions = new Interactions(camera, $('prompt'), $('reticle'));
const toast = (text) => { const t = $('toast'); t.textContent = text; t.hidden = false; t.classList.remove('fade'); clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.add('fade'), 4000); };
const closets = new Closets(app, apartment, interactions, ambience, grid);
closets.player = player;
const doors = new Doors(app, apartment, interactions, grid, player, ambience);
if (hash.has('open')) closets.doors.forEach(d => closets.toggle(d));
const flashlight = new Flashlight(app, camera, apartment, interactions, ambience, toast,
  FLASHLIGHT_SPOT, grid, player);
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
  onComplete: () => { $('reticle').hidden = !player.active; interactions.enabled = player.active; story.drank(); },
}).catch(failLoad);
const playerCam = camera.camera.camera;
const intruder = await Intruder.create({ app, sounds: null, isPlayerCamera: cam => cam === playerCam || cam.node?.name === 'security camera' }).catch(failLoad);
app.on('update', () => intruder.update());
// --- The story (docs/STORY.md): power, the fuse box, the world's states, the nest, the phone and camera, the hunt ---
const thought = new Thought();
const fallingGlass = await FallingGlass.create({ sounds: ambience, thought, listener: () => camera.getPosition() });
const hud = new Hud();
const journal = new Journal({ hud });
const items = { set: new Set(), has(k) { return this.set.has(k); }, add(k) { this.set.add(k); }, save() { return [...this.set]; }, load(a = []) { this.set = new Set(a); } };
const power = new Power({ app });
switches.power = devices.power = fridge.power = closets.power = power;
const nav = new NavGrid(grid, sightData);
bank.nav = nav;
const music = new Music(bank);
// #play (tests): the night runs without pointer lock, so a headless browser can play it through.
const forcePlay = hash.has('play');
const isPlaying = () => (forcePlay || document.pointerLockElement === canvas && !document.hidden) && !hud.reading && !story?.has('ended');
const sys = { app, camera, player, interactions, thought, bank, power, switches, devices, fridge, closets, doors, flashlight,
  intruder, hud, journal, items, music, nav };
const story = new Story(sys);
const events = new Director({ app, ctx: { story, fallingGlass: () => fallingGlass.play() }, isPlaying });
sys.events = events;
const fusebox = new Fusebox({ app, interactions, power, bank, story, hud, props, configureMaterial: m => probes.assign(m, 'hall') });
// The kitchen and bathroom taps (taps.js): E turns each on or off; the story runs the bathroom's through world.tap().
const taps = new Taps({ app, interactions, bank, camera, isVisible: cam => cam === playerCam, configureMaterial: (m, zone) => probes.assign(m, zone) });
taps.isPlaying = isPlaying;
const world = new World({ app, sounds: ambience, bank, doors, closets, interactions, story, hud, glassGeometry: fridge.glassGeometry, props, fridge, taps,
  configureMaterial: (m, name) => probes.assign(m, ['main', 'hall', 'bath', 'bed'].includes(name) ? name : /mirror|flood/.test(name) ? 'bath' : /print/.test(name) ? 'hall' : /notice|diary|tin|knife/.test(name) ? 'main' : 'bed') });
const nest = new Nest({ app, interactions, story, hud, bank, closets, props, configureMaterial: m => probes.assign(m, 'bed'),
  stills: { url: id => `./assets/clips/${id}.jpg` } });
const seccam = new Seccam({ app, camera, intruder, closets, nest, story, bank, props, configureMaterial: m => probes.assign(m, 'bed') });
const phone = new Phone({ app, camera, interactions, bank, story, hud, seccam, clock: { now: () => nightClock() } });
phone.power = power;
const hunt = new Hunt({ app, intruder, nav, walk: grid, player, camera, flashlight, bank, story, music, difficulty: () => story.difficulty });
const fadeEl = Object.assign(document.createElement('div'), { id: 'fade' }); document.body.appendChild(fadeEl);
const death = new Death({ app, camera, player, intruder, bank, music, veil: fadeEl, walk: grid });
const endings = new Endings({ story, bank, music, hud, menu, fade: fadeEl, player, camera, clock: { label: () => nightClock().toTimeString().slice(0, 5) },
  stills: { show: async (id) => { const url = await seccam.still(id, 0); if (url) hud.examine({ className: 'photo', html: `<img src="${url}" alt="The camera, 03:14: the bed, and a man standing at its foot">` }); }, hide: () => hud.closeDoc() } });
Object.assign(sys, { fusebox, world, nest, seccam, phone, hunt, death, endings, events, sounds: ambience, taps });
frontDoor(apartment);
fridge.onShutAfterDrink = () => events.signal('fridge-shut-after-drink');
doors.onLocked = () => story.bathroomTried();
doors.lockedLabel = () => (story.has('bath-tried') && !story.has('power-cut') ? 'Knock' : null);
closets.stuck = (door) => story.wardrobeStuck(door);
closets.opened = (door) => story.wardrobeOpened(door);
phone.noise = (x, z, kind = 'phone') => { const p = player.pos; hunt.noise(x ?? p.x, z ?? p.z, kind); };
player.onNoise = (x, z, kind) => hunt.noise(x, z, kind);
taps.onNoise = (x, z, kind) => hunt.noise(x, z, kind);      // running water: a lure in the hunt (7 m)
doors.onNoise = closets.onNoise = (x, z, kind) => hunt.noise(x, z, kind);   // a door or the wardrobe worked: 6 m
taps.on((id, on, { by } = {}) => { if (!on && by === 'player') story.tapClosed(id); });   // the pipes knock (story.js)
player.surfaceAt = (x, z) => world.surfaceAt(x, z);
// The bathroom visit (Act III): stepping into it once the door stands open.
story.on(flag => { if (flag === 'restored') music.swell(0.25, 6); });
power.onChange(event => {
  // Every light and screen takes its circuit's level (during a cut or restore, every frame).
  switches.rooms.forEach(r => switches.apply(r));
  devices.powerChanged(event);
  fridge.applyLighting();
  closets.applyLeds();
  ambience.setFridgePower(power.live('kitchen'));
  if (event?.settled) {
    recapture();
    if (story.has('power-cut') && !story.has('restored') && power.rcd && power.main && power.live('lights2')) story.powerRestored();
  }
});
// The phone (props.js 'phone'): in the hand (phone.js), and lying on the south nightstand (dead, its charger pulled out
// of the wall, when the night begins; charging there once it is put back: story.js phoneTaken / phoneCharging).
{
  const held = props.make('phone', { name: 'phone model', configure: m => probes.assign(m, 'main'), castShadows: false });
  if (held) phone.setModel(held);
  const charging = props.make('phone', { at: [phone.chargerAt.x, phone.chargerAt.y + 0.004, phone.chargerAt.z], euler: [-90, 95, 0], name: 'phone on the nightstand', configure: m => probes.assign(m, 'bed'), castShadows: false });
  phone.useScreen(charging);
  charging.enabled = phone.onCharger;
  phone.charger = on => { charging.enabled = on; };
}
// The bed: hold E to go back to sleep (Sweet Dreams), between the glass and the cut.
{
  let holdTimer = null;
  const bedItem = interactions.add({ pos: new pc.Vec3(12.7, 0.75, 0.5), size: 0.9, active: () => story.canSleep(), label: () => 'Hold E · go back to sleep',
    use: () => { clearTimeout(holdTimer); holdTimer = setTimeout(() => { if (eDown && story.canSleep() && interactions.focus === bedItem) story.sleptAgain(); }, 1500); } });
}
let eDown = false;
window.addEventListener('keydown', e => { if (e.code === 'KeyE') eDown = true; });
window.addEventListener('keyup', e => { if (e.code === 'KeyE') eDown = false; });
window.addEventListener('blur', () => { eDown = false; });
sys.eHeld = () => eDown && isPlaying();                 // the front door's lock turns while E is held (story.js)
flashlight.canToggle = () => isPlaying() && !death.busy && !endings.running;
phone.blocked = () => !isPlaying() || death.busy || !!endings.running;
app.on('update', dt => thought.update(isPlaying() ? dt : 0));
// Journal toasts wait for a quiet moment: 5 s after a scare, no thought on screen.
journal.ready = () => story.time - story.lastScare >= 5 && !thought.line && !thought.queue.length;
app.on('update', dt => journal.update(isPlaying() ? dt : 0));
// The bedside clock keeps the night's time from 03:07, and is back at 03:07 every time you wake from him (story.wake).
let clockFrom = 0;
story.on(flag => { if (flag === 'woke') clockFrom = story.time; });
app.on('update', () => world.setClock(3 * 3600 + 7 * 60 + Math.max(0, story.time - clockFrom)));
if (hash.has('dark')) {
  switches.rooms.forEach(r => { if (r.on) switches.toggle(r); });
  devices.lamps.forEach(l => { if (l.on) devices.toggleLamp(l); });
}
if (hash.has('allon')) switches.rooms.forEach(r => { if (!r.on) switches.toggle(r); });
if (hash.has('flash')) flashlight.pickUp();
rain = new Rain(app, apartment, ambience, lit);
// The crow at a window (crow.js; docs/STORY.md beat 5): once a night before the man is seen, by the player's camera only.
const crow = await Crow.create({ app, camera, player, story, bank, rain, isPlaying, isVisible: cam => cam === playerCam,
  configureMaterial: (m, zone) => probes.assign(m, zone), blocked: () => drink.running || phone.raised || hud.reading || death.busy || !!endings.running });
sys.crow = crow;
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
  await warmUp({ app, camera, progress: f => {
    lit.moon.light.shadowUpdateMode = SHADOWUPDATE_THISFRAME; status('Preparing the rooms…', 0.92 + 0.08 * f);
    // The hatch's dust plays for the first half, then stops: a stopped emitter's update is its own shader (WebGPU).
    if (f > 0.5 && !nest.dustStoppedForWarmUp) { nest.dustStoppedForWarmUp = true; nest.dustEntity.particlesystem.stop(); }
    // The intruder two metres in front of each view, so every angle of him (and his light's shadow) is built.
    const c = camera.getPosition(), fw = camera.forward;
    intruder.place(c.x + fw.x * 2, c.z + fw.z * 2, Math.atan2(-fw.x, -fw.z) * 180 / Math.PI, Math.max(0.16, c.y - 1.5));
    // The home camera looks at him too (its own tone mapping makes its own shader variants: LIVE shows him).
    seccam.entity.lookAt(intruder.pos.x, intruder.pos.y + 1.2, intruder.pos.z);
    // The light under the bathroom door, on the floor a step ahead of each view (it is put back afterwards).
    world.doorGlow?.setPosition(c.x + fw.x * 1.4, Math.max(0.17, c.y - 1.3), c.z + fw.z * 1.4);
  }, reveal: [
    revealInFront(drink.handCarrier),
    () => {
      if (!coffee?.effects) return null;
      const fx = coffee.effects;
      [...fx.streams, ...fx.drops, ...fx.surfaces, ...fx.ripples].forEach(e => { e.enabled = true; });
      fx.steam.forEach(s => s.entity.particlesystem.play());
      return () => fx.reset();
    },
    () => { rain.revealing = true; return () => { rain.revealing = false; }; },
    () => taps.reveal(),                       // the taps' water (taps.js)
    () => {                                    // the torch's shadow, with him in it (flashlight.js warm, intruder.js)
      flashlight.warming = true;
      return () => { flashlight.warming = false; flashlight.beam.light.enabled = flashlight.on && flashlight.held; };
    },
    () => {                                    // the light under the bathroom door (world.js)
      const glow = world.doorGlow, at = glow?.getPosition().clone();
      world.warming = true; world.doorGlowLevel = -1; world.updateDoorGlow();
      return () => { world.warming = false; if (at) glow.setPosition(at); world.doorGlowLevel = -1; world.updateDoorGlow(); };
    },
    () => crow.reveal(),                       // the crow, his feathers and the smear on the glass (crow.js)
    // Build 0.13: the story's later things on view for the sweep (their shaders, and the intruder's light's shadows).
    // The phone held up with its video showing (phone.update keeps the holder only while it is raised).
    () => { phone.raised = true; phone.raiseK = 1; phone.video.enabled = true; return () => { phone.raised = false; phone.raiseK = 0; phone.video.enabled = false; phone.holder.enabled = false; }; },
    () => {
      const was = { shards: world.hasShards, flood: world.floodLevel, prints: world.printRoot.enabled, fog: world.fog.enabled, hatch: nest.hatchOpen, dryer: !!world.dryer?.enabled, charging: phone.onCharger };
      world.shards(true); world.flood(1); world.prints(true); world.mirrorFog(true); nest.hatch(true); nest.dustEntity.particlesystem.play();
      if (nest.dropEntity) { nest.dropEntity.enabled = true; nest.dropEntity.setPosition(9.55, 1.6, -0.1); }
      world.dryerInBasin(true); phone.charger?.(true);
      intruder.show(true); intruder.setTorch(true); intruder.play('walk_slow_01', { blend: 0 });
      seccam.entity.camera.enabled = true;
      return () => {
        world.shards(was.shards); world.flood(was.flood); world.prints(was.prints); world.mirrorFog(was.fog); nest.hatch(was.hatch); nest.dustEntity.particlesystem.stop();
        if (nest.dropEntity) nest.dropEntity.enabled = false;
        world.dryerInBasin(was.dryer); phone.charger?.(was.charging);
        intruder.setTorch(false); intruder.show(false); seccam.entity.camera.enabled = false; seccam.aimHome();
      };
    },
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
  if (death.busy || endings.running) { /* the camera is theirs */ }
  else if (wake && !wake.completed) wake.update();
  else if (drink.running) drink.update();
  else if (hud.reading) { player.vel?.set?.(0, 0, 0); }   // reading a paper: the night (and you) stand still
  else player.update(dt);
  interactions.enabled = player.active && !drink.running && !phone.raised && !hud.reading && !death.busy;
  interactions.update();
  fwd.copy(camera.forward); up.copy(camera.up);
  ambience.listen(camera.getPosition(), fwd, up);
  bank.listen(camera.getPosition());
  const playing = isPlaying();
  if (playing && (!wake || wake.completed)) story.update(dt);
  if (playing) music.update(dt);                           // paused: no heartbeats queued on a suspended context
  endings.update(dt);
  nest.update(dt);
  hud.crouch(player.active && player.isCrouched);
  music.holding(player.active && player.isCrouched && player.vel.length() < 0.1 && hunt.active && hunt.stalker.state !== 'backstage' && Math.hypot(hunt.stalker.x - player.pos.x, hunt.stalker.z - player.pos.z) < 5);
  if (flashlight.held) story.set('torch');
  if (!story.has('bathroom-visited') && story.has('bathroom-open') && player.pos.x < 9.1 && player.pos.x > 6.5 && player.pos.z < 2.4) story.bathroomVisited();
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

await soundsLoading.then(b => ambience.startBeds(b));
status('Ready.', 1);
$('loading').hidden = true;
const enter = $('enter');
enter.hidden = false;
enter.textContent = wake ? 'Wake up' : 'Click to enter';
const intro = $('intro');
// Chrome refuses a new pointer lock for about a second after Esc: retry once.
const lock = () => { const r = canvas.requestPointerLock?.(); r?.catch?.(() => setTimeout(() => canvas.requestPointerLock?.()?.catch?.(() => {}), 1100)); };
enter.addEventListener('click', () => { ambience.start(); lock(); });
canvas.addEventListener('click', () => { if (player.active && document.pointerLockElement !== canvas && !menu?.isOpen) lock(); });
canvas.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  wake?.setLocked(locked);
  drink.setLocked(locked);
  player.active = locked && (!wake || wake.completed) && !drink.running && !death.busy && !endings.running;
  intro.classList.toggle('gone', locked);
  $('reticle').hidden = !player.active;
  enter.textContent = locked ? 'Click to enter' : 'Click to continue';
  if (menu) {
    if (locked) menu.close();
    else if (nightStarted && !story.has('ended') && !menu.isOpen) menu.open('pause');
  }
  ambience.pause(!locked && nightStarted && !story.has('ended'));
  if (player.active) showHint();
});
if (shot) { intro.classList.add('gone'); intro.style.display = 'none'; player.active = false; }

// --- Nights: the menu's New night / Continue / Chapters. The first night of a page starts in place; any later one
// reloads the page (every system back to its first state) and starts from the menu's single button.
let nightStarted = false;
// The night's time: 03:07 when it began, and again every time you wake from him (the phone agrees with the bedside clock).
function nightClock() { const d = new Date(2026, 9, 25, 3, 7, 0); d.setSeconds(d.getSeconds() + Math.floor(Math.max(0, story.time - clockFrom))); return d; }
const ACT_START = {
  2: { x: 10.4, z: 1.0, yaw: 95 }, 3: { x: 2.6, z: 3.75, yaw: 180 }, 4: { x: 4.6, z: 0.4, yaw: 20 },
};
const CHAPTER_FLAGS = {
  2: ['phone', 'charging', 'glass', 'shards-seen', 'bath-tried', 'bath-dark', 'bath-knocked', 'power-cut'],
  3: ['phone', 'charging', 'glass', 'shards-seen', 'bath-tried', 'bath-dark', 'bath-knocked', 'power-cut', 'torch', 'latch', 'fusebox-opened', 'silhouette', 'prints', 'restored', 'bathroom-open'],
  4: ['phone', 'charging', 'glass', 'shards-seen', 'bath-tried', 'bath-dark', 'bath-knocked', 'power-cut', 'torch', 'latch', 'fusebox-opened', 'silhouette', 'prints', 'restored', 'bathroom-open',
    'bathroom-visited', 'tap-off', 'hanger', 'nest-seen', 'old-key', 'alerts', 'live', 'hunt'],
};
// What a chapter knows already (the true ending needs where and who: the nest, the notice and the tagged key).
const CHAPTER_JOURNAL = { 2: ['notice', 'glass'], 3: ['notice', 'glass', 'silhouette'], 4: ['notice', 'glass', 'silhouette', 'nest', 'old-key'] };
function chapterSave(act) {
  const flags = CHAPTER_FLAGS[act] || [];
  const power = { main: act !== 4, rcd: act !== 2, breakers: { lights1: true, lights2: true, kitchen: true, living: true, bed: true, bathroom: act !== 3, oven: true }, faults: act > 1 ? ['bathroom'] : [] };
  if (act === 4) power.rcd = true, power.breakers.bathroom = false;
  if (act === 2) power.rcd = false;
  return { v: 1, act, flags, time: [0, 0, 110, 240, 420][act], deaths: 0, seed: Date.now() >>> 0, difficulty: menu?.settings.difficulty || 'normal', power,
    journal: CHAPTER_JOURNAL[act] || [], phone: { has: act >= 4, charge: act >= 4 ? 9 : 0, booted: act >= 4, onCharger: act < 4, pluggedIn: act >= 2, chargeTime: act >= 3 ? 120 : 0, silenced: false, notifications: [] }, items: [] };
}

// The world as a checkpoint left it, beyond what world.js rebuilds from the flags.
function applyCheckpoint(save) {
  const f = new Set(save.flags);
  if (f.has('glass')) { fridge.hasDrunk = true; fridge.setGlassWater(0.12, 0); }
  if (f.has('torch') && !flashlight.held) flashlight.pickUp();
  if (save.act >= 2) { rain.burst?.(save.act === 2 ? 30 : 0); }
  if (f.has('power-cut')) power.faults.add('bathroom');
  if (save.act === 4) power.mainBroken = true;
  wake?.skip?.(); if (wake) { wake.started = true; wake.completed = true; wake.running = false; }
  const at = ACT_START[save.act];
  if (at) { player.pos.set(at.x, 0, at.z); player.yaw = at.yaw; player.pitch = 0; player.floor = grid.floorUnder(at.x, at.z, 0.22); player.eyeY = player.floor + 1.62; player.apply(0); }
}

function startNight({ difficulty, save, chapter } = {}) {
  if (nightStarted) {
    try { sessionStorage.setItem('horror.autostart', JSON.stringify({ difficulty, save: !!save, chapter })); } catch { /* ignore */ }
    location.reload();
    return;
  }
  nightStarted = true;
  menu?.close();
  ambience.start();
  journal.reset();
  if (save || chapter) {
    const data = save || chapterSave(chapter);
    if (chapter) data.difficulty = menu?.settings.difficulty || 'normal';
    story.restore(data);
    applyCheckpoint(data);
    story.save();                 // a chapter is a checkpoint too (restart and Hard's third catch come back here)
  } else {
    story.begin({ difficulty: difficulty || menu?.settings.difficulty || 'normal' });
  }
  lock();
}

function toTitle() {
  if (nightStarted) { try { sessionStorage.removeItem('horror.autostart'); } catch { /* ignore */ } location.reload(); return; }
  menu?.open('title');
}

// Settings (menu.js) to the systems.
function applySettings(st) {
  const v = (k) => st[k];
  bank?.setVolume('sfx', v('sfx')); bank?.setVolume('amb', v('ambience')); bank?.setVolume('music', v('music')); bank?.setVolume('ui', 0.7);
  if (ambience) ambience.volume = v('master');
  player && (player.sensitivity = v('sensitivity'), player.invertY = v('invertY'), player.bobOn = v('headBob'));
  document.documentElement.style.setProperty('--subtitle', String(v('subtitleSize')));
  document.body.classList.toggle('subtitle-back', !!v('subtitleBack'));
  if (rain) rain.reducedFlashes = v('reducedFlashes');
  if (flashlight) flashlight.reducedFlashes = v('reducedFlashes');
  if (death) death.reducedFlashes = v('reducedFlashes');
  if (hud) hud.soundCaptions = !!v('soundCaptions');
  if (eyes) eyes.brightness = v('brightness');
  if (story && !nightStarted) story.difficulty = v('difficulty');
}
applySettings(menu?.settings || { sfx: 1, ambience: 0.9, music: 0.8, master: 0.9, sensitivity: 1, invertY: false, headBob: true, subtitleSize: 1, subtitleBack: false, reducedFlashes: false, brightness: 1, difficulty: 'normal' });

if (menu) {
  let auto = null;
  try { auto = JSON.parse(sessionStorage.getItem('horror.autostart') || 'null'); sessionStorage.removeItem('horror.autostart'); } catch { /* ignore */ }
  menu.setLoading(null);
  if (auto) {
    menu.open('title');
    menu.panel.innerHTML = '';
    menu.item('Wake up', () => startNight(auto.save ? { save: story.load() } : auto.chapter ? { chapter: auto.chapter } : { difficulty: auto.difficulty }), { cls: 'primary' });
    menu.panel.querySelector('button')?.focus();
  } else menu.open('title');
}
window.__state.ready = true;
window.__app = { app, player, frame, camera, flashlight, interactions, switches, rain, doors, devices, closets, fridge, taps, drink, probes, devMenu, eyes, graphics, frameLimiter, sceneQuality, wake, events, thought, fallingGlass, intruder,
  bank, music, power, fusebox, story, world, nest, seccam, phone, hunt, death, endings, hud, journal, menu, nav, items, props, startNight, chapterSave, applyCheckpoint, pc };

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
  interactions.add({ pos: new pc.Vec3(c.x, 1.05, box.getMin().z), size: 0.45, label: () => story.doorLabel(),
    use: () => story.frontDoor() });
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
