---
name: create-prd
description: Create Product Requirements Documents. Default mode is brownfield (enhancements to existing projects with 4+ stories or architectural changes). Greenfield mode is invoked indirectly via the new-product-prd skill. Orchestrates create-doc, the appropriate PRD template, and pm-checklist.
invokes: [create-doc, prd-template, brownfield-prd-template, pm-checklist, mermaid-architect]
---

# PRD Creation

## When to Use This Skill

Activate this skill directly for **brownfield enhancements** to existing projects:

- Add **significant enhancements** to existing codebase (4+ stories, architectural changes)
- Integrate new **major features** into established systems
- Perform **substantial modifications** requiring comprehensive planning
- Add features that require **deep understanding** of existing architecture

**Natural activation triggers (brownfield):**

- "Add [major feature] to existing app"
- "Enhance [existing system] with..."
- "Integrate [new capability] into our..."
- "Modify [existing product] to support..."

**Decision Tree (brownfield):**

- **Large enhancement** (4+ stories, architectural changes) → Use THIS skill
- **Medium enhancement** (1-3 stories, follows existing patterns) → Use `create-epic`
- **Small change** (single session, isolated) → Use `brownfield-story`

**Do NOT use directly for:**

- Greenfield projects → activate `new-product-prd` (which delegates here with `mode=greenfield`)
- Small enhancements (use `create-epic` or `brownfield-story`)
- Bug fixes (use GitHub issues)

## Mode Parameter

This skill supports two modes. The mode determines pre-flight checks, template selection, validation depth, and which PRD sections are emitted.

**Resolve paths first.** Source `references/resolve-paths.sh` to populate `${PRD_ROOT}` (default `docs/prd`). Output paths below use this env var.

| Mode         | Default | Set by                           | Template                  | Output path                                                   |
| ------------ | ------- | -------------------------------- | ------------------------- | ------------------------------------------------------------- |
| `brownfield` | yes     | direct activation                | `brownfield-prd-template` | `${PRD_ROOT}/[domain]/prd.[feature]/prd.[feature].md`         |
| `greenfield` | no      | delegated from `new-product-prd` | `prd-template`            | `docs/prd.md` (monolithic — sharded into `${PRD_ROOT}` later) |

Throughout this skill, sections marked **(brownfield only)** or **(greenfield only)** apply to the respective mode. Sections without a mode tag run in both.

## ⚠️ Documentation-Only Scope — Do NOT Implement

This skill produces **the PRD document and its associated planning artifacts only** (epic files via subsequent skills, tracker issues, handoff prompts). It MUST NOT begin implementing any feature the PRD describes, nor scaffold any source code.

**Forbidden during this skill** (regardless of how compelling it seems):

- ❌ Editing, creating, or deleting any source file outside `${PRD_ROOT}/` or `docs/prd.md` (and the tracker-issue side effect)
- ❌ Running migrations, codegen, build, lint-fix, or refactor commands
- ❌ Creating branches, committing, or pushing code changes
- ❌ Installing/removing dependencies or modifying `package.json`
- ❌ Auto-invoking `create-epic`, `create-story`, `develop-story`, or any implementation skill on completion
- ❌ Starting "phase 1" of any epic or story to "get a head start"

**Allowed writes** (the only filesystem changes this skill may make):

- ✅ The PRD file (`${PRD_ROOT}/[domain]/prd.[feature]/prd.[feature].md` for brownfield, `docs/prd.md` for greenfield) and its directory
- ✅ Tracker issue creation if the workflow includes it
- ✅ Handoff prompt files (Architect/UX Expert) emitted as part of Step 4

**If the user asks to "create the PRD and start the first epic"**: complete the PRD (including Step 4 handoff prompts), then STOP and explicitly hand off — tell user to invoke `/create-epic` or `/create-epics-from-shards` as a separate step. Do not chain.

## Step 0: Scope Assessment (brownfield only)

Skip for `mode=greenfield` — a new product already implies large scope.

