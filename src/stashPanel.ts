import * as vscode from 'vscode';
import { GitService, StashEntry, StashFileEntry } from './gitService';
import { AuthService } from './authService';
import { GistService } from './gistService';
import { PrService } from './prService';
import { IssueService } from './issueService';
import { MattermostService, MattermostPostData, MattermostChannelData } from './mattermostService';
import { MattermostWebSocket, MmWsPostedData, MmWsReactionData, MmWsStatusChangeData, MmWsTypingData } from './mattermostWebSocket';
import { ProjectService } from './projectService';
import { GoogleDriveService } from './googleDriveService';
import { GoogleCalendarService } from './calendarService';
import { WikiService } from './wikiService';
import { AiService } from './aiService';
import { formatRelativeTime, getConfig } from './utils';

/**
 * Manages the Superprompt Forge webview panel — a rich, interactive stash explorer
 * that opens as an editor tab, powered by a React + Zustand + Tailwind UI.
 */
export class StashPanel {
    public static readonly viewType = 'superprompt-forge.panel';

    private static _instance: StashPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _gitService: GitService;
    private readonly _authService: AuthService | undefined;
    private readonly _gistService: GistService | undefined;
    private readonly _prService: PrService | undefined;
    private readonly _issueService: IssueService | undefined;
    private readonly _mattermostService: MattermostService | undefined;
    private readonly _projectService: ProjectService | undefined;
    private readonly _driveService: GoogleDriveService | undefined;
    private readonly _calendarService: GoogleCalendarService | undefined;
    private readonly _wikiService: WikiService | undefined;
    private readonly _aiService: AiService;
    private readonly _extensionUri: vscode.Uri;
    private readonly _outputChannel: vscode.OutputChannel;
    private _disposables: vscode.Disposable[] = [];
    private _isReady = false;
    private _mmWebSocket: MattermostWebSocket | undefined;
    /** Queued deep-link messages to send once the webview is ready */
    private _pendingDeepLinks: Array<Record<string, unknown>> = [];

    /**
     * Optional repo override chosen by the user in the webview.
     * When set, GitHub-related tabs (PRs, Issues, Projects) use this
     * instead of auto-detecting from the git origin remote.
     */
    private _repoOverride: { owner: string; repo: string } | undefined;

    /** Access the current panel instance (e.g. for openNote deep-links). */
    public static get currentPanel(): StashPanel | undefined {
        return StashPanel._instance;
    }

    /**
     * 8b-iii: Refresh the webview panel if it is currently open.
     * Called from StashProvider.refresh() so tree + webview stay in sync.
     */
    public static refreshIfOpen(): void {
        if (StashPanel._instance && StashPanel._instance._isReady) {
            StashPanel._instance._refresh();
        }
    }

    /**
     * Resolve the active GitHub repo — uses the user's webview override
     * if set, otherwise falls back to auto-detecting from the git origin.
     */
    private async _getRepoInfo(): Promise<{ owner: string; repo: string } | undefined> {
        if (this._repoOverride) {
            return this._repoOverride;
        }
        return this._gitService.getGitHubRepo();
    }

    /**
     * Send the current repo context + all available GitHub remotes to the
     * webview so it can render the repo switcher.
     */
    private async _sendRepoContext(): Promise<void> {
        const current = await this._getRepoInfo();
        const allRemotes = await this._gitService.getAllGitHubRemotes();
        const repos = allRemotes.map((r) => ({
            owner: r.owner,
            repo: r.repo,
            remote: r.remote,
        }));
        this._panel.webview.postMessage({
            type: 'repoContext',
            current: current ? { owner: current.owner, repo: current.repo } : null,
            repos,
        });
    }

    /**
     * Fetch the user's repos grouped by owner (personal + orgs) via GitHub API
     * and send to the webview for the repo switcher.
     */
    private async _fetchUserRepos(): Promise<void> {
        if (!this._prService || !this._authService) {
            return;
        }
        try {
            const isAuth = await this._authService.isAuthenticated();
            if (!isAuth) {
                return;
            }

            this._panel.webview.postMessage({ type: 'repoGroupsLoading' });

            const groups = await this._prService.getUserRepoGroups();
            this._panel.webview.postMessage({
                type: 'repoGroups',
                payload: groups,
            });
        } catch (e: unknown) {
            this._outputChannel.appendLine(
                `[RepoSwitcher] Failed to fetch user repos: ${e instanceof Error ? e.message : e}`,
            );
        }
    }

    public static createOrShow(
        extensionUri: vscode.Uri,
        gitService: GitService,
        outputChannel: vscode.OutputChannel,
        authService?: AuthService,
        gistService?: GistService,
        prService?: PrService,
        issueService?: IssueService,
        mattermostService?: MattermostService,
        projectService?: ProjectService,
        driveService?: GoogleDriveService,
        calendarService?: GoogleCalendarService,
        wikiService?: WikiService,
    ): StashPanel {
        const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

        if (StashPanel._instance) {
            StashPanel._instance._panel.reveal(column);
            StashPanel._instance._refresh();
            return StashPanel._instance;
        }

        const panel = vscode.window.createWebviewPanel(StashPanel.viewType, 'Superprompt Forge', column, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
        });

        StashPanel._instance = new StashPanel(
            panel,
            extensionUri,
            gitService,
            outputChannel,
            authService,
            gistService,
            prService,
            issueService,
            mattermostService,
            projectService,
            driveService,
            calendarService,
            wikiService,
        );
        return StashPanel._instance;
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        gitService: GitService,
        outputChannel: vscode.OutputChannel,
        authService?: AuthService,
        gistService?: GistService,
        prService?: PrService,
        issueService?: IssueService,
        mattermostService?: MattermostService,
        projectService?: ProjectService,
        driveService?: GoogleDriveService,
        calendarService?: GoogleCalendarService,
        wikiService?: WikiService,
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._gitService = gitService;
        this._outputChannel = outputChannel;
        this._authService = authService;
        this._gistService = gistService;
        this._prService = prService;
        this._issueService = issueService;
        this._mattermostService = mattermostService;
        this._projectService = projectService;
        this._driveService = driveService;
        this._calendarService = calendarService;
        this._wikiService = wikiService;
        this._aiService = new AiService(outputChannel);

        this._panel.iconPath = new vscode.ThemeIcon('archive');
        this._panel.webview.html = this._getHtml();

        // Handle messages from the React webview
        this._panel.webview.onDidReceiveMessage(
            async (msg) => this._handleMessage(msg),
            null,
            this._disposables,
        );

