# functionplotter

A collection of interactive math visualizations for selected topics, one page
each, linked from a landing page. Formulas are typeset with [KaTeX](https://katex.org):

- **Surfaces $z = f(x, y)$** (`surface.html`): a 3D plotter built with
  [three.js](https://threejs.org) and [math.js](https://mathjs.org). Type an
  expression, orbit the surface, slice it, and explore its differential geometry:
  tangent planes, unit tangent vectors and the geodesics they start.
- **Secant to tangent** (`derivative.html`): the derivative $f'(x_0)$ as the limit of
  secant slopes $\frac{f(x_0+h)-f(x_0)}{h}$. Drag $x_0$ and $x_0 + h$ or let $h \to 0$;
  a second chart shows the slope as a function of $h$, so corners, vertical tangents
  and slopes without a limit are visible too.
- **Taylor polynomials** (`taylor.html`): $f$ and its Taylor polynomial $T_n$ at a
  draggable $x_0$, with a slider for the degree $n$, the stretch where $|f - T_n| < \varepsilon$
  shaded, and the error $|f - T_n|$ on a log scale.
- **Sequences and convergence** (`sequences.html`): the terms $a_n$ as dots with a band
  $L \pm \varepsilon$ around the limit and the index $N(\varepsilon)$ from which every term stays
  inside it; drag the band's width, and see in a second chart how $N$ grows as $\varepsilon$ shrinks.
- **ε–δ continuity** (`epsilon-delta.html`): set $\varepsilon$, then search for a $\delta$ by dragging
  the window $|x - x_0| < \delta$; where the graph over the window leaves the band
  $f(x_0) \pm \varepsilon$ it turns red. The largest $\delta$ is shown on request, after you have tried.
- **Riemann sums** (`riemann.html`): how $\int_a^b f(x)\,dx$ arises from sums over
  equidistant partitions.
- **Exponential functions** (`exponential.html`): sliders for $a$, $b$, $c$ and $d$ in
  $f(x) = a\,e^{bx+c} + d$ (a slider turns orange while its value is negative),
  a chart whose hover shows the tangent (it always meets the asymptote $y = d$
  $1/b$ away), and the properties that follow: $y$-intercept, growth or decay with
  doubling time / half-life, asymptote, range, zeros, convexity and inverse.
- **Fundamental theorem of calculus** (`ftc.html`): $f$ with the signed area from $a$
  to a draggable $b$, and above it $F(x) = \int_a^x f$ with its tangent at $b$, of slope $f(b)$.
- **Fourier series** (`fourier.html`): one period of $f$, repeated, and its partial sums $S_n$
  with a slider for the number of harmonics; the overshoot next to a jump (Gibbs phenomenon)
  is marked, and a second chart shows how fast the harmonics shrink.
- **Linear maps in 2D** (`linear-maps.html`): a 2×2 matrix acting on the plane. Drag the
  images of $e_1$ and $e_2$ (the columns) and watch the grid, the unit square (area $|\det A|$)
  and a letter F (orientation) follow; a slider moves from the identity to $A$.
- **Eigenvectors** (`eigenvectors.html`): a unit vector $v$ turns around the circle with $Av$
  drawn beside it; where $Av$ lands on $v$'s line, $Av = \lambda v$. A second chart shows the angle
  from $v$ to $Av$, whose zeros are the eigen-directions; complex and repeated eigenvalues included.
- **Direction fields** (`ode.html`): the slope field of $y' = f(x, y)$; click to start a
  solution curve (traced both ways with Runge–Kutta), hover to preview one, and show the curve
  where $y' = 0$. Examples include equilibria, finite-time blow-up and a failure of uniqueness.
- **Complex functions** (`complex.html`): domain coloring of $f(z)$ (hue = argument, lightness =
  modulus) with zeros and poles found and marked with their order, a probe point whose value is
  shown on the colored $w$-plane, and branch cuts of $\log$ and $\sqrt{\ }$. Drag to move the view.
- **Riemann zeta function** (`zeta.html`): $\zeta(x)$ for real $x > 1$ with the partial
  sums $\sum_{k=1}^{n} 1/k^x$ and a (logarithmic) slider for $n$.

## Riemann sums

Enter f(x), an interval a < b (numbers or expressions such as `pi/2`) and the
number n of subintervals, and choose where each rectangle samples f: left,
midpoint or right endpoint, or the infimum/supremum (lower/upper Darboux sums).
The page shows the rectangles (hover one for its numbers), a second chart of
$S_n$ against $n$ inside the band between lower and upper sums, converging to the
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
| `src/exponentialMath.js` | Pure math for the exponential page |
| `src/ftc.js` | Fundamental theorem page |
| `src/tex.js` | KaTeX helpers used for every formula on every page |
| `src/pageUtils.js` | Chart, number and URL-hash helpers shared by the pages |
| `src/pageUtils.test.js` | Hash-parser tests, including one saved link per page |
| `src/pages.test.js` | Static check of the page contract (HTML, scripts, styles) |
| `src/derivative.js` | Secant-to-tangent page |
| `src/derivativeMath.js` | Difference quotients and their one-sided limits |
| `src/taylor.js` | Taylor-polynomial page |
| `src/taylorMath.js` | Taylor coefficients by power-series arithmetic on the parse tree |
| `src/sequences.js` | Sequences page |
| `src/sequencesMath.js` | Limit estimate and N(ε) for a sequence |
| `src/epsilon-delta.js` | ε–δ continuity page |
| `src/epsilonDeltaMath.js` | Largest deviation over a window, largest working δ |
| `src/fourier.js` | Fourier series page |
| `src/fourierMath.js` | Fourier coefficients (midpoint rule), partial sums, jumps |
| `src/linear-maps.js` | Linear-maps page |
| `src/linearMath.js` | 2×2 matrices: determinant, inverse, eigenvalues, classification |
| `src/eigenvectors.js` | Eigenvector page |
| `src/matrix.css` | Matrix input and vector styles shared by the two matrix pages |
| `src/ode.js` | Direction-field page |
| `src/odeMath.js` | RK4 step (also used for geodesics), solution curves, the curve f = 0 |
| `src/complex.js` | Complex-functions page (canvas domain coloring) |
| `src/complexMath.js` | Complex evaluation of a parse tree, domain colors, zeros, poles, winding numbers |
| `src/zetaMath.js` | ζ(x) by Euler–Maclaurin, partial sums, tail bounds |
| `src/zeta.js` | Riemann zeta page |

Each topic is a top-level HTML file; Vite builds every one automatically. The
rules every page follows are in [AGENTS.md](AGENTS.md) ("Page contract"); the
planned topics and the reasons behind the project's main decisions are in
[specs/roadmap-and-page-contract.md](specs/roadmap-and-page-contract.md).

Live version: https://bleiglanz.github.io/functionplotter/ (deployed from `master` by GitHub Actions on every push).

See [AGENTS.md](AGENTS.md) for a detailed architecture guide.

## License

[MIT](LICENSE)
