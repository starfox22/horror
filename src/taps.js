// The taps: the kitchen sink's mixer and the bathroom basin's tap. E on a tap turns its water on or off (water needs no
// electricity: they run in a power cut too). Running, a tap pours a thin stream from its spout's outlet into the bowl,
// with a ring of splash and ripples where it lands; its recording plays at the spout, the handle clicks as it turns and
// a drop or two falls after it shuts. The story drives the bathroom tap as well (world.js tap(): running behind the
// locked door, hot after the power cut); set() forces either tap on or off, toggle() is the player's. While a tap runs it
// is a noise the intruder can follow (onNoise every 2 s of play: hunt.js 'tap', 7 m).
// The water is simple geometry with scrolling translucent materials, seen by the player's camera only (never by the
// probes or the home camera); main.js shows it during the warm-up (reveal) so nothing is compiled when a tap opens.
import { ADDRESS_CLAMP_TO_EDGE, ADDRESS_REPEAT, BLEND_NORMAL, Color, Entity, Mesh, MeshInstance, PIXELFORMAT_RGBA8, StandardMaterial,
  Texture, Vec3 } from 'playcanvas';
import { zoneAt } from './zones.js';

// Measured on the apartment's meshes: spout = the centre of the outlet (the kitchen mixer's aerator disc, x -2.668..-2.633,
// z -1.034..-0.999 at y 1.0754; the end of the bathroom tap's flat spout, x 6.662..6.681, z 1.239..1.253, open below at
// y 1.229); lands = the surface a ray straight down from it meets (the kitchen sink's drain basket at 0.688, the domed
// drain cap in the basin at 0.9655); pool = where the splash spreads (over the basket; over the top of the cap, 0.970);
// handle = what E aims at (the middle of the mixer, between its lever and its spout; the bathroom tap's body and spout);
// zone: where the player must stand to reach it (zones.js).
export const TAPS = {
  kitchen: { label: 'the kitchen tap', zone: 'main', spout: [-2.6505, 1.074, -1.0165], lands: 0.689, pool: 0.6905, handle: [-2.57, 1.05, -1.09],
    width: [0.0085, 0.0062], gain: 0.5, splash: 0.036 },
  bathroom: { label: 'the bathroom tap', zone: 'bath', spout: [6.6715, 1.228, 1.246], lands: 0.9655, pool: 0.9715, handle: [6.6, 1.2, 1.246],
    width: [0.007, 0.005], gain: 0.55, splash: 0.032,
    // The bowl brimming (the story's tap left running hot: it overflows at the back, where the tap's ledge is lowest, at
    // 1.114): its water surface at 1.104, out to the bowl's walls (rays from the bowl's middle, every 11.25 degrees).
    basin: { y: 1.104, centre: [6.745, 1.2465], outline: [[6.9067, 1.2465], [6.9045, 1.2782], [6.8969, 1.3094], [6.8855, 1.3404],
      [6.8684, 1.3699], [6.846, 1.3977], [6.8179, 1.4225], [6.7841, 1.443], [6.745, 1.4576], [6.7016, 1.4648], [6.6555, 1.4625],
      [6.6087, 1.4504], [6.583, 1.4085], [6.5829, 1.3548], [6.5829, 1.3136], [6.5828, 1.2788], [6.5828, 1.2465], [6.5828, 1.2142],
      [6.5827, 1.1793], [6.5827, 1.138], [6.5826, 1.0841], [6.6085, 1.0422], [6.6552, 1.0297], [6.7015, 1.0276], [6.745, 1.0356],
      [6.7841, 1.0498], [6.8179, 1.0704], [6.8462, 1.095], [6.8687, 1.1228], [6.8857, 1.1525], [6.8974, 1.1834], [6.9044, 1.2148]] } },
};
const NOISE_EVERY = 2;            // seconds of play between the noises a running tap makes (hunt.js 'tap')

// A canvas texture (alpha only matters) of w x h drawn by draw(g, w, h).
function canvasTexture(device, w, h, name, draw, address = ADDRESS_CLAMP_TO_EDGE) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new Texture(device, { width: w, height: h, format: PIXELFORMAT_RGBA8, mipmaps: true, name, addressU: address, addressV: address });
  t.setSource(c);
  return t;
}

