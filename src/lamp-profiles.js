// Measured from the committed Cables_Black_0 / Black@main shade. Its open rim is
// y=1.278535 and its CLOSED top is y=1.481516. Keep the emitter inside the opening:
// a light above the top throws the shade's dark disk into the middle of its pool.
export const ARC_LAMP = Object.freeze({
  position: Object.freeze([-4.880912, 1.31, 2.698840]),
  bulbDiameter: 0.04,
  inner: 28,
  outer: 70,
});

// A broad, center-bright reflector profile with a soft field at the edge. This is
// multiplied by the spotlight's outer-cone fade, so there is no hard circular lip.
export const arcLampProfile = (degrees) => 0.16 + 0.84 * Math.exp(-((degrees / 50) ** 4));
