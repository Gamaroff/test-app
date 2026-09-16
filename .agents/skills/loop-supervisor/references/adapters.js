"use strict";

/**
 * adapters.js — per-command knowledge for loop-supervisor.
 *
 * The loop in run-loop.mjs knows nothing about `/develop-next` or any other
 * command. Everything command-specific lives here: which probe to run, how to
 * read its answer, which state files prove an unfinished run, and what counts
 * as progress. Adding a command is adding a row, not editing the loop.
 *
 * Split of responsibility, deliberately: this module DESCRIBES (argv to run,
 * how to interpret output) and provides small pure interpreters; run-loop.mjs
 * PERFORMS the spawning. That is what makes `interpretProbe` — the piece with
 * the highest-consequence bug available in this design — unit-testable without
 * a subprocess.
 *
 * CommonJS, matching shared/resources/yaml-subset.js. No dependencies.
 * Node >= 22.
 */

const { execFileSync } = require("node:child_process");

/** Statuses `select-next.mjs` is contracted to emit. Anything else is a bug. */
const PROBE_STATUSES = new Set(["selected", "stop", "halt"]);

/**
 * Interpret a probe invocation's raw result.
 *
 * GOTCHA 1 — THE HIGHEST-CONSEQUENCE BUG IN THIS DESIGN, and the reason this
 * function exists separately from the spawn:
 *
 *   `select-next.mjs` guards its CLI behind `isInvokedDirectly()`
 *   (skills/develop-next/scripts/select-next.mjs:849-860), which realpaths BOTH
 *   sides because consumer projects symlink `.claude/skills -> .agents/skills`.
 *   Invoked through a path that does not realpath to the module, `main()` never
 *   runs and the process **exits 0 with no output**. The module's own comment
 *   at :843-848 spells out the consequence verbatim: "exit 0, no output. That
 *   reads as 'no item selected' rather than as a failure, so the loop silently
 *   does nothing."
 *
 *   So: **empty stdout is an error, never `stop`.** A supervisor that got this
 *   wrong would report a clean "roadmap complete" every night while doing
 *   nothing at all — the worst possible failure for an unattended loop, because
 *   it is indistinguishable from success from the outside.
 *
 * GOTCHA — never branch on exit code alone. `selected` and every `stop` variant
 * all exit 0; only `halt` exits 1. The `.status` field is the contract.
 *
 * GOTCHA 3 — `lint.warnings` is noisy by design and non-fatal. Only
 * `lint.errors` accompanies a real halt.
 *
 * @param {object} result
 * @param {number|null} result.code       child exit code
 * @param {string} result.stdout          raw stdout
 * @param {string} [result.stderr]
 * @param {boolean} [result.timedOut]
 * @param {Error|null} [result.spawnError]
 * @returns {{status: string, reason: string, itemId?: string, command?: string,
 *            commandArg?: string, lintErrors?: string[], raw?: object}}
 */
