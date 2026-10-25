// The crow (docs/STORY.md beat 5): a believable false scare, once a night, any time before the man has been seen (the
// silhouette), never within 25 s of another scare. When the player stands within 2.6 m of a window, looks at it for
// half a second and is not running, a crow flushed off the roof by the storm comes out of the black at eye height and
// slams into the pane where they are looking: a heavy thud and the pane rattling (the scare path: full level, the beds
// ducked under it), a burst of feathers, a distressed caw as he drops away below the sill and his wings beating
// somewhere down there; lightning a moment later. One feather stays stuck to the wet glass in a smear of blood that the
// rain washes down over about 40 s. "Jesus. ...Just a bird." The developer menu's 'crow' event: strike({ force: true }),
// now, at the window nearest the view.
// He is always outside the glass. He comes in along a slight curve at 9.5 m/s beating his wings (clip Fast_Flying),
// spreads them for the last fifth of a second (Hit: the glide) and flares, rearing up to brake (FLARE): the tip of his
// beak meets the middle of a light 5 mm from the glass, his breast and spread wings just behind it facing the room
// (head on and level he would be a thin line seen from the room), his wings clear of the frame's bars and the wall
// (CROW_FIT, measured by tools/crow/build.mjs). Then he falls away tumbling backwards with his wings flung up and
// folding. No light of his own: the room's lamps light him through the glass, his bounce light (the room's probe,
// probes.js) fades the further he is from the pane, so he comes out of the black only in the last metres (the torch
// lights him all the way in); his black is lifted a little and made glossier (LOOK), or it would read as nothing
// against the night. The model, the feathers (quads on the loose feather cards of his own texture) and the smears are
// tools/crow/build.mjs's (public/assets/props/crow.glb). Everything is drawn by the player's camera only (never by the
// probes or the home camera), casts no shadow, and has a copy of its materials per room (the living room, kitchen and
// office windows take the open-plan room's light, the bedroom's the bedroom's); main.js draws all of it during the
// warm-up (reveal), so nothing is compiled when he comes. Play time only: paused, he hangs in the air.
import { Asset, Color, Mat4, Quat, Vec3 } from 'playcanvas';
import { glbFile } from './packed.js';
import { zoneAt } from './zones.js';

const URL_GLB = './assets/props/crow.glb';

// Measured on the built apartment (public/assets/apartment/scene.gltf: the WindowGlass@main and @bed triangles grouped
// into panes; the frames' bars where they cross the glass, on a 1 cm grid; the walls with tools/surfaces.mjs). axis: the
// coordinate across the wall, out: the sign of the way out along it; outer/inner: the glass's two faces; wall: the
// wall's outer face (the frame and its bars stand between the glass and it); bars: how far out of the glass the bars
// between its lights stand (the deepest of them, on a 1 cm grid); span, height: the window, frame included;
// along x rows: its lights, the glass between the bars (along the wall, and up). The living room's run has two wall
// columns in it (no glass at 0.09-0.40 and 2.83-3.19). seen: which lights can be seen from the room, a row of flags per
// row of lights from the bottom up: the middle of a light (6 cm in from its bars) under 15 % covered by what hangs or
// stands within 0.6 m in front of the glass (rasterised on a 1 cm grid): the living room's zebra blinds and gathered
// curtains and the sofa's back, the kitchen's black venetian blind (down to 1.55 m) and the tap and plants on its sill,
// the office's zebra blind, the bedroom's curtains.
export const WINDOWS = [
  { id: 'living room', zone: 'main', axis: 'x', out: -1, outer: -6.508, inner: -6.473, wall: -6.544, bars: 0.022, span: [-0.73, 3.97], height: [0.22, 2.56],
    along: [[-0.69, -0.34], [-0.30, 0.05], [0.40, 0.75], [0.79, 1.14], [1.22, 1.57], [1.61, 1.96], [2.04, 2.40], [2.44, 2.79], [3.19, 3.54], [3.58, 3.93]],
    rows: [[0.27, 0.73], [0.77, 1.22], [1.26, 1.73], [1.79, 2.13], [2.18, 2.52]], seen: ['1100000000', '1100110011', '1100110011', '0000110000', '0000110000'] },
  { id: 'kitchen', zone: 'main', axis: 'z', out: -1, outer: -1.444, inner: -1.408, wall: -1.487, bars: 0.021, span: [-2.79, -0.33], height: [0.88, 2.25],
    along: [[-2.75, -2.40], [-2.36, -2.02], [-1.93, -1.58], [-1.54, -1.20], [-1.11, -0.76], [-0.72, -0.38]], rows: [[0.92, 1.33], [1.36, 1.76], [1.79, 2.20]],
    seen: ['010111', '000000', '000000'] },
  { id: 'office', zone: 'main', axis: 'z', out: -1, outer: -1.445, inner: -1.409, wall: -1.487, bars: 0.022, span: [3.72, 6.20], height: [0.82, 2.67],
    along: [[3.76, 4.11], [4.15, 4.50], [4.59, 4.94], [4.98, 5.33], [5.42, 5.77], [5.81, 6.15]], rows: [[0.86, 1.42], [1.46, 2.00], [2.04, 2.59]],
    seen: ['111000', '111000', '000000'] },
  { id: 'bedroom', zone: 'bed', axis: 'z', out: -1, outer: -1.449, inner: -1.414, wall: -1.487, bars: 0.022, span: [10.33, 12.79], height: [0.19, 2.53],
    along: [[10.37, 10.72], [10.76, 11.10], [11.19, 11.53], [11.57, 11.92], [12.01, 12.35], [12.39, 12.74]], rows: [[0.23, 0.70], [0.73, 1.19], [1.22, 1.69], [1.76, 2.10], [2.14, 2.49]],
    seen: ['011110', '011110', '011110', '011110', '011110'] },
];
// The lights that can be seen, [a0, a1, y0, y1] each.
export const seenLights = (w) => (w.lights ??= w.rows.flatMap(([y0, y1], j) => w.along.filter((_, i) => w.seen[j][i] === '1').map(([a0, a1]) => [a0, a1, y0, y1])));
// How far the point (along, y) of the window plane is from the nearest light that can be seen (0 inside one).
const offLight = (w, a, y) => Math.min(...seenLights(w).map(([a0, a1, y0, y1]) => Math.hypot(Math.max(a0 - a, 0, a - a1), Math.max(y0 - y, 0, y - y1))));

