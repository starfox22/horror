// The indoor camera ("Home Cam", docs/STORY.md): on the bedroom wall above the right nightstand, looking across the bed
// to the wardrobe. LIVE renders the room for real into a small target, made infrared (grey, contrasty, pale things
// blooming white, grain, vignette) by one blit pass; the clips (00:47, 02:58, and the still for Sweet Dreams) were
// recorded the same way ahead of time (tools/bake-clips.mjs) and play from a sprite sheet.
// LIVE is also a scene: he comes out of the wardrobe, crosses the room to the lens, looks up into it, and leaves the frame;
// with the cloud camera's 8 s lag, the power dies the moment he is gone (story.js huntStart).
import { Color, Entity, RenderTarget, Texture, Vec3, PIXELFORMAT_RGBA8, FILTER_LINEAR, ADDRESS_CLAMP_TO_EDGE, TONEMAP_ACES, GAMMA_SRGB,
  ShaderUtils, SEMANTIC_POSITION, BlendState, drawQuadWithShader } from 'playcanvas';

export const CAM = { pos: [14.12, 1.98, 2.18], look: [10.6, 0.85, 0.05], fov: 96 };
const RW = 384, RH = 216;

export class Seccam {
  constructor({ app, camera, intruder, closets, nest, story, bank }) {
    Object.assign(this, { app, intruder, closets, nest, story, bank });
    const device = app.graphicsDevice;
    const tex = (name) => new Texture(device, { name, width: RW, height: RH, format: PIXELFORMAT_RGBA8, mipmaps: false, minFilter: FILTER_LINEAR, magFilter: FILTER_LINEAR,
      addressU: ADDRESS_CLAMP_TO_EDGE, addressV: ADDRESS_CLAMP_TO_EDGE });
    this.raw = tex('seccam-raw'); this.ir = tex('seccam-ir');
    this.rt = new RenderTarget({ name: 'seccam', colorBuffer: this.raw, depth: true });
    this.irTarget = new RenderTarget({ name: 'seccam-ir', colorBuffer: this.ir, depth: false });
    this.entity = new Entity('security camera');
    this.entity.addComponent('camera', { fov: CAM.fov, nearClip: 0.05, farClip: 30, clearColor: new Color(0, 0, 0), layers: camera.camera.layers,
      priority: -5, toneMapping: TONEMAP_ACES, gammaCorrection: GAMMA_SRGB });
    this.entity.camera.renderTarget = this.rt;
    this.entity.camera.enabled = false;
    this.entity.setPosition(...CAM.pos); this.entity.lookAt(new Vec3(...CAM.look));
    app.root.addChild(this.entity);
    this.shader = ShaderUtils.createShader(device, {
      uniqueName: 'seccamInfrared', attributes: { vertex_position: SEMANTIC_POSITION },
      vertexGLSL: `attribute vec2 vertex_position; varying vec2 vUv0;
        void main(void) { gl_Position = vec4(vertex_position, 0.5, 1.0); vUv0 = getImageEffectUV(vertex_position * 0.5 + 0.5); }`,
      fragmentGLSL: `varying vec2 vUv0; uniform sampler2D irSource; uniform float irTime; uniform float irGain;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + irTime * 61.7) * 43758.5453); }
        void main(void) {
          vec3 c = textureLod(irSource, vUv0, 0.0).rgb;
          float l = dot(c, vec3(0.299, 0.587, 0.114)) * irGain;
          l = l / (1.0 + l * 0.35);
          l = smoothstep(0.02, 0.9, l);
          vec2 d = vUv0 - 0.5; float vig = 1.0 - dot(d, d) * 1.6;
          float n = (hash(floor(vUv0 * vec2(384.0, 216.0))) - 0.5) * 0.16;
          float scan = 0.97 + 0.03 * sin(vUv0.y * 216.0 * 3.14159);
          float g = clamp((l + n) * vig * scan, 0.0, 1.0);
          gl_FragColor = vec4(g * 0.92, g, g * 0.94, 1.0);
        }`,
      // WGSL: one declaration per line (the engine reads them line by line; see probes.js).
      vertexWGSL: `
attribute vertex_position: vec2f;
varying vUv0: vec2f;
@vertex fn vertexMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  output.position = vec4f(input.vertex_position, 0.5, 1.0);
  output.vUv0 = getImageEffectUV(input.vertex_position * 0.5 + vec2f(0.5));
  return output;
}`,
      fragmentWGSL: `
varying vUv0: vec2f;
var irSource: texture_2d<f32>;
var irSourceSampler: sampler;
uniform irTime: f32;
uniform irGain: f32;
fn hash(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(12.9898, 78.233)) + uniform.irTime * 61.7) * 43758.5453); }
@fragment fn fragmentMain(input: FragmentInput) -> FragmentOutput {
  var output: FragmentOutput;
  let c: vec3f = textureSampleLevel(irSource, irSourceSampler, input.vUv0, 0.0).rgb;
  var l: f32 = dot(c, vec3f(0.299, 0.587, 0.114)) * uniform.irGain;
  l = l / (1.0 + l * 0.35);
  l = smoothstep(0.02, 0.9, l);
  let d: vec2f = input.vUv0 - vec2f(0.5);
  let vig: f32 = 1.0 - dot(d, d) * 1.6;
  let n: f32 = (hash(floor(input.vUv0 * vec2f(384.0, 216.0))) - 0.5) * 0.16;
  let scan: f32 = 0.97 + 0.03 * sin(input.vUv0.y * 216.0 * 3.14159);
  let g: f32 = clamp((l + n) * vig * scan, 0.0, 1.0);
  output.color = vec4f(g * 0.92, g, g * 0.94, 1.0);
  return output;
}`,
    });
    this.uSource = device.scope.resolve('irSource'); this.uTime = device.scope.resolve('irTime'); this.uGain = device.scope.resolve('irGain');
    this.clips = {};
    this.live = null; this.clip = null; this.frameSkip = 0;
    app.on('framerender', () => {});
    app.on('postrender', () => this.blit());
    app.on('update', dt => this.update(dt));
  }

