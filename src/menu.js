// Menus (the title over the dark flat, pause, settings, journal and endings, credits, the ending card). Plain DOM over
// the canvas, keyboard and mouse, in the game's type. Settings persist in the browser (horror.settings.v1) and are
// applied through `apply` (main.js): volumes, mouse, head bob, subtitles, reduced flashes, brightness, difficulty.
import { EVIDENCE } from './journal.js';

const SETTINGS_KEY = 'horror.settings.v1', PROGRESS_KEY = 'horror.progress.v1';
export const DEFAULT_SETTINGS = {
  master: 0.9, sfx: 1, ambience: 0.9, music: 0.8, sensitivity: 1, invertY: false, headBob: true,
  subtitleSize: 1, subtitleBack: false, reducedFlashes: false, brightness: 1, calibrated: false, difficulty: 'normal',
};
export const ENDINGS = [
  { id: 'sweet-dreams', name: 'Sweet Dreams', hint: 'Some nights it is better not to get up.' },
  { id: 'locked', name: 'Locked From the Inside', hint: 'They came. They found nothing.' },
  { id: 'out', name: 'Out', hint: 'Not every door opens from the inside.' },
  { id: 'lodger', name: 'The Lodger', hint: 'Tell them where. Tell them who.' },
];
const DIFFICULTIES = [
  { id: 'story', name: 'Story', text: 'For the story and the dread. He moves slowly, does not hear you walk, and cannot catch you running. The police come sooner.' },
  { id: 'normal', name: 'Normal', text: 'As intended. Light, noise and patience decide whether he finds you.' },
  { id: 'hard', name: 'Hard', text: 'He is quicker and hears more. Caught three times, you are back at the start of the night’s last act.' },
];

const read = (key, fallback) => { try { return { ...fallback, ...JSON.parse(localStorage.getItem(key) || '{}') }; } catch { return { ...fallback }; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } };

export class Menu {
  // hooks: { newGame(difficulty), continueGame(), chapter(act), resume(), restartCheckpoint(), quitToTitle(), apply(settings),
  //          openGraphics(), hasSave(), journal(), credits: html, sound(kind) }
  constructor(hooks) {
    this.hooks = hooks;
    this.settings = read(SETTINGS_KEY, DEFAULT_SETTINGS);
    this.progress = read(PROGRESS_KEY, { endings: {}, best: {}, runs: 0 });
    this.root = document.createElement('div');
    this.root.id = 'menu';
    this.root.innerHTML = `
      <div class="menu-veil"></div>
      <div class="menu-title"><h1>The Apartment</h1><p class="menu-time">03:07</p></div>
      <nav class="menu-panel" aria-label="Menu"></nav>
      <div class="menu-foot"><span class="menu-build"></span><span class="menu-loading"><span class="menu-bar"><i></i></span><em>Loading…</em></span></div>`;
    document.body.appendChild(this.root);
    this.panel = this.root.querySelector('.menu-panel');
    this.root.addEventListener('keydown', (e) => this.key(e));
    this.state = 'loading';
    this.stack = [];
    this.hooks.apply?.(this.settings);
  }

  setBuild(text) { this.root.querySelector('.menu-build').textContent = text; }
  setLoading(frac, text) {
    const l = this.root.querySelector('.menu-loading');
    l.hidden = frac === null;
    if (frac !== null) { l.querySelector('i').style.width = `${Math.round(frac * 100)}%`; l.querySelector('em').textContent = text || 'Loading…'; }
  }
  error(message) { this.setLoading(null); this.show('error', { message }); }

  saveSettings() { write(SETTINGS_KEY, this.settings); this.hooks.apply?.(this.settings); }
  setting(key, value) { this.settings[key] = value; this.saveSettings(); }

  // An ending was reached: remember it and the time.
  ended(id, seconds) {
    const p = this.progress;
    p.endings[id] = (p.endings[id] || 0) + 1;
    if (!p.best[id] || seconds < p.best[id]) p.best[id] = Math.round(seconds);
    p.runs++;
    write(PROGRESS_KEY, p);
  }
  get anyEnding() { return Object.keys(this.progress.endings).length > 0; }

  // --- screens -----------------------------------------------------------------------------------------------------
  open(screen = 'title', data) { this.root.hidden = false; this.root.classList.toggle('paused', screen === 'pause'); this.stack = []; this.show(screen, data); }
  close() { this.root.hidden = true; this.state = 'closed'; }
  get isOpen() { return !this.root.hidden; }

  show(screen, data = {}) {
    if (this.state && this.state !== screen && !['loading', 'closed', 'ending'].includes(this.state) && screen !== 'error') this.stack.push(this.state);
    this.state = screen;
    this.root.dataset.screen = screen;
    const build = this[`screen_${screen}`];
    this.panel.innerHTML = '';
    build.call(this, data);
    this.panel.querySelector('button, input, select')?.focus({ preventScroll: true });
  }

  back() {
    const prev = this.stack.pop();
    if (!prev) return;
    this.state = null; this.show(prev);
  }

