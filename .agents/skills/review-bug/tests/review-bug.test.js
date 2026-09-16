"use strict";
/**
 * review-bug contract tests.
 * Prose-driven skill — assert the structural invariants of the SKILL.md +
 * pre-pass prompts: dual mode, the four review dimensions, the two pre-pass
 * agents, the four recommendations, and the guarantee that review never
 * mutates the bug lifecycle status.
 *
 * Run: node --test skills/review-bug/tests/
 */

const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const SKILL = read("SKILL.md");
const PREPASS = read("references/review-bug-prepass-prompts.md");

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------
test("SKILL.md declares name: review-bug", () => {
  assert.match(SKILL, /^---[\s\S]*?\nname:\s*review-bug\s*\n/);
});

test("description stays within the ~150-word validator ceiling", () => {
  const m = SKILL.match(/\ndescription:\s*'([\s\S]*?)'\s*\n/);
  assert.ok(m, "description present and single-quoted");
  const words = m[1].trim().split(/\s+/).length;
  assert.ok(words <= 150, `description is ${words} words (must be <= 150)`);
});

// ---------------------------------------------------------------------------
// Dual mode (mirrors review-story)
// ---------------------------------------------------------------------------
test("both interactive and validate modes are defined", () => {
  assert.match(SKILL, /Interactive Mode/i);
  assert.match(SKILL, /Validate Mode/i);
  assert.match(SKILL, /--validate/);
  assert.match(SKILL, /validate-and-apply/i);
  assert.match(SKILL, /APPLY=true/);
});

// ---------------------------------------------------------------------------
// All four review dimensions
// ---------------------------------------------------------------------------
test("all four review dimensions are present", () => {
  assert.match(SKILL, /Template & Frontmatter Compliance/i);
  assert.match(SKILL, /Reproducibility Clarity/i);
  assert.match(SKILL, /Severity ?\/ ?Priority Correctness/i);
  assert.match(SKILL, /Mode & Linkage Correctness/i);
});

// ---------------------------------------------------------------------------
// Two pre-pass agents
// ---------------------------------------------------------------------------
test("SKILL references the pre-pass prompts and both agents", () => {
  assert.match(SKILL, /review-bug-prepass-prompts\.md/);
  assert.match(SKILL, /Duplicate scan/i);
  assert.match(SKILL, /already-fixed|stale/i);
});

test("pre-pass prompts define Agent A (duplicate) and Agent B (stale) with YAML outputs", () => {
  assert.match(PREPASS, /Agent A/);
  assert.match(PREPASS, /Agent B/);
  assert.match(PREPASS, /duplicate:\s*none/);
  assert.match(PREPASS, /reproduces:\s*likely/);
  assert.match(PREPASS, /bug-registry\.md/);
});

// ---------------------------------------------------------------------------
// Four recommendations / NO-GO reasons
// ---------------------------------------------------------------------------
test("the four recommendations are defined", () => {
  for (const rec of ["READY TO FIX", "NEEDS DETAIL", "DUPLICATE", "STALE"]) {
    assert.ok(SKILL.includes(rec), `recommendation "${rec}" present`);
  }
});

// ---------------------------------------------------------------------------
// The core guarantee: review never mutates the bug lifecycle status
// ---------------------------------------------------------------------------
test("review-bug explicitly never mutates the bug lifecycle status", () => {
  assert.match(SKILL, /never (mutates|touches).*status|stays `new`/i);
});

// ---------------------------------------------------------------------------
// Handles all three bug modes
// ---------------------------------------------------------------------------
test("resolves all three bug modes", () => {
  assert.match(SKILL, /story\.\{epic\}\.\{story\}\.bug/);
  assert.match(SKILL, /task\.\{id\}\.bug/);
  assert.match(SKILL, /bug\.\{N\}\.\{name\}/);
});

// ---------------------------------------------------------------------------
// Pipeline integration contract with develop-bug
// ---------------------------------------------------------------------------
test("documents the develop-bug Step 2 integration + HALT-on-NO-GO gating", () => {
  assert.match(SKILL, /develop-bug/);
  assert.match(SKILL, /Step 2/);
  assert.match(SKILL, /HALT/);
});
