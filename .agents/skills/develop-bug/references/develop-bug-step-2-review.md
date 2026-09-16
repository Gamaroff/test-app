---
name: develop-bug-step-2-review
description: Step 2 (review bug) for the develop-bug pipeline. Invokes /review-bug in validate-and-apply mode as the fix-readiness gate, then branches on its recommendation — proceed on READY TO FIX, HALT on NEEDS DETAIL / DUPLICATE / STALE. Bug analogue of develop-task Step 2 (review-task).
---

# Develop Bug Pipeline — Step 2: Review Bug

Loaded by `/develop-bug` during Step 2. This is the fix-readiness gate — the bug analogue of `develop-task` Step 2 (which invokes `/review-task`). It ensures the bug report is complete, reproducible-from-the-report, correctly classified, not a duplicate, and not already fixed **before** any fix work begins.

---

## Gate check (skip conditions)

Re-read the bug `status` (captured in Phase 0c) and check for an existing review report:

```bash
ls {bug-directory}/{bug-prefix}.review.*.md 2>/dev/null | sort | tail -1
```

- Bug `status` is `reopened` (a prior fix cycle already validated the report) **and** a review report exists → **skip**; log "review-bug skipped — bug already validated (status=reopened, report exists)" and proceed to Step 3.
- Otherwise → run the review.

---

## Invoke /review-bug (validate-and-apply)

Invoke the `/review-bug` skill with the bug file path in **validate-and-apply** mode:

- `MODE=validate`, `APPLY=true` — non-interactive; applies critical + important fixes to the *bug report* (tightens reproduction steps, fills environment/expected/actual, corrects severity/priority, repairs linkage) and writes a `{bug-prefix}.review.{N}.*.md` report. Asks no questions.
- review-bug's Step 0a branch setup short-circuits in validate mode (the branch was created in Step 1).
- review-bug **never** mutates the bug lifecycle `status` — the bug stays `new`; Step 3 moves it to `in-progress`.

Log: "review-bug invoked in validate-and-apply mode". After it returns, locate the review report:

```bash
ls {bug-directory}/{bug-prefix}.review.*.md 2>/dev/null | sort | tail -1
```

Record the path in the Decisions Log. If no report file was produced, log a warning in the Issues Log but read the verdict from review-bug's output.

---

## Branch on the recommendation

| review-bug recommendation | Action |
|---------------------------|--------|
| ✅ **READY TO FIX** | Log "Bug review passed — ready to fix". Proceed to Step 3. |
| ⚠️ **NEEDS DETAIL** | The report still lacks reproducibility detail after auto-applied fixes — only a human can supply it. Commit the report (`/commit-changes`, `docs({bug-prefix}): implementation report — review-bug NEEDS DETAIL halt`), snapshot+remove the lock, then **HALT**: surface the review report and its top blockers. |
| 🚨 **DUPLICATE** | Commit + snapshot + remove lock, then **HALT**: surface the suspected duplicate (`{id}`). Do not fix — recommend cancelling this bug in favour of the duplicate. |
| 🚨 **STALE (already fixed)** | Commit + snapshot + remove lock, then **HALT**: surface the `found_at` evidence. Do not fabricate a fix — recommend closing the bug via its Resolution Summary. |

Do NOT post a tracker comment on a halt — the commit + halt is sufficient (review-bug already posts its own outcome comment when the bug has a linked tracker issue).

On READY TO FIX, update Pipeline Progress: ✅ review-bug. Proceed to Step 3.
