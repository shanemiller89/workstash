# MyStash - Git Stash Management for VS Code

![Version](https://img.shields.io/badge/version-0.0.1-blue)
![VS Code](https://img.shields.io/badge/VS%20Code-^1.109.0-blue)

MyStash is a Visual Studio Code extension that provides a user-friendly interface for managing git stashes. Easily create, view, apply, and manage your git stashes without leaving the editor.

## Features

- **View Stashes**: See all your git stashes in a dedicated tree view in the activity bar
- **Create Stash**: Create new stashes with custom messages, optionally including untracked files
- **Apply Stash**: Apply a stash without removing it from the stash list
- **Pop Stash**: Apply and remove a stash in one operation
- **Drop Stash**: Remove a stash from the list
- **Show Stash Contents**: View the diff of what a stash contains
- **Clear All Stashes**: Remove all stashes at once

## Usage

### Tree View

1. Click on the MyStash icon in the Activity Bar (archive icon)
2. View all your stashes in the tree view
3. Expand a stash to see the files it contains
4. Right-click on a stash for available actions

### Commands

All commands are available via the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`):

| Command | Description |
|---------|-------------|
| `MyStash: Refresh Stash List` | Refresh the list of stashes |
| `MyStash: Create New Stash` | Create a new stash with an optional message |
| `MyStash: Apply Stash` | Apply a stash (keeps it in the list) |
| `MyStash: Pop Stash` | Apply and remove a stash |
| `MyStash: Drop Stash` | Remove a stash |
| `MyStash: Show Stash Contents` | View the diff of a stash |
| `MyStash: Clear All Stashes` | Remove all stashes |

### Context Menu Actions

Right-click on a stash item to access:
- Apply
- Pop
- Show Contents
- Drop

### Title Bar Actions

The view title bar includes quick access buttons for:
- Refresh (sync icon)
- Create New Stash (plus icon)

## Requirements

- Git must be installed and available in your system PATH
- A workspace with a git repository initialized

## Extension Settings

This extension currently does not add any VS Code settings.

## Known Issues

None reported yet.

## Release Notes

### 0.0.1

Initial release of MyStash:
- View git stashes in tree view
- Create, apply, pop, drop stashes
- Show stash diff
- Clear all stashes

---

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) (v18.x or higher recommended)
- [npm](https://www.npmjs.com/) (comes with Node.js)
- [Visual Studio Code](https://code.visualstudio.com/) (v1.109.0 or higher)
- [Git](https://git-scm.com/)

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/mystash.git
   cd mystash
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Install the recommended VS Code extension for problem matching:
   - Open VS Code in the project folder
   - Install `connor4312.esbuild-problem-matchers` extension

### Available npm Scripts

| Command | Description |
|---------|-------------|
| `npm run compile` | Compile TypeScript and bundle with esbuild |
| `npm run watch` | Watch mode - recompiles on file changes |
| `npm run watch:esbuild` | Watch mode for esbuild only |
| `npm run watch:tsc` | Watch mode for TypeScript type checking |
| `npm run package` | Build production bundle |
| `npm run compile-tests` | Compile test files |
| `npm run watch-tests` | Watch mode for test compilation |
| `npm run test` | Run tests |
| `npm run lint` | Run ESLint on source files |
| `npm run check-types` | TypeScript type checking without emit |
| `npm run vscode:prepublish` | Prepare extension for publishing |

### Building

```bash
npm install
npm run compile
```

### Running in Debug Mode

1. Open the project in VS Code
2. Press `F5` to open a new VS Code window with the extension loaded
3. Open a folder with a git repository
4. Click on the MyStash icon in the Activity Bar
5. Set breakpoints in `src/` files to debug

### Watch Mode (Recommended for Development)

Run in watch mode to automatically recompile on changes:

```bash
npm run watch
```

Or use VS Code tasks:
- Press `Cmd+Shift+B` (macOS) / `Ctrl+Shift+B` (Windows/Linux)
- Select "watch" task

### Running Tests

```bash
npm test
```

### Linting

```bash
npm run lint
```

### Packaging the Extension

To create a `.vsix` package for distribution:

```bash
npm install -g @vscode/vsce
vsce package
```

### Project Structure

```
MyStash/
├── .github/
│   └── copilot-instructions.md   # AI assistant instructions
├── .vscode/
│   ├── launch.json               # Debug configurations
│   ├── tasks.json                # Build tasks
│   ├── settings.json             # Workspace settings
│   └── extensions.json           # Recommended extensions
├── src/
│   ├── extension.ts              # Extension entry point
│   ├── gitService.ts             # Git operations wrapper
│   ├── stashProvider.ts          # Tree data provider for stash list
│   ├── stashItem.ts              # Stash item model classes
│   └── test/
│       └── extension.test.ts     # Extension tests
├── dist/                         # Compiled output (generated)
├── package.json                  # Extension manifest & dependencies
├── tsconfig.json                 # TypeScript configuration
├── esbuild.js                    # Build script
├── eslint.config.mjs             # ESLint configuration
└── README.md                     # This file
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

**Enjoy!**
