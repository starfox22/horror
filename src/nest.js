// His nest (docs/STORY.md): the floor of the wardrobe's tall section behind its right door (the rail half): a folded
// blanket, water bottles, a brass key on a paper tag ("5B": the flat he was evicted from; nothing else says who he is),
// and polaroids of you asleep, taken from where you stand; your hangers pushed to the end of the rail to make room (one
// drops off the rail when the door swings open). Above, a hatch in the wardrobe's roof into the dark (the cabinets over it and the void above the
// ceiling). Dust drifts down from it when it is open or he moves up there; once, a drop of water falls through the
// torch beam. During the hunt he pulls all of it up after him.
// The things are downloaded models (props.js: tools/props), with simple stand-ins if one is missing.
import { BLEND_NORMAL, Color, Curve, CurveSet, Entity, StandardMaterial, Texture, Vec3, EMITTERSHAPE_BOX, PIXELFORMAT_RGBA8 } from 'playcanvas';
import { effectsLayers } from './lighting.js';
import { noProbes } from './world.js';

// The rail half of the tall section (closets.js SECTIONS.tall: z from the divider -0.523 to 0.276), its roof at 2.27.
export const NEST = { x0: 9.29, x1: 9.70, z0: -0.51, z1: 0.26, floor: 0.17, roof: 2.27, hatch: { x: 9.5, z: -0.12, size: 0.36 } };

export class Nest {
  constructor({ app, interactions, story, hud, bank, closets, stills, props, configureMaterial }) {
    Object.assign(this, { app, story, hud, bank, closets, stills });
    this.root = new Entity('nest'); app.root.addChild(this.root);
    const mat = (c, gloss, opts = {}) => { const m = new StandardMaterial(); m.diffuse = new Color(...c); m.gloss = gloss; m.useMetalness = true; m.metalness = opts.metal || 0;
      if (opts.opacity) { m.opacity = opts.opacity; m.blendType = BLEND_NORMAL; m.depthWrite = false; } m.update(); return m; };
    const box = (name, size, at, m, rot = [0, 0, 0], parent = this.root) => {
      const e = new Entity(name); e.addComponent('render', { type: 'box', material: m, castShadows: true, receiveShadows: true });
      e.setLocalScale(...size); e.setPosition(...at); e.setEulerAngles(...rot); parent.addChild(e); return e;
    };
    const cyl = (name, r, h, at, m, rot = [0, 0, 0]) => {
      const e = new Entity(name); e.addComponent('render', { type: 'cylinder', material: m, castShadows: true, receiveShadows: true });
      e.setLocalScale(r * 2, h, r * 2); e.setPosition(...at); e.setEulerAngles(...rot); this.root.addChild(e); return e;
    };
    // The downloaded models where they loaded; stand-ins otherwise. On the floor (y 0.17) and the folded blanket (0.125 high).
    const F = NEST.floor, B = F + 0.125;
    const model = (id, at, yaw, stand) => props?.make(id, { parent: this.root, at, euler: [0, yaw, 0], configure: (m) => configureMaterial?.(m) }) || stand();
    this.props = {
      blanket: model('blanket', [9.49, F, -0.19], 4, () => box('nest blanket', [0.36, 0.07, 0.5], [9.49, F + 0.035, -0.18], mat([0.16, 0.16, 0.17], 0.08))),
      bottles: model('bottles', [9.5, F, 0.16], 35, () => cyl('nest bottle', 0.033, 0.22, [9.5, F + 0.11, 0.17], mat([0.75, 0.82, 0.86], 0.95, { opacity: 0.35 }))),
      key: model('old-key', [9.4, B, -0.38], 35, () => box('old key', [0.05, 0.003, 0.02], [9.43, B, -0.3], mat([0.6, 0.5, 0.3], 0.7, { metal: 1 }), [0, 35, 0])),
      polaroids: model('polaroids', [9.45, B, -0.24], 80, () => box('polaroids', [0.088, 0.008, 0.107], [9.4, B, -0.24], mat([0.93, 0.92, 0.89], 0.3), [0, 22, 0])),
    };
    // Your hangers, pushed along the rail (closets.js: y 1.72, x 9.49) to its far end.
    this.hangers = [-0.475, -0.452, -0.432, -0.405].map((z, i) => props?.make('hanger', { parent: this.root, at: [9.49, 1.733, z], euler: [0, 90 + [6, -4, 9, -7][i], 0], scale: 0.9, configure: (m) => configureMaterial?.(m) }));
    this.buildHatch(mat);
    this.buildDust();
    // The drop of water (one, reused): built now, so its material is never new mid-game.
    const dropMat = mat([0.7, 0.8, 0.85], 0.98, { opacity: 0.6 });
    this.dropEntity = new Entity('drop'); this.dropEntity.addComponent('render', { type: 'sphere', material: dropMat, castShadows: false });
    this.dropEntity.setLocalScale(0.006, 0.012, 0.006); this.dropEntity.enabled = false; this.root.addChild(this.dropEntity);
    // E on the things in it.
    const item = (prop, label, use) => interactions.add({ pos: prop.getPosition().clone().add(new Vec3(0, 0.03, 0)), size: 0.1,
      active: () => this.root.enabled && this.packed !== true && this.rightDoorOpen(), label: () => label, use });
    item(this.props.polaroids, 'Look at the polaroids', () => this.examinePolaroids());
    item(this.props.key, 'Look at the key', () => { this.story?.oldKey(); this.hud?.examine({ className: 'typed', html: '<h1>A key</h1>Brass, worn. A front-door key on a paper tag, in pencil:<br><br><b style="font-size:2rem">5B</b>' }); });
    item(this.props.blanket, 'The blanket', () => { this.story?.nestSeen(); this.story?.say('It’s warm.'); });
    noProbes(this.root);
    this.reset();
  }

