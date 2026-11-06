# Comprehension Report (EGM Stage 6)

*   **Target:** `specs/roadmap-and-page-contract.md` (FeatureRange 1..498, DetailedRange 499..734)
*   **Reviewer:** egm-comprehension, fresh context, document only, no document standard
*   **Date:** 2026-11-06

## What this proposes (feature range, 1..498)

The spec does two jobs. The lasting one: rewrite the topic-page rules in
`AGENTS.md` as a numbered contract. U1–U10 apply to every page and P1–P5 to 2D
SVG pages, and each rule is tagged with how it is checked (unit test, a static
HTML check in `npm test`, or a manual checklist step). The spec itself holds a
three-part test for whether a topic gets its own page (one concept, one
picture, self-contained), a ten-topic roadmap with each topic's missing
infrastructure, a manual checklist to run before every push, and decision
records D1–D6 (no browser tests, URL hash as the only state, no framework,
KaTeX, one Vite entry per page, "offline" means bundled assets only). The
temporary one: bring the five existing pages in line, one commit per page.
That means a new pure `hashState.js` parser shared by all pages, a tested
`exponentialMath.js`, shared chart helpers, and moving `constant()` out of
`pageUtils.js` so the exponential and zeta pages stop loading math.js. Every
shared URL has to keep opening the same view.

## How the existing system works, per this document

functionplot is a Vite static site with five plain-JS pages: Riemann sums,
FTC, zeta, exponential, and a three.js surface plotter. Every push to `master`
deploys it to GitHub Pages, and only after `npm test` passes in CI. The
URL-hash helpers exist in four copies (`pageUtils.js`, `exponential.js`,
`zeta.js`, `main.js`), and chart and SVG code is copied in `exponential.js`,
`zeta.js` and `sliceChart.js`. The exponential page's math sits inline in DOM
code with no tests. `pageUtils.js` imports math.js through `constant()`, so
since the KaTeX commit every page that uses `svgTex` pulls in a 182 kB gzipped
chunk. The surface plotter has its own layout (a floating panel, inset slice
charts, a canvas). It saves its panel state in `localStorage`, and
`index.html#expr=…` forwards to it, which suggests it used to live at
`index.html`. Only the math modules have tests, and browser behaviour is
checked by hand.

Both paraphrases came easily. Nothing reaches Blocker level. The findings below
are places where the parts contradict each other or point at things the
reader cannot find.

## Findings

1.  **Major: the lasting checklist points into the temporary table (lines 320,
    99–100, 397, 531–535).** Checklist step 3 says "Open the page's saved
    legacy URL (conformance table)", and G5 says the legacy URLs are kept "in
    the manual checklist". But the URLs live only in the conformance table, and
    commit 10 deletes that table while keeping the checklist. After cleanup,
    step 3 and G5's guarantee point at nothing. A reader cannot tell where the
    legacy URLs are supposed to live for good: the checklist itself,
    `hashState.test.js`, or both?
2.  **Major: the boolean parsing rule is stated two ways (line 371 vs lines
    559–560).** The feature range says booleans come "from `1`/`0`… invalid
    values keep the default". The detailed range says booleans "read `1` as
    true and anything else as false". These give different results for
    `showRef=abc` or `band=`. Line 563 also says this "is exactly the
    behaviour of the four existing copies", so the reader cannot tell which
    version is the actual current behaviour that G5 protects.
3.  **Major: "exactly the behaviour of the four existing copies" contradicts
    the Problem section (lines 45–47 vs 563, 162).** The Problem section says
    the zeta copy "is written differently (it reads every value as a number)".
    Line 563 and Q5 claim identical behaviour. The reader has to work out alone
    that the two agree only because zeta has nothing but number defaults. One
    sentence saying so would close the gap.
4.  **Major: the spec keeps a copy of the contract while claiming not to (lines
    135–136, 225–253, 430–436, 534).** The non-goals and Alternative C say the
    spec "refers to rules by number; it does not copy their wording". Yet
    lines 232–253 give the full rule text, and commit 10 explicitly keeps "the
    contract summary" in the lasting spec. A reader cannot tell whether that
    table is a draft to be moved into `AGENTS.md` and removed, or a lasting
    second copy, which is exactly the drift Alternative C rejects.
