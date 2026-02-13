import * as vscode from 'vscode';
import { IssueService, Issue, IssueState } from './issueService';
import { GitService } from './gitService';
import { AuthService } from './authService';
import { IssueItem } from './issueItem';

/**
 * TreeDataProvider for the Issues sidebar tree view.
 * Flat list (no children) — each IssueItem is a root element.
 * Follows the same debounce/visibility/search pattern as PrProvider.
 */
export class IssueProvider implements vscode.TreeDataProvider<IssueItem>, vscode.Disposable {
    private _onDidChangeTreeData = new vscode.EventEmitter<IssueItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<IssueItem | undefined | null | void> =
        this._onDidChangeTreeData.event;

    private _treeView?: vscode.TreeView<IssueItem>;
    private _refreshTimer?: ReturnType<typeof setTimeout>;
    private _isRefreshing = false;
    private _cachedIssues: Issue[] = [];

    // Filter state
    private _stateFilter: IssueState | 'all' = 'open';
    private _searchQuery = '';

    // Repo info — resolved once
    private _owner?: string;
    private _repo?: string;

    // Visibility-gated refresh
    private _isVisible = true;
    private _pendingRefreshReason?: string;

    private static readonly DEBOUNCE_MS = 300;

    constructor(
        private readonly _issueService: IssueService,
        private readonly _gitService: GitService,
        private readonly _authService: AuthService,
        private readonly _outputChannel?: vscode.OutputChannel,
    ) {}

    // ─── Tree View Binding ────────────────────────────────────────

    setTreeView(treeView: vscode.TreeView<IssueItem>): void {
        this._treeView = treeView;

        treeView.onDidChangeVisibility((e) => {
            this._isVisible = e.visible;
            if (e.visible && this._pendingRefreshReason) {
                this._outputChannel?.appendLine(
                    `[Issues REFRESH] flushing deferred: ${this._pendingRefreshReason}`,
                );
                const reason = this._pendingRefreshReason;
                this._pendingRefreshReason = undefined;
                this.refresh(reason);
            }
        });
    }

    // ─── Filter ───────────────────────────────────────────────────

    setStateFilter(state: IssueState | 'all'): void {
        this._stateFilter = state;
        this._onDidChangeTreeData.fire();
    }

    get stateFilter(): IssueState | 'all' {
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
        this._outputChannel?.appendLine(`[Issues REFRESH] triggered by: ${reason}`);

        if (!this._isVisible && reason !== 'manual') {
            this._pendingRefreshReason = reason;
            this._outputChannel?.appendLine(`[Issues REFRESH] deferred (tree hidden)`);
            return;
        }

        if (this._refreshTimer) {
            clearTimeout(this._refreshTimer);
        }

        this._refreshTimer = setTimeout(() => {
            this._refreshTimer = undefined;
            this._onDidChangeTreeData.fire();
        }, IssueProvider.DEBOUNCE_MS);
    }

    /** Force re-resolve repo info (e.g. if workspace changes) */
    clearRepoCache(): void {
        this._owner = undefined;
        this._repo = undefined;
    }

    // ─── TreeDataProvider ─────────────────────────────────────────

    getTreeItem(element: IssueItem): vscode.TreeItem {
        return element;
    }

    async getChildren(_element?: IssueItem): Promise<IssueItem[]> {
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
            await vscode.commands.executeCommand('setContext', 'workstash.isAuthenticated', isAuth);

            if (!isAuth) {
                await vscode.commands.executeCommand('setContext', 'workstash.hasIssues', false);
                this._cachedIssues = [];
                this._updateTreeChrome(0);
                return [];
            }

            // Resolve repo info if not yet cached
            if (!this._owner || !this._repo) {
                const ghRepo = await this._gitService.getGitHubRepo();
                if (!ghRepo) {
                    await vscode.commands.executeCommand('setContext', 'workstash.hasIssues', false);
                    this._cachedIssues = [];
                    this._updateTreeChrome(0);
                    return [];
                }
                this._owner = ghRepo.owner;
                this._repo = ghRepo.repo;
            }

            // Fetch issues
            const issues = await this._issueService.listIssues(
                this._owner,
                this._repo,
                this._stateFilter,
            );
            this._cachedIssues = issues;

            const hasIssues = issues.length > 0;
            await vscode.commands.executeCommand('setContext', 'workstash.hasIssues', hasIssues);

            // Filter by search query
            const query = this._searchQuery.trim().toLowerCase();
            const filtered = query
                ? issues.filter(
                      (issue) =>
                          issue.title.toLowerCase().includes(query) ||
                          `#${issue.number}`.includes(query) ||
                          issue.labels.some((l) => l.name.toLowerCase().includes(query)),
                  )
                : issues;

            this._updateTreeChrome(issues.length, filtered.length, query);

            return filtered.map((issue) => new IssueItem(issue, query || undefined));
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            this._outputChannel?.appendLine(`[Issues] Error fetching issues: ${msg}`);
            this._updateTreeChrome(0);
            return [];
        } finally {
            this._isRefreshing = false;
        }
    }

    /** Get cached issues for use by other components (e.g. webview). */
    getCachedIssues(): Issue[] {
        return this._cachedIssues;
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
                ? { value: total, tooltip: `${total} issue${total !== 1 ? 's' : ''}` }
                : undefined;

        // Title
        const stateLabel = this._stateFilter === 'all' ? '' : ` — ${this._stateFilter}`;
        this._treeView.title = total > 0
            ? `Issues (${total})${stateLabel}`
            : `Issues${stateLabel}`;

        // Message
        if (query && filteredCount !== undefined) {
            this._treeView.message = `$(search) Showing ${filteredCount} of ${total} issues matching "${this._searchQuery}"`;
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
