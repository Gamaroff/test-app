#!/usr/bin/env bash
# mermaid-architect linter
# Usage: lint.sh <file.md|file.mmd>
#   or:  cat file.md | lint.sh -
#
# Extracts every ```mermaid ... ``` block from a file (or stdin), then runs
# syntactic checks on each block. If `mmdc` (mermaid-cli) is on PATH, it is
# also invoked for a real parse.
#
# Exit codes documented in references/validation-rules.md.

set -uo pipefail

INPUT="${1:-}"
if [[ -z "$INPUT" ]]; then
  echo "usage: lint.sh <file> | lint.sh -" >&2
  exit 20
fi

WORKDIR="$(mktemp -d -t mermaid-architect.XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT

if [[ "$INPUT" == "-" ]]; then
  cat > "$WORKDIR/input"
else
  if [[ ! -r "$INPUT" ]]; then
    echo "ERR: cannot read $INPUT" >&2
    exit 20
  fi
  cp "$INPUT" "$WORKDIR/input"
fi

# Detect whether the file has fenced mermaid blocks. If not, treat the whole
# file as a single raw mermaid source (e.g., a .mmd file).
if grep -q '^```mermaid' "$WORKDIR/input"; then
  # Split into one file per fenced block.
  awk -v dir="$WORKDIR" '
    /^```mermaid[[:space:]]*$/ { in_block=1; idx++; out=sprintf("%s/block_%03d.mmd", dir, idx); next }
    /^```[[:space:]]*$/ && in_block { in_block=0; next }
    in_block { print > out }
  ' "$WORKDIR/input"

  # Fence pairing check
  opens=$(grep -c '^```mermaid[[:space:]]*$' "$WORKDIR/input" || true)
  closes_total=$(grep -c '^```[[:space:]]*$' "$WORKDIR/input" || true)
  if (( closes_total < opens )); then
    echo "ERR: mermaid fence imbalance (open=$opens, close=$closes_total)" >&2
    exit 1
  fi
else
  cp "$WORKDIR/input" "$WORKDIR/block_001.mmd"
fi

shopt -s nullglob
BLOCK_FILES=("$WORKDIR"/block_*.mmd)
shopt -u nullglob

if (( ${#BLOCK_FILES[@]} == 0 )); then
  echo "ERR: no mermaid blocks found" >&2
  exit 2
fi

WARN=0
EXIT=0

check_block() {
  local file="$1" idx="$2"

  # First non-comment, non-blank, non-init line must be a diagram type.
  local first_line
  first_line="$(grep -m1 -vE '^[[:space:]]*(%%|$)' "$file")"

  if ! [[ "$first_line" =~ ^[[:space:]]*(flowchart|graph|sequenceDiagram|stateDiagram-v2|stateDiagram|erDiagram|classDiagram|journey|gantt|pie|mindmap|timeline|C4Context|C4Container|C4Component|C4Dynamic|C4Deployment|requirementDiagram|gitGraph|quadrantChart|sankey-beta|xychart-beta|block-beta)([[:space:]]|$) ]]; then
    echo "ERR block#$idx: missing or unknown diagram type (first content line: '$first_line')" >&2
    EXIT=2
    return
  fi

  # Legacy stateDiagram warning
  if [[ "$first_line" =~ ^[[:space:]]*stateDiagram[[:space:]]*$ ]]; then
    echo "WARN block#$idx: use stateDiagram-v2, not legacy stateDiagram" >&2
    WARN=1
  fi

  # Bracket balance
  local open_sq close_sq open_pa close_pa open_cu close_cu
  open_sq=$(grep -o '\[' "$file" | wc -l | tr -d ' ')
  close_sq=$(grep -o '\]' "$file" | wc -l | tr -d ' ')
  open_pa=$(grep -o '(' "$file" | wc -l | tr -d ' ')
  close_pa=$(grep -o ')' "$file" | wc -l | tr -d ' ')
  open_cu=$(grep -o '{' "$file" | wc -l | tr -d ' ')
  close_cu=$(grep -o '}' "$file" | wc -l | tr -d ' ')
  if [[ "$open_sq" != "$close_sq" || "$open_pa" != "$close_pa" || "$open_cu" != "$close_cu" ]]; then
    echo "ERR block#$idx: bracket imbalance [ $open_sq/$close_sq ]  ( $open_pa/$close_pa )  { $open_cu/$close_cu }" >&2
    EXIT=3
  fi

  # Reserved keywords as bare ids (best-effort)
  if grep -qE '^[[:space:]]*(end|default|class)[[:space:]]*(\[|\(|\{|--)' "$file"; then
    echo "WARN block#$idx: reserved keyword used as bare node id (quote it: node[\"end\"])" >&2
    WARN=1
  fi

  # Duplicate node ids with mismatched labels (BSD-awk compatible)
  local label_mismatch
  label_mismatch="$(grep -oE '[A-Za-z_][A-Za-z0-9_]*\[[^]]+\]' "$file" \
    | awk '{
        n = index($0, "[")
        id = substr($0, 1, n-1)
        label = substr($0, n)
        if (id in seen && seen[id] != label) {
          print "duplicate id with different label: " id " -> " seen[id] " vs " label
        }
        seen[id] = label
      }')"
  if [[ -n "$label_mismatch" ]]; then
    echo "ERR block#$idx: $label_mismatch" >&2
    EXIT=5
  fi

  # stateDiagram unlabelled transitions (warning)
  if [[ "$first_line" =~ ^[[:space:]]*stateDiagram(-v2)? ]]; then
    local unlab
    unlab="$(grep -nE '^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*[[:space:]]*-->[[:space:]]*[A-Za-z_][A-Za-z0-9_]*[[:space:]]*$' "$file" || true)"
    if [[ -n "$unlab" ]]; then
      echo "WARN block#$idx: state transition without event label:" >&2
      sed 's/^/  /' <<<"$unlab" >&2
      WARN=1
    fi
  fi
}

idx=0
for f in "${BLOCK_FILES[@]}"; do
  idx=$((idx+1))
  check_block "$f" "$idx"
done

# Real parse via mmdc if available
if command -v mmdc >/dev/null 2>&1; then
  for f in "${BLOCK_FILES[@]}"; do
    name="$(basename "$f" .mmd)"
    out="$WORKDIR/$name.svg"
    if ! mmdc -i "$f" -o "$out" -q 2>"$WORKDIR/$name.err"; then
      echo "ERR $name: mmdc parse failed:" >&2
      sed 's/^/  /' "$WORKDIR/$name.err" >&2
      EXIT=10
    fi
  done
else
  echo "INFO: mmdc not on PATH — skipping real parse. Install with: npm i -g @mermaid-js/mermaid-cli" >&2
fi

if (( EXIT != 0 )); then
  exit $EXIT
fi
if (( WARN == 1 )); then
  echo "OK: passed with warnings"
else
  echo "OK"
fi
exit 0
