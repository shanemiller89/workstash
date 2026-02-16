/**
 * useIssueMessages — dispatches extension→webview issue messages to the store.
 */
import { useIssueStore, type IssueData, type IssueCommentData } from '../issueStore';
import { useAppStore } from '../appStore';
import { postMessage } from '../vscode';

type Msg = { type: string; [key: string]: unknown };

export function handleIssueMessage(msg: Msg): boolean {
    const s = useIssueStore.getState();

    switch (msg.type) {
        case 'issuesData':
            s.setIssues(msg.payload as IssueData[]);
            return true;
        case 'issuesLoading':
            s.setLoading(true);
            return true;
        case 'issueRepoNotFound':
            s.setRepoNotFound(true);
            return true;
        case 'issueComments':
            if (msg.issueDetail) {
                s.setIssueDetail(msg.issueDetail as IssueData);
            }
            s.setComments(msg.comments as IssueCommentData[]);
            return true;
        case 'issueCommentsLoading':
            s.setCommentsLoading(true);
            return true;
        case 'issueCommentSaving':
            s.setCommentSaving(true);
            return true;
        case 'issueCommentCreated':
            s.addComment(msg.comment as IssueCommentData);
            return true;
        case 'issueStateChanged':
            s.updateIssueState(
                msg.issueNumber as number,
                msg.state as 'open' | 'closed',
            );
            return true;
        case 'issueError':
            s.setError(msg.message as string ?? 'An error occurred');
            s.setCommentsLoading(false);
            s.setCommentSaving(false);
            return true;

        // ─── Deep-link: open a specific issue ───
        case 'openIssue':
            useAppStore.getState().setActiveTab('issues');
            if (msg.issueNumber) {
                s.selectIssue(msg.issueNumber as number);
                postMessage('issues.getComments', { issueNumber: msg.issueNumber as number });
            }
            return true;

        default:
            return false;
    }
}
