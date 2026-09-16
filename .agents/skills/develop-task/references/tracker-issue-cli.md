---
name: tracker-issue-cli
description: Contract for tracker-issue.js — the CLI that performs GitHub issue-lifecycle mutations (create, edit, close, reopen, milestone, sub-issue link) whose stdout the caller captures. Covers the reason vocabulary, the empty-capture contract, and the two-run convergence a deferring access mode produces.
---
<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/tracker-issue-cli.md. Regenerate via `npm run bundle`. -->

# `tracker-issue.js` — the issue-lifecycle CLI

> **One mutation per call. Stdout carries the produced value and nothing else.**

The fourth peer of [`jira-stage.js`](platform-detection.md),
[`gh-stage.js`](platform-detection.md) and
[`tracker-comment.js`](tracker-comment-contract.md), and the one that exists for a
reason none of them had: **its callers read its stdout.**

---

## Why this is a CLI and not another `tracker_write` arm

`tracker_write` is the right chokepoint for the ~38 `gh` mutations nobody
captures. It refuses the call, records it, writes its notice to stderr, and
returns 0. For a call whose value the caller binds —

```bash
ISSUE_URL=$(gh issue create …)
```

— that is exactly wrong. The capture comes back **empty**, and the caller writes
nothing, or garbage, into a document's frontmatter. A shell function cannot both
refuse a call and return the value the call would have produced.

So the calls that produce a value get a CLI that can be honest about not having
one, rather than a wrapper that silently lies.

---

## Usage

```bash
node references/tracker-issue.js --kind <kind> [flags] [--json] [--quiet] [--dry-run] [--strict]
```

| `--kind` | Required flags | Prints on stdout |
| -------- | -------------- | ---------------- |
| `create` | `--title` | the new issue **number** |
| `edit` | `--issue` | — |
| `close` | `--issue` | — |
| `reopen` | `--issue` | — |
| `milestone` | `--title` | the milestone **number** |
| `sub-issue-link` | `--issue`, `--parent` | — |

**Always `--body-file`, never an inline `--body`.** Bodies carry backticks,
`$(…)` and newlines, and the file is also what carries the body into the deferred
record's `command.stdin` — which is what keeps two different bodies on the same
issue two records instead of one.

`--kind create` prints the **number**, not the URL. Every call site used to follow
its create with `grep -oE '[0-9]+$'`; the CLI does it once so six prose blocks
do not each carry their own copy.

---

## The reason vocabulary

Read `reason` from `--json` and act on it:

| `reason` | What it means | What to do |
| -------- | ------------- | ---------- |
| `performed` | The mutation happened | Nothing |
| `already` | It was already in the desired state (a milestone with that title exists) | Nothing — the number is still printed |
| `deferred` | `access.tracker` is not `full`; recorded for the handover | Nothing — **the record is the deliverable** |
| `no-credentials` | `gh` is not authenticated | Log and continue; the caller is non-blocking |
| `unverifiable` | The mutation ran but its result could not be read back | Log; **do not retry blindly** |
| `failed` | The mutation raised | Log and continue |
| `dry-run` | `--dry-run` resolved everything and did nothing | Nothing |

Exit codes match the three siblings exactly, so the `|| echo "⚠️ …"` subshell
idiom in the step docs keeps working: **0** for every normal outcome (including
`deferred` and any unhandled throw), **1** for a skip but only under `--strict`,
**2** for a usage error.

---

## The empty capture is the contract

Under a deferring mode the CLI prints **nothing** to stdout. A caller doing

```bash
ISSUE_NUM=$(node references/tracker-issue.js --kind create --title "…")
```

gets an empty string — deliberately. Every commentary line goes to **stderr**
precisely so it cannot be captured as if it were the value.

**Handle an empty capture the way the `ensure-*` skills already do:** log a
warning, leave the variable empty, skip the frontmatter write, continue. Those
skills' failure tables already say *"All failures are non-blocking"* — that
existing tolerance is what makes this safe, and is why no caller needed a new
contract.

### Never write a placeholder

Not `github_issue: 0`, not `<pending>`, not an empty value.

The next run's idempotent lookup keys off that field. A wrong value makes it
create a **second** issue rather than finding the first, which turns a recoverable
state into a permanent one — a duplicate issue somebody has to notice and clean
up. **A wrong key is worse than no key.**

---

## The two-run convergence

A `create` or `milestone` under a deferring mode records `blocking: true`, because
it yields a value nothing else can supply. The checklist and the inline summary
both open with a banner saying so, and it names the three steps:

1. Perform the action (the checklist gives the deep link and the exact fields).
2. **Write the value it produced into the document's frontmatter.**
3. Re-run the skill.

The second run finds the field present and takes the ordinary update path, which
already exists in every `sync-*` and `ensure-*` skill.

> **Step 2 is the one that is easy to skip, and skipping it is silent.** Re-running
> without it does nothing at all, every time — the run has no way to learn the
> value except from the document. A run that appears to do nothing twice is
> indistinguishable from a broken one, which is why the banner states this
> outright rather than leaving the operator to infer it.

---

## The sub-issue link is one record

`sub-issue-link` is a fetch-then-mutate pair: the sub-issues API needs the child's
internal database id, which a preceding `gh api` call resolves.

Under a deferring mode it records **one composite record**, not two. Two records
would be two checklist items neither of which a human can perform alone — the
fetch changes nothing, and the mutate has no id to send. The record's `manual`
path routes around the id entirely, because the GitHub UI takes the visible issue
number.

---

## What this CLI does not cover

**Jira.** It is GitHub-only. A Jira key in `--issue` exits 2 with a message saying
so, rather than reaching the network — a Jira key arriving here at all means the
caller did not branch on `TRACKER`.

**PR create / merge / comment, and `git push`.** Those are VCS, governed by
`access.vcs`, and out of scope for the tracker-access sequence.

**Board membership and field sets.** `gh project item-add` and
`updateProjectV2ItemFieldValue` go through `tracker_write` and the two
`set-github-project-*.sh` helpers, which already gate themselves. Nothing there
returns a value a caller binds.
