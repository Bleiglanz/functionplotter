// Pure math for the complex-functions page: a math.js parse tree compiled to
// a function of complex z (as re, im pairs), the domain coloring of a value,
// and zeros, poles and winding numbers. No DOM.
//
// math.js can evaluate complex numbers itself, but through its typed dispatch
// that costs microseconds per operation; a picture needs hundreds of
// thousands of evaluations per redraw. Compiling the tree into nested closures
// on plain [re, im] arrays is about 20× faster.

/** @typedef {[number, number]} C */

const add = ([a, b], [c, d]) => [a + c, b + d];
const sub = ([a, b], [c, d]) => [a - c, b - d];
const mul = ([a, b], [c, d]) => [a * c - b * d, a * d + b * c];
function div([a, b], [c, d]) {
  const den = c * c + d * d;
  return [(a * c + b * d) / den, (b * c - a * d) / den];
}
const exp = ([a, b]) => {
  const r = Math.exp(a);
  return [r * Math.cos(b), r * Math.sin(b)];
};
// The principal logarithm: the cut runs along the negative real axis.
const log = ([a, b]) => [Math.log(Math.hypot(a, b)), Math.atan2(b, a)];
function sqrt([a, b]) {
  const r = Math.hypot(a, b);
  const re = Math.sqrt((r + a) / 2);
  const im = Math.sqrt((r - a) / 2);
  return [re, b < 0 ? -im : im];
}
const sin = ([a, b]) => [Math.sin(a) * Math.cosh(b), Math.cos(a) * Math.sinh(b)];
const cos = ([a, b]) => [Math.cos(a) * Math.cosh(b), -Math.sin(a) * Math.sinh(b)];
const sinh = ([a, b]) => [Math.sinh(a) * Math.cos(b), Math.cosh(a) * Math.sin(b)];
const cosh = ([a, b]) => [Math.cosh(a) * Math.cos(b), Math.sinh(a) * Math.sin(b)];
const ONE = [1, 0];

/** zⁿ for an integer n by repeated squaring (exact at 0, no log needed). */
function powInt(z, n) {
  if (n < 0) return div(ONE, powInt(z, -n));
  let result = ONE;
  let base = z;
  for (let k = n; k > 0; k >>= 1) {
    if (k & 1) result = mul(result, base);
    base = mul(base, base);
  }
  return result;
}

/** z^w = exp(w log z) on the principal branch; 0^w = 0 for Re w > 0. */
function pow(z, w) {
  if (w[1] === 0 && Number.isInteger(w[0]) && Math.abs(w[0]) <= 64) return powInt(z, w[0]);
  if (z[0] === 0 && z[1] === 0) return w[0] > 0 ? [0, 0] : [NaN, NaN];
  return exp(mul(w, log(z)));
}

const FUNCTIONS = {
  exp,
  log,
  sqrt,
  sin,
  cos,
  tan: (z) => div(sin(z), cos(z)),
  cot: (z) => div(cos(z), sin(z)),
  sec: (z) => div(ONE, cos(z)),
  csc: (z) => div(ONE, sin(z)),
  sinh,
  cosh,
  tanh: (z) => div(sinh(z), cosh(z)),
  square: (z) => mul(z, z),
  cube: (z) => mul(mul(z, z), z),
  abs: ([a, b]) => [Math.hypot(a, b), 0],
  conj: ([a, b]) => [a, -b],
  re: ([a]) => [a, 0],
  im: ([, b]) => [b, 0],
  arg: ([a, b]) => [Math.atan2(b, a), 0],
  pow: (z, w) => pow(z, w),
};

const OPERATORS = {
  add: (p, q) => add(p, q),
  subtract: (p, q) => sub(p, q),
  multiply: (p, q) => mul(p, q),
  divide: (p, q) => div(p, q),
  pow: (p, q) => pow(p, q),
  unaryMinus: ([a, b]) => [-a, -b],
  unaryPlus: (p) => p,
};

