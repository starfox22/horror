// The intruder (story-events.js, docs/STORY.md): "Male_Adult_18" from the Microsoft Rocketbox library (MIT) with its
// library animations, in black with a porcelain mask (public/assets/props/intruder.glb, tools/intruder/), and the chef's
// knife from the flat's own set (public/assets/props/story/knife.glb, tools/props/). This file is his body: loading,
// placing, animation playback with cross-fades, the knife in his right hand (an icepick grip: the fingers closed round
// the handle, the blade out under the little finger, point down while the arm hangs; knifePose lifts it overhead and
// brings it down), his phone torch (a cold LED spot in his left hand, shadowed like every light here). What he decides
// to do lives in stalker.js and hunt.js; the scripted appearances in story.js, seccam.js and death.js.
import { Asset, Color, Entity, Mat4, Quat, Vec3, LIGHTFALLOFF_INVERSESQUARED, SHADOWUPDATE_REALTIME } from 'playcanvas';
import { glbFile } from './packed.js';
import { frameRotation, solveElbow } from './arm-rig.js';

const URL_GLB = './assets/props/intruder.glb', URL_KNIFE = './assets/props/story/knife.glb';
// Clip -> metres per second of ground speed at playback speed 1 (measured from the stride; used to keep feet planted).
export const STRIDE = { walk_slow_01: 0.92, walk_slow_02: 0.95, walk_neutral_01: 1.32, run_neutral_01: 3.1 };
const PHONE = new Color(0.86, 0.92, 1.0);     // a phone's white LED, cold next to the flat's warm lamps

// The grip, in the right hand bone's frame (Biped: +X wrist -> knuckles, +Y the palm's side, +Z the thumb's side). The
// knife (knife.glb: the heel of the blade at its origin, point -Y, edge +X, the middle of the handle at +Y 0.06) lies
// across the closed fingers: butt under the thumb, blade out under the little finger, tilted `tilt` degrees towards the
// fingertips; `at` is where the middle of its handle sits in the fist.
export const GRIP = { at: [0.075, 0.012, -0.004], tilt: 24, roll: 0, handle: 0.06 };
// The fist: degrees each finger joint bends (about its local Z, Biped's flexion axis) on top of its rest pose, knuckle
// to tip; the thumb's three joints turn about their own axes [x, y, z] to wrap over the fingers.
export const FIST = {
  1: [72, 92, 48], 2: [80, 98, 50], 3: [86, 100, 50], 4: [92, 98, 46],
  0: [[0, 0, 22], [0, 0, 30], [0, 0, 36]],
};
// His arm's poses, in his own frame (metres from the shoulder: right, up, forward; directions likewise). The hold: the
// elbow bent a little more than the animation's and the hand turned so the blade hangs point down, a little back. The
// raised knife: the fist up by the side of his head, elbow out, the blade pointing forward and down. The strike: the fist
// down in front of his chest, as deep as a body in front of him, the blade driven forward and down.
export const POSES = {
  hold: { bend: 38, blade: [0, -1, -0.32] },
  raised: { wrist: [0.14, 0.34, 0.24], pole: [1, -0.1, -0.5], blade: [0, -0.8, 0.6], clavicle: 16 },
  struck: { wrist: [-0.04, -0.3, 0.5], pole: [1, -0.6, -0.2], blade: [0, -0.6, 0.8], clavicle: 4 },
};

const _m = new Mat4(), _q = new Quat(), _q2 = new Quat(), _v = new Vec3(), _v2 = new Vec3();
const X = new Vec3(1, 0, 0), Z = new Vec3(0, 0, 1), DOWN_KNIFE = new Vec3(0, -1, 0), EDGE_KNIFE = new Vec3(1, 0, 0);
const clamp01 = (k) => Math.min(1, Math.max(0, k || 0));
// A rotation whose columns are the axes x, y, z (unit, right-handed).
const basis = (x, y, z, out = new Quat()) => { _m.set([x.x, x.y, x.z, 0, y.x, y.y, y.z, 0, z.x, z.y, z.z, 0, 0, 0, 0, 1]); return out.setFromMat4(_m); };
// The twist part of rotation q about unit axis a (swing-twist decomposition), as an angle in degrees.
const twistAngle = (q, a) => {
  const d = q.x * a.x + q.y * a.y + q.z * a.z, l = Math.hypot(d, q.w);
  if (l < 1e-9) return 0;
  let angle = 2 * Math.atan2(d, q.w) * 180 / Math.PI;
  if (angle > 180) angle -= 360; else if (angle < -180) angle += 360;
  return angle;
};

