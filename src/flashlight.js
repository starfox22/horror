// The flashlight: a Maglite-style torch ("Flash-Lite Flashlight", CC BY 4.0) lying on the shelf behind the bedroom
// wardrobe's left door until picked up (E); then, as in P.T., the torch itself is never seen: only its beam, held in the
// right hand below the eye, so its shadows shift as you look around. F toggles it.
// The beam: a shadow-casting spot with a reflector cookie (hot spot, corona ring, wide dim spill, faint lens flaws) that
// scatters in the room haze; the hand trails the view, sways with each step and has a slight tremor; switching on
// stutters for a moment; a weak, shadowed return from the first actual surface lifts the nearby room.
import { BoundingBox, Color, Entity, Quat, Texture, Vec3, PIXELFORMAT_RGBA8, ADDRESS_CLAMP_TO_EDGE,
  LIGHTFALLOFF_INVERSESQUARED, SHADOWUPDATE_REALTIME, MASK_AFFECT_DYNAMIC, MASK_AFFECT_LIGHTMAPPED } from 'playcanvas';

// The lightmapped bit marks the torch's lights for the probes' clustered-light patch (probes.js): they light the
// player's view but never a probe capture. (Nothing in the flat is lightmapped, so the bit has no other effect.)
const PLAYER_ONLY = MASK_AFFECT_DYNAMIC | MASK_AFFECT_LIGHTMAPPED;
import { FlashlightSurfaces } from './flashlight-surfaces.js';

const HAND = new Vec3(0.15, -0.20, -0.12);    // the lamp's head relative to the eye (right hand, chest height)
export const BEAM_SIZE = 27;                  // cone angle (degrees), developer menu can change it
const BEAM = 8;                              // intensity
const COLOR = new Color(1, 0.94, 0.84);        // a warm-white LED torch

// Use actual transformed vertices when available. A tilted cylinder's transformed
// bounding box includes empty corners and would make the torch float above the shelf.
export function flashlightBounds(renders) {
  const min = new Vec3(Infinity, Infinity, Infinity), max = new Vec3(-Infinity, -Infinity, -Infinity);
  const point = new Vec3(), positions = [];
  for (const render of renders) for (const mi of render.meshInstances) {
    positions.length = 0;
    const count = mi.mesh?.getPositions?.(positions) || 0;
    if (count) {
      const transform = (mi.node || render.entity).getWorldTransform();
      for (let i = 0; i < count * 3; i += 3) {
        transform.transformPoint(point.set(positions[i], positions[i + 1], positions[i + 2]), point);
        min.min(point); max.max(point);
      }
    } else {
      min.min(mi.aabb.getMin()); max.max(mi.aabb.getMax());
    }
  }
  const bounds = new BoundingBox();
  bounds.setMinMax(min, max);
  return bounds;
}

// Reuse the downloaded model's complete assembly and authored orientation. The
// apartment stores both body and lens under the floor; neither is a placement origin.
export function placeFlashlightOnShelf(apartment, spot) {
  const root = new Entity('flashlight');
  const renders = apartment.findComponents('render').filter(render =>
    render.meshInstances.some(mi => mi.material.name.startsWith('Prop_flashlight.')));
  if (!renders.length) throw new Error('The apartment is missing its flashlight model');
  const poses = [...new Set(renders.map(render => render.entity))].map(entity => ({
    entity, position: entity.getPosition().clone(), rotation: entity.getRotation().clone(),
    scale: entity.getWorldTransform().getScale(),
  }));
  for (const { entity, position, rotation, scale } of poses) {
    entity.reparent(root);
    entity.setPosition(position); entity.setRotation(rotation); entity.setLocalScale(scale);
  }
  const centre = flashlightBounds(renders).center.clone();
  for (const { entity } of poses) entity.setLocalPosition(entity.getLocalPosition().clone().sub(centre));
  const orientation = new Quat().setFromEulerAngles(0, spot.yaw ?? 90, 0);
  // A tiny nose-up tilt lets the wider head and narrower tail both rest naturally.
  orientation.mul(new Quat().setFromEulerAngles(spot.pitch ?? 0, 0, 0));
  root.setRotation(orientation);
  const bounds = flashlightBounds(renders);
  const x = spot.x ?? spot.pos.x, z = spot.z ?? spot.pos.z;
  const shelf = spot.shelf ?? spot.pos.y, clearance = spot.clearance ?? 0.0008;
  root.setPosition(x - bounds.center.x, shelf + clearance - bounds.getMin().y, z - bounds.center.z);
  return { root, renders, bounds: flashlightBounds(renders) };
}

