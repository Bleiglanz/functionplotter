// Pure math for the secant-to-tangent page: difference quotients and their
// one-sided limits as h → 0. No DOM, so it is unit-testable.

/** The secant slope (f(x0 + h) − f(x0)) / h; NaN for h = 0 or where f is undefined. */
export function differenceQuotient(f, x0, h) {
  if (h === 0) return NaN;
  const q = (f(x0 + h) - f(x0)) / h;
  return Number.isFinite(q) ? q : NaN;
}

// Steps used to judge a one-sided limit: scale·10^-2 … scale·10^-5.
const STEPS = [1e-2, 1e-3, 1e-4, 1e-5];

/**
 * The limit of the difference quotient as h → 0 from one side (dir = +1 from
 * the right, −1 from the left), judged from h = scale·10^-2 … scale·10^-5:
 *
 *   { kind: 'finite', value }   the quotients settle; value is extrapolated
 *   { kind: 'infinite', sign }  they grow steadily in one direction (vertical tangent)
 *   { kind: 'none' }            they neither settle nor grow (e.g. x·sin(1/x) at 0)
 *   { kind: 'undefined' }       f is undefined next to x0 on that side
 *
 * For smooth f the error of the quotient is proportional to h, so successive
 * differences shrink by about 10 per step; that is the test for 'finite'.
 */
export function oneSidedLimit(f, x0, dir, scale = 1) {
  const qs = STEPS.map((s) => differenceQuotient(f, x0, dir * s * scale));
  if (qs.some(Number.isNaN)) return { kind: 'undefined' };
  const diffs = qs.slice(1).map((q, i) => q - qs[i]);
  const size = Math.max(1, ...qs.map(Math.abs));
  const tiny = (d) => Math.abs(d) <= 1e-9 * size;
  const shrinking = diffs.slice(1).every((d, i) => tiny(d) || Math.abs(d) < 0.3 * Math.abs(diffs[i]));
  if (shrinking) {
    // Richardson extrapolation for an error proportional to h (steps 10× apart).
    const [a, b] = qs.slice(-2);
    return { kind: 'finite', value: (10 * b - a) / 9 };
  }
  const sameSign = qs.every((q) => Math.sign(q) === Math.sign(qs[0]) && q !== 0);
  const growing = qs.slice(1).every((q, i) => Math.abs(q) > 1.5 * Math.abs(qs[i]));
  if (sameSign && growing) return { kind: 'infinite', sign: Math.sign(qs[0]) };
  return { kind: 'none' };
}

/**
 * The derivative at x0 from both one-sided limits:
 * { left, right, value } where value is f′(x0) when both limits are finite
 * and agree, else NaN.
 */
export function derivativeAt(f, x0, scale = 1) {
  const left = oneSidedLimit(f, x0, -1, scale);
  const right = oneSidedLimit(f, x0, 1, scale);
  let value = NaN;
  if (left.kind === 'finite' && right.kind === 'finite') {
    const size = Math.max(1, Math.abs(left.value), Math.abs(right.value));
    if (Math.abs(left.value - right.value) <= 1e-6 * size) value = (left.value + right.value) / 2;
  }
  return { left, right, value };
}
