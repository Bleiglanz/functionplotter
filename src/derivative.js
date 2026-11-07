import { compileFunction, constant, expressionToTex, derivativeToTex } from './expression.js';
import { niceTicks } from './format.js';
import { renderStatic, setTex, texNum as T, texSigned, texText } from './tex.js';
import { svgEl, svgTex, num, safe, frame, axes, robustExtent, polyline, stateFromHash, writeHash } from './pageUtils.js';
import { differenceQuotient, derivativeAt } from './derivativeMath.js';

// Page for the derivative as the limit of secant slopes: above, f with the
// secant through (x0, f(x0)) and (x0 + h, f(x0 + h)) and the tangent at x0;
// below, the secant slope as a function of h, whose limit at h = 0 is f′(x0).

const DEFAULTS = { expr: 'x^2', xMin: '-1', xMax: '3', x0: 1, h: 1 };
const PRESETS = [
  { label: 'x² at 1: slope 2', expr: 'x^2', xMin: '-1', xMax: '3', x0: 1, h: 1 },
  { label: 'sin x at 0: slope 1', expr: 'sin(x)', xMin: '-4', xMax: '4', x0: 0, h: 1.5 },
  { label: 'eˣ at 0: slope 1', expr: 'e^x', xMin: '-2', xMax: '2', x0: 0, h: 1 },
  { label: 'x³ − 3x at 1: horizontal tangent', expr: 'x^3 - 3x', xMin: '-2.5', xMax: '2.5', x0: 1, h: 1 },
  { label: '|x| at 0: a corner', expr: 'abs(x)', xMin: '-2', xMax: '2', x0: 0, h: 1 },
  { label: '√x at 0: vertical tangent', expr: 'sqrt(x)', xMin: '-0.5', xMax: '3', x0: 0, h: 1 },
  { label: 'x·sin(1/x) at 0: no limit', expr: 'x == 0 ? 0 : x*sin(1/x)', xMin: '-0.5', xMax: '0.5', x0: 0, h: 0.3 },
];
const SAMPLES = 600;
const MIN_STEP = 1e-4; // smallest |h|, as a fraction of the view width
const SWEEP_MS = 5000; // duration of "let h → 0"
const MARGIN = { top: 12, right: 16, bottom: 26, left: 52 };

const $ = (id) => document.getElementById(id);
const fields = { expr: $('expr'), xMin: $('xMin'), xMax: $('xMax'), x0: $('x0'), h: $('h') };
const x0Slider = $('x0Slider');
const hSlider = $('hSlider');
const mainSvg = document.querySelector('#chart > svg');
const slopeSvg = document.querySelector('#slopeChart > svg');

for (const [i, preset] of PRESETS.entries()) $('preset').add(new Option(preset.label, i));

// --- Form and URL hash ---------------------------------------------------------

function readForm() {
  return {
    expr: fields.expr.value,
    xMin: fields.xMin.value,
    xMax: fields.xMax.value,
    x0: parseFloat(fields.x0.value),
    h: parseFloat(fields.h.value),
  };
}

function writeForm(state) {
  for (const key of Object.keys(fields)) fields[key].value = state[key];
}

// --- Model: everything that depends on f and the view, not on x0 or h -----------

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
    model = { key, f, lo, hi, width: hi - lo, xs, fs, yRange: robustExtent(fs, 0), fTex: expressionToTex(expr), dTex: derivativeToTex(expr) };
  } catch (err) {
    model = { key, error: err.message };
  }
  return model;
}

/** x0 kept in the view, h kept to MIN_STEP·width ≤ |h| ≤ width, never 0. */
function clampState(m, state) {
  const x0 = Number.isFinite(state.x0) ? Math.min(m.hi, Math.max(m.lo, state.x0)) : (m.lo + m.hi) / 2;
  const sign = state.h < 0 ? -1 : 1;
  const size = Number.isFinite(state.h) && state.h !== 0 ? Math.abs(state.h) : m.width / 4;
  const h = sign * Math.min(m.width, Math.max(MIN_STEP * m.width, size));
  return { ...state, x0, h };
}

/** Everything about the current x0 and h. */
function atPoint(m, { x0, h }) {
  return {
    x0,
    h,
    f0: m.f(x0),
    f1: m.f(x0 + h),
    q: differenceQuotient(m.f, x0, h),
    d: derivativeAt(m.f, x0, m.width / 4),
  };
}

