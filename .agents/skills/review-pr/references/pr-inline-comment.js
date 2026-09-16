#!/usr/bin/env node
// AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/pr-inline-comment.js. Regenerate via `npm run bundle`.
/**
 * pr-inline-comment — post review findings as INLINE comments on a pull request,
 * on either platform, anchored to the lines they are about.
 *
 * The peer of tracker-comment.js, one axis over. That CLI comments on a tracker
 * ISSUE and branches on $TRACKER; this one comments on a pull REQUEST and
 * branches on $VCS. They are separate axes — a repo can host code on Bitbucket
 * and track work in Jira — and conflating them is how a Bitbucket repo ends up
 * taking a `gh` code path that cannot address it and reports success anyway.
 *
 * Before this file, `/review-code --comment` DOCUMENTED posting each finding
 * "as an inline review comment at its file_line" and no such code existed
 * anywhere in the repository, while `/review-pr` scoped the behaviour out and
 * named building it as its own task. This is that task.
 *
 * THE ONE INVARIANT: a finding is never dropped.
 *
 *   Line anchoring fails routinely — GitHub rejects a line outside the diff
 *   hunk with a 422, and a finding about a function whose body did not change
 *   but whose caller did has no line to attach to. So anchoring failure
 *   DEGRADES to the summary comment; it never discards. And a degraded finding
 *   reports `anchor-failed`, never `posted`, because reporting it as posted
 *   would make the failure invisible — which from the reader's side is the same
 *   outcome as dropping it.
 *
 * Usage:
 *   pr-inline-comment.js --pr <N> --findings-file <path>
 *                        [--summary-file <path>] [--vcs github|bitbucket]
 *                        [--json] [--quiet] [--dry-run] [--strict]
 *
 * Exit codes (transcribed from tracker-comment.js so this is a drop-in for the
 * same `|| echo "⚠️ …"` subshell idiom):
 *   0  every normal outcome — posted, partial, already, unverifiable, deferred,
 *      no-credentials, no-pr, dry-run — and any unhandled throw
 *   1  a skip, but only under --strict
 *   2  usage error (missing --pr, missing/unreadable/malformed --findings-file,
 *      unknown flag)
 *
 * Contract, reason vocabulary and the re-run rule: pr-inline-comment-contract.md.
 *
 * On dependencies: this file takes NO shared/ dependency beyond
 * defer-mutation.js, for the reason gh-stage.js states — a consumer should not
 * bundle machinery it cannot use. There is no lazy platform require here at all,
 * because both arms are implemented inline in this file.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync, execSync } = require("child_process");
const crypto = require("crypto");

const dm = require("./defer-mutation.js");
const { renderLead } = require("./stakeholder-summary.js");

const GIT_EXEC_OPTS = {
  encoding: "utf-8",
  stdio: ["ignore", "pipe", "ignore"],
};

/**
 * The marker prefix. Deliberately DIFFERENT from tracker-comment.js's
 * `agent-skills-comment:` — an inline comment and an issue comment live in
 * different comment lists and are found by different queries, and sharing a
 * prefix would let a future `grep` for one match the other.
 */
const INLINE_MARKER_PREFIX = "agent-skills-inline:";

/** Heading the degraded findings are collected under in the summary comment. */
const DEGRADED_HEADING =
  "### Findings that could not be anchored to a line in this diff";

const USAGE = `pr-inline-comment — post findings as inline PR comments

Usage:
  pr-inline-comment.js --pr <N> --findings-file <path>
                       [--summary-file <path>] [--vcs github|bitbucket]
                       [--json] [--quiet] [--dry-run] [--strict]

Options:
  --pr, -p           Pull request number. Required.
  --findings-file, -f  Path to a JSON array of findings. Required.
                     Each entry: {path, line, body, side?, id?}
                     A file, never inline bodies: findings quote the code they
                     are about, so they carry backticks, $(…) and newlines.
  --summary-file, -s Optional markdown prepended to the summary comment that
                     carries any findings which could not be anchored.
  --vcs              Force the platform instead of detecting it.
  --json             Emit a JSON result object on stdout.
  --quiet            Suppress informational output.
  --dry-run          Resolve everything, read nothing, write nothing.
  --strict           Exit 1 on a skip instead of 0.
  --help, -h         Show this message.

Exit codes: 0 = every normal outcome, 1 = skip under --strict, 2 = usage error.
`;

// ---------------------------------------------------------------------------
// Output — same shape as tracker-comment.js so a reader of one knows both.
// ---------------------------------------------------------------------------
function makeOutput({ json = false, quiet = false } = {}) {
  return {
    log: (m) => {
      if (!quiet) console.log(m);
    },
    info: (m) => {
      if (!quiet && !json) console.log(m);
    },
    warn: (m) => {
      if (!quiet) console.error(m);
    },
    err: (m) => console.error(m),
    emit: (o) => console.log(JSON.stringify(o)),
  };
}

// ---------------------------------------------------------------------------
// Credential file loading — same candidates and same never-overwrite rule as
// tracker-comment.js and gh-stage.js, so a consumer has one credential location.
// ---------------------------------------------------------------------------
const CREDENTIAL_FILES = [".secrets/tooling.env", ".env"];

function repoRootOf(repoRoot) {
  if (repoRoot) return repoRoot;
  try {
    return execSync("git rev-parse --show-toplevel", GIT_EXEC_OPTS).trim();
  } catch (_) {
    return "";
  }
}

