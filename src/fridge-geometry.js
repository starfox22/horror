// Measured frame of the original apartment refrigerator. Local +z faces the room.
export const FRIDGE = Object.freeze({
  origin: Object.freeze([1.55, 0, -0.66]), yaw: -3.04,
  hinge: Object.freeze([0.326, 0, 0.282]), width: 0.663,
  opening: 106, handle: Object.freeze([-0.24, 1.49, 0.34]),
  jar: Object.freeze([-0.095, 1.3336, 0.025]),
  light: Object.freeze([0, 1.935, 0.18]),
});
const angle = FRIDGE.yaw * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
export function fridgeLocal(point) {
  const x = point[0] - FRIDGE.origin[0], z = point[2] - FRIDGE.origin[2];
  return [c * x - s * z, point[1], s * x + c * z];
}
export function fridgeWorld(point) {
  return [FRIDGE.origin[0] + c * point[0] + s * point[2], point[1], FRIDGE.origin[2] - s * point[0] + c * point[2]];
}

// Only the model's refrigerator and its bounded black door gasket are eligible.
// Removing the old cabinet's front cap opens a real cavity; its sides/back and
// the complete lower freezer remain in the original static mesh.
export function classifyFridgeTriangle(worldPoints, entityName, materialName) {
  const p = worldPoints.map(fridgeLocal);
  const original = /^Refrigator\.001_/.test(entityName);
  if (original && /^BrushedMetalSeamless/.test(materialName) && p.every(v => v[2] > 0.2734 && v[2] < 0.2762)) return 'cap';
  if (original && !/^Aluminum/.test(materialName) && p.every(v => v[1] > 0.934 && v[2] > 0.235)) return 'door';
  if (/^Black(?:@main)?$/.test(materialName) && p.every(v => v[0] > -0.34 && v[0] < 0.332 && v[1] > 0.934 && v[1] < 2.03 && v[2] > 0.245 && v[2] < 0.302)) return 'door';
  return 'keep';
}

export function fridgeDoorSegment(degrees) {
  const a = degrees * Math.PI / 180, h = FRIDGE.hinge;
  const p = fridgeWorld(h), q = fridgeWorld([h[0] - Math.cos(a) * FRIDGE.width, 0, h[2] + Math.sin(a) * FRIDGE.width]);
  return [p[0], p[2], q[0], q[2]];
}
