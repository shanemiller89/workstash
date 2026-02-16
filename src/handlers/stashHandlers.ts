import * as vscode from 'vscode';
import { AiService } from '../aiService';
import { extractErrorMessage, getConfig } from '../utils';
import type { HandlerContext, MessageHandler } from './types';

/**
 * Handle core / stash messages from the webview:
 *   ready, refresh, switchRepo, apply, pop, drop, showFile, getFileDiff,
 *   createStash, createStashInline, clearStashes
 */
export const handleStashMessage: MessageHandler = async (ctx, msg) => {
    switch (msg.type) {
        case 'ready': {
            // NOTE: The `ready` handler is intentionally kept in StashPanel
            // because it needs to mutate panel-level state (_isReady, _pendingDeepLinks).
            // This function should never receive it.
            return false;
        }

        case 'refresh':
            await ctx.refresh();
            return true;

        // ─── Repo switcher ───
        case 'switchRepo':
            if (msg.owner && msg.repo) {
                ctx.setRepoOverride({ owner: msg.owner as string, repo: msg.repo as string });
                ctx.outputChannel.appendLine(`[SwitchRepo] Switching to ${msg.owner}/${msg.repo}`);
            } else {
                // Reset to auto-detect from git origin
                ctx.setRepoOverride(undefined);
                ctx.outputChannel.appendLine('[SwitchRepo] Resetting to auto-detect');
            }
            await ctx.sendRepoContext();
            ctx.outputChannel.appendLine('[SwitchRepo] Repo context sent, starting data refresh...');
            // Re-fetch all GitHub-dependent data with the new repo
            await Promise.all([
                ctx.refreshPRs().then(() => ctx.outputChannel.appendLine('[SwitchRepo] ✓ PRs done')),
                ctx.refreshIssues().then(() => ctx.outputChannel.appendLine('[SwitchRepo] ✓ Issues done')),
                ctx.refreshProjects().then(() => ctx.outputChannel.appendLine('[SwitchRepo] ✓ Projects done')),
                ctx.refreshWiki().then(() => ctx.outputChannel.appendLine('[SwitchRepo] ✓ Wiki done')),
                ctx.refreshNotes().then(() => ctx.outputChannel.appendLine('[SwitchRepo] ✓ Notes done')),
            ]);
            ctx.outputChannel.appendLine('[SwitchRepo] All refreshes complete');
            return true;

        case 'fetchUserRepos':
            await ctx.fetchUserRepos();
            return true;

        case 'apply':
            if (msg.index !== undefined) {
                const applyResult = await ctx.gitService.applyStash(msg.index);
                if (applyResult.success && applyResult.conflicts) {
                    vscode.window.showWarningMessage(
                        `Applied stash@{${msg.index}} with merge conflicts. Resolve them manually.`,
                    );
                } else if (applyResult.success) {
                    vscode.window.showInformationMessage(`Applied stash@{${msg.index}}`);
                } else {
                    vscode.window.showErrorMessage(`Failed to apply: ${applyResult.message}`);
                }
                await ctx.refresh();
            }
            return true;

        case 'pop':
            if (msg.index !== undefined) {
                const popResult = await ctx.gitService.popStash(msg.index);
                if (popResult.success && popResult.conflicts) {
                    vscode.window.showWarningMessage(
                        `Stash applied with conflicts but was NOT removed. Resolve conflicts, then drop manually.`,
                    );
                } else if (popResult.success) {
                    vscode.window.showInformationMessage(`Popped stash@{${msg.index}}`);
                } else {
                    vscode.window.showErrorMessage(`Failed to pop: ${popResult.message}`);
                }
                await ctx.refresh();
            }
            return true;

        case 'drop':
            if (msg.index !== undefined) {
                // 9a-ii: Respect confirmOnDrop setting
                if (getConfig<boolean>('confirmOnDrop', true)) {
                    const confirm = await vscode.window.showWarningMessage(
                        `Drop stash@{${msg.index}}? This cannot be undone.`,
                        { modal: true },
                        'Yes',
                        'No',
                    );
                    if (confirm !== 'Yes') {
                        return true;
                    }
                }
                try {
                    await ctx.gitService.dropStash(msg.index);
                    vscode.window.showInformationMessage(`Dropped stash@{${msg.index}}`);
                    await ctx.refresh();
                } catch (e: unknown) {
                    const m = extractErrorMessage(e);
                    vscode.window.showErrorMessage(`Failed to drop: ${m}`);
                }
            }
            return true;

        case 'showFile':
            if (msg.index !== undefined && msg.filePath) {
                const fileName = (msg.filePath as string).split('/').pop() ?? msg.filePath;
                const parentUri = vscode.Uri.parse(
                    `superprompt-forge:/${msg.filePath}?ref=parent&index=${msg.index}`,
                );
                const stashUri = vscode.Uri.parse(
                    `superprompt-forge:/${msg.filePath}?ref=stash&index=${msg.index}`,
                );
                try {
                    await vscode.commands.executeCommand(
                        'vscode.diff',
                        parentUri,
                        stashUri,
                        `${fileName} (stash@{${msg.index}})`,
                        { preview: true },
                    );
                } catch (e: unknown) {
                    const m = extractErrorMessage(e);
                    vscode.window.showErrorMessage(`Failed to show diff: ${m}`);
                }
            }
            return true;

        case 'getFileDiff':
            if (msg.index !== undefined && msg.filePath) {
                const diffKey = `${msg.index}:${msg.filePath}`;
                try {
                    const diff = await ctx.gitService.getStashFileDiff(
                        msg.index,
                        msg.filePath,
                    );
                    ctx.postMessage({
                        type: 'fileDiff',
                        key: diffKey,
                        diff: diff || '',
                    });
                } catch {
                    // Git service logs errors to its own output channel
                    ctx.postMessage({
                        type: 'fileDiff',
                        key: diffKey,
                        diff: '',
                    });
                }
            }
            return true;

        case 'createStash':
            await vscode.commands.executeCommand('superprompt-forge.stash');
            await ctx.refresh();
            return true;

        case 'createStashInline': {
            // 8b-ii: Handle inline stash creation from webview form
            const stashMessage = (msg.message as string) ?? '';
            const stashMode = ((msg.mode as string) ?? 'all') as 'all' | 'staged' | 'untracked';
            try {
                await ctx.gitService.createStash(stashMessage || undefined, stashMode);
                vscode.window.showInformationMessage(
                    stashMessage
                        ? `Stashed: "${stashMessage}"`
                        : 'Changes stashed successfully',
                );
            } catch (e: unknown) {
                const m = extractErrorMessage(e);
                vscode.window.showErrorMessage(`Stash failed: ${m}`);
            }
            await ctx.refresh();
            return true;
        }

        case 'clearStashes':
            await vscode.commands.executeCommand('superprompt-forge.clear');
            await ctx.refresh();
            return true;

        default:
            return false;
    }
};
