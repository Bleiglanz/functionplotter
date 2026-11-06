# Goldfish Review Report: Implementation Readiness (Stage 9)

**Target:** `specs/roadmap-and-page-contract.md` (lines 499-734, "Detailed Implementation Plan" to the end)

**Standard:** `resources/document_standards/implementation-readiness-standard.md` (implementation-readiness and codebase-details lenses); the style lens used its persona's own rules.

**Context note:** The `constant()` move shipped in commit 62c9a53 after the plan was written. Plan items about that move (commit-order item 2 in part, target files 5-7 in part, the bundle-size grep at lines 716-719) were treated as already done and are not findings. They are now stale text, though. See "Stale text" at the end.

**Verdict:** The plan is not ready to implement. There is 1 Blocker, 8 Majors and 16 Nits.

## Reviewer Status

| Reviewer | Status |
| --- | --- |
| `egm-implementation-readiness` | completed |
| `egm-codebase-details` | completed |
| `egm-style` | completed |

## Prioritized Findings (Blockers -> Major -> Nits)

### B1. The P3 static check fails on riemann.js's wrapper, the pattern the plan tells zeta to copy - Severity: Blocker
* **Reviewer Lens:** `egm-implementation-readiness`, `egm-codebase-details`
* **Affected Scope:** Lines 630-632 (P3 regex), 633-636, 668, 685-690, 720-723. Code: `src/riemann.js:4` and `src/riemann.js:64`.
* **Discrepancy Description**:
  * P3 fails any page script that contains `function stateFromHash(` or `const stateFromHash =`.
  * `riemann.js` imports `stateFromHash as readHash`, then defines its clamping wrapper as `function stateFromHash()`.
  * When commit 7 takes riemann out of the pending set, `pages.test.js` fails. Lines 720-723 require the test to pass after every commit.
  * Line 668 tells zeta (commit 5) to copy riemann's pattern, so zeta fails the same way.
  * `ftc.js:73` avoids the problem by naming its wrapper `loadState`.
* **Rationale & Recommendation**: Choose one wrapper name for all pages, for example `loadState` as in ftc. Add `src/riemann.js` to target 16 so commit 7 renames riemann's wrapper, and tell zeta to use the same name. The alternative is to narrow P3 so it ignores wrappers that call the imported helper. If you take that route, the plan must say so explicitly.

### M1. `PENDING_CONFORMANCE` cannot say which rules to skip, and surface has nothing to skip - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness`, `egm-codebase-details`, `egm-style`
* **Affected Scope:** Lines 513-517, 633-636, 720-723
* **Discrepancy Description**:
  * A set of page names cannot record that a page "skips the rules [it] does not yet meet". The implementer would have to choose between skipping every rule, which hides real U-rule breaks, and inventing a per-rule mechanism.
  * What each page fails today:
    * exponential: P3.
    * zeta: P3.
    * riemann: P2 (`#convergence` lacks the `chart-figure` class), plus P3 through B1.
    * ftc: P2 (`#antiChart`).
    * surface: nothing. It is already in `EXEMPT_FROM_2D_RULES` and passes every U check, so removing it from the set in commit 6 does nothing.
  * The same mechanism has three names: "temporary list" (lines 513, 515, 517), "the set" (line 635) and `PENDING_CONFORMANCE` (line 633).
* **Rationale & Recommendation**: Make it a map from page to rule IDs: `{ exponential: ['P3'], zeta: ['P3'], riemann: ['P2'], ftc: ['P2'] }`. Leave surface out of it and say that commit 6 does not touch the map. Use the name `PENDING_CONFORMANCE` everywhere.

### M2. The hashState tests need each page's `DEFAULTS`, which a test cannot import - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness`, `egm-codebase-details`
* **Affected Scope:** Lines 573-578. Code: `exponential.js:8`, `zeta.js:9`, `main.js:18`, `riemann.js:11`, `ftc.js:11`.
* **Discrepancy Description**:
  * Each `DEFAULTS` is a module-private `const`.
  * Every one of these scripts touches the DOM when it loads, so Vitest under Node cannot import them.
  * Neither the source of the values nor the expected parsed state for each legacy URL is specified.
