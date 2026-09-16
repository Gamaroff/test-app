---
name: edit-epic
description: Edit epic documents with validation, cascade analysis for child stories, and diff preview. Use when modifying epic files. Rejects story files with appropriate message.
---

# Edit Epic

Edit epic documents with comprehensive validation, cascade analysis for child stories, and diff preview before applying changes. This skill ensures epic modifications are safe and don't create conflicts with existing story implementations.

## When to Use This Skill

Use this skill when you need to:

- **Modify epic goals, descriptions, or requirements**
- **Update epic status, priority, or dependencies**
- **Add/remove/update success criteria or story breakdowns**
- **Perform full section rewrites with validation**

Natural language triggers:

- "Edit epic 178 to change priority to high"
- "Update epic.246.feature-and-interface.md to add new story"
- "Modify epic 163 success criteria"

**Slash Command Usage:**

```bash
# Using epic directory (auto-discovers epic file)
/edit-epic ${PRD_ROOT}/domain-name/module-name/example-area/epics/epic.178.feature-ui/

# Using specific epic file
/edit-epic ${PRD_ROOT}/domain-name/module-name/example-area/epics/epic.178.feature-ui/epic.178.feature-ui.md

# Natural language
"Edit epic 178 to update dependencies"
"Use @edit-epic for epic.246.feature-and-interface.md"
```

**Related Skills**:

- `create-epic` - Create new epic documents
- `create-epics-from-shards` - Generate epics from PRD sections
- `edit-story` - Edit story documents (use this for story files)
- `epic-registry-manager` - Manage global epic numbering

---

## Input Handling

**Flexible Invocation:**

You can invoke this skill with either:

- **A specific epic file**: `epic.178.feature-ui.md`
- **An epic directory**: `epics/epic.178.feature-ui/`

**File Discovery Logic:**

When given a directory path:

1. List all files in the directory
2. Find the epic file by pattern: `epic.[number].[name].md`
3. Exclude files containing: `.qa.`, `.gate.`, or `.bug.`
4. If no epic file found, HALT and ask user for the correct path
5. If multiple epic files found, use the one matching the directory name

**File Type Validation (CRITICAL):**

When given a file path:

1. Check if filename matches story pattern: `story.\d+\.\d+`
2. If it's a story file, **IMMEDIATELY HALT** with message:
   > "Error: This is a story file, not an epic file.
   >
   > File: {filename}
   > Pattern detected: story.[epic].[story].[name].md
   >
   > To edit story files, use the `edit-story` skill instead:
   > `/edit-story {filepath}`"
3. Verify filename matches epic pattern: `epic.[number].[name].md`
4. If pattern doesn't match, warn user and ask for confirmation

**Example:**

```
Input: ${PRD_ROOT}/.../epics/epic.178.feature-ui/
Discovers: epic.178.feature-ui.md
Rejects: story.178.1.search-by-handle.md (if provided)
```

---

## Edit Epic Workflow

### Prerequisites

- User has provided epic file or directory path
- User has described the desired changes

### Execution Steps

#### Step 1: Input Resolution and File Discovery

**Actions:**

1. **If directory path provided**:
   - List files in directory using Bash tool
   - Apply discovery logic (see Input Handling section)
   - Announce discovered epic file to user

2. **If file path provided**:
   - Extract filename from path
   - Apply file type validation (CRITICAL - see Input Handling)
   - If story file detected → HALT with error message
   - If epic pattern matches → proceed

3. **Confirm with user**:
   > "Found epic file: {filepath}
   > Epic Number: {number}
   > Epic Name: {name}
   > Ready to proceed with editing?"

---

#### Step 2: Load and Parse Epic File

**Actions:**

1. Read epic file using Read tool
2. Extract and parse YAML frontmatter
3. Identify document sections
4. Store original content for diff generation

**Required Sections to Identify:**

- Epic Goal
- Background & Context
- Epic Description
- Success Criteria
- Stories Breakdown
- Dependencies
- Priority/Status

---

#### Step 2b: Change Impact Classification

**Purpose:** Classify the proposed changes before running validation and cascade analysis, so downstream steps can skip unnecessary work.

After the user describes their desired changes, classify each change into one of these categories:

| Category              | Fields / Sections                                                                                               | Cascade Analysis                                                  | Diff Approval Gate               |
| --------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------- |
| **Metadata-only**     | `title`, `epic_type`, `estimated_sprints`, `prd_source`, `legacy_epic_number`, goal/description/background text | **Skip entirely**                                                 | Auto-apply (inline confirmation) |
| **Status change**     | `status` field                                                                                                  | Lightweight: check child story completion only (if → `completed`) | Auto-apply (inline confirmation) |
| **Priority change**   | `priority` field                                                                                                | Lightweight: check story priority alignment only                  | Auto-apply (inline confirmation) |
| **Dependency change** | `dependencies` array                                                                                            | Targeted: check if stories reference old deps                     | Full blocking gate               |
| **Structural change** | Stories Breakdown section, story numbers, success criteria                                                      | **Full cascade analysis**                                         | Full blocking gate               |

