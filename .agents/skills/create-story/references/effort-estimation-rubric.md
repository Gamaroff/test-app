<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/effort-estimation-rubric.md. Regenerate via `npm run bundle`. -->
# Effort Estimation Rubric

> **Audience:** the agent (Claude) running `create-story`, `create-task`, `review-story`, or `review-task`.

A deterministic rubric for proposing a default `estimated_effort_hours` value. The agent computes a number from observable signals in the document, then surfaces it as the `(Recommended)` option in an `AskUserQuestion` prompt — the user can accept, override, or skip.

The same rubric is re-applied in review skills to flag stale or implausible estimates without blocking the gate.

## When to apply

| Skill | When |
|---|---|
| `create-story` | After Step 5.2 (basic info filled), before Step 5.2a (tracker issue). |
| `create-task` | After Step 4 (document generated), before Step 4.5 (tracker issue). |
| `review-story` | Step 5 (Completeness & Gap Analysis), sub-check 9 (Effort Estimate). |
| `review-task` | Step 4 (Implementation Plan Completeness), sub-check 6 (Effort Estimate). |

## Signals

Read these from the document the skill is currently working on. All are integer counts unless noted.

| Signal | Source | How to read |
|---|---|---|
| `ac_count` | story `## Acceptance Criteria` list / task `## Success Criteria` list | count list items |
| `task_count` | story `## Tasks / Subtasks` / task `## Implementation Plan` | count top-level checkboxes (not subtasks) |
| `files_touched` | Dev Notes file-locations subsection / task `## Files Summary` | count distinct file paths mentioned |
| `risk_level` | frontmatter `risk_level` | `high` / `medium` / `low` / absent |
| `story_type` | frontmatter `story_type` (stories) / `category` (tasks) | string |
| `has_integration` | scan body for keywords | true if body mentions any of: "integration", "external API", "third-party", "webhook", "migration", "schema change" |

Missing or unreadable signal → treat as zero / absent. Do not fail the rubric; the worst case is a slightly less accurate default.

## Formula

```
hours = 2                                  # base
hours += max(0, min(ac_count - 3, 4))      # +1h per AC beyond 3, cap +4h
hours += max(0, min((task_count - 4) * 0.5, 4))  # +0.5h per task beyond 4, cap +4h
hours += 2 if risk_level == "high"
hours += 1 if risk_level == "medium"
hours += 1 if files_touched > 5
hours += 2 if has_integration
hours -= 1 if story_type in ("config", "config-only", "documentation")

hours = max(1, hours)                      # never below 1h
```

Then **snap to the nearest bucket** in `[1, 2, 4, 8, 16]`:

| Computed hours | Snap to |
|---|---|
| ≤ 1.5  | 1  |
| ≤ 3    | 2  |
| ≤ 6    | 4  |
| ≤ 12   | 8  |
| > 12   | 16 |

## Worked examples

| Story / task shape | Computed | Snap |
|---|---|---|
| Config-only: 3 ACs, 5 tasks, low risk, 2 files | 2 + 0 + 0.5 − 1 = 1.5 | **1h** |
| Standard feature: 5 ACs, 6 tasks, low risk, 4 files | 2 + 2 + 1 = 5 | **4h** |
| Feature with integration: 6 ACs, 8 tasks, medium risk, 7 files, hits external API | 2 + 3 + 2 + 1 + 1 + 2 = 11 | **8h** |
| High-risk migration: 7 ACs, 10 tasks, high risk, 12 files, migration | 2 + 4 + 3 + 2 + 1 + 2 = 14 | **16h** |

## How to present (create skills)

In the `AskUserQuestion` step, format options as `1 hour`, `2 hours`, `4 hours`, `8 hours` (story) or `4 hours`, `8 hours`, `16 hours` (task) and **append `(Recommended)` to the snapped bucket label**. Include the rubric output in the question body so the user sees the reasoning:

> _Based on {ac_count} ACs, {task_count} tasks, risk={risk_level}, recommending **{snap}h**._

User picks any option; "Other" lets them enter a custom number; "Skip — leave unestimated" omits the field.

## How to apply (review skills)

1. Read `estimated_effort_hours` from frontmatter.
2. Recompute the rubric from the current document state.
3. If frontmatter absent → already flagged by sub-check 9 / 6.
4. If `abs(frontmatter - rubric) / max(frontmatter, rubric) > 0.5` (i.e. >2× divergence), flag as **Optional** (LOW severity):
   > "Frontmatter `estimated_effort_hours: {X}` diverges from rubric estimate of **{Y}h** (AC: {n}, tasks: {m}, risk: {r}). Confirm or adjust."
5. Non-blocking — does not affect gate decision.

## Why this rubric

Three design constraints:

- **Deterministic** — two runs over the same document produce the same number. No agent guessing.
- **Transparent** — the user sees the signals the agent used to recommend the bucket. Easy to audit, easy to disagree with.
- **Tunable** — coefficients are concentrated here. To shift the team's velocity assumptions, edit this file, re-bundle, done.
