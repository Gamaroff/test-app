# PRD Structure & Organization Guide

**Purpose**: Guide for organizing Product Requirement Documents, Epics, and Stories
**Last Updated**: YYYY-MM-DD
**Audience**: Product Managers, Technical Writers, Development Teams

---

## Table of Contents

1. [PRD Directory Structure](#prd-directory-structure)
2. [Document Hierarchy](#document-hierarchy)
3. [File Naming Conventions](#file-naming-conventions)
4. [When to Create Each Document](#when-to-create-each-document)
5. [Document Relationships](#document-relationships)
6. [Best Practices](#best-practices)

---

## PRD Directory Structure

### Complete Structure Template

```
docs/prd/[domain]/[feature]/
├── Core PRD Documents (Required)
│   ├── executive-summary.md
│   ├── goals-and-objectives.md
│   ├── product-requirements.md
│   └── technical-implementation.md
│
├── Specialized Specifications (Optional)
│   ├── uiux-design-specifications.md
│   ├── [feature]-specification.md         # Feature-specific details
│   ├── api-specification.md
│   ├── security-requirements.md
│   └── compliance-requirements.md
│
├── Status & Planning (Recommended)
│   ├── IMPLEMENTATION-STATUS.md
│   ├── CROSS-REFERENCE-GUIDE.md
│   ├── DEVELOPER-QUICK-START.md
│   └── implementation-phases.md
│
└── Epic & Story Documentation (Nested Structure)
    └── epics/
        ├── index.md                          # Epic roadmap and overview
        ├── EPIC-CREATION-SUMMARY.md          # Epic overview
        │
        ├── epic.[N].[name]/                  # Epic subdirectory
        │   ├── epic.[N].[name].md            # Epic file
        │   ├── EPIC-[N]-ROADMAP.md           # Week-by-week plan (optional)
        │   └── stories/                      # Stories for this epic
        │       ├── story.[N].1.[name].md
        │       ├── story.[N].1.[name].completion.md    # Completion doc
        │       ├── story.[N].2.[name].md
        │       ├── story.[N].2.[name].worklet-fix.md   # Technical addendum
        │       └── EPIC-[N]-STORIES-INDEX.md           # Large epic index (optional)
        │
        ├── epic.[N+1].[name]/                # Next epic subdirectory
        │   ├── epic.[N+1].[name].md
        │   └── stories/
        │       ├── story.[N+1].1.[name].md
        │       └── story.[N+1].2.[name].md
        │
        └── epic.[N+2].[name-with-intermediate]/ # Epic with intermediate version
            ├── epic.[N+2].[name].md
            ├── epic.[N+2].5.[name].md        # Intermediate epic (optional)
            ├── EPIC-[N+2].5-ROADMAP.md       # Intermediate epic roadmap
            └── stories/
                ├── story.[N+2].1.[name].md
                ├── story.[N+2].5.1.[name].md # Story for intermediate epic
                └── story.[N+2].2.[name].md
```

### Domain Categories

```
docs/prd/
├── domain-name/              # Platform infrastructure
│   ├── authentication/
│   ├── module-name/
│   └── testing-infrastructure/
│
├── financial-features/         # Financial functionality
│   ├── module-management/
│   ├── payments/
│   ├── compliance/
│   └── transactions/
│
├── ui-domain/           # UI/UX features
│   ├── example-component/
│   ├── chat-input-form/
│   ├── notifications/
│   └── navigation/
│
└── experimental/              # R&D and POCs
    └── [feature]/
```

---

## Document Hierarchy

### Level 1: Core PRD (Feature Foundation)

**Purpose**: Define WHAT we're building and WHY

**Required Documents**:

1. **executive-summary.md** (2-3 pages)
   - High-level overview
   - Business justification
   - Key features
   - Success metrics

2. **goals-and-objectives.md** (2-4 pages)
   - Primary goals
   - Secondary goals
   - Success criteria
   - Measurement methods

3. **product-requirements.md** (5-10 pages)
   - Functional requirements (FR1, FR2, etc.)
   - Non-functional requirements (NFR1, NFR2, etc.)
   - User stories
   - Acceptance criteria

4. **technical-implementation.md** (5-15 pages)
   - Architecture overview
   - Component structure
   - State management
   - API integration
   - Database changes
   - Security considerations

### Level 2: Specialized Specs (Feature Details)

**Purpose**: Provide detailed specifications for specific aspects

**Optional Documents** (create as needed):

- **uiux-design-specifications.md** - Design system, interactions, accessibility
- **[feature]-specification.md** - Detailed feature behavior (e.g., animation specs)
- **api-specification.md** - API contracts, endpoints, schemas
- **security-requirements.md** - Security considerations, compliance
- **compliance-requirements.md** - Regulatory requirements

### Level 3: Planning & Status (Progress Tracking)

**Purpose**: Track implementation progress and provide navigation

**Recommended Documents**:

1. **IMPLEMENTATION-STATUS.md**
   - Current progress (X% complete)
   - Epic completion tracker
   - Critical blockers
   - Next actions
   - Recent progress

2. **CROSS-REFERENCE-GUIDE.md**
   - Role-based navigation
   - Documentation map
   - Quick reference table

3. **DEVELOPER-QUICK-START.md**
   - 15-minute developer onboarding
   - Complete code examples
   - Common patterns
   - Testing requirements

4. **implementation-phases.md**
   - High-level epic roadmap
   - Critical path visualization
   - Dependencies and sequencing

### Level 4: Epic Documentation (Implementation Groupings)

**Purpose**: Break down feature into manageable work chunks

**Epic Structure** (nested subdirectories in `epics/`):

Each epic has its own subdirectory containing:

1. **epic.[N].[name]/** - Epic subdirectory
   - **epic.[N].[name].md** - Epic file with YAML frontmatter
   - **EPIC-[N]-ROADMAP.md** - Week-by-week execution plan (optional for complex epics)
   - **epic.[N].5.[name].md** - Intermediate epic (optional, if needed)
   - **stories/** - Subdirectory for all stories in this epic

2. **index.md** - Epic roadmap and overview (at `epics/` level)
3. **EPIC-CREATION-SUMMARY.md** - Epic overview (at `epics/` level)

**Epic File YAML Structure**:

```yaml
---
epic_number: N
title: "[Epic Name]"
type: epic
description: "[One-sentence summary of what this epic delivers]"
tags: []
domain: "[Domain]"
status: "📋 Planned"
priority: "Critical | High | Medium | Low"
estimated_stories: N
created: YYYY-MM-DD
target_completion: YYYY-MM-DD
prd_source: "{{PRD_SOURCE_PATH}}" # repo-relative PRD path, or "brownfield-enhancement"
---
```

Authoritative copy: `references/epic-template.md` (byte-identical to `docs/templates/epic-template.md`).
`type` is OKF's one hard requirement; `status` follows the canonical lifecycle in
`shared/resources/document-status-lifecycle.md`.

**File Locations**:

```
docs/prd/{domain}/{feature}/epics/
├── epic.[N].[name]/
│   ├── epic.[N].[name].md       ← Epic file here
│   ├── EPIC-[N]-ROADMAP.md      ← Roadmap here (optional)
│   └── stories/                 ← Stories here
│       └── story.[N].1.[name].md
```

### Level 5: Story Documentation (Detailed Tasks)

**Purpose**: Provide implementation details for individual work items

**Story Files** (in `epic.[N].[name]/stories/` subdirectory):

1. **story.[epic].[n].[name].md** - Individual stories
2. **story.[epic].[n].[name].completion.md** - Completion documentation
3. **story.[epic].[n].[name].[type].md** - Technical addendums (e.g., .worklet-fix.md, .cleanup.md)
4. **EPIC-[N]-STORIES-INDEX.md** - Index for large epics (optional, UPPERCASE)

**File Locations**:

```
docs/prd/{domain}/{feature}/epics/epic.[N].[name]/stories/
├── story.[N].1.[name].md
├── story.[N].1.[name].completion.md
├── story.[N].2.[name].md
├── story.[N].2.[name].worklet-fix.md
└── EPIC-[N]-STORIES-INDEX.md (optional)
```

**Coordination Files**:

- **epic.[n].coordination.md** - Can be placed in epic subdirectory if needed for coordination

---

## File Naming Conventions

### PRD Documents

**Format**: `[descriptive-name].md`

**Examples**:

- `executive-summary.md`
- `product-requirements.md`
- `morphing-animation-specification.md`
- `api-specification.md`

**Rules**:

- Use kebab-case
- Be descriptive but concise
- Avoid abbreviations unless widely understood

### Epic Files

**Format**: `epic.[number].[descriptive-name].md`

**CRITICAL - Global Epic Numbering**:

- Epic numbers are **globally unique** across the entire your project
- Numbers are assigned system-wide, NOT per-feature
- Check `/docs/development/epic-registry.md` for next available number
- Update registry when creating new epics
- See [Epic Registry standard](../../../docs/standards/epic-registry.md)

**Numbering Rules**:

- Whole numbers for major epics: `epic.163.`, `epic.164.`, `epic.165.`
- Decimal numbers for intermediate epics: `epic.163.5.`, `epic.164.5.`
- Starting from epic 163, all numbers are globally unique
- Legacy epics (1-162) contain duplicates from feature-scoped numbering (technical debt)

**Examples**:

- `epic.163.core-foundation.md` (first new epic using registry)
- `epic.163.5.settings-integration.md` (intermediate epic)
- `epic.164.auto-compact-system.md` (next sequential epic)

### Epic Roadmaps

**Format**: `EPIC-[N]-ROADMAP.md`

**Examples**:

- `EPIC-1.5-ROADMAP.md`
- `EPIC-3-ROADMAP.md`

### Story Files

**Format**: `story.[epic].[story].[descriptive-name].md`

**Epic Numbering Patterns**:

- `story.1.1.1` - Epic 1, Sub-epic 1, Story 1
- `story.1.5.1` - Epic 1.5, Story 1
- `story.2.1` - Epic 2, Story 1
- `story.2.1.1` - Epic 2, Sub-epic 1, Story 1

**Examples**:

- `story.1.1.1.core-architecture.md`
- `story.1.5.1.settings-screen.md`
- `story.2.1.visibility-mode-config.md`

### Completion and Addendum Files

**Format**: `[story-filename].[type].md`

**Completion Files**: Documents story implementation results

- Format: `story.[epic].[story].[name].completion.md`
- Example: `story.1.1.1.core-architecture.completion.md`

**Technical Addendums**: Supplementary technical documentation

- Format: `story.[epic].[story].[name].[type].md`
- Examples:
  - `story.2.2.reverse-morphing.worklet-fix.md`
  - `story.2.2.reverse-morphing.cleanup.md`

### Special Files (UPPERCASE)

**Status Files**: `IMPLEMENTATION-STATUS.md`
**Guide Files**: `CROSS-REFERENCE-GUIDE.md`
**Quick Start**: `DEVELOPER-QUICK-START.md`
**Phases**: `implementation-phases.md`
**Indexes**: `EPIC-[N]-STORIES-INDEX.md`
**Meta Documentation**: `CONSISTENCY-CHECK-SUMMARY.md`, `DOCUMENTATION-STANDARDS-UPDATE.md`

---

## When to Create Each Document

### Phase 1: Requirements Gathering (Week 0)

**Create**:

- [ ] `executive-summary.md` - Start here, get alignment
- [ ] `goals-and-objectives.md` - Define success
- [ ] `product-requirements.md` - Detail requirements

**Why**: Establish WHAT and WHY before HOW

### Phase 2: Technical Planning (Week 0-1)

**Create**:

- [ ] `technical-implementation.md` - Architecture and design
- [ ] `uiux-design-specifications.md` - UI/UX details (if UI-heavy)
- [ ] `[feature]-specification.md` - Specialized specs as needed

**Why**: Define HOW to build it

### Phase 3: Implementation Planning (Week 1)

**Create**:

- [ ] `epics/index.md` - Epic roadmap
- [ ] `epics/epic.1.[name].md` - First epic
- [ ] `epics/epic.2.[name].md` - Subsequent epics
- [ ] `implementation-phases.md` - Overall timeline

**Why**: Break work into manageable chunks

### Phase 4: Story Creation (Week 1-2)

**Create**:

- [ ] `epics/epic.[N].[name]/stories/story.[epic].1.[name].md` - Individual stories
- [ ] `epics/epic.[N].[name]/stories/story.[epic].2.[name].md` - More stories
- [ ] `epics/epic.[N].[name]/stories/EPIC-[N]-STORIES-INDEX.md` - Index if >10 stories (optional)

**Why**: Provide implementation details

### Phase 5: Developer Onboarding (Week 2)

**Create**:

- [ ] `DEVELOPER-QUICK-START.md` - Developer guide
- [ ] `CROSS-REFERENCE-GUIDE.md` - Navigation help
- [ ] `IMPLEMENTATION-STATUS.md` - Progress tracking

**Why**: Enable efficient development

### Phase 6: Complex Epic Planning (As Needed)

**Create**:

- [ ] `epics/EPIC-[N]-ROADMAP.md` - Week-by-week plan for complex epics

**Why**: Provide detailed execution guidance for critical epics

---

## Document Relationships

### Information Flow

```
Executive Summary
    ↓
Goals & Objectives
    ↓
Product Requirements
    ↓
Technical Implementation + UI/UX Specs
    ↓
Implementation Phases
    ↓
Epic Breakdown (epics/epic.[N].[name]/epic.[N].[name].md)
    ↓
Story Details (epics/epic.[N].[name]/stories/story.[N].1.[name].md)
    ↓
Developer Quick Start (code examples)
```

### Cross-References

**From PRD to Epic**:

```markdown
See [Epic 164: Core Foundation](./epics/epic.164.core-foundation/epic.164.core-foundation.md)
```

**From Epic to Story** (epic file linking to its stories):

```markdown
See [[Story 164.1] Core Architecture](./stories/story.164.1.core-architecture.md)
```

**From Story to PRD**:

```markdown
**Source PRD**: [Product Requirements](../../../product-requirements.md#fr1-button-customization)
```

**From Story to Epic** (story linking to its parent epic):

```markdown
**Epic**: [Epic 164: Core Foundation](../epic.164.core-foundation.md)
```

### Bidirectional Links

Always provide navigation in both directions:

**Epic → Stories** (from epic file):

```markdown
### [Story 164.1] [Story Name]

[Story details...]

See full story: [Story 164-1](./stories/story.164.1.[name].md)
```

**Story → Epic** (from story file):

```markdown
**Epic**: [Epic 164: Core Foundation](../epic.164.core-foundation.md)
```

---

## Best Practices

### Organization Principles

1. **Co-location**: Stories MUST be co-located with their epics
   - ✅ Correct: `docs/prd/[domain]/[feature]/epics/epic.[N].[name]/stories/`
   - ❌ Wrong: `docs/prd/[domain]/[feature]/stories/` (old flat structure)
   - ❌ Wrong: `docs/stories/[domain]/[feature]/` (completely separated)

2. **Single Source of Truth**: Each piece of information should exist in one place
   - PRD defines requirements
   - Epic breaks down work
   - Story provides implementation details

3. **Progressive Detail**: Information gets more detailed as you go deeper
   - Executive Summary: High-level (2-3 pages)
   - Epic: Medium detail (5-10 pages)
   - Story: Full detail (3-5 pages)

### Naming Principles

1. **Consistency**: Use the same naming patterns across all features
2. **Clarity**: Names should be self-documenting
3. **Brevity**: Keep names concise but meaningful

### Content Principles

1. **DRY (Don't Repeat Yourself)**: Link instead of duplicate
2. **Living Documents**: Update documents as requirements change
3. **Version Control**: Use git to track changes
4. **Status Updates**: Keep status indicators current

### Navigation Principles

1. **Multiple Entry Points**: Support different user roles
   - Product Managers → Executive Summary
   - Developers → Developer Quick Start
   - QA → Story Files

2. **Cross-References**: Link related documents bidirectionally

3. **Quick Reference**: Provide tables and maps for fast navigation

### Maintenance Principles

1. **Update Status Regularly**: Keep completion percentages current
2. **Document Completion**: Create completion docs for finished work
3. **Track Changes**: Update "Last Updated" dates
4. **Archive When Done**: Preserve completed documentation as reference

---

## Quick Decision Tree

### "Should I create a new document?"

```
Do I have a new feature to document?
    ├─ Yes → Start with Executive Summary
    └─ No → Update existing documents

Is this a specialized aspect (animation, API, security)?
    ├─ Yes → Create [aspect]-specification.md
    └─ No → Add to existing technical-implementation.md

Is this a new epic?
    ├─ Yes → Create epics/epic-[n]-[name].md
    └─ No → Update existing epic

Is this epic particularly complex (>2 weeks, >5 stories)?
    ├─ Yes → Create EPIC-[N]-ROADMAP.md
    └─ No → Epic document is sufficient

Is this a new story?
    ├─ Yes → Create epics/epic.[N].[name]/stories/story.[epic].[story].[name].md
    └─ No → Update existing story

Do developers need quick onboarding?
    ├─ Yes → Create DEVELOPER-QUICK-START.md
    └─ No → Wait until implementation starts

Do we need progress tracking?
    ├─ Yes → Create/Update IMPLEMENTATION-STATUS.md
    └─ No → Wait until development begins
```

---

## Templates Quick Reference

| Document Type            | Template                            | When to Use                            |
| ------------------------ | ----------------------------------- | -------------------------------------- |
| Executive Summary        | `prd-epic-story-reference.md`       | Starting new feature                   |
| Goals & Objectives       | `prd-epic-story-reference.md`       | Defining success criteria              |
| Product Requirements     | `prd-epic-story-reference.md`       | Detailing requirements                 |
| Technical Implementation | `prd-epic-story-reference.md`       | Architecture planning                  |
| Epic                     | `epic-template.md`                  | Breaking down feature into work chunks |
| Epic Roadmap             | `epic-roadmap-template.md`          | Complex epic execution plan            |
| Story                    | `story-template.md`                 | Individual task details                |
| Implementation Status    | `implementation-status-template.md` | Progress tracking                      |
| Cross-Reference Guide    | `cross-reference-guide-template.md` | Navigation help                        |
| Developer Quick Start    | `developer-quick-start-template.md` | Developer onboarding                   |
| Implementation Phases    | `implementation-phases-template.md` | High-level roadmap                     |

---

## Example: Bottom Action Bar Structure

**Real-world reference from this project**:

```
docs/prd/ui-domain/example-component/
├── Core PRD
│   ├── executive-summary.md                    # 3 pages
│   ├── goals-and-objectives.md                 # 4 pages
│   ├── product-requirements.md                 # 8 pages
│   └── technical-implementation.md             # 12 pages
│
├── Specialized Specs
│   ├── uiux-design-specifications.md
│   └── morphing-animation-specification.md
│
├── Status & Planning
│   ├── IMPLEMENTATION-STATUS.md
│   ├── CROSS-REFERENCE-GUIDE.md
│   ├── DEVELOPER-QUICK-START.md
│   └── implementation-phases.md
│
├── Epics (5 epics)
│   └── epics/
│       ├── index.md
│       ├── epic.1.core-foundation.md           # 80% complete
│       ├── epic.1.5.settings-integration.md    # Critical blocker
│       ├── EPIC-1.5-ROADMAP.md                 # Week-by-week plan
│       ├── epic.2.auto-compact-system.md
│       ├── epic.3.advanced-features.md
│       ├── epic.4.accessibility-polish.md
│       └── EPIC-CREATION-SUMMARY.md
│
└── Stories (20+ stories)
    └── stories/
        ├── story.1.1.1.core-architecture.md
        ├── story.1.1.2.button-selection.md
        ├── 1.5-1.story.settings-screen.md
        ├── 1.5-2.story.async-storage.md
        ├── 2-1.story.visibility-mode.md
        ├── EPIC-2-STORIES-INDEX.md
        ├── STORY-1-1-COMPLETION.md
        ├── epic.1.coordination.md
        └── CONSISTENCY-CHECK-SUMMARY.md
```

**Key Insights**:

- 15+ PRD documents
- 5 epics with clear progression
- 20+ stories with detailed implementation
- Multiple specialized documents for complex features
- Comprehensive navigation and status tracking

---

## Checklist for New Feature Documentation

### Requirements Phase

- [ ] Create feature directory: `docs/prd/[domain]/[feature]/`
- [ ] Write executive-summary.md
- [ ] Write goals-and-objectives.md
- [ ] Write product-requirements.md
- [ ] Write technical-implementation.md
- [ ] Add specialized specs as needed
- [ ] Review and approve PRDs

### Planning Phase

- [ ] Create `epics/` subdirectory
- [ ] Write epics/index.md
- [ ] Write epic.1.[name].md
- [ ] Write additional epics
- [ ] Create implementation-phases.md
- [ ] Define epic dependencies

### Story Phase

- [ ] Create `stories/` subdirectory
- [ ] Write stories for Epic 1
- [ ] Write stories for Epic 2+
- [ ] Create EPIC-[N]-STORIES-INDEX.md for large epics
- [ ] Create EPIC-[N]-ROADMAP.md for complex epics

### Development Phase

- [ ] Create DEVELOPER-QUICK-START.md
- [ ] Create CROSS-REFERENCE-GUIDE.md
- [ ] Create IMPLEMENTATION-STATUS.md
- [ ] Update status as work progresses

### Maintenance Phase

- [ ] Update story statuses
- [ ] Create story.[epic].[story].[name].completion.md
- [ ] Update epic completion percentages
- [ ] Run consistency checks
- [ ] Archive completed documentation

---

**Last Updated**: YYYY-MM-DD
