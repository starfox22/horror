// Rain: drops gathering and running down the window panes (an animated normal map + opacity on the 'WindowGlass'
// material, which tools/build-assets.mjs gives world-planar UVs in metres), street lamps outside two windows whose
// cookies project the moving drops onto the walls and floor inside, streaks of rain falling past the windows, and
// lightning with thunder (through `sounds`).
import {
  Color, Entity, Texture, Vec3, Quat, Mat4, Curve, CurveSet, PIXELFORMAT_RGBA8, ADDRESS_REPEAT, ADDRESS_CLAMP_TO_EDGE,
  FILTER_LINEAR, FILTER_LINEAR_MIPMAP_LINEAR, EMITTERSHAPE_BOX, BLEND_ADDITIVE, BLEND_NORMAL, StandardMaterial, LIGHTFALLOFF_INVERSESQUARED, SHADOWUPDATE_THISFRAME,
} from 'playcanvas';

const N = 512;               // glass texture pixels; it spans TILE metres of glass
const TILE = 1.4;
const COOKIE = 256;

// Street lamps outside: west of the living room and north of the bedroom. [position, aim at, colour, intensity]
const STREET = [
  [[-9.5, 4.2, 1.4], [-4.5, 0.2, 1.6], new Color(1.0, 0.66, 0.36), 9],
  [[11.6, 4.0, -4.6], [11.6, 0.2, 0.6], new Color(0.75, 0.82, 1.0), 6],
];
// Rain volumes outside the glass: [centre, half extents]
const VOLUMES = [[[-8.0, 1.8, 1.4], [1.0, 2.4, 3.2]], [[3.5, 1.8, -2.9], [10, 2.4, 1.0]]];

