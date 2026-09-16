#!/usr/bin/env node
// ---------------------------------------------------------------------------
// tracker-reconcile.js — re-read a committed handover and reconcile it with
// the live tracker (task.57).
//
//   /tracker-reconcile [<work-item-dir> | <handover.json> | --all] [--apply] [--json]
//
// Default is CHECK-ONLY and mutates nothing remote: it runs the read-only
// verification pass (handover-verify.js), ticks what is already satisfied back
// into the committed checklist, flags what someone moved elsewhere as
// `divergent`, updates the JSON sidecar, sets the checklist's frontmatter
// `status:` to outstanding | partial | complete, and prints the summary.
//
// THE LOAD-BEARING REFUSAL: `--apply` is refused under EVERY access mode other
// than `full` — `read-only`, `approve`, `command` and `manual` alike — naming
// the blocking system. A reconcile that quietly applies under `manual` is a
// back door around the policy the consumer configured, and makes `manual`
// meaningless. The refusal still re-renders (the check pass runs either way);
// it exits 0 with `reason: "apply-refused"`, per the established convention.
//
// Change Log: only an action reconcile EXECUTED earns a row in the work item's
// `## Change Log`. A deferral is a non-event; observing something already
// satisfied is also a non-event — the tracker's own history has it, with the
// real actor. (document-change-log.md: rows record events, not attempts.)
//
// Idempotent: reconciling twice with an unchanged board produces byte-identical
// artifacts — handover-verify keeps a prior annotation (timestamp included)
// when the fresh read agrees with it.
// ---------------------------------------------------------------------------
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const hv = require("../references/handover-verify.js");
const hr = require("../references/handover-render.js");
const dm = require("../references/defer-mutation.js");
const cl = require("../references/change-log.js");

const USAGE = `Usage: tracker-reconcile [<work-item-dir> | <handover.json> | --all] [--apply] [--json]

Re-reads a committed handover against the live tracker and reports (or, under
access.tracker: full and --apply, performs) what is still outstanding.

  <work-item-dir>    reconcile the newest *.handover.*.json in the directory
  <handover.json>    reconcile exactly this sidecar
  --all              reconcile every *.handover.*.json under docs/
  --apply            execute outstanding actions — REFUSED unless
                     access.tracker resolves to \`full\`
  --json             machine-readable result
  -h, --help

Check-only by default: nothing remote is mutated without --apply, and --apply
is refused under read-only, approve, command and manual.`;

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { targets: [] };
  for (const a of argv.slice(2)) {
    switch (a) {
      case "-h":
      case "--help":
        args.help = true;
        break;
      case "--all":
        args.all = true;
        break;
      case "--apply":
        args.apply = true;
        break;
      case "--json":
        args.json = true;
        break;
      default:
        if (a.startsWith("-")) throw new Error(`unknown flag "${a}"`);
        args.targets.push(a);
    }
  }
  if (args.targets.length > 1)
    throw new Error("at most one target (a directory or a sidecar path)");
  if (!args.all && args.targets.length === 0)
    throw new Error(
      "a target is required: <work-item-dir>, <handover.json>, or --all",
    );
  return args;
}

// ---------------------------------------------------------------------------
// Target resolution
// ---------------------------------------------------------------------------

const SIDECAR_RE = /\.handover\.(\d+)\.[^.]+(?:-[^.]*)*\.json$/;

function isSidecar(p) {
  return /\.handover\.\d+\..+\.json$/.test(path.basename(p));
}

function newestSidecarIn(dir) {
  const entries = fs
    .readdirSync(dir)
    .filter((f) => isSidecar(f))
    .sort((a, b) => {
      const na = Number((a.match(/\.handover\.(\d+)\./) || [])[1] || 0);
      const nb = Number((b.match(/\.handover\.(\d+)\./) || [])[1] || 0);
      return na - nb || a.localeCompare(b);
    });
  return entries.length ? path.join(dir, entries[entries.length - 1]) : null;
}

function walkForSidecars(root) {
  const found = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (isSidecar(e.name)) found.push(p);
    }
  }
  return found.sort();
}

function resolveTargets(args, cwd) {
  if (args.all) return walkForSidecars(path.join(cwd, "docs"));
  const t = path.resolve(cwd, args.targets[0]);
  const stat = fs.statSync(t);
  if (stat.isDirectory()) {
    const sidecar = newestSidecarIn(t);
    if (!sidecar)
      throw new Error(`no *.handover.*.json found in ${args.targets[0]}`);
    return [sidecar];
  }
  if (!isSidecar(t))
    throw new Error(
      `${args.targets[0]} is not a handover sidecar (*.handover.{n}.{name}.json)`,
    );
  return [t];
}

