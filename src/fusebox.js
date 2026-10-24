// The fuse box (docs/STORY.md, Act II): a wall-mounted consumer unit at the corridor's west end. Its hinged cover opens
// with E; inside, on a DIN rail: the MAIN isolator, the RCD (with its TEST button) and seven breakers, each with its
// printed label, levers up for on. A handwritten label is taped inside the cover (his handwriting, from when he lived
// here). The logic is power.js: the RCD stays up only while no wet circuit is switched on.
// While the cover is open, looking near a lever focuses it (the interaction list snaps to the nearest lever) and the
// prompt names it with its state.
import { Color, Entity, StandardMaterial, Texture, Vec3, PIXELFORMAT_RGBA8, BLEND_NORMAL } from 'playcanvas';
import { CIRCUITS } from './power.js';

// Mounted on the corridor's south wall by the mouth into the open-plan room; the unit's back against the wall.
export const FUSEBOX_AT = { x: 2.35, y: 1.62, z: 4.405 };
const W = 0.46, H = 0.30, D = 0.095;
const _coverCentre = new Vec3(W * 0.75, 0, 0.02);
const MODULE = 0.0178 * 1.0;           // one DIN module, 17.8 mm
const LABEL = `RCD trips (whole flat off):

1. ALL breakers OFF (down)
2. RCD back UP
3. Breakers ON one at a time.
   The one that trips it again → leave it OFF.

(Bathroom does it when wet.)

— D.`;

export class Fusebox {
  constructor({ app, interactions, power, bank, story, hud, configureMaterial }) {
    Object.assign(this, { app, power, bank, story, hud });
    this.open = false; this.angle = 0;
    this.root = new Entity('fuse box');
    app.root.addChild(this.root);
    this.root.setPosition(FUSEBOX_AT.x, FUSEBOX_AT.y, FUSEBOX_AT.z);
    this.root.setEulerAngles(0, 180, 0);          // its front faces -z, into the corridor
    const mat = (name, c, gloss, metal = 0) => { const m = new StandardMaterial(); m.name = name; m.diffuse = new Color(...c); m.useMetalness = true; m.metalness = metal; m.gloss = gloss; m.update(); configureMaterial?.(m); return m; };
    this.mats = {
      shell: mat('fuse box shell', [0.83, 0.83, 0.81], 0.55), inner: mat('fuse box inner', [0.62, 0.62, 0.6], 0.35),
      breaker: mat('breaker body', [0.88, 0.88, 0.86], 0.6), lever: mat('breaker lever', [0.06, 0.06, 0.065], 0.55),
      main: mat('main lever', [0.62, 0.05, 0.04], 0.55), rcd: mat('rcd lever', [0.08, 0.2, 0.55], 0.55), test: mat('rcd test', [0.85, 0.7, 0.1], 0.5),
      rail: mat('din rail', [0.55, 0.56, 0.58], 0.7, 0.9),
    };
    const box = (parent, name, size, at, m) => {
      const e = new Entity(name); e.addComponent('render', { type: 'box', material: m, castShadows: true, receiveShadows: true });
      e.setLocalScale(...size); e.setLocalPosition(...at); parent.addChild(e); return e;
    };
    // Shell: back plate, four sides; the opening at the front (local -z after the turn is +z here: front at z = +D/2).
    box(this.root, 'fuse box back', [W, H, 0.01], [0, 0, -D / 2 + 0.005], this.mats.inner);
    box(this.root, 'fuse box top', [W, 0.012, D], [0, H / 2 - 0.006, 0], this.mats.shell);
    box(this.root, 'fuse box bottom', [W, 0.012, D], [0, -H / 2 + 0.006, 0], this.mats.shell);
    box(this.root, 'fuse box left', [0.012, H, D], [-W / 2 + 0.006, 0, 0], this.mats.shell);
    box(this.root, 'fuse box right', [0.012, H, D], [W / 2 - 0.006, 0, 0], this.mats.shell);
    box(this.root, 'din rail', [W - 0.04, 0.035, 0.008], [0, 0.0, -D / 2 + 0.014], this.mats.rail);
    // The modules: MAIN (2 wide), RCD (2 wide), then the breakers.
    const units = [{ id: 'main', label: 'MAIN', width: 2 }, { id: 'rcd', label: 'RCD 30mA', width: 2 }, ...CIRCUITS.map(c => ({ id: c.id, label: c.label, width: 1 }))];
    const total = units.reduce((n, u) => n + u.width, 0) * MODULE * 1.35, left = -total / 2;
    let x = left;
    this.switches = [];
    for (const u of units) {
      const w = u.width * MODULE * 1.35 - 0.002, cx = x + w / 2;
      const body = box(this.root, `breaker ${u.id}`, [w, 0.085, 0.06], [cx, 0, -D / 2 + 0.045], this.mats.breaker);
      const pivot = new Entity(`lever pivot ${u.id}`); pivot.setLocalPosition(cx, 0.004, -D / 2 + 0.076); this.root.addChild(pivot);
      const lever = box(pivot, `lever ${u.id}`, [Math.min(w * 0.7, 0.03), 0.026, 0.012], [0, 0.012, 0.004], u.id === 'main' ? this.mats.main : u.id === 'rcd' ? this.mats.rcd : this.mats.lever);
      if (u.id === 'rcd') box(this.root, 'rcd test', [0.009, 0.009, 0.006], [cx + w * 0.28, -0.03, -D / 2 + 0.077], this.mats.test);
      const sw = { ...u, pivot, lever, x: cx };
      sw.world = new Vec3();
      this.root.getWorldTransform().transformPoint(new Vec3(cx, 0.006, -D / 2 + 0.085), sw.world);
      this.switches.push(sw);
      x += u.width * MODULE * 1.35;
    }
    this.labels(units, left);
    this.buildCover();
    this.syncLevers();
    // E: the cover, then each lever while it is open.
    // The cover's own handle point follows the cover (open, it has swung out to the left, clear of the levers).
    this.coverPos = new Vec3();
    this.update(0);
    interactions.add({ pos: this.coverPos, size: 0.16, label: () => `${this.open ? 'Close' : 'Open'} the fuse box`, use: () => this.toggleCover() });
    for (const sw of this.switches) {
      interactions.add({ pos: sw.world, size: 0.022, active: () => this.open && this.angle > 0.8,
        label: () => this.describe(sw), use: () => this.flip(sw) });
    }
    const labelAt = new Vec3(); this.cover.getWorldTransform().transformPoint(new Vec3(0, 0, 0.01), labelAt);
    this.labelItem = interactions.add({ pos: labelAt, size: 0.12, active: () => this.open && this.angle > 0.8, label: () => 'Read the label',
      use: () => this.hud?.examine({ className: 'label', html: LABEL.replace(/\n/g, '<br>') }) });
    power.onChange(() => this.syncLevers());
    app.on('update', dt => this.update(dt));
  }

