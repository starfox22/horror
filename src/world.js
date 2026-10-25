// The flat as the story leaves it (story.js flags -> what is there): the broken glass by the bed and its spill, the
// bathroom (shut and locked with a tap running behind the door; later standing open, flooded, steamed up, the mirror
// fogged with one band wiped clear), his wet prints in the corridor, the papers lying about (the notice on the fridge,
// the prescription by the bed, the sleep diary on the desk), the spare key where the diary says, the empty key bowl,
// the alarm clock at 03:07, your hair-dryer in the basin. The things are downloaded models (props.js) where we have
// them. reset() lays out a new night; restore() rebuilds a checkpoint from the flags.
import { BLEND_ADDITIVE, BLEND_NORMAL, CULLFACE_NONE, Color, Entity, Mesh, MeshInstance, StandardMaterial, Texture, Vec3, PIXELFORMAT_RGBA8, PIXELFORMAT_SRGBA8, ADDRESS_CLAMP_TO_EDGE } from 'playcanvas';
import { GLASS_SPOT } from './falling-glass.js';
import { FRIDGE, fridgeWorld } from './fridge-geometry.js';

// The notice on the refrigerator door, as printed (first line the heading, last the signature). Edit freely: the sheet
// on the door and the one read with E are both drawn from it.
export const NOTICE = `NOTICE TO RESIDENTS
The resident who had been causing disturbances over the last month has finally been evicted.
Thank you for your patience.
— The Management`;
// Where it hangs (refrigerator-local, fridge-geometry.js: x across the door, y up, z out of the room's side): an A6 sheet
// on the outer face of the upper door (measured at z 0.3346), right of the door's middle and clear of its panel, held at
// the top by one round magnet, a degree and a half off square. It swings with the door.
export const NOTICE_SHEET = { x: 0.118, y: 1.612, face: 0.3346, gap: 0.0012, size: [0.105, 0.148], tilt: -1.6, magnet: { radius: 0.0115, depth: 0.0055, below: 0.006 } };

// Measured in the flat (docs/build-013): the bathroom basin's bowl and tap, its mirror, the corridor's prints.
// The bathroom (measured): the vessel basin on the vanity (bowl x 6.56-6.86, z 1.07-1.42, rim 0.97), its tap on the
// wall side, the mirror over it (lit edge x 6.46-6.54, z 0.93-1.57), the floor; where the water spreads.
export const BATH = { basin: [6.71, 0.93, 1.245], tap: [6.52, 1.08, 1.245], mirror: { x: 6.485, y: 1.68, z: 1.25, w: 0.56, h: 0.9 }, floor: 0.165,
  dryer: { at: [6.72, 0.9, 1.26], euler: [8, 70, 14] },
  flood: { x0: 6.5, x1: 9.1, z0: -1.35, z1: 2.35 } };
// Where things are (surfaces measured in the built flat): the pills on the north nightstand (top 0.57), the diary on the
// office desk (0.86), the red tin on the coffee shelf's lower board (0.83), the key bowl on the kitchen worktop by the
// fridge (0.835), the alarm clock on the south nightstand turned to the pillow; where the spare key can be: the tin,
// under the sofa's west seat cushion, in the green vase on the coffee table (top 0.69). All in the west half (build 0.14).
const PILLS = [13.6, 0.572, -1.0], DIARY = [3.95, 0.862, -1.05], TIN = [-4.9, 0.832, -1.15], KEY_BOWL = [1.05, 0.835, -0.82];
const CLOCK = { at: [13.62, 0.572, 1.53], yaw: -121 };
export const SPARE_SPOTS = [
  { id: 'tin', at: [TIN[0], TIN[1] + 0.09, TIN[2]], size: 0.1 },
  { id: 'sofa', at: [-5.75, 0.66, 2.6], size: 0.4 },
  { id: 'plant', at: [-3.97, 0.70, 2.285], size: 0.15 },      // the green vase on the coffee table (top 0.69, measured)
];
const PRINTS = [
  // From the bedroom opening east to the front door (left, right, ...), two side by side facing the fuse box, then back.
  [10.55, 2.85, 75, 'L'], [10.95, 3.15, 70, 'R'], [11.35, 3.3, 82, 'L'], [11.8, 3.5, 88, 'R'], [12.2, 3.42, 92, 'L'],
  [12.42, 3.38, -90, 'L'], [12.42, 3.66, -90, 'R'],
  [12.1, 3.7, -105, 'R'], [11.6, 3.62, -100, 'L'], [11.15, 3.42, -115, 'R'], [10.75, 3.1, -125, 'L'], [10.45, 2.75, -140, 'R'],
];
// The story's things are small and come and go: the reflection probes leave them out (a probe capture would otherwise
// draw them for the first time mid-game, and build their shaders then).
export function noProbes(root) {
  for (const r of root.findComponents('render')) for (const mi of r.meshInstances) {
    mi.isVisibleFunc = cam => !cam.node?.name?.startsWith('probe-') && cam.frustum.containsAabb(mi.aabb);
  }
}
const paper = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h); return c; };
// The notice as the full-screen sheet shows it (hud.examine, 'typed').
const escape = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function noticeHtml() {
  const [heading, ...rest] = NOTICE.split('\n').map(s => s.trim()).filter(Boolean);
  return `<h1>${escape(heading)}</h1>${rest.map(escape).join('<br><br>')}`;
}

