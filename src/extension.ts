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
import { PrService } from './prService';
import { PrProvider } from './prProvider';
import { PrItem } from './prItem';
import { IssueService } from './issueService';
import { IssueProvider } from './issueProvider';
import { IssueItem } from './issueItem';
import { ProjectService } from './projectService';
import { ProjectProvider } from './projectProvider';
import { ProjectItemTreeItem } from './projectItem';
import { MattermostService } from './mattermostService';
import { MattermostProvider } from './mattermostProvider';
import { MattermostChannelItem, MattermostSeparatorItem } from './mattermostItem';
import { GoogleAuthProvider } from './googleAuthProvider';
import { GoogleDriveService } from './googleDriveService';
import { GoogleDriveProvider } from './googleDriveProvider';
import { DriveFileItem } from './googleDriveItem';
import { pickStash } from './uiUtils';
import { getConfig } from './utils';

export function activate(context: vscode.ExtensionContext) {
    console.log('CoreNexus extension is now active!');

    // 0b-i: Create output channel for diagnostics
    const outputChannel = vscode.window.createOutputChannel('CoreNexus');
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
        await vscode.commands.executeCommand('setContext', 'corenexus.isAuthenticated', isAuth);
        outputChannel.appendLine(`[Auth] corenexus.isAuthenticated = ${isAuth}`);
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

    // ─── PR Feature ───────────────────────────────────────────────

    // PrService — GitHub Pull Request API
    const prService = new PrService(authService, outputChannel);

    // PrProvider — tree data provider for PRs sidebar
    const prProvider = new PrProvider(prService, gitService, authService, outputChannel);
    context.subscriptions.push(prProvider);

    // Register the pull requests tree view
    const prTreeView = vscode.window.createTreeView('pullRequestsView', {
        treeDataProvider: prProvider,
        showCollapseAll: false,
        canSelectMany: false,
    });
    context.subscriptions.push(prTreeView);
    prProvider.setTreeView(prTreeView);

    // Set isGitHubRepo context key
    const updateGitHubRepoContext = async () => {
        const ghRepo = await gitService.getGitHubRepo();
        await vscode.commands.executeCommand('setContext', 'corenexus.isGitHubRepo', !!ghRepo);
    };
    updateGitHubRepoContext();

    // Refresh PRs when auth state changes
    context.subscriptions.push(
        authService.onDidChangeAuthentication(() => {
            prProvider.refresh('auth-changed');
        }),
    );

    // ─── Issues Feature ───────────────────────────────────────────

    // IssueService — GitHub Issues API
    const issueService = new IssueService(authService, outputChannel);

    // IssueProvider — tree data provider for Issues sidebar
    const issueProvider = new IssueProvider(issueService, gitService, authService, outputChannel);
    context.subscriptions.push(issueProvider);

    // Register the issues tree view
    const issuesTreeView = vscode.window.createTreeView('issuesView', {
        treeDataProvider: issueProvider,
        showCollapseAll: false,
        canSelectMany: false,
    });
    context.subscriptions.push(issuesTreeView);
    issueProvider.setTreeView(issuesTreeView);

    // Refresh issues when auth state changes
    context.subscriptions.push(
        authService.onDidChangeAuthentication(() => {
            issueProvider.refresh('auth-changed');
        }),
    );

    // ─── Projects Feature ─────────────────────────────────────────

    // ProjectService — GitHub Projects V2 GraphQL API
    const projectService = new ProjectService(authService, outputChannel);

    // ProjectProvider — tree data provider for Projects sidebar
    const projectProvider = new ProjectProvider(projectService, gitService, authService, outputChannel);
    context.subscriptions.push(projectProvider);

    // Register the projects tree view
    const projectsTreeView = vscode.window.createTreeView('projectsView', {
        treeDataProvider: projectProvider,
        showCollapseAll: false,
        canSelectMany: false,
    });
    context.subscriptions.push(projectsTreeView);
    projectProvider.setTreeView(projectsTreeView);

    // Refresh projects when auth state changes
    context.subscriptions.push(
        authService.onDidChangeAuthentication(() => {
            projectProvider.refresh('auth-changed');
        }),
    );

    // ─── Mattermost Feature ───────────────────────────────────────

    // MattermostService — Mattermost REST API (auth via SecretStorage)
    const mattermostService = new MattermostService(outputChannel, context.secrets);

    // MattermostProvider — tree data provider for Mattermost sidebar
    const mattermostProvider = new MattermostProvider(mattermostService, outputChannel);
    context.subscriptions.push(mattermostProvider);

    // Register the mattermost tree view
    const mattermostTreeView = vscode.window.createTreeView('mattermostView', {
        treeDataProvider: mattermostProvider,
        showCollapseAll: true,
        canSelectMany: false,
    });
    context.subscriptions.push(mattermostTreeView);
    mattermostProvider.setTreeView(mattermostTreeView);

    // Refresh mattermost when auth state changes
    context.subscriptions.push(
        mattermostService.onDidChangeAuth(() => {
            mattermostProvider.refresh('auth-changed');
        }),
    );

    // ─── Google Drive Feature ─────────────────────────────────────

    // GoogleAuthProvider — custom VS Code auth provider for Google OAuth 2.0
    const googleAuthProvider = new GoogleAuthProvider(context, outputChannel);
    context.subscriptions.push(googleAuthProvider);

    // GoogleDriveService — Google Drive REST API
    const driveService = new GoogleDriveService(googleAuthProvider, outputChannel, context.globalState);

    // GoogleDriveProvider — tree data provider for Google Drive sidebar
    const driveProvider = new GoogleDriveProvider(driveService, outputChannel);
    context.subscriptions.push(driveProvider);

    // Register the Google Drive tree view
    const driveTreeView = vscode.window.createTreeView('googleDriveView', {
        treeDataProvider: driveProvider,
        showCollapseAll: true,
        canSelectMany: false,
    });
    context.subscriptions.push(driveTreeView);
    driveProvider.setTreeView(driveTreeView);

    // Update context key for Google Drive auth state
    const updateGoogleAuthContext = async () => {
        const isGoogleAuth = await driveService.isAuthenticated();
        await vscode.commands.executeCommand('setContext', 'corenexus.isGoogleAuthenticated', isGoogleAuth);
    };

    // Update context key for Google Drive configured state
    const updateGoogleConfiguredContext = () => {
        const clientId = vscode.workspace.getConfiguration('corenexus').get<string>('google.clientId', '');
        void vscode.commands.executeCommand('setContext', 'corenexus.isGoogleConfigured', !!clientId);
    };
    updateGoogleConfiguredContext();

    // Watch for settings changes to keep configured context in sync
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('corenexus.google.clientId')) {
                updateGoogleConfiguredContext();
            }
        }),
    );

    context.subscriptions.push(
        driveService.onDidChangeAuth(() => {
            driveProvider.refresh('auth-changed');
            updateGoogleAuthContext();
        }),
    );
    updateGoogleAuthContext();

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
    statusBarItem.tooltip = 'CoreNexus — Click to view stashes';
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
                prProvider.refresh('window-focus');
                issueProvider.refresh('window-focus');
                mattermostProvider.refresh('window-focus');
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
            StashPanel.createOrShow(context.extensionUri, gitService, outputChannel, authService, gistService, prService, issueService, mattermostService, projectService, driveService);
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
        vscode.commands.registerCommand('corenexus.notes.signIn', async () => {
            const session = await authService.signIn();
            if (session) {
                vscode.window.showInformationMessage(
                    `Signed in to GitHub as ${session.account.label}`,
                );
            }
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('corenexus.notes.signOut', async () => {
            await authService.signOut();
            vscode.window.showInformationMessage('Signed out of GitHub');
        }),
    );

    // --- 16-17: Notes CRUD commands ---

    context.subscriptions.push(
        vscode.commands.registerCommand('corenexus.notes.create', async () => {
            const title = await vscode.window.showInputBox({
                prompt: 'Note title',
                placeHolder: 'My new note',
                validateInput: (value) => (value.trim() ? null : 'Title cannot be empty'),
            });
            if (!title) {
                return;
            }

            const defaultVisibility = vscode.workspace
                .getConfiguration('corenexus.notes')
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
        vscode.commands.registerCommand('corenexus.notes.open', async (item?: GistNoteItem) => {
            if (!item) {
                return;
            }
            // Open the note in the webview panel
            StashPanel.createOrShow(context.extensionUri, gitService, outputChannel, authService, gistService, prService, issueService, mattermostService, projectService, driveService);
            StashPanel.currentPanel?.openNote(item.note.id);
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('corenexus.notes.delete', async (item?: GistNoteItem) => {
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
        vscode.commands.registerCommand('corenexus.notes.copyLink', async (item?: GistNoteItem) => {
            if (!item) {
                return;
            }
            await vscode.env.clipboard.writeText(item.note.htmlUrl);
            vscode.window.showInformationMessage('Gist link copied to clipboard');
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'corenexus.notes.toggleVisibility',
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
        vscode.commands.registerCommand('corenexus.notes.refresh', () => {
            gistNotesProvider.refresh('manual');
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('corenexus.notes.search', async () => {
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
                'corenexus.notes.isSearching',
                query.length > 0,
            );
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('corenexus.notes.clearSearch', () => {
            gistNotesProvider.setSearchQuery('');
            vscode.commands.executeCommand('setContext', 'corenexus.notes.isSearching', false);
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

    // ─── PR commands ───

    context.subscriptions.push(
        vscode.commands.registerCommand('corenexus.prs.refresh', () => {
            prProvider.refresh('manual');
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('corenexus.prs.open', async (item?: PrItem) => {
            if (!item) {
                return;
            }
            // Open the PR in the webview panel
            StashPanel.createOrShow(context.extensionUri, gitService, outputChannel, authService, gistService, prService, issueService, mattermostService, projectService, driveService);
            StashPanel.currentPanel?.openPR(item.pr.number);
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('corenexus.prs.openInBrowser', async (item?: PrItem) => {
            if (!item) {
                return;
            }
            await vscode.env.openExternal(vscode.Uri.parse(item.pr.htmlUrl));
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('corenexus.prs.signIn', async () => {
            const session = await authService.signIn();
            if (session) {
                vscode.window.showInformationMessage(
                    `Signed in to GitHub as ${session.account.label}`,
                );
            }
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('corenexus.prs.filter', async () => {
            const current = prProvider.stateFilter;
            const items: vscode.QuickPickItem[] = [
                { label: 'Open', description: current === 'open' ? '(current)' : '' },
                { label: 'Merged', description: current === 'merged' ? '(current)' : '' },
                { label: 'Closed', description: current === 'closed' ? '(current)' : '' },
                { label: 'All', description: current === 'all' ? '(current)' : '' },
            ];
            const choice = await vscode.window.showQuickPick(items, {
                placeHolder: 'Filter pull requests by state',
            });
            if (!choice) {
                return;
            }
            const stateMap: Record<string, 'open' | 'merged' | 'closed' | 'all'> = {
                Open: 'open',
                Merged: 'merged',
                Closed: 'closed',
                All: 'all',
            };
            prProvider.setStateFilter(stateMap[choice.label] ?? 'open');
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('corenexus.prs.search', async () => {
            const query = await vscode.window.showInputBox({
                prompt: 'Search pull requests by title, number, or branch',
                placeHolder: 'e.g. fix, #42, feature/auth',
                value: prProvider.searchQuery,
            });
            if (query === undefined) {
                return;
            }
            prProvider.setSearchQuery(query);
            await vscode.commands.executeCommand(
                'setContext',
                'corenexus.prs.isSearching',
                query.length > 0,
            );
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('corenexus.prs.clearSearch', () => {
            prProvider.setSearchQuery('');
            vscode.commands.executeCommand('setContext', 'corenexus.prs.isSearching', false);
        }),
    );

    // ─── Issue commands ───

    context.subscriptions.push(
        vscode.commands.registerCommand('corenexus.issues.refresh', () => {
            issueProvider.refresh('manual');
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('corenexus.issues.open', async (item?: IssueItem) => {
            if (!item) {
                return;
            }
            // Open the issue in the webview panel
            StashPanel.createOrShow(context.extensionUri, gitService, outputChannel, authService, gistService, prService, issueService, mattermostService, projectService, driveService);
            StashPanel.currentPanel?.openIssue(item.issue.number);
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('corenexus.issues.openInBrowser', async (item?: IssueItem) => {
            if (!item) {
                return;
            }
            await vscode.env.openExternal(vscode.Uri.parse(item.issue.htmlUrl));
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('corenexus.issues.signIn', async () => {
            const session = await authService.signIn();
            if (session) {
                vscode.window.showInformationMessage(
                    `Signed in to GitHub as ${session.account.label}`,
                );
            }
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('corenexus.issues.filter', async () => {
            const current = issueProvider.stateFilter;
            const items: vscode.QuickPickItem[] = [
                { label: 'Open', description: current === 'open' ? '(current)' : '' },
                { label: 'Closed', description: current === 'closed' ? '(current)' : '' },
                { label: 'All', description: current === 'all' ? '(current)' : '' },
            ];
            const choice = await vscode.window.showQuickPick(items, {
                placeHolder: 'Filter issues by state',
            });
            if (!choice) {
                return;
            }
            const stateMap: Record<string, 'open' | 'closed' | 'all'> = {
                Open: 'open',
                Closed: 'closed',
                All: 'all',
            };
            issueProvider.setStateFilter(stateMap[choice.label] ?? 'open');
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('corenexus.issues.search', async () => {
            const query = await vscode.window.showInputBox({
                prompt: 'Search issues by title, number, or label',
                placeHolder: 'e.g. bug, #15, enhancement',
                value: issueProvider.searchQuery,
            });
            if (query === undefined) {
                return;
            }
            issueProvider.setSearchQuery(query);
            await vscode.commands.executeCommand(
                'setContext',
                'corenexus.issues.isSearching',
                query.length > 0,
            );
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('corenexus.issues.clearSearch', () => {
            issueProvider.setSearchQuery('');
            vscode.commands.executeCommand('setContext', 'corenexus.issues.isSearching', false);
        }),
    );

    // ─── Mattermost commands ───

    context.subscriptions.push(
        vscode.commands.registerCommand('corenexus.mattermost.refresh', () => {
            mattermostProvider.refresh('manual');
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('corenexus.mattermost.signIn', async () => {
            const success = await mattermostService.signIn();
            if (success) {
                mattermostProvider.refresh('sign-in');
            }
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('corenexus.mattermost.signOut', async () => {
            await mattermostService.signOut();
            mattermostProvider.refresh('sign-out');
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('corenexus.mattermost.openChannel', async (item?: MattermostChannelItem) => {
            if (!item) {
                return;
            }
            // Open the channel in the webview panel
            StashPanel.createOrShow(context.extensionUri, gitService, outputChannel, authService, gistService, prService, issueService, mattermostService, projectService, driveService);
            StashPanel.currentPanel?.openChannel(item.channel.id, item.channel.displayName);
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('corenexus.mattermost.search', async () => {
            await mattermostProvider.search();
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('corenexus.mattermost.clearSearch', () => {
            mattermostProvider.clearSearch();
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('corenexus.mattermost.configure', () => {
            vscode.commands.executeCommand(
                'workbench.action.openSettings',
                'corenexus.mattermost.serverUrl',
            );
        }),
    );

    // ─── Projects commands ───

    context.subscriptions.push(
        vscode.commands.registerCommand('corenexus.projects.refresh', () => {
            projectProvider.refresh('manual');
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('corenexus.projects.signIn', async () => {
            await authService.signIn();
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('corenexus.projects.signOut', async () => {
            await authService.signOut();
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('corenexus.projects.openItem', async (item?: ProjectItemTreeItem) => {
            if (!item) {
                return;
            }
            // Open the project item in the webview panel
            StashPanel.createOrShow(context.extensionUri, gitService, outputChannel, authService, gistService, prService, issueService, mattermostService, projectService, driveService);
            StashPanel.currentPanel?.openProjectItem(item.projectItem.id);
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('corenexus.projects.openInBrowser', async (item?: ProjectItemTreeItem) => {
            if (!item) {
                return;
            }
            const url = item.projectItem.content?.url;
            if (url) {
                vscode.env.openExternal(vscode.Uri.parse(url));
            }
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('corenexus.projects.filter', async () => {
            const options = projectProvider.getStatusOptions();
            if (options.length === 0) {
                vscode.window.showInformationMessage('No status options available. Select a project first.');
                return;
            }
            const items = [
                { label: 'All', value: '' },
                ...options.map((o) => ({ label: o, value: o })),
            ];
            const picked = await vscode.window.showQuickPick(items, {
                placeHolder: 'Filter by status',
            });
            if (picked) {
                projectProvider.setStatusFilter(picked.value);
            }
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('corenexus.projects.search', async () => {
            const query = await vscode.window.showInputBox({
                placeHolder: 'Search project items…',
                prompt: 'Enter a search term to filter project items',
            });
            if (query !== undefined) {
                projectProvider.setSearchQuery(query);
                vscode.commands.executeCommand(
                    'setContext',
                    'corenexus.projects.isSearching',
                    query.length > 0,
                );
            }
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('corenexus.projects.clearSearch', () => {
            projectProvider.setSearchQuery('');
            vscode.commands.executeCommand('setContext', 'corenexus.projects.isSearching', false);
        }),
    );

    // ─── Google Drive commands ───

    context.subscriptions.push(
        vscode.commands.registerCommand('corenexus.drive.refresh', () => {
            driveProvider.refresh('manual');
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('corenexus.drive.signIn', async () => {
            try {
                await driveService.signIn();
            } catch (e: unknown) {
                vscode.window.showErrorMessage(
                    `Google sign-in failed: ${e instanceof Error ? e.message : e}`,
                );
            }
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('corenexus.drive.signOut', async () => {
            await driveService.signOut();
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('corenexus.drive.configure', () => {
            vscode.commands.executeCommand(
                'workbench.action.openSettings',
                'corenexus.google.clientId',
            );
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('corenexus.drive.openFile', async (item?: DriveFileItem) => {
            if (!item?.webViewLink) {
                return;
            }
            await vscode.env.openExternal(vscode.Uri.parse(item.webViewLink));
        }),
    );
}

export function deactivate() {}