export class Flashlight {
  // spot: { pos (shelf anchor) or x/z, shelf (surface height), yaw, pitch, clearance }
  constructor(app, camera, apartment, interactions, sounds, hud, spot, grid, player) {
    this.app = app;
    this.camera = camera;
    this.sounds = sounds;
    this.hud = hud;
    this.grid = grid;
    this.player = player;
    this.surfaces = new FlashlightSurfaces(app.root);
    this.surfaceTimer = 0;
    this.held = false;
    this.on = false;
    this.power = 0;           // 0..1, eased (flicker on start)
    this.rot = new Quat();
    this.time = 0;
    this.model = this.build(apartment, spot);
    app.root.addChild(this.model);
    const rest = this.restBounds.center.clone();
    this.item = interactions.add({ pos: rest, size: 0.16, label: () => 'Take the flashlight', use: () => this.pickUp() });
    this.interactions = interactions;
    window.addEventListener('keydown', (e) => { if (e.code === 'KeyF' && !e.repeat && this.held) this.toggle(); });
    app.on('update', (dt) => this.update(dt));
  }

  // The model is merged into the apartment file by the asset pipeline (materials 'Prop_flashlight.*').
  build(apartment, spot) {
    const { root, renders, bounds } = placeFlashlightOnShelf(apartment, spot);
    this.restBounds = bounds;
    this.modelRenders = renders;
    this.halfHeight = bounds.halfExtents.y;
    this.root = root;
    this.size = BEAM_SIZE;

    // The beam and its bounce follow the camera, not the (hidden) model.
    this.beam = new Entity('flashlight beam');
    this.beam.addComponent('light', {
      type: 'spot', color: COLOR, intensity: 0, range: 18, innerConeAngle: BEAM_SIZE * 0.28, outerConeAngle: BEAM_SIZE,
      falloffMode: LIGHTFALLOFF_INVERSESQUARED,
      castShadows: true, shadowResolution: 1024, shadowBias: 0.08, normalOffsetBias: 0.006,
      shadowUpdateMode: SHADOWUPDATE_REALTIME, volumetricScattering: 0.35,
      cookie: this.cookie(), cookieIntensity: 1, enabled: false, mask: PLAYER_ONLY,
    });
    this.bounce = new Entity('flashlight bounce');
    // Returned light travels out of the hit surface, with occlusion. An unshadowed
    // omni here would illuminate through the pot/door that the beam just struck.
    this.bounce.addComponent('light', { type: 'spot', color: new Color(1, 0.9, 0.78), intensity: 0, range: 2.4,
      innerConeAngle: 30, outerConeAngle: 70, castShadows: true, shadowResolution: 256,
      shadowBias: 0.08, normalOffsetBias: 0.006, shadowUpdateMode: SHADOWUPDATE_REALTIME,
      falloffMode: LIGHTFALLOFF_INVERSESQUARED, volumetricScattering: 0, enabled: false, mask: PLAYER_ONLY });
    this.app.root.addChild(this.beam);
    this.app.root.addChild(this.bounce);
    return root;
  }

  // Beam pattern of a reflector torch: a tight hot spot, a brighter ring at its edge (the reflector's corona), a dim wide
  // spill falling off to the cone, faint concentric reflector rings, and a couple of lens smudges.
  cookie() {
    const N = 512, c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d'), img = g.createImageData(N, N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i + 0.5) / N * 2 - 1, y = (j + 0.5) / N * 2 - 1, r = Math.hypot(x, y);
      if (r >= 1) { const k = (j * N + i) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = 0; img.data[k + 3] = 255; continue; }
      let v = 1.0 * Math.exp(-((r / 0.17) ** 2.2))                // hot spot
        + 0.22 * Math.exp(-(((r - 0.24) / 0.05) ** 2))            // corona at the hot spot's rim
        + 0.26 * Math.exp(-((r / 0.5) ** 2));                     // spill
      v *= 1 + 0.05 * Math.sin(r * 90) * Math.exp(-r * 2);       // reflector rings
      v *= 1 - 0.12 * Math.exp(-((x - 0.12) ** 2 + (y + 0.08) ** 2) * 160);   // smudges
      v *= 1 - 0.07 * Math.exp(-((x + 0.3) ** 2 + (y - 0.22) ** 2) * 60);
      v *= (1 - r * r) ** 1.5;                                     // and everything fades out smoothly to the cone's edge
      const t = Math.min(1, v), k = (j * N + i) * 4;
      // Slightly warmer at the rim of the spot, cooler in the middle (LED behind a reflector).
      img.data[k] = 255 * Math.min(1, t * (1.0 + 0.04 * r)); img.data[k + 1] = 255 * t; img.data[k + 2] = 255 * Math.min(1, t * (1.02 - 0.08 * r));
      img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const tex = new Texture(this.app.graphicsDevice, { width: N, height: N, format: PIXELFORMAT_RGBA8, mipmaps: true,
      addressU: ADDRESS_CLAMP_TO_EDGE, addressV: ADDRESS_CLAMP_TO_EDGE, name: 'flashlight-cookie' });
    tex.setSource(c);
    return tex;
  }

  pickUp() {
    this.held = true;
    this.interactions.remove(this.item);
    this.model.enabled = false;            // in hand it is out of view; only the beam shows
    this.rot.copy(this.camera.getRotation());
    this.sounds?.pickUp();
    this.hud?.('F · Flashlight on / off');
    this.toggle();
  }

