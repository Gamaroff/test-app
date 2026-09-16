#!/usr/bin/env node
// AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/handover-verify.js. Regenerate via `npm run bundle`.
// ---------------------------------------------------------------------------
// handover-verify.js — the read-only verification pass over a deferred-mutation
// journal (task.57).
//
// For each record it runs a per-kind READ recipe against the live tracker and
// derives one of four states:
//
//   satisfied     the read matched the desired value — tick it, never delete it
//   pending       the read did not match, or the kind has no read defined
//   divergent     the read found a value that is neither the desired value nor
//                 the pre-action baseline — someone moved it somewhere else
//   unverifiable  the read failed, was ambiguous (2+ matches), or the kind has
//                 no reliable read
//
// TWO INVARIANTS, BOTH MUTATION-PROVEN IN THE SUITE:
//
//   NO MUTATION EVER REACHES THE NETWORK. Every argv is checked against a
//   read-only allowlist before exec; anything else is refused in-process and
//   the record resolves to `unverifiable`. The tests drive this file with an
//   exec stub that THROWS on any mutating argv.
//
//   AMBIGUITY NEVER COERCES TO SATISFIED. Two candidate matches is
//   `unverifiable`, full stop. The lineage is the "picked To Do because it was
//   first" incident: on 2+ matches, do not guess.
//
// The pre-action baseline lives in the record's own `observed` field: the FIRST
// verification pass that finds the value ≠ desired stores what it saw. A later
// pass that reads a third value can then say `divergent` instead of guessing.
//
// Idempotence: when a re-verification observes the same value and derives the
// same state as the stored `verification`, the stored one is kept verbatim —
// including its timestamp — so reconciling twice produces byte-identical
// artifacts.
//
// Usage (read-only, writes nothing anywhere):
//   node handover-verify.js --journal .claude/state/tracker-actions.jsonl [--json]
//   node handover-verify.js --sidecar docs/tasks/task.57.x/task.57.handover.1.x.json [--json]
// ---------------------------------------------------------------------------
"use strict";

const { execFileSync } = require("child_process");

const dm = require("./defer-mutation.js");

const STATES = Object.freeze([
  "satisfied",
  "pending",
  "divergent",
  "unverifiable",
]);

// The comment idempotency marker from tracker-comment.js. Duplicated rather
// than imported for the same reason tracker-comment.js duplicates it from
// jira-sync.js: the two files ship in different skills' references/ and a
// cross-require would break every bundled install.
const COMMENT_MARKER_PREFIX = "agent-skills-comment:";

// ---------------------------------------------------------------------------
// Read-only guard — the invariant that makes "read-only holds a credential"
// defensible. Every recipe's argv passes through here before exec.
// ---------------------------------------------------------------------------

/**
 * True when the argv is one of the known read-only shapes. Fail closed: an
 * argv this function does not recognise is NOT executed — the caller resolves
 * the record to `unverifiable` instead.
 */
function isReadOnlyArgv(argv) {
  if (!Array.isArray(argv) || argv.length === 0) return false;
  const [cmd, ...rest] = argv.map(String);

  if (cmd === "git") return rest[0] === "ls-remote" || rest[0] === "rev-parse";

  if (cmd === "gh") {
    const [group, verb] = rest;
    if (group === "issue" || group === "pr")
      return verb === "view" || verb === "list";
    if (group === "api") {
      // A bare `gh api <path>` is a GET. Any explicit method other than GET,
      // and any field flag OUTSIDE a graphql query, is a mutation shape.
      // The field-flag set covers every spelling gh accepts: -f/--raw-field
      // (string), -F/--field (typed), and --input (request body from a file) —
      // each of these makes gh api POST.
      const FIELD_FLAGS = ["-f", "--raw-field", "-F", "--field"];
      const isGraphql = rest.includes("graphql");
      for (let i = 1; i < rest.length; i++) {
        const a = rest[i];
        if (a === "-X" || a === "--method") {
          if (String(rest[i + 1]).toUpperCase() !== "GET") return false;
        }
        if (a === "--input") return false; // body from file — always a mutation shape
        if (!isGraphql && FIELD_FLAGS.includes(a)) return false;
        if (isGraphql && FIELD_FLAGS.includes(a)) {
          // A graphql document that contains `mutation` anywhere is refused —
          // cheap, and the only graphql this file builds is a query. Scan the
          // value regardless of which field flag carried it.
          if (/\bmutation\b/i.test(String(rest[i + 1] || ""))) return false;
        }
      }
      return true;
    }
    return false;
  }

  return false;
}

