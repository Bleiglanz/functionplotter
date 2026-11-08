// Pure math for differential equations: the classical Runge–Kutta step (also
// used for the surface plotter's geodesics), solution curves of y′ = f(x, y)
// and the curve where f = 0. No DOM.

/**
 * One classical Runge–Kutta (RK4) step of size h for s′ = deriv(s), where s
 * is an array of numbers. Returns the new array.
 */
export function rk4Step(deriv, s, h) {
  const plus = (a, k, c) => a.map((ai, i) => ai + c * k[i]);
  const k1 = deriv(s);
  const k2 = deriv(plus(s, k1, h / 2));
  const k3 = deriv(plus(s, k2, h / 2));
  const k4 = deriv(plus(s, k3, h));
  return s.map((si, j) => si + (h / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
}

/**
 * The solution of y′ = f(x, y) through (x0, y0), traced both ways until it
 * leaves the box (widened by 5 % per side), f stops being finite, or `maxSteps`
 * steps per direction. To follow steep stretches as well as flat ones, the
 * curve is parametrised by arclength measured in units of the box (x and y
 * scaled to its width and height), with that arclength step `step`. Returns
 * the points [x, y] ordered by increasing x, including (x0, y0).
 */
export function traceSolution(f, x0, y0, { xMin, xMax, yMin, yMax }, { step = 0.004, maxSteps = 4000 } = {}) {
  const W = xMax - xMin;
  const H = yMax - yMin;
  const inside = ([x, y]) => x >= xMin - 0.05 * W && x <= xMax + 0.05 * W && y >= yMin - 0.05 * H && y <= yMax + 0.05 * H;
  const trace = (dir) => {
    // In box units (X = x/W, Y = y/H) the direction (1, f) becomes (1/W, f/H); normalised to length 1.
    const deriv = ([x, y]) => {
      const slope = f(x, y);
      const dx = dir / W;
      const dy = (dir * slope) / H;
      const r = Math.hypot(dx, dy);
      // Unit speed in box units, converted back to x and y.
      return [(dx / r) * W, (dy / r) * H];
    };
    const points = [];
    let s = [x0, y0];
    // The angle between two directions, as the dot product of the unit vectors in box units.
    const agree = (p, q) => (p[0] * q[0]) / (W * W) + (p[1] * q[1]) / (H * H);
    for (let i = 0; i < maxSteps; i++) {
      // Stop at a vertical tangent: there the direction field flips (y′ jumps
      // from −∞ to +∞), so it differs by more than 60° one step ahead. Beyond
      // it the curve is no longer the graph of a function of x.
      const here = deriv(s);
      const ahead = deriv([s[0] + step * here[0], s[1] + step * here[1]]);
      if (!(agree(here, ahead) > 0.5)) break;
      const next = rk4Step(deriv, s, step);
      if (!next.every(Number.isFinite) || !inside(next)) break;
      points.push(next);
      s = next;
    }
    return points;
  };
  if (!Number.isFinite(f(x0, y0))) return [];
  const back = trace(-1).reverse();
  return [...back, [x0, y0], ...trace(1)];
}

/**
 * Line segments approximating f(x, y) = 0 inside the box, by marching squares
 * on an nx × ny grid of cells: [[x1, y1, x2, y2], …]. Cells where f is not
 * finite at a corner are skipped, and so are sign changes through a pole
 * rather than a zero (f at the interpolated crossing is not smaller than at
 * either end).
 */
export function zeroCurve(f, { xMin, xMax, yMin, yMax }, nx = 80, ny = 60) {
  const xs = Array.from({ length: nx + 1 }, (_, i) => xMin + ((xMax - xMin) * i) / nx);
  const ys = Array.from({ length: ny + 1 }, (_, j) => yMin + ((yMax - yMin) * j) / ny);
  const v = ys.map((y) => xs.map((x) => f(x, y)));
  const segments = [];
  // Where the zero crosses the edge from corner p (value a) to q (value b), or
  // null when the sign change is a pole: then f is not small in between.
  const cross = (p, q, a, b) => {
    const t = a / (a - b);
    const point = [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])];
    const mid = Math.abs(f(...point));
    return mid < Math.min(Math.abs(a), Math.abs(b)) ? point : null;
  };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const corners = [
        [[xs[i], ys[j]], v[j][i]],
        [[xs[i + 1], ys[j]], v[j][i + 1]],
        [[xs[i + 1], ys[j + 1]], v[j + 1][i + 1]],
        [[xs[i], ys[j + 1]], v[j + 1][i]],
      ];
      if (!corners.every(([, val]) => Number.isFinite(val))) continue;
      const hits = [];
      for (let k = 0; k < 4; k++) {
        const [p, a] = corners[k];
        const [q, b] = corners[(k + 1) % 4];
        if (a === 0 && b !== 0) hits.push(p);
        else if ((a < 0) !== (b < 0) && a !== 0 && b !== 0) {
          const point = cross(p, q, a, b);
          if (point) hits.push(point);
        }
      }
      // Two crossings: one segment; four (a saddle cell): pair them up in order.
      for (let k = 0; k + 1 < hits.length; k += 2) segments.push([...hits[k], ...hits[k + 1]]);
    }
  }
  return segments;
}

/** Start points from the hash text "x,y;x,y" (bad pairs are skipped). */
export function parseStarts(text) {
  return text
    .split(';')
    .map((pair) => pair.split(',').map((v) => (v.trim() === '' ? NaN : Number(v))))
    .filter((p) => p.length === 2 && p.every(Number.isFinite));
}

/** The hash text for a list of start points, each coordinate to 4 significant digits. */
export function formatStarts(points) {
  return points.map(([x, y]) => `${+x.toPrecision(4)},${+y.toPrecision(4)}`).join(';');
}