**Rule:** If a single edit spans multiple categories, use the **highest-risk category** in the table.

Store the classification result — it governs Step 4 and Step 5 behaviour.

---

#### Step 3: Pre-Edit Validation

**Validate the following before allowing edits:**

**A. YAML Frontmatter Structure**

- Frontmatter exists and is valid YAML
- Contains required fields (title, epic_type, priority, etc.)
- Status values are valid: `not-started`, `in-progress`, `ready-for-qa`, `qa-in-progress`, `completed`, `blocked`

**B. File Naming Convention**

- Filename follows pattern: `epic.[number].[name].md`
- Uses DOTS for number separator (not underscores)
- Uses hyphens for word separation in descriptive name (not underscores)
- Example valid: `epic.163.module-security.md`
- Example invalid: `epic_163_account_security.md`

**C. Required Sections Presence**

- Epic Goal section exists
- Stories Breakdown section exists
- At least one story is defined

**Validation Failures:**

If validation fails, present findings to user:

> "Pre-edit validation found issues:
>
> {list of issues}
>
> Would you like to:
>
> 1. Fix these issues first (recommended)
> 2. Proceed with edit anyway (may cause problems)
> 3. Cancel edit operation"

---

#### Step 4: Cascade Analysis for Child Stories

**Purpose:** Detect if epic changes will conflict with existing story implementations.

**Scope is determined by the classification from Step 2b:**

- **Metadata-only** → **SKIP this step entirely.** Log: `Cascade analysis skipped: metadata-only change.`
- **Status change** → Run **lightweight check** (sub-step A only — child story completion)
- **Priority change** → Run **lightweight check** (sub-step B only — story priority alignment)
- **Dependency change** → Run **targeted check** (sub-step C only — story dep references)
- **Structural change** → Run **full analysis** (all sub-steps)

**Actions:**

1. **Discover child stories** (all analysis modes except skip):
   - Check if `stories/` subdirectory exists in epic directory
   - List all `story.[epic].[story].[name].md` files
   - Load only the story files needed for the active analysis mode

2. **Analysis sub-steps (run only the sub-steps required by classification):**

   **A. Completion check** (status change → `completed`):
   - Check if all child stories are marked `completed`
   - If not → CONFLICT

   **B. Priority alignment** (priority change):
   - Check story priorities for misalignment with new epic priority
   - Flag stories with conflicting priority values

   **C. Dependency references** (dependency change):
   - Scan story files for references to old dependency IDs
   - Will dependency changes invalidate story acceptance criteria?

   **D. Story Breakdown** (structural change only):
   - If adding/removing stories from epic:
     - Check if story files exist for stories being removed
     - If removing story that has file → CONFLICT
     - If renumbering stories → check for existing files with old numbers

   **E. Success Criteria alignment** (structural change only):
   - Check story acceptance criteria for dependencies on epic criteria
   - Flag potential misalignment

3. **Generate Cascade Conflict Report**:

   If conflicts detected:

   ```
   CASCADE ANALYSIS REPORT
   =======================

   Epic: {epic.number}.{epic.name}
   Child Stories Found: {count}

   CONFLICTS DETECTED:

   1. [CONFLICT TYPE]
      Epic Change: {description of proposed change}
      Affected Story: story.{epic}.{story}.{name}.md
      Issue: {description of conflict}
      Recommendation: {suggested resolution}

   2. [CONFLICT TYPE]
      ...

   RECOMMENDATIONS:
   - {overall recommendation}
   - Consider updating affected stories after epic edit
   - Review story acceptance criteria alignment
   ```

