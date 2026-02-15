import * as vscode from 'vscode';
import { PrService, PullRequest, PRState } from './prService';
import { GitService } from './gitService';
import { AuthService } from './authService';
import { PrItem } from './prItem';

/**
 * TreeDataProvider for the Pull Requests sidebar tree view.
 * Flat list (no children) — each PrItem is a root element.
 * Follows the same debounce/visibility/search pattern as GistNotesProvider.
 */
export class PrProvider implements vscode.TreeDataProvider<PrItem>, vscode.Disposable {
    private _onDidChangeTreeData = new vscode.EventEmitter<PrItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<PrItem | undefined | null | void> =
        this._onDidChangeTreeData.event;

    private _treeView?: vscode.TreeView<PrItem>;
    private _refreshTimer?: ReturnType<typeof setTimeout>;
    private _isRefreshing = false;
    private _cachedPRs: PullRequest[] = [];

    // Filter state
    private _stateFilter: PRState | 'all' = 'open';
    private _searchQuery = '';

    // Repo info — resolved once
    private _owner?: string;
    private _repo?: string;
    private _username?: string;

    // Visibility-gated refresh
    private _isVisible = true;
    private _pendingRefreshReason?: string;

    private static readonly DEBOUNCE_MS = 300;

    constructor(
        private readonly _prService: PrService,
        private readonly _gitService: GitService,
        private readonly _authService: AuthService,
        private readonly _outputChannel?: vscode.OutputChannel,
    ) {}

    // ─── Tree View Binding ────────────────────────────────────────

    setTreeView(treeView: vscode.TreeView<PrItem>): void {
        this._treeView = treeView;

        treeView.onDidChangeVisibility((e) => {
            this._isVisible = e.visible;
            if (e.visible && this._pendingRefreshReason) {
                this._outputChannel?.appendLine(
                    `[PR REFRESH] flushing deferred: ${this._pendingRefreshReason}`,
                );
                const reason = this._pendingRefreshReason;
                this._pendingRefreshReason = undefined;
                this.refresh(reason);
            }
        });
    }

    // ─── Filter ───────────────────────────────────────────────────

    setStateFilter(state: PRState | 'all'): void {
        this._stateFilter = state;
        this._onDidChangeTreeData.fire();
    }

    get stateFilter(): PRState | 'all' {
        return this._stateFilter;
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
        this._outputChannel?.appendLine(`[PR REFRESH] triggered by: ${reason}`);

        if (!this._isVisible && reason !== 'manual') {
            this._pendingRefreshReason = reason;
            this._outputChannel?.appendLine(`[PR REFRESH] deferred (tree hidden)`);
            return;
        }

        if (this._refreshTimer) {
            clearTimeout(this._refreshTimer);
        }

        this._refreshTimer = setTimeout(() => {
            this._refreshTimer = undefined;
            this._onDidChangeTreeData.fire();
        }, PrProvider.DEBOUNCE_MS);
    }

    /** Force re-resolve repo info (e.g. if workspace changes) */
    clearRepoCache(): void {
        this._owner = undefined;
        this._repo = undefined;
        this._username = undefined;
    }

    // ─── TreeDataProvider ─────────────────────────────────────────

    getTreeItem(element: PrItem): vscode.TreeItem {
        return element;
    }

    async getChildren(_element?: PrItem): Promise<PrItem[]> {
        // Flat list — no children
        if (_element) {
            return [];
        }

        if (this._isRefreshing) {
            return [];
        }
        this._isRefreshing = true;

        try {
            // Check auth status
            const isAuth = await this._authService.isAuthenticated();
            await vscode.commands.executeCommand('setContext', 'superprompt-forge.isAuthenticated', isAuth);

            if (!isAuth) {
                await vscode.commands.executeCommand('setContext', 'superprompt-forge.hasPRs', false);
                this._cachedPRs = [];
                this._updateTreeChrome(0);
                return [];
            }

            // Resolve repo info if not yet cached
            if (!this._owner || !this._repo) {
                const ghRepo = await this._gitService.getGitHubRepo();
                if (!ghRepo) {
                    await vscode.commands.executeCommand('setContext', 'superprompt-forge.hasPRs', false);
                    this._cachedPRs = [];
                    this._updateTreeChrome(0);
                    return [];
                }
                this._owner = ghRepo.owner;
                this._repo = ghRepo.repo;
            }

            // Resolve username for author filter
            if (!this._username) {
                try {
                    this._username = await this._prService.getAuthenticatedUser();
                } catch {
                    this._outputChannel?.appendLine('[PR] Failed to get username, skipping author filter');
                }
            }

            // Fetch PRs
            const prs = await this._prService.listPullRequests(
                this._owner,
                this._repo,
                this._stateFilter,
                this._username, // author filter — 'authored' only for now
            );
            this._cachedPRs = prs;

            const hasPRs = prs.length > 0;
            await vscode.commands.executeCommand('setContext', 'superprompt-forge.hasPRs', hasPRs);

            // Filter by search query
            const query = this._searchQuery.trim().toLowerCase();
            const filtered = query
                ? prs.filter(
                      (pr) =>
                          pr.title.toLowerCase().includes(query) ||
                          `#${pr.number}`.includes(query) ||
                          pr.branch.toLowerCase().includes(query),
                  )
                : prs;

            this._updateTreeChrome(prs.length, filtered.length, query);

            return filtered.map((pr) => new PrItem(pr, query || undefined));
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            this._outputChannel?.appendLine(`[PR] Error fetching PRs: ${msg}`);
            this._updateTreeChrome(0);
            return [];
        } finally {
            this._isRefreshing = false;
        }
    }

    /** Get cached PRs for use by other components (e.g. webview). */
    getCachedPRs(): PullRequest[] {
        return this._cachedPRs;
    }

    /** Get resolved repo info (may be undefined if not yet resolved). */
    getRepoInfo(): { owner: string; repo: string } | undefined {
        if (this._owner && this._repo) {
            return { owner: this._owner, repo: this._repo };
        }
        return undefined;
    }

    private _updateTreeChrome(total: number, filteredCount?: number, query?: string): void {
        if (!this._treeView) {
            return;
        }

        // Badge
        this._treeView.badge =
            total > 0
                ? { value: total, tooltip: `${total} pull request${total !== 1 ? 's' : ''}` }
                : undefined;

        // Title
        const stateLabel = this._stateFilter === 'all' ? '' : ` — ${this._stateFilter}`;
        this._treeView.title = total > 0
            ? `Pull Requests (${total})${stateLabel}`
            : `Pull Requests${stateLabel}`;

        // Message
        if (query && filteredCount !== undefined) {
            this._treeView.message = `$(search) Showing ${filteredCount} of ${total} PRs matching "${this._searchQuery}"`;
        } else {
            this._treeView.message = undefined;
        }
    }

    dispose(): void {
        if (this._refreshTimer) {
            clearTimeout(this._refreshTimer);
        }
        this._onDidChangeTreeData.dispose();
    }
}
