// Rain, P.T.-style: outside is pitch black; water gathers and runs down the window panes (an animated normal map +
// opacity on the 'WindowGlass' material, which tools/build-assets.mjs gives world-planar UVs in metres), visible only
// by the room's own light on it. Lightning (with thunder through `sounds`) briefly lights the drops and the rain
// falling outside.
import {
  Color, Entity, Texture, Vec3, Quat, Mat4, Curve, CurveSet, PIXELFORMAT_RGBA8, ADDRESS_REPEAT, ADDRESS_CLAMP_TO_EDGE,
  FILTER_LINEAR, FILTER_LINEAR_MIPMAP_LINEAR, EMITTERSHAPE_BOX, BLEND_ADDITIVE, BLEND_NORMAL, StandardMaterial, LIGHTFALLOFF_INVERSESQUARED, SHADOWUPDATE_THISFRAME,
} from 'playcanvas';

const N = 512;               // glass texture pixels; it spans TILE metres of glass
const TILE = 0.75;

// Rain volumes outside the glass: [centre, half extents]
const VOLUMES = [[[-8.0, 1.8, 1.4], [1.0, 2.4, 3.2]], [[3.5, 1.8, -2.9], [10, 2.4, 1.0]]];

export class Rain {
  constructor(app, apartment, sounds, { moon }) {
    this.app = app;
    this.sounds = sounds;
    this.moon = moon;
    this.moonBase = moon.light.intensity;
    this.drops = [];
    this.roomLight = 1;        // 0..1, how much light is on in the flat (set by main.js from the probes)
    this.timer = 0;
    this.flash = { next: 8 + Math.random() * 10, seq: [] };

    this.sprite = this.dropSprite(48);
    this.canvas = document.createElement('canvas'); this.canvas.width = this.canvas.height = N;
    this.ctx = this.canvas.getContext('2d');
    this.glassTex = new Texture(app.graphicsDevice, { width: N, height: N, format: PIXELFORMAT_RGBA8, mipmaps: true,
      addressU: ADDRESS_REPEAT, addressV: ADDRESS_REPEAT, minFilter: FILTER_LINEAR_MIPMAP_LINEAR, magFilter: FILTER_LINEAR, name: 'rain-glass' });
    // Drop coverage (alpha) and the colour a drop shows when lightning lights it from behind.
    this.beads = [this.beadSprite(32, [255, 246, 232]), this.beadSprite(32, [235, 232, 226])];
    this.glowCanvas = document.createElement('canvas'); this.glowCanvas.width = this.glowCanvas.height = N;
    this.glowCtx = this.glowCanvas.getContext('2d');
    this.glowTex = new Texture(app.graphicsDevice, { width: N, height: N, format: PIXELFORMAT_RGBA8, mipmaps: true,
      addressU: ADDRESS_REPEAT, addressV: ADDRESS_REPEAT, minFilter: FILTER_LINEAR_MIPMAP_LINEAR, magFilter: FILTER_LINEAR, name: 'rain-beads' });
    for (let i = 0; i < 700; i++) this.spawn(true);
    for (let k = 0; k < 4; k++) this.merge(this.drops);      // start from glass that has been wet a while
    this.draw();

    for (const r of apartment.findComponents('render')) for (const mi of r.meshInstances) {
      const m = mi.material;
      if (!/^WindowGlass(@\w+)?$/.test(m.name) || this.glasses?.includes(m)) continue;
      // Clear glass between the drops; the drops are water, seen by the room's light (grey diffuse + sharp specular
      // from the normal map) against the black outside. Their emissive is only raised during a lightning flash.
      const tile = (t) => t.set(1 / TILE, 1 / TILE);
      m.normalMap = this.glassTex; tile(m.normalMapTiling); m.bumpiness = 1.8;
      m.emissiveMap = this.glowTex; tile(m.emissiveMapTiling); m.emissive = new Color(0.95, 0.9, 0.82); m.emissiveIntensity = 0;
      m.opacityMap = this.glowTex; m.opacityMapChannel = 'a'; tile(m.opacityMapTiling); m.opacity = 0.75;
      m.blendType = BLEND_NORMAL; m.depthWrite = false;
      m.diffuse = new Color(0.42, 0.42, 0.43); m.gloss = 0.97; m.useMetalness = true; m.metalness = 0;
      m.update();
      (this.glasses ||= []).push(m);
    }

    this.streaks = VOLUMES.map(([c, ext]) => this.rainVolume(c, ext));
    app.on('update', (dt) => this.update(dt));
  }