/** The work-item document beside a sidecar — the file the Change Log row lands in. */
function workItemDocFor(sidecarPath) {
  const dir = path.dirname(sidecarPath);
  const candidates = fs
    .readdirSync(dir)
    .filter(
      (f) =>
        f.endsWith(".md") &&
        !/\.(qa|gate|bug|implementation|review|dod|handover|plan)\./.test(f),
    );
  return candidates.length ? path.join(dir, candidates[0]) : null;
}

// ---------------------------------------------------------------------------
// Status derivation and artifact writing
// ---------------------------------------------------------------------------

function deriveStatus(counts, total) {
  if (total === 0) return "complete";
  if (counts.satisfied >= total) return "complete";
  if (counts.satisfied === 0) return "outstanding";
  return "partial";
}

/**
 * The `updated:` date for the checklist frontmatter. Derived from the record
 * annotations, NOT from the clock — that is what keeps a no-change reconcile
 * byte-identical.
 */
function updatedDateFrom(records) {
  let max = "";
  for (const r of records) {
    const at = r.verification && r.verification.at;
    if (at && at > max) max = at;
  }
  return max ? max.slice(0, 10) : "";
}

function frontmatterFor(status, records) {
  const updated = updatedDateFrom(records);
  return (
    `---\n` +
    `type: handover\n` +
    `status: ${status}\n` +
    (updated ? `updated: ${updated}\n` : "") +
    `---\n\n`
  );
}

function writeArtifacts(sidecarPath, records, ctx, status) {
  const base = sidecarPath.replace(/\.json$/, "");
  const mdPath = `${base}.md`;
  const shPath = `${base}.sh`;

  const md = frontmatterFor(status, records) + hr.render(records, "md", ctx);
  fs.writeFileSync(mdPath, md, "utf8");
  fs.chmodSync(mdPath, hr.SCRIPT_MODE);

  // The sidecar carries the render payload plus the reconcile status.
  const payload = JSON.parse(hr.render(records, "json", ctx));
  payload.status = status;
  fs.writeFileSync(
    sidecarPath,
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8",
  );
  fs.chmodSync(sidecarPath, hr.SCRIPT_MODE);

  const written = { md: mdPath, json: sidecarPath };
  // The script is only re-rendered where one already exists — `manual` and
  // `read-only` handovers never shipped one, and reconcile must not widen a
  // mode's renderer selection after the fact.
  if (fs.existsSync(shPath)) {
    fs.writeFileSync(shPath, hr.render(records, "sh", ctx), "utf8");
    fs.chmodSync(shPath, hr.SCRIPT_MODE);
    written.sh = shPath;
  }
  return written;
}

// ---------------------------------------------------------------------------
// Apply — full access only
// ---------------------------------------------------------------------------

