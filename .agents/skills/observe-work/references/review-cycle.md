# The review cycle

> **Load when** `/observe-work --review` is invoked, or the Session Start review trigger is accepted.

The review turns the observation backlog into **staged** skill updates. It never installs them.

## Contents

- [Before you start](#before-you-start)
- [Step 1 — Archive, then load the queue](#step-1--archive-then-load-the-queue)
- [Step 2 — Inventory the skills and classify each write target](#step-2--inventory-the-skills-and-classify-each-write-target)
- [Step 3 — Cross-check every observation against every skill](#step-3--cross-check-every-observation-against-every-skill)
- [Step 4 — Audit families for drift](#step-4--audit-families-for-drift)
- [Step 5 — Apply, beginning with the copy](#step-5--apply-beginning-with-the-copy)
- [Step 6 — Re-scan before marking anything actioned](#step-6--re-scan-before-marking-anything-actioned)
- [Step 7 — Timestamp](#step-7--timestamp)
- [Step 8 — Deliver and summarise](#step-8--deliver-and-summarise)
- [Approval policy](#approval-policy)
- [The summary format](#the-summary-format)

---

## Before you start

Resolve the workspace, guarded, exactly as `SKILL.md` specifies. Every path below is relative to it.

The review is a **long autonomous run whose output cannot land without a human**. That is the trade:
it may work the whole backlog unattended precisely because staging is the only write it performs to
skill content.

---

## Step 1 — Archive, then load the queue

```bash
command node references/observation-log.js archive --json
command node references/observation-log.js queue --json
```

Archive first. The sweep is also folded into `next-id`, so it cannot be skipped by a write path —
but running it here means the queue you load is not padded with entries the last review closed.

**The queue is derived from the directory listing**, never from a `grep 'status: open'`. `status` is
optional and its absence means `open`, so a grep drops exactly the files that most belong in the
queue. The engine does this for you; the rule is stated so you do not "optimise" it back.

The payload names `statusless` files explicitly as well as counting them. Counting without naming
would make the queue's size correct and the reason for it invisible.

`parked` entries are **not** in the queue and **never archive**. They are decided-but-blocked, and
each carries a `parked_until:` condition. Re-check those conditions during this review — that is the
only moment anything looks at them.

> **Never stamp a `resolved:` date onto a parked entry to tidy it away.** It archives, its condition
> is never re-checked, and it is lost rather than deferred. That is the same bug wearing a date.

---

## Step 2 — Inventory the skills and classify each write target

List the skills in scope, then classify each one by whether an edit to it would **survive** — not by
whether the edit would succeed. These are different questions and only the first matters.

| Class | Meaning | What the review does |
|---|---|---|
| **user-owned** | The live file is the file the user edits and keeps | Stage normally |
| **writable-but-volatile** | The write succeeds and is reverted by a later regeneration or sync — a bundled `references/` copy, a generated catalog, a managed dotfile | Stage against the **source**, and say so in the summary |
| **read-only** | The path cannot be written at all | Stage, and name the manual install step |

The volatile class is the one that costs real work. An edit applied to a bundled copy passes every
check in the session that made it and is silently reverted by the next bundle. Identify the source
of truth *before* staging, not after.

---

## Step 3 — Cross-check every observation against every skill

Not observation-by-observation. **Cluster by the decision required**, not by the skill filed against.

An observation naming `review-task` and one naming `review-story` may both be asking for the same
decision — "how does a reviewer treat a stale artifact?" — and answering it once, coherently, is
better than answering it twice in two files that then disagree. Conversely, two observations filed
against the same skill may require unrelated decisions and should not be batched.

For each cluster, decide one of:

- **apply** — the change is clear and belongs in the named skills;
- **decline** — with a reason recorded in `resolution:`; a declined observation is a resolved one;
- **park** — the decision is made but an external precondition is not met. Requires `parked_until:`;
- **carry** — see below.

### The carrier pattern

When a session acts on **part** of a multi-skill observation's `skill:` list, both obvious moves lie:
marking it `actioned` claims the whole thing was done; leaving it `open` claims none of it was.

Do both halves explicitly:

1. Mark the original `actioned`, with a `resolution:` naming **which portions were applied**.
2. Log a **carrier** observation holding the remainder — only the outstanding skills in its `skill:`
   list, and enough substance to stand alone.

**The carrier must stand alone.** A bare pointer back to the original is not enough: the original is
about to archive, and a pointer into the archive is a pointer a reviewer will not follow.

---

## Step 4 — Audit families for drift

```bash
command node references/observation-log.js families --audit --json
```

A **family** is a set of skills that must stay coherent — `review-story` / `review-task` /
`review-bug`, say. The audit greps each member for each shared rule and reports gaps, judging an
absence against the family's `Member-specific` column before calling it drift.

Run this **after** Step 3's clustering and **before** Step 5's edits. A change staged into one family
member without this audit is how families diverge one well-intentioned edit at a time.

---

## Step 5 — Apply, beginning with the copy

**Begin with the copy, not the edit.** For each skill being changed:

1. Read the **live** file fresh. Not a workspace copy, not memory.
2. Copy the **full skill directory** into `$OBS_STAGING_DIR/<skill>/`. Never `SKILL.md` alone — a
   single-file delivery of a multi-file skill truncates it silently.
3. Edit the staged copy.

Full discipline, including the rebase rule when a staged copy already exists:
[`applying-updates.md`](applying-updates.md).

---

## Step 6 — Re-scan before marking anything actioned

```bash
command node references/observation-log.js scan --json
```

The queue loaded in Step 1 is a **snapshot of a shared append-only store**. Another session may have
written to it while this review ran. Re-scan, and:

- an entry that arrived during the run is **not** actioned by this review — it was never evaluated;
- an entry whose status changed under you was resolved elsewhere; do not overwrite that resolution.

Then mark the entries this review actually decided:

```bash
command node references/observation-log.js set-status \
  --id N --status actioned --resolution "…" --json
```

`--status` is one of `actioned`, `declined`, `superseded`, `parked`. A `parked` write without
`--parked-until` trips `parked-without-condition` and exits 1.

---

## Step 7 — Timestamp

Write today's date to `$OBS_WORKSPACE/skill-observations/last-review-date.txt`. This is what the
Session Start review trigger reads. A review that skips this step re-offers itself every session.

---

## Step 8 — Deliver and summarise

Deliver the staged directory and tell the user how to install it. Then emit the summary below.

---

## Approval policy

| Situation | Policy |
|---|---|
| Staging any update | **No approval needed.** Staging is inert by construction |
| Installing a staged update | **Always the user.** The skill never installs |
| Declining an observation | Autonomous, with the reason recorded in `resolution:` |
| Parking an observation | Autonomous, and requires `parked_until:` |
| Proposing a **new** skill | Stage the scaffold via `create-skill`; the user decides whether it joins the library |
| An observation that would change this skill | Same rules. `observe-work` gets no exemption from its own staging rule |

---

## The summary format

Four sections. **The last three are omitted only when genuinely empty, and their emptiness is stated
rather than implied by absence** — a missing heading reads identically to a heading with nothing
under it, and one of those is a finding.

```
## Skill review — {date}

Worked {N} observations: {A} actioned, {D} declined, {P} parked, {C} carried.

### Staged
- `<skill>` — {what changed, one line}. Install: {path}
  (source of truth: {path} — the live file is a generated copy)

### Family coherence
- {family}: {coherent | drift found and staged | not audited, and why}

### Parked
- #{id} {title} — unparks when: {condition}

### Arrived during this run
- #{id} {title} — not evaluated by this review; next review picks it up
- (or: "none")
```

**Family coherence, parked entries, and what arrived during the run must never be omitted.** Each
one is a case where silence and "nothing to report" are indistinguishable, and each is the case a
reader most needs to be able to tell apart.
