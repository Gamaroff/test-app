// AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/security-input-corpus.mjs. Regenerate via `npm run bundle`.
// The inputs already known to defeat each sink, stated once — so a probe tests
// what is known to get past a control rather than what an agent recalled.
//
// Pure data plus two accessors. No filesystem, no network, no process, and
// nothing is executed on import: this module supplies inputs, it does not run
// them. Importing it must be safe in any context, including a security review
// of the module itself.
//
// Prose peer: security-input-corpus.md, which argues what a sink is and states
// the method ordering. The two files carry the same cases.
//
// ═══════════════════════════════════════════════════════════════════════════
// EVERY SINK CARRIES BOTH DIRECTIONS. `legitimate` is not optional.
// ═══════════════════════════════════════════════════════════════════════════
//
// An implementation that closes a hole by refusing everything passes a
// hostile-only corpus perfectly, and is also a defect. Without the accept
// direction an over-strict boundary and a correct one produce identical output.
// tests/security-input-corpus.test.mjs asserts the floor, which is the
// difference between an instruction a model may skip and a guarantee.
//
// `why` reads in both directions: for a `hostile` case it is what goes wrong
// when the input is accepted; for a `legitimate` case it is why an over-strict
// implementation wrongly refuses it. `correct` always states what a right
// implementation does to the input — that is the field that lets an engine
// compute a verdict instead of asking an agent to judge one.

/** The sink taxonomy. Additive — nothing depends on this set being closed. */
export const SINKS = Object.freeze([
  "url-authority",
  "sql-orm",
  "shell-exec",
  "path",
  "template-render",
]);

/** The two directions every sink must cover. */
export const DIRECTIONS = Object.freeze(["hostile", "legitimate"]);

/** The frozen case shape. Every key is required and every value non-empty. */
export const CASE_FIELDS = Object.freeze([
  "id",
  "sink",
  "input",
  "why",
  "correct",
  "direction",
]);

/**
 * Stamp the sink onto each case, namespace its id, and freeze the result.
 * Ids are namespaced here rather than by hand so a copy-pasted case cannot
 * silently collide with the one it was copied from.
 */
function sinkCases(sink, cases) {
  return Object.freeze(
    cases.map((c) =>
      Object.freeze({
        id: `${sink}.${c.id}`,
        sink,
        input: c.input,
        why: c.why,
        correct: c.correct,
        direction: c.direction,
      }),
    ),
  );
}

// ---------------------------------------------------------------------------
// url-authority — a URL or DSN parser deciding where a connection goes
// ---------------------------------------------------------------------------
// The through-line: authority delimiters are silent. A misplaced one does not
// raise; it re-points the connection and drops whatever followed.

