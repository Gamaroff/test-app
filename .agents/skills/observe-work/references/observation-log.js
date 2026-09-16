#!/usr/bin/env node
// AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/observation-log.js. Regenerate via `npm run bundle`.
/**
 * observation-log — every read and every write of the observation log.
 *
 * A peer of tracker-comment.js and change-log.js: same CommonJS shape, same
 * `--json` `{ reason }` contract, same posture that a step-doc author who has
 * read one of these has read this one. Pure and local — it takes no dependency
 * on resolve-platform.sh, on any tracker module, or on the network. The
 * observation log is local state with no remote.
 *
 * Why this is code and not prose: the upstream methodology this adapts
 * (rebelytics/one-skill-to-rule-them-all, CC BY 4.0 — see
 * observation-log-contract.md for the full attribution) expresses its
 * correctness guards as POSIX shell snippets embedded in SKILL.md, which the
 * agent must retype correctly before EVERY write. A skipped snippet is silent:
 * the log still looks healthy. Here the guards are inside the call path, so
 * there is no way to reach `write` without them.
 *
 * Usage:
 *   observation-log.js <subcommand> [--workspace <path>] [--json] [--quiet]
 *                      [--dry-run]
 *
 * Subcommands:
 *   init                        create the workspace tree
 *   scan [--status <s>]         frontmatter-only read of every entry
 *   queue                       the review work queue, with reconciliation
 *   next-id                     sweep, then derive the next id
 *   write --title … --skill …   sweep -> derive -> create -> write
 *        --siblings-checked … --body-file …
 *   set-status --id N --status s [--parked-until …] [--resolution …]
 *   archive                     standalone stale sweep
 *   families [--audit]          read skill-families.md; audit shared rules
 *   checkpoint --note …         append an acknowledgement marker
 *   doctor                      workspace health
 *
 * Exit codes (the success family and the usage code are transcribed from
 * tracker-comment.js so the `|| echo "⚠️ …"` subshell idiom keeps working):
 *   0  ok, already, empty, dry-run — and any unhandled throw
 *   1  a guard tripped: scan-broken, id-broken, collision,
 *      ephemeral-workspace, fork-detected, invalid-frontmatter,
 *      parked-without-condition
 *   2  usage error (unknown subcommand, unknown flag, missing argument)
 *
 * Exit 1 means something DIFFERENT here than in tracker-comment.js, and
 * deliberately. There, 1 is a skip under --strict. Here the guards are the
 * entire point of the engine, and a tripped guard is a real failure a caller
 * must not proceed past.
 *
 * `reason` vocabulary — every value is reachable from at least one test:
 *   ok                        the operation completed
 *   already                   nothing to do; the state was already correct
 *   empty                     the log is genuinely empty (NOT scan-broken)
 *   scan-broken               files present, zero frontmatter headers parsed
 *   id-broken                 log non-empty, no ids extracted
 *   collision                 the target path already existed
 *   ephemeral-workspace       the anchor is torn down with its checkout
 *   fork-detected             a second skill-observations/ at another anchor
 *   invalid-frontmatter       a file's header could not be parsed
 *   parked-without-condition  status: parked with no parked_until
 *   dry-run                   --dry-run; nothing read, nothing written
 *   usage                     the invocation was wrong; always paired with exit 2
 *
 * Deliberately NOT in the CLI surface:
 *   --id on `write`.  A batch that pre-computes a base and hardcodes sequential
 *     numbers collapses N independent max-checks into one stale read. Upstream
 *     records a hardcoded id colliding with one a parallel review issued
 *     between the check and the write. The ABSENCE of the flag is the
 *     enforcement; prose asking the author to re-derive per file is not.
 *   an inline --body.  Bodies carry backticks, `$(…)` and newlines — the same
 *     reason tracker-comment.js requires --body-file.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { StringDecoder } = require("string_decoder");

const { parseYamlSubset } = require("./yaml-subset.js");

// ── vocabulary ───────────────────────────────────────────────────────────────

// `parked` is NOT here, and that is the single most load-bearing omission in
// this file. It means decided-but-blocked: it leaves the work queue, requires
// `parked_until:`, and never archives. It satisfies neither half of the
// archival gate — not in this set, and carrying no `resolved:` date. A
// reasonable-looking simplification ("it has left the queue, so archive it")
// silently removes live entries from view: a parked entry that archives never
// has its condition re-checked, so it is lost rather than deferred.
const RESOLVED_SET = new Set(["actioned", "declined", "superseded"]);

const STATUS_VALUES = new Set([
  "open",
  "actioned",
  "declined",
  "superseded",
  "parked",
]);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const SUBCOMMANDS = new Set([
  "init",
  "scan",
  "queue",
  "next-id",
  "write",
  "set-status",
  "archive",
  "families",
  "checkpoint",
  "doctor",
]);

// ── small helpers ────────────────────────────────────────────────────────────

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function slugify(title) {
  const s = String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return s || "observation";
}

function pad4(n) {
  return String(n).padStart(4, "0");
}

/** Every `.md` file directly in `dir`. Missing dir is an empty list, not a throw. */
function listMarkdown(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => e.name)
    .sort();
}

/**
 * The `NNNN-` prefixes in `dir`, parsed BASE 10 — explicitly.
 *
 * This radix is the whole of the octal fix. Upstream feeds zero-padded
 * prefixes into shell arithmetic, where `$(( 0105 + 1 ))` evaluates as octal
 * and yields 70, and `0108` is not a valid octal constant at all and errors
 * the entire derivation. Upstream mitigates with a `sed` that strips leading
 * zeros — a mitigation that works exactly as often as it is retyped.
 *
 * Do NOT add a zero-stripping step here. It is unnecessary in JavaScript, and
 * its presence would tell the next reader the hazard is still live.
 */
function prefixes(dir) {
  const out = [];
  for (const name of listMarkdown(dir)) {
    const m = /^(\d+)-/.exec(name);
    if (m) out.push(parseInt(m[1], 10));
  }
  return out.filter((n) => Number.isFinite(n));
}

