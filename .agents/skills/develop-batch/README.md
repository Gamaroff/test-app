# develop-batch — setup & operating guide

`/develop-batch` takes the next **batch** of dependency-ready, write-disjoint items on the
consumer project's completion roadmap from "outstanding" to "merged + ticked" with zero
prompts: it fans each item into its own git worktree, develops them **in parallel**, then
merges the green PRs **serially** (rebasing each on the new base tip) and ticks the roadmap
per item. `/loop /develop-batch` chains batches until the frontier is empty or a HALT.

It is the fan-out sibling of [`develop-next`](../develop-next/README.md): same selector,
same merge gate, same roadmap tick — extended from one item to the whole conflict-free
frontier. Use `develop-next` when you want one item at a time or a stop at every phase
boundary; use `develop-batch` when several items are ready and write-disjoint and you want
them developed concurrently. See [SKILL.md](SKILL.md) for the step protocol.

## The two axes (why a batch is safe)

An item may run alongside others only when **both** hold — and the `--batch` selector
enforces both:

1. **Dependency-ready** — every `deps:` / `⛔` / flow prerequisite is accepted (the exact
   predicate single-item selection uses; the `‖` marker signals this axis).
2. **Write-disjoint** — it shares no `touches:` tag that either side marks `!` (hard). Two
   dependency-independent stories can still both edit `app.module.ts` or add a Prisma model
   and collide on merge; the `touches:` write-footprint is the axis `deps:`/`‖` say nothing
   about.

Rows that share only `~` (soft) tags are batched anyway and surfaced as `softOverlaps` — the
"second-merger-rebases" points the serial finalize lane resolves automatically. Rows that
hard-conflict with a picked row go to `excluded[]` and wait for the next batch. Rows carry
these tags via a `touches:` annotation; the vocabulary (the conflict-footprint registry) is
project-specific and lives in the roadmap's Legend. An **un-annotated row is treated as
`+own`** (no shared resource) — optimistic, so annotate new rows as you add them.

## One-time setup (before the first unattended run)

1. **Linked-worktree-safe `create-branch`** — this skill runs pipelines inside worktrees
   while the base branch is checked out in the main tree. `create-branch` must create the
   `feature/…` branch from the base **ref** without checking out the base (see its
   SKILL.md §"Exception — linked worktree"). Ship that patch before the first batch run.
2. **Pipeline hooks** (shared with develop-story/develop-task — graceful pause on
   compaction, forced continuation on premature stop):
   ```bash
   bash <skillsDir>/develop-story/scripts/install-hooks.sh
   ```
3. **Permission allowlist** — run `/fewer-permission-prompts` once so routine `git`,
   `git worktree`, `gh`, and quality-gate calls don't stall the loop. Explicitly allowlist
   `gh pr merge` — it is the one hard-to-reverse action this skill automates.
4. **Permission mode** — run loop sessions in **acceptEdits**. Do not use
   `--dangerously-skip-permissions`; the allowlist + acceptEdits covers the pipelines with
   a bounded blast radius.
5. **Config** (optional) — `develop-batch` reuses the `developNext:` block in
   `skills-config.yaml` (roadmap path, base branch, quality-gate command, merge strategy)
   and adds `developBatch.maxParallel` (default 4). See the
   [configuration reference](../../docs/reference/configuration.md).
6. **Roadmap** — reads the same configurable path as `develop-next`
   (`developNext.roadmapPath`). If absent, the skill does not invent work — it offers to
   scaffold a starter from the shared
   [`develop-next/assets/project-completion-roadmap.template.md`](../develop-next/assets/project-completion-roadmap.template.md)
   and stops for you to fill it in (and to add `touches:` annotations so batching is safe).

## Execution resources (optional)

By default `develop-batch` treats every pipeline as interchangeable and caps concurrency at
`developBatch.maxParallel`. If your pipelines actually run on **different machines** — a
laptop and a build box, say — declare them and the scheduler will place work by rule instead
of by whoever is driving:

