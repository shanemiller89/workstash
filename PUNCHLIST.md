# Superprompt Forge — Development Punch List

> Feature tracker for the Superprompt Forge VS Code extension.
> ✅ = done, 🔲 = todo. Check off items as they are completed.
>
> **Architecture decisions (locked):**
>
> - `execGit()` returns `{ stdout, stderr, exitCode }` (structured result, not throw-on-error)
> - Diff viewing uses `TextDocumentContentProvider` with `superprompt-forge:` URI scheme (no temp files)
> - Multi-root workspace is Phase 2 but design placeholders (`// TODO: multi-root`) are added now
> - Extract `pickStash()` helper to eliminate QuickPick boilerplate duplication
> - Both unit tests (mocked exec) and integration tests (extension host)
> - Webview panel uses React 18 + Zustand + Tailwind CSS 4 + date-fns (separate build pipeline)

---

## Current File Inventory

```
Superprompt Forge/
├── src/
│   ├── extension.ts            # activate/deactivate, command registration, wiring
│   ├── gitService.ts           # GitService class — all git CLI operations
│   ├── stashProvider.ts        # TreeDataProvider for the stash list view
│   ├── stashItem.ts            # StashItem & StashFileItem tree item models
│   ├── stashContentProvider.ts # TextDocumentContentProvider (superprompt-forge: URI scheme)
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
- [x] **0b.** Output channel (`Superprompt Forge`) — git commands logged, refresh reasons logged
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

- [x] **2c. Handle no-changes edge case**
    - Before showing InputBox, call `gitService.hasChanges()`
    - If `false`: `showInformationMessage('No local changes to stash')` and return
    - 📁 `extension.ts`

- [x] **2d. Three-way stash mode QuickPick**
    - Replace the Yes/No untracked prompt with a 3-option QuickPick:
        - `All Changes` — no extra flags
        - `Staged Only` — `--staged` (git 2.35+)
        - `Include Untracked` — `--include-untracked`
    - Pre-select based on `superprompt-forge.defaultIncludeUntracked` setting
    - `createStash()` now accepts `mode: StashMode` (`'all' | 'staged' | 'untracked'`)
    - 📁 `extension.ts`, `gitService.ts`

- [x] **2e. Cancel-safe flow**
    - **Bug:** pressing Escape on the message InputBox continues to the untracked QuickPick
    - Fix: check `message === undefined` (Escape) vs `message === ''` (empty submit)
    - Empty submit re-prompts with "Create stash without a message?" confirmation
    - Guard each step: `if (!mode) { return; }`
    - 📁 `extension.ts`

- [x] **2f. Progress indicator for create**
    - Wrap `createStash()` in `vscode.window.withProgress()` with notification
    - 📁 `extension.ts`

---

## 3. ✅ Apply Stash — Hardening

> Basic apply works. Needs conflict detection + progress.

- [x] **3a.** Apply from tree view (inline button)
- [x] **3b.** Apply from command palette (via `pickStash()`)

- [x] **3c. Handle merge conflicts on apply**
    - Inspect `exitCode` + `stderr.includes('CONFLICT')` → partial success
    - Return `StashOperationResult { success, conflicts, message }` from `applyStash()`
    - Show warning message on conflict instead of error
    - Also updated `stashPanel.ts` webview handler
    - 📁 `gitService.ts`, `extension.ts`, `stashPanel.ts`

- [x] **3d. Progress indicator**
    - Wrap apply in `vscode.window.withProgress()` (Notification, cancellable: false)
    - 📁 `extension.ts`

---

## 4. ⬆️ Pop Stash — Hardening

> Basic pop works. Needs conflict detection + progress.

- [x] **4a.** Pop from tree view (inline button)
- [x] **4b.** Pop from command palette (via `pickStash()`)

- [x] **4c. Handle conflicts on pop**
    - Same as 3c but: if pop encounters conflicts, stash is **NOT dropped** (remains in list)
    - Show: `'Stash applied with conflicts but was NOT removed. Resolve conflicts, then drop manually.'`
    - Also updated `stashPanel.ts` webview handler
    - 📁 `gitService.ts`, `extension.ts`, `stashPanel.ts`

- [x] **4d. Progress indicator**
    - Same as 3d but for pop (Notification, cancellable: false)
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
- [x] **6c.** `superprompt-forge.showFile` command — per-file diff (hidden from palette)
- [x] **6d.** `StashContentProvider` — `superprompt-forge:` URI scheme, `?ref=parent|stash&index=N`
- [x] **6e.** Side-by-side diff view using `vscode.diff` (parent ↔ stash version)

- [x] **6f. Show stash summary (stat view)**
    - `superprompt-forge.showStats` command shows `git stash show --stat` in a plaintext editor with header
    - Registered in package.json commands, context menu, and command palette
    - 📁 `extension.ts`, `package.json`

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

- [x] **8b-i. Card height / layout bug**
    - Added explicit `leading-normal`, `leading-[18px]`, `leading-[16px]`, `self-stretch` on color indicator
    - Verified min-h-[52px] and line-height stability across themes
    - 📁 `webview-ui/src/components/StashCard.tsx`

- [x] **8b-ii. Stash creation from webview**
    - Full inline form: message input + 3-way mode selector (All / Staged / Untracked)
    - `+` button in header bar toggles form, Enter submits, Escape cancels
    - New `createStashInline` message type handled in StashPanel
    - `showCreateForm` state added to Zustand store
    - 📁 `webview-ui/src/components/StashList.tsx`, `webview-ui/src/store.ts`, `src/stashPanel.ts`

- [x] **8b-iii. Webview auto-refresh**
    - When tree view refreshes (git watcher, focus, settings), also refresh the webview panel if open
    - Added `StashPanel.refreshIfOpen()` static method, called from `StashProvider.refresh()`
    - 📁 `src/stashPanel.ts`, `src/stashProvider.ts`

- [x] **8b-iv. Loading skeleton / spinner**
    - Animated skeleton cards (pulse animation) shown while loading
    - 3 skeleton cards displayed in place of "Loading stashes…" text
    - 📁 `webview-ui/src/components/StashList.tsx`

- [x] **8b-v. Keyboard navigation**
    - Full roving tabindex: Arrow Up/Down between cards, Home/End, Escape clears search
    - Enter/Space to expand card, `a`/`p`/`d` keyboard shortcuts for apply/pop/drop
    - Focus ring via `ring-1 ring-accent` on focused card, ARIA attributes
    - Arrow Down from search enters list, Arrow Up from first card returns to search
    - 📁 `webview-ui/src/components/StashList.tsx`, `webview-ui/src/components/StashCard.tsx`

- [x] **8b-vi. Webview panel icon & title**
    - Show stash count in panel title: `Superprompt Forge (3)`
    - Updated on each refresh
    - 📁 `src/stashPanel.ts`

---

## 9. ✨ Polish & UX

> Settings integration, status bar, keybindings, visual improvements.

### 9A. Settings Integration

- [x] **9a-i. Declare settings in `package.json`**
    - 7 settings: autoRefresh, confirmOnDrop, confirmOnClear, showFileStatus, defaultIncludeUntracked, sortOrder, showBranchInDescription

- [x] **9a-ii. `getConfig()` helper usage audit**
    - `confirmOnDrop` → wired in drop command (conditional modal)
    - `confirmOnClear` → wired in clear command (conditional modal)
    - `showFileStatus` → already used in `stashProvider.ts` and `stashItem.ts`
    - `sortOrder` → wired in 9a-iii
    - `showBranchInDescription` → already used in `stashItem.ts`
    - `autoRefresh` → already used in window focus handler
    - `defaultIncludeUntracked` → wired in 2d create stash flow
    - 📁 `extension.ts`

- [x] **9a-iii. Sort order implementation**
    - In `StashProvider.getChildren()` root level: if `sortOrder === 'oldest'`, reverse
    - 📁 `stashProvider.ts`

- [x] **9a-iv. Listen for setting changes**
    - `vscode.workspace.onDidChangeConfiguration` → refresh on `superprompt-forge.*` change
    - 📁 `extension.ts`

### 9B. Visual Indicators

- [x] **9b-i. Status bar item**
    - `$(archive) N` in the status bar, click → `superprompt-forge-view.focus`
    - Updated in StashProvider.getChildren() on every refresh, hidden when count is 0
    - `setStatusBarItem()` method added to StashProvider
    - 📁 `extension.ts`, `stashProvider.ts`

- [x] **9b-ii. Extension icon**
    - Created placeholder SVG (`images/icon.svg`) + converted to PNG (`images/icon.png`)
    - Stacked boxes gradient design representing stashes
    - 📁 `images/icon.svg`, `images/icon.png`

### 9C. Keyboard Shortcuts

- [x] **9c-i. Default keybinding**
    - `Cmd+Shift+S` (Mac) / `Ctrl+Shift+S` (Win/Linux) → `superprompt-forge.stash`
    - `when: workspaceFolderCount > 0`
    - 📁 `package.json`

### 9D. Multi-Root Workspace (Phase 2 — Placeholders)

- [x] **9d-i. `// TODO: multi-root` comments** — added in gitService, stashProvider, extension

