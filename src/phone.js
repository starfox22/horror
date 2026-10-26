// The player's phone (docs/STORY.md): it lies dead on the south nightstand, its charger pulled out of the wall. Taking it
// shows it is dead; putting it back plugs the charger in, and it charges there while the bedroom's sockets have power.
// A flat phone needs minutes on the charger before it can start: it boots in Act III, once the power is back (story.js
// times the buzz after the quiet), and buzzes hard against the nightstand with the camera alerts it missed. Q raises it
// (held low in the right hand, its screen the only light it gives) and lowers it.
// Apps: the lock screen (time, battery, notifications), Home Cam (clips 00:47 and 02:58, LIVE: seccam.js), and the
// emergency call: the dispatcher's lines, the player's whispered answers (what they can say depends on what they found),
// a call-back if they hang up (a 12 m noise ringing, or a buzz during the hunt; silenced: hold Q).
// Screen: a canvas (drawn when something changes) on the model's screen, the video on its own quad in front of it. The
// copy on the nightstand shows the same canvas: dark, except for a while after something wakes it (plugged in: the
// empty-battery glyph; booting: its logo; an alert: the lock screen), like a real phone lying face up.
import { Color, Entity, StandardMaterial, Texture, Vec2, Vec3, Quat, PIXELFORMAT_RGBA8, FILTER_LINEAR, ADDRESS_CLAMP_TO_EDGE, BLEND_NONE, BLEND_ADDITIVE,
  LIGHTFALLOFF_INVERSESQUARED, SHADOWUPDATE_REALTIME, MASK_AFFECT_DYNAMIC, MASK_AFFECT_LIGHTMAPPED } from 'playcanvas';
import { W, H, VIDEO, drawScreen, makeWallpaper } from './phone-screen.js';
import { ArmRig, frameRotation } from './arm-rig.js';

// The hand that holds it (build 0.15, the owner: "the smartphone does not look good on my hand"): the drinking arm's
// model again (arm-rig.js), in the phone's own frame (x right, y up, z out of the screen; origin its centre). As a
// right hand holds a phone: the palm against its back, right of centre and near the bottom; the fingers across the back
// towards its left edge, curling round it (grip); the thumb (the rig's -X at rest) up along its right edge. The shoulder
// is where the drinking arm's is (drink-sequence.js SHOULDER, camera space).
export const HAND = {
  palm: new Vec3(0.024, -0.058, -0.0068), fingers: new Vec3(-1, 0.12, 0), facing: new Vec3(0, 0, 1), grip: 0.5,
  shoulder: new Vec3(0.19, -0.25, 0.09),
};

// Where it lies: the south nightstand's top (0.57 m, measured), beside the alarm clock; its charger's socket behind it.
export const NIGHTSTAND = new Vec3(13.605, 0.572, 1.80);
const CHARGER = NIGHTSTAND;
export const CLIPS = [
  { id: '0047', time: '00:47', title: 'Motion · Bedroom', evidence: 'clip-0047' },
  { id: '0258', time: '02:58', title: 'Motion · Bedroom', evidence: 'clip-0258' },
];

