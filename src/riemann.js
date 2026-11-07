import { compileFunction, constant, expressionToTex } from './expression.js';
import { formatNumber as fmt, niceTicks } from './format.js';
import { renderStatic, setTex, tex, texNum as T, texText } from './tex.js';
import { svgEl, frame, axes, extent, polyline, stateFromHash as readHash, writeHash } from './pageUtils.js';
import { RULES, EXTREMUM_SAMPLES, riemannSum, sums, bounds, integrate } from './integral.js';

// Page showing how ∫ₐᵇ f arises from Riemann sums over equidistant partitions:
// a chart of the rectangles for the current n, a chart of Sₙ against n squeezed
// between the lower and upper sums, and the numbers behind both.

const DEFAULTS = { expr: 'x^2', a: '0', b: '2', n: 8, rule: 'left', band: true };
const PRESETS = [
  { label: 'x² on [0, 2]', expr: 'x^2', a: '0', b: '2' },
  { label: 'sin x on [0, π]', expr: 'sin(x)', a: '0', b: 'pi' },
  { label: 'sin x on [0, 2π]: signed area', expr: 'sin(x)', a: '0', b: '2pi' },
  { label: 'eˣ on [−1, 1]', expr: 'e^x', a: '-1', b: '1' },
  { label: '1/x on [1, e]: ln e = 1', expr: '1/x', a: '1', b: 'e' },
  { label: '√(1 − x²) on [−1, 1]: π/2', expr: 'sqrt(1 - x^2)', a: '-1', b: '1' },
  { label: 'x³ − 3x on [−2, 2.5]', expr: 'x^3 - 3x', a: '-2', b: '2.5' },
  { label: 'sin(1/x) on [0.05, 0.5]', expr: 'sin(1/x)', a: '0.05', b: '0.5' },
];
const N_MAX = 200;
const CURVE_SAMPLES = 600;
const MARGIN = { top: 12, right: 16, bottom: 26, left: 52 };
const PLAY_INTERVAL = 220; // ms per step of the animation

const $ = (id) => document.getElementById(id);
const fields = { expr: $('expr'), a: $('a'), b: $('b'), n: $('n'), band: $('showBand') };
const nSlider = $('nSlider');
const mainSvg = document.querySelector('#chart > svg');
const convSvg = document.querySelector('#convergence > svg');

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
    b: fields.b.value,
    n: clampN(+fields.n.value),
    rule: document.querySelector('input[name=rule]:checked')?.value ?? DEFAULTS.rule,
    band: fields.band.checked,
  };
}

function writeForm(state) {
  fields.expr.value = state.expr;
  fields.a.value = state.a;
  fields.b.value = state.b;
  fields.n.value = nSlider.value = state.n;
  fields.band.checked = state.band;
  document.querySelector(`input[name=rule][value=${state.rule}]`).checked = true;
}

function stateFromHash() {
  const state = readHash(DEFAULTS);
  state.n = clampN(state.n);
  if (!(state.rule in RULES)) state.rule = DEFAULTS.rule;
  return state;
}

// --- Model: everything that depends only on f, a and b -----------------------

// Recomputed only when f, a or b change, so moving n or switching rules is cheap.
let model = null;

function getModel({ expr, a, b }) {
  const key = JSON.stringify([expr, a, b]);
  if (model?.key === key) return model;
  try {
    const f = compileFunction(expr, ['x']);
    const lo = constant(a, 'a');
    const hi = constant(b, 'b');
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) throw new Error('a and b must be finite numbers.');
    if (!(lo < hi)) throw new Error('Choose a < b.');
    // Typical size of the sums, so rounding noise like 1e−16 can be shown as 0.
    let peak = 0;
    for (let k = 0; k <= 200; k++) {
      const y = Math.abs(f(lo + ((hi - lo) * k) / 200));
      if (Number.isFinite(y) && y > peak) peak = y;
    }
    const scale = peak * (hi - lo);
    const snap = (v) => (Math.abs(v) < 1e-12 * scale ? 0 : v);
    model = { key, f, a: lo, b: hi, scale, snap, integral: snap(integrate(f, lo, hi)), series: {}, bounds: null };
  } catch (err) {
    model = { key, error: err.message };
  }
  return model;
}

