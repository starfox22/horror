// Things in the flat that do something when used (E): lamps with their own switch (the two bedside reading lamps, the
// arc lamp by the sofa, the office desk lamp; lighting.js places the last two at their bulbs), the MacBook
// (the lid opens and shuts on its hinge; the screen wakes and sleeps), the office computer (power on with the start-up
// chime, off), and the coffee machine (grinds, brews with steam rising from the cup, then beeps). Parts come from the
// asset pipeline with their own materials ('<name>.<tag>', tools/build-assets.mjs FIXTURES and SPLITS).
import {
  Color, Entity, Quat, Vec3, StandardMaterial, LIGHTFALLOFF_INVERSESQUARED, SHADOWUPDATE_THISFRAME,
} from 'playcanvas';
import { refreshShadows } from './lighting.js';
import { CoffeeCycle, COFFEE_POSITION } from './coffee-cycle.js';
import { CoffeeEffects } from './coffee-effects.js';
import { ARC_LAMP } from './lamp-profiles.js';

const WARM = new Color(1.0, 0.78, 0.56);
const SCREEN = new Color(0.55, 0.68, 1.0);
// MacBook hinge: the lid's back bottom edge (measured from the source model), axis along that edge.
const LID_HINGE = new Vec3(-4.2284, 0.521, 2.3756);
const LID_AXIS = new Vec3(0.779, 0, 0.628).normalize();
const LID_SHUT = 89.4;                        // degrees about LID_AXIS from the modelled (open) pose to resting on the base

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
    this.lamps = [
      ...['left', 'right'].map(side => this.bedsideLamp(side, interactions)),
      // Arc lamp: its bulb hides in the dome shade over the sofa (no glow mesh in the model, so a small bulb is added).
      this.ownLamp(interactions, { name: 'arc lamp', group: 'Living room', label: 'the arc lamp',
        bulb: ARC_LAMP.position, bulbDiameter: ARC_LAMP.bulbDiameter, at: [-4.88, 1.39, 2.70], size: 0.3 }),
      this.ownLamp(interactions, { name: 'desk lamp', group: 'Office', label: 'the desk lamp', glow: 'Light.office', at: [4.105, 1.36, -0.93], size: 0.16, on: false }),
      this.ownLamp(interactions, { name: 'closet light', group: 'Bedroom', label: 'the closet light', at: [9.62, 1.08, 1.75], size: 0.14, on: false }),
    ].filter(Boolean);
    this.laptop = this.makeLaptop(interactions);
    this.computer = this.makeComputer(interactions);
    this.coffee = this.makeCoffee(interactions);
    app.on('update', (dt) => this.update(dt));
    app.on('destroy', () => { this.coffee?.playback?.stop?.(); this.coffee?.cycle.stop(); this.coffee?.effects?.destroy(); });
  }

  // A small animation: fn(t in 0..1) over `seconds`, then done().
  run(seconds, fn, done, owner = null) {
    // A rapid toggle replaces that object's fade, rather than leaving two animations
    // writing different brightness values in the same frame.
    if (owner) this.tasks = this.tasks.filter(task => task.owner !== owner);
    this.tasks.push({ t: 0, seconds, fn, done, owner });
  }

  update(dt) {
    for (const k of this.tasks) { k.t = Math.min(1, k.t + dt / k.seconds); k.fn(k.t); }
    const finished = this.tasks.filter(k => k.t >= 1);
    if (finished.length) { this.tasks = this.tasks.filter(k => k.t < 1); finished.forEach(k => k.done?.()); }
    this.updateCoffee(dt);
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
      // A dome shade's beam: ~55 deg (a 72 deg cone reached across the room into the shoe closet by the wardrobe).
      type: 'spot', color: WARM, intensity: 1.25, range: 4.5, innerConeAngle: 24, outerConeAngle: 55, castShadows: true,
      falloffMode: LIGHTFALLOFF_INVERSESQUARED, shadowResolution: 512, shadowBias: 0.25, normalOffsetBias: 0.04,
      volumetricScattering: 0.5,
    });
    spot.setPosition(bulb.x - 0.04, bulb.y - 0.02, bulb.z);
    spot.lookAt(new Vec3(bulb.x - 0.55, 0.45, bulb.z + (side === 'left' ? 0.3 : -0.3)));
    spot.rotateLocal(90, 0, 0);
    spot.light.shadowUpdateMode = SHADOWUPDATE_THISFRAME;
    const spill = new Entity(`bedside spill ${side}`);
    // Shadowed: unshadowed, it lit the corridor and the wardrobe through their walls.
    spill.addComponent('light', { type: 'omni', color: WARM, intensity: 0.15, range: 2.4, castShadows: true, falloffMode: LIGHTFALLOFF_INVERSESQUARED,
      shadowBias: 0.2, normalOffsetBias: 0.03 });
    spill.light.shadowUpdateMode = SHADOWUPDATE_THISFRAME;
    spill.setPosition(bulb.x - 0.08, bulb.y + 0.03, bulb.z);
    this.app.root.addChild(spot); this.app.root.addChild(spill);
    const lamp = { side, name: `Reading lamp (${side})`, group: 'Bedroom', on: true, level: 1, mat, glow: mat.emissiveIntensity, lights: [spot, spill], base: [1.25, 0.15] };
    interactions.add({ pos: bulb, size: 0.14, label: () => `Turn the ${side} reading lamp ${lamp.on ? 'off' : 'on'}`,
      use: () => this.toggleLamp(lamp) });
    return lamp;
  }

  // A lamp already placed by lighting.js (`name`), switched here: its glowing bulb is the model's own mesh (`glow`
  // material) or a small sphere at `bulb`; E at `at`.
  ownLamp(interactions, { name, group, label, glow, bulb, bulbDiameter = 0.05, at, size, on = true }) {
    const light = this.app.root.findByName(name);
    if (!light) return null;
    let mat = glow ? this.materials.get(glow) : null;
    if (bulb) {
      mat = new StandardMaterial();
      mat.diffuse = Color.BLACK; mat.emissive = new Color(1, 0.82, 0.62); mat.emissiveIntensity = 6; mat.update();
      const b = new Entity(`${name} bulb`);
      b.addComponent('render', { type: 'sphere', material: mat, castShadows: false });
      b.setLocalScale(bulbDiameter, bulbDiameter, bulbDiameter); b.setPosition(...bulb);
      this.app.root.addChild(b);
    }
    const lamp = { name: name.charAt(0).toUpperCase() + name.slice(1), group, on, level: on ? 1 : 0, mat, glow: mat?.emissiveIntensity ?? 0,
      lights: [light], base: [light.light.intensity] };
    this.applyLamp(lamp, lamp.level);
    interactions.add({ pos: new Vec3(...at), size, label: () => `Turn ${label} ${lamp.on ? 'off' : 'on'}`, use: () => this.toggleLamp(lamp) });
    return lamp;
  }

  toggleLamp(lamp) {
    const forced = this.override?.(lamp.lights);       // forced by the developer menu: hand it back (switches.js toggle)
    lamp.on = forced === true || forced === false ? !forced : !lamp.on;
    this.sounds?.lampClick?.(lamp.lights[0].getPosition(), lamp.on);
    const from = forced === true ? 1 : forced === false ? 0 : lamp.level, to = lamp.on ? 1 : 0;
    // A warm filament-style ramp: quick to light, a short glow-down when switched off.
    this.run(lamp.on ? 0.14 : 0.09, (t) => this.applyLamp(lamp, from + (to - from) * t), () => this.onLightChange?.(), lamp);
  }

  applyLamp(lamp, level) {
    lamp.level = level;
    const k = level * level;
    lamp.lights.forEach((l, i) => { l.light.intensity = lamp.base[i] * k; l.light.enabled = k > 0.001; });
    if (lamp.mat) { lamp.mat.emissiveIntensity = lamp.glow * k; lamp.mat.update(); }
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
    laptop.glows = [...(screen ? [{ mat: screen, base: 0.55 }] : []), ...keys.map(mat => ({ mat, base: 0.6 }))];
    laptop.setPower = (k) => {
      laptop.power = k;
      for (const { mat, base } of laptop.glows) { mat.emissiveIntensity = base * k; mat.update(); }
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
    laptop.setPower(1); // the open lid starts awake (screen and keyboard lit) until the player shuts it
    interactions.add({ pos: laptop.pos, size: 0.16, label: () => `${laptop.open ? 'Close' : 'Open'} the laptop`,
      use: () => this.toggleLaptop(laptop), active: () => !laptop.busy });
    return laptop;
  }

  toggleLaptop(l) {
    if (l.busy) return;
    if (l.glow) this.override?.([l.glow]);          // hand its glow back from the developer menu
    l.busy = true;
    l.open = !l.open;
    const from = l.angle, to = l.open ? 0 : LID_SHUT;
    this.sounds?.laptop?.(LID_HINGE, l.open);
    if (!l.open) {
      const power = l.power;
      this.run(0.25, (t) => l.setPower(power * (1 - t)), () => this.onLightChange?.(), l);
    }
    // Shutting: gathers speed and lands (ease-in); opening: lifted and slowing to a stop (ease-out).
    this.run(l.open ? 0.75 : 0.6, (t) => {
      const e = l.open ? 1 - (1 - t) ** 3 : t * t;
      l.setAngle(from + (to - from) * e);
      refreshShadows(this.app, LID_HINGE, 0.4);
    }, () => {
      l.busy = false;
      if (!l.open) this.sounds?.laptopShut?.(LID_HINGE);
      else this.run(0.6, (t) => l.setPower(ease(t)), () => this.onLightChange?.(), l); // wakes once open
    });
  }

  // --- office computer (iMac and the desk's second screen) --------------------------------------------------------
  makeComputer(interactions) {
    const screens = [this.screen(this.materials.get('Screen.imac')), this.screen(this.materials.get('Screen'))].filter(Boolean);
    if (!screens.length) return null;
    const glow = this.app.root.findByName('iMac glow');
    const pc = { on: true, busy: false, screens, glow, glowBase: glow?.light.intensity ?? 0, level: 1 };
    pc.glows = screens.map(mat => ({ mat, base: 0.5 }));
    pc.set = (k) => {
      pc.level = k;
      for (const { mat, base } of pc.glows) { mat.emissiveIntensity = base * k; mat.update(); }
      if (glow) { glow.light.intensity = pc.glowBase * k; glow.light.enabled = k > 0.01; }
    };
    pc.set(1);    // left on: the screens light the office until the player shuts the computer down
    interactions.add({ pos: new Vec3(5.24, 1.10, -1.10), size: 0.22, label: () => `${pc.on ? 'Shut down' : 'Turn on'} the computer`,
      use: () => this.toggleComputer(pc), active: () => !pc.busy });
    return pc;
  }

  toggleComputer(pc) {
    if (pc.busy) return;
    if (pc.glow) this.override?.([pc.glow]);
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
    const coffee = { busy: false, panel, led, level: 0, phase: 'Idle', cycle: new CoffeeCycle(),
      glows: panel ? [{ mat: panel, base: 1.4 }] : [] };
    coffee.glow = (k) => {
      coffee.level = k;
      for (const { mat, base } of coffee.glows) {
        if (mat.emissiveIntensity !== base * k) { mat.emissiveIntensity = base * k; mat.update(); }
      }
      led.light.intensity = 0.05 * k; led.light.enabled = k > 0.01;
    };
    interactions.add({ pos: new Vec3(COFFEE_POSITION.x, COFFEE_POSITION.y, COFFEE_POSITION.z), size: 0.2,
      label: () => coffee.busy ? `${coffee.phase}…` : coffee.cycle.state ? 'Coffee ready · brew fresh cups' : 'Make a coffee',
      use: () => this.brew(coffee) });
    return coffee;
  }

  createCoffeeEffects() {
    const effects = new CoffeeEffects(this.app);
    this.configureCoffeeMaterial?.(effects.coffeeMat);
    this.configureCoffeeMaterial?.(effects.surfaceMat);
    return effects;
  }

  brew(c) {
    if (c.busy) return false;
    this.override?.([c.led]);
    c.playback?.stop?.();
    c.effects ||= this.createCoffeeEffects();
    c.effects.reset();
    c.playback = this.sounds?.coffee?.(COFFEE_POSITION) || null;
    c.cycle.start(c.playback?.elapsed);
    c.busy = true; c.phase = 'Heating'; c.lightCaptured = false;
    c.glow(0);
    c.effects.update(c.cycle.state);
    return true;
  }

  updateCoffee(dt) {
    const c = this.coffee;
    if (!c?.cycle.active) return;
    const wasBusy = c.busy, state = c.cycle.update(dt);
    c.busy = state.busy; c.phase = state.phase;
    c.glow(state.glow); c.effects?.update(state);
    if (!c.lightCaptured && state.elapsed >= 0.35) {
      c.lightCaptured = true; this.onLightChange?.();
    }
    if (wasBusy && !c.busy) this.onLightChange?.();
  }
}
