# Mermaid Syntax Cheatsheet

Common patterns and gotchas. Not a full reference — see mermaid.js.org for the spec.

## Theme/init

Always prepend a theme directive so the diagram renders consistently across hosts:

```mermaid
%%{init: {'theme':'neutral'}}%%
```

Use `'neutral'` for documentation. Use `'dark'` only if the host renders on dark backgrounds.

## Subgraphs (use freely, name by layer)

```mermaid
flowchart TB
  subgraph frontend [Frontend]
    web[Web App]
    mobile[Mobile]
  end
  subgraph backend [Backend Services]
    api[API Gateway]
    svc[Order Service]
  end
  subgraph data [Data Layer]
    db[(Postgres)]
    cache[(Redis)]
  end
  web --> api
  mobile --> api
  api --> svc --> db
  svc --> cache
```

Subgraph IDs are referenced by other diagrams; keep them stable.

## classDef (semantic styling)

```mermaid
flowchart LR
  user((User)):::actor
  api[API]:::internal
  stripe[Stripe]:::external
  db[(Postgres)]:::store

  classDef actor fill:#fef3c7,stroke:#92400e,stroke-width:2px
  classDef internal fill:#dbeafe,stroke:#1e40af
  classDef external fill:#fee2e2,stroke:#991b1b,stroke-dasharray: 5 5
  classDef store fill:#e0e7ff,stroke:#3730a3
```

Reuse the project's existing palette. Read sibling diagrams before defining new colours.

## Sequence diagram with error path

```mermaid
sequenceDiagram
  autonumber
  participant U as User
  participant API as API Gateway
  participant Auth as Auth Service
  participant DB as User DB

  U->>API: POST /login
  API->>Auth: validateCredentials(email, pw)
  Auth->>DB: SELECT user WHERE email
  DB-->>Auth: user row
  alt password match
    Auth-->>API: token
    API-->>U: 200 { token }
  else mismatch
    Auth-->>API: invalid
    API-->>U: 401 Unauthorized
  end
```

`autonumber` is helpful for docs that reference steps by number. Use `alt`/`else` for branches; never collapse the failure case into a comment.

## State diagram

```mermaid
stateDiagram-v2
  [*] --> pending
  pending --> active: kyc_passed
  pending --> rejected: kyc_failed
  active --> suspended: fraud_flag
  suspended --> active: review_cleared
  active --> closed: user_request
  rejected --> [*]
  closed --> [*]
```

Every transition labelled with the **event** that fires it. `[*]` for initial/final.

## ER diagram

```mermaid
erDiagram
  USER ||--o{ ORDER : places
  ORDER ||--|{ ORDER_ITEM : contains
  PRODUCT ||--o{ ORDER_ITEM : "appears in"

  USER {
    uuid id PK
    text email
    timestamptz created_at
  }
  ORDER {
    uuid id PK
    uuid user_id FK
    numeric total
    text status
  }
```

Cardinality on every relationship. Field types match project DB dialect.

## Flowchart with decisions

```mermaid
flowchart TD
  start([Submit application]) --> q1{Required fields complete?}
  q1 -->|No| reject1[Show validation errors]
  q1 -->|Yes| q2{Risk score < threshold?}
  q2 -->|No| manual[Queue for manual review]
  q2 -->|Yes| approve([Auto-approve])
  reject1 --> start
  manual --> approve
  manual --> reject2([Reject])
```

Decision diamonds get `{}`. **Every** edge from a decision is labelled.

## Common gotchas

- **Reserved words**: `end`, `default`, `class`, `state` cannot be used as bare node IDs in some diagram types. Quote them: `node["end"]` or rename.
- **Special chars in labels**: parens, colons, slashes break the parser. Wrap labels in double quotes: `node["Order (paid)"]`.
- **Long labels**: use `<br/>` for line breaks inside labels; `\n` does not work.
- **Edge text with spaces**: `A -->|with text| B` works; `A -- with text --> B` also works. Pick one style per file.
- **Sequence participants**: declare them explicitly at the top in the order you want them to appear, otherwise Mermaid orders by first mention.
- **stateDiagram-v2**, not `stateDiagram`. The legacy syntax has bugs.
- **Direction**: `flowchart TB` (top-bottom) for hierarchies, `LR` for pipelines/value streams. `BT` and `RL` are valid but rarely the right call.
- **Comments**: `%% this is a comment`. Cannot appear inside a node label.
- **Markdown nesting**: when embedding in `.md`, fence with triple backticks and language `mermaid`. GitHub, GitLab, and most renderers honour this.

## Node shapes (flowchart)

| Shape | Syntax | Use for |
|---|---|---|
| Rectangle | `id[Label]` | Default service/process |
| Rounded | `id(Label)` | Soft action |
| Stadium | `id([Label])` | Start/end |
| Subroutine | `id[[Label]]` | Reusable component |
| Cylinder | `id[(Label)]` | Database/store |
| Circle | `id((Label))` | Actor/user |
| Asymmetric | `id>Label]` | Async / event |
| Rhombus | `id{Label?}` | Decision |
| Hexagon | `id{{Label}}` | Preparation step |

Stick to a small set per diagram; visual variety is noise.

## Edge styles (flowchart)

| Style | Syntax | Use for |
|---|---|---|
| Solid | `A --> B` | Synchronous call / hard dependency |
| Dotted | `A -.-> B` | Async / soft dependency |
| Thick | `A ==> B` | Critical path |
| Labelled | `A -->|label| B` | Always for decision branches |
| Bidirectional | `A <--> B` | Two-way handshake (rare) |
