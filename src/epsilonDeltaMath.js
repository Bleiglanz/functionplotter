// Pure math for the ε–δ page: how far f strays from f(x₀) over a window
// |x − x₀| < δ, and the largest δ that keeps it within ε. No DOM.
//
// Points where f is undefined (NaN) are outside its domain and are skipped:
// the definition only speaks about x where f(x) exists.

const GRID = 4000; // samples per side
const BISECTIONS = 60;

/**
 * The largest |f(x) − f(x₀)| over the open window x₀ − δ < x < x₀ + δ, sampled
 * at `samples` points per side (plus points close to x₀, so a jump at x₀ is
 * seen). Returns { max, at } (at = the x where it occurs), max = 0 for an empty
 * window, or NaN when f(x₀) itself is undefined. `skipped` counts samples where
 * f was undefined.
 */
export function deviation(f, x0, delta, samples = GRID) {
  const y0 = f(x0);
  if (Number.isNaN(y0)) return { max: NaN, at: x0, skipped: 0 };
  let max = 0;
  let at = x0;
  let skipped = 0;
  const visit = (x) => {
    const y = f(x);
    if (Number.isNaN(y)) {
      skipped++;
      return;
    }
    const d = Math.abs(y - y0);
    if (d > max) {
      max = d;
      at = x;
    }
  };
  if (!(delta > 0)) return { max, at, skipped };
  for (const t of offsets(delta, samples)) {
    visit(x0 - t);
    visit(x0 + t);
  }
  return { max, at, skipped };
}

/**
 * Distances from x₀ to test, all below `range`, increasing: a uniform grid of
 * `samples` steps (the last one just inside the open window), and before its
 * first step a geometric run down to range·2⁻⁴⁰, so that a jump right at x₀
 * is caught.
 */
function offsets(range, samples) {
  const out = [];
  const step = range / samples;
  for (let k = 40; k >= 1; k--) {
    const t = step * 2 ** -k;
    if (t > 0) out.push(t);
  }
  for (let j = 1; j < samples; j++) out.push(step * j);
  out.push(range * (1 - 1e-12));
  return out;
}

/**
 * The largest δ ≤ maxDelta with |f(x) − f(x₀)| < ε for every x (where f is
 * defined) with |x − x₀| < δ, found by walking out from x₀ on each side to the
 * first sample that leaves the band and bisecting between it and the last
 * one inside. Returns { delta, at } where `at` is the x where the band is
 * first left (null if it isn't within maxDelta, then delta = maxDelta), or
 * { undefinedAt: true } when f(x₀) does not exist. delta ≈ 0 means no δ works:
 * f jumps at x₀ by at least ε. Narrow spikes between samples can be missed.
 */
export function largestDelta(f, x0, eps, maxDelta, samples = GRID) {
  const y0 = f(x0);
  if (Number.isNaN(y0)) return { undefinedAt: true };
  const fails = (x) => {
    const y = f(x);
    return !Number.isNaN(y) && !(Math.abs(y - y0) < eps);
  };
  let best = { delta: maxDelta, at: null };
  for (const side of [-1, 1]) {
    let inside = 0;
    for (const t of offsets(maxDelta, samples)) {
      if (t >= best.delta) break; // the other side already limits δ more
      if (!fails(x0 + side * t)) {
        inside = t;
        continue;
      }
      // Bisect between the last distance inside and the first one outside.
      let lo = inside;
      let hi = t;
      for (let i = 0; i < BISECTIONS && hi - lo > 1e-15 * Math.max(1, Math.abs(x0)); i++) {
        const mid = (lo + hi) / 2;
        if (fails(x0 + side * mid)) hi = mid;
        else lo = mid;
      }
      if (hi < best.delta) best = { delta: hi, at: x0 + side * hi };
      break;
    }
  }
  return best;
}
