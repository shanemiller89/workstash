import * as vscode from 'vscode';

/**
 * Status item displayed in the Superprompt Forge overview tree view.
 * Each item represents one feature area (Stashes, PRs, Issues, Notes, etc.)
 * with a summary count or connection status.
 */
export class ForgeStatusItem extends vscode.TreeItem {
    constructor(
        public readonly featureId: string,
        label: string,
        description: string,
        icon: vscode.ThemeIcon,
        collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None,
    ) {
        super(label, collapsibleState);
        this.description = description;
        this.iconPath = icon;
        this.contextValue = `forgeStatus:${featureId}`;

        // Clicking a status item focuses the corresponding sidebar view
        const viewIdMap: Record<string, string> = {
            stashes: 'superprompt-forge-view',
            notes: 'gistNotesView',
            prs: 'pullRequestsView',
            issues: 'issuesView',
            projects: 'projectsView',
            mattermost: 'mattermostView',
            drive: 'googleDriveView',
        };
        const viewId = viewIdMap[featureId];
        if (viewId) {
            this.command = {
                command: `${viewId}.focus`,
                title: `Focus ${label}`,
            };
        }
    }
}
