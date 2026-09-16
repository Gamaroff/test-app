---
name: enforce-standards
description: 'Enforce naming conventions and file structure architecture on a specific target directory. Use when the user asks to "fix filenames", "apply naming conventions", or "restructure" a folder.'
---

# Enforce Architecture and Naming Standards

**Trigger**: Users requesting to "fix filenames", "apply naming conventions", or "restructure" a folder.
**Input**: The user must specify a `TargetDirectory` (relative to project root) to enforce standards upon.

**Optional**: The user can specify `--exclude <dir1> <dir2> ...` to skip specific subdirectories.

## Usage Examples

```bash
# Enforce standards on entire components directory
/enforce-standards apps/{app-name}/components

# Enforce standards but exclude specific subdirectories
/enforce-standards apps/{app-name}/components --exclude contacts offline ui

# Exclude a single directory
/enforce-standards apps/{app-name}/app --exclude (auth)
```

**Exclude Parameter Behavior**:
- Accepts space-separated directory names (not full paths)
- Matches directory names at any depth within the target directory
- Example: `--exclude contacts` will skip `components/contacts/` and `components/features/contacts/`

## 1. Preparation

### 1.0 Parse Command Arguments

1.  **Extract TargetDirectory**: First argument after the skill name
    - Example: `/enforce-standards apps/{app-name}/components` → `apps/{app-name}/components`
2.  **Extract Excluded Directories** (if `--exclude` flag present):
    - Parse all arguments after `--exclude` until end of command
    - Example: `--exclude contacts offline ui` → `['contacts', 'offline', 'ui']`
    - Store as an array for filtering throughout the process
3.  **Validate Arguments**:
    - Ensure TargetDirectory is provided
    - Ensure excluded directories are simple names (not paths with `/`)
    - Warn if excluded directory doesn't exist in target directory

### 1.1 Load Documentation
1.  Read `docs/standards/file-naming.md` to refresh on naming rules.
    - **Key Rules**:
      - Components = `PascalCase.tsx`
      - Routes = `kebab-case.tsx`
      - Hooks = `camelCase.ts` with `use` prefix (e.g., `useAuth.ts`)
      - Utils = `kebab-case.ts`
      - Styles = `kebab-case.styles.ts` or match component name
      - Tests = Match source file + `.spec.tsx` or `.spec.ts` (co-located, NOT in `__tests__/`)
      - **Enum Values** = `UPPER_CASE` (e.g., `MessageType.TEXT = 'TEXT'`)
2.  Read `${ARCH_ROOT}/routing-and-file-structure.md` (default: `docs/architecture/routing-and-file-structure.md`) to refresh on structural rules.
    - **Key Rules**:
      - Feature-first structure: `components/features/[feature]/[Component]`
      - Generic UI components: `components/ui/[Component]`
      - Private route components: `app/<feature>/_components/_component-name.tsx`

### 1.2 Scan Target Directory
3.  List all files in the `TargetDirectory` using **Glob** tool.
    - Primary scan: `Glob` with pattern `**/*` in the target directory
    - Include subdirectories for complete analysis
4.  **Filter excluded directories** (if `--exclude` parameter provided):
    - Parse excluded directory names from the command arguments
    - Filter out any file paths containing excluded directory names
    - Example: If `--exclude contacts ui` is specified:
      - ❌ Skip: `components/contacts/ContactCard.tsx`
      - ❌ Skip: `components/ui/Button.tsx`
      - ✅ Include: `components/offline/OfflineIndicator.tsx`
    - Report excluded directories and file count to user

### 1.3 Scan for Special Patterns

Use **Glob** tool to identify files requiring special handling (applying exclusion filters to all results):

1.  **Private components** (DO NOT MOVE these from `_components/` subdirectories):
    ```
    Pattern: app/**/_components/_*.tsx
    Example: app/(drawer)/home/_components/_home-header.tsx
    ```
    - These are route-specific, private to that feature
    - File names: kebab-case with underscore prefix
    - Export names: PascalCase (e.g., `_home-header.tsx` exports `HomeHeader`)

2.  **Special route files**:
    - Layouts: `**/_layout.tsx`
    - 404 handlers: `**/+not-found.tsx`
    - Root routes: `**/index.tsx`

