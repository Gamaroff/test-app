#!/usr/bin/env node
// AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/registry-tick.js. Regenerate via `npm run bundle`.
/**
 * registry-tick — set a task's row in `docs/tasks/task-registry.md` to `accepted`.
 *
 * task.103 gave the registry tick an owner. `finalise` is that owner: it is the
 * single moment that already writes the DOCUMENT's `status: accepted` and
 * `completed_date`, so folding the row write into the same step is what makes
 * the two unable to disagree by construction. A check alone can only report a
 * disagreement after it exists.
 *
 * Peer of `tracker-comment.js` and `observation-log.js`, and it follows their
 * contract: `--json` prints a `reason`, and the whole success family exits 0.
 *
 * ## Non-blocking by design
 *
 * Every outcome except a usage error exits 0, including `no-row` and
 * `engine-unavailable`. This is deliberate: acceptance has already happened by
 * the time this runs, and a registry row is a human-readable index — refusing to
 * finalise a genuinely-complete task because its index line could not be found
 * would trade a cosmetic defect for a blocked pipeline. The loud backstop is
 * `evals/shared/tests/task-registry-drift.test.mjs`, which fails CI when a row
 * and its document disagree, so a silent no-op here is caught there rather than
 * being lost. **Read `reason` and log it** — that is what makes the difference
 * between a no-op that was noticed and one that was not.
 *
 * ## Why a CLI and not a paragraph in SKILL.md
 *
 * The task's own testing strategy requires proving two behaviours: that a
 * lite-mode run still ticks, and that a STORY run does not attempt a task
 * registry write. Both are assertions about what the code does. Written as
 * prose in `finalise/SKILL.md`, the only available test would grep the prose —
 * which proves the sentence exists, not that the behaviour holds.
 *
 * Usage:
 *   node registry-tick.js --file <document.md> [--registry <path>] [--dry-run] [--json]
 *   node registry-tick.js --annotate --file <document.md> --pr <n> [--issue <ref>]
 *                         [--registry <path>] [--dry-run] [--json]
 *
 * ## Two modes, one owner of the row
 *
 * The default mode is the Status tick above. `--annotate` is the SECOND,
 * additive write the row receives, after the merge: it appends `PR #<n> merged`
 * to the row's last cell (the registry's de-facto notes cell — `Depends on` in
 * the documented task-registry header, which rows have carried `… · PR #M
 * merged` in since task 100) and, when `--issue` is given, fills the `Issue`
 * cell if it still reads as empty (`—`, `none`, `n/a`, `tbd` …). It never touches Status — `finalise` owns that,
 * and a post-merge writer that also wrote Status would be the second Status
 * writer task.103 was written to remove (observation #46). task.113 put the
 * annotate write HERE rather than in `develop-next` Step 4's prose because a
 * prose sed admits no test but a grep, and because two files each holding a
 * "which cell is which" mapping drift in the worst direction — the tick
 * matching a row the annotate cannot find.
 *
 * `--issue` never overwrites a filled cell: a human may have linked a
 * different issue by hand, and the row is theirs. The payload says `kept`.
 *
 * Reasons (all exit 0):
 *   ticked             the row was rewritten to `accepted`
 *   already            the row already read `accepted` — idempotent no-op
 *                      (annotate: the notes cell already names this PR and the
 *                      Issue cell needs nothing)
 *   annotated          (annotate) the notes and/or Issue cell were written
 *   no-cell            (annotate) the row has no cell to write — fewer than the
 *                      documented columns, so the notes cell would be a data cell
 *   not-a-task         the document is not a task (a story/epic/bug run) — no registry applies.
 *                      For annotate this is also the bug-registry answer: that
 *                      registry has neither an Issue nor a notes cell.
 *   not-accepted       (tick) the document's own status is not `accepted`, so there is nothing to mirror;
 *                      (annotate) the ROW does not read `accepted` — annotating it would plant a
 *                      phantom dependency, since the notes cell is parsed for `task.N` references
 *   no-registry        the registry file does not exist in this project
 *   no-row             the registry has no row for this task id
 *   ambiguous-row      (tick) the row's status cell could not be identified unambiguously
 *   engine-unavailable the shared registry parser could not be located
 * Exit 2: usage error (including `--annotate` without `--pr`).
 */

