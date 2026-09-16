#!/usr/bin/env node
// AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/defer-mutation.js. Regenerate via `npm run bundle`.
// ---------------------------------------------------------------------------
// defer-mutation.js — the single writer of deferred-mutation records.
//
// A tracker mutation that cannot (or should not) be performed becomes a record
// appended to a per-run NDJSON journal. This file is the ONLY place that knows
// the record schema; everything downstream is a rendering of what it wrote.
//
// Dual entry point BY REQUIREMENT, not by taste: the same file must be
// `node defer-mutation.js …` from a shell chokepoint and `require`d from node
// in the same process. That forces CommonJS — an ESM module cannot be both
// without a wrapper. (bundle_skill.py follows either form, so bundling does not
// decide this; see yaml-subset.js's header for the same note.)
//
// Two invariants this file exists to hold:
//
//   1. An unknown `kind` is REFUSED, not written. A record nothing can render is
//      worse than no record: the checklist silently omits an action a human must
//      perform, which is the exact invisible-drift failure the sequence removes.
//      The roster is read from shared/resources/tracker-access-record.md, so the
//      schema doc and the writer cannot drift apart.
//
//      That path is written out in full DELIBERATELY. It is how bundle_skill.py
//      learns to copy the schema doc into each skill's references/ alongside this
//      file — the doc is loaded at runtime via `__dirname`, not `require`, so
//      nothing else would tell the bundler it is a dependency, and a bundled
//      skill would throw "Cannot read the kind roster" on first use. Resolution
//      works in both layouts because the doc always sits next to this file.
//
//   2. No credential value is ever written. Redaction happens HERE, before the
//      line hits disk, and again in the renderers on the way out. Committing the
//      rendered script and JSON is defensible only because of this.
//
// Usage (CLI):
//   node defer-mutation.js --kind github.issue.comment --system github \
//     --intent "Post the DoD summary" --target '{"issue":"230"}' \
//     --command-argv '["gh","issue","comment","230","--body-file","-"]' \
//     --stdin-file body.md --json
//
// Usage (library):
//   const { defer, KINDS } = require("./defer-mutation.js");
//   defer({ kind: "jira.transition", system: "jira", intent: "…", … });
//
// Tested by tests/handover-render.test.mjs and tests/stage-access-gate.test.mjs
// (`node --test` — see package.json). The path is written relative on purpose:
// a shared-resources path prefix here would make bundle_skill.py follow it
// and copy the test suite into every consuming skill. (Spelling that prefix
// out — even inside a comment, even with an ellipsis — is itself enough to
// make the bundler chase it, which is how this warning first appeared.)
// ---------------------------------------------------------------------------
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const SCHEMA_VERSION = 1;
const DEFAULT_JOURNAL = ".claude/state/tracker-actions.jsonl";
const ROSTER_DOC = "tracker-access-record.md";

// Asserted, not merely non-zero. A reformatted row used to truncate the roster
// silently; pinning the count turns that into an immediate, explicit failure.
const EXPECTED_KIND_COUNT = 24;

const ACCESS_MODES = Object.freeze([
  "full",
  "read-only",
  "approve",
  "command",
  "manual",
]);

const CONSEQUENCES = Object.freeze([
  "state-drift",
  "communication",
  "irreversible",
]);

// Hardening is allowed, softening is not. A caller that knows this particular
// board move cannot be undone may raise it; nobody may lower a merge to a
// comment. Index = severity.
const CONSEQUENCE_RANK = Object.freeze({
  communication: 0,
  "state-drift": 1,
  irreversible: 2,
});

// ---------------------------------------------------------------------------
// Roster — parsed from tracker-access-record.md, never hard-coded here
// ---------------------------------------------------------------------------
//
// The schema doc is the roster. Duplicating it in JS would create exactly the
// two-sources-of-truth problem the doc's own header warns about, and would let
// the totality test pass vacuously against a list the doc no longer contains.

/**
 * Parse the kind roster out of the schema document.
 *
 * A kind row is a table row whose first cell is a single backtick-quoted token
 * containing a dot, inside a table whose header's first cell is exactly
 * `` `kind` ``. That shape is asserted by the doc itself, so a well-meaning
 * reformat that breaks it fails the suite rather than silently emptying the
 * roster.
 *
 * @param {string} text - contents of tracker-access-record.md
 * @returns {Map<string, {kind: string, consequence: string, produces: string|null}>}
 */
