#!/usr/bin/env node
// AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/card-preflight.js. Regenerate via `npm run bundle`.
"use strict";
/**
 * card-preflight — does this document publish a usable tracker card?
 *
 * An OFFLINE check: no auth, no network, no writes. It reads one document,
 * resolves it against the card section spec for its kind, and prints each
 * finding with the fix beside it.
 *
 * WHY THIS EXISTS SEPARATELY FROM `sync-jira-*  --check-card` (task.102)
 * ---------------------------------------------------------------------
 * The same check already ships inside every `sync-jira-*` script, and all three
 * `review-*` skills call it there. But the `create-*` skills are where the
 * defect is INTRODUCED, and reaching it through a sync skill would make an
 * authoring-time check depend on a tracker-specific skill being installed —
 * which a GitHub-only consumer may not have. The requirement is tracker-
 * agnostic: what sections a document must carry is a property of the document,
 * not of where its card is published.
 *
 * So the spec lives once in `jira-sync.js` beside the checker, and this file is
 * the thin, tracker-neutral entry point the authoring skills call. It defines
 * NO sections of its own — every list comes from `CARD_SECTIONS_BY_KIND`.
 * Duplicating the spec here is specifically what task.102 § 7 forbids: two
 * definitions drift silently, and the authoring side would start passing
 * documents the sync then publishes thin.
 *
 * ADVISORY BY DEFAULT, AND THAT IS THE POINT
 * ------------------------------------------
 * Exit code is 0 even when there are findings, unless `--strict` is passed.
 * `review-*` is the blocking gate; authoring is where you are told, early and
 * cheaply, in time to fix it. A blocking check at authoring pushes an author
 * toward writing filler to satisfy a gate, and filler is worse than a thin card
 * because it looks deliberate.
 *
 * Usage:
 *   node card-preflight.js --file <doc.md> [--kind task|story|epic|bug]
 *                          [--json] [--strict] [--quiet]
 *
 * `--kind` is inferred from the filename when omitted (`task.12.foo.md` → task).
 */

const fs = require("fs");
const path = require("path");
const lib = require("./jira-sync.js");

const KINDS = Object.keys(lib.CARD_SECTIONS_BY_KIND);

// Filename-based kind inference. Matches the `{kind}.{n}...` naming convention
// documented in docs/standards/file-naming.md. Returns null when the name says
// nothing — the caller then requires an explicit --kind rather than guessing,
// because guessing wrong checks the document against the wrong spec and reports
// confident findings about sections it was never supposed to have.
function inferKind(file) {
  const base = path.basename(file);
  const m = /^(task|story|epic|bug)\./.exec(base);
  return m ? m[1] : null;
}

function parseArgs(argv) {
  const out = { file: "", kind: "", json: false, strict: false, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--file":
        out.file = argv[++i] || "";
        break;
      case "--kind":
        out.kind = argv[++i] || "";
        break;
      case "--json":
        out.json = true;
        break;
      case "--strict":
        out.strict = true;
        break;
      case "--quiet":
        out.quiet = true;
        break;
      default:
        if (!out.file && argv[i] && !argv[i].startsWith("-"))
          out.file = argv[i];
    }
  }
  return out;
}

/**
 * Run the preflight. Pure apart from reading the file: returns the same shape
 * `checkCardSections` does, plus the resolved `kind` and `file`.
 */
function preflight(file, kind) {
  if (!fs.existsSync(file)) {
    // `preflight` is exported, so a library caller reaches this without passing
    // through main()'s checks. Raise the CLI's named error rather than a bare
    // ENOENT from readFileSync.
    const err = new Error(`no such file: ${file}`);
    err.reason = "no-such-file";
    throw err;
  }
  const specs = lib.CARD_SECTIONS_BY_KIND[kind];
  if (!specs) {
    const err = new Error(
      `unknown document kind "${kind}" — expected one of: ${KINDS.join(", ")}`,
    );
    err.reason = "unknown-kind";
    throw err;
  }
  // The body comes from lib.parseFrontmatter — the SAME parser every sync path
  // uses — and not from a local reimplementation. A second parse here would be
  // this file's own version of the defect it exists to catch: the authoring
  // check and the sync reading different bodies from one document, silently.
  // An earlier draft did hand-roll one, and the two diverged on a body opening
  // with a blank line and on CRLF documents. No real document disagreed yet,
  // which is exactly how a latent parse divergence stays invisible until it
  // is not.
  const { body } = lib.parseFrontmatter(fs.readFileSync(file, "utf8"));
  // `body` is returned so the parity test can assert the authoring path and the
  // sync path resolved the SAME text, not merely the same verdict — the original
  // divergence matched on every verdict it was tested against.
  return { file, kind, body, ...lib.checkCardSections(body, specs) };
}

function main(argv) {
  const args = parseArgs(argv);

  if (!args.file) {
    process.stderr.write(
      "Usage: card-preflight --file <doc.md> [--kind task|story|epic|bug] [--json] [--strict] [--quiet]\n",
    );
    return 2;
  }
  if (!fs.existsSync(args.file)) {
    process.stderr.write(`card-preflight: no such file: ${args.file}\n`);
    return 2;
  }

  const kind = args.kind || inferKind(args.file);
  if (!kind) {
    process.stderr.write(
      `card-preflight: cannot infer document kind from "${path.basename(
        args.file,
      )}" — pass --kind (${KINDS.join("|")})\n`,
    );
    return 2;
  }

  let result;
  try {
    result = preflight(args.file, kind);
  } catch (e) {
    process.stderr.write(`card-preflight: ${e.message}\n`);
    return 2;
  }

  if (args.json) {
    // `body` is deliberately dropped from the payload. It exists on the
    // returned object only so the parity test can assert the authoring and
    // sync paths resolved the same text; emitting it makes the JSON 94%
    // document (17.3 KB of an 18.3 KB payload on this repo's own task file),
    // which is noise for every consumer and a log-bloat hazard for the ones
    // that capture it.
    const { body: _body, ...payload } = result;
    process.stdout.write(
      JSON.stringify({ action: "card-preflight", ...payload }, null, 2) + "\n",
    );
  } else if (!args.quiet || !result.ok) {
    process.stdout.write(
      lib.formatCardCheck(result, {
        title: `Card preflight — ${kind} card for ${path.basename(args.file)}`,
      }) + "\n",
    );
    if (!result.ok) {
      process.stdout.write(
        "\n  Advisory only — this does not block. `/review-" +
          (kind === "bug" ? "bug" : kind) +
          "` is the gate that does.\n",
      );
    }
  }

  // Advisory unless --strict. See the header: authoring tells you, review gates.
  return result.ok || !args.strict ? 0 : 1;
}

module.exports = { preflight, inferKind, KINDS, main };

if (require.main === module) {
  // No `process.exit()` after writing to stdout — on a pipe that truncates the
  // payload at the buffer size (bug.3). Setting exitCode lets the write drain.
  process.exitCode = main(process.argv.slice(2));
}