const URL_AUTHORITY = sinkCases("url-authority", [
  {
    id: "host-with-slash",
    direction: "hostile",
    input: "evil.example.com/x",
    why: "A `/` ends the authority, so everything after it becomes a path — and a port that followed the host is silently lost. No error is raised: the connection goes to a different host on the default port.",
    correct:
      'REJECT a host component containing `/`, `?`, `#`, `@` or whitespace, before the URL is built. Setting fields on a URL object is not sufficient here and must not be graded as a pass: `u.host = "evil.example.com/x"` on a URL with port 5432 silently yields host `evil.example.com`, port `5432` — the setter truncates at the `/` and raises nothing, which is the same re-pointing as concatenation with a cleaner-looking diff.',
  },
  {
    id: "query-in-path-segment",
    direction: "hostile",
    input: "db?sslmode=disable",
    why: "A `?` starts the query string, so what the author intended as a database-name path segment silently becomes a connection parameter — here one that turns TLS off.",
    correct:
      "Percent-encode the segment with encodeURIComponent so `?` becomes `%3F` and stays part of the name.",
  },
  {
    id: "base64-secret-in-userinfo",
    direction: "hostile",
    input: "a/b+c=d",
    why: "Generated secrets routinely contain the base64 alphabet. A spec-compliant parser rejects the raw form; a naive splitter lets the `/` terminate the authority so the remainder becomes a path — the credential is then both wrong and disclosed in a path that gets logged.",
    correct:
      "encodeURIComponent the credential before interpolation; never string-concatenate a secret into a DSN.",
  },
  {
    id: "userinfo-delimiter",
    direction: "hostile",
    input: "p@ss",
    why: 'In a hand-rolled DSN parser that splits userinfo at the FIRST `@`, a password containing one re-points the connection at a host named after the password\'s tail. A spec-compliant parser splits at the LAST `@` instead and percent-encodes the value — `new URL("postgres://u:p@ss@h/db")` gives password `p%40ss` and host `h`. The same input is therefore silently wrong in one parser and silently fine in the other, which is harder to find than either failure alone.',
    correct:
      "Percent-encode to `%40` before interpolation, so both parsers agree.",
  },
  {
    id: "port-delimiter",
    direction: "hostile",
    input: "pa:ss",
    why: 'In the USERNAME position `:` starts the password, and in the HOST position it starts the port — a naive splitter truncates at it in both. In the PASSWORD position it is preserved: `new URL("postgres://u:pa:ss@h/db").password` is `pa%3Ass`. The truncation is position-dependent, which is what makes it easy to test in the wrong slot and conclude the value is safe.',
    correct:
      "Percent-encode to `%3A`, and test the value in the position it will actually occupy.",
  },
  {
    id: "fragment-delimiter",
    direction: "hostile",
    input: "secret#1",
    why: "`#` starts the fragment, which is never sent to the server. A spec-compliant parser rejects it in the userinfo position outright; a naive splitter accepts it and truncates the credential at the `#`, so the request goes out with a shortened secret and fails authentication far from its cause.",
    correct: "Percent-encode to `%23` before interpolation.",
  },
  {
    id: "ipv6-brackets",
    direction: "hostile",
    input: "[::1]",
    why: "`[::1]` is a valid IPv6 loopback literal, so it parses cleanly — and that is the hazard, not a parse failure. A host field carrying it re-points the connection at the machine running the code, reaching services bound to loopback precisely because they are unauthenticated.",
    correct:
      "Resolve the host and reject loopback, link-local and private ranges whenever the destination is meant to be external; emit brackets only around an actual IPv6 literal.",
  },
  {
    id: "whitespace",
    direction: "hostile",
    input: "exa mple.com",
    why: "Whitespace is not valid in an authority, and parsers variously strip, reject, or truncate at it — so the same configuration works in one library and silently addresses something else in another.",
    correct:
      "Reject the value explicitly. Do not trim silently: a trim turns a malformed input into a plausible one.",
  },
  {
    id: "empty-host",
    direction: "hostile",
    input: "",
    why: 'Concatenation yields `scheme://:5432/db`. A spec-compliant parser rejects that outright — `new URL("postgres://:5432/db")` throws — but several driver-specific DSN parsers accept it and fall back to a default host. So a missing configuration value becomes a connection to the developer\'s own machine in exactly the parsers that do not raise.',
    correct:
      "Reject empty required components explicitly, before the string is built. Do not rely on the parser: its behaviour here differs by library, and the libraries that stay quiet are the dangerous ones.",
  },
  {
    id: "plain-host",
    direction: "legitimate",
    input: "db.internal.example.com",
    why: "The ordinary case. A host allow-list narrow enough to reject an internal domain is the over-refusal this direction catches.",
    correct: "Accept unchanged.",
  },
  {
    id: "encoded-secret-roundtrip",
    direction: "legitimate",
    input: "a%2Fb%2Bc%3Dd",
    why: "The correctly-encoded form of the base64 secret above. Refusing credentials containing `/` or `+` is an over-refusal — the fix is encoding, not rejection — and a validator that rejects the encoded form makes correct code impossible to write.",
    correct: "Accept, and decode back to exactly `a/b+c=d`.",
  },
  {
    id: "explicit-port",
    direction: "legitimate",
    input: "db.internal.example.com:5432",
    why: "A colon in the host position is legal and load-bearing. A rule that bans `:` outright to stop the userinfo case above also bans every explicit port.",
    correct: "Accept, preserving host and port as separate components.",
  },
]);

// ---------------------------------------------------------------------------
// sql-orm — a SQL engine deciding what statement to run
// ---------------------------------------------------------------------------

