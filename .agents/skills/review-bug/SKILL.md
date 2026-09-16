---
name: review-bug
description: 'Bug report review with two modes. Interactive mode (default): asks batched clarifying questions to resolve missing reproduction detail, wrong severity/priority, and linkage gaps — use when a bug report needs tightening before anyone fixes it. Validate mode (--validate flag or "is this bug ready to fix?"): automated non-interactive GO/NO-GO gate with a 1–10 fix-readiness score — use for pre-fix gates, batch triage, or CI. Checks template/frontmatter compliance, reproducibility-from-the-report, severity/priority correctness, and mode/linkage correctness; runs two read-only pre-pass scans — a duplicate scan (sibling bugs + bug-registry) and an already-fixed/stale scan of the root-cause area. Handles all three bug modes (story / task / general). Bug-side sibling of review-story / review-task; slots into develop-bug as Step 2. Invoke with `/review-bug [bug-file-path]` or "review this bug report".'
invokes: [create-branch]
---

> **Status lifecycle**: see [`references/document-status-lifecycle.md`](references/document-status-lifecycle.md). Note: review-bug reports on fix-readiness but **never mutates the bug lifecycle `status`** (`new → in-progress → …`) — a ready bug stays `new`; `develop-bug` Step 3 is what moves it to `in-progress`.

# Review Bug

## When to Use This Skill

Use this skill to check whether a **bug report is ready to be fixed** — before a developer (or `develop-bug`) starts work. It answers: is the bug complete, reproducible *from the report*, correctly classified, not a duplicate, and not already fixed?

Natural language triggers: "review bug 7", "is this bug ready to fix?", "check this bug report", "triage bug.7.stale-token", "score this bug's readiness", "batch-triage the open bugs".

**Do NOT use this skill to fix the bug** — that is `develop-bug` / `qa-fix`. review-bug is read-only about the code; it only edits the *bug report* (to fill missing detail), never the codebase.

## Two Modes

### Interactive Mode (default)

Asks batched clarifying questions (via `AskUserQuestion`) to resolve gaps — vague reproduction steps, missing environment, wrong severity, absent parent linkage. Produces user-validated recommendations and (optionally) applies them to the bug report.

### Validate Mode (`--validate`)

Non-interactive GO/NO-GO gate with a 1–10 fix-readiness score. Use when you need an automated decision (pre-fix gate, batch triage, CI). Invoke with `--validate` or natural-language intent ("is this bug ready to fix?", "score this bug", "batch validate").

**Two validate sub-modes**, selected by an `APPLY` flag:
- **Standalone validate** (`APPLY=false`, default for `--validate`): read-only. Emits the verdict + score; writes no files, edits nothing.
- **Validate-and-apply** (`APPLY=true`): set by `develop-bug` Step 2. Still asks no questions, but *does* edit the bug report to add missing detail (critical + important), and writes a `.review.{n}.*.md` report. Never mutates the bug lifecycle `status`.

## Mode & Input Resolution (Step 0)

1. **Detect mode**: `--validate` flag or validate intent → `MODE=validate` (default `APPLY=false`; `APPLY=true` only when the caller — `develop-bug` — sets it). Otherwise `MODE=interactive`.
2. **Resolve the bug file** across the three modes (reuse the resolver pattern from develop-bug):

   | Mode | Pattern | Location |
   |------|---------|----------|
   | story | `story.{epic}.{story}.bug.{n}.{name}.md` | co-located with the story |
   | task | `task.{id}.bug.{n}.{name}.md` | `docs/tasks/task.{id}.{name}/` |
   | general | `bug.{N}.{name}.md` | `docs/bugs/bug.{N}.{name}/` |

   Accept a bug file path, a bug directory, or a bare bug id. A linked tracker issue (`github_issue`/`jira_key`) may also resolve to the local bug file via frontmatter grep. Exclude `.implementation.` / `.review.` files. Set `BUG_FILE`, `BUG_DIR`, `BUG_PREFIX` (filename stem), `MODE_KIND` (story|task|general). **HALT** if unresolved.

3. **Output format** (interactive only): ask "Comprehensive report file, or action plan only?" — store for Step 6. In validate mode, skip (verdict is the output; validate-and-apply always writes a report).