export class Intruder {
  static async create({ app, sounds, isPlayerCamera }) {
    const load = async (url, name) => {
      const file = await glbFile(url);
      return new Promise((resolve, reject) => {
        const asset = new Asset(name, 'container', file);
        asset.once('load', () => { if (file.url.startsWith('blob:')) URL.revokeObjectURL(file.url); resolve(asset.resource); });
        asset.once('error', error => reject(new Error(`${name}: ${error}`)));
        app.assets.add(asset); app.assets.load(asset);
      });
    };
    const [container, knife] = await Promise.all([
      load(URL_GLB, 'Microsoft Rocketbox · Male_Adult_18 · MIT'),
      // Without the knife he is still himself (a missing file must not stop the night).
      load(URL_KNIFE, 'Knife collection · Helindu · CC BY 4.0').catch(error => { console.warn(error); return null; }),
    ]);
    return new Intruder({ app, container, knife, sounds, isPlayerCamera });
  }

  constructor({ app, container, knife = null, sounds, isPlayerCamera = () => true }) {
    Object.assign(this, { app, sounds });
    this.root = new Entity('intruder');
    this.body = container.instantiateRenderEntity({ castShadows: true, receiveShadows: true });
    this.root.addChild(this.body);
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
    this.leftHand = this.bones.get('Bip01 L Hand');
    this.head = this.bones.get('Bip01 Head');
    // The knife in his right fist (GRIP), and the fingers closed round it (FIST) from their rest pose.
    this.knife = null;
    if (knife && this.hand) {
      this.knife = new Entity('intruder knife');
      this.knife.addChild(knife.instantiateRenderEntity({ castShadows: true, receiveShadows: true }));
      this.hand.addChild(this.knife);
      this.setGrip(GRIP);
    }
    this.fingers = [];
    for (const [f, joints] of Object.entries(FIST)) ['', '1', '2'].forEach((j, i) => {
      const node = this.bones.get(`Bip01 R Finger${f}${j}`);
      if (!node) return;
      const turn = Array.isArray(joints[i]) ? joints[i] : [0, 0, joints[i]];
      this.fingers.push({ node, fist: node.getLocalRotation().clone().mul(new Quat().setFromEulerAngles(...turn)) });
    });
    // The right arm, posed after the animation each frame (update): the animation's values are kept per bone so the
    // poses blend from them (a bone a clip does not animate keeps what we wrote; see animated()).
    this.arm = ['Bip01 R Clavicle', 'Bip01 R UpperArm', 'Bip01 R Forearm', 'Bip01 R Hand'].map(name => {
      const node = this.bones.get(name);
      return node && { node, base: node.getLocalRotation().clone(), written: null, out: new Quat() };
    });
    const len = (name) => this.bones.get(name)?.getLocalPosition().length() ?? 0.28;
    this.upperLength = len('Bip01 R Forearm'); this.foreLength = len('Bip01 R Hand');
    this.raise = 0; this.strike = 0;
    this.meshInstances = [this.body, this.knife].filter(Boolean).flatMap(e => e.findComponents('render').flatMap(r => r.meshInstances));
    // Never in a probe capture (they would keep him in the room's light after he left); the player's and the security
    // camera's views only, or the security camera's alone while `cameraOnly` (LIVE: his body never in the player's view).
    this.cameraOnly = false;
    for (const mi of this.meshInstances) {
      mi.isVisibleFunc = cam => (this.cameraOnly ? cam.node?.name === 'security camera' : isPlayerCamera(cam)) && cam.frustum.containsAabb(mi.aabb);
    }
    // His phone torch, held low in the left hand and pointing ahead. It is a separate entity that follows the hand's
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
    this.torchYaw = null;            // where his light points (stalker.js sweeps it); null: where he faces
    this.headPitch = 0;              // degrees added to the animated head (seccam.js: looking up into the lens)
    this.torchUnder = false;         // his light held under his chin, up into the mask (death.js)
    this._q = new Quat(); this._v = new Vec3();
  }

