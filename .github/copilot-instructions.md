<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# MyStash - VS Code Extension for Git Stash Management

## Project Overview
MyStash is a Visual Studio Code extension for managing git stash operations. It provides a user-friendly interface for creating, viewing, applying, and managing git stashes.

## Technology Stack
- Language: TypeScript
- Framework: VS Code Extension API
- Build Tool: esbuild
- Package Manager: npm

## Development Guidelines
- Use VS Code Extension API best practices
- Follow TypeScript strict mode conventions
- Use async/await for asynchronous operations
- Handle errors gracefully and provide user feedback via VS Code notifications

## Key Features
- View all git stashes in a tree view
- Create new stashes with custom messages
- Apply or pop stashes
- Drop individual stashes
- Show stash contents/diff
- Stash specific files (partial stash)

## Project Structure
```
MyStash/
├── src/
│   ├── extension.ts      # Extension entry point
│   ├── stashProvider.ts  # Tree data provider for stash list
│   ├── stashItem.ts      # Stash item model
│   └── gitService.ts     # Git operations wrapper
├── package.json          # Extension manifest
├── tsconfig.json         # TypeScript configuration
└── .vscode/              # VS Code configuration
```

## Commands
- `mystash.refresh` - Refresh the stash list
- `mystash.stash` - Create a new stash
- `mystash.apply` - Apply a stash
- `mystash.pop` - Pop a stash
- `mystash.drop` - Drop a stash
- `mystash.show` - Show stash contents
