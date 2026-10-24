import { AnimClip, AnimEvaluator, Asset, DefaultAnimBinder, Entity, Mat4, Quat, Vec3 } from 'playcanvas';
import { DRINK_DURATION, DRINK_TIMING, sampleDrink } from './drink-timeline.js';

const HAND_URL = './assets/props/drinking-hand.glb';
const AUDIO = [
  { file: 'drink-water.wav', starts: [3.65, 4.40, 5.12], gain: 0.8 },
  { file: 'drink-relief.wav', starts: [DRINK_TIMING.relief], gain: 0.65 },
];
// The downloaded hand's root is normalized to wrist=0, fingers=+Y, thumb=-X.
// +Z is the back of the hand. This basis turns the right palm toward the glass,
// fingers away from the eye and the thumb upward. The source's own finger-rig
// animation supplies the cylindrical grip; no hand geometry is generated here.
const HAND_BASIS = new Mat4().set([0, -1, 0, 0, 0, 0, -1, 0, 1, 0, 0, 0, 0, 0, 0, 1]);
const HAND_ROTATION = new Quat().setFromMat4(HAND_BASIS);
const PALM_FROM_WRIST = new Vec3(0, 0.099, -0.013);
// The author's close clip makes a fist. These three local thumb rotations were
// fitted on that same rig to oppose the fingers around the 79 mm tumbler,
// rather than drive the thumb through the glass. Geometry/weights stay authored.
const THUMB_GRIP = [
  ['thumb_01.R_08', [-0.0711311245, -0.3398414864, 0.3502761405, 0.8699165205]],
  ['thumb_02.R_09', [0.2148195126, -0.2744761727, 0.0050699543, 0.9372778154]],
  ['thumb_03.R_010', [-0.1920009365, -0.0190442885, 0.2389467365, 0.9516708530]],
];

