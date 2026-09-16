---
name: create-architecture-doc
description: Interactive YAML-driven architecture document creation with mandatory user elicitation. Creates backend, brownfield, frontend, or full-stack architecture documents through structured workflows. Use when creating new architecture documentation from templates.
---

# Create Architecture Document

## Purpose

Create comprehensive architecture documents using YAML template-driven workflows with mandatory user interaction and elicitation. This skill guides you through structured document creation ensuring all critical aspects are addressed.

## When to Use This Skill

Use this skill when:

- Creating new backend/service architecture documents
- Documenting existing (brownfield) systems
- Designing frontend-specific architectures
- Creating full-stack system architecture
- Need structured, comprehensive architecture documentation
- Want interactive guidance through architecture decisions

## Available Templates

This skill includes four architecture templates in `resources/templates/`:

1. **architecture-tmpl.yaml** - Backend/Service Architecture
   - Focus: Backend services, APIs, data models, infrastructure
   - Use for: Service-oriented projects, APIs, backend systems
   - Sections: Tech stack, data models, components, API specs, database schema

2. **brownfield-architecture-tmpl.yaml** - Existing Project Documentation
   - Focus: Documenting actual state of existing systems
   - Use for: Legacy systems, existing codebases, inherited projects
   - Sections: Current state, technical debt, workarounds, constraints

3. **front-end-architecture-tmpl.yaml** - Frontend Architecture
   - Focus: UI components, state management, routing, styling
   - Use for: Frontend applications, SPAs, mobile apps
   - Sections: Component design, state management, routing, styling patterns

4. **fullstack-architecture-tmpl.yaml** - Complete System Architecture
   - Focus: Frontend + backend + infrastructure comprehensive design
   - Use for: Full application stacks, end-to-end systems
   - Sections: All aspects from frontend to backend to deployment

## Critical Execution Notice

**THIS IS AN EXECUTABLE WORKFLOW - NOT REFERENCE MATERIAL**

When this skill is invoked:

1. **DISABLE ALL EFFICIENCY OPTIMIZATIONS** - This workflow requires full user interaction
2. **MANDATORY STEP-BY-STEP EXECUTION** - Each section must be processed sequentially with user feedback
3. **ELICITATION IS REQUIRED** - When `elicit: true`, you MUST use the 1-9 format and wait for user response
4. **NO SHORTCUTS ALLOWED** - Complete documents cannot be created without following this workflow

**VIOLATION INDICATOR:** If you create a complete document without user interaction, you have violated this workflow.

## Workflow Process

### Step 1: Template Discovery

If a YAML template has not been provided:

1. List all available templates from `resources/templates/`
2. Ask user to select one OR provide their own template path
3. Load the selected template

### Step 2: Process Template Sections

For each section in the template:

1. **Parse Section** - Understand requirements from YAML
2. **Check Conditions** - Skip if condition is not met
3. **Check Permissions** - Note if section has agent restrictions
4. **Draft Content** - Create content following section instructions
5. **Present with Rationale** - Show content AND explain decisions made
6. **Elicit if Required** - If `elicit: true`, MANDATORY interaction

### Step 3: Mandatory Elicitation Format

**When `elicit: true`, this is a HARD STOP requiring user interaction:**

YOU MUST:

1. **Present section content** - Show what you've drafted
2. **Provide detailed rationale** - Explain:
   - Trade-offs and choices made (what was chosen over alternatives and why)
   - Key assumptions made during drafting
   - Interesting or questionable decisions that need user attention
   - Areas that might need validation
3. **STOP and present numbered options 1-9:**
   - **Option 1:** Always "Proceed to next section"
   - **Options 2-9:** Select 8 methods from `resources/elicitation-methods.md`
   - End with: "Select 1-9 or just type your question/feedback:"
4. **WAIT FOR USER RESPONSE** - Do not proceed until user selects option or provides feedback

**WORKFLOW VIOLATION:** Creating content for `elicit=true` sections without user interaction violates this task.

**NEVER ask yes/no questions or use any other format.**

## Elicitation Methods

The skill includes `resources/elicitation-methods.md` with various elicitation techniques:

- **Scenario Analysis** - Walk through specific use cases
- **What-If Analysis** - Explore alternative scenarios
- **Trade-off Analysis** - Compare competing options
- **Risk Assessment** - Identify potential issues
- **Assumption Validation** - Test underlying assumptions
- **Gap Analysis** - Find missing elements
- **Stakeholder Perspectives** - Consider different viewpoints
- **Constraint Challenge** - Question stated limitations
- **And more...**