// When he comes (docs/STORY.md): reach, the eye within this of the window (horizontally, to its nearest point); dwell,
// seconds of looking at it first; facing, the view at most ~70 degrees off straight at the glass; near, the view meets
// the window within this of glass that can be seen (not a curtain or a blind); run, m/s above which the player is
// running (player.js: walk 1.35, run 2.4); start, seconds of play before he can come at all (waking from the nightmare
// is the night's first jolt); gap, the story's breathing room around a scare (story.js SCARE_GAP).
export const RULES = { reach: 2.6, dwell: 0.5, facing: 0.34, near: 0.6, run: 1.8, start: 25, gap: 25 };
// Story timers that end in a scare (story.js): he never comes when one is due within `gap`. The cut; the glass breaking
// (after the drink, the fridge left open: drink-fallback; at 6:00 with no drink: glass-late); the creaks crossing the
// kitchen ceiling (upstairs); the front door's handle (handle); the hunt.
export const SCARY_TIMERS = new Set(['cut', 'cut-fallback', 'drink-fallback', 'glass-late', 'upstairs', 'handle', 'hunt-fallback', 'hunt-call', 'hunt-door']);
// The model (tools/crow/build.mjs prints these): at the moment he meets the glass his beak is `nose` ahead of his origin
// and his wings `wings`, the tip of his beak at `beak` ([y, z]); flying he reaches `front` ahead, `below` beneath; the
// wings he flings up reach `above`; in the glide and the hit (clip Hit), pitched nose-up by 0, 5, ... 180 degrees, his
// foremost point is `reach` ahead.
export const CROW_FIT = { nose: 0.217, wings: 0.092, beak: [0.0073, -0.2167], front: 0.24, below: 0.195, above: 0.436, contact: 0.2,
  reach: [0.217, 0.216, 0.213, 0.208, 0.202, 0.194, 0.185, 0.175, 0.163, 0.149, 0.135, 0.12, 0.104, 0.104, 0.102, 0.1, 0.097, 0.093, 0.09,
    0.091, 0.1, 0.115, 0.129, 0.142, 0.154, 0.166, 0.177, 0.187, 0.197, 0.206, 0.213, 0.218, 0.222, 0.224, 0.228, 0.232, 0.236] };
// How far ahead of his origin he reaches with his body pitched nose-up by `deg` (the Hit clip).
export const reachAt = (deg) => {
  const r = CROW_FIT.reach, x = clamp(deg, 0, 180) / 5, i = Math.min(Math.floor(x), r.length - 2);
  return r[i] + (r[i + 1] - r[i]) * (x - i);
};
// He rears up this far (degrees, nose-up) over the glide: his beak meets the glass first, his breast and spread wings
// a hand's width behind it, facing the room (and clear of the frame's bars).
export const FLARE = 55;
// His feathers in the window's light: the measured black (albedo ~0.04) lifted by `albedo` (the loose ones, turning in
// the light with their paler undersides, by `loose`) and its roughness scaled by `gloss` (a crow's satin sheen).
// Uniforms only: the same shaders whatever the values.
const LOOK = { albedo: 1.3, loose: 2.2, gloss: 0.8 };
// The flight: from `from` metres out, `side` metres to one side and within 0.2 m of eye height, at `speed`.
const FLIGHT = { from: 6.2, side: [0.6, 1.3], speed: 9.5, beat: 1.7 };
// After he meets the glass (seconds): stuck to it, then falling (away from the pane `away` m/s, tumbling backwards);
// the caw, the wings below, the lightning, a last caw far off; hidden once well below the sill; the smear washed away.
const AFTER = { stick: 0.06, away: 0.9, caw: 0.22, caw2: 0.62, wings: 0.85, wings2: 1.45, flash: 1.15, far: 2.8, gone: 2.2, wash: 40 };
const GLASS_GAP = 0.005;            // his beak this far from the glass when he meets it
const CLEAR = 0.055;                // the falling feathers this far out: clear of the bars and the wall below the window
const FEATHERS = 9;                 // the burst

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// The window's frame of reference: n points out through it, t along it, both horizontal.
function axes(w) {
  return w.axis === 'x' ? { n: new Vec3(w.out, 0, 0), t: new Vec3(0, 0, 1), across: 'x', along: 'z' } : { n: new Vec3(0, 0, w.out), t: new Vec3(1, 0, 0), across: 'z', along: 'x' };
}
// A point at distance d outside the glass's outer face, `a` along the wall, height y.
function onWindow(w, a, y, d = 0, out = new Vec3()) {
  const { across, along } = axes(w);
  out.set(0, y, 0); out[across] = w.outer + w.out * d; out[along] = a;
  return out;
}
// How far a point is outside the glass's outer face (negative: inside it, towards the room).
export const outside = (w, p) => (p[w.axis] - w.outer) * w.out;

