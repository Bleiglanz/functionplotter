# Goldfish Annotated Review Report

Status: resolved

Author decisions: Issue 1 → B (copied-code check), Issue 3 → B (parser folded into `pageUtils.js`), Issue 5 → B (no pending list; static check added after the last page commit), Issue 7 → no deploy gate. All other PROPOSE FIX items applied as proposed; Issue 16 contest upheld; Issues 19 and 22 declined.

**Target:** `specs/roadmap-and-page-contract.md` (`full file`, lines 1–734)

Findings come from `consolidated_review_report.md` (Stages 5–9). Categories:
19 PROPOSE FIX, 1 CONTEST, 2 DECLINE, 0 ESCALATE. Four fixes need an author
choice between options (marked **Author choice**); for those the proposed edit
is written per option.

## Prioritized Findings & AI Suggestions

### [Issue 1] B1 [`egm-zoom-out`, `egm-implementation-readiness`] - Severity: Blocker
*   **Affected Scope:** [Lines 251, 630–632, 668, 685–690](roadmap-and-page-contract.md#L251-L690) (P3; target files 9, 13, 16)
*   **Discrepancy Description:** The static check fails any page script that defines `function stateFromHash(`; `src/riemann.js:64` already does, and the plan tells `zeta.js` to copy that wrapper.
*   **Rationale:** `npm test` fails at commit 5 or 7; every push deploys only after `npm test`.
*   ***AI Suggestion:*** PROPOSE FIX — **Author choice**
*   ***Justification:*** Verified in code: wrappers named `stateFromHash` exist in `riemann.js:64`, `zeta.js:39`, `exponential.js:49`, `main.js:100`; `ftc.js:73` uses `loadState`.
*   ***Proposed Edit:***
    *   **Option A (one wrapper name):** P3 text adds "A page that needs extra checks on its state (clamping, validation) wraps `stateFromHash` in a function named `loadState`." Target files 13 (zeta) and 16 (riemann) rename their wrappers to `loadState`; riemann.js joins commit 7. The name check stays.
    *   **Option B (copied-code check):** P3's check changes from function names to copied code: the page script must not contain `createElementNS(` or `URLSearchParams(location.hash` (both only in `pageUtils.js`). Wrapper names stay free. Target file 9 updated accordingly.

### [Issue 2] M1 [`egm-comprehension`, `egm-design`, `egm-zoom-out`, `egm-codebase-details`] - Severity: Major
*   **Affected Scope:** [Lines 369–373, 556–578](roadmap-and-page-contract.md#L369-L578) (Conformance work; target files 3–4)
*   **Discrepancy Description:** The parser's behaviour is stated two ways and called "exactly" what all copies do; it isn't (booleans: `raw === '1'`; `xMax=` → 0; no copy accepts a hash without `#`; zeta has no boolean branch).
*   **Rationale:** G5 protects current behaviour, so the document must state it correctly.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Valid; verified against `pageUtils.js:133-134`, `main.js:106-107`, `exponential.js:55-56`, `zeta.js:44`.
*   ***Proposed Edit:***
    *   Location: line 369–373 and target file 3.
    *   Change: replace the behavioural prose with: "`parseHash` is the current `stateFromHash` code from `pageUtils.js`, moved unchanged. The four copies differ in form but give the same result for each page's own settings: zeta's reads every value as a number, which works because all its settings are numbers; exponential's has no string branch because it has no string settings." Delete the "missing `#`" test case in target file 4.

### [Issue 3] M2 [`egm-zoom-out`, `egm-implementation-readiness`] - Severity: Major
*   **Affected Scope:** [Lines 365–373, 540–578](roadmap-and-page-contract.md#L365-L578) (`hashState.js`; target files 3–4)
*   **Discrepancy Description:** A separate `hashState.js` may be unnecessary; tests need each page's `DEFAULTS`, which are private to DOM page scripts.
*   **Rationale:** The test plan cannot be carried out as written.
*   ***AI Suggestion:*** PROPOSE FIX — **Author choice**
*   ***Justification:*** `pageUtils.js` imports `tex.js` (KaTeX + CSS), which Vitest already loads in `tex.test.js`, so the parser is testable inside `pageUtils.js` too; a separate module only saves that import.
*   ***Proposed Edit:***
    *   **Option A (separate pure module, as now):** keep `hashState.js`; target file 4 says the tests copy each page's `DEFAULTS` literally, with a comment pointing to the page, and assert one fixture per page.
    *   **Option B (fold into `pageUtils.js`):** `parseHash`/`serializeHash` are added to `pageUtils.js`; `main.js` imports from there; delete target file 3; tests live in `src/pageUtils.test.js` with copied `DEFAULTS` as in A.

### [Issue 4] M3 [all stages] - Severity: Major
*   **Affected Scope:** [Lines 95–100, 320, 397–405, 531–535](roadmap-and-page-contract.md#L95-L535) (G5; checklist step 3; conformance table; commit 10)
*   **Discrepancy Description:** Legacy URLs live only in the temporary table that commit 10 deletes, yet the lasting checklist and G5 rely on them.
*   **Rationale:** After cleanup, step 3 and G5 point at nothing.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Valid.
*   ***Proposed Edit:***
    *   G5: "Measured by fixtures in the hash tests: one saved hash string per page with its expected state. Every new page adds one."
    *   Checklist: delete step 3 (covered by the fixtures).
    *   Conformance table: drop the "Legacy URL to keep" column; the URLs move into the test plan (target file 4) with expected states written out.

### [Issue 5] M4 [`egm-zoom-out`, `egm-comprehension`, `egm-implementation-readiness`] - Severity: Major
*   **Affected Scope:** [Lines 397–405, 509–519, 633–636](roadmap-and-page-contract.md#L397-L636) (`PENDING_CONFORMANCE`)
*   **Discrepancy Description:** A set of page names cannot say which rules each page skips; it includes surface; it has three names.
*   **Rationale:** Under-specified mechanism, three manual tracking places.
*   ***AI Suggestion:*** PROPOSE FIX — **Author choice**
*   ***Justification:*** Both options fix it; B removes the mechanism.
*   ***Proposed Edit:***
    *   **Option A (per-page map):** `PENDING_CONFORMANCE = { exponential: ['P3'], zeta: ['P3'], riemann: ['P2'], ftc: ['P2'] }`; surface removed; each page commit deletes its key; commit 10 deletes the map. One name throughout.
    *   **Option B (no pending list):** `pages.test.js` is added in a new commit after the last page commit, so it passes on its first run; delete `PENDING_CONFORMANCE` and the conformance table's Status column; commit order renumbered.

### [Issue 6] M5 [`egm-design`, `egm-zoom-out`, `egm-comprehension`, `egm-style`] - Severity: Major
*   **Affected Scope:** [Lines 232–253, 611–636](roadmap-and-page-contract.md#L232-L636) (rule check types; target file 9)
*   **Discrepancy Description:** The static check's scope is unclear: U1 cannot fail, U9's static part is narrow, P2 id checks add little, U5's `<sup>` ban is stricter than U5.
*   **Rationale:** Checks that cannot fail or overreach erode trust in the test.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Follow Stage 8: fewer, sharper checks.
*   ***Proposed Edit:***
    *   U1 check column: "— (by construction: the page list is read from disk)".
    *   U9 check column: "M" only; delete the static U9 bullet in target file 9.
    *   P2: keep only "has `id="chart"`"; delete the per-figure class check.
    *   U5 text: "no `<sup>`/`<sub>` in page HTML" (matches the check).
    *   Target file 9 keeps U2, U3, U4, U5 (`renderStatic(` and no `<sup>`/`<sub>`), P1, P3 (per Issue 1), P4.

### [Issue 7] M6 [`egm-zoom-out`, `egm-design`, `egm-structural`] - Severity: Major
*   **Affected Scope:** [Lines 59–63, 171–184, 310–326, 446–464](roadmap-and-page-contract.md#L59-L464) (Problem; CUJ 1; checklist; alternatives)
*   **Discrepancy Description:** Agents are told to run a checklist only a person can judge; every push deploys so the checklist blocks nothing; the checklist grows with every page.
*   **Rationale:** An unenforceable step that agents will report as done.
*   ***AI Suggestion:*** PROPOSE FIX — **Author choice** (release process yes/no)
*   ***Justification:*** Stage 7 proposes gating deploys; Stage 8 rejects a release process for a one-person project. The proposed edit follows Stage 8; if you prefer gating, say so.
*   ***Proposed Edit:***
    *   Checklist: six steps (default load, reload round-trip, broken hash, dark mode, 390 px, keyboard), plus "who runs it: the owner".
    *   CUJ 1: "the agent stops after `npm test` passes and lists the checklist steps for the owner as pending".
    *   Problem (lines 59–63): "every push deploys, so only `npm test` stands between a change and users; this spec moves as much as possible into `npm test`."
    *   New Alternative H "Gate deploys behind a manual step": pros (checklist could block a release), cons (extra step for every change; a one-person project pushes small fixes often), reason (rejected by author: cost outweighs benefit at this size).

### [Issue 8] M7 [`egm-comprehension`, `egm-structural`, `egm-zoom-out`] - Severity: Major
*   **Affected Scope:** [Lines 135–136, 207–253, 430–436, 525–535](roadmap-and-page-contract.md#L135-L535) (contract table; commit 10)
*   **Discrepancy Description:** The spec keeps the full rule table while saying it only refers to rules by number.
*   **Rationale:** A second copy drifts (Alternative C).
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Valid; the table is the proposal for `AGENTS.md` and should leave the spec once it lands.
*   ***Proposed Edit:*** Retitle the table "Proposed contract (moves to `AGENTS.md` in commit 1)"; commit 1 replaces it in the spec with one line pointing to `AGENTS.md`; delete the "last reviewed" line from target file 1 and the precedence-line wording that repeats the Overview.

### [Issue 9] M8 [`egm-comprehension`, `egm-design`, `egm-zoom-out`] - Severity: Major
*   **Affected Scope:** [Lines 81–89, 290–308](roadmap-and-page-contract.md#L81-L308) (G3; roadmap)
*   **Discrepancy Description:** G3 promises fields the roadmap table lacks.
*   **Rationale:** Goal and table disagree.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Narrow G3 (Stage 8) instead of widening the table.
*   ***Proposed Edit:*** G3 lists exactly the table's columns (page file, level, core picture and interaction, math module, reuses / needs, links) and adds "an entry is deleted when its page ships"; the complex-functions cell says "redraw speed must be measured; may need lower resolution while dragging" instead of "< 100 ms"; add "HS = high school, UG = undergraduate" under the table.

### [Issue 10] M9 [`egm-comprehension`, `egm-structural`, `egm-zoom-out`] - Severity: Major
*   **Affected Scope:** [Lines 71–76, 138–169](roadmap-and-page-contract.md#L71-L169) (G1; Open Questions)
*   **Discrepancy Description:** G1 says "C1, C2"; decisions are duplicated in "Decided during drafting"; "Q1 → C" is undefined; numbering has gaps.
*   **Rationale:** Readers search for lists that aren't there.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Valid.
*   ***Proposed Edit:*** G1 says "U1–U10 and P1–P5"; delete "Decided during drafting" after moving any decision not already in the body (checklist location, multiple charts, README math) into the relevant section; renumber open questions Q1–Q3.

### [Issue 11] M10 [`egm-implementation-readiness`, `egm-style`] - Severity: Major
*   **Affected Scope:** [Lines 638–662](roadmap-and-page-contract.md#L638-L662) (target files 10–12)
*   **Discrepancy Description:** Degenerate cases, two needed values and test expectations are missing.
*   **Rationale:** An implementer would have to decide them.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Valid.
*   ***Proposed Edit:*** Define for f(x) = a·e^(bx+c) + d: `scale(p)` = a·eᶜ; `shift(p)` = −c/b (null if b = 0); `zero(p)` = (ln(−d/a) − c)/b when a ≠ 0, b ≠ 0 and −d/a > 0, else null; `distanceFactorTwo(p)` = ln 2/|b| (null if b = 0), documented as doubling time if b > 0 and half-life if b < 0; `tangentFoot(p, x)` = x − 1/b (null if b = 0). Tests: a = 1, b = 1, c = 0, d = 0 at x = 0 (value 1, slope 1, tangent foot −1); a = −2, b = −0.5, c = 1, d = 3 (zero ≈ 1.189); a = 0 (zero null); b = 0 (shift, foot, factor null); tolerance 1e−12.

### [Issue 12] M11 [`egm-zoom-out`, `egm-style`, `egm-implementation-readiness`] - Severity: Major
*   **Affected Scope:** [Line 102, target list 521–711](roadmap-and-page-contract.md#L102-L711) (G6(b))
*   **Discrepancy Description:** Tests for `extent`, `robustExtent`, `niceTicks` have no target file.
*   **Rationale:** A goal without a step.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** `niceTicks` is already tested (`src/surface.test.js:155`); only `extent` and `robustExtent` are missing.
*   ***Proposed Edit:*** G6(b) names `extent` and `robustExtent` only; add `src/pageUtils.test.js` to commit 2 (merged with the parser tests if Issue 3 Option B is chosen): `extent` pads by 8 % and includes extras; `robustExtent` ignores a single pole value among 200.

### [Issue 13] M12 [`egm-design`, `egm-implementation-readiness`] - Severity: Major
*   **Affected Scope:** [Lines 603–609, 685–696](roadmap-and-page-contract.md#L603-L696) (target files 8, 16, 17)
*   **Discrepancy Description:** Which `.chart-figure` rules move and which stay per page is unclear.
*   **Rationale:** An implementer would decide layout.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Valid.
*   ***Proposed Edit:*** Moves to `page.css` under `.chart-figure`: panel box (background, border, radius, padding), `margin: 0`, `figcaption` flex layout, `svg` display/width/font, `svg:focus-visible`. Stays per page: `grid-area`, svg height (riemann 220 px, ftc `min(36vh, 320px)`), cursor, readout styles. ftc's combined `#chart svg, #antiChart svg` selector is split.

### [Issue 14] M13 [`egm-design`, `egm-zoom-out`, `egm-implementation-readiness`] - Severity: Major
*   **Affected Scope:** [Lines 186–196, 501–519, 714–733](roadmap-and-page-contract.md#L186-L733) (CUJ 3; commit order; verification)
*   **Discrepancy Description:** The per-commit steps disagree; commit 10's keep list uses wrong headings; CUJ 3 doesn't fit shared-module commits.
*   **Rationale:** Ambiguous procedure.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Valid.
*   ***Proposed Edit:*** State once, at the top of the plan: "Each commit: `npm test`, `npm run build`, owner's checklist for the pages it touched, then push." CUJ 3: "one page or one shared module per commit". Commit 10 lists headings to delete by exact name: "CUJ 3", "Conformance work: module changes", "Conformance table", "Detailed Implementation Plan"; everything else stays.

### [Issue 15] Stage 5 Major 6 [`egm-zoom-out`] - Severity: Major
*   **Affected Scope:** [Lines 239, 345–349](roadmap-and-page-contract.md#L239-L349) (U6; D2)
*   **Discrepancy Description:** "Hash keys never change" is stricter than needed.
*   **Rationale:** Blocks reasonable future renames.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** The brief (`concepts_brief.md`, Goals) already allows a renamed key if the old name is still read; the draft tightened it without a decision.
*   ***Proposed Edit:*** U6 second sentence: "Once a page has shipped, every URL that opened it keeps opening the same view: a file is never renamed, and a renamed key is still read under its old name."

### [Issue 16] Stage 5 Major 8 [`egm-zoom-out`] - Severity: Major
*   **Affected Scope:** [Lines 245–259](roadmap-and-page-contract.md#L245-L259) (P-rules)
*   **Discrepancy Description:** The 2D rules mix the page shell with SVG drawing; a canvas page fits neither layer.
*   **Rationale:** Future complex-functions page.
*   ***AI Suggestion:*** CONTEST
*   ***Justification:*** The spec already decides that a new convention goes into `AGENTS.md` with the first page that needs it (roadmap paragraph after the table: "Bold gaps get their convention in `AGENTS.md` in the same change as the first page that needs it"); the canvas page is such a gap. Splitting layers now builds for a hypothetical page; Stage 8 (Nit 10) agrees.
*   ***Proposed Edit:*** None.

### [Issue 17] N1 [`egm-structural`] - Severity: Nit
*   **Affected Scope:** [Lines 400–481](roadmap-and-page-contract.md#L400-L481) (Alternatives)
*   **Discrepancy Description:** Rejections cite the author instead of trade-offs.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Cheap; each entry already lists cons.
*   ***Proposed Edit:*** Each "Reason for Rejection" leads with the trade-off and ends with "(decided by the author)".

### [Issue 18] N2 [`egm-design`] - Severity: Nit
*   **Affected Scope:** [Line 78–80, 263](roadmap-and-page-contract.md#L78-L263) (G2; admission rule)
*   **Discrepancy Description:** "Testable" overstates a judgment-based rule.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Valid wording.
*   ***Proposed Edit:*** Replace "testable rule" with "a rule with a pass and a fail example".

### [Issue 19] N3 [`egm-design`] - Severity: Nit
*   **Affected Scope:** whole document (Risks section)
*   **Discrepancy Description:** No Risks & Mitigations section.
*   ***AI Suggestion:*** DECLINE
*   ***Justification:*** Risks are already in NFRs and per-commit rollback; Stage 8 argues against a new section. Part of the release-process choice in Issue 7.
*   ***Proposed Edit:*** None.

### [Issue 20] N4–N8 [several] - Severity: Nit
*   **Affected Scope:** target files 9, 12, 13, 15, 18; lines 509–552
*   **Discrepancy Description:** Leftover helpers' fate; README edit details; `pages.test.js` mechanics; commit 1 naming future modules; `AGENTS.md` lines 18/49; undefined terms.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Each is a one-line clarification.
*   ***Proposed Edit:***
    *   Exponential keeps `num`/`signed` for its aria-label only; zeta's closed band path stays (not a helper copy); x ticks follow `niceTicks(…, 8)` as in `axes`; sliceChart's hyphen ticks are accepted under the surface exception.
    *   README: the exponential text moves (not merged) into the page list; `<sup>`/`<sub>` become `$…$`; the spec link goes under "Project layout".
    *   `pages.test.js` resolves the repository root with `new URL('..', import.meta.url)` and maps `/src/x` to `src/x`.
    *   Commit 1 describes rules only; module names enter `AGENTS.md` in the commit that creates them; the test is mentioned from commit 3.
    *   Commit 1 also removes `constant` from `AGENTS.md` line 18 (see Issue 21).
    *   Add one sentence under Overview: "Terms such as `renderStatic()`, `svgTex` and the surface plotter's files are described in `AGENTS.md`."

### [Issue 21] S1 [all stages] - Severity: Major (stale)
*   **Affected Scope:** [Q8 decision, NFR performance, Alternative F, target files 5–7, verification](roadmap-and-page-contract.md#L158-L719)
*   **Discrepancy Description:** The `constant()` move and the math.js regression are already fixed (commit `62c9a53`).
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Verified: `src/expression.js` exports `constant`; built exponential/zeta pages reference no `expression-*.js` chunk.
*   ***Proposed Edit:*** Delete Q8, Alternative F, target files 6–7 and the `constant` part of target file 5 and commit 2; NFR performance becomes one sentence: "The exponential and zeta pages must not load the math.js chunk (fixed in `62c9a53`); `pages.test.js` fails if a page that parses no expression imports `expression.js`." Remove the "today both print 1" note.

### [Issue 22] N9 [`egm-style`] - Severity: Nit
*   **Affected Scope:** various
*   **Discrepancy Description:** Vague phrases, hedged numbers, repeated content, diagram notation, line wrapping, decision-record template.
*   ***AI Suggestion:*** DECLINE
*   ***Justification:*** Wording-only; several overlap with deletions above. Fix opportunistically while applying the other edits.
*   ***Proposed Edit:*** None.
