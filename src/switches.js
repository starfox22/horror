// Independent room and fixture controls. Wall controls reuse the apartment author's
// high-detail switch mesh, mounted against rendered surfaces rather than walk cells.
import { Color, Entity, Mesh, MeshInstance, StandardMaterial, Vec3 } from 'playcanvas';
import switchModel from './switch-model.json' with { type: 'json' };
import { findMountSurface, isOriginalSwitchTriangle } from './switch-surfaces.js';

export const ROOMS = [
  { id: 'living', label: 'Living room lights', lights: [], from: [0.95, 3.9], dir: [0, 1], on: false, zone: 'main' },
  { id: 'dining', label: 'Dining pendants', lights: ['dining pendant L', 'dining pendant R'], glow: 'White1.pendant',
    from: [1.13, 3.9], dir: [0, 1], on: false, zone: 'main' },
  { id: 'kitchen', label: 'Kitchen ceiling lights', lights: [], from: [1.31, 3.9], dir: [0, 1], on: false, zone: 'main' },
  { id: 'office', label: 'Office lights', lights: [], from: [3.0, 2.3], dir: [0, 1], on: false, zone: 'main' },
  { id: 'hall', label: 'Hall lights', lights: [], from: [11.8, 3.6], dir: [0, 1], on: false, zone: 'hall' },
  { id: 'bathroom', label: 'Bathroom ceiling lights', lights: [], from: [6.73, 1.45], height: 1.22, dir: [0, 1], on: false, zone: 'bath' },
  { id: 'bedroom', label: 'Bedroom ceiling lights', lights: [], from: [11.67, 2.1], height: 1.17, dir: [0, 1], on: false, zone: 'bed' },
  { id: 'mirror', label: 'Bathroom mirror light', lights: ['bathroom mirror'], glow: 'Light.bathroom', glowScale: 0.35,
    from: [6.91, 1.45], height: 1.22, dir: [0, 1], on: true, zone: 'bath' },
  { id: 'hood', label: 'Extractor hood light', lights: ['cooker hood'], glow: 'Light.kitchen', glowScale: 0.52,
    kind: 'fixture', at: [-0.94, 1.50, -0.93], on: true, zone: 'main' },
];
const PLATE_HEIGHT = 1.15;
export const SWITCH_BACK_EMBED = 0.0005; // rear half-millimetre sits in the wall; no visible air gap
const ROCKER_PIVOT = 0.0154;

export class Switches {
  constructor(app, grid, apartment, interactions, sounds, onChange, downlights = {}) {
    this.app = app;
    this.onChange = onChange;
    this.sounds = sounds;
    this.fades = [];
    this.surfaceMaterials = [];
    this.materialCache = new Map();
    this.meshes = Object.fromEntries(['frame', 'rocker'].map(part => {
      const source = switchModel[part], mesh = new Mesh(app.graphicsDevice);
      const positions = part === 'rocker' ? source.positions.map((v, i) => i % 3 === 2 ? v - ROCKER_PIVOT : v) : source.positions;
      mesh.setPositions(positions); mesh.setNormals(source.normals); mesh.setIndices(source.indices); mesh.update();
      return [part, mesh];
    }));
    const materials = new Map();
    for (const r of apartment.findComponents('render')) for (const mi of r.meshInstances) materials.set(mi.material.name, mi.material);
    this.sourceMaterials = materials;
    this.wallTriangles = this.prepareSurfaces(apartment);

    this.rooms = ROOMS.map(def => {
      const down = downlights[def.id] || [];
      const room = { ...def, lights: [...def.lights.map(n => app.root.findByName(n)).filter(Boolean), ...down.map(d => d.light)], level: def.on ? 1 : 0 };
      room.base = room.lights.map(l => l.light.intensity);
      room.glows = down.map(d => ({ mat: d.glow, base: d.glow.emissiveIntensity }));
      room.glowMat = def.glow ? materials.get(def.glow) : null;
      room.glowBase = room.glowMat ? room.glowMat.emissiveIntensity * (def.glowScale ?? 1) : 0;
      room.bulbs = [];
      const pos = def.kind === 'fixture' ? new Vec3(...def.at) : this.mountPlate(def, room);
      room.controlPosition = pos;
      interactions.add({ pos, size: def.kind === 'fixture' ? 0.16 : 0.075,
        label: () => `${room.on ? 'Switch off' : 'Switch on'} · ${room.label}`, use: () => this.toggle(room) });
      this.apply(room);
      return room;
    });
    // Only placement diagnostics are retained; the half-million-triangle scene cache is temporary.
    this.wallTriangles = null;
    app.on('update', dt => this.update(dt));
  }

