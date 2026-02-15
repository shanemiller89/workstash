# Refactor Code

## Context
You are refactoring code in the Superprompt Forge VS Code extension. Refactors should preserve behavior while improving structure, readability, or reducing duplication.

## Rules
1. **No behavior changes** — refactors must not alter user-facing functionality.
2. **Follow existing patterns** — see `.github/copilot-instructions.md` for conventions.
3. **Check callers** — before changing a function signature, find all call sites and update them.
4. **Preserve types** — don't weaken types (e.g., don't change a specific type to `any`).
5. **Backward compatibility** — if an interface changes, update all consumers.
6. **Compile check** — run `npm run compile` after refactoring and fix all errors.

## Common Refactors in This Project
- **Extract `pickStash()` helper** (task 0c) — deduplicate QuickPick fallback in 4 commands.
- **`execGit()` → `GitResult`** (task 0a) — change from throw-on-error to structured return.
- **`GitService` constructor** (task 8c-ii) — accept `workspaceRoot` parameter instead of reading `workspaceFolders[0]`.
- **Settings helper** (task 8e-ii) — extract `getConfig<T>()` to avoid repeated `getConfiguration` calls.

## Instructions
1. Identify what you're refactoring and why.
2. Read all files that import/use the code being changed.
3. Make the change in the source.
4. Update all call sites.
5. Verify with `npm run compile`.

## What to refactor
<!-- e.g.: "Extract pickStash() helper from duplicated QuickPick blocks (task 0c)" -->
