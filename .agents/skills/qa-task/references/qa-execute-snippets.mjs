#!/usr/bin/env node
// AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/qa-execute-snippets.mjs. Regenerate via `npm run bundle`.
/**
 * qa-execute-snippets — extract, classify and dual-shell execute the fenced
 * ```bash blocks in a markdown file.
 *
 * Usage:
 *   node <this-file> --file <path.md> [options]
 *
 * Options:
 *   --file <path>        markdown file to analyse (required)
 *   --bind NAME=VALUE    bind a caller-supplied variable; repeatable
 *   --copy <dir>         seed the temp working directory from this directory
 *   --timeout <ms>       per-block, per-shell timeout (default 10000)
 *   --no-zsh             force the bash arm only (testing / mutation proving)
 *   --json               emit one JSON object on stdout
 *
 * Exit codes (repository convention):
 *   0  clean — no findings
 *   1  findings present
 *   2  hard error (missing file, bad argument)
 *
 * The rule this implements — what counts as runnable prose, why the safety
 * boundary is an allow-list rather than a deny-list, and why stdout rather than
 * exit status is the load-bearing comparison — is stated once in
 * `qa-runnable-prose-detection.md`, which sits beside this file in both the
 * source tree and every bundled copy. Read that first; this file is the
 * mechanism, not the argument.
 */

import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ── Extraction ────────────────────────────────────────────────────────────────

/**
 * Every fenced ```bash block, with the 1-based line number of its opening fence.
 * Only the `bash` info string is in scope — see the detection rule §1.
 */
export function extractBlocks(markdown) {
  const lines = markdown.split("\n");
  const blocks = [];
  let open = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // CR-10 — take the language as the FIRST WORD of the info string and ignore
    // the rest. Rejecting an attributed fence (```bash showLineNumbers) did not
    // merely skip that block: its body was dropped and its CLOSING fence was then
    // read as an opening one, inverting fence state for the rest of the file.
    // Verified: a doc with one attributed block extracted zero blocks, so the gate
    // reported a clean run on a document it had never read.
    const fence = /^(\s*)(`{3,}|~{3,})\s*([A-Za-z0-9_+-]*)([^`]*)$/.exec(line);
    if (!fence) {
      // Ordinary content. Only meaningful while a fence is open — that is the
      // block body, and dropping it here is how an earlier draft extracted every
      // block as empty.
      if (open !== null) open.body.push(line);
      continue;
    }
    const [, indent, marker, info] = fence;

    if (open === null) {
      open = {
        indent,
        marker: marker[0],
        len: marker.length,
        info,
        start: i,
        body: [],
      };
      continue;
    }

    // A closing fence uses the same marker character and is at least as long.
    if (marker[0] === open.marker && marker.length >= open.len && info === "") {
      if (open.info === "bash") {
        blocks.push({
          line: open.start + 1,
          code: open.body.join("\n"),
          origin: "fence",
        });
      }
      open = null;
      continue;
    }

    // A differently-marked fence inside an open block is content, not a fence.
    open.body.push(line);
  }

  // An unterminated fence is not a block — we never execute what we cannot delimit.
  return blocks;
}

// ── Table-cell extraction ─────────────────────────────────────────────────────

/**
 * A header cell naming a column whose cells hold commands. The corpus spells it
 * "Verification command", "Command" and "Commands"; the word itself is the signal.
 *
 * The restriction to command columns is a NOISE bound, not a safety one.
 * Backticked spans in table cells are overwhelmingly not commands — they are
 * field names, statuses, file globs and verdict tokens (`PASS`, `accepted`,
 * `task.*.gate.*.yml`). Feeding all of them to the classifier would push most
 * documents into `no-executable-blocks` on a flood of `unrecognised-command`
 * refusals, which is the "noise trains reviewers to ignore it" failure the rule
 * doc argues against. SAFE_COMMANDS remains the safety boundary, untouched.
 */
const COMMAND_COLUMN = /\bcommands?\b/i;

/** Every backtick-delimited span in a string, honouring multi-backtick delimiters. */
const CODE_SPAN = /(`+)(.+?)\1/g;

/**
 * A markdown table row, for our purposes, starts with a pipe. Requiring the
 * leading pipe is what stops an ordinary prose line containing a `|` from being
 * read as a table header; every table in this repository writes it.
 */
function isTableRow(line) {
  return line.trimStart().startsWith("|");
}

/**
 * The delimiter row (`| --- | :---: |`) is what makes the line above it a header
 * rather than a body row, so it is required rather than inferred.
 */
function isDelimiterRow(line) {
  const t = line.trim();
  return t.includes("|") && t.includes("-") && /^[\s:|-]+$/.test(t);
}

/**
 * One pass of the row splitter.
 *
 * `codeSpanAware` decides whether a `|` inside an open backtick span is content
 * or a delimiter — the whole of TASK87-001. Returns `open: true` when a span was
 * still open at end of line, which is the caller's signal that this reading of
 * the row cannot be trusted.
 */
function splitOnDelimiters(line, codeSpanAware) {
  const cells = [];
  let cur = "";
  let spanLen = 0; // length of the open backtick run; 0 = no span open

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === "\\" && line[i + 1] === "|") {
      // Keep the escape; `unescapeCell` removes it once the span is carved out.
      cur += "\\|";
      i++;
      continue;
    }

    // An ESCAPED backtick outside a span is a literal backtick and must not open
    // one — TASK87-002, found by QA cycle 2's refute pass as a regression from
    // cycle 1's own fix. Two escaped backticks in a row (`| a \` b | c \` d |`)
    // read as a span opening and closing, so the real delimiter between them
    // became content and the whole row collapsed to ONE cell. The command column
    // then did not exist and its command was dropped in silence — the same class
    // of defect as TASK87-001, reintroduced by the fix for it.
    //
    // The asymmetry is markdown's, not ours: inside a code span a backslash is
    // literal, so a backtick there still counts toward the closing run. Hence
    // `spanLen === 0` rather than an unconditional skip.
    if (codeSpanAware && ch === "\\" && line[i + 1] === "`" && spanLen === 0) {
      cur += "\\`";
      i++;
      continue;
    }

    if (codeSpanAware && ch === "`") {
      let run = 0;
      while (line[i + run] === "`") run++;
      // A span closes on a run of EXACTLY its own length — that is what makes
      // `` `a` `` inside a two-backtick span content rather than a terminator.
      if (spanLen === 0) spanLen = run;
      else if (run === spanLen) spanLen = 0;
      cur += "`".repeat(run);
      i += run - 1;
      continue;
    }

    if (ch === "|" && spanLen === 0) {
      cells.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  cells.push(cur);
  return { cells, open: spanLen !== 0 };
}

/**
 * Split a table row on its UNESCAPED pipes.
 *
 * Splitting on a bare `|` is the first thing that breaks on the real cells. The
 * resume contract's verification column contains
 * `gh pr view {PR} --comments --json comments \| grep -i "QA"` — one cell holding
 * a pipeline whose pipe is escaped for the table. Split naively and the row gains
 * a phantom column, every later column shifts, and the command column read is the
 * wrong text.
 *
 * The escape is preserved here and removed by `unescapeCell` after the span has
 * been carved out, so the two concerns stay separable.
 *
 * A pipe inside an OPEN backtick span is content, not a delimiter — TASK87-001.
 * GFM does split an unescaped pipe even inside a code span, so this deliberately
 * diverges from the rendering spec, and the divergence is the point: rendering
 * cares where the cell boundaries are, this engine cares whether a command was
 * seen at all. Before the fix, one unescaped pipe in ANY cell of a row shifted
 * every later column, so a perfectly well-formed command in the command column
 * was dropped and the file reported zero blocks, zero findings and no note —
 * byte-identical to a document with no commands in it. That is the silent skip
 * this engine exists to eliminate, reached through a different door.
 *
 * The divergence can only ever extract MORE, never mis-target: a code span's
 * text is exactly what the author wrote, and header and body rows go through
 * this same function so column indices stay consistent.
 */
export function splitTableRow(line) {
  const split = splitOnDelimiters(line, true);
  // TASK87-001 — a span left OPEN at end of line means the code-span tracking
  // was wrong about this row, and treating everything after the stray backtick
  // as one cell is worse than the naive split: the whole row collapses into a
  // single cell and the command column disappears. Fall back rather than trust
  // a reading the input has already contradicted.
  const cells = split.open ? splitOnDelimiters(line, false).cells : split.cells;
  // `| a | b |` splits to ["", " a ", " b ", ""] — the outer pipes are delimiters,
  // not content. Drop those two, and only when they are actually empty, so a
  // pipe-less or half-fenced row keeps its cells in the right positions.
  if (cells.length > 1 && cells[0].trim() === "") cells.shift();
  if (cells.length > 1 && cells[cells.length - 1].trim() === "") cells.pop();
  return cells.map((c) => c.trim());
}