function parseRoster(text) {
  const roster = new Map();
  const lines = String(text).split(/\r?\n/);
  let inKindTable = false;

  for (const line of lines) {
    const cells = splitRow(line);
    if (!cells) {
      // A blank line ends a table; prose between two tables must not let the
      // second one inherit the first one's header.
      if (!line.trim()) inKindTable = false;
      continue;
    }
    // Match the roster table's FULL header, not just its first cell. The field
    // reference table earlier in the doc has a data row whose first cell is
    // literally `kind` (`| `kind` | string | yes | Must appear in the roster |`),
    // which a first-cell-only test reads as the start of a roster table — and
    // then treats `consequence`, `produces` and the rest of that table's rows as
    // malformed kinds.
    if (cells[0] === "`kind`" && /consequence/i.test(cells[1] || "")) {
      inKindTable = true;
      continue;
    }
    // The |---|---| separator row.
    if (/^:?-{2,}:?$/.test(cells[0])) continue;
    if (!inKindTable) continue;

    const m = /^`([a-z0-9]+(?:\.[a-z0-9-]+)+)`$/.exec(cells[0]);
    if (!m) {
      // A cell that merely ends the table (prose, a totals row) is fine. A cell
      // that LOOKS like a kind but does not parse is not: bolding one row used
      // to silently drop every kind below it, `roster.size` stayed non-zero so
      // nothing complained, and `defer()` then threw "unknown kind" inside the
      // stage-CLI gate — which swallows the throw into a warning and returns
      // `deferred` with NO record. The board move was neither performed nor
      // recorded. Refuse loudly instead.
      if (cells[0].includes("`")) {
        throw new Error(
          `${ROSTER_DOC}: row "${cells[0]}" sits in a kind table but does not ` +
            `parse as a kind. Keep the shape documented under "The 23 kinds" — ` +
            `a single backtick-quoted token, no other markup.`,
        );
      }
      inKindTable = false;
      continue;
    }
    const kind = m[1];
    const consequence = (cells[1] || "").trim();
    const producesCell = (cells[2] || "").trim();
    const produces =
      !producesCell || producesCell === "—" || producesCell === "-"
        ? null
        : producesCell.replace(/`/g, "").trim();

    if (!CONSEQUENCES.includes(consequence)) {
      throw new Error(
        `${ROSTER_DOC}: kind "${kind}" has unknown consequence "${consequence}". ` +
          `Known: ${CONSEQUENCES.join(", ")}`,
      );
    }
    roster.set(kind, { kind, consequence, produces });
  }

  if (roster.size !== EXPECTED_KIND_COUNT) {
    throw new Error(
      `${ROSTER_DOC}: parsed ${roster.size} kinds, expected ${EXPECTED_KIND_COUNT}. ` +
        `Either the roster table shape changed (see the note under "The 23 kinds") ` +
        `or a kind was added/removed without updating EXPECTED_KIND_COUNT in ` +
        `defer-mutation.js. Both halves must move together — that is what stops a ` +
        `silent truncation from looking like a smaller roster.`,
    );
  }
  return roster;
}

/** Split a markdown table row into trimmed cells, or null if it is not one. */
function splitRow(line) {
  const t = String(line).trim();
  if (!t.startsWith("|") || !t.endsWith("|")) return null;
  return t
    .slice(1, -1)
    .split("|")
    .map((c) => c.trim());
}

let _rosterCache = null;

/**
 * The 21 kinds, keyed by kind. Memoised — the doc is read once per process.
 * @param {{docPath?: string, force?: boolean}} [opts]
 */
function loadRoster(opts = {}) {
  if (_rosterCache && !opts.force && !opts.docPath) return _rosterCache;
  const docPath = opts.docPath || path.join(__dirname, ROSTER_DOC);
  let text;
  try {
    text = fs.readFileSync(docPath, "utf8");
  } catch (e) {
    throw new Error(
      `Cannot read the kind roster at ${docPath}: ${e.message}. ` +
        `defer-mutation.js refuses to write a record it cannot validate.`,
    );
  }
  const roster = parseRoster(text);
  if (!opts.docPath) _rosterCache = roster;
  return roster;
}

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

// Anchored to whole `_`-delimited segments. An unanchored /AUTH/ matched
// GIT_AUTHOR_NAME — which git sets in every hook context — so an operator's own
// name was swept out of intents and checklist fields and replaced with
// `$GIT_AUTHOR_NAME`. AUTHOR is excluded explicitly for that reason.
const SECRET_ENV_NAME =
  /(^|_)(TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIALS?|API_?KEY|APIKEY|PAT|AUTH)(_|$)/i;
const NOT_SECRET_ENV_NAME = /AUTHOR/i;

// Flags whose FOLLOWING argv element is a secret — but only for clients that
// actually use them that way. `-u` and `-p` used to be masked unconditionally,
// which turned `git push -u origin HEAD` into `git push -u «redacted» HEAD` and
// `mkdir -p docs/tasks` into `mkdir -p «redacted»`.
const SECRET_FLAGS = new Set([
  "--token",
  "--password",
  "--passwd",
  "--api-key",
  "--apikey",
  "--secret",
  "--auth",
]);

// `-u` / `-p` are secret-bearing ONLY for these clients.
const SHORT_FLAG_CLIENTS = new Set([
  "curl",
  "wget",
  "mysql",
  "mysqldump",
  "psql",
  "mongo",
  "mongosh",
  "redis-cli",
  "svn",
]);
const SHORT_SECRET_FLAGS = new Set(["-u", "-p"]);

const REDACTED = "«redacted»";

// Unambiguous secret shapes. These are safe to apply to EVERY string, because
// nothing else looks like them — a `ghp_…` or an `ATATT…` in a comment body is a
// leaked token, not prose.
const SECRET_SHAPES = [
  /\b(?:ghp|gho|ghs|ghu|ghr)_[A-Za-z0-9]{16,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bATATT[A-Za-z0-9_\-=+/]{20,}\b/g,
  /\b(?:Bearer|bearer)\s+[A-Za-z0-9._\-=+/]{12,}/g,
  /\b(?:Basic|basic)\s+[A-Za-z0-9+/=]{12,}/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
];

// Credentials embedded in a URL's userinfo. Only the password half is masked —
// the user half is usually a username or an email and is worth keeping.
const URL_USERINFO = /(\/\/[^/\s:@]+):([^/\s@]+)@/g;

/**
 * Build the env-sweep replacement table: secret VALUE → `$NAME`.
 *
 * Replacing with the variable's name rather than a blanket mask is what keeps
 * the output actionable — an operator reading the script learns which variable
 * to export, without ever seeing its contents.
 *
 * @param {Record<string,string>} env
 * @returns {Array<[string, string]>} longest value first, so a value that is a
 *   prefix of another cannot mask the longer one.
 */
function buildEnvTable(env) {
  const pairs = [];
  for (const [name, value] of Object.entries(env || {})) {
    if (!value || typeof value !== "string") continue;
    if (!SECRET_ENV_NAME.test(name) || NOT_SECRET_ENV_NAME.test(name)) continue;
    // Length floor with an escape hatch for short-but-real secrets. A flat
    // 8-char floor let `JIRA_PASSWORD=hunter2` through; sweeping everything ≥1
    // char instead would replace `AUTH_MODE=full`'s value wherever the word
    // "full" appeared. Requiring a digit below 12 characters separates a
    // password from a config word without a hand-maintained deny-list.
    if (value.length < 6) continue;
    if (value.length < 12 && !/\d/.test(value)) continue;
    pairs.push([value, `$${name}`]);
  }
  pairs.sort((a, b) => b[0].length - a[0].length);
  return pairs;
}

/** Replace every occurrence of each secret value with its `$NAME`. */
function sweepEnv(str, envTable) {
  let out = str;
  for (const [value, name] of envTable) {
    if (out.includes(value)) out = out.split(value).join(name);
  }
  return out;
}

/** Replace unambiguous secret shapes with the mask. Safe on any string. */
function sweepShapes(str) {
  let out = str;
  for (const re of SECRET_SHAPES) {
    re.lastIndex = 0;
    out = out.replace(re, (m) => (m.includes("$") ? m : REDACTED));
  }
  URL_USERINFO.lastIndex = 0;
  out = out.replace(URL_USERINFO, (m, prefix, pass) =>
    pass.startsWith("$") ? m : `${prefix}:${REDACTED}@`,
  );
  return out;
}

/**
 * Redact one string: env sweep first (so names survive), then shape match.
 *
 * Applies only the UNAMBIGUOUS rules — never the high-entropy heuristic, which
 * belongs to credential-bearing positions alone (see `maskOrName`).
 *
 * @param {string} str
 * @param {Array<[string,string]>} envTable
 */
function redactString(str, envTable) {
  if (typeof str !== "string" || !str) return str;
  return sweepShapes(sweepEnv(str, envTable));
}

/**
 * True when a value has already been through redaction.
 *
 * Matches a variable reference ANYWHERE in the string, not just a bare `$NAME`.
 * The first version tested `/^\$IDENT$/`, which covered `--token $GITHUB_TOKEN`
 * but not `Authorization: Bearer $JIRA_API_TOKEN` — so an auth header the write
 * pass had correctly named was masked to `«redacted»` by the render pass, and
 * the operator lost the one piece of information that made the script runnable.
 * Same defect as the bare case, one nesting level down.
 */
function alreadyRedacted(raw) {
  return raw.includes(REDACTED) || /\$[A-Za-z_][A-Za-z0-9_]*/.test(raw);
}

/**
 * A secret's replacement: its `$NAME` when the env sweep recognised it,
 * otherwise the blanket mask.
 *
 * "Unchanged by the sweeps" is the signal that nothing recognised this value —
 * and an unrecognised value sitting in a known-secret position is exactly the
 * one we must not emit. Masking is the fail-closed answer.
 */
function maskOrName(raw, envTable) {
  const s = String(raw);

  // IDEMPOTENCY. Redaction runs twice by design — once in `defer()` on write,
  // once in `render()` on read as defence in depth. Without this guard the
  // second pass saw the `$GITHUB_TOKEN` the first pass produced, found it
  // unchanged by the sweeps, concluded "unrecognised value in a secret
  // position", and masked it to «redacted» — handing the operator a script
  // containing `--token «redacted»` that cannot run, in the one mode whose
  // entire purpose is a runnable script.
  if (alreadyRedacted(s)) return s;

  const swept = redactString(s, envTable);
  if (swept !== s) return swept; // env named it, or a shape matched it

  // Nothing recognised it. Every path that reaches here is already a
  // credential-bearing position — the value after an explicit secret flag, the
  // value after `-u`/`-p` for a client that uses them for credentials, or an
  // auth header's value — so fail closed and mask, whatever it looks like. A
  // three-character token is still a token.
  return REDACTED;
}

/**
 * Redact an argv array, honouring flag pairs.
 *
 * `-u user:app_password` is the case the shape matcher alone gets wrong: the
 * username half is not secret-shaped, so masking the whole element is the only
 * safe answer.
 *
 * @param {string[]} argv
 * @param {Array<[string,string]>} envTable
 */
function redactArgv(argv, envTable) {
  if (!Array.isArray(argv)) return argv;
  // `-u` / `-p` mean credentials for curl and the database clients, and mean
  // "set upstream" / "make parents" for git and mkdir. Deciding by argv[0] is
  // what stops `git push -u origin HEAD` becoming `git push -u «redacted» HEAD`.
  const client = String(argv[0] || "")
    .split("/")
    .pop();
  const shortFlagsAreSecret = SHORT_FLAG_CLIENTS.has(client);

  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const cur = String(argv[i]);

    // `--token=abc` — flag and value in one element.
    const inline = /^(--[a-z-]+)=([\s\S]+)$/.exec(cur);
    if (inline && SECRET_FLAGS.has(inline[1])) {
      out.push(`${inline[1]}=${maskOrName(inline[2], envTable)}`);
      continue;
    }

    out.push(redactString(cur, envTable));

    const next = i + 1 < argv.length ? String(argv[i + 1]) : undefined;
    const isAuthHeader =
      (cur === "-H" || cur === "--header") &&
      next !== undefined &&
      /^(authorization|proxy-authorization|x-api-key)\s*:/i.test(next);
    const isShortSecret = shortFlagsAreSecret && SHORT_SECRET_FLAGS.has(cur);

    if (next === undefined) continue;
    if (!SECRET_FLAGS.has(cur) && !isShortSecret && !isAuthHeader) continue;

    if (isAuthHeader) {
      // Keep the header NAME, redact only its value — `Authorization: Bearer
      // $JIRA_API_TOKEN` is actionable; a bare `«redacted»` is not.
      const m = /^([^:]+):\s*([\s\S]*)$/.exec(next);
      out.push(m ? `${m[1]}: ${maskOrName(m[2], envTable)}` : REDACTED);
    } else {
      out.push(maskOrName(next, envTable));
    }
    i++;
  }
  return out;
}

