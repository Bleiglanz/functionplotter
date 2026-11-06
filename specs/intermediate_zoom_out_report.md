# Goldfish Review Report: Stage 8, Intermediate Zoom Out

**Target:** `/home/antonr/Temp/functionplot/specs/roadmap-and-page-contract.md` (`1-734`, unchanged since Stage 5)

**Scope of this pass:** the fixes proposed in Stage 6 (`comprehension_report.md`) and Stage 7 (`critic_report.md`), plus any open Stage 5 items (`zoom_out_report.md`) they touch. For each proposal, the question is whether adopting it would make the design bigger or smaller than it needs to be.

## Reviewer Status

| Reviewer | Status |
| --- | --- |
| `egm-zoom-out` | completed |

## Summary

0 Blockers, 9 Major, 6 Nits.

Most Stage 6 and 7 findings are real. More than half of the fixes they propose add something: new sections, new columns, static-check rules, a release process, or a page-to-rules exemption map. For a five-page personal project, most of these gaps are better closed by deleting something. The spec can get shorter and still close them. In short:

- Delete the conformance table, the "Decided during drafting" list, the copy of the contract, the math.js material and the "last reviewed" stamp.
- Keep legacy URLs only in test fixtures.
- Shrink the checklist and the static check.
- Do not add a Risks section, roadmap columns, a deploy gate or per-rule exemptions.

The reviewer checked the code these proposals depend on:

- `src/pageUtils.js` imports only `format.js` and `tex.js`.
- `constant()` is at `src/expression.js:72`, and `riemann.js` and `ftc.js` already import it from there.
- `src/riemann.js:64` defines its own `stateFromHash()` wrapper.
- `src/zeta.js:39-48` parses numbers only.
- Local `svgEl` copies sit at `exponential.js:20`, `zeta.js:20` and `sliceChart.js:7`.

## Prioritized Findings (Blockers -> Major -> Nits)

### 1. Remove everything that assumes `constant()` still pulls math.js into `pageUtils.js` - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** Lines 167-169 (Q8), 357-367 (module diagram), 374-376, 393-395, 460-470 (Alternative F), 487-492 (NFR performance), 512 (commit 2's `constant()` item), 589-601 (Target Files 6-7), 716-719 (the Verification Plan's bundle check). Responds to Critic Major 2, Critic Nits 27 and 31, and the Stage 5 finding that nothing permanently guards against the math.js regression.
* **Discrepancy Description**: The move is already done. Critic Major 2 still asks for a permanent "no page that parses no expression may import math.js" check. Stage 5 asked for a transitive import-graph assertion plus an allow-list of pages. Both build lasting machinery against a bug that is already fixed and that came from a single import line in one shared file.
* **Rationale & Recommendation**: Delete Q8, Alternative F, the NFR performance bullet, Target Files 6-7, the diagram's "imports math.js" row, the bundle-size gate and the `grep` step. If a guard is wanted, add one sentence to AGENTS.md ("`pageUtils.js` must not import `expression.js`"), or at most one regex assertion on `pageUtils.js`. Skip the import-graph check and the allow-list. As part of commit 1, fix AGENTS.md line 18, which still lists `constant` in `pageUtils.js`.

### 2. Delete the conformance table instead of patching it, and keep legacy URLs only in test fixtures - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** Lines 95-100 (G5), 194-202 (CUJ 3), 320 (checklist step 3), 397-405 (conformance table), 517-519 and 531-535 (commit 10), 523-535 (Target File 1). Responds to Comp 1, Critic 11, Critic Major 4, Critic Nit 19, and Stage 5 Majors 2 and 5.
* **Discrepancy Description**: Each later stage proposes to grow this table:
  * Critic 11 wants a lasting "Legacy URLs" list, which would be a third place to keep them.
  * Critic 4 wants rows for the shared-module commits.
  * Critic 19 wants a README row.

  The table only repeats the commit order (509-519) and the legacy URLs, and its Status column repeats `git log`. Once the URLs move into the hash-test fixtures, nothing is left that only the table holds.
* **Rationale & Recommendation**:
  * Remove the table and the per-commit spec edits.
  * Make the saved-hash fixtures in the hash tests the only home of legacy URLs. G5 points at them, and U6 says "add a fixture for each new page".
  * Drop checklist step 3.
  * Commit 10 shrinks to deleting the AGENTS.md "still have their own copies" sentence.
  * Change CUJ 3 to "one page or one shared module per commit". This is the cheap part of Critic 4.

