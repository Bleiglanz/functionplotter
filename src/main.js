import { compileFunction } from './expression.js';
import { SurfacePlot } from './plot.js';
import { SliceChart } from './sliceChart.js';
import { formatNumber as fmt } from './format.js';

const PRESETS = [
  { name: 'Ripple', expr: 'sin(sqrt(x^2 + y^2))', range: 10 },
  { name: 'Saddle', expr: 'x^2 - y^2', range: 2 },
  { name: 'Egg crate', expr: 'sin(x) * cos(y)', range: 6 },
  { name: 'Gaussian', expr: 'exp(-(x^2 + y^2))', range: 3 },
  { name: 'Monkey saddle', expr: 'x^3 - 3 * x * y^2', range: 1.5 },
  { name: 'Peaks', expr: '3(1-x)^2 exp(-x^2-(y+1)^2) - 10(x/5-x^3-y^5) exp(-x^2-y^2) - exp(-(x+1)^2-y^2)/3', range: 3 },
  { name: 'Rosenbrock', expr: '(1 - x)^2 + 100 (y - x^2)^2', range: 2 },
  { name: 'Hemisphere (holes outside)', expr: 'sqrt(1 - x^2 - y^2)', range: 1.2 },
];

const DEFAULTS = {
  expr: PRESETS[0].expr,
  xMin: -10,
  xMax: 10,
  yMin: -10,
  yMax: 10,
  resolution: 120,
  fitZ: true,
  meshLines: true,
  sliceX: false,
  x0: 0,
  sliceY: false,
  y0: 0,
};

const $ = (id) => document.getElementById(id);
const fields = {
  expr: $('expr'),
  xMin: $('xMin'),
  xMax: $('xMax'),
  yMin: $('yMin'),
  yMax: $('yMax'),
  resolution: $('resolution'),
  fitZ: $('fitZ'),
  meshLines: $('meshLines'),
  sliceX: $('sliceX'),
  x0: $('x0'),
  sliceY: $('sliceY'),
  y0: $('y0'),
};
const status = $('status');
const readout = $('readout');

const plot = new SurfacePlot($('viewport'));
const panel = $('panel');
const charts = $('charts');
plot.setInsets({ left: panel.getBoundingClientRect().right });

// Per slice, keyed by the axis held fixed. The number field (value) is the
// source of truth for x0/y0; the slider only drives it.
const SLICES = {};
for (const axis of ['x', 'y']) {
  const A = axis.toUpperCase();
  SLICES[axis] = {
    toggle: fields[`slice${A}`],
    value: fields[`${axis}0`],
    slider: $(`${axis}0Slider`),
    controls: $(`slice${A}Controls`),
    range: (state) => [state[`${axis}Min`], state[`${axis}Max`]],
    chart: new SliceChart($(`slice${A}Chart`), { onHover: (t, z) => plot.setSliceMarker(axis, t, z) }),
  };
}

// --- State <-> form <-> URL hash -------------------------------------------

function readForm() {
  return {
    expr: fields.expr.value,
    xMin: parseFloat(fields.xMin.value),
    xMax: parseFloat(fields.xMax.value),
    yMin: parseFloat(fields.yMin.value),
    yMax: parseFloat(fields.yMax.value),
    resolution: parseInt(fields.resolution.value, 10),
    fitZ: fields.fitZ.checked,
    meshLines: fields.meshLines.checked,
    sliceX: fields.sliceX.checked,
    x0: parseFloat(fields.x0.value),
    sliceY: fields.sliceY.checked,
    y0: parseFloat(fields.y0.value),
  };
}

function writeForm(state) {
  for (const [key, el] of Object.entries(fields)) {
    if (el.type === 'checkbox') el.checked = state[key];
    else el.value = state[key];
  }
  $('resOut').textContent = state.resolution;
  syncSliceControls(state);
}

function stateFromHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const state = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS)) {
    if (!params.has(key)) continue;
    const raw = params.get(key);
    if (typeof DEFAULTS[key] === 'boolean') state[key] = raw === '1';
    else if (typeof DEFAULTS[key] === 'number') state[key] = Number.isFinite(+raw) ? +raw : DEFAULTS[key];
    else state[key] = raw;
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

// --- Plotting ---------------------------------------------------------------

function render() {
  const state = readForm();
  $('resOut').textContent = state.resolution;

  const fail = (message) => {
    status.textContent = message;
    status.className = 'error';
  };

  let f;
  try {
    f = compileFunction(state.expr);
    fields.expr.setAttribute('aria-invalid', 'false');
  } catch (err) {
    fields.expr.setAttribute('aria-invalid', 'true');
    return fail(err.message);
  }
  if (!(state.xMax > state.xMin) || !(state.yMax > state.yMin)) {
    return fail('Each range needs min < max.');
  }

  syncSliceControls(state);
  const clamped = readForm();
  for (const axis in SLICES) plot.slices[axis].value = sliceValue(clamped, axis);
  const framing = !plot.hasFramed;
  const t0 = performance.now();
  const { zMin, zMax, finite } = plot.plot(f, state);
  const ms = Math.round(performance.now() - t0);
  for (const axis in SLICES) SLICES[axis].chart.update(plot.slices[axis].data);
  updateChartInset();
  if (framing) plot.resetView(); // again, now that the chart inset is known
  status.className = finite ? '' : 'error';
  status.textContent = finite
    ? `z from ${fmt(zMin)} to ${fmt(zMax)} · ${ms} ms`
    : 'f is undefined everywhere in this domain.';
  writeHash(state);
}

// Keeps each slider's range on its axis range and the slice value inside it.
function syncSliceControls(state) {
  for (const { toggle, value, slider, controls, range } of Object.values(SLICES)) {
    const [min, max] = range(state);
    controls.hidden = !toggle.checked;
    if (!(max > min)) continue;
    slider.min = min;
    slider.max = max;
    slider.step = (max - min) / 1000;
    const v = parseFloat(value.value);
    if (!Number.isFinite(v) || v < min || v > max) {
      value.value = Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : (min + max) / 2;
    }
    slider.value = value.value;
  }
}

const sliceValue = (state, axis) => {
  const v = state[`${axis}0`];
  return state[`slice${axis.toUpperCase()}`] && Number.isFinite(v) ? v : null;
};

// Moves only this slice; the surface isn't resampled.
function updateSlice(axis) {
  const state = readForm();
  const { controls, chart } = SLICES[axis];
  controls.hidden = !SLICES[axis].toggle.checked;
  plot.setSlice(axis, sliceValue(state, axis));
  chart.update(plot.slices[axis].data);
  updateChartInset();
  writeHash(state);
}

function updateChartInset() {
  const visible = [...charts.children].some((c) => !c.hidden);
  plot.setInsets({ right: visible ? window.innerWidth - charts.getBoundingClientRect().left : 0 });
}

let pending = 0;
function scheduleRender() {
  clearTimeout(pending);
  pending = setTimeout(render, 150);
}

// --- Wiring -----------------------------------------------------------------

const presetSelect = $('preset');
for (const [i, p] of PRESETS.entries()) presetSelect.add(new Option(p.name, i));
presetSelect.addEventListener('change', () => {
  const p = PRESETS[presetSelect.value];
  presetSelect.value = '';
  if (!p) return;
  writeForm({ ...readForm(), expr: p.expr, xMin: -p.range, xMax: p.range, yMin: -p.range, yMax: p.range });
  plot.hasFramed = false; // reframe the camera for the new shape
  render();
});

panel.addEventListener('input', (e) => {
  if (e.target === presetSelect) return;
  for (const [axis, { toggle, value, slider }] of Object.entries(SLICES)) {
    if (e.target === slider) value.value = +(+slider.value).toPrecision(6);
    else if (e.target === value) slider.value = value.value;
    else if (e.target !== toggle) continue;
    return updateSlice(axis);
  }
  scheduleRender();
});
// Clamp a typed slice value into its range once editing is done.
for (const [axis, { value }] of Object.entries(SLICES)) {
  value.addEventListener('change', () => {
    syncSliceControls(readForm());
    updateSlice(axis);
  });
}
panel.addEventListener('submit', (e) => {
  e.preventDefault();
  render();
});
$('resetView').addEventListener('click', () => plot.resetView());

// On small screens the panel collapses to just the expression field (CSS ignores
// the class on wide screens). The choice is remembered per browser; the first
// visit on a phone starts collapsed so the plot is visible.
const panelToggle = $('panelToggle');
function setPanelCollapsed(collapsed) {
  panel.classList.toggle('collapsed', collapsed);
  panelToggle.setAttribute('aria-expanded', String(!collapsed));
}
let storedCollapsed = null;
try {
  storedCollapsed = localStorage.getItem('panelCollapsed');
} catch {}
setPanelCollapsed(storedCollapsed == null ? matchMedia('(max-width: 600px)').matches : storedCollapsed === '1');
panelToggle.addEventListener('click', () => {
  const collapsed = !panel.classList.contains('collapsed');
  setPanelCollapsed(collapsed);
  try {
    localStorage.setItem('panelCollapsed', collapsed ? '1' : '0');
  } catch {}
});

plot.renderer.domElement.addEventListener('pointermove', (e) => {
  const p = plot.pick(e.clientX, e.clientY);
  readout.hidden = !p;
  if (p) readout.textContent = `x ${fmt(p.x)}  y ${fmt(p.y)}  f ${fmt(p.z)}`;
});
plot.renderer.domElement.addEventListener('pointerleave', () => (readout.hidden = true));

function applyTheme() {
  const css = getComputedStyle(document.documentElement);
  plot.setTheme({
    background: css.getPropertyValue('--bg').trim(),
    frame: css.getPropertyValue('--frame').trim(),
    text: css.getPropertyValue('--muted').trim(),
    sliceColors: {
      x: css.getPropertyValue('--slice-x').trim(),
      y: css.getPropertyValue('--slice-y').trim(),
    },
  });
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

writeForm(stateFromHash());
applyTheme();
render();
