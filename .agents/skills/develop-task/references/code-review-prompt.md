---
name: code-review-prompt
description: Read-only Explore-subagent prompt + output contract for an adversarial diff-level code review (correctness bugs + reuse/simplification/efficiency cleanups). Used by /review-code (standalone), /qa-task, and /qa-story. The reviewer is always read-only and returns structured findings; whether to comment/fix/gate on them is the calling skill's decision. Findings are shaped to the gate top_issues[] schema so blocking bugs flow to /qa-fix unchanged.
---
<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/code-review-prompt.md. Regenerate via `npm run bundle`. -->

# Diff Code Review — Explore Subagent Prompt

## Purpose

This is the **single source of truth** for an adversarial diff-level code reviewer: its persona, scope, checks, and YAML output contract. Three skills dispatch it verbatim:

- **`/review-code`** — standalone diff review of the working tree or a PR (advisory by default; `--comment` posts findings to the PR, `--fix` applies them).
- **`/qa-story`** (Phase 1.6) and **`/qa-task`** (Step 3b) — adds a code-review lens to the document-anchored QA gate, which otherwise judges the work item against its spec (success criteria, NFRs, tests) but does **not** adversarially read the diff for logic errors.

The reviewer subagent is **always read-only and returns findings only** — it never edits, comments, or touches the gate. Those are orchestration decisions the **calling skill** makes from the returned findings (see the caller-responsibility sections below). Dispatch a read-only Explore subagent over a **scoped diff patch file**, keeping raw diff bytes out of main context.

Do not paraphrase this prompt inline in a skill — reference it and pass the **Prompt Template** verbatim.

## Prompt Template

Substitute `<DIFF_FILE>` with the scoped patch file path and `<WORKING_DIR>` with the repo root before dispatching.

```
You are a focused, read-only code reviewer. You review ONE change set for defects and
cleanups. You propose findings only — you NEVER edit files.

## Inputs
- A unified diff patch at <DIFF_FILE> — the change set under review (already scoped to the
  change set the caller selected; do not look beyond it for NEW findings).
- The repo working tree rooted at <WORKING_DIR> — Read the changed files and their immediate
  callers/callees to VERIFY each candidate. Reading for verification is expected; reviewing is
  still bounded to the diff's own changes.

## What to look for

A. CORRECTNESS BUGS (category: bug) — defects the change introduces:
   - logic errors, off-by-one, inverted conditions, wrong operator
   - null/undefined/empty handling; unhandled async/await; unhandled promise rejection; races
   - resource/error mishandling (leaks, swallowed errors, missing cleanup)
   - API/contract misuse (wrong args, ignored return, broken invariant or schema)
   - security-relevant mistakes in the change (injection, unsafe input, secret exposure)

B. CLEANUPS (category: cleanup) — quality improvements, NEVER blocking:
   - REUSE: the change reimplements something an existing util/function already does
     (name the existing symbol + path)
   - SIMPLIFICATION: redundant branches, dead code, needless complexity
   - EFFICIENCY: obvious wasteful work (N+1, repeated recompute, unnecessary allocation)

## Discipline (mandatory)
- VERIFY every candidate against the actual surrounding code before reporting — read the lines,
  trace the call. Do NOT flag on a pattern/name match alone.
- Prefer a FEW high-confidence findings over noise. When unsure a bug is real, set
  confidence: low (it will not gate) rather than inflating severity.
- Only report issues attributable to THIS diff. Do not report pre-existing debt in unchanged code.
- If the diff is empty, unreadable, or touches no reviewable code: return an empty findings list.
  Never invent issues.

## Output contract — emit EXACTLY this YAML and nothing else

code_review:
  reviewed: "<one-line: file/range count actually reviewed>"
  findings:
    - id: CR-1                 # CR-{n}, stable within this run
      category: bug            # bug | cleanup
      severity: high           # low | medium | high   (bugs: rate real impact; cleanups: usually low)
      confidence: high         # low | medium | high   (only bug + high gates, and only when opted in)
      file_line: "src/x/y.ts:42"
      finding: "<one sentence: what is wrong>"
      suggested_action: "<one sentence: the fix approach — not a file path>"
      suggested_owner: dev
  truncated_count: 0           # >0 if real findings exceeded 20 (report the top 20 by severity)

Rules:
- Sort findings: bugs before cleanups; within each, high → medium → low severity.
- `id` is CR-{n}; `suggested_owner` is always `dev`.
- `finding`/`suggested_action` are single sentences. `file_line` is `path:line` from the diff.
- Output ONLY the YAML block above — no prose, no markdown table, no fences around it.
- Empty review → `code_review: { reviewed: "...", findings: [], truncated_count: 0 }`.
```

