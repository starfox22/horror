import { applyGraphicsOptions, qualityOptions } from './post.js';
import { DEFAULT_FRAME_LIMIT, FRAME_LIMITS } from './frame-limiter.js';

// v2 (build 0.12): Auto and VSync became the defaults. Settings saved under v1 keep only the FPS-counter choice and
// start again from Auto with VSync, once.
export const GRAPHICS_STORAGE_KEY = 'horror.graphics.v2';
const PREVIOUS_STORAGE_KEY = 'horror.graphics.v1';
const PRESETS = { low: 1, medium: 2, high: 3 };
const EFFECTS = ['ambientOcclusion', 'volumetricFog', 'bloom', 'taa', 'filmGrain'];
const SCALES = [0.5, 0.65, 0.75, 0.85, 1];
// Extra steps below Low give integrated GPUs room to reach the same 60 FPS
// target. Runtime adaptation stays transient; selecting Auto again retries detail.
const AUTO_STEPS = [
  { quality: 3, resolutionScale: 1 },
  { quality: 2, resolutionScale: 0.85 },
  { quality: 2, resolutionScale: 0.75 },
  { quality: 1, resolutionScale: 0.75 },
  { quality: 1, resolutionScale: 0.65 },
  { quality: 1, resolutionScale: 0.5 },
];

export function normalizeGraphicsSettings(value) {
  const source = value && typeof value === 'object' ? value : {};
  // The FPS counter is off for a fresh player (build 0.14, production); the graphics dialog and the developer menu show it.
  const defaults = { preset: 'auto', ...qualityOptions(3), showFps: false, fpsLimit: DEFAULT_FRAME_LIMIT };
  const settings = { ...defaults };
  if (['auto', 'low', 'medium', 'high', 'custom'].includes(source.preset)) settings.preset = source.preset;
  if (SCALES.includes(source.resolutionScale)) settings.resolutionScale = source.resolutionScale;
  if ([1, 2, 3].includes(source.quality)) settings.quality = source.quality;
  if (FRAME_LIMITS.includes(source.fpsLimit)) settings.fpsLimit = source.fpsLimit;
  for (const key of [...EFFECTS, 'showFps']) if (typeof source[key] === 'boolean') settings[key] = source[key];
  return settings;
}

// State and persistence are kept independent of the menu so presets, hotkeys and
// automatic performance adjustment always use the same rendering options.
export class GraphicsPreferences {
  constructor({ storage = null, qualityOverride = null, forceFps = false } = {}) {
    this.storage = storage;
    this.canSave = !!storage;
    let saved, raw;
    let migrate = false;
    try {
      raw = storage?.getItem(GRAPHICS_STORAGE_KEY);
      if (raw == null) { raw = storage?.getItem(PREVIOUS_STORAGE_KEY); migrate = raw != null; }
    } catch { this.canSave = false; }
    try { saved = JSON.parse(raw || 'null'); } catch { /* corrupt data falls back to defaults */ }
    if (migrate && saved && typeof saved === 'object') saved = { showFps: saved.showFps };
    this.state = normalizeGraphicsSettings(saved);
    const quality = Number(qualityOverride);
    if ([1, 2, 3].includes(quality)) this.state.preset = ['low', 'medium', 'high'][quality - 1];
    if (forceFps) this.state.showFps = true;
    this.autoStep = 0;
    this.lastPerformance = null;
    this.resetSample();
  }

  get effective() {
    if (this.state.preset === 'custom') return Object.fromEntries(['quality', 'resolutionScale', ...EFFECTS].map(key => [key, this.state[key]]));
    if (this.state.preset !== 'auto') return qualityOptions(PRESETS[this.state.preset]);
    const step = AUTO_STEPS[this.autoStep];
    return { ...qualityOptions(step.quality), resolutionScale: step.resolutionScale };
  }

  get autoQuality() { return AUTO_STEPS[this.autoStep].quality; }
  // Auto aims for 60 FPS (or a lower manual cap); VSync on a 60 Hz screen is 60, on faster screens a whole fraction >= 60.
  get autoTarget() { return this.state.fpsLimit > 0 ? Math.min(60, this.state.fpsLimit) : 60; }

  notify(save = true) {
    if (save) {
      try { this.storage?.setItem(GRAPHICS_STORAGE_KEY, JSON.stringify(this.state)); this.canSave = !!this.storage; }
      catch { this.canSave = false; /* settings still work for this session */ }
    }
    this.onChange?.();
  }

