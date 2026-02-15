<!-- Workspace-specific instructions for GitHub Copilot. -->
<!-- Docs: https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# Superprompt Forge — VS Code Extension for Developer Workflow

## Project Overview

Superprompt Forge is a VS Code extension that provides a unified sidebar for managing git stashes, GitHub Issues & PRs, Gist-backed notes, and Mattermost team chat — all from a single webview panel with a tabbed React UI.

- **Repository**: `shanemiller89/superprompt-forge` on GitHub
- **Branch strategy**: `main` (single branch for now)
- **Package name**: `superprompt-forge` (npm/vsix), display name "Superprompt Forge"

## Technology Stack

| Layer              | Choice                                    |
|--------------------|-------------------------------------------|
| Language           | TypeScript (strict mode)                  |
| Runtime            | VS Code Extension Host                    |
| API                | VS Code Extension API ^1.106              |
| Bundler (ext)      | esbuild                                   |
| Bundler (webview)  | Vite 7                                    |
| UI Framework       | React 19                                  |
| State Management   | Zustand 5                                 |
| Styling            | Tailwind CSS 4                            |
| Component Library  | shadcn/ui (Base UI + CVA)                 |
| Icons              | lucide-react                              |
| Markdown           | markdown-it + highlight.js                |
| Layout             | react-resizable-panels                    |
| Test Runner        | Mocha + @vscode/test-cli                  |
| Package Mgr        | npm                                       |
| Linter             | ESLint (flat config)                      |

- **No runtime dependencies** — only `devDependencies`.
- Extension output: `dist/extension.js` (esbuild bundle).
- Webview output: `dist/webview.js` + `dist/webview.css` (Vite bundle).
- Type-checking: `tsc --noEmit` for both `src/` and `webview-ui/`.

## Architecture

### Extension Host (src/)

The extension host handles all backend logic — git CLI, GitHub API, Mattermost API, Gist API — and communicates with the webview via `postMessage`.

| File                    | Responsibility                                           |
|-------------------------|----------------------------------------------------------|
| `extension.ts`          | activate/deactivate, command registration, webview wiring |
| `gitService.ts`         | GitService class — all git CLI operations                |
| `stashProvider.ts`      | TreeDataProvider for sidebar stash tree view              |
| `stashItem.ts`          | StashItem & StashFileItem tree item models               |
| `stashContentProvider.ts` | TextDocumentContentProvider (`superprompt-forge:` URI scheme)     |
| `stashPanel.ts`         | WebviewViewProvider — hosts the React webview panel      |
| `prService.ts`          | GitHub PR API operations                                 |
| `prProvider.ts`         | TreeDataProvider for PRs (sidebar)                       |
| `prItem.ts`             | PR tree item models                                      |
| `issueService.ts`       | GitHub Issues API operations                             |
| `issueProvider.ts`      | TreeDataProvider for Issues (sidebar)                    |
| `issueItem.ts`          | Issue tree item models                                   |
| `gistService.ts`        | GitHub Gist API for notes CRUD                           |
| `gistNotesProvider.ts`  | TreeDataProvider for Gist Notes (sidebar)                |
| `gistNoteItem.ts`       | Gist Note tree item models                               |
| `mattermostService.ts`  | Mattermost REST API client                               |
| `mattermostProvider.ts` | Mattermost message provider                              |
| `mattermostItem.ts`     | Mattermost data models                                   |
| `mattermostWebSocket.ts`| Mattermost WebSocket for real-time updates               |
| `authService.ts`        | GitHub token management (VS Code authentication API)     |
| `uiUtils.ts`            | Shared UI utilities (webview message helpers)            |
| `utils.ts`              | Pure helpers: formatRelativeTime, getConfig              |

### Webview UI (webview-ui/)

A full React 19 SPA with Zustand stores, built with Vite and styled with Tailwind CSS + shadcn/ui components.

**Stores** (`webview-ui/src/`):
| File               | State Domain                    |
|--------------------|---------------------------------|
| `store.ts`         | Stash data & selection          |
| `prStore.ts`       | PR list, detail, comments       |
| `issueStore.ts`    | Issue list, detail, comments    |
| `notesStore.ts`    | Gist notes CRUD                 |
| `mattermostStore.ts` | Channels, posts, threads, DMs |
| `appStore.ts`      | Global UI state (active tab)    |

