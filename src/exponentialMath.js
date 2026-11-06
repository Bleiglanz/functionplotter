// Pure math for the exponential page: f(x) = a·e^(bx + c) + d for parameters
// p = { a, b, c, d }. No DOM, so it is unit-testable.

/** f(x). */
export function value({ a, b, c, d }, x) {
  return a * Math.exp(b * x + c) + d;
}

/** f′(x) = b·(f(x) − d): the slope is proportional to the height above the asymptote. */
export function slope(p, x) {
  return p.b * (value(p, x) - p.d);
}

/** a·e^c, the factor in front of e^(bx) once c is absorbed: a·e^(bx + c) = a·e^c·e^(bx). */
export function scale({ a, c }) {
  return a * Math.exp(c);
}

/** f(0) = a·e^c + d. */
export function yIntercept(p) {
  return scale(p) + p.d;
}

/** −c/b, how far c shifts the curve to the right; null when b = 0. */
export function shift({ b, c }) {
  return b === 0 ? null : -c / b;
}

/** The x where f(x) = 0, i.e. (ln(−d/a) − c)/b; null when there is none. */
export function zero({ a, b, c, d }) {
  if (a === 0 || b === 0 || !(-d / a > 0)) return null;
  return (Math.log(-d / a) - c) / b;
}

/**
 * ln 2/|b|: how far x moves while the distance to the asymptote doubles
 * (b > 0, doubling time) or halves (b < 0, half-life); null when b = 0.
 */
export function factorTwoDistance({ b }) {
  return b === 0 ? null : Math.LN2 / Math.abs(b);
}

/** Where the tangent at x meets the asymptote y = d: always x − 1/b; null when b = 0. */
export function tangentFoot({ b }, x) {
  return b === 0 ? null : x - 1 / b;
}