**BEFORE proceeding (brownfield only), assess enhancement complexity:**

1. **Can this be completed in 1-2 focused development sessions?**
   - YES → Recommend `brownfield-story` instead
   - NO → Continue with this skill

2. **Does this require architectural changes or 4+ stories?**
   - NO → Recommend `create-epic` instead
   - YES → Continue with this skill

3. **Is comprehensive planning required?**
   - NO → Recommend simpler approach
   - YES → Continue with this skill

**Communicate assessment:**

```
"Based on the complexity you've described, this appears to be a
[large/medium/small] enhancement. For this scope, I recommend using
[create-prd/create-epic/brownfield-story] because [rationale]."
```

## Prerequisites

### Brownfield mode

1. **Existing Project Analysis** (CRITICAL):
   - Check if `document-existing-project` was already run
   - If YES → Use existing analysis
   - If NO → Strongly recommend running `document-existing-project` first
   - Benefits: Tech stack documentation, architecture overview, technical debt assessment, API docs

2. **Project Context** (ESSENTIAL):
   - IDE with project already loaded (preferred), OR
   - User-provided project information
   - Existing documentation in `docs/` folder

3. **Deep Understanding Requirement**:
   - MUST thoroughly analyze existing project structure, patterns, constraints
   - Every recommendation MUST be grounded in actual project analysis (not assumptions)
   - Confirm understanding with user before ANY suggestions

### Greenfield mode

1. **Project Brief** (strongly recommended) — problem statement, target users, success metrics, MVP scope, constraints
2. **Market Research** (optional) — competitive analysis, user research, market context
3. **Business Goals** (essential) — why building, what success looks like, timeline

If Project Brief is missing, the template will guide gathering this during the Goals section, but creating a brief first is more efficient.

## Workflow Overview

```
1. Pre-Flight Check & Analysis
   ├─ (brownfield) Continuation detection, document discovery,
   │   document-existing-project check, scope, project analysis
   └─ (greenfield) Project Brief check, optional deep-research-prompt

2. Interactive PRD Creation
   ├─ Activate create-doc with template (mode-selected)
   ├─ Process sections (mode-conditional subsections)
   └─ Save to output path (mode-selected)

2.5 Visual Architecture Diagram (conditional, via mermaid-architect)

3. Quality Validation
   ├─ pm-checklist (both modes)
   └─ (brownfield) 4 targeted requirement-quality checks

4. Next Steps & Handoff
   ├─ UX Expert prompt (if UI)
   ├─ Architect prompt
   └─ (brownfield) Integration testing & rollback guidance
```

## PRD Frontmatter (OKF conformance)

The PRD's YAML frontmatter (written during "Interactive PRD Creation") must include OKF v0.1 fields: a non-empty `type: prd` (OKF's one hard requirement), a one-sentence `description` (OKF-recommended), and optional `tags`. These sit alongside the existing `name`, `title`, `mode`, `status`, `version`, `created` fields. See [prd-documents.md](../../docs/standards/prd-documents.md) and [OKF conformance](references/open-knowledge-format.md).

## Detailed Execution Steps

### Step 1: Pre-Flight Check & Analysis

#### Greenfield branch (mode=greenfield)

**1a. Project Brief check:**

1. Ask if Project Brief exists
2. If NO:
   - **Strongly recommend** creating Project Brief first (essential foundation, clearer scope, better PRD)
   - If user insists on PRD without brief, proceed but note this in the PRD
3. If brief exists:
   - Request brief location/content and review

**1b. Market validation:**

- If uncertain about market fit → recommend `deep-research-prompt`
- If confident → proceed to PRD creation

**Example dialog:**

```
"Do you have a Project Brief for this product? It provides essential
foundation (problem statement, target users, success metrics, MVP scope,
constraints). Creating a brief first will make the PRD process much smoother.

If no brief exists, I can still create the PRD, but we'll need to gather
that foundational information as we go."
```

