import * as vscode from 'vscode';
import { GitService } from './gitService';
import { StashItem, StashFileItem } from './stashItem';
import { getConfig } from './utils';

export class StashProvider implements vscode.TreeDataProvider<StashItem | StashFileItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<StashItem | StashFileItem | undefined | null | void> = new vscode.EventEmitter<StashItem | StashFileItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<StashItem | StashFileItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private _treeView?: vscode.TreeView<StashItem | StashFileItem>;
    private _refreshTimer?: ReturnType<typeof setTimeout>;
    private _isRefreshing = false;

    private static readonly DEBOUNCE_MS = 300;

    constructor(
        private gitService: GitService,
        private _outputChannel?: vscode.OutputChannel
    ) {}

    /**
     * Set the tree view reference so we can update badge/title.
     * Called after createTreeView() in extension.ts.
     */
    setTreeView(treeView: vscode.TreeView<StashItem | StashFileItem>): void {
        this._treeView = treeView;
    }

    /**
     * Debounced refresh — coalesces rapid-fire events into a single refresh.
     * The _isRefreshing guard prevents overlapping getChildren() calls.
     */
    refresh(reason: string = 'manual'): void {
        this._outputChannel?.appendLine(`[REFRESH] triggered by: ${reason}`);

        if (this._refreshTimer) {
            clearTimeout(this._refreshTimer);
        }

        this._refreshTimer = setTimeout(() => {
            this._refreshTimer = undefined;
            this._onDidChangeTreeData.fire();
        }, StashProvider.DEBOUNCE_MS);
    }

    getTreeItem(element: StashItem | StashFileItem): vscode.TreeItem {
        return element;
    }

    /**
     * Lazy-load stats into StashItem tooltip when the user hovers.
     */
    async resolveTreeItem(
        item: vscode.TreeItem,
        element: StashItem | StashFileItem,
        _token: vscode.CancellationToken
    ): Promise<vscode.TreeItem> {
        if (element instanceof StashItem && !element.stashEntry.stats) {
            try {
                const stats = await this.gitService.getStashStats(element.stashEntry.index);
                if (stats) {
                    element.stashEntry.stats = stats;
                    element.updateTooltipWithStats();
                }
            } catch {
                // Stats are optional — silently ignore failures
            }
        }
        return item;
    }

    async getChildren(element?: StashItem | StashFileItem): Promise<(StashItem | StashFileItem)[]> {
        // 1c-v: No toasts — let welcome view handle messaging via context keys
        // TODO: multi-root — group stashes by workspace folder, add RepoItem parent level
        if (!vscode.workspace.workspaceFolders) {
            await vscode.commands.executeCommand('setContext', 'mystash.isGitRepo', false);
            await vscode.commands.executeCommand('setContext', 'mystash.hasStashes', false);
            return [];
        }

        const isGitRepo = await this.gitService.isGitRepository();
        await vscode.commands.executeCommand('setContext', 'mystash.isGitRepo', isGitRepo);
        if (!isGitRepo) {
            await vscode.commands.executeCommand('setContext', 'mystash.hasStashes', false);
            return [];
        }

        if (element instanceof StashItem) {
            // Return files for this stash
            try {
                const showStatus = getConfig<boolean>('showFileStatus', true);
                if (showStatus) {
                    const entries = await this.gitService.getStashFilesWithStatus(element.stashEntry.index);
                    return entries.map(entry => new StashFileItem(entry.path, element.stashEntry.index, entry.status));
                } else {
                    const files = await this.gitService.getStashFiles(element.stashEntry.index);
                    return files.map(file => new StashFileItem(file, element.stashEntry.index));
                }
            } catch {
                return [];
            }
        }

        // 1c-vi: Guard against overlapping root-level refreshes
        if (this._isRefreshing) {
            return [];
        }
        this._isRefreshing = true;

        try {
            const stashes = await this.gitService.getStashList();
            const hasStashes = stashes.length > 0;
            await vscode.commands.executeCommand('setContext', 'mystash.hasStashes', hasStashes);

            // 1d-v: Update badge with stash count
            // 1d-vi: Dynamic title
            if (this._treeView) {
                this._treeView.badge = hasStashes
                    ? { value: stashes.length, tooltip: `${stashes.length} stash${stashes.length !== 1 ? 'es' : ''}` }
                    : undefined;
                this._treeView.title = hasStashes
                    ? `Git Stashes (${stashes.length})`
                    : 'Git Stashes';
            }

            return stashes.map(stash => new StashItem(stash, vscode.TreeItemCollapsibleState.Collapsed));
        } finally {
            this._isRefreshing = false;
        }
    }
}
