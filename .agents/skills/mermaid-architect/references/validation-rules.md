# Validation Rules

Two layers: **syntactic** (the diagram parses) and **semantic** (the diagram matches reality).

## Syntactic — handled by `scripts/lint.sh`

Run on every emit:

```bash
scripts/lint.sh <file-or-stdin>
```

### Checks

1. **Fence pairing** — every ` ```mermaid ` opens and closes exactly once per block. Unbalanced fences = exit 1.
2. **Diagram-type keyword present** — first non-comment, non-init line is one of `flowchart`, `graph`, `sequenceDiagram`, `stateDiagram-v2`, `erDiagram`, `classDiagram`, `journey`, `gantt`, `pie`, `mindmap`, `timeline`, `C4Context`, `C4Container`, `C4Component`, `C4Dynamic`, `C4Deployment`. Otherwise exit 2.
3. **Bracket balance** — `[]`, `()`, `{}` balanced across the block. Exit 3 on mismatch.
4. **Reserved keywords as bare IDs** — `end`, `default`, `class`, `state`, `subgraph` used as a node ID without quotes. Exit 4.
5. **Duplicate node IDs** with different labels — exit 5.
6. **State diagram uses v2** — `stateDiagram` without `-v2` raises a warning, not an error.
7. **stateDiagram unlabelled transitions** — `A --> B` without `: label` raises a warning (legitimate for `[*]` initial transitions).
8. **Mermaid CLI parse** — if `mmdc` is on PATH, run `mmdc -i <file> -o /tmp/_mmd_check.svg` and surface its error. Otherwise skip with a note.

### Exit codes

| Code | Meaning |
|---|---|
| 0 | Pass |
| 1 | Fence imbalance |
| 2 | Missing/unknown diagram type |
| 3 | Unbalanced brackets |
| 4 | Reserved keyword as bare ID |
| 5 | Duplicate node ID |
| 10 | mmdc parse failure (when available) |
| 20 | File not readable |

Warnings (no exit code change) are written to stderr prefixed `WARN:`.

## Semantic — your job, not the linter's

The linter cannot tell you the diagram is wrong about the system. You must.

### Architectural consistency

Before emitting, compare the diagram against the project's existing architecture:

- **Trust boundaries** — does the diagram cross a boundary that other diagrams treat as closed? (e.g., client → DB direct, when every other diagram routes through an API.) Flag.
- **Naming** — actor and service names match the canonical names used in sibling docs. `User` vs `Customer` vs `Account` — pick the one already used. Use `grep` across the project's `*.md` to find the canonical term.
- **Layer ordering** — flow direction matches convention. If other flowcharts go top-down, do not emit left-right without reason.
- **Style palette** — `classDef` colours match the project's existing palette. If three sibling diagrams use blue for "internal" and red for "external", do not invent green.

### Logical completeness

- Every actor/service introduced is referenced in the source document.
- Every step in the source document is represented (or explicitly noted as out-of-scope).
- Every error path mentioned in the source has a branch in the diagram.
- Every state mentioned has a transition in (and either a transition out or an explicit terminal marker).

### Common smells

| Smell | Likely cause | Fix |
|---|---|---|
| Single linear chain with no branches | Happy path only — error states missing | Ask user for failure modes |
| Many crossing edges | Wrong direction or wrong layout | Try the other direction; group with subgraphs |
| Generic node labels (`Service`, `DB`) | Lazy abstraction | Replace with concrete names |
| Unlabelled decision edges | Reader has to guess branch meaning | Label every branch |
| Sequence diagram with one participant | Wrong type — should be a flowchart or list | Switch type |
| State diagram with no terminal state | Lifecycle is incomplete | Add `[*]` exit or ask user |
| ER diagram with no cardinality | Schema is hand-wavy | Add cardinality to every relationship |

If you find any of these, **fix or ask** — don't emit.
