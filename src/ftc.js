import { compileFunction, constant, expressionToTex } from './expression.js';
import { renderStatic, setTex, texNum as T, texSigned, texText } from './tex.js';
import { niceTicks } from './format.js';
import { RULES, riemannSum, integrate, antiderivative, partition } from './integral.js';
import { svgEl, svgTex, num, safe, frame, axes, robustExtent, polyline, stateFromHash, writeHash } from './pageUtils.js';

// Page for the fundamental theorem of calculus: below, f with the signed area
// from a to b (and optionally Riemann rectangles); above, the area function
// F(x) = ∫ₐˣ f with the point (b, F(b)) and its tangent, whose slope is f(b).

const DEFAULTS = { expr: 'cos(x)', a: '0', xMin: '-1', xMax: '7', b: 2, n: 8, rule: 'midpoint', rects: false };
const PRESETS = [
  { label: 'cos x: F = sin x', expr: 'cos(x)', a: '0', xMin: '-1', xMax: '7' },
  { label: 'x² − 1: F = x³/3 − x + C', expr: 'x^2 - 1', a: '-2', xMin: '-2.5', xMax: '2.5' },
  { label: '1/x from 1: F = ln x', expr: '1/x', a: '1', xMin: '0.1', xMax: '6' },
  { label: 'e^(−x²): the error function', expr: 'e^(-x^2)', a: '0', xMin: '-3', xMax: '3' },
  { label: '|x|: a corner in f, smooth F', expr: 'abs(x)', a: '-2', xMin: '-2', xMax: '2' },
  { label: 'Step at x = 1: F gets a corner', expr: 'x < 1 ? 0.5 : 2', a: '0', xMin: '-1', xMax: '3' },
  { label: 'sin x / x: the sine integral', expr: 'x == 0 ? 1 : sin(x)/x', a: '0', xMin: '-15', xMax: '15' },
];
const N_MAX = 200;
const SAMPLES = 600;
const SWEEP_MS = 8000; // duration of the "sweep b" animation
const MARGIN = { top: 12, right: 16, bottom: 26, left: 52 };

const $ = (id) => document.getElementById(id);
const fields = {
  expr: $('expr'),
  a: $('a'),
  xMin: $('xMin'),
  xMax: $('xMax'),
  b: $('b'),
  n: $('n'),
  rects: $('rects'),
};
const bSlider = $('bSlider');
const nSlider = $('nSlider');
const antiSvg = document.querySelector('#antiChart > svg');
const fSvg = document.querySelector('#chart > svg');

// --- Form, presets and URL hash ---------------------------------------------

for (const [key, { label }] of Object.entries(RULES)) {
  const option = document.createElement('label');
  option.innerHTML = `<input type="radio" name="rule" value="${key}" /> ${label}`;
  $('rules').append(option);
}
for (const [i, preset] of PRESETS.entries()) $('preset').add(new Option(preset.label, i));

const clampN = (n) => Math.min(N_MAX, Math.max(1, Math.round(n) || 1));

function readForm() {
  return {
    expr: fields.expr.value,
    a: fields.a.value,
    xMin: fields.xMin.value,
    xMax: fields.xMax.value,
    b: parseFloat(fields.b.value),
    n: clampN(+fields.n.value),
    rule: document.querySelector('input[name=rule]:checked')?.value ?? DEFAULTS.rule,
    rects: fields.rects.checked,
  };
}

function writeForm(state) {
  for (const key of ['expr', 'a', 'xMin', 'xMax', 'b', 'n']) fields[key].value = state[key];
  fields.rects.checked = state.rects;
  nSlider.value = state.n;
  bSlider.value = state.b;
  document.querySelector(`input[name=rule][value=${state.rule}]`).checked = true;
}

function loadState() {
  const state = stateFromHash(DEFAULTS);
  state.n = clampN(state.n);
  if (!(state.rule in RULES)) state.rule = DEFAULTS.rule;
  return state;
}

// --- Model: everything that depends on f, a and the view, but not on b ---------

