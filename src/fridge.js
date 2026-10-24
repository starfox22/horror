// The apartment's authored upper refrigerator door is separated at runtime. The
// freezer, cabinet sides/back, all unrelated kitchen triangles and their PBR maps
// remain untouched. A fitted cold cabinet, a downloaded glass water jug and a tumbler of water live
// behind it; its real interior emitter turns off when the door seals.
import {
  BLEND_NORMAL, CULLFACE_NONE, Color, Entity, Mesh, MeshInstance, StandardMaterial, Vec3,
  LIGHTFALLOFF_INVERSESQUARED, SHADOWUPDATE_THISFRAME,
} from 'playcanvas';
import { refreshShadows } from './lighting.js';
import { segmentDistance } from './walkgrid.js';
import { makeWaterGeometry } from './fridge-water.js';
import { makeDrinkingWater, GLASS_FULL } from './drink-timeline.js';
import { FRIDGE, classifyFridgeTriangle, fridgeDoorSegment, fridgeWorld } from './fridge-geometry.js';

function subset(device, source, indices) {
  // Compact every referenced vertex stream. The apartment's joined black
  // material can contain unrelated kitchen geometry; moving a tiny gasket must
  // not duplicate that entire vertex buffer on the CPU and GPU.
  const mesh = new Mesh(device), used = [...new Set(indices)], remap = new Map(used.map((index, i) => [index, i]));
  for (const element of source.vertexBuffer.format.elements) {
    const stream = [], compact = []; source.getVertexStream(element.name, stream);
    for (const index of used) for (let k = 0; k < element.numComponents; k++) compact.push(stream[index * element.numComponents + k]);
    mesh.setVertexStream(element.name, compact, element.numComponents, undefined, element.dataType, element.normalize, element.asInt);
  }
  mesh.setIndices(indices.map(index => remap.get(index))); mesh.update(); return mesh;
}

export class Fridge {
  static async create(options) {
    const [jugGeometry, glassGeometry] = await Promise.all(['water-jug', 'drinking-glass'].map(async name => {
      const response = await fetch(new URL(`./assets/props/${name}.json`, location.href));
      if (!response.ok) throw new Error(`Refrigerator ${name}: HTTP ${response.status}`);
      return response.json();
    }));
    return new Fridge({ ...options, jugGeometry, glassGeometry });
  }

  constructor({ app, apartment, interactions, grid, player, sounds, recapture, configureMaterial, jugGeometry, glassGeometry }) {
    Object.assign(this, { app, grid, player, sounds, recapture, configureMaterial });
    this.angle = 0; this.velocity = 0; this.target = 0; this.openRequested = false; this.moving = false;
    this.frame = new Entity('refrigerator cabinet');
    this.frame.setPosition(...FRIDGE.origin); this.frame.setEulerAngles(0, FRIDGE.yaw, 0); app.root.addChild(this.frame);
    this.door = new Entity('refrigerator upper door hinge'); this.door.setLocalPosition(...FRIDGE.hinge); this.frame.addChild(this.door);
    this.handle = new Vec3(); this.removedCapTriangles = 0; this.movingTriangles = 0;
    this.sourceMaterials = new Map(apartment.findComponents('render').flatMap(r => r.meshInstances).map(mi => [mi.material.name, mi.material]));
    this.extractDoor(apartment);
    if (!this.movingTriangles || !this.removedCapTriangles) throw new Error('The original refrigerator door/cabinet split could not be found');
    this.buildInterior(jugGeometry);
    this.buildDrinkingGlass(glassGeometry);
    this.blocker = grid?.addBlocker(() => this.angle > 0.5 ? fridgeDoorSegment(this.angle) : null);
    this.updateHandle();
    this.interaction = interactions.add({ pos: this.handle, size: 0.31,
      label: () => `${this.openRequested ? 'Close' : 'Open'} the refrigerator`, active: () => !this.drinkRunning, use: () => this.toggle() });
    this.glassTarget = this.glass.getPosition().clone().add(new Vec3(0, 0.08, 0));
    this.glassInteraction = interactions.add({ pos: this.glassTarget, size: 0.43,
      label: () => 'Take the glass and drink water', active: () => this.canDrink(), use: () => this.drinkAction?.() });
    this.applyLighting();
    this._update = dt => this.update(dt); app.on('update', this._update);
    app.once('destroy', () => { app.off('update', this._update); if (grid && this.blocker) grid.blockers = grid.blockers.filter(b => b !== this.blocker); });
  }

