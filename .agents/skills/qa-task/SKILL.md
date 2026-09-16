---
name: qa-task
description: Comprehensive quality assurance review for technical tasks. Focuses on success criteria validation, implementation phase verification, and non-functional requirements assessment for infrastructure and refactoring work.
---

> **Status lifecycle**: see [`references/document-status-lifecycle.md`](references/document-status-lifecycle.md)
>
> **Placeholders**: `{project}` in NX commands is a template — substitute your project name. See [`docs/reference/configuration.md`](../../docs/reference/configuration.md).

# QA Task Review Skill

**Version**: 2.0
**Last Updated**: 2026-03-20
**Skill Type**: Quality Assurance

## Description

This skill guides QA engineers through comprehensive quality assurance reviews for technical tasks (refactoring, infrastructure improvements, technical debt reduction, architectural changes). It adapts the story QA workflow for technical work, focusing on success criteria, implementation phases, and non-functional requirements.

## Lite Mode (Pipeline Contract)

When invoked from the `/develop-task` orchestrator, the call may be prefixed with the lite-mode directive. See `references/develop-pipeline-lite-mode.md` for trigger conditions, pipeline behaviour, and directive format.

**Effect on this skill**:

- Skip parallel agents in the Adaptive Review Strategy decision — use the **Lite mode** rule (direct tools only) regardless of phase count or risk.
- **Step 3b (Diff Code Review) still runs** — as a single read-only Explore subagent. It is the one exception to "skip parallel agents": it is not part of the parallel-agent set, and lite mode runs exactly one light code-review pass.
- All other phases (success criteria, breaking changes, NFR, gate decision) run unchanged.
- Log the override in the QA report's Review Methodology section: `Adaptive strategy override: lite mode — direct tools only`.

If invoked outside the pipeline (no lite directive), the normal Adaptive Review Strategy applies.

## Pipeline Skill args (Pipeline Contract)

When invoked from the `/develop-task` orchestrator, the Skill `args` field may carry `key=value` tokens:

```
Skill(qa-task, args="traceability_matrix=<path> code_review_blocking=true")
```

- `traceability_matrix=<path>` — a pre-built traceability matrix (see Step 5 / traceability handling); absent → internal mapping.
- `code_review_blocking=true` — run-level override. Set `CODE_REVIEW_BLOCKING_ARG` from this token (default empty when absent). It feeds the canonical resolution in **Step 3b step 4** so high-confidence code-review bugs gate the build (and thus get fixed in the qa-fix loop) without needing per-task frontmatter. A task still opts **out** with `code_review_blocking: false` in its frontmatter (escape hatch). Absent for standalone runs → code review stays advisory unless the task opts in via frontmatter.

## When to Use This Skill

Activate this skill when:

- ✅ Developer marks technical task as "Ready for QA"
- ✅ All implementation phases completed
- ✅ Tests are passing
- ✅ Breaking changes documented with migration paths
- ✅ Technical task document exists at `docs/tasks/task.[id].[name]/task.[id].[name].md`

**Keywords**: `qa task`, `qa-task`, `technical review`, `qa refactoring`, `qa infrastructure`

---

## QA Process Overview

### Workflow Stages

1. **Prerequisites Verification** - Ensure task is ready for QA; check for existing artifacts (re-review logic)
2. **Implementation Review** - Verify all phases completed correctly
3. **Testing Validation** - Run and validate test suite
4. **Success Criteria Assessment** - Check functional, performance, code quality criteria
5. **Breaking Changes Validation** - Verify migration paths documented
6. **NFR Assessment** - Evaluate non-functional requirements
7. **Issue Documentation** - Create bug reports for any issues found
8. **Quality Gate Decision** - PASS/CONCERNS/FAIL/WAIVED

### Key Differences from Story QA

| Aspect           | Story QA            | Technical Task QA                                                 |
| ---------------- | ------------------- | ----------------------------------------------------------------- |
| **Focus**        | Acceptance Criteria | Success Criteria (Functional, Performance, Quality)               |
| **Traceability** | ACs → Tests         | Implementation Phases → Tests                                     |
| **User Impact**  | End-user features   | Developer experience, system quality                              |
| **Migration**    | Not applicable      | Breaking changes require migration paths                          |
| **NFRs**         | Feature-specific    | System-wide (Performance, Reliability, Security, Maintainability) |

---

## Prerequisites

### Task List Initialization

**CRITICAL**: Before starting the review, use `TaskCreate` to register every phase as a tracked task. Mark each `in_progress` before starting and `completed` immediately after finishing. This prevents silently skipping steps.

| Task Subject                    | Description                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------- |
| PR existence check              | Validate PR exists for current branch; store PR metadata                     |
| Check for existing QA artifacts | Detect re-review vs fresh review; read prior gate/report                     |
| Read task document              | Read task file, extract success criteria, phases, breaking changes           |
| Run test suite                  | Execute tests, lint, build; capture coverage output                          |
| Verify implementation phases    | Check each phase checkbox; confirm changes match plan via git diff           |
| Run diff code review            | Adversarially review the change-set diff for bugs + cleanups (Step 3b)        |
| Execute documented commands     | Extract and run the skill's fenced bash blocks under bash + zsh (Step 4b)    |
| Verify success criteria         | Check functional, performance, code quality criteria against actual results  |
| Validate breaking changes       | Verify migration paths documented and consumer code updated                  |
| Run NFR assessment              | Evaluate performance, reliability, security, maintainability                 |
| Run regression testing          | Test dependent areas for regressions                                         |
| Document issues                 | Create bug report files for all HIGH/MEDIUM severity issues found            |
| Write QA report                 | Create co-located `task.{id}.qa.N.*.md` report file                         |
| Write gate YAML                 | Create co-located `task.{id}.gate.N.*.yml` file                             |
| Update task file                | Add QA Results section, update status, link artifacts                        |
| Post PR comment                 | Post QA gate decision to PR — `gh pr comment` on GitHub, REST on Bitbucket; best-effort, non-blocking |
| Communicate to user             | Output final summary with gate decision and next steps                       |

---

### PR Existence Check

**CRITICAL**: The qa-task skill requires an active pull request for the current branch. Store PR metadata now — it is needed for the PR comment in Step 14.

```bash
# Get current branch
CURRENT_BRANCH=$(git branch --show-current)

# Find PR for current branch
PR_JSON=$(gh pr view --json url,state,title,number 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  echo "No pull request found for branch: $CURRENT_BRANCH"
  echo "QA Review requires a pull request to post results."
  echo "Create a PR first, then re-run /qa-task"
  exit 1
fi

PR_URL=$(echo "$PR_JSON" | jq -r '.url')
PR_STATE=$(echo "$PR_JSON" | jq -r '.state')
PR_NUMBER=$(echo "$PR_JSON" | jq -r '.number')
PR_TITLE=$(echo "$PR_JSON" | jq -r '.title')
```

**Handle PR state:**
- **OPEN**: Proceed with review
- **MERGED**: Warn user but continue — comment will be posted to merged PR
- **CLOSED**: Warn user but continue
- **No PR**: HALT and provide guidance

**Store PR_URL, PR_STATE, PR_NUMBER, PR_TITLE** for use in the PR comment step.

---

### Phase 0: Re-Review Logic

**CRITICAL**: Before starting a new review, check if QA artifacts already exist for this task.

1. **Search for existing gate files in the task directory:**

   ```bash
   TASK_DIR=$(dirname "$TASK_FILE")
   LATEST_GATE=$(ls -t "$TASK_DIR"/task.*.gate.*.yml 2>/dev/null | head -1)
   ```

2. **If gate file exists, read and analyze:**

   ```bash
   if [ -n "$LATEST_GATE" ]; then
     GATE_STATUS=$(grep '^gate:' "$LATEST_GATE" | awk '{print $2}')
     HAS_ISSUES=$(grep -c '^  - issue:' "$LATEST_GATE" 2>/dev/null || echo 0)
     echo "Found existing QA review: $LATEST_GATE"
     echo "Gate Status: $GATE_STATUS — Issues: $HAS_ISSUES"
   fi
   ```

