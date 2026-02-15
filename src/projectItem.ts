import * as vscode from 'vscode';
import { ProjectItem, ProjectField } from './projectService';
import { formatRelativeTime } from './utils';

/**
 * Tree item representing a single Project Item in the sidebar tree view.
 * Click opens the item in the webview panel Projects tab.
 */
export class ProjectItemTreeItem extends vscode.TreeItem {
    constructor(
        public readonly projectItem: ProjectItem,
        public readonly fields: ProjectField[],
        searchQuery?: string,
    ) {
        const title = projectItem.content?.title ?? 'Untitled';
        const prefix = projectItem.content?.number ? `#${projectItem.content.number} ` : '';
        const label = `${prefix}${title}`;
        const highlights = searchQuery ? computeHighlights(label, searchQuery) : undefined;

        super(
            highlights && highlights.length > 0
                ? ({ label, highlights } as vscode.TreeItemLabel)
                : label,
            vscode.TreeItemCollapsibleState.None,
        );

        // Stable identity
        this.id = `project-item-${projectItem.id}`;

        // Description: status field + relative time
        const statusValue = this._getStatusValue();
        const timeStr = formatRelativeTime(new Date(projectItem.updatedAt));
        this.description = statusValue ? `${statusValue} · ${timeStr}` : timeStr;

        // Rich tooltip
        this.tooltip = this._buildTooltip();

        // Icon based on item type
        this.iconPath = itemTypeIcon(projectItem);

        // Context value for menu filtering
        this.contextValue = `projectItem-${projectItem.type}`;

        // Click → open item in webview
        this.command = {
            command: 'superprompt-forge.projects.openItem',
            title: 'Open Project Item',
            arguments: [this],
        };

        // Accessibility
        this.accessibilityInformation = {
            label: `Project item: ${title}, ${projectItem.type}, updated ${timeStr}`,
            role: 'treeitem',
        };
    }

    private _getStatusValue(): string | undefined {
        // Find the "Status" field value (conventional name in GitHub Projects)
        const statusField = this.projectItem.fieldValues.find(
            (fv) => fv.fieldName === 'Status' && fv.fieldType === 'SINGLE_SELECT',
        );
        return statusField?.singleSelectOptionName;
    }

    private _buildTooltip(): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.supportThemeIcons = true;
        md.supportHtml = true;

        const item = this.projectItem;
        const title = item.content?.title ?? 'Untitled';
        const typeIcon = item.type === 'ISSUE' ? '$(issue-opened)'
            : item.type === 'PULL_REQUEST' ? '$(git-pull-request)'
            : '$(note)';

        md.appendMarkdown(`### ${typeIcon} ${title}\n\n`);

        if (item.content?.author) {
            md.appendMarkdown(`$(person) ${item.content.author}`);
        }
        md.appendMarkdown(
            ` · $(history) ${formatRelativeTime(new Date(item.updatedAt))}\n\n`,
        );

        if (item.content?.state) {
            md.appendMarkdown(`**State:** ${item.content.state}\n\n`);
        }

        // Display field values
        for (const fv of item.fieldValues) {
            const value = fieldValueDisplay(fv);
            if (value) {
                md.appendMarkdown(`**${fv.fieldName}:** ${value}\n\n`);
            }
        }

        if (item.content?.labels && item.content.labels.length > 0) {
            md.appendMarkdown(
                item.content.labels.map((l) => `\`${l.name}\``).join(' ') + '\n\n',
            );
        }

        if (item.content?.assignees && item.content.assignees.length > 0) {
            md.appendMarkdown(
                `$(organization) ${item.content.assignees.map((a) => a.login).join(', ')}\n\n`,
            );
        }

        if (item.content?.body) {
            md.appendMarkdown(`---\n\n`);
            const preview =
                item.content.body.length > 400
                    ? item.content.body.slice(0, 400) + '\n\n*… (truncated)*'
                    : item.content.body;
            md.appendMarkdown(preview + '\n\n');
        }

        if (item.content?.url) {
            md.appendMarkdown(`---\n\n`);
            md.appendMarkdown(`[Open on GitHub](${item.content.url})`);
        }

        return md;
    }
}

/** Map item type to a ThemeIcon */
function itemTypeIcon(item: ProjectItem): vscode.ThemeIcon {
    switch (item.type) {
        case 'ISSUE': {
            const state = item.content?.state;
            if (state === 'CLOSED') {
                return new vscode.ThemeIcon('issue-closed', new vscode.ThemeColor('charts.purple'));
            }
            return new vscode.ThemeIcon('issue-opened', new vscode.ThemeColor('charts.green'));
        }
        case 'PULL_REQUEST': {
            const state = item.content?.state;
            if (state === 'MERGED') {
                return new vscode.ThemeIcon('git-merge', new vscode.ThemeColor('charts.purple'));
            }
            if (state === 'CLOSED') {
                return new vscode.ThemeIcon('git-pull-request-closed', new vscode.ThemeColor('charts.red'));
            }
            return new vscode.ThemeIcon('git-pull-request', new vscode.ThemeColor('charts.green'));
        }
        case 'DRAFT_ISSUE':
            return new vscode.ThemeIcon('note', new vscode.ThemeColor('charts.foreground'));
        case 'REDACTED':
            return new vscode.ThemeIcon('lock', new vscode.ThemeColor('charts.foreground'));
    }
}

/** Format a field value for display. */
function fieldValueDisplay(fv: import('./projectService').ProjectFieldValue): string | undefined {
    switch (fv.fieldType) {
        case 'TEXT':
            return fv.text;
        case 'NUMBER':
            return fv.number !== undefined ? String(fv.number) : undefined;
        case 'DATE':
            return fv.date;
        case 'SINGLE_SELECT':
            return fv.singleSelectOptionName;
        case 'ITERATION':
            return fv.iterationTitle;
        case 'LABELS':
            return fv.labels?.map((l) => l.name).join(', ');
        case 'ASSIGNEES':
            return fv.users?.map((u) => u.login).join(', ');
        case 'MILESTONE':
            return fv.milestoneTitle;
        default:
            return undefined;
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
