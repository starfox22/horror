// Animated fluid/steam effects for the existing authored cups; no replacement prop geometry.
import { Color, Entity, StandardMaterial, Texture, Vec3, Curve, CurveSet,
  BLEND_NORMAL, PIXELFORMAT_SRGBA8 } from 'playcanvas';
import { COFFEE_CUPS, COFFEE_NOZZLES } from './coffee-cycle.js';

export class CoffeeEffects {
  constructor(app) {
    this.app = app;
    this.root = new Entity('coffee fluid effects'); app.root.addChild(this.root);
    this.coffeeMat = new StandardMaterial();
    this.coffeeMat.diffuse = new Color(0.055, 0.016, 0.004);
    this.coffeeMat.useMetalness = true; this.coffeeMat.metalness = 0; this.coffeeMat.gloss = 0.88;
    this.coffeeMat.update();
    this.surfaceMat = new StandardMaterial();
    this.surfaceMat.diffuse = new Color(0.055, 0.016, 0.004);
    this.surfaceMat.useMetalness = true; this.surfaceMat.metalness = 0; this.surfaceMat.gloss = 0.65;
    this.cremaTexture = this.crema(); this.surfaceMat.diffuseMap = this.cremaTexture;
    this.surfaceMat.update();
    this.streams = COFFEE_NOZZLES.map((_, i) => this.mesh(`espresso stream ${i + 1}`, 'cylinder', this.coffeeMat));
    this.drops = COFFEE_NOZZLES.map((_, i) => this.mesh(`last coffee drops ${i + 1}`, 'sphere', this.coffeeMat));
    this.surfaces = COFFEE_CUPS.map((_, i) => this.mesh(`coffee and crema ${i + 1}`, 'cylinder', this.surfaceMat));
    this.ripples = COFFEE_CUPS.map((_, i) => this.mesh(`coffee impact ripple ${i + 1}`, 'torus', this.surfaceMat));
    this.puffTexture = this.puff();
    this.steam = COFFEE_CUPS.map((cup, i) => {
      const e = new Entity(`espresso cup steam ${i + 1}`);
      e.addComponent('particlesystem', {
        numParticles: 28, lifetime: 2.6, rate: 0.11, rate2: 0.16,
        emitterShape: 0, emitterExtents: new Vec3(0.012, 0, 0.012),
        startAngle: 0, startAngle2: 360, colorMap: this.puffTexture, blendType: BLEND_NORMAL,
        depthSoftening: 0.035, lighting: false, loop: true, preWarm: false, autoPlay: false, sort: 1,
        localVelocityGraph: new CurveSet([[0, 0, 1, 0.006], [0, 0.045, 1, 0.085], [0, 0, 1, 0]]),
        localVelocityGraph2: new CurveSet([[0, 0.008, 1, -0.01], [0, 0.065, 1, 0.11], [0, -0.008, 1, 0.012]]),
        scaleGraph: new Curve([0, 0.012, 1, 0.055]),
        alphaGraph: new Curve([0, 0, 0.18, 0.11, 0.6, 0.055, 1, 0]),
        colorGraph: new CurveSet([[0, 0.85], [0, 0.83], [0, 0.79]]),
        rotationSpeedGraph: new Curve([0, 15, 1, 3]),
      });
      e.setPosition(cup.x, cup.bottom + 0.012, cup.z); this.root.addChild(e);
      return { entity: e, playing: false };
    });
    this.steamLevel = 0;
    // Evaluate after every device and developer override has reached its final state.
    this.lightHandle = app.on('prerender', () => this.lightSteam());
    this.reset();
  }

  mesh(name, type, material) {
    const e = new Entity(name);
    e.addComponent('render', { type, material, castShadows: false });
    this.root.addChild(e);
    return e;
  }

  reset() {
    [...this.streams, ...this.drops, ...this.surfaces, ...this.ripples].forEach(e => { e.enabled = false; });
    for (const s of this.steam) { s.entity.particlesystem.stop(); s.entity.particlesystem.reset(); s.playing = false; }
    this.steamLevel = 0;
  }