3. **Decide whether to re-review:**

   **A prior gate only speaks for the code and the document it was written against.** Before the skip
   branch can apply, establish that neither has moved since. Gather both freshness signals:

   ```bash
   GATE_DATE=$(grep -E '^updated:' "$LATEST_GATE" | head -1 | sed -E "s/updated:[[:space:]]*//; s/['\"]//g")
   DOC_DATE=$(grep -E '^updated:' "$TASK_FILE"  | head -1 | sed -E "s/updated:[[:space:]]*//; s/['\"]//g")
   DOC_STATUS=$(grep -E '^status:' "$TASK_FILE" | head -1 | awk '{print $2}')
   # Any commit touching source since the gate was written?
   CODE_MOVED=$(git log --since="$GATE_DATE" --name-only --format="" -- \
     apps packages 2>/dev/null | sort -u | head -1)
   ```

   **Skip re-review (exit with success message) ONLY when ALL of:**
   - Gate status is `PASS`
   - AND `top_issues` list is empty
   - AND `CODE_MOVED` is empty — no source commit since the gate
   - AND `DOC_DATE` is not newer than `GATE_DATE` — the task document has not been edited since
   - AND `DOC_STATUS` is not one of `in-progress` / `ready-for-development` / `planned` — a status
     that moved *backwards* from `accepted` means the work was reopened
   - Message: "Task already has clean PASS gate with no concerns, and neither the code nor the
     document has changed since. Re-review not needed."

   **Perform re-review when ANY of:**
   - Gate status is `CONCERNS`, `FAIL`, or `WAIVED`
   - OR `top_issues` has items (even if gate is PASS)
   - OR no gate file exists (first review)
   - OR **source changed since the gate** (`CODE_MOVED` non-empty)
   - OR **the document changed since the gate** (`DOC_DATE` > `GATE_DATE`)
   - OR **the document was reopened** (status moved backwards from `accepted`)
   - Message: "Performing QA re-review (previous gate: {status} with {count} issues; {reason})"

   > **Why the extra conditions.** The skip branch as originally written keys only on the *content*
   > of the last gate, never on whether that gate is still *about* the current state. A reopened task
   > carries its old `PASS` forward, so the one situation most in need of QA — work that was accepted
   > and then found wanting — is precisely the one that skips it. Observed live: task.52 was accepted
   > at PASS 92/100 with its Playwright lane red, reopened with a new criterion, and its stale PASS
   > gate would have short-circuited the re-review that then found **seven** further defects.
   >
   > **A green gate is a statement about a commit, not a property of the task.** When in doubt,
   > re-review — the cost is one QA cycle, and the cost of the alternative is shipping on evidence
   > that has expired.

4. **For re-reviews, determine next QA artifact number:**

   ```bash
   LATEST_QA_NUM=$(ls "$TASK_DIR"/task.*.qa.*.md 2>/dev/null | \
                   sed -E 's/.*\.qa\.([0-9]+)\..*/\1/' | \
                   sort -n | tail -1)
   NEXT_QA_NUM=$((${LATEST_QA_NUM:-0} + 1))
   ```

5. **For re-reviews: resolve the scope.**

   The scope decision — default narrowing, the safety carve-out that overrides it, and what each
   changes — is stated once in [`references/qa-re-review-scope.md`](references/qa-re-review-scope.md).
   Read it and apply it; do not restate the trigger here.

   Evaluate `SAFETY_REPROBE` from the prior gate **now**, before Step 3b needs it:

   ```bash
   # $LATEST_GATE is the prior gate file resolved above. Trigger clause 1, per the shared rule.
   # POSIX character classes only: `\s` is a GNU extension that BSD/mawk silently never match,
   # which fails the trigger CLOSED — the carve-out would never fire and nothing would say so.
   # LATEST_GATE is EMPTY on a first review. `awk 'prog' ""` passes no filename, falls back to
   # reading stdin, and hangs indefinitely — a hang, not an error. Guard it, and close stdin so the
   # fallback is unreachable even if the guard is ever removed.
   # Clause 1 has TWO halves and they fail in opposite directions: the status half
   # fails CLOSED (an unreadable gate is not evidence of a failure), the evidence half
   # fails OPEN (a missing `evidence:` key reads as `unverified` and FIRES). See the
   # shared rule — writing the second half closed makes every pre-existing gate silent.
   SAFETY_REPROBE=false
   if [ -n "$LATEST_GATE" ] && [ -r "$LATEST_GATE" ]; then
     SECURITY_AXIS=$(awk '
       # Three transit constraints govern every line below — no whole-record
       # variable, no apostrophe, no GNU-only escape. See "Transit constraints"
       # in the shared rule for why each one fails silently. Each has a test.
       !f && /^[[:space:]]*security:[[:space:]]*$/ {
         n = length; sub(/^[[:space:]]*/, ""); ind = n - length; f = 1; next
       }
       f {
         # A key at or left of the indent of security: ends the block, so keys
         # belonging to a later NFR axis can never be read as this one.
         n = length; sub(/^[[:space:]]*/, ""); lead = n - length
         if (length > 0 && lead <= ind) exit
         if (st == "" && /^status:/) {
           st = (/[[:space:]]FAIL[[:space:]]*$/) ? "FAIL" : "OK"
         }
         if (ev == "" && /^evidence:/) {
           ev = "unverified"
           if (/evidence:[^[:alpha:]]*measured/) ev = "measured"
           else if (/evidence:[^[:alpha:]]*reasoned/) ev = "reasoned"
         }
       }
       END {
         if (!f) { print "absent"; exit }
         printf "%s %s\n", (st == "" ? "OK" : st), (ev == "" ? "unverified" : ev)
       }
     ' "$LATEST_GATE" </dev/null)
     case "$SECURITY_AXIS" in
       absent)                     : ;;
       *FAIL*)                     SAFETY_REPROBE=true ;;
       *unverified*)               SAFETY_REPROBE=true ;;
       "OK measured"|"OK reasoned") : ;;
       # The branches above are EXHAUSTIVE over what the program can emit, so
       # reaching here means the reader produced something it cannot produce —
       # in practice the EMPTY string, from an awk that died, is missing, or had
       # its program corrupted in transit. That is a claim about the instrument,
       # not about the gate, so it fires: nothing has established the axis is
       # fine. `absent` is a deliberate answer; empty is not an answer at all.
       #
       # The clean readings must be listed BEFORE this. Leaving them to the
       # catch-all makes every passing gate fire — which is what happened when
       # this branch was first added.
       *)                          SAFETY_REPROBE=true ;;
     esac
   fi
   ```

   Clause 1 is mechanical and shown above. Clauses 2 and 3 are judgement calls made against the
   gate's `top_issues[]` and the task's own Success Criteria — read the shared rule and set
   `SAFETY_REPROBE=true` if either holds.

   Default scoping (when `SAFETY_REPROBE` is false) narrows to files changed since the last gate:

   ```bash
   git log --since="{gate_date}" --name-only --format="" | sort -u
   ```

   Include a **Re-Review Context** section at the top of the new QA report listing each previous
   issue and its current status (FIXED / PARTIAL / NOT FIXED), and a **New Findings This Cycle**
   section — required even when empty, per the shared rule.

---

### Adaptive Review Strategy

Before running checks, evaluate the task to choose the review approach:

| Condition | Approach |
|---|---|
| Lite mode (set by `develop-task` orchestrator) | Direct tools only — skip parallel agents |
| Small task (<3 phases, single module, Low risk) | Direct tools — fast, sufficient coverage |
| Re-review (fixing previous issues) | Direct tools — focused scope on specific concerns |
| Large task (>5 phases, multiple modules) | Parallel agents — comprehensive |
| High-risk task (auth, payments, security touched) | Parallel agents — focused on risk areas |
| Default | Direct tools first; spawn agents if gaps found |

Log the chosen approach in the QA report's "Review Methodology" section.

---

## QA Review Process

### Step 1: Prerequisites Check

Verify all prerequisites met:

- [ ] Task document exists at `docs/tasks/task.[id].[name]/task.[id].[name].md`
- [ ] Status is "Completed" or "Ready for QA"
- [ ] All implementation phases have checkboxes marked complete
- [ ] Developer has marked success criteria as complete
- [ ] Tests are passing according to task document
- [ ] Breaking changes are documented (if applicable)
- [ ] Code is on the feature branch with an open PR

**If prerequisites NOT met**: Return task to developer with specific items needed. Do not proceed.

### Step 2: Read Task Document

Thoroughly read the task document to understand:
- Motivation and benefits
- Technical background (current state → target state)
- Breaking changes
- Implementation phases
- Success criteria (functional, performance, code quality)
- Testing strategy
- Risk assessment

### Step 3: Verify Implementation Phases

