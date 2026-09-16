"use strict";
/**
 * create-task L1/L2 tests.
 * Run: node --test skills/create-task/tests/
 */

const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const lib = require("../scripts/lib.js");

const TEMPLATE_PATH = path.join(
  __dirname,
  "..",
  "resources",
  "task-template.md",
);

// ===========================================================================
// validateTaskFilename
// ===========================================================================
test("validateTaskFilename — happy path", () => {
  const r = lib.validateTaskFilename("task.1.cache-lib-simplification.md");
  assert.equal(r.ok, true);
  assert.equal(r.id, 1);
  assert.equal(r.name, "cache-lib-simplification");
});

test("validateTaskFilename — multi-digit id", () => {
  const r = lib.validateTaskFilename(
    "task.42.nestjs-dynamic-module-pattern.md",
  );
  assert.equal(r.ok, true);
  assert.equal(r.id, 42);
});

test("validateTaskFilename — rejects underscores", () => {
  const r = lib.validateTaskFilename("task_1_cache_lib_simplification.md");
  assert.equal(r.ok, false);
  assert.match(r.reason, /underscores/i);
});

test("validateTaskFilename — rejects camelCase descriptive name", () => {
  const r = lib.validateTaskFilename("task.1.cacheLibSimplification.md");
  assert.equal(r.ok, false);
  assert.match(r.reason, /uppercase/i);
});

test("validateTaskFilename — rejects leading-zero id", () => {
  const r = lib.validateTaskFilename("task.001.foo.md");
  assert.equal(r.ok, false);
  assert.match(r.reason, /leading zero/i);
});

test("validateTaskFilename — rejects missing .md", () => {
  const r = lib.validateTaskFilename("task.1.foo");
  assert.equal(r.ok, false);
});

test("validateTaskFilename — rejects empty", () => {
  assert.equal(lib.validateTaskFilename("").ok, false);
  assert.equal(lib.validateTaskFilename(null).ok, false);
});

test("validatePlanFilename — happy path", () => {
  const r = lib.validatePlanFilename("task.7.plan.dynamic-module.md");
  assert.equal(r.ok, true);
  assert.equal(r.id, 7);
});

test("validatePlanFilename — rejects missing 'plan' marker", () => {
  assert.equal(lib.validatePlanFilename("task.7.dynamic-module.md").ok, false);
});

// ===========================================================================
// scanExistingTaskIds / nextTaskId / assertUniqueTaskId
// ===========================================================================
test("scanExistingTaskIds — picks up flat files + dirs", () => {
  const ids = lib.scanExistingTaskIds([
    "task.1.foo.md",
    "task.2.bar", // directory
    "task.5.baz.md",
    "epic.42.unrelated.md", // ignored
    "README.md", // ignored
  ]);
  assert.deepEqual(
    [...ids].sort((a, b) => a - b),
    [1, 2, 5],
  );
});

test("nextTaskId — fills lowest gap", () => {
  assert.equal(lib.nextTaskId([]), 1);
  assert.equal(lib.nextTaskId(["task.1.a.md"]), 2);
  assert.equal(lib.nextTaskId(["task.1.a.md", "task.3.c.md"]), 2);
  assert.equal(
    lib.nextTaskId(["task.1.a.md", "task.2.b.md", "task.3.c.md"]),
    4,
  );
});

test("assertUniqueTaskId — HALTs on collision", () => {
  assert.throws(
    () => lib.assertUniqueTaskId(2, ["task.1.a.md", "task.2.b.md"]),
    /HALT.*task\.2 already exists/,
  );
});

test("assertUniqueTaskId — passes when free", () => {
  assert.equal(lib.assertUniqueTaskId(3, ["task.1.a.md", "task.2.b.md"]), true);
});

