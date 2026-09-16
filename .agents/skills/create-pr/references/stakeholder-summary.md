---
name: stakeholder-summary
description: The plain-language lead every tracker comment opens with — what a lead is, the writing rules and the reason behind each, the dumb-it-down rule for facts that resist non-technical phrasing, and the full per-stage catalogue. The engine renders the lead from the stage value the caller already passes, so a call site cannot skip it. Referenced by the tracker comment contract rather than repeated at each site.
---
<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/stakeholder-summary.md. Regenerate via `npm run bundle`. -->

# The plain-language lead

## The rule

> A tracker comment opens with a paragraph a reader with no technical background can understand on
> its own. It answers three questions in order — **what happened**, **what that means**, **what
> happens next** — in two to four sentences, and it is followed by a `---` and then everything the
> comment used to say, unchanged.

Nothing below the rule is removed or rewritten. A stakeholder gets the gist from the first paragraph;
a developer keeps every table, path and score they had.

> **The `---` is GitHub-only, and that is accepted rather than a defect.** Jira comments are built as
> ADF, and the converter emits no rule node, so on Jira the lead arrives as its own paragraph and the
> body follows directly — delimited by the paragraph boundary alone. Teaching the converter to emit
> rules would change every Jira description this repository has ever rendered, which is a far larger
> change than a comment lead warrants.

**The lead is rendered by the engine, not written by the caller.** `tracker-comment.js` looks up the
`--stage` it is already given, renders the matching template, and prepends it. That is what makes this
a property of the system rather than a convention: a call site cannot forget the lead, because it never
supplies one, and a new stage cannot be added without one, because the engine has no template to render
and refuses to post.

Engine: [`stakeholder-summary.js`](stakeholder-summary.js) — pure, no I/O, no `process.exit`.
Composition and the guard: [`tracker-comment-contract.md`](tracker-comment-contract.md).

---

## Writing rules

Each rule carries the reason it exists. A rule whose reason is not written down is a rule that gets
argued with the first time it is inconvenient.

| Rule                                                                    | Because                                                                                                                            |
| :---------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------- |
| No file paths, no command names, no branch names in the prose           | They are the single strongest signal to a non-technical reader that a paragraph is not for them — one path and they stop reading    |
| No step numbers (`Step 5/8`)                                            | The pipeline's internal shape is not a fact about the work. A reader who does not know there are eight steps learns nothing from it |
| No score on an unexplained scale (`78/100`, `7/10`)                     | A number with no scale is worse than no number: it invites a judgement the reader has no basis for making                           |
| No unexpanded acronym — `PR`, `AC`, `DoD`, `QA`, `CI`, `NFR`            | Expand on first use, then prefer the plain phrase for the rest of the lead. "Pull request" once, then "the submitted work"          |
| No emoji                                                                | The bodies below already use emoji as section markers; repeating them in the lead makes it read as another heading rather than prose |
| Present tense, active voice, no hedging                                 | "This has been checked and works", not "It is believed that this may be functioning"                                               |
| Two to four sentences                                                   | One sentence cannot answer three questions. Five becomes a summary of the body, which is what the body is for                       |
| Every template must read correctly with **no** slots filled             | The slot-free rendering is the one that ships first, so it is the one most likely to be seen and least likely to be tested          |

That last rule is the load-bearing one, and it is a design constraint rather than a style preference.
Slots are optional by construction: `renderLead(stage, {})` must return a complete, grammatical
paragraph for every stage. A template that only reads well when fully populated goes live in its worst
form, because the callers that populate it land later.

---

## The dumb-it-down rule

Some facts have no non-technical equivalent. **Never omit them and never leave them raw.** State the
*consequence* in the lead and leave the *mechanism* in the body below.

The failure mode has two sides, and both are common:

> ❌ **Omitted**: "Testing found some issues."
> True, and useless. Which issues? How bad? Does anyone need to do anything? A reader who cannot act
> on a sentence has been told nothing, and a lead that says nothing trains people to skip the lead.
>
> ❌ **Raw**: "Two P0 findings in the auth middleware's token refresh path."
> Precise, and unreadable for the audience this paragraph exists to serve. This is the original
> problem with the lead moved to the top of it.
>
> ✅ **Consequence**: "Testing found two serious problems that would affect people signing in. They
> are being fixed now, and this work is not finished until they are. The technical detail is below."

