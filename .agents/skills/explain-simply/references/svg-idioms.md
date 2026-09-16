# SVG Idioms

Six diagram patterns that cover almost every explanation. Copy one, rename the
labels, delete what you do not need. Load this at Step 5.

## House rules

- **viewBox `0 0 480 320`.** Every idiom uses it, so panels line up visually.
- **Colour comes only from tokens** — `var(--es-ink)`, `var(--es-fill)`,
  `var(--es-accent)`, `var(--es-accent-2)`, `var(--es-muted)`. Never a literal hex,
  or the diagram will disappear in one of the two themes.
- **`stroke-width="6"`**, `stroke-linecap="round"`, `stroke-linejoin="round"`.
- **No label ceiling — label what the mechanism turns on.** Eight named stations if
  the thing has eight stations. A row of unlabelled boxes says less than the prose it
  replaced, which is exactly the failure `artifact-diagramming` warns about. The
  binding limits are legibility at phone width and one idea per panel; a panel with
  many labels is fine when they are all the same kind of thing (the parts of one
  chain), and wrong when they are two kinds (parts *and* failure modes — that is two
  panels).
- **Labels use the system's own words.** `branch`, `review`, `QA`, `retry` — not
  invented stand-ins. The picture is where a real name gets introduced, which is what
  lets later captions use it without spending their twelve words on a definition.
- **Text at 22–28px**, `font-weight="600"`, `text-anchor="middle"`.
- **Always `role="img"` with an `<title>`** — the title is the alt text, and it is
  what a screen reader reads instead of the picture.
- **Label the arrows that mean different things.** Count meanings, not arrows. A
  plain left-to-right chain is one meaning — "then" — however many arrows draw it,
  and labelling each would be noise. The moment a second meaning enters the panel,
  every arrow that is not the default gets a word or two: a loop going backwards is
  `try again`, a dotted branch is `if needed`, a fan-out is `copy`. The default
  forward arrow can stay bare, because the labelled ones now define it by contrast.
  Labels are diagram furniture, not captions: they do not count against the caption's
  twelve words. Numbering a long chain is fine when the order is the point.
- **A repeated encoding needs no legend when it is self-evident.** The same accent
  square appearing on three cards reads as "the same thing, copied". A dashed
  stroke reads as nothing on its own — label it or drop it.
- Reuse the shared arrowhead marker; define it once per page, not per panel.

```html
<!-- once per page, inside the first svg -->
<defs>
  <marker id="ar" viewBox="0 0 10 10" refX="8" refY="5"
          markerWidth="5" markerHeight="5" orient="auto-start-reverse">
    <path d="M0 0 L10 5 L0 10 z" fill="var(--es-ink)"/>
  </marker>
</defs>
```

## 1. Container — a thing inside a thing

For encapsulation, packaging, wrapping, "what is actually in there".

```html
<svg viewBox="0 0 480 320" role="img" class="es-svg">
  <title>A small box sealed inside a larger box</title>
  <rect x="40" y="50" width="400" height="230" rx="24"
        fill="var(--es-fill)" stroke="var(--es-ink)" stroke-width="6"/>
  <rect x="150" y="120" width="180" height="100" rx="16"
        fill="var(--es-accent)" stroke="var(--es-ink)" stroke-width="6"/>
  <text x="240" y="178" text-anchor="middle" font-size="24" font-weight="600"
        fill="var(--es-ink)">your note</text>
  <text x="240" y="90" text-anchor="middle" font-size="24" font-weight="600"
        fill="var(--es-ink)">the envelope</text>
</svg>
```

## 2. Arrow chain — A sends to B sends to C

For requests, pipelines, steps in order, anything with a direction of travel.

```html
<svg viewBox="0 0 480 320" role="img" class="es-svg">
  <title>Three boxes connected left to right by arrows</title>
  <rect x="20" y="120" width="110" height="90" rx="16"
        fill="var(--es-fill)" stroke="var(--es-ink)" stroke-width="6"/>
  <rect x="185" y="120" width="110" height="90" rx="16"
        fill="var(--es-accent)" stroke="var(--es-ink)" stroke-width="6"/>
  <rect x="350" y="120" width="110" height="90" rx="16"
        fill="var(--es-fill)" stroke="var(--es-ink)" stroke-width="6"/>
  <path d="M140 165 H175" stroke="var(--es-ink)" stroke-width="6"
        stroke-linecap="round" marker-end="url(#ar)"/>
  <path d="M305 165 H340" stroke="var(--es-ink)" stroke-width="6"
        stroke-linecap="round" marker-end="url(#ar)"/>
  <text x="75"  y="250" text-anchor="middle" font-size="22" font-weight="600" fill="var(--es-ink)">you</text>
  <text x="240" y="250" text-anchor="middle" font-size="22" font-weight="600" fill="var(--es-ink)">the wire</text>
  <text x="405" y="250" text-anchor="middle" font-size="22" font-weight="600" fill="var(--es-ink)">the shop</text>
</svg>
```