/**
 * Undo the table-cell pipe escape — and only that one.
 *
 * GFM processes `\|` inside a table cell before any other inline parsing, code
 * spans included, so a command that reaches us via a cell has pipes that markdown
 * put there. Nothing else is unescaped: a command legitimately containing `\\`
 * (`printf 'a\\nb'`) must survive verbatim, and markdown does not process
 * backslash escapes inside a code span for any other character. Unescaping more
 * than the pipe would corrupt the command in the name of reading it.
 */
export function unescapeCell(text) {
  return text.replace(/\\\|/g, "|");
}

/**
 * Is this span plausibly an invocation at all?
 *
 * A span with no whitespace is a filename, a glob, a frontmatter key or a verdict
 * token — not a command. This bound fails toward running LESS, never toward
 * running something unsafe: everything that gets past it still goes through
 * `classifyBlock`, and the allow-list is still what decides.
 *
 * It also cannot hide the defect class this extractor exists to catch. A
 * shell-portability disagreement needs a glob inside a command substitution, a
 * `[` test, or a pipeline — none of which fit in a single unspaced word.
 */
function looksLikeCommand(code) {
  return /\s/.test(code);
}

/**
 * Which lines sit inside a fenced code block (the fences themselves included).
 *
 * Tables appear inside fenced blocks all over this repository — every document
 * that shows an example table does it. Those are illustrations, not instructions,
 * and extracting from them would execute a document's own examples. The state
 * machine deliberately mirrors `extractBlocks`, including its treatment of an
 * unterminated fence as open to end-of-file: two extractors reading one file must
 * agree about where the fences are, and a malformed document is better read
 * conservatively by both than differently by each.
 */
function fenceMask(lines) {
  const mask = new Array(lines.length).fill(false);
  let open = null;

  for (let i = 0; i < lines.length; i++) {
    const fence = /^(\s*)(`{3,}|~{3,})\s*([A-Za-z0-9_+-]*)([^`]*)$/.exec(
      lines[i],
    );
    if (!fence) {
      if (open !== null) mask[i] = true;
      continue;
    }
    const [, , marker, info] = fence;
    mask[i] = true;
    if (open === null) {
      open = { ch: marker[0], len: marker.length };
      continue;
    }
    if (marker[0] === open.ch && marker.length >= open.len && info === "") {
      open = null;
    }
  }
  return mask;
}

/**
 * Every command written inside a markdown table cell, in the same shape
 * `extractBlocks` returns plus an `origin` discriminator.
 *
 * This exists because the gate's whole value is executing what prose claims, and
 * the places table-cell commands appear are disproportionately *verification*
 * commands — where a false pass is the worst available failure. Task 77 shipped
 * one: a predicate in the resume contract's Steps 5–6 verification cell that
 * returned a false PASS under zsh whenever its glob matched nothing. Three QA
 * cycles and a full CI run did not catch it, because the extractor could not see
 * the cell it was written in.
 */
export function extractTableCellCommands(markdown) {
  const lines = markdown.split("\n");
  const inFence = fenceMask(lines);
  const blocks = [];

  for (let i = 0; i < lines.length; i++) {
    if (inFence[i] || !isTableRow(lines[i])) continue;
    if (
      i + 1 >= lines.length ||
      inFence[i + 1] ||
      !isDelimiterRow(lines[i + 1])
    ) {
      continue;
    }

    const header = splitTableRow(lines[i]);
    const columns = [];
    for (let c = 0; c < header.length; c++) {
      if (COMMAND_COLUMN.test(header[c])) columns.push(c);
    }

    // Consume the whole table either way. A body row skipped rather than consumed
    // would be re-examined as a candidate header on the next iteration, and a body
    // row followed by another body row full of dashes would read as one.
    let r = i + 2;
    for (; r < lines.length && !inFence[r] && isTableRow(lines[r]); r++) {
      if (columns.length === 0) continue;
      const cells = splitTableRow(lines[r]);
      for (const c of columns) {
        const cell = cells[c];
        if (!cell) continue;
        for (const match of cell.matchAll(CODE_SPAN)) {
          const code = unescapeCell(match[2]).trim();
          if (!looksLikeCommand(code)) continue;
          blocks.push({
            line: r + 1,
            code,
            origin: "table-cell",
            column: header[c],
          });
        }
      }
    }
    i = r - 1;
  }

  return blocks;
}

// ── Classification ────────────────────────────────────────────────────────────

/**
 * Commands known to be read-only. This is the safety boundary and it is an
 * ALLOW-list: anything absent here classifies as `mutating` and is skipped.
 * A deny-list alone fails open — every command nobody thought to forbid runs.
 *
 * `gh` and `curl` are deliberately absent in every form, including read-only
 * ones: a QA gate should not make network calls, and the execution environment
 * carries no credentials.
 */
export const SAFE_COMMANDS = new Set([
  "basename",
  "cat",
  "comm",
  "cut",
  "date",
  "diff",
  "dirname",
  "echo",
  "egrep",
  "false",
  "fgrep",
  "file",
  "grep",
  "head",
  "jq",
  "ls",
  "printf",
  "pwd",
  "readlink",
  "realpath",
  "seq",
  "sort",
  "stat",
  "tail",
  "test",
  "tr",
  "true",
  "uniq",
  "wc",
  // `sed` is read-only unless asked to edit in place; `find` unless given a
  // write action; both are constrained by DENY_PATTERNS below.
  "sed",
  "find",
]);

/**
 * Commands that RUN another command. Their blast radius is whatever follows, and
 * only the prefix was ever scanned — `env touch /tmp/x`, `command mv a b` and
 * `time mv a b` all classified runnable. They are refused outright rather than
 * recursed into: the recursion would have to re-implement each one's option
 * grammar to find where the real command starts, and getting that wrong fails
 * open again.
 *
 * `awk` is here for the same reason by a different route — its program text is a
 * quoted argument, so `awk 'BEGIN{system("touch /tmp/x")}'` is arbitrary shell
 * that the quote-blanking hides from the scan entirely.
 */
export const COMMAND_RUNNERS = new Set([
  "awk",
  "command",
  "env",
  "eval",
  "exec",
  "nice",
  "nohup",
  "sudo",
  "time",
  "timeout",
  "watch",
  "xargs",
]);

/**
 * Shell keywords, and builtins that cannot mutate anything outside the block's
 * own shell. `source` and `.` are deliberately absent: they execute an arbitrary
 * file, which is exactly what the allow-list exists to refuse.
 */
const SHELL_KEYWORDS = new Set([
  "!",
  "[",
  "[[",
  "]]",
  "]",
  "{",
  "}",
  "(",
  ")",
  "case",
  "do",
  "done",
  "elif",
  "else",
  "esac",
  "fi",
  "for",
  "function",
  "if",
  "in",
  "select",
  "then",
  "until",
  "while",
  // Builtins whose blast radius is the block's own shell process.
  ":",
  "break",
  "cd",
  "continue",
  "exit",
  "export",
  "local",
  "read",
  "readonly",
  "return",
  "set",
  "shift",
  "type",
  "unset",
  "which",
]);

/**
 * What a command name can look like. A token that cannot name a command — a
 * `case` arm glob pattern, a blanked quoted string, a stray backslash — is not
 * an invocation, so the segment holding it is not scanned.
 *
 * This does NOT weaken the fail-closed rule. Anything that *could* be a command
 * name and is not on the allow-list still classifies as mutating. What this
 * removes is the noise that made a real skill file report ten "unrecognised
 * commands" that were glob patterns, and skip all twelve of its blocks.
 */
const COMMAND_NAME = /^[A-Za-z_.\/][\w.\/+-]*$/;

/** `git` subcommands that only read. Any other subcommand is mutating. */
const SAFE_GIT_SUBCOMMANDS = new Set([
  "cat-file",
  "describe",
  "diff",
  "log",
  "ls-files",
  "ls-remote",
  "ls-tree",
  "rev-list",
  "rev-parse",
  "show",
  "status",
]);

/**
 * Named dangers. These do not define the boundary — SAFE_COMMANDS does — but
 * they produce a precise reason for the cases worth naming.
 */
/**
 * Commands for which `-o` is NOT an output file: `grep` reads it as
 * `--only-matching` and `find` as the OR operator. Both are read-only.
 */
const O_FLAG_NOT_OUTPUT = new Set(["grep", "egrep", "fgrep", "rg", "find"]);

/** Prefixes that precede the real command without being it. */
const COMMAND_PREFIXES = new Set(["sudo", "env", "command", "nohup", "nice"]);

