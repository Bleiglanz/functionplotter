import { formatNumber as fmt, niceTicks } from './format.js';
import { tex, texText } from './tex.js';

// Helpers shared by the 2D topic pages: SVG charts, number display and URL-hash state.

const NS = 'http://www.w3.org/2000/svg';

export const svgEl = (tag, attrs = {}, parent) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  parent?.appendChild(el);
  return el;
};

/** formatNumber with a real minus sign, for plain text such as aria-labels and tick labels. */
export const num = (v, digits) => fmt(v, digits).replace('-', '−');

/**
 * A KaTeX-typeset label inside an SVG chart, positioned like SVG text at (x, y):
 * anchor 'start' | 'middle' | 'end' horizontally, baseline 'bottom' (the label
 * sits above y, like SVG text), 'middle' or 'top'. `cls` sets its color via CSS.
 */
export function svgTex(parent, x, y, src, { anchor = 'start', baseline = 'bottom', cls = '' } = {}) {
  const fo = svgEl('foreignObject', {
    x,
    y,
    width: 1,
    height: 1,
    class: `tex-label ${cls}`.trim(),
    'data-anchor': anchor,
    'data-baseline': baseline,
  }, parent);
  const div = document.createElement('div');
  div.innerHTML = tex(src);
  fo.append(div);
  return fo;
}

/**
 * Fills the #facts list with [term, text] pairs, both prose with inline \( … \)
 * TeX (see texText in tex.js). An empty list clears it.
 */
