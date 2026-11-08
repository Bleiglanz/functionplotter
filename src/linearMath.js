// Pure math for 2×2 matrices, shared by the linear-maps and eigenvector pages.
// A matrix is [a, b, c, d] for ( a b ; c d ), the convention of the URL hash
// (keys a, b, c, d). No DOM.

const EPS = 1e-12;

/** A·v for v = [x, y]. */
export function apply([a, b, c, d], [x, y]) {
  return [a * x + b * y, c * x + d * y];
}

export function det([a, b, c, d]) {
  return a * d - b * c;
}

export function trace([a, , , d]) {
  return a + d;
}

/** The matrix scale used for tolerances: its largest entry, at least 1. */
function size(m) {
  return Math.max(1, ...m.map(Math.abs));
}

/** A⁻¹, or null when A is singular (det ≈ 0 relative to its entries). */
export function inverse(m) {
  const D = det(m);
  if (Math.abs(D) <= 1e-10 * size(m) ** 2) return null;
  const [a, b, c, d] = m;
  return [d / D, -b / D, -c / D, a / D];
}

/** (1 − t)·I + t·A: the identity for t = 0, A for t = 1. */
export function towards([a, b, c, d], t) {
  return [1 - t + t * a, t * b, t * c, 1 - t + t * d];
}

/** Unit vector in the direction of v. */
function unit([x, y]) {
  const r = Math.hypot(x, y);
  return [x / r, y / r];
}

/**
 * Eigenvalues and eigenvectors of A, from λ² − tr(A)·λ + det(A) = 0:
 *   { kind: 'distinct', values: [λ₁, λ₂], vectors: [v₁, v₂] }  two real directions (λ₁ > λ₂)
 *   { kind: 'scalar', values: [λ, λ] }                          A = λI: every direction
 *   { kind: 'defective', values: [λ, λ], vectors: [v] }         one direction only (a shear)
 *   { kind: 'complex', re, im }                                 λ = re ± i·im: no real direction
 * Vectors have length 1.
 */
export function eigen(m) {
  const [a, b, c, d] = m;
  const tr = a + d;
  const disc = (a - d) ** 2 + 4 * b * c; // tr² − 4 det, written to avoid cancellation
  const tol = EPS * size(m) ** 2;
  if (disc < -tol) return { kind: 'complex', re: tr / 2, im: Math.sqrt(-disc) / 2 };
  if (disc <= tol) {
    const lambda = tr / 2;
    if (Math.abs(b) <= EPS * size(m) && Math.abs(c) <= EPS * size(m) && Math.abs(a - d) <= EPS * size(m)) {
      return { kind: 'scalar', values: [lambda, lambda] };
    }
    return { kind: 'defective', values: [lambda, lambda], vectors: [vectorFor(m, lambda)] };
  }
  const root = Math.sqrt(disc);
  // The larger-magnitude root first by the stable formula, the other from the product.
  const big = (tr + Math.sign(tr || 1) * root) / 2;
  const small = big !== 0 ? det(m) / big : (tr - Math.sign(tr || 1) * root) / 2;
  const values = big > small ? [big, small] : [small, big];
  return { kind: 'distinct', values, vectors: values.map((l) => vectorFor(m, l)) };
}

/** A unit vector in the null space of A − λI, from whichever row is larger. */
function vectorFor([a, b, c, d], lambda) {
  const r1 = [a - lambda, b];
  const r2 = [c, d - lambda];
  const row = Math.hypot(...r1) >= Math.hypot(...r2) ? r1 : r2;
  // (p, q)·v = 0 for v = (−q, p); a zero row means every vector works.
  if (Math.hypot(...row) === 0) return [1, 0];
  const v = unit([-row[1], row[0]]);
  // A fixed sign: pointing into the right half-plane (or up).
  return v[0] < -EPS || (Math.abs(v[0]) <= EPS && v[1] < 0) ? [-v[0], -v[1]] : v;
}

/** The angle in degrees from v to w, in (−180, 180]. */
export function angleBetween([vx, vy], [wx, wy]) {
  const deg = (Math.atan2(vx * wy - vy * wx, vx * wx + vy * wy) * 180) / Math.PI;
  return deg === -180 ? 180 : deg;
}

/**
 * What kind of map A is, for the explanation. Returns one of
 *   { kind: 'identity' }, { kind: 'zero' },
 *   { kind: 'scaling', factor } (λI, with factor ≠ 1),
 *   { kind: 'rotation', angle, scale } (a rotation by `angle` degrees, times scale > 0),
 *   { kind: 'reflection', axis, scale } (reflection in the line at `axis` degrees, times scale),
 *   { kind: 'stretch', factors: [sx, sy] } (diagonal),
 *   { kind: 'shear', axis: 'x' | 'y', amount },
 *   { kind: 'singular' } (det 0: the plane collapses onto a line or point),
 *   { kind: 'general' }.
 */
export function classify(m) {
  const [a, b, c, d] = m;
  const t = 1e-9 * size(m);
  const near = (p, q) => Math.abs(p - q) <= t;
  if (m.every((v) => near(v, 0))) return { kind: 'zero' };
  if (near(b, 0) && near(c, 0)) {
    if (near(a, d)) return near(a, 1) ? { kind: 'identity' } : { kind: 'scaling', factor: a };
    return { kind: 'stretch', factors: [a, d] };
  }
  if (near(det(m), 0)) return { kind: 'singular' };
  // a rotation times a scale: ( a −c ; c a )
  if (near(a, d) && near(b, -c)) {
    return { kind: 'rotation', angle: (Math.atan2(c, a) * 180) / Math.PI, scale: Math.hypot(a, c) };
  }
  // a reflection times a scale: ( a c ; c −a )
  if (near(a, -d) && near(b, c)) {
    return { kind: 'reflection', axis: (Math.atan2(c, a) * 90) / Math.PI, scale: Math.hypot(a, c) };
  }
  if (near(a, 1) && near(d, 1) && near(c, 0)) return { kind: 'shear', axis: 'x', amount: b };
  if (near(a, 1) && near(d, 1) && near(b, 0)) return { kind: 'shear', axis: 'y', amount: c };
  return { kind: 'general' };
}