// --- Main chart: f, secant and tangent ---------------------------------------------

let main = null; // the current mapping, read by the pointer code

function line(plot, cls, x1, y1, x2, y2, clampY, sx, sy) {
  svgEl('line', { x1: sx(x1), y1: clampY(sy(y1)), x2: sx(x2), y2: clampY(sy(y2)), class: cls }, plot);
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
  const { x0, h, f0, f1, q, d } = cur;
  const at = (args) => line(plot, ...args, clampY, sx, sy);

  svgEl('path', { d: polyline(m.xs.map((x, i) => [sx(x), sy(m.fs[i])]), clampY), class: 'curve' }, plot);

  // Tangent: one line if f′(x0) exists, two half-lines at a corner, a vertical line if a side is infinite.
  const { left, right } = d;
  if (Number.isFinite(f0)) {
    if (Number.isFinite(d.value)) {
      at(['tangent', m.lo, f0 + d.value * (m.lo - x0), m.hi, f0 + d.value * (m.hi - x0)]);
    } else if (left.kind === 'infinite' || right.kind === 'infinite') {
      svgEl('line', { x1: sx(x0), x2: sx(x0), y1: MARGIN.top, y2: MARGIN.top + box.plotH, class: 'tangent vertical' }, plot);
    } else {
      if (left.kind === 'finite') at(['tangent', m.lo, f0 + left.value * (m.lo - x0), x0, f0]);
      if (right.kind === 'finite') at(['tangent', x0, f0, m.hi, f0 + right.value * (m.hi - x0)]);
    }
  }

  // Secant through both points, across the view, with its slope triangle.
  if (Number.isFinite(q)) {
    at(['secant', m.lo, f0 + q * (m.lo - x0), m.hi, f0 + q * (m.hi - x0)]);
    svgEl('path', {
      d: `M${sx(x0)},${clampY(sy(f0))}L${sx(x0 + h)},${clampY(sy(f0))}L${sx(x0 + h)},${clampY(sy(f1))}`,
      class: 'triangle',
    }, plot);
    // Labels only while the triangle is big enough to carry them.
    if (Math.abs(sx(x0 + h) - sx(x0)) > 40) {
      const below = f1 >= f0;
      svgTex(plot, (sx(x0) + sx(x0 + h)) / 2, clampY(sy(f0)) + (below ? 4 : -4), `h = ${T(h)}`, {
        anchor: 'middle',
        baseline: below ? 'top' : 'bottom',
        cls: 'triangle-label',
      });
      svgTex(plot, sx(x0 + h) + (h > 0 ? 6 : -6), (clampY(sy(f0)) + clampY(sy(f1))) / 2, `\\Delta f = ${T(f1 - f0, 3)}`, {
        anchor: h > 0 ? 'start' : 'end',
        baseline: 'middle',
        cls: 'triangle-label',
      });
    }
  }

  if (Number.isFinite(f1)) svgEl('circle', { cx: sx(x0 + h), cy: clampY(sy(f1)), r: 5, class: 'dot' }, plot);
  if (Number.isFinite(f0)) svgEl('circle', { cx: sx(x0), cy: clampY(sy(f0)), r: 5, class: 'point-p' }, plot);
  svgTex(plot, sx(x0) + 4, MARGIN.top + 2, 'x_0', { baseline: 'top', cls: 'point-label' });

  main = { sx, plotW: box.plotW };
  mainSvg.setAttribute('aria-label', `Graph of f with the secant through x0 = ${num(x0)} and x0 + h = ${num(x0 + h)}`);
}

// --- Slope chart: the difference quotient as a function of h ------------------------

let slope = null;

