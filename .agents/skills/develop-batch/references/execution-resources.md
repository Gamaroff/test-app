---
name: execution-resources
description: The develop-batch execution-resource model — declaring resources, the capacity-probe contract, rolling admission, placement rules, and the alternatives that were rejected. Consumed by develop-batch Steps 2, 3 and 5.5.
---

# Execution resources — placement, capacity and rolling admission

`select-next.mjs --batch` answers **what can run together** (dependency-ready,
write-disjoint). `schedule.mjs` answers **where and when** (which resource, and whether a
slot is free right now). The two axes are orthogonal and must stay that way — do not teach
the selector about capacity, and do not teach the scheduler about `touches:`.

**Zero config is a supported configuration.** A project that declares no `resources` gets one
implicit resource at `maxParallel` capacity, a dispatch directive identical to a single-lane
project, and no probes. Everything below is opt-in.

---

## 1. Declaring resources

```yaml
developBatch:
  maxParallel: 4              # GLOBAL ceiling across all resources
  resources:                  # array order is the preference tiebreak
    - name: local
      capacity: 1
      testCommand: "npm test"
    - name: build-box
      capacity: 3
      testCommand: "ssh build-box make test"
      env:                    # optional, exported for the dispatched pipeline
        REMOTE_HOST: build-box
      probe:
        command: "curl -fsS --max-time 5 $PROBE_URL/health"
        intervalSec: 60
        timeoutSec: 10
```

Five keys per resource: `name`, `capacity`, `testCommand`, `env`, `probe`.

**Capacity is a property of the resource, not of the work.** A resource whose runs are fully
isolated (per-run directory, no published host ports) can take several concurrently and is
bounded only by CPU/RAM. A resource whose runs share fixed ports or one database is
`capacity: 1` — not because it is slow, but because two concurrent runs would corrupt each
other. Get this wrong in the optimistic direction and you get data races, not slowness.

### `maxParallel` vs `capacity`

These were historically conflated: the skill treated `maxParallel` as a global pipeline cap
while at least one consumer's config comment redefined it as a per-host cap. They are now
distinct, and the back-compat table is exhaustive:

| Config | Resource table | Global cap |
| ------ | -------------- | ---------- |
| no `resources`, `maxParallel: N` | one implicit resource, capacity `N` | `N` |
| no `resources`, no `maxParallel` | one implicit resource, capacity 4 | 4 |
| `resources`, no `maxParallel` | as declared | `sum(capacity)` |
| `resources` + `maxParallel` | as declared | `min(maxParallel, sum)`, with a note when `maxParallel` binds |

---

## 2. The probe contract

Exit-code-first, so a one-line `curl … | jq -e` satisfies it and no interpreter code lives in
this repo.

| Probe result | Meaning |
| ------------ | ------- |
| exit 0, no stdout | admitting; static `capacity` governs |
| exit 0, `{"freeSlots": N}` | effective capacity = `min(capacity, inflight + N)` |
| exit non-zero | **saturated** — withhold; first stdout line becomes the logged reason |
| timeout / spawn failure | **treated as available**, flagged degraded |

Three safety rules, and they are the reason this is safe to enable:

1. **A probe can only ever subtract.** Static `capacity` remains the primary guard, so a
   probe bug can slow a batch but can never overload a host.
2. **A flaky probe never stalls a batch.** Timeouts and spawn failures resolve to *available*,
   not blocked.
3. **Placement happens once, at admission.** No preemption, no migration of a running item.
   The only thing that reroutes is the *next* item — which is exactly what a human operator
   does when a host gets busy.

**Settle window.** After admitting to a resource, its probe is not re-read for `settleSec`
(default = `intervalSec`). Load average has roughly a one-minute time constant; without this,
three items land on a "load 0.5" host within three seconds and the probe never observes what
it caused.

### Writing a probe

Both contract forms, with a placeholder host — keep tokens in environment variables, never
literals in `skills-config.yaml`:

```bash
# Boolean form — exit 1 when the host reports any critical alert
curl -fsS --max-time 5 -H "X-Token: $PROBE_TOKEN" "$PROBE_URL/api/alerts" \
  | jq -e 'map(select(.level=="crit")) | length == 0' >/dev/null

# freeSlots form — subtract live concurrent runs from the static cap
curl -fsS --max-time 5 -H "X-Token: $PROBE_TOKEN" "$PROBE_URL/api/ci" \
  | jq -c --argjson cap 3 '{freeSlots: ($cap - .active)}'
```

