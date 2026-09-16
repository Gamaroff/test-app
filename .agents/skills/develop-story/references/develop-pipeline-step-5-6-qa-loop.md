---
name: develop-pipeline-step-5-6-qa-loop
description: Steps 5–6 (QA loop) shared by develop-story and develop-task. Covers QA cycle counter setup, gate file location, qa-story/qa-task invocation (with lite mode directive), PASS/CONCERNS/FAIL branching, **Step 5c (the PR conformance review, `/review-pr`) as the loop's exit gate and its APPROVE/CONCERNS/REQUEST CHANGES verdict routing**, no-code-change HALT, qa-fix invocation, the convergence check (HIGH-count stall guard) and third-strike replace-don't-patch rule, one-commit-one-push-per-cycle, escalation entry template, and the loop-limit / not-converging HALT messages. Story vs task variants called out where they differ (skill names, file patterns, gate sort field, commit message format, escalation text).
---
<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/develop-pipeline-step-5-6-qa-loop.md. Regenerate via `npm run bundle`. -->

# Develop Pipeline — Steps 5–6: QA Loop

## When This Document Applies

Loaded by `/develop-story` and `/develop-task` during Steps 5–6. Story/task variants are called out in labeled sub-sections where they differ.

---

## Loop Setup (shared)

This is the iterative heart of the pipeline. Maintain a **QA cycle counter** starting at 1. The loop limit is **5 complete cycles**.

**A clean gate does not exit the loop — it hands to 5c.** `PASS` or `WAIVED` from the QA review
means the work is ready to be *reviewed as a PR*, not that the loop is over. 5c
(`/review-pr`) is the loop's exit gate, and its verdict can send the run back to 5b.

There are **two ways the loop reaches Step 7**, and both go through 5c: a gate that reads clean
(`PASS` / `WAIVED`), and — from cycle 3 onward — the **Diminishing-returns exit**, which ends a loop
whose HIGH findings are gone and whose residue is entirely test machinery. The second is still an
exit *to 5c*, not around it: `APPROVE` or `CONCERNS` from 5c remains the only thing that opens
Step 7.

There are **two ways it escalates** instead: the 5-cycle limit, and — from cycle 3 onward — the
**Convergence check**, which halts the moment the loop stops reducing HIGH findings. The convergence
check usually fires first; see its section below. Both land in the same **Loop Escalation** block.

**The two cycle-3 rules are opposites and must not be confused.** The Convergence check fires when
HIGH findings *remain and stop falling* and it **escalates**; the Diminishing-returns exit fires when
HIGH findings are *gone* and it **exits cleanly**. One says the loop stopped working, the other says
it finished working.

