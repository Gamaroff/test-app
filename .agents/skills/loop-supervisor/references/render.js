/**
 * render.js — the loop-supervisor status renderer, as a pure function.
 *
 * `status` prints its output once; `watch` repaints it. Both are thin wrappers
 * over `statusView()` here, which is what stops the two views drifting apart:
 * there is one formatting surface, and it is unit-testable without a terminal,
 * without a clock and without a live supervisor.
 *
 * Everything ambient is injected — `nowMs` and `isAlive` are parameters, not
 * calls. That is what makes "a stale current.json with a dead pid" testable at
 * all; the alternative is a test that has to arrange a real dead process.
 *
 * No dependencies. Pure: reads nothing, writes nothing, prints nothing.
 *
 * CommonJS, like its siblings `classify.js` and `adapters.js` — the repo root
 * package.json is `"type": "commonjs"`, so a `.js` file here is CJS whatever
 * the `.mjs` that imports it happens to be.
 */
"use strict";

/**
 * A heartbeat that exists but cannot be read. Distinct from `null`, which means
 * genuinely absent.
 *
 * It lives here, beside the state machine that interprets it, and is compared
 * by **identity** — not by a `__unreadable` key. A duck-typed sentinel is data
 * a file could contain: a valid heartbeat carrying that key would be reported
 * as unreadable, which is the same "state the opposite of the truth" failure
 * this state exists to prevent, just pointed the other way. Identity cannot be
 * forged by JSON.
 */
const UNREADABLE = Object.freeze({ unreadable: true });