  // Printed strip under the breakers: names (white on the rail cover). One small canvas texture.
  labels(units, left) {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 64;
    const g = c.getContext('2d'); g.fillStyle = '#f1f0ea'; g.fillRect(0, 0, 1024, 64); g.fillStyle = '#1a1a1a';
    g.font = '700 22px "Helvetica Neue", Arial, sans-serif'; g.textAlign = 'center';
    const total = units.reduce((n, u) => n + u.width, 0);
    let at = 0;
    for (const u of units) { g.fillText(u.label.replace('SOCKETS ', 'SKT '), (at + u.width / 2) / total * 1024, 40); at += u.width; }
    const tex = new Texture(this.app.graphicsDevice, { width: 1024, height: 64, format: PIXELFORMAT_RGBA8, mipmaps: true, name: 'fuse-labels' }); tex.setSource(c);
    const m = new StandardMaterial(); m.diffuseMap = tex; m.gloss = 0.3; m.update();
    const e = new Entity('breaker labels'); e.addComponent('render', { type: 'plane', material: m, castShadows: false });
    e.setLocalEulerAngles(90, 0, 0); e.setLocalScale(units.reduce((n, u) => n + u.width, 0) * MODULE * 1.35, 1, 0.022);
    e.setLocalPosition(0, -0.062, -D / 2 + 0.072);
    this.root.addChild(e);
  }

  // The cover: a hinged translucent-white lid on the left edge, the handwritten label taped inside it.
  buildCover() {
    this.hinge = new Entity('fuse box cover hinge'); this.hinge.setLocalPosition(-W / 2, 0, D / 2); this.root.addChild(this.hinge);
    const m = new StandardMaterial(); m.diffuse = new Color(0.86, 0.86, 0.84); m.gloss = 0.62; m.useMetalness = true; m.metalness = 0; m.update();
    this.cover = new Entity('fuse box cover'); this.cover.addComponent('render', { type: 'box', material: m, castShadows: true, receiveShadows: true });
    this.cover.setLocalScale(W, H, 0.008); this.cover.setLocalPosition(W / 2, 0, 0.004); this.hinge.addChild(this.cover);
    // The label inside the cover (so it faces the player when the cover is open).
    const c = document.createElement('canvas'); c.width = 512; c.height = 384;
    const g = c.getContext('2d'); g.fillStyle = '#f2ecdc'; g.fillRect(0, 0, 512, 384); g.fillStyle = '#2b2620';
    g.font = '30px Caveat, "Comic Sans MS", cursive';
    LABEL.split('\n').forEach((line, i) => g.fillText(line, 22, 40 + i * 30));
    const tex = new Texture(this.app.graphicsDevice, { width: 512, height: 384, format: PIXELFORMAT_RGBA8, mipmaps: true, name: 'fuse-label' }); tex.setSource(c);
    this.labelCanvas = c; this.labelTex = tex;
    const lm = new StandardMaterial(); lm.diffuseMap = tex; lm.gloss = 0.2; lm.update();
    const label = new Entity('fuse box label'); label.addComponent('render', { type: 'plane', material: lm, castShadows: false });
    label.setLocalEulerAngles(-90, 0, 0); label.setLocalScale(0.2, 1, 0.15); label.setLocalPosition(W / 2, 0, -0.0045);
    this.hinge.addChild(label);
    // Redraw once the handwriting font has loaded.
    document.fonts?.load('30px Caveat').then(() => { g.fillStyle = '#f2ecdc'; g.fillRect(0, 0, 512, 384); g.fillStyle = '#2b2620'; g.font = '30px Caveat, cursive'; LABEL.split('\n').forEach((line, i) => g.fillText(line, 22, 40 + i * 30)); tex.setSource(c); }).catch(() => {});
  }