  item(label, action, { sub, disabled, cls } = {}) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = `menu-item ${cls || ''}`; b.disabled = !!disabled;
    b.innerHTML = `<span>${label}</span>${sub ? `<small>${sub}</small>` : ''}`;
    b.addEventListener('click', () => { this.hooks.sound?.('select'); action(); });
    b.addEventListener('mouseenter', () => { if (!b.disabled) { b.focus({ preventScroll: true }); this.hooks.sound?.('hover'); } });
    this.panel.appendChild(b);
    return b;
  }

  heading(text, note) {
    const h = document.createElement('div'); h.className = 'menu-heading';
    h.innerHTML = `<h2>${text}</h2>${note ? `<p>${note}</p>` : ''}`;
    this.panel.appendChild(h);
  }

  screen_loading() {}

  screen_title() {
    const save = this.hooks.hasSave?.();
    if (save) this.item('Continue', () => this.hooks.continueGame(), { sub: save });
    this.item('New night', () => this.show('difficulty'));
    this.item('Chapters', () => this.show('chapters'), { disabled: !this.anyEnding, sub: this.anyEnding ? '' : 'after your first ending' });
    this.item('Journal & endings', () => this.show('records'));
    this.item('Settings', () => this.show('settings'));
    this.item('Credits', () => this.show('credits'));
  }

  screen_error({ message }) {
    this.heading('The apartment could not load', message);
    this.item('Try again', () => location.reload());
  }

  screen_difficulty() {
    this.heading('How do you sleep?');
    for (const d of DIFFICULTIES) this.item(d.name, () => {
      this.setting('difficulty', d.id);
      if (!this.settings.calibrated) this.show('brightness', { then: () => this.show('warning') }); else this.show('warning');
    }, { sub: d.text, cls: this.settings.difficulty === d.id ? 'current' : '' });
    this.item('Back', () => this.back(), { cls: 'back' });
  }

  screen_warning() {
    this.heading('Before you go to bed', 'Flashing lights and sudden loud sounds. Headphones, a dark room, and the sound up a little higher than feels comfortable.');
    this.item('Wake up', () => this.hooks.newGame(this.settings.difficulty), { cls: 'primary' });
    this.item('Back', () => this.back(), { cls: 'back' });
  }

  screen_chapters() {
    this.heading('Chapters', 'Start the night from the beginning of an act. Your journal stays.');
    ['I · Water', 'II · Dark', 'III · Steam', 'IV · The lodger'].forEach((name, i) => this.item(name, () => this.hooks.chapter(i + 1)));
    this.item('Back', () => this.back(), { cls: 'back' });
  }

  screen_records() {
    const ever = this.hooks.everFound?.() || new Set();
    this.heading('Endings', `${Object.keys(this.progress.endings).length} of ${ENDINGS.length}`);
    const list = document.createElement('ul'); list.className = 'menu-endings';
    for (const e of ENDINGS) {
      const got = this.progress.endings[e.id], best = this.progress.best[e.id];
      const li = document.createElement('li');
      li.innerHTML = got ? `<b>${e.name}</b><span>${best ? `best ${fmt(best)}` : ''}</span>` : `<b>???</b><span>${e.hint}</span>`;
      list.appendChild(li);
    }
    this.panel.appendChild(list);
    this.heading('Evidence', `${ever.size} of ${EVIDENCE.length} found over all your nights`);
    const ev = document.createElement('ul'); ev.className = 'menu-evidence';
    for (const e of EVIDENCE) { const li = document.createElement('li'); li.textContent = ever.has(e.id) ? e.title : '· · ·'; li.className = ever.has(e.id) ? 'got' : ''; ev.appendChild(li); }
    this.panel.appendChild(ev);
    this.item('Back', () => this.back(), { cls: 'back' });
  }

  screen_journal() {
    const entries = this.hooks.journal?.() || [];
    this.heading('Journal', entries.length ? `${entries.length} things I can’t explain` : 'Nothing yet. Nothing at all.');
    const list = document.createElement('div'); list.className = 'menu-journal';
    for (const e of entries) {
      const div = document.createElement('article');
      div.innerHTML = `<h3>${e.title}</h3><p>${e.text}</p>`;
      list.appendChild(div);
    }
    this.panel.appendChild(list);
    this.item('Back', () => this.back(), { cls: 'back' });
  }

  screen_settings() {
    this.heading('Settings');
    const s = this.settings;
    const slider = (label, key, min, max, step, fmtv = v => `${Math.round(v * 100)} %`) => {
      const row = document.createElement('label'); row.className = 'menu-row';
      row.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${s[key]}"><output>${fmtv(s[key])}</output>`;
      const input = row.querySelector('input'), out = row.querySelector('output');
      input.addEventListener('input', () => { s[key] = Number(input.value); out.textContent = fmtv(s[key]); this.saveSettings(); });
      this.panel.appendChild(row);
    };
    const toggle = (label, key, note) => {
      const row = document.createElement('label'); row.className = 'menu-row toggle';
      row.innerHTML = `<span>${label}${note ? `<small>${note}</small>` : ''}</span><input type="checkbox" ${s[key] ? 'checked' : ''}>`;
      row.querySelector('input').addEventListener('change', (e) => { s[key] = e.target.checked; this.saveSettings(); });
      this.panel.appendChild(row);
    };
    slider('Master volume', 'master', 0, 1, 0.05);
    slider('Effects', 'sfx', 0, 1, 0.05);
    slider('Ambience', 'ambience', 0, 1, 0.05);
    slider('Music and stings', 'music', 0, 1, 0.05);
    slider('Mouse sensitivity', 'sensitivity', 0.3, 2.5, 0.05, v => v.toFixed(2));
    toggle('Invert mouse Y', 'invertY');
    toggle('Head bob', 'headBob');
    slider('Subtitle size', 'subtitleSize', 0.8, 1.5, 0.05);
    toggle('Subtitle backing', 'subtitleBack', 'a dark band behind thoughts and voices');
    toggle('Reduced flashes', 'reducedFlashes', 'lightning, bangs and the torch’s stutter become soft fades');
    this.item('Brightness', () => this.show('brightness', { then: () => this.back() }));
    this.item('Graphics', () => this.hooks.openGraphics?.());
    this.item('Back', () => this.back(), { cls: 'back' });
  }

  screen_brightness({ then } = {}) {
    this.heading('Brightness', 'Raise it until the left mark is barely visible and the right one is not. The night should be dark.');
    const marks = document.createElement('div'); marks.className = 'menu-marks';
    marks.innerHTML = '<i style="--v:.035"></i><i style="--v:.015"></i>';
    this.panel.appendChild(marks);
    const row = document.createElement('label'); row.className = 'menu-row';
    row.innerHTML = `<span>Brightness</span><input type="range" min="0.6" max="1.6" step="0.02" value="${this.settings.brightness}"><output></output>`;
    const input = row.querySelector('input'), out = row.querySelector('output');
    const set = () => { this.settings.brightness = Number(input.value); out.textContent = this.settings.brightness.toFixed(2); marks.style.filter = `brightness(${this.settings.brightness})`; this.saveSettings(); };
    input.addEventListener('input', set); set();
    this.panel.appendChild(row);
    this.item('Done', () => { this.setting('calibrated', true); (then || (() => this.back()))(); }, { cls: 'primary' });
  }

  screen_credits() {
    this.heading('Credits');
    const div = document.createElement('div'); div.className = 'menu-credits';
    div.innerHTML = this.hooks.credits || '';
    this.panel.appendChild(div);
    this.item('Back', () => this.back(), { cls: 'back' });
  }

  screen_pause() {
    this.heading('Paused', this.hooks.status?.() || '');
    this.item('Resume', () => this.hooks.resume(), { cls: 'primary' });
    this.item('Journal', () => this.show('journal'));
    this.item('Settings', () => this.show('settings'));
    this.item('Back to the last checkpoint', () => this.hooks.restartCheckpoint(), { sub: this.hooks.checkpointName?.() || '' });
    this.item('Quit to the title', () => this.hooks.quitToTitle());
  }

  // The card after an ending: its name, what happened, the night in numbers.
  screen_ending({ id, epilogue, stats }) {
    const e = ENDINGS.find(x => x.id === id);
    const card = document.createElement('div'); card.className = 'menu-ending';
    card.innerHTML = `<p class="kicker">Ending ${ENDINGS.indexOf(e) + 1} of ${ENDINGS.length}</p><h2>${e?.name || ''}</h2>${epilogue ? `<p class="epilogue">${epilogue}</p>` : ''}
      <dl><dt>Time</dt><dd>${fmt(stats.time)}</dd><dt>Clock</dt><dd>${stats.clock}</dd><dt>Caught</dt><dd>${stats.deaths}</dd>
      <dt>Evidence</dt><dd>${stats.evidence} of ${EVIDENCE.length}</dd><dt>What it points to</dt><dd>${stats.reading}</dd></dl>`;
    this.panel.appendChild(card);
    this.item('Another night', () => this.show('difficulty'), { cls: 'primary' });
    this.item('Back to the title', () => this.hooks.quitToTitle());
  }

  key(e) {
    const items = [...this.panel.querySelectorAll('button:not(:disabled), input')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { items[(i + 1) % items.length]?.focus(); e.preventDefault(); this.hooks.sound?.('hover'); }
    if (e.key === 'ArrowUp') { items[(i - 1 + items.length) % items.length]?.focus(); e.preventDefault(); this.hooks.sound?.('hover'); }
    if (e.key === 'Escape' || e.key === 'Backspace') {
      if (e.target?.tagName === 'INPUT' && e.key === 'Backspace') return;
      if (this.state === 'pause') { this.hooks.resume(); e.preventDefault(); return; }
      if (this.stack.length) { this.back(); e.preventDefault(); }
    }
  }
}

export const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