  // The infrared pass after the camera has drawn (every other frame while LIVE is on).
  blit() {
    if (!this.entity.camera.enabled) return;
    const device = this.app.graphicsDevice;
    device.setBlendState(BlendState.NOBLEND);
    this.uSource.setValue(this.raw); this.uTime.setValue((performance.now() / 1000) % 100); this.uGain.setValue(2.6);
    drawQuadWithShader(device, this.irTarget, this.shader);
  }

  // --- clips -------------------------------------------------------------------------------------------------------
  async loadClip(id) {
    if (this.clips[id]) return this.clips[id];
    const meta = await fetch(new URL(`./assets/clips/${id}.json`, location.href)).then(r => r.ok ? r.json() : null).catch(() => null);
    if (!meta) return null;
    const img = new Image(); img.src = new URL(`./assets/clips/${id}.jpg`, location.href).href;
    await img.decode().catch(() => {});
    const canvas = Object.assign(document.createElement('canvas'), { width: meta.w, height: meta.h });
    const texture = new Texture(this.app.graphicsDevice, { width: meta.w, height: meta.h, format: PIXELFORMAT_RGBA8, mipmaps: false, name: `clip-${id}` });
    return (this.clips[id] = { meta, img, canvas, g: canvas.getContext('2d'), texture });
  }

  async playClip(id, videoMat) {
    this.stopLive();
    const c = await this.loadClip(id);
    if (!c) return;
    this.clip = { c, t: 0, frame: -1, videoMat };
    videoMat.emissiveMap = c.texture; videoMat.update();
  }

  // A still (Sweet Dreams): draws the clip's frame into an image URL for the overlay.
  async still(id, frame = 0) {
    const c = await this.loadClip(id); if (!c) return '';
    const { w, h, cols } = c.meta;
    c.g.drawImage(c.img, (frame % cols) * w, Math.floor(frame / cols) * h, w, h, 0, 0, w, h);
    return c.canvas.toDataURL('image/jpeg', 0.9);
  }

  // --- LIVE --------------------------------------------------------------------------------------------------------
  startLive(videoMat, inBedroom) {
    this.clip = null;
    videoMat.emissiveMap = this.ir; videoMat.update();
    const dead = this.story?.has('hunt');
    this.live = { t: 0, videoMat, inBedroom, scene: null, dead };
    this.entity.camera.enabled = !dead;
  }

  stopLive() { this.live = null; this.entity.camera.enabled = false; }

  liveStatus() {
    const l = this.live; if (!l) return '';
    if (l.dead) return 'connection lost';
    if (l.inBedroom()) return 'connecting…';
    return '8 s delay';
  }

  // The scene on the feed (dev menu: play it without the phone).
  runLive() { this.startScene(); }