* **Rationale & Recommendation**: Pick one approach:
  * Copy the five literals into `hashState.test.js`, with a comment naming each source file. Optionally, add a static check that each copy still matches its page.
  * Or move each `DEFAULTS` into a DOM-free module and add those modules to the target list.

  In either case, write out the expected state for each legacy URL. For riemann that is `{ expr: 'x^2', a: '0', b: '2', n: 50, rule: 'left', band: true }`.

### M3. `exponentialMath.js` leaves edge cases and part of its API undefined - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness`, `egm-codebase-details`
* **Affected Scope:** Lines 641-645, 650-652, 660-661. Code: `exponential.js:133-134`, `:184`, `:224`, `:226`, `:241-242`, `:264`.
* **Discrepancy Description**:
  * `zero(p)` does not say what to return when a = 0, when b = 0, or when f is identically 0. In the last case every x is a zero. Today the formula yields ±Infinity or NaN in these cases, and the page relies on its own guards.
  * `tangentFoot` returns null only when b = 0. `showHover` also hides the foot when `y === d` (the a = 0 case), and the plan does not say whether that guard moves into the module or stays in the page.
  * `properties()` also uses a·e^c, the shift −c/b and |1/b|. None of these is in the listed API, so "take numbers from exponentialMath.js" cannot be followed as written.
  * The test cases listed at lines 650-652 have no expected values and no tolerance.
* **Rationale & Recommendation**:
  * Give each function's return value for a = 0, b = 0 and f ≡ 0.
  * Say which guards stay in `exponential.js`.
  * Either add `scale(p)` and `shift(p)`, or state that they stay inline.
  * Give an expected value for each test case and a tolerance, for example `toBeCloseTo(..., 12)`.

### M4. The commit 10 cleanup deletes the legacy URLs the permanent checklist still needs, and its scope is unclear - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness`, `egm-style`
* **Affected Scope:** Lines 517-519, 531-535. These lines point at line 320 (checklist step 3), G5 and lines 489-492 (Non-Functional Requirements).
* **Discrepancy Description**:
  * Commit 10 deletes the conformance table. Checklist step 3 and G5 depend on the legacy URLs in that table, and the Non-Functional Requirements point to sections that commit 10 deletes.
  * Several entries in the "keep" list do not match any heading:
    * "contract summary" (the heading is "The numbered page contract")
    * "roadmap" (heading: "Topic roadmap")
    * "checklist" (heading: "Manual checklist")
  * The keep list also omits Non-Goals, Open Questions, CUJ 1-2, "Which document holds what" and Non-Functional Requirements, so it is unclear whether those sections survive.
  * Keeping the full contract text would duplicate `AGENTS.md`, which Non-Goals and Alternative C rule out.
* **Rationale & Recommendation**:
  * Before deleting the table, move the legacy URLs into a permanent list or into the checklist itself.
  * State the rule instead of a closed list, using exact headings: "Delete CUJ 3, 'Conformance work: module changes', 'Conformance table' and 'Detailed Implementation Plan'; keep every other section."
  * Say what happens to the NFR paragraph and to Q8.
  * Reduce the contract section to a pointer to `AGENTS.md`.

### M5. No target file delivers G6(b), the tests for the chart range helpers - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness`, `egm-codebase-details`
* **Affected Scope:** Lines 521-711 (target files), 725-726 (coverage). The goal is G6(b) at line 102. Code: `pageUtils.js:84-106`.
* **Discrepancy Description**: G6(b) promises tests for `extent`, `robustExtent` and `niceTicks`. No test file for them is planned or exists today, and the coverage rule names only `hashState.js` and `exponentialMath.js`.
* **Rationale & Recommendation**: Add `src/pageUtils.test.js` (Create, commit 2) with these cases:
  * `extent`: non-finite values, `extra` bounds, a degenerate range giving ±1, and the 8% padding.
  * `robustExtent`: 1%/99% trimming and empty or all-NaN input.
  * `niceTicks`: ranges that cross zero.

  Otherwise, revise G6.

