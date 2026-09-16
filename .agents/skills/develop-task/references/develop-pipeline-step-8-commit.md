---
name: develop-pipeline-step-8-commit
description: Step 8 (commit-changes + lock removal) shared by develop-story and develop-task. Covers final implementation report update (Finished timestamp, Final Status, QA Iterations, Completion Summary), /commit-changes invocation, final push, Pipeline Progress update, and pipeline lock file removal. Near-identical for both orchestrators — one variant noted for Completion Summary wording.
---
<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/develop-pipeline-step-8-commit.md. Regenerate via `npm run bundle`. -->

# Develop Pipeline — Step 8: Commit Changes

## When This Document Applies

Loaded by `/develop-story` and `/develop-task` during Step 8. Content is nearly identical for both orchestrators. The one variant (Completion Summary wording) is noted below.

---

## Final Implementation Report Update

Before invoking `/commit-changes`, update the implementation report one final time:

- Set **Finished** timestamp
- Set **Final Status** to `Completed`
- Fill in **QA Iterations** count
- Ensure the Pipeline Progress table shows ✅ for all steps
- Write a **Completion Summary** paragraph:
  - develop-story: what was **built**, QA iterations taken, notable decisions
  - develop-task: what was **implemented**, QA iterations taken, notable decisions

---

## Invoke /commit-changes

Then invoke the `/commit-changes` skill with `--scope {work-item-dir}`. This stages tracked modifications across the whole tree (`git add -u`) plus any remaining new artifacts inside the work-item dir (including the finalised implementation report), without sweeping unrelated untracked paths:

> **What this commit carries changed with task.115.** The acceptance artefacts — the document with
> `status: accepted`, the DoD summary, `sprint-review-summary.md` and (tasks) the ticked registry —
> are committed and pushed by `/finalise` itself at its Step 7 action 6a, *before* any PR or tracker
> side-effect, so that CI can be read on the head that carries the acceptance. This Step 8 commit is
> therefore the **implementation report and nothing else new** — with one expected residue: on a Jira
> project the document carries a frontmatter-only `jira_last_*` rewrite from Step 7 action 8's
> Document-link re-point, which runs after the 6a commit by design and rides here. If `git status`
> shows a `*.dod.*` file, the sprint review, or any change to the document beyond those three keys,
> `/finalise` did not cross its publish boundary — that is a Step 7 defect to surface (the step-7 doc's
> "publish boundary" section has the mechanical check), not something for this sweep to absorb
> silently. Note also that this
> commit is docs-only and lands *after* the second CI reading; that residue is deliberate (recording
> a verification inside the commit it verifies needs a third commit) and `develop-next` Step 3
> re-verifies the final head before merging.

```
/commit-changes --scope {work-item-dir}
```

The implementation report and all other work-item artifacts must be staged and included in this commit.

After `/commit-changes` completes, run `git log --oneline -1` to capture the final commit hash. Update the Pipeline Progress Notes for Step 8: `Committed in \`{hash}\`` (and note the PR reference if applicable, e.g. `Committed in \`{hash}\`, merged via PR #{N}`).

---

## Final Push

Push the final commit so the PR reflects the completed implementation report and DoD summary:
```bash
git push origin HEAD
```

Update Pipeline Progress: ✅ commit-changes.

---

## Cleanup Transient State

Pipeline finished cleanly — no further pause possible. Remove the lock file and any leftover test-output logs from this run:

```bash
# Remove transient test-output logs from Step 3 develop loop iterations.
# Successful iterations remove their own log on TEST_EXIT==0; this catches
# logs left behind by failed iterations that later recovered, plus any
# logs from prior aborted runs that never reached cleanup.
rm -f .claude/state/test-output-*.log

# Remove the pipeline lock — must be last so a crash mid-cleanup still leaves
# the lock available for resume.
rm -f .claude/state/develop-pipeline.lock
```

---

## Step 8 Completion Checklist (BLOCKING — verify before emitting the Phase 2 Completion banner)

