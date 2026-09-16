// AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/bug-doc.js. Regenerate via `npm run bundle`.
"use strict";

// ---------------------------------------------------------------------------
// bug-doc.js — bug-document semantics, in one place
// ---------------------------------------------------------------------------
// Canonical specs: docs/standards/bug-documents.md and create-bug-report's
// template. This module is the only implementation of the rules a tracker sync
// needs in order to publish a bug card:
//
//   * which of the three MODES a bug file is in (story / task / general),
//   * what its parent document is, and where the durable artifacts beside it are,
//   * how to read its fields when it has no YAML frontmatter at all,
//   * how to give such a file frontmatter without disturbing a byte of its body.
//
// It is shared rather than per-skill because the Jira path is a Node script and
// the GitHub path is prose driving `gh`. Two implementations of "is this a story
// bug or a task bug?" would disagree the first time a filename surprised one of
// them, and the disagreement would be invisible — each tracker would simply link
// the card to a different parent.
//
// Pure and tracker-agnostic. Deliberately requires NOTHING but node builtins:
// bundling follows `require()` edges, so a dependency on the Jira client here
// would vendor a Jira client into the GitHub-only skills that call this module's
// CLI. tracker-card-summary.md makes the same point about naming shared
// resources in prose.
//
// ---------------------------------------------------------------------------
// A note on `story_id` / `task_id`
// ---------------------------------------------------------------------------
// Bug documents do not carry them. They are *inputs* to create-bug-report, never
// document keys — the documented frontmatter schema carries parentage only in the
// free-text `related:` string, which is prose ("story 8.5.3", "none —
// cross-cutting") and cannot be parsed reliably.
//
// So the FILE'S OWN PATH is authoritative. It is the one signal that is
// structurally guaranteed: create-bug-report derives the filename from the mode,
// and a bug co-located with a story is in the story's directory by construction.
// `related:` and any hand-added `story_id` / `task_id` are read as corroboration
// and reported as a warning when they disagree — never allowed to overrule the
// path, because a wrong parent link is worse than a missing one.

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Filename grammar
// ---------------------------------------------------------------------------
// The id capture is lazy up to the literal `.bug.`, so a three-part story id
// (`story.8.5.3.bug.2.…`) parses as id `8.5.3` rather than swallowing the bug
// number. Anchored at both ends: a partial match here picks the wrong parent.
const RE_STORY_BUG = /^story\.([\d.]+?)\.bug\.(\d+)\.(.+)\.md$/i;
const RE_TASK_BUG = /^task\.([\d.]+?)\.bug\.(\d+)\.(.+)\.md$/i;
const RE_GENERAL_BUG = /^bug\.(\d+)\.(.+)\.md$/i;

// Dot-segments that mark a co-located ARTIFACT rather than the work item itself.
// Used to tell `task.67.execute-the-skill-qa-gate.md` (the parent task) from
// `task.67.qa.1.execute-the-skill-qa-gate.md` (a QA report about it).
const ARTIFACT_INFIXES = new Set([
  "bug",
  "qa",
  "plan",
  "review",
  "dod",
  "implementation",
  "handover",
  "gate",
  "validate",
  "risk",
  "trace",
  "nfr",
  "sprint-review",
  "test-design",
]);

// Durable artifacts of the BUG itself, in the order a reader wants them. Only
// durable ones are listed: point-in-time artifacts go stale, and a confidently
// wrong link is worse than no link. Same rule, and same reason, as the story
// sync's related-doc whitelist.
const RELATED_DOC_TYPES = [
  { key: "plan", label: "Fix plan" },
  { key: "review", label: "Bug review" },
  { key: "qa", label: "QA verification" },
  { key: "implementation", label: "Fix implementation report" },
  { key: "dod", label: "Definition of Done" },
];

// ---------------------------------------------------------------------------
// Mode
// ---------------------------------------------------------------------------

/**
 * Resolve which of the three bug modes a file is in, from its path.
 *
 * @returns {{mode, bugId, bugStem, parentKind, parentId, bugNumber, warnings}}
 *   `mode` is "story" | "task" | "general" | "unknown".
 *   `bugId` is the stable prefix a card and a sync label are built from
 *   (`story.7.4.bug.4`, `task.67.bug.3`, `bug.12`).
 *   `bugStem` is the filename without `.md` — the full, unique stem.
 */