### M6. The `.chart-figure` CSS change and the per-page CSS deletions are ambiguous - Severity: Major
* **Reviewer Lens:** `egm-implementation-readiness`, `egm-codebase-details`
* **Affected Scope:** Lines 606-609, 688-690, 694-696. Code: `page.css:66-73`, `:81-84`, `:251-253`; `riemann.css:12-19`, `:40-48`; `ftc.css:12-19`, `:40-49`.
* **Discrepancy Description**:
  * `margin: 0` lives on `#chart`, not on the shared panel rule. A literal reading drops it, and `<figure>` gets its default margin back.
  * The plan does not say whether the svg height rules (`min(60vh, 520px)` and the mobile `50vh`) apply to `.chart-figure`.
  * It does not say whether riemann's `cursor: pointer`, ftc's `cursor: ew-resize`, `#antiFormula`, `#convHover` and `.readout` stay.
  * ftc's combined rule `#chart svg, #antiChart svg` has to be split, and the plan does not mention it.
  * A wrong guess changes the layout of pages that are already live.
* **Rationale & Recommendation**:
  * List the exact selector edits, for example `#controls, #chart, .chart-figure, #facts {...}` and `#chart, .chart-figure { margin: 0 }`.
  * Say whether `.chart-figure svg` takes the height rules.
  * For `riemann.css` and `ftc.css`, list which declarations each keeps and which it deletes.

### M7. "Exactly the behaviour of the four existing copies" is false, and the test spec repeats the mistake - Severity: Major
* **Reviewer Lens:** `egm-style`, `egm-codebase-details`
* **Affected Scope:** Lines 559-564, 575-578. Code: `zeta.js:39-48`, `exponential.js:49-59`.
* **Discrepancy Description**:
  * All four existing copies parse `location.hash.slice(1)`, so none of them handles a hash without a leading `#`; it would lose its first character. The new `parseHash` accepts both forms.
  * `exponential.js` has no string branch.
  * `zeta.js` has no boolean branch and clamps `n` inside its parser.
  * Because of this, "missing `#`... the same results as the current parsers" (line 576) cannot be met. "Keep or produce" also does not say which outcome is expected for which input.
* **Rationale & Recommendation**: Reword the claim to: "matches the existing parsers for every hash that starts with `#`, for the value types each page uses. Accepting a hash without `#` is new. Clamping such as `clampN` moves into the page wrapper." List the expected result for each broken input:
  * `n=abc` and unknown keys keep the default.
  * `xMax=` gives `0`.
  * A hash without `#` parses the same as the same hash with `#`.

### M8. The per-commit procedure is stated two different ways - Severity: Major
* **Reviewer Lens:** `egm-style`
* **Affected Scope:** Lines 503-504 compared with 716 and 727-728
* **Discrepancy Description**: The intro says to run `npm test`, then the checklist, then push. The Verification Plan adds `npm run build` after every commit and runs the checklist on `build && preview`. Someone following only the intro skips the build.
* **Rationale & Recommendation**: Reword lines 503-504 to: "Before pushing each commit, run `npm test`, then `npm run build && npm run preview`, then the manual checklist for the pages it touched (see Verification Plan)."

### N1. Leftover local helpers and drawing code in exponential and zeta are not covered - Severity: Nit
* **Reviewer Lens:** `egm-implementation-readiness`, `egm-codebase-details`
* **Affected Scope:** Lines 657-669. Code: `exponential.js:28` (`num`), `:104` (x ticks).
* **Discrepancy Description**:
  * The plan does not say whether exponential's local `num` (identical to the one in `pageUtils`) and its `signed` helper are kept or replaced.
  * zeta's closed tail-band path (ending in `Z`) cannot be drawn with `polyline`, and the plan does not say what happens to it.
  * The x-tick count (8, filtered to the range) is not stated.
* **Rationale & Recommendation**: Name each of these and say whether it stays or is replaced.