  rightDoorOpen() { const d = this.closets?.doors.find(x => x.id === 'right'); return !d || d.angle > 0.25; }

  // A square cut in the roof of the rail half; a lid that hangs down from one edge when open; black above.
  buildHatch(mat) {
    const H = NEST.hatch, s = H.size;
    this.voidBox = new Entity('void above the hatch');
    this.voidBox.addComponent('render', { type: 'box', material: mat([0.008, 0.007, 0.007], 0.05), castShadows: true, receiveShadows: true });
    this.voidBox.setLocalScale(s + 0.02, 0.36, s + 0.02); this.voidBox.setPosition(H.x, NEST.roof + 0.19, H.z); this.root.addChild(this.voidBox);
    this.hatchPivot = new Entity('hatch pivot'); this.hatchPivot.setPosition(H.x - s / 2, NEST.roof - 0.01, H.z); this.root.addChild(this.hatchPivot);
    const lid = new Entity('hatch lid'); lid.addComponent('render', { type: 'box', material: mat([0.33, 0.22, 0.12], 0.3), castShadows: true, receiveShadows: true });
    lid.setLocalScale(s, 0.016, s); lid.setLocalPosition(s / 2, 0, 0); this.hatchPivot.addChild(lid);
    this.hatchOpen = false;
  }

