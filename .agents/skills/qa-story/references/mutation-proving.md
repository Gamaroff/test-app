---
name: mutation-proving
description: How to establish that a test would actually fail if the behaviour it names regressed — snapshot the source, break the behaviour, assert the edit landed, name the test you expect to go red, re-run, confirm THAT test is red, restore from the snapshot, confirm green. Organised around what a mutation run can tell you — an outcomes table, one row per reading a run can produce, with the discriminating question and the response for each — because the predicted red and the unexpected green are only two of the readings, and the others (the wrong test red, nothing red on load-bearing code, a survivor because the wrong line was mutated, a green because the edit never applied, a red that depends on today's data, a restore that deleted the uncommitted fix) each produced a false QA finding before they were named. Also the instrument rules that make the run trustworthy, the shapes vacuity takes, and what a held proof does NOT tell you.
---
<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/mutation-proving.md. Regenerate via `npm run bundle`. -->

# Mutation-proving a test

> **A test you have read is a test you have assumed. Revert the behaviour it names
> and watch it go red — that is the only evidence it works.**

A mutation run answers one question about one test: *can this test fail?* It is
cheap, and it is the only instrument that audits the instrument. But it produces
more than two readings, and every reading below has been misread at least once
in this repository, each time into a QA report. So this document is organised
around **what a mutation run can tell you** — the procedure first, then the rules
that make the run trustworthy, then a table of readings, then the shapes vacuity
takes, then how to record the result.

## The procedure

For each invariant a test claims to hold:

1. **Snapshot the source.** `cp path/to/source.ts /tmp/pre-mutation.ts`. This is
   your restore point — not version control, see rule 1 below.
2. **Name the test you expect to go red.** Write it down before running anything.
   The prediction is what the run is checked against; a red in a different test is
   a finding, not a pass (row 2 of the table).
3. **Break exactly that invariant** in the source — one line, the smallest edit
   that makes the behaviour wrong.
4. **Assert the mutation landed.** Diff against the snapshot and see the edit in
   the output. Do not skip this and do not assume it — an edit that silently did
   not apply produces a green run that reads exactly like a passing proof:

   ```bash
   rc=0; diff /tmp/pre-mutation.ts path/to/source.ts || rc=$?
   case $rc in
     1) echo "MUTATION APPLIED — the edit is printed above; re-read it (row 10)" ;;
     0) echo "NOT APPLIED — the edit never landed; the green below proves nothing" ;;
     *) echo "NO SNAPSHOT or diff error — step 1 was skipped; stop" ;;
   esac
   ```

   **Read the exit code, not the `||`.** `diff` exits 1 when the files differ and 2
   when an operand is missing, and `diff a b || echo APPLIED` fires on both — so the
   one-liner this snippet replaced printed `MUTATION APPLIED` on the run where no
   snapshot had been taken, which is the run it exists to catch. Found by executing
   the block (rule 5 below, applied to rule 3's own instrument). Two details of the
   replacement are load-bearing too: the status is captured with `|| rc=$?` so the
   block survives `set -e` on the one exit that means "applied" (a bare `diff` then
   `case $?` died there — found by executing *that* block); and the diff is printed,
   not `-q`, because the row-10 re-read needs to see the edit.

   Make the edit itself fail loudly: a Python `assert new != old` after
   `str.replace`, a `grep -c` before and after, a line count that must change.
   Never a silent fallback on the edit — `|| true`, `2>/dev/null ||` — because a
   fallback that swallows "pattern not found" turns a no-op into a green.
5. **Re-run the suite** — the exact command the matrix uses, from the same
   directory.
6. **Read the outcome against the table below.** Not "did something go red" —
   *which* test went red, and does it match step 2.
7. **Restore from the snapshot.** `cp /tmp/pre-mutation.ts path/to/source.ts`.
8. **Confirm green again, before the next mutation.** A non-green baseline here
   means the restore took something with it (rule 1); stop and find out what.

## Instrument rules

Six rules, each from a run that produced a confident wrong number. They are about
the run, not the test: a run that breaks one of these reports on itself, and its
output is shaped exactly like a reading about the code.

1. **Snapshot and restore with `cp`, never with version control.** `git checkout --`,
   `git restore`, `git stash pop` and `git clean` all restore **committed** state.
   A fix under proof is by definition uncommitted, so any of them silently reverts
   the fix along with the mutant — and every later "proof" measures the fix's
   absence, which reds a superset of what any single mutant reds. Four proofs were
   recorded this way: two were false positives and the two genuine ones reported
   inflated counts. `git status` reading `clean` is not the check — a clean tree is
   exactly what a destroyed uncommitted fix looks like.
2. **Baseline green between mutations, with the exact matrix command.** Before the
   first mutation and after every restore. This is what converts rule 1's failure
   from forty minutes of silent wrong numbers into an immediate loud one, and it is
   what catches a refusing guard or a bad runner flag before any mutation exists to
   blame (rows 9 and 13).
3. **Assert the mutation applied.** Step 4 of the procedure. "The suite stayed
   green" and "the edit never happened" are byte-identical from the runner's
   output. Report the before/after count of the thing mutated —
   `M5: occurrences 2 → 0, then red` — so the record carries the evidence.
4. **Predict the red test, then compare.** Step 2. A suite with any redundant
   coverage will go red on *some* test under most mutations, which is why the
   count is the reassuring answer and the identity is the informative one. A red
   in an unpredicted test is a finding about the predicted one.
5. **Ask what the probe would print if it were broken.** Before reporting any
   probe result — a mutation, a `grep` over a table, an execution check — answer
   that question. If the answer is the same thing it just printed, the result is
   not yet evidence. A pattern that matches nothing and a subject that contains
   nothing are the same output; show one positive control before trusting a zero.
   Three probes in one QA cycle lied this way, and two would have been false
   findings. The shortest example is in this document: the applied-check in step
   4 was once `diff a b || echo APPLIED`, which prints APPLIED when the snapshot
   file does not exist — a probe that answers "yes" whether or not it ran.
6. **A helper that runs a process returns `{ ok, value }`, never one value.** A
   helper that returns `null` for both "the process refused" and "the process
   resolved to empty" has collapsed exit status and output into one signal, and
   every refusal test written over it passes vacuously — a warn-and-continue
   implementation exports the empty string, which is what refusal also looks like.
   When a test's name contains *refused*, *rejected*, *halts* or *non-zero*, its
   assertion must read the status, not the falsiness of a payload.

And one rule about the check itself rather than the run: **a check is blind to
whatever it does not iterate.** A consistency check between two collections that
walks one of them catches every mismatch and no absence — a document with no
registry row is never visited, because it is not a row. Proving a check can fail
says nothing about what it can see. State which collection drives the walk, drive
it from both, and give each direction its own non-vacuity floor.

## What a mutation run can tell you

One row per reading, in the order a reviewer meets them under QA-cycle pressure.
Find the row that matches what you saw; the third column is the question that
tells this row from the ones beside it, and the fourth is what to do. **Row 1 is
the only reading that means "covered".** Everything else is a finding —
about the test, the mutation, the fixtures, or the run — and each is recorded with
its own outcome token (see *Recording it*).

| # | What you saw | What it may mean | Discriminating question | Then do | Outcome token |
| - | ------------ | ---------------- | ----------------------- | ------- | ------------- |
| 1 | The **predicted** test went red | Covered — the test observes the behaviour | Is that test committed, and does it red without today's corpus? (rows 11, 12) | Restore, confirm green, record which test | `covered` |
| 2 | A **different** test went red, the predicted one stayed green | The predicted test asserts something weaker than the property it is named for — a parity test comparing verdicts when the divergence is in the body | Which test was *supposed* to red? Does it read the actual invariant or a proxy for it? | Fix the predicted test to assert the invariant; re-mutate; require *that* test red | `wrong-test-red` |
| 3 | Nothing went red | **Did the mutation apply?** | Does the diff against the snapshot show the edit? Did the before/after count change? | If not: the run measured nothing. Fix the edit (rule 3), re-run. Record the void run, do not silently replace it | `mutation-void` |
| 4 | Nothing went red, and the diff shows the edit | **Does the mutated line feed the assertion?** An early exit removed while the loop still returns the value, a log line, a comment, a branch the code re-enters | Did the mutation change the *value the assertion reads*, or only produce a diff? | If not: wrong line. Mutate the value under test; re-run. Record the discarded mutation — "we tried X and it survived" is evidence a reader will otherwise re-derive | `mutation-void` |
| 5 | Nothing went red, the mutation reached the assertion, **and the code is dead** | Redundant source — something else already enforces it, or nothing can reach it | What is this branch *for*? Can any input reach it? Does another check already refuse the same case? | Delete it, or make it defend a case nothing else covers. Record why it was dead | `no-red-dead` |
| 6 | Nothing went red, the mutation reached the assertion, **and the code is load-bearing** | The **tests** are the defect — no fixture reaches this branch. The dangerous twin of row 5: same reading, opposite response, and the tempting move for both is deletion | What does the branch compensate for? (A traversal that stops yielding directories; a fallback for a case a fixture never constructs.) The argument is about the code's contract, not about the tests | Write the missing fixture, re-mutate, confirm it now reds. Then row 1 — but record that it reds *after* a test was added | `no-red-untested` |
| 7 | Nothing went red, and **no fixture instantiates the input class** the code branches on | Shape 7 below. The test observes correctly and is never shown the input — a case-fold on a path with every fixture path lowercase; a separator, encoding, sign, empty-vs-absent | For each transformation the code performs, what input class distinguishes it, and does the corpus contain one? | Add a fixture from that class. No mutation can find this row for you; only the question can | `no-red-untested` |
| 8 | Nothing went red, and a **downstream fallback** absorbs the change | The mutation changes behaviour, a fallback corrects it, the assertion cannot see the difference | Have you *searched* for a distinguishing input, or only reasoned toward one? | **Search, don't reason**: enumerate short strings over the alphabet the code branches on, run both builds, diff. If no input distinguishes them, the guard is unobservable through the public surface — *that* is the finding | `absorbed` → then `covered` or a finding |
| 9 | Red, but the suite **never ran** — a guard refused it, the runner threw on a flag or an import, the wrong interpreter was picked up | Environmental refusal or invocation error. Nothing was measured; the row is not a kill *and not a survivor* | Was the baseline green with this exact command (rule 2)? Read the *first* error, not the summary line | Fix the environment, re-run | `not-run` |
| 10 | Red — but the edit changed something other than the value under test | Wrong thing mutated: `STATU S="ready"` instead of `STATUS="blocked"`. A real diff, an expected red, and the proof is void because the script broke rather than the behaviour changing | Re-read the edit: does it express the behaviour you meant to break? | Discard, record, re-mutate. This is the one check nothing mechanical performs | `mutation-void` |
| 11 | Red — but **only because of today's data** | A check that reads live repository state reds while the corpus happens to disagree with itself, and stops redding the moment the corpus is tidied — possibly inside the same pipeline run | Would this still red if the corpus were fully consistent? Is the red backed by a *committed* test with a synthetic fixture? | Write the synthetic-fixture test. Extract the predicate and call it from both the corpus path and the fixture path — a fixture that **re-implements** the predicate tests the rule and leaves the implementation free to drift | `data-dependent` → `covered` once the fixture lands |
| 12 | Red in a **development-time** assertion only — an ad-hoc mutation, a REPL, a probe that was never committed | Evidence about a moment, not coverage. The next reader sees a satisfied criterion with no test behind it | Is there a committed test that reds under this mutation? | Commit the test, or record the criterion as `dev-only`, never as covered | `dev-only` |
| 13 | Baseline **not green after a restore** | The restore took the fix with it (rule 1), or the restore missed a file | `git status` cannot tell you. Which restore point did you use? | Stop. Restore the fix from its snapshot. Every proof since the bad restore is void | `not-run` |

Two readings deserve a sentence each beyond the table.

**Rows 5 and 6 are the same observation and opposite conclusions**, and the
mutation result cannot tell them apart — it takes an argument about what the
branch is for. Both happened in one task, out of eighteen mutations: a byte-bounded
search window that reded nothing because every fixture was short, and a
symlinked-directory branch that reded nothing because no fixture had one — yet the
branch compensated for a traversal change and deleting it would have traded one
blind spot for another with a green suite either way. Writing "18 proofs, all red"
hides that two of them reded only *after* a test was added, which is the more
interesting fact.

**Row 2 is the one a redundant suite hides best.** A QA fix added a regression
test asserting two code paths agree; mutating the code reded the suite, so the fix
looked held. Only one test had gone red, and it was a *structural* test — the
parity test written for the property passed, because it compared verdicts and the
divergence produced identical verdicts on every input. Had the structural test not
existed, the count would still have been non-zero and the parity test would have
shipped asserting nothing about what it was named for.

## What a held proof does not tell you

A mutation proof falsifies **a check that exists**. Behaviour that no test names
has nothing to revert, so a proof run is silent about it — not reassuring, silent.

Task 67 measured the gap. **Nine proofs were recorded and four re-run
independently in QA; all four held — while thirteen fail-open routes sat in the
shipped classifier.** Every proof was honest: each reverted a real behaviour and
turned the right test red. Not one of them could have found the thirteen.

So after a proof run the open question is no longer *are these tests real?* — you
have just answered that. It is *what is not tested at all?*, and that takes a
different instrument: adversarial input generation against the real subject, not
more proofs. And it is *what input classes does the corpus never instantiate?* —
row 7, which no mutation can answer either.

> A held proof is evidence about a test. It is not evidence about coverage.

## When the proof does not go red

Rows 3–8 of the table, seen from the test's side. Three causes, and only the first
is a defect in the test:

| The suite stayed green because | Signal | Response |
| ------------------------------ | ------ | -------- |
| the test cannot observe the behaviour | **vacuous test** | the shapes below; fix the test |
| something else already enforces it | **redundant source** | the reverted code may be dead — decide whether to delete it, or make it defend a case nothing else covers |
| the behaviour was never what you thought | **wrong premise** | the finding or fix rests on a false mechanism — verify the mechanism before writing anything |

— and before any of those, **two causes that are about the mutation, not the
test**: it never applied (row 3), or it applied to a line that does not feed the
assertion (row 4). A surviving mutant is a claim about the mutation before it is a
claim about the test, and the cheap discriminator — *does the mutated line change
what the assertion reads?* — has to be run before the expensive conclusion that
coverage is vacuous. One `if (!neverRan(r)) break;` → `if (false) break;` left a
suite green and was read as vacuity; it had only removed an early exit, the loop
still returned a real result, and nothing was wrong with the test. Mutating the
shell to a nonexistent binary killed it at once.

A vacuous test is the worst of the three: it passes whether the behaviour is
present or not, so it reports coverage that does not exist.

**An unheld proof is a finding, not a nuisance.** Investigate before strengthening
the test — strengthening first is how a wrong premise gets hard-coded into the
suite that then defends it. Both of task 67's unheld proofs were rows two and
three, and in both the vacuous-test response would have been the wrong one.

**Redundant source.** Disabling the `COMMAND_RUNNERS` check broke nothing: those
commands were already absent from the allow-list, so the set was dead code.

> A better test would have papered over that. The fix was a precedence test that
> made the set defend a plausible future edit.

**Wrong premise.** Removing `--timeout` validation broke nothing, because
`spawnSync` *throws* on `NaN` and on negative values — the finding's stated
mechanism was simply wrong. The real hole was `--timeout 0`.

> Strengthening the test would have hard-coded a fiction. Measure the mechanism
> first; the proof is what told you the story was false.

**Report the vacuous test as a finding rather than quietly replacing it.** A cycle
that silently repairs its own instrument reports a cleaner history than it earned,
and the next reader cannot tell a suite that was always sound from one that was
fixed mid-run.

## When the proof goes red for the WRONG reason

Rows 2, 9, 10, 11 and 12, and the more dangerous half. A green run that should
have been red *announces itself* — you predicted red, you got green, you go
looking. A red run that should have been green announces nothing: red was the
prediction, red is what arrived, and the reading is recorded as a kill.

**A false RED is worse than a false GREEN, and the asymmetry is not about
frequency.** A false GREEN leaves one invariant unproven and the matrix says so —
the row is a survivor, and a survivor is a finding. A false RED writes `dead` into
a row nothing ever executed, so the matrix certifies coverage that was never
exercised, while looking exactly like diligence. The failure is silent on the side
that reports success.

> *"A red test isn't self-validating."*

| The suite went red because | Signal | Response |
| -------------------------- | ------ | -------- |
| you broke the behaviour the **named** test observes | **a real kill** | the proof holds — restore, confirm green, record which test |
| a **different** test than the one you named went red | **wrong test red** | the named test is the finding — it asserts a proxy, not the invariant. Fix it and re-mutate |
| the suite never ran — a guard refused it, the runner was missing, the wrong interpreter was picked up | **environmental refusal** | nothing was measured. Fix the environment and re-run; the row is not a survivor either |
| the runner threw before or while loading the tests — a bad flag, an unresolvable import, a syntax error your edit introduced | **invocation error** | the red is about the harness, not the behaviour. Read the *first* error, not the summary line |
| the edit landed, but changed something other than the value under test | **wrong thing mutated** | the hardest one — see the judgement below. Re-read the mutation before believing the red |
| the red depends on the corpus as it stands today | **data-dependent** | not coverage. The honest test uses a synthetic fixture and calls the same predicate the production path calls |
| the red is in something never committed | **development-time only** | not coverage. Commit the test or record the criterion as `dev-only` |

Environmental refusal and invocation error are the ones that record a whole matrix
as complete having executed **zero** tests. Both were measured: a harness driven
from a `subprocess` inherited a different Node major and the repository's own
node-major guard **refused the run** — the guard working exactly as designed is
what made the reading convincing; and a `--reporter=basic` that did not exist in
that Vitest made the runner throw while loading it. Four dead mutants each, none of
them executed.

Data-dependence was measured too, with a scheduled expiry. A criterion was backed
by three ad-hoc mutations, none committed; what survived into the tree were two
comments. It still *passed* — because the live corpus happened to contain a
disagreeing pair — and that protection was due to expire inside the same pipeline
run: simulating the post-`/finalise` state left the corpus self-consistent, and a
regression to full-string comparison then passed undetected. The first fix
computed the predicate *inline* in the fixture test, asserting the rule while
leaving the implementation free to drift; a mutation to the production comparison
would have reddened the old test and left the new one green. Caught only by
asking, before running it, what the mutation ought to red.

### Validate the probe before you trust the matrix

Three mechanical checks, then one judgement. **A matrix collected before them
proves nothing in either direction** — not that the dead mutants died, and not
that the survivors survived.

1. **Baseline GREEN, with the exact command the matrix will use.** Not a similar
   command, not the one in your shell history — the same string, from the same
   working directory, through the same runner. This is what catches a refusing
   guard and a bad flag, because both fail here before any mutation exists to
   blame.
2. **One known-bad mutation goes RED, and is killed by its named case.** Break
   something you are certain is covered and confirm *that* test fails — not "some
   test fails". A suite that cannot go red on a certainty will not go red on a
   subtlety, and one that goes red in the wrong test is measuring something else.
3. **The mutation is asserted applied** — the `diff` from step 4 of the procedure.

```bash
# 1. baseline — the exact command, unmutated
<the matrix command>            # must be GREEN before anything is mutated

# 2. a certainty — break it, confirm the NAMED test is the one that fails
<the matrix command> 2>&1 | grep '<the test that names it>'

# 3. applied — from step 4 of the procedure: exit 1 is the only "applied", and
#    the status is captured so the block survives `set -e` on that exit
rc=0; diff /tmp/pre-mutation.ts path/to/source.ts || rc=$?
case $rc in 1) echo "MUTATION APPLIED" ;; 0) echo "NOT APPLIED" ;; *) echo "NO SNAPSHOT — stop" ;; esac
```

**The three cost two more runs of the matrix command, plus a diff.** Not a fixed
number of seconds — checks 1 and 2 each run that command, so their cost is whatever
it costs, which is why this is stated as a multiple rather than a constant. Measure
it once for your suite if you want the wall-clock figure; on the repository this
document ships in, one run is 0.3 s scoped to a file and 54 s across the whole
suite, so a constant would have been wrong either way.

What makes that cheap is the comparison, not the seconds. The procedure above
already runs the suite **twice per invariant** — once mutated at step 5, once
restored at step 8 — so a matrix of any size is paying two runs per mutation
before you validate anything. Adding two more is **roughly one extra mutation's
worth, at any N**, and it buys you out of recording all N as evidence when none of
them executed. Keep it cheap anyway: a validation step expensive enough to feel
like a detour is one that gets skipped on the run where it mattered.

4. **The judgement — the mutation must change the VALUE under test, not merely
   produce a diff.** Re-read the edit and confirm it expresses the behaviour you
   meant to break.

**This fourth check is a judgement, and it is stated as one because nothing
external can perform it.** It carries no time estimate and no command. Each of the
three mechanical checks compares an observation against an expectation; this one
compares an edit against an *intent*, which exists only in your head.

Here is why it cannot be dropped. A mutation once mangled a shell variable rather
than changing its value:

```bash
# intended: change the value the test asserts on
-STATUS="ready"
+STATUS="blocked"

# what actually landed: the variable is now broken, not different
-STATUS="ready"
+STATU S="ready"
```

**That edit passes the applied-check.** There is a real diff, so step 4 of the
procedure is satisfied; the suite goes red, which is what was predicted; every
mechanical signal agrees — and the proof is void, because the script broke rather
than the behaviour changing. The applied-check closes the *"nothing happened"*
case. It does not close this one, and a reader who takes "confirm it applied" as
the whole rule will record this reading as a kill.

That is what separates this from a mutation that never applied at all. **No diff and
an unexpected green** is row 3. **A diff, an expected red, and the wrong thing
changed** is row 10, and only re-reading the mutation catches it. **A diff, an
unexpected green, and a line that does not feed the assertion** is row 4 — the same
error in the other direction.

## When to do it

| Moment | Scope |
| ------ | ----- |
| Writing a test for a new invariant | That invariant, before you call it done |
| A QA cycle that fixes a defect | The test guarding the fix — a fix without a red-going test is unwatched |
| A guard whose failure mode is silence | Always. These are the ones that rot unnoticed |
| Reviewing someone else's test | The one or two it would hurt most to have wrong |
| A fix to a boundary — validator, classifier, allow/deny-list, authorisation check | **Both directions**: that the refusal fires, *and* that legitimate input still passes |
| A check that reads live repository data | With a synthetic fixture, or the proof has an expiry date (row 11) |

Not every assertion needs this. The ones that do are the ones whose absence would
be **silent** — where the wrong behaviour reports success.

**Both directions** is not symmetry for its own sake. Proving that the refusal
fires says nothing about whether legitimate input still gets through, and an
over-strict boundary is as broken as a permeable one — it fails just as silently,
on the inputs nobody thinks to check. Two of task 67's fixes regressed exactly
there: an arithmetic placeholder `0` was read as a command name, and splitting on
`&` left the file descriptor in `2>&1` sitting in command position. No proof
caught either. A separately maintained set of legitimate patterns did — and
nothing above asks you to keep one.

## The seven shapes vacuity takes

Each of the first four was found in one task's test suite, and every one was caught
by reverting rather than by reading. The fifth was found in another, and is the one
that costs whole cycles rather than single tests. The sixth is the one with a lint —
it recurred six times in a single task before anyone named the class. The seventh
is the one **no mutation can reveal**: the first six are a test that observes
wrongly; the seventh is a test that observes correctly and is never shown the input.

**1. Asserting the wrong channel.** A CLI's contract was that stdout carries the
value a caller binds with `$( )`. The test passed `--json` and asserted the
returned *payload* instead. Deleting the line that wrote to stdout left every
caller's capture empty, with the suite green.

> Assert the channel the caller actually uses, through the interface it uses —
> a subprocess, not an in-process return value.

**2. A stub too permissive to see the change.** A test named "a title containing
a quote does not break the lookup", but the stub returned its canned response
regardless of the query it was passed. Reverting the fix — re-interpolating the
title into the query — changed nothing the stub could observe.

> A stub that ignores its input cannot witness a change to the input.

**3. Swallowed errors hiding an attempt.** A test asserted "no network call under
a restricted mode" using a *throwing* transport. The code caught its own errors,
so the call happened, the throw was swallowed, and every assertion held.

> Count the **attempt**, not the outcome. A recorder beats a thrower whenever the
> code under test has a `catch`.

**4. Matching prose that describes the behaviour rather than implements it.** A
guard asserted a skill retained a step, using a regex that also matched the
skill's YAML frontmatter *description* of that step. Deleting the actual step
left it green.

> Strip frontmatter, comments and narrative before matching. Anchor on the thing,
> not on a sentence about the thing.

**5. A textual rule standing in for a semantic property.** Whether a spec is
meaningful, un-narrowed, or actually executes is not a property of its source text.
One guard tried to prove it by pattern-matching and was defeated **nine times across
four QA cycles** — a `scope:` argument, a scope passed via a variable, a computed
key, `sourceEntries.filter(...)`, a spread, an aliased import, a call inside a fake
block comment, required titles satisfied by a **dead string**, and
`describe.skipIf(true)` switching off nine tests while the pin vouched for them. Its
own docblock claimed skip/only/todo was "a closed vocabulary, which is why this one
IS reliably checkable by text". False: Vitest also has `skipIf`/`runIf`, and property
access is not a vocabulary at all. A whole cycle went on discovering that.

> Each defeating spelling is evidence the **class** is undecidable — not that the
> rule needed one more case. Counting the spellings you have closed tells you
> nothing about the ones you have not.

Two things work instead.

- **Execute and observe.** Run the thing and read what it did, rather than reading
  what it says. But **respect the lane contract**: spawning `vitest` from a lane
  contractually specified as textual-only is what turned CI red on the cycle that
  tried it. If the guard's lane may not execute, the guard does not belong in that
  lane.
- **Make the subject its own witness.** Stop using synthetic probe files. Make the
  probe every real file, byte-for-byte, with one comment prepended — so no property
  distinguishes a probe from the file it came from, and there is no spelling for an
  author to land on that the probe does not already have.

**6. A mention standing in for a mapping.** An assertion claimed a *relationship* —
`REQUEST CHANGES` routes to `5b`, `ready-for-merge` fires at `5c`, this row owns
that action — while establishing only that both names occur in the same slice of
prose. Task 77 produced **six instances across eleven gates**, and **two of the six
were written inside the fix for the previous one**: widening the regex is the
natural repair and is the defect. The sharpest needed a negative lookahead —
`--stage ready-for-merge` is a strict PREFIX of `--stage ready-for-merge-RELOCATED`,
so a renamed call satisfied the match.

> The property under test is a MAPPING; co-occurrence is not one. Parse the
> structure and read the destination off the row that carries it — a value named
> anywhere else, including inside another row's prose, must not satisfy the
> assertion.

This shape is the one that is mechanically checkable, and **`tests/relationship-assertion-lint.test.js`
now checks it** — four rules over every test file in the repository, validated against all six
historical instances and against the two mechanisms that survived adversarial attack. It runs in
`npm run ci`. Its corpus, its measured false-positive rate and its own mutation proofs are in
[`tests/fixtures/relationship-assertion/README.md`](https://github.com/Gamaroff/agent-skills/blob/develop/tests/fixtures/relationship-assertion/README.md).

Do not read the lint as coverage of shape 6, let alone of the class. It models the
instances that happened; an instance in a spelling none of its rules models will
pass, and shape 5's warning applies to the lint itself — counting the spellings it
closes tells you nothing about the ones it does not. And it checks shape 6 only:
nothing mechanical checks the other six, and nothing can check the seventh.

**7. No fixture instantiates the input class.** A rule case-folded every captured
field, including `file:`, which is a filesystem path — so any consumer whose glob
contained a capital letter could never satisfy the rule, and the feature was
silently inoperative for them. The 32-test suite passed with the defect present,
**including the anti-vacuity fixture written specifically to prove the field was
being read**: every fixture path and every glob was lowercase, so the fold was a
no-op suite-wide. Mutating the `.toLowerCase()` changed nothing observable.

> Mutation-proving asks *can this test fail when the behaviour is removed?* It
> cannot ask *does the corpus contain an input for which this behaviour matters?*
> For each transformation the code performs — case, encoding, separators, locale,
> sign, empty vs absent — name the input class that distinguishes it and confirm
> the corpus holds one. It almost never does by accident: fixtures are written by
> the person who wrote the code, from the same mental model, which is the same set
> of inputs the code most often gets wrong.

## Recording it

State it where the claim is made, in the words of what you reverted, **naming the
test that went red** and the outcome token from the table:

```markdown
**Mutation-prove:** write a placeholder key on defer → `frontmatter-write.test` → red · covered ·
drop `dependsOn` → `ordering.test` → red · covered ·
unwrap one call site → predicted `guard.test`, got `structural.test` → wrong-test-red, fixed, re-mutated → covered ·
remove the symlink branch → nothing red, branch load-bearing → no-red-untested, fixture added, re-mutated → covered.
```

The tokens are the last column of the table: `covered`, `wrong-test-red`,
`mutation-void`, `no-red-dead`, `no-red-untested`, `absorbed`, `not-run`,
`data-dependent`, `dev-only`. **Only `covered` means covered**, and it means a
*committed* test went red under this mutation. A proof that reds only an ad-hoc
assertion, or only because of today's corpus, is `dev-only` or `data-dependent` —
a different claim from `covered`, and today they are too often written
identically. A run that reached `covered` only after a fixture was added says so;
"18 proofs, all red" is not the same fact as "16 first time, 2 after a test was
written".

A test comment carrying the same note is worth more than the commit message,
because it survives where the next reader will meet it:

```js
// Demonstrated by reverting the line: the payload assertion held while every
// caller's capture came back empty.
```

## Do not claim it unless you did it

"Every invariant mutation-proven" is a factual claim about work performed. It has
been written in a commit message and been **false** — one guard in that commit had
never been reverted, and a later review found that disabling it left the whole
suite green.

If you proved four of five, say four of five. If two of the five were
`no-red-untested` before they were `covered`, say that too.
