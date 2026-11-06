# Topic Roadmap, Page Contract and Conformance of Existing Pages

*   **Author:** Anton Rechenauer
*   **Status:** Approved
*   **Date:** 2026-11-06

--------------------------------------------------------------------------------

## Overview

functionplot is a static website of interactive math pages for high-school and
undergraduate topics: one HTML page per topic, linked from `index.html`, built
with Vite and plain JavaScript, deployed to GitHub Pages on every push to
`master`. Five pages exist: Riemann sums, the fundamental theorem of calculus,
the zeta function, exponential functions, and a three.js surface plotter.

This document does two things:

1.  **It is the lasting spec for adding topics.** It holds the topic roadmap,
    the rule for when a topic earns its own page, and the reasons behind the
    project's main decisions. It is written for the owner and for AI agents
    who add pages.
2.  **It plans the one-off conformance work** that makes the five existing
    pages follow the same rules as new pages, without breaking any link that
    has already been shared.

`AGENTS.md` stays the authoritative description of how a page is built. This
document says what comes next and why, and refers to the rules in `AGENTS.md`
by number instead of repeating them. When the two disagree, `AGENTS.md` wins
and this document is corrected. Project terms used here without explanation
(for example `renderStatic()`, `svgTex`, and how the surface plotter's files
split the work) are described in `AGENTS.md`.

## The Problem

New pages have so far been added one request at a time, and the rules for a
page grew with them. That has three costs:

*   **The rules are not written as rules.** The "contract" for a topic page is
    one prose paragraph in `AGENTS.md` ("To add a topic") plus conventions
    spread through the file (KaTeX, URL state, shared helpers). An agent
    cannot check a page against it, and a reviewer cannot say which rule a
    page breaks.
*   **Existing pages already disagree with the rules.** The URL-state helpers
    exist in four copies (`pageUtils.js`, `exponential.js`, `zeta.js`,
    `main.js`). They behave the same for each page's settings today, but any
    fix has to be made four times, and the zeta copy is written differently
    (it reads every value as a number, which only works because all its
    settings are numbers). Chart drawing code is copied in `exponential.js`, `zeta.js`
    and `sliceChart.js`, with tick labels that use a hyphen instead of a
    minus sign. The exponential page keeps its math inside DOM code with no
    tests. The README uses `<sup>` for math, which pages may not. An agent
    that copies an existing page as a starting point copies these
    deviations; this is how the four copies came about.
*   **There is no plan for what comes next.** The owner wants ten more topics,
    but nothing records their order, which ones need infrastructure the
    project lacks (canvas drawing, complex numbers, random sampling, matrices
    in the URL), or how overlapping topics relate to each other and to
    existing pages.

Checking is the weak point underneath all three. Only the math modules have
tests, and browser behaviour has been checked by hand or with throwaway
scripts that are not in the repository. Every push to `master` deploys, so
`npm test`, which CI runs first, is the only check between a change and users.
This spec moves as much as it can into `npm test`.

**Proposed solution:** number the page contract in `AGENTS.md`, move the parts
of page behaviour that can be tested without a browser into pure modules with
Vitest tests, add a static check of the HTML files to `npm test`, bring the
existing pages in line one page per commit while keeping every existing URL
working, and record the roadmap and the decisions in this spec.

## Goals

*   **G1. Numbered page contract.** The topic contract in `AGENTS.md` becomes a
    numbered rule list (U1–U10 and P1–P5) in two layers: universal rules for every
    page, and rules for 2D SVG pages. Each rule says what is required and how
    it is checked (unit test, static check, or manual checklist item).
*   **G2. Page-admission rule.** A rule for when a topic gets its own page, based on the owner's rule (one concept, a clear visual
    representation, relatively self-contained), with one example that passes,
    one that fails, and what happens to a topic that fails.
*   **G3. Topic roadmap.** An entry for each of the ten planned topics (secant
    slopes and the derivative, Taylor polynomials, sequences and convergence,
    ε–δ, Fourier series, linear maps in 2D, eigenvectors, ODE direction fields,
    complex functions, probability distributions and the central limit
    theorem). Each entry names its page file, level, core picture and main
    interaction, math module, what it reuses and what infrastructure it still
    needs, and links to related pages. Topics that need new infrastructure
    stay in the roadmap with their gaps named. An entry is deleted when its
    page ships.
*   **G4. Existing pages in line.** After the conformance work, each of the
    five pages either meets every rule in its layer or has a named exception
    with a reason in this spec. Measured by: no helper exists in more than one
    copy among the 2D pages; every page's math lives in a tested module; the
    sentence in `AGENTS.md` saying that `exponential.js` and `zeta.js` "still
    have their own copies" of the shared helpers is gone.
