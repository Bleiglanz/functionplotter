# Goldfish Review Report

**Target:** `/home/antonr/Temp/functionplot/specs/roadmap-and-page-contract.md` (`Lines 1-498`; the Detailed Implementation Plan from line 499 is out of scope)

**Stage:** 7, Critic Review. **Standard:** `feature-spec-standard.md` (design, structural); the style reviewer used its persona's own rules.

## Reviewer Status

| Reviewer | Status |
| --- | --- |
| `egm-design` | completed (no Blockers, 9 Major, 7 Nit) |
| `egm-structural` | completed (no Blockers, 6 Major, 9 Nit) |
| `egm-style` | completed (no Blockers, 8 Major, 18 Nit) |

After deduplication there are **no Blockers, 14 Majors and 20 Nits**.

The synthesizer checked the load-bearing claims against the source:
- **Confirmed:** the hash-parser semantics (`src/pageUtils.js:133-134`, `src/main.js:106-107`, `src/exponential.js:55-56`, `src/zeta.js:44`).
- **Refuted:** one design claim, that riemann.js and ftc.js import `constant` from `pageUtils.js`.
- **New finding from that check:** the spec's math.js and `constant()` premise is out of date. See Major 2.

## Prioritized Findings (Blockers -> Major -> Nits)

### 1. The described hash parser would change how existing URLs open - Severity: Major
* **Reviewer Lens:** `egm-design`, `egm-style` (verified by the synthesizer)
* **Affected Scope:** `Lines 369-373`, `321` (checklist step 4), `162-163` (Q5 "verified identical"), `95-100` (G5)
* **Discrepancy Description**: Line 370 describes `parseHash` this way: "boolean from `1`/`0` … invalid values keep the default". Every current copy behaves differently:
  - **Booleans:** they use `raw === '1'`, so any other value (`showRef=abc`, `fitZ=true`) becomes `false`, not the default.
  - **Numbers:** they accept `Number.isFinite(+raw)`. As a result `xMax=` becomes `0`, `0x10` becomes 16, and `' 3 '` becomes 3.

  Building the parser as written would break G5 and U6. Step 4 tests `#n=abc&xMax=` and expects "falls back to defaults or clamps". On zeta, `xMax=0` gives an empty chart. So the step either fails on pages nobody has changed, or it cannot fail at all.
* **Rationale & Recommendation**: Write the exact current rules into the spec and keep them on purpose. Require unit tests for these edge cases:
  - an empty value
  - a boolean other than `1`
  - `Infinity`
  - hex and exponent notation
  - a repeated key (`URLSearchParams.get` returns the first)
  - unknown keys

  Normal saved URLs will not catch any of these. For step 4, give each key its own expected value, or use a broken hash whose current result really is the default.

### 2. The math.js chunk problem and the `constant()` move are already done in the code - Severity: Major
* **Reviewer Lens:** synthesizer verification. This contradicts `egm-design` Major 4 and Nit 16, which accepted the premise.
* **Affected Scope:** `Lines 167-169` (Q8), `357-367` (diagram: "pageUtils.js ─ imports math.js"), `374-376`, `393-395`, `460-470` (Alternative F), `487-492` (NFR performance), `348-351` (D5)
* **Discrepancy Description**: At HEAD, `src/pageUtils.js` imports only `./format.js` and `./tex.js`, and `constant()` is defined in `src/expression.js:72`. `riemann.js:1` and `ftc.js:1` already import `constant` from `expression.js`. `exponential.js` and `zeta.js` import nothing that pulls in math.js. So these parts of the spec rest on a premise that is no longer true:
  - Q8's planned move
  - Alternative F
  - the "before" column of the module diagram
  - the NFR claim that exponential and zeta "load the math.js chunk today"
  - the bundle-size gate at 393-395

  `AGENTS.md`'s list of `pageUtils.js` exports, which still includes `constant`, is out of date as well. Style Major 7 (D5's claim "Pages load only what they use" contradicting the NFR) goes away for the same reason: D5 is true today.
* **Rationale & Recommendation**: Check the build output (`dist/assets/exponential-*.js`, `zeta-*.js`) to confirm. Then remove or reword Q8, Alternative F, the NFR performance bullet and the diagram row. Keep "no page that parses no expression may import math.js" as a regression check, not as work to do. Fix the `AGENTS.md` line in the same change.

