import * as assert from 'assert';
import * as vscode from 'vscode';

/**
 * Integration tests for the MyStash extension.
 * These run in the VS Code extension host via @vscode/test-electron.
 *
 * 10c-i: Extension activation
 * 10c-ii: Tree view population (requires a git repo with stashes — smoke only)
 * 10c-iii: Command execution smoke tests
 */
suite('Extension Integration Tests', () => {
    // 10c-i: Extension activation
    test('Extension should be present', () => {
        const ext = vscode.extensions.getExtension('shanemiller89.workstash');
        assert.ok(ext, 'Extension should be found by ID');
    });

    test('Extension should activate', async () => {
        const ext = vscode.extensions.getExtension('shanemiller89.workstash');
        assert.ok(ext);
        if (!ext.isActive) {
            await ext.activate();
        }
        assert.ok(ext.isActive, 'Extension should be active after activation');
    });

    test('All expected commands should be registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        const expected = [
            'mystash.refresh',
            'mystash.stash',
            'mystash.apply',
            'mystash.pop',
            'mystash.drop',
            'mystash.show',
            'mystash.clear',
            'mystash.showFile',
            'mystash.openPanel',
            'mystash.showStats',
            'workstash.notes.signIn',
            'workstash.notes.signOut',
            'workstash.notes.create',
            'workstash.notes.open',
            'workstash.notes.delete',
            'workstash.notes.copyLink',
            'workstash.notes.toggleVisibility',
            'workstash.notes.refresh',
            'workstash.notes.search',
            'workstash.notes.clearSearch',
        ];

        for (const cmd of expected) {
            assert.ok(commands.includes(cmd), `Command "${cmd}" should be registered`);
        }
    });

    // 10c-iii: Command execution smoke tests
    test('mystash.refresh should not throw', async () => {
        // refresh may fail silently if no git repo — that's OK for a smoke test
        await assert.doesNotReject(async () => vscode.commands.executeCommand('mystash.refresh'));
    });
});