let model = null;

function getModel({ expr, a, xMin, xMax }) {
  const key = JSON.stringify([expr, a, xMin, xMax]);
  if (model?.key === key) return model;
  try {
    const f = compileFunction(expr, ['x']);
    const lo = constant(xMin, 'View');
    const hi = constant(xMax, 'View');
    const a0 = constant(a, 'a');
    if (![lo, hi, a0].every(Number.isFinite)) throw new Error('a and the view must be finite numbers.');
    if (!(lo < hi)) throw new Error('The view needs a left end below its right end.');
    if (a0 < lo || a0 > hi) throw new Error('Choose a inside the view.');
    const xs = partition(lo, hi, SAMPLES);
    const fs = xs.map((x) => safe(f, x));
    const Fs = antiderivative(f, a0, xs);
    model = {
      key,
      f,
      a: a0,
      xMin: lo,
      xMax: hi,
      xs,
      fs,
      Fs,
      fRange: robustExtent(fs, 0),
      FRange: robustExtent(Fs, 0),
    };
  } catch (err) {
    model = { key, error: err.message };
  }
  return model;
}

/** Everything about the current b. */
function atB(m, state) {
  const b = Math.min(m.xMax, Math.max(m.xMin, state.b));
  const { f, a } = m;
  const Fb = integrate(f, a, b);
  const fb = safe(f, b);
  // One-sided difference quotients of F at b, to spot corners where f jumps.
  const h = (m.xMax - m.xMin) * 1e-5;
  const left = (Fb - integrate(f, a, b - h)) / h;
  const right = (integrate(f, a, b + h) - Fb) / h;
  const corner = Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) > 1e-3 * Math.max(1, Math.abs(left), Math.abs(right));
  const sum = state.rects && b !== a ? riemannSum(f, a, b, state.n, state.rule) : null;
  return { b, Fb, fb, left, right, corner, sum };
}

// --- Charts -------------------------------------------------------------------

let charts = null; // shared x mapping, read by the pointer code

function xScale(m, box) {
  const sx = (x) => MARGIN.left + ((x - m.xMin) / (m.xMax - m.xMin)) * box.plotW;
  const ticks = niceTicks(m.xMin, m.xMax, 8).ticks.filter((t) => t >= m.xMin && t <= m.xMax);
  return { sx, ticks: ticks.map((t) => [t, sx(t)]), tickStep: ticks[1] - ticks[0] };
}

function yScale(box, [yMin, yMax]) {
  const sy = (y) => MARGIN.top + (1 - (y - yMin) / (yMax - yMin)) * box.plotH;
  const clampY = (px) => Math.max(-10 * box.height, Math.min(11 * box.height, px));
  return { sy, clampY };
}

function verticalAt(plot, box, x, cls) {
  svgEl('line', { x1: x, x2: x, y1: MARGIN.top, y2: MARGIN.top + box.plotH, class: cls }, plot);
}