function resolveBugMode(filePath, frontmatter = {}, body = "") {
  const filename = path.basename(filePath);
  const warnings = [];
  let out = null;

  let m = filename.match(RE_STORY_BUG);
  if (m) {
    out = {
      mode: "story",
      bugId: `story.${m[1]}.bug.${m[2]}`,
      parentKind: "story",
      parentId: m[1],
      bugNumber: Number(m[2]),
    };
  }
  if (!out && (m = filename.match(RE_TASK_BUG))) {
    out = {
      mode: "task",
      bugId: `task.${m[1]}.bug.${m[2]}`,
      parentKind: "task",
      parentId: m[1],
      bugNumber: Number(m[2]),
    };
  }
  if (!out && (m = filename.match(RE_GENERAL_BUG))) {
    out = {
      mode: "general",
      bugId: `bug.${m[1]}`,
      parentKind: "registry",
      parentId: null,
      bugNumber: Number(m[1]),
    };
  }
  if (!out) {
    return {
      mode: "unknown",
      bugId: filename.replace(/\.md$/i, ""),
      bugStem: filename.replace(/\.md$/i, ""),
      parentKind: null,
      parentId: null,
      bugNumber: null,
      warnings: [
        `Filename "${filename}" matches no bug naming pattern ` +
          `(story.{e}.{s}.bug.{n}.{name}.md, task.{id}.bug.{n}.{name}.md, bug.{N}.{name}.md).`,
      ],
    };
  }

  out.bugStem = filename.replace(/\.md$/i, "");
  out.warnings = warnings;

  // Corroborate against whatever the document claims. Disagreement is reported,
  // never obeyed.
  const header = parseBugHeaderBlock(body);
  const claimed = [
    frontmatter.related,
    frontmatter.story_id != null ? `story ${frontmatter.story_id}` : null,
    frontmatter.task_id != null ? `task ${frontmatter.task_id}` : null,
    header["Related"],
  ]
    .filter(Boolean)
    .map(String);

  for (const claim of claimed) {
    const c = claim.toLowerCase();
    if (/^\s*none\b|cross-cutting/.test(c)) {
      if (out.mode !== "general")
        warnings.push(
          `Document says "${claim}" but the path makes this a ${out.mode} bug. Path wins.`,
        );
      continue;
    }
    const kindMatch = c.match(/\b(story|task)\b[^\d]*([\d.]+)/);
    if (!kindMatch) continue;
    if (kindMatch[1] !== out.parentKind || kindMatch[2] !== out.parentId) {
      warnings.push(
        `Document says "${claim}" but the path makes this a ${out.mode} bug of ` +
          `${out.parentKind} ${out.parentId}. Path wins.`,
      );
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Header block — the no-frontmatter half of the corpus
// ---------------------------------------------------------------------------

const HEADER_KEYS = [
  "Bug ID",
  "Related",
  "Status",
  "Priority",
  "Severity",
  "Created",
  "Assigned To",
  "QA Engineer",
  "Jira",
  "GitHub",
];

// Leading emoji / variation selectors on a value like "✅ Closed". The bug body
// vocabulary is 🆕 New, 🔄 In Progress, ✅ Ready for QA, ✅ Closed, ⚠️ Reopened —
// de facto, documented nowhere, and not worth enumerating: strip any leading
// non-word decoration instead of matching a fixed set.
const RE_LEADING_DECORATION =
  /^[\s\u200d\ufe0f\u2190-\u2bff\p{Extended_Pictographic}]+/u;

function stripDecoration(value) {
  return String(value == null ? "" : value)
    .replace(RE_LEADING_DECORATION, "")
    .trim();
}

/**
 * Parse the `**Bug ID**: …` / `**Related**: …` header block.
 *
 * Values keep their markdown (a `**Related**` value is often a link); only the
 * `Status` value is decoration-stripped, because that one is compared against a
 * lifecycle vocabulary.
 */
function parseBugHeaderBlock(body) {
  const out = {};
  if (!body) return out;
  const re = /^\*\*([^*]+)\*\*\s*:\s*(.*)$/gm;
  for (const m of body.matchAll(re)) {
    const key = m[1].trim();
    if (!HEADER_KEYS.includes(key)) continue;
    const value = m[2].trim();
    if (!value || /^\{.*\}$/.test(value)) continue; // unfilled template placeholder
    if (out[key] === undefined) out[key] = value;
  }
  if (out.Status) out.Status = stripDecoration(out.Status);
  return out;
}

// The canonical lifecycle, and the loose spellings a hand-written header uses.
const BUG_STATUS_ALIASES = {
  new: "new",
  open: "new",
  "in progress": "in-progress",
  "in-progress": "in-progress",
  investigating: "in-progress",
  "ready for qa": "ready-for-qa",
  "ready-for-qa": "ready-for-qa",
  "in qa": "ready-for-qa",
  fixed: "ready-for-qa",
  resolved: "closed",
  closed: "closed",
  done: "closed",
  reopened: "reopened",
  reopen: "reopened",
};

/** Normalise any spelling of a bug status onto the documented lifecycle enum. */
function normaliseBugStatus(value) {
  const v = stripDecoration(value).toLowerCase();
  if (!v) return "";
  return BUG_STATUS_ALIASES[v] || v;
}

/**
 * The bug's fields, from whichever of the two shapes the file uses.
 *
 * Frontmatter wins per key; the header block fills gaps. That order matters on a
 * file carrying both: frontmatter is what the pipelines write, so it is the half
 * that is kept current.
 */
function readBugFields(frontmatter = {}, header = {}) {
  const pick = (fmKey, headerKey) => {
    const fm = frontmatter[fmKey];
    if (fm !== undefined && fm !== null && String(fm).trim() !== "")
      return String(fm).trim();
    const h = header[headerKey];
    return h === undefined ? "" : String(h).trim();
  };
  return {
    type: pick("type", null) || "bug",
    status: normaliseBugStatus(pick("status", "Status")),
    severity: pick("severity", "Severity"),
    priority: pick("priority", "Priority"),
    created: pick("created", "Created"),
    related: pick("related", "Related"),
    description: pick("description", null),
    assignee: pick("assignee", "Assigned To"),
  };
}

// ---------------------------------------------------------------------------
// Frontmatter adoption
// ---------------------------------------------------------------------------

// The sync authors files that the repo then formats, so it matches the repo's
// Prettier quote style rather than hardcoding one. Same rationale, and the same
// env escape hatch, as jira-sync.js — a single process syncing several documents
// must not switch styles halfway.
function prefersSingleQuote(fromDir) {
  const env = process.env.JIRA_SYNC_QUOTE_STYLE;
  if (env) return env.toLowerCase() === "single";
  let dir = fromDir || process.cwd();
  for (let i = 0; i < 40; i++) {
    for (const f of [
      ".prettierrc",
      ".prettierrc.json",
      ".prettierrc.yaml",
      ".prettierrc.yml",
    ]) {
      const p = path.join(dir, f);
      try {
        if (fs.existsSync(p))
          return /["']?singleQuote["']?\s*:\s*true/.test(
            fs.readFileSync(p, "utf-8"),
          );
      } catch (_) {
        /* unreadable config is not worth failing a sync over */
      }
    }
    const pkg = path.join(dir, "package.json");
    try {
      if (fs.existsSync(pkg)) {
        const j = JSON.parse(fs.readFileSync(pkg, "utf-8"));
        return !!(j.prettier && j.prettier.singleQuote === true);
      }
    } catch (_) {
      /* ditto */
    }
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return false;
}

function quoteYaml(value, single) {
  const str = String(value);
  // YAML single-quoted scalars escape an embedded quote by DOUBLING it — a
  // backslash is literal inside single quotes.
  return single
    ? `'${str.replace(/'/g, "''")}'`
    : `"${str.replace(/"/g, '\\"')}"`;
}

const SEED_ORDER = [
  "type",
  "status",
  "severity",
  "priority",
  "created",
  "related",
  "description",
];

/**
 * Give a bug document frontmatter without disturbing its body.
 *
 * No-op when the file already opens with `---` — including the case where that
 * block is missing the sync keys, which `upsertFrontmatterKeys` appends and this
 * function must not duplicate.
 *
 * Why this exists: `upsertFrontmatterKeys` returns its input UNCHANGED, and
 * silently, for a file that does not start with `---`. On such a file the sync
 * used to create the issue, write the link line, and then never persist
 * `jira_key` — so the next run created a duplicate unless the `synced-from-*`
 * label search happened to rescue it. Roughly half the bug documents in a
 * consuming repo are that shape.
 *
 * Additive by construction: the body is concatenated verbatim, so the operation
 * is a prepend, not a rewrite, and is idempotent.
 */
function ensureFrontmatter(content, seed = {}, opts = {}) {
  if (typeof content !== "string") return content;
  if (content.startsWith("---")) return content;

  const single = prefersSingleQuote(opts.dir);
  const lines = [];
  for (const key of SEED_ORDER) {
    const v = seed[key];
    if (v === undefined || v === null || String(v).trim() === "") continue;
    lines.push(`${key}: ${quoteYaml(String(v).trim(), single)}`);
  }
  if (!lines.length) lines.push(`type: ${quoteYaml("bug", single)}`);

  // Leading blank lines in the original would become a gap between the block and
  // the body; everything else is preserved byte for byte.
  return `---\n${lines.join("\n")}\n---\n\n${content.replace(/^\n+/, "")}`;
}

// ---------------------------------------------------------------------------
// Neighbouring documents
// ---------------------------------------------------------------------------

function listMarkdown(dir) {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith(".md"))
      .sort();
  } catch (_) {
    return [];
  }
}

function firstSegment(remainder) {
  return String(remainder).split(".")[0].toLowerCase();
}

/**
 * The document this bug hangs off.
 *
 * story / task → the parent work item co-located in the same directory.
 * general      → the bug registry, which is the only thing a cross-cutting bug
 *                is anchored to (docs/standards/bug-registry.md owns its number).
 *
 * Returns an absolute path, or null when nothing resolves. Never guesses: an
 * unresolvable parent yields no link rather than a plausible wrong one.
 */
function findParentDoc(filePath, mode, parentId, repoRoot = null) {
  const dir = path.dirname(path.resolve(filePath));

  if (mode === "general") {
    const root = repoRoot || findRepoRoot(dir);
    if (!root) return null;
    const registry = path.join(root, "docs", "bugs", "bug-registry.md");
    return fs.existsSync(registry) ? registry : null;
  }
  if (mode !== "story" && mode !== "task") return null;

  const prefix = `${mode}.${parentId}.`;
  const candidates = [];
  for (const f of listMarkdown(dir)) {
    if (f.toLowerCase().indexOf(prefix.toLowerCase()) !== 0) continue;
    const remainder = f.slice(prefix.length).replace(/\.md$/i, "");
    if (!remainder) continue;
    if (ARTIFACT_INFIXES.has(firstSegment(remainder))) continue;
    candidates.push({ f, depth: remainder.split(".").length });
  }
  if (!candidates.length) return null;
  // Shallowest wins — the work item's own file has no artifact infix, so it has
  // the fewest dot-segments of anything sharing its prefix.
  candidates.sort((a, b) => a.depth - b.depth || a.f.localeCompare(b.f));
  return path.join(dir, candidates[0].f);
}

function findRepoRoot(fromDir) {
  let dir = fromDir;
  for (let i = 0; i < 40; i++) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
  return null;
}

/**
 * Durable artifacts of this bug, co-located beside it.
 *
 * Matched against the bug's own id AND its full stem, because both spellings
 * exist in the wild: `bug.11.dod.1.<name>.md` and
 * `bug.1.<name>.dod.1.<name>.md` are both real. Filtering on the bug's id is
 * what keeps a task bug from listing its parent task's QA reports, and what keeps
 * sibling bugs out of each other's cards.
 */
function findRelatedBugDocs(filePath, bugId, bugStem) {
  const dir = path.dirname(path.resolve(filePath));
  const self = path.basename(filePath);
  const prefixes = [bugStem, bugId].filter(Boolean);
  const found = [];

  for (const f of listMarkdown(dir)) {
    if (f === self) continue;
    let remainder = null;
    for (const p of prefixes) {
      if (f.toLowerCase().indexOf(`${p.toLowerCase()}.`) === 0) {
        const r = f.slice(p.length + 1).replace(/\.md$/i, "");
        if (remainder === null || r.length < remainder.length) remainder = r;
      }
    }
    if (remainder === null) continue;
    const m = remainder.match(/^([a-z-]+)\.(?:(\d+)\.)?/i);
    if (!m) continue;
    const spec = RELATED_DOC_TYPES.find((t) => t.key === m[1].toLowerCase());
    if (!spec) continue;
    found.push({
      path: path.join(dir, f),
      filename: f,
      key: spec.key,
      label: spec.label,
      instance: m[2] ? Number(m[2]) : 0,
      order: RELATED_DOC_TYPES.indexOf(spec),
    });
  }

  found.sort((a, b) => a.order - b.order || a.instance - b.instance);

  // Qualify duplicates by instance, so two review reports do not both read
  // "Bug review".
  const counts = {};
  for (const d of found) counts[d.key] = (counts[d.key] || 0) + 1;
  const seen = {};
  for (const d of found) {
    if (counts[d.key] > 1) {
      seen[d.key] = (seen[d.key] || 0) + 1;
      d.label = `${d.label} ${seen[d.key]}`;
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// One-shot description of a bug file, for callers that are prose
// ---------------------------------------------------------------------------

function describe(filePath) {
  const abs = path.resolve(filePath);
  const content = fs.readFileSync(abs, "utf-8");
  const { frontmatter, body } = splitFrontmatter(content);
  const mode = resolveBugMode(abs, frontmatter, body);
  const header = parseBugHeaderBlock(body);
  const fields = readBugFields(frontmatter, header);
  const parentDoc = findParentDoc(abs, mode.mode, mode.parentId);
  const related = findRelatedBugDocs(abs, mode.bugId, mode.bugStem);

  let parentKey = null;
  let parentIssue = null;
  if (parentDoc && /\.md$/i.test(parentDoc)) {
    try {
      const pf = splitFrontmatter(
        fs.readFileSync(parentDoc, "utf-8"),
      ).frontmatter;
      parentKey = pf.jira_key || null;
      parentIssue = pf.github_issue != null ? String(pf.github_issue) : null;
    } catch (_) {
      /* an unreadable parent is a missing link, not a failure */
    }
  }

  return {
    file: abs,
    mode: mode.mode,
    bug_id: mode.bugId,
    bug_stem: mode.bugStem,
    bug_number: mode.bugNumber,
    parent_kind: mode.parentKind,
    parent_id: mode.parentId,
    parent_doc: parentDoc,
    parent_jira_key: parentKey,
    parent_github_issue: parentIssue,
    has_frontmatter: content.startsWith("---"),
    fields,
    related_docs: related.map((d) => ({
      label: d.label,
      path: d.path,
      filename: d.filename,
    })),
    jira_key: frontmatter.jira_key || null,
    jira_url: frontmatter.jira_url || null,
    github_issue:
      frontmatter.github_issue != null ? frontmatter.github_issue : null,
    warnings: mode.warnings,
  };
}

// A frontmatter reader local to this module — see the header note on why this
// file requires nothing. Same two guards as jira-sync's: no opening `---`, or no
// closing one, means there is no frontmatter, and the whole file is body.
function splitFrontmatter(content) {
  if (!content.startsWith("---")) return { frontmatter: {}, body: content };
  const closeIdx = content.indexOf("\n---", 3);
  if (closeIdx === -1) return { frontmatter: {}, body: content };
  const fmText = content.slice(4, closeIdx);
  const body = content.slice(closeIdx + 4).replace(/^\n/, "");
  const frontmatter = {};
  for (const line of fmText.split("\n")) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (v === "" || v === "null" || v === "~") {
      frontmatter[m[1]] = null;
      continue;
    }
    v = v.replace(/\s+#.*$/, "").trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    )
      v = v.slice(1, -1).replace(/''/g, "'");
    frontmatter[m[1]] = v;
  }
  return { frontmatter, body };
}

// ---------------------------------------------------------------------------
// CLI — `node bug-doc.js --file <bug.md> --json`
// ---------------------------------------------------------------------------
function main(argv) {
  const args = argv.slice(2);
  let file = "";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--file" || args[i] === "-f") file = args[++i];
    else if (args[i] === "--json") continue;
    else if (args[i].startsWith("-")) {
      process.stderr.write(`Unknown option: ${args[i]}\n`);
      return 1;
    }
  }
  if (!file) {
    process.stderr.write("Usage: bug-doc.js --file <bug.md> [--json]\n");
    return 1;
  }
  if (!fs.existsSync(file)) {
    process.stderr.write(`File not found: ${file}\n`);
    return 1;
  }
  const info = describe(file);
  process.stdout.write(JSON.stringify(info, null, 2) + "\n");
  return info.mode === "unknown" ? 1 : 0;
}

// `process.exitCode` and return, NEVER `process.exit()`.
//
// `process.exit()` tears the process down without waiting for a pending stdout
// write to drain, which truncates the output at the pipe buffer (~64KB) the
// moment a caller pipes this CLI instead of redirecting it to a file
// (bug.3.stdout-truncation-on-exit). A bug document's JSON description is well
// within reach of that.
if (require.main === module) {
  process.exitCode = main(process.argv);
} else {
  module.exports = {
    RE_STORY_BUG,
    RE_TASK_BUG,
    RE_GENERAL_BUG,
    ARTIFACT_INFIXES,
    RELATED_DOC_TYPES,
    BUG_STATUS_ALIASES,
    resolveBugMode,
    parseBugHeaderBlock,
    stripDecoration,
    normaliseBugStatus,
    readBugFields,
    ensureFrontmatter,
    findParentDoc,
    findRelatedBugDocs,
    splitFrontmatter,
    describe,
  };
}
