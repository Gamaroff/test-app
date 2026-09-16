---
name: document-existing-project
description: Generate brownfield architecture documentation for existing codebases, written directly into a sharded docs/architecture/ tree (index.md + concepts/{coding-standards,tech-stack,source-tree}.md + optional shards). Documents actual code patterns, technical debt, and constraints. Use when documenting legacy systems or existing projects for enhancement or onboarding.
---

# Document an Existing Project

## Purpose

Generate comprehensive documentation for an existing project, written **directly into a sharded `docs/architecture/` tree** that downstream pipeline skills (`develop`, `create-story`, `review-story`, `qa-*`, `finalise`) consume via `devLoadAlwaysFiles`.

This skill **never** produces a monolithic `docs/brownfield-architecture.md`. The output shape is fixed by [`docs/standards/architecture-docs.md`](../../docs/standards/architecture-docs.md). A consumer who already has a monolith from older runs can split it with `/shard-doc`; this skill only generates the sharded form going forward.

**Key Focus**: Document what EXISTS, not what should exist — including technical debt, workarounds, and real-world constraints.

## When to Use This Skill

Use this skill when:
- Documenting existing/legacy codebases
- Preparing for enhancements to existing systems
- Onboarding AI agents to brownfield projects
- Capturing "tribal knowledge" that only exists in developers' heads
- Creating architecture documentation for inherited projects
- Preparing for system refactoring or modernization
- Need comprehensive codebase understanding before making changes

## Critical Philosophy

**REALITY OVER IDEALS**

This skill creates BROWNFIELD documentation that:
- ✅ Documents actual state (not aspirational)
- ✅ Captures technical debt and workarounds
- ✅ Maps real patterns (even if inconsistent)
- ✅ Identifies constraints and gotchas
- ✅ Shows what exists (including legacy code)
- ❌ Does NOT prescribe what should be
- ❌ Does NOT hide problems or debt
- ❌ Does NOT document theoretical best practices

## Workflow Process

### 1. Initial Project Analysis

**CRITICAL:** First, check if a PRD or requirements document exists in context.

#### If PRD EXISTS:
- Review the PRD to understand what enhancement/feature is planned
- Identify which modules, services, or areas will be affected
- **Focus documentation ONLY on these relevant areas**
- Skip unrelated parts of the codebase to keep docs lean
- Document with enhancement context in mind

#### If NO PRD EXISTS:

Ask the user:

"I notice you haven't provided a PRD or requirements document. To create more focused and useful documentation, I recommend one of these options:

1. **Create a PRD first** - Would you like me to help create a brownfield PRD before documenting? This helps focus documentation on relevant areas.

2. **Provide existing requirements** - Do you have a requirements document, epic, or feature description you can share?

3. **Describe the focus** - Can you briefly describe what enhancement or feature you're planning? For example:
   - 'Adding payment processing to the user service'
   - 'Refactoring the authentication module'
   - 'Integrating with a new third-party API'

4. **Document everything** - Or should I proceed with comprehensive documentation of the entire codebase? (Note: This may create excessive documentation for large projects)

Please let me know your preference, or I can proceed with full documentation if you prefer."

Based on their response:
- If they choose option 1-3: Use that context to focus documentation
- If they choose option 4 or decline: Proceed with comprehensive analysis

### 2. Deep Codebase Analysis

**CRITICAL:** Before generating documentation, conduct extensive analysis of the existing codebase.

#### Explore Key Areas

1. **Entry Points**
   - Main files (main.js, index.js, app.js, server.js)
   - Application initializers
   - Bootstrap/startup code

2. **Configuration**
   - Configuration files (config/, .env.example)
   - Environment setup requirements
   - Build and deployment configurations

3. **Dependencies**
   - Package files (package.json, requirements.txt, Cargo.toml, pom.xml, etc.)
   - Identify languages, frameworks, libraries
   - Note specific versions

4. **Structure**
   - Directory organization
   - Module/service boundaries
   - Code organization patterns

5. **Existing Documentation**
   - README files
   - docs/ folders
   - Inline documentation
   - API specs

6. **Code Patterns**
   - Sample key files to understand coding patterns
   - Naming conventions
   - Architectural approaches
   - Identify inconsistencies between different parts

#### Ask Clarifying Questions

Before documenting, elicit critical information:

- **Purpose**: What is the primary purpose of this project?
- **Complexity**: Are there any specific areas of the codebase that are particularly complex or important for agents to understand?
- **Tasks**: What types of tasks do you expect AI agents to perform? (bug fixes, features, refactoring, testing)
- **Standards**: Are there any existing documentation standards or formats you prefer?
- **Audience**: What level of technical detail should the documentation target? (junior developers, senior developers, mixed team)
- **Focus**: Is there a specific feature or enhancement you're planning? (This helps focus documentation)
- **Pain Points**: What are the most problematic or confusing parts of the system?
- **Constraints**: What can't be changed? (legacy integrations, deployed code, etc.)

#### Map the Reality

Critical to capture:
- **ACTUAL patterns used** (not theoretical best practices)
- **Where key business logic lives** (not where it "should" be)
- **Integration points** and external dependencies
- **Workarounds** and technical debt
- **Areas that differ from standard patterns**
- **Code that can't be changed** (deployed, legacy, tightly coupled)