function drawF(m, cur) {
  const box = frame(antiSvg, MARGIN);
  if (!box) return null;
  const { sx, ticks, tickStep } = xScale(m, box);
  const [yMin, yMax] = m.FRange;
  const { sy, clampY } = yScale(box, m.FRange);
  axes(antiSvg, box, ticks, yMin, yMax, sy);
  const plot = svgEl('g', { 'clip-path': box.clipUrl }, antiSvg);
  const { b, Fb, fb } = cur;

  verticalAt(plot, box, sx(m.a), 'limit');
  verticalAt(plot, box, sx(b), 'cursor');
  svgEl('path', { d: polyline(m.xs.map((x, i) => [sx(x), sy(m.Fs[i])]), clampY), class: 'anti' }, plot);

  if (cur.corner && Number.isFinite(Fb)) {
    // No tangent at a corner: show the two one-sided slopes instead.
    for (const [x, slope] of [[m.xMin, cur.left], [m.xMax, cur.right]]) {
      svgEl('line', { x1: sx(b), y1: sy(Fb), x2: sx(x), y2: clampY(sy(Fb + slope * (x - b))), class: 'tangent one-sided' }, plot);
    }
  } else if (Number.isFinite(Fb) && Number.isFinite(fb)) {
    // The tangent y = F(b) + f(b)(x − b) across the whole view.
    const y = (x) => Fb + fb * (x - b);
    svgEl('line', { x1: sx(m.xMin), y1: clampY(sy(y(m.xMin))), x2: sx(m.xMax), y2: clampY(sy(y(m.xMax))), class: 'tangent' }, plot);
    // Slope triangle: run h (one x tick), rise f(b)·h, on whichever side fits.
    const h = b + tickStep <= m.xMax ? tickStep : -tickStep;
    const corner = [sx(b + h), sy(Fb)];
    svgEl('path', {
      d: `M${sx(b)},${sy(Fb)}L${corner[0]},${corner[1]}L${sx(b + h)},${clampY(sy(Fb + fb * h))}`,
      class: 'triangle',
    }, plot);
    // Run below the horizontal leg when the tangent rises, above it when it falls.
    svgTex(plot, (sx(b) + corner[0]) / 2, corner[1] + (fb >= 0 ? 3 : -3), `h = ${T(Math.abs(h))}`, {
      anchor: 'middle',
      baseline: fb >= 0 ? 'top' : 'bottom',
      cls: 'triangle-label',
    });
    svgTex(plot, corner[0] + (h > 0 ? 6 : -6), (corner[1] + clampY(sy(Fb + fb * h))) / 2, `f(b)\\,h = ${T(fb * Math.abs(h), 3)}`, {
      anchor: h > 0 ? 'start' : 'end',
      baseline: 'middle',
      cls: 'triangle-label',
    });
  }
  if (cur.sum && Number.isFinite(cur.sum.sum)) {
    svgEl('circle', { cx: sx(b), cy: clampY(sy(cur.sum.sum)), r: 5, class: 'approx' }, plot);
  }
  svgEl('circle', { cx: sx(m.a), cy: sy(0), r: 3.5, class: 'origin' }, plot);
  if (Number.isFinite(Fb)) svgEl('circle', { cx: sx(b), cy: clampY(sy(Fb)), r: 5, class: 'dot' }, plot);

  antiSvg.setAttribute('aria-label', `Graph of F(x), the integral of f from a to x, with its tangent at x = ${num(b)}`);
  return { sx, box, plot, sy, clampY };
}

/**
 * Closed SVG path for the region between the axis and the curve, with each
 * y replaced by pick(y, 0) (Math.max: the part above the axis, Math.min: below).
 * Undefined values split it into separate pieces.
 */
function areaPath(pts, sx, sy, clampY, pick) {
  let d = '';
  let run = [];
  const flush = () => {
    if (run.length > 1) {
      d += `M${sx(run[0][0])},${sy(0)}`;
      for (const [x, y] of run) d += `L${sx(x).toFixed(1)},${clampY(sy(pick(y, 0))).toFixed(1)}`;
      d += `L${sx(run.at(-1)[0])},${sy(0)}Z`;
    }
    run = [];
  };
  for (const p of pts) {
    if (Number.isFinite(p[1])) run.push(p);
    else flush();
  }
  flush();
  return d;
}