/**
 * Recursively redact every string in a record.
 * `command.argv` gets the flag-pair treatment; everything else gets the
 * env + shape sweep.
 *
 * @param {any} value
 * @param {Array<[string,string]>} envTable
 * @param {string} [keyPath]
 */
function redactDeep(value, envTable, keyPath = "") {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value, envTable);
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    if (keyPath === "command.argv") return redactArgv(value, envTable);
    return value.map((v, i) => redactDeep(v, envTable, `${keyPath}[${i}]`));
  }
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    // Keys are redacted too. `desired` and `target` are free-form objects, and a
    // credential used as a KEY (a header map, a field name taken from input)
    // otherwise survived untouched into describeDesired() and the raw json
    // records array.
    const safeKey = redactString(k, envTable);
    out[safeKey] = redactDeep(v, envTable, keyPath ? `${keyPath}.${k}` : k);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Access mode
// ---------------------------------------------------------------------------

// The config tier does not re-implement read-config.sh; it ASKS it. The gap this
// closes is that `access.tracker` in skills-config.yaml was invisible to every
// bare `node …` invocation, so a committed restriction resolved to `full`.
//
// Task 53 tried to answer the same question with a second YAML reader in
// JavaScript and produced a high-severity divergence from read-config.sh in
// every review round it survived — fail-open on an unparseable file, then a
// throw that took down the read-only CLI modes, then three shapes the subset
// parser silently dropped. Three correct fixes, three new divergences: the
// signature of a duplicated contract, not of a bug.
//
// So there is only ONE reader. resolve-platform.sh is sourced in a subprocess
// and its answer is used verbatim, which makes parity structural rather than
// asserted. shared/resources/resolve-platform.sh is named here so bundle_skill.py
// copies it — and, following its sibling `source`, read-config.sh — into every
// skill that bundles this file. At runtime both sit beside this file in either
// layout, so __dirname finds them without knowing which layout it is in.
// The markers resolve-platform.sh prints. Kept as escapes so this file stays
// ASCII-clean for the shell chokepoints that grep it.
const REFUSAL_MARK = "\u274c";
const WARN_MARK = "\u26a0\ufe0f";
const CONFIG_BASENAME = "skills-config.yaml";
const RESOLVER_SH = "resolve-platform.sh";

/**
 * The child shell's environment, SNAPSHOTTED AT REQUIRE TIME.
 *
 * Frozen here rather than read at call time because `loadDotEnv()` merges the
 * repo's `.env` into process.env before the gates resolve, and it fills in any
 * key that is not already set. LANG, LC_ALL and TMPDIR are routinely unset in CI
 * and daemon contexts, and HOME occasionally is — so reading them later would let
 * a repo-local `.env` supply them after all, which is the hole this allowlist
 * exists to close. defer-mutation.js is required before any loadDotEnv call, so
 * this snapshot predates the merge. Same trick, and same reason, as
 * jira-sync.js's ACCESS_ENV_AT_LOAD.
 *
 * The names here change how the reader RUNS (which interpreter, which locale,
 * where temp files go) rather than what bash SOURCES at startup — none of them is
 * a startup hook like BASH_ENV. Omitting PYTHONPATH/PYENV_VERSION would be its
 * own parity bug: on a host where pyyaml is reachable only through them, the
 * child would silently fall back to the awk tier while a normal shell used
 * PyYAML, and the two readers would then grade the tier-sensitive fixtures
 * differently.
 */
const CHILD_ENV_AT_LOAD = Object.freeze(
  Object.fromEntries(
    [
      "PATH",
      "HOME",
      "LANG",
      "LC_ALL",
      "LC_CTYPE",
      "TMPDIR",
      "PYTHONPATH",
      "PYTHONHOME",
      "PYENV_VERSION",
    ]
      .map((k) => [k, process.env[k]])
      .filter(([, v]) => v !== undefined),
  ),
);

/** Memo: one bash spawn per (cwd, config path, tier) per process. */
const _configAccessMemo = new Map();

/**
 * Where the config file is, and whether naming it was a redirect.
 *
 * Mirrors read-config.sh's own rule exactly: the origin is `env` only when
 * SKILLS_CONFIG_FILE is non-empty AND is not the literal default basename. That
 * comparison is against the literal rather than "was the variable set?", because
 * an explicit `SKILLS_CONFIG_FILE=skills-config.yaml` names the default and must
 * behave identically to leaving it unset.
 *
 * Relative paths resolve against `cwd` — the repo root the CALLER computed, not
 * process.cwd(). read-config.sh anchors to the shell's working directory, and
 * the shell entry points run from the repo root; passing the caller's root is
 * how a `node …` invocation from a subdirectory gets the same answer.
 */
function resolveConfigPath(env = process.env, cwd = process.cwd()) {
  const raw = String((env && env.SKILLS_CONFIG_FILE) || "").trim();
  const origin = raw && raw !== CONFIG_BASENAME ? "env" : "default";
  const rel = raw || CONFIG_BASENAME;
  return {
    origin,
    file: path.isAbsolute(rel) ? rel : path.resolve(cwd, rel),
    raw,
  };
}

/**
 * The access mode declared in skills-config.yaml, or null when none is.
 *
 * Returns `{ mode, reason }`. `mode` is null when nothing is declared — the
 * overwhelmingly common case, which must stay free of false restriction. A
 * `reason` is non-null only when the file could not be read correctly; the
 * caller emits it once and resolves to the most restrictive mode.
 *
 * NEVER THROWS. Cycle 4 of task 53 made an unreadable config throw, which took
 * down the deliberately read-only CLI modes (`--check`, `--print-plan`,
 * `--probe-board`) and destroyed the deferral record along with the write. The
 * refusal has to arrive as a VALUE so those paths keep working.
 *
 * `kind` says WHY there is a reason, and exists because "the resolver refused"
 * and "the resolver never ran" are different events that resolve to the same
 * safe value:
 *
 *   "refused"   — the file was read and found wanting, or the resolver ran and
 *                 exited non-zero. This is DATA: a determination about the file.
 *   "never-ran" — the probe was killed on timeout, or never started (fork
 *                 pressure, EAGAIN, no bash). This is an INFRASTRUCTURE FAILURE
 *                 and says nothing about the file. Transient; worth retrying.
 *   null        — no reason; `mode` is the answer (or nothing is declared).
 *
 * Both non-null kinds still fail closed to `manual` in resolveAccessTracker, and
 * that must not change. The distinction is for callers that need to know whether
 * they received a reading or a non-event — bug.5, where a parity suite compared
 * a timed-out probe against a correct one and reported the two readers as
 * disagreeing. They had not; one of them never ran.
 *
 * @returns {{mode: string|null, kind: string|null, reason: string|null}}
 */