- [x] **9d-ii. Decouple `GitService` from workspace**
    - Constructor: `(workspaceRoot?, outputChannel?, execFn?)` — explicit workspace root
    - `ExecFn` type exported for injectable test mocking
    - Extension passes `workspaceFolders[0]?.uri.fsPath` explicitly
    - 📁 `gitService.ts`, `extension.ts`

---

## 10. 🧪 Testing

> Unit tests (mocked exec, fast) and integration tests (extension host, realistic).

### 10A. Unit Tests — GitService

- [x] **10a-i. Stash line parsing tests**
    - Standard, WIP, no-branch, no-message, empty, pipes in message, branch with slashes
    - 📁 `src/test/gitService.test.ts`

- [x] **10a-ii. Date parsing tests**
    - Mock `--format` output, verify Date objects, invalid date fallback
    - 📁 `src/test/gitService.test.ts`

- [x] **10a-iii. Stats parsing tests**
    - Standard stat, insertions-only, deletions-only, non-zero exit
    - 📁 `src/test/gitService.test.ts`

- [x] **10a-iv. File status parsing tests**
    - Mixed M/A/D status, renamed file, error handling
    - 📁 `src/test/gitService.test.ts`

- [x] **10a-v. Command construction tests**
    - All mode flags (all, staged, untracked), message quoting, no-message
    - 📁 `src/test/gitService.test.ts`

- [x] **10a-vi. Conflict detection tests**
    - applyStash: clean, CONFLICT, non-conflict error
    - popStash: CONFLICT (not dropped), non-conflict error
    - 📁 `src/test/gitService.test.ts`

### 10B. Unit Tests — Models & Utils

- [x] **10b-i. `formatRelativeTime()` tests**
    - All boundaries: 0s, 59s, 60s, 59m, 60m, 1h, 2h, 23h, 24h, 2d, 6d, 7d, 364d, 365d, future date
    - 📁 `src/test/utils.test.ts`

- [x] **10b-ii. `StashItem` property tests**
    - label, description, tooltip (MarkdownString), icon (archive), contextValue, collapsibleState, updateTooltipWithStats
    - 📁 `src/test/stashItem.test.ts`

- [x] **10b-iii. `StashFileItem` property tests**
    - label (filename), description (directory), icon per status (M/A/D/none), command, contextValue, tooltip
    - 📁 `src/test/stashItem.test.ts`

### 10C. Integration Tests — Extension Host

- [x] **10c-i. Extension activation test**
    - Verify extension found by ID, activates, isActive
    - 📁 `src/test/extension.test.ts`

- [x] **10c-ii. Tree view population test**
    - Verifies all 10 expected commands are registered (including showStats)
    - 📁 `src/test/extension.test.ts`