Separately, several **HALT** paths end the run without reaching escalation: the no-code-change HALT
and the mid-loop PR MERGED/CLOSED HALT (both in 5b), the twice-red fast-gate bail-out (5b step 0a),
and a 5c review failure (see 5c's verdict table). These are terminal handovers to a person, not loop
exits, and they are listed where they occur rather than here.

#### develop-story

Each cycle = one `/qa-story` + one `/qa-fix`. A clean gate from `qa-story` hands to **5c**, which is what exits the loop.

#### develop-task

Each cycle = one `/qa-task` + one `/qa-fix`. A clean gate from `qa-task` hands to **5c**, which is what exits the loop.

### Signal the `in-qa` stage (when `TRACKER=jira` and `TRACKER_ISSUE` is set)

Run **once**, before the first cycle. Do **not** repeat this per cycle — the same rule the GitHub re-assertion below follows, for the same reason. (Re-running is harmless: the stage resolves to `already` and makes no network call. The reason to run once is that a per-cycle move says nothing a reader of the board cannot already see.)

```bash
node .agents/skills/{develop-story|develop-task|develop-bug}/references/jira-stage.js \
  --issue {TRACKER_ISSUE} --stage in-qa --json
```

`in-qa` is **off by default**. A project turns it on in its workflow record (`jira.workflowRecord`), per issue type — most boards have no testing column, and a stage that moved cards into one uninvited would be worse than one that does nothing. Expect `reason: "stage-disabled"` until a project opts in; that is a success, not a warning.

Log in Decisions Log: "Jira {TRACKER_ISSUE} — in-qa: {landed status / disabled / skip reason}."

### Re-assert board status at QA start (when `TRACKER=github` and `TRACKER_ISSUE` is set)

Belt-and-suspenders: run **once**, before the first cycle, to re-assert the `in-review` moment on entering QA. Step 4 (create-pr) already performs this move; this re-assertion corrects the board if that move was skipped (e.g. transient API error). Skip silently if `TRACKER` is not `github` or `TRACKER_ISSUE` is empty. Do **not** repeat this per cycle.

```bash
node .agents/skills/{develop-story|develop-task|develop-bug}/references/gh-stage.js \
  --issue {TRACKER_ISSUE} --stage in-review --json
```

Engine source: `references/gh-stage.js` (bundled into each skill as `references/gh-stage.js`).

Note the absence of `--allow-regress`, which is deliberate. **This re-assert is guarded.** A card someone has already advanced past review — to a showcase or merge column — will log `would-regress` and stay where it is. That is correct: the board is ahead of the pipeline, not behind it. Pass `--allow-regress` only for a deliberate reset.

A card already sitting on the review column returns `reason: "already"` and the CLI makes no mutation, so no hand-rolled "is it already there?" check is needed.

Log in Decisions Log: "GitHub board: QA-start re-assert → {landed / already / would-regress / no-option / skipped}."

---

## Finding the Latest Gate File

Use a format-agnostic regex to extract the numeric `{N}` from each filename, sort numerically, and pick the highest. Robust to story/task names that contain dots.

#### develop-story

```bash
ls {story-directory}/story.{epic}.{story}.gate.*.yml 2>/dev/null \
  | awk -F'gate\\.' '{ split($2, a, "."); printf "%d\t%s\n", a[1], $0 }' \
  | sort -k1,1 -n | tail -1 | cut -f2-
```

#### develop-task

```bash
ls {task-directory}/task.{id}.gate.*.yml 2>/dev/null \
  | awk -F'gate\\.' '{ split($2, a, "."); printf "%d\t%s\n", a[1], $0 }' \
  | sort -k1,1 -n | tail -1 | cut -f2-
```

The gate file pattern is `…gate.{N}.{name}.yml` — the awk splits on `gate.`, takes the first `.`-delimited token from the right side as `{N}`. Names containing dots (e.g. `auth.v2`) no longer affect ordering.

**Note (tasks only)**: The legacy path `docs/qa/gates/tasks/` is deprecated. qa-task v2.0 co-locates gate files in the task directory alongside the task document.

Read the gate file to determine the gate result.

---

## Each Cycle

### 5a. Run QA Review

> **When the work item's deliverable is runnable prose, the QA skill executes it.** A change set that
> adds or modifies a `SKILL.md` or a `shared/resources/*.md` prompt containing fenced ```bash blocks
> triggers an execution step inside the QA skill — `qa-task` **Step 4b**, `qa-story` **Phase 1.7** —
> which runs the documented snippets under both `bash` and `zsh` and reports disagreements.
>
> The rule lives in one place: `references/qa-runnable-prose-detection.md`. It is **not** restated
> here, and this orchestrator does nothing to trigger it — the QA skills own both the detection and the
> execution. This note exists so a reader of the pipeline knows the step is there, and knows where the
> rule is when a QA cycle reports a shell disagreement.


#### develop-story

**Pre-step: Dispatch traceability mapper (standard mode only)**

Before invoking `/qa-story`, dispatch the QA traceability mapper as an Explore subagent (see `references/qa-traceability-mapper-prompt.md` for the full execution protocol):

```
Agent(subagent_type="Explore", prompt="Run the QA traceability mapper (references/qa-traceability-mapper-prompt.md).
Inputs:
  STORY_FILE={story-file}
  STORY_DIR={story-directory}

Follow the Execution Protocol exactly. Write the matrix file and return a one-line confirmation.")
```

`{story-file}` and `{story-directory}` are the story file path and story directory path resolved in Phase 0a.

After the subagent completes:

1. Confirm `{story-directory}/.summaries/qa-traceability-matrix.md` was written.
2. Write the summary JSON artifact to `{story-directory}/.summaries/step-5-traceability-mapper.json` (schema: `references/subagent-summary-artifact.md`).
3. Update the Pipeline Progress `Subagent summary ref` column for Step 5–6 with the JSON path.

If the subagent fails or the matrix file is absent: log warning in Issues Log and proceed without the matrix (qa-story falls back to internal mapping).

Skip this pre-step when any of:

- `PIPELINE_MODE=lite` — the mapper adds overhead that lite mode trades away.
- Story has **no Acceptance Criteria section** (`grep -ciE '^##+ +acceptance criteria' {story-file}` returns 0). Nothing to map.
- Story has **≤ 2 ACs** (count `^- ` or `^[0-9]+\.` lines under the AC heading). The mapper's overhead exceeds its value at this size; qa-story's internal mapping is sufficient.

Log the bypass reason in the Decisions Log (`Traceability mapper skipped: {reason}`).

**Invoke `/qa-story`**

Invoke the `/qa-story` skill with the story file path. If `PIPELINE_MODE=lite`, prefix the invocation with explicit context: "Use **direct tools only** for this review — skip parallel agents regardless of the adaptive strategy decision. This story is running in lite mode."

**Code-review-and-fix loop (pipeline default).** Always pass the run-level override `code_review_blocking=true`. This makes the diff code review qa-story already runs (Phase 1.6) gate the build on high-confidence correctness bugs, which then flow into this loop's qa-fix step (5b) and get fixed and re-reviewed each cycle. A story opts **out** with `code_review_blocking: false` in its frontmatter (escape hatch) — the override never overrides an explicit `false`. See the **Opt-in to blocking** resolution matrix in `references/code-review-prompt.md`.

Pass args as space-separated `key=value` tokens. When the traceability matrix was generated:

```
Skill(qa-story, args="traceability_matrix={story-directory}/.summaries/qa-traceability-matrix.md code_review_blocking=true")
```

If the matrix was not generated (lite mode or mapper failure), omit only the `traceability_matrix` token — still pass `code_review_blocking=true` so the code-review-and-fix loop stays active:

```
Skill(qa-story, args="code_review_blocking=true")
```

#### develop-task

**Pre-step: Dispatch traceability mapper (standard mode + Success Criteria table only)**

Conditions to dispatch the mapper for tasks (all must be true):

1. `PIPELINE_MODE = standard` (lite mode skips the mapper)
2. `HAS_SUCCESS_CRITERIA_TABLE = true` (set by Phase 0a Agent 3 — the lite-mode/always-load detector)

If both are true, dispatch the mapper as an Explore subagent — same prompt as develop-story, but pass the **task** file/directory as the values for `STORY_FILE`/`STORY_DIR` (the mapper accepts both doc types — see `qa-traceability-mapper-prompt.md` "Doc type" note):

```
Agent(subagent_type="Explore", prompt="Run the QA traceability mapper (references/qa-traceability-mapper-prompt.md).
Inputs:
  STORY_FILE={task-file}
  STORY_DIR={task-directory}

Follow the Execution Protocol exactly. Write the matrix file and return a one-line confirmation.")
```

After the subagent completes:

1. Confirm `{task-directory}/.summaries/qa-traceability-matrix.md` was written.
2. Write the summary JSON artifact to `{task-directory}/.summaries/step-5-traceability-mapper.json` (schema: `references/subagent-summary-artifact.md`).
3. Update the Pipeline Progress `Subagent summary ref` column for Step 5–6 with the JSON path.

If the subagent fails or the matrix file is absent: log warning in Issues Log and proceed without the matrix (qa-task falls back to its internal mapping).

Skip this pre-step when `PIPELINE_MODE=lite` OR `HAS_SUCCESS_CRITERIA_TABLE=false`. Tasks with no Success Criteria table (e.g. pure infra cleanup) gain nothing from the mapper.

**Invoke `/qa-task`**

Invoke the `/qa-task` skill with the task file path. If `PIPELINE_MODE=lite`, prefix the invocation with explicit context: "Use **direct tools only** for this review — skip parallel agents regardless of the adaptive strategy decision. This task is running in lite mode."

**Code-review-and-fix loop (pipeline default).** Always pass the run-level override `code_review_blocking=true`. This makes the diff code review qa-task already runs (Step 3b) gate the build on high-confidence correctness bugs, which then flow into this loop's qa-fix step (5b) and get fixed and re-reviewed each cycle. A task opts **out** with `code_review_blocking: false` in its frontmatter (escape hatch) — the override never overrides an explicit `false`. See the **Opt-in to blocking** resolution matrix in `references/code-review-prompt.md`.

Pass args as space-separated `key=value` tokens. When the traceability matrix was generated:

```
Skill(qa-task, args="traceability_matrix={task-directory}/.summaries/qa-traceability-matrix.md code_review_blocking=true")
```

If the matrix was not generated (lite mode, no Success Criteria table, or mapper failure), omit only the `traceability_matrix` token — still pass `code_review_blocking=true` so the code-review-and-fix loop stays active:

```
Skill(qa-task, args="code_review_blocking=true")
```

### Change Log (shared — who writes what)

Two skills write rows across this loop, and **this step document writes none**. It states the
contract; the skills perform the writes. Canonical format:
[document-change-log.md](https://github.com/Gamaroff/agent-skills/blob/develop/shared/resources/document-change-log.md).

| Writer     | When                          | Row                                                     |
| ---------- | ----------------------------- | ------------------------------------------------------- |
| `qa-story` / `qa-task` | each QA cycle, alongside its QA Results section | `\| 2026-05-14 \|  \| QA gate CONCERNS (6/10) — 2 findings \| qa-story \|` |
| `qa-fix`   | on **exiting** the fix loop   | `\| 2026-05-14 \|  \| QA findings fixed — gate PASS (9/10), 2 iterations \| qa-fix \|` |

Three rules make this loop's history readable rather than a churn log:

- **`Version` stays blank.** Only `/finalise` bumps it, at acceptance.
- **`qa-fix` writes once per loop exit, not once per finding or per cycle.** Put the iteration
  count in the Description. The per-cycle detail already lives in the QA Iteration History section
  of the implementation report, which is its proper home.
- **`qa-gate` writes nothing to the document — ever.** It owns the `.yml` and only the `.yml`.
  The verdict row is written by `qa-story` / `qa-task`, which already own document sections. See
  [`docs/reference/anti-patterns.md`](https://github.com/Gamaroff/agent-skills/blob/develop/docs/reference/anti-patterns.md).

A QA cycle that finds nothing still writes its verdict row: the verdict is the event being
recorded, not the findings.

### Outcome branching (shared)

After completion, find and read the latest gate file:

- `PASS` with no `top_issues` → **proceed to 5c** (the loop's exit gate), not straight to Step 7
- `WAIVED` with `waiver.active: true` and a documented reason/approver → **proceed to 5c** (finalise treats `WAIVED` as accept-eligible; re-running qa-fix would churn against an intentionally-waived gate)
- `CONCERNS`, `FAIL`, or has `top_issues` → run the **Convergence check** (below); if it does not
  trip, run the **Diminishing-returns exit** (below that). Proceed to 5b only when neither fires —
  the Convergence check escalates, the Diminishing-returns exit hands to 5c.

**On either gate that reaches 5c**, commit this cycle's gate `.yml` and QA report `.md` and push once
before invoking `/review-pr` — there is no `fix(...)` commit on this path to carry them, and 5c reads
the artifact trail off the branch. See **Where the gate and QA report get committed** in 5b.

> **A clean gate no longer exits the loop on its own.** It hands to **5c**, which runs
> `/review-pr` over the open PR and is the only thing that can exit to Step 7. The
> `ready-for-merge` stage moved there with it: signalling merge-readiness the moment the gate
> read PASS advertised a card as mergeable while the run could still loop back into `/qa-fix`.

Log the result in the QA Iteration History section:

```
### QA Cycle {N} — {YYYY-MM-DD}
**Gate Result**: {PASS / CONCERNS / FAIL / WAIVED}
**Issues Found**: {count and brief descriptions, or "none"}
**HIGH findings**: {HIGH_N}
**PR Review**: {pending — 5c not yet run / APPROVE / CONCERNS / REQUEST CHANGES / review failed / not reached — gate did not exit the loop}
**Loop exit**: {n/a — this exit not taken / the `describeDiminishingReturns()` message verbatim}
**Action**: {Proceeding to 5c (PR conformance review) / Running qa-fix (cycle N of 5) / Proceeding to finalise / Escalating — loop not converging}
```

The `**HIGH findings**` line is not decoration: it is the persisted sequence the **Convergence
check** below compares across cycles, and the only place a resumed run can read the earlier counts
back from. Write it on every cycle, including one that found none (`0`).

`**PR Review**` follows the same rule for the same reason, but note **who writes it and when**: 5a
writes the row when it writes the entry, and at that moment no 5c verdict exists. On a clean gate 5a
writes `pending — 5c not yet run`, and **5c overwrites it** with its verdict. A cycle whose gate never
reached 5c keeps `not reached — gate did not exit the loop`. It is never omitted. An omitted row is
indistinguishable from a review that was skipped, and on resume the two must not be confused.

`**Loop exit**` is the **Diminishing-returns exit**'s record, and it exists for one reader: whoever
opens this history six months from now and has to tell a clean early exit from a stall. On every
cycle that did not take that exit it reads `n/a — this exit not taken`, which is a claim rather than
a gap. On the cycle that did, write `describeDiminishingReturns(r)` **verbatim** — the message is a
function precisely so that what lands here is assertable rather than composed afresh each time.

> **The default says "this exit not taken", not "loop continued".** Those are different claims, and
> the second is false on the cycle where a clean `PASS` gate hands to 5c and 5c returns APPROVE: the
> loop did not continue there, it exited by the ordinary route. A row whose whole purpose is letting a
> reader distinguish two exits must not itself assert something untrue about one of them.

**Post QA cycle result to tracker issue** (non-blocking — skip if `TRACKER_ISSUE` is empty):

```bash
mkdir -p .claude/state
cat > .claude/state/comment-body.md <<'EOF'
## 🔍 QA Cycle {N} — Gate: {PASS / CONCERNS / FAIL}

**Issues found**: {count, or 'none'}
{top 3 issues from gate file top_issues list, or 'No issues — proceeding to the PR conformance review (Step 5c)'}
**Action**: {Proceeding to 5c (PR conformance review) / Running qa-fix (cycle {N} of 5)}
EOF

node .agents/skills/{develop-story|develop-task|develop-bug}/references/tracker-comment.js \
  --issue {TRACKER_ISSUE} --body-file .claude/state/comment-body.md \
  --stage qa-cycle-{N} \
  --slot verdict="{PASS / CONCERNS / FAIL / WAIVED}" \
  --slot cycle="{N}" \
  --json
```

> **`qa-cycle` reads exactly two slots: `verdict` and `cycle`.** It does **not** read `count` — that
> slot belongs to `develop-complete`, and passing it here is silently dropped.
>
> `verdict` is the one slot that is **mapped rather than printed**: the engine turns `PASS` /
> `CONCERNS` / `FAIL` / `WAIVED` into a plain sentence, because nothing about the word "CONCERNS" tells
> an outside reader whether to worry. Pass the **raw gate token** here — this is the one place a raw
> token is correct, because the mapping exists. An unrecognised verdict renders "The results are
> recorded below" rather than defaulting to reassurance, so a typo degrades safely.
>
> `cycle` is numeric and positive-integer-only; it is the same `{N}` already in the stage suffix.

> Engine source: `references/tracker-comment.js` (bundled into each skill as `references/tracker-comment.js`). Contract: `references/tracker-comment-contract.md`.


Read `reason` and act per the table in [`references/tracker-comment-contract.md`](tracker-comment-contract.md) — `posted`/`already`/`deferred` need nothing, `unverifiable` is logged and never posted over, and `no-credentials` is the one case that may fall back to MCP.

On failure: log warning in Issues Log and continue. Log in Decisions Log: "QA cycle {N} result comment posted to {TRACKER} issue {TRACKER_ISSUE}."

**Remaining Work Status block (required, per cycle).** Before re-invoking the QA skill for the next cycle, emit the block with the position line `Steps 5–6/8 — QA LOOP ⏳ in progress, cycle {N}/5`. On the cycle that exits the loop, the block is emitted as part of the Step 7 transition instead, in the form 5c specifies (`Steps 5–6/8 — QA LOOP ✅ complete ({N} cycles, {gate}, PR review {verdict})`). Format: [`references/develop-pipeline-remaining-work-banner.md`](develop-pipeline-remaining-work-banner.md).

A cycle that reaches 5c emits **two further blocks**, both instructed in 5c below: one immediately
before `/review-pr`, and one on the REQUEST CHANGES arm before re-entering 5b. Ownership of the
Steps 5–6 progress blocks is therefore: this paragraph owns the per-cycle one, **5c owns those
two**, and the Step 7 transition owns the exit one. The banner's **HALT** row is additional to all
of them and fires wherever these steps halt — 5c's `review failed` arm, 5b's step-0 no-change HALT,
and Loop Escalation included. Do not read the progress blocks as an exhaustive list of the blocks
Steps 5–6 emit.

### Convergence check (shared) — the QA loop's stall guard

Perform this check **after the cycle's gate file has been written and read (5a), before entering
5b**. A gate that hands to 5c (`PASS` / `WAIVED`) skips it — the gate is accept-eligible, so there is
nothing for a stall guard to act on. (Note this is *not* because the HIGH count is zero: a `WAIVED`
gate carries its HIGH `top_issues[]` with `waiver.active: true`, so that cycle's
`**HIGH findings**` line is still a real, usually non-zero, count.)

> **A `REQUEST CHANGES` re-entry into 5b is deliberately not convergence-checked.** The guard measures
> whether the *gate's* HIGH count is still falling, and a review-driven cycle produces no gate reading
> to compare. The 5-cycle limit is what bounds that path — which is why 5c consumes cycles from the
> shared budget rather than running outside it. There is no separate cycle entry to write: because 5c
> defers the increment to 5b step 7, the review-driven fix rides **inside cycle N**, whose
> `### QA Cycle {N}` entry already carries the real `**HIGH findings**` count from that cycle's gate.
> Leave it as written — do not overwrite a real reading with `n/a`.

The Step 3 develop loop halts when it stops making progress (`develop-pipeline-resume-contract.md`
→ **Develop Loop — Stall Semantics and MAX_ITER Bound**). This is the same guard for the QA loop,
and it reads the same way on purpose: define progress, and halt when a cycle produces none. Without
it the QA loop always runs its full five cycles. One observed task produced HIGH counts of
`7, 7, 7, 7, 4` across five gates — four consecutive cycles that reduced nothing — and nothing in
the pipeline noticed.

1. **Count the HIGH findings the latest gate raised.** Count every entry in `top_issues[]` whose
   `severity` is `high`. Call it `HIGH_N`.

   ```bash
   HIGH_N=$(awk '
     /^top_issues:/         { ti=1; next }
     ti && /^[^[:space:]#]/ { ti=0 }
     !ti                    { next }
     { ind = match($0, /[^ ]/) - 1 }
     /^[[:space:]]*-[[:space:]]/ {
       if (!seen) { base = ind; seen = 1 }        # first entry sets the entry indent
       if (ind == base) { n += hi; hi = 0 }       # a dash at that indent starts a new entry
     }
     seen && (ind == base + 2 || ind == base) && /severity:[[:space:]]*["'"'"']?high/ { hi = 1 }
     END { n += hi; print n+0 }
   ' "$LATEST_GATE")
   ```

   **Count what the gate raised, not what is still open — do not exclude `status: closed`.** The
   QA skills update a gate *in place* after its cycle's fixes land, stamping `status: closed` and
   `fixed_date` on each resolved entry. Every mature gate therefore has most of its HIGH entries
   closed, and a counter that skips them reads `0` on all of them, compares `0 >= 0 >= 0`, and
   trips on cycle 3 of every run — or, read the other way, measures nothing at all. Verified
   against five real gates: the raised counts are `7, 7, 7, 7, 4` while the closed-excluded counts
   are `7, 0, 0, 0, 0`. `HIGH_N` is the review's verdict at the moment it was written, which is the
   only reading that makes the sequence comparable across cycles.

   **Both indent rules are load-bearing, and each closes a way the simpler versions were fooled.**
   Gate entries carry multi-line `finding: >-` block scalars, so (a) a wrapped line beginning with
   `- ` splits one entry into two unless entry boundaries are pinned to the *first* entry's indent,
   and (b) a `severity: high` written inside that prose is counted as a finding unless `severity:`
   is required at the entry's own key indent (`base + 2`, or `base` for the inline
   `- {severity: high}` form). Scoping to the `top_issues:` block additionally keeps a top-level or
   sibling key from inflating the count. The pattern deliberately carries **no `\b` word
   boundary** — that is a GNU extension, and the one-true-`awk` shipped on macOS silently matches
   nothing with it, which would report every gate as `HIGH_N=0` and disarm this guard without ever
   failing. Verified under both `bash` and `zsh` against the five real gate files of the observed
   task (`7, 7, 7, 7, 4`) and against a fixture carrying every decoy above.

2. **Keep the sequence across cycles.** Record `HIGH_N` in this cycle's QA Iteration History entry
   as `**HIGH findings**: {HIGH_N}` — that entry is what a resume reads the earlier counts back
   out of, and what the escalation entry tabulates.

3. **From cycle 3 onward, if `HIGH_N >= HIGH_{N-1}` AND `HIGH_{N-1} >= HIGH_{N-2}` — i.e. the HIGH
   count has failed to strictly decrease across two consecutive cycles — the loop is not
   converging. Stop and escalate.** Do not run 5b. Go to **Loop Escalation** below and use the
   *QA Loop Not Converging* variant.

   Cycles 1 and 2 never trip it: the rule needs three readings to see a flat line, and a single
   flat cycle is normal.

   On the observed `7, 7, 7, 7, 4` sequence this trips at the end of cycle 3 — `7 >= 7` and
   `7 >= 7` — cutting three futile cycles.

**Escalate; do not silently accept.** The remaining HIGH findings are not noise to be dropped
because the loop got tired of them. On the observed task a genuine defect in the *shipped* artifact
surfaced only at cycle 5, and it had been present in the original commit; any rule that quietly
exits early loses it. Escalation hands the residual to a person **together with the evidence that
the loop had stopped working**, which is the project's Fail Loudly rule and the entire point of
this check. A convergence stall is never a reason to write a PASS, to waive, or to proceed to
Step 7.

### Diminishing-returns exit (shared) — the QA loop's clean early exit

Perform this check **after** the Convergence check above, in the same place: the cycle's gate has
been written and read (5a), and 5b has not been entered. It runs **only when the Convergence check
did not trip**, and only from **cycle 3 onward**.

The two guards answer opposite questions and must never both claim the same run:

| | Convergence check (above) | Diminishing-returns exit (here) |
| :-- | :--- | :--- |
| Fires when | HIGH findings **remain and stop falling** | HIGH findings are **gone**, and the residue is machinery |
| Outcome | **Escalate** — the loop stopped working | **Exit cleanly** — the loop finished working |
| Because | a real blocker is unfixed | nothing is blocked; further cycles refine the pins |

Escalating a run with zero HIGH would misreport finished work as stalled, and the Fail Loudly rule
cuts the other way here: what is loud is the *record*, not the halt.

**The conditions.** Ask the engine; do not evaluate them by eye. Its four inputs are bound as follows
— an orchestrator that cannot resolve one of them has not met the precondition for running the check
at all, and should continue into 5b rather than guess:

| Variable | Where it comes from |
| :--- | :--- |
| `$CYCLE` | the QA cycle counter from **Loop Setup** — the cycle whose gate was just written |
| `$HIGH_SEQUENCE_JSON` | the `**HIGH findings**` rows of the `### QA Cycle {N}` entries in QA Iteration History, oldest first, as a JSON array. This is the Convergence check's own recorded sequence; do **not** recount it from the gates |
| `$LATEST_GATE` | the gate path resolved in **Loop Setup** (`…gate.{N}.{name}.yml`, highest `{N}`) |
| `$TEST_ARTIFACT_GLOBS_JSON` | `qa.testArtifactGlobs` from the consumer's `skills-config.yaml`, as a JSON array. **Absent ⇒ `[]`**, which matches nothing and is why an unconfigured project never takes this exit |

```bash
command node -e '
  const fs = require("fs");
  const { classifyDiminishingReturns, describeDiminishingReturns } =
    require("./.agents/skills/{develop-story|develop-task}/references/qa-diminishing-returns.js");
  const r = classifyDiminishingReturns({
    cycle:              Number(process.argv[1]),
    highCounts:         JSON.parse(process.argv[2]),
    latestGateContent:  fs.readFileSync(process.argv[3], "utf8"),
    testArtifactGlobs:  JSON.parse(process.argv[4]),
  });
  console.log(JSON.stringify({ ...r, message: describeDiminishingReturns(r) }));
' "$CYCLE" "$HIGH_SEQUENCE_JSON" "$LATEST_GATE" "$TEST_ARTIFACT_GLOBS_JSON"
```

Engine source: `references/qa-diminishing-returns.js` (bundled into each skill as
`references/qa-diminishing-returns.js`). It is a **library, not a CLI** — deliberately, on the same
reasoning as `review-report-freshness.js`: its only caller is this gate, and a CLI would be a second
interface to keep honest.

It returns `{verdict, reason, detail, findings}` with `verdict ∈ {exit, continue}`. **Only `exit`
exits.** Every other answer continues into 5b exactly as today.

What it evaluates, stated so the JSON's `reason` values are readable:

1. `HIGH_N == 0` **and** `HIGH_{N-1} == 0` — two consecutive gates with no blocker. **`HIGH_N` is
   the number the Convergence check already computed**, passed in from this cycle's and the previous
   cycle's `**HIGH findings**` lines in QA Iteration History. It is not recounted here: a second
   implementation of one count drifts silently, and the two guards would then disagree about the same
   run while each looked right alone. One quiet cycle is normal and is not enough.
2. **Every** `top_issues[]` entry in the latest gate names a `file:` that matches
   `qa.testArtifactGlobs`. A finding with **no** `file:`, or one the globs do not match, **fails**
   the condition — the exit is opt-in on positive evidence, never on absence. This is the same
   `file:` the third-strike rule already depends on.
3. No positive signal that product behaviour is implicated: every `nfr_validation.*.status` reads
   `PASS`, and no entry declares `category: bug` against a non-machinery path. Condition 3 reads a
   **different part of the gate** from condition 2, and that independence is the point — it is what
   catches a product defect filed against the test that found it.

> **Condition 3 and the `category:` field.** No gate in this corpus carries `category:` — real
> entries carry `id`, `severity`, `file`, `finding`, `suggested_action`, `suggested_owner`, `status`.
> A rule requiring a field nothing emits would be unreachable, which is not conservative but dead,
> and indistinguishable from broken. So `nfr_validation` carries condition 3 today and `category:` is
> honoured as an optional refinement for the day a QA skill starts emitting it.
>
> Note the asymmetry with condition 2, which is deliberate: condition 2 wants positive evidence that
> every finding **is** machinery, so absence fails it; condition 3 asks whether any finding **is** a
> product defect, so only positive evidence fails it. Demanding proof of a negative there would make
> every gate fail, which is the dead rule again.

**A gate with no findings at all does not take this exit.** Condition 2 is vacuously true of an empty
`top_issues[]`, and a rule that fires on vacuous truth fires hardest exactly when its reader is
broken. A clean gate is a clean gate: it leaves through 5c on the ordinary `PASS` path.

**`qa.testArtifactGlobs` defaults to `[]`**, which matches nothing, so a consumer who has not
configured it keeps today's behaviour exactly. That is the fail-safe direction expressed as the
default rather than as an opt-out. See [`configuration.md`](https://github.com/Gamaroff/agent-skills/blob/develop/docs/reference/configuration.md).

#### On exit

1. **Do not run 5b.**
2. **Hand to 5c**, exactly as a `PASS` gate does. Since 5c became the loop's exit gate the only route
   to Step 7 is 5c returning `APPROVE` or `CONCERNS`, and this must not become the one path that
   reaches Step 7 without a PR conformance review — that would make it a *weaker* exit than a clean
   gate takes, on a run that by construction has stopped finding blockers.
3. Record the residual in the gate's `recommendations.future` **and** on the work item.
4. Write `describeDiminishingReturns(r)` verbatim into this cycle's `### QA Cycle {N}` entry, on its
   own `**Loop exit**` row. A reader six months later must be able to tell this exit from a stall,
   and the message is a function rather than a sentence composed here precisely so it is assertable.

> **This is not a licence to stop at the first quiet cycle.** It needs two consecutive zero-HIGH
> gates **and** a residue that is entirely machinery **and** two full adversarial passes behind it.
> The run it was derived from spent cycles 3 and 4 examining the repairs to cycle 2's repairs, and
> reached this conclusion by hand at cycle 4; the rule reaches it at cycle 3.

### 5b. Run QA Fix (shared)

#### Signal the `changes-requested` stage (when `TRACKER_ISSUE` is set)

Run on **entering** each fix cycle, before invoking `/qa-fix` — the gate has come back with issues and the card is going back for rework. Branch on `TRACKER`:

```bash
# TRACKER=jira
node .agents/skills/{develop-story|develop-task|develop-bug}/references/jira-stage.js \
  --issue {TRACKER_ISSUE} --stage changes-requested --json

# TRACKER=github
node .agents/skills/{develop-story|develop-task|develop-bug}/references/gh-stage.js \
  --issue {TRACKER_ISSUE} --stage changes-requested --json
```

> **This one fires per cycle — the opposite of the rule for `in-qa` a few sections above.** The distinction is not an oversight, so do not "correct" it to match: `in-qa` marks a phase the card enters **once**, and re-announcing it every cycle would tell a board reader nothing they cannot already see. `changes-requested` marks a state the card **re-enters**, once per gate that comes back with issues — a board that shows it on cycle 1 and then goes quiet through cycles 2–5 is actively telling the team something false.

`changes-requested` is **off by default** and, like `blocked`, is an **unranked side-state**: a consumer names it under `pipeline:` but usually not under `statuses:`. Being unranked is what lets a card re-enter it without the backward-move guard rejecting the second and subsequent moves. Its default candidates deliberately exclude "In Progress" — see the comment on `CHANGES_REQUESTED_CANDIDATES` in `jira-sync.js` for why naming a ranked development column here would make the guard fight itself.

Expect `reason: "stage-disabled"` until a project opts in, and `no-option` / `no-transition` on a board that has no such column. All are correct outcomes; the CLI exits 0 for each and the loop continues either way. Never let this call block a fix cycle.

Log in Decisions Log, once per cycle: "QA Cycle {N} — changes-requested: {landed status / disabled / skip reason}."

#### Invoke qa-fix

Invoke the `/qa-fix` skill with the path to the most recent **gate file** (the `.yml` file located using the sort command above). The gate file is the authoritative source of issues for qa-fix.

#### Third-strike rule — replace, do not patch again

> **A gate carries only its OWN cycle's findings.** This is a precondition of the rule below, not a
> style preference, and it is the one way to feed the detector a wrong answer.
>
> The detector reads the `file:` of every HIGH `top_issues[]` entry across the last three gates and
> **deliberately ignores `status: closed`** — see the comment in `high_files()` for why. That is
> correct *given* one gate per cycle carrying that cycle's findings. Copy a closed HIGH forward into
> the next gate "so the gate carries the history" and one real finding now looks like a file struck
> twice; a third cycle trips "replace, do not patch again" on a file with nothing wrong with it, in a
> loop that was converging cleanly.
>
> It is an easy mistake to make for good reasons — the phrasing above is the actual justification an
> agent wrote before doing it on task 83, and it took a later cycle to catch. Put the history where it
> belongs instead: `bug_resolution`, the QA report's Re-Review Context table, and the bug reports.
> Those are read by people; `top_issues[]` is read by this rule.

Before invoking `/qa-fix`, work out which files have been the subject of HIGH findings for three
consecutive cycles. Every `top_issues[]` entry carries a **`file:`** key (gate schema: `qa-task`
**Step 10: Create Quality Gate File**, `qa-story` **Output 2: Quality Gate File**), so this is
*read off the gates*, not judged:

```bash
# Subject files of the HIGH findings ONE gate raised, one path per line.
# Entry boundaries are the `- ` markers at the FIRST item's indent — deeper dashes belong to
# wrapped `finding: >-` text, not to a new entry. `status: closed` is deliberately ignored: a
# gate is updated in place after its own cycle's fixes, so filtering on it reads every mature
# gate as empty.
high_files() {
  awk '
    /^top_issues:/         { ti=1; next }
    ti && /^[^[:space:]#]/ { ti=0 }
    !ti                    { next }
    { ind = match($0, /[^ ]/) - 1 }
    /^[[:space:]]*-[[:space:]]/ {
      if (!seen) { base = ind; seen = 1 }
      if (ind == base) { if (hi && f != "") print f; hi = 0; f = "" }
    }
    seen && (ind == base + 2 || ind == base) && /severity:[[:space:]]*["'"'"']?high/ { hi=1 }
    seen && (ind == base + 2 || ind == base) && /file:[[:space:]]*[^[:space:]]/ {
      v=$0; sub(/^.*file:[[:space:]]*/, "", v); sub(/[},].*$/, "", v)
      gsub(/["'"'"'[:space:]]/, "", v); f=v
    }
    END { if (hi && f != "") print f }
  ' "$1" | sort -u
}
# Files on their third consecutive strike, given the last three gates oldest→newest:
comm -12 <(comm -12 <(high_files "$GATE_N2") <(high_files "$GATE_N1")) <(high_files "$GATE_N")
```

**If the same file is the subject of HIGH findings in three consecutive cycles, `/qa-fix` may not
patch it again.** The permitted moves are exactly three:

1. **Delete the artifact** — if what it was for is already covered, or was never worth its cost.
2. **Replace its mechanism** — a different approach to the same job, not another correction to this
   one. A rewrite that keeps the defeated mechanism is a patch wearing a rewrite's diff.
3. **Waive** — record the finding as accepted with a documented reason in the gate's `waiver`
   block, and say why the residual is tolerable.

Pass the constraint into the invocation, naming the files:

```
Skill(qa-fix, args="gate={gate-file-path}") — plus, in the prompt:
"Third strike: {file} has been the subject of HIGH findings in cycles {N-2}, {N-1}, {N}.
 You may NOT patch it again. Delete it, replace its mechanism, or waive with a documented reason,
 and say in the fix summary which of the three you chose and why."
```

**Why this rule earns its keep.** On the observed task the verification artifact was patched four
times before being deleted, and its replacement was then deleted too. Deletion was the right answer
both times; the loop took four cycles to reach it, absorbing ~1,560 lines of rewrite while the
deliverable itself changed by 193.

**Why the trigger is `file:` and not a judgement field.** `file:` is checkable against the diff —
anyone can confirm the entry names a path the change set touches. A field asking the fixer to
classify its own findings (how important, what kind, whose fault) is written by the party the rule
constrains and is unfalsifiable: an agent that classifies its residual findings favourably exits
the loop a cycle sooner and nothing can catch it. Keep any future trigger for this rule on the same
footing.

#### Where the gate and QA report get committed (one commit, one push, per cycle)

**This cycle's gate `.yml` and QA report `.md` are evidence for this cycle's fix, and belong in the
same `fix(...)` commit as the fix.** Only the *implementation report* defers to Step 8. Stage all
three together:

| Artifact                                   | Commit                                   |
| ------------------------------------------ | ---------------------------------------- |
| Code/test changes from `/qa-fix`            | this cycle's `fix(...)` commit           |
| `…gate.{N}.{name}.yml` (written by 5a)      | this cycle's `fix(...)` commit           |
| `…qa.{N}.{name}.md` (written by 5a)         | this cycle's `fix(...)` commit           |
| `…implementation.{name}.md`                 | **deferred to Step 8** (`docs(...)`)     |

**There is exactly one `git push origin HEAD` per cycle** — at step 3 below on a cycle that enters 5b
from 5a, or **before 5c** on a cycle whose gate read `PASS`/`WAIVED` (path 1 above), never both. Do not create a separate
`docs(...): QA cycle {N} gate + report` commit, and do not push twice in a cycle. The rule is about
the **push**, not the commit: a review-driven cycle legitimately makes two commits (the pre-5c
gate+report, then 5b's `fix(...)`), and still pushes once.

Left unstated, the gate and report fall into `/commit-changes`' default sweep and an orchestrator
invents a second commit for them and pushes it separately — observed seven times on one PR. The
cost is not mainly CI minutes (four of the five superseded runs there died within 3m35s, so roughly
ten minutes of runner time). It is that **every fix commit reached merge without a completed CI run
of its own**, because a cycle's second push kept cancelling its own in-flight run.

Staging the gate here does **not** conflict with qa-fix's "Dev does not modify gate YAML files"
(`qa-fix` Step 6): this orchestrator stages a gate that `/qa-gate` wrote during 5a. `/qa-fix` never
touches it. Nor does it move anything the resume contract reads — cycle reconstruction counts
`### QA Cycle` headings in the working-tree implementation report, which stays where it is.

**Two paths leave 5a without a `fix(...)` commit. Both must still commit the cycle's
gate and QA report — the evidence for a cycle that ran belongs on the branch, not only in the
working tree, where a branch switch loses it and no reader of the PR ever sees it:**

1. **`PASS` / `WAIVED` → 5c** (Outcome branching, above) — the cycle reaches 5c without entering
   5b, so no `fix(...)` commit exists. Commit the gate `.yml` and QA report `.md` **before invoking
   `/review-pr` at 5c**, and push once. This is the single stated commit point for this path.
   Committing here rather than at the Step 7 transition is load-bearing twice over: 5c reads the
   artifact trail **off the branch**, so an uncommitted gate is invisible to the very review that
   audits it; and if 5c returns `REQUEST CHANGES`, the Step 7 transition never happens on this
   cycle. Message: `docs(story.{epic}.{story}): QA cycle {N} gate + report` (or `docs(task.{id}): …`).

   > **This is the one path on which a cycle commits twice, and the push budget is what matters.**
   > A `REQUEST CHANGES` verdict re-enters 5b *inside the same cycle N*, and 5b then makes its own
   > `fix(...)` commit. That is two commits in cycle N — which is fine — but the one-push-per-cycle
   > rule below still binds, because its purpose is to stop a cycle's second push cancelling its own
   > in-flight CI run. **Cycle N's push is spent here.** On the review-driven re-entry, 5b commits
   > **without pushing**; the push happens once, on the next transition that leaves 5b.
2. **The no-code-change HALT** (step 0 below) — HALTs before any commit. Commit the gate `.yml` and
   QA report `.md` before halting, same message shape, and push once.

Those two, plus the convergence-stall escalation, are the **only** places a standalone `docs(...)`
commit for the gate and QA report is correct — each because there is no `fix(...)` commit in that
cycle to carry them. In a cycle that runs 5b, a second commit for these files is the defect this
section exists to prevent.

After fixes are applied:

0. **Check for actual changes**: Before committing, run `git diff --stat HEAD` to verify qa-fix actually modified files. If no files changed (qa-fix made no code edits), do NOT increment the cycle counter. Instead:
   - **First, if this cycle entered 5b from a 5c `REQUEST CHANGES` verdict**, confirm the PR review
     report path was actually passed in the invocation. A no-change result on that path is far more
     likely to mean the findings never reached qa-fix than that they are unfixable — the gate it
     reads is the clean one. If the path was omitted, re-invoke once with it before treating this as
     a HALT, and log the re-invocation.
   - Log in Issues Log: "QA Cycle {N}: qa-fix made no code changes — issues may be unfixable with current approach"
   - **Commit this cycle's gate `.yml` and QA report `.md` first**, then push once — per path 2 above. A HALT is a handover to a person: evidence left uncommitted is not on the PR they will read, and does not survive a branch switch. **Skip this when the cycle reached 5b via a 5c `REQUEST CHANGES` verdict** — it arrived through path 1, which already committed and pushed both files earlier in the same cycle, and repeating it produces an empty commit or a redundant push.
   - HALT with: "qa-fix could not address the remaining issues. Human review required. See implementation report for details."

0a. **Run the fast gate before committing.** Only reached when step 0 found changes — there is
   nothing to gate otherwise, and step 0's no-change path HALTs before this point. Capture to a log
   rather than streaming:

   ```bash
   FIX_LOG=".claude/state/qa-fix-gate-${QA_CYCLE}-$(date +%s).log"
   <fastGateCommand> > "$FIX_LOG" 2>&1
   GATE_EXIT=$?
   ```

   `<fastGateCommand>` is `develop.fastGateCommand` from `skills-config.yaml` — the same fast tier
   the develop loop runs (see
   [`develop-pipeline-step-3-develop-loop.md`](develop-pipeline-step-3-develop-loop.md) §"What the
   loop runs"). **`npm run ci:fast` is the suggested value, not a default that works everywhere**;
   the develop loop checks the named script resolves before its first iteration, so by the time this
   cycle runs the key has already been proven to name a real script. The slow tier stays out of this
   cycle by design; it runs once at `develop-next`'s merge gate.

   **This is a gate on the commit, not a new halt.** On `GATE_EXIT != 0`, do **not** commit — a
   red tree is exactly what the cycle machinery is for. Triage per the step-3 pattern, feed the
   finding back into this cycle's fixes, and re-run the gate.

   **Bound this retry at 2 attempts.** After a second red gate in the same cycle, stop retrying:
   commit nothing, record the failing output in the QA Iteration History, and let the cycle end so
   the next QA review writes a gate. That is what actually reaches the convergence check and
   MAX_ITER — both of which count *cycles*, so an unbounded inner re-run would never reach either.
   An earlier revision of this block claimed "the MAX_ITER cap still bounds the loop"; it does not
   bound this retry, and a stated guarantee that is not real is worse than an unstated one.

   Cleanup mirrors step 3: `GATE_EXIT == 0` → `rm -f "$FIX_LOG"`; non-zero → retain for post-mortem.

   > **Why the gate sits between 0 and 1, and not after the commit.** A qa-fix cycle pushes to the PR
   > branch, so a red commit is a red PR the reviewer sees before the next cycle repairs it — and on
   > the last cycle nothing repairs it at all. Formatting is the concrete case: `prettier --check` is
   > not in `npm test`, so a cycle could close green, push, and fail CI on a file it had just
   > rewritten. It sits *after* step 0 because gating a tree that step 0 is about to declare unchanged
   > pays a full format+test run on the one path that always HALTs.

1. **Exclude the implementation report's *updates* from this commit — and only that** — Step 8 owns the report's final state, so qa-fix cycles must not bring report mutations into a `fix(...)` commit. The gate and QA report are **not** excluded; they ride along per the table above. The file itself is already tracked (Step 4 committed it), so this defers changes rather than withholding the file: no link to the report can dangle. Before invoking `/commit-changes`, unstage the report explicitly:

   ```bash
   # develop-story
   git reset HEAD -- '**/story.*.implementation.*.md' 2>/dev/null || true
   # develop-task
   git reset HEAD -- '**/task.*.implementation.*.md' 2>/dev/null || true
   ```

   Then invoke `/commit-changes` with an explicit `exclude` directive in the prompt: pass `exclude=story.{epic}.{story}.implementation.*.md` (or `task.{id}.implementation.*.md`). The skill respects the directive and will not re-stage the report.

   Conventional Commits message:

   #### develop-story

   `fix(story.{epic}.{story}): qa-fix cycle {N} — {brief summary of fixes}`

   #### develop-task

   `fix(task.{id}): qa-fix cycle {N} — {brief summary of fixes}`

   Rationale: previously the report was simply "not needed" in qa-fix commits but nothing prevented inclusion. Decisions Log / QA Iteration History entries written during the cycle would silently land in `fix(...)` commits, splitting report history across the branch. Step 8 is the single owner of the report's **final** commit (`docs(...)`).

   > **Do not extend this to the report's first commit.** An earlier revision of this pipeline held the file out of *every* commit until Step 8, which left the audit trail absent from the branch throughout the QA loop and turned any document linking to the report into a dangling relative link — one that resolves locally, because the file is present but untracked, and fails only in CI. Step 4 commits the file for that reason; this step defers only its churn.

2. Run `git log --oneline -1` to capture the fix commit hash.

3. Push to the remote branch so the PR reflects the latest changes — **once per cycle**:

   > **Skip this push when the cycle entered 5b from a 5c `REQUEST CHANGES` verdict.** Cycle N's
   > push was already spent on the pre-5c commit (path 1). The `fix(...)` commit rides to the remote
   > on the **next** push — the one taken by whichever cycle exits next, either at this step or
   > before that cycle's 5c. A second push here is the one this section exists to prevent: it
   > cancels the cycle's own in-flight CI run.
   >
   > **Consequence for step 5's PR-state poll**, which runs after this step: on the skipped-push
   > path the local branch is ahead of the remote, so poll the PR's *state* (open / merged / closed)
   > as usual and do **not** treat an unchanged head SHA as a failure.

   ```bash
   git push origin HEAD
   ```

4. Log what was fixed in the QA Cycle entry:
   ```
   **Fixes Applied**: {brief description of what qa-fix changed}
   **Commit**: `{hash}`
   ```

4a. **Post QA fix summary to tracker issue** (non-blocking — skip if `TRACKER_ISSUE` is empty):

```bash
mkdir -p .claude/state
cat > .claude/state/comment-body.md <<'EOF'
## 🔧 QA Fix Cycle {N} Applied — Step 6/8

**Fixes applied**: {brief summary from qa-fix output}
**Commit**: `{hash}`
EOF

node .agents/skills/{develop-story|develop-task|develop-bug}/references/tracker-comment.js \
  --issue {TRACKER_ISSUE} --body-file .claude/state/comment-body.md \
  --stage qa-fix-{N} \
  --slot cycle="{N}" \
  --json
```

> **`cycle` is the only slot `qa-fix` reads**, and it is the same `{N}` as the stage suffix. Numeric,
> positive integers only.

Read `reason` and act per the table in [`references/tracker-comment-contract.md`](tracker-comment-contract.md) — `posted`/`already`/`deferred` need nothing, `unverifiable` is logged and never posted over, and `no-credentials` is the one case that may fall back to MCP.

On failure: log warning in Issues Log and continue. Log in Decisions Log: "QA fix cycle {N} comment posted to {TRACKER} issue {TRACKER_ISSUE}."

5. **Post-fix PR state check (uses tracker state poller)**: Invoke the tracker state poller (see `references/tracker-state-poller-subagent.md`) via an Explore subagent with `PR_NUMBER={PR_NUMBER}` and `ISSUE_KEY=` (empty).

   Persist the result to `{story-or-task-directory}/.summaries/step-5-post-fix-tracker-{N}.json` where `{N}` is the **current cycle number** (do NOT overwrite earlier cycles' artifacts — each cycle gets its own file). Schema per `references/subagent-summary-artifact.md`. Update the Pipeline Progress `Subagent summary ref` column for Step 5–6 with the latest path.

   Branch on `result.pr.state`:
   - `"OPEN"` → continue QA loop normally.
   - `"MERGED"` or `"CLOSED"` → HALT: "PR #{PR_NUMBER} was {state} mid-QA loop — pipeline cannot continue. Verify PR state and re-run if needed." Log in Issues Log.
   - `null` / missing / empty (poller succeeded but state field absent) → log warning `"⚠️ PR state unknown after qa-fix push — re-polling once"`; re-invoke the poller once. If the second result is still null/missing, log `"⚠️ PR state could not be determined — proceeding optimistically (treating as OPEN)"` in Issues Log and continue. Do **not** HALT on null — flaky `gh pr view` is more common than mid-loop close.
   - `result.errors | length > 0` → log each error in Issues Log; treat `pr.state` per the rules above (the poller may still return a usable state alongside non-fatal errors).

6. **Emit eval marker (EVAL_MODE guard)**: If the environment variable `EVAL_MODE=1` is set, write an empty marker file after each completed qa-fix iteration so eval harnesses can detect the iteration boundary and send a kill signal for resume testing:

   ```bash
   if [ "${EVAL_MODE}" = "1" ]; then
     mkdir -p .task-state
     touch ".task-state/qa-fix-iter-${QA_CYCLE}.marker"
   fi
   ```

   This is a no-op in all production runs where `EVAL_MODE` is unset.

7. Increment the cycle counter and return to 5a. The **Convergence check** runs again after the
   next gate is written — it, not this step, is what ends a loop that has stopped reducing HIGH
   findings before the 5-cycle limit does.

---

### 5c. PR Conformance Review (shared)

Perform this step **before Step 7**, on either of the **two routes out of 5a**:

1. a gate that reads **`PASS` or `WAIVED`** — the ordinary route; or
2. a gate that took the **Diminishing-returns exit** above. That gate is `CONCERNS` by construction —
   the exit's own condition 2 requires a non-empty `top_issues[]`, and any MEDIUM makes the gate
   CONCERNS — so it must be named here explicitly. It arrives with a residue that is entirely test
   machinery and no HIGH finding across two consecutive cycles.

A gate that routes to **5b** never reaches this step, and neither route above routes to 5b. This is
the loop's **exit gate**: 5a and 5b can cycle without it, but nothing leaves the loop except through
here.

> **Route 2 is named rather than left implied, and that is not tidiness.** An earlier draft of the
> Diminishing-returns exit said it hands to 5c "exactly as a `PASS` gate does" while this sentence
> still admitted only `PASS` / `WAIVED` — so one runnable document held two rules about whether a
> CONCERNS gate may reach 5c, and an orchestrator's behaviour depended on which section it read
> first. Whatever else changes here, the set of gates 5c accepts is stated in **one** place, and this
> is it.

**Why this exists, and what is genuinely new.** `/qa-story` and `/qa-task` already dispatch the
**code** reviewer every cycle, so 5c's code lens is duplication and is not the reason it runs. Its
**conformance** lens has no counterpart anywhere in the pipeline: does the diff *cover* what the
work item promised, did it drift outside that *scope*, is the artifact *trail* complete and honest,
is the work item *consistent* with what shipped. A run can otherwise reach `accepted` with a
complete-looking trail that does not hold — which is exactly how `/review-pr` itself shipped, and
what its own dogfood run on PR #283 caught.

**Why here and not earlier.** By the time a gate reads PASS the trail 5c audits already exists —
implementation report, review report, QA report, gate. Only the DoD is missing, and Step 7 writes
it. And an adverse verdict still has somewhere to go, because `/qa-fix` is live.

**Remaining Work Status block (required, before the review).** Emit the block with the position
line `Steps 5–6/8 — QA LOOP ⏳ PR conformance review, cycle {CYCLE}/5` immediately before invoking
`/review-pr`. This is a mandatory firing point in
[`references/develop-pipeline-remaining-work-banner.md`](develop-pipeline-remaining-work-banner.md)
and **this section owns it**: the review is a subagent dispatch that can run long, and without the
block the user's last position marker is the QA cycle that has already finished.

#### Assert the trail is on the branch, not in the working tree (before the review)

5c reads the artifact trail **off the PR branch** — that is what makes its conformance lens
independent of the session that wrote the trail. So the trail has to be there. Path 1 above
committed the cycle's gate and QA report and pushed once; this assertion is what turns that
instruction into a fact. A `-f` or `ls` check answers "is there a file here", which a
suppressed `git commit` rejection satisfies perfectly: on one run a whole QA cycle sat staged and
unpushed under a `PASS` gate, and only this step's lens — reading the PR head — caught it (obs #48,
task.115).

```bash
BRANCH=$(git rev-parse --abbrev-ref HEAD)
GATE_FILE="{the latest gate file — resolved per §Finding the Latest Gate File}"
QA_FILE="{the cycle's QA report — the .qa.{N}. file with the same N}"
for ARTIFACT in "$GATE_FILE" "$QA_FILE"; do
  git ls-files --error-unmatch "$ARTIFACT" >/dev/null \
    || { echo "HALT: $ARTIFACT is not tracked — the path-1 commit did not include it"; exit 1; }
  git show "origin/${BRANCH}:${ARTIFACT}" 2>/dev/null | grep -q . \
    || { echo "HALT: $ARTIFACT is not on origin/${BRANCH} — the cycle's push did not carry it"; exit 1; }
done
```

> **Never suppress a `git commit`'s output or exit status in a chain.** `git commit … >/dev/null
> 2>&1 || true` is how a pre-commit hook's refusal becomes an invisible no-op, and the assertion
> above is the backstop for exactly that — it should never be the *first* thing to notice. Read the
> exit code where the commit is made; the same rule holds at `/finalise` Step 7 action 6a.

#### Invoke the review

```bash
# standard mode
/review-pr --effort medium --comment

# lite mode — degrades the review, never skips it
/review-pr --effort low --comment
```

> **Written as two concrete invocations, not one `{medium|low}` placeholder.** zsh parses a
> word-initial `{` as a brace-group keyword, so the single-line placeholder form was a **zsh parse
> error** inside a ```` ```bash ```` fence — `bash -n` clean, `zsh -n` failing on `}`. That is Risk 1,
> the defect class task 66 shipped, sitting in the line that invokes the review. The mid-word form
> used elsewhere in this file (`.../{develop-story|develop-task|develop-bug}/...`) is unaffected and
> parses in both shells.

- **Target**: the open PR for this branch — pass nothing and `/review-pr` resolves it from the
  current branch.
- **`--effort`**: `medium` in standard mode, `low` in lite mode. Lite **degrades** the review; it
  never skips it. See [`references/develop-pipeline-lite-mode.md`](develop-pipeline-lite-mode.md).
- **`--comment` is passed explicitly and is not optional here.** `/review-pr` otherwise asks before
  posting, and the pipeline cannot prompt. Steps 5–6 and 7 already comment on the PR, so this is
  authorised ground rather than a new outward-facing capability.
- `/review-pr` writes `{story|task}.{id}.pr-review.{n}.{name}.md` beside the work item. The grammar
  is already defined in `docs/standards/file-naming.md` (named in prose rather than linked: this
  file is bundled into skill `references/` directories, where a `../../` link resolves to a path
  that does not exist); before this step existed, nothing emitted it.

**`/review-pr` remains advisory and its contract is unchanged.** It writes no gate `.yml`, never
submits a formal review, and never edits code. The orchestrator acts on a verdict the skill merely
reports — that separation is what makes this wiring legitimate. Do not give 5c the power to write a
gate.

#### Verdict branching

| Verdict | Action |
| --- | --- |
| 🚨 **REQUEST CHANGES** | Return to **5b** and run `/qa-fix` with the review's findings (see the invocation below). **Do not increment the counter here** — 5b's step 7 increments it on exit, exactly as on any other cycle. A review-driven fix is a cycle like any other, and it is counted in the same one place. |
| ⚠️ **CONCERNS** | Record the findings in the QA Cycle entry and the implementation report. **Do not block.** Signal `ready-for-merge`, exit the loop, proceed to Step 7. |
| ✅ **APPROVE** | Signal `ready-for-merge`, exit the loop, proceed to Step 7. |
| ❌ **Review failed** — `/review-pr` HALTed, could not resolve a PR, or errored | **Not a verdict, and not an exit.** Log it in the Issues Log, record `review failed` on the cycle's `**PR Review**` row, the gate and QA report are already committed by path 1 — do not commit again — and **HALT** naming the PR and the failure. Do **not** fall through to Step 7: 5c is the only exit, so a run that skips it silently finalises without the check this step exists to add. |

> **Why the failure arm is spelled out.** The `PASS`/`WAIVED` path reaches 5c without entering 5b, so
> it skips 5b step 5's mid-loop PR-state poll — which means a PR closed or merged underneath the run
> is first discovered *by* `/review-pr`, and `/review-pr` HALTs with text addressed to a human. Without
> this row the orchestrator has no arm for that state, and the likeliest improvisation is the one
> outcome that must never happen: proceeding to `/finalise` with no review.

The 5-cycle budget is **shared**, not additional. A run whose review returns REQUEST CHANGES
therefore consumes a cycle it would not have consumed before, and can reach Loop Escalation on a
run that previously exited clean. That is the gate working, not a regression — and the escalation
path already exists.

#### Invoking `/qa-fix` on a REQUEST CHANGES verdict

**Remaining Work Status block (required, before re-entering 5b).** Emit the block with the
position line `Steps 5–6/8 — QA LOOP ⏳ review requested changes, cycle {CYCLE}/5` before the
invocation below — the second of the two firing points this section owns.

The ordinary 5b invocation passes the latest **gate file**, and on neither route into 5c does that
gate carry the review's findings. Pass the **PR review report** as well:

```
Skill(qa-fix, args="gate={gate-file-path} pr_review={pr-review-report-path}")
```

The findings ingester globs `*.pr-review.*.md` for exactly this reason (see
`qa-findings-ingester-prompt.md`), and treats a finding whose rendered severity field reads
`high` as equivalent to a HIGH gate `top_issue` — the report carries no `severity:` key, and the
ingester warns by name against searching for one. Without both halves of this — the glob and the passed path — qa-fix reads a
clean gate, finds nothing, changes nothing, and 5b step 0 HALTs reporting the issues as unfixable
when in fact they were never delivered.

> **What the gate carries differs by route, and on no route is it the work.** Three shapes arrive
> here:
>
> | Gate | `top_issues[]` | Is it the fix target? |
> | :--- | :--- | :--- |
> | `PASS` (route 1) | empty | — nothing to mistake |
> | `WAIVED` (route 1) | its HIGH entries, with `waiver.active: true` | **No.** They were waived on purpose; the outcome-branching list above says re-running qa-fix on them "would churn against an intentionally-waived gate" |
> | `CONCERNS` (route 2, the Diminishing-returns exit) | the test-machinery residue that exit declined to fix | **No.** Leave it where the exit put it — the gate's `recommendations.future` and the work item |
>
> **Only the review's findings are the work**, and they arrive in the `pr_review=` report, not in the
> gate. Working a gate's carried entries instead re-does what was waived, or resumes refining the
> pins — the behaviour the Diminishing-returns exit exists to end, re-entered through the back door.
>
> Nothing mechanical prevents either: `/qa-fix`'s priority order picks up whatever `top_issues[]`
> holds, so **the instruction is the whole guard.**

> **REQUEST CHANGES re-enters 5b, not 5a.** The gate for this cycle has already been written and
> read; what is wanted is a fix pass against the review's findings, after which the loop returns to
> 5a for a fresh gate in the normal way. Entering at 5a instead would re-run QA against an unchanged
> tree and re-derive the gate that just passed.

#### Signal the `ready-for-merge` stage

Only on **APPROVE** or **CONCERNS** — never on REQUEST CHANGES, which is still inside the loop.
When `TRACKER_ISSUE` is set, branch on `TRACKER` — the same shape as the `changes-requested` signal
in 5b, which has always covered both:

```bash
# TRACKER=jira
node .agents/skills/{develop-story|develop-task|develop-bug}/references/jira-stage.js \
  --issue {TRACKER_ISSUE} --stage ready-for-merge --json

# TRACKER=github
node .agents/skills/{develop-story|develop-task|develop-bug}/references/gh-stage.js \
  --issue {TRACKER_ISSUE} --stage ready-for-merge --json
```

Like `in-qa`, this stage is **off by default** and opted into per issue type in the workflow record;
`reason: "stage-disabled"` is the expected outcome on a board without a merge-queue column.
Non-blocking either way.

Note the ordering: this fires once the review has cleared, still **before** Step 7. Step 7 is what
moves the issue to `done`, and it runs while the PR is still open — merging happens later, by hand
or via `/develop-next`. A board that wants a card to sit in a merge queue until the PR actually
lands should leave `done` to a human, not turn this stage off.

> **This block moved here from 5a's Outcome branching with task 77.** It used to fire the moment
> the gate read PASS, which advertised a card as merge-ready while the run could still loop back
> into `/qa-fix`. It now fires only once nothing can send the run backwards.

#### Record the outcome

Write the verdict into this cycle's `### QA Cycle {N}` entry on the `**PR Review**` row, and record
the report path in the implementation report. Then emit the Step 7 transition block with
`Steps 5–6/8 — QA LOOP ✅ complete ({N} cycles, {gate}, PR review {verdict})`.

---

## Loop Escalation (shared)

**Two triggers reach this block, and they share everything below except the heading and the
opening sentence.** There is deliberately no second escalation path: same artifact, same
commit-and-HALT shape, one set of templates.

> **The Diminishing-returns exit is not one of them, and the distinction is the whole reason that
> exit exists.** It ends a loop that *finished working* — zero HIGH across two consecutive gates,
> residue entirely machinery — and it hands to 5c and then Step 7. It writes no escalation entry and
> raises no HALT. A reader who finds a run that stopped at cycle 3 with a `CONCERNS` gate must be
> able to tell which of the two happened; the `**Loop exit**` row that exit writes into the cycle's
> QA Iteration History entry is what tells them, and it says so in words rather than leaving it to be
> inferred from the absence of an escalation entry.

| Trigger               | Entry heading           | Fires when                                                                                                             |
| --------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Loop limit**        | `QA Loop Limit Reached` | 5 complete cycles finished without reaching Step 7 — whether because no gate read clean, or because 5c returned REQUEST CHANGES and sent the run back to 5b. |
| **Convergence stall** | `QA Loop Not Converging` | The **Convergence check** above tripped — cycle ≥ 3, and the HIGH count failed to strictly decrease across two consecutive cycles. |

Before halting, write a thorough escalation entry in the Issues Log. Use the template for the
work item type, substituting the heading and opening sentence for the trigger that fired, and
listing the cycles that actually ran (`{N}`, which is 5 on the loop limit and usually 3 on a
convergence stall).

**5c adds no third trigger.** A REQUEST CHANGES verdict routes back to 5b and consumes a cycle from
the same 5-cycle budget, so a loop exhausted by review verdicts escalates through the **Loop limit**
trigger above like any other. There is still exactly one escalation path. Where a cycle was consumed
by a review rather than by a failing gate, say so in **What was attempted per cycle** — the final
gate may read `PASS` while the run still escalated, and an entry that does not explain that reads as
a contradiction to whoever picks it up.

#### develop-story escalation template

```
### {QA Loop Limit Reached | QA Loop Not Converging} — {YYYY-MM-DD}

{Loop limit:        The pipeline completed 5 qa-story/qa-fix cycles without a clean PASS.}
{Loop limit via review: The pipeline completed 5 cycles. The final gate read {status},
                    but Step 5c returned REQUEST CHANGES on cycle(s) {list}, so the run never
                    cleared the loop's exit gate.}
{Convergence stall: The pipeline stopped after {N} qa-story/qa-fix cycles: the HIGH finding
                    count failed to strictly decrease across two consecutive cycles, so the
                    loop was no longer converging. The remaining findings are NOT accepted —
                    they are handed over below.}

**Final gate status**: {status}
**HIGH findings per cycle**: {HIGH_1}, {HIGH_2}, … {HIGH_N} — {flat from cycle {i} onward / still rising}
**Remaining issues** (from final gate file):
{List each top_issue: description, severity, file (from the entry's `file:` key)}

**What was attempted per cycle**:
- Cycle 1: {fixes applied}
- Cycle 2: {fixes applied}
- Cycle 3: {fixes applied}
- {…through cycle {N}}

**Likely root cause**: {Assessment — e.g., architectural mismatch, missing test
infrastructure, acceptance criteria that cannot be met with current approach; on a
convergence stall, say which file the fixes kept circling and why patching it stopped
working}

**Recommended next steps**:
1. {Specific action}
2. {Specific action}
3. {Specific action — e.g., update story if issues reflect out-of-scope requirements}
```

#### develop-task escalation template

```
### {QA Loop Limit Reached | QA Loop Not Converging} — {YYYY-MM-DD}

{Loop limit:        The pipeline completed 5 qa-task/qa-fix cycles without a clean PASS.}
{Loop limit via review: The pipeline completed 5 cycles. The final gate read {status},
                    but Step 5c returned REQUEST CHANGES on cycle(s) {list}, so the run never
                    cleared the loop's exit gate.}
{Convergence stall: The pipeline stopped after {N} qa-task/qa-fix cycles: the HIGH finding
                    count failed to strictly decrease across two consecutive cycles, so the
                    loop was no longer converging. The remaining findings are NOT accepted —
                    they are handed over below.}

**Final gate status**: {status}
**HIGH findings per cycle**: {HIGH_1}, {HIGH_2}, … {HIGH_N} — {flat from cycle {i} onward / still rising}
**Remaining issues** (from final gate file):
{List each top_issue: description, severity, file (from the entry's `file:` key)}

**What was attempted per cycle**:
- Cycle 1: {fixes applied}
- Cycle 2: {fixes applied}
- Cycle 3: {fixes applied}
- {…through cycle {N}}

**Likely root cause**: {Assessment — e.g., architectural mismatch, missing test
infrastructure, success criteria that cannot be met with current approach; on a
convergence stall, say which file the fixes kept circling and why patching it stopped
working}

**Recommended next steps**:
1. {Specific action}
2. {Specific action}
3. {Specific action — e.g., update task if issues reflect out-of-scope requirements}
```

Set report status to `Escalated`. Invoke the `/commit-changes` skill to commit the implementation
report — **and, on a convergence stall, this cycle's gate `.yml` and QA report `.md` alongside it**,
since a stall halts before 5b and so has no `fix(...)` commit to carry them (see **Where the gate
and QA report get committed** in 5b):

#### develop-story escalation commit

Suggested commit message: `docs(story.{epic}.{story}): implementation report — qa loop escalation`

#### develop-task escalation commit

Suggested commit message: `docs(task.{id}): implementation report — qa loop escalation`

Then push:

```bash
git push origin HEAD
```

#### develop-story HALT message

```
⚠️ Story Development Paused — {QA Loop Limit Reached | QA Loop Not Converging}

Story:               {story filename}
QA cycles completed: {N}
HIGH per cycle:      {HIGH_1}, {HIGH_2}, … {HIGH_N}
Final gate status:   {status}
Implementation Report: {report file path}

The implementation report contains a full breakdown of every issue and fix attempted.
On a convergence stall the remaining findings are outstanding, not accepted — the loop stopped
because it was no longer reducing them, which is a reason to look at them, not past them.
Options:
1. Fix remaining issues manually, then re-run /qa-story
2. Accept the current gate status and proceed manually with /finalise
3. Update the story requirements if issues reflect unintended scope
```

#### develop-task HALT message

```
⚠️ Task Development Paused — {QA Loop Limit Reached | QA Loop Not Converging}

Task:                {task filename}
QA cycles completed: {N}
HIGH per cycle:      {HIGH_1}, {HIGH_2}, … {HIGH_N}
Final gate status:   {status}
Implementation Report: {report file path}

The implementation report contains a full breakdown of every issue and fix attempted.
On a convergence stall the remaining findings are outstanding, not accepted — the loop stopped
because it was no longer reducing them, which is a reason to look at them, not past them.
Options:
1. Fix remaining issues manually, then re-run /qa-task
2. Accept the current gate status and proceed manually with /finalise
3. Update the task requirements if issues reflect unintended scope
```
