import { compileFunction, constant, expressionToTex, parseExpression } from './expression.js';
import { niceTicks } from './format.js';
import { renderStatic, setTex, texNum as T, texSigned, texText } from './tex.js';
import { svgEl, svgTex, num, safe, frame, axes, extent, robustExtent, polyline, serializeHash, stateFromHash, writeHash } from './pageUtils.js';
import { taylorCoefficients, smoothOrders, taylorValue, isNegligible, fitInterval } from './taylorMath.js';

// Page for Taylor polynomials: above, f and its degree-n Taylor polynomial Tₙ
// at x₀ (drag x₀, slide n), with the stretch where they agree within ε shaded;
// below, the error |f − Tₙ| on a log scale.

const N_MAX = 30;
// Coefficients are computed beyond N_MAX to find the first term left out of T_N_MAX.
const SERIES_ORDER = N_MAX + 10;
const DEFAULTS = { expr: 'sin(x)', xMin: '-7', xMax: '7', x0: 0, n: 3 };
const PRESETS = [
  { label: 'sin x at 0', expr: 'sin(x)', xMin: '-7', xMax: '7', x0: 0, n: 5 },
  { label: 'eˣ at 0', expr: 'e^x', xMin: '-4', xMax: '4', x0: 0, n: 3 },
  { label: 'ln x at 1: fits only up to x = 2', expr: 'log(x)', xMin: '-0.5', xMax: '3.5', x0: 1, n: 8 },
  { label: '1/(1 + x²) at 0: fits only for |x| < 1', expr: '1/(1 + x^2)', xMin: '-2.5', xMax: '2.5', x0: 0, n: 10 },
  { label: '√x at 1', expr: 'sqrt(x)', xMin: '-0.5', xMax: '4', x0: 1, n: 4 },
  { label: 'x³ − 3x at 1: exact from n = 3', expr: 'x^3 - 3x', xMin: '-2.5', xMax: '2.5', x0: 1, n: 2 },
  { label: '|x| at 0: no derivative, only T₀', expr: 'abs(x)', xMin: '-2', xMax: '2', x0: 0, n: 1 },
];
const SAMPLES = 600;
const EPS_FRACTION = 0.01; // ε as a fraction of the main chart's height
const LOG_FLOOR = -16; // errors below 10⁻¹⁶ are rounding
const STEP_MS = 300; // per degree in "add terms"
const MARGIN = { top: 12, right: 16, bottom: 26, left: 52 };

const $ = (id) => document.getElementById(id);
const fields = { expr: $('expr'), xMin: $('xMin'), xMax: $('xMax'), x0: $('x0'), n: $('n') };
const x0Slider = $('x0Slider');
const nSlider = $('nSlider');
const mainSvg = document.querySelector('#chart > svg');
const errorSvg = document.querySelector('#errorChart > svg');

for (const [i, preset] of PRESETS.entries()) $('preset').add(new Option(preset.label, i));

// --- Form and URL hash ---------------------------------------------------------

function readForm() {
  return {
    expr: fields.expr.value,
    xMin: fields.xMin.value,
    xMax: fields.xMax.value,
    x0: parseFloat(fields.x0.value),
    n: parseFloat(fields.n.value),
  };
}

function writeForm(state) {
  for (const key of Object.keys(fields)) fields[key].value = state[key];
}

// --- Model: everything that depends on f and the view, not on x0 or n -----------

let model = null;

function getModel({ expr, xMin, xMax }) {
  const key = JSON.stringify([expr, xMin, xMax]);
  if (model?.key === key) return model;
  try {
    const compiled = compileFunction(expr, ['x']);
    const f = (x) => safe(compiled, x);
    const lo = constant(xMin, 'View');
    const hi = constant(xMax, 'View');
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) throw new Error('The view must be finite numbers.');
    if (!(lo < hi)) throw new Error('The view needs a left end below its right end.');
    const xs = Array.from({ length: SAMPLES + 1 }, (_, i) => lo + ((hi - lo) * i) / SAMPLES);
    const fs = xs.map(f);
    const yRange = robustExtent(fs, 0);
    model = {
      key,
      expr,
      f,
      node: parseExpression(expr),
      lo,
      hi,
      width: hi - lo,
      xs,
      fs,
      yRange,
      eps: EPS_FRACTION * (yRange[1] - yRange[0]),
      fTex: expressionToTex(expr),
      series: null, // { x0, coeffs } or { x0, error }, the last one computed
    };
  } catch (err) {
    model = { key, error: err.message };
  }
  return model;
}

