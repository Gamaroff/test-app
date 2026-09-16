# Signals — what is worth logging

> **Load when** you are deciding whether something is worth logging, or what to log about it.

The full catalogue behind `SKILL.md` § "When to observe". The body carries the five headline
categories because the judgement is made continuously; this file carries the discrimination, which
is only needed when the judgement is close.

---

## The three shapes an observation takes

Every observation is one of these. Naming the shape first is what stops a vague "this was annoying"
from being filed as a rule nobody can act on.

### New-skill signals

A task needed a coherent body of judgement that **no skill supplies at all**.

Log one when: the same undocumented procedure is reconstructed from scratch twice; a domain with its
own vocabulary, failure modes and gotchas is being handled entirely from general knowledge; a user
explains a workflow that will recur.

Record it in `proposes_skill:` with a working name. That field is independent of `skill:` — an
observation can both propose a new skill and name existing ones it touches.

**Not a new-skill signal**: a single missing paragraph in a skill that otherwise covers the area.
That is an improve signal, and proposing a skill for it fragments the area into two files that then
drift.

### Improve signals

A skill exists and is **wrong, incomplete, or silent** where it should speak.

Log one when: a rule was followed and produced the wrong outcome; a documented step does not work as
written; the skill covers the happy path and the failure you hit is unmentioned; two skills in a
family disagree.

The most valuable improve signal is a **rule the agent violated**. A rule that gets violated is
either not discoverable at the moment it applies, or not phrased as an instruction. Both are defects
in the skill, not in the reader.

### Simplify signals

Something a skill tells you to do is **no longer worth doing**.

Ask "what can we remove?" as deliberately as "what should we add?" Skills accrete: every incident
adds a paragraph and nothing subtracts one, so the always-loaded cost rises monotonically until the
body stops being read. A simplify signal is the only counter-pressure that exists.

Log one when: a step guards against a hazard that has since been made structurally impossible; two
sections say the same thing; a caveat has never once applied; a procedure was written for a tool
that has been replaced.

> **A simplify signal must name what made the step unnecessary**, not merely that it feels
> redundant. "This paragraph is long" is not evidence. "This paragraph mitigates an octal-parse
> hazard that no longer exists because the engine parses base-10 explicitly" is.

---

## The generalisability test

Before writing, answer all four. If any answer is "no", the observation is not yet ready — sharpen it
rather than logging it half-formed.

1. **Could a future session in a different project hit this?**
   If it is specific to one file in one repo, it belongs in that repo's notes, not in a skill.

2. **Is it phrased as a rule rather than an incident?**
   Log the rule, not the incident:
   > ❌ "the user preferred a table here"
   > ✅ "the skill lacks guidance for deciding when a table beats prose"

3. **Would applying the rule have changed the outcome?**
   If following it would have produced the same result, the rule is decoration.

4. **Can a reviewer tell whether it has been applied?**
   A rule whose satisfaction is unobservable cannot be enforced and will not be.

---

## What never to log

| Do not log | Why |
|---|---|
| One-off project facts ("the API key lives in `.secrets/`") | Belongs in project memory or the repo's own docs. Use `remember-insight` |
| Bugs in the code being worked on | Belongs in the bug tracker. An observation is about the *skill*, not the deliverable |
| The agent's own transient mistakes with no rule behind them | A typo is not a signal. A typo the skill's own example induced is |
| Anything you would not want recorded | The log is committed. See the confidentiality layers in [`applying-updates.md`](applying-updates.md) |
| Restatements of an already-open observation | Check the scan first. Duplicates make the backlog look larger than the work is |
| Praise | "The skill worked" is the expected state and carries no action |

**Secrets, credentials and customer content never enter the log**, in any field, including quoted
user words. Refer to people by role.

---

## Where the mindset stays on

Not only during execution. Three moments produce disproportionately good observations and are all
easy to miss because the "work" feels finished:

- **The correction itself.** The moment the user redirects is the highest-signal moment in the
  session, and it is also the moment you are most focused on recovering. Write it before recovering.
- **The post-task discussion.** "That took longer than I expected" and "why did you do it that way?"
  are observations in conversational clothing.
- **The review of your own output.** A gap you notice while checking your work is a gap the skill
  did not close.

---

## Filling the fields

| Field | How to fill it well |
|---|---|
| `title` | The rule, compressed. A reviewer scanning titles should be able to triage without opening the file |
| `skill` | Always a list. First entry primary. Empty is legal when the observation proposes a new skill and touches no existing one |
| `proposes_skill` | Working name only. Independent of `skill:` |
| `siblings_checked` | **Mandatory, never blank.** Name the family, the members evaluated, and the verdict. `none` is correct — and is a recorded judgement — where the target belongs to no family |
| `type` | `open-source` or `internal`. Decides how much specificity the Principle may carry |
| `area` | The domain, not the file. "tracker transitions", not "jira-stage.js" |
| `session_context` | What was being done. On a backfill, cite the durable artefact, never a session that no longer exists |
| `reference` | Optional path to saved evidence that **outlives the session** and is resolvable by a different one |

### Why `siblings_checked` is mandatory

The two states of a one-entry `skill:` list — *siblings were evaluated and correctly excluded* versus
*siblings were never considered* — are byte-identical. Nothing downstream can tell them apart.

Recording the judgement does not make the judgement better. It makes the judgement's **absence**
visible, which is the only property that lets anything enforce it. That is why the engine rejects an
empty value at the boundary rather than defaulting it to `none`: a default would restore exactly the
indistinguishability the field exists to remove.

---

## The body: Issue → Improvement → Principle

Three sections, in this order, every time.

- **Issue** — what happened, concretely enough that a reviewer who was not there can evaluate it.
- **Improvement** — the specific change to the specific skill. Name the file and, where you can, the
  section.
- **Principle** — the generalised rule, stripped of this project's specifics. This is the part that
  propagates to the cross-cutting principles file and the part that must survive being read by
  someone with no context.

The three are separate because they are consumed by different readers at different times. Collapsing
them into one paragraph produces an entry that is neither evaluable nor propagatable.
