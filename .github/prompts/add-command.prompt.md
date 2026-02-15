# Add a New Command

## Context
You are adding a new command to the Superprompt Forge VS Code extension.

## Checklist — Every new command needs:

### 1. `package.json` — Declare the command
```json
{
  "command": "superprompt-forge.commandName",
  "title": "Human-Readable Title",
  "category": "Superprompt Forge",
  "icon": "$(icon-name)"
}
```

### 2. `package.json` — Add menu entries (if applicable)
- `view/title` — buttons in the view title bar (navigation group for icons)
- `view/item/context` — right-click menu on tree items (`inline@N` for icon buttons)
- `commandPalette` — add `when` clause to control visibility

### 3. `extension.ts` — Register the command
```ts
context.subscriptions.push(
  vscode.commands.registerCommand('superprompt-forge.commandName', async (item?: StashItem) => {
    if (!item) { item = await pickStash(gitService, 'Select a stash'); }
    if (!item) { return; }
    // ... implementation
    stashProvider.refresh('post-command');
  })
);
```

### 4. `gitService.ts` — Add git operation (if needed)
- All git calls go through `execGit()`
- Return structured `GitResult` — let caller decide what exit codes mean

### 5. Compile check
- Run `npm run compile` to verify no errors

## What to add
<!-- e.g.: "Add superprompt-forge.showFile command (task 6c)" -->