*   **G5. No broken links.** Every URL that worked before the conformance work
    opens the same view afterwards: same file names, same hash keys, same
    value types, same clamping, and the `index.html#expr=…` redirect to the
    surface plotter. Measured by fixtures in the hash-parser tests: one saved
    hash string per page with its expected state. Every new page adds one.
*   **G6. Checks without a browser.** `npm test` gains (a) round-trip and
    fixture tests for the shared hash parser, (b) tests for the exponential
    page's math and for the chart range helpers `extent` and `robustExtent`
    (`niceTicks` is already tested), and (c) a static check of the HTML
    files: every top-level page has an index card, a README line, a home link
    and a `renderStatic()` call, uses no `<sup>`/`<sub>`, and 2D pages contain
    no copied helper code. These run in CI before every deploy.
*   **G7. Manual checklist.** A short numbered checklist for what only a
    person can judge (layout, theme, phone width, interaction), with an
    expected result per step. The owner runs it before pushing to `master`;
    agents stop after `npm test` and list the steps for the owner as pending.
    A shared-module change needs all pages; a one-page change needs that page
    and the index.
*   **G8. Decision records.** The project's main decisions are recorded with
    their technical reasons and costs: no browser tests, the URL hash as the
    only page state, no framework, KaTeX for all math, one concept per page as
    separate Vite entries, what "offline" means.

## Non-Goals

*   **Browser tests of any kind.** No Playwright, Puppeteer or committed
    browser scripts.
*   **New topic pages.** The roadmap plans them; building them is separate
    work, each with its own design if needed.
*   **Rebuilding the surface plotter** on the 2D layout, `page.css` or
    `pageUtils.js`. It meets the universal rules only, with named exceptions.
*   **Changing existing URLs.** No renamed files, hash keys or value types.
*   **New shared abstractions** beyond splitting or extending `pageUtils.js`:
    no chart library, page base class or state framework.
*   **A framework, TypeScript, a server, analytics or a CDN.**
*   **An installable app or cache-first offline mode.** "Offline" means all
    assets are bundled and nothing is fetched while the page runs.
*   **A fixed schedule for the roadmap.** The spec may suggest an order based
    on reuse; the owner decides.
*   **Changes to the KaTeX rules** or to the exception for the 3D view's
    canvas labels.
*   **Restating `AGENTS.md`.** This spec refers to rules by number; it does
    not copy their wording.

## Open Questions

*   **Q1**: How are overlapping topics split or merged: the secant derivative
    versus the FTC page's tangent, ε–δ versus ε–N in sequences, linear maps
    and eigenvectors as one page or two? The admission rule (below) gives the
    test; each case is decided when the topic is picked up.
*   **Q2**: Symbolic (math.js `derivative`) or numeric derivatives for Taylor
    polynomials? Decided with the Taylor page.
*   **Q3**: In which order are the roadmap topics built? The roadmap suggests
    an order based on reuse; the owner decides.

## Critical User Journeys (CUJs)

### CUJ 1: An agent adds a roadmap topic

*   **Given**: The roadmap entry for the topic, `AGENTS.md` with the numbered
    contract, and this spec.
*   **When**: The agent is asked to add the page.
*   **Then**: It applies the admission rule first (and reports back if the
    topic fails it), builds the page from the shared modules without copying
    helpers, adds any convention the topic needs (for example a matrix
    encoding in the hash) to `AGENTS.md` in the same change, adds a fixture
    for the page's hash to the parser tests, and passes `npm test` including
    the static page check. It then stops and lists the manual checklist steps
    for the new page and the index as pending for the owner, and deletes the
    topic's roadmap entry once the owner has pushed the page.

### CUJ 2: A learner opens a link shared before the conformance work

*   **Given**: A URL such as `zeta.html#n=100&xMax=6&yMax=5` or
    `index.html#expr=sin(x)` saved months ago.
*   **When**: They open it after the conformance work has shipped.
*   **Then**: They see the same view as before: same page, same values, same
    clamping. The old surface-plotter link is still forwarded to
    `surface.html`. "Same view" means the same controls and values; axis
    tick labels may change (see the exponential and zeta conformance work).

### CUJ 3: The owner brings one existing page in line

*   **Given**: A page with copied helpers (for example `zeta.js`).
*   **When**: The owner or an agent works through that page's conformance
    steps.
*   **Then**: One commit changes one page or one shared module; `npm test`
    passes, including that page's hash fixture; the owner runs the checklist
    for the touched pages. Rollback is `git revert` of that commit.

## Technical Plan (Architecture)

### Which document holds what