  buildDust() {
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const g = c.getContext('2d'), grad = g.createRadialGradient(8, 8, 0, 8, 8, 8); grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 16, 16);
    const tex = new Texture(this.app.graphicsDevice, { width: 16, height: 16, format: PIXELFORMAT_RGBA8, mipmaps: false }); tex.setSource(c);
    this.dustEntity = new Entity('dust from the hatch');
    this.dustEntity.addComponent('particlesystem', {
      numParticles: 90, lifetime: 4.5, rate: 0.05, rate2: 0.12, emitterShape: EMITTERSHAPE_BOX, emitterExtents: new Vec3(0.3, 0.02, 0.3),
      velocityGraph: new CurveSet([[0, 0], [0, -0.32], [0, 0]]), velocityGraph2: new CurveSet([[0, 0.03], [0, -0.22], [0, 0.03]]),
      colorMap: tex, scaleGraph: new Curve([0, 0.006, 1, 0.004]), alphaGraph: new Curve([0, 0, 0.2, 0.55, 1, 0]),
      colorGraph: new CurveSet([[0, 0.8], [0, 0.78], [0, 0.72]]), lighting: true, halfLambert: true, intensity: 1, loop: true, autoPlay: false,
      depthWrite: false, layers: effectsLayers(this.app),
    });
    this.dustEntity.setPosition(NEST.hatch.x, NEST.roof - 0.02, NEST.hatch.z);
    this.root.addChild(this.dustEntity);
    this.dustTimer = 0;
  }

  // Dust for `seconds` (opening the wardrobe in the dark; his weight shifting in the void).
  dust(seconds = 3) {
    this.dustTimer = Math.max(this.dustTimer, seconds);
    this.dustEntity.particlesystem.play();
  }

  // One drop of water through the torch beam (he is right there, still wet).
  drop() {
    this.bank?.play('water_drop', { at: [NEST.hatch.x, 0.2, NEST.hatch.z], gain: 0.7, delay: 0.9 });
    const e = this.dropEntity;
    e.setPosition(NEST.hatch.x + 0.05, NEST.roof - 0.02, NEST.hatch.z); e.enabled = true;
    this.falling = { e, v: 0 };
  }

  // The hanger nearest the door drops off the rail as the door swings open, and lands on the nest's floor.
  dropHanger() {
    const h = this.hangers?.[3];
    if (!h || this.fallingHanger || h.dropped) return;
    h.dropped = true;
    this.fallingHanger = { h, v: 0, spin: 0 };
  }

  hatch(open) {
    this.hatchOpen = open;
    this.hatchPivot.setLocalEulerAngles(0, 0, open ? -78 : 0);
    this.voidBox.enabled = open;
  }

  // During the hunt he takes it all up with him (Ending 2: nothing for the police to find).
  packUp() { this.packed = true; for (const p of Object.values(this.props)) p.enabled = false; }

  examinePolaroids() {
    this.story?.nestSeen();
    this.story?.polaroids();
    const img = this.stills?.url?.('polaroid') || '';
    this.hud?.examine({ className: 'photo', html: img ? `<img src="${img}" alt="My bed at night, from inside the wardrobe">` : '<div style="height:18rem;background:#111"></div>',
      back: '<div style="font-family:inherit;font-size:1.6rem;opacity:.72">14 . 3</div>', onFlip: () => this.story?.polaroidBack() });
  }

  reset() { this.packed = false; for (const p of Object.values(this.props)) p.enabled = true; this.hatch(false); this.dustTimer = 0; this.dustEntity.particlesystem.stop(); }
  restore(story) {
    this.reset(); this.hatch(story.has('silhouette')); if (story.has('hunt')) this.packUp();
    const h = this.hangers?.[3];
    if (h && story.has('hanger')) { h.dropped = true; h.setPosition(9.52, NEST.floor + 0.015, -0.33); h.setEulerAngles(84, 120, 0); }
  }

  update(dt) {
    if (this.dustTimer > 0) { this.dustTimer -= dt; if (this.dustTimer <= 0) this.dustEntity.particlesystem.stop(); }
    if (this.falling) {
      const f = this.falling; f.v += 9.8 * dt; const p = f.e.getPosition();
      f.e.setPosition(p.x, p.y - f.v * dt, p.z);
      if (p.y < NEST.floor + 0.05) { f.e.enabled = false; this.falling = null; }
    }
    if (this.fallingHanger) {
      const f = this.fallingHanger, p = f.h.getPosition();
      f.v += 9.8 * Math.min(dt, 0.05); f.spin += Math.min(dt, 0.05) * 260;
      const y = Math.max(NEST.floor + 0.015, p.y - f.v * Math.min(dt, 0.05));
      f.h.setPosition(p.x + 0.12 * Math.min(dt, 0.05), y, p.z + 0.25 * Math.min(dt, 0.05));
      f.h.setEulerAngles(Math.min(84, f.spin), 90 + f.spin * 0.3, 0);
      if (y <= NEST.floor + 0.015) this.fallingHanger = null;
    }
  }
}
