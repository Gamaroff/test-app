---
name: loop-supervisor
description: Run an unattended sequential loop where every iteration gets a fresh Claude process and a fresh context, and each outcome is classified from filesystem post-conditions rather than from the assistant's prose. Use when a roadmap loop must run for hours or overnight without quality decaying — the built-in /loop re-invokes the same conversation each time, so late iterations work through a context consumed by the early ones, and a skill cannot clear its own context. Spawns one `claude -p` per iteration with a pinned session id, probes for work before spending a model invocation, writes a per-iteration ledger and log, and stops on an empty frontier, a halt, a budget cap, or repeated no-progress. Triggers — run the roadmap overnight, fresh context each iteration, unattended loop, why does the loop get worse over time.
invokes: [develop-next]
---

# loop-supervisor

## What this is, and how it differs from `/loop`

`/loop /develop-next` and this are not two ways to do the same thing.

|                    | built-in `/loop`                              | `loop-supervisor`                                       |
| ------------------ | --------------------------------------------- | -------------------------------------------------------- |
| Where an iteration runs | the **same** conversation, re-invoked      | a **new** `claude -p` process                            |
| Context at iteration 5 | items 1–4 still in it (auto-compacted)     | empty                                                     |
| Who decides the outcome | the model, in prose                       | a pure classifier, from files on disk                     |
| Record of the run  | the transcript                                 | `runs.jsonl` + one log pair per iteration                 |
| Launched by        | Claude                                         | **you**, from a terminal — it spawns Claude, not the reverse |

The problem it exists for: both `/loop` paths — the cron path (`CronCreate`) and the self-paced path
(`ScheduleWakeup`) — re-invoke the *same* conversation, so each iteration starts on top of the
accumulated transcript from all the previous ones, and auto-compaction summarises rather than clears.
On a long unattended run the model works item five through a context mostly consumed by items one to
four. **The failure is not a crash — it is quality degradation with no external signal.** The loop keeps
reporting success while the work gets worse. `/loop` cannot fix this from the inside: the wakeup lands
in the session that already exists, and clearing context is not an operation a skill can perform on
itself.

## When to use it

- An overnight or multi-hour roadmap run where late iterations must be as good as the first.
- Any unattended run where you want a per-iteration record you can reopen afterwards.
- Diagnosing "the loop said it was fine but the work got worse".

Use the built-in `/loop` instead for short attended runs, for polling, or for anything where carrying
context **between** iterations is the point.

## Launching it

```bash
# See what would happen. Probes, prints the plan and the exact claude argv, spawns nothing.
node .agents/skills/loop-supervisor/scripts/run-loop.mjs dry-run --adapter develop-next

# Run the roadmap until the frontier empties, capped at 8 hours and $20.
node .agents/skills/loop-supervisor/scripts/run-loop.mjs run \
  --adapter develop-next --max-duration 8h --max-cost 20

# Any prompt, twice.
node .agents/skills/loop-supervisor/scripts/run-loop.mjs run \
  --adapter generic --command "/review-code" --max-iterations 2
```

Run it from the repo root. Full option list, log layout, the `claude --resume` recipe, the PATH
caveats and an honest note on per-iteration cost: [`README.md`](README.md).

## How one iteration works

1. **Probe** — run the adapter's probe (for `develop-next`, `select-next.mjs`). Branch on `.status`,
   never on the exit code: `selected` and every `stop` both exit 0. `stop` ends the loop having spent
   nothing. **Skipped entirely when a run-state file exists** — an unfinished run is resumed, not
   re-selected.
2. **Spawn** one `claude -p` with a pinned `--session-id`, `--permission-mode acceptEdits`, and a
   pinned `--settings` file so the run does not inherit local settings drift.
3. **Watch** — poll `develop-pipeline.lock` every ~5s for `current_step` / `branch` / `pr_url`, and
   write `current.json`. This is the only source of *sub-step* granularity; a run-state file's booleans
   cannot express "QA cycle 3 of 5".
4. **Classify** from the filesystem — see below.
5. **Record** — append to `runs.jsonl`.
6. **Decide** — apply the stop policy, cooldown, repeat.

## Outcomes

| Outcome      | Detected by                                                                  | Loop action                        |
| ------------ | ----------------------------------------------------------------------------- | ---------------------------------- |
| `progress`   | no state left behind **and** the adapter's progress oracle fired              | continue; reset the idle counter   |
| `done`       | the probe returned `stop` before spawning                                     | stop, clean                        |
| `halt`       | a halt file whose timestamp is **newer than this iteration's start**          | stop (or continue under `--on-error continue`) |
| `incomplete` | the run-state file or the pipeline lock is still on disk                      | resume while the budget allows     |
| `error`      | non-zero exit, `is_error`, or `subtype` ∈ `error_max_turns` / `error_during_execution` | stop                       |
| `idle`       | clean exit, oracle silent                                                     | continue until `--max-idle`        |

