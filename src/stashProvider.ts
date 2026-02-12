import * as vscode from 'vscode';
import { GitService } from './gitService';
import { StashItem, StashFileItem } from './stashItem';
import { StashPanel } from './stashPanel';
import { getConfig } from './utils';

export class StashProvider implements vscode.TreeDataProvider<StashItem | StashFileItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<
        StashItem | StashFileItem | undefined | null | void
    > = new vscode.EventEmitter<StashItem | StashFileItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<
        StashItem | StashFileItem | undefined | null | void
    > = this._onDidChangeTreeData.event;

    private _treeView?: vscode.TreeView<StashItem | StashFileItem>;
    private _statusBarItem?: vscode.StatusBarItem;
    private _refreshTimer?: ReturnType<typeof setTimeout>;
    private _isRefreshing = false;

    // Visibility-gated refresh: defer refreshes when tree is hidden
    private _isVisible = true;
    private _pendingRefreshReason?: string;

    // Expand/collapse persistence: track which stash IDs are expanded
    private _expandedIds = new Set<string>();

    // Search/filter state
    private _searchQuery = '';

    // Cache parent mapping for getParent() support
    private _parentMap = new Map<string, StashItem>();

    // Last-known stash count for message banner
    private _lastMessage = '';

    private static readonly DEBOUNCE_MS = 300;

    constructor(
        private gitService: GitService,
        private _outputChannel?: vscode.OutputChannel,
    ) {}

    /**
     * 9b-i: Set the status bar item reference so we can update it on refresh.
     */
    setStatusBarItem(statusBarItem: vscode.StatusBarItem): void {
        this._statusBarItem = statusBarItem;
    }

    /**
     * Set the tree view reference so we can update badge/title/description/message.
     * Also wires up visibility and expand/collapse tracking.
     * Called after createTreeView() in extension.ts.
     */
    setTreeView(treeView: vscode.TreeView<StashItem | StashFileItem>): void {
        this._treeView = treeView;

        // Visibility-gated refresh: track when tree is shown/hidden
        treeView.onDidChangeVisibility((e) => {
            this._isVisible = e.visible;
            if (e.visible && this._pendingRefreshReason) {
                this._outputChannel?.appendLine(
                    `[REFRESH] flushing deferred refresh: ${this._pendingRefreshReason}`,
                );
                const reason = this._pendingRefreshReason;
                this._pendingRefreshReason = undefined;
                this.refresh(reason);
            }
        });

        // Expand/collapse persistence
        treeView.onDidExpandElement((e) => {
            if (e.element.id) {
                this._expandedIds.add(e.element.id);
            }
        });
        treeView.onDidCollapseElement((e) => {
            if (e.element.id) {
                this._expandedIds.delete(e.element.id);
            }
        });
    }

    // --- Search support ---

    /**
     * Set the search query to filter and highlight stash items.
     * Pass empty string to clear the search.
     */
    setSearchQuery(query: string): void {
        this._searchQuery = query;
        this._onDidChangeTreeData.fire();
    }

    get searchQuery(): string {
        return this._searchQuery;
    }

    /**
     * Set the tree view message banner.
     */
    setMessage(message: string): void {
        this._lastMessage = message;
        if (this._treeView) {
            this._treeView.message = message || undefined;
        }
    }

    /**
     * Debounced refresh — coalesces rapid-fire events into a single refresh.
     * When tree is hidden, defers the refresh until it becomes visible.
     * The _isRefreshing guard prevents overlapping getChildren() calls.
     */
    refresh(reason: string = 'manual'): void {
        this._outputChannel?.appendLine(`[REFRESH] triggered by: ${reason}`);

        // Visibility-gated: defer if tree is not visible (unless manual)
        if (!this._isVisible && reason !== 'manual') {
            this._pendingRefreshReason = reason;
            this._outputChannel?.appendLine(`[REFRESH] deferred (tree hidden)`);
            return;
        }

        if (this._refreshTimer) {
            clearTimeout(this._refreshTimer);
        }

        this._refreshTimer = setTimeout(() => {
            this._refreshTimer = undefined;
            this._onDidChangeTreeData.fire();
            // 8b-iii: Also refresh the webview panel if it's open
            StashPanel.refreshIfOpen();
        }, StashProvider.DEBOUNCE_MS);
    }

    getTreeItem(element: StashItem | StashFileItem): vscode.TreeItem {
        return element;
    }

    /**
     * Enable reveal() support by providing parent mapping.
     * StashFileItems belong to StashItems; StashItems have no parent (root).
     */
    getParent(element: StashItem | StashFileItem): StashItem | undefined {
        if (element instanceof StashFileItem && element.id) {
            return this._parentMap.get(element.id);
        }
        return undefined;
    }

    /**
     * Lazy-load stats into StashItem tooltip when the user hovers.
     */
    async resolveTreeItem(
        item: vscode.TreeItem,
        element: StashItem | StashFileItem,
        _token: vscode.CancellationToken,
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
                let fileItems: StashFileItem[];
                if (showStatus) {
                    const entries = await this.gitService.getStashFilesWithStatus(
                        element.stashEntry.index,
                    );
                    fileItems = entries.map(
                        (entry) =>
                            new StashFileItem(entry.path, element.stashEntry.index, entry.status),
                    );
                } else {
                    const files = await this.gitService.getStashFiles(element.stashEntry.index);
                    fileItems = files.map(
                        (file) => new StashFileItem(file, element.stashEntry.index),
                    );
                }
                // Cache parent mapping for getParent()
                for (const fi of fileItems) {
                    if (fi.id) {
                        this._parentMap.set(fi.id, element);
                    }
                }
                return fileItems;
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

            // 9a-iii: Sort order — git returns newest-first by default
            const sortOrder = getConfig<string>('sortOrder', 'newest');
            if (sortOrder === 'oldest') {
                stashes.reverse();
            }

            // Filter by search query if active
            const query = this._searchQuery.trim().toLowerCase();
            const filtered = query
                ? stashes.filter(
                      (s) =>
                          s.message.toLowerCase().includes(query) ||
                          s.branch.toLowerCase().includes(query) ||
                          s.name.toLowerCase().includes(query),
                  )
                : stashes;

            // Update tree view chrome
            if (this._treeView) {
                // Badge
                this._treeView.badge = hasStashes
                    ? {
                          value: stashes.length,
                          tooltip: `${stashes.length} stash${stashes.length !== 1 ? 'es' : ''}`,
                      }
                    : undefined;

                // Title
                this._treeView.title = hasStashes
                    ? `Git Stashes (${stashes.length})`
                    : 'Git Stashes';

                // Description: current branch
                const branch = await this.gitService.getCurrentBranch();
                this._treeView.description = branch ? `on ${branch}` : undefined;

                // Search indicator in message
                if (query) {
                    this._treeView.message = `$(search) Showing ${filtered.length} of ${stashes.length} stashes matching "${this._searchQuery}"`;
                } else if (this._lastMessage) {
                    this._treeView.message = this._lastMessage;
                } else {
                    this._treeView.message = undefined;
                }
            }

            // 9b-i: Update status bar item
            if (this._statusBarItem) {
                if (hasStashes) {
                    this._statusBarItem.text = `$(archive) ${stashes.length}`;
                    this._statusBarItem.tooltip = `Workstash — ${stashes.length} stash${stashes.length !== 1 ? 'es' : ''}`;
                    this._statusBarItem.show();
                } else {
                    this._statusBarItem.hide();
                }
            }

            // Build items with expand persistence and search highlights
            return filtered.map((stash) => {
                const itemId = `stash-${stash.index}`;
                const wasExpanded = this._expandedIds.has(itemId);
                return new StashItem(
                    stash,
                    wasExpanded
                        ? vscode.TreeItemCollapsibleState.Expanded
                        : vscode.TreeItemCollapsibleState.Collapsed,
                    query || undefined,
                );
            });
        } finally {
            this._isRefreshing = false;
        }
    }
}

