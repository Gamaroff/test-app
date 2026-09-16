"use strict";
/**
 * create-story deterministic helpers. Mirrors skills/create-task/scripts/lib.js.
 * Shared cross-skill helpers (parseFrontmatter, extractSourceCitations,
 * mergeSprintStatus, isKebab) live in shared/resources/create-skills-lib.js.
 */

const fs = require("fs");
const path = require("path");
const shared = require("../references/create-skills-lib.js");

const {
  parseFrontmatter,
  extractSourceCitations,
  isKebab,
  mergeSprintStatus: sharedMergeSprintStatus,
} = shared;

// ---------------------------------------------------------------------------
// Filename validation — `story.{E}.{S}.{kebab-name}.md`
// Both E and S are positive integers, no leading zeros.
// ---------------------------------------------------------------------------
const STORY_FILENAME_RE =
  /^story\.(?<epic>[1-9][0-9]*)\.(?<story>[1-9][0-9]*)\.(?<name>[a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;

function validateStoryFilename(name) {
  if (typeof name !== "string" || name.length === 0) {
    return { ok: false, reason: "filename is empty" };
  }
  const m = name.match(STORY_FILENAME_RE);
  if (!m) {
    if (/_/.test(name))
      return {
        ok: false,
        reason: "underscores not allowed — use dots/hyphens",
      };
    if (/[A-Z]/.test(name))
      return { ok: false, reason: "uppercase not allowed — use kebab-case" };
    if (/^story\.0/.test(name) || /^story\.\d+\.0/.test(name)) {
      return { ok: false, reason: "leading zero in epic/story id not allowed" };
    }
    return {
      ok: false,
      reason: "does not match story.{E}.{S}.{kebab-name}.md",
    };
  }
  return {
    ok: true,
    epic: Number(m.groups.epic),
    story: Number(m.groups.story),
    name: m.groups.name,
  };
}

function validateStoryPlanFilename(name) {
  const re =
    /^story\.(?<epic>[1-9][0-9]*)\.(?<story>[1-9][0-9]*)\.plan\.(?<name>[a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
  if (typeof name !== "string" || !re.test(name)) {
    return {
      ok: false,
      reason: "does not match story.{E}.{S}.plan.{kebab-name}.md",
    };
  }
  const m = name.match(re);
  return {
    ok: true,
    epic: Number(m.groups.epic),
    story: Number(m.groups.story),
    name: m.groups.name,
  };
}

// ---------------------------------------------------------------------------
// Story ID uniqueness — given a directory listing (array of names) under a
// given epic, return the set of in-use story numbers + next free number.
// Entries can be flat files (`story.1.2.foo.md`) or directories
// (`story.1.2.foo`).
// ---------------------------------------------------------------------------
function scanExistingStoryIds(entries, epicNum) {
  if (!Array.isArray(entries)) throw new TypeError("entries must be string[]");
  if (!Number.isInteger(epicNum) || epicNum < 1) {
    throw new TypeError("epicNum must be a positive integer");
  }
  const ids = new Set();
  const re = new RegExp(`^story\\.${epicNum}\\.([1-9][0-9]*)\\b`);
  for (const e of entries) {
    const m = e.match(re);
    if (m) ids.add(Number(m[1]));
  }
  return ids;
}

function nextStoryId(entries, epicNum) {
  const ids = scanExistingStoryIds(entries, epicNum);
  let n = 1;
  while (ids.has(n)) n++;
  return n;
}

function assertUniqueStoryId(epicNum, storyNum, entries) {
  if (!Number.isInteger(epicNum) || epicNum < 1) {
    throw new Error(
      `assertUniqueStoryId: epicNum must be positive integer, got ${epicNum}`,
    );
  }
  if (!Number.isInteger(storyNum) || storyNum < 1) {
    throw new Error(
      `assertUniqueStoryId: storyNum must be positive integer, got ${storyNum}`,
    );
  }
  const ids = scanExistingStoryIds(entries, epicNum);
  if (ids.has(storyNum)) {
    throw new Error(`HALT: story.${epicNum}.${storyNum} already exists`);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Required story sections — derived from story-template.yaml. We hard-code
// the section IDs the template ships with so the protocol checker can verify
// the prose protocol references them all.
// ---------------------------------------------------------------------------
const REQUIRED_STORY_SECTION_IDS = [
  "status",
  "story",
  "acceptance-criteria",
  "tasks-subtasks",
  "dev-notes",
];

function listTemplateSectionIds(templateYaml) {
  if (typeof templateYaml !== "string")
    throw new TypeError("templateYaml must be string");
  const ids = [];
  // Match either `- id: foo` (top-level sections) or nested. We only collect
  // top-level section IDs — those under the `sections:` root key at indent 2.
  const lines = templateYaml.split("\n");
  let inSections = false;
  for (const line of lines) {
    if (/^sections:\s*$/.test(line)) {
      inSections = true;
      continue;
    }
    if (!inSections) continue;
    if (/^\S/.test(line)) break; // hit a new top-level key
    const m = line.match(/^ {2}- id:\s*(\S+)\s*$/);
    if (m) ids.push(m[1]);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Sprint-status merge — delegates to shared lib with listKey="stories".
// ---------------------------------------------------------------------------
function mergeSprintStatus(yaml, entry) {
  return sharedMergeSprintStatus(yaml, entry, { listKey: "stories" });
}

module.exports = {
  STORY_FILENAME_RE,
  REQUIRED_STORY_SECTION_IDS,
  parseFrontmatter,
  extractSourceCitations,
  isKebab,
  validateStoryFilename,
  validateStoryPlanFilename,
  scanExistingStoryIds,
  nextStoryId,
  assertUniqueStoryId,
  listTemplateSectionIds,
  mergeSprintStatus,
};