  // A water drop as a normal-map sprite: rgb = surface normal of a squashed half-sphere, a = coverage.
  dropSprite(S) {
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'), img = g.createImageData(S, S);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const x = (i + 0.5) / S * 2 - 1, y = ((j + 0.5) / S * 2 - 1) * 1.15 - 0.1, r2 = x * x + y * y, k = (j * S + i) * 4;
      if (r2 >= 1) { img.data[k + 3] = 0; continue; }
      const z = Math.sqrt(1 - r2);
      img.data[k] = (x * 0.5 + 0.5) * 255; img.data[k + 1] = (-y * 0.5 + 0.5) * 255; img.data[k + 2] = z * 255;
      img.data[k + 3] = Math.min(1, (1 - r2) * 4) * 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  // What a drop shows of the room (emissive + coverage): a water lens. It turns the lit room upside down, so its lower
  // half is brighter; a dark meniscus at the rim; a tiny highlight near the top.
  beadSprite(S, [r, g, b]) {
    const c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d'), img = x.createImageData(S, S);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const u = (i + 0.5) / S * 2 - 1, v = (j + 0.5) / S * 2 - 1, d = Math.hypot(u, v), k = (j * S + i) * 4;
      if (d >= 1) { img.data[k + 3] = 0; continue; }
      const body = 0.32 + 0.5 * Math.max(0, v + 0.2) ** 1.5;                      // refracted room, brighter below
      const rim = Math.exp(-(((d - 0.86) / 0.1) ** 2));                            // dark meniscus
      const spec = Math.exp(-(((u + 0.3) ** 2 + (v + 0.42) ** 2) / 0.012));        // highlight
      const l = Math.min(1, body * (1 - 0.8 * rim) + spec);
      img.data[k] = r * l; img.data[k + 1] = g * l; img.data[k + 2] = b * l;
      img.data[k + 3] = 255 * Math.min(1, (1 - d) * 5) * (0.55 + 0.4 * rim + 0.3 * spec);
    }
    x.putImageData(img, 0, 0);
    return c;
  }

  // --- drops on the glass ----------------------------------------------------------------------------------------
  // Pixels on the N x N tile (1 px ~ 2.7 mm). Fine droplets keep landing; touching drops merge (volumes add); once a
  // drop is heavy enough it starts to run down, in stutters, sweeping up the droplets in its way and leaving a trail
  // of beads behind it, until it has shed enough water to stop. The tile repeats down the pane, so a drop leaving the
  // bottom carries on at the top.
  spawn(anywhere) {
    const r = 1.0 + Math.random() ** 3 * 4.2;
    this.drops.push({ x: Math.random() * N, y: Math.random() * N, r, v: 0, run: false, hold: 0, moved: 0, tint: Math.random() < 0.7 ? 0 : 1,
      seed: anywhere ? Math.random() : 0 });
  }

  update(dt) {
    dt = Math.min(dt, 0.05);
    const SLIDE = 6.2, drops = this.drops;
    // Rain keeps landing on the glass (a few big splashes among the fine mist).
    this.rainAcc = (this.rainAcc || 0) + dt * 55;
    while (this.rainAcc >= 1) { this.rainAcc--; this.spawn(false); }
    for (const d of drops) {
      if (!d.run) { if (d.r > SLIDE) { d.run = true; d.hold = Math.random() * 0.6; } else continue; }
      // Running: heavier drops are faster; surface friction makes them catch and let go.
      if (d.hold > 0) { d.hold -= dt; d.v *= 0.5; continue; }
      const vmax = 30 + (d.r - SLIDE) * 22;
      d.v = Math.min(vmax, d.v + 220 * dt);
      if (Math.random() < dt * 0.9) d.hold = 0.05 + Math.random() * (0.5 / (1 + d.r - SLIDE));
      const dy = d.v * dt;
      d.y += dy;
      d.x += (Math.random() - 0.5) * 10 * dt + Math.sin(d.y * 0.05 + d.tint * 3) * 3 * dt;
      d.moved += dy;
      if (d.y > N) d.y -= N;
      // Trail: a bead every few pixels, paid for out of the drop's own water.
      if (d.moved > 4 + Math.random() * 6) {
        d.moved = 0;
        const tr = d.r * (0.18 + Math.random() * 0.17);
        drops.push({ x: d.x + (Math.random() - 0.5) * d.r * 0.5, y: d.y - d.r * 1.1, r: tr, v: 0, run: false, hold: 0, moved: 0, tint: d.tint, seed: 0 });
        d.r = Math.cbrt(Math.max(0, d.r ** 3 - tr ** 3));
        if (d.r < SLIDE * 0.82) { d.run = false; d.v = 0; }
      }
    }
    this.merge(drops);
    // Keep the count bounded: the oldest fine droplets dry into the film first.
    const all = this.drops, excess = all.length - 900;
    if (excess > 0) {
      let removed = 0;
      this.drops = all.filter((d) => removed >= excess || d.run || d.r >= 2.4 || !++removed);
    }
    this.timer += dt;
    if (this.timer > 1 / 30) { this.timer = 0; this.draw(); }
    this.lightning(dt);
  }

