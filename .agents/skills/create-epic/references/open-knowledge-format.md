<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/open-knowledge-format.md. Regenerate via `npm run bundle`. -->
# Open Knowledge Format (OKF) conformance

> Canonical mapping + conformance statement for this repo's document tooling. Referenced by `AGENTS.md`, the `docs/standards/*` schemas, and the `create-*`/`review-*` skills.

This repo's document-creation and review tooling targets **Open Knowledge Format (OKF) v0.1** — a vendor-neutral standard from Google Cloud that represents knowledge as a directory of markdown files with YAML frontmatter, portable across tools and readable by both humans and AI agents.

- **Conformance level:** `okf_version: "0.1"` — recommended-field conformance, additive only.
- **Spec:** <https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md>
- **Background:** <https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing>

## What OKF requires / recommends

- **Required:** a non-empty `type` in every non-reserved document's YAML frontmatter. This is OKF's single hard requirement.
- **Recommended:** `title`, `description` (one-sentence summary), `resource` (canonical URI of the asset), `tags` (YAML list of short strings), `timestamp` (ISO 8601 of the last meaningful change).
- **Permissive by design:** consumers MUST tolerate unknown `type` values, unknown keys, missing optional fields, and broken links. Adoption here is therefore additive — no existing field is removed or renamed.

## How this repo's fields map to OKF

| OKF field     | Repo field(s)                                                        | Notes |
|---------------|----------------------------------------------------------------------|-------|
| `type`        | `type`                                                               | `epic` / `story` / `task` / `prd` literal. Every template emits it. |
| `title`       | `title`                                                              | Human-readable title. Unchanged. |
| `description` | `description`                                                        | One-sentence summary — what consumers and agents index on. |
| `tags`        | `tags`                                                               | Optional YAML list for cross-cutting categorization. |
| `timestamp`   | `updated` (fallback `created`)                                       | `updated` **is** this repo's OKF `timestamp`. We do **not** add a duplicate `timestamp` field — the `created`/`updated` pair is richer than OKF's single `timestamp`. |
| `resource`    | `resource`, or `github_url` / `jira_url`, or derived from `github_issue` | Canonical URI of the asset. For PM artifacts the natural value is the tracker URL (see below). |

### `resource` resolution (both forms)

`resource` is aimed at data assets (tables, metrics). For this repo's PM artifacts the natural value is the tracker URL, resolved in this order:

1. An explicit `resource:` frontmatter field, if present (override for edge cases).
2. A URL field — `github_url` or `jira_url` (epics / stories carry these).
3. A bare issue number — `github_issue` (tasks carry this, e.g. `github_issue: 162`). Derive the URI as `{repo_url}/issues/{github_issue}`.

Both forms are conformant; the optional explicit `resource` field is offered only for cases that need an override.

## Per-document expectations

| Field         | Epic | Story | Task | PRD |
|---------------|------|-------|------|-----|
| `type`        | `epic` (required) | `story` (required) | `task` (required) | `prd` (required) |
| `description` | recommended | recommended | recommended | recommended (already present) |
| `tags`        | optional | optional | optional | optional |
| `timestamp`   | `updated` | `updated` | `updated` | `created`/`updated` |
| `resource`    | `github_url`/`jira_url` | `github_url`/`jira_url` | derived from `github_issue` | optional |

## Validation severity (enforced by `review-*` + `documentation-standards-validator`)

- Missing/empty `type` → **Critical**.
- Missing `description` → **Important**.
- Malformed `tags` (not a list) or malformed `resource` (not a URI) when present → **Optional**.

Only `type` is Critical so that historical documents lacking the newer fields are not hard-failed.

## Migration of existing documents

Existing `docs/` documents are **not** retrofitted — adoption is going-forward only. When an old document is next reviewed under the updated skills, the reviewer adds the one-line `type:` (and ideally `description:`) as part of that review. No bulk migration is required.

## Intentionally out of scope

These OKF features are deliberately **not** adopted, because existing repo conventions already serve their purpose:

- **Reserved `index.md` / `log.md` per directory** — the global registries (`docs/tasks/task-registry.md`, `docs/development/epic-registry.md`) and the inline Change-Log tables already serve discovery and history.
- **Bundle-relative `/...` cross-links** — the repo uses relative links and frontmatter references; the bundler (`npm run bundle`) rewrites `shared/resources/*` paths into each skill.
- **`okf_version` in a root `index.md`** — the conformance version is declared here (`okf_version: "0.1"`) instead of in a per-bundle root index.

A future OKF version bump (past v0.1) is a separate follow-up task; conformance is pinned to v0.1 in this document.

## See also

- [`AGENTS.md`](https://github.com/Gamaroff/agent-skills/blob/develop/AGENTS.md) — top-level repo guidance (links this doc)
- [`docs/standards/epic-documents.md`](https://github.com/Gamaroff/agent-skills/blob/develop/docs/standards/epic-documents.md), [`story-documents.md`](https://github.com/Gamaroff/agent-skills/blob/develop/docs/standards/story-documents.md), [`task-documents.md`](https://github.com/Gamaroff/agent-skills/blob/develop/docs/standards/task-documents.md), [`prd-documents.md`](https://github.com/Gamaroff/agent-skills/blob/develop/docs/standards/prd-documents.md)
- [`references/document-status-lifecycle.md`](document-status-lifecycle.md)