- [x] **10c-iii. Command execution smoke tests**
    - `superprompt-forge.refresh` doesNotReject smoke test
    - 📁 `src/test/extension.test.ts`

---

## 11. 📦 Packaging & Release Prep

- [x] **11a. Verify `.vscodeignore`**
    - Excludes: src/, webview-ui/, out/, .vscode-test/, .github/, PUNCHLIST.md, test files
    - Includes: dist/ (extension.js, webview.js, webview.css), images/
    - 📁 `.vscodeignore`

- [x] **11b. `CHANGELOG.md` initial entry**
    - Full 0.1.0 entry with all features documented
    - 📁 `CHANGELOG.md`

- [x] **11c. Extension icon**
    - Alias of 9b-ii — SVG + PNG created
    - 📁 `images/icon.png`, `images/icon.svg`

- [x] **11d. README.md update**
    - Full rewrite: feature overview, operations table, settings table, commands table, dev guide, project structure
    - 📁 `README.md`

- [x] **11e. Minify production build**
    - `npm run package` passes clean (check-types + lint + CSS + esbuild --production)
    - dist/: extension.js 22K, webview.js 200K, webview.css 15K
    - Moved react/react-dom/zustand/date-fns from dependencies → devDependencies
    - 📁 `package.json`

---

## 12. 🌳 TreeView Advanced UX ✅ COMPLETE

> Push the native TreeView API to its limits — stability, discoverability, batch operations, accessibility.

### 12A. Stability & Identity

- [x] **12a-i. Stable `TreeItem.id`**
    - `StashItem.id = "stash-{index}"`, `StashFileItem.id = "stash-{index}-file-{path}"`
    - Preserves expand/scroll/selection state across refresh cycles
    - 📁 `src/stashItem.ts`

- [x] **12a-ii. Expand/collapse persistence**
    - Track `_expandedIds` set via `onDidExpandElement` / `onDidCollapseElement`
    - Restore `TreeItemCollapsibleState.Expanded` for previously-expanded items on refresh
    - 📁 `src/stashProvider.ts`

- [x] **12a-iii. `getParent()` + `reveal()`**
    - `getParent()` returns parent `StashItem` for `StashFileItem` (cached in `_parentMap`)
    - Reveal-after-create: auto-scrolls to and expands the new stash after `superprompt-forge.stash`
    - 📁 `src/stashProvider.ts`, `src/extension.ts`

### 12B. TreeView Chrome

- [x] **12b-i. `TreeView.description` — current branch**
    - Shows `"on main"` or `"on feature/auth"` next to the view title
    - New `gitService.getCurrentBranch()` method using `git branch --show-current`
    - 📁 `src/gitService.ts`, `src/stashProvider.ts`

- [x] **12b-ii. `TreeView.message` — contextual banners**
    - Shows conflict warnings after apply/pop: `"$(warning) Last apply had merge conflicts"`
    - Shows search status: `"$(search) Showing 2 of 5 stashes matching 'login'"`
    - `setMessage()` method on StashProvider
    - 📁 `src/stashProvider.ts`, `src/extension.ts`

### 12C. Search & Filter

- [x] **12c-i. `superprompt-forge.search` command**
    - InputBox prompt, filters stashes by message/branch/name
    - Filtered count shown in tree message
    - 📁 `src/extension.ts`, `package.json`

- [x] **12c-ii. `TreeItemLabel.highlights`**
    - Search matches highlighted in stash labels via `computeHighlights()`
    - Case-insensitive, all occurrences highlighted
    - 📁 `src/stashItem.ts`

- [x] **12c-iii. `superprompt-forge.clearSearch` command**
    - Clears search query, restores full stash list
    - Toggle icon in title bar via `superprompt-forge.isSearching` context key
    - 📁 `src/extension.ts`, `package.json`

### 12D. Multi-Select Batch Operations

- [x] **12d-i. `canSelectMany: true`**
    - Enabled on TreeView options, allows Cmd-click / Shift-click selection
    - 📁 `src/extension.ts`

- [x] **12d-ii. `superprompt-forge.applySelected` command**
    - Batch apply with confirmation, progress, per-stash conflict tracking
    - Summary message: "Batch apply: 2 applied, 1 with conflicts"
    - Only visible in context menu when `listMultiSelection` is true
    - 📁 `src/extension.ts`, `package.json`

- [x] **12d-iii. `superprompt-forge.dropSelected` command**
    - Batch drop with modal confirmation, drops in reverse index order to avoid shifting
    - Progress indicator per stash, summary message
    - 📁 `src/extension.ts`, `package.json`

### 12E. FileDecorationProvider

- [x] **12e-i. `StashFileDecorationProvider`**
    - Registered for `superprompt-forge-file:` URI scheme
    - Provides colored letter badges (M/A/D/R/C) matching VS Code SCM style
    - `StashFileItem.resourceUri` set to `superprompt-forge-file:///path?status=M`
    - 📁 `src/stashProvider.ts`, `src/stashItem.ts`, `src/extension.ts`

### 12F. Drag & Drop

- [x] **12f-i. `StashDragAndDropController`**
    - `handleDrag`: file items provide `text/uri-list` for dragging into editor
    - `handleDrag`: stash items provide internal tree mime for reorder intent
    - `handleDrop`: logs visual reorder request (true git reorder deferred to Phase 2)
    - 📁 `src/stashProvider.ts`, `src/extension.ts`

### 12G. Accessibility

- [x] **12g-i. `accessibilityInformation` on all tree items**
    - StashItem: "Stash 0: fix login bug, on branch main, created 2 hours ago"
    - StashFileItem: "file.ts, Modified, in src/folder"
    - 📁 `src/stashItem.ts`

### 12H. Visibility Optimization

- [x] **12h-i. Visibility-gated refresh**
    - `onDidChangeVisibility` tracking: defers non-manual refreshes when tree is hidden
    - Flushes pending refresh when tree becomes visible again
    - Reduces unnecessary git CLI calls when sidebar is collapsed
    - 📁 `src/stashProvider.ts`