test("assertUniqueTaskId — rejects bad id input", () => {
  assert.throws(() => lib.assertUniqueTaskId(0, []), /positive integer/);
  assert.throws(() => lib.assertUniqueTaskId(-1, []), /positive integer/);
  assert.throws(() => lib.assertUniqueTaskId("1", []), /positive integer/);
});

// ===========================================================================
// extractSourceCitations
// ===========================================================================
test("extractSourceCitations — finds anchored + plain citations", () => {
  const md = `
We follow [Source: docs/architecture/tech-stack.md#typescript] strictly.
Pattern [Source: docs/architecture/coding-standards.md] applies.
No citation here.
`;
  const out = lib.extractSourceCitations(md);
  assert.deepEqual(out, [
    "docs/architecture/tech-stack.md#typescript",
    "docs/architecture/coding-standards.md",
  ]);
});

test("extractSourceCitations — handles markdown with no citations", () => {
  assert.deepEqual(lib.extractSourceCitations("Plain prose, no sources."), []);
});

test("extractSourceCitations — robust to non-string input", () => {
  assert.deepEqual(lib.extractSourceCitations(null), []);
  assert.deepEqual(lib.extractSourceCitations(undefined), []);
});

// ===========================================================================
// countMandatorySections
// ===========================================================================
test("countMandatorySections — template has all 11 sections", () => {
  const template = fs.readFileSync(TEMPLATE_PATH, "utf-8");
  assert.equal(lib.countMandatorySections(template), 11);
});

test("countMandatorySections — partial doc returns partial count", () => {
  const md = `## 1. Overview\n\n## 2. Motivation\n`;
  assert.equal(lib.countMandatorySections(md), 2);
});

