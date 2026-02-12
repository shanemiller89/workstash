# MyStash — Development Punch List

> Feature tracker for the MyStash VS Code extension.
> ✅ = done, 🔲 = todo. Check off items as they are completed.
>
> **Architecture decisions (locked):**
> - `execGit()` returns `{ stdout, stderr, exitCode }` (structured result, not throw-on-error)
> - Diff viewing uses `TextDocumentContentProvider` with `mystash:` URI scheme (no temp files)
> - Multi-root workspace is Phase 2 but design placeholders (`// TODO: multi-root`) are added now
> - Extract `pickStash()` helper to eliminate QuickPick boilerplate duplication
> - Both unit tests (mocked exec) and integration tests (extension host)
> - Webview panel uses React 18 + Zustand + Tailwind CSS 4 + date-fns (separate build pipeline)

---

## Current File Inventory

```
MyStash/
├── src/
│   ├── extension.ts            # activate/deactivate, command registration, wiring
│   ├── gitService.ts           # GitService class — all git CLI operations
│   ├── stashProvider.ts        # TreeDataProvider for the stash list view
│   ├── stashItem.ts            # StashItem & StashFileItem tree item models
│   ├── stashContentProvider.ts # TextDocumentContentProvider (mystash: URI scheme)
│   ├── stashPanel.ts           # WebviewPanel — loads React app, handles messages
│   ├── uiUtils.ts              # pickStash() QuickPick helper
│   ├── utils.ts                # formatRelativeTime(), getConfig()
│   └── test/
│       └── extension.test.ts   # Integration tests (extension host) — scaffold only
├── webview-ui/
│   ├── tsconfig.json           # Separate tsconfig (jsx: react-jsx, DOM lib)
│   └── src/
│       ├── main.tsx            # React entry point
│       ├── App.tsx             # Root component, message listener → Zustand store
│       ├── store.ts            # Zustand store (stashes, search, expand state)
│       ├── vscode.ts           # Type-safe webview messaging wrapper
│       ├── index.css           # Tailwind v4 + VS Code theme variable mapping
│       └── components/
│           ├── StashList.tsx    # Search bar, card list, empty states, footer
│           ├── StashCard.tsx    # Stash card with actions, stats, expand/collapse
│           └── StashFiles.tsx   # File list with status icons, click-to-diff
├── dist/
│   ├── extension.js            # Extension bundle (Node CJS, esbuild)
│   ├── webview.js              # Webview bundle (Browser ESM, esbuild)
│   └── webview.css             # Tailwind CSS output (@tailwindcss/cli)
├── package.json                # Extension manifest
├── tsconfig.json               # Extension tsconfig (excludes webview-ui/)
├── esbuild.js                  # Dual build config (extension + webview)
└── PUNCHLIST.md                # This file
```

---

## 0. 🏗️ Refactors & Infrastructure ✅ COMPLETE

> All foundational changes are done.

- [x] **0a.** `GitResult` interface + `execGit()` structured return (never throws)
- [x] **0b.** Output channel (`MyStash`) — git commands logged, refresh reasons logged
- [x] **0c.** `pickStash()` helper in `uiUtils.ts` — replaces 4 duplicated QuickPick blocks

---

## 1. 🗂️ Display Stash List ✅ COMPLETE

> Sidebar tree view with rich details, file items, context keys, welcome views, watchers.

- [x] **1a.** Git layer — `getStashList()` with `--format`, date parsing, WIP detection, `getStashStats()`, `getStashFilesWithStatus()`, `getStashFileContent()`, `getStashFileDiff()`, `hasChanges()`, `isGitRepository()`
- [x] **1b.** Tree items — `StashItem` (MarkdownString tooltip, conditional branch, relative time), `StashFileItem` (status icons M/A/D/R/C, click→showFile)
- [x] **1c.** `StashProvider` — context keys, debounced refresh, `resolveTreeItem` for lazy stats, badge, dynamic title, no toasts
- [x] **1d.** View registration — activity bar, welcome views (3 states), commands, menus (inline + context)
- [x] **1e.** Reactivity — git file watcher, window focus refresh, `// TODO: multi-root` comments

---

## 2. ➕ Create Stash — Hardening

> Basic create works. Needs UX polish.

- [x] **2a.** Stash with message prompt (InputBox → `git stash push -m`)
- [x] **2b.** Include untracked files option (QuickPick Yes/No)

- [ ] **2c. Handle no-changes edge case**
  - Before showing InputBox, call `gitService.hasChanges()`
  - If `false`: `showInformationMessage('No local changes to stash')` and return
  - 📁 `extension.ts`