**IF PRD PROVIDED:** Also analyze what would need to change for the enhancement.

#### Elicit Coding Standards Explicitly

The required `concepts/coding-standards.md` shard rarely falls out of code reading alone. After the patterns scan above, **explicitly elicit** the following from the user (or infer from lint/format configs and call it out as inferred):

- **Languages and idioms** — per language: version, style guide, idiomatic patterns. (`tsconfig.json`, `pyproject.toml`, etc.)
- **Naming** — filenames, directories, exported symbols, env vars.
- **Formatting and linting** — tools, config files, what is enforced in CI.
- **Organisation** — co-location rules (e.g. `foo.ts` + `foo.spec.ts`), module-public-API conventions.
- **Do-not** — anti-patterns specific to this project (deprecated packages, restricted globals, etc.).

If the project has no written standards, say so honestly in the output. Don't invent rules.

### 3. Core Documentation Generation — Sharded Output Contract

The skill writes directly into a sharded `docs/architecture/` tree. **No monolithic file is ever produced.**

#### Resolve the output base

1. Read `skills-config.yaml` at the consumer-project root.
2. Resolve `{arch}` ← `architecture.architectureShardedLocation`. Default: `docs/architecture`.
3. Ensure `{arch}/` and `{arch}/concepts/` exist on disk (create if missing).

If `skills-config.yaml` is absent, prompt the user to create one. Reference [`docs/reference/configuration.md`](../../docs/reference/configuration.md). Do not proceed without `{arch}` resolved.

#### Required shards (always written)

These three are **mandatory** and loaded by every downstream pipeline run via `devLoadAlwaysFiles`. Missing any of them breaks `develop`, `develop-story`, `develop-task`, and the reviewers.

##### `{arch}/concepts/coding-standards.md`

Frontmatter: `---\ntitle: Coding standards\nstatus: draft\n---`

Required sections (use these exact headings):

```markdown
# Coding standards

> Conventions the agent must obey when writing code in this project. Loaded into every pipeline run.

## Languages and idioms
## Naming
## Formatting and linting
## Organisation
## Do not
```

Populate from the "Elicit Coding Standards Explicitly" step. Mark inferred rules as inferred (e.g. "_Inferred from `.eslintrc.json`._").

##### `{arch}/concepts/tech-stack.md`

Frontmatter: `---\ntitle: Tech stack\nstatus: draft\n---`

Required sections:

```markdown
# Tech stack

> Runtimes, languages, frameworks, and major libraries actually in use. Loaded into every pipeline run.

## Runtimes
## Languages
## Frameworks
## Major libraries
## Build and tooling
## Infrastructure
```

Use real version numbers from lockfiles and config. Call out "actual" vs "in package.json but unused" if relevant.

##### `{arch}/concepts/source-tree.md`

Frontmatter: `---\ntitle: Source tree\nstatus: draft\n---`

Required sections:

```markdown
# Source tree

> Where things live in this repository. Loaded into every pipeline run.

## Top-level layout
## Where to put what
## Workspace boundaries  (omit if not a monorepo)
## Do not touch without a reason
```

Show a real tree (run `ls` / inspect on disk). Annotate inconsistencies and legacy areas in-line. Reference paths agents should not modify.

#### Optional shards (write when content exists)

Each optional shard lives at `{arch}/<shard-name>.md` with `---\ntitle: ...\nstatus: draft\n---` frontmatter. Only write a shard if the project has substantive content for it — empty shards add noise.

| Shard | Purpose | Skip when |
|---|---|---|
| `quick-reference.md` | Critical files, entry points, "if you only read three files" | Source tree already covers it |
| `data-models.md` | Pointers to actual model files; do not duplicate them | No persistent data layer |
| `technical-debt.md` | Critical debt, workarounds, gotchas | Project is genuinely clean (rare) |
| `integrations.md` | External services, internal integration points | No external integrations |
| `deployment.md` | Local dev setup, build, deploy environments | Standard mechanism with no quirks |
| `testing.md` | Coverage reality, how to run tests, manual QA process | Tests are standard and documented in README |
| `impact-analysis.md` | Files to modify + new files needed for the PRD's enhancement | **Only write when a PRD is in scope** |
| `appendix.md` | Frequently used commands, debugging tips, troubleshooting pointers | Nothing project-specific to add |

Use the same brownfield/REALITY tone for every shard: reference real files, name workarounds explicitly, do not invent best-practice prose.

#### Writer protocol

For each shard the analysis produced (required + applicable optional):

1. Compute target path under `{arch}/`.
2. **If file already exists:** read it, generate the new content, then **show a unified diff** of new vs existing to the user. Ask: `[overwrite / merge / skip]`.
   - `overwrite` — write new content, replacing the file entirely.
   - `merge` — present a merged candidate marking new sections clearly (e.g. `<!-- new -->`). Re-prompt to confirm before writing.
   - `skip` — leave the existing file untouched, but still include it in the index.
