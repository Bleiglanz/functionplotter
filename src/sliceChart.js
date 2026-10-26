import { formatNumber as fmt, niceTicks } from './format.js';

const NS = 'http://www.w3.org/2000/svg';
const MARGIN = { top: 8, right: 12, bottom: 22, left: 44 };

const svgEl = (tag, attrs = {}, parent) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  parent?.appendChild(el);
  return el;
};

/**
 * 2D line chart of one slice, e.g. x -> f(x, y0), fed the samples SurfacePlot
 * computed (plot.slices[axis].data). Hover or arrow keys move a crosshair that
 * snaps to the nearest sample; onHover(t, z) / onHover(null) lets the 3D view mirror it.
 */
export class SliceChart {
  constructor(root, { onHover } = {}) {
    this.root = root;
    this.onHover = onHover ?? (() => {});
    this.title = root.querySelector('.chart-title');
    this.value = root.querySelector('.chart-value');
    this.svg = root.querySelector('svg');
    this.data = null;
    this.index = null;

    this.svg.addEventListener('pointermove', (e) => {
      const rect = this.svg.getBoundingClientRect();
      this.hoverAt(this.xScale?.invert(e.clientX - rect.left));
    });
    this.svg.addEventListener('pointerleave', () => this.hoverIndex(null));
    this.svg.addEventListener('blur', () => this.hoverIndex(null));
    this.svg.addEventListener('keydown', (e) => {
      if (!this.data || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      e.preventDefault();
      const n = this.data.ts.length - 1;
      const step = (e.shiftKey ? 20 : 4) * (e.key === 'ArrowLeft' ? -1 : 1);
      this.hoverIndex(Math.min(n, Math.max(0, (this.index ?? Math.round(n / 2)) + step)));
    });
    new ResizeObserver(() => this.draw()).observe(this.svg);
  }

  /** data: plot.slices[axis].data, or null to hide the chart. */
  update(data) {
    this.data = data;
    this.root.hidden = !data;
    if (!data) return;
    const v = fmt(data.value);
    this.free = data.axis === 'y' ? 'x' : 'y';
    this.title.textContent = data.axis === 'y' ? `f(x, ${v})` : `f(${v}, y)`;
    this.svg.setAttribute(
      'aria-label',
      `Graph of f with ${data.axis} = ${v}, for ${this.free} from ${fmt(data.tMin)} to ${fmt(data.tMax)}`,
    );
    this.draw();
    this.hoverIndex(this.index); // keep the crosshair at the same t while the slice moves
  }

  draw() {
    const { data, svg } = this;
    const width = svg.clientWidth;
    const height = svg.clientHeight;
    if (!data || !width || !height) return;
    svg.replaceChildren();
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    const plotW = width - MARGIN.left - MARGIN.right;
    const plotH = height - MARGIN.top - MARGIN.bottom;
    const finite = Number.isFinite(data.zMin);
    const yTicks = niceTicks(finite ? data.zMin : -1, finite ? data.zMax : 1, 4);
    const xTicks = niceTicks(data.tMin, data.tMax, 5).ticks.filter((t) => t >= data.tMin && t <= data.tMax);

    const sx = (t) => MARGIN.left + ((t - data.tMin) / (data.tMax - data.tMin)) * plotW;
    sx.invert = (px) => data.tMin + ((px - MARGIN.left) / plotW) * (data.tMax - data.tMin);
    const sy = (z) => MARGIN.top + (1 - (z - yTicks.min) / (yTicks.max - yTicks.min)) * plotH;
    this.xScale = sx;
    this.yScale = sy;

    const grid = svgEl('g', { class: 'grid' }, svg);
    const labels = svgEl('g', { class: 'tick-labels' }, svg);
    for (const t of yTicks.ticks) {
      svgEl('line', { x1: MARGIN.left, x2: width - MARGIN.right, y1: sy(t), y2: sy(t), class: t === 0 ? 'zero' : '' }, grid);
      svgEl('text', { x: MARGIN.left - 6, y: sy(t), 'text-anchor': 'end', 'dominant-baseline': 'middle' }, labels).textContent = fmt(t, 3);
    }
    for (const t of xTicks) {
      svgEl('text', { x: sx(t), y: height - 6, 'text-anchor': 'middle' }, labels).textContent = fmt(t, 3);
    }

    // One path with a new subpath after every gap where f is undefined.
    let d = '';
    let pen = false;
    for (let i = 0; i < data.ts.length; i++) {
      const z = data.zs[i];
      if (Number.isNaN(z)) {
        pen = false;
        continue;
      }
      d += `${pen ? 'L' : 'M'}${sx(data.ts[i]).toFixed(1)},${sy(z).toFixed(1)}`;
      pen = true;
    }
    svgEl('path', { d, class: 'curve' }, svg);
    if (!finite) {
      svgEl('text', { x: MARGIN.left + plotW / 2, y: MARGIN.top + plotH / 2, class: 'empty', 'text-anchor': 'middle' }, svg)
        .textContent = 'f is undefined on this line';
    }

    this.crosshair = svgEl('g', { class: 'crosshair', visibility: 'hidden' }, svg);
    this.hairline = svgEl('line', { y1: MARGIN.top, y2: MARGIN.top + plotH }, this.crosshair);
    this.dot = svgEl('circle', { r: 4 }, this.crosshair);
  }

  hoverAt(t) {
    if (!this.data || t == null) return this.hoverIndex(null);
    const { ts, tMin, tMax } = this.data;
    const n = ts.length - 1;
    if (t < tMin || t > tMax) return this.hoverIndex(null);
    this.hoverIndex(Math.round(((t - tMin) / (tMax - tMin)) * n));
  }

  hoverIndex(i) {
    this.index = i;
    const z = i == null || !this.data ? NaN : this.data.zs[i];
    if (!this.crosshair) return;
    if (i == null || !this.data) {
      this.crosshair.setAttribute('visibility', 'hidden');
      this.value.textContent = '';
      this.onHover(null);
      return;
    }
    const t = this.data.ts[i];
    const px = this.xScale(t);
    this.crosshair.setAttribute('visibility', 'visible');
    this.hairline.setAttribute('x1', px);
    this.hairline.setAttribute('x2', px);
    const defined = !Number.isNaN(z);
    this.dot.setAttribute('visibility', defined ? 'visible' : 'hidden');
    if (defined) {
      this.dot.setAttribute('cx', px);
      this.dot.setAttribute('cy', this.yScale(z));
    }
    this.value.textContent = `${this.free} ${fmt(t)}  f ${defined ? fmt(z) : 'undefined'}`;
    this.onHover(defined ? t : null, z);
  }
}
