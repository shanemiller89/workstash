import * as vscode from 'vscode';
import { IssueService } from '../issueService';
import { extractErrorMessage } from '../utils';
import type { HandlerContext, MessageHandler } from './types';

/** Handle all `issues.*` messages from the webview. */
export const handleIssueMessage: MessageHandler = async (ctx, msg) => {
    switch (msg.type) {
        case 'issues.refresh':
            await ctx.refreshIssues(msg.state as 'open' | 'closed' | 'all' | undefined);
            return true;

        case 'issues.signIn':
            await vscode.commands.executeCommand('superprompt-forge.issues.signIn');
            await ctx.sendAuthStatus();
            await ctx.refreshIssues();
            return true;

        case 'issues.filter':
            if (msg.state) {
                await ctx.refreshIssues(msg.state as 'open' | 'closed' | 'all');
            }
            return true;

        case 'issues.getComments':
            if (msg.issueNumber !== undefined) {
                await ctx.sendIssueComments(msg.issueNumber);
            }
            return true;

        case 'issues.createComment':
            if (msg.issueNumber !== undefined && msg.body && ctx.issueService) {
                try {
                    const repoInfo = await ctx.getRepoInfo();
                    if (!repoInfo) { return true; }
                    ctx.postMessage({ type: 'issueCommentSaving' });
                    const comment = await ctx.issueService.createComment(
                        repoInfo.owner,
                        repoInfo.repo,
                        msg.issueNumber,
                        msg.body,
                    );
                    ctx.postMessage({
                        type: 'issueCommentCreated',
                        comment: IssueService.toCommentData(comment),
                    });
                } catch (e: unknown) {
                    const m = extractErrorMessage(e);
                    vscode.window.showErrorMessage(`Failed to post comment: ${m}`);
                    ctx.postMessage({ type: 'issueError', message: m });
                }
            }
            return true;

        case 'issues.close':
            if (msg.issueNumber !== undefined && ctx.issueService) {
                try {
                    const repoInfo = await ctx.getRepoInfo();
                    if (!repoInfo) { return true; }
                    const reason = (msg.stateReason === 'not_planned' ? 'not_planned' : 'completed') as 'completed' | 'not_planned';
                    const updated = await ctx.issueService.closeIssue(
                        repoInfo.owner,
                        repoInfo.repo,
                        msg.issueNumber,
                        reason,
                    );
                    ctx.postMessage({
                        type: 'issueStateChanged',
                        issueNumber: msg.issueNumber,
                        state: updated.state,
                    });
                    vscode.window.showInformationMessage(`Closed issue #${msg.issueNumber}`);
                } catch (e: unknown) {
                    const m = extractErrorMessage(e);
                    vscode.window.showErrorMessage(`Failed to close issue: ${m}`);
                    ctx.postMessage({ type: 'issueError', message: m });
                }
            }
            return true;

        case 'issues.reopen':
            if (msg.issueNumber !== undefined && ctx.issueService) {
                try {
                    const repoInfo = await ctx.getRepoInfo();
                    if (!repoInfo) { return true; }
                    const updated = await ctx.issueService.reopenIssue(
                        repoInfo.owner,
                        repoInfo.repo,
                        msg.issueNumber,
                    );
                    ctx.postMessage({
                        type: 'issueStateChanged',
                        issueNumber: msg.issueNumber,
                        state: updated.state,
                    });
                    vscode.window.showInformationMessage(`Reopened issue #${msg.issueNumber}`);
                } catch (e: unknown) {
                    const m = extractErrorMessage(e);
                    vscode.window.showErrorMessage(`Failed to reopen issue: ${m}`);
                    ctx.postMessage({ type: 'issueError', message: m });
                }
            }
            return true;

        case 'issues.openInBrowser':
            if (msg.issueNumber !== undefined) {
                const repoInfo = await ctx.getRepoInfo();
                if (repoInfo) {
                    const url = `https://github.com/${repoInfo.owner}/${repoInfo.repo}/issues/${msg.issueNumber}`;
                    await vscode.env.openExternal(vscode.Uri.parse(url));
                }
            }
            return true;

        case 'issues.copyComment':
            if (msg.body) {
                await vscode.env.clipboard.writeText(msg.body);
                vscode.window.showInformationMessage('Comment copied to clipboard');
            }
            return true;

        default:
            return false;
    }
};