The test to apply: **could the reader decide whether this concerns them?** That is the only question
the lead has to answer. "Two serious problems affecting sign-in" lets a product owner decide to care.
"Two P0 findings in the token refresh path" does not, and neither does "some issues".

Where a verdict is an internal token — `PASS`, `CONCERNS`, `FAIL`, `WAIVED` — **map it to a sentence,
never pass it through**. `CONCERNS` is the clearest case: nothing about the word tells an outside
reader whether it is bad news, and guessing wrong in either direction is worse than the raw token
would have been.

---

## The catalogue

One entry per value in `COMMENT_STAGES`. Slots are written `{like_this}` and are **always optional** —
the sentence must work without them.

### `work-started`

Slots: `{title}`.

> A developer has started work on this item. Nothing has changed yet in the live product; this is the
> point at which the work begins. The next update here will say what was built.

### `review`

Slots: `{outcome}`, `{blocking}`.

> Before any code is written, this item's written description is checked to make sure it is clear,
> complete and possible to build. Nothing is blocking the work from starting. The detail below is for
> the team doing the building.

### `review-story`

Slots: `{outcome}`, `{blocking}`.

> Before any code is written, the description of this piece of work was checked to make sure it is
> clear, complete and possible to build. Nothing is blocking the work from starting. The detail below
> is for the team doing the building.

### `review-task`

Slots: `{outcome}`, `{blocking}`.

> Before any code is written, the description of this piece of technical work was checked to make sure
> it is clear, complete and possible to build. Nothing is blocking the work from starting. The detail
> below is for the team doing the building.

### `review-bug`

Slots: `{outcome}`, `{blocking}`.

> This reported problem was checked to see whether it can be fixed as written — whether it is clear
> enough to act on, and whether it is genuinely still a problem. Nothing is blocking a fix from
> starting. The detail below is for the team doing the fixing.

### `develop-complete`

Slots: `{count}`.

> The building is finished. Everything this item asked for has been written, and it now goes for
> checking. It is not live yet, and it may still change if the checks find problems.

### `in-review`

Slots: `{pr}`.

> The finished work has been submitted for review. Other people now read it and test it before it can
> be added to the product. Expect either an approval or a list of changes.

### `qa-gate`

Slots: `{verdict}`, `{blocking_count}`.

> The finished work has been through testing, and the results are in. The checks found no problems.
> The detail below records what was tested and what was found.

The `{verdict}` slot never renders the raw token. It is mapped through a fixed table:

| Verdict    | Renders as                                                                                      |
| :--------- | :---------------------------------------------------------------------------------------------- |
| `PASS`     | The checks found no problems.                                                                   |
| `CONCERNS` | The checks found some problems worth knowing about, but none that stop the work.                 |
| `FAIL`     | The checks found problems serious enough that the work is not finished.                          |
| `WAIVED`   | Some checks were deliberately skipped, and the reason is recorded below.                         |

### `qa-cycle`

Slots: `{verdict}`, `{cycle}`.

> The work has been through another round of testing. The checks found no problems. If anything needs
> fixing it will be fixed and tested again before this item is finished.

A stage of the form `qa-cycle-3` resolves to this template — the trailing round number is stripped
before lookup, so a cycle-scoped comment does not need its own entry.

### `qa-fix`

Slots: `{cycle}`.

> The problems found in testing have been fixed. The work now goes back for testing again, to confirm
> the fixes hold and that nothing else broke. This item is not finished until that testing passes.

### `pipeline-paused`

Slots: none.

> Work on this item has paused automatically, because the automated assistant was about to run out
> of working memory. Nothing has been lost: progress so far has been saved, and the work will carry
> on from that point once it is restarted. No action is needed from anyone reading this.

Posted by the PreCompact hook — a shell script with no agent behind it — on both the pull request
(via `stakeholder-summary-cli.js`) and the tracker issue (via `tracker-comment.js`). Deliberately
slot-free: the hook holds only what the lock file holds, and a step number is jargon to this reader.
A stage of the form `pipeline-paused-4` resolves to this template, the same way `qa-cycle-3` does;
the suffix is the step the pipeline paused at, so each distinct pause point posts its own comment.