function drawf(m, cur) {
  const box = frame(fSvg, MARGIN);
  if (!box) return null;
  const { sx, ticks } = xScale(m, box);
  const [yMin, yMax] = m.fRange;
  const { sy, clampY } = yScale(box, m.fRange);
  axes(fSvg, box, ticks, yMin, yMax, sy);
  const plot = svgEl('g', { 'clip-path': box.clipUrl }, fSvg);
  const { b } = cur;

  // Signed area between a and b, split by sign. Going right to left (b < a)
  // reverses the orientation, so which parts add and which subtract swaps too.
  if (b !== m.a) {
    const [lo, hi] = b > m.a ? [m.a, b] : [b, m.a];
    const pts = [[lo, safe(m.f, lo)], ...m.xs.map((x, i) => [x, m.fs[i]]).filter(([x]) => x > lo && x < hi), [hi, safe(m.f, hi)]];
    const orient = b > m.a ? 1 : -1;
    // A part above the axis adds when going right; below it subtracts.
    svgEl('path', { d: areaPath(pts, sx, sy, clampY, Math.max), class: `area ${orient > 0 ? 'adds' : 'subtracts'}` }, plot);
    svgEl('path', { d: areaPath(pts, sx, sy, clampY, Math.min), class: `area ${orient > 0 ? 'subtracts' : 'adds'}` }, plot);
  }

  if (cur.sum) {
    const rects = svgEl('g', { class: 'rects' }, plot);
    const { xs, tags } = cur.sum;
    tags.forEach(({ y }, i) => {
      if (!Number.isFinite(y)) return;
      const [x0, x1] = [sx(xs[i]), sx(xs[i + 1])].sort((p, q) => p - q);
      const top = clampY(sy(Math.max(y, 0)));
      const bottom = clampY(sy(Math.min(y, 0)));
      svgEl('rect', { x: x0, y: top, width: Math.max(x1 - x0, 0.5), height: Math.max(bottom - top, 0) }, rects);
    });
  }

  verticalAt(plot, box, sx(m.a), 'limit');
  verticalAt(plot, box, sx(b), 'cursor');
  svgEl('path', { d: polyline(m.xs.map((x, i) => [sx(x), sy(m.fs[i])]), clampY), class: 'curve' }, plot);
  svgTex(plot, sx(m.a) + 4, MARGIN.top + 2, 'a', { baseline: 'top', cls: 'limit-label' });
  svgTex(plot, sx(b) + 4, MARGIN.top + 2, 'b', { baseline: 'top', cls: 'cursor-label' });
  if (Number.isFinite(cur.fb)) svgEl('circle', { cx: sx(b), cy: clampY(sy(cur.fb)), r: 5, class: 'dot' }, plot);

  fSvg.setAttribute('aria-label', `Graph of f with the signed area from a = ${num(m.a)} to b = ${num(b)} shaded`);
  return { sx, box, plot, sy, clampY };
}

// --- Hover readouts and dragging b -----------------------------------------------

function xAt(svg, clientX) {
  const box = charts?.f.box;
  if (!box) return null;
  const px = clientX - svg.getBoundingClientRect().left;
  const x = model.xMin + ((px - MARGIN.left) / box.plotW) * (model.xMax - model.xMin);
  return Math.min(model.xMax, Math.max(model.xMin, x));
}

function showHover(x) {
  if (!charts || x == null) {
    $('hover').innerHTML = $('antiHover').innerHTML = '';
    return;
  }
  setTex($('hover'), `x = ${T(x)} \\quad f(x) = ${T(safe(model.f, x))}`);
  setTex($('antiHover'), `x = ${T(x)} \\quad F(x) = ${T(integrate(model.f, model.a, x))}`);
}

