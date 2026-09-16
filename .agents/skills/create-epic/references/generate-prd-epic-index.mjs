#!/usr/bin/env node
// AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/generate-prd-epic-index.mjs.
// Regenerate via `npm run bundle`.
//
// Unlike every other shared resource, this file has TWO destinations. The bundler copies
// it to `skills/*/references/`, and `setup-consumer.sh` ALSO vendors it to a consumer's
// `scripts/generate-prd-epic-index.mjs` so their `docs:epic-index` npm script can reach it.
// That second copy lands in `scripts/`, beside the consumer's own tooling, with nothing
// around it to suggest it is not theirs — and `--update` overwrites it silently.
//
// A downstream repo hit exactly that: it fixed a YAML quote-escaping bug here, in its own
// `scripts/`, and lost the fix twice to `--update` before anyone noticed. Nothing failed;
// the fix simply stopped existing. This header travels with the file to both destinations,
// so the next person to open it in a consumer repo is told before they edit rather than after.
/**
 * generate-prd-epic-index.mjs
 *
 * Injects (or regenerates) a marker-delimited "## Epics" index into every sharded
 * sub-PRD under <prd-root>/<prd>/, giving each PRD clickable links down to its child
 * epic files. The reverse link already exists (each epic's `prd_source` frontmatter
 * points back up); this closes the loop between a PRD and its epics.
 *
 * The index is derived from the filesystem, not from `prd_source` (which is sometimes
 * a bare filename): for a PRD dir `<prd-root>/<p>/`, the PRD file is
 * `<prd-root>/<p>/<p>.md` and each epic is `<prd-root>/<p>/epics/<dir>/<dir>.md`
 * (the canonical epic file is the one whose basename equals its directory — this
 * excludes `epic.N.review.M.*.md` siblings).
 *
 * Idempotent: re-running produces byte-identical output. Safe to run any time an epic
 * is added, renumbered, retitled, or its status changes.
 *
 * PRD root resolution (first match wins):
 *   1. --prd-root <path>              CLI override (skills pass "${PRD_ROOT}")
 *   2. prd.prdShardedLocation         from skills-config.yaml at the repo root
 *   3. docs/prd                       default (the skill convention)
 *
 * Usage:  node scripts/generate-prd-epic-index.mjs [--prd-root <path>] [--check] [--strict]
 *   --prd-root <path>  base directory of the PRD shard tree (overrides config).
 *   --check            exit non-zero if any PRD's index is stale (for CI); writes nothing.
 *   --strict           treat a canonical epic file missing `epic_number` as a hard
 *                      error (non-zero exit) instead of silently skipping it.
 *
 * This file is the single source of truth. It is bundled into consuming skills'
 * `references/` by `npm run bundle`, and vendored into consumer repos at
 * `scripts/generate-prd-epic-index.mjs` by `setup-consumer.sh`. Do not fork the logic.
 */
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  statSync,
} from "node:fs";
import { join, basename } from "node:path";

const START = "<!-- epics-index-start -->";
const END = "<!-- epics-index-end -->";
const CHECK = process.argv.includes("--check");
const STRICT = process.argv.includes("--strict");

/** Read a `--flag <value>` CLI argument (value must not itself be a flag). */
function argValue(flag) {
  for (let i = 0; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === flag) {
      const v = process.argv[i + 1];
      return v && !v.startsWith("--") ? v : "";
    }
    if (a.startsWith(`${flag}=`)) return a.slice(flag.length + 1);
  }
  return "";
}

/**
 * Read `prd.prdShardedLocation` from skills-config.yaml without a YAML dependency.
 * Mirrors the awk fallback in shared/resources/resolve-paths.sh: find the top-level
 * `prd:` block, then the first indented `prdShardedLocation:` within it.
 */