export function setFacts(items) {
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

/**
 * An arrow from (x1, y1) to (x2, y2) in screen units: a line and a filled head
 * of length `head`, both in a <g> with class `cls` (color it with stroke/fill
 * in CSS). A tip closer than the head draws only the head, scaled down.
 */
export function arrow(parent, x1, y1, x2, y2, { cls = '', head = 9 } = {}) {
  const g = svgEl('g', { class: `arrow ${cls}`.trim() }, parent);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (!(len > 0)) return g;
  const h = Math.min(head, len);
  const ux = dx / len;
  const uy = dy / len;
  const bx = x2 - ux * h;
  const by = y2 - uy * h;
  svgEl('line', { x1, y1, x2: bx, y2: by }, g);
  const w = h * 0.45;
  svgEl('path', { d: `M${x2},${y2} L${bx - uy * w},${by + ux * w} L${bx + uy * w},${by - ux * w} Z` }, g);
  return g;
}

/**
 * Screen mappings with one unit the same length on both axes: the box's plot
 * area shows at least [xMin, xMax] × [yMin, yMax], widened in x or y to fill it.
 * Returns { xMin, xMax, yMin, yMax, sx, sy, scale (pixels per unit), toMath(px, py) }.
 */
export function equalScale({ plotW, plotH, margin }, xMin, xMax, yMin, yMax) {
  const scale = Math.min(plotW / (xMax - xMin), plotH / (yMax - yMin));
  const cx = (xMin + xMax) / 2;
  const cy = (yMin + yMax) / 2;
  const halfW = plotW / scale / 2;
  const halfH = plotH / scale / 2;
  const view = { xMin: cx - halfW, xMax: cx + halfW, yMin: cy - halfH, yMax: cy + halfH, scale };
  view.sx = (x) => margin.left + (x - view.xMin) * scale;
  view.sy = (y) => margin.top + (view.yMax - y) * scale;
  view.toMath = (px, py) => [view.xMin + (px - margin.left) / scale, view.yMax - (py - margin.top) / scale];
  return view;
}

/** Calls f, turning thrown errors and non-finite values into NaN. */
export function safe(f, x) {
  try {
    const y = f(x);
    return Number.isFinite(y) ? y : NaN;
  } catch {
    return NaN;
  }
}

/**
 * Clears the chart's <svg> and sizes it to its box. Returns the plot geometry
 * ({ width, height, plotW, plotH, margin, clipUrl }, with a clip path for the
 * plot area), or null while the svg has no size.
 */
export function frame(svg, margin) {
  const width = svg.clientWidth;
  const height = svg.clientHeight;
  svg.replaceChildren();
  if (!width || !height) return null;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const id = `${svg.parentElement.id}Clip`;
  const clip = svgEl('clipPath', { id }, svgEl('defs', {}, svg));
  svgEl('rect', { x: margin.left, y: margin.top, width: plotW, height: plotH }, clip);
  return { width, height, plotW, plotH, margin, clipUrl: `url(#${id})` };
}

/**
 * Grid lines and tick labels; xTicks are [value, screen x] pairs. The y ticks
 * are nice numbers in [yMin, yMax] unless given as `yTicks` (values).
 */
export function axes(svg, { width, height, plotH, margin }, xTicks, yMin, yMax, sy, yTicks) {
  const grid = svgEl('g', { class: 'grid' }, svg);
  const labels = svgEl('g', { class: 'tick-labels' }, svg);
  for (const t of (yTicks ?? niceTicks(yMin, yMax, 5).ticks).filter((t) => t >= yMin && t <= yMax)) {
    svgEl('line', { x1: margin.left, x2: width - margin.right, y1: sy(t), y2: sy(t), class: t === 0 ? 'zero' : '' }, grid);
    svgEl('text', { x: margin.left - 6, y: sy(t), 'text-anchor': 'end', 'dominant-baseline': 'middle' }, labels).textContent = num(t, 3);
  }
  for (const [t, x] of xTicks) {
    svgEl('line', { x1: x, x2: x, y1: margin.top, y2: margin.top + plotH, class: t === 0 ? 'zero' : '' }, grid);
    svgEl('text', { x, y: height - 8, 'text-anchor': 'middle' }, labels).textContent = num(t, 3);
  }
}

/** [min, max] of the finite values, widened to include `extra` and padded by 8 %. */
export function extent(values, ...extra) {
  let lo = Math.min(...extra);
  let hi = Math.max(...extra);
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (!(hi > lo)) return [lo - 1, hi + 1];
  const pad = (hi - lo) * 0.08;
  return [lo - pad, hi + pad];
}

/**
 * Like extent(), but ignoring the top and bottom 1 % of the values, so a pole
 * (1/x near 0) doesn't flatten the rest of the curve.
 */
export function robustExtent(values, ...extra) {
  const sorted = values.filter(Number.isFinite).sort((p, q) => p - q);
  if (!sorted.length) return extent([], ...extra);
  const at = (q) => sorted[Math.round(q * (sorted.length - 1))];
  return extent([at(0.01), at(0.99)], ...extra);
}

/** SVG path through screen points, broken wherever y is not finite; clampY keeps it short. */
export function polyline(points, clampY) {
  let d = '';
  let pen = false;
  for (const [x, y] of points) {
    if (!Number.isFinite(y)) {
      pen = false;
      continue;
    }
    d += `${pen ? 'L' : 'M'}${x.toFixed(1)},${clampY(y).toFixed(1)}`;
    pen = true;
  }
  return d;
}

/**
 * Page state from a URL hash such as '#n=8&band=1'. `defaults` defines the
 * keys and their types: a boolean is true only for '1'; a number takes the
 * value when it is finite (so an empty value reads as 0) and otherwise keeps
 * the default; a string takes the text. Keys not in `defaults` are ignored.
 * Shared links depend on this behaviour; the tests pin it.
 */
export function parseHash(hash, defaults) {
  const params = new URLSearchParams(hash.slice(1));
  const state = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (!params.has(key)) continue;
    const raw = params.get(key);
    if (typeof defaults[key] === 'boolean') state[key] = raw === '1';
    else if (typeof defaults[key] === 'number') state[key] = Number.isFinite(+raw) ? +raw : defaults[key];
    else state[key] = raw;
  }
  return state;
}

/** The hash string (without '#') for a state: booleans as 1/0, everything else as text. */
export function serializeHash(state) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(state)) {
    params.set(key, typeof value === 'boolean' ? (value ? '1' : '0') : String(value));
  }
  return params.toString();
}

/** The page state from the current URL hash (see parseHash). */
export function stateFromHash(defaults) {
  return parseHash(location.hash, defaults);
}

// Browsers throttle history.replaceState (Chrome drops calls beyond a few
// hundred per 10 s), which an animation calling writeHash every frame exceeds.
// So writes are coalesced: at most one per HASH_DELAY ms, always ending with
// the latest state, and a pending write is flushed when the page is left.
const HASH_DELAY = 100;
let pendingHash = null;
let hashTimer = null;

function flushHash() {
  clearTimeout(hashTimer);
  hashTimer = null;
  if (pendingHash != null) history.replaceState(null, '', '#' + pendingHash);
  pendingHash = null;
}

/** Mirrors the state into the URL hash without adding a history entry (coalesced, see above). */
export function writeHash(state) {
  pendingHash = serializeHash(state);
  hashTimer ??= setTimeout(flushHash, HASH_DELAY);
}

if (typeof window !== 'undefined') window.addEventListener('pagehide', flushHash);
