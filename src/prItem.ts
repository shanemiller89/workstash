import * as vscode from 'vscode';
import { PullRequest, PRState } from './prService';
import { formatRelativeTime } from './utils';

/**
 * Tree item representing a single Pull Request in the sidebar tree view.
 * Click opens the PR in the webview panel PRs tab.
 */
export class PrItem extends vscode.TreeItem {
    constructor(
        public readonly pr: PullRequest,
        searchQuery?: string,
    ) {
        const label = `#${pr.number} ${pr.title}`;
        const highlights = searchQuery ? computeHighlights(label, searchQuery) : undefined;
        super(
            highlights && highlights.length > 0
                ? ({ label, highlights } as vscode.TreeItemLabel)
                : label,
            vscode.TreeItemCollapsibleState.None,
        );

        // Stable identity
        this.id = `pr-${pr.number}`;

        // Description: branch → base, relative time
        this.description = `${pr.branch} → ${pr.baseBranch} · ${formatRelativeTime(pr.updatedAt)}`;

        // Rich tooltip
        this.tooltip = this._buildTooltip();

        // Icon based on state
        this.iconPath = stateIcon(pr.state, pr.isDraft);

        // Context value for menu filtering
        this.contextValue = `prItem-${pr.state}`;

        // Click → open PR in webview
        this.command = {
            command: 'superprompt-forge.prs.open',
            title: 'Open Pull Request',
            arguments: [this],
        };

        // Accessibility
        this.accessibilityInformation = {
            label: `Pull request #${pr.number}: ${pr.title}, ${pr.state}${pr.isDraft ? ' draft' : ''}, updated ${formatRelativeTime(pr.updatedAt)}`,
            role: 'treeitem',
        };
    }

    private _buildTooltip(): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.supportThemeIcons = true;
        md.supportHtml = true;

        const pr = this.pr;
        const stateEmoji = pr.state === 'open' ? '$(git-pull-request)' :
            pr.state === 'merged' ? '$(git-merge)' : '$(git-pull-request-closed)';
        const draftTag = pr.isDraft ? ' $(git-pull-request-draft) Draft' : '';

        md.appendMarkdown(`### ${stateEmoji} #${pr.number} ${pr.title}${draftTag}\n\n`);
        md.appendMarkdown(
            `**${pr.branch}** → **${pr.baseBranch}** · $(person) ${pr.author}\n\n`,
        );
        md.appendMarkdown(
            `$(calendar) ${pr.createdAt.toLocaleDateString()} · $(history) ${formatRelativeTime(pr.updatedAt)}\n\n`,
        );

        if (pr.labels.length > 0) {
            md.appendMarkdown(
                pr.labels.map((l) => `\`${l.name}\``).join(' ') + '\n\n',
            );
        }

        md.appendMarkdown(`---\n\n`);

        if (pr.body) {
            const preview =
                pr.body.length > 400 ? pr.body.slice(0, 400) + '\n\n*… (truncated)*' : pr.body;
            md.appendMarkdown(preview + '\n\n');
        }

        md.appendMarkdown(`---\n\n`);
        md.appendMarkdown(
            `$(diff-added) +${pr.additions} $(diff-removed) -${pr.deletions} · ${pr.changedFiles} file${pr.changedFiles !== 1 ? 's' : ''} · $(comment) ${pr.commentsCount} comment${pr.commentsCount !== 1 ? 's' : ''}\n\n`,
        );
        md.appendMarkdown(`[Open on GitHub](${pr.htmlUrl})`);

        return md;
    }
}

/** Map PR state to a ThemeIcon */
function stateIcon(state: PRState, isDraft: boolean): vscode.ThemeIcon {
    if (isDraft) {
        return new vscode.ThemeIcon('git-pull-request-draft', new vscode.ThemeColor('descriptionForeground'));
    }
    switch (state) {
        case 'open':
            return new vscode.ThemeIcon('git-pull-request', new vscode.ThemeColor('charts.green'));
        case 'merged':
            return new vscode.ThemeIcon('git-merge', new vscode.ThemeColor('charts.purple'));
        case 'closed':
            return new vscode.ThemeIcon('git-pull-request-closed', new vscode.ThemeColor('charts.red'));
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