Skip to Step 2 once pre-flight complete.

#### Brownfield branch (mode=brownfield, default)

**1a. Continuation Detection (check FIRST):**

Before anything else, scan for an existing in-progress PRD for this feature:

- Check `${PRD_ROOT}/` and subdirectories for any PRD file related to the enhancement being discussed
- If found, read it and check its `stepsCompleted` frontmatter field (or infer completion from section headings)
- If a PRD is found, determine whether it is incomplete or complete, then report to the user:

**If incomplete:**

```
"I found an existing PRD at [path] that appears to cover [topic].
It looks like [sections X, Y were completed / it was started but not finished].

Options:
[R] Resume — Continue from where it left off
[S] Start fresh — Create a new PRD (existing file will be overwritten)
[V] View — Show me the existing PRD first

What would you like to do?"
```

**If complete (all sections present):**

```
"I found a completed PRD at [path] covering [topic].

Options:
[E] Extend — Add a new epic area to this PRD
[R] Revise — Edit or update an existing section
[S] Start fresh — Create a new PRD
[V] View — Show me the existing PRD first

What would you like to do?"
```

Wait for user selection before proceeding.

**1b. Active Input Document Discovery:**

Scan the project for existing reference documents before asking the user for anything:

- `*brief*.md` — Product or feature briefs
- `*research*.md` — Research or analysis documents
- `${PRD_ROOT}/**` — Prior PRD artefacts
- `docs/project-context.md` — Project context (loaded automatically)
- `${ARCH_ROOT}/**` — Architecture documentation

Report findings:

```
"I found the following reference documents:
- Product briefs: [list or 'none found']
- Research docs: [list or 'none found']
- Project context: [list or 'none found']
- Architecture docs: [list or 'none found']

I'll use these to inform the PRD. Are there any other documents
you'd like me to include before we begin?"
```

Load all confirmed documents before proceeding.

**1c. Check for document-existing-project Output:**

```
"Have you run document-existing-project on this codebase? It provides:
- Complete tech stack documentation
- Architecture overview
- API documentation
- Technical debt assessment
- Coding standards

If not available, I STRONGLY recommend running it first for better
enhancement planning."
```

**1d. Analyze Existing Project:**

**If document-existing-project available:**

- Extract from "High Level Architecture" section
- Review "Technical Summary"
- Note "Technical Debt and Known Issues"
- Reference "Workarounds and Gotchas"

**Otherwise:**

- Explore project structure (directories, key files)
- Identify tech stack (languages, frameworks, database)
- Understand architecture patterns
- Note integration points
- Identify technical debt

**1e. Confirm Understanding (CRITICAL):**

For every assumption made about existing project:

```
"Based on my analysis, I understand that [assumption].
Is this correct?"
```

**Examples:**

- "I see you're using NestJS with PostgreSQL and Prisma"
- "Your authentication uses JWT with Passport.js"
- "The codebase follows a modular monolith architecture"

**Do NOT proceed until user validates understanding.**

### Step 2: Interactive PRD Creation

#### Greenfield invocation (mode=greenfield)

```
Use create-doc skill with:
- Template: prd-template (resources/prd-tmpl.yaml)
- Output: docs/prd.md
- Mode: Interactive (default)
```

#### Brownfield invocation (mode=brownfield)

```
Use create-doc skill with:
- Template: brownfield-prd-template (resources/brownfield-prd-tmpl.yaml)
- Output: ${PRD_ROOT}/[domain]/prd.[feature]/prd.[feature].md
- Mode: Interactive (mandatory for brownfield)
```

**Section-by-Section Process:**

#### Section 1: Goals, Background, and Project Analysis

**Greenfield (mode=greenfield):**

- **Goals:** Bullet list of desired outcomes
- **Background:** 1-2 paragraphs on what this solves and why
- **Change Log:** Version tracking table
- **Source:** Project Brief if available, otherwise elicit from user
- **No mandatory elicitation** (but can ask clarifying questions)