For each phase in the implementation plan:
1. Verify checkboxes are marked complete
2. Review files changed — resolve the PR base first: `BASE="origin/$(gh pr view --json baseRefName -q .baseRefName 2>/dev/null || echo develop)"`, then `git diff "$BASE...HEAD" -- {files}`
3. Confirm changes match the plan
4. Look for potential issues

**Create Phase Completion Table:**

| Phase           | Status      | Test Result | Notes          |
| --------------- | ----------- | ----------- | -------------- |
| Phase 1: {Name} | PASS        | Verified    | {Notes}        |
| Phase 2: {Name} | PASS        | Verified    | {Notes}        |
| Phase 3: {Name} | CONCERNS    | Partial     | {Issues found} |

**Overall Phase Completion**: {X/Y phases passed}

### Step 3b: Diff Code Review

Adversarially review the change set's **diff** for **correctness bugs** (logic errors, null/async/race, API misuse, broken invariants) and **cleanups** (reuse of existing utilities, simplification, efficiency) — the lens the document-anchored checks above do not provide. Governed by the **Adaptive Review Strategy**: run a single light pass in lite/small/re-review; a full pass otherwise; skip entirely when the diff touches no reviewable code. **One exception, and it overrides the strategy: cycle 2 is always a full refute pass** (step 1 below). A re-review that gets shallower each cycle is how a loop runs five times and learns nothing after the first.

1. **Scope the diff** to this cycle's changes and write it to a patch file (keeps diff bytes out of main context). First review → the whole branch diff. **Cycle 2 (exactly one prior gate) → the whole branch diff again, reviewed to refute** (see the refute directive under step 2). Cycle 3+ → files changed since the last gate's `updated:` date:

   ```bash
   BASE_REF=$(gh pr view --json baseRefName -q .baseRefName 2>/dev/null)   # standalone tasks usually target develop
   BASE="origin/${BASE_REF:-develop}"
   DIFF_FILE=$(mktemp /tmp/qa-code-review-XXXXXX.diff)
   # How many gates already exist? 0 = first review, 1 = cycle 2, 2+ = cycle 3 and later.
   PRIOR_GATES=$(ls "$TASK_DIR"/task.*.gate.*.yml 2>/dev/null | wc -l | tr -d ' ')
   # Re-review only: derive the prior gate's date from its `updated:` field ($LATEST_GATE set in Phase 0).
   LAST_GATE_DATE=$(grep -E '^updated:' "$LATEST_GATE" 2>/dev/null | head -1 | sed -E "s/updated:[[:space:]]*//; s/['\"]//g")
   # $SAFETY_REPROBE was resolved in Phase 0 step 5 from the prior gate. It is a DISJUNCT on this
   # guard, not a second block in front of it — two places assigning $DIFF_FILE is how one of them
   # silently stops mattering.
   if [ "$PRIOR_GATES" -ge 2 ] && [ -n "$LAST_GATE_DATE" ] && [ "$SAFETY_REPROBE" != "true" ]; then   # cycle 3+ — scope to files changed since last gate
     REFUTE_PASS=false
     FILES=$(git log --since="$LAST_GATE_DATE" --name-only --format="" | sort -u)
     [ -n "$FILES" ] && git diff "$BASE...HEAD" -- $FILES > "$DIFF_FILE"
   else                                                             # first review, cycle 2, or safety re-probe — whole branch diff
     [ "$PRIOR_GATES" = "1" ] && REFUTE_PASS=true || REFUTE_PASS=false
     git diff "$BASE...HEAD" > "$DIFF_FILE" 2>/dev/null || git diff "origin/develop...HEAD" > "$DIFF_FILE"
   fi
   ```

   `$TASK_DIR` is the task directory resolved in Phase 0. The narrowing is a cost control, and on
   cycle 2 it costs more than it saves: the files changed since the last gate are exactly cycle 1's
   own fixes, so a narrowed cycle-2 review reads only the repairs and never re-reads the original
   change with what cycle 1 learned. On one observed task, four narrowed re-reviews walked past a
   defect that had been present in the *original* commit and surfaced only at cycle 5.

2. **Dispatch a read-only Explore subagent** with the prompt from `references/code-review-prompt.md` (the single source of truth — pass it verbatim), substituting `<DIFF_FILE>` and `<WORKING_DIR>` (repo root). It returns a `code_review:` YAML findings block. Never read the raw diff into main context. In lite/direct-tools mode use one subagent; for large/high-risk tasks the Adaptive Review Strategy may run it alongside the other parallel agents.

   **Cycle 2 only (`REFUTE_PASS=true`) — refute, do not review.** Append this directive to the
   subagent prompt. It is the one pass in the loop performed by an agent that did not write the
   code and is not asked to agree with it:

   ```
   REFUTE PASS. This change set was written by the same pipeline that is now reviewing it, and
   cycle 1's fixes are the least-reviewed code in it. Your job is not to confirm the change works —
   it is to find the claim in it that is FALSE. Start with the fixes from the previous QA cycle:
   a fix is new code, not the closure of a finding.

   For every change that touches emission, subscription, caching or any lifecycle, probe these four
   transitions explicitly — they are the states the original findings never mentioned, and the
   steady-state suite structurally cannot see them:
     • Bulk teardown     — on unmount/disconnect/cleanup, does it emit, persist or announce
                           something it should not?
     • In-flight         — if input arrives WHILE the operation runs, is it applied, queued, or
                           silently dropped?
     • Error path        — when it fails, is state left recoverable, or stranded so retry is
                           impossible?
     • Reconnect         — after a drop and re-establish, does it converge, or resume from stale
                           state?

   Review the COMBINATION, not only each change: at least one real defect of this shape was caused
   by two earlier fixes that were each correct alone.
   ```

   This costs more than a narrowed cycle-2 pass and is expected to pay for itself, because the
   develop-task pipeline's convergence check ends the loop shortly after cycle 3 when it is not
   converging. The trade is **two deep cycles instead of five shallow ones**.

   **Safety re-probe (`SAFETY_REPROBE=true`) — search the surface, do not re-read the fixes.**
   Resolved in Phase 0 step 5 from the prior gate, per
   [`references/qa-re-review-scope.md`](references/qa-re-review-scope.md). It is
   **independent of `REFUTE_PASS`** — where both apply, append both directives, refute first.
   Append verbatim:

   ```
   SAFETY RE-PROBE. The previous gate failed on a safety axis. Do NOT scope your attention to the
   fixes: they are handled separately by the Re-Review Context table, and re-confirming them is not
   your job. Search the surface again as if for the first time — enumerate the boundary's inputs
   yourself and test them, rather than re-testing the inputs the previous cycle happened to name. A
   fix cycle changes the behaviour of code its own diff never touched, so a defect of the same class
   as the ones just closed is the expected finding, not a surprising one.
   ```

   Why both, rather than one flag: refuting the fixes and re-probing the surface have different
   targets. Collapsing them would make cycle 3+ lose the refute, or cycle 2 lose the re-probe.

3. **Record — always (advisory):** put every finding (bugs + cleanups, with `file:line`) into the QA report `## Code Review` section (Step 11) and the PR comment (Step 13).

4. **Gate mapping — resolve blocking, then map:** apply the **canonical resolution** from the **Opt-in to blocking** section of `references/code-review-prompt.md`. It combines a run-level override (from Skill `args`) with the task frontmatter flag; an explicit per-doc `false` is the escape hatch:

   ```bash
   # CR_OVERRIDE=true when the develop-task pipeline passed code_review_blocking=true in Skill args
   # (empty for standalone qa-task runs).
   CR_OVERRIDE=$([ "$CODE_REVIEW_BLOCKING_ARG" = "true" ] && echo true || echo "")
   DOC_FLAG=$(grep -E '^code_review_blocking:[[:space:]]*(true|false)\b' "$TASK_FILE" \
                | head -1 | grep -Eo '(true|false)' || true)
   if [ "$DOC_FLAG" = "false" ]; then CR_BLOCKING=false
   elif [ "$CR_OVERRIDE" = "true" ] || [ "$DOC_FLAG" = "true" ]; then CR_BLOCKING=true
   else CR_BLOCKING=false; fi
   ```

   `$CODE_REVIEW_BLOCKING_ARG` comes from the `code_review_blocking=` token in Skill `args` (see **Pipeline Skill args**). When `CR_BLOCKING=true`, append each finding that is `category: bug` AND `confidence: high` to the gate `top_issues[]` as `{ id, severity, file, finding, suggested_action, suggested_owner: dev }` — `file` is the path from the finding's own `file:line`, which every code-review finding already carries (Step 10's deterministic rules then decide). Otherwise — resolved advisory, or every cleanup or non-high-confidence finding — the gate is **unaffected**.