function idFloorPath(logDir) {
  return path.join(logDir, "archive", ".id-floor");
}

function readIdFloor(logDir) {
  try {
    const raw = fs.readFileSync(idFloorPath(logDir), "utf8").trim();
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function writeIdFloor(logDir, n) {
  const p = idFloorPath(logDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${n}\n`, "utf8");
}

/**
 * The block between the first two `---` lines, parsed. Returns null when there
 * is no parseable header — callers treat null as "did not parse", which is what
 * the independent-count guards are counting.
 *
 * Reads frontmatter ONLY. The body is never returned, which is the property the
 * per-file layout exists to provide: scan cost grows with file count, not with
 * body size.
 */
function parseFrontmatter(text) {
  if (typeof text !== "string") return null;
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  if (lines[i] === undefined || lines[i].trim() !== "---") return null;
  const start = i + 1;
  let end = -1;
  for (let j = start; j < lines.length; j++) {
    if (lines[j].trim() === "---") {
      end = j;
      break;
    }
  }
  if (end === -1) return null;
  try {
    const obj = parseYamlSubset(lines.slice(start, end).join("\n"));
    return obj && typeof obj === "object" ? obj : null;
  } catch {
    return null;
  }
}

/**
 * Read ONLY as far as the closing `---`, and stop.
 *
 * `readFileSync` then discard-the-body would give the same parse and a very
 * different cost: it pulls every byte of every body into memory to throw them
 * away. This reads in chunks and returns the moment the header is closed, so
 * `scan` cost grows with FILE COUNT and not with body size — which is the whole
 * reason the log is a directory of small files instead of one big one.
 *
 * `bytesRead` is returned so a test can assert the property directly rather
 * than inferring it from a wall-clock threshold. This repo has been bitten by
 * load-sensitive timing assertions twice; a byte count is not load-sensitive.
 */
const FM_CHUNK = 8192;
const FM_MAX = 64 * 1024; // a header past this is not a header

function readFrontmatterBounded(file) {
  let fd;
  try {
    fd = fs.openSync(file, "r");
  } catch {
    return { fm: null, bytesRead: 0 };
  }
  try {
    const buf = Buffer.allocUnsafe(FM_CHUNK);
    // A StringDecoder, not `buf.toString("utf8", …)`. Decoding each chunk
    // independently splits any multi-byte character that straddles the chunk
    // boundary into two invalid sequences, and both decode to U+FFFD — silent
    // corruption, because the header still parses afterwards. Reproduced at all
    // eight byte alignments; a single-offset probe passes by luck, which is why
    // the covering test sweeps alignments. StringDecoder holds an incomplete
    // sequence back until the next chunk completes it.
    const decoder = new StringDecoder("utf8");
    let acc = "";
    let bytesRead = 0;
    let seenOpen = false;
    for (;;) {
      const n = fs.readSync(fd, buf, 0, FM_CHUNK, null);
      if (n <= 0) break;
      bytesRead += n;
      acc += decoder.write(buf.subarray(0, n));

      // Find the opening marker once, then the closing one. Only ever look at
      // complete lines, so a `---` split across a chunk boundary is not missed.
      const lines = acc.split(/\r?\n/);
      const complete = lines.slice(0, -1);
      let openAt = -1;
      for (let i = 0; i < complete.length; i++) {
        if (complete[i].trim() === "") continue;
        openAt = complete[i].trim() === "---" ? i : -2;
        break;
      }
      if (openAt === -2) return { fm: null, bytesRead }; // no header at all
      if (openAt >= 0) {
        seenOpen = true;
        for (let j = openAt + 1; j < complete.length; j++) {
          if (complete[j].trim() === "---") {
            const header = complete.slice(0, j + 1).join("\n") + "\n---\n";
            return { fm: parseFrontmatter(header), bytesRead };
          }
        }
      }
      if (bytesRead >= FM_MAX) break;
    }
    // EOF (or the cap) with no closing marker. Flush whatever the decoder is
    // still holding, so a final complete character is not dropped.
    acc += decoder.end();
    return { fm: seenOpen ? parseFrontmatter(acc) : null, bytesRead };
  } catch {
    return { fm: null, bytesRead: 0 };
  } finally {
    fs.closeSync(fd);
  }
}

function readFrontmatter(file) {
  return readFrontmatterBounded(file).fm;
}

/** A missing `status:` reads as `open` — never as nonexistent. */
function statusOf(fm) {
  const s = fm && fm.status != null ? String(fm.status).trim() : "";
  return s === "" ? "open" : s;
}

/** `skill:` is always a list, even with one entry and even with none. */
function asList(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map((x) => String(x));
  const s = String(v).trim();
  return s === "" ? [] : [s];
}

// ── the archival sweep ───────────────────────────────────────────────────────

/**
 * A file archives when BOTH halves hold: a resolved status, AND a well-formed
 * `resolved:` date STRICTLY BEFORE today. ISO dates compare lexically, so the
 * second half needs no date library.
 *
 * The grace period lives in the file, not in session memory. A file resolved
 * today stays until tomorrow, whichever session resolved it and whichever
 * session sweeps — that is what makes the rule hold across parallel sessions.
 * A rule phrased "don't archive what you just resolved" is only enforceable
 * within one session's memory, and there is more than one session.
 */
function isStale(fm, now) {
  if (!fm) return false;
  if (!RESOLVED_SET.has(statusOf(fm))) return false;
  const r = fm.resolved == null ? "" : String(fm.resolved).trim();
  // A resolved file with an unreadable date is SKIPPED, not archived. The date
  // is repaired separately and deliberately; archiving on a malformed date
  // would file away exactly the least trustworthy entries.
  if (!ISO_DATE.test(r)) return false;
  return r < now;
}

function sweepResolved(logDir, opts) {
  const now = (opts && opts.now) || today();
  const dryRun = !!(opts && opts.dryRun);
  const archiveDir = path.join(logDir, "archive");
  const moved = [];
  const skipped = [];

  for (const name of listMarkdown(logDir)) {
    const src = path.join(logDir, name);
    const fm = readFrontmatter(src);
    if (!fm) {
      skipped.push({ file: name, why: "invalid-frontmatter" });
      continue;
    }
    if (!isStale(fm, now)) continue;
    if (dryRun) {
      moved.push(name);
      continue;
    }
    fs.mkdirSync(archiveDir, { recursive: true });
    const dest = path.join(archiveDir, name);
    // Refuse rather than overwrite. `fs.renameSync` clobbers an existing
    // destination silently, which would destroy the archived observation and
    // still report `ok` — the exact shape of loss `write`'s `wx` create exists
    // to prevent, in the one operation that moves files. The two must hold the
    // same line, or the engine's stated posture is only true where it is cheap.
    //
    // Reachable whenever an active and an archived file share a name: an
    // observation restored from the archive to be reopened, a `git checkout` of
    // a deleted active file, or a corrupted `.id-floor` permitting id reuse.
    if (fs.existsSync(dest)) {
      skipped.push({ file: name, why: "collision" });
      continue;
    }
    fs.renameSync(src, dest);
    moved.push(name);
  }
  return { moved, skipped };
}

// ── id derivation ────────────────────────────────────────────────────────────

/**
 * The next id is one more than the highest of THREE inputs: the highest active
 * prefix, the highest archived prefix, and `.id-floor`.
 *
 * The floor is the third input because without it a log whose every entry has
 * been archived derives from an empty active directory and restarts at 1.
 *
 * The archival sweep runs FIRST, INSIDE this function, so it cannot be skipped
 * by any write path. Upstream folds the sweep into its id snippet for exactly
 * this reason and records that the prose alternative ("on every write, first
 * archive") under-fires. Here the coupling is a function call, so it survives
 * someone simplifying the surrounding code.
 */
function nextId(logDir, opts) {
  const sweep = sweepResolved(logDir, opts);

  const ids = [
    ...prefixes(logDir),
    ...prefixes(path.join(logDir, "archive")),
    readIdFloor(logDir),
  ];
  const hi = Math.max(0, ...ids);

  // An empty result over a populated log is a claim about the instrument, not
  // a finding. Files exist and no id came out of any of the three inputs —
  // that is the derivation being broken, not the log being new.
  if (hi === 0 && listMarkdown(logDir).length > 0) {
    return { reason: "id-broken", id: null, sweep };
  }

  const id = hi + 1;
  if (!(opts && opts.dryRun)) writeIdFloor(logDir, id);
  return { reason: "ok", id, sweep };
}

// ── workspace ────────────────────────────────────────────────────────────────

const EPHEMERAL_PATTERNS = [
  { re: /(^|\/)\.claude\/worktrees(\/|$)/, why: "inside .claude/worktrees/" },
  { re: /^\/(private\/)?tmp(\/|$)/, why: "inside a temporary directory" },
  { re: /^\/var\/tmp(\/|$)/, why: "inside a temporary directory" },
];

function ephemeralReason(ws) {
  for (const p of EPHEMERAL_PATTERNS) if (p.re.test(ws)) return p.why;
  return null;
}

function paths(workspace) {
  const root = path.join(workspace, "skill-observations");
  return {
    workspace,
    root,
    logDir: path.join(root, "observation-log"),
    archiveDir: path.join(root, "observation-log", "archive"),
    principles: path.join(root, "cross-cutting-principles.md"),
    families: path.join(root, "skill-families.md"),
    lastReview: path.join(root, "last-review-date.txt"),
    checkpoints: path.join(root, "checkpoints.log"),
    staging: path.join(workspace, "skill-updates"),
  };
}

/**
 * The workspace, from --workspace or $OBS_WORKSPACE.
 *
 * This engine does NOT re-derive the project-identity default: that is
 * resolve-observation-workspace.sh's job, and two derivations of the same path
 * that drift is the silent-fork failure `doctor` exists to catch. Callers
 * source the resolver, guarded, and the engine reads what it exported.
 */
function resolveWorkspace(args) {
  const ws = args.workspace || process.env.OBS_WORKSPACE || "";
  if (!ws) {
    return {
      error:
        "no workspace: pass --workspace <path>, or source " +
        "resolve-observation-workspace.sh (guarded with `|| exit 1`) first",
    };
  }
  const abs = path.resolve(ws);
  const why = ephemeralReason(abs);
  if (why) return { workspace: abs, ephemeral: why };
  return { workspace: abs };
}

// ── subcommands ──────────────────────────────────────────────────────────────

function cmdInit(P, args) {
  const created = [];
  const ensureDir = (d) => {
    if (!fs.existsSync(d)) {
      if (!args.dryRun) fs.mkdirSync(d, { recursive: true });
      created.push(d);
    }
  };
  const ensureFile = (f, body) => {
    if (!fs.existsSync(f)) {
      if (!args.dryRun) fs.writeFileSync(f, body, "utf8");
      created.push(f);
    }
  };

  ensureDir(P.logDir);
  ensureDir(P.archiveDir);
  ensureDir(P.staging);
  ensureFile(
    P.principles,
    "# Cross-cutting principles\n\nPrinciples that apply across skills, promoted from individual observations.\n",
  );
  ensureFile(
    P.families,
    "# Skill families\n\n| Family | Members | Shared | Member-specific |\n|---|---|---|---|\n",
  );
  // The literal `never`, NEVER a date. A date means a review actually ran, and
  // seeding one at setup suppresses the first review forever: the log
  // accumulates, "days since review" stays plausible, and nothing surfaces.
  ensureFile(P.lastReview, "never\n");
  ensureFile(P.checkpoints, "");

  return {
    reason: created.length ? "ok" : "already",
    created,
    workspace: P.workspace,
    exitCode: 0,
  };
}

function cmdScan(P, args) {
  // Two counts, derived by DIFFERENT means: one from the directory
  // enumeration, one from the parse. The count is kept out of the stream it
  // guards — upstream records a real failure where a counter incremented
  // inside a printing loop lived in a subshell once the loop was piped, and
  // the guard then reported "0 parsed" directly under a screen of correct
  // output.
  const files = listMarkdown(P.logDir);
  const entries = [];
  const unparseable = [];

  for (const name of files) {
    const fm = readFrontmatter(path.join(P.logDir, name));
    if (!fm) {
      unparseable.push(name);
      continue;
    }
    entries.push({
      file: name,
      id: fm.id != null ? parseInt(String(fm.id), 10) : null,
      title: fm.title != null ? String(fm.title) : "",
      status: statusOf(fm),
      parked_until: fm.parked_until != null ? String(fm.parked_until) : "",
      type: fm.type != null ? String(fm.type) : "",
      skill: asList(fm.skill),
      proposes_skill: asList(fm.proposes_skill),
      siblings_checked:
        fm.siblings_checked != null ? String(fm.siblings_checked) : "",
      area: fm.area != null ? String(fm.area) : "",
      date: fm.date != null ? String(fm.date) : "",
      resolved: fm.resolved != null ? String(fm.resolved) : "",
      resolution: fm.resolution != null ? String(fm.resolution) : "",
      reference: fm.reference != null ? String(fm.reference) : "",
    });
  }

  // Files present and nothing parsed: the instrument is broken, not the log
  // empty. These are different `reason` values because they are different
  // answers, and collapsing them is how "the one answer that never gets
  // questioned" gets returned forever.
  if (files.length > 0 && entries.length === 0) {
    return {
      reason: "scan-broken",
      files: files.length,
      parsed: 0,
      unparseable,
      exitCode: 1,
    };
  }

  let out = entries;
  if (args.status) out = entries.filter((e) => e.status === args.status);

  return {
    reason: files.length === 0 ? "empty" : "ok",
    files: files.length,
    parsed: entries.length,
    unparseable,
    count: out.length,
    entries: out,
    exitCode: 0,
  };
}

function cmdQueue(P) {
  // The queue is derived from the DIRECTORY LISTING, never from a
  // `grep 'status: open'`. A grep over an optional field silently drops every
  // file that omits it — and `status` is optional, and its absence means
  // `open`, so the grep drops exactly the files that most belong here.
  const files = listMarkdown(P.logDir);
  const open = [];
  const parked = [];
  const resolved = [];
  const statusless = [];
  const unparseable = [];

  for (const name of files) {
    const fm = readFrontmatter(path.join(P.logDir, name));
    if (!fm) {
      unparseable.push(name);
      continue;
    }
    const hasStatus = fm.status != null && String(fm.status).trim() !== "";
    if (!hasStatus) statusless.push(name);

    const s = statusOf(fm);
    if (s === "parked") parked.push(name);
    else if (RESOLVED_SET.has(s)) resolved.push(name);
    else open.push(name);
  }

  if (files.length > 0 && files.length === unparseable.length) {
    return {
      reason: "scan-broken",
      files: files.length,
      parsed: 0,
      unparseable,
      exitCode: 1,
    };
  }

  const classified = open.length + parked.length + resolved.length;
  const total = files.length - unparseable.length;

  return {
    reason: files.length === 0 ? "empty" : "ok",
    total,
    open,
    parked,
    resolved,
    // Named explicitly, and counted as OPEN. Counting them without naming
    // them would make the queue correct and the reason for its size invisible.
    statusless,
    unparseable,
    reconciled: total === classified,
    exitCode: 0,
  };
}

function cmdNextId(P, args) {
  const r = nextId(P.logDir, { dryRun: args.dryRun, now: args.now });
  if (r.reason === "id-broken") {
    return {
      reason: "id-broken",
      id: null,
      archived: r.sweep.moved,
      exitCode: 1,
    };
  }
  return { reason: "ok", id: r.id, archived: r.sweep.moved, exitCode: 0 };
}

function renderObservation(fm, body) {
  const lines = ["---"];
  lines.push(`id: ${fm.id}`);
  lines.push(`title: ${JSON.stringify(fm.title)}`);
  lines.push(`status: ${fm.status}`);
  // `kv` never emits a trailing space on an empty value — a generated file
  // full of "key: " lines invites an editor's trim-on-save to rewrite every
  // observation the moment anyone opens one.
  const kv = (k, v) => (v === "" || v == null ? `${k}:` : `${k}: ${v}`);
  lines.push(
    kv("parked_until", fm.parked_until ? JSON.stringify(fm.parked_until) : ""),
  );
  lines.push(kv("type", fm.type));
  lines.push("skill:");
  // Always serialised as a list, even with one entry and even with none — so
  // no consumer ever branches on string-vs-list.
  for (const s of fm.skill) lines.push(`  - ${s}`);
  lines.push("proposes_skill:");
  for (const s of fm.proposes_skill) lines.push(`  - ${s}`);
  lines.push(`siblings_checked: ${JSON.stringify(fm.siblings_checked)}`);
  lines.push(kv("area", fm.area));
  lines.push(kv("date", fm.date));
  lines.push(`session_context: ${JSON.stringify(fm.session_context || "")}`);
  lines.push("resolved:");
  lines.push("resolution:");
  lines.push(kv("reference", fm.reference || ""));
  lines.push("---");
  lines.push("");
  lines.push(body.replace(/\s*$/, ""));
  lines.push("");
  return lines.join("\n");
}

function cmdWrite(P, args) {
  const missing = [];
  if (!args.title) missing.push("--title");
  if (!args.bodyFile) missing.push("--body-file");
  // Rejected at the CLI boundary rather than defaulted to `none`. The field's
  // entire value is that its ABSENCE is visible: the two states of a one-entry
  // `skill:` list — siblings evaluated and correctly excluded, versus siblings
  // never considered — are byte-identical, and a default would restore exactly
  // that indistinguishability.
  if (!args.siblingsChecked) missing.push("--siblings-checked");
  if (missing.length) {
    return {
      reason: "usage",
      error: `missing required argument(s): ${missing.join(", ")}`,
      exitCode: 2,
    };
  }

  let body;
  try {
    body = fs.readFileSync(args.bodyFile, "utf8");
  } catch (e) {
    return {
      reason: "usage",
      error: `--body-file unreadable: ${e.message}`,
      exitCode: 2,
    };
  }

  if (args.dryRun) {
    return { reason: "dry-run", id: null, file: null, exitCode: 0 };
  }

  fs.mkdirSync(P.logDir, { recursive: true });

  const attempt = (n) => {
    const r = nextId(P.logDir, { now: args.now });
    if (r.reason === "id-broken") return { broken: true, sweep: r.sweep };
    const file = `${pad4(r.id)}-${slugify(args.title)}.md`;
    const target = path.join(P.logDir, file);
    const fm = {
      id: r.id,
      title: args.title,
      status: "open",
      parked_until: "",
      type: args.type || "internal",
      skill: args.skill,
      proposes_skill: args.proposesSkill,
      siblings_checked: args.siblingsChecked,
      area: args.area || "",
      date: args.now || today(),
      session_context: args.sessionContext || "",
      reference: args.reference || "",
    };
    try {
      // `wx` — fails if the path exists, and never truncates. `w` would
      // silently overwrite a concurrent writer's observation.
      const fd = fs.openSync(target, "wx");
      try {
        fs.writeFileSync(fd, renderObservation(fm, body), "utf8");
      } finally {
        fs.closeSync(fd);
      }
      return { ok: true, id: r.id, file, archived: r.sweep.moved, n };
    } catch (e) {
      if (e.code === "EEXIST") return { collision: true, file };
      throw e;
    }
  };

  let r = attempt(1);
  if (r.broken) return { reason: "id-broken", id: null, exitCode: 1 };
  if (r.collision) {
    // Re-derive ONCE. A second collision is not a race any more — it is a
    // broken derivation, and retrying forever would hide that.
    const first = r.file;
    r = attempt(2);
    if (r.broken) return { reason: "id-broken", id: null, exitCode: 1 };
    if (r.collision) {
      return {
        reason: "collision",
        file: r.file,
        firstAttempt: first,
        exitCode: 1,
      };
    }
    return {
      reason: "ok",
      id: r.id,
      file: r.file,
      path: path.join(P.logDir, r.file),
      archived: r.archived,
      rederived: true,
      exitCode: 0,
    };
  }
  return {
    reason: "ok",
    id: r.id,
    file: r.file,
    path: path.join(P.logDir, r.file),
    archived: r.archived,
    rederived: false,
    exitCode: 0,
  };
}

function findById(logDir, id) {
  for (const name of listMarkdown(logDir)) {
    const m = /^(\d+)-/.exec(name);
    if (m && parseInt(m[1], 10) === id) return name;
  }
  return null;
}

/** Rewrite only the four lifecycle keys, in place, leaving every other line alone. */
function rewriteLifecycle(text, updates) {
  const lines = text.split(/\r?\n/);
  let start = -1;
  let end = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      if (start === -1) start = i;
      else {
        end = i;
        break;
      }
    }
  }
  if (start === -1 || end === -1) return null;

  const seen = new Set();
  for (let i = start + 1; i < end; i++) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*):/.exec(lines[i]);
    if (!m) continue;
    const key = m[1];
    if (!Object.prototype.hasOwnProperty.call(updates, key)) continue;
    const v = updates[key];
    lines[i] = v === "" ? `${key}:` : `${key}: ${JSON.stringify(v)}`;
    seen.add(key);
  }
  const additions = [];
  for (const k of Object.keys(updates)) {
    if (seen.has(k)) continue;
    const v = updates[k];
    additions.push(v === "" ? `${k}:` : `${k}: ${JSON.stringify(v)}`);
  }
  lines.splice(end, 0, ...additions);
  return lines.join("\n");
}

function cmdSetStatus(P, args) {
  if (args.id == null || !args.status) {
    return {
      reason: "usage",
      error: "set-status requires --id and --status",
      exitCode: 2,
    };
  }
  if (!STATUS_VALUES.has(args.status)) {
    return {
      reason: "usage",
      error: `unknown --status ${args.status}; expected one of ${[...STATUS_VALUES].join(", ")}`,
      exitCode: 2,
    };
  }
  // `parked` without a condition is not a state, it is a shrug. A later review
  // has nothing to answer yes or no to, so the entry never leaves parked.
  if (args.status === "parked" && !args.parkedUntil) {
    return {
      reason: "parked-without-condition",
      id: args.id,
      error: "--status parked requires --parked-until",
      exitCode: 1,
    };
  }

  // Re-read the single file immediately before editing it — a parallel review
  // may have resolved it since any earlier scan.
  const name = findById(P.logDir, args.id);
  if (!name) {
    return {
      reason: "usage",
      error: `no observation with id ${args.id}`,
      exitCode: 2,
    };
  }
  const file = path.join(P.logDir, name);
  const text = fs.readFileSync(file, "utf8");
  const fm = parseFrontmatter(text);
  if (!fm) {
    return { reason: "invalid-frontmatter", file: name, exitCode: 1 };
  }

  const updates = { status: args.status };
  if (args.status === "parked") {
    updates.parked_until = args.parkedUntil;
  } else {
    updates.parked_until = "";
  }
  if (RESOLVED_SET.has(args.status)) {
    // Gate archival correctly: a resolved status with no date never sweeps.
    updates.resolved = args.resolved || args.now || today();
    if (args.resolution) updates.resolution = args.resolution;
  }

  if (args.dryRun) {
    return { reason: "dry-run", file: name, updates, exitCode: 0 };
  }

  // Only the four lifecycle fields are writable. Every other line of the
  // header is left byte-for-byte alone.
  const next = rewriteLifecycle(text, updates);
  if (next == null) {
    return { reason: "invalid-frontmatter", file: name, exitCode: 1 };
  }
  fs.writeFileSync(file, next, "utf8");
  return { reason: "ok", id: args.id, file: name, updates, exitCode: 0 };
}

function cmdArchive(P, args) {
  const r = sweepResolved(P.logDir, { dryRun: args.dryRun, now: args.now });
  return {
    reason: r.moved.length ? "ok" : "already",
    archived: r.moved,
    skipped: r.skipped,
    exitCode: 0,
  };
}

function parseFamilies(text) {
  const families = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length < 4) continue;
    if (/^-+$/.test(cells[0].replace(/[: ]/g, "-"))) continue;
    if (cells[0].toLowerCase() === "family") continue;
    families.push({
      name: cells[0],
      members: cells[1]
        .split(/[,/]/)
        .map((s) => s.trim().replace(/^`|`$/g, ""))
        .filter(Boolean),
      shared: cells[2]
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean),
      memberSpecific: cells[3]
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean),
    });
  }
  return families;
}

function cmdFamilies(P, args) {
  let text;
  try {
    text = fs.readFileSync(P.families, "utf8");
  } catch {
    // No registry is a legitimate state, not an error — a project may simply
    // have no families yet.
    return { reason: "empty", families: [], exitCode: 0 };
  }
  const families = parseFamilies(text);
  if (!args.audit) {
    return {
      reason: families.length ? "ok" : "empty",
      count: families.length,
      families,
      exitCode: 0,
    };
  }

  const root = projectRoot(args);
  const gaps = [];
  for (const f of families) {
    for (const member of f.members) {
      const candidates = [
        path.join(root, "skills", member, "SKILL.md"),
        path.join(root, member),
      ];
      const found = candidates.find((c) => fs.existsSync(c));
      if (!found) {
        gaps.push({
          family: f.name,
          member,
          rule: null,
          why: "member-not-found",
        });
        continue;
      }
      const body = fs.readFileSync(found, "utf8");
      for (const rule of f.shared) {
        if (body.includes(rule)) continue;
        // An absence is judged against the family's Member-specific column
        // BEFORE it is called drift.
        if (
          f.memberSpecific.some((ms) => rule.includes(ms) || ms.includes(rule))
        ) {
          continue;
        }
        gaps.push({ family: f.name, member, rule, why: "rule-absent" });
      }
    }
  }
  return {
    reason: gaps.length ? "ok" : "already",
    root,
    count: families.length,
    families,
    gaps,
    exitCode: 0,
  };
}

function cmdCheckpoint(P, args) {
  if (!args.note) {
    return {
      reason: "usage",
      error: "checkpoint requires --note",
      exitCode: 2,
    };
  }
  const line = `${new Date().toISOString()}\t${args.note.replace(/[\r\n]+/g, " ")}\n`;
  if (args.dryRun) return { reason: "dry-run", line: line.trim(), exitCode: 0 };
  fs.mkdirSync(path.dirname(P.checkpoints), { recursive: true });
  // Append-only. Never rewrite the file.
  fs.appendFileSync(P.checkpoints, line, "utf8");
  return { reason: "ok", line: line.trim(), exitCode: 0 };
}

/** Encode an absolute path the way the project-identity default does. */
function encodeProjectPath(p) {
  return p.split(path.sep).join("-");
}

/**
 * The first ancestor of `from` (inclusive) holding a `.git` entry — a
 * directory in a main worktree, a file in a linked one — as
 * `{ dir, gitPath }`, or `null` outside any repository. Pure `fs`, no
 * shell-out, for the reason given on `repoWorktrees()`.
 */
function nearestGitEntry(from) {
  let dir = path.resolve(from);
  for (;;) {
    const candidate = path.join(dir, ".git");
    if (fs.existsSync(candidate)) return { dir, gitPath: candidate };
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * The directory the project's agent-instruction file and `skills/` tree hang
 * off: `--audit-root` when given, verbatim; otherwise the nearest enclosing
 * repository root; and the cwd itself only outside any repository.
 *
 * NOT the bare cwd. The documented invocation is `command node
 * references/observation-log.js …` from INSIDE `skills/observe-work/`, where
 * no AGENTS.md lives, so a cwd-anchored lookup answered "not configured" for
 * a repository whose AGENTS.md says otherwise — silently, with `reason: ok`
 * and exit 0 — and `families --audit` reported every member of every family
 * as `member-not-found` (bug 15). The workspace resolver already refuses to
 * derive from the cwd for exactly this reason; this brings the two lookups
 * into agreement. The explicit flag stays verbatim: it is an instruction, not
 * a hint, and rescuing a wrong one with the walk would make it mean nothing.
 */
function projectRoot(args) {
  if (args.auditRoot) return path.resolve(args.auditRoot);
  const cwd = process.cwd();
  const entry = nearestGitEntry(cwd);
  return entry ? entry.dir : cwd;
}

/**
 * Every worktree of the repository containing `cwd` — the main one, plus any
 * linked ones. Empty outside a repository.
 *
 * Pure `fs`; deliberately no shell-out. The engine makes no subprocess and no
 * network call, and a `git` invocation here would be the first exception to
 * that, for a question the filesystem already answers:
 *
 *   - `<root>/.git` is a DIRECTORY in the main worktree.
 *   - `<root>/.git` is a FILE in a linked worktree, holding
 *     `gitdir: <main>/.git/worktrees/<name>`.
 *   - `<main>/.git/worktrees/<name>/gitdir` holds `<worktree>/.git`.
 */
function repoWorktrees(cwd) {
  const entry = nearestGitEntry(cwd);
  if (!entry) return [];
  let { dir } = entry;
  const { gitPath } = entry;

  let mainRoot;
  try {
    if (fs.statSync(gitPath).isDirectory()) {
      mainRoot = dir;
    } else {
      // A linked worktree: follow its pointer back to the main .git.
      const m = /gitdir:\s*(.+)/.exec(fs.readFileSync(gitPath, "utf8"));
      if (!m) return [dir];
      const wtAdmin = m[1].trim(); // <main>/.git/worktrees/<name>
      const idx = wtAdmin.lastIndexOf(path.sep + "worktrees" + path.sep);
      if (idx === -1) return [dir];
      mainRoot = path.dirname(wtAdmin.slice(0, idx)); // strip the trailing /.git
    }
  } catch {
    return [dir];
  }

  const roots = new Set([mainRoot, dir]);
  const admin = path.join(mainRoot, ".git", "worktrees");
  let names = [];
  try {
    names = fs.readdirSync(admin, { withFileTypes: true });
  } catch {
    names = [];
  }
  for (const n of names) {
    if (!n.isDirectory()) continue;
    try {
      const g = fs
        .readFileSync(path.join(admin, n.name, "gitdir"), "utf8")
        .trim();
      if (g) roots.add(path.dirname(g)); // <worktree>/.git -> <worktree>
    } catch {
      /* a stale worktree admin entry is not a fork */
    }
  }
  return [...roots];
}

/**
 * Other places a workspace for THIS project plausibly got anchored — where a
 * fork would hide.
 *
 * **"For this project" is the whole of the rule, and getting it wrong is a
 * defect in either direction.** The first implementation omitted
 * `~/.claude/projects` entirely, so `doctor` answered `no-fork` on a workspace
 * that had one. The fix for that swept EVERY directory under
 * `~/.claude/projects` — which holds one entry per project on the machine — so
 * the moment a second project adopted the log, doctor failed in both, forever,
 * naming a path that was not a fault. An alarm that always fires is the same
 * failure as one that never fires: nobody reads either.
 *
 * So the sweep is restricted to the encodings of THIS repository's own
 * worktrees. That set is exactly the fork the `--show-toplevel` bug used to
 * create, which is the case worth catching, and it cannot name another project.
 */
function forkCandidates(workspace, cwd) {
  const out = new Set();
  out.add(path.join(cwd, "skill-observations"));
  out.add(path.join(os.homedir(), "skill-observations"));
  out.add(path.join(os.homedir(), ".claude", "skill-observations"));

  const projects = path.join(os.homedir(), ".claude", "projects");
  for (const root of repoWorktrees(cwd)) {
    out.add(path.join(projects, encodeProjectPath(root), "skill-observations"));
  }

  const ours = path.join(workspace, "skill-observations");
  return [...out].filter((c) => path.resolve(c) !== path.resolve(ours));
}

function cmdDoctor(P, args) {
  const checks = [];
  const root = projectRoot(args);

  const exists = fs.existsSync(P.root);
  checks.push({
    check: "workspace-exists",
    ok: exists,
    detail: exists ? P.root : `${P.root} does not exist — run \`init\``,
  });

  const eph = ephemeralReason(P.workspace);
  checks.push({
    check: "anchor-durable",
    ok: !eph,
    detail: eph ? `${P.workspace} is ${eph}` : P.workspace,
  });

  const forks = forkCandidates(P.workspace, root).filter((c) =>
    fs.existsSync(c),
  );
  checks.push({
    check: "no-fork",
    ok: forks.length === 0,
    detail: forks.length
      ? `a second skill-observations/ exists at: ${forks.join(", ")}`
      : "no second workspace found at another plausible anchor",
  });

  // Activation: without an instruction in the project's agent-instruction file,
  // nothing ever tells an agent this log exists, and a healthy-looking empty
  // log is the result. Looked up at the PROJECT root (see projectRoot), never
  // the cwd. `state` separates the two ways this fails, because they call for
  // different actions: `not-configured` means add the instruction to the file
  // that is there; `no-agent-file` means either the project was never set up
  // or the root is wrong — and `root` is reported so that can be checked.
  const agentFiles = ["AGENTS.md", "CLAUDE.md"]
    .map((f) => path.join(root, f))
    .filter((f) => fs.existsSync(f));
  const activation = agentFiles.find((f) =>
    /observation log/i.test(fs.readFileSync(f, "utf8")),
  );
  const activationState = activation
    ? "configured"
    : agentFiles.length
      ? "not-configured"
      : "no-agent-file";
  const activationDetail = {
    configured: () => `referenced in ${path.basename(activation)} (${root})`,
    "not-configured": () =>
      `${agentFiles.map((f) => path.basename(f)).join(" and ")} at ${root} ` +
      "does not mention the observation log",
    "no-agent-file": () => `no AGENTS.md or CLAUDE.md at ${root}`,
  }[activationState]();
  checks.push({
    check: "activation-configured",
    ok: !!activation,
    state: activationState,
    detail: activationDetail,
  });

  const failed = checks.filter((c) => !c.ok);
  let reason = "ok";
  let exitCode = 0;
  if (eph) {
    reason = "ephemeral-workspace";
    exitCode = 1;
  } else if (forks.length) {
    reason = "fork-detected";
    exitCode = 1;
  } else if (failed.length) {
    reason = "ok";
    exitCode = 0;
  }

  return {
    reason,
    workspace: P.workspace,
    root,
    healthy: failed.length === 0,
    checks,
    exitCode,
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    subcommand: null,
    workspace: "",
    json: false,
    quiet: false,
    dryRun: false,
    status: "",
    id: null,
    title: "",
    skill: [],
    proposesSkill: [],
    siblingsChecked: "",
    bodyFile: "",
    type: "",
    area: "",
    sessionContext: "",
    reference: "",
    parkedUntil: "",
    resolution: "",
    resolved: "",
    note: "",
    audit: false,
    auditRoot: "",
    now: "",
  };

  // Fail closed: a flag whose value is missing or is itself a flag is a usage
  // error, not a silently-empty string.
  const value = (i, name) => {
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) {
      throw new UsageError(`${name} requires a value`);
    }
    return v;
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (i === 0 && !a.startsWith("--")) {
      if (!SUBCOMMANDS.has(a)) {
        throw new UsageError(
          `unknown subcommand ${a}; expected one of ${[...SUBCOMMANDS].join(", ")}`,
        );
      }
      args.subcommand = a;
      continue;
    }
    switch (a) {
      case "--workspace":
        args.workspace = value(i, a);
        i++;
        break;
      case "--json":
        args.json = true;
        break;
      case "--quiet":
        args.quiet = true;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--status":
        args.status = value(i, a);
        i++;
        break;
      case "--id":
        args.id = parseInt(value(i, a), 10);
        i++;
        break;
      case "--title":
        args.title = value(i, a);
        i++;
        break;
      case "--skill":
        args.skill.push(value(i, a));
        i++;
        break;
      case "--proposes-skill":
        args.proposesSkill.push(value(i, a));
        i++;
        break;
      case "--siblings-checked":
        args.siblingsChecked = value(i, a);
        i++;
        break;
      case "--body-file":
        args.bodyFile = value(i, a);
        i++;
        break;
      case "--type":
        args.type = value(i, a);
        i++;
        break;
      case "--area":
        args.area = value(i, a);
        i++;
        break;
      case "--session-context":
        args.sessionContext = value(i, a);
        i++;
        break;
      case "--reference":
        args.reference = value(i, a);
        i++;
        break;
      case "--parked-until":
        args.parkedUntil = value(i, a);
        i++;
        break;
      case "--resolution":
        args.resolution = value(i, a);
        i++;
        break;
      case "--resolved":
        args.resolved = value(i, a);
        i++;
        break;
      case "--note":
        args.note = value(i, a);
        i++;
        break;
      case "--audit":
        args.audit = true;
        break;
      case "--audit-root":
        args.auditRoot = value(i, a);
        i++;
        break;
      // --now exists so tests can pin "today" without sleeping until tomorrow.
      case "--now":
        args.now = value(i, a);
        i++;
        break;
      default:
        // An unknown flag is a usage error, not a silent no-op.
        throw new UsageError(`unknown argument ${a}`);
    }
  }
  if (!args.subcommand) throw new UsageError("a subcommand is required");

  // `--id` is meaningful to `set-status` and `--status` to `scan`, so both live
  // in the shared switch above. That makes them REACHABLE from `write`, where
  // `--id` must not be — and a flag the parser accepts and the subcommand then
  // ignores is worse than one it rejects: the caller sees exit 0 and believes
  // the id took effect. Rejecting it here is what makes "there is no --id flag"
  // true from the caller's side rather than only from the implementation's.
  if (args.subcommand === "write" && args.id != null) {
    throw new UsageError(
      "write does not accept --id: ids are always derived. A batch that " +
        "pre-computes a base and hardcodes sequential numbers collapses N " +
        "independent max-checks into one stale read, which is how two " +
        "observations end up sharing an id.",
    );
  }

  return args;
}