**Brownfield (mode=brownfield) — Intro Project Analysis and Context:**

**1a. Existing Project Overview:**

- Analysis Source (document-existing-project output | IDE analysis | user-provided)
- Current Project State (what it does, primary purpose)

**1b. Available Documentation Analysis:**

- If document-existing-project run → Reference existing docs
- Otherwise → Check for: Tech stack, architecture, API docs, UI guidelines, technical debt

**1c. Enhancement Scope Definition:**

- Enhancement Type (New Feature | Major Modification | Integration | Performance | UI/UX Overhaul | Stack Upgrade | Bug Fix)
- Enhancement Description (2-3 sentences)
- Impact Assessment (Minimal | Moderate | Significant | Major)

**1d. Goals and Background Context:**

- Goals (bullet list of desired outcomes)
- Background (why needed, what problem solved, how fits with existing project)
- Change Log (version tracking)

**No mandatory elicitation** (but confirm understanding)

#### Section 2: Requirements (MANDATORY ELICITATION)

**Both modes — Functional and Non-Functional Requirements:**

**Functional Requirements (FR):**

- What the product/enhancement must do
- Testable, WHAT not HOW, MVP-scoped
- **Brownfield emphasis:** integration with existing functionality

**Non-Functional Requirements (NFR):**

- Specific metrics ("< 200ms response time" not "fast response")
- **Brownfield emphasis:** must respect existing system performance characteristics

**Compatibility Requirements (CR) — (brownfield only) CRITICAL:**

- CR1: Existing API compatibility
- CR2: Database schema compatibility
- CR3: UI/UX consistency
- CR4: Integration compatibility

**Process:**

1. Draft requirements based on validated understanding (brownfield) or goals (greenfield)
2. Present with detailed rationale (trade-offs, assumptions)
3. **STOP — Present 1-9 elicitation options**
4. Wait for user response
5. Iterate based on feedback

**❌ Do NOT proceed if:**

- Any FR uses vague language without measurable criteria (e.g., "fast", "easy", "intuitive")
- Any FR prescribes implementation technology (e.g., "use React component X") instead of capability
- NFRs lack specific metrics
- **(brownfield)** Compatibility Requirements (CR) section is absent or incomplete

#### Section 3: UI Design / UI Enhancement Goals (conditional)

**Condition:** Only if PRD has UX/UI requirements.

**Greenfield — UI Design Goals (MANDATORY ELICITATION):**

- Overall UX Vision
- Key Interaction Paradigms
- Core Screens and Views (conceptual)
- Accessibility (None|WCAG AA|WCAG AAA)
- Branding
- Target Platforms

Pre-fill with educated guesses, clearly indicate assumptions, STOP for 1-9 elicitation.

**Brownfield — UI Enhancement Goals (no mandatory elicitation):**

- Integration with existing UI patterns
- Design system consistency
- Modified/new screens only (not complete redesign)
- UI consistency requirements

#### Section 4: Technical Constraints / Technical Assumptions

**Greenfield — Technical Assumptions (MANDATORY ELICITATION):**

- Repository Structure (Monorepo|Polyrepo)
- Service Architecture (Monolith|Microservices|Serverless)
- Testing Requirements (Unit|Integration|Full Pyramid)
- Additional Technical Assumptions (languages, frameworks, libraries, deployment)

Present with rationale, STOP for 1-9 elicitation. Document ALL choices with rationale — these become constraints for the Architect.

**Brownfield — Technical Constraints and Integration Requirements** (replaces separate architecture documentation):

- **Existing Technology Stack** — extract from document-existing-project, include versions
- **Integration Approach** — database, API, frontend, testing strategies
- **Code Organization and Standards** — patterns, file structure, naming, conventions
- **Deployment and Operations** — build, deployment, monitoring, configuration
- **Risk Assessment and Mitigation** — technical debt, integration risks, deployment risks, mitigations

#### Section 5: Epic List / Epic and Story Structure (MANDATORY ELICITATION)