"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_REGISTRY = "docs/tasks/task-registry.md";

function usage(msg) {
  process.stderr.write(
    `registry-tick: ${msg}\n\nUsage:\n  node registry-tick.js --file <document.md> [--registry <path>] [--dry-run] [--json]\n  node registry-tick.js --annotate --file <document.md> --pr <n> [--issue <ref>] [--registry <path>] [--dry-run] [--json]\n`,
  );
  process.exitCode = 2;
}

function parseArgs(argv) {
  const out = {
    file: null,
    registry: null,
    dryRun: false,
    json: false,
    annotate: false,
    pr: null,
    issue: null,
  };
  // A value-taking flag whose next token is missing or is itself a flag has no
  // value. Without this, `--issue --json` would take `--json` as the issue
  // reference AND drop the JSON output — two silent errors from one — and
  // `--registry --json` the same for the path. One helper, all four flags.
  const takeValue = (flag, i) => {
    const v = argv[i + 1];
    if (v === undefined || /^--/.test(v)) {
      throw new Error(`${flag} requires a value`);
    }
    return v;
  };
  try {
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i];
      if (a === "--file") out.file = takeValue(a, i++);
      else if (a === "--registry") out.registry = takeValue(a, i++);
      else if (a === "--annotate") out.annotate = true;
      else if (a === "--pr") out.pr = takeValue(a, i++);
      else if (a === "--issue") out.issue = takeValue(a, i++);
      else if (a === "--dry-run") out.dryRun = true;
      else if (a === "--json") out.json = true;
      else if (a === "--help" || a === "-h") out.help = true;
      else return { error: `unknown argument ${JSON.stringify(a)}` };
    }
  } catch (e) {
    return { error: e.message };
  }
  return out;
}

