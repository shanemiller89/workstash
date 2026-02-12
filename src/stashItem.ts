import * as vscode from 'vscode';
import * as path from 'path';
import { StashEntry, FileStatus } from './gitService';
import { formatRelativeTime, getConfig } from './utils';

export class StashItem extends vscode.TreeItem {
    constructor(
        public readonly stashEntry: StashEntry,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode
            .TreeItemCollapsibleState.Collapsed,
        searchQuery?: string,
    ) {
        // Use TreeItemLabel with highlights if there's a search query match
        const label = stashEntry.message || '(no message)';
        const highlights = searchQuery ? computeHighlights(label, searchQuery) : undefined;
        super(
            highlights && highlights.length > 0
                ? ({ label, highlights } as vscode.TreeItemLabel)
                : label,
            collapsibleState,
        );

        // Stable identity — preserves expand/scroll/selection across refreshes
        this.id = `stash-${stashEntry.index}`;

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

        // Accessibility: rich screen reader description
        this.accessibilityInformation = {
            label: `Stash ${stashEntry.index}: ${label}, on branch ${stashEntry.branch}, created ${formatRelativeTime(stashEntry.date)}${stashEntry.stats ? `, ${stashEntry.stats.filesChanged} files changed` : ''}`,
            role: 'treeitem',
        };
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
            md.appendMarkdown(
                `$(files) ${filesChanged} file${filesChanged !== 1 ? 's' : ''} changed`,
            );
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
        case 'M':
            return new vscode.ThemeIcon(
                'diff-modified',
                new vscode.ThemeColor('gitDecoration.modifiedResourceForeground'),
            );
        case 'A':
            return new vscode.ThemeIcon(
                'diff-added',
                new vscode.ThemeColor('gitDecoration.untrackedResourceForeground'),
            );
        case 'D':
            return new vscode.ThemeIcon(
                'diff-removed',
                new vscode.ThemeColor('gitDecoration.deletedResourceForeground'),
            );
        case 'R':
            return new vscode.ThemeIcon(
                'diff-renamed',
                new vscode.ThemeColor('gitDecoration.renamedResourceForeground'),
            );
        case 'C':
            return new vscode.ThemeIcon(
                'diff-added',
                new vscode.ThemeColor('gitDecoration.addedResourceForeground'),
            );
    }
}

/** Map FileStatus to a human-readable word */
function fileStatusLabel(status: FileStatus): string {
    switch (status) {
        case 'M':
            return 'Modified';
        case 'A':
            return 'Added';
        case 'D':
            return 'Deleted';
        case 'R':
            return 'Renamed';
        case 'C':
            return 'Copied';
    }
}

export class StashFileItem extends vscode.TreeItem {
    /**
     * Custom URI for FileDecorationProvider — allows SCM-style colored badges.
     * Format: mystash-file:/<filePath>?index=N&status=M
     */
    public readonly decorationUri: vscode.Uri;

    constructor(
        public readonly filePath: string,
        public readonly stashIndex: number,
        public readonly status?: FileStatus,
    ) {
        super(path.basename(filePath), vscode.TreeItemCollapsibleState.None);

        // Stable identity across refreshes
        this.id = `stash-${stashIndex}-file-${filePath}`;

        // resourceUri enables FileDecorationProvider
        this.decorationUri = vscode.Uri.parse(
            `mystash-file:///${filePath}?index=${stashIndex}&status=${status ?? ''}`,
        );
        this.resourceUri = this.decorationUri;

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

        // Override label since resourceUri takes precedence for rendering
        this.label = path.basename(filePath);

        this.tooltip = `${filePath}${status ? ` (${fileStatusLabel(status)})` : ''}`;
        this.iconPath =
            status && showStatus ? fileStatusIcon(status) : new vscode.ThemeIcon('file');
        this.contextValue = 'stashFileItem';

        // Accessibility: rich screen reader label
        this.accessibilityInformation = {
            label: `${path.basename(filePath)}${status ? `, ${fileStatusLabel(status)}` : ''}, in ${dir === '.' ? 'root' : dir}`,
            role: 'treeitem',
        };

        // Wire click to mystash.showFile
        this.command = {
            command: 'mystash.showFile',
            title: 'Show File Diff',
            arguments: [this],
        };
    }
}

/**
 * Compute case-insensitive highlight ranges for a search query within a label.
 * Returns an array of [startIndex, endIndex) tuples for TreeItemLabel.highlights.
 */
function computeHighlights(label: string, query: string): [number, number][] {
    if (!query) {
        return [];
    }
    const highlights: [number, number][] = [];
    const lowerLabel = label.toLowerCase();
    const lowerQuery = query.toLowerCase();
    let startIdx = 0;
    while (true) {
        const idx = lowerLabel.indexOf(lowerQuery, startIdx);
        if (idx === -1) {
            break;
        }
        highlights.push([idx, idx + lowerQuery.length]);
        startIdx = idx + 1;
    }
    return highlights;
}