**Principle:** PRDs are living documents. Assess complexity honestly — multiple epics improve parallelism, reduce coupling, and make delivery more manageable. Do not default to a single epic.

**Step 1 — Complexity Assessment:**

Score the PRD against these 6 signals. Each signal present = 1 point:

| Signal                      | Description                                                                    |
| --------------------------- | ------------------------------------------------------------------------------ |
| **Domain breadth**          | PRD spans 2+ distinct functional areas (e.g. auth + notifications + data sync) |
| **Parallelism opportunity** | Areas can be worked simultaneously by independent streams                      |
| **Story volume**            | Likely 8+ stories total (target 3–6 stories per epic)                          |
| **Dependency isolation**    | Areas have minimal cross-dependencies and can ship independently               |
| **Risk isolation**          | One area is high-risk and should be isolated to contain impact                 |
| **Timeline variance**       | Different areas have different urgency or delivery milestones                  |

**Scoring:**

- **0–2 signals** → Single epic is appropriate; document rationale
- **3+ signals** → Propose multiple epics, one per functional area

**Step 2 — For multiple epics:**

1. Propose a named epic breakdown mapping each epic to a PRD functional area
2. Show which stories belong to each epic
3. Identify cross-epic dependencies (if any) and sequencing constraints
4. Present as: _"I recommend [N] epics because [signal list]. Here is the proposed breakdown: [epic list with rationale]."_

> **Do not artificially collapse into 3 epics if 4+ functional areas exist.** Merging distinct functional areas inflates story count beyond the 3–6 target, increases coupling, and eliminates parallelism opportunities.

**Example — 4-epic breakdown:**

A PRD covering authentication, notifications, data sync, and reporting spans 4 distinct functional areas. Collapsing "data sync" and "reporting" into one epic just to stay at 3 epics defeats the purpose of the breakdown. Correct split:

| Epic | Functional Area | Rationale |
|------|-----------------|-----------|
| Epic 1 | Authentication & Identity | Foundation; other epics depend on it |
| Epic 2 | Notifications | Isolated delivery channel; parallel-workable after Epic 1 |
| Epic 3 | Data Sync | Backend-heavy; independent of notification UI |
| Epic 4 | Reporting & Analytics | Read-only layer; depends on Epic 3 data model |

Each epic is independent enough for a separate stream, targets 3–6 stories, and delivers testable value on its own.

**Step 3 — For single epic (must justify):**

If 0–2 signals, document explicitly: _"This PRD scores [N]/6 on the complexity rubric. A single epic is appropriate because [reason]."_

**Greenfield Epic 1 rule:** Epic 1 = Foundation + initial functionality. Subsequent epics build incrementally. Cross-cutting concerns flow through epics. Epics deliver deployable, testable value.

**Step 4 — Elicitation:**

5. **STOP — Present 1-9 elicitation options**
6. Wait for user response before proceeding

**Epic Approach Documentation:**

- Epic breakdown with named epics and their scope
- Complexity signal score and rationale
- Cross-epic dependency map (if multiple epics)

**PRD Extensibility (brownfield):**

PRDs grow over time — it is expected and normal to add new epics as scope evolves. When working with an existing PRD:

- Check if the user's intent is to **extend** an existing PRD (add a new epic area) rather than create from scratch
- If extending: append the new epic to the existing PRD's Epic and Story Structure section; do not re-create the whole PRD
- The continuation detection step (1a) must offer an **Extend** option for completed PRDs
- **Record the extension in the PRD's `### Change Log`** — appending an epic changes the PRD's scope,
  so it must leave a trace. Append one row (never edit an existing one) and bump the PRD's frontmatter
  `updated:` in the same edit. Canonical format: `references/document-change-log.md` —
  append-only, newest last, four columns. Leave `Version` blank for this machine-written row:

  ```markdown
  | {today} |  | Epic {N} appended | create-prd |
  ```

  PRDs keep the log nested as `### Change Log` under §1 — do not promote it to `## `.

