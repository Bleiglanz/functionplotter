# AGENTS.md

This file provides guidance to AI coding agents working with code in this repository.

## What this is

A collection of interactive math visualizations, one HTML page per topic, linked from a landing page (`index.html`). The largest is a 3D plotter for surfaces z = f(x, y) (`surface.html`, three.js + math.js); the others are 2D SVG pages. Bundled with Vite. Plain JavaScript ES modules, no framework, no TypeScript.

## Pages and adding a topic

- `index.html` + `src/index.css`: landing page, one card (with a small inline-SVG thumbnail) per topic. It also redirects old surface-plotter links (`index.html#expr=…`, from when the plotter lived there) to `surface.html`.
- `surface.html`: the 3D surface plotter (`src/main.js` and friends, below).
- `exponential.html`: exponential functions a·e^(bx + c) + d.
- `riemann.html`: Riemann sums converging to the integral.
- `ftc.html` + `src/ftc.js` + `src/ftc.css`: the fundamental theorem of calculus. Inputs f, a and a view range (all constant expressions, as text), b (number field is the source of truth; slider, ←/→ or dragging in either chart set it; "Sweep" animates it across the view) and optional Riemann rectangles on [a, b]. Two stacked charts with the same x mapping: F(x) = ∫ₐˣ f on top (from `antiderivative()` in `integral.js`, cached per f/a/view in `model`) with the tangent at b and a slope triangle one x-tick wide; f below with the signed area from a to b split into parts that add and subtract (swapped when b < a). One-sided difference quotients of F detect a jump in f at b (`corner`); then the page shows both one-sided slopes instead of a tangent.
- `derivative.html` + `src/derivative.js` + `src/derivative.css`: the derivative as the limit of secant slopes. Inputs f and a view range (constant expressions), x₀ and h (number fields are the source of truth; dragging the two points on the chart, a logarithmic slider for |h|, a left/right side switch, and "Let h → 0", which shrinks |h| geometrically). The main chart shows f, the secant through x₀ and x₀ + h with its slope triangle, and the tangent: one line where f′(x₀) exists, two half-lines at a corner, a vertical line where a side is infinite. A second chart (`chart-figure`) plots the difference quotient against h with its limit as an open circle at h = 0. `src/derivativeMath.js` (tested) judges each one-sided limit from h = s·10⁻² … s·10⁻⁵ as finite (Richardson-extrapolated), infinite, none or undefined; `derivativeToTex` in `expression.js` adds the symbolic f′(x) from math.js for display only.
- `zeta.html`: the Riemann zeta function for real x > 1 and its partial sums Sₙ(x) = Σ_{k≤n} k⁻ˣ. Math in `src/zetaMath.js` (tested): `zeta` uses Euler–Maclaurin with N = 10 (near machine precision for x > 1, NaN for x ≤ 1), `partialSum` adds smallest terms first, `tailBounds` gives the integral-test bounds on ζ − Sₙ. `src/zeta.js` draws both curves with the tail shaded between them, using the chart and hash helpers from `pageUtils.js` (its `loadState` wrapper clamps n); n's slider is logarithmic (n = 10^slider, 1…1000) while the number field, the source of truth, allows up to 10000.

Shared helpers live in `src/pageUtils.js` (`svgEl`, `svgTex`, `frame`/`axes`/`polyline`/`extent`/`robustExtent` for SVG charts, `num` for plain-text numbers such as aria-labels, `safe`, and `parseHash`/`serializeHash` with the `stateFromHash`/`writeHash` wrappers for URL state; their tests in `src/pageUtils.test.js` hold one saved link per page, and a new page adds one); every page uses them instead of local copies, which `src/pages.test.js` checks for the 2D pages (P3).

## Math typesetting (KaTeX)

Every formula on every page is typeset with KaTeX (npm dependency, bundled by Vite with its fonts) through `src/tex.js`; don't write math with Unicode sub/superscripts or `<sup>`/`<sub>`.

- Static HTML: write `\( … \)` (or `\[ … \]`); each page script calls `renderStatic()` once at startup (`index.html` has `src/index.js` just for this). Native `<option>` text can't hold markup, so preset names in `<select>`s stay Unicode.
- Strings built in JS: `setTex(el, tex)` when the whole element is a formula (captions, readouts); `texText(prose)` for prose with inline `\( … \)` (explanations, `RULES[*].tag` in `integral.js`), which also keeps trailing punctuation on the formula's line; `tex(src)` for the raw HTML.
- Numbers inside TeX: `texNum(v, digits)` (exponent form becomes `\cdot 10^{k}`) and `texSigned(v)` for "+ 2"/"- 2" after another term.
- The user's own expression: `expressionToTex(source)` in `expression.js` (math.js `toTex`, falling back to `\texttt{…}`).
- Labels inside SVG charts: `svgTex(parent, x, y, tex, { anchor, baseline, cls })` places a `<foreignObject>` with KaTeX HTML; color it with `.tex-label.<cls> > div { color: … }` (not `fill`). Axis tick numbers stay plain SVG text.
- Exception: the 3D view's labels (axis names, ticks, slice-plane labels) are three.js canvas sprites in `plot.js` and stay plain text.
- Tests: `src/tex.test.js`.