/** Taylor coefficients at x0 (cached for the last x0). */
function seriesAt(m, x0) {
  if (m.series?.x0 !== x0) {
    try {
      m.series = { x0, coeffs: taylorCoefficients(m.node, x0, SERIES_ORDER) };
    } catch (err) {
      m.series = { x0, error: err.message };
    }
  }
  return m.series;
}

/** x0 kept in the view, n a whole number in 0 … N_MAX. */
function clampState(m, state) {
  const x0 = Number.isFinite(state.x0) ? Math.min(m.hi, Math.max(m.lo, state.x0)) : (m.lo + m.hi) / 2;
  const n = Number.isFinite(state.n) ? Math.min(N_MAX, Math.max(0, Math.round(state.n))) : DEFAULTS.n;
  return { ...state, x0, n };
}

/** Everything about the current x0 and n. */
function atPoint(m, { x0, n }) {
  const series = seriesAt(m, x0);
  if (series.error) return { x0, n, error: series.error, f0: m.f(x0) };
  const { coeffs } = series;
  const smooth = smoothOrders(coeffs); // orders 0 … smooth − 1 exist
  const degree = Math.min(n, smooth - 1); // the polynomial actually drawn (−1: none)
  const ts = degree >= 0 ? m.xs.map((x) => taylorValue(coeffs, x0, degree, x)) : null;
  const errors = ts && m.fs.map((y, i) => Math.abs(y - ts[i]));
  const fit = ts && fitInterval(m.xs, m.fs, ts, x0, m.eps);
  return { x0, n, coeffs, smooth, degree, ts, errors, fit, f0: m.f(x0) };
}

// --- Main chart: f and Tₙ -------------------------------------------------------------

let main = null; // the current mapping, read by the pointer code

function fitBand(plot, fit, sx, top, height) {
  if (fit) svgEl('rect', { x: sx(fit.lo), width: Math.max(1, sx(fit.hi) - sx(fit.lo)), y: top, height, class: 'fit-band' }, plot);
}

function drawMain(m, cur) {
  const box = frame(mainSvg, MARGIN);
  main = null;
  if (!box) return;
  const [yMin, yMax] = m.yRange;
  const sx = (x) => MARGIN.left + ((x - m.lo) / m.width) * box.plotW;
  const sy = (y) => MARGIN.top + (1 - (y - yMin) / (yMax - yMin)) * box.plotH;
  const clampY = (px) => Math.max(-10 * box.height, Math.min(11 * box.height, px));
  const ticks = niceTicks(m.lo, m.hi, 8).ticks.filter((t) => t >= m.lo && t <= m.hi);
  axes(mainSvg, box, ticks.map((t) => [t, sx(t)]), yMin, yMax, sy);
  const plot = svgEl('g', { 'clip-path': box.clipUrl }, mainSvg);
  const { x0, ts, fit, f0, coeffs } = cur;

  fitBand(plot, fit, sx, MARGIN.top, box.plotH);
  svgEl('line', { x1: sx(x0), x2: sx(x0), y1: MARGIN.top, y2: MARGIN.top + box.plotH, class: 'center' }, plot);
  svgEl('path', { d: polyline(m.xs.map((x, i) => [sx(x), sy(m.fs[i])]), clampY), class: 'curve' }, plot);
  if (ts) svgEl('path', { d: polyline(m.xs.map((x, i) => [sx(x), sy(ts[i])]), clampY), class: 'taylor' }, plot);
  // The center point: on f, or on Tₙ where f itself is undefined at x0 (sin(x)/x at 0).
  const y0 = Number.isFinite(f0) ? f0 : coeffs?.[0];
  if (Number.isFinite(y0)) svgEl('circle', { cx: sx(x0), cy: clampY(sy(y0)), r: 5, class: 'point-p' }, plot);
  svgTex(plot, sx(x0) + 4, MARGIN.top + 2, 'x_0', { baseline: 'top', cls: 'point-label' });

  main = { plotW: box.plotW };
  mainSvg.setAttribute('aria-label', `Graph of f and its Taylor polynomial of degree ${Math.max(0, cur.degree ?? 0)} at x0 = ${num(x0)}`);
}

// --- Error chart: log10 |f − Tₙ| ----------------------------------------------------------

let errorMap = null;