A pre-thresholded endpoint is cheaper than one that samples CPU on every request. The probe
runs through a shell and must be permission-allowlisted, or an unattended loop will stall on
an approval prompt.

---

## 3. Rolling admission

Slot state is **derived** every tick, never persisted:

```
inflight[r] = count(dispatched && !pipelineDone && !halted && !interrupted) grouped by resource
```

That is what makes the scheduler crash-safe — a resumed run recomputes truth from the same
booleans the pipelines already write, so a counter can never drift out of sync with reality.

```
while (pending) or (in flight):
  ADMIT  — schedule.mjs plan; dispatch everything in admit[]; repeat until admit[] is empty
  WAIT   — for the NEXT report, not all of them
  RECORD — classify it, free the slot, go back to ADMIT
```

**Placement rule:** filter to resources under static capacity, under probe-effective capacity,
and not saturated; sort by ascending `inflight/capacity` (spread the load); break ties on
declaration order.

> **Implementation hazard — this is the one that silently reverts the whole design.** Rolling
> admission requires observing *individual* completions. Dispatching a group and awaiting the
> group returns only when all of them finish, which is a wave barrier wearing a different
> name. Dispatch in the background. If individual completions genuinely cannot be observed,
> re-plan immediately after every returned group and never hold a freed slot waiting for a
> sibling.

---

## 4. Interrupted is not halted

A dispatched pipeline that stops has done one of two very different things:

- **HALT** — its own gate failed (review NO-GO, develop stall, 5 QA cycles without PASS,
  qa-fix with no changes, DoD gaps, rebase/merge conflict). It must **not** be re-dispatched.
- **Interrupted** — something external stopped it mid-flight (plan mode, a permission denial,
  context compaction, a user interrupt, a tool outage). It **must** be re-dispatched, and
  re-placed rather than pinned to its old resource.

The rule is grounded in an artifact, not in tone: a report is interrupted only when it stopped
*without* emitting one of the pipeline's own HALT reports. Tiebreak on the worktree's
`develop-pipeline.lock` — live and non-terminal means mid-flight and resumable.

**Ambiguous with no lock fails safe to `halt`.** Wrongly halting costs one manual resume;
wrongly resuming can re-run a pipeline that had already decided to stop. `maxResumeAttempts`
(default 2) bounds the loop, after which the item becomes
`haltKind: "interrupted-exhausted"` so a human sees why it kept dying.

Note that **plan mode is the common case here**, not an exotic one: it forbids writes, so
every running pipeline stops quoting the plan-mode directive. Never start a batch in plan mode.

---

## 5. Rejected alternatives

Recorded so they are not re-litigated under time pressure.

### Rolling merges (`mergeMode: rolling`)

**Rejected.** Merging stays a post-development phase.

The decisive argument is not rebase churn — it is that **the merge gate is itself a heavy
scheduled workload.** Step 3 runs `<qualityGateCommand>` on every item. Interleaving it with
development means either (a) it contends silently for the very resources the scheduler exists
to protect, which is the original failure mode, or (b) it takes a scheduler slot and competes
with development for throughput, gaining nothing.

Supporting reasons: rebase-on-merge already resolves `softOverlaps[]` at merge time, so
merging earlier buys no correctness; the only throughput win is on the tail; and gate results
measured on a contended machine weaken the head-SHA + gate guarantee that makes auto-merge
safe at all.

### Teaching the selector about capacity

**Rejected.** Selection and scheduling answer different questions. Merging them makes
`selectBatch` non-deterministic with respect to host state, which would make its output
untestable and its `--dry-run` meaningless.

### An HTTP probe type with a JSONPath-ish selector

**Rejected** in favour of `probe.command` plus a documented `curl … | jq` recipe. A selector
DSL would put a query-language interpreter in a zero-dependency repo to express what one line
of shell already expresses, and would hardcode assumptions about a specific monitoring API.

### Preemption and migration of running items

**Rejected.** Placement at admission only. Migrating a running pipeline means killing and
restarting real work to chase a load average that may have already changed — thrash with a
worse expected outcome than doing nothing.

### A `status` enum on state items

**Rejected.** The existing booleans stay the source of truth; the new fields are additive. An
enum alongside them would be a second source of truth, and they would drift.
