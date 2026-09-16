---
name: develop-pipeline-step-2-review
description: Step 2 (review) shared by develop-story and develop-task. Covers gate check logic (skip conditions), review skill invocation, output format autonomous decision, outcome detection with post-review status table, and blocking/non-blocking findings handling. Story vs task variants are called out where they differ (skill name, file patterns, status values, commit message format).
---
<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/develop-pipeline-step-2-review.md. Regenerate via `npm run bundle`. -->

# Develop Pipeline — Step 2: Review

## When This Document Applies

Loaded by `/develop-story` and `/develop-task` during Step 2. Story/task variants are called out in labeled sub-sections where they differ.

---

## Gate Check

Re-read the document's `Status:` field (captured in Phase 0). Then check for an existing review report:

#### develop-story
```bash
ls {story-directory}/story.{epic}.{story}.review.*.md 2>/dev/null | sort | tail -1
```

#### develop-task
```bash
ls {task-directory}/task.{id}.review.*.md 2>/dev/null | sort | tail -1
```

### Skip/Run Decision Table

#### develop-story

| Pre-review status       | Review report exists? | Action                                                                               |
| ----------------------- | --------------------- | ------------------------------------------------------------------------------------ |
| `Draft`                 | Either                | Run `/review-story` — story needs validation and promotion                           |
| `Ready for Development` | Yes                   | **Skip** — story reviewed and report exists; log and proceed                         |
| `Ready for Development` | No                    | Run `/review-story` — status set without completing a review                         |
| `In Progress`           | Yes                   | **Skip** — review already completed; log and proceed                                 |
| `In Progress`           | No                    | Run `/review-story` — story may have been marked In Progress without a proper review |

#### develop-task

| Pre-review status       | Review report exists?  | Action                                                                             |
| ----------------------- | ---------------------- | ---------------------------------------------------------------------------------- |
| `Planned`               | Yes, and **current**   | **Skip** — the task is demonstrably reviewed; log and proceed                       |
| `Planned`               | No, or **stale**       | Run `/review-task` — task needs validation and promotion                           |
| `Ready for Development` | Yes                    | **Skip** — task reviewed and report exists; log and proceed                        |
| `Ready for Development` | No                     | Run `/review-task` — status set without completing a review                        |
| `In Progress`           | Yes                    | **Skip** — review already completed; log and proceed                               |
| `In Progress`           | No                     | Run `/review-task` — task may have been marked In Progress without a proper review |

**"Current" is defined, not judged.** A report is current when it is not older than the task
document's last content change. Compute it with the engine — never eyeball the two dates:

```bash
node -e '
  const fs = require("fs");
  const { classifyReviewReport, describeVerdict } =
    require("./.agents/skills/{develop-story|develop-task}/references/review-report-freshness.js");
  const r = classifyReviewReport({
    taskContent:   fs.readFileSync(process.argv[1], "utf8"),
    reportContent: process.argv[2] ? fs.readFileSync(process.argv[2], "utf8") : null,
  });
  console.log(JSON.stringify({ ...r, message: describeVerdict(r, { reportPath: process.argv[2] }) }));
' "{task-file}" "{resolved-report-file-or-empty}"
```

> Two things about that snippet. **`argv[1]` is the first *argument* only because this is `node -e`** —
> there is no script path in `argv` under `-e`. Lift the body into a `.js` file and `argv[1]` becomes
> the script path, and it silently reads the wrong file. And the engine is bundled into
> **`develop-story` and `develop-task` only**; `develop-bug` keeps its own step-2 document and has no
> copy of this module, so do not widen the placeholder to it without bundling it there first.

Engine source: `references/review-report-freshness.js` (bundled into each skill as
`references/review-report-freshness.js`). It is a **library, not a CLI** — deliberately, because its
only caller is this gate and a CLI would be a second interface to keep honest. It returns
`{verdict, reason, taskDate, reportDate}` with `verdict ∈ {fresh, stale, absent}`.