3.  **Test files**:
    - Valid co-located tests: `**/*.spec.tsx`, `**/*.spec.ts`
    - Violation: `**/__tests__/**` (should NOT exist)
    - Minor violation: `**/*.test.ts` (should be `.spec.ts`)

4.  **Feature folders**:
    - Components with styles: `components/**/ComponentName/ComponentName.tsx` + `ComponentName.styles.ts`
    - Components with sub-components: folders containing multiple related files

### 1.4 Scan for Enum Violations (Detection Only)

Use **Grep** tool to detect enum violations (DO NOT fix automatically):

```bash
# Find enum definitions
Grep: pattern "export enum" in TargetDirectory

# Check for enum values with lowercase letters (single quotes)
Grep: pattern "= '[^']*[a-z][^']*'" in TargetDirectory

# Check for enum values with lowercase letters (double quotes)
Grep: pattern '= "[^"]*[a-z][^"]*"' in TargetDirectory

# Check for enum values with lowercase letters (backticks)
Grep: pattern "= \`[^\`]*[a-z][^\`]*\`" in TargetDirectory
```

**Detection Coverage**:
- ✅ Single-quoted lowercase: `= 'text'`, `= 'payment_sent'`
- ✅ Double-quoted lowercase: `= "text"`, `= "payment_sent"`
- ✅ Backtick lowercase: `` = `text` ``, `` = `payment_sent` ``
- ✅ Mixed case: `= "Text"`, `= 'Payment_Sent'`
- ✅ All variations that contain ANY lowercase letters

**⚠️ IMPORTANT**: Enum fixes require database migration and should be handled separately. Only report violations in `migration_plan.md`.

## 2. Analysis & Planning

### 2.1 Analyze for Violations

Examine all files for these violations:

#### File Naming
- **Components**: Must be `PascalCase.tsx` (e.g., `ContactCard.tsx`)
  - Exception: Private components are `_kebab-case.tsx` in `_components/` subdirectories
- **Routes** (in `app/`): Must be `kebab-case.tsx` (e.g., `user-profile.tsx`)
  - Exception: Special files (`_layout.tsx`, `+not-found.tsx`, `index.tsx`)
- **Hooks**: Must be `camelCase.ts` with `use` prefix (e.g., `useAuth.ts`)
- **Utils/Services**: Must be `kebab-case.ts` (e.g., `auth-service.ts`)
- **Styles**: Must be `kebab-case.styles.ts` or match component name (e.g., `ContactCard.styles.ts`)
- **Tests**: Must match source file + `.spec.tsx` or `.spec.ts`
  - Violation: `.test.ts` extension (should be `.spec.ts`)

#### Test Location Violations
- **Critical**: Tests in `__tests__/` directories (should be co-located)
- Use **Glob** to check: `**/__tests__/**`
- Example violation:
  ```
  ❌ components/auth/__tests__/InputField.spec.tsx
  ✅ components/auth/InputField.spec.tsx
  ```

#### Component Name Mismatches
- File name must match exported component name
- Use **Grep** to check export statements in `.tsx` files:
  ```
  Pattern: "export (default )?(function|const|class)"
  ```
- Example violations:
  ```
  ❌ ContactCard.tsx exports contact_card
  ❌ contact-card.tsx exports ContactCard
  ✅ ContactCard.tsx exports ContactCard
  ```

#### Path Mapping Issues
- Prefer `@/` path aliases over relative imports
- Use **Grep** to find violations:
  ```
  Pattern: "from ['\"]\.\./"
  ```
- Example violations:
  ```
  ❌ import { ContactCard } from '../../components/contacts/ContactCard'
  ✅ import { ContactCard } from '@/components/contacts/ContactCard'
  ```

#### Private Component Misplacement
- `_Component.tsx` files outside `_components/` subdirectories
- Files in `_components/` without underscore prefix
- Example violations:
  ```
  ❌ app/(drawer)/home/_home-header.tsx (should be in _components/)
  ❌ app/(drawer)/home/_components/HomeHeader.tsx (missing underscore)
  ✅ app/(drawer)/home/_components/_home-header.tsx
  ```

