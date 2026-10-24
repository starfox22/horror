// Still water inside the refrigerator's jug, fitted to the jug's measured inner wall (public/assets/props/water-jug.json
// `interior`: [y, inner radius] from the inner floor up, metres in the jug's own frame) a little inside it, with a
// closed floor and a level surface that leaves a slight meniscus at the glass.
export const WATER_INSET = 0.0012;             // clearance from the inner wall
export const JUG_WATER_LEVEL = 0.14;           // about 1.3 litres, below the jug's waist ring

const radiusAt = (profile, y) => {
  if (y <= profile[0][0]) return profile[0][1];
  for (let i = 1; i < profile.length; i++) {
    const [y1, r1] = profile[i], [y0, r0] = profile[i - 1];
    if (y <= y1) return r0 + (r1 - r0) * (y - y0) / (y1 - y0);
  }
  return profile.at(-1)[1];
};

export function makeWaterGeometry({ profile, floor }, level = JUG_WATER_LEVEL, segments = 64) {
  const rings = [[floor + 0.0006, radiusAt(profile, floor + 0.0006)], ...profile.filter(([y]) => y > floor + 0.0006 && y < level), [level, radiusAt(profile, level)]]
    .map(([y, r]) => [y, r - WATER_INSET]);
  const positions = [], normals = [], indices = [];
  rings.forEach(([y, radius], ring) => {
    const before = rings[Math.max(0, ring - 1)], after = rings[Math.min(rings.length - 1, ring + 1)];
    const slope = (after[1] - before[1]) / Math.max(1e-6, after[0] - before[0]), length = Math.hypot(1, slope);
    for (let i = 0; i <= segments; i++) {
      const a = i * Math.PI * 2 / segments, c = Math.cos(a), s = Math.sin(a);
      positions.push(radius * c, y, radius * s); normals.push(c / length, -slope / length, s / length);
      if (ring && i < segments) {
        const p = (ring - 1) * (segments + 1) + i, q = ring * (segments + 1) + i;
        indices.push(p, q, p + 1, p + 1, q, q + 1);
      }
    }
  });
  // Level surface (its centre a hair lower: the meniscus) and the floor.
  const cap = (y, centreY, radius, up) => {
    const start = positions.length / 3;
    positions.push(0, centreY, 0); normals.push(0, up ? 1 : -1, 0);
    for (let i = 0; i <= segments; i++) {
      const a = i * Math.PI * 2 / segments;
      positions.push(radius * Math.cos(a), y, radius * Math.sin(a)); normals.push(0, up ? 1 : -1, 0);
      if (i < segments) indices.push(...(up ? [start, start + i + 2, start + i + 1] : [start, start + i + 1, start + i + 2]));
    }
  };
  const [topY, topR] = rings.at(-1), [floorY, floorR] = rings[0];
  cap(topY, topY - 0.00035, topR, true);
  cap(floorY, floorY, floorR, false);
  return { positions, normals, indices, level };
}
