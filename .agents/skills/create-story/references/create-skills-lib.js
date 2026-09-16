// AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/create-skills-lib.js. Regenerate via `npm run bundle`.
"use strict";
/**
 * Shared deterministic helpers used by both create-task and create-story
 * test suites. Pure functions — no filesystem I/O, no globals.
 *
 * Each skill's own `scripts/lib.js` re-exports from here plus adds its own
 * skill-specific validators. The packager (`package_skill.py`) auto-bundles
 * this file under `references/` in each skill's distributable zip.
 */

const jiraSync = require("./jira-sync.js");

// Re-export the canonical YAML frontmatter parser.
const { parseFrontmatter } = jiraSync;

// ---------------------------------------------------------------------------
// Source citations — `[Source: docs/architecture/foo.md#anchor]`
// ---------------------------------------------------------------------------
const SOURCE_CITATION_RE = /\[Source:\s+([^\]]+?)\]/g;

function extractSourceCitations(markdown) {
  if (typeof markdown !== "string") return [];
  const out = [];
  SOURCE_CITATION_RE.lastIndex = 0;
  let m;
  while ((m = SOURCE_CITATION_RE.exec(markdown)) !== null) {
    out.push(m[1].trim());
  }
  return out;
}

// ---------------------------------------------------------------------------
// Kebab-case validator. Used in filename checks for both skills.
// ---------------------------------------------------------------------------
const KEBAB_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isKebab(s) {
  return typeof s === "string" && KEBAB_RE.test(s);
}

// ---------------------------------------------------------------------------
// Sprint-status merge. The file is plain YAML of the form:
//
//   tasks:
//     - id: task.1.foo
//       status: in-progress
//   stories:
//     - id: story.1.2.bar
//       status: ready-for-dev
//
// Append-or-update under the chosen list key. Never reorders existing
// entries. Preserves comments and unrelated keys verbatim (line-oriented
// mutation, no YAML lib).
// ---------------------------------------------------------------------------
function mergeSprintStatus(yaml, entry, { listKey = "tasks" } = {}) {
  if (typeof yaml !== "string") throw new TypeError("yaml must be string");
  if (!entry || typeof entry !== "object")
    throw new TypeError("entry must be object");
  if (!entry.id || !entry.status) throw new Error("entry requires id + status");
  if (typeof listKey !== "string" || !listKey)
    throw new TypeError("listKey must be non-empty string");

  const lines = yaml.split("\n");
  const headerRe = new RegExp(
    "^" + listKey.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&") + ":\\s*$",
  );

  let headerIdx = lines.findIndex((l) => headerRe.test(l));
  if (headerIdx === -1) {
    const sep = yaml.endsWith("\n") || yaml.length === 0 ? "" : "\n";
    return `${yaml}${sep}${listKey}:\n  - id: ${entry.id}\n    status: ${entry.status}\n`;
  }

  let i = headerIdx + 1;
  while (i < lines.length) {
    const m = lines[i].match(/^ {2}- id:\s*(.+?)\s*$/);
    if (!m) {
      // End of block: top-level key, or non-indented line.
      if (lines[i] && !/^ {2}/.test(lines[i]) && lines[i].trim() !== "") break;
      i++;
      continue;
    }
    if (m[1] === entry.id) {
      let j = i + 1;
      while (j < lines.length && /^ {4}/.test(lines[j])) {
        if (/^ {4}status:/.test(lines[j])) {
          lines[j] = `    status: ${entry.status}`;
          return lines.join("\n");
        }
        j++;
      }
      lines.splice(i + 1, 0, `    status: ${entry.status}`);
      return lines.join("\n");
    }
    i++;
  }

  lines.splice(i, 0, `  - id: ${entry.id}`, `    status: ${entry.status}`);
  return lines.join("\n");
}

module.exports = {
  parseFrontmatter,
  extractSourceCitations,
  isKebab,
  mergeSprintStatus,
  KEBAB_RE,
};