  describe(sw) {
    if (sw.id === 'main') return `MAIN · ${this.power.main ? 'on' : this.power.mainBroken ? 'snapped off' : 'off'}`;
    if (sw.id === 'rcd') return `RCD · ${this.power.rcd ? 'on' : 'tripped'}`;
    return `${sw.label} · ${this.power.breakers[sw.id] ? 'on' : 'off'}`;
  }

  toggleCover() {
    this.open = !this.open;
    this.bank?.play('latch_2', { at: [FUSEBOX_AT.x, FUSEBOX_AT.y, FUSEBOX_AT.z], gain: 0.5, rate: 0.9 });
    if (this.open && !this.story?.sys.flashlight?.on && this.story?.has('power-cut') && !this.story?.has('restored')) this.story?.say('I can’t see a thing.');
    if (this.open) this.story?.fuseboxOpened();
  }

  flip(sw) {
    const at = [FUSEBOX_AT.x, FUSEBOX_AT.y, FUSEBOX_AT.z], p = this.power;
    let result;
    if (sw.id === 'main') {
      if (p.mainBroken) { this.bank?.play('breaker_3', { at, gain: 0.6, rate: 0.7 }); this.story?.say('He broke it.'); return; }
      p.setMain(!p.main, [FUSEBOX_AT.x, FUSEBOX_AT.z]);
      this.bank?.play('breaker_big', { segment: p.main ? 0 : 1, at, gain: 0.8 });
    } else if (sw.id === 'rcd') {
      result = p.setRcd(!p.rcd, [FUSEBOX_AT.x, FUSEBOX_AT.z]);
      this.bank?.play('rcd_trip', { at, gain: 0.75, rate: result === 'down' ? 1.1 : 1 });
      if (result === 'tripped') this.bang();
    } else {
      result = p.setBreaker(sw.id, !p.breakers[sw.id], [FUSEBOX_AT.x, FUSEBOX_AT.z]);
      this.bank?.play(['breaker_1', 'breaker_2', 'breaker_3'][Math.floor(Math.random() * 3)], { at, gain: 0.7 });
      if (result === 'tripped') this.bang();
    }
    this.syncLevers();
  }

  // A wet circuit trips the RCD the instant it is on: a snap, a hiss in the walls, and the flat dark again.
  bang() {
    const at = [FUSEBOX_AT.x, FUSEBOX_AT.y, FUSEBOX_AT.z];
    this.bank?.play('arc_zap', { at, gain: 0.9, delay: 0.05 });
    this.bank?.play('rcd_trip', { at, gain: 1, delay: 0.09 });
    this.story?.sys.music?.sting('low');
    this.tries = (this.tries || 0) + 1;
  }

  syncLevers() {
    const p = this.power;
    for (const sw of this.switches) {
      const on = sw.id === 'main' ? p.main : sw.id === 'rcd' ? p.rcd : p.breakers[sw.id];
      sw.target = on ? 1 : 0;
    }
  }

  update(dt) {
    const k = 1 - Math.exp(-Math.min(dt, 0.05) * 12);
    this.angle += ((this.open ? 1 : 0) - this.angle) * k;
    this.hinge.setLocalEulerAngles(0, -112 * this.angle, 0);
    this.hinge.getWorldTransform().transformPoint(_coverCentre, this.coverPos);
    for (const sw of this.switches) {
      sw.k = (sw.k ?? sw.target) + ((sw.target ?? 0) - (sw.k ?? 0)) * Math.min(1, dt * 30);
      sw.pivot.setLocalEulerAngles(-40 + 80 * (1 - sw.k), 0, 0);
    }
  }

  save() { return { open: this.open }; }
}
