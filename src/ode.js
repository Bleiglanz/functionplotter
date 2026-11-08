import { compileFunction, constant, expressionToTex } from './expression.js';
import { niceTicks } from './format.js';
import { renderStatic, setTex, texNum as T } from './tex.js';
import { svgEl, safe, frame, axes, arrow, polyline, setFacts, stateFromHash, writeHash } from './pageUtils.js';
import { traceSolution, zeroCurve, parseStarts, formatStarts } from './odeMath.js';

// Page for direction fields: short arrows of slope f(x, y) on a grid, and
// solution curves of y′ = f(x, y) through points the learner clicks. Hovering
// previews the solution through the pointer.

// starts: the clicked points as "x,y;x,y" (see parseStarts in odeMath.js).
const DEFAULTS = { expr: 'x - y', xMin: '-3', xMax: '3', yMin: '-3', yMax: '3', starts: '-3,2;-3,-2;-1,-3;0,0', nullcline: false };
const PRESETS = [
  { label: "y′ = x − y: all solutions approach y = x − 1", ...DEFAULTS },
  { label: "y′ = y: exponentials", expr: 'y', xMin: '-3', xMax: '3', yMin: '-3', yMax: '3', starts: '0,1;0,-0.5;0,0.2;0,0', nullcline: false },
  { label: "y′ = y(1 − y): logistic growth", expr: 'y*(1 - y)', xMin: '-1', xMax: '8', yMin: '-0.5', yMax: '1.6', starts: '0,0.05;0,0.5;0,1.5;0,-0.05', nullcline: true },
  { label: "y′ = −x/y: circles, with vertical tangents", expr: '-x / y', xMin: '-3', xMax: '3', yMin: '-3', yMax: '3', starts: '0,1;0,2;0,-1.5', nullcline: false },
  {
    label: "y′ = y²: solutions escape in finite time",
    expr: 'y^2', xMin: '-3', xMax: '3', yMin: '-3', yMax: '3', starts: '-2,0.5;0,1;-2,-1', nullcline: false,
    note: 'The solutions are \\(y = \\frac{1}{C - x}\\) (and \\(y = 0\\)): those starting above 0 reach infinity at the finite \\(x = C\\). A solution can end even though \\(f\\) is defined everywhere.',
  },
  { label: "y′ = x² − y", expr: 'x^2 - y', xMin: '-3', xMax: '3', yMin: '-2', yMax: '5', starts: '-3,4;-3,0;0,-1;0,3', nullcline: true },
  { label: "y′ = sin(xy)", expr: 'sin(x y)', xMin: '-4', xMax: '4', yMin: '-4', yMax: '4', starts: '-4,1;-4,2;-4,3;0,-2', nullcline: false },
  {
    label: "y′ = √|y|: two solutions through (0, 0)",
    expr: 'sqrt(abs(y))', xMin: '-2', xMax: '3', yMin: '-1', yMax: '3', starts: '0,0;0,0.25;-2,0.01', nullcline: false,
    note: 'Here \\(\\partial f/\\partial y\\) is infinite on \\(y = 0\\), and uniqueness fails: through \\((0, 0)\\) both \\(y = 0\\) and \\(y = x^2/4\\) (for \\(x \\ge 0\\)) are solutions. The page draws only one of them.',
  },
];
const GRID = 22; // arrows across the wider side
const MAX_STARTS = 20;
const MARGIN = { top: 12, right: 16, bottom: 26, left: 44 };

const $ = (id) => document.getElementById(id);
const fields = { expr: $('expr'), xMin: $('xMin'), xMax: $('xMax'), yMin: $('yMin'), yMax: $('yMax') };
const svg = document.querySelector('#chart > svg');

for (const [i, preset] of PRESETS.entries()) $('preset').add(new Option(preset.label, i));

let starts = []; // [[x, y], …], the clicked points

function readForm() {
  const state = {};
  for (const key of Object.keys(fields)) state[key] = fields[key].value;
  state.starts = formatStarts(starts);
  state.nullcline = $('nullcline').checked;
  return state;
}

function writeForm(state) {
  for (const key of Object.keys(fields)) fields[key].value = state[key];
  starts = parseStarts(state.starts).slice(0, MAX_STARTS);
  $('nullcline').checked = state.nullcline;
}

// --- Model: f, the view, the field and the curves -----------------------------------------

let model = null;

