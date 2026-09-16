---
name: test-it
description: Universal autonomous test investigator, environment orchestrator, QA checklist executor, test author, and testing stack architecture documenter.
argument-hint: [feature description, module path, or path to a QA checklist/matrix file]
---

# Universal Autonomous Feature & Matrix Testing Protocol (`test-it`)

Target / Input: **$ARGUMENTS**

Execute the following 8 phases sequentially:

---

### Phase 1: Input Classification & Environment Discovery

1. **Classify Input Type:**
   - **Mode A: Matrix / Checklist Document (`.md`, `.json`, `.yaml`):** The input targets a structured test guide or QA checklist. Parse the document dynamically for:
     - Prerequisites & setup commands (e.g., container compose files, database migrations, seed commands, environment variables).
     - Persona accounts & roles defined in tables or text (extracting usernames/emails, roles, and scope).
     - Checklist items or test criteria with status indicators (e.g., `- [ ]`).
     - Staged execution flows (e.g., beginner to power-user to admin).
   - **Mode B: Feature / Module Instruction:** A targeted string or path (e.g., `feature-name`, `path/to/module`). Inspect `git status`, recent commits, or codebase references to isolate the implementation files.

2. **Stack & Workspace Inspection:**
   - Detect project topology: Monorepo (Nx, Turborepo, pnpm workspaces, Cargo workspaces, Go multi-module) or standalone repository.
   - Detect manifests: `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `pom.xml`, `build.gradle`, `CMakeLists.txt`, etc.
   - Detect existing test tooling & multi-faceted infrastructure: Playwright, Cypress, Vitest, Jest, Pytest, Go test, Cargo test, Maestro, Detox, Docker services, mock API servers, etc.
   - Detect existing architectural docs: Check existing docs and directory structures (e.g., `docs/architecture/`, `docs/testing/`, `ARCHITECTURE.md`, `TECH_STACK.md`, etc.) to determine where updates should be made.

---

### Phase 2: Environment Provisioning & Auto-Configuration

Before executing tests, verify and configure runtime prerequisites using existing project tools:
1. **Containerized Services & Mock Daemons:**
   - Detect required services (databases, caches, mock APIs, message queues) via Docker Compose or configuration files.
   - Inspect container state (`docker compose ps`). If containers are defined but stopped, run `docker compose up -d --wait`.
2. **Database & Schema State:**
   - If the checklist or repository defines migration or seeder commands (e.g., running ORM migrations or custom seed scripts), verify database connectivity and run the required initialization commands.
3. **Environment Flags & Variables:**
   - Check if required test environment files exist (e.g., `.env.test`, `.env.local`).
   - If sample files exist (e.g., `.env.example`, `.env.demo.example`), safely merge or append required flags without overwriting existing local credentials.
4. **Browser & Native Binaries:**
   - For browser automation (e.g., Playwright): Ensure required browser binaries are present (`npx playwright install --with-deps` or equivalent).
   - Verify local application endpoints or development servers are reachable prior to initiating UI tests.

---

### Phase 3: Methodology Selection & Persona Orchestration

1. **Work Within Existing Infrastructure & Best Practices:**
   - Formulate a test strategy strictly using the project's existing testing stack, tooling, and conventions.
   - Do NOT introduce redundant testing frameworks or deviate from established project best practices.
2. **Multi-Faceted Testing Infrastructure Strategy:**
   - Recognize that comprehensive testing of a feature often requires multi-faceted infrastructure operating in concert (e.g., backend services, API contract checks, frontend UI runners, database containers, mock external gateways, and cross-boundary event messaging).
   - Map all relevant infrastructure facets into a unified testing strategy to ensure full end-to-end verification across every architectural tier.
3. **Dynamic Persona & Role Handling:**
   - If the checklist specifies test accounts (e.g., `user@example.com`, `admin@example.com`), extract credentials dynamically from the input document or local test fixtures.
   - Reuse authenticated sessions/storage states across tests to prevent repetitive login overhead.
4. **Methodology Selection Matrix:**
   - Evaluate the optimal test levels across the multi-faceted architecture:

| Target Surface | Selected Strategy | Rationale & Trade-Offs |
| :--- | :--- | :--- |
| **User Interfaces & Workflows** | E2E Browser / Device runner | High fidelity for DOM state, permissions, cross-window messaging, and storage. |
| **APIs & Backend Services** | Integration / HTTP test runner | Fast verification of contracts, auth boundaries, payload validation, and data persistence. |
| **Isolated Domain Logic** | Unit / Contract tests | High execution speed and determinism for mathematical, state machine, or parsing logic. |
| **Multi-Service Systems** | Orchestration / E2E Integration | Full verification of service interaction, background processing, and database mutations. |

---

### Phase 4: Target & Test Authoring Strategy

1. **Leverage Existing Coverage:**
   - Locate existing test files associated with the target feature across all relevant infrastructure layers.
   - Execute relevant scoped tests first using native runners.
2. **Author Missing Test Cases within Existing Stack:**
   - When checklist items or feature scenarios lack automated test coverage, write test files matching the repository's existing structure, co-location rules, and coding standards.
   - **For Protocol & Sandbox Boundaries:** Assert cross-frame communication, origin validation, event emission, and data persistence.
   - **For Dynamic Views:** Assert both populated states and empty/zero-state views.
   - **Verification Tiers:**
     - **Golden Path:** Standard end-to-end success scenarios.
     - **Boundary Conditions:** Max payload limits, zero values, special characters, and null fields.
     - **Negative & Fault Scenarios:** Unauthenticated access, permission denials, network failures.
3. **Infrastructure Gap Assessment & Improvement Suggestions:**
   - Evaluate whether existing multi-faceted test tooling, mock servers, or test fixtures have limitations or missing capabilities required for full, comprehensive verification.
   - Formulate concrete, actionable suggestions on how to enhance the existing infrastructure without creating parallel or conflicting setups.

---

### Phase 5: Test Execution & Triaging

1. **Targeted Execution:**
   - Run tests scoped specifically to the designated feature, section, or persona flow using established CLI commands.
2. **Triaging Failures (No False Passes):**
   - **Test Setup Issue:** Missing seed records, unstarted dependencies, or timing races. Correct the test setup or wait condition and retry.
   - **Application Defect:** The behavior contradicts expected outcomes.
     - **Rule:** Do NOT modify application source code unless explicitly instructed.
     - **Rule:** Do NOT weaken assertions to force a test pass.
     - Document the failing line, returned status, and execution trace.

---

### Phase 6: Checklist Updating (Matrix Mode Only)

When executing against a checklist file:
- For every passing test criterion, update the markdown checkbox in-place from `- [ ]` to `- [x]`.
- For failing criteria, leave the checkbox unchecked (`- [ ]`) and record an inline note or failure appendix detailing the error.

---

### Phase 7: Testing Stack Documentation & Architectural Sync

To ensure the repository's architectural documentation remains accurate, actionable, and aligned:
1. **Document Location & Alignment:**
   - Inspect existing architecture and testing documentation (e.g., `docs/architecture/stack.md`, `ARCHITECTURE.md`, `docs/testing/testing-stack.md`).
   - Determine where appropriate updates should be made based on existing directory structures. If an overarching stack document exists, update its Testing section. If not, generate or update a dedicated `docs/testing/testing-stack.md`.
2. **Testing Stack Document Content:**
   Ensure all multi-faceted test implementations, strategies, and infrastructure improvement suggestions are thoroughly documented, detailing:
   - **Harness & Framework Matrix:** Frameworks used per tier (Unit, Integration, E2E, Contract, Sandbox/PostMessage, Multi-Service).
   - **Infrastructure & Dependencies:** Required containers, service ports, background daemons, mock servers, and browser automation drivers.
   - **Data Setup & Fixtures:** Migration commands, seed workflows, and fixture strategies.
   - **Personas & Auth States:** Documented test roles, permission scopes, and authentication persistence strategies (e.g., storage states).
   - **Execution Cheatsheet & Strategy:** Scoped CLI commands for developers/CI and identified infrastructure gaps with recommendations.

---

### Phase 8: Final Execution Report

Provide a clear markdown summary:
- **Scope Tested:** Feature name, module path, or checklist sections evaluated.
- **Environment & Multi-Faceted Infrastructure State:** Containers checked, mock services verified, seeds run, and configurations validated.
- **Infrastructure Gaps & Suggestions:** Any identified limitations in existing test tooling and recommendations to improve comprehensive coverage.
- **Documentation Updated:** Path to updated or generated testing stack architecture documentation.
- **Results:** Number of passing checks versus failing checks.
- **Defects & Gaps Found:** Concrete details on any caught bugs, schema mismatches, or unhandled edge cases.