5.  **Major: `PENDING_CONFORMANCE` is not explained enough to follow (lines
    513–515, 633–636).** It is a set of page names, yet it "skips the rules
    each page does not yet meet". A set of names cannot say which rules to
    skip, so does it skip every check for those pages, or only some? It also
    includes `surface`, which is already exempt from P1–P4 through
    `EXEMPT_FROM_2D_RULES`. No static check covers surface's own conformance
    work (`main.js` hash, `sliceChart.js` `svgEl`), so it is unclear what
    putting surface in the set does.
6.  **Major: the roadmap table does not have the fields G3 promises (lines
    81–89 vs 294–305).** G3 says each entry names its prerequisites, its
    tests, "the contract rules it strains" and a status. The table has no
    columns for prerequisites, tests or strained rules. Status appears only as
    a blanket "planned" in prose. A reader cannot tell whether "Links" stands
    in for prerequisites, or whether these fields were dropped on purpose.
7.  **Major: U7 is labelled a manual check but no manual step exists (line 240
    vs 316–326).** U7 is tagged "M (review)", but no checklist step covers it.
    U1 and U3 are not covered either, although those are static checks. G1
    says each rule names how it is checked. For U7 the reader cannot find out
    who checks it, or when.
8.  **Nit: the goals still use the old numbering (line 74 vs 151–154).** G1
    still says "C1, C2, …". The decided-items list replaces that with U/P
    numbering and cites "the brief", which is first named only at line 712
    (`specs/concepts_brief.md`). Update G1 or point to the decision.
9.  **Nit: "Q1 → C" is undefined (line 156).** "C" refers to an option list
    that is not in this document, presumably the brief's. The bullet explains
    what was decided, so the label is just noise. The gaps in the Q-numbering
    (only Q2, Q3 and Q7 are open) send the reader looking for a list that
    isn't there.
10. **Nit: commit numbers are used before they are defined (line 491).**
    "Commit 2 removes it; it is checked after commit 2" relies on the commit
    order, which is defined only at line 509 in the detailed range. The
    pointer to the Verification Plan helps, but the feature range does not
    stand on its own here.
11. **Nit: a term needed for G4 is defined only later (line 94).** The "still
    have their own copies" sentence is a G4 success measure. Its content (that
    `exponential.js` and `zeta.js` keep their own copies) is given only at line
    551.
12. **Nit: checklist step 4's expected result does not match the parser (line
    321 vs 578).** The expected result for `#n=abc&xMax=` is "Falls back to
    defaults or clamps", but line 578 says `xMax=` parses to `0`, which is
    neither. Say what the reader should actually see for `xMax=0` on each
    page.
13. **Nit: project terms used without explanation.**
    *   `svgTex` and `renderStatic()` (lines 105, 238, 490): what they do is
        never stated.
    *   "the hard-coded clip id" (lines 383, 659): why it is a defect is not
        said.
    *   "RK4 extracted from `surface.js`" (line 303): why a surface plotter has
        an RK4 stepper is not said.
    *   The surface plotter's files: how `main.js`, `surface.js`, `plot.js` and
        `sliceChart.js` split the work is not described.
    *   "ftc (Q2: overlap with its tangent)" (line 296): this assumes the reader
        knows the FTC page shows a tangent.
    *   "Specs and reviews" (line 544): an `AGENTS.md` section the reader does
        not know.
    *   "Drafted with EGM" (line 734): EGM is never defined.
14. **Nit: abbreviations and assumed names.** HS and UG in the Level column
    (lines 294–305) are only implied by the Overview's "high-school and
    undergraduate". The build check `grep -c expression- …` (line 718) assumes
    the math.js chunk is named `expression-*.js`, while the rest of the
    document calls it "the math.js chunk". State that link.
15. **Nit: the U1 check is effectively empty (lines 234, 616).** U1 is listed
    as a static check, but in the detailed range it is "implicit; the list is
    built from disk", so nothing can fail. Saying that in the U1 row would
    stop a reader from expecting a real check.