### `done`

Slots: `{pr}`.

> This work is finished and has been accepted. Everything it set out to do was checked and confirmed
> working, and the change is now part of the product. No further action is needed on this item.

---

## Pull-request comments

The three stages below lead a comment on a pull **request** rather than on a tracker issue. They are
listed in `PR_COMMENT_STAGES` in `stakeholder-summary.js`, and they are **not** in `COMMENT_STAGES` —
passing any of them to `tracker-comment.js` as a stage exits 2, deliberately. A paragraph about
unanchored review findings posted onto a board card would be read by exactly the people the lead
exists to spare.

> The sentence above deliberately does **not** spell that call out as a literal command line.
> `transition-protocol-parity.test.mjs` scans shipped prose for stage literals and attributes each to
> the nearest CLI named above it, so a written-out counter-example is indistinguishable from a real
> call site — and the fix for that is to describe the refusal, not to teach the guard an exception.
> An exception carved for a documented counter-example is the shape that made an earlier guard in
> this repository vacuous: it allowed a prohibited call whenever an explanatory word appeared nearby,
> every call site already carried that word, and the guard passed on the exact regression it named.
> The absolute form of the rule is the one that holds — which is why this paragraph describes that
> incident rather than quoting the identifier involved, since quoting it would trip the very guard
> that replaced it.

Everything else about them is identical: same catalogue, same slot coercion, same no-slots contract,
same jargon deny-list. There is one vocabulary, not a second one invented for pull requests.

**These three exist because those moments have no tracker equivalent — not because pull-request
comments need their own dialect.** A pull-request comment about a moment that *does* exist on the
tracker uses that same stage: `finalise`'s Definition of Done comment and its canonical summary both
render `done`, and the QA review comments render `qa-gate`, exactly as the tracker comments for those
moments do. Reaching for a new stage when an existing one names the same moment is how a second
vocabulary starts.

Obtain the lead with `stakeholder-summary-cli.js`, **once, above the GitHub/Bitbucket arm split**.
Eleven sites times two arms is twenty-two places a lead could be added, and the arms are separately
maintained prose; building the body once and handing the same bytes to both arms makes them
structurally unable to drift. Guard the call with `|| exit 1` — the CLI exits 2 on an unknown stage,
and an unguarded `$(…)` leaves the variable empty and posts a comment that opens with a bare
horizontal rule, which reads as a formatting slip rather than as a missing paragraph.

### `pr-summary`

Slots: `{degraded}`.

