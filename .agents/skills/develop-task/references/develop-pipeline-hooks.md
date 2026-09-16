---
name: develop-pipeline-hooks
description: Canonical reference for the Claude Code hooks the develop-story and develop-task pipelines use to stay hands-free. Catalogues every hook (PreCompact, Stop), the install script, the lock-file contract that drives them, the escape valves that keep them safe, and how they interact. Cross-links the pause/resume deep dive in develop-pipeline-pause.md.
---
<!-- AUTO-GENERATED — DO NOT EDIT. Source: shared/resources/develop-pipeline-hooks.md. Regenerate via `npm run bundle`. -->

# Develop Pipeline — Hooks Reference

The `/develop-story` and `/develop-task` orchestrators rely on **two** Claude Code hooks to run the full 8-step pipeline hands-free. Both hooks are opt-in (registered in `.claude/settings.json`), both read the same lock file (`.claude/state/develop-pipeline.lock`), and both noop outside pipeline runs.

This document is the single source of truth for what hooks exist, what they do, and how to install them. For the deeper pause/resume semantics (lock-file format, half-done step recovery), see [`develop-pipeline-pause.md`](develop-pipeline-pause.md).

---

## TL;DR — install both hooks

```bash
# After installing skills (e.g. via `bash setup-consumer.sh` or `--update`):
bash .agents/skills/develop-story/scripts/install-hooks.sh
```

Idempotent. Preserves existing settings. `--dry-run` to preview.

---

## Hook catalog

| Hook event | Script | Purpose | Mandatory? |
|------------|--------|---------|------------|
| `PreCompact` | `on-precompact.sh` | Graceful pause when Claude Code is about to compact the conversation mid-pipeline | Optional (pipeline still resumes correctly without it; just no PR comment / pause-state report entry) |
| `Stop` | `on-stop.sh` | Force the orchestrator to continue when it tries to yield mid-pipeline (structural backstop for context-pressure stalls) | **Strongly recommended** — without it the pipeline relies entirely on prose-level "never stop between steps" rules, which fail under context pressure |

Both scripts are byte-identical across `develop-story` and `develop-task` installs — the lock file's `skill` field selects the orchestrator at runtime.

