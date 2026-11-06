# Roadmap and Rationale Spec for the Math Visualization Collection

* **Author:** Anton Rechenauer
* **Date:** 2026-11-06

## Overview

The project is a static website of interactive math pages: one HTML page per
topic, linked from `index.html`, built with Vite and plain JavaScript, deployed
to GitHub Pages on every push to `master`. Five pages exist (Riemann sums,
fundamental theorem of calculus, zeta function, exponential functions, and a
three.js surface plotter).

This brief prepares a forward-looking spec. Its readers are the owner and AI
agents who add topic pages. The spec will hold:

1. a roadmap of planned topics at high-school to undergraduate level;
2. the rule for when a topic earns its own page;
3. what it means to bring the five existing pages "in line" with the rules for
   new pages;
4. a manual verification checklist (no automated browser tests);
5. the reasons behind these decisions.

`AGENTS.md` stays the authoritative description of how pages are built. The
spec covers what comes next and why, and points to `AGENTS.md` for how.

## Analysis

The analysis below combines seven independent reviews of the idea and the
repository (design, codebase details, scope, comprehension, implementation
readiness, document structure, and contradiction analysis).

### What the code shows today

- **The URL-state helpers exist in four copies.** `stateFromHash` and
  `writeHash` are in `src/pageUtils.js` and are copied into `exponential.js`,
  `zeta.js` and `main.js`. The zeta copy reads every value as a number, unlike
  the shared one. `svgEl`, axis drawing and tick code are also copied in
  `exponential.js`, `zeta.js` and `sliceChart.js`; those copies print tick
  labels with a hyphen instead of a minus sign.
- **The exponential page has no tested math module.** Its formulas and
  properties live inside the DOM code. It is the only page that breaks the
  "pure math in a tested module" rule.
- **The surface plotter differs from the 2D pages everywhere**: its own
  stylesheet, no `#controls`/`#chart`/`#facts` layout, its home link inside
  the panel, a panel state in `localStorage`. These differences are mostly
  legitimate for a 3D page.
- **Two pages already have a second chart** (`#convergence` on the Riemann
  page, `#antiChart` on the FTC page) with near-identical CSS. The written
  rules only mention one `#chart`.
- **The README has drifted**: it uses `<sup>`/`<sub>` for math, which the
  KaTeX rule forbids on pages, and lists the exponential page under "Surface
  plotter features".
- **"Works offline" today only means "no network requests"**: all assets,
  including KaTeX fonts, are bundled. There is no service worker.
- **Every push deploys.** The workflow runs `npm test` and the build, then
  publishes. A manual checklist does not block a deploy.
- **The topic contract is not written as a list.** Today it is one prose
  paragraph ("To add a topic") plus rules spread across `AGENTS.md`.

### Contradictions and how to resolve them

1. **Every page should follow the same rules, but the 3D plotter is a
   different kind of page.** Resolve by splitting the rules into two layers:
   - *Universal rules* for every page: state in the URL hash, KaTeX for math in
     the page, a link back to the index, a pure math module with tests, a card
     on the index page, a line in the README.
   - *2D page rules* for SVG pages only: `page.css`, the `pageUtils.js`
     helpers, the `#controls`/`#chart`/`#facts` layout.

   The surface plotter must meet only the universal rules, and each exception
   is named with its reason. "In line" then becomes a short list that can be
   checked.

2. **The spec must not repeat `AGENTS.md`, yet an agent must be able to act on
   it.** Resolve by splitting by kind of content: `AGENTS.md` holds the what
   and how (rules and current state); the spec holds the why and what next
   (reasons, roadmap, exception policy). The spec refers to rules by number,
   never by copying their wording. Test: deleting either file loses
   information, and changing a rule means editing exactly one file.
   This needs the topic contract in `AGENTS.md` turned into a numbered list
   (C1, C2, …) first.

3. **No browser tests, but the pages should stay correct.** Resolve by moving
   behaviour that can be tested without a browser into pure modules covered by
   Vitest: a `parseHash(string, defaults)` function with round-trip tests, the
   exponential page's math, `extent`/`robustExtent`/`niceTicks`. Optionally add
   a Node-only check to `npm test` that reads the HTML files and confirms each
   page has an index card, a README line, a home link and a `renderStatic()`
   call, and contains no `<sup>`/`<sub>` math. No browser is involved, so this
   stays within the decision against browser tests. The manual checklist then
   only covers what needs eyes: layout, colors, interaction feel.

