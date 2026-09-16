---
name: security-input-corpus
description: The inputs already known to defeat each sink, stated once — what a sink is, the ordering of methods that establish whether a control holds, and per-sink cases carrying the input, why it is dangerous, and what a correct implementation does to it. Machine-readable peer: references/security-input-corpus.mjs.
---
<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/security-input-corpus.md. Regenerate via `npm run bundle`. -->

# Security input corpus

> **A list of hostile inputs tells a probe what to try. It does not tell it what a
> pass looks like.** Every case here carries `why` (what goes wrong) and `correct`
> (what a right implementation does to it), so the corpus can be used as an oracle
> rather than as a checklist.

Machine-readable peer: [`references/security-input-corpus.mjs`](security-input-corpus.mjs)
— `SINKS`, `corpusFor(sink)`, and a frozen case shape. The two files carry the same
cases; this one argues, that one is imported.

---

## What a sink is

A **sink** is a place where a value constructed from parts the code does not control
is handed to a parser or interpreter that assigns it meaning.

The definition has three moving parts, and all three must hold:

1. **Construction from uncontrolled parts.** A literal string in the source is not a
   sink. A string built from a config value, an environment variable, a database
   row, or a user field is.
2. **A hand-off.** The value crosses out of the code that built it into something
   else — a URL parser, a SQL engine, a shell, a filesystem API, a template renderer.
3. **Assignment of meaning.** The receiver does not treat the value as opaque bytes.
   It *parses* it, and the parse decides what the value does. `evil.example.com/x`
   is not a host with a slash in it; it is a host and a path, and the port that used
   to follow is gone.

What is **not** a sink: a value that is only compared, hashed, logged, or stored and
read back as bytes. Nothing parses it, so there is nothing to confuse.

Naming a sink is what makes a probe addressable — a hostile input tested against the
wrong parser proves nothing about either.

---

## The method ordering

Four ways to establish that a control holds, strongest first. **Use the strongest
one available, and record which one you used** — a verdict is only as good as the
method behind it.

| Rank | Method | What it establishes | What it cannot see |
|---|---|---|---|
| 1 | **Execute the property against a hostile input** | The control's actual behaviour on that input | Only the inputs you ran |
| 2 | **Read the dependency's own source** for the condition that activates the control | Whether the control is reachable at all in this configuration | Whether the caller reaches that path |
| 3 | **Mutate the control and re-run the tests** | That some test names this behaviour | Nothing about behaviour no test names |
| 4 | **Grep for the control** | That the control is *present* | Whether it is *engaged* |

**Grep is last because presence is the thing that misleads.** A deny-list can be
present, well-formed, and complete-looking while still being permeable to an input
nobody thought to write down. Every case in this corpus is an input that got past
something that looked right.

Method 3 has a measured limit worth restating: on `task.67`, nine mutation proofs
were recorded and four independently re-run in QA — all four held, while thirteen
fail-open routes sat in the shipped classifier. Every proof was honest. Not one
could have found the thirteen. See
[`references/mutation-proving.md`](mutation-proving.md).

---

## Both directions, always

Each sink carries cases in two directions:

- **`hostile`** — input that must **not** be accepted (or must be neutralised).
- **`legitimate`** — input that must **still be accepted**.

The second is not a courtesy. An implementation that closes a hole by refusing
everything passes a hostile-only corpus perfectly, and is also a defect. Without
the accept direction, an over-strict boundary and a correct one produce identical
output. `legitimate` is a **schema requirement** in the machine-readable peer —
the test suite asserts every sink has at least one — which is the difference
between an instruction a model may skip and a guarantee.

---

## The cases

Each sink below lists every case in the machine-readable peer, in the same order,
with the same wording. **This section is generated** — it is the verbatim output of
`renderCorpusTables()` in the module, and a test asserts the document contains
exactly that. Adding a case to one and not the other turns it red, and there is no
second renderer to keep in step. Regenerate with:

```sh
cd shared/resources
node -e 'import("./security-input-corpus.mjs")
  .then((m) => process.stdout.write(m.renderCorpusTables()))'
```