**Only `fresh` skips — on the `Planned` row.** `stale` and `absent` both run the review, and so does
every malformed input: the module resolves each ambiguity toward running, because a needless review
costs one pass while a wrong skip develops against an unreviewed card.

> ⚠️ **This paragraph governs the `Planned` row and nothing else. Read it against the tables, not
> over them.** The `Ready for Development` and `In Progress` rows — in **both** the develop-story and
> develop-task tables — still skip on the *presence* of a report, with no freshness computation, and
> that is deliberate: reaching either status required passing this gate, so the status is itself an
> assertion that a review completed. `Planned` carries no such assertion, which is exactly why it
> needed the report to be current before it could authorise a skip.
>
> Stated because an earlier draft put the unqualified sentence "Only `fresh` skips" between the two
> tables, where it read as governing all six rows and contradicted four of them — in a document a
> reader executes, 26 lines apart. If the reasoning above is ever falsified, the fix is to extend the
> freshness column to those rows, not to relax this one.

The task's date is its frontmatter `updated:`. The report's date is its body `**Reviewed:**` line,
falling back to `**Review Date:**` — **not** frontmatter, which review reports mostly do not carry,
and **not** filesystem mtime, which is the checkout time in a fresh clone and would make the gate
decide differently in CI than on a developer's machine.

> ⚠️ **This deliberately diverges from the pipeline's other freshness rule, and the divergence is
> stated here rather than left for a reader to trip over.** `develop-pipeline-resume-contract.md`
> §"Plan Freshness" answers the structurally identical question — *is this artifact at least as fresh
> as the task file?* — using `_mtime()` and `stat`, and `pipeline-resume-detector-prompt.md` diffs
> artifact mtimes the same way. By the argument above those are wrong in a fresh clone, where every
> mtime is the checkout time.
>
> **Neither is changed here.** Step 2 diverges because its verdict *authorises skipping a review*,
> so a rule that decides differently in CI than on a developer's desk would be believed in both
> places and be wrong in one. The resume rules select a cached plan, where the cost of being wrong is
> a redundant re-discovery. Same shape, different stakes — and if that reasoning is ever falsified,
> the fix is to move those rules onto content, not to move this one onto mtime. Two conventions, one
> of them argued for; silence about the other was the thing worth avoiding.

> ⚠️ **`Planned` + a current report was added 2026-09-07, closing a gate whose only intuitive remedy
> was a no-op.** This row previously read `Planned` + *either* → run the review, so the skip decision
> keyed on **status** while the fact that answers "has this been reviewed?" is the **report**. Any
> path that leaves a reviewed task at `planned` — and two exist, `sign-off.enforcement: blocking` and
> `change-log.enforcement: blocking`, both of which run a full review and then decline to promote —
> produced a card that was demonstrably reviewed and permanently unstartable. The halt landed before
> any work existed, which is the point at which an operator reaches for a re-review rather than
> questioning the gate; and a re-review cannot clear it, because whatever withheld the promotion
> fires again identically.
>
> Reported by a consumer (`rebirth-wallet` task.113 / RAPP-728) that **predicted** the halt from
> reading these tables and steered around it by hand rather than hitting it — the operator ruled
> "Skip — already reviewed" at Phase 0d. The consumer's diagnosis, that the two tables contradict
> each other, does not hold: `/review-task` does promote `planned → ready-for-development`, so the
> tables were consistent and the halt was the correct response to a promotion that did not happen.
> What was wrong was that the correct halt had no recovery path. Freshness is what keeps the gate
> honest while giving it one — a stale report is not evidence about a card that has since been
> rewritten.

