---
name: explain-simply
description: >
  Explain any topic to someone who knows nothing about it, as a published HTML
  artifact of big pictures and few words. Use when the user asks to explain
  something simply, explain like I'm five, ELI5, dumb it down, explain to a
  beginner, "I know nothing about X", "pretend I'm five", or asks for a visual
  explainer or illustrated explanation. Produces a scrolling storyboard of
  hand-drawn inline SVG panels, one idea per panel, held together by a single
  analogy, with captions of twelve words or fewer. Depth follows the asker's own
  words — "like I'm five" builds a short one, "in detail" builds a thorough one —
  and every panel also carries a foldaway paragraph with the real names, paths and
  values for a reader who wants them. Works on general topics and on code in the
  current repository.
---

# Explain Simply

Turn a question into a picture book: a scrolling storyboard of big SVG diagrams,
each carrying one idea, each captioned in a dozen words or fewer.

The hard part is not the HTML. It is resisting the pull toward a normal technical
answer set in a large font. The rules below exist to stop that.

## The six rules

1. **One idea per panel.** A panel with two ideas is two panels.
2. **The picture explains; the caption confirms.** If the words carry the meaning
   and the picture just decorates, the panel has failed.
3. **One analogy, held all the way down.** Never swap metaphors mid-storyboard.
4. **The analogy is the frame, not the answer.** It makes the shape graspable; it
   does not excuse leaving the real thing unnamed. If the reader asked how a system
   works and finishes unable to name its parts, the storyboard failed no matter how
   pretty it was. Name the parts, in the system's own words, inside the pictures.
5. **Simplified is not the same as wrong.** Reduce, defer, use analogy — never say
   something false because it is easier to say.
6. **Few words is not few facts.** Twelve words per caption, words a ten-year-old
   uses — but a picture with eight labelled boxes is still few words. Cut syllables,
   never substance.

## Workflow

### Step 1 — Take the question, and read the depth off it

The invocation argument is the question. With no argument, ask what to explain.

Ask at most one clarifying question, and only when the topic is genuinely two
different topics (`explain rendering` — browser or 3D?). Otherwise take the common
reading and go.

**Resolve the level from the asker's own words.** Do not ask which they want — the
phrasing already says it, and a depth prompt on a one-shot command is friction.

| Level | The question sounds like |
| ----- | ----------------------- |
| `peek` | "like I'm five", "to my mum", "just the gist", "very simply", "in one minute" |
| `standard` *(default)* | a bare "how does X work" — nothing in the phrasing pulls either way |
| `deep` | "in detail", "properly", "I need to work on this", "walk me through", `--deep` |

An explicit instruction always beats the inference. Announce the resolved level in
one line before building, so a wrong guess is cheap to correct:
`Building at **standard** depth — say "deeper" or "simpler" to change it.`

### Step 2 — Get the grown-up answer right first

Choose the source deliberately:

| The question is about… | Source |
| ---------------------- | ------ |
| Code in this repository | `Read` / `Grep` the actual files — never infer from a filename |
| A stable concept (HTTP, mortgages, photosynthesis) | Own knowledge |
| Anything version-specific, recent, or contested | `WebSearch` |

Write 5–8 true sentences — the answer as told to an adult who knows the field.
Everything downstream is a reduction of *this*. **Simplify a correct answer; never
invent a simple-sounding one.** This step is the anti-hallucination gate.

**Keep these sentences. Do not discard them after reducing.** They are the detail
layer: in Step 6 each one is attached to the beat it belongs to, so the reader who
wants the real version can unfold it. Writing them is work already required — the
only change is not throwing them away. Where a beat has no sentence yet, the
research was thinner than the storyboard pretends; go back and get it.

### Step 3 — Cut the spine

- **Hook** (1 panel) — what this thing is, in the most everyday terms available.
- **Middles** — how it works, in causal order. Each middle must be the reason the
  next one makes sense.
- **Payoff** (1–2 panels) — why anyone cares. What breaks without it.

One beat = one idea = one panel. Split any beat that carries two.

**The beat count comes from the subject, not from a target.** Count the parts
first, then count the panels — never the reverse. A single concept (compound
interest, how a lock works) lands in 6–10. A system runs to 20 and beyond: an
eight-step pipeline with two gates and a half-dozen crash-recovery mechanisms is
twenty-odd beats however you slice it, and cramming it into 9 is what turns a
storyboard into a shrug. Length is cheap — the reader scrolls. Vagueness is not.

**Coverage is what the level changes.** It is fixed at build time — unlike the
detail layer, a reader cannot unfold a panel that was never drawn.

| Level | Coverage |
| ----- | -------- |
| `peek` | 5–8 panels. Every part still **named**, but gathered into one overview panel instead of a panel each. |
| `standard` | The overview panel, then one panel per part that carries weight. |
| `deep` | All of standard, plus the failure modes, the harness, and the edge behaviour — what happens when it breaks, not only when it works. |

`peek` shortens the storyboard; it never un-names the parts. Rule 4 holds at every
level, and a `peek` that says "it has eight steps" and names none of them is the
original failure wearing a smaller hat.

**A beat that is a list of N named things is the trap.** "It has eight steps" is not
a beat, it is a beat refusing to happen. Two honest ways to spend it:

- **One panel, all N named** — the picture carries every name and the shape they
  form. Right when the list is the point and the individual items are self-evident.
- **One panel per item that carries weight** — after an overview panel showing the
  whole chain. Right when items differ in kind, or when two of them are where all
  the interesting behaviour lives.

