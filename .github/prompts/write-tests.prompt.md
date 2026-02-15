# Write Tests for a Module

## Context
You are writing tests for the Superprompt Forge VS Code extension. The project uses **Mocha** + **assert** (Node built-in). No Chai, no Jest.

## Test Types

### Unit Tests (fast, no VS Code host)
- Mock `execAsync` to control git output — never shell out to real git.
- Test pure parsing logic, command construction, utility functions.
- Files: `src/test/gitService.test.ts`, `src/test/utils.test.ts`, `src/test/stashItem.test.ts`

### Integration Tests (extension host via @vscode/test-electron)
- Test command registration, tree view population, activation lifecycle.
- These run inside a real VS Code instance.
- File: `src/test/extension.test.ts`

## Conventions
- Group with `suite()` / `test()` (Mocha style).
- Use `assert.strictEqual`, `assert.deepStrictEqual`, `assert.throws`, `assert.rejects`.
- Test file naming: `{module}.test.ts` in `src/test/`.
- Each test should be independent — no shared mutable state between tests.
- Test edge cases: empty input, malformed data, special characters, boundary values.
- Reference the `✅ Validates:` tag in `PUNCHLIST.md` to see which tasks each test covers.

## Instructions
1. Read the source file being tested to understand the API surface.
2. Write tests covering: happy path, edge cases, error cases.
3. Run tests with `npm test` to verify they pass.
4. Mark the corresponding `9a/9b/9c` task done in `PUNCHLIST.md`.

## What to test
<!-- e.g.: "Write unit tests for gitService.ts stash line parsing (task 9a-i)" -->
