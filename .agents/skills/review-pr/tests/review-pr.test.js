"use strict";
/**
 * review-pr contract tests.
 * Prose-driven skill — assert the structural invariants of the SKILL.md + the
 * conformance prompt: dual-platform coverage, the six-rung resolution cascade,
 * the two lenses, the deterministic verdict, and the guarantees that make this
 * skill advisory (it never approves a PR and never writes a gate file).
 *
 * Run: node --test 'skills/review-pr/tests/*.test.js'
 *      (the directory form `node --test skills/review-pr/tests/` fails MODULE_NOT_FOUND here)
 */

const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const SKILL = read("SKILL.md");
const CONFORMANCE = read("references/pr-conformance-prompt.md");

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------
test("SKILL.md declares name: review-pr", () => {
  assert.match(SKILL, /^---[\s\S]*?\nname:\s*review-pr\s*\n/);
});

test("description stays within the ~150-word validator ceiling", () => {
  const m = SKILL.match(/\ndescription:\s*'([\s\S]*?)'\s*\n/);
  assert.ok(m, "description present and single-quoted");
  const words = m[1].trim().split(/\s+/).length;
  assert.ok(words <= 150, `description is ${words} words (must be <= 150)`);
});

test("frontmatter carries only the two authored fields", () => {
  const fm = SKILL.match(/^---\n([\s\S]*?)\n---/)[1];
  assert.doesNotMatch(
    fm,
    /^managed-by:/m,
    "managed-by is injected at package time",
  );
  assert.doesNotMatch(fm, /^source:/m, "source is injected at package time");
});