const boundsOf = (m) => (m.bounds ??= bounds(m.f, m.a, m.b, N_MAX));

/** Sₙ for n = 1 … N_MAX under a rule (index n − 1). */
function seriesOf(m, rule) {
  if (rule === 'lower' || rule === 'upper') return boundsOf(m)[rule];
  return (m.series[rule] ??= sums(m.f, m.a, m.b, N_MAX, rule));
}

// --- Rectangle chart ----------------------------------------------------------

let main = null; // the current rectangle chart, read by its hover code
let hoverIndex = null;

function drawMain(m, current) {
  const box = frame(mainSvg, MARGIN);
  main = null;
  if (!box || !current) return;
  const { a, b, f } = m;
  const pad = (b - a) * 0.06;
  const [xMin, xMax] = [a - pad, b + pad];
  const curve = [];
  for (let k = 0; k <= CURVE_SAMPLES; k++) {
    const x = xMin + ((xMax - xMin) * k) / CURVE_SAMPLES;
    let y;
    try {
      y = f(x);
    } catch {
      y = NaN;
    }
    curve.push([x, y]);
  }
  const [yMin, yMax] = extent(
    curve.filter(([x]) => x >= a && x <= b).map(([, y]) => y),
    0,
  );
  const sx = (x) => MARGIN.left + ((x - xMin) / (xMax - xMin)) * box.plotW;
  const sy = (y) => MARGIN.top + (1 - (y - yMin) / (yMax - yMin)) * box.plotH;
  const clampY = (px) => Math.max(-10 * box.height, Math.min(11 * box.height, px));

  axes(mainSvg, box, niceTicks(xMin, xMax, 8).ticks.filter((t) => t >= xMin && t <= xMax).map((t) => [t, sx(t)]), yMin, yMax, sy);
  const plot = svgEl('g', { 'clip-path': box.clipUrl }, mainSvg);

  // The exact area, faintly, so over- and undershoot of the rectangles show.
  const inside = curve.filter(([x]) => x >= a && x <= b);
  const areaPath = polyline([[a, 0], ...inside, [b, 0]].map(([x, y]) => [sx(x), sy(y)]), clampY);
  if (inside.every(([, y]) => Number.isFinite(y))) svgEl('path', { d: areaPath + 'Z', class: 'area' }, plot);

  const rects = svgEl('g', { class: 'rects' }, plot);
  const thin = sx(a + current.dx) - sx(a) < 4;
  const rectEls = current.tags.map(({ y }, i) => {
    if (!Number.isFinite(y)) return null;
    const x0 = sx(current.xs[i]);
    const x1 = sx(current.xs[i + 1]);
    const top = clampY(sy(Math.max(y, 0)));
    const bottom = clampY(sy(Math.min(y, 0)));
    return svgEl('rect', {
      x: x0,
      y: top,
      width: Math.max(x1 - x0, 0.5),
      height: Math.max(bottom - top, 0),
      class: `${y < 0 ? 'neg' : 'pos'}${thin ? ' thin' : ''}`,
    }, rects);
  });

  svgEl('path', { d: polyline(curve.map(([x, y]) => [sx(x), sy(y)]), clampY), class: 'curve' }, plot);
  // a and b
  for (const x of [a, b]) svgEl('line', { x1: sx(x), x2: sx(x), y1: MARGIN.top, y2: MARGIN.top + box.plotH, class: 'bound' }, plot);

  if (current.tags.length <= 60) {
    const tags = svgEl('g', { class: 'tags' }, plot);
    for (const { x, y } of current.tags) {
      if (Number.isFinite(y)) svgEl('circle', { cx: sx(x), cy: clampY(sy(y)), r: current.tags.length <= 20 ? 3.5 : 2.5 }, tags);
    }
  }

  main = { a, b, xMin, xMax, sx, plotW: box.plotW, current, rectEls };
  mainSvg.setAttribute('aria-label', `Graph of f with ${current.tags.length} Riemann rectangles on [${fmt(a)}, ${fmt(b)}]`);
  highlight(hoverIndex);
}