function getModel({ expr, xMin, xMax, yMin, yMax }) {
  const key = JSON.stringify([expr, xMin, xMax, yMin, yMax]);
  if (model?.key === key) return model;
  try {
    const compiled = compileFunction(expr, ['x', 'y']);
    const f = (x, y) => safe((p) => compiled(p[0], p[1]), [x, y]);
    const box = {
      xMin: constant(xMin, 'View'),
      xMax: constant(xMax, 'View'),
      yMin: constant(yMin, 'View'),
      yMax: constant(yMax, 'View'),
    };
    if (!Object.values(box).every(Number.isFinite)) throw new Error('The view must be finite numbers.');
    if (!(box.xMin < box.xMax) || !(box.yMin < box.yMax)) throw new Error('The view needs each lower end below its upper end.');
    model = { key, expr, f, box, curves: new Map(), zeros: null, autonomous: isAutonomous(f, box), fTex: expressionToTex(expr) };
  } catch (err) {
    model = { key, error: err.message };
  }
  return model;
}

/** The solution through a start point (cached per model). */
function curveFor(m, [x, y]) {
  const key = `${x},${y}`;
  if (!m.curves.has(key)) m.curves.set(key, traceSolution(m.f, x, y, m.box));
  return m.curves.get(key);
}

/** True when f does not depend on x, judged at a few sample points. */
function isAutonomous(f, { xMin, xMax, yMin, yMax }) {
  for (let j = 0; j <= 6; j++) {
    const y = yMin + ((yMax - yMin) * j) / 6;
    const ref = f(xMin + 0.137 * (xMax - xMin), y);
    for (const t of [0.29, 0.53, 0.91]) {
      const v = f(xMin + t * (xMax - xMin), y);
      if (!(Number.isNaN(v) && Number.isNaN(ref)) && !(Math.abs(v - ref) <= 1e-12 * Math.max(1, Math.abs(ref)))) return false;
    }
  }
  return true;
}

/** For an autonomous f: the y in the view where f(y) = 0 (constant solutions), from sign changes. */
function equilibria(m) {
  const { yMin, yMax, xMin } = m.box;
  const out = [];
  const n = 400;
  let prev = m.f(xMin, yMin);
  for (let j = 1; j <= n; j++) {
    const y = yMin + ((yMax - yMin) * j) / n;
    const v = m.f(xMin, y);
    if (v === 0) out.push(y);
    else if (Number.isFinite(prev) && Number.isFinite(v) && prev !== 0 && (prev < 0) !== (v < 0)) {
      // Refine by bisection; a pole would leave |f| large, so check the result.
      let lo = y - (yMax - yMin) / n;
      let hi = y;
      for (let k = 0; k < 50; k++) {
        const mid = (lo + hi) / 2;
        if ((m.f(xMin, mid) < 0) === (prev < 0)) lo = mid;
        else hi = mid;
      }
      const root = (lo + hi) / 2;
      // Bisection leaves rounding noise such as 1e-18 where the root is 0.
      const tidy = Math.abs(root) < 1e-9 * (yMax - yMin) ? 0 : +root.toPrecision(10);
      if (Math.abs(m.f(xMin, root)) < 1e-6 * Math.max(1, Math.abs(prev), Math.abs(v))) out.push(tidy);
    }
    prev = v;
  }
  return out;
}

// --- Chart -------------------------------------------------------------------------------

let view = null;
let preview = null; // the solution through the hover point
let walker = null; // index into the latest curve, moved by ←/→