// The window the player is looking at, if any (cheap: four rectangles). eye, dir: the camera's position and forward.
// Returns { window, along, y, distance } (where the view meets the glass) or null.
export function lookedAt(eye, dir, { windows = WINDOWS, reach = RULES.reach, facing = RULES.facing, near = RULES.near } = {}) {
  const zone = zoneAt(eye.x, eye.z);
  for (const w of windows) {
    if (w.zone !== zone) continue;                         // through a wall is not at a window
    const { across, along } = axes(w), inside = (eye[across] - w.inner) * -w.out;
    if (inside <= 0) continue;
    const nearest = clamp(eye[along], w.span[0], w.span[1]), distance = Math.hypot(inside, eye[along] - nearest);
    if (distance > reach) continue;
    const toward = dir[across] * w.out;
    if (toward < facing) continue;
    const t = (w.outer - eye[across]) / dir[across], a = eye[along] + dir[along] * t, y = eye.y + dir.y * t;
    if (a < w.span[0] - 0.1 || a > w.span[1] + 0.1 || y < w.height[0] - 0.1 || y > w.height[1] + 0.1) continue;
    if (offLight(w, a, y) > near) continue;                 // a curtain or a blind, not the night
    return { window: w, along: a, y, distance };
  }
  return null;
}

// The window nearest to where the eye looks, wherever the player is (the developer menu's strike): the one whose glass
// is the least angle off the view, from the point of it nearest the view's line.
export function nearestWindow(eye, dir, windows = WINDOWS) {
  let best = null;
  for (const w of windows) {
    const { across, along } = axes(w);
    const t = Math.abs(dir[across]) > 1e-3 ? (w.outer - eye[across]) / dir[across] : -1;
    const a = clamp(t > 0 ? eye[along] + dir[along] * t : eye[along], w.span[0], w.span[1]);
    const y = clamp(t > 0 ? eye.y + dir.y * t : eye.y, w.height[0], w.height[1]);
    const p = onWindow(w, a, y), d = new Vec3().sub2(p, eye), len = d.length() || 1;
    const score = d.dot(dir) / len - len * 0.01;
    if (!best || score > best.score) best = { window: w, along: a, y, score };
  }
  return best;
}

// Where he strikes: where the view meets the window, at eye height ±0.2 m, moved into the middle of the nearest light
// that can be seen (m from its bars: his beak meets glass, and the smear stays on it). Under the kitchen's blind that
// is lower than the eye: he dives for the lit glass below it.
export function strikePoint(w, along, eyeY, random = Math.random, m = 0.1) {
  const y = eyeY + (random() * 2 - 1) * 0.2;
  let best = null;
  for (const [a0, a1, y0, y1] of seenLights(w)) {
    const a = clamp(along, a0 + m, a1 - m), h = clamp(y, y0 + m, y1 - m), d = Math.hypot(a - along, h - y);
    if (!best || d < best.d) best = { along: a, y: h, d };
  }
  return { along: best.along, y: best.y };
}

// Is the point of the window plane at (along, y) glass (between the bars)?
export const onGlass = (w, along, y) => w.along.some(([a0, a1]) => along >= a0 && along <= a1) && w.rows.some(([y0, y1]) => y >= y0 && y <= y1);

export class Crow {
  // Loads the model; without it (a failed download, the Node tests) he is heard and the night goes on, unseen.
  static async create(opts) {
    let container = null;
    try {
      const file = await glbFile(URL_GLB);
      container = await new Promise((resolve, reject) => {
        const asset = new Asset('Crow by Alexei Ostapenko (CC BY 4.0)', 'container', file);
        asset.once('load', () => { if (file.url.startsWith('blob:')) URL.revokeObjectURL(file.url); resolve(asset.resource); });
        asset.once('error', error => reject(new Error(`Crow model: ${error}`)));
        opts.app.assets.add(asset); opts.app.assets.load(asset);
      });
    } catch (error) { console.warn(error.message); }
    return new Crow({ ...opts, container });
  }

  // camera: the player's; story: story.js (gates, flags, thoughts; its sys for the fridge and the director); bank: the
  // recorded sounds; rain: rain.js (lightning); isPlaying(): play time is passing; blocked(): the player is busy (drinking,
  // reading, the phone up, caught...); isVisible(camera): which cameras draw him; configureMaterial(material, zone).
  constructor({ app, container = null, camera, story, player = null, bank = null, rain = null, isPlaying = () => true, blocked = () => false,
    isVisible = null, configureMaterial = null, random = Math.random }) {
    Object.assign(this, { app, camera, story, player, bank, rain, isPlaying, blocked, random });
    this.look = { window: null, t: 0 };
    this.flight = null;               // a strike under way (strike())
    this.struck = false;              // this page's night has had its crow
    this.cues = [];                   // [{ at, fn }]: seconds of play after the strike began
    this.debris = [];                 // the feathers falling
    this.smear = null;                // what stays on the glass: { t, ... }
    this.pos = new Vec3(); this.rot = new Quat();
    this.zone = 'main';
    if (container) this.build(container, isVisible, configureMaterial);
    this._update = dt => this.update(dt);
    app.on?.('update', this._update);
  }

