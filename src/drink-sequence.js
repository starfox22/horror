// Drinking the glass of water from the refrigerator: a downloaded first-person arm (arm-rig.js: Microsoft Rocketbox, MIT;
// sleeve, hand and fingers) reaches in, opens its hand, closes it round the glass, lifts it clear of the shelf, brings it
// to the lips, drinks with the head tipping back, puts it back and withdraws, on one pausable clock (drink-timeline.js).
// The eyes go to the glass and the body leans in while reaching. Only the refreshed exhale is heard, after the last sip.
import { Asset, Entity, Mat4, Quat, Vec3 } from 'playcanvas';
import { DRINK_DURATION, DRINK_TIMING, GLASS_EMPTY, GLASS_HEIGHT, sampleDrink } from './drink-timeline.js';
import { ArmRig, gripInGlass, frameRotation } from './arm-rig.js';
import { glbFile } from './packed.js';

const ARM_URL = './assets/props/drinking-arm.glb';
const ARM_DATA_URL = './assets/props/drinking-arm.json';
// Only the refreshed exhale after the last sip (the owner asked for no gulping sounds).
const AUDIO = [
  { file: 'drink-relief.wav', starts: [DRINK_TIMING.relief], gain: 0.65 },
];
// Camera space: the right shoulder joint (behind and below the eye, never in view: the mesh ends 7 cm from it), where the
// hand rests below the view, and how far beside the glass the open hand pauses before closing on it.
export const SHOULDER = new Vec3(0.19, -0.25, 0.09);
const REST_WRIST = new Vec3(0.30, -0.62, -0.10);
const PRE_GRASP = new Vec3(0.07, 0.035, 0.08);
// The resting hand: fingers forward and down, back of the hand out to the right.
const REST_HAND = frameRotation(new Vec3(0, 1, 0), new Vec3(0, 0, 1), new Vec3(0.05, -0.55, -0.83), new Vec3(0.9, 0.25, 0.1));
const MAX_LEAN = 0.6;       // metres the body may lean (or step) towards the glass to reach it
const LOOK_BELOW = 8;       // degrees: the eyes rest just above the glass while reaching
const SIP_HEAD = 7;         // degrees the head tips back while drinking

async function loadArm(app) {
  const [file, data] = await Promise.all([glbFile(ARM_URL), fetch(new URL(ARM_DATA_URL, location.href)).then(r => {
    if (!r.ok) throw new Error(`Drinking arm data: HTTP ${r.status}`);
    return r.json();
  })]);
  const container = await new Promise((resolve, reject) => {
    const asset = new Asset('Microsoft Rocketbox · first-person arm · MIT', 'container', file);
    asset.once('load', () => { if (file.url.startsWith('blob:')) URL.revokeObjectURL(file.url); resolve(asset.resource); });
    asset.once('error', error => reject(new Error(`Drinking arm: ${error}`)));
    app.assets.add(asset); app.assets.load(asset);
  });
  return { container, data };
}

// Recorded audio follows the same clock as the fingers and glass. Pausing stops
// only these voices; resuming starts any current recording at its saved offset.
// The apartment ambience remains owned by Ambience.
export class DrinkingAudio {
  static async create(sounds) {
    const voice = new DrinkingAudio(sounds?.ctx, sounds?.master);
    if (!voice.ctx) return voice;
    const clips = await Promise.all(AUDIO.map(async item => {
      const response = await fetch(new URL(`./assets/audio/${item.file}`, location.href));
      if (!response.ok) throw new Error(`Drinking sound ${item.file}: HTTP ${response.status}`);
      const buffer = await voice.ctx.decodeAudioData(await response.arrayBuffer());
      return item.starts.map(start => ({ start, buffer, gain: item.gain }));
    }));
    voice.clips = clips.flat(); return voice;
  }
  constructor(ctx, destination) { this.ctx = ctx; this.destination = destination; this.nodes = []; this.clips = []; this.playing = false; }
  pause() {
    for (const { source, gain } of this.nodes) { try { source.stop(); } catch { /* completed voice */ } source.disconnect(); gain.disconnect(); }
    this.nodes.length = 0; this.playing = false;
  }
  resume(time) {
    if (this.playing || !this.ctx) return;
    this.playing = true;
    for (const clip of this.clips) {
      const offset = Math.max(0, time - clip.start);
      if (offset >= clip.buffer.duration) continue;
      const source = this.ctx.createBufferSource(), gain = this.ctx.createGain();
      source.buffer = clip.buffer; gain.gain.value = clip.gain;
      source.connect(gain).connect(this.destination || this.ctx.destination);
      source.start(this.ctx.currentTime + Math.max(0, clip.start - time), offset);
      this.nodes.push({ source, gain });
    }
  }
}