  prepareSurfaces(apartment) {
    const triangles = [];
    this.removedSwitchTriangles = 0;
    const rays = ROOMS.filter(r => r.kind !== 'fixture').map(r => ({
      x: r.from[0], y: r.height ?? PLATE_HEIGHT, z0: r.from[1], z1: r.from[1] + 3,
    }));
    for (const render of apartment.findComponents('render')) for (const mi of render.meshInstances) {
      if (!mi.visible) continue;
      const positions = [], indices = [];
      mi.mesh.getPositions(positions); mi.mesh.getIndices(indices);
      const matrix = mi.node.getWorldTransform().data;
      const points = Array.from({ length: positions.length / 3 }, (_, i) => {
        const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
        return [matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12], matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13], matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]];
      });
      const kept = [];
      let removed = 0;
      for (let i = 0; i < indices.length; i += 3) {
        const ids = indices.slice(i, i + 3), vertices = ids.map(index => points[index]);
        if (isOriginalSwitchTriangle(vertices, mi.material.name)) { removed++; continue; }
        kept.push(...ids);
        const min = [0, 1, 2].map(k => Math.min(...vertices.map(v => v[k]))), max = [0, 1, 2].map(k => Math.max(...vertices.map(v => v[k])));
        if (rays.some(r => r.x >= min[0] - 0.06 && r.x <= max[0] + 0.06 && r.y >= min[1] - 0.05 && r.y <= max[1] + 0.05 && max[2] >= r.z0 && min[2] <= r.z1)) triangles.push({ points: vertices, entity: mi.node.name });
      }
      if (removed) {
        // Preserve every vertex stream (UVs, tangents, colours) on a separate mesh;
        // never modify shared glTF buffers or any unrelated apartment triangles.
        const mesh = new Mesh(this.app.graphicsDevice);
        for (const element of mi.mesh.vertexBuffer.format.elements) {
          const stream = []; mi.mesh.getVertexStream(element.name, stream);
          mesh.setVertexStream(element.name, stream, element.numComponents, undefined, element.dataType, element.normalize, element.asInt);
        }
        mesh.setIndices(kept); mesh.update(); mi.mesh = mesh;
        this.removedSwitchTriangles += removed;
      }
    }
    return triangles;
  }

  material(zone, part) {
    const key = `${zone}/${part}`;
    if (this.materialCache.has(key)) return this.materialCache.get(key);
    const source = this.sourceMaterials.get(`White1@${zone}`);
    const material = source ? source.clone() : new StandardMaterial();
    material.name = `Switch ${part}@${zone}`;
    for (const property of ['diffuseMap', 'normalMap', 'metalnessMap', 'glossMap', 'aoMap', 'emissiveMap', 'opacityMap']) material[property] = null;
    material.diffuse = part === 'frame' ? new Color(0.82, 0.81, 0.78) : new Color(0.90, 0.89, 0.86);
    material.emissive = Color.BLACK; material.emissiveIntensity = 0;
    material.useMetalness = true; material.metalness = 0; material.gloss = part === 'frame' ? 0.32 : 0.40;
    material.update();
    this.materialCache.set(key, material);
    this.surfaceMaterials.push({ material, zone });
    return material;
  }

  mountPlate(def, room) {
    const origin = [def.from[0], def.height ?? PLATE_HEIGHT, def.from[1]], direction = [def.dir[0], 0, def.dir[1]];
    const mount = findMountSurface(this.wallTriangles, origin, direction);
    if (!mount) throw new Error(`No supporting wall surface for ${def.label}`);
    const position = new Vec3(...mount.point).sub(new Vec3(...mount.normal).mulScalar(SWITCH_BACK_EMBED));
    const root = new Entity(`switch mount ${def.id}`);
    root.setPosition(position);
    root.lookAt(position.clone().sub(new Vec3(...mount.normal)));
    const frame = new Entity(`switch plate ${def.id}`);
    frame.addComponent('render', { meshInstances: [new MeshInstance(this.meshes.frame, this.material(def.zone, 'frame'), frame)], castShadows: false, receiveShadows: true });
    root.addChild(frame);
    const rocker = new Entity(`switch rocker ${def.id}`);
    rocker.addComponent('render', { meshInstances: [new MeshInstance(this.meshes.rocker, this.material(def.zone, 'rocker'), rocker)], castShadows: false, receiveShadows: true });
    rocker.setLocalPosition(0, 0, ROCKER_PIVOT);
    root.addChild(rocker);
    this.app.root.addChild(root);
    room.plate = root; room.rocker = rocker;
    room.mount = { ...mount, backEmbed: SWITCH_BACK_EMBED };
    return new Vec3(...mount.point).add(new Vec3(...mount.normal).mulScalar(0.020));
  }

  toggle(room) {
    const forced = this.override?.(room.lights);
    room.on = forced === true || forced === false ? !forced : !room.on;
    this.sounds?.switchClick(room.on);
    if (!this.fades.includes(room)) this.fades.push(room);
  }

  tilt(room) {
    if (room.rocker) room.rocker.setLocalEulerAngles(6 - 12 * room.level, 0, 0);
  }

  update(dt) {
    if (!this.fades.length) return;
    for (const room of this.fades) {
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
    for (const glow of room.glows) { glow.mat.emissiveIntensity = glow.base * k; glow.mat.update(); }
    this.tilt(room);
  }
}
