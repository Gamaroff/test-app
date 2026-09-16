---
name: review-security
description: 'Establishes whether a security control ENGAGES — by executing it against adversarial input — not whether it is merely present in the source. Reports a per-control verdict: engages / present-but-inert / absent / unverifiable, rating present-but-inert high because an inert control has already been believed. A deterministic engine computes the verdict from probes it ran, so a review that executed nothing reports unverifiable and no PASS token exists. Modes: diff and full. Advisory — owns no gate, edits no code. Prefer over the built-in /security-review when you need proof a control fires, not a reading of the diff.'
---

> **Method and inputs**: see [`references/security-input-corpus.md`](references/security-input-corpus.md)
> **Reviewer prompt**: [`references/security-review-prompt.md`](references/security-review-prompt.md)

# Review Security

## Overview

`/review-security` asks one question about each security control a work item claims: **does it
engage?** Not "is it there", not "does it look right" — does it actually reject hostile input when
you send some.

Nothing else in this repository does that to application code. Three instruments come close and each
misses for its own reason:

| Instrument | Method | Why it misses |
| --- | --- | --- |
| `finalise` DoD security agent | grep checklist + probe mode | probe mode is gated on the deliverable *being* an accept/reject predicate; a configuration object and a URL composer are not |
| `qa-story` / `qa-task` NFR security | judgement from reading | one line — *"Review for security issues"* |
| `review-code` | correctness + cleanups | security is one bullet; no security lens |

The gap they share is that a control can be **present and inert**, and every one of them passes it.
A `tls` key that a grep finds, a reviewer reads, and a unit test asserts `toBeDefined()` on — while
the connection it configures is plaintext.

**The agent does not write the verdict.** It produces a probe *specification*; the engine at
[`references/security-probe.mjs`](references/security-probe.mjs) runs it against
the corpus and computes the outcome. That is the structural reason this skill cannot become a more
confident copy of the vacuum it replaces: an agent that ran nothing has no field to forge.

## When to Use This Skill

- "Does this control actually work?" / "prove the TLS is really on"
- "Probe this validator" / "run adversarial input at this parser"
- Before trusting a security claim that a grep-based check already passed
- Reviewing a control that shipped a while ago and that no current diff touches (`--mode full`)

Do **not** use it as a gate — it writes no gate file, and v1 wires into none. Do **not** use it for a
general code review (`/review-code`) or a PR-versus-work-item review (`/review-pr`).

## Relationship to the built-in `/security-review`

Claude Code ships a built-in `/security-review`: *"Complete a security review of the pending changes
on the current branch."* This skill is `review-security` — a different dispatch string, in the
existing `review-*` family.

**The names do not collide; the natural language does.** "Do a security review" matches both, the
built-in wins, and you receive a read-only judgement believing you received a probed one — which is
the same silent-success shape this skill exists to fix. So:

| Use | When |
| --- | --- |
| built-in `/security-review` | you want a broad read of the pending diff for security smells |
| `/review-security` (this skill) | you want **proof that a named control fires**, executed, with the command that produced each verdict |

They are complements: the built-in is wide and inferential, this is narrow and empirical. If you are
not sure which you ran, check the output — this one cannot emit a bare pass, and every verdict it
emits carries a re-runnable command.

## Arguments

Invoke as `/review-security [work-item] [--mode diff|full]`.

| Arg | Values | Default | Meaning |
| --- | --- | --- | --- |
| `work-item` | story or task file / directory path | resolved from the current branch | What is being reviewed |
| `--mode` | `diff` \| `full` | `diff` | `diff` reviews controls in files changed since the base branch; `full` reviews the work item's whole security surface regardless of what changed |

## Workflow

1. **Resolve the work item** — a story or task path, or the document matching the current branch stem.
2. **Scope the subject.**
   - `diff` — files changed since the base branch.
   - `full` — the work item's security surface, whatever its change state. Bounded to one work item:
     epic-level scope is deliberately out of scope, having no stopping rule.
