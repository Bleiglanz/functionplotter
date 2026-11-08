// Pure math for the sequences page: estimating a limit, and N(ε), the index
// from which every term stays within ε of it. No DOM.

/** Terms aₙ for n = 1 … count (index 0 holds a₁). */
export function terms(a, count) {
  return Array.from({ length: count }, (_, i) => a(i + 1));
}

// The decades n = 10ᵏ at which the tail is probed for estimateLimit.
const DECADES = [2, 3, 4, 5, 6];

/**
 * Aitken's Δ² on three values s₀, s₁, s₂: exact when sₖ = L + c·qᵏ. Applied to
 * aₙ at n = 10², 10³, 10⁴ … this cancels an error like c/nᵖ, which shrinks by
 * the same factor 10⁻ᵖ per decade. Falls back to s₂ when the differences vanish.
 */
function aitken(s0, s1, s2) {
  const d1 = s1 - s0;
  const d2 = s2 - s1;
  const denom = d2 - d1;
  if (!Number.isFinite(denom) || Math.abs(denom) <= 1e-14 * Math.max(Math.abs(s2), 1e-300)) return s2;
  return s2 - (d2 * d2) / denom;
}

/** Aitken applied twice over five values, to cancel two powers of 1/n. */
function accelerate(s) {
  const once = [0, 1, 2].map((i) => aitken(s[i], s[i + 1], s[i + 2]));
  return aitken(...once);
}

/**
 * Estimates lim aₙ from terms far out: the tail at n = 10² … 10⁶, and at the
 * neighbours 10ᵏ + 1, so that sequences jumping between even and odd n are
 * caught. Returns { limit } for a finite limit, { infinite: ±1 } when the
 * terms grow without bound, or { none: true } when the two subsequences or
 * the decades disagree. The estimate is a guess from finitely many terms:
 * sequences that settle only after n = 10⁶ fool it.
 */
export function estimateLimit(a) {
  const even = DECADES.map((k) => a(10 ** k));
  const odd = DECADES.map((k) => a(10 ** k + 1));
  const all = [...even, ...odd];
  if (all.some((v) => Number.isNaN(v))) return { none: true };
  // Unbounded: one sign, the size never shrinking, and huge at the end.
  for (const sign of [1, -1]) {
    const grows = (s) => s.every((v, i) => sign * v > 0 && (i === 0 || sign * v >= sign * s[i - 1]));
    if (grows(even) && grows(odd) && sign * even.at(-1) > 1e6 && sign * even.at(-1) > 10 * sign * even[0]) return { infinite: sign };
  }
  const le = accelerate(even);
  const lo = accelerate(odd);
  const scale = Math.max(1, Math.abs(le), Math.abs(lo));
  // The tail must have settled: the last decade is close to the estimate
  // compared with how much the terms moved, and both subsequences agree.
  const spread = Math.max(...all) - Math.min(...all);
  const settled = (s, l) => Math.abs(s.at(-1) - l) <= Math.max(1e-6 * scale, 0.05 * spread);
  if (!Number.isFinite(le) || Math.abs(le - lo) > 1e-5 * scale || !settled(even, le) || !settled(odd, lo)) return { none: true };
  // Round away digits below what the tail can tell: about a tenth of how far
  // the last term still is from the estimate.
  const uncertainty = Math.max(Math.abs(even.at(-1) - le), Math.abs(le - lo), 1e-15 * scale);
  return { limit: roundTo(le, uncertainty) };
}

/** v rounded to a power of ten below u / 10; 0 when |v| < u. */
function roundTo(v, u) {
  if (Math.abs(v) < u) return 0;
  const step = 10 ** Math.floor(Math.log10(u / 10));
  return +(Math.round(v / step) * step).toPrecision(12);
}

/**
 * Deviations from L, as needed for N(ε): `tail[i]` = max |aₙ − L| over all
 * n ≥ i + 1 among the given terms (index 0 is n = 1), so it never increases.
 * `beyond` is the largest deviation found further out, at a few sample points
 * n = count·2ʲ up to 10⁸; it bounds every tail value from below.
 */
export function tailDeviations(values, L, a) {
  const count = values.length;
  let beyond = 0;
  if (a) {
    for (let n = count * 2; n <= 1e8; n *= 2) {
      for (const m of [n, n + 1]) {
        const d = Math.abs(a(m) - L);
        beyond = Math.max(beyond, Number.isNaN(d) ? Infinity : d);
      }
    }
  }
  const tail = new Array(count);
  let max = beyond;
  for (let i = count - 1; i >= 0; i--) {
    const d = Math.abs(values[i] - L);
    max = Math.max(max, Number.isNaN(d) ? Infinity : d);
    tail[i] = max;
  }
  return { tail, beyond };
}

/**
 * N(ε): the smallest N with |aₙ − L| < ε for every n ≥ N, from tailDeviations.
 * Returns { N } when found among the stored terms, { beyond: true } when the
 * last stored terms still leave the band but the probes further out don't
 * (N lies past the stored terms), and { never: true } when the probes further
 * out leave it too (ε is not larger than the tail's deviation from L).
 */
export function firstIndex({ tail, beyond }, eps) {
  if (!(beyond < eps)) return { never: true };
  if (!(tail.at(-1) < eps)) return { beyond: true };
  // tail is non-increasing: binary search for the first index below ε.
  let lo = 0;
  let hi = tail.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tail[mid] < eps) hi = mid;
    else lo = mid + 1;
  }
  return { N: lo + 1 };
}
