import { formatNumber as fmt, niceTicks } from './format.js';

// Page for discussing f(x) = a·e^(bx + c) + d: sliders for a, b, c, d, a chart with a
// hover tangent, and a list of properties derived from the parameters.

const DEFAULTS = { a: 1, b: 1, c: 0, d: 0, xMin: -4, xMax: 4, yMin: -2, yMax: 8, showRef: true };
const PARAMS = ['a', 'b', 'c', 'd'];
const SAMPLES = 600;
const MARGIN = { top: 12, right: 16, bottom: 26, left: 48 };
const NS = 'http://www.w3.org/2000/svg';

const $ = (id) => document.getElementById(id);
const fields = Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, $(k)]));
const sliders = Object.fromEntries(PARAMS.map((p) => [p, $(`${p}Slider`)]));
const svg = document.querySelector('#chart svg');
const hoverOut = $('hover');

const svgEl = (tag, attrs = {}, parent) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  parent?.appendChild(el);
  return el;
};

// "−2" with a real minus sign; signed(v) gives "+ 2" / "− 2" for use after another term.
const num = (v) => fmt(v).replace('-', '−');
const signed = (v) => `${v < 0 ? '−' : '+'} ${fmt(Math.abs(v))}`;

// --- State <-> form <-> URL hash -------------------------------------------

function readForm() {
  const state = {};
  for (const [key, el] of Object.entries(fields)) {
    state[key] = el.type === 'checkbox' ? el.checked : parseFloat(el.value);
  }
  return state;
}

function writeForm(state) {
  for (const [key, el] of Object.entries(fields)) {
    if (el.type === 'checkbox') el.checked = state[key];
    else el.value = state[key];
  }
  for (const p of PARAMS) sliders[p].value = state[p];
}

function stateFromHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const state = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS)) {
    if (!params.has(key)) continue;
    const raw = params.get(key);
    if (typeof DEFAULTS[key] === 'boolean') state[key] = raw === '1';
    else state[key] = Number.isFinite(+raw) ? +raw : DEFAULTS[key];
  }
  return state;
}

function writeHash(state) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(state)) {
    params.set(key, typeof value === 'boolean' ? (value ? '1' : '0') : String(value));
  }
  history.replaceState(null, '', '#' + params);
}

// --- Chart ------------------------------------------------------------------

// The current view, set by draw() and read by the hover code.
let view = null;
let hoverX = null;

