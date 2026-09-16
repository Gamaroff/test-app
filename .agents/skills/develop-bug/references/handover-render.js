#!/usr/bin/env node
// AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/handover-render.js. Regenerate via `npm run bundle`.
// ---------------------------------------------------------------------------
// handover-render.js — the four renderings of a deferred-mutation journal.
//
// A journal is a list of records (see tracker-access-record.md). This file turns
// that list into exactly four outputs, each a PURE FUNCTION of the record list:
//
//   md       a committed markdown checklist   — a human clicks through it
//   sh       a runnable shell script          — an operator with the credential runs it
//   json     a machine sidecar                — task.57's reconcile input
//   summary  an inline run-end block          — the orchestrator prints and pastes it
//
// `summary` is a first-class renderer, not a courtesy: it is subject to the same
// totality test as the other three, because a run-end block that silently omits
// an action is the same invisible-drift failure as a checklist that does.
//
// THE INVARIANT THAT MATTERS MOST IS TOTALITY. Every one of the 23 kinds must
// render in all four outputs. There is deliberately NO silent `default:` case
// anywhere below: an unknown kind raises, and the roster is read from the schema
// doc rather than a list in this file, so adding a kind without a renderer fails
// the suite rather than passing vacuously.
//
// Usage:
//   node handover-render.js --journal .claude/state/tracker-actions.jsonl \
//     --format md --out docs/tasks/task.52.foo/task.52.handover.1.foo.md
//   node handover-render.js --journal … --format summary        # stdout
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

const dm = require("./defer-mutation.js");

const FORMATS = Object.freeze(["md", "sh", "json", "summary"]);
const SCRIPT_MODE = 0o644; // never executable — nobody runs it by accident

// ---------------------------------------------------------------------------
// Per-kind presentation
// ---------------------------------------------------------------------------
//
// The ONE place a kind gets human-facing wording. Keyed by the roster's kinds;
// `presentationFor` refuses an absent key rather than falling back to a generic
// phrase, which is what makes "add a kind with no renderer" a red test instead
// of a quietly ugly checklist.
//
// `verb` completes "…" in the checklist item. `noun` names the object. Both are
// deliberately short — the record's own `intent` carries the specifics.

const KIND_PRESENTATION = Object.freeze({
  // ── Jira ────────────────────────────────────────────────────────────────
  "jira.issue.create": { verb: "Create", noun: "Jira issue" },
  "jira.issue.update": { verb: "Update fields on", noun: "Jira issue" },
  "jira.comment.add": { verb: "Comment on", noun: "Jira issue" },
  "jira.issue.link": { verb: "Link", noun: "Jira issues" },
  "jira.worklog.add": { verb: "Log work on", noun: "Jira issue" },
  "jira.backlog.add": { verb: "Add to the backlog", noun: "Jira issue" },
  "jira.sprint.move-issues": {
    verb: "Move into the sprint",
    noun: "Jira issues",
  },
  "jira.sprint.set-state": { verb: "Change the state of", noun: "sprint" },
  "jira.transition": { verb: "Transition", noun: "Jira issue" },
  // The fail-closed catch-all: layer 1 refused a non-GET nobody annotated, so
  // the wording says only what is known — that a REST call must be replayed by
  // hand. The record's own `intent` and `desired` carry the method and URL.
  "jira.unknown-mutation": {
    verb: "Perform by hand the unrecognised REST call on",
    noun: "Jira",
  },

  // ── GitHub ──────────────────────────────────────────────────────────────
  "github.issue.create": { verb: "Create", noun: "GitHub issue" },
  "github.issue.edit": { verb: "Edit", noun: "GitHub issue" },
  "github.issue.close": { verb: "Close", noun: "GitHub issue" },
  "github.issue.reopen": { verb: "Reopen", noun: "GitHub issue" },
  "github.issue.comment": { verb: "Comment on", noun: "GitHub issue" },
  "github.milestone.create": { verb: "Create", noun: "GitHub milestone" },
  "github.sub-issue.add": {
    verb: "Attach as a sub-issue",
    noun: "GitHub issue",
  },
  "github.board.item-add": { verb: "Add to the board", noun: "board item" },
  "github.board.field-set": {
    verb: "Set the board field on",
    noun: "board item",
  },
  "github.pr.create": { verb: "Open", noun: "pull request" },
  "github.pr.comment": { verb: "Comment on", noun: "pull request" },
  "github.pr.merge": { verb: "Merge", noun: "pull request" },
  // Bitbucket's only kind. Same verb as its GitHub twin on purpose: an
  // operator working a handover reads the intent line for the anchor, and the
  // system prefix already says which platform.
  "bitbucket.pr.comment": { verb: "Comment on", noun: "pull request" },
  // The GitHub twin of jira.unknown-mutation. `tracker_write` wraps ~38 `gh`
  // mutations generically and infers a kind from argv where it can; a shape it
  // does not recognise lands here rather than being dropped. The wording says
  // "unrecognised" out loud on purpose — a reader needs to know the checklist
  // cannot describe this one, and must fall back to the recorded argv.
  "github.unknown-mutation": {
    verb: "Run by hand the unrecognised gh command against",
    noun: "GitHub",
  },
});

/**
 * Wording for a kind. Refuses an unknown one — see the totality note above.
 * @param {string} kind
 */
function presentationFor(kind) {
  const p = KIND_PRESENTATION[kind];
  if (!p) {
    throw new Error(
      `handover-render: no renderer for kind "${kind}". Every kind in the roster ` +
        `(tracker-access-record.md) needs an entry in KIND_PRESENTATION. Adding a ` +
        `kind without one must fail, not render a generic line.`,
    );
  }
  return p;
}

const CONSEQUENCE_LABEL = Object.freeze({
  "state-drift":
    "State drift — the board and reality disagree until this is done",
  communication:
    "Communication — a record nobody reads is lost; nothing breaks",
  irreversible: "Irreversible — cannot be undone, and is not safe to run twice",
});

const CONSEQUENCE_ORDER = Object.freeze([
  "irreversible",
  "state-drift",
  "communication",
]);

const SYSTEM_LABEL = Object.freeze({ jira: "Jira", github: "GitHub" });

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

/**
 * Deduplicate by `id`, keeping the FIRST occurrence.
 *
 * A resume re-emits records; the later copy carries no information the first
 * lacks, and keeping the first preserves the original `order`.
 */
function dedupe(records) {
  const seen = new Map();
  for (const r of records) if (!seen.has(r.id)) seen.set(r.id, r);
  return [...seen.values()];
}

