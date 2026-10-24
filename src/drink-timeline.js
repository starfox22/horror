// The reach, grip, lift, three small sips and return share one visible-time clock.
// Sampling is pure so input blocking, pauses and contact points can be verified
// independently of the renderer or a machine's frame rate.
export const DRINK_DURATION = 9.0;
export const DRINK_TIMING = Object.freeze({ grip: 1.15, lift: 1.35, sip: 3.2, sipEnd: 5.55, replace: 7.25, relief: 7.55, duration: DRINK_DURATION });
const clamp = value => Math.min(1, Math.max(0, value));
export const drinkEase = value => { const t = clamp(value); return t * t * t * (t * (t * 6 - 15) + 10); };
const mix = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);

export function sampleDrink(time, { shelf = [0, -0.45, -0.9], reducedMotion = false } = {}) {
  const t = Math.max(0, Math.min(DRINK_DURATION, Number.isFinite(time) ? time : 0));
  const chest = [0.19, -0.30, -0.48], mouth = [0.012, -0.105, -0.27];
  const offscreen = [0.38, -0.68, -0.22];
  let glass = shelf, tilt = 0;
  if (t >= 1.35 && t < 2.55) glass = mix(shelf, chest, drinkEase((t - 1.35) / 1.2));
  else if (t >= 2.55 && t < 3.25) glass = mix(chest, mouth, drinkEase((t - 2.55) / 0.7));
  else if (t >= 3.25 && t < 5.55) glass = mouth.slice();
  else if (t >= 5.55 && t < 6.3) glass = mix(mouth, chest, drinkEase((t - 5.55) / 0.75));
  else if (t >= 6.3 && t < 7.25) glass = mix(chest, shelf, drinkEase((t - 6.3) / 0.95));
  const raised = drinkEase((t - 3.2) / 0.65) * (1 - drinkEase((t - 5.55) / 0.65));
  tilt = raised * 61;
  // Small deliberate swallow pulses give the hold weight without camera shake.
  const sipWindow = drinkEase((t - 3.85) / 0.2) * (1 - drinkEase((t - 5.3) / 0.2));
  if (!reducedMotion && t >= 3.25 && t < 5.55) {
    glass = glass.slice();
    glass[1] += Math.sin((t - 3.85) * 9.4) * 0.0018 * sipWindow;
    tilt += Math.sin((t - 3.85) * 9.4) * 0.65 * sipWindow;
  }
  // Reduced motion cuts to a held glass and replaces it directly after the
  // sip. This removes the long reaching arm without an unsupported floating
  // glass or a forced head turn; the recorded sip/relief clock is unchanged.
  if (reducedMotion && t < 2.55) glass = chest.slice();
  if (reducedMotion && t >= 6.3) glass = shelf;
  const carried = reducedMotion ? t < 6.3 : t >= 1.35 && t < 7.25;
  const grip = reducedMotion ? (carried ? 1 : 0) : drinkEase((t - 0.8) / 0.55) * (1 - drinkEase((t - 7.25) / 0.35));
  // This is the palm's point of contact. The hand asset's wrist offset is
  // calibrated separately; the shared transform keeps fingertips on the glass.
  const contactAngle = tilt * Math.PI / 180;
  const contact = [glass[0] + 0.044, glass[1] + 0.066 * Math.cos(contactAngle), glass[2] + 0.066 * Math.sin(contactAngle)];
  let hand = contact;
  if (!reducedMotion && t < 1.15) hand = mix(offscreen, contact, drinkEase(t / 1.15));
  else if (!reducedMotion && t > 7.55) hand = mix(contact, offscreen, drinkEase((t - 7.55) / 0.7));
  const consumed = drinkEase((t - 3.85) / 1.55);
  return { time: t, glass, hand, tilt, grip, consumed, fill: GLASS_FULL - consumed * (GLASS_FULL - GLASS_EMPTY),
    carried,
    handVisible: reducedMotion ? carried : t < 8.25,
    lean: reducedMotion ? 0 : drinkEase(t / 1.05) * (1 - drinkEase((t - 1.35) / 1.2)),
    headLift: reducedMotion ? 0 : drinkEase(t / 0.8) * (1 - drinkEase((t - 8.25) / 0.75)),
    complete: t >= DRINK_DURATION };
}

// The free surface stays level as the tumbler tips. The tumbler (public/assets/props/drinking-glass.json, a downloaded
// highball glass) tapers: inner radius 22.6 mm at its floor to 31.9 mm at the rim; the water keeps 0.6 mm off the wall.
export const GLASS_INTERIOR = Object.freeze({ bottom: 0.0076, top: 0.1185, radiusBottom: 0.0220, radiusTop: 0.0313 });   // 0.6 mm inside the wall
export const GLASS_FULL = 0.098;               // water height when poured (about 200 ml)
export const GLASS_EMPTY = 0.016;              // what is left after the last sip
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
