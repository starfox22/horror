// Graphics preferences must affect real render options, survive reloads, and
// continue working when browser storage is unavailable.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GraphicsPreferences, GRAPHICS_STORAGE_KEY, normalizeGraphicsSettings } from '../src/graphics-settings.js';
import { applyGraphicsOptions, qualityOptions, setQuality } from '../src/post.js';

function storage(initial = null) {
  let data = initial, writes = 0;
  return { getItem: key => key === GRAPHICS_STORAGE_KEY ? data : null,
    setItem(key, value) { assert.equal(key, GRAPHICS_STORAGE_KEY); data = value; writes++; },
    get data() { return data; }, get writes() { return writes; } };
}

function sample(prefs, start, fps) {
  prefs.sampleFrame(start, true);
  for (let frame = 1; frame <= fps * 4; frame++) prefs.sampleFrame(start + frame * 1000 / fps, true);
}

test('fresh and corrupt preferences default to Auto and visible FPS', () => {
  for (const value of [null, '{broken', 'false', '[]', '{"showFps":"false","preset":"ultra","resolutionScale":9}']) {
    const prefs = new GraphicsPreferences({ storage: storage(value) });
    assert.equal(prefs.state.preset, 'auto');
    assert.equal(prefs.state.showFps, true);
    assert.equal(prefs.effective.resolutionScale, 1);
  }
  assert.deepEqual(normalizeGraphicsSettings(null), normalizeGraphicsSettings({}));
});

test('user settings survive reload; FPS changes do not silently choose another preset', () => {
  const store = storage(), prefs = new GraphicsPreferences({ storage: store });
  prefs.setPreset('medium');
  prefs.setOption('showFps', false);
  assert.equal(prefs.state.preset, 'medium');
  prefs.setOption('resolutionScale', 0.85);
  prefs.setOption('taa', false);
  const reloaded = new GraphicsPreferences({ storage: store });
  assert.equal(reloaded.state.preset, 'custom');
  assert.equal(reloaded.state.showFps, false);
  assert.equal(reloaded.effective.resolutionScale, 0.85);
  assert.equal(reloaded.effective.taa, false);
  assert.equal(reloaded.effective.volumetricFog, false, 'custom options retain the selected Medium effects');
});

test('customizing an adapted Auto preset retains the settings actually in use', () => {
  const prefs = new GraphicsPreferences();
  sample(prefs, 0, 20);
  assert.equal(prefs.autoQuality, 2);
  prefs.setOption('bloom', false);
  assert.equal(prefs.state.preset, 'custom');
  assert.equal(prefs.effective.quality, 2);
  assert.equal(prefs.effective.volumetricFog, false);
  assert.equal(prefs.effective.ambientOcclusion, true);
  assert.equal(prefs.effective.bloom, false);
});

test('Auto samples wall-clock performance only while playing and preserves Auto on disk', () => {
  const store = storage(), prefs = new GraphicsPreferences({ storage: store });
  prefs.setPreset('auto');
  sample(prefs, 0, 20);
  assert.equal(prefs.autoQuality, 2);
  prefs.sampleFrame(200000, false);
  sample(prefs, 210000, 30);
  assert.equal(prefs.autoQuality, 2, 'time spent paused must not count as poor performance');
  sample(prefs, 214000, 20);
  assert.equal(prefs.autoQuality, 1);
  assert.equal(store.writes, 1, 'automatic runtime changes must not replace the saved preference');
  assert.equal(JSON.parse(store.data).preset, 'auto');
  prefs.setPreset('high');
  sample(prefs, 300000, 5);
  assert.equal(prefs.effective.quality, 3, 'a manual preset must remain manual');
});

test('privacy-mode storage errors and temporary hash overrides do not break settings', () => {
  const unavailable = { getItem() { throw new Error('Storage blocked'); }, setItem() { throw new Error('Storage blocked'); } };
  const prefs = new GraphicsPreferences({ storage: unavailable });
  assert.doesNotThrow(() => prefs.setPreset('low'));
  assert.doesNotThrow(() => prefs.setOption('showFps', false));
  assert.equal(prefs.effective.quality, 1);
  const store = storage(JSON.stringify({ preset: 'low', showFps: false }));
  const overridden = new GraphicsPreferences({ storage: store, qualityOverride: '3', forceFps: true });
  assert.equal(overridden.effective.quality, 3);
  assert.equal(overridden.state.showFps, true);
  assert.equal(store.writes, 0, 'debug URL options must not overwrite saved preferences on load');
  assert.equal(JSON.parse(store.data).preset, 'low');
});

test('render controls apply independently to CameraFrame and quality hotkeys share the same presets', () => {
  const frame = { rendering: {}, volumetricFog: {}, ssao: {}, bloom: {}, taa: {}, updates: 0, update() { this.updates++; } };
  applyGraphicsOptions(frame, { ...qualityOptions(3), resolutionScale: 0.5, ambientOcclusion: false, volumetricFog: false, bloom: false, taa: false });
  assert.equal(frame.rendering.renderTargetScale, 0.5);
  assert.equal(frame.ssao.type, 'none');
  assert.equal(frame.volumetricFog.enabled, false);
  assert.equal(frame.bloom.intensity, 0);
  assert.equal(frame.taa.enabled, false);
  setQuality(frame, 2);
  assert.equal(frame.rendering.renderTargetScale, 1);
  assert.equal(frame.volumetricFog.enabled, false);
  assert.notEqual(frame.ssao.type, 'none');
  assert.equal(frame.taa.enabled, true);
  assert.ok(frame.bloom.intensity > 0);
  assert.equal(frame.updates, 2);
});