## Page contract

Every topic page follows these rules. Check types: **T** unit test, **S** static page check in `npm test` (`src/pages.test.js`), **M** step of the manual checklist in that spec, **R** the owner's review when the page is added.

### Universal rules (every page)

| Rule | Requirement | Check |
| :--- | :---------- | :---- |
| U1 | The page is a top-level `<topic>.html`; Vite picks it up automatically. | — (by construction: the page list is read from disk) |
| U2 | `index.html` has a card linking to it. | S |
| U3 | `README.md` has a line describing it. | S |
| U4 | The page links back to `./index.html`. | S |
| U5 | All math is typeset with KaTeX through `src/tex.js`; the page script calls `renderStatic()`; the page HTML contains no `<sup>`/`<sub>`. | S, M |
| U6 | Page state lives only in the URL hash, read and written through `stateFromHash`/`writeHash` in `src/pageUtils.js` (thin wrappers over the pure `parseHash`/`serializeHash`). Once a page has shipped, every URL that opened it keeps opening the same view: a file is never renamed, and a renamed key is still read under its old name. The parser tests hold one saved hash per page. | T, M |
| U7 | The page's math lives in a DOM-free module with a `*.test.js`. | R |
| U8 | Colors come from `src/theme.css`; the page works in light and dark mode. | M |
| U9 | All assets are bundled; the page makes no network requests while running. Pages that parse no user expression do not import `src/expression.js` (the math.js chunk). | S (expression import only), M |
| U10 | The page is usable at phone width. | M |

### 2D page rules (SVG pages)

| Rule | Requirement | Check |
| :--- | :---------- | :---- |
| P1 | The page's stylesheet starts with `@import './page.css';`. | S |
| P2 | Layout: `#controls`, one main `#chart` figure, `#facts`; extra chart figures are allowed and carry class `chart-figure`. | S (the three ids) |
| P3 | SVG, chart and hash helpers come from `src/pageUtils.js`. The page script contains no `createElementNS(` and no `URLSearchParams(location.hash`; page-specific wrappers (for example clamping) may have any name. | S |
| P4 | The header has a `.home` link to the index. | S |
| P5 | Charts have a hover readout and ←/→ keyboard control. | M |

**Named exceptions:** the surface plotter (`surface.html`) follows the
universal rules only. It keeps its home link in the panel (U4 holds), stores
the panel's collapsed state in `localStorage` (an exception to U6, since that
state is a viewer preference, not part of the view), and its 3D labels are
canvas sprites (already exempt from U5).

To add a topic:

1. Apply the page-admission rule in `specs/roadmap-and-page-contract.md`; if the topic fails it, report back instead of building the page.
2. Create `<topic>.html` at the top level, `src/<topic>.js`, `src/<topic>.css` (starting with `@import './page.css';`) and the page's math in a DOM-free module with a `*.test.js`. Build from the shared modules (`pageUtils.js`, `tex.js`, `expression.js`); don't copy helpers. A topic that needs a new convention (for example a matrix encoding in the hash) adds it to this file in the same change.
3. Add a card to `index.html` and a line to `README.md`.
4. Pass `npm test` and `npm run build`, then stop and list the manual checklist steps (in the spec) for the new page and the index as pending for the owner.

## Specs and reviews

EGM artifact directory: ./specs

`specs/roadmap-and-page-contract.md` holds the topic roadmap, the page-admission rule, the manual checklist and the reasons behind the project's main decisions. Two rules from it are mandatory:

- Before adding a topic, apply the admission rule in that spec.
- Before pushing to `master`, the owner runs that spec's manual checklist for what changed.

If that spec and this file disagree, this file wins and the spec is corrected.

## Commands

- `npm run dev`: Vite dev server
- `npm run build` / `npm run preview`: production build into `dist/` and serve it. The ~1.2 MB chunk-size warning is expected (three + mathjs).
- `npm test`: Vitest, single run. Includes `src/pages.test.js`, which reads the HTML, scripts and stylesheets from disk and checks the static rules of the page contract (exemptions are the named lists at its top).
- Single test: `npx vitest run -t "gridIndices"` (filter by test name), or `npx vitest run src/surface.test.js`

