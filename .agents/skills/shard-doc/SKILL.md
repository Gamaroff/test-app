---
name: shard-doc
description: Document sharding utility that splits large markdown documents into smaller files organized by level 2 sections. Use when documents are too large or when modular documentation structure is needed.
---

# Shard Doc (Document Splitting)

## When to Use This Skill

Use this skill when you need to:
- **Split large documents** into manageable sections ("shard this PRD", "break down architecture doc")
- **Create modular documentation** structure ("organize this into sections")
- **Prepare documents** for better navigation and maintenance
- **Convert monolithic docs** to section-based structure

Natural language triggers:
- "Shard the PRD document"
- "Split architecture.md by sections"
- "Break down this large document"
- "Create sections from this document"

## Purpose

This skill splits large markdown documents into multiple smaller files based on level 2 headings (##). It:
- Creates organized folder structure for sharded files
- Maintains content integrity (code blocks, diagrams, tables)
- Adjusts heading levels appropriately
- Generates index file with links to all sections
- Preserves all markdown formatting and special content

## CRITICAL: Two Methods Available

### Method 1: Automatic (Recommended)
Uses `@kayvan/markdown-tree-parser` CLI tool for reliable, tested sharding.

**Prerequisites**:
```bash
npm install -g @kayvan/markdown-tree-parser
```

**Usage**:
```bash
md-tree explode [source-document] [destination-folder]
```

### Method 2: Manual
Parses and splits document programmatically (fallback when CLI unavailable).

---

## Workflow

### Step 1: Configuration Check

1. **Load configuration**
   - Read `resources/core-config.yaml`
   - Check `markdownExploder` setting

2. **Determine method**
   - If `markdownExploder: true` → Attempt automatic method
   - If `markdownExploder: false` → Use manual method

### Step 2: Gather Inputs

1. **Source document path**
   - User-provided or specified in command
   - Validate file exists

2. **Destination folder**
   - Default: `docs/{document-name}/`
   - User can override

3. **Confirm with user**
   - Show source and destination
   - Get approval to proceed

### Step 3A: Automatic Method (if markdownExploder: true)

1. **Check for md-tree command**
   ```bash
   which md-tree
   ```

2. **If available**: Run the sharding command
   ```bash
   md-tree explode {source-document} {destination-folder}
   ```

3. **If successful**:
   - Report success
   - List files created
   - **STOP** - task complete

4. **If command not found**:
   - Inform user: "The markdownExploder setting is enabled but md-tree command is not available."
   - Provide installation instructions:
     ```
     npm install -g @kayvan/markdown-tree-parser
     ```
   - **STOP** - do not proceed with manual method
   - Ask user to either install tool or set `markdownExploder: false`

### Step 3B: Manual Method (if markdownExploder: false)

**Only proceed if markdownExploder is explicitly false**

#### 3B.1: Parse Document

1. **Read entire document**
2. **Identify level 2 sections** (## headings)
3. **Extract each section** with all content until next level 2 heading

**CRITICAL PARSING RULES**:
- Must understand markdown context
- `##` inside code blocks is NOT a section header
- Handle fenced code blocks correctly (capture including closing backticks)
- Preserve Mermaid diagrams completely
- Maintain nested markdown elements

#### 3B.2: Process Each Section

For each extracted section:

1. **Generate filename**
   - Convert heading to lowercase-dash-case
   - Remove special characters
   - Example: "## Tech Stack" → `tech-stack.md`

2. **Adjust heading levels**
   - Level 2 (##) becomes level 1 (#)
   - Level 3 (###) becomes level 2 (##)
   - Level 4 (####) becomes level 3 (###)
   - And so on...

3. **Write file**
   - Save to destination folder
   - Preserve all content exactly (except heading levels)

#### 3B.3: Create Index File

Create `index.md` in destination folder:

```markdown
# {Original Document Title}

{Original introduction content before first level 2 section}

## Sections

- [Section Name 1](./section-name-1.md)
- [Section Name 2](./section-name-2.md)
- [Section Name 3](./section-name-3.md)

## Change Log

| Date       | Version | Description                                | Author    |
| ---------- | ------- | ------------------------------------------ | --------- |
| 2026-08-12 | 1.0     | Sharded from `prd.checkout.md` — 7 sections | shard-doc |
```

**The index carries the Change Log; the shards do not.** Sharding destroys the source document's structure, so the index is the only place a reader can learn where these files came from. Canonical format: [document-change-log.md](references/document-change-log.md).

Give each shard a one-line provenance note instead, immediately under its title:

```markdown
> Sharded from [`prd.checkout.md`](./index.md) on 2026-08-12.
```

> **Do not copy the source document's Change Log into every shard.** That multiplies one history into N copies, none of which is authoritative, and every future edit to any shard makes the other N−1 wrong. One log on the index, provenance notes on the shards.

#### 3B.4: Preserve Special Content

**Must handle correctly**:

1. **Code blocks**: Complete blocks with language tags
   ```language
   content
   ```

2. **Mermaid diagrams**: Full diagram syntax
   ```mermaid
   graph TD
   ...
   ```

3. **Tables**: Markdown table formatting

4. **Lists**: Indentation and nesting

5. **Inline code**: Backticks

6. **Links**: All markdown links

7. **Template markup**: Placeholders like `{{variable}}`

### Step 4: Validation

1. **Verify completeness**
   - All sections extracted?
   - No content lost?
   - Heading levels adjusted correctly?

2. **Check file creation**
   - All files written successfully?
   - Index file created?

3. **Content integrity**
   - Code blocks intact?
   - Diagrams preserved?
   - Formatting maintained?

### Step 5: Report Results

Provide summary to user:

```
Document sharded successfully:
- Source: {original document path}
- Destination: docs/{folder-name}/
- Method: {Automatic / Manual}
- Files created: {count}
- Sections:
  - section-name-1.md: "Section Title 1"
  - section-name-2.md: "Section Title 2"
  - section-name-3.md: "Section Title 3"
  ...
```

---

## Integration with Other Skills

**Called by**:
- `create-doc` - After creating large documents

**Outputs used by**:
- Any skill that needs to read modular documentation
- Project organization and navigation

---

## Common Sharding Scenarios

### PRD Sharding
**Source**: `docs/prd.md` (monolithic file at repo root)
**Destination**: `${PRD_ROOT}/` (default `docs/prd/`)
**Typical sections**: Overview, Goals, Tech Stack, Architecture, etc.

### Architecture Sharding
**Source**: `docs/architecture.md` (monolithic file at repo root)
**Destination**: `${ARCH_ROOT}/` (default `docs/architecture/`)
**Typical sections**: System Design, Data Models, API Endpoints, etc.

### Large Epic Sharding
**Source**: `${PRD_ROOT}/<domain>/<feature>/epics/epic.<N>.<name>/epic.<N>.<name>.md`
**Destination**: `${PRD_ROOT}/<domain>/<feature>/epics/epic.<N>.<name>/shards/`
**Typical sections**: Multiple user stories, acceptance criteria lists

---

## Important Notes

- **Never modify content** - only adjust heading levels
- **Preserve ALL formatting** - including significant whitespace
- **Handle edge cases** - code blocks with ## symbols
- **Reversible process** - could reconstruct original from shards
- **Prefer automatic method** - more reliable and tested
- **Manual method is fallback** - use only when automatic unavailable

---

## Success Criteria

✅ Configuration loaded and method determined
✅ Source and destination validated
✅ All sections extracted completely
✅ Heading levels adjusted correctly
✅ Index file created with all links
✅ Content integrity maintained
✅ Special content preserved (code, diagrams, tables)
✅ Summary report provided to user

---

## Resources

This skill uses these resource files:

- `resources/core-config.yaml` - Project configuration (markdownExploder setting)
