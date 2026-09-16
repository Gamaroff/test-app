---
name: edit-story
description: Edit story documents with comprehensive validation and diff preview. Use when modifying story files. Rejects epic files with appropriate message.
---

# Edit Story

Edit story documents with comprehensive validation and diff preview before applying changes. This skill ensures story modifications follow documentation standards and maintain file integrity.

## When to Use This Skill

Use this skill when you need to:

- **Modify story statements or acceptance criteria**
- **Update story status, priority, tasks, or dependencies**
- **Add/remove implementation details or dev notes**
- **Perform full section rewrites with validation**

Natural language triggers:

- "Edit story 323.2 to add new acceptance criterion"
- "Update story.178.8.example-feature.md to change status"
- "Modify story 163.1 to update tasks"

**Slash Command Usage:**

```bash
# Using story directory (auto-discovers story file)
/edit-story ${PRD_ROOT}/.../stories/story.323.2.emergency-recovery-unlock/

# Using specific story file
/edit-story ${PRD_ROOT}/.../stories/story.323.2.emergency-recovery-unlock/story.323.2.emergency-recovery-unlock.md

# Natural language
"Edit story 323.2 to update priority"
"Use @edit-story for story.178.8.example-feature.md"
```

**Related Skills**:

- `create-story` - Create new story documents
- `edit-epic` - Edit epic documents (use this for epic files)
- `develop` - Implement stories
- `qa-story` - Review story implementations
- `review-story --validate` - Pre-implementation validation (automated, non-interactive)

---

## Input Handling

**Flexible Invocation:**

You can invoke this skill with either:

- **A specific story file**: `story.323.2.emergency-recovery-unlock.md`
- **A story directory**: `stories/story.323.2.emergency-recovery-unlock/`

**File Discovery Logic:**

When given a directory path:

1. List all files in the directory
2. Find the story file by pattern: `story.[epic].[story].[name].md`
3. Exclude files containing: `.qa.`, `.gate.`, or `.bug.`
4. If multiple story files found, use the one matching the directory name
5. If no story file found, HALT and ask user for the correct path

**File Type Validation (CRITICAL):**

When given a file path:

1. Check if filename matches epic pattern: `^epic\.\d+`
2. If it's an epic file, **IMMEDIATELY HALT** with message:
   > "Error: This is an epic file, not a story file.
   >
   > File: {filename}
   > Pattern detected: epic.[number].[name].md
   >
   > To edit epic files, use the `edit-epic` skill instead:
   > `/edit-epic {filepath}`"
3. Verify filename matches story pattern: `story.[epic].[story].[name].md`
4. If pattern doesn't match, warn user and ask for confirmation

**Example:**

```
Input: ${PRD_ROOT}/.../stories/story.323.2.emergency-recovery-unlock/
Discovers: story.323.2.emergency-recovery-unlock.md
Rejects: epic.323.pin-advanced-security.md (if provided)
```

---

## Edit Story Workflow

### Prerequisites

- User has provided story file or directory path
- User has described the desired changes

### Execution Steps

#### Step 1: Input Resolution and File Discovery

**Actions:**

1. **If directory path provided**:
   - List files in directory using Bash tool
   - Apply discovery logic (see Input Handling section)
   - Announce discovered story file to user

2. **If file path provided**:
   - Extract filename from path
   - Apply file type validation (CRITICAL - see Input Handling)
   - If epic file detected → HALT with error message
   - If story pattern matches → proceed

3. **Confirm with user** *(only when ambiguous)*:
   - **Skip confirmation** if the user provided an exact file path — proceed directly to Step 2.
   - **Ask for confirmation** only when the file was auto-discovered from a directory and there was ambiguity (e.g. multiple candidates found, or the match was uncertain):
     > "Found story file: {filepath}
     > Epic: {epic}
     > Story: {story}
     > Name: {name}
     > Ready to proceed with editing?"

---

#### Step 2: Load and Parse Story File

**Actions:**

1. Read story file using Read tool
2. Extract and parse YAML frontmatter (if present)
3. Identify document sections
4. Store original content for diff generation

**Common Sections to Identify:**

- Story Statement (As a... I want... So that...)
- Acceptance Criteria (AC1, AC2, etc.)
- Tasks/Subtasks
- Dev Notes/Context
- Validation & Testing Instructions
- File List
- Change Log
- Status

---

#### Step 3: Pre-Edit Validation

**Validate the following before allowing edits:**

**A. File Naming Convention & Location**

- Filename follows pattern: `story.[epic].[story].[name].md`
- File must be placed inside a subdirectory with the exact same name: `story.[epic].[story].[name]/story.[epic].[story].[name].md`
- Uses DOTS for number separators (not underscores)
- Uses hyphens for word separation in descriptive name (not underscores)
- Example valid: `story.163.1.seed-phrase-validator/story.163.1.seed-phrase-validator.md`
- Example invalid: `story_163_1_seed_phrase_validator.md`

**B. YAML Frontmatter (if present)**

