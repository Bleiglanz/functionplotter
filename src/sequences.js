import { compileFunction, constant, expressionToTex } from './expression.js';
import { niceTicks } from './format.js';
import { renderStatic, setTex, texNum as T, texText } from './tex.js';
import { svgEl, svgTex, num, safe, frame, axes, extent, setFacts, stateFromHash, writeHash } from './pageUtils.js';
import { terms, estimateLimit, tailDeviations, firstIndex } from './sequencesMath.js';

// Page for convergent sequences: the terms aₙ as dots with the band L ± ε,
// and the index N(ε) from which every term stays inside it; below, how N(ε)
// grows as ε shrinks.

const DEFAULTS = { expr: '1 + 2*(-1)^n/n', L: '', eps: 0.25, nMax: 40 };
const PRESETS = [
  { label: '1 + 2(−1)ⁿ/n → 1, from both sides', expr: '1 + 2*(-1)^n/n', L: '', eps: 0.25, nMax: 40 },
  { label: '1/n → 0', expr: '1/n', L: '', eps: 0.1, nMax: 40 },
  { label: '(1 + 1/n)ⁿ → e', expr: '(1 + 1/n)^n', L: '', eps: 0.05, nMax: 80 },
  { label: '0.8ⁿ → 0: N grows slowly', expr: '0.8^n', L: '', eps: 0.01, nMax: 40 },
  { label: 'sin(n)/n → 0, irregularly', expr: 'sin(n)/n', L: '', eps: 0.05, nMax: 80 },
  { label: '(2n² + 1)/(n² + 5n) → 2', expr: '(2n^2 + 1)/(n^2 + 5n)', L: '', eps: 0.2, nMax: 80 },
  { label: '1/ln(n + 1) → 0: N grows fast', expr: '1/log(n + 1)', L: '0', eps: 0.25, nMax: 100 },
  { label: '(−1)ⁿ: no limit', expr: '(-1)^n', L: '', eps: 0.5, nMax: 30 },
  { label: '1/n with the wrong L = 0.1', expr: '1/n', L: '0.1', eps: 0.05, nMax: 40 },
];
const STORED = 20000; // terms kept for N(ε); further out only probes (see tailDeviations)
const N_MAX = 2000; // most terms drawn
const EPS_LOG = [-4, 1]; // ε slider range, as log₁₀ ε
const EPS_CURVE = 241; // ε values in the N(ε) chart
const SHRINK_FACTOR = 0.97; // per frame of "Shrink ε"
const MARGIN = { top: 12, right: 16, bottom: 26, left: 52 };

const $ = (id) => document.getElementById(id);
const fields = { expr: $('expr'), L: $('L'), eps: $('eps'), nMax: $('nMax') };
const epsSlider = $('epsSlider');
const nMaxSlider = $('nMaxSlider');
const mainSvg = document.querySelector('#chart > svg');
const nSvg = document.querySelector('#nChart > svg');

for (const [i, preset] of PRESETS.entries()) $('preset').add(new Option(preset.label, i));

function readForm() {
  return { expr: fields.expr.value, L: fields.L.value, eps: parseFloat(fields.eps.value), nMax: parseFloat(fields.nMax.value) };
}

function writeForm(state) {
  for (const key of Object.keys(fields)) fields[key].value = state[key];
}

// --- Model: everything that depends on the sequence and L, not on ε or the view ---

let model = null;

function getModel({ expr, L }) {
  const key = JSON.stringify([expr, L]);
  if (model?.key === key) return model;
  try {
    const compiled = compileFunction(expr, ['n']);
    const a = (n) => safe(compiled, n);
    const values = terms(a, STORED);
    const typed = L.trim() !== '';
    let limit = null; // the L the band is drawn around, or null
    let estimate = null;
    if (typed) {
      limit = constant(L, 'Limit');
      if (!Number.isFinite(limit)) throw new Error('Limit: enter a finite number, or leave it empty.');
    } else {
      estimate = estimateLimit(a);
      if ('limit' in estimate) limit = estimate.limit;
    }
    const dev = limit === null ? null : tailDeviations(values, limit, a);
    // N(ε) over the slider's whole range, for the lower chart.
    const curve = dev
      ? Array.from({ length: EPS_CURVE }, (_, i) => {
          const logEps = EPS_LOG[0] + ((EPS_LOG[1] - EPS_LOG[0]) * i) / (EPS_CURVE - 1);
          return { logEps, ...firstIndex(dev, 10 ** logEps) };
        })
      : null;
    model = { key, expr, a, values, typed, limit, estimate, dev, curve, aTex: expressionToTex(expr) };
  } catch (err) {
    model = { key, error: err.message };
  }
  return model;
}

