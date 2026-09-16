---
name: double-check
description: 'Adversarial self-audit of work just produced — steps out of the generation mindset and verifies the artifact against ground truth, disk state, and the original prompt rather than against chat memory. Runs four gates: empirical disk and test verification, negative-constraint and boundary compliance, independent clean-room re-derivation, and requirement-to-evidence completeness mapping. Catches hallucinated file writes, silent truncation, placeholder stubs, dropped constraints, and half-solved requirements. Emits a fixed Verification Audit Report with a PASS, AUTO-CORRECTED or BLOCKED verdict, and forbids sycophantic confirmation without evidence. Runs at most once per cycle. Triggers: double check that, verify your work, are you sure, audit that, /double-check.'
---

# Double-Check

> **The turn that produced the artifact is not evidence about the artifact.**
> Re-derive the contract from the prompt, re-read the bytes from disk, and let
> the two disagree with the transcript.

## Overview

`/double-check` is an adversarial quality-assurance pass over work that has just
been produced — normally by the agent running it. It exists because generation
and verification are different jobs: a model finishing a task carries forward its
own plan, its own assumptions, and a transcript that reads like proof. This skill
discards that carry-forward and rebuilds the picture from two sources that cannot
lie about themselves: **the user's original words** and **the current state of
disk**.

It is a **gate**, not a second implementation pass. It verifies, corrects
narrowly, and reports. It never redesigns, never expands scope, and never
approves on the strength of the conversation alone.

Sibling skills, for orientation:

- **`/review-code`** — adversarial review of a *diff*, for bugs and cleanups.
  `/double-check` audits a *deliverable* against its *contract*, which may be
  prose, a plan, a calculation, or a config as readily as code.
- **`/qa-story`, `/qa-task`** — full QA gates bound to a tracked work item, with
  a gate file and traceability artifacts. `/double-check` needs no work item and
  writes no gate.
- **`/finalise`** — Definition-of-Done acceptance. Runs after the work is
  believed correct; `/double-check` is what establishes that belief.

## When to Use This Skill

- The user says "double check that", "verify your work", "are you sure?", "did
  you actually do that?", "audit that".
- Immediately after a multi-step edit, refactor, migration, or file-generation
  turn, before reporting completion.
- Before handing an artifact to another agent, a PR, or a human reviewer.
- After any turn where tool output was long, was truncated, or was not read back.

Do **not** use it as a general code review (`/review-code`), as a QA gate for a
tracked story or task (`/qa-story`, `/qa-task`), or to keep polishing an artifact
the user has already accepted.

### Related: `observe-work`

`double-check` audits the artifact just produced — does it match the disk, the
constraints and the original request. `observe-work` observes the *behaviour*
that produced it.

They meet at the findings. A `double-check` finding that generalises beyond this
artifact — a rule the agent violated, a gate that failed to fire, a step no skill
covers — is exactly the shape of an observation, and is worth logging as one.
Fixing the artifact leaves the behaviour that produced it unchanged, so an audit
that ends at the fix will surface the same class of defect again next session.

Disambiguate by input: a stated insight is a memory, a finished artifact is an audit, an explicit end-of-session pass is `autoskill`, and anything noticed in passing during the work is an observation.

## Arguments

Invoke as `/double-check [target] [--report-only] [--fresh-eyes]`.

| Arg             | Values                                                     | Default                    | Meaning                                                       |
| --------------- | ---------------------------------------------------------- | -------------------------- | ------------------------------------------------------------- |
| `target`        | a path, a glob, a step reference, a claim, or _(none)_      | the preceding assistant turn | What is under audit                                           |
| `--report-only` | flag                                                        | off                        | Never auto-correct; report defects and stop                   |
| `--fresh-eyes`  | flag                                                        | off                        | Run gates B–D in a subagent that receives no reasoning trace  |

### Target resolution

1. **Explicit target** — `/double-check auth.py`, "verify step 3", "check the
   migration you wrote". Audit **only** that artifact and the requirements that
   bear on it. Do not widen the blast radius to neighbouring files, unrelated
   findings, or pre-existing defects the target did not introduce. Note
   out-of-scope observations in one line at the end; do not act on them.
2. **Default target** — no argument: the **immediate preceding assistant turn**,
   its tool calls, and every file it touched. Enumerate that set explicitly
   before auditing:

   ```bash
   git status --porcelain      # what actually changed in the tree
   git diff --stat HEAD        # and by how much
   ```

   Reconcile that list against the files the transcript *claims* were written. A
   claimed write that does not appear here is a Gate A defect, not a formatting
   quirk.