4. **Present Report and Request Guidance**:

   If conflicts found:

   > "Cascade analysis detected {count} potential conflicts with child stories.
   >
   > {conflict report}
   >
   > Would you like to:
   >
   > 1. Review and revise the proposed epic changes
   > 2. Proceed with epic edit (you'll need to update stories manually)
   > 3. Cancel edit operation"

   If no conflicts:

   > "Cascade analysis complete: No conflicts detected with {count} child stories."

---

#### Step 5: Generate and Present Diff Preview

**Behaviour is determined by the classification from Step 2b and cascade results:**

| Condition                                                            | Behaviour                                              |
| -------------------------------------------------------------------- | ------------------------------------------------------ |
| **Metadata-only or status/priority** AND **no cascade conflicts**    | Show inline diff, apply immediately — no blocking gate |
| **Dependency or structural change** OR **cascade conflicts flagged** | Full blocking approval gate (existing behaviour)       |

**Actions:**

1. **Apply proposed changes to in-memory copy** (do NOT modify actual file yet)

2. **Generate unified diff** showing:
   - Lines being removed (prefixed with `-`)
   - Lines being added (prefixed with `+`)
   - Context lines around changes

3a. **Low-risk path** (metadata-only / status / priority, no cascade conflicts):

Present inline:

```
CHANGE PREVIEW
==============
File: {filepath}

{unified diff output}

Change classification: {metadata-only | status | priority} — applying directly.
```

Proceed to Step 6 without waiting for user approval.

3b. **Standard path** (dependency/structural change, or cascade conflicts):

Present diff to user:

```
DIFF PREVIEW
============

File: {filepath}

--- Original
+++ Proposed

{unified diff output}

SUMMARY:
- Lines added: {count}
- Lines removed: {count}
- Sections modified: {list}
```

Request user approval:

> "Please review the diff above.
>
> Would you like to:
>
> 1.  Apply these changes
> 2.  Revise the changes
> 3.  Cancel edit operation"

**Do NOT proceed to Step 6 without explicit user approval on the standard path.**

---

#### Step 6: Apply Changes

**Only execute after user approval.**

**Actions:**

1. **Apply edits** using Edit tool with exact old_string → new_string replacements
   - If editing multiple sections, apply changes in order
   - Use precise string matching from original file

2. **Append a Change Log row** (mandatory) describing the change, and bump frontmatter `updated` in the same edit. Canonical format: [document-change-log.md](references/document-change-log.md). A scope edit bumps the minor version; `Author` is the skill name:

   | 2026-08-12 | 1.3 | Story 4.2 removed from scope — 3 child stories re-pointed | edit-epic |

   **Describe the substance, not the act.** `Story 4.2 removed from scope`, never `Epic edited`. **When the cascade analysis in Step 4 found affected child stories, name the cascade in the row** — the count of re-pointed stories is the part a reader of this epic most needs and is least able to reconstruct later.

   Skip only when `change-log.enabled: false` in `skills-config.yaml`.

3. **Post-edit validation**:
   - Read modified file
   - Verify YAML frontmatter is still valid
   - Verify all required sections still present
   - Verify file is syntactically correct markdown

4. **Confirm success to user**:
   > "Epic file successfully updated!
   >
   > File: {filepath}
   > Changes applied: {summary}
   > Change Log row added: {the row}
   >
   > Next steps:
   > {if cascade conflicts were flagged}
   >
   > - Review and update affected child stories:
   >   {list of affected story files}
   >   {endif}
   > - Consider running validation on the epic
   > - Update epic registry if epic number or name changed"

**If post-edit validation fails:**

> "ERROR: Post-edit validation failed!
>
> Issues detected: {list}
>
> The file has been modified but may be in an invalid state.
> Please review and fix manually, or restore from git history."

---

## Key Features

### 1. File Type Enforcement

- **Rejects story files** immediately with helpful error message
- Validates epic filename pattern before proceeding
- Prevents accidental edits to wrong file types

### 2. Change Impact Classification

- **Classifies every edit before running cascade analysis or diff approval**
- Five categories: metadata-only, status, priority, dependency, structural
- Determines which cascade sub-steps to run and whether approval gate is required
- Eliminates unnecessary file loading and blocking prompts for low-risk changes

### 3. Cascade Analysis (Conditional)

- **Unique to edit-epic skill**
- Scope driven by change classification — skipped entirely for metadata-only edits
- Targeted sub-steps for status/priority/dependency changes (no full story load)
- Full analysis reserved for structural changes only
- Provides actionable recommendations when conflicts are found

### 4. Comprehensive Validation

- **Pre-edit validation**: YAML frontmatter, required sections, naming conventions, status values
- **Post-edit validation**: File integrity, markdown syntax, frontmatter validity

### 5. Risk-Proportional Diff Preview

- **All changes shown before (or alongside) applying**
- Low-risk changes (metadata/status/priority, no cascade conflicts): inline preview, auto-apply
- Higher-risk changes (dependency/structural, or cascade conflicts): blocking approval gate
- Prevents accidental destructive edits without adding friction to routine updates

### 5. Multi-Operation Support

- Add/remove sections
- Update metadata (status, priority, dependencies)
- Modify success criteria
- Rewrite descriptions
- Update story breakdowns

---

## Validation Standards

### File Naming Validation

**Valid Patterns:**

- `epic.163.module-security.md` ✓
- `epic.246.feature-and-interface.md` ✓
- `epic.178.feature-ui.md` ✓

**Invalid Patterns:**

- `epic_163_account_security.md` ✗ (underscores instead of dots)
- `epic.163_module-security.md` ✗ (mixed separators)
- `epic-163.module-security.md` ✗ (hyphen for number separator)

**Rule from Documentation:**

> Use DOTS for numbers: `epic.163.name.md` not `epic_163_name.md`
> Use hyphens for word separation in descriptive names: `module-security` not `account_security`
>
> Source: `.claude/documentation.md` lines 99-100

### Status Value Validation

**Valid Status Values:**

- `not-started`
- `in-progress`
- `ready-for-qa`
- `qa-in-progress`
- `completed`
- `blocked`

**Rule from Documentation:**

> Source: `.claude/documentation.md` lines 90-96

### YAML Frontmatter Requirements

**Required Fields:**

- `title:` - Epic title
- `epic_type:` - Type classification
- `priority:` - Priority level (low/medium/high)

**Optional but Common Fields:**

- `legacy_epic_number:` - Original epic number if migrated
- `prd_source:` - Source PRD sections
- `estimated_sprints:` - Effort estimate
- `dependencies:` - Array of dependency epic IDs
- `status:` - Current status (must be valid status value)

---

## Error Handling and Halt Conditions

### Immediate Halt Conditions

1. **Story file detected** (not epic file)
   - Error message provided with guidance to use `edit-story`
   - No further processing

2. **No epic file found in directory**
   - Request user to provide correct path
   - List files found for debugging

3. **User cancels at any approval point**
   - Cascade conflict resolution
   - Diff preview approval
   - Pre-edit validation issues

### Warning Conditions (User Decision Required)

1. **Pre-edit validation failures**
   - Present issues, offer to fix or proceed anyway

2. **Cascade conflicts detected**
   - Present conflict report, offer to revise or proceed

3. **File naming doesn't match standard pattern**
   - Warn user, ask for confirmation before proceeding

---

## Integration with Other Skills

### Works Together With:

**create-epic**:

- Use `create-epic` to create new epic files
- Use `edit-epic` to modify existing epic files

**create-epics-from-shards**:

- Generates epic files from PRD shards
- Use `edit-epic` to refine generated epics

**edit-story**:

- Use `edit-epic` for epic files
- Use `edit-story` for story files
- Never mix - each skill validates file type

**epic-registry-manager**:

- If epic number changes, update registry using this skill
- `edit-epic` will remind user to update registry

**create-story**:

- Epic edits may require new stories
- Use `create-story` to generate stories matching updated epic

---

## Workflow Examples

**Low-risk path (metadata/priority change — no blocking gate):**

```
User: /edit-epic epic.178.feature-ui/ "Update priority to high"

Agent:
1. Discovers: epic.178.feature-ui.md ✓
2. Loads epic and parses structure
2b. Classifies change: priority → LOW RISK
3. Validates: Pre-edit checks pass ✓
4. Cascade analysis: Lightweight priority alignment check only
   → No misalignment found. Cascade skipped for non-structural fields.
5. Inline change preview:
   - priority: "medium"
   + priority: "high"
   [Applying directly — priority change, no cascade conflicts]
6. Applies change using Edit tool
7. Validates: Post-edit checks pass ✓
8. "Epic updated. priority: medium → high"
```

**High-risk path (structural change — full gate):**

```
User: /edit-epic epic.178.feature-ui/ "Remove story 3 and add dependency on epic-163"

Agent:
1. Discovers: epic.178.feature-ui.md ✓
2. Loads epic and parses structure
2b. Classifies change: Stories Breakdown + dependency → STRUCTURAL (highest risk)
3. Validates: Pre-edit checks pass ✓
4. Full cascade analysis:
   - Loads 9 child story files
   - Checks story 3 file exists → CONFLICT: story.178.3.*.md exists, cannot safely remove
   - Checks dep references → story.178.5 references epic-177 context
5. Presents CASCADE ANALYSIS REPORT with conflicts
6. User chooses: proceed / revise / cancel
7. [On proceed] Presents full DIFF PREVIEW with blocking approval gate
8. User approves → Applies changes
9. Validates: Post-edit checks pass ✓
10. Confirms success + lists affected stories to update manually
```

---

## Key Principles

1. **Safety First**: Always validate before and after edits
2. **Cascade Awareness**: Analyze impact on child stories before applying changes
3. **User Control**: Require explicit approval for all destructive operations
4. **Clear Communication**: Provide detailed error messages and guidance
5. **File Type Enforcement**: Reject wrong file types immediately with helpful redirection
6. **Transparency**: Always show what will change via diff preview
7. **Validation Standards**: Enforce documentation standards consistently
8. **Conflict Detection**: Flag potential issues before they become problems

---

## Notes

- **Epic numbers are globally unique** - Check `/docs/development/epic-registry.md` if changing epic number
- **Story files live in `stories/` subdirectory** - Per documentation structure requirements
- **YAML frontmatter is critical** - Many systems depend on valid frontmatter
- **Cascade analysis is unique to this skill** - Story edits don't need cascade checks
- **Always use Edit tool, never Write** - Preserve file history and enable safe rollbacks