### 3. The static page check does not read the files that U5 and P3 depend on - Severity: Major
* **Reviewer Lens:** `egm-design`
* **Affected Scope:** `Lines 238` (U5), `251` (P3), `387-391`, `101-106` (G6c)
* **Discrepancy Description**: According to line 388, `pages.test.js` reads the HTML files, the README and the stylesheets. U5 ("calls `renderStatic()`") and P3 ("no local copies of `svgEl` …") can only be checked in `src/*.js`. Both are marked **S**, but nothing would check them. P3 is the rule that would have prevented the four copies. It is also not stated how U6's "through `hashState.js`" is enforced for `main.js`.
* **Rationale & Recommendation**: Have the check also read each page's entry script, found from its `<script type="module" src>`. Define P3 as a concrete pattern, for example no `function svgEl` or `function stateFromHash` outside `pageUtils.js`/`hashState.js`. State how U6 is checked.

### 4. "One commit changes that page only" does not fit the shared-module commits - Severity: Major
* **Reviewer Lens:** `egm-design`, `egm-structural`, `egm-style`
* **Affected Scope:** `Lines 194-202` (CUJ 3), `312-314`, `374-376`, `392-395`, `397-405`, `491-492`
* **Discrepancy Description**: Several changes touch shared modules:
  - adding `hashState.js` and the `stateFromHash`/`writeHash` wrappers changes `pageUtils.js`, which riemann and ftc use;
  - moving the `chart-figure` styles into `page.css` changes a shared stylesheet.

  Under line 313, each of these needs the checklist on all pages. The conformance table lists only per-page rows. "Commit 2" (line 491) is not defined anywhere in lines 1-498. Line 394 limits the bundle check to the exponential and zeta commits, while line 491 says "every later commit". The design reviewer's point that the `constant` move breaks riemann and ftc imports is withdrawn; see Major 2.
* **Rationale & Recommendation**: Add rows for the shared commits, give their order, and mark each "checklist: all pages". Change CUJ 3 to "one page or one shared module per commit". Replace "Commit 2" with a description of the change. Make lines 394 and 491 give the bundle check the same scope.

### 5. CUJ 1 has an agent run a checklist that only a person can run - Severity: Major
* **Reviewer Lens:** `egm-design`
* **Affected Scope:** `Lines 182-183`, `107-111` (G7), `312-326`, `119-120`
* **Discrepancy Description**: G7 says the checklist covers "what only a person can judge". Steps 5-8 need OS dark mode, a 390 px window, the network panel and checking the focus ring, and browser scripts are a non-goal. CUJ 1 still says the agent "runs the manual checklist". Nothing says who signs off or where a passed run is recorded.
* **Rationale & Recommendation**: The agent stops after `npm test` and hands the steps the change requires to the owner. Say where a pass is recorded, such as the commit message or the roadmap status.

### 6. Gating the deploy is not considered as an alternative - Severity: Major
* **Reviewer Lens:** `egm-design`
* **Affected Scope:** `Lines 59-63`, `312`, `330-336` (D1), `409-419`, `493-495`
* **Discrepancy Description**: The spec names "every push deploys" as the weak point. Its only mitigation is a checklist that relies on discipline. Cheap gates that need no browser are not discussed:
  - deploy only on `workflow_dispatch` (the workflow already supports it) or on a tag;
  - an environment protection rule that needs manual approval;
  - working on a branch until the checklist passes.
* **Rationale & Recommendation**: Add an alternative for gating deploys. Adopt one, for example dropping the `push` trigger, or reject it with a concrete cost.

### 7. No Risks & Mitigations section - Severity: Major
* **Reviewer Lens:** `egm-design`, `egm-structural`
* **Affected Scope:** whole scope; partly covered at `59-63`, `330-336`, `482-495`
* **Discrepancy Description**: The standard requires failure modes, security implications, limits and mitigations. Risks are spread across The Problem, D1 and the NFRs. Several are not named at all:
  - U6 makes every new hash key permanent;
  - shared URLs carry user expressions that math.js evaluates in the visitor's browser, and function names in call position are exempt from the allow-list;
  - `AGENTS.md` grows with each topic;
  - the spec and `AGENTS.md` can drift apart, and nothing checks the "last reviewed" stamp;
  - nothing says who decides whether a new rule is U or P;
  - the shared parser could change how zeta reads its values;
  - the static check could report false failures or miss real ones;
  - the "delete the table when done" lifecycle could fail.
