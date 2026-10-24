// The intruder (story-events.js, docs/STORY.md): "Male_Adult_20" from the Microsoft Rocketbox library (MIT) with its
// library animations (public/assets/props/intruder.glb, tools/intruder/). This file is his body: loading, placing,
// animation playback with cross-fades, walking along a path at a speed that matches his stride, his phone torch (a cold
// LED spot in his right hand, shadowed like every light here), footsteps and breathing. What he decides to do lives in
// stalker.js; the scripted appearances in story-events.js.
import { Asset, Color, Entity, Quat, Vec3, LIGHTFALLOFF_INVERSESQUARED, SHADOWUPDATE_REALTIME, ANIM_LAYER_OVERWRITE } from 'playcanvas';
import { glbFile } from './packed.js';

const URL_GLB = './assets/props/intruder.glb';
// Clip -> metres per second of ground speed at playback speed 1 (measured from the stride; used to keep feet planted).
export const STRIDE = { walk_slow_01: 0.92, walk_slow_02: 0.95, walk_neutral_01: 1.32, run_neutral_01: 3.1 };
const PHONE = new Color(0.86, 0.92, 1.0);     // a phone's white LED, cold next to the flat's warm lamps

export class Intruder {
  static async create({ app, sounds, isPlayerCamera }) {
    const file = await glbFile(URL_GLB);
    const container = await new Promise((resolve, reject) => {
      const asset = new Asset('Microsoft Rocketbox · Male_Adult_20 · MIT', 'container', file);
      asset.once('load', () => { if (file.url.startsWith('blob:')) URL.revokeObjectURL(file.url); resolve(asset.resource); });
      asset.once('error', error => reject(new Error(`Intruder model: ${error}`)));
      app.assets.add(asset); app.assets.load(asset);
    });
    return new Intruder({ app, container, sounds, isPlayerCamera });
  }

  constructor({ app, container, sounds, isPlayerCamera = () => true }) {
    Object.assign(this, { app, sounds });
    this.root = new Entity('intruder');
    this.body = container.instantiateRenderEntity({ castShadows: true, receiveShadows: true });
    this.root.addChild(this.body);
    this.meshInstances = this.body.findComponents('render').flatMap(r => r.meshInstances);
    // Never in a probe capture (they would keep him in the room's light after he left); the player's and the security
    // camera's views only.
    for (const mi of this.meshInstances) mi.isVisibleFunc = cam => isPlayerCamera(cam) && cam.frustum.containsAabb(mi.aabb);
    this.body.addComponent('anim', { activate: true });
    this.clips = {};
    for (const a of container.animations) {
      const track = a.resource;
      this.clips[track.name] = track;
      this.body.anim.assignAnimation(track.name, track, undefined, true);
    }
    this.bones = new Map();
    this.body.forEach(e => { if (e.name?.startsWith('Bip01')) this.bones.set(e.name, e); });
    this.hand = this.bones.get('Bip01 R Hand');
    this.head = this.bones.get('Bip01 Head');
    // His phone torch, held low in the right hand and pointing ahead. It is a separate entity that follows the hand's
    // position each frame and his heading (a hand's rotation in a walk cycle swings the beam wildly).
    this.torch = new Entity('intruder phone light');
    this.torch.addComponent('light', { type: 'spot', color: PHONE, intensity: 0, range: 11, innerConeAngle: 14, outerConeAngle: 36,
      castShadows: true, shadowResolution: 512, shadowBias: 0.08, normalOffsetBias: 0.01, falloffMode: LIGHTFALLOFF_INVERSESQUARED,
      shadowUpdateMode: SHADOWUPDATE_REALTIME, volumetricScattering: 0.6, enabled: false });
    app.root.addChild(this.torch);
    this.torchOn = false;
    this.torchPitch = -14;           // degrees below his heading
    this.root.enabled = false;
    app.root.addChild(this.root);
    this.pos = new Vec3(); this.yaw = 0; this.clip = null; this.speed = 0;
    this._q = new Quat(); this._v = new Vec3();
  }

  get visible() { return this.root.enabled; }
  show(on = true) { this.root.enabled = on; if (!on) this.setTorch(false); }

  // yaw: degrees; he faces (sin yaw, cos yaw) in x, z.
  place(x, z, yaw = this.yaw, y = 0.16) {
    this.pos.set(x, y, z); this.yaw = yaw;
    this.root.setPosition(this.pos); this.root.setEulerAngles(0, yaw, 0);
  }

  // Cross-fade to a clip (name without the 'm_' prefix). speed: playback rate.
  play(name, { blend = 0.35, speed = 1, loop = true } = {}) {
    if (!this.clips[name]) throw new Error(`Intruder has no clip ${name}`);
    const anim = this.body.anim;
    if (this.clip !== name) anim.baseLayer.transition(name, blend);
    this.clip = name;
    anim.speed = speed;
    const state = anim.baseLayer; void state; void loop;
  }

  setTorch(on, intensity = 2.2) {
    this.torchOn = on;
    this.torch.light.enabled = on;
    this.torch.light.intensity = on ? intensity : 0;
  }

  // Keeps the torch in his hand, aimed along his heading (pitch: degrees down), every frame after the animation.
  update() {
    if (!this.root.enabled || !this.torchOn) return;
    const p = this.hand ? this.hand.getPosition() : this.root.getPosition();
    this.torch.setPosition(p.x, Math.max(0.9, p.y), p.z);
    // The model faces +Z at yaw 0 (heading (sin yaw, cos yaw) in x, z); a spot shines along its local -Y, which
    // rotateLocal(90) turns onto the entity's -Z, so the light's yaw is his + 180.
    this.torch.setEulerAngles(0, this.yaw + 180, 0);
    this.torch.rotateLocal(this.torchPitch, 0, 0);
    this.torch.rotateLocal(90, 0, 0);
  }
}