  // --- the model ---------------------------------------------------------------------------------------------------
  build(container, isVisible, configureMaterial) {
    const app = this.app;
    this.root = container.instantiateRenderEntity({ castShadows: false, receiveShadows: true });
    const body = this.root.children.find(e => e.name === 'crow'), parts = this.root.children.find(e => e.name === 'crow-parts');
    this.root.name = 'crow (the strike)';
    app.root.addChild(this.root);
    this.body = body;
    // Each room's copy of every material (its probes): the crow's, the feathers', the two smears'.
    const source = new Map();
    for (const r of this.root.findComponents('render')) for (const mi of r.meshInstances) source.set(mi.material.name, mi.material);
    this.mats = {};
    for (const zone of ['main', 'bed']) {
      this.mats[zone] = {};
      for (const [name, m] of source) {
        const copy = m.clone();
        copy.name = `${name}.${zone}`;
        if (/smear/.test(name)) { copy.emissive = new Color(0.55, 0.03, 0.02); copy.emissiveIntensity = 0.004; }   // lit through in a flash
        else { const k = name === 'crow' ? LOOK.albedo : LOOK.loose; copy.diffuse = new Color(k, k, k); copy.gloss = LOOK.gloss; }   // LOOK
        configureMaterial?.(copy, zone);
        copy.update();
        this.mats[zone][name] = copy;
      }
    }
    // The probes' bounce strength for each room's materials (probes.js bounceMix), scaled by how far from the pane he is.
    this.bounce = Object.fromEntries(Object.entries(this.mats).map(([zone, set]) => [zone, set.crow.getParameter?.('bounceMix')?.data?.slice() ?? null]));
    const visible = (entity) => {
      for (const r of entity.findComponents('render')) for (const mi of r.meshInstances) {
        mi.isVisibleFunc = cam => (isVisible ? isVisible(cam) : !cam.node?.name?.startsWith('probe-')) && cam.frustum.containsAabb(mi.aabb);
        mi.castShadow = false;
      }
    };
    // The bird.
    this.root.addComponent('anim', { activate: true });
    this.anim = this.root.anim;
    for (const a of container.animations) {
      const track = a.resource;
      this.anim.assignAnimation(track.name, track, undefined, 1, track.name === 'Fast_Flying');
    }
    this.birdInstances = body.findComponents('render').flatMap(r => r.meshInstances);
    visible(body);
    // The feathers: one entity each for the burst and the one that stays, cloned from the five cards.
    const cards = parts.children.filter(e => e.name.startsWith('feather-'));
    this.feathers = Array.from({ length: FEATHERS + 1 }, (_, i) => {
      const e = cards[i % cards.length].clone();
      e.name = `crow feather ${i}`; app.root.addChild(e); visible(e); e.enabled = false;
      return { e, instances: e.findComponents('render').flatMap(r => r.meshInstances), card: i % cards.length };
    });
    this.stuck = this.feathers.pop();
    // The smears (their own entities, so the bird's hierarchy can be hidden on its own).
    this.smears = ['smear', 'smear-wash'].map(name => {
      const e = parts.findByName(name);
      app.root.addChild(e); visible(e); e.enabled = false;
      const instances = e.findComponents('render').flatMap(r => r.meshInstances);
      return { e, instances, name };
    });
    // Drawn just before the window glass they lie behind, whatever the view: see-through things are drawn back to front
    // by the distance of their middles, and one glass mesh holds all of a room's windows (rain.js draws the drops on
    // it), so the smears take its distance and a little more; the fresh smear before its washed streaks.
    this.glass = {};
    for (const r of app.root.findComponents('render')) for (const mi of r.meshInstances) {
      const zone = /^WindowGlass@(main|bed)$/.exec(mi.material?.name ?? '')?.[1];
      if (zone) (this.glass[zone] ||= []).push(mi);
    }
    const depth = (mi, pos, fwd) => { const c = mi.aabb.center; return (c.x - pos.x) * fwd.x + (c.y - pos.y) * fwd.y + (c.z - pos.z) * fwd.z; };
    this.smears.forEach((s, k) => s.instances.forEach(mi => {
      mi.calculateSortDistance = (self, pos, fwd) => {
        let behind = -Infinity;
        for (const g of this.glass[this.zone] ?? [self]) behind = Math.max(behind, depth(g, pos, fwd));
        return behind + 0.02 + (1 - k) * 0.01;
      };
    }));
    parts.enabled = false;
    this.root.enabled = false;
    this.useZone('main');
  }

  // Every part takes the materials of the room whose window it is at.
  useZone(zone) {
    this.zone = zone;
    if (!this.mats) return;
    const set = this.mats[zone];
    for (const mi of this.birdInstances) mi.material = set.crow;
    for (const f of [...this.feathers, this.stuck]) for (const mi of f.instances) mi.material = set['crow feather'];
    for (const s of this.smears) for (const mi of s.instances) mi.material = set[s.name];
  }

  // The room's light on him through the glass: his bounce light at full strength at the pane, fading with distance
  // (like the light of a lit window on things outside it). k: 0..1.
  spill(instances, k) {
    const b = this.bounce?.[this.zone];
    if (!b) return;
    for (const mi of instances) mi.setParameter('bounceMix', [b[0] * k, b[1], b[2], 0]);
  }