const SQL_ORM = sinkCases("sql-orm", [
  {
    id: "single-quote",
    direction: "hostile",
    input: "'",
    why: "Terminates a concatenated string literal, so the remainder of the value is parsed as SQL rather than as data.",
    correct:
      "Bind the value as a parameter. The driver sends it out-of-band from the statement text, so no quoting is involved and none can be got wrong.",
  },
  {
    id: "classic-tautology",
    direction: "hostile",
    input: "' OR '1'='1",
    why: "Closes the literal and appends a predicate that is always true, turning a single-row lookup into a full-table read.",
    correct:
      "Bind the value as a parameter; the whole string becomes one comparison operand.",
  },
  {
    id: "comment-introducer",
    direction: "hostile",
    input: "--",
    why: "Comments out the rest of the statement, including any trailing `AND tenant_id = ?` that was carrying the authorisation.",
    correct: "Bind the value as a parameter.",
  },
  {
    id: "statement-separator",
    direction: "hostile",
    input: "; DROP TABLE users; --",
    why: "Ends the statement and starts another. Whether the second one runs depends on whether the driver has multi-statement execution enabled — a setting the calling code usually does not know.",
    correct:
      "Bind the value as a parameter, and leave multi-statement execution off.",
  },
  {
    id: "backslash-escape",
    direction: "hostile",
    input: "\\'",
    why: "Backslash escaping is engine- and mode-dependent (MySQL's NO_BACKSLASH_ESCAPES changes it outright), so a hand-written escaper correct against one engine is wrong against another — and against the same engine differently configured.",
    correct:
      "Bind the value as a parameter. Hand-written escaping is the defect, not the fix.",
  },
  {
    id: "homoglyph-quote",
    direction: "hostile",
    input: "＇",
    why: "U+FF07 FULLWIDTH APOSTROPHE is not U+0027, so a deny-list keyed on the ASCII quote does not see it. Whether it then BECOMES an apostrophe depends on the conversion, and the conversions disagree — measured: `iconv -f UTF-8 -t CP1252` folds it to the byte 0x27 and NFKC normalisation yields U+0027, while Node's latin1 conversion yields 0x07 and MySQL's utf8mb4→latin1 substitutes `?`. The deny-list is defeated in every case; the escalation to injection needs a folding conversion specifically.",
    correct:
      "Bind the value as a parameter. Character deny-lists cannot enumerate Unicode; parameterisation does not need to.",
  },
  {
    id: "like-wildcards",
    direction: "hostile",
    input: "%",
    why: "Parameter binding makes this safe as data and still leaves it a wildcard: inside a LIKE it matches everything, so a filter meant to scope rows to one tenant matches all of them. Bound is not the same as inert.",
    correct:
      "Escape LIKE metacharacters (`%`, `_`, and the escape character) in the value in addition to binding it, and declare the ESCAPE clause.",
  },
  {
    id: "apostrophe-name",
    direction: "legitimate",
    input: "O'Brien",
    why: "The commonest over-refusal in this sink: input filters that strip or reject quotes to stop the cases above corrupt real names, and the corruption is silent.",
    correct: "Accept, bind, and read back byte-identical.",
  },
  {
    id: "percent-literal",
    direction: "legitimate",
    input: "50% off",
    why: "A literal `%` outside a LIKE context is ordinary text. A blanket wildcard-escape applied everywhere stores `50\\% off` instead.",
    correct:
      "Accept and round-trip unchanged; escape LIKE metacharacters only where a LIKE is actually used.",
  },
  {
    id: "double-dash-text",
    direction: "legitimate",
    input: "see note -- pending",
    why: "A double dash in a free-text field is prose, not a comment introducer. A deny-list on `--` rejects legitimate content.",
    correct: "Accept and round-trip unchanged.",
  },
]);

// ---------------------------------------------------------------------------
// shell-exec — a shell deciding what command to run
// ---------------------------------------------------------------------------
// The 27 hostile cases here are measured, not invented: 14 from task.67.bug.3
// and 13 from bug.6, both replayed verbatim in
// evals/shared/tests/snippet-classifier-fail-open-replay.test.mjs. Every one of
// them got past a classifier that looked correct on inspection.
//
// The 2 over-refusals from bug.6 seed the legitimate direction. They are worth
// as much as the fail-opens: a gate that refuses legitimate documented commands
// trains its users to bypass it.
//
// The common shape: the string a scanner reads is not the command the shell
// runs. Quote removal, escape removal, globbing, expansion, keyword nesting and
// redirection each change the effective command after the scan and before the
// exec.