class UsageError extends Error {}

function run(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    if (e instanceof UsageError) {
      return { reason: "usage", error: e.message, exitCode: 2 };
    }
    throw e;
  }

  const w = resolveWorkspace(args);
  if (w.error) return { reason: "usage", error: w.error, exitCode: 2 };
  if (w.ephemeral && args.subcommand !== "doctor") {
    return {
      reason: "ephemeral-workspace",
      workspace: w.workspace,
      error: `refusing to use ${w.workspace}: ${w.ephemeral}`,
      exitCode: 1,
    };
  }

  const P = paths(w.workspace);

  switch (args.subcommand) {
    case "init":
      return cmdInit(P, args);
    case "scan":
      return cmdScan(P, args);
    case "queue":
      return cmdQueue(P, args);
    case "next-id":
      return cmdNextId(P, args);
    case "write":
      return cmdWrite(P, args);
    case "set-status":
      return cmdSetStatus(P, args);
    case "archive":
      return cmdArchive(P, args);
    case "families":
      return cmdFamilies(P, args);
    case "checkpoint":
      return cmdCheckpoint(P, args);
    case "doctor":
      return cmdDoctor(P, args);
    default:
      return { reason: "usage", error: "unreachable", exitCode: 2 };
  }
}

function emit(result, args) {
  const { exitCode = 0, ...payload } = result;
  if (args && args.json) {
    process.stdout.write(
      JSON.stringify({ ...payload, exitCode }, null, 2) + "\n",
    );
  } else if (!(args && args.quiet)) {
    const line = payload.error
      ? `${payload.reason}: ${payload.error}`
      : `${payload.reason}`;
    process.stdout.write(line + "\n");
  }
  // `process.exitCode` + return, NEVER `process.exit()`: stdio is ASYNCHRONOUS
  // on a pipe, and `process.exit()` tears the process down before the buffer
  // drains, truncating output at ~64KB. Returning lets the event loop flush.
  // See bug.3.stdout-truncation-on-exit and
  // skills/develop-next/scripts/select-next.mjs:1629.
  //
  // tracker-comment.js:831 ends on `process.exit(r.exitCode)`. That line was
  // deliberately NOT transcribed. `scan --json` over a large log is exactly
  // the shape that truncates.
  process.exitCode = exitCode;
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  let args = null;
  try {
    args = parseArgs(argv);
  } catch {
    args = { json: argv.includes("--json"), quiet: argv.includes("--quiet") };
  }
  try {
    emit(run(argv), args);
  } catch (e) {
    emit(
      { reason: "usage", error: `observation-log: ${e.message}`, exitCode: 2 },
      args,
    );
  }
}

module.exports = {
  run,
  parseArgs,
  paths,
  resolveWorkspace,
  parseFrontmatter,
  readFrontmatterBounded,
  readFrontmatter,
  statusOf,
  asList,
  prefixes,
  listMarkdown,
  readIdFloor,
  writeIdFloor,
  isStale,
  sweepResolved,
  nextId,
  slugify,
  today,
  parseFamilies,
  rewriteLifecycle,
  repoWorktrees,
  encodeProjectPath,
  forkCandidates,
  ephemeralReason,
  RESOLVED_SET,
  STATUS_VALUES,
  UsageError,
};
