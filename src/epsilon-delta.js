import { compileFunction, constant, expressionToTex } from './expression.js';
import { niceTicks } from './format.js';
import { renderStatic, setTex, texNum as T } from './tex.js';
import { svgEl, svgTex, num, safe, frame, axes, extent, robustExtent, polyline, setFacts, stateFromHash, writeHash } from './pageUtils.js';
import { deviation, largestDelta } from './epsilonDeltaMath.js';

// Page for ε–δ continuity: the learner sets ε (the band around f(x₀)), then
// searches for a δ (the window around x₀) that keeps the graph inside the
// band. Where the graph over the window leaves the band it turns red. The
// largest δ is revealed only on request, after a δ has been tried.

const DEFAULTS = { expr: 'x^2', xMin: '-0.5', xMax: '2.5', x0: 1, eps: 0.5, delta: 0.5 };
const PRESETS = [
  { label: 'x² at 1', expr: 'x^2', xMin: '-0.5', xMax: '2.5', x0: 1, eps: 0.5, delta: 0.5 },
  { label: 'x² at 2: same ε, smaller δ', expr: 'x^2', xMin: '-0.5', xMax: '3', x0: 2, eps: 0.5, delta: 0.5 },
  { label: '√x at 0: only x ≥ 0 counts', expr: 'sqrt(x)', xMin: '-0.5', xMax: '2', x0: 0, eps: 0.5, delta: 0.5 },
  { label: '1/x at 0.5: steep, δ shrinks fast', expr: '1/x', xMin: '0.05', xMax: '2', x0: 0.5, eps: 0.5, delta: 0.3 },
  { label: 'A jump at 1: no δ for ε < 1', expr: 'x < 1 ? x : x + 1', xMin: '-0.5', xMax: '2.5', x0: 1, eps: 0.5, delta: 0.3 },
  { label: 'x·sin(1/x) at 0: wiggles, but continuous', expr: 'x == 0 ? 0 : x sin(1/x)', xMin: '-0.6', xMax: '0.6', x0: 0, eps: 0.1, delta: 0.3 },
  { label: 'sin(1/x) at 0: not continuous', expr: 'x == 0 ? 0 : sin(1/x)', xMin: '-0.6', xMax: '0.6', x0: 0, eps: 0.5, delta: 0.1 },
];
const SAMPLES = 1000; // for the whole graph
const WINDOW_SAMPLES = 600; // for the graph over the window, colored by band
const MARGIN = { top: 12, right: 16, bottom: 26, left: 52 };

const $ = (id) => document.getElementById(id);
const fields = { expr: $('expr'), xMin: $('xMin'), xMax: $('xMax'), x0: $('x0'), eps: $('eps'), delta: $('delta') };
const sliders = { x0: $('x0Slider'), eps: $('epsSlider'), delta: $('deltaSlider') };
const svg = document.querySelector('#chart > svg');

for (const [i, preset] of PRESETS.entries()) $('preset').add(new Option(preset.label, i));

function readForm() {
  return {
    expr: fields.expr.value,
    xMin: fields.xMin.value,
    xMax: fields.xMax.value,
    x0: parseFloat(fields.x0.value),
    eps: parseFloat(fields.eps.value),
    delta: parseFloat(fields.delta.value),
  };
}

function writeForm(state) {
  for (const key of Object.keys(fields)) fields[key].value = state[key];
}

// The learner's search: "Show the largest δ" unlocks once δ has been changed
// since ε, x₀ or f last changed, and the answer hides again when they change.
const search = { key: null, tried: false, shown: false };

function resetSearch(key) {
  if (search.key === key) return;
  Object.assign(search, { key, tried: false, shown: false });
}

// --- Model: f and the view ---------------------------------------------------------------

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
    model = { key, expr, f, lo, hi, width: hi - lo, xs, fs, yRange: robustExtent(fs, 0), fTex: expressionToTex(expr) };
  } catch (err) {
    model = { key, error: err.message };
  }
  return model;
}

function clampState(m, state) {
  const x0 = Number.isFinite(state.x0) ? Math.min(m.hi, Math.max(m.lo, state.x0)) : (m.lo + m.hi) / 2;
  const eps = Number.isFinite(state.eps) && state.eps > 0 ? state.eps : DEFAULTS.eps;
  const delta = Number.isFinite(state.delta) && state.delta > 0 ? Math.min(state.delta, m.width) : m.width / 10;
  return { ...state, x0, eps, delta };
}