## Step 0a: Branch Setup

Execute `references/review-pipeline-step-0a-branch-setup.md` with the **review-bug** variant and `SKILL_NAME=review-bug`. In validate mode this short-circuits (the branch is owned by the develop-bug pipeline, or the review is read-only). In interactive mode it cuts/reuses a bug feature branch from `develop` so any bug-report edits (Step 6.5) don't land on `develop`/`main`.

## Step 1: Load Context

Read `BUG_FILE` (frontmatter + body). Load the structure oracle `create-bug-report/assets/bug-report-template.md`. Source the platform resolver once, guarded: `source references/resolve-platform.sh || exit 1` (sets `TRACKER`/`VCS`/`ACCESS_TRACKER`/`ACCESS_VCS`; see [`references/platform-detection.md`](references/platform-detection.md)). The `|| exit 1` is required — the resolver rejects an unrecognised `tracker:`, `vcs:` or `access:` value by returning non-zero, and sourcing it bare would print the error and carry on with a default. Note `github_issue`/`jira_key` if present (usually absent — `TRACKER_ISSUE` empty).

## Phase 1.5: Pre-pass (2 Parallel Explore Subagents)

Front-load the two highest-value checks before Q&A. Dispatch **both agents in a single message** (parallel). Prompts: [`references/review-bug-prepass-prompts.md`](references/review-bug-prepass-prompts.md).