- Frontmatter is valid YAML
- Status values are valid: `not-started`, `in-progress`, `ready-for-qa`, `qa-in-progress`, `completed`, `blocked`
- Required fields present (if using frontmatter): epic, story, title

**C. Required Sections**

- Story Statement exists (or equivalent user story format)
- At least one Acceptance Criterion exists
- Status indicator present somewhere in document

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

#### Step 4: Generate and Present Diff Preview

**Classify edit risk before deciding whether to require approval:**

| Edit type | Risk | Action |
|---|---|---|
| Checkbox/task toggle (`[ ]` → `[x]`) | Low | Apply directly → show post-apply summary |
| Single-field update (status, priority, assignee) | Low | Apply directly → show post-apply summary |
| Appending content to an existing section | Low | Apply directly → show post-apply summary |
| Adding a new AC, section, or block of content | Medium | Show diff → require approval |
| Removing existing content | High | Show diff → require approval |
| Multi-section rewrite or structural change | High | Show diff → require approval |

**For low-risk edits** — skip to Step 5 directly (no diff, no approval gate). After applying, show a concise confirmation summary.

**For medium/high-risk edits:**

1. **Apply proposed changes to in-memory copy** (do NOT modify actual file yet)

2. **Generate unified diff** showing:
   - Lines being removed (prefixed with `-`)
   - Lines being added (prefixed with `+`)
   - Context lines around changes

3. **Present diff to user**:

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

4. **Request user approval**:
   > "Please review the diff above.
   >
   > Would you like to:
   >
   > 1. Apply these changes
   > 2. Revise the changes
   > 3. Cancel edit operation"

**CRITICAL:** For medium/high-risk edits, do NOT proceed to Step 5 without explicit user approval.

---

#### Step 5: Apply Changes

**Only execute after user approval.**

**Actions:**

1. **Apply edits** using Edit tool with exact old_string → new_string replacements
   - If editing multiple sections, apply changes in order
   - Use precise string matching from original file

2. **Append a Change Log row** (mandatory) describing the change, and bump frontmatter `updated` in the same edit. Canonical format: [document-change-log.md](references/document-change-log.md). A scope or AC edit bumps the minor version; `Author` is the skill name:

   | 2026-08-12 | 1.2 | AC3 added — offline retry on 5xx | edit-story |

   **Describe the substance, not the act.** `AC3 added — offline retry on 5xx`, never `Story edited`. A log of "edited" rows is not a history — it is a record that something happened, which the git log already gives you for free. The row exists to answer *what changed about this requirement*.

   Skip only when `change-log.enabled: false` in `skills-config.yaml`.

3. **Post-edit validation**:
   - Read modified file
   - Verify YAML frontmatter is still valid (if present)
   - Verify all required sections still present
   - Verify file is syntactically correct markdown

4. **Confirm success to user**:
   > "Story file successfully updated!
   >
   > File: {filepath}
   > Changes applied: {summary}
   > Change Log row added: {the row}
   >
   > Next steps:
   >
   > - If status changed, ensure File List is updated
   > - If acceptance criteria changed, consider impact on tests"

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

- **Rejects epic files** immediately with helpful error message
- Validates story filename pattern before proceeding
- Prevents accidental edits to wrong file types

### 2. Comprehensive Validation

- **Pre-edit validation**: Filename conventions, YAML frontmatter (if present), required sections
- **Post-edit validation**: File integrity, markdown syntax, frontmatter validity

### 3. Risk-Gated Diff Preview

- **Low-risk edits** (checkbox toggle, single-field update, section append) are applied directly — no diff gate
- **Medium/high-risk edits** (new sections, removals, multi-section rewrites) show diff and require explicit approval
- Prevents accidental destructive edits without adding unnecessary roundtrips for routine changes

### 4. Multi-Operation Support

- Add/remove acceptance criteria
- Update tasks and subtasks
- Modify story statements
- Change status, priority, dependencies
- Update dev notes and context
- Rewrite entire sections

---

## Validation Standards

### File Naming Validation

**Valid Patterns:**

- `story.163.1.seed-phrase-validator/story.163.1.seed-phrase-validator.md` ✓
- `story.323.2.emergency-recovery-unlock/story.323.2.emergency-recovery-unlock.md` ✓
- `story.178.8.example-feature/story.178.8.example-feature.md` ✓

**Invalid Patterns:**

- `story_163_1_seed_phrase_validator.md` ✗ (underscores instead of dots)
- `story.163_1.seed-phrase-validator.md` ✗ (mixed separators)
- `story-163.1.seed-phrase-validator.md` ✗ (hyphen for number separator)
- `story.163.1.seed-phrase-validator.md` ✗ (must be inside a self-named subdirectory)

**Rule from Documentation:**

> Use DOTS for numbers: `story.163.1.name.md` not `story_163_1_name.md`
> Use hyphens for word separation in descriptive names: `seed-phrase-validator` not `seed_phrase_validator`
> Each story MUST be placed in its own self-named subdirectory within the epic's `stories` folder.

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