  // Touching drops become one (the larger keeps its place; a running drop keeps running). Spatial hash, 16 px cells.
  merge(drops) {
    const C = 16, W = N / C, cells = new Map();
    drops.forEach((d, i) => {
      const k = Math.floor(d.y / C) * W + Math.floor(((d.x % N) + N) % N / C);
      (cells.get(k) || cells.set(k, []).get(k)).push(i);
    });
    const dead = new Uint8Array(drops.length);
    for (let i = 0; i < drops.length; i++) {
      const a = drops[i];
      if (dead[i] || (!a.run && a.r < 2.2)) continue;   // only drops of some size gather the others
      const cx = Math.floor(((a.x % N) + N) % N / C), cy = Math.floor(a.y / C);
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const list = cells.get((cy + oy) * W + ((cx + ox + W) % W));
        if (!list) continue;
        for (const j of list) {
          if (j === i || dead[j]) continue;
          const b = drops[j];
          if (b.r > a.r) continue;
          const reach = (a.r + b.r) * (a.run ? 0.95 : 0.75);
          if ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 > reach * reach) continue;
          a.r = Math.min(9, Math.cbrt(a.r ** 3 + b.r ** 3));
          dead[j] = 1;
        }
      }
    }
    this.drops = drops.filter((_, i) => !dead[i]);
  }

  draw() {
    const g = this.ctx;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = 'rgba(128,128,255,0.10)';   // flat normal, faint wet film
    g.clearRect(0, 0, N, N); g.fillRect(0, 0, N, N);
    const b = this.glowCtx;
    b.clearRect(0, 0, N, N);
    const put = (x, y, r, stretch, tint) => {
      // wrap around the tile edges so the repeat is seamless
      for (const ox of [0, -N, N]) for (const oy of [0, -N, N]) {
        const px = x + ox, py = y + oy;
        if (px + r < 0 || px - r > N || py + r * stretch < 0 || py - r * stretch > N) continue;
        g.drawImage(this.sprite, px - r, py - r * stretch, r * 2, r * 2 * stretch);
        b.drawImage(this.beads[tint], px - r, py - r * stretch, r * 2, r * 2 * stretch);
      }
    };
    for (const d of this.drops) put(d.x, d.y, d.r, d.run ? 1.15 + Math.min(0.5, d.v / 120) : 1, d.tint);
    this.glassTex.setSource(this.canvas);
    this.glowTex.setSource(this.glowCanvas);

  }

  rainVolume(centre, ext) {
    const c = document.createElement('canvas'); c.width = 8; c.height = 64;
    const g = c.getContext('2d'), grad = g.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(0.5, 'rgba(255,255,255,0.9)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(3, 0, 2, 64);
    const tex = new Texture(this.app.graphicsDevice, { width: 8, height: 64, format: PIXELFORMAT_RGBA8, mipmaps: false });
    tex.setSource(c);
    const e = new Entity('rain');
    const vel = new CurveSet([[0, 0.4], [0, -9], [0, 0]]);
    e.addComponent('particlesystem', {
      numParticles: 1800, lifetime: 0.7, rate: 0.0004, rate2: 0.0006, emitterShape: EMITTERSHAPE_BOX,
      emitterExtents: new Vec3(ext[0] * 2, 0.2, ext[2] * 2), velocityGraph: vel, colorMap: tex,
      alignToMotion: true, stretch: 0.35, startAngle: 0, scaleGraph: new Curve([0, 0.012]),
      alphaGraph: new Curve([0, 0.22]), colorGraph: new CurveSet([[0, 0.55], [0, 0.6], [0, 0.7]]),
      blendType: BLEND_ADDITIVE, depthWrite: false, lighting: false, intensity: 1, loop: true, autoPlay: true,
    });
    e.setPosition(centre[0], centre[1] + ext[1], centre[2]);
    this.app.root.addChild(e);
    return e;
  }

  // Lightning every 25-70 s: two or three flickers of cold light from the sky, thunder a few seconds later.
  lightning(dt) {
    const f = this.flash;
    f.next -= dt;
    if (f.next <= 0) {
      f.next = 25 + Math.random() * 45;
      const n = 2 + Math.floor(Math.random() * 2);
      let t = 0;
      f.seq = [];
      for (let i = 0; i < n; i++) { f.seq.push({ at: t, len: 0.05 + Math.random() * 0.08, power: 6 + Math.random() * 10 }); t += 0.08 + Math.random() * 0.25; }
      f.time = 0;
      const distance = 1.5 + Math.random() * 4;
      setTimeout(() => this.sounds?.thunder(distance), distance * 1000);
    }
    let power = 0;
    if (f.seq.length) {
      f.time += dt;
      for (const s of f.seq) if (f.time >= s.at && f.time < s.at + s.len) power = Math.max(power, s.power * (1 - (f.time - s.at) / s.len));
      if (f.time > 2) f.seq = [];
    }
    // Lightning is the only light from outside: the sky light exists only during a flash (its shadow re-rendered once).
    const on = power > 0;
    if (on !== this.moon.light.enabled) { this.moon.light.enabled = on; if (on) this.moon.light.shadowUpdateMode = SHADOWUPDATE_THISFRAME; }
    this.moon.light.intensity = this.moonBase + power;
    for (const s of this.streaks) s.particlesystem.intensity = power * 0.9;   // the rain outside shows only in a flash
    // Drops refract the lit room behind the viewer (a faint glow that follows how many lights are on), and flare in a flash.
    const glow = this.roomLight * 0.55 + power * 0.3;
    for (const g of this.glasses || []) if (Math.abs(g.emissiveIntensity - glow) > 1e-4) { g.emissiveIntensity = glow; g.update(); }
  }
}
