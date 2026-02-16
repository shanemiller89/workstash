/**
 * usePRMessages — dispatches extension→webview PR messages to the store.
 */
import { usePRStore, type PullRequestData, type PRCommentData } from '../prStore';
import { useAppStore } from '../appStore';
import { postMessage } from '../vscode';

type Msg = { type: string; [key: string]: unknown };

export function handlePRMessage(msg: Msg): boolean {
    const s = usePRStore.getState();

    switch (msg.type) {
        case 'prsData':
            s.setPRs(msg.payload as PullRequestData[]);
            return true;
        case 'prsLoading':
            s.setLoading(true);
            return true;
        case 'prRepoNotFound':
            s.setRepoNotFound(true);
            return true;
        case 'prComments':
            if (msg.prDetail) {
                s.setPRDetail(msg.prDetail as PullRequestData);
            }
            s.setComments(msg.comments as PRCommentData[]);
            return true;
        case 'prCommentsLoading':
            s.setCommentsLoading(true);
            return true;
        case 'prCommentSaving':
            s.setCommentSaving(true);
            return true;
        case 'prCommentCreated':
            s.addComment(msg.comment as PRCommentData);
            return true;
        case 'prThreadResolved':
            s.updateThreadResolved(
                msg.threadId as string,
                msg.isResolved as boolean,
                (msg.resolvedBy as string | null) ?? null,
            );
            return true;
        case 'prError':
            s.setError(msg.message as string ?? 'An error occurred');
            s.setCommentsLoading(false);
            s.setCommentSaving(false);
            s.setRequestingReview(false);
            return true;

        // ─── PR reviewer messages ───
        case 'prCollaborators':
            s.setCollaborators(
                msg.collaborators as { login: string; avatarUrl: string }[],
            );
            return true;
        case 'prRequestingReview':
            s.setRequestingReview(true);
            return true;
        case 'prReviewRequested':
            s.updateRequestedReviewers(
                msg.reviewers as { login: string; avatarUrl: string }[],
            );
            return true;
        case 'prReviewRequestRemoved': {
            const detail = s.selectedPRDetail;
            if (detail) {
                const updated = detail.requestedReviewers.filter(
                    (r) => r.login !== (msg.reviewer as string),
                );
                s.updateRequestedReviewers(updated);
            }
            return true;
        }

        // ─── PR creation messages ───
        case 'prBranches':
            s.setBranches(
                msg.branches as string[],
                (msg.currentBranch as string) ?? null,
            );
            return true;
        case 'prCreating':
            s.setCreatingPR(true);
            return true;
        case 'prCreated':
            s.setCreatingPR(false);
            s.setShowCreatePR(false);
            if (msg.prNumber) {
                s.selectPR(msg.prNumber as number);
                postMessage('prs.getComments', { prNumber: msg.prNumber as number });
            }
            return true;
        case 'prCreateError':
            s.setCreateError(msg.error as string);
            return true;

        // ─── PR summary generation ───
        case 'prSummaryLoading':
            s.setGeneratingSummary(true);
            return true;
        case 'prSummaryResult':
            s.setGeneratedSummary(msg.summary as string);
            return true;
        case 'prSummaryError':
            s.setSummaryError(msg.error as string);
            return true;

        // ─── PR body editing ───
        case 'prBodySaving':
            s.setBodySaving(true);
            return true;
        case 'prBodySaved':
            s.setBodySaving(false);
            if (msg.prDetail) {
                s.setPRDetail(msg.prDetail as PullRequestData);
            }
            return true;
        case 'prBodySaveError':
            s.setBodySaving(false);
            return true;

        // ─── Deep-link: open a specific PR ───
        case 'openPR':
            useAppStore.getState().setActiveTab('prs');
            if (msg.prNumber) {
                s.selectPR(msg.prNumber as number);
                postMessage('prs.getComments', { prNumber: msg.prNumber as number });
            }
            return true;

        default:
            return false;
    }
}