export class DrinkSequence {
  static async create(options) {
    const [{ container, data }, audio] = await Promise.all([loadArm(options.app), DrinkingAudio.create(options.sounds || options.fridge?.sounds)]);
    return new DrinkSequence({ ...options, container, armData: data, audio });
  }

  constructor({ app, camera, player, fridge, interactions, configureMaterial,
    container, armData, audio = new DrinkingAudio(), onStart = () => {}, onComplete = () => {},
    document: ownerDocument = globalThis.document, window: ownerWindow = globalThis.window,
    clock = () => performance.now() / 1000,
    reducedMotion = ownerWindow?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false }) {
    Object.assign(this, { app, camera, player, fridge, interactions, audio, onStart, onComplete, ownerDocument, clock, reducedMotion });
    this.running = false; this.completed = false; this.time = 0; this.lastTime = null; this.locked = false;
    this.carried = false;
    // Visibility is tested during camera culling, before a capture's render
    // passes. Probe cameras intentionally copy the player's layer list, so a
    // layer alone would still bake first-person hands into room reflections.
    this.playerCamera = camera.camera?.camera;
    this.glassVisibility = fridge.glass.findComponents('render').flatMap(render => render.meshInstances).map(mi => {
      const previous = mi.isVisibleFunc;
      mi.cull = true;
      mi.isVisibleFunc = cam => this.carried ? cam === this.playerCamera : previous ? previous(cam) : cam.frustum.containsAabb(mi.aabb);
      return [mi, previous];
    });
    // The arm hangs in camera space; only the player's camera draws it (probe cameras copy the player's layers, so a
    // layer alone would bake it into room reflections).
    this.handCarrier = new Entity('first-person right arm · drinking'); camera.addChild(this.handCarrier);
    this.arm = container.instantiateRenderEntity({ castShadows: false, receiveShadows: true });
    this.handCarrier.addChild(this.arm); this.handCarrier.enabled = false;
    for (const render of this.arm.findComponents('render')) {
      for (const mi of render.meshInstances) {
        mi.castShadow = false; mi.cull = true;
        mi.isVisibleFunc = cam => cam === this.playerCamera;
        // Keep the downloaded skin and knit maps; the probes give it the kitchen's bounce light and reflections.
        if (!mi.material._drinkConfigured) { mi.material._drinkConfigured = true; configureMaterial?.(mi.material); }
      }
    }
    this.rig = new ArmRig(this.arm, armData);
    this.grip = gripInGlass(armData, GLASS_HEIGHT);
    this.glassInverse = new Mat4(); this.shelfLocal = new Vec3(); this.glassCamera = new Vec3(); this.glassCameraRotation = new Quat();
    this.tiltRotation = new Quat(); this.inverseCamera = new Quat();
    this.wrist = new Vec3(); this.handRotation = new Quat(); this.graspWrist = new Vec3(); this.graspRotation = new Quat(); this.step = new Vec3();
    this.liquidRotation = new Quat(); this.liquidUp = new Vec3();
    this.headRotation = new Quat(); this.cameraRotation = new Quat();
    this.onVisibility = () => { this.lastTime = null; if (ownerDocument?.hidden) this.audio.pause(); };
    ownerDocument?.addEventListener('visibilitychange', this.onVisibility);
    fridge.setDrinkAction(() => this.start());
    app?.once?.('destroy', () => this.destroy());
  }