- [ ] **2d. Three-way stash mode QuickPick**
  - Replace the Yes/No untracked prompt with a 3-option QuickPick:
    - `All Changes` — no extra flags
    - `Staged Only` — `--staged` (git 2.35+)
    - `Include Untracked` — `--include-untracked`
  - Pre-select based on `mystash.defaultIncludeUntracked` setting
  - 📁 `extension.ts`, `gitService.ts`

- [ ] **2e. Cancel-safe flow**
  - **Bug:** pressing Escape on the message InputBox continues to the untracked QuickPick
  - Fix: check `message === undefined` (Escape) vs `message === ''` (empty submit)
  - Guard each step: `if (!mode) { return; }`
  - 📁 `extension.ts`

- [ ] **2f. Progress indicator for create**
  - Wrap `createStash()` in `vscode.window.withProgress()` with notification
  - 📁 `extension.ts`

---

## 3. ✅ Apply Stash — Hardening

> Basic apply works. Needs conflict detection + progress.

- [x] **3a.** Apply from tree view (inline button)
- [x] **3b.** Apply from command palette (via `pickStash()`)

- [ ] **3c. Handle merge conflicts on apply**
  - Inspect `exitCode` + `stderr.includes('CONFLICT')` → partial success
  - Return `{ success: boolean; conflicts: boolean }` from `applyStash()`
  - Show warning message on conflict instead of error
  - 📁 `gitService.ts`, `extension.ts`

- [ ] **3d. Progress indicator**
  - Wrap apply in `vscode.window.withProgress()`
  - 📁 `extension.ts`

---

## 4. ⬆️ Pop Stash — Hardening

> Basic pop works. Needs conflict detection + progress.

- [x] **4a.** Pop from tree view (inline button)
- [x] **4b.** Pop from command palette (via `pickStash()`)

- [ ] **4c. Handle conflicts on pop**
  - Same as 3c but: if pop encounters conflicts, stash is **NOT dropped** (remains in list)
  - Show: `'Stash applied with conflicts but was NOT removed. Resolve, then drop manually.'`
  - 📁 `gitService.ts`, `extension.ts`

- [ ] **4d. Progress indicator**
  - Same as 3d but for pop
  - 📁 `extension.ts`

---

## 5. 🗑️ Drop Stash ✅ COMPLETE

- [x] **5a.** Drop with confirmation modal
- [x] **5b.** Drop from command palette (via `pickStash()`)

---

## 6. 👁️ Show Stash Contents

> Full diff, per-file diff, and side-by-side diff viewer all work. Some polish left.

- [x] **6a.** Show full stash diff (`git stash show -p` → diff editor tab)
- [x] **6b.** Show from command palette (via `pickStash()`)
- [x] **6c.** `mystash.showFile` command — per-file diff (hidden from palette)
- [x] **6d.** `StashContentProvider` — `mystash:` URI scheme, `?ref=parent|stash&index=N`
- [x] **6e.** Side-by-side diff view using `vscode.diff` (parent ↔ stash version)

- [ ] **6f. Show stash summary (stat view)**
  - Optional: `mystash.showStats` command showing `git stash show --stat` in an editor
  - Or integrate stats into the `mystash.show` command as a header
  - 📁 `gitService.ts`, `extension.ts`

---

## 7. 🧹 Clear All Stashes ✅ COMPLETE

- [x] **7a.** Clear with confirmation modal (shows stash count)

---

## 8. 🎨 Webview Panel (React)

> Rich interactive stash explorer in an editor tab. Core is built, needs polish.

### 8A. Core (Done)

- [x] **8a-i. React + Zustand + Tailwind build pipeline**
  - `webview-ui/` directory with separate `tsconfig.json`
  - esbuild dual-context build (extension CJS + webview ESM)
  - Tailwind CSS v4 built via `@tailwindcss/cli`
  - 📁 `esbuild.js`, `webview-ui/tsconfig.json`, `package.json` scripts

- [x] **8a-ii. VS Code theme integration**
  - Tailwind `@theme` block maps `--vscode-*` CSS variables to custom color tokens
  - Cards, badges, buttons, inputs all use VS Code theme colors
  - 📁 `webview-ui/src/index.css`

- [x] **8a-iii. Zustand store + messaging**
  - Store: stashes, expandedIndices, loading, searchQuery, filteredStashes()
  - Type-safe `postMessage()` / `onMessage()` wrapper
  - Extension sends data via `postMessage` (no HTML replacement → no flashing)
  - 📁 `webview-ui/src/store.ts`, `webview-ui/src/vscode.ts`

- [x] **8a-iv. StashPanel host class**
  - Singleton pattern, `retainContextWhenHidden: true`
  - Loads `dist/webview.js` + `dist/webview.css` via `asWebviewUri()`
  - CSP with nonce for scripts, webview cspSource for styles
  - Handles all stash operations (apply/pop/drop/showFile/create/clear)
  - 📁 `src/stashPanel.ts`

