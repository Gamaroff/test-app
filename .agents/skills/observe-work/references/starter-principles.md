# Starter principles

> **Load when** the log is empty and the user asks for a seed set to start from.

An **optional** seed set. Never pre-populate it silently: the principles file's authority comes from
the adopter's own evidence trail, and a file that opens with a dozen imported rules nobody earned is
a file the next review has no basis for pruning.

Every entry below carries `**Origin:** imported from starter set`. That marking is the point — it
lets a later review treat these exactly like any other rule and remove the ones this project's
evidence does not support.

**How to use this file:** copy the entries that match the work into the project's cross-cutting
principles file, keeping the Origin line. Delete the rest. Do not copy it wholesale.

---

## Instrument honesty

**A scan that returns nothing is reporting on two possibilities at once, and only one of them is a
finding.** Either there is nothing to find, or the reader is broken. Those are byte-identical from
the caller's side, so any read that can return empty needs an independent count check and a distinct
result for "genuinely empty" versus "could not read".

**Origin:** imported from starter set

---

## Evidence over presence

**Grepping the source proves the string exists, not that the behaviour works.** A check that asserts
a file contains a sentence passes on a file where the sentence is inert. Assert the behaviour.

**Origin:** imported from starter set

---

## Mutation-proving

**A passing test is not yet evidence.** For each invariant a new test claims to hold, revert the
behaviour in the source, re-run, and confirm *that* test goes red before restoring. A test that
passes whether or not the behaviour is present reports coverage that does not exist.

**Origin:** imported from starter set

---

## Recorded absence

**The absence of a judgement and the absence of a need for one are indistinguishable unless the
judgement is recorded.** Recording it does not make the judgement better; it makes the judgement's
absence visible, which is the only property that lets anything enforce it. Reject an empty value at
the boundary rather than defaulting it — a default restores exactly the indistinguishability the
field exists to remove.

**Origin:** imported from starter set

---

## One canonical location

**A procedure restated at every call site cannot be enforced.** Guards that ask "is this mention near
the right words?" are satisfied everywhere the procedure is restated, so the guard passes on the
exact regression it names. Keep the procedure in one file and forbid the literal elsewhere.

**Origin:** imported from starter set

---

## Degrade visibly

**A degraded result reported as a successful one is indistinguishable, from the reader's side, from
the work not being done.** When an operation falls back — a comment that could not be anchored, a
capture that could not be persisted, an activation that could not be verified — report the degraded
state by name, never the success it resembles.

**Origin:** imported from starter set

---

## Unenforced steps are skipped

**A step that produces no artefact is a step that eventually stops happening**, and its absence
leaves no trace. Where a rule matters, attach it to a write: a file that must exist, a count that
must be emitted, a status that must change. "Remember to consider X" is not enforcement.

**Origin:** imported from starter set

---

## Ask what to remove

**Documents accrete: every incident adds a paragraph and nothing subtracts one.** Ask "what can we
remove?" as deliberately as "what should we add?", and require a removal to name what made the step
unnecessary rather than that it feels redundant.

**Origin:** imported from starter set

---

## Mechanical triggers beat judgemental ones

**A trigger that asks the reader to classify the situation is a trigger that gets classified out.**
"When the task is complex" depends on an assessment made before the facts are in. Key on something
observable instead — a tool call, a file write, a count crossing a threshold.

**Origin:** imported from starter set

---

## State the divergence

**Where two rules in the same codebase answer the same question differently, say so at both sites
and argue for one.** Silence about the other convention is what makes the next reader assume the
difference is an oversight and "fix" the wrong one.

**Origin:** imported from starter set
