// AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/yaml-subset.js. Regenerate via `npm run bundle`.
"use strict";

// ── minimal YAML subset ──────────────────────────────────────────────────────
// Enough for skills-config.yaml's shape: nested maps, lists of maps, lists of
// scalars, and scalar values. Deliberately NOT a general YAML parser — no
// anchors, no multi-line strings, no flow collections. A consumer whose config
// needs those should be told so loudly rather than parsed wrongly.
//
// Promoted from skills/develop-batch/scripts/schedule.mjs, where it was the most
// capable of this repo's five hand-rolled readers. The body is unchanged from
// that original; only the export form differs (ESM `export function` →
// `module.exports`), because package.json is "type": "commonjs" and
// bundle_skill.py's sibling-follow regex recognises only the CommonJS require
// form — an ESM module here would silently break transitive bundling for
// anything that depends on it.
//
// (That regex is matched against file contents, so this note describes the
// require form rather than spelling it out: a literal example in a comment is
// indistinguishable from a real dependency and sends the bundler looking for a
// file that does not exist.)

function stripComment(line) {
  // Only strip a `#` that is not inside quotes.
  let inS = false;
  let inD = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    else if (c === "#" && !inS && !inD) return line.slice(0, i);
  }
  return line;
}

function parseScalar(raw) {
  const v = raw.trim();
  if (v === "") return "";
  if (
    (v.startsWith('"') && v.endsWith('"') && v.length > 1) ||
    (v.startsWith("'") && v.endsWith("'") && v.length > 1)
  ) {
    return v.slice(1, -1);
  }
  if (v === "true") return true;
  if (v === "false") return false;
  if (v === "null" || v === "~") return null;
  if (/^-?\d+$/.test(v)) return Number(v);
  if (/^-?\d*\.\d+$/.test(v)) return Number(v);
  if (v === "[]") return [];
  if (v === "{}") return {};
  return v;
}

/** Rows of {indent, text} for non-blank, non-comment lines. */
function significantLines(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const noComment = stripComment(raw);
    if (!noComment.trim()) continue;
    out.push({
      indent: noComment.match(/^\s*/)[0].length,
      text: noComment.trim(),
    });
  }
  return out;
}

// A mapping key: bare (`[\w.-]+`) or quoted. Quoted keys are the reason this is a
// named pattern rather than an inline literal — `byIssueType:` is keyed on live Jira
// issue type names such as "IT / DevOps Task", which contain spaces and slashes and
// so match no bare-key pattern. Before quoted keys were admitted here, such a row
// matched nothing and was skipped by the `if (!m) continue` branch below: the entire
// overlay disappeared with no error of any kind.
//
// This is the one deliberate extension to the promoted body. It is additive — a bare
// key takes the third alternative and the identical downstream path, which the
// "unquoted keys are unaffected" test pins.
const KEY_RE = /^(?:"([^"]+)"|'([^']+)'|([\w.-]+))\s*:\s*(.*)$/;
const KEY_PREFIX_RE = /^(?:"[^"]+"|'[^']+'|[\w.-]+)\s*:/;

function parseBlock(rows, start, indent) {
  // Decide list vs map by the first row at this indent.
  if (
    start < rows.length &&
    rows[start].indent === indent &&
    rows[start].text.startsWith("- ")
  ) {
    const arr = [];
    let i = start;
    while (
      i < rows.length &&
      rows[i].indent === indent &&
      rows[i].text.startsWith("- ")
    ) {
      const inline = rows[i].text.slice(2).trim();
      // `- key: value` starts a map entry whose siblings are indented further.
      if (KEY_PREFIX_RE.test(inline)) {
        const synthetic = [{ indent: indent + 2, text: inline }];
        let j = i + 1;
        while (j < rows.length && rows[j].indent > indent) {
          synthetic.push(rows[j]);
          j++;
        }
        const [val] = parseBlock(synthetic, 0, indent + 2);
        arr.push(val);
        i = j;
      } else {
        arr.push(parseScalar(inline));
        i++;
      }
    }
    return [arr, i];
  }

  const obj = {};
  let i = start;
  while (i < rows.length && rows[i].indent === indent) {
    const m = rows[i].text.match(KEY_RE);
    if (!m) {
      i++;
      continue;
    }
    const [, dq, sq, bare, rest] = m;
    const key = dq !== undefined ? dq : sq !== undefined ? sq : bare;
    if (rest.trim() !== "") {
      obj[key] = parseScalar(rest);
      i++;
      continue;
    }
    // Nested block: everything indented further than this key.
    let j = i + 1;
    if (j < rows.length && rows[j].indent > indent) {
      const [val, next] = parseBlock(rows, j, rows[j].indent);
      obj[key] = val;
      i = next;
    } else {
      obj[key] = null;
      i = j;
    }
  }
  return [obj, i];
}

function parseYamlSubset(text) {
  const rows = significantLines(text);
  if (!rows.length) return {};
  const [val] = parseBlock(rows, 0, rows[0].indent);
  return val ?? {};
}

module.exports = { parseYamlSubset };