function readConfiguredAccessTracker(env = process.env, cwd = process.cwd()) {
  const { origin, file, raw } = resolveConfigPath(env, cwd);

  let st = null;
  try {
    st = fs.statSync(file);
  } catch {
    st = null;
  }
  const usable = st && st.isFile();

  // A redirect may point somewhere else; it may not point nowhere. Changing
  // WHICH file is read must never be a way to widen access, so an unusable
  // redirect is refused rather than degraded to the env tier's `full` default.
  // `/dev/null` is not a regular file and is refused here too.
  if (origin === "env" && !usable) {
    return {
      mode: null,
      kind: "refused",
      reason: `SKILLS_CONFIG_FILE=${raw} does not name a readable config file`,
    };
  }

  // No config file at all is not a failure — it is a repo that declares nothing.
  if (!usable) return { mode: null, kind: null, reason: null };

  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (e) {
    return {
      mode: null,
      kind: "refused",
      reason: `${file} could not be read (${e.code || e.message})`,
    };
  }

  // Cheap pre-check, and the guard against a FALSE restriction — but ONLY ever a
  // performance hint, never an authorisation decision.
  //
  // It answers the question resolve-platform.sh's `_rp_access_may_be_declared`
  // asks: "can I PROVE this file declares no access?" — and it fails TOWARD
  // spawning whenever it cannot. A bare `/access/i` test does not answer that
  // question: read-config.sh tier 1 is real PyYAML, which resolves the
  // double-quoted key `"\x61ccess":` to `access`, so a file with no literal
  // `access` substring can still declare a restriction. That was a live
  // escalation — shell said `manual`, this said `full` — found in QA cycle 1
  // (T61-H2), and it is the reason the checks below are about what could
  // POSSIBLY spell the key rather than about the key itself.
  if (!mayDeclareAccess(text)) return { mode: null, kind: null, reason: null };

  const tier = String((env && env.AGENT_SKILLS_CONFIG_TIER) || "");
  // JSON rather than NUL-joined. The collision reported as T61-L2 was NOT real —
  // the separators were already NUL, which no path or tier value can contain — so
  // this is a legibility change, not a fix. Recorded that way rather than claimed
  // as a bug closed.
  const memoKey = JSON.stringify([cwd, file, tier]);
  if (_configAccessMemo.has(memoKey)) return _configAccessMemo.get(memoKey);

  const answer = probeResolver(file, cwd, tier, env);
  // A PROBE THAT NEVER RAN IS NOT A PROPERTY OF THE FILE. Memoising it caches
  // "the box was busy for ten seconds" under a key made of the path, so the
  // fail-closed `manual` becomes sticky for the rest of the process even after
  // load subsides — and it makes retrying pointless, because the retry is served
  // from the cache without re-spawning. Re-reading costs one subprocess and can
  // only ever return what the file actually says, so it cannot escalate.
  //
  // ACCEPTED CONSEQUENCE, stated rather than discovered later: the config tier is
  // no longer guaranteed to answer identically twice in one process. A run may
  // read `manual` at T1 because a probe was killed and `read-only` at T2 because
  // the next one was not — so a LATER read can be less restrictive than an
  // earlier one. That is safe here because every caller resolves once
  // (gh-stage.js, tracker-issue.js, tracker-comment.js resolve at a single point;
  // jira-sync.js caches its own `resolved`), so no caller can hold both answers
  // at once. A caller that needs one stable answer across a long-lived process
  // must resolve once and pass it down, not call this repeatedly.
  if (answer.kind !== "never-ran") _configAccessMemo.set(memoKey, answer);
  return answer;
}

/**
 * Could this text possibly declare `access` as a key? Conservative by design.
 *
 * Returns false ONLY when absence is provable from the bytes: no `access`
 * substring in any case, no backslash (an escape could spell it), no aliasing
 * construct (an anchor, alias, merge key or tag could import it from elsewhere),
 * and nothing outside ASCII (a unicode escape or homoglyph could hide it).
 *
 * Every one of those is a way a real YAML parser reaches a key the raw text does
 * not obviously contain. Getting this wrong in the permissive direction resolves
 * a declared restriction to `full`, so the bar is "prove absence", not "look for
 * the word".
 */