function loadDotEnv(repoRoot) {
  try {
    const root = repoRootOf(repoRoot);
    if (!root) return;
    for (const rel of CREDENTIAL_FILES) {
      const envPath = path.join(root, rel);
      if (!fs.existsSync(envPath)) continue;
      for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const eq = t.indexOf("=");
        if (eq < 1) continue;
        const key = t.slice(0, eq).trim();
        const val = t
          .slice(eq + 1)
          .trim()
          .replace(/^["']|["']$/g, "");
        if (!(key in process.env)) process.env[key] = val;
      }
    }
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Platform detection — the $VCS axis, NOT $TRACKER.
//
// Mirrors resolve-platform.sh's order for the part that matters: an explicit
// flag, then VCS (which resolve-platform.sh exports once a skill has resolved
// it), then the git remote. Unlike tracker-comment.js this DOES sniff the
// remote, because resolve-platform.sh sniffs it for `vcs: auto` too — where a
// PR lives is a property of the remote in a way a tracker is not.
// ---------------------------------------------------------------------------
function resolveVcs(explicit, env = process.env, execImpl = execFileSync) {
  const want = (explicit || env.VCS || "").trim().toLowerCase();
  if (want === "github" || want === "bitbucket") return want;
  if (want)
    throw new Error(`Unknown vcs: "${want}" (expected github|bitbucket)`);
  try {
    const url = execImpl("git", ["remote", "get-url", "origin"], GIT_EXEC_OPTS);
    return /bitbucket\.org/i.test(String(url)) ? "bitbucket" : "github";
  } catch (_) {
    return "github";
  }
}

// ---------------------------------------------------------------------------
// Markers
// ---------------------------------------------------------------------------

/** Eight hex chars of sha1 — enough to separate findings, short enough to read. */
function shortHash(text) {
  return crypto
    .createHash("sha1")
    .update(String(text || ""))
    .digest("hex")
    .slice(0, 8);
}

/** An HTML comment — invisible when rendered on both platforms. */
function markerHtml(id) {
  return `<!-- ${INLINE_MARKER_PREFIX}${id} -->`;
}

/**
 * One compiled marker matcher, shared by both arms. Built once rather than per
 * comment, and from an ESCAPED prefix so the constant can never be read as
 * pattern syntax.
 */
const MARKER_RE = new RegExp(
  `<!--\\s*${INLINE_MARKER_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\s>]+?)\\s*-->`,
);

/**
 * A finding's identity ACROSS RUNS — which is not the same thing as the caller's
 * `id`, and conflating the two broke convergence.
 *
 * Both real producers emit `CR-{n}` / `PC-{n}`, documented in their own prompts
 * as "stable within this run": a per-run ORDINAL. Adopting it as identity means
 * run 2's `CR-1` is a different finding wearing run 1's name — the marker hits,
 * the anchor no longer matches, and the new finding is degraded while a comment
 * about an already-fixed bug sits on the PR forever. So the caller's id is used
 * only as a NAMESPACE, and the body hash is always mixed in: two runs agree on a
 * finding exactly when its text agrees, which is the only signal either producer
 * actually offers.
 */
function findingId(f) {
  const raw = f.id
    ? `${f.id}:${shortHash(f.body)}`
    : // The body hash is not decoration. Without it the derived id is the
      // ANCHOR, so two different findings about the same line share one
      // identity: on a re-run both PATCH the same comment and the second body
      // destroys the first, while both report `updated`. On a first run the
      // collision writes two comments carrying one marker, which then trips the
      // duplicate-marker rule forever. Two findings on one line is ordinary —
      // a null check and a missing await on the same call.
      `${f.path}:${f.line}:${(f.side || "RIGHT").toUpperCase()}:${shortHash(
        f.body,
      )}`;
  // Squeeze anything the marker's own finder cannot match back out. The finder
  // reads `<!-- prefix:([^\s>]+?) -->`, so a caller id containing a space or a
  // `>` would write a marker that can never be found again — and a marker that
  // cannot be found means every re-run posts a duplicate instead of updating.
  return raw.replace(/[\s>]+/g, "_");
}

// ---------------------------------------------------------------------------
// Findings validation
//
// Validated HERE, before the access gate, because a malformed findings file is
// a usage error (exit 2) and must be reported as one whether or not the run
// would have been allowed to reach the network.
// ---------------------------------------------------------------------------
function parseFindings(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`findings file is not valid JSON: ${e.message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error("findings file must contain a JSON array");
  }
  return parsed.map((f, i) => {
    const where = `findings[${i}]`;
    if (!f || typeof f !== "object")
      throw new Error(`${where} is not an object`);
    if (!f.path || typeof f.path !== "string") {
      throw new Error(`${where}.path is required and must be a string`);
    }
    if (!Number.isInteger(f.line) || f.line < 1) {
      throw new Error(
        `${where}.line is required and must be a positive integer`,
      );
    }
    if (!f.body || typeof f.body !== "string" || !f.body.trim()) {
      throw new Error(
        `${where}.body is required and must be a non-empty string`,
      );
    }
    const side = String(f.side || "RIGHT").toUpperCase();
    if (side !== "RIGHT" && side !== "LEFT") {
      throw new Error(`${where}.side must be RIGHT or LEFT, got "${f.side}"`);
    }
    return {
      path: f.path,
      line: f.line,
      side,
      body: f.body.replace(/\r\n/g, "\n").trim(),
      id: f.id ? String(f.id) : "",
    };
  });
}

// ---------------------------------------------------------------------------
// Summary comment assembly — the degradation destination.
// ---------------------------------------------------------------------------
function buildSummaryBody(degraded, summaryPrefix) {
  const parts = [];
  if (summaryPrefix && summaryPrefix.trim()) {
    // THE ESCAPE HATCH WINS OUTRIGHT, and this branch is why the lead is
    // rendered here rather than unconditionally at the top. A caller-supplied
    // summary IS the lead — the review skills write one — so prepending a
    // catalogue lead as well double-leads the comment: two orienting paragraphs
    // before any content, the second contradicting the first whenever the caller
    // summary is about something other than anchoring.
    parts.push(summaryPrefix.trim());
  } else if (degraded.length) {
    // No caller summary, so this comment exists only to carry findings that
    // could not be anchored — which is exactly what `pr-summary` explains.
    //
    // The `else if` is load-bearing. A summary comment with a caller prefix and
    // NO degraded findings must not acquire a paragraph about findings that do
    // not exist; finishRun posts this comment when EITHER is present, so that
    // combination is reachable and was the first thing to get this wrong.
    parts.push(renderLead("pr-summary", { degraded: degraded.length }));
  }
  if (degraded.length) {
    parts.push(DEGRADED_HEADING);
    parts.push(
      degraded.length === 1
        ? "_1 finding is below rather than beside its line. It was not dropped._"
        : `_${degraded.length} findings are below rather than beside their lines. None were dropped._`,
    );
    for (const d of degraded) {
      parts.push(
        `**\`${d.finding.path}:${d.finding.line}\`** — ${d.why}\n\n${d.finding.body}`,
      );
    }
  }
  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// Arg parsing — hand-rolled switch, matching the peer.
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = argv.slice(2);
  // Every value-taking flag fails CLOSED, the rule tracker-comment.js learned
  // the hard way: a missing value that leaves the option undefined turns a
  // conditional off silently, and a flag-shaped value (`--pr --json`) would
  // otherwise swallow the flag the caller parses `reason` from.
  const value = (i, name) => {
    const v = args[i];
    if (v === undefined || v.startsWith("-")) {
      throw new Error(`${name} requires a value`);
    }
    return v;
  };
  const opts = {
    pr: "",
    findingsFile: "",
    summaryFile: "",
    vcs: "",
    json: false,
    quiet: false,
    dryRun: false,
    strict: false,
    help: false,
  };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--pr":
      case "-p":
        opts.pr = value(++i, "--pr");
        break;
      case "--findings-file":
      case "-f":
        opts.findingsFile = value(++i, "--findings-file");
        break;
      case "--summary-file":
      case "-s":
        opts.summaryFile = value(++i, "--summary-file");
        break;
      case "--vcs":
        opts.vcs = value(++i, "--vcs");
        break;
      case "--json":
        opts.json = true;
        break;
      case "--quiet":
        opts.quiet = true;
        break;
      case "--dry-run":
        opts.dryRun = true;
        break;
      case "--strict":
        opts.strict = true;
        break;
      case "--help":
      case "-h":
        opts.help = true;
        break;
      default:
        if (args[i].startsWith("-")) {
          throw new Error(`Unknown option: ${args[i]}`);
        }
    }
  }
  return opts;
}