  // --- when he comes -----------------------------------------------------------------------------------------------
  // Nothing else is happening or about to: the story's gates (docs/STORY.md beat 5) and the player's state.
  ready() {
    const s = this.story;
    if (this.struck || this.flight || !s || s.has('crow') || s.act < 1 || s.has('hunt') || s.has('ended') || s.dying) return false;
    if (s.time < RULES.start || !s.canScare()) return false;
    if (s.has('silhouette')) return false;                                   // a false scare: only before he has been seen
    if (s.sighting || (s.has('fusebox-opened') && !s.has('restored'))) return false;                // the figure is due
    if (s.timers?.some(t => SCARY_TIMERS.has(t.id) && t.at - s.time < RULES.gap)) return false;
    if (s.sys?.events?.pending?.some(p => !p.manual)) return false;                                    // a story event counting down
    if (s.sys?.fridge?.hasDrunk && !s.has('glass')) return false;                                    // the glass breaks when the fridge shuts
    const v = this.player?.vel;
    if (this.player?.running || (v && Math.hypot(v.x, v.z) > RULES.run)) return false;
    return !this.blocked();
  }

  update(dt) {
    const playing = this.isPlaying();
    dt = playing ? Math.min(Math.max(dt, 0), 0.1) : 0;
    if (this.anim) this.anim.speed = playing ? (this.flight?.hit ? 1 : FLIGHT.beat) : 0;
    if (this.revealing) { this.revealFrame(); return; }
    if (this.flight) this.fly(dt);
    for (const c of [...this.cues]) { c.at -= dt; if (c.at <= 0) { this.cues.splice(this.cues.indexOf(c), 1); c.fn(); } }
    if (this.debris.length) this.fall(dt);
    if (this.smear) this.wash(dt);
    if (!dt || !this.ready()) { this.look.window = null; this.look.t = 0; return; }
    const eye = this.camera.getPosition(), seen = lookedAt(eye, this.camera.forward);
    if (!seen || seen.window !== this.look.window) { this.look.window = seen?.window ?? null; this.look.t = 0; }
    if (!seen) return;
    this.look.t += dt;
    if (this.look.t >= RULES.dwell) this.strike({ at: seen });
  }

  // He comes now. force (the developer menu): whatever is going on, at the window nearest the view; it is not the
  // night's crow (the story's one can still come). at: { window, along } from lookedAt. Returns whether he came.
  strike({ force = false, at = null } = {}) {
    if (this.flight && !force) return false;
    const eye = this.camera.getPosition().clone(), dir = this.camera.forward.clone();
    const seen = at ?? lookedAt(eye, dir) ?? nearestWindow(eye, dir);
    const w = seen.window, point = strikePoint(w, seen.along, eye.y, this.random);
    if (!force) { this.struck = true; this.story?.set('crow'); }
    this.story?.scared?.();
    this.look.window = null; this.look.t = 0;
    this.begin(w, point);
    return true;
  }

  // --- the flight --------------------------------------------------------------------------------------------------
  begin(w, point) {
    const { n, t } = axes(w), r = this.random;
    const side = (r() < 0.5 ? -1 : 1) * (FLIGHT.side[0] + r() * (FLIGHT.side[1] - FLIGHT.side[0]));
    const glass = onWindow(w, point.along, point.y);                                   // where he meets the pane
    // His origin then: reared up, the tip of his beak (the foremost of him) on that point, his body below it.
    const reach = reachAt(FLARE), up = FLARE * Math.PI / 180, [by, bz] = CROW_FIT.beak;
    const contact = glass.clone().add(n.clone().mulScalar(reach + GLASS_GAP));
    contact.y -= by * Math.cos(up) - bz * Math.sin(up);
    const eyeY = this.camera.getPosition().y;
    const start = contact.clone().add(n.clone().mulScalar(FLIGHT.from)).add(t.clone().mulScalar(side));
    start.y = eyeY + (r() * 2 - 1) * 0.2;
    // A quadratic curve that bends in from the side and arrives straight at the glass.
    const ctrl = contact.clone().add(n.clone().mulScalar(FLIGHT.from * 0.5));
    const at = (u, out = new Vec3()) => out.set(0, 0, 0).add(start.clone().mulScalar((1 - u) * (1 - u))).add(ctrl.clone().mulScalar(2 * u * (1 - u))).add(contact.clone().mulScalar(u * u));
    const samples = [0];
    let prev = at(0), length = 0;
    for (let i = 1; i <= 32; i++) { const p = at(i / 32); length += p.distance(prev); samples.push(length); prev = p; }
    const T = length / FLIGHT.speed;
    this.flight = { w, n, t, side, glass, contact, reach, at, samples, length, T, time: 0, hit: false, drift: (r() * 2 - 1) * 0.15, roll: r() < 0.5 ? -1 : 1, closest: Infinity, phase: r() * 0.5 };
    this.useZone(w.zone);
    if (this.root) {
      this.root.enabled = true; this.body.enabled = true;
      this.anim.baseLayer.transition('Fast_Flying', 0);
      this.anim.baseLayer.activeStateCurrentTime = this.flight.phase;
    }
    this.cues.length = 0;
    // The sounds, the lightning and the thoughts, timed from the contact.
    // Below and out from where he hit: the way he went (his wings as he catches himself, then a caw far off).
    const below = (down, out) => glass.clone().add(n.clone().mulScalar(out)).add(new Vec3(0, -down, 0)).add(t.clone().mulScalar(side * 0.3));
    const later = (s, fn) => this.cues.push({ at: T + s, fn });
    later(0, () => this.impact());
    // One take each of the recordings' calls and wing beats (sound.js segments): two harsh caws as he drops, his wings
    // as he catches himself below the sill and labours off, one last caw far off.
    later(AFTER.caw, () => this.sound('caw', this.pos, { gain: 0.95, segment: 0 }));
    later(AFTER.caw2, () => this.sound('caw', below(0.9, 0.6), { gain: 0.7, segment: 1, rate: 0.97 }));
    later(AFTER.wings, () => this.sound('wings', below(1.6, 1.2), { gain: 0.6, segment: 0 }));
    later(AFTER.wings2, () => this.sound('wings', below(2.2, 2.4), { gain: 0.38, segment: 2 }));
    later(AFTER.flash, () => { if (this.rain?.flash) this.rain.flash.next = 0; });
    later(AFTER.far, () => this.sound('caw', below(6, 3.5), { gain: 0.3, segment: 3, rate: 1.04 }));
    this.pose(0);
  }