function mayDeclareAccess(text) {
  // Whole-line comments are dropped FIRST, and only whole-line ones. A line whose
  // first non-space character is `#` is inert to YAML, so nothing can hide in it —
  // while a trailing `#` may sit inside a quoted scalar, so those lines stay.
  //
  // This is not a nicety, and it protects ONLY the metacharacter tests below.
  // The first version tested the raw text for those too, and this repo's own
  // config carries the prose comment "*as it dogfoods itself*" — so a bare `*`
  // matched, every ordinary config took the 500 ms subprocess, and the
  // "an unrestricted repo costs nothing" property was silently gone.
  //
  // The `access` WORD is deliberately still paid for even inside a comment (see
  // below), so a config that documents the option in a commented-out block does
  // spawn once per process. That cost is accepted: under-matching the word is an
  // escalation, and over-matching it is only slow.
  const body = text.replace(/^[ \t]*#.*$/gm, "");

  // The `access` test runs on the RAW text, comments included. That is a
  // deliberate over-match, and it is what `_rp_access_may_be_declared` does too:
  // on a config that does not parse, the shell refuses whenever the word appears
  // ANYWHERE — comment or not — because it cannot know which. Testing the
  // stripped body here made the JS answer `full` on a malformed config whose only
  // mention was commented out, while every shell gate refused it.
  //
  // The metacharacter tests below run on the stripped body instead, because those
  // are about YAML constructs and prose punctuation is not one. That split is the
  // whole point: over-match the word, under-match the syntax.
  if (/access/i.test(text)) return true;
  if (body.includes("\\")) return true; // an escape could spell `access`
  if (/[^\x00-\x7F]/.test(body)) return true; // unicode escape, homoglyph
  // Aliasing, in the positions YAML actually gives it meaning: an anchor or alias
  // introducing a node (`key: &a` / `key: *a` / `- *a`), a merge key, or a tag.
  // Matching a bare `&`/`*`/`!` anywhere would match ordinary prose.
  if (/(^|[:\-]\s*)[&*][A-Za-z0-9_-]/m.test(body)) return true;
  if (/<<\s*:/.test(body)) return true;
  if (/(^|\s)!!?[A-Za-z]/m.test(body)) return true;
  return false;
}

/** Default budget for one resolver probe, in ms. */
const ACCESS_PROBE_TIMEOUT_MS = 10000;

/**
 * Upper bound on the probe budget. A budget is a budget: "five minutes" is
 * already far past any plausible resolver, and anything above it is independent
 * of intent — a typo, or a value large enough that the probe effectively has NO
 * timeout, which is not a longer wait but an unbounded one. A hung mount or a
 * blocked `python3` would then hang the pipeline with nothing to stop it.
 */
const ACCESS_PROBE_TIMEOUT_MAX_MS = 300000;

/**
 * How long one resolver probe may take.
 *
 * This was a bare `timeout: 10000`. bug.2 established for the TEST tier that a
 * spawn budget chosen against an idle machine is not the margin it looks like —
 * a probe costing ~550ms idle inflates several-fold under the parallel load a
 * dev box running the pipelines actually carries. The same reasoning applies
 * here, and this is the one spawn site bug.2's remedy could not reach because it
 * is production rather than test code.
 *
 * `env` IS REQUIRED AND IS NOT `process.env`. This knob is honoured only when a
 * CALLER passes it in the env snapshot — the same rule as AGENT_SKILLS_CONFIG_TIER
 * (T61-M4), and for a reason that is easy to get backwards. The gates snapshot
 * the access env BEFORE `loadDotEnv()` precisely so a repo-local `.env` cannot
 * reach the reader; reading `process.env` here would be a second resolution path
 * `resolve-platform.sh` never sees, opening exactly the door that snapshot
 * exists to shut. It is tempting to argue this key is exempt because it cannot
 * ESCALATE — a short budget only kills the probe, and a killed probe fails
 * closed. That argument is wrong, and gh-stage.js:726-731 says why: the
 * invariant is not "nothing may loosen", it is that the dot-env file must not be
 * able to restrict, or via a typo hard-fail, every pipeline step behind the
 * resolver's back. `AGENT_SKILLS_ACCESS_PROBE_TIMEOUT_MS=1` in a committed .env
 * would do exactly that, silently, to every repo that declares access.
 *
 * Range-checked, not merely digit-checked. `/^\d+$/` alone accepts a 400-digit
 * string, `Number()` makes it `Infinity`, and `spawnSync({timeout: Infinity})`
 * THROWS `ERR_OUT_OF_RANGE` — which would break the NEVER-THROWS contract two
 * functions down, the one whose docstring still carries the cycle-4 incident
 * that made an unreadable config take down the read-only CLI modes.
 */
function accessProbeTimeoutMs(env) {
  const raw = String(
    (env && env.AGENT_SKILLS_ACCESS_PROBE_TIMEOUT_MS) || "",
  ).trim();
  if (!/^\d+$/.test(raw)) return ACCESS_PROBE_TIMEOUT_MS;
  const n = Number(raw);
  if (!Number.isSafeInteger(n)) return ACCESS_PROBE_TIMEOUT_MS;
  if (n < 1 || n > ACCESS_PROBE_TIMEOUT_MAX_MS) return ACCESS_PROBE_TIMEOUT_MS;
  return n;
}

/**
 * Source resolve-platform.sh in a subprocess and read back what it resolved.
 *
 * The two access ENV names are scrubbed from the child's environment so what
 * comes back is the CONFIG tier alone; this function's caller owns the env tier
 * and the most-restrictive-wins reduction. `full` and "absent" are the same
 * answer here, and conflating them is safe precisely because `full` is the
 * identity element of that reduction.
 */
function probeResolver(file, cwd, tier, env) {
  const script = path.join(__dirname, RESOLVER_SH);
  if (!fs.existsSync(script)) {
    // "refused", not "never-ran", even though no child ran. `kind` splits
    // TRANSIENT from SETTLED, not process-started from not-started: a caller
    // reacts to "never-ran" by retrying on a spawn budget and then reporting
    // contention. A resolver that is not on disk is a permanent condition, so
    // retrying it wastes the budget and answers with a "raise the timeout"
    // message pointing at the wrong thing entirely.
    return {
      mode: null,
      kind: "refused",
      reason: `${RESOLVER_SH} not found beside defer-mutation.js — cannot read ${file}`,
    };
  }

  // ALLOWLIST, not `{ ...process.env }` minus a couple of keys. This is T61-H1,
  // and it was a real escalation plus arbitrary code execution:
  //
  //   jira-stage.js and gh-stage.js call loadDotEnv() BEFORE resolving, and
  //   loadDotEnv copies every key of the repo's .env into process.env. Spreading
  //   process.env here therefore handed the child whatever that file said —
  //   including BASH_ENV, which `bash --noprofile --norc -c` SOURCES. A .env line
  //   `BASH_ENV=./x.sh` both ran arbitrary code and printed a forged `full` over a
  //   committed `manual`.
  //
  // Subtracting known-bad names cannot work: the set of environment variables that
  // change what bash does is open-ended (BASH_ENV, ENV, SHELLOPTS, BASHOPTS,
  // LD_PRELOAD, DYLD_*, IFS, …) and grows with the shell. Only an allowlist is
  // closed, so only an allowlist is safe.
  //
  // PATH is passed because the resolver needs grep/awk/python3/git, and it is the
  // same PATH this process was itself resolved on. A caller who can already set
  // this process's PATH can run anything as this process anyway; the property that
  // matters is that a REPO-LOCAL .env cannot.
  const childEnv = { ...CHILD_ENV_AT_LOAD, SKILLS_CONFIG_FILE: file };
  // The tier hook is a documented TESTING knob that materially loosens the answer
  // (forcing `python` on a host without pyyaml makes the reader answer nothing and
  // the resolver exit 0 with `full`). It is honoured only when the CALLER passed it
  // in the env snapshot — never inherited from the ambient environment (T61-M4).
  if (tier) childEnv.AGENT_SKILLS_CONFIG_TIER = tier;

  // --noprofile --norc: the child must not run the operator's shell profile. A
  // profile that prints (nvm does) would land in the captured stdout, and one
  // that exports ACCESS_TRACKER would re-introduce the env tier we just scrubbed.
  const r = spawnSync(
    "bash",
    [
      "--noprofile",
      "--norc",
      "-c",
      'source "$1" >/dev/null && printf %s "$ACCESS_TRACKER"',
      "_",
      script,
    ],
    {
      cwd,
      env: childEnv,
      encoding: "utf8",
      timeout: accessProbeTimeoutMs(env),
    },
  );

  // No bash, a timeout, or a resolver that could not run at all. Reachable only
  // when the file mentions `access`, so this fails CLOSED without imposing a
  // restriction on any repo that declares none.
  //
  // `kind: "never-ran"` is what separates this from the refusal below. Both
  // still resolve to `manual` and that is deliberate — a probe that did not run
  // tells us nothing, so fail closed. But the two are not the same event, and a
  // caller that cannot tell them apart reports contention as a behavioural
  // divergence. See the `kind` contract on readConfiguredAccessTracker.
  if (r.error || r.status === null) {
    return {
      mode: null,
      kind: "never-ran",
      reason: `could not run ${RESOLVER_SH} to read ${file} (${(r.error && r.error.message) || "no exit status"})`,
    };
  }

  if (r.status !== 0) {
    // The resolver prefixes its own message with the file path. We name the file
    // too, so strip the duplicate rather than printing it twice in one line.
    let why = firstRefusalLine(r.stderr) || "it could not be read correctly";
    if (why.startsWith(`${file}:`)) why = why.slice(file.length + 1).trim();
    return {
      mode: null,
      kind: "refused",
      reason: `${file} was refused \u2014 ${why}`,
    };
  }

  const out = String(r.stdout || "").trim();
  // An empty or unrecognised answer on a clean exit is not something to guess at.
  if (!out || !ACCESS_MODES.includes(out)) {
    return {
      mode: null,
      kind: "refused",
      reason: `${file} produced no usable access mode`,
    };
  }
  return { mode: out, kind: null, reason: null };
}

/** The first refusal line the resolver printed, trimmed for a one-line warning. */
function firstRefusalLine(stderr) {
  for (const line of String(stderr || "").split("\n")) {
    const t = line.trim();
    if (t.startsWith(REFUSAL_MARK)) {
      return t.slice(REFUSAL_MARK.length).trim();
    }
  }
  return "";
}

/** Emitted at most once per process per reason, so a loop cannot spam stderr. */
const _warnedAccessReasons = new Set();
function warnOnce(reason) {
  if (_warnedAccessReasons.has(reason)) return;
  _warnedAccessReasons.add(reason);
  // Deliberately NOT prefixed `access.tracker:`. resolve-platform.sh also exits
  // non-zero for an invalid `tracker:`/`vcs:` enum and for `access.vcs` set to
  // anything but `full`, so naming access.tracker as the cause misattributed those
  // and left the operator with no way to find the real one (T61-L3). The resolver's
  // own line is carried verbatim and says which it was.
  console.error(
    `${WARN_MARK}  ${reason}. Resolving tracker access to ` +
      `"manual" — refusing rather than defaulting to "full", because that would ` +
      `silently escalate a declared restriction into a tracker write.`,
  );
}

/**
 * The access mode in force, from the config tier and the two environment tiers,
 * most-restrictive-wins.
 *
 *   skills-config.yaml access.tracker — what an operator commits to the repo
 *   ACCESS_TRACKER                    — resolve-platform.sh's own output
 *   AGENT_SKILLS_ACCESS_TRACKER       — the knob an operator sets
 *
 * Ranked `manual < command < approve < read-only < full`, so a run may lock
 * itself down and nothing may loosen a restriction already declared. An
 * unrecognised value is REFUSED rather than defaulted, because defaulting a typo
 * to `full` turns a declared restriction into an unintended tracker write.
 *
 * The two tiers refuse DIFFERENTLY, and deliberately so:
 *
 *   env    — throws. It is a value this process was handed directly; a typo in
 *            it is a caller bug, and the existing suites pin the throw.
 *   config — resolves to `manual` and emits one stderr line. It is a file that
 *            may be unreadable for reasons a read-only CLI mode has no stake in,
 *            and a throw there is what cycle 4 got wrong.
 *
 * Both are fail-closed. Only the shape of the refusal differs.
 *
 * `opts.onDiagnostic` is an OBSERVATION channel, not a control one. When the
 * config tier produces a reason, it is called with `{kind, reason}` before the
 * warning is emitted, and the return value is unaffected either way. It exists
 * because the config tier's fail-closed `manual` is indistinguishable from a
 * legitimately-declared `manual` from outside, so a caller that must know
 * whether it received a READING or a NON-EVENT has no other way to ask (bug.5).
 *
 * Two properties it must keep:
 *
 *   - It fires EVERY time, where warnOnce deduplicates per process. A caller
 *     retrying a transient failure needs the second failure as much as the
 *     first, and a deduplicated diagnostic would silently go blind on it.
 *   - It cannot change the answer. It is passed no way to do so, and a throw
 *     from it is the caller's own bug, not this function's — it is deliberately
 *     not caught, so a broken sink is loud rather than invisible.
 *
 * @param {Record<string,string>} [env]
 * @param {{cwd?: string, config?: boolean, onDiagnostic?: (d: {kind: string|null, reason: string}) => void}} [opts]
 * @returns {"full"|"read-only"|"approve"|"command"|"manual"}
 */
function resolveAccessTracker(env = process.env, opts = {}) {
  const seen = [
    env && env.ACCESS_TRACKER,
    env && env.AGENT_SKILLS_ACCESS_TRACKER,
  ]
    .map((v) => String(v || "").trim())
    .filter(Boolean);

  // An UNRECOGNISED value is refused rather than defaulted. Defaulting a typo to
  // `full` would turn a declared restriction into an unintended tracker write —
  // the failure mode this whole sequence exists to remove.
  for (const raw of seen) {
    if (!ACCESS_MODES.includes(raw)) {
      throw new Error(
        `ACCESS_TRACKER="${raw}" is not a recognised access mode. ` +
          `Known: ${ACCESS_MODES.join(", ")}. Refusing rather than defaulting to ` +
          `"full", because that would silently escalate a declared restriction ` +
          `into a tracker write.`,
      );
    }
  }

  // The config tier is opt-OUT rather than opt-in: a caller that passes nothing
  // still gets it, which is the entire point of the task. `config: false` exists
  // for the suites that pin the env tier in isolation, not as a way for a call
  // site to skip the file.
  if (opts.config !== false) {
    const { mode, kind, reason } = readConfiguredAccessTracker(
      env,
      opts.cwd || process.cwd(),
    );
    if (reason) {
      // warnOnce FIRST. The operator-visible line is the one artifact explaining
      // why the run fell back to `manual`; a caller's buggy sink must not be able
      // to swallow it by throwing on the way past. The sink is strictly
      // downstream of the behaviour it observes.
      warnOnce(reason);
      // `kind` is passed through as it is. It used to be `kind || null`, which
      // laundered a return path that forgot to set one into a value the contract
      // defines as "there is no reason" — a reason with kind null. Every return
      // now sets it explicitly, so an undefined here is a bug and should look
      // like one.
      if (opts.onDiagnostic) opts.onDiagnostic({ kind, reason });
      seen.push("manual");
    } else if (mode) {
      seen.push(mode);
    }
  }

  if (!seen.length) return "full";
  return seen.reduce((a, b) => (ACCESS_RANK[b] < ACCESS_RANK[a] ? b : a));
}

// Permissiveness order, least to most. Mirrors resolve-platform.sh's access_rank.
const ACCESS_RANK = Object.freeze({
  manual: 0,
  command: 1,
  approve: 2,
  "read-only": 3,
  full: 4,
});

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/** Serialise with sorted keys so field order cannot change identity. */
function stableStringify(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
    .join(",")}}`;
}

/**
 * sha1-8 over system, kind, target and a fingerprint of what is wanted.
 *
 * Deduplicating on this is what makes rendering idempotent across a resume for
 * free — the pipelines re-emit records when a step re-runs, and the renderer
 * must not list the same action twice.
 */
function computeId(rec) {
  const targetKey = stableStringify(rec.target || null);

  // The fingerprint must separate two mutations that differ only in their
  // PAYLOAD. It previously fell back to `command.argv` alone, so posting the DoD
  // summary and posting the QA gate result to the same issue — identical argv
  // (`gh issue comment 230 --body-file -`), different bodies — produced the same
  // id, and `dedupe` silently discarded one of them. A wanted tracker action
  // vanished from all four renderings with nothing to signal it, which is the
  // precise invisible-drift failure this whole sequence exists to remove, and
  // strictly worse than the status quo it replaces (where a failed mutation at
  // least becomes a warning line).
  //
  // `intent` and `command.stdin` are therefore ALWAYS part of the fingerprint,
  // not a fallback. Two records are the same action only if they say the same
  // thing and carry the same payload.
  const parts = [
    rec.intent || "",
    rec.desired !== null && rec.desired !== undefined
      ? stableStringify(rec.desired)
      : "",
    rec.manual && Array.isArray(rec.manual.fields)
      ? stableStringify(
          rec.manual.fields.map((f) => [f && f.name, f && f.value]),
        )
      : "",
    rec.command && Array.isArray(rec.command.argv)
      ? rec.command.argv.join(" ")
      : "",
    rec.command && rec.command.stdin ? String(rec.command.stdin) : "",
  ];

  return crypto
    .createHash("sha1")
    .update(`${rec.system}|${rec.kind}|${targetKey}|${parts.join(" ")}`)
    .digest("hex")
    .slice(0, 8);
}

// ---------------------------------------------------------------------------
// Journal
// ---------------------------------------------------------------------------

/** Resolve the journal path: explicit arg → env override → default. */
function journalPath({ journal, env = process.env, cwd = process.cwd() } = {}) {
  const p = journal || env.TRACKER_ACTIONS_JOURNAL || DEFAULT_JOURNAL;
  return path.isAbsolute(p) ? p : path.join(cwd, p);
}

/**
 * Next `order` for this journal: one past the highest already present.
 *
 * Read-then-append is not atomic, but `order` is a display hint, not an
 * identity — `id` carries identity and `dependsOn` carries ordering that
 * matters. A duplicate `order` under concurrency degrades to a tie broken by
 * `ts` then `id`, which the renderer already does.
 */
function nextOrder(file) {
  let max = 0;
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return 1;
  }
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const o = JSON.parse(line).order;
      if (Number.isFinite(o) && o > max) max = o;
    } catch {
      // A malformed line contributes no order. It is the renderer's job to
      // warn about it, not the writer's to refuse because of it.
    }
  }
  return max + 1;
}

// ---------------------------------------------------------------------------
// The writer
// ---------------------------------------------------------------------------

/**
 * Build a validated, redacted record WITHOUT writing it.
 * Exported so tests and the renderers can construct records hermetically.
 *
 * @param {object} input
 * @param {object} [opts]
 * @param {Record<string,string>} [opts.env]
 * @param {Map} [opts.roster]
 * @param {string} [opts.now] - ISO timestamp, injectable for determinism
 * @returns {object} the record
 */
function buildRecord(input, opts = {}) {
  const env = opts.env || process.env;
  const roster =
    opts.roster || loadRoster(opts.docPath ? { docPath: opts.docPath } : {});

  if (!input || typeof input !== "object") {
    throw new Error("defer-mutation: a record object is required");
  }

  const kind = String(input.kind || "").trim();
  if (!kind) throw new Error("defer-mutation: `kind` is required");

  const spec = roster.get(kind);
  if (!spec) {
    // Refuse rather than write. See the header's invariant 1.
    throw new Error(
      `defer-mutation: unknown kind "${kind}". It is not in the roster in ` +
        `${ROSTER_DOC}. Add a row there (and a renderer case) before emitting it. ` +
        `Known kinds: ${[...roster.keys()].join(", ")}`,
    );
  }

  const system = String(input.system || kind.split(".")[0]).trim();
  if (system !== kind.split(".")[0]) {
    throw new Error(
      `defer-mutation: system "${system}" disagrees with kind "${kind}" ` +
        `(whose namespace is "${kind.split(".")[0]}")`,
    );
  }

  const access = String(input.access || env.ACCESS_TRACKER || "full").trim();
  if (!ACCESS_MODES.includes(access)) {
    throw new Error(
      `defer-mutation: unknown access mode "${access}". Known: ${ACCESS_MODES.join(", ")}`,
    );
  }

  const intent = String(input.intent || "").trim();
  if (!intent) {
    throw new Error(
      `defer-mutation: \`intent\` is required — it is the only field written for a ` +
        `human, and no renderer can reconstruct it from an argv array`,
    );
  }

  // Consequence: roster default, hardened (never softened) by the caller.
  let consequence = spec.consequence;
  if (input.consequence) {
    const asked = String(input.consequence);
    if (!CONSEQUENCES.includes(asked)) {
      throw new Error(
        `defer-mutation: unknown consequence "${asked}". Known: ${CONSEQUENCES.join(", ")}`,
      );
    }
    if (CONSEQUENCE_RANK[asked] > CONSEQUENCE_RANK[consequence]) {
      consequence = asked;
    }
  }

  const rec = {
    v: SCHEMA_VERSION,
    id: "",
    order: Number.isFinite(input.order) ? input.order : 0,
    dependsOn: Array.isArray(input.dependsOn) ? input.dependsOn.slice() : [],
    ts:
      opts.now ||
      input.ts ||
      new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),

    run: String(input.run || env.PIPELINE_RUN || env.GIT_BRANCH || ""),
    step:
      input.step === undefined || input.step === null ? "" : String(input.step),
    skill: String(input.skill || ""),

    system,
    access,
    kind,
    consequence,
    produces:
      input.produces === undefined ? spec.produces : input.produces || null,

    intent,
    target: input.target || {},
    desired: input.desired === undefined ? null : input.desired,
    observed: input.observed === undefined ? null : input.observed,
    satisfied: input.satisfied === true,

    manual: input.manual || null,
    command: input.command || null,
    verify: input.verify || null,

    // `=== true`, never truthiness: a caller passing the STRING "false" — which is
    // what every shell chokepoint passes, since a shell has no booleans — would
    // otherwise mark the record blocking and put a banner at the top of a
    // checklist that has nothing blocking in it. A banner that cries wolf is
    // worse than no banner, because the one run that IS blocked then reads the
    // same as the twenty that were not.
    blocking: input.blocking === true || input.blocking === "true",
    retry_of: input.retry_of || null,
  };

  // Redact BEFORE hashing, so an id is stable whether or not a secret happened
  // to be expanded in the caller's environment at the time.
  const envTable = buildEnvTable(env);
  const redacted = redactDeep(rec, envTable);
  redacted.id = input.id || computeId(redacted);
  return redacted;
}