function draw() {
  const state = readForm();
  const { a, b, c, d, xMin, xMax, yMin, yMax, showRef } = state;
  const width = svg.clientWidth;
  const height = svg.clientHeight;
  svg.replaceChildren();
  view = null;
  if (!width || !height || !PARAMS.every((p) => Number.isFinite(state[p])) || !(xMax > xMin) || !(yMax > yMin)) return;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const f = (x) => a * Math.exp(b * x + c) + d;
  const plotW = width - MARGIN.left - MARGIN.right;
  const plotH = height - MARGIN.top - MARGIN.bottom;
  const sx = (x) => MARGIN.left + ((x - xMin) / (xMax - xMin)) * plotW;
  const sy = (y) => MARGIN.top + (1 - (y - yMin) / (yMax - yMin)) * plotH;
  // Huge values would make the path unreadably long; anything far off-chart is clipped anyway.
  const clampY = (px) => Math.max(-10 * height, Math.min(11 * height, px));
  view = { f, a, b, d, xMin, xMax, yMin, yMax, sx, sy, clampY, plotW, plotH };

  const clip = svgEl('clipPath', { id: 'plotArea' }, svgEl('defs', {}, svg));
  svgEl('rect', { x: MARGIN.left, y: MARGIN.top, width: plotW, height: plotH }, clip);

  const grid = svgEl('g', { class: 'grid' }, svg);
  const labels = svgEl('g', { class: 'tick-labels' }, svg);
  const inRange = (lo, hi) => (t) => t >= lo && t <= hi;
  for (const t of niceTicks(yMin, yMax, 6).ticks.filter(inRange(yMin, yMax))) {
    svgEl('line', { x1: MARGIN.left, x2: width - MARGIN.right, y1: sy(t), y2: sy(t), class: t === 0 ? 'zero' : '' }, grid);
    svgEl('text', { x: MARGIN.left - 6, y: sy(t), 'text-anchor': 'end', 'dominant-baseline': 'middle' }, labels).textContent = fmt(t, 3);
  }
  for (const t of niceTicks(xMin, xMax, 8).ticks.filter(inRange(xMin, xMax))) {
    svgEl('line', { x1: sx(t), x2: sx(t), y1: MARGIN.top, y2: MARGIN.top + plotH, class: t === 0 ? 'zero' : '' }, grid);
    svgEl('text', { x: sx(t), y: height - 8, 'text-anchor': 'middle' }, labels).textContent = fmt(t, 3);
  }

  const plot = svgEl('g', { 'clip-path': 'url(#plotArea)' }, svg);
  const path = (g) => {
    let d = '';
    for (let i = 0; i <= SAMPLES; i++) {
      const x = xMin + ((xMax - xMin) * i) / SAMPLES;
      d += `${i ? 'L' : 'M'}${sx(x).toFixed(1)},${clampY(sy(g(x))).toFixed(1)}`;
    }
    return d;
  };
  // y = d is the horizontal asymptote whenever the curve isn't constant.
  const curved = a !== 0 && b !== 0;
  if (curved && yMin <= d && yMax >= d) {
    svgEl('line', { x1: MARGIN.left, x2: MARGIN.left + plotW, y1: sy(d), y2: sy(d), class: 'asymptote' }, plot);
    // Labeled at the end where the curve is far from it.
    const [lx, anchor] = b > 0 ? [MARGIN.left + plotW - 6, 'end'] : [MARGIN.left + 6, 'start'];
    const above = a < 0; // the curve is on the other side
    if (d !== 0) {
      svgEl('text', { x: lx, y: sy(d) + (above ? -6 : 14), 'text-anchor': anchor, class: 'asymptote-label' }, plot)
        .textContent = `y = ${num(d)}`;
    }
  }
  if (showRef) svgEl('path', { d: path(Math.exp), class: 'reference' }, plot);
  svgEl('path', { d: path(f), class: 'curve' }, plot);

  // The zero, where a·e^(bx + c) = −d, if there is one.
  if (curved && -d / a > 0 && yMin <= 0 && yMax >= 0) {
    const x0 = (Math.log(-d / a) - c) / b;
    if (x0 >= xMin && x0 <= xMax) {
      svgEl('circle', { cx: sx(x0), cy: sy(0), r: 4, class: 'intercept' }, plot);
      // Below-right of an increasing curve, above-right of a decreasing one, clear of the curve.
      const dy = a * b > 0 ? 16 : -8;
      svgEl('text', { x: sx(x0) + 8, y: sy(0) + dy, class: 'point-label' }, plot).textContent = `(${num(x0)}, 0)`;
    }
  }

  // y-intercept f(0) = a·e^c + d.
  if (xMin <= 0 && xMax >= 0) {
    const y0 = f(0);
    if (y0 >= yMin && y0 <= yMax) {
      svgEl('circle', { cx: sx(0), cy: sy(y0), r: 4, class: 'intercept' }, plot);
      svgEl('text', { x: sx(0) + 8, y: sy(y0) - 8, class: 'point-label' }, plot).textContent = `(0, ${num(y0)})`;
    }
  }

  view.hover = svgEl('g', { class: 'hover', visibility: 'hidden' }, plot);
  view.tangent = svgEl('line', { class: 'tangent' }, view.hover);
  view.subtangent = svgEl('line', { class: 'subtangent' }, view.hover);
  view.foot = svgEl('circle', { r: 3, class: 'foot' }, view.hover);
  view.dot = svgEl('circle', { r: 4.5, class: 'dot' }, view.hover);

  svg.setAttribute('aria-label', `Graph of ${formulaText(state)} for x from ${fmt(xMin)} to ${fmt(xMax)}`);
  showHover(hoverX);
}

