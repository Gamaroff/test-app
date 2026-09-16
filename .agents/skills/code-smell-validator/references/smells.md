# Code Smells Reference

For each code smell, identify the pattern, assess its severity, and consider the proposed solution.

## Severity & Contextual Modifiers
The base severity of a smell (Low, Medium, High, Critical) should be adjusted based on **environmental context** gathered via MCP or Git history:

- **Bug Churn**: Increase severity (e.g., Medium → High) if the file/class is associated with frequent bug reports or support tickets in **GitHub/Jira**.
- **High Activity**: Increase severity if the file has high commit churn (verified via `analyze_churn.sh`).
- **Architectural Alignment**: Increase severity if the smell directly violates architectural guardrails or ADRs found in project **Documentation**.
- **Test Safety**: Increase severity if the smell exists in a file with low test coverage (verified via `check_coverage.sh`), as it represents a "hidden" risk.

---

## 1. Long Method
**Pattern**: A method or function that is difficult to understand at a glance due to its length or complexity.

**Detection**:
- More than 20–30 lines of code.
- More than 2 levels of nested blocks (if, for, while).
- Mixed levels of abstraction (e.g., handling low-level I/O and high-level logic in one place).
- Cyclomatic complexity higher than 5–10.

**Severity**: Medium (reduces readability and testability).

**Solutions**:
- **Extract Method/Function**: Break into smaller, well-named pieces.
- **Replace Temp with Query**: Replace local variables with small private methods.

---

## 2. Large Class
**Pattern**: A class that has too many responsibilities (violating the Single Responsibility Principle).

**Detection**:
- More than 300 lines of code.
- Cannot describe its primary purpose in a single, simple sentence.
- More than 10-15 public methods or many private helper methods.
- Changes for multiple unrelated reasons (Divergent Change).

**Severity**: High (makes code harder to understand and maintain).

**Solutions**:
- **Extract Class**: Split into two or more cohesive classes.
- **Extract Value Object**: Group related data and behavior into a small immutable object.
- **Extract Decorator**: Move optional or additional behavior into a decorator.

---

## 3. Feature Envy
**Pattern**: A method that uses another object's data or methods more than its own.

**Detection**:
- Frequent references to another object's properties or methods.
- More external method calls than internal ones within a single function.
- Often identified when a method seems to "belong" somewhere else.

**Severity**: Medium (increases coupling).

**Solutions**:
- **Move Method**: Move the logic into the class it primarily interacts with.

---

## 4. Case Statement / Type Code
**Pattern**: Using conditional logic to handle behavior based on an object's "type" or "state".

**Detection**:
- `switch` or `case` statements that branch based on a type property (e.g., `user.type`).
- Repeated `if/else if` chains checking the same condition.
- New types require updating these conditional blocks in multiple places (Shotgun Surgery).

**Severity**: High (makes the system fragile and hard to extend).

**Solutions**:
- **Replace Conditional with Polymorphism**: Create subclasses or implementations for each type and move logic there.

---

## 5. Shotgun Surgery
**Pattern**: A single change requires making many small edits across multiple files or classes.

**Detection**:
- Every time you change "X", you also have to change "Y" and "Z".
- Logic is scattered across many places instead of centralized.

**Severity**: High (leads to bugs when parts of the change are missed).

**Solutions**:
- **Move Method/Field**: Group related items into a single class.
- **Inline Class**: If a class is doing too little and logic is scattered, merge it.

---

## 6. Divergent Change
**Pattern**: A single class has to be changed frequently for completely unrelated reasons.

**Detection**:
- "I have to change Class A when I modify the database schema AND when I change the UI layout."
- The class has low cohesion.

**Severity**: High (signals SRP violation).

**Solutions**:
- **Extract Class**: Split the class along its axes of change.

---

## 7. Long Parameter List
**Pattern**: Methods that require many arguments, making them hard to use and maintain.

**Detection**:
- More than 3 or 4 parameters.
- Difficulty remembering the order of arguments.
- Parameters often come from the same source object.

