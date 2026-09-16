# `develop-bug` — Bug-Fix Lifecycle Orchestrator

Reference for the `develop-bug` 8-step pipeline. Reflects `skills/develop-bug/SKILL.md` plus the bug-specific `develop-bug-step-*.md` protocol files and the shared `develop-pipeline-*` infrastructure it reuses.

## Technical Summary

`develop-bug` is a thin **orchestrator** that takes an existing bug report file from open to **closed, verified, and documented**. It is the bug-anchored sibling of `develop-story` / `develop-task`. The **bug report file** is both the primary input and a primary audit surface: the pipeline writes the full fix record (Investigation → Fix Implementation → QA Verification → Resolution Summary) back into it, in the sections `create-bug-report`'s template already provides as stubs.

It fills a real gap: `create-bug-report` only *creates* the file; `qa-fix` writes an interim fix record but is PR-gated and stops at `ready-for-qa`. Neither closes the bug or writes the `## Resolution Summary`. `develop-bug` runs the whole lifecycle.

### The 8 steps

| Step | Name | Sub-skill / engine | Bug-specific behaviour |
|------|------|--------------------|------------------------|
| 0 | Resolve & Prepare | — | Resolve bug file across story/task/general modes; read severity/priority/repro; lite detection; branch-model prompt (bugfix vs hotfix) |
| 1 | Create Branch | `/create-branch` | Bugfix off `develop` (default) or `--hotfix` off `main` |
| 2 | Review Bug | `/review-bug` (validate-and-apply) | Fix-readiness gate: completeness, reproducibility-from-report, classification, duplicate + already-fixed scans. **HALT on DUPLICATE / STALE / NEEDS DETAIL** |
| 3 | Investigate & Fix | Explore + Edit + tests | Reproduce; localise root cause; regression test that fails-without/passes-with the fix; write Investigation + Fix Implementation; status `new → in-progress → ready-for-qa` |
| 4 | Create PR | `/create-pr` | `--base develop` (bugfix) or `main` (hotfix); `--issue` only if the bug has a tracker issue |
| 5–6 | Verify & Fix Loop | regression test + `/review-code` + `/qa-fix` | Verify bug is gone + no regressions; on FAIL reopen + `/qa-fix`; bounded `MAX_ITER=5` |
| 7 | Finalise & Close | `/finalise` + close routine | Write `## Resolution Summary`; status → `closed`; update parent Bug Reports / bug-registry |
| 8 | Commit Changes | `/commit-changes` | `--scope {bug-directory}`; lock removal |

### Reused shared infrastructure (skill-agnostic)

- **Hooks** — `PreCompact` (graceful pause) + `Stop` (forced continuation), keyed off the pipeline lock's `skill` field. Installing once via `scripts/install-hooks.sh` covers develop-story/task/bug.
- **Lock file** `.claude/state/develop-pipeline.lock` (`skill: develop-bug`) + `advance-pipeline-lock.sh`.
- **Resume** — stale-context detector subagent + per-step artifact verification (`develop-pipeline-resume-contract.md`).
- **Loop mechanics** — Step 3 reuses the shared develop-loop's bounded iteration + test-failure triage; Steps 1/4/8 reuse the shared step docs' generic mechanics (stash/restore, scope staging, leak guard, cleanup) with bug substitutions noted in `SKILL.md`.
- **Autonomous defaults, subagent-summary artifacts, platform detection** — shared verbatim.

### Compared to `develop-task`

- **Step 2 is a real review, like the siblings.** `develop-task` Step 2 is `/review-task`; `develop-bug` Step 2 is `/review-bug` (validate-and-apply) — a fix-readiness gate that HALTs on a duplicate, already-fixed, or under-specified bug. The actual reproduce folds into Step 3.
- **No AC/success-criteria gate.** A general bug has no parent document, so verification (Step 5) is anchored on the regression test + affected suite + `/review-code` on the diff, not a story/task gate file.
- **Bug lifecycle, not document lifecycle.** The bug's frontmatter `status` (`new → in-progress → ready-for-qa → closed | reopened`) is driven by the pipeline and is distinct from the `draft → … → accepted` document lifecycle.
- **Closing artifact.** Step 7 writes `## Resolution Summary` — the thing no other skill writes.
- **Two branch models.** Phase 0d prompts bugfix (off `develop`) vs production hotfix (off `main`, merge-back to `develop`, version tag).

## Invocation

```
/develop-bug docs/bugs/bug.7.stale-token/bug.7.stale-token.md
/develop-bug story.8.5.3.bug.1.cache-leak.md
/develop-bug            # resolves the bug from context if unambiguous
```

Or: "research and fix this bug end to end".