  extractDoor(apartment) {
    const device = this.app.graphicsDevice;
    for (const render of apartment.findComponents('render')) for (const mi of render.meshInstances) {
      const candidate = /^Refrigator\.001_/.test(mi.node.name) || /^Black(?:@main)?$/.test(mi.material.name);
      if (!candidate) continue;
      const positions = [], indices = [], kept = [], moving = [];
      mi.mesh.getPositions(positions); mi.mesh.getIndices(indices);
      const matrix = mi.node.getWorldTransform().data;
      const world = Array.from({ length: positions.length / 3 }, (_, i) => {
        const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
        return [matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12], matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13], matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]];
      });
      for (let i = 0; i < indices.length; i += 3) {
        const ids = indices.slice(i, i + 3), kind = classifyFridgeTriangle(ids.map(index => world[index]), mi.node.name, mi.material.name);
        if (kind === 'cap') this.removedCapTriangles++;
        else (kind === 'door' ? moving : kept).push(...ids);
      }
      if (!moving.length && kept.length === indices.length) continue;
      const source = mi.mesh;
      if (moving.length) {
        const entity = new Entity(`refrigerator moving ${mi.material.name}`);
        const part = new MeshInstance(subset(device, source, moving), mi.material, entity);
        part.castShadow = mi.castShadow; part.receiveShadow = mi.receiveShadow;
        entity.addComponent('render', { meshInstances: [part] }); this.door.addChild(entity);
        entity.setPosition(mi.node.getPosition()); entity.setRotation(mi.node.getRotation());
        entity.setLocalScale(mi.node.getWorldTransform().getScale(new Vec3()));
        this.movingTriangles += moving.length / 3;
      }
      if (kept.length) mi.mesh = subset(device, source, kept); else mi.visible = false;
    }
  }

  material(name, diffuse, gloss, { opacity = 1, metalness = 0, template = null } = {}) {
    const mat = this.sourceMaterials.get(template)?.clone() || new StandardMaterial(); mat.name = name; mat.diffuse = new Color(...diffuse);
    mat.useMetalness = true; mat.metalness = metalness; mat.gloss = gloss;
    if (opacity < 1) { mat.blendType = BLEND_NORMAL; mat.opacity = opacity; mat.depthWrite = false; mat.cull = CULLFACE_NONE; }
    mat.update(); this.configureMaterial?.(mat); return mat;
  }

  panel(name, bounds, material, door = false, shadows = true) {
    const [x0, x1, y0, y1, z0, z1] = bounds, entity = new Entity(name);
    entity.addComponent('render', { type: 'box', material, castShadows: shadows, receiveShadows: true });
    (door ? this.door : this.frame).addChild(entity);
    entity.setLocalPosition((x0 + x1) / 2 - (door ? FRIDGE.hinge[0] : 0), (y0 + y1) / 2, (z0 + z1) / 2 - (door ? FRIDGE.hinge[2] : 0));
    entity.setLocalScale(x1 - x0, y1 - y0, z1 - z0); return entity;
  }

  buildInterior(jugGeometry) {
    const liner = this.material('refrigerator porcelain ABS liner', [0.77, 0.81, 0.82], 0.48, { template: 'White1@main' });
    const trim = this.material('refrigerator shelf satin trim', [0.62, 0.67, 0.68], 0.72, { metalness: 0.38 });
    const rubber = this.material('refrigerator magnetic gasket', [0.075, 0.085, 0.086], 0.23);
    const glass = this.material('refrigerator clear shelf glass', [0.82, 0.94, 0.96], 0.97, { opacity: 0.13, template: 'Glass@main' });
    const jugMat = this.material('water jug clear glass', [0.86, 0.95, 0.97], 0.99, { opacity: 0.16, template: 'Glass@main' });
    const waterMat = this.material('refrigerator still drinking water', [0.58, 0.79, 0.84], 0.98, { opacity: 0.22 });
    const b = (name, bounds, mat = liner, door = false, shadows = true) => this.panel(name, bounds, mat, door, shadows);
    // A sealed cavity: lining walls hide the source cabinet's inner/back faces,
    // while the original body and lower freezer continue to provide collision.
    b('fridge cold back', [-0.312, 0.312, 0.943, 2.005, -0.311, -0.284]);
    b('fridge cold left wall', [-0.332, -0.291, 0.943, 2.005, -0.311, 0.279]);
    b('fridge cold right wall', [0.285, 0.326, 0.943, 2.005, -0.311, 0.279]);
    b('fridge cold top', [-0.312, 0.312, 1.978, 2.005, -0.311, 0.279]);
    b('fridge cold floor', [-0.312, 0.312, 0.943, 0.975, -0.311, 0.279]);
    // Fine front gasket around the aperture; its cavity stays open.
    b('fridge left seal', [-0.319, -0.307, 0.956, 1.994, 0.274, 0.284], rubber);
    b('fridge right seal', [0.302, 0.314, 0.956, 1.994, 0.274, 0.284], rubber);
    b('fridge top seal', [-0.319, 0.314, 1.984, 1.995, 0.274, 0.284], rubber);
    b('fridge bottom seal', [-0.319, 0.314, 0.953, 0.964, 0.274, 0.284], rubber);
    // Glass shelves have opaque narrow support/edge rails, not a glowing slab.
    for (const y of [1.145, 1.333, 1.738]) {
      b('fridge glass shelf', [-0.288, 0.281, y - 0.005, y, -0.278, 0.155], glass, false, false);
      b('fridge shelf front edge', [-0.289, 0.282, y - 0.009, y + 0.005, 0.146, 0.159], trim);
      for (const x of [-0.287, 0.272]) b('fridge shelf molded support', [x, x + 0.012, y - 0.018, y - 0.005, -0.271, 0.133]);
    }
    b('fridge crisper transparent front', [-0.269, 0.264, 0.987, 1.131, 0.135, 0.144], glass, false, false);
    b('fridge crisper handle', [-0.115, 0.11, 1.113, 1.128, 0.142, 0.16], liner);
    // The inside skin and bins stay rigidly attached to the real moving leaf.
    b('fridge upper door liner', [-0.318, 0.308, 0.952, 1.995, 0.258, 0.281], liner, true);
    for (const y of [1.08, 1.475, 1.845]) {
      b('fridge door bin base', [-0.268, 0.26, y, y + 0.014, 0.18, 0.258], liner, true);
      b('fridge door bin clear lip', [-0.268, 0.26, y + 0.014, y + 0.075, 0.177, 0.185], glass, true, false);
      b('fridge door bin left cheek', [-0.278, -0.264, y, y + 0.078, 0.178, 0.258], liner, true);
      b('fridge door bin right cheek', [0.256, 0.27, y, y + 0.078, 0.178, 0.258], liner, true);
    }
    // The downloaded glass water jug (docs/DRINK_ASSETS.md) and the still water fitted inside its measured walls.
    const mesh = new Mesh(this.app.graphicsDevice); mesh.setPositions(jugGeometry.positions); mesh.setNormals(jugGeometry.normals); mesh.setIndices(jugGeometry.indices); mesh.update();
    this.jug = new Entity('water jug');
    this.jug.addComponent('render', { meshInstances: [new MeshInstance(mesh, jugMat, this.jug)], castShadows: false, receiveShadows: true });
    this.jug.render.meshInstances.forEach(mi => { mi.castShadow = false; });
    this.frame.addChild(this.jug); this.jug.setLocalPosition(...FRIDGE.jug); this.jug.setLocalEulerAngles(0, FRIDGE.jugYaw, 0);
    const waterGeometry = makeWaterGeometry(jugGeometry.interior), waterMesh = new Mesh(this.app.graphicsDevice);
    waterMesh.setPositions(waterGeometry.positions); waterMesh.setNormals(waterGeometry.normals); waterMesh.setIndices(waterGeometry.indices); waterMesh.update();
    this.water = new Entity('water inside jug');
    this.water.addComponent('render', { meshInstances: [new MeshInstance(waterMesh, waterMat, this.water)], castShadows: false, receiveShadows: true });
    this.water.render.meshInstances.forEach(mi => { mi.castShadow = false; });
    this.jug.addChild(this.water);
    this.waterLevel = FRIDGE.jug[1] + waterGeometry.level;
    this.jugHeight = Math.max(...jugGeometry.positions.filter((_, index) => index % 3 === 1));
    this.glow = this.material('refrigerator LED diffuser', [0.68, 0.74, 0.77], 0.65);
    this.glow.emissive = new Color(0.82, 0.91, 1); this.glow.emissiveIntensity = 0; this.glow.update();
    b('fridge upper LED lens', [-0.10, 0.10, 1.966, 1.976, 0.14, 0.22], this.glow, false, false);
    this.baseIntensity = 0.24;
    this.light = new Entity('refrigerator interior light');
    // A downward LED spot under the diffuser, as in a real refrigerator: one shadow view instead of an omni's six, which
    // matters while the door swings (its shadow is re-rendered every frame of the swing).
    this.light.addComponent('light', { type: 'spot', innerConeAngle: 38, outerConeAngle: 72, color: new Color(0.82, 0.91, 1), intensity: 0, range: 1.65, enabled: false,
      castShadows: true, shadowResolution: 512, shadowBias: 0.08, normalOffsetBias: 0.015,
      falloffMode: LIGHTFALLOFF_INVERSESQUARED });
    this.frame.addChild(this.light); this.light.setLocalPosition(...FRIDGE.light);
    this.light.light.shadowUpdateMode = SHADOWUPDATE_THISFRAME;
  }

  buildDrinkingGlass(geometry) {
    const mesh = new Mesh(this.app.graphicsDevice); mesh.setPositions(geometry.positions); mesh.setNormals(geometry.normals); mesh.setIndices(geometry.indices); mesh.update();
    const glassMat = this.material('drinking tumbler glass', [0.87, 0.95, 0.97], 0.99, { opacity: 0.2, template: 'Glass@main' });
    this.glass = new Entity('drinking glass');
    this.glass.addComponent('render', { meshInstances: [new MeshInstance(mesh, glassMat, this.glass)], castShadows: false, receiveShadows: true });
    this.glass.render.meshInstances.forEach(mi => { mi.castShadow = false; });
    this.frame.addChild(this.glass); this.glass.setLocalPosition(...FRIDGE.glass);
    this.glassShelfPosition = this.glass.getPosition().clone(); this.glassShelfRotation = this.glass.getRotation().clone();
    const waterMat = this.material('water inside drinking tumbler', [0.61, 0.81, 0.85], 0.98, { opacity: 0.25 });
    this.glassWaterMesh = new Mesh(this.app.graphicsDevice);
    this.glassWater = new Entity('drinkable water free surface');
    this.glassWater.addComponent('render', { meshInstances: [new MeshInstance(this.glassWaterMesh, waterMat, this.glassWater)], castShadows: false, receiveShadows: true });
    this.glassWater.render.meshInstances.forEach(mi => { mi.castShadow = false; });
    this.glass.addChild(this.glassWater); this.setGlassWater(GLASS_FULL, 0);
    this.drinkRunning = false; this.hasDrunk = false;
  }

  setGlassWater(fill, tilt) {
    const geometry = makeDrinkingWater(fill, tilt);
    this.glassWaterMesh.setPositions(geometry.positions); this.glassWaterMesh.setNormals(geometry.normals);
    if (!this.glassWaterInitialized) { this.glassWaterMesh.setIndices(geometry.indices); this.glassWaterInitialized = true; }
    this.glassWaterMesh.update(); this.glassFill = fill;
  }

  setDrinkAction(action) { this.drinkAction = action; }
  canDrink() {
    return !!this.drinkAction && !this.drinkRunning && !this.hasDrunk && this.angle > 75 && !this.moving &&
      (!this.player?.camera || this.player.camera.getPosition().distance(this.glassTarget) < 1.6);
  }

  // Middle of the moving upper leaf, in the world.
  doorCentre() {
    const a = this.angle * Math.PI / 180, h = FRIDGE.hinge, w = FRIDGE.width / 2;
    return (this._centre ||= new Vec3()).set(...fridgeWorld([h[0] - Math.cos(a) * w, 1.47, h[2] + Math.sin(a) * w]));
  }

  updateHandle() {
    const a = this.angle * Math.PI / 180, h = FRIDGE.hinge, p = FRIDGE.handle;
    const x = p[0] - h[0], z = p[2] - h[2];
    this.handle.set(...fridgeWorld([h[0] + Math.cos(a) * x + Math.sin(a) * z, p[1], h[2] - Math.sin(a) * x + Math.cos(a) * z]));
  }

  applyLighting() {
    const level = Math.max(0, Math.min(1, (this.angle - 0.7) / 10));
    this.light.light.enabled = level > 0;
    this.light.light.intensity = this.baseIntensity * level;
    if (this.glow.emissiveIntensity !== level * 2) { this.glow.emissiveIntensity = level * 2; this.glow.update(); }
    if (level > 0) this.light.light.shadowUpdateMode = SHADOWUPDATE_THISFRAME;
  }

  toggle() {
    if (this.drinkRunning) return;
    this.override?.([this.light]);
    this.openRequested = !this.openRequested; this.target = this.openRequested ? FRIDGE.opening : 0;
    this.moving = true; this.blocked = false;
    this.sounds?.lampClick?.(this.handle, this.openRequested);
  }

  update(dt) {
    if (!this.moving) return;
    dt = Math.min(Math.max(dt, 0), 0.05);
    const old = this.angle;
    this.velocity += ((this.target - this.angle) * 35 - this.velocity * 11.5) * dt;
    this.angle = Math.max(0, Math.min(FRIDGE.opening, this.angle + this.velocity * dt));
    const p = this.player?.pos;
    if (p && segmentDistance(p.x, p.z, fridgeDoorSegment(this.angle)) < 0.255) {
      this.angle = old; this.velocity = 0; this.moving = false; this.blocked = true;
      this.sounds?.bump?.(this.handle);
    }
    if (Math.abs(this.target - this.angle) < 0.05 && Math.abs(this.velocity) < 0.4) {
      this.angle = this.target; this.velocity = 0; this.moving = false;
    }
    this.door.setLocalEulerAngles(0, this.angle, 0); this.updateHandle(); this.applyLighting();
    refreshShadows(this.app, this.doorCentre(), 0.75);      // the swinging leaf (its interior light included)
    if (!this.moving) {
      if (this.angle === 0) {
        this.sounds?.bump?.(this.handle);
        if (this.hasDrunk) this.onShutAfterDrink?.();     // story-events.js: the falling glass follows
      }
      // One settled probe capture, rather than a recapture on each animated frame.
      Promise.resolve(this.recapture?.()).catch(error => console.error('Refrigerator lighting capture failed', error));
    }
  }
}