When user selects method 2-9:

1. Execute the chosen elicitation method
2. Present results with insights
3. Offer options:
   - **1. Apply changes and update section**
   - **2. Return to elicitation menu**
   - **3. Ask any questions or engage further with this elicitation**

## Section Processing Details

### Agent Permissions

When processing sections with agent permission fields:

- **owner**: Note which agent role initially creates/populates the section
- **editors**: List agent roles allowed to modify the section
- **readonly**: Mark sections that cannot be modified after creation

For sections with restricted access, include a note in the generated document indicating the responsible agent.

Example: `_(This section is owned by dev-agent and can only be modified by dev-agent)_`

### Section Types

Templates may include various section types:

- **text**: Standard markdown content
- **table**: Structured tabular data
- **code**: Code blocks with language specification
- **mermaid**: Diagrams (graph, sequence, C4, etc.)
- **repeatable**: Sections that can repeat (e.g., multiple data models)

### Conditional Sections

Some sections include conditions:

```yaml
condition: Project requires external API integrations
```

If condition is not met, skip the section and note this in the document.

## YOLO Mode

User can type `#yolo` to toggle YOLO mode:

- **YOLO Mode ON**: Process all sections at once without elicitation stops
- **YOLO Mode OFF** (default): Interactive mode with elicitation stops

**WARNING:** YOLO mode is faster but skips valuable user feedback. Use only when:

- You fully understand all requirements
- Template choices are straightforward
- You're iterating on an existing document

## Output Management

### File Output

- Default output path is specified in template YAML (typically `docs/architecture.md`)
- Save sections incrementally if possible
- Provide complete document at the end

### Document Structure

Generated documents include:

- YAML frontmatter (template metadata)
- Table of contents (if applicable)
- All processed sections in order
- Diagrams and code blocks properly formatted
- Agent permission notes where applicable

## Example Usage

### Example 1: Create Backend Architecture

```
User: "Create backend architecture for a REST API"

Skill:
1. Lists available templates
2. User selects "architecture-tmpl.yaml"
3. Processes "Introduction" section
4. Drafts technical summary, presents with rationale
5. Shows 1-9 elicitation options
6. User provides feedback or selects option 1
7. Continues through all sections
8. Outputs complete architecture.md
```

### Example 2: Document Brownfield Project

```
User: "Document our existing Node.js application"

Skill:
1. Loads "brownfield-architecture-tmpl.yaml"
2. Asks about PRD or enhancement plans
3. Analyzes codebase as instructed
4. Documents actual state (not ideals)
5. Captures technical debt and workarounds
6. Interactive elicitation for key decisions
7. Outputs brownfield-architecture.md
```

## Critical Reminders

**❌ NEVER:**

- Ask yes/no questions for elicitation
- Use any format other than 1-9 numbered options
- Create new elicitation methods (use only from resources file)
- Skip elicitation when `elicit: true`
- Create complete documents without user interaction

**✅ ALWAYS:**

- Use exact 1-9 format when `elicit: true`
- Select options 2-9 from `resources/elicitation-methods.md` only
- Provide detailed rationale explaining decisions
- End with "Select 1-9 or just type your question/feedback:"
- Wait for user response before proceeding
- Follow template instructions precisely

## Resources

This skill includes:

- **Templates** (`resources/templates/`)
  - `architecture-tmpl.yaml` - Backend architecture
  - `brownfield-architecture-tmpl.yaml` - Existing projects
  - `front-end-architecture-tmpl.yaml` - Frontend architecture
  - `fullstack-architecture-tmpl.yaml` - Full-stack architecture

- **Elicitation Methods** (`resources/elicitation-methods.md`)
  - Comprehensive list of elicitation techniques
  - Usage guidelines for each method
  - When to apply specific techniques

## Success Criteria

A successful architecture document includes:

✅ All required sections completed
✅ Technology decisions made with clear rationale
✅ Data models defined
✅ Component structure specified
✅ API specifications (if applicable)
✅ Security and error handling strategies
✅ Testing approach defined
✅ Deployment strategy outlined
✅ User feedback incorporated through elicitation
✅ Ready for development handoff

## Notes

- This skill enforces structured, comprehensive architecture creation
- User interaction is mandatory for quality outcomes
- Templates ensure no critical aspects are overlooked
- Elicitation improves decision quality through collaboration
- Documents are optimized for AI and human developers

---

**Remember**: Quality architecture requires thoughtful collaboration. Don't rush the process - the elicitation steps exist to ensure informed decisions.
