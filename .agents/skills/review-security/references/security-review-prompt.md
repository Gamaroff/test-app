---
name: security-review-prompt
description: The reviewer prompt for /review-security. Establishes, per security control, whether the control ENGAGES — by running it against adversarial input — and emits per-control verdicts with the command that produced each. Single source; bundled into skills/review-security/references/.
---
<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/security-review-prompt.md. Regenerate via `npm run bundle`. -->

# Security review prompt

> Passed verbatim to the reviewing agent by [`review-security`](../SKILL.md).
> **You are not asked to judge whether the code looks secure.** You are asked to produce probe
> specifications that a deterministic engine will execute, and to report what it found.

---

## 1. What you are establishing

For every security control the work item claims, establish which of four states it is in. The
vocabulary is frozen in `VERDICTS` (`references/security-probe.mjs`) — never invent a fifth:

| Verdict | Meaning | Severity |
| --- | --- | --- |
| `engages` | The control ran, rejected every hostile input, and accepted at least one legitimate one | none |
| `present-but-inert` | The control exists and demonstrably rejects *something*, yet a hostile input passed | **high** |
| `absent` | Nothing is filtering anything | medium |
| `unverifiable` | Nothing was executed, or what ran cannot support a conclusion | — (a finding, never a pass) |

**`present-but-inert` is the highest severity, and that ordering is deliberate.** An absent control
is a gap someone will notice. An inert one has already been read, reviewed and believed — by the
author, by a code reviewer, and by a grep-based check that cited it as evidence. It carries the
credibility of a control while providing none of the protection.

**There is no PASS token in this vocabulary.** A review with no findings reports `engages` per
control, each naming what was probed. "No issues found" without a method is the failure this
instrument replaces.

---

## 2. What you produce, and what you must not

**You produce probe *specifications*. The engine computes the verdict.**

```js
{ sink: "url-authority", entry: "path/to/module.mjs#exportName" }
```

You never write a verdict field yourself. `runProbeSpec` (`references/security-probe.mjs`)
resolves the entry, runs every corpus case for the sink in a sandboxed child process, and calls
`computeVerdict` on the results. This is the structural reason an agent that executed nothing cannot
manufacture a clean report: the field it would have to forge is not one it writes.

Two rules follow, and both are enforced in CI rather than left to your discretion:

- **`evidence: measured` requires `probes_executed > 0`.** A verdict resting on reading rather than
  execution is `evidence: reasoned`, always — however confident the reading.
- **Zero executed probes renders `unverifiable`**, never `engages` and never a pass.

---

## 3. Method — where the ordering lives

Candidate inputs, the two directions every sink must cover, and the order in which to try them are
defined once, in [`security-input-corpus.md`](security-input-corpus.md) §"The method ordering". Read
it and follow it. **Do not restate it here or in your report** — a second copy is a second thing to
drift.

What this prompt adds is the *subject*: the corpus says what to send, this says what to send it at.

### Choosing the sink

`SINKS` (`references/security-input-corpus.mjs`) are `url-authority`, `sql-orm`, `shell-exec`,
`path`, `template-render`. Pick by what the control *decides*, not by what the module is called:

| The control decides… | Sink |
| --- | --- |
| where a connection goes — a URL, DSN, host, port, or connection-options object | `url-authority` |
| what reaches a database query | `sql-orm` |
| what reaches a shell or a spawned process | `shell-exec` |
| what filesystem location is read or written | `path` |
| what is interpolated into rendered output | `template-render` |

No sink fits → report `unverifiable` for that control and say which inputs would have been needed.
Do not force a control into the nearest sink; a probe run with the wrong corpus produces a confident
answer to a question nobody asked.

### Choosing the entry point

`entry` is `path#exportName`, resolved from the repository root. It must be:

- **A real, importable ES module export.** Non-JS entry points are a stated v1 limit — report
  `unverifiable` and name the language.
- **Called with exactly one argument.** The child runner calls `await fn(input)`. An entry needing
  more configuration than that is not probeable as-is; report `unverifiable` rather than inventing a
  wrapper, and say what shape would be.
- **The nearest thing to the real call site you can reach.** Cite the `file:line` of the **call
  site**, not of the helper. See §6 — this is the residual limit of the whole method.

### How the engine reads a result

A control **rejects** by throwing, or by returning `null` / `undefined` / `false`. Any other return
is an **acceptance**. This is the engine's convention, not a suggestion — a control that "rejects" by
returning a sanitised-but-truthy value reads as an acceptance, and that is usually the correct
reading.