* **Rationale & Recommendation**: Add an H2 "Risks & Mitigations" with one entry per risk and its mitigation, merged with or next to the NFRs. For security, treat hash values as untrusted input. Name the safeguards: the symbol allow-list in `compileFunction` and KaTeX `trust: false`. Either test that `evaluate`, `import` and `createUnit` in call position are rejected, or record this as an accepted risk.

### 8. Rejection reasons cite the author instead of trade-offs - Severity: Major
* **Reviewer Lens:** `egm-design`, `egm-structural`, `egm-style`
* **Affected Scope:** `Lines 416-419`, `427-428`, `435-436`, `446-447`, `456-458`, `477-478`, `468-470`
* **Discrepancy Description**: Six of the seven alternatives open with "Rejected by author:" and give no link, which the Alternatives Rule forbids. B and G restate the decision instead of giving a trade-off; C and E partly do the same. F claims "the only option without a cost", and Major 2 makes F moot anyway. The brief's option of reading a renamed key under its old name (alias keys) was dropped without being listed as an alternative, although U6 now forbids key changes outright.
* **Rationale & Recommendation**: Drop "Rejected by author" or link the decision, for example to `specs/concepts_brief.md`. Write each reason as a concrete trade-off. For B: no defined end state, risk to the `setInsets` viewport logic, and risk to the surface links. Add the alias-key alternative and say why the complete freeze was chosen.

### 9. The roadmap table lacks fields that G3 promises - Severity: Major
* **Reviewer Lens:** `egm-design`, `egm-structural`, `egm-style`
* **Affected Scope:** `Lines 81-89` (G3), `286-305`, `183`
* **Discrepancy Description**: The table is missing these G3 fields:
  - prerequisites
  - tests
  - "contract rules it strains"
  - status (it appears once in prose at line 288, although CUJ 1 updates it per entry)

  "Reuses / needs" merges two fields with a slash. The strained rules are unstated:
  - complex functions is drawn on canvas, so it strains P3;
  - CLT strains U6 (seed in the hash);
  - ODE strains P5.

  Eigenvectors has no main interaction. Complex functions has only hover, which may fail admission criterion 2 (line 267), and the spec does not flag it.
* **Rationale & Recommendation**: Add Prerequisites, Tests, Strains and Status columns, and split "Reuses" from "Needs". Alternatively, use a block per topic, or narrow G3 to what the table holds. Run each entry through the admission rule and record borderline cases.

### 10. G1 still uses the replaced C1/C2 numbering - Severity: Major
* **Reviewer Lens:** `egm-structural`, `egm-style`, `egm-design`
* **Affected Scope:** `Lines 73-76` vs `151-154`, `227-253`
* **Discrepancy Description**: G1 promises "C1, C2, …", while the decision at 151 and the tables use U1-U10 and P1-P5.
* **Rationale & Recommendation**: Rewrite G1 with U/P numbering, and drop the sentence about the replaced scheme.

### 11. Lasting checks depend on legacy URLs kept in a temporary table - Severity: Major
* **Reviewer Lens:** `egm-structural`
* **Affected Scope:** `Lines 95-100` (G5), `320` (step 3), `194-202`, `397-405`
* **Discrepancy Description**: G5 says each page's legacy URL is "in the manual checklist", but step 3 points to the conformance table, which is deleted when done. After that, step 3, G5's measure and CUJ 3 have nothing to refer to.
* **Rationale & Recommendation**: Move the legacy URLs into a lasting "Legacy URLs" list, or into the `hashState` test fixtures, and point step 3 and G5 to it.

### 12. Open Questions mixes open and decided items, and decisions live in two places - Severity: Major
* **Reviewer Lens:** `egm-structural`, `egm-style`
* **Affected Scope:** `Lines 138-169`, `328-353`
* **Discrepancy Description**:
  - Three items are open (Q2, Q3, Q7), and six are already decided but sit under the same heading.
  - The D1-D6 records are a second, differently formatted place for decisions.
  - "Q1 → C" refers to an option C defined only in the brief.
  - The "Rule numbering" item has no number.
  - A stray blank line at 155 splits the list.
  - Q7 repeats line 131-132 and line 288.
* **Rationale & Recommendation**: Keep only open items in Open Questions. Move resolved items to the decision records (D7 onward), or to a "Resolved questions" section that states each resolution in words. Drop "→ C" and the process parenthetical at 149.

