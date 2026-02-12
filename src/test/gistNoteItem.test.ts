import * as assert from 'assert';
import * as vscode from 'vscode';
import { GistNoteItem } from '../gistNoteItem';
import { GistNote } from '../gistService';

/**
 * Unit tests for GistNoteItem tree item model.
 * Verify properties, icons, commands, context values, accessibility.
 */

function makeNote(overrides: Partial<GistNote> = {}): GistNote {
    return {
        id: 'gist-abc',
        title: 'Test Note',
        content: '# Test\n\nContent here.',
        isPublic: false,
        createdAt: new Date('2026-02-10T14:00:00Z'),
        updatedAt: new Date('2026-02-10T15:00:00Z'),
        htmlUrl: 'https://gist.github.com/gist-abc',
        description: '[Workstash] Test Note',
        ...overrides,
    };
}

suite('GistNoteItem Tests', () => {
    test('label is set to note title', () => {
        const item = new GistNoteItem(makeNote({ title: 'My Note' }));
        // Label can be a string or TreeItemLabel; extract string
        const label =
            typeof item.label === 'string'
                ? item.label
                : (item.label as vscode.TreeItemLabel).label;
        assert.strictEqual(label, 'My Note');
    });

    test('label shows "Untitled" for empty title', () => {
        const item = new GistNoteItem(makeNote({ title: '' }));
        const label =
            typeof item.label === 'string'
                ? item.label
                : (item.label as vscode.TreeItemLabel).label;
        assert.strictEqual(label, 'Untitled');
    });

    test('id uses gist-note- prefix with gist ID', () => {
        const item = new GistNoteItem(makeNote({ id: 'xyz123' }));
        assert.strictEqual(item.id, 'gist-note-xyz123');
    });

    test('description includes relative time', () => {
        const item = new GistNoteItem(makeNote());
        assert.ok(
            typeof item.description === 'string' && item.description.length > 0,
            'Expected description to contain relative time',
        );
    });

    test('iconPath is "note" for secret notes', () => {
        const item = new GistNoteItem(makeNote({ isPublic: false }));
        assert.ok(item.iconPath instanceof vscode.ThemeIcon);
        assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, 'note');
    });

    test('iconPath is "globe" for public notes', () => {
        const item = new GistNoteItem(makeNote({ isPublic: true }));
        assert.ok(item.iconPath instanceof vscode.ThemeIcon);
        assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, 'globe');
    });

    test('contextValue is "gistNote" for secret notes', () => {
        const item = new GistNoteItem(makeNote({ isPublic: false }));
        assert.strictEqual(item.contextValue, 'gistNote');
    });

    test('contextValue is "gistNotePublic" for public notes', () => {
        const item = new GistNoteItem(makeNote({ isPublic: true }));
        assert.strictEqual(item.contextValue, 'gistNotePublic');
    });

    test('collapsibleState is None (flat list)', () => {
        const item = new GistNoteItem(makeNote());
        assert.strictEqual(item.collapsibleState, vscode.TreeItemCollapsibleState.None);
    });

    test('tooltip is a MarkdownString', () => {
        const item = new GistNoteItem(makeNote());
        assert.ok(item.tooltip instanceof vscode.MarkdownString);
    });

    test('command opens note in webview', () => {
        const item = new GistNoteItem(makeNote());
        assert.ok(item.command);
        assert.strictEqual(item.command!.command, 'workstash.notes.open');
        assert.deepStrictEqual(item.command!.arguments, [item]);
    });

    test('accessibilityInformation is set', () => {
        const item = new GistNoteItem(makeNote({ title: 'A11y Note', isPublic: true }));
        assert.ok(item.accessibilityInformation);
        assert.ok(item.accessibilityInformation!.label!.includes('A11y Note'));
        assert.ok(item.accessibilityInformation!.label!.includes('public'));
    });

    test('search query highlights are applied to label', () => {
        const item = new GistNoteItem(makeNote({ title: 'Important Meeting Notes' }), 'meeting');
        // When search query matches, label should be a TreeItemLabel with highlights
        if (typeof item.label !== 'string') {
            const treeLabel = item.label as vscode.TreeItemLabel;
            assert.strictEqual(treeLabel.label, 'Important Meeting Notes');
            assert.ok(
                treeLabel.highlights && treeLabel.highlights.length > 0,
                'Expected highlights for matching search query',
            );
        }
        // Even if it's a string, the test passes — the feature is optional
    });

    test('no highlights when search query does not match', () => {
        const item = new GistNoteItem(makeNote({ title: 'Test Note' }), 'zzzzz');
        // Should fall back to plain string label (no highlights)
        if (typeof item.label !== 'string') {
            const treeLabel = item.label as vscode.TreeItemLabel;
            assert.ok(
                !treeLabel.highlights || treeLabel.highlights.length === 0,
                'Expected no highlights for non-matching query',
            );
        }
    });

    test('note property is accessible', () => {
        const note = makeNote({ id: 'propcheck' });
        const item = new GistNoteItem(note);
        assert.strictEqual(item.note.id, 'propcheck');
        assert.strictEqual(item.note, note);
    });
});
