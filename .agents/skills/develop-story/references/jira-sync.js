// AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/jira-sync.js. Regenerate via `npm run bundle`.
"use strict";
/**
 * Shared library for the Jira sync skills — sync-jira-task, sync-jira-epic,
 * sync-jira-story and sync-jira-bug all use it.
 *
 * Pure functions where possible. I/O paths accept an injected `fetch`
 * for testing. No top-level side effects beyond `loadDotEnv()` if called.
 *
 * Frontmatter parser constraints (intentional; not full YAML):
 *   - Top-level scalar key: value pairs only (no nested mappings).
 *   - Inline arrays: [a, b, "c d"]  — no nested arrays.
 *   - Block arrays: indented `- item` lines under a bare key.
 *   - String quotes: outer matching " or '. No escape sequences honoured.
 *   - No anchors, aliases, multi-doc, flow mappings, or comments.
 *   - Document body may contain --- horizontal rules (close-tag is
 *     detected by scanning for "\n---" after the opening "---" line).
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");

// The consumer-owned status ladder (task.37). One-directional by design: this
// module requires tracker-workflow.js, never the reverse — that module is pure
// and a GitHub-only consumer must not pull the Jira client in behind it.
const tw = require("./tracker-workflow.js");

// The deferred-mutation writer (task.52). Required here so that the access gate
// below can record what it refuses; the bundler follows this sibling require and
// ships defer-mutation.js — and, transitively, the roster doc it parses — into
// every skill that carries this file.
const dm = require("./defer-mutation.js");

// The access mode captured at require time, BEFORE anything can call
// loadDotEnv(). A dot-env file must not be able to escalate a restriction the
// operator declared into a tracker write.
//
// ONE resolver, in defer-mutation.js. This file used to carry its own copy of
// the mode table, jira-create-epic.js a third and jira-sprint-lib.sh a fourth,
// and each read a different subset of the tiers. `dm.resolveAccessTracker`
// reads ACCESS_TRACKER and AGENT_SKILLS_ACCESS_TRACKER, most-restrictive-wins.
// `cwd` reaches the config tier so it anchors to the repo root the caller
// computed rather than to process.cwd() (C5-CR6).
function mostRestrictiveAccess(env = process.env, cwd = undefined) {
  return dm.resolveAccessTracker(env, { cwd });
}

// SKILLS_CONFIG_FILE is frozen alongside the two mode names: it is how the
// config tier finds the file, so leaving it out would let a .env redirect the
// config path after this snapshot (C5-CR1).
const ACCESS_ENV_AT_LOAD = Object.freeze({
  ACCESS_TRACKER: process.env.ACCESS_TRACKER,
  AGENT_SKILLS_ACCESS_TRACKER: process.env.AGENT_SKILLS_ACCESS_TRACKER,
  SKILLS_CONFIG_FILE: process.env.SKILLS_CONFIG_FILE,
});

// Every `git rev-parse` below sits inside a try/catch that reads a failure as
// "not in a repo, fall back to defaults". Without "ignore" on stderr that
// silent fallback prints a `fatal: not a git repository` line per call, which
// looks like a broken tool in pipeline output.
const GIT_EXEC_OPTS = {
  encoding: "utf-8",
  stdio: ["ignore", "pipe", "ignore"],
};

// ---------------------------------------------------------------------------
// Credential file loader
// ---------------------------------------------------------------------------
// Candidate credential files, in precedence order WITHIN each root.
//
// `.secrets/tooling.env` comes first because Nx loads workspace `.env` files
// into the environment of every task it runs. In an Nx consumer, tokens kept in
// the root `.env` are therefore in `process.env` of every application process
// started or tested through Nx, before any application code executes — measured
// in one consumer on 2026-08-09, and not fixable from the application side
// (`NX_LOAD_DOT_ENV_FILES=false` loads the file into the CLI process before the
// flag is consulted, and children inherit it). `.secrets/` sits outside the
// `.env.*` / `.*.env` names Nx generates from target and configuration names,
// so it is never auto-loaded. A path is the fix; a flag is not.
//
// `.env` stays in the list, and stays SECOND rather than being replaced. Every
// consumer that has not migrated has only `.env`, and dropping it would take
// their tracker syncs from working to doing nothing — which, given how quietly
// this function used to fail, they would not notice.
const CREDENTIAL_FILES = [".secrets/tooling.env", ".env"];

// Keys without which a Jira call cannot succeed. Used ONLY to decide whether a
// missing credential is worth warning about — a consumer who exports these in
// their shell needs no file at all and must not be nagged for not having one.
const REQUIRED_CREDENTIAL_KEYS = ["JIRA_URL", "JIRA_API_TOKEN"];

let _warnedNoCredentials = false;

/** Repo roots to search, nearest context first. */
function credentialSearchRoots() {
  const roots = [];
  const add = (r) => {
    if (r && !roots.includes(r)) roots.push(r);
  };
  try {
    add(execSync("git rev-parse --show-toplevel", GIT_EXEC_OPTS).trim());
  } catch (_) {}
  // Inside a linked worktree, --show-toplevel is the WORKTREE root. Credential
  // files are gitignored and `git worktree add` copies no ignored file, so a
  // worktree has none of its own — every /develop-batch agent would silently
  // degrade to "no credentials". --git-common-dir points at the main repo's
  // .git, whose parent does have them.
  try {
    const commonDir = execSync(
      "git rev-parse --path-format=absolute --git-common-dir",
      GIT_EXEC_OPTS,
    ).trim();
    if (commonDir) add(path.dirname(commonDir));
  } catch (_) {}
  return roots;
}

function parseEnvFileInto(absPath, target) {
  for (const line of fs.readFileSync(absPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    const val = t
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!(key in target)) target[key] = val;
  }
}

/**
 * Load credentials from the first definition of each key across every candidate
 * file, nearest root first. Returns `{ searched, loaded }` (absolute paths).
 *
 * Every readable candidate is merged rather than stopping at the first that
 * exists: a consumer mid-migration has some keys in one file and some in the
 * other, and `!(key in target)` already makes the earlier file authoritative
 * per key. Merging can only ADD a key relative to the previous one-file
 * behaviour — it can never lose one, which is what makes this safe to ship to
 * consumers who have never heard of `.secrets/`.
 */
function loadDotEnv() {
  const searched = [];
  const loaded = [];
  try {
    for (const root of credentialSearchRoots()) {
      for (const rel of CREDENTIAL_FILES) {
        const abs = path.join(root, rel);
        if (searched.includes(abs)) continue;
        searched.push(abs);
        if (!fs.existsSync(abs)) continue;
        parseEnvFileInto(abs, process.env);
        loaded.push(abs);
      }
    }
  } catch (_) {}
  warnIfCredentialsMissing(searched, loaded);
  return { searched, loaded };
}

/**
 * The defect this ends: for as long as `loadDotEnv()` returned silently on a
 * missing file, a relocated, unseeded or absent credential file made every
 * `/sync-jira-*` and every `/develop-*` tracker stage run, report success, and
 * update nothing. A 401 is diagnosable. A silent no-op is not — it is
 * indistinguishable from "there was nothing to do", which is why it survived so
 * long, and why a consumer cannot safely move its credential file until this
 * warning exists.
 *
 * Deliberately a warning on stderr rather than a throw. This function runs
 * before any caller has said what it needs, and some commands need no
 * credentials at all; throwing here would break them for no reason. stderr also
 * keeps `--json` stdout clean for machine consumers.
 *
 * The condition is "the credentials are missing", not "the file is missing" —
 * a file that exists but omits the keys produces exactly the same silent no-op,
 * and a shell that exports them needs no file at all.
 */
function warnIfCredentialsMissing(searched, loaded) {
  if (_warnedNoCredentials) return;
  const missing = REQUIRED_CREDENTIAL_KEYS.filter((k) => !process.env[k]);
  if (!missing.length) return;
  _warnedNoCredentials = true;
  const lines = [
    `⚠ agent-skills: ${missing.join(", ")} not set — Jira calls will fail, or appear to succeed while updating nothing.`,
    `    searched: ${searched.length ? searched.join(", ") : "(no repo root resolved)"}`,
    `    loaded:   ${loaded.length ? loaded.join(", ") : "(none)"}`,
  ];
  if (!loaded.length) {
    lines.push(
      `    fix: create ${CREDENTIAL_FILES[0]} at the repo root (see .env.example), or export the keys in your shell.`,
    );
  }
  process.stderr.write(lines.join("\n") + "\n");
}

/** Test seam — the warning is once-per-process by design. */
function _resetCredentialWarning() {
  _warnedNoCredentials = false;
}

// ---------------------------------------------------------------------------
// Output mode
// ---------------------------------------------------------------------------
function makeOutput({ json = false, quiet = false } = {}) {
  return {
    log: (...a) => {
      if (!json && !quiet) console.log(...a);
    },
    info: (...a) => {
      if (!json && !quiet) console.log(...a);
    },
    warn: (...a) => {
      if (!json) console.warn(...a);
    },
    err: (...a) => console.error(...a),
    emit: (payload) =>
      process.stdout.write(JSON.stringify(payload, null, 2) + "\n"),
    isJson: json,
    isQuiet: quiet,
  };
}

