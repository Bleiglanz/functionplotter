# Goldfish Review Report

**Target:** `/home/antonr/Temp/functionplot/specs/roadmap-and-page-contract.md` (`1-734`)
**Stage:** EGM Stage 5, Initial Zoom Out
**Standard (egm-zoom-out):** `/home/antonr/.claude/plugins/cache/egm/egm/0.1.0/resources/document_standards/zoom-out-standard.md`

## Reviewer Status

| Reviewer | Status |
| --- | --- |
| `egm-zoom-out` | completed |
| `egm-inventive-catalyst` | completed |

Severity breakdown: 0 Blocker, 8 Major, 7 Nit (after deduplication).

Overall verdicts:
- `egm-zoom-out`: the spec passes with changes. The root problem is correctly identified, the spec fits the project's philosophy, and the move of `constant()` (Q8) and the single hash parser were checked against the code and are correct.
- `egm-inventive-catalyst`: it found real false compromises; all of its findings are advisory. It judged these choices balanced: Q8 / Alternative F, Alternative B (surface plotter on universal rules only), the CLT seed in the hash, Alternative D (one document), and one page per commit with `PENDING_CONFORMANCE`.

**The reviewers disagree on one point:** `egm-zoom-out` says `PENDING_CONFORMANCE` is unnecessary ceremony (Major 2 below). `egm-inventive-catalyst` accepts it as balanced. The author should decide.

## Prioritized Findings (Blockers -> Major -> Nits)

### P3 static check rejects the wrapper pattern the spec prescribes - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** Lines 251 (P3 row), 385-386 (Conformance work: module changes), 630-632 (Target File 9, `src/pages.test.js`), 668 (Target File 13, `src/zeta.js`)
* **Discrepancy Description**: P3's check fails any page that contains `function stateFromHash(` or `const stateFromHash =`.
  * `src/riemann.js:64` already defines `function stateFromHash()` as a clamping wrapper around the shared helper, which it imports as `readHash`.
  * The spec tells `zeta.js` to copy that pattern.
  * Commit 7 does not rename riemann's wrapper. So `npm test` fails once riemann leaves `PENDING_CONFORMANCE`, or zeta fails at commit 5.
* **Rationale & Recommendation**: The rule confuses a copied helper with a page wrapper that calls the shared helper. Pick one convention:
  * give wrappers a different name (for example `readState`) and add the rename to commit 7, or
  * have P3 detect copied bodies (for example a local `new URLSearchParams(location.hash` or `createElementNS`) instead of names.

  State the chosen convention in U6/P3.

### Simpler commit order removes the temporary `PENDING_CONFORMANCE` mechanism - Severity: Major
* **Reviewer Lens:** `egm-zoom-out` (`egm-inventive-catalyst` disagrees, see above)
* **Affected Scope:** Lines 397-405 (Conformance table), 509-519 (Commit order), 530-535 (Target File 1), 633-636 (Target File 9), 721-723 (Verification Plan)
* **Discrepancy Description**: Conformance progress is kept in three places that must be synced by hand:
  * the `PENDING_CONFORMANCE` set,
  * the table's Status column,
  * the AGENTS.md "still have their own copies" sentence.

  The spec also edits itself in five commits and deletes half of itself in commit 10. For a one-person, five-page project that is too much ceremony.
* **Rationale & Recommendation**:
  * Land `pages.test.js` after commit 8, green, with only the permanent `EXEMPT_FROM_2D_RULES`.
  * Drop the Status column and the per-commit spec edits; `git log` already records progress.
  * Delete the table once, in cleanup.

  The hash unit tests and the checklist already guard each conformance step.

### Every push deploys, so the manual checklist gates nothing - Severity: Major
* **Reviewer Lens:** `egm-inventive-catalyst`
* **Affected Scope:** Lines 59-63 (The Problem), 330-336 (D1), 409-419 (Alternative A), 493-495 (NFR Rollout and rollback), 708-710 (Files not changed, `pages.yml`)
* **Discrepancy Description**: The spec names "changes reach users unchecked" as the real weakness, rejects browser tests, and falls back on a checklist that the brief admits "does not block a deploy". That ties two separate things together: avoiding browser tests and deploying on every push. `pages.yml` already has `workflow_dispatch`.
* **Rationale & Recommendation**: Separate publishing from pushing. Deploy on `workflow_dispatch`, a tag, or a `release` branch that the owner fast-forwards after the checklist. Then the checklist becomes a real gate. Update D1, the NFR and the `pages.yml` entry.
  * Trade-off: an extra manual release step, the live site can lag behind `master`, and rollback becomes redeploying an earlier tag.

