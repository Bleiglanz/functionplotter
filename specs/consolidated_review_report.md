# Consolidated Review Report

*   **Target:** `specs/roadmap-and-page-contract.md` (734 lines; FeatureRange 1..498, DetailedRange 499..734)
*   **Mode:** consolidated report, all rubrics, uninterrupted
*   **Date:** 2026-11-06
*   **Goldfish context:** `AGENTS.md`, `specs/concepts_brief.md`, `README.md`,
    `src/pageUtils.js`, `src/exponential.js`, `src/zeta.js`, `src/main.js`

## Stage reports

| Stage | Reviewers (all ran) | Report | Blocker | Major | Nit |
| :--- | :--- | :--- | :-: | :-: | :-: |
| 5 Initial Zoom Out | zoom-out, inventive-catalyst | `zoom_out_report.md` | 0 | 8 | 7 |
| 6 Comprehension | comprehension | `comprehension_report.md` | 0 | 7 | 8 |
| 7 Critic (FeatureRange) | design, structural, style | `critic_report.md` | 0 | 14 | 20 |
| 8 Intermediate Zoom Out | zoom-out | `intermediate_zoom_out_report.md` | 0 | 9 | 6 |
| 9 Implementation Readiness (DetailedRange) | implementation-readiness, codebase-details, style | `implementation_readiness_report.md` | 1 | 8 | 16 |

After deduplication across stages: **1 Blocker, 13 Major action items, 9 Nit
action items**, plus stale text to update.

**Change since the reviews started:** the `constant()` move shipped as commit
`62c9a53` during the review. Stages 7–9 saw the new code; Stages 5–6 did not.
Findings about the math.js chunk are therefore not defects but stale text
(item S1).

**Main tension between stages.** Stages 6 and 7 mostly propose additions (new
sections, roadmap columns, more static checks, a release process, per-rule
exemption maps). Stage 8 argues that most of these gaps close better by
deleting material, since this is a five-page personal project. Where both
directions fix the same finding, the action items below say so and mark the
choice as an author decision.

## 🔴 Blocker

### B1. The static helper check fails on the wrapper pattern the plan prescribes

*   **Where:** P3 (line 251), target file 9 (lines 630–632), zeta (line 668),
    riemann (lines 685–690).
*   **Problem:** P3 and `pages.test.js` fail any page script that defines
    `function stateFromHash(`. `src/riemann.js:64` already defines exactly
    that as its clamping wrapper (verified), and the plan tells `zeta.js` to
    copy the pattern. `npm test` fails at commit 5 (zeta) or 7 (riemann), and
    since every push deploys after `npm test`, the plan cannot proceed.
*   **Fix options:** (a) one wrapper name for page-specific clamping on every
    page (ftc already uses `loadState`), with riemann renamed in its commit;
    or (b) the check looks for copied *code* (`createElementNS`,
    `URLSearchParams(location.hash`) outside `pageUtils.js` instead of
    function names (Stage 8 item 5), which also catches copies under other
    names.
*   **Sources:** Stage 5 Major 1, Stage 9 B1.

## 🟡 Major

### M1. The hash parser's described behaviour is wrong

Line 370 says invalid booleans keep the default; line 559 says anything but
`1` is false; line 563 says this is "exactly" what all four copies do. In
fact booleans use `raw === '1'`, `xMax=` reads as `0`, exponential has no
string branch, zeta has no boolean branch and clamps inside its parser, and
no copy accepts a hash without `#`. The behaviour for each page's own
settings is the same, which is what matters for G5. **Fix:** describe the
parser as "the current `pageUtils.js` code, moved unchanged", state that the
copies agree for each page's settings (and why zeta's differs in form only),
and delete the separate behavioural prose and the "missing `#`" test case.
*Sources:* Stage 6 #2, #3; Stage 7 #1; Stage 8 #4; Stage 9 M7.

### M2. `hashState.js` as a separate module (author decision)

Stage 8 proposes keeping the parser in `pageUtils.js` and having `main.js`
import it directly; the spec adds a new module so it is testable without the
DOM. Either way, the tests need each page's `DEFAULTS`, which are private to
DOM page scripts (Stage 9 M2): copy the values into the test, or move them to
DOM-free modules. **Decide:** separate pure module vs. folding into
`pageUtils.js`; and how tests get each page's defaults.
*Sources:* Stage 5 Nit; Stage 8 #4; Stage 9 M2.

### M3. Legacy URLs need a permanent home