  get active() { return this.running; }
  get duration() { return DRINK_DURATION; }

  start() {
    if (this.running || this.completed || !this.fridge.canDrink()) return false;
    this.running = true; this.time = 0; this.lastTime = this.clock();
    this.locked = this.ownerDocument ? !!this.ownerDocument.pointerLockElement : true;
    this.basePosition = this.camera.getPosition().clone(); this.baseRotation = this.camera.getEulerAngles().clone();
    this.baseOrientation = this.camera.getRotation().clone();
    this.savedYaw = this.player.yaw; this.savedPitch = this.player.pitch;
    // The glass is round: turn it about its own axis to face the way the player looks, so the same grip (the palm on its
    // right, towards the eye) fits it whatever angle it was approached from.
    const forward = this.camera.forward;
    this.carryRotation = new Quat().setFromEulerAngles(0, Math.atan2(-forward.x, -forward.z) * 180 / Math.PI, 0);
    this.fridge.glass.setRotation(this.carryRotation);
    // Lean the body in as far as the arm needs to close on the glass (the shoulder rides with the camera).
    const glass = this.fridge.glassShelfPosition;
    const wristWorld = this.carryRotation.transformVector(this.grip.position, new Vec3()).add(glass);
    const shoulderWorld = this.baseOrientation.transformVector(SHOULDER, new Vec3()).add(this.basePosition);
    const lean = Math.min(MAX_LEAN, Math.max(0, wristWorld.distance(shoulderWorld) - (this.rig.reach - 0.06)));
    this.reachDirection = new Vec3().sub2(glass, this.basePosition);
    this.reachDirection.y = 0; this.reachDirection.normalize().mulScalar(lean);
    // Eyes to the glass while reaching and putting it back (it rests a little below the centre of view).
    const centre = glass.clone().add(new Vec3(0, GLASS_HEIGHT / 2, 0));
    const distance = Math.hypot(centre.x - this.basePosition.x, centre.z - this.basePosition.z) - lean;
    const glassPitch = Math.atan2(centre.y - this.basePosition.y, Math.max(0.2, distance)) * 180 / Math.PI;
    const initialPitch = Math.asin(Math.max(-1, Math.min(1, forward.y))) * 180 / Math.PI;
    this.lookDelta = Math.min(25, Math.max(-35, glassPitch + LOOK_BELOW - initialPitch));
    this.fridge.drinkRunning = true;
    this.holdPlayer();
    // Input arrives between RAF callbacks. Disable cached interaction focus here,
    // before another E/click can close the door or start a second drink.
    if (this.interactions) { this.interactions.enabled = false; this.interactions.update(); }
    this.handCarrier.enabled = true; this.apply(); this.onStart();
    if (this.locked && !this.ownerDocument?.hidden) this.audio.resume(0);
    return true;
  }

  holdPlayer() { this.player.active = false; this.player.keys.clear(); this.player.vel.set(0, 0, 0); }
  setLocked(locked) {
    this.locked = !!locked; this.lastTime = null;
    if (!locked) this.audio.pause();
    else if (this.running && !this.ownerDocument?.hidden) this.audio.resume(this.time);
  }

  update() {
    if (!this.running) return false;
    this.holdPlayer();
    if (!this.locked || this.ownerDocument?.hidden) { this.lastTime = null; this.audio.pause(); return true; }
    const now = this.clock();
    if (this.lastTime !== null) this.time += Math.max(0, now - this.lastTime);
    this.lastTime = now;
    this.audio.resume(this.time);
    this.apply();
    if (this.time >= DRINK_DURATION) this.finish();
    return this.running;
  }

