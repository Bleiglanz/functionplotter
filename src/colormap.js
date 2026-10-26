// Viridis control points, interpolated linearly. t in [0, 1].
const STOPS = [
  [0.267, 0.005, 0.329],
  [0.283, 0.141, 0.458],
  [0.254, 0.265, 0.530],
  [0.207, 0.372, 0.553],
  [0.164, 0.471, 0.558],
  [0.128, 0.567, 0.551],
  [0.135, 0.659, 0.518],
  [0.267, 0.749, 0.441],
  [0.478, 0.821, 0.318],
  [0.741, 0.873, 0.150],
  [0.993, 0.906, 0.144],
];

export function viridis(t, out = [0, 0, 0]) {
  const s = Math.min(1, Math.max(0, t)) * (STOPS.length - 1);
  const k = Math.min(STOPS.length - 2, Math.floor(s));
  const u = s - k;
  const p = STOPS[k];
  const q = STOPS[k + 1];
  out[0] = p[0] + (q[0] - p[0]) * u;
  out[1] = p[1] + (q[1] - p[1]) * u;
  out[2] = p[2] + (q[2] - p[2]) * u;
  return out;
}