/**
 * Topological sort on `dependsOn`, with (order, ts, id) as the tie-break.
 *
 * Sorting by `order` alone is the bug this exists to prevent: a comment on an
 * issue that must first exist would be listed before the issue's creation
 * whenever the two were emitted out of sequence.
 *
 * A cycle (or a dangling id) cannot be honoured, so the affected records fall
 * back to the tie-break order and a warning is raised — refusing to render at
 * all would lose the whole handover over one bad edge.
 *
 * @returns {{sorted: object[], warnings: string[]}}
 */
function topoSort(records) {
  const warnings = [];
  const byId = new Map(records.map((r) => [r.id, r]));

  const tieBreak = (a, b) =>
    (a.order || 0) - (b.order || 0) ||
    String(a.ts || "").localeCompare(String(b.ts || "")) ||
    String(a.id).localeCompare(String(b.id));

  const pending = [...records].sort(tieBreak);
  const sorted = [];
  const state = new Map(); // id → "visiting" | "done"

  const visit = (rec) => {
    const st = state.get(rec.id);
    if (st === "done") return;
    if (st === "visiting") {
      warnings.push(
        `dependsOn cycle involving ${rec.id} — falling back to order for the cycle`,
      );
      return;
    }
    state.set(rec.id, "visiting");
    const deps = Array.isArray(rec.dependsOn) ? rec.dependsOn : [];
    for (const depId of deps.slice().sort()) {
      const dep = byId.get(depId);
      if (!dep) {
        warnings.push(
          `${rec.id} dependsOn ${depId}, which is not in this journal — edge ignored`,
        );
        continue;
      }
      visit(dep);
    }
    state.set(rec.id, "done");
    sorted.push(rec);
  };

  for (const rec of pending) visit(rec);
  return { sorted, warnings };
}

/**
 * Split a sorted record list into the buckets every renderer shares.
 *
 * `retry_of` records are kept apart from policy deferrals on purpose: a
 * full-access consumer reading a handover file wants to know that something
 * BROKE, not that a mode declined it. Merging the two buries the first.
 */
function partition(sorted) {
  const outstanding = [];
  const satisfied = [];
  const failures = [];
  // task.57's verification pass subdivides `outstanding` by what a read of the
  // live tracker showed. The three sub-lists PARTITION `outstanding` exactly:
  // pending + divergent + unverifiable === outstanding, and
  // outstanding + satisfied + failures === all. Item count always equals
  // record count — a satisfied action is ticked, never deleted.
  const pending = [];
  const divergent = [];
  const unverifiable = [];
  for (const r of sorted) {
    const vstate = r.verification && r.verification.state;
    if (r.satisfied === true || vstate === "satisfied") satisfied.push(r);
    else if (r.retry_of) failures.push(r);
    else {
      outstanding.push(r);
      if (vstate === "divergent") divergent.push(r);
      else if (vstate === "unverifiable") unverifiable.push(r);
      else pending.push(r);
    }
  }
  return { outstanding, satisfied, failures, pending, divergent, unverifiable };
}

/** The verification state of a record, as the renderers read it. */
function verificationState(rec) {
  if (rec.satisfied === true) return "satisfied";
  const v = rec.verification && rec.verification.state;
  if (v === "satisfied" || v === "divergent" || v === "unverifiable") return v;
  return "pending";
}

/** Group records by system, preserving within-group order. */
function groupBySystem(records) {
  const groups = new Map();
  for (const r of records) {
    if (!groups.has(r.system)) groups.set(r.system, []);
    groups.get(r.system).push(r);
  }
  return groups;
}

/**
 * Build the render model once, so all four formats agree by construction.
 *
 * @param {object[]} records
 * @param {object} [ctx]
 * @param {string[]} [ctx.expected] - moments the run was expected to record
 * @returns {object}
 */
