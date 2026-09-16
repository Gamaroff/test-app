---
name: develop-next
description: "Roadmap orchestrator: deterministically selects the next unblocked item from the project completion roadmap (via scripts/select-next.mjs), runs its named pipeline (/develop-story, /develop-task or /develop-bug) fully autonomously (Upfront Setup auto-answered with the recommended options), merges the green PR (story/task → develop), ticks the roadmap + Change Log, and reports. Crash-safe via a run-state file; re-running resumes where the last run stopped. Stops at manual/blocked items, planning gaps (/create-* rows), or any pipeline HALT. Invoke with `/develop-next`, `/develop-next --dry-run` (read-only selection preview), or wrap in `/loop /develop-next` for continuous runs."
invokes: [develop-story, develop-task, develop-bug]
---

# Develop Next — Roadmap Loop Orchestrator

Closes the three manual gaps in the roadmap workflow: **item selection**, the pipeline's **Upfront Setup prompt**, and **PR merging**. One invocation = one roadmap item taken from "next outstanding" to "merged + ticked". Everything else (branching, review, develop, QA loop, finalise) is delegated unchanged to `/develop-story` / `/develop-task` / `/develop-bug`.

Policy baseline (user-ratified 2026-07-11): auto-merge everything green; auto-answer routine questions with the recommended option and log them; stop at epic boundaries, `manual` items, and planning gaps; hard HALTs always stop the run.

## When to Use This Skill

- User says `/develop-next` (one item) or `/loop /develop-next` (continuous).
- User says "do the next roadmap item", "keep the roadmap rolling", "what's next — build it".
- `--dry-run`: report which item would be selected and why, then stop. **Read-only** — no checkout, no pull, no state file, no pipeline actions.
- `--batch` (planning aid, not a loop mode): `node .agents/skills/develop-next/scripts/select-next.mjs --batch` prints a **maximal set of ready rows that can be developed concurrently in separate git worktrees** — dependency-ready (same predicate as selection) **and** write-disjoint (no two share a `touches:` tag either marks `!`). Emits the batch, the soft overlaps accepted, rows held back by hard conflicts, and `git worktree add … develop` commands. Requires rows to carry `touches:` annotations (see [references/roadmap-selection.md](references/roadmap-selection.md) §Parallel batch). Advisory — runs nothing; the operator fans out worktrees and **merges to `develop` serially**.

## Configuration

Read once per run from the consumer project's `skills-config.yaml` (`developNext:` block); every key has a default:

| Key                              | Default                                          | Used in           |
| -------------------------------- | ------------------------------------------------ | ----------------- |
| `developNext.roadmapPath`        | `docs/development/project-completion-roadmap.md` | Steps 1, 3, 4     |
| `developNext.baseBranch`         | `develop`                                        | Steps 0, 3, 4     |
| `developNext.qualityGateCommand` | `npm run ci`                                     | Step 3 merge gate |
| `developNext.mergeStrategy`      | `merge` (one of `merge` / `squash` / `rebase`)   | Step 3            |

`mergeStrategy` is always written in `gh` vocabulary regardless of host; Step 3 translates it for Bitbucket (`merge` → `merge_commit`, `rebase` → `fast_forward`). Do not put Bitbucket strategy names in `skills-config.yaml`.

Apply any project-wide command conventions from the consumer project's own CLAUDE.md when running these (e.g. a required `env` prefix for `gh`).

**Hosting platform.** Steps 1 and 3 support **GitHub** (via `gh`) and **Bitbucket** (via the REST API), resolved per-run by `references/resolve-platform.sh` in Step 0. Bitbucket requires a REST credential in the environment — either `BITBUCKET_ACCESS_TOKEN` (a repository/project/workspace access token, sent as Bearer) or `BITBUCKET_USERNAME` plus `BITBUCKET_API_TOKEN` (an Atlassian API token with Bitbucket scopes, sent as Basic; `BITBUCKET_APP_PASSWORD` is honoured as a fallback), resolved by `references/bitbucket-auth.sh` — plus `curl` and `jq`.

## Run state (crash safety + single-flight)

`develop-next` records its own progress in `.claude/state/develop-next.state.json`:

```json
{
  "item": "17.4",
  "source": "roadmap",
  "command": "/develop-story",
  "commandArg": "<path>",
  "dispatched": false,
  "merged": false,
  "ticked": false,
  "startedAt": "<iso>"
}
```

Written at selection, updated after each of Steps 2–4, **deleted only in Step 5**. `source` is
`item.source` from the selector (`roadmap` | `bug-registry` | `task-registry`) and is what Step 4
reads on a resume — the work-item path alone cannot say which arm applies. This makes the merge→tick sequence recoverable (a crash between merge and tick can never cause the item to be re-selected and re-dispatched) and acts as develop-next's own single-flight lock.

## Step 0 — Preflight

1. **Run-state check.** If `.claude/state/develop-next.state.json` exists, a prior develop-next run did not finish — do **not** select a new item. Resume from the recorded flags: `merged: true, ticked: false` → go to Step 4; `dispatched: true, merged: false` → go to Step 3 (the pipeline's own lock/resume machinery covers a pipeline that is still mid-flight); otherwise → Step 2. In `--dry-run`: report the pending run and stop.
2. **Pipeline lock check.** If `.claude/state/develop-pipeline.lock` exists, a pipeline run is mid-flight: re-enter that run (invoke the locked skill's resume path per its Phase 0b) — do **not** select a new item on top of it.
3. **Dry-run short-circuit.** In `--dry-run` mode, run `git fetch origin <baseBranch>` (fetch only — never checkout or pull), then go straight to Step 1 against the working tree's roadmap. Skip 4–5.
4. `git status --porcelain` — if the working tree is dirty: **HALT**, list the dirty paths. Never stash or discard.
5. `git checkout <baseBranch> && git pull --ff-only origin <baseBranch>` — on non-ff or conflict: **HALT** with the git output.
6. **Resolve the platform.** Steps 1 and 3 talk to the hosting service; resolve `VCS` once here so both branch on the same value. See `references/platform-detection.md` for the full resolver spec.

   ```bash
   source references/resolve-platform.sh || exit 1
   # VCS = github | bitbucket; TRACKER = jira | github

   if [ "$VCS" = "bitbucket" ]; then
     # Portable across GNU and BSD sed — strip the host prefix and the .git
     # suffix in two passes rather than one lazy-quantified capture (`[^/]+?`
     # is a GNU extension; BSD sed rejects it with "repetition-operator
     # operand invalid").
     BB_PATH=$(git remote get-url origin | sed -E 's|.*bitbucket\.org[:/]||; s|\.git$||')
     BB_WORKSPACE=${BB_PATH%%/*}
     BB_REPO=${BB_PATH##*/}
     BB_API="https://api.bitbucket.org/2.0"
     # Resolve the REST credential once for the whole run. Sets BB_CURL_AUTH
     # (curl args) and BB_AUTH_SCHEME; non-zero when neither an access token
     # (Bearer) nor a username + API token (Basic) is set. HALT rather than
     # continue: an unauthenticated Bitbucket call returns 404, so Step 3 would
     # report "no PR found" instead of "no credentials".
     source references/bitbucket-auth.sh || {
       echo "No Bitbucket credential resolved — Step 3 cannot merge"; HALT; }
   fi
   ```

   > **Do not verify Bitbucket credentials with `GET /2.0/user`.** That endpoint requires the `read:user` scope, which app passwords scoped for PR work commonly lack — it returns 403 while PR and repository calls succeed. Verify against the repository instead (`GET ${BB_API}/repositories/${BB_WORKSPACE}/${BB_REPO}` → 200) if a preflight check is wanted at all.

## Step 1 — Select the next item

Run the deterministic selector — never eyeball the roadmap:

```bash
node .agents/skills/develop-next/scripts/select-next.mjs --roadmap <roadmapPath>
```

Selection rules, marker vocabulary, and edge-case semantics: [`references/roadmap-selection.md`](references/roadmap-selection.md). The script is the authoritative implementation; if its output looks wrong, fix the roadmap (or the script) — do not hand-pick an item.

> **A selection may come from a registry, not the roadmap.** When no phase holds an actionable row — and *only* then — the selector falls through to `docs/bugs/bug-registry.md` and `docs/tasks/task-registry.md`, so a filed bug or task cannot be invisible to the loop. `item.source` names the provenance on **every** selection (`roadmap` | `bug-registry` | `task-registry`); report it. Precedence is absolute (an authored phase always wins), eligibility is the document's own frontmatter rather than the registry row, and the four deliberate stops below are **never** pre-empted — only `roadmap-complete` is. Full rules: [`references/roadmap-selection.md`](references/roadmap-selection.md) §"Registry fallback frontier".

Act on the JSON `status`:

- **`halt` with `missing: true`** (no roadmap file at `roadmapPath`) → this project has no completion roadmap yet. **Do not fabricate one.** In an interactive/one-shot run, offer to scaffold a starter from [`assets/project-completion-roadmap.template.md`](assets/project-completion-roadmap.template.md) at `roadmapPath` (create parent dirs), then **STOP** for the user to populate it with real items — an empty roadmap has nothing to build. In a `/loop` run, **STOP** and notify (no one is present to author it). Never auto-create-and-proceed.
- **`selected`** → record the `item` (including `item.source`), `rationale`, and `skipped[]` for the run report; write the run-state file. In `--dry-run`: print them and **stop here**.
  - **Already-done guard:** if the item's document frontmatter is already `status: accepted` and its PR is merged, the roadmap tick was lost — skip straight to **Step 4**. Query per `VCS` (resolved in Step 0), or fall back to the document's own PR link:

    ```bash
    if [ "$VCS" = "bitbucket" ]; then
      curl -sf "${BB_CURL_AUTH[@]}" --get \
        --data-urlencode 'q=source.branch.name="<branch>" AND state="MERGED"' \
        "${BB_API}/repositories/${BB_WORKSPACE}/${BB_REPO}/pullrequests" | jq -r '.values[0].id // empty'
    else
      gh pr list --state merged --head "<branch>" --json number --jq '.[0].number // empty'
    fi
    ```
- **`stop`** → **STOP**: report `stopReason` + `detail`, send a push notification, end the loop. Reasons: `human-gated` (`manual`/🚧 frontier), `planning-gap` (a `/create-story` / `/create-epic` row — authoring is interactive and its output needs human review, so it is never run unattended), `manual-checkpoint` (the next item names no runnable command — only `/develop-story`, `/develop-task` and `/develop-bug` are runnable — or no resolvable path — e.g. a "run `/review-prd`" checkpoint), `phase-blocked`, `roadmap-complete`. The first four are deliberate operator decisions and are never scanned past; `roadmap-complete` now means the roadmap **and** both registries are exhausted.
- **`halt`** (no parseable roadmap content, exit 1) → **HALT**: surface `lint.errors` verbatim. The selector is deliberately tolerant (archived deps, recap rows, and annotation rows are non-fatal warnings — see [`references/roadmap-selection.md`](references/roadmap-selection.md)); a halt means the file could not be parsed as a roadmap at all. `⏭️`/`SKIP` rows are stepped past automatically and never stop the loop. The dispatched command and its work-item path both come from the selector's `item.command` / `item.commandArg`.

## Step 2 — Dispatch the pipeline

Invoke the item's named command (`/develop-story <path>`, `/develop-task <path>` or `/develop-bug <path>`), prepending this directive to the invocation context (same mechanism as the lite-mode directive in `develop-pipeline-autonomous-defaults.md` — the pipeline's own reference files are AUTO-GENERATED and must not be edited). Mark `dispatched: true` in the run state.

> **AUTONOMOUS RUN (develop-next):** For the Phase 0d Upfront Setup questions, take the auto-derived recommended option for **every** question without prompting — whatever that pipeline's question set is. For `/develop-story` and `/develop-task` that is Q1 = base branch, `develop` and Q2 = PR target, `develop`. For `/develop-bug` it is Q1 = branch model (**bugfix** unless the bug is explicitly a production regression), with Q2 base branch and Q3 PR target auto-derived from Q1 — do **not** re-map the story/task Q-numbers onto it. For the Phase 0b resume prompt, choose "Resume from last completed step". Record every auto-answer in the Decisions Log. All existing HALT conditions remain HALTs.

If the pipeline HALTs (review NO-GO, develop stall, 5 QA cycles without PASS, qa-fix with no changes, DoD gaps, unexpected status): **STOP** — surface the pipeline's own HALT report verbatim, send a push notification, do not merge, do not tick. Leave the run-state file in place so the next invocation resumes here.

## Step 3 — Merge the green PR

Runs only after the pipeline completes Step 8 with the PR open and the item `accepted`.

Every command below branches on `VCS` (resolved in Step 0). The GitHub path is unchanged; the Bitbucket path uses the REST API because `gh` cannot address a Bitbucket remote at all (`gh repo view` fails outright — it is not a fallback, it is inoperable).

1. **Verify green:**
   - **The document frontmatter is `accepted`, the QA gate is not `FAIL`, and the gate's `top_issues[]`
     holds no entry still `open`.** `accepted` is the load-bearing condition: it is `/finalise`'s verdict,
     and `/finalise` has already weighed the gate through its DoD matrix — which accepts a `CONCERNS`
     gate with no open findings, and a `WAIVED` gate whose waiver is documented. Re-checking the gate's
     *token* here would second-guess that verdict with less information than `/finalise` had (task.105
     was halted at 90/100, accepted, CI 5/5, on the literal `PASS`). Re-checking for **open findings**
     does not — that is a fact the token can hide in either direction, and it is the one thing this
     gate adds. Read the newest `*.gate.{N}.*.yml` beside the document:

     | Document `status` | Gate decision          | `top_issues[]` has an `open` entry | Action                                                    |
     | :---------------- | :--------------------- | :--------------------------------- | :-------------------------------------------------------- |
     | `accepted`        | `PASS`                 | — (none)                           | merge                                                     |
     | `accepted`        | `CONCERNS`             | no                                 | merge                                                     |
     | `accepted`        | `WAIVED`               | no                                 | merge (the waiver is a recorded human decision)           |
     | `accepted`        | `CONCERNS` / `WAIVED`  | **yes**                            | **HALT** — an open finding survived finalise              |
     | `accepted`        | `FAIL`                 | any                                | **HALT**                                                  |
     | not `accepted`    | any                    | any                                | **HALT** — finalise did not accept                        |
     | `accepted`        | missing / unparseable  | —                                  | **HALT** — cannot establish the no-open-finding condition |

     An entry is open when its `status:` is absent or reads `open`; `resolved`, `fixed`, `closed`,
     `waived` and `deferred` (with a named owner) are not open. **One exception, and it is what makes
     the `WAIVED` row reachable:** under `gate: WAIVED` with `waiver.active: true`, the entries in
     `top_issues[]` *are* the waived findings — `qa-gate`'s own schema keeps them there with no
     `status:` field, and no skill stamps `status: waived` — so entries without a `status:` count as
     waived, not open. Without this clause every waived gate matched the HALT row and the waiver row
     could never fire. The two clauses below are about *this commit* and cannot be inferred from
     `accepted` — they stay regardless of the row matched here.
   - **Head-SHA check** — the PR's source commit must equal `git rev-parse HEAD` on the local PR branch. Mismatch means the branch moved since it was tested → **HALT** (never gate one commit and merge another).

     ```bash
     if [ "$VCS" = "bitbucket" ]; then
       PR_HEAD=$(curl -sf "${BB_CURL_AUTH[@]}" \
         "${BB_API}/repositories/${BB_WORKSPACE}/${BB_REPO}/pullrequests/${PR_ID}" \
         | jq -r '.source.commit.hash')
       PR_STATE=$(curl -sf "${BB_CURL_AUTH[@]}" \
         "${BB_API}/repositories/${BB_WORKSPACE}/${BB_REPO}/pullrequests/${PR_ID}" \
         | jq -r '.state')
     else
       PR_HEAD=$(gh pr view "$PR_ID" --json headRefOid --jq '.headRefOid')
       PR_STATE=$(gh pr view "$PR_ID" --json state --jq '.state')
     fi
     # Bitbucket returns the full 40-char hash; compare on the common prefix.
     [ "${PR_HEAD:0:12}" = "$(git rev-parse HEAD | cut -c1-12)" ] || HALT
     ```

   - **CI checks** — if the PR has them, all must be green.
     - **GitHub:** `gh pr checks <PR#>` — but see **How to wait for CI** below before treating a pending result as a wait.
     - **Bitbucket:** `GET ${BB_API}/repositories/${BB_WORKSPACE}/${BB_REPO}/commit/${PR_HEAD}/statuses` — every `values[].state` must be `SUCCESSFUL`. An **empty** `values[]` means no CI reported (Pipelines disabled, or the run has not posted yet) → treat as _no checks_, not as failure.
     - **Best-effort on Bitbucket:** this call needs the app password's `read:pipeline` scope. A `403 "Your credentials lack one or more required privilege scopes"` is **not** a merge blocker — log a warning and continue to the quality gate. Bitbucket app passwords are commonly scoped to PR + repository access only, and failing the merge on a _missing read permission_ would block every merge on an otherwise-green PR.

     **How to wait for CI — `gh pr checks` does not block.** It returns immediately and uses a
     dedicated **exit code 8** to mean "checks are still pending". Read the rollup one-shot
     instead, discriminating on `.status == "COMPLETED"` before reading `.conclusion` — a running
     CheckRun returns `conclusion: ""` (an empty string, not null), so `.conclusion // .state`
     reports a running job as green. This is the form `/finalise` already uses; take it from there
     rather than re-deriving it:

     ```bash
     gh pr view "$PR_ID" --json statusCheckRollup \
       -q '[ .statusCheckRollup[]
             | (.status // "") as $st
             | (if   $st == ""          then (.state // "")
                elif $st == "COMPLETED" then (.conclusion // "")
                else "PENDING" end)
             | if . == "" then "PENDING" else . end ]
           | if length == 0 then "NONE"
             elif any(. == "FAILURE" or . == "TIMED_OUT" or . == "ERROR"
                      or . == "STARTUP_FAILURE" or . == "ACTION_REQUIRED") then "FAILURE"
             elif any(. == "PENDING" or . == "EXPECTED" or . == "QUEUED"
                      or . == "IN_PROGRESS" or . == "WAITING") then "PENDING"
             elif any(. == "CANCELLED") then "CANCELLED"
             else "SUCCESS" end' 2>/dev/null || echo "UNKNOWN"
     ```

     If a genuine wait is needed, **background it** — a poll loop written to a file, checked on a
     later turn. Never a foreground call that can outlive the tool timeout.

     > **`gh pr checks --watch` is forbidden in the foreground.** It blocks until CI finishes.
     > On a 23-minute serial CI lane it simply exceeds the 10-minute tool timeout, and an agent
     > that reaches for it burns one full timeout per attempt learning nothing — observed three
     > times on one PR. The flag appears nowhere in this repo for that reason.

   - **Always**, on both platforms and regardless of CI: run `<qualityGateCommand>` on the PR branch. This is the real gate — not every project runs CI on PRs, and on Bitbucket the CI read may be unavailable per the note above.

     > **This gate must be the project's full CI-equivalent, and the default now is.** It defaulted
     > to `npm test` until 2026-09-01, which ran one of the three commands the CI job runs — so a
     > branch could pass every local gate the pipeline has and still go red. It did, on task 67:
     > `prettier --check` flagged two new files after `/finalise` had already accepted the task, and
     > `eval:all` had never run locally at any step of any pipeline. The default is now `npm run ci`,
     > the composite CI itself calls. An explicit `qualityGateCommand` in `skills-config.yaml` still
     > wins — a consumer who wants the cheaper, weaker gate states it.
     >
     > This is the **slow** tier and belongs here, at the last point before merge, not in the
     > develop loop. The fast tier is `develop.fastGateCommand` (suggested value `npm run ci:fast`,
     > which the develop loop verifies resolves before its first iteration), run per iteration, per
     > qa-fix cycle and per `develop-bug` verify cycle; paying the eval tier on every iteration is
     > what would make the correct fix feel expensive enough to be reverted.
   - Any failure other than the tolerated 403 → **HALT**: report the failing command's output, do not merge, do not tick.

2. **Merge** with the configured strategy.

   `mergeStrategy` is expressed in `gh` vocabulary (`merge` / `squash` / `rebase`) and **must be translated** for Bitbucket, whose API accepts a different, non-overlapping set. Passing `merge` straight through is rejected:

   | `developNext.mergeStrategy` | GitHub (`gh pr merge`) | Bitbucket (`merge_strategy`) |
   | --------------------------- | ---------------------- | ---------------------------- |
   | `merge` (default)           | `--merge`              | `merge_commit`               |
   | `squash`                    | `--squash`             | `squash`                     |
   | `rebase`                    | `--rebase`             | `fast_forward`               |

   ```bash
   if [ "$VCS" = "bitbucket" ]; then
     case "$mergeStrategy" in
       merge)  BB_STRATEGY=merge_commit ;;
       squash) BB_STRATEGY=squash ;;
       rebase) BB_STRATEGY=fast_forward ;;
       *)      echo "unknown mergeStrategy: $mergeStrategy" && HALT ;;
     esac
     # close_source_branch is Bitbucket's equivalent of gh's --delete-branch.
     jq -n --arg m "Merge PR #${PR_ID}: ${PR_TITLE}" --arg s "$BB_STRATEGY" \
       '{type:"pullrequest",message:$m,merge_strategy:$s,close_source_branch:true}' \
       > /tmp/dn-merge.json
     MERGE_RESULT=$(curl -s -X POST \
       -H "Content-Type: application/json" \
       "${BB_CURL_AUTH[@]}" \
       --data-binary @/tmp/dn-merge.json \
       "${BB_API}/repositories/${BB_WORKSPACE}/${BB_REPO}/pullrequests/${PR_ID}/merge")
     rm -f /tmp/dn-merge.json
     # MERGED is the only success state; anything else (conflict, protection,
     # scope error) carries an `error.message` — surface it verbatim.
     [ "$(echo "$MERGE_RESULT" | jq -r '.state')" = "MERGED" ] || HALT
   else
     gh pr merge "$PR_ID" --"$mergeStrategy" --delete-branch
   fi
   ```

   On merge failure (conflict, protection): **HALT** with the platform's output verbatim. Mark `merged: true` in the run state only on success.

   > **Parsing note (Bitbucket):** the merge response embeds rendered HTML that can contain raw control characters, which makes some `jq` invocations fail on the _response_ even though the merge itself succeeded. **Never retry a merge on a parse error** — re-query `GET …/pullrequests/${PR_ID}` and check `.state` first, or you risk a duplicate merge attempt against an already-merged PR.

3. **Signal the `pr-merged` stage** (only after the merge actually succeeded, and before the Step 4 tick). Skip silently when the item has no linked tracker issue. Read `TRACKER` and the item's issue key from the merged document's frontmatter (`github_issue:` / `jira_key:`):

   ```bash
   # TRACKER=jira
   node .agents/skills/develop-next/references/jira-stage.js \
     --issue "$TRACKER_ISSUE" --stage pr-merged --json

   # TRACKER=github
   node .agents/skills/develop-next/references/gh-stage.js \
     --issue "$TRACKER_ISSUE" --stage pr-merged --json
   ```

   **This moment exists because it is the only one that can fire here.** The develop pipelines finish while the PR is still open — Step 7 (`/finalise`) moves the card to `done` with nothing merged yet. `pr-merged` is the first and only signal that the code is actually on `<baseBranch>`.

   > **Ordering, which is genuinely confusing:** a board that wants a card to sit in a merge or showcase queue until the PR really lands should **omit `done:` from `pipeline:` entirely** and let `pr-merged` be the last automated move. Leaving both on means the card reaches `done` at Step 7 and then moves again after the merge — which is coherent only if the post-merge column sits *after* Done on that board's ladder.

   `pr-merged` is **off by default** — absent from the built-in `pipeline:` map, so it fires nowhere until a consumer names a status for it. Non-blocking: the CLI exits 0 for `stage-disabled`, `no-option`, `no-transition` and `not-on-board` alike. **Never let it block the roadmap tick** — the merge has already happened and is not undone by a board that would not move.

   Log in the run report: "pr-merged: {landed status / disabled / skip reason}."

   Story PRs normally target `<baseBranch>` (default `develop`) directly, and nothing special happens when an epic's last story merges.

   > **Epics using an integration branch are only partly automated.** If a story's epic declares
   > `branch_model: epic-integration`, `/develop-story` bases that story on the epic's integration branch
   > and its PR targets that branch. The merge here is correct without changes — the platform merges each
   > PR into the base the PR itself declares, not into `<baseBranch>`.
   >
   > **But nothing promotes the integration branch to `<baseBranch>`.** There is no epic-completion check
   > and no epic→base promotion step (both were removed in v0.24.0 along with the mandatory epic-branch
   > model, and reinstating them is not part of the opt-in feature). So for such an epic:
   >
   > - Step 4 still ticks the roadmap on `<baseBranch>` as each story merges — correct, the roadmap tracks
   >   stories, not branches.
   > - The epic's work accumulates on the integration branch and **stays there**. Raise and merge the final
   >   `epic/{n}.{name}` → `<baseBranch>` PR **by hand** once every story is in.
   > - Do not read "all this epic's rows are ticked" as "the epic has landed on `<baseBranch>`". It has not.

## Step 4 — Record the acceptance

On `<baseBranch>` (pull first if Step 3 merged into it). **Branch on `item.source`** — the `source`
field of the run-state file, written at Step 1 so a resume into this step (`merged: true, ticked:
false`) has it without re-deriving anything — the roadmap and the registries are different documents
with different owners, and the step used to know only the first. Five registry-sourced runs each improvised the second (#30, #31,
#34, #35) before this branch existed.

### `item.source` = `roadmap`

1. Tick the item `[x]` and rewrite its row in the roadmap's own accepted-row convention — copy the format of an existing ✅ row; if none exists yet, use `✅ **accepted + merged** ([PR #N](url), QA PASS S/100)`.
2. Add a Change Log row (next version number, same table format, author `Claude`) describing what landed.
3. If an epic completed: update the roadmap's status-snapshot table and the epic's section header the same way previously completed epics are recorded.
4. Commit and push:
   ```bash
   git add <roadmapPath>
   git commit -m "docs(roadmap): tick <id> [x] — <short summary>"
   git push origin <baseBranch>
   ```
   If the push is rejected (non-ff): `git pull --rebase origin <baseBranch>` once and retry; if it is still rejected (e.g. branch protection): **HALT** with the git output — the run state preserves `merged: true, ticked: false` for manual recovery.
5. Mark `ticked: true` in the run state.

### `item.source` = `task-registry`

A registry item has **no roadmap row and gets none** — and no roadmap Change Log row either; both
are for phase-row items only (roadmap Housekeeping, 2026-09-12). Its Status cell is **already
`accepted`**: `/finalise` wrote it at pipeline Step 7 through `registry-tick.js`, in the same moment
it wrote the document's `status: accepted`. This step must therefore be **additive** — the notes cell
and, when the run created a tracker issue, the `Issue` cell — and never a second Status writer (#46).

1. Record the merge with the engine — one call, never a hand-rolled sed:
   ```bash
   ISSUE_REF=""   # `[#N](url)` when the document now carries github_issue:/jira_key:, else leave empty
   # An ARRAY, not a `:+` parameter expansion: zsh does not word-split an
   # expansion, so that form hands the engine `--issue [#N](url)` as ONE
   # argument and it exits 2 — on exactly the case the Issue cell exists for.
   ISSUE_ARGS=()
   [ -n "$ISSUE_REF" ] && ISSUE_ARGS=(--issue "$ISSUE_REF")
   node .agents/skills/develop-next/references/registry-tick.js --annotate \
     --file <item.commandArg> --pr <PR#> "${ISSUE_ARGS[@]}" --json
   ```
   It appends `· PR #<n> merged` to the row's last cell (the registry's notes cell — `Depends on` in
   the documented header; rows 100–106 already carry it there), fills `Issue` only when that cell
   reads as empty (`—`, `none`, `n/a`, `tbd` …), and leaves Status alone. Read `reason`:
   - `annotated` → commit below.
   - `already` → the row already names this PR. **Idempotent on the row, not on the commit**: a
     resume after a crash *between the annotate write and the `git commit`* arrives here with the
     registry edited and uncommitted — **staged or not**: `git diff` without `HEAD` compares the
     working tree to the index and reads a staged-but-uncommitted edit as clean, which is the other
     half of the same window — and the resume path skips Step 0's dirty-tree check. So before
     marking ticked, compare against `HEAD` and commit what may already be on disk:
     ```bash
     git diff --quiet HEAD -- docs/tasks/task-registry.md || {
       git add docs/tasks/task-registry.md
       git commit -m "docs(registry): record <id> — PR #<n> merged"
     }
     ```
     A clean tree means the earlier commit exists locally — not that it was pushed: a crash between
     `git commit` and `git push` leaves it local-only. So push unconditionally (idempotent when
     nothing is ahead) before marking ticked:
     ```bash
     git push origin <baseBranch>
     ```
     Then log `already` and mark `ticked: true`.
   - every other exit-0 reason — `no-row`, `no-registry`, `no-cell`, `not-accepted`, `not-a-task`,
     `engine-unavailable` — log it verbatim, make no commit, mark `ticked: true`. The drift test is
     the backstop, and a missing or unannotatable index line never blocks a merge that has already
     happened. (Exit 2 is a usage error in this step's own invocation — fix the call, do not mark
     ticked.)
2. Commit and push (only on `annotated`):
   ```bash
   git add docs/tasks/task-registry.md
   git commit -m "docs(registry): record <id> — PR #<n> merged"
   git push origin <baseBranch>
   ```
   Same non-ff rule as the roadmap arm.
3. Mark `ticked: true` in the run state.

### `item.source` = `bug-registry`

The bug registry (`# | Title | Status | Severity | Priority | Created | Area`) has **no Issue cell and
no notes cell**, and `develop-bug` has already flipped Status to `closed`. There is nothing for this
step to write: log `registry: bug-registry has no cell to record PR #<n> — nothing to write`, make
no commit, and mark `ticked: true`. (`registry-tick.js --annotate` answers `not-a-task` for a bug
document, which is the same fact from the engine's side.)

> **Whichever arm ran, the run report names it** — "roadmap ticked", "registry annotated (line N)",
> "registry: already", or "bug-registry: nothing to write". A run that says nothing about Step 4 is
> indistinguishable from one that skipped it.

## Step 5 — Report + continue/stop

Delete the run-state file, then end every run with a report: item id + title, PR(s) merged, QA score, quality-gate result, the Decisions Log of auto-answers, and the next eligible item (re-run the selector with `--dry-run` semantics — selection only).

**Stop the loop** (and send a push notification) when any of these hold; otherwise end with `next item: <id> — loop may continue`:

| Stop condition                                          | Why                                                      |
| ------------------------------------------------------- | -------------------------------------------------------- |
| Selector returned `human-gated`                         | Requires the operator                                    |
| Selector returned `planning-gap` (`/create-*` row)      | Authoring is attended work; never run it unattended      |
| Selector returned `manual-checkpoint` (no command/path) | Item needs an operator action (e.g. a review checkpoint) |
| Selector returned `phase-blocked`                       | Phases are hard boundaries — operator decides            |
| Any pipeline HALT or merge/quality-gate failure         | Fail loudly, never merge red                             |
| Selector returned `halt` (roadmap parse/lint errors)    | Don't guess on sequencing                                |

## Continuous mode

`/loop /develop-next` (no interval — self-paced). Each iteration runs one item; when a run ends with a stop condition, end the loop (do not schedule another wakeup). One-time setup for unattended runs — permission allowlist, pipeline hooks, CI caveat — is in [`README.md`](README.md).

> **For a long or overnight queue, prefer `loop-supervisor`.** `/loop` re-invokes **this** conversation
> every iteration, so item five is worked through a context mostly consumed by items one to four — and a
> skill cannot clear its own context, so the loop has to move outside the session to fix it.
> `loop-supervisor` spawns one `claude -p` per iteration with a fresh context and a pinned session id,
> classifies each outcome from filesystem post-conditions rather than from prose, and writes a
> per-iteration ledger every line of which is reopenable with `claude --resume <sessionId>`.
>
> It is not free: every iteration re-primes `CLAUDE.md`, the skill files and the roadmap. That should be
> largely prompt-cache-served since the prefix is identical across iterations, but it is a real
> per-iteration floor. For two or three items with someone at the keyboard, `/loop /develop-next` is
> simpler and cheaper; for a twelve-item overnight queue, the re-prime is what buys an iteration-12 as
> sharp as iteration-1.
>
> See [`skills/loop-supervisor/README.md`](../loop-supervisor/README.md) and the
> [Unattended Overnight Runs runbook](../../docs/runbooks/unattended-overnight-runs.md).