/** Throws unless the argv is read-only. The exec path calls this unconditionally. */
function assertReadOnlyArgv(argv) {
  if (!isReadOnlyArgv(argv)) {
    throw new Error(
      `handover-verify: refusing to execute non-read-only argv: ${JSON.stringify(argv)}. ` +
        `The verification pass may only read.`,
    );
  }
}

// ---------------------------------------------------------------------------
// IO — injectable so the suite can prove no read escapes the allowlist and no
// mutation exists to escape at all.
// ---------------------------------------------------------------------------

function defaultExec(argv) {
  try {
    const stdout = execFileSync(argv[0], argv.slice(1), {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
    });
    return { status: 0, stdout };
  } catch (e) {
    return {
      status: typeof e.status === "number" ? e.status : 1,
      stdout: e.stdout ? String(e.stdout) : "",
      error: e.message,
    };
  }
}

function makeIo(opts = {}) {
  const env = opts.env || process.env;
  const rawExec = opts.execImpl || defaultExec;
  return {
    env,
    now: opts.now || (() => new Date().toISOString().replace(/\.\d+Z$/, "Z")),
    fetchImpl: opts.fetchImpl || (typeof fetch === "function" ? fetch : null),
    exec(argv) {
      assertReadOnlyArgv(argv); // the gate — before ANY exec, stubbed or real
      return rawExec(argv);
    },
  };
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function norm(v) {
  return String(v === undefined || v === null ? "" : v)
    .trim()
    .toLowerCase();
}

function eq(a, b) {
  return norm(a) === norm(b);
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Extract the full idempotency marker from a comment body, or null. */
function markerFrom(body) {
  const s = String(body || "");
  const html = s.match(/<!--\s*(agent-skills-comment:[a-z0-9._-]+)\s*-->/i);
  if (html) return html[1];
  const text = s.match(/↳\s*(agent-skills-comment:[a-z0-9._-]+)/);
  if (text) return text[1];
  return null;
}

/** First non-empty, non-marker line of a body — the coarse heuristic key. */
function heuristicLine(body) {
  for (const line of String(body || "").split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (t.includes(COMMENT_MARKER_PREFIX)) continue;
    return t;
  }
  return "";
}

function jiraAuth(env) {
  const url = String(env.JIRA_URL || "").replace(/\/+$/, "");
  const email = env.JIRA_USER_EMAIL || "";
  const token = env.JIRA_API_TOKEN || "";
  if (!url || !email || !token) return null;
  return {
    url,
    header: `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`,
  };
}

/** GET a Jira REST path. Returns {json} or {error}. Reads only — GET is hardcoded. */
async function jiraGet(io, pathname) {
  const auth = jiraAuth(io.env);
  if (!auth) return { error: "no Jira credentials (JIRA_URL/EMAIL/TOKEN)" };
  if (!io.fetchImpl) return { error: "no fetch implementation available" };
  try {
    const res = await io.fetchImpl(`${auth.url}${pathname}`, {
      method: "GET",
      headers: { Authorization: auth.header, Accept: "application/json" },
    });
    if (!res.ok) return { error: `HTTP ${res.status} reading ${pathname}` };
    return { json: await res.json() };
  } catch (e) {
    return { error: `read failed: ${e.message}` };
  }
}

// ---------------------------------------------------------------------------
// Recipes — one READ per kind that has one.
//
// A recipe returns:
//   { read: "value",     current, detail }   comparable current state
//   { read: "existence", exists, count, current, detail }
//   { error: "…" }                           read failed → unverifiable
//   { ambiguous: true, count, detail }       2+ matches  → unverifiable
//
// A kind ABSENT from this table has no read defined → `pending` (the checklist
// stays honest: unticked, the action still wanted). A kind mapped to
// `unreliable` has no RELIABLE read → `unverifiable` ("check by hand").
// ---------------------------------------------------------------------------

const UNRELIABLE = Symbol("no-reliable-read");

function desiredStatus(rec) {
  const d = rec.desired || {};
  return d.status !== undefined ? d.status : d.state;
}

async function readCommentMarker(io, rec, listArgv, extractBodies) {
  const marker = markerFrom(rec.command && rec.command.stdin);
  const r = io.exec(listArgv);
  if (r.status !== 0 || !r.stdout)
    return { error: r.error || "comment list unreadable" };
  const parsed = parseJson(r.stdout);
  if (!parsed) return { error: "comment list unparsable" };
  const bodies = extractBodies(parsed);

  if (marker) {
    const hits = bodies.filter((b) => String(b).includes(marker)).length;
    if (hits === 1)
      return { read: "existence", exists: true, count: 1, current: "posted" };
    if (hits === 0) return { read: "existence", exists: false, count: 0 };
    return {
      ambiguous: true,
      count: hits,
      detail: `${hits} comments carry marker ${marker}`,
    };
  }

  // No marker in the recorded body — a human may have retyped the comment.
  // Coarse heuristic: match on the first content line. More than one match is
  // `unverifiable`, never `satisfied`.
  const line = heuristicLine(rec.command && rec.command.stdin);
  if (!line) return { error: "no marker and no comparable body line" };
  const hits = bodies.filter((b) => String(b).includes(line)).length;
  if (hits === 1)
    return {
      read: "existence",
      exists: true,
      count: 1,
      current: "posted",
      detail: "heuristic match (no marker)",
    };
  if (hits === 0) return { read: "existence", exists: false, count: 0 };
  return {
    ambiguous: true,
    count: hits,
    detail: `${hits} comments match the body heuristically`,
  };
}

const RECIPES = {
  // ── GitHub ────────────────────────────────────────────────────────────────

  async "github.issue.close"(io, rec) {
    const r = io.exec([
      "gh",
      "issue",
      "view",
      String(rec.target.issue),
      "--json",
      "state",
    ]);
    if (r.status !== 0) return { error: r.error || "issue unreadable" };
    const j = parseJson(r.stdout);
    if (!j) return { error: "issue state unparsable" };
    return { read: "value", current: j.state, desired: "CLOSED" };
  },

  async "github.issue.reopen"(io, rec) {
    const r = io.exec([
      "gh",
      "issue",
      "view",
      String(rec.target.issue),
      "--json",
      "state",
    ]);
    if (r.status !== 0) return { error: r.error || "issue unreadable" };
    const j = parseJson(r.stdout);
    if (!j) return { error: "issue state unparsable" };
    return { read: "value", current: j.state, desired: "OPEN" };
  },

  async "github.issue.comment"(io, rec) {
    return readCommentMarker(
      io,
      rec,
      ["gh", "issue", "view", String(rec.target.issue), "--json", "comments"],
      (j) => (Array.isArray(j.comments) ? j.comments.map((c) => c.body) : []),
    );
  },

  async "github.pr.comment"(io, rec) {
    // An INLINE comment (target.inline) lives under /pulls/{n}/comments and never
    // appears in `gh pr view --json comments`, which returns CONVERSATION
    // comments only. Reading it there would report every posted inline comment
    // as still outstanding — and under `--apply` re-post it, duplicating the
    // lot. There is no read-only recipe for it here, so say so honestly:
    // "cannot confirm" is the safe direction over "not done".
    if (rec.target && rec.target.inline) return UNRELIABLE;
    return readCommentMarker(
      io,
      rec,
      [
        "gh",
        "pr",
        "view",
        String(rec.target.pr || rec.target.issue),
        "--json",
        "comments",
      ],
      (j) => (Array.isArray(j.comments) ? j.comments.map((c) => c.body) : []),
    );
  },

  async "github.issue.create"(io, rec) {
    const title = (rec.desired && rec.desired.title) || rec.target.name;
    if (!title) return { error: "no title recorded to search for" };
    const r = io.exec([
      "gh",
      "issue",
      "list",
      "--search",
      `in:title "${title}"`,
      "--state",
      "all",
      "--json",
      "number,title",
    ]);
    if (r.status !== 0) return { error: r.error || "issue search failed" };
    const j = parseJson(r.stdout);
    if (!Array.isArray(j)) return { error: "issue search unparsable" };
    const hits = j.filter((i) => eq(i.title, title));
    if (hits.length === 1)
      return {
        read: "existence",
        exists: true,
        count: 1,
        current: `#${hits[0].number}`,
      };
    if (hits.length === 0)
      return { read: "existence", exists: false, count: 0 };
    return {
      ambiguous: true,
      count: hits.length,
      detail: `${hits.length} issues share the title`,
    };
  },

  async "github.pr.create"(io, rec) {
    const branch = (rec.desired && rec.desired.head) || rec.run;
    if (!branch) return { error: "no head branch recorded to search for" };
    const r = io.exec([
      "gh",
      "pr",
      "list",
      "--head",
      String(branch),
      "--state",
      "all",
      "--json",
      "number",
    ]);
    if (r.status !== 0) return { error: r.error || "pr search failed" };
    const j = parseJson(r.stdout);
    if (!Array.isArray(j)) return { error: "pr search unparsable" };
    if (j.length === 1)
      return {
        read: "existence",
        exists: true,
        count: 1,
        current: `#${j[0].number}`,
      };
    if (j.length === 0) return { read: "existence", exists: false, count: 0 };
    return {
      ambiguous: true,
      count: j.length,
      detail: `${j.length} PRs from head ${branch}`,
    };
  },

  async "github.pr.merge"(io, rec) {
    const r = io.exec([
      "gh",
      "pr",
      "view",
      String(rec.target.pr || rec.target.issue),
      "--json",
      "state",
    ]);
    if (r.status !== 0) return { error: r.error || "pr unreadable" };
    const j = parseJson(r.stdout);
    if (!j) return { error: "pr state unparsable" };
    // MERGED is the desired value; OPEN is the usual pre-action value; CLOSED
    // (without merge) is a third state — exactly what `divergent` names.
    return { read: "value", current: j.state, desired: "MERGED" };
  },

  async "github.milestone.create"(io, rec) {
    const title =
      (rec.desired && rec.desired.title) ||
      rec.target.name ||
      rec.target.milestone;
    if (!title) return { error: "no milestone title recorded" };
    const r = io.exec([
      "gh",
      "api",
      "repos/{owner}/{repo}/milestones?state=all&per_page=100",
    ]);
    if (r.status !== 0) return { error: r.error || "milestone list failed" };
    const j = parseJson(r.stdout);
    if (!Array.isArray(j)) return { error: "milestone list unparsable" };
    const hits = j.filter((m) => eq(m.title, title));
    if (hits.length === 1)
      return {
        read: "existence",
        exists: true,
        count: 1,
        current: `#${hits[0].number}`,
      };
    if (hits.length === 0)
      return { read: "existence", exists: false, count: 0 };
    return {
      ambiguous: true,
      count: hits.length,
      detail: `${hits.length} milestones share the title`,
    };
  },

  async "github.sub-issue.add"(io, rec) {
    const parent = rec.target.issue;
    const child = rec.desired && (rec.desired.sub_issue || rec.desired.child);
    if (!parent || !child)
      return { error: "parent/child issue numbers not recorded" };
    const r = io.exec([
      "gh",
      "api",
      `repos/{owner}/{repo}/issues/${parent}/sub_issues`,
    ]);
    if (r.status !== 0) return { error: r.error || "sub-issue list failed" };
    const j = parseJson(r.stdout);
    if (!Array.isArray(j)) return { error: "sub-issue list unparsable" };
    const exists = j.some((s) => String(s.number) === String(child));
    return { read: "existence", exists, count: exists ? 1 : 0 };
  },

  async "github.board.item-add"(io, rec) {
    const r = io.exec([
      "gh",
      "api",
      "graphql",
      "-f",
      `query=query { repository(owner: "{owner}", name: "{repo}") { issue(number: ${Number(rec.target.issue)}) { projectItems(first: 10) { nodes { project { title } } } } } }`,
    ]);
    if (r.status !== 0) return { error: r.error || "board read failed" };
    const j = parseJson(r.stdout);
    const nodes =
      j &&
      j.data &&
      j.data.repository &&
      j.data.repository.issue &&
      j.data.repository.issue.projectItems &&
      j.data.repository.issue.projectItems.nodes;
    if (!Array.isArray(nodes)) return { error: "board membership unparsable" };
    return { read: "existence", exists: nodes.length > 0, count: nodes.length };
  },

  async "github.board.field-set"(io, rec) {
    const field = Object.keys(rec.desired || {})[0];
    if (!field) return { error: "no desired field recorded" };
    const fieldName = field.charAt(0).toUpperCase() + field.slice(1);
    const r = io.exec([
      "gh",
      "api",
      "graphql",
      "-f",
      `query=query { repository(owner: "{owner}", name: "{repo}") { issue(number: ${Number(rec.target.issue)}) { projectItems(first: 10) { nodes { fieldValueByName(name: "${fieldName}") { ... on ProjectV2ItemFieldSingleSelectValue { name } } } } } } }`,
    ]);
    if (r.status !== 0) return { error: r.error || "board field read failed" };
    const j = parseJson(r.stdout);
    const nodes =
      j &&
      j.data &&
      j.data.repository &&
      j.data.repository.issue &&
      j.data.repository.issue.projectItems &&
      j.data.repository.issue.projectItems.nodes;
    if (!Array.isArray(nodes) || nodes.length === 0)
      return { error: "issue is on no board — field unreadable" };
    if (nodes.length > 1)
      return {
        ambiguous: true,
        count: nodes.length,
        detail: `issue sits on ${nodes.length} boards`,
      };
    const current = nodes[0].fieldValueByName && nodes[0].fieldValueByName.name;
    return {
      read: "value",
      current: current || "",
      desired: rec.desired[field],
    };
  },

  async "github.issue.edit"(io, rec) {
    const want = rec.desired || {};
    const keys = Object.keys(want).filter((k) =>
      ["title", "body", "milestone", "labels", "status", "state"].includes(k),
    );
    if (!keys.length) return { error: "no comparable desired fields recorded" };
    const r = io.exec([
      "gh",
      "issue",
      "view",
      String(rec.target.issue),
      "--json",
      "title,body,milestone,labels,state",
    ]);
    if (r.status !== 0) return { error: r.error || "issue unreadable" };
    const j = parseJson(r.stdout);
    if (!j) return { error: "issue fields unparsable" };
    const currentOf = (k) => {
      if (k === "milestone") return j.milestone && j.milestone.title;
      if (k === "labels")
        return (j.labels || [])
          .map((l) => l.name)
          .sort()
          .join(",");
      if (k === "status" || k === "state") return j.state;
      return j[k];
    };
    const wantOf = (k) =>
      k === "labels" && Array.isArray(want[k])
        ? want[k].slice().sort().join(",")
        : want[k];
    const matched = keys.every((k) => eq(currentOf(k), wantOf(k)));
    const current = keys.map((k) => `${k}=${currentOf(k)}`).join(", ");
    return {
      read: "value",
      current,
      desired: keys.map((k) => `${k}=${wantOf(k)}`).join(", "),
      matched,
    };
  },

  "github.unknown-mutation": UNRELIABLE,

  // Bitbucket has no read helper in this file and no `gh` equivalent to borrow,
  // so an inline Bitbucket comment cannot be read back. UNRELIABLE is the honest
  // answer: it reports "cannot confirm" rather than "not done", which is the
  // safe direction — an operator re-checks a comment instead of being told a
  // posted one is outstanding.
  "bitbucket.pr.comment": UNRELIABLE,

  // ── Jira ─────────────────────────────────────────────────────────────────

  async "jira.transition"(io, rec) {
    const g = await jiraGet(
      io,
      `/rest/api/3/issue/${encodeURIComponent(rec.target.issue)}?fields=status`,
    );
    if (g.error) return { error: g.error };
    const current =
      g.json &&
      g.json.fields &&
      g.json.fields.status &&
      g.json.fields.status.name;
    if (current === undefined) return { error: "status field unreadable" };
    return { read: "value", current, desired: desiredStatus(rec) };
  },

  async "jira.issue.update"(io, rec) {
    // Only a status-shaped update is reliably comparable from the outside;
    // arbitrary field updates fall back to the status read when present.
    const want = desiredStatus(rec);
    if (want === undefined || want === null)
      return { error: "no comparable desired field recorded" };
    const g = await jiraGet(
      io,
      `/rest/api/3/issue/${encodeURIComponent(rec.target.issue)}?fields=status`,
    );
    if (g.error) return { error: g.error };
    const current =
      g.json &&
      g.json.fields &&
      g.json.fields.status &&
      g.json.fields.status.name;
    if (current === undefined) return { error: "status field unreadable" };
    return { read: "value", current, desired: want };
  },

  async "jira.comment.add"(io, rec) {
    const g = await jiraGet(
      io,
      `/rest/api/3/issue/${encodeURIComponent(rec.target.issue)}/comment?maxResults=100`,
    );
    if (g.error) return { error: g.error };
    const comments = (g.json && g.json.comments) || [];
    const bodies = comments.map((c) =>
      typeof c.body === "string" ? c.body : JSON.stringify(c.body),
    );
    const marker = markerFrom(rec.command && rec.command.stdin);
    const key = marker || heuristicLine(rec.command && rec.command.stdin);
    if (!key) return { error: "no marker and no comparable body line" };
    const hits = bodies.filter((b) => b.includes(key)).length;
    if (hits === 1)
      return { read: "existence", exists: true, count: 1, current: "posted" };
    if (hits === 0) return { read: "existence", exists: false, count: 0 };
    return {
      ambiguous: true,
      count: hits,
      detail: marker
        ? `${hits} comments carry marker ${marker}`
        : `${hits} comments match the body heuristically`,
    };
  },

  async "jira.issue.create"(io, rec) {
    const summary = (rec.desired && rec.desired.summary) || rec.target.name;
    if (!summary) return { error: "no summary recorded to search for" };
    const jql = `summary ~ "${String(summary).replace(/"/g, '\\"')}"`;
    const g = await jiraGet(
      io,
      `/rest/api/3/search?jql=${encodeURIComponent(jql)}&fields=summary&maxResults=10`,
    );
    if (g.error) return { error: g.error };
    const issues = (g.json && g.json.issues) || [];
    const hits = issues.filter(
      (i) => i.fields && eq(i.fields.summary, summary),
    );
    if (hits.length === 1)
      return {
        read: "existence",
        exists: true,
        count: 1,
        current: hits[0].key,
      };
    if (hits.length === 0)
      return { read: "existence", exists: false, count: 0 };
    return {
      ambiguous: true,
      count: hits.length,
      detail: `${hits.length} issues share the summary`,
    };
  },

  async "jira.issue.link"(io, rec) {
    const other =
      rec.desired &&
      (rec.desired.outward || rec.desired.inward || rec.desired.issue);
    if (!other) return { error: "no linked issue recorded" };
    const g = await jiraGet(
      io,
      `/rest/api/3/issue/${encodeURIComponent(rec.target.issue)}?fields=issuelinks`,
    );
    if (g.error) return { error: g.error };
    const links = (g.json && g.json.fields && g.json.fields.issuelinks) || [];
    const exists = links.some(
      (l) =>
        (l.outwardIssue && eq(l.outwardIssue.key, other)) ||
        (l.inwardIssue && eq(l.inwardIssue.key, other)),
    );
    return { read: "existence", exists, count: exists ? 1 : 0 };
  },

  async "jira.sprint.set-state"(io, rec) {
    const sprint = rec.target.sprint;
    if (!sprint) return { error: "no sprint id recorded" };
    const g = await jiraGet(io, `/rest/agile/1.0/sprint/${sprint}`);
    if (g.error) return { error: g.error };
    const current = g.json && g.json.state;
    if (!current) return { error: "sprint state unreadable" };
    return {
      read: "value",
      current,
      desired: (rec.desired && rec.desired.state) || desiredStatus(rec),
    };
  },

  // A worklog cannot be told apart from any other worklog after the fact, a
  // backlog membership read needs a board id the record does not carry, and a
  // sprint issue-move has no stable "which sprint should it be in now" answer
  // days later. Guessing on any of these is how a false `satisfied` hides
  // real drift — so they say "check by hand" instead.
  "jira.worklog.add": UNRELIABLE,
  "jira.backlog.add": UNRELIABLE,
  "jira.sprint.move-issues": UNRELIABLE,
  "jira.unknown-mutation": UNRELIABLE,
};

// ---------------------------------------------------------------------------
// State derivation — pure, and the only place the four states are decided.
// ---------------------------------------------------------------------------

/**
 * Derive the state for one record from its reading.
 *
 * @param {object} rec       the record (for `observed` — the pre-action baseline)
 * @param {object|null} reading  a recipe result, or null when no recipe exists
 * @returns {{state: string, observed: any, detail: string}}
 */
function deriveState(rec, reading) {
  // `evidence` records whether a REAL read produced this state. States without
  // evidence (no recipe, unreliable kind, failed or ambiguous read) may not
  // revoke an existing tick — only positive evidence of regression may.
  if (reading === null || reading === undefined) {
    return {
      state: "pending",
      observed: null,
      evidence: false,
      detail: "no read defined for this kind",
    };
  }
  if (reading === UNRELIABLE || reading.unreliable) {
    return {
      state: "unverifiable",
      observed: null,
      evidence: false,
      detail: "this kind has no reliable read — check by hand",
    };
  }
  if (reading.error) {
    return {
      state: "unverifiable",
      observed: null,
      evidence: false,
      detail: `read failed: ${reading.error}`,
    };
  }
  if (reading.ambiguous) {
    // NEVER satisfied on 2+ matches. On ambiguity, do not guess.
    return {
      state: "unverifiable",
      observed: null,
      evidence: false,
      detail: reading.detail || `${reading.count} candidate matches`,
    };
  }

  if (reading.read === "existence") {
    if (reading.exists) {
      return {
        state: "satisfied",
        observed: reading.current || "present",
        evidence: true,
        detail: reading.detail || "verified present",
      };
    }
    return {
      state: "pending",
      observed: null,
      evidence: true,
      detail: "not found — still to do",
    };
  }

  // Value read.
  const current = reading.current;
  const want = reading.desired;
  const matched =
    reading.matched !== undefined ? reading.matched : eq(current, want);
  if (matched) {
    return {
      state: "satisfied",
      observed: current,
      evidence: true,
      detail: "verified in the desired state",
    };
  }

  // The pre-action baseline: what an earlier pass observed. If the value has
  // moved OFF the baseline but is not the desired value either, someone took
  // it somewhere neither the plan nor its starting point expected.
  const baseline = baselineOf(rec);
  if (baseline !== null && !eq(current, baseline)) {
    return {
      state: "divergent",
      observed: current,
      evidence: true,
      detail: `observed ${current}, wanted ${want}`,
    };
  }
  return {
    state: "pending",
    observed: current,
    evidence: true,
    detail: `still ${current}; wanted ${want}`,
  };
}

/** The stored pre-action baseline, if any pass has recorded one. */
function baselineOf(rec) {
  if (rec.verification && rec.verification.baseline !== undefined)
    return rec.verification.baseline;
  if (rec.observed !== null && rec.observed !== undefined) {
    if (typeof rec.observed === "object") {
      const v = rec.observed.status !== undefined ? rec.observed.status : null;
      return v;
    }
    return rec.observed;
  }
  return null;
}

// ---------------------------------------------------------------------------
// The pass
// ---------------------------------------------------------------------------

/**
 * Verify one record. Returns the annotation without mutating the input.
 */
async function verifyRecord(rec, opts = {}) {
  const io = opts.io || makeIo(opts);
  const recipe = RECIPES[rec.kind];

  let reading;
  if (recipe === undefined) {
    reading = null;
  } else if (recipe === UNRELIABLE) {
    reading = UNRELIABLE;
  } else {
    try {
      reading = await recipe(io, rec);
    } catch (e) {
      reading = { error: e.message };
    }
  }

  const derived = deriveState(rec, reading);

  // Idempotence: a re-verification that sees the same state and the same
  // observed value keeps the previous annotation verbatim — timestamp
  // included — so reconciling twice is byte-identical.
  const prev = rec.verification;
  if (
    prev &&
    prev.state === derived.state &&
    norm(prev.observed) === norm(derived.observed)
  ) {
    return prev;
  }

  const annotation = {
    state: derived.state,
    at: io.now(),
    observed: derived.observed,
    evidence: derived.evidence === true,
    detail: derived.detail,
  };
  // Preserve the earliest baseline across passes: the first non-satisfied
  // value-read observation is the pre-action value, and later passes must not
  // overwrite it or divergence becomes undetectable.
  const earlierBaseline =
    prev && prev.baseline !== undefined ? prev.baseline : baselineOf(rec);
  if (
    derived.state === "pending" &&
    derived.observed !== null &&
    earlierBaseline === null
  ) {
    annotation.baseline = derived.observed;
  } else if (earlierBaseline !== null) {
    annotation.baseline = earlierBaseline;
  }
  return annotation;
}

/**
 * Verify a record list. Returns NEW records (annotated copies) plus counts.
 * A satisfied record is ticked, never deleted: output length === input length.
 */
async function verifyRecords(records, opts = {}) {
  const io = opts.io || makeIo(opts);
  const out = [];
  const counts = { satisfied: 0, pending: 0, divergent: 0, unverifiable: 0 };

  for (const rec of records || []) {
    // Records already executed/satisfied stay as they are — short-circuited.
    if (rec.satisfied === true && !rec.verification) {
      counts.satisfied++;
      out.push(rec);
      continue;
    }
    const verification = await verifyRecord(rec, { io });
    counts[verification.state]++;
    const annotated = { ...rec, verification };
    // `satisfied` follows the FRESH verification state — but a tick is revoked
    // only on POSITIVE EVIDENCE of regression (a real read that came back
    // pending or divergent). A read that produced no evidence — unverifiable,
    // failed, or a kind with no recipe — keeps an existing tick: revoking on
    // silence would return an already-executed action to `outstanding`, and
    // --apply / the rendered script would then run the mutation a second time.
    annotated.satisfied =
      verification.state === "satisfied" ||
      (rec.satisfied === true && verification.evidence !== true);
    if (verification.state === "satisfied") {
      annotated.observed =
        verification.observed !== null &&
        typeof verification.observed !== "object"
          ? { value: verification.observed }
          : verification.observed;
    }
    out.push(annotated);
  }

  if (out.length !== (records || []).length) {
    // The item-count identity is an invariant, not a hope.
    throw new Error(
      `handover-verify: record count changed during verification ` +
        `(${(records || []).length} in, ${out.length} out) — a satisfied action ` +
        `must be ticked, never deleted.`,
    );
  }

  return { records: out, counts };
}

// ---------------------------------------------------------------------------
// The credential-free verification: git push.
//
// Not one of the 23 tracker kinds — it is the VCS-side read that works in
// every access model, because `git ls-remote` needs no API and no token
// beyond what `git fetch` already had.
// ---------------------------------------------------------------------------

/**
 * @returns {{state: "satisfied"|"pending"|"divergent"|"unverifiable", detail: string}}
 */
function verifyGitPush(branch, opts = {}) {
  const io = opts.io || makeIo(opts);
  const local = io.exec(["git", "rev-parse", branch]);
  if (local.status !== 0)
    return { state: "unverifiable", detail: `no local ref for ${branch}` };
  const remote = io.exec(["git", "ls-remote", "origin", branch]);
  if (remote.status !== 0)
    return { state: "unverifiable", detail: "ls-remote failed" };
  const remoteSha = String(remote.stdout || "").split(/\s+/)[0] || "";
  const localSha = String(local.stdout || "").trim();
  if (!remoteSha) return { state: "pending", detail: "branch not on origin" };
  if (remoteSha === localSha)
    return {
      state: "satisfied",
      detail: `origin/${branch} at ${remoteSha.slice(0, 8)}`,
    };
  return {
    state: "divergent",
    detail: `origin/${branch} at ${remoteSha.slice(0, 8)}, local at ${localSha.slice(0, 8)}`,
  };
}

// ---------------------------------------------------------------------------
// CLI — read-only; prints, writes nothing.
// ---------------------------------------------------------------------------

const USAGE = `Usage: handover-verify (--journal <path> | --sidecar <path>) [--json]

Read-only verification pass over a deferred-mutation journal or a committed
handover sidecar. Reads the live tracker, derives one of four states per
record (satisfied | pending | divergent | unverifiable), prints the result.
Performs NO mutation — every command it runs is checked against a read-only
allowlist first.`;

function parseArgs(argv) {
  const args = {};
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    const need = () => {
      if (i + 1 >= rest.length) throw new Error(`${a} requires a value`);
      return rest[++i];
    };
    switch (a) {
      case "-h":
      case "--help":
        args.help = true;
        break;
      case "--json":
        args.json = true;
        break;
      case "--journal":
        args.journal = need();
        break;
      case "--sidecar":
        args.sidecar = need();
        break;
      default:
        throw new Error(`unknown flag "${a}"`);
    }
  }
  return args;
}

async function run({
  argv = process.argv,
  env = process.env,
  cwd = process.cwd(),
} = {}) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    console.error(`Error: ${e.message}`);
    console.error(USAGE);
    return { exitCode: 2 };
  }
  if (args.help) {
    console.log(USAGE);
    return { exitCode: 0 };
  }

  const fs = require("fs");
  let records;
  if (args.sidecar) {
    const payload = JSON.parse(fs.readFileSync(args.sidecar, "utf8"));
    records = payload.records || [];
  } else {
    const file = dm.journalPath({ journal: args.journal, env, cwd });
    records = dm.readJournal(file, {
      onWarn: (m) => console.error(`⚠️  ${m}`),
    }).records;
  }

  const io = makeIo({ env });
  const { records: verified, counts } = await verifyRecords(records, { io });

  if (args.json) {
    process.stdout.write(
      `${JSON.stringify({ counts, records: verified }, null, 2)}\n`,
    );
  } else {
    for (const r of verified) {
      const v = r.verification || {
        state: r.satisfied ? "satisfied" : "pending",
        detail: "",
      };
      console.log(
        `${v.state.padEnd(12)} ${r.kind.padEnd(26)} ${r.id}  ${v.detail || ""}`,
      );
    }
    console.log(
      `\n${counts.satisfied} satisfied · ${counts.pending} pending · ` +
        `${counts.divergent} divergent · ${counts.unverifiable} unverifiable`,
    );
  }
  return { exitCode: 0, counts };
}

if (require.main === module) {
  run().then(
    (r) => process.exit(r.exitCode || 0),
    (e) => {
      console.error(`Error: ${e.message}`);
      process.exit(2);
    },
  );
}

module.exports = {
  STATES,
  COMMENT_MARKER_PREFIX,
  RECIPES,
  UNRELIABLE,
  isReadOnlyArgv,
  assertReadOnlyArgv,
  makeIo,
  markerFrom,
  heuristicLine,
  deriveState,
  baselineOf,
  verifyRecord,
  verifyRecords,
  verifyGitPush,
  parseArgs,
  run,
  USAGE,
};