/**
 * Append one record to the journal. Returns the record as written.
 *
 * @param {object} input - the record fields
 * @param {object} [opts] - {journal, env, cwd, now, roster, docPath}
 */
function defer(input, opts = {}) {
  const file = journalPath(opts);
  const rec = buildRecord(
    Number.isFinite(input.order) ? input : { ...input, order: nextOrder(file) },
    opts,
  );
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // One `appendFileSync` of a single line: under 4 KiB this is atomic on POSIX,
  // which is what lets a node script and a shell function write in the same
  // step without a lock.
  fs.appendFileSync(file, `${JSON.stringify(rec)}\n`, "utf8");
  return rec;
}

/**
 * Read a journal into records, skipping malformed lines with a warning.
 * Shared with the renderers so both agree on what "a journal" means.
 *
 * @returns {{records: object[], warnings: string[]}}
 */
function readJournal(file, { onWarn } = {}) {
  const warnings = [];
  const warn = (m) => {
    warnings.push(m);
    if (onWarn) onWarn(m);
  };
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return { records: [], warnings };
  }
  const records = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch (e) {
      warn(`line ${i + 1}: skipped — not valid JSON (${e.message})`);
      return;
    }
    if (!rec || typeof rec !== "object") {
      warn(`line ${i + 1}: skipped — not an object`);
      return;
    }
    if (Number.isFinite(rec.v) && rec.v > SCHEMA_VERSION) {
      // Guessing at a future schema is how a renderer emits a wrong checklist.
      warn(
        `line ${i + 1}: skipped — record schema v${rec.v} is newer than this ` +
          `reader (v${SCHEMA_VERSION})`,
      );
      return;
    }
    if (!rec.kind || !rec.id) {
      warn(`line ${i + 1}: skipped — missing \`id\` or \`kind\``);
      return;
    }
    records.push(rec);
  });
  return { records, warnings };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = `Usage: defer-mutation --kind <kind> --intent <text> [options]

Appends one deferred-mutation record to the journal
(default .claude/state/tracker-actions.jsonl, override with TRACKER_ACTIONS_JOURNAL).

Required:
  --kind <k>            one of the roster kinds in ${ROSTER_DOC}
  --intent <text>       one-line, imperative, human-facing

Common:
  --system <s>          jira | github (default: the kind's namespace)
  --access <mode>       ${ACCESS_MODES.join(" | ")} (default: $ACCESS_TRACKER, else full)
  --target <json>       e.g. '{"issue":"PROJ-1","url":"…"}'
  --desired <json>      e.g. '{"status":"In Review"}'
  --consequence <c>     ${CONSEQUENCES.join(" | ")} (may harden the roster default, never soften)
  --produces <sym>      symbol this action yields
  --depends-on <ids>    comma-separated record ids
  --satisfied           mark already-correct
  --blocking            nothing after this can proceed until a human performs it
  --retry-of <id>       this is a FAILED full-access mutation, not a policy deferral

Renderings:
  --manual-ui <text>          the click path
  --manual-deep-link <url>    where to start
  --manual-field <n=v>        repeatable
  --command-argv <json>       e.g. '["gh","issue","comment","1","--body-file","-"]'
  --stdin <text> | --stdin-file <path>
  --verify-cmd <cmd>          cheap read-back
  --verify-expect <text>

Provenance:
  --run <r>  --step <s>  --skill <s>

Other:
  --journal <path>      override the journal path
  --list-kinds          print the roster and exit
  --resolve-access      print the resolved access mode and exit (no roster, no
                        write); exits 2 on an unrecognised value
  --json                print the written record as JSON
  -h, --help`;

