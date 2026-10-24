// The story's props (public/assets/props/story/*.glb: downloaded models built by tools/props/build.mjs, credited in
// docs/CREDITS.md and on the credits screen). Loaded once at start; make(id) places a copy (an entity with render
// components; the moving parts of the fuse box and the clock are named child entities). Each copy gets its own
// materials so a prop takes the reflection probe of the room it is in (configure(material) is called once per copy).
import { Asset } from 'playcanvas';
import { glbFile } from './packed.js';

export const PROP_IDS = ['fusebox', 'phone', 'pills', 'diary', 'tin', 'keys', 'old-key', 'bottles', 'blanket', 'clock', 'letter',
  'polaroids', 'bowl', 'dryer', 'hanger', 'camera'];

export class Props {
  static async load(app, ids = PROP_IDS) {
    const containers = {};
    await Promise.all(ids.map(async id => {
      const file = await glbFile(`./assets/props/story/${id}.glb`);
      containers[id] = await new Promise((resolve, reject) => {
        const asset = new Asset(`prop ${id}`, 'container', file);
        asset.once('load', () => { if (file.url.startsWith('blob:')) URL.revokeObjectURL(file.url); resolve(asset.resource); });
        asset.once('error', error => reject(new Error(`Prop ${id}: ${error}`)));
        app.assets.add(asset); app.assets.load(asset);
      });
    }));
    return new Props(app, containers);
  }

  constructor(app, containers = {}) { this.app = app; this.containers = containers; }
  has(id) { return !!this.containers[id]; }

  // A copy of prop `id` under `parent`, at local position `at` (metres) and Euler angles `euler` (degrees). Its materials
  // are cloned and passed to configure(material, name). Returns null when the prop did not load.
  make(id, { parent = this.app.root, at = [0, 0, 0], euler = [0, 0, 0], scale = 1, castShadows = true, receiveShadows = true, name, configure } = {}) {
    const container = this.containers[id];
    if (!container) return null;
    const entity = container.instantiateRenderEntity({ castShadows, receiveShadows });
    entity.name = name || `prop ${id}`;
    const copies = new Map();
    for (const r of entity.findComponents('render')) for (const mi of r.meshInstances) {
      if (!copies.has(mi.material)) {
        const m = mi.material.clone();
        m.name = `${mi.material.name}.${id}`;
        configure?.(m, id);
        m.update();
        copies.set(mi.material, m);
      }
      mi.material = copies.get(mi.material);
    }
    entity.setLocalPosition(...at);
    entity.setLocalEulerAngles(...euler);
    if (scale !== 1) entity.setLocalScale(scale, scale, scale);
    parent.addChild(entity);
    return entity;
  }
}
