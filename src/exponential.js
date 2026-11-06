import { formatNumber as fmt, niceTicks } from './format.js';
import { renderStatic, setTex, texNum as T, texSigned as S, texText } from './tex.js';
import { svgEl, svgTex, frame, axes, polyline, stateFromHash as readHash, writeHash } from './pageUtils.js';
import * as M from './exponentialMath.js';

// Page for discussing f(x) = a·e^(bx + c) + d: sliders for a, b, c, d, a chart with a
// hover tangent, and a list of properties derived from the parameters.

const DEFAULTS = { a: 1, b: 1, c: 0, d: 0, xMin: -4, xMax: 4, yMin: -2, yMax: 8, showRef: true };
const PARAMS = ['a', 'b', 'c', 'd'];
const SAMPLES = 600;
const MARGIN = { top: 12, right: 16, bottom: 26, left: 48 };

const $ = (id) => document.getElementById(id);
const fields = Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, $(k)]));
const sliders = Object.fromEntries(PARAMS.map((p) => [p, $(`${p}Slider`)]));
const svg = document.querySelector('#chart svg');
const hoverOut = $('hover');

// Plain-text numbers for the chart's aria-label: "−2" with a real minus sign;
// signed(v) gives "+ 2" / "− 2" for use after another term.
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


// --- Chart ------------------------------------------------------------------

// The current view, set by draw() and read by the hover code.
let view = null;
let hoverX = null;

function draw() {
  const state = readForm();
  const { a, b, c, d, xMin, xMax, yMin, yMax, showRef } = state;
  const box = frame(svg, MARGIN);
  view = null;
  if (!box || !PARAMS.every((p) => Number.isFinite(state[p])) || !(xMax > xMin) || !(yMax > yMin)) return;

  const p = { a, b, c, d };
  const f = (x) => M.value(p, x);
  const { height, plotW, plotH } = box;
  const sx = (x) => MARGIN.left + ((x - xMin) / (xMax - xMin)) * plotW;
  const sy = (y) => MARGIN.top + (1 - (y - yMin) / (yMax - yMin)) * plotH;
  // Huge values would make the path unreadably long; anything far off-chart is clipped anyway.
  const clampY = (px) => Math.max(-10 * height, Math.min(11 * height, px));
  view = { p, f, a, b, d, xMin, xMax, yMin, yMax, sx, sy, clampY, plotW, plotH };

  const xTicks = niceTicks(xMin, xMax, 8).ticks.filter((t) => t >= xMin && t <= xMax);
  axes(svg, box, xTicks.map((t) => [t, sx(t)]), yMin, yMax, sy);

  const plot = svgEl('g', { 'clip-path': box.clipUrl }, svg);
  const path = (g) => {
    const points = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const x = xMin + ((xMax - xMin) * i) / SAMPLES;
      points.push([sx(x), sy(g(x))]);
    }
    return polyline(points, clampY);
  };
  // y = d is the horizontal asymptote whenever the curve isn't constant.
  const curved = a !== 0 && b !== 0;
  if (curved && yMin <= d && yMax >= d) {
    svgEl('line', { x1: MARGIN.left, x2: MARGIN.left + plotW, y1: sy(d), y2: sy(d), class: 'asymptote' }, plot);
    // Labeled at the end where the curve is far from it.
    const [lx, anchor] = b > 0 ? [MARGIN.left + plotW - 6, 'end'] : [MARGIN.left + 6, 'start'];
    const above = a < 0; // the curve is on the other side
    if (d !== 0) {
      svgTex(plot, lx, sy(d) + (above ? -4 : 4), `y = ${T(d)}`, { anchor, baseline: above ? 'bottom' : 'top', cls: 'asymptote-label' });
    }
  }
  if (showRef) svgEl('path', { d: path(Math.exp), class: 'reference' }, plot);
  svgEl('path', { d: path(f), class: 'curve' }, plot);

  // The zero, where a·e^(bx + c) = −d, if there is one.
  const x0 = M.zero(p);
  if (x0 != null && yMin <= 0 && yMax >= 0) {
    if (x0 >= xMin && x0 <= xMax) {
      svgEl('circle', { cx: sx(x0), cy: sy(0), r: 4, class: 'intercept' }, plot);
      // Below-right of an increasing curve, above-right of a decreasing one, clear of the curve.
      const dy = a * b > 0 ? 16 : -8;
      svgTex(plot, sx(x0) + 8, sy(0) + (dy > 0 ? 4 : -4), `(${T(x0)}, 0)`, { baseline: dy > 0 ? 'top' : 'bottom', cls: 'point-label' });
    }
  }

  // y-intercept f(0) = a·e^c + d.
  if (xMin <= 0 && xMax >= 0) {
    const y0 = M.yIntercept(p);
    if (y0 >= yMin && y0 <= yMax) {
      svgEl('circle', { cx: sx(0), cy: sy(y0), r: 4, class: 'intercept' }, plot);
      svgTex(plot, sx(0) + 8, sy(y0) - 4, `(0, ${T(y0)})`, { cls: 'point-label' });
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
    hoverOut.innerHTML = '';
    return;
  }
  const { p, f, b, d, sx, sy, clampY, xMin, xMax, hover, tangent, subtangent, foot, dot } = view;
  const y = f(x);
  const slope = M.slope(p, x);
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
    const xFoot = M.tangentFoot(p, x);
    line(subtangent, xFoot, d, x, d);
    foot.setAttribute('cx', sx(xFoot));
    foot.setAttribute('cy', clampY(sy(d)));
  }
  setTex(hoverOut, `x = ${T(x)} \\quad f(x) = ${T(y)} \\quad f'(x) = ${T(slope)}`);
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

