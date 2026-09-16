---
name: create-doc
description: YAML-driven document creation engine with mandatory user interaction. Use when creating PRDs, epics, or any document from a YAML template that requires section-by-section collaboration.
---

# Create Document from Template (YAML-Driven)

## When to Use This Skill

Activate this skill when:

- Creating documents from YAML templates (PRDs, epics, architecture docs)
- User needs structured, interactive document creation
- Template-driven workflows require section-by-section validation
- Documents need comprehensive rationale for decisions
- User collaboration is essential (not just document generation)

**Note:** This skill is typically invoked by higher-level skills like `new-product-prd` or `create-prd`, not directly by users.

## ⚠️ CRITICAL EXECUTION RULES ⚠️

### This is an Executable Workflow - NOT Reference Material

When this skill is activated:

1. **DISABLE ALL EFFICIENCY OPTIMIZATIONS** - Full user interaction required
2. **MANDATORY STEP-BY-STEP EXECUTION** - Each section processed sequentially
3. **ELICITATION IS REQUIRED** - When `elicit: true`, MUST use 1-9 format
4. **NO SHORTCUTS ALLOWED** - Complete documents cannot be created without following this workflow

**VIOLATION INDICATOR:** If you create a complete document without user interaction, you have violated this workflow.

### Mandatory Elicitation Format

**When `elicit: true` in template, this is a HARD STOP requiring user interaction:**

**YOU MUST:**

1. **Present section content** - Show drafted content for the section
2. **Provide detailed rationale:**
   - Explain trade-offs and choices made
   - Document key assumptions
   - Highlight questionable decisions needing user attention
   - Identify areas requiring validation
3. **STOP and present numbered options 1-9:**
   - **Option 1:** Always "Proceed to next section"
   - **Options 2-9:** Select 8 methods from `resources/elicitation-methods.md`
   - End with: **"Select 1-9 or just type your question/feedback:"**
4. **WAIT FOR USER RESPONSE** - Do not proceed until user selects option or provides feedback

**NEVER:**

- Ask yes/no questions
- Use any format other than 1-9 numbered options
- Create content for elicit=true sections without user interaction
- Proceed without waiting for user response

## Processing Flow

### 1. Template Discovery

If YAML template not provided:


- List all templates from `resources/`
- Ask user to select or provide template path

### 2. Parse YAML Template

Load and parse:

- Template metadata (id, name, version, output format)
- Workflow settings (mode, elicitation style)
- Section structure (including nested sections)
- Section properties (instruction, elicit, repeatable, conditions, agent permissions)

> **OKF frontmatter (v0.1):** the generated document's YAML frontmatter must carry a non-empty `type` (OKF's one hard requirement — e.g. `prd`, `epic`, `architecture`) and should carry a one-sentence `description` (OKF-recommended); `tags` is optional. Derive `type` from the template's domain when the template metadata does not specify it. See [OKF conformance](references/open-knowledge-format.md).

### 3. Set Preferences

- Show current mode: **Interactive** (default) or **YOLO** (user can toggle with `#yolo`)
- Confirm output file path
- Explain workflow to user

### 4. Process Each Section Sequentially

For each section:

**a. Check Conditions**

- Skip section if condition not met (e.g., "PRD has UX/UI requirements")

**b. Check Agent Permissions**

- Note if section restricted to specific agents (owner/editors)
- Mark readonly sections
- Include permission note in generated document if restricted

**c. Draft Content**

- Use section instruction to guide content creation
- Follow section type (bullet-list, numbered-list, paragraphs, table)
- Use examples if provided in template
- Apply prefix/item_template if specified

**d. Present Content + Rationale**

- Show drafted section content
- Provide detailed rationale explaining:
  - **Trade-offs:** What was chosen over alternatives and why
  - **Assumptions:** Key assumptions made during drafting
  - **Decisions:** Interesting or questionable choices
  - **Validation needs:** Areas that might need user attention

