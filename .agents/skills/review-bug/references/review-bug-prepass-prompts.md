---
name: review-bug-prepass-prompts
description: Prompt templates for review-bug's Phase 1.5 pre-pass — two read-only Explore subagents (duplicate scan; already-fixed/stale scan) dispatched in parallel. Each returns a compact YAML summary consumed by the review dimensions and the GO/NO-GO verdict.
---

# review-bug Pre-pass Prompts

Dispatch **both agents in a single message** (parallel — one tool-call block, two `Agent(subagent_type="Explore")` invocations). Substitute the `{…}` placeholders from Step 0/1 before dispatching. Each agent is read-only and returns ONLY the specified YAML block (no prose).

Variables:
- `{BUG_FILE}` — absolute path to the bug report
- `{BUG_PREFIX}` — filename stem (e.g. `bug.7.stale-token`, `story.8.5.3.bug.1.cache-leak`)
- `{BUG_DIR}` — bug directory
- `{MODE_KIND}` — `story` | `task` | `general`
- `{SUMMARY}` — the bug's one-line description / summary
- `{RELATED_FILES}` — the bug's "Related Files" + files named in Evidence/Reproduction (may be empty)

---

## Agent A — Duplicate scan

```
You are a read-only reviewer. Determine whether the bug report at {BUG_FILE} duplicates an existing bug.

Bug summary: "{SUMMARY}"
Bug prefix: {BUG_PREFIX}   Mode: {MODE_KIND}

Search for near-duplicates (do NOT match the bug against itself):
1. Sibling bug files:
   - story/task mode: other `*.bug.*.md` files in {BUG_DIR} and the parent's directory
   - general mode: all `docs/bugs/bug.*/bug.*.md`
2. The general bug registry `docs/bugs/bug-registry.md` (title/area columns).
Compare on: same symptom + same area/component + same expected-vs-actual. A different bug in the
same file is NOT a duplicate. A closed/cancelled bug describing the same defect IS a relevant match.

Return ONLY this YAML:

duplicate: none | suspected
match_id: "{bug id/path, or empty}"
match_status: "{new|closed|cancelled|unknown, or empty}"
reason: "{one line: why it is/ isn't a duplicate}"
```

---

## Agent B — Already-fixed / stale scan

```
You are a read-only reviewer. Judge whether the defect described in {BUG_FILE} still exists in the
current codebase, or appears already fixed. Do NOT run tests or edit anything — static reading only.

Bug summary: "{SUMMARY}"
Expected vs Actual and Reproduction Steps are in the bug file — read them.
Candidate code locations: {RELATED_FILES}  (if empty, locate the relevant module from the summary)

Trace the reported input/behaviour to the code path where Expected and Actual would diverge. Assess:
- Is the faulty behaviour still present in the current code? → reproduces: likely
- Does the code already guard/handle the reported case (fix present, or code moved on)? → reproduces: unlikely
- Not enough signal to tell (env-specific, external service, no locatable path)? → reproduces: unknown

Return ONLY this YAML:

reproduces: likely | unlikely | unknown
found_at: "{file:line of the decisive code path, or empty}"
evidence: "{one line: what the code shows}"
confidence: high | medium | low
```

---

## Consumption (in review-bug)

- Store results as `PREPASS_DUP` (Agent A) and `PREPASS_STALE` (Agent B).
- **Agent failure / missing top-level key** → log `⚠️ Pre-pass Agent {A/B} failed — treating as unknown` and proceed with in-line review for that axis.
- `PREPASS_DUP.duplicate == suspected` → QUESTION POINT 1 confirmation (interactive) or **NO-GO: DUPLICATE** (validate, when corroborated by the review).
- `PREPASS_STALE.reproduces == unlikely` with `confidence: high|medium` and a concrete `found_at` → Step 3 **Critical (likely already fixed)** → QUESTION POINT 2 (interactive) or **NO-GO: STALE** (validate).
- `reproduces: unknown` is not a blocker on its own — it defers to the report's own reproducibility (Step 3).
