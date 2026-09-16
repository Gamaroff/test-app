---
name: develop-pipeline-lite-mode
description: Lite-mode contract for the develop-story and develop-task pipeline orchestrators. Covers trigger conditions, PIPELINE_MODE=lite behavior, the directive format passed to qa-story/qa-task, and Step 5c's `/review-pr --effort low` degradation (lite degrades the PR conformance review; it never skips it). QA-side effect details (Adaptive Review Strategy override) stay in each qa skill's own section.
---
<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/develop-pipeline-lite-mode.md. Regenerate via `npm run bundle`. -->

# Develop Pipeline — Lite Mode

## Trigger Conditions

`PIPELINE_MODE=lite` is activated by the orchestrator (`develop-story` or `develop-task`) when **all three** conditions are met after reading the document:

- `risk_level: low` or absent, **AND**
- Fewer than 3 Tasks defined in the story / fewer than 3 implementation phases in the task, **AND**
- Story or task touches a single module (single app or lib)

If **any** condition is not met, `PIPELINE_MODE=standard` (default — no change to behaviour).

## Pipeline Behaviour in Lite Mode

- Step 5 (qa-story / qa-task) uses **Direct Tools only** — skips parallel agents regardless of the Adaptive Review Strategy decision
- Step 5b (qa-fix) still runs if issues are found
- Step 5c (review-pr) runs with `--effort low` — **degraded, never skipped**. It is the loop's exit gate, and its conformance lens has no counterpart elsewhere in the pipeline; skipping it would remove the check entirely rather than shorten it
- All other steps run unchanged

### What Lite Mode Does NOT Skip (CRITICAL)

Lite mode trades **QA depth** for speed on low-risk work. It does NOT trade away the audit trail or stakeholder visibility. The orchestrator MUST still execute every Step 7 side-effect:

1. Write the `*.dod.{N}.*.md` file (full DoD audit, not a one-line acceptance note)
2. Set the story/task `status: accepted` in both frontmatter and body
3. **Post the full DoD body as a PR comment** (the entire DoD file content, not just a "task accepted" line)
4. **Comment on the linked tracker issue** via `tracker-comment.js` (and, on GitHub, `gh issue close`) with the PR URL and DoD verdict
5. **Update the project board / Jira board** status to Done — `gh-stage.js --stage done` on GitHub, `jira-stage.js --stage done` on Jira. Both resolve the target column from the consumer's `tracker-workflow.yaml`; neither is skipped in lite mode.

> Engine source: `references/tracker-comment.js` (bundled into each skill as `references/tracker-comment.js`). Contract: `references/tracker-comment-contract.md`.


Skipping any of these in lite mode leaves the issue stuck "In Progress" forever and hides acceptance evidence from reviewers. The full Step 7 protocol in `references/develop-pipeline-step-7-finalise.md` applies in lite mode without exception.

Step 4 (PR creation), Step 7 (finalise), and Step 8 (commit-changes) are **never** skipped in any mode.

Log in the implementation report Pipeline Configuration table:

| Pipeline mode | lite |

## Directive Passed to the QA Skill

When invoking `/qa-story` or `/qa-task` in lite mode, the orchestrator **prefixes** the invocation with:

> "Use **direct tools only** for this review — skip parallel agents regardless of the adaptive strategy decision. This story/task is running in lite mode."

The QA skill recognises this directive and skips the parallel-agents branch of its Adaptive Review Strategy. QA-side effect details are documented in each skill's own **Lite Mode** section.

## Decisions Log Entry

When `PIPELINE_MODE=lite` is set, log it in the Decisions Log:

```
- Pipeline mode: lite — risk_level low/absent + <3 Tasks/phases + single module
```
