---
name: new-product-prd
description: Create Product Requirements Documents for new products from scratch. Use when starting a new product or major feature without existing codebase constraints. Orchestrates create-doc, prd-template, and pm-checklist.
---

# New Product PRD Creation

## What This Skill Does

Entry point for **greenfield PRDs** (new products, no existing codebase constraints). All workflow logic — pre-flight, template execution, validation, handoff — is delegated to the `create-prd` skill with `mode=greenfield`. This skill exists as a thin, user-facing wrapper so that greenfield queries auto-activate without users needing to know the underlying orchestrator.

## When to Use This Skill

Activate when the user needs to:

- Create a PRD for a **completely new product** (no existing codebase)
- Define requirements for a **major greenfield feature** built from scratch
- Document a **new product line or platform**
- Start a **fresh project** without legacy constraints

**Natural activation triggers:**

- "Create a PRD for a new..."
- "I need product requirements for..."
- "Draft PRD for greenfield..."
- "Starting a new product called..."

**Do NOT use for:**

- Enhancements to existing products (use `create-prd` directly)
- Quick feature additions (use `brownfield-story`)
- Changes to existing PRDs (use `change-management`)

## Prerequisites

Before starting, recommend the user have:

1. **Project Brief** (strongly recommended) — provides foundation:
   - Problem statement
   - Target users and personas
   - Success metrics and KPIs
   - MVP scope definition
   - Constraints and assumptions

2. **Market Research** (optional but valuable):
   - Competitive analysis
   - User research findings
   - Market context

3. **Business Goals** (essential):
   - Why building this product
   - What success looks like
   - Timeline expectations

If Project Brief is missing, `create-prd` (via `prd-template`) will guide gathering this information during the Goals section — but creating the brief first is more efficient.

If market validation is uncertain, recommend `deep-research-prompt` before proceeding.

## Invocation

**Activate `create-prd` with `mode=greenfield`.** All subsequent steps — Project Brief check, template execution via `create-doc` + `prd-template`, `pm-checklist` validation, UX Expert / Architect handoff prompts — are handled by `create-prd`.

The wrapper performs no orchestration of its own; it exists only to ensure greenfield queries route to the correct mode of the shared PRD orchestrator.

## Output

- PRD written to `docs/prd.md` (greenfield default)
- Checklist results embedded in PRD
- UX Expert and Architect handoff prompts generated

## Integration with Other Skills

Invoked indirectly via `create-prd` (mode=greenfield):

- `create-doc` — template execution engine
- `prd-template` — greenfield PRD structure
- `pm-checklist` — quality validation
- `deep-research-prompt` — recommended pre-PRD if market validation needed
- `mermaid-architect` — conditional system topology diagram

Downstream after PRD complete:

- `create-epic` / `create-epics-from-shards` — generate epic files from the PRD
- `shard-prd` — if PRD becomes large

## Example Activation

```
User: "Create a PRD for a new mobile banking app"

→ new-product-prd activates
→ Delegates to create-prd with mode=greenfield
→ create-prd runs greenfield pre-flight (Project Brief check)
→ create-prd invokes create-doc + prd-template
→ Sections processed interactively with 1-9 elicitation stops
→ pm-checklist validates
→ UX Expert + Architect handoff prompts generated
→ Returns completed PRD at docs/prd.md
```
