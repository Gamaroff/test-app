#!/usr/bin/env node
// AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/stakeholder-summary-cli.js. Regenerate via `npm run bundle`.
"use strict";
/**
 * stakeholder-summary-cli.js — render one plain-language lead to stdout.
 *
 * WHY THIS EXISTS. `tracker-comment.js` renders its own lead, so a tracker-issue
 * site never needs this. A pull-request site does: the eleven conversation
 * templates are assembled in shell, in prose step documents, and posted by two
 * separately-maintained arms (`gh pr comment` and the Bitbucket REST API). The
 * lead has to be obtained ONCE, above the arm split, or the arms drift — which is
 * the failure task 106 exists to prevent, not to reproduce.
 *
 * The alternative was eleven inline `node -e "…"` expressions. That is eleven
 * copies of one expression, and the copies are what drift; this file is the
 * chokepoint that makes "one vocabulary" mechanical rather than aspirational.
 *
 * DELIBERATELY MINIMAL. It renders and prints. It does not post, does not know
 * what a pull request is, and does not decide which stages are legal for which
 * audience — that partition lives in stakeholder-summary.js beside the templates.
 *
 * Usage:
 *   stakeholder-summary-cli.js --stage <name> [--slot k=v ...] [--json]
 *
 * Exit codes, matching its peers:
 *   0  the lead was rendered and printed
 *   2  usage error, including an unknown stage
 *
 * There is no exit 1: rendering a lead touches nothing that can fail at runtime.
 */

const { renderLead, LEAD_STAGES } = require("./stakeholder-summary.js");

const USAGE = `stakeholder-summary-cli — render one plain-language lead

Usage:
  stakeholder-summary-cli.js --stage <name> [--slot k=v ...] [--json]

Options:
  --stage, -s   Catalogue stage to render. Required.
  --slot        Slot value, repeatable. Values are strings; the catalogue
                coerces them per slot type.
  --json        Emit {stage, lead} instead of the bare paragraph.
  --help, -h    Show this message.

Known stages:
  ${LEAD_STAGES.join(", ")}
`;

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = { stage: "", slots: {}, json: false, help: false };
  // Every value-taking flag fails CLOSED, the rule the peer engines learned the
  // hard way: a missing value that leaves the option undefined turns a
  // conditional off silently, and a flag-shaped value (`--stage --json`) would
  // otherwise swallow the flag the caller parses its output from.
  const value = (i, name) => {
    const v = args[i];
    if (v === undefined || v.startsWith("-")) {
      throw new Error(`${name} requires a value`);
    }
    return v;
  };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--stage":
      case "-s":
        opts.stage = value(++i, "--stage");
        break;
      case "--slot": {
        const pair = value(++i, "--slot");
        const eq = pair.indexOf("=");
        // A slot with no `=` is a caller error, not an empty value. Accepting it
        // would store a key whose value is "" — which the catalogue then drops —
        // so the call would look like it passed a slot and render as though it
        // had not.
        if (eq <= 0) throw new Error(`--slot expects k=v, got "${pair}"`);
        opts.slots[pair.slice(0, eq)] = pair.slice(eq + 1);
        break;
      }
      case "--json":
        opts.json = true;
        break;
      case "--help":
      case "-h":
        opts.help = true;
        break;
      default:
        throw new Error(`unknown argument "${args[i]}"`);
    }
  }
  return opts;
}

function run(argv, out = console.log, err = console.error) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    err(`Error: ${e.message}`);
    err(USAGE);
    return 2;
  }
  if (opts.help) {
    out(USAGE);
    return 0;
  }
  if (!opts.stage) {
    err("Error: --stage is required");
    err(USAGE);
    return 2;
  }
  const lead = renderLead(opts.stage, opts.slots);
  // An unknown stage renders null. Printing nothing and exiting 0 would leave
  // the call site with an empty LEAD, and its `printf '%s\n\n---\n\n%s'` would
  // then post a comment opening with a bare horizontal rule — a defect that
  // looks like a formatting slip rather than a missing paragraph. Fail loudly.
  if (lead === null) {
    err(
      `Error: unknown --stage "${opts.stage}". Known: ${LEAD_STAGES.join(", ")}`,
    );
    return 2;
  }
  out(opts.json ? JSON.stringify({ stage: opts.stage, lead }) : lead);
  return 0;
}

module.exports = { run, parseArgs, USAGE };

if (require.main === module) {
  process.exitCode = run(process.argv);
}
