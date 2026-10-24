import { applyGraphicsOptions, qualityOptions } from './post.js';
import { DEFAULT_FRAME_LIMIT, FRAME_LIMITS } from './frame-limiter.js';

export const GRAPHICS_STORAGE_KEY = 'horror.graphics.v1';
const PRESETS = { low: 1, medium: 2, high: 3 };
const EFFECTS = ['ambientOcclusion', 'volumetricFog', 'bloom', 'taa', 'filmGrain'];
const SCALES = [0.5, 0.75, 0.85, 1];

export function normalizeGraphicsSettings(value) {
  const source = value && typeof value === 'object' ? value : {};
  const defaults = { preset: 'auto', ...qualityOptions(3), showFps: true, fpsLimit: DEFAULT_FRAME_LIMIT };
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
    try { raw = storage?.getItem(GRAPHICS_STORAGE_KEY); } catch { this.canSave = false; }
    try { saved = JSON.parse(raw || 'null'); } catch { /* corrupt data falls back to defaults */ }
    this.state = normalizeGraphicsSettings(saved);
    const quality = Number(qualityOverride);
    if ([1, 2, 3].includes(quality)) this.state.preset = ['low', 'medium', 'high'][quality - 1];
    if (forceFps) this.state.showFps = true;
    this.autoQuality = 3;
    this.resetSample();
  }

  get effective() {
    if (this.state.preset === 'custom') return Object.fromEntries(['quality', 'resolutionScale', ...EFFECTS].map(key => [key, this.state[key]]));
    return qualityOptions(this.state.preset === 'auto' ? this.autoQuality : PRESETS[this.state.preset]);
  }

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
    this.autoQuality = 3;
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
    if (!active || this.state.preset !== 'auto' || this.autoQuality === 1) { this.resetSample(); return; }
    if (this.sample.start === null) { this.sample.start = now; return; }
    this.sample.frames++;
    const elapsed = now - this.sample.start;
    if (elapsed < 4000) return;
    const fps = this.sample.frames * 1000 / elapsed;
    this.sample = { start: now, frames: 0 };
    // A deliberately selected 30 FPS cap is healthy performance. Only lower
    // quality when measured rendering falls meaningfully below its target.
    const threshold = Math.min(this.autoQuality === 3 ? 40 : 24, this.state.fpsLimit ? this.state.fpsLimit * 0.8 : Infinity);
    if (fps < threshold) {
      this.autoQuality--;
      this.notify(false);       // retain Auto as the saved preference, not a transient hardware result
    }
  }
}

export class GraphicsSettings {
  constructor({ app, frame, player, canvas, grain, fps, frameLimiter, preferences, button, canOpen = () => true }) {
    Object.assign(this, { app, frame, player, canvas, grain, fps, frameLimiter, preferences, button, canOpen });
    this.dialog = this.build();
    document.body.appendChild(this.dialog);
    this.button.hidden = false;
    this.button.addEventListener('click', () => this.open());
    this.preferences.onChange = () => this.apply();
    this.apply();
    app.on('update', () => this.preferences.sampleFrame(performance.now(), player.active && !this.dialog.open));
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
    this.dialog.querySelector('#graphics-current').textContent = this.settings.preset === 'auto' ? `Auto · ${quality}` : this.settings.preset === 'custom' ? 'Custom settings' : quality;
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
      <p class="graphics-summary">Choose your balance of detail and performance.</p>
      <div class="graphics-select-row"><label for="graphics-preset">Quality preset</label><select id="graphics-preset"><option value="auto">Auto</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="custom">Custom</option></select></div>
      <p class="graphics-auto-note">Auto lowers quality when needed while you play. <span id="graphics-current" role="status" aria-live="polite"></span></p>
      <div class="graphics-select-row"><label for="graphics-resolution">Resolution scale</label><select id="graphics-resolution"><option value="0.5">50% · fastest</option><option value="0.75">75%</option><option value="0.85">85%</option><option value="1">100% · native</option></select></div>
      <div class="graphics-select-row"><label for="graphics-fps-limit">FPS limit</label><select id="graphics-fps-limit"><option value="30">30 FPS</option><option value="60">60 FPS</option><option value="90">90 FPS</option><option value="120">120 FPS</option><option value="0">Uncapped</option></select></div>
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