### 3. Do not refine `PENDING_CONFORMANCE`; add the static check after the last page commit - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** Lines 513-515, 633-636, 721-723. Responds to Comp 5, Critic 4, and the open Stage 5 Major 2 disagreement.
* **Discrepancy Description**: Comp 5 shows that a set of page names cannot express "skip only the rules this page does not meet yet". The obvious fix is a map from page to skipped rules, which is more temporary machinery.
* **Rationale & Recommendation**: Add `pages.test.js` after the ftc commit, so it passes from the start. Until then, the hash unit tests and the checklist guard each step. Delete `PENDING_CONFORMANCE` and every reference to it. This also settles the open Stage 5 disagreement, because Comp 5 shows the set as specified does not work.

### 4. Merge the hash parser into `pageUtils.js` and specify it as "moved unchanged" - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** Lines 239 (U6), 369-373, 554-587 (Target Files 3-5), 671-677. Responds to Comp 2 and 3, Critic Majors 1 and 3, and the Stage 5 Nits about `hashState.js` and the local wrappers in `main.js`.
* **Discrepancy Description**: Comp 2/3 and Critic 1 found the boolean rule stated in two different ways, both wrong, at line 370. Critic 1 proposes exact rules plus six edge-case tests (Infinity, hex, whitespace, repeated keys and so on). Those tests mostly exercise `URLSearchParams` and `Number`, not this project. With `constant()` gone, `pageUtils.js` loads under Vitest, so a separate `hashState.js` gains nothing. `main.js` can import `pageUtils.js` directly, which also settles how U6 is enforced for `main.js`.
* **Rationale & Recommendation**:
  * Add `parseHash(hashString, defaults)` and `serializeHash(state)` to `pageUtils.js`. Take them from the current `stateFromHash`/`writeHash` bodies, with the string passed in, and describe them only as "the current code, moved unchanged".
  * Delete the prose about how the parser behaves at 370-372 and 558-567.
  * Tests: a round trip for each page's `DEFAULTS`, one legacy fixture per page, an empty value and a boolean other than `1`. Skip the rest of Critic 1's list.
  * Say once that zeta's numbers-only parser gives the same result because all of zeta's defaults are numbers.
  * Have `main.js` import `stateFromHash`/`writeHash` directly, and change U6 to "through `pageUtils.js`".

### 5. Shrink the static check to the rules that stop copies, and detect copied function bodies rather than names - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** Lines 232-253 (the Check column for U1-U9 and P1-P4), 387-391, 611-636 (Target File 9). Responds to Critic Major 3, Critic Nits 16, 20, 32 and 33, Comp 15, and Stage 5 Major 1 (P3 wrongly rejects riemann's wrapper).
* **Discrepancy Description**: The later stages would grow the check:
  * read the JS entry scripts (Critic 3);
  * spell out how U2/U3 match (Critic 16);
  * require a unique id on every figure (Critic 20);
  * cover `<img>`, `fetch` and `@import url(http…)` for U9 (Critic 32);
  * list explicit exclusions (Critic 33).

  Each is reasonable alone. Together they make a small HTML linter that has to be maintained for every new page.
* **Rationale & Recommendation**:
  * Keep U2, U3, U4, P1, and U5 limited to `<sup>`/`<sub>` (plus `renderStatic(` if entry scripts are read anyway).
  * Add a copied-body check over page entry scripts and `sliceChart.js`: flag any local `createElementNS` or `new URLSearchParams(location.hash` outside `pageUtils.js`. This also fixes the riemann false positive and covers `main.js` and `sliceChart.js`.
  * Drop the U1 check, which can never fail (Comp 15).
  * Drop the static U9 check and leave U9 to the manual network-panel step.
  * Drop the P2 id checks. Instead, add one sentence to P2, "every chart figure has an id", because `frame()` builds the clip id from it.

### 6. Shorten the checklist and end the agent's work with one hand-off step, with no sign-off record - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** Lines 107-111 (G7), 182-183 (CUJ 1), 310-326 (checklist). Responds to Critic Major 5, Critic Nit 17, Comp 7, and the Stage 5 Major on how much the checklist covers.
* **Discrepancy Description**: The later stages add process to a list that one person runs:
  * Critic 5 asks where a passed run is recorded.
  * Critic 17 asks for an "Applies to" column.
  * Comp 7 asks for a U7 step.

  After findings 2, 4 and 5, tests cover checklist steps 3, 4 and 9.