// Crosshair at x: the point, its tangent line (slope f′ = b·(f − d)) and, for b ≠ 0,
// where that tangent crosses the asymptote y = d, always 1/b to the left of x.
function showHover(x) {
  hoverX = x;
  if (!view?.hover || x == null || x < view.xMin || x > view.xMax) {
    view?.hover?.setAttribute('visibility', 'hidden');
    hoverOut.textContent = '';
    return;
  }
  const { f, b, d, sx, sy, clampY, xMin, xMax, hover, tangent, subtangent, foot, dot } = view;
  const y = f(x);
  const slope = b * (y - d);
  hover.setAttribute('visibility', 'visible');
  const line = (el, x1, y1, x2, y2) => {
    el.setAttribute('x1', sx(x1));
    el.setAttribute('y1', clampY(sy(y1)));
    el.setAttribute('x2', sx(x2));
    el.setAttribute('y2', clampY(sy(y2)));
  };
  line(tangent, xMin, y + slope * (xMin - x), xMax, y + slope * (xMax - x));
  dot.setAttribute('cx', sx(x));
  dot.setAttribute('cy', clampY(sy(y)));
  const crosses = b !== 0 && y !== d;
  for (const el of [subtangent, foot]) el.setAttribute('visibility', crosses ? 'visible' : 'hidden');
  if (crosses) {
    line(subtangent, x - 1 / b, d, x, d);
    foot.setAttribute('cx', sx(x - 1 / b));
    foot.setAttribute('cy', clampY(sy(d)));
  }
  hoverOut.textContent = `x ${fmt(x)}   f ${fmt(y)}   f′ ${fmt(slope)}`;
}

