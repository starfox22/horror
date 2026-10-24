// The same light still casts the same occlusion at every preset. Lower presets
// reduce shadow filtering/map cost and the backing buffer, never remove walls'
// shadows or disable cookies (which would change the authored light falloff).
import { SHADOW_PCF1_32F, SHADOW_PCF3_32F, SHADOW_PCF5_32F, SHADOWUPDATE_REALTIME, SHADOWUPDATE_THISFRAME } from 'playcanvas';

export function sceneQualityOptions(quality) {
  const q = [1, 2, 3].includes(quality) ? quality : 3;
  return { shadowAtlas: q === 3 ? 4096 : 2048, cookieAtlas: q === 1 ? 1024 : 2048,
    shadowType: [SHADOW_PCF1_32F, SHADOW_PCF3_32F, SHADOW_PCF5_32F][q - 1],
    lampResolution: q === 1 ? 256 : 512, torchResolution: q === 1 ? 512 : 1024,
    moonResolution: q === 3 ? 2048 : 1024,
    maxPixelRatio: q === 3 ? 1.5 : 1,
    maxPixels: [1280 * 720, 1920 * 1080, 2560 * 1440][q - 1],
    anisotropy: [2, 4, 8][q - 1], rainHz: [10, 15, 20][q - 1] };
}

// Limits high-DPI / 4K fill cost before the user's resolution percentage is
// applied. CSS canvas/HUD size stays unchanged. Returns a device pixel ratio.
export function backingPixelRatio(options, width, height, deviceRatio = 1) {
  const area = Math.max(1, width * height);
  return Math.min(deviceRatio || 1, options.maxPixelRatio, Math.sqrt(options.maxPixels / area));
}

export class SceneQuality {
  constructor(app, { rain = null, window: ownerWindow = globalThis.window } = {}) {
    Object.assign(this, { app, rain, ownerWindow });
    this.originalLights = new WeakMap();
    this.resize = () => this.applyResolution();
    ownerWindow?.addEventListener('resize', this.resize);
    app.once('destroy', () => ownerWindow?.removeEventListener('resize', this.resize));
  }

  apply(options) {
    const q = options.quality;
    if (q === this.quality) return;
    this.quality = q;
    const detail = this.detail = sceneQualityOptions(q), lighting = this.app.scene.lighting;
    lighting.shadowAtlasResolution = detail.shadowAtlas;
    lighting.cookieAtlasResolution = detail.cookieAtlas;
    lighting.shadowType = detail.shadowType;
    for (const light of this.app.root.findComponents('light')) {
      if (!light.castShadows) continue;
      if (!this.originalLights.has(light)) this.originalLights.set(light, light.shadowResolution);
      const maxResolution = light.type === 'directional' ? detail.moonResolution : /flashlight beam/.test(light.entity.name) ? detail.torchResolution : detail.lampResolution;
      light.shadowResolution = Math.min(this.originalLights.get(light), maxResolution);
      light.shadowType = detail.shadowType;
      // Reallocating a shadow atlas invalidates cached tiles. Keep the two
      // moving flashlight lights realtime; request one refresh for static lamps.
      if (light.shadowUpdateMode !== SHADOWUPDATE_REALTIME) light.shadowUpdateMode = SHADOWUPDATE_THISFRAME;
    }
    const textures = new Set();
    for (const render of this.app.root.findComponents('render')) for (const instance of render.meshInstances) {
      for (const name of ['diffuseMap', 'normalMap', 'metalnessMap', 'glossMap', 'aoMap', 'emissiveMap', 'opacityMap']) {
        const texture = instance.material[name];
        if (texture && !textures.has(texture)) {
          textures.add(texture);
          texture.anisotropy = Math.min(detail.anisotropy, this.app.graphicsDevice.maxAnisotropy || 1);
        }
      }
    }
    this.rain?.setQuality?.(q);
    this.applyResolution();
  }

  applyResolution() {
    if (!this.detail) return;
    const device = this.app.graphicsDevice, canvas = device.canvas;
    const ratio = backingPixelRatio(this.detail, canvas.clientWidth || this.ownerWindow?.innerWidth || 1,
      canvas.clientHeight || this.ownerWindow?.innerHeight || 1, this.ownerWindow?.devicePixelRatio || 1);
    if (Math.abs(device.maxPixelRatio - ratio) < 0.001) return;
    device.maxPixelRatio = ratio;
    this.app.resizeCanvas();
  }
}