### Checklist is for "what only a person can judge", yet agents run it and its cost grows with every page - Severity: Major
* **Reviewer Lens:** `egm-inventive-catalyst`
* **Affected Scope:** Lines 107-111 (G7), 182-183 (CUJ 1), 310-326 (Manual checklist), 546 (AGENTS.md pointer)
* **Discrepancy Description**:
  * An agent without a browser cannot do steps 5, 6 or 8.
  * A shared-module change requires every step on every page: 9×5 today, about 9×15 once the roadmap is built.
  * Steps 3 and 4 are already covered by `hashState.test.js` (lines 573-578), and part of step 1 can be checked statically.
* **Rationale & Recommendation**:
  * Split the checklist into automated steps (move them out and point to their tests) and human visual/interaction steps.
  * Require the human steps on every page only when `page.css` or `theme.css` changes. For JS shared modules, rely on tests plus one representative page.
  * In CUJ 1, have agents report the manual steps as "pending owner".
  * Optionally add a jsdom/happy-dom smoke test that boots each page. If so, state in the Non-Goals whether it is allowed.

### Legacy-URL check depends on a table that commit 10 deletes - Severity: Major
* **Reviewer Lens:** `egm-inventive-catalyst`
* **Affected Scope:** Lines 95-100 (G5), 320 (checklist step 3), 397-405 (Conformance table), 517-518 and 531-535 (commit 10 cleanup)
* **Discrepancy Description**: G5 is permanent, but the only place the legacy URLs are stored is the temporary conformance table. After cleanup, step 3 points at nothing, and new pages have nowhere to record their own legacy URL.
* **Rationale & Recommendation**: Make the saved-hash fixtures in `hashState.test.js` (line 574) the permanent home for legacy URLs. Point G5 and step 3 at them, and add "add a saved-hash fixture" to U6 for every new page.

### "Hash keys can never be renamed" is stated as a permanent law - Severity: Major
* **Reviewer Lens:** `egm-inventive-catalyst`
* **Affected Scope:** Line 239 (U6), 337-340 (D2), CUJ 2, Q2
* **Discrepancy Description**: Keeping key names and file names fixed forever is a false compromise. The project already redirects at the file level (`index.html#expr=…` to `surface.html`), and Q2 may merge or split pages.
* **Rationale & Recommendation**: Reword U6 as "shipped hash URLs keep opening the same view". In D2, record that a rename goes through an alias/migration map in `parseHash`, covered by the fixtures, and that a file rename goes through a redirect stub. Do not build the alias map now.

### Nothing permanently guards against the math.js-in-light-bundle regression - Severity: Major
* **Reviewer Lens:** `egm-inventive-catalyst`
* **Affected Scope:** Lines 167-169 (Q8), 487-492 (NFR Performance and size), 716-719 (Verification Plan, build check)
* **Discrepancy Description**: The only safeguard is a manual `grep` of `dist/` during the conformance commits. `pageUtils.js` will grow with the roadmap, so the regression can come back unnoticed.
* **Rationale & Recommendation**: Add a dependency-boundary assertion to `pages.test.js`: `pageUtils.js`, `hashState.js` and `tex.js` must not import `expression.js` or `mathjs`, directly or through each other. Optionally also keep an allow-list of pages that may import `expression.js`.

### 2D rule layer mixes page shell with SVG drawing, so canvas pages fit neither layer - Severity: Major
* **Reviewer Lens:** `egm-inventive-catalyst`
* **Affected Scope:** Lines 245-253 (2D page rules), 255-259 (Named exceptions), 304 (Complex functions row), 625-627 (`EXEMPT_FROM_2D_RULES`)
* **Discrepancy Description**: P1, P2, P4 and P5 are page-shell rules; only P3 is about SVG. The planned canvas page (complex functions) would either be forced through P3 or need a second wholesale exception.
* **Rationale & Recommendation**: Split the P layer into shell rules and an SVG-drawing rule. Grant exemptions per rule, so the exempt list becomes a page → exempt-rules map.