> **Resolving *which* report is the caller's job, and `sort | tail -1` does not do it.** Report
> filenames come in at least three shapes — `task.12.review.2026-05-06.md`,
> `task.11.review-task-tracker-dedup.review.2026-05-06.md`, and the canonical
> `task.97.review.1.name.md` — so the date is not reliably the last sortable segment and the newest
> filename is not reliably the newest report. Where several exist, prefer the highest `review.{N}.`
> index; the freshness engine takes the resolved report's **contents**, not a glob, precisely so this
> decision stays visible here rather than hiding inside it.

---

## If Skipping

#### develop-story
- Log in Decisions Log: "review-story skipped — story status is `{status}` and review report exists at `{path}`"
- Update Pipeline Progress: ✅ review-story (skipped — already reviewed)

#### develop-task
- Log in Decisions Log: "review-task skipped — task status is `{status}` and review report exists at `{path}`"
- When the status was `Planned`, the freshness verdict is what authorised the skip, so log it too:
  "review-task skipped — task status is `Planned` and `{path}` is current ({reportDate} ≥ updated {taskDate})".
  A skip on `Planned` that does not record both dates is indistinguishable in the log from the
  status-only skip this row replaced.
- Update Pipeline Progress: ✅ review-task (skipped — already reviewed)

**Post skip notice to tracker issue** (non-blocking — skip if `TRACKER_ISSUE` is empty):

```bash
mkdir -p .claude/state
cat > .claude/state/comment-body.md <<'EOF'
## 📋 Review — Step 2/8

**Outcome**: Skipped — already reviewed
**Status**: {status}
**Review report**: {path}
EOF

node .agents/skills/{develop-story|develop-task|develop-bug}/references/tracker-comment.js \
  --issue {TRACKER_ISSUE} --body-file .claude/state/comment-body.md \
  --stage review \
  --slot outcome="already reviewed" \
  --json
```

> No `blocking` slot here, and its absence is the point: `blocking` is a **boolean** slot, and leaving
> it off makes the lead render "Nothing is blocking the work from starting" — which is exactly what a
> skip means. Passing `blocking=0` or `blocking=false` reaches the same rendering (the engine reads
> those strings as *absent*, not as false), but omission says it once instead of twice.

> Engine source: `references/tracker-comment.js` (bundled into each skill as `references/tracker-comment.js`). Contract: `references/tracker-comment-contract.md`.


Read `reason` and act per the table in [`references/tracker-comment-contract.md`](tracker-comment-contract.md) — `posted`/`already`/`deferred` need nothing, `unverifiable` is logged and never posted over, and `no-credentials` is the one case that may fall back to MCP.

> **The two slots the `review` lead reads, and how to fill them.**
>
> **`outcome` is a text slot, interpolated verbatim into "— the result was …". Do not pass the review's
> raw verdict token.** `READY TO IMPLEMENT`, `NEEDS REVISION` and `REQUIRES REWORK` are internal
> vocabulary, and [`references/stakeholder-summary.md`](stakeholder-summary.md) requires internal
> tokens to be *mapped*, never passed through — the one paragraph written for a reader with no
> technical background is the last place a raw token belongs. Map at the call site:
>
> | Review verdict | `outcome` value |
> | :--- | :--- |
> | `READY TO IMPLEMENT` / GO | `ready to build` |
> | `NEEDS REVISION` | `needs more detail` |
> | `REQUIRES REWORK` / NO-GO | `needs rework` |
>
> **`blocking` is a boolean slot and its two renderings are opposites**, so getting it wrong says the
> wrong thing rather than saying nothing. A present, truthy value renders "Some things need answering
> before work can start"; absent renders "Nothing is blocking the work from starting". The engine reads
> `""`, `0`, `false`, `no`, `none`, `null`, `undefined` and `off` as **absent**, so passing a count of
> zero is safe — but omitting the flag when there are no blocking findings is clearer.

On failure: log warning in Issues Log and continue.

Proceed to Step 3.

---

## If Running the Review Skill

