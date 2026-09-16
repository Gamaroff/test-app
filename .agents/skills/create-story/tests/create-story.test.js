"use strict";
/**
 * create-story L1/L2 tests.
 * Run: node --test skills/create-story/tests/*.test.js
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
  "story-template.yaml",
);

// ===========================================================================
// validateStoryFilename
// ===========================================================================
test("validateStoryFilename — happy path", () => {
  const r = lib.validateStoryFilename("story.178.8.example-feature.md");
  assert.equal(r.ok, true);
  assert.equal(r.epic, 178);
  assert.equal(r.story, 8);
  assert.equal(r.name, "example-feature");
});

test("validateStoryFilename — rejects underscores", () => {
  const r = lib.validateStoryFilename("story_1_2_example.md");
  assert.equal(r.ok, false);
  assert.match(r.reason, /underscores/i);
});

test("validateStoryFilename — rejects camelCase descriptive name", () => {
  const r = lib.validateStoryFilename("story.1.2.exampleFeature.md");
  assert.equal(r.ok, false);
  assert.match(r.reason, /uppercase/i);
});

test("validateStoryFilename — rejects leading-zero ids", () => {
  assert.equal(lib.validateStoryFilename("story.01.2.foo.md").ok, false);
  assert.equal(lib.validateStoryFilename("story.1.02.foo.md").ok, false);
});

test("validateStoryFilename — rejects missing parts", () => {
  assert.equal(lib.validateStoryFilename("story.1.foo.md").ok, false);
  assert.equal(lib.validateStoryFilename("story.1.2.md").ok, false);
  assert.equal(lib.validateStoryFilename("story.1.2.foo").ok, false);
});

test("validateStoryPlanFilename — happy path", () => {
  const r = lib.validateStoryPlanFilename(
    "story.178.8.plan.example-feature.md",
  );
  assert.equal(r.ok, true);
  assert.equal(r.epic, 178);
  assert.equal(r.story, 8);
  assert.equal(r.name, "example-feature");
});

test("validateStoryPlanFilename — rejects missing 'plan' marker", () => {
  assert.equal(
    lib.validateStoryPlanFilename("story.1.2.example-feature.md").ok,
    false,
  );
});

// ===========================================================================
// scanExistingStoryIds / nextStoryId / assertUniqueStoryId
// ===========================================================================
test("scanExistingStoryIds — scoped to given epic", () => {
  const ids = lib.scanExistingStoryIds(
    [
      "story.1.1.foo.md",
      "story.1.2.bar", // directory
      "story.2.1.baz.md", // different epic — ignored
      "story.1.5.qux.md",
      "README.md",
    ],
    1,
  );
  assert.deepEqual(
    [...ids].sort((a, b) => a - b),
    [1, 2, 5],
  );
});

test("scanExistingStoryIds — rejects bad epicNum", () => {
  assert.throws(() => lib.scanExistingStoryIds([], 0), /positive integer/);
  assert.throws(() => lib.scanExistingStoryIds([], "1"), /positive integer/);
});

test("nextStoryId — fills lowest gap within epic", () => {
  assert.equal(lib.nextStoryId([], 1), 1);
  assert.equal(lib.nextStoryId(["story.1.1.a.md"], 1), 2);
  assert.equal(lib.nextStoryId(["story.1.1.a.md", "story.1.3.c.md"], 1), 2);
  // Cross-epic isolation: story.2.1 doesn't fill story.1's gap.
  assert.equal(lib.nextStoryId(["story.2.1.a.md"], 1), 1);
});

test("assertUniqueStoryId — HALTs on collision", () => {
  assert.throws(
    () => lib.assertUniqueStoryId(1, 2, ["story.1.1.a.md", "story.1.2.b.md"]),
    /HALT.*story\.1\.2 already exists/,
  );
});

test("assertUniqueStoryId — passes when free across epics", () => {
  assert.equal(
    lib.assertUniqueStoryId(2, 1, ["story.1.1.a.md", "story.1.2.b.md"]),
    true,
  );
});

// ===========================================================================
// extractSourceCitations (shared helper, smoke)
// ===========================================================================
test("extractSourceCitations — finds story-style citations", () => {
  const md = `
Architectural source: [Source: docs/architecture/tech-stack.md#typescript].
Per [Source: docs/architecture/coding-standards.md#naming] we use kebab-case.
`;
  const out = lib.extractSourceCitations(md);
  assert.deepEqual(out, [
    "docs/architecture/tech-stack.md#typescript",
    "docs/architecture/coding-standards.md#naming",
  ]);
});

// ===========================================================================
// listTemplateSectionIds
// ===========================================================================
test("listTemplateSectionIds — extracts all top-level section ids from template", () => {
  const tpl = fs.readFileSync(TEMPLATE_PATH, "utf-8");
  const ids = lib.listTemplateSectionIds(tpl);
  for (const required of lib.REQUIRED_STORY_SECTION_IDS) {
    assert.ok(
      ids.includes(required),
      `template should declare section id "${required}", got: ${JSON.stringify(ids)}`,
    );
  }
});

test("listTemplateSectionIds — handles synthetic minimal template", () => {
  const synth = `template:
  id: x
sections:
  - id: alpha
    title: A
  - id: beta
    title: B
other_root:
  - id: ignored
`;
  assert.deepEqual(lib.listTemplateSectionIds(synth), ["alpha", "beta"]);
});

// ===========================================================================
// mergeSprintStatus — stories listKey
// ===========================================================================
test("mergeSprintStatus — appends new story under stories: list", () => {
  const input = `# Sprint status
tasks:
  - id: task.1.foo
    status: done
stories:
  - id: story.1.1.alpha
    status: done
`;
  const out = lib.mergeSprintStatus(input, {
    id: "story.1.2.beta",
    status: "ready-for-dev",
  });
  // Existing tasks block untouched.
  assert.match(out, /- id: task\.1\.foo\n {4}status: done/);
  // New story appended at end of stories block.
  assert.match(out, /- id: story\.1\.2\.beta\n {4}status: ready-for-dev/);
  // Existing story unchanged.
  assert.match(out, /- id: story\.1\.1\.alpha\n {4}status: done/);
});

test("mergeSprintStatus — updates story status in place", () => {
  const input = `stories:
  - id: story.1.1.alpha
    status: in-progress
`;
  const out = lib.mergeSprintStatus(input, {
    id: "story.1.1.alpha",
    status: "done",
  });
  assert.match(out, /- id: story\.1\.1\.alpha\n {4}status: done/);
  const dupCount = (out.match(/status:/g) || []).length;
  assert.equal(dupCount, 1, "should not duplicate status line");
});

test("mergeSprintStatus — creates stories: block if absent", () => {
  const out = lib.mergeSprintStatus(
    "tasks:\n  - id: task.1.foo\n    status: done\n",
    {
      id: "story.1.1.alpha",
      status: "ready-for-dev",
    },
  );
  assert.match(
    out,
    /stories:\n {2}- id: story\.1\.1\.alpha\n {4}status: ready-for-dev/,
  );
});

// ===========================================================================
// parseFrontmatter — smoke
// ===========================================================================
test("parseFrontmatter — story frontmatter shape", () => {
  const src = `---
id: story.1.2.example-feature
status: Draft
jira_key: null
jira_url: null
acceptance_criteria:
  - First
  - Second
---

# Body
`;
  const { frontmatter, body } = lib.parseFrontmatter(src);
  assert.equal(frontmatter.id, "story.1.2.example-feature");
  assert.equal(frontmatter.status, "Draft");
  assert.equal(frontmatter.jira_key, null);
  assert.deepEqual(frontmatter.acceptance_criteria, ["First", "Second"]);
  assert.match(body, /^# Body/);
});