function clampState(state) {
  const eps = Number.isFinite(state.eps) && state.eps > 0 ? state.eps : DEFAULTS.eps;
  const nMax = Number.isFinite(state.nMax) ? Math.min(N_MAX, Math.max(5, Math.round(state.nMax))) : DEFAULTS.nMax;
  return { ...state, eps, nMax };
}

// --- Main chart: the terms and the band ------------------------------------------

let main = null; // the current mapping, read by the pointer code
let cursor = null; // the term picked by hover or ←/→ (an n), or null

function drawMain(m, { eps, nMax }, found) {
  const box = frame(mainSvg, MARGIN);
  main = null;
  if (!box) return;
  const shown = m.values.slice(0, nMax);
  const extra = m.limit === null ? [] : [m.limit - Math.min(eps, 1e3), m.limit + Math.min(eps, 1e3)];
  let [yMin, yMax] = extent(shown, ...(m.limit === null ? [0] : [m.limit]));
  // Keep the band in view unless it is far wider than the terms.
  if (extra.length && eps < 2 * (yMax - yMin)) [yMin, yMax] = extent(shown, ...extra);
  const sx = (n) => MARGIN.left + ((n - 0.5) / nMax) * box.plotW;
  const sy = (y) => MARGIN.top + (1 - (y - yMin) / (yMax - yMin)) * box.plotH;
  const clampY = (px) => Math.max(-10, Math.min(box.height + 10, px));
  const ticks = niceTicks(1, nMax, 8).ticks.filter((t) => t >= 1 && t <= nMax && Number.isInteger(t));
  axes(mainSvg, box, ticks.map((t) => [t, sx(t)]), yMin, yMax, sy);
  const plot = svgEl('g', { 'clip-path': box.clipUrl }, mainSvg);
  const left = MARGIN.left;
  const right = MARGIN.left + box.plotW;
  const N = found?.N;

  if (m.limit !== null) {
    const top = clampY(sy(m.limit + eps));
    const bottom = clampY(sy(m.limit - eps));
    svgEl('rect', { x: left, width: box.plotW, y: top, height: Math.max(1, bottom - top), class: 'band' }, plot);
    for (const y of [top, bottom]) svgEl('line', { x1: left, x2: right, y1: y, y2: y, class: 'band-edge' }, plot);
    svgEl('line', { x1: left, x2: right, y1: sy(m.limit), y2: sy(m.limit), class: 'limit-line' }, plot);
    svgTex(plot, right - 4, top - 2, 'L + \\varepsilon', { anchor: 'end', cls: 'limit-label' });
    if (N && N <= nMax) {
      const x = sx(N - 0.5);
      svgEl('line', { x1: x, x2: x, y1: MARGIN.top, y2: MARGIN.top + box.plotH, class: 'n-line' }, plot);
      svgTex(plot, x + 4, MARGIN.top + 2, `N = ${N}`, { baseline: 'top', cls: 'n-label' });
    } else if (found && !found.never) {
      svgTex(plot, right - 4, MARGIN.top + 2, `N > ${nMax} \\;\\rightarrow`, { anchor: 'end', baseline: 'top', cls: 'n-label' });
    }
  }

  const r = Math.max(1.5, Math.min(4.5, box.plotW / nMax / 2.5));
  for (let n = 1; n <= nMax; n++) {
    const y = shown[n - 1];
    if (!Number.isFinite(y)) continue;
    let cls = 'in';
    if (m.limit !== null) {
      const inside = Math.abs(y - m.limit) < eps;
      cls = !inside ? 'out' : N && n >= N ? 'in' : 'early';
    } else {
      cls = 'early';
    }
    if (n === cursor) cls += ' current';
    svgEl('circle', { cx: sx(n), cy: clampY(sy(y)), r: n === cursor ? r + 1.5 : r, class: `term ${cls}` }, plot);
  }

  main = { box, sx, sy, yMin, yMax, nMax };
  mainSvg.setAttribute('aria-label', `The first ${nMax} terms of the sequence` + (m.limit === null ? '' : ` with the band ${num(m.limit)} ± ${num(eps)}`));
}

