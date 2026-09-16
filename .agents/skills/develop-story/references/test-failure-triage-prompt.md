---
name: test-failure-triage-prompt
description: Explore subagent prompt and output schema for classifying test failures into real/flaky/unrelated. Used by the develop skill and develop-pipeline Step 3 on TEST_EXIT != 0 to keep raw test logs out of main context. Bias rule — when unsure between real and flaky, classify as real.
---
<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/test-failure-triage-prompt.md. Regenerate via `npm run bundle`. -->

# Test Failure Triage — Explore Subagent Prompt

## Purpose

When a test run exits non-zero, dispatch an Explore subagent with this prompt instead of reading the raw log into main context. The subagent classifies failures and returns a ≤10-bullet summary. Main context never reads the raw log.

## Prompt Template

Substitute `<log_path>` with the actual log file path before dispatching.

```
Read <log_path>.

Classify each failing assertion as one of:
  - real: the code-under-test is broken
  - flaky: timing/order/network artefact — failure is non-deterministic
  - unrelated: pre-existing failure or environment issue unrelated to the current change

Bias rule: if unsure between real and flaky, classify as real.

Return YAML only (no prose, no markdown fences):

counts:
  real: <int>
  flaky: <int>
  unrelated: <int>
failures:
  - name: <test name>
    classification: real | flaky | unrelated
    file: <source file path or empty string>
    line: <int or null>
    reason: <one-line explanation>
next_file: <single file path most likely to need a fix, or empty string>
truncated_count: <int>
cap: 10
```

Cap the `failures` list at 10 entries. Set `truncated_count` to the number of additional failures beyond the cap (0 if none).

## Output Contract

After the Explore subagent returns, persist the triage result as a subagent summary artifact (per `references/subagent-summary-artifact.md`):

Path: `<story-or-task-dir>/.summaries/step-3-test-triage-<ITER>.json`

```json
{
  "schema_version": 1,
  "step": 3,
  "agent": "test-failure-triage",
  "dispatched_at": "<ISO-8601>",
  "completed_at": "<ISO-8601>",
  "summary": {
    "iter": 1,
    "counts": { "real": 2, "flaky": 0, "unrelated": 1 },
    "failures": [
      {
        "name": "should return 404 for unknown user",
        "classification": "real",
        "file": "src/users/users.service.ts",
        "line": 42,
        "reason": "getUser() returns undefined instead of throwing NotFoundException"
      }
    ],
    "next_file": "src/users/users.service.ts",
    "truncated_count": 0
  },
  "raw_artifact_paths": [".claude/state/test-output-1-1715000000.log"]
}
```

## Log Cleanup Rule

- `TEST_EXIT == 0` → `rm -f "$TEST_LOG"` — successful run, log no longer needed
- `TEST_EXIT != 0` → retain `$TEST_LOG` for post-mortem debugging

Never delete the log on failure — it is the only raw evidence of what went wrong. The next successful run at the same iteration, or out-of-band rotation, cleans it up.