/** Everything about the current x₀, ε and δ. */
function analyse(m, { x0, eps, delta }) {
  const y0 = m.f(x0);
  if (Number.isNaN(y0)) return { x0, eps, delta, undefinedAt: true };
  const dev = deviation(m.f, x0, delta);
  return { x0, eps, delta, y0, dev, works: dev.max < eps };
}

// --- Chart -------------------------------------------------------------------------------

let view = null; // the current mapping, read by the pointer code

function draw(m, cur, answer) {
  const box = frame(svg, MARGIN);
  view = null;
  if (!box) return;
  const { x0, eps, delta, y0 } = cur;
  let [yMin, yMax] = m.yRange;
  if (Number.isFinite(y0)) [yMin, yMax] = extent([yMin, yMax], y0 - eps, y0 + eps);
  const sx = (x) => MARGIN.left + ((x - m.lo) / m.width) * box.plotW;
  const sy = (y) => MARGIN.top + (1 - (y - yMin) / (yMax - yMin)) * box.plotH;
  const clampY = (px) => Math.max(-10 * box.height, Math.min(11 * box.height, px));
  const ticks = niceTicks(m.lo, m.hi, 8).ticks.filter((t) => t >= m.lo && t <= m.hi);
  axes(svg, box, ticks.map((t) => [t, sx(t)]), yMin, yMax, sy);
  const plot = svgEl('g', { 'clip-path': box.clipUrl }, svg);
  const top = MARGIN.top;
  const bottom = MARGIN.top + box.plotH;
  const left = MARGIN.left;
  const right = MARGIN.left + box.plotW;

  // Window x₀ ± δ (behind everything), then the band f(x₀) ± ε.
  const wl = sx(x0 - delta);
  const wr = sx(x0 + delta);
  svgEl('rect', { x: wl, width: Math.max(1, wr - wl), y: top, height: box.plotH, class: 'window' }, plot);
  if (!cur.undefinedAt) {
    const bt = sy(y0 + eps);
    const bb = sy(y0 - eps);
    svgEl('rect', { x: left, width: box.plotW, y: bt, height: Math.max(1, bb - bt), class: 'band' }, plot);
    for (const y of [bt, bb]) svgEl('line', { x1: left, x2: right, y1: y, y2: y, class: 'band-edge' }, plot);
    svgTex(plot, left + 4, bt - 2, 'f(x_0) + \\varepsilon', { cls: 'band-label' });
  }
  for (const x of [wl, wr]) svgEl('line', { x1: x, x2: x, y1: top, y2: bottom, class: 'window-edge' }, plot);
  svgTex(plot, wr + 4, top + 2, 'x_0 + \\delta', { baseline: 'top', cls: 'window-label' });

  // The whole graph, thin; over the window, thick and colored by the band.
  svgEl('path', { d: polyline(m.xs.map((x, i) => [sx(x), sy(m.fs[i])]), clampY), class: 'curve' }, plot);
  if (!cur.undefinedAt) {
    let points = { ok: [], bad: [] };
    let d = { ok: '', bad: '' };
    let prev = null;
    const flush = () => {
      for (const k of ['ok', 'bad']) {
        if (points[k].length) d[k] += polyline(points[k], clampY);
        points[k] = [];
      }
    };
    for (let i = 0; i <= WINDOW_SAMPLES; i++) {
      const x = x0 - delta + (2 * delta * i) / WINDOW_SAMPLES;
      const y = m.f(x);
      if (!Number.isFinite(y)) {
        flush();
        prev = null;
        continue;
      }
      const kind = Math.abs(y - y0) < eps ? 'ok' : 'bad';
      if (prev && prev.kind !== kind) {
        // Continue the old run to this point so the two colors meet.
        points[prev.kind].push([sx(x), sy(y)]);
        flush();
        points[kind].push([sx(prev.x), sy(prev.y)]);
      }
      points[kind].push([sx(x), sy(y)]);
      prev = { x, y, kind };
    }
    flush();
    for (const k of ['ok', 'bad']) if (d[k]) svgEl('path', { d: d[k], class: k }, plot);

    if (!cur.works && Number.isFinite(cur.dev.max)) {
      const { at } = cur.dev;
      const fy = m.f(at);
      svgEl('line', { x1: sx(at), x2: sx(at), y1: clampY(sy(y0)), y2: clampY(sy(fy)), class: 'worst' }, plot);
      svgEl('circle', { cx: sx(at), cy: clampY(sy(fy)), r: 4.5, class: 'worst-dot' }, plot);
    }
    svgEl('circle', { cx: sx(x0), cy: sy(y0), r: 5, class: 'point-p' }, plot);
  }

  if (answer && !answer.undefinedAt) {
    for (const x of [sx(x0 - answer.delta), sx(x0 + answer.delta)]) {
      svgEl('line', { x1: x, x2: x, y1: top, y2: bottom, class: 'answer-edge' }, plot);
    }
    svgTex(plot, sx(x0 - answer.delta) - 4, bottom - 2, '\\delta_{\\max}', { anchor: 'end', cls: 'answer-label' });
  }

  view = { box, sx, sy };
  svg.setAttribute(
    'aria-label',
    `Graph of f with the band f(x0) ± ${num(eps)} and the window ${num(x0)} ± ${num(delta)}; ` + (cur.works ? 'the graph stays in the band' : 'the graph leaves the band'),
  );
}

