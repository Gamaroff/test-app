---
name: project-completion-roadmap
title: "<Project> — Project Completion Roadmap"
type: guide
status: active
---

# <Project> — Project Completion Roadmap

**Purpose**: the single, ordered backlog of everything still outstanding to take
<Project> to a finished product. Every item is one story or task — enumerated so
`/develop-next` can pick it up, run its pipeline, and check it off. This file is a
*living backlog*: when an item is accepted + merged, tick it `[x]`; once whole
milestones are done you may archive them out to a `roadmap-history.md`.

## How to use this document

1. **Work top-to-bottom within a phase.** `PHASE` headings are hard boundaries.
2. **Obey `deps:`** — an item is eligible only when every dependency is `[x]`,
   marked *(shipped)*, or already archived out of this backlog.
3. **`‖` = parallelizable, `→` = sequential.** State each epic's flow on a
   `Flow:` line under its heading.
4. **Run the named command.** Stories → `` `/develop-story` ``, tasks →
   `` `/develop-task` ``, bug reports → `` `/develop-bug` ``. The path is taken from
   the row's `[story](…)`/`[task](…)`/`[bug](…)` link (or an inline path after the
   command).
5. **Tick `[x]` only when accepted** (QA PASS + DoD verified + merged), and add a
   Change Log row.

### Legend
- `[ ]` outstanding · `[x]` accepted · **deps:** prerequisites · **gate:** a ship
  gate (build in parallel, don't expose before it lands) · **flag:** feature-flagged
  soft dep · `‖` parallel · `→` sequential · `⏭️ SKIP` deferred & non-blocking
  (the loop steps past it) · `manual`/`🚧` operator-gated (the loop stops) ·
  `⛔ BLOCKED until X` skip until X is accepted.
- **touches:** write-footprint for `/develop-batch` worktree fan-out — comma-separated
  resource tags, each `!` (hard/exclusive — serialize) or `~`/unmarked (soft/additive —
  parallel-OK, second merger rebases); `+own` = self-contained, no shared file.
  `--batch` only; ignored by single-item selection. Two rows may run concurrently only if
  they share no `!` tag. Tag vocabulary is project-specific — define a **Conflict-footprint
  registry** in this Legend (tag → path/region) once you start annotating.
- Item format: `- [ ] **<id>** <title> — [story](<path>) · deps: … · touches: … · \`/develop-story\``
  (or `[task](…)` + `` `/develop-task` ``, or `[bug](…)` + `` `/develop-bug` ``)

---

# PHASE 1 — <first milestone>

## <Area or Epic N — name>

- [ ] **1.1** <title> — [story](<relative/path/to/story.1.1.<name>.md>) · deps: none · `/develop-story`
- [ ] **1.2** <title> — [task](<relative/path/to/task.<n>.<name>.md>) · deps: 1.1 · `/develop-task`
- [ ] **1.3** <title> — [bug](<relative/path/to/bug.<n>.<name>.md>) · deps: none · `/develop-bug`

---

## Change Log

| Date | Version | Change | Author |
|---|---|---|---|
| <YYYY-MM-DD> | 1.0 | Initial roadmap | <author> |