// --- Lower chart: N(ε) on log scales ----------------------------------------------------

let nMap = null;

function drawN(m, { eps }) {
  const box = frame(nSvg, MARGIN);
  nMap = null;
  if (!box) return;
  const [xMin, xMax] = EPS_LOG;
  const points = m.curve ?? [];
  const logs = points.map((p) => (p.N ? Math.log10(p.N) : NaN));
  const finite = logs.filter(Number.isFinite);
  const logMaxStored = Math.log10(STORED);
  let [yMin, yMax] = finite.length ? extent(finite, 0) : [-0.2, 1];
  yMin = Math.min(yMin, -0.1);
  if (points.some((p) => p.beyond)) yMax = Math.max(yMax, logMaxStored + 0.2);
  const sx = (v) => MARGIN.left + ((v - xMin) / (xMax - xMin)) * box.plotW;
  const sy = (v) => MARGIN.top + (1 - (v - yMin) / (yMax - yMin)) * box.plotH;
  const ticks = niceTicks(xMin, xMax, 6).ticks.filter((t) => t >= xMin && t <= xMax);
  axes(nSvg, box, ticks.map((t) => [t, sx(t)]), yMin, yMax, sy);
  const plot = svgEl('g', { 'clip-path': box.clipUrl }, nSvg);

  // A step curve: N is constant between the ε where it jumps.
  let d = '';
  let pen = false;
  for (let i = 0; i < points.length; i++) {
    const v = points[i].beyond ? logMaxStored + 0.15 : logs[i];
    if (!Number.isFinite(v)) {
      pen = false;
      continue;
    }
    d += pen ? `H${sx(points[i].logEps).toFixed(1)}V${sy(v).toFixed(1)}` : `M${sx(points[i].logEps).toFixed(1)},${sy(v).toFixed(1)}`;
    pen = true;
  }
  svgEl('path', { d, class: 'n-curve' }, plot);
  if (points.some((p) => p.beyond)) {
    svgTex(plot, MARGIN.left + 4, sy(logMaxStored + 0.15) + 2, `N > ${STORED}`, { baseline: 'top', cls: 'n-label' });
  }

  const x = sx(Math.log10(eps));
  svgEl('line', { x1: x, x2: x, y1: MARGIN.top, y2: MARGIN.top + box.plotH, class: 'n-cross' }, plot);
  const here = m.dev ? firstIndex(m.dev, eps) : null;
  if (here?.N) svgEl('circle', { cx: x, cy: sy(Math.log10(here.N)), r: 5, class: 'n-marker' }, plot);
  svgTex(plot, x + 4, MARGIN.top + box.plotH - 2, '\\varepsilon', { cls: 'n-label' });

  nMap = { box, xMin, xMax };
  nSvg.setAttribute('aria-label', 'N of epsilon against epsilon, on logarithmic scales');
}

// --- Pointer and keyboard -------------------------------------------------------------

let dragging = false;

function pointerY(svg, e) {
  return e.clientY - svg.getBoundingClientRect().top;
}

function termAt(e) {
  const px = e.clientX - mainSvg.getBoundingClientRect().left;
  const n = Math.round(((px - MARGIN.left) / main.box.plotW) * main.nMax + 0.5);
  return Math.min(main.nMax, Math.max(1, n));
}

function showTerm(n) {
  cursor = n;
  const v = model.values[n - 1];
  const dist = model.limit === null ? '' : `\\quad |a_{${n}} - L| = ${T(Math.abs(v - model.limit), 3)}`;
  setTex($('hover'), `a_{${n}} = ${T(v)}${dist}`);
}