**Severity**: Medium (makes callsites messy and prone to errors).

**Solutions**:
- **Introduce Parameter Object**: Replace arguments with a single object or struct.
- **Preserve Whole Object**: Pass the object itself instead of extracting its fields.

---

## 8. Duplicated Code (DRY Violation)
**Pattern**: Identical or very similar code structures in more than one place.

**Detection**:
- Literal copy-pasted blocks.
- Similar logic with slight variations in variable names or data sources.

**Severity**: High (increases maintenance effort and risk of inconsistency).

**Solutions**:
- **Extract Method/Function**: Move common logic to a shared location.
- **Extract Class**: Move shared behavior to a component or utility.

---

## 9. Primitive Obsession
**Pattern**: Overusing basic types (strings, integers, arrays) to represent complex concepts.

**Detection**:
- Using strings for email addresses, phone numbers, or zip codes without validation.
- Using arrays or dictionaries to represent objects with fixed structures.
- "Magic numbers" or hardcoded strings controlling logic.

**Severity**: Medium (lacks type safety and encapsulated validation).

**Solutions**:
- **Replace Primitive with Value Object**: Create a small class (e.g., `Email`, `Money`) to handle validation and logic.

---

## 10. Data Clumps
**Pattern**: Groups of variables that always seem to travel together.

**Detection**:
- The same 3–4 parameters (e.g., `startDate`, `endDate`, `timezone`) appear in multiple method signatures.
- These variables are always used in conjunction.

**Severity**: Medium (signals a missing abstraction).

**Solutions**:
- **Introduce Parameter Object**: Bundle these variables into a cohesive class or object.

---

## 12. Prop Drilling (React/Expo)
**Pattern**: Passing props through multiple levels of intermediate components that don't need them.

**Detection**:
- A component accepts props only to pass them down to its children.
- Long chains of components (3+ levels) where state is merely "passed through".

**Severity**: Medium (makes components less reusable and refactoring harder).

**Solutions**:
- **Component Composition**: Pass children instead of props.
- **Context API**: Use React Context for global or cross-cutting state.
- **State Management**: Use tools like Redux, Zustand, or Jotai.

---

## 13. God Component (React/Expo)
**Pattern**: A single React component handling UI, local state, API fetching, and complex business logic.

**Detection**:
- Component is longer than 200–300 lines.
- Multiple `useState` and `useEffect` hooks in one file.
- Logic for data transformation mixed with JSX.

**Severity**: High (makes testing and debugging difficult).

**Solutions**:
- **Extract Custom Hook**: Move state and side-effect logic into reusable hooks.
- **Presentational/Container Split**: Separate UI (JSX) from logic (state/fetching).

---

## 14. Hook Complexity (React/Expo)
**Pattern**: Massive `useEffect` blocks or incorrect dependency arrays causing stale closures or infinite loops.

**Detection**:
- `useEffect` with 5+ dependencies or 50+ lines of code.
- Frequent use of "magic" dependency arrays (e.g., empty `[]` when values are used).
- Effects that trigger other effects in a chain.

**Severity**: High (leads to performance issues and hard-to-track bugs).

**Solutions**:
- **Break Down Effects**: Split into multiple smaller effects with distinct responsibilities.
- **Use useReducer**: Consolidate complex state transitions.
- **Extract to Custom Hooks**: Isolate the effect logic.

---

## 15. Any Obsession (TypeScript)
**Pattern**: Overuse of the `any` type or `@ts-ignore` to bypass the TypeScript compiler.

**Detection**:
- Frequent use of `: any` in function signatures or variable declarations.
- Presence of `@ts-ignore` or `@ts-nocheck` without strong justification.
- Casting types using `as any`.

**Severity**: High (negates the benefits of using TypeScript, leads to runtime errors).

**Solutions**:
- **Define Strict Types/Interfaces**: Map the data structures accurately.
- **Use Generics**: Create reusable, type-safe components and functions.
- **Use Unknown**: If type is truly unknown, use `unknown` and type guards.
