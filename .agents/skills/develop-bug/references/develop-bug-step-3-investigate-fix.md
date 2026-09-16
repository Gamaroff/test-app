---
name: develop-bug-step-3-investigate-fix
description: Step 3 (investigate & fix) for the develop-bug pipeline. Implements the fix plus a regression test that fails without the fix, writes the Fix Implementation record into the bug's Developer Fix Cycle, sets bug status ready-for-qa, and reuses the shared develop-loop's bounded-iteration + test-failure-triage mechanics.
---

# Develop Bug Pipeline — Step 3: Investigate & Fix

Loaded by `/develop-bug` during Step 3. This is the bug-specific develop step. It reuses the **bounded develop loop, stall detection, and test-failure triage** from [`references/develop-pipeline-step-3-develop-loop.md`](develop-pipeline-step-3-develop-loop.md); this document adds the bug-specific reproduce + fix + fix-record behaviour on top.

Step 2 (`/review-bug`) already confirmed the report is fix-ready (complete, not a duplicate, not already fixed). Step 3 now *executes*: reproduce, localise, fix, and record.

---

## Reproduce & open the Developer Fix Cycle (do this first)

1. **Move the bug into the fix cycle**: set bug status `new → in-progress` (frontmatter `status: in-progress`; body `**Status:** 🔄 In Progress`). If the bug arrived `reopened`, keep it and open the next iteration instead of Iteration 1.
2. **Reproduce the failure** using the most deterministic available signal (in order): a **failing automated test** that encodes the bug (preferred — it becomes the regression test below); a **reproducing command** (capture stdout/stderr/exit); or, when neither is possible (env-specific/timing/external), a **precise code-path trace**. Record the reproduction evidence.
3. **Localise the root cause** via a read-only Explore subagent (breadth: medium; "very thorough" for `Blocker`/`Critical`): start from the bug's Related Files / Evidence and the reproduction signal, trace to the function/line where Expected and Actual diverge, and return candidate root-cause file:line + the module's conventions (error handling, DI, naming). Persist the summary per [`references/subagent-summary-artifact.md`](subagent-summary-artifact.md); consume only the summary.
4. Fill the **Investigation** subsection of the current `### Iteration {N}` under `## Developer Fix Cycle`:

```markdown
#### Investigation (New → In Progress)

**Date**: {YYYY-MM-DD}

**Reproduction**: {test/command/trace used, and the observed failure}

**Root Cause Analysis**: {why the bug occurs — from the Explore summary, file:line}

**Proposed Fix**: {one-line plan — implemented below}
```

Add a Status History row: `| {date} | In Progress | develop-bug | Reproduced; investigation started |`.

**If the bug proves not reproducible here** (despite review-bug passing Step 2): log in the Issues Log, commit the report (`/commit-changes`), snapshot+remove the lock, and **HALT** — do not fabricate a fix. Surface the reproduction attempt and ask the user to add detail or confirm the bug is stale.

---

## Fix, test-first

With the root cause localised, now:

1. **Regression test first.** Add (or finalise) a test that **fails on the current code and passes after the fix** — it encodes the bug scenario so it can never silently return. If Step 2 already wrote a failing test, promote it here. If no automated test is feasible, document why in the Fix Implementation "Testing" line and add the strongest available check (assertion, type guard, integration probe).
2. **Implement the minimal, targeted fix** at the root cause — not the symptom. Follow the module conventions surfaced by the Step 2 Explore (error handling, DI boundaries, platform separation, test co-location). Keep changes minimal; do not refactor unrelated code.
3. **Pattern before change.** Before editing each file, spend one `Read()` to confirm the existing pattern in that file — do not assume from memory. After each edit, summarise the change in 2–3 lines and release the file content from active context.

### Bounded loop + validation

Run the project's lint + tests after the change (the exact commands come from the codebase; e.g. `npx nx lint <project> && npx nx test <project>` or `deno lint && deno test -A`). Iterate until zero lint errors and all tests pass, including the new regression test.

Apply the shared develop-loop's **stall detection** and **test-failure triage** verbatim: on a failing run, capture output to `.claude/state/test-output-${ITER}-*.log`, dispatch an Explore subagent with [`references/test-failure-triage-prompt.md`](test-failure-triage-prompt.md), and consume only its summary. Honour the shared loop's iteration bound; on HALT, follow the shared halt protocol (commit report, snapshot+remove lock, surface to user).

---

## Write the Fix Implementation record (bug file)

Update the **bug file** (authorised sections only). In the current `### Iteration {N}` under `## Developer Fix Cycle`, complete the **Fix Implementation** subsection:

```markdown
#### Fix Implementation (In Progress → Ready for QA)

**Date**: {YYYY-MM-DD}

**Root Cause**: {summary from Investigation}

**Fix Description**:
- {what changed and why — behaviour-level, not just line-level}

**Files Modified**:
- `{path}` — {what changed}
- `{path.spec}` — added regression test: {test name}

**Testing**:
- Regression test `{name}` fails on the pre-fix code, passes after the fix
- {lint/test suite result; edge cases exercised}

**Verification Steps for QA**:
1. {how QA re-confirms the bug is gone}
```

Then:

- Set bug status `in-progress → ready-for-qa` (frontmatter `status: ready-for-qa`; body `**Status:** ✅ Ready for QA`).
- Add a Status History row: `| {date} | Ready for QA | develop-bug | Fix implemented + regression test |`.

The section shapes above are intentionally identical to those `qa-fix` writes (see `qa-fix` "Bug Report Workflow Support"), so a bug touched by either skill reads consistently.

---

## Wrap up

- Record in the implementation report Decisions Log: the fix summary (≤5 bullets), files touched, and the regression test name.
- Do NOT create the PR here — Step 4 does. Do NOT mark the bug `closed` here — only Step 7 closes after verification.
- Update Pipeline Progress: ✅ investigate-fix. Proceed to Step 4.