The checklist (step 3) and G5 rely on legacy URLs that live only in the
conformance table, which commit 10 deletes. **Fix:** make saved-hash fixtures
in the hash tests the permanent home, with expected states written out; drop
checklist step 3 or point it at the fixtures; require one fixture per new
page.
*Sources:* Stage 5 #5; Stage 6 #1; Stage 7 #11; Stage 8 #2; Stage 9 M4.

### M4. `PENDING_CONFORMANCE` (author decision)

A set of page names cannot say which rules each page skips; it includes
surface, which has nothing to skip; it goes by three names. Two directions:
(a) a map from page to skipped rules (exponential/zeta skip P3, riemann/ftc
skip P2) — Stage 9; (b) remove it and add `pages.test.js` after the last page
commit, so it passes from its first run — Stages 5 and 8. **Decide** one.
*Sources:* Stage 5 #2 (and the Stage 5 disagreement); Stage 6 #5; Stage 8 #3;
Stage 9 M1.

### M5. Scope of the static check

Stage 7 wants more checks (U5 files, P3 coverage, U9 scope); Stage 8 wants
fewer: keep U2, U3, U4, P1, `<sup>`/`<sub>`, and one copied-code check; drop
U1 (cannot fail), the static U9 check and the P2 id checks. The static check
also does not read every file U5 and P3 depend on (Stage 7 #3), and it bans
`<sup>`/`<sub>` more strictly than U5 (Stage 9 N13). **Fix:** settle the list
together with B1; mark U1 as "by construction" in the rule table.
*Sources:* Stage 6 #15; Stage 7 #3, #16, #32; Stage 8 #5; Stage 9 N12, N13.

### M6. The manual checklist and who runs it

Agents are told to run a checklist only a person can judge (CUJ 1), every
push deploys so the checklist blocks nothing, and it grows with every page.
Stage 7 proposes gating the deploy (manual dispatch, tags); Stage 8 rejects a
release process for this project size. **Fix:** cut the checklist to about
six visual and interaction steps; agents stop after `npm test` and hand those
steps to the owner as pending; record gating the deploy as a rejected
alternative with its trade-off, and reword the Problem statement so it
doesn't overstate the risk.
*Sources:* Stage 5 #3, #4; Stage 7 #5, #6; Stage 8 #6, #7.

### M7. The spec keeps a copy of the contract

The spec says it refers to rules by number, yet lines 232–253 hold the full
rule table, and commit 10 keeps "the contract summary". Line 136 and
Alternative C contradict this. **Fix:** the rule table moves to `AGENTS.md`
in commit 1 and the spec keeps a one-line pointer; drop the "last reviewed"
stamp (which also asks a commit to contain its own hash).
*Sources:* Stage 6 #4; Stage 7 #13; Stage 8 #12; Stage 9 N3, N8.

### M8. Roadmap fields don't match G3

G3 promises prerequisites, tests, strained rules and status per topic; the
table has none of them. **Fix (Stage 8):** narrow G3 to the table's actual
columns rather than adding columns; delete a row once its page ships; replace
the "< 100 ms" budget for complex functions with a plain note.
*Sources:* Stage 5 Nit; Stage 6 #6; Stage 7 #9, #18; Stage 8 #9.

### M9. Open questions and decisions are spread out

"Decided during drafting" duplicates decisions, "Q1 → C" refers to an option
list not in the document, Q-numbering has gaps, and G1 still says "C1, C2".
**Fix:** delete the decided list and renumber the open questions; fix G1.
*Sources:* Stage 6 #8, #9; Stage 7 #10, #12; Stage 8 #11.

### M10. `exponentialMath.js` is underspecified

Return values for a = 0, b = 0 and f ≡ 0 are not defined; `properties()` also
needs a·eᶜ and −c/b; the tests have no expected values or tolerance; `f`,
"a zero" and `doublingDistance` (also means halving) are unclear. **Fix:**
specify each function's result in the degenerate cases and list test cases
with expected values.
*Sources:* Stage 9 M3, N14.

### M11. G6(b) promises tests no commit adds

Tests for `extent`, `robustExtent` and `niceTicks` have no target file.
**Fix:** add `src/pageUtils.test.js` (or a format test) to commit 2, or drop
G6(b).
*Sources:* Stage 5 Nit; Stage 7 #28; Stage 9 M5.

### M12. `.chart-figure` CSS is ambiguous

Unclear whether `margin: 0`, svg height and the mobile rules carry over,
which per-page rules stay, and that ftc's combined selector must be split.
**Fix:** list the selectors that move and the ones that stay per page.
*Sources:* Stage 7 #20; Stage 9 M6.

### M13. Commit steps disagree and commit 10 is unclear

The intro omits the `npm run build` step the Verification Plan requires; the
"keep" list for commit 10 uses names that don't match headings and leaves
sections' fate open; CUJ 3's "one commit changes that page only" doesn't fit
the shared-module commits. **Fix:** one per-commit procedure stated once;
commit 10's keep/delete list by exact heading; CUJ 3 as "one page or one
shared module per commit".
*Sources:* Stage 7 #4; Stage 8 #2; Stage 9 M4, M8.

## 🟢 Nit

*   **N1.** Rejection reasons cite the author instead of trade-offs (Stage 7 #8).
*   **N2.** Admission rule is called "testable" but relies on judgment; say
    "a checklist for judgment" or give a sharper test (Stage 7 #14).
*   **N3.** No Risks section: Stage 7 wants one, Stage 8 says no; the
    `expression.js` call-position issue predates the spec and belongs in a
    separate note (Stage 7 #7; Stage 8 #8).
*   **N4.** Leftover helpers in exponential (`num`, `signed`), zeta's closed
    band path, x-tick counts, sliceChart's hyphen ticks: state their fate
    (Stage 5 Nit; Stage 8 #13; Stage 9 N1, N2).
*   **N5.** README edits: merge vs move, Unicode subscripts, where the spec
    link goes (Stage 7 #19; Stage 9 N4).
*   **N6.** `pages.test.js` mechanics: repository root, `/src` paths, regexes
    (Stage 9 N5).
*   **N7.** Commit 1 names modules that don't exist yet; mention the test in
    `AGENTS.md` from commit 3 (Stage 9 N6, N7).
*   **N8.** Undefined terms: `svgTex`, `renderStatic()`, clip id, RK4 in
    `surface.js`, "Specs and reviews", EGM, HS/UG, `expression-*.js` chunk;
    one sentence pointing to `AGENTS.md` is enough (Stage 6 #13, #14;
    Stage 8 #14).
*   **N9.** Wording: vague phrases, hedged numbers, repeated content, diagram
    notation, line wrapping, decision-record template, "same view" undefined
    (Stage 7 #17, #21, #23–#27, #29, #30; Stage 9 N9–N11, N15, N16).

## Stale text (not defects)

*   **S1.** The `constant()` move and the math.js regression are already fixed
    (commit `62c9a53`): Q8, Alternative F, the performance requirement,
    commit 2's `constant()` part, target files 5–7 (in part), the bundle-size
    check ("today both print 1") and `AGENTS.md` lines 18 and 49, which still
    list `constant` in `pageUtils.js`. Mark done or delete; keep at most one
    sentence or one regex test as a guard against it coming back
    (Stage 5 #7; Stage 7 #2, #31; Stage 8 #1; Stage 9 stale list).

## Author decisions needed before resolving

1.  **B1:** one wrapper name everywhere, or a copied-code check instead of a
    name check.
2.  **M2:** keep `hashState.js` as a separate pure module, or fold the parser
    into `pageUtils.js`; and how tests get each page's defaults.
3.  **M4:** a per-page map of skipped rules, or no pending list with
    `pages.test.js` added after the last page commit.
4.  **M6 / N3:** confirm "no release process, no Risks section", as Stage 8
    proposes, or add them as Stage 7 proposes.

## Traceability matrix

| Action item | Stage 5 | Stage 6 | Stage 7 | Stage 8 | Stage 9 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| B1 | Major 1 | | | #5 | B1 |
| M1 | | #2, #3 | #1 | #4 | M7 |
| M2 | Nit | | | #4 | M2 |
| M3 | Major 5 | #1 | #11 | #2 | M4 |
| M4 | Major 2 | #5 | | #3 | M1 |
| M5 | | #15 | #3, #16, #32 | #5 | N12, N13 |
| M6 | Major 3, 4 | | #5, #6 | #6, #7 | |
| M7 | | #4 | #13 | #12 | N3, N8 |
| M8 | Nit | #6 | #9, #18 | #9 | |
| M9 | | #8, #9 | #10, #12 | #11 | |
| M10 | | | | | M3, N14 |
| M11 | Nit | | #28 | | M5 |
| M12 | | | #20 | | M6 |
| M13 | | | #4 | #2 | M4, M8 |
| N1–N9 | Nits | #10–#14 | #7, #8, #14, #17, #19, #21, #23–#27, #29, #30 | #8, #13, #14 | N1–N11, N14–N16 |
| S1 | Major 7 | | #2, #31 | #1 | stale list |
| Major 6 (U6 renames via alias) | Major 6 | | | | — folded into M3: fixtures guard old URLs |
| Major 8 (split 2D layer) | Major 8 | | | Nit #10 (don't split) | — rejected by Stage 8; author may revisit |
