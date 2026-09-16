# Double-Check — Gate Playbooks

Concrete technique for each gate in [`../SKILL.md`](../SKILL.md). Load when
running an audit; the SKILL.md body carries the pipeline and the output
contract, this file carries the how.

---

## Gate A — Ground-truth and disk-state verification

### A.1 Reconcile claims against the tree

The transcript names files it wrote. The tree knows which ones actually changed.
Diff the two lists, in this order:

```bash
git status --porcelain                 # M/A/D/?? — every path that moved
git diff --stat HEAD                   # magnitude of each change
git diff --stat --cached               # staged, if the turn staged anything
git log --oneline -3                   # did the turn commit? it should not have
```

Then, per claimed file:

```bash
test -f path/to/file && echo EXISTS || echo MISSING
git diff -- path/to/file               # the actual change, not the described one
wc -l path/to/file                     # against the expected magnitude
```

**Defects this finds:** a write reported as successful that never landed; an edit
applied to a different path (a sibling directory, a bundled copy, a worktree); a
"modified" file whose diff is empty; a commit or push the turn was not asked to
make.

**Where `git diff` cannot speak — hash it.** Binary artifacts, generated output,
files outside the repo, and anything already committed by an earlier turn need a
content fingerprint instead:

```bash
shasum -a 256 path/to/artifact                  # record before, compare after
shasum -a 256 generated.out expected.out        # two files, one comparison
git stash list && git show :path/to/file | shasum -a 256   # index vs worktree
```

Same use in reverse: hashing a file before and after an edit is the cheapest
proof that the edit *applied*, which is exactly the check that turns a silently
no-op edit into a finding rather than a green run — see
[`mutation-proving.md`](mutation-proving.md) for the case where skipping it
recorded a pass that proved nothing.

Untracked-file blind spot: `git diff` says nothing about a **new** file. Use
`git status --porcelain` (`??` rows) or `git add -N` before diffing, or a new
file that is empty, truncated, or in the wrong place passes Gate A silently.

### A.2 Wholeness

```bash
tail -5 path/to/file                   # does it end where it should?
python3 -c 'import ast,sys; ast.parse(open(sys.argv[1]).read())' file.py
node --check file.js
bash -n script.sh
jq empty file.json
python3 -c 'import yaml,sys; yaml.safe_load(open(sys.argv[1]))' file.yaml
```

For markdown and prose deliverables: count fence openings against closings, check
every heading promised by a table of contents exists, and confirm the document
does not stop mid-sentence.

