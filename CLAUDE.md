# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A browser plotter for surfaces z = f(x, y), built with three.js (rendering) and math.js (expression parsing), bundled with Vite. Plain JavaScript ES modules, no framework, no TypeScript.

## Commands

- `npm run dev`: Vite dev server
- `npm run build` / `npm run preview`: production build into `dist/` and serve it. The ~1.2 MB chunk-size warning is expected (three + mathjs).
- `npm test`: Vitest, single run
- Single test: `npx vitest run -t "gridIndices"` (filter by test name), or `npx vitest run src/surface.test.js`

## Architecture

Data flows one way: form → `compileFunction` → `sampleSurface` → three.js geometry.

- `src/expression.js`: wraps math.js. Rejects any symbol other than `x`, `y` and a few constants (function names in call position are exempt), then test-evaluates once so bad functions/arity fail at compile time instead of per sample. Non-number results (e.g. complex values from `sqrt(-1)`) become `NaN`.
- `src/surface.js`: pure math with no three.js import, so it is unit-testable. Samples an `(n+1)²` grid, row-major with `index = j*(n+1) + i` (i along x, j along y). Any non-finite value or thrown error is stored as `NaN`. `gridIndices` drops triangles that touch a NaN sample, which is how undefined regions render as holes.
- `src/plot.js` (`SurfacePlot`): owns the renderer, camera, OrbitControls and scene. Key conventions:
  - World **+Z is up** (`camera.up = (0,0,1)`), matching math convention, not three.js's default +Y.
  - Math coords never go into the scene directly. `plot()` defines `toWorld`/`fromWorld`, which center the domain at the origin and, with `fitZ`, rescale z to about 0.7× the larger xy span. Anything added to the scene (labels, frame, picking) must go through these functions.
  - Every `plot()` call rebuilds all of `content` (surface, mesh lines, frame, label sprites) and disposes the old objects. The shared surface `material` is reused and never disposed.
  - The camera auto-frames only on first plot (`hasFramed`). `main.js` resets that flag when a preset is chosen.
  - Two slices, keyed by the axis held **fixed**: `'y'` is the plane y = y₀ with curve t ↦ f(t, y₀); `'x'` is the plane x = x₀ with curve t ↦ f(x₀, t). `t` always means the *free* coordinate. Each lives in `plot.slices[axis]` (`{ value, data, group, marker }`) with its own scene group, so `setSlice(axis, v)` redraws only that slice and dragging a slider never resamples the surface. `plot()` re-renders both slices at the end so they follow changes to the surface or scale.
  - `slices[axis].data` (`{ axis, value, tMin, tMax, ts, zs, zMin, zMax }`, from `sampleSlice` at `SLICE_SAMPLES`) is shared with the 2D chart, so f is evaluated once per slice. The 3D curve is drawn with the fat-line addon (`LineSegments2`) twice: once faint with `depthTest: false` so it shows through the surface, then solid with normal depth testing.
  - `setInsets({ left, right })` records how much of the screen the panel and charts cover. On screens wider than 600px, `resize()` centers the view between them with `setViewOffset`, and `resetView()` frames the plot to fit that gap. `main.js` re-runs `resetView()` after the first plot because the chart inset is only known once the charts are filled.
- `src/sliceChart.js` (`SliceChart`): one 2D inset chart per slice (both stacked in `#charts`), plain SVG built with DOM calls (no chart library) and redrawn on resize. Its crosshair snaps to sample indices (pointer or ←/→ keys) and reports back through `onHover(t, z)`, which `main.js` passes to `plot.setSliceMarker(axis, …)` to move that slice's 3D marker dot. Call `chart.update(plot.slices[axis].data)` and `updateChartInset()` after anything that changes a slice.
- `src/format.js`: `formatNumber` (used for every displayed number) and `niceTicks` (1/2/5 axis ticks).
- `src/main.js`: UI wiring. Form state is mirrored into the URL hash (`#expr=…&xMin=…`) via `history.replaceState`, so plots are shareable and survive reloads. `DEFAULTS` defines both the defaults and the hash schema (value types are inferred from it). Input events re-plot with a 150 ms debounce, except slice controls, which call `updateSlice(axis)` immediately. The `SLICES` table in `main.js` holds each slice's toggle/value/slider/controls/chart and is built from DOM ids following the pattern `slice{X,Y}`, `{x,y}0`, `{x,y}0Slider`, `slice{X,Y}Controls`, `slice{X,Y}Chart`. For each slice the number field is the source of truth and the slider only drives it; `syncSliceControls` keeps both clamped to the axis range.
- `src/style.css`: on screens ≤600px the panel moves to the bottom and can collapse to just the expression field. The `.collapsed` class on `#panel` only has an effect inside the mobile media query, and the choice is remembered in `localStorage` (`panelCollapsed`). Colors are CSS custom properties on `:root`, redefined under `prefers-color-scheme: dark`. The scene background, frame and label colors are read from those same variables (`applyTheme` in `main.js`), so change theme colors in CSS only. The 2D charts are styled entirely through these variables too: `[data-axis]` on a slice's fieldset or chart sets `--slice` to `--slice-x` or `--slice-y`. Both slice colors, as a pair, were checked with the dataviz skill's palette validator against both surfaces; re-run it if you change either color.
