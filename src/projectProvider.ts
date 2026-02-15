import * as vscode from 'vscode';
import { ProjectService, Project, ProjectItem, ProjectField } from './projectService';
import { GitService } from './gitService';
import { AuthService } from './authService';
import { ProjectItemTreeItem } from './projectItem';

/**
 * TreeDataProvider for the Projects sidebar tree view.
 * Flat list — each ProjectItemTreeItem is a root element.
 * Follows the same debounce/visibility/search pattern as IssueProvider.
 */
export class ProjectProvider implements vscode.TreeDataProvider<ProjectItemTreeItem>, vscode.Disposable {
    private _onDidChangeTreeData = new vscode.EventEmitter<ProjectItemTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ProjectItemTreeItem | undefined | null | void> =
        this._onDidChangeTreeData.event;

    private _treeView?: vscode.TreeView<ProjectItemTreeItem>;
    private _refreshTimer?: ReturnType<typeof setTimeout>;
    private _isRefreshing = false;

    // Discovered & selected project
    private _availableProjects: { id: string; number: number; title: string; closed: boolean; url: string }[] = [];
    private _selectedProject?: Project;
    private _cachedItems: ProjectItem[] = [];
    private _cachedFields: ProjectField[] = [];

    // Filter state
    private _statusFilter = 'all'; // 'all' or option name
    private _searchQuery = '';

    // Repo info
    private _owner?: string;
    private _repo?: string;

    // Visibility-gated refresh
    private _isVisible = true;
    private _pendingRefreshReason?: string;

    private static readonly DEBOUNCE_MS = 300;

    constructor(
        private readonly _projectService: ProjectService,
        private readonly _gitService: GitService,
        private readonly _authService: AuthService,
        private readonly _outputChannel?: vscode.OutputChannel,
    ) {}

    // ─── Tree View Binding ────────────────────────────────────────

    setTreeView(treeView: vscode.TreeView<ProjectItemTreeItem>): void {
        this._treeView = treeView;

        treeView.onDidChangeVisibility((e) => {
            this._isVisible = e.visible;
            if (e.visible && this._pendingRefreshReason) {
                this._outputChannel?.appendLine(
                    `[Projects REFRESH] flushing deferred: ${this._pendingRefreshReason}`,
                );
                const reason = this._pendingRefreshReason;
                this._pendingRefreshReason = undefined;
                this.refresh(reason);
            }
        });
    }

    // ─── Project Selection ────────────────────────────────────────

    getAvailableProjects() {
        return this._availableProjects;
    }

    getSelectedProject(): Project | undefined {
        return this._selectedProject;
    }

    async selectProjectById(projectNodeId: string): Promise<void> {
        this._selectedProject = await this._projectService.getProjectById(projectNodeId);
        this._cachedFields = this._selectedProject.fields;
        this.refresh('project-selected');
    }

    // ─── Filter ───────────────────────────────────────────────────

    setStatusFilter(status: string): void {
        this._statusFilter = status;
        this._onDidChangeTreeData.fire();
    }

    get statusFilter(): string {
        return this._statusFilter;
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
        this._outputChannel?.appendLine(`[Projects REFRESH] triggered by: ${reason}`);

        if (!this._isVisible && reason !== 'manual') {
            this._pendingRefreshReason = reason;
            this._outputChannel?.appendLine(`[Projects REFRESH] deferred (tree hidden)`);
            return;
        }

        if (this._refreshTimer) {
            clearTimeout(this._refreshTimer);
        }

        this._refreshTimer = setTimeout(() => {
            this._refreshTimer = undefined;
            this._onDidChangeTreeData.fire();
        }, ProjectProvider.DEBOUNCE_MS);
    }

    /** Force re-resolve repo info */
    clearRepoCache(): void {
        this._owner = undefined;
        this._repo = undefined;
    }

    // ─── TreeDataProvider ─────────────────────────────────────────