let dragging = null;
for (const svg of [antiSvg, fSvg]) {
  svg.addEventListener('pointerdown', (e) => {
    if (!charts) return;
    stopSweep();
    dragging = e.pointerId;
    svg.setPointerCapture(e.pointerId);
    setB(xAt(svg, e.clientX));
  });
  svg.addEventListener('pointermove', (e) => {
    if (!charts) return;
    const x = xAt(svg, e.clientX);
    if (dragging === e.pointerId) setB(x);
    showHover(x);
  });
  svg.addEventListener('pointerup', () => (dragging = null));
  svg.addEventListener('pointercancel', () => (dragging = null));
  svg.addEventListener('pointerleave', () => showHover(null));
  svg.addEventListener('keydown', (e) => {
    if (!charts || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    stopSweep();
    const step = ((model.xMax - model.xMin) / 200) * (e.shiftKey ? 10 : 1) * (e.key === 'ArrowLeft' ? -1 : 1);
    setB(readForm().b + step);
  });
}

// --- Explanation ----------------------------------------------------------------

function facts(m, cur, state) {
  const { a } = m;
  const { b, Fb, fb, left, right, sum } = cur;
  const off = sum ? (Math.abs(sum.sum - Fb) < 1e-9 * Math.max(1, Math.abs(Fb)) ? 0 : sum.sum - Fb) : 0;
  const items = [
    [
      `\\(F(x) = \\int_a^x f(t)\\,dt\\)`,
      `The upper chart plots, for every \\(x\\), the signed area under \\(f\\) from \\(a = ${T(a)}\\) to \\(x\\). ` +
        `So \\(F(a) = 0\\), and \\(F\\) rises where \\(f > 0\\) and falls where \\(f < 0\\).`,
    ],
  ];
  if (Number.isFinite(Fb)) {
    items.push([
      `\\(F(b) = ${T(Fb, 6)}\\)`,
      `The shaded area from \\(a\\) to \\(b = ${T(b)}\\): the blue parts add, the orange parts subtract` +
        (b < a ? ' (with \\(b < a\\) the integral runs right to left, so the parts above the axis subtract).' : '.') +
        (sum && Number.isFinite(sum.sum)
          ? ` The Riemann sum with \\(n = ${state.n}\\) ${RULES[state.rule].label.toLowerCase()} rectangles gives \\(S_{${state.n}} = ${T(sum.sum, 6)}\\) ` +
            `(the hollow circle above), off by \\(${T(off)}\\).`
          : ''),
    ]);
  } else {
    items.push([
      '\\(F(b)\\)',
      'The integral from \\(a\\) to \\(b\\) does not exist numerically: \\(f\\) is undefined or unbounded somewhere between them.',
    ]);
  }
  if (cur.corner) {
    items.push([
      'A corner in \\(F\\)',
      `\\(f\\) jumps at \\(b\\), so \\(F\\) has a corner there: its slope from the left is \\(${T(left, 3)}\\) and from the right \\(${T(right, 3)}\\) (the two dashed half-lines). ` +
        `The fundamental theorem needs \\(f\\) to be continuous at \\(b\\); here \\(F'(b)\\) does not exist.`,
    ]);
  } else if (Number.isFinite(fb) && Number.isFinite(Fb)) {
    const h = (m.xMax - m.xMin) * 1e-5;
    items.push(
      [
        `\\(F'(b) = f(b) = ${T(fb, 4)}\\)`,
        `The fundamental theorem of calculus: where \\(f\\) is continuous, \\(F\\) is differentiable with \\(F'(x) = f(x)\\). ` +
          `So the tangent to \\(F\\) at \\((b, F(b))\\) has slope \\(f(b)\\), the height of the dot in the lower chart: ` +
          `\\(y = ${T(Fb, 4)} ${texSigned(fb, 4)}\\,(x ${texSigned(-b, 4)})\\). ` +
          (Math.abs(fb) < 1e-9
            ? 'Here \\(f(b) = 0\\), so the tangent is horizontal: \\(F\\) is stationary at \\(b\\).'
            : `\\(F\\) is ${fb > 0 ? 'increasing' : 'decreasing'} at \\(b\\).`),
      ],
      [
        'Why',
        `Moving \\(b\\) to \\(b + h\\) adds a thin strip of width \\(h\\) whose height is about \\(f(b)\\), so \\(F(b + h) - F(b) \\approx f(b)\\,h\\). ` +
          `Dividing by \\(h\\) and letting \\(h \\to 0\\) gives \\(F'(b) = f(b)\\). Numerically, with \\(h = ${T(h)}\\): ` +
          `\\(\\frac{F(b + h) - F(b)}{h} = ${T(right, 6)}\\).`,
      ],
    );
  } else {
    items.push(["\\(F'(b)\\)", '\\(f\\) is undefined at \\(b\\), so there is no tangent to draw.']);
  }
  items.push([
    '\\(\\int_a^b f = G(b) - G(a)\\)',
    `The second half of the theorem: any antiderivative \\(G\\) (\\(G' = f\\)) differs from \\(F\\) by a constant, ` +
      `so the integral is \\(G(b) - G(a)\\). Changing \\(a\\) only shifts \\(F\\) up or down.`,
  ]);
  items.push([
    'Related',
    'How a tangent arises as the limit of secants is the subject of the <a href="./derivative.html">secant to tangent</a> page.',
  ]);
  const list = document.querySelector('#facts dl');
  list.replaceChildren();
  for (const [term, text] of items) {
    const dt = document.createElement('dt');
    dt.innerHTML = texText(term);
    const dd = document.createElement('dd');
    dd.innerHTML = texText(text);
    list.append(dt, dd);
  }
}

// --- Update and wiring -------------------------------------------------------------

function update() {
  const state = readForm();
  const m = getModel(state);
  $('status').textContent = m.error ?? '';
  for (const id of ['formula', 'antiFormula']) $(id).innerHTML = '';
  if (m.error) {
    charts = null;
    frame(antiSvg, MARGIN);
    frame(fSvg, MARGIN);
    document.querySelector('#facts dl').replaceChildren();
    writeHash(state);
    return;
  }
  // The slider follows the view; b itself is clamped into it.
  const step = (m.xMax - m.xMin) / 1000;
  Object.assign(bSlider, { min: m.xMin, max: m.xMax, step });
  const cur = atB(m, state);
  if (cur.b !== state.b || !Number.isFinite(state.b)) {
    state.b = +cur.b.toPrecision(6);
    fields.b.value = state.b;
  }
  bSlider.value = cur.b;
  fields.b.step = step;
  setTex($('antiFormula'), `F(x) = \\int_{${expressionToTex(state.a)}}^{x} f(t)\\,dt`);
  setTex($('formula'), `f(x) = ${expressionToTex(state.expr)}`);
  charts = { F: drawF(m, cur), f: drawf(m, cur) };
  facts(m, cur, state);
  writeHash(state);
}

function setB(b) {
  if (b == null || !Number.isFinite(b)) return;
  fields.b.value = +b.toPrecision(6);
  update();
}

let sweep = null;
function stopSweep() {
  if (sweep) cancelAnimationFrame(sweep);
  sweep = null;
  $('play').innerHTML = texText('▶ Sweep \\(b\\) across the view');
  $('play').setAttribute('aria-pressed', 'false');
}
$('play').addEventListener('click', () => {
  if (sweep || !charts) return stopSweep();
  const start = performance.now();
  $('play').textContent = '■ Stop';
  $('play').setAttribute('aria-pressed', 'true');
  const tick = (now) => {
    const t = Math.min(1, (now - start) / SWEEP_MS);
    setB(model.xMin + t * (model.xMax - model.xMin));
    if (t < 1) sweep = requestAnimationFrame(tick);
    else stopSweep();
  };
  sweep = requestAnimationFrame(tick);
});

let debounce = null;
$('controls').addEventListener('input', (e) => {
  const t = e.target;
  if (t === bSlider) {
    stopSweep();
    setB(+bSlider.value);
  } else if (t === nSlider || t === fields.n) {
    if (t === nSlider) fields.n.value = nSlider.value;
    else nSlider.value = clampN(+t.value);
    update();
  } else if (['expr', 'a', 'xMin', 'xMax'].includes(t.id)) {
    $('preset').value = '';
    clearTimeout(debounce);
    debounce = setTimeout(update, 150);
  } else if (t.id === 'preset') {
    const preset = PRESETS[t.value];
    if (!preset) return;
    stopSweep();
    const { label, ...values } = preset;
    writeForm({ ...readForm(), ...values });
    update();
  } else {
    if (t === fields.b) stopSweep();
    update();
  }
});
fields.n.addEventListener('change', () => (fields.n.value = readForm().n));
$('controls').addEventListener('submit', (e) => e.preventDefault());

const resize = new ResizeObserver(() => update());
resize.observe(antiSvg);
resize.observe(fSvg);

renderStatic();
writeForm(loadState());
update();