  startScene() {
    if (this.story?.has('live') || this.story?.has('hunt')) return;
    this.story?.liveWatched();
    const right = this.closets?.doors.find(d => d.id === 'right');
    if (right && right.angle < 0.6) { right.angle = 0.9; right.target = 0.9; right.openRequested = true; right.pivot.setEulerAngles(0, right.sign * 100 * 0.9, 0); }
    this.scene = { t: 0, step: 0 };
  }

  update(dt) {
    dt = Math.min(dt, 0.1);
    const clip = this.clip;
    if (clip) {
      clip.t += dt;
      const { meta, img, g, texture } = clip.c, f = Math.min(meta.frames - 1, Math.floor(clip.t * meta.fps));
      if (f !== clip.frame) {
        clip.frame = f;
        g.drawImage(img, (f % meta.cols) * meta.w, Math.floor(f / meta.cols) * meta.h, meta.w, meta.h, 0, 0, meta.w, meta.h);
        texture.setSource(clip.c.canvas);
      }
    }
    const live = this.live;
    if (live && !live.dead) {
      // Half rate: the camera draws on every other frame (a cheap camera's stutter, and half the cost).
      this.frameSkip ^= 1;
      this.entity.camera.enabled = this.frameSkip === 0;
      if (!this.scene && !live.inBedroom() && !this.story?.has('live')) { live.t += dt; if (live.t > 2.5) this.startScene(); }
    }
    if (this.scene) this.updateScene(dt);
  }

  // He comes down, steps out, crosses to the lens, looks up into it, and leaves the frame.
  updateScene(dt) {
    const s = this.scene, man = this.intruder;
    s.t += dt;
    const at = (t, fn) => { if (s.t >= t && !s[`done${t}`]) { s[`done${t}`] = true; fn(); } };
    at(0.5, () => { this.nest?.dust(3); this.bank?.play('creak_long', { at: [9.6, 2.7, -0.1], gain: 0.4, occlude: false }); });
    at(2.6, () => { man.show(true); man.setTorch(false); man.place(9.5, -0.12, 90, 0.17); man.play('crouch_idle', { blend: 0 }); });
    at(3.4, () => man.play('crouch_out', { blend: 0.2 }));
    at(6.4, () => { s.path = [[10.2, 0.05], [11.3, 1.95], [13.55, 1.97]]; s.leg = 0; man.play('walk_slow_01', { blend: 0.4 }); });
    if (s.path && s.leg < s.path.length) {
      const [tx, tz] = s.path[s.leg], dx = tx - man.pos.x, dz = tz - man.pos.z, d = Math.hypot(dx, dz), v = 0.9 * dt;
      const yaw = Math.atan2(dx, dz) * 180 / Math.PI;
      if (d < v) { s.leg++; } else man.place(man.pos.x + dx / d * v, man.pos.z + dz / d * v, yaw, 0.17);
      if (s.leg === s.path.length) { s.pathDone = s.t; man.play('idle_breathe_01', { blend: 0.5 }); }
    }
    if (s.pathDone) {
      // Under the lens: face it and look up into it.
      const k = Math.min(1, (s.t - s.pathDone) / 0.8);
      man.place(man.pos.x, man.pos.z, man.yaw + ((90 - man.yaw) * k * dt * 3), 0.17);
      man.headPitch = -38 * Math.min(1, (s.t - s.pathDone) / 1.2);
      if (s.t - s.pathDone > 4.2 && !s.leaving) { s.leaving = true; man.headPitch = 0; s.path2 = [[11.2, 2.15], [10.45, 2.45], [10.4, 3.3]]; s.leg2 = 0; man.play('walk_slow_01', { blend: 0.4 }); }
    }
    if (s.path2 && s.leg2 < s.path2.length) {
      const [tx, tz] = s.path2[s.leg2], dx = tx - man.pos.x, dz = tz - man.pos.z, d = Math.hypot(dx, dz), v = 1.0 * dt;
      if (d < v) s.leg2++; else man.place(man.pos.x + dx / d * v, man.pos.z + dz / d * v, Math.atan2(dx, dz) * 180 / Math.PI, 0.17);
      if (s.leg2 === s.path2.length) {
        man.show(false);
        this.scene = null;
        if (this.live) this.live.dead = true;
        this.entity.camera.enabled = false;
        this.story?.huntStart('live');
      }
    }
  }
}