function parseArgs(argv) {
  const args = {
    manualFields: [],
    dependsOn: [],
  };
  const rest = argv.slice(2);
  const need = (i, flag) => {
    if (i + 1 >= rest.length) throw new Error(`${flag} requires a value`);
    return rest[i + 1];
  };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    switch (a) {
      case "-h":
      case "--help":
        args.help = true;
        break;
      case "--json":
        args.json = true;
        break;
      case "--list-kinds":
        args.listKinds = true;
        break;
      case "--resolve-access":
        args.resolveAccess = true;
        break;
      case "--satisfied":
        args.satisfied = true;
        break;
      case "--blocking":
        args.blocking = true;
        break;
      case "--kind":
        args.kind = need(i, a);
        i++;
        break;
      case "--system":
        args.system = need(i, a);
        i++;
        break;
      case "--access":
        args.access = need(i, a);
        i++;
        break;
      case "--intent":
        args.intent = need(i, a);
        i++;
        break;
      case "--consequence":
        args.consequence = need(i, a);
        i++;
        break;
      case "--produces":
        args.produces = need(i, a);
        i++;
        break;
      case "--target":
        args.target = need(i, a);
        i++;
        break;
      case "--desired":
        args.desired = need(i, a);
        i++;
        break;
      case "--depends-on":
        args.dependsOn = need(i, a)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        i++;
        break;
      case "--retry-of":
        args.retryOf = need(i, a);
        i++;
        break;
      case "--manual-ui":
        args.manualUi = need(i, a);
        i++;
        break;
      case "--manual-deep-link":
        args.manualDeepLink = need(i, a);
        i++;
        break;
      case "--manual-field": {
        const raw = need(i, a);
        const eq = raw.indexOf("=");
        if (eq < 1)
          throw new Error(`--manual-field expects name=value, got "${raw}"`);
        args.manualFields.push({
          name: raw.slice(0, eq),
          value: raw.slice(eq + 1),
        });
        i++;
        break;
      }
      case "--command-argv":
        args.commandArgv = need(i, a);
        i++;
        break;
      case "--stdin":
        args.stdin = need(i, a);
        i++;
        break;
      case "--stdin-file":
        args.stdinFile = need(i, a);
        i++;
        break;
      case "--verify-cmd":
        args.verifyCmd = need(i, a);
        i++;
        break;
      case "--verify-expect":
        args.verifyExpect = need(i, a);
        i++;
        break;
      case "--run":
        args.run = need(i, a);
        i++;
        break;
      case "--step":
        args.step = need(i, a);
        i++;
        break;
      case "--skill":
        args.skill = need(i, a);
        i++;
        break;
      case "--journal":
        args.journal = need(i, a);
        i++;
        break;
      default:
        throw new Error(`unknown flag "${a}"`);
    }
  }
  return args;
}

