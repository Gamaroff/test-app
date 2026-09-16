---
name: review-task-prepass-prompts
description: Two read-only Explore subagent prompts for the review-task Phase 1.5 pre-pass. Agent B checks architecture alignment, Agent C checks whether the deliverables are already implemented in the codebase. Each returns a fixed YAML summary (≤5 findings, ≤200 words). Forked from review-story-prepass-prompts.md — Agent A (epic alignment) is dropped as tasks have no parent epic.
---
<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/review-task-prepass-prompts.md. Regenerate via `npm run bundle`. -->

# Review Task Pre-Pass Prompts

Used by `skills/review-task/SKILL.md` Phase 1.5. Both agents are dispatched in a **single parallel message** (one `Agent` tool call block with two invocations). Each prompt returns a YAML block only — no prose, no explanations outside the schema.

> **Sibling file**: `references/review-story-prepass-prompts.md` (Agents A, B, C for stories).
> When fixing bugs in Agent B or C prompts, apply the same fix to both files.

---

## Agent B — Architecture Alignment

**Subagent type**: Explore (read-only)

**Prompt template** (substitute `{task_path}` and `{arch_location}` before dispatching):

```
Read the task file at {task_path}. Extract: the tech stack references, service/module names, library names, and API patterns mentioned in the Implementation Plan and Technical Background sections.

Search for architecture documents under {arch_location} that cover the task's domain (backend / frontend / auth / payments / real-time — pick the most relevant). Read at most 2 architecture files.

Compare the task's technical claims against the architecture documents on these axes:
1. Libraries: does the task reference libraries not in the architecture docs or tech-stack.md?
2. Patterns: does the task deviate from documented patterns (naming, layering, file placement)?
3. API contracts: are API endpoints or payloads consistent with specs in architecture docs?
4. Security: does the task handle auth, crypto, or sensitive data in a way that contradicts architecture guidance?

Return ONLY this YAML block (no other text):

alignment: aligned | drift | conflict
findings:
  - area: <one of: library | pattern | api-contract | security>
    severity: low | medium | high
    note: <one line, max 15 words>
# cap: 5 findings maximum. Omit findings array entirely if alignment is "aligned" with no issues.
```

**Fallback**: if no architecture documents can be found under `{arch_location}`, return:
```yaml
alignment: unknown
findings:
  - area: arch-not-found
    severity: low
    note: No architecture documents found — skipping architecture alignment check
```

---

## Agent C — Codebase Already-Implemented Scan

**Subagent type**: Explore (read-only)

**Prompt template** (substitute `{task_path}` before dispatching):

```
Read the task file at {task_path}. Extract the key symbols, function names, file paths, module names, and feature names mentioned in the Technical Background, Implementation Plan, and Files Summary sections.

For each extracted symbol or feature name, grep the codebase (excluding docs/, node_modules/, .git/, dist/, build/) to check whether it already exists.

Assess whether the task's core deliverable appears to already be implemented, partially implemented, or not yet present.

Return ONLY this YAML block (no other text):

implementation_status: not-implemented | partial | fully-implemented
findings:
  - symbol: <name searched>
    found_at: <file path, or "not found">
    note: <one line, max 15 words>
# cap: 5 findings maximum. If nothing is implemented, return implementation_status: not-implemented with an empty findings array.
```

**Fallback**: if grep tooling is unavailable, return:
```yaml
implementation_status: unknown
findings:
  - symbol: scan-unavailable
    found_at: not found
    note: Grep unavailable — codebase scan skipped
```

---

## Dispatch Instructions

### How to dispatch (in `review-task` Phase 1.5)

Send both agents in a **single message** with two `Agent` tool calls:

```
Agent B: subagent_type="Explore", prompt=<Agent B prompt with task_path and arch_location substituted>
Agent C: subagent_type="Explore", prompt=<Agent C prompt with task_path substituted>
```

Do NOT send them sequentially — both must be in the same tool-call block to run in parallel.

### Variable substitution

| Variable | Source |
|----------|--------|
| `{task_path}` | Resolved in Input Resolution / Step 1 |
| `{arch_location}` | `skills-config.yaml` → `architecture.architectureShardedLocation`, default: `docs/architecture` |

### Handling agent failures

If one agent times out or returns malformed output:
- Log a warning: `⚠️ Pre-pass Agent {B/C} failed — proceeding without {architecture/codebase} summary`
- Continue with the summary from the remaining agent
- Do NOT re-run or retry the failed agent — the Q&A phase handles the gap

### Summary schema validation

Before passing summaries to the Q&A phase, validate each returned block has the expected top-level key (`alignment` for B; `implementation_status` for C). If the key is missing, treat the agent as failed and apply the failure rule above.