#### Feature Folder Structure
- Components with styles/sub-components should be in folders:
  ```
  ✅ components/contacts/ContactCard/
      ├── ContactCard.tsx
      ├── ContactCard.styles.ts
      └── ContactAvatar.tsx
  ```

#### Enum Violations (Report Only)
- **Detection**: Enum values containing ANY lowercase letters (all quote types)
- **Detects**:
  - Single-quoted lowercase: `= 'text'`, `= 'payment_sent'`
  - Double-quoted lowercase: `= "text"`, `= "payment_sent"`
  - Backtick lowercase: `` = `text` ``, `` = `payment_sent` ``
  - Mixed case: `= "Text"`, `= 'Payment_Sent'`
- **Impact**: ~70% of codebase (50 files) has violations
- **Risk**: Database records depend on current values
- **Action**: Report in migration_plan.md with ⚠️ WARNING
- **Examples**:
  ```typescript
  ❌ enum MessageType { TEXT = 'text', PAYMENT = "payment" }
  ❌ enum Status { ACTIVE = `Active`, PENDING = "Pending" }
  ✅ enum MessageType { TEXT = 'TEXT', PAYMENT = 'PAYMENT' }
  ✅ enum Status { ACTIVE = 'ACTIVE', PENDING = 'PENDING' }
  ```

### 2.2 Create Migration Plan

Create a uniquely named migration plan file in the `.plans` directory:

**File Location**: `.plans/migration-[timestamp]-[sanitized-directory-name].md`
- **timestamp**: Current timestamp in format `YYYYMMDD-HHMMSS` (e.g., `20260127-143022`)
- **sanitized-directory-name**: Target directory with slashes replaced by dashes (e.g., `apps-{app-name}-components-offline`)
- **Example**: `.plans/migration-20260127-143022-components-offline.md`

**Steps**:
1. Create `.plans` directory if it doesn't exist: `mkdir -p .plans`
2. Generate timestamp: `date +%Y%m%d-%H%M%S`
3. Sanitize directory name: Replace `/` with `-`, remove `apps/{app-name}/` prefix if present
4. Create the migration plan file with the template below

```markdown
# Migration Plan for [TargetDirectory]

## Summary
- Target directory: [TargetDirectory]
- Excluded directories: [list if any, or "None"]
- Total files scanned: X
- Total files to rename: X
- Total files to move: Y
- Test location fixes: Z
- Path mapping updates: W
- **Enum violations detected**: N (⚠️ REQUIRES SEPARATE MIGRATION)

## Batching Strategy
Group changes by feature to reduce merge conflicts:
- Batch 1: Feature A (X files)
- Batch 2: Feature B (Y files)
- ...

## Files to Rename

| Current Path | New Path | Reason | Imports to Update |
|--------------|----------|--------|-------------------|
| ... | ... | ... | ... |

## Files to Move

| Current Path | New Path | Reason | Imports to Update |
|--------------|----------|--------|-------------------|
| ... | ... | ... | ... |

## Test Location Fixes

| Current Path | New Path | Reason |
|--------------|----------|--------|
| ... | ... | Co-locate with source |

## Path Mapping Updates

| File | Current Import | New Import |
|------|----------------|------------|
| ... | ../../components/... | @/components/... |

## Component Name Mismatches

| File | Current Export | New Export |
|------|----------------|------------|
| ... | ... | ... |

## ⚠️ Enum Violations (DETECTION ONLY - DO NOT FIX)

**WARNING**: The following enum violations require database migration and API contract updates.
These should be handled in a separate enum-migration effort.

| File | Enum Name | Violation | Database Impact |
|------|-----------|-----------|-----------------|
| ... | MessageType | lowercase values | message.type column |

**Total enum violations**: X files

**Recommendation**: Create separate ticket for enum migration with:
1. Database migration scripts
2. API contract updates
3. Comprehensive testing strategy
4. Backward compatibility plan

## Private Components (DO NOT MOVE)

The following private components are correctly located in `_components/` subdirectories:

| Path | Status |
|------|--------|
| app/(drawer)/home/_components/_home-header.tsx | ✅ Correct |
| ... | ✅ Correct |

**Note**: These are route-specific components and should NOT be moved to `components/`.

## Impact Analysis

### High-Risk Changes
- Files imported by 10+ other files
- Files in critical paths (auth, payments, etc.)

### Circular Dependencies
- [List any detected circular dependency risks]

## Verification Steps
1. TypeScript compilation: `npx nx run <app>:typecheck`
2. Lint check: `npx nx lint <app>`
3. Test check: `npx nx test <app> --only-affected`
4. Import resolution validation
```