// ---------------------------------------------------------------------------
// Frontmatter parsing
// ---------------------------------------------------------------------------
function parseFrontmatter(content) {
  if (!content.startsWith("---")) return { frontmatter: {}, body: content };
  const closeIdx = content.indexOf("\n---", 3);
  if (closeIdx === -1) return { frontmatter: {}, body: content };
  const fmText = content.slice(4, closeIdx);
  const body = content.slice(closeIdx + 4).replace(/^\n+/, "");

  const fm = {};
  const lines = fmText.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.includes(":")) {
      i++;
      continue;
    }
    const ci = line.indexOf(":");
    const key = line.slice(0, ci).trim();
    let val = line.slice(ci + 1).trim();

    if (
      val === "" &&
      i + 1 < lines.length &&
      lines[i + 1].trimStart().startsWith("-")
    ) {
      const items = [];
      i++;
      while (i < lines.length && lines[i].trimStart().startsWith("-")) {
        items.push(
          lines[i]
            .trim()
            .slice(1)
            .trim()
            .replace(/^["']|["']$/g, ""),
        );
        i++;
      }
      fm[key] = items;
      continue;
    }

    if (val === "[]") {
      val = [];
    } else if (val.startsWith("[") && val.endsWith("]")) {
      const inner = val.slice(1, -1).trim();
      val =
        inner === ""
          ? []
          : inner.split(",").map((v) => v.trim().replace(/^["']|["']$/g, ""));
    } else if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (val === "null" || val === "~") val = null;
    fm[key] = val;
    i++;
  }
  return { frontmatter: fm, body };
}

/**
 * In-place frontmatter update. Updates value if key present, appends if not.
 * Preserves order, blank lines, and surrounding body verbatim.
 */
function upsertFrontmatterKeys(content, updates) {
  if (!content.startsWith("---")) return content;
  const closeIdx = content.indexOf("\n---", 3);
  if (closeIdx === -1) return content;
  const fmText = content.slice(4, closeIdx);
  const tail = content.slice(closeIdx);

  const lines = fmText.split("\n");
  const seen = new Set();
  const out = lines
    .map((line) => {
      const ci = line.indexOf(":");
      if (ci < 1) return line;
      const key = line.slice(0, ci).trim();
      if (!(key in updates)) return line;
      seen.add(key);
      const v = updates[key];
      if (v === null || v === undefined) return null;
      return `${key}: ${formatYamlScalar(v)}`;
    })
    .filter((l) => l !== null);

  for (const [key, v] of Object.entries(updates)) {
    if (seen.has(key)) continue;
    if (v === null || v === undefined) continue;
    out.push(`${key}: ${formatYamlScalar(v)}`);
  }

  const newFmText = out.join("\n").replace(/\n*$/, "\n");
  return "---\n" + newFmText + tail.replace(/^\n/, "");
}

// Does the consuming repo's Prettier config ask for single quotes?
//
// The sync writes frontmatter back, so it authors files the repo then formats.
// Hardcoding double quotes left every synced document prettier-dirty in a
// `singleQuote: true` repo — the card describing this defect was reformatted by
// the very sync that published it. Nothing fails; the file just drifts from
// house style until someone runs Prettier.
//
// `JIRA_SYNC_QUOTE_STYLE=single|double` overrides detection — an escape hatch for
// a repo whose config lives somewhere this does not look, and the seam the unit
// tests drive. Default is DOUBLE, matching Prettier's own default, so a repo
// with no config sees no behaviour change.
let _singleQuote = null;
function prefersSingleQuote() {
  const env = process.env.JIRA_SYNC_QUOTE_STYLE;
  if (env) return env.toLowerCase() === "single";
  if (_singleQuote !== null) return _singleQuote;
  _singleQuote = false;
  try {
    const root = getRepoRoot();
    const names = [
      ".prettierrc",
      ".prettierrc.json",
      ".prettierrc.yaml",
      ".prettierrc.yml",
    ];
    for (const f of names) {
      const p = path.join(root, f);
      if (!fs.existsSync(p)) continue;
      // Matches JSON (`"singleQuote": true`) and YAML (`singleQuote: true`).
      if (/["']?singleQuote["']?\s*:\s*true/.test(fs.readFileSync(p, "utf-8")))
        _singleQuote = true;
      break;
    }
    if (!_singleQuote) {
      const pkg = path.join(root, "package.json");
      if (fs.existsSync(pkg)) {
        const j = JSON.parse(fs.readFileSync(pkg, "utf-8"));
        if (j.prettier && j.prettier.singleQuote === true) _singleQuote = true;
      }
    }
  } catch (_) {
    // Unreadable config is not worth failing a sync over — fall back to default.
  }
  return _singleQuote;
}

// YAML single-quoted scalars escape an embedded quote by DOUBLING it, not with a
// backslash — a backslash is literal inside single quotes.
function quoteYaml(s) {
  const str = String(s);
  return prefersSingleQuote()
    ? `'${str.replace(/'/g, "''")}'`
    : `"${str.replace(/"/g, '\\"')}"`;
}

function formatYamlScalar(v) {
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `[${v.map(quoteYaml).join(", ")}]`;
  return quoteYaml(v);
}

function rewriteFrontmatter(content, mutator) {
  if (!content.startsWith("---")) return content;
  const closeIdx = content.indexOf("\n---", 3);
  if (closeIdx === -1) return content;
  const fmText = content.slice(4, closeIdx);
  const tail = content.slice(closeIdx);
  const newFmText = mutator(fmText);
  return "---\n" + newFmText.replace(/\n*$/, "\n") + tail.replace(/^\n/, "");
}

// ---------------------------------------------------------------------------
// Git / Bitbucket
// ---------------------------------------------------------------------------
function getRepoRoot() {
  try {
    return execSync("git rev-parse --show-toplevel", GIT_EXEC_OPTS).trim();
  } catch (_) {
    return process.cwd();
  }
}

// git's idea of the default branch. Correct, and frequently the wrong answer for
// a DOCUMENT link: git can tell you a repo's default branch is `main`, but it
// cannot know that the repo's documents live on `develop` and only reach `main`
// through a release. That is a project convention, so it comes from config —
// see loadDocBranchSetting() and resolveDocBranch() below.
function gitDefaultBranch() {
  try {
    const ref = execSync("git symbolic-ref refs/remotes/origin/HEAD", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const m = ref.match(/refs\/remotes\/origin\/(.+)$/);
    if (m) return m[1];
  } catch (_) {}
  for (const candidate of ["main", "master", "develop"]) {
    try {
      execSync(`git rev-parse --verify --quiet origin/${candidate}`, {
        stdio: "ignore",
      });
      return candidate;
    } catch (_) {}
  }
  return "main";
}

// Kept as the long-standing public name for git's default branch, and kept
// git-only ON PURPOSE. Making it config-aware would have left an exported
// function whose name promises one thing and returns another, for no gain:
// resolveDocBranch() below is the single config-aware entry point, and it is
// what every caller now uses.
function getDefaultBranch() {
  return gitDefaultBranch();
}

// Resolve the branch a document link should point at, in the documented order:
//
//   explicit --doc-branch  →  config  →  current branch's upstream  →  git default
//
// Config sits AHEAD of the branch upstream deliberately. A feature branch does
// contain the document, so linking to it resolves today — and 404s the moment
// the branch is deleted after merge. The configured branch is the durable one,
// which is the whole point of emitting a permanent link.
function resolveDocBranch(explicit, repoRoot) {
  if (explicit && String(explicit).trim()) return String(explicit).trim();
  const configured = loadDocBranchSetting(repoRoot);
  if (configured) return configured;
  return getCurrentBranchUpstream() || gitDefaultBranch();
}

// Pure: strip the remote name (first path segment) from an upstream ref.
// "origin/feature/foo" -> "feature/foo"; "" / "noref" -> null. Remote names
// cannot contain "/", but branch names can (feature/...), so strip only up to
// and including the FIRST slash.
function stripRemotePrefix(upstreamRef) {
  if (!upstreamRef) return null;
  const slash = upstreamRef.indexOf("/");
  return slash === -1 ? null : upstreamRef.slice(slash + 1);
}

// Resolve the current branch's remote-tracking branch name WITHOUT the remote
// prefix. E.g. when on `feature/story.5.1.foo` tracking
// `origin/feature/story.5.1.foo`, returns "feature/story.5.1.foo".
//
// Returns null on detached HEAD / no configured upstream / git unavailable —
// callers fall back to getDefaultBranch(). Remote-name agnostic (works for
// non-"origin" remotes) and safe for branch names containing "/".
function getCurrentBranchUpstream() {
  try {
    const upstream = execSync(
      "git rev-parse --abbrev-ref --symbolic-full-name @{u}",
      { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    return stripRemotePrefix(upstream);
  } catch (_) {
    return null; // detached HEAD, no upstream, or git not available
  }
}

function getBitbucketRepoBase() {
  const env = process.env.BITBUCKET_REPO_URL;
  if (env) return env.replace(/\/$/, "");
  try {
    const remote = execSync("git remote get-url origin", {
      encoding: "utf-8",
    }).trim();
    const base = remote
      .replace(/^git@bitbucket\.org:/, "https://bitbucket.org/")
      .replace(/\.git$/, "");
    if (base.startsWith("https://bitbucket.org/")) return base;
  } catch (_) {}
  return null;
}

// A repo-relative markdown href from one document to another — the local-file
// counterpart of `buildBitbucketUrl`.
//
// Absolute Bitbucket URLs name a branch, so they die when that branch is deleted
// and nothing in a repo validates them. A relative href is validated by any
// ordinary link checker and cannot rot. Jira loses nothing: `resolveRelativeLink`
// turns these back into absolute URLs when the description is rendered.
//
// Always POSIX separators (markdown, not a filesystem path), and always explicitly
// prefixed — a bare `task.62.md` is a valid relative link but reads like a word,
// and `./task.62.md` does not.
function toRelativeDocLink(fromFile, toFile) {
  const rel = path.relative(path.dirname(fromFile), toFile).replace(/\\/g, "/");
  if (!rel) return "./" + path.basename(toFile);
  return rel.startsWith(".") ? rel : "./" + rel;
}

function buildBitbucketUrl(absPath, repoRoot, bbBase, branch) {
  const rel = path.relative(repoRoot, absPath).replace(/\\/g, "/");
  const ref = branch || "HEAD";
  return `${bbBase}/src/${ref}/${rel}`;
}

// ---------------------------------------------------------------------------
// Relative-link resolution
// ---------------------------------------------------------------------------
// Local markdown links relative to a doc's own directory (e.g.
// `[runbook](task.4.runbook.md)`) resolve fine in a Bitbucket file viewer but
// are dead once that same prose is copied into a Jira description -- Jira has
// no "relative to this file" base path. Rewrite them to absolute Bitbucket
// URLs at ADF-render time so a link that works locally also works in Jira.
function resolveRelativeLink(href, { filePath, repoRoot, bbBase, branch }) {
  if (!href || !bbBase) return href;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(href)) return href; // has a scheme (http:, mailto:, ...)
  if (href.startsWith("#")) return href; // in-page anchor
  const hashIdx = href.indexOf("#");
  const pathPart = hashIdx === -1 ? href : href.slice(0, hashIdx);
  const fragment = hashIdx === -1 ? "" : href.slice(hashIdx);
  if (!pathPart) return href;
  const resolved = path.resolve(path.dirname(filePath), pathPart);
  if (!fs.existsSync(resolved)) return href; // don't mask a broken link -- leave it as-authored
  return buildBitbucketUrl(resolved, repoRoot, bbBase, branch) + fragment;
}

function makeRelativeLinkResolver({ filePath, repoRoot, bbBase, branch }) {
  if (!bbBase) return null;
  return (href) =>
    resolveRelativeLink(href, { filePath, repoRoot, bbBase, branch });
}

// ---------------------------------------------------------------------------
// Change Log — the narrowed sync rules
// ---------------------------------------------------------------------------
// The engine is `change-log.js`, which is tracker-agnostic and canonical for
// every document type (spec: document-change-log.md). What lives here is the
// Jira-specific *policy*: which sync events earn a row.
//
// The task.42 compatibility wrappers (`fmtEntry`, `buildChangelogBlock`,
// `upsertChangelog` and the marker/predicate aliases) were removed here — the
// three sync scripts now call `change-log.js` directly with a structured entry,
// which is what those wrappers were holding the door open for.
const CL = require("./change-log.js");

// Not changelog-specific despite having lived in the old block: `escapeRe` is used
// by the section extractor and the frontmatter key rewriter, and is exported.
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Decide which Change Log rows a sync run has earned.
 *
 * A row is written for exactly two events: the issue being created, and the
 * status being transitioned. A body, summary, priority or label update writes
 * **none** — Jira keeps a full issue history with actor and timestamp, which is
 * strictly better than a local row saying only which fields moved, and the
 * document now records *why* the body changed through its own review, develop
 * and QA rows.
 *
 * Returning `[]` is the load-bearing case. `upsertChangeLog` performs legacy
 * marker migration as a side effect of writing a row, so an empty list means no
 * call and no migration. The callers' `fs.writeFileSync` is unconditional — they
 * refresh frontmatter timestamps either way — so what this buys is not a skipped
 * write but an unchanged one: no new row, no marker rewrite, byte-identical
 * content and an empty `git diff`. That is what stops consecutive no-op syncs
 * churning every document's history.
 *
 * @param {object}  o
 * @param {boolean} o.created         true when this run created the issue
 * @param {string}  o.issueKey        e.g. "PROJ-42"
 * @param {object}  [o.statusOutcome] result of `syncDocumentStatus`
 * @param {string}  o.author          the calling skill, e.g. "sync-jira-task"
 * @param {string}  o.docNoun         "story" | "task" | "epic" | "bug" — for the prose
 * @param {string}  [o.date]          ISO date; defaults to today
 * @returns {Array<{date, description, author}>} zero, one or two entries
 */
function buildChangeLogEntries({
  created,
  issueKey,
  statusOutcome,
  author,
  docNoun,
  date,
}) {
  const day = date || new Date().toISOString().slice(0, 10);
  const entries = [];

  if (created) {
    entries.push({
      date: day,
      description: `Jira ${docNoun} created (${issueKey})`,
      author,
    });
  }

  // `transitioned` is false for the no-target, already-there and no-transition
  // outcomes alike — all of which are "nothing moved", and none of which is an
  // event worth a row.
  //
  // `transitioned: true` means the card DID move, so it always earns a row. What
  // varies is how precisely we can name where it landed:
  //   `to`     — the landed status, when Jira reported one (the normal case)
  //   `landed` — the ladder walker's equivalent field, for a multi-hop walk
  //   `via`    — the transition fired; known even when the destination is not
  //
  // Gating the row on `to` alone would drop a real event whenever Jira omitted the
  // destination, which is the failure this module exists to prevent: a missing row
  // is unrecoverable, while an imprecise one still tells the reader what happened.
  if (statusOutcome?.transitioned) {
    const landed = statusOutcome.to || statusOutcome.landed;
    entries.push({
      date: day,
      description: landed
        ? `Status → ${landed}`
        : statusOutcome.via
          ? `Status changed via "${statusOutcome.via}"`
          : "Status changed",
      author,
    });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// ADF builders
// ---------------------------------------------------------------------------
const adf = {
  doc: (...content) => ({ version: 1, type: "doc", content }),
  paragraph: (...content) => ({ type: "paragraph", content }),
  heading: (level, text) => ({
    type: "heading",
    attrs: { level },
    content: [{ type: "text", text }],
  }),
  text: (t) => ({ type: "text", text: t }),
  link: (text, href) => ({
    type: "text",
    text,
    marks: [{ type: "link", attrs: { href } }],
  }),
  bulletList: (...items) => ({ type: "bulletList", content: items }),
  orderedList: (...items) => ({ type: "orderedList", content: items }),
  listItem: (...content) => ({ type: "listItem", content }),
  table: (rows) => ({
    type: "table",
    attrs: { isNumberColumnEnabled: false, layout: "default" },
    content: rows,
  }),
  tableRow: (...cells) => ({ type: "tableRow", content: cells }),
  tableHeader: (...content) => ({ type: "tableHeader", attrs: {}, content }),
  tableCell: (...content) => ({ type: "tableCell", attrs: {}, content }),
  hardBreak: () => ({ type: "hardBreak" }),
  // A fenced code block. `language` is optional: Jira renders an unlabelled
  // block fine, but omitting the attr entirely is not the same as an empty
  // string to every ADF consumer, so only set it when we actually have one.
  codeBlock: (text, language) => ({
    type: "codeBlock",
    ...(language ? { attrs: { language } } : { attrs: {} }),
    // An empty fence is legal markdown but an empty `content` array is not
    // legal ADF, so an empty block carries no content key at all.
    ...(text ? { content: [{ type: "text", text }] } : {}),
  }),
  // Italic text. Deliberately a builder rather than an inline-markdown rule:
  // see the note on inlineMarkdownToAdf below.
  em: (t) => ({ type: "text", text: t, marks: [{ type: "em" }] }),
};

const RE_BULLET = /^\s*[-*]\s+(.*)$/;
const RE_ORDERED = /^\s*\d+\.\s+(.*)$/;
// A code fence, matched as a PREDICATE rather than one regex, because the rule
// that matters cannot be expressed cleanly in a single pattern.
//
// This has now been wrong in both directions, so both are recorded:
//
//   Too STRICT — `(\S*)\s*$` required the whole info string to be one token, so
//   ```` ```js title="x" ```` did not match at all. The opening line rendered as
//   prose and the CLOSING fence was then read as an opening one, swallowing
//   every later block.
//
//   Too LOOSE — relaxing the tail to `[^\n]*` let backticks back in, so a prose
//   line that merely BEGINS with an inline code span of three or more backticks
//   became an opening fence. One live document hit it: task.42 line 313 reads
//   "```` ``` ```` or `~~~` fenced block." and 31,235 characters of that file
//   collapsed into a single code block.
//
// CommonMark states the rule directly: a backtick fence's info string may not
// contain a backtick. Tilde fences have no such restriction, because `~` cannot
// open an inline code span. That asymmetry is the whole fix.
function matchCodeFence(line) {
  const m = /^\s*(`{3,}|~{3,})[ \t]*(.*)$/.exec(line);
  if (!m) return null;
  const delim = m[1];
  const rest = m[2];
  if (delim[0] === "`" && rest.includes("`")) return null;
  return { delim, lang: rest.trim().split(/\s+/)[0] || "" };
}

// ---------------------------------------------------------------------------
// Inline markdown parser — **bold**, `code`, [link](url)
//
// Deliberately NOT handling *italic* / _italic_. The bold rule already owns
// `*`, so a single-asterisk alternative would have to be ordered against it and
// would change how every existing document renders — a wide blast radius for a
// syntax none of them use. Callers that need italics (the tracker-comment
// identity footer) build the node directly with `adf.em()`.
// ---------------------------------------------------------------------------
function inlineMarkdownToAdf(text, linkResolver) {
  if (text == null || text === "") return [adf.text("")];
  // Build a fresh regex each call to reset lastIndex safely across re-entrant use.
  const re = /(\*\*([^*\n]+)\*\*)|(`([^`\n]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g;
  const out = [];
  let lastIdx = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > lastIdx) out.push(adf.text(text.slice(lastIdx, m.index)));
    if (m[1])
      out.push({ type: "text", text: m[2], marks: [{ type: "strong" }] });
    else if (m[3])
      out.push({ type: "text", text: m[4], marks: [{ type: "code" }] });
    else if (m[5])
      out.push(adf.link(m[6], linkResolver ? linkResolver(m[7]) : m[7]));
    lastIdx = re.lastIndex;
  }
  if (lastIdx < text.length) out.push(adf.text(text.slice(lastIdx)));
  return out.length ? out : [adf.text(text)];
}

// ---------------------------------------------------------------------------
// Table helpers for textToAdfNodes
// ---------------------------------------------------------------------------
const RE_MD_HEADING = /^(#{2,6})\s+(.+)$/;
const RE_TABLE_ROW_START = /^\s*\|/;
const RE_HR_LINE = /^[-*_]{3,}\s*$/;

function isTableSepLine(l) {
  return /^\|?[\s\-:|]+\|?$/.test(l.trim()) && /-/.test(l);
}

function tableLinesToAdf(lines, linkResolver) {
  const dataLines = lines.filter((l) => l.trim() && !isTableSepLine(l));
  if (!dataLines.length) return null;
  const PH = "\x01";
  const splitRow = (line) => {
    const masked = line.replace(/\\\|/g, PH);
    const cells = masked.split("|");
    if (cells.length && cells[0].trim() === "") cells.shift();
    if (cells.length && cells[cells.length - 1].trim() === "") cells.pop();
    return cells.map((c) => c.split(PH).join("|").trim());
  };
  const rows = dataLines.map(splitRow);
  const [header, ...body] = rows;
  if (!header || !header.length) return null;
  return adf.table([
    adf.tableRow(
      ...header.map((h) =>
        adf.tableHeader(adf.paragraph(...inlineMarkdownToAdf(h, linkResolver))),
      ),
    ),
    ...body.map((r) =>
      adf.tableRow(
        ...r.map((c) =>
          adf.tableCell(adf.paragraph(...inlineMarkdownToAdf(c, linkResolver))),
        ),
      ),
    ),
  ]);
}

/**
 * Convert markdown text to ADF nodes. Handles:
 * - ##–###### headings → ADF heading nodes
 * - ``` fenced blocks → ADF codeBlock nodes (language tag preserved)
 * - pipe tables (|...|) → ADF table nodes with inline markdown in cells
 * - horizontal rules (---) → skipped
 * - bullet/ordered lists → proper ADF list nodes
 * - **bold**, `code`, [link](url) → inline marks
 *
 * Fences are tracked HERE rather than in blockToAdf, and that placement is
 * load-bearing: this loop splits on blank lines before blockToAdf ever sees a
 * block, so a fenced listing containing a blank line — or a `#` comment, or a
 * row of `|` — would be torn into pieces and each piece parsed as prose. Inside
 * a fence every other rule is suspended and lines are taken verbatim.
 */
function textToAdfNodes(text, linkResolver) {
  if (!text) return [];
  const nodes = [];
  const lines = text.split("\n");
  let buf = [];
  let tableBuf = [];
  let fenceBuf = null; // non-null ⇒ inside a fence
  let fenceLang = "";
  let fenceDelim = "";

  const flushBuf = () => {
    if (!buf.length) return;
    const blockText = buf.join("\n").trim();
    buf = [];
    if (blockText) nodes.push(...blockToAdf(blockText, linkResolver));
  };
  const flushTable = () => {
    if (!tableBuf.length) return;
    const node = tableLinesToAdf(tableBuf, linkResolver);
    tableBuf = [];
    if (node) nodes.push(node);
  };

  for (const line of lines) {
    const trimmed = line.trim();

    const fm = matchCodeFence(line);
    if (fenceBuf !== null) {
      // Inside a fence: only a closing fence of the SAME delimiter type is
      // interpreted, so a ``` line inside a ~~~ block stays content. Everything
      // else is kept verbatim — no trim, because indentation is significant in
      // code and a re-indented listing is a corrupted one.
      // A closing fence must use the SAME delimiter character, be AT LEAST as
      // long as the opening run, and carry no info string — CommonMark's rule.
      // Comparing only the character let a 3-backtick line close a 4-backtick
      // fence, tearing apart every nested example in this repo's own docs
      // (three shipped documents use ```` to wrap ``` blocks).
      if (
        fm &&
        fm.delim[0] === fenceDelim[0] &&
        fm.delim.length >= fenceDelim.length &&
        !fm.lang
      ) {
        nodes.push(adf.codeBlock(fenceBuf.join("\n"), fenceLang));
        fenceBuf = null;
        fenceLang = "";
        fenceDelim = "";
      } else {
        fenceBuf.push(line);
      }
      continue;
    }
    if (fm) {
      // Opening fence. Flush whatever precedes it first, exactly as a heading
      // or table boundary would.
      flushBuf();
      flushTable();
      fenceBuf = [];
      fenceDelim = fm.delim;
      fenceLang = fm.lang;
      continue;
    }

    if (RE_HR_LINE.test(trimmed)) {
      // horizontal rule — skip
      flushBuf();
      flushTable();
      continue;
    }
    const hm = trimmed.match(RE_MD_HEADING);
    if (hm) {
      // ##–###### heading
      flushBuf();
      flushTable();
      nodes.push(adf.heading(Math.min(hm[1].length, 6), hm[2]));
      continue;
    }
    if (RE_TABLE_ROW_START.test(line)) {
      // table row
      flushBuf();
      tableBuf.push(line);
      continue;
    }
    if (tableBuf.length) flushTable(); // non-table line ends table
    if (trimmed === "") {
      flushBuf();
      continue;
    } // blank line = paragraph break
    buf.push(line);
  }

  // An unterminated fence still yields a code block rather than being dropped:
  // truncated input is common (the description cap cuts mid-document), and a
  // silently vanished listing is worse than an unclosed one.
  if (fenceBuf !== null)
    nodes.push(adf.codeBlock(fenceBuf.join("\n"), fenceLang));
  flushBuf();
  flushTable();
  return nodes.filter(Boolean);
}

function blockToAdf(block, linkResolver) {
  const lines = block.split("\n").filter((l) => l.length > 0);
  if (lines.length === 0) return [];

  if (lines.every((l) => RE_BULLET.test(l))) {
    return [
      adf.bulletList(
        ...lines.map((l) => {
          const m = l.match(RE_BULLET);
          return adf.listItem(
            adf.paragraph(...inlineMarkdownToAdf(m[1], linkResolver)),
          );
        }),
      ),
    ];
  }
  if (lines.every((l) => RE_ORDERED.test(l))) {
    return [
      adf.orderedList(
        ...lines.map((l) => {
          const m = l.match(RE_ORDERED);
          return adf.listItem(
            adf.paragraph(...inlineMarkdownToAdf(m[1], linkResolver)),
          );
        }),
      ),
    ];
  }

  const inline = [];
  lines.forEach((l, i) => {
    if (l.length) inline.push(...inlineMarkdownToAdf(l, linkResolver));
    if (i < lines.length - 1) inline.push(adf.hardBreak());
  });
  return inline.length ? [adf.paragraph(...inline)] : [];
}

// Backward-compat name
const textToParagraphs = textToAdfNodes;

// Matches a level-2 section heading by name and captures its body.
//
//   (?:^|\n)     Anchor to the start of a line. Without this, `## Foo` matched as
//                a SUBSTRING of `### Foo`, `#### Foo`, and even prose ("see ## Foo"),
//                so a nested sub-heading could silently win over the real section.
//   \d+[.)]      Optional numbering. `create-task`'s own template emits
//                `## 1. Overview` … `## 11. Rollback Plan`, and lib.js requires
//                those literal strings — so without this, every task card created
//                the intended way extracted ZERO sections and shipped a Jira
//                description containing no body at all.
//   [ \t]*\n     Consume the rest of the heading LINE and nothing more. The old
//                `\s*\n+` ate the blank line separating an empty section from the
//                next heading, so `## Overview` immediately followed by
//                `## Motivation` captured Motivation's heading AND body as
//                Overview's content — mislabelling one section and dropping the
//                other. Leading blank lines now stay inside the capture, which is
//                harmless: callers `.trim()`.
//
// Deliberately NOT the `m` flag: the `$` in the lookahead must mean end-of-string.
// With `m` it would mean end-of-line and truncate every section to its first line.
//
// `### Sub-headings` inside a section body are preserved — the lookahead stops at
// `\n## ` and `\n# `, neither of which matches `\n### `.
function sectionRe(name) {
  return new RegExp(
    `(?:^|\\n)## (?:\\d+[.)]\\s*)?${escapeRe(name)}[ \\t]*\\n([\\s\\S]*?)(?=\\n## |\\n# |$)`,
  );
}

// Returns [{ name, content }] for each requested section found in `body`.
//
// `name` is always the CANONICAL requested name, never the matched text — so a
// `## 3. Technical Background` heading yields name `Technical Background`. Callers
// re-emit this as the Jira heading, and Jira renders sections in list order, so the
// numbers would be redundant noise there. Keeping it canonical also means adding
// or removing numbering in a doc does not churn `hashBody` and force a no-op PUT.
//
// Pass `output` to warn about sections that were requested but did not resolve.
// Silence here is how a heading-contract mismatch went unnoticed across 28 task
// cards: the sync succeeded, reported no problem, and published an empty body.
// Only pass it from ONE call site per run — `buildDescriptionAdf` and `hashBody`
// both extract from the same body, so passing it from both double-warns.
// An entry in `sectionNames` may be an ARRAY OF ALTERNATIVE SPELLINGS for one
// logical section — `["User Story", "Story", "Story Statement"]`. Alternatives
// are tried in order and the first that resolves wins; `name` is the array's
// FIRST element, keeping the canonical-name contract above intact so switching
// between accepted spellings does not churn `hashBody`.
//
// Aliases exist because a section list and a corpus can disagree about a
// heading's name without either being wrong. Measured across 426 stories:
// `## Story` 234, `## Story Statement` 161, `## User Story` 7 — the list named
// only the last, so 98% of stories published their acceptance criteria and
// nothing else. Widening costs nothing; renaming ~395 files to satisfy the tool
// would have been the tool dictating to the corpus.
function extractBodySections(body, sectionNames, output = null) {
  const out = [];
  const missing = [];
  for (const entry of sectionNames) {
    const alts = Array.isArray(entry) ? entry : [entry];
    let hit = null;
    for (const alt of alts) {
      const content = extractSection(body, alt);
      if (content && content.trim()) {
        hit = content.trim();
        break;
      }
    }
    if (hit !== null) out.push({ name: alts[0], content: hit });
    // Report every accepted spelling: a reader told only "User Story not found"
    // would rename a heading that was already acceptable under another alias.
    else missing.push(alts.join(" / "));
  }

  if (output && missing.length) {
    const warn = output.warn || ((...a) => console.warn(...a));
    if (!out.length) {
      // Every section missing means the document and the section list disagree
      // about heading names — a contract mismatch, not an incomplete document.
      warn(
        `None of the ${sectionNames.length} expected sections were found. The Jira description will have no body.\n` +
          `    Expected level-2 headings (numbering optional, " / " = accepted alternatives): ${sectionNames.map((e) => (Array.isArray(e) ? e.join(" / ") : e)).join(", ")}\n` +
          `    Check the document's '## ' headings match these names.`,
      );
    } else {
      warn(
        `Sections not found, omitted from the Jira description: ${missing.join(", ")}`,
      );
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Description size guard
// ---------------------------------------------------------------------------

// Jira rejects a description whose extracted text exceeds ~32,767 characters with
// CONTENT_LIMIT_EXCEEDED. The whole PUT fails, so the issue keeps its PREVIOUS
// description — the sync surfaces an opaque HTTP 400 and the Jira card silently
// stays stale. Nothing in the error names the size.
const JIRA_TEXT_LIMIT = 32767;
const DEFAULT_CAP = JIRA_TEXT_LIMIT - 800; // headroom for the notice below

function adfTextLength(node) {
  if (!node || typeof node !== "object") return 0;
  if (typeof node.text === "string") return node.text.length;
  if (!Array.isArray(node.content)) return 0;
  let n = 0;
  for (const c of node.content) n += adfTextLength(c);
  return n;
}

// Trim an ADF doc to fit, dropping WHOLE top-level blocks from the end and
// appending a notice naming what was dropped and where to read it.
//
// Whole blocks, not sliced text: a half-emitted table or list is invalid ADF and
// is rejected for a different, even less obvious reason. Truncation is announced
// twice — in the published description (so a Jira reader knows they are seeing
// part of it) and on stderr (so the operator knows it happened). Truncating
// silently would be the same defect class as the failure it replaces.
function capDescriptionAdf(doc, opts = {}) {
  const { limit = DEFAULT_CAP, sourceUrl = null, output = null } = opts;
  if (!doc || !Array.isArray(doc.content)) return doc;
  const total = adfTextLength(doc);
  if (total <= limit) return doc;

  const kept = [];
  let used = 0,
    dropped = 0;
  for (const block of doc.content) {
    const len = adfTextLength(block);
    if (used + len > limit) {
      dropped++;
      continue;
    }
    kept.push(block);
    used += len;
  }

  const where = sourceUrl
    ? [
        adf.text("Read the full document: "),
        adf.link("source document", sourceUrl),
      ]
    : [adf.text("Read the full document in the repository.")];
  kept.push(
    adf.paragraph(
      adf.text(
        `⚠️ Truncated to fit Jira's ${JIRA_TEXT_LIMIT}-character description limit — ` +
          `${dropped} section(s) omitted, ${total} characters in the source. `,
      ),
      ...where,
    ),
  );

  if (output) {
    const warn = output.warn || ((...a) => console.warn(...a));
    warn(
      `Description is ${total} characters, over Jira's ${JIRA_TEXT_LIMIT} limit — ` +
        `${dropped} trailing section(s) omitted from the published description.\n` +
        `    The document itself is unchanged. Move detail into a companion file to publish it in full.`,
    );
  }
  return { ...doc, content: kept };
}

// ---------------------------------------------------------------------------
// Card summarisation
// ---------------------------------------------------------------------------

// A tracker card is a POINTER to the document, not a copy of it.
//
// This used to be a mirror: the task card published all ELEVEN `## ` sections of
// the task document verbatim, the story card published its full uncapped
// acceptance criteria, and every card re-published the document's entire Change
// Log as a table on every sync. Two costs. The obvious one is that a board reader
// scrolls a wall of text to learn what a ticket is about. The subtler one is that
// the mirror was always going to lose: the local file is the source of truth, so
// a card that duplicates it is a second copy that silently goes stale between
// syncs, and `capDescriptionAdf` below exists only because those descriptions
// grew until Jira rejected the whole PUT.
//
// So the caps are editorial, not defensive. `capDescriptionAdf` remains as a
// last-resort guard; after summarisation it should never fire.
const CARD_MAX_LIST_ITEMS = 5; // criteria kept on the card
const CARD_MAX_SENTENCES = 4; // prose sentences kept on the card
// Backstop for prose the sentence cap cannot reach: an author who writes one
// long unpunctuated paragraph splits into a single "sentence", so 4 sentences
// is no limit at all. Generous enough that normal prose never hits it.
const CARD_MAX_CHARS = 600;

const RE_SUBHEADING = /^#{3,6}\s+/;
const RE_FENCE = /^\s*(```|~~~)/;

// Fence-aware section extraction — the function `extractBodySections` and
// `sync-jira-epic`'s `extractStoriesTable` actually use. Those were the last two
// callers to match `sectionRe` for extraction, so it is now exported for its
// tests alone: they pin its shape (notably the absence of an `m` flag) because
// it is still the reference for what a section heading looks like, and any
// future extractor must agree with it on everything except fences.
//
// A regular expression cannot know whether the `# ` it matched sits inside a
// fenced code block, and `sectionRe`'s lookahead `(?=\n## |\n# |$)` ends a section
// at the first line beginning `# `.
//
// So a shell comment inside a ```bash block silently TERMINATED the section: every
// heading and paragraph after it was dropped from the Jira description, with no
// warning on stderr and nothing in the output to show content had gone missing.
// Invisible from both ends — the document looked complete, the description looked
// deliberate. Measured on one card: a Technical Background section cut from 13,965
// characters to 2,283, discarding a dependency table and an entire open-questions
// block. The workaround in the wild is indenting the comment two spaces so it no
// longer starts at column 0, which is a thing authors must remember forever.
//
// The symptom is also indistinguishable from `CONTENT_LIMIT_EXCEEDED` truncation,
// so the first instinct is to blame document size and start deleting prose.
//
// Walking lines costs one pass and removes the whole class of problem.
//
// Returns the section's raw content, or null when the heading is not present.
// Callers `.trim()`. An unterminated fence is treated as running to end-of-body,
// which matches how every markdown renderer handles it.
// Track fences by CommonMark's rules rather than "a line starting with three
// backticks". Returns a predicate: true when the line is a fence delimiter or
// sits inside a fenced block, and so must not be read as markdown structure.
//
// Toggling on any ``` run is not good enough, and a real card proved it. A doc
// explaining fences wrote ```` ``` ```` — four backticks wrapping three, the
// normal way to show a fence inside prose. Naive toggling opened a block there
// and every later fence flipped the parity, so the second half of the document
// looked permanently "inside a fence" and its headings became invisible. The
// card then published with sections missing — the same silent-truncation failure
// this function exists to remove, arriving from the other direction.
//
// The three rules that matter:
//   - a backtick fence's info string may NOT contain a backtick, which is exactly
//     what makes ```` ``` ```` an inline code span and not an opening fence;
//   - a closing fence must use the same character and a run at least as long as
//     the opening one, so ``` inside a ```` block is content;
//   - a closing fence takes no info string.
//
// Indentation is capped at 3 spaces, per CommonMark. Anything more deeply
// indented is an indented code block — and cannot be mistaken for a heading
// anyway, since the heading test below anchors on column 0.
function makeFenceTracker() {
  let open = null; // { char, len }
  return function isFenceLine(line) {
    const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (!m) return open !== null;
    const char = m[1][0];
    const len = m[1].length;
    const info = m[2];

    if (open === null) {
      if (char === "`" && info.includes("`")) return false; // an inline code span
      open = { char, len };
      return true;
    }
    if (char === open.char && len >= open.len && info.trim() === "") {
      open = null;
      return true;
    }
    return true; // a fence-looking line inside a block is just content
  };
}

function extractSection(body, name) {
  const lines = String(body ?? "").split("\n");
  const heading = new RegExp(`^## (?:\\d+[.)]\\s*)?${escapeRe(name)}[ \\t]*$`);
  const isFenceLine = makeFenceTracker();
  let start = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isFenceLine(line)) continue; // a '#' inside a fence is code, not a heading
    if (start === -1) {
      if (heading.test(line)) start = i + 1;
    } else if (line.startsWith("## ") || line.startsWith("# ")) {
      return lines.slice(start, i).join("\n");
    }
  }
  return start === -1 ? null : lines.slice(start).join("\n");
}

// Split prose into sentences without a full parser.
//
// Terminator followed by whitespace + an uppercase-ish opener. The negative
// lookbehind list covers the abbreviations that actually show up in these
// documents; a missed split yields a slightly longer summary, never a wrong one.
const RE_ABBREV =
  /(?:\b(?:e\.g|i\.e|etc|vs|approx|Dr|Mr|Ms|Mrs|St|No|Fig|cf)\.)$/i;

function splitSentences(text) {
  const out = [];
  let start = 0;
  const re = /[.!?]+(?=\s+|$)/g;
  let m;
  while ((m = re.exec(text))) {
    const end = m.index + m[0].length;
    const candidate = text.slice(start, end);
    // Don't split on a decimal point ("2.5 hours") or a known abbreviation.
    if (RE_ABBREV.test(candidate.trimEnd())) continue;
    if (/\d\.$/.test(candidate) && /^\s*\d/.test(text.slice(end))) continue;
    out.push(candidate.trim());
    start = end;
  }
  const tail = text.slice(start).trim();
  if (tail) out.push(tail);
  return out.filter(Boolean);
}

// Strip `### ` heading LINES while keeping everything under them.
//
// Real documents group card content under sub-headings: a task's Success
// Criteria opens with `### Functional`, an epic's Stories Breakdown puts its
// overview table under `### Stories Overview`. An earlier version of this cut
// the body at the first sub-heading, which deleted precisely the content the
// card wanted and left the grouping preamble behind — the exact inverse. On a
// card this short the grouping labels are noise anyway: drop the labels, keep
// the items.
function dropHeadingLines(src) {
  const out = [];
  let inFence = false;
  for (const line of String(src).split("\n")) {
    if (RE_FENCE.test(line)) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (!inFence && RE_SUBHEADING.test(line)) continue;
    out.push(line);
  }
  return out;
}

// The first pipe table in `content`, or "" — fence-aware.
//
// Used for an epic's Stories Breakdown, where the wanted content is exactly the
// overview table and everything else in the section (authoring guidelines, then
// a `###` block per story) is detail belonging in the file.
function firstTableIn(content) {
  const lines = String(content || "").split("\n");
  const table = [];
  let inFence = false;
  for (const line of lines) {
    if (RE_FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (RE_TABLE_ROW_START.test(line)) table.push(line);
    else if (table.length) break; // table ended
  }
  return table.join("\n");
}

// Is this section body a list?
//
// Judged on the FIRST non-blank line rather than a ratio: a criteria section
// opening with a lead-in sentence ("The task is done when all of:") followed by
// bullets is prose whose bullets are its detail, and capping it as a list would
// silently drop the lead-in — the one line that gives the bullets meaning.
function isListSection(lines) {
  const first = lines.find((l) => l.trim());
  if (!first) return false;
  return RE_BULLET.test(first) || RE_ORDERED.test(first);
}

/**
 * Reduce one section body to what belongs on a card.
 *
 * Returns `{ text, omitted, kind }` — `omitted` counts the units NOT shown
 * (list items, or sentences), so the caller can render an honest "+N more"
 * pointer. Truncating without saying so would leave a reader believing they had
 * read the whole thing, which is worse than any amount of verbosity.
 */
function summariseSection(content, opts = {}) {
  const { maxItems = CARD_MAX_LIST_ITEMS, maxSentences = CARD_MAX_SENTENCES } =
    opts;
  const raw = String(content || "").trim();
  if (!raw) return { text: "", omitted: 0, kind: "empty" };

  // Grouping sub-headings go; the items under them stay. See dropHeadingLines.
  const lines = dropHeadingLines(raw);
  const src = lines.join("\n").trim();
  if (!src) return { text: "", omitted: 0, kind: "empty" };

  if (isListSection(lines)) {
    // Group each top-level item with its continuation lines so a wrapped or
    // nested bullet stays attached to the item it belongs to.
    const items = [];
    let inFence = false;
    for (const line of lines) {
      if (RE_FENCE.test(line)) inFence = !inFence;
      const isTop =
        !inFence &&
        (RE_BULLET.test(line) || RE_ORDERED.test(line)) &&
        !/^\s/.test(line);
      if (isTop) items.push([line]);
      else if (items.length) items[items.length - 1].push(line);
    }
    const kept = items.slice(0, maxItems);
    return {
      text: kept
        .map((g) => g.join("\n").trimEnd())
        .join("\n")
        .trim(),
      omitted: Math.max(0, items.length - kept.length),
      kind: "list",
    };
  }

  // Prose: the first PROSE paragraph, capped at `maxSentences`.
  const paras = src
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  // Skip leading tables and fenced blocks rather than giving up on the section.
  //
  // Returning nothing here meant a document whose Overview opens with a table —
  // a decision matrix, a before/after — published a card with NO summary at all,
  // and `summaryBlockNodes` drops an empty block, so the heading vanished too.
  // A silently summary-less card is the failure this whole change exists to
  // prevent, arrived at from the other direction. The prose is usually right
  // below; take it.
  const isProseBlock = (p) =>
    !RE_TABLE_ROW_START.test(p) && !RE_FENCE.test(p) && !isTableSepLine(p);
  const firstIdx = paras.findIndex(isProseBlock);
  if (firstIdx === -1) {
    // Genuinely nothing but tables and code. Say how much was skipped rather
    // than reporting a confident empty.
    return { text: "", omitted: paras.length, kind: "prose" };
  }
  const first = paras[firstIdx];

  const sentences = splitSentences(first.replace(/\n+/g, " ").trim());
  let kept = sentences.slice(0, maxSentences);
  // Anything before or after the chosen paragraph is omitted too, so the count
  // reflects sentences dropped from THIS paragraph plus every block skipped.
  let omitted = sentences.length - kept.length + (paras.length - 1);
  let text = kept.join(" ").trim();

  // A wall of text with no sentence terminators splits into ONE "sentence", so
  // the sentence cap never engages and the whole thing lands on the card. Cap
  // the characters as a backstop, cutting on a word boundary.
  if (text.length > CARD_MAX_CHARS) {
    const cut = text.slice(0, CARD_MAX_CHARS);
    const brk = cut.lastIndexOf(" ");
    text =
      (brk > CARD_MAX_CHARS * 0.6 ? cut.slice(0, brk) : cut).trimEnd() + "…";
    omitted = Math.max(omitted, 1);
  }
  return { text, omitted: Math.max(0, omitted), kind: "prose" };
}

/**
 * Render one summarised section as ADF nodes: a heading, the summarised body,
 * and — when anything was left out — a trailing pointer at the full document.
 *
 * Returns [] when the section resolved to nothing, so a caller can feed it an
 * absent or empty section without guarding at every call site.
 */
function summaryBlockNodes(opts = {}) {
  const {
    heading,
    content,
    sourceUrl = null,
    docLabel = "the full document",
    linkResolver = null,
    maxItems,
    maxSentences,
  } = opts;
  const { text, omitted } = summariseSection(content, {
    maxItems,
    maxSentences,
  });
  if (!text) return [];

  const nodes = [];
  if (heading) nodes.push(adf.heading(3, heading));
  nodes.push(...textToAdfNodes(text, linkResolver));

  if (omitted > 0) {
    const tail = sourceUrl
      ? [adf.text(`+${omitted} more in `), adf.link(docLabel, sourceUrl)]
      : [adf.text(`+${omitted} more in ${docLabel}`)];
    nodes.push(adf.paragraph(...tail));
  }
  return nodes;
}

// ---------------------------------------------------------------------------
// Card section specs — the ONE definition (task.102)
// ---------------------------------------------------------------------------
// These four lists say what a *document* must contain for its tracker card to be
// usable. They live here, beside `buildCardSections` and `checkCardSections`,
// because that is the only place all of their consumers can reach: the four
// `sync-jira-*` scripts re-export them, and the `create-*` authoring skills run
// the preflight against them without having a Jira sync skill installed at all.
//
// They were previously defined one apiece inside the four `sync-jira-*` scripts.
// Duplicating them into the authoring skills instead of moving them would have
// been the enumeration trap in docs/reference/anti-patterns.md: two definitions
// of "what sections a card needs" drift silently, with the authoring check
// passing a document the sync then publishes thin — the exact failure the
// authoring check exists to prevent, one layer earlier.
//
// Sibling files are named WITHOUT their `shared/resources/` prefix on purpose.
// The bundler's shared-reference matcher scans for that literal path anywhere in
// a file — comments included — and treats every hit as a dependency to copy. This
// module is bundled into twenty-odd skills, so one path written in a comment here
// pulls that file into all of them: restoring the prefix on the four lines below
// added ~16k lines of generated `references/` across 20 skills that do not use
// them. Refer to siblings by bare filename.
//
// The names keep the `*_CARD_SECTIONS` form and the module keeps its Jira name,
// but the requirement is TRACKER-AGNOSTIC: the corpus preflight in
// the corpus preflight in tests/jira-sync-card-summary.test.mjs applies them to
// every document in a repository that syncs to GitHub. Nothing here may be made
// to depend on a Jira client, a Jira credential, or a Jira-only skill being
// installed.

// What the CARD carries — a summary, not a copy. The task file is the source of
// truth and every card links to it; see tracker-card-summary.md.
//
// This list used to name ELEVEN sections — Overview, Motivation, Technical
// Background, Scope, Breaking Changes, Implementation Plan, Files Summary,
// Testing Strategy, Success Criteria, Risk Assessment, Rollback Plan — i.e. the
// whole task document, republished onto the card verbatim on every sync.
//
// `Breaking Changes` survives the cut because it is the one piece of detail a
// board reader must not have to open a file to discover. It is capped harder
// than the rest and omitted entirely when the section is absent, which is the
// common case.
const TASK_CARD_SECTIONS = [
  { heading: "Summary", names: ["Overview"] },
  { heading: "Success Criteria", names: ["Success Criteria"] },
  {
    heading: "Breaking Changes",
    names: ["Breaking Changes"],
    maxItems: 3,
    maxSentences: 2,
    optional: true,
  },
];

// What the CARD carries — a summary, not a copy. The story file is the source
// of truth and every card links to it; see tracker-card-summary.md.
//
// `names` is an ALIAS ARRAY — three spellings of the story statement are in
// active use and none is wrong. Measured across 426 story documents 2026-07-31:
// `## Story` 234, `## Story Statement` 161, `## User Story` 7. The list once
// named only `User Story`, so ~98% of stories published their acceptance
// criteria and nothing else, silently.
//
// `Description` is the LAST alias, not its own section: a story that has a story
// statement never shows it, and one that has only a Description still gets a
// non-empty card instead of a heading with nothing under it.
const STORY_CARD_SECTIONS = [
  {
    heading: "Summary",
    names: ["User Story", "Story", "Story Statement", "Description"],
  },
  { heading: "Acceptance Criteria", names: ["Acceptance Criteria"] },
];

// What the CARD carries — a summary, not a copy. The epic file is the source of
// truth and every card links to it; see tracker-card-summary.md.
//
// `Epic Description` is the LAST alias, not its own section: an epic with a goal
// never shows it, and one that has only a description still gets a non-empty card.
const EPIC_CARD_SECTIONS = [
  {
    heading: "Summary",
    names: ["Epic Goal", "Epic Description"],
    // Flatten any inline `**Label:**` heading (e.g. `**Existing System Context:**`)
    // to plain `Label:`. ADF can't render mid-paragraph bold headings well, so
    // this preserves the label as a leading text run that ADF renders cleanly.
    transform: (t) => t.replace(/\*\*([^*\n]+):\*\*/g, "$1:"),
  },
];

// What the CARD carries — a summary, not a copy. The bug file is the source of
// truth and every card links to it; see tracker-card-summary.md.
//
// `Impact` uses an alias array because the section's heading is MODE-DEPENDENT:
// create-bug-report emits `## Acceptance Criteria Violation` for a story bug,
// `## Success Criteria Violation` for a task bug and `## Scope & Impact` for a
// general one. One spec with three names handles all three, which is what keeps
// mode out of the card builder.
//
// `## Evidence` is deliberately absent. Screenshots, log dumps and stack traces
// are the largest section of a bug report and the fastest to go stale; the card
// is a pointer, and this is exactly the material the pointer exists to avoid
// copying.
const BUG_CARD_SECTIONS = [
  { heading: "Summary", names: ["Bug Description"], maxSentences: 4 },
  { heading: "Reproduction", names: ["Reproduction Steps"], maxItems: 5 },
  {
    heading: "Impact",
    names: [
      "Scope & Impact",
      "Scope and Impact",
      "Acceptance Criteria Violation",
      "Success Criteria Violation",
    ],
    maxItems: 5,
    maxSentences: 3,
    optional: true,
  },
];

// The four specs by document kind. `create-*` and any other authoring-time
// caller looks the spec up by kind rather than importing a name, so adding a
// document kind is one entry here rather than a new import at every call site.
const CARD_SECTIONS_BY_KIND = {
  task: TASK_CARD_SECTIONS,
  story: STORY_CARD_SECTIONS,
  epic: EPIC_CARD_SECTIONS,
  bug: BUG_CARD_SECTIONS,
};

/**
 * Build the card body for a set of section specs.
 *
 * `specs` entries: `{ heading, names, kind, maxItems, maxSentences }` where
 * `names` is passed straight to `extractBodySections` (so alias arrays and
 * `## 1.` numbering keep working). `heading` is a FIXED string rather than the
 * matched heading — a story whose statement lives under `## Story Statement`
 * and one using `## User Story` must produce the same card.
 *
 * `optional: true` suppresses the missing-section warning. `Breaking Changes`
 * is absent from most task documents and rightly so; warning about it every
 * sync would train operators to ignore the warning that matters — the one
 * saying the document and the section list disagree about a heading name.
 */
function buildCardSections(body, specs, opts = {}) {
  const {
    sourceUrl = null,
    docLabel,
    linkResolver = null,
    output = null,
  } = opts;
  // Warn only for required sections: extract those with `output`, the optional
  // ones silently.
  const required = specs.filter((s) => !s.optional);
  const optional = specs.filter((s) => s.optional);
  const found = [
    ...extractBodySections(
      body,
      required.map((s) => s.names),
      output,
    ),
    ...extractBodySections(
      body,
      optional.map((s) => s.names),
    ),
  ];
  // extractBodySections keys results by the FIRST alias; map back to the spec.
  const byFirstAlias = new Map(found.map((f) => [f.name, f.content]));

  const nodes = [];
  for (const spec of specs) {
    const alts = Array.isArray(spec.names) ? spec.names : [spec.names];
    const raw = byFirstAlias.get(alts[0]);
    if (!raw) continue;
    // `transform` lets a caller normalise a section before it is summarised —
    // epics use it to flatten inline `**Label:**` runs, which ADF renders badly
    // mid-paragraph.
    const content = spec.transform ? spec.transform(raw) : raw;
    if (!content) continue;
    nodes.push(
      ...summaryBlockNodes({
        heading: spec.heading,
        content,
        sourceUrl,
        docLabel,
        linkResolver,
        maxItems: spec.maxItems,
        maxSentences: spec.maxSentences,
      }),
    );
  }
  return nodes;
}

// ---------------------------------------------------------------------------
// Card preflight
// ---------------------------------------------------------------------------

/**
 * Check a document against its card spec WITHOUT syncing anything.
 *
 * The card is generated from a handful of named headings, so a document whose
 * headings do not match the spec publishes a thin or empty card — and the sync
 * still reports success. That is how 28 task cards shipped with empty bodies and
 * ~98% of stories published their acceptance criteria and nothing else: the
 * failure is silent by nature, because there is no error to raise. Summarising
 * narrowed the surface further (a task card reads 3 headings where it once read
 * 11), so a mismatch now has fewer places to hide.
 *
 * The fix always belongs in the DOCUMENT, which is why this is a preflight for
 * the review skills rather than a guard inside the sync: no amount of code can
 * invent a Summary that the file does not contain.
 *
 * Returns `{ ok, findings: [{severity, section, code, message, fix}], blocks }`.
 * `severity` is "critical" (the card loses a whole block) or "important" (the
 * block publishes, but degraded).
 */
function checkCardSections(body, specs, opts = {}) {
  const { docLabel = "the document" } = opts;
  const findings = [];
  const blocks = [];

  for (const spec of specs) {
    const alts = Array.isArray(spec.names) ? spec.names : [spec.names];
    const found = extractBodySections(body, [alts]);
    const raw = found.length ? found[0].content : null;

    if (!raw) {
      // An optional section that is simply absent is not a defect.
      if (spec.optional) {
        blocks.push({ heading: spec.heading, status: "absent-optional" });
        continue;
      }
      findings.push({
        severity: "critical",
        section: spec.heading,
        code: "missing",
        message: `No heading found for the "${spec.heading}" block — the card will publish nothing for it.`,
        fix: `Add one of these level-2 headings to ${docLabel}: ${alts.map((a) => `## ${a}`).join(", ")}. Numbering (## 3. Name) is accepted.`,
      });
      blocks.push({ heading: spec.heading, status: "missing" });
      continue;
    }

    const content = spec.transform ? spec.transform(raw) : raw;
    const { text, omitted, kind } = summariseSection(content, {
      maxItems: spec.maxItems,
      maxSentences: spec.maxSentences,
    });

    if (!text) {
      // Present but unusable — almost always a section that is nothing but a
      // table or a code block, which has no prose lead to summarise.
      findings.push({
        severity: spec.optional ? "important" : "critical",
        section: spec.heading,
        code: "empty",
        message: `The "${spec.heading}" section exists but yields no summary — it has no prose or list content the card can use.`,
        fix: `Give it a short opening sentence or a bullet list. Tables and code blocks alone cannot be summarised.`,
      });
      blocks.push({ heading: spec.heading, status: "empty" });
      continue;
    }

    blocks.push({
      heading: spec.heading,
      status: "ok",
      kind,
      chars: text.length,
      omitted,
    });
  }

  const published = blocks.filter((b) => b.status === "ok");
  if (!published.length) {
    findings.push({
      severity: "critical",
      section: "(whole card)",
      code: "no-body",
      message:
        "No section resolved — the card would publish an empty body. The document and the card's heading list disagree.",
      fix: `Check that ${docLabel}'s '## ' headings match the names above.`,
    });
  }

  return {
    ok: findings.length === 0,
    findings,
    blocks,
  };
}

// Render a checkCardSections result for a terminal.
function formatCardCheck(result, opts = {}) {
  const { title = "Card preflight" } = opts;
  const icon = { ok: "✅", missing: "🚨", empty: "🚨", "absent-optional": "·" };
  const lines = [`${title}`, ""];

  for (const b of result.blocks) {
    const mark = icon[b.status] || "•";
    if (b.status === "ok") {
      const more = b.omitted ? `, ${b.omitted} omitted → "+N more" link` : "";
      const detail = b.note != null ? b.note : `${b.chars} chars${more}`;
      lines.push(`  ${mark} ${b.heading.padEnd(20)} ${detail}`);
    } else if (b.status === "absent-optional") {
      lines.push(`  ${mark} ${b.heading.padEnd(20)} not present (optional)`);
    } else {
      lines.push(`  ${mark} ${b.heading.padEnd(20)} ${b.status.toUpperCase()}`);
    }
  }

  if (result.findings.length) {
    lines.push("");
    for (const f of result.findings) {
      lines.push(
        `  ${f.severity === "critical" ? "🚨" : "⚠️ "} ${f.section}: ${f.message}`,
      );
      lines.push(`     Fix: ${f.fix}`);
    }
  } else {
    lines.push("", "  No problems found.");
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Priority + labels
// ---------------------------------------------------------------------------
const PRIORITY_MAP = {
  highest: "Highest",
  critical: "Highest",
  blocker: "Highest",
  high: "High",
  medium: "Medium",
  normal: "Medium",
  low: "Low",
  minor: "Low",
  lowest: "Lowest",
  trivial: "Lowest",
};

function normalisePriority(raw, livePriorities = null, output = null) {
  if (!raw) return undefined;
  const lower = String(raw).toLowerCase();
  const warn = output ? output.warn : (...a) => console.warn(...a);
  const info = output ? output.info : (...a) => console.log(...a);

  if (livePriorities) {
    if (livePriorities[lower]) return livePriorities[lower];
    const synonym = PRIORITY_MAP[lower];
    if (synonym && livePriorities[synonym.toLowerCase()])
      return livePriorities[synonym.toLowerCase()];
  }

  const mapped = PRIORITY_MAP[lower];
  if (!mapped) {
    warn(`⚠️  Unknown priority "${raw}" — omitting priority field.`);
    return undefined;
  }
  if (mapped.toLowerCase() !== lower) {
    info(`ℹ️  Priority "${raw}" mapped to "${mapped}".`);
  }
  return mapped;
}

function sanitiseLabels(input) {
  if (!input) return undefined;
  const arr = Array.isArray(input) ? input : String(input).split(",");
  const cleaned = arr.map((l) => String(l).trim()).filter(Boolean);
  return cleaned.length ? cleaned : undefined;
}

// ---------------------------------------------------------------------------
// Auth + HTTP (with retry, fetch DI)
// ---------------------------------------------------------------------------
function getAuth({
  required = [
    "JIRA_URL",
    "JIRA_API_TOKEN",
    "JIRA_USER_EMAIL",
    "JIRA_PROJECT_KEY",
  ],
  optional = ["JIRA_BOARD_ID"],
  // Defaults to process.env, but accepts an injected source so a caller that
  // already resolved its environment can pass the same one through. Without
  // this, a CLI reading an injected `env` and then calling getAuth() gets two
  // different environments — which is exactly why tracker-comment.js's Jira
  // branch could not be driven through its own DI seam, and therefore had no
  // test coverage at all.
  source = process.env,
} = {}) {
  const env = {};
  for (const k of required) env[k] = source[k];
  for (const k of optional) env[k] = source[k];
  const missing = required.filter((k) => !env[k]);
  return {
    ok: missing.length === 0,
    missing,
    baseUrl: (env.JIRA_URL || "").replace(/\/$/, ""),
    token: env.JIRA_API_TOKEN || "",
    email: env.JIRA_USER_EMAIL || "",
    project: env.JIRA_PROJECT_KEY || "",
    boardId: env.JIRA_BOARD_ID || "",
  };
}

function authHeader(email, token) {
  return `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
}

// ---------------------------------------------------------------------------
// The access gate — layer 1 (task.53)
// ---------------------------------------------------------------------------
//
// Under any `access.tracker` mode other than `full`, a non-GET through this
// module is REFUSED and RECORDED rather than executed. It is a net, not a
// description: a mutation path nobody has annotated still cannot reach the
// network, it just renders generically. Layer 2 (the `defer:` annotation the
// semantic mutators pass) is what turns "PUT /rest/api/3/issue/PROJ-1 {…}" into
// "set Team to Platform".
//
// The one exception is a read wearing a POST — see READ_VIA_POST.

// Jira takes a JQL query in a request body, so `findExistingByLabel` searches
// with POST. Refusing it would make every sync skill see "no existing issue"
// and create a duplicate on the next run — the opposite of safe. Matched by
// URL, never by "it looked like a read".
const READ_VIA_POST = [/\/rest\/api\/3\/search(\/|\?|$)/];

function isReadViaPost(url) {
  const u = String(url || "");
  return READ_VIA_POST.some((re) => re.test(u));
}

/** The endpoint path, with the origin and any query string dropped. */
function endpointOf(url) {
  const u = String(url || "");
  const m = /^https?:\/\/[^/]+(\/[^?#]*)/.exec(u);
  return m ? m[1] : u.split("?")[0];
}

/**
 * What a refused mutation returns to its caller.
 *
 * `ok: true` and a 202 are deliberate. Callers throw on `!resp.ok`, and a
 * deferral is not a failure — the work was recorded for a human, not lost. The
 * `deferred` flag is how a caller that must return a different SHAPE (a create
 * has no issue key to give back) knows to branch; everything else carries on.
 */
function deferredResponse(record) {
  return {
    ok: true,
    status: 202,
    statusText: "Accepted (deferred)",
    deferred: true,
    deferredRecord: record ? record.id : null,
    headers: { get: () => null },
    async json() {
      return {};
    },
    async text() {
      return "";
    },
  };
}

/**
 * Record one refused mutation and hand back the synthetic response.
 *
 * `annotation` is layer 2: `{kind, intent, target, desired, …}` supplied by a
 * semantic mutator. Absent, the record is a `jira.unknown-mutation` — legible
 * enough to act on, loud enough to notice, and never executed.
 */
function recordRefusal({ url, method, access, system, annotation, ctx }) {
  const a = annotation || {};
  let rec = null;
  try {
    const input = {
      kind: a.kind || "jira.unknown-mutation",
      system: a.system || system,
      access,
      intent:
        a.intent ||
        `Perform ${method} ${endpointOf(url)} by hand — no semantic annotation, ` +
          `so what it would have changed is not known here`,
      target: a.target || { url: String(url), name: endpointOf(url) },
      desired:
        a.desired === undefined
          ? { method, endpoint: endpointOf(url) }
          : a.desired,
      skill: a.skill || ctx.skill,
      step: a.step === undefined ? ctx.step : a.step,
      run: a.run || ctx.run,
    };
    for (const k of [
      "consequence",
      "produces",
      "dependsOn",
      "manual",
      "command",
      "verify",
      "retry_of",
    ]) {
      if (a[k] !== undefined) input[k] = a[k];
    }
    rec = dm.defer(input, ctx.cwd ? { cwd: ctx.cwd } : {});
  } catch (e) {
    // Same contract as jira-stage.js: a journal we could not write is a
    // warning, never a licence to perform the mutation anyway.
    const warn =
      (ctx.output && ctx.output.warn) ||
      ((m) => process.stderr.write(`${m}\n`));
    warn(
      `⚠️  Could not record the deferred ${method} ${endpointOf(url)}: ${e.message}`,
    );
  }
  return deferredResponse(rec);
}

/**
 * Turn a Jira `fields` payload into something a human can act on.
 *
 * This is the whole reason layer 2 exists. `PUT /rest/api/3/issue/PROJ-1 {…}`
 * tells an operator nothing; `Team = Platform` tells them exactly what to type.
 * A value the shape cannot express in one line (an ADF description, say) is
 * NAMED rather than dumped — a checklist item nobody can read is as useless as
 * no checklist item, and the document already holds the prose.
 */
const EMPTY_VALUE = "(structured value — see the work-item document)";
// CYCLE-3 CR-7 — an empty collection in a Jira update is not an unrenderable
// value, it is an INSTRUCTION: clear the field. Pointing the operator at a
// document that holds nothing to copy describes the wrong thing entirely.
const CLEARED_VALUE = "(cleared)";

function summariseFields(fields) {
  const short = (v) => {
    const t = String(v);
    return t.length > 120 ? `${t.slice(0, 117)}…` : t;
  };
  const oneLine = (v) => {
    if (v === null || v === undefined) return null;
    if (typeof v !== "object") return short(v);
    if (Array.isArray(v)) {
      // CR-8 — drop empty members rather than stringifying them. A null in a
      // labels array used to render as a gap (", , x"), which reads as a value
      // the operator is expected to type.
      const parts = v
        .map((x) => oneLine(x))
        .filter((x) => x !== null && x !== "");
      // CYCLE-2 CR-4 — NOT null. describeDesired renders a null with
      // JSON.stringify, so an empty `components: []` printed
      // "components = null" in the operator's checklist — the same literal-null
      // rendering this function was just fixed to stop producing.
      return parts.length ? short(parts.join(", ")) : CLEARED_VALUE;
    }
    // CR-8 — `timetracking` is a field THESE scripts send, and it carries no
    // name/value/key/id, so it used to be discarded as "structured". The value
    // is exactly the kind a human could type, so name the shape explicitly.
    if (v.originalEstimate !== undefined || v.remainingEstimate !== undefined) {
      // CYCLE-4 CR-9 — first NON-EMPTY, not first non-null. `??` skips only
      // null/undefined, so `{originalEstimate: "", remainingEstimate: "3d"}`
      // rendered "(cleared)" — an affirmative instruction to clear a field that
      // carries an estimate.
      const est = [v.originalEstimate, v.remainingEstimate]
        .map((x) => (x === null || x === undefined ? "" : String(x).trim()))
        .find((x) => x !== "");
      return est === undefined ? CLEARED_VALUE : short(est);
    }
    const named = v.name ?? v.value ?? v.key ?? v.id;
    // CR-8 — `?? ` treats an explicit null as "present", so `{name: null}` used
    // to render as the literal string "null". An unusable value is not a value.
    return named === undefined || named === null ? EMPTY_VALUE : short(named);
  };
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = oneLine(v);
  return out;
}

// Permissiveness order, least to most — mirrors resolve-platform.sh's access_rank.
const ACCESS_ORDER = Object.freeze({
  manual: 0,
  command: 1,
  approve: 2,
  "read-only": 3,
  full: 4,
});

function makeHttp({
  fetchImpl = fetch,
  timeoutMs = 30000,
  retries = 2,
  retryDelayMs = 500,
  maxRetryAfterMs = 60000,
  // Additive, and defaulted so every existing call site is unaffected: with
  // ACCESS_TRACKER unset the resolver answers "full" and the branch below is
  // never taken.
  access = null,
  system = "jira",
  run = undefined,
  step = undefined,
  skill = "jira-sync",
  cwd = undefined,
  output = undefined,
} = {}) {
  const ctx = { run, step, skill, cwd, output };

  // Resolved lazily, and only when a write is actually attempted. An
  // unrecognised mode must refuse, but refusing at FACTORY time also killed
  // read-only callers that never write (`--probe-workflow`,
  // scaffold-tracker-workflow), which no requirement asks for.
  //
  // An injected `access` may RESTRICT but never escalate: it is reduced against
  // the environment most-restrictively, the same direction every other tier
  // moves. A caller passing "full" over `ACCESS_TRACKER=manual` would otherwise
  // be the one hole the resolver refuses everywhere else.
  let resolved = null;
  if (access) {
    // Same anchor as the lazy path below. Without it this clamp resolved against
    // process.cwd(), so an injected `full` survived a config-declared `manual`
    // whenever the process stood outside the repo root — falsifying the
    // may-restrict-never-escalate rule stated directly above (T61-M2).
    const fromEnv = mostRestrictiveAccess(ACCESS_ENV_AT_LOAD, cwd);
    resolved =
      dm.ACCESS_MODES.indexOf(access) < 0
        ? access // let the shared resolver produce the refusal message
        : ACCESS_ORDER[access] <= ACCESS_ORDER[fromEnv]
          ? access
          : fromEnv;
  }
  const accessFor = (method) => {
    if (method === "GET") return "full"; // a read is never gated
    if (!resolved) resolved = mostRestrictiveAccess(ACCESS_ENV_AT_LOAD, cwd);
    return resolved;
  };

  return async function http(url, opts = {}) {
    // `defer` is ours, not fetch's. Strip it so the request the transport sees
    // is byte-identical to the one it saw before this option existed.
    const { defer: annotation, ...fetchOpts } = opts;
    const method = String(fetchOpts.method || "GET").toUpperCase();

    // Layer 1 sits ABOVE the retry loop on purpose. Recording inside it would
    // write one record per attempt for one logical mutation, and a 429 would
    // then read as three separate things a human must go and do.
    if (
      method !== "GET" &&
      !isReadViaPost(url) &&
      accessFor(method) !== "full"
    ) {
      return recordRefusal({
        url,
        method,
        access: resolved,
        system,
        annotation,
        ctx,
      });
    }

    let attempt = 0;
    let lastErr;
    while (attempt <= retries) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const resp = await fetchImpl(url, {
          ...fetchOpts,
          signal: ctrl.signal,
        });
        clearTimeout(t);
        if (resp.status === 429 && attempt < retries) {
          const ra = parseRetryAfter(
            resp.headers && resp.headers.get && resp.headers.get("retry-after"),
          );
          const wait = Math.min(
            ra != null ? ra : retryDelayMs * Math.pow(3, attempt),
            maxRetryAfterMs,
          );
          await sleep(wait);
          attempt++;
          continue;
        }
        if (resp.status >= 500 && attempt < retries) {
          await sleep(retryDelayMs * Math.pow(3, attempt));
          attempt++;
          continue;
        }
        return resp;
      } catch (e) {
        clearTimeout(t);
        lastErr = e;
        if (attempt < retries) {
          await sleep(retryDelayMs * Math.pow(3, attempt));
          attempt++;
          continue;
        }
        throw e;
      }
    }
    throw lastErr || new Error("http: exhausted retries");
  };
}

function parseRetryAfter(value) {
  if (!value) return null;
  const secs = Number(value);
  if (Number.isFinite(secs) && secs >= 0) return secs * 1000;
  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) {
    const delta = dateMs - Date.now();
    return delta > 0 ? delta : 0;
  }
  return null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function parseJiraError(resp) {
  const text = await resp.text();
  try {
    const json = JSON.parse(text);
    const msgs = [];
    if (Array.isArray(json.errorMessages)) msgs.push(...json.errorMessages);
    if (json.errors && typeof json.errors === "object") {
      for (const [field, msg] of Object.entries(json.errors))
        msgs.push(`${field}: ${msg}`);
    }
    return msgs.length ? msgs.join("; ") : text;
  } catch (_) {
    return text;
  }
}

function describeAuthFail(status) {
  if (status === 401)
    return "401 Unauthorized — verify JIRA_USER_EMAIL and JIRA_API_TOKEN.";
  if (status === 403)
    return "403 Forbidden — token lacks permission for this issue/project.";
  if (status === 404)
    return "404 Not Found — issue key does not exist or you cannot view it.";
  return null;
}

// ---------------------------------------------------------------------------
// Diff + guard + hash
// ---------------------------------------------------------------------------
function diffFields({
  prev,
  next,
  prevBodyHash,
  newBodyHash,
  prevMetaHash,
  newMetaHash,
  prevDescHash,
  newDescHash,
}) {
  // Back-compat: prevDescHash/newDescHash collapse into body hash.
  const pBody = prevBodyHash !== undefined ? prevBodyHash : prevDescHash;
  const nBody = newBodyHash !== undefined ? newBodyHash : newDescHash;
  const changed = [];
  if (prev.summary !== next.summary) changed.push("summary");
  if ((pBody || "") !== (nBody || "")) changed.push("description");
  if (prevMetaHash !== undefined || newMetaHash !== undefined) {
    if (
      (prevMetaHash || "") !== (newMetaHash || "") &&
      !changed.includes("description")
    ) {
      changed.push("metadata");
    }
  }
  const pp = (prev.priority || "").toLowerCase();
  const np = (next.priority || "").toLowerCase();
  if (pp !== np) changed.push("priority");
  const pl = [...(prev.labels || [])].sort().join(",");
  const nl = [...(next.labels || [])].sort().join(",");
  if (pl !== nl) changed.push("labels");
  return changed;
}

/**
 * Diff the payload that is ACTUALLY being sent against what Jira holds.
 *
 * This exists because all four `sync-jira-*` scripts got the same thing wrong
 * in the same place: they rebuilt `labels` from frontmatter to feed the diff,
 * while the payload they sent had the `synced-from-*` idempotency label
 * appended by `collectIssueFields`. The two sets could never match, so `labels`
 * was reported changed on every run — a PUT every time on the scripts that gate
 * on the diff, and a permanently wrong change summary on the ones that do not.
 *
 * The rule this encodes is the one the duplication kept losing: **diff the
 * outgoing payload, never a separately-rebuilt field set.** Callers must
 * therefore build `fields` FIRST and pass it here, not reconstruct its inputs.
 *
 * Deliberately takes the already-built `fields` rather than building it. The
 * four builders genuinely differ — different parameter lists, and story derives
 * `includeDescription` from this function's own result — so a helper that also
 * built the payload would need discriminating parameters for each. Taking
 * `fields` is the cut that leaves no parameter behind.
 *
 * @param {object}      args
 * @param {object|null} args.current       what Jira holds. Null when creating,
 *   and also on a `--dry-run` update — every caller fetches `current` only
 *   under `if (!args.dryRun)`, so the dry-run update is the null state a reader
 *   is most likely to hit.
 * @param {object}      args.fields        the payload about to be sent
 * @param {object}      args.frontmatter   for the stored hashes
 * @param {string}      args.newBodyHash
 * @param {string}      args.newMetaHash
 * @returns {string[]}  changed field names
 */
/**
 * Normalise a value the payload treats as a list, for hashing.
 *
 * The payload maps `api`, `[api]` and `["web","api"]` onto the same
 * `components` array, so a hash that distinguishes them fires a spurious
 * `Updated: metadata` — and that PUT republishes the whole description — on a
 * cosmetic frontmatter reorder. `diffFields` already sorts labels for the same
 * reason.
 *
 * Elements are keyed with `String(x)` — the SAME coercion the payload builders
 * apply (`comps.map((name) => ({ name: String(name) }))`). Mirroring matters
 * more than cleverness here, and in one direction only: if the hash
 * distinguishes values the payload collapses, the cost is a spurious PUT; if it
 * collapses values the payload distinguishes, an edit is silently lost. An
 * earlier revision trimmed the key while the payload did not, which is exactly
 * the losing direction — a whitespace-only edit changed what was sent and left
 * the hash still. The rule is: key it the way the payload keys it.
 *
 * Lives here rather than in each script because four scripts sharing one
 * methodology is exactly what this task is about — a copy per script is the
 * drift it was written to stop.
 */
function normaliseListForHash(v) {
  if (v === undefined || v === null || v === "") return "";
  return JSON.stringify(
    (Array.isArray(v) ? v : [v]).filter(Boolean).map(String).sort(),
  );
}

function diffAgainstPayload({
  current,
  fields,
  frontmatter,
  newBodyHash,
  newMetaHash,
}) {
  if (!current) return ["summary", "description", "priority", "labels"];
  return diffFields({
    prev: current,
    next: {
      summary: fields.summary,
      priority: fields.priority ? fields.priority.name : null,
      labels: fields.labels,
    },
    prevBodyHash: frontmatter.jira_last_body_hash,
    newBodyHash,
    prevMetaHash: frontmatter.jira_last_meta_hash,
    newMetaHash,
  });
}

function guardConcurrentEdit({ jiraUpdated, lastSyncedAt, force, output }) {
  if (!lastSyncedAt || !jiraUpdated) return;
  if (new Date(jiraUpdated) <= new Date(lastSyncedAt)) return;
  if (force) {
    if (output)
      output.warn(
        `⚠️  Jira issue updated since last sync (Jira: ${jiraUpdated}, local: ${lastSyncedAt}). --force in effect; overwriting.`,
      );
    return;
  }
  throw new Error(
    `Jira issue updated since last local sync.\n` +
      `  Local last sync: ${lastSyncedAt}\n` +
      `  Jira updated:    ${jiraUpdated}\n` +
      `Pull manual edits into the markdown first, or pass --force to overwrite.`,
  );
}

function hashStable(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 16);
}

// ---------------------------------------------------------------------------
// Issue type cache
// ---------------------------------------------------------------------------
const ISSUE_TYPE_TTL_MS = 24 * 60 * 60 * 1000;

function issueTypeCachePath(repoRoot, projectKey) {
  return path.join(repoRoot, ".cache", `jira-issuetypes-${projectKey}.json`);
}

function readIssueTypeCache(repoRoot, projectKey) {
  const p = issueTypeCachePath(repoRoot, projectKey);
  if (!fs.existsSync(p)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(p, "utf-8"));
    if (!data.ts || Date.now() - data.ts > ISSUE_TYPE_TTL_MS) return null;
    return data.types || null;
  } catch (_) {
    return null;
  }
}

function writeIssueTypeCache(repoRoot, projectKey, types) {
  const p = issueTypeCachePath(repoRoot, projectKey);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ ts: Date.now(), types }, null, 2));
}

async function getIssueTypeId({
  http,
  baseUrl,
  email,
  token,
  projectKey,
  typeName,
  repoRoot,
}) {
  const cache = repoRoot ? readIssueTypeCache(repoRoot, projectKey) : null;
  const wanted = typeName.toLowerCase();
  if (cache && cache[wanted]) return cache[wanted];

  const tries = [
    `${baseUrl}/rest/api/3/issue/createmeta/${projectKey}/issuetypes`,
    `${baseUrl}/rest/api/3/issue/createmeta?projectKeys=${projectKey}&expand=projects.issuetypes`,
    `${baseUrl}/rest/api/3/issuetype`,
  ];
  let collected = {};
  for (const url of tries) {
    try {
      const resp = await http(url, {
        headers: {
          Authorization: authHeader(email, token),
          Accept: "application/json",
        },
      });
      if (!resp.ok) continue;
      const data = await resp.json();
      const toArr = (v) => (Array.isArray(v) ? v : null);
      const types =
        toArr(data.issueTypes) ||
        toArr(data.values) ||
        toArr(data.projects?.[0]?.issuetypes) ||
        toArr(data) ||
        [];
      for (const t of types) {
        if (t.name && t.id) collected[t.name.toLowerCase()] = t.id;
      }
      if (collected[wanted]) break;
    } catch (_) {}
  }
  if (collected[wanted]) {
    if (repoRoot) writeIssueTypeCache(repoRoot, projectKey, collected);
    return collected[wanted];
  }
  throw new Error(
    `Could not resolve Jira '${typeName}' issue type ID. Verify it is enabled for project ${projectKey}.`,
  );
}

// ---------------------------------------------------------------------------
// Issue links
// ---------------------------------------------------------------------------
// A bug card is a SIBLING of the work item it was found in, never a child of it.
// Jira has no way to make a Bug a child of a Story without switching it to a
// sub-task type, which differs per board and costs the bug its own backlog
// placement, sprint membership and independent transitions. So the relationship
// travels as an issue link, which every project type supports and which JQL and
// the board's link panel can both see.
//
// Link type names are per-board configuration, exactly like status names, so they
// are resolved by introspection against a candidate list rather than hardcoded.
// A board with none of them is a real outcome, reported as `no-link-type`, and
// the caller degrades to description links alone.
const LINK_TYPE_TTL_MS = 24 * 60 * 60 * 1000;

const LINK_TYPE_CANDIDATES = Object.freeze([
  "Relates",
  "Relates To",
  "Related",
  "Problem/Incident",
  "Blocks",
]);

function linkTypeCachePath(repoRoot) {
  return path.join(repoRoot, ".cache", "jira-linktypes.json");
}

function readLinkTypeCache(repoRoot) {
  const p = linkTypeCachePath(repoRoot);
  if (!fs.existsSync(p)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(p, "utf-8"));
    if (!data.ts || Date.now() - data.ts > LINK_TYPE_TTL_MS) return null;
    return data.types || null;
  } catch (_) {
    return null;
  }
}

function writeLinkTypeCache(repoRoot, types) {
  const p = linkTypeCachePath(repoRoot);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ ts: Date.now(), types }, null, 2));
}

/** Every link type the project offers: `[{id, name, inward, outward}]`. */
async function getIssueLinkTypes({ http, baseUrl, email, token, repoRoot }) {
  const cache = repoRoot ? readLinkTypeCache(repoRoot) : null;
  if (cache) return cache;
  try {
    const resp = await http(`${baseUrl}/rest/api/3/issueLinkType`, {
      headers: {
        Authorization: authHeader(email, token),
        Accept: "application/json",
      },
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    const types = (data.issueLinkTypes || []).map((t) => ({
      id: t.id,
      name: t.name,
      inward: t.inward,
      outward: t.outward,
    }));
    if (repoRoot && types.length) writeLinkTypeCache(repoRoot, types);
    return types;
  } catch (_) {
    return [];
  }
}

/**
 * Pick a usable link type. Pure, so it is unit-testable without a board —
 * the same split `resolveTransition` uses, and for the same reason.
 *
 * First candidate present wins; matching is case-insensitive on the type NAME,
 * not on its inward/outward phrases, because those vary independently
 * ("relates to" / "is related to") while the name is what the API accepts.
 */
function resolveLinkType(available, candidates = LINK_TYPE_CANDIDATES) {
  const list = Array.isArray(available) ? available : [];
  for (const want of candidates) {
    const hit = list.find(
      (t) => t.name && t.name.toLowerCase() === String(want).toLowerCase(),
    );
    if (hit) return { match: hit, rule: `name="${want}"` };
  }
  return { match: null, reason: "no-link-type" };
}

/**
 * Link two issues, idempotently.
 *
 * The existing-link check is not an optimisation — it is what makes a second
 * sync a no-op. Jira's issueLink endpoint happily creates a DUPLICATE link of
 * the same type between the same pair, so a sync that posted unconditionally
 * would add one more identical row to the card's link panel on every run.
 *
 * Returns one of:
 *   { linked: true,  type }                        — created
 *   { linked: false, reason: "already" }           — a link of this type exists
 *   { linked: false, reason: "no-link-type" }      — board offers none of them
 *   { linked: false, reason: "deferred", record }  — access.tracker refused it
 *   { linked: false, reason: "http-<status>" | <message> }
 *
 * Never throws: a bug card that exists but is unlinked is a degraded success,
 * not a failed sync.
 */
async function linkIssues({
  http,
  baseUrl,
  email,
  token,
  fromKey,
  toKey,
  repoRoot,
  candidates = LINK_TYPE_CANDIDATES,
  output,
  skill = undefined,
}) {
  if (!fromKey || !toKey) return { linked: false, reason: "no-target" };
  if (fromKey === toKey) return { linked: false, reason: "self" };

  const types = await getIssueLinkTypes({
    http,
    baseUrl,
    email,
    token,
    repoRoot,
  });
  const chosen = resolveLinkType(types, candidates);
  if (!chosen.match) {
    if (output)
      output.warn(
        `⚠️  No usable issue link type on this project (tried: ${candidates.join(", ")}) — the card keeps its description links only.`,
      );
    return { linked: false, reason: "no-link-type" };
  }
  const typeName = chosen.match.name;

  // Already linked? Read the FROM issue's own link list rather than searching:
  // one GET, and it is the authoritative view of what the panel will show.
  try {
    const resp = await http(
      `${baseUrl}/rest/api/3/issue/${fromKey}?fields=issuelinks`,
      {
        headers: {
          Authorization: authHeader(email, token),
          Accept: "application/json",
        },
      },
    );
    if (resp.ok) {
      const data = await resp.json();
      const links = data.fields?.issuelinks || [];
      const exists = links.some((l) => {
        const other = l.outwardIssue?.key || l.inwardIssue?.key;
        return (
          other === toKey &&
          l.type?.name &&
          l.type.name.toLowerCase() === typeName.toLowerCase()
        );
      });
      if (exists) {
        if (output)
          output.info(`   🔗 Already linked: ${fromKey} ${typeName} ${toKey}`);
        return { linked: false, reason: "already", type: typeName };
      }
    }
  } catch (_) {
    // An unreadable link list is not a reason to refuse the write — at worst
    // the POST below is a no-op that Jira itself rejects.
  }

  try {
    const resp = await http(`${baseUrl}/rest/api/3/issueLink`, {
      method: "POST",
      headers: {
        Authorization: authHeader(email, token),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        type: { name: typeName },
        inwardIssue: { key: fromKey },
        outwardIssue: { key: toKey },
      }),
      // Layer 2 — what the gate records if this run may not write.
      defer: {
        kind: "jira.issue.link",
        intent: `Link ${fromKey} to ${toKey} as "${typeName}"`,
        target: {
          issue: fromKey,
          url: `${baseUrl}/rest/api/3/issue/${fromKey}`,
          ui_url: `${baseUrl}/browse/${fromKey}`,
        },
        desired: { link: `${typeName} ${toKey}` },
        skill,
      },
    });
    if (resp.deferred) {
      if (output)
        output.info(
          `   ⏸️  Issue link deferred (${fromKey} → ${toKey}) — recorded as ${resp.deferredRecord}`,
        );
      return { linked: false, reason: "deferred", record: resp.deferredRecord };
    }
    if (resp.ok || resp.status === 201 || resp.status === 204) {
      if (output) output.info(`   🔗 Linked: ${fromKey} ${typeName} ${toKey}`);
      return { linked: true, type: typeName };
    }
    const msg = await parseJiraError(resp);
    if (output)
      output.warn(
        `⚠️  Issue link failed (non-fatal): HTTP ${resp.status}: ${msg}`,
      );
    return { linked: false, reason: `http-${resp.status}`, message: msg };
  } catch (e) {
    if (output) output.warn(`⚠️  Issue link failed (non-fatal): ${e.message}`);
    return { linked: false, reason: e.message };
  }
}

// ---------------------------------------------------------------------------
// Live priority resolution
// ---------------------------------------------------------------------------
async function resolveLivePriorities({ http, baseUrl, email, token }) {
  try {
    const resp = await http(`${baseUrl}/rest/api/3/priority`, {
      headers: {
        Authorization: authHeader(email, token),
        Accept: "application/json",
      },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const arr = Array.isArray(data) ? data : data.values || [];
    const map = {};
    for (const p of arr) {
      if (p.name) map[p.name.toLowerCase()] = p.name;
    }
    return Object.keys(map).length ? map : null;
  } catch (_) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Board type detection + backlog placement
// ---------------------------------------------------------------------------
async function getBoardType({ http, baseUrl, email, token, boardId }) {
  if (!boardId) return null;
  try {
    const resp = await http(
      `${baseUrl}/rest/agile/1.0/board/${boardId}/configuration`,
      {
        headers: {
          Authorization: authHeader(email, token),
          Accept: "application/json",
        },
      },
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    return (data.type || "").toLowerCase() || null;
  } catch (_) {
    return null;
  }
}

async function moveToBacklog({
  http,
  baseUrl,
  email,
  token,
  boardId,
  issueKey,
  output,
  // CR-7 — optional; when absent the record falls back to the makeHttp ctx,
  // which is the library name. Additive, so every existing call site is
  // unaffected.
  skill = undefined,
}) {
  if (!boardId) {
    if (output)
      output.warn("⚠️  Skipping backlog placement — JIRA_BOARD_ID not set.");
    return { moved: false, reason: "no-board-id" };
  }
  const type = await getBoardType({ http, baseUrl, email, token, boardId });
  if (type && type !== "scrum") {
    if (output)
      output.warn(
        `⚠️  Board ${boardId} is type "${type}" — backlog endpoint only applies to Scrum boards. Skipping.`,
      );
    return { moved: false, reason: `board-type-${type}` };
  }
  try {
    const resp = await http(`${baseUrl}/rest/agile/1.0/backlog/issue`, {
      method: "POST",
      headers: {
        Authorization: authHeader(email, token),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ issues: [issueKey] }),
      // Layer 2 — what the gate records if this run may not write.
      defer: {
        kind: "jira.backlog.add",
        intent: `Move ${issueKey} into the backlog of board ${boardId}`,
        target: {
          issue: issueKey,
          url: `${baseUrl}/rest/api/3/issue/${issueKey}`,
          ui_url: `${baseUrl}/browse/${issueKey}`,
        },
        desired: { backlog: `board ${boardId}` },
        // CR-7 — name the CALLING skill, not the library. The handover renderer
        // groups by skill, so falling back to "jira-sync" split one logical run
        // across two attributions.
        skill,
      },
    });
    // A refusal is not a move. Reporting "📋 Moved to backlog" here would be the
    // exact invisible drift this gate exists to remove.
    if (resp.deferred) {
      if (output)
        output.info(
          `   ⏸️  Backlog placement deferred (board ${boardId}) — recorded as ${resp.deferredRecord}`,
        );
      return { moved: false, reason: "deferred", record: resp.deferredRecord };
    }
    if (resp.ok || resp.status === 204) {
      if (output) output.info(`   📋 Moved to backlog (board ${boardId})`);
      return { moved: true };
    }
    const msg = await parseJiraError(resp);
    if (output)
      output.warn(
        `⚠️  Backlog move failed (non-fatal): HTTP ${resp.status}: ${msg}`,
      );
    return { moved: false, reason: `http-${resp.status}` };
  } catch (e) {
    if (output)
      output.warn(`⚠️  Backlog move failed (non-fatal): ${e.message}`);
    return { moved: false, reason: e.message };
  }
}

// ---------------------------------------------------------------------------
// Status mapping (local document status -> Jira workflow status name)
// ---------------------------------------------------------------------------
// Single source of truth shared by sync-jira-{story,task,epic}. Covers the full
// canonical lifecycle (see the document-status-lifecycle spec) plus the
// historical aliases. Keys are lowercased.
//
// Each local status maps to an ORDERED LIST of candidate Jira status names,
// tried in order against the issue's *available* transitions (target status
// name first, then transition name — see resolveTransition).
//
// Why a list and not one name: Jira workflows name the same lifecycle stage
// very differently — "To Do" / "Selected for Development" / "Backlog"; "In
// Review" / "Code Review" / "Waiting for Review". Matching a single hardcoded
// name meant any board that picked a different word silently skipped every
// status change, and the sync still reported success. The list makes the common
// vocabularies work with no configuration at all; `jira.statusMap` in
// skills-config.yaml still narrows, reorders, or replaces it (see
// loadStatusMap) for a board that needs something else.
//
// The FIRST entry of each list is the historical single value, so mapStatus()
// returns exactly what it always did for existing callers.
const NEW_CANDIDATES = Object.freeze([
  "To Do",
  "Backlog",
  "Open",
  "New",
  "Selected for Development",
]);
const IN_PROGRESS_CANDIDATES = Object.freeze([
  "In Progress",
  "Doing",
  "Started",
  "Development",
]);
const REVIEW_CANDIDATES = Object.freeze([
  "In Review",
  "Code Review",
  "Ready for Review",
  "Waiting for Review",
  "Peer Review",
  "Review",
]);
const DONE_CANDIDATES = Object.freeze([
  "Done",
  "Closed",
  "Resolved",
  "Complete",
  "Completed",
]);
const CANCELLED_CANDIDATES = Object.freeze([
  "Cancelled",
  "Canceled",
  "Won't Do",
  "Rejected",
  "Closed",
]);
const WONT_DO_CANDIDATES = Object.freeze([
  "Won't Do",
  "Wont Do",
  "Won't Fix",
  "Declined",
  "Rejected",
  "Cancelled",
]);
const BLOCKED_CANDIDATES = Object.freeze(["Blocked", "On Hold", "Impeded"]);
const READY_CANDIDATES = Object.freeze([
  "Ready",
  "Ready for Development",
  "Selected for Development",
]);
// The `ready-for-development` lifecycle stage. Boards split two ways on it:
// some fold it into the backlog column ("To Do"), others give it a dedicated
// column spelled exactly like the status. Binding the stage to NEW_CANDIDATES
// alone covered only the first kind, so a board whose column is named
// "Ready for Development" matched nothing and the transition was silently
// skipped — the most literal possible spelling of the status was the one
// spelling that did not work (bug.1).
//
// Derived from both lists rather than hand-written so a future edit to either
// propagates here, and deduped because NEW_CANDIDATES and READY_CANDIDATES
// share "Selected for Development".
//
// Order is the whole safety argument: the dedicated names are APPENDED, never
// prepended. Candidate matching is ordered and exact (see resolveTransition),
// so every board that resolves to "To Do"/"Backlog"/"Open"/"New" today keeps
// that exact destination, and only a board with none of them reaches the
// "Ready*" names. Prepending would silently relocate cards on boards that work
// correctly today — a second silent-transition bug in the process of fixing
// the first.
const READY_FOR_DEVELOPMENT_CANDIDATES = Object.freeze([
  ...new Set([...NEW_CANDIDATES, ...READY_CANDIDATES]),
]);
const QA_CANDIDATES = Object.freeze([
  "Testing",
  "Ready for Testing",
  "In Testing",
  "QA",
  "In QA",
]);
// Bug-lifecycle stages. The bug enum (new -> in-progress -> ready-for-qa ->
// closed | reopened) is deliberately distinct from the document lifecycle that
// stories, tasks and epics use, and four of its five words had no entry in
// DEFAULT_STATUS_MAP at all — so they fell through mapStatusCandidates' verbatim
// pass-through and were offered to the board as a single literal candidate.
//
// "Closed" leads CLOSED_CANDIDATES because that is what a bug workflow calls the
// terminal column; DONE_CANDIDATES follows for boards that do not have one.
const CLOSED_CANDIDATES = Object.freeze([
  ...new Set(["Closed", ...DONE_CANDIDATES]),
]);
// A reopened bug goes back to the TOP of the board, not into progress: reopening
// says the fix did not hold, not that anyone has picked it up again.
const REOPENED_CANDIDATES = Object.freeze([
  ...new Set(["Reopened", "Reopen", ...NEW_CANDIDATES]),
]);
const MERGE_CANDIDATES = Object.freeze([
  "Waiting for merge",
  "Ready to Merge",
  "Ready for Merge",
  "Awaiting Merge",
]);
// Deliberately EXCLUDES "In Progress". A board that sends a rejected review back
// to its development column is common, but naming it here would make the guard
// fight itself: `in-review` (rank 30) → "In Progress" (rank 20) is a backward
// move, so it would be blocked on every board that ranks both — and silently
// permitted on every board that ranks neither. A consumer whose board really
// does reuse "In Progress" for rework names it explicitly under `pipeline:`,
// where the intent is visible and `--allow-regress` is the documented escape.
const CHANGES_REQUESTED_CANDIDATES = Object.freeze([
  "Changes Requested",
  "Rework",
  "Needs Work",
  "Reopened",
]);
// "Ready for Showcase" is included on purpose: it is a real, reachable column on
// live boards that no moment has ever targeted, which is precisely the gap
// `pr-merged` exists to fill.
const PR_MERGED_CANDIDATES = Object.freeze([
  "Merged",
  "Ready for Release",
  "Awaiting Release",
  "Ready for Showcase",
]);

// ---------------------------------------------------------------------------
// Pipeline stages
// ---------------------------------------------------------------------------
// A *stage* is a point in the develop pipeline (branch cut, PR opened, QA
// entered, ...). A *document status* is a word in a story/task file. They are
// not the same vocabulary: the pipeline passes through board columns no
// document status names, and a document can sit in a status the pipeline never
// visits.
//
// Three stages deliberately ALIAS the status candidate lists above rather than
// re-declaring them. If `work-started` had its own copy, a project that tuned
// `jira.statusMap["in-progress"]` would leave /sync-jira-story and
// /develop-story firing different transitions for the same board position —
// exactly the drift this file exists to prevent.
//
// `defaultEnabled: false` on the five off-by-default stages is load-bearing.
// Consumers upgrade by `rm -rf`ing the skill directory and copying a new one; a
// stage that defaults on would start moving cards into columns that project has
// never used, with no one having asked for it. Opting in is one line in the
// workflow record.
//
// `rank` powers the monotonicity guard (see resolveStatusRank): a resumed
// pipeline re-running an earlier step must not drag a card backwards. `null`
// means unranked — `blocked` is exempt in both directions, since it is a
// side-state rather than a point on the ladder.
//
// KEY ORDER IS SEMANTIC. `STAGE_NAMES` is `Object.keys` of this map, and
// `describeAlternatives` reads "every stage after this one" straight off that
// order to explain a skip. The keys therefore run in pipeline order, not
// alphabetical and not rank order — `changes-requested` and `pr-merged` are
// unranked but still sit at the point in the run where they fire.
//
// `changes-requested` and `pr-merged` are unranked for the same reason `blocked`
// is: neither is a position on the forward ladder. `changes-requested` is a
// state a card RE-ENTERS, once per fix cycle, so ranking it would make the second
// entry a backward move the guard rejects. `pr-merged` fires after `done` on the
// boards that want it, but "after done" is not a rung the built-in ladder has —
// a consumer whose own `statuses:` lists a post-merge column ranks it there, and
// the ladder path resolves it by position without needing a default rank here.
const DEFAULT_STAGE_MAP = Object.freeze({
  "work-started": {
    candidates: IN_PROGRESS_CANDIDATES,
    rank: 20,
    defaultEnabled: true,
  },
  "in-review": {
    candidates: REVIEW_CANDIDATES,
    rank: 30,
    defaultEnabled: true,
  },
  "changes-requested": {
    candidates: CHANGES_REQUESTED_CANDIDATES,
    rank: null,
    defaultEnabled: false,
  },
  "in-qa": { candidates: QA_CANDIDATES, rank: 40, defaultEnabled: false },
  "ready-for-merge": {
    candidates: MERGE_CANDIDATES,
    rank: 50,
    defaultEnabled: false,
  },
  "pr-merged": {
    candidates: PR_MERGED_CANDIDATES,
    rank: null,
    defaultEnabled: false,
  },
  blocked: {
    candidates: BLOCKED_CANDIDATES,
    rank: null,
    defaultEnabled: false,
  },
  done: {
    candidates: DONE_CANDIDATES,
    rank: 60,
    defaultEnabled: true,
    terminal: true,
  },
});

const STAGE_NAMES = Object.freeze(Object.keys(DEFAULT_STAGE_MAP));

// Default status -> rank, derived from the candidate lists themselves so there
// is one place to change a stage's position. A status the board uses but no
// stage names (e.g. "READY FOR SHOWCASE") is unranked, and the guard lets it
// through rather than blocking on a status it has no opinion about.
const DEFAULT_STATUS_RANK = Object.freeze(
  (() => {
    const rank = {};
    for (const name of NEW_CANDIDATES) rank[name.toLowerCase()] = 10;
    for (const [, spec] of Object.entries(DEFAULT_STAGE_MAP)) {
      if (spec.rank == null) continue;
      for (const name of spec.candidates) {
        const k = name.toLowerCase();
        if (rank[k] == null || rank[k] < spec.rank) rank[k] = spec.rank;
      }
    }
    return rank;
  })(),
);

const DEFAULT_STATUS_MAP = {
  // canonical lifecycle
  draft: NEW_CANDIDATES,
  planned: NEW_CANDIDATES,
  "ready-for-development": READY_FOR_DEVELOPMENT_CANDIDATES,
  "in-progress": IN_PROGRESS_CANDIDATES,
  "ready-for-review": REVIEW_CANDIDATES,
  accepted: DONE_CANDIDATES,
  cancelled: CANCELLED_CANDIDATES,
  // aliases
  // Must stay bound to the same list as the canonical "ready-for-development"
  // key above — two spellings of one status resolving differently is a worse
  // failure than both being wrong, because it is inconsistent rather than
  // uniformly wrong.
  "ready for development": READY_FOR_DEVELOPMENT_CANDIDATES,
  todo: NEW_CANDIDATES,
  "to do": NEW_CANDIDATES,
  open: NEW_CANDIDATES,
  backlog: NEW_CANDIDATES,
  "in progress": IN_PROGRESS_CANDIDATES,
  doing: IN_PROGRESS_CANDIDATES,
  "ready for review": REVIEW_CANDIDATES,
  "in review": REVIEW_CANDIDATES,
  review: REVIEW_CANDIDATES,
  ready: READY_CANDIDATES,
  done: DONE_CANDIDATES,
  completed: DONE_CANDIDATES,
  complete: DONE_CANDIDATES,
  blocked: BLOCKED_CANDIDATES,
  canceled: CANCELLED_CANDIDATES,
  "won't do": WONT_DO_CANDIDATES,
  "wont do": WONT_DO_CANDIDATES,
  "won't fix": WONT_DO_CANDIDATES,
  wontfix: WONT_DO_CANDIDATES,
  // bug lifecycle — see docs/standards/bug-documents.md. `in-progress` is
  // already mapped above and is shared with the document lifecycle.
  new: NEW_CANDIDATES,
  "ready-for-qa": QA_CANDIDATES,
  "ready for qa": QA_CANDIDATES,
  closed: CLOSED_CANDIDATES,
  reopened: REOPENED_CANDIDATES,
};

// Local statuses meaning "this work is finished". Only these may fall back to
// statusCategory matching (resolveTransition rule 4) — see the comment there
// for why the fallback is unsafe for every other stage.
const TERMINAL_LOCAL_STATUSES = new Set([
  "accepted",
  // A bug's terminal word. Without it, a closing bug could not use
  // resolveTransition's statusCategory=done fallback on a board whose done
  // column is named something none of the candidate lists guess.
  "closed",
  "cancelled",
  "canceled",
  "done",
  "completed",
  "complete",
  "won't do",
  "wont do",
  "won't fix",
  "wontfix",
]);

// Terminal statuses meaning "finished WITHOUT being delivered" — these pick a
// negative resolution when the transition requires one.
const NEGATIVE_LOCAL_STATUSES = new Set([
  "cancelled",
  "canceled",
  "won't do",
  "wont do",
  "won't fix",
  "wontfix",
  "rejected",
]);

// Ordered preferences used to satisfy a required `resolution` field, filtered
// against that transition's own allowedValues. Never invented: if none match,
// the first value the workflow itself offers is used.
const POSITIVE_RESOLUTIONS = Object.freeze([
  "Done",
  "Resolved",
  "Fixed",
  "Complete",
  "Completed",
]);
const NEGATIVE_RESOLUTIONS = Object.freeze([
  "Won't Do",
  "Wont Do",
  "Cancelled",
  "Canceled",
  "Declined",
  "Rejected",
  "Won't Fix",
]);

// Strip a YAML-style inline trailing comment from a scalar value. A `#` starts
// a comment only at the start of the token or when preceded by whitespace, and
// never inside single/double quotes. Trailing whitespace is removed; any
// surrounding quotes are left for the caller to strip.
function stripInlineComment(s) {
  const str = String(s == null ? "" : s);
  let quote = null;
  for (let j = 0; j < str.length; j++) {
    const ch = str[j];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "#" && (j === 0 || /\s/.test(str[j - 1]))) {
      return str.slice(0, j).replace(/\s+$/, "");
    }
  }
  return str.replace(/\s+$/, "");
}

// Parse a `jira:` → `statusMap:` block out of skills-config.yaml text. Kept to
// a self-contained indentation scanner (no YAML dependency — pyyaml is not
// reliably installed in consumer environments). Supports the documented block
// form only; returns {} for anything it can't read.
//
//   jira:
//     statusMap:
//       ready-for-development: Selected for Development
//       accepted: "Done"
// Returns { base, byType } where `base` is the flat local-status -> candidates
// map and `byType` holds optional per-issue-type overrides. Values may be a
// single name or an ordered candidate list, in any of three forms:
//
//   jira:
//     statusMap:
//       ready-for-development: Selected for Development   # scalar
//       accepted: [Done, Closed]                          # flow sequence
//       ready-for-review:                                 # block sequence
//         - Waiting for Review
//         - In Review
//       epic:                                             # per-issue-type
//         accepted: Closed
//
// A nested key is read as an issue-type override when its children are
// `key: value` pairs, and as a candidate list when they are `- item` entries.
function unquote(s) {
  return String(s == null ? "" : s)
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
}

// `[A, B, "C, still C"]` -> ["A","B","C, still C"]; returns null if not a flow seq.
function parseFlowSequence(value) {
  const v = String(value || "").trim();
  if (!v.startsWith("[") || !v.endsWith("]")) return null;
  const inner = v.slice(1, -1);
  const items = [];
  let buf = "";
  let quote = null;
  for (const ch of inner) {
    if (quote) {
      if (ch === quote) quote = null;
      else buf += ch;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === ",") {
      items.push(buf);
      buf = "";
    } else buf += ch;
  }
  items.push(buf);
  return items.map((s) => unquote(s)).filter(Boolean);
}

function parseStatusMapBlock(text) {
  const base = {};
  const byType = {};
  const lines = String(text || "").split("\n");
  const indentOf = (l) => l.length - l.replace(/^\s+/, "").length;
  const isSkippable = (l) => !l.trim() || l.trim().startsWith("#");
  let i = 0;
  // find top-level `jira:`
  for (; i < lines.length; i++) {
    if (/^jira:\s*(#.*)?$/.test(lines[i])) {
      i++;
      break;
    }
  }
  if (i >= lines.length) return { base, byType };
  const jiraIndent = 0;
  // find `statusMap:` nested under jira
  let smIndent = -1;
  for (; i < lines.length; i++) {
    const raw = lines[i];
    if (isSkippable(raw)) continue;
    if (indentOf(raw) <= jiraIndent) return { base, byType }; // left the jira block
    if (/^\s+statusMap:\s*(#.*)?$/.test(raw)) {
      smIndent = indentOf(raw);
      i++;
      break;
    }
  }
  if (smIndent < 0) return { base, byType };

  // collect entries indented deeper than statusMap
  for (; i < lines.length; i++) {
    const raw = lines[i];
    if (isSkippable(raw)) continue;
    if (indentOf(raw) <= smIndent) break; // end of statusMap block
    const m = raw.trim().match(/^("?[^":]+"?|'[^']+'):\s*(.*?)\s*$/);
    if (!m) continue;
    const key = unquote(m[1]);
    if (!key) continue;
    const rawVal = stripInlineComment(m[2]).trim();

    if (rawVal) {
      const flow = parseFlowSequence(rawVal);
      const val = flow || unquote(rawVal);
      if (Array.isArray(val) ? val.length : val) base[key.toLowerCase()] = val;
      continue;
    }

    // Empty value: the entry continues on deeper-indented lines — either a
    // block sequence (candidate list) or a nested map (issue-type override).
    const entryIndent = indentOf(raw);
    const items = [];
    const nested = {};
    let j = i + 1;
    for (; j < lines.length; j++) {
      const child = lines[j];
      if (isSkippable(child)) continue;
      if (indentOf(child) <= entryIndent) break;
      const t = child.trim();
      if (t.startsWith("- ")) {
        const item = unquote(stripInlineComment(t.slice(2)));
        if (item) items.push(item);
        continue;
      }
      const cm = t.match(/^("?[^":]+"?|'[^']+'):\s*(.*?)\s*$/);
      if (!cm) continue;
      const ck = unquote(cm[1]);
      const cvRaw = stripInlineComment(cm[2]).trim();
      const cv = parseFlowSequence(cvRaw) || unquote(cvRaw);
      if (ck && (Array.isArray(cv) ? cv.length : cv))
        nested[ck.toLowerCase()] = cv;
    }
    i = j - 1;
    if (items.length) base[key.toLowerCase()] = items;
    else if (Object.keys(nested).length) byType[key.toLowerCase()] = nested;
  }
  return { base, byType };
}

// Build the effective status map: DEFAULT_STATUS_MAP overlaid with any
// `jira.statusMap` entries from skills-config.yaml at the repo root, then with
// that block's `<issueType>:` sub-map when `issueType` is given. Override keys
// are lowercased so lookups stay case-insensitive. Any failure (no file,
// unreadable, parse error) falls back to the defaults unchanged.
//
// The per-issue-type layer exists because a Jira project can run a different
// workflow per type — an Epic with only Open/Done alongside a Story with a full
// review-and-test lane — which one flat map cannot express.
function loadStatusMap(repoRoot, issueType) {
  const map = { ...DEFAULT_STATUS_MAP };
  const apply = (overrides) => {
    for (const [k, v] of Object.entries(overrides || {})) {
      if (typeof v === "string" && v.trim()) map[String(k).toLowerCase()] = v;
      else if (Array.isArray(v) && v.length)
        map[String(k).toLowerCase()] = v.slice();
    }
  };
  try {
    const root =
      repoRoot ||
      execSync("git rev-parse --show-toplevel", GIT_EXEC_OPTS).trim();
    const cfgPath = path.join(root, "skills-config.yaml");
    if (!fs.existsSync(cfgPath)) return map;
    const { base, byType } = parseStatusMapBlock(
      fs.readFileSync(cfgPath, "utf-8"),
    );
    apply(base);
    if (issueType) apply(byType[String(issueType).toLowerCase()]);
  } catch (_) {}
  return map;
}

// The unmerged view of `jira.statusMap`: exactly what the project wrote, with no
// defaults layered in. loadStatusMap() returns the merged map because that is
// what resolution needs; detection needs the opposite — a merged map is ~27 keys
// whose alias entries are still the default arrays, which makes any
// "is every entry narrowed?" question unanswerable. Same swallow-everything
// discipline: any failure returns {}.
function loadStatusMapOverrides(repoRoot) {
  try {
    const root =
      repoRoot ||
      execSync("git rev-parse --show-toplevel", GIT_EXEC_OPTS).trim();
    const cfgPath = path.join(root, "skills-config.yaml");
    if (!fs.existsSync(cfgPath)) return {};
    return parseStatusMapBlock(fs.readFileSync(cfgPath, "utf-8")).base || {};
  } catch (_) {
    return {};
  }
}

// `setup-consumer.sh` used to generate one scalar per status, each equal to the
// FIRST entry of that status's default candidate list. That was correct when a
// map entry was one name; once overrides began REPLACING the list rather than
// seeding it, the same generated text became a silent narrowing to one name per
// status. Recognising the fingerprint is the only way an affected project finds
// out — nobody reads a changelog for a file a wizard wrote.
//
// MUST be fed the RAW override block (loadStatusMapOverrides), never
// loadStatusMap()'s merged output — against the merged map `wholeMap` can never
// be true, so the check would silently never fire.
//
// eqName is declared later in this file; that is fine, since this only runs from
// probeWorkflow, long after module evaluation.
function detectNarrowingStatusMap(statusMap) {
  const map = statusMap || {};
  const keys = Object.keys(map);
  if (!keys.length) return { keys: [], wholeMap: false };
  const hits = keys.filter((k) => {
    const v = map[k];
    if (Array.isArray(v) || typeof v !== "string") return false; // a list is deliberate
    const def = DEFAULT_STATUS_MAP[k.toLowerCase()];
    return !!def && eqName(def[0], v);
  });
  return { keys: hits, wholeMap: hits.length === keys.length };
}

// Advice text for a narrowed `jira.statusMap`, or "" when there is nothing to
// say. Shared by the probe and by the sync's status-skip summary so the two
// cannot drift.
//
// Two audiences, deliberately worded differently:
//
//   - `localStatus` given (a sync just skipped that status) — speak only if
//     THAT status is narrowed, and name the exact candidates the override threw
//     away. At the moment of failure this is the whole diagnosis, and it cannot
//     be noisy: it fires only when a status the caller actually used was both
//     narrowed and unmatched.
//   - no `localStatus` (the probe is listing everything) — report any narrowed
//     entry, but distinguish "every entry" (near-certainly a generated block)
//     from a partial one, which may well be deliberate. Phrase the partial case
//     as a question, never a verdict.
//
// The partial case matters most: a project that hand-fixed one status is the
// one closest to noticing the problem, and gating the warning on "every entry"
// would keep it silent for exactly them.
function narrowingStatusMapAdvice(overrides, { localStatus } = {}) {
  try {
    const { keys, wholeMap } = detectNarrowingStatusMap(overrides);
    if (!keys.length) return "";
    const DOC = `See "Jira status mapping" in docs/reference/configuration.md`;
    const discarded = (k) => (DEFAULT_STATUS_MAP[k] || []).slice(1);

    if (localStatus) {
      const k = stripStatusEmoji(localStatus).toLowerCase();
      if (!keys.includes(k)) return "";
      const alts = discarded(k);
      return (
        `\n💡 jira.statusMap pins "${k}" to the single name "${overrides[k]}". An override` +
        `\n   REPLACES the built-in candidate list rather than adding to it, so these names` +
        `\n   are no longer tried: ${alts.map((a) => `"${a}"`).join(", ")}.` +
        `\n   If your column is one of those, delete that entry — or make it a list.` +
        `\n   ${DOC}.`
      );
    }

    if (wholeMap) {
      return (
        `\n⚠️  Every jira.statusMap entry equals the first default candidate for its status.` +
        `\n   That is the signature of a config generated by an older setup-consumer.sh, back` +
        `\n   when an override seeded the candidate list rather than replacing it. It is now` +
        `\n   NARROWING your matching to one name per status. Consider deleting the block —` +
        `\n   ${DOC}.`
      );
    }

    return (
      `\n💡 ${keys.length} jira.statusMap ${keys.length === 1 ? "entry pins its status" : "entries pin their status"}` +
      ` to a single name that is\n   already the first built-in candidate: ${keys.join(", ")}.` +
      `\n   Since an override REPLACES the candidate list, ${keys.length === 1 ? "that entry narrows" : "those entries narrow"} matching without` +
      `\n   changing where anything lands. Deliberate? If not, deleting ${keys.length === 1 ? "it" : "them"} widens matching.` +
      `\n   ${DOC}.`
    );
  } catch (_) {
    return "";
  }
}

// Map a raw frontmatter status to the ORDERED candidate Jira status names to
// try. Strips emoji, lowercases, looks up in `statusMap`; unmapped values pass
// through verbatim (emoji-stripped) as a single candidate, so a custom status
// name written straight into frontmatter still works.
//
// A map entry may be a string (one candidate — the config form) or an array
// (the defaults). Both normalise to an array here, so callers have one shape.
function mapStatusCandidates(raw, statusMap = DEFAULT_STATUS_MAP) {
  if (!raw) return null;
  const stripped = stripStatusEmoji(raw);
  if (!stripped) return null;
  const hit = statusMap[stripped.toLowerCase()];
  if (hit == null) return [stripped];
  const list = (Array.isArray(hit) ? hit : [hit])
    .map((s) => stripStatusEmoji(s))
    .filter(Boolean);
  return list.length ? list : [stripped];
}

// Back-compatible single-name view of the above: the primary (first) candidate.
// Retained because it is an exported part of the library surface; the sync
// scripts use mapStatusCandidates so they get the full list.
function mapStatus(raw, statusMap = DEFAULT_STATUS_MAP) {
  const list = mapStatusCandidates(raw, statusMap);
  return list ? list[0] : null;
}

// Is this local status one that means "finished"? Drives both the terminal-only
// statusCategory fallback and the choice of a positive/negative resolution.
function isTerminalLocalStatus(raw) {
  return TERMINAL_LOCAL_STATUSES.has(stripStatusEmoji(raw).toLowerCase());
}

function isNegativeLocalStatus(raw) {
  return NEGATIVE_LOCAL_STATUSES.has(stripStatusEmoji(raw).toLowerCase());
}

// ---------------------------------------------------------------------------
// Jira scalar config keys (e.g. custom-field ids under `jira:`)
// ---------------------------------------------------------------------------
// Read a single scalar `<key>: <value>` declared directly under the top-level
// `jira:` block in skills-config.yaml. Same self-contained indentation scanner
// philosophy as parseStatusMapBlock (no YAML dependency). Matching the literal
// key name means deeper nested entries (e.g. statusMap children) never collide.
// Returns "" when the key is absent.
//
//   jira:
//     devEstimateField: customfield_10594
// Generalised form of parseJiraScalar: read `<block>.<key>` from a
// skills-config.yaml body. Same self-contained indentation scan, parameterised
// on the top-level block name so `developNext:` can be read the same way as
// `jira:` without a second parser.
function parseTopLevelScalar(text, block, key) {
  const lines = String(text || "").split("\n");
  const indentOf = (l) => l.length - l.replace(/^\s+/, "").length;
  const keyRe = new RegExp("^" + escapeRe(key) + ":\\s*(.+?)\\s*$");
  const blockRe = new RegExp("^" + escapeRe(block) + ":\\s*(#.*)?$");
  let i = 0;
  // find the top-level block
  for (; i < lines.length; i++) {
    if (blockRe.test(lines[i])) {
      i++;
      break;
    }
  }
  if (i >= lines.length) return "";
  // scan entries inside the block. Only consider DIRECT children (the indent of
  // the first child), so deeper nested keys — e.g. a statusMap entry that
  // happens to share the name — never match.
  let childIndent = -1;
  for (; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    const ind = indentOf(raw);
    if (ind <= 0) break; // left the block
    if (childIndent < 0) childIndent = ind; // first child fixes the direct-child level
    if (ind !== childIndent) continue; // skip deeper nested entries
    const m = raw.trim().match(keyRe);
    if (m)
      return stripInlineComment(m[1])
        .replace(/^["']|["']$/g, "")
        .trim();
  }
  return "";
}

// Back-compat wrapper — `jira.<key>`, the original and by far the commonest use.
function parseJiraScalar(text, key) {
  return parseTopLevelScalar(text, "jira", key);
}

// Resolve the branch a repository's DOCUMENTS durably live on.
//
// Order: JIRA_DOC_BRANCH env → jira.docBranch → developNext.baseBranch.
//
// developNext.baseBranch is read as a fallback on purpose: a Gitflow consumer
// that already declares `developNext.baseBranch: develop` has said where its
// work lands, and making it repeat itself under a second key invents a way for
// the two to disagree. Returns "" when nothing is set anywhere, which callers
// read as "fall through to git" — so repos that were never affected by this are
// completely unaffected by the change.
function loadDocBranchSetting(repoRoot) {
  const fromEnv = process.env.JIRA_DOC_BRANCH;
  if (fromEnv && String(fromEnv).trim()) return String(fromEnv).trim();
  try {
    const root =
      repoRoot ||
      execSync("git rev-parse --show-toplevel", GIT_EXEC_OPTS).trim();
    const cfgPath = path.join(root, "skills-config.yaml");
    if (!fs.existsSync(cfgPath)) return "";
    const text = fs.readFileSync(cfgPath, "utf-8");
    return (
      parseTopLevelScalar(text, "jira", "docBranch") ||
      parseTopLevelScalar(text, "developNext", "baseBranch")
    );
  } catch (_) {
    return "";
  }
}

// Resolve the configured Jira custom-field id for estimated dev hours from
// `jira.devEstimateField` in skills-config.yaml at the repo root. Returns "" on
// any failure (no file, unreadable, key absent) so callers skip the field.
function loadDevEstimateField(repoRoot) {
  try {
    const root =
      repoRoot ||
      execSync("git rev-parse --show-toplevel", GIT_EXEC_OPTS).trim();
    const cfgPath = path.join(root, "skills-config.yaml");
    if (!fs.existsSync(cfgPath)) return "";
    return parseJiraScalar(
      fs.readFileSync(cfgPath, "utf-8"),
      "devEstimateField",
    );
  } catch (_) {
    return "";
  }
}

// Resolve a `jira.<key>` scalar from skills-config.yaml, with an environment
// override that wins. Returns "" when unset anywhere, which every caller reads
// as "use the built-in preference order".
function loadJiraScalarSetting(repoRoot, key, envVar) {
  const fromEnv = envVar && process.env[envVar];
  if (fromEnv && String(fromEnv).trim()) return String(fromEnv).trim();
  try {
    const root =
      repoRoot ||
      execSync("git rev-parse --show-toplevel", GIT_EXEC_OPTS).trim();
    const cfgPath = path.join(root, "skills-config.yaml");
    if (!fs.existsSync(cfgPath)) return "";
    return parseJiraScalar(fs.readFileSync(cfgPath, "utf-8"), key);
  } catch (_) {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Workflow record (machine-readable board description)
// ---------------------------------------------------------------------------
// A project can describe its board once, in JSON, instead of every consumer
// re-deriving it. The path comes from `jira.workflowRecord` in
// skills-config.yaml; DEFAULT_WORKFLOW_RECORD_PATH is the convention so most
// projects set nothing.
//
// JSON, not YAML: the record nests three levels deep
// (byIssueType.<type>.<stage>.candidates) where parseStatusMapBlock handles
// one, and — more decisively — the record is meant to be GENERATED by
// `--probe-workflow --write` and `--check`ed in CI. JSON round-trips with zero
// dependencies; YAML would need a writer as well as a reader.
//
// Every failure returns {} — a project with no record must behave exactly as
// it did before this existed. Same swallow-everything discipline as
// loadStatusMap.
const DEFAULT_WORKFLOW_RECORD_PATH = "docs/development/jira-workflow.json";

function loadWorkflowRecord(repoRoot) {
  try {
    const root =
      repoRoot ||
      execSync("git rev-parse --show-toplevel", GIT_EXEC_OPTS).trim();
    const rel =
      loadJiraScalarSetting(root, "workflowRecord", "JIRA_WORKFLOW_RECORD") ||
      DEFAULT_WORKFLOW_RECORD_PATH;
    const p = path.isAbsolute(rel) ? rel : path.join(root, rel);
    if (!fs.existsSync(p)) return {};
    const parsed = JSON.parse(fs.readFileSync(p, "utf-8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
}

// Opt-in duration logged ONLY to satisfy a workflow validator that demands
// time spent (see transitionToStatus). Never invented: absent this setting the
// transition fails the way it always did.
function loadWorklogTimeSpent(repoRoot) {
  return loadJiraScalarSetting(
    repoRoot,
    "worklogTimeSpent",
    "JIRA_WORKLOG_TIME_SPENT",
  );
}

// Resolve one pipeline stage against the record, most specific layer winning:
//   record.byIssueType[<live Jira issue type>] > record.stages > DEFAULT_STAGE_MAP
//
// Keyed on the LIVE Jira issue type name ("IT / DevOps Task"), not the docKind
// ("task") that loadStatusMap uses. One board routinely gives several task
// types genuinely different workflows — RAPP has six across three — and a
// story|task|epic layer cannot express that.
function resolveStage({ stage, issueType, record } = {}) {
  const key = String(stage || "")
    .trim()
    .toLowerCase();
  const base = DEFAULT_STAGE_MAP[key];
  if (!base) return { known: false, stage: key };

  const rec = record || {};
  const layers = [rec.stages && rec.stages[key]];
  if (issueType) {
    const byType = rec.byIssueType || {};
    const hit =
      byType[issueType] ||
      byType[
        Object.keys(byType).find(
          (k) => k.toLowerCase() === String(issueType).toLowerCase(),
        )
      ];
    if (hit) layers.push(hit[key]);
  }

  let enabled = base.defaultEnabled;
  let candidates = base.candidates.slice();
  let rank = base.rank;
  let reason = "";
  for (const layer of layers) {
    if (!layer || typeof layer !== "object") continue;
    if (typeof layer.enabled === "boolean") enabled = layer.enabled;
    if (Array.isArray(layer.candidates) && layer.candidates.length)
      candidates = layer.candidates.slice();
    if (layer.rank !== undefined) rank = layer.rank;
    if (layer.reason) reason = String(layer.reason);
  }

  return {
    known: true,
    stage: key,
    enabled,
    candidates,
    rank,
    reason,
    terminal: !!base.terminal,
  };
}

// Is this pipeline moment one whose target is, by definition, the end of the
// work? Today `done` and only `done` (DEFAULT_STAGE_MAP above).
//
// Terminality is TWO independent conditions and this is only the first. The
// second is positional — the resolved target must also be the ladder's last rung
// (`resolveMoment(...).isLastRung`). A project that points `done` at a bespoke
// gate column has a `done` moment that is terminal in NAME but not in POSITION,
// and the done-category fallback must stay shut for it. Both, or neither.
function isTerminalMoment(moment) {
  const spec =
    DEFAULT_STAGE_MAP[
      String(moment || "")
        .trim()
        .toLowerCase()
    ];
  return !!(spec && spec.terminal);
}

// Rank a status name for the monotonicity guard. Unknown -> null, which the
// guard reads as "no opinion, allow".
//
// TWO RANK SCALES, NEVER MIXED. `workflow` selects which one is in play:
//
//   ladder mode (`workflow` supplied) — the rank is the rung INDEX (0, 1, 2 …).
//     The ladder is the only source that knows a project's bespoke columns.
//     DEFAULT_STATUS_RANK is derived from the default candidate lists, so a
//     column no stage names — its own comment picks "READY FOR SHOWCASE" as the
//     example — is unranked there and the guard waves a card straight back out
//     of it. Declaring a rung now ranks it, which is what makes a gate column
//     defensible against a resumed run.
//
//   legacy mode (no `workflow`) — the record's statusRank, then the ranks
//     implied by the default candidate lists (10, 20, … 60). Byte-identical to
//     the behaviour before ladders existed.
//
// In ladder mode the ladder is the SOLE authority and off-ladder returns null,
// rather than falling through to the legacy chain. That fall-through is a trap:
// the caller's `minRank` in ladder mode is a rung index (0..6), so a status that
// missed the ladder but happens to sit in DEFAULT_STATUS_RANK would be compared
// at the wrong magnitude — "In Review" (30) against a target rung of 2 reads as
// a regress, and the guard would refuse a perfectly ordinary forward move. Any
// board whose ladder omits a column the defaults happen to name would stop
// moving entirely.
//
// Returning null instead is also the semantically right answer, not merely the
// safe one: it is exactly what `rankOf` documents ("null means no opinion") and
// what DEFAULT_STAGE_MAP already says about `blocked` — a status off the ladder
// is a side-state, and a side-state is exempt in both directions.
//
// This guard is shared by document, epic, story and task sync. None of them pass
// `workflow`, so all of them stay in legacy mode and their existing tests passing
// unchanged is the regression signal.
function resolveStatusRank(statusName, record, workflow, issueType) {
  const name = stripStatusEmoji(statusName).toLowerCase();
  if (!name) return null;
  if (workflow) return tw.rankOf(statusName, workflow, { issueType });
  const fromRecord = (record || {}).statusRank;
  if (fromRecord && typeof fromRecord === "object") {
    for (const [k, v] of Object.entries(fromRecord)) {
      if (k.toLowerCase() === name) return v == null ? null : Number(v);
    }
  }
  const d = DEFAULT_STATUS_RANK[name];
  return d == null ? null : d;
}

// Resolution names used when a workflow's done/cancelled transition requires a
// `resolution` field. Optional: left unset, buildTransitionFields falls back to
// POSITIVE_RESOLUTIONS / NEGATIVE_RESOLUTIONS and then to whatever the
// transition's own allowedValues offer first.
function loadDoneResolution(repoRoot) {
  return loadJiraScalarSetting(
    repoRoot,
    "doneResolution",
    "JIRA_DONE_RESOLUTION",
  );
}

function loadCancelledResolution(repoRoot) {
  return loadJiraScalarSetting(
    repoRoot,
    "cancelledResolution",
    "JIRA_CANCELLED_RESOLUTION",
  );
}

// Frontmatter placeholders that must never reach the Jira API. `assignee: TBD`
// shipped in the task template for a long time, and the sync passed it through
// as an accountId — so every card created the intended way and then synced got
// a bare `HTTP 400` with nothing naming the cause.
const ASSIGNEE_PLACEHOLDERS = new Set([
  "tbd",
  "tba",
  "none",
  "unassigned",
  "unset",
  "todo",
  "n/a",
  "na",
  "-",
  "?",
]);

function isAssigneePlaceholder(value) {
  return ASSIGNEE_PLACEHOLDERS.has(
    String(value || "")
      .trim()
      .toLowerCase(),
  );
}

// Resolve the default Jira assignee accountId from `jira.defaultAssignee` in
// skills-config.yaml at the repo root. Returns "" on any failure (no file,
// unreadable, key absent) so callers leave the assignee untouched.
//
// Kept in config rather than in the template because an accountId is specific
// to one Jira site and one person — hardcoding one into a shared skill would
// make the template wrong for every other consumer.
function loadDefaultAssignee(repoRoot) {
  try {
    const root =
      repoRoot ||
      execSync("git rev-parse --show-toplevel", GIT_EXEC_OPTS).trim();
    const cfgPath = path.join(root, "skills-config.yaml");
    if (!fs.existsSync(cfgPath)) return "";
    return parseJiraScalar(
      fs.readFileSync(cfgPath, "utf-8"),
      "defaultAssignee",
    );
  } catch (_) {
    return "";
  }
}

// Decide the accountId to send, if any. Frontmatter wins over the configured
// default; a placeholder in either is dropped with a warning rather than sent.
//
// Returns "" to mean "send nothing" — which leaves any existing Jira assignee
// alone on an update, rather than clearing it.
function resolveAssignee(frontmatterValue, defaultAssignee, output = null) {
  const warn = (output && output.warn) || (() => {});

  if (frontmatterValue) {
    if (!isAssigneePlaceholder(frontmatterValue))
      return String(frontmatterValue);
    warn(
      `Ignoring placeholder assignee "${frontmatterValue}" — Jira needs an accountId, ` +
        `and sending this verbatim returns HTTP 400.\n` +
        `    Replace it with an accountId, delete the line, or set jira.defaultAssignee in skills-config.yaml.`,
    );
  }

  if (defaultAssignee && !isAssigneePlaceholder(defaultAssignee)) {
    return String(defaultAssignee);
  }
  return "";
}

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------
function stripStatusEmoji(s) {
  return String(s || "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .trim();
}

// `expand=transitions.fields` makes Jira declare, per transition, which fields
// the workflow's transition screen requires and what values it will accept.
// Without it a transition that requires e.g. a resolution returns HTTP 400 with
// no way to know what was missing. See buildTransitionFields.
async function getTransitions({ http, baseUrl, email, token, issueKey }) {
  const resp = await http(
    `${baseUrl}/rest/api/3/issue/${issueKey}/transitions?expand=transitions.fields`,
    {
      headers: {
        Authorization: authHeader(email, token),
        Accept: "application/json",
      },
    },
  );
  if (!resp.ok) return [];
  const data = await resp.json();
  return data.transitions || [];
}

const eqName = (a, b) =>
  String(a || "").toLowerCase() === String(b || "").toLowerCase();

// Pick the transition to fire, given the ordered candidate names for a local
// status and the transitions Jira says are actually available right now.
//
// Pure (no I/O) so the rules can be unit-tested against captured API payloads.
// Returns { match, rule } on success, or { match: null, reason } otherwise.
//
// Order matters, and each step is exact — never fuzzy:
//   1. already satisfied — the issue already sits in one of the candidates
//   2. target status name (`to.name`), candidates in order
//   3. transition name (`name`), candidates in order
//   4. terminal statuses ONLY: the single transition into statusCategory "done"
//
// Step 3 exists because workflows routinely name the *action* rather than the
// destination — "Implemented" leading to "Waiting for Review". Step 2 is
// exhausted across all candidates first so a board offering both an exact
// destination match and an unrelated action name picks the destination.
//
// Step 4 is deliberately restricted to terminal statuses. Falling back to
// statusCategory for "new"/"indeterminate" was tried and rejected: on a real
// board it silently picked WRONG transitions — `ready-for-review` resolved to
// "In Progress", and `in-progress` resolved to "Waiting for Review" — because
// those categories routinely hold several unrelated states. A skipped status
// change is recoverable; a confident wrong transition is not.
function resolveTransition({
  transitions,
  candidates,
  currentStatus,
  terminal = false,
}) {
  const list = (candidates || []).map(stripStatusEmoji).filter(Boolean);
  const current = stripStatusEmoji(currentStatus);
  const avail = transitions || [];
  if (!list.length) return { match: null, reason: "no-target" };

  if (list.some((c) => eqName(c, current)))
    return { match: null, reason: "already" };

  for (const c of list) {
    const m = avail.find((t) => eqName(t.to && t.to.name, c));
    if (m) return { match: m, rule: `to.name="${c}"` };
  }
  for (const c of list) {
    const m = avail.find((t) => eqName(t.name, c));
    if (m) return { match: m, rule: `name="${c}"` };
  }

  if (terminal) {
    const done = avail.filter(
      (t) => t.to && t.to.statusCategory && t.to.statusCategory.key === "done",
    );
    if (done.length === 1)
      return { match: done[0], rule: "statusCategory=done (unambiguous)" };
    if (done.length > 1) return { match: null, reason: "ambiguous-terminal" };
  }

  return { match: null, reason: "no-transition" };
}

// Satisfy whatever fields the matched transition declares as required, using
// only values that transition itself offers in `allowedValues`.
//
// Generic on purpose: nothing here knows any particular board's vocabulary, it
// reads the schema the workflow publishes. `resolution` is the one field with
// enough shared meaning to fill safely — everything else is reported as
// unfillable so the caller can skip rather than fire a request certain to 400.
function buildTransitionFields(
  match,
  { negative = false, resolutionPref = "" } = {},
) {
  const required = Object.entries((match && match.fields) || {}).filter(
    ([, spec]) => spec && spec.required,
  );
  const fields = {};
  const unfillable = [];

  for (const [key, spec] of required) {
    if (key !== "resolution") {
      unfillable.push(key);
      continue;
    }
    const allowed = (spec && spec.allowedValues) || [];
    const prefs = [
      resolutionPref,
      ...(negative ? NEGATIVE_RESOLUTIONS : POSITIVE_RESOLUTIONS),
    ].filter(Boolean);
    const pick =
      prefs.map((p) => allowed.find((v) => eqName(v.name, p))).find(Boolean) ||
      allowed[0];
    if (!pick) {
      unfillable.push(key);
      continue;
    }
    fields.resolution =
      pick.id != null ? { id: String(pick.id) } : { name: pick.name };
  }

  return {
    fields: Object.keys(fields).length ? fields : null,
    unfillable,
    requiredKeys: required.map(([k]) => k),
  };
}

// Build the `update` verb carrying a worklog for a transition.
//
// A worklog is NOT a field — `{"fields":{"worklog":...}}` is rejected outright
// ("Field does not support update 'worklog'"), which is why this cannot live in
// buildTransitionFields. The transitions API takes it as a sibling verb:
//   {"transition":{...},"update":{"worklog":[{"add":{"timeSpent":"1m"}}]}}
//
// No `comment` (API v3 wants ADF there, and a fabricated comment is worse than
// none) and no `started` (needs a numeric-offset timestamp some instances
// reject; Jira defaults it to now).
function buildTransitionUpdate({ worklogTimeSpent } = {}) {
  const t = String(worklogTimeSpent || "").trim();
  if (!t) return null;
  return { worklog: [{ add: { timeSpent: t } }] };
}

// A workflow VALIDATOR demanding time spent is invisible to
// `expand=transitions.fields` — it surfaces only as a 400 on the transition
// call. This matches that 400 so the caller can retry once with a worklog
// attached.
const WORKLOG_VALIDATOR_RE = /time spent|timespent|work ?log|log work/i;

// Move an issue to the status implied by its local document status.
//
// `targetStatus` accepts either a single name (legacy callers) or the ordered
// candidate list from mapStatusCandidates. `localStatus` is the raw frontmatter
// value, used only to decide whether this is a terminal status — which unlocks
// the statusCategory fallback and selects a positive vs negative resolution.
//
// Never throws and never fails the sync; returns a { transitioned, reason }
// record that callers surface in their summary (see the --fail-on-status-skip
// handling in the sync scripts).
async function transitionToStatus({
  skill = undefined, // names the CALLING skill on a deferred transition record
  http,
  baseUrl,
  email,
  token,
  issueKey,
  targetStatus,
  currentStatus,
  localStatus,
  doneResolution = "",
  cancelledResolution = "",
  worklogTimeSpent = "",
  configHint = "status",
  minRank = null,
  workflowRecord = null,
  allowRegress = false,
  output,
  // A transition list the caller has ALREADY fetched for this exact position.
  // Supplied only by walkLadder, which must GET once per hop anyway: without
  // this every hop would fetch twice, making an n-hop walk cost 1 + 3n calls
  // against the 1 + 2n the design targets. Absent (every other caller), the
  // fetch below happens exactly as it always did.
  transitions: transitionsIn = null,
  // Explicit terminality, overriding the value derived from `localStatus`.
  //
  // Needed because the two questions `localStatus` currently answers have come
  // apart. It picks the RESOLUTION (positive vs negative) and it unlocks the
  // done-category fallback (rule 4) — fine while "the moment is called done"
  // and "the target is the end of the ladder" were the same thing. Once a board
  // can point `done` at a gate column they are not, and rule 4 must stay shut
  // while resolution filling carries on unchanged. `null` = derive as before.
  terminal: terminalIn = null,
  // The ladder, when the caller is operating in ladder mode. Switches
  // resolveStatusRank to rung indices — see its comment on the two scales.
  workflow = null,
  issueType = "",
}) {
  const candidates = (
    Array.isArray(targetStatus) ? targetStatus : [targetStatus]
  )
    .map(stripStatusEmoji)
    .filter(Boolean);
  let current = stripStatusEmoji(currentStatus);
  if (!candidates.length) return { transitioned: false, reason: "no-target" };

  // On create there is no prior status to compare against, so callers pass none.
  // Without it the already-check cannot fire, and we go looking for a transition
  // into the status the issue is *already in* — which Jira never offers as a
  // self-transition, producing a spurious "no transition matched" warning on
  // every freshly created issue.
  if (!current) {
    try {
      const live = await fetchIssue({
        http,
        baseUrl,
        email,
        token,
        issueKey,
        fields: "status",
      });
      current = stripStatusEmoji(live && live.status);
    } catch (_) {
      /* fall through with an unknown current status */
    }
  }

  const localRaw = localStatus == null ? candidates[0] : localStatus;
  // Rule 4's gate. The explicit override wins when given; otherwise the local
  // status decides, exactly as before.
  const terminal =
    terminalIn == null ? isTerminalLocalStatus(localRaw) : !!terminalIn;
  // Resolution choice stays keyed on the LOCAL status, never on `terminal`.
  // These two must not be collapsed: a retargeted `done` arrives here with
  // terminal=false and localStatus="done", and still needs a positive
  // resolution if the transition it eventually fires demands one.
  const negative = isNegativeLocalStatus(localRaw);

  // Short-circuit before any network call when the issue already sits in one of
  // the candidate statuses — resolveTransition would reach the same verdict,
  // but only after a pointless round-trip.
  if (candidates.some((c) => eqName(c, current)))
    return {
      transitioned: false,
      reason: "already",
      to: current,
      from: current,
    };

  // Monotonicity guard. Boards routinely offer backward transitions — RAPP
  // offers "Waiting for merge -> In Progress" — so a resumed pipeline
  // re-running an earlier step would happily drag a card backwards. Refuse when
  // the caller declares the rank it is moving TO and the card already sits
  // higher. Unranked either side means no opinion: allow.
  if (!allowRegress && minRank != null) {
    const currentRank = resolveStatusRank(
      current,
      workflowRecord,
      workflow,
      issueType,
    );
    if (currentRank != null && currentRank > minRank) {
      if (output)
        output.info(
          `   ⏭️  ${issueKey} is already at "${current}" (rank ${currentRank}), past the requested rank ${minRank} — not moving it backwards.`,
        );
      return {
        transitioned: false,
        reason: "would-regress",
        from: current,
        currentRank,
        minRank,
      };
    }
  }

  const transitions =
    transitionsIn ||
    (await getTransitions({
      http,
      baseUrl,
      email,
      token,
      issueKey,
    }));
  const { match, rule, reason } = resolveTransition({
    transitions,
    candidates,
    currentStatus: current,
    terminal,
  });

  const describeAvailable = () => {
    const seen = transitions
      .map((t) => {
        const to = (t.to && t.to.name) || "";
        return to && !eqName(to, t.name) ? `${t.name} → ${to}` : t.name || to;
      })
      .filter(Boolean);
    return seen.length ? seen.join(", ") : "(none)";
  };

  if (!match) {
    if (reason === "already")
      return { transitioned: false, reason: "already", to: current };
    if (output) {
      const why =
        reason === "ambiguous-terminal"
          ? `Several transitions lead to a done status, so none was assumed`
          : `No transition matched`;
      output.warn(
        `⚠️  Jira status not changed for ${issueKey} (currently "${current}").`,
      );
      output.warn(`    ${why}. Tried, in order: ${candidates.join(", ")}.`);
      output.warn(`    Available from here: ${describeAvailable()}.`);
      // Which knob to point at depends on who is asking. A document-status
      // sync is configured by jira.statusMap; a pipeline stage is configured by
      // the workflow record. Naming the wrong one sends the reader to edit a
      // key that cannot affect what they just saw.
      output.warn(
        configHint === "stage"
          ? `    Name the status this board uses under stages.<stage>.candidates in the` +
              ` workflow record (jira.workflowRecord), or run --probe-workflow to see the` +
              ` board's full transition graph.`
          : `    Set jira.statusMap in skills-config.yaml to name the status this board uses,` +
              ` or run with --probe-workflow to see the board's full transition graph.`,
      );
    }
    return {
      transitioned: false,
      reason: reason || "no-transition",
      candidates,
      available: describeAvailable(),
      from: current,
    };
  }

  const { fields, unfillable, requiredKeys } = buildTransitionFields(match, {
    negative,
    resolutionPref: negative ? cancelledResolution : doneResolution,
  });

  // Refuse to send a request the workflow has already told us is incomplete.
  if (unfillable.length) {
    if (output) {
      output.warn(
        `⚠️  Jira status not changed for ${issueKey}: transition "${match.name}" requires` +
          ` field(s) this sync cannot fill: ${unfillable.join(", ")}.`,
      );
      output.warn(
        `    Move it by hand in Jira, or relax the transition screen's required fields.`,
      );
    }
    return {
      transitioned: false,
      reason: "required-fields",
      unfillable,
      from: current,
    };
  }

  const post = (update) => {
    const body = { transition: { id: match.id } };
    if (fields) body.fields = fields;
    if (update) body.update = update;
    return http(`${baseUrl}/rest/api/3/issue/${issueKey}/transitions`, {
      method: "POST",
      headers: {
        Authorization: authHeader(email, token),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      // The `jira.transition` annotation. The task's Decisions table originally
      // said not to annotate this chain, on the premise that `jira-stage.js`
      // owns the kind and `walkLadder` is its only caller — QA cycle 1 showed
      // `syncDocumentStatus` is a SECOND entry point with four call sites, none
      // of which the stage CLI gates. Unannotated they journalled as
      // `jira.unknown-mutation`: escalated to `irreversible`, attributed to the
      // library, and silent about which status to set.
      //
      // No double-record risk: the stage CLI's own gate returns before reaching
      // here, and the deferral short-circuit above this call is the single
      // record site for one logical hop.
      defer: {
        kind: "jira.transition",
        intent: `Transition ${issueKey} from "${current}" to "${match.name}"`,
        target: {
          issue: issueKey,
          url: `${baseUrl}/rest/api/3/issue/${issueKey}`,
          ui_url: `${baseUrl}/browse/${issueKey}`,
        },
        desired: { status: match.name },
        skill,
      },
    });
  };

  let resp = await post(null);

  // CR-1 — the access gate refused this transition. Everything below reads
  // `resp.ok`, and a deferral IS ok, so without this branch a refused POST
  // falls into the success path: it logs "🔀 Transitioned" and returns
  // `transitioned: true`. `syncDocumentStatus` has four call sites outside
  // jira-stage.js, and its outcome drives a "Status → X" Change Log row that is
  // written to disk — a document recording a status change Jira never made.
  if (resp.deferred) {
    if (output)
      output.info(
        `   ⏸️  Transition deferred for ${issueKey}: "${current}" → "${match.name}" — recorded as ${resp.deferredRecord}`,
      );
    return {
      transitioned: false,
      deferred: true,
      reason: "deferred",
      record: resp.deferredRecord,
      from: current,
      to: null,
      via: match.name,
      rule,
    };
  }

  let loggedWork = false;

  // Retry once, with a worklog, when the workflow turns out to have a
  // time-spent validator and the project has opted in by naming a duration.
  //
  // Why retry rather than attach the worklog up front: a worklog sent to a
  // transition whose screen has no Log Work field is REJECTED
  // ("Field 'worklog' cannot be set. It is not on the appropriate screen"), so
  // attaching one pre-emptively breaks transitions that would otherwise have
  // succeeded. Observed on RAPP: two transitions succeed bare and 400 with a
  // worklog, while three others 400 bare and succeed with one.
  //
  // Safe to retry because a failed validator is atomic — Jira applies nothing,
  // including the worklog, so the first call cannot have booked time. Worklogs
  // are cumulative and cannot be silently undone, so this fires at most once.
  if (!resp.ok && resp.status === 400 && worklogTimeSpent) {
    const firstMsg = await parseJiraError(resp);
    if (WORKLOG_VALIDATOR_RE.test(firstMsg)) {
      const update = buildTransitionUpdate({ worklogTimeSpent });
      if (update) {
        if (output)
          output.info(
            `   ⏱️  "${match.name}" needs time logged (${firstMsg}) — retrying once with ${worklogTimeSpent}.`,
          );
        resp = await post(update);
        loggedWork = resp.ok;
      }
    }
  }

  if (!resp.ok) {
    const msg = await parseJiraError(resp);
    if (output) {
      output.warn(
        `⚠️  Jira status not changed for ${issueKey}: transition "${match.name}" returned HTTP ${resp.status}: ${msg}`,
      );
      if (requiredKeys.length)
        output.warn(`    Fields sent: ${JSON.stringify(fields || {})}.`);
      // A workflow *validator* (as opposed to a required field) is invisible to
      // `expand=transitions.fields`, so this is the only place it can surface.
      output.warn(
        `    If the message names a field or a worklog, that is a workflow validator the` +
          ` transitions API does not advertise; it must be satisfied in the same request.`,
      );
      if (!worklogTimeSpent && WORKLOG_VALIDATOR_RE.test(msg))
        output.warn(
          `    This one wants time logged. Set jira.worklogTimeSpent (e.g. "1m") in` +
            ` skills-config.yaml to let the sync satisfy it in the same request.`,
        );
    }
    return {
      transitioned: false,
      reason: `http-${resp.status}`,
      detail: msg,
      from: current,
    };
  }

  // `match.to.name` is the STATUS this transition lands in. `match.name` is the
  // TRANSITION — a verb ("Start Progress"), not a state ("In Progress"). They are
  // different things and Jira returns both, so falling back from one to the other
  // does not degrade gracefully: it reports a verb as though it were the status.
  //
  // That fallback used to be `(match.to && match.to.name) || match.name`, which
  // was invisible in the normal case (Jira populates `to`) and wrong in the case
  // it existed to handle. Since task.45 this value is written into the document's
  // permanent Change Log, so a wrong noun there outlives the sync that produced it.
  //
  // When `to` is absent we simply do not know the destination, and say so. `via`
  // carries the transition actually fired, which is always known and is the honest
  // thing to record — the card did move, and losing that event would be worse than
  // naming it imprecisely.
  const landed = (match.to && match.to.name) || null;
  if (output)
    output.info(
      `   🔀 Transitioned ${issueKey}: "${current}" → ` +
        (landed
          ? `"${landed}"`
          : `(destination not reported by Jira; fired "${match.name}")`) +
        ` (matched ${rule})` +
        (loggedWork ? ` [logged ${worklogTimeSpent}]` : ""),
    );
  return {
    transitioned: true,
    from: current,
    to: landed,
    via: match.name,
    rule,
    loggedWork,
  };
}

// The hops a moment implies from a given position: the rungs the ladder declares
// between here and the target, then the target rung itself. Every element is an
// ARRAY of candidate names in preference order, never a single name — collapsing
// a rung to names[0] makes alternative spellings unreachable, which is the
// regression tracker-workflow's plural `targets` exists to prevent.
//
// ONE implementation, deliberately. `--print-plan` and `--dry-run` print the plan
// while `walkLadder` executes it; two copies of this rule would let the printed
// plan and the walked one drift apart, which is precisely the failure the parity
// test exists to catch. Both now call this.
//
// A null/absent workflow means no ladder is in play, so there is nothing between
// here and there: the target rung alone.
function planHops({ from, targets, workflow, issueType = "" }) {
  const rungs = (targets || []).filter(Boolean);
  if (!rungs.length) return [];
  if (!workflow) return [rungs];
  return [
    ...tw.planMove(from, rungs[0], workflow, { issueType }).map((r) => r.names),
    rungs,
  ];
}

// Walk the rungs between where a card sits and where a moment wants it.
//
// Transitions are POSITION-DEPENDENT: the set available from "In Progress" is
// not the set available from "Waiting for Review". So the list is re-fetched
// after every hop. Caching the first one defeats the entire feature.
//
// EVERY rung is an ARRAY of candidate names in preference order, never one name.
// `resolveMoment` returns `targets` (plural) and `planMove` returns
// `{ names: [...] }` per rung. Collapsing either to `names[0]` makes alternative
// spellings unreachable — a board whose column is "Waiting for Review" would be
// sent to "In Review" — which is the regression task.37's plural return exists
// to prevent. `resolveTransition` already takes an ordered candidate list, so
// each rung passes straight through with no adaptation.
//
// Never throws. A hop that finds no transition ENDS the walk and reports where
// the card actually stopped: a board that gates a column behind a human is a
// correct board, and parking there is the right outcome rather than a failure.
// Three outcomes, three shapes — walked, walk-incomplete, and the single-hop
// reasons a one-rung ladder produces today, byte-identical.
//
// No rollback on a partial walk: the reverse transition may not exist, and
// attempting one fights the guard that just let the card forward.
async function walkLadder({
  http,
  baseUrl,
  email,
  token,
  issueKey,
  from,
  targets,
  workflow,
  issueType = "",
  doneResolution = "",
  cancelledResolution = "",
  worklogTimeSpent = "",
  localStatus,
  terminal = null,
  minRank = null,
  workflowRecord = null,
  allowRegress = false,
  output,
}) {
  const rungs = (targets || []).filter(Boolean);
  if (!rungs.length) return { transitioned: false, reason: "no-target", from };

  const key = (s) => stripStatusEmoji(s).toLowerCase();
  const hops = planHops({ from, targets: rungs, workflow, issueType });

  const visited = new Set([key(from)]);
  const walked = [];
  let current = from;

  // `cause` carries the hop's OWN failure reason up through the walk. Without it
  // a hop-0 `http-500`, `required-fields` or `no-transition` is flattened to a
  // bare "walk-incomplete", and the caller's diagnostics — which branch on
  // `no-transition` to list what the board did offer, and on `detail` to surface
  // the workflow-validator message that has no other route to the operator —
  // silently stop firing. A 500 from Jira must not read as "parked in a gate".
  const incomplete = (i, reason, res) => {
    const out = {
      transitioned: current !== from,
      reason,
      from,
      landed: current,
      remaining: hops.slice(i),
      hops: walked,
    };
    if (res) {
      out.cause = res.reason;
      for (const k of ["detail", "unfillable", "available", "candidates"]) {
        if (res[k] !== undefined) out[k] = res[k];
      }
    }
    return out;
  };

  for (let i = 0; i < hops.length; i++) {
    const rung = hops[i];
    // Cycle guard. This RETURNS the walk-incomplete shape — it must never break
    // into the success return below. An aborted cycle is a BLOCKED walk, and
    // reporting it as `walked` erases the distinction the three outcomes exist
    // to preserve.
    //
    // NOT on the first hop. `visited` is seeded with `from`, and when the card is
    // already where the moment wants it the TARGET rung contains `from` — the
    // single most common outcome in a pipeline, since every resumed run re-fires
    // stages the card has already passed. Guarding at i=0 turned that into
    // `walk-incomplete`, which reads as "parked in a gate" and exits 1 under
    // --strict. Letting hop 0 reach transitionToStatus gets the honest `already`
    // instead, from the same short-circuit that has always produced it.
    //
    // Skipping i=0 costs nothing: planMove returns the rungs STRICTLY between
    // `from` and the target, so an intermediate rung can never be `from`, and a
    // one-rung walk has no earlier hop to cycle back to.
    if (i > 0 && rung.some((n) => visited.has(key(n)))) {
      return incomplete(i, "walk-incomplete");
    }

    const isLast = i === hops.length - 1;

    // NO pre-fetch here, deliberately. `transitionToStatus` fetches its own list
    // per call, which already gives the per-hop re-read a walk needs — the
    // position has changed, so the list it fetches is the one for where the card
    // now is. Pre-fetching and handing it over via the `transitions` parameter
    // costs the same on a hop that moves, and strictly MORE on the two paths that
    // never reach the network: `already` and `would-regress` both short-circuit
    // before the fetch, so pre-fetching spends a GET to learn nothing.
    //
    // That matters because those are not edge cases. A resumed pipeline re-firing
    // a stage the card has already passed is the single most common invocation,
    // and this is what keeps a one-rung walk call-for-call identical to the
    // pre-walking implementation, not merely close to it.
    //
    // The `transitions` parameter stays on `transitionToStatus` — it is the right
    // escape hatch for a caller that HAS already fetched, and it is tested. This
    // walk simply is not such a caller.
    const res = await transitionToStatus({
      http,
      baseUrl,
      email,
      token,
      issueKey,
      targetStatus: rung,
      currentStatus: current,
      // Only the FINAL rung can be terminal; an intermediate one is a gate the
      // card passes through, and unlocking rule 4 there could fire a board's
      // real Done transition halfway up the ladder.
      terminal: isLast ? terminal : false,
      localStatus: isLast ? localStatus : undefined,
      doneResolution,
      cancelledResolution,
      // Worklog is offered to EVERY hop, and each hop that hits a time-spent
      // validator books it again — so an n-hop walk can log n × the configured
      // duration. That is intended: the retry only fires on a transition whose
      // workflow demands time, and a board that demands it on two transitions is
      // asking to be billed twice. It is worth knowing about, because worklogs
      // are cumulative and cannot be silently undone; a consumer who wants one
      // booking per moment should set `jira.worklogTimeSpent` low.
      worklogTimeSpent,
      configHint: "stage",
      // The monotonicity guard runs ONCE, at entry, against the final target's
      // rank. An intermediate rung is by construction below that rank, so a
      // per-hop guard would refuse the gate itself.
      minRank: i === 0 ? minRank : null,
      allowRegress: i === 0 ? allowRegress : true,
      workflowRecord,
      workflow,
      issueType,
      output,
    });

    if (res.transitioned) {
      // `landed` is always a STRING. Fall back to the rung's first NAME, never
      // the rung object — an object here propagates into the next hop's
      // currentStatus and every comparison downstream silently stops matching.
      current = res.to || rung[0];
      visited.add(key(current));
      walked.push({ index: i, to: current, result: "transitioned" });
      continue;
    }

    if (res.reason === "already") {
      // Already on this rung: not a move, not a failure. Keep walking.
      current = res.to || current;
      visited.add(key(current));
      walked.push({ index: i, to: current, result: "already" });
      continue;
    }

    walked.push({ index: i, result: res.reason, candidates: rung });
    // A one-rung ladder must be byte-identical to today, so when the first and
    // only hop fails, report ITS reason rather than dressing it up as a walk.
    if (isLast && i === 0)
      return { ...res, from, landed: current, hops: walked };

    // An intermediate rung the board does not offer FROM HERE is not necessarily
    // a rung the board REQUIRES. `no-transition` means exactly that — unreachable
    // from this position — which is a different thing from a rung that exists and
    // is blocked. `required-fields`, an HTTP error or a cycle are real
    // obstructions and must still park the walk; only this one reason is a
    // statement about the board's shape rather than about permission.
    //
    // So before parking, try the DESTINATION directly. If the board offers it,
    // the ladder's intermediate rung is simply not on this board's path from
    // here, and insisting on it invents a requirement the board never stated.
    //
    // Observed live (rebirth-wallet RAPP-111, 2026-08-08): `ready-for-merge` from
    // "Ready for Testing" planned a hop through "Ready for Showcase", which that
    // board does not offer from there — while "Waiting for merge", the actual
    // destination, WAS directly available and appeared in the run's own
    // `available` list. The card parked one rung short of a reachable target and
    // the CLI exited 0 with `walk-incomplete`, which reads as a correct no-op and
    // is not one. A human had to move the card by hand.
    if (res.reason === "no-transition") {
      const finalRung = hops[hops.length - 1];
      const direct = await transitionToStatus({
        http,
        baseUrl,
        email,
        token,
        issueKey,
        targetStatus: finalRung,
        currentStatus: current,
        // This IS the final rung, so it carries the terminal semantics the walk
        // reserves for it — the very thing an intermediate hop must never get.
        terminal,
        localStatus,
        doneResolution,
        cancelledResolution,
        worklogTimeSpent,
        configHint: "stage",
        // Same guard semantics as the loop: the monotonicity check belongs to the
        // first move only, and by here the card has not moved if i === 0.
        minRank: i === 0 ? minRank : null,
        allowRegress: i === 0 ? allowRegress : true,
        workflowRecord,
        workflow,
        issueType,
        output,
      });

      if (direct.transitioned || direct.reason === "already") {
        current = direct.to || current;
        visited.add(key(current));
        walked.push({
          index: hops.length - 1,
          to: current,
          result: direct.transitioned ? "transitioned" : "already",
          // Flags that the rungs between here and the target were skipped because
          // the board did not offer them, not because the walk gave up. A reader
          // auditing "did my ladder do this?" needs to see the shortcut, not a
          // clean walk that silently omits rungs the ladder declares.
          shortcut: true,
        });
        // Fall through to the success return rather than duplicating its shape —
        // `walked` already carries the failed rung above it, so the `every`
        // already-check below correctly does not fire.
        break;
      }
    }

    return incomplete(i, "walk-incomplete", res);
  }

  // Every rung was already satisfied and nothing fired. That is `already`, not a
  // walk of length zero: callers branch on it to print "is already X" and it is
  // the legacy shape a one-rung ladder has always returned. Reporting `walked`
  // here would make a no-op indistinguishable from a real move on the reader's
  // side, and `to`/`from` are both the current status exactly as before.
  // `walked` is never empty here — every iteration either pushes or returns, and
  // the empty-targets case returned `no-target` above — so `every` on it is a
  // genuine test, not a vacuous truth.
  if (walked.every((h) => h.result === "already")) {
    return {
      transitioned: false,
      reason: "already",
      to: current,
      from: current,
      landed: current,
      hops: walked,
    };
  }

  return {
    transitioned: current !== from,
    reason: "walked",
    from,
    landed: current,
    to: current,
    hops: walked,
  };
}

// Drive an issue's Jira status from a local document's frontmatter status.
// Shared by all three sync skills so they resolve, configure, and report
// identically. `docKind` ("story" | "task" | "epic" | "bug") selects the optional
// per-issue-type layer of jira.statusMap.
async function syncDocumentStatus({
  http,
  baseUrl,
  email,
  token,
  issueKey,
  localStatus,
  currentStatus,
  docKind,
  repoRoot,
  output,
  // Named on a deferred transition record, so a refused status move is
  // attributed to the calling skill rather than to this library.
  skill = undefined,
  // Opt out of driving status at all, for a caller that wants only the other
  // half of a sync (re-pointing the Document link, refreshing the description).
  //
  // This exists because `sync-jira-*` previously had no way to be status-neutral
  // — `syncDocumentStatus` ran whenever frontmatter carried a `status:` — so
  // finalise's Document-link re-point was unavoidably also a status decision,
  // resolved by a SECOND resolver (`loadStatusMap`) after the ladder had already
  // made the call. On a consumer mapping `accepted` to a non-terminal column,
  // that second resolver walked the card back OUT of the status the ladder had
  // just set, stranding its resolution (bug.11).
  //
  // The gate lives here rather than at the four call sites so it holds for every
  // caller and can be asserted without a live Jira: with `noTransition`, not one
  // HTTP request is issued.
  noTransition = false,
}) {
  // NB the reason is `transition-suppressed`, NOT `no-transition`. That name is
  // already taken, by the opposite condition: `no-transition` means the workflow
  // offers no matching transition from here — a genuine skip that must still
  // fail under --fail-on-status-skip. Reusing it would have made every real skip
  // start exiting 0 the moment the suppressed case was added to the pass list.
  if (noTransition)
    return {
      transitioned: false,
      reason: "transition-suppressed",
      issueKey,
      localStatus,
    };

  const root =
    repoRoot ||
    (() => {
      try {
        return execSync("git rev-parse --show-toplevel", GIT_EXEC_OPTS).trim();
      } catch (_) {
        return "";
      }
    })();

  const statusMap = loadStatusMap(root || undefined, docKind);
  const candidates = mapStatusCandidates(localStatus, statusMap);
  if (!candidates || !candidates.length)
    return { transitioned: false, reason: "no-target", localStatus };

  const res = await transitionToStatus({
    skill,
    http,
    baseUrl,
    email,
    token,
    issueKey,
    targetStatus: candidates,
    currentStatus,
    localStatus,
    doneResolution: loadDoneResolution(root || undefined),
    cancelledResolution: loadCancelledResolution(root || undefined),
    worklogTimeSpent: loadWorklogTimeSpent(root || undefined),
    output,
  });
  return { ...res, localStatus, issueKey };
}

// Terse end-of-run line for a status change that did not happen, printed after
// the success output so it cannot be lost in the middle of a long sync. The
// detailed diagnosis was already emitted by transitionToStatus.
//
// Returns the exit code to use: non-zero only under --fail-on-status-skip, so
// existing pipelines on boards this cannot drive keep working.
function summariseStatusOutcome(
  outcome,
  { output, failOnSkip = false, repoRoot } = {},
) {
  if (!outcome) return 0;
  const { transitioned, reason } = outcome;
  // `transition-suppressed` is the caller having ASKED for no status move, so it
  // is a run behaving exactly as configured — never a skip to warn about, and
  // never a reason to fail under --fail-on-status-skip. Omitting it here would
  // make `--no-transition --fail-on-status-skip` fail every run that used both.
  //
  // `no-transition` is deliberately NOT in this list: it is the board offering
  // no matching transition, which is a real skip and must keep failing.
  if (
    transitioned ||
    reason === "already" ||
    reason === "no-target" ||
    reason === "transition-suppressed"
  )
    return 0;

  // CR-1 — a deferral is not a skip. The move was refused by policy and WRITTEN
  // DOWN, so there is a record to act on; treating it as a skip would both
  // misdescribe it ("move it by hand, or see the guidance above") and, under
  // --fail-on-status-skip, fail a run that behaved exactly as configured.
  if (reason === "deferred") {
    if (output)
      output.info(
        `   ⏸️  Status for ${outcome.issueKey || "the issue"} was not moved — access.tracker restricts this run` +
          (outcome.record ? `. Recorded as ${outcome.record}.` : "."),
      );
    return 0;
  }

  if (output) {
    const where = outcome.from ? ` It is still "${outcome.from}".` : "";
    // A narrowed statusMap is the likeliest cause of a skip on a board that
    // otherwise looks ordinary, and this is the one moment the reader is
    // actually looking. Empty unless THIS status is the narrowed one.
    const advice = narrowingStatusMapAdvice(loadStatusMapOverrides(repoRoot), {
      localStatus: outcome.localStatus,
    });
    output.warn(
      `\n⚠️  Status NOT synced for ${outcome.issueKey} (local status "${outcome.localStatus}", reason: ${reason}).${where}` +
        `\n    Everything else synced. Move it by hand, or see the guidance above.` +
        (advice ? `\n${advice}` : ""),
    );
  }
  return failOnSkip ? 1 : 0;
}

// The canonical local vocabulary, in lifecycle order — what a probe reports on.
const CANONICAL_LOCAL_STATUSES = Object.freeze([
  "draft",
  "planned",
  "ready-for-development",
  "in-progress",
  "ready-for-review",
  "accepted",
  "cancelled",
]);

// Read-only diagnostic: show what this Jira project's workflow actually offers
// and, for each canonical local status, which transition would be chosen and by
// which rule. Writes nothing, transitions nothing.
//
// Boards vary enough that guessing at `jira.statusMap` from documentation is a
// waste of time; this prints the ground truth instead. Sampling a real issue
// per type is what makes it honest — transitions are position-dependent, so the
// answer legitimately differs depending on where an issue currently sits.
async function probeWorkflow({
  http,
  baseUrl,
  email,
  token,
  projectKey,
  issueKey,
  repoRoot,
  docKind,
  writePath = "",
  output,
}) {
  const log = (s) => output && output.info(s);
  const headers = {
    Authorization: authHeader(email, token),
    Accept: "application/json",
  };

  log(
    `\n🔎 Workflow probe — project ${projectKey}${baseUrl ? ` (${baseUrl})` : ""}`,
  );

  // 1. statuses per issue type
  let types = [];
  try {
    const resp = await http(
      `${baseUrl}/rest/api/3/project/${projectKey}/statuses`,
      { headers },
    );
    if (resp.ok) types = await resp.json();
  } catch (_) {}

  if (!types.length) {
    log(
      `   Could not read project statuses (permissions or wrong project key).`,
    );
  } else {
    log(`\n   Statuses by issue type`);
    for (const t of types) {
      const names = (t.statuses || [])
        .map((s) => `${s.name} [${s.statusCategory && s.statusCategory.key}]`)
        .join(", ");
      log(`     ${t.name}: ${names || "(none)"}`);
    }
  }

  // 2. sample a live issue per issue type so transitions are real, not guessed
  const samples = [];
  if (issueKey) {
    samples.push({ key: issueKey, type: "(supplied)" });
  } else {
    for (const t of types) {
      try {
        const jql = encodeURIComponent(
          `project=${projectKey} AND issuetype="${t.name}" ORDER BY updated DESC`,
        );
        const resp = await http(
          `${baseUrl}/rest/api/3/search/jql?jql=${jql}&maxResults=1&fields=status`,
          { headers },
        );
        if (!resp.ok) continue;
        const data = await resp.json();
        const hit = (data.issues || [])[0];
        if (hit)
          samples.push({
            key: hit.key,
            type: t.name,
            status: hit.fields && hit.fields.status && hit.fields.status.name,
          });
      } catch (_) {}
    }
  }

  if (!samples.length) {
    log(
      `\n   No issues found to sample — transitions are only visible from a real issue.`,
    );
    return { types, samples: [] };
  }

  const statusMap = loadStatusMap(repoRoot, docKind);
  const workflowRecord = loadWorkflowRecord(repoRoot);
  const results = [];
  const stageResults = [];

  for (const s of samples) {
    let transitions = [];
    try {
      transitions = await getTransitions({
        http,
        baseUrl,
        email,
        token,
        issueKey: s.key,
      });
    } catch (_) {}

    log(`\n   ${s.key} — ${s.type} @ "${s.status || "?"}"`);
    log(`     Transitions available from here:`);
    for (const t of transitions) {
      const req = Object.entries(t.fields || {})
        .filter(([, v]) => v && v.required)
        .map(([k]) => k);
      log(
        `       id=${t.id} "${t.name}" → "${(t.to && t.to.name) || "?"}"` +
          `${req.length ? `  requires: ${req.join(", ")}` : ""}`,
      );
    }

    log(`     Local status → what this sync would do:`);
    for (const local of CANONICAL_LOCAL_STATUSES) {
      const candidates = mapStatusCandidates(local, statusMap) || [];
      const r = resolveTransition({
        transitions,
        candidates,
        currentStatus: s.status,
        terminal: isTerminalLocalStatus(local),
      });
      if (!r.match) {
        log(`       ${local.padEnd(22)} skip (${r.reason})`);
        results.push({ issue: s.key, local, action: `skip:${r.reason}` });
        continue;
      }
      const built = buildTransitionFields(r.match, {
        negative: isNegativeLocalStatus(local),
      });
      const extra = built.unfillable.length
        ? `  UNFILLABLE: ${built.unfillable.join(", ")}`
        : built.fields
          ? `  + ${JSON.stringify(built.fields)}`
          : "";
      log(
        `       ${local.padEnd(22)} → "${(r.match.to && r.match.to.name) || r.match.name}"` +
          ` (via ${r.rule})${extra}`,
      );
      results.push({
        issue: s.key,
        local,
        to: r.match.to && r.match.to.name,
        rule: r.rule,
        unfillable: built.unfillable,
      });
    }

    // The develop pipeline moves through STAGES, not document statuses. They
    // overlap but are not the same list, and a stage disabled for this issue
    // type is a different answer from a stage the board cannot reach — print
    // both so an operator can tell them apart.
    log(`     Pipeline stage → what /develop-* would do:`);
    for (const stage of STAGE_NAMES) {
      const spec = resolveStage({
        stage,
        issueType: s.type,
        record: workflowRecord,
      });
      if (!spec.enabled) {
        log(
          `       ${stage.padEnd(22)} disabled${spec.reason ? ` (${spec.reason})` : ""}`,
        );
        stageResults.push({ issue: s.key, stage, action: "disabled" });
        continue;
      }
      const r = resolveTransition({
        transitions,
        candidates: spec.candidates,
        currentStatus: s.status,
        terminal: spec.terminal,
      });
      if (!r.match) {
        log(`       ${stage.padEnd(22)} skip (${r.reason})`);
        stageResults.push({ issue: s.key, stage, action: `skip:${r.reason}` });
        continue;
      }
      const built = buildTransitionFields(r.match, { negative: false });
      const extra = built.unfillable.length
        ? `  UNFILLABLE: ${built.unfillable.join(", ")}`
        : built.fields
          ? `  + ${JSON.stringify(built.fields)}`
          : "";
      log(
        `       ${stage.padEnd(22)} → "${(r.match.to && r.match.to.name) || r.match.name}"` +
          ` (via ${r.rule})${extra}`,
      );
      stageResults.push({
        issue: s.key,
        stage,
        to: r.match.to && r.match.to.name,
        rule: r.rule,
      });
    }
  }

  log(
    `\n   Candidate names come from jira.statusMap / the workflow record, overlaid on the defaults.` +
      `\n   A "skip" above means this board has no transition for that stage from that position — which is` +
      `\n   often correct. "disabled" means the record opts this issue type out deliberately.` +
      `\n   Only add an override when a stage you actually use is being skipped.\n`,
  );

  const narrowing = narrowingStatusMapAdvice(loadStatusMapOverrides(repoRoot));
  if (narrowing) log(`${narrowing}\n`);

  if (writePath) {
    const record = buildWorkflowRecord({
      projectKey,
      baseUrl,
      types,
      samples,
      existing: workflowRecord,
    });
    fs.mkdirSync(path.dirname(writePath), { recursive: true });
    fs.writeFileSync(writePath, JSON.stringify(record, null, 2) + "\n");
    log(`   📝 Wrote workflow record → ${writePath}`);
  }

  return { types, samples, results, stageResults };
}

// Assemble the machine-readable record from what the probe just observed,
// preserving any hand-authored intent (enabled/reason/worklog/statusRank) in an
// existing file. Regenerating must never silently discard the decisions a human
// made about which stages this board should drive.
function buildWorkflowRecord({
  projectKey,
  baseUrl,
  types,
  existing = {},
} = {}) {
  const stages = {};
  for (const stage of STAGE_NAMES) {
    const spec = resolveStage({ stage, record: existing });
    stages[stage] = {
      enabled: spec.enabled,
      rank: spec.rank,
      candidates: spec.candidates,
    };
    if (spec.terminal) stages[stage].terminal = true;
    if (spec.reason) stages[stage].reason = spec.reason;
  }
  return {
    version: 1,
    project: projectKey,
    site: (() => {
      try {
        return new URL(baseUrl).hostname;
      } catch (_) {
        return baseUrl || "";
      }
    })(),
    ...(existing.verifiedAt ? { verifiedAt: existing.verifiedAt } : {}),
    ...(existing.board ? { board: existing.board } : {}),
    statusesByIssueType: (types || []).reduce((acc, t) => {
      acc[t.name] = (t.statuses || []).map((s) => s.name);
      return acc;
    }, {}),
    ...(existing.worklog ? { worklog: existing.worklog } : {}),
    ...(existing.statusRank ? { statusRank: existing.statusRank } : {}),
    stages,
    ...(existing.byIssueType ? { byIssueType: existing.byIssueType } : {}),
  };
}

// ---------------------------------------------------------------------------
// Project style detection (team-managed vs classic) — used for Story epic linkage
// ---------------------------------------------------------------------------
const PROJECT_STYLE_TTL_MS = 24 * 60 * 60 * 1000;

function projectStyleCachePath(repoRoot, projectKey) {
  return path.join(repoRoot, ".cache", `jira-projectstyle-${projectKey}.json`);
}

function readProjectStyleCache(repoRoot, projectKey) {
  const p = projectStyleCachePath(repoRoot, projectKey);
  if (!fs.existsSync(p)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(p, "utf-8"));
    if (!data.ts || Date.now() - data.ts > PROJECT_STYLE_TTL_MS) return null;
    return data.style || null;
  } catch (_) {
    return null;
  }
}

function writeProjectStyleCache(repoRoot, projectKey, style) {
  const p = projectStyleCachePath(repoRoot, projectKey);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ ts: Date.now(), style }, null, 2));
}

async function detectProjectStyle({
  http,
  baseUrl,
  email,
  token,
  projectKey,
  repoRoot,
  output,
} = {}) {
  if (repoRoot) {
    const cached = readProjectStyleCache(repoRoot, projectKey);
    if (cached) return cached;
  }
  try {
    const resp = await http(`${baseUrl}/rest/api/3/project/${projectKey}`, {
      headers: {
        Authorization: authHeader(email, token),
        Accept: "application/json",
      },
    });
    if (!resp.ok) {
      if (output)
        output.warn(
          `⚠️  Could not detect Jira project style (HTTP ${resp.status}); will try team-managed parent first and fall back via 400-retry.`,
        );
      return null;
    }
    const d = await resp.json();
    const style = d.style || null;
    if (style && repoRoot) writeProjectStyleCache(repoRoot, projectKey, style);
    return style;
  } catch (e) {
    if (output)
      output.warn(
        `⚠️  Could not detect Jira project style (${e.message}); will try team-managed parent first and fall back via 400-retry.`,
      );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Idempotent create — search by sync label before POST
//
// Uses POST /rest/api/3/search/jql (the modern endpoint). The legacy GET
// /rest/api/3/search was deprecated by Atlassian in May 2025 and now returns
// 410 Gone on Jira Cloud tenants that have migrated.
// ---------------------------------------------------------------------------
async function findExistingByLabel({
  http,
  baseUrl,
  email,
  token,
  projectKey,
  label,
  output,
} = {}) {
  const jql = `project = "${projectKey}" AND labels = "${label}"`;
  const resp = await http(`${baseUrl}/rest/api/3/search/jql`, {
    method: "POST",
    headers: {
      Authorization: authHeader(email, token),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      jql,
      fields: ["summary", "updated"],
      maxResults: 5,
    }),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  if (!data.issues || data.issues.length === 0) return null;
  if (data.issues.length > 1 && output) {
    const keys = data.issues.map((i) => i.key).join(", ");
    output.warn(
      `⚠️  Multiple Jira issues match label "${label}": ${keys}. Adopting first (${data.issues[0].key}). The others are duplicates from prior failed runs — review and delete in Jira.`,
    );
  }
  return {
    key: data.issues[0].key,
    updated: data.issues[0].fields?.updated || null,
  };
}

// ---------------------------------------------------------------------------
// Atomic PUT with returnIssue
// ---------------------------------------------------------------------------
async function putIssueAtomic({
  http,
  baseUrl,
  email,
  token,
  issueKey,
  fields,
  skill = undefined, // CR-7 — see moveToBacklog
}) {
  const resp = await http(
    `${baseUrl}/rest/api/3/issue/${issueKey}?returnIssue=true`,
    {
      method: "PUT",
      headers: {
        Authorization: authHeader(email, token),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ fields }),
      // Layer 2 — the field names and values, not the request body.
      defer: {
        kind: "jira.issue.update",
        intent: `Set ${Object.keys(fields || {}).join(", ") || "fields"} on ${issueKey}`,
        target: {
          issue: issueKey,
          url: `${baseUrl}/rest/api/3/issue/${issueKey}`,
          ui_url: `${baseUrl}/browse/${issueKey}`,
        },
        desired: summariseFields(fields),
        skill, // CR-7 — the calling skill, not the library
      },
    },
  );
  // The deferred UPDATE shape: the caller already holds a real issue key, so
  // only `updated` is unknown. Identical to the --dry-run update path, which is
  // why every caller already copes with it.
  if (resp.deferred) {
    return { updated: null, deferred: true, record: resp.deferredRecord };
  }
  if (!resp.ok)
    throw new Error(`HTTP ${resp.status}: ${await parseJiraError(resp)}`);
  if (resp.status === 204) {
    return { updated: null };
  }
  try {
    const data = await resp.json();
    return { updated: data.fields?.updated || null };
  } catch (_) {
    return { updated: null };
  }
}

// ---------------------------------------------------------------------------
// Comments
//
// The endpoint this file spent a long time not having. Everything here is a
// transcription of putIssueAtomic above — same http() factory, so task 53's
// access gate (makeHttp, "layer 1") covers it without a line of its own, and
// same deferred-return shape, so callers that already cope with a deferred
// update cope with a deferred comment.
//
// The identity footer is the Jira half of the comment marker. GitHub gets an
// invisible HTML comment; Jira cannot, because ADF drops nodes it does not
// recognise and an HTML comment is not an ADF node — it would be silently
// stripped and the marker would vanish, taking idempotency with it. So Jira
// gets a small italic line instead: visible, but unobtrusive, and it survives a
// human copying the body by hand.
// ---------------------------------------------------------------------------

const COMMENT_MARKER_PREFIX = "agent-skills-comment:";

/** The GitHub/Bitbucket marker — an HTML comment, invisible when rendered. */
function commentMarkerHtml(momentId) {
  return `<!-- ${COMMENT_MARKER_PREFIX}${momentId} -->`;
}

/** The Jira marker — visible italic text, because ADF has nowhere to hide it. */
function commentMarkerText(momentId) {
  return `↳ ${COMMENT_MARKER_PREFIX}${momentId}`;
}

/**
 * Build the ADF document for a comment: the rendered body, then the identity
 * footer as its own italic paragraph.
 */
function buildCommentAdf(body, momentId, linkResolver) {
  const nodes = textToAdfNodes(body, linkResolver);
  if (momentId) {
    nodes.push(adf.paragraph(adf.em(commentMarkerText(momentId))));
  }
  // An entirely empty comment is not a legal ADF doc; a bare paragraph is.
  // NOT `paragraph(text(""))` — ADF rejects a text node with an empty string,
  // so Jira 400s and the run reports `unverifiable` instead of posting. A body
  // that renders to nothing is reachable (a body of only `---`), so this is a
  // real path, not a defensive one.
  return adf.doc(...(nodes.length ? nodes : [{ type: "paragraph" }]));
}

/**
 * Search an issue's existing comments for the identity marker.
 *
 * Returns `{ count, ids }`. The CARDINALITY is the whole point and the caller
 * must branch on it rather than taking the first hit:
 *
 *   0  → nothing posted yet, post it
 *   1  → already posted, do not post again
 *   2+ → ambiguous: DO NOT GUESS
 *
 * The existing PR-comment convention (skills/finalise/SKILL.md) resolves the
 * many-match case with `| head -1`, which is how a duplicate comment becomes
 * invisible: two matches, first one adopted, second one never reconciled. This
 * function reports the count and refuses to choose.
 */
async function findCommentsByMarker({
  http,
  baseUrl,
  email,
  token,
  issueKey,
  momentId,
  maxResults = 100,
}) {
  // The FULL marker line, matched EXACTLY — never the bare prefix as a
  // substring. `agent-skills-comment:review` is a prefix of
  // `agent-skills-comment:review-story`, so a substring search made a Step 2
  // `review` comment report `already` against an existing `review-story`
  // marker and never post. Silent comment loss, which is the failure this
  // module exists to prevent.
  const marker = commentMarkerText(momentId);
  const resp = await http(
    `${baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment` +
      `?maxResults=${maxResults}&orderBy=-created`,
    {
      headers: {
        Authorization: authHeader(email, token),
        Accept: "application/json",
      },
    },
  );
  // A read that fails is not evidence of absence. Signalling "unreadable" lets
  // the caller report `unverifiable` rather than posting a possible duplicate.
  if (!resp.ok) return { count: null, ids: [], unreadable: true };
  let data;
  try {
    data = await resp.json();
  } catch (_) {
    return { count: null, ids: [], unreadable: true };
  }
  const hits = (data.comments || []).filter((c) =>
    adfContainsExactText(c.body, marker),
  );
  // An unpaginated read is not evidence of absence. When Jira reports more
  // comments than we asked for — OR does not say how many there are — the
  // marker may be outside the window, so report unreadable and let the caller
  // degrade to `unverifiable` rather than posting a duplicate on the strength
  // of a partial list.
  //
  // Note the `!Number.isFinite` half: an absent or null `total` must fail
  // CLOSED. Every other unreadable path in this module does, and this one was
  // the odd one out — a payload without `total` read as "nothing found" and
  // posted the duplicate.
  const total = Number(data.total);
  if (!Number.isFinite(total) || total > (data.comments || []).length) {
    return { count: null, ids: [], unreadable: true, truncated: true };
  }
  return { count: hits.length, ids: hits.map((c) => c.id), unreadable: false };
}

/** Depth-first scan of an ADF document for a literal substring. */
function adfContainsText(node, needle) {
  if (!node || typeof node !== "object") return false;
  if (typeof node.text === "string" && node.text.includes(needle)) return true;
  const kids = Array.isArray(node.content) ? node.content : [];
  return kids.some((k) => adfContainsText(k, needle));
}

/**
 * Depth-first scan for a text node whose trimmed content EQUALS `needle`.
 *
 * The identity footer has no closing delimiter — unlike the GitHub HTML
 * marker, which terminates itself with ` -->` — so a substring match cannot
 * tell `…:review` from `…:review-story`. Exact equality can, and needs no
 * change to the marker's shape.
 */
function adfContainsExactText(node, needle) {
  if (!node || typeof node !== "object") return false;
  if (typeof node.text === "string" && node.text.trim() === needle) return true;
  const kids = Array.isArray(node.content) ? node.content : [];
  return kids.some((k) => adfContainsExactText(k, needle));
}

/**
 * Post a comment to a Jira issue.
 *
 * `skill` is first by the convention transitionToStatus sets — it names the
 * CALLING skill on the deferred record, not this library.
 */
async function addComment({
  skill = undefined,
  http,
  baseUrl,
  email,
  token,
  issueKey,
  body,
  // The one-line label a human reads in the handover checklist to tell one
  // pending action from another. The caller passes it when `body` is not what
  // should be labelled — tracker-comment.js composes a plain-language lead above
  // the body, and the lead is near-identical for every comment of a given stage,
  // so labelling with it stops the label labelling. Defaults to the old
  // behaviour, so every other caller is unaffected.
  desired = undefined,
  momentId = "",
  linkResolver = undefined,
}) {
  const doc = buildCommentAdf(body, momentId, linkResolver);
  const resp = await http(
    `${baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`,
    {
      method: "POST",
      headers: {
        Authorization: authHeader(email, token),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ body: doc }),
      // Layer 2 — what the mutation MEANS. The rendered ADF is not useful to a
      // human performing this by hand, so `manual.fields` carries the markdown
      // they would paste, and `command.stdin` carries it too so the record's
      // fingerprint distinguishes two different comments on the same issue.
      defer: {
        kind: "jira.comment.add",
        intent: `Comment on ${issueKey}${momentId ? ` (${momentId})` : ""}`,
        target: {
          issue: issueKey,
          url: `${baseUrl}/rest/api/3/issue/${issueKey}/comment`,
          ui_url: `${baseUrl}/browse/${issueKey}`,
        },
        desired: desired || firstLineOf(body),
        manual: {
          deepLink: `${baseUrl}/browse/${issueKey}`,
          ui: "Open the issue → Comment → Paste → Save",
          fields: [{ name: "Comment", value: body }],
        },
        command: { argv: ["jira", "comment", issueKey], stdin: body },
        skill,
      },
    },
  );
  if (resp.deferred) {
    return { posted: false, deferred: true, record: resp.deferredRecord };
  }
  if (!resp.ok)
    throw new Error(`HTTP ${resp.status}: ${await parseJiraError(resp)}`);
  let id = null;
  try {
    const data = await resp.json();
    id = data.id || null;
  } catch (_) {
    /* 204 or unparseable — the post still succeeded */
  }
  return { posted: true, id };
}

/** First non-empty line, trimmed of markdown heading marks, for `desired`. */
function firstLineOf(text) {
  if (!text) return "(empty comment)";
  const line = String(text)
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length);
  if (!line) return "(empty comment)";
  const stripped = line.replace(/^#+\s*/, "").replace(/\*\*/g, "");
  return stripped.length > 120 ? `${stripped.slice(0, 117)}...` : stripped;
}

async function fetchIssue({
  http,
  baseUrl,
  email,
  token,
  issueKey,
  fields = "summary,priority,labels,updated,status",
}) {
  const resp = await http(
    `${baseUrl}/rest/api/3/issue/${issueKey}?fields=${fields}`,
    {
      headers: {
        Authorization: authHeader(email, token),
        Accept: "application/json",
      },
    },
  );
  if (!resp.ok) {
    const auth = describeAuthFail(resp.status);
    if (auth) throw new Error(auth);
    throw new Error(`HTTP ${resp.status}: ${await parseJiraError(resp)}`);
  }
  const d = await resp.json();
  return {
    summary: d.fields?.summary || "",
    priority: d.fields?.priority?.name || "",
    labels: d.fields?.labels || [],
    updated: d.fields?.updated || null,
    status: d.fields?.status?.name || null,
    // Only populated when the caller asks for `issuetype` in `fields`. Stage
    // resolution keys on the live type name because one board commonly gives
    // several task types genuinely different workflows.
    issueType: d.fields?.issuetype?.name || "",
  };
}

async function fetchUpdatedTimestampStrict({
  http,
  baseUrl,
  email,
  token,
  issueKey,
}) {
  const resp = await http(
    `${baseUrl}/rest/api/3/issue/${issueKey}?fields=updated`,
    {
      headers: {
        Authorization: authHeader(email, token),
        Accept: "application/json",
      },
    },
  );
  if (!resp.ok)
    throw new Error(
      `Failed to fetch updated timestamp for ${issueKey}: HTTP ${resp.status}`,
    );
  const d = await resp.json();
  if (!d.fields?.updated)
    throw new Error(`Jira response missing fields.updated for ${issueKey}`);
  return d.fields.updated;
}

// Non-throwing variant. Returns null on failure so callers can fall back to
// a synthetic timestamp rather than aborting after a successful create/update.
async function fetchUpdatedTimestamp({
  http,
  baseUrl,
  email,
  token,
  issueKey,
}) {
  try {
    const resp = await http(
      `${baseUrl}/rest/api/3/issue/${issueKey}?fields=updated`,
      {
        headers: {
          Authorization: authHeader(email, token),
          Accept: "application/json",
        },
      },
    );
    if (!resp.ok) return null;
    const d = await resp.json();
    return d.fields?.updated || null;
  } catch (_) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  // env / output
  loadDotEnv,
  CREDENTIAL_FILES,
  REQUIRED_CREDENTIAL_KEYS,
  credentialSearchRoots,
  parseEnvFileInto,
  _resetCredentialWarning,
  makeOutput,
  // frontmatter
  parseFrontmatter,
  rewriteFrontmatter,
  upsertFrontmatterKeys,
  formatYamlScalar,
  // git / bb
  getRepoRoot,
  getDefaultBranch,
  gitDefaultBranch,
  resolveDocBranch,
  loadDocBranchSetting,
  getCurrentBranchUpstream,
  stripRemotePrefix,
  getBitbucketRepoBase,
  buildBitbucketUrl,
  resolveRelativeLink,
  makeRelativeLinkResolver,
  // change log — policy only; the engine is change-log.js, imported directly by
  // callers that need to read or write a block
  buildChangeLogEntries,
  // adf
  adf,
  textToAdfNodes,
  textToParagraphs,
  blockToAdf,
  tableLinesToAdf,
  inlineMarkdownToAdf,
  sectionRe,
  extractSection,
  toRelativeDocLink,
  extractBodySections,
  escapeRe,
  // description size guard
  JIRA_TEXT_LIMIT,
  adfTextLength,
  capDescriptionAdf,
  // card section specs — the one definition (task.102)
  TASK_CARD_SECTIONS,
  STORY_CARD_SECTIONS,
  EPIC_CARD_SECTIONS,
  BUG_CARD_SECTIONS,
  CARD_SECTIONS_BY_KIND,
  // card summarisation
  CARD_MAX_LIST_ITEMS,
  CARD_MAX_SENTENCES,
  CARD_MAX_CHARS,
  dropHeadingLines,
  firstTableIn,
  splitSentences,
  summariseSection,
  summaryBlockNodes,
  buildCardSections,
  checkCardSections,
  formatCardCheck,
  // priority / labels
  PRIORITY_MAP,
  normalisePriority,
  sanitiseLabels,
  resolveLivePriorities,
  // auth / http
  getAuth,
  authHeader,
  makeHttp,
  isReadViaPost,
  mostRestrictiveAccess,
  summariseFields,
  endpointOf,
  parseRetryAfter,
  sleep,
  parseJiraError,
  describeAuthFail,
  // diff / guard / hash
  diffFields,
  diffAgainstPayload,
  normaliseListForHash,
  guardConcurrentEdit,
  hashStable,
  // comments
  addComment,
  findCommentsByMarker,
  buildCommentAdf,
  commentMarkerHtml,
  commentMarkerText,
  adfContainsText,
  adfContainsExactText,
  matchCodeFence,
  firstLineOf,
  COMMENT_MARKER_PREFIX,
  // jira api
  fetchIssue,
  fetchUpdatedTimestampStrict,
  fetchUpdatedTimestamp,
  getIssueTypeId,
  // issue links (the bug card's sibling relationship)
  LINK_TYPE_CANDIDATES,
  getIssueLinkTypes,
  resolveLinkType,
  linkIssues,
  getBoardType,
  moveToBacklog,
  putIssueAtomic,
  findExistingByLabel,
  transitionToStatus,
  walkLadder,
  planHops,
  syncDocumentStatus,
  summariseStatusOutcome,
  probeWorkflow,
  CANONICAL_LOCAL_STATUSES,
  getTransitions,
  resolveTransition,
  CLOSED_CANDIDATES,
  REOPENED_CANDIDATES,
  buildTransitionFields,
  buildTransitionUpdate,
  buildWorkflowRecord,
  WORKLOG_VALIDATOR_RE,
  stripStatusEmoji,
  detectProjectStyle,
  // pipeline stages
  DEFAULT_STAGE_MAP,
  STAGE_NAMES,
  DEFAULT_STATUS_RANK,
  DEFAULT_WORKFLOW_RECORD_PATH,
  loadWorkflowRecord,
  loadWorklogTimeSpent,
  resolveStage,
  resolveStatusRank,
  isTerminalMoment,
  // status mapping
  DEFAULT_STATUS_MAP,
  loadStatusMap,
  loadStatusMapOverrides,
  detectNarrowingStatusMap,
  narrowingStatusMapAdvice,
  mapStatus,
  mapStatusCandidates,
  isTerminalLocalStatus,
  isNegativeLocalStatus,
  // jira scalar config
  parseJiraScalar,
  parseTopLevelScalar,
  loadDevEstimateField,
  loadDoneResolution,
  loadCancelledResolution,
  loadDefaultAssignee,
  resolveAssignee,
  isAssigneePlaceholder,
  // cache
  readIssueTypeCache,
  writeIssueTypeCache,
  readProjectStyleCache,
  writeProjectStyleCache,
};