### N2. sliceChart.js keeps its hyphen tick labels without saying so - Severity: Nit
* **Reviewer Lens:** `egm-codebase-details`
* **Affected Scope:** Lines 679-683; the problem statement at lines 47-49. Code: `sliceChart.js:85`, `:88`, `:92-102`.
* **Discrepancy Description**: Target 15 replaces only `svgEl`. The hyphen-minus labels that the Problem section names remain.
* **Rationale & Recommendation**: Either use `num` for those labels or record the difference as accepted for surface.

### N3. The "last reviewed" commit refers to itself - Severity: Nit
* **Reviewer Lens:** `egm-implementation-readiness`
* **Affected Scope:** Lines 517-519, 528-529, 535
* **Discrepancy Description**: A commit cannot contain its own hash.
* **Rationale & Recommendation**: Use the previous commit's hash, or the date only.

### N4. The README edits are not fully specified - Severity: Nit
* **Reviewer Lens:** `egm-implementation-readiness`, `egm-codebase-details`
* **Affected Scope:** Lines 701-704. Code: `README.md:10`, `:12`, `:24`, `:38`, `:48-52`.
* **Discrepancy Description**:
  * "Move" actually means merging the exponential description into the existing line at `README.md:12`.
  * The plan does not say whether Unicode subscripts and superscripts (∫ₐᵇ, Sₙ, x₀) also become `$...$`.
  * It does not say where the spec link goes.
* **Rationale & Recommendation**: Specify all three.

### N5. pages.test.js leaves some mechanics and patterns open - Severity: Nit
* **Reviewer Lens:** `egm-implementation-readiness`, `egm-codebase-details`, `egm-style`
* **Affected Scope:** Lines 614-632
* **Discrepancy Description**:
  * Several mechanics are open:
    * How the test finds the repository root. The current directory is not guaranteed.
    * That the root-relative `/src/...` paths in `<script src>` and `<link href>` resolve against that root.
    * How `<figure>` elements and their classes are matched.
  * Some patterns are written loosely:
    * `<link ... href="http...">`
    * The literal `name` in `function name(` and `const name =`
* **Rationale & Recommendation**:
  * Resolve the root like `vite.config.js` does: `fileURLToPath(new URL('.', import.meta.url))`.
  * Write the real regexes, for example `/<(script|link)[^>]+(src|href)="https?:/`.
  * Write `function <name>(` and `const <name> =` instead of the literal `name`.

### N6. Commit 1 documents modules that don't exist yet; the pages.test.js mention comes too late - Severity: Nit
* **Reviewer Lens:** `egm-implementation-readiness`, `egm-codebase-details`
* **Affected Scope:** Lines 509-510, 541-546, 551-552
* **Discrepancy Description**:
  * U6 names `hashState.js`, and the S checks imply `pages.test.js`. Neither exists until commit 2 or 3.
  * The `AGENTS.md` heading where the contract goes is not named.
  * `pages.test.js` and its pending map exist from commit 3, but `AGENTS.md` mentions the test only in commit 10.
* **Rationale & Recommendation**:
  * Say that the rules may briefly name modules that arrive in later commits, and name the target heading.
  * Move the Commands mention of `pages.test.js` to commit 3.

### N7. AGENTS.md is already stale about `constant`; commit 10 should delete a clause, not a sentence - Severity: Nit
* **Reviewer Lens:** `egm-codebase-details`, `egm-implementation-readiness`
* **Affected Scope:** Lines 547-548, 551-552. Code: `AGENTS.md:18`, `AGENTS.md:49`.
* **Discrepancy Description**:
  * `AGENTS.md:18` still lists `constant` among the `pageUtils` helpers, and `AGENTS.md:49` (expression.js) does not mention it. Both are wrong today.
  * The text that commit 10 should remove ("while `exponential.js` and `zeta.js` still have their own copies...") is the final clause of a sentence. Deleting "the sentence" would also remove the helper list.
* **Rationale & Recommendation**: Fix `AGENTS.md:18` and `:49` now or in commit 1. Say that commit 10 deletes only that clause.

