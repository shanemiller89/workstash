import * as vscode from 'vscode';
import { GitService } from './gitService';
import {
    StashProvider,
    StashFileDecorationProvider,
    StashDragAndDropController,
} from './stashProvider';
import { StashItem, StashFileItem } from './stashItem';
import { StashContentProvider } from './stashContentProvider';
import { StashPanel } from './stashPanel';
import { AuthService } from './authService';
import { GistService } from './gistService';
import { GistNotesProvider } from './gistNotesProvider';
import { GistNoteItem } from './gistNoteItem';
import { pickStash } from './uiUtils';
import { getConfig } from './utils';

export function activate(context: vscode.ExtensionContext) {
    console.log('Workstash extension is now active!');

    // 0b-i: Create output channel for diagnostics
    const outputChannel = vscode.window.createOutputChannel('Workstash');
    context.subscriptions.push(outputChannel);

    const gitService = new GitService(
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
        outputChannel,
    );

    // 15a: AuthService — GitHub OAuth for Gist Notes
    const authService = new AuthService(outputChannel);
    context.subscriptions.push(authService);

    // 15b: Update context key when auth state changes
    const updateAuthContext = async () => {
        const isAuth = await authService.isAuthenticated();
        await vscode.commands.executeCommand('setContext', 'workstash.isAuthenticated', isAuth);
        outputChannel.appendLine(`[Auth] workstash.isAuthenticated = ${isAuth}`);
    };
    context.subscriptions.push(authService.onDidChangeAuthentication(() => updateAuthContext()));
    // Set initial auth state on activation
    updateAuthContext();

    // 16a: GistService — GitHub Gist API for notes
    const gistService = new GistService(authService, outputChannel);

    // 17c: GistNotesProvider — tree data provider for notes sidebar
    const gistNotesProvider = new GistNotesProvider(gistService, authService, outputChannel);
    context.subscriptions.push(gistNotesProvider);

    // Register the gist notes tree view
    const notesTreeView = vscode.window.createTreeView('gistNotesView', {
        treeDataProvider: gistNotesProvider,
        showCollapseAll: false,
        canSelectMany: true,
    });
    context.subscriptions.push(notesTreeView);
    gistNotesProvider.setTreeView(notesTreeView);

    // Refresh notes when auth state changes
    context.subscriptions.push(
        authService.onDidChangeAuthentication(() => {
            gistNotesProvider.refresh('auth-changed');
        }),
    );

    // Register mystash: URI scheme for side-by-side diff viewing
    const contentProvider = new StashContentProvider(gitService);
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider('mystash', contentProvider),
    );

    const stashProvider = new StashProvider(gitService, outputChannel);

    // Register FileDecorationProvider for mystash-file: URIs (SCM-style badges)
    const fileDecorationProvider = new StashFileDecorationProvider();
    context.subscriptions.push(
        vscode.window.registerFileDecorationProvider(fileDecorationProvider),
    );

    // 9b-i: Status bar item — shows stash count, click → focus tree view
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    statusBarItem.command = 'mystashView.focus';
    statusBarItem.tooltip = 'Workstash — Click to view stashes';
    context.subscriptions.push(statusBarItem);
    stashProvider.setStatusBarItem(statusBarItem);

    // Drag & Drop controller for file-to-editor and stash reorder
    const dndController = new StashDragAndDropController(outputChannel);

    // Register the tree view with multi-select and drag & drop
    const treeView = vscode.window.createTreeView('mystashView', {
        treeDataProvider: stashProvider,
        showCollapseAll: true,
        canSelectMany: true,
        dragAndDropController: dndController,
    });
    context.subscriptions.push(treeView);
    stashProvider.setTreeView(treeView);

    // 1e-ii: Watch git stash ref files for changes
    // TODO: multi-root — watch all workspace folder .git directories
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (workspaceRoot) {
        const stashRefPattern = new vscode.RelativePattern(
            workspaceRoot,
            '.git/{refs/stash,logs/refs/stash}',
        );
        const gitWatcher = vscode.workspace.createFileSystemWatcher(stashRefPattern);
        gitWatcher.onDidChange(() => stashProvider.refresh('git-stash-changed'));
        gitWatcher.onDidCreate(() => stashProvider.refresh('git-stash-created'));
        gitWatcher.onDidDelete(() => stashProvider.refresh('git-stash-deleted'));
        context.subscriptions.push(gitWatcher);
    }

    // 1e-iii: Refresh on window focus (e.g. after external git operations)
    context.subscriptions.push(
        vscode.window.onDidChangeWindowState((state) => {
            if (state.focused && getConfig<boolean>('autoRefresh', true)) {
                stashProvider.refresh('window-focus');
            }
        }),
    );

    // 9a-iv: Refresh when mystash settings change
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('mystash')) {
                stashProvider.refresh('settings-changed');
            }
        }),
    );

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('mystash.refresh', () => {
            stashProvider.refresh('manual');
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('mystash.stash', async () => {
            // 2c: Guard — no changes means nothing to stash
            const hasChanges = await gitService.hasChanges();
            if (!hasChanges) {
                vscode.window.showInformationMessage('No local changes to stash');
                return;
            }

            // 2e: Cancel-safe message prompt
            let message = await vscode.window.showInputBox({
                prompt: 'Enter stash message (optional)',
                placeHolder: 'Stash message',
            });

            // Escape pressed → cancel
            if (message === undefined) {
                return;
            }

            // Empty submit → ask if intentional
            if (message === '') {
                const emptyOk = await vscode.window.showQuickPick(
                    ['Yes, no message', 'Let me type one'],
                    {
                        placeHolder: 'Create stash without a message?',
                    },
                );
                if (!emptyOk) {
                    return;
                }
                if (emptyOk === 'Let me type one') {
                    message = await vscode.window.showInputBox({
                        prompt: 'Enter stash message',
                        placeHolder: 'Stash message',
                    });
                    if (message === undefined) {
                        return;
                    }
                }
            }

            // 2d: Three-way stash mode QuickPick
            const defaultUntracked = getConfig<boolean>('defaultIncludeUntracked', false);
            const modeItems: vscode.QuickPickItem[] = [
                { label: 'All Changes', description: 'Stash all tracked changes' },
                {
                    label: 'Include Untracked',
                    description: 'Also stash untracked files (--include-untracked)',
                },
                {
                    label: 'Staged Only',
                    description: 'Only stash staged changes (--staged, git 2.35+)',
                },
            ];
            // Pre-select based on setting
            const defaultIndex = defaultUntracked ? 1 : 0;

            const modeQuickPick = vscode.window.createQuickPick();
            modeQuickPick.items = modeItems;
            modeQuickPick.activeItems = [modeItems[defaultIndex]];
            modeQuickPick.placeholder = 'What to include in the stash?';

            const modeChoice = await new Promise<vscode.QuickPickItem | undefined>((resolve) => {
                modeQuickPick.onDidAccept(() => {
                    resolve(modeQuickPick.selectedItems[0]);
                    modeQuickPick.dispose();
                });
                modeQuickPick.onDidHide(() => {
                    resolve(undefined);
                    modeQuickPick.dispose();
                });
                modeQuickPick.show();
            });

            // 2e: Escape on mode picker → cancel
            if (!modeChoice) {
                return;
            }

            const modeMap: Record<string, 'all' | 'staged' | 'untracked'> = {
                'All Changes': 'all',
                'Staged Only': 'staged',
                'Include Untracked': 'untracked',
            };
            const mode = modeMap[modeChoice.label] ?? 'all';

            // Use empty string as undefined for createStash (no -m flag)
            const stashMessage = message || undefined;

            // 2f: Progress indicator wrapping only the git call
            try {
                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: 'Creating stash…',
                        cancellable: false,
                    },
                    async () => {
                        await gitService.createStash(stashMessage, mode);
                    },
                );
                vscode.window.showInformationMessage('Stash created successfully');
                stashProvider.refresh('post-command');

                // Reveal the newly created stash (always at index 0)
                setTimeout(async () => {
                    try {
                        const stashes = await gitService.getStashList();
                        if (stashes.length > 0) {
                            const newItem = new StashItem(stashes[0]);
                            await treeView.reveal(newItem, {
                                select: true,
                                focus: false,
                                expand: true,
                            });
                        }
                    } catch {
                        /* reveal is best-effort */
                    }
                }, 500);
            } catch (error: unknown) {
                const msg = error instanceof Error ? error.message : 'Unknown error';
                vscode.window.showErrorMessage(`Failed to create stash: ${msg}`);
            }
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('mystash.apply', async (item?: StashItem) => {
            if (!item) {
                const entry = await pickStash(gitService, 'Select a stash to apply');
                if (!entry) {
                    return;
                }
                item = new StashItem(entry);
            }

            // 3d: Progress indicator
            const result = await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `Applying ${item.stashEntry.name}…`,
                    cancellable: false,
                },
                async () => gitService.applyStash(item.stashEntry.index),
            );

            // 3c: Conflict detection
            if (result.success && result.conflicts) {
                vscode.window.showWarningMessage(
                    `Applied ${item.stashEntry.name} with merge conflicts. Resolve them manually.`,
                );
                stashProvider.setMessage(
                    '$(warning) Last apply had merge conflicts — resolve manually',
                );
            } else if (result.success) {
                vscode.window.showInformationMessage(`Applied ${item.stashEntry.name}`);
                stashProvider.setMessage('');
            } else {
                vscode.window.showErrorMessage(`Failed to apply stash: ${result.message}`);
            }
            stashProvider.refresh('post-command');
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('mystash.pop', async (item?: StashItem) => {
            if (!item) {
                const entry = await pickStash(gitService, 'Select a stash to pop');
                if (!entry) {
                    return;
                }
                item = new StashItem(entry);
            }

            // 4d: Progress indicator
            const result = await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `Popping ${item.stashEntry.name}…`,
                    cancellable: false,
                },
                async () => gitService.popStash(item.stashEntry.index),
            );

            // 4c: Conflict detection — stash remains in list on conflict
            if (result.success && result.conflicts) {
                vscode.window.showWarningMessage(
                    `Stash applied with conflicts but was NOT removed. Resolve conflicts, then drop manually.`,
                );
                stashProvider.setMessage('$(warning) Last pop had conflicts — stash kept in list');
            } else if (result.success) {
                vscode.window.showInformationMessage(`Popped ${item.stashEntry.name}`);
                stashProvider.setMessage('');
            } else {
                vscode.window.showErrorMessage(`Failed to pop stash: ${result.message}`);
            }
            stashProvider.refresh('post-command');
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('mystash.drop', async (item?: StashItem) => {
            if (!item) {
                const entry = await pickStash(gitService, 'Select a stash to drop');
                if (!entry) {
                    return;
                }
                item = new StashItem(entry);
            }

            // 9a-ii: Respect confirmOnDrop setting
            if (getConfig<boolean>('confirmOnDrop', true)) {
                const confirm = await vscode.window.showWarningMessage(
                    `Are you sure you want to drop ${item.stashEntry.name}?`,
                    { modal: true },
                    'Yes',
                    'No',
                );

                if (confirm !== 'Yes') {
                    return;
                }
            }

            try {
                await gitService.dropStash(item.stashEntry.index);
                vscode.window.showInformationMessage(`Dropped ${item.stashEntry.name}`);
                stashProvider.refresh('post-command');
            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to drop stash: ${error.message}`);
            }
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('mystash.show', async (item?: StashItem) => {
            if (!item) {
                const entry = await pickStash(gitService, 'Select a stash to show');
                if (!entry) {
                    return;
                }
                item = new StashItem(entry);
            }

            try {
                const diff = await gitService.getStashDiff(item.stashEntry.index);
                const document = await vscode.workspace.openTextDocument({
                    content: diff,
                    language: 'diff',
                });
                await vscode.window.showTextDocument(document, { preview: true });
            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to show stash: ${error.message}`);
            }
        }),
    );

    // 6c: Per-file diff command — opens side-by-side diff editor
    context.subscriptions.push(
        vscode.commands.registerCommand('mystash.showFile', async (fileItem?: StashFileItem) => {
            if (!fileItem) {
                return;
            }

            const index = fileItem.stashIndex;
            const filePath = fileItem.filePath;
            const fileName = filePath.split('/').pop() ?? filePath;

            // Build URIs for the parent (before) and stash (after) versions
            const parentUri = vscode.Uri.parse(`mystash:/${filePath}?ref=parent&index=${index}`);
            const stashUri = vscode.Uri.parse(`mystash:/${filePath}?ref=stash&index=${index}`);

            const title = `${fileName} (stash@{${index}})`;

            try {
                await vscode.commands.executeCommand('vscode.diff', parentUri, stashUri, title, {
                    preview: true,
                });
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                vscode.window.showErrorMessage(`Failed to show file diff: ${message}`);
            }
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('mystash.openPanel', () => {
            StashPanel.createOrShow(context.extensionUri, gitService, authService, gistService);
        }),
    );

    // 6f: Show stash summary (stat view)
    context.subscriptions.push(
        vscode.commands.registerCommand('mystash.showStats', async (item?: StashItem) => {
            if (!item) {
                const entry = await pickStash(gitService, 'Select a stash to show stats for');
                if (!entry) {
                    return;
                }
                item = new StashItem(entry);
            }

            try {
                const { stdout, exitCode } = await gitService.execGitPublic(
                    `stash show --stat "stash@{${item.stashEntry.index}}"`,
                );
                if (exitCode !== 0 || !stdout) {
                    vscode.window.showInformationMessage('No stats available for this stash.');
                    return;
                }
                const header = `Stash: ${item.stashEntry.name} — ${item.stashEntry.message}\nBranch: ${item.stashEntry.branch}\n${'─'.repeat(60)}\n`;
                const document = await vscode.workspace.openTextDocument({
                    content: header + stdout,
                    language: 'plaintext',
                });
                await vscode.window.showTextDocument(document, { preview: true });
            } catch (error: unknown) {
                const msg = error instanceof Error ? error.message : 'Unknown error';
                vscode.window.showErrorMessage(`Failed to show stash stats: ${msg}`);
            }
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('mystash.clear', async () => {
            const stashes = await gitService.getStashList();
            if (stashes.length === 0) {
                vscode.window.showInformationMessage('No stashes to clear');
                return;
            }

            // 9a-ii: Respect confirmOnClear setting
            if (getConfig<boolean>('confirmOnClear', true)) {
                const confirm = await vscode.window.showWarningMessage(
                    `Are you sure you want to clear all ${stashes.length} stash(es)? This cannot be undone.`,
                    { modal: true },
                    'Yes',
                    'No',
                );

                if (confirm !== 'Yes') {
                    return;
                }
            }

            try {
                await gitService.clearStashes();
                vscode.window.showInformationMessage('All stashes cleared');
                stashProvider.refresh('post-command');
            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to clear stashes: ${error.message}`);
            }
        }),
    );

    // --- Search commands ---

    context.subscriptions.push(
        vscode.commands.registerCommand('mystash.search', async () => {
            const query = await vscode.window.showInputBox({
                prompt: 'Search stashes by message, branch, or name',
                placeHolder: 'e.g. login, feature/auth, stash@{2}',
                value: stashProvider.searchQuery,
            });
            if (query === undefined) {
                return;
            } // Escape
            stashProvider.setSearchQuery(query);
            await vscode.commands.executeCommand(
                'setContext',
                'mystash.isSearching',
                query.length > 0,
            );
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('mystash.clearSearch', () => {
            stashProvider.setSearchQuery('');
            vscode.commands.executeCommand('setContext', 'mystash.isSearching', false);
        }),
    );

    // --- Multi-select batch commands ---

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'mystash.applySelected',
            async (_item?: StashItem, allItems?: StashItem[]) => {
                const items =
                    allItems && allItems.length > 0
                        ? allItems
                        : treeView.selection.filter((s): s is StashItem => s instanceof StashItem);
                if (items.length === 0) {
                    vscode.window.showInformationMessage('No stashes selected');
                    return;
                }

                const confirm = await vscode.window.showWarningMessage(
                    `Apply ${items.length} stash${items.length !== 1 ? 'es' : ''}?`,
                    { modal: true },
                    'Yes',
                    'No',
                );
                if (confirm !== 'Yes') {
                    return;
                }

                let successCount = 0;
                let conflictCount = 0;
                let failCount = 0;

                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: 'Applying stashes…',
                        cancellable: false,
                    },
                    async (progress) => {
                        for (const item of items) {
                            progress.report({ message: `${item.stashEntry.name}…` });
                            const result = await gitService.applyStash(item.stashEntry.index);
                            if (result.success && result.conflicts) {
                                conflictCount++;
                            } else if (result.success) {
                                successCount++;
                            } else {
                                failCount++;
                            }
                        }
                    },
                );

                const parts: string[] = [];
                if (successCount > 0) {
                    parts.push(`${successCount} applied`);
                }
                if (conflictCount > 0) {
                    parts.push(`${conflictCount} with conflicts`);
                }
                if (failCount > 0) {
                    parts.push(`${failCount} failed`);
                }
                vscode.window.showInformationMessage(`Batch apply: ${parts.join(', ')}`);

                if (conflictCount > 0) {
                    stashProvider.setMessage(
                        `$(warning) Batch apply: ${conflictCount} stash${conflictCount !== 1 ? 'es' : ''} had conflicts`,
                    );
                }
                stashProvider.refresh('post-command');
            },
        ),
    );

    // --- 15c: Notes auth commands ---

    context.subscriptions.push(
        vscode.commands.registerCommand('workstash.notes.signIn', async () => {
            const session = await authService.signIn();
            if (session) {
                vscode.window.showInformationMessage(
                    `Signed in to GitHub as ${session.account.label}`,
                );
            }
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('workstash.notes.signOut', async () => {
            await authService.signOut();
            vscode.window.showInformationMessage('Signed out of GitHub');
        }),
    );

    // --- 16-17: Notes CRUD commands ---

    context.subscriptions.push(
        vscode.commands.registerCommand('workstash.notes.create', async () => {
            const title = await vscode.window.showInputBox({
                prompt: 'Note title',
                placeHolder: 'My new note',
                validateInput: (value) => (value.trim() ? null : 'Title cannot be empty'),
            });
            if (!title) {
                return;
            }

            const defaultVisibility = vscode.workspace
                .getConfiguration('workstash.notes')
                .get<string>('defaultVisibility', 'secret');
            const isPublic = defaultVisibility === 'public';

            try {
                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: 'Creating note…',
                        cancellable: false,
                    },
                    async () => {
                        await gistService.createNote(title, '', isPublic);
                    },
                );
                vscode.window.showInformationMessage(`Note "${title}" created`);
                gistNotesProvider.refresh('post-command');
            } catch (error: unknown) {
                const msg = error instanceof Error ? error.message : 'Unknown error';
                vscode.window.showErrorMessage(`Failed to create note: ${msg}`);
            }
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('workstash.notes.open', async (item?: GistNoteItem) => {
            if (!item) {
                return;
            }
            // Open the note in the webview panel
            StashPanel.createOrShow(context.extensionUri, gitService, authService, gistService);
            StashPanel.currentPanel?.openNote(item.note.id);
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('workstash.notes.delete', async (item?: GistNoteItem) => {
            if (!item) {
                return;
            }

            const confirm = await vscode.window.showWarningMessage(
                `Delete note "${item.note.title}"? This cannot be undone.`,
                { modal: true },
                'Delete',
                'Cancel',
            );
            if (confirm !== 'Delete') {
                return;
            }

            try {
                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: 'Deleting note…',
                        cancellable: false,
                    },
                    async () => {
                        await gistService.deleteNote(item.note.id);
                    },
                );
                vscode.window.showInformationMessage(`Note "${item.note.title}" deleted`);
                gistNotesProvider.refresh('post-command');
            } catch (error: unknown) {
                const msg = error instanceof Error ? error.message : 'Unknown error';
                vscode.window.showErrorMessage(`Failed to delete note: ${msg}`);
            }
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('workstash.notes.copyLink', async (item?: GistNoteItem) => {
            if (!item) {
                return;
            }
            await vscode.env.clipboard.writeText(item.note.htmlUrl);
            vscode.window.showInformationMessage('Gist link copied to clipboard');
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'workstash.notes.toggleVisibility',
            async (item?: GistNoteItem) => {
                if (!item) {
                    return;
                }

                const currentVis = item.note.isPublic ? 'public' : 'secret';
                const targetVis = item.note.isPublic ? 'secret' : 'public';

                const confirm = await vscode.window.showWarningMessage(
                    `Change note "${item.note.title}" from ${currentVis} to ${targetVis}?\n\nThis will delete and recreate the gist. The gist ID, URL, comments, and stars will change.`,
                    { modal: true },
                    `Make ${targetVis}`,
                    'Cancel',
                );
                if (!confirm || confirm === 'Cancel') {
                    return;
                }

                try {
                    await vscode.window.withProgress(
                        {
                            location: vscode.ProgressLocation.Notification,
                            title: `Toggling visibility…`,
                            cancellable: false,
                        },
                        async () => {
                            await gistService.toggleVisibility(item.note.id);
                        },
                    );
                    vscode.window.showInformationMessage(`Note is now ${targetVis}`);
                    gistNotesProvider.refresh('post-command');
                } catch (error: unknown) {
                    const msg = error instanceof Error ? error.message : 'Unknown error';
                    vscode.window.showErrorMessage(`Failed to toggle visibility: ${msg}`);
                }
            },
        ),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('workstash.notes.refresh', () => {
            gistNotesProvider.refresh('manual');
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('workstash.notes.search', async () => {
            const query = await vscode.window.showInputBox({
                prompt: 'Search notes by title or content',
                placeHolder: 'e.g. meeting notes, TODO',
                value: gistNotesProvider.searchQuery,
            });
            if (query === undefined) {
                return;
            }
            gistNotesProvider.setSearchQuery(query);
            await vscode.commands.executeCommand(
                'setContext',
                'workstash.notes.isSearching',
                query.length > 0,
            );
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('workstash.notes.clearSearch', () => {
            gistNotesProvider.setSearchQuery('');
            vscode.commands.executeCommand('setContext', 'workstash.notes.isSearching', false);
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'mystash.dropSelected',
            async (_item?: StashItem, allItems?: StashItem[]) => {
                const items =
                    allItems && allItems.length > 0
                        ? allItems
                        : treeView.selection.filter((s): s is StashItem => s instanceof StashItem);
                if (items.length === 0) {
                    vscode.window.showInformationMessage('No stashes selected');
                    return;
                }

                const confirm = await vscode.window.showWarningMessage(
                    `Drop ${items.length} stash${items.length !== 1 ? 'es' : ''}? This cannot be undone.`,
                    { modal: true },
                    'Yes',
                    'No',
                );
                if (confirm !== 'Yes') {
                    return;
                }

                // Drop in reverse index order to avoid index shifting
                const sorted = [...items].sort((a, b) => b.stashEntry.index - a.stashEntry.index);
                let successCount = 0;
                let failCount = 0;

                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: 'Dropping stashes…',
                        cancellable: false,
                    },
                    async (progress) => {
                        for (const item of sorted) {
                            progress.report({ message: `${item.stashEntry.name}…` });
                            try {
                                await gitService.dropStash(item.stashEntry.index);
                                successCount++;
                            } catch {
                                failCount++;
                            }
                        }
                    },
                );

                const parts: string[] = [];
                if (successCount > 0) {
                    parts.push(`${successCount} dropped`);
                }
                if (failCount > 0) {
                    parts.push(`${failCount} failed`);
                }
                vscode.window.showInformationMessage(`Batch drop: ${parts.join(', ')}`);
                stashProvider.refresh('post-command');
            },
        ),
    );
}

export function deactivate() {}
