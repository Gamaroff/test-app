<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/sign-off.md. Regenerate via `npm run bundle`. -->
# Stakeholder Sign-off

> **Canonical spec.** Consumed by `create-story`, `create-task`, `review-story`, `review-task`.

A story or task carries a **Stakeholder Sign-off** section: a short table where the people
accountable for the work type their name before development begins. It is a human gate on a
machine pipeline — the one place in a story or task document that an agent scaffolds but
never fills.

## Why it looks like this

Stakeholders sign by **editing the document directly** — in the Bitbucket or GitHub web
editor, or via `git` — and committing the change themselves. The typed name is the
human-readable signature; the **commit authorship is the audit trail**. If the typed name and
the commit author disagree, `git log` shows exactly what happened (a delegated signature,
a signature added on someone's behalf, a copy-paste). Nothing verifies the two match
automatically, and nothing needs to: the evidence is durable and inspectable.

This is why sign-off is **never published to a tracker**. Signing a Jira or GitHub issue
produces no commit and therefore no audit trail. Sign-off lives in the repository, in git
history, and nowhere else.

## The section

```markdown
## Stakeholder Sign-off

Sign when you have reviewed this document: replace your **Signature** cell with your name
and today's date, then commit the change yourself — your commit authorship is the audit
trail, which is why an agent scaffolds these rows and never fills them.

**This gate is `advisory` by default, and does not block development.** The authority is
`sign-off.enforcement` in `skills-config.yaml`. Under `advisory` an unsigned required row is
raised as an **Important** review finding and docks the readiness score, but the verdict may
still be GO and `/develop-*` proceeds. Only if that key is set to `blocking` does an
unsigned row become a **Critical** finding that withholds the status promotion and halts the
pipeline at Step 2.

| Role              | Signature | Date       |
| ----------------- | --------- | ---------- |
| Product Owner     | Jane Doe  | 2026-08-06 |
| Tech Lead         |           |            |
| Design (optional) |           |            |

**Sign-off status:** Pending — 1 of 2 required signatures
```

Rules:

- **Exactly three columns**: `Role`, `Signature`, `Date`. No signatory-name column — the
  Signature cell is the name.
- **Optional roles carry a ` (optional)` suffix** in the Role cell. That suffix is the only
  marker distinguishing required from optional, which is what lets the table stay three
  columns. It is matched case-insensitively and must be the end of the cell.
- **Date format is `YYYY-MM-DD`**, matching frontmatter `created` / `updated`.
- **A row is signed** when both its Signature and Date cells are non-empty after trimming.
  A cell holding only a placeholder (`_sign here_`, `TBD`, `—`, `-`, `N/A`) counts as unsigned.
- **`**Sign-off status:**`** is a generated one-line summary immediately below the table:
  `Pending — {signed} of {required} required signatures`, or `Complete — {n} of {n} required
  signatures` when every required row is signed. It is a convenience for humans scanning the
  file; **the table rows are the source of truth**. When the two disagree, trust the table
  and rewrite the status line.

## Agents never sign

An agent may create the section, write the Role cells from config, and regenerate the
`**Sign-off status:**` line. An agent **must never write into a Signature or Date cell**, and
must never mark a row signed on a human's behalf — including when a user says "sign it for
me". Point them at the file and let them commit it.

The section is owned by the document's author skill (`create-story` / `create-task`) and is
absent from `develop`'s write allow-list, so implementation never touches it.

## Configuration

Read from `skills-config.yaml` at the repository root:

```yaml
sign-off:
  enabled: true
  enforcement: advisory # advisory | blocking | off
  story:
    required: [Product Owner, Tech Lead]
    optional: [Design]
  task:
    required: [Tech Lead]
```

| Key                 | Type                                | Default    | Effect                                                                       |
| ------------------- | ----------------------------------- | ---------- | ---------------------------------------------------------------------------- |
| `sign-off.enabled`  | boolean                             | `false`    | Master switch. Absent block or `false` → section is not emitted, not checked. |
| `sign-off.enforcement` | `advisory` \| `blocking` \| `off` | `advisory` | How `review-*` grades an unsigned document.                                   |
| `sign-off.story.required` | list[string]                  | `[Stakeholder]` | Roles that must sign a story.                                           |
| `sign-off.story.optional` | list[string]                  | `[]`       | Roles offered a row but not required to sign a story.                        |
| `sign-off.task.required`  | list[string]                  | `[Stakeholder]` | Roles that must sign a task.                                            |
| `sign-off.task.optional`  | list[string]                  | `[]`       | Roles offered a row but not required to sign a task.                         |

Per-document override (story/task frontmatter, optional):

| Key              | Type         | Default             | Effect                                                          |
| ---------------- | ------------ | ------------------- | --------------------------------------------------------------- |
| `sign_off_roles` | list[string] | (falls back to config) | Replaces the config roster for this document only. `[]` means no signatures required. |

### Where the roster comes from — three levels

The config roster is a **default**, not a lock. Resolution order when `create-story` /
`create-task` seeds the table:

1. **Per-document frontmatter** — `sign_off_roles:` on the individual story or task, when
   present, **replaces** the config roster for that document. Use it for the one-off: a story
   that happens to need the CTO, a task that needs Security.

   ```yaml
   sign_off_roles: [CTO, Tech Lead, Design (optional)]
   ```

   Optional roles carry the same ` (optional)` suffix they do in the table. An empty list
   (`sign_off_roles: []`) is a deliberate "no signatures required" and emits the section with
   a note rather than falling back to config.

2. **Project config** — `sign-off.{story,task}.required` + `.optional` in `skills-config.yaml`.
   The default for every document of that type.

3. **Built-in fallback** — a single `Stakeholder` row.

**After creation, the table itself is authoritative.** `review-story` and `review-task` grade
the rows that are *in the document*, never the config. So a fourth path is always open: add a
row by hand during refinement and commit it — a hand-added `| CTO | | |` is enforced exactly
like a config-seeded one. Removing a row removes that requirement, visibly, in the diff.
Neither skill rewrites a table that already exists, so nobody's edits get clobbered by a later
config change.

**Unconfigured fallback.** When `enabled: true` but the per-document-type roster is missing or
empty, emit a single required row:

```markdown
| Role        | Signature | Date |
| ----------- | --------- | ---- |
| Stakeholder |           |      |
```

**Default is off.** A project that has never heard of sign-off sees no behaviour change. This
matches how OKF frontmatter was adopted: additive and going-forward only. Existing story and
task documents are **not** backfilled — a document written before the feature was enabled has
no section, and `review-*` treats a missing section under `enforcement: advisory` the same as
an unsigned one.

## Enforcement

`review-story` and `review-task` check two things and nothing more: the section is **present**,
and every **required** row is **signed**. There is no git verification, no name matching, no
identity check.

| `enforcement` | Missing section or unsigned required row | Effect on the pipeline                       |
| ------------- | ---------------------------------------- | -------------------------------------------- |
| `advisory` (default) | **Important** issue + readiness-score deduction | None — verdict may still be GO, `develop-*` proceeds |
| `blocking`    | **Critical** issue → NO-GO               | `develop-*` HALTs at Step 2 via the existing status gate |
| `off`         | not checked                              | None                                         |

Optional rows are never graded. An unsigned optional row is not an issue at any enforcement
level.

Under `blocking`, the review must **not** promote the document out of `draft` / `planned`.
The develop pipelines gate on the `Status:` field, not on the numeric score, so leaving the
status unpromoted is what actually stops the run.

## Reviewer output

Report unsigned required roles by name so the human knows who to chase:

```markdown
- **[Important]** Stakeholder Sign-off incomplete — 1 of 2 required signatures.
  Awaiting: **Tech Lead**. Enforcement is `advisory`, so this does not block development.
```

Under `blocking`, the same finding is `[Critical]` and the closing sentence becomes
`Enforcement is 'blocking' — development cannot begin until this is signed.`

## See also

- [`document-status-lifecycle.md`](document-status-lifecycle.md) — the status states sign-off gates
- [`docs/reference/configuration.md`](https://github.com/Gamaroff/agent-skills/blob/develop/docs/reference/configuration.md) — full `skills-config.yaml` schema