## Architecture

For the surface plotter, data flows one way: form → `compileFunction` → `sampleSurface` → three.js geometry.

- `src/expression.js`: wraps math.js, shared by all pages. `compileFunction(source, variables = ['x', 'y'])` returns a function taking the variables positionally; `['x']` gives f(x), `[]` a constant (used for interval endpoints like `pi/2`; `constant(source, name)` wraps this and prefixes errors with the field name). Rejects any symbol other than the variables and a few constants (function names in call position are exempt), then test-evaluates once so bad functions/arity fail at compile time instead of per sample. Non-number results (e.g. complex values from `sqrt(-1)`) become `NaN`.
- `src/surface.js`: pure math with no three.js import, so it is unit-testable. Samples an `(n+1)²` grid, row-major with `index = j*(n+1) + i` (i along x, j along y). Any non-finite value or thrown error is stored as `NaN`. `gridIndices` drops triangles that touch a NaN sample, which is how undefined regions render as holes.
- `src/plot.js` (`SurfacePlot`): owns the renderer, camera, OrbitControls and scene. Key conventions:
  - World **+Z is up** (`camera.up = (0,0,1)`), matching math convention, not three.js's default +Y.
  - Math coords never go into the scene directly. `plot()` defines `toWorld`/`fromWorld`, which center the domain at the origin and, with `fitZ`, rescale z to about 0.7× the larger xy span. Anything added to the scene (labels, frame, picking) must go through these functions.
  - Every `plot()` call rebuilds all of `content` (surface, mesh lines, frame, label sprites) and disposes the old objects. The shared surface `material` is reused and never disposed.
  - The camera auto-frames only on first plot (`hasFramed`). `main.js` resets that flag when a preset is chosen.
  - Two slices, keyed by the axis held **fixed**: `'y'` is the plane y = y₀ with curve t ↦ f(t, y₀); `'x'` is the plane x = x₀ with curve t ↦ f(x₀, t). `t` always means the *free* coordinate. Each lives in `plot.slices[axis]` (`{ value, data, group, marker }`) with its own scene group, so `setSlice(axis, v)` redraws only that slice and dragging a slider never resamples the surface. `plot()` re-renders both slices at the end so they follow changes to the surface or scale.
  - `slices[axis].data` (`{ axis, value, tMin, tMax, ts, zs, zMin, zMax }`, from `sampleSlice` at `SLICE_SAMPLES`) is shared with the 2D chart, so f is evaluated once per slice. The 3D curve is drawn with the fat-line addon (`LineSegments2`) twice: once faint with `depthTest: false` so it shows through the surface, then solid with normal depth testing.
  - Clicking the surface (a pointer that moved ≤4px, so orbit drags don't count) calls `setTangent({ x, y })`, which draws a patch of the tangent plane there in `plot.tangent.group`; clicking the background clears it. Partials come from `partials()` in `surface.js` (central differences, one-sided at the edge of f's domain). `plot()` re-renders the tangent too, and `main.js` refreshes the equation box from `plot.tangent.data` after each render.
  - The tangent patch also shows the unit circle of tangent vectors, built from `tangentBasis` (two directions orthonormal in the surface metric) and measured in math units, so with `fitZ` it shows as an ellipse. A click within 10px of it (`pickDirection`, checked before surface picking) calls `setGeodesic(θ)`, which traces the geodesic both ways from that unit velocity with `geodesic()` in `surface.js` (RK4 on the graph-coordinate geodesic equations, finite-difference derivatives, stops at the domain edge or where f is undefined). Dragging from the circle turns the vector live: `SurfacePlot` registers its canvas `pointerdown` before creating OrbitControls, so on a circle hit it can disable them before they react, then hands the drag to `main.js` via `onDirectionGrab(θ, event)`. Moves go through `directionAt` (ray hit on the tangent plane → angle, so the pointer can leave the circle), retracing at most once per animation frame. The geodesic and vector live in `plot.tangent.geodesic`, separate from the plane in `plot.tangent.group`, so `setGeodesic` redraws only them (`renderGeodesic`). Picking a new point clears the direction. Clicking near the geodesic (`pickGeodesic`, after the circle and before the surface) calls `setAcceleration(step)`, keyed by a signed step count from the tangent point so it survives re-renders; it draws γ″ from `geodesicAcceleration()` (K·(−fx, −fy, 1), normal to the surface, length = normal curvature) in its own `plot.tangent.acceleration` group at `ACCEL_DRAW_SCALE` (10×) its length; the info box shows the true values. A new direction or point clears it.
  - `setInsets({ left, right })` records how much of the screen the panel and charts cover. On screens wider than 600px, `resize()` centers the view between them with `setViewOffset`, and `resetView()` frames the plot to fit that gap. `main.js` re-runs `resetView()` after the first plot because the chart inset is only known once the charts are filled.
