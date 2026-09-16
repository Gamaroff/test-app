---
name: epic-registry-manager
description: Manage global epic numbering and registry updates. Use when creating new epics to assign next available epic number, validate epic.NUMBER.name.md filename format, update epic-registry.md with new entries, and ensure YAML frontmatter compliance. Prevents epic number conflicts and maintains central epic tracking.
---

# Epic Registry Manager

Manage globally unique epic numbers and maintain the central epic registry for consistent epic tracking across your project.

## When to Use This Skill

Activate this skill when:

1. **Creating a new epic** - Assign next available epic number
2. **Validating epic filenames** - Check epic.NUMBER.name.md format
3. **Updating epic registry** - Add new epic to central registry
4. **Checking epic conflicts** - Verify epic number not already used
5. **Auditing epic numbering** - Review all epic assignments
6. **Renaming epics** - Update epic number and registry entry

## Epic Numbering System

### Globally Unique Epic Numbers

**Rule**: Epic numbers are globally unique across ALL domains and features.

\`\`\`
${PRD_ROOT}/{domain}/{feature}/epics/
├── epic.163.module-security/
│ ├── epic.163.module-security.md ← Epic #163
│ └── stories/
├── epic.164.transaction-batching/
│ ├── epic.164.transaction-batching.md ← Epic #164 (next sequential)
│ └── stories/
└── epic.165.chat-encryption/
├── epic.165.chat-encryption.md ← Epic #165 (different domain, still sequential)
└── stories/
\`\`\`

**NOT** scoped by domain or feature.

### Epic Registry File

**Location**: \`/docs/development/epic-registry.md\`

## Workflow: Create New Epic

### Step 1: Check Next Available Number

Read epic registry and find highest epic number. Next epic number = highest + 1.

### Step 2: Determine Domain and Feature

Prompt user for:

- **Domain** (e.g., "ui-domain", "service-domain", "domain-name")
- **Feature** (e.g., "example-auth", "account", "module-name")

Validate that \`${PRD_ROOT}/{domain}/{feature}/epics/\` directory exists.

### Step 3: Validate Directory and File Names

**Directory Pattern**: \`epic.NUMBER.descriptive-name/\`
**Epic File Pattern**: \`epic.NUMBER.descriptive-name.md\`

**Rules**:

- Use DOTS not underscores
- Lowercase descriptive name
- Hyphens separate words in name
- .md extension for file
- Directory and filename must match (except .md extension)

### Step 4: Create Epic Directory Structure

Create nested subdirectory structure:

First source `references/resolve-paths.sh` to populate `${PRD_ROOT}` (default `docs/prd`).

\`\`\`bash
mkdir -p "$PRD_ROOT/{domain}/{feature}/epics/epic.{NUMBER}.{name}/stories/"
touch "$PRD_ROOT/{domain}/{feature}/epics/epic.{NUMBER}.{name}/epic.{NUMBER}.{name}.md"
\`\`\`

**Example** (with default `PRD_ROOT=docs/prd`):
\`\`\`bash
mkdir -p docs/prd/service-domain/account/epics/epic.323.example-backup/stories/
touch docs/prd/service-domain/account/epics/epic.323.example-backup/epic.323.example-backup.md
\`\`\`

### Step 5: Create Epic File with YAML Frontmatter

Required YAML fields: epic_number, title, domain, status, priority, estimated_stories, created, target_completion.

Use template from \`/docs/templates/epic-template.md\`.

**Seed the epic's Change Log with row one**, exactly as \`create-epic\` does. This skill creates epic files directly, bypassing \`create-epic\`, so an epic born here would otherwise start life with no history at all. Canonical format: [document-change-log.md](references/document-change-log.md).

\`\`\`markdown
## Change Log

| Date       | Version | Description   | Author                |
| ---------- | ------- | ------------- | --------------------- |
| 2026-08-12 | 1.0     | Initial draft | epic-registry-manager |
\`\`\`

The registry row added in Step 6 is a **separate concern and not a Change Log matter** — the registry tracks epic numbering across the repo, the Change Log tracks what changed about this one epic document. Skip when \`change-log.enabled: false\` in \`skills-config.yaml\`.

### Step 6: Update Epic Registry

Add entry to \`/docs/development/epic-registry.md\` sorted by epic number.

**Registry Entry Format**:
\`\`\`
| 323 | - | service-domain/account | epic.323.example-backup | Epic 323: Secure Backup | NOT_STARTED | YYYY-MM-DD |
\`\`\`

## Resources

### Reference Documentation

- **epic-registry.md** - Central registry of all epic numbers and status
- **epic-template.md** - Template for new epic files with required YAML frontmatter

---

**Skill Version**: 1.0.0
**Last Updated**: 2025-12-31