> **Why no `PostToolUse:Skill` auto-advance hook?** An earlier design shipped a third hook (`on-skill-return.sh`) that advanced the lock and injected a "next step" reminder when a sub-skill "returned." This was removed: the Skill tool executes **inline** in the orchestrator's context, so a `PostToolUse` hook matching the Skill tool fires the instant the skill's instructions are *loaded* — before any of its work runs. Claude Code has **no** hook event for skill *completion*. The hook therefore mis-fired on every sub-skill call, advancing the pipeline before the step did any work. Lock advancement is handled correctly by **sub-skill self-advance** (an instruction inside each sub-skill body, which runs inline *after* the work) plus the **Stop** hook backstop — see [`pipeline-lock-cooperation.md`](https://github.com/Gamaroff/agent-skills/blob/develop/shared/resources/pipeline-lock-cooperation.md).

---

## 1. PreCompact hook — `on-precompact.sh`

**Event**: [`PreCompact`](https://docs.claude.com/en/docs/claude-code/hooks) — fires immediately before Claude Code summarises the conversation context to free up tokens.

**Purpose**: durably checkpoint the running pipeline so it can be cleanly resumed after compaction.

**Trigger condition** (inside the hook): `.claude/state/develop-pipeline.lock` exists. With no lock = no active pipeline = noop.

**Side effects** (best-effort, all wrapped in `... || true`):

0. **Write a resume snapshot first** — `develop-pipeline.last-halt.json` (co-located with the lock) as a **superset of the lock** plus `paused_at`, `pause_reason: "precompact"`, and `halt_step` (aliasing the lock's `current_step`). This is written **before the EXIT trap is armed and before any `rm`**, so even a hook run killed mid-flow (SIGTERM/timeout) leaves recoverable resume state. Degrades to a verbatim `cp` of the lock when `jq` is unavailable (`current_step` is still preserved). The Phase 0b resume detector reads this snapshot when no active lock is present.
1. Append a `## Pipeline Paused — {timestamp}` block to the implementation report named in the lock
2. `git add <report> && git commit -m "docs(<skill>): pipeline paused at step <N> — context compaction imminent" && git push origin HEAD`
3. PR comment, if `pr_url` is set and both `gh` and `node` are on PATH — `tracker_write gh pr comment <pr_url> --body-file .claude/state/precompact-pr-comment.step-<N>.md`, the body opening with the `pipeline-paused` plain-language lead from `stakeholder-summary-cli.js`. Sourcing `resolve-platform.sh` beside the hook is what supplies `tracker_write`; under any `access.tracker` other than `full` the comment is **recorded, not posted**, and if the resolver or the lead cannot be loaded the arm **fails closed** (nothing posted, outcome named in the signal).
4. Tracker-issue comment, if `tracker_issue` is set — one `tracker-comment.js --issue <tracker_issue> --stage pipeline-paused-<step> --body-file …` call. The engine resolves the tracker itself (GitHub, or Jira when `JIRA_*` credentials are in the hook's environment), renders the same lead, adds the idempotency marker (scoped by the step, so a second pause at a later step is a second comment) and applies the access gate. `node` or the engine missing → skipped, never posted bare.
5. `rm -f .claude/state/develop-pipeline.lock`

> Both comment arms were bare `gh … comment --body "…"` calls until bug.14 — no lead, no marker, and no access gate, so a consumer with `access.tracker: read-only` still got a write from the one caller that runs with no prose step behind it. `tests/mutation-call-site-coverage.test.js` now scans tracked shell sources as well as Markdown, so the bare form cannot come back unnoticed.

> **Operator note — `pause_reason` vs `halt_reason`.** A PreCompact snapshot is tagged `pause_reason: "precompact"` (with `paused_at`); the orchestrator's terminal-HALT path in SKILL.md instead writes `halt_reason` + `halted_at`. Inspect **`pause_reason`** to identify a snapshot left by an interrupted compaction. Both carry `halt_step`, so Phase 0b resumes from the same field either way.

**Output**: a single JSON object on stdout carrying `additionalContext`:
```json
{"hookSpecificOutput": {"hookEventName": "PreCompact", "additionalContext": "🛑 PIPELINE-PAUSE-SIGNAL\n..."}}
```
The orchestrator sees the signal in its next turn, emits the user-facing pause banner, and halts cleanly. Compaction then proceeds on a known-good state.

**Resume**: re-invoke `/develop-{story,task} <path>`. Phase 0b artifact verification skips completed steps and re-runs the paused step from scratch — sub-skills are required to be re-run-safe (see the pause doc's "Re-run-safety contract").

**Escape valves**:
- No lock file → exit 0 with empty `additionalContext` (and a pre-existing snapshot is left untouched — the snapshot write is skipped before the lock-existence check)
- `jq` missing → exit 0 with empty `additionalContext` (degrades to no-pause), but the cp-fallback resume snapshot is still written first, so resume works via Phase 0b
- Hook timeout / SIGTERM → `trap 'rm -f "$LOCK"' EXIT` ensures the lock is removed regardless. The snapshot is written **before** this trap is armed, so a kill can never leave the pipeline both unlocked **and** un-resumable.

**Jira**: the issue comment goes through `tracker-comment.js`, which posts to Jira over REST when `JIRA_URL` / `JIRA_API_TOKEN` / `JIRA_USER_EMAIL` are in the hook's environment (or a `.env` the engine reads). Without them the engine reports `no-credentials` and the Jira side stays silent; the signal carries that outcome and the orchestrator repeats it in the user-facing summary. There is no MCP path from a shell hook.

For the full lock-file format, half-done step recovery semantics, and verification checklist, see [`develop-pipeline-pause.md`](develop-pipeline-pause.md).

---

## 2. Stop hook — `on-stop.sh`

**Event**: [`Stop`](https://docs.claude.com/en/docs/claude-code/hooks) — fires when the assistant attempts to end its turn.

**Purpose**: structural defence against the failure mode where a sub-skill returns control with a "complete" message and the orchestrator, under context pressure, treats the natural turn boundary as end-of-task and yields to the user mid-pipeline. (Regression observed 2026-05-12 during story 2.2 dogfood — orchestrator stopped after `/develop` returned with "Ready for Review" instead of continuing to `/create-pr`.)

**Trigger condition**: `.claude/state/develop-pipeline.lock` exists **and** `current_step` is in `[1, 7]` (i.e., the pipeline is mid-flight, not finishing on step 8).

**Behaviour when triggered**: returns JSON with `decision: "block"` and a `reason` that lists the exact next four actions for the orchestrator:

1. Bash — advance `current_step` in the lock
2. Edit — mark the current step `✅ Done` in the implementation report
3. Output the Remaining Work Status block, then the banner — `═══ DEVELOP-{STORY,TASK} PIPELINE: STEP {N+1}/8 — {NAME} ═══` (see [`develop-pipeline-remaining-work-banner.md`](develop-pipeline-remaining-work-banner.md))
4. Invoke — the next sub-skill via the Skill tool

The reason is injected as a system reminder in the next assistant turn, forcing forward motion before any prose can be emitted.

**Escape valves** (the hook ALLOWS stop when any of these are true):
| Condition | Why it's an escape valve |
|-----------|--------------------------|
| `stop_hook_active: true` in the hook input | Claude Code's anti-loop signal — the hook has already blocked once for this stop attempt; blocking again would loop forever |
| No lock file present | No active pipeline — normal end of conversation |
| `current_step >= 8` | Pipeline is finishing on step 8 (commit-changes); end of run |
| `current_step < 1` or `null` | Lock is malformed; bail gracefully |
| `jq` missing | Degraded mode — refuse to parse, allow stop |
| Orchestrator removes the lock | Legitimate terminal HALT path in SKILL.md (commit report → snapshot to `develop-pipeline.last-halt.json` → `rm lock`) — next stop attempt sails through |

**Loop protection in practice**: Claude Code passes `stop_hook_active: true` to the hook on the second consecutive block within a single stop attempt. The hook honours this and exits 0. If the orchestrator genuinely cannot continue, the documented terminal-HALT protocol removes the lock, satisfying the hook permanently.

> **Expected behaviour — the hook re-prompts on every pause; this is not a bug.** `stop_hook_active` only suppresses a *second* block within the **same** stop attempt — it does **not** persist across separate stops. So every time the orchestrator genuinely yields the turn mid-step (most commonly while **waiting on background subagents**, or pausing for any reason while `current_step` is still in `[1, 7]`), that is a *fresh* stop attempt: the lock is unchanged, so the hook fires again and re-issues its "advance the lock now, no prose" block. During a single long step you will therefore see the same continue-prompt **several times**, once per pause. This is the hook doing its job — it has no signal for "background work is in flight," so it cannot tell a premature yield apart from a legitimate mid-step wait, and it treats both as premature. **The correct response is to ignore the re-prompt and hold the step until its own work and gates have genuinely completed** — only then perform the Bash → Edit → banner → invoke transition. Do not let the repeated prompt stampede you into advancing early; advancing before the step's work lands is the actual failure mode (see [`pipeline-lock-cooperation.md`](https://github.com/Gamaroff/agent-skills/blob/develop/shared/resources/pipeline-lock-cooperation.md)). The prompt never *forces* the wrong action — it cannot advance the lock itself — so a step that needs more time is safe to keep working.

**Output**: either empty stdout (allow stop) or JSON:
```json
{"decision": "block", "reason": "🔁 PIPELINE-CONTINUE-REQUIRED — DO NOT STOP\n..."}
```

---

## Install script — `install-hooks.sh`

**Purpose**: one-command, idempotent patcher for `.claude/settings.json`. Replaces the manual "paste this JSON block" instructions.

**What it does**:
1. Locates the install path — tries `.agents/skills/develop-story/scripts/`, then `.agents/skills/develop-task/scripts/`, then `.claude/skills/develop-story/scripts/`, then `.claude/skills/develop-task/scripts/`. First match wins.
2. Creates `.claude/settings.json` if missing (with `{}`)
3. For each hook (`PreCompact`, `Stop`): checks if any existing `hooks[event][].hooks[].command` already matches the target command. If yes → skip. If no → append a new entry.
4. Uses `jq` for safe JSON manipulation; refuses to patch if existing settings.json is invalid JSON.

**Idempotency**: re-running the script makes no changes if both hooks are already registered. Safe to wire into project setup scripts.

**Other config preserved**: the script only touches `.hooks.PreCompact` and `.hooks.Stop` arrays. Permissions, env vars, other hook events, and unrelated keys are untouched.

**Flags**:
| Flag | Effect |
|------|--------|
| `--dry-run` | Show what would change; write nothing |
| `--settings <path>` | Target a non-default settings file (default `.claude/settings.json`) |
| `--help` | Print embedded usage block |

**Failure modes**:
- `jq` not on PATH → exit 1 with install hint
- No hook scripts found in any candidate path → exit 1 with `setup-consumer.sh --update` hint
- Invalid JSON in settings file → exit 1 (refuses to overwrite)

---

## Interaction model

```
┌──────────────────────────────────────────────────────────────────┐
│ Pipeline running, lock present, current_step = N (1 ≤ N ≤ 7)     │
└──────────────────────────────────────────────────────────────────┘
                │                                  │
                │ context near limit               │ orchestrator emits
                ▼                                  ▼ "complete" message
┌─────────────────────────────┐     ┌─────────────────────────────┐
│ Claude Code: PreCompact     │     │ Claude Code: Stop           │
│   → on-precompact.sh        │     │   → on-stop.sh              │
│   → commits report, posts   │     │   → returns decision:"block"│
│     comments, REMOVES lock  │     │     with continuation steps │
│   → emits PAUSE-SIGNAL      │     │   → lock unchanged          │
└─────────────────────────────┘     └─────────────────────────────┘
                │                                  │
                ▼                                  ▼
   Orchestrator halts cleanly;        Orchestrator resumes in
   user re-invokes /develop-* to      same turn — Bash lock-update,
   resume from Phase 0b artifact      Edit report row, banner,
   verification.                      next /skill.
```

**Mutual exclusivity in practice**: PreCompact only fires when Claude Code initiates compaction (token-pressure path). Stop fires when the assistant tries to end its turn (yield-to-user path). They never fire in the same turn.

**Both hooks read the same lock**, so they can't disagree about pipeline state.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Stop hook seems to loop forever | `stop_hook_active` not honoured | Update to latest `on-stop.sh` (must read stdin and check the flag) |
| Stop hook re-prompts to advance several times during one step | Orchestrator yielded the turn more than once mid-step (e.g. waiting on background subagents) — each pause is a fresh stop attempt | **Expected, not a bug.** Ignore the re-prompt and keep working; only do the Bash → Edit → banner → invoke transition once the step's work and gates have completed (see the "Expected behaviour" note under the Stop hook section) |
| Hook never fires | Not registered in settings.json | Run `bash .agents/skills/develop-story/scripts/install-hooks.sh` |
| Hook fires but nothing happens | No lock file (correct noop) | Confirm a `/develop-*` pipeline is active — lock is created at end of Step 1 |
| Stop hook blocks but orchestrator stops anyway | Hook returned invalid JSON, or Claude Code rejected the block | Check stderr of the hook; verify `jq` produces valid output |
| PR comment / git commit missing after pause | PR not set in lock, or `gh`/`git` not on PATH | All side effects are best-effort — implementation report is the durable record |
| Signal says `PR comment: skipped — node not on PATH` | The hook's shell has no `node` (the lead and the deferral record are both rendered by node) | Put `node` on the PATH Claude Code launches with; the issue arm reports the same cause as `node or tracker-comment.js not found beside the hook` |
| Pause comment absent but signal says `deferred` | `access.tracker` is not `full` — the gate held | Intended. The comment is in `.claude/state/tracker-actions.jsonl` for the handover checklist |
| Signal says a comment was `skipped — … not found beside the hook` | Hook copied without its sibling engines (`resolve-platform.sh`, `tracker-comment.js`, `stakeholder-summary-cli.js`) | Re-run `npm run bundle` / the installer; the hook fails closed rather than posting bare |
| Signal says the PR comment was `skipped — resolve-platform.sh failed to load: it rejected the config` | The resolver loaded but returned non-zero — a malformed `access:` block or an unsupported `access.vcs` in `skills-config.yaml` | Fix the config (run `source references/resolve-platform.sh` by hand to see the message); not a bundling problem |
| Signal says `deferred — …, but the deferred record was NOT written` | `access.tracker` held, but `defer-mutation.js` could not append to the journal (`.claude/state/tracker-actions.jsonl` unwritable, or the writer missing beside the hook) | Nothing was posted (correct); the pause comment must be posted by hand from the body file the outcome names |
| Hook crashes future pipeline runs | Stale lock file left over | `rm -f .claude/state/develop-pipeline.lock` |
| Installer refuses to write | Existing `settings.json` is invalid JSON | Fix or back up, re-run installer |
| Hook fails with `No such file or directory` though the script exists | Legacy bare-relative `command` from a pre-`${CLAUDE_PROJECT_DIR}` install — resolved against the shell's cwd at hook-fire time, which breaks after any `cd` into a subdirectory | Re-run `bash .agents/skills/develop-story/scripts/install-hooks.sh` — it migrates the old entry to the cwd-independent `${CLAUDE_PROJECT_DIR}` form automatically |

---

## Verifying your install

After running the installer, smoke-test both hooks:

```bash
# 1. Confirm settings.json has both entries
jq '.hooks.PreCompact, .hooks.Stop' .claude/settings.json

# 2. Confirm scripts are executable
ls -l .agents/skills/develop-story/scripts/on-*.sh

# 3. Confirm hooks noop without a lock
echo '{}' | bash .agents/skills/develop-story/scripts/on-stop.sh
# expect: empty output

# 4. Confirm Stop hook blocks with a synthetic mid-pipeline lock
mkdir -p .claude/state
echo '{"skill":"develop-story","current_step":3,"report_path":"x.md"}' > .claude/state/develop-pipeline.lock
echo '{"stop_hook_active":false}' | bash .agents/skills/develop-story/scripts/on-stop.sh | jq .decision
# expect: "block"
rm -f .claude/state/develop-pipeline.lock
```

---

## Authoring contract for new hooks

If you add a third hook to this pipeline (e.g., a `SessionStart` resumer), follow the same pattern:

1. **Script lives at** `skills/develop-{story,task}/scripts/on-{event}.sh`, byte-identical across both skills
2. **Always exits 0** — hooks must not block compaction or stop on infrastructure failure
3. **Reads `.claude/state/develop-pipeline.lock`** for state — never invents new lock files
4. **Honours Claude Code's anti-loop flags** (`stop_hook_active`, equivalents for other events)
5. **Documented here** — add a new section to this file plus a row in the catalog table
6. **Installable via `install-hooks.sh`** — extend the script's hook list rather than creating a parallel installer. Exception: `setup-consumer.sh` patches inline to avoid a chicken-and-egg dependency on skills being installed first; it is not a general precedent.
7. **Registered `command` uses `${CLAUDE_PROJECT_DIR}`** — write the hook command as `bash "${CLAUDE_PROJECT_DIR}/<base>/on-{event}.sh"`, never a bare relative path. Claude Code expands `${CLAUDE_PROJECT_DIR}` to the project root at hook-fire time; a bare relative path (e.g. `bash .agents/skills/.../on-{event}.sh`) is resolved against the shell's cwd instead, so it breaks the moment any command in the session has `cd`'d into a subdirectory. When you change the emitted form, also add an exact-match de-registration step (see `unpatch_hook_exact`) so re-running the installer migrates old entries instead of stacking a second, still-broken one alongside the fix.
8. **Test coverage** — add protocol assertions to `evals/develop-story/protocol/stall-and-cleanup-protocol.test.mjs`
9. **Update both SKILL.md Setup sections** — but keep them short; this doc is the canonical reference

---

## Related references

- [`develop-pipeline-pause.md`](develop-pipeline-pause.md) — deep PreCompact dive: lock format, half-done step recovery, re-run-safety contract for sub-skills
- [`develop-pipeline-resume-contract.md`](develop-pipeline-resume-contract.md) — what artifact verification does on resume
- Claude Code hooks docs: https://docs.claude.com/en/docs/claude-code/hooks