// ---------------------------------------------------------------------------
// Arguments — every documented flag appears in the Arguments table
// ---------------------------------------------------------------------------
test("every argument is declared in the Arguments table", () => {
  const table = SKILL.match(/## Arguments[\s\S]*?\n## Workflow/)[0];
  for (const arg of [
    "`target`",
    "`--effort`",
    "`--comment`",
    "`--no-code`",
    "`--no-docs`",
  ]) {
    assert.ok(table.includes(arg), `${arg} present in the Arguments table`);
  }
});

test("--effort is not merely declared — its behaviour is defined", () => {
  // Regression guard: the reviewed task document declared --effort in the
  // arguments list and defined it nowhere. An argument with no behaviour is a
  // promise the implementer cannot keep.
  assert.match(SKILL, /\*\*Effort\*\* scales coverage/);
  assert.match(SKILL, /low` \/ `medium`/);
  assert.match(SKILL, /high` \/ `max`/);
  assert.match(SKILL, /Fold the resolved `--effort` into both dispatches/);
});

// ---------------------------------------------------------------------------
// Platform: both VCS platforms, and the VCS-vs-TRACKER axis
// ---------------------------------------------------------------------------
test("both sourced helpers are guarded with || exit 1", () => {
  assert.match(SKILL, /source references\/resolve-platform\.sh \|\| exit 1/);
  assert.match(SKILL, /source references\/bitbucket-auth\.sh \|\| exit 1/);
});

test("PR-shaped work branches on VCS, not TRACKER", () => {
  // /review-code Step 4 branches on TRACKER for PR comments, which misroutes in
  // a Bitbucket-VCS + GitHub-tracker repo. This skill must not repeat that.
  assert.match(
    SKILL,
    /Branch on `\$VCS` for everything PR-shaped, on `\$TRACKER` for everything issue-shaped/,
  );
  assert.match(SKILL, /PLATFORM="\$VCS"/);
});

test("Bitbucket auth is verified by status code, not by list length", () => {
  assert.match(SKILL, /404, not 401/);
  assert.match(SKILL, /-w "%\{http_code\}"/);
});

test("both platforms have a PR-resolution path and a comment path", () => {
  const resolve = SKILL.match(
    /### Step 1 — Resolve the PR[\s\S]*?### Step 2/,
  )[0];
  assert.match(resolve, /gh pr view/);
  assert.match(resolve, /\$\{BB_API\}/);

  const comment = SKILL.match(/### Step 8 — `--comment`[\s\S]*?### Step 9/)[0];
  assert.match(comment, /gh pr comment/);
  assert.match(comment, /pullrequests\/\$\{PR_NUMBER\}\/comments/);
});

// ---------------------------------------------------------------------------
// The resolution cascade — the new primitive
// ---------------------------------------------------------------------------
test("all six resolution rungs are documented in order", () => {
  const step2 = SKILL.match(
    /### Step 2 — Resolve the work item[\s\S]*?### Step 3 —/,
  )[0];
  for (const rung of [
    "branch stem",
    "pr_number",
    "gate `pr:`",
    "tracker issue",
    "Explore",
    "none",
  ]) {
    assert.ok(step2.includes(rung), `rung "${rung}" documented`);
  }
});

test("rung 4 matches a Jira key as well as a GitHub issue ref", () => {
  // A Bitbucket PR description carries PROJ-123, never #N. Matching only the
  // GitHub shape makes rung 4 dead on the Bitbucket + Jira combination.
  assert.match(SKILL, /\[A-Z\]\+-\[0-9\]\+/);
  assert.match(SKILL, /never `#\{N\}`/);
});

test("the exclusion filter names all nine artifact segments", () => {
  const filter = SKILL.match(/\.qa\.[\s\S]{0,200}?\.pr-review\./)[0];
  for (const seg of [
    ".qa.",
    ".gate.",
    ".bug.",
    ".implementation.",
    ".review.",
    ".dod.",
    ".plan.",
    ".handover.",
    ".pr-review.",
  ]) {
    assert.ok(filter.includes(seg), `exclusion segment ${seg} present`);
  }
});

test("resolution greps are anchored and recursive (no ** globs, no prefix matches)", () => {
  const step2 = SKILL.match(
    /### Step 2 — Resolve the work item[\s\S]*?### Step 3 —/,
  )[0];
  // Scope to the cascade TABLE ROWS. The explanatory note under the table deliberately quotes
  // `docs/**/` to explain why it is avoided, so an unscoped doesNotMatch flags the documentation
  // rather than the mechanism.
  const rows = step2
    .split("\n")
    .filter((l) => /^\| \d+ \|/.test(l))
    .join("\n");
  assert.ok(rows.length > 0, "cascade table rows found");
  // CR-2: `docs/**/` needs globstar, which is off by default — it matched 0 of 110 gate files.
  assert.doesNotMatch(rows, /docs\/\*\*\//, "no ** glob may survive in a rung");
  assert.match(rows, /grep -rl --include='\*\.gate\.\*\.yml'/);
  assert.match(rows, /find docs -type f/);
  // CR-1: an unanchored pr_number grep makes PR 28 resolve to pr_number: 281.
  assert.match(rows, /\^pr_number:/);
  assert.match(rows, /\[\[:space:\]\]\*\$/);
});

test("no shell snippet depends on bash-only glob behaviour", () => {
  // CR-1: a multi-glob `ls` aborts entirely under zsh (macOS default) when any one glob has no
  // match, so one absent artifact kind silently suppresses every kind that IS present. Verified
  // live: 0 files under zsh vs 7 under bash on a directory with no *.bug.*.md.
  const step3 = SKILL.match(
    /### Step 3 — Collect the paper trail[\s\S]*?### Step 3b/,
  )[0];
  const bash = step3.match(/```bash\n([\s\S]*?)```/)[1];
  assert.doesNotMatch(
    bash,
    /^\s*ls\s+"\$D"/m,
    "no multi-glob ls in the collection block",
  );
  assert.match(bash, /find "\$D" -maxdepth 1 -name/);
  assert.match(SKILL, /must behave identically under bash and zsh/);
});

test("the Bitbucket web PR URL form is recognised", () => {
  // CR-2: the arm matched only the API path `pullrequests`, so a pasted Bitbucket web URL
  // (`/pull-requests/N`) fell through to the branch arm.
  assert.match(SKILL, /\*:\/\/\*\/pull-requests\/\*/);
});

test("a branch target reaches the PR resolver instead of resolving the current branch", () => {
  // CR-3: `gh pr view "${PR:-}"` with an empty argument resolves the CURRENT branch's PR, so
  // `/review-pr some-other-branch` silently reviewed the wrong PR. Verified: `gh pr view ""`
  // returns the current branch's number.
  assert.match(SKILL, /gh pr view "\$\{PR:-\$BRANCH\}"/);
  assert.doesNotMatch(SKILL, /gh pr view "\$\{PR:-\}"/);
});

test("the Bitbucket diff fallback follows redirects and rejects an empty patch", () => {
  // CR-5: the /diff endpoint redirects; `curl -sf` without -L exits 0 having written nothing.
  assert.match(SKILL, /curl -sfL/);
  const step4 = SKILL.match(/### Step 4 — Build the diff[\s\S]*?### Step 5/)[0];
  assert.match(step4, /Diff fallback produced an empty patch/);
});

test("auto-generated files are excluded from the reviewed diff", () => {
  // RV-2: 30 of 55 files on this skill's own PR were byte-identical bundle copies, ~23k of
  // 24,253 lines. Step 4 previously gave no guidance, so the scoping had to be done by hand.
  const step4 = SKILL.match(/### Step 4 — Build the diff[\s\S]*?### Step 5/)[0];
  assert.match(step4, /:\(exclude\)\*\/references\/\*/);
  assert.match(step4, /AUTO-GENERATED/);
});

test("target is parsed into PR and BRANCH before Step 1 uses them", () => {
  // CR-4: Step 1 dereferenced ${PR} and $BRANCH with no step binding them.
  const idx0b = SKILL.indexOf("### Step 0b — Parse `target`");
  const idx1 = SKILL.indexOf("### Step 1 — Resolve the PR");
  assert.ok(idx0b > -1, "Step 0b exists");
  assert.ok(idx0b < idx1, "Step 0b precedes Step 1");
  assert.match(SKILL, /BRANCH=\$\(git branch --show-current\)/);
});

test("the diff step checks its exit status so a merged PR falls back", () => {
  // CR-5: an unchecked fetch made the documented "audit a merged PR" case report "no changes".
  // Assert the CONDITIONAL ITSELF inside the fenced block — `USE_API_DIFF=1` also appears in the
  // cross-fork prose below, so a bare match on that token survives deleting the guard entirely.
  const step4 = SKILL.match(/### Step 4 — Build the diff[\s\S]*?### Step 5/)[0];
  const bash = step4.match(/```bash\n([\s\S]*?)```/)[1];
  assert.match(
    bash,
    /if git fetch -q origin/,
    "the fetch is inside a conditional",
  );
  assert.match(
    bash,
    /&&\s*\n?\s*git diff/,
    "the diff is chained on the fetch succeeding",
  );
  assert.match(
    bash,
    /\[ -s "\$DIFF_FILE" \]/,
    "an empty patch is treated as failure",
  );
  assert.match(
    bash,
    /USE_API_DIFF=1/,
    "the else branch sets the fallback flag",
  );
  assert.match(step4, /deleted/i, "the merged-PR rationale is stated");
});

test("the comment body file is assigned before use and cleaned up", () => {
  // CR-3: $BODY_FILE was consumed by three commands and assigned by none.
  const assign = SKILL.indexOf('BODY_FILE="$(mktemp');
  const firstUse = SKILL.indexOf("${BODY_FILE}");
  assert.ok(assign > -1, "BODY_FILE is assigned");
  assert.ok(assign < firstUse, "assignment precedes first use");
  assert.match(SKILL, /rm -f "\$DIFF_FILE" "\$BODY_FILE"/);
});

test("the Bitbucket marker scan is not limited to the first page", () => {
  // CR-7: the default pagelen meant a busy PR never found the marker and posted a duplicate.
  assert.match(SKILL, /comments\?pagelen=100/);
});

test("story documents are globbed, not assumed to live in docs/stories/", () => {
  assert.match(SKILL, /not\*\* in `docs\/stories\/`/);
  assert.match(SKILL, /never assume one root/);
});

// ---------------------------------------------------------------------------
// Artifact collection
// ---------------------------------------------------------------------------
test("all eight artifact kinds are collected", () => {
  // Scope to the fenced bash block and match the GLOB form. Matching bare words against the whole
  // Step 3 section passed even with the globs deleted, because "gate", "review" and
  // "implementation" all occur in the surrounding prose (CR-9).
  const step3 = SKILL.match(
    /### Step 3 — Collect the paper trail[\s\S]*?### Step 3b/,
  )[0];
  const bash = step3.match(/```bash\n([\s\S]*?)```/)[1];
  for (const glob of [
    "*.implementation.*.md",
    "*.qa.*.md",
    "*.gate.*.yml",
    "*.dod.*.md",
    "*sprint-review-summary.md",
    "*.bug.*.md",
    "*.handover.*.md",
    "*.review.*.md",
    "*.pr-review.*.md",
  ]) {
    assert.ok(bash.includes(glob), `artifact glob ${glob} present`);
  }
});

test("artifacts are globbed on the segment, never reconstructed by name", () => {
  assert.match(
    SKILL,
    /Glob on the artifact segment; never reconstruct an exact filename/,
  );
});

test("the review-report glob excludes this skill's own .pr-review. output", () => {
  // `*.review.*.md` also matches `*.pr-review.*.md`. Without the filter a
  // re-review collects its own previous report as the pre-implementation
  // review report. Found by the Phase 10 glob-collision grep.
  assert.match(SKILL, /grep -v '\\\.pr-review\\\.'/);
});

// ---------------------------------------------------------------------------
// Tracker context — both trackers, with a concrete Jira path
// ---------------------------------------------------------------------------
test("the Jira read path is concrete, not 'the existing Jira read path'", () => {
  assert.match(SKILL, /rest\/api\/2\/issue\/\{jira_key\}/);
  assert.doesNotMatch(SKILL, /the existing Jira read path/);
});

test("tracker context is non-blocking", () => {
  assert.match(
    SKILL,
    /non-blocking; the review continues without tracker context/i,
  );
});

// ---------------------------------------------------------------------------
// Diff construction
// ---------------------------------------------------------------------------
test("the diff is built from git so one path serves both platforms", () => {
  assert.match(SKILL, /one path serves both platforms/);
  assert.match(
    SKILL,
    /git diff "origin\/\$BASE_BRANCH\.\.\.origin\/\$HEAD_BRANCH"/,
  );
});

test("the cross-fork PR case is handled up front", () => {
  // Scope the assertion to Step 4. `headRepositoryOwner` also appears in Step 1's
  // --json field list, so an unscoped match passed even with the whole cross-fork
  // paragraph deleted (caught by mutation M5).
  const step4 = SKILL.match(/### Step 4 — Build the diff[\s\S]*?### Step 5/)[0];
  assert.match(step4, /Cross-fork PRs/);
  assert.match(step4, /headRepositoryOwner/);
  assert.match(step4, /USE_API_DIFF=1/);
  assert.match(step4, /gh pr diff/);
});

test("the diff file is written to scratch, never the repo", () => {
  assert.match(SKILL, /mktemp -t review-pr\./);
  assert.match(SKILL, /scratch, never the repo/);
  assert.match(SKILL, /rm -f "\$DIFF_FILE"/);
});

// ---------------------------------------------------------------------------
// The two lenses
// ---------------------------------------------------------------------------
test("both lens prompts are referenced, not paraphrased inline", () => {
  assert.match(SKILL, /code-review-prompt\.md/);
  assert.match(SKILL, /pr-conformance-prompt\.md/);
  assert.match(SKILL, /passed verbatim|Prompt Template.*verbatim/s);
  // The shared prompt's own body must not be copied into this skill.
  assert.doesNotMatch(SKILL, /You are a focused, read-only code reviewer/);
});

test("each lens can be disabled independently", () => {
  assert.match(SKILL, /skip under `--no-code`/);
  assert.match(SKILL, /skip under `--no-docs`/);
});

test("the caller resolves the anchor, not the conformance subagent", () => {
  assert.match(SKILL, /Lens B never runs the cascade itself/);
  // whitespace-tolerant: the source hard-wraps between "The" and "subagent"
  assert.match(
    CONFORMANCE,
    /The\s+subagent does not run the resolution cascade itself/,
  );
});

// ---------------------------------------------------------------------------
// Conformance prompt contract
// ---------------------------------------------------------------------------
test("the conformance prompt declares all four categories", () => {
  // Bind to the contract enum line, not bare words. Each of these words occurs 4-8 times in the
  // surrounding prose, so `includes()` passed even with the contract line deleted (CR-6).
  assert.match(
    CONFORMANCE,
    /category: coverage\s+# coverage \| scope \| trail \| consistency/,
  );
});

test("the verdict rule lives in exactly one place", () => {
  // PC-2/CR-4: the CR-6 fix landed in SKILL.md while pr-conformance-prompt.md kept the defective
  // table — and a gate recorded CR-6 as closed and mutation-proved on the strength of the one file.
  // The guard now asserts the invariant across BOTH files, which is what would have caught it.
  const verdict = SKILL.match(/\*\*Deterministic verdict[\s\S]*?### Step 7/)[0];
  assert.match(verdict, /at any confidence/);
  assert.doesNotMatch(verdict, /\| any `medium` \|/);
  assert.match(verdict, /This table is normative/);

  // The prompt must NOT carry a second copy of the rule.
  assert.doesNotMatch(CONFORMANCE, /\| any `medium` \|/);
  assert.doesNotMatch(CONFORMANCE, /any conformance `high`/);
  assert.match(CONFORMANCE, /Step 6 is normative/);
});

test("the pr_conformance output contract carries the full key set", () => {
  for (const key of [
    "work_item:",
    "resolved_via:",
    "artifacts:",
    "findings:",
    "truncated_count:",
    "category:",
    "severity:",
    "confidence:",
    "ref:",
    "suggested_action:",
  ]) {
    assert.ok(CONFORMANCE.includes(key), `output key ${key} present`);
  }
});

test("the conformance schema mirrors code_review so one renderer serves both", () => {
  // Was: /mirror the `code_review\[?\]?` schema|parallel/i — the first alternative was dead (the
  // prompt writes code_review[] without backticks) and the `|parallel` fallback matched a stray
  // word anywhere in the file, so the assertion passed vacuously (CR-8).
  assert.match(CONFORMANCE, /mirror the code_review\[\] schema/);
  assert.match(SKILL, /schemas are deliberately parallel/);
  for (const key of [
    "id",
    "category",
    "severity",
    "confidence",
    "finding",
    "suggested_action",
  ]) {
    assert.ok(CONFORMANCE.includes(`${key}:`), `shared field ${key} present`);
  }
});

test("the conformance reviewer is read-only and never gates", () => {
  assert.match(CONFORMANCE, /read-only and returns findings only/);
  assert.match(CONFORMANCE, /NEVER edit files/);
});

// ---------------------------------------------------------------------------
// Verdict — deterministic, and advisory
// ---------------------------------------------------------------------------
test("all three verdict outcomes are defined with their conditions", () => {
  const verdict = SKILL.match(/\*\*Deterministic verdict[\s\S]*?### Step 7/)[0];
  assert.match(verdict, /REQUEST CHANGES/);
  assert.match(verdict, /CONCERNS/);
  assert.match(verdict, /APPROVE/);
  assert.match(verdict, /confidence: high/);
  // CR-6: the middle row said only "any medium", so severity:high + confidence:medium matched no
  // row at all and fell through to APPROVE.
  assert.match(verdict, /at any confidence/);
  assert.doesNotMatch(verdict, /\| any `medium` \|/);
});

test("the skill never submits a formal review and never writes a gate", () => {
  assert.match(SKILL, /Never call `gh pr review --approve`/);
  assert.match(SKILL, /Never write a gate `\.yml`/);
  assert.match(SKILL, /only `qa-\*` skills do that/);
});

test("the skill never edits code", () => {
  assert.match(SKILL, /never edits code/);
});

// ---------------------------------------------------------------------------
// Report location — co-location is the only sanctioned location
// ---------------------------------------------------------------------------
test("the report uses the .pr-review.{n}. artifact kind, co-located", () => {
  assert.match(SKILL, /\.pr-review\.\{n\}\./);
  assert.match(SKILL, /task\.65\.pr-review\.1\./);
});

test("an unanchored review writes no file and invents no directory", () => {
  assert.match(SKILL, /No work item resolved → write no file/);
  assert.doesNotMatch(SKILL, /\.agents\/reviews/);
});

test("the report template is given literally", () => {
  assert.match(SKILL, /ALWAYS use this exact template structure/);
  for (const heading of [
    "## Artifact Trail",
    "## Acceptance Criteria Traceability",
    "## Conformance Findings",
    "## Code Review Findings",
    "## Machine-Readable Findings",
    "## Recommended Actions",
  ]) {
    assert.ok(SKILL.includes(heading), `report section ${heading} present`);
  }
});

// ---------------------------------------------------------------------------
// Comment idempotency
// ---------------------------------------------------------------------------
test("the PR comment is idempotent via a marker on both platforms", () => {
  const marker = "<!-- agent-skills-pr-review -->";
  const occurrences = SKILL.split(marker).length - 1;
  assert.ok(
    occurrences >= 3,
    `marker appears in prose and both platform paths (found ${occurrences})`,
  );
});

test("the GitHub comment path goes through tracker_call_with_retry", () => {
  assert.match(SKILL, /tracker_call_with_retry gh pr comment/);
  assert.match(SKILL, /ACCESS_TRACKER` deferral gate/);
});

test("comment bodies are always file-sourced, never inline", () => {
  assert.match(SKILL, /Always `--body-file`.*never an inline body/s);
  assert.doesNotMatch(SKILL, /gh pr comment "\$PR_URL" --body "/);
});

test("commenting is confirmed before posting and never gates", () => {
  assert.match(SKILL, /ask before posting/i);
  assert.match(SKILL, /Commenting never gates/);
  assert.match(SKILL, /Never post over an `unverifiable` reason/);
});

// ---------------------------------------------------------------------------
// Repo-wide prohibitions
// ---------------------------------------------------------------------------
test("addCommentToJiraIssue never appears in shipped prose", () => {
  assert.doesNotMatch(SKILL, /addCommentToJiraIssue/);
  assert.doesNotMatch(CONFORMANCE, /addCommentToJiraIssue/);
});

// ---------------------------------------------------------------------------
// Relationships
// ---------------------------------------------------------------------------
test("the skill situates itself against its siblings", () => {
  for (const sib of ["/review-code", "/review-task", "/qa-task", "/finalise"]) {
    assert.ok(SKILL.includes(sib), `sibling ${sib} named`);
  }
  // Task 77 inverted this: the pipelines now DO call /review-pr, at Step 5c.
  // What must stay true is the distinction that makes the wiring legitimate —
  // the skill is consulted by the pipeline, and still gates nothing itself.
  assert.match(SKILL, /\*\*do\*\* call `\/review-pr`, as \*\*Step 5c\*\*/);
  assert.match(
    SKILL,
    /Being consulted by a pipeline is not the same as gating one/,
    "the consulted-vs-gating distinction is what keeps the advisory contract intact",
  );
  assert.match(
    SKILL,
    /Gate files remain the exclusive output of `\/qa-story` and `\/qa-task`/,
  );
});

// ---------------------------------------------------------------------------
// The inline-comment jq snippet must RUN, not merely read well (task 70).
//
// Both review skills shipped a snippet that could not execute: `.code_review[]`
// iterates the wrapper object's VALUES rather than its findings, so `select`
// indexes a string and jq aborts; and `body: .summary` read a key the findings
// schema does not define, which made the CLI exit 2 and dropped every finding.
// Neither defect was visible to a reader, and qa-task's snippet executor skips
// these blocks as `mutating` (they redirect to a file). Executing the extracted
// program against a schema-shaped fixture is the only check that can see it.
// ---------------------------------------------------------------------------
const { spawnSync } = require("child_process");

const FINDINGS_FIXTURE = JSON.stringify({
  code_review: {
    reviewed: "3 files",
    findings: [
      {
        id: "CR-1",
        category: "bug",
        severity: "high",
        confidence: "high",
        file_line: "src/x.ts:42",
        finding: "null deref on `x`",
        suggested_action: "guard it",
      },
      // Shapes an LLM plausibly emits from "file_line is path:line". jq is
      // all-or-nothing inside `[ ... ]`, so before the test() guard each of these
      // aborted the WHOLE program, emptied $INLINE_FILE and dropped every
      // finding -- not degraded, dropped.
      {
        id: "CR-2",
        category: "bug",
        severity: "medium",
        confidence: "medium",
        file_line: "src/y.ts:10-24",
        finding: "a range, not a line",
        suggested_action: "n/a",
      },
      {
        id: "CR-3",
        category: "cleanup",
        severity: "low",
        confidence: "low",
        file_line: "src/z.ts",
        finding: "no line at all",
        suggested_action: "n/a",
      },
      // suggested_action absent -- string concatenation with null aborts too.
      {
        id: "CR-4",
        category: "cleanup",
        severity: "low",
        confidence: "low",
        file_line: "src/w.ts:3",
        finding: "no suggested action",
      },
    ],
    truncated_count: 0,
  },
  // Conformance findings carry `ref`, NOT `file_line` -- see
  // references/pr-conformance-prompt.md. `ref` is a criterion id, a frontmatter
  // field, an artifact path, OR a path:line; only the last can be anchored. A
  // fixture that invents `file_line` here tests a shape production never emits.
  pr_conformance: {
    work_item: "task.70",
    findings: [
      {
        id: "PC-1",
        severity: "medium",
        ref: "AC-3",
        finding: "criterion not evidenced",
        suggested_action: "cite it",
      },
      {
        id: "PC-2",
        severity: "low",
        ref: "docs/a.md:3",
        finding: "claim unsupported",
        suggested_action: "cite it",
      },
    ],
  },
});

/** Pull the jq program out of the SKILL.md snippet that feeds --findings-file. */
function extractJqProgram(skillText) {
  // Tolerate a shell line-continuation between the program and its input file.
  const m = skillText.match(/jq '(\[[\s\S]*?\])'[\s\\]*"\$FINDINGS_JSON"/);
  return m ? m[1] : null;
}

test("the inline-comment jq snippet executes against a schema-shaped fixture", (t) => {
  const probe = spawnSync("jq", ["--version"], { encoding: "utf8" });
  if (probe.error) return t.skip("jq not installed");

  const prog = extractJqProgram(read("SKILL.md"));
  assert.ok(prog, "could not find the jq program feeding --findings-file");

  const r = spawnSync("jq", ["-c", prog], {
    input: FINDINGS_FIXTURE,
    encoding: "utf8",
  });
  assert.equal(
    r.status,
    0,
    `the documented jq program does not run:\n${r.stderr}\nProgram:\n${prog}`,
  );

  const out = JSON.parse(r.stdout);
  assert.ok(
    out.length > 0,
    "the snippet extracted no findings from the fixture",
  );
  // The well-formed finding must SURVIVE its malformed neighbours. `length > 0`
  // alone would pass while every entry but one was silently lost — jq aborts the
  // whole array on a single bad entry, so this is the assertion that matters.
  assert.ok(
    out.some((f) => f.path === "src/x.ts" && f.line === 42),
    "a well-formed finding must survive alongside a range file_line, a bare " +
      "path, and a missing suggested_action",
  );
  assert.ok(
    !out.some((f) => String(f.path).includes("y.ts")),
    "a range file_line has no single line to anchor to — exclude it, never guess",
  );
  // The conformance lens must be REACHABLE. Selecting on `file_line` dropped
  // every PC finding silently, making `.pr_conformance.findings[]?` dead code
  // that nothing reported.
  assert.ok(
    out.some((f) => f.path === "docs/a.md" && f.line === 3),
    "a conformance finding whose `ref` IS a path:line must anchor",
  );
  assert.ok(
    !out.some((f) => String(f.path) === "AC-3"),
    "a `ref` that is a criterion id is not anchorable — it belongs in the summary",
  );
  for (const f of out) {
    assert.ok(f.path && typeof f.path === "string", "each record needs a path");
    assert.ok(Number.isInteger(f.line), "each record needs an integer line");
    assert.ok(
      f.body && typeof f.body === "string" && f.body.trim(),
      "each record needs a non-empty body — `.summary` is not a schema key, " +
        "and a null body makes pr-inline-comment.js exit 2",
    );
  }
});
