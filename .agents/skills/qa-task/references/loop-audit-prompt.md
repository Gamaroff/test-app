---
name: loop-audit-prompt
description: Shared Explore-subagent prompt for the develop-loop initial + per-iteration audit. Used by both develop-story and develop-task during Step 3. Returns a four-field JSON object summarising progress (completed/total checkboxes, status, last commit hash). Centralises the prompt that was previously duplicated inline in develop-pipeline-step-3-develop-loop.md and develop-pipeline-resume-contract.md.
---
<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/loop-audit-prompt.md. Regenerate via `npm run bundle`. -->

# Develop Loop — Audit Prompt (shared)

## When This Document Applies

Loaded by `/develop-story` and `/develop-task` Step 3 in two places:

1. **Initial audit** — once, before iteration 1, to establish `INITIAL_COMPLETED`, `M`, and `LAST_COMMIT_HASH`. See `develop-pipeline-resume-contract.md` §"Develop Loop — Stall Semantics and MAX_ITER Bound".
2. **Per-iteration audit** — after every `/develop` invocation returns, to drive the loop branch and stall guard. See `develop-pipeline-step-3-develop-loop.md` §"Iteration Audit".

The two callers used to embed slightly different inline prompts. This file is the single source of truth — both callers must reference it instead of duplicating prose.

---

## Inputs

| Variable | Source | Description |
|---|---|---|
| `<DOC_PATH>` | resolved in Phase 0a | absolute path to the story or task file |
| `<DOC_TYPE>` | derived | `"story"` or `"task"` |
| `<TASKS_SECTION>` | derived | `"## Tasks"` for stories, `"## Implementation Plan"` for tasks |

---

## Prompt Template (pass verbatim to Explore subagent)

```
Read the <DOC_TYPE> file at <DOC_PATH>.

From the <TASKS_SECTION> section:
  - Count `[x]` checkboxes (any indent depth) → completed
  - Count all `[ ]` + `[x]` checkboxes (any indent depth) → total

Extract the `Status:` field value from the YAML frontmatter or the body header (whichever is present).

Run `git log -1 --format=%H` → last_commit_hash.

Return JSON only (no prose, no code fences):

{"status":"<status string>","completed":<N>,"total":<M>,"last_commit_hash":"<hash>"}

Constraints:
  - status: verbatim string from the doc; do not normalise case.
  - completed, total: integers; total must be ≥ completed.
  - last_commit_hash: full 40-char SHA from git log.
  - All four fields are required. If any cannot be determined, return:
    {"error":"<one-line description>"}
```

---

## Output Schema

```json
{
  "status": "string",
  "completed": "integer (>=0)",
  "total": "integer (>= completed)",
  "last_commit_hash": "string (40-char SHA)"
}
```

Or on error:

```json
{ "error": "string" }
```

---

## Caller Failure Semantics

| Caller | JSON parse failure | Second failure |
|---|---|---|
| Initial audit | retry Explore dispatch once | inline shell fallback (`grep -cE '\[x\]'` + `git log -1`); log `"Initial audit JSON failed — used inline fallback."` |
| Per-iteration audit | retry Explore dispatch once with same prompt | log `"Audit JSON parse failure at iteration {ITER} — halting"` in Issues Log and **HALT** |

The asymmetry is intentional: initial audit can tolerate fallback because it only seeds counters. Per-iteration audit drives loop progress and stall detection — silent fallback there could mask a stuck loop.

---

## Persistence

The caller writes the result (after retry / fallback resolution) to a JSON artifact under `.summaries/`:

| Caller | Artifact path |
|---|---|
| Initial audit | `<doc-dir>/.summaries/step-3-iteration-audit-0.json` |
| Per-iteration audit | `<doc-dir>/.summaries/step-3-iteration-audit-{ITER}.json` |

Schema: `references/subagent-summary-artifact.md`. The Pipeline Progress `Subagent summary ref` column for Step 3 is updated to point to the latest audit artifact.