### 2.3 Use Grep to Find Import References

For each file to be renamed/moved:
1.  Use **Grep** tool to find all import references:
    ```
    Pattern: "from ['\"].*OldFileName['\"]"
    ```
2.  Document in migration_plan.md which files need import updates

## 3. User Review

**⚠️ STOP: Ask the user to review the migration plan.**

Notify the user:
```
I have analyzed the directory and created a migration plan at:
`.plans/migration-[timestamp]-[directory].md`

Target: [TargetDirectory]
Excluded: [list excluded directories, or "None"]

Key findings:
- X files scanned (Y files excluded)
- X files need renaming
- Y files need moving
- Z test location fixes
- W path mapping updates
- N enum violations detected (⚠️ requires separate migration)

Batching strategy: [Summarize approach]

Do NOT proceed until the user says "Proceed" or "Approve".
```

## 4. Execution

### 4.1 Batching Strategy

Execute changes in batches by feature to reduce merge conflicts:
- One feature/component folder at a time
- Commit after each successful batch
- Recommended batch size: 10-20 files per commit

### 4.2 Per-File Migration Process

For each item in the approved plan:

1.  **Find All References**: Use **Grep** tool to find all files that import the old filename.
    - Search pattern: The filename without extension
    - Example: `Grep` pattern `"from.*OldName"`
    - Record all files that need import updates

2.  **Move/Rename the File**: Use **Bash** tool with `mv` command.
    - Example: `mv old-path.tsx new-path.tsx`
    - For directories: `mkdir -p parent/dir && mv file parent/dir/`

3.  **Update Import Paths in Other Files**:
    - In all files found in step 1, update import paths to new location
    - Use **Edit** tool for precise string replacements
    - Example:
      ```typescript
      // Old
      import { ContactCard } from '../contacts/contact-card'
      // New
      import { ContactCard } from '@/components/contacts/ContactCard'
      ```

4.  **Update Relative Imports Inside Moved File**:
    - If file moved into deeper folder, update its internal imports
    - Example: File moved from `components/Card.tsx` to `components/cards/Card/Card.tsx`
      - Internal import `../utils` becomes `../../utils`
    - Use **Read** to check file content, then **Edit** to update

5.  **Update Component Export Names** (if applicable):
    - If renaming implies component rename (e.g., `contact_card.tsx` → `ContactCard.tsx`)
    - Update exported component/function name to match new file name
    - Example:
      ```typescript
      // Old
      export const contact_card = () => { ... }
      // New
      export const ContactCard = () => { ... }
      ```
    - Use **Grep** to find usages, then **Edit** to update them

6.  **Update Test Files**:
    - Move test files to co-locate with source
    - Update test imports to match new paths
    - Rename `.test.ts` to `.spec.ts` if needed

7.  **Append a Change Log row — documents only**:
    - **Applies only when the moved or renamed file is a PRD, epic, story, or task document.** Source-file renames, component renames, test moves and import-reference rewrites get nothing: they are code, and `git log` is already their history.
    - When it does apply, append a row to the moved document's own Change Log recording the rename, and bump its frontmatter `updated` in the same edit. Canonical format: [document-change-log.md](references/document-change-log.md). A mechanical rename is not an authoring decision, so leave `Version` blank:

      | 2026-08-12 |  | Renamed from `epic_163_account_security.md` per file-naming standard | enforce-standards |

    - Record the **old filename**. After the move it is the one thing no longer recoverable from the document itself, and it is exactly what someone following a stale link needs.
    - Skip when `change-log.enabled: false` in `skills-config.yaml`.

### 4.3 Handle Edge Cases