// --- Pointer and keyboard -------------------------------------------------------------

function xAt(e) {
  const px = e.clientX - svg.getBoundingClientRect().left;
  return model.lo + ((px - MARGIN.left) / view.box.plotW) * model.width;
}

let dragging = false;

svg.addEventListener('pointerdown', (e) => {
  if (!view || model?.error) return;
  dragging = true;
  svg.setPointerCapture(e.pointerId);
  setDelta(Math.abs(xAt(e) - readForm().x0));
});
svg.addEventListener('pointermove', (e) => {
  if (!view || model?.error) return;
  const x = xAt(e);
  if (dragging) setDelta(Math.abs(x - readForm().x0));
  const y = model.f(x);
  const y0 = model.f(readForm().x0);
  const away = Number.isFinite(y0) && Number.isFinite(y) ? `\\quad |f(x) - f(x_0)| = ${T(Math.abs(y - y0), 3)}` : '';
  setTex($('hover'), `x = ${T(x)} \\quad f(x) = ${T(y)}${away}`);
});
svg.addEventListener('pointerup', () => (dragging = false));
svg.addEventListener('pointercancel', () => (dragging = false));
svg.addEventListener('pointerleave', () => ($('hover').innerHTML = ''));
svg.addEventListener('keydown', (e) => {
  if (!view || model?.error || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  e.preventDefault();
  const factor = (e.shiftKey ? 1.25 : 1.03) ** (e.key === 'ArrowLeft' ? -1 : 1);
  setDelta(readForm().delta * factor);
  const { delta } = readForm();
  setTex($('hover'), `\\delta = ${T(delta, 4)}`);
});

// --- Explanation ---------------------------------------------------------------------

function facts(m, cur, answer) {
  const items = [];
  const { x0, eps, delta } = cur;
  const e = T(eps, 3);
  const d = T(delta, 4);
  items.push([
    'The definition',
    '\\(f\\) is continuous at \\(x_0\\) when for every \\(\\varepsilon > 0\\) there is a \\(\\delta > 0\\) such that ' +
      '\\(|f(x) - f(x_0)| < \\varepsilon\\) for every \\(x\\) with \\(|x - x_0| < \\delta\\). ' +
      'In the picture: over the vertical strip (the window), the graph must stay inside the horizontal strip (the band).',
  ]);
  if (cur.undefinedAt) {
    items.push(['No \\(f(x_0)\\)', `\\(f\\) is not defined at \\(x_0 = ${T(x0, 4)}\\), so there is no band to stay in: continuity at \\(x_0\\) needs \\(f(x_0)\\) to exist.`]);
  } else {
    const { dev, y0 } = cur;
    items.push([
      `Your \\(\\delta = ${d}\\)`,
      cur.works
        ? `works: for \\(|x - ${T(x0, 4)}| < ${d}\\) the graph stays within \\(${e}\\) of \\(f(x_0) = ${T(y0, 4)}\\) (it gets at most \\(${T(dev.max, 3)}\\) away). Every smaller \\(\\delta\\) works too.`
        : `fails: at \\(x = ${T(dev.at, 5)}\\) the graph is \\(${T(dev.max, 3)}\\) away from \\(f(x_0) = ${T(y0, 4)}\\), more than \\(\\varepsilon = ${e}\\) (the red part). Shrink \\(\\delta\\).`,
    ]);
    if (dev.skipped) {
      items.push(['Domain', 'Part of the window lies outside the domain of \\(f\\); only the \\(x\\) where \\(f(x)\\) exists count.']);
    }
    if (answer) {
      const small = answer.delta < 1e-9 * Math.max(1, Math.abs(x0));
      items.push([
        'The largest \\(\\delta\\)',
        small
          ? `No \\(\\delta\\) works for \\(\\varepsilon = ${e}\\): arbitrarily close to \\(x_0\\) the graph is at least \\(\\varepsilon\\) away from \\(f(x_0)\\). So \\(f\\) is not continuous at \\(x_0\\): one failing \\(\\varepsilon\\) is enough.`
          : answer.at === null
            ? `Every \\(\\delta\\) up to the size of the view works for \\(\\varepsilon = ${e}\\).`
            : `\\(\\delta_{\\max} = ${T(answer.delta, 5)}\\): at \\(x = ${T(answer.at, 5)}\\) the graph reaches the edge of the band. ` +
              'Shrink \\(\\varepsilon\\) and the window has to shrink with it; continuity means a window exists for every \\(\\varepsilon\\), however small.',
      ]);
    } else {
      items.push([
        'Your turn',
        search.tried
          ? 'Compare with the largest \\(\\delta\\) that works: press "Show the largest \\(\\delta\\)".'
          : 'Drag the window\'s edge (or use the \\(\\delta\\) slider) until no part of the graph over the window is red. Then you can compare with the largest \\(\\delta\\).',
      ]);
    }
  }
  items.push([
    'Related',
    'The same quantifiers for sequences: <a href="./sequences.html">sequences and convergence</a>, where you find an \\(N\\) for each \\(\\varepsilon\\).',
  ]);
  setFacts(items);
}

// --- Update and wiring -----------------------------------------------------------------

let current = null;

function update() {
  const raw = readForm();
  const m = getModel(raw);
  if (m.error) {
    $('status').textContent = m.error;
    frame(svg, MARGIN);
    view = current = null;
    $('formula').innerHTML = '';
    setFacts([]);
    writeHash(raw);
    return;
  }
  const state = clampState(m, raw);
  for (const key of ['x0', 'eps', 'delta']) if (state[key] !== raw[key]) fields[key].value = +state[key].toPrecision(6);
  Object.assign(sliders.x0, { min: m.lo, max: m.hi, step: m.width / 1000 });
  sliders.x0.value = state.x0;
  sliders.eps.value = Math.log10(state.eps);
  Object.assign(sliders.delta, { min: Math.log10(m.width) - 5, max: Math.log10(m.width) });
  sliders.delta.value = Math.log10(state.delta);
  resetSearch(JSON.stringify([m.key, state.x0, state.eps]));
  const cur = analyse(m, state);
  current = cur;
  const answer = search.shown && !cur.undefinedAt ? largestDelta(m.f, state.x0, state.eps, m.width) : null;
  $('answer').disabled = !search.tried || cur.undefinedAt;
  $('answer').setAttribute('aria-pressed', String(search.shown));
  $('status').textContent = '';
  setTex($('formula'), `f(x) = ${m.fTex}`);
  draw(m, cur, answer);
  facts(m, cur, answer);
  writeHash({ ...raw, x0: +state.x0.toPrecision(6), eps: +state.eps.toPrecision(4), delta: +state.delta.toPrecision(4) });
}

/** A δ from the learner: counts as trying. */
function setDelta(delta) {
  if (!(delta > 0)) return;
  fields.delta.value = +delta.toPrecision(4);
  search.tried = true;
  update();
}

$('answer').addEventListener('click', () => {
  search.shown = !search.shown;
  update();
});

$('zoom').addEventListener('click', () => {
  if (!current || model?.error) return;
  const { x0, delta } = current;
  fields.xMin.value = +(x0 - 3 * delta).toPrecision(4);
  fields.xMax.value = +(x0 + 3 * delta).toPrecision(4);
  $('preset').value = '';
  update();
});

let debounce = null;
$('controls').addEventListener('input', (e) => {
  const t = e.target;
  if (t === sliders.x0) {
    fields.x0.value = +(+t.value).toPrecision(6);
    update();
  } else if (t === sliders.eps) {
    fields.eps.value = +(10 ** +t.value).toPrecision(3);
    update();
  } else if (t === sliders.delta || t === fields.delta) {
    if (t === sliders.delta) fields.delta.value = +(10 ** +t.value).toPrecision(3);
    search.tried = true;
    update();
  } else if (['expr', 'xMin', 'xMax'].includes(t.id)) {
    $('preset').value = '';
    clearTimeout(debounce);
    debounce = setTimeout(update, 150);
  } else if (t.id === 'preset') {
    const preset = PRESETS[t.value];
    if (!preset) return;
    const { label, ...values } = preset;
    writeForm(values);
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
