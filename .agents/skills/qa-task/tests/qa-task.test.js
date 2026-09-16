"use strict";
/**
 * qa-task contract tests.
 * Prose-driven skill — assert the structural invariants of SKILL.md.
 *
 * The invariant this file exists for: **Step 13 posts the QA gate decision to
 * the PR, and it is marked BLOCKING.** Until task 69 it called `gh pr comment`
 * with no Bitbucket arm, so on a Bitbucket-hosted repo a step the skill calls
 * mandatory could not succeed at all — `gh` cannot address a Bitbucket PR.
 * Two other skills pointed at this step as the reference Bitbucket recipe while
 * it had none.
 *
 * Run: node --test 'skills/qa-task/tests/*.test.js'
 */

const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const ROOT = path.join(__dirname, "..");
const SKILL = fs.readFileSync(path.join(ROOT, "SKILL.md"), "utf8");

/**
 * Read a SIBLING skill's file — `skills/<name>/<rel>`.
 *
 * Returns null when the sibling is absent rather than throwing: `tests/` ships
 * inside the packaged skill, so a consumer may run this suite with qa-task
 * installed and qa-story not. There the cross-skill drift guard has nothing to
 * compare against and skips. In THIS repo the sibling is always present, which
 * is asserted separately so the guard cannot silently evaporate.
 */