function drawSlope(m, cur) {
  const box = frame(slopeSvg, MARGIN);
  slope = null;
  if (!box) return;
  const { x0, h, q, d } = cur;
  const H = Math.max(m.width / 4, Math.abs(h) * 1.1);
  const gap = H * 1e-3; // the quotient is undefined at h = 0; stop short of it
  const hs = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = -H + (2 * H * i) / SAMPLES;
    if (Math.abs(t) >= gap) hs.push(t);
    else if (hs.length && Number.isFinite(hs.at(-1))) hs.push(NaN); // break the path at 0
  }
  const qs = hs.map((t) => (Number.isNaN(t) ? NaN : differenceQuotient(m.f, x0, t)));
  const limits = [d.left, d.right].filter((l) => l.kind === 'finite').map((l) => l.value);
  const [yMin, yMax] = robustExtent(qs, ...limits, ...(Number.isFinite(q) ? [q] : []));
  const sx = (t) => MARGIN.left + ((t + H) / (2 * H)) * box.plotW;
  const sy = (y) => MARGIN.top + (1 - (y - yMin) / (yMax - yMin)) * box.plotH;
  const clampY = (px) => Math.max(-10 * box.height, Math.min(11 * box.height, px));
  const ticks = niceTicks(-H, H, 8).ticks.filter((t) => t >= -H && t <= H);
  axes(slopeSvg, box, ticks.map((t) => [t, sx(t)]), yMin, yMax, sy);
  const plot = svgEl('g', { 'clip-path': box.clipUrl }, slopeSvg);

  if (Number.isFinite(d.value)) {
    svgEl('line', { x1: MARGIN.left, x2: MARGIN.left + box.plotW, y1: sy(d.value), y2: sy(d.value), class: 'limit' }, plot);
  }
  svgEl('path', { d: polyline(hs.map((t, i) => [sx(t), sy(qs[i])]), clampY), class: 'slope-curve' }, plot);
  // The limits as open circles at h = 0 (one if both sides agree).
  const holes = Number.isFinite(d.value) ? [d.value] : limits;
  for (const y of holes) svgEl('circle', { cx: sx(0), cy: clampY(sy(y)), r: 5, class: 'hole' }, plot);
  if (Number.isFinite(q)) svgEl('circle', { cx: sx(h), cy: clampY(sy(q)), r: 5, class: 'dot' }, plot);

  slope = { H, plotW: box.plotW, x0 };
  slopeSvg.setAttribute('aria-label', `Secant slope against h at x0 = ${num(x0)}`);
}

// --- Pointer and keyboard -------------------------------------------------------------

function xAt(svg, clientX, lo, width, plotW) {
  const px = clientX - svg.getBoundingClientRect().left;
  return lo + ((px - MARGIN.left) / plotW) * width;
}

let dragging = null; // 'p' (moves x0) or 'q' (moves x0 + h)

mainSvg.addEventListener('pointerdown', (e) => {
  if (!main || model?.error) return;
  stopSweep();
  const { x0, h } = readForm();
  const px = e.clientX - mainSvg.getBoundingClientRect().left;
  dragging = Math.abs(px - main.sx(x0)) < 12 && Math.abs(px - main.sx(x0 + h)) > Math.abs(px - main.sx(x0)) ? 'p' : 'q';
  mainSvg.setPointerCapture(e.pointerId);
  moveTo(e.clientX);
});
mainSvg.addEventListener('pointermove', (e) => {
  if (!main || model?.error) return;
  const x = xAt(mainSvg, e.clientX, model.lo, model.width, main.plotW);
  if (dragging) moveTo(e.clientX);
  setTex($('hover'), `x = ${T(x)} \\quad f(x) = ${T(model.f(x))}`);
});
mainSvg.addEventListener('pointerup', () => (dragging = null));
mainSvg.addEventListener('pointercancel', () => (dragging = null));
mainSvg.addEventListener('pointerleave', () => ($('hover').innerHTML = ''));

function moveTo(clientX) {
  const x = xAt(mainSvg, clientX, model.lo, model.width, main.plotW);
  const { x0, h } = readForm();
  if (dragging === 'p') setState({ x0: x, h });
  else setState({ x0, h: x === x0 ? h : x - x0 });
}

