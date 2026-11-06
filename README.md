# functionplotter

A collection of interactive math visualizations for selected topics, one page
each, linked from a landing page:

- **Surfaces z = f(x, y)** (`surface.html`): a 3D plotter built with
  [three.js](https://threejs.org) and [math.js](https://mathjs.org). Type an
  expression, orbit the surface, slice it, and explore its differential geometry:
  tangent planes, unit tangent vectors and the geodesics they start.
- **Riemann sums** (`riemann.html`): how ∫ₐᵇ f(x) dx arises from sums over
  equidistant partitions.
- **Exponential functions** (`exponential.html`): f(x) = a·e<sup>bx+c</sup> + d.

## Riemann sums

Enter f(x), an interval a < b (numbers or expressions such as `pi/2`) and the
number n of subintervals, and choose where each rectangle samples f: left,
midpoint or right endpoint, or the infimum/supremum (lower/upper Darboux sums).
The page shows the rectangles (hover one for its numbers), a second chart of
Sₙ against n inside the band between lower and upper sums, converging to the
integral (click it to jump to an n), and an explanation with the error and how
fast it shrinks. "Animate" runs n from 1 to 200. Examples include signed area
(sin on [0, 2π]), ln as ∫ 1/x, and π/2 as the area of a half disc.

## Surface plotter features

- **Any expression in x and y**, parsed by math.js: `sin(sqrt(x^2 + y^2))`,
  `3(1-x)^2 exp(-x^2-(y+1)^2)`, … Implicit multiplication and the constants
  `pi`, `e`, `tau` and `phi` work. Where f is undefined (e.g. `sqrt(1 - x^2 - y^2)`
  outside the disc) the surface has holes.
- **Presets** such as Ripple, Saddle, Monkey saddle, Peaks and Rosenbrock.
- **Viridis coloring**, optional mesh lines, adjustable resolution, and
  "Fit z to view" to rescale very tall or very flat surfaces.
- **Slices** at x = x₀ and y = y₀, drawn in 3D and in a 2D chart beside the
  plot. Hover the chart (or use ←/→) to move a marker along the curve.
- **Tangent plane**: click the surface to show the tangent plane at that point
  and its equation.
- **Geodesics**: the tangent plane shows the unit circle of tangent vectors.
  Click or drag on it to choose a unit initial velocity (shown in red), and the
  geodesic through the point is traced in both directions, live while you drag.
  Click the geodesic to see its acceleration vector there (in green): it is
  normal to the surface, and its length is the normal curvature. It is drawn
  at 10× its length so it stays visible.
- **Exponential functions page** (`exponential.html`): sliders for a, b, c and d in
  f(x) = a·e<sup>bx+c</sup> + d (a slider turns orange while its value is negative),
  a chart whose hover shows the tangent (it always meets the asymptote y = d 1/b
  away), and the properties that follow: y-intercept, growth or decay with doubling
  time / half-life, asymptote, range, zeros, convexity and inverse.
- **Shareable URLs**: the expression, domain and settings are kept in the URL
  hash, so a link reproduces the plot.
- Light and dark themes, and a collapsible panel on small screens.

## Getting started

Requires Node.js.

```sh
npm install
npm run dev       # development server
npm test          # unit tests (Vitest)
npm run build     # production build into dist/
npm run preview   # serve the production build
```

## How the geodesics are computed

For a graph z = f(x, y), the geodesic equations in the coordinates (x, y) reduce to

```
x'' = -fx · K,   y'' = -fy · K,
K = (fxx x'² + 2 fxy x'y' + fyy y'²) / (1 + fx² + fy²)
```

These are integrated with fourth-order Runge–Kutta, using finite-difference
derivatives of f. Tracing stops at the edge of the domain or where f is
undefined. The unit circle is measured in the surface's own units, so with
"Fit z to view" on it appears as an ellipse.

## Project layout

| File | Purpose |
| --- | --- |
| `src/expression.js` | Compiles and validates expressions with math.js |
| `src/surface.js` | Pure math: sampling, partial derivatives, tangent basis, geodesics |
| `src/plot.js` | three.js scene: surface, slices, tangent plane, picking |
| `src/sliceChart.js` | 2D SVG charts for the slices |
| `src/main.js` | UI wiring and URL-hash state |
| `src/style.css` | Surface plotter layout |
| `src/theme.css` | Theme colors shared by all pages |
| `src/page.css` | Layout shared by the 2D pages |
| `src/integral.js` | Pure math for Riemann sums: partitions, sums, reference integral |
| `src/riemann.js` | Riemann sums page |
| `src/exponential.js` | Exponential functions page |

Each topic is a top-level HTML file; Vite builds every one automatically.

Live version: https://bleiglanz.github.io/functionplotter/ (deployed from `master` by GitHub Actions on every push).

See [AGENTS.md](AGENTS.md) for a detailed architecture guide.

## License

[MIT](LICENSE)
