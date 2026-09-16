<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/tracker-card-summary.md. Regenerate via `npm run bundle`. -->
# Tracker Card Summary Contract

**A tracker card is a pointer to the document, not a copy of it.**

This is the single canonical spec for what goes into a Jira issue description or a
GitHub issue body when a story, task, or epic is synced. Every writer — the Jira
sync scripts, the `ensure-*-github-issue` sub-routines, the `sync-github-*`
update paths, `review-task`, `jira-epic-creator` — follows it. Do not restate the
shape anywhere else; link here instead.

## Why

The local markdown file is the source of truth and every card links back to it.
A card that mirrors the document is a second copy that goes stale between syncs,
and it buries the one thing a board reader wants — *what is this ticket about?* —
under material they could read in the repo.

The Jira task card used to publish all **eleven** `## ` sections of the task
document verbatim, plus the document's entire Change Log as a table, on every
sync. Descriptions grew until Jira rejected the whole `PUT` with
`CONTENT_LIMIT_EXCEEDED`, which failed silently and left cards stale — the
failure that `capDescriptionAdf()` was written to catch.

So the caps below are **editorial, not defensive**. The size guard stays as a
backstop; after summarisation it should never fire.

## Caps

| What | Cap |
|---|---|
| Prose section (summary / overview) | first paragraph, **4 sentences** |
| Criteria list (acceptance / success) | **5 items** |
| Breaking changes | **3 items** |

Anything trimmed is announced with a pointer at the document:

> `+7 more in `[the story document](…)

**Never truncate silently.** A reader who is not told they are seeing part of
something will believe they have read all of it, which is worse than any amount
of verbosity. The count must be accurate.

## What a card carries

Same order on both platforms: **Summary → Criteria → Metadata → Document links.**

Links go last. The card is a pointer, so the route to full detail is the last
thing a reader passes on their way out — not a block they scroll past before
reaching the summary.

### Story

| Block | Source |
|---|---|
| Summary | `## User Story` / `## Story` / `## Story Statement`, falling back to `## Description` |
| Acceptance Criteria | `## Acceptance Criteria`, capped at 5 |
| Metadata | frontmatter — priority, effort, epic, status |
| Document | link to the story file, then the parent epic, then durable sibling docs |

### Task

| Block | Source |
|---|---|
| Summary | `## Overview` |
| Success Criteria | `## Success Criteria`, capped at 5 |
| Breaking Changes | `## Breaking Changes`, capped at 3 — **omitted entirely when absent**, which is the common case |
| Metadata | frontmatter — priority, effort, category, depends-on, status |
| Document | link to the task file, then co-located siblings (runbooks, reports) |

### Epic

| Block | Source |
|---|---|
| Summary | `## Epic Goal`, falling back to `## Epic Description` |
| Stories Breakdown | the **overview table only** — found wherever it sits, including under a `### Stories Overview` heading |
| Metadata | frontmatter — type, PRD, estimated sprints, status |
| Document | link to the epic file, then the parent PRD, then child stories |

### Bug

| Block | Source |
|---|---|
| Summary | `## Bug Description`, first 4 sentences |
| Reproduction | `## Reproduction Steps`, capped at 5 |
| Impact | `## Scope & Impact` / `## Acceptance Criteria Violation` / `## Success Criteria Violation` — one spec, three aliases, capped at 5, **omitted entirely when absent** |
| Metadata | severity, priority, bug status, created, related |
| Source Documents | the bug report, then its parent document, then that parent's card, then (story mode) the epic, then the bug's own durable siblings |

`## Evidence` is deliberately **excluded**. It is the largest section of a bug report and the
fastest to go stale — screenshots, log dumps, stack traces — and it is precisely the material a
pointer exists to avoid copying.

The three violation headings are mode-dependent (story / task / general), which is why they are one
spec with an alias array rather than three specs: it keeps bug mode out of the card builder.

## What a card never carries

- **The document's Change Log.** Jira and GitHub both keep their own issue
  history, and the local file holds the authoritative log. A third copy grew on
  every sync and told a reader nothing new.
- **Implementation detail** — Dev Notes, Tasks/Subtasks, Implementation Plan,
  Files Summary, Testing Strategy, Risk Assessment, Rollback Plan, Technical
  Background, Motivation, Scope. All of it lives in the linked document.
- **Per-story subsections of an epic's Stories Breakdown.**
- **Authoring guidance.** Boilerplate telling a story author which frontmatter
  keys to set is instruction for the repo, not information for a card reader.
- **Stakeholder Sign-off.** Explicitly excluded — see `create-story` and
  `create-task`.

## Implementation

The Jira path is deterministic JS. Helpers live in the shared `jira-sync.js`
library (vendored as `references/jira-sync.js` in each skill that syncs to Jira)
and are the only correct way to build a card body. Its path is deliberately not
spelled out here: naming a shared resource in prose makes the bundler vendor it,
and the GitHub-only skills that follow this spec have no use for a Jira client.

| Function | Role |
|---|---|
| `summariseSection(content, {maxItems, maxSentences})` | → `{text, omitted, kind}`; detects list vs prose |
| `dropHeadingLines(content)` | removes `###` grouping labels, keeps what is under them |
| `firstTableIn(content)` | the first pipe table in a section, wherever it sits |
| `summaryBlockNodes({...})` | one section → ADF heading + body + `+N more` pointer |
| `buildCardSections(body, specs, {...})` | the whole card body from a spec list |
| `capDescriptionAdf(doc, {...})` | last-resort size backstop |

Section specs accept `{ heading, names, maxItems, maxSentences, optional, transform }`.
`names` is an alias array passed to `extractBodySections`, so alternative
spellings and `## 1.` numbering keep working. `heading` is a **fixed** string,
not the matched heading — a story using `## Story Statement` and one using
`## User Story` must produce the same card.

Three rules that are easy to get wrong:

- **Never cut a section at its first `###`.** Real authors put the content the
  card wants *underneath* a grouping heading — a task's Success Criteria opens
  with `### Functional`, an epic's Stories Breakdown puts its overview table
  under `### Stories Overview`. Cutting there deletes the wanted content and
  keeps the preamble. Drop the heading lines and keep what is under them.

- **Hash what you publish.** A skill's `hashBody()` must hash the *summarised*
  output. Hashing raw sections makes an edit to a section the card no longer
  carries flip the hash and fire a `PUT` that changes nothing.
- **`optional: true` suppresses the missing-section warning.** Use it for
  sections that are legitimately absent most of the time. Warning about them
  every sync trains operators to ignore the warning that matters — the one
  saying the document and the section list disagree about a heading name.

## Preflight

A heading mismatch is silent: the sync succeeds, reports no problem, and
publishes a thin or empty card. Check the document before that happens:

```bash
node .agents/skills/sync-jira-task/scripts/sync-jira-task.js --file <doc.md> --check-card
```

No auth, no network, no writes. Exit 0 = every card block resolves; exit 1 =
findings, each printed with its fix. `--json` gives `{ok, findings, blocks}`.
Finding codes: `missing` (no heading matched), `empty` (heading present but
nothing summarisable under it), `no-body` (nothing resolved at all), `no-table`
(epic Stories Breakdown has no overview table).

`review-story`, `review-task` and `review-epic` run this in their template
compliance step and treat `missing` / `empty` / `no-body` as **Critical**. The
fix always belongs in the document — no code can invent a Summary the file does
not contain.

The GitHub path is assembled by the model from a template in each
`ensure-*-github-issue` skill. Same blocks, same caps, markdown instead of ADF,
criteria as `- [ ]` checkboxes.