## Output contract (for the calling skill)

The subagent returns the `code_review:` YAML. What the caller does with it depends on the skill:

### Standalone use (`/review-code`)

The reviewer stays read-only; the **skill** acts on the returned findings:
1. **Render** all findings to the user (grouped bugs-then-cleanups), regardless of mode.
2. **`--comment`** → post each finding as an inline PR comment at its `file_line` (or a single summary
   comment when no PR / line anchoring fails). Bugs and cleanups both post; never gate.
3. **`--fix`** → apply each finding's `suggested_action` to the working tree (do **not** commit),
   then re-render what was changed vs. skipped. Apply bugs first; cleanups only with explicit opt-in.
4. **Effort level** scales breadth, not the contract — low/medium favour few high-confidence findings;
   high→max widen coverage and may surface `confidence: low` candidates (clearly labelled).

There is no gate in standalone mode — the `top_issues[]` mapping below is QA-only.

### QA use (`/qa-story`, `/qa-task`)

1. **Always** renders all findings into the QA report `## Code Review` section and the PR comment (advisory).
2. **Maps to the gate `top_issues[]` ONLY when the doc opts in** (see **Opt-in to blocking** below)
   **AND** the finding is `category: bug` **AND** `confidence: high`. Such a finding is appended to
   `top_issues[]` as `{ id, severity, finding, suggested_action, suggested_owner }` — the exact shape
   the gate and the `qa-findings-ingester-prompt.md` → `/qa-fix` loop already consume, so no extra
   wiring is needed. The existing deterministic gate rules then decide (any high → FAIL, any medium → CONCERNS).
3. **Never gates on** `category: cleanup`, on `confidence: low|medium`, or when the doc does not opt in.

### Opt-in to blocking (QA caller responsibility)

Whether high-confidence correctness bugs gate the build is resolved from **two inputs**, with a fixed
precedence. This is the **canonical resolution** — both `/qa-story` and `/qa-task` implement it verbatim,
and it is what makes the develop pipelines' "code-review-and-fix loop" work:

1. **Run-level override** — a caller (the develop pipeline) passes `code_review_blocking=true` in the
   Skill `args`. Turns blocking on for this run regardless of the document.
2. **Per-document frontmatter flag** — `code_review_blocking: true | false` in the story/task YAML.

Precedence (an explicit per-doc `false` is the **escape hatch** and always wins, so a single noisy work
item can opt out of an otherwise-on pipeline default):

```bash
# $DOC_FILE = the story/task .md.  $CR_OVERRIDE = "true" when the caller passed
# code_review_blocking=true in Skill args (empty for standalone / non-pipeline invocations).
DOC_FLAG=$(grep -E '^code_review_blocking:[[:space:]]*(true|false)\b' "$DOC_FILE" \
             | head -1 | grep -Eo '(true|false)' || true)

if [ "$DOC_FLAG" = "false" ]; then
  CR_BLOCKING=false          # explicit per-doc opt-out — escape hatch, always wins
elif [ "$CR_OVERRIDE" = "true" ] || [ "$DOC_FLAG" = "true" ]; then
  CR_BLOCKING=true           # pipeline run-level default, or per-doc opt-in
else
  CR_BLOCKING=false          # standalone / no signal → advisory (unchanged default)
fi
```

