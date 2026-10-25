// The fuse box (docs/STORY.md, Act II): a wall-mounted consumer unit at the corridor's west end (Poly Haven's "Power
// Box 01", CC0: tools/props). Its hinged cover opens with E; inside, its own levers move: the top row is the flat's
// seven circuits and a spare (printed label strip under them), the second row spares, the bottom row the RCD and the
// red MAIN switch. A handwritten label is taped inside the cover. The logic is power.js: the RCD stays up only while no
// wet circuit is switched on. Each time it snaps down again story.js may think a hint (fuseTripped).
// While the cover is open, looking near a lever focuses it and the prompt names it with its state.
import { Entity, StandardMaterial, Texture, Vec3, PIXELFORMAT_RGBA8 } from 'playcanvas';
import { CIRCUITS } from './power.js';

// The unit's back on the corridor's south wall (face z 4.337) by the mouth into the open-plan room; its centre at y.
export const FUSEBOX_AT = { x: 2.35, y: 1.62, z: 4.335 };
const LEVER_OFF = 38;                  // degrees a lever turns from on (up) to off (down)
const COVER_OPEN = 111;                // degrees the cover swings out (as the model was posed)
const LABEL = `RCD trips (whole flat off):

1. ALL breakers OFF (down)
2. RCD back UP
3. Breakers ON one at a time.
   The one that trips it again → leave it OFF.

(Bathroom does it when wet.)`;

export class Fusebox {
  constructor({ app, interactions, power, bank, story, hud, props, configureMaterial }) {
    Object.assign(this, { app, power, bank, story, hud });
    this.open = false; this.angle = 0;
    this.root = props.make('fusebox', { at: [FUSEBOX_AT.x, FUSEBOX_AT.y, FUSEBOX_AT.z], euler: [0, 180, 0], name: 'fuse box', configure: configureMaterial });
    this.hinge = this.root.findByName('cover');
    // The shell's back plate lies a few millimetres off the wall, edge-on to the ceiling lights: their shadow maps put
    // stripes (acne) on it. Its rim, levers and cover still receive shadows.
    for (const r of this.root.findByName('box')?.findComponents('render') || []) for (const mi of r.meshInstances) mi.receiveShadow = false;
    const part = (name) => this.root.findByName(name);
    // The levers: row a = the circuits then a spare; row b = spares; the RCD; MAIN.
    const units = [
      { id: 'main', label: 'MAIN', node: part('toggle-main') },
      { id: 'rcd', label: 'RCD 30mA', node: part('toggle-rcd') },
      ...CIRCUITS.map((c, i) => ({ id: c.id, label: c.label, node: part(`toggle-a${i + 1}`) })),
      { id: 'spare-a8', label: 'SPARE', spare: true, node: part('toggle-a8') },
      ...[1, 2, 3, 4, 5, 6, 7, 8].map(i => ({ id: `spare-b${i}`, label: 'SPARE', spare: true, node: part(`toggle-b${i}`) })),
    ];
    this.switches = units.filter(u => u.node).map(u => ({ ...u, on: true, world: u.node.getPosition().clone().add(this.forward(0.012)) }));
    this.labels();
    this.buildLabel();
    this.syncLevers();
    // E: the cover, then each lever while it is open. The cover's handle point follows the cover.
    this.coverPos = new Vec3();
    this.update(0);
    interactions.add({ pos: this.coverPos, size: 0.16, label: () => `${this.open ? 'Close' : 'Open'} the fuse box`, use: () => this.toggleCover() });
    for (const sw of this.switches) {
      interactions.add({ pos: sw.world, size: 0.013, active: () => this.open && this.angle > 0.8,
        label: () => this.describe(sw), use: () => this.flip(sw) });
    }
    this.labelPos = new Vec3();
    this.labelItem = interactions.add({ pos: this.labelPos, size: 0.11, active: () => this.open && this.angle > 0.8, label: () => 'Read the label',
      use: () => this.hud?.examine({ className: 'label', html: LABEL.replace(/\n/g, '<br>') }) });
    power.onChange(() => this.syncLevers());
    app.on('update', dt => this.update(dt));
  }

  // A world offset `d` metres out of the wall (the unit's front).
  forward(d) { return new Vec3(0, 0, -d); }

