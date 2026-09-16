# Code Hygiene Reference

Code hygiene refers to surface-level issues that affect readability, maintainability, and consistency. While not always "architectural" smells, poor hygiene increases cognitive load and complicates refactoring.

---

## 1. Dead Code
**Pattern**: Unused code that remains in the codebase.

**Detection**:
- Unused exports, functions, or variables (often flagged by linters).
- "Zombie Code": Large blocks of commented-out code.
- Unreachable `if` blocks or `return` statements.

**Severity**: Medium (clutters the codebase and misleads developers).

**Solution**:
- Aggressively delete unused code. Use Git history if you need to retrieve it later.

---

## 2. Naming Inconsistency
**Pattern**: Bypassing established project naming conventions.

**Detection**:
- Mixing `camelCase`, `snake_case`, and `PascalCase` inconsistently.
- Variables with names like `data`, `tmp`, or `item` that provide no context.
- Boolean variables that don't sound like questions (e.g., `user` instead of `isUser` or `hasUser`).

**Severity**: Low/Medium (reduces readability and searchability).

**Solution**:
- Rename to follow project-specific conventions. Use descriptive, intention-revealing names.

---

## 3. Organizational Drift
**Pattern**: Placing files or logic in the wrong directory or module.

**Detection**:
- Business logic or API calls inside UI components (especially in React).
- Utility functions scattered across feature folders instead of a central `utils/` or `hooks/` directory.
- Large files containing multiple unrelated classes or components.

**Severity**: Medium (makes the project structure confusing).

**Solution**:
- Move files/logic to their appropriate architectural layer (e.g., extract logic from a Component to a Service or Custom Hook).

---

## 4. Type/Prop Mess (TypeScript/React)
**Pattern**: Unorganized or poorly defined types and props.

**Detection**:
- "Inline everything": Defining complex types directly in function signatures instead of using named `interface` or `type`.
- Overuse of optional props (`?`) when they should be mandatory.
- Lack of shared types for common data structures.

**Severity**: Medium (leads to "Type Churn" and brittle interfaces).

**Solution**:
- Extract types to named interfaces. Consolidate shared types in a `types/` directory.

---

## 5. Comment Smells
**Pattern**: Comments that add no value or hide poor code quality.

**Detection**:
- "Restating the Obvious": Comments like `// set the name` above `setName(name)`.
- Explaining *what* the code does instead of *why* it does it (the code should explain the *what*).
- Outdated comments that no longer match the code logic.

**Severity**: Low (increases noise).

**Solution**:
- Refactor the code to be self-explanatory (Rename, Extract Method). Use comments only for high-level "Why" or complex edge cases.
