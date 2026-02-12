import * as vscode from 'vscode';
import * as path from 'path';
import { StashEntry, FileStatus } from './gitService';
import { formatRelativeTime, getConfig } from './utils';

export class StashItem extends vscode.TreeItem {
    constructor(
        public readonly stashEntry: StashEntry,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Collapsed
    ) {
        super(stashEntry.message || '(no message)', collapsibleState);

        // Description: stash@{n} · branch · relative time (branch conditional on setting)
        const showBranch = getConfig<boolean>('showBranchInDescription', true);
        const timePart = formatRelativeTime(stashEntry.date);
        this.description = showBranch
            ? `${stashEntry.name} · ${stashEntry.branch} · ${timePart}`
            : `${stashEntry.name} · ${timePart}`;

        // Rich MarkdownString tooltip (stats added lazily via resolveTreeItem)
        this.tooltip = this._buildTooltip();

        this.iconPath = new vscode.ThemeIcon('archive');
        this.contextValue = 'stashItem';
    }

    private _buildTooltip(): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.supportThemeIcons = true;
        md.appendMarkdown(`**${this.stashEntry.name}**\n\n`);
        md.appendMarkdown(`$(git-branch) ${this.stashEntry.branch}\n\n`);
        md.appendMarkdown(`$(calendar) ${formatRelativeTime(this.stashEntry.date)}\n\n`);
        md.appendMarkdown(`${this.stashEntry.message || '(no message)'}`);

        if (this.stashEntry.stats) {
            const { filesChanged, insertions, deletions } = this.stashEntry.stats;
            md.appendMarkdown(`\n\n---\n\n`);
            md.appendMarkdown(`$(files) ${filesChanged} file${filesChanged !== 1 ? 's' : ''} changed`);
            if (insertions > 0) {
                md.appendMarkdown(` · $(diff-added) ${insertions}`);
            }
            if (deletions > 0) {
                md.appendMarkdown(` · $(diff-removed) ${deletions}`);
            }
        }

        return md;
    }

    /**
     * Rebuild tooltip after stats have been lazy-loaded.
     * Called from resolveTreeItem() in StashProvider.
     */
    updateTooltipWithStats(): void {
        this.tooltip = this._buildTooltip();
    }
}

/** Map FileStatus to a ThemeIcon name and ThemeColor id */
function fileStatusIcon(status: FileStatus): vscode.ThemeIcon {
    switch (status) {
        case 'M': return new vscode.ThemeIcon('diff-modified', new vscode.ThemeColor('gitDecoration.modifiedResourceForeground'));
        case 'A': return new vscode.ThemeIcon('diff-added', new vscode.ThemeColor('gitDecoration.untrackedResourceForeground'));
        case 'D': return new vscode.ThemeIcon('diff-removed', new vscode.ThemeColor('gitDecoration.deletedResourceForeground'));
        case 'R': return new vscode.ThemeIcon('diff-renamed', new vscode.ThemeColor('gitDecoration.renamedResourceForeground'));
        case 'C': return new vscode.ThemeIcon('diff-added', new vscode.ThemeColor('gitDecoration.addedResourceForeground'));
    }
}

/** Map FileStatus to a human-readable word */
function fileStatusLabel(status: FileStatus): string {
    switch (status) {
        case 'M': return 'Modified';
        case 'A': return 'Added';
        case 'D': return 'Deleted';
        case 'R': return 'Renamed';
        case 'C': return 'Copied';
    }
}

export class StashFileItem extends vscode.TreeItem {
    constructor(
        public readonly filePath: string,
        public readonly stashIndex: number,
        public readonly status?: FileStatus
    ) {
        super(path.basename(filePath), vscode.TreeItemCollapsibleState.None);

        // Description: directory portion + optional status word
        const dir = path.dirname(filePath);
        const showStatus = getConfig<boolean>('showFileStatus', true);

        const parts: string[] = [];
        if (dir && dir !== '.') {
            parts.push(dir);
        }
        if (showStatus && status) {
            parts.push(fileStatusLabel(status));
        }
        this.description = parts.join(' · ');

        this.tooltip = `${filePath}${status ? ` (${fileStatusLabel(status)})` : ''}`;
        this.iconPath = status && showStatus
            ? fileStatusIcon(status)
            : new vscode.ThemeIcon('file');
        this.contextValue = 'stashFileItem';

        // Wire click to mystash.showFile
        this.command = {
            command: 'mystash.showFile',
            title: 'Show File Diff',
            arguments: [this]
        };
    }
}
