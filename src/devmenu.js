// Developer options (for testing). Typing "developer" anywhere, in game or on the start screen, turns developer mode on
// or off (a splash says which). While it is on, the panel is shown whenever the game is paused or on the start screen
// (no pointer lock): the flashlight's beam size, every light in the flat (grouped by area), the scripted events and a
// few test actions.
// Lights: the panel works the flat's own controls as if you pressed them (a room's switch, a lamp, a screen), so nothing
// is held: the wall switches, the lamps and the fuse box keep working in game, and either side can change any light at
// any time. A light with no control of its own (one downlight of a room, a wardrobe LED, the fridge's lamp) is set once
// and follows its control again the next time that changes. Power still decides (power.js): a light on a dead circuit
// stays dark until the fuse box brings it back. Undo puts every control back as it was before the panel's changes.
// Events and the lightning strike are queued: chosen while paused, they run DEV_DELAY seconds of play after the game
// resumes (story-events.js Director.queue), never while paused, so they can be watched from their start.
const CODE = 'developer';
export const DEV_DELAY = 3;
// Lights that are not the flat's own (the torch, the lightning, the home camera's infrared lamp).
const NOT_FLAT = new Set(['flashlight beam', 'flashlight bounce', 'moon', 'security camera infrared']);

export class DevMenu {
  // sys: { app, flashlight, switches, devices, closets, fridge, rain, recapture, eyes, events, stats }
  constructor(sys) {
    this.sys = sys;
    this.typed = '';
    this.entries = this.collect();
    this.el = this.build();
    document.body.appendChild(this.el);
    this.mode = false;
    this.splash = Object.assign(document.createElement('div'), { id: 'devsplash', hidden: true });
    document.body.appendChild(this.splash);
    window.addEventListener('keydown', (e) => {
      if (e.repeat || e.key.length !== 1 || !/[a-z]/i.test(e.key) || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName)) return;
      this.typed = (this.typed + e.key.toLowerCase()).slice(-CODE.length);
      this.lastKey = performance.now();
      if (this.typed === CODE) { this.typed = ''; this.setMode(!this.mode); }
    });
    document.addEventListener('pointerlockchange', () => this.show());
    if (sys.events) sys.events.onQueue = () => this.refreshQueue();
    sys.app.on('update', (dt) => this.update(dt));
  }

  // True while the code is being typed and `key` would continue it (the E in "developer" must not use things).
  typing(key) {
    if (!this.typed || performance.now() - (this.lastKey || 0) > 600) return false;
    for (let n = Math.min(this.typed.length, CODE.length - 1); n >= 3; n--) {
      if (CODE.startsWith(this.typed.slice(-n) + key)) return true;
    }
    return false;
  }

  get power() { return this.sys.switches?.power ?? null; }

  // Every light, grouped by area, with the intensity it has when on, any glowing part that goes with it, and what
  // controls it in the flat (owner: { room } | { lamp } | { set(on) } | { circuit } | nothing).
  collect() {
    const { app, switches, devices, closets, fridge } = this.sys, list = [], seen = new Set();
    const add = (group, name, lights, glows = [], owner = {}) => {
      lights = lights.filter(l => l.e && !seen.has(l.e));
      if (!lights.length) return null;
      lights.forEach(l => seen.add(l.e));
      const en = { group, name, lights, glows, owner };
      list.push(en);
      return en;
    };
    for (const room of switches.rooms) {
      const group = room.label.replace(/ lights$/, '').replace(/^Dining pendants$/, 'Dining');
      let n = 0;
      room.lights.forEach((e, i) => {
        if (e.name.startsWith('downlight')) {
          const g = room.glows[n++];
          add(group, `Ceiling light ${n}`, [{ e, base: room.base[i] }], g ? [g] : [], { room });
        } else add(group, title(e.name), [{ e, base: room.base[i] }], room.glowMat ? [{ mat: room.glowMat, base: room.glowBase }] : [], { room });   // its fixture's glow (mirror LEDs, hood, pendant globes)
      });
    }
    for (const lamp of devices.lamps) add(lamp.group, lamp.name, lamp.lights.map((e, i) => ({ e, base: lamp.base[i] })), lamp.mat ? [{ mat: lamp.mat, base: lamp.glow }] : [], { lamp });
    if (closets) for (const [id, s] of Object.entries(closets.sections)) add('Bedroom', `Wardrobe LED (${id})`, [{ e: s.led, base: 0.55 }], [], { wardrobe: id });
    const { laptop, computer, coffee } = devices;
    if (laptop?.glow) add('Living room', 'Laptop screen glow', [{ e: laptop.glow, base: laptop.glowBase }], laptop.glows, { set: on => laptop.setPower(on ? 1 : 0) });
    if (computer?.glow) add('Office', 'Computer screen glow', [{ e: computer.glow, base: computer.glowBase }], computer.glows, { set: on => { computer.on = on; computer.set(on ? 1 : 0); } });
    if (coffee?.led) add('Kitchen', 'Coffee machine panel', [{ e: coffee.led, base: 0.05 }], coffee.glows, { set: on => coffee.glow(on ? 1 : 0) });
    if (fridge) add('Kitchen', 'Refrigerator interior', [{ e: fridge.light, base: fridge.baseIntensity }], [{ mat: fridge.glow, base: 2 }], { fridge: true, circuit: 'kitchen' });
    for (const l of app.root.findComponents('light')) {
      if (seen.has(l.entity) || NOT_FLAT.has(l.entity.name)) continue;
      add('Other', title(l.entity.name), [{ e: l.entity, base: l.intensity || 0.5 }]);
    }
    // One heading per area: entries grouped in the order their areas first appear (stable within an area).
    const order = [...new Set(list.map(en => en.group))];
    return list.map((en, i) => [en, i]).sort((a, b) => order.indexOf(a[0].group) - order.indexOf(b[0].group) || a[1] - b[1]).map(([en]) => en);
  }

  build() {
    const el = document.createElement('div');
    el.id = 'dev'; el.hidden = true;
    el.innerHTML = `
      <header><span>Developer options</span><button class="x" title="Close">✕</button></header>
      <section>
        <h2>Flashlight</h2>
        <label class="row">Beam size <input type="range" id="dev-size" min="15" max="75" step="1"><output id="dev-size-v"></output></label>
        <div class="btns"><button id="dev-size-reset">Default size</button><button id="dev-give">Give me the flashlight</button><button id="dev-flash">On / off</button></div>
      </section>
      <section>
        <h2><button class="sub" id="dev-lights-open">Lights <span>▸</span></button></h2>
        <div id="dev-lights" hidden>
          <p class="note">Works the flat’s own switches and lamps: the switches and the fuse box keep working in game. A light on a dead circuit stays dark.</p>
          <p class="note" id="dev-power"></p>
          <div class="btns"><button id="dev-all-on">All on</button><button id="dev-all-off">All off</button><button id="dev-reset" title="Every switch, lamp and screen back as it was before your changes here">Undo</button></div>
          <div id="dev-list"></div>
        </div>
      </section>
      <section>
        <h2><button class="sub" id="dev-events-open">Events <span>▸</span></button></h2>
        <div id="dev-events" hidden>
          <p class="note">Scripted events in story order (story-events.js). Pick one, then resume the game: it plays ${DEV_DELAY} s later, never while paused. Pick it again to cancel.</p>
          <p class="queue" id="dev-queue" hidden></p>
          <ol id="dev-event-list"></ol>
        </div>
      </section>
      <section>
        <h2>Testing</h2>
        <div class="btns"><button id="dev-lightning" title="Plays ${DEV_DELAY} s after you resume">Lightning strike</button><button id="dev-stats">Show FPS</button></div>
        <label class="light"><input type="checkbox" id="dev-eyes"> Eye adaptation <output id="dev-ev"></output></label>
      </section>
      <p class="hint">Shown while the game is paused. Type “developer” again to turn developer mode off.</p>`;
    const $ = (id) => el.querySelector(`#${id}`);
    const fl = this.sys.flashlight;
    const size = $('dev-size'), out = $('dev-size-v');
    const showSize = () => { size.value = fl.size; out.textContent = `${Math.round(fl.size)}°`; };
    fl.defaultSize ??= fl.size;
    showSize();
    size.addEventListener('input', () => { fl.setSize(Number(size.value)); showSize(); });
    $('dev-size-reset').onclick = () => { fl.setSize(fl.defaultSize); showSize(); };
    $('dev-give').onclick = () => { if (!fl.held) fl.pickUp(); };
    $('dev-flash').onclick = () => { if (fl.held) fl.toggle(); };
    $('dev-lights-open').onclick = () => {
      const box = $('dev-lights'); box.hidden = !box.hidden;
      $('dev-lights-open').querySelector('span').textContent = box.hidden ? '▸' : '▾';
    };
    $('dev-all-on').onclick = () => this.all(true);
    $('dev-all-off').onclick = () => this.all(false);
    $('dev-reset').onclick = () => this.reset();
    this.lightning = { id: 'dev-lightning', label: 'Lightning strike', run: () => { if (this.sys.rain) this.sys.rain.flash.next = 0; } };
    $('dev-lightning').onclick = () => this.pick(this.lightning);
    $('dev-stats').onclick = () => { this.sys.stats?.(); $('dev-stats').disabled = true; };
    $('dev-eyes').addEventListener('change', (e) => { if (this.sys.eyes) this.sys.eyes.enabled = e.target.checked; });
    el.querySelector('.x').onclick = () => this.toggle(false);
    $('dev-events-open').onclick = () => {
      const box = $('dev-events'); box.hidden = !box.hidden;
      $('dev-events-open').querySelector('span').textContent = box.hidden ? '▸' : '▾';
    };
    this.eventButtons = new Map([[this.lightning.id, $('dev-lightning')]]);
    for (const event of this.sys.events?.events || []) {
      const item = document.createElement('li');
      const button = Object.assign(document.createElement('button'), { type: 'button', textContent: event.label, title: event.when });
      button.dataset.event = event.id;
      button.onclick = () => this.pick(event.id);
      this.eventButtons.set(event.id, button);
      item.append(button, Object.assign(document.createElement('small'), { textContent: event.when }));
      $('dev-event-list').appendChild(item);
    }
    // The list: one checkbox per light, under its area's heading.
    const list = $('dev-list');
    let group = null;
    for (const en of this.entries) {
      if (en.group !== group) { group = en.group; list.appendChild(Object.assign(document.createElement('h3'), { textContent: group })); }
      const row = document.createElement('label'); row.className = 'light';
      en.box = Object.assign(document.createElement('input'), { type: 'checkbox' });
      en.box.addEventListener('change', () => { this.remember(); this.set(en, en.box.checked); this.changed(); });
      row.append(en.box, document.createTextNode(en.name));
      list.appendChild(row);
    }
    this.$ = $;
    return el;
  }

  // --- events: queued, played DEV_DELAY s of play after the game resumes ---------------------------------------------
  // An event id or a { id, label, run } action. Picking the one already waiting cancels it.
  pick(action) {
    const events = this.sys.events;
    if (!events?.queue) return;
    const id = typeof action === 'string' ? action : action.id;
    if (events.queued?.event.id === id) events.cancelQueued();
    else events.queue(action, DEV_DELAY);
    this.refreshQueue();
  }

  refreshQueue() {
    if (!this.$) return;
    const events = this.sys.events, waiting = events?.queued?.event ?? null, last = events?.lastManual ?? null;
    for (const [id, button] of this.eventButtons) button.classList.toggle('queued', waiting?.id === id);
    const line = this.$('dev-queue');
    line.hidden = !waiting && !last;
    line.textContent = waiting ? `Queued: ${waiting.label}. It plays ${DEV_DELAY} s after you resume.` : last ? `Last played: ${last.label}` : '';
  }

  // --- lights ------------------------------------------------------------------------------------------------------
  // Turn what lights `en` on or off through its control in the flat (as a press would), or once if it has none.
  set(en, on) {
    const { switches, devices } = this.sys, o = en.owner;
    if (o.lamp) { o.lamp.on = on; devices.applyLamp(o.lamp, on ? 1 : 0); return; }
    if (o.set) { o.set(on); return; }
    if (o.room && o.room.lights.length === 1) { this.setRoom(o.room, on); return; }
    // One light of several on a switch, or a light with no control: set once, at its circuit's level.
    const circuit = o.room?.circuit ?? o.circuit, power = this.power;
    const k = (e) => on ? (circuit && power ? power.k(circuit, e.getPosition()) : 1) : 0;
    for (const l of en.lights) { const v = k(l.e); l.e.light.intensity = l.base * v; l.e.light.enabled = v > 0.001; }
    const g0 = k(en.lights[0].e);
    for (const g of en.glows) if (g.mat.emissiveIntensity !== g.base * g0) { g.mat.emissiveIntensity = g.base * g0; g.mat.update(); }
    en.want = on;
    // When every light on a switch has been set the same way, the switch takes that state, so the next press in the
    // flat flips what you see.
    if (o.room) {
      const wants = this.entries.filter(x => x.owner.room === o.room).map(x => x.want ?? o.room.on);
      if (wants.every(w => w === on)) { o.room.on = on; o.room.level = on ? 1 : 0; switches.tilt?.(o.room); }
    }
  }

  // A room's switch to on or off (what a press in the flat does, without the click).
  setRoom(room, on) {
    room.on = on; room.level = on ? 1 : 0;
    for (const en of this.entries) if (en.owner.room === room) en.want = undefined;
    this.sys.switches.apply(room);
  }

  all(on) {
    this.remember();
    for (const room of this.sys.switches.rooms) this.setRoom(room, on);
    for (const en of this.entries) if (!en.owner.room) this.set(en, on);
    this.changed();
  }

  // What every control was before the first change from this panel (Undo goes back to it). Lights with nothing of
  // their own to follow (the 'Other' group) keep their own state.
  remember() {
    if (this.saved) return;
    const { switches, devices } = this.sys;
    this.saved = {
      rooms: switches.rooms.map(r => [r, r.on, r.level]),
      lamps: devices.lamps.map(l => [l, l.on, l.level]),
      laptop: devices.laptop?.power, computer: devices.computer && [devices.computer.on, devices.computer.level], coffee: devices.coffee?.level,
      loose: this.entries.filter(en => !Object.keys(en.owner).length).flatMap(en => en.lights.map(l => [l.e, l.e.light.enabled, l.e.light.intensity])),
    };
  }

  // Every switch, lamp and screen back as it was before this panel's changes; lights without a control follow theirs.
  reset() {
    const { switches, devices, closets, fridge } = this.sys, s = this.saved;
    for (const en of this.entries) en.want = undefined;
    if (s) {
      for (const [r, on, level] of s.rooms) { r.on = on; r.level = level; }
      for (const [l, on, level] of s.lamps) { l.on = on; l.level = level; }
      if (s.laptop !== undefined) devices.laptop.power = s.laptop;
      if (s.computer) [devices.computer.on, devices.computer.level] = s.computer;
      if (s.coffee !== undefined) devices.coffee.level = s.coffee;
      for (const [e, enabled, intensity] of s.loose) { e.light.enabled = enabled; e.light.intensity = intensity; }
      this.saved = null;
    }
    switches.rooms.forEach(r => switches.apply(r));
    devices.lamps.forEach(l => devices.applyLamp(l, l.level));
    devices.laptop?.setPower(devices.laptop.power);
    devices.computer?.set(devices.computer.level);
    devices.coffee?.glow(devices.coffee.level);
    fridge?.applyLighting();
    if (closets) for (const [id, sec] of Object.entries(closets.sections)) {
      const open = Math.max(...closets.doors.filter(d => d.section === id).map(d => d.angle));
      sec.led.light.enabled = open > 0.02; sec.led.light.intensity = 0.55 * Math.min(1, open * 4);
    }
    this.changed();
  }

  isOn(en) { return en.lights.some(l => l.e.light.enabled && l.e.light.intensity > 0.001); }

  // Developer mode on/off, with a splash.
  setMode(on) {
    this.mode = on;
    if (on && document.pointerLockElement) document.exitPointerLock?.();
    this.splash.textContent = on ? 'Developer mode enabled!' : 'Developer mode disabled';
    this.splash.hidden = false;
    this.splash.classList.remove('show');
    void getComputedStyle(this.splash).opacity;      // restart the fade
    this.splash.classList.add('show');
    clearTimeout(this.splashTimer);
    this.splashTimer = setTimeout(() => { this.splash.hidden = true; }, 2200);
    this.show();
  }

  // The panel is up while developer mode is on and the game is not being played (paused or on the start screen).
  show() { this.toggle(this.mode && !document.pointerLockElement); }

  toggle(open = this.el.hidden) {
    this.el.hidden = !open;
    if (open) this.refresh();
  }

  refresh() {
    for (const en of this.entries) if (en.box) en.box.checked = this.isOn(en);
    if (!this.$) return;
    const fl = this.sys.flashlight;
    this.$('dev-give').hidden = fl.held;
    this.$('dev-flash').hidden = !fl.held;
    this.$('dev-size').value = fl.size;
    const eyes = this.sys.eyes;
    this.$('dev-eyes').checked = !!eyes?.enabled;
    this.$('dev-ev').textContent = eyes ? `exposure ${eyes.value.toFixed(2)}` : '';
    const p = this.power;
    if (p) {
      const dead = Object.keys(p.breakers).filter(c => !p.live(c));
      this.$('dev-power').textContent = !p.main ? 'Power: the main switch is off (fuse box).'
        : !p.rcd ? 'Power: the RCD has tripped (fuse box): every circuit is dead.'
          : dead.length ? `Power: on, except ${dead.join(', ')} (breakers off).` : 'Power: on.';
    }
    this.refreshQueue();
  }

  changed() {
    this.refresh();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.sys.recapture?.(), 250);   // bounce light follows (room probes)
  }

  update(dt) {
    if (!this.el.hidden) { this.t = (this.t || 0) + dt; if (this.t > 0.5) { this.t = 0; this.refresh(); } }
  }
}

const title = (s) => s.charAt(0).toUpperCase() + s.slice(1);
