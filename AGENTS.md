# Collaboration and review rules

- Reuse `codex-review` for all Codex development and review passes. Do not create a new branch for each review.
- Claude works on a separate branch. Do not commit or push Codex changes to Claude's branch.
- Merge into or push to `main` only when the user explicitly requests that operation. Historical approval for an older build does not authorize a new merge or push.
- Use the existing isolated cloud checkout. Create an additional Git worktree only if the user explicitly requests one.
- Read `docs/HANDOFF.md` before changing the game. Document each review and provide matching before-and-after screenshots for visual changes.