const SHELL_EXEC = sinkCases("shell-exec", [
  {
    id: "quote-split-single",
    direction: "hostile",
    input: "who'am'i",
    why: "Quote removal rejoins the word to `whoami`, so a matcher comparing the raw token sees a command name that is on no list at all.",
    correct:
      "Compare the effective command word — after quote removal — not the literal token.",
  },
  {
    id: "quote-split-double",
    direction: "hostile",
    input: 'to"u"ch /tmp/x',
    why: "Double quotes split the same way: the effective command is `touch`, which writes.",
    correct: "Apply quote removal before matching.",
  },
  {
    id: "backslash-escape",
    direction: "hostile",
    input: "t\\ouch /tmp/x",
    why: "`\\o` is just `o` after escape removal, so the effective command is `touch`.",
    correct: "Apply escape removal before matching.",
  },
  {
    id: "glob-bracket",
    direction: "hostile",
    input: "/usr/bin/[t]ouch /tmp/x",
    why: "Pathname expansion resolves `[t]ouch` to `touch`; the literal never equals the name a list is keyed on.",
    correct:
      "Treat glob metacharacters in a command word as unresolvable and deny, rather than matching the unexpanded literal.",
  },
  {
    id: "glob-question",
    direction: "hostile",
    input: "/usr/bin/touc? /tmp/x",
    why: "`?` matches any single character, so the expansion is `touch`.",
    correct:
      "Same as the bracket case: an unresolvable command word is a deny.",
  },
  {
    id: "tilde-traversal",
    direction: "hostile",
    input: "~/../../usr/bin/whoami",
    why: "Tilde expansion followed by `..` traversal reaches an absolute path that a prefix check on `~/` is satisfied by and never sees.",
    correct:
      "Expand and normalise to a real path before deciding, then match on the result.",
  },
  {
    id: "escaped-tool-name",
    direction: "hostile",
    input: "g\\h pr comment 1 --body x",
    why: "Escape removal yields `gh`, so a rule keyed on the tool name `gh` does not fire and an outbound write posts.",
    correct: "Apply escape removal before matching the tool name.",
  },
  {
    id: "quote-split-curl",
    direction: "hostile",
    input: "cu'r'l -X POST https://x/",
    why: "Quote removal yields `curl`, and the request is a POST — a network write from a command that scanned as unknown.",
    correct: "Apply quote removal before matching.",
  },
  {
    id: "heredoc-redirect",
    direction: "hostile",
    input: "cat <<EOF > /tmp/x",
    why: "The write is in the redirection, not in the command word. `cat` inspects as read-only and the statement creates a file.",
    correct:
      "Parse redirections separately from the command word; any `>` or `>>` target is a write regardless of what precedes it.",
  },
  {
    id: "heredoc-append-rc",
    direction: "hostile",
    input: "cat <<'EOF' >> ~/.zshrc",
    why: "The same shape, appending to a shell rc file — a persistent change that runs again in every future shell.",
    correct:
      "Treat `>>` as a write, and a write to a shell rc path as persistent, regardless of the command word.",
  },
  {
    id: "sed-inplace-trailing",
    direction: "hostile",
    input: "sed 's/a/b/' -i file.txt",
    why: "`-i` edits in place, and here it sits in trailing position — after the script operand — where a check that only inspects leading flags never looks.",
    correct:
      "Scan every argument position for write-capable flags, not just the leading run.",
  },
  {
    id: "sed-inplace-after-e",
    direction: "hostile",
    input: "sed -e 's/a/b/' -i file.txt",
    why: "The same trailing `-i`, now separated from the command by a flag that takes an operand — which is what makes a positional heuristic stop early.",
    correct:
      "Consume each flag's operand while scanning, and keep scanning to the end of the argument list.",
  },
  {
    id: "sort-output-long",
    direction: "hostile",
    input: "sort --output=/tmp/x file.txt",
    why: "`sort` reads as a read-only filter, and `--output=` writes a file. The write is in a flag the tool's reputation does not suggest.",
    correct:
      "Know the write-capable flags of every tool named by hand, in long and short form (`-o` and `--output`).",
  },
  {
    id: "git-diff-output",
    direction: "hostile",
    input: "git diff --output=/tmp/x",
    why: "`git diff` is the canonical read-only subcommand, and `--output=` makes it write.",
    correct:
      "Match on the (subcommand, flags) pair, not on the subcommand alone.",
  },
  {
    id: "keyword-if",
    direction: "hostile",
    input: "if touch /tmp/x; then echo hi; fi",
    why: "A shell keyword occupies command position, so a parser reading the first word sees `if` and swallows the whole segment — never reaching the `touch` inside it.",
    correct:
      "Recurse into keyword-introduced compound commands and classify each contained command on its own.",
  },
  {
    id: "keyword-elif",
    direction: "hostile",
    input: "elif touch /tmp/x; then echo hi; fi",
    why: "The same escape through a different keyword; enumerating `if` alone leaves the rest reachable.",
    correct:
      "Recurse into every compound-command keyword, not a hand-picked subset.",
  },
  {
    id: "keyword-while",
    direction: "hostile",
    input: "while touch /tmp/x; do break; done",
    why: "The loop condition is a command, and it runs — at least once — before the body is ever considered.",
    correct: "Classify the loop condition as a command in its own right.",
  },
  {
    id: "keyword-until",
    direction: "hostile",
    input: "until touch /tmp/x; do break; done",
    why: "As `while`, with the sense inverted and the same command position unexamined.",
    correct: "Classify the loop condition as a command in its own right.",
  },
  {
    id: "keyword-case",
    direction: "hostile",
    input: "case x in a) touch /tmp/x;; esac",
    why: "`case` puts commands after a pattern and a `)`, a position that whitespace tokenisation does not recognise as command-initial.",
    correct: "Parse the case-arm structure and classify each arm's commands.",
  },
  {
    id: "git-global-flag-operand",
    direction: "hostile",
    input: "git -C log push origin main",
    why: "`-C` takes a directory operand. Reading the token after the flags as the subcommand yields `log` — read-only — when the real subcommand is `push`, which writes to a remote.",
    correct:
      "Consume each global flag's operand before reading the subcommand.",
  },
  {
    id: "redirect-glued",
    direction: "hostile",
    input: "echo pwned>/tmp/x",
    why: "No space before `>`, so whitespace tokenisation produces the single word `pwned>/tmp/x` and reports no redirection at all.",
    correct:
      "Tokenise redirection operators independently of whitespace — the shell does.",
  },
  {
    id: "redirect-glued-cat",
    direction: "hostile",
    input: "cat README.md>/tmp/x",
    why: "The same gluing, now attached to a filename, which makes the resulting token look even more like an ordinary operand.",
    correct:
      "Split redirection operators out of every token before classifying.",
  },
  {
    id: "redirect-glued-append",
    direction: "hostile",
    input: "echo pwned>>/tmp/x",
    why: "The append form glued the same way; a scan that special-cases a spaced ` > ` misses both.",
    correct:
      "Handle `>`, `>>`, `>|` and fd-prefixed forms as operators, not as text.",
  },
  {
    id: "quote-state-span",
    direction: "hostile",
    input: `echo "it's fine"; touch /tmp/x; echo "don't"`,
    why: "The apostrophe inside a double-quoted string opens a single-quote span for a scanner that ignores which quote type is already open. The span it then blanks runs across the `touch`, deleting it from the scan.",
    correct:
      "Track quote state per character, recording the enclosing quote type; an apostrophe inside double quotes is a literal.",
  },
  {
    id: "heredoc-in-quoted-example",
    direction: "hostile",
    input: 'echo "example: cat <<EOF"\ntouch /tmp/x',
    why: "A heredoc marker inside a quoted string is text, not a heredoc. Treating it as one consumes the following real command as heredoc body and never classifies it.",
    correct: "Recognise heredoc operators only outside quoted spans.",
  },
  {
    id: "sed-w-flag",
    direction: "hostile",
    input: "sed -n 's/a/b/w /tmp/x' README.md",
    why: "`sed` writes a file through the `w` flag inside the script — with neither `-i` nor a shell redirection to notice.",
    correct: "Parse the sed script itself, not only the tool's flags.",
  },
  {
    id: "sed-w-command",
    direction: "hostile",
    input: "sed 'w /tmp/x' README.md",
    why: "The bare `w` command form, which does not even carry a substitution to draw attention to the script.",
    correct:
      "Parse the sed script; treat `w` and `W` as writes wherever they appear in it.",
  },
  {
    id: "grep-only-matching",
    direction: "legitimate",
    input: "grep -o 'foo' README.md",
    why: "A blanket `-o means output file` heuristic refuses this. For grep, `-o` is `--only-matching`: it prints matched parts to stdout and writes nothing.",
    correct: "Resolve flag meaning per tool. Accept as read-only.",
  },
  {
    id: "find-or-operator",
    direction: "legitimate",
    input: "find . -name a -o -name b",
    why: "The same heuristic refuses this one too. For find, `-o` is the boolean OR operator between predicates, not an output file.",
    correct: "Resolve flag meaning per tool. Accept as read-only.",
  },
  {
    id: "plain-read",
    direction: "legitimate",
    input: "cat README.md",
    why: "The baseline. A classifier tightened until it refuses even this is passing the hostile half by refusing everything.",
    correct: "Accept as read-only.",
  },
  {
    id: "git-status-read",
    direction: "legitimate",
    input: "git status --short",
    why: "A read-only subcommand carrying a flag. A rule that denies any `git` invocation with flags — a tempting response to the `-C` case above — rejects this too.",
    correct:
      "Accept as read-only: the subcommand decides, and `--short` only changes formatting.",
  },
]);