const CONSTANTS = { i: [0, 1], pi: [Math.PI, 0], e: [Math.E, 0], tau: [2 * Math.PI, 0], phi: [(1 + Math.sqrt(5)) / 2, 0] };

/**
 * Compiles a math.js parse tree into a function (re, im) → [re, im] of the
 * variable z. Throws an Error naming the first symbol, function or construct
 * it has no rule for.
 */
export function compileComplex(node) {
  const build = (n) => {
    if (n.isParenthesisNode) return build(n.content);
    if (n.isConstantNode) {
      const v = [Number(n.value), 0];
      if (!Number.isFinite(v[0])) throw new Error(`Not a number: ${n.value}.`);
      return () => v;
    }
    if (n.isSymbolNode) {
      if (n.name === 'z') return (z) => z;
      if (n.name in CONSTANTS) {
        const v = CONSTANTS[n.name];
        return () => v;
      }
      throw new Error(`Unknown variable: ${n.name}. Use z, i and constants like pi.`);
    }
    if (n.isOperatorNode) {
      const op = OPERATORS[n.fn];
      if (!op) throw new Error(`The operator ${n.op} has no meaning for complex numbers here.`);
      const args = n.args.map(build);
      return args.length === 1 ? (z) => op(args[0](z)) : (z) => op(args[0](z), args[1](z));
    }
    if (n.isFunctionNode) {
      const name = n.fn.name;
      const fn = FUNCTIONS[name];
      if (!fn) throw new Error(`The function ${name} is not available for complex z.`);
      const args = n.args.map(build);
      if (args.length !== fn.length) throw new Error(`${name} takes ${fn.length} argument${fn.length === 1 ? '' : 's'}.`);
      return args.length === 1 ? (z) => fn(args[0](z)) : (z) => fn(args[0](z), args[1](z));
    }
    throw new Error(`“${n.toString()}” has no meaning for complex z here.`);
  };
  const f = build(node);
  return (re, im) => f([re, im]);
}

/**
 * The domain-coloring color of w = re + i·im as [r, g, b] (0–255): the hue is
 * arg w (red for positive reals, then yellow, green at i, cyan, blue,
 * magenta), the lightness runs from black at 0 to white at ∞ through
 * l = (2/π)·atan|w|, with a band at each doubling of |w| so that the level
 * curves of |w| show. Non-finite values are gray.
 */
export function domainColor(re, im, out = [0, 0, 0]) {
  const r = Math.hypot(re, im);
  if (!Number.isFinite(r)) {
    if (r === Infinity) out[0] = out[1] = out[2] = 255;
    else out[0] = out[1] = out[2] = 128;
    return out;
  }
  const hue = (Math.atan2(im, re) / (2 * Math.PI) + 1) % 1; // 0 … 1
  const base = (2 / Math.PI) * Math.atan(r);
  let light = base;
  if (r > 0) {
    // A sawtooth step at each doubling of |w|, fading out towards 0 and ∞.
    const band = Math.log2(r) - Math.floor(Math.log2(r)); // 0 … 1 within each doubling
    light += 0.5 * (band - 0.5) * base * (1 - base);
  }
  return hsl(hue, 0.9, light, out);
}

/** HSL (all 0 … 1) to RGB 0–255. */
function hsl(h, s, l, out) {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t) => {
    t = (t + 1) % 1;
    const v = t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
    return Math.round(255 * v);
  };
  out[0] = channel(h + 1 / 3);
  out[1] = channel(h);
  out[2] = channel(h - 1 / 3);
  return out;
}

/**
 * The winding number of f around 0 along the circle |z − c| = r: the number
 * of turns arg f makes, counted from `samples` points. At a zero of order n
 * inside it is n, at a pole of order n it is −n (if nothing else is inside).
 * Returns NaN where f is not finite on the circle.
 */