mainSvg.addEventListener('keydown', (e) => {
  if (!main || model?.error || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  e.preventDefault();
  stopSweep();
  const { x0, h } = readForm();
  const step = (model.width / 200) * (e.shiftKey ? 10 : 1) * (e.key === 'ArrowLeft' ? -1 : 1);
  const next = h + step;
  setState({ x0, h: Math.abs(next) < MIN_STEP * model.width ? h : next });
});

slopeSvg.addEventListener('pointermove', (e) => {
  if (!slope || model?.error) return;
  const t = xAt(slopeSvg, e.clientX, -slope.H, 2 * slope.H, slope.plotW);
  setTex($('slopeHover'), `h = ${T(t)} \\quad \\frac{\\Delta f}{h} = ${T(differenceQuotient(model.f, slope.x0, t))}`);
});
slopeSvg.addEventListener('pointerleave', () => ($('slopeHover').innerHTML = ''));
slopeSvg.addEventListener('click', (e) => {
  if (!slope || model?.error) return;
  stopSweep();
  const t = xAt(slopeSvg, e.clientX, -slope.H, 2 * slope.H, slope.plotW);
  if (t !== 0) setState({ x0: slope.x0, h: t });
});
slopeSvg.addEventListener('keydown', (e) => {
  if (!['ArrowLeft', 'ArrowRight'].includes(e.key) || model?.error) return;
  e.preventDefault();
  stopSweep();
  // ←/→ halve or double |h|, keeping its side.
  const { x0, h } = readForm();
  setState({ x0, h: e.key === 'ArrowLeft' ? h / 2 : h * 2 });
});

// --- Explanation ---------------------------------------------------------------------

/** How a one-sided limit reads in prose. */
function describeSide(side, name) {
  switch (side.kind) {
    case 'finite':
      return `from the ${name} the slopes approach \\(${T(side.value, 4)}\\)`;
    case 'infinite':
      return `from the ${name} they grow without bound (towards \\(${side.sign > 0 ? '+' : '-'}\\infty\\))`;
    case 'none':
      return `from the ${name} they keep changing and approach no value`;
    default:
      return `\\(f\\) is undefined just to the ${name} of \\(x_0\\)`;
  }
}

function facts(m, cur) {
  const { x0, h, f0, f1, q, d } = cur;
  const items = [];
  if (Number.isFinite(q)) {
    items.push([
      'Secant slope',
      `The secant through \\((x_0, f(x_0))\\) and \\((x_0 + h, f(x_0 + h))\\) has slope ` +
        `\\(\\frac{f(x_0 + h) - f(x_0)}{h} = \\frac{${T(f1, 5)} ${texSigned(-f0, 5)}}{${T(h, 4)}} = ${T(q, 6)}\\).`,
    ]);
  } else {
    items.push(['Secant slope', `\\(f\\) is undefined at \\(x_0\\) or at \\(x_0 + h\\), so there is no secant.`]);
  }
  if (Number.isFinite(d.value)) {
    items.push([
      `\\(f'(${T(x0, 4)}) = ${T(d.value, 6)}\\)`,
      `As \\(h \\to 0\\) from either side the secant slopes approach one number, the derivative ` +
        `\\(f'(x_0) = \\lim_{h \\to 0} \\frac{f(x_0 + h) - f(x_0)}{h}\\), and the secants turn into the tangent ` +
        `\\(y = ${T(f0, 4)} ${texSigned(d.value, 4)}\\,(x ${texSigned(-x0, 4)})\\).` +
        (Math.abs(d.value) < 1e-9 ? ' Here the tangent is horizontal.' : '') +
        (m.dTex ? ` Differentiating the formula gives \\(f'(x) = ${m.dTex}\\).` : ''),
    ]);
    if (Number.isFinite(q)) {
      const err = q - d.value;
      const errHalf = differenceQuotient(m.f, x0, h / 2) - d.value;
      const ratio = Math.abs(errHalf) > 1e-12 * Math.max(1, Math.abs(d.value)) ? err / errHalf : NaN;
      items.push([
        'How fast',
        `With this \\(h\\) the secant slope is off by \\(${T(err)}\\).` +
          (Number.isFinite(ratio)
            ? ` Halving \\(h\\) divides that error by \\(${T(ratio, 3)}\\): for smooth \\(f\\) the error is about ` +
              `\\(\\frac{f''(x_0)}{2}\\,h\\), so it shrinks in proportion to \\(h\\) (a ratio near 2).`
            : ''),
      ]);
    }
  } else {
    const kinds = [d.left.kind, d.right.kind];
    const corner = kinds.every((k) => k === 'finite');
    const vertical = kinds.includes('infinite');
    items.push([
      `\\(f'(${T(x0, 4)})\\) does not exist`,
      `${describeSide(d.left, 'left')}, and ${describeSide(d.right, 'right')}. ` +
        (corner
          ? 'The two one-sided slopes differ, so the graph has a corner: two half-tangents instead of one tangent.'
          : vertical
            ? 'The tangent is vertical, and a vertical line has no slope.'
            : 'The derivative needs one limit that both sides approach.') +
        (m.dTex ? ` The formula \\(f'(x) = ${m.dTex}\\) holds only where \\(f\\) is differentiable.` : ''),
    ]);
  }
  items.push([
    'Related',
    `The tangent appears again on the <a href="./ftc.html">fundamental theorem</a> page: there the slope of ` +
      `\\(F(x) = \\int_a^x f\\) at \\(b\\) is \\(f(b)\\). The tangent is also the first ` +
      `<a href="./taylor.html">Taylor polynomial</a> \\(T_1\\); higher degrees fit \\(f\\) better near \\(x_0\\).`,
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
  $('status').textContent = m.error ?? '';
  if (m.error) {
    for (const svg of [mainSvg, slopeSvg]) frame(svg, MARGIN);
    main = slope = null;
    $('formula').innerHTML = '';
    document.querySelector('#facts dl').replaceChildren();
    writeHash(raw);
    return;
  }
  const state = clampState(m, raw);
  if (state.x0 !== raw.x0) fields.x0.value = +state.x0.toPrecision(6);
  if (state.h !== raw.h) fields.h.value = +state.h.toPrecision(6);
  Object.assign(x0Slider, { min: m.lo, max: m.hi, step: m.width / 1000 });
  x0Slider.value = state.x0;
  hSlider.value = Math.log10(Math.abs(state.h) / m.width);
  document.querySelector(`input[name=side][value="${state.h < 0 ? -1 : 1}"]`).checked = true;
  const cur = atPoint(m, state);
  setTex($('formula'), `f(x) = ${m.fTex}`);
  drawMain(m, cur);
  drawSlope(m, cur);
  facts(m, cur);
  writeHash({ ...raw, x0: +state.x0.toPrecision(6), h: +state.h.toPrecision(6) });
}

function setState({ x0, h }) {
  if (Number.isFinite(x0)) fields.x0.value = +x0.toPrecision(6);
  if (Number.isFinite(h) && h !== 0) fields.h.value = +h.toPrecision(6);
  update();
}

let sweep = null;
function stopSweep() {
  if (sweep) cancelAnimationFrame(sweep);
  sweep = null;
  $('play').innerHTML = texText('▶ Let \\(h \\to 0\\)');
  $('play').setAttribute('aria-pressed', 'false');
}
$('play').addEventListener('click', () => {
  if (sweep || !main) return stopSweep();
  const { x0, h } = readForm();
  const sign = h < 0 ? -1 : 1;
  // Shrink |h| geometrically from a visible size down to the smallest step.
  const from = Math.max(Math.abs(h), model.width / 2);
  const to = MIN_STEP * model.width;
  const start = performance.now();
  $('play').textContent = '■ Stop';
  $('play').setAttribute('aria-pressed', 'true');
  const tick = (now) => {
    const t = Math.min(1, (now - start) / SWEEP_MS);
    setState({ x0, h: sign * from * (to / from) ** t });
    if (t < 1) sweep = requestAnimationFrame(tick);
    else stopSweep();
  };
  sweep = requestAnimationFrame(tick);
});

let debounce = null;
$('controls').addEventListener('input', (e) => {
  const t = e.target;
  if (t === x0Slider) {
    stopSweep();
    setState({ x0: +x0Slider.value, h: readForm().h });
  } else if (t === hSlider) {
    stopSweep();
    const { x0, h } = readForm();
    setState({ x0, h: (h < 0 ? -1 : 1) * model.width * 10 ** +hSlider.value });
  } else if (t.name === 'side') {
    stopSweep();
    const { x0, h } = readForm();
    setState({ x0, h: Math.abs(h) * +t.value });
  } else if (['expr', 'xMin', 'xMax'].includes(t.id)) {
    $('preset').value = '';
    clearTimeout(debounce);
    debounce = setTimeout(update, 150);
  } else if (t.id === 'preset') {
    const preset = PRESETS[t.value];
    if (!preset) return;
    stopSweep();
    const { label, ...values } = preset;
    writeForm(values);
    update();
  } else {
    stopSweep();
    update();
  }
});
$('controls').addEventListener('submit', (e) => e.preventDefault());

const resize = new ResizeObserver(() => update());
resize.observe(mainSvg);
resize.observe(slopeSvg);

renderStatic();
writeForm(stateFromHash(DEFAULTS));
update();