---

## 4. Output contract

Every control gets a row. Every row carries the command that produced it — a verdict a reader cannot
re-run is an assertion, not evidence.

````markdown
### {control name}

- **Verdict**: `present-but-inert` (high)
- **Call site**: `apps/api/src/redis.ts:41`
- **Entry probed**: `apps/api/src/redis.ts#buildRedisOptions`
- **Sink**: `url-authority`
- **Evidence**: `measured` — 12 probes executed, 9 hostile / 3 legitimate
- **Command**:
  ```bash
  node references/security-probe.mjs --sink url-authority \
    --entry 'apps/api/src/redis.ts#buildRedisOptions'
  ```
- **What passed that should not**: `evil.example.com/x` — accepted. The `/` ends the authority, so
  the connection is re-pointed and the port silently dropped.
- **What it did reject**: `exa mple.com`, `""` — which is why this is `present-but-inert` rather
  than `absent`: the control demonstrably runs.
````

And the machine block, once per report, which is what a gate consumes:

```yaml
security_review:
  mode: diff              # diff | full
  probes_executed: 12     # 0 ⇒ every verdict is `unverifiable`
  evidence: measured      # measured | reasoned — `measured` REQUIRES probes_executed > 0
  controls:
    - name: redis-tls
      verdict: present-but-inert
      severity: high
      call_site: apps/api/src/redis.ts:41
      entry: apps/api/src/redis.ts#buildRedisOptions
      sink: url-authority
      reason: a-hostile-case-passed-a-control-that-rejects-others
```

`reason` is the engine's own string — copy it, do not paraphrase it.

### Lifting the block into a QA gate

`probes_executed:` and `evidence:` carry the **same names and the same meanings** as
`nfr_validation.security` in a QA gate, so a QA cycle can lift them verbatim rather than translating:

```yaml
nfr_validation:
  security:
    status: PASS|CONCERNS|FAIL    # the gate's own judgement — NOT lifted from here
    evidence: measured            # lifted verbatim
    probes_executed: 12           # lifted verbatim
```

Two boundaries on that, and both matter:

- **The value domains are nested, not equal.** This block emits `measured | reasoned`. The gate's
  domain is `measured | reasoned | unverified`, and `unverified` is **gate-only** — it means *no
  security review supplied a verdict at all*, which is not an answer a review that ran can give. Do
  not add `unverified` here.
- **`status:` is not ours to set.** This skill reports per-control verdicts; the gate's PASS /
  CONCERNS / FAIL is the QA reviewer's call. Consuming this block is **optional** — `qa-story` and
  `qa-task` own the field; this skill advises.

Values and the placement constraint: [`qa-gate-security-evidence.md`](qa-gate-security-evidence.md).

---

## 5. Modes

| Mode | Subject |
| --- | --- |
| `diff` (default) | controls in the files changed since the base branch |
| `full` | the work item's whole security surface, regardless of what changed |

`full` exists because every other security instrument in this repository is anchored to a diff and a
pending gate. A control that shipped last month, with nothing touching it now, is reviewed by
nothing. `full` is bounded to one work item — not an epic, not the repository.

---

## 6. What this does not tell you, and must be said in the report

State these limits in the report itself. They are not hedging; a reader who does not know them will
over-read a clean result.

1. **It establishes that a named entry point behaves correctly on the inputs the corpus supplies.**
   It does not establish that the corpus is complete.
2. **It does not prove the entry point is the one the application actually calls.** A probe can
   engage on a helper while the real call site bypasses it. Mitigation, not closure: cite the call
   site's `file:line`, record the module path the engine actually resolved, and **downgrade to
   `unverifiable` any citation naming no file in scope**.
3. **Non-JS entry points are `unverifiable`** in v1 — a stated limit, not a silent skip.

---

## See also

- [`security-input-corpus.md`](security-input-corpus.md) — the inputs and the method ordering
- [`probe-boundary-rule.md`](https://github.com/Gamaroff/agent-skills/blob/develop/shared/resources/probe-boundary-rule.md) — why a probe is not a snippet, and how the
  verdict is derived
- [`finalise-dod-security-prompt.md`](https://github.com/Gamaroff/agent-skills/blob/develop/shared/resources/finalise-dod-security-prompt.md) — the DoD gate's probe mode,
  whose subject this widens
