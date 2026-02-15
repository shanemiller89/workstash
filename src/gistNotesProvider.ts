import * as vscode from 'vscode';
import { GistService, GistNote } from './gistService';
import { AuthService } from './authService';
import { GistNoteItem } from './gistNoteItem';

/**
 * TreeDataProvider for the Gist Notes sidebar tree view.
 * Flat list (no children) — each GistNoteItem is a root element.
 * Follows the same debounce/visibility/search pattern as StashProvider.
 */
export class GistNotesProvider implements vscode.TreeDataProvider<GistNoteItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<
        GistNoteItem | undefined | null | void
    >();
    readonly onDidChangeTreeData: vscode.Event<GistNoteItem | undefined | null | void> =
        this._onDidChangeTreeData.event;

    private _treeView?: vscode.TreeView<GistNoteItem>;
    private _refreshTimer?: ReturnType<typeof setTimeout>;
    private _isRefreshing = false;
    private _cachedNotes: GistNote[] = [];

    // Search/filter state
    private _searchQuery = '';

    // Visibility-gated refresh
    private _isVisible = true;
    private _pendingRefreshReason?: string;

    private static readonly DEBOUNCE_MS = 300;

    constructor(
        private readonly _gistService: GistService,
        private readonly _authService: AuthService,
        private readonly _outputChannel?: vscode.OutputChannel,
    ) {}

    // ─── Tree View Binding ────────────────────────────────────────

    setTreeView(treeView: vscode.TreeView<GistNoteItem>): void {
        this._treeView = treeView;

        // Visibility-gated refresh
        treeView.onDidChangeVisibility((e) => {
            this._isVisible = e.visible;
            if (e.visible && this._pendingRefreshReason) {
                this._outputChannel?.appendLine(
                    `[NOTES REFRESH] flushing deferred: ${this._pendingRefreshReason}`,
                );
                const reason = this._pendingRefreshReason;
                this._pendingRefreshReason = undefined;
                this.refresh(reason);
            }
        });
    }

    // ─── Search ───────────────────────────────────────────────────

    setSearchQuery(query: string): void {
        this._searchQuery = query;
        this._onDidChangeTreeData.fire();
    }

    get searchQuery(): string {
        return this._searchQuery;
    }

    // ─── Refresh ──────────────────────────────────────────────────

    refresh(reason: string = 'manual'): void {
        this._outputChannel?.appendLine(`[NOTES REFRESH] triggered by: ${reason}`);

        if (!this._isVisible && reason !== 'manual') {
            this._pendingRefreshReason = reason;
            this._outputChannel?.appendLine(`[NOTES REFRESH] deferred (tree hidden)`);
            return;
        }

        if (this._refreshTimer) {
            clearTimeout(this._refreshTimer);
        }

        this._refreshTimer = setTimeout(() => {
            this._refreshTimer = undefined;
            this._onDidChangeTreeData.fire();
        }, GistNotesProvider.DEBOUNCE_MS);
    }

    // ─── TreeDataProvider ─────────────────────────────────────────

    getTreeItem(element: GistNoteItem): vscode.TreeItem {
        return element;
    }

    async getChildren(_element?: GistNoteItem): Promise<GistNoteItem[]> {
        // Flat list — no children
        if (_element) {
            return [];
        }

        // Guard against overlapping refreshes
        if (this._isRefreshing) {
            return [];
        }
        this._isRefreshing = true;

        try {
            // Check auth status
            const isAuth = await this._authService.isAuthenticated();
            await vscode.commands.executeCommand('setContext', 'superprompt-forge.isAuthenticated', isAuth);

            if (!isAuth) {
                await vscode.commands.executeCommand('setContext', 'superprompt-forge.hasNotes', false);
                this._cachedNotes = [];
                this._updateTreeChrome(0);
                return [];
            }

            // Fetch notes
            const notes = await this._gistService.listNotes();
            this._cachedNotes = notes;

            const hasNotes = notes.length > 0;
            await vscode.commands.executeCommand('setContext', 'superprompt-forge.hasNotes', hasNotes);

            // Sort by updatedAt descending (most recent first)
            notes.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

            // Filter by search query
            const query = this._searchQuery.trim().toLowerCase();
            const filtered = query
                ? notes.filter(
                      (n) =>
                          n.title.toLowerCase().includes(query) ||
                          n.content.toLowerCase().includes(query),
                  )
                : notes;

            this._updateTreeChrome(notes.length, filtered.length, query);

            return filtered.map((note) => new GistNoteItem(note, query || undefined));
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            this._outputChannel?.appendLine(`[NOTES] Error fetching notes: ${msg}`);
            this._updateTreeChrome(0);
            return [];
        } finally {
            this._isRefreshing = false;
        }
    }

    /** Get cached notes for use by other components (e.g. webview). */
    getCachedNotes(): GistNote[] {
        return this._cachedNotes;
    }

    private _updateTreeChrome(total: number, filteredCount?: number, query?: string): void {
        if (!this._treeView) {
            return;
        }

        // Badge
        this._treeView.badge =
            total > 0
                ? { value: total, tooltip: `${total} note${total !== 1 ? 's' : ''}` }
                : undefined;

        // Title
        this._treeView.title = total > 0 ? `Gist Notes (${total})` : 'Gist Notes';

        // Message
        if (query && filteredCount !== undefined) {
            this._treeView.message = `$(search) Showing ${filteredCount} of ${total} notes matching "${this._searchQuery}"`;
        } else {
            this._treeView.message = undefined;
        }
    }

    /** Dispose resources — required for context.subscriptions. */
    dispose(): void {
        if (this._refreshTimer) {
            clearTimeout(this._refreshTimer);
        }
        this._onDidChangeTreeData.dispose();
    }
}
