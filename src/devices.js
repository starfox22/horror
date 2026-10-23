// Things in the flat that do something when used (E): the two bedside reading lamps (each on its own), the MacBook
// (the lid opens and shuts on its hinge; the screen wakes and sleeps), the office computer (power on with the start-up
// chime, off), and the coffee machine (grinds, brews with steam rising from the cup, then beeps). Parts come from the
// asset pipeline with their own materials ('<name>.<tag>', tools/build-assets.mjs FIXTURES and SPLITS).
import {
  Color, Entity, Quat, Vec3, Texture, Curve, CurveSet, LIGHTFALLOFF_INVERSESQUARED, SHADOWUPDATE_THISFRAME, BLEND_NORMAL,
  PIXELFORMAT_RGBA8,
} from 'playcanvas';
import { refreshShadows } from './lighting.js';

const WARM = new Color(1.0, 0.78, 0.56);
const SCREEN = new Color(0.55, 0.68, 1.0);
// MacBook hinge: the lid's back bottom edge (measured from the source model), axis along that edge.
const LID_HINGE = new Vec3(-4.2284, 0.521, 2.3756);
const LID_AXIS = new Vec3(0.779, 0, 0.628).normalize();
const LID_SHUT = 89.4;                        // degrees about LID_AXIS from the modelled (open) pose to resting on the base
const COFFEE_SPOUT = new Vec3(-5.455, 0.97, -0.93);

const ease = (t) => t * t * (3 - 2 * t);

export class Devices {
  constructor(app, apartment, interactions, sounds, onLightChange) {
    this.app = app;
    this.sounds = sounds;
    this.onLightChange = onLightChange;
    this.materials = new Map();
    this.renders = apartment.findComponents('render');
    for (const r of this.renders) for (const mi of r.meshInstances) this.materials.set(mi.material.name, mi.material);
    this.tasks = [];
    this.lamps = ['left', 'right'].map(side => this.bedsideLamp(side, interactions)).filter(Boolean);
    this.laptop = this.makeLaptop(interactions);
    this.computer = this.makeComputer(interactions);
    this.coffee = this.makeCoffee(interactions);
    app.on('update', (dt) => this.update(dt));
  }

  // A small animation: fn(t in 0..1) over `seconds`, then done().
  run(seconds, fn, done) { this.tasks.push({ t: 0, seconds, fn, done }); }

  update(dt) {
    for (const k of this.tasks) { k.t = Math.min(1, k.t + dt / k.seconds); k.fn(k.t); }
    const finished = this.tasks.filter(k => k.t >= 1);
    if (finished.length) { this.tasks = this.tasks.filter(k => k.t < 1); finished.forEach(k => k.done?.()); }
    if (this.steam) this.updateSteam(dt);
  }

  // Screens: the picture is self-lit only (emissive); switched off, the panel is black glass that reflects the room.
  screen(mat) {
    if (!mat) return null;
    mat.diffuseMap = null; mat.diffuse = new Color(0.008, 0.008, 0.009);
    mat.useMetalness = true; mat.metalness = 0; mat.gloss = 0.88;
    mat.emissive = new Color(1, 1, 1);
    mat.update();
    return mat;
  }