const readSibling = (name, rel) => {
  const p = path.join(ROOT, "..", name, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
};

/**
 * The Step 13 PR-comment section only — from its heading to Step 13b.
 * Scoping matters: qa-task mentions `gh` in several unrelated places, and an
 * unscoped regex would pass on a match from the tracker-comment step below.
 */
function prCommentStep(src) {
  const start = src.indexOf("### Step 13: Post");
  assert.notEqual(
    start,
    -1,
    "Step 13 heading not found — did the step get renamed?",
  );
  const end = src.indexOf("### Step 13b:", start);
  assert.notEqual(
    end,
    -1,
    "Step 13b heading not found — cannot bound the section",
  );
  return src.slice(start, end);
}

/**
 * The comment body only — the lines between the single-quoted heredoc opener
 * and its terminator. Everything in here is written VERBATIM: no expansion,
 * no command substitution.
 */
function bodyHeredoc(src) {
  const step = prCommentStep(src);
  const start = step.indexOf("cat > \"$BODY_FILE\" <<'EOF'");
  assert.notEqual(start, -1, "body heredoc not found");
  const from = step.indexOf("\n", start) + 1;
  const end = step.indexOf("\nEOF\n", from);
  assert.notEqual(end, -1, "body heredoc terminator not found");
  return step.slice(from, end);
}

test("Step 13 branches the PR comment on $VCS, not $TRACKER", () => {
  const step = prCommentStep(SKILL);
  assert.match(
    step,
    /if \[ "\$VCS" = "github" \]/,
    "Step 13 must branch on $VCS — a PR comment is a VCS operation",
  );
  assert.match(
    step,
    /elif \[ "\$VCS" = "bitbucket" \]/,
    "Step 13 needs a bitbucket arm on $VCS",
  );
  assert.doesNotMatch(
    step,
    /if \[ "\$TRACKER" = "(github|bitbucket)" \]/,
    "Step 13 must not branch the PR comment on $TRACKER — tracker and VCS are independent axes",
  );
});

test("Step 13 has both platform arms", () => {
  const step = prCommentStep(SKILL);
  assert.match(
    step,
    /tracker_call_with_retry gh pr comment/,
    "GitHub arm missing",
  );
  assert.match(step, /curl -sf -X POST/, "Bitbucket arm missing");
});

test("the Bitbucket arm posts to the PR comments endpoint", () => {
  const step = prCommentStep(SKILL);
  assert.match(
    step,
    /\$\{BB_API\}\/repositories\/\$\{BB_WORKSPACE\}\/\$\{BB_REPO\}\/pullrequests\/\$\{PR_NUMBER\}\/comments/,
    "Bitbucket arm must POST to …/pullrequests/{id}/comments",
  );
  assert.match(
    step,
    /jq -n --arg raw .*\{content: \{raw: \$raw\}\}/,
    "Bitbucket payload must be a jq-built {content:{raw:…}} object",
  );
});

test("the GitHub arm uses --body-file; no inline --body survives", () => {
  const step = prCommentStep(SKILL);
  assert.match(
    step,
    /gh pr comment "\$PR_URL" --body-file "\$BODY_FILE"/,
    "GitHub arm must use --body-file",
  );
  assert.doesNotMatch(
    step,
    /gh pr comment [^\n]*--body /,
    "an inline --body invites the shell to evaluate backticks and $(…) in the body before gh sees it",
  );
});

test("the body is written to a file before posting", () => {
  const step = prCommentStep(SKILL);
  assert.match(
    step,
    /BODY_FILE=\.claude\/state\/qa-comment-body\.md/,
    "body file path missing",
  );
  assert.match(
    step,
    /cat > "\$BODY_FILE" <<'EOF'/,
    "body must be written via a quoted heredoc",
  );
});

test("the quoted heredoc body carries no shell variables", () => {
  // The body is written with <<'EOF' — single-quoted, so NOTHING expands.
  // A `$PR_NUMBER` in here is emitted literally and the comment ships with
  // placeholder text where PR metadata belongs. It posts successfully, so the
  // step's own BLOCKING exit-code check passes and the fault is silent.
  // Regression guard for TASK69-001.
  const body = bodyHeredoc(SKILL);
  const vars = body.match(/\$[A-Za-z_][A-Za-z0-9_]*/g) || [];
  assert.deepEqual(
    vars,
    [],
    `the heredoc is single-quoted, so ${vars.join(", ")} would be written literally — use a {SLOT} placeholder instead`,
  );
});

test("the platform preamble resolves the Bitbucket REST coordinates and credential", () => {
  const step = prCommentStep(SKILL);
  assert.match(
    step,
    /source references\/resolve-platform\.sh \|\| exit 1/,
    "resolver must be sourced guarded",
  );
  for (const v of ["BB_WORKSPACE", "BB_REPO", "BB_API"]) {
    assert.ok(
      step.includes(v),
      `${v} must be derived before the Bitbucket arm uses it`,
    );
  }
  assert.match(
    step,
    /source references\/bitbucket-auth\.sh \|\| exit 1/,
    "bitbucket-auth.sh must be sourced guarded — it sets BB_CURL_AUTH",
  );
});

test("the retry asymmetry is documented, not left implicit", () => {
  const step = prCommentStep(SKILL);
  assert.match(
    step,
    /single-shot/i,
    "the Bitbucket arm is not retried; say so, as qa-fix does, rather than leaving the asymmetry unexplained",
  );
  assert.match(
    step,
    /tracker_call_with_retry` wraps `gh`/,
    "explain WHY only one arm retries",
  );
});

test("the per-cycle (non-idempotent) design is stated", () => {
  const step = prCommentStep(SKILL);
  assert.match(
    step,
    /not idempotent/i,
    "QA comments are per-cycle by design — say so",
  );
  assert.match(
    step,
    /finalise/,
    "name finalise as the owner of the single canonical summary",
  );
});

test("the BLOCKING completion-checklist item covers both arms", () => {
  const line = SKILL.split("\n").find(
    (l) => l.includes("PR comment posted via") && l.includes("BLOCKING"),
  );
  assert.ok(
    line,
    "the Review Completion Checklist must still gate on the PR comment",
  );
  assert.match(
    line,
    /\$VCS/,
    "the checklist item must reference the $VCS branch, not a GitHub-only call",
  );
  assert.match(
    line,
    /no retry/,
    "the checklist must say the Bitbucket arm gets one attempt",
  );
});

/* ---- cross-skill drift guard ------------------------------------------- */

test("qa-story carries the same Bitbucket arm (drift guard)", () => {
  const sibling = readSibling("qa-story", "SKILL.md");
  if (sibling === null) {
    // Consumer install with qa-story absent — nothing to compare against.
    return;
  }
  assert.match(
    sibling,
    /\$\{BB_API\}\/repositories\/\$\{BB_WORKSPACE\}\/\$\{BB_REPO\}\/pullrequests\/\$\{PR_NUMBER\}\/comments/,
    "qa-story lost its Bitbucket arm — the two skills are the same step and must not diverge",
  );
  assert.match(
    sibling,
    /if \[ "\$VCS" = "github" \]/,
    "qa-story must branch on $VCS too",
  );
});

test("in this repo the sibling is present, so the drift guard actually ran", () => {
  // Without this, deleting qa-story would turn the guard above into a silent
  // no-op and leave a green suite behind.
  assert.notEqual(
    readSibling("qa-story", "SKILL.md"),
    null,
    "qa-story must exist in this repo",
  );
});
