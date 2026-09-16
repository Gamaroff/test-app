---
name: develop-pipeline-autonomous-defaults
description: Canonical autonomous decision defaults shared by develop-story and develop-task. Lists every decision taken without user prompting. Skill-specific rows (Register handling for story; Step 9 answer and completion status for task) live in each SKILL.md as a "Skill-specific defaults" addendum.
---
<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/develop-pipeline-autonomous-defaults.md. Regenerate via `npm run bundle`. -->

# Develop Pipeline — Autonomous Decision Defaults

## When This Table Applies

This table is consulted during any `develop-story` or `develop-task` pipeline run whenever the orchestrator must take an action without prompting the user. Load it at the start of Phase 0 setup and refer back to it at each decision point. Skill-specific rows that apply to only one orchestrator are in each SKILL.md's **Skill-specific defaults** section beneath the reference line — check both sources before deciding.

Every default applied must be recorded in the Decisions Log.

The rows below apply to both `develop-story` and `develop-task`. Where the two skills differ in terminology only (story ↔ task, `Draft` ↔ `Planned`, `review-story` ↔ `review-task`), both forms are shown. Skill-specific rows that apply to only one orchestrator are listed in each SKILL.md's own **Skill-specific defaults** section beneath the reference line.

| Situation | Default |
|-----------|---------|
| Feature branch base | User-selected in Upfront Setup (Q1) |
| PR target branch | User-selected in Upfront Setup (Q2) |
| High-risk gate (story / task) | User-selected in Upfront Setup (Q3) |
| Story status is `Draft` / Task status is `Planned` | Step 2 runs the review skill (`/review-story` or `/review-task`) to validate and promote autonomously. Do NOT ask the user. |
| Status `Ready for Development` or `In Progress` AND review report exists | Step 2 skips the review skill — document already reviewed |
| Status `Ready for Development` or `In Progress` AND no review report | Step 2 runs the review skill — status set without completing a review |
| Review skill output format | Always select "Comprehensive report" — pipeline requires a co-located review report file |
| Draft/Planned status gate (develop) | Proceed — review skill already validated the document in Step 2 |
| Alignment mismatch (develop) | Align code to document — document is source of truth |
| Commit style | Conventional Commits |
| Commit granularity | Multiple logical commits |
| Implementation report in create-pr commit | EXCLUDE — unstage before create-pr commits; Step 8 commits it |
| Pre-develop codebase mapping | Always run Explore subagent; pass summary to `/develop`, do not re-read files |
| qa-fix with no file changes | HALT — do not increment cycle; log as unfixable and surface to user |
| Step 5c `/review-pr` — post the summary PR comment? | Pass `--comment` explicitly. `/review-pr` otherwise asks before posting and the pipeline cannot prompt. Already-authorised ground: Steps 5–6 and 7 both comment on the PR. |
| Step 5c `/review-pr` verdict | `REQUEST CHANGES` → return to 5b. **The counter is incremented once, by 5b step 7, on exit — never at 5c.** Incrementing here as well burns two of the five cycles per review-driven fix and desynchronises resume, which reconstructs the count from `### QA Cycle` headings the extra increment never writes. `CONCERNS` → record findings, do not block, exit to Step 7. `APPROVE` → exit to Step 7. The full routing lives in the Steps 5–6 QA loop step file, §5c — not linked by path here, because this file is bundled into `develop-bug` too and a path reference would drag the story/task QA loop into a skill that runs its own verify loop. |
| Resume state validation | Per-step artifact verification AND branch + PR cross-check before skipping any ✅ step — full contract in `references/develop-pipeline-resume-contract.md` |
| Completion status (story or task) | `accepted` (lowercase, matches finalise canonical YAML schema). Note: document `Status:` fields use Title Case (`Draft`, `Planned`, `In Progress`, `Ready for Review`) — `accepted` is the YAML frontmatter value only. |
| Pipeline mode (lite vs standard) | See `references/develop-pipeline-lite-mode.md` for trigger conditions and behaviour. Default to `standard` if any condition fails. |
| qa-story / qa-task invocation in lite mode | Prepend the lite-mode directive (see lite-mode contract) to the invocation context |
| Final commit push (Step 8) | Always push after Step 8 commit so PR reflects completed report |
| Tracker mutation retry policy | 3× exponential backoff (1s, 2s, 4s). Shell calls (`gh`) wrap with `tracker_call_with_retry` from `references/resolve-platform.sh`. Atlassian MCP calls retry inline with the same schedule. All tracker mutations are non-blocking — final failure logs a warning in Issues Log and continues. |

If a situation arises that is not covered by this table or the skill-specific table, and the stakes are non-trivial, **HALT and ask the user**. Log the question and the user's answer in the Decisions Log.
