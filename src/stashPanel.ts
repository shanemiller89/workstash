import * as vscode from 'vscode';
import { GitService, StashEntry, StashFileEntry } from './gitService';
import { AuthService } from './authService';
import { GistService } from './gistService';
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
        );
        return StashPanel._instance;
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        gitService: GitService,
        authService?: AuthService,
        gistService?: GistService,
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._gitService = gitService;
        this._authService = authService;
        this._gistService = gistService;

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
    }): Promise<void> {
        switch (msg.type) {
            case 'ready':
                this._isReady = true;
                await this._refresh();
                await this._sendAuthStatus();
                await this._refreshNotes();
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
        content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
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