  // How far he is reared up (degrees, nose-up) at `time`: level flying in, flaring over the glide (Hit) to FLARE as he
  // meets the glass, then on over backwards as he falls away from it.
  pitchAt(time) {
    const f = this.flight, hitAt = f.T - CROW_FIT.contact;
    if (time < hitAt) return 0;
    if (time < f.T) return FLARE * smooth(hitAt, f.T, time);
    const k = Math.max(0, time - f.T - AFTER.stick);
    return FLARE + 90 * k + 260 * k * k;
  }

  // The flight's state at `time` seconds: where he is and which way he faces.
  pose(time) {
    const f = this.flight, pos = this.pos, fwd = new Vec3();
    let roll = 0;
    const pitch = this.pitchAt(time);
    if (time < f.T) {
      // Along the curve at an even speed: invert the arc length table.
      const s = time * FLIGHT.speed, i = clamp(f.samples.findIndex(v => v >= s), 1, 32);
      const u = (i - 1 + clamp((s - f.samples[i - 1]) / Math.max(1e-6, f.samples[i] - f.samples[i - 1]), 0, 1)) / 32;
      f.at(u, pos);
      fwd.copy(f.at(Math.min(1, u + 0.01))).sub(f.at(Math.max(0, u - 0.01))).normalize();
      roll = 24 * (1 - u) * Math.sign(f.side);                                // banked into the turn, level at the end
    } else {
      // Stuck to the pane for a moment, then falling away from it, tumbling backwards.
      const tau = time - f.T, k = Math.max(0, tau - AFTER.stick);
      const away = AFTER.away * k + 0.6 * k * k;
      pos.copy(f.contact).add(f.n.clone().mulScalar(away)).add(f.t.clone().mulScalar(f.drift * k));
      pos.y -= 0.5 * 9.81 * k * k;
      fwd.copy(f.n).mulScalar(-1);
      roll = f.roll * 30 * k;
    }
    // His -Z along fwd, his up as near the world's as it can be; then the bank and the tumble.
    const z = fwd.clone().mulScalar(-1), x = new Vec3().cross(Vec3.UP, z).normalize(), y = new Vec3().cross(z, x);
    const m = new Mat4().set([x.x, x.y, x.z, 0, y.x, y.y, y.z, 0, z.x, z.y, z.z, 0, 0, 0, 0, 1]);
    this.rot.setFromMat4(m);
    if (roll) this.rot.mul(new Quat().setFromAxisAngle(Vec3.BACK, roll));
    if (pitch) this.rot.mul(new Quat().setFromAxisAngle(Vec3.RIGHT, pitch));
    return { pos, rot: this.rot };
  }

  fly(dt) {
    const f = this.flight;
    f.time += dt;
    // The last fifth of a second: wings spread (Hit's glide), so they meet the glass as a print does.
    if (!f.hit && f.time >= f.T - CROW_FIT.contact) {
      f.hit = true;
      if (this.anim) this.anim.baseLayer.transition('Hit', 0.1);
    }
    this.pose(f.time);
    this.keepOutside();
    if (this.root) {
      this.root.setPosition(this.pos); this.root.setRotation(this.rot);
      // Out of the dark: the window's light on him, full at the pane, a tenth of it two metres out.
      this.spill(this.birdInstances, 1 / (1 + (Math.max(0, outside(f.w, this.pos) - 0.2) / 0.6) ** 2));
    }
    const sill = f.w.rows[0][0];
    if (f.time > f.T + AFTER.gone || (f.time > f.T && this.pos.y + CROW_FIT.above < sill - 0.3)) this.land();
  }

  // Never through the glass: his nearest point (the wings he beats forward flying in; then, reared up, his breast and
  // beak, and the feet and tail he swings towards the pane as he tumbles backwards) kept outside its outer face,
  // GLASS_GAP at the contact. tools/check-crow.mjs checks every vertex of him over a strike against the glass and the frame.
  keepOutside() {
    const f = this.flight, w = f.w;
    const reach = f.time < f.T - CROW_FIT.contact ? CROW_FIT.front : reachAt(this.pitchAt(f.time));
    const short = reach + GLASS_GAP - outside(w, this.pos);
    if (short > 1e-6) this.pos.add(f.n.clone().mulScalar(short));
    f.closest = Math.min(f.closest, outside(w, this.pos) - reach);
  }

