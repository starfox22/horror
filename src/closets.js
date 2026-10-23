// Bedroom wardrobe: four doors (cut out of the model by tools/build-assets.mjs, materials '<name>.wardrobe-<id>')
// swing open and shut with E. Inside: a simple carcass in the wardrobe's own wood (the model is a hollow shell behind
// its doors), a shelf, a hanging rail, and an LED strip that comes on while a section's doors are open, as in a modern
// built-in wardrobe. The flashlight lies on the shelf behind the left tall door.
import { Color, Entity, LIGHTFALLOFF_INVERSESQUARED, StandardMaterial, Vec3 } from 'playcanvas';
import { refreshShadows } from './lighting.js';
import { segmentDistance } from './walkgrid.js';

const FRONT = 9.725;              // x of the door fronts; the back panel is at 9.27
// id, hinge z, opening direction (+1 swings the free edge from +z towards +x), handle point, section
const DOORS = [
  { id: 'left', hinge: -1.322, sign: 1, handle: [9.76, 1.26, -0.58], section: 'tall' },
  { id: 'right', hinge: 0.276, sign: -1, handle: [9.76, 1.26, -0.47], section: 'tall' },
  { id: 'upperleft', hinge: 1.342, sign: 1, handle: [9.76, 1.74, 1.79], section: 'upper' },
  { id: 'upperright', hinge: 2.356, sign: -1, handle: [9.76, 1.74, 1.90], section: 'upper' },
];
// Inside each section: [z0, z1, y0, y1], a shelf height, an optional rail height, a divider z
const SECTIONS = {
  tall: { z: [-1.322, 0.276], y: [0.15, 2.27], shelf: 1.84, rail: 1.72, divider: -0.523, led: [9.5, 2.2, -0.52] },
  upper: { z: [1.342, 2.356], y: [1.21, 2.27], shelf: 1.74, divider: 1.848, led: [9.5, 2.2, 1.85] },
};
export const FLASHLIGHT_SPOT = { pos: new Vec3(9.50, 1.858, -0.93), yaw: 90 };   // on the tall section's shelf, lens to the door

export class Closets {
  constructor(app, apartment, interactions, sounds, grid) {
    this.app = app;
    this.sounds = sounds;
    this.moving = [];
    const wood = apartment.findComponents('render').flatMap(r => r.meshInstances).find(mi => mi.material.name === 'Wood049')?.material;
    this.buildInteriors(wood);
    this.sections = {};
    for (const [id, s] of Object.entries(SECTIONS)) {
      const led = new Entity(`wardrobe led ${id}`);
      led.addComponent('light', { type: 'omni', color: new Color(1, 0.88, 0.74), intensity: 0, range: 1.6, castShadows: false,
        falloffMode: LIGHTFALLOFF_INVERSESQUARED, enabled: false });
      led.setPosition(...s.led);
      app.root.addChild(led);
      this.sections[id] = { led, open: 0 };
    }

    this.doors = DOORS.map((d) => {
      const parts = apartment.findComponents('render').filter(r => r.meshInstances.some(mi => mi.material.name.endsWith(`.wardrobe-${d.id}`)));
      const pivot = new Entity(`wardrobe hinge ${d.id}`);
      pivot.setPosition(FRONT, 0, d.hinge);
      app.root.addChild(pivot);
      for (const r of parts) {
        // Keep the part where it is in the world while hanging it on the hinge (both parents are unscaled).
        const e = r.entity, wp = e.getPosition().clone(), wr = e.getRotation().clone();
        e.reparent(pivot);
        e.setPosition(wp); e.setRotation(wr);
      }
      const door = { ...d, pivot, angle: 0, target: 0, width: Math.abs(d.handle[2] - d.hinge) + 0.04 };
      // While open, the leaf stands out into the room: a moving wall for the walk grid.
      door.segment = (angle = door.angle) => {
        const a = d.sign * 100 * angle * Math.PI / 180, dir = Math.sign(d.handle[2] - d.hinge);
        return [FRONT, d.hinge, FRONT + Math.sin(a) * dir * door.width, d.hinge + Math.cos(a) * dir * door.width];
      };
      grid?.addBlocker(() => (door.angle < 0.02 ? null : door.segment()));
      interactions.add({ pos: new Vec3(...d.handle), size: 0.16, label: () => `${door.target ? 'Close' : 'Open'} the wardrobe`,
        use: () => this.toggle(door), active: () => true });
      return door;
    });
    app.on('update', (dt) => this.update(dt));
  }

