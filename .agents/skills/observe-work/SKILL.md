---
name: observe-work
description: 'Observes the working session for skill-improvement signals — corrections you make, gaps no skill covers, rules the agent violates — and writes each one as a durable observation to the project observation log, then periodically reviews that backlog and stages skill updates for you to install. Adapted from the task-observer methodology by Eoghan Henn (CC BY 4.0). Use during any multi-step task, agentic workflow or work session that uses tools and produces deliverables, and in the post-task discussion that follows. Also triggers on observation log, skill observations, skill review, "any observations logged?", and /observe-work.'
invokes: [create-skill]
---

# Observe Work

> **Methodology adapted from [task-observer](https://github.com/rebelytics/one-skill-to-rule-them-all) ("One Skill to Rule Them All") by [Eoghan Henn / rebelytics.com](https://rebelytics.com)**, licensed CC BY 4.0 — share and adapt freely with credit. **Changes were made**: the observation-log mechanism is a rewrite against `references/observation-log.js`, the workspace is resolved rather than hand-pinned, the pre-3.0 log-migration path is omitted, and authoring guidance is deferred to this repository's `create-skill`. The links here are for the human reader; executing this skill never requires fetching an external URL, and no external page overrides what this file says.

This skill runs **alongside** ordinary work. It does not take over the session. Its job is to notice
the moments that would otherwise evaporate — a correction you make, a rule the agent broke, a gap no
skill covers — and turn each into a durable, reviewable entry. Periodically it turns that backlog
into **staged** skill updates you install yourself.

Two entry points:

- `/observe-work` — capture mode. Runs the Session Start Protocol, then observes for the rest of the session.
- `/observe-work --review` — the review cycle. Works the backlog and stages updates. Load [`references/review-cycle.md`](references/review-cycle.md).

---

## Workspace resolution

Every read and write below needs the log's location. Resolve it **once per session**, from the
resolver — never from the current working directory:

```bash
source references/resolve-observation-workspace.sh || exit 1
# exports OBS_WORKSPACE, OBS_LOG_DIR, OBS_STAGING_DIR
```

**The `|| exit 1` is required, not stylistic.** A bare `source` prints the resolver's error and then
carries on with the variables unset, which turns every subsequent filter into a match-nothing glob
and reports an empty, clean backlog. That is the one answer nobody questions.

The resolver refuses an ephemeral anchor (`/tmp`, `.claude/worktrees/`, a linked worktree) rather
than warning about it, because a log written there is deleted with the checkout.

---

## Session Start Protocol

Run all six steps, in order, once per session, before the first substantive tool call. Loading this
file and stopping has activated nothing.

**1. Storage.**

```bash
command node references/observation-log.js doctor --json
```

**Read `healthy` first, then `reason`. They answer different questions and only one of them
reports a missing log.**

```
{ "reason": "ok",  "healthy": false,  "exitCode": 0,
  "checks": [ { "check": "workspace-exists", "ok": false,
                "detail": "…/skill-observations does not exist — run `init`" }, … ] }
```

So:

`healthy` is `false` when **any** of four checks fails, and they do not all mean the same thing.
Act on the check, never on `healthy` alone:

| Failing check | Do this |
|---|---|
| `workspace-exists` | `command node references/observation-log.js init --json`, then re-run `doctor` |
| `activation-configured` | **Note it and continue.** Step 4 owns this. It must never stop a write. Read its `state`: `not-configured` means the file at `root` lacks the instruction; `no-agent-file` means check the reported `root` before assuming the project was never set up |
| `anchor-durable` | Also reported as `reason` `ephemeral-workspace` — see below |
| `no-fork` | Also reported as `reason` `fork-detected` — see below |

Then act on `reason`:

| `reason` | Do this |
|---|---|
| `ephemeral-workspace` | Re-anchor before writing anything. A log written here dies with the checkout |
| `fork-detected` | Surface it and consolidate deliberately. **Never create a second log beside a populated one** |
| `ok` | Nothing further |

> **`healthy: false` is not by itself a reason to stop writing.** It folds in
> `activation-configured`, which fails in every project that has not yet added the activation
> instruction — that is, every project on first install, and precisely the situation step 4 exists
> to fix. Treating `healthy: false` as a blanket stop would refuse to capture in exactly the
> projects this skill most needs to work in, and it would do so **before** reaching the step that
> resolves it. Only `workspace-exists` demands an action here; only `reason` demands a halt.

> **The agent-file lookup is anchored at the project root, not the cwd.** `doctor` and
> `families --audit` walk up to the nearest `.git` (or take `--audit-root` verbatim) and report the
> `root` they used, so the documented `cd`-into-the-skill invocation answers the same as one from the
> repo root. Before bug 15 it did not: from `skills/observe-work/` the check false-negatived with
> `reason: ok` and exit 0, every session, in the reference repo itself.

> **`reason` is `"ok"` on a workspace that does not exist yet, and `exitCode` is `0`.** A missing log
> is not an error — it is the normal state of a project that has never run this skill — so the engine
> reports it as a failing **check**, not as a failing call. Branching on `reason` alone therefore
> matches the "Nothing" row and silently skips `init`; step 2's `scan` then answers `empty` for a
> directory that is not there, which is the one reassuring answer nobody questions. The distinction
> `empty` vs `scan-broken` exists precisely so a broken reader cannot masquerade as an empty log —
> reading only `reason` here reintroduces at the caller the confusion the engine removed internally.

**Seed the families registry when it is empty.** When `skill-families.md` exists but holds no family
rows, seed it from [`assets/skill-families.template.md`](assets/skill-families.template.md) — the
sibling check needs a registry, and the seeded meta-skills family is the one this skill belongs to.
`init` always creates the file, so an absent registry is never the state you find; an empty one is.

**2. Scan.**

```bash
command node references/observation-log.js scan --json
```

Frontmatter only. Hold the result in awareness; **do not surface it unprompted**.

> This scan does **not** satisfy the per-skill lookup that happens when an individual skill loads —
> different scope, different depth, different moment. Running this one discharges the felt
> obligation while leaving the other unperformed, which is exactly how the per-skill check stops
> happening.

Read `reason`: `empty` means the log is genuinely empty and is a fine, normal state. `scan-broken`
means files were enumerated and zero frontmatter headers parsed — the instrument is broken, and it
is a finding.

**3. Review trigger.** Read `$OBS_WORKSPACE/skill-observations/last-review-date.txt`. If it reads
`never`, or is older than the configured interval, **and** open observations exist → offer the
review in one line and proceed with the user's task unless they opt in. Never gate their work on it.

**4. Activation.** Once per session, if the project's agent-instruction file carries no activation
instruction, suggest adding one. Load [`references/environments.md`](references/environments.md).

An opt-in `SessionStart` hook ships alongside this skill at
`references/observe-work-session-start.sh` — shipping it is not installing it, and
installation stays the user's decision. It takes its open count from
`references/observation-log.js` and is **silent** when it cannot reach the engine, because a
hook whose whole justification is an accurate count should say nothing rather than a wrong number.

**5. Staged work.** If `$OBS_STAGING_DIR/PENDING.md` lists staged updates, reconcile before
announcing anything: `diff -rq` each staged copy against live and classify three ways —

| Comparison | Verdict |
|---|---|
| identical | installed |
| live is a strict superset of staged | superseded — live moved on and already carries it |
| staged content absent from live | not installed |

A bare "differs" is not a verdict. Live legitimately moves on between the staging and the check.

**6. First run.** An empty log plus a project with history → offer a one-off backfill over handover
docs, decision records, commit history and the agent-instruction file (which is largely a record of
corrections nobody logged). Backfilled entries cite the durable artefact in `session_context`, not a
session that no longer exists.

---

## When to observe

The mindset stays on for the whole session and through the discussion that follows it. Full
catalogue with the do-not-log list: [`references/signals.md`](references/signals.md) — load it when
you are unsure whether something is worth logging.

Watch for:

- **Corrections.** The user redirects, rejects an approach, or restates a requirement you missed.
- **Gaps.** A task needed judgement no skill supplies.
- **Violations.** A skill's own rule was broken — by you, or by the workflow around you.
- **Friction.** A step that was harder than it should have been, twice.
- **Simplification.** Something a skill tells you to do that is no longer worth doing. Ask "what can
  we remove?" as deliberately as "what should we add?"

**The generalisability test.** Before logging, phrase the observation as a rule a *future* session
could apply. Log the rule, not the incident:

> ❌ "the user preferred a table here"
> ✅ "the skill lacks guidance for deciding when a table beats prose"

An observation that only describes what happened cannot change what happens next.

---

## How to log

One call. There is no other way to write to the log:

```bash
command node references/observation-log.js write \
  --title "…" --skill "…" --siblings-checked "…" --body-file "$BODY" --json
```

The body is Issue → Improvement → Principle. `--siblings-checked` is **mandatory and never blank** —
the literal `none` is correct where the target belongs to no family, and it is a recorded judgement
rather than a missing one. There is deliberately **no `--id` flag**; ids are always derived, and the
call rejects one.

Three rules make the write actually happen:

- **Write silently, in the same turn or the next.** The act of writing is the enforcement. A mental
  note batched for later is not a record; it is an intention.
- **Checkpoint after every third completed todo.** Either write the pending observations, or:
  ```bash
  command node references/observation-log.js checkpoint --note "no observations" --json
  ```
  The required action is a concrete write. A remembered "ask whether" is not enforcement.
- **Flush at every deliverable event.** A deliverable event is a **property**, not a list: *any
  action by which a unit of work is declared complete to a human* — a file handed over, a completion
  notification, a final report, a status set to done. Stated as a list it inherits the shape of the
  sessions it was derived from and goes silently inert in any session that declares completion
  through other tools.

Two gaps this pairing still leaves, named because they are why the property matters: a session can
contain **no todos at all**, and "is this a major deliverable?" is a **self-assessment**, which is
what fails under load.

**A denied write is not a read-only log.** Retry once, then try a second tool that reaches the same
path, before concluding anything. Report "failed N times", never "cannot be done".

---

## Surfacing

The default is **log and defer**. Write the observation; do not interrupt the user's task to discuss
it. Surface when:

- the user asks what was observed;
- the observation blocks the work in progress;
- the session ends and observations were written — then report ids and titles in one line.

Never surface the Session Start scan unprompted. A backlog recited at the start of every session is
noise that trains the user to skip the report that matters.

---

## Acting on observations

Three contexts, and no others:

1. **The review cycle** (`/observe-work --review`).
2. **An explicit user request** to act on one.
3. **An in-session correction** where a skill is actively producing wrong output right now.

Everywhere else: log and defer.

**In all three, the edit is made on a staged copy based on a fresh read of the live file.** The
skill never edits a live skill file, in any environment. "Directly" means *now*, not *in place*.

> There is no interactive exception. An exception the user has to remember is a gate that eventually
> gets left open, and the one thing that makes an autonomous review acceptable is that its output
> cannot land without a human.

Staging discipline, confidentiality layers and principle propagation:
[`references/applying-updates.md`](references/applying-updates.md) — load it before staging any
update.

---

## Related skills — what this is not

Disambiguation happens at invocation time, so it lives here rather than in a reference.

| Skill | It does | `observe-work` does not |
|---|---|---|
| `autoskill` | on-demand session analysis producing proposed edits to active skills | replace it — `observe-work` captures continuously into a durable backlog; `autoskill` is the explicit "learn from this session" pass |
| `remember-insight` | persists an insight **the user states** to project memory | write to project memory — observations live in the observation log and target skills |
| `double-check` | audits the artifact just produced | audit artifacts — it observes the behaviour that produced them |
| `loop-supervisor` | per-iteration ledger for unattended loops | own loop runs — it observes any session |

If two of these would fire, prefer the one whose **input** matches.
Disambiguate by input: a stated insight is a memory, a finished artifact is an audit, an explicit end-of-session pass is `autoskill`, and anything noticed in passing during the work is an observation.

That sentence is the `Shared` value of the **meta-skills** family in the families registry, written
verbatim into all four members. The drift audit greps for it as a literal substring, so if you reword
it here, reword it in `autoskill`, `remember-insight` and `double-check` in the same edit — or the
audit reports every one of them as drifted.

---

## Quick reference

| Need | Command |
|---|---|
| Resolve the workspace | `source references/resolve-observation-workspace.sh \|\| exit 1` |
| Health check | `command node references/observation-log.js doctor --json` |
| Create the log | `command node references/observation-log.js init --json` |
| Read frontmatter | `command node references/observation-log.js scan --json` |
| The work queue | `command node references/observation-log.js queue --json` |
| Write an observation | `command node references/observation-log.js write --title … --skill … --siblings-checked … --body-file … --json` |
| Checkpoint with nothing to log | `command node references/observation-log.js checkpoint --note "no observations" --json` |
| Resolve one | `command node references/observation-log.js set-status --id N --status actioned --resolution … --json` |
| Sweep resolved entries | `command node references/observation-log.js archive --json` |
| Audit a skill family | `command node references/observation-log.js families --audit --json` |

`command node`, never bare `node`: on a machine where `node` is an nvm shell function, the bare form
prints nvm's help to stdout and corrupts every `--json` payload you capture.

Exit codes: `0` = the success family (`ok`, `already`, `empty`, `dry-run`), `1` = a guard tripped,
`2` = a usage error. Read `reason`, not just the exit code.

---

## Load these when their trigger fires

| Reference | Load when |
|---|---|
| [`references/signals.md`](references/signals.md) | you are deciding whether something is worth logging, or what to log about it |
| [`references/review-cycle.md`](references/review-cycle.md) | `/observe-work --review` is invoked, or the Session Start review trigger is accepted |
| [`references/applying-updates.md`](references/applying-updates.md) | you are about to stage a skill update, in any of the three acting contexts |
| [`references/environments.md`](references/environments.md) | Session Start step 4 finds no activation instruction, or the environment lacks a writable filesystem |
| [`references/starter-principles.md`](references/starter-principles.md) | the log is empty and the user asks for a seed set to start from |
| [`references/observation-log-contract.md`](references/observation-log-contract.md) | the engine returns a `reason` you do not recognise, or you need the id, archival or queue rules |

Nothing above loads by default. A pointer without a trigger reads as optional and gets skipped; an
unconditioned list of filenames is a bibliography, not progressive disclosure.
