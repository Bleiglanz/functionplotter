/**
 * Samples f on a regular (resolution+1) x (resolution+1) grid over the domain.
 * Pure math, no three.js, so it can be unit tested.
 *
 * Returns z values row-major (index = j * (n + 1) + i, i along x, j along y),
 * plus the min/max over finite samples. Non-finite samples (NaN, ±Infinity,
 * or evaluation errors) are stored as NaN.
 */
export function sampleSurface(f, { xMin, xMax, yMin, yMax, resolution }) {
  const n = resolution;
  const z = new Float64Array((n + 1) * (n + 1));
  let zMin = Infinity;
  let zMax = -Infinity;

  for (let j = 0; j <= n; j++) {
    const y = yMin + ((yMax - yMin) * j) / n;
    for (let i = 0; i <= n; i++) {
      const x = xMin + ((xMax - xMin) * i) / n;
      let v;
      try {
        v = f(x, y);
      } catch {
        v = NaN;
      }
      if (Number.isFinite(v)) {
        if (v < zMin) zMin = v;
        if (v > zMax) zMax = v;
      } else {
        v = NaN;
      }
      z[j * (n + 1) + i] = v;
    }
  }

  return { z, zMin, zMax, n };
}

/**
 * Samples a one-variable slice g(t), e.g. t -> f(t, y0), at samples+1 evenly
 * spaced points on [tMin, tMax]. Same NaN convention and min/max semantics as
 * sampleSurface.
 */
export function sampleSlice(g, tMin, tMax, samples) {
  const ts = new Float64Array(samples + 1);
  const zs = new Float64Array(samples + 1);
  let zMin = Infinity;
  let zMax = -Infinity;
  for (let i = 0; i <= samples; i++) {
    const t = tMin + ((tMax - tMin) * i) / samples;
    let v;
    try {
      v = g(t);
    } catch {
      v = NaN;
    }
    if (Number.isFinite(v)) {
      if (v < zMin) zMin = v;
      if (v > zMax) zMax = v;
    } else {
      v = NaN;
    }
    ts[i] = t;
    zs[i] = v;
  }
  return { ts, zs, zMin, zMax };
}

/**
 * Builds triangle indices for the grid, skipping any triangle that touches a
 * NaN sample so undefined regions show up as holes.
 */
export function gridIndices(z, n) {
  const indices = [];
  const ok = (k) => !Number.isNaN(z[k]);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i;
      const b = a + 1;
      const c = a + (n + 1);
      const d = c + 1;
      if (ok(a) && ok(b) && ok(d)) indices.push(a, b, d);
      if (ok(a) && ok(d) && ok(c)) indices.push(a, d, c);
    }
  }
  return indices;
}

/**
 * Partial derivatives of f at (x, y) by central differences, falling back to a
 * one-sided difference where f is undefined on one side (e.g. at the edge of
 * the domain of sqrt). Returns { fx, fy }, or null if either is not finite.
 */
export function partials(f, x, y) {
  const at = (a, b) => {
    try {
      return f(a, b);
    } catch {
      return NaN;
    }
  };
  const z = at(x, y);
  const derivative = (g, t) => {
    const h = 1e-5 * Math.max(1, Math.abs(t));
    const fwd = g(t + h);
    const back = g(t - h);
    if (Number.isFinite(fwd) && Number.isFinite(back)) return (fwd - back) / (2 * h);
    if (Number.isFinite(fwd)) return (fwd - z) / h;
    if (Number.isFinite(back)) return (z - back) / h;
    return NaN;
  };
  const fx = derivative((t) => at(t, y), x);
  const fy = derivative((t) => at(x, t), y);
  return Number.isFinite(z) && Number.isFinite(fx) && Number.isFinite(fy) ? { fx, fy } : null;
}

/**
 * Two tangent directions (dx, dy) at a point of the graph z = f(x, y) with
 * partials fx, fy, orthonormal in the surface's metric: the 3D vectors
 * (dx, dy, fx dx + fy dy) have unit length and are perpendicular. The first
 * points along +x.
 */
export function tangentBasis(fx, fy) {
  const a = Math.sqrt(1 + fx * fx);
  const w = Math.sqrt(1 + fx * fx + fy * fy);
  return [
    { dx: 1 / a, dy: 0 },
    { dx: (-fx * fy) / (a * w), dy: a / w },
  ];
}

/**
 * Traces the geodesic of the graph z = f(x, y) from (x, y) with initial
 * velocity (vx, vy) in the xy-plane (the 3D velocity being (vx, vy, fx vx + fy vy)).
 * In graph coordinates the geodesic equations reduce to
 *   x'' = -fx K,  y'' = -fy K,  K = (fxx x'² + 2 fxy x'y' + fyy y'²) / (1 + fx² + fy²),
 * integrated with RK4 at a fixed parameter step. Derivatives are taken by
 * central differences. Stops on leaving the domain, where f or its derivatives
 * are not finite, or after maxSteps. Returns the points [{ x, y, z }, ...],
 * starting at (x, y).
 */
export function geodesic(f, x, y, vx, vy, { xMin, xMax, yMin, yMax, step, maxSteps }) {
  const at = (a, b) => {
    try {
      return f(a, b);
    } catch {
      return NaN;
    }
  };
  const accel = (px, py, u, v) => {
    const h = 1e-4 * Math.max(1, Math.abs(px), Math.abs(py));
    const z = at(px, py);
    const zxp = at(px + h, py);
    const zxm = at(px - h, py);
    const zyp = at(px, py + h);
    const zym = at(px, py - h);
    const fx = (zxp - zxm) / (2 * h);
    const fy = (zyp - zym) / (2 * h);
    const fxx = (zxp - 2 * z + zxm) / (h * h);
    const fyy = (zyp - 2 * z + zym) / (h * h);
    const fxy = (at(px + h, py + h) - at(px + h, py - h) - at(px - h, py + h) + at(px - h, py - h)) / (4 * h * h);
    const k = (fxx * u * u + 2 * fxy * u * v + fyy * v * v) / (1 + fx * fx + fy * fy);
    return [-fx * k, -fy * k];
  };
  const inside = (px, py) => px >= xMin && px <= xMax && py >= yMin && py <= yMax;

  const points = [];
  let s = [x, y, vx, vy];
  const deriv = ([px, py, u, v]) => [u, v, ...accel(px, py, u, v)];
  const plus = (a, k, c) => a.map((ai, i) => ai + c * k[i]);
  for (let i = 0; i <= maxSteps; i++) {
    const z = at(s[0], s[1]);
    if (!inside(s[0], s[1]) || !Number.isFinite(z)) break;
    points.push({ x: s[0], y: s[1], z });
    const k1 = deriv(s);
    const k2 = deriv(plus(s, k1, step / 2));
    const k3 = deriv(plus(s, k2, step / 2));
    const k4 = deriv(plus(s, k3, step));
    const next = s.map((si, j) => si + (step / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
    if (!next.every(Number.isFinite)) break;
    s = next;
  }
  return points;
}
