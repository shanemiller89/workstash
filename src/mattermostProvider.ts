import * as vscode from 'vscode';
import { MattermostService, MattermostTeam, MattermostChannel } from './mattermostService';
import { MattermostTeamItem, MattermostChannelItem, MattermostSeparatorItem } from './mattermostItem';

type MattermostTreeItem = MattermostTeamItem | MattermostChannelItem | MattermostSeparatorItem;

/**
 * TreeDataProvider for the Mattermost sidebar tree view.
 * Shows Teams > Channels hierarchy.
 */
export class MattermostProvider
    implements vscode.TreeDataProvider<MattermostTreeItem>, vscode.Disposable
{
    private _onDidChangeTreeData = new vscode.EventEmitter<
        MattermostTreeItem | undefined | null | void
    >();
    readonly onDidChangeTreeData: vscode.Event<MattermostTreeItem | undefined | null | void> =
        this._onDidChangeTreeData.event;

    private _treeView?: vscode.TreeView<MattermostTreeItem>;
    private _refreshTimer?: ReturnType<typeof setTimeout>;
    private _isRefreshing = false;

    /** Cache: team → channels */
    private _cachedTeams: MattermostTeam[] = [];
    private _cachedChannels = new Map<string, MattermostChannel[]>();
    private _cachedDmChannels = new Map<string, MattermostChannel[]>();
    private _cachedGroupChannels = new Map<string, MattermostChannel[]>();
    /** Cache: DM channel ID → resolved display name */
    private _dmDisplayNames = new Map<string, string>();
    private _myUserId: string | undefined;

    // Search
    private _searchQuery = '';

    // Visibility-gated refresh
    private _isVisible = true;
    private _pendingRefreshReason?: string;

    private static readonly DEBOUNCE_MS = 300;

    constructor(
        private readonly _mattermostService: MattermostService,
        private readonly _outputChannel?: vscode.OutputChannel,
    ) {}

    // ─── Tree View Binding ────────────────────────────────────────

    setTreeView(treeView: vscode.TreeView<MattermostTreeItem>): void {
        this._treeView = treeView;

        treeView.onDidChangeVisibility((e) => {
            this._isVisible = e.visible;
            if (e.visible && this._pendingRefreshReason) {
                this._outputChannel?.appendLine(
                    `[Mattermost REFRESH] flushing deferred: ${this._pendingRefreshReason}`,
                );
                const reason = this._pendingRefreshReason;
                this._pendingRefreshReason = undefined;
                this.refresh(reason);
            }
        });
    }

    // ─── Refresh ──────────────────────────────────────────────────

    refresh(reason?: string): void {
        if (!this._isVisible) {
            this._pendingRefreshReason = reason ?? 'deferred';
            this._outputChannel?.appendLine(
                `[Mattermost] deferring refresh (hidden): ${reason ?? '?'}`,
            );
            return;
        }

        // Debounce
        if (this._refreshTimer) {
            clearTimeout(this._refreshTimer);
        }

        this._refreshTimer = setTimeout(() => {
            this._refreshTimer = undefined;
            this._outputChannel?.appendLine(`[Mattermost REFRESH] firing: ${reason ?? '?'}`);
            this._onDidChangeTreeData.fire();
        }, MattermostProvider.DEBOUNCE_MS);
    }

    // ─── Search ───────────────────────────────────────────────────

    async search(): Promise<void> {
        const query = await vscode.window.showInputBox({
            prompt: 'Search channels by name',
            placeHolder: 'channel name…',
            value: this._searchQuery,
        });
        if (query === undefined) { return; } // cancelled
        this._searchQuery = query;
        void vscode.commands.executeCommand(
            'setContext',
            'superprompt-forge.mattermost.isSearching',
            query.length > 0,
        );
        this.refresh('search');
    }

    clearSearch(): void {
        this._searchQuery = '';
        void vscode.commands.executeCommand(
            'setContext',
            'superprompt-forge.mattermost.isSearching',
            false,
        );
        this.refresh('clear-search');
    }

    // ─── TreeDataProvider ─────────────────────────────────────────

    getTreeItem(element: MattermostTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: MattermostTreeItem): Promise<MattermostTreeItem[]> {
        const isConfigured = await this._mattermostService.isConfigured();

        if (!isConfigured) {
            this._updateChrome(0);
            void vscode.commands.executeCommand('setContext', 'superprompt-forge.isMattermostConfigured', false);
            return [];
        }

        void vscode.commands.executeCommand('setContext', 'superprompt-forge.isMattermostConfigured', true);

        // Root level: teams
        if (!element) {
            return this._getTeams();
        }

        // Team children: separator items for channels and DMs
        if (element instanceof MattermostTeamItem) {
            return this._getTeamSections(element.team.id);
        }

        // Separator children: channels or DMs
        if (element instanceof MattermostSeparatorItem) {
            if (element.section === 'channels') {
                return this._getChannels(element.teamId);
            } else {
                return this._getDmChannels(element.teamId);
            }
        }

        return [];
    }

    private async _getTeams(): Promise<MattermostTreeItem[]> {
        if (this._isRefreshing) { return []; }
        this._isRefreshing = true;

        try {
            this._cachedTeams = await this._mattermostService.getMyTeams();
            this._cachedChannels.clear();
            this._cachedDmChannels.clear();
            this._cachedGroupChannels.clear();
            this._dmDisplayNames.clear();

            // Cache my user ID for DM name resolution
            try {
                const me = await this._mattermostService.getMe();
                this._myUserId = me.id;
            } catch { /* non-critical */ }

            const totalTeams = this._cachedTeams.length;
            void vscode.commands.executeCommand(
                'setContext',
                'superprompt-forge.hasMattermostTeams',
                totalTeams > 0,
            );
            this._updateChrome(totalTeams);

            return this._cachedTeams.map((t) => new MattermostTeamItem(t));
        } catch (error: unknown) {
            this._outputChannel?.appendLine(
                `[Mattermost] getTeams error: ${error instanceof Error ? error.message : error}`,
            );
            return [];
        } finally {
            this._isRefreshing = false;
        }
    }

    private async _getChannels(teamId: string): Promise<MattermostTreeItem[]> {
        try {
            let channels = this._cachedChannels.get(teamId);
            if (!channels) {
                const all = await this._mattermostService.getAllMyChannels(teamId);
                channels = all.channels;
                this._cachedChannels.set(teamId, channels);
                this._cachedDmChannels.set(teamId, all.dmChannels);
                this._cachedGroupChannels.set(teamId, all.groupChannels);
            }

            let filtered = channels;
            if (this._searchQuery) {
                const q = this._searchQuery.toLowerCase();
                filtered = channels.filter(
                    (c) =>
                        c.displayName.toLowerCase().includes(q) ||
                        c.name.toLowerCase().includes(q),
                );
            }

            return filtered.map(
                (c) => new MattermostChannelItem(c, this._searchQuery || undefined),
            );
        } catch (error: unknown) {
            this._outputChannel?.appendLine(
                `[Mattermost] getChannels error: ${error instanceof Error ? error.message : error}`,
            );
            return [];
        }
    }

    private _getTeamSections(teamId: string): MattermostTreeItem[] {
        return [
            new MattermostSeparatorItem('Channels', teamId, 'channels'),
            new MattermostSeparatorItem('Direct Messages', teamId, 'dms'),
        ];
    }

    private async _getDmChannels(teamId: string): Promise<MattermostTreeItem[]> {
        try {
            // Ensure caches are populated
            if (!this._cachedDmChannels.has(teamId)) {
                const all = await this._mattermostService.getAllMyChannels(teamId);
                this._cachedChannels.set(teamId, all.channels);
                this._cachedDmChannels.set(teamId, all.dmChannels);
                this._cachedGroupChannels.set(teamId, all.groupChannels);
            }

            const dmChannels = this._cachedDmChannels.get(teamId) ?? [];
            const groupChannels = this._cachedGroupChannels.get(teamId) ?? [];
            const allDm = [...dmChannels, ...groupChannels];

            // Resolve display names for DM channels
            if (this._myUserId) {
                for (const ch of dmChannels) {
                    if (!this._dmDisplayNames.has(ch.id)) {
                        try {
                            const name = await this._mattermostService.resolveDmDisplayName(
                                ch,
                                this._myUserId,
                            );
                            this._dmDisplayNames.set(ch.id, name);
                        } catch { /* use default */ }
                    }
                }
            }

            let filtered = allDm;
            if (this._searchQuery) {
                const q = this._searchQuery.toLowerCase();
                filtered = allDm.filter((c) => {
                    const resolved = this._dmDisplayNames.get(c.id) ?? c.displayName;
                    return resolved.toLowerCase().includes(q) ||
                        c.name.toLowerCase().includes(q);
                });
            }

            return filtered.map((c) => {
                // Override display name for DM channels
                const resolvedName = this._dmDisplayNames.get(c.id);
                if (resolvedName && c.type === 'D') {
                    const clone = { ...c, displayName: resolvedName };
                    return new MattermostChannelItem(clone, this._searchQuery || undefined);
                }
                return new MattermostChannelItem(c, this._searchQuery || undefined);
            });
        } catch (error: unknown) {
            this._outputChannel?.appendLine(
                `[Mattermost] getDmChannels error: ${error instanceof Error ? error.message : error}`,
            );
            return [];
        }
    }

    // ─── Chrome ───────────────────────────────────────────────────

    private _updateChrome(teamCount: number): void {
        if (!this._treeView) { return; }

        if (teamCount > 0) {
            this._treeView.badge = { value: teamCount, tooltip: `${teamCount} team(s)` };
            this._treeView.title = 'Mattermost';
        } else {
            this._treeView.badge = undefined;
            this._treeView.title = 'Mattermost';
        }
    }

    // ─── Dispose ──────────────────────────────────────────────────

    dispose(): void {
        if (this._refreshTimer) {
            clearTimeout(this._refreshTimer);
        }
        this._onDidChangeTreeData.dispose();
    }
}
