/**
 * usePRMessages — dispatches extension→webview PR messages to the store.
 */
import { usePRStore, type PullRequestData, type PRCommentData, type PRFileData, type PRReviewData } from '../prStore';
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
        case 'prCreated': {
            s.setCreatingPR(false);
            s.setShowCreatePR(false);
            const createdPR = msg.pr as PullRequestData | undefined;
            if (createdPR) {
                s.selectPR(createdPR.number);
                postMessage('prs.getComments', { prNumber: createdPR.number });
            }
            return true;
        }
        case 'prCreateError':
            s.setCreateError(msg.error as string);
            return true;

        // ─── PR summary generation ───
        case 'prSummaryLoading':
            s.setGeneratingSummary(true);
            return true;
        case 'prSummaryResult':
            s.setGeneratedSummary(msg.summary as string);
            s.setPRSummaryPaneOpen(true);
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

        // ─── PR files (changed files) ───
        case 'prFilesLoading':
            s.setFilesLoading(true);
            return true;
        case 'prFiles':
            s.setPRFiles(msg.files as PRFileData[]);
            return true;
        case 'prFilesError':
            s.setFilesError(msg.message as string);
            return true;

        // ─── File change AI summary ───
        case 'prFilesSummaryLoading':
            s.setFilesSummaryLoading(true);
            return true;
        case 'prFilesSummaryResult':
            s.setFilesSummary(msg.summary as string);
            return true;
        case 'prFilesSummaryError':
            s.setFilesSummaryError(msg.error as string);
            return true;

        // ─── PR reviews (review statuses) ───
        case 'prReviews':
            s.setReviews(msg.reviews as PRReviewData[]);
            return true;

        // ─── Review submission ───
        case 'prReviewSubmitting':
            s.setSubmittingReview(true);
            return true;
        case 'prReviewSubmitted':
            s.addReview(msg.review as PRReviewData);
            return true;
        case 'prReviewError':
            s.setReviewError(msg.message as string);
            return true;

        // ─── PR merge ───
        case 'prMerging':
            s.setMerging(true);
            return true;
        case 'prMerged':
            s.setMerging(false);
            // Update the PR state to merged in the store
            if (s.selectedPRDetail) {
                s.setPRDetail({ ...s.selectedPRDetail, state: 'merged' });
            }
            return true;
        case 'prMergeError':
            s.setMergeError(msg.message as string);
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