That guard is the whole reason it is safe to write the cases out twice; without it
this document would become the third stale copy the corpus exists to prevent.

To read a case as an oracle: `input` is what to send, `why` is what goes wrong if
the sink accepts it (or, for a `legitimate` case, why an over-strict implementation
wrongly refuses it), and **what a correct implementation does** is the expected
behaviour a probe compares against.

**Reading the Input column.** Inputs are rendered literally — the bytes the module
supplies, not a JSON-escaped rewrite of them. Only `|` is escaped, and control
characters are shown with a visible glyph: `␊` newline, `␍` carriage return,
`␉` tab, `␀` NUL. Take the bytes from the module, not from this table.

### `url-authority`

A URL or DSN parser deciding **where a connection goes**. The through-line: authority delimiters are silent. A misplaced one does not raise; it re-points the connection and drops whatever followed. Several cases below behave differently in a spec-compliant parser than in a hand-rolled one, and each says which — that difference is itself the hazard.

**9 hostile, 3 legitimate.**

#### Hostile — must not be accepted

| Input | Why | What a correct implementation does |
|---|---|---|
| `evil.example.com/x` | A `/` ends the authority, so everything after it becomes a path — and a port that followed the host is silently lost. No error is raised: the connection goes to a different host on the default port. | REJECT a host component containing `/`, `?`, `#`, `@` or whitespace, before the URL is built. Setting fields on a URL object is not sufficient here and must not be graded as a pass: `u.host = "evil.example.com/x"` on a URL with port 5432 silently yields host `evil.example.com`, port `5432` — the setter truncates at the `/` and raises nothing, which is the same re-pointing as concatenation with a cleaner-looking diff. |
| `db?sslmode=disable` | A `?` starts the query string, so what the author intended as a database-name path segment silently becomes a connection parameter — here one that turns TLS off. | Percent-encode the segment with encodeURIComponent so `?` becomes `%3F` and stays part of the name. |
| `a/b+c=d` | Generated secrets routinely contain the base64 alphabet. A spec-compliant parser rejects the raw form; a naive splitter lets the `/` terminate the authority so the remainder becomes a path — the credential is then both wrong and disclosed in a path that gets logged. | encodeURIComponent the credential before interpolation; never string-concatenate a secret into a DSN. |
| `p@ss` | In a hand-rolled DSN parser that splits userinfo at the FIRST `@`, a password containing one re-points the connection at a host named after the password's tail. A spec-compliant parser splits at the LAST `@` instead and percent-encodes the value — `new URL("postgres://u:p@ss@h/db")` gives password `p%40ss` and host `h`. The same input is therefore silently wrong in one parser and silently fine in the other, which is harder to find than either failure alone. | Percent-encode to `%40` before interpolation, so both parsers agree. |
| `pa:ss` | In the USERNAME position `:` starts the password, and in the HOST position it starts the port — a naive splitter truncates at it in both. In the PASSWORD position it is preserved: `new URL("postgres://u:pa:ss@h/db").password` is `pa%3Ass`. The truncation is position-dependent, which is what makes it easy to test in the wrong slot and conclude the value is safe. | Percent-encode to `%3A`, and test the value in the position it will actually occupy. |
| `secret#1` | `#` starts the fragment, which is never sent to the server. A spec-compliant parser rejects it in the userinfo position outright; a naive splitter accepts it and truncates the credential at the `#`, so the request goes out with a shortened secret and fails authentication far from its cause. | Percent-encode to `%23` before interpolation. |
| `[::1]` | `[::1]` is a valid IPv6 loopback literal, so it parses cleanly — and that is the hazard, not a parse failure. A host field carrying it re-points the connection at the machine running the code, reaching services bound to loopback precisely because they are unauthenticated. | Resolve the host and reject loopback, link-local and private ranges whenever the destination is meant to be external; emit brackets only around an actual IPv6 literal. |
| `exa mple.com` | Whitespace is not valid in an authority, and parsers variously strip, reject, or truncate at it — so the same configuration works in one library and silently addresses something else in another. | Reject the value explicitly. Do not trim silently: a trim turns a malformed input into a plausible one. |
| _(empty string)_ | Concatenation yields `scheme://:5432/db`. A spec-compliant parser rejects that outright — `new URL("postgres://:5432/db")` throws — but several driver-specific DSN parsers accept it and fall back to a default host. So a missing configuration value becomes a connection to the developer's own machine in exactly the parsers that do not raise. | Reject empty required components explicitly, before the string is built. Do not rely on the parser: its behaviour here differs by library, and the libraries that stay quiet are the dangerous ones. |

