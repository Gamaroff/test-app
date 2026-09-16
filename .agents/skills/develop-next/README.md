# develop-next — setup & operating guide

`/develop-next` takes the next unblocked item on the consumer project's completion roadmap (`developNext.roadmapPath`, default `docs/development/project-completion-roadmap.md`) from "outstanding" to "merged + ticked" with zero prompts. `/loop /develop-next` chains runs until a stop condition (`manual` item, planning gap, or pipeline HALT). See [SKILL.md](SKILL.md) for the step protocol, [references/roadmap-selection.md](references/roadmap-selection.md) for selection rules, and [scripts/select-next.mjs](scripts/select-next.mjs) for the deterministic selector that implements them.

## One-time setup (before the first unattended run)

1. **Pipeline hooks** (shared with develop-story/develop-task — graceful pause on compaction, forced continuation on premature stop):
   ```bash
   bash .agents/skills/develop-story/scripts/install-hooks.sh
   ```
2. **Permission allowlist** — run `/fewer-permission-prompts` once so routine `git`, `gh`, and quality-gate calls don't stall the loop. Explicitly allowlist `gh pr merge` — it is the one hard-to-reverse action this skill automates; everything else was already automated by the pipelines.
3. **Permission mode** — run loop sessions in **acceptEdits**. Do not use `--dangerously-skip-permissions`; the allowlist + acceptEdits covers the pipeline with a bounded blast radius.
4. **Config** (optional) — add a `developNext:` block to `skills-config.yaml` to override the roadmap path, base branch, quality-gate command, or merge strategy. See the [configuration reference](../../docs/reference/configuration.md).
5. **Roadmap** — the skill reads a relative, configurable path (`developNext.roadmapPath`, default `docs/development/project-completion-roadmap.md`). If the file is absent, `/develop-next` does not invent work — it offers to scaffold a starter from [`assets/project-completion-roadmap.template.md`](assets/project-completion-roadmap.template.md) and stops for you to fill it in.

## What "green" means

The merge gate is layered — all of these must hold before `gh pr merge`:

- QA gate file `PASS` + document `accepted` (finalise output);
- the PR's `headRefOid` matches the locally-tested HEAD (never gate one commit and merge another);
- if the PR has CI checks, `gh pr checks` all green;
- `developNext.qualityGateCommand` (default `npm run ci` — the project's full CI-equivalent) clean on the branch being merged — this is the whole gate for projects that don't yet run CI on PRs.

## Operating model

- **One-shot:** `/develop-next` — one item, full report, stops.
- **Dry run:** `/develop-next --dry-run` — prints which item would be selected and why. **Read-only**: fetch only, no checkout/pull, no state file, no pipeline. Run this first in any new session. (The selection itself is also directly inspectable: `node .agents/skills/develop-next/scripts/select-next.mjs`.)
- **Parallel batch:** `node .agents/skills/develop-next/scripts/select-next.mjs --batch` — a planning aid for git-worktree fan-out. Returns the maximal set of ready rows that are also **write-disjoint** (no shared hard `touches:` tag), plus the `git worktree add … develop` commands. Requires `touches:` annotations on rows; see [references/roadmap-selection.md](references/roadmap-selection.md) §Parallel batch. Develop in parallel, **merge to `develop` serially**.
- **Continuous:** `/loop /develop-next` — self-paced; each iteration is one item. The loop ends itself at stop conditions and sends a push notification.
- **Continuous, with a fresh context each iteration:** `loop-supervisor` — spawns one `claude -p` process per iteration instead of re-invoking this conversation. `/loop` reuses one context, so item five is worked through a context mostly consumed by items one to four and the degradation is invisible from the outside. Costs a per-iteration re-prime (`CLAUDE.md`, the skill files, the roadmap — largely prompt-cache-served, but a real floor), so it is the wrong trade for a two-item queue and the right one for an overnight queue. See [`skills/loop-supervisor/README.md`](../loop-supervisor/README.md) and the [Unattended Overnight Runs runbook](../../docs/runbooks/unattended-overnight-runs.md).
- **Review cadence:** the loop runs continuously across stories and epics — story PRs merge straight to the base branch (`develop`), with no per-epic promotion or stop. Merges, ticks, and auto-answered decisions are all recoverable from the run report, each story's implementation report (Decisions Log), and the roadmap Change Log. To review at a boundary, stop the loop manually (or mark a roadmap row `manual`).
- **Planning gaps:** a roadmap row that names `/create-story` or `/create-epic` stops the loop _before_ authoring — those skills are interactive and their output needs human review. Run them in an attended session, then restart the loop.
- **Resuming after an interruption:** just run `/develop-next` again. Step 0 checks develop-next's own run-state file (`.claude/state/develop-next.state.json`) and the pipeline lock: a crash after merge but before the roadmap tick resumes at the tick — the item is never re-selected or re-dispatched.