function epsFromPointer(e) {
  const y = main.yMax - ((pointerY(mainSvg, e) - MARGIN.top) / main.box.plotH) * (main.yMax - main.yMin);
  return Math.abs(y - model.limit);
}

mainSvg.addEventListener('pointerdown', (e) => {
  if (!main || model?.error || model.limit === null) return;
  stopShrink();
  dragging = true;
  mainSvg.setPointerCapture(e.pointerId);
  setState({ eps: epsFromPointer(e) });
});
mainSvg.addEventListener('pointermove', (e) => {
  if (!main || model?.error) return;
  if (dragging) setState({ eps: epsFromPointer(e) });
  showTerm(termAt(e));
  update();
});
mainSvg.addEventListener('pointerup', () => (dragging = false));
mainSvg.addEventListener('pointercancel', () => (dragging = false));
mainSvg.addEventListener('pointerleave', () => {
  cursor = null;
  $('hover').innerHTML = '';
  update();
});
mainSvg.addEventListener('keydown', (e) => {
  if (!main || model?.error) return;
  if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
    e.preventDefault();
    const step = (e.shiftKey ? 10 : 1) * (e.key === 'ArrowLeft' ? -1 : 1);
    showTerm(Math.min(main.nMax, Math.max(1, (cursor ?? 0) + step)));
    update();
  } else if (['ArrowUp', 'ArrowDown'].includes(e.key) && model.limit !== null) {
    e.preventDefault();
    stopShrink();
    setState({ eps: readForm().eps * (e.key === 'ArrowUp' ? 1.1 : 1 / 1.1) });
  }
});

function epsAtN(e) {
  const px = e.clientX - nSvg.getBoundingClientRect().left;
  const v = nMap.xMin + ((px - MARGIN.left) / nMap.box.plotW) * (nMap.xMax - nMap.xMin);
  return 10 ** Math.min(nMap.xMax, Math.max(nMap.xMin, v));
}

