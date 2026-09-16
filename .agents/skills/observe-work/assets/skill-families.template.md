# Skill families

A _family_ is a set of skills implementing one idea — the same methodology for
different tools, the same structure for different subjects, the same companion
pattern for different base skills. The shared part drifts by default, because
each member is maintained only in the sessions that use it and nobody looks at
the set.

This file is the registry `observe-work`'s sibling check reads. Copy it to
`$OBS_WORKSPACE/skill-observations/skill-families.md` and edit it there; the copy
in `assets/` is the seed, not the live file.

## The two columns that carry the weight

- **Shared** — the material every member should carry, semicolon-separated.
  The drift audit greps each member's `SKILL.md` for each of these as a **literal
  substring**, so write the exact sentence that is in the members — not a
  paraphrase of it. A `Shared` value that reads well and matches nothing reports
  every member as drifted on the registry's first run, which teaches the reader
  to ignore the check.
- **Member-specific** — what legitimately differs, and why. An absence is checked
  against this column **before** it is called drift, and that check is a substring
  test too, in both directions. Without it, every rule looks like it might apply
  everywhere and the audit generates noise instead of signal.

## Deciding what "fix the drift" means

That is a judgement you make per family, not something the audit can make for
you. Two models cover almost every case — record which one applies in the
family's own notes:

| Model | Meaning | Fixing drift means |
| --- | --- | --- |
| synced-duplicates | each member is self-contained and shared sections are kept in sync | edit every member |
| shared-core | one skill holds the common material; the others load it as a companion | edit the core once, then check the pointers |

Guidance only. Neither the parser nor the audit reads that table — it has three
columns, and `parseFamilies()` skips any row with fewer than four.

## Format

`parseFamilies()` (`observation-log.js`) skips every line not starting with `|`
and every row with fewer than four cells. It reads
`Family | Members | Shared | Member-specific` and returns
`{ name, members, shared, memberSpecific }`. `Members` splits on `,` or `/`;
`Shared` and `Member-specific` split on `;`. A value may therefore contain commas
but never a `|` or a `;` you did not intend as a separator.

## Families

| Family | Members | Shared | Member-specific |
| --- | --- | --- | --- |
| meta-skills | observe-work, autoskill, remember-insight, double-check | Disambiguate by input: a stated insight is a memory, a finished artifact is an audit, an explicit end-of-session pass is `autoskill`, and anything noticed in passing during the work is an observation. | trigger; durable artefact; unit observed |

### meta-skills — notes

Four skills that all act on *how the work went* rather than on the work itself,
which is why a reader picking between them at invocation time needs one rule
rather than four descriptions. The `Shared` sentence is that rule, and it is
written verbatim into all four `SKILL.md` bodies.

Coherence model: **synced-duplicates**. Each of the four is invoked on its own and
must stand alone, so the disambiguation sentence is repeated rather than pointed
at. Fixing drift here means editing every member.

What legitimately differs, and why the audit must not flag it:

- **trigger** — `observe-work` is continuous, `autoskill` is asked for, `double-check`
  follows an artifact, `remember-insight` follows a statement by the user.
- **durable artefact** — the observation log, a proposed skill edit, an audit
  report, and a memory file respectively. No two write to the same place.
- **unit observed** — a session's behaviour, a session's corrections, one
  artifact, one stated insight.