### N8. The precedence line is terse and repeats existing text - Severity: Nit
* **Reviewer Lens:** `egm-style`, `egm-codebase-details`
* **Affected Scope:** Line 528; the same point appears at lines 27-30 and 221-223.
* **Discrepancy Description**: "`AGENTS.md` wins; correct this file" does not say what it wins over, and the spec already states this rule twice.
* **Rationale & Recommendation**: Reword it to "If this file and `AGENTS.md` disagree, `AGENTS.md` is authoritative; correct this file", or drop it.

### N9. "its manual checklist" has no referent - Severity: Nit
* **Reviewer Lens:** `egm-style`
* **Affected Scope:** Lines 545-546
* **Discrepancy Description**: If the two pointers in `AGENTS.md` become separate bullets, "its" refers to nothing.
* **Rationale & Recommendation**: Name the file: "run the manual checklist in `specs/roadmap-and-page-contract.md` for the pages you changed."

### N10. The opening sentence adds nothing - Severity: Nit
* **Reviewer Lens:** `egm-style`
* **Affected Scope:** Lines 501-502
* **Discrepancy Description**: The sentence only says that this file is the spec.
* **Rationale & Recommendation**: Delete it and start with "Work happens in the commit order below...".

### N11. Commit numbers are packed into one list item - Severity: Nit
* **Reviewer Lens:** `egm-style`
* **Affected Scope:** Line 514
* **Discrepancy Description**: "4. exponential. 5. zeta. ..." sits inside a single numbered item. It renders badly, and other sections refer to these commits by number.
* **Rationale & Recommendation**: Give each commit its own list item.

### N12. U1 is listed as a check but nothing checks it - Severity: Nit
* **Reviewer Lens:** `egm-style`
* **Affected Scope:** Line 616
* **Discrepancy Description**: The test builds its page list from the files on disk, so U1 holds by construction and needs no assertion.
* **Rationale & Recommendation**: Reword it to "U1 holds by construction; there is no assertion."

### N13. The test bans more than U5 does - Severity: Nit
* **Reviewer Lens:** `egm-style`
* **Affected Scope:** Lines 621-622; U5 is at line 238.
* **Discrepancy Description**: U5 bans `<sup>`/`<sub>` only for math. The test bans them outright.
* **Rationale & Recommendation**: State that the test is stricter on purpose.

### N14. The exponentialMath wording is imprecise - Severity: Nit
* **Reviewer Lens:** `egm-style`
* **Affected Scope:** Lines 641-643, 650
* **Discrepancy Description**:
  * `f(x)` is never defined.
  * In "a = 0, a zero present", the second "a" can be read as the parameter.
  * `doublingDistance` is also the halving distance when b < 0, which lines 377-378 acknowledge.
* **Rationale & Recommendation**: Define f, reword the test case list, and note that `doublingDistance` covers halving when b < 0.

### N15. "About" hedges a known tick count - Severity: Nit
* **Reviewer Lens:** `egm-style`
* **Affected Scope:** Lines 661-662. Code: `pageUtils.js:73`, `exponential.js:100`.
* **Discrepancy Description**: The code requests exactly 5 or 6 ticks from `niceTicks`, so "about" is wrong.
* **Rationale & Recommendation**: Reword it to "the y axis requests 5 ticks from `niceTicks` instead of 6."

### N16. Two small gaps in the target entries - Severity: Nit
* **Reviewer Lens:** `egm-style`
* **Affected Scope:** Lines 690, 695-696, 542
* **Discrepancy Description**:
  * The ftc entry omits the chart height in px that the riemann entry gives.
  * "A short procedure that refers to the rules" does not say what the procedure covers.
* **Rationale & Recommendation**: State ftc's height, and describe the procedure as "a numbered procedure for adding a page, citing rules by ID."

## Stale text (not findings)

Commit 62c9a53 already did the following work:
* commit-order item 2, the `constant()` part (line 512)
* target files 5-7, the `constant()` parts (lines 585-601)
* the bundle-size check: "today both print 1" (lines 716-719)

Mark these done or remove them, so that no one redoes the work.
