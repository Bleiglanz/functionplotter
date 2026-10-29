# functionplotter

An interactive browser plotter for surfaces z = f(x, y), built with
[three.js](https://threejs.org) and [math.js](https://mathjs.org).

Type an expression, orbit the surface, slice it, and explore its differential
geometry: tangent planes, unit tangent vectors and the geodesics they start.

## Features

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
| `src/style.css` | Layout and theme colors |

Live version: https://bleiglanz.github.io/functionplotter/ (deployed from `master` by GitHub Actions on every push).

See [AGENTS.md](AGENTS.md) for a detailed architecture guide.

## License

[MIT](LICENSE)