export class World {
  constructor({ app, sounds, bank, doors, closets, interactions, story, hud, configureMaterial, glassGeometry, props, fridge, taps }) {
    Object.assign(this, { app, sounds, bank, doors, closets, interactions, story, hud, configureMaterial, props, fridge, taps });
    this.root = new Entity('story world'); app.root.addChild(this.root);
    this.bathDoor = doors?.doors?.[0];
    this.buildShards(glassGeometry);
    this.buildFlood();
    this.buildMirrorFog();
    this.buildPrints();
    this.buildDoorGlow();
    this.buildNotice();
    this.watchTaps();
    this.buildPapers();
    this.buildSpareKey();
    this.buildThings();
    this.shards(false); this.flood(0); this.prints(false); this.mirrorFog(false);
    noProbes(this.root);
    app.on('update', dt => this.update(dt));
  }

  texture(canvas, name) {
    const t = new Texture(this.app.graphicsDevice, { width: canvas.width, height: canvas.height, format: PIXELFORMAT_RGBA8, mipmaps: true, name,
      addressU: ADDRESS_CLAMP_TO_EDGE, addressV: ADDRESS_CLAMP_TO_EDGE });
    t.setSource(canvas); return t;
  }

  material(name, set) {
    const m = new StandardMaterial(); m.name = name; m.useMetalness = true; m.metalness = 0;
    set(m); m.update(); this.configureMaterial?.(m, name); return m;
  }