  // --- bedside reading lamps --------------------------------------------------------------------------------------
  bedsideLamp(side, interactions) {
    const mat = this.materials.get(`Light.bedside-${side}`);
    const mi = this.renders.flatMap(r => r.meshInstances).find(m => m.material === mat);
    if (!mat || !mi) return null;
    const bulb = mi.aabb.center.clone();
    // The swing-arm lamp hangs over the pillow: a warm spot down onto the bed, and a faint spill around the shade.
    const spot = new Entity(`bedside lamp ${side}`);
    spot.addComponent('light', {
      type: 'spot', color: WARM, intensity: 1.7, range: 3.2, innerConeAngle: 26, outerConeAngle: 72, castShadows: true,
      falloffMode: LIGHTFALLOFF_INVERSESQUARED, shadowResolution: 512, shadowBias: 0.25, normalOffsetBias: 0.04,
      volumetricScattering: 0.5,
    });
    spot.setPosition(bulb.x - 0.04, bulb.y - 0.02, bulb.z);
    spot.lookAt(new Vec3(bulb.x - 0.55, 0.45, bulb.z + (side === 'left' ? 0.3 : -0.3)));
    spot.rotateLocal(90, 0, 0);
    spot.light.shadowUpdateMode = SHADOWUPDATE_THISFRAME;
    const spill = new Entity(`bedside spill ${side}`);
    spill.addComponent('light', { type: 'omni', color: WARM, intensity: 0.18, range: 1.6, castShadows: false, falloffMode: LIGHTFALLOFF_INVERSESQUARED });
    spill.setPosition(bulb.x - 0.08, bulb.y + 0.03, bulb.z);
    this.app.root.addChild(spot); this.app.root.addChild(spill);
    const lamp = { side, on: true, level: 1, mat, glow: mat.emissiveIntensity, lights: [spot, spill], base: [1.7, 0.18] };
    interactions.add({ pos: bulb, size: 0.14, label: () => `Turn the ${side} reading lamp ${lamp.on ? 'off' : 'on'}`,
      use: () => this.toggleLamp(lamp) });
    return lamp;
  }

  toggleLamp(lamp) {
    lamp.on = !lamp.on;
    this.sounds?.lampClick?.(lamp.lights[0].getPosition(), lamp.on);
    const from = lamp.level, to = lamp.on ? 1 : 0;
    // A warm filament-style ramp: quick to light, a short glow-down when switched off.
    this.run(lamp.on ? 0.14 : 0.09, (t) => this.applyLamp(lamp, from + (to - from) * t), () => this.onLightChange?.());
  }

  applyLamp(lamp, level) {
    lamp.level = level;
    const k = level * level;
    lamp.lights.forEach((l, i) => { l.light.intensity = lamp.base[i] * k; l.light.enabled = k > 0.001; });
    lamp.mat.emissiveIntensity = lamp.glow * k; lamp.mat.update();
  }

  // --- MacBook ----------------------------------------------------------------------------------------------------
  makeLaptop(interactions) {
    const parts = this.renders.filter(r => r.meshInstances.some(mi => mi.material.name.endsWith('.laptoplid')));
    if (!parts.length) return null;
    const pivot = new Entity('laptop hinge');
    pivot.setPosition(LID_HINGE);
    this.app.root.addChild(pivot);
    for (const r of parts) {
      const e = r.entity, wp = e.getPosition().clone(), wr = e.getRotation().clone();
      e.reparent(pivot); e.setPosition(wp); e.setRotation(wr);
    }
    const screen = this.screen([...this.materials.values()].find(m => m.name.startsWith('Screen_Shot') && m.name.endsWith('.laptoplid')));
    const keys = [this.materials.get('Keylight'), this.materials.get('Keylight.laptoplid')].filter(Boolean);
    const glow = this.app.root.findByName('laptop glow');
    const laptop = { open: true, angle: 0, busy: false, pivot, screen, keys, glow, glowBase: glow?.light.intensity ?? 0, pos: new Vec3(), q: new Quat() };
    laptop.setPower = (k) => {
      if (screen) { screen.emissiveIntensity = 0.55 * k; screen.update(); }
      for (const m of keys) { m.emissiveIntensity = 0.6 * k; m.update(); }
      if (glow) { glow.light.intensity = laptop.glowBase * k; glow.light.enabled = k > 0.01; }
    };
    laptop.setAngle = (a) => {
      laptop.angle = a;
      laptop.q.setFromAxisAngle(LID_AXIS, a);
      pivot.setRotation(laptop.q);
      // Prompt point: the middle of the lid.
      laptop.q.transformVector(new Vec3(0, 0.12, 0), laptop.pos);
      laptop.pos.add(LID_HINGE);
    };
    laptop.setAngle(0);
    laptop.setPower(1);
    interactions.add({ pos: laptop.pos, size: 0.16, label: () => `${laptop.open ? 'Close' : 'Open'} the laptop`,
      use: () => this.toggleLaptop(laptop), active: () => !laptop.busy });
    return laptop;
  }

