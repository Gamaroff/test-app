"use strict";
/**
 * develop-bug contract tests.
 * The skill is prose-driven (no code lib), so these assert the structural
 * invariants of the SKILL.md + step reference docs — catching edits that
 * break the step sequence, bug-mode coverage, branch models, or the
 * Resolution-Summary ownership that is this skill's reason to exist.
 *
 * Run: node --test skills/develop-bug/tests/
 */

const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const SKILL = read("SKILL.md");
const STEP0 = read("references/develop-bug-step-0-resolve-bug.md");
const STEP2 = read("references/develop-bug-step-2-review.md");
const STEP3 = read("references/develop-bug-step-3-investigate-fix.md");
const STEP56 = read("references/develop-bug-step-5-6-verify-loop.md");
const STEP7 = read("references/develop-bug-step-7-close-bug.md");

// ---------------------------------------------------------------------------
// Frontmatter + naming
// ---------------------------------------------------------------------------
test("SKILL.md declares name: develop-bug", () => {
  assert.match(SKILL, /^---[\s\S]*?\nname:\s*develop-bug\s*\n/);
});

test("description stays within the ~150-word validator ceiling", () => {
  const m = SKILL.match(/\ndescription:\s*'([\s\S]*?)'\s*\n/);
  assert.ok(m, "description present and single-quoted");
  const words = m[1].trim().split(/\s+/).length;
  assert.ok(words <= 150, `description is ${words} words (must be <= 150)`);
});

// ---------------------------------------------------------------------------
// Bespoke step docs exist and are referenced from SKILL.md
// ---------------------------------------------------------------------------
const BESPOKE = [
  "references/develop-bug-step-0-resolve-bug.md",
  "references/develop-bug-step-2-review.md",
  "references/develop-bug-step-3-investigate-fix.md",
  "references/develop-bug-step-5-6-verify-loop.md",
  "references/develop-bug-step-7-close-bug.md",
];
for (const rel of BESPOKE) {
  test(`bespoke step doc exists and is linked: ${rel}`, () => {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `${rel} exists`);
    assert.ok(SKILL.includes(rel), `SKILL.md links ${rel}`);
  });
}

// ---------------------------------------------------------------------------
// 8-step pipeline sequence
// ---------------------------------------------------------------------------
test("SKILL.md names all 8 steps in order", () => {
  const steps = [
    "Create Branch",
    "Review Bug",
    "Investigate & Fix",
    "Create PR",
    "Verify & Fix Loop",
    "Finalise & Close Bug",
    "Commit Changes",
  ];
  let cursor = 0;
  for (const s of steps) {
    const idx = SKILL.indexOf(s, cursor);
    assert.ok(idx !== -1, `step "${s}" present and after the previous step`);
    cursor = idx;
  }
});

test("banners use the DEVELOP-BUG prefix, not STORY/TASK", () => {
  assert.match(SKILL, /DEVELOP-BUG PIPELINE: STEP/);
  assert.doesNotMatch(SKILL, /DEVELOP-(STORY|TASK) PIPELINE: STEP/);
});

// ---------------------------------------------------------------------------
// All three bug modes covered
// ---------------------------------------------------------------------------
test("Step 0 resolves all three bug modes with their filename patterns", () => {
  assert.match(STEP0, /story\.\{epic\}\.\{story\}\.bug\.\{n\}/);
  assert.match(STEP0, /task\.\{id\}\.bug\.\{n\}/);
  assert.match(STEP0, /bug\.\{N\}\.\{name\}/);
});

test("Step 7 updates parent linkage per mode (story / task / general registry)", () => {
  assert.match(STEP7, /Story bug/i);
  assert.match(STEP7, /Task bug/i);
  assert.match(STEP7, /bug-registry\.md/);
});

// ---------------------------------------------------------------------------
// Both branch models
// ---------------------------------------------------------------------------
test("Phase 0d offers both bugfix and hotfix branch models", () => {
  assert.match(STEP0, /bugfix/i);
  assert.match(STEP0, /hotfix/i);
  assert.match(STEP0, /develop/);
  assert.match(STEP0, /main/);
});

// ---------------------------------------------------------------------------
// Bug lifecycle status transitions
// ---------------------------------------------------------------------------
test("Step 2 is the review-bug gate that HALTs on DUPLICATE / STALE / NEEDS DETAIL", () => {
  assert.match(STEP2, /review-bug/);
  assert.match(STEP2, /READY TO FIX/);
  assert.match(STEP2, /DUPLICATE/);
  assert.match(STEP2, /STALE/);
  assert.match(STEP2, /NEEDS DETAIL/);
});

test("Step 3 now owns reproduce + the new->in-progress transition + non-repro HALT", () => {
  assert.match(STEP3, /in-progress/);
  assert.match(STEP3, /[Rr]eproduce/);
  assert.match(STEP3, /not reproducible/i);
});

test("Step 3 sets ready-for-qa and requires a failing-without/passing-with regression test", () => {
  assert.match(STEP3, /ready-for-qa/);
  assert.match(
    STEP3,
    /fails? (on the )?(current|pre-fix)|fails on the current code/i,
  );
});

test("Step 5-6 verify loop is bounded at 5 cycles and reopens on FAIL", () => {
  assert.match(STEP56, /MAX_ITER=5|5 cycles/);
  assert.match(STEP56, /reopened/);
  assert.match(STEP56, /qa-fix/);
});

// ---------------------------------------------------------------------------
// The reason this skill exists: it writes Resolution Summary and closes.
// ---------------------------------------------------------------------------
test("Step 7 owns the Resolution Summary and closes the bug", () => {
  assert.match(STEP7, /## Resolution Summary/);
  assert.match(STEP7, /status:\s*closed/);
});

test("Step 3 must NOT close the bug (only Step 7 closes)", () => {
  assert.doesNotMatch(STEP3, /status:\s*closed/);
});
