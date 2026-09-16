---
name: pm-coordinator
description: Product management workflow coordinator. Use when creating PRDs, managing product requirements, creating epics/stories, or handling project changes. Guides you to the right PM skill based on context.
---

# Product Manager Coordinator

## When to Use This Skill

Activate this skill when the user needs help with:

- Creating product requirements documents (PRDs)
- Defining epics and user stories
- Managing changes to existing product plans
- Validating PRD quality and completeness
- Navigating product management workflows
- Understanding which PM tool or process to use

This skill acts as a **navigation hub** that routes you to the appropriate specialized skill based on the user's specific need.

## Core Product Management Workflows

### 1. New Product Development (Greenfield)

**When:** Starting a completely new product or major feature from scratch

**Workflow:**

1. Use `deep-research-prompt` if market validation needed
2. Use `new-product-prd` to create comprehensive PRD
   - Internally uses `create-doc` + `prd-template`
   - Validates with `pm-checklist`
3. Use `shard-prd` if PRD is large (split into manageable files)
4. Use `create-epics-from-shards` to generate implementation epics

### 2. Existing Product Enhancement (Brownfield)

**When:** Adding features to or modifying existing codebase

**Decision Tree:**

- **Large enhancement** (4+ stories, architectural changes)
  → Use `create-prd` skill
- **Medium enhancement** (1-3 stories, follows existing patterns)
  → Use `create-epic` skill
- **Small change** (single session, isolated change)
  → Use `brownfield-story` skill

### 3. Change Management

**When:** Project needs to pivot, stories are failing, or requirements changed

**Workflow:**

1. Use `change-management` skill to orchestrate response
   - Internally uses `correct-course` workflow
   - Runs `change-checklist` validation
2. Produces Sprint Change Proposal
3. Hands off to PM/Architect if needed

### 4. Quality Validation

**When:** PRD needs comprehensive validation before architecture phase

**Workflow:**

1. Use `pm-checklist` skill for 60+ point validation
2. Review 9 category analysis
3. Address blockers and critical issues

## Skill Directory

### Core Workflow Skills

- **`new-product-prd`** - New product requirements from scratch (thin wrapper that delegates to `create-prd` with `mode=greenfield`)
- **`create-prd`** - PRD orchestrator. Default mode is brownfield (enhancements to existing projects); greenfield mode is reached via `new-product-prd`
- **`change-management`** - Handle pivots and corrections

### Task Skills

- **`create-doc`** - YAML-driven document creation engine (used internally)
- **`shard-prd`** - Split large documents into manageable files
- **`create-epics-from-shards`** - Generate implementation epics from sharded PRDs
- **`create-epic`** - Create single epic (1-3 stories)
- **`brownfield-story`** - Create single story (one session)
- **`deep-research-prompt`** - Generate comprehensive research prompts
- **`execute-checklist`** - Generic checklist validation
- **`correct-course`** - Structured response to change triggers (used internally)

### Template & Validation Skills

- **`prd-template`** - Greenfield PRD structure
- **`brownfield-prd-template`** - Brownfield PRD structure
- **`pm-checklist`** - Comprehensive PRD validation (9 categories, 60+ checks)
- **`change-checklist`** - Change impact assessment (6 sections)

## Navigation Logic

**Use this decision tree to activate the right skill:**

```
User Request Analysis:
├─ "Create PRD for..." / "New product..." / "Product requirements..."
│  ├─ Existing codebase? → create-prd
│  └─ New product? → new-product-prd
│
├─ "Create epic..." / "Need an epic for..."
│  └─ create-epic
│
├─ "Create story..." / "Add small feature..."
│  └─ brownfield-story
│
├─ "Story failed..." / "Need to pivot..." / "Requirements changed..."
│  └─ change-management
│
├─ "Validate PRD..." / "Check PRD quality..."
│  └─ pm-checklist
│
├─ "Split PRD..." / "Break down large document..."
│  └─ shard-prd → create-epics-from-shards
│
└─ "Research prompt..." / "Market validation..."
   └─ deep-research-prompt
```

## Key Principles

### Product Management Philosophy

1. **User-Centric** - Every requirement ties back to user value
2. **MVP Focus** - Ruthlessly prioritize, minimize scope
3. **Clarity & Precision** - Requirements must be unambiguous and testable
4. **Data-Informed** - Base decisions on evidence, not assumptions
5. **Collaborative** - Engage stakeholders, iterate based on feedback
6. **Strategic** - Think outcomes, not just outputs

### Agile Best Practices

- Epics deliver significant, deployable increments
- Epic 1 establishes foundation (infrastructure + initial functionality)
- Stories are vertical slices with clear value
- Stories sized for AI agents (2-4 hours, single-focused session)
- Sequential dependencies explicit and logical
- Cross-cutting concerns flow through epics (not isolated at end)

**Epic Numbering (CRITICAL)**:

- Epic numbers are globally unique across the entire system
- PRDs use relative numbers ("Epic 1", "Epic 2")
- Epic files use global registry numbers (epic.163.md, epic.164.md, etc.)
- Check `/docs/development/epic-registry.md` before creating epic files
- See [Epic Numbering System in CLAUDE.md](../../CLAUDE.md#epic-numbering-system)

### Quality Standards

- Requirements focus on WHAT not HOW
- Acceptance criteria are testable and complete
- Technical assumptions documented with rationale
- Risk identification proactive, not reactive
- All deliverables pass validation checklists

## Example Activations

**Example 1:**

```
User: "I need to create a PRD for a new mobile banking app"
→ Activate: new-product-prd
```

**Example 2:**

```
User: "Add biometric authentication to our existing app"
→ Activate: create-epic (medium-sized enhancement)
```

**Example 3:**

```
User: "The authentication story failed because we're missing an API"
→ Activate: change-management
```

**Example 4:**

```
User: "Is my PRD ready for the architect?"
→ Activate: pm-checklist
```

## Integration with Other Roles

**Handoffs:**

- **To UX Expert:** After PRD completion, use UX Expert Prompt from Next Steps
- **To Architect:** After PRD validation, use Architect Prompt from Next Steps
- **To Dev Agent:** After epic/story creation, stories ready for implementation

**Collaborative Work:**

- PM defines WHAT and WHY
- UX Expert designs HOW users interact
- Architect designs HOW system implements
- Dev implements according to designs

## Success Criteria

A successful PM engagement produces:

1. **Clear Problem Definition** - Everyone understands what we're solving and why
2. **Validated MVP Scope** - Minimal scope that delivers maximum learning
3. **Comprehensive Requirements** - Functional, non-functional, UX, technical
4. **Logical Epic Structure** - Sequential, value-delivering increments
5. **AI-Agent-Sized Stories** - Small, focused, independently valuable
6. **Quality Validation** - Passed pm-checklist, ready for next phase
7. **Clear Next Steps** - Explicit handoff prompts for UX/Architect

## Notes

- This skill doesn't perform PM work itself - it routes to specialized skills
- Always confirm user context before activating downstream skills
- Multiple skills can be chained for comprehensive workflows
- Natural activation based on context is preferred over explicit skill invocation