**The classifier never reads the assistant's prose**, and that is the single most important constraint
in the design. `/develop-next` signals its stop conditions only in its final message — there is no exit
code that distinguishes them, no run-report file, no stop-marker. Grepping that message would put a
model call inside a control-flow decision and would break silently the first time the wording changed.
The classifier is [`references/classify.js`](references/classify.js), pure and separately tested.

Two traps shape that table, and both are unit-tested on **both** sides of their boundary:

- **A halt file is never deleted by a successful run.** It is overwritten on each halt and left behind
  forever otherwise, so its existence proves nothing — only its timestamp does. A stale halt file must
  classify `progress`, not `halt`.
- **The `Stop` hook leaves a lock behind.** `develop-pipeline-on-stop.sh` blocks a mid-pipeline stop,
  and `stop_hook_active` caps that to one block, so a stalled iteration exits cleanly *with the lock
  still on disk*. That is designed behaviour, so `incomplete` is a first-class outcome with a bounded
  resume budget, not an error.

## Stop policy

First to trigger wins: **frontier empty** (the probe said `stop`) · **halt or error**
(`--on-error stop|continue`) · **budget** (`--max-iterations`, `--max-cost`, `--max-duration`) ·
**consecutive no-progress** (`--max-idle`, default 2 — this is what catches silent spinning).

First `SIGINT` stops after the current iteration finishes — never mid-merge. Second kills the child and
exits, leaving state for the next resume. A PID lock at `.claude/state/loop-supervisor.lock` enforces
single-flight: two supervisors in one working tree would collide on `develop-pipeline.lock`.

## Artifacts

Under `.claude/state/loop-supervisor/`:

- `current.json` — heartbeat, rewritten ~5s atomically (temp + rename), removed on clean exit
- `runs.jsonl` — append-only, one line per finished iteration
- `logs/<runId>/iter-NNN.jsonl` — raw `stream-json`, full fidelity
- `logs/<runId>/iter-NNN.txt` — assistant text plus tool-call names; the one a human reads
- `logs/latest` — symlink to the current run

### Reading them while it runs

```bash
run-loop.mjs status          # one-shot snapshot; --json for machines
run-loop.mjs watch           # the same, repainted every ~2s
```

Both are **pure readers** — no lock, no writes, nothing spawned — so they are safe from a second
terminal, over SSH, concurrently, and mid-iteration. Four states: `running`; `no run in flight` (the
normal post-run state, exit 0, not an error); `CRASHED SUPERVISOR` (heartbeat present, pid dead — the
values are the last recorded, not live); and `HEARTBEAT UNREADABLE` (present but unparseable — state
unknown, explicitly *not* "no run"). Liveness is a pid probe, not a timeout, because the heartbeat
legitimately pauses between iterations. The heartbeat is written atomically (temp file, then rename). `watch` repaints in place and never clears scrollback.

`--notify` (macOS `osascript`) and `--webhook <url>` (ntfy-shaped POST) fire **once, when the loop
ends**, naming the reason — never per iteration. A failed notification warns and leaves the run's exit
status untouched.

`--dashboard <url>` (with `--dashboard-token`, or `$LOOP_SUPERVISOR_DASHBOARD_TOKEN`) POSTs a status
frame on each **iteration boundary**, ending with one `active: false` frame. What ships is a documented
payload, not an integration — the dashboard lives in the consumer repo. A push failure warns once and
never affects the run's outcome or exit status, proved by tests that break it on purpose. Full payload
contract, field semantics and consumer-side warnings: [`README.md`](README.md#publishing-the-run-to-a-dashboard).

Because `--session-id` is pinned, **every iteration is reopenable afterwards** with
`claude --resume <sessionId>` (the id is in each `runs.jsonl` line). That is the strongest debugging
affordance here.

## Adapters

Three ship — `develop-next`, `develop-batch`, `generic` — in
[`references/adapters.js`](references/adapters.js). Each names its probe, its state files, and what
counts as progress. A consumer's own command is configured declaratively in `skills-config.yaml`
(`loopSupervisor.adapters.<name>`); user-supplied JavaScript in a config path is a code-execution
surface for no gain.

## Limits

- **Sequential only.** Two supervisors in one working tree collide on `develop-pipeline.lock`.
- **Not free.** Every iteration re-primes CLAUDE.md, the skill files and the roadmap. Much of that
  should be prompt-cache-served since the prefix is identical across iterations, but it is a real
  per-iteration floor.
