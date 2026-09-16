---
name: remember-insight
description: Saves an insight to the project's persistent memory system. Reads all existing memory files, determines whether the insight can be merged into an existing file or needs a new one, then writes the memory and updates MEMORY.md. Use this skill when the user shares an insight (e.g. from an agent run, a retrospective, or a discovery) and wants it preserved across future conversations.
---

# Remember Insight

## Overview

Takes an insight — a non-obvious fact, pattern, or lesson — and persists it in the project memory system. Either merges it into an existing relevant memory file or creates a new one, then updates the MEMORY.md index.

## Workflow

### Step 1 — Locate the memory directory

The project memory directory is defined in your system context (auto-memory section). It follows the pattern:
```
<backup-root>/.claude/projects/<encoded-project-path>/memory/
```

Read `MEMORY.md` from that directory to get the full index of existing memory files.

### Step 2 — Read relevant existing memory files

Based on the MEMORY.md index, identify candidate files that might be related to the insight. Read each candidate file. Consider:

- **Type match**: Does the insight describe a rule/preference (→ `feedback`), a project decision (→ `project`), a person/role (→ `user`), or a pointer to an external resource (→ `reference`)?
- **Topic match**: Is there already a file covering the same domain (e.g. `feedback_skill_pipeline.md`, `project_support_ticket_system.md`)?

### Step 3 — Decide: merge or create

**Merge** if an existing file:
- Covers the same topic/domain
- Would be more complete and useful with this insight added
- Adding to it won't make it unwieldy (keep files focused)

**Create** if:
- No existing file covers this topic
- The insight is a distinct enough concern to warrant its own file
- Merging would bloat an existing file with unrelated content

### Step 4 — Write the memory

**If merging:** Edit the existing file, appending or integrating the new content naturally. Preserve the existing frontmatter. Follow the file's existing structure.

**If creating:** Write a new file using this template:

```markdown
---
name: <short descriptive name>
description: <one-line description — specific enough to judge relevance without reading the file>
type: <feedback | project | user | reference>
---

<memory content>
```

For `feedback` and `project` types, structure the body as:
```
<rule or fact>

**Why:** <reason or motivation>
**How to apply:** <when/where this guidance kicks in>
```

For `user` and `reference` types, use clear prose.

**Filename convention:**
- `feedback_<topic>.md` — rules and preferences
- `project_<topic>.md` — project decisions and state
- `user_<topic>.md` — user profile details
- `reference_<topic>.md` — pointers to external systems

### Step 5 — Update MEMORY.md

If a new file was created, add a one-line entry to `MEMORY.md` under the most appropriate section:
```
- [Title](filename.md) — one-line hook describing what's in it
```

Keep the hook under ~150 characters. If no section fits, add one. Do not duplicate entries.

If a file was merged/updated, no MEMORY.md change is needed unless the description should be improved.

### Step 6 — Confirm

Report back to the user:
- Whether the insight was **merged** into an existing file (name it) or **created** as a new file (name it)
- One sentence summarising what was saved

## What NOT to save

Reject or redirect insights that fall into these categories — they don't belong in memory:

- Code patterns or architecture derivable from reading the codebase
- Git history or recent changes (`git log` is authoritative)
- Debugging solutions or fix recipes (the fix is in the code; commit message has context)
- Anything already documented in `CLAUDE.md`
- Ephemeral task details or in-progress work state

If the insight falls into one of these, tell the user why it won't be saved and suggest where it should go instead (e.g. a commit message, a CLAUDE.md update, a code comment).

### Related: `observe-work`

`remember-insight` persists an insight **the user states** to the project memory directory. `observe-work` notices signals unprompted during ordinary work and writes them to the observation log, targeting *skills* rather than memory.

Rule of thumb: if it changes how you want the agent to behave across projects, it is a memory; if it names a missing rule, step or principle in a specific skill, it is an observation. The two destinations are not interchangeable — a memory is loaded into every session's context, while an observation waits in a backlog for a review that turns it into a skill edit. Filing a skill gap as a memory means carrying it in context forever instead of fixing it once.

Disambiguate by input: a stated insight is a memory, a finished artifact is an audit, an explicit end-of-session pass is `autoskill`, and anything noticed in passing during the work is an observation.
