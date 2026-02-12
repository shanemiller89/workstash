import * as vscode from 'vscode';
import { GitService, StashEntry, StashFileEntry } from './gitService';
import { formatRelativeTime } from './utils';

/**
 * Manages the MyStash webview panel — a rich, interactive stash explorer
 * that opens as an editor tab, powered by a React + Zustand + Tailwind UI.
 */
export class StashPanel {
    public static readonly viewType = 'mystash.panel';

    private static _instance: StashPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _gitService: GitService;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _isReady = false;

    public static createOrShow(
        extensionUri: vscode.Uri,
        gitService: GitService
    ): StashPanel {
        const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

        if (StashPanel._instance) {
            StashPanel._instance._panel.reveal(column);
            StashPanel._instance._refresh();
            return StashPanel._instance;
        }

        const panel = vscode.window.createWebviewPanel(
            StashPanel.viewType,
            'MyStash',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'dist'),
                ],
            }
        );

        StashPanel._instance = new StashPanel(panel, extensionUri, gitService);
        return StashPanel._instance;
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        gitService: GitService
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._gitService = gitService;

        this._panel.iconPath = new vscode.ThemeIcon('archive');
        this._panel.webview.html = this._getHtml();

        // Handle messages from the React webview
        this._panel.webview.onDidReceiveMessage(
            async (msg) => this._handleMessage(msg),
            null,
            this._disposables
        );

        this._panel.onDidDispose(() => this._dispose(), null, this._disposables);
    }

    /** Gather stash data and post it to the webview as a single message. */
    private async _refresh(): Promise<void> {
        // Tell webview we're loading
        this._panel.webview.postMessage({ type: 'loading' });

        try {
            const stashes = await this._gitService.getStashList();
            const payload = await this._buildPayload(stashes);
            this._panel.webview.postMessage({ type: 'stashData', payload });
        } catch {
            this._panel.webview.postMessage({ type: 'stashData', payload: [] });
        }
    }

    private async _buildPayload(stashes: StashEntry[]): Promise<unknown[]> {
        const result: unknown[] = [];

        for (const entry of stashes) {
            let files: StashFileEntry[] = [];
            try {
                files = await this._gitService.getStashFilesWithStatus(entry.index);
            } catch { /* non-critical */ }

            try {
                const stats = await this._gitService.getStashStats(entry.index);
                if (stats) { entry.stats = stats; }
            } catch { /* optional */ }

            result.push({
                index: entry.index,
                name: entry.name,
                branch: entry.branch,
                message: entry.message,
                date: entry.date.toISOString(),
                relativeDate: formatRelativeTime(entry.date),
                stats: entry.stats,
                files: files.map(f => ({ path: f.path, status: f.status })),
            });
        }
        return result;
    }

    private async _handleMessage(msg: {
        type: string;
        index?: number;
        filePath?: string;
    }): Promise<void> {
        switch (msg.type) {
            case 'ready':
                this._isReady = true;
                await this._refresh();
                break;

            case 'refresh':
                await this._refresh();
                break;

            case 'apply':
                if (msg.index !== undefined) {
                    try {
                        await this._gitService.applyStash(msg.index);
                        vscode.window.showInformationMessage(`Applied stash@{${msg.index}}`);
                        await this._refresh();
                    } catch (e: unknown) {
                        const m = e instanceof Error ? e.message : 'Unknown error';
                        vscode.window.showErrorMessage(`Failed to apply: ${m}`);
                    }
                }
                break;

            case 'pop':
                if (msg.index !== undefined) {
                    try {
                        await this._gitService.popStash(msg.index);
                        vscode.window.showInformationMessage(`Popped stash@{${msg.index}}`);
                        await this._refresh();
                    } catch (e: unknown) {
                        const m = e instanceof Error ? e.message : 'Unknown error';
                        vscode.window.showErrorMessage(`Failed to pop: ${m}`);
                    }
                }
                break;

            case 'drop':
                if (msg.index !== undefined) {
                    const confirm = await vscode.window.showWarningMessage(
                        `Drop stash@{${msg.index}}? This cannot be undone.`,
                        { modal: true },
                        'Yes',
                        'No'
                    );
                    if (confirm === 'Yes') {
                        try {
                            await this._gitService.dropStash(msg.index);
                            vscode.window.showInformationMessage(
                                `Dropped stash@{${msg.index}}`
                            );
                            await this._refresh();
                        } catch (e: unknown) {
                            const m = e instanceof Error ? e.message : 'Unknown error';
                            vscode.window.showErrorMessage(`Failed to drop: ${m}`);
                        }
                    }
                }
                break;

            case 'showFile':
                if (msg.index !== undefined && msg.filePath) {
                    const fileName = msg.filePath.split('/').pop() ?? msg.filePath;
                    const parentUri = vscode.Uri.parse(
                        `mystash:/${msg.filePath}?ref=parent&index=${msg.index}`
                    );
                    const stashUri = vscode.Uri.parse(
                        `mystash:/${msg.filePath}?ref=stash&index=${msg.index}`
                    );
                    try {
                        await vscode.commands.executeCommand(
                            'vscode.diff',
                            parentUri,
                            stashUri,
                            `${fileName} (stash@{${msg.index}})`,
                            { preview: true }
                        );
                    } catch (e: unknown) {
                        const m = e instanceof Error ? e.message : 'Unknown error';
                        vscode.window.showErrorMessage(`Failed to show diff: ${m}`);
                    }
                }
                break;

            case 'createStash':
                await vscode.commands.executeCommand('mystash.stash');
                await this._refresh();
                break;

            case 'clearStashes':
                await vscode.commands.executeCommand('mystash.clear');
                await this._refresh();
                break;
        }
    }

    /** Build the shell HTML that loads the bundled React app + Tailwind CSS. */
    private _getHtml(): string {
        const webview = this._panel.webview;
        const nonce = _getNonce();

        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.css')
        );

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <link rel="stylesheet" href="${styleUri}">
    <title>MyStash</title>
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