**Components** (`webview-ui/src/components/`):
| Component               | Description                                    |
|--------------------------|------------------------------------------------|
| `TabBar.tsx`             | Top tab navigation (Mattermost, Stashes, etc.) |
| `StashList.tsx`          | Stash list with search/create                  |
| `StashCard.tsx`          | Individual stash card with actions              |
| `StashDetail.tsx`        | Full stash detail view with file diffs          |
| `StashFiles.tsx`         | File list within a stash                       |
| `DiffView.tsx`           | Inline diff rendering                          |
| `PRList.tsx`             | Pull request list with filters                 |
| `PRDetail.tsx`           | PR detail with comments, reviewers, filters    |
| `PRsTab.tsx`             | PR tab layout                                  |
| `IssueList.tsx`          | Issue list with filters                        |
| `IssueDetail.tsx`        | Issue detail with comments                     |
| `IssuesTab.tsx`          | Issues tab layout                              |
| `NotesList.tsx`          | Gist notes list with search/create             |
| `NoteEditor.tsx`         | Markdown note editor with preview              |
| `NotesTab.tsx`           | Notes tab layout                               |
| `MattermostChannelList.tsx` | Channel/DM list with team selector          |
| `MattermostChat.tsx`     | Chat message view with compose                |
| `MattermostThreadPanel.tsx` | Thread reply panel                          |
| `MattermostTab.tsx`      | Mattermost tab layout                          |
| `EmojiPicker.tsx`        | Emoji picker for reactions & compose           |
| `ReactionBar.tsx`        | Message reaction display/toggle                |
| `FileAttachments.tsx`    | Image/file attachment rendering + lightbox     |
| `MarkdownBody.tsx`       | Markdown content renderer                      |
| `ResizableLayout.tsx`    | Resizable split panel layout                   |
| `ErrorBoundary.tsx`      | React error boundary wrapper                   |
| `useEmojiAutocomplete.tsx` | Emoji autocomplete hook + suggestion list    |

### shadcn/ui Component Library (webview-ui/src/components/ui/)

All 26 components use VS Code CSS variable theming. Built on `@base-ui/react` (headless primitives) + `class-variance-authority` (CVA) for variant styling.

| Component        | Type           | Notes                                          |
|------------------|----------------|-------------------------------------------------|
| `button.tsx`     | CVA            | Variants: default/secondary/destructive/outline/ghost/link. Sizes: default/sm/lg/icon/icon-sm/icon-xs |
| `input.tsx`      | Pure HTML + cn | VS Code input theming                          |
| `textarea.tsx`   | Pure HTML + cn | VS Code input theming                          |
| `input-group.tsx`| Compound       | InputGroup/Addon/Button/Text/Input/Textarea     |
| `label.tsx`      | Pure HTML + CVA| Styled label                                   |
| `badge.tsx`      | CVA            | Variants: default/secondary/destructive/outline/success/warning |
| `card.tsx`       | Compound       | Card/Header/Title/Description/Content/Footer    |
| `separator.tsx`  | Pure HTML      | Horizontal/vertical                             |
| `avatar.tsx`     | CVA            | Size variants                                   |
| `progress.tsx`   | Pure HTML      | CSS variable driven                             |
| `skeleton.tsx`   | Pure HTML      | Animated pulse placeholder                      |
| `scroll-area.tsx`| Pure HTML      | Overflow wrapper                                |
| `dialog.tsx`     | Base UI        | Modal dialog                                    |
| `alert-dialog.tsx`| Base UI       | Confirmation dialog                             |
| `dropdown-menu.tsx`| Base UI      | Context/action menus                            |
| `select.tsx`     | Base UI        | Value picker (replaces native `<select>`)       |
| `popover.tsx`    | Base UI        | Floating content panel                          |
| `tooltip.tsx`    | Base UI        | Hover tooltips                                  |
| `tabs.tsx`       | Base UI + CVA  | Tab navigation (variants: default/line)         |
| `accordion.tsx`  | Base UI        | Collapsible sections                            |
| `collapsible.tsx`| Base UI        | Single collapsible panel                        |
| `toggle.tsx`     | Base UI + CVA  | Toggle button (variant: default/outline)        |
| `toggle-group.tsx`| Base UI       | Exclusive/multi toggle group                    |
| `switch.tsx`     | Base UI        | On/off toggle switch                            |
| `checkbox.tsx`   | Base UI        | Checkbox with indicator                         |
| `slider.tsx`     | Base UI        | Range slider                                    |