  toggleLaptop(l) {
    l.busy = true;
    l.open = !l.open;
    const from = l.angle, to = l.open ? 0 : LID_SHUT;
    this.sounds?.laptop?.(LID_HINGE, l.open);
    if (!l.open) this.run(0.25, (t) => l.setPower(1 - t));       // the screen sleeps as the lid comes down
    // Shutting: gathers speed and lands (ease-in); opening: lifted and slowing to a stop (ease-out).
    this.run(l.open ? 0.75 : 0.6, (t) => {
      const e = l.open ? 1 - (1 - t) ** 3 : t * t;
      l.setAngle(from + (to - from) * e);
      refreshShadows(this.app, LID_HINGE, 1.5);
    }, () => {
      l.busy = false;
      if (!l.open) this.sounds?.laptopShut?.(LID_HINGE);
      else this.run(0.6, (t) => l.setPower(ease(t)));            // wakes once open
    });
  }

  // --- office computer (iMac and the desk's second screen) --------------------------------------------------------
  makeComputer(interactions) {
    const screens = [this.screen(this.materials.get('Screen.imac')), this.screen(this.materials.get('Screen'))].filter(Boolean);
    if (!screens.length) return null;
    const glow = this.app.root.findByName('iMac glow');
    const pc = { on: true, busy: false, screens, glow, glowBase: glow?.light.intensity ?? 0, level: 1 };
    pc.set = (k) => {
      pc.level = k;
      for (const m of screens) { m.emissiveIntensity = 0.5 * k; m.update(); }
      if (glow) { glow.light.intensity = pc.glowBase * k; glow.light.enabled = k > 0.01; }
    };
    pc.set(1);
    interactions.add({ pos: new Vec3(5.24, 1.10, -1.10), size: 0.22, label: () => `${pc.on ? 'Shut down' : 'Turn on'} the computer`,
      use: () => this.toggleComputer(pc), active: () => !pc.busy });
    return pc;
  }

  toggleComputer(pc) {
    pc.busy = true;
    pc.on = !pc.on;
    const at = new Vec3(5.24, 1.10, -1.10);
    if (pc.on) {
      // Power button, a moment of black, the chime, then the screen fades up (a grey boot screen first).
      this.sounds?.click?.(2600, 0.25, 0.1, at);
      setTimeout(() => this.sounds?.chime?.(at), 700);
      this.run(0.7, () => {}, () => this.run(0.35, (t) => pc.set(0.25 * t), () => this.run(1.6, () => {}, () =>
        this.run(0.9, (t) => pc.set(0.25 + 0.75 * ease(t)), () => { pc.busy = false; this.onLightChange?.(); }))));
    } else {
      this.sounds?.click?.(2200, 0.2, 0.08, at);
      this.run(1.2, () => {}, () => this.run(0.25, (t) => pc.set(1 - t), () => { pc.busy = false; this.onLightChange?.(); }));
    }
  }

  // --- coffee machine ---------------------------------------------------------------------------------------------
  makeCoffee(interactions) {
    const panel = this.materials.get('Coffee_Maker_Material5.coffee');
    if (panel) { panel.emissiveMap = panel.diffuseMap; panel.emissive = new Color(0.9, 0.95, 1); panel.emissiveIntensity = 0; panel.update(); }
    const led = new Entity('coffee machine light');
    led.addComponent('light', { type: 'omni', color: new Color(0.75, 0.85, 1), intensity: 0, range: 0.8, castShadows: false, falloffMode: LIGHTFALLOFF_INVERSESQUARED, enabled: false });
    led.setPosition(-5.455, 1.2, -0.80);
    this.app.root.addChild(led);
    const coffee = { busy: false, panel, led };
    coffee.glow = (k) => {
      if (panel) { panel.emissiveIntensity = 1.4 * k; panel.update(); }
      led.light.intensity = 0.05 * k; led.light.enabled = k > 0.01;
    };
    interactions.add({ pos: new Vec3(-5.455, 1.08, -0.86), size: 0.2, label: () => (coffee.busy ? 'Brewing…' : 'Make a coffee'),
      use: () => this.brew(coffee) });
    return coffee;
  }

