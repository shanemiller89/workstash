import * as vscode from 'vscode';
import { ForgeStatusItem } from './forgeItem';
import { GitService } from './gitService';
import { AuthService } from './authService';
import { GistNotesProvider } from './gistNotesProvider';
import { PrProvider } from './prProvider';
import { IssueProvider } from './issueProvider';
import { ProjectProvider } from './projectProvider';
import { MattermostService } from './mattermostService';
import { GoogleDriveService } from './googleDriveService';

/**
 * TreeDataProvider for the top-level "Superprompt Forge" overview view.
 * Shows an aggregated list of feature statuses — stash count, PR count,
 * issue count, notes count, Mattermost/Drive connection status, etc.
 *
 * The title bar has a single primary button: "Open Superprompt Forge"
 * which opens the full webview panel.
 */
export class ForgeOverviewProvider implements vscode.TreeDataProvider<ForgeStatusItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ForgeStatusItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ForgeStatusItem | undefined | null | void> =
        this._onDidChangeTreeData.event;

    private _refreshTimer?: ReturnType<typeof setTimeout>;
    private static readonly DEBOUNCE_MS = 500;

    constructor(
        private readonly _gitService: GitService,
        private readonly _authService: AuthService,
        private readonly _notesProvider: GistNotesProvider,
        private readonly _prProvider: PrProvider,
        private readonly _issueProvider: IssueProvider,
        private readonly _projectProvider: ProjectProvider,
        private readonly _mattermostService: MattermostService,
        private readonly _driveService: GoogleDriveService,
        private readonly _outputChannel?: vscode.OutputChannel,
    ) {}

    /**
     * Debounced refresh — called whenever any feature provider updates.
     */
    refresh(reason?: string): void {
        if (this._refreshTimer) {
            clearTimeout(this._refreshTimer);
        }
        this._refreshTimer = setTimeout(() => {
            this._outputChannel?.appendLine(`[ForgeOverview] refresh (${reason ?? 'manual'})`);
            this._onDidChangeTreeData.fire();
        }, ForgeOverviewProvider.DEBOUNCE_MS);
    }

    getTreeItem(element: ForgeStatusItem): vscode.TreeItem {
        return element;
    }

    async getChildren(_element?: ForgeStatusItem): Promise<ForgeStatusItem[]> {
        // This is a flat list — no children for status items
        if (_element) {
            return [];
        }

        const items: ForgeStatusItem[] = [];

        // ─── Git Stashes ──────────────────────────────────────────
        try {
            const stashes = await this._gitService.getStashList();
            const count = stashes.length;
            items.push(new ForgeStatusItem(
                'stashes',
                'Git Stashes',
                count > 0 ? `${count} stash${count !== 1 ? 'es' : ''}` : 'None',
                new vscode.ThemeIcon('archive'),
            ));
        } catch {
            items.push(new ForgeStatusItem(
                'stashes',
                'Git Stashes',
                'Unavailable',
                new vscode.ThemeIcon('archive'),
            ));
        }

        // ─── GitHub Auth Gate ─────────────────────────────────────
        const isGitHubAuth = await this._authService.isAuthenticated();
        const ghRepo = await this._gitService.getGitHubRepo();

        // ─── Gist Notes ──────────────────────────────────────────
        if (!isGitHubAuth) {
            items.push(new ForgeStatusItem(
                'notes',
                'Gist Notes',
                'Sign in required',
                new vscode.ThemeIcon('note'),
            ));
        } else {
            const notes = this._notesProvider.getCachedNotes();
            const count = notes.length;
            items.push(new ForgeStatusItem(
                'notes',
                'Gist Notes',
                count > 0 ? `${count} note${count !== 1 ? 's' : ''}` : 'None',
                new vscode.ThemeIcon('note'),
            ));
        }

        // ─── Pull Requests ───────────────────────────────────────
        if (!isGitHubAuth) {
            items.push(new ForgeStatusItem(
                'prs',
                'Pull Requests',
                'Sign in required',
                new vscode.ThemeIcon('git-pull-request'),
            ));
        } else if (!ghRepo) {
            items.push(new ForgeStatusItem(
                'prs',
                'Pull Requests',
                'No GitHub remote',
                new vscode.ThemeIcon('git-pull-request'),
            ));
        } else {
            const prs = this._prProvider.getCachedPRs();
            const count = prs.length;
            items.push(new ForgeStatusItem(
                'prs',
                'Pull Requests',
                count > 0 ? `${count} open` : 'None',
                new vscode.ThemeIcon('git-pull-request'),
            ));
        }

        // ─── Issues ──────────────────────────────────────────────
        if (!isGitHubAuth) {
            items.push(new ForgeStatusItem(
                'issues',
                'Issues',
                'Sign in required',
                new vscode.ThemeIcon('issues'),
            ));
        } else if (!ghRepo) {
            items.push(new ForgeStatusItem(
                'issues',
                'Issues',
                'No GitHub remote',
                new vscode.ThemeIcon('issues'),
            ));
        } else {
            const issues = this._issueProvider.getCachedIssues();
            const count = issues.length;
            items.push(new ForgeStatusItem(
                'issues',
                'Issues',
                count > 0 ? `${count} open` : 'None',
                new vscode.ThemeIcon('issues'),
            ));
        }

        // ─── Projects ────────────────────────────────────────────
        if (!isGitHubAuth) {
            items.push(new ForgeStatusItem(
                'projects',
                'Projects',
                'Sign in required',
                new vscode.ThemeIcon('layout'),
            ));
        } else if (!ghRepo) {
            items.push(new ForgeStatusItem(
                'projects',
                'Projects',
                'No GitHub remote',
                new vscode.ThemeIcon('layout'),
            ));
        } else {
            const projectItems = this._projectProvider.getCachedItems();
            const count = projectItems.length;
            items.push(new ForgeStatusItem(
                'projects',
                'Projects',
                count > 0 ? `${count} item${count !== 1 ? 's' : ''}` : 'None',
                new vscode.ThemeIcon('layout'),
            ));
        }

        // ─── Mattermost ─────────────────────────────────────────
        const mmConfigured = await this._mattermostService.isConfigured();
        if (!mmConfigured) {
            items.push(new ForgeStatusItem(
                'mattermost',
                'Mattermost',
                'Not configured',
                new vscode.ThemeIcon('comment-discussion'),
            ));
        } else {
            // Check if authenticated by trying to see if token exists
            const mmToken = await this._mattermostService.getToken();
            items.push(new ForgeStatusItem(
                'mattermost',
                'Mattermost',
                mmToken ? 'Connected' : 'Sign in required',
                new vscode.ThemeIcon('comment-discussion'),
            ));
        }

        // ─── Google Drive ────────────────────────────────────────
        const clientId = vscode.workspace.getConfiguration('superprompt-forge').get<string>('google.clientId', '');
        if (!clientId) {
            items.push(new ForgeStatusItem(
                'drive',
                'Google Drive',
                'Not configured',
                new vscode.ThemeIcon('cloud'),
            ));
        } else {
            const driveAuth = await this._driveService.isAuthenticated();
            items.push(new ForgeStatusItem(
                'drive',
                'Google Drive',
                driveAuth ? 'Connected' : 'Sign in required',
                new vscode.ThemeIcon('cloud'),
            ));
        }

        return items;
    }

    dispose(): void {
        if (this._refreshTimer) {
            clearTimeout(this._refreshTimer);
        }
        this._onDidChangeTreeData.dispose();
    }
}