Rendered inside `pr-inline-comment.js` `buildSummaryBody()`, not passed in by a caller. A
caller-supplied `--summary-file` **is** the lead and suppresses this one — see
[The escape hatch](#the-escape-hatch).

> Some of the review notes below could not be attached to the exact lines of code they refer to, so
> they are collected here instead. Nothing was lost — each one names the file and line it is about.

### `board-warning`

Slots: `{what}`.

One template for all three board notices, because they differ only in *why* the board did not move,
and that difference is one clause. Pass it as `what`, without a trailing full stop — it is folded
into the middle of a sentence.

> This note is about the tracking board only, not about the work itself. The card could not be moved
> to its new column automatically, so someone will need to move it by hand. The change described in
> this pull request is unaffected.

### `dod-gaps`

Slots: `{count}`.

> This work is not finished yet. Some of the checks it has to pass are still outstanding, and they
> are listed below. It will come back here once they have been dealt with.

---

## Inline findings carry no lead, deliberately

A comment anchored to line 47 of a diff is read by one person — the developer who wrote line 47. A
non-technical paragraph on each of forty findings is noise for the only reader they have, and it
would push the actual finding below the fold. The lead belongs on the **summary** comment, which is
the one a non-technical reader reaches.

This is a design decision, not an oversight, and it is stated here because a scope line in a task
document disappears the moment the task is accepted. `pr-inline-comment.js` builds each inline body
as `marker + finding.body` and nothing else; a test in `pr-inline-comment.test.mjs` asserts that no
catalogue lead appears in an inline body, so "fixing" this would turn that test red rather than pass
silently.

---

## Worked examples

Three real bodies, before and after. The body is unchanged in every case; only the lead and the rule
above it are new.

### `work-started`

**Before**

```
<!-- agent-skills-comment:work-started -->
Pipeline started — branch: `feature/task.104.tracker-comment-plain-language-lead`
```

**After**

```
<!-- agent-skills-comment:work-started -->
A developer has started work on this item. Nothing has changed yet in the live product; this is the
point at which the work begins. The next update here will say what was built.

---

Pipeline started — branch: `feature/task.104.tracker-comment-plain-language-lead`
```

Note what did *not* happen: the branch name was not removed. It is a fact a developer wants and a
stakeholder ignores, and the lead's job is to give the stakeholder somewhere to stop reading — not to
take anything away from the developer.

### `qa-cycle`

**Before**

```
<!-- agent-skills-comment:qa-cycle-2 -->
## QA Cycle 2 — CONCERNS (78/100)

| Category | Score | Finding |
| --- | --- | --- |
| Traceability | 18/20 | AC-3 has no direct test |
...
```

**After**

```
<!-- agent-skills-comment:qa-cycle-2 -->
The work has been through another round of testing. The checks found some problems worth knowing
about, but none that stop the work. If anything needs fixing it will be fixed and tested again before
this item is finished.

---

## QA Cycle 2 — CONCERNS (78/100)

| Category | Score | Finding |
| --- | --- | --- |
| Traceability | 18/20 | AC-3 has no direct test |
...
```

This is the example that shows why the verdict is mapped rather than passed through. `CONCERNS
(78/100)` survives in the body for anyone who knows the scale. The lead says what `CONCERNS` means, in
a sentence, for everyone who does not — and it does not repeat the score, because 78 out of 100 is a
number on a scale this reader has never been shown.

### `done`

**Before**

```
<!-- agent-skills-comment:done -->
## ✅ Story Accepted — Definition of Done Verified

| Criterion | Status |
| --- | --- |
| Acceptance criteria | ✅ 7/7 |
| PR review | ✅ APPROVE |
...
```

**After**

```
<!-- agent-skills-comment:done -->
This work is finished and has been accepted. Everything it set out to do was checked and confirmed
working, and the change is now part of the product. No further action is needed on this item.

---

## ✅ Story Accepted — Definition of Done Verified

| Criterion | Status |
| --- | --- |
| Acceptance criteria | ✅ 7/7 |
| PR review | ✅ APPROVE |
...
```

The last sentence is doing real work. A `done` comment is the one a stakeholder is most likely to read
and most likely to misread as "something is expected of me" — five rows of ticks look like a checklist
addressed to the reader. Saying plainly that nothing is needed is the difference between a comment
that closes a loop and one that opens a question.

---

## Adding a stage

A new value in `COMMENT_STAGES` — or in `PR_COMMENT_STAGES` — needs a template in `LEAD_TEMPLATES` and
a subsection here. There is no optional path: the catalogue's unit test
(`stakeholder-summary.test.mjs`) imports `COMMENT_STAGES` from the engine rather than restating it, so
adding a stage without a lead turns that test red before the new stage can be used anywhere.

That import is deliberate and should not be "simplified" into a local list. Two lists of stages drift
silently and in the worst direction — the catalogue passing while the engine has a stage it cannot
render — which is the enumeration class in [`../../docs/reference/anti-patterns.md`](https://github.com/Gamaroff/agent-skills/blob/develop/docs/reference/anti-patterns.md).

**`PR_COMMENT_STAGES` is a second list, and it is not that anti-pattern.** The two name two
*audiences*, which is a real distinction, not a duplicated enumeration of one thing. Three tests hold
them honest: every catalogue key must be in the union of the two, the two must be disjoint, and every
name in `PR_COMMENT_STAGES` must have a template. A fourth asserts the separation is load-bearing —
that `tracker-comment.js` still refuses a pull-request stage. Decide which list a new stage belongs to
by asking who reads the comment, not by which is more convenient.

## The escape hatch

`--summary-file <path>` supplies a hand-written lead and overrides the template. It exists for the one
case the catalogue cannot serve: a comment whose moment is genuinely not one of the known stages. It is
not a way to opt out — a call with neither a known stage nor a summary file exits 2 and posts nothing.

Prefer adding a stage over reaching for the escape hatch. A stage is reusable, testable and
catalogued; a summary file is a paragraph one call site knows about.
