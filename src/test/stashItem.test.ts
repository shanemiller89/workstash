import * as assert from 'assert';
import * as vscode from 'vscode';
import { StashItem, StashFileItem } from '../stashItem';
import { StashEntry, FileStatus } from '../gitService';

/**
 * Unit tests for StashItem and StashFileItem tree item models.
 * 10b-ii / 10b-iii: Verify properties, icons, commands, context values.
 */

function makeEntry(overrides: Partial<StashEntry> = {}): StashEntry {
    return {
        index: 0,
        name: 'stash@{0}',
        branch: 'main',
        message: 'test stash message',
        date: new Date('2026-02-10T14:00:00Z'),
        ...overrides,
    };
}

suite('StashItem Tests', () => {
    test('label is set to stash message', () => {
        const item = new StashItem(makeEntry({ message: 'my changes' }));
        assert.strictEqual(item.label, 'my changes');
    });

    test('label shows "(no message)" for empty message', () => {
        const item = new StashItem(makeEntry({ message: '' }));
        assert.strictEqual(item.label, '(no message)');
    });

    test('description includes stash name', () => {
        const item = new StashItem(makeEntry({ name: 'stash@{2}' }));
        assert.ok(
            typeof item.description === 'string' && item.description.includes('stash@{2}'),
            `Expected description to include stash name, got "${item.description}"`,
        );
    });

    test('contextValue is "stashItem"', () => {
        const item = new StashItem(makeEntry());
        assert.strictEqual(item.contextValue, 'stashItem');
    });

    test('iconPath is archive ThemeIcon', () => {
        const item = new StashItem(makeEntry());
        assert.ok(item.iconPath instanceof vscode.ThemeIcon);
        assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, 'archive');
    });

    test('collapsibleState defaults to Collapsed', () => {
        const item = new StashItem(makeEntry());
        assert.strictEqual(item.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
    });

    test('tooltip is a MarkdownString', () => {
        const item = new StashItem(makeEntry());
        assert.ok(item.tooltip instanceof vscode.MarkdownString);
    });

    test('stashEntry is accessible', () => {
        const entry = makeEntry({ index: 5 });
        const item = new StashItem(entry);
        assert.strictEqual(item.stashEntry.index, 5);
    });

    test('id is set to stash-{index}', () => {
        const item = new StashItem(makeEntry({ index: 3 }));
        assert.strictEqual(item.id, 'stash-3');
    });

    test('accessibilityInformation is set', () => {
        const item = new StashItem(makeEntry({ message: 'fix login', branch: 'main' }));
        assert.ok(item.accessibilityInformation);
        assert.ok(item.accessibilityInformation!.label.includes('fix login'));
        assert.ok(item.accessibilityInformation!.label.includes('main'));
    });

    test('search query produces TreeItemLabel with highlights', () => {
        const item = new StashItem(
            makeEntry({ message: 'fix login bug' }),
            vscode.TreeItemCollapsibleState.Collapsed,
            'login',
        );
        // When highlights are found, label is a TreeItemLabel object
        assert.ok(typeof item.label === 'object' && item.label !== null);
        const treeLabel = item.label as vscode.TreeItemLabel;
        assert.strictEqual(treeLabel.label, 'fix login bug');
        assert.ok(treeLabel.highlights && treeLabel.highlights.length > 0);
        assert.deepStrictEqual(treeLabel.highlights![0], [4, 9]);
    });

    test('search query with no match produces plain string label', () => {
        const item = new StashItem(
            makeEntry({ message: 'fix login bug' }),
            vscode.TreeItemCollapsibleState.Collapsed,
            'zzz',
        );
        // No highlights found — label should be a plain string
        assert.strictEqual(item.label, 'fix login bug');
    });

    test('updateTooltipWithStats rebuilds tooltip', () => {
        const entry = makeEntry();
        const item = new StashItem(entry);
        const tooltipBefore = (item.tooltip as vscode.MarkdownString).value;

        entry.stats = { filesChanged: 3, insertions: 10, deletions: 2 };
        item.updateTooltipWithStats();

        const tooltipAfter = (item.tooltip as vscode.MarkdownString).value;
        assert.notStrictEqual(tooltipBefore, tooltipAfter);
        assert.ok(tooltipAfter.includes('3'));
    });
});

suite('StashFileItem Tests', () => {
    test('label is the filename only', () => {
        const item = new StashFileItem('src/deep/folder/myFile.ts', 0, 'M');
        assert.strictEqual(item.label, 'myFile.ts');
    });

    test('description includes directory path', () => {
        const item = new StashFileItem('src/deep/folder/myFile.ts', 0, 'M');
        assert.ok(
            typeof item.description === 'string' && item.description.includes('src/deep/folder'),
            `Expected directory in description, got "${item.description}"`,
        );
    });

    test('contextValue is "stashFileItem"', () => {
        const item = new StashFileItem('file.ts', 0);
        assert.strictEqual(item.contextValue, 'stashFileItem');
    });

    test('command is wired to superprompt-forge.showFile', () => {
        const item = new StashFileItem('file.ts', 0);
        assert.ok(item.command);
        assert.strictEqual(item.command!.command, 'superprompt-forge.showFile');
    });

    test('collapsibleState is None', () => {
        const item = new StashFileItem('file.ts', 0);
        assert.strictEqual(item.collapsibleState, vscode.TreeItemCollapsibleState.None);
    });

    test('icon uses diff-modified for M status', () => {
        const item = new StashFileItem('file.ts', 0, 'M');
        assert.ok(item.iconPath instanceof vscode.ThemeIcon);
        assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, 'diff-modified');
    });

    test('icon uses diff-added for A status', () => {
        const item = new StashFileItem('file.ts', 0, 'A');
        assert.ok(item.iconPath instanceof vscode.ThemeIcon);
        assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, 'diff-added');
    });

    test('icon uses diff-removed for D status', () => {
        const item = new StashFileItem('file.ts', 0, 'D');
        assert.ok(item.iconPath instanceof vscode.ThemeIcon);
        assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, 'diff-removed');
    });

    test('icon uses file for no status', () => {
        const item = new StashFileItem('file.ts', 0);
        assert.ok(item.iconPath instanceof vscode.ThemeIcon);
        assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, 'file');
    });

    test('tooltip includes full file path', () => {
        const item = new StashFileItem('src/folder/file.ts', 0, 'M');
        assert.ok(
            typeof item.tooltip === 'string' && item.tooltip.includes('src/folder/file.ts'),
            `Expected filepath in tooltip, got "${item.tooltip}"`,
        );
    });

    test('id is set to stash-{index}-file-{path}', () => {
        const item = new StashFileItem('src/app.ts', 2, 'M');
        assert.strictEqual(item.id, 'stash-2-file-src/app.ts');
    });

    test('resourceUri is set for FileDecorationProvider', () => {
        const item = new StashFileItem('src/app.ts', 1, 'A');
        assert.ok(item.resourceUri);
        assert.strictEqual(item.resourceUri!.scheme, 'superprompt-forge-file');
    });

    test('decorationUri encodes status in query', () => {
        const item = new StashFileItem('src/app.ts', 1, 'D');
        assert.ok(item.decorationUri.query.includes('status=D'));
    });

    test('accessibilityInformation is set', () => {
        const item = new StashFileItem('src/folder/file.ts', 0, 'M');
        assert.ok(item.accessibilityInformation);
        assert.ok(item.accessibilityInformation!.label.includes('file.ts'));
        assert.ok(item.accessibilityInformation!.label.includes('Modified'));
    });
});