- [x] **8a-v. React components**
  - `StashList` — search bar, card list, empty states, footer with count + Clear All
  - `StashCard` — color indicator (WIP yellow / normal blue), message, branch badge, relative date, stats, hover action buttons, expand/collapse
  - `StashFiles` — file list with status icons (M/A/D/R/C), click-to-diff
  - 📁 `webview-ui/src/components/`

### 8B. Webview Polish (Todo)

- [ ] **8b-i. Card height / layout bug**
  - Cards may render with collapsed height on some themes — min-h fix applied, needs testing
  - Verify on light theme, dark theme, high contrast
  - 📁 `webview-ui/src/components/StashCard.tsx`

- [ ] **8b-ii. Stash creation from webview**
  - "Create Stash" button in empty state and optionally in a header bar
  - Currently delegates to `mystash.stash` command — could add inline InputBox in webview
  - 📁 `webview-ui/src/components/StashList.tsx`, `src/stashPanel.ts`

- [ ] **8b-iii. Webview auto-refresh**
  - When tree view refreshes (git watcher, focus), also refresh the webview panel if open
  - Add `StashPanel.refreshIfOpen()` static method, call from `StashProvider.refresh()`
  - 📁 `src/stashPanel.ts`, `src/stashProvider.ts`

- [ ] **8b-iv. Loading skeleton / spinner**
  - Show skeleton cards or spinner while loading instead of blank state
  - 📁 `webview-ui/src/components/StashList.tsx`

- [ ] **8b-v. Keyboard navigation**
  - Arrow keys to move between cards, Enter to expand, Escape to close search
  - 📁 `webview-ui/src/components/StashList.tsx`, `webview-ui/src/components/StashCard.tsx`

- [ ] **8b-vi. Webview panel icon & title**
  - Show stash count in panel title: `MyStash (3)`
  - Update on each refresh
  - 📁 `src/stashPanel.ts`

---

## 9. ✨ Polish & UX

> Settings integration, status bar, keybindings, visual improvements.

### 9A. Settings Integration

- [x] **9a-i. Declare settings in `package.json`**
  - 7 settings: autoRefresh, confirmOnDrop, confirmOnClear, showFileStatus, defaultIncludeUntracked, sortOrder, showBranchInDescription

- [ ] **9a-ii. `getConfig()` helper usage audit**
  - `getConfig()` exists in `utils.ts` — verify ALL settings are actually read:
    - `confirmOnDrop` → used in drop command? (currently hardcoded `true`)
    - `confirmOnClear` → used in clear command? (currently hardcoded `true`)
    - `showFileStatus` → used in `stashProvider.ts`?
    - `sortOrder` → used in `stashProvider.ts`?
  - 📁 `extension.ts`, `stashProvider.ts`, `stashItem.ts`

- [ ] **9a-iii. Sort order implementation**
  - In `StashProvider.getChildren()` root level: if `sortOrder === 'oldest'`, reverse
  - 📁 `stashProvider.ts`

- [ ] **9a-iv. Listen for setting changes**
  - `vscode.workspace.onDidChangeConfiguration` → refresh on `mystash.*` change
  - 📁 `extension.ts`

### 9B. Visual Indicators

- [ ] **9b-i. Status bar item**
  - `$(archive) N` in the status bar, click → focus tree view
  - Update on every refresh, hide when count is 0
  - 📁 `extension.ts`

- [ ] **9b-ii. Extension icon**
  - Create `images/icon.png` (128×128 PNG)
  - Currently `package.json` references it but file doesn't exist → VSIX packaging error
  - 📁 `images/icon.png`

### 9C. Keyboard Shortcuts

- [ ] **9c-i. Default keybinding**
  - `Cmd+Shift+S` (Mac) / `Ctrl+Shift+S` (Win/Linux) → `mystash.stash`
  - 📁 `package.json`

### 9D. Multi-Root Workspace (Phase 2 — Placeholders)

- [x] **9d-i. `// TODO: multi-root` comments** — added in gitService, stashProvider, extension

- [ ] **9d-ii. Decouple `GitService` from workspace**
  - Change constructor to accept `workspaceRoot: string` explicitly (instead of reading `workspaceFolders[0]`)
  - Cleaner for multi-root and easier to test
  - 📁 `gitService.ts`, `extension.ts`

---

## 10. 🧪 Testing

> Unit tests (mocked exec, fast) and integration tests (extension host, realistic).

### 10A. Unit Tests — GitService

- [ ] **10a-i. Stash line parsing tests**
  - Standard, WIP, no-branch, no-message, empty, malformed, special chars
  - 📁 `src/test/gitService.test.ts`

- [ ] **10a-ii. Date parsing tests**
  - Mock `--format` output, verify `Date` objects, timezone handling
  - 📁 `src/test/gitService.test.ts`

