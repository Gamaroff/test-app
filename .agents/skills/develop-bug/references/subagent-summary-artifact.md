---
name: subagent-summary-artifact
description: Convention for persisting structured subagent summaries as JSON artifacts under `<task-or-story-dir>/.summaries/`. Used by develop-story and develop-task pipelines to support context-hygiene (release intermediate file contents from main context after the summary is durable on disk) and resume detection (replay summaries instead of re-reading source artifacts). Schema is versioned for forward compatibility.
---
<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/subagent-summary-artifact.md. Regenerate via `npm run bundle`. -->

# Subagent Summary Artifacts

When a step in `/develop-story` or `/develop-task` dispatches a subagent (e.g. Explore prepass, iteration audit, test-failure triage, diff summariser), the subagent's structured summary MUST be persisted to disk as a JSON artifact. This lets the orchestrator release intermediate file contents from main context while keeping the subagent's reasoning durable for resume, audit, and downstream replay.

## Path

```
<story-or-task-dir>/.summaries/step-<N>-<short-name>.json
```

- `<story-or-task-dir>` — the directory holding the story/task file and its sibling artifacts (review, plan, qa, dod, implementation report).
- `<N>` — pipeline step number (1–8).
- `<short-name>` — kebab-case identifier for the subagent role (e.g. `review-prepass`, `iteration-audit`, `test-triage`, `diff-summary`).

Examples:

```
docs/prd/app/core/epics/epic.178/stories/story.178.8.example/.summaries/step-2-review-prepass.json
docs/tasks/task.26.foo/.summaries/step-3-iteration-audit.json
```

## Schema

```json
{
  "schema_version": 1,
  "step": 3,
  "agent": "develop-loop-iteration-audit",
  "dispatched_at": "2026-05-08T10:00:00Z",
  "completed_at": "2026-05-08T10:00:42Z",
  "summary": { },
  "raw_artifact_paths": []
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `schema_version` | integer | yes | Currently `1`. Bump on breaking change. Readers MUST check this field before parsing. |
| `step` | integer | yes | Pipeline step number that dispatched the subagent. |
| `agent` | string | yes | Stable identifier for the subagent role. Kebab-case. |
| `dispatched_at` | ISO-8601 string | yes | UTC timestamp when subagent started. |
| `completed_at` | ISO-8601 string | yes | UTC timestamp when summary was written. |
| `summary` | object | yes | Agent-specific structured payload. Shape is defined per-agent. |
| `raw_artifact_paths` | array of strings | yes (may be `[]`) | Optional pointers to raw files the subagent read or produced (logs, diffs, generated reports). Relative to repo root. |

## Validation

```bash
jq -e '.schema_version == 1 and (.step | type == "number") and (.agent | type == "string")' \
  <story-or-task-dir>/.summaries/step-*.json
```

Returns `0` for every well-formed artifact.

## Implementation Report Integration

The Pipeline Progress table in the implementation report has a `Subagent summary ref` column (5th column). For steps that dispatch subagents, populate it with the relative path to the JSON artifact (e.g. `.summaries/step-3-iteration-audit.json`). For steps without subagents, use `—`.

## .gitignore

`.summaries/` is added to the repo `.gitignore` — these artifacts are runtime-local and should not be committed. Resume reads them from the working tree on the developer's machine.

## Backwards Compatibility

In-flight pipelines started before this convention existed will not have `.summaries/` directories. Resume logic MUST tolerate absence: when no summary file exists for a step, fall back to the implementation report's textual notes for that step. The `Subagent summary ref` column reads `—` in that case.

## When To Write

The subagent itself (or the orchestrator wrapping it) writes the summary file as the **last action** before returning control to the main pipeline. The orchestrator then:

1. Updates the implementation report's `Subagent summary ref` column with the path.
2. Releases the subagent's verbose output from active context (Context Management Rule applies).
3. Reads the JSON file later only if the summary is needed again (e.g. on resume).