5. `rm -f "$DIFF_FILE"`.

This keeps the QA→qa-fix loop safe: only a high-confidence correctness bug triggers a fix cycle; cleanups and uncertain findings stay advisory. Under the develop-task pipeline (which sets the run-level override) this *is* the code-review-and-fix loop; standalone, behaviour is unchanged unless the task opts in via frontmatter.

### Step 3c: Mutation-Proof Spot Check

A green suite says the tests ran, not that they can fail. Before crediting a test
as coverage for a defect this cycle fixed, **revert the behaviour it names and
confirm that test goes red** — full procedure, the outcomes table, and the shapes
vacuity takes: [`references/mutation-proving.md`](references/mutation-proving.md).

Run it as the procedure says, not from memory — the steps below exist because a
QA cycle skipped them and wrote a false finding: **snapshot the file with `cp` and
restore from the snapshot** (never `git checkout --`, which restores committed
state and deletes the uncommitted fix with the mutant); **name the test you expect
to go red before running**; **assert the mutation applied** (a before/after count,
never a silent `|| true` on the edit); **baseline green between mutations**.

Scope it: not every assertion, but **every test guarding a fix made this cycle**,
plus any guard whose failure mode is silence.

Read each result against the outcomes table, not as red/green. A mutation that
reds nothing is a measurement of the tests, and the table's rows tell dead code
from a load-bearing branch no fixture reaches — the same reading, opposite
responses. A mutation that reds a *different* test than predicted is a finding
about the predicted test. A mutation that reds only because of today's corpus, or
only in an ad-hoc assertion that was never committed, is not coverage.

Record one line per proof in the QA report's Code Review section, carrying the
test that went red and the **outcome token** from the table —
`covered` · `wrong-test-red` · `mutation-void` · `no-red-dead` · `no-red-untested`
· `absorbed` · `not-run` · `data-dependent` · `dev-only`:

```markdown
mutation-proven: <what you reverted> → <test that went red> → <outcome>
```

**Only `covered` means covered**, and it means a *committed* test went red. A
criterion whose only evidence is a development-time mutation is `dev-only` — a
different claim from covered, and it must be written differently. A proof that
reached `covered` only after a fixture was added says so. Do **not** write "every
invariant mutation-proven" unless every one was actually reverted; if you proved
four of five, say four of five.

### Step 4: Run Tests

Execute all tests mentioned in the testing strategy:

```bash
# Run tests with coverage
npm exec nx test {project} -- --coverage

# Run build
npm exec nx build {project}

# Run linting
npm exec nx lint {project}

# Run integration tests if applicable
npm exec nx test {project} -- --testPathPattern=integration
```

**Document results:**
- Test pass rate (X/Y tests)
- Coverage percentages (Statements / Branches / Functions / Lines)
- Any test failures
- Build success/failure
- Lint errors

### Step 4b: Execute the Documented Commands

Applies only when this work item's deliverable is **runnable prose** — the diff adds or modifies a
`SKILL.md` or a `shared/resources/*.md` prompt containing at least one fenced ```bash block. The full
rule, including why the safety boundary is an allow-list rather than a deny-list, is stated once in
`references/qa-runnable-prose-detection.md`. Read it before changing anything here.

When the rule does not fire, record `Step 4b: not applicable — no runnable prose in the change set` in
the QA report's Review Methodology and move on. The step is cheap where it does not apply.

When it does fire, run the engine over each changed in-scope file:

```bash
node references/qa-execute-snippets.mjs --file "$SKILL_FILE" --json
```

Bind any caller values the documented snippets expect with repeated `--bind NAME=VALUE`, and seed the
temp working directory from a real directory with `--copy <dir>` so the blocks see real data rather than
an empty tree. Execution always happens in that temp copy — never the live tree.

**Document results:**
- Blocks found, and the count classified `runnable` / `placeholder` / `mutating`
- **Every skipped block, with its line number and reason.** A silent skip recreates the exact failure
  this step exists to prevent
- Which shells actually ran; note `zsh-unavailable` when the host has no zsh
- Each finding, mapped onto the existing `code_review` finding shape — `category: bug`, with
  `severity` and `confidence` from the rule's table (`high` for an execution failure, `medium` for a
  shell disagreement)

An execution failure is eligible for gate `top_issues[]` under `code_review_blocking` exactly like any
other `category: bug` finding. No new report or gate schema.

> **A run where zero blocks executed is never a pass — but it is two states, and the engine tells them
> apart for you.** Report whichever it emits; do not suppress either, and do not convert one into the
> other to quiet the report.
>
> - **`zero-blocks-executed`** (finding, `medium`) — fired when `placeholder > 0`. The run was
>   under-configured; `--bind` / `--copy` is the fix and the detail says so.
> - **`no-executable-blocks`** (information, in `notes[]`, exit `0`) — fired when `placeholder === 0`
>   and every block was refused as `mutating`. This file documents `gh` / `curl` / `rm` / write
>   redirections because that is what the skill *does*, and those are deny-listed by design. **No
>   configuration will ever make them runnable**, so there is nothing to act on. Record it and continue.
>
> An over-broad classification that skips everything is the silent-skip shape this step was built to
> eliminate, and it would be easy to reintroduce here — which is why the second case is still
> **recorded**, with a per-reason refusal breakdown, rather than dropped. Equally, reporting it as a
> finding is how the check became noise on six of ten skills surveyed: an ignored check is a check that
> does not exist (`bug.7`).
>
> `zsh` being absent is **not** either case — it never reduces the runnable count. Record it as
> information and continue.

**Lite mode**: the step still runs, but only over blocks in the changed file.

### Step 5: Verify Success Criteria

For each success criterion, compare target vs actual:

**Functional Criteria:**

| Criterion                   | Target | Actual | Status   | Notes |
| --------------------------- | ------ | ------ | -------- | ----- |
| All tests passing           | 100%   | 100%   | PASS     |       |
| No regressions              | 0      | 0      | PASS     |       |
| Breaking changes documented | Yes    | Yes    | PASS     |       |

**Performance Criteria:**

| Criterion         | Target        | Actual | Status | Notes |
| ----------------- | ------------- | ------ | ------ | ----- |
| Write performance | +20-30%       | +25%   | PASS   |       |
| Memory usage      | No leaks      | Clean  | PASS   |       |

**Code Quality Criteria:**

| Criterion              | Target   | Actual   | Status | Notes |
| ---------------------- | -------- | -------- | ------ | ----- |
| Test coverage          | 80%+     | 82%      | PASS   |       |
| Linting                | 0 errors | 0 errors | PASS   |       |
| TypeScript compilation | 0 errors | 0 errors | PASS   |       |
| Documentation          | Updated  | Complete | PASS   |       |

### Step 6: Validate Breaking Changes

For each breaking change documented in the task:

1. Verify it's documented with a migration path
2. Confirm migration path is complete and actionable
3. Verify consumer code is updated (if applicable)
4. Test migration if possible

**If migration path is missing or incomplete**: Create HIGH severity bug report and mark validation as FAIL.

**Breaking Change Assessment Template:**

```
### Breaking Change: {Title}
Documented: Yes / No
Migration Path Provided: Yes / No
Migration Tested: Yes / No
Consumer Code Updated: Yes / No / N/A
Notes: {Validation notes}
```

**Overall Breaking Changes Assessment:** PASS / CONCERNS / FAIL

### Step 7: Assess Non-Functional Requirements

Evaluate each NFR and assign PASS / CONCERNS / FAIL using the thresholds in the **NFR Evaluation Criteria** section below.

- **Performance**: Run performance tests; compare with baseline; check for regressions; validate resource usage
- **Reliability**: Test error handling; validate rollback plan; check recovery mechanisms
- **Security**: Review for security issues; check dependencies; validate auth/authorization preserved.
  Record **how** the verdict was reached in `nfr_validation.security.evidence` — `measured` only
  when hostile candidates were actually executed (and then `probes_executed` must be > 0),
  otherwise `reasoned`. A verdict reached by reading is `reasoned`, which is accurate rather than a
  failing grade. Values, the placement constraint and the fail-open rule for a missing key:
  [`references/qa-gate-security-evidence.md`](references/qa-gate-security-evidence.md).
  `/review-security` emits a liftable block carrying the same key names — consuming it is optional;
  this skill owns the field
- **Maintainability**: Review code clarity; check documentation; assess technical debt impact

For each NFR, document findings and assign a status in the **NFR Assessment** section of the QA report. Gate impact: any NFR FAIL → Gate = FAIL; any NFR CONCERNS → Gate = CONCERNS (minimum).

### Step 8: Regression Testing

Identify and test areas affected by changes:
- Components that depend on changed code
- APIs that were modified
- Related functionality

Run existing tests and check for unexpected behaviour in adjacent areas.

### Step 9: Document Issues

For each HIGH or MEDIUM severity issue found:
1. Create bug report: `task.{id}.bug.{number}.{descriptive-name}.md` (co-located in task directory)
2. Assign severity (HIGH/MEDIUM/LOW)
3. Link bug report in QA report

**LOW severity issues**: Document in QA report only — no separate bug file needed.

**Bug Report Structure:**

```markdown
# Bug Report: Task {ID} - {Bug Title}