// ---------------------------------------------------------------------------
// path — a filesystem API deciding which file to open
// ---------------------------------------------------------------------------

const PATH = sinkCases("path", [
  {
    id: "dot-dot-relative",
    direction: "hostile",
    input: "../secrets.env",
    why: "One level of traversal leaves the intended directory. The simplest case, and the one a containment check is usually written against.",
    correct:
      "Resolve against the root, then assert the result is inside the root before any filesystem call.",
  },
  {
    id: "dot-dot-deep",
    direction: "hostile",
    input: "../../../../etc/passwd",
    why: "Enough levels to reach the filesystem root from anywhere, so the depth of the intended directory provides no protection.",
    correct: "Resolve and assert containment. Do not count directory levels.",
  },
  {
    id: "absolute",
    direction: "hostile",
    input: "/etc/passwd",
    why: "An absolute path discards the root when resolved — `path.join(root, '/etc/passwd')` keeps the root, but `path.resolve(root, '/etc/passwd')` does not, and which one the code used is easy to misread.",
    correct:
      "Reject absolute inputs explicitly, then resolve and assert containment.",
  },
  {
    id: "encoded-traversal",
    direction: "hostile",
    input: "..%2f..%2fetc%2fpasswd",
    why: "The containment check sees no `/` and passes; a later decode — in a router, a client, or the code itself — re-introduces the traversal after the check has already run.",
    correct:
      "Decode fully before validating, and validate immediately before use.",
  },
  {
    id: "symlink-escape",
    direction: "hostile",
    input: "uploads/link-to-etc/passwd",
    why: "Every component is inside the root lexically, and the filesystem resolves `link-to-etc` somewhere else. A `path.resolve` check is satisfied by a string the kernel does not agree with. **This case needs filesystem setup to discriminate**: without the symlink present, a realpath-checking implementation and one that skips realpath return the same verdict, so the input alone proves nothing.",
    correct:
      "realpath the resolved path — following symlinks — and re-assert containment on the result. To probe it, first create the fixture: a directory `<root>/uploads` containing a symlink `link-to-etc` → `/etc`. Then a correct implementation rejects; one that only resolves lexically accepts.",
  },
  {
    id: "null-byte",
    direction: "hostile",
    input: "safe.txt\u0000.png",
    why: "An extension check passes on `.png` while syscall layers that truncate at NUL open `safe.txt`. The validated string and the opened file are different strings.",
    correct:
      "Reject any input containing a NUL before any filesystem call or extension check.",
  },
  {
    id: "prefix-not-boundary",
    direction: "hostile",
    input: "../data-evil/x",
    why: "With root `/srv/data` this resolves to `/srv/data-evil/x`, which `startsWith('/srv/data')` accepts. The check passes on a sibling directory that merely shares a prefix.",
    correct:
      "Compare on a separator boundary — `resolved === root || resolved.startsWith(root + path.sep)`.",
  },
  {
    id: "empty",
    direction: "hostile",
    input: "",
    why: "Resolves to the root itself, so an operation meant for one file targets the whole directory — a delete or a chmod then applies to everything under it.",
    correct:
      "Reject empty input explicitly; a containment check alone accepts it.",
  },
  {
    id: "nested-relative",
    direction: "legitimate",
    input: "reports/2026/q1.csv",
    why: "The ordinary case. A rule that bans every `/` to stop traversal also bans every subdirectory.",
    correct: "Accept, resolving to the file under the root.",
  },
  {
    id: "dots-in-name",
    direction: "legitimate",
    input: "archive..2026.tar.gz",
    why: "A naive `input.includes('..')` check rejects a legal filename. Traversal is `..` as a whole path component, not `..` as a substring.",
    correct:
      "Accept. Decide on the resolved path, not on a substring search of the input.",
  },
  {
    id: "leading-dot",
    direction: "legitimate",
    input: ".gitkeep",
    why: "Dotfiles are legal filenames, and a rule rejecting any component that starts with `.` — written to stop `..` — takes them with it.",
    correct:
      "Accept. `.` and `..` are the two special components; nothing else beginning with a dot is.",
  },
]);

