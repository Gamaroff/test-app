---
name: documentation-standards-validator
description: Validate documentation follows naming conventions with DOTS not underscores, YAML frontmatter requirements, and structural standards. Use when creating PRDs, epics, or stories, validating documentation structure, reviewing doc PRs, or auditing documentation consistency. Enforces epic.163.name.md format and status indicators.
---

# Documentation Standards Validator

Validate documentation files follow naming conventions, YAML frontmatter requirements, and structural standards.

## When to Use This Skill

Activate this skill when:

1. **Creating PRDs** - Validate structure and naming
2. **Creating epics** - Check filename format and YAML
3. **Creating stories** - Verify story numbering and format
4. **Reviewing documentation** - Audit against standards
5. **Migrating documentation** - Rename to proper format
6. **Auditing docs** - Find naming violations

## Mechanical checks

This skill defines the mechanical checks below; each consuming repo implements them as its own gates (a git hook, a CI job, or a script against its own layout) — there is no shared linter here, because doc roots and corpus shape differ per repo.

The seven checks, all validated against a repo's documentation conventions: (1) status vocabulary, (2) frontmatter key completeness, (3) Change Log header — canonical format: `references/document-change-log.md`, (4) FR-tag presence (warn-level), (5) registry⇔PRD Epic-List parity, (6) epic `estimated_stories` vs active story dirs, (7) stray `PROGRESS*.md` under epics.

**(3) Change Log header — definition.** The document carries a `## Change Log` heading (or `### Change Log` for PRDs, where it nests under §1) satisfying all four of:

1. **Heading** — `Change Log` is the entire heading text after any optional section numbering (`### 1.5 Change Log` and `## 12. Change Log` both pass). Accept H2 or H3; the level found is the level preserved. A match inside a fenced code block or an inline code span does **not** count — documentation about the Change Log necessarily contains pictures of one.
2. **Columns** — exactly four, in order: `Date`, `Version`, `Description`, `Author`.
3. **Rows** — at least one, with `Date` as `YYYY-MM-DD`. `Version` may be blank (machine writers leave it so); `Author` is the skill name or a person's name.
4. **Freshness** — frontmatter `updated` is not older than the newest row's `Date`. A row that did not move `updated` leaves the document claiming it was last touched before its own most recent recorded change.

**Bug reports are exempt** — they carry `## Status History` instead, which has different columns (`Date`, `Status`, `Changed By`, `Notes`) and is the richer table for a bug. Do not flag a bug report for a missing Change Log, and do not add one.

Gate this check on `change-log.enabled` in `skills-config.yaml` (defaults to `true`), and grade it per `change-log.enforcement` (`advisory` by default). Adoption is going-forward only with no backfill, so expect documents predating the spec to fail check (3) — under `advisory` that is one finding, not a blocker.

> As stated above, this skill ships **no linter**. The deliverable for every check, including this one, is a definition precise enough for a consuming repo to implement against its own layout — not a script.

When creating or reviewing a story/epic/task, apply these checks to the affected documents and fix any violation before finishing.

## File Naming Standards

### Use DOTS Not Underscores

**Rule**: Use dots to separate components, hyphens only within descriptive names.

\`\`\`
✅ CORRECT
epic.163.module-security.md
story.163.1.encryption-service.md
task.38.authservice-di-failure.md

❌ INCORRECT
epic_163_account_security.md // Underscores
epic-163-module-security.md // Hyphens instead of dots
Epic.163.AccountSecurity.md // Capitalization
\`\`\`

### Epic Filename Format

**Pattern**: \`epic.NUMBER.descriptive-name.md\`

\`\`\`
epic.163.module-security.md
epic.164.transaction-batching.md
epic.165.chat-encryption.md
\`\`\`

### Story Filename and Directory Format

**Pattern**: `epic.NUMBER.descriptive-name/stories/story.EPIC.STORY.descriptive-name/story.EPIC.STORY.descriptive-name.md`

**Rule**: Each story MUST be placed in its own self-named subdirectory within the epic's `stories` folder.

### Story Plan Filename Format

**Pattern**: `story.EPIC.STORY.plan.descriptive-name.md`

**Rule**: The plan file (if present) must be co-located in the story's subdirectory.

```
📁 epic.163.module-security/
  📁 stories/
    📁 story.163.1.encryption-service/
      📄 story.163.1.encryption-service.md
    📁 story.163.2.biometric-auth/
      📄 story.163.2.biometric-auth.md