- `CR_BLOCKING=true` → append every `category: bug` + `confidence: high` finding to the gate
  `top_issues[]`; the skill's existing deterministic gate rules then apply unchanged. On the next
  `/qa-fix` cycle these are fixed alongside the document-derived issues, then re-reviewed — i.e. the
  code-review-and-fix loop.
- `CR_BLOCKING=false` → all findings stay advisory; the gate is untouched.

**Resolution matrix:**

| `code_review_blocking` arg | doc frontmatter | result |
| --- | --- | --- |
| (absent — standalone/qa run) | absent | advisory |
| (absent) | `true` | blocking |
| (absent) | `false` | advisory |
| `true` (pipeline default) | absent | **blocking** |
| `true` | `true` | blocking |
| `true` | `false` | advisory (escape hatch) |

The flag lives in frontmatter (not an embedded block) so it is trivially greppable and consistent with
the other behaviour-driving keys the QA skills already read (`status`, `github_issue`, `jira_key`). The
`top_issues[]` entries use the `finding:` key — matching `qa-findings-ingester-prompt.md` and the
`qa-gate` schema (not the legacy `issue:` key still shown in some hand-authored gate examples).

## Scoping (caller responsibility — keeps raw diff bytes out of main context)

**Standalone (`/review-code`):**
- Default: uncommitted working changes — `git diff HEAD > <DIFF_FILE>` (add `--staged`/include untracked as needed).
- PR / branch: `git diff <base>...HEAD > <DIFF_FILE>`, or for a given PR resolve its base via
  `gh pr view <n> --json baseRefName` and diff against it.

**QA (`/qa-story`, `/qa-task`) — bounded across the up-to-5-cycle QA loop:**
- First review: `git diff <base>...HEAD > <DIFF_FILE>` (base = the resolved target branch, default `develop`).
- Re-review (QA cycle ≥ 3): scope to files changed since the last gate — reuse the skill's existing
  `git log --since="{gate_date}" --name-only` set, diff only those paths, so each cycle re-reviews
  only what changed. **One carve-out overrides this**: when the prior gate failed on a safety axis,
  the re-review runs unscoped at *any* cycle and the prompt gains a SAFETY RE-PROBE directive. The
  trigger and its non-triggers are stated once in
  [`references/qa-re-review-scope.md`](qa-re-review-scope.md) — read it there; this file
  deliberately does not restate them, because a third copy of the rule is how the first two drift.
- **Re-review (QA cycle 2): the full branch diff, reviewed to refute.** See below.
- Lite mode / small / re-review with no new code: skip or run a single light pass per the skill's
  Adaptive Review Strategy.

**Cycle 2 is the exception: a full-diff refute pass, not a narrowed re-review.** The narrowing above
is a cost control, and on cycle 2 it costs more than it saves. Files changed since the last gate are
exactly cycle 1's own fixes, so a narrowed cycle-2 review reads only the repairs and never re-reads
the original change with the knowledge cycle 1 produced. On one observed task, four narrowed
re-reviews walked past a defect that had been in the *original* commit and surfaced only at cycle 5.

So on **cycle 2 only** (exactly one prior gate exists):

- Scope to the **whole branch diff** — `git diff <base>...HEAD` — not the changed-files subset.
- Instruct the subagent to **refute rather than review**: the code under review was written by the
  same pipeline that is now reviewing it, and cycle 1's fixes are the least-reviewed code in the
  change set. Its job is to find the claim that is false, starting with the fixes.
- Probe the four transitions the steady-state suite structurally cannot see — **teardown ·
  in-flight · error path · reconnect** (the table in `qa-fix` Step 3.5). At least one real defect of
  this shape was caused by two earlier fixes that were each correct alone.

Cycles 3+ keep the narrowed scope. This is affordable because the pipeline's convergence check ends
the loop shortly after cycle 3 when it is not converging: the trade is **two deep cycles instead of
five shallow ones**, not six cycles instead of five.

## Cleanup

```bash
rm -f "$DIFF_FILE"
```