/** Frontmatter `status:` — the same shape `parseFrontmatterStatus` reads. */
function frontmatterField(text, field) {
  const m = String(text).match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const re = new RegExp(`^${field}\\s*:(.*)$`, "m");
  const line = m[1].match(re);
  if (!line) return null;
  let v = line[1].trim();
  v = v.replace(/\s+#.*$/, "").trim();
  v = v.replace(/^['"]|['"]$/g, "").trim();
  return v || null;
}

/**
 * Walk up from `start` looking for the repo root, then for the develop-next
 * selector that owns the registry table parser.
 *
 * The parser is IMPORTED, never reimplemented. A second copy of "what a registry
 * row looks like" would be free to drift from the one the drift check and the
 * roadmap selector both use — and it would drift in the worst direction, because
 * a private parser that matched nothing would tick nothing and report success.
 */
function locateSelector(start) {
  const candidates = [
    path.join("skills", "develop-next", "scripts", "select-next.mjs"),
    path.join(
      ".agents",
      "skills",
      "develop-next",
      "scripts",
      "select-next.mjs",
    ),
    path.join(
      ".claude",
      "skills",
      "develop-next",
      "scripts",
      "select-next.mjs",
    ),
  ];
  let dir = path.resolve(start);
  for (;;) {
    for (const rel of candidates) {
      const p = path.join(dir, rel);
      if (fs.existsSync(p)) return p;
    }
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  // Bundled beside this file (a packaged skill), as a last resort.
  const sibling = path.join(__dirname, "select-next.mjs");
  return fs.existsSync(sibling) ? sibling : null;
}

function emit(opts, payload) {
  // One payload shape per mode: every annotate-mode outcome carries
  // `annotated`, every tick-mode outcome carries `ticked` — including the early
  // exits shared by both modes, which would otherwise report the other mode's
  // key and leave a `--json` consumer reading `undefined`.
  if (opts.annotate) {
    if (payload.annotated === undefined) payload.annotated = false;
    delete payload.ticked;
  } else if (payload.ticked === undefined) {
    payload.ticked = false;
  }
  if (opts.json) process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
  else process.stdout.write(`${payload.reason}: ${payload.message}\n`);
  process.exitCode = payload.exitCode;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.error) return usage(opts.error);
  if (opts.help) return usage("help");
  if (!opts.file) return usage("--file is required");
  if (!fs.existsSync(opts.file)) return usage(`--file not found: ${opts.file}`);
  if (opts.annotate) {
    // The PR number is the one fact the annotate write exists to record; an
    // annotate call without it has nothing to write and is a caller bug, not a
    // registry state — so it is the usage family, not an exit-0 reason.
    if (!opts.pr || !/^\d+$/.test(String(opts.pr).replace(/^#/, ""))) {
      return usage("--annotate requires --pr <n> (a pull request number)");
    }
    opts.pr = String(opts.pr).replace(/^#/, "");
    // `--issue` is written into a markdown table cell verbatim, so the two
    // characters that break a table are refused here, once, rather than
    // trusted to every caller. (A MISSING value is already a parseArgs error;
    // this is the empty/whitespace case, which would blank the cell and still
    // report `written`.)
    if (opts.issue !== null) {
      const v = String(opts.issue);
      if (v.trim() === "") return usage("--issue requires a value");
      if (/[|\r\n]/.test(v)) {
        return usage(
          '--issue must not contain "|", CR or LF — it is written into a table cell',
        );
      }
      opts.issue = v;
    }
  } else if (opts.pr !== null || opts.issue !== null) {
    return usage("--pr and --issue are only meaningful with --annotate");
  }

  const base = path.basename(opts.file);
  const idMatch = base.match(/^task\.(\d+)\./);
  const docText = fs.readFileSync(opts.file, "utf8");
  const docType = (frontmatterField(docText, "type") || "").toLowerCase();

  // The story-run guard, and the asymmetry between its two signals is deliberate.
  //
  // The filename's `task.{N}.` stem is REQUIRED — it carries the id the registry
  // row is keyed on, so without it there is nothing to look up. OKF's `type` may
  // only CONTRADICT that stem, never be missing: a document predating the `type`
  // field is still a task, and refusing to tick it would punish the oldest
  // documents in the corpus for a convention added after they were written. So
  // an absent `type` passes and a `type: story` does not.
  //
  // A story, epic or bug run reaching this call is a no-op, not an error —
  // `finalise` is shared across document kinds and calls this unconditionally,
  // which is precisely why the refusal lives here rather than in a prose
  // condition the caller has to remember.
  if (!idMatch || (docType && docType !== "task")) {
    return emit(opts, {
      reason: "not-a-task",
      message: `${base} is not a task document (type=${docType || "unset"}) — no task registry applies`,
      ticked: false,
      exitCode: 0,
    });
  }
  const taskId = Number(idMatch[1]);

  const docStatus = (frontmatterField(docText, "status") || "").toLowerCase();
  // The annotate write records a MERGE, which is a fact about the PR rather
  // than about the document's status — and it runs after `finalise` has set
  // `accepted` anyway. Gating it on the status would make a manual
  // re-annotation of an older row impossible for no protective gain.
  if (!opts.annotate && docStatus !== "accepted") {
    return emit(opts, {
      reason: "not-accepted",
      message: `task ${taskId} reads \`${docStatus || "(no status)"}\` — the row mirrors \`accepted\` and nothing else`,
      taskId,
      ticked: false,
      exitCode: 0,
    });
  }

  const registryRel = opts.registry || DEFAULT_REGISTRY;
  if (!fs.existsSync(registryRel)) {
    return emit(opts, {
      reason: "no-registry",
      message: `no registry at ${registryRel} — this project does not keep one`,
      taskId,
      ticked: false,
      exitCode: 0,
    });
  }

  const selector = locateSelector(path.dirname(path.resolve(registryRel)));
  if (!selector) {
    return emit(opts, {
      reason: "engine-unavailable",
      message:
        "could not locate skills/develop-next/scripts/select-next.mjs — the registry parser is imported, never reimplemented, so the tick is skipped. The drift check will report the untouched row.",
      taskId,
      ticked: false,
      exitCode: 0,
    });
  }

  const { pathToFileURL } = require("url");
  const { parseRegistry } = await import(pathToFileURL(selector).href);

  const registryText = fs.readFileSync(registryRel, "utf8");
  const { rows } = parseRegistry(registryText, "task", registryRel);
  const row = rows.find((r) => r.n === taskId);
  if (!row) {
    return emit(opts, {
      reason: "no-row",
      message: `registry ${registryRel} has no row for task ${taskId}`,
      taskId,
      ticked: false,
      exitCode: 0,
    });
  }

  if (opts.annotate) {
    // The notes cell is the `Depends on` cell the selector's dependency parser
    // reads, and `PR #381 merged` parses as a dependency on task 381. On an
    // accepted row that is inert — eligibility skips the row before its
    // dependencies are evaluated — but on any other row it would inject a
    // phantom dependency that can block the row's selection. So the ROW must
    // already read `accepted`, which by Step 4 it does: `finalise` ticked it.
    // The DOCUMENT's status is deliberately not consulted (see above).
    if (row.registryStatus !== "accepted") {
      return emit(opts, {
        reason: "not-accepted",
        message: `task ${taskId} row (line ${row.line}) reads \`${row.registryStatus}\` — annotate only an accepted row, or the note becomes a phantom dependency`,
        taskId,
        line: row.line,
        annotated: false,
        exitCode: 0,
      });
    }
    return annotate(opts, { registryRel, registryText, row, taskId });
  }

  if (row.registryStatus === "accepted") {
    return emit(opts, {
      reason: "already",
      message: `task ${taskId} row (line ${row.line}) already reads \`accepted\``,
      taskId,
      line: row.line,
      ticked: false,
      exitCode: 0,
    });
  }

  // Rewrite the one cell, in the one line the parser identified. The status
  // cell is found by matching the value the parser reported rather than by a
  // column index, so this never needs its own copy of the header mapping. When
  // more than one cell carries that value the column is genuinely ambiguous —
  // refuse rather than guess, because guessing here corrupts the registry, and a
  // wrong row is worse than a stale one.
  // Split KEEPING the separators, so every byte this call does not deliberately
  // change survives untouched.
  //
  // The obvious form — `split(/\r?\n/)` then `join("\n")` — silently rewrites a
  // CRLF registry as LF: every line changes, turning a one-cell tick into a
  // whole-file diff, and invisible in a rendered diff view. Guessing the file's
  // ending instead (`includes("\r\n") ? … : …`) fixes the common case and gets a
  // MIXED-ending file exactly backwards, converting its LF lines to CRLF.
  //
  // Keeping the separators removes the question rather than answering it: only
  // one line is ever rewritten, so nothing else can be reflowed by accident.
  // `parts[i * 2]` is line `i`; `parts[i * 2 + 1]` is the separator that followed
  // it.
  const parts = registryText.split(/(\r?\n)/);
  const idx = (row.line - 1) * 2;
  const original = parts[idx];
  const cells = original.split("|");
  const hits = [];
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].trim().toLowerCase() === row.registryStatus) hits.push(i);
  }
  if (hits.length !== 1) {
    return emit(opts, {
      reason: "ambiguous-row",
      message:
        `line ${row.line} has ${hits.length} cells reading \`${row.registryStatus}\` — ` +
        `cannot tell which is the Status column. Tick it by hand.`,
      taskId,
      line: row.line,
      ticked: false,
      exitCode: 0,
    });
  }

  // Preserve the cell's total WIDTH, not merely its padding, so a column-aligned
  // table keeps its alignment and the diff stays one visible change rather than a
  // whole reflowed row. The length delta is absorbed by the TRAILING padding —
  // the leading run is kept verbatim because it is what separates the value from
  // the pipe.
  //
  // Two boundaries, both deliberate:
  //   - a cell with no trailing whitespace at all (`|planned|`) gets none back,
  //     rather than acquiring a space it never had;
  //   - a cell too narrow to hold `accepted` keeps one separating space and the
  //     row widens. Alignment is worth preserving, never worth corrupting a value
  //     to achieve.
  setCell(cells, hits[0], "accepted");
  parts[idx] = cells.join("|");

  if (!opts.dryRun) {
    fs.writeFileSync(registryRel, parts.join(""), "utf8");
  }

  return emit(opts, {
    reason: opts.dryRun ? "dry-run" : "ticked",
    message: `task ${taskId} row (line ${row.line}): \`${row.registryStatus}\` → \`accepted\`${opts.dryRun ? " (dry run — not written)" : ""}`,
    taskId,
    line: row.line,
    from: row.registryStatus,
    to: "accepted",
    ticked: !opts.dryRun,
    exitCode: 0,
  });
}

/**
 * A cell that says "nothing here yet". The spellings mirror the selector's
 * `DEP_EMPTY_RE` (select-next.mjs), which reads the same `Depends on` cell:
 * the two readers must agree on what empty means, so that a cell the selector
 * treats as empty is REPLACED here rather than appended to — `none · PR #n
 * merged` would no longer be empty to the selector, which would then parse
 * `#n` as a dependency reference.
 */
const EMPTY_CELL_RE = /^(?:[—–-]|none|n\/a|na|tbd)?$/i;
function isEmptyCell(cell) {
  return EMPTY_CELL_RE.test(String(cell).trim());
}

/**
 * Rewrite one cell of `cells` in place, keeping the leading whitespace and —
 * where the new value fits — the cell's total width. The one implementation of
 * the width rule: the tick path and the annotate path both call it.
 * A cell that grows keeps one trailing space so the pipe stays separated.
 */
function setCell(cells, i, value) {
  const cell = cells[i];
  const lead = cell.match(/^\s*/)[0];
  const trailLen = cell.match(/\s*$/)[0].length;
  const core = `${lead}${value}`;
  const pad = trailLen === 0 ? 0 : Math.max(1, cell.length - core.length);
  cells[i] = core + " ".repeat(pad);
}

/**
 * Header cells that name a DATA column. A table whose LAST header cell is one
 * of these has no notes cell, and the annotate write must refuse rather than
 * append prose to a date or a priority. `depends on` is deliberately absent:
 * it is the documented last column of the task registry and the cell every
 * accepted row since task 100 has used as free text.
 */
const DATA_COLUMN_NAMES = new Set([
  "#",
  "no",
  "num",
  "number",
  "id",
  "title",
  "name",
  "status",
  "category",
  "type",
  "kind",
  "priority",
  "severity",
  "created",
  "filed",
  "date",
  "updated",
  "issue",
  "area",
  "owner",
  "assignee",
]);

/**
 * Locate the header of the table that CONTAINS `rowLine`: walk up from the row
 * over table lines only, and take the line above the first separator met.
 *
 * Two bounds, both from QA on task.113: the walk stops at the first line that
 * is not a table row, so an earlier, unrelated table (a `| Key | Meaning |`
 * legend above the registry) can never supply the header; and the separator
 * must itself be a table row (`|---|`), so a bare `---` horizontal rule or a
 * frontmatter fence is not mistaken for one. The selector keeps its own
 * separator regex for parsing whole files; this one answers a narrower
 * question — "is this the separator of the row's own table?" — and is bounded
 * by the table rather than by the file, which is why it is not the same regex.
 * Returns the header cells, or null when the row's table has no header.
 */
function findHeader(parts, rowLine) {
  for (let li = rowLine - 2; li >= 0; li--) {
    const line = parts[li * 2] || "";
    if (!/^\s*\|/.test(line)) return null; // left the table without a separator
    // Any GFM delimiter row the selector accepts: hyphens with optional
    // colons, any count (`| - |`, `|:--|`, `|---|`).
    if (/^\s*\|\s*:?-+:?\s*\|/.test(line)) {
      const above = parts[(li - 1) * 2] || "";
      return /^\s*\|/.test(above) ? above.split("|") : null;
    }
  }
  return null;
}

/**
 * The `--annotate` write. Column resolution is deliberately narrow, and both
 * cells are resolved from the row's OWN table header:
 *
 *   - the NOTES cell is the row's last cell — but only when the header names
 *     that column as something other than a data column. The documented
 *     task-registry header ends in `Depends on`, and every accepted row since
 *     task 100 has used it as the free-text cell (`task.104 · PR #381. …`).
 *     A registry whose last column is `Created` or `Area` answers `no-cell`
 *     and is left alone: the earlier numeric guard (`< 5 cells`) was
 *     unreachable — the parser already drops such rows — and let a six-column
 *     consumer registry have its Created cell rewritten.
 *   - the ISSUE cell is found by header NAME (`Issue`, case-insensitive). There
 *     is no positional fallback: a wrong Issue cell is a corrupted link, and
 *     nothing about a position says "this holds a tracker link".
 *
 * The header is read here, not added to the selector's `COLUMN_ALIASES`,
 * because the selector reads the registry to SELECT and has no use for an
 * Issue column; adding one there would be a selector change the task rules out.
 */
function annotate(opts, { registryRel, registryText, row, taskId }) {
  const parts = registryText.split(/(\r?\n)/);
  const idx = (row.line - 1) * 2;
  const original = parts[idx];
  const cells = original.split("|");
  // `| a | b |` splits to ["", " a ", " b ", ""]; the trailing "" is the
  // closing pipe. A row without a closing pipe has no such element.
  const closed = cells.length > 0 && cells[cells.length - 1].trim() === "";
  const last = closed ? cells.length - 2 : cells.length - 1;

  const header = findHeader(parts, row.line);
  const headerClosed = header && header[header.length - 1].trim() === "";
  const headerLast = header
    ? headerClosed
      ? header.length - 2
      : header.length - 1
    : -1;
  const lastName = header ? header[headerLast].trim().toLowerCase() : null;
  if (
    !header ||
    last < 1 ||
    headerLast !== last ||
    DATA_COLUMN_NAMES.has(lastName)
  ) {
    return emit(opts, {
      reason: "no-cell",
      message: !header
        ? `task ${taskId} row (line ${row.line}) has no table header above it — cannot tell which cell is the notes cell`
        : headerLast !== last
          ? `task ${taskId} row (line ${row.line}) has ${last} cells but its header has ${headerLast} — cannot align the notes cell`
          : `task ${taskId} row (line ${row.line}): last column is \`${header[headerLast].trim()}\`, a data column — no notes cell to annotate`,
      taskId,
      line: row.line,
      lastColumn: lastName,
      annotated: false,
      exitCode: 0,
    });
  }
  const issueCol = header.findIndex((c) => c.trim().toLowerCase() === "issue");

  const prText = `PR #${opts.pr} merged`;
  const notesHas = new RegExp(`PR #${opts.pr}\\b`).test(cells[last]);
  let notes = "unchanged";
  if (!notesHas) {
    const existing = cells[last].trim();
    setCell(
      cells,
      last,
      isEmptyCell(existing) ? prText : `${existing} · ${prText}`,
    );
    notes = "written";
  }

  let issue = "not-requested";
  if (opts.issue !== null) {
    if (issueCol === -1 || issueCol > last) issue = "no-column";
    else if (!isEmptyCell(cells[issueCol])) issue = "kept";
    else {
      setCell(cells, issueCol, opts.issue);
      issue = "written";
    }
  }

  const wrote = notes === "written" || issue === "written";
  if (!wrote) {
    return emit(opts, {
      reason: "already",
      message:
        `task ${taskId} row (line ${row.line}) already names PR #${opts.pr}` +
        (issue === "kept"
          ? "; Issue cell already filled"
          : issue === "no-column"
            ? "; registry has no Issue column"
            : ""),
      taskId,
      line: row.line,
      notes,
      issue,
      annotated: false,
      exitCode: 0,
    });
  }

  parts[idx] = cells.join("|");
  if (!opts.dryRun) {
    fs.writeFileSync(registryRel, parts.join(""), "utf8");
  }
  return emit(opts, {
    reason: opts.dryRun ? "dry-run" : "annotated",
    message: `task ${taskId} row (line ${row.line}): notes ${notes}, issue ${issue}${opts.dryRun ? " (dry run — not written)" : ""}`,
    taskId,
    line: row.line,
    notes,
    issue,
    annotated: !opts.dryRun,
    exitCode: 0,
  });
}

main().catch((err) => {
  process.stderr.write(
    `registry-tick: ${err && err.stack ? err.stack : err}\n`,
  );
  process.exitCode = 2;
});