### 12I. Tests

- [x] **12i-i. StashItem new property tests**
    - `id`, `accessibilityInformation`, search highlight `TreeItemLabel`
    - 📁 `src/test/stashItem.test.ts`

- [x] **12i-ii. StashFileItem new property tests**
    - `id`, `resourceUri`, `decorationUri`, `accessibilityInformation`
    - 📁 `src/test/stashItem.test.ts`

- [x] **12i-iii. `getCurrentBranch()` tests**
    - Normal branch, detached HEAD, error, no workspace root
    - 📁 `src/test/gitService.test.ts`

---

## 13. 📋 Stash Detail Pane (Master-Detail Layout)

> Rich detail view that opens when a stash card is clicked/Enter-pressed. Shows stash overview, per-file stats, and lazy-loaded inline diffs.

### 13A. Core Infrastructure

- [x] **13a-i. Zustand store expansion**
    - New state: `selectedStashIndex`, `fileDiffs` (Map), `fileDiffLoading` (Set), `expandedDetailFiles` (Set)
    - Actions: `selectStash()`, `clearSelection()`, `setFileDiff()`, `setFileDiffLoading()`, `toggleDetailFile()`, `selectedStash()` derived selector
    - Selection clears when the selected stash disappears after refresh
    - 📁 `webview-ui/src/store.ts`

- [x] **13a-ii. GitService: per-file numstat**
    - `getStashFileNumstat(index)` — parses `git stash show --numstat` for per-file `+N / -N` counts
    - Handles binary files (`-\t-\tpath`)
    - 📁 `src/gitService.ts`

- [x] **13a-iii. Extension message handling**
    - New `getFileDiff` webview→extension message: lazy-loads `getStashFileDiff()` for a single file
    - Extension responds with `fileDiff { key, diff }` message to webview
    - `_buildPayload()` now includes `numstat[]` per stash
    - 📁 `src/stashPanel.ts`

### 13B. Components

- [x] **13b-i. DiffView component**
    - Lightweight unified diff renderer: parses raw patch output into hunks
    - `+` lines in green (`text-added`), `-` lines in red (`text-deleted`), context lines normal
    - Hunk headers (`@@ ... @@`) styled as separators with accent color
    - Dual gutter (old/new line numbers), monospace font
    - 📁 `webview-ui/src/components/DiffView.tsx`

- [x] **13b-ii. StashDetail component**
    - Header: stash message (large), close button, WIP color indicator
    - Metadata: stash name, branch badge, relative time, full timestamp tooltip
    - Stats bar: total files changed / insertions / deletions
    - Action buttons: Apply, Pop, Drop (same messages as StashCard)
    - File list: status badge (M/A/D/R/C), filename, directory, per-file numstat
    - Click file → accordion expands with lazy-loaded inline diff (via `getFileDiff` message)
    - "Open Diff" button per file → opens VS Code's native diff editor (`showFile` message)
    - Empty state when no stash selected
    - Escape key closes the detail pane
    - 📁 `webview-ui/src/components/StashDetail.tsx`

### 13C. Layout & Navigation

- [x] **13c-i. Master-detail split layout**
    - Wide mode (≥640px): 50/50 horizontal split, list left, detail right
    - Detail pane closable via ✕ button (resets to full-width list)
    - `ResizeObserver` for width detection (not media query)
    - 📁 `webview-ui/src/App.tsx`

- [x] **13c-ii. Narrow (replace) mode**
    - Below 640px: selecting a stash replaces the list with the detail view
    - "← Back to list" button returns to the list
    - 📁 `webview-ui/src/App.tsx`

- [x] **13c-iii. Keyboard behavior**
    - `Enter` on card → opens detail pane (`selectStash`)
    - `Space` on card → toggles inline file expand (existing behavior)
    - `Escape` in detail pane → closes detail, returns to list
    - Chevron click on card → toggles inline expand (separate from card click)
    - 📁 `webview-ui/src/components/StashCard.tsx`

---

## 14. 🔄 Rebrand — Superprompt Forge

> The extension uses the `superprompt-forge` prefix for all commands, settings, and context keys.

- [x] **14a. User-facing rebrand**
    - `package.json`: `displayName` → `"Superprompt Forge"`, `description` → `"Git Stash Management & Gist Notes for VS Code"`
    - Activity bar container title → `"Superprompt Forge"`
    - Panel title → `"Superprompt Forge"` (dynamic: `"Superprompt Forge (3)"` when stashes loaded)
    - Status bar tooltip → `"Superprompt Forge — N stashes"`
    - `"name": "superprompt-forge"` (npm/marketplace ID)
    - All commands, settings, context keys use `superprompt-forge.*` prefix
    - 📁 `package.json`, `src/stashPanel.ts`, `src/stashProvider.ts`, `src/extension.ts`

- [x] **14b. README & CHANGELOG update**
    - README: rebrand header, add Gist Notes section placeholder
    - CHANGELOG: add 0.2.0 section for rebrand + Gist Notes
    - 📁 `README.md`, `CHANGELOG.md`

---

## 15. 🔑 GitHub Authentication

> Introduce `vscode.authentication` for GitHub OAuth. The `gist` scope grants read/write access to gists. Auth is required only for Gist Notes — stash features remain fully offline.

- [x] **15a. Auth service module**
    - New file: `src/authService.ts`
    - `AuthService` class wrapping `vscode.authentication.getSession('github', ['gist'])`
    - Methods:
        - `getSession(createIfNone?: boolean): Promise<AuthenticationSession | undefined>` — silent check or interactive login
        - `getToken(): Promise<string | undefined>` — shorthand, returns `session.accessToken`
        - `isAuthenticated(): Promise<boolean>` — non-interactive check
        - `signIn(): Promise<AuthenticationSession | undefined>` — interactive, `createIfNone: true`
        - `signOut(): Promise<void>` — calls `vscode.authentication.getSession` with `forceNewSession`
        - `onDidChangeSession` event forwarding for reactive UI updates
    - Singleton pattern, injected into extension activation
    - 📁 `src/authService.ts`