  // --- the broken glass ------------------------------------------------------------------------------------------
  // The downloaded tumbler (drinking-glass.json) broken into the pieces a dropped glass makes: the heavy base whole,
  // the walls in curved shards, scattered on the floor by the bed; and a spill of water with a little blood in it.
  buildShards(geometry) {
    this.shardRoot = new Entity('broken glass'); this.root.addChild(this.shardRoot);
    this.shardRoot.setPosition(GLASS_SPOT[0], 0.168, GLASS_SPOT[2]);
    if (geometry) {
      const glassMat = this.material('broken tumbler glass', m => { m.diffuse = new Color(0.86, 0.94, 0.96); m.gloss = 0.98; m.opacity = 0.28; m.blendType = BLEND_NORMAL; m.depthWrite = false; m.cull = CULLFACE_NONE; });
      const P = geometry.positions, N = geometry.normals, I = geometry.indices, pieces = new Map();
      for (let t = 0; t < I.length; t += 3) {
        let cx = 0, cy = 0, cz = 0;
        for (let k = 0; k < 3; k++) { cx += P[I[t + k] * 3]; cy += P[I[t + k] * 3 + 1]; cz += P[I[t + k] * 3 + 2]; }
        cx /= 3; cy /= 3; cz /= 3;
        const a = Math.atan2(cz, cx), sector = Math.floor((a + Math.PI) / (2 * Math.PI) * 6 + (cy > 0.07 ? 0.5 : 0)) % 6;
        const key = cy < 0.016 ? 'base' : `${cy < 0.07 ? 0 : 1}-${sector}`;
        (pieces.get(key) || pieces.set(key, []).get(key)).push(I[t], I[t + 1], I[t + 2]);
      }
      let n = 0;
      const rand = (s) => { const x = Math.sin(s * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
      for (const [key, idx] of pieces) {
        const used = [...new Set(idx)], remap = new Map(used.map((v, i) => [v, i]));
        const pos = [], nrm = [];
        let c = [0, 0, 0];
        for (const v of used) for (let k = 0; k < 3; k++) c[k] += P[v * 3 + k] / used.length;
        for (const v of used) { for (let k = 0; k < 3; k++) { pos.push(P[v * 3 + k] - c[k]); nrm.push(N[v * 3 + k]); } }
        const mesh = new Mesh(this.app.graphicsDevice); mesh.setPositions(pos); mesh.setNormals(nrm); mesh.setIndices(idx.map(v => remap.get(v))); mesh.update();
        const e = new Entity(`shard ${key}`);
        e.addComponent('render', { meshInstances: [new MeshInstance(mesh, glassMat, e)], castShadows: false, receiveShadows: true });
        const r = 0.05 + rand(n + 1) * 0.32, a = rand(n + 7) * Math.PI * 2;
        const base = key === 'base';
        e.setLocalPosition(Math.cos(a) * r * (base ? 0.2 : 1), base ? 0.008 : 0.012, Math.sin(a) * r * (base ? 0.2 : 1));
        e.setLocalEulerAngles(base ? 0 : 80 + rand(n + 3) * 20, rand(n + 5) * 360, base ? 8 : rand(n + 9) * 30);
        this.shardRoot.addChild(e);
        n++;
      }
    }
    // The spill: a thin film of water (a little pink) spreading from where the glass hit.
    const c = paper(256, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const blob = (x, y, r, a) => { const grad = g.createRadialGradient(x, y, 0, x, y, r); grad.addColorStop(0, `rgba(255,255,255,${a})`); grad.addColorStop(0.75, `rgba(255,255,255,${a * 0.9})`); grad.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grad; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
      blob(128, 128, 90, 1); blob(170, 100, 50, 0.9); blob(80, 160, 60, 0.9); blob(150, 180, 40, 0.8); blob(60, 90, 30, 0.7);
    });
    const spillMat = this.material('spilt water', m => {
      m.diffuse = new Color(0.08, 0.05, 0.05); m.gloss = 0.96; m.opacityMap = this.texture(c, 'spill'); m.opacityMapChannel = 'a';
      m.blendType = BLEND_NORMAL; m.depthWrite = false; m.opacity = 0.55; m.specular = new Color(1, 1, 1);
    });
    this.spill = new Entity('spill'); this.spill.addComponent('render', { type: 'plane', material: spillMat, castShadows: false });
    this.spill.setLocalScale(0.75, 1, 0.6); this.spill.setLocalPosition(0, 0.002, 0);
    this.shardRoot.addChild(this.spill);
  }

  shards(on) { this.shardRoot.enabled = on; this.hasShards = on; }

  // What is underfoot (player.js surfaceAt): the shards crunch (a 5 m noise), the flooded bathroom splashes.
  surfaceAt(x, z) {
    if (this.hasShards && Math.hypot(x - GLASS_SPOT[0], z - GLASS_SPOT[2]) < 0.45) return 'glass';
    const f = BATH.flood;
    if (this.floodLevel > 0.3 && x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1) return 'water';
    return null;
  }

  // --- the bathroom -------------------------------------------------------------------------------------------------
  // He is in there: the door shut and locked, the tap running behind it.
  bathroomOccupied(on) {
    const d = this.bathDoor;
    if (!d) return;
    if (on) {
      d.angle = 0; d.target = 0; d.openRequested = false; d.vel = 0; d.moving = false; d.pivot.setEulerAngles(0, 0, 0); this.doors.placeHandle(d);
      d.locked = true;
      this.tap(true);
    } else {
      d.locked = false;
      // Left ajar as he went.
      d.angle = -14; d.target = -14; d.openRequested = true; d.pivot.setEulerAngles(0, d.angle, 0); this.doors.placeHandle(d);
      this.story?.set('bathroom-open');
    }
  }

  // The basin's tap (taps.js: its water, its recording, the handle the player turns): the story runs it here, behind the
  // locked door and hot after the cut (the bowl brimming, overflowing onto the floor: update()). quiet: no click (a
  // checkpoint).
  tap(on, { hot = false, quiet = false } = {}) {
    if (this.taps) { this.taps.set('bathroom', on, { hot, quiet }); if (hot) this.taps.fill('bathroom', true); }
    else {
      if (on && !this.tapLoop) this.tapLoop = this.bank?.loop('tap_running', { at: BATH.basin, gain: 0.55, ref: 0.6, rolloff: 1.3, send: 0.4, fadeIn: 0.3 });
      if (!on && this.tapLoop) { this.tapLoop.stop(0.4); this.tapLoop = null; if (!quiet) this.bank?.play('latch_2', { at: BATH.tap, gain: 0.25, rate: 1.4 }); }
    }
    this.tapOn = on;
    if (hot) this.hot = true;
  }

  // The bathroom tap as the player leaves it (taps.js). Turning off the hot water the story left running is the story's
  // beat: main.js hands every tap the player shuts to story.tapClosed (the pipes; story.tapOff).
  watchTaps() {
    this.taps?.on((id, on) => { if (id === 'bathroom') this.tapOn = on; });
  }

  buildFlood() {
    const f = BATH.flood;
    const mat = this.material('bathroom flood water', m => {
      m.diffuse = new Color(0.05, 0.055, 0.06); m.gloss = 0.97; m.opacity = 0.45; m.blendType = BLEND_NORMAL; m.depthWrite = false;
    });
    this.floodMat = mat;
    this.floodPlane = new Entity('bathroom flood'); this.floodPlane.addComponent('render', { type: 'plane', material: mat, castShadows: false });
    this.floodPlane.setPosition((f.x0 + f.x1) / 2, BATH.floor + 0.004, (f.z0 + f.z1) / 2);
    this.floodPlane.setLocalScale(f.x1 - f.x0, 1, f.z1 - f.z0);
    this.root.addChild(this.floodPlane);
    this.floodLevel = 0;
  }

  flood(level) {
    this.floodLevel = level;
    this.floodPlane.enabled = level > 0.01;
    this.floodMat.opacity = 0.45 * Math.min(1, level);
    this.floodMat.update();
  }

  // The mirror fogged by the hot tap, with one band wiped clear at a head height above the player's.
  buildMirrorFog() {
    const M = BATH.mirror;
    const c = paper(256, 400, (g, w, h) => {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x += 4) {
        const n = 0.55 + Math.random() * 0.25;
        g.fillStyle = `rgba(235,238,240,${n})`; g.fillRect(x, y, 4, 1);
      }
      // The wiped band: 1.80-1.93 m above the floor on a mirror centred at M.y (h = M.h).
      const top = (M.y + M.h / 2 - 1.93) / M.h * h, bottom = (M.y + M.h / 2 - 1.80) / M.h * h;
      g.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 26; i++) {
        const yy = top + Math.random() * (bottom - top), x0 = 10 + Math.random() * 20, x1 = w - 10 - Math.random() * 30;
        g.strokeStyle = `rgba(0,0,0,${0.5 + Math.random() * 0.5})`; g.lineWidth = 6 + Math.random() * 10; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x0, yy); g.bezierCurveTo(w * 0.35, yy - 6 + Math.random() * 12, w * 0.65, yy - 6 + Math.random() * 12, x1, yy + Math.random() * 6); g.stroke();
      }
      // Drips running down from the band.
      for (let i = 0; i < 9; i++) { const x = 20 + Math.random() * (w - 40), y = bottom; g.lineWidth = 2 + Math.random() * 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.random() * 3, y + 40 + Math.random() * 120); g.stroke(); }
    });
    const mat = this.material('mirror fog', m => {
      m.diffuse = new Color(0.75, 0.77, 0.78); m.gloss = 0.2; m.opacityMap = this.texture(c, 'mirror-fog'); m.opacityMapChannel = 'a';
      m.blendType = BLEND_NORMAL; m.depthWrite = false; m.opacity = 0.85;
    });
    this.fog = new Entity('mirror fog'); this.fog.addComponent('render', { type: 'plane', material: mat, castShadows: false });
    this.fog.setPosition(M.x + 0.012, M.y, M.z); this.fog.setEulerAngles(0, 0, -90); this.fog.setLocalScale(M.h, 1, M.w);
    this.root.addChild(this.fog);
  }

  mirrorFog(on) { this.fog.enabled = on; }

  // --- his prints in the corridor ------------------------------------------------------------------------------------
  buildPrints() {
    const foot = (left) => paper(64, 160, (g, w, h) => {
      g.clearRect(0, 0, w, h); g.fillStyle = '#fff';
      g.beginPath(); g.ellipse(w / 2, h * 0.6, w * 0.3, h * 0.27, 0, 0, Math.PI * 2); g.fill();      // ball and arch
      g.beginPath(); g.ellipse(w / 2 + (left ? 2 : -2), h * 0.86, w * 0.22, h * 0.12, 0, 0, Math.PI * 2); g.fill();     // heel
      g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.ellipse(left ? w * 0.75 : w * 0.25, h * 0.66, w * 0.16, h * 0.14, 0, 0, Math.PI * 2); g.fill();   // the arch lifts
      g.globalCompositeOperation = 'source-over';
      [[0.3, 0.2, 7], [0.46, 0.17, 6], [0.6, 0.19, 5.5], [0.72, 0.23, 5], [0.82, 0.29, 4.5]].forEach(([x, y, r], i) => { g.beginPath(); g.arc((left ? 1 - x : x) * w, y * h, r * (i ? 1 : 1.25), 0, Math.PI * 2); g.fill(); });
    });
    const mat = (left) => this.material(`wet print ${left ? 'L' : 'R'}`, m => {
      m.diffuse = new Color(0.02, 0.018, 0.016); m.gloss = 0.94; m.opacityMap = this.texture(foot(left), 'print'); m.opacityMapChannel = 'a';
      m.blendType = BLEND_NORMAL; m.depthWrite = false; m.opacity = 0.42;
    });
    const L = mat(true), R = mat(false);
    this.printRoot = new Entity('wet prints'); this.root.addChild(this.printRoot);
    for (const [x, z, yaw, side] of PRINTS) {
      const e = new Entity('print'); e.addComponent('render', { type: 'plane', material: side === 'L' ? L : R, castShadows: false });
      e.setPosition(x, 0.168, z); e.setEulerAngles(0, yaw + 180, 0); e.setLocalScale(0.1, 1, 0.25);
      this.printRoot.addChild(e);
    }
    // One bare footprint in the spilt water by the bed, heading for the bathroom door: he trod in it (it comes and goes
    // with the shards).
    const step = new Entity('footprint in the spill'); step.addComponent('render', { type: 'plane', material: L, castShadows: false });
    this.shardRoot.addChild(step);
    step.setPosition(GLASS_SPOT[0] - 0.36, 0.1712, GLASS_SPOT[2] + 0.16); step.setEulerAngles(0, -68 + 180, 0); step.setLocalScale(0.1, 1, 0.25);
  }

  // --- the light under the bathroom door ---------------------------------------------------------------------------
  // While someone is in there with the light on and the door shut, a thin warm line shows on the bedroom floor along
  // the door's foot (the gap under a door; the real light inside is shadowed by the leaf). It goes when the light goes
  // (story.js bathroomLightOut), when the power goes, or as the door opens.
  buildDoorGlow() {
    const c = paper(16, 64, (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.35, 'rgba(255,255,255,0.45)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
    });
    const mat = this.material('light under the bathroom door', m => {
      m.diffuse = Color.BLACK; m.emissive = new Color(1, 0.84, 0.64); m.emissiveIntensity = 0; m.useLighting = false;
      m.opacityMap = this.texture(c, 'door-glow'); m.opacityMapChannel = 'a'; m.blendType = BLEND_ADDITIVE; m.depthWrite = false;
    });
    this.doorGlowMat = mat;
    this.doorGlow = new Entity('light under the bathroom door');
    this.doorGlow.addComponent('render', { type: 'plane', material: mat, castShadows: false, receiveShadows: false });
    // The leaf's foot on the bedroom side (wall x 9.256), the opening z 0.39-1.25; the gradient runs out into the room.
    this.doorGlow.setPosition(9.32, 0.1695, 0.82); this.doorGlow.setEulerAngles(0, 90, 0); this.doorGlow.setLocalScale(0.8, 1, 0.12);
    this.root.addChild(this.doorGlow);
    this.doorGlowLevel = -1;
  }

  updateDoorGlow() {
    const sys = this.story?.sys, sw = sys?.switches, d = this.bathDoor;
    let light = 0;
    for (const room of sw?.rooms || []) if (room.id === 'mirror' || room.id === 'bathroom') light = Math.max(light, room.level * room.level * (sys.power ? sys.power.k(room.circuit, room.controlPosition) : 1));
    const shut = d ? Math.max(0, 1 - Math.abs(d.angle || 0) / 6) : 1;
    const level = Math.round(light * shut * 100) / 100;
    if (level === this.doorGlowLevel) return;
    this.doorGlowLevel = level;
    this.doorGlowMat.emissiveIntensity = 0.55 * level; this.doorGlowMat.update();
    this.doorGlow.enabled = level > 0.005 || this.warming;
  }

  prints(on) { this.printRoot.enabled = on; this.printsAt = on ? this.story?.time ?? 0 : null; }

  // --- the notice on the refrigerator ------------------------------------------------------------------------------
  // A small printed sheet (A6) on the outer face of the upper door, held by a round magnet: hung on the moving leaf
  // (fridge.js), so it swings with the door. Printed in the typed face once that has loaded; read with E (full screen,
  // the journal's 'notice') from in front of it.
  buildNotice() {
    const S = NOTICE_SHEET, [w, h] = S.size;
    // On the leaf (its hinge's frame), or without one where the shut door's hinge is.
    let leaf = this.fridge?.door;
    if (!leaf) { leaf = new Entity('notice hinge'); this.root.addChild(leaf); leaf.setPosition(...fridgeWorld(FRIDGE.hinge)); leaf.setEulerAngles(0, FRIDGE.yaw, 0); }
    this.notice = new Entity('notice on the refrigerator');
    leaf.addChild(this.notice);
    this.notice.setLocalPosition(S.x - FRIDGE.hinge[0], S.y, S.face + S.gap - FRIDGE.hinge[2]);
    this.notice.setLocalEulerAngles(0, 0, S.tilt);
    const canvas = paper(600, Math.round(600 * h / w), (g, cw, ch) => this.drawNotice(g, cw, ch, '"Courier New", monospace'));
    const tex = new Texture(this.app.graphicsDevice, { width: canvas.width, height: canvas.height, format: PIXELFORMAT_SRGBA8, mipmaps: true,
      anisotropy: 8, name: 'notice', addressU: ADDRESS_CLAMP_TO_EDGE, addressV: ADDRESS_CLAMP_TO_EDGE });
    tex.setSource(canvas);
    const sheetMat = this.material('notice sheet', m => { m.diffuseMap = tex; m.gloss = 0.22; });
    const sheet = new Entity('notice sheet');
    sheet.addComponent('render', { type: 'plane', material: sheetMat, castShadows: false, receiveShadows: true });
    sheet.setLocalEulerAngles(90, 0, 0); sheet.setLocalScale(w, 1, h);    // the plane's face turned out of the door
    this.notice.addChild(sheet);
    // The magnet: a round plastic button, its dome towards the room.
    const M = S.magnet, magnetMat = this.material('notice magnet', m => { m.diffuse = new Color(0.52, 0.09, 0.07); m.gloss = 0.62; });
    const base = new Entity('notice magnet');
    base.addComponent('render', { type: 'cylinder', material: magnetMat, castShadows: false, receiveShadows: true });
    base.setLocalEulerAngles(90, 0, 0); base.setLocalScale(M.radius * 2, M.depth * 0.6, M.radius * 2);
    base.setLocalPosition(0, h / 2 - M.below, 0.0003 + M.depth * 0.3);
    const dome = new Entity('notice magnet dome');
    dome.addComponent('render', { type: 'sphere', material: magnetMat, castShadows: false, receiveShadows: true });
    dome.setLocalScale(M.radius * 1.92, M.radius * 1.92, M.depth * 0.8);
    dome.setLocalPosition(0, h / 2 - M.below, 0.0003 + M.depth * 0.6);
    this.notice.addChild(base); this.notice.addChild(dome);
    noProbes(this.notice);
    // The typed face, once it has loaded (the sheet keeps the stand-in until then).
    document.fonts?.load('34px "Special Elite"').then(faces => {
      if (!faces?.length) return;
      this.drawNotice(canvas.getContext('2d'), canvas.width, canvas.height, '"Special Elite", "Courier New", monospace');
      tex.setSource(canvas);
    }).catch(() => {});
    // E reads it, from in front of the sheet (the target follows the swinging door: update()).
    this.noticeAt = new Vec3(); this.notice.getWorldTransform().getTranslation(this.noticeAt);
    const toEye = new Vec3(), out = new Vec3();
    this.interactions.add({ pos: this.noticeAt, size: h * 0.7, label: () => 'Read the notice',
      active: () => {
        const eye = this.interactions.camera?.getPosition();
        if (!eye) return true;
        this.notice.getWorldTransform().getZ(out);
        return toEye.sub2(eye, this.noticeAt).dot(out) > 0.05;
      },
      use: () => { this.hud?.examine({ className: 'typed', html: noticeHtml() }); this.story?.sys.journal?.find('notice'); } });
  }

  // The sheet as printed: off-white paper with a little grain and a fold, the heading spaced out and struck twice over a
  // rule, the text set to the page, the signature to the right, the magnet's soft shadow at the top.
  drawNotice(g, w, h, font) {
    const [heading, ...rest] = NOTICE.split('\n').map(s => s.trim()).filter(Boolean), signature = rest.length > 1 ? rest.pop() : null;
    const margin = Math.round(w * 0.09), width = w - 2 * margin;
    g.save();
    g.fillStyle = '#efebe1'; g.fillRect(0, 0, w, h);
    // Grain (the same every time: a seeded scatter) and a faint shade towards the edges.
    let seed = 7;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${rand() < 0.5 ? '90,80,64' : '255,255,250'},${0.05 + rand() * 0.06})`; g.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 2); }
    const edge = g.createRadialGradient(w / 2, h * 0.45, h * 0.25, w / 2, h / 2, h * 0.75);
    edge.addColorStop(0, 'rgba(120,100,70,0)'); edge.addColorStop(1, 'rgba(120,100,70,0.12)');
    g.fillStyle = edge; g.fillRect(0, 0, w, h);
    // Folded once (it came under the door), the crease low across the empty foot of the sheet.
    const crease = Math.round(h * 0.68);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, crease, w, 1);
    g.fillStyle = 'rgba(80,70,55,0.12)'; g.fillRect(0, crease + 1, w, 2);
    // The magnet's soft shadow round where it sits on the top edge (down and to the right of it).
    const S = NOTICE_SHEET, px = w / S.size[0], mr = S.magnet.radius * px, mx = w / 2 + 4, my = S.magnet.below * px + 6;
    const shadow = g.createRadialGradient(mx, my, mr * 0.8, mx, my, mr * 1.25);
    shadow.addColorStop(0, 'rgba(30,24,18,0.35)'); shadow.addColorStop(1, 'rgba(30,24,18,0)');
    g.fillStyle = shadow; g.beginPath(); g.arc(mx, my, mr * 1.25, 0, Math.PI * 2); g.fill();
    // Text: near-black toner.
    const ink = 'rgba(28,25,22,0.93)';
    g.fillStyle = ink; g.textBaseline = 'alphabetic';
    let size = 38;
    const set = (px) => { g.font = `${px}px ${font}`; };
    set(size);
    const spaced = heading.split('').join(String.fromCharCode(8202));      // hair spaces: a printed heading's tracking
    while (g.measureText(spaced).width > width && size > 18) set(--size);
    let y = Math.round(h * 0.17);
    g.textAlign = 'center';
    g.fillText(spaced, w / 2, y); g.fillText(spaced, w / 2 + 1.2, y);      // struck twice: bold
    y += Math.round(size * 0.55);
    g.fillRect(margin, y, width, 3);
    y += Math.round(size * 1.6);
    // Paragraphs, wrapped to the measure.
    const body = 31, line = Math.round(body * 1.42);
    set(body); g.textAlign = 'left';
    for (const text of rest) {
      let row = '';
      for (const word of text.split(/\s+/)) {
        const next = row ? `${row} ${word}` : word;
        if (g.measureText(next).width > width && row) { g.fillText(row, margin, y); y += line; row = word; } else row = next;
      }
      if (row) { g.fillText(row, margin, y); y += line; }
      y += Math.round(line * 0.5);
    }
    if (signature) { g.textAlign = 'right'; g.fillText(signature, w - margin, y + Math.round(line * 0.6)); }
    g.restore();
  }

  // --- papers ------------------------------------------------------------------------------------------------------
  // Paper on surfaces, read with E (hud.examine): the prescription by the bed, the sleep diary on the desk (and the
  // notice on the fridge door: buildNotice). Text in the notes' own hands (Special Elite for print, Caveat for handwriting).
  buildPapers() {
    this.papers = [
      // The prescription: the bottle by the bed (its label printed for this story: tools/props).
      { id: 'pills', model: 'pills', at: PILLS, size: [0.05, 0.08], yaw: 200, className: 'pills', evidence: 'pills',
        html: '<b>ZOLPIDEM TARTRATE 10 mg</b><br>Take ONE tablet at bedtime.<br><br>WARNING: May cause sleepwalking, sleep-driving and other complex sleep behaviours, with no memory of the event. May cause hallucinations. Do not take with alcohol.<br><br><small>Dr. M. Haas</small>' },
      { id: 'diary', model: 'diary', at: DIARY, size: [0.19, 0.14], yaw: -12, className: '', evidence: 'diary',
        html: () => `<h2>SLEEP DIARY</h2>12th — woke on the sofa. Don’t remember going there.<br>15th — fridge open in the morning. Milk out.<br>19th — toilet seat up. I live alone.<br>21st — Dr Haas: film the nights. Keep taking the pills.<br>24th — Camera came today. Put it up in the bedroom corner, over the dresser.<br><br>Spare key: ${this.story?.spareKey?.line || 'the red tin on the coffee shelf'}. DON’T move it again.` },
    ];
    for (const p of this.papers) {
      const model = p.model && this.props?.make(p.model, { parent: this.root, at: p.at, euler: [0, p.yaw, 0], configure: (m) => this.configureMaterial?.(m, p.id) });
      if (!model) {
        const c = paper(256, Math.round(256 * p.size[1] / p.size[0]), (g, w, h) => {
          g.fillStyle = p.id === 'pills' ? '#fbfbf7' : '#ede7d9'; g.fillRect(0, 0, w, h);
          g.fillStyle = 'rgba(30,28,25,0.75)';
          for (let y = 24; y < h - 10; y += 14) g.fillRect(16, y, (w - 32) * (0.55 + Math.random() * 0.45), 3);
        });
        const m = this.material(`paper ${p.id}`, m => { m.diffuseMap = this.texture(c, `paper-${p.id}`); m.gloss = 0.15; m.cull = CULLFACE_NONE; });
        const e = new Entity(`paper ${p.id}`); e.addComponent('render', { type: 'plane', material: m, castShadows: false, receiveShadows: true });
        e.setPosition(...p.at); e.setEulerAngles(p.pitch ?? 0, p.yaw, 0); e.setLocalScale(p.size[0], 1, p.size[1]);
        this.root.addChild(e);
      }
      const at = new Vec3(...p.at).add(new Vec3(0, p.model ? 0.03 : 0, 0));
      this.interactions.add({ pos: at, size: Math.max(...p.size) * 0.7, label: () => p.id === 'pills' ? 'Look at the pills' : 'Read the diary',
        use: () => {
          this.hud?.examine({ className: p.className, html: typeof p.html === 'function' ? p.html() : p.html });
          this.story?.sys.journal?.find(p.evidence);
          if (p.id === 'diary') this.story?.set('diary-read-key');
        } });
    }
  }

  // --- the spare key -----------------------------------------------------------------------------------------------
  // Hidden in one of three places per run (story.js SPARE_KEY; the diary says which): in the red tin on the coffee
  // shelf, taped under the sofa's cushion, at the bottom of the green vase on the coffee table. Each place can be searched.
  buildSpareKey() {
    this.keyEntity = this.props?.make('keys', { parent: this.root, name: 'spare key', configure: (m) => this.configureMaterial?.(m, 'key') });
    if (!this.keyEntity) {
      const m = this.material('spare key brass', m => { m.diffuse = new Color(0.72, 0.56, 0.28); m.metalness = 1; m.gloss = 0.72; });
      this.keyEntity = new Entity('spare key'); this.keyEntity.addComponent('render', { type: 'box', material: m, castShadows: false });
      this.keyEntity.setLocalScale(0.055, 0.003, 0.022); this.root.addChild(this.keyEntity);
    }
    this.keyEntity.enabled = false;            // hidden where it is: in the tin, under the cushion, in the soil
    this.tin = this.props?.make('tin', { parent: this.root, at: TIN, euler: [0, 25, 0], configure: (m) => this.configureMaterial?.(m, 'tin') });
    const where = { tin: ['Look in the tin', 'Old receipts. A screw.'], sofa: ['Feel under the cushion', 'Crumbs.'], plant: ['Feel in the vase', 'Stems. Cold water.'] };
    for (const spot of SPARE_SPOTS) {
      this.interactions.add({ pos: new Vec3(...spot.at), size: spot.size, label: () => where[spot.id][0], active: () => !this.story?.sys.items?.has('spare-key'),
        use: () => {
          if (this.story?.spareKey?.id === spot.id) this.takeKey(spot);
          else { this.bank?.play(spot.id === 'tin' ? 'latch_2' : 'blanket', { at: spot.at, gain: 0.3, rate: 1.2 }); this.story?.say(where[spot.id][1]); }
        } });
    }
  }

  placeKey() { if (this.keyEntity) this.keyEntity.enabled = false; }

  takeKey(spot) {
    this.story?.sys.items?.add('spare-key');
    this.bank?.play('keys_unlock', { at: spot?.at, gain: 0.25, rate: 1.3 });
    this.story?.say(this.story?.has('diary-read-key') ? 'The spare.' : '...My spare key.');
  }

  // --- things about the flat -----------------------------------------------------------------------------------------
  // The empty key bowl on the kitchen worktop, the alarm clock by the bed (stopped at 03:07), the hair-dryer (in the basin
  // once he has used it).
  buildThings() {
    const make = (id, at, yaw, zone, opts = {}) => this.props?.make(id, { parent: this.root, at, euler: [0, yaw, 0], configure: (m) => this.configureMaterial?.(m, zone), ...opts });
    this.bowl = make('bowl', KEY_BOWL, 20, 'main');
    this.interactions.add({ pos: new Vec3(KEY_BOWL[0], KEY_BOWL[1] + 0.04, KEY_BOWL[2]), size: 0.14, label: () => 'The key bowl',
      use: () => { this.story?.keyBowl(); } });
    this.clock = make('clock', CLOCK.at, CLOCK.yaw, 'bed');
    this.clockHands = this.clock ? { hour: this.clock.findByName('hand-hour'), minute: this.clock.findByName('hand-minute'), second: this.clock.findByName('hand-second') } : null;
    this.setClock(3 * 3600 + 7 * 60);
    this.dryer = make('dryer', BATH.dryer.at, 0, 'bath', { euler: BATH.dryer.euler });
    if (this.dryer) this.dryer.enabled = false;
  }

  // The alarm clock's hands at `seconds` past midnight (the story's night starts at 03:07:00 and keeps time with play).
  setClock(seconds) {
    if (!this.clockHands) return;
    const h = (seconds / 3600) % 12, m = (seconds / 60) % 60, s = Math.floor(seconds % 60);
    this.clockHands.hour?.setLocalEulerAngles(0, 0, -h * 30);
    this.clockHands.minute?.setLocalEulerAngles(0, 0, -m * 6);
    this.clockHands.second?.setLocalEulerAngles(0, 0, -s * 6);
  }

  // Your hair-dryer in the basin (Act III: the bathroom stands open after the cut).
  dryerInBasin(on) { if (this.dryer) this.dryer.enabled = on; }

  // --- whole states ------------------------------------------------------------------------------------------------
  reset(story) {
    this.shards(false); this.flood(0); this.prints(false); this.mirrorFog(false); this.tap(false, { quiet: true });
    this.taps?.reset();                         // the kitchen tap too, if it was left running
    this.hot = false;
    if (this.bathDoor) { this.bathDoor.locked = false; }
    this.placeKey();
    this.dryerInBasin(false);
    this.story?.sys.nest?.reset();
  }

  restore(story) {
    const f = (x) => story.has(x);
    this.reset(story);
    this.shards(f('glass'));
    if (f('glass') && !f('silhouette')) this.bathroomOccupied(true);
    if (f('silhouette')) { this.bathroomOccupied(false); this.prints(true); }
    if (f('power-cut') && !f('tap-off')) this.tap(true, { hot: true, quiet: true });
    if (f('power-cut')) { this.flood(1); this.mirrorFog(true); this.dryerInBasin(true); this.taps?.fill('bathroom', true); }
    this.story?.sys.nest?.restore(story);
  }

  update(dt) {
    this.updateDoorGlow();
    // The notice's E target rides the refrigerator door.
    this.notice?.getWorldTransform().getTranslation(this.noticeAt);
    // The basin overflows while the hot tap runs after the cut; the mirror fogs with it.
    const hotTap = this.taps ? this.taps.isHot('bathroom') : this.tapOn && this.hot;
    if (hotTap && this.floodLevel < 1) { this.flood(Math.min(1, this.floodLevel + dt / 40)); if (this.floodLevel > 0.15) this.mirrorFog(true); }
  }
}