/**
 * Does any `sed` invocation in this block write a file?
 *
 * BUG-10 — bug.6 closed sed's `w` flag with `/\bsed\b[^\n|;&]*\bw\s+\S/`, which fires
 * only when a SPACE separates `w` from its filename. GNU sed does not require
 * one, so `sed 's/a/b/wpwned.txt' f` and six sibling spellings stayed runnable.
 *
 * A regex cannot close this, and that is the whole point. `w` means "write" in
 * FLAG position (after the closing delimiter of `s<D>…<D>…<D>`) and means the
 * letter w in PATTERN text, and `s/warning/x/` contains `/w` exactly as
 * `s/a/b/wfile` does. Anchoring on `/w` matches both — every pattern tried during
 * bug.6 false-positived on ordinary substitutions, which is why that rule was
 * left demanding a space. Position is the distinction, so the script has to be
 * walked rather than matched. Same shape as bug.6 root cause D.
 */
function sedWritesFile(segment) {
  const toks = segment.trim().split(/\s+/).filter(Boolean);
  const isSed = (t) =>
    t
      .replace(/['"\\]/g, "")
      .split("/")
      .pop() === "sed";
  // EVERY sed in the segment, not just the first: `sed 's/a/b/' | sed 'w /tmp/x'`
  // writes, and checking only the leading invocation would miss it.
  for (let sedAt = 0; sedAt < toks.length; sedAt += 1) {
    if (!isSed(toks[sedAt])) continue;
    if (sedInvocationWrites(toks, sedAt)) return true;
  }
  return false;
}

/** Collect the script(s) of ONE sed invocation starting at `sedAt` and test them. */
function sedInvocationWrites(toks, sedAt) {
  const scripts = [];
  for (let i = sedAt + 1; i < toks.length; i += 1) {
    const tok = toks[i];
    // `-f script.sed` — the script is a file we cannot read. The classifier
    // cannot say what it does, and "cannot say" is never "safe".
    if (tok === "-f" || tok === "--file" || /^--file=/.test(tok)) return true;
    if (tok === "-e" || tok === "--expression") {
      if (toks[i + 1] !== undefined) scripts.push(toks[i + 1]);
      i += 1;
      continue;
    }
    if (/^--expression=/.test(tok)) {
      scripts.push(tok.slice("--expression=".length));
      continue;
    }
    if (tok.startsWith("-")) continue; // -n, -i handled elsewhere, other flags
    // First non-flag operand is the script, unless -e already supplied one.
    if (scripts.length === 0) scripts.push(tok);
    break;
  }

  return scripts.some((raw) => scriptWrites(raw.replace(/^['"]|['"]$/g, "")));
}

/** Walk one sed script; true when it contains a `w`/`W` write in command or flag position. */
function scriptWrites(script) {
  let i = 0;
  const isWrite = (ch) => ch === "w" || ch === "W";
  while (i < script.length) {
    const ch = script[i];
    if (
      ch === ";" ||
      ch === "\n" ||
      ch === " " ||
      ch === "\t" ||
      ch === "{" ||
      ch === "}"
    ) {
      i += 1;
      continue;
    }
    // An address may precede the command: /re/, \cREc, $, a line number, or a range.
    if (ch === "/") {
      i += 1;
      while (i < script.length && script[i] !== "/") {
        if (script[i] === "\\") i += 1;
        i += 1;
      }
      i += 1; // closing delimiter
      while (i < script.length && /[0-9,$~+\s]/.test(script[i])) i += 1;
      continue;
    }
    if (/[0-9$,~+]/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === "s" && i + 1 < script.length) {
      const delim = script[i + 1];
      i += 2;
      let seen = 0;
      while (i < script.length && seen < 2) {
        if (script[i] === "\\") i += 1;
        else if (script[i] === delim) seen += 1;
        i += 1;
      }
      // Flags run to the end of this command.
      while (i < script.length && !";\n}".includes(script[i])) {
        if (isWrite(script[i])) return true;
        i += 1;
      }
      continue;
    }
    if (isWrite(ch)) return true; // `w file` / `wfile` in command position
    // Any other command: skip to the end of it.
    while (i < script.length && !";\n}".includes(script[i])) i += 1;
  }
  return false;
}

/**
 * Does any command in this block write a file via `-o`?
 *
 * BUG-6 root cause D — `-o` used to be matched as a bare string with no reference
 * to the command it belongs to, so `grep -o` and `find … -o` were refused. The
 * first attempt at scoping it was a regex with a negative lookahead, and it was
 * wrong twice over, which is why this is a function instead:
 *
 *  - `\s*` before a lookahead BACKTRACKS. At `| grep -o …` the engine tried the
 *    lookahead after the space, failed it, then retried with `\s*` empty — where
 *    `grep` no longer sits at the cursor, so the negative lookahead trivially
 *    succeeded and the exemption evaporated. It held only at zero-whitespace
 *    positions, which meant this repository's OWN documented `| grep -o …`
 *    snippet stayed refused.
 *  - A command substitution inherited its enclosing segment's exemption, so
 *    `find . -newer $(sort -o /tmp/pwned f)` was let through — a FAIL-OPEN newly
 *    created by the fix for an over-refusal. `$(`, backticks and grouping
 *    parentheses are therefore segment boundaries here.
 */
function hasOutputFlagWrite(text) {
  const segments = text.split(/\n|;|\|\||&&|\||&|\$\(|`|\(|\)|\{|\}/);
  for (const seg of segments) {
    if (!/\s-o(?:\s+|=)\S/.test(seg)) continue;
    const words = seg.trim().split(/\s+/).filter(Boolean);
    let i = 0;
    // Step over assignments and prefix commands to reach the real command name.
    while (
      i < words.length &&
      (COMMAND_PREFIXES.has(words[i]) || /^[A-Za-z_]\w*=/.test(words[i]))
    ) {
      i += 1;
    }
    const name = (words[i] || "")
      .replace(/['"\\]/g, "")
      .split("/")
      .pop();
    if (O_FLAG_NOT_OUTPUT.has(name)) continue;
    return true; // an unrecognised command with `-o` still fails closed
  }
  return false;
}

export const DENY_PATTERNS = [
  [/\bgh\s+pr\s+comment\b/, "gh pr comment"],
  [/\bgh\s+issue\b/, "gh issue"],
  [/\bgh\s+api\b[^\n]*\s(-X|--method)\b/, "gh api with method"],
  [
    /\bcurl\b[^\n]*\s(-X|--request)\s*(POST|PUT|PATCH|DELETE)\b/,
    "curl write method",
  ],
  [/\bgit\s+push\b/, "git push"],
  [/\bgit\s+commit\b/, "git commit"],
  [/\brm\s+-[A-Za-z]*[rf]/, "rm -rf"],
  // `-i` anywhere in a sed invocation, not only immediately after `sed`.
  // `sed 's/a/b/' -i file` and `sed -e 's/a/b/' -i file` both edit in place and
  // both slipped past a pattern anchored to the first argument.
  [/\bsed\b[^\n|;&]*\s-[A-Za-z]*i\b/, "sed -i"],
  [/\bsed\b[^\n|;&]*\s--in-place(=\S*)?\b/, "sed --in-place"],
  // Long-form output flags on otherwise read-only commands write files just as a
  // redirection does, and carry no `>` for WRITE_REDIRECT to catch.
  [/\s--output(=|\s)/, "--output flag"],
  // BUG-6 root cause D — sed writes a file through its `w` flag with neither `-i`
  // nor a redirection: `s/a/b/w FILE` as a substitute flag and `w FILE` as a
  // command. DENY_PATTERNS named only the `-i` spellings, so both slipped past.
  // CR-7: `find` is read-only until it is given an action that is not.
  [
    /\bfind\b[^\n]*\s-(delete|exec|execdir|ok|okdir|fls|fprint|fprintf)\b/,
    "find write action",
  ],
  // Other allow-listed commands with a write mode.
  [/\btee\b/, "tee"],
];

/**
 * CR-1 — a write redirection makes ANY command mutating, including an
 * allow-listed one. `echo pwned > /tmp/x` classified runnable and wrote the file;
 * the temp working directory is no defence, because an absolute or `~`-relative
 * target simply ignores it.
 *
 * Matches `>`, `>>`, `&>`, `>|` and `n>` / `n>>` when they target a real path.
 *
 * Two things are NOT writes and must be exempt, or the rule refuses most of the
 * documented prose it exists to run: redirection to `/dev/null` / `/dev/stdout` /
 * `/dev/stderr`, which persists nothing, and file-descriptor duplication `>&1`,
 * `2>&1`, which redirects a stream onto another rather than onto a file. An
 * earlier draft matched `2>&1` and made `command -v zsh >/dev/null 2>&1` —
 * this repository's own documented zsh guard — unrunnable.
 *
 * BUG-6 root cause B — the pre-operator class used to exclude `\d` and `\w` as
 * well, which meant a redirection glued to the preceding word (`echo pwned>/tmp/x`,
 * `cat README.md>/tmp/x`, `echo pwned>>/tmp/x`) was never seen. Only `<`, `>` and
 * `&` need excluding: descriptor duplication is already handled by the `(?!&\d)`
 * lookahead, which is what keeps `2>&1` and `>&2` runnable.
 */
const WRITE_REDIRECT =
  /(?:^|[^<>&])(?:\d*>>?|&>|>\|)\s*(?!&\d|\s*\/dev\/(?:null|stderr|stdout)\b)\S/;

/**
 * Blank the CONTENTS of `(( … ))` and `[[ … ]]`, preserving length and newlines.
 *
 * Inside an arithmetic evaluation or a conditional expression, `>` is a COMPARISON
 * operator, never a redirection. Widening WRITE_REDIRECT's pre-context to catch
 * `echo pwned>/tmp/x` (BUG-6 root cause B) also made `if ((a>b)); then …` match,
 * turning a read-only arithmetic test into a refusal — an over-refusal introduced
 * by the fix for a fail-open. `[[ 1 > 2 ]]` was already refused for the same
 * reason before that change; one guard covers both.
 *
 * This is applied ONLY on the write-redirection path. `commandWords` still sees
 * the original text, so a command substitution inside a conditional — `[[ $(touch
 * /tmp/x) ]]` — is still scanned and still fails closed.
 */
function blankConditionalSpans(text) {
  const blank = (inner) => inner.replace(/[^\n]/g, " ");
  return text
    .replace(/\(\(([^)]*)\)\)/g, (_m, inner) => `((${blank(inner)}))`)
    .replace(/\[\[([^\]]*)\]\]/g, (_m, inner) => `[[${blank(inner)}]]`);
}

/** Template slots: `{n}`, `{task-id}`, `<path>`, `<PLACEHOLDER>`. */
const PLACEHOLDER_PATTERNS = [
  // `{name}` but never `${name}` — the negative lookbehind is what keeps shell
  // parameter expansion out of the placeholder bucket.
  /(?<!\$)\{[A-Za-z][\w .:|/-]*\}/,
  // `<name>` in argument position. `2>&1`, `<<EOF` and `a < b` do not match.
  /(?<![<>&\w])<[A-Za-z][\w -]*>/,
];

/** Shell variables that are always available and never need binding. */
const IMPLICIT_VARS = new Set([
  "?",
  "!",
  "$",
  "#",
  "@",
  "*",
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "HOME",
  "IFS",
  "PATH",
  "PWD",
  "OLDPWD",
  "SHELL",
  "USER",
  "TMPDIR",
  "RANDOM",
  "LINENO",
  "SECONDS",
  "HOSTNAME",
  "UID",
  "EUID",
  "PPID",
  "BASH_SOURCE",
]);

/**
 * Remove a `#` comment from one line, respecting quoting.
 *
 * Walks the line tracking single- and double-quote state so a `#` inside a string
 * is data, not a comment. `${#var}` is preserved because a `#` only opens a
 * comment at the start of a word (start of line or after whitespace).
 */
function stripCommentQuoteAware(line) {
  let single = false;
  let double = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "\\" && double) {
      i++;
      continue;
    }
    if (c === "'" && !double) {
      single = !single;
      continue;
    }
    if (c === '"' && !single) {
      double = !double;
      continue;
    }
    if (
      c === "#" &&
      !single &&
      !double &&
      (i === 0 || /\s/.test(line[i - 1]))
    ) {
      return line.slice(0, i);
    }
  }
  return line;
}

/**
 * Drop comments and heredoc bodies. Quoted spans are KEPT — a placeholder is
 * very often written inside quotes (`--issue "{TRACKER_ISSUE}"`), so blanking
 * quotes before placeholder detection would classify a templated block as
 * runnable and then execute it.
 */
/**
 * Blank the CONTENTS of every quoted span on one line, preserving the quote
 * characters, the line's length and its newlines.
 *
 * BUG-6 root cause C — the two `.replace()` calls this replaces ran in sequence
 * and neither knew about the other's quote type. `'[^']*'` was applied first, so
 * in `echo "it's fine"; touch /tmp/x; echo "don't"` the two apostrophes — each
 * of them literal text inside a double-quoted string — paired with each other
 * and erased `; touch /tmp/x; echo "` from the scan while bash still executed it.
 * Walking the line once, tracking which quote is open, is the only way to get
 * this right: inside single quotes nothing escapes, inside double quotes a
 * backslash does.
 */
function blankQuotedSpans(text) {
  let out = "";
  let quote = null;
  // Where the currently-open quote started, so an unterminated one can be undone.
  let openedAt = -1;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote === null) {
      if (ch === "'" || ch === '"') {
        quote = ch;
        openedAt = i;
        out += ch;
      } else if (ch === "\\" && i + 1 < text.length) {
        // A backslash outside quotes escapes the next character, including a
        // quote — `\'` opens nothing.
        out += ch + text[i + 1];
        i += 1;
      } else {
        out += ch;
      }
    } else if (quote === '"' && ch === "\\" && i + 1 < text.length) {
      out += "  ";
      i += 1;
    } else if (ch === quote) {
      quote = null;
      openedAt = -1;
      out += ch;
    } else {
      out += ch === "\n" ? "\n" : " ";
    }
  }
  // An unterminated quote must blank NOTHING. `echo don't` followed by a
  // `touch /tmp/x` on the next line has one apostrophe and no closer; blanking
  // from it to the end of the block would hide the `touch` from the command scan
  // while bash still ran it — a fail-open route of exactly the kind this function
  // exists to close. Leaving the span intact keeps the scanner fail-closed: it
  // sees more text, never less. (The regex pair this replaced got this right by
  // accident, because `'[^']*'` simply did not match without a closer.)
  if (quote !== null) return out.slice(0, openedAt) + text.slice(openedAt);
  return out;
}

/**
 * Like `blankQuotedSpans`, but COLLAPSES each quoted span to its bare quote pair
 * instead of preserving its length.
 *
 * Both exist because they serve different consumers. The heredoc detector needs
 * offsets that line up with the raw line, so it uses the length-preserving form.
 * Command detection needs the OLD tokenisation: the two regexes this replaced
 * turned `"a b"` into `""`, one token. Blanking to spaces instead splits a
 * multi-line assignment `MSG="first\nsecond"` into a final segment whose only
 * surviving token is the closing quote — reported as an unreadable command
 * position and refused. Collapsing keeps the token count while still fixing the
 * mutual-awareness defect the regex pair had.
 */
function collapseQuotedSpans(text) {
  let out = "";
  let quote = null;
  let openedAt = -1;
  let outAtOpen = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote === null) {
      if (ch === "'" || ch === '"') {
        quote = ch;
        openedAt = i;
        outAtOpen = out.length;
        out += ch;
      } else if (ch === "\\" && i + 1 < text.length) {
        out += ch + text[i + 1];
        i += 1;
      } else {
        out += ch;
      }
    } else if (quote === '"' && ch === "\\" && i + 1 < text.length) {
      i += 1; // escaped char inside double quotes is content — dropped
    } else if (ch === quote) {
      quote = null;
      openedAt = -1;
      out += ch;
    }
    // else: content of a quoted span — dropped
  }
  // Same fail-closed rule as blankQuotedSpans: an unterminated quote hides nothing.
  if (quote !== null) return out.slice(0, outAtOpen) + text.slice(openedAt);
  return out;
}

function stripProse(code) {
  const out = [];
  const lines = code.split("\n");
  let heredocTerminator = null;

  for (const raw of lines) {
    if (heredocTerminator !== null) {
      if (raw.trim() === heredocTerminator) heredocTerminator = null;
      continue; // heredoc body is data
    }
    // A REAL heredoc: `<<` or `<<-`, never `<<<` (here-string) and never the
    // second `<` of one. `grep -q x <<<"DATA"` used to swallow every following
    // line as heredoc body, hiding a trailing `rm -rf` from both scans.
    // BUG-6 root cause C — run the detector over a quote-blanked copy of the
    // line. `echo "example: cat <<EOF"` is documentation ABOUT a heredoc, not a
    // heredoc; treating it as one set a terminator that never arrived, so every
    // following line was discarded as heredoc body and a trailing `touch /tmp/x`
    // was hidden from both scans while bash still ran it.
    // The opener must be matched against the RAW line: in `cat <<'EOF'` the quotes
    // around the terminator are heredoc SYNTAX, and blanking them first erases the
    // terminator name and loses the body-shielding that the quoted form exists
    // for. So match raw, then consult the blanked copy — same length, so offsets
    // line up — purely to ask whether the `<<` itself sat inside a quoted span.
    const scan = blankQuotedSpans(raw);
    let here = null;
    for (const m of raw.matchAll(
      /(?<!<)<<-?(?!<)\s*\\?(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/g,
    )) {
      if (scan[m.index] === raw[m.index]) {
        here = m; // real shell syntax, not text inside a string
        break;
      }
    }
    if (here) {
      heredocTerminator = here[2];
      // Keep the WHOLE opener line, not just the part before `<<`. Truncating it
      // threw away any redirection that followed — `cat <<EOF > /tmp/pwned` had
      // its `> /tmp/pwned` removed before the write-redirect check ever saw it,
      // and classified runnable.
      out.push(raw);
      continue;
    }
    // Drop `# comment` — but ONLY outside quoted spans. A line regex fired on a
    // `#` inside a string, deleting the rest of the line from both scans while
    // execution still used the original code: `echo "note # here"; rm -rf /tmp/x`
    // classified runnable and the `rm -rf` ran.
    let line = stripCommentQuoteAware(raw);
    out.push(line);
  }
  return out.join("\n");
}

/**
 * Everything `stripProse` removes, plus the contents of quoted spans. Used only
 * for command detection, where a quoted string is an argument and never an
 * invocation.
 */
function stripNonCode(code) {
  return collapseQuotedSpans(stripProse(code));
}

/**
 * Keywords after which the NEXT word is in command position.
 *
 * BUG-6 root cause A — `commandWords` used to emit the first token of a segment
 * and stop. When that token was a keyword the whole segment was thrown away, so
 * `if touch /tmp/x; then echo hi; fi` reported no command at all and classified
 * runnable. The segment splitter split on `do`/`then`/`else`, which is why those
 * three keywords were never the problem and `if`/`while`/`until` always were.
 *
 * The set below is what makes the distinction explicit rather than accidental.
 * `if`, `elif`, `while` and `until` are followed by a command list, so scanning
 * must continue past them. `for`, `select`, `case`, `function` and `in` are
 * followed by a NAME or a word list — continuing past those would report the loop
 * variable of `for f in a b` as a command and refuse a legitimate loop. `fi`,
 * `done` and `esac` terminate a construct and are followed by nothing on the same
 * segment.
 *
 * The original bug report listed only `if`, `while` and `until`, and stated that
 * `elif` had been probed and was correctly refused. It is not: `elif` swallowed
 * its segment exactly as `if` did, and so did `for`, `case`, `esac`, `done`, `fi`
 * and `function`. Extending the splitter with three names would have left the
 * rest open, which is why this scans the segment instead.
 */
const COMMAND_INTRODUCING_KEYWORDS = new Set([
  // `! cmd` negates cmd's exit status — cmd is still run. Leaving `!` out would
  // turn `! touch /tmp/x` from mutating into runnable now that keywords are
  // resolved before the command-name test that used to catch it.
  "!",
  "if",
  "elif",
  "while",
  "until",
  "then",
  "else",
  "do",
]);

/**
 * `git` flags that take a SEPARATE operand. The operand is not the subcommand,
 * and reading it as one is what let `git -C log push origin main` resolve to
 * `git:log` — an allow-listed read — and execute a push (BUG-6 #7).
 */
const GIT_FLAGS_WITH_OPERAND = new Set([
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--exec-path",
  "--config-env",
  "--super-prefix",
]);

/**
 * The subcommand of one `git` invocation, skipping global flags and the operands
 * they consume. Returns null when the invocation names no subcommand at all.
 */
function gitSubcommand(tokensAfterGit) {
  for (let i = 0; i < tokensAfterGit.length; i += 1) {
    const tok = tokensAfterGit[i];
    if (tok === "") continue;
    if (GIT_FLAGS_WITH_OPERAND.has(tok)) {
      i += 1; // the operand belongs to the flag, never to command position
      continue;
    }
    if (tok.startsWith("-")) continue; // valueless flag, or --key=value
    // Return whatever sits in subcommand position, even if it is not a plain
    // lowercase word. An unreadable subcommand must reach the allow-list check as
    // itself and be refused, not be silently skipped in favour of a later token.
    return tok;
  }
  return null;
}

/** The leading word of every simple command in the block. */
export function commandWords(code) {
  const stripped = stripNonCode(code)
    // Backslash line-continuations join one command across several lines. Splitting
    // on the raw newline first makes the continuation's tail look like a fresh
    // command: `git log ... -- \` + `apps packages` reported `apps` as a command.
    .replace(/\\\n/g, " ")
    // Arithmetic expansion is arithmetic, not an invocation. It must go before the
    // `$(` rule below, or `$((N + 1))` becomes a segment whose first token is `N`.
    .replace(/\$\(\([^)]*\)\)/g, " ")
    // Command substitutions and subshells: turn the delimiters into segment
    // breaks so the INNER command is scanned as a command rather than being
    // swallowed by the enclosing assignment. Without this,
    // `P=$(git remote get-url origin)` skips `P=$(git` as an assignment and then
    // reads `remote` as the command.
    .replace(/\$\(/g, "\n")
    // CR-8: process substitution `<(…)` / `>(…)` keeps the inner command glued to
    // the outer segment's tail, and only the first token of a segment is examined
    // — so `cat <(touch /tmp/x)` saw only `cat`.
    .replace(/[<>]\(/g, "\n")
    .replace(/`/g, "\n");
  // NOTE: a bare `)` is deliberately NOT turned into a segment break. It used to
  // be, and that erased the one signal distinguishing a `case` arm pattern
  // (`*://*/pull/*)`) from an obfuscated command name (`/usr/bin/[t]ouch`) — both
  // are globs, and without the trailing `)` there is nothing to tell them apart.
  // The `$(`/`<(` rules above already put every substituted command at the START
  // of its own segment, so the closing paren only ever lands on a trailing
  // argument, where it is harmless.
  const words = [];
  // Split on anything that can begin a new simple command.
  // Deliberately NOT split on `{` or `(`: `echo {task-id}` would then yield
  // `task-id}` as a command word, and the fail-closed rule would report a
  // templated block as an unrecognised command. Grouping characters are stripped
  // as prefixes below instead.
  const segments = stripped.split(
    // `&` splits a background or AND-list, but `>&` / `<&` is descriptor
    // duplication — splitting there left the file descriptor (the `1` in `2>&1`)
    // sitting in command position, where the fail-closed rule then refused it.
    /(?:\n|;|\|\||&&|\||(?<![<>])&|\bdo\b|\bthen\b|\belse\b)/,
  );

  let inCase = false;
  for (const seg of segments) {
    const trimmed = seg.trim().replace(/^[({\s]+/, "");
    if (!trimmed) continue;
    if (/^case\b/.test(trimmed)) inCase = true;
    if (/^esac\b/.test(trimmed)) inCase = false;
    // Whether the NEXT token examined sits in command position. A segment starts
    // in command position; a keyword either keeps it there or ends the scan.
    let inCommandPosition = true;
    const toks = trimmed.split(/\s+/);
    for (let ti = 0; ti < toks.length; ti += 1) {
      let tok = toks[ti];
      // Leading `VAR=value` assignments and redirections precede the command.
      if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tok)) continue;
      if (/^[<>]/.test(tok) || /^\d+[<>]/.test(tok)) continue;
      if (tok === "") continue;
      // A `case` arm pattern is the ONE token in command position that is not an
      // invocation. It is recognisable only by its trailing `)`, which is why the
      // stripper above no longer erases it. The arm's BODY follows on the same
      // segment, so command position resumes after it rather than ending — that
      // is what stops `case x in a) touch /tmp/x;; esac` from hiding the `touch`
      // (BUG-6, the `case` member of root cause A's keyword family).
      if (inCase && /\)$/.test(tok)) {
        inCommandPosition = true;
        continue;
      }
      if (!inCommandPosition) continue;

      // Unquote the way a shell does before deciding what the command IS.
      // `who'am'i`, `to"u"ch` and `t\ouch` are all spellings of one binary, and a
      // scanner that reads them as unparseable-therefore-absent is a scanner an
      // attacker only has to add one quote to defeat. Verified: all three
      // executed under the previous version.
      let word = tok.replace(/\\(.)/g, "$1").replace(/['"]/g, "");

      // `((expr))` and `[[expr]]` written without spaces arrive as ONE token that
      // cannot be a command name. Spaced, they tokenise as the `((`/`[[` keywords
      // and are handled below; glued, fail-closed would refuse a read-only
      // arithmetic test. A token carrying `$(` or a backtick is NOT exempted —
      // `((a+$(touch /tmp/x)))` must still reach the fail-closed path.
      if (/^(?:\(\(|\[\[)/.test(tok) && !/[$`]/.test(tok)) {
        inCommandPosition = false;
        continue;
      }

      // Keywords are resolved BEFORE the command-name test, because several of
      // them (`[`, `[[`, `!`, `{`) cannot look like a command name and would
      // otherwise be reported as an unreadable command position. That was
      // harmless only while the scan stopped at a segment's first token; now that
      // it continues past `if`, the `[` of `if [ -n "$N" ]; then …` reaches this
      // point and must be read as the test builtin it is.
      if (SHELL_KEYWORDS.has(word)) {
        // A keyword is never an invocation, so it is never pushed. What matters
        // is whether a command can follow it in the SAME segment — see
        // COMMAND_INTRODUCING_KEYWORDS.
        inCommandPosition = COMMAND_INTRODUCING_KEYWORDS.has(word);
        continue;
      }

      if (!COMMAND_NAME.test(word)) {
        // Everything still unreadable in command position is UNSAFE, not absent.
        // A tilde path, a glob that expands to a binary (`/usr/bin/[t]ouch`), a
        // variable command name — the scanner cannot say what any of them runs,
        // and "cannot say" must never resolve to "safe".
        words.push("<unparseable>");
        break;
      }
      tok = word;
      if (tok === "git") {
        // Carry THIS invocation's subcommand. Resolving `git` against the first
        // `git …` in the whole block instead fails OPEN: a block opening with
        // `git rev-parse` would license a later `git checkout` in the same block.
        // Slice from AFTER THIS `git` token. Slicing from the segment's second
        // token was correct only while the scan always stopped at the segment's
        // first token; now that it continues past keywords and `case` arms, `git`
        // is frequently not token 0. `if git status` then resolved to `git:git`
        // and was refused, and `case log in log) git checkout -- . ;; esac`
        // resolved to the allow-listed `git:log` and RAN — a fail-open.
        const rest = gitSubcommand(toks.slice(ti + 1));
        words.push(rest ? `git:${rest}` : "git");
      } else {
        words.push(tok);
      }
      break; // the command word of this segment is found
    }
  }
  return words;
}

/** Variables the block reads but never assigns. */
export function unboundVariables(code, bindings) {
  const stripped = code
    .split("\n")
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");

  const assigned = new Set();
  for (const m of stripped.matchAll(/(?:^|\s|;)([A-Za-z_][A-Za-z0-9_]*)=/g))
    assigned.add(m[1]);
  for (const m of stripped.matchAll(/\bfor\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\b/g))
    assigned.add(m[1]);
  for (const m of stripped.matchAll(
    /\bread\s+(?:-\S+\s+)*([A-Za-z_][A-Za-z0-9_]*)/g,
  ))
    assigned.add(m[1]);

  const read = new Set();
  for (const m of stripped.matchAll(/\$\{?([A-Za-z_][A-Za-z0-9_]*)/g))
    read.add(m[1]);

  return [...read].filter(
    (v) => !assigned.has(v) && !IMPLICIT_VARS.has(v) && !(v in bindings),
  );
}

/**
 * Exactly one of: runnable | placeholder | mutating.
 * Order matters — `mutating` is decided before `placeholder`, so a block that is
 * both templated and dangerous is reported by its dangerous property.
 */
export function classifyBlock(code, bindings = {}) {
  // Scan prose-stripped code, not raw: a heredoc body or a comment that merely
  // MENTIONS `git push` is documentation. Scanning raw text would classify a doc
  // for its own examples and skip a block that is in fact safe to run.
  const prose = stripProse(code);

  for (const [re, name] of DENY_PATTERNS) {
    if (re.test(prose))
      return { klass: "mutating", reason: `deny-list: ${name}` };
  }

  // Deliberately NOT split on a single `|`: sed accepts it as an s/// delimiter,
  // so splitting there tears `s|a|b|wfile` apart and the write disappears.
  // `sedWritesFile` locates each `sed` token itself, so pipeline segmentation
  // buys nothing here anyway.
  if (prose.split(/\n|;|&&|\$\(|`/).some((seg) => sedWritesFile(seg))) {
    return { klass: "mutating", reason: "deny-list: sed w write" };
  }

  if (hasOutputFlagWrite(prose)) {
    return { klass: "mutating", reason: "deny-list: -o output flag" };
  }

  // CR-1 — a write redirection makes any command mutating, allow-listed or not.
  if (WRITE_REDIRECT.test(blankConditionalSpans(stripNonCode(code)))) {
    return { klass: "mutating", reason: "write-redirection" };
  }

  // `command -v X` / `command -V X` is a pure lookup: it prints a path and runs
  // nothing. Bare `command X` runs X, so the exception is anchored to the flag and
  // nothing else. Without it the repository's own documented zsh guard
  // (`command -v zsh >/dev/null`) is unrunnable by the gate that recommends it.
  const codeForScan = stripNonCode(code).replace(
    /\bcommand\s+-[vV]\b/g,
    "true",
  );

  const unknown = commandWords(codeForScan).filter((w) => {
    if (COMMAND_RUNNERS.has(w)) return true; // CR-5/CR-6 — before the allow-list
    if (SHELL_KEYWORDS.has(w)) return false;
    if (SAFE_COMMANDS.has(w)) return false;
    if (w.startsWith("git:")) return !SAFE_GIT_SUBCOMMANDS.has(w.slice(4));
    return true;
  });

  if (unknown.length > 0) {
    return {
      klass: "mutating",
      reason: `unrecognised-command: ${[...new Set(unknown.map((w) => w.replace(":", " ")))].join(", ")} (fail-closed)`,
    };
  }

  // Same reasoning for template slots.
  for (const re of PLACEHOLDER_PATTERNS) {
    if (re.test(prose))
      return { klass: "placeholder", reason: "template slot" };
  }

  const unbound = unboundVariables(code, bindings);
  if (unbound.length > 0) {
    return {
      klass: "placeholder",
      reason: `unbound-variable: ${unbound.join(", ")}`,
    };
  }

  return { klass: "runnable", reason: null };
}

// ── Dual-shell execution ──────────────────────────────────────────────────────

let ZSH_AVAILABLE = null;

/** Memoised — this used to spawn a subprocess on every call, including once per
 *  `{ skip: !zshAvailable() }` predicate in the test suite. */
export function zshAvailable() {
  if (ZSH_AVAILABLE === null) {
    const r = spawnSync("command", ["-v", "zsh"], {
      shell: "/bin/bash",
      encoding: "utf8",
    });
    ZSH_AVAILABLE = r.status === 0;
  }
  return ZSH_AVAILABLE;
}

/**
 * Run one block under each shell and compare.
 *
 * stdout is the load-bearing comparison, NOT exit status. The defect this whole
 * mechanism exists for exits 1 under both shells and differs only in what it
 * printed — comparing status alone would have missed it.
 */
/**
 * Recursive listing of `dir` as `relative path -> mtimeMs:size`.
 *
 * The containment check below compares two of these. It is deliberately cheap and
 * deliberately NOT a substitute for classification — see `runBlock`.
 */
export function snapshotTree(dir, skipDir = null) {
  const out = new Map();
  const walk = (d, prefix) => {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      const abs = `${d}/${e.name}`;
      // Do not descend into the working copy. Writes there are expected, and a
      // large `--copy` would otherwise be walked twice per block — turning a
      // safety net into the run's dominant cost.
      if (rel === skipDir) continue;
      if (e.isDirectory()) {
        walk(abs, rel);
        continue;
      }
      try {
        const st = statSync(abs);
        out.set(rel, `${st.mtimeMs}:${st.size}`);
      } catch {
        /* raced */
      }
    }
  };
  walk(dir, "");
  return out;
}

/**
 * CR-12 — a minimal environment for a child process, not the parent's.
 *
 * Spreading `process.env` handed every snippet GITHUB_TOKEN and tracker
 * credentials, contradicting this file's own claim that the execution
 * environment carries none. Inherited PWD also disagreed with `cwd`, which can
 * manufacture disagreement noise by itself.
 *
 * This is an ALLOW-LIST, and it must stay one. Six names cross; everything else
 * — every token, every credential, every CI variable — is absent because it was
 * never copied, not because it was deleted. A future maintainer who needs one
 * more variable adds one more key here, where the diff is visible; the failure
 * mode being designed out is `...process.env` re-appearing as a convenience.
 *
 * `bindings` are caller-supplied values, applied last so a caller can override a
 * base key deliberately. They are values the CALLER chose, not values inherited
 * from the ambient environment, which is why they are allowed to win.
 *
 * Extracted from `runBlock` for task.80 so the probe engine
 * (`security-probe.mjs`) contains its children exactly as the snippet path does,
 * rather than re-improvising containment per caller. Behaviour is byte-identical
 * to the inlined version it replaced.
 *
 * @param {{cwd?: string, bindings?: Record<string,string>}} opts
 * @returns {Record<string,string>} the child environment
 */
export function sandboxEnv({ cwd, bindings = {} } = {}) {
  return {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
    LANG: process.env.LANG ?? "C",
    TERM: "dumb",
    TMPDIR: process.env.TMPDIR ?? "/tmp",
    PWD: cwd ?? process.cwd(),
    ...bindings,
  };
}

export function runBlock(
  code,
  { shells, cwd, timeout = 10_000, bindings = {}, sandboxRoot = null } = {},
) {
  const env = sandboxEnv({ cwd, bindings });
  const runs = {};

  // Defence in depth. Classification is the first line and it has been wrong
  // before — thirteen ways, found in one review. This is the second line: watch a
  // canary directory beside the working copy and report any block that reaches
  // outside its sandbox, whatever the classifier concluded.
  // The sentinel engages only when the caller names the sandbox root explicitly.
  //
  // Deriving it as `${cwd}/..` was wrong and expensive: `runBlock` accepts any
  // cwd, so a bare temp directory made the sentinel walk the whole of /tmp twice
  // per block — it hung the test suite for two minutes before being killed. A
  // safety net that guesses its own boundary is not a safety net.
  const sentinelRoot = sandboxRoot;
  const workDirName = sentinelRoot && cwd ? cwd.split("/").pop() : null;
  const before = sentinelRoot ? snapshotTree(sentinelRoot, workDirName) : null;

  for (const shell of shells) {
    const r = spawnSync(shell, ["-c", code], {
      cwd,
      timeout,
      encoding: "utf8",
      env,
    });
    runs[shell] = {
      stdout: (r.stdout ?? "").replace(/\n+$/, ""),
      stderr: (r.stderr ?? "").replace(/\n+$/, ""),
      status: r.status,
      // Node sets `error.code = "ETIMEDOUT"` on a timeout, and that is sufficient.
      // Also testing `signal === "SIGTERM"` mislabelled any block that terminates
      // itself (`kill -TERM $$`) as a timeout, at high confidence.
      timedOut: r.error?.code === "ETIMEDOUT",
    };
  }

  const findings = [];

  // A failure that reproduces identically in every shell is not a portability
  // defect — it is a block that needs a context this gate did not supply, or a
  // snippet that is simply broken. The confidence stays `high` per the rule, but
  // saying so in the detail is what lets a reviewer triage it in one read
  // instead of re-running it by hand.
  const statuses = shells.map((sh) => runs[sh].status);
  const stdouts = shells.map((sh) => runs[sh].stdout);
  const consistent =
    shells.length > 1 &&
    statuses.every((x) => x === statuses[0]) &&
    stdouts.every((x) => x === stdouts[0]);

  for (const shell of shells) {
    const run = runs[shell];
    if (run.timedOut) {
      findings.push({
        kind: "execution-timeout",
        shell,
        confidence: "high",
        detail: `${shell} exceeded ${timeout}ms`,
      });
    } else if (run.status !== 0) {
      findings.push({
        kind: "execution-failure",
        shell,
        confidence: "high",
        detail:
          `${shell} exited ${run.status}` +
          (run.stderr ? `: ${run.stderr.split("\n")[0]}` : "") +
          (consistent
            ? " (identical in every shell — not a portability defect)"
            : ""),
      });
    }
  }

  if (before) {
    const after = snapshotTree(sentinelRoot, workDirName);
    const outside = [];
    for (const [k, v] of after) if (before.get(k) !== v) outside.push(k);
    for (const k of before.keys())
      if (!after.has(k)) outside.push(`${k} (removed)`);
    if (outside.length > 0) {
      findings.push({
        kind: "escaped-sandbox",
        confidence: "high",
        detail:
          `a block classified runnable wrote outside its working copy: ` +
          `${outside.slice(0, 5).join(", ")}${outside.length > 5 ? ` (+${outside.length - 5} more)` : ""}`,
      });
    }
  }

  // Two channels a shell can disagree on, and the stdout one is not the only one
  // that matters. The task-66 fixture disagrees on stdout while its exit status
  // AGREES, which is why the stdout comparison exists and is load-bearing. The
  // task-77 predicate is the mirror case: both shells print nothing and the entire
  // defect is in the exit status (`bash` 2, `zsh` 0 — a failed zsh glob aborts the
  // command substitution, and zsh's `[` then reads the empty operand in `-ge` as
  // 0). Comparing only stdout labels that a plain `execution-failure` and never
  // names the portability defect, which is the thing a reader needs to see.
  //
  // `channel` rather than a second `kind`: every existing consumer keys on
  // `kind === "shell-disagreement"` and keeps working, and the detail says which
  // channel diverged.
  //
  // This cannot turn a previously clean file red. A status disagreement implies at
  // least one non-zero status, which has already produced an `execution-failure`
  // finding above — so the file was never clean. The addition is a label on a
  // failure the gate already caught, not a new gate.
  if (shells.length > 1) {
    const [a, b] = shells;
    const lineCount = (out) => (out === "" ? 0 : out.split("\n").length);
    const statusDiffers = runs[a].status !== runs[b].status;
    if (runs[a].stdout !== runs[b].stdout) {
      findings.push({
        kind: "shell-disagreement",
        channel: "stdout",
        confidence: "medium",
        detail:
          `${a} printed ${lineCount(runs[a].stdout)} line(s), ` +
          `${b} printed ${lineCount(runs[b].stdout)} line(s)` +
          // Only ONE finding fires per block — stdout is the more specific
          // statement — but staying silent about a status divergence that is also
          // present understates the defect to the one reader who must act on it.
          (statusDiffers
            ? `; exit status also differs (${a} ${runs[a].status}, ${b} ${runs[b].status})`
            : ""),
      });
    } else if (statusDiffers) {
      findings.push({
        kind: "shell-disagreement",
        channel: "status",
        confidence: "medium",
        detail:
          `identical output, different exit status — ${a} exited ${runs[a].status}, ` +
          `${b} exited ${runs[b].status}. A predicate used as a gate would pass in ` +
          `one shell and fail in the other`,
      });
    }
  }

  return { runs, findings };
}

// ── File-level orchestration ──────────────────────────────────────────────────

export function executeFile(filePath, opts = {}) {
  const {
    bindings = {},
    timeout = 10_000,
    copyFrom = null,
    allowZsh = true,
  } = opts;

  const markdown = readFileSync(filePath, "utf8");
  // Two extractors, one stream. Everything downstream consumes `{line, code}` and
  // is source-agnostic, so a table-cell command is classified, sandboxed and
  // dual-shell compared by exactly the same code that handles a fenced block —
  // which is why this change needed no classification or safety rework. Sorted by
  // line so the report still reads in document order.
  const blocks = [
    ...extractBlocks(markdown),
    ...extractTableCellCommands(markdown),
  ].sort((a, b) => a.line - b.line);

  const useZsh = allowZsh && zshAvailable();
  const shells = useZsh ? ["bash", "zsh"] : ["bash"];

  // CR-11 — `cpSync` used to sit outside the try, so a bad `--copy` threw with the
  // temp directory already created and never removed. `main` swallowed it into
  // exit 2, so the leak was silent and repeated every run.
  //
  // The sandbox is a directory INSIDE the temp root, so the root can act as the
  // containment sentinel in `runBlock`.
  const tmpRoot = mkdtempSync(join(tmpdir(), "qa-snippets-"));
  const tmp = join(tmpRoot, "work");

  const results = [];
  const findings = [];
  // Informational records: things the reader must be told but cannot act on.
  // Kept separate from `findings` so they never gate and never accumulate as
  // noise, and separate from silence so the step is never a no-op nobody sees.
  const notes = [];

  try {
    mkdirSync(tmp, { recursive: true });
    if (copyFrom) cpSync(copyFrom, tmp, { recursive: true });
    for (const block of blocks) {
      const { klass, reason } = classifyBlock(block.code, bindings);
      if (klass !== "runnable") {
        results.push({
          line: block.line,
          origin: block.origin,
          column: block.column,
          klass,
          reason,
          skipped: true,
        });
        continue;
      }
      const { runs, findings: blockFindings } = runBlock(block.code, {
        shells,
        cwd: tmp,
        timeout,
        bindings,
        sandboxRoot: tmpRoot,
      });
      results.push({
        line: block.line,
        origin: block.origin,
        column: block.column,
        klass,
        reason: null,
        skipped: false,
        runs,
      });
      // A finding carries the origin too. `line 82` alone sends a reader to a
      // table row and leaves them looking for a fence that is not there; the
      // discriminator is what makes the finding actionable.
      for (const f of blockFindings) {
        findings.push({ ...f, line: block.line, origin: block.origin });
      }
    }
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }

  const counts = { runnable: 0, placeholder: 0, mutating: 0 };
  for (const r of results) counts[r.klass]++;

  // A run where zero blocks executed must never look like a pass — this is the
  // rule's own failure mode, and it is exactly the silent skip the step exists to
  // stop. zsh being absent never reduces the runnable count, so neither branch
  // below can be tripped by a missing interpreter.
  //
  // But "nothing ran" is TWO states, and reporting them as one is what made this
  // guard noise (bug.7). Discriminate on `counts.placeholder`:
  //
  //   placeholder > 0  → the run was UNDER-CONFIGURED. `--bind` / `--copy` fixes
  //                      it. Actionable, so it stays a finding.
  //   placeholder == 0 → every block was refused as `mutating`. The file documents
  //                      side-effecting commands (`gh`, `curl`, `rm`, write
  //                      redirections) that are deny-listed BY DESIGN — a QA gate
  //                      does not make network calls. No configuration will ever
  //                      move them into `runnable`, so there is nothing to act on.
  //                      Recorded as information, not as a finding.
  //
  // Six of ten skills surveyed sat permanently in the second state, three of them
  // receiving a finding whose remediation hint was suppressed precisely because it
  // did not apply. A finding that fires on most of the library with no available
  // fix is one reviewers learn to scroll past — an ignored check is a check that
  // does not exist.
  if (blocks.length > 0 && counts.runnable === 0) {
    if (counts.placeholder > 0) {
      // `medium`, deliberately. This is a statement about COVERAGE — the gate did
      // nothing here — not a defect in the work item, and `high` + `category: bug`
      // is what makes a finding gate-blocking. A skill whose snippets all read
      // caller variables would otherwise block its own PR for needing bindings the
      // run did not supply, which is the "noise trains reviewers to ignore it"
      // failure the rule warns about. It is still reported, which is what "a
      // finding, not a pass" requires.
      findings.push({
        kind: "zero-blocks-executed",
        confidence: "medium",
        detail:
          `${blocks.length} bash block(s) found, none classified runnable ` +
          `(${counts.placeholder} placeholder, ${counts.mutating} mutating)` +
          " — supply the missing values with --bind to execute the placeholder blocks",
      });
    } else {
      // The refusal reasons are carried verbatim rather than summarised away. An
      // `unrecognised-command (fail-closed)` refusal is not the same thing as a
      // deny-listed one: the first may be an over-refusal the classifier should
      // learn (bug.6, bug.10), and collapsing both into "correctly refused" is how
      // that would stop being visible.
      const byReason = new Map();
      for (const r of results) {
        byReason.set(r.reason, (byReason.get(r.reason) ?? 0) + 1);
      }
      const breakdown = [...byReason]
        .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
        .map(([reason, n]) => `${reason} \u00d7${n}`)
        .join(", ");
      notes.push({
        kind: "no-executable-blocks",
        detail:
          `${blocks.length} bash block(s), all correctly refused as mutating ` +
          `(0 placeholder) — this file documents side-effecting commands and the ` +
          `snippet step cannot execute it. Refusals: ${breakdown}`,
      });
    }
  }

  return {
    file: filePath,
    shells,
    zshAvailable: useZsh,
    zshSkipReason:
      allowZsh && !useZsh ? "zsh-unavailable" : allowZsh ? null : "disabled",
    blocks: blocks.length,
    counts,
    results,
    findings,
    notes,
  };
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const USAGE =
  "Usage: qa-execute-snippets --file <path.md> [--bind NAME=VALUE]... " +
  "[--copy <dir>] [--timeout <ms>] [--no-zsh] [--json]";

export function main(argv = process.argv.slice(2)) {
  let file = null;
  let copyFrom = null;
  let timeout = 10_000;
  let allowZsh = true;
  let json = false;
  const bindings = {};

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--file":
        file = argv[++i];
        break;
      case "--copy":
        copyFrom = argv[++i];
        break;
      case "--timeout": {
        // Unvalidated, `--timeout abc` yielded NaN and `--timeout -1` a negative;
        // spawnSync applies NO timeout for either, so a typo silently disabled the
        // hang protection.
        const t = Number(argv[++i]);
        if (!Number.isFinite(t) || t <= 0)
          return {
            exitCode: 2,
            error: `bad --timeout: must be a positive number`,
          };
        timeout = t;
        break;
      }
      case "--no-zsh":
        allowZsh = false;
        break;
      case "--json":
        json = true;
        break;
      case "--bind": {
        const pair = argv[++i] ?? "";
        const eq = pair.indexOf("=");
        if (eq < 1)
          return {
            exitCode: 2,
            error: `bad --bind (want NAME=VALUE): ${pair}`,
          };
        bindings[pair.slice(0, eq)] = pair.slice(eq + 1);
        break;
      }
      case "-h":
      case "--help":
        return { exitCode: 0, usage: USAGE };
      default:
        return { exitCode: 2, error: `unknown argument: ${argv[i]}` };
    }
  }

  if (!file) return { exitCode: 2, error: `--file is required\n${USAGE}` };

  let report;
  try {
    report = executeFile(file, { bindings, timeout, copyFrom, allowZsh });
  } catch (e) {
    return { exitCode: 2, error: e.message };
  }

  return { exitCode: report.findings.length > 0 ? 1 : 0, report, json };
}

function render(report) {
  const lines = [`Snippet execution — ${report.file}`, ""];
  const fromCells = report.results.filter(
    (r) => r.origin === "table-cell",
  ).length;
  lines.push(
    `  ${report.blocks} bash block(s)` +
      (fromCells ? ` (${fromCells} from table cells)` : "") +
      `: ${report.counts.runnable} runnable, ${report.counts.placeholder} placeholder, ` +
      `${report.counts.mutating} mutating`,
  );
  lines.push(
    `  shells: ${report.shells.join(", ")}${report.zshAvailable ? "" : "  (zsh-unavailable)"}`,
  );
  lines.push("");
  // `(table cell)` rather than nothing: the two constructs are found by different
  // means and fixed in different ways, and a reader who cannot tell them apart
  // goes looking for a fence at a line that holds a table row.
  const where = (r) =>
    `line ${r.line}` +
    (r.origin === "table-cell"
      ? ` (table cell${r.column ? `: ${r.column}` : ""})`
      : "");
  for (const r of report.results.filter((x) => x.skipped)) {
    lines.push(`  SKIP  ${where(r)}  ${r.klass} — ${r.reason}`);
  }
  // Notes print BEFORE the findings verdict. "No findings." is true and must stay
  // sayable, but a reader who sees only that line cannot tell a file the step
  // fully covered from one it could not execute at all — which is the whole point
  // of splitting the signal.
  for (const n of report.notes ?? []) {
    lines.push("", `  INFO  ${n.kind}  ${n.detail}`);
  }
  if (report.findings.length === 0) {
    lines.push("", "  No findings.");
  } else {
    lines.push("");
    for (const f of report.findings) {
      lines.push(
        `  ${f.kind}  ${f.line ? `${where(f)}  ` : ""}[${f.confidence}] ${f.detail}`,
      );
    }
  }
  return lines.join("\n");
}

// Resolve BOTH sides through realpath: `.agents/skills` and `.claude/skills` are
// symlinks to `../skills`, here and in every consumer install, so argv[1] arrives
// symlinked while import.meta.url is already real. Comparing them raw makes this
// guard false and main() never runs: exit 0, no output — indistinguishable from a
// clean run with nothing to report, which is precisely the silent-pass this engine
// exists to catch. Falls back to the plain comparison if realpath throws
// (deleted/unreadable path). See bug.4.snippet-engine-symlink-noop.
function isInvokedDirectly() {
  if (!process.argv[1]) return false;
  try {
    return (
      realpathSync(process.argv[1]) ===
      realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  }
}

if (isInvokedDirectly()) {
  const r = main();
  // `process.exitCode` + else-if, never `process.exit()`: stdio is ASYNCHRONOUS
  // on a pipe, and `process.exit()` tears the process down before the buffer
  // drains, truncating output at ~64KB. The --json report scales with the
  // number of snippets, so the QA gate — the one caller that always pipes —
  // is exactly what a truncating write breaks.
  // See bug.3.stdout-truncation-on-exit.
  process.exitCode = r.exitCode;
  if (r.error) {
    console.error(r.error);
  } else if (r.usage) {
    console.log(r.usage);
  } else {
    console.log(r.json ? JSON.stringify(r.report, null, 2) : render(r.report));
  }
}
