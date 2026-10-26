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
