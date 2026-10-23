// Light switches, one per area. Each switch fades its ceiling downlights (lighting.js DOWNLIGHTS), its lamps, the glowing parts of their fixtures (the per-room 'Light.*'
// materials made by tools/build-assets.mjs, plus a small bulb at lamps whose glow is not a separate mesh) and then asks for
// the room reflection probe to be captured again, so bounce light follows the lamps.
// The bathroom and bedroom use the model's own switch plates; elsewhere a plate is mounted where a probe from `from`
// along `dir` first meets a wall in the walk grid.
import { Color, Entity, StandardMaterial, Vec3 } from 'playcanvas';

export const ROOMS = [
  { id: 'living', label: 'Living room lights', lights: ['arc lamp', 'arc lamp shade', 'living bounce'], bulbs: [[-4.95, 1.6, 2.76]],
    from: [0.95, 3.9], dir: [0, 1], on: true },
  { id: 'dining', label: 'Dining pendants', lights: ['dining pendant L', 'dining pendant R'], bulbs: [[-0.44, 1.8, 1.52], [0.77, 1.8, 1.52]],
    from: [1.13, 3.9], dir: [0, 1], on: true },
  { id: 'kitchen', label: 'Kitchen lights', lights: ['cooker hood'], glow: 'Light.kitchen', from: [1.31, 3.9], dir: [0, 1], on: true },
  { id: 'office', label: 'Office lights', lights: ['desk lamp'], glow: 'Light.office', from: [3.0, 2.3], dir: [0, 1], on: true },
  { id: 'hall', label: 'Hall lights', lights: ['hall night light'], from: [11.8, 3.6], dir: [0, 1], on: true },
  { id: 'bathroom', label: 'Bathroom lights', lights: ['bathroom mirror'], glow: 'Light.bathroom', at: [6.80, 1.22, 1.76], on: true },
  // The two bedside reading lamps have their own switches (devices.js); this is the ceiling and the shoe-closet LED.
  { id: 'bedroom', label: 'Bedroom lights', lights: ['closet light'], at: [11.67, 1.17, 2.37], on: true },
];
const PLATE_HEIGHT = 1.15;

export class Switches {
  constructor(app, grid, apartment, interactions, sounds, onChange, downlights = {}) {
    this.app = app;
    this.onChange = onChange;
    this.sounds = sounds;
    this.fades = [];
    const materials = new Map();
    for (const r of apartment.findComponents('render')) for (const mi of r.meshInstances) materials.set(mi.material.name, mi.material);
    const bulbMat = new StandardMaterial();
    bulbMat.diffuse = Color.BLACK; bulbMat.emissive = new Color(1, 0.82, 0.62); bulbMat.update();

    this.rooms = ROOMS.map((def) => {
      const down = downlights[def.id] || [];
      const room = { ...def, lights: [...def.lights.map(n => app.root.findByName(n)).filter(Boolean), ...down.map(d => d.light)], level: def.on ? 1 : 0 };
      room.base = room.lights.map(l => l.light.intensity);
      room.glows = down.map(d => ({ mat: d.glow, base: d.glow.emissiveIntensity }));
      room.glowMat = def.glow ? materials.get(def.glow) : null;
      room.glowBase = room.glowMat ? room.glowMat.emissiveIntensity : 0;
      room.bulbs = (def.bulbs || []).map(([x, y, z]) => {
        const b = new Entity('bulb');
        const m = bulbMat.clone(); m.update();
        b.addComponent('render', { type: 'sphere', material: m, castShadows: false });
        b.setLocalScale(0.05, 0.05, 0.05); b.setPosition(x, y, z);
        app.root.addChild(b);
        return m;
      });
      const pos = def.at ? new Vec3(...def.at) : this.mountPlate(grid, def.from, def.dir, room);
      interactions.add({ pos, size: 0.09, label: () => `${room.on ? 'Switch off' : 'Switch on'} · ${room.label}`, use: () => this.toggle(room) });
      this.apply(room);
      return room;
    });
    app.on('update', (dt) => this.update(dt));
  }

  // White plate with a rocker on the first wall met from `from` along `dir`.
  mountPlate(grid, [x, z], [dx, dz], room) {
    let d = 0;
    while (d < 3 && !grid.blockedAt(x + dx * d, z + dz * d)) d += 0.01;
    const wx = x + dx * (d - 0.035), wz = z + dz * (d - 0.035);
    const plate = new Entity('switch');
    const white = new StandardMaterial(); white.diffuse = new Color(0.86, 0.86, 0.84); white.gloss = 0.55; white.useMetalness = true; white.metalness = 0; white.update();
    plate.addComponent('render', { type: 'box', material: white });
    plate.setLocalScale(dz ? 0.08 : 0.012, 0.08, dz ? 0.012 : 0.08);
    plate.setPosition(wx, PLATE_HEIGHT, wz);
    const rocker = new Entity('rocker');
    rocker.addComponent('render', { type: 'box', material: white });
    if (dz) rocker.setLocalScale(0.55, 0.62, 1.6); else rocker.setLocalScale(1.6, 0.62, 0.55);
    room.rockerAxis = dz ? 0 : 2;   // the rocker tips about the horizontal axis that lies along the wall
    plate.addChild(rocker);
    room.rocker = rocker;
    this.app.root.addChild(plate);
    return new Vec3(wx, PLATE_HEIGHT, wz);
  }

  toggle(room) {
    room.on = !room.on;
    this.sounds?.switchClick(room.on);
    this.fades.push(room);
    this.tilt(room);
  }

  tilt(room) {
    if (!room.rocker) return;
    const a = room.on ? -12 : 12;
    room.rocker.setLocalEulerAngles(room.rockerAxis === 0 ? a : 0, 0, room.rockerAxis === 2 ? a : 0);
  }

  update(dt) {
    if (!this.fades.length) return;
    for (const room of this.fades) {
      // LEDs and bulbs come on almost at once, with a short warm-up; off is quicker.
      room.level = Math.max(0, Math.min(1, room.level + (room.on ? dt / 0.12 : -dt / 0.06)));
      this.apply(room);
    }
    const settled = this.fades.filter(r => r.level === (r.on ? 1 : 0));
    if (settled.length) {
      this.fades = this.fades.filter(r => !settled.includes(r));
      if (!this.fades.length) this.onChange?.();
    }
  }

  apply(room) {
    const k = room.level * room.level;
    room.lights.forEach((l, i) => { l.light.intensity = room.base[i] * k; l.light.enabled = k > 0.001; });
    if (room.glowMat) { room.glowMat.emissiveIntensity = room.glowBase * k; room.glowMat.update(); }
    for (const m of room.bulbs) { m.emissiveIntensity = 6 * k; m.update(); }
    for (const g of room.glows) { g.mat.emissiveIntensity = g.base * k; g.mat.update(); }
    this.tilt(room);
  }
}