**Key dependencies for shadcn:**
- `@base-ui/react` — headless UI primitives (replaces Radix in shadcn v4)
- `class-variance-authority` — variant-based className composition
- `clsx` + `tailwind-merge` — className merging utility (`cn()` in `lib/utils.ts`)
- `tw-animate-css` — Tailwind animation utilities
- `@/` path alias resolves to `webview-ui/src/` (configured in both `vite.config.ts` and `webview-ui/tsconfig.json`)

## Architecture Decisions (Locked)

These are final. Do not deviate without explicit user approval.

1. **`execGit()` returns structured `GitResult`** — `{ stdout, stderr, exitCode }`. Callers decide what exit codes mean. Do NOT throw on non-zero exit.
2. **Diff viewing uses `TextDocumentContentProvider`** with `superprompt-forge:` URI scheme. No temp files.
3. **Multi-root workspace is Phase 2** — design for it (accept `workspaceRoot` as a parameter, add `// TODO: multi-root` comments) but don't implement it yet.
4. **Webview is a single React SPA** — all tabs (Stashes, PRs, Issues, Notes, Mattermost) live in one webview panel.
5. **Extension ↔ Webview communication** uses `postMessage` / `onDidReceiveMessage` — no direct API calls from the webview.
6. **All UI components use shadcn/ui variants** — no raw `<button>`, `<input>`, `<select>`, or `<textarea>` elements outside of `ui/` folder.
7. **VS Code CSS variables for theming** — all components adapt to the user's VS Code theme via `var(--vscode-*)` custom properties.
8. **Both unit tests AND integration tests** — unit tests mock `execAsync` (fast, no VS Code host). Integration tests run in the extension host.

## Full Project Structure