```bash
grep -c '^```' file.md                 # must be even
```

**The overwrite trap.** A `Write` where an `Edit` was intended produces a
syntactically perfect file that silently lost everything it did not restate.
Wholeness checks pass. Catch it with magnitude: a file that shrank sharply, or
whose diff deletes regions the task never mentioned, is the signature.

### A.3 Executable checks, narrowest first

Escalate only until the first red. Stop there — that failure is the finding, and
running the rest costs time without adding information.

| Ecosystem  | Syntax / types                    | Lint                 | Tests                            |
| ---------- | --------------------------------- | -------------------- | -------------------------------- |
| Node / TS  | `npx tsc --noEmit`                | `npx eslint <path>`  | `npm test -- <path>`             |
| Python     | `python3 -m py_compile <f>`       | `ruff check <f>`     | `pytest <path> -x -q`            |
| Shell      | `bash -n <f>`                     | `shellcheck <f>`     | the script's own test file       |
| Go         | `go build ./...`                  | `go vet ./...`       | `go test ./<pkg>`                |
| Rust       | `cargo check`                     | `cargo clippy`       | `cargo test <filter>`            |
| This repo  | —                                 | `npm run format:check` | `npm test`, `npm run validate:all` |

Prefer the scoped invocation (`pytest tests/test_thing.py::test_case`) over the
whole suite: it is faster, and its result is unambiguously about the change.

**Read the runner's own report, not its exit code alone.** A suite that collected
zero tests exits 0. A watcher that never terminated has no result at all. Check
the count of tests run against what you expected to run.

### A.4 The safety boundary — what Gate A must never run

Never, as part of an audit:

- `git commit`, `git push`, `git push --force`, `git reset --hard`,
  `git rebase`, `git checkout` of a dirty tree, `--no-verify`
- deploys, releases, publishes, `terraform apply`, `kubectl apply`
- migrations against any shared or remote database
- destructive cleanups (`rm -rf`, `docker system prune`, truncating fixtures)
- anything that spends money or sends outbound messages

When the only available check is one of these, **do not run it**. Record the
requirement as `not verified` in the Evidence field with the reason. Honest
non-coverage is a finding; a green obtained by breaking the environment is not a
result.

### A.5 Triaging a red

A failure does not identify its own cause. Gather evidence before deciding
whether the code or the test is wrong — procedure in
[`code-vs-test-validation.md`](code-vs-test-validation.md). Reflex to resist:
editing the test until it passes. That is Gate A producing a Gate D defect.

---

## Gate B — Negative constraints and boundaries

### B.1 Extraction

Re-read the user's message and pull every constraint verbatim. The lexical
triggers, in rough order of how often they are dropped:

| Class          | Surface forms                                                          |
| -------------- | ---------------------------------------------------------------------- |
| Prohibition    | do not, don't, never, avoid, without, no new, must not, refrain, skip   |
| Exclusivity    | only, just, nothing but, exclusively, solely, and nothing else          |
| Boundary       | at most, no more than, under N, exactly N, max, limit, cap, within      |
| Pin            | version N, on branch X, in directory Y, using library Z, targeting R    |
| Form           | as a table, in JSON, one file, plain text, British spelling, no emoji   |
| Preservation   | keep, preserve, leave alone, don't touch, unchanged, as-is              |

Also inherit standing constraints from project instruction files
(`AGENTS.md`, `CLAUDE.md`, repo conventions) — a violated project rule is a Gate
B defect even though the user did not restate it in the prompt.

### B.2 Evidence per constraint

Each row of the ledger needs a check that can *fail*. Belief is not a check.

| Constraint shape           | The check that could fail                                        |
| -------------------------- | ---------------------------------------------------------------- |
| "no new dependencies"      | `git diff -- package-lock.json package.json` is empty             |
| "don't use library X"      | `grep -rn "X" <changed files>` returns nothing                    |
| "don't touch file Y"       | `git status --porcelain -- Y` is empty                            |
| "under 500 words"          | `wc -w`                                                           |
| "keep the public API"      | diff the exported symbols before and after                        |
| "only edit the one file"   | `git status --porcelain` lists exactly that path                  |
| "output valid JSON"        | pipe it through `jq empty`                                        |
| "target Node 18"           | grep the `engines` field, the CI matrix, and any syntax past ES2022 |

### B.3 The override question

Ask explicitly, every time: **did an implicit default overrule something the user
said?** The recurring instances:

- A helpful extra file (README, test, config, `.gitignore`) nobody requested.
- A formatter run across a file that was told to stay unchanged, burying the real
  diff in whitespace.
- A dependency added because it is the conventional choice, against "no new
  dependencies".
- A refactor bundled into a fix, against "minimal change".
- A restated-in-your-own-words version of prose that was specified verbatim.
- Defaults from a framework generator that silently contradict a stated pin.

---

## Gate C — Independent derivation

### C.1 Execute before you derive

An executed oracle beats a re-derivation, always. Reach for the real engine:

```bash
node -e 'console.log(/^\d{4}-\d{2}-\d{2}$/.test("2026-02-30"))'   # regex, really run
python3 -c 'print(sum(range(1,101)))'                             # arithmetic
python3 -c 'from datetime import *; print(datetime(2026,3,29,1,30, tzinfo=timezone.utc))'
jq -n '[1,2,3] | add'                                             # JSON semantics
sqlite3 :memory: 'select 1 where 3 between 1 and 2;'              # SQL predicate
```

Write scratch scripts to the session scratchpad, never into the repository.

### C.2 Deterministic domains that need this gate

Regex (especially anchoring, greediness, escaping, and the difference between a
literal in a shell string and one in the target engine) · off-by-one on ranges
and slices · timezone and DST arithmetic · rounding, precision, and integer
division · unit conversion · SQL `JOIN` cardinality and `NULL` semantics ·
boolean precedence and De Morgan rewrites · state machine transitions ·
config precedence chains · sort stability and comparator direction ·
percentage-of-what ambiguity · recurrence and cron expressions.

### C.3 Clean-room protocol when execution is impossible

1. Restate the problem from the requirement, not from the produced solution.
2. Solve it. Do not look at the artifact's answer while doing so.
3. Compare. Agreement raises confidence; it does not prove correctness — both
   derivations came from the same model.
4. Disagreement means **both** are suspect. Resolve by grounding: a worked
   example, a boundary case, an authoritative reference. Never resolve by
   preferring the one you produced first.

### C.4 Placeholder and lazy-abstraction sweep

```bash
grep -rnE 'TODO|FIXME|XXX|HACK|not implemented|NotImplemented|unimplemented|rest unchanged|\.\.\. *$|<snip>|placeholder|dummy|lorem' <changed files>
```

Beyond the greppable, look for stub returns (`return []`, `return true`,
`return null`) standing in for logic; hard-coded values where a computation was
specified; a `catch` that swallows; mock or fixture data wired in place of a real
integration and described as working; a function whose body only logs.

A placeholder is a defect **relative to the claim made about the artifact**. Left
deliberately and disclosed, it is a plan. Left inside something reported as
complete, it is a Gate C finding.

---

## Gate D — Intent and completeness

### D.1 The traceability table

One row per requirement-ledger entry. Fill the Evidence column with a pointer
that another person could follow — not a description.

```markdown
| # | Requirement (quoted)          | Evidence                        | Status      |
| - | ----------------------------- | ------------------------------- | ----------- |
| 1 | "validate the email field"    | `user.ts:42`, `user.spec.ts:18` | satisfied   |
| 2 | "and the phone field"         | —                               | unaddressed |
| 3 | "return 422 on failure"       | `user.ts:51` returns 400        | partial     |
```

Rows without a pointer are `unaddressed`. This is the whole point of the table:
it makes an omission structurally visible, where prose lets it hide.

### D.2 Compound requirements

The highest-frequency Gate D defect is the second half of a sentence. "Add
validation **and** update the docs", "fix the bug **and** add a regression test",
"rename it **everywhere**". Split every conjunction, every list, and every
"also" in the original prompt into separate ledger rows before mapping.

Universal quantifiers deserve their own check: "everywhere", "all", "each", and
"every" are claims about a set. Enumerate the set and verify membership —
`grep -rn` the old name and confirm zero hits, rather than trusting that the
rename covered them.

### D.3 The inverse check — unrequested work

Walk the changed-file list against the ledger. Anything changed that no
requirement asked for is a finding: unrequested files, opportunistic refactors,
renames, reformatting, new dependencies, added configuration. It is scope the
user did not agree to and now has to review.

---

## Defect taxonomy

Names for what the gates find, for consistent Defect Log entries.

| Class                    | Gate | Signature                                                              |
| ------------------------ | ---- | ---------------------------------------------------------------------- |
| Phantom write            | A    | Claimed created or modified; absent from `git status`                   |
| Misplaced write          | A    | Landed in a sibling path, a bundled copy, or another worktree           |
| Silent truncation        | A    | File stops mid-construct; unbalanced fences or brackets                 |
| Overwrite loss           | A    | `Write` where `Edit` was meant; unrelated content deleted               |
| Unrun check              | A    | Reported as verified; never executed, or collected zero tests           |
| Constraint override      | B    | An implicit default beat an explicit prohibition                        |
| Boundary breach          | B    | Cap, pin, format, or location violated                                  |
| Collateral edit          | B    | A file marked "don't touch" moved                                       |
| Derivation error         | C    | Executed oracle disagrees with the produced value                       |
| Placeholder-as-complete  | C    | TODO, stub, or mock inside work reported as finished                    |
| Fabricated reference     | C    | A cited API, flag, file, or version that does not exist                 |
| Half-solved requirement  | D    | The second clause of a compound request never landed                    |
| Bypassed requirement     | D    | Satisfied in name only — renamed, mocked, or assertion loosened         |
| Silent descope           | D    | Dropped without being flagged to the user                               |
| Unrequested scope        | D    | Delivered work no requirement asked for                                 |

---

## Worked example

**Prompt:** "Add phone validation to the user DTO and a test for it. Don't add
any dependencies, and don't touch the auth module."

**Gate A.** `git status --porcelain` returns three paths: `user.dto.ts`,
`user.dto.spec.ts`, and `package-lock.json`. `npx tsc --noEmit` clean.
`npm test -- user.dto.spec.ts` reports `2 passed`.

**Gate B.** `git diff -- package-lock.json` is not empty — a phone-parsing
library was added, against "don't add any dependencies". `git status
--porcelain -- src/auth` is empty; that constraint holds.

**Gate C.** The regex is `/^\d{10}$/`. Executed against the fixtures in the
spec, `"+1 555 000 1111"` fails, and the spec only asserts the bare-digit case —
the test passes because it never exercises the format the requirement implies.

**Gate D.** "Add phone validation" — `satisfied` at `user.dto.ts:31`. "And a
test for it" — `partial`: the test exists but covers one shape.

**Verdict:** `BLOCKED`. The dependency must come out, which changes the
validation approach; whether international formats are in scope is a product
decision the prompt does not settle. Both go in the report as the exact questions
to answer — the audit does not guess either one.