* **Rationale & Recommendation**:
  * Cut the checklist to about six visual and interaction steps: default view with no raw `\(`, reload round trip, dark mode, 390 px width, network panel, keyboard and focus ring.
  * In CUJ 1, the agent stops after `npm test` and lists those steps for the owner. Do not require a record of the sign-off.
  * Run every page only when `page.css` or `theme.css` changes. For a shared JS module, tests plus one page are enough.
  * Skip the "Applies to" column. Note in prose that P5 does not apply to the surface plotter.
  * For U7, write "checked when writing the page" instead of adding a checklist step or a static rule.

### 7. Do not add a release process; correct the Problem statement instead - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** Lines 59-63 (The Problem), 330-336 (D1), Alternative A, 493-495 (NFR rollout). Responds to Critic Major 6, Critic Nit 26, and the Stage 5 Major "Every push deploys, so the checklist gates nothing".
* **Discrepancy Description**: Two stages propose gating deploys with `workflow_dispatch`, tags, a release branch or environment approval. Any of these adds a permanent release step, lets the live site lag behind `master`, and makes rollback harder. The checklist already runs on `npm run preview` before pushing, so the push is the gate. The real gap is the Problem's wording ("reaches users before anyone looks"), which overstates the risk.
* **Rationale & Recommendation**: Reword the Problem to say unchecked changes reach users only if the pre-push check is skipped. Add a two-line rejected alternative, "deploy only on `workflow_dispatch`", and give its cost: an extra step, and the site can lag behind `master`. Do not adopt tags, branches or environment rules.

### 8. Do not add a Risks & Mitigations section - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** Whole document; NFRs at 482-495. Responds to Critic Major 7 and Critic Nit 25.
* **Discrepancy Description**: Most of the eight proposed risk entries are already handled or no longer apply:
  * Whether U6 stays permanent is covered by D2.
  * Drift between the spec and AGENTS.md is covered by the precedence rule.
  * The risks around `PENDING_CONFORMANCE` and the table disappear with findings 2 and 3.
  * The zeta parser risk is covered by finding 4.
  * "Who decides whether a rule is U or P" is answered: the owner.

  One concern is real: math.js expressions read from the URL hash, because function names in call position are exempt from the allow-list. But it predates this spec and belongs to `expression.js`.
* **Rationale & Recommendation**: Keep the NFR bullets, minus performance (finding 1). Raise the call-position question in `expression.js` as a separate small issue, or record it as one accepted-risk line. Do not add a new H2, and do not add tests for `evaluate`, `import` or `createUnit` to this spec.

### 9. Narrow G3 to what the roadmap table holds; do not add columns - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** Lines 81-89 (G3), 183 (CUJ 1, "updates the roadmap entry's status"), 286-305 (roadmap). Responds to Comp 6, Critic Major 9, Critic Nit 18, and the Stage 5 Nits on the ε–δ row and the complex-functions budget.
* **Discrepancy Description**: Critic 9 proposes four new columns (Prerequisites, Tests, Strains, Status), splitting the Reuses/Needs column, and running the admission rule over all ten topics now. But each topic gets its own design when it is built (Non-Goal at line 121, Q2), so filling these fields in now is guesswork that the next design will redo. Critic 9 itself offers narrowing G3 as an alternative.
* **Rationale & Recommendation**:
  * Rewrite G3 to list the table's actual fields.
  * Drop "status" from G3 and CUJ 1. When a topic is built, delete its row, because the page is then listed in `index.html` and AGENTS.md.
  * Keep only the strains that matter for planning, as notes in the Needs cell: complex functions need canvas and strain P3 and P5; CLT needs a seed in the hash.
  * Cut the ε–δ row to one line and move Alternative G into that page's future design.
  * Replace the "< 100 ms at default size" budget with just "performance". Do not add the pixel count Critic 18 asks for.
  * Do not run the admission rule over every entry now.