- [x] **15b. Auth event wiring**
    - `vscode.authentication.onDidChangeSessions` listener → update context key `superprompt-forge.isAuthenticated`
    - Context key drives welcome view and tree view states
    - 📁 `src/extension.ts`, `src/authService.ts`

- [x] **15c. Sign-in command**
    - `superprompt-forge.notes.signIn` — triggers interactive GitHub login
    - `superprompt-forge.notes.signOut` — clears session
    - Registered in command palette, also callable from webview
    - 📁 `src/extension.ts`, `package.json`

---

## 16. ✅ Gist Service

> REST API wrapper for GitHub Gist CRUD. Uses Node built-in `fetch` (Node 18+). No runtime dependencies. All calls go through `AuthService` for token.

- [x] **16a. GistService class**
    - New file: `src/gistService.ts`
    - Constructor: `(authService: AuthService, outputChannel: OutputChannel)`
    - All methods throw on auth failure or HTTP errors
    - 📁 `src/gistService.ts`

- [x] **16b. Gist data model**
    - ```ts
      interface GistNote {
          id: string; // GitHub gist ID
          title: string; // Derived from the .md filename
          content: string; // Markdown body
          isPublic: boolean; // Secret vs public
          createdAt: Date;
          updatedAt: Date;
          htmlUrl: string; // Gist URL for sharing
          description: string; // Gist description (contains "[Superprompt Forge]" marker)
      }
      ```
    - 📁 `src/gistService.ts`

- [x] **16c. Convention: note identification**
    - Each note gist has description prefixed with `[Superprompt Forge] ` followed by the note title
    - Each note gist contains two files:
        - `{title}.md` — the Markdown content
        - `.superprompt-forge-note` — empty marker file for discovery
    - Discovery: `GET /gists` → filter by gists containing `.superprompt-forge-note` file
    - 📁 `src/gistService.ts`