```
Superprompt Forge/
├── src/
│   ├── extension.ts              # activate/deactivate, command registration, wiring
│   ├── gitService.ts             # GitService — all git CLI operations
│   ├── stashProvider.ts          # TreeDataProvider for stash list
│   ├── stashItem.ts              # StashItem & StashFileItem models
│   ├── stashContentProvider.ts   # TextDocumentContentProvider (superprompt-forge: URI)
│   ├── stashPanel.ts             # WebviewViewProvider for React panel
│   ├── prService.ts              # GitHub PR API
│   ├── prProvider.ts             # PR tree data provider
│   ├── prItem.ts                 # PR tree item models
│   ├── issueService.ts           # GitHub Issues API
│   ├── issueProvider.ts          # Issues tree data provider
│   ├── issueItem.ts              # Issue tree item models
│   ├── gistService.ts            # GitHub Gist API (notes CRUD)
│   ├── gistNotesProvider.ts      # Gist Notes tree data provider
│   ├── gistNoteItem.ts           # Gist Note tree item models
│   ├── mattermostService.ts      # Mattermost REST API client
│   ├── mattermostProvider.ts     # Mattermost message provider
│   ├── mattermostItem.ts         # Mattermost data models
│   ├── mattermostWebSocket.ts    # Mattermost WebSocket client
│   ├── authService.ts            # GitHub authentication (VS Code auth API)
│   ├── uiUtils.ts                # Webview message helpers
│   ├── utils.ts                  # Pure helpers
│   └── test/
│       ├── extension.test.ts     # Integration tests
│       ├── gitService.test.ts    # Git service unit tests
│       ├── gistNoteItem.test.ts  # Gist note item tests
│       ├── gistService.test.ts   # Gist service tests
│       ├── stashItem.test.ts     # Stash item tests
│       └── utils.test.ts         # Utility function tests
├── webview-ui/
│   ├── tsconfig.json             # Webview TypeScript config
│   ├── vite.config.ts            # Vite build config
│   └── src/
│       ├── App.tsx               # Root component with tab routing
│       ├── main.tsx              # React entry point
│       ├── index.css             # Tailwind CSS + VS Code theme tokens
│       ├── vscode.ts             # VS Code API bridge (postMessage wrapper)
│       ├── store.ts              # Stash Zustand store
│       ├── prStore.ts            # PR Zustand store
│       ├── issueStore.ts         # Issue Zustand store
│       ├── notesStore.ts         # Notes Zustand store
│       ├── mattermostStore.ts    # Mattermost Zustand store
│       ├── appStore.ts           # Global app state store
│       ├── lib/
│       │   └── utils.ts          # cn() utility (clsx + tailwind-merge)
│       └── components/
│           ├── ui/               # 26 shadcn/ui components (see table above)
│           ├── TabBar.tsx         # Tab navigation
│           ├── StashList.tsx      # Stash list
│           ├── StashCard.tsx      # Stash card
│           ├── StashDetail.tsx    # Stash detail
│           ├── StashFiles.tsx     # Stash file list
│           ├── DiffView.tsx       # Diff renderer
│           ├── PRList.tsx         # PR list
│           ├── PRDetail.tsx       # PR detail
│           ├── PRsTab.tsx         # PRs tab
│           ├── IssueList.tsx      # Issue list
│           ├── IssueDetail.tsx    # Issue detail
│           ├── IssuesTab.tsx      # Issues tab
│           ├── NotesList.tsx      # Notes list
│           ├── NoteEditor.tsx     # Note editor
│           ├── NotesTab.tsx       # Notes tab
│           ├── MattermostChannelList.tsx  # Channels/DMs
│           ├── MattermostChat.tsx         # Chat view
│           ├── MattermostThreadPanel.tsx  # Thread replies
│           ├── MattermostTab.tsx          # Mattermost tab
│           ├── EmojiPicker.tsx    # Emoji picker
│           ├── ReactionBar.tsx    # Reaction bar
│           ├── FileAttachments.tsx # File/image attachments
│           ├── MarkdownBody.tsx   # Markdown renderer
│           ├── ResizableLayout.tsx # Resizable panels
│           ├── ErrorBoundary.tsx  # Error boundary
│           └── useEmojiAutocomplete.tsx # Emoji autocomplete hook
├── package.json                  # Extension manifest
├── tsconfig.json                 # Extension TypeScript config
├── esbuild.js                    # Extension bundle config
├── eslint.config.mjs             # ESLint flat config
├── PUNCHLIST.md                  # Development task tracker
├── CHANGELOG.md                  # Release changelog
└── .vscode/                      # Dev environment config
```

## Key Interfaces & Patterns

### `GitResult`
```ts
interface GitResult { stdout: string; stderr: string; exitCode: number }
```

### `StashEntry`
```ts
interface StashEntry {
  index: number;
  name: string;
  branch: string;
  message: string;
  date: Date;
  stats?: { filesChanged: number; insertions: number; deletions: number };
}
```

### Extension ↔ Webview Message Pattern
```ts
// Extension → Webview
panel.webview.postMessage({ type: 'stashList', data: stashes });

// Webview → Extension
postMessage('apply', { index: stash.index });
```

### Error Handling Pattern
- **User-facing errors**: `vscode.window.showErrorMessage()` with clear context
- **Diagnostics**: Log to `OutputChannel('Superprompt Forge')` — git commands, exit codes, stderr
- **Tree view errors**: Return empty array + let welcome view handle messaging
- **Conflict detection**: Check `exitCode !== 0` AND `stderr.includes('CONFLICT')`

## Coding Conventions

### TypeScript
- Use `async/await` everywhere — no raw `.then()` chains.
- Strict mode is on — no `any` unless absolutely necessary (prefer `unknown`).
- Use `const` by default, `let` only when reassignment is needed.
- Destructure where it improves readability.
- Name private fields with `_` prefix for internal state.