### 10. Do not split the P layer or build per-rule exemptions yet - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** Lines 245-259 (2D rules), 625-627 (`EXEMPT_FROM_2D_RULES`). Responds to the Stage 5 Major that the 2D rule layer mixes page-shell rules with SVG rules, which Critic 9's Strains column brings back.
* **Discrepancy Description**: Only the complex-functions page would need the split. It is last in the suggested order and may fail admission criterion 2 (Critic 9). A map from page to exempt rules would be an abstraction built for one page that may never exist.
* **Rationale & Recommendation**: Keep the two layers and the one exempt page. Note in the complex-functions row that it strains P3, and split the layer when that page is designed. If finding 5 is adopted, `EXEMPT_FROM_2D_RULES` covers only P1.

### 11. Delete the "Decided during drafting" items instead of moving them into D7 and later records - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** Lines 138-169 (Open Questions), 328-353 (decision records). Responds to Critic Major 12, Comp 8 and 9, Critic Nit 23, and the Stage 5 Nit on keeping rule IDs stable.
* **Discrepancy Description**: Each of the six decided items is already stated where it applies, or no longer applies:
  * Q8 no longer applies (finding 1).
  * Q4 is covered by P2.
  * Q5 is covered by the `main.js` plan.
  * Q6 is covered by the README commit.
  * Q1 is covered by the "which document holds what" section.
  * Rule numbering is covered by G1, once G1 is fixed.

  Q7 repeats the Non-Goal at line 131 and the roadmap text at line 288.
* **Rationale & Recommendation**:
  * Delete the "Decided during drafting" list and Q7.
  * Fix G1's numbering.
  * Make D1 point to Alternative A instead of repeating it (Critic 23). Skip the rest of the template changes.
  * For rule IDs, add one AGENTS.md sentence: "numbers are never reused". Skip the optional test that every ID in the spec exists in AGENTS.md.

### 12. Remove the copy of the contract and the "last reviewed" stamp from the spec - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** Lines 221-253, 528-529, 534. Responds to Comp 4, Critic Major 13, Critic Nit 15, and Critic 7.
* **Discrepancy Description**: Comp 4 and Critic 13 both find that the spec keeps the full rule table while saying it does not repeat it, and commit 10 keeps "the contract summary". Critic 15 asks to add the missing stamp field, while Critic 7 notes that nothing checks it.
* **Rationale & Recommendation**: The rule table is commit-1 content for AGENTS.md. After commit 1, the spec keeps a one-line pointer to it. Delete the "last reviewed" sentence and its commit-1 and commit-10 edits, because `git log` already records that. Reword line 221 as Critic 13 suggests: U/P rules live in AGENTS.md; the admission rule and checklist live here.

### 13. Do not extend the G4 measure to the surface plotter's axis code - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** Lines 90-94 (G4), 679-683 (Target File 15). Responds to Critic Nit 22 and the Stage 5 Nit that `sliceChart.js` keeps its own axis code.
* **Discrepancy Description**: Taken literally, measuring G4 across all pages moves `sliceChart.js`'s axis code onto `axes()`. That drifts toward the already-rejected Alternative B (rebuild the surface plotter).
* **Rationale & Recommendation**: Measure G4 as "no copy of `svgEl` or the hash helpers in any script; chart and axis helpers shared among the 2D pages". State that `sliceChart.js`'s axis code falls under the surface-plotter exception.

### 14. Skip the glossary additions and point to AGENTS.md - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** Lines 27-30 (Overview). Responds to Comp 13 and 14.
* **Discrepancy Description**: Explaining `svgTex`, `renderStatic`, the clip id, RK4, and how the surface plotter's files split the work would repeat AGENTS.md, which the Non-Goal at line 135 forbids.
* **Rationale & Recommendation**: Add one sentence: "Project terms (`svgTex`, `renderStatic`, `frame`, the surface plotter's modules) are described in AGENTS.md." Define HS and UG where they first appear. Nothing more.

### 15. Cheap proposals worth adopting as written - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** Various.
* **Discrepancy Description**: These make the text clearer without adding anything:
  * Critic 8: drop "Rejected by author" and state the trade-offs. Add the alias-key option as one sentence in D2, not as a new alternative.
  * Critic 10 / Comp 8: fix G1's numbering.
  * Critic 14: call the admission rule a judgment rule and drop "clear".
  * Critic 21: add one sentence defining "same view", so that the accepted tick changes count as the same view.
  * Critic 4: the CUJ 3 wording.
  * Critic 28: name `extent`/`robustExtent`, or drop the G6(b) range-helper tests as Stage 5 suggested.
* **Rationale & Recommendation**: Adopt as proposed.
