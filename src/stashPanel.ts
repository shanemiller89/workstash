import * as vscode from 'vscode';
import { GitService, StashEntry, StashFileEntry } from './gitService';
import { AuthService } from './authService';
import { GistService } from './gistService';
import { PrService } from './prService';
import { IssueService } from './issueService';
import { formatRelativeTime, getConfig } from './utils';

/**
 * Manages the Workstash webview panel — a rich, interactive stash explorer
 * that opens as an editor tab, powered by a React + Zustand + Tailwind UI.
 */
export class StashPanel {
    public static readonly viewType = 'mystash.panel';

    private static _instance: StashPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _gitService: GitService;
    private readonly _authService: AuthService | undefined;
    private readonly _gistService: GistService | undefined;
    private readonly _prService: PrService | undefined;
    private readonly _issueService: IssueService | undefined;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _isReady = false;

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

    public static createOrShow(
        extensionUri: vscode.Uri,
        gitService: GitService,
        authService?: AuthService,
        gistService?: GistService,
        prService?: PrService,
        issueService?: IssueService,
    ): StashPanel {
        const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

        if (StashPanel._instance) {
            StashPanel._instance._panel.reveal(column);
            StashPanel._instance._refresh();
            return StashPanel._instance;
        }

        const panel = vscode.window.createWebviewPanel(StashPanel.viewType, 'Workstash', column, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
        });

        StashPanel._instance = new StashPanel(
            panel,
            extensionUri,
            gitService,
            authService,
            gistService,
            prService,
            issueService,
        );
        return StashPanel._instance;
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        gitService: GitService,
        authService?: AuthService,
        gistService?: GistService,
        prService?: PrService,
        issueService?: IssueService,
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._gitService = gitService;
        this._authService = authService;
        this._gistService = gistService;
        this._prService = prService;
        this._issueService = issueService;

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
        if (this._isReady) {
            this._panel.webview.postMessage({ type: 'openNote', noteId });
        }
    }

    /** Deep-link: switch to PRs tab and select a specific PR. */
    public openPR(prNumber: number): void {
        if (this._isReady) {
            this._panel.webview.postMessage({ type: 'openPR', prNumber });
        }
    }

    /** Deep-link: switch to Issues tab and select a specific issue. */
    public openIssue(issueNumber: number): void {
        if (this._isReady) {
            this._panel.webview.postMessage({ type: 'openIssue', issueNumber });
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
            this._panel.title = stashes.length > 0 ? `Workstash (${stashes.length})` : 'Workstash';
        } catch {
            this._panel.webview.postMessage({ type: 'stashData', payload: [] });
            this._panel.title = 'Workstash';
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
    }): Promise<void> {
        switch (msg.type) {
            case 'ready':
                this._isReady = true;
                await this._refresh();
                await this._sendAuthStatus();
                await this._refreshNotes();
                await this._refreshPRs();
                await this._refreshIssues();
                break;

            case 'refresh':
                await this._refresh();
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
                        `mystash:/${msg.filePath}?ref=parent&index=${msg.index}`,
                    );
                    const stashUri = vscode.Uri.parse(
                        `mystash:/${msg.filePath}?ref=stash&index=${msg.index}`,
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
                await vscode.commands.executeCommand('mystash.stash');
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
                await vscode.commands.executeCommand('mystash.clear');
                await this._refresh();
                break;

            // ─── Notes messages from webview ───

            case 'notes.signIn':
                await vscode.commands.executeCommand('workstash.notes.signIn');
                await this._sendAuthStatus();
                await this._refreshNotes();
                break;

            case 'notes.signOut':
                await vscode.commands.executeCommand('workstash.notes.signOut');
                await this._sendAuthStatus();
                break;

            case 'notes.refresh':
                await this._refreshNotes();
                break;

            case 'notes.create':
                if (msg.title && this._gistService) {
                    try {
                        this._panel.webview.postMessage({ type: 'notesLoading' });
                        const note = await this._gistService.createNote(
                            msg.title,
                            msg.content ?? '',
                            msg.isPublic ?? false,
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

            // ─── PR messages from webview ───

            case 'prs.refresh':
                await this._refreshPRs();
                break;

            case 'prs.signIn':
                await vscode.commands.executeCommand('workstash.prs.signIn');
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
                        const repoInfo = await this._gitService.getGitHubRepo();
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
                        const repoInfo = await this._gitService.getGitHubRepo();
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
                    const repoInfo = await this._gitService.getGitHubRepo();
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
                        const repoInfo = await this._gitService.getGitHubRepo();
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
                        const repoInfo = await this._gitService.getGitHubRepo();
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
                        const repoInfo = await this._gitService.getGitHubRepo();
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
                await vscode.commands.executeCommand('workstash.issues.signIn');
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
                        const repoInfo = await this._gitService.getGitHubRepo();
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
                        const repoInfo = await this._gitService.getGitHubRepo();
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
                        const repoInfo = await this._gitService.getGitHubRepo();
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
                    const repoInfo = await this._gitService.getGitHubRepo();
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
        }
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

            const repoInfo = await this._gitService.getGitHubRepo();
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
            const repoInfo = await this._gitService.getGitHubRepo();
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

            const repoInfo = await this._gitService.getGitHubRepo();
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
            const repoInfo = await this._gitService.getGitHubRepo();
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
        content="default-src 'none'; img-src https://avatars.githubusercontent.com ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <link rel="stylesheet" href="${styleUri}">
    <title>Workstash</title>
</head>
<body>
    <div id="root"></div>
    <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
    }

    private _dispose(): void {
        StashPanel._instance = undefined;
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