function draw(m, state) {
  const box = frame(svg, MARGIN);
  view = null;
  if (!box) return;
  const { xMin, xMax, yMin, yMax } = m.box;
  const sx = (x) => MARGIN.left + ((x - xMin) / (xMax - xMin)) * box.plotW;
  const sy = (y) => MARGIN.top + (1 - (y - yMin) / (yMax - yMin)) * box.plotH;
  const clampY = (py) => Math.max(-box.height, Math.min(2 * box.height, py));
  const ticks = niceTicks(xMin, xMax, 8).ticks.filter((t) => t >= xMin && t <= xMax);
  axes(svg, box, ticks.map((t) => [t, sx(t)]), yMin, yMax, sy);
  const plot = svgEl('g', { 'clip-path': box.clipUrl }, svg);

  // Arrows of equal screen length, with the slope f(x, y) measured in math units.
  const cell = Math.max(box.plotW, box.plotH) / GRID;
  const nx = Math.max(2, Math.round(box.plotW / cell));
  const ny = Math.max(2, Math.round(box.plotH / cell));
  const len = 0.7 * Math.min(box.plotW / nx, box.plotH / ny);
  const field = svgEl('g', { class: 'field-arrows' }, plot);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const x = xMin + ((i + 0.5) * (xMax - xMin)) / nx;
      const y = yMin + ((j + 0.5) * (yMax - yMin)) / ny;
      const slope = m.f(x, y);
      if (!Number.isFinite(slope)) continue;
      // Direction (1, slope) in math units, turned into screen pixels.
      const dx = box.plotW / (xMax - xMin);
      const dy = (-slope * box.plotH) / (yMax - yMin);
      const r = Math.hypot(dx, dy);
      const [cx, cy] = [sx(x), sy(y)];
      const [ux, uy] = [((dx / r) * len) / 2, ((dy / r) * len) / 2];
      arrow(field, cx - ux, cy - uy, cx + ux, cy + uy, { head: 5 });
    }
  }

  if (state.nullcline) {
    m.zeros ??= zeroCurve(m.f, m.box);
    const zeroG = svgEl('g', {}, plot);
    for (const [x1, y1, x2, y2] of m.zeros) svgEl('line', { x1: sx(x1), y1: sy(y1), x2: sx(x2), y2: sy(y2), class: 'zero-curve' }, zeroG);
  }

  const toPath = (pts) => polyline(pts.map(([x, y]) => [sx(x), sy(y)]), clampY);
  if (preview?.length) svgEl('path', { d: toPath(preview), class: 'preview' }, plot);
  starts.forEach((p, i) => {
    const pts = curveFor(m, p);
    svgEl('path', { d: toPath(pts), class: i === starts.length - 1 ? 'solution latest' : 'solution' }, plot);
    svgEl('circle', { cx: sx(p[0]), cy: sy(p[1]), r: 4, class: 'start' }, plot);
  });

  // The walker on the latest curve, with its tangent.
  const latest = starts.length ? curveFor(m, starts.at(-1)) : null;
  if (latest?.length && walker !== null) {
    walker = Math.min(latest.length - 1, Math.max(0, walker));
    const [x, y] = latest[walker];
    const slope = m.f(x, y);
    if (Number.isFinite(slope)) {
      const h = (xMax - xMin) / 12;
      svgEl('line', { x1: sx(x - h), y1: sy(y - h * slope), x2: sx(x + h), y2: sy(y + h * slope), class: 'tangent-mark' }, plot);
    }
    svgEl('circle', { cx: sx(x), cy: sy(y), r: 5, class: 'walker' }, plot);
  }

  view = { box, sx, sy };
  svg.setAttribute('aria-label', `Direction field of y' = f(x, y) with ${starts.length} solution curve${starts.length === 1 ? '' : 's'}`);
}

// --- Pointer and keyboard -------------------------------------------------------------

function pointerMath(e) {
  const rect = svg.getBoundingClientRect();
  const { xMin, xMax, yMin, yMax } = model.box;
  const px = e.clientX - rect.left - MARGIN.left;
  const py = e.clientY - rect.top - MARGIN.top;
  return [xMin + (px / view.box.plotW) * (xMax - xMin), yMax - (py / view.box.plotH) * (yMax - yMin)];
}

