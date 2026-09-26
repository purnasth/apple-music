@AGENTS.md

# Working rules

## Commits
- One task = one commit. While iterating on the same task (tweaks, reverts, "try again"), amend the unpushed commit or squash before reporting; never stack a commit per round.
- A new commit only for a genuinely separate task.
- Commit locally; never push without an explicit go-ahead.

## Comments
- Comment only when strictly necessary: a short doc line on a util/exported function, or a non-obvious gotcha (workaround, something that breaks if removed).
- Never restate what the code does, and no rationale or design notes in code. Reasoning goes in the commit message or PR description.
