import * as vscode from 'vscode';
import { AiService } from '../aiService';
import { PrService, type PRReviewEvent, type PRMergeMethod, type PendingInlineComment } from '../prService';
import { extractErrorMessage } from '../utils';
import type { MessageHandler } from './types';

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
            if (msg.prNumber !== undefined && ctx.prService) {
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

        // ─── File Change AI Summary ───
        case 'prs.generateFilesSummary': {
            if (!AiService.isAvailable()) {
                ctx.postMessage({ type: 'prFilesSummaryError', error: 'AI features require GitHub Copilot or Gemini' });
                return true;
            }
            const filesSummaryPrNumber = msg.prNumber as number | undefined;
            const customSystemPrompt = (msg.customSystemPrompt as string | undefined)?.trim() || '';
            if (filesSummaryPrNumber === undefined || !ctx.prService) { return true; }

            try {
                ctx.postMessage({ type: 'prFilesSummaryLoading' });

                const repoInfo = await ctx.getRepoInfo();
                if (!repoInfo) {
                    ctx.postMessage({ type: 'prFilesSummaryError', error: 'Could not determine repository' });
                    return true;
                }

                const files = await ctx.prService.getPullRequestFiles(
                    repoInfo.owner, repoInfo.repo, filesSummaryPrNumber,
                );

                if (files.length === 0) {
                    ctx.postMessage({ type: 'prFilesSummaryError', error: 'No changed files found' });
                    return true;
                }

                // Build context from file patches
                const fileContextParts = files.map((f) => {
                    const stats = `+${f.additions}/-${f.deletions}`;
                    const patch = f.patch
                        ? (f.patch.length > 3000
                            ? f.patch.slice(0, 3000) + '\n... (patch truncated)'
                            : f.patch)
                        : '(binary file or no diff available)';
                    return `### ${f.filename} [${f.status}] (${stats})\n\`\`\`diff\n${patch}\n\`\`\``;
                });

                const contextData = [
                    `## Pull Request #${filesSummaryPrNumber} — ${files.length} files changed`,
                    '',
                    ...fileContextParts,
                ].join('\n\n');

                const defaultPrompt = `You are a senior software engineer reviewing a pull request.

## Inputs You Will Receive
1. A PR diff (changed files with hunks).
2. "Generated file summaries" produced earlier in this workflow — treat these as **provisional and potentially incomplete**.

## Goal
Help the author and reviewers quickly grok what changed, why, and what could go wrong — by building ground truth from the diff, cross-referencing it against the generated summaries, then regenerating a corrected final review.

## Hard Rules
- Do **not** reproduce diff hunks.
- Be concise but specific: reference actual function names, variables, types, routes, components, SQL tables, selectors, etc.
- When something is unclear from the diff context, say so explicitly and ask a concrete follow-up question.
- Every "What changed" claim must be directly grounded in the diff.
- Every "Why" claim must be explicitly labeled as inference.
- Prefer concrete language: "changes X from A → B" over "updates X" or "refactored stuff."

---

# Phase 1 — Build Per-File Ground Truth

For EACH changed file:

## \`path/to/file.ext\`
**Change type:** \`Behavior change | Refactor / restructuring | Bug fix | Test-only | Chore / tooling | Unclear from diff\`

- **What changed:** 1–4 bullets describing concrete modifications (add/remove/rename/refactor/logic change), referencing real identifiers from the diff.
- **Why (inferred):** 1–2 bullets on the likely purpose, inferred strictly from diff context. Label these as inference.
- **Behavioral impact:** \`None | Low | Medium | High\` — with a 1-line justification.
- **Risk flags:** Bullets covering potential issues such as correctness/edge cases, backward compatibility, breaking API/contract changes, error handling gaps, null/undefined handling, security/auth/data exposure, performance (N+1, extra renders, expensive loops), type or schema drift, and migration mismatches. Write \`None noted\` if none apply.
- **Suggested checks:** 2–5 bullets for how to validate (tests to run/add, scenarios to verify, data or config to inspect, logs/monitoring to check).

After all files:

## Overall Summary (Phase 1)
2–3 sentences describing what the PR accomplishes at a high level — feature, bugfix, or refactor — and where risk concentrates.

---

# Phase 2 — Cross-Reference Generated Summaries (Self-Audit)

Compare your Phase 1 per-file ground truth against each file's generated summary.

## Summary Cross-Check

For each file:
- **Generated summary claims:** _(1-sentence paraphrase — do not quote verbatim)_
- **Diff actually shows:** _(your Phase 1 ground truth, 1 sentence)_
- **Mismatch?** \`Yes / No\`
  - If **Yes**, classify:
    - \`Missing change\` — summary omitted something important
    - \`Incorrect claim\` — summary stated something unsupported by the diff
    - \`Understated impact\` / \`Overstated impact\`
    - \`Wrong inferred intent\`
  - **Correction:** 1–2 bullets with the corrected understanding.

Also include:
- **Potentially overlooked areas:** bullets for files/concerns that _should_ have been touched but weren't (e.g., tests, types, migrations, docs, feature flags, call sites for changed exports).
- **Risk hotspots:** top 1–5 bullets across the whole PR — the most likely failure modes.

---

# Phase 3 — Regenerated Final Review

Rewrite the complete review incorporating all corrections and additions from Phase 2. The reader should be able to rely on this section alone.

## Final Review (Regenerated)

Start with a **2–3 sentence Overall Summary** — what the PR accomplishes and where risk concentrates.

Then, for each file (same format as Phase 1, tightened to the most important points):

## \`path/to/file.ext\`
**Change type:** \`...\`
- **What changed:** ...
- **Why (inferred):** ...
- **Behavioral impact:** ...
- **Risk flags:** ...
- **Suggested checks:** ...

Close with:

### Top Risks (ranked, highest severity first)
3–7 bullets. If a public API changed (exports, function signatures, route contracts, schema/types), call it out here and list impacted call sites/files if visible in the diff.

### Required Follow-Ups
Bullets for must-fix items before merge. Write \`None\` if not applicable.

### Nice-to-Haves
Bullets for optional improvements or deferred cleanup.`;

                const systemPrompt = customSystemPrompt || defaultPrompt;

                const result = await ctx.aiService.summarize(
                    'pr-files-summary',
                    contextData,
                    systemPrompt,
                );
                ctx.postMessage({
                    type: 'prFilesSummaryResult',
                    summary: result,
                });
            } catch (e: unknown) {
                const m = extractErrorMessage(e);
                ctx.postMessage({
                    type: 'prFilesSummaryError',
                    error: m,
                });
            }
            return true;
        }

        // ─── PR Files (Changed Files) ───
        case 'prs.getFiles': {
            if (msg.prNumber !== undefined && ctx.prService) {
                try {
                    const repoInfo = await ctx.getRepoInfo();
                    if (!repoInfo) { return true; }
                    ctx.postMessage({ type: 'prFilesLoading' });
                    const files = await ctx.prService.getPullRequestFiles(
                        repoInfo.owner,
                        repoInfo.repo,
                        msg.prNumber as number,
                    );
                    ctx.postMessage({
                        type: 'prFiles',
                        files: files.map(PrService.toFileData),
                    });
                } catch (e: unknown) {
                    const m = extractErrorMessage(e);
                    vscode.window.showErrorMessage(`Failed to fetch PR files: ${m}`);
                    ctx.postMessage({ type: 'prFilesError', message: m });
                }
            }
            return true;
        }

        // ─── PR Reviews (review statuses) ───
        case 'prs.getReviews': {
            if (msg.prNumber !== undefined && ctx.prService) {
                try {
                    const repoInfo = await ctx.getRepoInfo();
                    if (!repoInfo) { return true; }
                    const reviews = await ctx.prService.getReviews(
                        repoInfo.owner,
                        repoInfo.repo,
                        msg.prNumber as number,
                    );
                    ctx.postMessage({
                        type: 'prReviews',
                        reviews: reviews.map(PrService.toReviewData),
                    });
                } catch (e: unknown) {
                    const m = extractErrorMessage(e);
                    vscode.window.showErrorMessage(`Failed to fetch reviews: ${m}`);
                    ctx.postMessage({ type: 'prError', message: m });
                }
            }
            return true;
        }

        // ─── Submit Review (approve / request changes / comment) ───
        case 'prs.submitReview': {
            if (msg.prNumber !== undefined && msg.event && ctx.prService) {
                try {
                    const repoInfo = await ctx.getRepoInfo();
                    if (!repoInfo) { return true; }
                    ctx.postMessage({ type: 'prReviewSubmitting' });

                    const review = await ctx.prService.submitReview(
                        repoInfo.owner,
                        repoInfo.repo,
                        msg.prNumber as number,
                        msg.event as PRReviewEvent,
                        msg.body as string | undefined,
                        msg.comments as PendingInlineComment[] | undefined,
                    );

                    ctx.postMessage({
                        type: 'prReviewSubmitted',
                        review: PrService.toReviewData(review),
                    });

                    const eventLabel = msg.event === 'APPROVE'
                        ? 'approved'
                        : msg.event === 'REQUEST_CHANGES'
                            ? 'requested changes on'
                            : 'commented on';
                    vscode.window.showInformationMessage(
                        `Successfully ${eventLabel} PR #${msg.prNumber}`,
                    );

                    // Refresh comments to pick up any new inline review comments
                    await ctx.sendPRComments(msg.prNumber as number);
                } catch (e: unknown) {
                    const m = extractErrorMessage(e);
                    vscode.window.showErrorMessage(`Failed to submit review: ${m}`);
                    ctx.postMessage({ type: 'prReviewError', message: m });
                }
            }
            return true;
        }

        // ─── Merge PR ───
        case 'prs.mergePR': {
            if (msg.prNumber !== undefined && ctx.prService) {
                try {
                    const repoInfo = await ctx.getRepoInfo();
                    if (!repoInfo) { return true; }
                    ctx.postMessage({ type: 'prMerging' });

                    const result = await ctx.prService.mergePullRequest(
                        repoInfo.owner,
                        repoInfo.repo,
                        msg.prNumber as number,
                        (msg.mergeMethod as PRMergeMethod) ?? 'merge',
                        msg.commitTitle as string | undefined,
                        msg.commitMessage as string | undefined,
                    );

                    if (result.merged) {
                        ctx.postMessage({
                            type: 'prMerged',
                            sha: result.sha,
                            message: result.message,
                        });
                        vscode.window.showInformationMessage(
                            `PR #${msg.prNumber} merged successfully`,
                        );
                        // Refresh PR list to update state
                        await ctx.refreshPRs();
                    } else {
                        ctx.postMessage({
                            type: 'prMergeError',
                            message: result.message || 'Merge failed',
                        });
                        vscode.window.showErrorMessage(
                            `Failed to merge PR #${msg.prNumber}: ${result.message}`,
                        );
                    }
                } catch (e: unknown) {
                    const m = extractErrorMessage(e);
                    vscode.window.showErrorMessage(`Failed to merge PR: ${m}`);
                    ctx.postMessage({ type: 'prMergeError', message: m });
                }
            }
            return true;
        }

        // ─── GitHub PR Link Navigation ─────────────────────
        case 'navigateToGitHubPR': {
            const linkOwner = msg.owner as string | undefined;
            const linkRepo = msg.repo as string | undefined;
            const linkPrNumber = msg.prNumber as number | undefined;
            if (!linkOwner || !linkRepo || !linkPrNumber || !ctx.prService) {
                return true;
            }

            const currentRepo = await ctx.getRepoInfo();
            const isSameRepo =
                currentRepo &&
                currentRepo.owner.toLowerCase() === linkOwner.toLowerCase() &&
                currentRepo.repo.toLowerCase() === linkRepo.toLowerCase();

            if (isSameRepo) {
                // Same repo — just deep-link to the PR
                ctx.postMessage({ type: 'openPR', prNumber: linkPrNumber });
                return true;
            }

            // Different repo — check access and prompt to switch
            try {
                // Verify the user can access this PR (will throw 404/403 if not)
                await ctx.prService.getPullRequest(linkOwner, linkRepo, linkPrNumber);

                const switchChoice = await vscode.window.showInformationMessage(
                    `PR #${linkPrNumber} is from ${linkOwner}/${linkRepo}. Switch to that repo and open it?`,
                    { modal: false },
                    'Switch & Open',
                    'Open in Browser',
                );

                if (switchChoice === 'Switch & Open') {
                    // Switch repo
                    ctx.setRepoOverride({ owner: linkOwner, repo: linkRepo });
                    await ctx.sendRepoContext();
                    // Refresh GitHub data for the new repo
                    await Promise.all([
                        ctx.refreshPRs(),
                        ctx.refreshIssues(),
                        ctx.refreshProjects(),
                        ctx.refreshWiki(),
                    ]);
                    // Deep-link to the PR
                    ctx.postMessage({ type: 'openPR', prNumber: linkPrNumber });
                } else if (switchChoice === 'Open in Browser') {
                    await vscode.env.openExternal(
                        vscode.Uri.parse(`https://github.com/${linkOwner}/${linkRepo}/pull/${linkPrNumber}`),
                    );
                }
            } catch {
                // Can't access the repo — open in browser
                const fallbackChoice = await vscode.window.showWarningMessage(
                    `You don't appear to have access to ${linkOwner}/${linkRepo}. Open PR #${linkPrNumber} in the browser instead?`,
                    'Open in Browser',
                );
                if (fallbackChoice === 'Open in Browser') {
                    await vscode.env.openExternal(
                        vscode.Uri.parse(`https://github.com/${linkOwner}/${linkRepo}/pull/${linkPrNumber}`),
                    );
                }
            }
            return true;
        }

        default:
            return false;
    }
};