#### develop-story
Invoke the `/review-story` skill with the story file path in **validate-and-apply** mode (`MODE=validate` + `APPLY=true`). This is non-interactive — no output-format question is asked. The variant scores the story, applies critical + important fixes, and promotes `Draft → Ready for Development` on a GO (HALT on NO-GO), then writes a comprehensive `story.{epic}.{story}.review.{n}.{story-name}.md` report for the pipeline audit trail. Log: "review-story invoked in validate-and-apply mode".

After review-story completes, locate the generated review report:
```bash
ls {story-directory}/story.{epic}.{story}.review.*.md 2>/dev/null | sort | tail -1
```
Record the path in the Decisions Log: "Review report: {path}". If no review report file is found, log a warning in the Issues Log ("review-story did not produce a review report file") but do not halt.

#### develop-task
Invoke the `/review-task` skill with the task file path.

**Output format gate**: `/review-task` Step 0 asks for output format. The pipeline auto-answers "Comprehensive report" (the canonical default lives in `references/develop-pipeline-autonomous-defaults.md`). Log: "review-task output: Comprehensive report — required for pipeline audit trail".

After review-task completes, locate the generated review report:
```bash
ls {task-directory}/task.{id}.review.*.md 2>/dev/null | sort | tail -1
```
Record the path in the Decisions Log: "Review report: {path}". If no review report file is found, log a warning in the Issues Log ("review-task did not produce a review report file") but do not halt — the post-review table below is what decides, and it needs the status as well as the report.

> **`sort | tail -1` is a heuristic here, and it is wrong for some real filenames.** Reports exist in
> at least three shapes (`task.12.review.2026-05-06.md`, `task.11.slug.review.2026-05-06.md`,
> `task.97.review.1.slug.md`), so lexical order is not recency order across them. Where more than one
> matches, prefer the highest `review.{N}.` index and fall back to this `ls` only when no report
> carries one. This matters more than it used to: the Skip/Run table now lets a *current* report
> authorise skipping the review, so picking the wrong report is no longer merely a mis-logged path.

---

## Re-read the Tracker Key — the Review May Have Created the Issue

Runs **after the review skill returns and before outcome detection**, on both the run and the skip
path (a skip changes nothing and the check answers `unchanged` in one read).