  // The thud: he hits the pane.
  impact() {
    const f = this.flight;
    this.sound('thud', f.glass, { gain: 1 });
    // The burst: feathers knocked out of him, out from the pane, spinning, then fluttering down through the rain.
    const r = this.random;
    this.debris = (this.feathers ?? Array.from({ length: FEATHERS }, () => ({}))).map((feather, i) => {
      const small = i >= 5;
      const p = f.contact.clone().add(f.t.clone().mulScalar((r() * 2 - 1) * 0.18)).add(new Vec3(0, (r() * 2 - 1) * 0.12, 0));
      p.add(f.n.clone().mulScalar(CLEAR + r() * 0.12 - (f.reach + GLASS_GAP)));
      const v = f.n.clone().mulScalar(0.4 + r() * 1.2).add(f.t.clone().mulScalar((r() * 2 - 1) * 1.1)).add(new Vec3(0, -0.2 + r() * 1.2, 0));
      return { feather, p, v, age: 0, scale: small ? 0.45 + r() * 0.25 : 0.8 + r() * 0.4, spin: new Vec3((r() * 2 - 1) * 540, (r() * 2 - 1) * 360, (r() * 2 - 1) * 720),
        euler: new Vec3(r() * 360, r() * 360, r() * 360), phase: r() * 6.28, sway: 0.25 + r() * 0.35 };
    });
    // What stays on the glass: the smear where he hit, a feather in it.
    const angle = (r() < 0.5 ? 0 : 180) + 25 + r() * 130;
    this.smear = { t: 0, w: f.w, n: f.n, glass: f.glass.clone(), tilt: (r() * 2 - 1) * 10, angle, size: 0.85 + r() * 0.25,
      feather: f.glass.clone().add(f.t.clone().mulScalar((r() * 2 - 1) * 0.05)).add(new Vec3(0, -0.02 + r() * 0.05, 0)) };
    this.place();
    // He hit it: the story and the player's thoughts.
    this.story?.say?.('Jesus.', { delay: 0.9, hold: 1.2 });
    this.story?.say?.('...Just a bird.', { gap: 0.9, hold: 2.2 });
  }

  // The night's recordings, or the nearest the bank has (sound.js; the crow's own may still be on their way).
  sound(kind, at, opts = {}) {
    const bank = this.bank;
    if (!bank) return null;
    const pick = { thud: [['window_thud', {}], ['door_kick', { rate: 1.45, gain: 0.85 }]], caw: [['crow_caw', {}]], wings: [['wing_flap', {}]] }[kind];
    const [key, extra] = pick.find(([k]) => bank.has?.(k) ?? true) ?? [];
    if (!key) return null;
    const p = [at.x, at.y, at.z];
    const o = { at: p, occlude: false, send: 0.3, min: 0.2, ...opts, ...extra, gain: (opts.gain ?? 1) * (extra.gain ?? 1) };
    return kind === 'thud' && bank.scare ? bank.scare(key, { ...o, send: 0.25, min: 0.35 }) : bank.play(key, o);
  }

  // He is gone below the sill.
  land() {
    this.flight = null;
    if (this.root) this.root.enabled = false;
  }

  // --- the feathers ------------------------------------------------------------------------------------------------
  fall(dt) {
    const g = new Vec3(0, -9.81, 0);
    for (const d of [...this.debris]) {
      d.age += dt;
      // Air holds a feather up: quadratic drag to ~0.9 m/s falling (wet, in the rain), a flutter from side to side.
      const speed = d.v.length(), drag = 12 / d.scale;
      d.v.add(g.clone().mulScalar(dt)).sub(d.v.clone().mulScalar(Math.min(0.9, drag * speed * dt)));
      const w = this.smear?.w ?? this.flight?.w, axesW = w ? axes(w) : null;
      if (axesW) d.v.add(axesW.t.clone().mulScalar(Math.sin(d.age * 5 + d.phase) * d.sway * dt * 6));
      d.p.add(d.v.clone().mulScalar(dt));
      // Never onto the window or the wall below it: they bounce off the air in front of it.
      if (w && outside(w, d.p) < CLEAR) { d.p.add(axesW.n.clone().mulScalar(CLEAR - outside(w, d.p))); const vn = d.v.dot(axesW.n); if (vn < 0) d.v.sub(axesW.n.clone().mulScalar(vn * 1.6)); }
      d.spin.mulScalar(Math.exp(-1.2 * dt));
      d.euler.add(d.spin.clone().mulScalar(dt));
      const e = d.feather?.e;
      if (e) {
        e.enabled = true;
        e.setPosition(d.p);
        e.setEulerAngles(d.euler.x + Math.sin(d.age * 6 + d.phase) * 25, d.euler.y, d.euler.z);
        e.setLocalScale(d.scale, d.scale, d.scale);
        if (w) this.spill(d.feather.instances, 1 / (1 + (Math.max(0, outside(w, d.p) - 0.1) / 0.6) ** 2));
      }
      const sill = w ? w.rows[0][0] : 0;
      if (d.age > 7 || d.p.y < sill - 0.4) { if (e) e.enabled = false; this.debris.splice(this.debris.indexOf(d), 1); }
    }
  }

