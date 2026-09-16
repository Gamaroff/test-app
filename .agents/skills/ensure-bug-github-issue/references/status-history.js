// AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/status-history.js. Regenerate via `npm run bundle`.
"use strict";

// ---------------------------------------------------------------------------
// status-history.js — the bug document's Status History, read and written
// ---------------------------------------------------------------------------
// The bug-type counterpart of change-log.js. Bug reports are barred from
// carrying a `## Change Log` — the exclusion is stated in three places
// (docs/standards/bug-documents.md, document-change-log.md §Exclusions, and
// develop-bug's own step docs) and the reason is that `## Status History` is
// already the bug-type equivalent and is richer: it carries a `Status` column,
// which is what a bug's history is actually about.
//
// Until now that table was written only by prose — every skill that touched a
// bug's history hand-authored a markdown row. `change-log.js` has no `bug`
// anchor, so a writer reaching for `upsertChangeLog(content, e, {docType:"bug"})`
// gets `ANCHORS["bug"] === undefined` and silently appends a *Change Log* to the
// end of the file: the one table the standard forbids, added by the code meant
// to respect it. This module exists so that mistake has an alternative.
//
// Pure and tracker-agnostic: string in, string out. No I/O, no network, no dates
// invented — every caller passes the date it wants recorded.
//
// Fence guarding is delegated to change-log.js rather than reimplemented. The
// hazard is identical and already solved there: a `## Status History` inside a
// ``` fence is a PICTURE of the table, not the table, and this repo's own
// documentation about bug reports is full of both.

const CL = require("./change-log.js");

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