function interpretProbe(result) {
  const r = result || {};
  const stdout = typeof r.stdout === "string" ? r.stdout : "";

  if (r.spawnError) {
    return {
      status: "error",
      reason: "probe failed to spawn: " + (r.spawnError.message || String(r.spawnError)),
    };
  }
  if (r.timedOut) {
    return { status: "error", reason: "probe timed out" };
  }

  // The empty-stdout guard. Checked BEFORE any exit-code reasoning, because the
  // failure it catches presents as a perfectly clean exit 0.
  if (stdout.trim() === "") {
    return {
      status: "error",
      reason:
        "probe produced no output (exit " +
        (r.code == null ? "?" : r.code) +
        "). select-next.mjs exits 0 silently when argv[1] does not realpath to " +
        "the module — check the probe path is the real file, not a symlink into " +
        "a different tree. Empty stdout is never 'no work'.",
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (e) {
    return {
      status: "error",
      reason: "probe stdout was not JSON: " + (e.message || String(e)),
    };
  }

  if (!parsed || typeof parsed !== "object" || !PROBE_STATUSES.has(parsed.status)) {
    return {
      status: "error",
      reason:
        "probe returned an unrecognised status " +
        JSON.stringify(parsed && parsed.status) +
        " (expected selected | stop | halt)",
    };
  }

  if (parsed.status === "halt") {
    const errors = (parsed.lint && parsed.lint.errors) || [];
    return {
      status: "halt",
      reason: errors.length ? errors.join("; ") : "roadmap could not be parsed",
      lintErrors: errors,
      raw: parsed,
    };
  }

  if (parsed.status === "stop") {
    return {
      status: "stop",
      reason:
        (parsed.stopReason || "unspecified") +
        (parsed.detail ? ": " + parsed.detail : ""),
      raw: parsed,
    };
  }

  // selected
  const item = parsed.item || {};
  return {
    status: "selected",
    reason: parsed.rationale || "",
    itemId: item.id,
    command: item.command,
    // GOTCHA 2 — `commandArg` is emitted VERBATIM and is repo-root-relative.
    // The selector does no path resolution at all (select-next.mjs:250 stores
    // the raw string, :620 interpolates it straight into `run`). The supervisor
    // must therefore spawn with cwd = repo root and must NOT resolve this
    // against the roadmap's own directory — doing so yields
    // `docs/development/docs/tasks/…`, which does not exist.
    commandArg: item.commandArg,
    raw: parsed,
  };
}

/** Run git in `cwd`, returning trimmed stdout, or null when git fails. */
function git(cwd, args) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Progress oracle: did a new roadmap-tick commit land on the base branch?
 *
 * Compares against a SHA captured before the iteration rather than against a
 * wall-clock time. Commit timestamps can be rewritten (rebase, amend, cherry-
 * pick) and a `--since` window straddling a clock change is quietly wrong; a
 * SHA range is exact.
 *
 * @param {object} ctx
 * @param {string} ctx.cwd
 * @param {string} ctx.baseRef      e.g. "develop"
 * @param {string|null} ctx.beforeSha  base tip captured before the iteration
 * @returns {boolean}
 */
function tickCommitOracle(ctx) {
  const { cwd, baseRef, beforeSha } = ctx || {};
  if (!beforeSha) return false;
  const after = git(cwd, ["rev-parse", baseRef]);
  if (!after || after === beforeSha) return false;
  const subjects = git(cwd, [
    "log",
    "--format=%s",
    beforeSha + ".." + after,
  ]);
  if (!subjects) return false;
  return subjects
    .split("\n")
    .some((line) => /^docs\(roadmap\): tick\b/.test(line.trim()));
}

/**
 * Progress oracle: did HEAD move at all?
 *
 * The `generic` adapter's oracle. Deliberately looser than the tick oracle —
 * a generic command has no roadmap to tick, so "a commit happened" is the only
 * evidence available.
 */
function anyCommitOracle(ctx) {
  const { cwd, beforeSha } = ctx || {};
  if (!beforeSha) return false;
  const after = git(cwd, ["rev-parse", "HEAD"]);
  return Boolean(after) && after !== beforeSha;
}

const STATE_DIR = ".claude/state";
const PIPELINE_LOCK = STATE_DIR + "/develop-pipeline.lock";
const PIPELINE_HALT = STATE_DIR + "/develop-pipeline.last-halt.json";

/**
 * The adapter table.
 *
 * `probeArgs(ctx)` returns argv AFTER the node binary, or null for "no probe —
 * always spawn". `oracleRef` names the git ref the oracle watches, so the loop
 * knows which SHA to capture before spawning.
 */
const ADAPTERS = {
  "develop-next": {
    name: "develop-next",
    command: "/develop-next",
    describe: "One roadmap item per iteration, selected by select-next.mjs.",
    stateFile: STATE_DIR + "/develop-next.state.json",
    lockFile: PIPELINE_LOCK,
    haltFile: PIPELINE_HALT,
    probeScript: "skills/develop-next/scripts/select-next.mjs",
    probeArgs(ctx) {
      const args = [this.probeScript];
      if (ctx && ctx.roadmapPath) args.push("--roadmap", ctx.roadmapPath);
      return args;
    },
    oracleRef: (ctx) => (ctx && ctx.baseBranch) || "develop",
    progressOracle: tickCommitOracle,
  },

  "develop-batch": {
    name: "develop-batch",
    command: "/develop-batch",
    describe:
      "One batch per iteration. Iterations stay sequential — the parallelism is inside the batch, not across them.",
    stateFile: STATE_DIR + "/develop-batch.state.json",
    lockFile: PIPELINE_LOCK,
    haltFile: PIPELINE_HALT,
    probeScript: "skills/develop-next/scripts/select-next.mjs",
    probeArgs(ctx) {
      const args = [this.probeScript, "--batch"];
      if (ctx && ctx.roadmapPath) args.push("--roadmap", ctx.roadmapPath);
      return args;
    },
    oracleRef: (ctx) => (ctx && ctx.baseBranch) || "develop",
    progressOracle: tickCommitOracle,
  },

  generic: {
    name: "generic",
    command: null, // supplied by --command
    describe:
      "Any prompt, once per iteration. No probe, so the loop stops only on budget, error or idle.",
    stateFile: null,
    lockFile: PIPELINE_LOCK,
    haltFile: PIPELINE_HALT,
    probeScript: null,
    probeArgs() {
      return null; // no probe — always spawn
    },
    oracleRef: () => "HEAD",
    progressOracle: anyCommitOracle,
  },
};

/**
 * Resolve an adapter by name, applying any declarative overrides from
 * `skills-config.yaml`'s `loopSupervisor.adapters.<name>` block.
 *
 * Overrides are DECLARATIVE ONLY — paths and argv, never JavaScript. A config
 * file that can name a module to `require()` is a code-execution surface, and
 * the gain over "probe command + expected JSON shape" is nil.
 *
 * @param {string} name
 * @param {object} [config] parsed skills-config.yaml
 * @returns {object} adapter
 * @throws {Error} on an unknown name
 */
function resolveAdapter(name, config) {
  const base = ADAPTERS[name];
  if (!base) {
    throw new Error(
      "unknown adapter " +
        JSON.stringify(name) +
        " (known: " +
        Object.keys(ADAPTERS).join(", ") +
        ")",
    );
  }
  const ls = (config && config.loopSupervisor) || {};
  const over = (ls.adapters && ls.adapters[name]) || {};
  const merged = Object.assign(Object.create(Object.getPrototypeOf(base)), base);
  for (const key of ["stateFile", "lockFile", "haltFile", "probeScript", "command"]) {
    if (over[key] != null) merged[key] = over[key];
  }
  return merged;
}

module.exports = {
  ADAPTERS,
  PROBE_STATUSES,
  interpretProbe,
  tickCommitOracle,
  anyCommitOracle,
  resolveAdapter,
};