Never a single panel that says "there are eight of them" and names none.

### Step 4 — Choose one controlling analogy

Physical, everyday, and able to survive every panel. Test it against all the beats
before committing — an analogy that collapses at beat 4 is the wrong analogy.

Note privately where it breaks. If the break matters, spend the last panel saying
so plainly ("Real X is not really a Y, but it acts like one here").

### Step 5 — Draw the panels

Load the `artifact-diagramming` skill, then work from
[`references/svg-idioms.md`](references/svg-idioms.md) — container, arrow chain,
before/after, split in two, stack, lock and key.

- **Label as many parts as the mechanism turns on — there is no ceiling.** Eight
  named stations if there are eight. `artifact-diagramming` is explicit that forced
  minimalism is a failure: a box labelled "cache" says less than the prose, and a row
  of unlabelled boxes says less again. The real limits are legibility at phone width
  and one idea per panel.
- **Use the system's own words for the labels.** `branch`, `review`, `QA`, `fix` —
  the names the reader will meet again in the docs and the terminal. This is where
  the storyboard earns its keep: a name introduced inside a picture is a name the
  caption can then use for free.
- Thick strokes, flat fills, generous whitespace.
- Colour only from the template's CSS custom properties, so both themes hold.
- Label the arrows that mean *different* things, not every arrow. A plain chain is
  one meaning; a backwards loop or a conditional branch beside it is a second, and
  that one gets the label.

### Step 6 — Write the words

Load [`references/writing-rules.md`](references/writing-rules.md) for the voice
spec, the banned moves, and worked Input/Output reductions.

Hard budget: **12 words per caption**. The budget is on syllables, not on content —
when a caption will not fit, the panel holds two ideas, so split it.

**Name the real things.** A term the reader asked about is not jargon, it is the
answer, and the picture is where it gets introduced. Once a picture has shown what
`qa-fix` is, later captions may say `qa-fix`. What stays banned is unearned
vocabulary — a term that appears in a caption without a picture ever showing it.

#### Two registers

Every panel gets both. The caption is the picture book; the detail is the manual.

| | Caption | Detail |
| --- | ------- | ------ |
| Length | ≤ 12 words | 1–3 sentences |
| Vocabulary | words a ten-year-old uses | the system's real terminology |
| Carries | the one idea | exact names, paths, values, the caveat the caption dropped |

The detail text comes from the Step 2 sentences, one attached to each beat. It is
allowed everything the caption bans — a subordinate clause, a file path, an exact
value, a proper noun.

> **Caption:** Station five reads the work and writes pass or fail.
>
> **Detail:** `qa-story` writes a gate file — `PASS`, `CONCERNS`, `FAIL` or
> `WAIVED`. Dev skills may read it but never write it; only QA skills mutate gate
> files.

**The detail never rescues a vague caption.** It is additional, not compensatory.
A caption that only makes sense once the detail is unfolded is a broken caption, and
shipping it re-opens the exact failure this skill was rewritten to fix. Write the
captions as though the detail layer did not exist, then add it.

### Step 7 — Assemble

Load the `artifact-design` skill (required before writing any artifact), then copy
[`assets/storyboard-template.html`](assets/storyboard-template.html) and fill in the
panels. Write to the scratchpad directory unless the user named a path.

**The template ships a placeholder greyscale palette and a placeholder font stack.
Replace both.** Draw the palette from the topic's own world — the materials,
surfaces and inks the subject is made of — and pair a display face for the captions
with a plain one for labels and the note. A page that publishes in the placeholder
greys has skipped the design pass. Keep the token *names* (`--es-ink`,
`--es-accent`, …); the idioms and the panel CSS both read them.

Each panel carries its detail in the template's `<details class="es-detail">` block.
At `deep`, add the `open` attribute to every one; at `peek` and `standard` leave them
closed. The template's floating pill toggles them all at once, and works without its
script — every `<summary>` is still clickable on its own.

Do not add `<!doctype>`, `<html>`, `<head>`, or `<body>` tags — the publisher wraps
the file.

### Step 8 — Publish

Call `Artifact` with the file path, a short noun-phrase `<title>` naming the topic
(not a summary), a one-line `description`, and a topic emoji `favicon`.

**Fallback:** if the `Artifact` tool is not available, write the HTML to disk and
give the user the path. Do not fail, and do not degrade to a plain-text answer.

## Before publishing, check

- **Could the reader now name the parts?** Ask it of the actual question they asked.
  If the answer is "they know it has stages but not what any of them are", the
  storyboard explained the analogy and not the subject. This is the failure mode that
  matters most — check it first.
- Hide every caption. Do the pictures alone still tell the story?
- Any panel carrying two ideas?
- Any beat that says "there are N of them" without naming them?
- Any word a ten-year-old would stumble on? Any term used before a picture showed it?
- Any statement that is *wrong* rather than merely *incomplete*?
- Is it one analogy the whole way down?
- Does the panel count match the subject? Count the parts you found in Step 2 and
  check each one got a panel or a label. A number left over is a gap.
- **Hide every detail block. Does it still pass the name-the-parts test?** If the
  storyboard only works unfolded, the captions are doing too little.
- Does the level match what was actually asked for, and was it announced?
- At `deep`, is every `<details>` marked `open`? At `peek` and `standard`, closed?
- Is the palette still the template's placeholder grey?

Fix what fails before publishing, not after.
