# Writing Rules

The voice spec for `explain-simply` captions. Load this at Step 6.

## The budget

| Element | Limit |
| ------- | ----- |
| Caption | 12 words, hard ceiling. Aim for 6–9. |
| Sentences per caption | 1. Two only when the second is three words or fewer. |
| Panel title (optional) | 4 words |
| Syllables | Prefer one and two. A three-syllable word needs a reason. |
| Whole storyboard | 6–10 panels for one concept; 12–18 for a system with named parts, a loop and failure modes |

If a caption will not fit in twelve words, the panel holds more than one idea. Split
it — do not compress it.

## Sentence shapes that work

- **Subject, verb, object.** "The lock only opens with your key."
- **Then this happens.** "Now the letter travels down the wire."
- **Direct address.** "You never see this part."
- **The blunt fact.** "Nobody else can read it."

## Banned moves

| Banned | Why |
| ------ | --- |
| "essentially", "basically", "simply", "just" | Filler that signals simplification instead of doing it |
| "under the hood", "behind the scenes" | Dead metaphor; costs a word and adds nothing |
| Nested clauses, semicolons, em dashes | One thought per caption means one clause |
| Parentheses | An aside is a second idea, so it is a second panel |
| Three-item lists | Rhythm of an essay, not of a picture book |
| An acronym without its own panel | TLS, API, DNS all need a picture before a name |
| A count standing in for the things counted | "eight steps", "several checks" — name them or draw them |
| "imagine that…" | The picture is already the imagining |
| Numbers with more than two digits | Round them, or draw them |

## Analogy rules

- **Physical and everyday.** Post, locks, boxes, queues, kitchens, roads, libraries.
  Nothing that itself needs explaining.
- **One per storyboard.** Mixing metaphors is the most common failure mode: a topic
  starts as a post office and becomes a nightclub by panel five.
- **Test before committing.** Walk the analogy through all 6–10 beats. If it dies at
  beat 4, pick another.
- **Declare the break.** Every analogy is wrong somewhere. If the wrongness would
  mislead, say it in the final panel — plainly, in the same short words.
- **The analogy names things.** Once the envelope is an envelope, it stays the
  envelope in every later caption.

## Worked reductions

### Input (grown-up)

> TLS uses an asymmetric key exchange to establish a shared symmetric session key,
> after which all application data is encrypted with that session key.

### Output (four panels)

1. `You and the shop need one shared secret.` — two figures, gap between them
2. `You send a locked box only they can open.` — container idiom
3. `Inside is the secret you both will use.` — box opening, key inside
4. `Now every message is locked with it.` — arrow chain, each arrow carrying a lock

### Input

> A database index is a separate data structure that maps column values to row
> locations, trading write cost and storage for read speed.

### Output (three panels)

1. `Finding one page means reading the whole book.` — stack idiom, a thick book
2. `The index at the back lists every page.` — before/after, book beside index
3. `Faster to find. Slower to write. More shelf space.` — split in two

### Input

> Compound interest accrues on both the principal and previously accumulated
> interest, producing exponential rather than linear growth.

### Output (three panels)

1. `Your money earns a little more money.` — one coin, small arrow to two
2. `Next year, that new money earns too.` — arrow chain, stack growing
3. `The pile grows faster the longer you wait.` — before/after, two piles

### Input

> The scheduler preempts the running thread when its time slice expires, saving
> register state to the thread control block before context switching.

### Output (three panels)

1. `The computer runs one job at a time.` — container, single worker
2. `A timer taps it on the shoulder.` — split in two, clock
3. `It writes down where it stopped, then swaps.` — before/after, notepad

Notice what every Output does: it drops the true-but-unhelpful nouns, keeps the
causal order exactly, and never states anything the Input contradicts.

## Naming the real thing

Short captions and vague captions are not the same thing, and the difference is
where this skill lives or dies.

The reader asked about something with a name. That name is not jargon — it is the
answer — and the picture is where it gets introduced. Once a panel has *shown* what
`qa-fix` does, later captions spend the word `qa-fix` for free, because it now points
at a picture the reader has seen.

| Vague | Named |
| ----- | ----- |
| "Eight stations, each doing one job." | "Eight stations. QA and fix pass work back and forth." — with all eight labelled in the picture |
| "Helpers do the heavy reading." | "Helpers read the test logs and bring back one page." |
| "It asks you two questions first." | "It asks which branch to build on, and where to merge." |

Each Named version costs the same twelve words. The difference is entirely in what
the picture beneath it is willing to carry.

**The test:** after reading, could the reader name the parts? Not define them, not
use them — just name them, and say roughly what each is for. If not, the storyboard
explained the analogy instead of the subject.

## The detail register

Every panel carries a second, foldaway paragraph. It is a different voice from the
caption, and most of the caption's banned moves are legal here.

| | Caption | Detail |
| --- | ------- | ------ |
| Length | ≤ 12 words | 1–3 sentences |
| Sentences | 1 | up to 3 |
| Vocabulary | a ten-year-old's | the system's own |
| Subordinate clauses | banned | fine |
| File paths, flags, exact values | banned | expected |
| Acronyms | need a picture first | fine, expanded once |

What stays banned in both: hedging ("essentially", "basically"), apology, and
padding. The detail is denser than the caption, not woollier.

Its text comes from the Step 2 sentences — the grown-up answer, split across the
beats. If a beat has no sentence waiting for it, the research was thinner than the
storyboard is pretending; go back to Step 2 rather than improvising prose.

### Paired examples

> **Caption:** Station five reads the work and writes pass or fail.
>
> **Detail:** `qa-story` writes a gate file — `PASS`, `CONCERNS`, `FAIL` or
> `WAIVED`. Dev skills may read it but never write it; only QA skills mutate gate
> files.

> **Caption:** After five rounds it stops and calls you in.
>
> **Detail:** The QA↔fix loop is bounded at `MAX_ITER=5`. On the fifth failed cycle
> the pipeline commits the implementation report, snapshots and removes the lock,
> and halts with the report path in the message.

> **Caption:** The lock means one job on the line at once.
>
> **Detail:** `.claude/state/develop-pipeline.lock` is a single shared path, so only
> one pipeline runs per repository. It is written at the *end* of Step 1 — before
> the branch exists there is nowhere safe to commit, so a hook firing in that window
> deliberately does nothing.

Notice the shape: the caption is a true, complete thought on its own, and the detail
adds the names and the numbers rather than supplying the meaning.

### The rule that keeps this honest

**A caption that only makes sense once the detail is unfolded is a broken caption.**
Write every caption as though the detail layer did not exist. Check them with the
details hidden. The layer is a bonus for the curious reader, never a place to park
the explaining the captions should have done.

## Failure smells

- The caption would work with the picture removed → picture is decoration.
- The caption reads like a bullet from a slide deck → too many nouns.
- Two panels could be swapped without loss → they are not causally ordered.
- A reader would ask "wait, what is that?" → an unintroduced term slipped in.
- The last panel restates the first → no payoff was found.
- The analogy is vivid and the subject is a blur → the frame ate the answer.
- A caption contains a number that no picture shows → a count standing in for content.
- The caption reads as a teaser for its detail block → the meaning moved into the fold.