  // apply(time) is also an inspection hook: capture the exact reach, grip or sip
  // pose at any graphics setting without relying on software-GPU frame speed.
  apply(time = this.time) {
    if (!this.basePosition) return null;
    const head = sampleDrink(time, { reducedMotion: this.reducedMotion });
    this.camera.setPosition(this.basePosition.x + this.reachDirection.x * head.lean, this.basePosition.y, this.basePosition.z + this.reachDirection.z * head.lean);
    this.headRotation.setFromEulerAngles(this.lookDelta * head.look + SIP_HEAD * head.sip, 0, 0);
    this.cameraRotation.mul2(this.baseOrientation, this.headRotation); this.camera.setRotation(this.cameraRotation);
    this.glassInverse.copy(this.camera.getWorldTransform()).invert();
    this.glassInverse.transformPoint(this.fridge.glassShelfPosition, this.shelfLocal);
    const pose = sampleDrink(time, { shelf: this.shelfLocal.toArray(), reducedMotion: this.reducedMotion });
    if (pose.carried !== this.carried) {
      this.carried = pose.carried;
      if (this.carried) this.camera.addChild(this.fridge.glass);
      else this.returnGlass(this.carryRotation);
    }
    // The glass in camera space: carried, as the timeline says; on the shelf, where it stands.
    if (pose.carried) {
      this.tiltRotation.setFromEulerAngles(pose.tilt, 0, 0);
      this.fridge.glass.setLocalPosition(...pose.glass);
      this.fridge.glass.setLocalRotation(this.tiltRotation);
      this.glassCamera.set(...pose.glass); this.glassCameraRotation.copy(this.tiltRotation);
    } else {
      this.glassCamera.copy(this.shelfLocal);
      this.inverseCamera.copy(this.cameraRotation).invert();
      this.glassCameraRotation.mul2(this.inverseCamera, this.fridge.glass.getRotation());
    }
    // The hand on the glass (the asset's fitted grip), beside it with the hand open, or resting below the view, with a
    // gentle swing on the way.
    this.graspRotation.mul2(this.glassCameraRotation, this.grip.rotation);
    this.glassCameraRotation.transformVector(this.grip.position, this.graspWrist).add(this.glassCamera);
    this.handRotation.slerp(REST_HAND, this.graspRotation, pose.approach);
    this.wrist.lerp(REST_WRIST, this.step.add2(this.graspWrist, PRE_GRASP), pose.approach).lerp(this.wrist, this.graspWrist, pose.grasp);
    const swing = Math.sin(Math.PI * pose.approach) * (1 - pose.grasp);
    this.wrist.x += swing * 0.03; this.wrist.y += swing * 0.04;
    this.handCarrier.enabled = pose.handVisible;
    if (pose.handVisible) this.rig.pose(SHOULDER, this.wrist, this.handRotation, pose);
    this.liquidRotation.copy(this.fridge.glass.getRotation()).invert();
    this.liquidRotation.transformVector(Vec3.UP, this.liquidUp);
    this.fridge.setGlassWater(pose.fill, this.liquidUp.toArray());
    this.pose = pose; return pose;
  }

  returnGlass(rotation = this.fridge.glassShelfRotation) {
    this.fridge.frame.addChild(this.fridge.glass);
    this.fridge.glass.setPosition(this.fridge.glassShelfPosition); this.fridge.glass.setRotation(rotation);
  }

  finish() {
    if (!this.running) return false;
    this.returnGlass(); this.carried = false; this.handCarrier.enabled = false;
    this.fridge.setGlassWater(GLASS_EMPTY, 0); this.fridge.hasDrunk = true; this.fridge.drinkRunning = false;
    this.running = false; this.completed = true; this.time = DRINK_DURATION; this.audio.pause();
    this.player.yaw = this.savedYaw; this.player.pitch = this.savedPitch; this.holdPlayer();
    this.player.active = this.locked && !this.ownerDocument?.hidden;
    this.player.apply(0);
    this.onComplete(); return true;
  }

  destroy() {
    this.audio.pause(); this.ownerDocument?.removeEventListener('visibilitychange', this.onVisibility);
    this.handCarrier?.destroy();
    for (const [mi, previous] of this.glassVisibility) mi.isVisibleFunc = previous;
  }
}
