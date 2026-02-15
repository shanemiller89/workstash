import * as vscode from 'vscode';
import { GistNote } from './gistService';
import { formatRelativeTime } from './utils';

/**
 * Tree item representing a single Gist Note in the sidebar tree view.
 * Click opens the note in the webview panel Notes tab.
 */
export class GistNoteItem extends vscode.TreeItem {
    constructor(
        public readonly note: GistNote,
        searchQuery?: string,
    ) {
        const label = note.title || 'Untitled';
        const highlights = searchQuery ? computeHighlights(label, searchQuery) : undefined;
        super(
            highlights && highlights.length > 0
                ? ({ label, highlights } as vscode.TreeItemLabel)
                : label,
            vscode.TreeItemCollapsibleState.None,
        );

        // Stable identity — preserves selection across refreshes
        this.id = `gist-note-${note.id}`;

        // Description: relative time
        this.description = formatRelativeTime(note.updatedAt);

        // Rich tooltip
        this.tooltip = this._buildTooltip();

        // Icon: globe for public, lock for secret
        this.iconPath = note.isPublic
            ? new vscode.ThemeIcon('globe')
            : new vscode.ThemeIcon('note');

        // Context value for menu filtering
        this.contextValue = note.isPublic ? 'gistNotePublic' : 'gistNote';

        // Click → open note in webview
        this.command = {
            command: 'superprompt-forge.notes.open',
            title: 'Open Note',
            arguments: [this],
        };

        // Accessibility
        this.accessibilityInformation = {
            label: `Note: ${label}, ${note.isPublic ? 'public' : 'secret'}, updated ${formatRelativeTime(note.updatedAt)}`,
            role: 'treeitem',
        };
    }

    private _buildTooltip(): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.supportThemeIcons = true;
        md.supportHtml = true;

        // Title + visibility badge
        const badge = this.note.isPublic ? '$(globe) Public' : '$(lock) Secret';
        md.appendMarkdown(`### ${this.note.title || 'Untitled'}  \n`);
        md.appendMarkdown(
            `${badge} · $(calendar) ${this.note.createdAt.toLocaleDateString()} · $(history) ${formatRelativeTime(this.note.updatedAt)}\n\n`,
        );

        md.appendMarkdown(`---\n\n`);

        // Render the actual note content (first 500 chars) as Markdown
        if (this.note.content) {
            const preview =
                this.note.content.length > 500
                    ? this.note.content.slice(0, 500) + '\n\n*… (truncated)*'
                    : this.note.content;
            md.appendMarkdown(preview + '\n\n');
        } else {
            md.appendMarkdown('*Empty note*\n\n');
        }

        md.appendMarkdown(`---\n\n`);
        md.appendMarkdown(`[Open on GitHub](${this.note.htmlUrl})`);

        return md;
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
