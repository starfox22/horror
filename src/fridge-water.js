// Still water fitted inside the reused hollow jar, including its rounded floor.
// Heights/radii are metres in the normalized jar mesh; the floor is y=.009443.
export const WATER_PROFILE = Object.freeze([
  [0.0098, 0.052], [0.0102, 0.0578], [0.0125, 0.0625], [0.015, 0.0648],
  [0.018, 0.0663], [0.022, 0.0677], [0.03, 0.0687], [0.1985, 0.0692],
].map(Object.freeze));
export const WATER_LEVEL = WATER_PROFILE.at(-1)[0];
export function makeWaterGeometry(segments = 64) {
  const positions = [], normals = [], indices = [];
  for (let ring = 0; ring < WATER_PROFILE.length; ring++) {
    const [y, radius] = WATER_PROFILE[ring], before = WATER_PROFILE[Math.max(0, ring - 1)], after = WATER_PROFILE[Math.min(WATER_PROFILE.length - 1, ring + 1)];
    const slope = (after[1] - before[1]) / Math.max(1e-6, after[0] - before[0]);
    const length = Math.hypot(1, slope);
    for (let i = 0; i <= segments; i++) {
      const a = i * Math.PI * 2 / segments, c = Math.cos(a), s = Math.sin(a);
      positions.push(radius * c, y, radius * s); normals.push(c / length, -slope / length, s / length);
      if (ring && i < segments) {
        const a = (ring - 1) * (segments + 1) + i, b = ring * (segments + 1) + i;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  // A separate smooth upper surface leaves a slight meniscus at the glass.
  const start = positions.length / 3, radius = WATER_PROFILE.at(-1)[1];
  positions.push(0, WATER_LEVEL - 0.00035, 0); normals.push(0, 1, 0);
  for (let i = 0; i <= segments; i++) {
    const a = i * Math.PI * 2 / segments;
    positions.push(radius * Math.cos(a), WATER_LEVEL, radius * Math.sin(a)); normals.push(0, 1, 0);
    if (i < segments) indices.push(start, start + i + 2, start + i + 1);
  }
  return { positions, normals, indices };
}