  update(s) {
    this.steamLevel = s.steam;
    const crema = s.crema;
    this.surfaceMat.diffuse.set(0.055 + 0.21 * crema, 0.016 + 0.105 * crema, 0.004 + 0.035 * crema);
    this.surfaceMat.gloss = 0.83 - 0.2 * crema; this.surfaceMat.update();
    COFFEE_CUPS.forEach((cup, i) => {
      const nozzle = COFFEE_NOZZLES[i], y = cup.bottom + (cup.full - cup.bottom) * s.fill;
      const surface = this.surfaces[i];
      surface.enabled = s.fill > 0.002;
      const surfaceRadius = cup.bottomRadius + (cup.radius - cup.bottomRadius) * s.fill;
      surface.setLocalScale(surfaceRadius * 2, 0.001, surfaceRadius * 2);
      surface.setPosition(cup.x, y, cup.z);
      const stream = this.streams[i], length = nozzle.y - y;
      stream.enabled = s.flow > 0.025;
      const width = 0.0038 * Math.sqrt(s.flow) * (1 + 0.06 * Math.sin(s.elapsed * 31 + i));
      stream.setLocalScale(width, length, width);
      stream.setPosition(nozzle.x + Math.sin(s.elapsed * 27 + i) * 0.0003, y + length / 2, nozzle.z);
      const drop = this.drops[i], fall = (s.elapsed * 3.8 + i * 0.43) % 1;
      drop.enabled = s.drip && fall < 0.62;
      drop.setLocalScale(0.003, 0.005, 0.003);
      drop.setPosition(nozzle.x, nozzle.y - length * (fall / 0.62) ** 2, nozzle.z);
      const ripple = this.ripples[i], ripplePhase = (s.elapsed * 3.4 + i * 0.3) % 1;
      ripple.enabled = s.flow > 0.1 && s.fill > 0.01;
      const impactOffset = Math.hypot(nozzle.x - cup.x, nozzle.z - cup.z);
      const radius = Math.min(0.004 + ripplePhase * 0.009, (surfaceRadius - impactOffset) * 0.9);
      ripple.setLocalScale(radius * 2, 0.0007, radius * 2);
      ripple.setPosition(nozzle.x, y + 0.0009, nozzle.z);
      const steam = this.steam[i];
      steam.entity.setPosition(cup.x, y + 0.012, cup.z);
      if (s.steam > 0.025 && !steam.playing) { steam.entity.particlesystem.play(); steam.playing = true; }
      else if (s.steam <= 0.025 && steam.playing) { steam.entity.particlesystem.stop(); steam.playing = false; }
    });
  }

  lightSteam() {
    if (this.steamLevel <= 0) return;
    // Particle lighting only considers directional lights in this engine. Sample the
    // actual local fixtures instead, so wisps disappear when the apartment is dark.
    let illumination = 0;
    for (const light of this.app.root.findComponents('light')) {
      if (!light.enabled || light.intensity <= 0 || !light.entity.enabled) continue;
      if (light.type === 'directional') { illumination += light.intensity; continue; }
      const p = light.entity.getPosition(), cup = COFFEE_CUPS[0];
      const distance = Math.hypot(p.x - cup.x, p.y - cup.full, p.z - cup.z);
      if (distance < light.range) illumination += light.intensity / (1 + distance * distance) * (1 - distance / light.range);
    }
    const intensity = Math.min(0.8, illumination * 4) * this.steamLevel;
    for (const s of this.steam) s.entity.particlesystem.intensity = intensity;
  }

  puff() {
    const N = 64, canvas = document.createElement('canvas'); canvas.width = canvas.height = N;
    const ctx = canvas.getContext('2d'), image = ctx.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = (x + 0.5) / N * 2 - 1, v = (y + 0.5) / N * 2 - 1;
      const wisp = 0.72 + 0.28 * Math.sin(u * 8 + Math.sin(v * 5) * 2) * Math.cos(v * 7);
      const k = (y * N + x) * 4;
      image.data[k] = image.data[k + 1] = image.data[k + 2] = 255;
      image.data[k + 3] = Math.max(0, 1 - Math.hypot(u, v)) ** 2 * wisp * 255;
    }
    ctx.putImageData(image, 0, 0);
    const texture = new Texture(this.app.graphicsDevice, { width: N, height: N, format: PIXELFORMAT_SRGBA8, name: 'espresso-steam' });
    texture.setSource(canvas); return texture;
  }

  crema() {
    const N = 128, canvas = document.createElement('canvas'); canvas.width = canvas.height = N;
    const ctx = canvas.getContext('2d'), image = ctx.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = (x + 0.5) / N * 2 - 1, v = (y + 0.5) / N * 2 - 1;
      const radius = Math.hypot(u, v), angle = Math.atan2(v, u);
      const noise = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      const grain = noise - Math.floor(noise);
      const swirl = Math.sin(radius * 27 + Math.sin(angle * 3 + radius * 4));
      const value = Math.max(0.45, Math.min(1, 0.81 + swirl * 0.09 + grain * 0.12 - (grain < 0.035 ? 0.24 : 0)));
      const k = (y * N + x) * 4;
      image.data[k] = image.data[k + 1] = image.data[k + 2] = value * 255; image.data[k + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    const texture = new Texture(this.app.graphicsDevice, { width: N, height: N, format: PIXELFORMAT_SRGBA8, mipmaps: true, name: 'espresso-crema' });
    texture.setSource(canvas); return texture;
  }

  destroy() {
    this.lightHandle?.off(); this.root.destroy();
    this.coffeeMat.destroy(); this.surfaceMat.destroy(); this.puffTexture.destroy(); this.cremaTexture.destroy();
  }
}
