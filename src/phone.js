// The player's phone starts charged and ready on the south nightstand. Charging is optional; the later camera-alert
// reminder belongs to the story clock, independently of the charger and apartment power. Q raises it
// (held low in the right hand, its screen the only light it gives) and lowers it.
// Apps: the lock screen (time, battery, notifications), Home Cam (clips 00:47 and 02:58, LIVE: seccam.js), and the
// emergency call: the dispatcher's lines, the player's whispered answers (what they can say depends on what they found),
// a call-back if they hang up (a 12 m noise ringing, or a buzz during the hunt; silenced: hold Q).
// Screen: a canvas (drawn when something changes) on the model's screen, the video on its own quad in front of it. The
// copy on the nightstand shows the same canvas: dark until an optional charge or alert wakes its lock screen.
// The old boot/dead screens remain available for explicit developer/legacy cases, never as a pickup requirement.
import { Color, Entity, StandardMaterial, Texture, Vec2, Vec3, Quat, PIXELFORMAT_RGBA8, FILTER_LINEAR, ADDRESS_CLAMP_TO_EDGE, BLEND_NONE, BLEND_ADDITIVE,
  LIGHTFALLOFF_INVERSESQUARED, SHADOWUPDATE_REALTIME, MASK_AFFECT_DYNAMIC, MASK_AFFECT_LIGHTMAPPED } from 'playcanvas';
import { W, H, VIDEO, drawScreen, makeWallpaper } from './phone-screen.js';
import { ArmRig, frameRotation } from './arm-rig.js';
import { PhoneMotion } from './phone-motion.js';
import { HAND } from './phone-grip.js';
export { HAND } from './phone-grip.js';

// Where it lies: the south nightstand's top (0.57 m, measured), beside the alarm clock; its charger's socket behind it.
export const NIGHTSTAND = new Vec3(13.605, 0.572, 1.80);
const CHARGER = NIGHTSTAND;
export const CLIPS = [
  { id: '0047', time: '00:47', title: 'Motion · Bedroom', evidence: 'clip-0047' },
  { id: '0258', time: '02:58', title: 'Motion · Bedroom', evidence: 'clip-0258' },
];

// Shared by a new night and the chapter presets. Each night owns its notification array.
export function freshPhoneState({ has = false, onCharger = !has, pluggedIn = false } = {}) {
  return { has, charge: 100, booted: true, onCharger, pluggedIn, chargeTime: 0, silenced: false, notifications: [] };
}

export class Phone {
  constructor({ app, camera, interactions, bank, story, hud, seccam, clock }) {
    Object.assign(this, { app, camera, interactions, bank, story, hud, seccam, clock });
    this.chargerAt = CHARGER;
    // has: carried; onCharger: lying on the nightstand; pluggedIn: connected to its optional charger.
    Object.assign(this, freshPhoneState());
    this.booting = null;              // seconds into the boot (its logo), until the lock screen comes up
    this.lit = 0;                     // lying on the nightstand: seconds its screen stays lit (a buzz, the charger, the boot)
    this.raised = false; this.raiseK = 0; this.app_ = 'lock'; this.sel = 0; this.dirty = true;
    this.call = null;
    this.canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
    this.g = this.canvas.getContext('2d');
    // The screen's look (phone-screen.js): its wallpaper, made once, and the clips' thumbnails (loaded with the clips).
    this.wallpaper = makeWallpaper();
    this.thumbs = {}; this.durations = {};
    this.loadThumbs();
    this.texture = new Texture(app.graphicsDevice, { width: W, height: H, format: PIXELFORMAT_RGBA8, mipmaps: false,
      minFilter: FILTER_LINEAR, magFilter: FILTER_LINEAR, addressU: ADDRESS_CLAMP_TO_EDGE, addressV: ADDRESS_CLAMP_TO_EDGE, name: 'phone-screen' });
    this.buildHolder();
    this.buildScreenLight();
    this.buildStandGlow(CHARGER);
    this.chargerItem = interactions.add({ pos: CHARGER, size: 0.18, active: () => this.has && !this.onCharger,
      label: () => 'Put the phone on charge', use: () => this.putOnCharger() });
    this.takeItem = interactions.add({ pos: CHARGER, size: 0.18, active: () => this.onCharger,
      label: () => `Take the phone${this.booted ? ` · ${Math.floor(this.charge)} %` : ''}`, use: () => this.takeFromCharger() });
    this.bindInput();
    app.on('update', dt => this.update(this.paused?.() ? 0 : dt));   // paused (main.js): it waits
  }