// Plain-text formula for the chart's aria-label.
function formulaText({ a, b, c, d }) {
  return `f(x) = ${num(a)}·e^(${num(b)}x ${signed(c)}) ${signed(d)}`;
}

// TeX for b·x + c, and for f with the current parameters.
const linear = (b, c) => (c === 0 ? `${T(b)}x` : `${T(b)}x ${S(c)}`);
const fTex = ({ a, b, c, d }) => `${T(a)}\\,e^{${linear(b, c)}}${d === 0 ? '' : ` ${S(d)}`}`;

// [term, explanation] pairs describing f(x) = a·e^(bx + c) + d for the current
// parameters, as prose with \( … \) TeX (see texText).
function properties(p) {
  const { a, b, c, d } = p;
  const A = M.scale(p);
  const plusD = d === 0 ? '' : ` ${S(d)}`;
  if (a === 0) {
    return [[`\\(f(x) = ${T(d)}\\)`, 'With \\(a = 0\\) the function is the constant \\(d\\); \\(b\\) and \\(c\\) have no effect.']];
  }
  const facts = [
    [
      b === 0 ? `\\(f(x) = ${T(A + d)}\\)` : `\\(f(x) = ${T(A)}\\,e^{${T(b)}x}${plusD}\\)`,
      `Since \\(e^{bx + c} = e^c\\,e^{bx}\\), the constant \\(c\\) only rescales: ` +
        `\\(a\\,e^c = ${T(a)} \\cdot ${T(Math.exp(c))} = ${T(A)}\\).`,
    ],
    ['\\(f(0)\\)', `The \\(y\\)-intercept is \\(a\\,e^c + d = ${T(A + d)}\\).`],
  ];
  if (b === 0) {
    facts.push(['Constant', `With \\(b = 0\\), \\(f(x) = ${T(A + d)}\\) for every \\(x\\).`]);
    return facts;
  }
  const shift = M.shift(p);
  const zero = M.zero(p);
  const twice = M.factorTwoDistance(p);
  // The shifts relative to a·e^(bx), as far as there are any.
  const moves = [];
  if (c !== 0) moves.push(`\\(c\\) shifts it ${shift > 0 ? 'right' : 'left'} by \\(\\left|\\frac{c}{b}\\right| = ${T(Math.abs(shift))}\\)`);
  if (d !== 0) moves.push(`\\(d\\) shifts it ${d > 0 ? 'up' : 'down'} by \\(${T(Math.abs(d))}\\)`);
  if (moves.length) {
    facts.push([
      c === 0 ? `\\(f(x) = ${T(a)}\\,e^{${T(b)}x}${plusD}\\)` : `\\(f(x) = ${T(a)}\\,e^{${T(b)}(x ${S(-shift)})}${plusD}\\)`,
      `Compared with \\(${T(a)}\\,e^{${T(b)}x}\\), ${moves.join(', and ')}.`,
    ]);
  }
  facts.push(
    [
      b > 0 ? 'Growth' : 'Decay',
      'The distance \\(|f(x) - d|\\) to the asymptote ' +
        (b > 0
          ? `doubles every \\(\\frac{\\ln 2}{b} = ${T(twice)}\\) units of \\(x\\).`
          : `halves every \\(\\frac{\\ln 2}{|b|} = ${T(twice)}\\) units of \\(x\\) (half-life).`),
    ],
    [
      a * b > 0 ? 'Increasing' : 'Decreasing',
      `\\(f'(x) = b\\,(f(x) - d)\\): the slope is proportional to the height above the asymptote, with factor \\(b = ${T(b)}\\). ` +
        `Each tangent meets the asymptote at \\(x - \\frac{1}{b}\\), always \\(${T(Math.abs(1 / b))}\\) to the ` +
        `${b > 0 ? 'left' : 'right'} of its point of contact; hover the chart to see it.`,
    ],
    [
      `Asymptote \\(y = ${T(d)}\\)`,
      `\\(f(x) \\to ${T(d)}\\) as \\(x \\to ${b > 0 ? '-\\infty' : '+\\infty'}\\), and ` +
        `\\(f(x) \\to ${a > 0 ? '+\\infty' : '-\\infty'}\\) as \\(x \\to ${b > 0 ? '+\\infty' : '-\\infty'}\\).`,
    ],
    ['Range', a > 0 ? `Everything above the asymptote, \\((${T(d)}, \\infty)\\).` : `Everything below the asymptote, \\((-\\infty, ${T(d)})\\).`],
    [
      zero == null ? 'No zeros' : 'One zero',
      zero == null
        ? `The curve stays on the ${a > 0 ? 'upper' : 'lower'} side of \\(y = ${T(d)}\\)` +
          `${d === 0 ? '' : `, which is ${d > 0 ? 'above' : 'below'} the \\(x\\)-axis`}, so it never crosses it.`
        : `\\(a\\,e^{bx + c} = -d\\) at \\(x = \\frac{\\ln(-d/a) - c}{b} = ${T(zero)}\\).`,
    ],
    [a > 0 ? 'Convex' : 'Concave', `\\(f''(x) = b^2\\,(f(x) - d)\\) has the sign of \\(a\\), so the graph curves ${a > 0 ? 'upward' : 'downward'}.`],
    ['Inverse', `\\(x = \\frac{1}{${T(b)}}\\left(\\ln\\frac{y ${S(-d)}}{${T(a)}} ${S(-c)}\\right)\\), for \\(y\\) in the range.`],
  );
  return facts;
}

function update() {
  const state = readForm();
  const valid = PARAMS.every((p) => Number.isFinite(state[p]));
  if (valid) setTex($('formula'), `f(x) = ${fTex(state)}`);
  else $('formula').innerHTML = texText('Enter numbers for \\(a\\), \\(b\\), \\(c\\) and \\(d\\).');
  // Negative parameters get a different slider color.
  for (const p of PARAMS) fields[p].closest('.param').classList.toggle('negative', state[p] < 0);
  const list = document.querySelector('#facts dl');
  list.replaceChildren();
  if (valid) {
    const { a, b, c, d } = state;
    for (const [term, text] of properties({ a, b, c, d })) {
      const dt = document.createElement('dt');
      dt.innerHTML = texText(term);
      const dd = document.createElement('dd');
      dd.innerHTML = texText(text);
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

renderStatic();
writeForm(readHash(DEFAULTS));
update();
