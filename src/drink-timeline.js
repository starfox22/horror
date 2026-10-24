// The reach, grip, lift, sips and return share one visible-time clock.
// Sampling is pure so input blocking, pauses and contact points can be verified
// independently of the renderer or a machine's frame rate.
export const DRINK_DURATION = 9.0;
export const DRINK_TIMING = Object.freeze({ grip: 1.15, lift: 1.35, sip: 3.2, sipEnd: 5.55, replace: 7.25, relief: 7.55, duration: DRINK_DURATION });
const clamp = value => Math.min(1, Math.max(0, value));
export const drinkEase = value => { const t = clamp(value); return t * t * t * (t * (t * 6 - 15) + 10); };
const mix = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);

// Camera-space places (metres; the camera looks along -Z): where the glass's base is held in front of the chest, and
// where it is when its rim touches the lips (just below and ahead of the eye).
export const HOLD = Object.freeze([0.10, -0.33, -0.36]);
export const MOUTH = Object.freeze([0.0, -0.125, -0.196]);
const window01 = (t, a, b) => drinkEase((t - a) / (b - a));
const arc = (a, b, k, lift) => { const p = mix(a, b, drinkEase(k)); p[1] += Math.sin(Math.PI * Math.min(1, Math.max(0, k))) * lift; return p; };

// One pure sample of the drink at `time` (seconds). shelf: the glass base's camera-space position on the shelf.
// glass/tilt: where the glass is while carried (tilt: degrees towards the lips about the camera's x axis).
// Hand: `approach` takes it from below the view (0) to just beside the glass (1), `grasp` from there onto the glass (1),
// `open`/`grip` blend the fingers (relaxed, open, closed round the glass); while carried the hand holds the glass.
// Head and body: `look` turns the eyes to the glass, `lean` leans the body in, `sip` tips the head back while drinking.
export function sampleDrink(time, { shelf = [0, -0.45, -0.9], reducedMotion = false } = {}) {
  const t = Math.max(0, Math.min(DRINK_DURATION, Number.isFinite(time) ? time : 0));
  const lift = [shelf[0], shelf[1] + 0.025, shelf[2]], above = [shelf[0], shelf[1] + 0.02, shelf[2]];
  let glass = shelf.slice(), tilt = 0;
  if (t >= 1.35 && t < 1.6) glass = mix(shelf, lift, drinkEase((t - 1.35) / 0.25));
  else if (t >= 1.6 && t < 2.55) glass = arc(lift, HOLD, (t - 1.6) / 0.95, 0.035);
  else if (t >= 2.55 && t < 3.25) glass = mix(HOLD, MOUTH, drinkEase((t - 2.55) / 0.7));
  else if (t >= 3.25 && t < 5.55) glass = MOUTH.slice();
  else if (t >= 5.55 && t < 6.3) glass = mix(MOUTH, HOLD, drinkEase((t - 5.55) / 0.75));
  else if (t >= 6.3 && t < 7.0) glass = arc(HOLD, above, (t - 6.3) / 0.7, 0.03);
  else if (t >= 7.0 && t < 7.25) glass = mix(above, shelf, drinkEase((t - 7.0) / 0.25));
  // Tipping to the lips, then further as the glass empties (the water must still reach the rim).
  const consumed = drinkEase((t - 3.4) / 1.9);
  const raised = window01(t, 2.85, 3.3) * (1 - window01(t, 5.5, 6.05));
  tilt = raised * (48 + 24 * consumed);
  // Small swallows give the hold weight without camera shake.
  const sipWindow = drinkEase((t - 3.5) / 0.2) * (1 - drinkEase((t - 5.3) / 0.2));
  if (!reducedMotion && t >= 3.25 && t < 5.55) {
    glass = glass.slice();
    glass[1] += Math.sin((t - 3.5) * 9.4) * 0.0016 * sipWindow;
    tilt += Math.sin((t - 3.5) * 9.4) * 0.8 * sipWindow;
  }
  let carried = t >= 1.35 && t < 7.25;
  let approach = window01(t, 0, 0.75) * (1 - window01(t, 7.7, 8.25));
  let grasp = window01(t, 0.72, 1.08) * (1 - window01(t, 7.38, 7.72));
  let open = window01(t, 0.2, 0.65) * (1 - window01(t, 7.85, 8.25));
  let grip = window01(t, 0.86, 1.18) * (1 - window01(t, 7.25, 7.5));
  let handVisible = t < 8.25;
  // Reduced motion: the glass is simply in hand, held in front, then back on the shelf after the sips; no reach.
  if (reducedMotion) {
    if (t < 2.55) glass = HOLD.slice();
    carried = t < 6.3;
    if (!carried) glass = shelf.slice();
    approach = grasp = grip = carried ? 1 : 0; open = 0; handVisible = carried;
  }
  return { time: t, glass, tilt, carried, approach, grasp, open, grip, consumed,
    fill: GLASS_FULL - consumed * (GLASS_FULL - GLASS_EMPTY), handVisible,
    look: reducedMotion ? 0 : window01(t, 0, 0.7) * (1 - window01(t, 1.7, 2.5)) + window01(t, 6.2, 6.8) * (1 - window01(t, 7.6, 8.3)),
    // The body straightens only once the glass is near the chest, and leans back in before it leaves (the arm alone
    // cannot reach the shelf from where the drink starts).
    lean: reducedMotion ? 0 : window01(t, 0.15, 0.95) * (1 - window01(t, 2.2, 2.9)) + window01(t, 6.05, 6.65) * (1 - window01(t, 7.5, 8.3)),
    sip: reducedMotion ? 0 : window01(t, 3.0, 3.5) * (1 - window01(t, 5.4, 5.9)),
    complete: t >= DRINK_DURATION };
}

