// Pure math for the Fourier page: coefficients of a function on one period,
// partial sums, and the jumps where the Gibbs overshoot appears. No DOM.
//
// Coefficients come from the midpoint rule on M equally spaced samples. For a
// periodic integrand this rule is far more accurate than Simpson's: its
// error falls faster than any power of 1/M for smooth periodic functions,
// and it costs one evaluation of f per sample for all coefficients together.

/** The midpoints a + (j + ½)·T/M, j = 0 … M − 1, of one period [a, a + T], and f there. */
export function sampleMidpoints(f, a, T, M) {
  const xs = new Float64Array(M);
  const fs = new Float64Array(M);
  for (let j = 0; j < M; j++) {
    xs[j] = a + ((j + 0.5) * T) / M;
    fs[j] = f(xs[j]);
  }
  return { xs, fs };
}

/**
 * Coefficients of f(x) ~ a₀ + Σ (aₖ cos kωx + bₖ sin kωx), ω = 2π/T, for
 * k ≤ N, from samples at the midpoints: a₀ is the mean of f, aₖ and bₖ are
 * (2/T)∫ f cos / f sin over the period. Returns { a, b } (b[0] = 0).
 */
export function coefficients({ xs, fs }, T, N) {
  const M = xs.length;
  const w = (2 * Math.PI) / T;
  const a = new Float64Array(N + 1);
  const b = new Float64Array(N + 1);
  for (let j = 0; j < M; j++) {
    // cos/sin of kωx by the angle-addition recurrence, from k = 0 up.
    const c1 = Math.cos(w * xs[j]);
    const s1 = Math.sin(w * xs[j]);
    let c = 1;
    let s = 0;
    const y = fs[j];
    for (let k = 0; k <= N; k++) {
      a[k] += y * c;
      b[k] += y * s;
      const cn = c * c1 - s * s1;
      s = s * c1 + c * s1;
      c = cn;
    }
  }
  a[0] /= M;
  for (let k = 1; k <= N; k++) {
    a[k] *= 2 / M;
    b[k] *= 2 / M;
  }
  return { a, b };
}

/** Sₙ(x) = a₀ + Σ_{k=1}^{n} (aₖ cos kωx + bₖ sin kωx). */
export function partialSum({ a, b }, T, n, x) {
  const w = (2 * Math.PI) / T;
  const c1 = Math.cos(w * x);
  const s1 = Math.sin(w * x);
  let c = c1;
  let s = s1;
  let sum = a[0];
  for (let k = 1; k <= n; k++) {
    sum += a[k] * c + b[k] * s;
    const cn = c * c1 - s * s1;
    s = s * c1 + c * s1;
    c = cn;
  }
  return sum;
}

/** √(aₖ² + bₖ²), the size of the k-th harmonic (for k = 0: |a₀|). */
export function amplitude({ a, b }, k) {
  return Math.hypot(a[k], b[k]);
}

/** f extended periodically from [a, a + T) to every x. */
export function periodic(f, a, T) {
  return (x) => f(a + (((x - a) % T) + T) % T);
}

/**
 * The largest jump of the periodic extension, judged from the samples
 * (including the step from the last sample back to the first): { at, size }
 * where `at` is the x between the two samples and size = f(right) − f(left).
 * A step counts as a jump only when it is `factor` times larger than both
 * neighbouring steps, so a steep but continuous stretch doesn't. Null if none.
 */
export function largestJump({ xs, fs }, T, factor = 20) {
  const M = xs.length;
  const step = (j) => fs[(j + 1) % M] - fs[j % M];
  let best = null;
  for (let j = 0; j < M; j++) {
    const d = step(j);
    const around = Math.max(Math.abs(step(j + M - 1)), Math.abs(step(j + 1)));
    if (!(Math.abs(d) > 0) || Math.abs(d) < factor * around) continue;
    if (!best || Math.abs(d) > Math.abs(best.size)) {
      best = { at: j + 1 < M ? (xs[j] + xs[j + 1]) / 2 : xs[j] + T / M / 2, size: d };
    }
  }
  return best;
}