// ---------------------------------------------------------------------------
// template-render — a renderer deciding what markup a value becomes
// ---------------------------------------------------------------------------

const TEMPLATE_RENDER = sinkCases("template-render", [
  {
    id: "script-tag",
    direction: "hostile",
    input: "<script>alert(1)</script>",
    why: "The canonical case, and the one every deny-list is written against — which is exactly why it is a poor test on its own.",
    correct:
      "HTML-escape at render time so the value renders as text; never insert it as markup.",
  },
  {
    id: "img-onerror",
    direction: "hostile",
    input: "<img src=x onerror=alert(1)>",
    why: "Executes without the string `script` appearing anywhere, so a deny-list keyed on `<script>` passes it through.",
    correct:
      "Escape rather than filter. An allow-list of tags, if markup is genuinely wanted, must allow-list attributes too.",
  },
  {
    id: "attribute-breakout",
    direction: "hostile",
    input: '" autofocus onfocus=alert(1) x="',
    why: 'Escaping chosen for element text does not always neutralise a value landing inside an attribute: the quote closes the attribute and the rest becomes new attributes. The qualifier matters, and it is measured rather than assumed — reading back the attributes an HTML parser actually assigns: a full escaper that also encodes `"` to `&quot;` (`he`, lodash `_.escape`, Handlebars) CONTAINS this inside a QUOTED attribute, leaving `value` the only attribute set. Those same escapers break out of an UNQUOTED attribute, where `autofocus` and `onfocus` land as new attributes — and so does an escaper handling only `<`, `>` and `&` inside a quoted one.',
    correct:
      "Choose the escaping by the position the value lands in — element text, attribute value, URL and script context are four different escapings.",
  },
  {
    id: "javascript-url",
    direction: "hostile",
    input: "javascript:alert(1)",
    why: "Escaping does nothing here because there is no markup to escape — the scheme itself is the payload, and the value is a perfectly well-formed href.",
    correct:
      "Allow-list URL schemes (`http`, `https`, `mailto`) for href and src; reject everything else.",
  },
  {
    id: "mustache-interpolation",
    direction: "hostile",
    input: "{{constructor.constructor('return process')()}}",
    why: "Server-side template injection: the value is compiled as template source rather than substituted as data. In an EXPRESSION-EVALUATING renderer (Angular, Vue, Jinja-style) it runs in the renderer's own scope with the renderer's own privileges — measured, the equivalent in a JavaScript template literal returns `process.version`. Logic-less renderers read `{{a.b}}` as a lookup path rather than an expression, and the disagreement between them is measured too: Mustache renders empty, while Handlebars refuses to compile it at all (`Parse error ... Expecting 'ID', got 'INVALID'`). That the same string is remote code execution in one renderer, empty output in a second and a parse error in a third is the reason to test it rather than reason about it.",
    correct:
      "Never compile user data as template source. Pass it as a value to an already-compiled template.",
  },
  {
    id: "template-literal",
    direction: "hostile",
    input: "${process.env.SECRET}",
    why: "The same class in JavaScript template literals and expression languages: a value interpolated into code rather than into output reads whatever the surrounding scope can see.",
    correct:
      "Never build a template literal or expression from user data; bind it as a parameter.",
  },
  {
    id: "ampersand-text",
    direction: "legitimate",
    input: "Tom & Jerry",
    why: "Must survive. A filter that strips `&` to prevent entity tricks silently corrupts ordinary names, and the corruption is visible only to the reader.",
    correct:
      "Escape to `Tom &amp; Jerry` in the markup, which displays as `Tom & Jerry`. Escape, do not strip.",
  },
  {
    id: "angle-in-text",
    direction: "legitimate",
    input: "5 < 10",
    why: "A less-than sign in prose is not markup. Stripping `<` to stop the script tag above also mangles arithmetic, comparisons and generics.",
    correct: "Escape to `5 &lt; 10`, which displays as `5 < 10`.",
  },
  {
    id: "https-link",
    direction: "legitimate",
    input: "https://example.com/a?b=c",
    why: "The scheme allow-list that stops `javascript:` must still pass this, query string and all. A URL validator strict enough to reject `?b=c` breaks ordinary links.",
    correct:
      "Accept and render as a working link, attribute-escaping the value inside the href.",
  },
]);