svg.addEventListener('pointermove', (e) => {
  if (!view) return;
  const px = e.clientX - svg.getBoundingClientRect().left;
  showHover(view.xMin + ((px - MARGIN.left) / view.plotW) * (view.xMax - view.xMin));
});
svg.addEventListener('pointerleave', () => showHover(null));
svg.addEventListener('blur', () => showHover(null));
svg.addEventListener('keydown', (e) => {
  if (!view || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  e.preventDefault();
  const step = ((view.xMax - view.xMin) / 100) * (e.shiftKey ? 5 : 1) * (e.key === 'ArrowLeft' ? -1 : 1);
  const x = hoverX ?? (view.xMin + view.xMax) / 2;
  showHover(Math.min(view.xMax, Math.max(view.xMin, x + step)));
});
new ResizeObserver(draw).observe(svg);

// --- Formula and properties -------------------------------------------------

function formulaText({ a, b, c, d }) {
  return `f(x) = ${num(a)}·e^(${num(b)}x ${signed(c)}) ${signed(d)}`;
}

const sup = (s) => `<sup>${s}</sup>`;
const linear = (b, c) => (c === 0 ? `${num(b)}x` : `${num(b)}x ${signed(c)}`);

// [term, explanation] pairs describing f(x) = a·e^(bx + c) for the current parameters.
function properties({ a, b, c, d }) {
  const A = a * Math.exp(c);
  const plusD = d === 0 ? '' : ` ${signed(d)}`;
  if (a === 0) return [[`f(x) = ${num(d)}`, 'With a = 0 the function is the constant d; b and c have no effect.']];
  const facts = [
    [
      b === 0 ? `f(x) = ${num(A + d)}` : `f(x) = ${num(A)}·e${sup(`${num(b)}x`)}${plusD}`,
      `Since e${sup('bx + c')} = e${sup('c')}·e${sup('bx')}, the constant c only rescales: ` +
        `a·e${sup('c')} = ${num(a)}·${num(Math.exp(c))} = ${num(A)}.`,
    ],
    ['f(0)', `The y-intercept is a·e${sup('c')} + d = ${num(A + d)}.`],
  ];
  if (b === 0) {
    facts.push(['Constant', `With b = 0, f(x) = ${num(A + d)} for every x.`]);
    return facts;
  }
  const shift = -c / b;
  const zero = -d / a > 0 ? (Math.log(-d / a) - c) / b : null;
  // The shifts relative to a·e^(bx), as far as there are any.
  const moves = [];
  if (c !== 0) moves.push(`c shifts it ${shift > 0 ? 'right' : 'left'} by |−c/b| = ${fmt(Math.abs(shift))}`);
  if (d !== 0) moves.push(`d shifts it ${d > 0 ? 'up' : 'down'} by ${fmt(Math.abs(d))}`);
  if (moves.length) {
    facts.push([
      c === 0 ? `f(x) = ${num(a)}·e${sup(`${num(b)}x`)}${plusD}` : `f(x) = ${num(a)}·e${sup(`${num(b)}(x ${signed(-shift)})`)}${plusD}`,
      `Compared with ${num(a)}·e${sup(`${num(b)}x`)}, ${moves.join(', and ')}.`,
    ]);
  }
  facts.push(
    [
      b > 0 ? 'Growth' : 'Decay',
      `The distance |f(x) − d| to the asymptote ` +
        (b > 0
          ? `doubles every ln 2 / b = ${fmt(Math.LN2 / b)} units of x.`
          : `halves every ln 2 / |b| = ${fmt(Math.LN2 / -b)} units of x (half-life).`),
    ],
    [
      a * b > 0 ? 'Increasing' : 'Decreasing',
      `f′(x) = b·(f(x) − d): the slope is proportional to the height above the asymptote, with factor b = ${num(b)}. ` +
        `Each tangent meets the asymptote at x − 1/b, always ${fmt(Math.abs(1 / b))} to the ` +
        `${b > 0 ? 'left' : 'right'} of its point of contact; hover the chart to see it.`,
    ],
    [
      `Asymptote y = ${num(d)}`,
      `f(x) → ${num(d)} as x → ${b > 0 ? '−∞' : '+∞'}, and f(x) → ${a > 0 ? '+∞' : '−∞'} as x → ${b > 0 ? '+∞' : '−∞'}.`,
    ],
    ['Range', a > 0 ? `Everything above the asymptote, (${num(d)}, ∞).` : `Everything below the asymptote, (−∞, ${num(d)}).`],
    [
      zero == null ? 'No zeros' : 'One zero',
      zero == null
        ? `The curve stays on the ${a > 0 ? 'upper' : 'lower'} side of y = ${num(d)}${d === 0 ? '' : `, which is ${d > 0 ? 'above' : 'below'} the x-axis`}, so it never crosses it.`
        : `a·e${sup('bx + c')} = −d at x = (ln(−d / a) ${signed(-c)}) / b = ${num(zero)}.`,
    ],
    [a > 0 ? 'Convex' : 'Concave', `f″(x) = b²·(f(x) − d) has the sign of a, so the graph curves ${a > 0 ? 'upward' : 'downward'}.`],
    ['Inverse', `x = (ln((y ${signed(-d)}) / ${num(a)}) ${signed(-c)}) / ${num(b)}, for y in the range.`],
  );
  return facts;
}

function update() {
  const state = readForm();
  const valid = PARAMS.every((p) => Number.isFinite(state[p]));
  $('formula').innerHTML = valid
    ? `f(x) = ${num(state.a)}·e${sup(linear(state.b, state.c))}${state.d === 0 ? '' : ` ${signed(state.d)}`}`
    : 'Enter numbers for a, b, c and d.';
  // Negative parameters get a different slider color.
  for (const p of PARAMS) fields[p].closest('.param').classList.toggle('negative', state[p] < 0);
  const list = document.querySelector('#facts dl');
  list.replaceChildren();
  if (valid) {
    for (const [term, text] of properties(state)) {
      const dt = document.createElement('dt');
      dt.innerHTML = term;
      const dd = document.createElement('dd');
      dd.innerHTML = text;
      list.append(dt, dd);
    }
  }
  draw();
  writeHash(state);
}

// --- Wiring -----------------------------------------------------------------

// For each parameter the number field is the source of truth; the slider drives it.
$('controls').addEventListener('input', (e) => {
  const p = PARAMS.find((p) => e.target === sliders[p]);
  if (p) fields[p].value = +(+sliders[p].value).toFixed(2);
  else if (PARAMS.includes(e.target.id)) sliders[e.target.id].value = e.target.value;
  update();
});
$('controls').addEventListener('submit', (e) => e.preventDefault());
$('reset').addEventListener('click', () => {
  writeForm(DEFAULTS);
  update();
});

writeForm(stateFromHash());
update();