        this._panel.onDidDispose(() => this._dispose(), null, this._disposables);
    }

    /** Deep-link: switch to Notes tab and select a specific note. */
    public openNote(noteId: string): void {
        const msg = { type: 'openNote', noteId };
        if (this._isReady) {
            this._panel.webview.postMessage(msg);
        } else {
            this._pendingDeepLinks.push(msg);
        }
    }

    /** Deep-link: switch to PRs tab and select a specific PR. */
    public openPR(prNumber: number): void {
        const msg = { type: 'openPR', prNumber };
        if (this._isReady) {
            this._panel.webview.postMessage(msg);
        } else {
            this._pendingDeepLinks.push(msg);
        }
    }

    /** Deep-link: switch to Issues tab and select a specific issue. */
    public openIssue(issueNumber: number): void {
        const msg = { type: 'openIssue', issueNumber };
        if (this._isReady) {
            this._panel.webview.postMessage(msg);
        } else {
            this._pendingDeepLinks.push(msg);
        }
    }

    /** Deep-link: switch to Mattermost tab and open a specific channel. */
    public openChannel(channelId: string, channelName: string): void {
        const msg = { type: 'openChannel', channelId, channelName };
        if (this._isReady) {
            this._panel.webview.postMessage(msg);
        } else {
            this._pendingDeepLinks.push(msg);
        }
    }

    /** Deep-link: switch to Projects tab and select a specific item. */
    public openProjectItem(itemId: string): void {
        const msg = { type: 'openProjectItem', itemId };
        if (this._isReady) {
            this._panel.webview.postMessage(msg);
        } else {
            this._pendingDeepLinks.push(msg);
        }
    }

    /** Gather stash data and post it to the webview as a single message. */
    private async _refresh(): Promise<void> {
        // Tell webview we're loading
        this._panel.webview.postMessage({ type: 'loading' });

        try {
            const stashes = await this._gitService.getStashList();
            const payload = await this._buildPayload(stashes);
            this._panel.webview.postMessage({ type: 'stashData', payload });

            // 8b-vi: Update panel title with stash count
            this._panel.title = stashes.length > 0 ? `Superprompt Forge (${stashes.length})` : 'Superprompt Forge';
        } catch {
            this._panel.webview.postMessage({ type: 'stashData', payload: [] });
            this._panel.title = 'Superprompt Forge';
        }
    }

    private async _buildPayload(stashes: StashEntry[]): Promise<unknown[]> {
        const result: unknown[] = [];

        for (const entry of stashes) {
            let files: StashFileEntry[] = [];
            try {
                files = await this._gitService.getStashFilesWithStatus(entry.index);
            } catch {
                /* non-critical */
            }

            try {
                const stats = await this._gitService.getStashStats(entry.index);
                if (stats) {
                    entry.stats = stats;
                }
            } catch {
                /* optional */
            }

            let numstat: { path: string; insertions: number; deletions: number }[] = [];
            try {
                numstat = await this._gitService.getStashFileNumstat(entry.index);
            } catch {
                /* optional */
            }

            result.push({
                index: entry.index,
                name: entry.name,
                branch: entry.branch,
                message: entry.message,
                date: entry.date.toISOString(),
                relativeDate: formatRelativeTime(entry.date),
                stats: entry.stats,
                files: files.map((f) => ({ path: f.path, status: f.status })),
                numstat: numstat.map((n) => ({
                    path: n.path,
                    insertions: n.insertions,
                    deletions: n.deletions,
                })),
            });
        }
        return result;
    }

    private async _handleMessage(msg: {
        type: string;
        index?: number;
        filePath?: string;
        message?: string;
        mode?: string;
        // Notes message properties
        noteId?: string;
        title?: string;
        content?: string;
        isPublic?: boolean;
        targetNoteId?: string;
        // PR message properties
        prNumber?: number;
        body?: string;
        state?: string;
        // PR comment threading properties
        commentId?: number;
        threadId?: string;
        isResolved?: boolean;
        resolvedBy?: string | null;
        // PR reviewer properties
        reviewers?: string[];
        reviewer?: string;
        // Issue message properties
        issueNumber?: number;
        stateReason?: string;
        // Mattermost message properties
        channelId?: string;
        teamId?: string;
        page?: number;
        // Mattermost thread/reaction/DM properties
        rootId?: string;
        postId?: string;
        emojiName?: string;
        term?: string;
        terms?: string;
        targetUserId?: string;
        userIds?: string[];
        userId?: string;
        status?: string;
        dndEndTime?: number;
        fileIds?: string[];
        // Link preview properties
        url?: string;
        // Optimistic message correlation
        pendingId?: string;
        // Project message properties
        projectId?: string;
        itemId?: string;
        fieldId?: string;
        value?: unknown;
        contentId?: string;
        // Repo switcher properties
        owner?: string;
        repo?: string;
        // AI message properties
        tabKey?: string;
        question?: string;
        history?: Array<{ role: 'user' | 'assistant'; content: string }>;
        purpose?: string;
        modelId?: string;
        customPrompt?: string;
        systemPrompt?: string;
        webSearch?: boolean;
        // Settings message properties
        key?: string;
        // Google Drive message properties
        folderId?: string;
        fileId?: string;
        driveId?: string;
        query?: string;
        starred?: boolean;
        name?: string;
        mimeType?: string;
        webViewLink?: string;
        // Google Calendar message properties
        timeMin?: string;
        timeMax?: string;
        // Wiki message properties
        filename?: string;
    }): Promise<void> {
        switch (msg.type) {
            case 'ready':
                this._isReady = true;
                await this._refresh();
                await this._sendAuthStatus();
                await this._sendRepoContext();
                await this._refreshNotes();
                await this._refreshPRs();
                await this._refreshIssues();
                await this._refreshProjects();
                await this._refreshMattermost();
                await this._sendDriveAuthStatus();
                await this._sendCalendarAuthStatus();
                await this._refreshWiki();
                // Fire-and-forget: pre-fetch user repos for the repo switcher
                this._fetchUserRepos();
                // Inform webview whether AI features are available and which provider
                this._panel.webview.postMessage({
                    type: 'aiAvailable',
                    available: AiService.isAvailable(),
                    provider: AiService.activeProvider(),
                });
                // Flush any deep-link messages that were queued before the webview was ready
                for (const deepLink of this._pendingDeepLinks) {
                    this._panel.webview.postMessage(deepLink);
                }
                this._pendingDeepLinks = [];
                break;

            case 'refresh':
                await this._refresh();
                break;

            // ─── Repo switcher ───
            case 'switchRepo':
                if (msg.owner && msg.repo) {
                    this._repoOverride = { owner: msg.owner, repo: msg.repo };
                } else {
                    // Reset to auto-detect from git origin
                    this._repoOverride = undefined;
                }
                await this._sendRepoContext();
                // Re-fetch all GitHub-dependent data with the new repo
                await Promise.all([
                    this._refreshPRs(),
                    this._refreshIssues(),
                    this._refreshProjects(),
                    this._refreshWiki(),
                    this._refreshNotes(),
                ]);
                break;

            case 'apply':
                if (msg.index !== undefined) {
                    const applyResult = await this._gitService.applyStash(msg.index);
                    if (applyResult.success && applyResult.conflicts) {
                        vscode.window.showWarningMessage(
                            `Applied stash@{${msg.index}} with merge conflicts. Resolve them manually.`,
                        );
                    } else if (applyResult.success) {
                        vscode.window.showInformationMessage(`Applied stash@{${msg.index}}`);
                    } else {
                        vscode.window.showErrorMessage(`Failed to apply: ${applyResult.message}`);
                    }
                    await this._refresh();
                }
                break;

            case 'pop':
                if (msg.index !== undefined) {
                    const popResult = await this._gitService.popStash(msg.index);
                    if (popResult.success && popResult.conflicts) {
                        vscode.window.showWarningMessage(
                            `Stash applied with conflicts but was NOT removed. Resolve conflicts, then drop manually.`,
                        );
                    } else if (popResult.success) {
                        vscode.window.showInformationMessage(`Popped stash@{${msg.index}}`);
                    } else {
                        vscode.window.showErrorMessage(`Failed to pop: ${popResult.message}`);
                    }
                    await this._refresh();
                }
                break;

            case 'drop':
                if (msg.index !== undefined) {
                    // 9a-ii: Respect confirmOnDrop setting
                    if (getConfig<boolean>('confirmOnDrop', true)) {
                        const confirm = await vscode.window.showWarningMessage(
                            `Drop stash@{${msg.index}}? This cannot be undone.`,
                            { modal: true },
                            'Yes',
                            'No',
                        );
                        if (confirm !== 'Yes') {
                            break;
                        }
                    }
                    try {
                        await this._gitService.dropStash(msg.index);
                        vscode.window.showInformationMessage(`Dropped stash@{${msg.index}}`);
                        await this._refresh();
                    } catch (e: unknown) {
                        const m = e instanceof Error ? e.message : 'Unknown error';
                        vscode.window.showErrorMessage(`Failed to drop: ${m}`);
                    }
                }
                break;

            case 'showFile':
                if (msg.index !== undefined && msg.filePath) {
                    const fileName = msg.filePath.split('/').pop() ?? msg.filePath;
                    const parentUri = vscode.Uri.parse(
                        `superprompt-forge:/${msg.filePath}?ref=parent&index=${msg.index}`,
                    );
                    const stashUri = vscode.Uri.parse(
                        `superprompt-forge:/${msg.filePath}?ref=stash&index=${msg.index}`,
                    );
                    try {
                        await vscode.commands.executeCommand(
                            'vscode.diff',
                            parentUri,
                            stashUri,
                            `${fileName} (stash@{${msg.index}})`,
                            { preview: true },
                        );
                    } catch (e: unknown) {
                        const m = e instanceof Error ? e.message : 'Unknown error';
                        vscode.window.showErrorMessage(`Failed to show diff: ${m}`);
                    }
                }
                break;

            case 'getFileDiff':
                if (msg.index !== undefined && msg.filePath) {
                    const diffKey = `${msg.index}:${msg.filePath}`;
                    try {
                        const diff = await this._gitService.getStashFileDiff(
                            msg.index,
                            msg.filePath,
                        );
                        this._panel.webview.postMessage({
                            type: 'fileDiff',
                            key: diffKey,
                            diff: diff || '',
                        });
                    } catch (e: unknown) {
                        // Git service logs errors to its own output channel
                        this._panel.webview.postMessage({
                            type: 'fileDiff',
                            key: diffKey,
                            diff: '',
                        });
                    }
                }
                break;

            case 'createStash':
                await vscode.commands.executeCommand('superprompt-forge.stash');
                await this._refresh();
                break;

            case 'createStashInline': {
                // 8b-ii: Handle inline stash creation from webview form
                const stashMessage = msg.message ?? '';
                const stashMode = (msg.mode ?? 'all') as 'all' | 'staged' | 'untracked';
                try {
                    await this._gitService.createStash(stashMessage || undefined, stashMode);
                    vscode.window.showInformationMessage(
                        stashMessage
                            ? `Stashed: "${stashMessage}"`
                            : 'Changes stashed successfully',
                    );
                } catch (e: unknown) {
                    const m = e instanceof Error ? e.message : 'Unknown error';
                    vscode.window.showErrorMessage(`Stash failed: ${m}`);
                }
                await this._refresh();
                break;
            }

            case 'clearStashes':
                await vscode.commands.executeCommand('superprompt-forge.clear');
                await this._refresh();
                break;

            // ─── Notes messages from webview ───

            case 'notes.signIn':
                await vscode.commands.executeCommand('superprompt-forge.notes.signIn');
                await this._sendAuthStatus();
                await this._refreshNotes();
                break;

            case 'notes.signOut':
                await vscode.commands.executeCommand('superprompt-forge.notes.signOut');
                await this._sendAuthStatus();
                break;

            case 'notes.refresh':
                await this._refreshNotes();
                break;

            case 'notes.create':
                if (msg.title && this._gistService) {
                    try {
                        this._panel.webview.postMessage({ type: 'notesLoading' });
                        // Auto-link to current workspace
                        const repoInfo = await this._getRepoInfo();
                        const linkedRepo = repoInfo ? `${repoInfo.owner}/${repoInfo.repo}` : undefined;
                        const note = await this._gistService.createNote(
                            msg.title,
                            msg.content ?? '',
                            msg.isPublic ?? false,
                            linkedRepo,
                        );
                        this._panel.webview.postMessage({
                            type: 'noteCreated',
                            note: GistService.toData(note),
                        });
                    } catch (e: unknown) {
                        const m = e instanceof Error ? e.message : 'Unknown error';
                        vscode.window.showErrorMessage(`Failed to create note: ${m}`);
                        this._panel.webview.postMessage({ type: 'notesError', message: m });
                    }
                }
                break;

            case 'notes.save':
                if (msg.noteId && this._gistService) {
                    try {
                        this._panel.webview.postMessage({ type: 'notesSaving' });
                        const saved = await this._gistService.updateNote(
                            msg.noteId,
                            msg.title ?? '',
                            msg.content ?? '',
                        );
                        this._panel.webview.postMessage({
                            type: 'noteSaved',
                            noteId: msg.noteId,
                            title: saved.title,
                            content: saved.content,
                            updatedAt: saved.updatedAt.toISOString(),
                        });
                    } catch (e: unknown) {
                        const m = e instanceof Error ? e.message : 'Unknown error';
                        vscode.window.showErrorMessage(`Failed to save note: ${m}`);
                        this._panel.webview.postMessage({ type: 'notesError', message: m });
                    }
                }
                break;

            case 'notes.delete':
                if (msg.noteId && this._gistService) {
                    const confirm = await vscode.window.showWarningMessage(
                        'Delete this note? This cannot be undone.',
                        { modal: true },
                        'Delete',
                        'Cancel',
                    );
                    if (confirm !== 'Delete') {
                        break;
                    }
                    try {
                        await this._gistService.deleteNote(msg.noteId);
                        this._panel.webview.postMessage({
                            type: 'noteDeleted',
                            noteId: msg.noteId,
                        });
                    } catch (e: unknown) {
                        const m = e instanceof Error ? e.message : 'Unknown error';
                        vscode.window.showErrorMessage(`Failed to delete note: ${m}`);
                        this._panel.webview.postMessage({ type: 'notesError', message: m });
                    }
                }
                break;

            case 'notes.copyLink':
                if (msg.noteId && this._gistService) {
                    try {
                        const note = await this._gistService.getNote(msg.noteId);
                        if (note) {
                            await vscode.env.clipboard.writeText(note.htmlUrl);
                            vscode.window.showInformationMessage('Gist link copied to clipboard');
                        }
                    } catch {
                        vscode.window.showErrorMessage('Failed to copy link');
                    }
                }
                break;

            case 'notes.loadNote':
                if (msg.noteId && this._gistService) {
                    try {
                        const fullNote = await this._gistService.getNote(msg.noteId);
                        this._panel.webview.postMessage({
                            type: 'noteContent',
                            noteId: fullNote.id,
                            title: fullNote.title,
                            content: fullNote.content,
                        });
                    } catch (e: unknown) {
                        const m = e instanceof Error ? e.message : 'Unknown error';
                        this._panel.webview.postMessage({ type: 'notesError', message: m });
                    }
                }
                break;

            case 'notes.toggleVisibility':
                if (msg.noteId && this._gistService) {
                    const choice = await vscode.window.showWarningMessage(
                        'Toggling visibility deletes and re-creates the gist. The gist ID, comments, and stars will be lost. Continue?',
                        { modal: true },
                        'Toggle',
                        'Cancel',
                    );
                    if (choice !== 'Toggle') {
                        break;
                    }
                    try {
                        this._panel.webview.postMessage({ type: 'notesLoading' });
                        const toggled = await this._gistService.toggleVisibility(msg.noteId);
                        this._panel.webview.postMessage({
                            type: 'noteVisibilityChanged',
                            oldNoteId: msg.noteId,
                            note: GistService.toData(toggled),
                        });
                    } catch (e: unknown) {
                        const m = e instanceof Error ? e.message : 'Unknown error';
                        vscode.window.showErrorMessage(`Failed to toggle visibility: ${m}`);
                        this._panel.webview.postMessage({ type: 'notesError', message: m });
                    }
                }
                break;

            case 'notes.getTabSize': {
                const tabSize = vscode.workspace
                    .getConfiguration('editor')
                    .get<number>('tabSize', 4);
                this._panel.webview.postMessage({ type: 'tabSize', tabSize });
                break;
            }

            case 'notes.confirmDirtySwitch':
                if (msg.targetNoteId) {
                    const choice = await vscode.window.showWarningMessage(
                        'You have unsaved changes. Discard them?',
                        'Discard',
                        'Cancel',
                    );
                    this._panel.webview.postMessage({
                        type: 'confirmDirtySwitchResult',
                        confirmed: choice === 'Discard',
                        targetNoteId: msg.targetNoteId,
                    });
                }
                break;

            case 'notes.linkToRepo':
                if (msg.noteId && this._gistService) {
                    try {
                        const repoInfo = await this._getRepoInfo();
                        if (!repoInfo) {
                            vscode.window.showErrorMessage('No repository detected for this workspace.');
                            break;
                        }
                        const repoSlug = `${repoInfo.owner}/${repoInfo.repo}`;
                        const linked = await this._gistService.linkToRepo(msg.noteId, repoSlug);
                        this._panel.webview.postMessage({
                            type: 'noteLinked',
                            noteId: msg.noteId,
                            linkedRepo: linked.linkedRepo,
                        });
                        vscode.window.showInformationMessage(`Note linked to ${repoSlug}`);
                    } catch (e: unknown) {
                        const m = e instanceof Error ? e.message : 'Unknown error';
                        vscode.window.showErrorMessage(`Failed to link note: ${m}`);
                    }
                }
                break;

            case 'notes.unlinkFromRepo':
                if (msg.noteId && this._gistService) {
                    try {
                        const unlinked = await this._gistService.unlinkFromRepo(msg.noteId);
                        this._panel.webview.postMessage({
                            type: 'noteLinked',
                            noteId: msg.noteId,
                            linkedRepo: unlinked.linkedRepo,
                        });
                        vscode.window.showInformationMessage('Note unlinked from workspace');
                    } catch (e: unknown) {
                        const m = e instanceof Error ? e.message : 'Unknown error';
                        vscode.window.showErrorMessage(`Failed to unlink note: ${m}`);
                    }
                }
                break;

            // ─── PR messages from webview ───

            case 'prs.refresh':
                await this._refreshPRs();
                break;

            case 'prs.signIn':
                await vscode.commands.executeCommand('superprompt-forge.prs.signIn');
                await this._sendAuthStatus();
                await this._refreshPRs();
                break;

            case 'prs.filter':
                // State filter changed in webview — re-fetch with new filter
                if (msg.state) {
                    await this._refreshPRs(msg.state as 'open' | 'closed' | 'merged' | 'all');
                }
                break;

            case 'prs.getComments':
                if (msg.prNumber !== undefined) {
                    await this._sendPRComments(msg.prNumber);
                }
                break;

            case 'prs.createComment':
                if (msg.prNumber !== undefined && msg.body && this._prService) {
                    try {
                        const repoInfo = await this._getRepoInfo();
                        if (!repoInfo) {
                            break;
                        }
                        this._panel.webview.postMessage({ type: 'prCommentSaving' });
                        const comment = await this._prService.createComment(
                            repoInfo.owner,
                            repoInfo.repo,
                            msg.prNumber,
                            msg.body,
                        );
                        this._panel.webview.postMessage({
                            type: 'prCommentCreated',
                            comment: PrService.toCommentData(comment),
                        });
                    } catch (e: unknown) {
                        const m = e instanceof Error ? e.message : 'Unknown error';
                        vscode.window.showErrorMessage(`Failed to post comment: ${m}`);
                        this._panel.webview.postMessage({ type: 'prError', message: m });
                    }
                }
                break;

            case 'prs.replyToComment':
                if (msg.prNumber !== undefined && msg.commentId !== undefined && msg.body && this._prService) {
                    try {
                        const repoInfo = await this._getRepoInfo();
                        if (!repoInfo) {
                            break;
                        }
                        this._panel.webview.postMessage({ type: 'prCommentSaving' });
                        const reply = await this._prService.replyToReviewComment(
                            repoInfo.owner,
                            repoInfo.repo,
                            msg.prNumber,
                            msg.commentId,
                            msg.body,
                        );
                        // Inherit thread data from the parent comment
                        if (msg.threadId) {
                            reply.threadId = msg.threadId;
                            reply.isResolved = msg.isResolved ?? false;
                            reply.resolvedBy = msg.resolvedBy ?? null;
                        }
                        this._panel.webview.postMessage({
                            type: 'prCommentCreated',
                            comment: PrService.toCommentData(reply),
                        });
                    } catch (e: unknown) {
                        const m = e instanceof Error ? e.message : 'Unknown error';
                        vscode.window.showErrorMessage(`Failed to post reply: ${m}`);
                        this._panel.webview.postMessage({ type: 'prError', message: m });
                    }
                }
                break;

            case 'prs.resolveThread':
                if (msg.threadId && this._prService) {
                    try {
                        const result = await this._prService.resolveReviewThread(msg.threadId);
                        this._panel.webview.postMessage({
                            type: 'prThreadResolved',
                            threadId: msg.threadId,
                            isResolved: result.isResolved,
                            resolvedBy: result.resolvedBy,
                        });
                    } catch (e: unknown) {
                        const m = e instanceof Error ? e.message : 'Unknown error';
                        vscode.window.showErrorMessage(`Failed to resolve thread: ${m}`);
                        this._panel.webview.postMessage({ type: 'prError', message: m });
                    }
                }
                break;

            case 'prs.unresolveThread':
                if (msg.threadId && this._prService) {
                    try {
                        const result = await this._prService.unresolveReviewThread(msg.threadId);
                        this._panel.webview.postMessage({
                            type: 'prThreadResolved',
                            threadId: msg.threadId,
                            isResolved: result.isResolved,
                            resolvedBy: result.resolvedBy,
                        });
                    } catch (e: unknown) {
                        const m = e instanceof Error ? e.message : 'Unknown error';
                        vscode.window.showErrorMessage(`Failed to unresolve thread: ${m}`);
                        this._panel.webview.postMessage({ type: 'prError', message: m });
                    }
                }
                break;

            case 'prs.openInBrowser':
                if (msg.prNumber !== undefined) {
                    const repoInfo = await this._getRepoInfo();
                    if (repoInfo) {
                        const url = `https://github.com/${repoInfo.owner}/${repoInfo.repo}/pull/${msg.prNumber}`;
                        await vscode.env.openExternal(vscode.Uri.parse(url));
                    }
                }
                break;

            case 'prs.copyComment':
                if (msg.body) {
                    await vscode.env.clipboard.writeText(msg.body);
                    vscode.window.showInformationMessage('Comment copied to clipboard');
                }
                break;

            case 'prs.copyAllComments':
                if (msg.body) {
                    await vscode.env.clipboard.writeText(msg.body);
                    vscode.window.showInformationMessage('All comments copied to clipboard');
                }
                break;

            case 'prs.getCollaborators':
                if (this._prService) {
                    try {
                        const repoInfo = await this._getRepoInfo();
                        if (!repoInfo) { break; }
                        const collaborators = await this._prService.getCollaborators(
                            repoInfo.owner,
                            repoInfo.repo,
                        );
                        this._panel.webview.postMessage({
                            type: 'prCollaborators',
                            collaborators,
                        });
                    } catch (e: unknown) {
                        const m = e instanceof Error ? e.message : 'Unknown error';
                        vscode.window.showErrorMessage(`Failed to fetch collaborators: ${m}`);
                    }
                }
                break;

            case 'prs.requestReview':
                if (msg.prNumber !== undefined && msg.reviewers?.length && this._prService) {
                    try {
                        const repoInfo = await this._getRepoInfo();
                        if (!repoInfo) { break; }
                        this._panel.webview.postMessage({ type: 'prRequestingReview' });
                        const reviewers = await this._prService.requestReviewers(
                            repoInfo.owner,
                            repoInfo.repo,
                            msg.prNumber,
                            msg.reviewers,
                        );
                        this._panel.webview.postMessage({
                            type: 'prReviewRequested',
                            reviewers,
                        });
                        vscode.window.showInformationMessage(
                            `Review requested from ${msg.reviewers.join(', ')}`,
                        );
                    } catch (e: unknown) {
                        const m = e instanceof Error ? e.message : 'Unknown error';
                        vscode.window.showErrorMessage(`Failed to request review: ${m}`);
                        this._panel.webview.postMessage({ type: 'prError', message: m });
                    }
                }
                break;

            case 'prs.removeReviewRequest':
                if (msg.prNumber !== undefined && msg.reviewer && this._prService) {
                    try {
                        const repoInfo = await this._getRepoInfo();
                        if (!repoInfo) { break; }
                        await this._prService.removeReviewRequest(
                            repoInfo.owner,
                            repoInfo.repo,
                            msg.prNumber,
                            [msg.reviewer],
                        );
                        this._panel.webview.postMessage({
                            type: 'prReviewRequestRemoved',
                            reviewer: msg.reviewer,
                        });
                    } catch (e: unknown) {
                        const m = e instanceof Error ? e.message : 'Unknown error';
                        vscode.window.showErrorMessage(`Failed to remove review request: ${m}`);
                        this._panel.webview.postMessage({ type: 'prError', message: m });
                    }
                }
                break;

            // ─── Issue messages from webview ───

            case 'issues.refresh':
                await this._refreshIssues(msg.state as 'open' | 'closed' | 'all' | undefined);
                break;

            case 'issues.signIn':
                await vscode.commands.executeCommand('superprompt-forge.issues.signIn');
                await this._sendAuthStatus();
                await this._refreshIssues();
                break;

            case 'issues.filter':
                if (msg.state) {
                    await this._refreshIssues(msg.state as 'open' | 'closed' | 'all');
                }
                break;

            case 'issues.getComments':
                if (msg.issueNumber !== undefined) {
                    await this._sendIssueComments(msg.issueNumber);
                }
                break;

            case 'issues.createComment':
                if (msg.issueNumber !== undefined && msg.body && this._issueService) {
                    try {
                        const repoInfo = await this._getRepoInfo();
                        if (!repoInfo) { break; }
                        this._panel.webview.postMessage({ type: 'issueCommentSaving' });
                        const comment = await this._issueService.createComment(
                            repoInfo.owner,
                            repoInfo.repo,
                            msg.issueNumber,
                            msg.body,
                        );
                        this._panel.webview.postMessage({
                            type: 'issueCommentCreated',
                            comment: IssueService.toCommentData(comment),
                        });
                    } catch (e: unknown) {
                        const m = e instanceof Error ? e.message : 'Unknown error';
                        vscode.window.showErrorMessage(`Failed to post comment: ${m}`);
                        this._panel.webview.postMessage({ type: 'issueError', message: m });
                    }
                }
                break;

            case 'issues.close':
                if (msg.issueNumber !== undefined && this._issueService) {
                    try {
                        const repoInfo = await this._getRepoInfo();
                        if (!repoInfo) { break; }
                        const reason = (msg.stateReason === 'not_planned' ? 'not_planned' : 'completed') as 'completed' | 'not_planned';
                        const updated = await this._issueService.closeIssue(
                            repoInfo.owner,
                            repoInfo.repo,
                            msg.issueNumber,
                            reason,
                        );
                        this._panel.webview.postMessage({
                            type: 'issueStateChanged',
                            issueNumber: msg.issueNumber,
                            state: updated.state,
                        });
                        vscode.window.showInformationMessage(`Closed issue #${msg.issueNumber}`);
                    } catch (e: unknown) {
                        const m = e instanceof Error ? e.message : 'Unknown error';
                        vscode.window.showErrorMessage(`Failed to close issue: ${m}`);
                        this._panel.webview.postMessage({ type: 'issueError', message: m });
                    }
                }
                break;

            case 'issues.reopen':
                if (msg.issueNumber !== undefined && this._issueService) {
                    try {
                        const repoInfo = await this._getRepoInfo();
                        if (!repoInfo) { break; }
                        const updated = await this._issueService.reopenIssue(
                            repoInfo.owner,
                            repoInfo.repo,
                            msg.issueNumber,
                        );
                        this._panel.webview.postMessage({
                            type: 'issueStateChanged',
                            issueNumber: msg.issueNumber,
                            state: updated.state,
                        });
                        vscode.window.showInformationMessage(`Reopened issue #${msg.issueNumber}`);
                    } catch (e: unknown) {
                        const m = e instanceof Error ? e.message : 'Unknown error';
                        vscode.window.showErrorMessage(`Failed to reopen issue: ${m}`);
                        this._panel.webview.postMessage({ type: 'issueError', message: m });
                    }
                }
                break;

            case 'issues.openInBrowser':
                if (msg.issueNumber !== undefined) {
                    const repoInfo = await this._getRepoInfo();
                    if (repoInfo) {
                        const url = `https://github.com/${repoInfo.owner}/${repoInfo.repo}/issues/${msg.issueNumber}`;
                        await vscode.env.openExternal(vscode.Uri.parse(url));
                    }
                }
                break;

            case 'issues.copyComment':
                if (msg.body) {
                    await vscode.env.clipboard.writeText(msg.body);
                    vscode.window.showInformationMessage('Comment copied to clipboard');
                }
                break;

            // ─── Project Message Handlers ──────────────────────────

            case 'projects.refresh':
                await this._refreshProjects();
                break;

            case 'projects.signIn':
                if (this._authService) {
                    await this._authService.signIn();
                    await this._refreshProjects();
                }
                break;

            case 'projects.selectProject':
                if (this._projectService && msg.projectId) {
                    try {
                        this._panel.webview.postMessage({ type: 'projectsItemsLoading' });
                        const project = await this._projectService.getProjectById(msg.projectId as string);
                        const projectData = ProjectService.toData(project);
                        this._panel.webview.postMessage({ type: 'projectData', payload: projectData });
                        const result = await this._projectService.listProjectItems(project.id);
                        const items = result.items.map((i) => ProjectService.toItemData(i));
                        this._panel.webview.postMessage({ type: 'projectItemsData', payload: items });
                    } catch (e: unknown) {
                        const m = e instanceof Error ? e.message : 'Unknown error';
                        vscode.window.showErrorMessage(`Failed to load project: ${m}`);
                        this._panel.webview.postMessage({ type: 'projectError', message: m });
                    }
                }
                break;

            case 'projects.updateField':
                if (this._projectService && msg.projectId && msg.itemId && msg.fieldId && msg.value) {
                    try {
                        this._panel.webview.postMessage({ type: 'projectFieldUpdating' });
                        await this._projectService.updateFieldValue(
                            msg.projectId as string,
                            msg.itemId as string,
                            msg.fieldId as string,
                            msg.value as Record<string, unknown>,
                        );
                        this._panel.webview.postMessage({ type: 'projectFieldUpdated' });
                        // Refresh items to get updated values
                        await this._refreshProjectItems(msg.projectId as string);
                    } catch (e: unknown) {
                        const m = e instanceof Error ? e.message : 'Unknown error';
                        vscode.window.showErrorMessage(`Failed to update field: ${m}`);
                        this._panel.webview.postMessage({ type: 'projectError', message: m });
                    }
                }
                break;

            case 'projects.deleteItem':
                if (this._projectService && msg.projectId && msg.itemId) {
                    try {
                        await this._projectService.deleteItem(
                            msg.projectId as string,
                            msg.itemId as string,
                        );
                        this._panel.webview.postMessage({
                            type: 'projectItemDeleted',
                            itemId: msg.itemId,
                        });
                        vscode.window.showInformationMessage('Item removed from project');
                    } catch (e: unknown) {
                        const m = e instanceof Error ? e.message : 'Unknown error';
                        vscode.window.showErrorMessage(`Failed to delete item: ${m}`);
                        this._panel.webview.postMessage({ type: 'projectError', message: m });
                    }
                }
                break;

            case 'projects.addDraftIssue':
                if (this._projectService && msg.projectId && msg.title) {
                    try {
                        const newItemId = await this._projectService.addDraftIssue(
                            msg.projectId as string,
                            msg.title as string,
                            msg.body as string | undefined,
                        );
                        vscode.window.showInformationMessage('Draft issue added to project');
                        // Refresh items to include the new item
                        await this._refreshProjectItems(msg.projectId as string);
                    } catch (e: unknown) {
                        const m = e instanceof Error ? e.message : 'Unknown error';
                        vscode.window.showErrorMessage(`Failed to add draft issue: ${m}`);
                        this._panel.webview.postMessage({ type: 'projectError', message: m });
                    }
                }
                break;

            case 'projects.addExistingItem':
                if (this._projectService && msg.projectId && msg.contentId) {
                    try {
                        await this._projectService.addItemToProject(
                            msg.projectId as string,
                            msg.contentId as string,
                        );
                        vscode.window.showInformationMessage('Item added to project');
                        await this._refreshProjectItems(msg.projectId as string);
                    } catch (e: unknown) {
                        const m = e instanceof Error ? e.message : 'Unknown error';
                        vscode.window.showErrorMessage(`Failed to add item: ${m}`);
                        this._panel.webview.postMessage({ type: 'projectError', message: m });
                    }
                }
                break;

            case 'projects.openInBrowser':
                if (msg.url) {
                    vscode.env.openExternal(vscode.Uri.parse(msg.url as string));
                }
                break;

            // ─── Mattermost Message Handlers ──────────────────────

            case 'mattermost.refresh':
                await this._refreshMattermost();
                break;

            case 'mattermost.signIn': {
                if (!this._mattermostService) { break; }
                const signedIn = await this._mattermostService.signIn();
                if (signedIn) {
                    await this._refreshMattermost();
                }
                break;
            }

            case 'mattermost.signInWithPassword': {
                if (!this._mattermostService) { break; }
                const pwSuccess = await this._mattermostService.signInWithPassword();
                if (pwSuccess) {
                    await this._refreshMattermost();
                }
                break;
            }

            case 'mattermost.signInWithToken': {
                if (!this._mattermostService) { break; }
                const tokenSuccess = await this._mattermostService.signInWithToken();
                if (tokenSuccess) {
                    await this._refreshMattermost();
                }
                break;
            }

            case 'mattermost.signInWithSessionToken': {
                if (!this._mattermostService) { break; }
                const sessionSuccess = await this._mattermostService.signInWithSessionToken();
                if (sessionSuccess) {
                    await this._refreshMattermost();
                }
                break;
            }

            case 'mattermost.signOut': {
                if (!this._mattermostService) { break; }
                // Disconnect WebSocket before signing out
                if (this._mmWebSocket) {
                    this._mmWebSocket.disconnect();
                    this._mmWebSocket.dispose();
                    this._mmWebSocket = undefined;
                }
                await this._mattermostService.signOut();
                this._panel.webview.postMessage({ type: 'mattermostConfigured', configured: false });
                this._panel.webview.postMessage({ type: 'mattermostConnectionStatus', connected: false });
                break;
            }

            case 'mattermost.getChannels': {
                if (!this._mattermostService || !msg.teamId) { break; }
                try {
                    const page = msg.page ?? 0;
                    if (page === 0) {
                        this._panel.webview.postMessage({ type: 'mattermostChannelsLoading' });
                    }
                    // Use getAllMyChannels with pagination to handle large servers
                    const { channels, dmChannels, groupChannels, hasMore } =
                        await this._mattermostService.getAllMyChannels(msg.teamId, page, 100);
                    const channelsPayload = channels.map((c) => MattermostService.toChannelData(c));
                    this._panel.webview.postMessage({
                        type: page === 0 ? 'mattermostChannels' : 'mattermostChannelsAppend',
                        payload: channelsPayload,
                        hasMoreChannels: hasMore,
                    });

                    // Also send DM channels
                    const me = await this._mattermostService.getMe();
                    const dmPayload = await this._resolveDmChannelPayloads(
                        [...dmChannels, ...groupChannels],
                        me.id,
                    );
                    this._panel.webview.postMessage({
                        type: page === 0 ? 'mattermostDmChannels' : 'mattermostDmChannelsAppend',
                        payload: dmPayload,
                    });

                    // Auto-fetch next page if there are more channels
                    if (hasMore) {
                        await this._handleMessage({
                            type: 'mattermost.getChannels',
                            teamId: msg.teamId,
                            page: page + 1,
                        });
                    } else if (page === 0) {
                        // Fetch custom emoji list on first page load (fire-and-forget)
                        this._mattermostService.getCustomEmojis().then((customEmojis) => {
                            this._panel.webview.postMessage({ type: 'mattermostCustomEmojis', payload: customEmojis });
                        }).catch(() => { /* non-critical — custom emojis just won't render */ });
                    }
                } catch (e: unknown) {
                    const m = e instanceof Error ? e.message : 'Unknown error';
                    this._panel.webview.postMessage({ type: 'mattermostError', message: m });
                }
                break;
            }

            case 'mattermost.getPosts': {
                if (!this._mattermostService || !msg.channelId) { break; }
                try {
                    const page = msg.page ?? 0;
                    this._panel.webview.postMessage({ type: 'mattermostPostsLoading' });
                    const posts = await this._mattermostService.getChannelPosts(msg.channelId, page);
                    const usernames = await this._mattermostService.resolveUsernames(posts);

                    // Resolve file attachments inline before sending posts
                    const payload = await Promise.all(posts.map(async (p) => {
                        let files: import('./mattermostService').MattermostFileInfoData[] | undefined;
                        if (p.fileIds.length > 0) {
                            try {
                                files = await this._mattermostService!.resolveFileInfos(p.fileIds);
                            } catch { /* ignore file resolution errors */ }
                        }
                        return MattermostService.toPostData(p, usernames.get(p.userId) ?? p.userId, files);
                    }));
                    this._panel.webview.postMessage({
                        type: page > 0 ? 'mattermostOlderPosts' : 'mattermostPosts',
                        payload,
                        hasMore: posts.length === 30,
                    });

                    // Fetch reactions and user statuses for the loaded posts (non-blocking)
                    const postIds = posts.map((p) => p.id);
                    const uniqueUserIds = [...new Set(posts.map((p) => p.userId))];
                    if (postIds.length > 0) {
                        this._mattermostService.getBulkReactions(postIds).then((reactionsMap) => {
                            const allReactions: Array<{ userId: string; postId: string; emojiName: string; username: string }> = [];
                            for (const [pid, reactions] of reactionsMap) {
                                for (const r of reactions) {
                                    allReactions.push({
                                        userId: r.userId,
                                        postId: pid,
                                        emojiName: r.emojiName,
                                        username: usernames.get(r.userId) ?? r.userId,
                                    });
                                }
                            }
                            if (allReactions.length > 0) {
                                this._panel.webview.postMessage({ type: 'mattermostBulkReactions', payload: allReactions });
                            }
                        }).catch(() => { /* ignore reaction fetch errors */ });
                    }
                    if (uniqueUserIds.length > 0) {
                        this._mattermostService.getUserStatuses(uniqueUserIds).then((statuses) => {
                            const statusPayload = statuses.map((s) => MattermostService.toUserStatusData(s));
                            this._panel.webview.postMessage({ type: 'mattermostUserStatuses', payload: statusPayload });
                        }).catch(() => { /* ignore status fetch errors */ });

                        // Fetch user avatars in background
                        this._mattermostService.getUserProfileImages(uniqueUserIds).then((avatars) => {
                            if (Object.keys(avatars).length > 0) {
                                this._panel.webview.postMessage({ type: 'mattermostUserAvatars', payload: avatars });
                            }
                        }).catch(() => { /* ignore avatar fetch errors */ });
                    }
                } catch (e: unknown) {
                    const m = e instanceof Error ? e.message : 'Unknown error';
                    this._panel.webview.postMessage({ type: 'mattermostError', message: m });
                }
                break;
            }

            case 'mattermost.sendPost': {
                if (!this._mattermostService || !msg.channelId || !msg.message) { break; }
                const pendingId = msg.pendingId;
                try {
                    const post = await this._mattermostService.createPost(msg.channelId, msg.message, msg.rootId, msg.fileIds);
                    const username = await this._mattermostService.resolveUsername(post.userId);
                    let files: import('./mattermostService').MattermostFileInfoData[] | undefined;
                    if (post.fileIds.length > 0) {
                        try {
                            files = await this._mattermostService!.resolveFileInfos(post.fileIds);
                        } catch { /* ignore */ }
                    }
                    const postData = MattermostService.toPostData(post, username, files);
                    if (pendingId) {
                        this._panel.webview.postMessage({ type: 'mattermostPostConfirmed', pendingId, post: postData });
                    } else {
                        this._panel.webview.postMessage({ type: 'mattermostPostCreated', post: postData });
                    }
                } catch (e: unknown) {
                    const m = e instanceof Error ? e.message : 'Unknown error';
                    if (pendingId) {
                        this._panel.webview.postMessage({ type: 'mattermostPostFailed', pendingId, error: m });
                    } else {
                        this._panel.webview.postMessage({ type: 'mattermostError', message: m });
                    }
                }
                break;
            }

            case 'mattermost.openInBrowser': {
                if (!this._mattermostService || !msg.channelId) { break; }
                const serverUrl = await this._mattermostService.getServerUrl();
                if (serverUrl) {
                    // Mattermost channel URLs follow pattern: /teamname/channels/channelname
                    // For simplicity, open the server root
                    await vscode.env.openExternal(vscode.Uri.parse(serverUrl));
                }
                break;
            }

            case 'mattermostOpenExternal': {
                if (msg.url && typeof msg.url === 'string') {
                    await vscode.env.openExternal(vscode.Uri.parse(msg.url));
                }
                break;
            }

            // ─── Mattermost Thread Handlers ───────────────────────────

            case 'mattermost.getThread': {
                if (!this._mattermostService || !msg.postId) { break; }
                try {
                    this._panel.webview.postMessage({ type: 'mattermostThreadLoading', postId: msg.postId });
                    const posts = await this._mattermostService.getPostThread(msg.postId);
                    const usernames = await this._mattermostService.resolveUsernames(posts);
                    const payload = await Promise.all(posts.map(async (p) => {
                        let files: import('./mattermostService').MattermostFileInfoData[] | undefined;
                        if (p.fileIds.length > 0) {
                            try {
                                files = await this._mattermostService!.resolveFileInfos(p.fileIds);
                            } catch { /* ignore */ }
                        }
                        return MattermostService.toPostData(p, usernames.get(p.userId) ?? p.userId, files);
                    }));
                    this._panel.webview.postMessage({
                        type: 'mattermostThread',
                        rootId: msg.postId,
                        payload,
                    });
                } catch (e: unknown) {
                    const m = e instanceof Error ? e.message : 'Unknown error';
                    this._panel.webview.postMessage({ type: 'mattermostError', message: m });
                }
                break;
            }

            case 'mattermost.sendReply': {
                if (!this._mattermostService || !msg.channelId || !msg.message || !msg.rootId) { break; }
                try {
                    this._panel.webview.postMessage({ type: 'mattermostSendingPost' });
                    const post = await this._mattermostService.createPost(msg.channelId, msg.message, msg.rootId, msg.fileIds);
                    const username = await this._mattermostService.resolveUsername(post.userId);
                    let files: import('./mattermostService').MattermostFileInfoData[] | undefined;
                    if (post.fileIds.length > 0) {
                        try {
                            files = await this._mattermostService!.resolveFileInfos(post.fileIds);
                        } catch { /* ignore */ }
                    }
                    const postData = MattermostService.toPostData(post, username, files);
                    this._panel.webview.postMessage({ type: 'mattermostPostCreated', post: postData });
                } catch (e: unknown) {
                    const m = e instanceof Error ? e.message : 'Unknown error';
                    this._panel.webview.postMessage({ type: 'mattermostError', message: m });
                }
                break;
            }

            // ─── Mattermost Reaction Handlers ─────────────────────────

            case 'mattermost.addReaction': {
                if (!this._mattermostService || !msg.postId || !msg.emojiName) { break; }
                try {
                    await this._mattermostService.addReaction(msg.postId, msg.emojiName);
                    // WebSocket will relay the reaction_added event
                } catch (e: unknown) {
                    const m = e instanceof Error ? e.message : 'Unknown error';
                    this._panel.webview.postMessage({ type: 'mattermostError', message: m });
                }
                break;
            }

            case 'mattermost.removeReaction': {
                if (!this._mattermostService || !msg.postId || !msg.emojiName) { break; }
                try {
                    await this._mattermostService.removeReaction(msg.postId, msg.emojiName);
                    // WebSocket will relay the reaction_removed event
                } catch (e: unknown) {
                    const m = e instanceof Error ? e.message : 'Unknown error';
                    this._panel.webview.postMessage({ type: 'mattermostError', message: m });
                }
                break;
            }

            case 'mattermost.getReactions': {
                if (!this._mattermostService || !msg.postId) { break; }
                try {
                    const reactions = await this._mattermostService.getPostReactions(msg.postId);
                    const userIds = [...new Set(reactions.map((r) => r.userId))];
                    const usernames = new Map<string, string>();
                    for (const uid of userIds) {
                        usernames.set(uid, await this._mattermostService.resolveUsername(uid));
                    }
                    const payload = reactions.map((r) =>
                        MattermostService.toReactionData(r, usernames.get(r.userId) ?? r.userId),
                    );
                    this._panel.webview.postMessage({
                        type: 'mattermostReactions',
                        postId: msg.postId,
                        payload,
                    });
                } catch (e: unknown) {
                    const m = e instanceof Error ? e.message : 'Unknown error';
                    this._panel.webview.postMessage({ type: 'mattermostError', message: m });
                }
                break;
            }

            // ─── Mattermost DM Handlers ───────────────────────────────

            case 'mattermost.createDM': {
                if (!this._mattermostService || !msg.targetUserId) { break; }
                try {
                    const channel = await this._mattermostService.createDirectChannel(msg.targetUserId);
                    const channelData = MattermostService.toChannelData(channel);
                    this._panel.webview.postMessage({ type: 'mattermostDmCreated', channel: channelData });
                } catch (e: unknown) {
                    const m = e instanceof Error ? e.message : 'Unknown error';
                    this._panel.webview.postMessage({ type: 'mattermostError', message: m });
                }
                break;
            }

            case 'mattermost.createGroupDM': {
                if (!this._mattermostService || !msg.userIds || msg.userIds.length === 0) { break; }
                try {
                    const channel = await this._mattermostService.createGroupChannel(msg.userIds);
                    const channelData = MattermostService.toChannelData(channel);
                    this._panel.webview.postMessage({ type: 'mattermostDmCreated', channel: channelData });
                } catch (e: unknown) {
                    const m = e instanceof Error ? e.message : 'Unknown error';
                    this._panel.webview.postMessage({ type: 'mattermostError', message: m });
                }
                break;
            }

            case 'mattermost.searchUsers': {
                if (!this._mattermostService || !msg.term) { break; }
                try {
                    const users = await this._mattermostService.searchUsers(msg.term);
                    const payload = users.map((u) => MattermostService.toUserData(u));
                    this._panel.webview.postMessage({ type: 'mattermostUserSearchResults', payload });
                } catch (e: unknown) {
                    const m = e instanceof Error ? e.message : 'Unknown error';
                    this._panel.webview.postMessage({ type: 'mattermostError', message: m });
                }
                break;
            }

            // ─── Mattermost Channel & Status Handlers ─────────────────

            case 'mattermost.getAllChannels': {
                if (!this._mattermostService || !msg.teamId) { break; }
                try {
                    this._panel.webview.postMessage({ type: 'mattermostChannelsLoading' });
                    const { channels, dmChannels, groupChannels } = await this._mattermostService.getAllMyChannels(msg.teamId);
                    const channelsPayload = channels.map((c) => MattermostService.toChannelData(c));

                    // Resolve DM display names and other-user IDs
                    const me = await this._mattermostService.getMe();
                    const dmPayload = await this._resolveDmChannelPayloads(
                        [...dmChannels, ...groupChannels],
                        me.id,
                    );
                    this._panel.webview.postMessage({ type: 'mattermostChannels', payload: channelsPayload });
                    this._panel.webview.postMessage({ type: 'mattermostDmChannels', payload: dmPayload });

                    // Fetch bulk unreads for all channels (non-blocking)
                    const allChannelIds = [
                        ...channels.map((c) => c.id),
                        ...dmChannels.map((c) => c.id),
                        ...groupChannels.map((c) => c.id),
                    ];
                    this._fetchBulkUnreads(allChannelIds).catch(() => { /* ignore */ });
                } catch (e: unknown) {
                    const m = e instanceof Error ? e.message : 'Unknown error';
                    this._panel.webview.postMessage({ type: 'mattermostError', message: m });
                }
                break;
            }

            case 'mattermost.getUserStatuses': {
                if (!this._mattermostService || !msg.userIds || msg.userIds.length === 0) { break; }
                try {
                    const statuses = await this._mattermostService.getUserStatuses(msg.userIds);
                    const payload = statuses.map((s) => MattermostService.toUserStatusData(s));
                    this._panel.webview.postMessage({ type: 'mattermostUserStatuses', payload });
                } catch (e: unknown) {
                    const m = e instanceof Error ? e.message : 'Unknown error';
                    this._panel.webview.postMessage({ type: 'mattermostError', message: m });
                }
                break;
            }

            case 'mattermost.getUnread': {
                if (!this._mattermostService || !msg.channelId) { break; }
                try {
                    const unread = await this._mattermostService.getChannelUnread(msg.channelId);
                    this._panel.webview.postMessage({
                        type: 'mattermostUnread',
                        payload: MattermostService.toChannelUnreadData(unread),
                    });
                } catch (e: unknown) {
                    const m = e instanceof Error ? e.message : 'Unknown error';
                    this._panel.webview.postMessage({ type: 'mattermostError', message: m });
                }
                break;
            }

            case 'mattermost.markRead': {
                if (!this._mattermostService || !msg.channelId) { break; }
                try {
                    await this._mattermostService.markChannelAsRead(msg.channelId);
                    this._panel.webview.postMessage({
                        type: 'mattermostMarkedRead',
                        channelId: msg.channelId,
                    });
                } catch (e: unknown) {
                    const m = e instanceof Error ? e.message : 'Unknown error';
                    this._panel.webview.postMessage({ type: 'mattermostError', message: m });
                }
                break;
            }

            // ─── Mattermost Edit / Delete / Pin ───────────────────────

            case 'mattermost.editPost': {
                if (!this._mattermostService || !msg.postId || typeof msg.message !== 'string') { break; }
                try {
                    const post = await this._mattermostService.editPost(msg.postId, msg.message);
                    const username = await this._mattermostService.resolveUsername(post.userId);
                    const postData = MattermostService.toPostData(post, username);
                    this._panel.webview.postMessage({ type: 'mattermostPostEdited', post: postData });
                } catch (e: unknown) {
                    const m = e instanceof Error ? e.message : 'Unknown error';
                    this._panel.webview.postMessage({ type: 'mattermostError', message: m });
                }
                break;
            }

            case 'mattermost.deletePost': {
                if (!this._mattermostService || !msg.postId) { break; }
                try {
                    await this._mattermostService.deletePost(msg.postId);
                    this._panel.webview.postMessage({ type: 'mattermostPostDeleted', postId: msg.postId });
                } catch (e: unknown) {
                    const m = e instanceof Error ? e.message : 'Unknown error';
                    this._panel.webview.postMessage({ type: 'mattermostError', message: m });
                }
                break;
            }

            case 'mattermost.pinPost': {
                if (!this._mattermostService || !msg.postId) { break; }
                try {
                    await this._mattermostService.pinPost(msg.postId);
                    this._panel.webview.postMessage({
                        type: 'mattermostPostPinToggled',
                        postId: msg.postId,
                        isPinned: true,
                    });
                } catch (e: unknown) {
                    const m = e instanceof Error ? e.message : 'Unknown error';
                    this._panel.webview.postMessage({ type: 'mattermostError', message: m });
                }
                break;
            }

            case 'mattermost.unpinPost': {
                if (!this._mattermostService || !msg.postId) { break; }
                try {
                    await this._mattermostService.unpinPost(msg.postId);
                    this._panel.webview.postMessage({
                        type: 'mattermostPostPinToggled',
                        postId: msg.postId,
                        isPinned: false,
                    });
                } catch (e: unknown) {
                    const m = e instanceof Error ? e.message : 'Unknown error';
                    this._panel.webview.postMessage({ type: 'mattermostError', message: m });
                }
                break;
            }

            // ─── Mattermost Search ────────────────────────────────────

            case 'mattermost.searchPosts': {
                if (!this._mattermostService || !msg.terms || !msg.teamId) { break; }
                try {
                    this._panel.webview.postMessage({ type: 'mattermostSearchLoading' });
                    const posts = await this._mattermostService.searchPosts(msg.teamId, msg.terms);
                    const usernames = await this._mattermostService.resolveUsernames(posts);
                    const payload = await Promise.all(posts.map(async (p) => {
                        let files: import('./mattermostService').MattermostFileInfoData[] | undefined;
                        if (p.fileIds.length > 0) {
                            try {
                                files = await this._mattermostService!.resolveFileInfos(p.fileIds);
                            } catch { /* ignore */ }
                        }
                        return MattermostService.toPostData(p, usernames.get(p.userId) ?? p.userId, files);
                    }));
                    this._panel.webview.postMessage({ type: 'mattermostSearchResults', payload });
                } catch (e: unknown) {
                    const m = e instanceof Error ? e.message : 'Unknown error';
                    this._panel.webview.postMessage({ type: 'mattermostError', message: m });
                }
                break;
            }

            // ─── Mattermost Flagged/Saved Posts ───────────────────────

            case 'mattermost.getFlaggedPosts': {
                if (!this._mattermostService) { break; }
                try {
                    const posts = await this._mattermostService.getFlaggedPosts(msg.teamId);
                    this._panel.webview.postMessage({
                        type: 'mattermostFlaggedPostIds',
                        payload: posts.map((p) => p.id),
                    });
                } catch (e: unknown) {
                    const m = e instanceof Error ? e.message : 'Unknown error';
                    this._panel.webview.postMessage({ type: 'mattermostError', message: m });
                }
                break;
            }

            case 'mattermost.flagPost': {
                if (!this._mattermostService || !msg.postId) { break; }
                try {
                    await this._mattermostService.flagPost(msg.postId);
                    this._panel.webview.postMessage({
                        type: 'mattermostPostFlagged',
                        postId: msg.postId,
                        flagged: true,
                    });
                } catch (e: unknown) {
                    const m = e instanceof Error ? e.message : 'Unknown error';
                    this._panel.webview.postMessage({ type: 'mattermostError', message: m });
                }
                break;
            }

            case 'mattermost.unflagPost': {
                if (!this._mattermostService || !msg.postId) { break; }
                try {
                    await this._mattermostService.unflagPost(msg.postId);
                    this._panel.webview.postMessage({
                        type: 'mattermostPostFlagged',
                        postId: msg.postId,
                        flagged: false,
                    });
                } catch (e: unknown) {
                    const m = e instanceof Error ? e.message : 'Unknown error';
                    this._panel.webview.postMessage({ type: 'mattermostError', message: m });
                }
                break;
            }

            // ─── Mattermost User Status (set own) ────────────────────

            case 'mattermost.setOwnStatus': {
                if (!this._mattermostService || !msg.status) { break; }
                try {
                    await this._mattermostService.setOwnStatus(msg.status as 'online' | 'away' | 'offline' | 'dnd', msg.dndEndTime);
                    // WebSocket will relay the status_change event
                } catch (e: unknown) {
                    const m = e instanceof Error ? e.message : 'Unknown error';
                    this._panel.webview.postMessage({ type: 'mattermostError', message: m });
                }
                break;
            }

            // ─── Mattermost User Profile ──────────────────────────────

            case 'mattermost.getUserProfile': {
                if (!this._mattermostService || !msg.userId) { break; }
                try {
                    const user = await this._mattermostService.getUserProfile(msg.userId);
                    const userData = MattermostService.toUserData(user);
                    let avatarUrl: string | undefined;
                    try {
                        avatarUrl = await this._mattermostService.getUserProfileImage(msg.userId);
                    } catch { /* ignore — avatar is optional */ }
                    this._panel.webview.postMessage({
                        type: 'mattermostUserProfile',
                        user: userData,
                        avatarUrl,
                    });
                } catch (e: unknown) {
                    const m = e instanceof Error ? e.message : 'Unknown error';
                    this._panel.webview.postMessage({ type: 'mattermostError', message: m });
                }
                break;
            }

            // ─── Mattermost Channel Info ──────────────────────────────

            case 'mattermost.getChannelInfo': {
                if (!this._mattermostService || !msg.channelId) { break; }
                try {
                    const channel = await this._mattermostService.getChannel(msg.channelId);
                    this._panel.webview.postMessage({
                        type: 'mattermostChannelInfo',
                        payload: MattermostService.toChannelData(channel),
                    });
                } catch (e: unknown) {
                    const m = e instanceof Error ? e.message : 'Unknown error';
                    this._panel.webview.postMessage({ type: 'mattermostError', message: m });
                }
                break;
            }

            // ─── Mattermost File Upload ───────────────────────────────

            case 'mattermost.uploadFiles': {
                if (!this._mattermostService || !msg.channelId) { break; }
                try {
                    const uris = await vscode.window.showOpenDialog({
                        canSelectMany: true,
                        openLabel: 'Upload',
                        title: 'Select files to upload to Mattermost',
                    });
                    if (!uris || uris.length === 0) {
                        // User cancelled — no-op
                        break;
                    }

                    this._panel.webview.postMessage({ type: 'mattermostFileUploading', count: uris.length });

                    const fileBuffers: { name: string; data: Buffer; mimeType: string }[] = [];
                    for (const uri of uris) {
                        const data = Buffer.from(await vscode.workspace.fs.readFile(uri));
                        const name = uri.path.split('/').pop() ?? 'file';
                        // Infer mime type from extension
                        const ext = name.split('.').pop()?.toLowerCase() ?? '';
                        const mimeMap: Record<string, string> = {
                            png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
                            gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
                            pdf: 'application/pdf', zip: 'application/zip',
                            txt: 'text/plain', md: 'text/markdown',
                            json: 'application/json', xml: 'application/xml',
                            csv: 'text/csv', html: 'text/html',
                            js: 'application/javascript', ts: 'text/typescript',
                            py: 'text/x-python', go: 'text/x-go',
                            rs: 'text/x-rust', java: 'text/x-java',
                            mp4: 'video/mp4', mp3: 'audio/mpeg',
                        };
                        const mimeType = mimeMap[ext] ?? 'application/octet-stream';
                        fileBuffers.push({ name, data, mimeType });
                    }

                    const fileInfos = await this._mattermostService.uploadFiles(msg.channelId, fileBuffers);
                    const fileIds = fileInfos.map((f) => f.id);
                    const fileInfoDatas = await this._mattermostService.resolveFileInfos(fileIds);

                    this._panel.webview.postMessage({
                        type: 'mattermostFilesUploaded',
                        fileIds,
                        files: fileInfoDatas,
                    });
                } catch (e: unknown) {
                    const m = e instanceof Error ? e.message : 'Unknown error';
                    this._panel.webview.postMessage({ type: 'mattermostError', message: m });
                    this._panel.webview.postMessage({ type: 'mattermostFileUploadFailed' });
                }
                break;
            }

            // ─── Mattermost Emoji Handlers ────────────────────────────

            case 'mattermost.emojiAutocomplete': {
                if (!this._mattermostService || !msg.term) { break; }
                try {
                    const emojis = await this._mattermostService.getEmojiAutocomplete(msg.term);
                    const payload: Array<{ id: string; name: string; isCustom: boolean; imageUrl?: string }> = [];
                    for (const e of emojis) {
                        const isCustom = e.creatorId !== '';
                        let imageUrl: string | undefined;
                        if (isCustom) {
                            imageUrl = await this._mattermostService.getCustomEmojiImageUrl(e.id);
                        }
                        payload.push({ id: e.id, name: e.name, isCustom, imageUrl });
                    }
                    this._panel.webview.postMessage({ type: 'mattermostEmojiAutocomplete', payload });
                } catch (e: unknown) {
                    const m = e instanceof Error ? e.message : 'Unknown error';
                    this._panel.webview.postMessage({ type: 'mattermostError', message: m });
                }
                break;
            }

            // ─── Mattermost Typing Indicator ──────────────────────────

            case 'mattermost.sendTyping': {
                // Send a typing indicator via WebSocket (not REST)
                if (this._mmWebSocket?.isConnected && msg.channelId) {
                    this._mmWebSocket.sendTyping(msg.channelId, msg.rootId);
                }
                break;
            }

            // ─── AI Model Management ─────────────────────────────────

            case 'ai.listModels': {
                if (!AiService.isAvailable()) {
                    this._panel.webview.postMessage({ type: 'aiModelList', models: [], assignments: {} });
                    break;
                }
                try {
                    const models = await this._aiService.listModels();
                    const assignments = this._aiService.getModelAssignments();
                    this._panel.webview.postMessage({
                        type: 'aiModelList',
                        models,
                        assignments,
                    });
                } catch (e: unknown) {
                    this._outputChannel.appendLine(
                        `[AI] Failed to list models: ${e instanceof Error ? e.message : e}`,
                    );
                }
                break;
            }

            case 'ai.setModel': {
                if (!AiService.isAvailable()) { break; }
                const purpose = msg.purpose as string | undefined;
                const modelId = msg.modelId as string | undefined;
                if (purpose) {
                    this._aiService.setModel(
                        purpose as import('./aiService').AiModelPurpose,
                        modelId ?? '',
                    );
                    // Send back updated assignments
                    const models = await this._aiService.listModels();
                    const assignments = this._aiService.getModelAssignments();
                    this._panel.webview.postMessage({
                        type: 'aiModelList',
                        models,
                        assignments,
                    });
                }
                break;
            }

            // ─── AI Summarize & Chat ──────────────────────────────────

            case 'ai.summarize': {
                if (!AiService.isAvailable()) {
                    this._panel.webview.postMessage({ type: 'aiSummaryError', tabKey: msg.tabKey, error: 'AI features require GitHub Copilot' });
                    break;
                }
                if (!msg.tabKey) {
                    break;
                }
                const tabKey = msg.tabKey;
                const customPrompt = msg.customPrompt as string | undefined;
                try {
                    const contextData = await this._gatherContext(tabKey);
                    this._outputChannel.appendLine(`[AI] Summarize ${tabKey} — context length: ${contextData.length} chars${customPrompt ? ' (custom prompt)' : ''}`);
                    const result = await this._aiService.summarize(tabKey, contextData, customPrompt);
                    this._panel.webview.postMessage({
                        type: 'aiSummaryResult',
                        tabKey,
                        content: result,
                    });
                } catch (e: unknown) {
                    const m = e instanceof Error ? e.message : 'AI error';
                    this._panel.webview.postMessage({
                        type: 'aiSummaryError',
                        tabKey,
                        error: m,
                    });
                }
                break;
            }

            case 'ai.chat': {
                if (!AiService.isAvailable()) {
                    this._panel.webview.postMessage({ type: 'aiChatError', messageId: '', error: 'AI features require GitHub Copilot' });
                    break;
                }
                if (!msg.question) {
                    break;
                }
                const question = msg.question;
                const history = msg.history ?? [];
                const webSearch = msg.webSearch === true;
                const assistantMsgId = `assist_${Date.now()}`;

                try {
                    // Gather context from all tabs
                    const contextData = await this._gatherContext();
                    this._outputChannel.appendLine(`[AI] Chat — context length: ${contextData.length} chars, history: ${history.length} msgs, webSearch: ${webSearch}`);
                    if (contextData.length < 50) {
                        this._outputChannel.appendLine(`[AI] Warning: context is very short: "${contextData}"`);
                    }
                    // Tell webview an assistant message is starting
                    this._panel.webview.postMessage({
                        type: 'aiChatStarted',
                        messageId: assistantMsgId,
                    });

                    await this._aiService.chat(
                        question,
                        contextData,
                        history,
                        (chunk) => {
                            this._panel.webview.postMessage({
                                type: 'aiChatChunk',
                                messageId: assistantMsgId,
                                chunk,
                            });
                        },
                        undefined,
                        webSearch,
                    );

                    this._panel.webview.postMessage({
                        type: 'aiChatDone',
                        messageId: assistantMsgId,
                    });
                } catch (e: unknown) {
                    const m = e instanceof Error ? e.message : 'AI error';
                    this._panel.webview.postMessage({
                        type: 'aiChatError',
                        messageId: assistantMsgId,
                        error: m,
                    });
                }
                break;
            }

            case 'ai.agent': {
                if (!AiService.isAvailable()) {
                    this._panel.webview.postMessage({ type: 'aiAgentError', error: 'AI features require GitHub Copilot' });
                    break;
                }
                const prompt = (msg.body as string | undefined) ?? '';
                const template = (msg.mode as string | undefined) ?? 'custom';
                const customSystemPrompt = (msg.systemPrompt as string | undefined) ?? '';
                try {
                    const contextData = await this._gatherContext();
                    this._outputChannel.appendLine(
                        `[AI] Agent run — template: ${template}, prompt length: ${prompt.length}, context: ${contextData.length} chars${customSystemPrompt ? ' (custom system prompt)' : ''}`,
                    );
                    this._panel.webview.postMessage({ type: 'aiAgentStarted' });

                    const result = await this._aiService.agentAnalysis(
                        template,
                        prompt,
                        contextData,
                        (chunk) => {
                            this._panel.webview.postMessage({
                                type: 'aiAgentChunk',
                                chunk,
                            });
                        },
                        undefined,
                        customSystemPrompt || undefined,
                    );

                    this._panel.webview.postMessage({
                        type: 'aiAgentDone',
                        content: result,
                    });
                } catch (e: unknown) {
                    const m = e instanceof Error ? e.message : 'AI error';
                    this._panel.webview.postMessage({
                        type: 'aiAgentError',
                        error: m,
                    });
                }
                break;
            }

            case 'ai.configureGeminiKey': {
                // Open the settings UI focused on the Gemini API key setting
                await vscode.commands.executeCommand(
                    'workbench.action.openSettings',
                    'superprompt-forge.ai.geminiApiKey',
                );
                break;
            }

            // ─── Settings Tab ──────────────────────────────────────────

            case 'settings.getSettings': {
                const config = vscode.workspace.getConfiguration('superprompt-forge');
                this._panel.webview.postMessage({
                    type: 'settingsData',
                    settings: {
                        // Stash
                        autoRefresh: config.get<boolean>('autoRefresh', true),
                        confirmOnDrop: config.get<boolean>('confirmOnDrop', true),
                        confirmOnClear: config.get<boolean>('confirmOnClear', true),
                        showFileStatus: config.get<boolean>('showFileStatus', true),
                        defaultIncludeUntracked: config.get<boolean>('defaultIncludeUntracked', false),
                        sortOrder: config.get<string>('sortOrder', 'newest'),
                        showBranchInDescription: config.get<boolean>('showBranchInDescription', true),
                        // Notes
                        autosaveDelay: config.get<number>('notes.autosaveDelay', 30),
                        defaultVisibility: config.get<string>('notes.defaultVisibility', 'secret'),
                        // Mattermost
                        mattermostServerUrl: config.get<string>('mattermost.serverUrl', ''),
                        // AI Privacy
                        includeSecretGists: config.get<boolean>('ai.includeSecretGists', false),
                        includePrivateMessages: config.get<boolean>('ai.includePrivateMessages', false),
                        // AI Provider
                        aiProvider: AiService.activeProvider(),
                        providerPreference: config.get<string>('ai.provider', 'auto'),
                        geminiApiKey: config.get<string>('ai.geminiApiKey', ''),
                        geminiModel: config.get<string>('ai.geminiModel', 'gemini-2.5-flash'),
                    },
                });
                break;
            }

            case 'settings.updateSetting': {
                const settingKey = msg.key as string;
                const settingValue = msg.value;
                if (!settingKey) { break; }

                // Map setting keys to their VS Code configuration paths
                const SETTING_MAP: Record<string, { section: string; key: string }> = {
                    autoRefresh: { section: 'superprompt-forge', key: 'autoRefresh' },
                    confirmOnDrop: { section: 'superprompt-forge', key: 'confirmOnDrop' },
                    confirmOnClear: { section: 'superprompt-forge', key: 'confirmOnClear' },
                    showFileStatus: { section: 'superprompt-forge', key: 'showFileStatus' },
                    defaultIncludeUntracked: { section: 'superprompt-forge', key: 'defaultIncludeUntracked' },
                    sortOrder: { section: 'superprompt-forge', key: 'sortOrder' },
                    showBranchInDescription: { section: 'superprompt-forge', key: 'showBranchInDescription' },
                    autosaveDelay: { section: 'superprompt-forge.notes', key: 'autosaveDelay' },
                    defaultVisibility: { section: 'superprompt-forge.notes', key: 'defaultVisibility' },
                    mattermostServerUrl: { section: 'superprompt-forge.mattermost', key: 'serverUrl' },
                    includeSecretGists: { section: 'superprompt-forge.ai', key: 'includeSecretGists' },
                    includePrivateMessages: { section: 'superprompt-forge.ai', key: 'includePrivateMessages' },
                    providerPreference: { section: 'superprompt-forge.ai', key: 'provider' },
                    geminiApiKey: { section: 'superprompt-forge.ai', key: 'geminiApiKey' },
                    geminiModel: { section: 'superprompt-forge.ai', key: 'geminiModel' },
                };

                const mapping = SETTING_MAP[settingKey];
                if (mapping) {
                    await vscode.workspace
                        .getConfiguration(mapping.section)
                        .update(mapping.key, settingValue, vscode.ConfigurationTarget.Global);

                    // If AI provider/key/model changed, re-send AI availability
                    if (settingKey === 'providerPreference' || settingKey === 'geminiApiKey' || settingKey === 'geminiModel') {
                        this._panel.webview.postMessage({
                            type: 'aiAvailable',
                            available: AiService.isAvailable(),
                            provider: AiService.activeProvider(),
                        });
                    }
                }
                break;
            }

            case 'openExternal': {
                if (msg.url) {
                    vscode.env.openExternal(vscode.Uri.parse(msg.url as string));
                }
                break;
            }

            case 'settings.openInVSCode': {
                vscode.commands.executeCommand('workbench.action.openSettings', '@ext:shanemiller89.superprompt-forge');
                break;
            }

            // ─── Google Drive ─────────────────────────────────

            case 'drive.signIn': {
                if (this._driveService) {
                    // Ensure credentials are configured — prompt if missing
                    const config = vscode.workspace.getConfiguration('superprompt-forge.google');
                    let clientId = config.get<string>('clientId', '').trim();
                    let clientSecret = config.get<string>('clientSecret', '').trim();

                    if (!clientId) {
                        const input = await vscode.window.showInputBox({
                            title: 'Google OAuth — Client ID',
                            prompt: 'Enter your Google OAuth 2.0 Client ID (from Google Cloud Console → APIs & Services → Credentials)',
                            placeHolder: 'xxxxxxxxxxxx-xxxxxxxxxxxxxxxx.apps.googleusercontent.com',
                            ignoreFocusOut: true,
                        });
                        if (!input) { break; }
                        clientId = input.trim();
                        await config.update('clientId', clientId, vscode.ConfigurationTarget.Global);
                    }

                    if (!clientSecret) {
                        const input = await vscode.window.showInputBox({
                            title: 'Google OAuth — Client Secret',
                            prompt: 'Enter your Google OAuth 2.0 Client Secret',
                            placeHolder: 'GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxxxx',
                            password: true,
                            ignoreFocusOut: true,
                        });
                        if (!input) { break; }
                        clientSecret = input.trim();
                        await config.update('clientSecret', clientSecret, vscode.ConfigurationTarget.Global);
                    }

                    try {
                        await this._driveService.signIn();
                        await this._sendDriveAuthStatus();
                    } catch (e: unknown) {
                        vscode.window.showErrorMessage(
                            `Google sign-in failed: ${e instanceof Error ? e.message : e}`,
                        );
                    }
                }
                break;
            }

            case 'drive.signOut': {
                if (this._driveService) {
                    await this._driveService.signOut();
                    await this._sendDriveAuthStatus();
                }
                break;
            }

            case 'drive.listFiles': {
                if (this._driveService) {
                    try {
                        const result = await this._driveService.listFiles(msg.folderId ?? 'root');
                        this._panel.webview.postMessage({
                            type: 'driveFiles',
                            files: result.files,
                            nextPageToken: result.nextPageToken,
                        });
                    } catch (e: unknown) {
                        this._outputChannel.appendLine(
                            `[Drive] listFiles error: ${e instanceof Error ? e.message : e}`,
                        );
                        this._panel.webview.postMessage({
                            type: 'driveFiles',
                            files: [],
                        });
                    }
                }
                break;
            }

            case 'drive.search': {
                if (this._driveService && msg.query) {
                    try {
                        const result = await this._driveService.searchFiles(msg.query);
                        this._panel.webview.postMessage({
                            type: 'driveSearchResults',
                            files: result.files,
                        });
                    } catch (e: unknown) {
                        this._outputChannel.appendLine(
                            `[Drive] search error: ${e instanceof Error ? e.message : e}`,
                        );
                        this._panel.webview.postMessage({
                            type: 'driveSearchResults',
                            files: [],
                        });
                    }
                }
                break;
            }

            case 'drive.getStarred': {
                if (this._driveService) {
                    try {
                        const result = await this._driveService.getStarredFiles();
                        this._panel.webview.postMessage({
                            type: 'driveStarredFiles',
                            files: result.files,
                        });
                    } catch (e: unknown) {
                        this._outputChannel.appendLine(
                            `[Drive] getStarred error: ${e instanceof Error ? e.message : e}`,
                        );
                        this._panel.webview.postMessage({
                            type: 'driveStarredFiles',
                            files: [],
                        });
                    }
                }
                break;
            }

            case 'drive.getRecent': {
                if (this._driveService) {
                    try {
                        const result = await this._driveService.getRecentFiles();
                        this._panel.webview.postMessage({
                            type: 'driveRecentFiles',
                            files: result.files,
                        });
                    } catch (e: unknown) {
                        this._outputChannel.appendLine(
                            `[Drive] getRecent error: ${e instanceof Error ? e.message : e}`,
                        );
                        this._panel.webview.postMessage({
                            type: 'driveRecentFiles',
                            files: [],
                        });
                    }
                }
                break;
            }

            case 'drive.getSharedDrives': {
                if (this._driveService) {
                    try {
                        const result = await this._driveService.listSharedDrives();
                        this._panel.webview.postMessage({
                            type: 'driveSharedDrives',
                            drives: result.drives,
                        });
                    } catch (e: unknown) {
                        this._outputChannel.appendLine(
                            `[Drive] getSharedDrives error: ${e instanceof Error ? e.message : e}`,
                        );
                        this._panel.webview.postMessage({
                            type: 'driveSharedDrives',
                            drives: [],
                        });
                    }
                }
                break;
            }

            case 'drive.listSharedDriveFiles': {
                if (this._driveService && msg.driveId) {
                    try {
                        const result = await this._driveService.listSharedDriveFiles(msg.driveId, msg.folderId);
                        this._panel.webview.postMessage({
                            type: 'driveSharedDriveFiles',
                            files: result.files,
                        });
                    } catch (e: unknown) {
                        this._outputChannel.appendLine(
                            `[Drive] listSharedDriveFiles error: ${e instanceof Error ? e.message : e}`,
                        );
                        this._panel.webview.postMessage({
                            type: 'driveSharedDriveFiles',
                            files: [],
                        });
                    }
                }
                break;
            }

            case 'drive.openInBrowser': {
                if (this._driveService && msg.fileId) {
                    try {
                        await this._driveService.openInBrowser(msg.fileId);
                    } catch (e: unknown) {
                        vscode.window.showErrorMessage(
                            `Failed to open file: ${e instanceof Error ? e.message : e}`,
                        );
                    }
                }
                break;
            }

            case 'drive.download': {
                if (this._driveService && msg.fileId) {
                    try {
                        // Let user pick a folder
                        const folders = await vscode.window.showOpenDialog({
                            canSelectFiles: false,
                            canSelectFolders: true,
                            canSelectMany: false,
                            title: 'Download to folder',
                            defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
                        });
                        if (folders && folders[0]) {
                            const localUri = await vscode.window.withProgress(
                                {
                                    location: vscode.ProgressLocation.Notification,
                                    title: 'Downloading from Google Drive…',
                                },
                                () => this._driveService!.downloadFile(msg.fileId!, folders[0]),
                            );
                            const openAction = await vscode.window.showInformationMessage(
                                `Downloaded: ${localUri.fsPath}`,
                                'Open File',
                            );
                            if (openAction === 'Open File') {
                                await vscode.commands.executeCommand('vscode.open', localUri);
                            }
                        }
                    } catch (e: unknown) {
                        vscode.window.showErrorMessage(
                            `Download failed: ${e instanceof Error ? e.message : e}`,
                        );
                    }
                }
                break;
            }

            case 'drive.upload': {
                if (this._driveService) {
                    try {
                        const files = await vscode.window.showOpenDialog({
                            canSelectFiles: true,
                            canSelectFolders: false,
                            canSelectMany: false,
                            title: 'Select file to upload to Google Drive',
                        });
                        if (files && files[0]) {
                            const fileName = files[0].fsPath.split('/').pop() ?? 'file';
                            this._panel.webview.postMessage({
                                type: 'driveUploadStart',
                                fileName,
                            });
                            await vscode.window.withProgress(
                                {
                                    location: vscode.ProgressLocation.Notification,
                                    title: `Uploading ${fileName} to Google Drive…`,
                                },
                                () => this._driveService!.uploadFile(
                                    files[0].fsPath,
                                    msg.folderId ?? 'root',
                                ),
                            );
                            this._panel.webview.postMessage({ type: 'driveUploadDone' });
                            vscode.window.showInformationMessage(`Uploaded ${fileName} to Google Drive`);
                            // Refresh the current folder
                            const result = await this._driveService.listFiles(msg.folderId ?? 'root');
                            this._panel.webview.postMessage({
                                type: 'driveFiles',
                                files: result.files,
                                nextPageToken: result.nextPageToken,
                            });
                        }
                    } catch (e: unknown) {
                        this._panel.webview.postMessage({ type: 'driveUploadDone' });
                        vscode.window.showErrorMessage(
                            `Upload failed: ${e instanceof Error ? e.message : e}`,
                        );
                    }
                }
                break;
            }

            case 'drive.toggleStar': {
                if (this._driveService && msg.fileId !== undefined && msg.starred !== undefined) {
                    try {
                        await this._driveService.toggleStar(msg.fileId, msg.starred);
                        this._panel.webview.postMessage({
                            type: 'driveFileStarred',
                            fileId: msg.fileId,
                            starred: msg.starred,
                        });
                    } catch (e: unknown) {
                        vscode.window.showErrorMessage(
                            `Failed to update star: ${e instanceof Error ? e.message : e}`,
                        );
                    }
                }
                break;
            }

            case 'drive.getPinnedDocs': {
                if (this._driveService) {
                    this._panel.webview.postMessage({
                        type: 'drivePinnedDocs',
                        docs: this._driveService.getPinnedDocs(),
                    });
                }
                break;
            }

            case 'drive.pinDoc': {
                if (this._driveService && msg.fileId) {
                    await this._driveService.pinDoc({
                        fileId: msg.fileId,
                        name: msg.name ?? 'Untitled',
                        mimeType: msg.mimeType ?? 'application/octet-stream',
                        webViewLink: msg.webViewLink,
                    });
                    this._panel.webview.postMessage({
                        type: 'drivePinnedDocs',
                        docs: this._driveService.getPinnedDocs(),
                    });
                }
                break;
            }

            case 'drive.unpinDoc': {
                if (this._driveService && msg.fileId) {
                    await this._driveService.unpinDoc(msg.fileId);
                    this._panel.webview.postMessage({
                        type: 'drivePinnedDocs',
                        docs: this._driveService.getPinnedDocs(),
                    });
                }
                break;
            }

            // ─── Google Calendar ──────────────────────────────────────

            case 'calendar.signIn': {
                if (this._calendarService) {
                    // Check for OAuth credentials first
                    const config = vscode.workspace.getConfiguration('superprompt-forge');
                    let clientId = config.get<string>('google.clientId', '');
                    let clientSecret = config.get<string>('google.clientSecret', '');

                    if (!clientId || !clientSecret) {
                        const idInput = await vscode.window.showInputBox({
                            prompt: 'Enter your Google Cloud OAuth Client ID',
                            placeHolder: 'xxxxxxxx.apps.googleusercontent.com',
                            ignoreFocusOut: true,
                        });
                        if (!idInput) { break; }
                        clientId = idInput;

                        const secretInput = await vscode.window.showInputBox({
                            prompt: 'Enter your Google Cloud OAuth Client Secret',
                            password: true,
                            ignoreFocusOut: true,
                        });
                        if (!secretInput) { break; }
                        clientSecret = secretInput;

                        await config.update('google.clientId', clientId, vscode.ConfigurationTarget.Global);
                        await config.update('google.clientSecret', clientSecret, vscode.ConfigurationTarget.Global);
                    }

                    try {
                        await this._calendarService.signIn();
                        const isAuth = await this._calendarService.isAuthenticated();
                        this._panel.webview.postMessage({
                            type: 'calendarAuth',
                            authenticated: isAuth,
                        });
                    } catch (e: unknown) {
                        this._outputChannel.appendLine(`[Calendar] Sign-in error: ${e instanceof Error ? e.message : e}`);
                        vscode.window.showErrorMessage(`Google sign-in failed: ${e instanceof Error ? e.message : e}`);
                    }
                }
                break;
            }

            case 'calendar.signOut': {
                if (this._calendarService) {
                    await this._calendarService.signOut();
                    this._panel.webview.postMessage({
                        type: 'calendarAuth',
                        authenticated: false,
                    });
                }
                break;
            }

            case 'calendar.listCalendars': {
                if (this._calendarService) {
                    try {
                        this._outputChannel.appendLine('[Calendar] Fetching calendar list...');
                        const calendars = await this._calendarService.listCalendars();
                        this._outputChannel.appendLine(`[Calendar] Found ${calendars.length} calendars`);
                        this._panel.webview.postMessage({
                            type: 'calendarList',
                            calendars,
                        });
                    } catch (e: unknown) {
                        const errorMsg = e instanceof Error ? e.message : String(e);
                        this._outputChannel.appendLine(`[Calendar] List calendars error: ${errorMsg}`);
                        this._panel.webview.postMessage({
                            type: 'calendarError',
                            error: `Failed to load calendars: ${errorMsg}`,
                        });
                    }
                }
                break;
            }

            case 'calendar.listEvents': {
                if (this._calendarService) {
                    try {
                        const timeMin = msg.timeMin as string | undefined;
                        const timeMax = msg.timeMax as string | undefined;

                        this._outputChannel.appendLine(`[Calendar] Fetching events (${timeMin ?? 'default'} → ${timeMax ?? 'default'})`);

                        // Fetch events from all calendars
                        const calendars = await this._calendarService.listCalendars();
                        const allEvents: unknown[] = [];
                        let errorCount = 0;

                        for (const cal of calendars) {
                            try {
                                const response = await this._calendarService.listEvents(
                                    cal.id,
                                    timeMin,
                                    timeMax,
                                );
                                const calEvents = (response.items ?? []).map((event) => ({
                                    ...event,
                                    calendarId: cal.id,
                                    calendarColor: cal.backgroundColor,
                                }));
                                allEvents.push(...calEvents);
                                this._outputChannel.appendLine(`[Calendar]   ${cal.summary}: ${calEvents.length} events`);
                            } catch (calErr: unknown) {
                                errorCount++;
                                this._outputChannel.appendLine(
                                    `[Calendar]   Error fetching events for ${cal.summary}: ${calErr instanceof Error ? calErr.message : calErr}`,
                                );
                            }
                        }

                        this._outputChannel.appendLine(`[Calendar] Total: ${allEvents.length} events from ${calendars.length - errorCount}/${calendars.length} calendars`);

                        this._panel.webview.postMessage({
                            type: 'calendarEvents',
                            events: allEvents,
                        });

                        if (errorCount > 0 && allEvents.length === 0) {
                            this._panel.webview.postMessage({
                                type: 'calendarError',
                                error: `Failed to fetch events from ${errorCount} calendar(s). Check the output channel for details.`,
                            });
                        }
                    } catch (e: unknown) {
                        const errorMsg = e instanceof Error ? e.message : String(e);
                        this._outputChannel.appendLine(`[Calendar] List events error: ${errorMsg}`);
                        this._panel.webview.postMessage({
                            type: 'calendarError',
                            error: `Failed to load events: ${errorMsg}`,
                        });
                    }
                }
                break;
            }

            case 'calendar.openLink': {
                if (msg.url) {
                    await vscode.env.openExternal(vscode.Uri.parse(msg.url as string));
                }
                break;
            }

            // ─── Wiki ─────────────────────────────────────────

            case 'wiki.refresh':
                await this._refreshWiki();
                break;

            case 'wiki.signIn':
                await vscode.commands.executeCommand('superprompt-forge.issues.signIn');
                await this._sendAuthStatus();
                await this._refreshWiki();
                break;

            case 'wiki.getPage': {
                if (msg.filename && this._wikiService) {
                    try {
                        const repoInfo = await this._getRepoInfo();
                        if (!repoInfo) { break; }
                        this._panel.webview.postMessage({ type: 'wikiPageLoading' });
                        const page = await this._wikiService.getPageContent(
                            repoInfo.owner,
                            repoInfo.repo,
                            msg.filename as string,
                        );
                        this._panel.webview.postMessage({
                            type: 'wikiPageContent',
                            page: WikiService.toPageData(page),
                        });
                    } catch (e: unknown) {
                        const m = e instanceof Error ? e.message : 'Unknown error';
                        this._panel.webview.postMessage({ type: 'wikiError', message: m });
                    }
                }
                break;
            }

            case 'wiki.openInBrowser': {
                const repoInfo = await this._getRepoInfo();
                if (repoInfo) {
                    const wikiUrl = this._wikiService
                        ? this._wikiService.getWikiUrl(repoInfo.owner, repoInfo.repo)
                        : `https://github.com/${repoInfo.owner}/${repoInfo.repo}/wiki`;
                    await vscode.env.openExternal(vscode.Uri.parse(wikiUrl));
                }
                break;
            }

            case 'wiki.openPageInBrowser': {
                if (msg.filename && this._wikiService) {
                    const repoInfo = await this._getRepoInfo();
                    if (repoInfo) {
                        const pageUrl = this._wikiService.getPageUrl(
                            repoInfo.owner,
                            repoInfo.repo,
                            msg.filename as string,
                        );
                        await vscode.env.openExternal(vscode.Uri.parse(pageUrl));
                    }
                }
                break;
            }
        }
    }

    /**
     * Gather context data from services for AI summarization / chat.
     * If tabKey is provided, only gather data for that specific tab.
     * Otherwise gather a snapshot of all tabs for the chat context.
     */
    private async _gatherContext(tabKey?: string): Promise<string> {
        this._outputChannel.appendLine(`[AI] Gathering context${tabKey ? ` for tab: ${tabKey}` : ' for all tabs'}`);
        const sections: string[] = [];
        const shouldInclude = (key: string) => !tabKey || tabKey === key;

        // Read AI privacy settings
        const aiConfig = vscode.workspace.getConfiguration('superprompt-forge.ai');
        const includeSecretGists = aiConfig.get<boolean>('includeSecretGists', false);
        const includePrivateMessages = aiConfig.get<boolean>('includePrivateMessages', false);

        // ─── Stashes ─────────────────────────────────────────
        if (shouldInclude('stashes')) {
            try {
                const stashes = await this._gitService.getStashList();
                if (stashes.length === 0) {
                    sections.push('## Stashes\nNo stashes found.');
                } else {
                    const lines = stashes.map((s) =>
                        `- stash@{${s.index}}: "${s.message}" (branch: ${s.branch}, ${formatRelativeTime(s.date)})`,
                    );
                    sections.push(`## Stashes (${stashes.length})\n${lines.join('\n')}`);
                }
            } catch {
                sections.push('## Stashes\nUnable to fetch stash data.');
            }
        }

        // ─── Pull Requests ───────────────────────────────────
        if (shouldInclude('prs') && this._prService && this._authService) {
            try {
                const repoInfo = await this._getRepoInfo();
                if (repoInfo) {
                    let username: string | undefined;
                    try { username = await this._prService.getAuthenticatedUser(); } catch { /* ok */ }
                    const prs = await this._prService.listPullRequests(
                        repoInfo.owner, repoInfo.repo, 'open', username,
                    );
                    if (prs.length === 0) {
                        sections.push('## Pull Requests\nNo open PRs.');
                    } else {
                        const lines = prs.map((pr) => {
                            const data = PrService.toData(pr);
                            return `- #${data.number}: "${data.title}" by ${data.author} (${data.state}, ${data.commentsCount} comments, +${data.additions}/-${data.deletions})`;
                        });
                        sections.push(`## Pull Requests (${prs.length} open)\n${lines.join('\n')}`);
                    }
                }
            } catch {
                sections.push('## Pull Requests\nUnable to fetch PR data.');
            }
        }

        // ─── Issues ──────────────────────────────────────────
        if (shouldInclude('issues') && this._issueService && this._authService) {
            try {
                const repoInfo = await this._getRepoInfo();
                if (repoInfo) {
                    const issues = await this._issueService.listIssues(
                        repoInfo.owner, repoInfo.repo, 'open',
                    );
                    if (issues.length === 0) {
                        sections.push('## Issues\nNo open issues.');
                    } else {
                        const lines = issues.map((i) => {
                            const data = IssueService.toData(i);
                            const labels = data.labels.length > 0 ? ` [${data.labels.map((l) => l.name).join(', ')}]` : '';
                            return `- #${data.number}: "${data.title}" by ${data.author}${labels} (${data.commentsCount} comments)`;
                        });
                        sections.push(`## Issues (${issues.length} open)\n${lines.join('\n')}`);
                    }
                }
            } catch {
                sections.push('## Issues\nUnable to fetch issue data.');
            }
        }

        // ─── Projects ────────────────────────────────────────
        if (shouldInclude('projects') && this._projectService && this._authService) {
            try {
                const repoInfo = await this._getRepoInfo();
                if (repoInfo) {
                    const projects = await this._projectService.listRepositoryProjects(
                        repoInfo.owner, repoInfo.repo,
                    );
                    if (projects.length === 0) {
                        sections.push('## Projects\nNo projects found.');
                    } else {
                        const projLines: string[] = [];
                        // Summarize first 3 projects
                        for (const p of projects.slice(0, 3)) {
                            try {
                                const itemResult = await this._projectService.listProjectItems(p.id);
                                const itemData = itemResult.items.map((i: { id: string; type: string; isArchived: boolean }) => i);
                                const typeCounts: Record<string, number> = {};
                                for (const item of itemData) {
                                    typeCounts[item.type] = (typeCounts[item.type] ?? 0) + 1;
                                }
                                const typeStr = Object.entries(typeCounts)
                                    .map(([k, v]) => `${k}: ${v}`)
                                    .join(', ');
                                projLines.push(`- "${p.title}" (${itemData.length} items — ${typeStr})`);
                            } catch {
                                projLines.push(`- "${p.title}" (unable to load items)`);
                            }
                        }
                        sections.push(`## Projects (${projects.length})\n${projLines.join('\n')}`);
                    }
                }
            } catch {
                sections.push('## Projects\nUnable to fetch project data.');
            }
        }

        // ─── Notes ───────────────────────────────────────────
        if (shouldInclude('notes') && this._gistService && this._authService) {
            try {
                const isAuth = await this._authService.isAuthenticated();
                if (isAuth) {
                    const notes = await this._gistService.listNotes();
                    if (notes.length === 0) {
                        sections.push('## Notes\nNo notes found.');
                    } else {
                        // Filter by visibility setting
                        const filteredNotes = includeSecretGists
                            ? notes
                            : notes.filter((n) => n.isPublic);
                        if (filteredNotes.length === 0) {
                            sections.push('## Notes\nNo public notes found. Enable "Include Secret Gists" in settings to include secret notes.');
                        } else {
                        // Fetch full content for each note (list API may truncate)
                        const noteLines: string[] = [];
                        for (const n of filteredNotes.slice(0, 10)) {
                            try {
                                const full = await this._gistService.getNote(n.id);
                                const content = full.content.trim();
                                const preview = content.length > 500
                                    ? content.slice(0, 500) + '…'
                                    : content;
                                noteLines.push(
                                    `### "${full.title}" (${full.isPublic ? 'public' : 'secret'})\n${preview}`,
                                );
                            } catch {
                                noteLines.push(
                                    `### "${n.title}" (${n.isPublic ? 'public' : 'secret'})\nUnable to load content.`,
                                );
                            }
                        }
                        if (filteredNotes.length > 10) {
                            noteLines.push(`…and ${filteredNotes.length - 10} more notes.`);
                        }
                        const secretNote = includeSecretGists ? '' : ' (public only)';
                        sections.push(`## Notes (${filteredNotes.length})${secretNote}\n${noteLines.join('\n\n')}`);
                        }
                    }
                }
            } catch {
                sections.push('## Notes\nUnable to fetch notes.');
            }
        }

        // ─── Mattermost ─────────────────────────────────────
        if (shouldInclude('mattermost') && this._mattermostService) {
            try {
                const configured = await this._mattermostService.isConfigured();
                if (configured) {
                    const teams = await this._mattermostService.getMyTeams();
                    const teamNames = teams.map((t) => t.displayName).join(', ');
                    const mmLines: string[] = [`Connected to teams: ${teamNames}`];

                    // Get channels and recent posts for the first team
                    if (teams.length > 0) {
                        try {
                            const channels = await this._mattermostService.getMyChannels(teams[0].id);
                            // Filter out DMs/group messages unless setting enabled
                            const eligibleChannels = includePrivateMessages
                                ? channels
                                : channels.filter((c) => c.type === 'O' || c.type === 'P');
                            // Sort by last post time, get most active channels
                            const activeChannels = eligibleChannels
                                .filter((c) => c.lastPostAt > 0)
                                .sort((a, b) => b.lastPostAt - a.lastPostAt)
                                .slice(0, 5);

                            mmLines.push(`\n${channels.length} channels total, showing recent activity:`);

                            // Fetch recent posts from top active channels
                            for (const ch of activeChannels) {
                                try {
                                    const posts = await this._mattermostService.getChannelPosts(
                                        ch.id, 0, 35,
                                    );
                                    if (posts.length > 0) {
                                        const postLines = posts.map((p) => {
                                            const time = new Date(p.createAt).toLocaleString();
                                            const msg = p.message.length > 750
                                                ? p.message.slice(0, 750) + '…'
                                                : p.message;
                                            return `  - [${time}] ${msg}`;
                                        });
                                        mmLines.push(`\n### #${ch.displayName}\n${postLines.join('\n')}`);
                                    } else {
                                        mmLines.push(`\n### #${ch.displayName}\nNo recent posts.`);
                                    }
                                } catch {
                                    mmLines.push(`\n### #${ch.displayName}\nUnable to load posts.`);
                                }
                            }
                        } catch { /* ok */ }
                    }
                    sections.push(`## Mattermost\n${mmLines.join('\n')}`);
                } else {
                    sections.push('## Mattermost\nNot configured.');
                }
            } catch {
                sections.push('## Mattermost\nUnable to fetch Mattermost data.');
            }
        }

        // ─── Google Drive ────────────────────────────────────
        if (shouldInclude('drive') && this._driveService) {
            try {
                const isGoogleAuth = await this._driveService.isAuthenticated();
                if (isGoogleAuth) {
                    const driveLines: string[] = [];

                    // Recent files
                    try {
                        const recent = await this._driveService.getRecentFiles(15);
                        if (recent.files.length > 0) {
                            driveLines.push('### Recent Files');
                            for (const f of recent.files) {
                                const modified = new Date(f.modifiedTime).toLocaleDateString();
                                driveLines.push(`- "${f.name}" (${f.mimeType.split('.').pop()}, modified ${modified})`);
                            }
                        }
                    } catch { /* ok */ }

                    // Starred files
                    try {
                        const starred = await this._driveService.getStarredFiles(15);
                        if (starred.files.length > 0) {
                            driveLines.push('### Starred/Pinned Files');
                            for (const f of starred.files) {
                                driveLines.push(`- "${f.name}" (${f.mimeType.split('.').pop()})`);
                            }
                        }
                    } catch { /* ok */ }

                    if (driveLines.length > 0) {
                        sections.push(`## Google Drive\n${driveLines.join('\n')}`);
                    } else {
                        sections.push('## Google Drive\nConnected but no recent or starred files.');
                    }
                } else {
                    sections.push('## Google Drive\nNot signed in.');
                }
            } catch {
                sections.push('## Google Drive\nUnable to fetch Drive data.');
            }
        }

        // ─── Google Calendar ─────────────────────────────────
        if (shouldInclude('calendar') && this._calendarService) {
            try {
                const isGoogleAuth = await this._calendarService.isAuthenticated();
                if (isGoogleAuth) {
                    const calLines: string[] = [];

                    // Fetch upcoming events for the next 7 days
                    const now = new Date();
                    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                    const timeMin = now.toISOString();
                    const timeMax = weekFromNow.toISOString();

                    try {
                        const calendars = await this._calendarService.listCalendars();
                        calLines.push(`${calendars.length} calendar(s) connected`);

                        let totalEvents = 0;
                        for (const cal of calendars.slice(0, 5)) {
                            try {
                                const eventsResp = await this._calendarService.listEvents(
                                    cal.id, timeMin, timeMax, 20,
                                );
                                const items = eventsResp.items ?? [];
                                totalEvents += items.length;
                                if (items.length > 0) {
                                    calLines.push(`\n### ${cal.summary}`);
                                    for (const ev of items) {
                                        const start = ev.start.dateTime
                                            ? new Date(ev.start.dateTime).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                                            : ev.start.date ?? '';
                                        const allDay = !ev.start.dateTime && !!ev.start.date;
                                        const timeStr = allDay ? `${start} (all day)` : start;
                                        const summary = ev.summary ?? '(No title)';
                                        const location = ev.location ? ` @ ${ev.location}` : '';
                                        calLines.push(`- ${timeStr}: "${summary}"${location}`);
                                    }
                                }
                            } catch { /* ok — skip individual calendar errors */ }
                        }

                        if (totalEvents === 0) {
                            calLines.push('No upcoming events in the next 7 days.');
                        }
                    } catch {
                        calLines.push('Unable to list calendars.');
                    }

                    sections.push(`## Google Calendar (next 7 days)\n${calLines.join('\n')}`);
                } else {
                    sections.push('## Google Calendar\nNot signed in.');
                }
            } catch {
                sections.push('## Google Calendar\nUnable to fetch calendar data.');
            }
        }

        // ─── Wiki ────────────────────────────────────────────
        if (shouldInclude('wiki') && this._wikiService && this._authService) {
            try {
                const repoInfo = await this._getRepoInfo();
                if (repoInfo) {
                    const hasWiki = await this._wikiService.hasWiki(repoInfo.owner, repoInfo.repo);
                    if (!hasWiki) {
                        sections.push('## Wiki\nNo wiki found for this repository.');
                    } else {
                        const pages = await this._wikiService.listPages(repoInfo.owner, repoInfo.repo);
                        if (pages.length === 0) {
                            sections.push('## Wiki\nWiki exists but has no pages.');
                        } else {
                            const wikiLines: string[] = [];
                            // Fetch content for Home page if it exists
                            const homePage = pages.find((p) => p.title === 'Home');
                            if (homePage) {
                                try {
                                    const home = await this._wikiService.getPageContent(
                                        repoInfo.owner, repoInfo.repo, homePage.filename,
                                    );
                                    const preview = home.content.length > 1000
                                        ? home.content.slice(0, 1000) + '…'
                                        : home.content;
                                    wikiLines.push(`### Home\n${preview}`);
                                } catch { /* ok */ }
                            }
                            // List remaining pages
                            const otherPages = pages.filter((p) => p.title !== 'Home');
                            if (otherPages.length > 0) {
                                wikiLines.push('\n### Other Pages');
                                for (const p of otherPages.slice(0, 20)) {
                                    wikiLines.push(`- ${p.title}`);
                                }
                                if (otherPages.length > 20) {
                                    wikiLines.push(`…and ${otherPages.length - 20} more pages.`);
                                }
                            }
                            sections.push(`## Wiki (${pages.length} pages)\n${wikiLines.join('\n')}`);
                        }
                    }
                }
            } catch {
                sections.push('## Wiki\nUnable to fetch wiki data.');
            }
        }

        return sections.join('\n\n');
    }

    /** Send current auth status to the webview. */
    private async _sendAuthStatus(): Promise<void> {
        if (!this._authService) {
            return;
        }
        try {
            const isAuth = await this._authService.isAuthenticated();
            const session = isAuth ? await this._authService.getSession() : null;
            this._panel.webview.postMessage({
                type: 'authStatus',
                authenticated: isAuth,
                username: session?.account.label ?? null,
            });
        } catch {
            this._panel.webview.postMessage({
                type: 'authStatus',
                authenticated: false,
                username: null,
            });
        }
    }

    /** Refresh wiki pages for the current repo and send to webview. */
    private async _refreshWiki(): Promise<void> {
        if (!this._wikiService || !this._authService) {
            return;
        }
        try {
            const isAuth = await this._authService.isAuthenticated();
            if (!isAuth) {
                // Let the webview know auth is needed so it can show the sign-in prompt
                this._panel.webview.postMessage({ type: 'wikiAuthRequired' });
                return;
            }

            const repoInfo = await this._getRepoInfo();
            if (!repoInfo) {
                this._panel.webview.postMessage({ type: 'wikiError', message: 'No GitHub repository detected. Open a repo or use the repo switcher.' });
                return;
            }

            this._panel.webview.postMessage({ type: 'wikiLoading' });

            const hasWiki = await this._wikiService.hasWiki(repoInfo.owner, repoInfo.repo);
            if (!hasWiki) {
                this._panel.webview.postMessage({ type: 'wikiNoWiki' });
                return;
            }

            const pages = await this._wikiService.listPages(repoInfo.owner, repoInfo.repo);
            this._panel.webview.postMessage({
                type: 'wikiPages',
                pages: pages.map(WikiService.toSummaryData),
            });
        } catch (e: unknown) {
            const m = e instanceof Error ? e.message : 'Unknown error';
            this._outputChannel.appendLine(`[Wiki] Error refreshing: ${m}`);
            this._panel.webview.postMessage({ type: 'wikiError', message: m });
        }
    }

    /** Send Google Drive authentication status to the webview */
    private async _sendDriveAuthStatus(): Promise<void> {
        if (!this._driveService) {
            return;
        }
        try {
            const isAuth = await this._driveService.isAuthenticated();
            let email: string | null = null;
            if (isAuth) {
                const session = await vscode.authentication.getSession('superprompt-forge-google', [], { createIfNone: false });
                email = session?.account?.label ?? null;
            }
            this._panel.webview.postMessage({
                type: 'driveAuth',
                authenticated: isAuth,
                email,
            });
        } catch {
            this._panel.webview.postMessage({
                type: 'driveAuth',
                authenticated: false,
                email: null,
            });
        }
    }

    private async _sendCalendarAuthStatus(): Promise<void> {
        if (!this._calendarService) {
            return;
        }
        try {
            const isAuth = await this._calendarService.isAuthenticated();
            let email: string | null = null;
            if (isAuth) {
                const session = await vscode.authentication.getSession('superprompt-forge-google', [], { createIfNone: false });
                email = session?.account?.label ?? null;
            }
            this._panel.webview.postMessage({
                type: 'calendarAuth',
                authenticated: isAuth,
                email,
            });
        } catch {
            this._panel.webview.postMessage({
                type: 'calendarAuth',
                authenticated: false,
                email: null,
            });
        }
    }

    /** Fetch notes from GistService and send to webview. */
    private async _refreshNotes(): Promise<void> {
        if (!this._gistService || !this._authService) {
            return;
        }
        try {
            const isAuth = await this._authService.isAuthenticated();
            if (!isAuth) {
                return;
            }

            // Send current repo context for workspace filtering
            const repoInfo = await this._getRepoInfo();
            const repoSlug = repoInfo ? `${repoInfo.owner}/${repoInfo.repo}` : null;
            this._panel.webview.postMessage({ type: 'notesCurrentRepo', repo: repoSlug });

            this._panel.webview.postMessage({ type: 'notesLoading' });
            const notes = await this._gistService.listNotes();
            const payload = notes.map((n) => GistService.toData(n));
            this._panel.webview.postMessage({ type: 'notesData', payload });
        } catch (e: unknown) {
            const m = e instanceof Error ? e.message : 'Unknown error';
            this._panel.webview.postMessage({ type: 'notesError', message: m });
        }
    }

    /** Fetch PRs from PrService and send to webview. */
    private async _refreshPRs(state?: 'open' | 'closed' | 'merged' | 'all'): Promise<void> {
        if (!this._prService || !this._authService) {
            return;
        }
        try {
            const isAuth = await this._authService.isAuthenticated();
            if (!isAuth) {
                return;
            }

            const repoInfo = await this._getRepoInfo();
            if (!repoInfo) {
                this._panel.webview.postMessage({ type: 'prRepoNotFound' });
                return;
            }

            this._panel.webview.postMessage({ type: 'prsLoading' });

            let username: string | undefined;
            try {
                username = await this._prService.getAuthenticatedUser();
            } catch {
                /* fallback: no author filter */
            }

            const prs = await this._prService.listPullRequests(
                repoInfo.owner,
                repoInfo.repo,
                state ?? 'open',
                username,
            );
            const payload = prs.map((pr) => PrService.toData(pr));
            this._panel.webview.postMessage({ type: 'prsData', payload });
        } catch (e: unknown) {
            const m = e instanceof Error ? e.message : 'Unknown error';
            this._panel.webview.postMessage({ type: 'prError', message: m });
        }
    }

    /** Fetch comments for a specific PR and send to webview. */
    private async _sendPRComments(prNumber: number): Promise<void> {
        if (!this._prService) {
            return;
        }
        try {
            const repoInfo = await this._getRepoInfo();
            if (!repoInfo) {
                return;
            }

            this._panel.webview.postMessage({ type: 'prCommentsLoading', prNumber });

            // Get both the full PR detail and the comments (with thread data)
            const [pr, comments] = await Promise.all([
                this._prService.getPullRequest(repoInfo.owner, repoInfo.repo, prNumber),
                this._prService.getCommentsWithThreads(repoInfo.owner, repoInfo.repo, prNumber),
            ]);

            this._panel.webview.postMessage({
                type: 'prComments',
                prNumber,
                prDetail: PrService.toData(pr),
                comments: comments.map((c) => PrService.toCommentData(c)),
            });
        } catch (e: unknown) {
            const m = e instanceof Error ? e.message : 'Unknown error';
            this._panel.webview.postMessage({ type: 'prError', message: m });
        }
    }

    /** Fetch issues from IssueService and send to webview. */
    private async _refreshIssues(state?: 'open' | 'closed' | 'all'): Promise<void> {
        if (!this._issueService || !this._authService) {
            return;
        }
        try {
            const isAuth = await this._authService.isAuthenticated();
            if (!isAuth) {
                return;
            }

            const repoInfo = await this._getRepoInfo();
            if (!repoInfo) {
                this._panel.webview.postMessage({ type: 'issueRepoNotFound' });
                return;
            }

            this._panel.webview.postMessage({ type: 'issuesLoading' });

            const issues = await this._issueService.listIssues(
                repoInfo.owner,
                repoInfo.repo,
                state ?? 'open',
            );
            const payload = issues.map((i) => IssueService.toData(i));
            this._panel.webview.postMessage({ type: 'issuesData', payload });
        } catch (e: unknown) {
            const m = e instanceof Error ? e.message : 'Unknown error';
            this._panel.webview.postMessage({ type: 'issueError', message: m });
        }
    }

    /** Fetch comments for a specific issue and send to webview. */
    private async _sendIssueComments(issueNumber: number): Promise<void> {
        if (!this._issueService) {
            return;
        }
        try {
            const repoInfo = await this._getRepoInfo();
            if (!repoInfo) {
                return;
            }

            this._panel.webview.postMessage({ type: 'issueCommentsLoading', issueNumber });

            const [issue, comments] = await Promise.all([
                this._issueService.getIssue(repoInfo.owner, repoInfo.repo, issueNumber),
                this._issueService.getComments(repoInfo.owner, repoInfo.repo, issueNumber),
            ]);

            this._panel.webview.postMessage({
                type: 'issueComments',
                issueNumber,
                issueDetail: IssueService.toData(issue),
                comments: comments.map((c) => IssueService.toCommentData(c)),
            });
        } catch (e: unknown) {
            const m = e instanceof Error ? e.message : 'Unknown error';
            this._panel.webview.postMessage({ type: 'issueError', message: m });
        }
    }

    /** Discover projects for the current repo and load the first one. */
    private async _refreshProjects(): Promise<void> {
        if (!this._projectService || !this._authService) {
            return;
        }
        try {
            const isAuth = await this._authService.isAuthenticated();
            if (!isAuth) {
                return;
            }

            const repoInfo = await this._getRepoInfo();
            if (!repoInfo) {
                this._panel.webview.postMessage({ type: 'projectsRepoNotFound' });
                return;
            }

            this._panel.webview.postMessage({ type: 'projectsLoading' });

            // Discover projects linked to this repo
            const projects = await this._projectService.listRepositoryProjects(
                repoInfo.owner,
                repoInfo.repo,
            );
            this._panel.webview.postMessage({ type: 'projectsAvailable', payload: projects });

            if (projects.length === 0) {
                this._panel.webview.postMessage({ type: 'projectItemsData', payload: [] });
                return;
            }

            // Auto-select first open project
            const firstOpen = projects.find((p) => !p.closed) ?? projects[0];
            const project = await this._projectService.getProjectById(firstOpen.id);
            const projectData = ProjectService.toData(project);
            this._panel.webview.postMessage({ type: 'projectData', payload: projectData });

            // Load items
            const result = await this._projectService.listProjectItems(project.id);
            const items = result.items.map((i) => ProjectService.toItemData(i));
            this._panel.webview.postMessage({ type: 'projectItemsData', payload: items });
        } catch (e: unknown) {
            const m = e instanceof Error ? e.message : 'Unknown error';
            this._panel.webview.postMessage({ type: 'projectError', message: m });
        }
    }

    /** Refresh items for a specific project (e.g. after mutation). */
    private async _refreshProjectItems(projectId: string): Promise<void> {
        if (!this._projectService) {
            return;
        }
        try {
            this._panel.webview.postMessage({ type: 'projectsItemsLoading' });
            const result = await this._projectService.listProjectItems(projectId);
            const items = result.items.map((i) => ProjectService.toItemData(i));
            this._panel.webview.postMessage({ type: 'projectItemsData', payload: items });
        } catch (e: unknown) {
            const m = e instanceof Error ? e.message : 'Unknown error';
            this._panel.webview.postMessage({ type: 'projectError', message: m });
        }
    }

    /** Send Mattermost config status and teams to webview. */
    private async _refreshMattermost(): Promise<void> {
        if (!this._mattermostService) {
            return;
        }
        try {
            const configured = await this._mattermostService.isConfigured();
            this._panel.webview.postMessage({ type: 'mattermostConfigured', configured });

            if (!configured) {
                // Disconnect WebSocket if signing out or not configured
                this._mmWebSocket?.disconnect();
                this._mmWebSocket = undefined;
                return;
            }

            // Send current user info
            const me = await this._mattermostService.getMe();
            this._panel.webview.postMessage({
                type: 'mattermostUser',
                user: MattermostService.toUserData(me),
            });

            // Send teams
            const teams = await this._mattermostService.getMyTeams();
            const teamsPayload = teams.map((t) => MattermostService.toTeamData(t));
            this._panel.webview.postMessage({ type: 'mattermostTeams', payload: teamsPayload });

            // Auto-select first team and load its channels (including DMs)
            if (teams.length > 0) {
                const firstTeamId = teams[0].id;
                const { channels, dmChannels, groupChannels } = await this._mattermostService.getAllMyChannels(firstTeamId);
                const channelsPayload = channels.map((c) => MattermostService.toChannelData(c));

                // Resolve DM display names and other-user IDs
                const myUserId = me.id;
                const dmPayload = await this._resolveDmChannelPayloads(
                    [...dmChannels, ...groupChannels],
                    myUserId,
                );
                this._panel.webview.postMessage({
                    type: 'mattermostChannels',
                    payload: channelsPayload,
                    teamId: firstTeamId,
                });
                this._panel.webview.postMessage({
                    type: 'mattermostDmChannels',
                    payload: dmPayload,
                    teamId: firstTeamId,
                });

                // Fetch bulk unreads for all channels (non-blocking)
                const allChannelIds = [
                    ...channels.map((c) => c.id),
                    ...dmChannels.map((c) => c.id),
                    ...groupChannels.map((c) => c.id),
                ];
                this._fetchBulkUnreads(allChannelIds).catch(() => { /* ignore */ });
            }

            // Connect WebSocket for real-time events
            await this._connectMattermostWebSocket();
        } catch (e: unknown) {
            const m = e instanceof Error ? e.message : 'Unknown error';
            this._panel.webview.postMessage({ type: 'mattermostError', message: m });
        }
    }

    /** Resolve DM display names and other-user IDs for a list of DM/group channels. */
    private async _resolveDmChannelPayloads(
        dmChannels: import('./mattermostService').MattermostChannel[],
        myUserId: string,
    ): Promise<MattermostChannelData[]> {
        if (!this._mattermostService) { return []; }
        const results: MattermostChannelData[] = [];
        for (const c of dmChannels) {
            if (c.type === 'D') {
                const otherUserId = this._mattermostService.getDmOtherUserId(c, myUserId);
                const displayName = await this._mattermostService.resolveDmDisplayName(c, myUserId);
                const data = MattermostService.toChannelData(
                    { ...c, displayName },
                    otherUserId,
                );
                results.push(data);
            } else {
                results.push(MattermostService.toChannelData(c));
            }
        }
        return results;
    }

    /** Fetch unreads for all channel IDs and send as bulk to webview. */
    private async _fetchBulkUnreads(channelIds: string[]): Promise<void> {
        if (!this._mattermostService || channelIds.length === 0) { return; }
        const bulkUnreads: Array<{ channelId: string; msgCount: number; mentionCount: number }> = [];
        // Fetch in parallel batches to avoid overwhelming the server
        const batchSize = 10;
        for (let i = 0; i < channelIds.length; i += batchSize) {
            const batch = channelIds.slice(i, i + batchSize);
            const results = await Promise.allSettled(
                batch.map((id) => this._mattermostService!.getChannelUnread(id)),
            );
            for (const r of results) {
                if (r.status === 'fulfilled') {
                    bulkUnreads.push(MattermostService.toChannelUnreadData(r.value));
                }
            }
        }
        if (bulkUnreads.length > 0) {
            this._panel.webview.postMessage({
                type: 'mattermostBulkUnreads',
                payload: bulkUnreads,
            });
        }
    }

    /** Establish or re-establish the Mattermost WebSocket connection and wire events to webview. */
    private async _connectMattermostWebSocket(): Promise<void> {
        if (!this._mattermostService) { return; }

        // Tear down previous WebSocket if any
        if (this._mmWebSocket) {
            this._mmWebSocket.disconnect();
            this._mmWebSocket.dispose();
            this._mmWebSocket = undefined;
        }

        const serverUrl = await this._mattermostService.getServerUrl();
        const token = await this._mattermostService.getToken();
        if (!serverUrl || !token) { return; }

        const ws = new MattermostWebSocket(this._outputChannel);
        this._mmWebSocket = ws;

        // Connection status → webview banner
        ws.onConnectionChange((connected) => {
            this._panel.webview.postMessage({
                type: 'mattermostConnectionStatus',
                connected,
                reconnectAttempt: connected ? 0 : ws.reconnectAttempts,
            });
        });

        // New post → relay to webview
        ws.onPosted(async (evt) => {
            if (!this._mattermostService) { return; }
            try {
                const data = evt.data as unknown as MmWsPostedData;
                const rawPost = JSON.parse(data.post) as {
                    id: string; channel_id: string; user_id: string; message: string;
                    create_at: number; update_at: number; delete_at: number;
                    root_id: string; type: string; props: Record<string, unknown>;
                    is_pinned?: boolean;
                    file_ids?: string[];
                };
                const username = data.sender_name?.replace(/^@/, '') ??
                    await this._mattermostService.resolveUsername(rawPost.user_id);

                // Resolve file attachments if present
                let files: import('./mattermostService').MattermostFileInfoData[] | undefined;
                if (rawPost.file_ids && rawPost.file_ids.length > 0) {
                    try {
                        files = await this._mattermostService.resolveFileInfos(rawPost.file_ids);
                    } catch { /* ignore */ }
                }

                const postData: MattermostPostData = {
                    id: rawPost.id,
                    channelId: rawPost.channel_id,
                    userId: rawPost.user_id,
                    username,
                    message: rawPost.message,
                    createAt: new Date(rawPost.create_at).toISOString(),
                    updateAt: new Date(rawPost.update_at).toISOString(),
                    rootId: rawPost.root_id,
                    type: rawPost.type,
                    isPinned: rawPost.is_pinned ?? false,
                    files: files && files.length > 0 ? files : undefined,
                };
                this._panel.webview.postMessage({ type: 'mattermostNewPost', post: postData });

                // Also tell webview to increment unread for non-active channels
                this._panel.webview.postMessage({
                    type: 'mattermostNewPostUnread',
                    channelId: rawPost.channel_id,
                });

                // Desktop notification: check if message mentions the current user
                try {
                    const me = await this._mattermostService.getMe();
                    const mentionPatterns = [
                        `@${me.username}`,
                        '@here',
                        '@channel',
                        '@all',
                    ];
                    const hasMention = mentionPatterns.some((p) =>
                        rawPost.message.toLowerCase().includes(p.toLowerCase()),
                    );
                    if (hasMention && rawPost.user_id !== me.id) {
                        const channelName = data.channel_display_name || 'a channel';
                        vscode.window.showInformationMessage(
                            `💬 @${username} mentioned you in ${channelName}: ${rawPost.message.substring(0, 100)}${rawPost.message.length > 100 ? '…' : ''}`,
                            'Open Channel',
                        ).then((action) => {
                            if (action === 'Open Channel') {
                                this._panel.webview.postMessage({
                                    type: 'openChannel',
                                    channelId: rawPost.channel_id,
                                    channelName: data.channel_display_name,
                                });
                            }
                        });
                    }
                } catch { /* ignore notification errors */ }
            } catch (e) {
                this._outputChannel.appendLine(`[MM WS] Error handling posted event: ${e}`);
            }
        });

        // Post edited → relay
        ws.onPostEdited(async (evt) => {
            if (!this._mattermostService) { return; }
            try {
                const rawStr = evt.data.post as string;
                const rawPost = JSON.parse(rawStr) as {
                    id: string; channel_id: string; user_id: string; message: string;
                    create_at: number; update_at: number; delete_at: number;
                    root_id: string; type: string; props: Record<string, unknown>;
                    is_pinned?: boolean;
                    file_ids?: string[];
                };
                const username = await this._mattermostService.resolveUsername(rawPost.user_id);

                // Resolve file attachments if present
                let files: import('./mattermostService').MattermostFileInfoData[] | undefined;
                if (rawPost.file_ids && rawPost.file_ids.length > 0) {
                    try {
                        files = await this._mattermostService.resolveFileInfos(rawPost.file_ids);
                    } catch { /* ignore */ }
                }

                const postData: MattermostPostData = {
                    id: rawPost.id,
                    channelId: rawPost.channel_id,
                    userId: rawPost.user_id,
                    username,
                    message: rawPost.message,
                    createAt: new Date(rawPost.create_at).toISOString(),
                    updateAt: new Date(rawPost.update_at).toISOString(),
                    rootId: rawPost.root_id,
                    type: rawPost.type,
                    isPinned: rawPost.is_pinned ?? false,
                    files: files && files.length > 0 ? files : undefined,
                };
                this._panel.webview.postMessage({ type: 'mattermostPostEdited', post: postData });
            } catch (e) {
                this._outputChannel.appendLine(`[MM WS] Error handling post_edited event: ${e}`);
            }
        });

        // Post deleted → relay
        ws.onPostDeleted((evt) => {
            try {
                const rawStr = evt.data.post as string;
                const rawPost = JSON.parse(rawStr) as { id: string; channel_id: string };
                this._panel.webview.postMessage({
                    type: 'mattermostPostDeleted',
                    postId: rawPost.id,
                    channelId: rawPost.channel_id,
                });
            } catch (e) {
                this._outputChannel.appendLine(`[MM WS] Error handling post_deleted event: ${e}`);
            }
        });

        // Typing indicator
        ws.onTyping(async (evt) => {
            const data = evt.data as unknown as MmWsTypingData;
            let username = data.user_id;
            try {
                if (this._mattermostService) {
                    username = await this._mattermostService.resolveUsername(data.user_id);
                }
            } catch { /* fallback to userId */ }
            this._panel.webview.postMessage({
                type: 'mattermostTyping',
                userId: data.user_id,
                username,
                channelId: evt.broadcast.channel_id,
                parentId: data.parent_id,
            });
        });

        // User status change (online/away/offline/dnd)
        ws.onStatusChange((evt) => {
            const data = evt.data as unknown as MmWsStatusChangeData;
            this._panel.webview.postMessage({
                type: 'mattermostStatusChange',
                userId: data.user_id,
                status: data.status,
            });
        });

        // Reaction added
        ws.onReactionAdded(async (evt) => {
            if (!this._mattermostService) { return; }
            try {
                const data = evt.data as unknown as MmWsReactionData;
                const raw = JSON.parse(data.reaction) as {
                    user_id: string; post_id: string; emoji_name: string;
                };
                const username = await this._mattermostService.resolveUsername(raw.user_id);
                this._panel.webview.postMessage({
                    type: 'mattermostReactionAdded',
                    reaction: {
                        userId: raw.user_id,
                        postId: raw.post_id,
                        emojiName: raw.emoji_name,
                        username,
                    },
                });
            } catch (e) {
                this._outputChannel.appendLine(`[MM WS] Error handling reaction_added: ${e}`);
            }
        });

        // Reaction removed
        ws.onReactionRemoved(async (evt) => {
            if (!this._mattermostService) { return; }
            try {
                const data = evt.data as unknown as MmWsReactionData;
                const raw = JSON.parse(data.reaction) as {
                    user_id: string; post_id: string; emoji_name: string;
                };
                const username = await this._mattermostService.resolveUsername(raw.user_id);
                this._panel.webview.postMessage({
                    type: 'mattermostReactionRemoved',
                    reaction: {
                        userId: raw.user_id,
                        postId: raw.post_id,
                        emojiName: raw.emoji_name,
                        username,
                    },
                });
            } catch (e) {
                this._outputChannel.appendLine(`[MM WS] Error handling reaction_removed: ${e}`);
            }
        });

        // Start the connection
        ws.connect(serverUrl, token);
    }

    /** Build the shell HTML that loads the bundled React app + Tailwind CSS. */
    private _getHtml(): string {
        const webview = this._panel.webview;
        const nonce = _getNonce();

        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js'),
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.css'),
        );

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; img-src https: http: data: ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src https: http:;">
    <link rel="stylesheet" href="${styleUri}">
    <title>Superprompt Forge</title>
</head>
<body>
    <div id="root"></div>
    <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
    }

    private _dispose(): void {
        StashPanel._instance = undefined;

        // Disconnect Mattermost WebSocket
        if (this._mmWebSocket) {
            this._mmWebSocket.disconnect();
            this._mmWebSocket.dispose();
            this._mmWebSocket = undefined;
        }

        this._panel.dispose();
        for (const d of this._disposables) {
            d.dispose();
        }
        this._disposables = [];
    }
}

function _getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 32; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}
