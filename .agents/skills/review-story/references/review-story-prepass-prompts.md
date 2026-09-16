---
name: review-story-prepass-prompts
description: Three read-only Explore subagent prompts for the review-story Phase 1.5 pre-pass. Agent A checks epic alignment, Agent B checks architecture alignment, Agent C checks whether the feature is already implemented in the codebase. Each returns a fixed YAML summary (≤5 findings, ≤200 words).
---
<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/review-story-prepass-prompts.md. Regenerate via `npm run bundle`. -->

# Review Story Pre-Pass Prompts

Used by `skills/review-story/SKILL.md` Phase 1.5. All three agents are dispatched in a **single parallel message** (one `Agent` tool call block with three invocations). Each prompt returns a YAML block only — no prose, no explanations outside the schema.

---

## Agent A — Epic Alignment

**Subagent type**: Explore (read-only)

**Prompt template** (substitute `{story_path}` and `{epic_path}` before dispatching):

```
Read the story file at {story_path}.
Read the parent epic file at {epic_path}. Focus on: the epic's Acceptance Criteria section, the Stories Breakdown table, and the epic's stated scope.

Compare the story against the epic on these axes:
1. Scope: does the story introduce work outside the epic's stated scope?
2. Acceptance Criteria: does every story AC trace to at least one epic deliverable?
3. Estimated effort: does the story effort appear proportional to epic scope?
4. Duplicates: does the story overlap significantly with another story already listed in the epic?

Return ONLY this YAML block (no other text):

alignment: aligned | drift | conflict
findings:
  - area: <one of: scope | acceptance-criteria | effort | duplicate>
    severity: low | medium | high
    note: <one line, max 15 words>
# cap: 5 findings maximum. Omit findings array entirely if alignment is "aligned" with no issues.
```

**Fallback**: if `{epic_path}` cannot be found or read, return:
```yaml
alignment: unknown
findings:
  - area: epic-not-found
    severity: low
    note: Parent epic file not found — skipping epic alignment check
```

---

## Agent B — Architecture Alignment

**Subagent type**: Explore (read-only)

**Prompt template** (substitute `{story_path}` and `{arch_location}` before dispatching):

```
Read the story file at {story_path}. Extract: the tech stack references, service/module names, library names, and API patterns mentioned in Dev Notes and Tasks.

Search for architecture documents under {arch_location} that cover the story's domain (backend / frontend / auth / payments / real-time — pick the most relevant). Read at most 2 architecture files.

Compare the story's technical claims against the architecture documents on these axes:
1. Libraries: does the story reference libraries not in the architecture docs or tech-stack.md?
2. Patterns: does the story deviate from documented patterns (naming, layering, file placement)?
3. API contracts: are API endpoints or payloads consistent with specs in architecture docs?
4. Security: does the story handle auth, crypto, or sensitive data in a way that contradicts architecture guidance?

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

**Prompt template** (substitute `{story_path}` before dispatching):

```
Read the story file at {story_path}. Extract the key symbols, service names, component names, function names, and file paths mentioned in the Acceptance Criteria, Tasks, and Dev Notes.

For each extracted symbol or feature name, grep the codebase (excluding docs/, node_modules/, .git/, dist/, build/) to check whether it already exists.

Assess whether the story's core deliverable appears to already be implemented, partially implemented, or not yet present.

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

### How to dispatch (in `review-story` Phase 1.5)

Send all three agents in a **single message** with three `Agent` tool calls:

```
Agent A: subagent_type="Explore", prompt=<Agent A prompt with story_path and epic_path substituted>
Agent B: subagent_type="Explore", prompt=<Agent B prompt with story_path and arch_location substituted>
Agent C: subagent_type="Explore", prompt=<Agent C prompt with story_path substituted>
```

Do NOT send them sequentially — all three must be in the same tool-call block to run in parallel.

### Variable substitution

| Variable | Source |
|----------|--------|
| `{story_path}` | Resolved in Input Resolution / Step 1 |
| `{epic_path}` | Found by Step 1 Explore subagent (parent epic file path) |
| `{arch_location}` | `skills-config.yaml` → `architecture.architectureShardedLocation`, default: `docs/architecture` |

### Handling agent failures

If one agent times out or returns malformed output:
- Log a warning: `⚠️ Pre-pass Agent {A/B/C} failed — proceeding without {epic/architecture/codebase} summary`
- Continue with the summaries from the remaining agents
- Do NOT re-run or retry the failed agent — the Q&A phase handles the gap

### Summary schema validation

Before passing summaries to the Q&A phase, validate each returned block has the expected top-level key (`alignment` for A and B; `implementation_status` for C). If the key is missing, treat the agent as failed and apply the failure rule above.