  setPreset(preset) {
    if (!['auto', 'low', 'medium', 'high', 'custom'].includes(preset)) return;
    this.state = { ...this.state, ...this.effective, preset };
    this.autoStep = 0;
    this.lastPerformance = null;
    this.resetSample();
    this.notify();
  }

  setOption(key, value) {
    if (key === 'fpsLimit') {
      if (!FRAME_LIMITS.includes(value)) return;
      this.state.fpsLimit = value;
    } else if (key === 'showFps') {
      if (typeof value !== 'boolean') return;
      this.state.showFps = value;
    } else {
      if (!EFFECTS.includes(key) && key !== 'resolutionScale') return;
      if (key === 'resolutionScale' ? !SCALES.includes(value) : typeof value !== 'boolean') return;
      this.state = normalizeGraphicsSettings({ ...this.state, ...this.effective, preset: 'custom', [key]: value });
    }
    this.resetSample();
    this.notify();
  }

  resetSample() { this.sample = { start: null, frames: 0 }; }

  sampleFrame(now, active) {
    if (!active || this.state.preset !== 'auto' || !Number.isFinite(now)) { this.resetSample(); return; }
    if (this.sample.start === null || now < this.sample.start) { this.sample.start = now; return; }
    this.sample.frames++;
    const elapsed = now - this.sample.start;
    if (elapsed < 3000) return;
    const fps = this.sample.frames * 1000 / elapsed, target = this.autoTarget;
    this.lastPerformance = { fps, target, step: this.autoStep, elapsed };
    this.sample = { start: now, frames: 0 };
    // Ignore isolated long frames. A full three seconds below 92% of target
    // lowers one step, including resolution after reaching Low. Never bounce
    // back up merely because a capped frame rate hides the remaining GPU load.
    if (fps < target * 0.92 && this.autoStep < AUTO_STEPS.length - 1) {
      this.autoStep++;
      this.notify(false);
    }
  }
}