#### Private Components in `_components/`
- **DO NOT MOVE** these to `components/` directory
- Only rename if file name is incorrect (missing underscore, wrong case)
- Update imports within the same route/feature
- Example:
  ```
  ❌ DO NOT: Move app/(drawer)/home/_components/_home-header.tsx to components/
  ✅ DO: Rename to correct kebab-case if needed
  ```

#### Special Files
- `_layout.tsx`, `+not-found.tsx`, `index.tsx` have fixed naming
- DO NOT rename these files
- Only update their internal imports if needed

#### Path Aliases
- Prefer `@/` imports for absolute paths
- Keep relative imports for:
  - Imports within same component folder
  - Private component imports within same route
- Example:
  ```typescript
  // In components/contacts/ContactCard/ContactCard.tsx
  ✅ import { ContactAvatar } from './ContactAvatar'  // Same folder
  ✅ import { Button } from '@/components/ui/Button'  // Cross-feature
  ```

#### Circular Dependencies
- If circular dependency detected, update imports incrementally
- Test after each import update to catch issues early
- May need to refactor code to break cycles

### 4.4 Enum Violations
**DO NOT FIX** enum values automatically. These require:
1. Database migration scripts
2. API contract updates
3. Comprehensive testing
4. Backward compatibility planning

Report violations in migration_plan.md and recommend separate enum-migration ticket.

## 5. Verification

### 5.1 Automated Checks

Run these checks after each batch:

1.  **TypeScript Compilation**:
    ```bash
    npx nx run <app>:typecheck
    ```
    - Ensures no type errors or unresolved imports
    - Example: `npx nx run {app-name}:typecheck`

2.  **Lint Check**:
    ```bash
    npx nx lint <app>
    ```
    - Catches "Unable to resolve path" errors
    - Validates import ordering and unused imports
    - Example: `npx nx lint {app-name}`

3.  **Test Check** (optional but recommended):
    ```bash
    npx nx test <app> --only-affected
    ```
    - Runs tests affected by changes
    - Ensures no test failures from refactoring

4.  **Import Resolution Validation**:
    - Use **Grep** to verify no old import paths remain:
      ```
      Pattern: "from.*OldFileName"
      ```
    - Should return zero results after migration

### 5.2 Manual Verification

1.  **Verify Private Components**:
    - Check that `_components/` subdirectories still contain private components
    - Verify no private components were accidentally moved to shared `components/`

2.  **Verify Test Co-location**:
    - Use **Glob** to confirm no `__tests__/` directories exist:
      ```
      Pattern: **/__tests__/**
      ```
    - Should return zero results

3.  **Verify Path Aliases**:
    - Use **Grep** to check for excessive relative imports:
      ```
      Pattern: "from ['\"]\.\.\/\.\.\/\.\.\/"  # Three or more levels
      ```
    - These should typically use `@/` aliases

### 5.3 Error Handling

If verification fails:
1.  **Fix immediately** before proceeding to next batch
2.  **Common issues**:
    - Missing import updates (use Grep to find all references)
    - Incorrect relative path calculations (re-read file structure)
    - Circular dependencies (may need code refactoring)
3.  **Rollback if necessary**: Use `git checkout` to revert problematic changes

### 5.4 Completion

1.  **Keep the migration plan** in `.plans/` directory for historical reference
2.  Report completion summary:
    ```
    ✅ Migration complete for [TargetDirectory]

    Summary:
    - X files renamed
    - Y files moved
    - Z test files co-located
    - W import paths updated to use @/ aliases

    Verification passed:
    - TypeScript compilation: ✅
    - Lint check: ✅
    - Tests: ✅ (N tests passing)

    Migration plan preserved at: `.plans/migration-[timestamp]-[directory].md`

    ⚠️ Enum violations detected: M files
    Recommendation: Create separate ticket for enum migration.
    ```

## 6. Using the Exclude Parameter

### Example: Exclude Multiple Directories

**Command**:
```bash
/enforce-standards apps/{app-name}/components --exclude contacts offline ui
```

**Result**:
- ✅ Scans: `components/animations/`, `components/features/`, etc.
- ❌ Skips: `components/contacts/`, `components/offline/`, `components/ui/`