**e. Elicitation (if elicit: true)**

- **MANDATORY 1-9 format:**

```
Select an option:

1. Proceed to next section
2. [Elicitation Method A from resources/elicitation-methods.md]
3. [Elicitation Method B]
4. [Elicitation Method C]
5. [Elicitation Method D]
6. [Elicitation Method E]
7. [Elicitation Method F]
8. [Elicitation Method G]
9. [Elicitation Method H]

Select 1-9 or just type your question/feedback:
```

**f. Save to File**

- Incrementally save completed sections to output file
- **Write the Change Log** when the template declares a `changelog` (or `change-log`) section.
  Canonical format: `references/document-change-log.md` — append-only, newest row last,
  four columns (`Date`, `Version`, `Description`, `Author`).
  - On the first save, seed exactly one row: `| {today} | 1.0 | Initial draft | create-doc |`
  - On any later save that **revises an already-written section**, append a new row describing the
    revision — never edit an existing row. Bump `Version` for a substantive revision.
  - Every appended row bumps the document's frontmatter `updated:` field in the same edit.
- If the template declares no changelog section, write nothing — do not invent the section.

**g. Handle Repeatable Sections**

- For sections marked `repeatable: true` (e.g., epics, stories)
- Ask user if they want to add another instance
- Repeat section processing as needed

**h. Visual Diagrams (conditional, via `mermaid-architect`)**

- If a section's drafted content describes a multi-actor flow, system topology, state lifecycle, sequence of API calls, or data shape — and a diagram would materially clarify it — invoke `mermaid-architect`.
- A Mermaid diagram is **mandatory only if it enhances understanding** of the section. Do not pad documents with diagrams.
- Pass the document path, the section anchor, and any actors/systems already named in the prose.
- If the section template marks `diagram: optional|recommended|required`, honour that hint. Otherwise let `mermaid-architect` decide and accept its `no diagram justified — {reason}` response without pushing back.
- Paste the returned Mermaid block (with YAML metadata header) and the 2-sentence "Architectural assumptions" summary into the section before continuing.

### 5. Continue Until Complete

- Process all sections in order
- Handle nested sections recursively
- Maintain document structure and formatting

## Elicitation Methods

**Available in `resources/elicitation-methods.md`:**

### Core Reflective Methods

- Expand or Contract for Audience
- Explain Reasoning (CoT Step-by-Step)
- Critique and Refine

### Structural Analysis Methods

- Analyze Logical Flow and Dependencies
- Assess Alignment with Overall Goals

### Risk and Challenge Methods

- Identify Potential Risks and Unforeseen Issues
- Challenge from Critical Perspective

### Creative Exploration Methods

- Tree of Thoughts Deep Dive
- Hindsight is 20/20: The 'If Only...' Reflection

### Multi-Persona Collaboration Methods

- Agile Team Perspective Shift
- Stakeholder Round Table
- Meta-Prompting Analysis

### Advanced Techniques

- Self-Consistency Validation
- ReWOO (Reasoning Without Observation)
- Persona-Pattern Hybrid
- Emergent Collaboration Discovery

### Game-Based Methods

- Red Team vs Blue Team
- Innovation Tournament
- Escape Room Challenge

## Elicitation Results Flow

After user selects elicitation method (2-9):

1. **Execute method** from `resources/elicitation-methods.md`
2. **Present results** with insights and analysis
3. **Offer options:**
   - **1. Apply changes and update section**
   - **2. Return to elicitation menu** (show 1-9 options again)
   - **3. Ask any questions or engage further** with this elicitation

## Agent Permissions

When processing sections with agent permission fields:

- **owner:** Note which agent role initially creates/populates the section
- **editors:** List agent roles allowed to modify the section
- **readonly:** Mark sections that cannot be modified after creation

**For sections with restricted access:**

- Include note in generated document:
  ```
  _(This section is owned by dev-agent and can only be modified by dev-agent)_
  ```

