# Applying updates

> **Load when** you are about to stage a skill update, in any of the three acting contexts.

This file carries only what `create-skill` and the repository's authoring docs do **not** cover:
the staging discipline, the live-file rule, confidentiality layering and principle propagation.

**It deliberately does not restate authoring guidance.** For how a skill is structured, packaged and
validated, read those directly:

| Need | Read |
|---|---|
| Creating a new skill | `skills/create-skill/SKILL.md` |
| Structure, progressive disclosure, packaging | `docs/contributing/authoring-skills.md` |
| The quality bar for a contribution | `CONTRIBUTING.md` |

Restating them here would produce two sources that drift, and the agent follows whichever it loaded.
That is worse than a missing rule, because a contradiction gives no signal about which side is stale.

---

## The live-file rule

**The skill never edits a live skill file. In any environment. Including this one.**

Every edit is made on a **staged copy** built from a **fresh read of the live file**.

"Directly" — as in the `SKILL.md` rule "apply small changes directly" — means **now**, not **in
place**. It decides *when* a change is made, never *where*.

> There is no interactive exception, no small-change exception and no trusted-environment exception.
> An exception the user has to remember is a gate that eventually gets left open, and staging-only is
> the single property that makes a long autonomous review acceptable at all.

---

## Staging discipline

### 1. Always start from the live file

Base the edit on a fresh read. Not a workspace copy, not a staged copy from a previous review, not
memory of what the file said earlier in the session. Live moves between reviews, and an edit rebased
on a stale reading silently reverts whatever landed in between.

### 2. Diff before overwriting a staged copy

If `$OBS_STAGING_DIR/<skill>/` already exists:

```bash
diff -rq "$OBS_STAGING_DIR/<skill>" "<live skill dir>"
```

- **identical** → the previous staging was installed; restage from live.
- **live is a strict superset** → live already carries it, possibly reworded; the staged copy is
  superseded. Restage from live rather than reapplying.
- **staged content absent from live** → not installed. **Rebase**: reapply the staged intent onto a
  fresh read of live, do not blind-overwrite.

A bare "differs" is not a verdict. Live legitimately moves on.

### 3. Stage the full directory, never `SKILL.md` alone

```bash
cp -R "<live skill dir>" "$OBS_STAGING_DIR/<skill>"
```

A skill is `SKILL.md` **plus** its `references/`, `scripts/`, `resources/` and `tests/`. Delivering
only `SKILL.md` truncates the skill silently: the user installs it, the pointers still resolve
against the old files, and the mismatch surfaces later as behaviour nobody can trace to the install.

### 4. Record it in `PENDING.md`

One entry per staged skill: the skill name, the path, one line on what changed, and — where the live
file is a generated copy — the **source of truth** that must actually be edited. Session Start step
5 reads this file to reconcile.

### 5. Never stage into a volatile target

Before staging, establish whether the live path is generated:

| Target | Source of truth |
|---|---|
| A bundled copy under a skill's `references/` directory | The corresponding file under the repository's shared-resources directory — the next bundle reverts a direct edit |
| A generated catalog or dependency graph | The generator plus its inputs |
| A managed dotfile (chezmoi, Stow, a symlinked directory) | The dotfile repo, not the symlink target |

Staging against a volatile target produces a change that passes every check in the session that made
it and is gone after the next regeneration. Say which file is the real target in the summary.

---

## Confidentiality layers

An observation's three body sections carry **different** amounts of specificity, and the split is
what lets the Principle travel while the Issue stays put.

| Section | `type: internal` | `type: open-source` |
|---|---|---|
| **Issue** | Specifics permitted — paths, commands, error text | Specifics permitted |
| **Improvement** | Specifics permitted | Specifics permitted |
| **Principle** | Generalised | **Fully generalised.** No project name, no path, no client, no person, no product |

The Principle is the section that propagates. It leaves this repository, gets read by people with no
context, and outlives the situation that produced it. A Principle that names a customer, a private
repo or a person is a leak that no later edit can recall.

**Never in any section, at any type:** credentials, tokens, keys, customer content, personal data.
Refer to people by role — "a teammate", "the reviewer" — never by name, email or handle, including
inside quoted user words.

---

## Principle propagation

When a review actions an observation whose Principle generalises beyond the skill it was filed
against, propagate it to the project's cross-cutting principles file (create it if absent, under the
observation workspace).

Two rules:

- **Do not propagate the Issue or the Improvement.** Only the Principle. The other two are
  situation-bound and make the principles file unreadable within a dozen entries.
- **Mark the origin.** Each propagated principle records the observation id it came from, so a later
  review can trace it back and prune it when the underlying rule stops applying.

A principles file that only grows is a principles file that stops being read — the same failure the
simplify signal exists to counter, one level up.

---

## Pre-delivery gate

Check every one before telling the user an update is ready. Each maps to a failure that has
actually happened.

- [ ] Every staged edit was made on a **fresh read of the live file**
- [ ] The **full skill directory** is staged, not `SKILL.md` alone
- [ ] Any staged copy that pre-existed was **diffed and rebased**, not blind-overwritten
- [ ] No live skill file was modified — verify, do not assume: `git status` shows changes only under the staging dir
- [ ] For each staged skill whose live path is generated, the **source of truth** is named
- [ ] No Principle names a project, path, client or person
- [ ] No section carries a credential, token or customer content
- [ ] `PENDING.md` lists every staged skill with its install path
- [ ] The user has been told **how to install** — the delivery is not the install

The last one is the one that gets skipped. A staged update the user does not know how to apply is
indistinguishable, from their side, from no update at all.