  get visible() { return this.root.enabled; }
  // Hidden, he lets go of any pose (death.js and the hunt set them again when they need them).
  show(on = true) { this.root.enabled = on; if (!on) { this.setTorch(false); this.knifePose(0, 0); } }

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
    void loop;
  }

  setTorch(on, intensity = 2.2) {
    this.torchOn = on;
    this.torch.light.enabled = on;
    this.torch.light.intensity = on ? intensity : 0;
  }

  // The knife's arm, called every frame by its users (hunt.js: the kill's 0.45 s wind-up; death.js): raise 0..1 lifts it
  // from the hold to overhead (the blade up by his head, point forward and down); strike 0..1 brings it down from there
  // in an overhead stab. Applied on top of the animation, now and after every animation step until changed.
  knifePose(raise = 0, strike = 0) {
    this.raise = clamp01(raise); this.strike = clamp01(strike);
    if (this.root.enabled && this.posedThisFrame) this.poseArm();
  }
  raiseKnife(k) { this.knifePose(k, 0); }

  // Where the knife's handle, blade and fingers sit (tools/intruder/preview.mjs tunes it; GRIP is the default).
  setGrip({ at = GRIP.at, tilt = GRIP.tilt, roll = GRIP.roll, handle = GRIP.handle } = {}) {
    if (!this.knife) return;
    // Knife axes in the hand: edge +X (towards the knuckles), handle +Y along the hand's +Z (butt at the thumb), flats
    // facing the palm; then tilted about the palm's normal (blade towards the fingertips) and rolled about the handle.
    const q = basis(new Vec3(1, 0, 0), new Vec3(0, 0, 1), new Vec3(0, -1, 0));
    const r = new Quat().setFromAxisAngle(new Vec3(0, 1, 0), -tilt).mul(q).mul(new Quat().setFromAxisAngle(new Vec3(0, 1, 0), roll));
    this.knife.setLocalRotation(r);
    const centre = r.transformVector(new Vec3(0, handle, 0));
    this.knife.setLocalPosition(at[0] - centre.x, at[1] - centre.y, at[2] - centre.z);
    this.bladeInHand = r.transformVector(DOWN_KNIFE, new Vec3());
    this.edgeInHand = r.transformVector(EDGE_KNIFE, new Vec3());
  }

  // A bone's rotation as the animation left it this frame (its own value when the clip wrote one; else the value it had
  // before we last changed it).
  animated(b) {
    const q = b.node.getLocalRotation();
    if (!b.written || !q.equals(b.written)) b.base.copy(q);
    return b.base;
  }
  write(b, q) { b.node.setLocalRotation(q); (b.written ||= new Quat()).copy(b.node.getLocalRotation()); }

  // The right arm. The hold: the animated arm with the elbow bent a little deeper and the hand turned to hang the blade.
  // Raised and struck: targets in his frame (where the wrist goes, where the elbow points, where the blade points,
  // how far the shoulder lifts), blended hold -> raised -> struck as targets (so the blade keeps pointing forward and
  // down all the way) and reached by IK from the shoulder; the forearm takes most of the hand's roll so the wrist bends
  // without twisting.
  poseArm() {
    const [clav, upper, fore, hand] = this.arm;
    if (!clav || !upper || !fore || !hand || !this.knife) return;
    const yaw = this.yaw * Math.PI / 180;
    const F = new Vec3(Math.sin(yaw), 0, Math.cos(yaw)), U = new Vec3(0, 1, 0), R = new Vec3().cross(F, U);
    const frame = ([r, u, f], out = new Vec3()) => out.set(0, 0, 0).add(_v.copy(R).mulScalar(r)).add(_v.copy(U).mulScalar(u)).add(_v.copy(F).mulScalar(f));
    const aClav = this.animated(clav), aUpper = this.animated(upper), aFore = this.animated(fore);
    this.animated(hand);
    // The hold.
    this.write(clav, aClav); this.write(upper, aUpper);
    this.write(fore, _q2.copy(aFore).mul(_q.setFromEulerAngles(0, 0, -POSES.hold.bend)));
    const holdBlade = frame(POSES.hold.blade).normalize();
    const hold = this.handFor(holdBlade, fore);
    this.write(fore, hold.fore); this.write(hand, hold.hand);
    const w = Math.max(this.raise, this.strike);
    if (w <= 0) return;
    // Where the hold put things (world), and its elbow's side.
    const S0 = upper.node.getPosition().clone(), E0 = fore.node.getPosition().clone(), W0 = hand.node.getPosition().clone();
    const toW = new Vec3().sub2(W0, S0).normalize(), holdPole = new Vec3().sub2(E0, S0);
    holdPole.sub(_v2.copy(toW).mulScalar(holdPole.dot(toW))).normalize();
    // The blended target.
    const e = w * w * (3 - 2 * w), s = this.strike * this.strike * (3 - 2 * this.strike);
    const lerp3 = (a, b, k) => new Vec3().lerp(a, b, k);
    const mixPose = (key) => lerp3(frame(POSES.raised[key]), frame(POSES.struck[key]), s);
    const lift = (POSES.raised.clavicle + (POSES.struck.clavicle - POSES.raised.clavicle) * s) * e;
    // The shoulder lifts with the arm: the clavicle turned up about his forward axis (its own axes are the rig's).
    const clavWorld = new Quat().setFromAxisAngle(_v2.copy(F).mulScalar(-1), lift).mul(clav.node.getRotation());
    this.write(clav, new Quat().copy(clav.node.parent.getRotation()).invert().mul(clavWorld));
    const S = upper.node.getPosition().clone();
    const W = lerp3(W0.clone().add(new Vec3().sub2(S, S0)), mixPose('wrist').add(S), e);
    const pole = lerp3(holdPole, mixPose('pole').normalize(), e).normalize();
    const blade = lerp3(holdBlade, mixPose('blade').normalize(), e).normalize();
    // Two bones from the shoulder to the wrist (Biped elbows bend about the bones' Z, the forearm swinging towards the
    // upper arm's -Y).
    const E = solveElbow(S, W, this.upperLength, this.foreLength, pole, new Vec3());
    const u = new Vec3().sub2(E, S).normalize(), f = new Vec3().sub2(W, E).normalize();
    const y = new Vec3().copy(f).sub(_v2.copy(u).mulScalar(u.dot(f)));
    if (y.lengthSq() < 1e-8) y.copy(pole).mulScalar(-1).sub(_v2.copy(u).mulScalar(-u.dot(pole)));
    y.normalize().mulScalar(-1);
    const z = new Vec3().cross(u, y);
    const upperWorld = basis(u, y, z), foreWorld = basis(f, new Vec3().cross(z, f), z);
    const holdUpper = upper.node.getLocalRotation().clone();
    this.write(upper, new Quat().copy(upper.node.parent.getRotation()).invert().mul(upperWorld));
    this.write(fore, new Quat().copy(upperWorld).invert().mul(foreWorld));
    const ik = this.handFor(blade, fore);
    // Near the hold the solved arm and the animated one differ only in the elbow's roll: blend over the first quarter.
    const k = Math.min(1, e * 4);
    if (k < 1) {
      const solvedUpper = upper.node.getLocalRotation().clone();
      this.write(upper, _q2.slerp(holdUpper, solvedUpper, k));
      this.write(fore, _q2.slerp(hold.fore, ik.fore, k));
      this.write(hand, _q2.slerp(hold.hand, ik.hand, k));
    } else {
      this.write(fore, ik.fore); this.write(hand, ik.hand);
    }
  }

  // The forearm and hand rotations (local) that point the blade along `blade` (world) with the wrist as straight as it
  // can be: the hand's fingers follow the forearm; part of the hand's roll about the forearm moves into the forearm.
  handFor(blade, fore) {
    const foreWorld = fore.node.getRotation().clone();
    const foreDir = foreWorld.transformVector(X, new Vec3());
    const handWorld = frameRotation(this.bladeInHand, X, blade, foreDir, new Quat());
    // The roll between forearm and hand about the forearm's axis: 60 % of it turns the forearm instead.
    const rel = new Quat().copy(foreWorld).invert().mul(handWorld);
    const roll = twistAngle(rel, X) * 0.6;
    const foreLocal = new Quat().copy(fore.node.getLocalRotation()).mul(_q.setFromAxisAngle(X, roll));
    const foreWorld2 = new Quat().copy(fore.node.parent.getRotation()).mul(foreLocal);
    const handLocal = new Quat().copy(foreWorld2).invert().mul(handWorld);
    return { fore: foreLocal, hand: handLocal };
  }

  // Keeps the knife posed, the fist closed, the torch in his hand aimed along his heading (pitch: degrees down), every
  // frame after the animation.
  update() {
    if (!this.root.enabled) { this.posedThisFrame = false; return; }
    // A head turned on top of the animation (looking up into the camera's lens): Biped head bones nod about local Z.
    if (this.headPitch && this.head) this.head.rotateLocal(0, 0, this.headPitch);
    if (this.knife) {
      for (const f of this.fingers) f.node.setLocalRotation(f.fist);
      this.poseArm();
      this.posedThisFrame = true;
    }
    if (!this.torchOn) return;
    // Held under his chin (death.js: the grab): the light from below his face, up into the mask.
    if (this.torchUnder) {
      const f = this.head.getPosition(), fx = Math.sin(this.yaw * Math.PI / 180), fz = Math.cos(this.yaw * Math.PI / 180);
      this.torch.setPosition(f.x + fx * 0.32, f.y - 0.42, f.z + fz * 0.32);
      this.torch.lookAt(f.x + fx * 0.12, f.y + 0.02, f.z + fz * 0.12);
      this.torch.rotateLocal(90, 0, 0);
      return;
    }
    const p = this.leftHand ? this.leftHand.getPosition() : this.root.getPosition();
    this.torch.setPosition(p.x, Math.max(0.9, p.y), p.z);
    // The model faces +Z at yaw 0 (heading (sin yaw, cos yaw) in x, z); a spot shines along its local -Y, which
    // rotateLocal(90) turns onto the entity's -Z, so the light's yaw is his + 180.
    this.torch.setEulerAngles(0, (this.torchYaw ?? this.yaw) + 180, 0);
    this.torch.rotateLocal(this.torchPitch, 0, 0);
    this.torch.rotateLocal(90, 0, 0);
  }
}