let pending = null; // the latest hover point, previewed once per animation frame
svg.addEventListener('pointermove', (e) => {
  if (!view || model?.error) return;
  const [x, y] = pointerMath(e);
  setTex($('hover'), `x = ${T(x, 3)} \\quad y = ${T(y, 3)} \\quad y' = f(x, y) = ${T(model.f(x, y), 3)}`);
  if (pending === null) {
    requestAnimationFrame(() => {
      if (pending && view && !model?.error) {
        preview = traceSolution(model.f, ...pending, model.box);
        draw(model, readForm());
      }
      pending = null;
    });
  }
  pending = [x, y];
});
svg.addEventListener('pointerleave', () => {
  pending = null;
  preview = null;
  $('hover').innerHTML = '';
  if (view && !model?.error) draw(model, readForm());
});
svg.addEventListener('click', (e) => {
  if (!view || model?.error) return;
  const [x, y] = pointerMath(e);
  const p = [+x.toPrecision(4), +y.toPrecision(4)];
  starts = [...starts, p].slice(-MAX_STARTS);
  walker = null;
  $('preset').value = '';
  update();
});
svg.addEventListener('keydown', (e) => {
  if (!view || model?.error || !starts.length || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  e.preventDefault();
  const pts = curveFor(model, starts.at(-1));
  if (!pts.length) return;
  // Start at the clicked point, then walk along the curve.
  if (walker === null) walker = pts.findIndex(([x, y]) => x === starts.at(-1)[0] && y === starts.at(-1)[1]);
  walker += (e.shiftKey ? 50 : 10) * (e.key === 'ArrowLeft' ? -1 : 1);
  walker = Math.min(pts.length - 1, Math.max(0, walker));
  const [x, y] = pts[walker];
  setTex($('hover'), `x = ${T(x, 3)} \\quad y = ${T(y, 3)} \\quad y' = ${T(model.f(x, y), 3)}`);
  draw(model, readForm());
});

// --- Explanation ---------------------------------------------------------------------

/** Why the curve through p stops on each side: the view's edge, a vertical tangent, or f undefined. */
function ends(m, pts) {
  const { xMin, xMax, yMin, yMax } = m.box;
  const reason = ([x, y]) => {
    if (x <= xMin || x >= xMax) return null; // runs across the view
    if (y >= yMax || y <= yMin) return y >= yMax ? 'top' : 'bottom';
    return 'stops';
  };
  return [reason(pts[0]), reason(pts.at(-1))];
}

function facts(m, state) {
  const items = [];
  items.push([
    'The arrows',
    'Each arrow has slope \\(f(x, y)\\): a solution \\(y(x)\\) that passes through that point must have exactly this slope there. ' +
      'A solution curve follows the arrows everywhere; click anywhere to start one (it is traced to the left and to the right with the Runge–Kutta method).',
  ]);
  if (starts.length) {
    const p = starts.at(-1);
    const pts = curveFor(m, p);
    if (!pts.length) {
      items.push(['The last curve', `\\(f\\) is not defined at \\((${T(p[0], 3)}, ${T(p[1], 3)})\\), so no solution starts there.`]);
    } else {
      const [left, right] = ends(m, pts);
      const side = (r, where) =>
        r === null
          ? ''
          : r === 'stops'
            ? ` To the ${where} it ends at \\(x = ${T(where === 'left' ? pts[0][0] : pts.at(-1)[0], 3)}\\), where its tangent turns vertical or \\(f\\) stops being defined: beyond, it is no longer a function of \\(x\\).`
            : ` To the ${where} it leaves the view at the ${r}.`;
      items.push([
        `Through \\((${T(p[0], 3)}, ${T(p[1], 3)})\\)`,
        `The solution with \\(y(${T(p[0], 3)}) = ${T(p[1], 3)}\\) runs from \\(x = ${T(Math.max(m.box.xMin, pts[0][0]), 3)}\\) to \\(x = ${T(Math.min(m.box.xMax, pts.at(-1)[0]), 3)}\\) in the view.` + side(left, 'left') + side(right, 'right') +
          ' Use ←/→ on the chart to walk along it with its tangent.',
      ]);
    }
  }
  items.push([
    'No crossings',
    'Where \\(f\\) and \\(\\partial f / \\partial y\\) are continuous, exactly one solution passes through each point (the Picard–Lindelöf theorem), so solution curves never cross or touch.',
  ]);
  const note = PRESETS.find((p) => p.note && p.expr === m.expr)?.note;
  if (note) items.push(['This example', note]);
  if (m.autonomous) {
    const eq = equilibria(m);
    items.push([
      'Same arrows in every column',
      '\\(f\\) does not depend on \\(x\\): shifting a solution sideways gives another solution.' +
        (eq.length
          ? ` Where \\(f = 0\\) the horizontal line is a constant solution (an equilibrium): \\(${eq.map((y) => `y = ${T(y, 4)}`).join(',\\ ')}\\). Nearby solutions move towards an equilibrium where the arrows point to it from both sides, and away from it otherwise.`
          : ''),
    ]);
  }
  if (state.nullcline) {
    items.push(['Where \\(y\' = 0\\)', 'On the dashed curve \\(f(x, y) = 0\\) the arrows are horizontal, so every solution crossing it has a horizontal tangent there: that is where solutions have their maxima and minima.']);
  }
  items.push(['Related', 'The slope of a curve as a limit of secant slopes: <a href="./derivative.html">secant to tangent</a>.']);
  setFacts(items);
}

// --- Update and wiring -----------------------------------------------------------------

function update() {
  const state = readForm();
  const m = getModel(state);
  $('undo').disabled = !starts.length;
  $('clear').disabled = !starts.length;
  if (m.error) {
    $('status').textContent = m.error;
    frame(svg, MARGIN);
    view = null;
    $('formula').innerHTML = '';
    setFacts([]);
    writeHash(state);
    return;
  }
  $('status').textContent = '';
  setTex($('formula'), `y' = ${m.fTex}`);
  draw(m, state);
  facts(m, state);
  writeHash(state);
}

$('undo').addEventListener('click', () => {
  starts = starts.slice(0, -1);
  walker = null;
  update();
});
$('clear').addEventListener('click', () => {
  starts = [];
  walker = null;
  update();
});

let debounce = null;
$('controls').addEventListener('input', (e) => {
  const t = e.target;
  if (Object.keys(fields).includes(t.id)) {
    $('preset').value = '';
    clearTimeout(debounce);
    debounce = setTimeout(update, 200);
  } else if (t.id === 'preset') {
    const preset = PRESETS[t.value];
    if (!preset) return;
    const { label, note, ...values } = preset;
    writeForm(values);
    walker = null;
    preview = null;
    update();
  } else {
    update();
  }
});
$('controls').addEventListener('submit', (e) => e.preventDefault());

new ResizeObserver(() => update()).observe(svg);

renderStatic();
writeForm(stateFromHash(DEFAULTS));
update();
