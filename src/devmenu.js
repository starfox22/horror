// Developer options (for testing). Typing "developer" anywhere, in game or on the start screen, turns developer mode on
// or off (a splash says which). While it is on, the panel is shown whenever the game is paused or on the start screen
// (no pointer lock): the flashlight's beam size, every light in the flat (on / off one by one, grouped by area), and a
// few test actions. A light set here overrides its switch until "Back to switches", or until its own switch or lamp is
// pressed in the flat (that press hands it back, from the state it was forced to: Switches/Devices `override`).
const CODE = 'developer';

export class DevMenu {
  // sys: { app, flashlight, switches, devices, closets, rain, recapture, eyes, stats }
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
    sys.switches.override = sys.devices.override = (lights) => this.handBack(lights);
    // Registered after every other system, so a forced light wins over its switch's fade in the same frame.
    sys.app.on('update', (dt) => this.update(dt));
  }

  // True while the code is being typed and `key` would continue it (the E in "developer" must not use things).
  typing(key) {
    if (!this.typed || performance.now() - (this.lastKey || 0) > 600) return false;
    for (let n = Math.min(this.typed.length, CODE.length - 1); n > 0; n--) {
      if (CODE.startsWith(this.typed.slice(-n) + key)) return true;
    }
    return false;
  }

  // Every light, grouped by area, with the intensity it has when on and any glowing part that goes with it.
  collect() {
    const { app, switches, devices, closets } = this.sys, list = [], seen = new Set();
    const add = (group, name, lights, glows = []) => {
      lights = lights.filter(l => l.e && !seen.has(l.e));
      if (!lights.length) return;
      lights.forEach(l => seen.add(l.e));
      list.push({ group, name, lights, glows, force: null });
    };
    for (const room of switches.rooms) {
      const group = room.label.replace(/ lights$/, '').replace(/^Dining pendants$/, 'Dining');
      let n = 0;
      room.lights.forEach((e, i) => {
        if (e.name.startsWith('downlight')) {
          const g = room.glows[n++];
          add(group, `Ceiling light ${n}`, [{ e, base: room.base[i] }], g ? [g] : []);
        } else add(group, title(e.name), [{ e, base: room.base[i] }], room.glowMat ? [{ mat: room.glowMat, base: room.glowBase }] : []);   // its fixture's glow (mirror LEDs, hood, pendant globes)
      });
    }
    for (const lamp of devices.lamps) add(lamp.group, lamp.name, lamp.lights.map((e, i) => ({ e, base: lamp.base[i] })), lamp.mat ? [{ mat: lamp.mat, base: lamp.glow }] : []);
    if (closets) for (const [id, s] of Object.entries(closets.sections)) add('Bedroom', `Wardrobe LED (${id})`, [{ e: s.led, base: 0.55 }]);
    if (devices.laptop?.glow) add('Living room', 'Laptop screen glow', [{ e: devices.laptop.glow, base: devices.laptop.glowBase }], devices.laptop.glows);
    if (devices.computer?.glow) add('Office', 'Computer screen glow', [{ e: devices.computer.glow, base: devices.computer.glowBase }], devices.computer.glows);
    if (devices.coffee?.led) add('Kitchen', 'Coffee machine panel', [{ e: devices.coffee.led, base: 0.05 }], devices.coffee.glows);
    const skip = new Set(['flashlight beam', 'flashlight bounce', 'moon']);
    for (const l of app.root.findComponents('light')) {
      if (seen.has(l.entity) || skip.has(l.entity.name)) continue;
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
          <div class="btns"><button id="dev-all-on">All on</button><button id="dev-all-off">All off</button><button id="dev-reset">Back to switches</button></div>
          <div id="dev-list"></div>
        </div>
      </section>
      <section>
        <h2>Testing</h2>
        <div class="btns"><button id="dev-lightning">Lightning strike</button><button id="dev-stats">Show FPS</button></div>
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
    $('dev-all-on').onclick = () => { this.entries.forEach(en => { en.force = true; }); this.changed(); };
    $('dev-all-off').onclick = () => { this.entries.forEach(en => { en.force = false; }); this.changed(); };
    $('dev-reset').onclick = () => this.reset();
    $('dev-lightning').onclick = () => { if (this.sys.rain) this.sys.rain.flash.next = 0; };
    $('dev-stats').onclick = () => { this.sys.stats?.(); $('dev-stats').disabled = true; };
    $('dev-eyes').addEventListener('change', (e) => { if (this.sys.eyes) this.sys.eyes.enabled = e.target.checked; });
    el.querySelector('.x').onclick = () => this.toggle(false);
    // The list: one checkbox per light, under its area's heading.
    const list = $('dev-list');
    let group = null;
    for (const en of this.entries) {
      if (en.group !== group) { group = en.group; list.appendChild(Object.assign(document.createElement('h3'), { textContent: group })); }
      const row = document.createElement('label'); row.className = 'light';
      en.box = Object.assign(document.createElement('input'), { type: 'checkbox' });
      en.box.addEventListener('change', () => { en.force = en.box.checked; this.changed(); });
      row.append(en.box, document.createTextNode(en.name));
      list.appendChild(row);
    }
    this.$ = $;
    return el;
  }

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

  // A switch or lamp was pressed in the flat: entries forced here for any of `lights` go back to it. Returns the state
  // they were forced to (so the press flips what the player sees), or null if none was forced.
  handBack(lights) {
    let forced = null;
    for (const en of this.entries) {
      if (en.force === null || !en.lights.some(l => lights.includes(l.e))) continue;
      forced = en.force;
      en.force = null;
    }
    if (forced !== null) this.refresh();
    return forced;
  }

  isOn(en) { return en.force ?? en.lights.some(l => l.e.light.enabled && l.e.light.intensity > 0.001); }

  refresh() {
    for (const en of this.entries) en.box.checked = this.isOn(en);
    const fl = this.sys.flashlight;
    this.$('dev-give').hidden = fl.held;
    this.$('dev-flash').hidden = !fl.held;
    this.$('dev-size').value = fl.size;
    const eyes = this.sys.eyes;
    this.$('dev-eyes').checked = !!eyes?.enabled;
    this.$('dev-ev').textContent = eyes ? `exposure ${eyes.value.toFixed(2)}` : '';
  }

  changed() {
    for (const en of this.entries) this.applyOverride(en);
    this.refresh();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.sys.recapture?.(), 250);   // bounce light follows (room probes)
  }

  // Hand every light back to its switch, lamp or device.
  reset() {
    const { switches, devices, closets } = this.sys;
    this.entries.forEach(en => { en.force = null; });
    switches.rooms.forEach(r => switches.apply(r));
    devices.lamps.forEach(l => devices.applyLamp(l, l.level));
    devices.laptop?.setPower(devices.laptop.power);
    devices.computer?.set(devices.computer.level);
    devices.coffee?.glow(devices.coffee.level);
    if (closets) for (const [id, s] of Object.entries(closets.sections)) {
      const open = Math.max(...closets.doors.filter(d => d.section === id).map(d => d.angle));
      s.led.light.enabled = open > 0.02; s.led.light.intensity = 0.55 * Math.min(1, open * 4);
    }
    this.changed();
  }

  // Light entities and the surfaces that emit them must agree, including while a
  // native screen/lamp animation is running. Apply only forced entries; the owning
  // device retains its actual power level so reset can restore it exactly.
  applyOverride(en) {
    if (en.force === null) return;
    for (const l of en.lights) { l.e.light.enabled = en.force; l.e.light.intensity = en.force ? l.base : 0; }
    for (const g of en.glows) {
      const level = en.force ? g.base : 0;
      if (g.mat.emissiveIntensity !== level) { g.mat.emissiveIntensity = level; g.mat.update(); }
    }
  }

  update(dt) {
    for (const en of this.entries) this.applyOverride(en);
    if (!this.el.hidden) { this.t = (this.t || 0) + dt; if (this.t > 0.5) { this.t = 0; this.refresh(); } }
  }
}

const title = (s) => s.charAt(0).toUpperCase() + s.slice(1);
