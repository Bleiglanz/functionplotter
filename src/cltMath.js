// Pure math for the central-limit-theorem page: a seeded random generator,
// a few distributions, sample means, histograms and the normal curve. No DOM.

/**
 * A seeded generator of numbers in [0, 1) (mulberry32): the same seed gives
 * the same sequence on every browser, which is what lets a link reproduce a
 * picture made from random samples. Seeds are taken as 32-bit integers.
 */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The distributions on offer. Each has: sample(rand), mean, variance,
 * skewness, the range [lo, hi] shown, and either density(x) (continuous) or
 * values [[x, probability], …] (discrete; `step` is the spacing of the values).
 */
export const DISTRIBUTIONS = {
  uniform: {
    label: 'Uniform on [0, 1]',
    sample: (r) => r(),
    mean: 1 / 2,
    variance: 1 / 12,
    skewness: 0,
    range: [0, 1],
    density: (x) => (x >= 0 && x <= 1 ? 1 : 0),
  },
  exponential: {
    label: 'Exponential (mean 1): skewed',
    sample: (r) => -Math.log(1 - r()),
    mean: 1,
    variance: 1,
    skewness: 2,
    range: [0, 5],
    density: (x) => (x >= 0 ? Math.exp(-x) : 0),
  },
  die: {
    label: 'A fair die',
    sample: (r) => 1 + Math.floor(6 * r()),
    mean: 3.5,
    variance: 35 / 12,
    skewness: 0,
    range: [1, 6],
    step: 1,
    values: [1, 2, 3, 4, 5, 6].map((k) => [k, 1 / 6]),
  },
  coin: {
    label: 'A coin with heads (1) 20 % of the time',
    sample: (r) => (r() < 0.2 ? 1 : 0),
    mean: 0.2,
    variance: 0.16,
    skewness: 1.5, // (1 − 2p)/√(p(1 − p))
    range: [0, 1],
    step: 1,
    values: [
      [0, 0.8],
      [1, 0.2],
    ],
  },
  arcsine: {
    label: 'U-shaped (arcsine)',
    sample: (r) => Math.sin((Math.PI * r()) / 2) ** 2,
    mean: 1 / 2,
    variance: 1 / 8,
    skewness: 0,
    range: [0, 1],
    density: (x) => (x > 0 && x < 1 ? 1 / (Math.PI * Math.sqrt(x * (1 - x))) : NaN),
  },
  twoHumps: {
    label: 'Two humps: [0, 0.3] or [0.7, 1]',
    sample: (r) => (r() < 0.5 ? 0.3 * r() : 0.7 + 0.3 * r()),
    mean: 1 / 2,
    variance: 0.13, // E[x²] = (0.03 + 0.73)/2 = 0.38
    skewness: 0,
    range: [0, 1],
    density: (x) => ((x >= 0 && x <= 0.3) || (x >= 0.7 && x <= 1) ? 1 / 0.6 : 0),
  },
};

/** `count` means of n independent draws each. */
export function sampleMeans(dist, n, count, rand) {
  const out = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    let sum = 0;
    for (let k = 0; k < n; k++) sum += dist.sample(rand);
    out[i] = sum / n;
  }
  return out;
}

/** Mean and standard deviation of the values. */
export function meanAndSd(values) {
  let m = 0;
  for (const v of values) m += v;
  m /= values.length;
  let s = 0;
  for (const v of values) s += (v - m) ** 2;
  return { mean: m, sd: Math.sqrt(s / (values.length - 1)) };
}

/**
 * Bins for the histogram of means of n draws on [lo, hi]. For a discrete
 * distribution the means lie on a lattice of spacing step/n; then each bin
 * holds whole lattice points (centred on them), so bars don't alternate
 * between full and empty. Returns { edges } with edges[0] = lo' ≤ lo and
 * edges.at(-1) = hi' ≥ hi.
 */
export function binEdges(dist, n, lo, hi, target = 40) {
  if (!dist.step) {
    const w = (hi - lo) / target;
    return { edges: Array.from({ length: target + 1 }, (_, i) => lo + i * w) };
  }
  const lattice = dist.step / n;
  const per = Math.max(1, Math.round((hi - lo) / target / lattice)); // lattice points per bin
  const w = per * lattice;
  // Bins start half a lattice step below a lattice point (the lattice contains dist.range[0]).
  const origin = dist.range[0] - lattice / 2;
  const first = origin + Math.floor((lo - origin) / w) * w;
  const edges = [];
  for (let e = first; e < hi + w; e += w) edges.push(e);
  return { edges };
}

/** Counts of the values in each bin [edges[i], edges[i+1]). */
export function histogram(values, edges) {
  const counts = new Array(edges.length - 1).fill(0);
  const lo = edges[0];
  const w = edges[1] - edges[0];
  for (const v of values) {
    const i = Math.floor((v - lo) / w + 1e-9);
    if (i >= 0 && i < counts.length) counts[i]++;
  }
  return counts;
}

export function normalPdf(x, mu, sigma) {
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
}

/** Φ(x), the standard normal distribution function (error below 10⁻⁷). */
export function normalCdf(x) {
  // Abramowitz & Stegun 7.1.26 for erf.
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-z * z);
  return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/**
 * The largest gap between the share of values ≤ x and Φ((x − μ)/σ), over all
 * x (the Kolmogorov distance between the sample and the normal curve).
 */
export function distanceToNormal(values, mu, sigma) {
  const sorted = Float64Array.from(values).sort();
  const N = sorted.length;
  let worst = 0;
  for (let i = 0; i < N; i++) {
    const F = normalCdf((sorted[i] - mu) / sigma);
    // Just below and at the value: the empirical function jumps from i/N to (i + 1)/N
    // (ties: up to the last equal value).
    let j = i;
    while (j + 1 < N && sorted[j + 1] === sorted[i]) j++;
    worst = Math.max(worst, Math.abs(F - i / N), Math.abs((j + 1) / N - F));
    i = j;
  }
  return worst;
}
