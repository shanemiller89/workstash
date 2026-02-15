import * as assert from 'assert';
import * as vscode from 'vscode';

/**
 * Integration tests for the Superprompt Forge extension.
 * These run in the VS Code extension host via @vscode/test-electron.
 *
 * 10c-i: Extension activation
 * 10c-ii: Tree view population (requires a git repo with stashes — smoke only)
 * 10c-iii: Command execution smoke tests
 */
suite('Extension Integration Tests', () => {
    // 10c-i: Extension activation
    test('Extension should be present', () => {
        const ext = vscode.extensions.getExtension('shanemiller89.superprompt-forge');
        assert.ok(ext, 'Extension should be found by ID');
    });

    test('Extension should activate', async () => {
        const ext = vscode.extensions.getExtension('shanemiller89.superprompt-forge');
        assert.ok(ext);
        if (!ext.isActive) {
            await ext.activate();
        }
        assert.ok(ext.isActive, 'Extension should be active after activation');
    });

    test('All expected commands should be registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        const expected = [
            'superprompt-forge.refresh',
            'superprompt-forge.stash',
            'superprompt-forge.apply',
            'superprompt-forge.pop',
            'superprompt-forge.drop',
            'superprompt-forge.show',
            'superprompt-forge.clear',
            'superprompt-forge.showFile',
            'superprompt-forge.openPanel',
            'superprompt-forge.showStats',
            'superprompt-forge.notes.signIn',
            'superprompt-forge.notes.signOut',
            'superprompt-forge.notes.create',
            'superprompt-forge.notes.open',
            'superprompt-forge.notes.delete',
            'superprompt-forge.notes.copyLink',
            'superprompt-forge.notes.toggleVisibility',
            'superprompt-forge.notes.refresh',
            'superprompt-forge.notes.search',
            'superprompt-forge.notes.clearSearch',
        ];

        for (const cmd of expected) {
            assert.ok(commands.includes(cmd), `Command "${cmd}" should be registered`);
        }
    });

    // 10c-iii: Command execution smoke tests
    test('superprompt-forge.refresh should not throw', async () => {
        // refresh may fail silently if no git repo — that's OK for a smoke test
        await assert.doesNotReject(async () => vscode.commands.executeCommand('superprompt-forge.refresh'));
    });
});
