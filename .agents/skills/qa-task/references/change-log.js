// AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/change-log.js. Regenerate via `npm run bundle`.
"use strict";

// ---------------------------------------------------------------------------
// change-log.js — the document Change Log, read and written
// ---------------------------------------------------------------------------
// Canonical spec: document-change-log.md. This module is the only implementation
// of it; every skill that records a moment on a PRD, epic, story, or task goes
// through here rather than building a table itself.
//
// Extracted from jira-sync.js, where it lived as ~105 tracker-specific lines and
// had three defects that a shared module makes structurally hard to reintroduce:
//
//   1. H2-only heading match.   `/^## Change Log/m` cannot see the `### Change Log`
//                               that the epic and story templates actually emit, so
//                               the "update in place" branch never fired and the
//                               fallback inserted a SECOND block at the top of the
//                               body — above the Epic Goal. Now H2/H3 with optional
//                               section numbering, and the level found is preserved.
//   2. End-of-block overrun.    The old end-scan looked only for `/^## /m`, so an H3
//                               log ran to the next H2 and swallowed its sibling
//                               subsections. Now the scan ends at the next heading of
//                               the SAME OR SHALLOWER level — and is filtered through
//                               the same protected ranges as the start-scan, because
//                               guarding only one end of a block guards neither.
//   3. Top-of-body fallback.    "Insert before the first `##`" is how a Change Log
//                               ended up above the Epic Goal. Now a doc-type anchor,
//                               falling back to EOF — never to the top.
//
// And one guard that is new here rather than inherited:
//
//   4. Examples, not sections.  A marker pair or heading inside a ``` / ~~~ fence, or
//                               inside an inline code span, is a PICTURE of a Change
//                               Log rather than one. Documentation about this module
//                               is necessarily full of both — the spec beside this
//                               file, and the task documents that specified the
//                               engine (eleven fenced headings, two complete fenced
//                               marker pairs, and a checklist bullet naming both
//                               markers in backticks). Unguarded, running the engine
//                               over its own specification appends live rows into a
//                               code fence, "migrates" an illustrative row into real
//                               history, and overwrites the checklist bullet.
//
// Pure and tracker-agnostic: string in, string out. No I/O, no network, no dates
// invented — every caller passes the date it wants recorded.

// ---------------------------------------------------------------------------
// Markers
// ---------------------------------------------------------------------------
const CL_START = "<!-- change-log-start -->";
const CL_END = "<!-- change-log-end -->";

// Superseded pairs. Read and migrated in place; never written. A document synced
// to both trackers grew one of each, independently maintained — on first write
// through this engine they collapse into a single block.
const LEGACY_MARKER_PAIRS = [
  {
    start: "<!-- jira-sync-changelog-start -->",
    end: "<!-- jira-sync-changelog-end -->",
    author: "sync-jira",
  },
  {
    start: "<!-- github-sync-changelog-start -->",
    end: "<!-- github-sync-changelog-end -->",
    author: "sync-github",
  },
];

// H2 or H3, optional section numbering ("### 1.5 Change Log", "## 12. Change Log").
// The numbering tolerance mirrors `sectionRe` in jira-sync.js, which learned it
// after a task card published an empty body because "## 1. Overview" did not match
// "## Overview". `Change Log` must be the ENTIRE heading text after the numbering —
// otherwise "## Change Log Format" would match.
const RE_HEADING =
  /^(#{2,3})[ \t]+(?:\d+(?:\.\d+)*[.)]?[ \t]+)?Change Log[ \t]*$/m;

// Anchored on a leading YYYY-MM-DD date cell, with the legacy HH:MM suffix accepted
// so migration can read old rows. Deliberately strict: an unrelated four-column body
// table must not be absorbed into the log, and a dropped row loses history — which is
// the one thing this whole module exists to preserve.
const RE_ENTRY_ROW = /^\|\s*\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2})?\s*\|/;

const isEntryRow = (line) => RE_ENTRY_ROW.test(line);

// ---------------------------------------------------------------------------
// Scope guards — frontmatter and fenced code
// ---------------------------------------------------------------------------

