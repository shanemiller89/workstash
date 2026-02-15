# Fix a Bug

## Context
You are fixing a bug in the Superprompt Forge VS Code extension.

## Approach
1. **Reproduce** — Understand exactly what the bug is and when it occurs.
2. **Locate** — Find the exact line(s) causing the issue. Read the relevant source files.
3. **Root cause** — Understand *why* it happens, not just *where*.
4. **Fix** — Make the minimal change needed. Follow patterns in `.github/copilot-instructions.md`.
5. **Verify** — Run `npm run compile`. If there's a related test, run it.
6. **Check PUNCHLIST** — If this bug is tracked in `PUNCHLIST.md` (e.g., 2e cancel-safe flow, 1c-v toast removal), mark it done.

## Known Bugs (from PUNCHLIST)
- **2e**: Pressing Escape on message InputBox doesn't abort — still shows untracked QuickPick
- **1c-v**: `getChildren()` calls `showInformationMessage()` on every tree refresh (should use welcome view)
- `createStash()` can receive `message = undefined` from cancelled InputBox

## Error Handling Patterns
- **User-facing**: `vscode.window.showErrorMessage()` with context
- **Diagnostics**: Log to `OutputChannel('Superprompt Forge')`
- **Tree view**: Return `[]`, never toast from `getChildren()`
- **Conflicts**: `exitCode !== 0` + `stderr.includes('CONFLICT')` = partial success, not error

## What to fix
<!-- Describe the bug or paste the task ID, e.g.: "Fix task 2e — cancel-safe stash creation flow" -->
