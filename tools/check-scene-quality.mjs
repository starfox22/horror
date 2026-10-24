import test from 'node:test';
import assert from 'node:assert/strict';
import { SHADOWUPDATE_REALTIME, SHADOWUPDATE_NONE, SHADOWUPDATE_THISFRAME, SHADOW_PCF1_32F, SHADOW_PCF5_32F } from 'playcanvas';
import { SceneQuality, sceneQualityOptions, backingPixelRatio } from '../src/scene-quality.js';
import { Rain } from '../src/rain.js';

// A 4K high-DPI display must not silently turn the Low preset into eight times
// the work of a laptop. The image and HUD still fill the same CSS viewport.
test('backing buffers respect each preset pixel budget on large and high-DPI screens', () => {
  for (const quality of [1, 2, 3]) for (const [width, height, dpr] of [[1280, 720, 1], [1920, 1080, 2], [3840, 2160, 2]]) {
    const options = sceneQualityOptions(quality), ratio = backingPixelRatio(options, width, height, dpr);
    assert.ok(width * height * ratio ** 2 <= options.maxPixels + 1);
    assert.ok(ratio <= options.maxPixelRatio);
    assert.ok(ratio <= dpr);
  }
  assert.equal(backingPixelRatio(sceneQualityOptions(1), 1280, 720, 1), 1);
});

test('quality changes preserve every light occluder, cookie and realtime shadow ownership', () => {
  const lights = [
    { entity: { name: 'flashlight beam' }, type: 'spot', shadowResolution: 1024, castShadows: true, cookie: {}, shadowUpdateMode: SHADOWUPDATE_REALTIME },
    { entity: { name: 'flashlight bounce' }, type: 'spot', shadowResolution: 256, castShadows: true, shadowUpdateMode: SHADOWUPDATE_REALTIME },
    { entity: { name: 'refrigerator interior' }, type: 'spot', shadowResolution: 512, castShadows: true, enabled: false, shadowUpdateMode: SHADOWUPDATE_NONE },
    { entity: { name: 'moon' }, type: 'directional', shadowResolution: 2048, castShadows: true, enabled: false, shadowUpdateMode: SHADOWUPDATE_NONE },
  ];
  const texture = { anisotropy: 8 };
  const app = { scene: { lighting: { shadowsEnabled: true, cookiesEnabled: true, maxLightsPerCell: 32 } }, graphicsDevice: { canvas: { clientWidth: 1920, clientHeight: 1080 }, maxPixelRatio: 1.5, maxAnisotropy: 8 }, once() {}, resizeCanvas() {},
    root: { findComponents: type => type === 'light' ? lights : [{ meshInstances: [{ material: { normalMap: texture } }] }] } };
  const controller = new SceneQuality(app, { window: null });
  controller.apply({ quality: 1 });
  assert.equal(app.scene.lighting.shadowAtlasResolution, 2048);
  assert.equal(app.scene.lighting.shadowType, SHADOW_PCF1_32F);
  assert.equal(app.scene.lighting.maxLightsPerCell, 32, 'never reduce cluster capacity and silently drop lights');
  assert.equal(app.scene.lighting.shadowsEnabled, true);
  assert.equal(app.scene.lighting.cookiesEnabled, true);
  assert.ok(lights.every(light => light.castShadows));
  assert.equal(lights[0].shadowUpdateMode, SHADOWUPDATE_REALTIME);
  assert.equal(lights[1].shadowUpdateMode, SHADOWUPDATE_REALTIME);
  assert.equal(lights[2].shadowUpdateMode, SHADOWUPDATE_THISFRAME);
  assert.equal(lights[2].enabled, false, 'quality must not switch a closed fridge lamp on');
  assert.equal(texture.anisotropy, 2);
  assert.equal(lights[0].shadowResolution, 512);
  assert.equal(lights[1].shadowResolution, 256);
  controller.apply({ quality: 3 });
  assert.equal(app.scene.lighting.shadowType, SHADOW_PCF5_32F);
  assert.equal(app.scene.lighting.shadowAtlasResolution, 4096);
  assert.equal(lights[0].shadowResolution, 1024, 'returning to High restores original detail');
  assert.equal(lights[3].shadowResolution, 2048);
  assert.equal(texture.anisotropy, 8);
});

test('wet-glass uploads and merges are bounded independently from lightning and frame rate', () => {
  for (const hz of [60, 120, 144]) for (const rainHz of [10, 12, 15, 20, 30]) {
    const rain = { timer: 0, rainHz, lightningTime: 0, dropTime: 0, uploads: 0,
      lightning(dt) { this.lightningTime += dt; },
      updateDroplets(dt) { this.dropTime += dt; }, draw() { this.uploads++; } };
    for (let frame = 0; frame < hz * 10; frame++) Rain.prototype.update.call(rain, 1 / hz);
    assert.equal(rain.uploads, rainHz * 10);
    assert.ok(Math.abs(rain.lightningTime - 10) < 1e-6);
    assert.ok(Math.abs(rain.dropTime - 10) < 1e-6);
  }
});


test('jittered rain scheduling never repays fractional time twice', () => {
  for (const hz of [120, 144]) for (const rainHz of [10, 12, 15, 20, 30]) {
    const rain = { timer: 0, rainHz, lightningTime: 0, dropTime: 0, uploads: 0,
      lightning(dt) { this.lightningTime += dt; }, updateDroplets(dt) { this.dropTime += dt; }, draw() { this.uploads++; } };
    let elapsed = 0;
    for (let frame = 0; frame < hz * 10; frame++) {
      const dt = 1 / hz + (frame % 3 - 1) * 0.0002;
      elapsed += dt;
      Rain.prototype.update.call(rain, dt);
    }
    assert.ok(Math.abs(rain.uploads - rainHz * 10) <= 1);
    assert.ok(Math.abs(rain.lightningTime - elapsed) < 1e-6);
    assert.ok(rain.dropTime <= elapsed + 1e-6);
    assert.ok(elapsed - rain.dropTime < 1 / rainHz + 1 / hz);
  }
});