4. **One concept per page, but several topics belong together** (linear maps
   and eigenvectors; secant slopes, Taylor polynomials and the FTC tangent;
   sequences and ε–δ; distributions and the central limit theorem). Resolve by
   linking pages through the URL hash: the Taylor page can link to
   `derivative.html#…` with the user's current function and point, so pages
   stay single-concept while the path through related ideas stays connected.
   Pages may share math modules (`integral.js` is already shared by the
   Riemann and FTC pages). The roadmap becomes a dependency graph instead of a
   flat list. Cost: hash keys become a public interface between pages;
   renaming one breaks links into that page.

5. **The current stack does not cover every planned topic.**
   - *Central limit theorem*: random samples, but shared links must show the
     same picture. Store a seed in the hash and use a seeded random generator
     in a tested module.
   - *Complex functions*: `compileFunction` turns complex results into `NaN`,
     and a domain-coloring image needs about 250,000 evaluations per redraw at
     500×500 pixels, which SVG cannot draw. Needs a complex evaluation path
     that leaves existing callers unchanged, a canvas layer as a third way of
     drawing, and a time budget (for example under 100 ms per redraw at the
     default resolution).
   - *Linear maps and eigenvectors*: a 2×2 matrix does not fit the current
     hash value types; needs an encoding such as `m=a,b,c,d`. Also needs axes
     with equal scale in x and y (the current `axes` scales them separately)
     and arrow drawing.
   - *ODE direction fields*: the RK4 integrator is built into the geodesic
     code in `surface.js`; extract a general stepper and re-check the 3D page.
   - *Taylor polynomials*: high-order finite differences are numerically
     unstable. Decide between math.js symbolic `derivative` and numeric
     methods.

   Rule for the spec: it only records that a gap exists for a topic. The new
   convention goes into `AGENTS.md` in the same change as the first page that
   needs it.

### Secondary trade-offs

- **Bundle size.** `pageUtils.js` imports math.js through `constant`. Moving
  the exponential and zeta pages onto it may pull math.js into pages that do
  not use it. Either split `pageUtils.js` into a drawing/URL part and a
  math.js part, or compare `npm run build` chunk sizes before and after.
- **`AGENTS.md` growth.** Each page now has a dense paragraph there. Ten more
  topics will make it long for every agent to read. Option: about three lines
  per topic in `AGENTS.md`, with details in a header comment in each page's
  module.
- **The layered rules** are clearer, but someone has to decide which layer
  each new rule belongs to.
- **Canvas drawing** opens up complex functions but adds a third drawing
  convention to document.

### Ideal Final Result

A short spec containing: a topic dependency graph with each topic's drawing
method and missing infrastructure; a testable rule for when a topic gets a
page, with examples; an exception policy for existing pages, naming the
surface plotter's exceptions; a short checklist for what only a person can
check; and decision records. It points to `AGENTS.md` for every "how". Most
rules check themselves through Vitest tests of pure modules and static checks
of the HTML files. Every existing shared URL still opens the same view. New
pages link to related pages through hash links, so single-concept pages do
not leave the learner without a path.

## Goals vs. Non-Goals