### `main.js` keeps local hash wrappers instead of importing the shared ones - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** Lines 674-677 (Target File 14)
* **Discrepancy Description**: After commit 2, `pageUtils.js` imports only `format.js` and `tex.js`, which `main.js` already uses. `sliceChart.js` will import `pageUtils.js` anyway. The thin wrappers keep the kind of duplication G4 is meant to remove.
* **Rationale & Recommendation**: Import `stateFromHash`/`writeHash` directly and call `stateFromHash(DEFAULTS)`.

### A separate `hashState.js` may not be needed - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** Lines 239 (U6), 357-367 (module diagram), 554-587 (Target Files 3 and 5)
* **Discrepancy Description**: Once `constant()` moves out, `pageUtils.js` is equally testable, since `tex.js` already loads under Vitest.
* **Rationale & Recommendation**: Fold `parseHash`/`serializeHash` into `pageUtils.js`, unless a stated reason (such as keeping `main.js` independent of `pageUtils.js`) justifies the extra module.

### Goals and Problem promise work the plan does not schedule - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** Lines 47-49 (Problem), 102 (G6(b)), 679-683 (Target File 15, `src/sliceChart.js`)
* **Discrepancy Description**:
  * No test file covers `extent`/`robustExtent`.
  * `sliceChart.js` keeps its own axis code, including the hyphen tick labels the Problem section cites.
* **Rationale & Recommendation**: Drop the range-helper tests from G6 or add `pageUtils.test.js` to commit 2. State that the axis code in `sliceChart.js` falls under the surface plotter's exception.

### ε–δ roadmap row goes into page-level design - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out`
* **Affected Scope:** Lines 121 (Non-Goal), 299 (ε–δ row), 472-478 (Alternative G)
* **Discrepancy Description**: The row specifies interaction details, and Alternative G records a design decision for an unbuilt page. Both contradict the Non-Goal at line 121.
* **Rationale & Recommendation**: Cut the row to one line like the others, and move the δ-search decision into that page's own design. The complex-functions budget (line 304) is fine as a recorded gap.

### Rule IDs have no stability guarantee - Severity: Nit
* **Reviewer Lens:** `egm-inventive-catalyst`
* **Affected Scope:** Lines 156-159 (Q1 → C), 206-223 (Which document holds what), 316-326 (checklist Rule column)
* **Discrepancy Description**: The spec, the checklist and the roadmap refer to AGENTS.md rules by number, and AGENTS.md wins conflicts. If AGENTS.md renumbers, those references silently point at the wrong rules.
* **Rationale & Recommendation**: State in AGENTS.md that rule IDs are never reused or renumbered (retired rules keep their number). Optionally, have a test check that every ID the spec mentions exists in AGENTS.md.

### AGENTS.md size argument is used against 40 lines while the plan grows it by more - Severity: Nit
* **Reviewer Lens:** `egm-inventive-catalyst`
* **Affected Scope:** Lines 449-458 (Alternative E), 547-550 (AGENTS.md changes), CUJ 1
* **Discrepancy Description**: Alternative E rejects adding the binding items to AGENTS.md because of its size, yet the plan and the roadmap grow it by per-page paragraphs. The spec dropped the brief's "about three lines per topic" suggestion.
* **Rationale & Recommendation**: Adopt about three lines per page in AGENTS.md, with details in a header comment in `src/<topic>.js`. That frees room to move the binding items into AGENTS.md.

### Complex-functions time budget has no stated way to meet it - Severity: Nit
* **Reviewer Lens:** `egm-inventive-catalyst`
* **Affected Scope:** Line 304 (Complex functions row)
* **Discrepancy Description**: About 250k math.js evaluations per redraw are unlikely to fit "< 100 ms".
* **Rationale & Recommendation**: Note the known options:
  * compile once to a closure over plain complex arithmetic;
  * draw at reduced resolution while the user drags.