export function windingNumber(f, [cx, cy], r, samples = 256) {
  let total = 0;
  let prev = null;
  for (let k = 0; k <= samples; k++) {
    const t = (2 * Math.PI * k) / samples;
    const [u, v] = f(cx + r * Math.cos(t), cy + r * Math.sin(t));
    if (!Number.isFinite(u) || !Number.isFinite(v)) return NaN;
    const a = Math.atan2(v, u);
    if (prev !== null) {
      let d = a - prev;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      total += d;
    }
    prev = a;
  }
  return Math.round(total / (2 * Math.PI));
}

/**
 * Zeros of f in the box, found from local minima of |f| on an n × m grid and
 * refined with Newton's method (derivative by a complex difference
 * quotient). Each is { z: [re, im], order } with the order from the winding
 * number; a pole of f is found as a zero of 1/f. Points closer than a grid
 * cell are merged.
 */
export function findZeros(f, { xMin, xMax, yMin, yMax }, n = 64, m = 48) {
  const hx = (xMax - xMin) / n;
  const hy = (yMax - yMin) / m;
  const size = (x, y) => {
    const [u, v] = f(x, y);
    return Math.hypot(u, v);
  };
  const grid = [];
  for (let j = 0; j <= m; j++) {
    grid.push([]);
    for (let i = 0; i <= n; i++) grid[j].push(size(xMin + i * hx, yMin + j * hy));
  }
  const found = [];
  for (let j = 1; j < m; j++) {
    for (let i = 1; i < n; i++) {
      const v = grid[j][i];
      if (!Number.isFinite(v)) continue;
      let isMin = true;
      for (let dj = -1; dj <= 1 && isMin; dj++) {
        for (let di = -1; di <= 1; di++) {
          if ((di || dj) && !(grid[j + dj][i + di] >= v)) {
            isMin = false;
            break;
          }
        }
      }
      if (!isMin) continue;
      const z = newton(f, [xMin + i * hx, yMin + j * hy], Math.hypot(hx, hy));
      if (!z) continue;
      if (z[0] < xMin || z[0] > xMax || z[1] < yMin || z[1] > yMax) continue;
      if (found.some((p) => Math.hypot(p.z[0] - z[0], p.z[1] - z[1]) < Math.max(hx, hy))) continue;
      const order = windingNumber(f, z, 0.3 * Math.min(hx, hy));
      if (order > 0) found.push({ z: z.map((c) => (Math.abs(c) < 1e-9 * Math.max(hx, hy) ? 0 : c)), order });
    }
  }
  return found;
}

/** Newton's method for f(z) = 0 from z0; null unless it converges within `reach` of z0. */
function newton(f, z0, reach) {
  let z = z0;
  for (let k = 0; k < 60; k++) {
    const w = f(...z);
    if (!Number.isFinite(w[0]) || !Number.isFinite(w[1])) return null;
    if (Math.hypot(...w) === 0) return z;
    const h = 1e-7 * Math.max(1, Math.hypot(...z));
    const w2 = f(z[0] + h, z[1]);
    const d = [(w2[0] - w[0]) / h, (w2[1] - w[1]) / h]; // f′(z) along the real direction
    const step = div(w, d);
    if (!Number.isFinite(step[0]) || !Number.isFinite(step[1])) return null;
    z = [z[0] - step[0], z[1] - step[1]];
    if (Math.hypot(z[0] - z0[0], z[1] - z0[1]) > reach) return null;
    if (Math.hypot(...step) < 1e-13 * Math.max(1, Math.hypot(...z))) break;
  }
  // Accept only a true zero: |f| tiny compared with the values a step away.
  const size = Math.hypot(...f(...z));
  const near = Math.hypot(...f(z[0] + reach / 4, z[1]));
  return size <= 1e-8 * Math.max(near, 1e-300) || size < 1e-12 ? z : null;
}

/**
 * Poles of f in the box, as zeros of 1/f (see findZeros). Where f itself is
 * not finite (1/0 gives NaN here), 1/f is taken as 0.
 */
export function findPoles(f, box, n, m) {
  return findZeros(
    (x, y) => {
      const w = f(x, y);
      return Number.isFinite(w[0]) && Number.isFinite(w[1]) ? div(ONE, w) : [0, 0];
    },
    box,
    n,
    m,
  );
}