// Index of the first character AFTER the YAML frontmatter block, or 0 when there
// is none. Every heading search below starts here.
//
// Without it, `/^## /m` matches inside frontmatter: a value that quotes a heading
// name — a `description:` block scalar mentioning `## Change Log`, say — becomes
// the insertion point, and the changelog is written INTO the YAML. The document
// still parses, so nothing errors and nothing warns; the changelog silently
// becomes part of a field's value and is published to the tracker as such.
function bodyStart(content) {
  if (!content.startsWith("---")) return 0;
  const close = content.indexOf("\n---", 3);
  if (close === -1) return 0;
  const nl = content.indexOf("\n", close + 1);
  return nl === -1 ? content.length : nl + 1;
}

// Character ranges covered by fenced code blocks, as [start, end) pairs.
//
// Fence rules that matter here (CommonMark): a fence opens with 3+ backticks or
// 3+ tildes and closes only with a fence of the SAME character that is AT LEAST
// as long. That is why the opening length is recorded — a ``` inside a ~~~~ block,
// or inside a longer ```` block, does not close it. An unclosed fence runs to EOF,
// which is the safe reading: text after a stray fence is treated as example, not
// as a section to write into.
function fencedRanges(content) {
  const ranges = [];
  const lines = content.split("\n");
  let offset = 0;
  let open = null; // { char, len, start }

  for (const line of lines) {
    const lineLen = line.length + 1; // +1 for the newline consumed by split
    // Up to 3 leading spaces are allowed before a fence; 4+ makes it an indented
    // code block, which has no fence to match.
    const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);

    if (m) {
      const char = m[1][0];
      const len = m[1].length;
      if (!open) {
        // An opening fence's info string may not contain a backtick.
        if (!(char === "`" && m[2].includes("`"))) {
          open = { char, len, start: offset };
        }
      } else if (char === open.char && len >= open.len && m[2].trim() === "") {
        ranges.push([open.start, offset + lineLen]);
        open = null;
      }
    }
    offset += lineLen;
  }

  if (open) ranges.push([open.start, content.length]); // unclosed → runs to EOF
  return ranges;
}