Run these post-condition checks. **If any fails, do NOT emit "Story/Task Development Complete" — fix the gap and re-check.**

```bash
# 1. Lock file removed
[ ! -f .claude/state/develop-pipeline.lock ] || { echo "❌ Step 8 incomplete: lock file still present"; exit 1; }

# 2. Test-output logs cleaned
ls .claude/state/test-output-*.log 2>/dev/null | grep -q . && { echo "❌ Step 8 incomplete: test-output logs remain"; exit 1; } || true

# 3. Implementation report finalised — Final Status must be 'Completed' or 'Accepted', Finished must NOT be '—'
REPORT="${IMPLEMENTATION_REPORT:?must be set from lock or context}"
grep -qE "^\*\*Final Status:\*\* (Completed|Accepted)" "$REPORT" || { echo "❌ Step 8 incomplete: Final Status not set to Completed/Accepted in $REPORT"; exit 1; }
grep -qE "^\*\*Finished:\*\* [0-9]" "$REPORT" || { echo "❌ Step 8 incomplete: Finished timestamp missing in $REPORT"; exit 1; }

# 4. Pipeline Progress table has no ⏳ Pending rows
grep -q "⏳ Pending" "$REPORT" && { echo "❌ Step 8 incomplete: Pipeline Progress still has ⏳ Pending rows"; exit 1; } || true

# 5. The work actually exists on the remote — commits present, tree clean,
#    local HEAD == remote HEAD, and (when a PR is open) PR head == local HEAD.
#    Run it UNPIPED and read its own exit status; see the note below.
bash .agents/skills/{skill}/references/verify-push-state.sh --base "${BASE_BRANCH:?}" ${PR_NUMBER:+--pr "$PR_NUMBER"}
VERIFY_EXIT=$?
[ "$VERIFY_EXIT" -eq 0 ] || { echo "❌ Step 8 incomplete: verify-push-state failed (exit $VERIFY_EXIT)"; exit 1; }

echo "✅ Step 8 post-conditions verified"
```

Checks 1–4 address regressions #3 and #4 from the live-github-test (impl report stuck at "In Progress / Finished: —", lock file not removed). Treat the bash assertions as binding — emit the Phase 2 Completion banner only after all five pass.

---

## Why check 5 exists, and why it is mechanical rather than an instruction

On 2026-08-13 a pipeline reported a "PR-ready branch pushed" and, separately, that a trunk fix had been "isolated in its own commit so the orchestrator can drop it at rebase". **Neither was true.** The branch ref existed on the remote but pointed at the base tip — **0 commits** — and every file was still an uncommitted working-tree modification. The orchestrator relayed that claim to two sibling pipelines and planned a merge around it.

The develop-batch merge gate's head-SHA check would have refused the merge, so nothing broken could ship. But that check runs at **merge** time, and the false claim was acted on well before it. That gap is the cost, and it is why this assertion belongs at **report** time.

**Do not "fix" this class of problem by strengthening the prose.** The prompt already said to report the PR; adding "and be accurate" changes nothing, because the failure is not disobedience — it is reporting an intention as an accomplishment without looking. Only a mechanical check whose output is pasted into the report closes it.

**Paste the script's output verbatim into the final report.** A summary of a verification is not a verification.

⚠️ **Read the script's own exit status — never a pipeline's.** The same session produced *three* separate false passes from exactly that mistake: `npm test 2>&1 | tail -80` reported `tail`'s exit 0 over a suite that had failed, and twice more from wrapper scripts whose status came from a trailing `grep`/`echo`. If the output is large, redirect to a file and read the file:

```bash
bash .../verify-push-state.sh --base "$BASE_BRANCH" > /tmp/verify.log 2>&1; VERIFY_EXIT=$?
```

`{skill}` above is the pipeline's own skill directory (`develop-story`, `develop-task` or `develop-bug`) — each vendors its own copy of the script under `references/`.
