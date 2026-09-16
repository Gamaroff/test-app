# Environments and activation

> **Load when** Session Start step 4 finds no activation instruction, or the environment lacks a
> writable filesystem.

Installing files is not activating a skill. This file is about the gap between the two.

## Contents

- [The four activation tiers](#the-four-activation-tiers)
- [The activation block](#the-activation-block)
- [The SessionStart hook](#the-sessionstart-hook)
- [When writing the config is refused](#when-writing-the-config-is-refused)
- [Managed skills directories](#managed-skills-directories)
- [Storage regimes](#storage-regimes)
- [Handoff-doc mode](#handoff-doc-mode)
- [Verification, and the honest limit](#verification-and-the-honest-limit)

---

## The four activation tiers

| Tier | Mechanism | Enforced? |
|---|---|---|
| 1 | Frontmatter `description` matching | **No** — loses on short tool-using openers |
| 2 | User-level preferences | **No** — probabilistic |
| 3 | An instruction in the project's agent-instruction file (`AGENTS.md` / `CLAUDE.md`) | **No** — absent whenever that file is not in context |
| 4 | A harness `SessionStart` hook | **Yes** — but it can only inject a prompt |

Only tier 4 is enforced, and what it enforces is that the *prompt arrives* — not that the model acts
on it. Choosing to invoke a skill remains a model decision at every tier. **No tier available here
makes activation certain**, and the honest position is that the strongest one is a strong nudge.

Install tiers 3 and 4 together. Tier 3 states what to do; tier 4 makes the state visible so that
"nothing to do" and "never looked" stop being indistinguishable.

---

## The activation block

Paste into the project's agent-instruction file. Two properties are load-bearing and both come from
reported failures — do not paraphrase them away.

```
Before the first tool call of any session — and before writing or proposing a
plan, not merely before executing one — invoke the observe-work skill AND
execute its Session Start Protocol (workspace probe, frontmatter scan, review
trigger). Loading the skill and running the protocol are separate steps; a
session that loads the file and stops has activated nothing. Any turn that will
involve a tool call counts; do not classify the session as "too simple" from its
opening message.

After completing each task, report in one line the observations written this
session (ids and titles, or "none logged and why").
```

**1. It demands the protocol by name.** The reported failure is an agent that loads the skill per the
instruction and then stops. The protocol never runs, and nothing surfaces the omission, because a
loaded-but-inert skill looks identical to an active one from the user's side.

**2. The post-task line is the backstop.** It forces a look at the log at every task boundary, so a
session that silently skipped the protocol is discovered at the first boundary instead of never. In
upstream's field use this single line turned an intermittently-activating install into a stably
recording one.

**Word the trigger mechanically, not judgementally.** "Task-oriented session" asks the agent to
classify the session at its first turn, before it knows how the session will develop — and short,
factual-looking requests get classified out. Keying on *tool use* avoids that. And it must precede
**planning**, not just execution: a plan written without the relevant skills carries uninformed
decisions past the review gate, where approval locks them in.

---

## The SessionStart hook

Shipped at `references/observe-work-session-start.sh`, beside the engine it calls. **Shipping the
file is not installing it** — installation stays the user's decision.

Capture is hard-enforced by checkpoints hooked onto tool calls that were happening anyway. The
**review trigger** is not: it is a soft step (read a file, compare a date) and gets skipped the same
way activation does. That failure is self-concealing — capture keeps producing, the log looks
healthy, and the only artefact recording the miss is a file reading `never` that nobody reads. So
the hook computes the state and injects it, rather than asking the agent to go and look.

To install it, register the script as a `SessionStart` hook in the harness's settings. It emits
`hookSpecificOutput.additionalContext` and writes nothing.

### The count comes from the engine, and there is no shell fallback

```sh
queue_json=$(command node "$ENGINE" queue --workspace "$WORKSPACE" --json) || exit 0
```

The hook **transcribes** `total` and the length of `open`. It re-derives nothing.

That is not a stylistic preference — it is the outcome of three QA cycles that each produced a
counting defect while the hook implemented the queue rule itself:

| Attempt | Defect |
|---|---|
| exact-match `grep` | **undercount** — missed `status: open ` (trailing space) *and* the statusless fallback, so such a file counted as neither |
| unscoped `grep` | **overcount** — a *resolved* observation quoting `status: open` in its body counted as open |
| frontmatter `awk` | **both, and they cancelled** — a quoted `status: "open"` read as not-open while a frontmatter-less file read as open. Hook and engine both said "2 open" and appeared to agree; only `total` disagreed, 3 against 2 |

The queue rule is not hard, but it has enough edges — optional field, absent means open, `parked`
excluded, resolved excluded, quoted scalars, non-observation files — that a second implementation is
a second thing to keep true. It was not kept true three times running.

> **Do not reintroduce a shell count, not even as a fallback.** When the engine cannot be reached —
> no `node`, no engine file, an unparseable payload, or an anchor the engine refuses — the hook is
> **silent**. The entire justification for this file is an accurate number, and a wrong one is worse
> than none, because a wrong one gets acted on.

### Two details that still decide whether it works

Both survive from the original mechanism, because neither is about counting:

- **Compare dates without `<` inside `[ ]`.** ISO dates sort lexically, so
  `[ "$(printf '%s\n%s\n' "$last" "$cutoff" | sort | head -1)" = "$last" ]` is true when `$last` is
  not later than `$cutoff`, in every POSIX shell. `\<` is a bash/ksh extension that zsh rejects and
  `sh` does not know.
- **Prove the branches fire.** Run it against fixtures at `never`, 30 days stale and 2 days stale,
  and confirm the third **stays silent**. A nag that never fires and a nag that is correctly silent
  look identical from a passing run.

  Fixtures must sit on a **durable anchor**. Under `/tmp` the engine correctly refuses the workspace
  and the hook falls silent — which looks exactly like a broken hook, and was briefly mistaken for
  one during review.

---

## When writing the config is refused

Some environments protect the agent-instruction file or the harness settings. Work the ladder in
order and stop at the first rung that succeeds:

1. **Ask for a retry** if the denial is retryable-with-consent. Many are.
2. **Ask the user to paste it.** Hand them the exact block above; do not summarise it.
3. **Ask for temporary authorisation** scoped to this one write.
4. **Fall back to the project-level instruction file**, which is usually less protected than
   harness settings.

**A silently skipped activation is as bad as a bypassed guard.** If all four rungs fail, say so
explicitly and report the install as unverified — never let the run end with the impression that
activation happened.

---

## Managed skills directories

Where skills live under chezmoi, GNU Stow, or a symlinked dotfiles tree, **the live path is not the
write-back target**. Writing to the symlink target is reverted by the next `chezmoi apply` or
`stow -R`.

Detect it before staging — a symlinked skill directory, or a path under a known dotfile manager's
tree — and name the real source in the staging summary, per
[`applying-updates.md`](applying-updates.md) § "Never stage into a volatile target".

---

## Storage regimes

| Regime | Where the log lives | Notes |
|---|---|---|
| **Project-local** (default) | `<repo>/skill-observations/` | Committed. Survives clones. The normal case |
| **User-global** | An `observations.workspace` path outside any repo | For work spanning many repos. Set it explicitly; never let it resolve by accident |
| **Ephemeral** | — | **Refused.** `/tmp`, `.claude/worktrees/`, a linked worktree — the resolver returns `ephemeral-workspace` and exits non-zero rather than warning, because a log written there is deleted with the checkout |

The workspace is resolved once per session by the resolver, never derived from the current working
directory. The cwd changes during a session; the log's location must not.

**A just-written observation is untracked**, and `git clean -fd` exists to delete exactly those. It
does not look like data loss when it happens — it looks like a tidy working tree. Commit the log.

---

## Handoff-doc mode

Where there is no writable filesystem at all, the log cannot exist and neither can staging. Do not
pretend otherwise and do not silently do nothing.

Instead, accumulate observations in the session and emit, at the end, a **handoff document** in the
same Issue → Improvement → Principle shape, with a header stating plainly that these were not
persisted and must be written into the log by a session that can reach one.

The handoff is a degraded mode and must be labelled as one. An unlabelled handoff reads as a
completed capture, and the observations are lost at the same moment they appear to have been saved.

---

## Verification, and the honest limit

The config file is read at session start, so an instruction written mid-session takes effect only on
the **next** one. And in a harness that hot-loads a newly installed skill, the skill being callable
right after install proves nothing — it was invoked by hand.

**The installing session therefore sees everything pass while the one thing that matters is
untested.** Report the install as **activation unverified**, and hand the user the check as a
concrete first action for their next session:

> **Next session, before doing anything else:** confirm that `observe-work` was **invoked** — not
> merely listed as available — and that its Session Start Protocol ran (you should see a storage
> probe and a frontmatter scan). If it was not, the activation instruction is not being read; work
> the ladder in "When writing the config is refused".

**The external diagnostic, for when every layer is skipped anyway:** if the observation-log directory
does not exist after a few sessions of real work, activation never happened.