export class Phone {
  constructor({ app, camera, interactions, bank, story, hud, seccam, clock }) {
    Object.assign(this, { app, camera, interactions, bank, story, hud, seccam, clock });
    this.chargerAt = CHARGER;
    // has: carried; onCharger: lying on the nightstand; pluggedIn: its charger back in the wall (it was pulled out).
    this.has = false; this.charge = 0; this.booted = false; this.onCharger = true; this.pluggedIn = false; this.silenced = false;
    this.chargeTime = 0;
    this.booting = null;              // seconds into the boot (its logo), until the lock screen comes up
    this.lit = 0;                     // lying on the nightstand: seconds its screen stays lit (a buzz, the charger, the boot)
    this.raised = false; this.raiseK = 0; this.app_ = 'lock'; this.sel = 0; this.dirty = true;
    this.call = null; this.notifications = [];
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
    this.qDown = 0;
    // blocked (main.js): not while paused, reading, caught or in an ending.
    window.addEventListener('keydown', (e) => {
      if (!document.pointerLockElement || e.repeat || this.blocked?.()) return;
      if (e.code === 'KeyQ') { this.qDown = performance.now(); }
      if (!this.raised) return;
      if (e.code === 'Enter') { e.preventDefault?.(); this.choose(this.sel); }
      if (e.code === 'Backspace') this.back();
    });
    window.addEventListener('keyup', (e) => {
      if (e.code !== 'KeyQ') return;
      if (!this.qDown || !document.pointerLockElement || this.blocked?.()) { this.qDown = 0; return; }
      const held = performance.now() - this.qDown; this.qDown = 0;
      if (held > 700 && this.has) { this.silenced = !this.silenced; this.hud?.toast(this.silenced ? 'Phone silenced' : 'Phone sound on'); this.dirty = true; return; }
      this.toggle();
    });
    window.addEventListener('wheel', (e) => { if (this.raised && document.pointerLockElement) this.move(Math.sign(e.deltaY)); });
    // While it is up the mouse buttons are the phone's (interact.js is disabled meanwhile, main.js).
    window.addEventListener('mousedown', (e) => {
      if (!this.raised || !document.pointerLockElement || this.raiseK < 0.6) return;
      if (e.button === 0) this.choose(this.sel);
      if (e.button === 2) this.back();
    });
    app.on('update', dt => this.update(this.paused?.() ? 0 : dt));   // paused (main.js): it waits
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

  // Taken in hand (from the nightstand). The first time: dead, and its charger pulled out of the wall.
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

  // Booting (story.js times it: phoneMayBoot): its logo lights the nightstand silently for 3 s, then the lock screen
  // and the alerts it missed, buzzing hard against the wood. now: no logo (a checkpoint, the developer menu's tests).
  boot({ now = false } = {}) {
    if (this.booted) return;
    if (!now && this.booting === null) { this.booting = 0; this.wake(4); this.dirty = true; return; }
    this.booting = null;
    this.booted = true; this.charge = Math.max(this.charge, 4);
    if (this.app_ === 'dead') this.app_ = 'lock';       // held up while it started: the lock screen now
    this.notifications = CLIPS.map(c => ({ ...c, unread: true }));
    this.wake(20);
    this.buzz(3);
    this.story?.set('alerts');
    this.story?.phoneBooted?.();
    this.dirty = true;
  }

  // n buzzes (a phone on a wooden nightstand buzzes hard against it; in a pocket, softer). A noise for him if he is near.
  buzz(n = 1) {
    if (this.silenced) return;
    const at = this.onCharger ? CHARGER : null;
    if (at) this.wake(12);
    for (let i = 0; i < n; i++) this.bank?.play('phone_buzz', { at, gain: at ? 1.0 : 0.5, delay: i * 1.1, send: 0.2, min: at ? 0.35 : 0 });
    this.noise?.(at ? at.x : null, at ? at.z : null, 'buzz');      // a buzz carries 4 m, a ringtone 12
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
    if (this.app_ === 'clip' || this.app_ === 'live') { this.seccam?.stopLive(); this.app_ = 'cam'; this.video.enabled = false; }
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
    if (this.app_ === 'call' && this.call?.choices) return this.call.choices.map(c => [c.text, () => this.answer(c)]);
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
  dial() {
    if (this.charge < 1) return;
    this.app_ = 'call';
    this.bank?.play('phone_dial', { gain: 0.3 });
    this.bank?.play('phone_static', { gain: 0.2, delay: 1.6 });
    this.call = { t: 0, line: 'Calling 112…', choices: null, step: 0 };
    this.story?.after(3.2, () => this.dispatcher('112. What’s your emergency?', this.firstChoices()), 'call');
    this.noise?.(null, null, 'walk');
  }

  firstChoices() {
    const s = this.story, choices = [{ text: '"There’s someone in my flat."', id: 'someone' }];
    if (s?.has('nest-seen')) choices.push({ text: '"He’s in the ceiling. Above my wardrobe."', id: 'where' });
    if (s?.sys.journal?.has('notice') && s?.has('old-key')) choices.push({ text: '"It’s the man they evicted. From 5B."', id: 'who' });
    // Before the man has been seen, all there is to say is a broken glass.
    if (!s?.has('silhouette') && !s?.has('hunt')) choices.splice(0, 1, { text: '"A glass broke. I think someone’s here."', id: 'unsure' });
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
    if (choice.id === 'decline') { this.incoming = false; this.hangUp(true); return; }   // they will not call again
    // The dispatcher calling back: answering connects the call; what was said before still stands (story.js).
    if (choice.id === 'answer') {
      call.incoming = false; call.choices = null; call.sent = true; this.incoming = false; this.dirty = true;
      const remaining = this.firstChoices().filter(c => c.id !== 'unsure' && !(c.id === 'where' && s?.told?.where) && !(c.id === 'who' && s?.told?.who));
      s?.after(1.2, () => this.dispatcher('Emergency services, you called us. Are you safe? Officers are on their way. Stay quiet.', remaining.length ? remaining : null));
      return;
    }
    call.told ||= {};
    call.told[choice.id] = true;
    this.story?.sys.hud?.voice('You (whispering)', choice.text.replace(/"/g, ''));
    this.noise?.(null, null, 'crouch');
    call.choices = null; this.dirty = true;
    if (choice.id === 'unsure' && !s?.has('hunt')) {
      s?.after(2.5, () => this.dispatcher('Is anyone hurt? ...If you think someone is in the property, get out if you can, and call us back.'));
      s?.after(9, () => this.hangUp(true));
      return;
    }
    const remaining = this.firstChoices().filter(c => !call.told[c.id] && c.id !== 'unsure');
    if (!call.sent) {
      call.sent = true;
      s?.after(2.6, () => {
        this.dispatcher('Officers are on their way. Two minutes. Stay on the line if you can. Is there somewhere you can hide?', remaining.length ? remaining : null);
        s?.policeCalled({ where: call.told.where, who: call.told.who });
      });
    } else {
      s?.after(2, () => { this.dispatcher(choice.id === 'where' ? 'In the ceiling. Okay. I’ve told them.' : 'Okay. I’ve passed that on.', remaining.length ? remaining : null); s?.policeCalled({ where: call.told.where, who: call.told.who }); });
    }
  }

  hangUp(theyDid = false) {
    if (!this.call) return;
    const sent = this.call.sent;
    this.call = null; this.app_ = 'lock'; this.dirty = true;
    this.bank?.play('latch_2', { gain: 0.1, rate: 1.8 });
    // Real dispatchers call back.
    if (sent && !theyDid) this.story?.after(14, () => this.ring(), 'callback');
  }

  ring() {
    if (this.call || this.story?.has('ended')) return;
    this.incoming = true; this.app_ = 'call';
    this.call = { t: 0, line: 'Incoming call · Emergency services', choices: [{ text: 'Answer', id: 'answer' }, { text: 'Decline', id: 'decline' }], incoming: true };
    // During the hunt the phone is on vibrate: a ringtone then would be a death sentence nobody could have seen coming.
    if (!this.silenced && !this.story?.has('hunt')) {
      for (let i = 0; i < 3; i++) this.bank?.play('phone_ring', { gain: 0.6, delay: i * 5.4, at: this.onCharger ? CHARGER : null });
      this.noise?.(null, null, 'phone');
    } else this.buzz(2);
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
    dt = Math.min(dt, 0.1);
    this.updateGlow(dt);
    if (this.charging) {
      this.chargeTime += dt;
      if (this.booted) this.charge = Math.min(100, this.charge + dt * 0.05);
      else if (this.booting === null && this.story?.phoneMayBoot?.(this.chargeTime)) this.boot();
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
      const k = this.raiseK, t = performance.now() / 1000;
      // Held up in front of you while you watch the camera (clips, LIVE), lower to the right otherwise.
      const watch = this.watchK = (this.watchK ?? 0) + (((this.app_ === 'clip' || this.app_ === 'live') ? 1 : 0) - (this.watchK ?? 0)) * (1 - Math.exp(-dt * 6));
      // Up where it can be read (build 0.15: it was held so low that its screen ran off the bottom of the view).
      this.holder.setLocalPosition(0.052 - 0.04 * watch, -0.078 + 0.03 * watch - (1 - k) * 0.2 + Math.sin(t * 1.3) * 0.002, -0.25 + 0.02 * watch);
      this.holder.setLocalEulerAngles(6 - 3 * watch + (1 - k) * 25, -8 + 6 * watch, -3 + 3 * watch + Math.sin(t * 0.9) * 0.6);
    }
    this.poseHand();
    this.updateScreenLight();
    // Screens that change by themselves (a clip's time, LIVE's status, a call's line) redraw a few times a second, not
    // every frame: the canvas is a 540x1170 upload.
    if (this.raised && (this.app_ === 'clip' || this.app_ === 'live' || this.app_ === 'call')) {
      this.redrawT = (this.redrawT || 0) + dt;
      if (this.redrawT > 0.2) { this.redrawT = 0; this.dirty = true; }
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
  load(s) { if (!s) return; Object.assign(this, s); this.booting = null; this.lit = 0; this.raised = false; this.call = null; this.app_ = 'lock'; this.dirty = true; this.charger?.(this.onCharger); }
}