3. **Nothing to audit** — the preceding turn produced no artifact and made no
   claim of fact. Say so plainly and stop. Do not manufacture findings.

## The Cycle and the Recursion Guard

A **cycle** is one audit of one target. The guard is absolute:

> **One audit per cycle.** When the corrected artifact still shows minor defects,
> surface them to the user in the Defect Log. Never re-enter the pipeline to
> chase them.

Two clarifications that are part of the guard, not exceptions to it:

- **Verifying your own correction is inside the cycle.** A patch applied at
  Step 6 must be re-run through the specific empirical check that caught the
  defect (and, for a behavioural fix, mutation-proved — see Step 6). An
  unverified correction is a new unverified claim, which is precisely what this
  skill exists to prevent. This is finishing the audit, not starting another.
- **A user asking again starts a new cycle.** The guard binds the agent's own
  looping, not the user's right to re-run the skill.

If the audit is invoked on a target it has already audited this cycle, say so and
return the prior report rather than re-deriving it.

## Pipeline

Run steps in order. Gates A–D are sequential because each supplies evidence the
next one reasons over: there is no point checking whether logic is correct in a
file that was never written.

### Step 0 — Claim the cycle and resolve scope

Resolve the target per **Target resolution**. Record the audit's scope in one
sentence before proceeding — it becomes the boundary for every gate and the
defence against scope creep at Step 6.

### Step 1 — Reconstruct the contract from the prompt, before reading the output

**Read the user's original request first, and write down what it demands, before
re-reading the deliverable.** Reading the artifact first anchors the audit to the
solution that exists; the requirement list then quietly reshapes itself around
what was built. Ordering this step first is the cheapest anti-anchoring control
available.

Produce a numbered **requirement ledger** from the user's own words — not from
the plan, the todo list, or any restatement the agent made. One row per demanded
outcome, per negative constraint, and per boundary. Quote the phrase each row
comes from. This ledger is the input to Gates B and D.

### Step 2 — Gate A: Ground-truth and disk-state verification (empirical)

**Do not trust chat memory. Trust bytes.** Full playbook, including per-ecosystem
check commands and safety limits:
[`references/gate-playbooks.md`](references/gate-playbooks.md).

1. **Existence and content.** For every file the turn claims to have created or
   modified, read it back from disk. Confirm the claimed change is physically
   present — `git diff`, `git status --porcelain`, `sed -n` on the relevant
   range, or a `shasum` comparison where the file is binary or generated. A tool
   call that reported success is a claim, not a confirmation.
2. **Wholeness.** Check the file ends where it should. Look for truncation
   markers, an unclosed fence or bracket, a file that stops mid-function, and
   for content silently dropped by an overwrite that was meant to be an edit.
3. **Executable checks, narrowest first.** Where a runner exists: syntax check →
   type check → linter → the tests covering the change → the full suite. Stop
   escalating once a failure is found; the first red is the finding.
4. **Runnable prose.** When the deliverable is documentation containing shell
   snippets that a reader will paste and run, the snippets are part of the
   artifact and must be executed, not merely read. Detection rule and safety
   boundary: [`references/qa-runnable-prose-detection.md`](references/qa-runnable-prose-detection.md).
5. **Triage a red result before blaming it.** A failing test may indicate wrong
   code or a wrong test; decide with evidence, not preference:
   [`references/code-vs-test-validation.md`](references/code-vs-test-validation.md).

**Safety boundary.** This gate is read-and-verify. It never commits, pushes,
force-pushes, rewrites history, deploys, migrates a shared database, or bypasses
hooks. If the only available check is destructive or mutating, do not run it —
record it as unverified in the report and say why. An unverified check reported
honestly beats a green result obtained by breaking something.

### Step 3 — Gate B: Negative constraints and boundary audit

Positive requirements get satisfied because they are what the work was about.
Negative ones get satisfied by accident or not at all — an implicit default, a
familiar library, a helpful extra file — and they are the highest-yield class of
defect in this whole pipeline.

From the Step 1 ledger, extract and check every:

- **Prohibition** — "do not…", "never…", "without using…", "no new
  dependencies", "don't touch X".
- **Boundary** — length and token caps, version pins, target runtime, output
  format, file location, naming scheme, language, tone.
- **Exclusivity** — "only…", "just…", "nothing else".

For each, state the *evidence* that it holds, not the belief that it does: the
grep that returns nothing, the lock file that did not change, the word count, the
version string on disk. **A constraint checked by recollection is unchecked.**