  bindInput() {
    this.qDown = null;
    const available = () => document.pointerLockElement === this.app.graphicsDevice.canvas && !this.blocked?.();
    const usable = () => available() && this.has && this.raised && this.raiseK >= 0.6;
    const release = () => { this.qDown = null; };
    window.addEventListener('blur', release);
    document.addEventListener('pointerlockchange', release);
    // blocked (main.js): not while paused, reading, caught or in an ending.
    window.addEventListener('keydown', (e) => {
      if (!available() || e.repeat) return;
      if (e.code === 'KeyQ') { this.qDown = performance.now(); }
      if (!usable()) return;
      if (e.code === 'Enter') { e.preventDefault?.(); this.choose(this.sel); }
      if (e.code === 'Backspace') { e.preventDefault?.(); this.back(); }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code !== 'KeyQ') return;
      if (this.qDown === null || !available()) { release(); return; }
      const held = performance.now() - this.qDown; release();
      if (held > 700 && this.has) { this.silenced = !this.silenced; if (this.silenced) this.stopCallAudio(); this.hud?.toast(this.silenced ? 'Phone silenced' : 'Phone sound on'); this.dirty = true; return; }
      this.toggle();
    });
    window.addEventListener('wheel', (e) => { if (usable()) { e.preventDefault?.(); this.move(Math.sign(e.deltaY)); } }, { passive: false });
    // While it is up the mouse buttons are the phone's (interact.js is disabled meanwhile, main.js).
    window.addEventListener('mousedown', (e) => {
      if (!usable()) return;
      if (e.button === 0) this.choose(this.sel);
      if (e.button === 2) this.back();
    });
  }

  // --- the object in the hand ----------------------------------------------------------------------------------
  buildHolder() {
    this.holder = new Entity('phone held');
    this.camera.addChild(this.holder);
    this.holder.enabled = false;
    // Body: the downloaded model when it is set (setModel); until then a plain slab so the screen has a frame.
    this.body = new Entity('phone body');
    const bodyMat = new StandardMaterial(); bodyMat.diffuse = new Color(0.02, 0.02, 0.022); bodyMat.useMetalness = true; bodyMat.metalness = 0.6; bodyMat.gloss = 0.75; bodyMat.update();
    this.body.addComponent('render', { type: 'box', material: bodyMat, castShadows: false, receiveShadows: false });
    this.body.setLocalScale(0.0716, 0.1475, 0.0078);
    this.holder.addChild(this.body);
    const screenMat = new StandardMaterial();
    screenMat.diffuse = Color.BLACK; screenMat.emissive = Color.WHITE; screenMat.emissiveMap = this.texture; screenMat.emissiveIntensity = 1.1;
    screenMat.useLighting = false; screenMat.blendType = BLEND_NONE; screenMat.update();
    this.screenMat = screenMat;
    this.screen = new Entity('phone screen');
    this.screen.addComponent('render', { type: 'plane', material: screenMat, castShadows: false, receiveShadows: false });
    this.screen.setLocalEulerAngles(90, 0, 0);
    this.screen.setLocalScale(0.0664, 1, 0.1438);
    this.screen.setLocalPosition(0, 0, 0.0041);
    this.holder.addChild(this.screen);
    // The video (a clip frame or the live camera) on its own quad over the screen's video area.
    const videoMat = new StandardMaterial();
    // It always has a texture (the camera's infrared target until a clip or LIVE sets its own): a map added later would
    // be a new shader variant, built mid-game.
    videoMat.diffuse = Color.BLACK; videoMat.emissive = Color.WHITE; videoMat.useLighting = false;
    if (this.seccam?.ir) videoMat.emissiveMap = this.seccam.ir;
    videoMat.update();
    this.videoMat = videoMat;
    this.video = new Entity('phone video');
    this.video.addComponent('render', { type: 'plane', material: videoMat, castShadows: false, receiveShadows: false });
    this.video.setLocalEulerAngles(90, 0, 0);
    this.fitVideo({ x0: -0.0332, x1: 0.0332, y0: -0.0719, y1: 0.0719, z: 0.0041 });
    this.video.enabled = false;
    this.holder.addChild(this.video);
    for (const e of [this.body, this.screen, this.video]) for (const mi of e.render.meshInstances) mi.isVisibleFunc = cam => cam === this.camera.camera.camera;
  }

  // The downloaded phone (props.js 'phone') replaces the slab: its own screen mesh shows the screen canvas (the
  // canvas fills the screen's UV rectangle). A copy of it lies on the nightstand while it is there (main.js), its screen
  // the same canvas.
  setModel(entity) {
    this.body.enabled = false;
    this.holder.addChild(entity);
    for (const r of entity.findComponents('render')) for (const mi of r.meshInstances) mi.isVisibleFunc = cam => cam === this.camera.camera.camera;
    const screen = this.useScreen(entity);
    if (screen) { this.screen.enabled = false; this.fitVideo(this.screenRect(screen)); }
  }

  // The video quad over phone-screen.js's VIDEO rectangle, on a screen whose canvas spans `r` (holder space: x0..x1 left
  // to right, y1 at the top, z the glass).
  fitVideo(r) {
    const sx = (r.x1 - r.x0) / W, sy = (r.y1 - r.y0) / H;
    this.video.setLocalPosition(r.x0 + (VIDEO.x + VIDEO.w / 2) * sx, r.y1 - (VIDEO.y + VIDEO.h / 2) * sy, r.z + 0.0002);
    this.video.setLocalScale(VIDEO.w * sx, 1, VIDEO.h * sy);
  }

  // A mesh instance's bounds in the holder's space (the model's screen: where its canvas is).
  screenRect(mi) {
    const pos = [], n = mi.mesh.getPositions(pos), p = new Vec3(), min = new Vec3(Infinity, Infinity, Infinity), max = new Vec3(-Infinity, -Infinity, -Infinity);
    const m = this.holder.getWorldTransform().clone().invert().mul(mi.node.getWorldTransform());
    for (let i = 0; i < n * 3; i += 3) { m.transformPoint(p.set(pos[i], pos[i + 1], pos[i + 2]), p); min.min(p); max.max(p); }
    return { x0: min.x, x1: max.x, y0: min.y, y1: max.y, z: max.z };
  }

  // Puts the screen canvas on a phone model's own screen mesh (material 'Lock_Screen'); returns it (null if none). intensity:
  // the copy lying on the nightstand glows brighter than the one held up to your face (its own material, same shader).
  useScreen(entity, { intensity = null } = {}) {
    const mi = entity.findComponents('render').flatMap(r => r.meshInstances).find(m => /^Lock_Screen/.test(m.material.name));
    if (!mi) return null;
    if (!this.modelScreenMat) {
      const m = this.screenMat.clone();
      // The canvas fills the screen: the build gives the screen planar UVs 0..1, v 0 at the top (tools/props/build.mjs).
      m.emissiveMapTiling = new Vec2(1, 1); m.emissiveMapOffset = new Vec2(0, 0);
      m.update();
      this.modelScreenMat = m;
    }
    if (intensity === null) { mi.material = this.modelScreenMat; return mi; }
    const own = this.modelScreenMat.clone(); own.emissiveIntensity = intensity; own.update();
    mi.material = own;
    return mi;
  }

  // A copy of the first-person arm (drink-sequence.js armContainer) holds it: shown with the phone, posed every frame.
  setHand(entity, data, configure) {
    this.handCarrier = new Entity('first-person right arm · phone');
    this.camera.addChild(this.handCarrier);
    this.handCarrier.addChild(entity);
    const playerCamera = this.camera.camera.camera;
    for (const r of entity.findComponents('render')) for (const mi of r.meshInstances) {
      mi.castShadow = false; mi.isVisibleFunc = cam => cam === playerCamera;
      if (!mi.material._phoneConfigured) { mi.material._phoneConfigured = true; configure?.(mi.material); }
    }
    this.rig = new ArmRig(entity, data);
    this.handPalm = new Vec3(...data.wristToPalm);
    this.handLocal = frameRotation(new Vec3(0, 1, 0), new Vec3(0, 0, -1), HAND.fingers.clone().normalize(), HAND.facing.clone().normalize());
    this.handCarrier.enabled = false;
  }

  poseHand() {
    if (!this.rig) return;
    this.handCarrier.enabled = this.holder.enabled;
    if (!this.holder.enabled) return;
    const at = this.holder.getLocalPosition(), turn = this.holder.getLocalRotation();
    const rotation = (this._handRot ||= new Quat()).mul2(turn, this.handLocal);
    // The wrist: where the palm must be, less the palm's offset from the wrist in the hand's frame.
    const palm = turn.transformVector(HAND.palm, (this._palm ||= new Vec3())).add(at);
    const wrist = rotation.transformVector(this.handPalm, (this._wrist ||= new Vec3())).mulScalar(-1).add(palm);
    this.rig.pose(HAND.shoulder, wrist, rotation, { grip: HAND.grip });
    for (const finger of this.rig.fingers) {
      const q = HAND.joints[finger.node.name];
      if (q) finger.node.setLocalRotation(...q);
    }
  }

  // The screen's own light (build 0.15): a small cold spot just in front of the glass, shining out of it, so the thumb
  // and fingers round the phone (and a wall a few centimetres away) are lit by the screen, as they are in the dark. A
  // light in the hand like the torch's: the player's view only (never a probe capture: the lightmapped bit, probes.js),
  // shadowed like every light here (fixShadowAtlas counts it: made before it runs), realtime, lit only while the screen
  // in the hand is on. `warmLight` (main.js warm-up): on, faintly, so its shaders are built at loading.
  buildScreenLight() {
    this.screenLight = new Entity('phone screen light');
    this.screenLight.addComponent('light', { type: 'spot', color: new Color(0.72, 0.8, 1), intensity: 0, range: 0.9,
      innerConeAngle: 45, outerConeAngle: 80, falloffMode: LIGHTFALLOFF_INVERSESQUARED, castShadows: true, shadowResolution: 256,
      shadowBias: 0.05, normalOffsetBias: 0.004, shadowUpdateMode: SHADOWUPDATE_REALTIME, enabled: false,
      mask: MASK_AFFECT_DYNAMIC | MASK_AFFECT_LIGHTMAPPED });
    this.screenLight.setLocalPosition(0, 0, 0.035);
    this.screenLight.setLocalEulerAngles(-90, 0, 0);          // a spot shines along its -Y: out of the screen (+Z)
    this.holder.addChild(this.screenLight);
  }

  updateScreenLight() {
    if (!this.screenLight) return;
    const on = this.holder.enabled && this.booted && this.booting === null;
    const level = this.warmLight ? 0.01 : on ? 0.55 * Math.min(1, this.raiseK * 1.4) : 0;
    const l = this.screenLight.light;
    if (l.enabled !== level > 0) l.enabled = level > 0;
    l.intensity = level;
  }

  // --- state ---------------------------------------------------------------------------------------------------
  // Charging: on the nightstand, its charger back in the wall, and the bedroom's sockets live.
  get charging() { return this.onCharger && this.pluggedIn && !!(this.power ? this.power.live('bed') : true); }

  // Taken in hand, ready to use even while the apartment's circuits are off.
  take() {
    this.has = true; this.onCharger = false; this.dirty = true;
    this.charger?.(false);
    this.hud?.prompt('Q', 'Phone', 5);
  }

  putOnCharger() {
    this.has = false; this.onCharger = true; this.raised = false;
    if (this.app_ === 'clip' || this.app_ === 'live') this.seccam?.stopLive?.();
    if (!this.call) { this.app_ = 'lock'; this.video.enabled = false; }      // put down, it locks
    this.bank?.play('blanket', { at: CHARGER, gain: 0.3 });
    if (!this.pluggedIn) {
      this.pluggedIn = true;
      this.bank?.play('latch_2', { at: [CHARGER.x + 0.35, 0.3, CHARGER.z], gain: 0.25, rate: 1.6 });
      this.story?.phoneCharging?.();
    }
    this.charger?.(true);
    this.wake(this.booted ? 8 : 5);
  }

  // Lights the screen of the phone lying on the nightstand for `seconds` (it is redrawn now, and dark again after).
  wake(seconds) { this.lit = Math.max(this.lit, seconds); this.dirty = true; }

  takeFromCharger() {
    this.bank?.play('blanket', { at: CHARGER, gain: 0.3 });
    this.take();
    this.story?.phoneTaken?.(this);
  }

  // Explicit legacy/developer boot animation. Ordinary new nights and migrated saves are already booted.
  boot({ now = false } = {}) {
    if (this.booted) return;
    if (!now && this.booting === null) { this.booting = 0; this.wake(4); this.dirty = true; return; }
    this.booting = null;
    this.booted = true; this.charge = Math.max(this.charge, 4);
    if (this.app_ === 'dead') this.app_ = 'lock';       // held up while it started: the lock screen now
    this.notifyAlerts();
    this.dirty = true;
  }

  notifyAlerts() {
    if (this.story?.has('alerts')) return;
    this.notifications = CLIPS.map(c => ({ ...c, unread: !this.story?.sys?.journal?.has(c.evidence) }));
    this.wake(20); this.buzz(3);
    this.story?.set('alerts');
    this.story?.phoneBooted?.();
    this.dirty = true;
  }

  // n buzzes (a phone on a wooden nightstand buzzes hard against it; in a pocket, softer). A noise for him if he is near.
  buzz(n = 1) {
    if (this.silenced) return [];
    const at = this.onCharger ? CHARGER : null;
    if (at) this.wake(12);
    const handles = [];
    for (let i = 0; i < n; i++) handles.push(this.bank?.play('phone_buzz', { at, gain: at ? 1.0 : 0.5, delay: i * 1.1, send: 0.2, min: at ? 0.35 : 0 }));
    this.noise?.(at ? at.x : null, at ? at.z : null, 'buzz');      // a buzz carries 4 m, a ringtone 12
    return handles;
  }

  toggle() {
    if (!this.has || this.onCharger) return;
    this.raised = !this.raised;
    this.bank?.play('blanket', { gain: 0.25 });
    // Raised again it shows what it showed (Home Cam, LIVE reconnecting), unless a call came in meanwhile.
    if (this.raised) {
      if (!this.booted) this.app_ = 'dead';
      else if (this.call) this.app_ = 'call';
      else if (this.app_ === 'live') this.openLive();
      else if (this.app_ === 'clip') this.app_ = 'cam';
      else if (this.app_ !== 'cam') this.app_ = 'lock';
      this.sel = 0;
    } else if (this.app_ === 'live' || this.app_ === 'clip') { this.seccam?.stopLive(); this.video.enabled = false; }
    this.dirty = true;
  }

  move(d) { const n = this.options().length; if (n) { this.sel = (this.sel + d + n) % n; this.dirty = true; } }
  back() {
    if (this.app_ === 'call' && this.call) this.hangUp();
    else if (this.app_ === 'clip' || this.app_ === 'live') { this.seccam?.stopLive(); this.app_ = 'cam'; this.video.enabled = false; }
    else if (this.app_ === 'cam') this.app_ = 'lock';
    this.sel = 0; this.dirty = true;
  }

  // The choices on the current screen: [label, action].
  options() {
    if (!this.booted) return [];
    if (this.app_ === 'lock') return [['Home Cam', () => { this.app_ = 'cam'; this.sel = 0; }], ['Emergency call', () => this.dial()]];
    if (this.app_ === 'cam') return [...CLIPS.map(c => [`${c.time}  ${c.title}`, () => this.playClip(c),
      { id: c.id, time: c.time, unread: !!this.notifications.find(n => n.id === c.id)?.unread, duration: this.durations[c.id] }]),
    ['LIVE  Bedroom', () => this.openLive(), { live: true, id: '0258' }]];
    if (this.app_ === 'call' && this.call?.choices) {
      const choices = this.call.choices.map(c => [c.text, () => this.answer(c)]);
      return this.call.incoming ? choices : [...choices, ['Hang up', () => this.hangUp()]];
    }
    if (this.app_ === 'call') return [['Hang up', () => this.hangUp()]];
    return [];
  }

  choose(i) { const o = this.options()[i]; if (o) { this.sel = i; o[1](); this.dirty = true; this.bank?.play('latch_2', { gain: 0.08, rate: 2.2 }); } }

  playClip(c) {
    this.app_ = 'clip'; this.clip = { ...c, t: 0 };
    const n = this.notifications.find(x => x.id === c.id); if (n) n.unread = false;
    this.video.enabled = true;
    this.seccam?.playClip(c.id, this.videoMat);
    this.story?.sys.journal?.find(c.evidence);
    if (c.id === '0258' && !this.saidIsThatMe) { this.saidIsThatMe = true; this.story?.after(9, () => this.story.say('...Is that me?')); }
  }

  openLive() {
    this.app_ = 'live'; this.video.enabled = true;
    this.seccam?.startLive(this.videoMat, () => this.story?.where() === 'bedroom');
  }

  // --- the emergency call ----------------------------------------------------------------------------------------
  // Dialogue and automatic hangups belong to one call. The player may redial
  // before they fire; an abandoned call must not speak into or end its successor.
  afterCall(call, seconds, fn, id = null) {
    this.story?.after(seconds, () => { if (this.call === call) fn(); }, id);
  }

  stopCallAudio() {
    for (const handle of this.callAudio || []) handle?.stop?.();
    this.callAudio = [];
  }

  callSound(key, options) {
    (this.callAudio ||= []).push(this.bank?.play(key, options));
  }

  dial() {
    if (this.charge < 1) return;
    this.stopCallAudio();
    this.seccam?.stopLive?.(); this.video.enabled = false;
    this.story?.cancel?.('callback');
    this.app_ = 'call'; this.sel = 0;
    this.callSound('phone_dial', { gain: 0.3 });
    this.callSound('phone_static', { gain: 0.2, delay: 1.6 });
    const call = this.call = { t: 0, line: 'Calling 112…', choices: null, step: 0 };
    this.afterCall(call, 3.2, () => this.dispatcher('112. What’s your emergency?', this.firstChoices()), 'call');
    this.noise?.(null, null, 'walk');
  }

  firstChoices() {
    const s = this.story, choices = [{ text: '"There’s someone in my flat."', id: 'someone' }];
    if (s?.has('nest-seen')) choices.push({ text: '"He’s in the ceiling. Above my wardrobe."', id: 'where' });
    if (s?.sys.journal?.has('notice') && s?.has('old-key')) choices.push({ text: '"It’s the man they evicted. From 5B."', id: 'who' });
    // Before the man has been seen, all there is to say is a broken glass.
    if (!s?.has('silhouette') && !s?.has('hunt')) choices.splice(0, 1, { text: s?.has('glass') ? '"A glass broke. I think someone’s here."' : '"I thought I heard someone in my flat."', id: 'unsure' });
    return choices;
  }

  dispatcher(text, choices = null) {
    if (!this.call) return;
    if (!this.call.connected) { this.call.connected = true; this.call.t = 0; }    // the call's clock runs from the answer
    this.call.line = text; this.call.choices = choices; this.sel = 0; this.dirty = true;
    this.story?.sys.hud?.voice('Dispatcher', text);
    this.bank?.play('phone_static', { gain: 0.12 });
  }

  answer(choice) {
    const call = this.call, s = this.story;
    this.sel = 0;
    this.stopCallAudio();
    if (choice.id === 'decline') { this.incoming = false; this.hangUp(true); return; }   // they will not call again
    // The dispatcher calling back: answering connects the call; what was said before still stands (story.js).
    if (choice.id === 'answer') {
      call.incoming = false; call.choices = null; call.sent = true; this.incoming = false; this.dirty = true;
      const remaining = this.firstChoices().filter(c => c.id !== 'unsure' && !(c.id === 'where' && s?.told?.where) && !(c.id === 'who' && s?.told?.who));
      this.afterCall(call, 1.2, () => this.dispatcher('Emergency services, you called us. Are you safe? Officers are on their way. Stay quiet.', remaining.length ? remaining : null));
      return;
    }
    call.told ||= {};
    call.told[choice.id] = true;
    this.story?.sys.hud?.voice('You (whispering)', choice.text.replace(/"/g, ''));
    this.noise?.(null, null, 'crouch');
    call.choices = null; this.dirty = true;
    if (choice.id === 'unsure' && !s?.has('hunt')) {
      this.afterCall(call, 2.5, () => this.dispatcher('Is anyone hurt? ...If you think someone is in the property, get out if you can, and call us back.'));
      this.afterCall(call, 9, () => this.hangUp(true));
      return;
    }
    const remaining = this.firstChoices().filter(c => !call.told[c.id] && c.id !== 'unsure');
    if (!call.sent) {
      call.sent = true;
      s?.after(2.6, () => {
        if (this.call === call) this.dispatcher('Officers are on their way. Two minutes. Stay on the line if you can. Is there somewhere you can hide?', remaining.length ? remaining : null);
        // The information was already given: dispatch still happens if the
        // player hangs up, independently of the abandoned call's screen.
        s?.policeCalled({ where: call.told.where, who: call.told.who });
      });
    } else {
      s?.after(2, () => { if (this.call === call) this.dispatcher(choice.id === 'where' ? 'In the ceiling. Okay. I’ve told them.' : 'Okay. I’ve passed that on.', remaining.length ? remaining : null); s?.policeCalled({ where: call.told.where, who: call.told.who }); });
    }
  }

  hangUp(theyDid = false) {
    if (!this.call) return;
    this.stopCallAudio();
    const sent = this.call.sent;
    this.call = null; this.app_ = 'lock'; this.sel = 0; this.dirty = true;
    this.story?.cancel?.('call'); this.story?.cancel?.('callback');
    this.bank?.play('latch_2', { gain: 0.1, rate: 1.8 });
    // Real dispatchers call back.
    if (sent && !theyDid) this.story?.after(14, () => this.ring(), 'callback');
  }

  ring() {
    if (this.call || this.story?.has('ended')) return;
    this.stopCallAudio();
    this.seccam?.stopLive?.(); this.video.enabled = false;
    this.story?.cancel?.('call'); this.story?.cancel?.('callback');
    this.incoming = true; this.app_ = 'call'; this.sel = 0;
    this.call = { t: 0, line: 'Incoming call · Emergency services', choices: [{ text: 'Answer', id: 'answer' }, { text: 'Decline', id: 'decline' }], incoming: true };
    // During the hunt the phone is on vibrate: a ringtone then would be a death sentence nobody could have seen coming.
    if (!this.silenced && !this.story?.has('hunt')) {
      for (let i = 0; i < 3; i++) this.callSound('phone_ring', { gain: 0.6, delay: i * 5.4, at: this.onCharger ? CHARGER : null });
      this.noise?.(null, null, 'phone');
    } else this.callAudio.push(...this.buzz(2));
    if (this.onCharger) this.wake(16);
    this.dirty = true;
  }

  // The light its screen throws on the nightstand while it is lit there: no lamp (a shadowed light would change the
  // fixed shadow atlas), an additive glow on the wood like the light under the bathroom door; red for the battery
  // glyph, white for the boot, cold for the lock screen. Kept out of the probes.
  buildStandGlow(at) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, '#fff'); grad.addColorStop(0.22, 'rgb(150,150,150)'); grad.addColorStop(0.55, 'rgb(38,38,38)'); grad.addColorStop(1, '#000');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    const tex = new Texture(this.app.graphicsDevice, { width: 64, height: 64, format: PIXELFORMAT_RGBA8, mipmaps: true, name: 'phone-glow',
      addressU: ADDRESS_CLAMP_TO_EDGE, addressV: ADDRESS_CLAMP_TO_EDGE });
    tex.setSource(c);
    const m = new StandardMaterial(); m.name = 'phone screen glow';
    m.diffuse = Color.BLACK; m.emissive = new Color(0.62, 0.74, 1); m.emissiveMap = tex; m.emissiveIntensity = 0;
    m.useLighting = false; m.blendType = BLEND_ADDITIVE; m.depthWrite = false; m.update();
    this.standGlowMat = m;
    this.standGlow = new Entity('phone screen glow');
    this.standGlow.addComponent('render', { type: 'plane', material: m, castShadows: false, receiveShadows: false });
    for (const mi of this.standGlow.render.meshInstances) mi.isVisibleFunc = cam => !cam.node?.name?.startsWith('probe-') && cam.frustum.containsAabb(mi.aabb);
    // The top's west edge is at x 13.51 (measured): centred a little east of the phone, small enough to stay on it.
    this.standGlow.setPosition(at.x + 0.055, at.y + 0.001, at.z); this.standGlow.setLocalScale(0.38, 1, 0.38);
    this.standGlowAt = this.standGlow.getPosition().clone();
    this.standGlow.enabled = false;
    this.app.root.addChild(this.standGlow);
    this.glowK = 0; this.glowLvl = -1;
  }

  // The shader warm-up (main.js): the glow on view for the sweep; returns the undo.
  revealGlow() {
    this.warming = true; this.glowLvl = -1;
    return () => { this.warming = false; this.glowLvl = -1; this.standGlow.setPosition(this.standGlowAt); this.updateGlow(0); };
  }

  updateGlow(dt) {
    if (!this.standGlow) return;
    const on = this.onCharger && this.lit > 0 && (this.booting !== null || this.booted || this.charging);
    this.glowK += ((on ? 1 : 0) - this.glowK) * (1 - Math.exp(-dt * 8));
    const lvl = this.glowK < 0.003 ? 0 : this.glowK;
    if (Math.abs(lvl - this.glowLvl) < 0.004) return;
    this.glowLvl = lvl;
    const red = !this.booted && this.booting === null, logo = this.booting !== null;
    this.standGlowMat.emissive.set(...(red ? [1, 0.12, 0.1] : logo ? [0.9, 0.9, 0.92] : [0.62, 0.74, 1]));
    this.standGlowMat.emissiveIntensity = Math.max(this.warming ? 0.001 : 0, lvl * (red ? 0.14 : logo ? 0.32 : 0.48));
    this.standGlowMat.update();
    this.standGlow.enabled = lvl > 0 || !!this.warming;
  }

  // --- per frame ---------------------------------------------------------------------------------------------------
  update(dt) {
    dt = Math.max(0, Math.min(dt, 0.1));
    this.updateGlow(dt);
    if (this.charging) {
      this.chargeTime += dt;
      if (this.booted) this.charge = Math.min(100, this.charge + dt * 0.05);
      else if (this.booting === null && this.charge >= 1) this.boot();
    }
    if (this.booting !== null) {
      this.booting += dt;
      if (Math.floor(this.booting * 3) !== this.bootStep) { this.bootStep = Math.floor(this.booting * 3); this.dirty = true; }   // the dots
      if (this.booting >= 3) this.boot({ now: true });
    }
    if (this.lit > 0 && (this.lit -= dt) <= 0) { this.lit = 0; this.dirty = true; }
    if (this.call && !this.call.incoming) this.call.t = (this.call.t ?? 0) + dt;
    // Holding it: rises into the lower right of the view; lowered, out of sight.
    this.raiseK += ((this.raised ? 1 : 0) - this.raiseK) * (1 - Math.exp(-dt * 9));
    this.holder.enabled = this.raiseK > 0.02;
    if (this.holder.enabled) {
      const pose = (this.handMotion ||= new PhoneMotion()).update(dt, {
        ...this.motion?.(), watch: this.app_ === 'clip' || this.app_ === 'live',
      });
      const lower = 1 - this.raiseK;
      this.holder.setLocalPosition(pose.x + lower * 0.025, pose.y - lower * 0.24, pose.z + lower * 0.035);
      this.holder.setLocalEulerAngles(pose.pitch + lower * 28, pose.yaw + lower * 7, pose.roll - lower * 10);
    }
    this.poseHand();
    this.updateScreenLight();
    // Screens that change by themselves (a clip's time, LIVE's status, a call's line) redraw a few times a second, not
    // every frame: the canvas is a 540x1170 upload.
    if (this.raised && (this.app_ === 'clip' || this.app_ === 'live' || this.app_ === 'call')) {
      this.redrawT = (this.redrawT || 0) + dt;
      if (this.redrawT > 0.2) { this.redrawT = 0; this.dirty = true; }
    }
    // The lock screen's clock/battery must also advance while held or lit on wood.
    if (this.holder.enabled || this.lit > 0) {
      const stamp = `${Math.floor((this.clock?.now() ?? new Date()).getTime() / 60000)}:${Math.floor(this.charge)}`;
      if (stamp !== this.screenStamp) { this.screenStamp = stamp; this.dirty = true; }
    }
    if (this.dirty && (this.holder.enabled || this.onCharger)) { this.draw(); this.dirty = false; }
  }

  get glowing() { return this.raised && this.booted; }

  // --- the screen ----------------------------------------------------------------------------------------------
  // The clips' thumbnails: a frame from the middle of each (the clip's own canvas is the video's, so a copy).
  async loadThumbs() {
    for (const c of CLIPS) {
      try {
        const clip = await this.seccam?.loadClip?.(c.id);
        if (!clip?.img?.naturalWidth) continue;             // a missing still: the row shows without its thumbnail
        const { w, h, cols, frames, fps } = clip.meta, frame = Math.floor(frames * 0.6);
        const t = Object.assign(document.createElement('canvas'), { width: w, height: h });
        t.getContext('2d').drawImage(clip.img, (frame % cols) * w, Math.floor(frame / cols) * h, w, h, 0, 0, w, h);
        this.thumbs[c.id] = t; this.durations[c.id] = frames / fps;
        this.dirty = true;
      } catch (error) { console.warn(`phone: no thumbnail for ${c.id}`, error); }
    }
  }

  // What the screen shows now, for phone-screen.js.
  screenState() {
    const now = this.clock ? this.clock.now() : new Date();
    let mode = this.app_;
    if (this.onCharger && !this.holder.enabled && this.lit <= 0) mode = 'off';
    else if (this.booting !== null) mode = 'boot';
    else if (!this.booted) mode = 'dead';
    const ago = (time) => {
      const [h, m] = time.split(':').map(Number), mins = Math.max(1, Math.round((now.getHours() * 60 + now.getMinutes()) - (h * 60 + m)));
      return mins >= 60 ? `${Math.floor(mins / 60)}h ago` : `${mins}m ago`;
    };
    const clip = this.seccam?.clip, call = this.call;
    return {
      mode, time: now, charge: Math.floor(this.charge), charging: this.charging, silenced: this.silenced, held: this.holder.enabled,
      bars: 1 + (this.charge > 2 ? 1 : 0), boot: this.booting ?? 0, thumbs: this.thumbs,
      notifications: this.notifications.map(n => ({ ...n, ago: ago(n.time) })),
      options: this.holder.enabled ? this.options() : [], sel: this.sel,
      clip: this.clip ? { ...this.clip, t: clip?.t ?? 0, duration: this.durations[this.clip.id] ?? (clip ? clip.c.meta.frames / clip.c.meta.fps : 4) } : null,
      live: { status: this.seccam?.liveStatus?.() || '8 s delay' },
      call: call ? { line: call.line, incoming: !!call.incoming, connected: !!call.connected, t: call.t ?? 0 } : null,
    };
  }

  draw() {
    drawScreen(this.g, this.screenState(), this.wallpaper);
    this.texture.setSource(this.canvas);
  }

  save() { return { has: this.has, charge: this.charge, booted: this.booted, onCharger: this.onCharger, pluggedIn: this.pluggedIn, chargeTime: this.chargeTime, silenced: this.silenced, notifications: this.notifications }; }
  load(s) {
    if (!s) return;
    this.stopCallAudio();
    this.seccam?.stopLive?.();
    Object.assign(this, s);
    // Migrate pre-0.17 checkpoints: continuing an old night must not require charging either.
    if (!this.booted || !Number.isFinite(this.charge) || this.charge < 1) { this.booted = true; this.charge = 100; }
    this.booting = null; this.lit = 0; this.raised = false; this.raiseK = 0; this.watchK = 0;
    this.handMotion = new PhoneMotion();
    this.call = null; this.incoming = false; this.clip = null; this.qDown = null; this.sel = 0;
    this.app_ = 'lock'; this.dirty = true; this.holder.enabled = false; this.video.enabled = false;
    if (this.handCarrier) this.handCarrier.enabled = false;
    this.updateScreenLight();
    this.charger?.(this.onCharger);
  }
}
