import { compileFunction } from './expression.js';
import { SurfacePlot, ACCEL_DRAW_SCALE } from './plot.js';
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
const tangentInfo = $('tangent');

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
  showTangentInfo(plot.tangent.data);
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

// --- Tangent plane ------------------------------------------------------------

// "+ 2 (x − 1)" style term; the constant c is subtracted from v.
function linearTerm(coef, v, c) {
  const sign = coef < 0 ? '−' : '+';
  const shifted = c === 0 ? v : `(${v} ${c < 0 ? '+' : '−'} ${fmt(Math.abs(c))})`;
  return ` ${sign} ${fmt(Math.abs(coef))} ${shifted}`;
}

function showTangentInfo(t) {
  tangentInfo.hidden = !t;
  if (!t) return;
  $('tangentPoint').textContent = `Tangent plane at (${fmt(t.x)}, ${fmt(t.y)}, ${fmt(t.z)})`;
  $('tangentEq').textContent = `z = ${fmt(t.z).replace('-', '−')}${linearTerm(t.fx, 'x', t.x)}${linearTerm(t.fy, 'y', t.y)}`;
  const v = t.velocity;
  $('geodesicInfo').textContent = v
    ? `Geodesic with γ′(0) = (${fmt(v.x)}, ${fmt(v.y)}, ${fmt(v.z)})`
    : 'Click or drag the unit circle to trace a geodesic.';
  const accel = $('accelInfo');
  accel.hidden = !v;
  const a = t.acceleration;
  if (!a) accel.textContent = 'Click the geodesic to show its acceleration.';
  else {
    const { point: p, vector: g } = a;
    accel.textContent =
      `γ″ at (${fmt(p.x)}, ${fmt(p.y)}, ${fmt(p.z)}) = (${fmt(g.x)}, ${fmt(g.y)}, ${fmt(g.z)}), ` +
      `|γ″| = ${fmt(Math.hypot(g.x, g.y, g.z))} (drawn ${ACCEL_DRAW_SCALE}×)`;
  }
}

// Pressing on the tangent plane's unit circle traces the geodesic in that direction,
// and dragging turns it live; clicking the geodesic shows its acceleration there;
// clicking the surface elsewhere shows the tangent plane there; clicking the
// background clears it. A pointer that moved more than a few
// pixels was an orbit drag, not a click.
const canvas = plot.renderer.domElement;
let pointerDown = null;
// While dragging the unit vector: { theta, drawn, frame } with the latest pointer
// angle, the angle last drawn and the pending animation frame, so the geodesic is
// retraced at most once per frame.
let drag = null;

// plot disables OrbitControls before calling this, so the drag doesn't also orbit.
plot.onDirectionGrab = (theta, e) => {
  drag = { theta, drawn: theta, frame: 0 };
  canvas.setPointerCapture(e.pointerId);
  canvas.style.cursor = 'grabbing';
  showTangentInfo(plot.setGeodesic(theta));
};
canvas.addEventListener('pointerdown', (e) => (pointerDown = { x: e.clientX, y: e.clientY }));
canvas.addEventListener('pointerup', (e) => {
  const down = pointerDown;
  pointerDown = null;
  if (drag) return endDrag();
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
  const step = plot.pickGeodesic(e.clientX, e.clientY);
  if (step != null) return showTangentInfo(plot.setAcceleration(step));
  const p = plot.pick(e.clientX, e.clientY);
  showTangentInfo(plot.setTangent(p && { x: p.x, y: p.y }));
});
canvas.addEventListener('pointercancel', () => {
  pointerDown = null;
  if (drag) endDrag();
});
$('clearTangent').addEventListener('click', () => showTangentInfo(plot.setTangent(null)));

function moveDrag(e) {
  const theta = plot.directionAt(e.clientX, e.clientY);
  if (theta == null) return;
  drag.theta = theta;
  drag.frame ||= requestAnimationFrame(() => {
    drag.frame = 0;
    drag.drawn = drag.theta;
    showTangentInfo(plot.setGeodesic(drag.theta));
  });
}

function endDrag() {
  cancelAnimationFrame(drag.frame);
  if (drag.theta !== drag.drawn) showTangentInfo(plot.setGeodesic(drag.theta));
  drag = null;
  plot.controls.enabled = true;
  canvas.style.cursor = '';
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

canvas.addEventListener('pointermove', (e) => {
  if (drag) return moveDrag(e);
  if (plot.pickDirection(e.clientX, e.clientY) != null) canvas.style.cursor = 'grab';
  else canvas.style.cursor = plot.pickGeodesic(e.clientX, e.clientY) == null ? '' : 'pointer';
  const p = plot.pick(e.clientX, e.clientY);
  readout.hidden = !p;
  if (p) readout.textContent = `x ${fmt(p.x)}  y ${fmt(p.y)}  f ${fmt(p.z)}`;
});
canvas.addEventListener('pointerleave', () => (readout.hidden = true));

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
    tangent: css.getPropertyValue('--tangent').trim(),
    geodesic: css.getPropertyValue('--geodesic').trim(),
    tangentVector: css.getPropertyValue('--tangent-vector').trim(),
    acceleration: css.getPropertyValue('--acceleration').trim(),
  });
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

writeForm(stateFromHash());
applyTheme();
render();