**Directory Structure**:
```
components/
├── animations/          ✅ SCANNED
├── contacts/            ❌ EXCLUDED
│   └── ContactCard.tsx
├── features/            ✅ SCANNED
├── offline/             ❌ EXCLUDED
│   └── OfflineIndicator.tsx
└── ui/                  ❌ EXCLUDED
    └── Button.tsx
```

**Migration Plan Output**:
```markdown
## Summary
- Target directory: apps/{app-name}/components
- Excluded directories: contacts, offline, ui
- Total files scanned: 45 (127 files excluded)
- Total files to rename: 12
...
```

### Example: Single Exclusion

**Command**:
```bash
/enforce-standards apps/{app-name}/app/(drawer) --exclude settings
```

**Result**:
- ✅ Scans: `app/(drawer)/home/`, `app/(drawer)/messages/`, etc.
- ❌ Skips: `app/(drawer)/settings/`

### Example: No Exclusions

**Command**:
```bash
/enforce-standards apps/{app-name}/components
```

**Result**:
- ✅ Scans all subdirectories (no filtering)

## 7. Examples from Codebase

### Example 1: Private Components (DO NOT MOVE)
```
✅ CORRECT:
app/(drawer)/home/
├── _components/
│   ├── _home-header.tsx        # Exports HomeHeader
│   └── _home-header.spec.tsx
├── index.tsx
└── home-screen.tsx

❌ WRONG:
components/features/home/
└── HomeHeader/
    └── HomeHeader.tsx  # Moving private component to shared location
```

**Rule**: Private components in `app/**/_components/_*.tsx` stay in place.

### Example 2: Test Co-location
```
✅ CORRECT:
components/auth/
├── InputField.tsx
└── InputField.spec.tsx

❌ WRONG:
components/auth/
├── InputField.tsx
└── __tests__/
    └── InputField.spec.tsx
```

**Rule**: Tests are co-located with source files, not in `__tests__/` directories.

### Example 3: Component Naming
```
✅ CORRECT:
// File: ContactCard.tsx
export const ContactCard = () => { ... }

❌ WRONG:
// File: contact-card.tsx
export const ContactCard = () => { ... }

❌ WRONG:
// File: ContactCard.tsx
export const contact_card = () => { ... }
```

**Rule**: File name and export name must match in PascalCase for components.

### Example 4: Path Aliases
```
✅ CORRECT:
import { ContactCard } from '@/components/contacts/ContactCard'
import { useAuth } from '@/hooks/useAuth'
import './ContactList.styles'  // Same folder

❌ WRONG:
import { ContactCard } from '../../components/contacts/ContactCard'
import { useAuth } from '../../../hooks/useAuth'
```

**Rule**: Use `@/` for cross-feature imports, relative only for same folder.

### Example 5: Test Extensions
```
✅ CORRECT:
components/hooks/
├── useMorphingAnimations.ts
└── useMorphingAnimations.spec.ts

❌ WRONG:
components/hooks/
├── useMorphingAnimations.ts
└── useMorphingAnimations.test.ts  # Should be .spec.ts
```

**Rule**: Test files use `.spec.tsx` or `.spec.ts` extension.

### Example 6: Enum Values (Detection Only)
```
✅ CORRECT:
export enum MessageType {
  TEXT = 'TEXT',
  PAYMENT_SENT = 'PAYMENT_SENT',
  PAYMENT_RECEIVED = 'PAYMENT_RECEIVED'
}

❌ WRONG (but DO NOT auto-fix):
export enum MessageType {
  TEXT = 'text',              // Single-quoted lowercase
  PAYMENT_SENT = "payment_sent",  // Double-quoted lowercase
  PAYMENT_RECEIVED = `payment_received`  // Backtick lowercase
}

❌ ALSO WRONG (mixed case):
export enum CategoryType {
  INDIVIDUAL = "Individual",   // Double-quoted mixed case
  BUSINESS = 'Business',       // Single-quoted mixed case
  GROUP = `Group`              // Backtick mixed case
}
```

**Rule**: Detect and report enum violations (any lowercase letters in values), but do NOT fix automatically (requires database migration).