**Task**: [Link](./task.{id}.{name}.md)
**Bug ID**: TASK-{id}-BUG-{number}
**Severity**: HIGH/MEDIUM/LOW
**Priority**: P0/P1/P2/P3
**Status**: New
**Found By**: QA Engineer
**Date Found**: {Date}

## Description
{Clear description of the issue}

## Steps to Reproduce
{If applicable}

## Expected Behavior
{What should happen}

## Actual Behavior
{What actually happens}

## Impact
{Impact on system/deployment}

## Recommendation
{How to fix}
```

### Step 10: Create Quality Gate File

> **`top_issues[]` holds THIS cycle's findings only.** Do not copy a previous cycle's entries
> forward, even annotated `status: closed`, and even though carrying the history reads as helpful.
> The develop pipeline's **third-strike rule** reads the `file:` of every HIGH entry across the last
> three gates and deliberately ignores `status: closed`, so a copied-forward HIGH makes one finding
> look like a file struck twice — and a third cycle then refuses to let `/qa-fix` patch a file that
> was never the problem. The history belongs in `bug_resolution`, in the QA report's Re-Review
> Context table, and in the bug reports.

Create gate file co-located with the task document:

**Location**: `{task-directory}/task.{id}.gate.{number}.{descriptive-name}.yml`

**Gate YAML Schema:**

```yaml
schema: 1
task: 'task.{id}.{name}'
task_title: '{task title}'
gate: PASS|CONCERNS|FAIL|WAIVED
status_reason: '1-2 sentence explanation of gate decision'
reviewer: 'QA Engineer'
updated: '{ISO-8601 timestamp}'

top_issues: [] # Empty if no issues; otherwise a list of entries shaped:
  # - id: '{PREFIX-###}'
  #   severity: low|medium|high
  #   file: '{repo-relative path the finding is IN}'   # REQUIRED — see note below
  #   finding: '{what is wrong}'
  #   suggested_action: '{the fix}'
  #   suggested_owner: dev|sm|po
  #   status: open|closed         # set closed when a later cycle resolves it
  #   fixed_date: '{YYYY-MM-DD}'  # with status: closed

waiver:
  active: false # Set true only for WAIVED, with reason and approver

quality_score: 95 # 100 - (20 × FAILs) - (10 × CONCERNS), bounded 0–100

evidence:
  tests_reviewed: { count }
  phases_verified: { X/Y }
  trace:
    phases_covered: [1, 2, 3]
    phases_with_issues: []

nfr_validation:
  security:
    status: PASS|CONCERNS|FAIL
    # `evidence:` goes BELOW `status:`, never between `security:` and `status:` —
    # the re-review probe reads the first `status:` after `security:` and fails
    # closed and silently if a key reaches that slot first. Values and the
    # probes_executed rule: references/qa-gate-security-evidence.md
    evidence: measured|reasoned|unverified
    probes_executed: 0 # REQUIRED when evidence: measured; `measured` with 0 is a schema error
    notes: 'Specific findings'
  performance:
    status: PASS|CONCERNS|FAIL
    notes: 'Specific findings'
  reliability:
    status: PASS|CONCERNS|FAIL
    notes: 'Specific findings'
  maintainability:
    status: PASS|CONCERNS|FAIL
    notes: 'Specific findings'

recommendations:
  immediate: # Blocking issues — must fix before merge
    - action: '{Description}'
      refs: ['{file.ts}']
  future: # Non-blocking — address later
    - action: '{Description}'
      refs: ['{file.ts}']

deployment_readiness:
  staging: APPROVED|CONDITIONAL|BLOCKED
  production: APPROVED|CONDITIONAL|BLOCKED
  conditions: [] # List conditions if CONDITIONAL
```

> **`file:` is required on every `top_issues[]` entry**, and it must be a repo-relative path that
> appears in the change set — not a description, not a module name, not `unknown`. The develop-task
> pipeline's **third-strike rule** reads it to detect a file that HIGH findings keep circling across
> cycles, and the rule works only because `file:` is checkable against the diff. A finding that
> genuinely spans several files names the one a fix would edit first. If a finding truly has no
> file (a missing artifact, a process gap), write the path it *should* exist at.

**Deterministic gate decision rules (apply in order):**

1. If any `top_issues.severity == high` → Gate = FAIL (unless waived)
2. Else if any `severity == medium` → Gate = CONCERNS
3. If any NFR status is FAIL → Gate = FAIL
4. Else if any NFR status is CONCERNS → Gate = CONCERNS
5. Else → Gate = PASS

**WAIVED** only when `waiver.active: true` with documented reason and approver.

> **Code-review findings (Step 3b):** by default these do NOT enter `top_issues` and do NOT affect the gate. Only when the task doc opts in via `code_review_blocking: true` in its frontmatter are `category: bug` + `confidence: high` findings appended to `top_issues[]` — at which point rules 1–2 above apply unchanged. Cleanups and non-high-confidence findings are always advisory.

### Step 11: Write QA Report

Create QA report co-located with the task document:

**Location**: `{task-directory}/task.{id}.qa.{number}.{descriptive-name}.md`

**QA Report Structure:**

```markdown
# QA Report: Task {ID} - {Title}

**Task**: [Link to task document](./task.{id}.{name}.md)
**Gate File**: [task.{id}.gate.{number}.{name}.yml](./task.{id}.gate.{number}.{name}.yml)
**QA Engineer**: QA Engineer
**Review Date**: {Date}
**Testing Completed**: {Date}
**Gate Status**: PASS/CONCERNS/FAIL

---

## Executive Summary

{2-3 sentence summary of testing scope and overall assessment}

**Overall Assessment**: {PASS/CONCERNS/FAIL}
**Deployment Recommendation**: {APPROVED/BLOCKED/CONDITIONAL}

---

## Testing Scope

### Prerequisites Verified

- [x] Task document exists and complete
- [x] All implementation phases completed
- [x] Tests passing
- [x] Breaking changes documented (if applicable)
- [x] Code on feature branch with open PR

### Testing Approach

- [ ] Manual Testing
- [ ] Automated Testing (unit, integration, e2e)
- [ ] Performance Testing
- [ ] Regression Testing
- [ ] Security Review
- [ ] Code Review

### Review Methodology

{Direct tools / parallel agents / hybrid — rationale}

**Re-reviews only — record the scope decision as one line**, per
[`references/qa-re-review-scope.md`](references/qa-re-review-scope.md):

```
Re-review scope: unscoped (prior gate failed on security)
Re-review scope: since {LAST_GATE_DATE} (default)
```

Naming the scope is what makes a quiet cycle auditable. Without it, "we found nothing" and "we did
not look" are the same sentence.

---

## New Findings This Cycle

_Re-reviews only. **Required even when empty** — `None` is an answer; an absent section is
indistinguishable from a cycle that never asked the question. The Re-Review Context table above
answers "were the previous findings fixed?"; this section answers "what else is there?"._

[for each new finding not present in the previous review:]

- **[{severity}]** `{file}:{line}` — {finding} → {suggested_action}

On an **unscoped** re-review reporting zero new findings, state what was searched — a bare `None` is
a defect in the report, not a clean result:

```markdown
None. Searched unscoped (prior gate: security FAIL): full `origin/develop...HEAD` diff, {N} files.
Re-enumerated {the boundary's inputs, named} and tested each against the current implementation.
```