`TRACKER_ISSUE` was captured at Phase 0c, and for a freshly authored item it was **empty**: the
tracker-linkage check that creates the issue lives *inside* `/review-story` / `/review-task` (Step 2
check 5 → `ensure-*-github-issue` / `ensure-*-jira-issue`), which is this step's callee — so the
key becomes true one step after Step 1 tested it. Step 1's `work-started` signal was skipped on
the empty key, and nothing fired it later: the card sat in the first column and the pipeline-start
comment never posted (task.106, fixed by hand; observation #53). The pipeline lock's `tracker_issue`
— which the PreCompact and Stop hooks read — went stale the same way.

```bash
TRACKER_ISSUE_AT_STEP_1="$TRACKER_ISSUE"
if [ "$TRACKER" = "jira" ]; then
  TRACKER_ISSUE=$(grep '^jira_key:' {document-file} | awk '{print $2}')
else
  TRACKER_ISSUE=$(grep '^github_issue:' {document-file} | awk '{print $2}')
fi
[ "$TRACKER_ISSUE" = "null" ] && TRACKER_ISSUE=""
# The compatibility variable is set AFTER the null reset, as Phase 0c does —
# otherwise `github_issue: null` leaves it holding the literal string "null".
[ "$TRACKER" = "github" ] && GITHUB_ISSUE="$TRACKER_ISSUE"

if [ -z "$TRACKER_ISSUE_AT_STEP_1" ] && [ -n "$TRACKER_ISSUE" ]; then
  # 1. The lock is what the hooks read — update it before anything else posts.
  jq --arg i "$TRACKER_ISSUE" '.tracker_issue = $i' .claude/state/develop-pipeline.lock \
    > .claude/state/develop-pipeline.lock.tmp \
    && mv .claude/state/develop-pipeline.lock.tmp .claude/state/develop-pipeline.lock
  # 2. Fire the signal Step 1 skipped — the full 0c-reg procedure, once.
  #    (comment via tracker-comment.js --stage work-started; then the board/Jira
  #    move via gh-stage.js / jira-stage.js --stage work-started; then the
  #    GitHub Priority default). See step-0 §0c-reg for the calls.
fi
```

Then execute **0c-reg** from `references/develop-pipeline-step-0-resolve-and-prepare.md` exactly as
Step 1 would have — the procedure is unchanged, only its moment has moved. Log in the Decisions Log:
"work-started re-fired at Step 2 — issue {TRACKER_ISSUE} created by the review; lock updated."

**Idempotent by construction, so a second run is safe.** The comment carries a marker and reports
`already`; `gh-stage.js` / `jira-stage.js` report `already` (or `no-transition`) and exit 0. A run
that finds the key already set at Step 1 never enters the branch at all. Do not widen this into
"signal at every step that has a key" — the narrower rule is enough, and it lives where the fact
(the review creates the issue) lives.

> **`TRACKER_ISSUE` from here on is the re-read value.** Every later step — the Step 3
> develop-complete comment, Step 4's `--issue`, the QA-cycle comments, `/finalise`'s close — reads
> the variable, and each of them would silently skip on the Phase 0c value.

---

## Detecting Outcomes

Re-read the document file and check the `Status:` field. Apply these autonomous rules:

#### develop-story post-review status table

| Post-review status      | Action                                                             |
| ----------------------- | ------------------------------------------------------------------ |
| `Ready for Development` | Proceed — draft promoted                                           |
| `In Progress`           | Proceed — acceptable intermediate state                            |
| `Draft` (unchanged)     | review-story left it Draft — log as issue, HALT and report to user |
| Downgraded / unclear    | HALT — report to user                                              |

#### develop-task post-review status table

| Post-review status      | A report now exists?                                        | Action                                        |
| ----------------------- | ----------------------------------------------------------- | --------------------------------------------- |
| `Ready for Development` | —                                                           | Proceed — clean pass or Planned promoted      |
| `In Progress`           | —                                                           | Proceed — acceptable intermediate state       |
| `Planned` (unchanged)   | Yes — written this run, or already present and **current**  | Proceed — log as an issue, do **not** HALT    |
| `Planned` (unchanged)   | Yes, but **stale**, and none written this run               | **HALT** — log as an issue and report to user |
| `Planned` (unchanged)   | No — none written, none already present                     | **HALT** — log as an issue and report to user |
| Downgraded / unclear    | —                                                           | HALT — report to user                         |

**The three `Planned` rows are exhaustive on purpose.** A report is `fresh`, `stale`, or `absent` —
the freshness engine returns exactly those three — so every state has a row. An earlier draft of this
table had only the first and third, which left a *pre-existing stale* report matching neither: the
skip table correctly ran the review, the review wrote no new report and did not promote, and the run
fell through to "a report exists → proceed" and developed against a report that reviewed an earlier
version of the card. **That is the same over-permissive skip the freshness rule exists to prevent,
reintroduced in prose after the code had refused it.** A decision table in a runnable-prose
deliverable is executed by a reader; a gap in it is a branch, not an omission.

> ⚠️ **The unconditional `Planned` → HALT was narrowed 2026-09-07: a review that ran, wrote its
> report and left the status alone is a completed review, not a failed one.** Two supported
> configurations produce exactly that — `sign-off.enforcement: blocking` with an unsigned row, and
> `change-log.enforcement: blocking` with a missing log. Both are documented in `review-task` Step 9
> as withholding promotion *"regardless of the review outcome, and including the pipeline
> auto-answer path"*. Under stock defaults (sign-off absent, change-log advisory) `/review-task`
> promotes and this row is never reached, which is why the halt had never been observed when it was
> reported — it was predicted from reading the table.
>
> The HALT is **kept** for the case it was written for: a review that produced nothing at all, on a
> card nothing had reviewed before. That is the genuine failure, and buying liveness by removing it
> would trade a needless halt for developing against an unreviewed card.
>
> Read the two `Planned` rows together with "If Running the Review Skill" above, which logs a missing
> report as a warning **without halting there**. That warning is not the decision; this table is. A
> review that produced no report but *did* promote the status lands on row 1 and proceeds; one that
> produced no report and did not promote lands on the HALT row. The status and the report are two
> independent signals, and it takes the absence of both to stop the pipeline.

---

## Handling Findings

#### develop-story

- **Draft → Ready for Development**: Log "Draft promoted to Ready for Development by review-story" in Decisions Log. Proceed autonomously.
- **Non-blocking suggestions**: Log as "Proceeding despite minor review suggestions: {list}" and continue.
- **Clean pass**: Log "Story review passed" and continue.
- **Blocking issues** (contradictory specs, missing ACs, status still `Draft`): Log each in Issues Log, invoke `/commit-changes` (message: `docs(story.{epic}.{story}): implementation report — review-story blocking halt`), then HALT: "review-story could not resolve blocking issues — human input required before development can proceed".

#### develop-task

- **Planned → Ready for Development**: Log "Planned promoted to Ready for Development by review-task" in Decisions Log. Proceed autonomously.
- **Non-blocking suggestions**: Log as "Proceeding despite minor review suggestions: {list}" and continue.
- **Clean pass**: Log "Task review passed" and continue.
- **Planned unchanged, but a CURRENT report exists**: Log in Issues Log — "review-task left the status at `Planned` but {wrote / found} a current report at `{path}` ({reportDate} ≥ updated {taskDate}); proceeding on the report. Two supported configs withhold promotion after a successful review — `sign-off.enforcement: blocking` and `change-log.enforcement: blocking` — so check those before treating this as a defect." Then **proceed**. This is not a blocking issue.

  **`current` is the load-bearing word.** Run the freshness engine; do not infer it from the report merely being present. A stale report reaching this bullet is the HALT row above, not this one.
- **Blocking issues** (missing success criteria, conflicting specs, or status still `Planned` after review with **no current report** — none written this run, and none already present that is current): Log each in Issues Log, invoke `/commit-changes` (message: `docs(task.{id}): implementation report — review-task blocking halt`), then HALT.

  **The HALT message must name which precondition failed, not just the symptom.** `describeVerdict()`
  from the freshness engine produces that sentence; do not compose one by hand. Emit:

  ```
  review-task could not resolve blocking issues — human input required before development can proceed.

    Task status:     Planned (unchanged by the review)
    Review report:   {describeVerdict(result, {reportPath}) — e.g. "no review report exists beside
                     this task, and the review produced none", or "task.97.review.1.x.md is dated
                     2026-05-11, older than the task's `updated: 2026-05-12` — it reviewed an earlier
                     version of this card"}
    Review outcome:  {READY TO IMPLEMENT / NEEDS REVISION / REQUIRES REWORK / not recorded}

  If the outcome was READY TO IMPLEMENT, the review passed and something withheld the promotion.
  Check `sign-off.enforcement` and `change-log.enforcement` in skills-config.yaml before re-running
  the review — if either is `blocking` and unsatisfied, a re-run will halt here again identically.
  ```

  > ⚠️ **Naming only the symptom is what made this misdiagnosable.** The message used to say
  > *"review-task left it Planned"* and nothing else — not whether a report existed, not its age, not
  > the review's own verdict. A consumer with every relevant file installed read that, inferred that
  > `/review-task` never promotes out of `planned`, and filed a report against the wrong cause. The
  > three lines above are the three facts that distinguish "the review failed" from "the review
  > passed and a gate withheld the promotion", which need opposite responses.

---

## Post Review Outcome to Tracker Issue

After detecting outcomes and handling findings (non-blocking — skip if `TRACKER_ISSUE` is empty):

#### develop-story

```bash
mkdir -p .claude/state
cat > .claude/state/comment-body.md <<'EOF'
## 📋 Story Review Complete — Step 2/8

**Outcome**: {Ready for Development / Needs Revision}
**Review report**: {path, or 'not produced — see Issues Log'}
**Findings**: {brief summary of blocking/non-blocking issues, or 'No blocking issues found'}
EOF

node .agents/skills/{develop-story|develop-task|develop-bug}/references/tracker-comment.js \
  --issue {TRACKER_ISSUE} --body-file .claude/state/comment-body.md \
  --stage review \
  --slot outcome="{plain-language outcome — see below}" \
  --slot blocking="{blocking issue count, or omit the flag when there are none}" \
  --json
```

Read `reason` and act per the table in [`references/tracker-comment-contract.md`](tracker-comment-contract.md) — `posted`/`already`/`deferred` need nothing, `unverifiable` is logged and never posted over, and `no-credentials` is the one case that may fall back to MCP.

#### develop-task

```bash
mkdir -p .claude/state
cat > .claude/state/comment-body.md <<'EOF'
## 📋 Task Review Complete — Step 2/8

**Outcome**: {Ready for Development / Needs Revision}
**Review report**: {path, or 'not produced — see Issues Log'}
**Findings**: {brief summary of blocking/non-blocking issues, or 'No blocking issues found'}
EOF

node .agents/skills/{develop-story|develop-task|develop-bug}/references/tracker-comment.js \
  --issue {TRACKER_ISSUE} --body-file .claude/state/comment-body.md \
  --stage review \
  --slot outcome="{plain-language outcome — see below}" \
  --slot blocking="{blocking issue count, or omit the flag when there are none}" \
  --json
```

Read `reason` and act per the table in [`references/tracker-comment-contract.md`](tracker-comment-contract.md) — `posted`/`already`/`deferred` need nothing, `unverifiable` is logged and never posted over, and `no-credentials` is the one case that may fall back to MCP.

> **The two slots the `review` lead reads, and how to fill them.**
>
> **`outcome` is a text slot, interpolated verbatim into "— the result was …". Do not pass the review's
> raw verdict token.** `READY TO IMPLEMENT`, `NEEDS REVISION` and `REQUIRES REWORK` are internal
> vocabulary, and [`references/stakeholder-summary.md`](stakeholder-summary.md) requires internal
> tokens to be *mapped*, never passed through — the one paragraph written for a reader with no
> technical background is the last place a raw token belongs. Map at the call site:
>
> | Review verdict | `outcome` value |
> | :--- | :--- |
> | `READY TO IMPLEMENT` / GO | `ready to build` |
> | `NEEDS REVISION` | `needs more detail` |
> | `REQUIRES REWORK` / NO-GO | `needs rework` |
>
> **`blocking` is a boolean slot and its two renderings are opposites**, so getting it wrong says the
> wrong thing rather than saying nothing. A present, truthy value renders "Some things need answering
> before work can start"; absent renders "Nothing is blocking the work from starting". The engine reads
> `""`, `0`, `false`, `no`, `none`, `null`, `undefined` and `off` as **absent**, so passing a count of
> zero is safe — but omitting the flag when there are no blocking findings is clearer.

On failure: log warning in Issues Log and continue.

Do NOT post this comment when the path leads to a blocking HALT — commit + halt comes first and no comment is needed.

Log in Decisions Log: "Review outcome comment posted to {TRACKER} issue {TRACKER_ISSUE}."

---

## Update Pipeline Progress

#### develop-story
Update Pipeline Progress: ✅ review-story

#### develop-task
Update Pipeline Progress: ✅ review-task