function drawError(m, cur) {
  const box = frame(errorSvg, MARGIN);
  errorMap = null;
  if (!box) return;
  const logs = cur.errors ? cur.errors.map((e) => (Number.isFinite(e) ? Math.log10(Math.max(e, 10 ** LOG_FLOOR)) : NaN)) : [];
  const logEps = Math.log10(m.eps);
  let [yMin, yMax] = extent(logs, logEps);
  yMin = Math.max(yMin, LOG_FLOOR - 0.5);
  yMax = Math.min(yMax, 20);
  const sx = (x) => MARGIN.left + ((x - m.lo) / m.width) * box.plotW;
  const sy = (y) => MARGIN.top + (1 - (y - yMin) / (yMax - yMin)) * box.plotH;
  const clampY = (px) => Math.max(-10 * box.height, Math.min(11 * box.height, px));
  const ticks = niceTicks(m.lo, m.hi, 8).ticks.filter((t) => t >= m.lo && t <= m.hi);
  axes(errorSvg, box, ticks.map((t) => [t, sx(t)]), yMin, yMax, sy);
  const plot = svgEl('g', { 'clip-path': box.clipUrl }, errorSvg);

  fitBand(plot, cur.fit, sx, MARGIN.top, box.plotH);
  svgEl('line', { x1: sx(cur.x0), x2: sx(cur.x0), y1: MARGIN.top, y2: MARGIN.top + box.plotH, class: 'center' }, plot);
  svgEl('line', { x1: MARGIN.left, x2: MARGIN.left + box.plotW, y1: sy(logEps), y2: sy(logEps), class: 'eps' }, plot);
  svgTex(plot, MARGIN.left + box.plotW - 4, sy(logEps) - 2, '\\varepsilon', { anchor: 'end', cls: 'eps-label' });
  if (logs.length) svgEl('path', { d: polyline(m.xs.map((x, i) => [sx(x), sy(logs[i])]), clampY), class: 'error-curve' }, plot);

  errorMap = { plotW: box.plotW };
  errorSvg.setAttribute('aria-label', `Error of the Taylor polynomial on a log scale, at x0 = ${num(cur.x0)}`);
}

// --- Pointer and keyboard -------------------------------------------------------------

function xAt(svg, clientX, plotW) {
  const px = clientX - svg.getBoundingClientRect().left;
  return model.lo + ((px - MARGIN.left) / plotW) * model.width;
}

let dragging = false;
let current = null; // the last atPoint(), for the readouts