### YAML Frontmatter (Optional but Recommended)

**Common Fields:**

- `epic:` - Epic number (integer)
- `story:` - Story number (integer)
- `title:` - Story title
- `status:` - Current status (must be valid status value)
- `priority:` - Priority level (low/medium/high)
- `assignee:` - Developer assigned
- `dependencies:` - Array of dependency story IDs

---

## Error Handling and Halt Conditions

### Immediate Halt Conditions

1. **Epic file detected** (not story file)
   - Error message provided with guidance to use `edit-epic`
   - No further processing

2. **No story file found in directory**
   - Request user to provide correct path
   - List files found for debugging

3. **User cancels at any approval point**
   - Diff preview approval
   - Pre-edit validation issues

### Warning Conditions (User Decision Required)

1. **Pre-edit validation failures**
   - Present issues, offer to fix or proceed anyway

2. **File naming doesn't match standard pattern**
   - Warn user, ask for confirmation before proceeding

3. **Missing recommended sections**
   - Warn user but allow edit to proceed

---

## Integration with Other Skills

### Works Together With:

**create-story**:

- Use `create-story` to create new story files
- Use `edit-story` to modify existing story files

**edit-epic**:

- Use `edit-story` for story files
- Use `edit-epic` for epic files
- Never mix - each skill validates file type

**develop**:

- Implements stories created/edited by this skill
- May update story files during development (authorized sections only)

**qa-story**:

- Reviews story implementations
- Creates QA reports co-located with story files
- May identify need for story edits

**fix-qa**:

- Implements fixes based on QA feedback
- May update story sections after fixes

**review-story --validate**:

- Pre-implementation validation (automated, read-only)
- Use before `develop` begins
- May identify story edits needed

---

## Common Edit Operations

### Adding Acceptance Criteria

```markdown
User: "Add new AC for rate limiting to story 323.2"

Agent:

1. Loads story.323.2.emergency-recovery-unlock.md
2. Validates file type and structure
3. Locates Acceptance Criteria section
4. Generates new AC in proper format:
   ### AC6: Rate Limiting (Stricter than PIN)
   - [ ] Maximum 2 attempts per 24 hours
   - [ ] 24-hour lockout after 2 failures
5. Shows diff preview
6. Applies after approval
```

### Updating Story Status

```markdown
User: "Change story 178.8 status to ready-for-qa"

Agent:

1. Loads story.178.8.example-feature.md
2. Validates file type
3. Locates status field (frontmatter or markdown)
4. Risk classification: single-field update → LOW RISK → apply directly
5. Applies change immediately, shows confirmation:
   "Updated: **Status**: ✅ Ready for QA"
```

### Modifying Tasks

```markdown
User: "Mark task 2.3 as complete in story 163.1"

Agent:

1. Loads story.163.1.seed-phrase-validator.md
2. Validates file type
3. Locates task 2.3 in Tasks section
4. Risk classification: checkbox toggle → LOW RISK → apply directly
5. Applies change immediately, shows confirmation:
   "Updated: - [x] Implement constant-time comparison"
```

---

## Workflow Example

```
User: /edit-story ${PRD_ROOT}/.../stories/story.323.2.emergency-recovery-unlock/

Agent:
1. Discovers: story.323.2.emergency-recovery-unlock.md
2. Validates: File type confirmed as story ✓
3. Loads story and parses structure
4. Validates: Pre-edit checks pass ✓
5. User describes changes: "Update priority to high and add security note"
6. Generates in-memory modified version
7. Presents diff preview:
   --- **Priority**: Medium
   +++ **Priority**: High
   +++
   +++ **Security Note**: This feature requires constant-time comparison
8. User approves
9. Applies changes using Edit tool
10. Validates: Post-edit checks pass ✓
11. Confirms success

Result: Story successfully updated with validation and safety checks
```

---

## Key Principles

1. **Safety First**: Always validate before and after edits
2. **User Control**: Require explicit approval for all destructive operations
3. **Clear Communication**: Provide detailed error messages and guidance
4. **File Type Enforcement**: Reject wrong file types immediately with helpful redirection
5. **Transparency**: Always show what will change via diff preview
6. **Validation Standards**: Enforce documentation standards consistently
7. **Preserve History**: Always use Edit tool, never Write tool for existing files

---

## Notes

- **Story files live in epic's `stories/` subdirectory** - Per documentation structure requirements
- **YAML frontmatter is optional** - Some stories use markdown-based metadata instead
- **Change Log entry is mandatory, not optional** - Step 5 writes the row describing what changed; see [document-change-log.md](references/document-change-log.md)
- **File List should match reality** - If changes affect implementation files
- **Status transitions matter** - Ensure status changes align with actual progress
- **Always use Edit tool, never Write** - Preserve file history and enable safe rollbacks
- **No cascade analysis needed** - Unlike `edit-epic`, stories don't have dependent documents