- [ ] **10a-iii. Stats parsing tests**
  - Mock `git stash show --stat`, verify parsed numbers
  - 📁 `src/test/gitService.test.ts`

- [ ] **10a-iv. File status parsing tests**
  - Mock `git stash show --name-status`, verify `{ path, status }` tuples
  - 📁 `src/test/gitService.test.ts`

- [ ] **10a-v. Command construction tests**
  - Verify git commands built correctly for each flag combination
  - 📁 `src/test/gitService.test.ts`

- [ ] **10a-vi. Conflict detection tests**
  - Mock `exitCode: 1` + `CONFLICT` in stderr → verify return shape
  - 📁 `src/test/gitService.test.ts`
  - ⚠️ **Depends on:** 3c/4c (conflict detection implemented)

### 10B. Unit Tests — Models & Utils

- [ ] **10b-i. `formatRelativeTime()` tests**
  - Boundary cases: 0s, 59s, 60s, 59m, 60m, 23h, 24h, 6d, 7d, 364d, 365d
  - 📁 `src/test/utils.test.ts`

- [ ] **10b-ii. `StashItem` property tests**
  - Construct → verify label, description, tooltip, icon, contextValue, collapsibleState
  - 📁 `src/test/stashItem.test.ts`

- [ ] **10b-iii. `StashFileItem` property tests**
  - Construct → verify label (filename), description (dirname), icon (status), command
  - 📁 `src/test/stashItem.test.ts`

### 10C. Integration Tests — Extension Host

- [ ] **10c-i. Extension activation test**
  - Verify activates, all commands registered
  - 📁 `src/test/extension.test.ts`

- [ ] **10c-ii. Tree view population test**
  - In a test git repo with stashes, verify tree populates and children appear
  - 📁 `src/test/extension.test.ts`

- [ ] **10c-iii. Command execution smoke tests**
  - `mystash.refresh` no-throw, `mystash.show` opens editor
  - 📁 `src/test/extension.test.ts`

---

## 11. 📦 Packaging & Release Prep

- [ ] **11a. Verify `.vscodeignore`**
  - Exclude `src/`, `webview-ui/`, `out/`, `.vscode-test/`, test files
  - Include `dist/` (extension.js, webview.js, webview.css)
  - 📁 `.vscodeignore`

- [ ] **11b. `CHANGELOG.md` initial entry**
  - Add `0.1.0` entry with all implemented features
  - 📁 `CHANGELOG.md`

- [ ] **11c. Extension icon**
  - Alias of 9b-ii
  - 📁 `images/icon.png`

- [ ] **11d. README.md update**
  - Screenshots, feature list, settings table, command table
  - 📁 `README.md`

- [ ] **11e. Minify production build**
  - Verify `npm run package` produces minified `dist/` output
  - Check VSIX size is reasonable
  - 📁 `esbuild.js`, `package.json`

---

## Dependency Graph

```
3c (conflict: apply) ──→ 10a-vi (conflict tests)
4c (conflict: pop)   ──→ 10a-vi (conflict tests)

9a-ii (settings audit) ─→ 9a-iii (sort order)
                         → 9a-iv (setting change listener)

8b-iii (webview refresh) → needs stashPanel.refreshIfOpen() static method

11a-11e (packaging) → all features should be stable first
```

## Suggested Implementation Order

1. **Command Hardening:** 2c → 2d → 2e → 2f → 3c → 3d → 4c → 4d
2. **Settings Wiring:** 9a-ii → 9a-iii → 9a-iv
3. **Webview Polish:** 8b-i → 8b-iii → 8b-iv → 8b-vi
4. **Visual Polish:** 9b-i → 9c-i → 6f
5. **Testing:** 10a → 10b → 10c
6. **Release Prep:** 11a → 11b → 9b-ii/11c → 11d → 11e

---

## Progress Summary

| Section                          | Sub-tasks | Done | Remaining |
|----------------------------------|-----------|------|-----------|
| 0. Refactors & Infrastructure    | 3         | 3    | 0         |
| 1. Display Stash List            | 5         | 5    | 0         |
| 2. Create Stash — Hardening     | 6         | 2    | 4         |
| 3. Apply Stash — Hardening      | 4         | 2    | 2         |
| 4. Pop Stash — Hardening        | 4         | 2    | 2         |
| 5. Drop Stash                    | 2         | 2    | 0         |
| 6. Show Stash Contents           | 6         | 5    | 1         |
| 7. Clear All Stashes             | 1         | 1    | 0         |
| 8. Webview Panel (React)         | 11        | 5    | 6         |
| 9. Polish & UX                   | 8         | 2    | 6         |
| 10. Testing                      | 9         | 0    | 9         |
| 11. Packaging & Release          | 5         | 0    | 5         |
| **Total**                        | **64**    | **29** | **35**  |
