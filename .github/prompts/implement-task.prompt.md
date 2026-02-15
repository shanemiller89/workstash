# Implement a PUNCHLIST Task

## Context
You are implementing a feature task from `PUNCHLIST.md` for the Superprompt Forge VS Code extension.

## Instructions

1. **Read the task** — Open `PUNCHLIST.md`, find the task by ID (e.g., `0a-ii`, `1b-iii`).
2. **Check dependencies** — If the task has `⚠️ Depends on: X`, verify those tasks are marked `[x]` first. If not, stop and tell me.
3. **Read target files** — Open every file listed under `📁` in the task description. Understand the current state before changing anything.
4. **Implement** — Follow the patterns in `.github/copilot-instructions.md`:
   - `execGit()` returns `GitResult` — don't throw on non-zero exit
   - Push disposables to `context.subscriptions`
   - Use `ThemeIcon`, `MarkdownString`, `getConfiguration('superprompt-forge')`
   - Async/await only, no `.then()` chains
   - `const` by default, `let` only on reassignment
   - No `any` — use `unknown` if truly needed
5. **Mark done** — Change `- [ ]` to `- [x]` for the task in `PUNCHLIST.md`.
6. **Update progress table** — Update the counts in the Progress Summary table at the bottom.
7. **Compile check** — Run `npm run compile` and fix any errors before finishing.

## What to implement
<!-- Type or paste the task ID here, e.g.: "Implement task 0a-ii" -->
