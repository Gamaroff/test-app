# Diagram Type Decision Matrix

Pick the diagram type whose **primitives match the thing you are describing**. If you have to bend the diagram to fit the content, you picked the wrong type.

## Quick chooser

| Question the diagram answers | Diagram type | Mermaid keyword |
|---|---|---|
| What does the system look like at a glance? | C4 Context / Topology | `flowchart` with subgraphs (or `C4Context`) |
| What is the order of work across stories in this epic? | Value Stream | `flowchart LR` |
| Who calls whom, in what order, over time? | Sequence | `sequenceDiagram` |
| How does this entity move between states? | Lifecycle | `stateDiagram-v2` |
| What is the shape of this data and its relationships? | ER | `erDiagram` |
| What is the class/object structure? | Class | `classDiagram` |
| What is the decision tree for this logic? | Flow | `flowchart TD` with decision diamonds |
| What does the deployment look like? | Deployment | `flowchart` with cloud/box subgraphs |
| What does the user see and where does it lead? | Journey / sitemap | `journey` or `flowchart` |

## Per-type checklists

### C4 Context (PRD)
- One subgraph per system boundary. Label boundaries by trust zone, not by team.
- Show **external actors** (users, third parties) as nodes outside any subgraph.
- Edges carry the **protocol** (`HTTPS`, `gRPC`, `Kafka`, `S3`).
- Do not descend into containers/components — that is a separate diagram. PRD context stays at the system level.

### Value Stream (Epic)
- Left-to-right (`flowchart LR`).
- One node per story, labelled with the story ID and short title.
- Edges show ordering constraints, not data flow. Use `-.->` for "soft" ordering and `-->` for hard dependency.
- Group parallel-eligible stories in a subgraph called `parallel`.

### Sequence (Story — API interaction)
- One participant per service/actor; declare them at the top in left-to-right order matching the call origin.
- Use `activate`/`deactivate` only when lifetime is meaningful (long-running ops, async).
- Every error path uses an `alt` block. **Do not** hide error paths in a comment.
- For async patterns (queues, webhooks), use `-->>` (dashed) for the async leg and a `note` explaining the trigger.

### State (Story — UI / lifecycle)
- Use `stateDiagram-v2`, never the legacy `stateDiagram`.
- Every transition has a labelled event. Unlabelled transitions are a bug — ask the user what triggers them.
- Terminal states use `[*]` as the destination.
- Composite states (states that contain sub-states) only when the sub-state machine is meaningful, not for cosmetic grouping.

### ER (Task — data shape)
- Include cardinality (`||--o{`, `}o--||`, etc.) on every relationship.
- Field types match the canonical project types (e.g., `uuid`, `text`, `numeric`, `timestamptz` for Postgres). Do not invent generic types if the project uses a specific dialect.
- Mark PK/FK explicitly.

### Class (Task — domain model)
- Show only methods that matter to the spec, not every getter/setter.
- Use `<<interface>>` / `<<abstract>>` stereotypes when relevant.
- Inheritance with `<|--`, composition with `*--`, aggregation with `o--`.

### Flow (Task — decision logic)
- `flowchart TD` for decision trees, `flowchart LR` for pipelines.
- Decision nodes are diamonds: `node{Question?}`. Edges from a decision **must** be labelled with the answer (`Yes`/`No`/specific value).
- Loops drawn explicitly — do not rely on the reader inferring "and repeat".

### Deployment
- Subgraphs by environment (Cloud, Edge, On-Prem) and inside that by service tier.
- Show data stores as cylinders, queues as parallelograms (or via `classDef`).
- Mark trust boundaries with a dashed subgraph border.

## When **not** to draw

- The prose already answers the question in one sentence.
- The diagram would only restate the table that follows it.
- The "diagram" would be a single node and one edge.
- The system is so abstract that the diagram becomes a tautology ("Service does Thing").

In those cases, return `no diagram justified — {reason}` to the parent skill.

## Mixing types

Do not. One diagram, one type. If you find yourself wanting a sequence diagram with state machine semantics, emit two diagrams and link them by ID in the metadata header (`depends_on:`).