function prdRootFromConfig() {
  const CONFIG = "skills-config.yaml";
  if (!existsSync(CONFIG)) return "";
  let text;
  try {
    text = readFileSync(CONFIG, "utf8");
  } catch {
    return "";
  }
  let inBlock = false;
  for (const line of text.split("\n")) {
    if (/^prd:\s*(#.*)?$/.test(line)) {
      inBlock = true;
      continue;
    }
    if (inBlock && /^\S/.test(line)) inBlock = false;
    if (inBlock) {
      const m = line.match(/^\s+prdShardedLocation:\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^['"]|['"]$/g, "").trim();
    }
  }
  return "";
}

const PRDS_DIR = argValue("--prd-root") || prdRootFromConfig() || "docs/prd";

/** Extract a single frontmatter scalar (order-independent), stripping surrounding quotes. */
function frontmatterField(src, key) {
  const m = src.match(new RegExp(`^${key}:\\s*(.+?)\\s*$`, "m"));
  if (!m) return "";
  return unquote(m[1]);
}

// Strip the matching quote pair and undo YAML's in-string escaping.
//
// Stripping the quotes alone is not enough: a value that contains the quote
// character it is wrapped in must escape it, and that escape then leaks verbatim
// into the generated table. A title written `'Anna''s wallet'` — the only legal
// single-quoted YAML spelling of an apostrophe — renders as `Anna''s wallet`.
//
// The old one-line strip also removed a leading OR trailing quote independently,
// so an unquoted value that merely ends in a quote character lost it.
function unquote(value) {
  const v = value.trim();
  if (v.startsWith("'") && v.endsWith("'") && v.length > 1) {
    return v.slice(1, -1).replace(/''/g, "'").trim();
  }
  if (v.startsWith('"') && v.endsWith('"') && v.length > 1) {
    return v.slice(1, -1).replace(/\\"/g, '"').trim();
  }
  return v;
}

/** Clean an epic title for display: drop a leading "[Epic N] " prefix, escape table pipes. */
function cleanTitle(raw) {
  return raw
    .replace(/^\[Epic\s+\d+\]\s*/i, "")
    .replace(/\|/g, "\\|")
    .trim();
}

function listDirs(dir) {
  return readdirSync(dir)
    .map((n) => join(dir, n))
    .filter((p) => statSync(p).isDirectory());
}

function buildBlock(epics) {
  const lines = [
    START,
    "",
    "## Epics",
    "",
    `_Auto-generated index — regenerate with \`node scripts/generate-prd-epic-index.mjs\`._`,
    "",
    "| #   | Epic | Status |",
    "| --- | ---- | ------ |",
    ...epics.map(
      (e) => `| ${e.number} | [${e.title}](${e.link}) | ${e.status || "—"} |`,
    ),
    "",
    END,
  ];
  return lines.join("\n");
}

/** Insert the block after the first H1, else after the frontmatter, else at top. */
function insertBlock(src, block) {
  const h1 = src.match(/^#\s.+$/m);
  if (h1) {
    const idx = src.indexOf(h1[0]) + h1[0].length;
    return src.slice(0, idx) + "\n\n" + block + "\n" + src.slice(idx);
  }
  const fm = src.match(/^---\n[\s\S]*?\n---\n/);
  if (fm)
    return (
      src.slice(0, fm[0].length) +
      "\n" +
      block +
      "\n\n" +
      src.slice(fm[0].length)
    );
  return block + "\n\n" + src;
}

// The whole imperative body lives in main() so that an early exit can be a
// `return` with `process.exitCode` set, never `process.exit()`. Node's stdio
// is ASYNCHRONOUS on a pipe: `process.exit()` tears the process down before
// the buffer drains, truncating output at ~64KB. Top-level `return` is illegal
// in an ES module, so the function wrapper is what makes the correct idiom
// available here at all. See bug.3.stdout-truncation-on-exit.
function main() {
  if (!existsSync(PRDS_DIR)) {
    console.log(`No PRD root at ${PRDS_DIR} — nothing to index.`);
    process.exitCode = 0;
    return;
  }

  let changed = 0;
  let stale = 0;
  const skipped = [];

  for (const prdDir of listDirs(PRDS_DIR)) {
    const p = basename(prdDir);
    const prdFile = join(prdDir, `${p}.md`); // dir is already named prd.<name>, file is <dir>.md
    const epicsDir = join(prdDir, "epics");
    if (!existsSync(prdFile) || !existsSync(epicsDir)) continue;

    const epics = [];
    for (const epicDir of listDirs(epicsDir)) {
      const d = basename(epicDir);
      const epicFile = join(epicDir, `${d}.md`);
      if (!existsSync(epicFile)) continue; // excludes review/QA siblings
      const fm = readFileSync(epicFile, "utf8");
      const number = parseInt(frontmatterField(fm, "epic_number"), 10);
      if (Number.isNaN(number)) {
        skipped.push(`${epicFile} (no epic_number)`);
        continue;
      }
      epics.push({
        number,
        title: cleanTitle(frontmatterField(fm, "title")) || d,
        status: frontmatterField(fm, "status"),
        link: `epics/${d}/${d}.md`,
      });
    }
    if (epics.length === 0) continue;
    epics.sort((a, b) => a.number - b.number);

    const block = buildBlock(epics);
    const src = readFileSync(prdFile, "utf8");
    const has = src.includes(START) && src.includes(END);
    // The replacement MUST stay a function. A string replacement is a pattern, so an
    // epic title carrying `$&`, `$\``, `$'` or `$$` would be expanded instead of
    // inserted — `$&` splices the whole matched index block back inside a table cell,
    // and because the regex is lazy each rerun nests another copy. A function argument
    // suppresses all `$` expansion and is otherwise identical. Do not "simplify" it.
    const next = has
      ? src.replace(new RegExp(`${START}[\\s\\S]*?${END}`), () => block)
      : insertBlock(src, block);

    if (next === src) continue;
    if (CHECK) {
      stale++;
      console.log(`STALE  ${prdFile}  (${epics.length} epics)`);
      continue;
    }
    writeFileSync(prdFile, next);
    changed++;
    console.log(
      `${has ? "updated" : "added  "}  ${prdFile}  (${epics.length} epics)`,
    );
  }

  if (skipped.length) {
    console.warn(`\n${skipped.length} epic file(s) skipped:`);
    for (const s of skipped) console.warn(`  - ${s}`);
  }

  if (STRICT && skipped.length) {
    console.error(
      `\n${skipped.length} epic file(s) missing epic_number (--strict).`,
    );
    process.exitCode = 2;
    return;
  }

  if (CHECK) {
    console.log(
      stale
        ? `\n${stale} PRD(s) have a stale epics index.`
        : "\nAll epics indexes up to date.",
    );
    process.exitCode = stale ? 1 : 0;
    return;
  }
  console.log(`\nDone: ${changed} PRD(s) updated.`);
}

main();
