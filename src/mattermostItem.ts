import * as vscode from 'vscode';
import { MattermostTeam, MattermostChannel } from './mattermostService';

/**
 * Tree item representing a Mattermost team (expandable parent with channels as children).
 */
export class MattermostTeamItem extends vscode.TreeItem {
    constructor(public readonly team: MattermostTeam) {
        super(team.displayName, vscode.TreeItemCollapsibleState.Expanded);

        this.id = `mm-team-${team.id}`;
        this.description = team.description || undefined;
        this.iconPath = new vscode.ThemeIcon('organization');
        this.contextValue = 'mattermostTeam';

        this.tooltip = new vscode.MarkdownString();
        this.tooltip.supportThemeIcons = true;
        this.tooltip.appendMarkdown(`### $(organization) ${team.displayName}\n\n`);
        if (team.description) {
            this.tooltip.appendMarkdown(`${team.description}\n\n`);
        }
        this.tooltip.appendMarkdown(
            `Type: ${team.type === 'O' ? 'Open' : 'Invite Only'}`,
        );
    }
}

/**
 * Separator tree item for grouping channels vs DMs in the tree.
 */
export class MattermostSeparatorItem extends vscode.TreeItem {
    constructor(
        label: string,
        public readonly teamId: string,
        public readonly section: 'channels' | 'dms',
    ) {
        super(label, vscode.TreeItemCollapsibleState.Expanded);
        this.id = `mm-sep-${teamId}-${section}`;
        this.contextValue = 'mattermostSeparator';
        this.iconPath = section === 'channels'
            ? new vscode.ThemeIcon('symbol-namespace')
            : new vscode.ThemeIcon('comment-discussion');
    }
}

/**
 * Tree item representing a Mattermost channel.
 * Click opens the channel in the webview Chat tab.
 */
export class MattermostChannelItem extends vscode.TreeItem {
    constructor(
        public readonly channel: MattermostChannel,
        searchQuery?: string,
    ) {
        const label = channel.displayName;
        const highlights = searchQuery
            ? computeHighlights(label, searchQuery)
            : undefined;

        super(
            highlights && highlights.length > 0
                ? ({ label, highlights } as vscode.TreeItemLabel)
                : label,
            vscode.TreeItemCollapsibleState.None,
        );

        this.id = `mm-channel-${channel.id}`;
        this.description = channel.purpose || undefined;
        this.iconPath = channelIcon(channel.type);
        this.contextValue = `mattermostChannel-${channel.type}`;

        // Click → open channel in webview
        this.command = {
            command: 'superprompt-forge.mattermost.openChannel',
            title: 'Open Channel',
            arguments: [this],
        };

        this.tooltip = this._buildTooltip();

        this.accessibilityInformation = {
            label: `Mattermost channel: ${channel.displayName}`,
            role: 'treeitem',
        };
    }

    private _buildTooltip(): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.supportThemeIcons = true;
        const ch = this.channel;

        const typeLabel =
            ch.type === 'O' ? 'Public' : ch.type === 'P' ? 'Private' : ch.type === 'D' ? 'Direct' : 'Group';

        md.appendMarkdown(`### ${channelIconName(ch.type)} ${ch.displayName}\n\n`);
        md.appendMarkdown(`**Type:** ${typeLabel}\n\n`);
        if (ch.header) {
            md.appendMarkdown(`**Header:** ${ch.header}\n\n`);
        }
        if (ch.purpose) {
            md.appendMarkdown(`**Purpose:** ${ch.purpose}\n\n`);
        }
        if (ch.lastPostAt) {
            md.appendMarkdown(
                `$(history) Last activity: ${new Date(ch.lastPostAt).toLocaleString()}\n\n`,
            );
        }

        return md;
    }
}

/** Map channel type to a ThemeIcon */
function channelIcon(type: 'O' | 'P' | 'D' | 'G'): vscode.ThemeIcon {
    switch (type) {
        case 'O':
            return new vscode.ThemeIcon('globe');
        case 'P':
            return new vscode.ThemeIcon('lock');
        case 'D':
            return new vscode.ThemeIcon('person');
        case 'G':
            return new vscode.ThemeIcon('people');
    }
}

/** Map channel type to a codicon string for tooltip */
function channelIconName(type: 'O' | 'P' | 'D' | 'G'): string {
    switch (type) {
        case 'O':
            return '$(globe)';
        case 'P':
            return '$(lock)';
        case 'D':
            return '$(person)';
        case 'G':
            return '$(people)';
    }
}

/** Compute highlight ranges for search query matches in a label string. */
function computeHighlights(label: string, query: string): [number, number][] {
    const highlights: [number, number][] = [];
    const lower = label.toLowerCase();
    const q = query.toLowerCase();
    let startIndex = 0;

    while (true) {
        const idx = lower.indexOf(q, startIndex);
        if (idx === -1) {
            break;
        }
        highlights.push([idx, idx + q.length]);
        startIndex = idx + 1;
    }

    return highlights;
}