```text
                 authoritative                         forward-looking
 ┌──────────────────────────────────────┐   ┌──────────────────────────────────┐
 │ AGENTS.md                            │   │ specs/<spec>.md (this document)  │
 │  - numbered contract U1…, P1…        │──▶│  - page-admission rule           │
 │    (what each page must do,          │   │  - manual checklist              │
 │     and how each rule is checked)    │   │  - topic roadmap                 │
 │  - architecture and current state    │   │  - decision records D1…          │
 │  - 2 mandatory pointers ─────────────┼──▶│  - conformance plan (temporary)  │
 └──────────────────────────────────────┘   └──────────────────────────────────┘
          ▲ rules referenced by number, never copied ◀──┘
```

A rule change edits exactly one file: rules live in `AGENTS.md`, reasons and
plans in the spec. If they disagree, `AGENTS.md` wins and the spec is
corrected. The two mandatory pointers in `AGENTS.md` are: "Before adding a
topic, apply the admission rule in this spec" and "Before pushing to
`master`, the owner runs this spec's manual checklist for what changed."
They make the admission rule and checklist binding even though they live
here (author's choice; the cost is that a must-follow rule lives outside the
authoritative file).

### Page contract

The page contract (U1–U10, P1–P5, with check types and the surface
plotter's named exceptions) is in `AGENTS.md`, section "Page contract".

### Page-admission rule

A topic gets its own page when all three hold:

1.  **One concept.** It can be named in one sentence ("the derivative is the
    limit of secant slopes"), not a list.
2.  **One clear picture.** One main interaction (a slider or a drag) changes
    one main picture, and the change shows the concept's defining property.
3.  **Self-contained.** A learner can understand the page from its own
    controls and text. It may link to prerequisite pages (U6 hash links can
    carry the current example) but must not require visiting them. Pages may
    share math modules.

*Passes:* Riemann sums. One concept (the integral as a limit of sums), one
picture (rectangles under a curve), one interaction (n) that shows the
defining property (the sums close in on the area).

*Fails:* "Integration techniques". Several concepts (substitution, parts,
partial fractions), and none has a single picture whose change shows it.

*When a topic fails:* if an existing page already shows the concept's
defining property as its main picture, extend that page instead. If the topic
holds several concepts, split it into candidate pages and test each. If no
picture shows the concept, drop it from the roadmap.

### Topic roadmap

An entry is deleted when its page ships. Suggested order (not decided, Q3):
(a) conformance work first; (b) secant derivative, Taylor polynomials,
sequences, ε–δ (reuse the SVG helpers); (c) linear maps, eigenvectors;
(d) Fourier series, ODE direction fields, central limit theorem, complex
functions (need new infrastructure).

| Page (planned file) | Level | Core picture and interaction | Math module | Reuses / needs | Links |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Secant to tangent (`derivative.html`) | HS | Secant through x₀ and x₀+h; drag h → 0, slope converges | difference quotients | SVG helpers, `expression.js` / none | ftc (Q1: overlap with its tangent) |
| Taylor polynomials (`taylor.html`) | HS–UG | f and its degree-n Taylor polynomial at x₀; slider n, drag x₀ | coefficients, remainder | SVG helpers / derivatives of order n (Q2) | derivative |
| Sequences and convergence (`sequences.html`) | HS–UG | Terms aₙ as dots with an ε-band around the limit; slider ε shows N(ε) | N(ε) search, limits | SVG helpers / none | epsilon-delta (Q1) |
| ε–δ continuity (`epsilon-delta.html`) | UG | Band of half-height ε around f(x₀) and a window of half-width δ around x₀; the learner sets ε, then searches for a δ that works by dragging the window. Parts of the graph over the window that leave the band are highlighted, so the learner sees why a δ fails. A "show answer" control reveals the largest δ only after the learner has tried. | check of a given δ (largest deviation of f over the window), largest valid δ for the answer | SVG helpers / none | sequences (Q1) |
| Fourier series (`fourier.html`) | UG | Partial sums of a periodic function; slider for the number of terms, Gibbs overshoot visible | coefficients by numeric integration | `integral.js` / none | riemann |
| Linear maps in 2D (`linear-maps.html`) | HS–UG | Unit square and grid under a 2×2 matrix; drag the images of e₁, e₂ | matrix ops, determinant | SVG helpers / **matrix encoding in the hash, equal-scale axes, arrows** | eigenvectors |
| Eigenvectors (`eigenvectors.html`) | UG | Unit circle under a matrix; directions that stay on their line are highlighted | eigen decomposition (2×2) | linear-maps infrastructure / same gaps (Q1: one page or two) | linear maps |
| ODE direction fields (`ode.html`) | UG | Arrow field of y′ = f(x, y); click to start a solution curve | RK4 stepper | `expression.js` / **RK4 extracted from `surface.js`**, arrows | — |
| Complex functions (`complex.html`) | UG | Domain coloring of f(z); hover shows f(z) | complex evaluation | — / **complex evaluation path, canvas drawing; redraw speed must be measured, and dragging may need a lower resolution** | — |
| Distributions and the CLT (`clt.html`) | HS–UG | Histogram of sample means approaching the normal curve; slider for sample size | seeded random generator, densities | SVG helpers / **seed in the hash, seeded generator** | — |

HS = high school, UG = undergraduate. Bold gaps get their convention in
`AGENTS.md` in the same change as the first page that needs it. The spec only records that the gap exists.

### Manual checklist

The owner runs this before pushing to `master`; agents stop after `npm test`
and list the steps as pending. A change to a shared module (`pageUtils.js`,
`tex.js`, `expression.js`, `page.css`, `theme.css`) needs all pages; a change
to one page needs that page and `index.html`. Old links are covered by the
hash fixtures in `npm test`, not by this list.

| # | Step (on `npm run build && npm run preview`) | Expected result | Rule |
| :- | :--- | :--- | :--- |
| 1 | Open the page with no hash. | Default view; no console errors; no raw `\(` visible. | U5 |
| 2 | Change controls, reload. | Same view after reload. | U6 |
| 3 | Open with a broken hash, e.g. `#n=abc`. | No errors; the broken value keeps its default (an empty value such as `xMax=` reads as 0, as it always has). | U6 |
| 4 | Switch the OS to dark mode. | All colors follow; text readable. | U8 |
| 5 | Narrow the window to 390 px. | No horizontal scroll; controls usable. | U10 |
| 6 | Focus a chart, press ←/→. | Readout moves; focus ring visible. | P5 |

### Decision records

*   **D1. No browser tests.** *Context:* behaviour in the browser can break
    unseen, and every push deploys. *Decision:* no Playwright or similar;
    pure-module unit tests, a static page check and a manual checklist
    instead. *Alternatives rejected:* Playwright in CI (browser downloads in
    CI, unreliable headless WebGL for the 3D page, maintenance cost for a
    one-person project). *Consequences:* visual and interaction regressions
    are found by hand, later; reduced by moving logic into tested modules.
*   **D2. The URL hash is the only page state.** Every view can be shared and
    survives a reload, with no server or storage. Cost: hash keys are a
    public interface; a renamed key must still be read under its old name
    (U6). Exception: the surface
    panel's collapsed state, a viewer preference.
*   **D3. No framework, plain JavaScript modules.** Pages are small and
    independent; a framework would add build and upgrade cost without a
    shared component model to justify it. Cost: DOM code is written by hand,
    which is why shared helpers in `pageUtils.js` matter.
*   **D4. KaTeX for all math.** Consistent typesetting, bundled from npm so it
    works offline. Cost: 263 kB (79 kB gzipped) on every page; canvas labels
    in the 3D view are exempt.
*   **D5. One concept per page, each a separate Vite entry.** Pages load only
    what they use and can be understood alone; related pages connect through
    hash links. Cost: some helpers and styles must be shared deliberately or
    they get copied.
*   **D6. "Offline" means bundled assets only.** No service worker or
    installable app; the page makes no network requests while running.

### Conformance work: module changes

```text
 before                                     after
 ──────                                     ─────
 pageUtils.js ─ hash, svg, chart helpers    pageUtils.js ─ hash (parseHash, serializeHash,
   (constant() already moved out, 62c9a53)    stateFromHash, writeHash), svg, chart helpers
 exponential.js ─ own hash, svgEl,          exponentialMath.js ─ numbers for a·e^(bx+c)+d (tested)
   axes, ticks, inline math                 exponential.js, zeta.js, main.js, sliceChart.js
 zeta.js ─ own hash, svgEl, axes, ticks       ─ import the shared helpers; no local copies
 main.js ─ own hash
 sliceChart.js ─ own svgEl
```

*   **Hash parser, in `src/pageUtils.js`:** `parseHash(hash, defaults)` and
    `serializeHash(state)` are the current `stateFromHash`/`writeHash` code
    of `pageUtils.js`, moved unchanged into two functions that take and
    return strings instead of touching `location`. `stateFromHash` and
    `writeHash` stay as thin wrappers over them. The four existing copies
    differ in form but give the same result for each page's own settings:
    zeta's reads every value as a number, which works because all its
    settings are numbers; exponential's has no string branch because it has
    no string settings. So moving every page onto the shared parser changes
    no URL.
*   **`src/exponentialMath.js` (new, pure):** the numbers the exponential page
    shows (value, slope, scale a·eᶜ, shift, zero, doubling time or
    half-life, tangent foot on the asymptote). The page's `properties()`
    keeps building the explanation text but takes its numbers from here.
*   **Page scripts:** `exponential.js` and `zeta.js` drop their local
    `svgEl`, axis and tick code and use `frame`/`axes`/`polyline`. That also
    fixes their tick labels, which use a hyphen instead of a minus sign, and
    their clip path id, which is fixed as `plotArea` instead of derived from
    the figure. `main.js` and `sliceChart.js` drop their local hash and
    `svgEl` copies. Page-specific clamping (`clampN`, rule validation) stays
    in each page as a wrapper with any name.
*   **Static page check (`src/pages.test.js`, new):** added after the last
    page commit, so it passes on its first run; see target file 14.
*   **One page or one shared module per commit.**

### Conformance plan (temporary; deleted in the cleanup commit)

| Page | Work |
| :--- | :--- |
| exponential | shared hash, svg and chart helpers; `exponentialMath.js` with tests |
| zeta | shared hash, svg and chart helpers |
| surface | shared hash parser in `main.js`, shared `svgEl` in `sliceChart.js` |
| riemann | extra figure uses `chart-figure` class |
| ftc | extra figure uses `chart-figure` class |

## Alternatives Considered

### Alternative A: Automated browser tests (Playwright or similar)

*   **Pros**: Catches broken interaction, layout and KaTeX rendering before
    deploy; could check every old URL in a real browser on every push.
*   **Cons**: Downloads browsers in CI; headless WebGL is unreliable for the
    three.js surface plotter; tests of hover and drag need upkeep whenever a
    page's layout changes.
*   **Reason for Rejection**: The upkeep and CI cost is high for a one-person
    project, while pure-module tests, fixtures and a static check cover most
    regressions; visual and interaction regressions are found later, by hand
    (decided by the author).

### Alternative B: Rebuild the surface plotter on the 2D conventions

*   **Pros**: One set of rules for every page; no named exceptions.
*   **Cons**: The 3D page has its own layout (floating panel, inset charts,
    canvas) for real reasons; the work has no clear end point and risks
    breaking a working page and its shared links.
*   **Reason for Rejection**: The risk and open-ended work outweigh having no
    exceptions; the surface plotter meets the universal rules with named
    exceptions (decided by the author).

### Alternative C: A spec that restates the page contract

*   **Pros**: One document holds everything an agent needs.
*   **Cons**: Two copies of the rules drift apart, as the README already has
    from the pages.
*   **Reason for Rejection**: Drift between copies; `AGENTS.md` holds the
    rules and this spec refers to them by number (decided by the author).

### Alternative D: Spec only, or spec and conformance design as two documents

*   **Pros**: A spec without migration steps stays clean and lasting; a
    separate conformance design could be archived when done.
*   **Cons**: Spec only leaves agents to make the conformance decisions
    without a plan; two documents cost two review cycles, and the second may
    never be written, leaving the rules untrue for existing pages.
*   **Reason for Rejection**: One document covers both, and its conformance
    parts are deleted in the cleanup commit (decided by the author).

### Alternative E: Admission rule and checklist in `AGENTS.md`

*   **Pros**: Must-follow rules stay in the authoritative file that every
    agent reads automatically.
*   **Cons**: `AGENTS.md` grows by about 40 lines and is already the longest
    file loaded in every session; a separate checklist file is not loaded
    automatically.
*   **Reason for Rejection**: A shorter `AGENTS.md`, at the cost of a
    must-follow rule living outside it; two mandatory pointers in
    `AGENTS.md` bind both (decided by the author).

### Alternative F: The ε–δ page finds δ for the learner

*   **Pros**: Simpler page: the learner moves ε and reads off δ.
*   **Cons**: The learner watches instead of doing the search that the
    definition describes.
*   **Reason for Rejection**: Doing the search is the point of the page; the
    page shows why a δ fails and reveals the largest δ only on request
    (decided by the author).

### Alternative G: Gate deploys behind a manual step

*   **Pros**: The manual checklist could block a release instead of only
    advising (deploy by manual dispatch, a tag or a release branch).
*   **Cons**: An extra step for every change; a one-person project pushes
    small fixes often, and the step would soon be skipped.
*   **Reason for Rejection**: The cost outweighs the benefit at this size;
    instead as much as possible moves into `npm test`, which CI runs before
    every deploy (decided by the author).

### Alternative H: A separate pure module for the hash parser

*   **Pros**: Tests import the parser without loading `pageUtils.js` and its
    KaTeX import.
*   **Cons**: One more module for two small functions; Vitest already loads
    KaTeX in `tex.test.js`.
*   **Reason for Rejection**: Not worth a module; the parser stays in
    `pageUtils.js` (decided by the author).

### Alternative I: Add the static page check first, with a list of pages not yet in line

*   **Pros**: The check guards each page from the moment it is brought in
    line.
*   **Cons**: Needs a per-page list of skipped rules, kept in step by hand in
    every page commit.
*   **Reason for Rejection**: The bookkeeping costs more than the few commits
    of protection; the check is added after the last page commit and passes
    on its first run (decided by the author).

--------------------------------------------------------------------------------

## Non-Functional Requirements

*   **Backward compatibility (critical):** every URL that worked before must
    open the same view after (G5, U6). Guarded by the hash fixtures in
    `src/pageUtils.test.js`.
*   **Size:** pages that parse no user expression (exponential, zeta) must not
    load the math.js chunk. This was fixed in commit `62c9a53`, which moved
    `constant()` from `pageUtils.js` to `expression.js`; `src/pages.test.js`
    keeps it from coming back (U9).
*   **Rollout and rollback:** every push to `master` deploys, so each
    conformance step is one commit that passes `npm test` and `npm run build`
    before it is pushed. Rollback is `git revert <commit>` and a push.

--------------------------------------------------------------------------------

## Detailed Implementation Plan

Every commit follows the same procedure: `npm test` passes, `npm run build`
passes, the owner runs the manual checklist for the pages it touched (all
pages after a shared-module change), then it is pushed. An agent doing the
work stops after `npm test` and `npm run build` and lists the checklist steps
for the owner. Pages are referred to by file stem (`exponential` for
`exponential.html`).

### Commit order

1.  Documents: the contract and pointers in `AGENTS.md`; this spec set to
    Approved, with the rule table replaced by a pointer.
2.  Shared modules: `parseHash`/`serializeHash` in `pageUtils.js` with
    `src/pageUtils.test.js`; `.chart-figure` in `page.css`.
3.  exponential.
4.  zeta.
5.  surface.
6.  riemann.
7.  ftc.
8.  Static page check `src/pages.test.js` (passes on its first run).
9.  README fixes.
10. Cleanup: delete the conformance parts of this spec and the "still have
    their own copies" clause in `AGENTS.md`.

### Target Files to Create/Modify

#### 1. `specs/roadmap-and-page-contract.md` (Modify; commits 1 and 10)

*   **Type / Scope**: Documentation (this document).
*   **Proposed Changes**:
    *   Commit 1: Status becomes Approved. The "Proposed contract" table is
        replaced by one line: "The page contract (U1–U10, P1–P5) is in
        `AGENTS.md`."
    *   Commit 10: delete these headings and their content: "CUJ 3: The owner
        brings one existing page in line", "Conformance work: module
        changes", "Conformance plan (temporary; deleted in the cleanup
        commit)", "Non-Functional Requirements" and "Detailed Implementation
        Plan". Everything else stays.

#### 2. `AGENTS.md` (Modify; commits 1–8 and 10)

*   **Type / Scope**: Documentation (authoritative contract).
*   **Proposed Changes**:
    *   Commit 1: replace the "To add a topic" paragraph with the rule table
        (U1–U10, P1–P5, with check types and the surface plotter's named
        exceptions) and a short procedure: apply the admission rule, build
        from the shared modules, add a hash fixture, pass `npm test`, list
        the checklist for the owner. Add the two mandatory pointers to the
        "Specs and reviews" section (wording in "Which document holds
        what"). In line 18, remove `constant` from the list of
        `pageUtils.js` helpers (it moved to `expression.js` in `62c9a53`)
        and add it to the `expression.js` description. Rules are described
        without naming modules that don't exist yet.
    *   Commit 2: describe `parseHash`/`serializeHash` and `.chart-figure`.
    *   Commits 3–7: update each page's paragraph when it changes (for
        example `exponentialMath.js` for the exponential page).
    *   Commit 8: mention `src/pages.test.js` under Commands.
    *   Commit 10: delete the clause "while `exponential.js` and `zeta.js`
        still have their own copies of the chart and hash helpers" from line
        18; the rest of the sentence stays.

#### 3. `src/pageUtils.js` (Modify; commit 2)

*   **Type / Scope**: Shared 2D helpers.
*   **Proposed Changes**: Split the current `stateFromHash`/`writeHash` code,
    unchanged in behaviour, into `parseHash(hash, defaults)` (takes the hash
    string including its leading `#`, returns the state) and
    `serializeHash(state)` (returns the string without `#`).
    `stateFromHash(defaults)` becomes `parseHash(location.hash, defaults)`;
    `writeHash(state)` becomes
    `history.replaceState(null, '', '#' + serializeHash(state))`.

#### 4. `src/pageUtils.test.js` (Create; commit 2)

*   **Type / Scope**: Vitest unit tests.
*   **Proposed Changes**:
    *   Each page's `DEFAULTS` is copied literally into the test, with a
        comment naming the source file (the page scripts touch the DOM and
        cannot be imported).
    *   Round trip for each page: `parseHash('#' + serializeHash(d), d)`
        equals `d`.
    *   One fixture per page (the old URLs to protect), each with its
        expected state:
        *   exponential `#a=-2&b=-0.5&c=1&d=3&xMin=-4&xMax=4&yMin=-2&yMax=8&showRef=1`
            → `{ a: -2, b: -0.5, c: 1, d: 3, xMin: -4, xMax: 4, yMin: -2, yMax: 8, showRef: true }`
        *   zeta `#n=100&xMax=6&yMax=5` → `{ n: 100, xMax: 6, yMax: 5 }`
        *   surface `#expr=sin(x)%2Bcos(y)&sliceX=1&sliceY=1` → the surface
            defaults with `expr: 'sin(x)+cos(y)'`, `sliceX: true`,
            `sliceY: true`
        *   riemann `#expr=x%5E2&a=0&b=2&n=50&rule=left&band=1` →
            `{ expr: 'x^2', a: '0', b: '2', n: 50, rule: 'left', band: true }`
        *   ftc `#expr=cos%28x%29&a=0&xMin=-1&xMax=7&b=2&n=8&rule=midpoint&rects=0`
            → `{ expr: 'cos(x)', a: '0', xMin: '-1', xMax: '7', b: 2, n: 8, rule: 'midpoint', rects: false }`
    *   Broken values behave as today: `n=abc` keeps the default; `xMax=`
        reads as `0`; `showRef=abc` reads as `false`; unknown keys are
        ignored.
    *   `extent([1, 3], 0)` is `[0 − 0.24, 3 + 0.24]` (8 % padding including
        the extra value); `robustExtent` of 199 values in [0, 1] plus one
        value 1e9 stays within [−1, 2].

#### 5. `src/page.css` (Modify; commit 2)

*   **Type / Scope**: Shared 2D stylesheet.
*   **Proposed Changes**: Add `.chart-figure` next to `#chart` in the rules
    for the panel box (background, border, radius, padding), `margin: 0`,
    the `figcaption` flex layout, the `svg` display, width and font, and
    `svg:focus-visible`. Grid placement and svg height stay per page.

#### 6. `src/exponentialMath.js` (Create; commit 3)

*   **Type / Scope**: Pure JavaScript module.
*   **Proposed Changes**: Functions of `p = { a, b, c, d }` for
    f(x) = a·e^(bx+c) + d:
    *   `value(p, x)` = f(x); `slope(p, x)` = b·(f(x) − d).
    *   `scale(p)` = a·eᶜ; `yIntercept(p)` = a·eᶜ + d.
    *   `shift(p)` = −c/b, `null` when b = 0.
    *   `zero(p)` = (ln(−d/a) − c)/b when a ≠ 0, b ≠ 0 and −d/a > 0;
        otherwise `null`.
    *   `factorTwoDistance(p)` = ln 2/|b|, `null` when b = 0 (doubling time
        when b > 0, half-life when b < 0).
    *   `tangentFoot(p, x)` = x − 1/b, where the tangent at x meets y = d;
        `null` when b = 0.

#### 7. `src/exponentialMath.test.js` (Create; commit 3)

*   **Type / Scope**: Vitest unit tests, tolerance 1e−12.
*   **Proposed Changes**: For a = 1, b = 1, c = 0, d = 0 at x = 0: value 1,
    slope 1, tangent foot −1, factor-two distance ln 2. For a = −2, b = −0.5,
    c = 1, d = 3: zero ≈ 1.18906 and `value(p, zero(p))` = 0. For a = 0:
    `zero` is `null`. For b = 0: `shift`, `tangentFoot` and
    `factorTwoDistance` are `null`.

#### 8. `src/exponential.js` (Modify; commit 3)

*   **Type / Scope**: Page script.
*   **Proposed Changes**: Use `stateFromHash`/`writeHash`, `svgEl`, `svgTex`,
    `frame`, `axes`, `polyline` from `pageUtils.js`; delete the local
    copies, the inline tick code and the fixed `plotArea` clip id. Take the
    numbers in `draw()`, `showHover()` and `properties()` from
    `exponentialMath.js`. Keep the local `num` and `signed` only for the
    chart's aria-label. Visible changes: tick labels use a minus sign; the
    y axis uses `axes`' tick count (5 instead of 6); x ticks stay at 8.

#### 9. `src/zeta.js` (Modify; commit 4)

*   **Type / Scope**: Page script.
*   **Proposed Changes**: Same helper replacement as exponential. `clampN`
    stays in a wrapper around `stateFromHash`. The shaded tail band keeps
    its own closed path (it is not a copied helper). Same tick changes as
    exponential.

#### 10. `src/main.js` (Modify; commit 5)

*   **Type / Scope**: Surface plotter script.
*   **Proposed Changes**: Replace the local `stateFromHash`/`writeHash` with
    imports from `pageUtils.js`, passing `DEFAULTS`. The `panelCollapsed`
    `localStorage` entry stays (named exception).

#### 11. `src/sliceChart.js` (Modify; commit 5)

*   **Type / Scope**: Surface plotter inset charts.
*   **Proposed Changes**: Import `svgEl` from `pageUtils.js`; delete the
    local copy. Its tick labels keep their hyphens (accepted under the
    surface exception).

#### 12. `riemann.html`, `src/riemann.css` (Modify; commit 6)

*   **Type / Scope**: Page markup and styles.
*   **Proposed Changes**: Add `class="chart-figure"` to `#convergence`;
    delete the `#convergence` rules that `.chart-figure` now covers; keep its
    `grid-area`, its 220 px svg height and `cursor: pointer`.

#### 13. `ftc.html`, `src/ftc.css` (Modify; commit 7)

*   **Type / Scope**: Page markup and styles.
*   **Proposed Changes**: Add `class="chart-figure"` to `#antiChart`; split
    the combined `#chart svg, #antiChart svg` rule; delete what
    `.chart-figure` covers; keep its `grid-area`, its `min(36vh, 320px)` svg
    height, `cursor: ew-resize` and the readout styles.

#### 14. `src/pages.test.js` (Create; commit 8)

*   **Type / Scope**: Vitest static check, Node `fs` only, no browser.
*   **Proposed Changes**: The repository root is
    `new URL('..', import.meta.url)`; paths like `/src/x.js` in the HTML map
    to `src/x.js`. Pages are the top-level `*.html` files except
    `index.html`. For each page:
    *   U2: `index.html` contains `href="./<page>.html"`.
    *   U3: `README.md` contains `<page>.html`.
    *   U4: the page contains `href="./index.html"`.
    *   U5: the page's module script contains `renderStatic(`; the page HTML
        contains no `<sup` and no `<sub`.
    *   U9: `pageUtils.js` does not import `./expression.js`, and neither do
        the scripts of the pages in a `NO_EXPRESSION` list (exponential,
        zeta).
    *   For pages not in `EXEMPT_FROM_2D_RULES` (surface, with a comment
        pointing to this spec): P1, the linked stylesheet starts with
        `@import './page.css';`; P2, the HTML has `id="controls"`,
        `id="chart"` and `id="facts"`; P3, the page script contains neither
        `createElementNS(` nor `URLSearchParams(location.hash`; P4, the HTML
        has `class="home"`.

#### 15. `README.md` (Modify; commit 9)

*   **Type / Scope**: Documentation.
*   **Proposed Changes**: Replace `<sup>`/`<sub>` math with GitHub `$…$`
    math, including Unicode subscripts such as `Sₙ`; move (not merge) the
    exponential page's description out of "Surface plotter features" into
    the page list; add `exponentialMath.js`, `pageUtils.test.js` and
    `pages.test.js` to the layout table; link this spec under "Project
    layout".

#### Files not changed

`index.html` (cards already exist), `vite.config.js` (entries are
discovered automatically), `.github/workflows/pages.yml` (already runs
`npm test` before deploying), `src/expression.js` (`constant()` already
moved), `src/riemann.js` and `src/ftc.js` (already use the shared helpers;
their wrappers may keep their names under P3), `src/tex.js`,
`src/theme.css`, `src/integral.js`, `src/zetaMath.js`, `src/surface.js`,
`src/plot.js`. `specs/concepts_brief.md` and the review reports stay as the
record of how this spec was made.

### Verification Plan

*   **Compilation/Build**: `npm run build` after every commit.
*   **Unit Tests**: `npm test` (Vitest) after every commit: the existing
    tests, `pageUtils.test.js` from commit 2, `exponentialMath.test.js` from
    commit 3, `pages.test.js` from commit 8.
*   **Static Analysis & Linting**: none configured in the project; not added.
*   **Test Coverage Requirement**: every exported function of
    `exponentialMath.js`, `parseHash`, `serializeHash`, `extent` and
    `robustExtent` has tests; no percentage target.
*   **E2E/Integration**: the owner's manual checklist, run on
    `npm run build && npm run preview` for the pages each commit touched
    (all pages for commit 2).

--------------------------------------------------------------------------------

*Drafted with EGM*