// --- FileDecorationProvider for mystash-file: URIs ---

/**
 * Provides SCM-style colored letter badges on StashFileItems.
 * Registered for the `mystash-file` URI scheme.
 */
export class StashFileDecorationProvider implements vscode.FileDecorationProvider {
    private _onDidChangeFileDecorations = new vscode.EventEmitter<
        vscode.Uri | vscode.Uri[] | undefined
    >();
    readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

    provideFileDecoration(
        uri: vscode.Uri,
        _token: vscode.CancellationToken,
    ): vscode.FileDecoration | undefined {
        if (uri.scheme !== 'mystash-file') {
            return undefined;
        }

        const params = new URLSearchParams(uri.query);
        const status = params.get('status');
        if (!status) {
            return undefined;
        }

        switch (status) {
            case 'M':
                return new vscode.FileDecoration(
                    'M',
                    'Modified',
                    new vscode.ThemeColor('gitDecoration.modifiedResourceForeground'),
                );
            case 'A':
                return new vscode.FileDecoration(
                    'A',
                    'Added',
                    new vscode.ThemeColor('gitDecoration.untrackedResourceForeground'),
                );
            case 'D':
                return new vscode.FileDecoration(
                    'D',
                    'Deleted',
                    new vscode.ThemeColor('gitDecoration.deletedResourceForeground'),
                );
            case 'R':
                return new vscode.FileDecoration(
                    'R',
                    'Renamed',
                    new vscode.ThemeColor('gitDecoration.renamedResourceForeground'),
                );
            case 'C':
                return new vscode.FileDecoration(
                    'C',
                    'Copied',
                    new vscode.ThemeColor('gitDecoration.addedResourceForeground'),
                );
            default:
                return undefined;
        }
    }
}