```yaml
developBatch:
  maxParallel: 4              # global ceiling
  worktreeSeedPaths: [".testrunner.env"]
  resources:
    - name: local
      capacity: 1             # runs share fixed ports → strictly one at a time
      testCommand: "npm test"
    - name: build-box
      capacity: 3             # runs are isolated → several can coexist
      testCommand: "ssh build-box make test"
      probe:
        command: "curl -fsS --max-time 5 $PROBE_URL/health"
        intervalSec: 60
```

**Set `capacity` from isolation, not speed.** A resource whose runs share host ports or one
database is `capacity: 1` — two concurrent runs there corrupt each other rather than merely
queueing.

**`worktreeSeedPaths` matters more than it looks.** A fresh `git worktree add` carries no
gitignored files, so a runner config that lives outside git is simply absent — and runners
typically respond by *silently* falling back to a local run rather than failing. That is how
a batch item reports green having never touched the machine it was assigned.

### Capacity probes

A probe answers "can this resource take more work *right now*". The contract is exit-code
first, so one line of shell is enough:

- exit 0, no output → available (static `capacity` governs)
- exit 0, `{"freeSlots": N}` → effective capacity is `min(capacity, inflight + N)`
- non-zero exit → **saturated**, withhold; first stdout line is logged as the reason
- timeout or spawn failure → **treated as available** (a flaky probe must never stall a batch)

A probe can only ever *subtract* capacity, never grant it — so a probe bug slows a batch but
cannot overload a host. Probes must be permission-allowlisted, or an unattended run stalls on
an approval prompt. Full contract and worked examples:
[`references/execution-resources.md`](references/execution-resources.md).

### Two things that will bite you

- **Dispatch in the background.** Rolling admission needs *individual* completions. Dispatch a
  group and await the group and you get wave barriers back under a different name — a freed
  slot sits idle until its slowest sibling finishes.
- **Never start a batch in plan mode.** Plan mode forbids writes, so every dispatched pipeline
  stops mid-flight quoting the plan-mode directive instead of failing its own gate. They are
  all resumable, but you will lose the run.

## What "green" means

Identical to `develop-next` — the per-item merge gate is layered, and all must hold before
`gh pr merge`:

- QA gate file `PASS` + document `accepted` (finalise output);
- the PR's `headRefOid` matches the locally-tested HEAD **after the rebase** (never gate one
  commit and merge another);
- if the PR has CI checks, `gh pr checks` all green;
- `developNext.qualityGateCommand` (default `npm run ci` — the project's full CI-equivalent) clean on the branch being merged.

## Operating model

- **One batch:** `/develop-batch` — fans out the current frontier, merges + ticks serially,
  full report, stops.
- **Dry run:** `/develop-batch --dry-run` — prints the batch, soft overlaps, excluded rows,
  and worktree commands. **Read-only**: fetch only, no worktrees, no state file, no
  pipeline. Run this first in any new session. (The selection is also directly inspectable:
  `node <skillsDir>/develop-next/scripts/select-next.mjs --batch`.)
- **Continuous:** `/loop /develop-batch` — self-paced; each iteration is one batch. The loop
  ends itself when the frontier is empty or a HALT fires, and sends a push notification.
- **Develop in parallel, merge serially.** Development fans out across worktrees; the
  merge-and-tick step edits the roadmap + Change Log (a guaranteed conflict) and is serial
  by nature. Never parallelize merges.
- **Resuming after an interruption:** just run `/develop-batch` again. Step 0 reads the
  batch run-state file (`.claude/state/develop-batch.state.json`) — items already `ticked`
  are skipped, in-flight pipelines re-enter via each worktree's own lock, and a crash
  between an item's merge and tick resumes at that item's tick. No item is ever re-selected
  or re-dispatched.
- **Cleanup discipline:** merged + ticked worktrees are removed with `git worktree remove`
  (never `rm -rf`). A `halted` item's worktree is deliberately left in place for you to
  inspect, finish, or discard.

## Relationship to the manual runbook

This automates the manual worktree fan-out a consumer project would otherwise run by hand
(`select-next.mjs --batch` → `git worktree add` per row → an agent per worktree → serial
merge + rebase → tick → `git worktree remove`). The selector, pipelines, and merge/tick
logic are unchanged; `develop-batch` is the orchestration layer that drives them.