- `src/sliceChart.js` (`SliceChart`): one 2D inset chart per slice (both stacked in `#charts`), plain SVG built with `svgEl` from `pageUtils.js` (no chart library) and redrawn on resize. Its crosshair snaps to sample indices (pointer or ←/→ keys) and reports back through `onHover(t, z)`, which `main.js` passes to `plot.setSliceMarker(axis, …)` to move that slice's 3D marker dot. Call `chart.update(plot.slices[axis].data)` and `updateChartInset()` after anything that changes a slice.
- `riemann.html` + `src/riemann.js` + `src/riemann.css`, math in `src/integral.js`: f(x), a < b (each a constant expression), n ≤ 200 and a sample-point rule (`RULES`: left, midpoint, right, lower, upper). `integral.js` is DOM-free and tested: `partition`, `tag`, `riemannSum`, `sums` (Sₙ for n = 1…N), `bounds` (lower and upper sums in one pass; inf/sup approximated from `EXTREMUM_SAMPLES + 1` values per subinterval) and `integrate` (adaptive Simpson, the reference value). `riemann.js` keeps a `model` of everything that depends only on f, a, b (integral, cached series), so changing n or the rule doesn't recompute it. Two charts: rectangles for the current n (hover or ←/→ highlights one) and Sₙ against n on a log axis inside the lower/upper band (click sets n). Its y-range ignores sums beyond 2·sup|f|·(b − a), which only occur next to a pole. `snap` shows rounding noise (|v| < 1e−12 of that scale) as 0. "Animate" steps n from 1 to 200.
- `exponential.html` + `src/exponential.js` + `src/exponential.css`: a separate, self-contained page for discussing f(x) = a·e^(bx + c) + d, with sliders for a, b, c, d (number field is the source of truth, as for the slices; `.negative` on a parameter's fieldset recolors it with `--negative`), an SVG chart whose hover shows the tangent and where it meets the asymptote y = d (always 1/b away), and a list of properties computed from the parameters (`properties()`, which builds the explanation text from the numbers in `src/exponentialMath.js`, a DOM-free module with tests). It uses the chart and hash helpers from `pageUtils.js` and doesn't import three.js or math.js. State lives in the URL hash the same way as `main.js`.
- `src/page.css`: shared layout and chart styles for the 2D pages (imported by every 2D page's stylesheet). Extra chart figures besides `#chart` get the same panel, caption and svg styles through class `chart-figure`; grid placement and svg height stay in the page's own CSS.
- `src/format.js`: `formatNumber` (used for every displayed number) and `niceTicks` (1/2/5 axis ticks).
- `src/main.js`: UI wiring. Form state is mirrored into the URL hash (`#expr=…&xMin=…`) through `stateFromHash`/`writeHash` from `pageUtils.js`, so plots are shareable and survive reloads. `DEFAULTS` defines both the defaults and the hash schema (value types are inferred from it). Input events re-plot with a 150 ms debounce, except slice controls, which call `updateSlice(axis)` immediately. The `SLICES` table in `main.js` holds each slice's toggle/value/slider/controls/chart and is built from DOM ids following the pattern `slice{X,Y}`, `{x,y}0`, `{x,y}0Slider`, `slice{X,Y}Controls`, `slice{X,Y}Chart`. For each slice the number field is the source of truth and the slider only drives it; `syncSliceControls` keeps both clamped to the axis range.
- `src/style.css`: on screens ≤600px the panel moves to the bottom and can collapse to just the expression field. The `.collapsed` class on `#panel` only has an effect inside the mobile media query, and the choice is remembered in `localStorage` (`panelCollapsed`). Colors are CSS custom properties on `:root` in `src/theme.css` (imported by every page's stylesheet), redefined under `prefers-color-scheme: dark`. The scene background, frame and label colors are read from those same variables (`applyTheme` in `main.js`), so change theme colors in CSS only. The 2D charts are styled entirely through these variables too: `[data-axis]` on a slice's fieldset or chart sets `--slice` to `--slice-x` or `--slice-y`. Both slice colors, as a pair, were checked with the dataviz skill's palette validator against both surfaces; re-run it if you change either color.