function buildModel(records, ctx = {}) {
  const deduped = dedupe(records || []);
  const { sorted, warnings } = topoSort(deduped);
  const { outstanding, satisfied, failures, pending, divergent, unverifiable } =
    partition(sorted);

  // A moment the run was expected to record but did not. Rendering nothing here
  // is what makes drift invisible, so it is rendered loudly instead.
  const seenKinds = new Set(sorted.map((r) => r.kind));
  const unrecorded = (ctx.expected || []).filter((k) => !seenKinds.has(k));

  // Refuse unknown kinds up front, so every format fails the same way rather
  // than three succeeding and one throwing halfway through a file write.
  for (const r of sorted) presentationFor(r.kind);

  // Blocking records, computed ONCE here so both renderers read the same list.
  // Deriving it separately in `md` and in `summary` is how the two end up
  // disagreeing about whether a run is blocked — and the whole point of the
  // banner is that the two agree loudly.
  //
  // Only OUTSTANDING records can block. A blocking record that is `satisfied`
  // (the value already exists) or is a `failure` retry has nothing left to
  // block on, and banner-ing it would tell an operator to go and perform an
  // action that is already done.
  const blocking = outstanding.filter((r) => r.blocking === true);

  return {
    v: dm.SCHEMA_VERSION,
    all: sorted,
    outstanding,
    satisfied,
    failures,
    pending,
    divergent,
    unverifiable,
    unrecorded,
    blocking,
    warnings: warnings.concat(ctx.warnings || []),
    bySystem: groupBySystem(outstanding),
    counts: {
      total: sorted.length,
      outstanding: outstanding.length,
      satisfied: satisfied.length,
      failures: failures.length,
      pending: pending.length,
      divergent: divergent.length,
      unverifiable: unverifiable.length,
      unrecorded: unrecorded.length,
      blocking: blocking.length,
    },
    context: {
      run: ctx.run || (sorted[0] && sorted[0].run) || "",
      access: ctx.access || (sorted[0] && sorted[0].access) || "",
      workItem: ctx.workItem || "",
    },
  };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** POSIX single-quote one argv element. Safe for ANY content. */
function shQuote(s) {
  return `'${String(s).split("'").join(`'\\''`)}'`;
}

/**
 * Reduce a string to something safe to put in a generated `#` comment.
 *
 * A newline here is not cosmetic: `# [id] ${intent}` with an interior newline
 * ends the comment and drops whatever follows at FILE SCOPE, where it executes
 * on every invocation — including the dry run the documentation presents as
 * safe, in a script this pipeline COMMITS to the repository. Control characters
 * go for the same reason.
 */
function shComment(s) {
  return String(s === undefined || s === null ? "" : s)
    .replace(/[\r\n]+/g, " ")
    .replace(/[^\x20-\x7e]/g, "·");
}

function targetLabel(rec) {
  const t = rec.target || {};
  return (
    t.issue ||
    t.pr ||
    t.key ||
    t.sprint ||
    t.item ||
    t.board ||
    t.name ||
    "(unspecified target)"
  );
}

/** Where the human performs the action; falls back to the object's own URL. */
function actionUrl(rec) {
  const t = rec.target || {};
  return t.ui_url || t.url || "";
}

function describeDesired(rec) {
  if (!rec.desired || typeof rec.desired !== "object") return "";
  const parts = Object.entries(rec.desired).map(
    ([k, v]) => `${k} = ${typeof v === "string" ? v : JSON.stringify(v)}`,
  );
  return parts.join(", ");
}

/**
 * Render an observed value for display. Object observations JSON-stringify
 * rather than degrading to "[object Object]" — one helper for every
 * interpolation site so the four formats cannot disagree.
 */
function formatObserved(v) {
  if (v === undefined || v === null) return "";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

/** One-line headline shared by md and summary, so the two cannot disagree. */
function headline(rec) {
  const { verb, noun } = presentationFor(rec.kind);
  const desired = describeDesired(rec);
  return `${verb} ${noun} ${targetLabel(rec)}${desired ? ` → ${desired}` : ""}`;
}

// ---------------------------------------------------------------------------
// Renderer 1/4 — markdown checklist (mode `manual`, and half of `approve`)
// ---------------------------------------------------------------------------

function renderMarkdown(model) {
  const L = [];
  const ctx = model.context;

  L.push("# Tracker actions required");
  L.push("");
  L.push(
    "This run could not perform the tracker mutations below. Each one is listed with " +
      "where to do it and exactly what to enter. Tick a box when you have done it.",
  );
  L.push("");
  L.push("| | |");
  L.push("| --- | --- |");
  if (ctx.run) L.push(`| Run | \`${ctx.run}\` |`);
  if (ctx.access) L.push(`| Access mode | \`${ctx.access}\` |`);
  if (ctx.workItem) L.push(`| Work item | ${ctx.workItem} |`);
  L.push(`| Outstanding | ${model.counts.outstanding} |`);
  if (model.counts.blocking)
    L.push(`| **Blocking** | **${model.counts.blocking}** |`);
  if (model.counts.divergent)
    L.push(`| **⚠️ Divergent** | **${model.counts.divergent}** |`);
  if (model.counts.unverifiable)
    L.push(`| Unverifiable | ${model.counts.unverifiable} |`);
  if (model.counts.failures)
    L.push(`| Failed (full access) | ${model.counts.failures} |`);
  if (model.counts.satisfied)
    L.push(`| Already correct | ${model.counts.satisfied} |`);
  L.push("");

  // ── The blocking banner ───────────────────────────────────────────────────
  //
  // AT THE TOP, not in document order, and that placement is the entire point.
  // These records yield a value nothing else can supply, so until a human
  // performs them the run cannot converge — and a blocking record sitting at
  // position 17 of a checklist is a blocking record nobody does first.
  //
  // It also has to explain the two-run convergence, because the failure mode it
  // guards against is silent: the operator re-runs, the run does nothing again
  // (the key still is not in the document), and a run that appears to do nothing
  // twice is indistinguishable from a broken one.
  if (model.blocking.length) {
    L.push("## 🚫 BLOCKING — do these first");
    L.push("");
    L.push(
      "The run stopped short of writing values it could not obtain. Each action below " +
        "yields something later steps need, and nothing else can supply it.",
    );
    L.push("");
    L.push("**After performing each one:**");
    L.push("");
    L.push(
      "1. Copy the value it produced (an issue number, a milestone number).",
    );
    L.push(
      "2. Write it into the document's frontmatter — the field is named below.",
    );
    L.push("3. Re-run the skill. It will find the value present and carry on.");
    L.push("");
    L.push(
      "> Re-running **without** step 2 does nothing at all, every time. That is not a " +
        "bug — the run has no way to learn the value except from the document. No " +
        "placeholder was written on your behalf, because a wrong key would defeat the " +
        "duplicate guard and leave you with two issues instead of none.",
    );
    L.push("");
    for (const rec of model.blocking) {
      const p = presentationFor(rec.kind);
      L.push(
        `- 🚫 **${p.verb} ${p.noun}** — ${rec.intent}` +
          (rec.produces ? ` → yields \`${rec.produces}\`` : ""),
      );
    }
    L.push("");
  }

  if (model.counts.outstanding === 0 && model.counts.failures === 0) {
    L.push("✅ Nothing outstanding.");
    L.push("");
  }

  // Which records have already been emitted, at any depth. A record that is the
  // TARGET of a dependsOn edge is emitted nested beneath its dependency; without
  // this set the consequence-group loop below emitted it a SECOND time as a
  // top-level item, so a 3-record chain produced 5 checkboxes and an operator
  // performed each dependent action twice — creating a duplicate issue where the
  // kind was irreversible.
  //
  // Tracked in a local Set rather than a `_rendered` property on the records,
  // because writing to the records made renderMarkdown non-idempotent (a second
  // render saw every child already flagged and dropped all nesting) and mutated
  // the caller's own objects.
  const seen = new Set();

  for (const [system, recs] of model.bySystem) {
    const body = [];
    for (const consequence of CONSEQUENCE_ORDER) {
      const group = recs.filter(
        (r) => r.consequence === consequence && !seen.has(r.id),
      );
      if (!group.length) continue;
      const section = [];
      for (const rec of group) {
        if (seen.has(rec.id)) continue; // an earlier item in this group nested it
        section.push(...markdownItem(rec, model, 0, seen));
      }
      if (!section.length) continue;
      body.push(`### ${CONSEQUENCE_LABEL[consequence]}`, "", ...section);
    }
    if (!body.length) continue;
    L.push(`## ${SYSTEM_LABEL[system] || system}`, "", ...body);
  }

  if (model.failures.length) {
    L.push("## Failed while running with full access");
    L.push("");
    L.push(
      "These were attempted and did not succeed. They are not policy deferrals — " +
        "something broke, and the same script below will re-run them.",
    );
    L.push("");
    for (const rec of model.failures)
      L.push(...markdownItem(rec, model, 0, seen));
  }

  if (model.satisfied.length) {
    L.push("## Already correct");
    L.push("");
    L.push("<details><summary>");
    L.push(
      `${model.satisfied.length} action(s) were verified already in the desired state ` +
        "— nothing to do.</summary>",
    );
    L.push("");
    // Ticked and struck through, never deleted: deleting a satisfied item
    // would make the checklist lie about what the run wanted, and the item
    // count stops equalling the record count — the drift this exists to show.
    //
    // A RETAINED tick — `satisfied` carried forward past a read that produced
    // no evidence — says so explicitly. Folding it into the freshly-verified
    // wording would assert a verification that demonstrably did not happen.
    for (const rec of model.satisfied) {
      const v = rec.verification || {};
      if (v.state && v.state !== "satisfied") {
        L.push(
          `- [x] ~~${headline(rec)}~~ — ticked previously; this pass could not ` +
            `confirm (${v.detail || v.state}) — \`${rec.kind}\` (\`${rec.id}\`)`,
        );
        continue;
      }
      const observed = formatObserved(v.observed)
        ? ` — observed \`${formatObserved(v.observed)}\``
        : "";
      const when = v.at ? ` at ${v.at}` : "";
      L.push(
        `- [x] ~~${headline(rec)}~~${observed}${when} — \`${rec.kind}\` (\`${rec.id}\`)`,
      );
    }
    L.push("");
    L.push("</details>");
    L.push("");
  }

  if (model.unrecorded.length) {
    L.push("## ⚠️ UNRECORDED");
    L.push("");
    L.push(
      "These moments were expected to produce a record and did not. Treat each as " +
        "an action of unknown status — verify it by hand.",
    );
    L.push("");
    for (const kind of model.unrecorded)
      L.push(`- ⚠️ UNRECORDED — \`${kind}\``);
    L.push("");
  }

  if (model.warnings.length) {
    L.push("## Warnings");
    L.push("");
    for (const w of model.warnings) L.push(`- ${w}`);
    L.push("");
  }

  return `${L.join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()}\n`;
}

/**
 * One checklist item, with its dependants nested beneath it.
 * @param {Set<string>} seen - ids already emitted; mutated as items are added
 */
function markdownItem(rec, model, depth, seen) {
  const pad = "  ".repeat(depth);
  const L = [];
  const url = actionUrl(rec);
  seen.add(rec.id);

  L.push(`${pad}- [ ] **${headline(rec)}**`);
  // The verification pass's verdict, when one exists. `divergent` and
  // `unverifiable` render loudly and UNTICKED: the first because someone moved
  // the card somewhere neither the plan nor its starting point expected, the
  // second because on ambiguity this file does not guess.
  const vstate = verificationState(rec);
  if (vstate === "divergent") {
    const v = rec.verification || {};
    const wanted = describeDesired(rec) || "the recorded desired state";
    L.push(
      `${pad}  - ⚠️ **DIVERGENT** — observed \`${formatObserved(v.observed)}\`, wanted \`${wanted}\`` +
        (v.at ? ` (read ${v.at})` : "") +
        ". Someone moved this somewhere else — resolve by hand before applying.",
    );
  } else if (vstate === "unverifiable") {
    const v = rec.verification || {};
    L.push(
      `${pad}  - ❓ cannot verify — check by hand${v.detail ? ` (${v.detail})` : ""}`,
    );
  }
  L.push(`${pad}  - ${rec.intent}`);
  L.push(`${pad}  - Kind: \`${rec.kind}\` · id \`${rec.id}\``);
  if (url) L.push(`${pad}  - Where: ${url}`);
  if (rec.produces)
    L.push(
      `${pad}  - Yields \`${rec.produces}\` — later actions below need its value`,
    );

  const manual = rec.manual || {};
  if (manual.ui) L.push(`${pad}  - How: ${manual.ui}`);
  if (manual.deepLink && manual.deepLink !== url)
    L.push(`${pad}  - Start here: ${manual.deepLink}`);

  const fields = Array.isArray(manual.fields) ? manual.fields : [];
  for (const f of fields) {
    if (!f || !f.name) continue;
    const value = String(
      f.value === undefined || f.value === null ? "" : f.value,
    );
    if (value.includes("\n")) {
      L.push(`${pad}  - **${f.name}**:`);
      L.push("");
      L.push(`${pad}    \`\`\`text`);
      for (const line of value.split("\n")) L.push(`${pad}    ${line}`);
      L.push(`${pad}    \`\`\``);
      L.push("");
    } else {
      L.push(`${pad}  - **${f.name}**: \`${value}\``);
    }
  }

  if (rec.verify && rec.verify.cmd) {
    L.push(
      `${pad}  - Verify: \`${rec.verify.cmd}\`${
        rec.verify.expect ? ` — expect ${rec.verify.expect}` : ""
      }`,
    );
  }

  // Nest dependants so the human reads a sequence, not a pile.
  const dependants = model.outstanding.filter(
    (r) => Array.isArray(r.dependsOn) && r.dependsOn.includes(rec.id),
  );
  for (const child of dependants) {
    if (seen.has(child.id)) continue;
    L.push(...markdownItem(child, model, depth + 1, seen));
  }

  L.push("");
  return L;
}

// ---------------------------------------------------------------------------
// Renderer 2/4 — shell script (mode `command`, and half of `approve`)
// ---------------------------------------------------------------------------

/**
 * Bodies travel as base64 and reach the CLI via `--body-file`, NEVER via
 * `--body "$(cat …)"`.
 *
 * Base64 rather than a heredoc is a deliberate choice: a body may contain
 * backticks, `$(rm -rf /)`, a line equal to the heredoc terminator, CRLF, or no
 * trailing newline. A heredoc mangles at least the last two and a chosen
 * terminator can always be collided with. Base64 round-trips bytes exactly and
 * removes every quoting hazard at once. The command itself stays in plain sight
 * directly above, which is what "reviewable" actually requires.
 */
function bodyFunction(rec) {
  const stdin = rec.command && rec.command.stdin;
  if (stdin === null || stdin === undefined || stdin === "") return null;
  const b64 = Buffer.from(String(stdin), "utf8").toString("base64");
  // The preview is a COMMENT, so it is inert — but a first line of `$(rm -rf /)`
  // reads as an instruction to a human skimming the diff, and a stray backtick
  // makes the comment hard to read. Reduce it to plain text.
  const preview = String(stdin)
    .split("\n")[0]
    .replace(/[`$\\]/g, "·")
    .replace(/[^\x20-\x7e]/g, "·")
    .slice(0, 68);
  return { fn: `_body_${rec.id}`, b64, preview };
}

function renderShell(model) {
  const L = [];
  const ctx = model.context;

  L.push("#!/usr/bin/env bash");
  L.push("#");
  L.push("# Tracker actions this run could not perform.");
  L.push("#");
  L.push(
    "# DRY RUN BY DEFAULT. This script prints what it would do and changes",
  );
  L.push("# nothing. Re-run with --apply to perform the actions.");
  L.push("#");
  L.push("#   bash <this file>            # show the plan");
  L.push("#   bash <this file> --apply    # perform it");
  L.push("#");
  L.push(
    "# It contains no credential by construction — only environment variable",
  );
  L.push("# NAMES. Export those yourself before running with --apply.");
  L.push("#");
  if (ctx.run) L.push(`# Run:         ${shComment(ctx.run)}`);
  if (ctx.access) L.push(`# Access mode: ${shComment(ctx.access)}`);
  L.push(`# Outstanding: ${model.counts.outstanding}`);
  L.push("");
  L.push("set -euo pipefail");
  L.push("");
  // Emitted as a function rather than `sed -n "2,18p" "$0"`: the header length
  // varies with which context fields are present and with the blank-line
  // collapse applied afterwards, so a fixed range printed `set -euo pipefail`
  // as if it were help text.
  L.push("usage() {");
  L.push("  cat <<'HANDOVER_USAGE'");
  L.push("Tracker actions this run could not perform.");
  L.push("");
  L.push(
    "  bash <this file>            show the plan (default — changes nothing)",
  );
  L.push("  bash <this file> --apply    perform it");
  L.push(
    "  bash <this file> --apply --all    include DIVERGENT actions (see warnings)",
  );
  L.push("");
  L.push(
    "Contains no credential — only environment variable NAMES. Export those",
  );
  L.push("yourself before running with --apply.");
  L.push("HANDOVER_USAGE");
  L.push("}");
  L.push("");
  L.push("APPLY=0");
  L.push("ALL=0");
  L.push('for arg in "$@"; do');
  L.push('  case "$arg" in');
  L.push("    --apply) APPLY=1 ;;");
  L.push("    --all) ALL=1 ;;");
  L.push("    -h|--help) usage; exit 0 ;;");
  L.push('    *) echo "unknown argument: $arg" >&2; exit 2 ;;');
  L.push("  esac");
  L.push("done");
  L.push("");
  L.push('WORKDIR="$(mktemp -d)"');
  L.push("trap 'rm -rf \"$WORKDIR\"' EXIT");
  L.push("");
  L.push("run_step() {");
  L.push("  # $1 = id, $2 = description; remaining args = the command");
  L.push('  local id="$1"; shift');
  L.push('  local desc="$1"; shift');
  L.push('  if [ "$APPLY" -eq 1 ]; then');
  L.push('    echo "▶  [$id] $desc"');
  L.push('    "$@"');
  L.push("  else");
  L.push('    echo "·  [$id] $desc"');
  L.push("    printf '     '; printf '%q ' \"$@\"; printf '\\n'");
  L.push("  fi");
  L.push("}");
  L.push("");
  L.push("confirm_step() {");
  L.push("  # Irreversible actions never run from a bare invocation.");
  L.push('  local id="$1"; shift');
  L.push('  local desc="$1"; shift');
  L.push('  if [ "$APPLY" -ne 1 ]; then');
  L.push('    echo "·  [$id] IRREVERSIBLE — $desc"');
  L.push("    printf '     '; printf '%q ' \"$@\"; printf '\\n'");
  L.push("    return 0");
  L.push("  fi");
  L.push('  echo "⚠️  [$id] IRREVERSIBLE — $desc"');
  L.push("  printf '    '; printf '%q ' \"$@\"; printf '\\n'");
  // No controlling tty (CI, a pipe, nohup) must SKIP this action, not kill the
  // script. Under `set -euo pipefail` a bare `read … < /dev/tty` exits non-zero
  // when /dev/tty cannot be opened, so an --apply run in CI used to stop at the
  // first irreversible action and silently skip everything after it.
  L.push("  if [ ! -e /dev/tty ]; then");
  L.push(
    '    echo "    no tty — skipped (re-run interactively to perform this)."',
  );
  L.push("    return 0");
  L.push("  fi");
  L.push(
    '  if ! read -r -p "    Perform this? [y/N] " _reply < /dev/tty; then',
  );
  L.push('    echo "    could not read a reply — skipped."');
  L.push("    return 0");
  L.push("  fi");
  L.push('  case "$_reply" in');
  L.push('    [yY]|[yY][eE][sS]) "$@" ;;');
  L.push('    *) echo "    skipped." ;;');
  L.push("  esac");
  L.push("}");
  L.push("");
  L.push("divergent_step() {");
  L.push("  # The verification pass saw a value that is neither the desired");
  L.push("  # state nor where the card started. Applying the recorded command");
  L.push(
    "  # anyway could drag it BACKWARDS off a state a human chose. Skipped",
  );
  L.push("  # with a warning unless --all is given.");
  L.push("  #");
  L.push("  # The guards COMPOSE: --all lifts only the divergence skip. An");
  L.push(
    '  # irreversible action still goes through confirm_step — "$3" names',
  );
  L.push("  # the inner helper — so --all never becomes a consent bypass.");
  L.push('  local id="$1"; shift');
  L.push('  local desc="$1"; shift');
  L.push('  local helper="$1"; shift');
  L.push('  if [ "$ALL" -ne 1 ]; then');
  L.push(
    '    echo "⚠️  [$id] DIVERGENT — skipped (re-run with --all to force): $desc" >&2',
  );
  L.push("    return 0");
  L.push("  fi");
  L.push('  "$helper" "$id" "$desc" "$@"');
  L.push("}");
  L.push("");

  const runnable = model.outstanding.concat(model.failures);

  // Body payloads first, so the command lines below read uninterrupted.
  const bodies = runnable.map(bodyFunction).filter(Boolean);
  if (bodies.length) {
    L.push(
      "# ── Bodies ──────────────────────────────────────────────────────────",
    );
    L.push(
      "# Base64 so that backticks, $(…), heredoc terminators, CRLF and a missing",
    );
    L.push(
      "# trailing newline all round-trip byte-exactly. Decoded to a file and",
    );
    L.push(
      "# passed with --body-file; never interpolated into a command line.",
    );
    L.push("");
    for (const b of bodies) {
      L.push(`# ${shComment(b.preview)}…`);
      L.push(`${b.fn}() {`);
      L.push(`  printf %s ${shQuote(b.b64)} | base64 -d > "$WORKDIR/${b.fn}"`);
      L.push("}");
      L.push("");
    }
  }

  // Satisfied actions are SHORT-CIRCUITED, and visibly so — a silent absence
  // from the script is indistinguishable from "never wanted".
  if (model.satisfied.length) {
    L.push(
      "# ── Already satisfied — short-circuited ────────────────────────────",
    );
    for (const rec of model.satisfied) {
      const v = rec.verification || {};
      L.push(
        `# [${rec.id}] ✅ already satisfied — ${shComment(headline(rec))}` +
          (v.at ? ` (verified ${shComment(v.at)})` : ""),
      );
    }
    L.push("");
  }

  if (!runnable.length) {
    L.push('echo "✅ Nothing outstanding."');
    L.push("");
  }

  for (const [system, recs] of groupBySystem(runnable)) {
    L.push(
      `# ══ ${SYSTEM_LABEL[system] || system} ${"═".repeat(Math.max(0, 60 - (SYSTEM_LABEL[system] || system).length))}`,
    );
    L.push("");
    for (const rec of recs) L.push(...shellStep(rec));
  }

  if (model.unrecorded.length) {
    L.push(
      "# ── ⚠️ UNRECORDED ───────────────────────────────────────────────────",
    );
    L.push("# Expected to produce a record and did not. Verify each by hand.");
    for (const kind of model.unrecorded) {
      L.push(`echo ${shQuote(`⚠️  UNRECORDED — ${kind}`)} >&2`);
    }
    L.push("");
  }

  L.push('if [ "$APPLY" -ne 1 ]; then');
  L.push('  echo ""');
  L.push(
    '  echo "Dry run — nothing was changed. Re-run with --apply to perform these."',
  );
  L.push("fi");
  return `${L.join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()}\n`;
}

function shellStep(rec) {
  const L = [];
  const cmd = rec.command || {};
  const argv = Array.isArray(cmd.argv) ? cmd.argv : [];
  // Single-quoted, never hand-escaped into a double-quoted word. Escaping only
  // `"` left backticks and $(…) live: a target label of `` `touch /tmp/x` ``
  // executed during the DRY RUN. Column names come from the consumer's
  // tracker-workflow.yaml and --issue is an unvalidated free string, so neither
  // end of this is trusted input.
  const desc = shQuote(headline(rec));

  const vstate = verificationState(rec);

  L.push(`# [${rec.id}] ${shComment(rec.intent)}`);
  L.push(`#   kind: ${rec.kind}  ·  consequence: ${rec.consequence}`);
  if (vstate === "divergent") {
    const v = rec.verification || {};
    L.push(
      `#   ⚠️ DIVERGENT: observed ${shComment(formatObserved(v.observed))} — guarded behind --all`,
    );
  } else if (vstate === "unverifiable") {
    const v = rec.verification || {};
    L.push(
      `#   ❓ unverifiable — could not confirm current state${
        v.detail ? `: ${shComment(v.detail)}` : ""
      }; runs unguarded`,
    );
  }
  if (rec.retry_of)
    L.push(
      `#   retry of: ${shComment(rec.retry_of)} (failed under full access)`,
    );
  if (Array.isArray(rec.dependsOn) && rec.dependsOn.length)
    L.push(`#   after: ${rec.dependsOn.join(", ")}`);
  if (rec.produces) L.push(`#   yields: ${rec.produces}`);

  if (!argv.length) {
    // Some kinds are genuinely UI-only. Say so rather than emitting nothing —
    // a silent gap in the script is indistinguishable from "already handled".
    const url = actionUrl(rec);
    L.push(
      `echo ${shQuote(
        `✋ [${rec.id}] No command form — do this by hand: ${headline(rec)}${
          url ? ` (${url})` : ""
        }`,
      )} >&2`,
    );
    L.push("");
    return L;
  }

  const body = bodyFunction(rec);
  if (body) L.push(`${body.fn}`);

  const finalArgv = argv.map((a) =>
    body && a === "-" ? `$WORKDIR/${body.fn}` : a,
  );
  // `--body-file -` means "read the body from stdin"; with a decoded file on
  // disk we can hand over the path instead, which keeps the command a single
  // exec with no pipeline to misquote.
  const quoted = finalArgv
    .map((a) =>
      body && a === `$WORKDIR/${body.fn}`
        ? `"$WORKDIR/${body.fn}"`
        : shQuote(a),
    )
    .join(" ");

  // Guard precedence: a divergent read outranks the consequence class — the
  // command was planned against a board state that no longer holds, so even a
  // reversible action must not run without --all. The guards COMPOSE rather
  // than replace each other: a divergent step names its inner helper, so an
  // irreversible action stays behind confirm_step even under --all.
  const inner =
    rec.consequence === "irreversible" ? "confirm_step" : "run_step";
  if (vstate === "divergent") {
    L.push(`divergent_step ${shQuote(rec.id)} ${desc} ${inner} ${quoted}`);
  } else {
    L.push(`${inner} ${shQuote(rec.id)} ${desc} ${quoted}`);
  }

  if (rec.verify && rec.verify.cmd) {
    L.push(
      `#   verify: ${shComment(rec.verify.cmd)}${
        rec.verify.expect ? ` → ${shComment(rec.verify.expect)}` : ""
      }`,
    );
  }
  L.push("");
  return L;
}

// ---------------------------------------------------------------------------
// Renderer 3/4 — JSON sidecar (mode `read-only`; task.57's input)
// ---------------------------------------------------------------------------

function renderJson(model) {
  const payload = {
    v: model.v,
    generator: "handover-render.js",
    context: model.context,
    counts: model.counts,
    // Sorted, deduplicated and topologically ordered — a consumer never has to
    // repeat that work, and cannot repeat it differently.
    records: model.all,
    outstanding: model.outstanding.map((r) => r.id),
    satisfied: model.satisfied.map((r) => r.id),
    failures: model.failures.map((r) => r.id),
    pending: model.pending.map((r) => r.id),
    divergent: model.divergent.map((r) => r.id),
    unverifiable: model.unverifiable.map((r) => r.id),
    unrecorded: model.unrecorded,
    warnings: model.warnings,
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

// ---------------------------------------------------------------------------
// Renderer 4/4 — inline run-end summary
// ---------------------------------------------------------------------------

function renderSummary(model) {
  const L = [];
  const c = model.counts;

  L.push("## Tracker Actions Required");
  L.push("");

  if (c.total === 0 && c.unrecorded === 0) {
    L.push("_None — every tracker mutation this run wanted was performed._");
    L.push("");
    return `${L.join("\n").trimEnd()}\n`;
  }

  const bits = [`${c.outstanding} outstanding`];
  if (c.blocking) bits.push(`**${c.blocking} BLOCKING**`);
  if (c.divergent) bits.push(`**${c.divergent} divergent**`);
  if (c.unverifiable) bits.push(`${c.unverifiable} unverifiable`);
  if (c.failures) bits.push(`${c.failures} failed`);
  if (c.satisfied) bits.push(`${c.satisfied} already correct`);
  if (c.unrecorded) bits.push(`${c.unrecorded} unrecorded`);
  L.push(
    `${c.blocking > 0 ? "🚫" : c.outstanding + c.failures > 0 ? "⚠️" : "✅"} ${bits.join(" · ")}${
      model.context.access ? ` (access: \`${model.context.access}\`)` : ""
    }`,
  );
  L.push("");

  // The summary's twin of the markdown banner. This block is what a reader of
  // the implementation report sees without opening the checklist, so it must
  // carry the convergence instruction too — not merely a count. A number alone
  // reads as "some things are pending", which is exactly the reading that leads
  // to a second no-op run and a bug report.
  if (model.blocking.length) {
    L.push(
      "**🚫 Blocking — the run cannot converge until these are done by hand.** " +
        "Perform each one, write the value it produces into the document's frontmatter, " +
        "then re-run. Re-running without writing the value changes nothing.",
    );
    for (const rec of model.blocking) {
      L.push(
        `- 🚫 ${headline(rec)}` +
          (rec.produces ? ` → yields \`${rec.produces}\`` : "") +
          ` \`${rec.id}\``,
      );
    }
    L.push("");
  }

  for (const [system, recs] of model.bySystem) {
    L.push(`**${SYSTEM_LABEL[system] || system}**`);
    for (const rec of recs) {
      const url = actionUrl(rec);
      const vstate = verificationState(rec);
      const mark =
        vstate === "divergent"
          ? "⚠️"
          : vstate === "unverifiable"
            ? "❓"
            : rec.consequence === "irreversible"
              ? "🛑"
              : "▫️";
      const note =
        vstate === "divergent"
          ? ` — DIVERGENT: observed \`${formatObserved((rec.verification || {}).observed)}\`, wanted \`${describeDesired(rec)}\``
          : vstate === "unverifiable"
            ? " — cannot verify, check by hand"
            : "";
      L.push(
        `- ${mark} ${headline(rec)}${note}${url ? ` — ${url}` : ""} \`${rec.id}\``,
      );
    }
    L.push("");
  }

  if (model.failures.length) {
    L.push("**Failed under full access**");
    for (const rec of model.failures) {
      L.push(`- ❌ ${headline(rec)} \`${rec.id}\``);
    }
    L.push("");
  }

  if (model.satisfied.length) {
    L.push(
      `_${model.satisfied.length} action(s) already correct — collapsed._`,
    );
    L.push("");
  }

  if (model.unrecorded.length) {
    for (const kind of model.unrecorded) {
      L.push(`- ⚠️ UNRECORDED — \`${kind}\``);
    }
    L.push("");
  }

  return `${L.join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()}\n`;
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

const RENDERERS = Object.freeze({
  md: renderMarkdown,
  sh: renderShell,
  json: renderJson,
  summary: renderSummary,
});

/**
 * Which renderers a mode selects (tracker-access-record.md §"Two axes").
 * A mode is a selection over renderers, never a renderer itself.
 *
 * `approve` is the one mode whose selection depends on the terminal: its whole
 * point is a batched confirmation prompt at handover, and a prompt needs a
 * human on a tty. WITHOUT one (CI, a pipe, nohup) it DEGRADES TO `command` —
 * the operator gets the script and runs it themselves. It never assumes
 * consent: no tty, no prompt, no execution.
 *
 * @param {"full"|"read-only"|"approve"|"command"|"manual"} mode
 * @param {{tty?: boolean}} [opts] - default: process.stdout.isTTY
 */
function renderersForMode(mode, opts = {}) {
  const tty =
    opts.tty !== undefined
      ? !!opts.tty
      : !!(process.stdout && process.stdout.isTTY);
  switch (mode) {
    case "full":
      // Nothing is deferred by policy; a record here means something FAILED.
      return ["summary"];
    case "read-only":
      return ["json", "summary"];
    case "approve":
      return tty ? ["md", "sh", "summary"] : ["sh", "summary"];
    case "command":
      return ["sh", "summary"];
    case "manual":
      return ["md", "summary"];
    default:
      throw new Error(
        `handover-render: unknown access mode "${mode}". ` +
          `Known: full, read-only, approve, command, manual.`,
      );
  }
}

/**
 * Render a record list in one format. Pure — no filesystem, no clock.
 *
 * @param {object[]} records
 * @param {"md"|"sh"|"json"|"summary"} format
 * @param {object} [ctx]
 */
function render(records, format, ctx = {}) {
  const fn = RENDERERS[format];
  if (!fn) {
    throw new Error(
      `handover-render: unknown format "${format}". Known: ${FORMATS.join(", ")}`,
    );
  }
  // Re-redact on the way out. The writer already did this; doing it again here
  // is deliberate defence in depth, because these two artifacts get COMMITTED
  // and a journal may have been hand-edited between write and render.
  const envTable = dm.buildEnvTable(ctx.env || process.env);
  const safe = (records || []).map((r) => dm.redactDeep(r, envTable));
  return fn(buildModel(safe, ctx));
}

/** True when the record list produces no artifact worth writing. */
function isEmpty(model) {
  return (
    model.counts.total === 0 &&
    model.counts.unrecorded === 0 &&
    model.warnings.length === 0
  );
}

const USAGE = `Usage: handover-render --journal <path> --format <${FORMATS.join("|")}> [--out <path>]

Renders a deferred-mutation journal (see tracker-access-record.md).

  --journal <path>   NDJSON journal (default: $TRACKER_ACTIONS_JOURNAL, else
                     .claude/state/tracker-actions.jsonl)
  --format <f>       ${FORMATS.join(" | ")}   (repeatable: --format md --format sh)
  --out <path>       write here instead of stdout. The {md,sh,json} extension is
                     substituted per file format — single-format renders included —
                     so the artifact always lands on its own extension.
  --expected <k,…>   kinds this run was expected to record; any missing one
                     renders as ⚠️ UNRECORDED
  --run <r>  --access <mode>  --work-item <path>    context for the header
  --verify           run the read-only verification pass (handover-verify.js)
                     over the records first, so ticks / divergence / baselines
                     reach the rendered artifacts. Reads only; a failed or
                     ambiguous read renders unverifiable — it never CREATES a
                     tick, though a tick backed by earlier positive evidence
                     is retained (and labelled "could not confirm").
  --quiet            suppress the per-file confirmation line
  -h, --help

An EMPTY journal writes nothing and creates no file — an empty artifact committed
into a work-item directory is worse than no artifact.`;

function parseArgs(argv) {
  const args = { formats: [], expected: [] };
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
      case "--quiet":
        args.quiet = true;
        break;
      case "--verify":
        args.verify = true;
        break;
      case "--journal":
        args.journal = need(i, a);
        i++;
        break;
      case "--format":
        args.formats.push(need(i, a));
        i++;
        break;
      case "--out":
        args.out = need(i, a);
        i++;
        break;
      case "--expected":
        args.expected = need(i, a)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        i++;
        break;
      case "--run":
        args.run = need(i, a);
        i++;
        break;
      case "--access":
        args.access = need(i, a);
        i++;
        break;
      case "--work-item":
        args.workItem = need(i, a);
        i++;
        break;
      default:
        throw new Error(`unknown flag "${a}"`);
    }
  }
  return args;
}

function run(opts = {}) {
  const { argv = process.argv, env = process.env, cwd = process.cwd() } = opts;
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

  const formats = args.formats.length ? args.formats : ["summary"];
  for (const f of formats) {
    if (!FORMATS.includes(f)) {
      console.error(
        `Error: unknown format "${f}". Known: ${FORMATS.join(", ")}`,
      );
      return { exitCode: 2 };
    }
  }

  const file = dm.journalPath({ journal: args.journal, env, cwd });
  const { records, warnings } = dm.readJournal(file, {
    onWarn: (m) => console.error(`⚠️  ${file}: ${m}`),
  });

  // --verify runs the read-only verification pass in-process so its
  // annotations actually reach the render — piping the verify CLI's stdout to
  // /dev/null and then rendering from the raw journal was a guaranteed no-op.
  // Async only on this path: run() stays synchronous for every existing
  // caller; with --verify it returns a Promise (the CLI entry point handles
  // both). `opts.verifyIo` lets tests inject a stubbed read layer.
  if (args.verify) {
    const hv = require("./handover-verify.js");
    const io = opts.verifyIo || hv.makeIo({ env });
    // The catch is attached to the VERIFY promise only: a render failure must
    // propagate as a render failure, not be misreported as a verification
    // failure and trigger a second, unannotated render over files the first
    // attempt already wrote.
    return hv
      .verifyRecords(records, { io })
      .then(
        ({ records: annotated }) => annotated,
        (e) => {
          console.error(
            `⚠️  verification pass failed (${e.message}) — rendering unannotated`,
          );
          return records;
        },
      )
      .then((recs) =>
        renderFromRecords(recs, { args, formats, env, warnings }),
      );
  }

  return renderFromRecords(records, { args, formats, env, warnings });
}

/** The synchronous core shared by the plain and --verify paths. */
function renderFromRecords(records, { args, formats, env, warnings }) {
  const ctx = {
    expected: args.expected,
    run: args.run,
    access: args.access || env.ACCESS_TRACKER,
    workItem: args.workItem,
    warnings,
    env,
  };

  let model;
  try {
    const envTable = dm.buildEnvTable(env);
    model = buildModel(
      records.map((r) => dm.redactDeep(r, envTable)),
      ctx,
    );
  } catch (e) {
    console.error(`Error: ${e.message}`);
    return { exitCode: 2 };
  }

  // An empty journal writes nothing. Committing an empty checklist into a
  // work-item directory tells a reviewer "nothing was deferred" in the same
  // shape it would tell them "the renderer broke".
  if (isEmpty(model)) {
    if (!args.quiet)
      console.error("ℹ️  Journal is empty — no artifact written.");
    return { exitCode: 0, written: [], empty: true };
  }

  const written = [];
  for (const format of formats) {
    let text;
    try {
      text = RENDERERS[format](model);
    } catch (e) {
      console.error(`Error rendering ${format}: ${e.message}`);
      return { exitCode: 2 };
    }
    if (!args.out) {
      process.stdout.write(text);
      continue;
    }
    // Strip only a KNOWN extension. A blanket /\.[^./]+$/ ate the `{name}`
    // component of `task.52.handover.1.deferred-mutation`, which file-naming.md
    // requires, turning it into `task.52.handover.1.md`.
    //
    // The extension is substituted for EVERY file format, single-format renders
    // included: a lone `--format sh` with `--out …md` used to write the shell
    // script into a .md filename, and a lone `--format json` buried the sidecar
    // where tracker-reconcile\'s *.handover.*.json discovery never finds it.
    // `summary` keeps the caller\'s path verbatim when it is the only format.
    const outPath =
      format === "summary" && formats.length === 1
        ? args.out
        : `${args.out.replace(/\.(md|sh|json)$/, "")}.${format}`;
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, text, "utf8");
    // 0644 even for the script: reviewable, committable, and not runnable by a
    // stray double-click.
    fs.chmodSync(outPath, SCRIPT_MODE);
    written.push(outPath);
    if (!args.quiet) console.error(`✅ wrote ${outPath}`);
  }

  return { exitCode: 0, written, counts: model.counts };
}

if (require.main === module) {
  Promise.resolve(run()).then(
    (r) => process.exit(r.exitCode || 0),
    (e) => {
      console.error(`Error: ${e.message}`);
      process.exit(2);
    },
  );
}

module.exports = {
  FORMATS,
  SCRIPT_MODE,
  KIND_PRESENTATION,
  CONSEQUENCE_ORDER,
  presentationFor,
  dedupe,
  topoSort,
  partition,
  verificationState,
  renderersForMode,
  groupBySystem,
  buildModel,
  isEmpty,
  shQuote,
  shComment,
  formatObserved,
  headline,
  renderMarkdown,
  renderShell,
  renderJson,
  renderSummary,
  RENDERERS,
  render,
  parseArgs,
  run,
  USAGE,
};