// ===========================================================================
// populateTaskTemplate
// ===========================================================================
test("populateTaskTemplate — fills title, id, date, metadata", () => {
  const template = fs.readFileSync(TEMPLATE_PATH, "utf-8");
  const out = lib.populateTaskTemplate(template, {
    task_title: "Cache-lib Simplification",
    task_id: 42,
    created: "2026-05-10",
    priority: "High",
    assignee: "712020:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    estimated_effort_hours: 24,
  });
  assert.match(out, /# Technical Task Template: Cache-lib Simplification/);
  // OKF v0.1 YAML frontmatter (replaces the legacy bold-line header).
  assert.match(out, /^id: task\.42$/m);
  assert.match(out, /^title: "Cache-lib Simplification"$/m);
  assert.match(out, /^type: task$/m);
  assert.match(out, /^created: 2026-05-10$/m);
  assert.match(out, /^updated: 2026-05-10$/m);
  assert.match(out, /^priority: High$/m);
  assert.match(out, /^assignee: 712020:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee$/m);
  assert.match(out, /^estimated_effort_hours: 24$/m);
  // Untouched body placeholders remain so caller knows what's still missing.
  assert.match(out, /\[2-3 sentence description/);
});

test("populateTaskTemplate — HALTs on missing required answer", () => {
  assert.throws(
    () => lib.populateTaskTemplate("template", {}),
    /missing required answer/,
  );
  assert.throws(
    () => lib.populateTaskTemplate("template", { task_title: "X" }),
    /missing required answer "task_id"/,
  );
});

test("populateTaskTemplate — rejects non-string template", () => {
  assert.throws(
    () => lib.populateTaskTemplate(null, {}),
    /template must be string/,
  );
});

// ===========================================================================
// mergeSprintStatus
// ===========================================================================
test("mergeSprintStatus — appends to empty file", () => {
  const out = lib.mergeSprintStatus("", {
    id: "task.1.foo",
    status: "ready-for-dev",
  });
  assert.match(
    out,
    /tasks:\n {2}- id: task\.1\.foo\n {4}status: ready-for-dev/,
  );
});

test("mergeSprintStatus — appends to existing tasks list without reordering", () => {
  const input = `# Sprint status — preserved comment
tasks:
  - id: task.1.foo
    status: done
  - id: task.2.bar
    status: in-progress
`;
  const out = lib.mergeSprintStatus(input, {
    id: "task.3.baz",
    status: "ready-for-dev",
  });
  const lines = out.split("\n");
  // Existing entries unchanged.
  assert.ok(out.includes("# Sprint status — preserved comment"));
  assert.ok(
    lines.indexOf("  - id: task.1.foo") < lines.indexOf("  - id: task.2.bar"),
  );
  assert.ok(
    lines.indexOf("  - id: task.2.bar") < lines.indexOf("  - id: task.3.baz"),
  );
  assert.match(out, /- id: task\.3\.baz\n {4}status: ready-for-dev/);
});

test("mergeSprintStatus — updates status of existing entry in place", () => {
  const input = `tasks:
  - id: task.1.foo
    status: in-progress
  - id: task.2.bar
    status: ready-for-dev
`;
  const out = lib.mergeSprintStatus(input, {
    id: "task.1.foo",
    status: "done",
  });
  assert.match(out, /- id: task\.1\.foo\n {4}status: done/);
  // task.2 unchanged.
  assert.match(out, /- id: task\.2\.bar\n {4}status: ready-for-dev/);
  // Single status line for task.1 — no duplication.
  const occurrences = out.match(/^ {4}status:/gm).length;
  assert.equal(occurrences, 2);
});

test("mergeSprintStatus — rejects malformed input", () => {
  assert.throws(
    () => lib.mergeSprintStatus(null, { id: "x", status: "y" }),
    /yaml must be string/,
  );
  assert.throws(() => lib.mergeSprintStatus("", null), /entry must be object/);
  assert.throws(
    () => lib.mergeSprintStatus("", { id: "x" }),
    /requires id \+ status/,
  );
});

// ===========================================================================
// parseFrontmatter (smoke — re-exported from shared lib)
// ===========================================================================
test("parseFrontmatter — re-exported and works for task frontmatter", () => {
  const src = `---
id: task.42.cache-lib-simplification
title: 'Cache-lib Simplification'
status: planned
priority: high
---

# Body
`;
  const { frontmatter, body } = lib.parseFrontmatter(src);
  assert.equal(frontmatter.id, "task.42.cache-lib-simplification");
  assert.equal(frontmatter.title, "Cache-lib Simplification");
  assert.equal(frontmatter.status, "planned");
  assert.match(body, /^# Body/);
});

test("populateTaskTemplate — assignee is optional and defaults to the template's null value", () => {
  // Jira needs an accountId, which an author rarely has to hand. Requiring an
  // answer here is how `assignee: TBD` — and names like "platform-team" —
  // reached the API and came back as a bare HTTP 400 with nothing naming the
  // cause. Omitting it must leave the frontmatter key present but empty, so the
  // sync falls back to `jira.defaultAssignee` or leaves Jira's assignee alone.
  const template = fs.readFileSync(TEMPLATE_PATH, "utf-8");
  const out = lib.populateTaskTemplate(template, {
    task_title: "No Assignee",
    task_id: 43,
    created: "2026-05-10",
    priority: "Low",
    estimated_effort_hours: 1,
  });

  assert.match(
    out,
    /^assignee:(?: |$)/m,
    "the key must survive so it is discoverable",
  );
  assert.doesNotMatch(
    out,
    /^assignee: TBD$/m,
    "the placeholder that caused the 400 must not return",
  );
});

test("task template ships no placeholder assignee", () => {
  // Guards the template itself, not the renderer. `assignee: TBD` shipped here
  // for a long time and every card created the intended way then failed to sync.
  const template = fs.readFileSync(TEMPLATE_PATH, "utf-8");
  const m = template.match(/^assignee:[ \t]*([^\n#]*)/m);
  assert.ok(m, "the template must still declare an assignee key");
  assert.equal(
    m[1].trim(),
    "",
    "the shipped value must be blank, never a placeholder",
  );
});
