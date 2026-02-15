import * as vscode from 'vscode';
import { Issue, IssueState } from './issueService';
import { formatRelativeTime } from './utils';

/**
 * Tree item representing a single Issue in the sidebar tree view.
 * Click opens the issue in the webview panel Issues tab.
 */
export class IssueItem extends vscode.TreeItem {
    constructor(
        public readonly issue: Issue,
        searchQuery?: string,
    ) {
        const label = `#${issue.number} ${issue.title}`;
        const highlights = searchQuery ? computeHighlights(label, searchQuery) : undefined;
        super(
            highlights && highlights.length > 0
                ? ({ label, highlights } as vscode.TreeItemLabel)
                : label,
            vscode.TreeItemCollapsibleState.None,
        );

        // Stable identity
        this.id = `issue-${issue.number}`;

        // Description: assignees + relative time
        const assigneeText = issue.assignees.length > 0
            ? issue.assignees.map((a) => a.login).join(', ') + ' · '
            : '';
        this.description = `${assigneeText}${formatRelativeTime(issue.updatedAt)}`;

        // Rich tooltip
        this.tooltip = this._buildTooltip();

        // Icon based on state
        this.iconPath = stateIcon(issue.state);

        // Context value for menu filtering
        this.contextValue = `issueItem-${issue.state}`;

        // Click → open issue in webview
        this.command = {
            command: 'superprompt-forge.issues.open',
            title: 'Open Issue',
            arguments: [this],
        };

        // Accessibility
        this.accessibilityInformation = {
            label: `Issue #${issue.number}: ${issue.title}, ${issue.state}, updated ${formatRelativeTime(issue.updatedAt)}`,
            role: 'treeitem',
        };
    }

    private _buildTooltip(): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.supportThemeIcons = true;
        md.supportHtml = true;

        const issue = this.issue;
        const stateEmoji = issue.state === 'open' ? '$(issue-opened)' : '$(issue-closed)';

        md.appendMarkdown(`### ${stateEmoji} #${issue.number} ${issue.title}\n\n`);
        md.appendMarkdown(
            `$(person) ${issue.author} · $(calendar) ${issue.createdAt.toLocaleDateString()} · $(history) ${formatRelativeTime(issue.updatedAt)}\n\n`,
        );

        if (issue.assignees.length > 0) {
            md.appendMarkdown(
                `$(organization) Assigned to: ${issue.assignees.map((a) => a.login).join(', ')}\n\n`,
            );
        }

        if (issue.milestone) {
            md.appendMarkdown(`$(milestone) ${issue.milestone.title}\n\n`);
        }

        if (issue.labels.length > 0) {
            md.appendMarkdown(
                issue.labels.map((l) => `\`${l.name}\``).join(' ') + '\n\n',
            );
        }

        md.appendMarkdown(`---\n\n`);

        if (issue.body) {
            const preview =
                issue.body.length > 400 ? issue.body.slice(0, 400) + '\n\n*… (truncated)*' : issue.body;
            md.appendMarkdown(preview + '\n\n');
        }

        md.appendMarkdown(`---\n\n`);
        md.appendMarkdown(
            `$(comment) ${issue.commentsCount} comment${issue.commentsCount !== 1 ? 's' : ''}\n\n`,
        );
        md.appendMarkdown(`[Open on GitHub](${issue.htmlUrl})`);

        return md;
    }
}

/** Map issue state to a ThemeIcon */
function stateIcon(state: IssueState): vscode.ThemeIcon {
    switch (state) {
        case 'open':
            return new vscode.ThemeIcon('issue-opened', new vscode.ThemeColor('charts.green'));
        case 'closed':
            return new vscode.ThemeIcon('issue-closed', new vscode.ThemeColor('charts.purple'));
    }
}

/**
 * Compute highlight ranges for search query matches in a label string.
 * Returns array of [start, end] pairs for TreeItemLabel.highlights.
 */
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