### 13. The spec contradicts itself on where rules live - Severity: Major
* **Reviewer Lens:** `egm-style`
* **Affected Scope:** `Lines 221-223` vs `156-159`, `456-458`
* **Discrepancy Description**: Line 221 says "rules live in `AGENTS.md`". The admission rule and the checklist are must-follow rules, and they live in this spec.
* **Rationale & Recommendation**: Reword it: contract rules (U, P) live in `AGENTS.md`, while the admission rule and checklist live here and are reached through two pointers. Each rule exists in exactly one file.

### 14. The admission rule is called "testable" but relies on judgment - Severity: Major
* **Reviewer Lens:** `egm-style`
* **Affected Scope:** `Lines 77-80`, `263-272`
* **Discrepancy Description**: "One clear picture" and "shows the concept's defining property" are judgments, not checks with a pass/fail outcome.
* **Rationale & Recommendation**: Call it a three-part rule applied by the reviewer, with one passing and one failing example. Drop "clear" from criterion 2.

### 15. "Last reviewed" field promised but missing - Severity: Nit
* **Reviewer Lens:** `egm-structural`, `egm-style` (who rated it Major), `egm-design`
* **Affected Scope:** `Line 223` vs header `3-5`
* **Rationale & Recommendation**: Add a "Last reviewed: <date>, <commit>" field to the header, or delete the sentence.

### 16. Check codes and gaps in the U-rule checks - Severity: Nit
* **Reviewer Lens:** `egm-structural`, `egm-design`, `egm-style`
* **Affected Scope:** `Lines 227-228`, `235-241`, `104-105`, `316-326`, `387-391`
* **Discrepancy Description**:
  - The legend does not define "M (review)", and no checklist step covers U7.
  - The spec does not say how U2 and U3 are matched, or that `index.html` is excluded from them.
  - A static check cannot tell whether a `<sup>` holds math.
* **Rationale & Recommendation**: Define the code or use plain M. Add a U7 step, or a static "imports a module that has a `*.test.js`" check. Spell out the U2 and U3 matching rules. Have the static check reject any `<sup>`/`<sub>` in pages.

### 17. Checklist wording and format - Severity: Nit
* **Reviewer Lens:** `egm-structural`, `egm-style`
* **Affected Scope:** `Lines 312-326`
* **Discrepancy Description**:
  - "requires all pages" should say "requires running the checklist on all pages".
  - "text readable" and "controls usable" are subjective.
  - Step 7 is not an instruction.
  - The separator row is uneven (`:-` vs `:---`).
  - Steps 4 and 8 do not mark which pages they apply to (the surface exception, zeta-specific keys).
* **Rationale & Recommendation**: Make each expected result concrete. Rewrite step 7 as "open the network panel and repeat steps 1-2". Add an "Applies to" column.

### 18. Roadmap table rows are uneven - Severity: Nit
* **Reviewer Lens:** `egm-structural`, `egm-style`
* **Affected Scope:** `Lines 296-305`
* **Discrepancy Description**:
  - The ε-δ cell (299) is a paragraph that repeats Alternative G.
  - The Links column mixes slugs and prose names.
  - Empty cells use both "—" and "none".
  - "default size" (304) is not defined.
* **Rationale & Recommendation**: Shorten the ε-δ cell. Use file names in Links and one empty-cell marker. Give the redraw budget in pixels.

### 19. README conformance is not tracked - Severity: Nit
* **Reviewer Lens:** `egm-design`
* **Affected Scope:** `Lines 50-51`, `165-166`, `397-405`
* **Rationale & Recommendation**: Add a README row: `$…$` math, and the exponential page listed under "Surface plotter features". Say whether the static check scans the README.

### 20. P2 should require a unique id on every chart figure - Severity: Nit
* **Reviewer Lens:** `egm-design`
* **Affected Scope:** `Lines 250`, `160-161`
* **Rationale & Recommendation**: `frame()` builds the clip id from the parent figure's id, so an extra figure without an id gets a clip id that clashes with others. Require a unique `id` in P2 and check it statically.

### 21. "Same view" is not defined, and ticks will change - Severity: Nit
* **Reviewer Lens:** `egm-design`
* **Affected Scope:** `Lines 95-100`, `189-192`, `376`, `381-383`
* **Rationale & Recommendation**: The shared `axes()` changes zeta's tick count and how exponential places its ticks. Define "same view" as the same state, controls and ranges, with small changes to axis decoration allowed.