---

## Implementation Verification

{Phase Completion Table — see Step 3}

---

## Success Criteria Verification

{Functional / Performance / Code Quality tables — see Step 5}

---

## Breaking Changes Validation

{Per-change validation — see Step 6}

---

## Issues Found

### HIGH Severity Issues ({X})

**Issue: {Title}**
- **Severity**: HIGH
- **Category**: Functional/Performance/Security/Quality
- **Bug Report**: [task.{id}.bug.{N}.{name}.md](./task.{id}.bug.{N}.{name}.md)
- **Observation**: {What was observed}
- **Impact**: {Impact on system/deployment}
- **Recommendation**: {How to fix}
- **Priority**: P0/P1

### MEDIUM Severity Issues ({X})
{Same structure as HIGH}

### LOW Severity Issues ({X})
{Description only — no separate bug file}

**Total Issues**: HIGH: X, MEDIUM: Y, LOW: Z

---

## NFR Assessment

### Performance — PASS/CONCERNS/FAIL
{Criteria evaluated, findings, recommendations}

### Reliability — PASS/CONCERNS/FAIL
{Criteria evaluated, findings, recommendations}

### Security — PASS/CONCERNS/FAIL

- **Status**: PASS/CONCERNS/FAIL
- **Evidence**: measured/reasoned/unverified — **how** the verdict was reached. `measured` only when
  hostile candidates were actually executed, and then **Probes executed** must be > 0; a verdict
  reached by reading is `reasoned`, which is accurate rather than a failing grade. Values and the
  placement constraint: [`references/qa-gate-security-evidence.md`](references/qa-gate-security-evidence.md)
- **Probes executed**: {count — required when Evidence is `measured`}
- {Criteria evaluated, findings, recommendations}

### Maintainability — PASS/CONCERNS/FAIL
{Criteria evaluated, findings, recommendations}

---

## Code Review

{From Step 3b — advisory unless the doc opted in via `code_review_blocking: true`. Omit the section if the diff had no reviewable code.}

**Correctness bugs ({count}):**
{for each bug finding:}
- [{severity}/{confidence}] `{file_line}` — {finding} → {suggested_action}

**Cleanups ({count}):**
{for each cleanup finding (reuse / simplification / efficiency):}
- `{file_line}` — {finding} → {suggested_action}

{If any finding was promoted to a gate `top_issues` entry (opt-in blocking), note its id here.}

---

## Regression Testing

{Test areas checked; PASS/CONCERNS/FAIL per area}

---

## Test Artifacts

### Files Reviewed
{List of key files reviewed}

### Test Commands Executed
```bash
{Commands used}
```

### Coverage Report
Statements: X% | Branches: Y% | Functions: Z% | Lines: W%

---

## Recommendations

### Immediate Actions (Blocking)
1. {Issue and priority}

### Short-term Actions (Non-Blocking)
1. {Improvement}

---

## Final Assessment

**Gate Status**: PASS / CONCERNS / FAIL / WAIVED
**Rationale**: {Explanation}
**Quality Score**: {score}/100

**Deployment Recommendation**: APPROVED / CONDITIONAL / BLOCKED
**Conditions** (if conditional): {List}

---

**QA Report**: co-located at `task.{id}.qa.{number}.{name}.md`
**Gate File**: co-located at `task.{id}.gate.{number}.{name}.yml`
**Next Steps**: {fixes / deployment / follow-up}
```

### Step 12: Update Task File

Add a QA Results section to the task document:

```markdown
## QA Testing Results

**QA Status**: PASS / CONCERNS / FAIL
**QA Engineer**: QA Engineer
**Testing Date**: {Date}
**Quality Score**: {score}/100
**Gate Decision**: PASS/CONCERNS/FAIL/WAIVED

### QA Report
- **Full Report**: [task.{id}.qa.{N}.{name}.md](./task.{id}.qa.{N}.{name}.md)
- **Gate File**: [task.{id}.gate.{N}.{name}.yml](./task.{id}.gate.{N}.{name}.yml)

### Test Coverage Summary
- **Tests Executed**: {count}
- **Phases Verified**: {X/Y}
- **Critical Issues**: {count}
- **NFR Status**: Security: {STATUS}, Performance: {STATUS}, Reliability: {STATUS}, Maintainability: {STATUS}

### Key Findings
{Brief summary, or "No critical issues identified"}
```

**Update task status based on gate decision:**
- PASS or CONCERNS → Status: "Completed" (with notes about concerns if applicable)
- FAIL → Status: "In Progress" (requires fixes before re-review)
- WAIVED → Status: "Completed" (with waiver notes)

**Append the verdict row to `## Change Log`** — in the same edit as the QA Results section and the
status update, bumping frontmatter `updated`:

```markdown
| 2026-05-14 |  | QA gate CONCERNS (6/10) — 2 findings | qa-task |
```

One row per QA cycle. `Version` stays blank — only `/finalise` bumps it. Name the decision, the
score and the finding count; the detail lives in the QA report the row links to. A clean cycle
still writes a row — the verdict is the event, not the findings. If the task predates the Change
Log template and has no such section, create it after `## 11. Rollback Plan` with the four
canonical columns. Canonical format:
[document-change-log.md](references/document-change-log.md).

**Never write the gate `.yml` from here** — it belongs to `qa-gate` alone, and `qa-gate` never
touches the document. See [`docs/reference/anti-patterns.md`](../../docs/reference/anti-patterns.md).

### Step 13: Post PR Comment — Best-effort, non-blocking

**PR-comment authorship contract**:

| Skill | Owns |
|---|---|
| `qa-task` | Per-cycle gate decision (best-effort, non-blocking) |
| `qa-fix` | Per-cycle fix summary (best-effort, non-blocking) |
| `finalise` | Canonical summary — PR + final gate + QA cycle count + DoD path + accepted status (idempotent via marker) |

**This step is best-effort.** If the comment cannot be posted (network error, auth issue), log the failure and continue — do not halt. The final canonical summary is posted by `/finalise` at pipeline end.

Use the PR metadata stored in the Prerequisites step.

**Resolve the platform first.** Source the resolver with `source references/resolve-platform.sh || exit 1` — guarded, because that file also validates the platform and access keys and returns non-zero on an unrecognised value. It sets `VCS` (which this step branches on) and provides `tracker_call_with_retry` (3× exponential backoff — handles transient GitHub/Anthropic API failures). On Bitbucket, derive the REST coordinates and resolve the credential — the same Step 0.5 preamble `create-pr` uses:

```bash
source references/resolve-platform.sh || exit 1
# VCS = github | bitbucket; TRACKER = jira | github

if [ "$VCS" = "bitbucket" ]; then
  # Two sed passes, not one lazy-quantified capture — `[^/]+?` is a GNU
  # extension that BSD sed rejects.
  BB_PATH=$(git remote get-url origin | sed -E 's|.*bitbucket\.org[:/]||; s|\.git$||')
  BB_WORKSPACE=$(echo "$BB_PATH" | cut -d'/' -f1)
  BB_REPO=$(echo "$BB_PATH" | cut -d'/' -f2)
  BB_API="https://api.bitbucket.org/2.0"
  # Sets BB_CURL_AUTH (curl args) and BB_AUTH_SCHEME; non-zero when neither an
  # access token (Bearer) nor username + API token (Basic) is set.
  source references/bitbucket-auth.sh || exit 1
fi
```

**Write the body to a file, then post it.** Always `--body-file`, never an inline `--body`: the body below carries backticks, `$(…)` and newlines, and an inline string invites the shell to evaluate them before `gh` ever sees them. The file is also what the Bitbucket arm reads.