Then ask the question the gate exists for: **did any default override a
constraint?** Scaffolding a config the user did not ask for, adding a dependency
because it is conventional, reformatting a file wholesale, "improving" prose that
was specified verbatim — each is a silent override.

### Step 4 — Gate C: Independent derivation (clean-room)

For anything deterministic with no external oracle — arithmetic, algorithmic
logic, regex, date and timezone maths, unit conversions, SQL predicates, state
machines, config precedence:

1. **Prefer execution over derivation.** If the result can be computed — a
   `node -e` or `python3 -c` one-liner, the real regex engine, a scratch script
   in the session scratchpad — compute it. An executed result is evidence; a
   re-derived one is another model output with the same failure modes as the
   first. **A mental re-derivation never overturns an executed result.**
2. **Derive only when execution is impossible**, and then derive from the problem
   statement alone — not from the produced solution, which you must not re-read
   until your own result exists. Compare afterwards. On disagreement, both are
   suspect until one is grounded.
3. **Scan for lazy abstractions**: `TODO`, `FIXME`, `XXX`, `pass  # implement`,
   `throw new Error("not implemented")`, `...`, `// rest unchanged`, `<snip>`,
   stub returns, hard-coded values standing in for logic, and mock data presented
   as a working integration.

   ```bash
   grep -rnE 'TODO|FIXME|XXX|not implemented|rest unchanged|\.\.\.$' <changed files>
   ```

   A placeholder inside a deliverable claimed as complete is a defect regardless
   of how reasonable it looks.

Full technique list and the deterministic-domain checklist:
[`references/gate-playbooks.md`](references/gate-playbooks.md).

### Step 5 — Gate D: Intent and completeness

Walk the Step 1 requirement ledger and map **every** row to a concrete, named
piece of evidence in the deliverable — a file and line, a test name, a command
output. Then classify each row:

| Status         | Meaning                                                          |
| -------------- | ---------------------------------------------------------------- |
| `satisfied`    | Evidence exists and was verified in Gate A–C                      |
| `partial`      | Some of the requirement is met; name precisely what is missing    |
| `bypassed`     | Met in appearance only — stubbed, mocked, hard-coded, or renamed  |
| `unaddressed`  | No evidence at all                                                |
| `descoped`     | Dropped **and** explicitly flagged to the user at the time        |

A row that cannot be pointed at is `unaddressed`, not `satisfied`. "Dropped
quietly" is never `descoped`; silence is the defect.

Also check the inverse — **work delivered that nobody asked for**. Unrequested
files, refactors, renames, and dependencies are Gate D findings too: they are
scope the user did not agree to and now has to review.

### Step 6 — Resolve

| Situation                                                                  | Verdict          | Action                                             |
| -------------------------------------------------------------------------- | ---------------- | -------------------------------------------------- |
| Every gate produced evidence and no defect                                  | `PASS`           | Report the evidence. Nothing else.                  |
| Defects found, all unambiguous and safely fixable inside scope              | `AUTO-CORRECTED` | Patch, verify the patch, report both                |
| Requirements conflict, the intent is ambiguous, or the fix needs a decision | `BLOCKED`        | Do not guess. State the exact question             |
| Real defect the auditor must not fix unilaterally                           | `BLOCKED`        | Report it and state the decision the user must make |

**Correction policy.**

- **Fix defects; do not improve the artifact.** In scope: the specific
  discrepancies in the Defect Log. Out of scope: style, structure, adjacent
  bugs, anything the target did not introduce.
- **Patch to disk, then show the diff.** For file-backed work, apply the change
  and report `git diff` for it. Do not paste whole files back into the
  conversation: the chat copy immediately competes with disk as the source of
  truth, which is the exact confusion this skill exists to remove. Reserve the
  full drop-in replacement for artifacts that live only in the conversation
  (a snippet, a message, a block of prose the user will copy by hand).
- **Verify every correction.** Re-run the check that caught the defect. For a
  behavioural fix with a test, mutation-prove it — revert the behaviour, confirm
  *that named test* goes red, restore, confirm green:
  [`references/mutation-proving.md`](references/mutation-proving.md).
  An unproved fix is reported as applied-but-unproved, never as verified.
- **`--report-only` forces the fix path off.** Defects are reported; the verdict
  stays `BLOCKED` if any defect is material, and the report says the correction
  was withheld by flag.
- **Never fix by deletion.** Removing a failing test, loosening an assertion,
  widening a type to `any`, or catching and swallowing an error is a new defect,
  not a correction.

### Step 7 — Report