/** Human duration from milliseconds: 1m04s, 2h07m, 890ms. */
function formatDuration(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${String(s % 60).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h${String(m % 60).padStart(2, "0")}m`;
}

/** "12s ago" / "just now" / "—" for an ISO timestamp against a millisecond clock. */
function formatAge(iso, nowMs) {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const delta = nowMs - t;
  if (delta < 1000) return "just now";
  return `${formatDuration(delta)} ago`;
}

function money(v) {
  return typeof v === "number" && Number.isFinite(v) ? `$${v.toFixed(4)}` : "—";
}

function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? String(v) : "—";
}

/**
 * Classify the run from the heartbeat file.
 *
 * Three states, and the distinction between the last two is the whole reason
 * this function exists:
 *
 * - `no-run`     — `current.json` absent. The NORMAL post-run state (the runner
 *                  deletes it on clean exit), never an error.
 * - `running`    — heartbeat present and its pid is alive.
 * - `crashed`    — heartbeat present and its pid is dead. Reporting hours-old
 *                  data as live is the one genuinely misleading thing a view can
 *                  do, so it gets its own state rather than a footnote.
 * - `unreadable` — heartbeat present but not parseable. **Not `no-run`.** The
 *                  two were once collapsed, which meant a torn write answered
 *                  "no run in flight" — telling the operator the loop had
 *                  finished when it had not. That is the same misleading shape
 *                  as `crashed`-reported-as-`running`, and it is worse in one
 *                  respect: a crashed report prompts a look, while "no run in
 *                  flight" ends the investigation.
 *
 * Liveness is the ONLY signal used. There is deliberately no "older than N
 * seconds" rule: the runner clears its heartbeat interval while the child is
 * not running, so `current.json` legitimately goes untouched across the probe
 * and the cooldown window — longer than the 5s heartbeat period — and a
 * time-based rule would report a healthy loop as crashed between iterations.
 */
function runState(current, isAlive) {
  if (!current) return "no-run";
  if (current === UNREADABLE) return "unreadable";
  const pid = current.pid;
  if (typeof pid !== "number") return "crashed";
  return isAlive(pid) ? "running" : "crashed";
}

/**
 * One ledger row, normalised for display.
 *
 * `runs.jsonl` has TWO row shapes and a renderer must tolerate both:
 *
 * - `spawned: true`  — the full row: exitCode, subtype, durationMs, costUsd,
 *   `turns` (NOT `numTurns` — the ledger renames the envelope's `num_turns` on
 *   write), sessionId, logPath, rawPath, transcriptPath.
 * - `spawned: false` — the PROBE-STOP row, written when the probe returns
 *   anything but `selected`. It carries only runId, iteration, sessionId,
 *   outcome, reason, probe and at. That is the normal last line of a healthy
 *   run (empty frontier), which makes it the row most likely to be displayed
 *   and the easiest to leave untested.
 *
 * Absent fields render as `—`, never as `undefined` or `NaN`.
 */
function normaliseRow(row) {
  const r = row && typeof row === "object" ? row : {};
  return {
    iteration: typeof r.iteration === "number" ? r.iteration : null,
    outcome: r.outcome || "—",
    reason: r.reason || "",
    itemId: r.itemId || "—",
    spawned: r.spawned === true,
    duration: formatDuration(r.durationMs),
    cost: money(r.costUsd),
    turns: num(r.turns),
    exitCode:
      r.exitCode === null || r.exitCode === undefined
        ? "—"
        : String(r.exitCode),
    at: r.at || null,
  };
}

/**
 * The display model. `status --json` emits this; the text renderer formats it.
 * One source of data for both modes, so they cannot disagree.
 */
function statusView({ current, runs = [], nowMs, isAlive }) {
  const state = runState(current, isAlive);
  const c = current || {};
  const recent = runs.slice(-5).map(normaliseRow);
  const counts = {};
  for (const r of runs) {
    const k = (r && r.outcome) || "unknown";
    counts[k] = (counts[k] || 0) + 1;
  }
  return {
    state,
    generatedAt: new Date(nowMs).toISOString(),
    run:
      state === "no-run" || state === "unreadable"
        ? null
        : {
            runId: c.runId || null,
            adapter: c.adapter || null,
            pid: typeof c.pid === "number" ? c.pid : null,
            iteration: typeof c.iteration === "number" ? c.iteration : null,
            phase: c.phase || null,
            itemId: c.itemId || null,
            pipelineStep: c.pipelineStep ?? null,
            branch: c.branch || null,
            prUrl: c.prUrl || null,
            sessionId: c.sessionId || null,
            logPath: c.logPath || null,
            updatedAt: c.updatedAt || null,
            totals: c.totals || null,
          },
    ledger: { total: runs.length, counts, recent },
  };
}

const HEAD = {
  running: "loop-supervisor — running",
  crashed: "loop-supervisor — CRASHED SUPERVISOR (heartbeat present, pid dead)",
  unreadable: "loop-supervisor — HEARTBEAT UNREADABLE (state unknown)",
  "no-run": "loop-supervisor — no run in flight",
};

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

/**
 * Render the display model as terminal lines.
 *
 * Returns an array of strings so the caller decides how to emit them — `status`
 * joins and prints, `watch` counts them to know how far to move the cursor.
 * Content only; callers add colour if they want it.
 */
function renderLines(view) {
  const out = [HEAD[view.state] || HEAD["no-run"], ""];

  if (view.state === "no-run") {
    out.push(
      "  No supervisor is running. This is the normal state after a clean exit —",
      "  current.json is removed when the loop ends.",
      "",
    );
  } else if (view.state === "unreadable") {
    out.push(
      "  current.json exists but could not be parsed, so the run's state is unknown.",
      "  This is NOT the same as no run in flight — a supervisor may well be running.",
      "  Most likely a heartbeat caught mid-write; try again in a few seconds.",
      "  If it persists, the file is corrupt: check it by hand before assuming the",
      "  loop has stopped.",
      "",
    );
  } else {
    const r = view.run;
    if (view.state === "crashed") {
      out.push(
        `  The process that wrote this heartbeat (pid ${r.pid ?? "?"}) is gone.`,
        "  The values below are the last thing it recorded, not live data.",
        "",
      );
    }
    out.push(`  ${pad("run", 12)}${r.runId || "—"}  (pid ${r.pid ?? "—"})`);
    out.push(`  ${pad("adapter", 12)}${r.adapter || "—"}`);
    out.push(
      `  ${pad("iteration", 12)}${r.iteration ?? "—"}   phase ${r.phase || "—"}   item ${r.itemId || "—"}`,
    );
    const step = r.pipelineStep === null ? "—" : `${r.pipelineStep}/8`;
    out.push(
      `  ${pad("pipeline", 12)}step ${step}   branch ${r.branch || "—"}`,
    );
    if (r.prUrl) out.push(`  ${pad("pr", 12)}${r.prUrl}`);
    const t = r.totals || {};
    out.push(
      `  ${pad("totals", 12)}${num(t.iterations)} iterations · ${money(t.costUsd)} · ${num(t.turns)} turns`,
    );
    out.push(
      `  ${pad("heartbeat", 12)}${formatAge(r.updatedAt, Date.parse(view.generatedAt))}`,
    );
    if (r.logPath) out.push(`  ${pad("log", 12)}${r.logPath}`);
    out.push("");
  }

  const led = view.ledger;
  if (!led.total) {
    out.push("  ledger      empty — no iteration has finished yet");
    return out;
  }
  const tally = Object.entries(led.counts)
    .map(([k, v]) => `${k} ${v}`)
    .join(" · ");
  out.push(`  ledger      ${led.total} iterations — ${tally}`);
  out.push("");
  out.push(
    `  ${pad("#", 4)}${pad("outcome", 12)}${pad("item", 10)}${pad("dur", 9)}${pad("cost", 10)}${pad("turns", 7)}reason`,
  );
  for (const row of led.recent) {
    out.push(
      `  ${pad(row.iteration ?? "—", 4)}${pad(row.outcome, 12)}${pad(row.itemId, 10)}` +
        `${pad(row.duration, 9)}${pad(row.cost, 10)}${pad(row.turns, 7)}${row.reason}`,
    );
  }
  return out;
}

/** Convenience: model → lines in one call. `status` and `watch` both use this. */
function render(args) {
  return renderLines(statusView(args));
}

/** The one-line summary a terminal-stop notification carries. */
function notificationText({ ok, outcome, reason, iterations, costUsd }) {
  const verdict = ok ? "finished" : "STOPPED";
  const cost = typeof costUsd === "number" ? ` · $${costUsd.toFixed(4)}` : "";
  return {
    title: `loop-supervisor ${verdict}: ${outcome}`,
    message: `${reason} — ${iterations} iteration${iterations === 1 ? "" : "s"}${cost}`,
  };
}

module.exports = {
  UNREADABLE,
  formatDuration,
  formatAge,
  runState,
  normaliseRow,
  statusView,
  renderLines,
  render,
  notificationText,
};
