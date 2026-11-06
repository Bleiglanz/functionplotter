// Pure math for the Riemann-sum page: partitions, tags, sums and a reference
// value of the integral. No DOM, so it is unit-testable.

/** Points inspected per subinterval (plus its endpoints) to approximate inf and sup. */
export const EXTREMUM_SAMPLES = 10;

export const RULES = {
  left: { label: 'Left', tag: 'ξᵢ = xᵢ₋₁, the left endpoint' },
  midpoint: { label: 'Mid', tag: 'ξᵢ = (xᵢ₋₁ + xᵢ)/2, the midpoint' },
  right: { label: 'Right', tag: 'ξᵢ = xᵢ, the right endpoint' },
  lower: { label: 'Lower', tag: 'f(ξᵢ) = inf f on [xᵢ₋₁, xᵢ] (lower Darboux sum)' },
  upper: { label: 'Upper', tag: 'f(ξᵢ) = sup f on [xᵢ₋₁, xᵢ] (upper Darboux sum)' },
};

/** The n + 1 points of the equidistant partition a = x₀ < x₁ < … < xₙ = b. */
export function partition(a, b, n) {
  const dx = (b - a) / n;
  // a + i·dx, but with xₙ exactly b.
  return Array.from({ length: n + 1 }, (_, i) => (i === n ? b : a + i * dx));
}

const finite = (v) => (Number.isFinite(v) ? v : NaN);

function evaluate(f, x) {
  try {
    return finite(f(x));
  } catch {
    return NaN;
  }
}

/**
 * The tag ξ in [lo, hi] for a rule, and f(ξ). For 'lower' and 'upper' the
 * inf/sup is approximated by the smallest/largest of EXTREMUM_SAMPLES + 1
 * equally spaced values; any undefined value makes the height NaN.
 */
export function tag(f, lo, hi, rule) {
  if (rule === 'left') return { x: lo, y: evaluate(f, lo) };
  if (rule === 'right') return { x: hi, y: evaluate(f, hi) };
  if (rule === 'midpoint') {
    const x = (lo + hi) / 2;
    return { x, y: evaluate(f, x) };
  }
  if (rule !== 'lower' && rule !== 'upper') throw new Error(`Unknown rule: ${rule}`);
  const better = rule === 'lower' ? (a, b) => a < b : (a, b) => a > b;
  let best = null;
  for (let k = 0; k <= EXTREMUM_SAMPLES; k++) {
    const x = k === EXTREMUM_SAMPLES ? hi : lo + ((hi - lo) * k) / EXTREMUM_SAMPLES;
    const y = evaluate(f, x);
    if (Number.isNaN(y)) return { x, y: NaN };
    if (!best || better(y, best.y)) best = { x, y };
  }
  return best;
}

/**
 * The Riemann sum Σ f(ξᵢ)·Δx over the equidistant partition of [a, b] into n parts.
 * Returns { dx, xs, tags: [{ x, y }], sum }; sum is NaN if f is undefined at any tag.
 */
export function riemannSum(f, a, b, n, rule) {
  const xs = partition(a, b, n);
  const dx = (b - a) / n;
  const tags = [];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const t = tag(f, xs[i], xs[i + 1], rule);
    tags.push(t);
    sum += t.y * dx;
  }
  return { dx, xs, tags, sum };
}

/** Sₙ for n = 1 … nMax (index n − 1), without keeping the tags. */
export function sums(f, a, b, nMax, rule) {
  const out = [];
  for (let n = 1; n <= nMax; n++) {
    const xs = partition(a, b, n);
    let sum = 0;
    for (let i = 0; i < n; i++) sum += tag(f, xs[i], xs[i + 1], rule).y;
    out.push((sum * (b - a)) / n);
  }
  return out;
}

/**
 * ∫ₐᵇ f by adaptive Simpson, as the reference the sums converge to.
 * NaN if f is undefined (or infinite) anywhere the method evaluates it.
 */
export function integrate(f, a, b, tolerance = 1e-10, maxDepth = 40) {
  const simpson = (fa, fm, fb, h) => (h / 6) * (fa + 4 * fm + fb);
  const step = (lo, hi, flo, fmid, fhi, whole, tol, depth) => {
    const mid = (lo + hi) / 2;
    const fl = evaluate(f, (lo + mid) / 2);
    const fr = evaluate(f, (mid + hi) / 2);
    const left = simpson(flo, fl, fmid, mid - lo);
    const right = simpson(fmid, fr, fhi, hi - mid);
    const diff = left + right - whole;
    if (Number.isNaN(diff)) return NaN;
    if (depth <= 0 || Math.abs(diff) <= 15 * tol) return left + right + diff / 15;
    return step(lo, mid, flo, fl, fmid, left, tol / 2, depth - 1) + step(mid, hi, fmid, fr, fhi, right, tol / 2, depth - 1);
  };
  if (a === b) return 0;
  // Start from a few panels so a symmetric integrand can't fool the first estimate.
  const panels = 8;
  const xs = partition(a, b, panels);
  const ys = xs.map((x) => evaluate(f, x));
  let total = 0;
  for (let i = 0; i < panels; i++) {
    const [lo, hi, flo, fhi] = [xs[i], xs[i + 1], ys[i], ys[i + 1]];
    const fmid = evaluate(f, (lo + hi) / 2);
    total += step(lo, hi, flo, fmid, fhi, simpson(flo, fmid, fhi, hi - lo), tolerance / panels, maxDepth);
  }
  return total;
}

/**
 * Lower and upper sums Lₙ, Uₙ for n = 1 … nMax (index n − 1), sharing one set
 * of f evaluations per subinterval. Same approximation of inf/sup as tag().
 */
export function bounds(f, a, b, nMax) {
  const lower = [];
  const upper = [];
  for (let n = 1; n <= nMax; n++) {
    const xs = partition(a, b, n);
    let lo = 0;
    let hi = 0;
    for (let i = 0; i < n; i++) {
      let min = Infinity;
      let max = -Infinity;
      for (let k = 0; k <= EXTREMUM_SAMPLES; k++) {
        const x = k === EXTREMUM_SAMPLES ? xs[i + 1] : xs[i] + ((xs[i + 1] - xs[i]) * k) / EXTREMUM_SAMPLES;
        const y = evaluate(f, x);
        if (Number.isNaN(y)) {
          min = max = NaN;
          break;
        }
        if (y < min) min = y;
        if (y > max) max = y;
      }
      lo += min;
      hi += max;
    }
    lower.push((lo * (b - a)) / n);
    upper.push((hi * (b - a)) / n);
  }
  return { lower, upper };
}