## YOLO Mode

User can type `#yolo` to toggle YOLO mode:

- **Interactive Mode (default):** Section-by-section with elicitation stops
- **YOLO Mode:** Process all sections at once without elicitation stops
- **Toggle:** User can switch modes mid-document by typing `#yolo`

**Note:** YOLO mode is for experienced users who trust the AI to make good decisions without frequent check-ins.

## Detailed Rationale Requirements

When presenting section content, ALWAYS include rationale that explains:

- **Trade-offs:** What was chosen over alternatives and why
- **Assumptions:** Key assumptions made during drafting
- **Decisions:** Interesting or questionable decisions needing user attention
- **Validation:** Areas that might need validation or confirmation

**Example:**

```
### Requirements Section

**Drafted Content:**
- FR1: User can create new tasks via command palette
- FR2: Tasks support tags and categories
- FR3: Tasks can be filtered by status

**Rationale:**
I focused on core task management (FR1) and organization (FR2-FR3)
as these directly support the goal of reducing task overhead.
I assumed keyboard-first interaction (command palette) based on
the technical preferences for developer tools. I didn't include
task scheduling as that felt like a phase 2 feature, but this is
worth validating - should MVP include due dates?
```

## Integration with Other Skills

This skill is typically called by:

- **`create-prd`** - Uses with `prd-template` (mode=greenfield) or `brownfield-prd-template` (mode=brownfield). `new-product-prd` reaches this skill via `create-prd` mode=greenfield delegation.
- Other document creation workflows requiring templates

This skill calls:

- **`pm-checklist`** - Often runs at end of PRD creation
- **`mermaid-architect`** - Generates Mermaid diagrams for any section where a visual materially clarifies the prose
- **Template skills** - References template structures from `prd-template` or `brownfield-prd-template`

## Key Principles

1. **User Collaboration is Mandatory** - This is not an AI document generator
2. **Transparency in Reasoning** - Always explain why choices were made
3. **Respect Elicitation Requirements** - Never skip elicit: true sections
4. **Incremental Progress** - Save work frequently, build document section by section
5. **Flexibility** - User can provide feedback at any time, not just during elicitation

## Success Criteria

A successful create-doc execution produces:

1. **Complete Document** - All sections processed according to template
2. **User-Validated Content** - Elicitation stops honored, user feedback incorporated
3. **Clear Rationale** - Every significant decision explained with trade-offs
4. **Saved Output** - Document saved to specified file path
5. **Quality Validation** - If applicable, validation checklist run at completion

## Example Activation

**Internal Activation (from create-prd):**

```
create-prd skill: "Use create-doc with [prd-template | brownfield-prd-template] to generate PRD"
→ create-doc activates with template path
→ Processes each section interactively
→ Returns completed PRD to create-prd
```

(For greenfield, the chain is: `new-product-prd` → `create-prd` mode=greenfield → `create-doc` + `prd-template`.)

**Direct Activation (advanced users):**

```
User: "Create a document using the custom-epic-tmpl.yaml template"
→ create-doc activates
→ Loads custom-epic-tmpl.yaml
→ Begins interactive section-by-section processing
```

## Common Pitfalls to Avoid

❌ **Creating complete documents without interaction**

- Violation of workflow mandate

❌ **Skipping elicitation for efficiency**

- Defeats purpose of interactive document creation

❌ **Using yes/no questions instead of 1-9 format**

- Not the specified interaction pattern

❌ **Not providing detailed rationale**

- User can't make informed decisions without understanding trade-offs

✅ **Follow the workflow exactly as specified**

- Present, explain, offer 1-9 options, wait for response, continue

## Notes

- This skill is designed for high-stakes documents where quality and user alignment are critical
- The elicitation format (1-9 options) is intentional - provides structured choices while allowing free-form feedback
- Templates define the workflow - this skill is the execution engine
- Agent permissions enable multi-agent workflows where different agents own different sections
