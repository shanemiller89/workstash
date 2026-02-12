# Workstash — Git Stash Management & Gist Notes for VS Code

![Version](https://img.shields.io/badge/version-0.2.0-blue)
![VS Code](https://img.shields.io/badge/VS%20Code-^1.106.0-blue)

Workstash gives you a rich sidebar UI and a full webview panel for managing git stashes — create, browse, apply, pop, drop, and inspect stash contents with side-by-side diffs — all without leaving VS Code. Plus, Gist-backed Markdown notes for your workspace.

## ✨ Features

### Sidebar Tree View

- Browse all git stashes in a dedicated **Activity Bar** container with badge count and dynamic title.
- Expand a stash to see its files with **M/A/D/R/C status icons**.
- Click any file to open a **side-by-side diff** (parent ↔ stash version).
- Lazy-loaded stats in **rich MarkdownString tooltips** (files changed, insertions, deletions).
- **Welcome views** for no-workspace, no-git-repo, and no-stashes states.

### Webview Panel

- Open a **React + Tailwind CSS** panel in an editor tab (`Workstash: Open Stash Panel`).
- **Search & filter** stashes by message, branch, or filename.
- **Inline stash creation form** — message input + mode selector (All / Staged / Untracked).
- **Loading skeletons** during refresh.
- **Keyboard navigation** — Arrow keys, Enter to expand, Escape to clear search, `a`/`p`/`d` shortcuts on focused cards.

### Stash Operations

| Action     | Tree View     | Command Palette                  | Webview      |
| ---------- | ------------- | -------------------------------- | ------------ |
| Create     | Title bar `+` | `Workstash: Create New Stash`    | Inline form  |
| Apply      | Inline ✓      | `Workstash: Apply Stash`         | Hover button |
| Pop        | Inline ↑      | `Workstash: Pop Stash`           | Hover button |
| Drop       | Inline 🗑     | `Workstash: Drop Stash`          | Hover button |
| Show diff  | Inline 👁     | `Workstash: Show Stash Contents` | —            |
| Show stats | Context menu  | `Workstash: Show Stash Stats`    | —            |
| Clear all  | Title bar     | `Workstash: Clear All Stashes`   | Footer link  |
| Refresh    | Title bar ↻   | `Workstash: Refresh Stash List`  | Button       |

### Create Stash Modes

- **All Changes** — stash everything (default)
- **Staged Only** — `git stash push --staged` (git 2.35+)
- **Include Untracked** — `git stash push --include-untracked`

### Conflict Detection

- Apply/Pop detect `CONFLICT` in git output → show a **warning** instead of an error.
- On pop with conflicts, the stash is **not removed** — resolve conflicts, then drop manually.

### Auto-Refresh

- File system watcher on `.git/refs/stash` triggers refresh.
- Window focus triggers refresh (configurable).
- Settings changes trigger refresh.

### Status Bar

- Shows `$(archive) N` in the status bar — click to focus the tree view.
- Hidden when there are no stashes.

### Keyboard Shortcut

- **`Cmd+Shift+S`** (Mac) / **`Ctrl+Shift+S`** (Win/Linux) → Create a new stash.

### Gist Notes 📝

- **Create, edit, and sync** Markdown notes backed by GitHub Gists.
- **Sidebar tree view** — browse notes with search/filter, visibility badges (🌐 public / 📝 secret), and relative timestamps.
- **Webview editor** — full Markdown editor with live preview, syntax-highlighted code blocks (via `highlight.js`), and autosave.
- **Tab bar** — switch between Stashes and Notes tabs in the webview panel.
- **GitHub authentication** — sign in via `vscode.authentication` with `gist` scope.
- **Toggle visibility** — switch notes between public and secret (re-creates the gist).
- **Copy Gist link** — share your note's GitHub URL from the tree view or editor.
- **Responsive layout** — narrow (replace) and wide (side-by-side) mode at 640px breakpoint.

## ⚙️ Settings

| Setting                             | Type                | Default  | Description                                     |
| ----------------------------------- | ------------------- | -------- | ----------------------------------------------- |
| `mystash.autoRefresh`               | boolean             | `true`   | Auto-refresh on git changes or window focus     |
| `mystash.confirmOnDrop`             | boolean             | `true`   | Confirm before dropping a stash                 |
| `mystash.confirmOnClear`            | boolean             | `true`   | Confirm before clearing all stashes             |
| `mystash.showFileStatus`            | boolean             | `true`   | Show M/A/D status indicators on file items      |
| `mystash.defaultIncludeUntracked`   | boolean             | `false`  | Default to Include Untracked on create          |
| `mystash.sortOrder`                 | `newest` / `oldest` | `newest` | Sort order for the stash list                   |
| `mystash.showBranchInDescription`   | boolean             | `true`   | Show branch name in tree item description       |
| `workstash.notes.autosaveDelay`     | number              | `30`     | Autosave delay in seconds (5–300, 0 to disable) |
| `workstash.notes.defaultVisibility` | `secret` / `public` | `secret` | Default visibility for new notes                |

## 📋 Commands

All commands are available via the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`):

| Command                          | Description                            |
| -------------------------------- | -------------------------------------- |
| `Workstash: Refresh Stash List`  | Refresh the stash list                 |
| `Workstash: Create New Stash`    | Create a new stash (3-way mode picker) |
| `Workstash: Apply Stash`         | Apply a stash (keep in list)           |
| `Workstash: Pop Stash`           | Apply and remove a stash               |
| `Workstash: Drop Stash`          | Drop a stash permanently               |
| `Workstash: Show Stash Contents` | View full stash diff                   |
| `Workstash: Show Stash Stats`    | View stash stat summary                |
| `Workstash: Open Stash Panel`    | Open the rich webview panel            |
| `Workstash: Clear All Stashes`   | Remove all stashes                     |
| `Workstash: Sign In to GitHub`   | Authenticate for Gist Notes            |
| `Workstash: Sign Out of GitHub`  | Sign out of GitHub                     |
| `Workstash: Create Note`         | Create a new Gist Note                 |
| `Workstash: Refresh Notes`       | Refresh the notes list                 |
| `Workstash: Search Notes`        | Search notes by title or content       |
| `Workstash: Clear Notes Search`  | Clear notes search filter              |

## 📦 Requirements

- **Git** installed and available in your system PATH.
- **VS Code** 1.106.0 or higher.
- A workspace folder with a git repository initialized.
- **GitHub account** (optional) — required for Gist Notes feature.

## 🏗️ Development

### Setup

```bash
git clone https://github.com/shanemiller89/mystash.git
cd mystash
npm install
```

### Build & Watch

```bash
npm run compile        # One-shot compile (extension + webview + Tailwind)
npm run watch          # Watch mode for extension
npm run build:webview  # Build the React webview bundle
npm run build:css      # Build Tailwind CSS
```

### Debug

Press **F5** in VS Code to launch an Extension Development Host.

### Test

```bash
npm run compile-tests && npm test
```

### Package

```bash
npx @vscode/vsce package
```

### Project Structure

```
Workstash/
├── src/
│   ├── extension.ts            # Activate/deactivate, command registration
│   ├── gitService.ts           # All git CLI operations (injectable ExecFn)
│   ├── stashProvider.ts        # TreeDataProvider for the sidebar
│   ├── stashItem.ts            # StashItem & StashFileItem tree items
│   ├── authService.ts          # GitHub OAuth wrapper
│   ├── gistService.ts          # Gist CRUD API (injectable FetchFn)
│   ├── gistNotesProvider.ts    # TreeDataProvider for notes sidebar
│   ├── gistNoteItem.ts         # GistNoteItem tree item model
│   ├── stashContentProvider.ts # TextDocumentContentProvider (mystash: URI)
│   ├── stashPanel.ts           # WebviewPanel host (React app)
│   ├── uiUtils.ts              # pickStash() QuickPick helper
│   ├── utils.ts                # formatRelativeTime(), getConfig()
│   └── test/
│       ├── extension.test.ts   # Integration tests
│       ├── gitService.test.ts  # GitService unit tests (mocked exec)
│       ├── gistService.test.ts # GistService unit tests (mocked fetch)
│       ├── gistNoteItem.test.ts# GistNoteItem property tests
│       ├── stashItem.test.ts   # Tree item property tests
│       └── utils.test.ts       # Utility function tests
├── webview-ui/src/             # React + Zustand + Tailwind CSS 4
├── dist/                       # Built output (extension + webview)
├── images/                     # Extension icon
└── package.json                # Extension manifest
```

## License

MIT

**Enjoy managing your workspace! 📦**