- **Agent A — Duplicate scan** (`Explore`): search sibling bug files (same story/task dir, or `docs/bugs/`) and `docs/bugs/bug-registry.md` for a duplicate/near-duplicate. Returns `duplicate: none | suspected {id} (reason)`.
- **Agent B — Already-fixed / stale scan** (`Explore`): read-only scan of the root-cause area (from the bug's Evidence / Related Files / reproduction) to judge whether the described defect still exists in current code. Returns `reproduces: likely | unlikely | unknown` with `found_at` evidence.

Store as `PREPASS_DUP`, `PREPASS_STALE`. If an agent fails, log a warning and treat that axis as `unknown` (rely on in-line review). Surface high-signal findings first: `duplicate: suspected` → early question (interactive) or **NO-GO: DUPLICATE** (validate); `reproduces: unlikely` → early question or **NO-GO: STALE**.

## Review Dimensions (Steps 2–5)

Collect issues as **Critical / Important / Optional**. In interactive mode, batch questions at the two QUESTION POINTs; in validate mode, do not ask — record findings toward the score.

### Step 2: Template & Frontmatter Compliance

- **Required body sections** present (per the template): Bug Description (Summary, Expected, Actual, Impact); Reproduction Steps; Evidence; the mode-correct violation heading (**Acceptance Criteria Violation** story / **Success Criteria Violation** task / **Scope & Impact** general); Developer Fix Cycle (stub OK); Status History; Resolution Summary (stub OK). Missing core section → **Critical**.
- **Frontmatter**: `type: bug` present → **Critical** if missing (OKF's one hard requirement; also flag a legacy bold-line header with no YAML block). `status` ∈ bug lifecycle; `severity` ∈ {Blocker, Major, Minor, Trivial}; `priority` ∈ {Critical, High, Medium, Low}; `created`, `related`, `description` present → **Important** if missing/malformed.
- **Identity consistency**: filename ↔ body `Bug ID` ↔ `MODE_KIND` agree; general bug's directory stem matches the filename stem. Mismatch → **Important**.

### Step 3: Reproducibility Clarity (the core gate)

This is the bug-review analog of review-task's anti-hallucination pass — the single most important axis.

- **Reproduction Steps**: numbered, concrete, self-contained; each step is an action a developer can take. Vague/narrative-only steps → **Critical** (a bug you cannot reproduce from the report cannot be reliably fixed).
- **Environment** specified (OS/browser/device/version/test env) → **Important** if absent for a Major+ bug.
- **Expected vs Actual** both explicit and specific → **Critical** if one is missing/ambiguous.
- **Frequency** + **Reproducible** fields set → **Important** if absent.
- **Evidence** (logs, stack traces, screenshots, failing command output) present → **Important** for Major+, **Optional** for Minor/Trivial. Evidence is what makes Step-3 root-cause localisation in develop-bug tractable.

Incorporate `PREPASS_STALE`: if `reproduces: unlikely` and a concrete `found_at` shows the code path already handles the case, flag **Critical (likely already fixed)**.

### QUESTION POINT 1 (interactive): Reproducibility & Duplicate

Batch 1–4 questions covering: unclear reproduction steps, missing expected/actual, and (if `PREPASS_DUP` is `suspected`) "Is this a duplicate of {id}?". Continue with the answers incorporated.

### Step 4: Severity / Priority Correctness

Cross-check the assigned `severity`/`priority` against the described Impact using the `create-bug-report` severity/priority guidelines (Blocker/Major/Minor/Trivial; Critical/High/Medium/Low). Flag mismatches → **Important** (e.g. `severity: Blocker` on a cosmetic issue, or `priority: Low` on a data-loss bug). Propose the corrected values.

### Step 5: Mode & Linkage Correctness

- **story bug**: parent story exists; `related` links it; the story's `## Bug Reports` section references this bug. Broken/missing back-link → **Important**.
- **task bug**: parent task exists and references the bug in its Bug Reports list.
- **general bug**: a `docs/bugs/bug-registry.md` row exists for `{N}` with a status consistent with the bug's frontmatter. Missing registry row → **Important**.

### QUESTION POINT 2 (interactive): Classification & Linkage

Batch remaining questions (severity/priority correction, linkage fixes, and — if `PREPASS_STALE` is `unlikely` — "This may already be fixed at {found_at}. Close instead of fixing?"). Incorporate answers.

## Step 6: Generate Output

Compute the **fix-readiness score (1–10)** and **recommendation**:

| Recommendation | When |
|----------------|------|
| ✅ **READY TO FIX** | Score ≥ 8, no Critical issues, `duplicate: none`, `reproduces: likely|unknown` |
| ⚠️ **NEEDS DETAIL** | Score 4–7, or any Critical reproducibility/completeness gap (fixable by adding detail) |
| 🚨 **DUPLICATE** | `PREPASS_DUP` = suspected and confirmed — recommend cancelling in favour of {id} |
| 🚨 **STALE (already fixed)** | `PREPASS_STALE` = unlikely with concrete evidence — recommend closing the bug, not fixing |

Score breakdown: Completeness /10, Reproducibility /10, Classification /10, Linkage /10 (report the average, rounded).

**Interactive — Comprehensive report**: write `{BUG_DIR}/{BUG_PREFIX}.review.{N}.{descriptive-name}.md` (N starts at 1, increments on re-review) with: Executive Summary (score, recommendation, issue counts), User Decisions, per-dimension findings (Critical/Important/Optional + recommendations), Pre-pass results (duplicate + stale), and Next Steps. Display a summary + the file path.

**Interactive — Action plan only**: display a prioritized Critical/Important/Optional list; save no file.

**Validate mode**: emit a compact verdict block:
```
Bug: {BUG_PREFIX} ({MODE_KIND})
Fix-readiness: {score}/10 — {RECOMMENDATION}
Critical: {c}  Important: {i}  Optional: {o}
Duplicate: {none|suspected id}   Reproduces: {likely|unlikely|unknown}
Top blockers: {1-3 lines, or "none"}
```
`APPLY=false` → stop here (read-only). `APPLY=true` → continue to Step 6.5, then write a `.review.{N}.*.md` report.

## Step 6.5: Offer to Apply Fixes (to the bug report only)

**Interactive**: ask "Apply the recommended fixes to the bug report now?" (all critical+important / critical only / no). **Validate-and-apply** (`APPLY=true`): auto-apply all critical + important, no prompt.

When applying, use `Edit` on `BUG_FILE` to: tighten reproduction steps, fill environment/expected/actual, add missing frequency/reproducible fields, correct severity/priority, and repair parent linkage / registry rows. After each: `✅ Fixed: {issue}`. If a fix needs information you don't have: `⏭ Skipped: {issue} — needs your input`.

**When you correct severity or priority**, append a row to the bug's `## Status History` table recording it, and bump frontmatter `updated` in the same edit. Severity and priority decide who gets paged, so a silent correction is the one edit here that most needs a trace.

| 2026-08-12 | New | review-bug | Severity Medium → High; priority P3 → P1 — affects checkout |

Leave the `Status` cell at the bug's **current** lifecycle status — this step never transitions a bug, and the row records a field correction, not a transition.

> **Bugs use `## Status History`, not a Change Log.** The columns differ (`Date`, `Status`, `Changed By`, `Notes`), the section already exists in `create-bug-report/assets/bug-report-template.md`, and it is the richer table because it carries the `Status` column a bug's history is actually about. [`document-change-log.md`](references/document-change-log.md) excludes bug reports for exactly this reason — do not add a second table.

**Never**: change the bug lifecycle `status`, edit the codebase, or fabricate reproduction detail that isn't derivable from the report/evidence. If reproducibility cannot be established even after edits, the recommendation stays **NEEDS DETAIL** (or STALE) — do not upgrade it to READY.

## Step 7: Tracker Comment (graceful — non-blocking)

Only if the bug has `github_issue`/`jira_key` in frontmatter (skip silently otherwise — most bugs have none). Post a short review-outcome comment (recommendation, score, issue counts, review-file path) — one call, both trackers:

```bash
mkdir -p .claude/state
cat > .claude/state/comment-body.md <<EOF
## Bug Review Complete

**Recommendation**: ${RECOMMENDATION}
**Fix-readiness**: ${SCORE}/10
**Issues**: Critical ${CRITICAL} · Important ${IMPORTANT} · Optional ${OPTIONAL}
**Review artifact**: \`${REVIEW_FILE}\`
EOF

node .agents/skills/review-bug/references/tracker-comment.js \
  --issue "${TRACKER_ISSUE}" --body-file .claude/state/comment-body.md \
  --stage review-bug \
  --slot outcome="{plain-language outcome — see below}" \
  --slot blocking="${CRITICAL}" \
  --json
```

> **`review-bug` reads `outcome` and `blocking`.** `outcome` is a **text** slot interpolated verbatim,
> so do **not** pass `${RECOMMENDATION}` raw — `GO` / `NO-GO` are internal vocabulary, and
> [`references/stakeholder-summary.md`](references/stakeholder-summary.md) requires internal tokens to
> be mapped rather than passed through. Map at the call site: GO → `ready to fix`, NEEDS DETAIL →
> `needs more detail`, NO-GO → `not ready to fix`. `blocking` is a **boolean** slot whose two
> renderings are opposites; `${CRITICAL}` is safe because the engine reads `"0"` as *absent*, which
> renders "Nothing is blocking a fix from starting" — the right sentence for a clean review.
>
> The fix-readiness score stays in the body: a number on an unexplained scale is what the standard
> forbids in a lead.

Read `reason` per [`references/tracker-comment-contract.md`](references/tracker-comment-contract.md). Failure logs a warning and does not halt.

> Engine source: `references/tracker-comment.js` (bundled into each skill as `references/tracker-comment.js`). Contract: `references/tracker-comment-contract.md`.


## Pipeline Integration (develop-bug Step 2)

`develop-bug` invokes `/review-bug` in **validate-and-apply** mode (`MODE=validate`, `APPLY=true`) with the bug file. It auto-answers output-format=report and applies critical+important fixes, then gates on the recommendation:

- **READY TO FIX** → develop-bug proceeds to Step 3 (reproduce + fix).
- **NEEDS DETAIL** (still, after applying fixes) → **HALT** — the report lacks reproducibility detail only a human can supply.
- **DUPLICATE** → **HALT** — surface the duplicate; do not fix.
- **STALE (already fixed)** → **HALT** — recommend closing the bug; do not fabricate a fix.

This mirrors how `develop-task` Step 2 (`review-task`) HALTs on NEEDS REVISION / REQUIRES REWORK.

## Related Skills

- `/create-bug-report` — files the bug (upstream)
- `/develop-bug` — end-to-end fix orchestrator; invokes this skill as Step 2
- `/review-story`, `/review-task` — sibling reviews for stories and tasks
- `/qa-fix` — fixes bugs from QA feedback