  brew(c) {
    if (c.busy) return;
    c.busy = true;
    this.run(0.3, (t) => c.glow(t));
    const timing = this.sounds?.coffee?.(COFFEE_SPOUT) ?? { grind: 3.2, brew: 9 };
    // Steam starts with the hot water and lingers over the cup a while after the machine stops.
    setTimeout(() => this.startSteam(timing.brew + 14), (timing.grind + 0.8) * 1000);
    setTimeout(() => { c.busy = false; this.run(1.5, (t) => c.glow(1 - t)); }, (timing.grind + timing.brew + 1.5) * 1000);
  }

  // Steam: soft sprites rising from the cup, curling and fading (a particle system with a painted puff texture).
  startSteam(seconds) {
    if (!this.steam) {
      const e = new Entity('coffee steam');
      e.addComponent('particlesystem', {
        numParticles: 40, lifetime: 2.8, rate: 0.07, rate2: 0.11, emitterShape: 0, emitterExtents: new Vec3(0.02, 0, 0.02),
        startAngle: 0, startAngle2: 360, colorMap: this.puff(), blendType: BLEND_NORMAL, depthSoftening: 0.08, lighting: false,
        halfLambert: false, alignToMotion: false, stretch: 0, loop: true, preWarm: false, autoPlay: false, sort: 1,
        localVelocityGraph: new CurveSet([[0, 0, 1, 0], [0, 0.07, 1, 0.12], [0, 0, 1, 0]]),
        localVelocityGraph2: new CurveSet([[0, 0.012, 1, -0.02], [0, 0.1, 1, 0.16], [0, -0.012, 1, 0.02]]),
        scaleGraph: new Curve([0, 0.02, 1, 0.09]),
        alphaGraph: new Curve([0, 0, 0.15, 0.10, 0.6, 0.06, 1, 0]),
        colorGraph: new CurveSet([[0, 0.8], [0, 0.78], [0, 0.75]]),
        rotationSpeedGraph: new Curve([0, 20, 1, 5]),
      });
      e.setPosition(COFFEE_SPOUT.x, COFFEE_SPOUT.y - 0.04, COFFEE_SPOUT.z + 0.03);
      this.app.root.addChild(e);
      this.steam = { e, left: 0 };
    }
    this.steam.left = seconds;
    this.steam.e.particlesystem.reset();
    this.steam.e.particlesystem.play();
  }

  updateSteam(dt) {
    const s = this.steam;
    if (s.left <= 0) return;
    s.left -= dt;
    if (s.left <= 0) s.e.particlesystem.stop();
  }

  puff() {
    const N = 64, c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d'), img = g.createImageData(N, N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i + 0.5) / N * 2 - 1, y = (j + 0.5) / N * 2 - 1, r = Math.hypot(x, y);
      const wisp = 0.75 + 0.25 * Math.sin(x * 7 + Math.sin(y * 5) * 2) * Math.cos(y * 6);
      const a = Math.max(0, 1 - r) ** 2 * wisp;
      const k = (j * N + i) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = 255; img.data[k + 3] = a * 255;
    }
    g.putImageData(img, 0, 0);
    const tex = new Texture(this.app.graphicsDevice, { width: N, height: N, format: PIXELFORMAT_RGBA8, name: 'steam-puff' });
    tex.setSource(c);
    return tex;
  }
}