3. **If file is new:** write directly.
4. After processing all shards, **regenerate `{arch}/index.md`** to list every shard now present in `{arch}/`. Format follows [`docs/examples/architecture/index.md`](../../docs/examples/architecture/index.md): required-shards block, optional-shards block, See also.
5. Print a summary to the user: `written: [...]`, `merged: [...]`, `skipped: [...]`. Do not silently overwrite.

**HARD RULE:** Never write `docs/brownfield-architecture.md` or any other monolithic architecture file. If the user explicitly asks for a monolith, refuse and explain that the sharded layout is what downstream pipeline skills consume.

### 4. Quality Assurance

**CRITICAL:** Before declaring done:

1. **Accuracy** — every technical detail matches the actual codebase. Spot-check at least one claim per shard against the source.
2. **Completeness** — all three required `concepts/` shards exist and are non-trivial.
3. **Focus** — if the user provided enhancement scope, relevant areas are emphasised; `impact-analysis.md` is present.
4. **No invention** — no "best practice" prose that is not grounded in actual code or stated standards.
5. **Index hygiene** — `{arch}/index.md` links every shard present in the directory (no dangling links, no missing entries).
6. **No monolith** — `docs/brownfield-architecture.md` does not exist. If it does (legacy run), tell the user to delete it or `/shard-doc` it; do not consume it.

Apply advanced elicitation techniques after major shards to refine based on user feedback.

## Success Criteria

✅ `{arch}/index.md` exists and lists every shard present.
✅ `{arch}/concepts/coding-standards.md`, `{arch}/concepts/tech-stack.md`, `{arch}/concepts/source-tree.md` all exist and contain real content (not placeholders).
✅ Each shard reflects REALITY including technical debt and workarounds.
✅ Files and modules are referenced with actual paths; data models / APIs reference source files instead of duplicating them.
✅ If PRD provided: `impact-analysis.md` shows what needs to change.
✅ Technical constraints and "gotchas" are clearly documented in `technical-debt.md` (or inline where they belong).
✅ No `docs/brownfield-architecture.md` or other monolithic architecture file produced.
✅ Existing files were never silently overwritten (each existing target was diffed and confirmed).

## Examples

### Example 1: Brownfield E-Commerce Platform

```
User: "Document our legacy Node.js e-commerce platform — we're adding crypto payments."

Skill:
1. Sees PRD/enhancement in scope. Focuses on payment-adjacent modules.
2. Resolves {arch} = docs/architecture from skills-config.yaml.
3. Elicits coding standards (style is mixed CommonJS + some ESM; lint is loose).
4. Writes:
   - docs/architecture/index.md
   - docs/architecture/concepts/coding-standards.md
   - docs/architecture/concepts/tech-stack.md  (Node 16 actual, package.json says 18)
   - docs/architecture/concepts/source-tree.md
   - docs/architecture/integrations.md          (Stripe, PayPal, SendGrid)
   - docs/architecture/technical-debt.md        (payment service has dual code paths)
   - docs/architecture/impact-analysis.md       (crypto entry points + new wallet service)
5. Skips data-models.md (Mongoose models are well-named, source-tree covers it).
6. Prints summary: written 6, merged 0, skipped 0.
```

### Example 2: Comprehensive Documentation, No PRD

```
User: "Document our Python Flask API end-to-end. No specific enhancement planned."

Skill:
1. No PRD — asks the four-option question, user picks option 4 (everything).
2. Resolves {arch} = docs/architecture.
3. Writes the three required concepts/ shards.
4. Writes deployment.md (Docker + Heroku deployment is quirky) and testing.md (60% coverage, no E2E).
5. Skips impact-analysis.md (no PRD).
6. Existing concepts/coding-standards.md already exists from a prior partial run:
   diff shown → user picks "merge" → merged candidate written after confirmation.
7. Prints summary: written 4, merged 1, skipped 0.
```

## Notes

- This skill captures the TRUE state of the system, sharded for pipeline consumption.
- References actual files rather than duplicating their content.
- Documents technical debt, workarounds, and constraints honestly.
- For brownfield projects with a PRD: produces an `impact-analysis.md` shard showing what needs to change.
- The goal is PRACTICAL documentation that AI agents can load via `devLoadAlwaysFiles` for real work.
- Avoid aspirational language — focus on reality.
- Be honest about problems and technical debt.
- Highlight areas that can't be changed vs. areas that need improvement.
- Never write a monolithic architecture file. If the user has one from a legacy run, point them at `/shard-doc`.

## Resources

This skill references:
- [`docs/standards/architecture-docs.md`](../../docs/standards/architecture-docs.md) — the layout contract this skill satisfies.
- [`docs/examples/architecture/`](../../docs/examples/architecture/) — copy-paste skeleton showing the target shape.
- [`docs/reference/configuration.md`](../../docs/reference/configuration.md) — `skills-config.yaml` schema (`architecture.architectureShardedLocation`, `devLoadAlwaysFiles`).
- [`references/document-status-lifecycle.md`](references/document-status-lifecycle.md) — `status:` frontmatter values.

---

**Remember**: The best brownfield documentation is honest, practical, sharded for pipeline consumption, and grounded in code that actually exists — not an idealised view of the system.
