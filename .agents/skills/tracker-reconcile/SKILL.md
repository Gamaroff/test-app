---
name: tracker-reconcile
description: Re-read a committed tracker handover days later and reconcile it with the live board — tick what is already satisfied, flag what someone moved elsewhere as divergent, mark what cannot be confirmed as unverifiable, and report (or, under access.tracker full with --apply, execute) what is still outstanding. Check-only by default; --apply is refused under read-only, approve, command and manual, naming the blocker. Use when the user says "reconcile the tracker handover", "work the deferred checklist", "did anyone do the handover actions?", "tick the handover from the board", or after a restricted-access run left a *.handover.* checklist behind.
---

# Tracker Reconcile

Turns a one-shot handover into a loop that converges. A committed handover
records what a run wanted at one moment; this skill re-reads it against the
live tracker and answers the question the checklist alone never can: **"did
someone already do this?"**

## When to Use This Skill

- A restricted-access run (`access.tracker` ≠ `full`) committed a
  `*.handover.{n}.{name}.{md,sh,json}` set and time has passed
- The user asks "reconcile the tracker handover", "work the deferred
  checklist", or "what's still outstanding from the handover?"
- Before closing out a work item whose implementation report carries a
  non-empty **Tracker Actions Required** section or a **Tracker debt** line
- Periodically, across all work items, with `--all`

## Usage

```bash
node .agents/skills/tracker-reconcile/scripts/tracker-reconcile.js \
  [<work-item-dir> | <handover.json> | --all] [--apply] [--json]
```

| Invocation | Effect |
| --- | --- |
| `<work-item-dir>` | Reconcile the newest `*.handover.*.json` in that directory |
| `<handover.json>` | Reconcile exactly that sidecar |
| `--all` | Reconcile every `*.handover.*.json` under `docs/` |
| `--apply` | Execute what is still outstanding — **only under `access.tracker: full`** |
| `--json` | Machine-readable result |

**Default is check-only and mutates nothing remote.** The verification pass
(`references/handover-verify.js`) only ever reads — every command it
runs is checked against a read-only allowlist in-process, and the suite proves
a mutation cannot slip through.

## What a reconcile does

1. **Reads** the sidecar's records and runs the per-kind read recipe for each
   (board field via GraphQL read, issue state via `gh issue view`, comment
   idempotency via the `agent-skills-comment:` marker, Jira status via REST
   GET, `git ls-remote` for pushes — see `references/handover-verify.js`).
2. **Derives one of four states** per record:

   | State | Condition | Checklist | Script |
   | ----- | --------- | --------- | ------ |
   | `satisfied` | Read matched the desired value | Ticked, struck through, observed value and time | Short-circuited |
   | `pending` | Read did not match, or no read is defined | Unticked | Runs |
   | `divergent` | Observed a value that is neither desired nor the pre-action value | Unticked, `⚠️ observed X, wanted Y` | Skipped with a warning unless `--all` |
   | `unverifiable` | Read failed, was ambiguous, or the kind has no reliable read | Unticked, "cannot verify — check by hand" — unless the record already carried a tick backed by earlier positive evidence, which is **retained** and labelled "ticked previously; this pass could not confirm" | Runs, unguarded (retained ticks stay short-circuited) |

3. **Rewrites the checklist's boxes in place** — a satisfied action is ticked,
   never deleted, so item count always equals record count and drift stays
   visible. Updates the JSON sidecar, and sets the checklist's frontmatter
   `status:` to `outstanding` | `partial` | `complete`.
4. **Prints the summary** and exits 0 with a `reason`
   (`checked` | `applied` | `apply-refused`), per the established convention.

## The refusal (load-bearing)

`--apply` under `read-only`, `approve`, `command` or `manual` is **refused**,
and the refusal names the blocking system:

```
⛔ --apply refused: access.tracker resolves to `manual`. Applying under
`manual` would bypass the access policy this repo configured
(skills-config.yaml access.tracker / ACCESS_TRACKER / AGENT_SKILLS_ACCESS_TRACKER).
Reconcile continues check-only; re-run with access.tracker: full to apply.
```

A reconcile that quietly applies under `manual` is a back door around the
policy the consumer configured, and makes `manual` meaningless. The refusal
still re-renders — the check pass runs either way — and exits 0 with
`reason: "apply-refused"`.

Under `full`, `--apply` executes the outstanding actions: `pending` and
`unverifiable` records run; `divergent` records are **skipped with a warning**
(someone moved that card somewhere the plan did not expect — applying the
recorded command could drag it backwards); `irreversible` records are
confirmed per-record on a tty and **skipped, never assumed, without one**.

## Non-guesses, by design

- **An ambiguous match resolves to `unverifiable`, never `satisfied`.** Two
  marker hits, two issues sharing a title — on 2+ candidates the answer is
  "cannot verify — check by hand". An unverifiable read never **creates** a
  tick. The one asymmetry is deliberate and runs the other way: a tick backed
  by earlier positive evidence (a verified read, or an action reconcile itself
  executed) is **retained** through a silent read — revoking it on silence
  would return an executed action to outstanding, and `--apply` would run the
  mutation a second time. Only a real read showing pending or divergent
  revokes a tick, and a retained tick is labelled as such in the checklist.
- **`divergent` is a first-class state, not a flavour of `pending`.**
  `gh-stage.js` and `jira-stage.js` already treat exactly this as
  `would-regress` — informational, "the board is ahead of the pipeline".
- **Comment verification uses the marker first** (`agent-skills-comment:{stage}`
  from `references/tracker-comment.js`). Where a human retyped the
  comment without the marker, a coarse first-line heuristic may match — and on
  more than one match the answer is `unverifiable`.

## Change Log

Rows record **events, not attempts** (`references/document-change-log.md`):

- A deferral writes **no** row — a deferred transition is a non-event.
- Observing something already satisfied writes **no** row — the tracker's own
  history has it, with the real actor.
- **Only an action reconcile executed earns a row**, appended to the work
  item's `## Change Log` with author `tracker-reconcile`.

## Idempotence

Reconciling twice against an unchanged board produces **byte-identical
artifacts**: a fresh read that agrees with the stored annotation keeps the
stored one verbatim, timestamp included, and the checklist frontmatter's
`updated:` is derived from the annotations rather than the clock.

## Relationship to the pipeline

`finalise` writes `status: accepted` and moves on, by design — the accept gap
(the board not yet caught up) is recorded loudly in the implementation
report's **Tracker Actions Required** section, a **Tracker debt** line in its
Completion block, and a PR comment. This skill is what closes that gap later:
it takes the **artifact** as its input, not the run — days later, by a human,
possibly on a different branch, with no work item in flight. That is why it is
a separate skill and not a `--reconcile` flag on `finalise`.

Record schema and the roster of mutation kinds: `references/tracker-access-record.md`.
Renderers: `references/handover-render.js`. Read pass: `references/handover-verify.js`.

## Related Skills

- `/finalise` — writes the accept-gap reporting this skill later reconciles
- `/develop-task`, `/develop-story` — the pipelines whose restricted runs
  produce handover artifacts
