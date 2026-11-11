// Pure math for the stereographic projection page: the unit sphere
// X² + Y² + Z² = 1, projected from the north pole N = (0, 0, 1) onto the
// plane Z = 0 (the plane through the equator), read as the complex plane.
// No DOM.
//
// The line from N through P = (X, Y, Z) meets the plane at
//   z = (X + iY) / (1 − Z),
// and the inverse sends z = x + iy back to
//   P = (2x, 2y, |z|² − 1) / (|z|² + 1).
// N itself has no image in the plane: it is the point at infinity.

const DEG = Math.PI / 180;

/** The point of the unit sphere at latitude `lat` and longitude `lon` (degrees). */
export function fromLatLon(lat, lon) {
  const p = lat * DEG;
  const l = lon * DEG;
  return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
}

/** Latitude and longitude in degrees of a point of the sphere (lon in (−180, 180], 0 at the poles). */
export function toLatLon([X, Y, Z]) {
  const lat = Math.asin(Math.max(-1, Math.min(1, Z))) / DEG;
  const lon = Math.hypot(X, Y) < 1e-12 ? 0 : Math.atan2(Y, X) / DEG;
  return { lat, lon: lon === -180 ? 180 : lon };
}

/**
 * The image z = (X + iY)/(1 − Z) of a point of the sphere, as [x, y]; null
 * for the north pole (within `tol` of Z = 1), whose image is ∞.
 */
export function project([X, Y, Z], tol = 1e-12) {
  const d = 1 - Z;
  if (d <= tol) return null;
  return [X / d, Y / d];
}

/** The point of the sphere whose image is z = x + iy. */
export function unproject(x, y) {
  const r2 = x * x + y * y;
  const d = r2 + 1;
  return [(2 * x) / d, (2 * y) / d, (r2 - 1) / d];
}

/**
 * |z| for every point at latitude `lat` (degrees): the parallel at that
 * latitude goes to the circle of this radius about 0. It is
 * cos φ / (1 − sin φ) = tan(45° + φ/2); Infinity at the north pole.
 */
export function parallelRadius(lat) {
  if (lat >= 90) return Infinity;
  return Math.tan((45 + lat / 2) * DEG);
}

/** The latitude (degrees) of the parallel that goes to the circle |z| = r. */
export function latitudeOfRadius(r) {
  return 2 * Math.atan(r) / DEG - 90;
}

/** Clamps a latitude to [−90, 90] and wraps a longitude into (−180, 180]. */
export function normalizeLatLon(lat, lon) {
  const la = Math.max(-90, Math.min(90, lat));
  let lo = ((((lon + 180) % 360) + 360) % 360) - 180;
  if (lo === -180) lo = 180;
  return { lat: la, lon: lo };
}