## 3. Before / after — one divider, two states

For transforms, conversions, "what changed".

```html
<svg viewBox="0 0 480 320" role="img" class="es-svg">
  <title>A messy pile on the left, a neat stack on the right</title>
  <path d="M240 40 V280" stroke="var(--es-muted)" stroke-width="4"
        stroke-dasharray="10 12" stroke-linecap="round"/>
  <g fill="var(--es-fill)" stroke="var(--es-ink)" stroke-width="6">
    <rect x="40" y="90"  width="70" height="50" rx="10" transform="rotate(-12 75 115)"/>
    <rect x="110" y="150" width="70" height="50" rx="10" transform="rotate(9 145 175)"/>
    <rect x="55" y="200" width="70" height="50" rx="10" transform="rotate(-4 90 225)"/>
  </g>
  <g fill="var(--es-accent)" stroke="var(--es-ink)" stroke-width="6">
    <rect x="300" y="90"  width="120" height="50" rx="10"/>
    <rect x="300" y="150" width="120" height="50" rx="10"/>
    <rect x="300" y="210" width="120" height="50" rx="10"/>
  </g>
</svg>
```

## 4. Split in two — one input, two paths

For branching, decisions, yes/no, trade-offs.

```html
<svg viewBox="0 0 480 320" role="img" class="es-svg">
  <title>One path arriving and dividing into two</title>
  <circle cx="70" cy="160" r="44"
          fill="var(--es-accent)" stroke="var(--es-ink)" stroke-width="6"/>
  <path d="M120 160 H190 Q210 160 210 130 V95 H300" fill="none"
        stroke="var(--es-ink)" stroke-width="6" stroke-linecap="round"
        stroke-linejoin="round" marker-end="url(#ar)"/>
  <path d="M120 160 H190 Q210 160 210 190 V225 H300" fill="none"
        stroke="var(--es-ink)" stroke-width="6" stroke-linecap="round"
        stroke-linejoin="round" marker-end="url(#ar)"/>
  <text x="380" y="105" text-anchor="middle" font-size="24" font-weight="600" fill="var(--es-ink)">yes</text>
  <text x="380" y="235" text-anchor="middle" font-size="24" font-weight="600" fill="var(--es-ink)">no</text>
</svg>
```

## 5. Stack — layers sitting on layers

For abstraction, protocols, "what sits under what".

```html
<svg viewBox="0 0 480 320" role="img" class="es-svg">
  <title>Three slabs stacked, widest at the bottom</title>
  <rect x="120" y="70"  width="240" height="62" rx="14"
        fill="var(--es-accent)" stroke="var(--es-ink)" stroke-width="6"/>
  <rect x="90"  y="142" width="300" height="62" rx="14"
        fill="var(--es-fill)" stroke="var(--es-ink)" stroke-width="6"/>
  <rect x="60"  y="214" width="360" height="62" rx="14"
        fill="var(--es-fill)" stroke="var(--es-ink)" stroke-width="6"/>
  <text x="240" y="111" text-anchor="middle" font-size="22" font-weight="600" fill="var(--es-ink)">the app</text>
  <text x="240" y="183" text-anchor="middle" font-size="22" font-weight="600" fill="var(--es-ink)">the rules</text>
  <text x="240" y="255" text-anchor="middle" font-size="22" font-weight="600" fill="var(--es-ink)">the wires</text>
</svg>
```

## 6. Lock and key — the paired-token idiom

For auth, encryption, secrets, permissions.

```html
<svg viewBox="0 0 480 320" role="img" class="es-svg">
  <title>A padlock beside the one key that opens it</title>
  <rect x="90" y="150" width="150" height="120" rx="18"
        fill="var(--es-accent)" stroke="var(--es-ink)" stroke-width="6"/>
  <path d="M130 150 V115 a35 35 0 0 1 70 0 V150" fill="none"
        stroke="var(--es-ink)" stroke-width="6" stroke-linecap="round"/>
  <circle cx="165" cy="205" r="14" fill="var(--es-ink)"/>
  <circle cx="330" cy="180" r="38"
          fill="none" stroke="var(--es-accent-2)" stroke-width="6"/>
  <path d="M366 180 H445 M418 180 V208 M441 180 V202" fill="none"
        stroke="var(--es-accent-2)" stroke-width="6" stroke-linecap="round"/>
</svg>
```

## Combining idioms

Two idioms in one panel is usually two ideas — but a few pairs read as one:

- **Container + lock** — a sealed box. One idea: "nobody else opens this."
- **Arrow chain + split** — a journey that forks once. One idea: "it goes one of two ways."
- **Stack + arrow** — one layer calling down to the next.

Anything else, split into two panels.
