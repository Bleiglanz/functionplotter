// Pure math for the Taylor-polynomial page. No DOM.
//
// Taylor coefficients aₖ = f⁽ᵏ⁾(x₀)/k! are computed by evaluating the parsed
// expression (a math.js node tree) on truncated power series in (x − x₀): every
// node becomes the array [a₀, a₁, …, a_N] of its own coefficients, and each
// operation has a recurrence for the coefficients of its result. This is exact
// up to rounding and costs O(N²) per node, unlike repeated symbolic
// differentiation (whose expressions grow exponentially) or finite differences
// (which lose all accuracy after a few orders).
//
// A coefficient is NaN where the derivative of that order does not exist (or is
// infinite), e.g. for √x at 0 every aₖ with k ≥ 1. All recurrences are causal (aₖ
// of a result depends only on coefficients of index ≤ k), so a NaN at order k
// never spoils lower orders.

const zeros = (N) => new Array(N + 1).fill(0);
const constSeries = (c, N) => {
  const s = zeros(N);
  s[0] = c;
  return s;
};

const add = (a, b) => a.map((v, k) => v + b[k]);
const sub = (a, b) => a.map((v, k) => v - b[k]);
const scale = (a, c) => a.map((v) => v * c);

function mul(a, b) {
  const N = a.length - 1;
  const c = zeros(N);
  for (let k = 0; k <= N; k++) {
    let s = 0;
    for (let j = 0; j <= k; j++) s += a[j] * b[k - j];
    c[k] = s;
  }
  return c;
}

function div(a, b) {
  const N = a.length - 1;
  // A zero constant term in the divisor: cancel common leading zeros (x/x, sin(x)/x).
  const m = leadingIndex(b);
  if (m > 0) {
    if (m > N) return zeros(N).fill(NaN);
    for (let k = 0; k < m; k++) if (a[k] !== 0) return zeros(N).fill(NaN); // a pole
    // Shifting down by m loses the top m orders: they are unknown.
    const shifted = (s) => [...s.slice(m), ...new Array(m).fill(NaN)];
    return div(shifted(a), shifted(b));
  }
  const c = zeros(N);
  for (let k = 0; k <= N; k++) {
    let s = a[k];
    for (let j = 1; j <= k; j++) s -= b[j] * c[k - j];
    c[k] = s / b[0];
  }
  return c;
}

/** Index of the first coefficient that is not exactly 0 (length if none). */
function leadingIndex(a) {
  const m = a.findIndex((v) => v !== 0);
  return m === -1 ? a.length : m;
}

function exp(a) {
  const N = a.length - 1;
  const e = zeros(N);
  e[0] = Math.exp(a[0]);
  for (let k = 1; k <= N; k++) {
    let s = 0;
    for (let j = 1; j <= k; j++) s += j * a[j] * e[k - j];
    e[k] = s / k;
  }
  return e;
}

function log(a) {
  const N = a.length - 1;
  if (!(a[0] > 0)) return zeros(N).fill(NaN);
  const l = zeros(N);
  l[0] = Math.log(a[0]);
  for (let k = 1; k <= N; k++) {
    let s = 0;
    for (let j = 1; j < k; j++) s += j * l[j] * a[k - j];
    l[k] = (a[k] - s / k) / a[0];
  }
  return l;
}

/** sin and cos (sign = −1), or sinh and cosh (sign = +1), together. */
function sinCos(a, sign) {
  const N = a.length - 1;
  const s = zeros(N);
  const c = zeros(N);
  s[0] = sign < 0 ? Math.sin(a[0]) : Math.sinh(a[0]);
  c[0] = sign < 0 ? Math.cos(a[0]) : Math.cosh(a[0]);
  for (let k = 1; k <= N; k++) {
    let ss = 0;
    let cc = 0;
    for (let j = 1; j <= k; j++) {
      ss += j * a[j] * c[k - j];
      cc += j * a[j] * s[k - j];
    }
    s[k] = ss / k;
    c[k] = (sign * cc) / k;
  }
  return [s, c];
}