function highlight(i) {
  hoverIndex = i;
  const out = $('hover');
  for (const el of main?.rectEls ?? []) el?.classList.remove('active');
  if (!main || i == null || i < 0 || i >= main.current.tags.length) {
    hoverIndex = null;
    out.textContent = '';
    return;
  }
  const { xs, tags, dx } = main.current;
  main.rectEls[i]?.classList.add('active');
  const { x, y } = tags[i];
  setTex(out, `i = ${i + 1} \\quad [${T(xs[i])}, ${T(xs[i + 1])}] \\quad \\xi_i = ${T(x)} \\quad f(\\xi_i) = ${T(y)} \\quad f(\\xi_i)\\,\\Delta x = ${T(y * dx)}`);
}

mainSvg.addEventListener('pointermove', (e) => {
  if (!main) return;
  const px = e.clientX - mainSvg.getBoundingClientRect().left;
  const x = main.xMin + ((px - MARGIN.left) / main.plotW) * (main.xMax - main.xMin);
  highlight(x < main.a || x > main.b ? null : Math.min(main.current.tags.length - 1, Math.floor((x - main.a) / main.current.dx)));
});
mainSvg.addEventListener('pointerleave', () => highlight(null));
mainSvg.addEventListener('blur', () => highlight(null));
mainSvg.addEventListener('keydown', (e) => {
  if (!main || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  e.preventDefault();
  const last = main.current.tags.length - 1;
  const step = e.key === 'ArrowLeft' ? -1 : 1;
  highlight(hoverIndex == null ? (step > 0 ? 0 : last) : Math.min(last, Math.max(0, hoverIndex + step)));
});

// --- Convergence chart ----------------------------------------------------------

let conv = null;
const LOG_TICKS = [1, 2, 5, 10, 20, 50, 100, 200];

function drawConvergence(m, state) {
  const box = frame(convSvg, MARGIN);
  conv = null;
  if (!box || m.error) return;
  const series = seriesOf(m, state.rule);
  const band = state.band ? boundsOf(m) : null;
  // Scaled to Sₙ and the integral only. |Sₙ| ≤ sup|f|·(b − a) for bounded f; sums far
  // beyond that come from a tag next to a pole and would flatten everything else.
  const anchor = Number.isFinite(m.integral) ? m.integral : 0;
  const [yMin, yMax] = extent(series.filter((v) => Math.abs(v) <= 2 * m.scale), anchor);
  // n on a log axis, so the first few steps aren't squashed.
  const sx = (n) => MARGIN.left + (Math.log(n) / Math.log(N_MAX)) * box.plotW;
  const sy = (y) => MARGIN.top + (1 - (y - yMin) / (yMax - yMin)) * box.plotH;
  const clampY = (px) => Math.max(-10 * box.height, Math.min(11 * box.height, px));
  axes(convSvg, box, LOG_TICKS.map((t) => [t, sx(t)]), yMin, yMax, sy);
  const plot = svgEl('g', { 'clip-path': box.clipUrl }, convSvg);
  const pts = (ys) => ys.map((y, i) => [sx(i + 1), sy(y)]);

  if (band) {
    const upper = pts(band.upper);
    const lower = pts(band.lower).reverse();
    if ([...upper, ...lower].every(([, y]) => Number.isFinite(y))) {
      svgEl('path', { d: polyline([...upper, ...lower], clampY) + 'Z', class: 'band' }, plot);
    }
  }
  if (Number.isFinite(m.integral)) {
    svgEl('line', { x1: MARGIN.left, x2: MARGIN.left + box.plotW, y1: sy(m.integral), y2: sy(m.integral), class: 'exact' }, plot);
  }
  svgEl('path', { d: polyline(pts(series), clampY), class: 'series' }, plot);
  const n = state.n;
  if (Number.isFinite(series[n - 1])) svgEl('circle', { cx: sx(n), cy: clampY(sy(series[n - 1])), r: 4.5, class: 'dot' }, plot);
  conv = { sx, sy, plotW: box.plotW, series, integral: m.integral, clampY, snap: m.snap };
  conv.hover = svgEl('circle', { r: 3.5, class: 'conv-hover', visibility: 'hidden' }, plot);
  convSvg.setAttribute('aria-label', `Riemann sums for n from 1 to ${N_MAX}, converging to the integral`);
}

function convAt(clientX) {
  const px = clientX - convSvg.getBoundingClientRect().left;
  return clampN(Math.exp(((px - MARGIN.left) / conv.plotW) * Math.log(N_MAX)));
}

function showConvHover(n) {
  const out = $('convHover');
  if (!conv || n == null) {
    conv?.hover.setAttribute('visibility', 'hidden');
    out.textContent = '';
    return;
  }
  const s = conv.series[n - 1];
  const finite = Number.isFinite(s);
  conv.hover.setAttribute('visibility', finite ? 'visible' : 'hidden');
  if (finite) {
    conv.hover.setAttribute('cx', conv.sx(n));
    conv.hover.setAttribute('cy', conv.clampY(conv.sy(s)));
  }
  const err = Number.isFinite(conv.integral) ? ` \\quad S_{${n}} - \\int_a^b f = ${T(conv.snap(s - conv.integral))}` : '';
  setTex(out, `n = ${n} \\quad S_{${n}} = ${T(conv.snap(s))}${err}`);
}

convSvg.addEventListener('pointermove', (e) => conv && showConvHover(convAt(e.clientX)));
convSvg.addEventListener('pointerleave', () => showConvHover(null));
convSvg.addEventListener('click', (e) => conv && setN(convAt(e.clientX)));
convSvg.addEventListener('keydown', (e) => {
  if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  e.preventDefault();
  setN(readForm().n + (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 10 : 1));
});

// --- Explanation ---------------------------------------------------------------

function facts(m, state, current) {
  const { n, rule } = state;
  const { a, b, integral } = m;
  const S = m.snap(current.sum);
  const I = Number.isFinite(integral) ? T(integral, 8) : '';
  const items = [
    [
      'Partition',
      `Cut \\([a, b] = [${T(a)}, ${T(b)}]\\) into \\(n = ${n}\\) equal pieces of width ` +
        `\\(\\Delta x = \\frac{b - a}{n} = ${T(current.dx)}\\), with points \\(x_i = a + i\\,\\Delta x\\) for \\(i = 0, \\dots, ${n}\\).`,
    ],
    ['Sample points', `In each piece \\([x_{i-1}, x_i]\\) pick ${RULES[rule].tag}.`],
    [
      `\\(S_n = \\sum_{i=1}^n f(\\xi_i)\\,\\Delta x\\)`,
      `Each rectangle has width \\(\\Delta x\\) and height \\(f(\\xi_i)\\); heights below the axis count negatively. ` +
        (Number.isFinite(S)
          ? `Their total is \\(S_{${n}} = ${T(S, 6)}\\).`
          : `\\(f\\) is undefined at one of the sample points, so the sum is too.`),
    ],
  ];
  if (Number.isFinite(integral)) {
    items.push([
      `\\(\\int_a^b f(x)\\,dx\\)`,
      `The limit \\(\\lim_{n \\to \\infty} S_n\\) is the integral, here \\(${I}\\) (computed independently with adaptive Simpson).` +
        (Number.isFinite(S) ? ` With \\(n = ${n}\\) the error is \\(S_{${n}} - \\int_a^b f = ${T(m.snap(S - integral))}\\).` : ''),
    ]);
    // How fast the error shrinks: compare n with 2n.
    const series = seriesOf(m, rule);
    if (2 * n <= N_MAX && rule !== 'lower' && rule !== 'upper') {
      const e1 = series[n - 1] - integral;
      const e2 = series[2 * n - 1] - integral;
      if (Number.isFinite(e1) && Number.isFinite(e2) && Math.abs(e2) > 1e-12 * Math.max(1, Math.abs(integral))) {
        const ratio = e1 / e2;
        const order = rule === 'midpoint'
          ? 'about 4: the midpoint error shrinks like \\(1/n^2\\)'
          : 'about 2: the error shrinks like \\(1/n\\)';
        items.push(['Rate', `Doubling \\(n\\) divides the error by \\(${T(ratio, 3)}\\) (for smooth \\(f\\) ${order}).`]);
      }
    }
  } else {
    items.push([
      `\\(\\int_a^b f(x)\\,dx\\)`,
      'The reference integral could not be computed: \\(f\\) is undefined or unbounded somewhere on \\([a, b]\\).',
    ]);
  }
  const { lower, upper } = boundsOf(m);
  const L = m.snap(lower[n - 1]);
  const U = m.snap(upper[n - 1]);
  if (Number.isFinite(L) && Number.isFinite(U)) {
    items.push([
      `\\(L_n \\le S_n \\le U_n\\)`,
      `Whatever \\(\\xi_i\\) you pick, the sum lies between the lower sum \\(L_{${n}} = ${T(L, 6)}\\) (infimum in each piece) ` +
        `and the upper sum \\(U_{${n}} = ${T(U, 6)}\\) (supremum). Their gap is \\(U_{${n}} - L_{${n}} = ${T(U - L)}\\). ` +
        `\\(f\\) is Riemann integrable exactly when this gap can be made as small as you like; then every choice of \\(\\xi_i\\) ` +
        `is squeezed to the same limit, the integral. (\\(\\inf\\) and \\(\\sup\\) are estimated from ${EXTREMUM_SAMPLES + 1} values per piece.)`,
    ]);
  }
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

// --- Update and wiring ---------------------------------------------------------

function update() {
  const state = readForm();
  const m = getModel(state);
  const status = $('status');
  status.textContent = m.error ?? '';
  const current = m.error ? null : riemannSum(m.f, m.a, m.b, state.n, state.rule);
  const formula = $('formula');
  if (current) {
    const integral = `\\int_{${expressionToTex(state.a)}}^{${expressionToTex(state.b)}} ${expressionToTex(state.expr)}\\,dx`;
    setTex(formula, `S_{${state.n}} = ${T(m.snap(current.sum), 6)}` +
      (Number.isFinite(m.integral) ? ` \\;\\longrightarrow\\; ${integral} = ${T(m.integral, 6)}` : ''));
  } else {
    formula.textContent = '';
  }
  drawMain(m, current);
  drawConvergence(m, state);
  if (current) facts(m, state, current);
  else document.querySelector('#facts dl').replaceChildren();
  writeHash(state);
}

function setN(n) {
  fields.n.value = nSlider.value = clampN(n);
  update();
}

let timer = null;
function stopPlay() {
  clearInterval(timer);
  timer = null;
  $('play').innerHTML = `▶ Animate ${tex(`n \\to ${N_MAX}`)}`;
  $('play').setAttribute('aria-pressed', 'false');
}
$('play').addEventListener('click', () => {
  if (timer) return stopPlay();
  let n = 1;
  setN(n);
  $('play').textContent = '■ Stop';
  $('play').setAttribute('aria-pressed', 'true');
  timer = setInterval(() => {
    n = Math.min(N_MAX, Math.max(n + 1, Math.round(n * 1.08)));
    setN(n);
    if (n >= N_MAX) stopPlay();
  }, PLAY_INTERVAL);
});

let debounce = null;
$('controls').addEventListener('input', (e) => {
  const t = e.target;
  if (t === nSlider || t === fields.n) {
    stopPlay();
    if (t === nSlider) fields.n.value = nSlider.value;
    else nSlider.value = t.value;
    update();
  } else if (t === fields.expr || t === fields.a || t === fields.b) {
    $('preset').value = '';
    clearTimeout(debounce);
    debounce = setTimeout(update, 150);
  } else if (t.id === 'preset') {
    const preset = PRESETS[t.value];
    if (!preset) return;
    writeForm({ ...readForm(), expr: preset.expr, a: preset.a, b: preset.b });
    update();
  } else {
    update();
  }
});
// The number field may hold an out-of-range n while typing; show the clamped one after.
fields.n.addEventListener('change', () => (fields.n.value = readForm().n));
$('controls').addEventListener('submit', (e) => e.preventDefault());

const resize = new ResizeObserver(() => update());
resize.observe(mainSvg);
resize.observe(convSvg);

renderStatic();
writeForm(stateFromHash());
update();