3. **Identify the controls the work item claims.** Read its Success Criteria / Acceptance Criteria and
   its security-relevant prose. A control is anything whose job is to decide what gets through.
4. **Write one probe spec per control** — `{ sink, entry }` — following
   [`references/security-review-prompt.md`](references/security-review-prompt.md),
   which is passed to the reviewing agent verbatim. Sink selection and entry-point rules live there.
5. **Run the engine.** `runProbeSpec` executes every corpus case for the sink in a sandboxed child and
   returns the verdict, the reason, and the per-case results.
6. **Write the report** to `{work-item-dir}/{stem}.security.{N}.{name}.md`, including the
   `security_review:` machine block.

## Output

Co-located beside the work item, numbered like every other pipeline artifact:

```
docs/tasks/task.81.review-security-skill/
└── task.81.security.1.review-security-skill.md
```

The report carries a per-control section (verdict, call site, entry probed, sink, evidence, the
command, and what passed that should not) plus one `security_review:` YAML block. Full shape:
[`references/security-review-prompt.md`](references/security-review-prompt.md) §4.

**There is no PASS token in the schema.** Output is per-control verdicts, so a bare pass is
unrepresentable rather than merely discouraged.

## Guarantees

These are the properties that make the skill worth trusting, and each is held by something other
than good intentions:

| Guarantee | Held by |
| --- | --- |
| The agent cannot write a verdict | `computeVerdict` in the engine; the agent supplies only `{sink, entry}` |
| Zero executed probes never reads as a pass | `runProbeSpec` returns `unverifiable` on `no-cases-executed` |
| `evidence: measured` implies `probes_executed > 0` | contract test in CI |
| The block's keys match the QA gate's, so a cycle lifts rather than translates | `evals/shared/tests/qa-re-review-scope-parity.test.mjs`; values defined once in [`references/qa-gate-security-evidence.md`](references/qa-gate-security-evidence.md) |
| A bare PASS is unrepresentable | no PASS token exists in the output schema |
| A grep-passing control is still caught | the falsifiability fixtures — each inert variant *contains* the tokens a grep reviewer accepts |

## Falsifiability — this skill's own tests

`skills/review-security/tests/` holds four fixtures modelling both measured defects, in engaged and
inert variants, and a suite asserting `engaged → engages` and `inert → present-but-inert`. **The
verdicts come from the engine**, so the assertions are deterministic red/green in CI with no agent in
the loop.

Each inert variant deliberately contains the literal tokens a grep-based reviewer would accept —
`tls`, `rejectUnauthorized`, `sslmode=require`. Without that, someone tidies the fixture into an
`absent` case that any grep catches, and the suite stays green while proving nothing.

```bash
node --test 'skills/review-security/tests/*.test.js'
```

## What this does not tell you

Stated here, and repeated in every report, because a reader who does not know these will over-read a
clean result:

1. It establishes that a **named entry point** behaves correctly on the inputs the corpus supplies.
   It does not establish that the corpus is complete.
2. It does not prove the entry point is the one the application actually **calls**. A probe can
   engage on a helper the real call site bypasses. Mitigated — not closed — by citing the call site's
   `file:line`, recording the module path the engine resolved, and downgrading any citation naming no
   file in scope to `unverifiable`.
3. **Non-JS entry points are `unverifiable`** in v1. A stated limit, not a silent skip.

## Out of scope in v1

| Excluded | Why |
| --- | --- |
| `--fix` | a fix to a security control is the change class that most needs a human plus a full re-probe; `qa-fix` already owns repair in the pipeline |
| `--comment` / PR posting | depends on the inline-comment primitive, unshipped |
| Epic-level scope | unbounded budget with no stopping rule; `full` already covers "unscoped", bounded to one work item |
| Owning `nfr_validation.security` | advisory in v1 |

## Related Skills

- `/review-code` — adversarial diff review for correctness and cleanups
- `/review-pr` — does the PR deliver what the work item promised
- `/qa-task`, `/qa-story` — own the quality gate; this skill does not
- `/finalise` — the DoD gate, whose probe mode this widens the subject of