// H2 or H3, with optional section numbering — the same tolerance change-log.js
// grants the Change Log, for the same reason: templates in the wild number their
// sections and readers hand-demote headings.
const RE_HEADING = /^(#{2,3})[ \t]+(?:\d+\.?[ \t]+)?Status History[ \t]*$/m;

const COLUMNS = ["Date", "Status", "Changed By", "Notes"];
const HEADER_ROW = `| ${COLUMNS.join(" | ")} |`;
const SEPARATOR_ROW = `| ${COLUMNS.map(() => "---").join(" | ")} |`;

// A data row opens with a date. Both `YYYY-MM-DD` (what the bug template emits)
// and `YYYY-MM-DD HH:MM` are accepted on read; writes use the bare date, matching
// bug-report-template.md.
const RE_ENTRY_ROW = /^\|\s*\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?\s*\|/;

/** Is this line a Status History data row (as opposed to header or separator)? */
function isEntryRow(line) {
  return RE_ENTRY_ROW.test(String(line).trim());
}

// A cell must not break the table. Pipes are escaped and newlines flattened;
// nothing else is touched, because a bug's notes legitimately carry backticks,
// brackets and parentheses.
function cell(value) {
  return String(value == null ? "" : value)
    .replace(/\r?\n/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
}

/** One entry → one markdown row. */
function fmtEntry({ date = "", status = "", changedBy = "", notes = "" } = {}) {
  return `| ${cell(date)} | ${cell(status)} | ${cell(changedBy)} | ${cell(notes)} |`;
}

/** A complete section, heading included, at the requested level. */
function buildStatusHistoryBlock(rows, level = 2) {
  return [
    `${"#".repeat(level)} Status History`,
    "",
    HEADER_ROW,
    SEPARATOR_ROW,
    ...rows,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Locate the document's Status History section.
 *
 * Scoped past frontmatter and filtered through change-log.js's protected ranges,
 * so a heading inside a fence or an inline code span is skipped. The block ends
 * at the next heading of the SAME OR SHALLOWER level — and that end-scan is
 * filtered through the same ranges as the start-scan, because guarding only one
 * end of a block guards neither.
 *
 * Returns `{ start, end, level }` or `null`.
 */
function findStatusHistory(content) {
  const ranges = CL.protectedRanges(content);
  let searchFrom = CL.bodyStart(content);

  for (;;) {
    const scope = content.slice(searchFrom);
    const m = scope.match(RE_HEADING);
    if (!m) return null;

    const start = searchFrom + m.index;
    if (CL.insideProtected(ranges, start)) {
      searchFrom = start + m[0].length;
      continue;
    }

    const level = m[1].length;
    const bodyOffset = start + m[0].length;
    const after = content.slice(bodyOffset);
    const nextRe = new RegExp(`^#{1,${level}}[ \\t]`, "gm");
    let end = content.length;
    for (const nm of after.matchAll(nextRe)) {
      const abs = bodyOffset + nm.index;
      if (CL.insideProtected(ranges, abs)) continue;
      end = abs;
      break;
    }

    return { start, end, level };
  }
}

/** Entry rows currently recorded in the document, in document order. */
function extractEntries(content) {
  const found = findStatusHistory(content);
  if (!found) return [];
  return content.slice(found.start, found.end).split("\n").filter(isEntryRow);
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

// Where a brand-new section goes. `## Status History` is section 7 of the bug
// template's 8, immediately before `## Resolution Summary` — so that heading is
// the anchor, and a document that lacks it falls through to EOF.
//
// NEVER "before the first `##`". That is how a Change Log once ended up above an
// Epic Goal; a section inserted at the top of a bug report would land above the
// Bug Description.
const ANCHOR = /^#{2,3}[ \t]+(?:\d+\.?[ \t]+)?Resolution Summary\b/m;

/**
 * Append an entry to the document's Status History, creating the section if absent.
 *
 * @param {string} content   full document text
 * @param {object} entry     { date, status, changedBy, notes }
 * @returns {string}         the updated document
 */
function upsertStatusHistory(content, entry) {
  const newRow = fmtEntry(entry);
  const found = findStatusHistory(content);

  if (found) {
    const block = content.slice(found.start, found.end);
    const lines = block.split("\n");

    // Insert after the last existing data row, so history stays in the order it
    // happened — newest at the bottom, matching the Change Log convention.
    let insertAt = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (isEntryRow(lines[i]) || /^\|\s*-{3,}/.test(lines[i].trim())) {
        insertAt = i + 1;
        break;
      }
    }

    if (insertAt === -1) {
      // Heading present but no table under it — a stub. Lay one down.
      const rebuilt = buildStatusHistoryBlock([newRow], found.level);
      const trailing = block.match(/\n*$/)[0];
      return (
        content.slice(0, found.start) +
        rebuilt +
        trailing +
        content.slice(found.end)
      );
    }

    lines.splice(insertAt, 0, newRow);
    return (
      content.slice(0, found.start) +
      lines.join("\n") +
      content.slice(found.end)
    );
  }

  const block = buildStatusHistoryBlock([newRow], 2);
  const anchor = content.match(ANCHOR);
  if (anchor) {
    const idx = content.indexOf(anchor[0]);
    return content.slice(0, idx) + block + "\n\n" + content.slice(idx);
  }
  return content.trimEnd() + "\n\n" + block + "\n";
}

// ---------------------------------------------------------------------------
// CLI — for the prose-only skills (the GitHub sync path) that cannot require()
// ---------------------------------------------------------------------------
function main(argv) {
  const args = argv.slice(2);
  const opts = { file: "", date: "", status: "", changedBy: "", notes: "" };
  const map = {
    "--file": "file",
    "--date": "date",
    "--status": "status",
    "--changed-by": "changedBy",
    "--notes": "notes",
  };
  for (let i = 0; i < args.length; i++) {
    const key = map[args[i]];
    if (key) opts[key] = args[++i];
    else if (args[i].startsWith("-")) {
      process.stderr.write(`Unknown option: ${args[i]}\n`);
      return 1;
    }
  }
  if (!opts.file) {
    process.stderr.write(
      "Usage: status-history.js --file <bug.md> --date <YYYY-MM-DD> --status <s> --changed-by <who> --notes <text>\n",
    );
    return 1;
  }
  const fs = require("fs");
  const before = fs.readFileSync(opts.file, "utf-8");
  const after = upsertStatusHistory(before, opts);
  if (after !== before) fs.writeFileSync(opts.file, after, "utf-8");
  process.stdout.write(after === before ? "unchanged\n" : "updated\n");
  return 0;
}

// `process.exitCode` and return, NEVER `process.exit()`.
//
// `process.exit()` tears the process down without waiting for a pending stdout
// write to drain, which truncates the output at the pipe buffer (~64KB) the
// moment a caller pipes this CLI instead of redirecting it to a file
// (bug.3.stdout-truncation-on-exit). A bug document's JSON description is well
// within reach of that.
if (require.main === module) {
  process.exitCode = main(process.argv);
} else {
  module.exports = {
    RE_HEADING,
    RE_ENTRY_ROW,
    COLUMNS,
    HEADER_ROW,
    SEPARATOR_ROW,
    ANCHOR,
    isEntryRow,
    fmtEntry,
    buildStatusHistoryBlock,
    findStatusHistory,
    extractEntries,
    upsertStatusHistory,
  };
}