function parseJsonFlag(raw, flag) {
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`${flag} must be valid JSON: ${e.message}`);
  }
}

function run({
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

  // --resolve-access: print the fully-resolved tracker access mode and exit.
  //
  // This exists so a SHELL guard does not have to re-implement the mode table.
  // There were already four copies of that contract in the tree and a fifth was
  // one `.sh` file away; `set-github-project-{priority,estimate}.sh` now ask this
  // CLI the same question `gh-stage.js` asks the same function, so the two can
  // never drift. It runs BEFORE `loadRoster` because it needs no roster — a
  // partially-bundled install should still be able to answer "am I restricted?".
  //
  // An unrecognised value EXITS 2 with the reason on stderr rather than printing
  // a mode: a refusal is not a resolution, and printing "manual" here would make
  // the caller unable to tell a declared restriction from a typo. The shell side
  // fails closed to `manual` on the non-zero exit, which is the same answer, but
  // arrived at by the caller's own policy rather than by this CLI guessing.
  if (args.resolveAccess) {
    let mode;
    try {
      mode = resolveAccessTracker(env, { cwd });
    } catch (e) {
      console.error(`Error: ${e.message}`);
      return { exitCode: 2 };
    }
    console.log(mode);
    return { exitCode: 0, access: mode };
  }

  let roster;
  try {
    roster = loadRoster();
  } catch (e) {
    console.error(`Error: ${e.message}`);
    return { exitCode: 2 };
  }

  if (args.listKinds) {
    for (const spec of roster.values()) {
      console.log(`${spec.kind}\t${spec.consequence}\t${spec.produces || "-"}`);
    }
    return { exitCode: 0, kinds: roster.size };
  }

  let stdin = args.stdin;
  if (args.stdinFile !== undefined) {
    try {
      stdin = fs.readFileSync(args.stdinFile, "utf8");
    } catch (e) {
      console.error(`Error: --stdin-file unreadable: ${e.message}`);
      return { exitCode: 2 };
    }
  }

  let input;
  try {
    const commandArgv = parseJsonFlag(args.commandArgv, "--command-argv");
    if (commandArgv !== undefined && !Array.isArray(commandArgv)) {
      throw new Error("--command-argv must be a JSON array");
    }
    input = {
      kind: args.kind,
      system: args.system,
      access: args.access,
      intent: args.intent,
      consequence: args.consequence,
      produces: args.produces,
      dependsOn: args.dependsOn,
      satisfied: args.satisfied,
      blocking: args.blocking,
      retry_of: args.retryOf,
      target: parseJsonFlag(args.target, "--target"),
      desired: parseJsonFlag(args.desired, "--desired"),
      run: args.run,
      step: args.step,
      skill: args.skill,
      manual:
        args.manualUi || args.manualDeepLink || args.manualFields.length
          ? {
              deepLink: args.manualDeepLink || null,
              ui: args.manualUi || "",
              fields: args.manualFields,
            }
          : null,
      command:
        commandArgv !== undefined
          ? { argv: commandArgv, stdin: stdin === undefined ? null : stdin }
          : null,
      verify:
        args.verifyCmd || args.verifyExpect
          ? { cmd: args.verifyCmd || "", expect: args.verifyExpect || "" }
          : null,
    };
  } catch (e) {
    console.error(`Error: ${e.message}`);
    return { exitCode: 2 };
  }

  let rec;
  try {
    rec = defer(input, { journal: args.journal, env, cwd, roster });
  } catch (e) {
    console.error(`Error: ${e.message}`);
    return { exitCode: 2 };
  }

  if (args.json) console.log(JSON.stringify(rec, null, 2));
  else console.log(`📝 deferred ${rec.kind} (${rec.id}) — ${rec.intent}`);
  return { exitCode: 0, record: rec };
}

if (require.main === module) {
  const r = run();
  process.exit(r.exitCode || 0);
}

module.exports = {
  SCHEMA_VERSION,
  DEFAULT_JOURNAL,
  ACCESS_MODES,
  CONSEQUENCES,
  CONSEQUENCE_RANK,
  resolveAccessTracker,
  readConfiguredAccessTracker,
  resolveConfigPath,
  CHILD_ENV_AT_LOAD,
  parseRoster,
  loadRoster,
  buildEnvTable,
  redactString,
  maskOrName,
  redactArgv,
  redactDeep,
  stableStringify,
  computeId,
  journalPath,
  nextOrder,
  buildRecord,
  defer,
  readJournal,
  parseArgs,
  run,
  USAGE,
};