    getTreeItem(element: ProjectItemTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(_element?: ProjectItemTreeItem): Promise<ProjectItemTreeItem[]> {
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
                await vscode.commands.executeCommand('setContext', 'superprompt-forge.hasProjects', false);
                this._cachedItems = [];
                this._updateTreeChrome(0);
                return [];
            }

            // Resolve repo info if not yet cached
            if (!this._owner || !this._repo) {
                const ghRepo = await this._gitService.getGitHubRepo();
                if (!ghRepo) {
                    await vscode.commands.executeCommand('setContext', 'superprompt-forge.hasProjects', false);
                    this._cachedItems = [];
                    this._updateTreeChrome(0);
                    return [];
                }
                this._owner = ghRepo.owner;
                this._repo = ghRepo.repo;
            }

            // Discover available projects if needed
            if (this._availableProjects.length === 0) {
                this._availableProjects = await this._projectService.listRepositoryProjects(
                    this._owner,
                    this._repo,
                );
            }

            // Auto-select first open project if none selected
            if (!this._selectedProject && this._availableProjects.length > 0) {
                const firstOpen =
                    this._availableProjects.find((p) => !p.closed) ?? this._availableProjects[0];
                this._selectedProject = await this._projectService.getProjectById(firstOpen.id);
                this._cachedFields = this._selectedProject.fields;
            }

            if (!this._selectedProject) {
                await vscode.commands.executeCommand('setContext', 'superprompt-forge.hasProjects', false);
                this._cachedItems = [];
                this._updateTreeChrome(0);
                return [];
            }

            // Fetch project items
            const result = await this._projectService.listProjectItems(this._selectedProject.id);
            const items = result.items.filter((i) => !i.isArchived);
            this._cachedItems = items;
            this._cachedFields = this._selectedProject.fields;

            const hasItems = items.length > 0;
            await vscode.commands.executeCommand('setContext', 'superprompt-forge.hasProjects', hasItems);

            // Apply status filter
            let filtered = items;
            if (this._statusFilter !== 'all') {
                filtered = items.filter((item) => {
                    const statusValue = item.fieldValues.find(
                        (fv) => fv.fieldName === 'Status' && fv.fieldType === 'SINGLE_SELECT',
                    );
                    return statusValue?.singleSelectOptionName === this._statusFilter;
                });
            }

            // Apply search filter
            const query = this._searchQuery.trim().toLowerCase();
            if (query) {
                filtered = filtered.filter((item) => {
                    const title = item.content?.title?.toLowerCase() ?? '';
                    const number = item.content?.number ? `#${item.content.number}` : '';
                    const labels = item.content?.labels?.map((l) => l.name.toLowerCase()).join(' ') ?? '';
                    return title.includes(query) || number.includes(query) || labels.includes(query);
                });
            }

            this._updateTreeChrome(items.length, filtered.length, query);

            return filtered.map(
                (item) => new ProjectItemTreeItem(item, this._cachedFields, query || undefined),
            );
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            this._outputChannel?.appendLine(`[Projects] Error fetching project items: ${msg}`);
            this._updateTreeChrome(0);
            return [];
        } finally {
            this._isRefreshing = false;
        }
    }

    /** Get cached items for use by webview. */
    getCachedItems(): ProjectItem[] {
        return this._cachedItems;
    }

    getCachedFields(): ProjectField[] {
        return this._cachedFields;
    }

    /** Get available status option names from the Status field definition. */
    getStatusOptions(): string[] {
        const statusField = this._cachedFields.find(
            (f) => f.name === 'Status' && f.dataType === 'SINGLE_SELECT',
        );
        return statusField?.options?.map((o) => o.name) ?? [];
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

        const projectTitle = this._selectedProject?.title ?? '';

        // Badge
        this._treeView.badge =
            total > 0
                ? { value: total, tooltip: `${total} item${total !== 1 ? 's' : ''}` }
                : undefined;

        // Title
        const filterLabel = this._statusFilter === 'all' ? '' : ` — ${this._statusFilter}`;
        this._treeView.title = projectTitle
            ? `Projects: ${projectTitle}${filterLabel}`
            : `Projects${filterLabel}`;

        // Message
        if (query && filteredCount !== undefined) {
            this._treeView.message = `$(search) Showing ${filteredCount} of ${total} items matching "${this._searchQuery}"`;
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