  // Printed strips on the rail covers: names under the top row, SPARE under the second, RCD and MAIN under the third.
  labels() {
    const strip = (name, texts, centre, width, y) => {
      const c = document.createElement('canvas'); c.width = 1024; c.height = 64;
      const g = c.getContext('2d'); g.fillStyle = '#f3f2ec'; g.fillRect(0, 0, 1024, 64); g.fillStyle = '#161616';
      g.font = '700 30px "Helvetica Neue", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      texts.forEach(([text, at]) => {
        const words = text.split(' '), w = 1024 / texts.length;
        if (words.length > 1 && g.measureText(text).width > w * 0.92) { g.font = '700 22px "Helvetica Neue", Arial, sans-serif'; g.fillText(words.slice(0, -1).join(' '), at * 1024, 20); g.fillText(words.at(-1), at * 1024, 46); g.font = '700 30px "Helvetica Neue", Arial, sans-serif'; }
        else g.fillText(text, at * 1024, 34);
      });
      const tex = new Texture(this.app.graphicsDevice, { width: 1024, height: 64, format: PIXELFORMAT_RGBA8, mipmaps: true, name });
      tex.setSource(c);
      const m = new StandardMaterial(); m.diffuseMap = tex; m.gloss = 0.3; m.update();
      const e = new Entity(name); e.addComponent('render', { type: 'plane', material: m, castShadows: false });
      e.setLocalEulerAngles(90, 0, 0); e.setLocalScale(width, 1, 0.011); e.setLocalPosition(centre, y, 0.0545);
      this.root.addChild(e);
    };
    const row = (prefix) => this.switches.filter(s => s.node.name.startsWith(prefix)).sort((a, b) => a.node.getLocalPosition().x - b.node.getLocalPosition().x);
    for (const [prefix, y, name] of [['toggle-a', 0.0815, 'fuse labels a'], ['toggle-b', -0.0355, 'fuse labels b']]) {
      const r = row(prefix); if (!r.length) continue;
      const x0 = r[0].node.getLocalPosition().x - 0.0112, x1 = r.at(-1).node.getLocalPosition().x + 0.0112;
      strip(name, r.map((s, i) => [s.label.replace('SOCKETS ', 'SKT '), (i + 0.5) / r.length]), (x0 + x1) / 2, x1 - x0, y);
    }
    const rcd = this.switches.find(s => s.id === 'rcd'), main = this.switches.find(s => s.id === 'main');
    if (rcd && main) strip('fuse labels c', [['RCD 30mA', 0.25], ['MAIN SWITCH', 0.75]], (-0.089 + 0.0875) / 2, 0.1765, -0.1525);
  }

  // The handwritten label taped inside the cover (it faces you when the cover is open). Caveat once the font loads.
  buildLabel() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 384;
    const g = c.getContext('2d');
    const draw = (font) => { g.fillStyle = '#f2ecdc'; g.fillRect(0, 0, 512, 384); g.fillStyle = '#2b2620'; g.font = font; LABEL.split('\n').forEach((line, i) => g.fillText(line, 22, 40 + i * 30)); };
    draw('30px Caveat, "Comic Sans MS", cursive');
    const tex = new Texture(this.app.graphicsDevice, { width: 512, height: 384, format: PIXELFORMAT_RGBA8, mipmaps: true, name: 'fuse-label' }); tex.setSource(c);
    const m = new StandardMaterial(); m.diffuseMap = tex; m.gloss = 0.2; m.update();
    this.label = new Entity('fuse box label'); this.label.addComponent('render', { type: 'plane', material: m, castShadows: false });
    // On the cover's inner face (the hinge node's -z side), upright and readable from inside.
    this.label.setLocalEulerAngles(-90, 0, 180); this.label.setLocalScale(0.2, 1, 0.15); this.label.setLocalPosition(0.17, 0.06, -0.0012);
    this.hinge.addChild(this.label);
    document.fonts?.load('30px Caveat').then(() => { draw('30px Caveat, cursive'); tex.setSource(c); }).catch(() => {});
  }

  describe(sw) {
    if (sw.id === 'main') return `MAIN · ${this.power.main ? 'on' : this.power.mainBroken ? 'snapped off' : 'off'}`;
    if (sw.id === 'rcd') return `RCD · ${this.power.rcd ? 'on' : 'tripped'}`;
    if (sw.spare) return `Spare · ${sw.on ? 'on' : 'off'}`;
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
    if (sw.spare) {
      sw.on = !sw.on;
      this.bank?.play(['breaker_1', 'breaker_2', 'breaker_3'][Math.floor(Math.random() * 3)], { at, gain: 0.7 });
    } else if (sw.id === 'main') {
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
    this.story?.fuseTripped?.(this.tries);
  }

  syncLevers() {
    const p = this.power;
    for (const sw of this.switches) sw.target = (sw.spare ? sw.on : sw.id === 'main' ? p.main : sw.id === 'rcd' ? p.rcd : p.breakers[sw.id]) ? 1 : 0;
  }

  update(dt) {
    const k = 1 - Math.exp(-Math.min(dt, 0.05) * 12);
    this.angle += ((this.open ? 1 : 0) - this.angle) * k;
    this.hinge.setLocalEulerAngles(0, -COVER_OPEN * this.angle, 0);
    this.hinge.getWorldTransform().transformPoint(_coverCentre, this.coverPos);
    this.label.getWorldTransform().transformPoint(Vec3.ZERO, this.labelPos);
    for (const sw of this.switches) {
      sw.k = (sw.k ?? sw.target) + (sw.target - (sw.k ?? sw.target)) * Math.min(1, dt * 30);
      sw.node.setLocalEulerAngles(LEVER_OFF * (1 - sw.k), 0, 0);
    }
  }

  save() { return { open: this.open }; }
}

const _coverCentre = new Vec3(0.166, 0, 0.011);