// ---------------------------------------------------------------------------
// GitHub transport helpers
// ---------------------------------------------------------------------------

function ghAvailable(execImpl) {
  try {
    execImpl("gh", ["auth", "status"], GIT_EXEC_OPTS);
    return true;
  } catch (_) {
    return false;
  }
}

function ghJson(execImpl, args) {
  const out = execImpl("gh", args, GIT_EXEC_OPTS);
  return JSON.parse(String(out || "null"));
}

/**
 * The PR head SHA — `commit_id` on the per-comment form, and required.
 *
 * Emphatically NOT `git rev-parse HEAD`. The local branch can have moved since
 * the PR was pushed, and anchoring a comment to a commit the PR does not
 * contain puts it on a line nobody in the review is looking at.
 */
function ghHeadSha(execImpl, pr) {
  const j = ghJson(execImpl, [
    "pr",
    "view",
    String(pr),
    "--json",
    "headRefOid",
  ]);
  return (j && j.headRefOid) || "";
}

function ghRepoSlug(execImpl) {
  const j = ghJson(execImpl, ["repo", "view", "--json", "owner,name"]);
  const owner = j && j.owner && j.owner.login;
  const name = j && j.name;
  if (!owner || !name) throw new Error("could not resolve owner/repo from gh");
  return `${owner}/${name}`;
}

/**
 * Existing inline review comments, as a Map of marker → {id, count}.
 *
 * The CARDINALITY rule is tracker-comment.js's, transcribed: a marker seen
 * twice stays ambiguous rather than being resolved by taking the first. Adopting
 * the first hides the second forever, which is exactly the silent-loss failure
 * this module exists to prevent.
 */
function ghExistingMarkers(execImpl, slug, pr) {
  // `--slurp` is REQUIRED, not tidiness. `gh api --paginate` emits one JSON
  // document per page — `[…]\n[…]` — which `JSON.parse` rejects outright. Without
  // it, any PR carrying more than one page of review comments (the default page
  // size is 30, and three qa-fix cycles get there) throws here, the whole run
  // degrades to `unverifiable`, and the module silently becomes the summary-only
  // behaviour it was written to replace — on exactly the busiest PRs.
  // `--slurp` wraps the pages in an outer array, so flatten one level.
  const pages = ghJson(execImpl, [
    "api",
    "--paginate",
    "--slurp",
    "-f",
    "per_page=100",
    `/repos/${slug}/pulls/${pr}/comments`,
  ]);
  const list = Array.isArray(pages) ? pages.flat() : [];
  const seen = new Map();
  for (const c of list) {
    const body = String((c && c.body) || "");
    const m = body.match(MARKER_RE);
    if (!m) continue;
    const key = m[1];
    const prev = seen.get(key);
    if (prev) prev.count += 1;
    else
      seen.set(key, {
        id: c.id,
        count: 1,
        line: c.line,
        path: c.path,
        // GitHub sets `position` to null once a comment's anchor falls
        // outside the current diff. It is the only signal that an
        // existing inline comment has gone stale.
        position: c.position === undefined ? undefined : c.position,
      });
  }
  return seen;
}

// ---------------------------------------------------------------------------
// GitHub path
// ---------------------------------------------------------------------------

function isAnchorRejection(message) {
  const m = String(message || "");
  // GitHub says 422 for a line outside the diff. The prose varies across API
  // versions, so match the status AND the two phrasings seen in the wild rather
  // than one brittle string.
  return (
    /\b422\b/.test(m) ||
    /Unprocessable/i.test(m) ||
    /not part of the (pull request|diff)/i.test(m) ||
    /line must be part of the diff/i.test(m)
  );
}