Emit the report in the schema below. Nothing precedes it, and nothing follows it
except a one-line note of any out-of-scope observations.

## Response Schema (mandatory)

```markdown
### Verification Audit Report

* **Verdict:** [PASS | AUTO-CORRECTED | BLOCKED (Ambiguity/Conflict)]
* **Evidence & Empirical Checks:** (Test outputs, git diff findings, or clean-room calculations)
* **Defect Log:**
  - `[Constraint / File / Line]`: Specific discrepancy, hallucination, or omission identified.
* **Corrected Deliverable:** (If defects were found, provide the complete, drop-in replacement or state the exact patch applied to disk. If BLOCKED, state the exact user clarification required.)
```

Rules that bind the fields:

- **Verdict** is exactly one of the three. No hedged compounds, no "PASS with
  minor notes" — a material defect is not a PASS.
- **Evidence** carries what was actually run and what came back: commands,
  exit statuses, failing test names, the computed value from a clean-room check.
  A gate that could not be run is listed as **not verified**, with the reason.
  Never write "verified" beside a check that did not execute.
- **Defect Log** is empty only on a genuine `PASS`, and each row anchors to a
  constraint, a file, or a line — never a vague impression. Residual minor
  defects left unfixed under the recursion guard are listed here, marked
  `residual — not corrected`.
- **Corrected Deliverable** states the patch applied to disk (with its diff) or,
  for chat-only artifacts, the complete replacement. On `BLOCKED`, it holds the
  precise question, with the candidate readings spelled out.

## Discipline: No Sycophancy

The failure mode this skill most often has to resist is agreeing with itself.

- **Never confirm without evidence.** "Looks correct", "everything checks out",
  "the implementation is solid" are prohibited unless each is followed by the
  command that showed it.
- **No flattery, no reassurance, no praise for the prior turn** — the prior turn
  is the defendant.
- **Finding nothing is a legitimate result, but it must be earned.** A `PASS`
  with a thin Evidence field is an audit that did not happen; run the gates.
- **Do not soften a defect** into a "possible improvement" or a "nit". Name it.
- **Report unverifiable things as unverified.** Never bridge a gap in evidence
  with a plausible inference. If the sandbox blocked the test run, say the test
  run was blocked.
- **The transcript is not evidence.** "I already checked that" is not a finding;
  the check output is.

## Known Limits

State these in the report when they apply — they are the honest bounds of the
gate, not disclaimers to pad it with:

- **Self-audit is not independent review.** The same model that produced the
  artifact shares its blind spots. Gates A and C mitigate this by grounding in
  disk state and executed results; Gates B and D do not have that anchor, which
  is what `--fresh-eyes` is for — dispatch a subagent that receives the original
  prompt and the artifact, and none of the reasoning that produced it.
- **A green check bounds what was checked, nothing more.** A passing suite is
  evidence about the tests that exist, and silent about behaviour no test names
  — see the measured gap in
  [`references/mutation-proving.md`](references/mutation-proving.md).
- **The gate cannot audit requirements the user never stated.** Unstated
  expectations surface as `BLOCKED` questions at best, and not at all at worst.

## Design Notes and Deliberate Deviations

Points where this skill resolves a tension in its own specification. Each is a
deliberate choice, recorded so a future editor does not "fix" it back:

1. **Contract reconstruction precedes reading the artifact** (Step 1). Not in the
   original brief; added because auditing output-first anchors the requirement
   list to the solution and reliably hides omissions.
2. **The recursion guard admits correction-verification** (see the guard).
   Verifying a patch is completing the audit that produced it. Without this,
   `AUTO-CORRECTED` would ship unverified changes — the failure this skill is
   built to catch.
3. **Patch-to-disk is the default over a chat drop-in replacement** (Step 6).
   The brief allows either; for file-backed work the pasted copy competes with
   disk as source of truth. Full replacement is kept for chat-only artifacts.
4. **Gate C prefers execution to derivation** (Step 4). The brief specifies an
   internal scratchpad. Mental re-derivation is another sample from the same
   model; where an oracle can be executed, it outranks derivation absolutely.
5. **`BLOCKED` absorbs "real defect, must not fix unilaterally"** (Step 6). The
   mandated three-verdict enum has no "found but not corrected" state. Rather
   than extend the enum, such defects resolve to `BLOCKED` with the decision
   named — preserving the schema without silently upgrading a defect to `PASS`.
6. **Gate A is bounded away from mutating and destructive commands** (Step 2).
   "Run the tests" is not unconditional: a suite that deploys, migrates, or hits
   shared infrastructure is left unrun and reported as unverified.