export class GraphicsSettings {
  constructor({ app, frame, player, canvas, grain, fps, frameLimiter, preferences, button, sceneQuality = null, canSample = () => true, canOpen = () => true }) {
    Object.assign(this, { app, frame, player, canvas, grain, fps, frameLimiter, preferences, button, sceneQuality, canSample, canOpen });
    this.dialog = this.build();
    document.body.appendChild(this.dialog);
    this.button.hidden = false;
    this.button.addEventListener('click', () => this.open());
    this.preferences.onChange = () => this.apply();
    this.apply();
    // Pointer lock also covers the waking/drinking camera sequences, which
    // temporarily own movement but still need Auto's frame budget.
    app.on('frameend', () => this.preferences.sampleFrame(performance.now(),
      (player.active || document.pointerLockElement === canvas) && !this.dialog.open && !document.hidden && this.canSample()));
    const resetSample = () => this.preferences.resetSample();
    document.addEventListener('visibilitychange', resetSample);
    app.once('destroy', () => document.removeEventListener('visibilitychange', resetSample));
    window.addEventListener('keydown', event => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.code === 'KeyG' && this.dialog.open) { event.preventDefault(); this.close(); return; }
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName) || event.target?.isContentEditable) return;
      if (event.code === 'KeyG') { event.preventDefault(); this.dialog.open ? this.close() : this.open(); }
      if (/^Digit[123]$/.test(event.code)) this.setPreset(['low', 'medium', 'high'][Number(event.code.slice(-1)) - 1]);
    });
  }

  get settings() { return this.preferences.state; }
  get effective() { return this.preferences.effective; }
  setPreset(preset) { this.preferences.setPreset(preset); }
  setShowFps(value) { this.preferences.setOption('showFps', value); }

  apply() {
    const options = this.effective, signature = JSON.stringify(options);
    if (signature !== this.lastOptions) {
      this.sceneQuality?.apply(options);
      applyGraphicsOptions(this.frame, options);
      this.lastOptions = signature;
    }
    this.grain.hidden = !options.filmGrain;
    this.fps.setVisible(this.settings.showFps);
    this.frameLimiter.setLimit(this.settings.fpsLimit);
    this.refresh();
  }

  refresh() {
    this.dialog.querySelector('#graphics-preset').value = this.settings.preset;
    this.dialog.querySelector('#graphics-resolution').value = String(this.effective.resolutionScale);
    this.dialog.querySelector('#graphics-fps-limit').value = String(this.settings.fpsLimit);
    for (const key of EFFECTS) this.dialog.querySelector(`[data-option="${key}"]`).checked = this.effective[key];
    this.dialog.querySelector('[data-option="showFps"]').checked = this.settings.showFps;
    const quality = ['Low', 'Medium', 'High'][this.effective.quality - 1];
    this.dialog.querySelector('#graphics-current').textContent = this.settings.preset === 'auto' ? `Auto · ${quality} · ${Math.round(this.effective.resolutionScale * 100)}% · target ${this.preferences.autoTarget} FPS` : this.settings.preset === 'custom' ? 'Custom settings' : quality;
    this.dialog.querySelector('#graphics-save-note').textContent = this.preferences.canSave ? 'Changes apply immediately and save automatically.' : 'Changes apply immediately for this session.';
  }

  open() {
    if (!this.canOpen() || this.dialog.open) return;
    if (document.pointerLockElement) document.exitPointerLock?.();
    this.dialog.showModal();
    this.button.setAttribute('aria-expanded', 'true');
    this.dialog.querySelector('#graphics-preset').focus();
  }

  close() { this.dialog.close(); }

  build() {
    const dialog = document.createElement('dialog');
    dialog.id = 'graphics-dialog';
    dialog.className = 'graphics-dialog';
    dialog.setAttribute('aria-labelledby', 'graphics-title');
    const effects = [
      ['ambientOcclusion', 'Ambient occlusion', 'Contact shading around furniture.'],
      ['volumetricFog', 'Volumetric lighting', 'Subtle haze and visible light beams.'],
      ['bloom', 'Bloom', 'Soft glow around bright lights.'],
      ['taa', 'Temporal anti-aliasing', 'Smooth edges with a stable image.'],
      ['filmGrain', 'Film grain', 'A fine cinematic texture.'],
      ['showFps', 'Show FPS', 'Keep the frame-rate counter visible.'],
    ];
    dialog.innerHTML = `
      <header class="graphics-header"><div><p class="eyebrow">The Apartment</p><h2 id="graphics-title">Graphics</h2></div><button type="button" id="graphics-close" aria-label="Close graphics settings">✕</button></header>
      <p class="graphics-summary">Choose your balance of detail and performance. Presets also adjust shadow detail and display resolution.</p>
      <div class="graphics-select-row"><label for="graphics-preset">Quality preset</label><select id="graphics-preset"><option value="auto">Auto</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="custom">Custom</option></select></div>
      <p class="graphics-auto-note">Auto targets a steady 60 FPS and lowers detail or resolution when needed. VSync paces frames evenly on any display. <span id="graphics-current" role="status" aria-live="polite"></span></p>
      <div class="graphics-select-row"><label for="graphics-resolution">Resolution scale</label><select id="graphics-resolution"><option value="0.5">50% · fastest</option><option value="0.65">65%</option><option value="0.75">75%</option><option value="0.85">85%</option><option value="1">100%</option></select></div>
      <div class="graphics-select-row"><label for="graphics-fps-limit">FPS limit</label><select id="graphics-fps-limit"><option value="-1">VSync · smooth 60+</option><option value="30">30 FPS</option><option value="60">60 FPS</option><option value="90">90 FPS</option><option value="120">120 FPS</option><option value="0">Every refresh</option></select></div>
      <fieldset class="graphics-effects"><legend>Effects &amp; display</legend>${effects.map(([key, label, description]) => `<label class="graphics-toggle" for="graphics-${key}"><span><span class="graphics-option-title">${label}</span><small>${description}</small></span><input type="checkbox" id="graphics-${key}" data-option="${key}"></label>`).join('')}</fieldset>
      <footer class="graphics-footer"><p id="graphics-save-note"></p><button type="button" id="graphics-done">Done</button></footer>`;
    dialog.querySelector('#graphics-close').addEventListener('click', () => this.close());
    dialog.querySelector('#graphics-done').addEventListener('click', () => this.close());
    dialog.querySelector('#graphics-preset').addEventListener('change', event => this.setPreset(event.target.value));
    dialog.querySelector('#graphics-resolution').addEventListener('change', event => this.preferences.setOption('resolutionScale', Number(event.target.value)));
    dialog.querySelector('#graphics-fps-limit').addEventListener('change', event => this.preferences.setOption('fpsLimit', Number(event.target.value)));
    dialog.querySelectorAll('[data-option]').forEach(input => input.addEventListener('change', () => this.preferences.setOption(input.dataset.option, input.checked)));
    dialog.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const controls = [...dialog.querySelectorAll('button, select, input')].filter(control => !control.disabled && control.tabIndex >= 0);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    dialog.addEventListener('close', () => {
      this.button.setAttribute('aria-expanded', 'false');
      if (!document.pointerLockElement) this.button.focus();
    });
    return dialog;
  }
}