// --- Drag and Drop Controller ---

/**
 * Enables dragging stash files into the editor (opens diff) and
 * visual stash reordering within the tree.
 */
export class StashDragAndDropController implements vscode.TreeDragAndDropController<
    StashItem | StashFileItem
> {
    // Accept drops from our own tree
    readonly dropMimeTypes = ['application/vnd.code.tree.mystashview'];
    // Provide text/uri-list for dragging into editor, and our own tree mime
    readonly dragMimeTypes = ['text/uri-list', 'application/vnd.code.tree.mystashview'];

    constructor(private _outputChannel?: vscode.OutputChannel) {}

    handleDrag(
        source: readonly (StashItem | StashFileItem)[],
        dataTransfer: vscode.DataTransfer,
        _token: vscode.CancellationToken,
    ): void {
        // For file items, provide text/uri-list so they can be dragged into the editor
        const fileItems = source.filter((s): s is StashFileItem => s instanceof StashFileItem);
        if (fileItems.length > 0) {
            const uris = fileItems.map((fi) => {
                // Build mystash: URI that will open in the diff viewer
                return `mystash:///${fi.filePath}?ref=stash&index=${fi.stashIndex}`;
            });
            dataTransfer.set('text/uri-list', new vscode.DataTransferItem(uris.join('\r\n')));
        }

        // Serialize source for internal tree reorder
        const stashItems = source.filter((s): s is StashItem => s instanceof StashItem);
        if (stashItems.length > 0) {
            const indices = stashItems.map((s) => s.stashEntry.index);
            dataTransfer.set(
                'application/vnd.code.tree.mystashview',
                new vscode.DataTransferItem(JSON.stringify(indices)),
            );
        }
    }

    async handleDrop(
        target: StashItem | StashFileItem | undefined,
        dataTransfer: vscode.DataTransfer,
        _token: vscode.CancellationToken,
    ): Promise<void> {
        // Visual reorder feedback — git doesn't support true reorder,
        // but we log the intent for potential future implementation
        const treeData = dataTransfer.get('application/vnd.code.tree.mystashview');
        if (treeData && target instanceof StashItem) {
            const sourceIndices = JSON.parse(await treeData.asString()) as number[];
            this._outputChannel?.appendLine(
                `[DND] Stash reorder requested: indices [${sourceIndices}] → before stash@{${target.stashEntry.index}} (visual only, git does not support reorder)`,
            );
            // Note: True reorder would require pop+push sequence — risky, deferred to Phase 2
        }
    }
}
