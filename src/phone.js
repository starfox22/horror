// The player's phone (docs/STORY.md): it lies dead on the south nightstand, its charger pulled out of the wall. Taking it
// shows it is dead; putting it back plugs the charger in, and it charges there while the bedroom's sockets have power.
// A flat phone needs minutes on the charger before it can start: it boots in Act III, once the power is back (story.js
// times the buzz after the quiet), and buzzes hard against the nightstand with the camera alerts it missed. Q raises it
// (held low in the right hand, its screen the only light it gives) and lowers it.
// Apps: the lock screen (time, battery, notifications), Home Cam (clips 00:47 and 02:58, LIVE: seccam.js), and the
// emergency call: the dispatcher's lines, the player's whispered answers (what they can say depends on what they found),
// a call-back if they hang up (a 12 m noise ringing, or a buzz during the hunt; silenced: hold Q).
// Screen: a canvas (drawn when something changes) on the model's screen, the video on its own quad in front of it.
import { Color, Entity, StandardMaterial, Texture, Vec2, Vec3, Quat, PIXELFORMAT_RGBA8, FILTER_LINEAR, ADDRESS_CLAMP_TO_EDGE, BLEND_NONE } from 'playcanvas';

const W = 540, H = 1170;                   // screen canvas (iPhone-ish 19.5:9)
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
    this.raised = false; this.raiseK = 0; this.app_ = 'lock'; this.sel = 0; this.dirty = true;
    this.call = null; this.notifications = [];
    this.canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
    this.g = this.canvas.getContext('2d');
    this.texture = new Texture(app.graphicsDevice, { width: W, height: H, format: PIXELFORMAT_RGBA8, mipmaps: false,
      minFilter: FILTER_LINEAR, magFilter: FILTER_LINEAR, addressU: ADDRESS_CLAMP_TO_EDGE, addressV: ADDRESS_CLAMP_TO_EDGE, name: 'phone-screen' });
    this.buildHolder();
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
      if (e.code !== 'KeyQ' || !this.qDown || !document.pointerLockElement || this.blocked?.()) { this.qDown = 0; return; }
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
    app.on('update', dt => this.update(dt));
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
    this.video.setLocalScale(0.0664, 1, 0.0374);
    this.video.setLocalPosition(0, 0.026, 0.0043);
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
    if (this.useScreen(entity)) this.screen.enabled = false;
    this.video.setLocalScale(0.0626, 1, 0.0352);
    this.video.setLocalPosition(0, 0.026, 0.0038);
  }

  // Puts the screen canvas on a phone model's own screen mesh (material 'Lock_Screen'); false if it has none.
  useScreen(entity) {
    const mi = entity.findComponents('render').flatMap(r => r.meshInstances).find(m => /^Lock_Screen/.test(m.material.name));
    if (!mi) return false;
    if (!this.modelScreenMat) {
      const m = this.screenMat.clone();
      m.emissiveMapTiling = new Vec2(1 / 0.7894, 1 / 0.9804); m.emissiveMapOffset = new Vec2(-0.0792 / 0.7894, -0.0069 / 0.9804);
      m.update();
      this.modelScreenMat = m;
    }
    mi.material = this.modelScreenMat;
    return true;
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
    this.bank?.play('blanket', { at: CHARGER, gain: 0.3 });
    if (!this.pluggedIn) {
      this.pluggedIn = true;
      this.bank?.play('latch_2', { at: [CHARGER.x + 0.35, 0.3, CHARGER.z], gain: 0.25, rate: 1.6 });
      this.story?.phoneCharging?.();
    }
    this.charger?.(true);
    this.dirty = true;
  }

  takeFromCharger() {
    this.bank?.play('blanket', { at: CHARGER, gain: 0.3 });
    this.take();
    this.story?.phoneTaken?.(this);
  }

  // Booting: the logo, then the lock screen and the alerts it missed (story.js times it: phoneMayBoot).
  boot() {
    if (this.booted) return;
    this.booted = true; this.charge = Math.max(this.charge, 4);
    this.notifications = CLIPS.map(c => ({ ...c, unread: true }));
    this.buzz(3);
    this.story?.set('alerts');
    this.story?.phoneBooted?.();
    this.dirty = true;
  }

  // n buzzes (a phone on a wooden nightstand buzzes hard against it; in a pocket, softer). A noise for him if he is near.
  buzz(n = 1) {
    if (this.silenced) return;
    const at = this.onCharger ? CHARGER : null;
    for (let i = 0; i < n; i++) this.bank?.play('phone_buzz', { at, gain: at ? 1.0 : 0.5, delay: i * 1.1, send: 0.2, min: at ? 0.35 : 0 });
    this.noise?.(at ? at.x : null, at ? at.z : null);
  }

  toggle() {
    if (!this.has || this.onCharger) return;
    this.raised = !this.raised;
    this.bank?.play('blanket', { gain: 0.25 });
    if (this.raised) { this.app_ = this.booted ? (this.call ? 'call' : 'lock') : 'dead'; this.sel = 0; }
    else if (this.app_ === 'live') this.seccam?.stopLive();
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
    if (this.app_ === 'cam') return [...CLIPS.map(c => [`${c.time}  ${c.title}`, () => this.playClip(c)]), ['LIVE  Bedroom', () => this.openLive()]];
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
    this.story?.after(3.2, () => this.dispatcher('Emergency. What’s the address?', this.firstChoices()), 'call');
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
    this.call.line = text; this.call.choices = choices; this.sel = 0; this.dirty = true;
    this.story?.sys.hud?.voice('Dispatcher', text);
    this.bank?.play('phone_static', { gain: 0.12 });
  }

  answer(choice) {
    const call = this.call, s = this.story;
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
    this.incoming = true; this.app_ = 'call'; this.call = { t: 0, line: 'Incoming call · Emergency services', choices: [{ text: 'Answer', id: 'answer' }], incoming: true };
    // During the hunt the phone is on vibrate: a ringtone then would be a death sentence nobody could have seen coming.
    if (!this.silenced && !this.story?.has('hunt')) {
      for (let i = 0; i < 3; i++) this.bank?.play('phone_ring', { gain: 0.6, delay: i * 5.4, at: this.onCharger ? CHARGER : null });
      this.noise?.(null, null, 'phone');
    } else this.buzz(2);
    this.dirty = true;
  }

  // --- per frame ---------------------------------------------------------------------------------------------------
  update(dt) {
    dt = Math.min(dt, 0.1);
    if (this.charging) {
      this.chargeTime += dt;
      if (this.booted) this.charge = Math.min(100, this.charge + dt * 0.05);
      else if (this.story?.phoneMayBoot?.(this.chargeTime)) this.boot();
    }
    // Holding it: rises into the lower right of the view; lowered, out of sight.
    this.raiseK += ((this.raised ? 1 : 0) - this.raiseK) * (1 - Math.exp(-dt * 9));
    this.holder.enabled = this.raiseK > 0.02;
    if (this.holder.enabled) {
      const k = this.raiseK, t = performance.now() / 1000;
      // Held up in front of you while you watch the camera (clips, LIVE), lower to the right otherwise.
      const watch = this.watchK = (this.watchK ?? 0) + (((this.app_ === 'clip' || this.app_ === 'live') ? 1 : 0) - (this.watchK ?? 0)) * (1 - Math.exp(-dt * 6));
      this.holder.setLocalPosition(0.075 - 0.045 * watch, -0.13 + 0.035 * watch - (1 - k) * 0.18 + Math.sin(t * 1.3) * 0.002, -0.27 + 0.03 * watch);
      this.holder.setLocalEulerAngles(8 - 4 * watch + (1 - k) * 25, -6 + 4 * watch, Math.sin(t * 0.9) * 0.6);
    }
    // Screens that change by themselves (a clip's time, LIVE's status, a call's line) redraw a few times a second, not
    // every frame: the canvas is a 540x1170 upload.
    if (this.raised && (this.app_ === 'clip' || this.app_ === 'live' || this.app_ === 'call')) {
      this.redrawT = (this.redrawT || 0) + dt;
      if (this.redrawT > 0.2) { this.redrawT = 0; this.dirty = true; }
    }
    if (this.dirty && this.holder.enabled) { this.draw(); this.dirty = false; }
  }

  get glowing() { return this.raised && this.booted; }

  // --- the screen ----------------------------------------------------------------------------------------------
  draw() {
    const g = this.g, now = this.clock ? this.clock.now() : new Date();
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    if (!this.booted) {
      // Dead: a black screen; on a live charger, the empty-battery glyph.
      if (this.charging) { g.strokeStyle = '#d22'; g.lineWidth = 6; g.strokeRect(190, 520, 140, 64); g.fillStyle = '#d22'; g.fillRect(200, 530, 12, 44); }
      this.texture.setSource(this.canvas); return;
    }
    const grad = g.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, '#0e1420'); grad.addColorStop(1, '#05070b');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    g.fillStyle = '#e9edf3';
    g.font = '600 26px "Helvetica Neue", Arial, sans-serif'; g.textAlign = 'left';
    g.fillText(`${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`, 40, 56);
    g.textAlign = 'right'; g.fillText(`${Math.floor(this.charge)}%${this.silenced ? '  🔕' : ''}`, W - 40, 56);
    g.textAlign = 'center';
    if (this.app_ === 'lock') {
      g.font = '200 150px "Helvetica Neue", Arial, sans-serif';
      g.fillText(`${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`, W / 2, 300);
      g.font = '400 28px "Helvetica Neue", Arial, sans-serif'; g.fillStyle = '#b8c0cc';
      g.fillText('Saturday 25 October', W / 2, 350);
      let y = 430;
      for (const n of this.notifications.filter(x => x.unread)) {
        this.card(g, 30, y, W - 60, 110);
        g.textAlign = 'left'; g.fillStyle = '#e9edf3'; g.font = '600 26px "Helvetica Neue", Arial, sans-serif'; g.fillText('HOME CAM', 60, y + 42);
        g.font = '400 26px "Helvetica Neue", Arial, sans-serif'; g.fillStyle = '#cfd5de'; g.fillText(`Motion detected · Bedroom · ${n.time}`, 60, y + 82);
        y += 126;
      }
      this.menu(g, 860);
    } else if (this.app_ === 'cam' || this.app_ === 'clip' || this.app_ === 'live') {
      g.font = '600 34px "Helvetica Neue", Arial, sans-serif'; g.fillText('Home Cam', W / 2, 120);
      g.fillStyle = '#000'; g.fillRect(0, 160, W, 304);
      if (this.app_ === 'live') { g.fillStyle = '#e33'; g.font = '700 22px "Helvetica Neue", Arial, sans-serif'; g.textAlign = 'left'; g.fillText(`● LIVE · ${this.seccam?.liveStatus?.() || '8 s delay'}`, 24, 492); }
      else if (this.app_ === 'clip') { g.fillStyle = '#cfd5de'; g.font = '400 22px "Helvetica Neue", Arial, sans-serif'; g.textAlign = 'left'; g.fillText(`${this.clip.time} · Bedroom · motion`, 24, 492); }
      g.textAlign = 'center';
      if (this.app_ === 'cam') this.menu(g, 540);
      else { g.fillStyle = '#7f8794'; g.font = '400 22px "Helvetica Neue", Arial, sans-serif'; g.fillText('right click · back', W / 2, H - 60); }
    } else if (this.app_ === 'call') {
      g.font = '300 44px "Helvetica Neue", Arial, sans-serif'; g.fillText(this.call?.incoming ? 'Emergency services' : '112', W / 2, 200);
      g.font = '400 26px "Helvetica Neue", Arial, sans-serif'; g.fillStyle = '#9aa3af';
      g.fillText(this.call?.incoming ? 'incoming call…' : 'Emergency call', W / 2, 250);
      g.fillStyle = '#e9edf3'; this.wrap(g, this.call?.line || '', W / 2, 380, W - 90, 38);
      this.menu(g, 700);
    }
    this.texture.setSource(this.canvas);
  }

  card(g, x, y, w, h) { g.fillStyle = 'rgba(255,255,255,0.10)'; g.beginPath(); g.roundRect?.(x, y, w, h, 22); g.fill(); }

  menu(g, y0) {
    const opts = this.options();
    opts.forEach(([label], i) => {
      const y = y0 + i * 92;
      g.fillStyle = i === this.sel ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)';
      g.beginPath(); g.roundRect?.(40, y, W - 80, 74, 18); g.fill();
      g.fillStyle = label.startsWith('Emergency') ? '#ff6b6b' : '#e9edf3'; g.font = '500 25px "Helvetica Neue", Arial, sans-serif'; g.textAlign = 'center';
      g.fillText(label, W / 2, y + 47);
    });
    if (opts.length) {
      g.fillStyle = '#8d95a2'; g.font = '400 21px "Helvetica Neue", Arial, sans-serif';
      g.fillText(this.app_ === 'lock' ? 'wheel · click to choose · hold Q · silence' : 'wheel · click to choose · right click back', W / 2, H - 60);
    }
  }

  wrap(g, text, x, y, width, lh) {
    const words = text.split(' '); let line = '';
    g.font = '400 30px "Helvetica Neue", Arial, sans-serif';
    for (const w of words) {
      const t = line ? `${line} ${w}` : w;
      if (g.measureText(t).width > width) { g.fillText(line, x, y); y += lh; line = w; } else line = t;
    }
    if (line) g.fillText(line, x, y);
  }

  save() { return { has: this.has, charge: this.charge, booted: this.booted, onCharger: this.onCharger, pluggedIn: this.pluggedIn, chargeTime: this.chargeTime, silenced: this.silenced, notifications: this.notifications }; }
  load(s) { if (!s) return; Object.assign(this, s); this.raised = false; this.call = null; this.app_ = 'lock'; this.dirty = true; this.charger?.(this.onCharger); }
}