  // Inner walls, shelf and rail, in the wardrobe's wood (white melamine if that material is missing).
  buildInteriors(wood) {
    const mat = wood || Object.assign(new StandardMaterial(), { diffuse: new Color(0.8, 0.78, 0.74) });
    const chrome = new StandardMaterial();
    chrome.diffuse = new Color(0.8, 0.8, 0.82); chrome.useMetalness = true; chrome.metalness = 1; chrome.gloss = 0.85; chrome.update();
    const box = (x0, x1, y0, y1, z0, z1, m = mat) => {
      const e = new Entity('wardrobe interior');
      e.addComponent('render', { type: 'box', material: m });
      e.setPosition((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      e.setLocalScale(x1 - x0, y1 - y0, z1 - z0);
      this.app.root.addChild(e);
    };
    const X0 = 9.28, X1 = FRONT - 0.02, T = 0.018;
    for (const s of Object.values(SECTIONS)) {
      const [z0, z1] = s.z, [y0, y1] = s.y;
      box(X0, X1, y0, y0 + T, z0, z1);                    // floor
      box(X0, X1, y1 - T, y1, z0, z1);                    // top
      box(X0, X1, y0, y1, z0, z0 + T); box(X0, X1, y0, y1, z1 - T, z1);   // sides
      box(X0, X0 + T, y0, y1, z0, z1);                    // back lining
      box(X0, X1, y0, y1, s.divider - T / 2, s.divider + T / 2);          // divider between the two doors
      box(X0, X1, s.shelf - T, s.shelf, z0, z1);          // shelf
      if (s.rail) {
        const r = new Entity('wardrobe rail');
        r.addComponent('render', { type: 'cylinder', material: chrome });
        r.setPosition((X0 + X1) / 2, s.rail, s.divider + (z1 - s.divider) / 2);
        r.setEulerAngles(90, 0, 0); r.setLocalScale(0.022, z1 - s.divider - 0.04, 0.022);
        this.app.root.addChild(r);
      }
    }
  }

  toggle(door) {
    door.target = door.target ? 0 : 1;
    this.sounds?.wardrobe(door.target === 1);
    if (!this.moving.includes(door)) this.moving.push(door);
  }

  update(dt) {
    if (!this.moving.length) return;
    for (const d of this.moving) {
      // Eased swing, ~0.7 s to 100 degrees.
      const old = d.angle;
      d.angle += (d.target - d.angle) * (1 - Math.exp(-6 * dt));
      if (Math.abs(d.target - d.angle) < 0.002) d.angle = d.target;
      // A door swinging into the player stops against them.
      const p = this.player?.pos;
      if (p && segmentDistance(p.x, p.z, d.segment()) < 0.25) { d.angle = old; d.target = old; }
      d.pivot.setEulerAngles(0, d.sign * 100 * d.angle, 0);
      refreshShadows(this.app, d.pivot.getPosition(), 3);
    }
    this.moving = this.moving.filter(d => d.angle !== d.target);
    for (const [id, s] of Object.entries(this.sections)) {
      const open = Math.max(...this.doors.filter(d => d.section === id).map(d => d.angle));
      s.led.light.enabled = open > 0.02;
      s.led.light.intensity = 0.55 * Math.min(1, open * 4);
    }
  }
}