  toggle() {
    this.on = !this.on;
    this.sounds?.flashlightClick(this.on);
    this.flicker = this.on ? 0.22 : 0;
    this.surfaceTimer = 0;      // a fresh target on the first lit frame
    this.beam.light.enabled = this.bounce.light.enabled = this.on || this.power > 0;
  }

  // The cheap switch's contact: the beam stutters for `seconds` (story.js: the silhouette). Reduced flashes: a dip.
  stutter(seconds = 0.35) { if (this.on) this.flicker = this.reducedFlashes ? 0 : seconds; if (this.reducedFlashes) this.dip = seconds; }

  // Beam size (developer menu): the cone's outer angle in degrees; the cookie's pattern scales with it.
  setSize(deg) {
    this.size = deg;
    this.beam.light.outerConeAngle = deg;
    this.beam.light.innerConeAngle = deg * 0.28;
  }

  // Disable the beam briefly (the room probes must not capture it).
  suspend(off) {
    this.suspended = off;
    if (this.on) this.beam.light.enabled = this.bounce.light.enabled = !off;
  }

  update(dt) {
    if (!this.held) return;
    dt = Math.min(dt, 0.05);
    this.time += dt;
    // Power: snaps on with a short stutter (a cheap switch's contact), off at once.
    if (this.on) {
      this.flicker = Math.max(0, this.flicker - dt);
      this.dip = Math.max(0, (this.dip || 0) - dt);
      const stutter = this.flicker > 0 && !this.reducedFlashes ? (Math.sin(this.time * 90) > 0.2 ? 0.35 : 1) : this.dip > 0 ? 0.25 : 1;
      this.power = Math.min(1, this.power + dt / 0.05) * stutter;
    } else this.power = 0;
    const lit = this.power > 0.001 && !this.suspended;
    this.beam.light.enabled = this.bounce.light.enabled = lit;
    if (!lit) return;

    // The hand lags the view a little (heavier feel), with a faint tremor and the step's sway.
    const target = this.camera.getRotation();
    this.rot.slerp(this.rot, target, 1 - Math.exp(-11 * dt));
    const p = this.camera.getPosition(), off = new Vec3();
    this.rot.transformVector(HAND, off);
    const bob = this.player ? Math.sin(this.player.bobPhase) * Math.min(1, Math.hypot(this.player.vel.x, this.player.vel.z)) : 0;
    this.beam.setPosition(p.x + off.x, p.y + off.y + Math.abs(bob) * 0.012, p.z + off.z);
    this.beam.setRotation(this.rot);
    const t = this.time;
    // Aim slightly up and inwards, so the hot spot meets the centre of view ~3 m ahead; plus tremor and step sway.
    this.beam.rotateLocal(2.2 + 0.25 * Math.sin(t * 1.7) + 0.12 * Math.sin(t * 4.3) + bob * 0.6, 2.8 + 0.2 * Math.sin(t * 1.3 + 1) - bob * 0.8, 0);
    this.beam.rotateLocal(90, 0, 0);       // spot lights shine along -Y

    // Trace the actual rendered surfaces at 10 Hz. Collision cells collapse the
    // scene vertically and cannot say whether the beam hits a leaf, pot or door.
    const dir = this.beam.up.clone().mulScalar(-1);
    this.surfaceTimer -= dt;
    if (this.surfaceTimer <= 0) {
      this.surfaceHit = this.surfaces.trace(this.beam.getPosition(), dir, 18);
      this.surfaceTimer = 0.1;
    }
    const hit = this.surfaceHit;
    const d = Math.max(0.3, hit?.dist ?? 12);
    // Eyes adapt: a surface right in front of the lens would blow out, so the beam eases off up close (as a game camera's
    // exposure would), and is at full strength from ~2 m.
    const near = Math.min(1, 0.4 + 0.6 * (d / 2) ** 1.3);
    this.near = this.near === undefined ? near : this.near + (near - this.near) * (1 - Math.exp(-6 * dt));
    this.beam.light.intensity = BEAM * this.power * this.near;
    this.bounce.light.enabled = !!hit;
    if (hit) {
      // Recess the virtual reflector a few cm into the room side of the hit,
      // and aim its one shadow map into that surface's outward hemisphere.
      this.bounce.setPosition(hit.pos.clone().add(hit.normal.clone().mulScalar(0.035)));
      this.bounce.setRotation(new Quat().setFromDirections(Vec3.DOWN, hit.normal));
      const incidence = Math.max(0, -dir.dot(hit.normal));
      const albedo = hit.meshInstance.material.diffuse;
      const reflectance = albedo ? Math.min(1, (albedo.r + albedo.g + albedo.b) / 3) : 0.6;
      this.bounce.light.intensity = this.power * Math.min(0.12, 0.25 / (d * d)) * incidence * reflectance;
    } else {
      this.bounce.light.intensity = 0;
    }
  }
}