  // --- what stays on the glass -------------------------------------------------------------------------------------
  // The smear and the feather placed flat on the outside of the pane, facing the room: the feather pressed to the glass,
  // the blood smeared over it (so from the room it shows in front of the smear).
  place() {
    const s = this.smear;
    if (!this.smears) return;
    const into = s.n.clone().mulScalar(-1), q = new Quat(), m = new Mat4();
    const z = into, x = new Vec3().cross(Vec3.UP, z).normalize(), y = new Vec3().cross(z, x);
    m.set([x.x, x.y, x.z, 0, y.x, y.y, y.z, 0, z.x, z.y, z.z, 0, 0, 0, 0, 1]);
    q.setFromMat4(m);
    s.facing = q.clone();
    for (const [k, part] of this.smears.entries()) {
      part.e.enabled = true;
      part.e.setRotation(q); part.e.rotateLocal(0, 0, s.tilt);
      part.e.setPosition(s.glass.clone().add(s.n.clone().mulScalar(0.0025 - k * 0.0005)));
      part.e.setLocalScale(s.size, s.size, 1);
    }
    const f = this.stuck;
    f.e.enabled = true;
    f.e.setRotation(q); f.e.rotateLocal(0, 0, s.angle);
    f.e.setLocalScale(0.8, 0.8, 0.8);
    f.e.setPosition(s.feather.clone().add(s.n.clone().mulScalar(0.001)));
    this.wash(0);
  }

  // The rain washes it down: the fresh smear fades as its washed-out streaks run down below it and fade too (40 s); the
  // feather slides a little in the water and stays. In a lightning flash the blood glows through, lit from behind.
  wash(dt) {
    const s = this.smear;
    s.t += dt;
    if (!this.smears) { if (s.t > AFTER.wash) this.smear = null; return; }
    const t = s.t, [fresh, washed] = this.smears, m = this.mats[this.zone];
    const a = (v) => clamp(v, 0.004, 0.996);              // never fully 0 or 1 (another shader)
    m.smear.opacity = a(0.92 * (1 - smooth(0.5, 26, t)));
    m['smear-wash'].opacity = a(0.62 * smooth(1, 7, t) * (1 - smooth(14, AFTER.wash, t)));
    const flash = this.rain ? Math.max(0, this.rain.moon?.light?.intensity - (this.rain.moonBase ?? 0)) : 0;
    for (const name of ['smear', 'smear-wash']) { m[name].emissiveIntensity = 0.004 + flash * 0.035; m[name].update(); }
    // The streaks creep down and lengthen (anchored at their top edge).
    const stretch = 1 + 0.35 * smooth(2, AFTER.wash, t), drop = 0.06 * smooth(2, AFTER.wash, t);
    washed.e.setLocalScale(s.size, s.size * stretch, 1);
    washed.e.setPosition(s.glass.clone().add(s.n.clone().mulScalar(0.002)).add(new Vec3(0, 0.10 * s.size * (1 - stretch) - drop, 0)));
    fresh.e.setPosition(s.glass.clone().add(s.n.clone().mulScalar(0.0025)).add(new Vec3(0, -0.012 * smooth(0, 20, t), 0)));
    this.stuck.e.setPosition(s.feather.clone().add(s.n.clone().mulScalar(0.001)).add(new Vec3(0, -0.018 * smooth(0, 12, t), 0)));
    if (t > AFTER.wash) { fresh.e.enabled = false; washed.e.enabled = false; s.washed = true; }
  }

  // --- the warm-up ---------------------------------------------------------------------------------------------------
  // main.js: everything drawn in front of the camera on every warm-up frame (the bird flying, the feathers, the smears and
  // the feather on the glass), each room's materials in turn, so all their shaders are built before play. Returns the undo.
  reveal() {
    if (!this.root) return null;
    this.revealing = { frame: 0 };
    this.root.enabled = true; this.body.enabled = true;
    this.anim.baseLayer.transition('Fast_Flying', 0);
    return () => {
      this.revealing = null;
      this.useZone('main');
      this.body.enabled = false; this.root.enabled = false;
      for (const f of [...this.feathers, this.stuck]) f.e.enabled = false;
      for (const s of this.smears) s.e.enabled = false;
      this.anim.baseLayer.transition('Fast_Flying', 0);
    };
  }

  revealFrame() {
    const r = this.revealing, cam = this.camera.getPosition(), fwd = this.camera.forward, right = this.camera.right, up = this.camera.up;
    this.useZone(r.frame++ % 2 ? 'bed' : 'main');
    const ahead = (d, x, y) => cam.clone().add(fwd.clone().mulScalar(d)).add(right.clone().mulScalar(x)).add(up.clone().mulScalar(y));
    this.root.setPosition(ahead(1.8, 0, 0)); this.root.setRotation(this.camera.getRotation());
    // Half way through, the impact's pose (another blend of clips on the same shaders).
    if (r.frame === 30) this.anim.baseLayer.transition('Hit', 0);
    [...this.feathers, this.stuck].forEach((f, i) => {
      f.e.enabled = true; f.e.setPosition(ahead(1.2, -0.5 + i * 0.1, -0.25)); f.e.setRotation(this.camera.getRotation());
    });
    this.smears.forEach((s, i) => { s.e.enabled = true; s.e.setPosition(ahead(1.2, -0.2 + i * 0.4, 0.25)); s.e.setRotation(this.camera.getRotation()); });
  }

  destroy() { this.app.off?.('update', this._update); this.root?.destroy(); }
}