/** aʳ for a constant real r. */
function pow(a, r) {
  const N = a.length - 1;
  if (r === 0) return constSeries(1, N);
  // Whole powers by repeated squaring: exact, and no orders lost when a₀ = 0.
  if (Number.isInteger(r) && Math.abs(r) <= 64) {
    let result = constSeries(1, N);
    let base = a;
    for (let e = Math.abs(r); e > 0; e >>= 1) {
      if (e & 1) result = mul(result, base);
      if (e > 1) base = mul(base, base);
    }
    return r > 0 ? result : div(constSeries(1, N), result);
  }
  const m = leadingIndex(a);
  if (m > N) return r > 0 ? zeros(N) : zeros(N).fill(NaN); // a ≡ 0 up to order N
  if (m > 0) {
    // r is not a whole number here. Near x₀, a = aₘ·tᵐ·q with t = x − x₀ and
    // q₀ = 1, so aʳ = aₘʳ·|t|^{s}·qʳ with s = mr, defined on both sides only if
    // m is even and aₘ > 0. |t|^s is smooth if s is an even whole number; else
    // its derivatives exist (and are 0) up to order s − 1 for whole s, ⌊s⌋ otherwise.
    const out = zeros(N);
    if (m % 2 === 1 || a[m] < 0) return out.fill(NaN, 1);
    const s = m * r;
    if (s < 0) return out.fill(NaN);
    if (s % 2 === 0) {
      const q = [...a.slice(m), ...new Array(m).fill(NaN)].map((v) => v / a[m]);
      const qr = scale(pow(q, r), a[m] ** r);
      for (let k = s; k <= N; k++) out[k] = qr[k - s];
      return out;
    }
    return out.fill(NaN, Number.isInteger(s) ? s : Math.floor(s) + 1);
  }
  if (a[0] < 0 && !Number.isInteger(r)) return zeros(N).fill(NaN);
  const p = zeros(N);
  p[0] = a[0] ** r;
  for (let k = 1; k <= N; k++) {
    let s = 0;
    for (let j = 1; j <= k; j++) s += ((r + 1) * j - k) * a[j] * p[k - j];
    p[k] = s / (k * a[0]);
  }
  return p;
}

/** F(a) from F(a₀) and the series h = F′(a): (F∘a)′ = h·a′, integrated term by term. */
function integrateComposite(a, F0, h) {
  const N = a.length - 1;
  const g = zeros(N);
  g[0] = F0;
  for (let k = 1; k <= N; k++) {
    let s = 0;
    for (let j = 1; j <= k; j++) s += j * a[j] * h[k - j];
    g[k] = s / k;
  }
  return g;
}

/** The sign of a near x₀ (from its first nonzero coefficient), or 0 if a ≡ 0. */
const signNear = (a) => {
  const m = leadingIndex(a);
  return m < a.length ? Math.sign(a[m]) : 0;
};

const square = (a) => mul(a, a);
const one = (N) => constSeries(1, N);

const FUNCTIONS = {
  exp: ([a]) => exp(a),
  expm1: ([a]) => sub(exp(a), one(a.length - 1)),
  log: ([a, base]) => (base ? div(log(a), log(base)) : log(a)),
  log1p: ([a]) => log(add(a, one(a.length - 1))),
  log10: ([a]) => scale(log(a), 1 / Math.LN10),
  log2: ([a]) => scale(log(a), 1 / Math.LN2),
  sqrt: ([a]) => pow(a, 0.5),
  cbrt: ([a]) => {
    const s = signNear(a);
    return s === 0 ? a.map(() => 0) : scale(pow(scale(a, s), 1 / 3), s);
  },
  square: ([a]) => square(a),
  cube: ([a]) => mul(a, square(a)),
  pow: ([a, b]) => power(a, b),
  abs: ([a]) => {
    // |a| = ±a near x₀ unless a changes sign there (a leading zero of odd order).
    const m = leadingIndex(a);
    if (m >= a.length) return a.map(() => 0);
    if (m % 2 === 1) return a.map((v, k) => (k < m ? 0 : NaN));
    return scale(a, Math.sign(a[m]));
  },
  sin: ([a]) => sinCos(a, -1)[0],
  cos: ([a]) => sinCos(a, -1)[1],
  tan: ([a]) => div(...sinCos(a, -1)),
  cot: ([a]) => div(...sinCos(a, -1).reverse()),
  sec: ([a]) => div(one(a.length - 1), sinCos(a, -1)[1]),
  csc: ([a]) => div(one(a.length - 1), sinCos(a, -1)[0]),
  sinh: ([a]) => sinCos(a, 1)[0],
  cosh: ([a]) => sinCos(a, 1)[1],
  tanh: ([a]) => div(...sinCos(a, 1)),
  atan: ([a]) => integrateComposite(a, Math.atan(a[0]), div(one(a.length - 1), add(one(a.length - 1), square(a)))),
  asin: ([a]) => integrateComposite(a, Math.asin(a[0]), pow(sub(one(a.length - 1), square(a)), -0.5)),
  acos: ([a]) => integrateComposite(a, Math.acos(a[0]), scale(pow(sub(one(a.length - 1), square(a)), -0.5), -1)),
  asinh: ([a]) => integrateComposite(a, Math.asinh(a[0]), pow(add(one(a.length - 1), square(a)), -0.5)),
  acosh: ([a]) => integrateComposite(a, Math.acosh(a[0]), pow(sub(square(a), one(a.length - 1)), -0.5)),
  atanh: ([a]) => integrateComposite(a, Math.atanh(a[0]), div(one(a.length - 1), sub(one(a.length - 1), square(a)))),
};