// An open tube from y 0 down to y -length, radius r0 at the top thinning to r1 (water speeds up as it falls), with u
// round it and v down it (one unit per 6 cm, for the scrolling streaks).
function stream(device, length, r0, r1) {
  const sides = 12, rows = 8, positions = [], normals = [], uvs = [], indices = [];
  for (let j = 0; j <= rows; j++) {
    const t = j / rows, r = r0 + (r1 - r0) * Math.sqrt(t);
    for (let i = 0; i <= sides; i++) {
      const a = i / sides * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      positions.push(c * r, -t * length, s * r); normals.push(c, 0, s); uvs.push(i / sides, t * length / 0.06);
    }
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < sides; i++) {
    const a = j * (sides + 1) + i, b = a + sides + 1;
    indices.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const mesh = new Mesh(device);
  mesh.setPositions(positions); mesh.setNormals(normals); mesh.setUvs(0, uvs); mesh.setIndices(indices); mesh.update();
  return mesh;
}

export class Taps {
  // camera: the player's (who is where, for E); isVisible(camera): which cameras draw the water (main.js: the player's);
  // configureMaterial(material, zone): the zone's probes; water: false leaves the water out (Node tests).
  constructor({ app, interactions, bank, camera, configureMaterial, isVisible = null, water = true }) {
    Object.assign(this, { app, bank, camera });
    this.onNoise = null;           // (x, z, 'tap') while one runs (main.js -> hunt.noise)
    this.isPlaying = () => true;   // whether play time is passing (main.js): noises count play time only
    this.listeners = new Set();
    this.time = 0;
    this.taps = new Map();
    const textures = water ? this.textures(app.graphicsDevice) : null;
    for (const [id, def] of Object.entries(TAPS)) {
      const tap = { id, def, on: false, hot: false, top: 0, bottom: 0, loop: null, noise: 0, length: def.spout[1] - def.lands,
        handle: new Vec3(...def.handle), at: [def.spout[0], (def.spout[1] + def.lands) / 2, def.spout[2]] };
      if (textures) this.build(tap, textures, m => configureMaterial?.(m, id === 'bathroom' ? 'bath' : 'main'), isVisible);
      // E on the tap, from the room it is in (nobody turns the bathroom tap through its wall).
      interactions?.add({ pos: tap.handle, size: 0.18, label: () => `Turn ${tap.on ? 'off' : 'on'} ${def.label}`,
        active: () => { const c = this.camera?.getPosition(); return !c || zoneAt(c.x, c.z) === def.zone; },
        use: () => this.toggle(id) });
      this.taps.set(id, tap);
    }
    this._update = dt => this.update(dt);
    app.on?.('update', this._update);
  }

  // The water's textures: streaks for the stream, broken white water for the splash, a ring for the ripples.
  textures(device) {
    const streaks = canvasTexture(device, 32, 128, 'tap-stream', (g, w, h) => {
      // Vertical streaks of thicker and thinner water, uneven down their length (whole periods both ways: it tiles round
      // the stream and down it without a seam).
      const img = g.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const band = 0.62 + 0.22 * Math.sin(x / w * Math.PI * 6 + Math.sin(y / h * Math.PI * 2) * 1.3) + 0.12 * Math.sin(x / w * Math.PI * 14);
        const ripple = 0.85 + 0.15 * Math.sin(y / h * Math.PI * 8 + x / w * Math.PI * 6);
        const k = (y * w + x) * 4;
        img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
        img.data[k + 3] = Math.max(0, Math.min(1, band * ripple)) * 255;
      }
      g.putImageData(img, 0, 0);
    }, ADDRESS_REPEAT);
    const foam = canvasTexture(device, 128, 128, 'tap-splash', (g, w, h) => {
      // A bright core, a frothy ring, flecks.
      g.clearRect(0, 0, w, h);
      const glow = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      glow.addColorStop(0, 'rgba(255,255,255,0.95)'); glow.addColorStop(0.25, 'rgba(255,255,255,0.7)');
      glow.addColorStop(0.55, 'rgba(255,255,255,0.28)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = glow; g.fillRect(0, 0, w, h);
      let seed = 11;
      const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let i = 0; i < 90; i++) {
        const a = rand() * Math.PI * 2, r = (0.15 + rand() * 0.75) * w / 2, s = 1 + rand() * 3.5;
        g.fillStyle = `rgba(255,255,255,${0.25 + rand() * 0.6})`;
        g.beginPath(); g.arc(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r, s, 0, Math.PI * 2); g.fill();
      }
    });
    const ring = canvasTexture(device, 128, 128, 'tap-ripple', (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const r = g.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w / 2);
      r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.62, 'rgba(255,255,255,0.9)'); r.addColorStop(0.78, 'rgba(255,255,255,0.35)');
      r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, w, h);
    });
    return { streaks, foam, ring };
  }

  // A tap's water: the stream (a tapered tube hung from the spout), the splash and two ripples where it lands, a few
  // drops. Each tap has its own materials (lit by its own room's probes); none casts a shadow.
  build(tap, { streaks, foam, ring }, configure, isVisible) {
    const { id, def, length } = tap, [sx, sy, sz] = def.spout;
    const water = (name, set) => {
      const m = new StandardMaterial(); m.name = name; m.useMetalness = true; m.metalness = 0;
      m.blendType = BLEND_NORMAL; m.depthWrite = false; m.opacityMapChannel = 'a';
      set(m); m.update(); configure(m); return m;
    };
    tap.mats = {
      // Clear water with streaks running down it (they scroll: pose()). Tiled twice down the tube, so its texture
      // transform is never the identity (which would be another shader).
      stream: water(`${id} tap stream`, m => { m.diffuse = new Color(0.84, 0.89, 0.92); m.gloss = 0.93; m.opacity = 0.86; m.opacityMap = streaks;
        m.opacityMapTiling.set(1, 2); m.specular = new Color(1, 1, 1); }),
      splash: water(`${id} tap splash`, m => { m.diffuse = new Color(0.86, 0.89, 0.91); m.gloss = 0.7; m.opacity = 0.75; m.opacityMap = foam; }),
      ripples: [0, 1].map(k => water(`${id} tap ripple ${k}`, m => { m.diffuse = new Color(0.8, 0.84, 0.87); m.gloss = 0.9; m.opacity = 0.5; m.opacityMap = ring; })),
    };
    const root = tap.root = new Entity(`${id} tap water`); this.app.root.addChild(root);
    const part = (name, render, at) => { const e = new Entity(name); root.addChild(e); e.addComponent('render', { castShadows: false, receiveShadows: false, ...render }); e.setPosition(...at); return e; };
    tap.stem = part(`${id} tap stream`, { meshInstances: [new MeshInstance(stream(this.app.graphicsDevice, length, def.width[0], def.width[1]), tap.mats.stream)] }, [sx, sy, sz]);
    tap.pool = part(`${id} tap splash`, { type: 'plane', material: tap.mats.splash }, [sx, def.pool + 0.0008, sz]);
    tap.ripples = tap.mats.ripples.map((m, k) => part(`${id} tap ripple ${k}`, { type: 'plane', material: m }, [sx, def.pool + 0.0003 + k * 0.0002, sz]));
    // A few drops thrown up out of the splash, falling back.
    tap.drops = Array.from({ length: 5 }, (_, k) => {
      const e = part(`${id} tap drop ${k}`, { type: 'sphere', material: tap.mats.stream }, [sx, def.lands, sz]);
      e.setLocalScale(0.0032, 0.0042, 0.0032);
      return { e, phase: k / 5, a: k * 2.39996 };
    });
    // The brimming bowl (fill()): a flat surface out to the bowl's walls (2 mm short of them), dark and glossy, drawn
    // before the stream and splash that fall onto it.
    if (def.basin) {
      const B = def.basin, positions = [B.centre[0], B.y, B.centre[1]], indices = [];
      for (const [x, z] of B.outline) { const dx = x - B.centre[0], dz = z - B.centre[1], l = Math.hypot(dx, dz); positions.push(x - dx / l * 0.002, B.y, z - dz / l * 0.002); }
      for (let i = 1; i <= B.outline.length; i++) indices.push(0, i % B.outline.length + 1, i);
      const mesh = new Mesh(this.app.graphicsDevice);
      mesh.setPositions(positions); mesh.setNormals(positions.map((_, i) => (i % 3 === 1 ? 1 : 0))); mesh.setIndices(indices); mesh.update();
      tap.mats.basin = water(`${id} basin water`, m => { m.diffuse = new Color(0.05, 0.075, 0.085); m.gloss = 0.97; m.opacity = 0.62; });
      const mi = new MeshInstance(mesh, tap.mats.basin);
      mi.calculateSortDistance = () => 1e4;              // behind every other water, whatever the camera
      tap.basinWater = new Entity(`${id} basin water`); this.app.root.addChild(tap.basinWater);
      tap.basinWater.addComponent('render', { meshInstances: [mi], castShadows: false, receiveShadows: true });
      tap.basinWater.enabled = false;
    }
    for (const e of [root, tap.basinWater]) for (const r of e?.findComponents('render') ?? []) for (const mi of r.meshInstances) {
      mi.isVisibleFunc = cam => (isVisible ? isVisible(cam) : !cam.node?.name?.startsWith('probe-')) && cam.frustum.containsAabb(mi.aabb);
    }
    root.enabled = false;
  }

  isOn(id) { return !!this.taps.get(id)?.on; }
  isHot(id) { const t = this.taps.get(id); return !!(t?.on && t.hot); }
  // listener(id, on, { by, hot, wasHot }) after every change (world.js: the story's bathroom tap).
  on(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  // The player at the tap.
  toggle(id) { const t = this.taps.get(id); if (t) this.set(id, !t.on, { by: 'player' }); }

  // Turn a tap on or off. by: 'player' | 'story'; hot: running hot (the story's, after the cut); quiet: no click (a new
  // night laid out, a checkpoint rebuilt).
  set(id, on, { by = 'story', hot = false, quiet = false } = {}) {
    const t = this.taps.get(id);
    if (!t) return;
    const wasHot = t.on && t.hot;
    if (on) t.hot = wasHot || hot;
    if (t.on === on) { this.emit(t, on, { by, hot: t.hot, wasHot }); return; }
    t.on = on;
    // The handle's click: the player's both ways; the story's when it shuts (as the tap behind the locked door stops).
    if (!quiet && (by === 'player' || !on)) this.bank?.play('latch_2', { at: [t.handle.x, t.handle.y, t.handle.z], gain: 0.25, rate: on ? 1.55 : 1.4, send: 0.3 });
    if (on) {
      t.loop?.stop(0.1);
      t.loop = this.bank?.loop('tap_running', { at: t.at, gain: t.def.gain, ref: 0.6, rolloff: 1.3, send: 0.4, fadeIn: quiet ? 0.6 : 0.3 }) ?? null;
      t.noise = 0;                 // heard at once, then every NOISE_EVERY s
    } else {
      t.loop?.stop(0.4); t.loop = null;
      t.hot = false;
      if (!quiet) this.bank?.play('water_drop', { at: [t.def.spout[0], t.def.lands + 0.05, t.def.spout[2]], gain: 0.16, rate: [0.95, 1.15], delay: 0.7 });
    }
    this.emit(t, on, { by, hot: t.hot, wasHot });
  }

  emit(t, on, info) { for (const fn of this.listeners) fn(t.id, on, info); }

  // A bowl filled to the brim (world.js: the story's hot tap overflowing; it stays full, the drain blocked) or emptied.
  fill(id, full) {
    const t = this.taps.get(id);
    if (!t?.def.basin) return;
    t.full = !!full;
    if (t.basinWater && !this.revealing) t.basinWater.enabled = t.full;
  }

  // Where a tap's water lands now: the bowl, or the water filling it.
  landing(t) { return t.full ? t.def.basin.y : t.def.lands; }

  // Every tap off and every bowl empty, without a sound (a new night).
  reset() {
    for (const id of this.taps.keys()) { this.set(id, false, { quiet: true }); this.fill(id, false); }
    for (const t of this.taps.values()) { t.top = t.bottom = 0; if (t.root) t.root.enabled = false; }
  }

  update(dt) {
    dt = Math.min(Math.max(dt, 0), 0.1);
    this.time += dt;
    const playing = this.isPlaying();
    for (const t of this.taps.values()) {
      // Opening, the water reaches down from the spout; shut, the last of it falls away from the spout (~3 m/s).
      const reach = t.def.spout[1] - this.landing(t);
      if (t.on) { t.top = 0; t.bottom = Math.min(reach, t.bottom + 3 * dt); }
      else if (t.bottom > 0) { t.bottom = Math.min(t.bottom, reach); t.top += 3 * dt; if (t.top >= t.bottom) t.top = t.bottom = 0; }
      if (t.root && !this.revealing) t.root.enabled = t.bottom > 0;
      if (t.root && (t.bottom > 0 || this.revealing)) this.pose(t, this.revealing ? 0 : t.top, this.revealing ? reach : t.bottom);
      if (t.on && playing && this.onNoise) {
        t.noise -= dt;
        if (t.noise <= 0) { t.noise = NOISE_EVERY; this.onNoise(t.def.spout[0], t.def.spout[2], 'tap'); }
      }
    }
  }

  // The water's shape this frame: the stream from `top` to `bottom` below the spout, the splash while it lands.
  pose(t, top, bottom) {
    const L = t.length, reach = t.def.spout[1] - this.landing(t), pool = t.full ? t.def.basin.y : t.def.pool, wobble = (1 + 0.05 * Math.sin(this.time * 37 + L * 50) + 0.03 * Math.sin(this.time * 61)) * (t.hot ? 1.15 : 1);
    t.stem.setLocalScale(wobble, Math.max(1e-4, (bottom - top) / L), wobble);
    t.stem.setPosition(t.def.spout[0], t.def.spout[1] - top, t.def.spout[2]);
    // The streaks run down the stream (the texture repeats every 3 cm; slower than the water itself, which would only
    // flicker), wrapped to stay small. A growing offset moves them down (the engine's v runs up the texture).
    t.mats.stream.opacityMapOffset.set(0, (this.time * 0.6 / 0.03) % 1);
    t.mats.stream.update();
    const landing = bottom >= reach - 1e-6 && top < reach;
    t.pool.enabled = landing;
    t.pool.setPosition(t.def.spout[0], pool + 0.0008, t.def.spout[2]);
    t.ripples.forEach((e, k) => e.setPosition(t.def.spout[0], pool + 0.0003 + k * 0.0002, t.def.spout[2]));
    t.pool.setLocalEulerAngles(0, (this.time * 140) % 360, 0);
    const s = t.def.splash * 2 * (0.9 + 0.1 * Math.sin(this.time * 23)) * (t.hot ? 1.2 : 1);
    t.pool.setLocalScale(s, 1, s);
    t.ripples.forEach((e, k) => {
      const phase = (this.time * 2.2 + k * 0.5) % 1, m = t.mats.ripples[k];
      e.enabled = landing;
      const r = t.def.splash * (0.8 + phase * 2.2);
      e.setLocalScale(r * 2, 1, r * 2);
      m.opacity = Math.max(0.004, 0.5 * (1 - phase) * (1 - phase)); m.update();   // never 0 or 1 (another shader)
    });
    for (const d of t.drops) {
      const p = (this.time * 2.6 + d.phase) % 1, a = d.a + Math.floor(this.time * 2.6 + d.phase) * 1.7;
      const r = t.def.splash * (0.4 + p * 0.9), up = 4 * p * (1 - p) * 0.022;
      d.e.enabled = landing && p < 0.92;
      d.e.setPosition(t.def.spout[0] + Math.cos(a) * r, pool + 0.003 + up, t.def.spout[2] + Math.sin(a) * r);
    }
  }

  // The warm-up (main.js): every tap's water drawn, so its shaders are built before play; returns the undo.
  reveal() {
    this.revealing = true;
    for (const t of this.taps.values()) {
      if (!t.root) continue;
      t.root.enabled = true; this.pose(t, 0, t.def.spout[1] - this.landing(t));
      for (const e of [t.pool, ...t.ripples]) e.enabled = true;
      for (const d of t.drops) d.e.enabled = true;
      if (t.basinWater) t.basinWater.enabled = true;
    }
    return () => {
      this.revealing = false;
      for (const t of this.taps.values()) { if (t.root) t.root.enabled = t.bottom > 0; if (t.basinWater) t.basinWater.enabled = !!t.full; }
    };
  }

  destroy() { this.app.off?.('update', this._update); for (const t of this.taps.values()) { t.loop?.stop(0.1); t.root?.destroy(); t.basinWater?.destroy(); } }
}