const CORPUS = Object.freeze({
  "url-authority": URL_AUTHORITY,
  "sql-orm": SQL_ORM,
  "shell-exec": SHELL_EXEC,
  path: PATH,
  "template-render": TEMPLATE_RENDER,
});

/**
 * The frozen cases for one sink.
 *
 * An unknown sink THROWS rather than returning `[]`. A typo that returned an
 * empty array would produce a probe executing zero candidates and reporting no
 * findings — indistinguishable from a boundary that held, which is the exact
 * failure the `probes_executed` counter exists to catch. Throwing makes the
 * typo loud at the call site instead.
 *
 * @param {string} sink one of SINKS
 * @returns {ReadonlyArray<Readonly<object>>} frozen cases, both directions
 */
export function corpusFor(sink) {
  const known = Object.prototype.hasOwnProperty.call(CORPUS, sink);
  if (!known) {
    throw new Error(
      `Unknown sink "${sink}". Known sinks: ${SINKS.join(", ")}. ` +
        "A sink returning no cases would report a clean probe, so this throws " +
        "rather than yielding an empty corpus.",
    );
  }
  return CORPUS[sink];
}

/** Every case across every sink, in SINKS order. Memoised, so the freeze is shared. */
let _all;
export function allCases() {
  return (_all ??= Object.freeze(SINKS.flatMap((sink) => corpusFor(sink))));
}