async function containerAsset(app) {
  return new Promise((resolve, reject) => {
    const asset = new Asset('Elena FF · Rigged hand · CC BY-SA 4.0', 'container', { url: new URL(HAND_URL, location.href).href, filename: 'drinking-hand.glb' });
    asset.once('load', () => resolve(asset.resource));
    asset.once('error', error => reject(new Error(`Drinking hand: ${error}`)));
    app.assets.add(asset); app.assets.load(asset);
  });
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
    const [container, audio] = await Promise.all([containerAsset(options.app), DrinkingAudio.create(options.sounds || options.fridge?.sounds)]);
    return new DrinkSequence({ ...options, container, audio });
  }

  constructor({ app, camera, player, fridge, interactions, configureMaterial,
    container, audio = new DrinkingAudio(), onStart = () => {}, onComplete = () => {},
    document: ownerDocument = globalThis.document, window: ownerWindow = globalThis.window,
    clock = () => performance.now() / 1000,
    reducedMotion = ownerWindow?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false }) {
    Object.assign(this, { app, camera, player, fridge, interactions, audio, onStart, onComplete, ownerDocument, clock, reducedMotion });
    this.running = false; this.completed = false; this.time = 0; this.lastTime = null; this.locked = false;
    this.carried = false; this.gripTime = 0.47;
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
    this.handCarrier = new Entity('right hand and forearm · drinking'); camera.addChild(this.handCarrier);
    this.hand = container.instantiateRenderEntity({ castShadows: false, receiveShadows: true });
    this.handCarrier.addChild(this.hand); this.handCarrier.enabled = false;
    for (const render of this.hand.findComponents('render')) {
      for (const mi of render.meshInstances) {
        mi.castShadow = false; mi.cull = true;
        mi.isVisibleFunc = cam => cam === this.playerCamera;
        // Preserve the downloaded skin albedo/normal/roughness maps and fine detail.
        if (!mi.material._drinkConfigured) { mi.material._drinkConfigured = true; configureMaterial?.(mi.material); }
      }
    }
    const track = container.animations[0]?.resource;
    if (!track) throw new Error('The downloaded hand is missing its authored finger animation');
    this.handClip = new AnimClip(track, 0, 0, false, false);
    this.handEvaluator = new AnimEvaluator(new DefaultAnimBinder(this.hand)); this.handEvaluator.addClip(this.handClip); this.handEvaluator.update(0);
    this.thumbJoints = THUMB_GRIP.flatMap(([name, rotation]) => {
      const node = this.hand.findByName(name);
      return node ? [{ node, open: node.getLocalRotation().clone(), target: new Quat(...rotation), blended: new Quat() }] : [];
    });
    this.glassInverse = new Mat4(); this.shelfLocal = new Vec3(); this.offset = new Vec3(); this.poseRotation = new Quat(); this.tiltRotation = new Quat();
    this.liquidRotation = new Quat(); this.liquidUp = new Vec3();
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
    this.savedYaw = this.player.yaw; this.savedPitch = this.player.pitch;
    this.reachDirection = new Vec3().sub2(this.fridge.glassShelfPosition, this.basePosition);
    this.reachDirection.y = 0; this.reachDirection.normalize().mulScalar(0.10);
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
    this.camera.setEulerAngles(this.baseRotation.x + head.headLift * Math.min(12, Math.max(0, -this.savedPitch + 2)), this.baseRotation.y, this.baseRotation.z);
    this.glassInverse.copy(this.camera.getWorldTransform()).invert();
    this.glassInverse.transformPoint(this.fridge.glassShelfPosition, this.shelfLocal);
    const pose = sampleDrink(time, { shelf: this.shelfLocal.toArray(), reducedMotion: this.reducedMotion });
    if (pose.carried !== this.carried) {
      this.carried = pose.carried;
      if (this.carried) {
        this.camera.addChild(this.fridge.glass);
      }
      else this.returnGlass();
    }
    if (pose.carried) {
      this.fridge.glass.setLocalPosition(...pose.glass);
      this.fridge.glass.setLocalEulerAngles(pose.tilt, 0, 0);
    }
    this.handCarrier.enabled = pose.handVisible;
    this.tiltRotation.setFromEulerAngles(pose.tilt, 0, 0);
    this.poseRotation.mul2(this.tiltRotation, HAND_ROTATION);
    this.poseRotation.transformVector(PALM_FROM_WRIST, this.offset);
    this.handCarrier.setLocalPosition(pose.hand[0] - this.offset.x, pose.hand[1] - this.offset.y, pose.hand[2] - this.offset.z);
    this.handCarrier.setLocalRotation(this.poseRotation);
    this.handClip.time = pose.grip * this.gripTime; this.handEvaluator.update(0);
    for (const joint of this.thumbJoints) {
      joint.blended.slerp(joint.open, joint.target, pose.grip); joint.node.setLocalRotation(joint.blended);
    }
    this.liquidRotation.copy(this.fridge.glass.getRotation()).invert();
    this.liquidRotation.transformVector(Vec3.UP, this.liquidUp);
    this.fridge.setGlassWater(pose.fill, this.liquidUp.toArray());
    this.pose = pose; return pose;
  }

  returnGlass() {
    this.fridge.frame.addChild(this.fridge.glass);
    this.fridge.glass.setPosition(this.fridge.glassShelfPosition); this.fridge.glass.setRotation(this.fridge.glassShelfRotation);
  }

  finish() {
    if (!this.running) return false;
    this.returnGlass(); this.carried = false; this.handCarrier.enabled = false;
    this.fridge.setGlassWater(0.037, 0); this.fridge.hasDrunk = true; this.fridge.drinkRunning = false;
    this.running = false; this.completed = true; this.time = DRINK_DURATION; this.audio.pause();
    this.player.yaw = this.savedYaw; this.player.pitch = this.savedPitch; this.holdPlayer();
    this.player.active = this.locked && !this.ownerDocument?.hidden;
    this.player.apply(0);
    this.onComplete(); return true;
  }

  destroy() {
    this.audio.pause(); this.ownerDocument?.removeEventListener('visibilitychange', this.onVisibility);
    this.handEvaluator?.removeClips(); this.handCarrier?.destroy();
    for (const [mi, previous] of this.glassVisibility) mi.isVisibleFunc = previous;
  }
}