```

## YAML Frontmatter Requirements

### Epic Frontmatter

## \`\`\`yaml

epic_number: 163
title: Account Security Enhancement
type: epic
description: One-sentence summary of the epic
domain: Account
status: in-progress
priority: High
estimated_stories: 8
created: 2025-12-31
target_completion: 2026-01-15

---

\`\`\`

**Required Fields**: epic_number, title, type, domain, status, priority, estimated_stories, created, target_completion (`description` recommended; `tags`/`resource` optional — see [OKF](#open-knowledge-format-okf-conformance))

### Story Frontmatter

> **Canonical schema:** see [`docs/standards/story-documents.md`](../../docs/standards/story-documents.md) §Frontmatter schema. Story `status` is **kebab-case** (kebab-case for every document type — see [`references/document-status-lifecycle.md`](references/document-status-lifecycle.md)), effort is `estimated_effort_hours`, and both `created` and `updated` are required.

## \`\`\`yaml

epic: epic.163.module-security
epic_number: 163
story_number: 1
title: Implement Mnemonic Encryption Service
type: story
description: One-sentence summary of the story
tags: [security, backend]
status: ready-for-development
priority: High
story_type: backend
risk_level: high
assignee: TBD
estimated_effort_hours: 5
created: 2025-12-31
updated: 2026-01-05
github_issue: 1234

---

\`\`\`

**Required Fields** (canon §4): epic, epic_number, story_number, title, type, description, tags, status (kebab-case: `draft`/`planned`/`ready-for-development`/`in-progress`/`ready-for-review`/`accepted`/`cancelled`), priority, story_type (`full-stack`/`backend`/`frontend`/`infra`/`engine`), risk_level, assignee, estimated_effort_hours, created, updated, github_issue (`tags`/`resource` per [OKF](#open-knowledge-format-okf-conformance))

## Open Knowledge Format (OKF) conformance

All document frontmatter targets [OKF v0.1](references/open-knowledge-format.md). Apply these severities when validating any epic, story, task, or PRD:

- **`type` present and non-empty → Critical.** OKF's one hard requirement; flag a missing or empty `type` as a Critical finding (this is the gate that `documentation-standards-validator` must now enforce).
- **`description` present (one-sentence summary) → Important.** Flag a missing `description` as Important.
- **`tags` is a YAML list (when present); `resource` is a valid URI (when present) → Optional.** Flag only when malformed. Absence is not a finding (`updated` ≡ OKF `timestamp`; tracker URL ≡ OKF `resource`).

## Status Indicators

### Standard Status Icons

\`\`\`
✅ Complete - Fully implemented and merged
🔄 In Progress - Active development
⚠️ Blocked - Waiting on dependencies
❌ Cancelled - No longer pursuing
📋 Planned - Not yet started
\`\`\`

These icons are for body prose only and are never a frontmatter `status:` value — frontmatter is always kebab-case (see [`references/document-status-lifecycle.md`](references/document-status-lifecycle.md)).

### Usage in Documentation

\`\`\`markdown

## Implementation Status

- ✅ Mnemonic encryption service
- ✅ Biometric authentication
- 🔄 Secure storage integration
- 📋 PIN change flow
  \`\`\`

## Validation Checklist

### File Naming and Location

- [ ] Uses dots not underscores
- [ ] Lowercase descriptive names
- [ ] Hyphens only within names
- [ ] Correct pattern (epic.N.name.md or story.E.S.name.md)
- [ ] .md extension
- [ ] Stories are placed in self-named subdirectories (e.g., `story.1.1.name/story.1.1.name.md`)
- [ ] Correct pattern for plan files (story.E.S.plan.name.md) if present

### YAML Frontmatter

- [ ] All required fields present
- [ ] Correct field names (epic_number not epicNumber)
- [ ] `type` present and non-empty (OKF — Critical when missing)
- [ ] `description` present (OKF — Important when missing)
- [ ] `tags` (if present) is a list; `resource` (if present) is a URI (OKF — Optional)
- [ ] Valid status indicator
- [ ] ISO dates (YYYY-MM-DD)
- [ ] Proper YAML syntax

### Structure

- [ ] Proper heading hierarchy (# → ## → ###)
- [ ] Status indicators used correctly
- [ ] Cross-references valid
- [ ] Code blocks formatted

## Resources

### Reference Documentation

- **prd-structure-guide.md** - PRD organization and structure standards
- **epic-template.md** - Epic template with YAML frontmatter
- **story-template.md** - Story template with YAML frontmatter

---

**Skill Version**: 1.0.0
**Last Updated**: 2025-12-31