```bash
mkdir -p .claude/state
BODY_FILE=.claude/state/qa-comment-body.md
cat > "$BODY_FILE" <<'EOF'
## QA Review: {GATE_DECISION}

**Gate Decision**: {PASS/CONCERNS/FAIL}
**Quality Score**: {score}/100
**Reviewer**: QA Engineer
**Date**: {date}
**PR**: #{PR_NUMBER} - {PR_TITLE}

---

### QA Artifacts

- **QA Report**: task.{id}.qa.{N}.{name}.md
- **Gate File**: task.{id}.gate.{N}.{name}.yml

### Summary

- **Tests Executed**: {count}
- **Phases Verified**: {X/Y}
- **NFR Status**: Security: {STATUS}, Performance: {STATUS}, Reliability: {STATUS}, Maintainability: {STATUS}
- **Issues Found**: HIGH: {X}, MEDIUM: {Y}, LOW: {Z}
- **Code Review** (Step 3b): {B} bug(s), {C} cleanup(s) — {advisory, or '{N} promoted to gate (code_review_blocking)'}

### Code Review Findings

{Top correctness bugs + notable cleanups from Step 3b, each `file:line — finding`. 'None identified' if empty. Advisory unless the doc opted in via code_review_blocking.}

### Critical Issues

{List critical issues, or 'None identified'}

### Deployment Recommendation

**Status**: {APPROVED/CONDITIONAL/BLOCKED}
**Conditions**: {Any conditions, or 'None'}

### Next Steps

1. {Step 1}
2. {Step 2}

---
EOF

# The plain-language lead, obtained ONCE and folded into $BODY_FILE — ABOVE the
# arm split below, so the GitHub and Bitbucket arms post the same bytes and
# cannot drift. `qa-gate` is the same stage the tracker comment for this moment
# uses; a pull-request comment about a moment that also exists on the tracker
# reuses that stage rather than inventing a second vocabulary.
#
# GATE_DECISION is bound HERE, deliberately. The heredoc above is quoted
# (`<<'EOF'`), so its [GATE_DECISION] placeholder is filled in textually when
# the body is written — it never becomes a shell variable. Set this to the same
# verdict you wrote into the body: PASS, CONCERNS, FAIL or WAIVED.
GATE_DECISION="{PASS|CONCERNS|FAIL|WAIVED — the same verdict written into the body above}"

# The verdict is MAPPED, never passed through: `CONCERNS` tells an outside reader
# nothing about whether to worry. Pass the raw token and let the catalogue map
# it — an unknown verdict renders "the results are recorded below" rather than
# defaulting to reassurance.
LEAD=$(node references/stakeholder-summary-cli.js --stage qa-gate \
  --slot verdict="$GATE_DECISION") || exit 1
printf '%s\n\n---\n\n%s\n' "$LEAD" "$(cat "$BODY_FILE")" > "${BODY_FILE}.tmp" \
  && mv "${BODY_FILE}.tmp" "$BODY_FILE"

if [ "$VCS" = "github" ]; then
  tracker_call_with_retry gh pr comment "$PR_URL" --body-file "$BODY_FILE"
  COMMENT_RC=$?
elif [ "$VCS" = "bitbucket" ]; then
  BB_COMMENT_PAYLOAD=$(jq -n --arg raw "$(cat "$BODY_FILE")" '{content: {raw: $raw}}')
  curl -sf -X POST \
    "${BB_CURL_AUTH[@]}" \
    -H "Content-Type: application/json" \
    "${BB_API}/repositories/${BB_WORKSPACE}/${BB_REPO}/pullrequests/${PR_NUMBER}/comments" \
    -d "$BB_COMMENT_PAYLOAD" >/dev/null
  COMMENT_RC=$?
fi

if [ "$COMMENT_RC" -ne 0 ]; then
  echo "⚠️ PR comment failed — non-blocking. Final canonical summary will be posted by /finalise."
fi
```

**The two arms are not symmetric on retry, deliberately.** `tracker_call_with_retry` wraps `gh`
only, so the GitHub arm retries 3× with exponential backoff and the **Bitbucket arm is single-shot**
— the same asymmetry `qa-fix` ships and states. A Bitbucket failure logs and continues. This is
acceptable here for the same reason the whole step is best-effort: the QA report and gate file are
committed to git and are the durable record; this comment is convenience. A
`bitbucket_call_with_retry` helper would close the gap across every Bitbucket call site in the repo
and is worth its own task — do not smuggle one in here.

**This comment is per-cycle and deliberately not idempotent.** Each QA cycle posts its own decision,
so the PR carries the history. Do **not** import `finalise`'s marker/update logic: `finalise` owns
the single canonical summary at pipeline end, and this step owns the running commentary. Only the
Bitbucket *transport* is borrowed from it.

### Step 13b: Comment on Tracker Issue (graceful — non-blocking)

Branch on the tracker resolved by `source references/resolve-platform.sh || exit 1` (which sets `TRACKER=github|jira`). Keep the `|| exit 1` — the resolver returns non-zero on an unrecognised `tracker:`, `vcs:` or `access:` value, and sourcing it bare would continue past the rejection with a default.

**One call, both trackers.** `tracker-comment.js` resolves `TRACKER` itself, so the issue identifier
is the only thing that differs between the two arms. Resolve it, then make the single call:

```bash
if [ "$TRACKER" = "jira" ]; then
  QA_ISSUE=$(grep -E '^jira_key:' "$TASK_FILE" | head -1 | sed -E 's/jira_key:[[:space:]]*//' | tr -d '"'"'"' ')
  [ "$QA_ISSUE" = "null" ] && QA_ISSUE=""
else
  QA_ISSUE="$GITHUB_ISSUE_QA"
fi
```

If `QA_ISSUE` is empty, skip this step silently — the task has no linked tracker issue.

```bash
if [ -n "$QA_ISSUE" ]; then
  mkdir -p .claude/state
  printf 'QA %s (%s/100) — PR #%s: %s\n' \
    "$GATE_DECISION" "$score" "$PR_NUMBER" "$PR_URL" > .claude/state/comment-body.md

  # blocking_count — the high-severity entries in the gate this run just wrote.
  # Re-resolve rather than reusing LATEST_GATE from Step 2: that one names the
  # PREVIOUS run's gate (read to decide whether to re-review), and this run has
  # written a newer one since.
  THIS_GATE=$(ls -t "$TASK_DIR"/task.*.gate.*.yml 2>/dev/null | head -1)
  # `|| true`, NOT `|| echo 0`. `grep -c` PRINTS "0" and EXITS 1 when it matches
  # nothing, so `|| echo 0` appends a second zero and the variable becomes the
  # two-line string "0\n0" — which the engine's numeric coercion then reads as
  # NaN and drops. The slot would vanish on exactly the clean gates where saying
  # "no blocking issues" matters most, and nothing would report it.
  BLOCKING_COUNT=$(grep -c '^ *severity: high' "$THIS_GATE" 2>/dev/null || true)
  BLOCKING_COUNT=${BLOCKING_COUNT:-0}

  node .agents/skills/qa-task/references/tracker-comment.js \
    --issue "$QA_ISSUE" --body-file .claude/state/comment-body.md \
    --stage qa-gate \
    --slot verdict="$GATE_DECISION" \
    --slot blocking_count="$BLOCKING_COUNT" \
    --json \
    || echo "⚠️  Tracker issue comment failed — continuing"
fi
```

> **This replaced a bare `gh issue comment` on the GitHub arm** — unmarked, so a resumed QA cycle
> posted a second copy, `gh`-only, so a Jira consumer never saw it, and after task.104 it would have
> been one of the last tracker comments in the pipeline with no plain-language lead. Collapsing the
> arms is what makes the same QA outcome read the same way on either tracker.
>
> **It also gave up the `tracker_call_with_retry` 3× backoff.** The engine owns the `ACCESS_TRACKER`
> deferral gate but has no retry of its own, and re-wrapping it would double-defer — so the retry is
> genuinely given up, and `|| echo … continuing` stands in its place, matching `review-task`.
>
> **`qa-gate` reads `verdict` and `blocking_count` — not `pr`.** `pr` is a real slot name on
> `in-review` and `done`, which is what makes it look right here; this template never reads it and the
> engine validates no slot names, so it would be silently dropped. The PR stays in the body.
>
> **`verdict` takes the raw gate token deliberately** — it is the one slot the engine *maps* rather
> than prints. The score stays out of the lead: a number on an unexplained scale is what the standard
> forbids.

> Engine source: `references/tracker-comment.js` (bundled into each skill as `references/tracker-comment.js`). Contract: `references/tracker-comment-contract.md`.


Read `reason` and act per [`references/tracker-comment-contract.md`](references/tracker-comment-contract.md) — only `no-credentials` may fall back to the Atlassian MCP tool.
3. On success: log `📨 QA summary posted to Jira issue ${JIRA_KEY}`.
4. On failure: log `⚠️ Jira comment failed for ${JIRA_KEY} — PR comment was posted successfully. Continuing.` (non-blocking — do not halt qa-task).