### React / Webview
- **Functional components only** — no class components.
- **Zustand** for state — one store per domain (stash, PR, issue, notes, mattermost, app).
- **`useCallback`/`useMemo`** for expensive operations and stable references.
- **shadcn/ui components** for all interactive elements — never use raw HTML form elements.
- **`cn()` utility** for className merging (from `@/lib/utils`).
- **CVA** for variant-based component styling.
- **VS Code CSS variables** (`var(--vscode-*)`) for all theme-aware colors.

### VS Code Extension API
- Push all disposables to `context.subscriptions`.
- Use `vscode.ThemeIcon` for icons — not file paths.
- Use `vscode.workspace.getConfiguration('superprompt-forge')` or `('superprompt-forge')` for settings.
- Use `vscode.commands.executeCommand('setContext', key, value)` for `when` clause keys.
- Use `vscode.window.withProgress()` for operations > 500ms.

### Git CLI
- All git operations go through `GitService.execGit(command)`.
- Never call `child_process` directly outside of `gitService.ts`.

### Naming
- Files: `camelCase.ts` (extension), `PascalCase.tsx` (React components), `camelCase.ts` (stores)
- Classes: `PascalCase` — `GitService`, `StashProvider`
- Interfaces: `PascalCase` — `StashEntry`, `GitResult`
- React Components: `PascalCase` — `StashCard`, `PRDetail`
- Commands: `superprompt-forge.verbNoun` — `superprompt-forge.showFile`, `superprompt-forge.refresh`
- Settings: `superprompt-forge.camelCase` or `superprompt-forge.feature.setting`
- Context keys: `superprompt-forge.camelCase`
- Stores: `use[Domain]Store` — `useStashStore`, `usePRStore`

## Build & Development

```bash
# Full compile (type-check + lint + webview build + extension bundle)
npm run compile

# Watch mode (parallel tsc + esbuild + vite watchers)
# Use VS Code task "watch" which runs all three

# Type-check only
tsc --noEmit
tsc --noEmit --project webview-ui/tsconfig.json

# Run tests
npm test
```

## Commands

| Command              | Description                    | Palette | Tree/Webview |
|----------------------|--------------------------------|---------|--------------|
| `superprompt-forge.refresh`    | Refresh the stash list         | ✅      | Title bar    |
| `superprompt-forge.stash`      | Create a new stash             | ✅      | Title bar    |
| `superprompt-forge.apply`      | Apply a stash (keep in list)   | ✅      | Inline       |
| `superprompt-forge.pop`        | Pop a stash (apply + remove)   | ✅      | Context      |
| `superprompt-forge.drop`       | Drop a stash permanently       | ✅      | Context      |
| `superprompt-forge.show`       | Show full stash diff           | ✅      | Inline       |
| `superprompt-forge.clear`      | Clear all stashes              | ✅      | Title bar    |
| `superprompt-forge.showFile`   | Show per-file diff             | Hidden  | File click   |

## Settings

| Setting                             | Type    | Default   | Description                          |
|-------------------------------------|---------|-----------|--------------------------------------|
| `superprompt-forge.autoRefresh`               | bool    | `true`    | Auto-refresh on git changes / focus  |
| `superprompt-forge.confirmOnDrop`             | bool    | `true`    | Confirm before dropping a stash      |
| `superprompt-forge.confirmOnClear`            | bool    | `true`    | Confirm before clearing all stashes  |
| `superprompt-forge.showFileStatus`            | bool    | `true`    | Show M/A/D indicators on file items  |
| `superprompt-forge.defaultIncludeUntracked`   | bool    | `false`   | Default include untracked on create  |
| `superprompt-forge.sortOrder`                 | enum    | `newest`  | Stash list sort: `newest` / `oldest` |
| `superprompt-forge.showBranchInDescription`   | bool    | `true`    | Show branch name in tree item desc   |
| `superprompt-forge.notes.autosaveDelay`     | number  | `30`      | Autosave delay in seconds (0=off)    |
| `superprompt-forge.notes.defaultVisibility` | enum    | `secret`  | Default note visibility              |
| `superprompt-forge.mattermost.serverUrl`    | string  | `""`      | Mattermost server URL                |
