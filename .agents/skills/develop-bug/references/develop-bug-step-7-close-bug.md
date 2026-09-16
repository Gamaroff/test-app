---
name: develop-bug-step-7-close-bug
description: Step 7 (finalise & close bug) for the develop-bug pipeline. Runs /finalise for DoD checks, then executes the bug-close routine — writes the Resolution Summary, sets bug status closed, adds the final Status History row, and updates parent linkage per mode (story parent Bug Reports, task parent Bug Reports, or the general bug-registry). This is the closing artifact no other skill writes.
---

# Develop Bug Pipeline — Step 7: Finalise & Close Bug

Loaded by `/develop-bug` during Step 7. Two parts: (A) the DoD finalise pass (via `/finalise`), then (B) the bug-close routine that writes `## Resolution Summary` and flips the bug to `closed`. **Part B is the gap this pipeline exists to fill** — `qa-fix` stops at `ready-for-qa` and never closes the bug.

Runs in full in **both lite and standard modes**.

---

## Part A — Finalise (DoD)

### DO NOT inline this step

Invoke the `/finalise` skill via the Skill tool against the **bug file**. Do NOT write a DoD file directly or set any accepted/closed status without running `/finalise` first. Finalise runs the DoD checks (fix present, regression test present, tests/lint green, no security regression) and produces the `{bug-prefix}.dod.{N}.*.md` summary.

After finalise returns, read its output:
- DoD satisfied → continue to Part B.
- DoD gaps found → log each gap in the Issues Log, commit the report via `/commit-changes` (`docs({bug-prefix}): implementation report — finalise gaps identified`), push, and **HALT**:
  ```
  ⚠️ Finalise identified Definition of Done gaps.
  Address the gaps in {report path} before re-running /develop-bug.
  ```

Note: `/finalise` targets story/task documents primarily; for a bug it validates the fix evidence. If `/finalise` cannot process the bug document type in your install, fall back to the equivalent inline DoD checklist (fix present ✓, regression test fails-without/passes-with ✓, suite + lint green ✓, no new security surface ✓), record it in the report, and continue — but prefer invoking the skill.

---

## Part B — Close the Bug

### B1. Write the Resolution Summary (bug file)

Fill the `## Resolution Summary` section (currently the "[Will be completed when bug is closed]" stub) in the **bug file**:

```markdown
## Resolution Summary

**Final Status**: Closed — Fixed
**Total Iterations**: {number of Developer Fix Cycle iterations}
**Time to Resolution**: {created date → today, e.g. "3 days"}
**Final Fix Details**: {1–3 sentences — the root cause and what the fix changed, behaviour-level}
**Lessons Learned**: {what would prevent this class of bug — a missing test, a guard, a pattern; or "none"}
```

### B2. Flip status to closed

- Frontmatter: `status: closed`
- Body header: `**Status:** ✅ Closed`
- Add the final Status History row: `| {date} | Closed | develop-bug | Fix verified and accepted |`

### B3. Update parent linkage (per mode)

Branch on the bug **mode** resolved in Phase 0a:

#### Story bug
In the **parent story file**'s `## Bug Reports` section, move this bug from *Open Bugs* / *In QA Verification* to **Closed Bugs**:
```markdown
### Closed Bugs

- [Bug {epic}.{story}.{n}: {desc}](./{bug-prefix}.md) - ✅ Closed - Priority: {priority} (Fixed {date})
```
If this was the parent story's **only** open bug and the story status is `Reopened`, restore it to its prior status (`Ready for Review`/`In Progress` as recorded before the bug was filed). If other open bugs remain, leave the story `Reopened`.

#### Task bug
In the **parent task file**'s Bug Reports list, mark this bug ✅ Closed:
```markdown
- [{bug-prefix}.md](./{bug-prefix}.md) - ✅ Closed - Priority: {priority} - Fixed {date}
```
Tasks do not use the `Reopened` status — no parent-status change needed.

#### General bug
Update the row for this bug in `docs/bugs/bug-registry.md` — set the `Status` column to `closed` and refresh **Last Updated**. Do **not** change the registry's Next Available Bug Number (numbers are never reused). The registry edit is committed atomically with the bug file in Step 8.

### B4. Tracker close (only if linked)

If the bug has `github_issue`/`jira_key` (`TRACKER_ISSUE` non-empty): post a completion comment and close/transition the issue, following the GitHub close / Jira Done-transition mechanics in [`references/develop-pipeline-step-7-finalise.md`](develop-pipeline-step-7-finalise.md) (Tracker Issue Update), substituting bug terminology.

Step 1 ensures the issue via `ensure-bug-{jira,github}-issue`, so a bug normally **has** one — an empty `TRACKER_ISSUE` here means that create failed or was deferred, not that bugs go untracked. Skip the close when it is empty, and say so in the report rather than silently: a deferred create leaves the card uncreated *and* unclosed, and the handover checklist is what carries both actions.

Then re-sync the bug document so the card's `Source Documents` links point at the durable integration branch rather than the feature branch that is about to be deleted:

```bash
# TRACKER=jira
node .agents/skills/sync-jira-bug/scripts/sync-jira-bug.js \
  --file "$BUG_FILE" --doc-branch "$BASE_BRANCH" --no-transition
```

**`--no-transition` is mandatory here.** The close above has already decided the card's status; without the flag the sync resolves the bug's `status: closed` through its own status map and can walk the card back out of the terminal status it was just put into, stranding its resolution. That is bug.11, and the same flag is the fix on the story and task paths.

---

## Step 7 Completion Checklist (verify before marking ✅)

- [ ] `/finalise` invoked (or documented inline DoD fallback) — DoD satisfied
- [ ] `{bug-prefix}.dod.{N}.*.md` present (or inline DoD checklist recorded in the report)
- [ ] Bug `## Resolution Summary` fully written (no stub text remains)
- [ ] Bug frontmatter `status: closed` AND body `**Status:** ✅ Closed`
- [ ] Final Status History row added
- [ ] Parent linkage updated per mode (story Bug Reports moved to Closed / task marked Closed / registry row `closed`)
- [ ] Tracker issue closed IF `TRACKER_ISSUE` set (else N/A — logged)
- [ ] Decisions Log records: Resolution Summary written, parent/registry updated, tracker close (or N/A)

Update Pipeline Progress: ✅ finalise-close. Record the DoD summary path in the report's Completion section. Proceed to Step 8.
