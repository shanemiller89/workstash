import * as vscode from 'vscode';
import { AiService } from '../aiService';
import { PrService } from '../prService';
import { extractErrorMessage } from '../utils';
import type { HandlerContext, MessageHandler } from './types';

/** Handle all `prs.*` messages from the webview. */
export const handlePrMessage: MessageHandler = async (ctx, msg) => {
    switch (msg.type) {
        case 'prs.refresh':
            await ctx.refreshPRs();
            return true;

        case 'prs.signIn':
            await vscode.commands.executeCommand('superprompt-forge.prs.signIn');
            await ctx.sendAuthStatus();
            await ctx.refreshPRs();
            return true;

        case 'prs.filter':
            // State filter changed in webview — re-fetch with new filter
            if (msg.state) {
                await ctx.refreshPRs(
                    msg.state as 'open' | 'closed' | 'merged' | 'all',
                    msg.authorFilter as 'all' | 'authored' | 'assigned' | 'review-requested' | undefined,
                );
            }
            return true;

        case 'prs.getComments':
            if (msg.prNumber !== undefined) {
                await ctx.sendPRComments(msg.prNumber);
            }
            return true;

        case 'prs.createComment':
            if (msg.prNumber !== undefined && msg.body && ctx.prService) {
                try {
                    const repoInfo = await ctx.getRepoInfo();
                    if (!repoInfo) { return true; }
                    ctx.postMessage({ type: 'prCommentSaving' });
                    const comment = await ctx.prService.createComment(
                        repoInfo.owner,
                        repoInfo.repo,
                        msg.prNumber,
                        msg.body,
                    );
                    ctx.postMessage({
                        type: 'prCommentCreated',
                        comment: PrService.toCommentData(comment),
                    });
                } catch (e: unknown) {
                    const m = extractErrorMessage(e);
                    vscode.window.showErrorMessage(`Failed to post comment: ${m}`);
                    ctx.postMessage({ type: 'prError', message: m });
                }
            }
            return true;

        case 'prs.replyToComment':
            if (msg.prNumber !== undefined && msg.commentId !== undefined && msg.body && ctx.prService) {
                try {
                    const repoInfo = await ctx.getRepoInfo();
                    if (!repoInfo) { return true; }
                    ctx.postMessage({ type: 'prCommentSaving' });
                    const reply = await ctx.prService.replyToReviewComment(
                        repoInfo.owner,
                        repoInfo.repo,
                        msg.prNumber,
                        msg.commentId,
                        msg.body,
                    );
                    // Inherit thread data from the parent comment
                    if (msg.threadId) {
                        reply.threadId = msg.threadId;
                        reply.isResolved = msg.isResolved ?? false;
                        reply.resolvedBy = msg.resolvedBy ?? null;
                    }
                    ctx.postMessage({
                        type: 'prCommentCreated',
                        comment: PrService.toCommentData(reply),
                    });
                } catch (e: unknown) {
                    const m = extractErrorMessage(e);
                    vscode.window.showErrorMessage(`Failed to post reply: ${m}`);
                    ctx.postMessage({ type: 'prError', message: m });
                }
            }
            return true;

        case 'prs.resolveThread':
            if (msg.threadId && ctx.prService) {
                try {
                    const result = await ctx.prService.resolveReviewThread(msg.threadId);
                    ctx.postMessage({
                        type: 'prThreadResolved',
                        threadId: msg.threadId,
                        isResolved: result.isResolved,
                        resolvedBy: result.resolvedBy,
                    });
                } catch (e: unknown) {
                    const m = extractErrorMessage(e);
                    vscode.window.showErrorMessage(`Failed to resolve thread: ${m}`);
                    ctx.postMessage({ type: 'prError', message: m });
                }
            }
            return true;

        case 'prs.unresolveThread':
            if (msg.threadId && ctx.prService) {
                try {
                    const result = await ctx.prService.unresolveReviewThread(msg.threadId);
                    ctx.postMessage({
                        type: 'prThreadResolved',
                        threadId: msg.threadId,
                        isResolved: result.isResolved,
                        resolvedBy: result.resolvedBy,
                    });
                } catch (e: unknown) {
                    const m = extractErrorMessage(e);
                    vscode.window.showErrorMessage(`Failed to unresolve thread: ${m}`);
                    ctx.postMessage({ type: 'prError', message: m });
                }
            }
            return true;

        case 'prs.openInBrowser':
            if (msg.prNumber !== undefined) {
                const repoInfo = await ctx.getRepoInfo();
                if (repoInfo) {
                    const url = `https://github.com/${repoInfo.owner}/${repoInfo.repo}/pull/${msg.prNumber}`;
                    await vscode.env.openExternal(vscode.Uri.parse(url));
                }
            }
            return true;

        case 'prs.copyComment':
            if (msg.body) {
                await vscode.env.clipboard.writeText(msg.body);
                vscode.window.showInformationMessage('Comment copied to clipboard');
            }
            return true;

        case 'prs.copyAllComments':
            if (msg.body) {
                await vscode.env.clipboard.writeText(msg.body);
                vscode.window.showInformationMessage('All comments copied to clipboard');
            }
            return true;

        case 'prs.getCollaborators':
            if (ctx.prService) {
                try {
                    const repoInfo = await ctx.getRepoInfo();
                    if (!repoInfo) { return true; }
                    const collaborators = await ctx.prService.getCollaborators(
                        repoInfo.owner,
                        repoInfo.repo,
                    );
                    ctx.postMessage({
                        type: 'prCollaborators',
                        collaborators,
                    });
                } catch (e: unknown) {
                    const m = extractErrorMessage(e);
                    vscode.window.showErrorMessage(`Failed to fetch collaborators: ${m}`);
                }
            }
            return true;

        case 'prs.requestReview':
            if (msg.prNumber !== undefined && msg.reviewers?.length && ctx.prService) {
                try {
                    const repoInfo = await ctx.getRepoInfo();
                    if (!repoInfo) { return true; }
                    ctx.postMessage({ type: 'prRequestingReview' });
                    const reviewers = await ctx.prService.requestReviewers(
                        repoInfo.owner,
                        repoInfo.repo,
                        msg.prNumber,
                        msg.reviewers,
                    );
                    ctx.postMessage({
                        type: 'prReviewRequested',
                        reviewers,
                    });
                    vscode.window.showInformationMessage(
                        `Review requested from ${msg.reviewers.join(', ')}`,
                    );
                } catch (e: unknown) {
                    const m = extractErrorMessage(e);
                    vscode.window.showErrorMessage(`Failed to request review: ${m}`);
                    ctx.postMessage({ type: 'prError', message: m });
                }
            }
            return true;

        case 'prs.requestCopilotReview':
            if (msg.prNumber !== undefined && ctx.prService) {
                try {
                    const repoInfo = await ctx.getRepoInfo();
                    if (!repoInfo) { return true; }
                    ctx.postMessage({ type: 'prRequestingReview' });
                    await ctx.prService.requestCopilotReview(
                        repoInfo.owner,
                        repoInfo.repo,
                        msg.prNumber,
                    );
                    // Refresh the PR detail to pick up the new reviewer
                    const updatedPR = await ctx.prService.getPullRequest(
                        repoInfo.owner,
                        repoInfo.repo,
                        msg.prNumber,
                    );
                    ctx.postMessage({
                        type: 'prReviewRequested',
                        reviewers: PrService.toData(updatedPR).requestedReviewers,
                    });
                    vscode.window.showInformationMessage(
                        'Copilot code review requested',
                    );
                } catch (e: unknown) {
                    const m = extractErrorMessage(e);
                    vscode.window.showErrorMessage(`Failed to request Copilot review: ${m}`);
                    ctx.postMessage({ type: 'prError', message: m });
                }
            }
            return true;

        case 'prs.removeReviewRequest':
            if (msg.prNumber !== undefined && msg.reviewer && ctx.prService) {
                try {
                    const repoInfo = await ctx.getRepoInfo();
                    if (!repoInfo) { return true; }
                    await ctx.prService.removeReviewRequest(
                        repoInfo.owner,
                        repoInfo.repo,
                        msg.prNumber,
                        [msg.reviewer],
                    );
                    ctx.postMessage({
                        type: 'prReviewRequestRemoved',
                        reviewer: msg.reviewer,
                    });
                } catch (e: unknown) {
                    const m = extractErrorMessage(e);
                    vscode.window.showErrorMessage(`Failed to remove review request: ${m}`);
                    ctx.postMessage({ type: 'prError', message: m });
                }
            }
            return true;

        case 'prs.getBranches': {
            try {
                const branches = await ctx.gitService.listBranches();
                const currentBranch = await ctx.gitService.getCurrentBranch();
                ctx.postMessage({
                    type: 'prBranches',
                    branches,
                    currentBranch: currentBranch ?? null,
                });
            } catch (e: unknown) {
                const m = extractErrorMessage(e);
                ctx.postMessage({ type: 'prError', message: m });
            }
            return true;
        }

        case 'prs.updateBody': {
            if (msg.prNumber && ctx.prService) {
                try {
                    const repoInfo = await ctx.getRepoInfo();
                    if (!repoInfo) { return true; }
                    ctx.postMessage({ type: 'prBodySaving' });
                    const updated = await ctx.prService.updatePullRequest(
                        repoInfo.owner,
                        repoInfo.repo,
                        msg.prNumber,
                        { body: msg.body ?? '' },
                    );
                    ctx.postMessage({
                        type: 'prBodySaved',
                        prDetail: PrService.toData(updated),
                    });
                } catch (e: unknown) {
                    const m = extractErrorMessage(e);
                    vscode.window.showErrorMessage(`Failed to update PR: ${m}`);
                    ctx.postMessage({ type: 'prBodySaveError', error: m });
                }
            }
            return true;
        }

        case 'prs.createPR': {
            if (msg.title && msg.headBranch && msg.baseBranch && ctx.prService) {
                try {
                    const repoInfo = await ctx.getRepoInfo();
                    if (!repoInfo) { return true; }
                    ctx.postMessage({ type: 'prCreating' });
                    const pr = await ctx.prService.createPullRequest(
                        repoInfo.owner,
                        repoInfo.repo,
                        msg.title,
                        msg.body ?? '',
                        msg.headBranch,
                        msg.baseBranch,
                        msg.draft ?? false,
                    );
                    ctx.postMessage({
                        type: 'prCreated',
                        pr: PrService.toData(pr),
                    });
                    vscode.window.showInformationMessage(
                        `PR #${pr.number} created: ${pr.title}`,
                    );
                    // Refresh the PR list to include the new PR
                    await ctx.refreshPRs();
                } catch (e: unknown) {
                    const m = extractErrorMessage(e);
                    vscode.window.showErrorMessage(`Failed to create PR: ${m}`);
                    ctx.postMessage({ type: 'prCreateError', message: m });
                }
            }
            return true;
        }

        case 'prs.generateSummary': {
            if (!AiService.isAvailable()) {
                ctx.postMessage({ type: 'prSummaryError', error: 'AI features require GitHub Copilot or Gemini' });
                return true;
            }
            const summaryBaseBranch = (msg.baseBranch as string) ?? 'main';
            try {
                ctx.postMessage({ type: 'prSummaryLoading' });

                // Gather diff, stat, and commit log against the base branch
                const [diff, stat, commitLog] = await Promise.all([
                    ctx.gitService.getDiffAgainstBase(summaryBaseBranch).catch(() => ''),
                    ctx.gitService.getDiffStatAgainstBase(summaryBaseBranch).catch(() => ''),
                    ctx.gitService.getCommitLogAgainstBase(summaryBaseBranch).catch(() => ''),
                ]);

                if (!diff && !stat && !commitLog) {
                    ctx.postMessage({
                        type: 'prSummaryError',
                        error: `No changes found between current branch and ${summaryBaseBranch}`,
                    });
                    return true;
                }

                // Truncate diff if too large (keep first 8000 chars)
                const truncatedDiff = diff.length > 8000
                    ? diff.slice(0, 8000) + `\n\n... (diff truncated, ${diff.length} total chars)`
                    : diff;

                const contextData = [
                    '## Diff Statistics',
                    stat || 'No stat available',
                    '',
                    '## Commit Log',
                    commitLog || 'No commits',
                    '',
                    '## Full Diff',
                    truncatedDiff || 'No diff available',
                ].join('\n');

                // Use custom or default system prompt
                const customSystemPrompt = (msg.systemPrompt as string | undefined)?.trim();
                const systemPrompt = customSystemPrompt ||
                    `You are a developer assistant creating a pull request description.
Analyze the provided diff, commit log, and statistics to generate a clear, well-structured PR description.

Format the output as follows:
## Summary
A 1-2 sentence overview of the changes.

## Changes
- Bullet points describing each meaningful change
- Group related changes together
- Focus on WHAT changed and WHY, not line-by-line details

## Testing
Suggest how these changes should be tested.

Keep it concise and actionable. Use markdown formatting.
Do NOT include the diff itself in the output.

## Files Changed
Include a markdown table at the end with columns: File, Change Context, Reason.
List each changed file, a brief description of what changed in that file, and why the change was made.`;

                const result = await ctx.aiService.summarize(
                    'pr-summary',
                    contextData,
                    systemPrompt,
                );
                ctx.postMessage({
                    type: 'prSummaryResult',
                    summary: result,
                });
            } catch (e: unknown) {
                const m = extractErrorMessage(e);
                ctx.postMessage({
                    type: 'prSummaryError',
                    error: m,
                });
            }
            return true;
        }

        default:
            return false;
    }
};