**IMPORTANT — Epic Numbering:**
When epic files are created from this PRD, they will be assigned **globally unique** epic numbers from the system registry (`/docs/development/epic-registry.md`). In the PRD, refer to epics as "Epic 1", "Epic 2", etc. (relative numbers), but the actual epic files will use system-wide unique numbers like `epic.163.md`, `epic.164.md`, etc. This ensures no duplicate epic numbers across the entire project.

#### Section 6: Epic Details (MANDATORY ELICITATION per epic, REPEATABLE)

**Both modes — Story structure:**

```
As a [user type],
I want [action],
So that [benefit].
```

- **Acceptance Criteria:** testable, comprehensive
- **Logical sequencing** within epic
- **AI-agent-sized** (2-4 hours)
- **Vertical slices** delivering clear value

**Brownfield — Story sequencing rules (additional):**

- Stories MUST ensure existing functionality remains intact
- Each story MUST include verification that existing features still work
- Stories sequenced to minimize risk to existing system
- Include rollback considerations for each story
- Focus on incremental integration (not big-bang changes)
- Size for AI agent execution in existing codebase context

**Confirmation Required (brownfield):**
"This story sequence is designed to minimize risk to your existing system. Does this order make sense given your project's architecture and constraints?"

**Integration Verification (IV) — (brownfield only):**

- IV1: Existing functionality verification
- IV2: Integration point verification
- IV3: Performance impact verification

**Process:**

1. Draft complete epic with all stories
2. Present with rationale (greenfield: vertical-slice / value; brownfield: risk minimization)
3. **STOP — Present 1-9 elicitation options**
4. Wait for user response
5. Refine based on feedback

**❌ Do NOT proceed if:**

- Acceptance criteria are not independently testable
- **(brownfield)** Any story lacks Integration Verification (IV) criteria
- **(brownfield)** Story sequence has a step that modifies existing behaviour before verifying current behaviour still works
- **(brownfield)** No rollback consideration is documented for any story that modifies shared infrastructure (DB schema, APIs, auth)

### Step 2.5: Visual Architecture Diagram (conditional, via `mermaid-architect`)

**When to invoke:** if the PRD describes a new system topology, multi-actor flow, or non-trivial integration that would be clearer as a picture than as prose.

**Rule:** a Mermaid diagram is **mandatory only if it enhances understanding** of the spec. Do not pad the PRD with diagrams. If the prose already conveys the structure clearly, skip this step and note "no diagram justified" in the rationale.

**Process:**

1. Invoke `mermaid-architect` with: PRD path, the section being diagrammed (typically "Technical Constraints and Integration Requirements" or a new System Topology subsection), and a list of known integrations / external systems.
2. The skill will run its Discovery & Inquiry Protocol and may halt to ask clarifying questions about error states, actor ambiguity, or missing triggers — answer these inside this step before continuing.
3. The skill returns a Mermaid block (with YAML metadata header) plus a 2-sentence "Architectural assumptions" summary. Paste both into the PRD section.
4. For PRDs, the diagram type is normally **C4 Context / System Topology** (`flowchart` with subgraphs by C4 layer). Do not silently substitute another type.

**Diagram is justified when** any of these are true: 4+ external systems are involved, the PRD introduces a new service boundary, the integration approach has >2 alternatives worth contrasting, or a sibling PRD already uses a topology diagram and consistency matters.

### Step 3: Quality Validation

**Both modes:**

1. Offer to output full PRD
2. Run `pm-checklist` validation
3. Address blockers
4. Insert results into Checklist Results section

**Brownfield-only additional validation:**

- Verify compatibility requirements comprehensive
- Ensure integration approach sound
- Validate risk assessment includes technical debt
- Confirm story sequencing minimizes existing system risk

**Targeted requirement quality checks (brownfield only — run after pm-checklist):**

Run each check sequentially and report findings before proceeding:

**Check 1 — Measurability:**
Scan every FR for vague adjectives: "easy", "fast", "simple", "intuitive", "user-friendly", "seamless", "quick", "efficient" (without accompanying metrics). Flag each occurrence. Scan every NFR for missing numeric criteria (must have a specific metric, e.g. "< 2s" not "fast"). Report: `[PASS] All requirements measurable` or `[FAIL] Found N vague requirements: [list]`

**Check 2 — Implementation Leakage:**
Scan FRs and NFRs for technology names that prescribe implementation rather than capability: framework names (React, Redux, Prisma), library names, data structure names (JSON, array), cloud provider names (AWS, S3). Exception: names that ARE the capability (e.g. "WebSocket", "GraphQL"). Report: `[PASS] No implementation leakage` or `[FAIL] Found leakage in: [list]`

**Check 3 — Traceability:**
For each FR, verify it can be traced to at least one stated Goal in Section 1d. An FR with no goal justification is a scope risk. Report: `[PASS] All FRs traceable to goals` or `[WARN] N FRs lack clear goal traceability: [list]`

**Check 4 — NFR SMART Criteria:**
Each NFR must be: Specific (named metric), Measurable (number or threshold), Achievable (grounded in existing system context), Relevant (explains who it affects), Time-bound or Condition-bound (when it applies). Flag NFRs missing two or more of these. Report: `[PASS] NFRs are SMART` or `[FAIL] N NFRs are not SMART: [list]`

Report total: `Quality checks: X/4 passed`. Address any FAILs before proceeding to next steps.

### Step 4: Next Steps — CRITICAL / BLOCKING

**Always execute this step.** Do not end the skill after Step 3 validation. The handoff prompts are a required output — the PRD is not complete until they are generated.

**Generate handoff prompts (both modes):**

- UX Expert Prompt (if UI)
- Architect Prompt

**Brownfield-specific guidance:**

- Architect prompt emphasizes integration with existing architecture
- Integration testing strategy
- Rollback procedures
- Monitoring for existing functionality
- Gradual rollout approach

## Key Principles

### Both modes

- **MVP-first** — scope to deliverable value, not exhaustive feature list
- **Logical sequencing** — Epic 1 establishes foundation, subsequent epics build incrementally
- **AI-agent-sized stories** — 2-4 hours each, vertical slices with clear acceptance criteria

### Greenfield-specific

- **Collaborative Creation** — section-by-section elicitation; user owns scope decisions
- **Documented assumptions** — every technical choice carries rationale for the Architect

### Brownfield-specific

- **Deep Understanding Required** — analyze, don't assume; confirm every assumption with user; respect existing patterns
- **Compatibility First** — backward compatibility mandatory; integration verification explicit; sequence stories for lowest risk
- **Incremental Integration** — no big-bang changes; rollback considerations; each story validates existing system integrity
- **Technical Debt Awareness** — acknowledge existing debt; plan mitigation; don't make debt worse

## Integration with Other Skills

**This skill orchestrates:**

- `create-doc` — Document creation engine
- `prd-template` — Greenfield PRD structure (mode=greenfield)
- `brownfield-prd-template` — Brownfield PRD structure (mode=brownfield)
- `pm-checklist` — Quality validation
- `mermaid-architect` — System Topology / C4 Context diagram when justified

**This skill may recommend:**

- `deep-research-prompt` — Before greenfield PRD if market validation needed
- `document-existing-project` — Before brownfield PRD if existing project analysis missing
- `shard-prd` — If PRD becomes large
- `create-epics-from-shards` — After sharding

**Wrapper / entry-point skills:**

- `new-product-prd` — Greenfield entry point; delegates here with `mode=greenfield`

## Success Criteria

**Both modes:**

1. **Comprehensive Requirements** — FRs (capability-focused), NFRs (with metrics)
2. **Appropriate Epic Structure** — 6-signal complexity assessment completed; multiple epics proposed when 3+ signals present
3. **Quality Validated** — pm-checklist passed; Checklist Results inserted
4. **Clear Handoffs** — Architect prompt; UX Expert prompt if applicable