function ghPostBatch(execImpl, slug, pr, sha, entries) {
  const payload = {
    event: "COMMENT",
    commit_id: sha,
    comments: entries.map((e) => ({
      path: e.finding.path,
      line: e.finding.line,
      side: e.finding.side,
      body: `${markerHtml(e.key)}\n${e.finding.body}`,
    })),
  };
  // `--input -` supplies the WHOLE request body. It cannot be combined with
  // `-f` field flags — gh rejects the combination — which is why the body is
  // built as one JSON document and piped in.
  execImpl(
    "gh",
    [
      "api",
      "--method",
      "POST",
      `/repos/${slug}/pulls/${pr}/reviews`,
      "--input",
      "-",
    ],
    {
      ...GIT_EXEC_OPTS,
      input: JSON.stringify(payload),
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
}

function ghPostOne(execImpl, slug, pr, sha, entry) {
  const payload = {
    path: entry.finding.path,
    line: entry.finding.line,
    side: entry.finding.side,
    commit_id: sha,
    body: `${markerHtml(entry.key)}\n${entry.finding.body}`,
  };
  execImpl(
    "gh",
    [
      "api",
      "--method",
      "POST",
      `/repos/${slug}/pulls/${pr}/comments`,
      "--input",
      "-",
    ],
    {
      ...GIT_EXEC_OPTS,
      input: JSON.stringify(payload),
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
}

function ghUpdateOne(execImpl, slug, commentId, entry) {
  execImpl(
    "gh",
    [
      "api",
      "--method",
      "PATCH",
      `/repos/${slug}/pulls/comments/${commentId}`,
      "--input",
      "-",
    ],
    {
      ...GIT_EXEC_OPTS,
      input: JSON.stringify({
        body: `${markerHtml(entry.key)}\n${entry.finding.body}`,
      }),
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
}

function ghPostSummary(execImpl, pr, body) {
  execImpl("gh", ["pr", "comment", String(pr), "--body-file", "-"], {
    ...GIT_EXEC_OPTS,
    input: body,
    stdio: ["pipe", "pipe", "ignore"],
  });
}

async function runGithub({
  args,
  pr,
  findings,
  summaryPrefix,
  output,
  emit,
  execImpl,
  skipCode,
}) {
  if (!ghAvailable(execImpl)) {
    output.info(
      "ℹ️  gh is unavailable or unauthenticated — no comments posted.",
    );
    return emit(
      { posted: 0, reason: "no-credentials", findings: [] },
      skipCode,
    );
  }

  let slug;
  let sha;
  try {
    slug = ghRepoSlug(execImpl);
    sha = ghHeadSha(execImpl, pr);
  } catch (e) {
    output.warn(`⚠️  Could not resolve the pull request: ${e.message}`);
    return emit({ posted: 0, reason: "no-pr", findings: [] }, skipCode);
  }
  if (!sha) {
    output.warn(`⚠️  No pull request #${pr} — nothing to comment on.`);
    return emit({ posted: 0, reason: "no-pr", findings: [] }, skipCode);
  }

  // ── Partition against what is already there ──────────────────────────────
  let existing;
  let markersReadable = true;
  try {
    existing = ghExistingMarkers(execImpl, slug, pr);
  } catch (e) {
    // Unreadable comments means we cannot tell a fresh post from a duplicate.
    // Posting anyway is how a resumed run doubles every comment, so the whole
    // inline pass degrades to the summary — which is delivery without duplication.
    markersReadable = false;
    existing = new Map();
    output.warn(
      `⚠️  Could not read existing review comments on #${pr}: ${e.message}`,
    );
  }

  const results = [];
  const fresh = [];
  const degraded = [];

  for (const f of findings) {
    const key = findingId(f);
    const entry = { key, finding: f };
    if (!markersReadable) {
      degraded.push({ ...entry, why: "existing comments were unreadable" });
      results.push({
        id: key,
        reason: "unverifiable",
        path: f.path,
        line: f.line,
      });
      continue;
    }
    const hit = existing.get(key);
    if (hit && hit.count > 1) {
      output.warn(
        `⚠️  ${key} is marked on ${hit.count} comments — ambiguous, not posting.`,
      );
      // DEGRADE, do not drop. Ambiguity is a reason not to touch the existing
      // comments; it is not a reason to discard the finding. Without this push
      // the finding reached nowhere at all — no inline comment, no summary, and
      // the warning above prints only the key, never the body — which is the
      // one outcome this module exists to prevent. The branch immediately above
      // (unreadable comment list) degrades for exactly the same reason.
      degraded.push({
        ...entry,
        why: `the marker is present on ${hit.count} comments — cannot tell which to update`,
      });
      results.push({
        id: key,
        reason: "unverifiable",
        matches: hit.count,
        path: f.path,
        line: f.line,
      });
      continue;
    }
    if (hit) {
      // The contract's second row: marker found, but the anchor is no longer in
      // the diff → leave the old comment alone and degrade. PATCHing a body is
      // accepted by GitHub whether or not the anchor is still live, so without
      // this check a stale comment is reported `updated` — "landed where it was
      // aimed" — while sitting on a line the diff no longer contains.
      const anchorMoved =
        hit.position === null ||
        (hit.line !== undefined && hit.line !== null && hit.line !== f.line) ||
        (hit.path !== undefined && hit.path !== null && hit.path !== f.path);
      if (anchorMoved) {
        degraded.push({
          ...entry,
          why: "the existing comment's anchor is no longer in this diff",
        });
        results.push({
          id: key,
          reason: "anchor-failed",
          path: f.path,
          line: f.line,
        });
        continue;
      }
      // Marker found and the anchor is still live: update in place. This is the
      // re-run rule, and it is update-in-place precisely BECAUSE resolving and
      // replying to threads is out of scope — a rule that needed either would
      // have contradicted the contract.
      try {
        ghUpdateOne(execImpl, slug, hit.id, entry);
        results.push({
          id: key,
          reason: "updated",
          path: f.path,
          line: f.line,
        });
      } catch (e) {
        degraded.push({
          ...entry,
          why: `could not update the existing comment (${e.message})`,
        });
        results.push({
          id: key,
          reason: "anchor-failed",
          path: f.path,
          line: f.line,
        });
      }
      continue;
    }
    fresh.push(entry);
  }

  // ── Post the fresh ones: batched first, per-comment on rejection ─────────
  let posted = 0;
  if (fresh.length) {
    let batched = false;
    try {
      ghPostBatch(execImpl, slug, pr, sha, fresh);
      batched = true;
      posted += fresh.length;
      for (const e of fresh) {
        results.push({
          id: e.key,
          reason: "posted",
          path: e.finding.path,
          line: e.finding.line,
        });
      }
    } catch (e) {
      // A wholesale ANCHOR rejection says nothing about WHICH finding caused it,
      // so fall back to per-comment posting, which isolates the rejection to the
      // findings that actually earned it instead of losing the whole batch.
      //
      // But fall back ONLY for an anchor rejection. `gh` also exits non-zero when
      // the request was accepted and the RESPONSE was lost (proxy timeout, reset
      // connection). Retrying those blindly posts a second comment per marker,
      // and the next run then sees count > 1 for every key and refuses to post or
      // edit anything — permanently, with nothing to reconcile it. Converging to
      // "never comments again" is worse than one lost batch, so a non-anchor
      // failure degrades to the summary instead.
      if (isAnchorRejection(e.message)) {
        output.info(
          `ℹ️  Batched review rejected (${String(e.message).split("\n")[0]}) — falling back to per-comment.`,
        );
      } else {
        output.warn(
          `⚠️  Batched review failed without an anchor rejection (${String(e.message).split("\n")[0]}) — degrading rather than risking duplicates.`,
        );
        for (const e2 of fresh) {
          degraded.push({
            ...e2,
            why: "the batched review call failed and a retry could duplicate it",
          });
          results.push({
            id: e2.key,
            reason: "anchor-failed",
            path: e2.finding.path,
            line: e2.finding.line,
          });
        }
        fresh.length = 0;
      }
    }
    if (!batched) {
      for (const e of fresh) {
        try {
          ghPostOne(execImpl, slug, pr, sha, e);
          posted += 1;
          results.push({
            id: e.key,
            reason: "posted",
            path: e.finding.path,
            line: e.finding.line,
          });
        } catch (err) {
          const why = isAnchorRejection(err.message)
            ? "the line is not part of this diff"
            : // NOT an anchoring problem — a 403, a 500 or a rate-limit. Saying
              // "rejected the anchor" here sends a human looking at the diff for
              // a cause that is not there.
              `the platform rejected the request (${String(err.message).split("\n")[0]})`;
          degraded.push({ ...e, why });
          results.push({
            id: e.key,
            reason: "anchor-failed",
            path: e.finding.path,
            line: e.finding.line,
          });
        }
      }
    }
  }

  return finishRun({
    degraded,
    summaryPrefix,
    posted,
    results,
    output,
    emit,
    skipCode,
    strict: args.strict,
    postSummary: (body) => ghPostSummary(execImpl, pr, body),
  });
}

// ---------------------------------------------------------------------------
// Shared tail — degradation delivery, then the run-level reason.
//
// Both platforms end here, because "a degraded finding still reaches the
// reader" is the invariant, not a GitHub detail.
// ---------------------------------------------------------------------------
async function finishRun({
  degraded,
  summaryPrefix,
  posted,
  results,
  output,
  emit,
  skipCode,
  strict,
  postSummary,
}) {
  let summaryPosted = false;
  if (degraded.length || (summaryPrefix && summaryPrefix.trim())) {
    const body = buildSummaryBody(degraded, summaryPrefix);
    try {
      // AWAITED, and that is load-bearing. The Bitbucket arm's postSummary is
      // async: calling it without awaiting lets a rejection escape this catch
      // as an unhandled rejection while `summaryPosted = true` runs anyway — so
      // a Bitbucket run whose summary comment failed would report success and
      // silently lose every degraded finding. That is precisely the invariant
      // this module exists to hold, defeated by a missing keyword.
      await postSummary(body);
      summaryPosted = true;
    } catch (e) {
      // The findings still have to reach a human. stderr is the last channel
      // that cannot fail, so use it before reporting the failure.
      output.warn(`⚠️  Could not post the summary comment: ${e.message}`);
      output.warn("── Undelivered findings ──");
      for (const d of degraded) {
        output.warn(`${d.finding.path}:${d.finding.line} — ${d.finding.body}`);
      }
      return emit(
        {
          posted,
          degraded: degraded.length,
          reason: "summary-failed",
          summaryPosted: false,
          findings: results,
        },
        strict ? 1 : 0,
      );
    }
  }

  const unverifiable = results.filter(
    (r) => r.reason === "unverifiable",
  ).length;
  const updated = results.filter((r) => r.reason === "updated").length;
  let reason;
  // Compare against the RESULTS, not against `degraded`. The cycle-1 fix made
  // every `unverifiable` site also degrade (correctly — the finding must still be
  // delivered), which silently made the old `!degraded.length` test unreachable:
  // the run-level `unverifiable` in the contract's table could never be emitted,
  // and `--strict` could never report the one condition it exists to report.
  if (unverifiable && unverifiable === results.length) reason = "unverifiable";
  else if (degraded.length || unverifiable) reason = "partial";
  else if (!posted && updated) reason = "already";
  else reason = "posted";

  output.info(
    `💬 ${posted} inline, ${updated} updated, ${degraded.length} degraded to the summary comment.`,
  );
  return emit(
    {
      posted,
      updated,
      degraded: degraded.length,
      reason,
      summaryPosted,
      findings: results,
    },
    reason === "unverifiable" ? skipCode : 0,
  );
}

// ---------------------------------------------------------------------------
// Bitbucket path
//
// `gh` cannot address a Bitbucket remote at all — `gh repo view` fails outright
// — so this is the REST API, not a degraded gh path. Single-shot by design:
// there is no Bitbucket retry helper in this repository and this file does not
// invent one. A transient failure degrades that finding to the summary comment,
// which is the correct behaviour for an anchoring failure anyway.
// ---------------------------------------------------------------------------

/**
 * Resolve the Bitbucket REST credential, mirroring bitbucket-auth.sh's order
 * and variable names exactly so a consumer configures ONE set of variables.
 *   BITBUCKET_ACCESS_TOKEN            → Bearer
 *   BITBUCKET_USERNAME + API token    → Basic
 * BITBUCKET_APP_PASSWORD is honoured as a legacy fallback for the Basic token.
 */
function bbAuthHeader(env = process.env) {
  if (env.BITBUCKET_ACCESS_TOKEN) {
    return { scheme: "bearer", header: `Bearer ${env.BITBUCKET_ACCESS_TOKEN}` };
  }
  const basic = env.BITBUCKET_API_TOKEN || env.BITBUCKET_APP_PASSWORD || "";
  if (env.BITBUCKET_USERNAME && basic) {
    const enc = Buffer.from(`${env.BITBUCKET_USERNAME}:${basic}`).toString(
      "base64",
    );
    return { scheme: "basic", header: `Basic ${enc}` };
  }
  return { scheme: "none", header: "" };
}

/** workspace/repo from the origin remote, portable across ssh and https forms. */
function bbSlug(execImpl) {
  const url = String(
    execImpl("git", ["remote", "get-url", "origin"], GIT_EXEC_OPTS) || "",
  ).trim();
  const m = url.match(/bitbucket\.org[:/](.+?)(?:\.git)?$/i);
  if (!m) throw new Error(`origin is not a Bitbucket remote: ${url}`);
  const parts = m[1].split("/").filter(Boolean);
  if (parts.length < 2)
    throw new Error(`could not parse workspace/repo from ${url}`);
  return { workspace: parts[0], repo: parts[parts.length - 1] };
}

const BB_API = "https://api.bitbucket.org/2.0";

async function runBitbucket({
  args,
  pr,
  findings,
  summaryPrefix,
  output,
  emit,
  execImpl,
  env,
  fetchImpl,
  skipCode,
}) {
  const auth = bbAuthHeader(env);
  if (auth.scheme === "none") {
    output.info(
      "ℹ️  No Bitbucket credential (BITBUCKET_ACCESS_TOKEN, or BITBUCKET_USERNAME + " +
        "BITBUCKET_API_TOKEN) — no comments posted.",
    );
    return emit(
      { posted: 0, reason: "no-credentials", findings: [] },
      skipCode,
    );
  }

  let slug;
  try {
    slug = bbSlug(execImpl);
  } catch (e) {
    output.warn(`⚠️  ${e.message}`);
    return emit({ posted: 0, reason: "no-pr", findings: [] }, skipCode);
  }

  const doFetch = fetchImpl || globalThis.fetch;
  const base = `${BB_API}/repositories/${slug.workspace}/${slug.repo}/pullrequests/${pr}`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: auth.header,
  };

  const post = async (body) => {
    const res = await doFetch(`${base}/comments`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!res || !res.ok) {
      const status = res ? res.status : "no response";
      let detail = "";
      if (res && typeof res.text === "function") {
        try {
          detail = await res.text();
        } catch (_) {}
      }
      throw new Error(`${status} ${String(detail).slice(0, 200)}`);
    }
    return res;
  };

  // ── Read back what is already there ──────────────────────────────────────
  // Without this the arm writes a marker nothing ever reads, so every re-run
  // POSTs a fresh copy of every finding — and a qa-fix loop runs this five
  // times. The contract states the re-run rule platform-neutrally, and the peer
  // this file mirrors scans on both arms; an arm that only writes markers is
  // not implementing the rule, it is decorating its comments.
  const existing = new Map();
  let markersReadable = true;
  try {
    let next = `${base}/comments?pagelen=100`;
    while (next) {
      const res = await doFetch(next, { headers });
      if (!res || !res.ok) throw new Error(`HTTP ${res ? res.status : "none"}`);
      const page = await res.json();
      for (const c of (page && page.values) || []) {
        const raw = String((c && c.content && c.content.raw) || "");
        const m = raw.match(MARKER_RE);
        if (!m) continue;
        const prev = existing.get(m[1]);
        if (prev) prev.count += 1;
        // Capture the inline coordinates. The claim that Bitbucket "has no
        // equivalent of GitHub's position: null" is true and beside the point —
        // the two arms of the staleness check that actually fire are the path
        // and line comparisons, and Bitbucket returns inline.path / inline.to on
        // every inline comment. Without these the arm would PUT a moved comment
        // and report `updated`, which is the misreport the invariant forbids,
        // while GitHub degrades on the identical state.
        else
          existing.set(m[1], { id: c.id, count: 1, inline: c.inline || null });
      }
      next = page && page.next ? page.next : null;
    }
  } catch (e) {
    markersReadable = false;
    output.warn(
      `⚠️  Could not read existing comments on PR #${pr}: ${e.message}`,
    );
  }

  const results = [];
  const degraded = [];
  let posted = 0;

  for (const f of findings) {
    const key = findingId(f);

    if (!markersReadable) {
      // Same rule as the GitHub arm: posting blind is how a resume doubles
      // every comment, so degrade — delivery without duplication.
      degraded.push({
        key,
        finding: f,
        why: "existing comments were unreadable",
      });
      results.push({
        id: key,
        reason: "unverifiable",
        path: f.path,
        line: f.line,
      });
      continue;
    }

    const hit = existing.get(key);
    if (hit && hit.count > 1) {
      output.warn(
        `⚠️  ${key} is marked on ${hit.count} comments — ambiguous, not posting.`,
      );
      degraded.push({
        key,
        finding: f,
        why: `the marker is present on ${hit.count} comments — cannot tell which to update`,
      });
      results.push({
        id: key,
        reason: "unverifiable",
        matches: hit.count,
        path: f.path,
        line: f.line,
      });
      continue;
    }

    if (hit) {
      const at = hit.inline || {};
      const atLine = at.to !== undefined ? at.to : at.from;
      const moved =
        !hit.inline ||
        (at.path !== undefined && at.path !== f.path) ||
        (atLine !== undefined && atLine !== f.line);
      if (moved) {
        // Same rule as the GitHub arm. A marker on a comment that is no longer
        // where this finding points — or on a conversation comment with no
        // inline block at all — must not be rewritten in place and called
        // `updated`.
        degraded.push({
          key,
          finding: f,
          why: "the existing comment's anchor is no longer where this finding points",
        });
        results.push({
          id: key,
          reason: "anchor-failed",
          path: f.path,
          line: f.line,
        });
        continue;
      }
      try {
        const res = await doFetch(`${base}/comments/${hit.id}`, {
          method: "PUT",
          headers,
          body: JSON.stringify({
            content: { raw: `${markerHtml(key)}\n${f.body}` },
          }),
        });
        if (!res || !res.ok) {
          throw new Error(`HTTP ${res ? res.status : "no response"}`);
        }
        results.push({
          id: key,
          reason: "updated",
          path: f.path,
          line: f.line,
        });
      } catch (e) {
        degraded.push({
          key,
          finding: f,
          why: `could not update the existing comment (${e.message})`,
        });
        results.push({
          id: key,
          reason: "anchor-failed",
          path: f.path,
          line: f.line,
        });
      }
      continue;
    }

    // `to` is the DESTINATION-file line; `from` anchors the source side, which
    // is what a finding about a DELETED line needs. Using `to` for a deletion
    // silently anchors to whatever now occupies that line number.
    const inline =
      f.side === "LEFT"
        ? { path: f.path, from: f.line }
        : { path: f.path, to: f.line };
    try {
      await post({
        content: { raw: `${markerHtml(key)}\n${f.body}` },
        inline,
      });
      posted += 1;
      results.push({ id: key, reason: "posted", path: f.path, line: f.line });
    } catch (e) {
      degraded.push({
        key,
        finding: f,
        why: `Bitbucket rejected the anchor (${String(e.message).split("\n")[0]})`,
      });
      results.push({
        id: key,
        reason: "anchor-failed",
        path: f.path,
        line: f.line,
      });
    }
  }

  return finishRun({
    degraded,
    summaryPrefix,
    posted,
    results,
    output,
    emit,
    skipCode,
    strict: args.strict,
    postSummary: async (body) => {
      await post({ content: { raw: body } });
    },
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function run({
  argv = process.argv,
  execImpl = execFileSync,
  repoRoot = "",
  fetchImpl = undefined,
  env = process.env,
} = {}) {
  const root = repoRootOf(repoRoot);

  // Snapshot the access keys BEFORE loadDotEnv, and all three. The order is
  // load-bearing, and the reasoning is gh-stage.js's transcribed: a .env line
  // must not be able to loosen the mode, and capturing the mode but not
  // SKILLS_CONFIG_FILE would leave the config path redirectable — the door the
  // snapshot exists to shut.
  const accessEnv = {
    ACCESS_TRACKER: env.ACCESS_TRACKER,
    AGENT_SKILLS_ACCESS_TRACKER: env.AGENT_SKILLS_ACCESS_TRACKER,
    SKILLS_CONFIG_FILE: env.SKILLS_CONFIG_FILE,
  };

  loadDotEnv(root);

  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    console.error(`Error: ${e.message}`);
    console.error(USAGE);
    return { exitCode: 2 };
  }

  const output = makeOutput({ json: args.json, quiet: args.quiet });

  if (args.help) {
    output.log(USAGE);
    return { exitCode: 0 };
  }

  const emit = (payload, exitCode) => {
    if (args.json) output.emit({ ...payload, pr: args.pr, exitCode });
    return { exitCode, ...payload };
  };

  // ── USAGE VALIDATION ──────────────────────────────────────────────────────
  if (!args.pr || !/^\d+$/.test(String(args.pr).trim())) {
    output.err("Error: --pr is required and must be a number");
    output.err(USAGE);
    return { exitCode: 2 };
  }
  if (!args.findingsFile) {
    output.err("Error: --findings-file is required");
    output.err(USAGE);
    return { exitCode: 2 };
  }

  let findings;
  try {
    findings = parseFindings(fs.readFileSync(args.findingsFile, "utf-8"));
  } catch (e) {
    output.err(`Error: --findings-file "${args.findingsFile}": ${e.message}`);
    return { exitCode: 2 };
  }

  let summaryPrefix = "";
  if (args.summaryFile) {
    try {
      summaryPrefix = fs
        .readFileSync(args.summaryFile, "utf-8")
        .replace(/\r\n/g, "\n");
    } catch (e) {
      output.err(
        `Error: cannot read --summary-file "${args.summaryFile}": ${e.message}`,
      );
      return { exitCode: 2 };
    }
  }

  let vcs;
  try {
    vcs = resolveVcs(args.vcs, env, execImpl);
  } catch (e) {
    output.err(`Error: ${e.message}`);
    return { exitCode: 2 };
  }

  const skipCode = args.strict ? 1 : 0;
  const pr = String(args.pr).trim();

  // An empty findings list is a no-op, not an error. A review with no findings
  // is the good outcome, and making the caller branch on it would put the check
  // in every call site instead of here.
  //
  // This sits ABOVE the access gate deliberately and narrowly: it fires only
  // when there is nothing to post at all, so there is no mutation for the gate
  // to defer. A run with a summary but no findings does NOT take this branch —
  // it has something to say, and under a restricted mode that something must be
  // journalled rather than discarded.
  if (!findings.length && !summaryPrefix.trim()) {
    output.info("ℹ️  No findings to post.");
    return emit({ posted: 0, reason: "posted", findings: [] }, 0);
  }

  // ── ACCESS GATE ───────────────────────────────────────────────────────────
  //
  // Placement is the whole point, exactly as in tracker-comment.js and
  // gh-stage.js. Everything above is local — arg parsing and two file reads.
  // Everything below reaches out. The gate sits between them, so a gated run
  // demonstrably attempts no network call. `--dry-run` is exempt because it
  // performs no mutation.
  //
  // The comparison is `!== "full"`, never truthiness: an unset variable must
  // read as `full`, or this CLI silently stops commenting everywhere.
  let access;
  try {
    access = dm.resolveAccessTracker(accessEnv, { cwd: root || process.cwd() });
  } catch (e) {
    output.err(`Error: ${e.message}`);
    return { exitCode: 2 };
  }

  if (access !== "full" && !args.dryRun) {
    const kind =
      vcs === "bitbucket" ? "bitbucket.pr.comment" : "github.pr.comment";
    const records = [];
    for (const f of findings) {
      const key = findingId(f);
      try {
        // One record PER FINDING, not one for the batch. The journal's
        // fingerprint hashes command.stdin, so per-finding records stay
        // distinct; a single batched record would collapse N findings into one
        // and lose N-1 of them — the drop this module exists to prevent, just
        // relocated into the handover.
        const rec = dm.defer(
          {
            kind,
            system: vcs,
            access,
            intent: `Inline comment on PR #${pr} at ${f.path}:${f.line}`,
            target: {
              pr,
              issue: pr,
              // `inline: true` is what tells handover-verify this record cannot
              // be read back from the PR's conversation comments. Without it the
              // verifier reports every posted inline comment as outstanding.
              inline: true,
              url: `pull request #${pr}`,
              ui_url: `pull request #${pr} — ${f.path}:${f.line}`,
            },
            desired: firstLineOf(f.body),
            manual: {
              deepLink: `pull request #${pr}`,
              ui: `Open the PR → Files changed → ${f.path} line ${f.line} → Comment → Paste → Save`,
              fields: [{ name: "Comment", value: f.body }],
            },
            command: {
              argv: ["pr-inline-comment", vcs, pr, f.path, String(f.line)],
              stdin: f.body,
            },
            skill: "pr-inline-comment",
          },
          { cwd: root || process.cwd() },
        );
        records.push(rec.id);
      } catch (e) {
        // A journal we cannot write is a WARNING, never a licence to perform
        // the mutation anyway. Same rule as tracker-comment.js and gh-stage.js.
        output.warn(
          `⚠️  Could not record the deferred comment for ${key}: ${e.message}`,
        );
      }
    }
    // The summary body is a comment too. Journalling only the findings means a
    // run invoked with --summary-file and no anchorable findings defers with an
    // empty record list and the summary text is discarded silently.
    if (summaryPrefix && summaryPrefix.trim()) {
      try {
        const rec = dm.defer(
          {
            kind,
            system: vcs,
            access,
            intent: `Summary comment on PR #${pr}`,
            target: {
              pr,
              issue: pr,
              url: `pull request #${pr}`,
              ui_url: `pull request #${pr}`,
            },
            desired: firstLineOf(summaryPrefix),
            manual: {
              deepLink: `pull request #${pr}`,
              ui: "Open the PR → Comment → Paste → Save",
              fields: [{ name: "Comment", value: summaryPrefix }],
            },
            command: {
              argv: ["pr-inline-comment", vcs, pr, "--summary"],
              stdin: summaryPrefix,
            },
            skill: "pr-inline-comment",
          },
          { cwd: root || process.cwd() },
        );
        records.push(rec.id);
      } catch (e) {
        output.warn(`⚠️  Could not record the deferred summary: ${e.message}`);
      }
    }
    output.info(
      `⏸️  access.tracker=${access} — not commenting on #${pr}; recorded ${records.length} record(s).`,
    );
    return emit(
      { posted: 0, reason: "deferred", access, records, findings: [] },
      0,
    );
  }

  if (args.dryRun) {
    output.info(
      `🔎 dry-run — would post ${findings.length} inline comment(s) on #${pr} via ${vcs}.`,
    );
    return emit(
      {
        posted: 0,
        reason: "dry-run",
        vcs,
        findings: findings.map((f) => ({
          id: findingId(f),
          reason: "dry-run",
          path: f.path,
          line: f.line,
        })),
      },
      0,
    );
  }

  return vcs === "bitbucket"
    ? runBitbucket({
        args,
        pr,
        findings,
        summaryPrefix,
        output,
        emit,
        execImpl,
        env,
        fetchImpl,
        skipCode,
      })
    : runGithub({
        args,
        pr,
        findings,
        summaryPrefix,
        output,
        emit,
        execImpl,
        skipCode,
      });
}

/** First non-empty line, trimmed of markdown marks — the record's `desired`. */
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

module.exports = {
  run,
  MARKER_RE,
  parseArgs,
  bbAuthHeader,
  bbSlug,
  runBitbucket,
  firstLineOf,
  isAnchorRejection,
  runGithub,
  finishRun,
  ghAvailable,
  ghHeadSha,
  ghRepoSlug,
  ghExistingMarkers,
  makeOutput,
  loadDotEnv,
  repoRootOf,
  resolveVcs,
  markerHtml,
  findingId,
  parseFindings,
  buildSummaryBody,
  INLINE_MARKER_PREFIX,
  DEGRADED_HEADING,
  USAGE,
};

if (require.main === module) {
  // Any unhandled throw exits 0, matching the peers: a pipeline step runs inside
  // a shell, and killing the run because a COMMENT failed would trade a missing
  // comment for a stopped pipeline.
  // `process.exitCode` and return — never `process.exit()`. Exiting immediately
  // after a write truncates it at ~64KB when the caller pipes us
  // (bug.3.stdout-truncation-on-exit), and this CLI's `--json` payload grows
  // with the finding count, so it is exactly the shape that gets cut off.
  // tracker-comment.js still uses process.exit() and is on the guard's
  // KNOWN_UNMIGRATED allowlist; mirroring it here would have imported a legacy
  // shape into a new file, which is what that guard exists to stop.
  run()
    .then((r) => {
      process.exitCode = r && r.exitCode ? r.exitCode : 0;
    })
    .catch((e) => {
      console.error(`⚠️  pr-inline-comment: ${e.message}`);
      process.exitCode = 0;
    });
}