#### Legitimate — must still be accepted

| Input | Why | What a correct implementation does |
|---|---|---|
| `db.internal.example.com` | The ordinary case. A host allow-list narrow enough to reject an internal domain is the over-refusal this direction catches. | Accept unchanged. |
| `a%2Fb%2Bc%3Dd` | The correctly-encoded form of the base64 secret above. Refusing credentials containing `/` or `+` is an over-refusal — the fix is encoding, not rejection — and a validator that rejects the encoded form makes correct code impossible to write. | Accept, and decode back to exactly `a/b+c=d`. |
| `db.internal.example.com:5432` | A colon in the host position is legal and load-bearing. A rule that bans `:` outright to stop the userinfo case above also bans every explicit port. | Accept, preserving host and port as separate components. |

### `sql-orm`

A SQL engine deciding **what statement to run**. Almost every hostile case here has the same `correct` handling — bind the value as a parameter — and that is the point: one control answers the whole class, and hand-written escaping is the defect rather than the fix.

**7 hostile, 3 legitimate.**

#### Hostile — must not be accepted

| Input | Why | What a correct implementation does |
|---|---|---|
| `'` | Terminates a concatenated string literal, so the remainder of the value is parsed as SQL rather than as data. | Bind the value as a parameter. The driver sends it out-of-band from the statement text, so no quoting is involved and none can be got wrong. |
| `' OR '1'='1` | Closes the literal and appends a predicate that is always true, turning a single-row lookup into a full-table read. | Bind the value as a parameter; the whole string becomes one comparison operand. |
| `--` | Comments out the rest of the statement, including any trailing `AND tenant_id = ?` that was carrying the authorisation. | Bind the value as a parameter. |
| `; DROP TABLE users; --` | Ends the statement and starts another. Whether the second one runs depends on whether the driver has multi-statement execution enabled — a setting the calling code usually does not know. | Bind the value as a parameter, and leave multi-statement execution off. |
| `\'` | Backslash escaping is engine- and mode-dependent (MySQL's NO_BACKSLASH_ESCAPES changes it outright), so a hand-written escaper correct against one engine is wrong against another — and against the same engine differently configured. | Bind the value as a parameter. Hand-written escaping is the defect, not the fix. |
| `＇` | U+FF07 FULLWIDTH APOSTROPHE is not U+0027, so a deny-list keyed on the ASCII quote does not see it. Whether it then BECOMES an apostrophe depends on the conversion, and the conversions disagree — measured: `iconv -f UTF-8 -t CP1252` folds it to the byte 0x27 and NFKC normalisation yields U+0027, while Node's latin1 conversion yields 0x07 and MySQL's utf8mb4→latin1 substitutes `?`. The deny-list is defeated in every case; the escalation to injection needs a folding conversion specifically. | Bind the value as a parameter. Character deny-lists cannot enumerate Unicode; parameterisation does not need to. |
| `%` | Parameter binding makes this safe as data and still leaves it a wildcard: inside a LIKE it matches everything, so a filter meant to scope rows to one tenant matches all of them. Bound is not the same as inert. | Escape LIKE metacharacters (`%`, `_`, and the escape character) in the value in addition to binding it, and declare the ESCAPE clause. |

#### Legitimate — must still be accepted

| Input | Why | What a correct implementation does |
|---|---|---|
| `O'Brien` | The commonest over-refusal in this sink: input filters that strip or reject quotes to stop the cases above corrupt real names, and the corruption is silent. | Accept, bind, and read back byte-identical. |
| `50% off` | A literal `%` outside a LIKE context is ordinary text. A blanket wildcard-escape applied everywhere stores `50\% off` instead. | Accept and round-trip unchanged; escape LIKE metacharacters only where a LIKE is actually used. |
| `see note -- pending` | A double dash in a free-text field is prose, not a comment introducer. A deny-list on `--` rejects legitimate content. | Accept and round-trip unchanged. |

### `shell-exec`

A shell deciding **what command to run**. The 27 hostile cases are measured, not invented: 14 from `task.67.bug.3` and 13 from `bug.6`, replayed verbatim in `evals/shared/tests/snippet-classifier-fail-open-replay.test.mjs`. Every one got past a classifier that looked correct on inspection. The common shape: the string a scanner reads is not the command the shell runs.

**27 hostile, 4 legitimate.**

#### Hostile — must not be accepted

| Input | Why | What a correct implementation does |
|---|---|---|
| `who'am'i` | Quote removal rejoins the word to `whoami`, so a matcher comparing the raw token sees a command name that is on no list at all. | Compare the effective command word — after quote removal — not the literal token. |
| `to"u"ch /tmp/x` | Double quotes split the same way: the effective command is `touch`, which writes. | Apply quote removal before matching. |
| `t\ouch /tmp/x` | `\o` is just `o` after escape removal, so the effective command is `touch`. | Apply escape removal before matching. |
| `/usr/bin/[t]ouch /tmp/x` | Pathname expansion resolves `[t]ouch` to `touch`; the literal never equals the name a list is keyed on. | Treat glob metacharacters in a command word as unresolvable and deny, rather than matching the unexpanded literal. |
| `/usr/bin/touc? /tmp/x` | `?` matches any single character, so the expansion is `touch`. | Same as the bracket case: an unresolvable command word is a deny. |
| `~/../../usr/bin/whoami` | Tilde expansion followed by `..` traversal reaches an absolute path that a prefix check on `~/` is satisfied by and never sees. | Expand and normalise to a real path before deciding, then match on the result. |
| `g\h pr comment 1 --body x` | Escape removal yields `gh`, so a rule keyed on the tool name `gh` does not fire and an outbound write posts. | Apply escape removal before matching the tool name. |
| `cu'r'l -X POST https://x/` | Quote removal yields `curl`, and the request is a POST — a network write from a command that scanned as unknown. | Apply quote removal before matching. |
| `cat <<EOF > /tmp/x` | The write is in the redirection, not in the command word. `cat` inspects as read-only and the statement creates a file. | Parse redirections separately from the command word; any `>` or `>>` target is a write regardless of what precedes it. |
| `cat <<'EOF' >> ~/.zshrc` | The same shape, appending to a shell rc file — a persistent change that runs again in every future shell. | Treat `>>` as a write, and a write to a shell rc path as persistent, regardless of the command word. |
| `sed 's/a/b/' -i file.txt` | `-i` edits in place, and here it sits in trailing position — after the script operand — where a check that only inspects leading flags never looks. | Scan every argument position for write-capable flags, not just the leading run. |
| `sed -e 's/a/b/' -i file.txt` | The same trailing `-i`, now separated from the command by a flag that takes an operand — which is what makes a positional heuristic stop early. | Consume each flag's operand while scanning, and keep scanning to the end of the argument list. |
| `sort --output=/tmp/x file.txt` | `sort` reads as a read-only filter, and `--output=` writes a file. The write is in a flag the tool's reputation does not suggest. | Know the write-capable flags of every tool named by hand, in long and short form (`-o` and `--output`). |
| `git diff --output=/tmp/x` | `git diff` is the canonical read-only subcommand, and `--output=` makes it write. | Match on the (subcommand, flags) pair, not on the subcommand alone. |
| `if touch /tmp/x; then echo hi; fi` | A shell keyword occupies command position, so a parser reading the first word sees `if` and swallows the whole segment — never reaching the `touch` inside it. | Recurse into keyword-introduced compound commands and classify each contained command on its own. |
| `elif touch /tmp/x; then echo hi; fi` | The same escape through a different keyword; enumerating `if` alone leaves the rest reachable. | Recurse into every compound-command keyword, not a hand-picked subset. |
| `while touch /tmp/x; do break; done` | The loop condition is a command, and it runs — at least once — before the body is ever considered. | Classify the loop condition as a command in its own right. |
| `until touch /tmp/x; do break; done` | As `while`, with the sense inverted and the same command position unexamined. | Classify the loop condition as a command in its own right. |
| `case x in a) touch /tmp/x;; esac` | `case` puts commands after a pattern and a `)`, a position that whitespace tokenisation does not recognise as command-initial. | Parse the case-arm structure and classify each arm's commands. |
| `git -C log push origin main` | `-C` takes a directory operand. Reading the token after the flags as the subcommand yields `log` — read-only — when the real subcommand is `push`, which writes to a remote. | Consume each global flag's operand before reading the subcommand. |
| `echo pwned>/tmp/x` | No space before `>`, so whitespace tokenisation produces the single word `pwned>/tmp/x` and reports no redirection at all. | Tokenise redirection operators independently of whitespace — the shell does. |
| `cat README.md>/tmp/x` | The same gluing, now attached to a filename, which makes the resulting token look even more like an ordinary operand. | Split redirection operators out of every token before classifying. |
| `echo pwned>>/tmp/x` | The append form glued the same way; a scan that special-cases a spaced ` > ` misses both. | Handle `>`, `>>`, `>\|` and fd-prefixed forms as operators, not as text. |
| `echo "it's fine"; touch /tmp/x; echo "don't"` | The apostrophe inside a double-quoted string opens a single-quote span for a scanner that ignores which quote type is already open. The span it then blanks runs across the `touch`, deleting it from the scan. | Track quote state per character, recording the enclosing quote type; an apostrophe inside double quotes is a literal. |
| `echo "example: cat <<EOF"␊touch /tmp/x` | A heredoc marker inside a quoted string is text, not a heredoc. Treating it as one consumes the following real command as heredoc body and never classifies it. | Recognise heredoc operators only outside quoted spans. |
| `sed -n 's/a/b/w /tmp/x' README.md` | `sed` writes a file through the `w` flag inside the script — with neither `-i` nor a shell redirection to notice. | Parse the sed script itself, not only the tool's flags. |
| `sed 'w /tmp/x' README.md` | The bare `w` command form, which does not even carry a substitution to draw attention to the script. | Parse the sed script; treat `w` and `W` as writes wherever they appear in it. |

#### Legitimate — must still be accepted

| Input | Why | What a correct implementation does |
|---|---|---|
| `grep -o 'foo' README.md` | A blanket `-o means output file` heuristic refuses this. For grep, `-o` is `--only-matching`: it prints matched parts to stdout and writes nothing. | Resolve flag meaning per tool. Accept as read-only. |
| `find . -name a -o -name b` | The same heuristic refuses this one too. For find, `-o` is the boolean OR operator between predicates, not an output file. | Resolve flag meaning per tool. Accept as read-only. |
| `cat README.md` | The baseline. A classifier tightened until it refuses even this is passing the hostile half by refusing everything. | Accept as read-only. |
| `git status --short` | A read-only subcommand carrying a flag. A rule that denies any `git` invocation with flags — a tempting response to the `-C` case above — rejects this too. | Accept as read-only: the subcommand decides, and `--short` only changes formatting. |

### `path`

A filesystem API deciding **which file to open**. Note how many of the hostile cases defeat a check that is lexically correct — the disagreement is between the string and the kernel.

**8 hostile, 3 legitimate.**

#### Hostile — must not be accepted

| Input | Why | What a correct implementation does |
|---|---|---|
| `../secrets.env` | One level of traversal leaves the intended directory. The simplest case, and the one a containment check is usually written against. | Resolve against the root, then assert the result is inside the root before any filesystem call. |
| `../../../../etc/passwd` | Enough levels to reach the filesystem root from anywhere, so the depth of the intended directory provides no protection. | Resolve and assert containment. Do not count directory levels. |
| `/etc/passwd` | An absolute path discards the root when resolved — `path.join(root, '/etc/passwd')` keeps the root, but `path.resolve(root, '/etc/passwd')` does not, and which one the code used is easy to misread. | Reject absolute inputs explicitly, then resolve and assert containment. |
| `..%2f..%2fetc%2fpasswd` | The containment check sees no `/` and passes; a later decode — in a router, a client, or the code itself — re-introduces the traversal after the check has already run. | Decode fully before validating, and validate immediately before use. |
| `uploads/link-to-etc/passwd` | Every component is inside the root lexically, and the filesystem resolves `link-to-etc` somewhere else. A `path.resolve` check is satisfied by a string the kernel does not agree with. **This case needs filesystem setup to discriminate**: without the symlink present, a realpath-checking implementation and one that skips realpath return the same verdict, so the input alone proves nothing. | realpath the resolved path — following symlinks — and re-assert containment on the result. To probe it, first create the fixture: a directory `<root>/uploads` containing a symlink `link-to-etc` → `/etc`. Then a correct implementation rejects; one that only resolves lexically accepts. |
| `safe.txt␀.png` | An extension check passes on `.png` while syscall layers that truncate at NUL open `safe.txt`. The validated string and the opened file are different strings. | Reject any input containing a NUL before any filesystem call or extension check. |
| `../data-evil/x` | With root `/srv/data` this resolves to `/srv/data-evil/x`, which `startsWith('/srv/data')` accepts. The check passes on a sibling directory that merely shares a prefix. | Compare on a separator boundary — `resolved === root \|\| resolved.startsWith(root + path.sep)`. |
| _(empty string)_ | Resolves to the root itself, so an operation meant for one file targets the whole directory — a delete or a chmod then applies to everything under it. | Reject empty input explicitly; a containment check alone accepts it. |

#### Legitimate — must still be accepted

| Input | Why | What a correct implementation does |
|---|---|---|
| `reports/2026/q1.csv` | The ordinary case. A rule that bans every `/` to stop traversal also bans every subdirectory. | Accept, resolving to the file under the root. |
| `archive..2026.tar.gz` | A naive `input.includes('..')` check rejects a legal filename. Traversal is `..` as a whole path component, not `..` as a substring. | Accept. Decide on the resolved path, not on a substring search of the input. |
| `.gitkeep` | Dotfiles are legal filenames, and a rule rejecting any component that starts with `.` — written to stop `..` — takes them with it. | Accept. `.` and `..` are the two special components; nothing else beginning with a dot is. |

### `template-render`

A renderer deciding **what markup a value becomes**. The escaping is not one function: element text, attribute value, URL and script context are four different ones, and choosing by position is the control.

**6 hostile, 3 legitimate.**

#### Hostile — must not be accepted

| Input | Why | What a correct implementation does |
|---|---|---|
| `<script>alert(1)</script>` | The canonical case, and the one every deny-list is written against — which is exactly why it is a poor test on its own. | HTML-escape at render time so the value renders as text; never insert it as markup. |
| `<img src=x onerror=alert(1)>` | Executes without the string `script` appearing anywhere, so a deny-list keyed on `<script>` passes it through. | Escape rather than filter. An allow-list of tags, if markup is genuinely wanted, must allow-list attributes too. |
| `" autofocus onfocus=alert(1) x="` | Escaping chosen for element text does not always neutralise a value landing inside an attribute: the quote closes the attribute and the rest becomes new attributes. The qualifier matters, and it is measured rather than assumed — reading back the attributes an HTML parser actually assigns: a full escaper that also encodes `"` to `&quot;` (`he`, lodash `_.escape`, Handlebars) CONTAINS this inside a QUOTED attribute, leaving `value` the only attribute set. Those same escapers break out of an UNQUOTED attribute, where `autofocus` and `onfocus` land as new attributes — and so does an escaper handling only `<`, `>` and `&` inside a quoted one. | Choose the escaping by the position the value lands in — element text, attribute value, URL and script context are four different escapings. |
| `javascript:alert(1)` | Escaping does nothing here because there is no markup to escape — the scheme itself is the payload, and the value is a perfectly well-formed href. | Allow-list URL schemes (`http`, `https`, `mailto`) for href and src; reject everything else. |
| `{{constructor.constructor('return process')()}}` | Server-side template injection: the value is compiled as template source rather than substituted as data. In an EXPRESSION-EVALUATING renderer (Angular, Vue, Jinja-style) it runs in the renderer's own scope with the renderer's own privileges — measured, the equivalent in a JavaScript template literal returns `process.version`. Logic-less renderers read `{{a.b}}` as a lookup path rather than an expression, and the disagreement between them is measured too: Mustache renders empty, while Handlebars refuses to compile it at all (`Parse error ... Expecting 'ID', got 'INVALID'`). That the same string is remote code execution in one renderer, empty output in a second and a parse error in a third is the reason to test it rather than reason about it. | Never compile user data as template source. Pass it as a value to an already-compiled template. |
| `${process.env.SECRET}` | The same class in JavaScript template literals and expression languages: a value interpolated into code rather than into output reads whatever the surrounding scope can see. | Never build a template literal or expression from user data; bind it as a parameter. |

#### Legitimate — must still be accepted

| Input | Why | What a correct implementation does |
|---|---|---|
| `Tom & Jerry` | Must survive. A filter that strips `&` to prevent entity tricks silently corrupts ordinary names, and the corruption is visible only to the reader. | Escape to `Tom &amp; Jerry` in the markup, which displays as `Tom & Jerry`. Escape, do not strip. |
| `5 < 10` | A less-than sign in prose is not markup. Stripping `<` to stop the script tag above also mangles arithmetic, comparisons and generics. | Escape to `5 &lt; 10`, which displays as `5 < 10`. |
| `https://example.com/a?b=c` | The scheme allow-list that stops `javascript:` must still pass this, query string and all. A URL validator strict enough to reject `?b=c` breaks ordinary links. | Accept and render as a working link, attribute-escaping the value inside the href. |

---

## Using the corpus

The `.mjs` sits beside this file in both its source and bundled locations, so a
**sibling-relative** specifier resolves in both. A bare `references/...` or
`references/...` specifier does not — Node throws `ERR_MODULE_NOT_FOUND` — and a
probe script written in a temp directory needs an absolute path built from the
repo root:

```js
import {
  SINKS,
  corpusFor,
  allCases,
} from "./security-input-corpus.mjs";
// From a temp working directory a relative specifier cannot resolve. Do not
// guess the directory — this module ships beside the document you read, so use
// THAT path:
//   const { corpusFor } = await import(
//     pathToFileURL(join(docDir, "security-input-corpus.mjs"))
//   );

for (const c of corpusFor("shell-exec")) {
  const actual = classify(c.input); // the entry point under test
  // c.correct says what a right implementation does; c.direction says which
  // way the case runs. Count every candidate you execute, including the
  // legitimate ones — see finalise-dod-security-prompt.md step 4.
}
```

`corpusFor` **throws** on an unknown sink rather than returning `[]`. A typo
that returned an empty array would produce a probe executing zero candidates and
reporting no findings — which is indistinguishable from a boundary that held.
That is the exact failure `probes_executed` exists to catch, so the corpus
refuses to be the thing that hides it.

## What this corpus is not

- **Not a fuzzer.** It is a bounded, named set. Property-based testing and
  generated inputs are deliberately out of scope; a case earns its place by
  having defeated something.
- **Not a verdict.** It supplies inputs and their expected handling. Computing
  a verdict from a probe run belongs to the engine that executes them, not here.
- **Not closed.** The five sinks are a judgement and a sixth will be wanted.
  Adding one is a new key plus cases plus a row in the test's floor table —
  nothing depends on the set being complete.
- **Not exhaustive per sink.** A sink that held against all of these held
  against these. That is a real result and a bounded one; it is not proof that
  no other input gets through.

## See also

- [`finalise-dod-security-prompt.md`](finalise-dod-security-prompt.md) — the DoD
  security probe, which consumes this corpus as its candidate set
- [`mutation-proving.md`](mutation-proving.md) — method 3 above, and its measured
  limits
- [`qa-runnable-prose-detection.md`](https://github.com/Gamaroff/agent-skills/blob/develop/shared/resources/qa-runnable-prose-detection.md) — the
  prose-beside-mechanism precedent this pair follows