function defaultExec(argv, stdin) {
  try {
    const stdout = execFileSync(argv[0], argv.slice(1), {
      encoding: "utf8",
      input: stdin === undefined || stdin === null ? undefined : String(stdin),
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 60_000,
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

/**
 * Execute the outstanding actions of a verified record list.
 *
 *   pending       runs
 *   unverifiable  runs, unguarded — could not confirm, so the action stands
 *   divergent     SKIPPED with a warning — someone moved it; not applied
 *   irreversible  skipped without a tty; confirmed per-record with one
 *
 * Returns { executed: [records], skipped: [{id, why}] } — mutates nothing else.
 */
function applyRecords(
  records,
  {
    execImpl = defaultExec,
    isTTY = false,
    log = () => {},
    confirm = null,
  } = {},
) {
  const executed = [];
  const skipped = [];

  for (const rec of records) {
    const state = hr.verificationState(rec);
    if (state === "satisfied") continue;
    if (rec.satisfied === true) continue;

    if (state === "divergent") {
      skipped.push({
        id: rec.id,
        why: "divergent — not applied; resolve by hand",
      });
      log(
        `⚠️  [${rec.id}] DIVERGENT — skipped: observed ${(rec.verification || {}).observed}`,
      );
      continue;
    }

    const argv =
      rec.command && Array.isArray(rec.command.argv) ? rec.command.argv : [];
    if (!argv.length) {
      skipped.push({ id: rec.id, why: "no command form — do by hand" });
      continue;
    }

    if (rec.consequence === "irreversible") {
      // Consent is NEVER assumed: an irreversible action runs only when a
      // confirmation mechanism exists AND says yes. No tty and no callback
      // both mean skip — a tty without a prompt implementation must not be
      // read as a yes.
      if (!isTTY || typeof confirm !== "function") {
        skipped.push({
          id: rec.id,
          why: "irreversible — no confirmation mechanism; never assumed",
        });
        log(
          `⚠️  [${rec.id}] irreversible — no way to confirm, skipped (re-run interactively)`,
        );
        continue;
      }
      if (!confirm(rec)) {
        skipped.push({ id: rec.id, why: "irreversible — declined" });
        continue;
      }
    }

    const stdin = rec.command.stdin;
    const finalArgv = argv.slice();
    const r = execImpl(finalArgv, stdin);
    if (r.status === 0) {
      executed.push(rec);
      log(`▶  [${rec.id}] executed: ${hr.headline(rec)}`);
    } else {
      skipped.push({
        id: rec.id,
        why: `failed: ${r.error || `exit ${r.status}`}`,
      });
      log(`❌ [${rec.id}] failed (exit ${r.status})`);
    }
  }

  return { executed, skipped };
}

/**
 * The bash invocation for one confirmation prompt. The script text is a FIXED
 * string — the prompt travels as data in an environment variable, never
 * interpolated into `bash -c`. A committed record's `intent` can contain
 * `$(…)` or backticks, and interpolating it into script text would execute
 * them in the operator's shell the moment the prompt rendered.
 */
function ttyConfirmCommand(rec) {
  return {
    argv: [
      "bash",
      "-c",
      'read -r -p "$RECONCILE_PROMPT" _reply < /dev/tty && printf %s "$_reply"',
    ],
    env: {
      ...process.env,
      RECONCILE_PROMPT: `⚠️  [${rec.id}] IRREVERSIBLE — ${rec.intent}. Perform this? [y/N] `,
    },
  };
}

/**
 * The default per-record confirmation for irreversible actions: a y/N prompt
 * read from /dev/tty. Where /dev/tty cannot be read the answer is "no" —
 * consent is never assumed.
 */
function ttyConfirm(rec) {
  try {
    const cmd = ttyConfirmCommand(rec);
    const reply = execFileSync(cmd.argv[0], cmd.argv.slice(1), {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
      env: cmd.env,
    }).trim();
    return /^y(es)?$/i.test(reply);
  } catch {
    return false;
  }
}

/** Mark an executed record satisfied, so the re-render ticks it. */
function markExecuted(rec, now) {
  return {
    ...rec,
    satisfied: true,
    verification: {
      state: "satisfied",
      at: now,
      observed: "executed",
      detail: "executed by tracker-reconcile --apply",
    },
  };
}

/**
 * One Change Log row for the actions reconcile EXECUTED — and only those.
 * Deferral writes no row; observation writes no row.
 */
function writeChangeLogRow(docPath, executed, today) {
  if (!executed.length || !docPath) return false;
  const kinds = [...new Set(executed.map((r) => r.kind))].join(", ");
  const content = fs.readFileSync(docPath, "utf8");
  let next = cl.upsertChangeLog(content, {
    date: today,
    version: "",
    description: `Reconcile executed ${executed.length} tracker action(s): ${kinds}`,
    author: "tracker-reconcile",
  });
  next = cl.bumpUpdated(next, today);
  fs.writeFileSync(docPath, next, "utf8");
  return true;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function run({
  argv = process.argv,
  env = process.env,
  cwd = process.cwd(),
  execImpl,
  verifyExecImpl,
  fetchImpl,
  isTTY = !!(process.stdout && process.stdout.isTTY),
  confirm = null,
  now,
} = {}) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    console.error(`Error: ${e.message}`);
    console.error(USAGE);
    return { exitCode: 2, reason: "bad-args" };
  }
  if (args.help) {
    console.log(USAGE);
    return { exitCode: 0, reason: "help" };
  }

  // The refusal is decided BEFORE any work: --apply under a non-full mode is a
  // policy question, not an execution failure, and the answer must not depend
  // on what the verification pass happens to find.
  let mode;
  try {
    mode = dm.resolveAccessTracker(env, { cwd });
  } catch (e) {
    console.error(`Error: ${e.message}`);
    return { exitCode: 2, reason: "bad-access-mode" };
  }
  const applyRefused = args.apply && mode !== "full";
  if (applyRefused) {
    console.error(
      `⛔ --apply refused: access.tracker resolves to \`${mode}\`. ` +
        `Applying under \`${mode}\` would bypass the access policy this repo ` +
        `configured (skills-config.yaml access.tracker / ACCESS_TRACKER / ` +
        `AGENT_SKILLS_ACCESS_TRACKER). Reconcile continues check-only; ` +
        `re-run with access.tracker: full to apply.`,
    );
  }

  let sidecars;
  try {
    sidecars = resolveTargets(args, cwd);
  } catch (e) {
    console.error(`Error: ${e.message}`);
    return { exitCode: 2, reason: "bad-target" };
  }
  if (!sidecars.length) {
    console.log("ℹ️  No handover sidecars found — nothing to reconcile.");
    return { exitCode: 0, reason: "no-handovers", items: [] };
  }

  const io = hv.makeIo({ env, execImpl: verifyExecImpl, fetchImpl, now });
  const today = (now ? now() : new Date().toISOString()).slice(0, 10);
  const items = [];

  for (const sidecarPath of sidecars) {
    let payload;
    try {
      payload = JSON.parse(fs.readFileSync(sidecarPath, "utf8"));
    } catch (e) {
      items.push({
        sidecar: sidecarPath,
        reason: "unreadable",
        error: e.message,
      });
      console.error(`⚠️  ${sidecarPath}: unreadable (${e.message}) — skipped`);
      continue;
    }
    const ctx = { ...(payload.context || {}), env };
    let records = payload.records || [];
    const before = records.length;

    // The read pass. Ticks, baselines, divergence — no mutation possible.
    const verified = await hv.verifyRecords(records, { io });
    records = verified.records;

    let executedIds = [];
    let skippedApply = [];
    if (args.apply && !applyRefused) {
      // Default confirmation: a real /dev/tty prompt when interactive and the
      // caller supplied none. applyRecords still skips irreversible records
      // whenever no callback reaches it — the default here is what makes a
      // plain `--apply` on a tty ask instead of silently executing.
      const effectiveConfirm = confirm || (isTTY ? ttyConfirm : null);
      const { executed, skipped } = applyRecords(records, {
        execImpl,
        isTTY,
        confirm: effectiveConfirm,
        log: (m) => console.error(m),
      });
      const at = io.now();
      const executedSet = new Set(executed.map((r) => r.id));
      records = records.map((r) =>
        executedSet.has(r.id) ? markExecuted(r, at) : r,
      );
      executedIds = executed.map((r) => r.id);
      skippedApply = skipped;

      const doc = workItemDocFor(sidecarPath);
      writeChangeLogRow(
        doc,
        records.filter((r) => executedSet.has(r.id)),
        today,
      );
    }

    if (records.length !== before) {
      throw new Error(
        `tracker-reconcile: record count changed (${before} → ${records.length}) — ` +
          `a satisfied action is ticked, never deleted.`,
      );
    }

    // Recompute the partition from the annotated records so status and counts
    // agree with what the artifacts will show.
    const model = hr.buildModel(records, ctx);
    const status = deriveStatus(model.counts, model.counts.total);
    const artifacts = writeArtifacts(sidecarPath, records, ctx, status);

    items.push({
      sidecar: sidecarPath,
      status,
      counts: model.counts,
      executed: executedIds,
      skipped: skippedApply,
      artifacts,
    });

    console.error(
      `${status === "complete" ? "✅" : status === "partial" ? "◐" : "○"} ` +
        `${path.basename(sidecarPath)} — ${status}: ` +
        `${model.counts.satisfied} satisfied · ${model.counts.pending} pending · ` +
        `${model.counts.divergent} divergent · ${model.counts.unverifiable} unverifiable` +
        (executedIds.length ? ` · ${executedIds.length} executed` : ""),
    );
  }

  const reason = applyRefused
    ? "apply-refused"
    : args.apply
      ? "applied"
      : "checked";

  const result = {
    exitCode: 0,
    reason,
    access: mode,
    ...(applyRefused
      ? {
          refusal:
            `--apply requires access.tracker: full; resolved mode is \`${mode}\` ` +
            `(most restrictive of skills-config.yaml access.tracker, ACCESS_TRACKER, ` +
            `AGENT_SKILLS_ACCESS_TRACKER)`,
        }
      : {}),
    items,
  };

  if (args.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
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
  parseArgs,
  isSidecar,
  newestSidecarIn,
  walkForSidecars,
  resolveTargets,
  workItemDocFor,
  deriveStatus,
  updatedDateFrom,
  frontmatterFor,
  writeArtifacts,
  applyRecords,
  ttyConfirm,
  ttyConfirmCommand,
  markExecuted,
  writeChangeLogRow,
  run,
  USAGE,
};