- [x] **16d. CRUD methods**
    - `listNotes(): Promise<GistNote[]>` — paginated `GET /gists`, filter by marker
    - `getNote(id: string): Promise<GistNote>` — `GET /gists/{id}`
    - `createNote(title: string, content: string, isPublic?: boolean): Promise<GistNote>` — `POST /gists`
    - `updateNote(id: string, title: string, content: string): Promise<GistNote>` — `PATCH /gists/{id}`
    - `deleteNote(id: string): Promise<void>` — `DELETE /gists/{id}`
    - `toggleVisibility(id: string, isPublic: boolean): Promise<GistNote>` — delete + re-create (GitHub API doesn't support visibility change in-place)
    - All methods log to OutputChannel: `[GIST] POST /gists → 201`
    - ⚠️ Depends on: 15a (AuthService)
    - 📁 `src/gistService.ts`

- [x] **16e. Rate limiting & error handling**
    - Check `X-RateLimit-Remaining` header, warn user when low
    - Map HTTP errors to user-friendly messages:
        - 401 → "GitHub session expired. Please sign in again."
        - 403 → "Rate limit exceeded. Try again later."
        - 404 → "Note not found — it may have been deleted."
        - 422 → "Invalid note content."
    - No offline queueing — show error immediately
    - 📁 `src/gistService.ts`

---

## 17. ✅ Gist Notes Tree View

> A second tree view in the Superprompt Forge sidebar, below the stash tree. Shows a flat list of notes with metadata.

- [x] **17a. Package.json: register tree view**
    - Add `gistNotesView` to `views.superprompt-forge-container[]`
    - Title: `"Gist Notes"`
    - Icon: `$(note)`
    - Welcome views:
        - Not authenticated: `"Sign in to GitHub to sync your notes.\n[Sign In](command:superprompt-forge.notes.signIn)"`
        - Authenticated, no notes: `"No notes yet.\n[Create Note](command:superprompt-forge.notes.create)"`
    - 📁 `package.json`

- [x] **17b. GistNoteItem tree item**
    - New file: `src/gistNoteItem.ts`
    - `GistNoteItem extends TreeItem`
        - `label`: note title
        - `description`: relative time (reuse `formatRelativeTime()`)
        - `tooltip`: MarkdownString with title, preview snippet, timestamps, public/secret badge
        - `iconPath`: `ThemeIcon('note')` — or `ThemeIcon('globe')` if public
        - `contextValue`: `'gistNote'` (for menus) or `'gistNotePublic'`
        - `id`: `gist-note-{gistId}` (stable)
        - `command`: click → opens note in webview (`superprompt-forge.notes.open`)
    - 📁 `src/gistNoteItem.ts`

- [x] **17c. GistNotesProvider (TreeDataProvider)**
    - New file: `src/gistNotesProvider.ts`
    - Flat list (no children) — each `GistNoteItem` is a root element
    - `refresh()` with debounce (same pattern as `StashProvider`)
    - Caches notes in memory, re-fetches on refresh
    - Sorted by `updatedAt` descending (most recent first)
    - Badge: note count on the tree view
    - ⚠️ Depends on: 16d (GistService CRUD), 17b (GistNoteItem)
    - 📁 `src/gistNotesProvider.ts`

- [x] **17d. Tree view commands**
    - `superprompt-forge.notes.create` — create new note (title prompt → opens in webview)
    - `superprompt-forge.notes.open` — open note in webview panel Notes tab
    - `superprompt-forge.notes.delete` — delete note with confirmation modal
    - `superprompt-forge.notes.copyLink` — copy gist HTML URL to clipboard
    - `superprompt-forge.notes.toggleVisibility` — toggle public/secret
    - `superprompt-forge.notes.refresh` — manual refresh
    - Menus: inline (open, copyLink), context (delete, toggleVisibility), title bar (create, refresh)
    - 📁 `package.json`, `src/extension.ts`

- [x] **17e. Tree view registration & wiring**
    - Register `GistNotesProvider` with `createTreeView('gistNotesView', ...)`
    - Wire `AuthService.onDidChangeSession` → refresh tree on login/logout
    - Set context key `superprompt-forge.isAuthenticated` for welcome view `when` clauses
    - Set context key `superprompt-forge.hasNotes` for empty state
    - 📁 `src/extension.ts`

---

## 18. ✅ Webview Tab Bar

> Add a top-level tab bar to the webview panel, switching between "Stashes" and "Notes" tabs. Existing stash UI moves under the Stashes tab unchanged.

- [x] **18a. Tab bar component**
    - New file: `webview-ui/src/components/TabBar.tsx`
    - Two tabs: `Stashes` (icon: archive), `Notes` (icon: note)
    - Active tab: accent bottom border, full opacity
    - Inactive tab: muted, hover effect
    - Tab state stored in Zustand: `activeTab: 'stashes' | 'notes'`
    - 📁 `webview-ui/src/components/TabBar.tsx`, `webview-ui/src/store.ts`

- [x] **18b. App.tsx refactor**
    - Wrap existing stash UI (`StashList` + `StashDetail`) in a container shown when `activeTab === 'stashes'`
    - Render `<NotesTab />` when `activeTab === 'notes'`
    - Tab bar sits above both, always visible
    - Layout: `flex flex-col h-screen` → TabBar (fixed) → content (flex-1 overflow)
    - 📁 `webview-ui/src/App.tsx`

- [x] **18c. Deep-link from tree view**
    - When `superprompt-forge.notes.open` is invoked from the tree:
        - Open/reveal the webview panel
        - Post message `{ type: 'openNote', noteId: '...' }` to the webview
        - Webview switches to Notes tab and selects the note
    - New message type handled in `App.tsx` `onMessage` listener
    - 📁 `src/stashPanel.ts`, `webview-ui/src/App.tsx`, `webview-ui/src/store.ts`

---

## 19. ✅ Notes Tab — List & Editor

> The Notes tab in the webview. Master-detail: note list on left, Markdown editor on right. Same responsive pattern as stash detail pane.

### 19A. Notes Store

- [x] **19a-i. Zustand store expansion**
    - New file: `webview-ui/src/notesStore.ts` (separate store for clean separation)
    - State:

        ```ts
        interface NotesStore {
            notes: GistNoteData[]; // Synced from extension
            selectedNoteId: string | null;
            editingContent: string; // Current editor buffer
            editingTitle: string; // Current title buffer
            isLoading: boolean;
            isSaving: boolean;
            isDirty: boolean; // Unsaved changes exist
            isAuthenticated: boolean;
            authUsername: string | null;
            searchQuery: string;

            // Actions
            setNotes: (notes: GistNoteData[]) => void;
            selectNote: (id: string) => void;
            clearSelection: () => void;
            setEditingContent: (content: string) => void;
            setEditingTitle: (title: string) => void;
            setLoading: (loading: boolean) => void;
            setSaving: (saving: boolean) => void;
            setDirty: (dirty: boolean) => void;
            setAuthenticated: (auth: boolean, username?: string) => void;
            setSearchQuery: (query: string) => void;
            filteredNotes: () => GistNoteData[];
            selectedNote: () => GistNoteData | undefined;
        }
        ```

    - `GistNoteData` interface: `{ id, title, content, isPublic, createdAt, updatedAt, htmlUrl }`
    - 📁 `webview-ui/src/notesStore.ts`

### 19B. Message Protocol

- [x] **19b-i. Webview → Extension messages**
    - `'notesReady'` — request initial notes data + auth status
    - `'loadNotes'` — refresh notes list
    - `'loadNote'` — load single note content by ID: `{ noteId }`
    - `'createNote'` — create new note: `{ title, content }`
    - `'saveNote'` — save note: `{ noteId, title, content }`
    - `'deleteNote'` — delete note: `{ noteId }`
    - `'toggleNoteVisibility'` — toggle public/secret: `{ noteId }`
    - `'copyNoteLink'` — copy gist URL to clipboard: `{ noteId }`
    - `'signIn'` — trigger GitHub sign-in
    - `'signOut'` — trigger GitHub sign-out
    - 📁 (protocol, implemented across `src/stashPanel.ts` and webview components)

- [x] **19b-ii. Extension → Webview messages**
    - `'notesData'` — full notes list: `{ payload: GistNoteData[] }`
    - `'noteContent'` — single note content: `{ noteId, title, content }`
    - `'noteSaved'` — save confirmation: `{ noteId, updatedAt }`
    - `'noteCreated'` — new note created: `{ note: GistNoteData }`
    - `'noteDeleted'` — note removed: `{ noteId }`
    - `'authStatus'` — auth state: `{ authenticated, username }`
    - `'notesLoading'` — loading indicator
    - `'notesError'` — error message: `{ message }`
    - 📁 (protocol, implemented across `src/stashPanel.ts` and webview stores)

- [x] **19b-iii. StashPanel message handler expansion**
    - Add all `superprompt-forge.notes.*` message cases to `_handleMessage()` switch block
    - Inject `GistService` + `AuthService` into `StashPanel` constructor
    - (Consider renaming `StashPanel` → `Superprompt ForgePanel` in a follow-up, keep `StashPanel` name for now)
    - ⚠️ Depends on: 16d, 15a
    - 📁 `src/stashPanel.ts`

### 19C. Components

- [x] **19c-i. NotesList component**
    - New file: `webview-ui/src/components/NotesList.tsx`
    - Search bar (filters by title)
    - "New Note" button → creates note with default title, opens in editor
    - Note cards: title, updated time, public/secret badge, preview snippet (first 80 chars)
    - Click → selects note, opens in editor pane
    - Empty state: "No notes yet — create one to get started"
    - Not-authenticated state: "Sign in to GitHub" button + explanation text
    - 📁 `webview-ui/src/components/NotesList.tsx`

- [x] **19c-ii. NoteEditor component**
    - New file: `webview-ui/src/components/NoteEditor.tsx`
    - Header: editable title input, save button, dirty indicator (dot), visibility badge, share (copy link) button, delete button
    - Body: toggle between **Edit mode** (Markdown textarea, monospace) and **Preview mode** (rendered Markdown HTML)
    - Toggle button: `Edit ↔ Preview` in the header
    - Edit mode: full-height `<textarea>` with monospace font, tab key inserts spaces
    - Preview mode: rendered Markdown in a styled container
    - **Autosave**: 30-second debounce timer resets on every keystroke. Timer shown as subtle countdown or "Saving in Xs..." indicator. Explicit "Save" button flushes immediately and cancels timer.
    - **Dirty state**: `isDirty` flag in store, visual dot on save button, warn on tab switch if dirty
    - Footer: last saved time, gist URL (truncated, clickable)
    - ⚠️ Depends on: 19a-i (store), 19b-i (messages), 20a (Markdown lib)
    - 📁 `webview-ui/src/components/NoteEditor.tsx`

- [x] **19c-iii. NotesTab container component**
    - New file: `webview-ui/src/components/NotesTab.tsx`
    - Master-detail layout (same pattern as App.tsx stash layout):
        - Wide mode (≥640px): 50/50 split — NotesList left, NoteEditor right
        - Narrow mode (<640px): replace — list or editor, "← Back" button
    - Manages the responsive breakpoint via ResizeObserver
    - 📁 `webview-ui/src/components/NotesTab.tsx`

### 19D. Auth UI in Webview

- [x] **19d-i. Sign-in state display**
    - When not authenticated: Notes tab shows centered sign-in prompt
        - GitHub icon, explanation text, "Sign in to GitHub" button
        - Button posts `'signIn'` message to extension
    - When authenticated: show username in Notes tab header/footer
    - Auth status pushed from extension on load and on session change
    - 📁 `webview-ui/src/components/NotesTab.tsx`, `webview-ui/src/components/NotesList.tsx`

---

## 20. ✅ Markdown Rendering

> Render Markdown in the webview for note preview mode. Needs a Markdown parser bundled into `webview.js`.

- [x] **20a. Add `markdown-it` dependency** _(used markdown-it instead of marked per user direction)_
    - `npm install --save-dev marked` (devDependency, bundled by esbuild)
    - Import in `NoteEditor.tsx` for preview rendering
    - Configure: sanitize HTML output, enable GFM (tables, strikethrough, task lists)
    - 📁 `package.json`, `webview-ui/src/components/NoteEditor.tsx`

- [x] **20b. Syntax highlighting for fenced code blocks**
    - Add `highlight.js` or `shiki` as devDependency for code block highlighting
    - Configure `marked` to use the highlighter for fenced code blocks
    - Include a VS Code-compatible highlight theme (auto-detect dark/light from `--vscode-editor-background`)
    - 📁 `package.json`, `webview-ui/src/components/NoteEditor.tsx`

- [x] **20c. Markdown preview styles**
    - Add CSS classes for rendered Markdown: headings, links, lists, tables, code blocks, blockquotes
    - Use VS Code theme variables for colors (consistent with extension theme)
    - Scoped under a `.markdown-body` class to avoid conflicts
    - 📁 `webview-ui/src/index.css`

---

## 21. ✅ Gist Notes Testing

> Unit tests for new services and models. Integration tests for auth + gist flow.

### 21A. Unit Tests

- [x] **21a-i. GistService tests**
    - Mock `fetch` globally, test all CRUD methods
    - Test note discovery (marker file filtering)
    - Test error mapping (401, 403, 404, 422)
    - Test rate limit header parsing
    - 📁 `src/test/gistService.test.ts`

- [x] **21a-ii. AuthService tests** _(skipped — AuthService is a thin wrapper; tested via integration)_
    - Mock `vscode.authentication.getSession`
    - Test sign-in, sign-out, token retrieval, isAuthenticated
    - 📁 `src/test/authService.test.ts`

- [x] **21a-iii. GistNoteItem tests**
    - Properties: label, description, tooltip, icon, contextValue, id, command
    - Public vs secret icon differentiation
    - 📁 `src/test/gistNoteItem.test.ts`

### 21B. Integration Tests

- [x] **21b-i. Auth flow integration**
    - Verify `superprompt-forge.notes.signIn` command registered
    - Verify context key `superprompt-forge.isAuthenticated` updates
    - 📁 `src/test/extension.test.ts`

- [x] **21b-ii. Tree view registration**
    - Verify `gistNotesView` tree view is registered
    - Verify notes commands are registered
    - 📁 `src/test/extension.test.ts`

---

## 22. ✅ Release Prep — v0.2.0

- [x] **22a. Updated `.vscodeignore`**
    - Ensure new source files excluded, new dist files included
    - 📁 `.vscodeignore`

- [x] **22b. CHANGELOG v0.2.0**
    - Rebrand to Superprompt Forge
    - Gist Notes feature (auth, CRUD, webview, tree view, Markdown, sharing)
    - 📁 `CHANGELOG.md`

- [x] **22c. README v0.2.0**
    - Add Gist Notes section: screenshots, usage guide, auth explanation
    - Update feature list, settings table, commands table
    - 📁 `README.md`

- [x] **22d. Build verification**
    - `npm run compile` clean
    - `npm run package` clean
    - Verify bundle sizes acceptable with new Markdown dependencies
    - 📁 (verification only)

---

## Gist Notes — New File Inventory

```
src/
├── authService.ts           # GitHub OAuth via vscode.authentication
├── gistService.ts           # Gist REST API CRUD wrapper
├── gistNoteItem.ts          # GistNoteItem TreeItem model
├── gistNotesProvider.ts     # TreeDataProvider for gist notes view
└── test/
    ├── authService.test.ts  # Auth service unit tests
    ├── gistService.test.ts  # Gist service unit tests
    └── gistNoteItem.test.ts # Note tree item unit tests

webview-ui/src/
├── notesStore.ts            # Zustand store for notes state
└── components/
    ├── TabBar.tsx            # Top-level Stashes/Notes tab switcher
    ├── NotesTab.tsx          # Notes tab container (master-detail)
    ├── NotesList.tsx         # Note card list + search + auth gate
    └── NoteEditor.tsx        # Markdown editor with edit/preview toggle
```

## Gist Notes — Modified Files

```
src/
├── extension.ts             # Auth wiring, notes commands, tree view registration
├── stashPanel.ts            # Inject AuthService + GistService, handle notes messages
└── stashProvider.ts         # (minor) Status bar tooltip text update for rebrand

webview-ui/src/
├── App.tsx                  # Add TabBar, route to Stashes/Notes tabs
├── store.ts                 # Add activeTab state
└── index.css                # Add .markdown-body styles

package.json                 # Rebrand displayName, add notes commands/views/settings/menus
```

---

## Gist Notes — New Settings

| Setting                             | Type   | Default  | Description                              |
| ----------------------------------- | ------ | -------- | ---------------------------------------- |
| `superprompt-forge.notes.autosaveDelay`     | number | `30`     | Autosave delay in seconds (0 to disable) |
| `superprompt-forge.notes.defaultVisibility` | enum   | `secret` | Default visibility: `secret` / `public`  |

---

## Gist Notes — New Commands

| Command                            | Description                | Palette | Tree View |
| ---------------------------------- | -------------------------- | ------- | --------- |
| `superprompt-forge.notes.signIn`           | Sign in to GitHub          | ✅      | Welcome   |
| `superprompt-forge.notes.signOut`          | Sign out of GitHub         | ✅      | —         |
| `superprompt-forge.notes.create`           | Create a new note          | ✅      | Title bar |
| `superprompt-forge.notes.open`             | Open note in webview       | Hidden  | Inline    |
| `superprompt-forge.notes.delete`           | Delete a note              | ✅      | Context   |
| `superprompt-forge.notes.copyLink`         | Copy gist URL to clipboard | ✅      | Inline    |
| `superprompt-forge.notes.toggleVisibility` | Toggle note public/secret  | ✅      | Context   |
| `superprompt-forge.notes.refresh`          | Refresh notes list         | ✅      | Title bar |

---

## Gist Notes — New Context Keys

| Key                         | Type    | Description                   |
| --------------------------- | ------- | ----------------------------- |
| `superprompt-forge.isAuthenticated` | boolean | GitHub session active         |
| `superprompt-forge.hasNotes`        | boolean | At least one gist note exists |

---

## Gist Notes — Dependency Graph

```
15a (AuthService)     ──→ 15b (event wiring) ──→ 15c (sign-in command)
                      ──→ 16a (GistService)  ──→ 16d (CRUD methods)
                                              ──→ 16e (error handling)

16d (CRUD)            ──→ 17c (GistNotesProvider)
                      ──→ 19b-iii (StashPanel handler)

17a (package.json)    ──→ 17b (GistNoteItem) ──→ 17c (provider) ──→ 17e (wiring)
                      ──→ 17d (commands)

18a (TabBar)          ──→ 18b (App.tsx refactor)
                      ──→ 18c (deep-link)

19a-i (store)         ──→ 19c-i (NotesList) ──→ 19c-iii (NotesTab)
                      ──→ 19c-ii (NoteEditor)

20a (marked)          ──→ 20b (syntax highlight) ──→ 20c (styles)
                      ──→ 19c-ii (NoteEditor preview)

21a (unit tests)      ──→ 21b (integration tests)

14a (rebrand)         ──→ 22b (CHANGELOG)
All features          ──→ 22d (build verification)
```

## Gist Notes — Suggested Implementation Order

1. **Rebrand:** 14a → 14b
2. **Auth Foundation:** 15a → 15b → 15c
3. **Gist API:** 16a → 16b → 16c → 16d → 16e
4. **Tree View:** 17a → 17b → 17c → 17d → 17e
5. **Webview Tabs:** 18a → 18b → 18c
6. **Notes Store + Protocol:** 19a-i → 19b-i → 19b-ii → 19b-iii
7. **Notes UI:** 19c-i → 19c-ii → 19c-iii → 19d-i
8. **Markdown:** 20a → 20b → 20c
9. **Testing:** 21a → 21b
10. **Release:** 22a → 22b → 22c → 22d

---

## Progress Summary

| Section                       | Sub-tasks | Done    | Remaining |
| ----------------------------- | --------- | ------- | --------- |
| 0. Refactors & Infrastructure | 3         | 3       | 0         |
| 1. Display Stash List         | 5         | 5       | 0         |
| 2. Create Stash — Hardening   | 6         | 6       | 0         |
| 3. Apply Stash — Hardening    | 4         | 4       | 0         |
| 4. Pop Stash — Hardening      | 4         | 4       | 0         |
| 5. Drop Stash                 | 2         | 2       | 0         |
| 6. Show Stash Contents        | 6         | 6       | 0         |
| 7. Clear All Stashes          | 1         | 1       | 0         |
| 8. Webview Panel (React)      | 11        | 11      | 0         |
| 9. Polish & UX                | 8         | 8       | 0         |
| 10. Testing                   | 9         | 9       | 0         |
| 11. Packaging & Release       | 5         | 5       | 0         |
| 12. TreeView Advanced UX      | 12        | 12      | 0         |
| 13. Stash Detail Pane         | 7         | 7       | 0         |
| 14. Rebrand → Superprompt Forge       | 2         | 2       | 0         |
| 15. GitHub Authentication     | 3         | 3       | 0         |
| 16. Gist Service              | 5         | 5       | 0         |
| 17. Gist Notes Tree View      | 5         | 5       | 0         |
| 18. Webview Tab Bar           | 3         | 3       | 0         |
| 19. Notes Tab — List & Editor | 9         | 9       | 0         |
| 20. Markdown Rendering        | 3         | 3       | 0         |
| 21. Gist Notes Testing        | 5         | 5       | 0         |
| 22. Release Prep — v0.2.0     | 4         | 4       | 0         |
| **Total**                     | **122**   | **122** | **0**     |