**Brownfield additional:**

5. **Deep Project Understanding** — existing architecture analyzed; tech stack documented; technical debt assessed; integration points identified
6. **Compatibility Requirements** — backward compatibility ensured (CR1–CR4)
7. **Risk-Aware Planning** — technical debt incorporated; integration/deployment risks identified; mitigations defined; rollback procedures planned
8. **Incremental Story Sequencing** — stories minimize risk; Integration Verification (IV1–IV3) explicit; gradual rollout; existing functionality protected
9. **Brownfield Quality Checks** — 4 targeted checks passed (measurability, leakage, traceability, SMART NFRs)
10. **Brownfield Handoff** — Architect prompt is integration-focused; integration testing guidance included

## Example Activations

**Brownfield (direct activation):**

```
User: "Add biometric authentication to our existing mobile banking app"

→ create-prd activates (mode=brownfield, default)
→ Continuation detection, document discovery, document-existing-project check
→ Analyzes existing authentication system
→ Confirms understanding with user
→ Uses create-doc + brownfield-prd-template
→ Emphasizes compatibility requirements
→ Sequences stories for minimal risk
→ Validates with pm-checklist + 4 targeted checks
→ Returns complete brownfield PRD
```

**Greenfield (delegated via new-product-prd):**

```
User: "Create a PRD for a new mobile app"

→ new-product-prd activates
→ Delegates to create-prd with mode=greenfield
→ Project Brief check + optional deep-research-prompt
→ Uses create-doc + prd-template
→ No brownfield-only sections emitted
→ Validates with pm-checklist
→ Returns complete greenfield PRD at docs/prd.md
```

## Common Pitfalls to Avoid

❌ **Vague requirements** — "Fast", "easy", "intuitive" are not requirements; replace with measurable criteria
❌ **Implementation leakage** — FRs describe capability, not implementation; no technology names in requirements
❌ **Defaulting to a single epic** — Always run the complexity assessment; complex PRDs warrant multiple epics
❌ **Artificially collapsing epics** — If 4+ functional areas exist, do not merge them into 3 epics to appear concise; each distinct functional area warrants its own epic

**Brownfield additional:**

❌ **Assuming project structure** — Must analyze, not guess
❌ **Ignoring technical debt** — Known issues impact enhancement planning
❌ **Big-bang integration** — Incremental approach reduces risk
❌ **Skipping compatibility requirements** — Backward compatibility critical
❌ **Not validating understanding** — Confirm assumptions before proceeding
❌ **Recommending full PRD for small changes** — Use create-epic or brownfield-story for simpler enhancements
❌ **Starting fresh without checking for existing PRD** — Always check for incomplete in-progress work first
❌ **Ignoring existing reference documents** — Scan for briefs, research, context docs before asking the user
❌ **Forcing all epics upfront** — PRDs are living documents; epics can be added as scope evolves

✅ **Run the 6-signal complexity assessment before proposing epic structure**
✅ **Propose multiple epics when 3+ complexity signals are present**
✅ **Validate quality with pm-checklist (both modes) AND the 4 targeted checks (brownfield)**

**Brownfield additional:**
✅ **Check for existing PRD before starting (offer Extend for completed PRDs)**
✅ **Scan and load all discoverable reference documents first**
✅ **Analyze existing project thoroughly**
✅ **Confirm understanding at every step**
✅ **Emphasize compatibility and integration**
✅ **Sequence stories for risk minimization**

## Notes

- Brownfield PRDs require more upfront analysis than greenfield
- For brownfield, always recommend `document-existing-project` if not already run
- Compatibility Requirements and Integration Verification sections are brownfield-only
- Story sequencing for risk minimization is brownfield-critical
- Technical debt must be incorporated into brownfield planning
- Greenfield delegation source is always `new-product-prd` — users should not be told to invoke this skill directly with `mode=greenfield`
