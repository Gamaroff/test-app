"use strict";
/**
 * review-code contract tests.
 * Prose-driven skill — assert the structural invariants of SKILL.md.
 *
 * The invariant this file exists for: **Step 4 posts PR comments, and PR
 * comments are a VCS operation.** It branched on `$TRACKER` until task 68, so
 * a repo hosting code on Bitbucket while tracking issues on GitHub took the
 * `gh` arm against a Bitbucket PR — `gh` cannot address one, the comment never
 * landed, and the run reported success. Nothing was red. These tests are the
 * only thing standing between that defect and a silent reintroduction.
 *
 * Run: node --test 'skills/review-code/tests/*.test.js'
 *      (the directory form `node --test skills/review-code/tests/` fails
 *       MODULE_NOT_FOUND here, same as review-pr)
 */

const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

/**
 * Read a SIBLING skill's file — `skills/<name>/<rel>`.
 *
 * Returns null when the sibling is absent instead of throwing. `tests/` ships
 * inside the packaged skill (`package_skill.py` walks the whole skill dir and
 * excludes only __pycache__/.git/node_modules/.DS_Store), so a consumer can run
 * this suite with review-code installed and review-pr or finalise not. There the
 * cross-skill assertions have nothing to compare against and are skipped.
 *
 * In THIS repo the siblings are always present, so the guards below always run —
 * which is the point. A degradation that skipped everywhere would delete the
 * drift guard while leaving a green suite behind, so the in-repo run is asserted
 * separately rather than trusted.
 */
const readSibling = (name, rel) => {
  try {
    return fs.readFileSync(path.join(ROOT, "..", name, rel), "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
};

const SKILL = read("SKILL.md");

/**
 * Step 4's section text, sliced from its heading to the next `### Step`.
 * Scoping every branch-key assertion to this slice is deliberate: a bare
 * `assert.doesNotMatch(SKILL, /TRACKER=github/)` would forbid the token
 * everywhere in the file, including in a future *issue-shaped* branch where it
 * would be correct. The rule is not "never mention TRACKER" — it is "do not
 * branch PR-shaped work on TRACKER".
 */
const STEP_4 = (() => {
  const m = SKILL.match(/### Step 4 — `--comment`[\s\S]*?(?=\n### Step )/);
  assert.ok(
    m,
    "Step 4 section present and followed by a later ### Step heading",
  );
  return m[0];
})();

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------
test("SKILL.md declares name: review-code", () => {
  assert.match(SKILL, /^---[\s\S]*?\nname:\s*review-code\s*\n/);
});

test("frontmatter carries only the authored fields", () => {
  const fm = SKILL.match(/^---\n([\s\S]*?)\n---/)[1];
  assert.doesNotMatch(
    fm,
    /^managed-by:/m,
    "managed-by is injected at package time",
  );
  assert.doesNotMatch(fm, /^source:/m, "source is injected at package time");
});

// ---------------------------------------------------------------------------
// Step 4 — PR-shaped work branches on $VCS, never on $TRACKER
// ---------------------------------------------------------------------------
test("Step 4 branches on VCS, not TRACKER", () => {
  assert.doesNotMatch(
    STEP_4,
    /TRACKER=(github|bitbucket|jira)/,
    "Step 4 posts PR comments — a VCS operation. Branching it on TRACKER takes " +
      "the gh arm against a Bitbucket PR in a Bitbucket-VCS + GitHub-tracker repo, " +
      "and the comment silently never lands.",
  );
});

test("Step 4 declares a VCS=github arm", () => {
  assert.match(STEP_4, /\*\*GitHub\*\*\s*\(`VCS=github`\)/);
});

test("Step 4 declares a VCS=bitbucket arm", () => {
  assert.match(STEP_4, /\*\*Bitbucket\*\*\s*\(`VCS=bitbucket`\)/);
});

test("both platform arms are present — neither may be dropped", () => {
  const arms = STEP_4.match(/`VCS=(github|bitbucket)`/g) || [];
  assert.ok(arms.includes("`VCS=github`"), "GitHub arm present");
  assert.ok(arms.includes("`VCS=bitbucket`"), "Bitbucket arm present");
});

test("the Bitbucket arm is no longer conflated with a tracker", () => {
  // The pre-task-68 text read "**Bitbucket / Jira**" — grouping a VCS with a
  // tracker as though they were alternatives to each other, which is the
  // category error that produced the wrong branch key in the first place.
  assert.doesNotMatch(STEP_4, /Bitbucket\s*\/\s*Jira/);
});

// ---------------------------------------------------------------------------
// The rule is stated, not merely obeyed
// ---------------------------------------------------------------------------
test("Step 4 states the VCS-vs-TRACKER rule in review-pr's wording", () => {
  assert.match(
    STEP_4,
    /Branch on `\$VCS` for everything PR-shaped, on `\$TRACKER` for everything issue-shaped/,
    "the rule must be stated verbatim as review-pr states it, so the two sibling " +
      "skills cannot drift into disagreeing about the same decision",
  );
});

test("review-pr and review-code state the identical rule", (t) => {
  // Cross-skill consistency: if review-pr's wording is ever reworded, this
  // fails and whoever changes one is told to change the other.
  const RULE =
    "**Branch on `$VCS` for everything PR-shaped, on `$TRACKER` for everything issue-shaped.**";
  const reviewPr = readSibling("review-pr", "SKILL.md");
  if (reviewPr === null) {
    return t.skip("review-pr not installed alongside review-code");
  }
  assert.ok(reviewPr.includes(RULE), "review-pr states the rule");
  assert.ok(SKILL.includes(RULE), "review-code states the same rule");
});

// ---------------------------------------------------------------------------
// The Bitbucket arm names a recipe that actually exists
// ---------------------------------------------------------------------------
test("the Bitbucket arm names a real, resolvable recipe", () => {
  assert.match(STEP_4, /bitbucket-auth\.sh/, "names the credential resolver");
  assert.match(
    STEP_4,
    /pullrequests\/\$\{PR_ID\}\/comments/,
    "names the actual REST endpoint rather than gesturing at 'the platform's PR-comment path'",
  );
  // Task 89: `/…/s` let the two halves sit anywhere in STEP_4, so any mention of finalise plus
  // any mention of Step 7 satisfied a claim about ONE pointer. Pin the link to the section it
  // points at: the href and the step must be adjacent, which is what "points at" actually means.
  assert.match(
    STEP_4,
    /\]\(\.\.\/finalise\/SKILL\.md\)\s+\*\*Step 7\b/,
    "points at finalise Step 7, which carries both arms",
  );
});

test("the dead /qa-story step 6 pointer is gone and stays gone", () => {
  // `/qa-story` has no numbered Step 6 in its main review flow at all — its
  // workflow lives under an unnumbered `### Review Workflow`. The old pointer
  // sent an implementer to a step that does not exist.
  assert.doesNotMatch(
    STEP_4,
    /mirror\s+`?\/qa-story`?\s+step\s*6/i,
    "/qa-story has no step 6 to mirror",
  );
});

test("the finalise pointer resolves to a real file with a real Step 7", (t) => {
  // Guards the pointer against bit-rot: a cross-reference that names a section
  // is only useful while that section exists.
  const finalise = readSibling("finalise", "SKILL.md");
  if (finalise === null) {
    return t.skip("finalise not installed alongside review-code");
  }
  assert.match(
    finalise,
    /### Step 7: Mark as Accepted and Generate Artifacts/,
    "finalise Step 7 exists under the name review-code points at",
  );
  assert.match(
    finalise,
    /bitbucket-auth\.sh/,
    "finalise Step 7 has a Bitbucket arm",
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
