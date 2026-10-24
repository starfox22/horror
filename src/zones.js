// Which part of the flat a point is in (floor plan, metres), without the engine: the same split as the probes' rooms
// (probes.js ZONES) with the corridor separate. 'main' is the open-plan room (living, dining, kitchen, office).
export const zoneAt = (x, z) => (z > 2.72 ? (x < 1.55 ? 'main' : 'hall') : x < 6.40 ? 'main' : x < 9.20 ? 'bath' : 'bed');

// Finer areas for thoughts, captions and the journal.
export function areaAt(x, z) {
  const zone = zoneAt(x, z);
  if (zone !== 'main') return zone === 'hall' ? 'corridor' : zone === 'bath' ? 'bathroom' : 'bedroom';
  if (x > 1.55) return 'office';
  if (x < -3.3) return 'living room';
  return z < 0.9 ? 'kitchen' : 'dining area';
}

// Inside the right half of the bedroom wardrobe's tall section (the nest; his way down from the void).
export const inWardrobe = (x, z) => x > 9.28 && x < 9.95 && z > -0.53 && z < 0.27;