// ---------------------------------------------------------------------------
// Rendering — ONE implementation, used by the prose peer and by its parity test
// ---------------------------------------------------------------------------
// security-input-corpus.md's case tables are this function's output, verbatim.
// The parity test asserts that, so the document cannot drift from the module and
// there is no second renderer to keep in step. Regenerate the document's
// "## The cases" body with:
//
//   cd shared/resources
//   node -e 'import("./security-input-corpus.mjs")
//     .then((m) => process.stdout.write(m.renderCorpusTables()))'

/** Control characters rendered visibly, because a table cannot carry them. */
const CONTROL = Object.freeze({
  "\n": "␊",
  "\r": "␍",
  "\t": "␉",
  "\0": "␀",
});

/**
 * Render one case's `input` for a markdown table cell — literally, so a reader
 * sees the bytes the module supplies rather than a JSON-escaped rewrite of them.
 * Only `|` is escaped (it would end the cell) and control characters are shown
 * with a visible glyph, which the document's legend names.
 */
export function renderInput(input) {
  if (input === "") return "_(empty string)_";
  const shown = [...input]
    .map((ch) => CONTROL[ch] ?? ch)
    .join("")
    .replace(/\|/g, "\\|");
  const fence = shown.includes("`") ? "``" : "`";
  const pad = shown.startsWith("`") || shown.endsWith("`") ? " " : "";
  return `${fence}${pad}${shown}${pad}${fence}`;
}

/**
 * Escape a prose cell for a markdown table.
 *
 * `why` and `correct` are prose ABOUT shell and path syntax, so they quote `|`
 * routinely — `>|`, `||`. An unescaped one ends the cell and the row renders
 * with the wrong number of columns. Two rows shipped that way before a
 * structural check caught it: renderRow escaped the input column and not these.
 */
const escapeCell = (text) => text.replace(/\|/g, "\\|");

/** Render one case as its markdown table row. */
export function renderRow(c) {
  return `| ${renderInput(c.input)} | ${escapeCell(c.why)} | ${escapeCell(c.correct)} |`;
}

/** Per-sink prose that heads each table group in the document. */
const SINK_BLURB = Object.freeze({
  "url-authority":
    "A URL or DSN parser deciding **where a connection goes**. The through-line: authority delimiters are silent. A misplaced one does not raise; it re-points the connection and drops whatever followed. Several cases below behave differently in a spec-compliant parser than in a hand-rolled one, and each says which — that difference is itself the hazard.",
  "sql-orm":
    "A SQL engine deciding **what statement to run**. Almost every hostile case here has the same `correct` handling — bind the value as a parameter — and that is the point: one control answers the whole class, and hand-written escaping is the defect rather than the fix.",
  "shell-exec":
    "A shell deciding **what command to run**. The 27 hostile cases are measured, not invented: 14 from `task.67.bug.3` and 13 from `bug.6`, replayed verbatim in `evals/shared/tests/snippet-classifier-fail-open-replay.test.mjs`. Every one got past a classifier that looked correct on inspection. The common shape: the string a scanner reads is not the command the shell runs.",
  path: "A filesystem API deciding **which file to open**. Note how many of the hostile cases defeat a check that is lexically correct — the disagreement is between the string and the kernel.",
  "template-render":
    "A renderer deciding **what markup a value becomes**. The escaping is not one function: element text, attribute value, URL and script context are four different ones, and choosing by position is the control.",
});

/**
 * The document's "## The cases" body, generated from the corpus.
 *
 * Pure — returns a string, writes nothing. The counts in each group's heading
 * are computed here rather than hand-written, so they cannot go stale when a
 * case is added.
 */
export function renderCorpusTables() {
  let out = "";
  for (const sink of SINKS) {
    const cases = corpusFor(sink);
    const groups = DIRECTIONS.map((d) => [
      d,
      cases.filter((c) => c.direction === d),
    ]);
    const [[, hostile], [, legit]] = groups;
    out += `### \`${sink}\`\n\n${SINK_BLURB[sink]}\n\n`;
    out += `**${hostile.length} hostile, ${legit.length} legitimate.**\n\n`;
    for (const [direction, group] of groups) {
      const heading =
        direction === "hostile"
          ? "Hostile — must not be accepted"
          : "Legitimate — must still be accepted";
      out += `#### ${heading}\n\n`;
      out +=
        "| Input | Why | What a correct implementation does |\n|---|---|---|\n";
      for (const c of group) out += `${renderRow(c)}\n`;
      out += "\n";
    }
  }
  return out;
}

export default corpusFor;
