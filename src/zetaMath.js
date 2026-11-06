// Pure math for the zeta page: ζ(x) for real x > 1 and its partial sums. No DOM.

/** Sₙ(x) = Σ_{k=1}^{n} 1/kˣ, summed from the smallest term up for accuracy. */
export function partialSum(x, n) {
  let sum = 0;
  for (let k = n; k >= 1; k--) sum += k ** -x;
  return sum;
}

// B₂ⱼ / (2j)! for j = 1 … 5 (Bernoulli numbers 1/6, −1/30, 1/42, −1/30, 5/66).
const EM_COEFFS = [1 / 12, -1 / 720, 1 / 30240, -1 / 1209600, 1 / 47900160];
const EM_N = 10;

/**
 * ζ(x) for real x > 1 by Euler–Maclaurin summation:
 * ζ(x) = Σ_{k<N} k⁻ˣ + N^{1−x}/(x − 1) + N⁻ˣ/2 + Σⱼ B₂ⱼ/(2j)! · x(x+1)…(x+2j−2) · N^{1−x−2j},
 * accurate to about machine precision with N = 10. NaN for x ≤ 1.
 */
export function zeta(x) {
  if (!(x > 1)) return NaN;
  const N = EM_N;
  let sum = partialSum(x, N - 1) + N ** (1 - x) / (x - 1) + N ** -x / 2;
  let rising = x; // x(x+1)…(x+2j−2)
  for (let j = 1; j <= EM_COEFFS.length; j++) {
    sum += EM_COEFFS[j - 1] * rising * N ** (1 - x - 2 * j);
    rising *= (x + 2 * j - 1) * (x + 2 * j);
  }
  return sum;
}

/**
 * Bounds for the tail ζ(x) − Sₙ(x) = Σ_{k>n} k⁻ˣ from comparing with ∫ t⁻ˣ dt:
 * (n+1)^{1−x}/(x−1) < tail < n^{1−x}/(x−1).
 */
export function tailBounds(x, n) {
  return { lower: (n + 1) ** (1 - x) / (x - 1), upper: n ** (1 - x) / (x - 1) };
}