If `jira_key` is absent or null, skip silently. Failure does NOT halt the skill. Cross-reference: `qa-fix` and `finalise` post through the same `tracker-comment.js` call.

### Step 14: Communicate to User — CRITICAL / BLOCKING

**Always output a completion summary. Do not end the skill silently.** Required output:
- Gate decision and quality score
- Top issues summary (or "No issues found")
- Explicit next steps for the developer
- Paths to QA report and gate file

---

## Review Completion Checklist

**Tick off each item before marking the review done:**

- [ ] All prerequisite checks passed (PR exists, task ready for QA)
- [ ] Re-review logic executed (Phase 0 — skip or re-review decided)
- [ ] Task document read; success criteria extracted
- [ ] Tests executed and results documented
- [ ] All implementation phases verified
- [ ] Success criteria checked (functional, performance, code quality)
- [ ] Breaking changes validated (or marked N/A)
- [ ] NFRs assessed (Performance, Reliability, Security, Maintainability)
- [ ] Regression testing completed
- [ ] Bug report files created for all HIGH/MEDIUM issues (if any)
- [ ] QA report file created and saved (co-located with task)
- [ ] Gate YAML file created and saved (co-located with task)
- [ ] Task file `## QA Testing Results` section updated with gate status and artifact links
- [ ] Task status updated per gate decision
- [ ] PR comment posted via the `$VCS` arm (Step 13 — BLOCKING): on GitHub, `tracker_call_with_retry gh pr comment "$PR_URL" --body-file` — confirm exit code 0 after up to 3 attempts; on Bitbucket, the single-shot REST POST to `…/pullrequests/${PR_NUMBER}/comments` — confirm exit code 0 (no retry)
- [ ] Tracker Issue comment posted (Step 13b — graceful): `tracker-comment.js` invoked and its `reason` read (skipped if `github_issue` / `jira_key` absent or null); non-blocking on persistent failure
- [ ] User notified with gate decision, issues summary, and next steps (Step 14 — BLOCKING)

---

## Re-Review After Bug Fixes

When bug fixes are applied after a CONCERNS or FAIL gate, determine the appropriate review scope:

**Full re-review when:**
- Complex fixes with new functionality added
- Multiple iteration cycles (>2 fix attempts)
- Performance testing additions
- Stakeholder audit requirement

**Quick verification when:**
- Trivial fixes (<30 minutes, e.g. 1-line deletion, assertion update)
- Lint corrections (no logic changes)
- Simple test updates (updating assertions only)

**What gets updated after fixes:**

1. **Bug Reports** (updated during fix by developer): status New → In Progress → Ready for QA → Closed
2. **QA Report** (append a "Bug Resolution Summary" section after all bugs fixed):
   - List each bug fixed with verification result
   - Update gate status and deployment recommendation
3. **Gate YAML** (update in place — do not create a new file unless significant re-testing occurred):
   - Update `gate` field (e.g. CONCERNS → PASS)
   - Update `status_reason`
   - Update `updated` timestamp
   - Add `status: closed` and `fixed_date` to each resolved issue in `top_issues`
   - Update `quality_score`
   - Add `bug_resolution` section
4. **Task Document**: Update success criteria checkboxes if now met

**Example gate update after fixes:**

```yaml
gate: PASS  # Was: CONCERNS
status_reason: 'Bugs #1 and #2 fixed. Tests passing, lint clean.'
updated: '2026-03-20T14:30:00Z'

top_issues:
  - issue: 'Test expects removed tier'
    severity: medium
    file: 'libs/billing/src/tier.spec.ts'
    bug_ref: 'task.1.bug.1.test-failure.md'
    status: closed
    fixed_date: '2026-03-20'
    suggested_owner: dev

quality_score: 90  # Was: 70

bug_resolution:
  bugs_fixed: 2
  bugs_remaining: 0
  fix_date: '2026-03-20'
  total_iterations: 1
  verification_method: 'Automated tests + lint'
```

---

## Issue Severity Guidelines

### HIGH Severity

- Blocks deployment or causes system instability
- Breaking changes without migration path
- Critical tests failing
- Security vulnerabilities
- Data loss risk
- Performance regressions > 20%

### MEDIUM Severity

- Should be fixed before deployment but not blocking
- Impacts developer experience
- Non-critical test failures
- Performance concerns
- Code quality issues

### LOW Severity

- Nice to fix but not urgent
- Cosmetic issues
- Minor documentation gaps
- Code style inconsistencies

---

## NFR Evaluation Criteria

### Performance

| Assessment | Conditions |
|---|---|
| PASS | Meets or exceeds targets; no regressions in critical paths; resource usage acceptable |
| CONCERNS | Minor regressions (<10%); resource usage higher than expected; performance not fully tested |
| FAIL | Significant degradation (>20%); memory leaks; unacceptable resource consumption |

### Reliability

| Assessment | Conditions |
|---|---|
| PASS | Comprehensive error handling; graceful degradation; rollback plan validated |
| CONCERNS | Some error cases unhandled; rollback plan not fully tested |
| FAIL | Poor error handling; no rollback plan; system instability |

### Security

| Assessment | Conditions |
|---|---|
| PASS | No new vulnerabilities; security best practices followed; dependencies up to date |
| CONCERNS | Minor security concerns; some dependency vulnerabilities; security not fully tested |
| FAIL | Critical vulnerabilities; sensitive data exposed; authentication/authorization broken |

### Maintainability

| Assessment | Conditions |
|---|---|
| PASS | Code is clear and well-documented; tests comprehensive; technical debt reduced |
| CONCERNS | Some documentation gaps; test coverage below target; increased complexity |
| FAIL | Code unclear or unmaintainable; no tests; significant technical debt added |

---

## File Naming and Location

```
# Task Subdirectory — all QA artifacts co-located with task file
docs/tasks/task.1.cache-lib-simplification/
├── task.1.cache-lib-simplification.md          # Main task document
├── task.1.qa.1.cache-lib-simplification.md     # QA report (co-located)
├── task.1.gate.1.cache-lib-simplification.yml  # Gate file (co-located)
├── task.1.bug.1.memory-leak.md                 # Bug report 1 (co-located)
└── task.1.bug.2.test-failure.md                # Bug report 2 (co-located)
```

**CRITICAL: Gate files MUST be co-located with the task file in the same directory.** Do not store them in a separate `docs/qa/gates/` path.

**Legacy Note**: Old pattern of storing gates in `docs/qa/gates/tasks/` is deprecated. All new gate files must be co-located.

---

## Common Patterns

### Pattern 1: All Tests Passing, No Issues

**Gate Decision**: PASS — document successful completion; post PR comment with APPROVED recommendation.

### Pattern 2: Minor Issues Found

**Gate Decision**: CONCERNS — list conditions; set deployment as CONDITIONAL; communicate non-blocking issues.

### Pattern 3: Critical Issues Found

**Gate Decision**: FAIL — list blocking issues clearly; set deployment as BLOCKED; work with developer on fix plan.

### Pattern 4: Issues Acknowledged by Team

**Gate Decision**: WAIVED — document rationale, reason, and approver; set `waiver.active: true` in gate YAML.

---

## Integration with Development Workflow

### Developer → QA Handoff

**Developer Actions:**
1. Complete all implementation phases and mark checkboxes
2. Ensure tests passing
3. Update task status to "Ready for QA"
4. Ensure PR exists

**QA Actions:**
1. Run this skill
2. Post results to PR (Step 13)
3. Return to developer if FAIL; proceed to finalise if PASS/CONCERNS

### QA → Developer Handoff (Issues Found)

**QA Actions:**
1. Create bug reports for all HIGH/MEDIUM issues
2. Link bugs in QA report
3. Mark gate as FAIL or CONCERNS
4. Post PR comment (Step 13)

**Developer Actions:**
1. Review bug reports
2. Fix issues
3. Re-run qa-task (Phase 0 auto-detects re-review need)

---

## Additional Resources

- **Technical Task Skill**: `.agents/skills/create-task/SKILL.md`
- **QA Planning Skill**: `.agents/skills/qa-planning/SKILL.md`
- **QA Gate Skill**: `.agents/skills/qa-gate/SKILL.md`
- **Create Bug Report Skill**: `.agents/skills/create-bug-report/SKILL.md`
- **Fix QA Skill**: `.agents/skills/qa-fix/SKILL.md`

---

**Last Updated**: 2026-03-20
**Version**: 2.0
**Maintainer**: QA Team