/** aᵇ: a constant exponent uses pow(), otherwise exp(b·log a). */
function power(a, b) {
  if (b.slice(1).every((v) => v === 0)) return pow(a, b[0]);
  return exp(mul(b, log(a)));
}

const OPERATORS = {
  add: ([a, b]) => add(a, b),
  subtract: ([a, b]) => sub(a, b),
  multiply: ([a, b]) => mul(a, b),
  divide: ([a, b]) => div(a, b),
  pow: ([a, b]) => power(a, b),
  unaryMinus: ([a]) => scale(a, -1),
  unaryPlus: ([a]) => a,
};

/**
 * Taylor coefficients a₀ … a_N of the expression (a math.js node in `variable`)
 * at x₀: f(x) ≈ Σ aₖ (x − x₀)ᵏ with aₖ = f⁽ᵏ⁾(x₀)/k!. NaN marks orders where the
 * derivative does not exist. Throws for constructs without a rule (for example
 * "a ? b : c" or floor), naming them.
 */
export function taylorCoefficients(node, x0, N, variable = 'x') {
  const hasVariable = new Map();
  const dependsOnX = (n) => {
    if (!hasVariable.has(n)) {
      hasVariable.set(n, n.filter((c) => c.isSymbolNode && c.name === variable).length > 0);
    }
    return hasVariable.get(n);
  };

  const evaluate = (n) => {
    if (!dependsOnX(n)) {
      // A constant subtree: math.js evaluates it once.
      let value;
      try {
        value = n.evaluate();
      } catch {
        value = NaN;
      }
      return constSeries(typeof value === 'number' ? value : NaN, N);
    }
    if (n.isSymbolNode) {
      const s = constSeries(x0, N);
      if (N >= 1) s[1] = 1;
      return s;
    }
    if (n.isParenthesisNode) return evaluate(n.content);
    if (n.isOperatorNode && OPERATORS[n.fn]) return OPERATORS[n.fn](n.args.map(evaluate));
    // Arity was checked when the expression was compiled.
    if (n.isFunctionNode && FUNCTIONS[n.fn.name]) return FUNCTIONS[n.fn.name](n.args.map(evaluate));
    const what = n.isFunctionNode ? `${n.fn.name}(…)` : n.isOperatorNode ? `the operator ${n.op}` : n.isConditionalNode ? '“a ? b : c”' : n.type;
    throw new Error(`Taylor coefficients can't be computed for ${what}.`);
  };

  return evaluate(node).map((v) => (Number.isFinite(v) ? v : NaN));
}

/** Number of orders k = 0, 1, … with a finite coefficient before the first NaN. */
export function smoothOrders(coeffs) {
  const k = coeffs.findIndex((v) => Number.isNaN(v));
  return k === -1 ? coeffs.length : k;
}

/** Tₙ(x) = Σ_{k≤n} aₖ (x − x₀)ᵏ by Horner's rule; NaN if a coefficient up to n is missing. */
export function taylorValue(coeffs, x0, n, x) {
  const t = x - x0;
  let v = 0;
  for (let k = n; k >= 0; k--) v = v * t + coeffs[k];
  return v;
}

/**
 * Whether aₖ is zero for display purposes: its term aₖtᵏ at the distance `w` from
 * x₀ is below 1e−12 of the largest term up to that order. Rounding leaves tiny
 * nonzero coefficients where the exact value is 0.
 */
export function isNegligible(coeffs, k, w) {
  let largest = 0;
  for (let j = 0; j <= k; j++) {
    const size = Math.abs(coeffs[j] * w ** j);
    if (size > largest) largest = size;
  }
  return Math.abs(coeffs[k] * w ** k) <= 1e-12 * largest;
}

/**
 * The interval around x₀ where |f − Tₙ| < ε, read off samples xs (increasing)
 * with values fs and ts of f and Tₙ: grown outward from the sample nearest x₀
 * while the error stays below ε. A single sample where f is undefined between
 * two where it is defined (a removable hole, sin(x)/x at 0) doesn't stop it.
 * Returns { lo, hi, loEdge, hiEdge } or null if it fails at x₀.
 */
export function fitInterval(xs, fs, ts, x0, eps) {
  const hole = (i) => i > 0 && i < xs.length - 1 && Number.isFinite(fs[i - 1]) && Number.isFinite(fs[i + 1]);
  const ok = (i) => (Number.isFinite(fs[i]) ? Math.abs(fs[i] - ts[i]) < eps : hole(i));
  let i0 = 0;
  for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - x0) < Math.abs(xs[i0] - x0)) i0 = i;
  if (!ok(i0)) return null;
  let lo = i0;
  let hi = i0;
  while (lo > 0 && ok(lo - 1)) lo--;
  while (hi < xs.length - 1 && ok(hi + 1)) hi++;
  return { lo: xs[lo], hi: xs[hi], loEdge: lo === 0, hiEdge: hi === xs.length - 1 };
}