* **In-Scope Goals:**
  - A roadmap entry for each of the ten topics (derivative as the limit of
    secant slopes, Taylor polynomials, sequences and convergence, ε–δ, Fourier
    series, linear maps in 2D, eigenvectors, ODE direction fields, complex
    functions, probability distributions and the central limit theorem), split
    into separate candidate pages where a topic holds several concepts. Each
    entry lists: file name, level and prerequisite pages, the core picture in
    one sentence, the main interaction, the math module and what its tests
    cover, what it reuses, what new infrastructure it needs, which rules it
    strains, links to and from other pages, open questions, and status.
  - A testable rule for when a topic gets its own page. The owner's rule is:
    one concept, a clear visual representation, relatively self-contained. The
    spec turns this into a check (for example: one main interaction changes one
    picture in a way that shows the concept's defining property), says what
    "self-contained" means, gives one example that passes and one that fails,
    and says what happens to a topic that fails (extend a page, split, drop).
  - A definition of "in line": the universal and 2D rule layers, a target for
    each existing page, the surface plotter's named exceptions, and when the
    work counts as done.
  - Backward compatibility as a hard rule: hash keys, value types and HTML
    file names of all five pages stay the same; the `index.html#expr=…`
    redirect stays; a key that must change is still read under its old name.
  - A manual checklist with numbered steps and expected results: page loads
    without console errors or raw `\(`; hash round-trip and one saved legacy
    URL per page; bad hash values fall back without errors; light and dark
    theme; phone width; offline on `npm run build && npm run preview` with no
    external requests; keyboard ←/→ and visible focus; home link and index
    card. It says when it runs (before pushing to `master`) and which steps a
    given change requires (shared module: all pages; one page: that page and
    the index).
  - Decision records with technical reasons: no browser tests, the URL hash as
    the only page state (except the surface panel's collapsed state), no
    framework, KaTeX everywhere, one concept per page as separate Vite entries.
  - A definition of "offline": all assets bundled, no network requests while
    running.
  - A line stating that `AGENTS.md` wins any conflict, a "last reviewed" date
    and commit, and a pointer from the "Specs and reviews" section of
    `AGENTS.md`.

* **Out-of-Scope Non-Goals:**
  - Playwright, Puppeteer or any browser scripts in the repository.
  - A framework, TypeScript, a server, analytics or a CDN.
  - Restating or changing the page-building rules inside the spec.
  - Changing existing hash keys or file names.
  - Rebuilding the surface plotter on the 2D layout and helpers.
  - An installable app or cache-first offline mode.
  - Detailed interface design for each topic before someone starts it; that
    belongs in the topic's own spec.
  - New shared abstractions beyond `pageUtils.js` (no chart library, page base
    class or state framework).
  - A fixed order or schedule for the roadmap (an order based on reuse may be
    suggested).
  - Changes to the KaTeX rules or the 3D label exception.

## Alternatives Weighed

- **Automated browser tests (Playwright or similar).** Rejected by author.
  Technical reasons to record in the spec: browser downloads in CI, unreliable
  headless WebGL for the three.js page, and maintenance cost for a one-person
  project. Cost of the choice: regressions are found later, by hand; reduced
  by moving logic into pure modules with Vitest tests.
- **Rewriting the surface plotter onto the 2D conventions.** Rejected: no
  clear end point, and a 3D page has real reasons to differ.
- **A spec that restates the page-building rules.** Rejected by author
  (`AGENTS.md` is authoritative): two copies drift, as the README already has.

## Key Decisions & Staging for Next Steps

**Decided by the author:**

- The spec is forward-looking; readers are the owner and AI agents adding
  topics.
- Level: high school to undergraduate.
- All ten listed topics are in the roadmap.
- A topic earns a page if it is one concept with a clear visual representation
  and is relatively self-contained.
- No automated browser tests.
- Rules apply to existing pages as well.
- `AGENTS.md` is authoritative; the spec holds roadmap and reasons.
- **The topic contract in `AGENTS.md` becomes a numbered rule list**
  (C1, C2, …, split into universal and 2D layers) as part of this work. The
  spec and the conformance work refer to these numbers. This is an edit to
  `AGENTS.md`, made alongside the spec, not inside it.
- **A Node-only static check of the HTML files in `npm test` is accepted.**
  It reads the files without a browser and checks that every top-level page
  has an index card, a README line, a home link and a `renderStatic()` call,
  and uses no `<sup>`/`<sub>` for math. Browser tests remain out of scope.
- **The topics that don't fit the current setup stay in the roadmap with their
  gaps flagged**: complex functions (complex evaluation, canvas drawing, time
  budget), central limit theorem (seed in the hash, seeded random generator),
  linear maps and eigenvectors (matrix encoding in the hash, equal-scale axes,
  arrows), ODE direction fields (RK4 stepper extracted from `surface.js`). Each
  gap gets its convention in `AGENTS.md` with the first page that needs it.
- Backward compatibility of existing URLs is a hard rule, guarded by a pure,
  unit-tested hash parser, one saved legacy URL per page in the checklist, and
  one commit per page during conformance work.

**Still open, to settle before or during `/egm-draft`:**

1. Where the page-admission rule and the checklist live: `AGENTS.md`, the
   spec, or a separate linked file.
2. How to split or merge overlapping topics: secant derivative versus the FTC
   tangent, ε–δ versus ε–N in sequences, linear maps and eigenvectors as one
   page or two.
3. Symbolic versus numeric derivatives for Taylor polynomials.
4. Whether pages may have more than one chart ("one main chart, optional
   extras"), as the Riemann and FTC pages already do.
5. Whether `main.js` moves to the shared hash helpers (only if no URL
   changes) and whether the surface plotter gets a header home link.
6. Whether the README falls under the KaTeX rule.
7. Order: reviewers suggest, without deciding, (a) bring the exponential and
    zeta pages in line first, so new pages copy the right pattern; (b) secant
    derivative, Taylor, sequences and ε–δ, which reuse the SVG helpers; (c)
    linear maps, then eigenvectors; (d) Fourier series, ODE fields, central
    limit theorem and complex functions last, since they need new
    infrastructure.