### Example 7: Feature Folder Structure
```
✅ CORRECT (component with styles):
components/contacts/ContactCard/
├── ContactCard.tsx
├── ContactCard.styles.ts
└── ContactCard.spec.tsx

✅ CORRECT (simple component):
components/ui/Button.tsx
components/ui/Button.spec.tsx

❌ WRONG:
components/ui/Button/
└── Button.tsx  # No need for folder if no styles/sub-components
```

**Rule**: Use folders when component has styles, sub-components, or multiple related files.

## 8. Tool Reference

### Claude Code Tools to Use
- **Glob**: File pattern matching (e.g., `**/*.tsx`, `**/_components/_*.tsx`)
- **Grep**: Content search for imports, exports, patterns (e.g., `"from.*OldName"`)
- **Bash**: Execute shell commands (e.g., `mv`, `mkdir`, `date`)
- **Read**: Read file contents before editing
- **Edit**: Make precise string replacements in files
- **Write**: Create new files (e.g., migration plans in `.plans/`)

### Filtering Excluded Directories

When `--exclude` parameter is provided:
1. Collect all file paths from Glob results
2. Filter out paths containing excluded directory names:
   ```
   For each excluded_dir in excluded_directories:
     Remove paths where path contains f"/{excluded_dir}/"
   ```
3. Example filtering logic:
   ```
   excluded = ['contacts', 'ui']
   path = 'components/contacts/ContactCard.tsx'
   # Check: 'components/contacts/ContactCard.tsx' contains '/contacts/' → EXCLUDE

   path = 'components/features/FeatureCard.tsx'
   # Check: path doesn't contain '/contacts/' or '/ui/' → INCLUDE
   ```

### Common Patterns
```bash
# Find all TypeScript files (then apply exclusion filter)
Glob: pattern "**/*.{ts,tsx}" in target directory
# Then filter results if --exclude provided

# Find private components
Glob: pattern "app/**/_components/_*.tsx"

# Find test directories (should return 0 results)
Glob: pattern "**/__tests__/**"

# Find imports of a file
Grep: pattern "from ['\"].*FileName['\"]"

# Find enum definitions
Grep: pattern "export enum"

# Find enum values with lowercase letters (all quote types)
Grep: pattern "= '[^']*[a-z][^']*'"      # Single quotes
Grep: pattern '= "[^"]*[a-z][^"]*"'      # Double quotes
Grep: pattern "= \`[^\`]*[a-z][^\`]*\`"  # Backticks

# Find relative imports
Grep: pattern "from ['\"]\.\./"

# Rename/move file
Bash: mv old-path.tsx new-path.tsx

# Create directory
Bash: mkdir -p parent/dir
```

## 9. Best Practices

### Before Starting
1. ✅ Parse command arguments (target directory and exclusions)
2. ✅ Read all documentation files
3. ✅ Scan entire target directory structure (applying exclusion filters)
4. ✅ Report excluded directories and file counts to user
5. ✅ Identify all special cases (private components, special files)
6. ✅ Create comprehensive migration plan
7. ✅ Get user approval before making changes

### Using Exclusions Effectively
1. ✅ Use `--exclude` for directories already conforming to standards
2. ✅ Use `--exclude` for directories being migrated separately
3. ✅ Validate excluded directory names exist before filtering
4. ✅ Document excluded directories in migration plan summary
5. ✅ Consider if multiple smaller runs are better than one large run with exclusions

### During Execution
1. ✅ Work in small batches (10-20 files)
2. ✅ Use Grep to find ALL import references before moving files
3. ✅ Update imports in consuming files before moving the file
4. ✅ Test after each batch
5. ✅ Commit after successful batch completion

### Edge Cases to Remember
1. ✅ DO NOT move private components from `_components/` subdirectories
2. ✅ DO NOT rename special files (`_layout.tsx`, `+not-found.tsx`, `index.tsx`)
3. ✅ DO NOT auto-fix enum values (detection only)
4. ✅ Preserve relative imports within same component folder
5. ✅ Update internal imports when moving files to deeper folders

### Verification
1. ✅ Run TypeScript compilation check
2. ✅ Run lint check
3. ✅ Run affected tests
4. ✅ Verify no old import paths remain
5. ✅ Verify no `__tests__/` directories exist