export class Rain {
  constructor(app, apartment, sounds, { moon }) {
    this.app = app;
    this.sounds = sounds;
    this.moon = moon;
    this.moonBase = moon.light.intensity;
    this.drops = [];
    this.trail = [];
    this.timer = 0;
    this.flash = { next: 8 + Math.random() * 10, seq: [] };

    this.sprite = this.dropSprite(48);
    this.canvas = document.createElement('canvas'); this.canvas.width = this.canvas.height = N;
    this.ctx = this.canvas.getContext('2d');
    this.glassTex = new Texture(app.graphicsDevice, { width: N, height: N, format: PIXELFORMAT_RGBA8, mipmaps: true,
      addressU: ADDRESS_REPEAT, addressV: ADDRESS_REPEAT, minFilter: FILTER_LINEAR_MIPMAP_LINEAR, magFilter: FILTER_LINEAR, name: 'rain-glass' });
    // Bead colour: each drop holds a tiny bright image of the city behind it (warm or cool), with a darker rim.
    this.beads = [this.beadSprite(32, [255, 196, 140]), this.beadSprite(32, [170, 200, 255])];
    this.glowCanvas = document.createElement('canvas'); this.glowCanvas.width = this.glowCanvas.height = N;
    this.glowCtx = this.glowCanvas.getContext('2d');
    this.glowTex = new Texture(app.graphicsDevice, { width: N, height: N, format: PIXELFORMAT_RGBA8, mipmaps: true,
      addressU: ADDRESS_REPEAT, addressV: ADDRESS_REPEAT, minFilter: FILTER_LINEAR_MIPMAP_LINEAR, magFilter: FILTER_LINEAR, name: 'rain-beads' });
    this.cookieCanvas = document.createElement('canvas'); this.cookieCanvas.width = this.cookieCanvas.height = COOKIE;
    this.cookieCtx = this.cookieCanvas.getContext('2d');
    this.cookieTex = new Texture(app.graphicsDevice, { width: COOKIE, height: COOKIE, format: PIXELFORMAT_RGBA8, mipmaps: false,
      addressU: ADDRESS_CLAMP_TO_EDGE, addressV: ADDRESS_CLAMP_TO_EDGE, name: 'rain-cookie' });
    for (let i = 0; i < 260; i++) this.spawn(true);
    this.draw();

    for (const r of apartment.findComponents('render')) for (const mi of r.meshInstances) {
      const m = mi.material;
      if (m.name !== 'WindowGlass') continue;
      // Clear glass between the drops; each drop is a bead of light (emissive + opacity from the bead canvas) whose
      // normal map also catches the room's lamps. (Dynamic refraction was tried: through CameraFrame it blurred the
      // city into a flat haze, and a lit diffuse film washed it out, so drops stay dark-diffuse and self-lit.)
      const tile = (t) => t.set(1 / TILE, 1 / TILE);
      m.normalMap = this.glassTex; tile(m.normalMapTiling); m.bumpiness = 1.6;
      m.emissiveMap = this.glowTex; tile(m.emissiveMapTiling); m.emissive = Color.WHITE; m.emissiveIntensity = 0.8;
      m.opacityMap = this.glowTex; m.opacityMapChannel = 'a'; tile(m.opacityMapTiling); m.opacity = 1;
      m.blendType = BLEND_NORMAL; m.depthWrite = false;
      m.diffuse = new Color(0.01, 0.01, 0.012); m.gloss = 0.95; m.useMetalness = true; m.metalness = 0;
      m.update();
    }

    this.lamps = STREET.map(([p, at, color, intensity]) => {
      const e = new Entity('street lamp');
      e.addComponent('light', { type: 'spot', color, intensity, range: 14, innerConeAngle: 20, outerConeAngle: 42,
        falloffMode: LIGHTFALLOFF_INVERSESQUARED, castShadows: true, shadowResolution: 1024, shadowBias: 0.2,
        normalOffsetBias: 0.05, cookie: this.cookieTex, cookieIntensity: 0.85, volumetricScattering: 0.7 });
      e.setPosition(...p);
      e.lookAt(new Vec3(...at)); e.rotateLocal(90, 0, 0);    // spot lights shine along -Y: turn it onto -Z (the look direction)
      app.root.addChild(e);
      e.light.shadowUpdateMode = SHADOWUPDATE_THISFRAME;   // render the shadow once: the walls do not move
      return e;
    });
    this.streaks = VOLUMES.map(([c, ext]) => this.rainVolume(c, ext));
    this.city();
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

  beadSprite(S, [r, g, b]) {
    const c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d'), grad = x.createRadialGradient(S * 0.45, S * 0.58, 0, S / 2, S / 2, S / 2);
    grad.addColorStop(0, `rgba(${r},${g},${b},0.95)`); grad.addColorStop(0.35, `rgba(${r * 0.5 | 0},${g * 0.5 | 0},${b * 0.5 | 0},0.75)`);
    grad.addColorStop(0.8, 'rgba(8,8,10,0.6)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = grad; x.fillRect(0, 0, S, S);
    return c;
  }

  spawn(anywhere) {
    const big = Math.random() < 0.12;
    this.drops.push({ x: Math.random() * N, y: anywhere ? Math.random() * N : -10, r: big ? 7 + Math.random() * 6 : 1.5 + Math.random() * 3.5,
      v: 0, mass: big ? 1 : 0, wait: Math.random() * 6, tint: Math.random() < 0.7 ? 0 : 1 });
  }

  update(dt) {
    dt = Math.min(dt, 0.05);
    for (const d of this.drops) {
      if (d.mass) {
        // Big drops hang, then slide in jerks, leaving a trail of tiny drops and absorbing small ones.
        d.wait -= dt;
        if (d.wait < 0) { d.v = Math.min(160, d.v + 260 * dt); d.x += (Math.random() - 0.5) * 18 * dt; }
        if (Math.random() < dt * 0.6) { d.v = 0; d.wait = Math.random() * 1.5; }
        d.y += d.v * dt;
        if (d.v > 20 && Math.random() < dt * 22) this.trail.push({ x: d.x + (Math.random() - 0.5) * d.r * 0.6, y: d.y - d.r, r: 0.8 + Math.random() * d.r * 0.22, life: 6 + Math.random() * 8, tint: d.tint });
      }
    }
    this.drops = this.drops.filter(d => d.y < N + 20);
    while (this.drops.length < 260) this.spawn(false);
    if (Math.random() < dt * 30) this.drops.push({ x: Math.random() * N, y: Math.random() * N, r: 1.2 + Math.random() * 2.5, v: 0, mass: 0, wait: 0, life: 25, tint: Math.random() < 0.7 ? 0 : 1 });
    for (const t of this.trail) t.life -= dt;
    this.trail = this.trail.filter(t => t.life > 0).slice(-500);
    // Small static drops eventually evaporate into the wet film.
    for (const d of this.drops) if (!d.mass && d.life !== undefined) d.life -= dt;
    this.drops = this.drops.filter(d => d.life === undefined || d.life > 0).slice(-520);

    this.timer += dt;
    if (this.timer > 1 / 24) { this.timer = 0; this.draw(); }
    this.lightning(dt);
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
    for (const t of this.trail) put(t.x, t.y, t.r, 1, t.tint ?? 0);
    for (const d of this.drops) put(d.x, d.y, d.r, d.mass && d.v > 30 ? 1.5 : 1, d.tint ?? 0);
    this.glassTex.setSource(this.canvas);
    this.glowTex.setSource(this.glowCanvas);

    // Cookie: drops as dark cores with bright rims on a slightly mottled window light, plus mullions.
    const c = this.cookieCtx;
    c.fillStyle = '#d8d8d8'; c.fillRect(0, 0, COOKIE, COOKIE);
    c.globalAlpha = 0.85;
    c.drawImage(this.canvas, 0, 0, COOKIE, COOKIE);
    c.globalAlpha = 1;
    c.fillStyle = 'rgba(0,0,0,0.85)';
    c.fillRect(COOKIE * 0.49, 0, COOKIE * 0.03, COOKIE); c.fillRect(0, COOKIE * 0.32, COOKIE, COOKIE * 0.025);
    const grad = c.createRadialGradient(COOKIE / 2, COOKIE / 2, COOKIE * 0.3, COOKIE / 2, COOKIE / 2, COOKIE * 0.5);
    grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,1)');
    c.fillStyle = grad; c.fillRect(0, 0, COOKIE, COOKIE);
    this.cookieTex.setSource(this.cookieCanvas);
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

  // The city at night beyond the windows, so the panes have lights to bend: two big emissive backdrops (west, north)
  // painted once on a canvas with dark towers, lit windows, red aircraft lights and a sodium glow down at street level.
  city() {
    const W = 2048, H = 1024, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#05070c'); sky.addColorStop(0.55, '#0d0f16'); sky.addColorStop(0.8, '#2a1d14'); sky.addColorStop(1, '#3a2614');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    const rnd = (a, b) => a + Math.random() * (b - a);
    for (let layer = 0; layer < 3; layer++) {
      const far = 2 - layer, shade = 6 + layer * 5;
      for (let x = -40; x < W; ) {
        const w = rnd(70, 220) / (far + 1), top = H * (0.25 + 0.3 * Math.random() + far * 0.12);
        g.fillStyle = `rgb(${shade},${shade + 1},${shade + 4})`; g.fillRect(x, top, w, H - top);
        const lit = 0.18 + Math.random() * 0.25;
        for (let wy = top + 8; wy < H; wy += 16 / (far + 1)) for (let wx = x + 5; wx < x + w - 5; wx += 12 / (far + 1)) {
          if (Math.random() > lit) continue;
          const warm = Math.random() < 0.75, a = rnd(0.35, 0.95) / (far * 0.6 + 1);
          g.fillStyle = warm ? `rgba(255,${rnd(170, 210) | 0},${rnd(100, 150) | 0},${a})` : `rgba(170,200,255,${a})`;
          g.fillRect(wx, wy, 6 / (far + 1), 8 / (far + 1));
        }
        if (top < H * 0.4 && Math.random() < 0.5) { g.fillStyle = 'rgba(255,40,30,0.9)'; g.fillRect(x + w / 2 - 1.5, top - 3, 3, 3); }
        x += w + rnd(0, 30);
      }
    }
    const glow = g.createLinearGradient(0, H * 0.75, 0, H);
    glow.addColorStop(0, 'rgba(255,140,60,0)'); glow.addColorStop(1, 'rgba(255,140,60,0.35)');
    g.fillStyle = glow; g.fillRect(0, H * 0.75, W, H * 0.25);
    const tex = new Texture(this.app.graphicsDevice, { width: W, height: H, format: PIXELFORMAT_RGBA8, mipmaps: true,
      minFilter: FILTER_LINEAR_MIPMAP_LINEAR, magFilter: FILTER_LINEAR, name: 'city' });
    tex.setSource(c);
    const mat = new StandardMaterial();
    mat.useLighting = false; mat.useFog = false; mat.useSkybox = false;
    mat.diffuse = Color.BLACK; mat.emissiveMap = tex; mat.emissive = Color.WHITE; mat.emissiveIntensity = 3;
    mat.update();
    // A plane's normal is its local +Y and its image runs along local X (across) and Z (down the picture):
    // [position, normal (towards the apartment), width, height]
    for (const [p, n, w, h] of [[[-40, 4, 1.5], [1, 0, 0], 110, 55], [[4, 4, -40], [0, 0, 1], 120, 60]]) {
      const y = new Vec3(...n), z = new Vec3(0, -1, 0), x = new Vec3().cross(y, z);
      const rot = new Quat().setFromMat4(new Mat4().set([x.x, x.y, x.z, 0, y.x, y.y, y.z, 0, z.x, z.y, z.z, 0, 0, 0, 0, 1]));
      const e = new Entity('city');
      e.addComponent('render', { type: 'plane', material: mat, castShadows: false, receiveShadows: false });
      e.setPosition(...p); e.setRotation(rot); e.setLocalScale(w, 1, h);
      this.app.root.addChild(e);
    }
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
    this.moon.light.intensity = this.moonBase + power;
    for (const s of this.streaks) s.particlesystem.intensity = 1 + power * 0.8;
  }
}