### 22. G4's measure leaves out the surface plotter's copies - Severity: Nit
* **Reviewer Lens:** `egm-structural`, `egm-style`
* **Affected Scope:** `Lines 90-94` vs `42-48`, `403`
* **Rationale & Recommendation**: The measure covers only "the 2D pages", but the copies include `main.js` and `sliceChart.js`. Measure across all pages.

### 23. Decision records do not share one template - Severity: Nit
* **Reviewer Lens:** `egm-structural`
* **Affected Scope:** `Lines 330-353`
* **Rationale & Recommendation**: D1 uses labelled fields, while D2-D6 are prose, and D6 has no cost. Use one form throughout, and have D1 point to Alternative A instead of repeating it.

### 24. Diagram notation - Severity: Nit
* **Reviewer Lens:** `egm-structural`, `egm-style`
* **Affected Scope:** `Lines 208-219`, `357-367`
* **Rationale & Recommendation**: Replace the placeholder `specs/<spec>.md` with `specs/roadmap-and-page-contract.md`. Explain the arrow at line 218. Align the `pageUtils.js` line that wraps in the "after" column.

### 25. Placement of the NFR section and line wrapping - Severity: Nit
* **Reviewer Lens:** `egm-structural`
* **Affected Scope:** `Lines 480-497`, `47`
* **Rationale & Recommendation**: Move the NFRs next to Goals, or merge them into Risks (Major 7). Re-wrap line 47.

### 26. Claims stated more strongly than the evidence supports - Severity: Nit
* **Reviewer Lens:** `egm-style`
* **Affected Scope:** `Lines 51-52`, `59-63`
* **Rationale & Recommendation**: "This is how the four copies came about" is stated without evidence. "Before anyone looks" ignores the hand checks mentioned at line 60. Soften both, or cite evidence.

### 27. Repeated content - Severity: Nit
* **Reviewer Lens:** `egm-style`
* **Affected Scope:** `Lines 27-30` / `221-223`; `168` / `464` / `488`
* **Rationale & Recommendation**: State "`AGENTS.md` wins" once. The repeated 182 kB figure goes away with Major 2.

### 28. "chart range helpers" is not named - Severity: Nit
* **Reviewer Lens:** `egm-style`
* **Affected Scope:** `Line 103`
* **Rationale & Recommendation**: Name them, presumably `extent` and `robustExtent`.

### 29. Wording at line 163 does not match U4 - Severity: Nit
* **Reviewer Lens:** `egm-style`
* **Affected Scope:** `Line 163`
* **Rationale & Recommendation**: Replace "a way back to the index" with "satisfies U4".

### 30. Vague phrases - Severity: Nit
* **Reviewer Lens:** `egm-style`
* **Affected Scope:** `Lines 341` ("Pages are small"), `345` ("Consistent typesetting"), `425` ("for real reasons"), `433-434` (unnamed README drift)
* **Rationale & Recommendation**: Name the concrete fact in each case or drop the phrase.

### 31. Bundle-size figures are not backed by a measurement - Severity: Nit
* **Reviewer Lens:** `egm-design`
* **Affected Scope:** `Lines 345-347` (KaTeX 263/79 kB); math.js figures see Major 2
* **Rationale & Recommendation**: Cite the `npm run build` output the figures come from. Make the size check something that can be run, for example inspecting the import graph of the `dist/assets` chunks.

### 32. The static check scope for U9 is narrow - Severity: Nit
* **Reviewer Lens:** `egm-design` (part of Nit 15)
* **Affected Scope:** `Lines 389-390`
* **Rationale & Recommendation**: U9 is checked statically only for `http(s)` script and stylesheet URLs. Say whether `fetch`, `<img>` and `@import url(http…)` are covered, or leave them to step 7.

### 33. Index exclusion in "every top-level page" - Severity: Nit
* **Reviewer Lens:** `egm-design`
* **Affected Scope:** `Lines 104-105`, `387-391`
* **Rationale & Recommendation**: State that `index.html` is excluded from U2-U4 and P1-P4, and that `surface.html` is excluded from P1-P4 by the explicit list.

### 34. Commit references point outside the reviewed range - Severity: Nit
* **Reviewer Lens:** `egm-structural`, `egm-style`
* **Affected Scope:** `Lines 491-492`
* **Rationale & Recommendation**: "Commit 2" and "see Verification Plan" are defined only after line 499. Describe the change itself in the text. This overlaps with Majors 2 and 4.
