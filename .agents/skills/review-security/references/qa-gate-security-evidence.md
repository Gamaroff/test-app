---
name: qa-gate-security-evidence
description: The three values of nfr_validation.security.evidence in a QA gate — measured, reasoned, unverified — stated once, with the probes_executed rule that makes `measured` a claim rather than an adjective, and the fail-open semantics a missing key carries. Referenced by qa-task, qa-story and qa-re-review-scope; produced by review-security.
---
<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/qa-gate-security-evidence.md. Regenerate via `npm run bundle`. -->

# QA gate — the security evidence field

> **A verdict that states how it was reached is worth more than one that does not.** A
> `security: PASS` derived from executing twelve hostile candidates and one derived from reading
> the diff render as the same sentence in a `{status, notes}` schema. `evidence:` is the key that
> tells them apart, and it is stated here once because three files consume it.

## The field

```yaml
nfr_validation:
  security:
    status: PASS|CONCERNS|FAIL
    evidence: measured|reasoned|unverified   # ALWAYS below status: — see "Placement"
    probes_executed: 0                       # REQUIRED when evidence: measured
    notes: '...'
```

**The path is `nfr_validation.security.evidence`, never the bare key.** The gate schema already
spends the name `evidence:` at the top level, on an unrelated block (`tests_reviewed`,
`phases_verified` / `risks_identified`, `trace`). The two are different paths and both are legal,
but they are indistinguishable by `grep` — so cite the full path in prose, and anchor on the
nesting in any test that scans a gate for this field.

## The three values

| Value | Means | Requires |
| --- | --- | --- |
| `measured` | the verdict rests on **executed** probes — hostile candidates were run against the control and their behaviour observed | `probes_executed > 0` |
| `reasoned` | the verdict rests on **reading** — the code was examined and judged, however confidently | — |
| `unverified` | **no security verdict was supplied** — nothing assessed this axis, or the assessment could not run | — |

Three rules give those values their teeth:

1. **`measured` requires `probes_executed > 0`.** Asserting `measured` with a zero count is a
   **schema error**, not a warning. Zero executed candidates is a finding, not a pass — the same
   rule `finalise-dod-security-prompt.md` applies one layer up.
2. **`reasoned` is accurate, not a failing grade.** Most verdicts are reasoned and that is fine. A
   reviewer who writes `measured` to avoid looking bad is defeated by rule 1 on the count and by
   nothing else; beyond that this is a cultural control, and it is worth saying so plainly rather
   than pretending the schema closes it.
3. **A missing `evidence:` key reads as `unverified`.** Not as a parse failure, and not as
   `reasoned`. Every gate written before this field existed has no key, and the honest reading of
   such a gate is *nothing is known about how this verdict was reached*.

## Placement — the one hard constraint

**`evidence:` goes after `status:`. Never between `security:` and `status:`.**

`references/qa-re-review-scope.md`'s clause-1 probe is an `awk` scan that takes the **first**
`status:` line after `security:`. A key that reaches that slot first changes what the probe reads,
and the probe fails **closed and silently** — the security carve-out simply stops firing, with
nothing saying so. This is not hypothetical: the same file records an earlier `\s`-vs-POSIX bug
with exactly that signature.

The constraint is pinned by tests, not by this paragraph:
`evals/shared/tests/qa-re-review-scope-parity.test.mjs` executes the real probe against fixtures
carrying `evidence:` in the sanctioned position and against the forbidden one.

## Fail open, deliberately — and why that is the opposite of clause 1

Clause 1's `status` reading fails **closed**: an unreadable gate yields `SAFETY_REPROBE=false`.
The evidence reading must fail **open**: an absent key yields `unverified`, which **fires** the
trigger.

The inversion is deliberate and is the whole point of the field. Written the other way, every gate
that predates this change reads as "no trigger", and the addition accomplishes nothing while
appearing to work — which is the `\s` bug in a new place.

## Where the values come from

`review-security` produces a machine block that a QA cycle may lift:

```yaml
security_review:
  probes_executed: 12
  evidence: measured      # measured | reasoned
```

**Its domain is narrower than this one, and the nesting is intentional.** A review that ran always
reaches `measured` or `reasoned`; it has no third answer to give. `unverified` is **gate-only** —
it is the value the gate carries when no review supplied a verdict at all. So:

```
{measured, reasoned}  ⊂  {measured, reasoned, unverified}
   review-security              the QA gate
```

Do **not** add `unverified` to `review-security`, and do **not** drop it from the gate. Consuming
the block is **optional**: `qa-story` / `qa-task` own this field; `review-security` advises.

## See also

- [`qa-re-review-scope.md`](qa-re-review-scope.md) — the trigger that reads this field
- [`security-review-prompt.md`](security-review-prompt.md) — the producer's machine block
- [`finalise-dod-security-prompt.md`](https://github.com/Gamaroff/agent-skills/blob/develop/shared/resources/finalise-dod-security-prompt.md) — the `probes_executed`
  precedent, at the DoD layer