mainSvg.addEventListener('pointerdown', (e) => {
  if (!main || model?.error) return;
  stopPlay();
  dragging = true;
  mainSvg.setPointerCapture(e.pointerId);
  setState({ x0: xAt(mainSvg, e.clientX, main.plotW) });
});
mainSvg.addEventListener('pointermove', (e) => {
  if (!main || model?.error) return;
  const x = xAt(mainSvg, e.clientX, main.plotW);
  if (dragging) setState({ x0: x });
  const t = current?.degree >= 0 ? `\\quad T_{${current.degree}}(x) = ${T(taylorValue(current.coeffs, current.x0, current.degree, x))}` : '';
  setTex($('hover'), `x = ${T(x)} \\quad f(x) = ${T(model.f(x))}${t}`);
});
mainSvg.addEventListener('pointerup', () => (dragging = false));
mainSvg.addEventListener('pointercancel', () => (dragging = false));
mainSvg.addEventListener('pointerleave', () => ($('hover').innerHTML = ''));
mainSvg.addEventListener('keydown', (e) => {
  if (!main || model?.error || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  e.preventDefault();
  stopPlay();
  const step = (model.width / 200) * (e.shiftKey ? 10 : 1) * (e.key === 'ArrowLeft' ? -1 : 1);
  setState({ x0: readForm().x0 + step });
});

errorSvg.addEventListener('pointermove', (e) => {
  if (!errorMap || model?.error || !(current?.degree >= 0)) return;
  const x = xAt(errorSvg, e.clientX, errorMap.plotW);
  const err = Math.abs(model.f(x) - taylorValue(current.coeffs, current.x0, current.degree, x));
  setTex($('errorHover'), `x = ${T(x)} \\quad |f(x) - T_{${current.degree}}(x)| = ${T(err, 3)}`);
});
errorSvg.addEventListener('pointerleave', () => ($('errorHover').innerHTML = ''));
errorSvg.addEventListener('keydown', (e) => {
  if (model?.error || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  e.preventDefault();
  stopPlay();
  setState({ n: readForm().n + (e.key === 'ArrowLeft' ? -1 : 1) });
});

// --- Explanation ---------------------------------------------------------------------

/** (x − x₀) as TeX, or x when x₀ = 0. */
const base = (x0) => (x0 === 0 ? 'x' : `(x ${texSigned(-x0, 4)})`);

/** TeX of the term a·(x − x₀)ᵏ, without a factor 1 (a ≥ 0 here; the caller writes the sign). */
function termTex(a, k, x0) {
  const power = k === 0 ? '' : k === 1 ? base(x0) : `${base(x0)}^{${k}}`;
  const factor = k > 0 && Math.abs(a - 1) < 1e-12 ? '' : T(a, 4);
  return factor && power ? `${factor}\\,${power}` : factor || power;
}

/** TeX of Σ aₖ (x − x₀)ᵏ for k ≤ n, leaving out zero terms (and the middle of long sums). */
function polynomialTex(coeffs, x0, n, w) {
  const terms = [];
  for (let k = 0; k <= n; k++) {
    if (isNegligible(coeffs, k, w)) continue;
    terms.push({ sign: coeffs[k] < 0 ? '-' : '+', body: termTex(Math.abs(coeffs[k]), k, x0) });
  }
  if (!terms.length) return '0';
  const shown = terms.length > 7 ? [...terms.slice(0, 4), null, ...terms.slice(-2)] : terms;
  return shown
    .map((t, i) => (t === null ? '+ \\dots' : i === 0 ? (t.sign === '-' ? '-' : '') + t.body : `${t.sign} ${t.body}`))
    .join(' ');
}

/** The derivative page's hash for this f, view and x0 (its keys: expr, xMin, xMax, x0, h), escaped for an href. */
function derivativeHash(m, x0) {
  const state = { expr: m.expr, xMin: fields.xMin.value, xMax: fields.xMax.value, x0: +x0.toPrecision(6), h: +(m.width / 4).toPrecision(6) };
  return serializeHash(state).replaceAll('&', '&amp;');
}

const DERIVATIVE_NAMES = ['f(x_0)', "f'(x_0)", "f''(x_0)", "f'''(x_0)"];

function facts(m, cur) {
  const { x0, n } = cur;
  const items = [];
  const at = `\\(x_0 = ${T(x0, 4)}\\)`;
  if (cur.error) {
    items.push(['No polynomial', `${cur.error} The page computes the derivatives of \\(f\\) from its formula, rule by rule.`]);
  } else if (cur.degree < 0) {
    items.push(['No polynomial', `\\(f\\) is not defined at ${at} (or not continuous there), so not even \\(T_0 = f(x_0)\\) exists.`]);
  } else {
    const { coeffs, degree, smooth } = cur;
    const w = m.width / 2;
    const derivs = DERIVATIVE_NAMES.slice(0, Math.min(degree, 3) + 1)
      .map((name, k) => `\\(${name} = ${T(coeffs[k] * [1, 1, 2, 6][k], 4)}\\)`)
      .join(', ');
    items.push([
      `\\(T_{${degree}}\\) at ${at}`,
      `\\(T_{${degree}}(x) = ${polynomialTex(coeffs, x0, degree, w)}\\). ` +
        `Each coefficient is \\(\\frac{f^{(k)}(x_0)}{k!}\\); here ${derivs}` +
        (degree > 3 ? ', and so on' : '') +
        '. ' +
        (degree === 1 ? '\\(T_1\\) is the tangent at \\(x_0\\). ' : '') +
        (degree === 0 ? '\\(T_0\\) is the constant \\(f(x_0)\\). ' : '') +
        (degree >= 1 && degree === n && isNegligible(coeffs, n, w) ? `Here \\(f^{(${n})}(x_0) = 0\\), so \\(T_{${n}} = T_{${n - 1}}\\): the new term adds nothing.` : ''),
    ]);
    if (degree < n) {
      items.push([
        `No \\(T_{${n}}\\)`,
        smooth === 1
          ? `\\(f'(x_0)\\) does not exist, so the polynomial stops at the constant \\(T_0\\).`
          : `\\(f\\) has derivatives at \\(x_0\\) only up to order \\(${smooth - 1}\\), so the polynomial stops at degree \\(${smooth - 1}\\).`,
      ]);
    }
    // The first term left out: it sets how the error behaves near x0.
    let next = -1;
    for (let k = degree + 1; k < smooth; k++) {
      if (!isNegligible(coeffs, k, w)) {
        next = k;
        break;
      }
    }
    if (degree === n && next > 0) {
      items.push([
        'Near \\(x_0\\)',
        `The first term left out is \\(${coeffs[next] < 0 ? '-' : ''}${termTex(Math.abs(coeffs[next]), next, x0)}\\), so close to \\(x_0\\) the error ` +
          `\\(f(x) - T_{${n}}(x)\\) behaves like it: halving the distance to \\(x_0\\) divides the error by about \\(2^{${next}} = ${T(2 ** next)}\\). ` +
          'In the log-scale chart of the error, that is the steep dip at \\(x_0\\).',
      ]);
    } else if (degree === n && next === -1 && smooth === coeffs.length) {
      items.push([
        'Exact',
        `All derivatives of order above \\(${n}\\) vanish at \\(x_0\\) (checked up to order \\(${SERIES_ORDER}\\)): ` +
          `\\(f\\) is a polynomial of degree at most \\(${n}\\), and \\(T_{${n}} = f\\) everywhere.`,
      ]);
    }
    const { fit } = cur;
    const eps = `\\(\\varepsilon = ${T(m.eps, 2)}\\)`;
    items.push([
      'Where it fits',
      fit
        ? (fit.loEdge && fit.hiEdge
            ? `\\(|f(x) - T_{${degree}}(x)| < \\) ${eps} across the whole view.`
            : `\\(|f(x) - T_{${degree}}(x)| < \\) ${eps} (1 % of the chart's height) for \\(x\\) from ` +
              `\\(${fit.loEdge ? T(m.lo, 3) + '\\ (\\text{edge})' : T(fit.lo, 3)}\\) to \\(${fit.hiEdge ? T(m.hi, 3) + '\\ (\\text{edge})' : T(fit.hi, 3)}\\), the shaded stretch. `) +
          'Raising \\(n\\) usually widens it. Where it stops growing however large \\(n\\) gets, the Taylor series converges only on a limited interval around \\(x_0\\).'
        : `Even at \\(x_0\\) the error is not below ${eps}.`,
    ]);
  }
  items.push([
    'Related',
    `\\(T_1\\) is the tangent: see how it arises as a limit of secants on the ` +
      `<a href="./derivative.html#${derivativeHash(m, x0)}">secant to tangent</a> page, with this \\(f\\) and \\(x_0\\).`,
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

// --- Update and wiring -----------------------------------------------------------------

function update() {
  const raw = readForm();
  const m = getModel(raw);
  if (m.error) {
    $('status').textContent = m.error;
    for (const svg of [mainSvg, errorSvg]) frame(svg, MARGIN);
    main = errorMap = current = null;
    $('formula').innerHTML = '';
    document.querySelector('#facts dl').replaceChildren();
    writeHash(raw);
    return;
  }
  const state = clampState(m, raw);
  if (state.x0 !== raw.x0) fields.x0.value = +state.x0.toPrecision(6);
  if (state.n !== raw.n) fields.n.value = state.n;
  Object.assign(x0Slider, { min: m.lo, max: m.hi, step: m.width / 1000 });
  x0Slider.value = state.x0;
  nSlider.value = state.n;
  const cur = atPoint(m, state);
  current = cur;
  $('status').textContent = cur.error ?? '';
  setTex($('formula'), `f(x) = ${m.fTex}`);
  drawMain(m, cur);
  drawError(m, cur);
  facts(m, cur);
  writeHash({ ...raw, x0: +state.x0.toPrecision(6), n: state.n });
}

function setState({ x0 = readForm().x0, n = readForm().n }) {
  if (Number.isFinite(x0)) fields.x0.value = +x0.toPrecision(6);
  if (Number.isFinite(n)) fields.n.value = n;
  update();
}

let timer = null;
function stopPlay() {
  clearInterval(timer);
  timer = null;
  $('play').textContent = '▶ Add terms';
  $('play').setAttribute('aria-pressed', 'false');
}
$('play').addEventListener('click', () => {
  if (timer || !main) return stopPlay();
  let n = 0;
  setState({ n });
  $('play').textContent = '■ Stop';
  $('play').setAttribute('aria-pressed', 'true');
  timer = setInterval(() => {
    n++;
    setState({ n });
    if (n >= N_MAX) stopPlay();
  }, STEP_MS);
});

let debounce = null;
$('controls').addEventListener('input', (e) => {
  const t = e.target;
  if (t === x0Slider) {
    stopPlay();
    setState({ x0: +x0Slider.value });
  } else if (t === nSlider) {
    stopPlay();
    setState({ n: +nSlider.value });
  } else if (['expr', 'xMin', 'xMax'].includes(t.id)) {
    $('preset').value = '';
    clearTimeout(debounce);
    debounce = setTimeout(update, 150);
  } else if (t.id === 'preset') {
    const preset = PRESETS[t.value];
    if (!preset) return;
    stopPlay();
    const { label, ...values } = preset;
    writeForm(values);
    update();
  } else {
    stopPlay();
    update();
  }
});
$('controls').addEventListener('submit', (e) => e.preventDefault());

const resize = new ResizeObserver(() => update());
resize.observe(mainSvg);
resize.observe(errorSvg);

renderStatic();
writeForm(stateFromHash(DEFAULTS));
update();