let nDragging = false;
nSvg.addEventListener('pointerdown', (e) => {
  if (!nMap || !model?.dev) return;
  stopShrink();
  nDragging = true;
  nSvg.setPointerCapture(e.pointerId);
  setState({ eps: epsAtN(e) });
});
nSvg.addEventListener('pointermove', (e) => {
  if (!nMap || !model?.dev) return;
  const eps = epsAtN(e);
  if (nDragging) setState({ eps });
  const f = firstIndex(model.dev, eps);
  setTex($('nHover'), `\\varepsilon = ${T(eps, 3)} \\quad N(\\varepsilon) = ${f.N ?? (f.beyond ? `> ${STORED}` : '\\text{none}')}`);
});
nSvg.addEventListener('pointerup', () => (nDragging = false));
nSvg.addEventListener('pointercancel', () => (nDragging = false));
nSvg.addEventListener('pointerleave', () => ($('nHover').innerHTML = ''));
nSvg.addEventListener('keydown', (e) => {
  if (!model?.dev || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  e.preventDefault();
  stopShrink();
  const factor = 10 ** ((e.shiftKey ? 0.25 : 0.05) * (e.key === 'ArrowLeft' ? -1 : 1));
  setState({ eps: readForm().eps * factor });
  const eps = readForm().eps;
  const f = firstIndex(model.dev, eps);
  setTex($('nHover'), `\\varepsilon = ${T(eps, 3)} \\quad N(\\varepsilon) = ${f.N ?? (f.beyond ? `> ${STORED}` : '\\text{none}')}`);
});

// --- Explanation ---------------------------------------------------------------------

function facts(m, { eps }, found) {
  const items = [];
  const seq = '\\((a_n)\\)';
  if (m.limit === null) {
    const est = m.estimate;
    items.push([
      'No limit',
      est.infinite
        ? `The terms grow without bound (towards \\(${est.infinite > 0 ? '+' : '-'}\\infty\\)), so no band of finite width around any \\(L\\) holds all late terms: ${seq} diverges.`
        : `Far out (at \\(n = 10^2, \\dots, 10^6\\) and the next terms) the values do not settle on one number, so the page found no limit. ` +
          'For \\((-1)^n\\) the terms keep jumping between \\(-1\\) and \\(1\\): every band narrower than \\(\\varepsilon = 1\\) misses one of them infinitely often, wherever \\(L\\) sits. ' +
          'A sequence that settles very slowly, such as \\(1/\\ln n\\), can look the same this far out: type an \\(L\\) to test it.',
    ]);
  } else {
    const L = T(m.limit, 6);
    items.push([
      'The definition',
      `\\(a_n \\to L\\) means: for every \\(\\varepsilon > 0\\) there is an \\(N\\) with \\(|a_n - L| < \\varepsilon\\) for all \\(n \\ge N\\). ` +
        'Shrinking \\(\\varepsilon\\) narrows the band, and \\(N\\) moves right; convergence means some \\(N\\) always exists.',
    ]);
    const e = T(eps, 3);
    if (found.N) {
      const last = found.N - 1; // the last term outside the band
      items.push([
        `For \\(\\varepsilon = ${e}\\)`,
        found.N === 1
          ? `Every term lies in the band: \\(|a_n - ${L}| < ${e}\\) for all \\(n \\ge 1\\), so \\(N = 1\\).`
          : `Every term from \\(N = ${found.N}\\) on lies in the band: \\(|a_n - ${L}| < ${e}\\) for all \\(n \\ge ${found.N}\\). ` +
            `The last term outside it is \\(a_{${last}} = ${T(m.values[last - 1], 5)}\\), at distance \\(${T(Math.abs(m.values[last - 1] - m.limit), 3)}\\). ` +
            'Gray dots are inside the band but come before \\(N\\): a later term still leaves it, so they don\'t count yet.',
      ]);
      const tenth = firstIndex(m.dev, eps / 10);
      items.push([
        'Ten times smaller',
        tenth.N
          ? `For \\(\\varepsilon = ${T(eps / 10, 3)}\\) you need \\(N = ${tenth.N}\\)` +
            (tenth.N > 1 && found.N > 1 ? `, \\(${T(tenth.N / found.N, 3)}\\) times as many terms` : '') +
            '. The lower chart shows \\(N(\\varepsilon)\\) for every \\(\\varepsilon\\). Where it is a straight line of slope \\(-s\\), ' +
            '\\(N\\) grows like \\(\\varepsilon^{-s}\\); terms with \\(|a_n - L| \\approx C/n^{p}\\) give \\(s = 1/p\\), and a curve that flattens means the terms approach \\(L\\) faster than any power of \\(1/n\\).'
          : tenth.beyond
            ? `For \\(\\varepsilon = ${T(eps / 10, 3)}\\) you need more than the first \\(${STORED}\\) terms.`
            : `For \\(\\varepsilon = ${T(eps / 10, 3)}\\) no \\(N\\) works: the terms keep leaving that band.`,
      ]);
    } else if (found.beyond) {
      items.push([
        `For \\(\\varepsilon = ${e}\\)`,
        `Terms up to \\(n = ${STORED}\\) still leave the band \\(${L} \\pm ${e}\\), but the terms probed further out don't: \\(N(\\varepsilon)\\) is larger than \\(${STORED}\\).`,
      ]);
    } else {
      items.push([
        `For \\(\\varepsilon = ${e}\\)`,
        `No \\(N\\) works: terms keep leaving the band \\(${L} \\pm ${e}\\) however far out you look (they stay up to \\(${T(m.dev.beyond, 3)}\\) away). ` +
          (m.typed ? `So \\(${L}\\) is not the limit of ${seq}, or not for this small an \\(\\varepsilon\\).` : 'The estimate of \\(L\\) is not accurate enough for this small an \\(\\varepsilon\\).'),
      ]);
    }
    items.push([
      'The limit',
      m.typed
        ? `You typed \\(L = ${L}\\). Clear the field to let the page estimate the limit.`
        : `\\(L = ${L}\\), estimated from the terms near \\(n = 10^2, \\dots, 10^6\\) (with the error cancelled the way it shrinks from decade to decade). Type a value to test another \\(L\\).`,
    ]);
  }
  items.push([
    'Related',
    'The same quantifiers for functions: <a href="./epsilon-delta.html">ε–δ continuity</a>, where you search for a δ that works for a given ε.',
  ]);
  setFacts(items);
}

// --- Update and wiring -----------------------------------------------------------------

function update() {
  const raw = readForm();
  const m = getModel(raw);
  if (m.error) {
    $('status').textContent = m.error;
    for (const svg of [mainSvg, nSvg]) frame(svg, MARGIN);
    main = nMap = null;
    $('formula').innerHTML = '';
    setFacts([]);
    writeHash(raw);
    return;
  }
  const state = clampState(raw);
  if (state.eps !== raw.eps) fields.eps.value = state.eps;
  if (state.nMax !== raw.nMax) fields.nMax.value = state.nMax;
  epsSlider.value = Math.log10(state.eps);
  nMaxSlider.value = state.nMax;
  if (cursor > state.nMax) cursor = null;
  const found = m.dev ? firstIndex(m.dev, state.eps) : null;
  $('status').textContent = '';
  $('fit').disabled = !found?.N || found.N > N_MAX;
  setTex($('formula'), `a_n = ${m.aTex}` + (m.limit === null ? '' : `\\qquad L ${m.typed ? '=' : '\\approx'} ${T(m.limit, 6)}`));
  drawMain(m, state, found);
  drawN(m, state);
  facts(m, state, found);
  writeHash({ ...raw, eps: state.eps, nMax: state.nMax });
}

function setState({ eps = readForm().eps, nMax = readForm().nMax }) {
  if (Number.isFinite(eps) && eps > 0) fields.eps.value = +eps.toPrecision(4);
  if (Number.isFinite(nMax)) fields.nMax.value = Math.round(nMax);
  update();
}

let frameId = null;
function stopShrink() {
  cancelAnimationFrame(frameId);
  frameId = null;
  $('shrink').innerHTML = texText('▶ Shrink \\(\\varepsilon\\)');
  $('shrink').setAttribute('aria-pressed', 'false');
}
$('shrink').addEventListener('click', () => {
  if (frameId || !model?.dev) return stopShrink();
  $('shrink').textContent = '■ Stop';
  $('shrink').setAttribute('aria-pressed', 'true');
  let last = 0;
  const step = (time) => {
    if (time - last > 40) {
      last = time;
      const eps = readForm().eps * SHRINK_FACTOR;
      const found = firstIndex(model.dev, eps);
      // Stop at the slider's end, or before N runs out of the stored terms.
      if (eps < 10 ** EPS_LOG[0] || !found.N) return stopShrink();
      // Widen the view to keep N in it.
      const nMax = Math.max(readForm().nMax, Math.min(N_MAX, Math.ceil(found.N * 1.2)));
      setState({ eps, nMax });
      if (found.N > N_MAX) return stopShrink();
    }
    frameId = requestAnimationFrame(step);
  };
  frameId = requestAnimationFrame(step);
});

$('fit').addEventListener('click', () => {
  const found = model?.dev && firstIndex(model.dev, readForm().eps);
  if (found?.N) setState({ nMax: Math.max(10, Math.ceil(found.N * 1.25)) });
});

let debounce = null;
$('controls').addEventListener('input', (e) => {
  const t = e.target;
  if (t === epsSlider) {
    stopShrink();
    setState({ eps: 10 ** +epsSlider.value });
  } else if (t === nMaxSlider) {
    setState({ nMax: +nMaxSlider.value });
  } else if (['expr', 'L'].includes(t.id)) {
    $('preset').value = '';
    stopShrink();
    clearTimeout(debounce);
    debounce = setTimeout(update, 200);
  } else if (t.id === 'preset') {
    const preset = PRESETS[t.value];
    if (!preset) return;
    stopShrink();
    cursor = null;
    const { label, ...values } = preset;
    writeForm(values);
    update();
  } else {
    stopShrink();
    update();
  }
});
$('controls').addEventListener('submit', (e) => e.preventDefault());

const resize = new ResizeObserver(() => update());
resize.observe(mainSvg);
resize.observe(nSvg);

renderStatic();
stopShrink();
writeForm(stateFromHash(DEFAULTS));
update();