// The free surface stays level as the tumbler tips. The tumbler (public/assets/props/drinking-glass.json, a downloaded
// highball glass, 12.6 cm) tapers: inner radius 23.7 mm at its floor to 33.5 mm at the rim; the water keeps 0.6 mm off
// the wall.
export const GLASS_INTERIOR = Object.freeze({ bottom: 0.0080, top: 0.1245, radiusBottom: 0.0231, radiusTop: 0.0329 });
export const GLASS_HEIGHT = 0.1255;
export const GLASS_FULL = 0.103;               // water height when poured (about 220 ml)
export const GLASS_EMPTY = 0.017;              // what is left after the last sip
export const glassRadiusAt = y => {
  const { bottom, top, radiusBottom, radiusTop } = GLASS_INTERIOR;
  return radiusBottom + (radiusTop - radiusBottom) * Math.min(1, Math.max(0, (y - bottom) / (top - bottom)));
};
export function makeDrinkingWater(fill = GLASS_FULL, tilt = 0, segments = 40) {
  const { bottom, top } = GLASS_INTERIOR;
  const a = typeof tilt === 'number' ? tilt * Math.PI / 180 : 0;
  const [nx, ny, nz] = Array.isArray(tilt) ? tilt : [0, Math.cos(a), -Math.sin(a)];
  const level = Math.min(fill * ny, top * ny - Math.hypot(nx, nz) * glassRadiusAt(top));
  const surface = (x, z) => Math.max(bottom, Math.min(top, (level - nx * x - nz * z) / Math.max(0.01, ny)));
  const positions = [0, surface(0, 0), 0, 0, bottom, 0], normals = [nx, ny, nz, 0, -1, 0], indices = [];
  const rb = glassRadiusAt(bottom);
  for (let i = 0; i <= segments; i++) {
    const theta = i / segments * Math.PI * 2, c = Math.cos(theta), sn = Math.sin(theta);
    // Where the level plane meets the sloping wall at this angle (a few fixed-point steps).
    let y = fill, r = glassRadiusAt(y);
    for (let k = 0; k < 6; k++) { y = surface(r * c, r * sn); r = glassRadiusAt(y); }
    y = surface(r * c, r * sn);     // exactly on the level plane (a fraction of a millimetre off the wall at most)
    positions.push(r * c, y, r * sn, rb * c, bottom, rb * sn);
    normals.push(nx, ny, nz, 0, -1, 0);
    if (i < segments) {
      const k = 2 + i * 2, next = k + 2;
      indices.push(0, next, k, 1, k + 1, next + 1, k, next, k + 1, next, next + 1, k + 1);
    }
  }
  return { positions, normals, indices };
}