// Character ranges covered by inline code spans (`like this`), scanned per line.
//
// Fenced blocks are not the only way a document shows a marker without meaning it.
// Prose that NAMES the markers puts them in backticks — the spec beside this file
// does it, and so does the task document that specified this engine:
//
//     - [ ] Create `change-log.js` with `CL_START`/`CL_END` = `<!-- change-log-start -->` /
//           `<!-- change-log-end -->` plus a `LEGACY_MARKER_PAIRS` table
//
// Unguarded, that pair of mentions reads as a complete marker block and the whole
// checklist bullet gets replaced by a generated table. Per-line is the right scope:
// a real marker always sits alone on its own line, unbackticked.
function inlineCodeRanges(content) {
  const ranges = [];
  let offset = 0;

  for (const line of content.split("\n")) {
    const runs = [];
    for (const m of line.matchAll(/`+/g)) {
      runs.push({ index: m.index, len: m[0].length });
    }
    // Pair each opener with the next run of EXACTLY the same length (CommonMark).
    const used = new Set();
    for (let i = 0; i < runs.length; i++) {
      if (used.has(i)) continue;
      for (let j = i + 1; j < runs.length; j++) {
        if (used.has(j) || runs[j].len !== runs[i].len) continue;
        ranges.push([
          offset + runs[i].index,
          offset + runs[j].index + runs[j].len,
        ]);
        used.add(i);
        used.add(j);
        break;
      }
    }
    offset += line.length + 1;
  }
  return ranges;
}

/** Every range a match must not fall inside: fenced blocks and inline code spans. */
function protectedRanges(content) {
  return [...fencedRanges(content), ...inlineCodeRanges(content)];
}

const insideProtected = (ranges, index) =>
  ranges.some(([start, end]) => index >= start && index < end);

// ---------------------------------------------------------------------------
// Rows and blocks
// ---------------------------------------------------------------------------

function fmtEntry({ date, version = "", description = "", author = "" }) {
  return `| ${date} | ${version} | ${description} | ${author} |`;
}

// `before` / `after` are lines the section already held that are not part of
// the table — an authoring note, a nested `###` and its body — carried through
// verbatim on either side of the regenerated table. Both default to empty, so a
// block that was only ever a table is emitted exactly as it always was.
function buildChangeLogBlock(
  entries,
  { level = 2, before = [], after = [] } = {},
) {
  const pre = before.length ? `${before.join("\n")}\n\n` : "";
  const post = after.length ? `\n\n${after.join("\n")}` : "";
  return (
    `${CL_START}\n${"#".repeat(level)} Change Log\n\n` +
    pre +
    `| Date | Version | Description | Author |\n` +
    `|------|---------|-------------|--------|\n` +
    entries.join("\n") +
    post +
    `\n${CL_END}`
  );
}

// A line that opens with a pipe — the one predicate for "is this a table
// line", shared by `splitCarriedLines` and the `unparsed` filter in
// `upsertChangeLog` so the two classifications of the same line cannot drift.
const isTableLine = (l) => /^\s*\|/.test(l);

// Partition the located section into what the rebuild regenerates and what it
// carries through verbatim (bug.13).
//
// Walks the span with ABSOLUTE offsets so the module's protected ranges apply
// line by line. A line inside a fence or an inline code span is carried as-is
// and is never a marker, never the heading, never a table line — the same rule
// `findChangeLog` already applies to its start- and end-scans, because a fenced
// `<!-- change-log-start -->` or a fenced `| 2026-… |` is a PICTURE of a Change
// Log, not part of one.
//
// Of the unprotected lines: a marker on a line of its own is dropped (the
// rebuild supplies its own); the first `Change Log` heading is dropped (same);
// pipe-lines up to the first nested heading are the table; everything else is
// carried, split by where it sat relative to the table so it goes back on the
// same side. A nested `###` ends table classification — a subsection's own
// table belongs to the subsection and is carried with it, not torn out into
// the log. Non-pipe lines that sat BETWEEN two fragments of the log's table are
// carried after it, blank lines intact: the rows must be one contiguous table,
// and moving a paragraph loses nothing where dropping it lost text.
//
// This used to be dropped by design — "regenerating a block replaces everything
// between its bounds" — and the drop was invisible: rows survived, the next
// `##` survived, the document still read as well-formed. Every un-migrated
// document hits this once, on its first write, at a moment nobody is reading
// the diff. A machine writer's edit is additive; it never deletes text a human
// wrote.
//
// Returns `{ before, after, tableLines, unfencedLines }`. Two sources, by
// what the caller does with the block: the PRIMARY block is rebuilt, so it
// reads rows from `tableLines` and everything else is carried (a nested
// subsection's rows stay with the subsection); a block being DISCARDED by the
// sweep reads rows from `unfencedLines`, so every real row in it is harvested
// wherever it sat. Neither includes a fenced line, so a fenced pipe-line
// cannot be carried on one path and absorbed as history on the other.
function splitCarriedLines(content, found) {
  // Two grains of protection. A FENCE protects whole lines — everything
  // inside it is carried verbatim. An INLINE code span protects only its own
  // characters, and it can sit anywhere on a line, so a line is never
  // "protected" by one; instead each thing we look for — a marker, the
  // heading — is checked at its OWN offset against the full set. Testing
  // whole-line protection at the line start against both grains (cycle 1)
  // let a boundary line that merely opened with `` `note` `` keep its end
  // marker un-stripped.
  const fenced = fencedRanges(content);
  const ranges = [...fenced, ...inlineCodeRanges(content)];
  const markers = new Set(SWEEP_PAIRS.flatMap((p) => [p.start, p.end]));
  const isNestedHeading = (l) => /^#{1,6}[ \t]/.test(l);

  // [line, fenced?] with the marker and heading lines already removed.
  const raw = content.slice(found.start, found.end).split("\n");
  const lines = [];
  let headingSeen = false;
  let offset = found.start;
  for (let i = 0; i < raw.length; i++) {
    let line = raw[i];
    const at = offset;
    offset += line.length + 1;
    if (insideProtected(fenced, at)) {
      lines.push([line, true]);
      continue;
    }
    // The span's boundary lines BEGIN with the start marker and END with the
    // end marker by construction. Strip those by position — never by
    // substring across every line, which is how cycle 1 mangled a prose
    // mention of a marker. Each marker is checked at its own index, so one
    // sitting in an inline code span on that line is left alone.
    // `found.start` is already known to be unprotected (findMarkerBlock
    // checked it), so the start marker needs no guard. The END marker does:
    // it can sit after an inline span on the same line, and when both markers
    // share one line its offset must account for what was stripped from the
    // front — `shift` — or the check lands `start.length` too early.
    let shift = 0;
    if (found.hasMarkers && i === 0) {
      for (const m of markers) {
        if (line.startsWith(m)) {
          line = line.slice(m.length);
          shift += m.length;
        }
      }
    }
    if (found.hasMarkers && i === raw.length - 1) {
      for (const m of markers) {
        const idx = line.length - m.length;
        if (line.endsWith(m) && !insideProtected(ranges, at + shift + idx)) {
          line = line.slice(0, idx);
        }
      }
    }
    if (!line.trim() && line !== raw[i]) continue;
    // Neither an exact-marker line nor a heading line needs an inline-span
    // guard: a span begins with a backtick, so a line whose first non-blank
    // character is `<` or `#` cannot start inside one, and fenced lines were
    // carried above.
    if (markers.has(line.trim())) continue;
    if (!headingSeen && RE_HEADING.test(line)) {
      headingSeen = true;
      continue;
    }
    lines.push([line, false]);
  }

  // A table line is an unfenced pipe-line. A nested heading that comes AFTER
  // the first table line closes the table — what follows belongs to the
  // subsection, its own table included. A nested heading BEFORE any table
  // line does not: rows below it were history before this fix and stay
  // history, rather than being demoted to prose by a heading that merely
  // precedes them (verify cycle 2).
  let seenTable = false;
  let closed = false;
  const isTable = ([line, prot]) => {
    if (prot) return false;
    if (seenTable && isNestedHeading(line)) closed = true;
    if (closed) return false;
    const is = isTableLine(line);
    if (is) seenTable = true;
    return is;
  };
  const flags = lines.map(isTable);

  // Every unfenced line, markers and heading removed, in order — for a caller
  // that is about to DISCARD the whole block and must therefore harvest every
  // real row from it wherever it sat, nesting included (verify cycle 3).
  const unfencedLines = lines.filter(([, prot]) => !prot).map(([l]) => l);

  const trimBlank = (arr) => {
    let a = 0;
    let b = arr.length;
    while (a < b && !arr[a].trim()) a++;
    while (b > a && !arr[b - 1].trim()) b--;
    return arr.slice(a, b);
  };
  const text = (pairs) => pairs.map(([l]) => l);

  const first = flags.indexOf(true);
  if (first === -1) {
    // No table at all: prose goes above the new table, and anything from the
    // first nested heading on goes below it — a subsection is never hoisted
    // above the log it sits under.
    const cut = lines.findIndex(([l, prot]) => !prot && isNestedHeading(l));
    const head = cut === -1 ? lines : lines.slice(0, cut);
    const rest = cut === -1 ? [] : lines.slice(cut);
    return {
      before: trimBlank(text(head)),
      after: trimBlank(text(rest)),
      tableLines: [],
      unfencedLines,
    };
  }
  const last = flags.lastIndexOf(true);

  const tableLines = text(lines.filter((_, i) => flags[i]));
  const before = trimBlank(text(lines.slice(0, first)));
  const between = trimBlank(
    text(lines.slice(first, last + 1).filter((_, i) => !flags[first + i])),
  );
  const tail = trimBlank(text(lines.slice(last + 1)));
  const after =
    between.length && tail.length
      ? [...between, "", ...tail]
      : [...between, ...tail];
  return { before, after, tableLines, unfencedLines };
}

// Split a table row into trimmed cells, dropping the empty strings that a leading
// and trailing pipe produce.
function rowCells(row) {
  const trimmed = row.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((c) => c.trim());
}

// Widen a legacy 2-column row to the canonical 4 columns, preserving its content
// exactly. `| 2026-04-28 09:40 | Initial Jira story created |`
//       → `| 2026-04-28 |  | Initial Jira story created | sync-jira-story |`
//
// A row that already has 4+ cells is returned untouched — migration must never
// rewrite a row that is already canonical.
function migrateLegacyRow(row, { legacyAuthor = "", docType = "" } = {}) {
  const cells = rowCells(row);
  if (cells.length >= 4) return row;

  // A 3-cell row is not a shape either marker pair ever wrote — both legacy
  // writers emitted exactly `| date | change |`. Treating it as 2-column would
  // silently drop cell 3, so append the surplus to the description instead:
  // widening must never lose text, whatever odd row a hand edit produced.
  if (cells.length === 3) {
    return fmtEntry({
      date: (cells[0] || "").slice(0, 10),
      version: "",
      description: [cells[1], cells[2]].filter(Boolean).join(" — "),
      author:
        legacyAuthor && docType ? `${legacyAuthor}-${docType}` : legacyAuthor,
    });
  }

  const date = (cells[0] || "").slice(0, 10); // drop the legacy HH:MM
  const description = cells[1] || "";
  const author =
    legacyAuthor && docType ? `${legacyAuthor}-${docType}` : legacyAuthor;
  return fmtEntry({ date, version: "", description, author });
}

function migrateLegacyEntries(rows, opts = {}) {
  return rows.map((row) => migrateLegacyRow(row, opts));
}

// ---------------------------------------------------------------------------
// Finding an existing block
// ---------------------------------------------------------------------------

// Every candidate is rejected when it falls inside a fenced block — see guard 4
// in the header. The marker path is checked first and is the one that actually
// fires on documentation about this module, so filtering only the heading path
// would leave the real exposure open.
//
// BOTH ends are guarded. The end-scan used to be a lazy `start[\s\S]*?end`
// match that checked only the start index, so a fenced end marker INSIDE the
// section closed the block early — the real table was stranded outside it and
// every write added another end marker. That was unreachable while a write
// dropped fenced content; bug.13 made the write keep it, which made the
// unguarded end reachable on the second write (verify cycle 2).
function findMarkerBlock(content, ranges, start, end) {
  let from = 0;
  for (;;) {
    const s = content.indexOf(start, from);
    if (s === -1) return null;
    if (insideProtected(ranges, s)) {
      from = s + start.length;
      continue;
    }
    let e = content.indexOf(end, s + start.length);
    while (e !== -1 && insideProtected(ranges, e)) {
      e = content.indexOf(end, e + end.length);
    }
    // An unprotected start with no unprotected end after it is not a block —
    // and no later start could find one either.
    if (e === -1) return null;
    return { start: s, end: e + end.length };
  }
}

/**
 * Locate the document's Change Log.
 *
 * A marker block wins over a hand-written heading. Among marker blocks, the one
 * that appears **earliest in the document** wins — NOT the first pair in
 * `LEGACY_MARKER_PAIRS` order. Selecting by array order made the result depend on
 * a constant's declaration rather than on the document: with the github block
 * physically before the jira block, the jira block was chosen, and the collapse
 * pass below (which only sees the text after the chosen block) never saw the
 * github one, so both survived. Which pair appears first in a real document is
 * arbitrary — it depends on which tracker it was synced to first.
 *
 * Returns `{ start, end, level, legacyAuthor, hasMarkers }` or `null`.
 */
function findChangeLog(content) {
  const ranges = protectedRanges(content);

  const candidates = [];
  const current = findMarkerBlock(content, ranges, CL_START, CL_END);
  if (current) candidates.push({ ...current, legacyAuthor: "" });
  for (const pair of LEGACY_MARKER_PAIRS) {
    const found = findMarkerBlock(content, ranges, pair.start, pair.end);
    if (found) candidates.push({ ...found, legacyAuthor: pair.author });
  }

  if (candidates.length) {
    const best = candidates.reduce((a, b) => (b.start < a.start ? b : a));
    return {
      ...best,
      level: headingLevelWithin(content, best),
      hasMarkers: true,
    };
  }

  // Hand-written heading, scoped past frontmatter.
  const from = bodyStart(content);
  let searchFrom = from;
  for (;;) {
    const scope = content.slice(searchFrom);
    const m = scope.match(RE_HEADING);
    if (!m) return null;

    const start = searchFrom + m.index;
    if (insideProtected(ranges, start)) {
      searchFrom = start + m[0].length;
      continue;
    }

    const level = m[1].length;
    // End at the next heading of the SAME OR SHALLOWER level. An H3 log under
    // `## Notes & Updates` ends at the next `###` or `##`, whichever comes first —
    // the old code scanned only for `## ` and swallowed sibling subsections.
    //
    // The end-scan is guarded by the SAME protected ranges as the start-scan
    // above. It has to be: a fenced `## Example` inside the section is not a
    // heading, and ending the block there consumes the opening fence on rewrite,
    // leaves an orphaned closing fence, and strands the rows below it outside the
    // log. Guarding only the start was a real defect (TASK-42-BUG-1).
    const bodyOffset = start + m[0].length;
    const after = content.slice(bodyOffset);
    const nextRe = new RegExp(`^#{1,${level}}[ \\t]`, "gm");
    let end = content.length;
    for (const nm of after.matchAll(nextRe)) {
      const abs = bodyOffset + nm.index;
      if (insideProtected(ranges, abs)) continue;
      end = abs;
      break;
    }

    return { start, end, level, legacyAuthor: "", hasMarkers: false };
  }
}

// The heading level used inside an already-located marker block, so a rewrite
// preserves it. Defaults to 2 when the block carries no heading.
function headingLevelWithin(content, { start, end }) {
  const m = content.slice(start, end).match(RE_HEADING);
  return m ? m[1].length : 2;
}

/**
 * Entry rows currently recorded in the document, in document order.
 *
 * Reads through the same classifier the write path uses, so a fenced example
 * row inside the section is a picture on both sides: never written as history,
 * never read back as it either.
 */
function extractEntries(content) {
  const found = findChangeLog(content);
  if (!found) return [];
  return splitCarriedLines(content, found).tableLines.filter(isEntryRow);
}

// ---------------------------------------------------------------------------
// Insertion anchors
// ---------------------------------------------------------------------------

// Where a brand-new block goes, per doc type. NEVER "before the first `##`" —
// that is how a Change Log ended up above the Epic Goal. An anchor that does not
// match falls through to EOF, which is harmless; guessing the top is not.
const ANCHORS = {
  story: /^## Dev Agent Record\b/m,
  task: /^## Progress Tracking\b/m,
  epic: /^## Notes & Updates\b/m,
};

// ---------------------------------------------------------------------------
// The write path
// ---------------------------------------------------------------------------

/**
 * Append an entry to the document's Change Log, creating the section if absent.
 *
 * @param {string} content            full document text
 * @param {object} entry              { date, version?, description, author }
 * @param {object} [opts]
 * @param {string} [opts.docType]     story | task | epic | prd — picks the anchor
 * @returns {string}                  the updated document
 */
function upsertChangeLog(content, entry, { docType = "" } = {}) {
  const newRow = fmtEntry(entry);
  const found = findChangeLog(content);

  if (found) {
    // One classifier for the whole span: rows, unparsed pipe-lines and carried
    // prose are all read from the same partition, so a fenced example row
    // cannot be carried as prose AND absorbed as history (bug.13, cycle 1).
    const { before, after, tableLines } = splitCarriedLines(content, found);
    const existing = tableLines.filter(isEntryRow);

    // Rows the parser does not recognise are PRESERVED, not dropped.
    //
    // The block is regenerated from `existing`, so anything `isEntryRow` rejects
    // would otherwise vanish silently. That is not hypothetical: a log written
    // `| Version | Date | Change | Author |` — the column order this repo's own
    // roadmap template shipped with — has a non-date first cell in every row, so
    // every historical row failed the test and the regenerated block contained
    // only the new one. Losing history is the single worst outcome for this
    // module, and it is worse than emitting a slightly irregular table.
    //
    // Header and separator lines are excluded because the regenerated block
    // supplies its own.
    const unparsed = tableLines.filter(
      (l) =>
        !isEntryRow(l) &&
        !/^\s*\|[\s\-:|]+\|\s*$/.test(l) &&
        !/^\s*\|\s*(Date|Version|Description|Author|Change)\b/i.test(l),
    );
    const migrated = found.legacyAuthor
      ? migrateLegacyEntries(existing, {
          legacyAuthor: found.legacyAuthor,
          docType,
        })
      : existing;

    // A document synced to both trackers carries a second legacy block. Collapse
    // it into this one rather than leaving two logs behind.
    //
    // Scan BOTH sides of the chosen block. Scanning only the tail assumed the
    // chosen block was always the earliest, which stopped being true the moment
    // the other pair appeared first in the document (TASK-42-BUG-2). `findChangeLog`
    // now picks the earliest block, so in practice `head` is usually clean — but
    // sweeping both sides is what makes that an optimisation rather than a
    // correctness dependency.
    const head = collapseOtherLegacyBlocks(
      content.slice(0, found.start),
      docType,
      found.legacyAuthor,
    );
    const tail = collapseOtherLegacyBlocks(
      content.slice(found.end),
      docType,
      found.legacyAuthor,
    );
    const merged = [...head.entries, ...tail.entries];

    // Only when rows from a second block are being merged in do the historical
    // rows get sorted — otherwise the two blocks' histories would interleave
    // wrongly. In the ordinary single-block case the existing order is preserved
    // untouched, because the log is append-only and its order is its history.
    const history = merged.length
      ? [...migrated, ...merged].sort(byDate)
      : migrated;

    // Unparsed rows lead: they are older history the parser could not read, and
    // the log is append-only, so nothing may be emitted above them that would
    // reorder them relative to what follows.
    //
    // Everything else the section held is carried through on the side of the
    // table it came from — see `splitCarriedLines`.
    const block = buildChangeLogBlock([...unparsed, ...history, newRow], {
      level: found.level,
      before,
      after,
    });
    // Normalise both seams: the head may now end in blank lines where a swept
    // block used to be, and the tail may begin with them. Without this the
    // separators stack up (up to three blank lines observed) and accumulate
    // across writes.
    const trailing = found.end < content.length ? "\n\n" : "\n";
    return trimSeam(
      head.content.replace(/\n+$/, "\n") + block + trailing + tail.content,
    );
  }

  const anchor = ANCHORS[docType];
  if (anchor) {
    const from = bodyStart(content);
    const ranges = protectedRanges(content);
    const scope = content.slice(from);
    const m = scope.match(anchor);
    if (m && !insideProtected(ranges, from + m.index)) {
      const idx = from + m.index;
      return (
        content.slice(0, idx) +
        buildChangeLogBlock([newRow]) +
        "\n\n" +
        content.slice(idx)
      );
    }
  }

  return content.trimEnd() + "\n\n" + buildChangeLogBlock([newRow]) + "\n";
}

// Sort comparator on the leading date cell. `Array.prototype.sort` is stable, so
// rows sharing a date keep their original relative order.
const byDate = (a, b) => rowCells(a)[0].localeCompare(rowCells(b)[0]);

// Every marker pair a stray block can be wearing — the current one included.
//
// Sweeping only the legacy pairs left one reachable way to end up with two Change
// Logs: a document holding a legacy block AND a current block kept both, because
// the survivor wore markers the sweep did not recognise. "Exactly one Change Log"
// is the invariant, so the sweep is over every pair that can carry one, not over
// the pairs that happen to be superseded.
const SWEEP_PAIRS = [
  { start: CL_START, end: CL_END, author: "" },
  ...LEGACY_MARKER_PAIRS,
];

// Remove any *other* Change Log block from a slice of the document and return its
// rows, so a document ends with exactly one. Called for the text on each side of
// the chosen block, which is therefore never a candidate for removal itself.
function collapseOtherLegacyBlocks(rest, docType, alreadyMigrated) {
  const entries = [];
  let out = rest;

  for (const pair of SWEEP_PAIRS) {
    // Skip only when this slice's pair IS the one already migrated into the
    // primary block — an empty `author` (the current pair) never matches a legacy
    // author, so the current pair is always swept.
    if (pair.author && pair.author === alreadyMigrated) continue;

    // Loop: a slice may hold more than one block of the same pair.
    for (;;) {
      const found = findMarkerBlock(
        out,
        protectedRanges(out),
        pair.start,
        pair.end,
      );
      if (!found) break;
      // Through the same classifier as the primary block, so a fenced example
      // row inside a stray block is a picture here too (verify cycle 2) — but
      // from EVERY unfenced line, not just the table-classified ones: this
      // block is about to be removed wholesale, so a row after a nested
      // heading inside it would otherwise be erased (verify cycle 3).
      const rows = splitCarriedLines(out, {
        ...found,
        hasMarkers: true,
      }).unfencedLines.filter(isEntryRow);
      // Rows from a current-format block are already canonical, so
      // migrateLegacyEntries returns them untouched via its `>= 4 cells` guard.
      entries.push(
        ...migrateLegacyEntries(rows, { legacyAuthor: pair.author, docType }),
      );
      out = trimSeam(out.slice(0, found.start) + out.slice(found.end));
    }
  }

  return { entries, content: out };
}

// Removing a block leaves the blank line that preceded it next to the one that
// followed it. Collapse any run of 3+ newlines back to a single blank line so the
// seam is invisible; markdown renders the same either way, but the excess
// accumulates across writes and shows up in diffs.
const trimSeam = (s) => s.replace(/\n{3,}/g, "\n\n");

// ---------------------------------------------------------------------------
// Frontmatter timestamp
// ---------------------------------------------------------------------------

/**
 * Set frontmatter `updated:` to `date`. Leaves `created` alone. A document with no
 * frontmatter is returned unchanged.
 *
 * Every Change Log entry should bump `updated` in the same edit — `updated` is this
 * repo's OKF `timestamp`, and a log entry that does not move it leaves the document
 * claiming it was last touched before its own most recent recorded change.
 */
function bumpUpdated(content, date) {
  const end = bodyStart(content);
  if (end === 0) return content;

  const fm = content.slice(0, end);
  const re = /^updated:[ \t]*.*$/m;
  if (re.test(fm)) {
    return fm.replace(re, `updated: ${date}`) + content.slice(end);
  }
  // No `updated:` key — add one after `created:` when present, else leave the
  // document alone rather than guessing where a new key belongs.
  const createdRe = /^(created:[ \t]*.*)$/m;
  if (createdRe.test(fm)) {
    return fm.replace(createdRe, `$1\nupdated: ${date}`) + content.slice(end);
  }
  return content;
}

// ---------------------------------------------------------------------------
// Legacy row parsing
// ---------------------------------------------------------------------------

/**
 * Parse a preformatted legacy row back into an entry object.
 *
 * The `sync-jira-*` scripts no longer call this — task.45 moved them onto
 * `upsertChangeLog` with structured entries, and the shim they went through was
 * deleted with it. What keeps this function alive is the documents themselves:
 * rows written by the old 2-column writers are still on disk, and
 * `migrateLegacyEntries` parses each one through here when a block is first
 * rewritten under the unified markers. It is a *reader* of history now, not an
 * adapter for callers.
 */
function parseLegacyRow(row, author = "") {
  const cells = rowCells(String(row));

  // Already canonical (Date | Version | Description | Author) — read it as-is
  // rather than treating cell 1 as the description, which would silently emit a
  // row with an empty description and drop the caller's text.
  if (cells.length >= 4) {
    return {
      date: (cells[0] || "").slice(0, 10),
      version: cells[1] || "",
      description: cells[2] || "",
      author: cells[3] || author,
    };
  }

  return {
    date: (cells[0] || "").slice(0, 10),
    version: "",
    description: cells[1] || "",
    author,
  };
}

module.exports = {
  // markers
  CL_START,
  CL_END,
  LEGACY_MARKER_PAIRS,
  // regexes / predicates
  RE_HEADING,
  RE_ENTRY_ROW,
  isEntryRow,
  // scope guards
  bodyStart,
  fencedRanges,
  inlineCodeRanges,
  protectedRanges,
  insideProtected,
  // rows and blocks
  fmtEntry,
  buildChangeLogBlock,
  migrateLegacyEntries,
  parseLegacyRow,
  // read
  findChangeLog,
  extractEntries,
  // write
  ANCHORS,
  upsertChangeLog,
  bumpUpdated,
};
