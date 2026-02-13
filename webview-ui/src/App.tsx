import React, { useEffect, useCallback } from 'react';
import { useStashStore, type StashData } from './store';
import { useNotesStore, type GistNoteData } from './notesStore';
import { usePRStore, type PullRequestData, type PRCommentData } from './prStore';
import { useIssueStore, type IssueData, type IssueCommentData } from './issueStore';
import { useAppStore } from './appStore';
import { onMessage, postMessage } from './vscode';
import { StashList } from './components/StashList';
import { StashDetail } from './components/StashDetail';
import { TabBar } from './components/TabBar';
import { NotesTab } from './components/NotesTab';
import { PRsTab } from './components/PRsTab';
import { IssuesTab } from './components/IssuesTab';
import { ResizableLayout } from './components/ResizableLayout';

/** Stash master-detail pane (extracted from old App root) */
const StashesTab: React.FC = () => {
    const selectedStashIndex = useStashStore((s) => s.selectedStashIndex);
    const clearSelection = useStashStore((s) => s.clearSelection);

    const handleCloseDetail = useCallback(() => {
        clearSelection();
    }, [clearSelection]);

    const hasSelection = selectedStashIndex !== null;

    return (
        <ResizableLayout
            storageKey="stashes"
            hasSelection={hasSelection}
            backLabel="Back to list"
            onBack={handleCloseDetail}
            listContent={<StashList />}
            detailContent={<StashDetail onClose={handleCloseDetail} />}
        />
    );
};

export const App: React.FC = () => {
    const activeTab = useAppStore((s) => s.activeTab);

    // Listen for all messages from the extension
    useEffect(() => {
        const dispose = onMessage((msg) => {
            const stashStore = useStashStore.getState();
            const notesStore = useNotesStore.getState();
            const appStore = useAppStore.getState();

            switch (msg.type) {
                // ─── Stash messages ───
                case 'stashData':
                    stashStore.setStashes(msg.payload as StashData[]);
                    stashStore.setLoading(false);
                    break;
                case 'loading':
                    stashStore.setLoading(true);
                    break;
                case 'fileDiff':
                    stashStore.setFileDiff(msg.key as string, msg.diff as string);
                    break;

                // ─── Notes messages ───
                case 'notesData':
                    notesStore.setNotes(msg.payload as GistNoteData[]);
                    break;
                case 'notesLoading':
                    notesStore.setLoading(true);
                    break;
                case 'notesSaving':
                    notesStore.setSaving(true);
                    break;
                case 'noteContent': {
                    const ncNoteId = msg.noteId as string;
                    const ncContent = msg.content as string;
                    const ncTitle = msg.title as string | undefined;
                    // Update content in the notes list
                    notesStore.updateNoteInList(ncNoteId, {
                        content: ncContent,
                        ...(ncTitle !== undefined ? { title: ncTitle } : {}),
                    });
                    // If this note is currently selected, populate the editor
                    if (notesStore.selectedNoteId === ncNoteId) {
                        notesStore.setEditingContent(ncContent);
                        notesStore.setLoading(false);
                        notesStore.setDirty(false);
                        if (ncTitle !== undefined) {
                            notesStore.setEditingTitle(ncTitle);
                        }
                    }
                    break;
                }
                case 'noteSaved':
                    notesStore.setSaving(false);
                    notesStore.setDirty(false);
                    if (msg.noteId) {
                        notesStore.updateNoteInList(msg.noteId as string, {
                            ...(msg.title !== undefined ? { title: msg.title as string } : {}),
                            ...(msg.content !== undefined
                                ? { content: msg.content as string }
                                : {}),
                            ...(msg.updatedAt ? { updatedAt: msg.updatedAt as string } : {}),
                        });
                    }
                    break;
                case 'noteCreated': {
                    const newNote = msg.note as GistNoteData;
                    notesStore.addNoteToList(newNote);
                    notesStore.selectNote(newNote.id);
                    break;
                }
                case 'noteDeleted':
                    notesStore.removeNoteFromList(msg.noteId as string);
                    break;
                case 'noteVisibilityChanged': {
                    // Visibility toggle deletes + re-creates the gist, so the ID changes
                    const oldId = msg.oldNoteId as string;
                    const newNote = msg.note as GistNoteData;
                    notesStore.removeNoteFromList(oldId);
                    notesStore.addNoteToList(newNote);
                    notesStore.selectNote(newNote.id);
                    notesStore.setLoading(false);
                    break;
                }
                case 'authStatus':
                    notesStore.setAuthenticated(
                        msg.authenticated as boolean,
                        (msg.username as string) ?? null,
                    );
                    break;
                case 'notesError':
                    notesStore.setLoading(false);
                    notesStore.setSaving(false);
                    break;

                // ─── Deep-link: open a specific note ───
                case 'openNote':
                    appStore.setActiveTab('notes');
                    if (msg.noteId) {
                        notesStore.selectNote(msg.noteId as string);
                    }
                    break;

                // ─── Dirty switch confirmation result ───
                case 'confirmDirtySwitchResult':
                    if (msg.confirmed && msg.targetNoteId) {
                        notesStore.setDirty(false);
                        notesStore.selectNote(msg.targetNoteId as string);
                    }
                    break;

                // ─── PR messages ───
                case 'prsData': {
                    const prStore = usePRStore.getState();
                    prStore.setPRs(msg.payload as PullRequestData[]);
                    break;
                }
                case 'prsLoading': {
                    const prStore = usePRStore.getState();
                    prStore.setLoading(true);
                    break;
                }
                case 'prRepoNotFound': {
                    const prStore = usePRStore.getState();
                    prStore.setRepoNotFound(true);
                    break;
                }
                case 'prComments': {
                    const prStore = usePRStore.getState();
                    if (msg.prDetail) {
                        prStore.setPRDetail(msg.prDetail as PullRequestData);
                    }
                    prStore.setComments(msg.comments as PRCommentData[]);
                    break;
                }
                case 'prCommentsLoading': {
                    const prStore = usePRStore.getState();
                    prStore.setCommentsLoading(true);
                    break;
                }
                case 'prCommentSaving': {
                    const prStore = usePRStore.getState();
                    prStore.setCommentSaving(true);
                    break;
                }
                case 'prCommentCreated': {
                    const prStore = usePRStore.getState();
                    prStore.addComment(msg.comment as PRCommentData);
                    break;
                }
                case 'prThreadResolved': {
                    const prStore = usePRStore.getState();
                    prStore.updateThreadResolved(
                        msg.threadId as string,
                        msg.isResolved as boolean,
                        (msg.resolvedBy as string | null) ?? null,
                    );
                    break;
                }
                case 'prError': {
                    const prStore = usePRStore.getState();
                    prStore.setLoading(false);
                    prStore.setCommentsLoading(false);
                    prStore.setCommentSaving(false);
                    prStore.setRequestingReview(false);
                    break;
                }

                // ─── PR reviewer messages ───
                case 'prCollaborators': {
                    const prStore = usePRStore.getState();
                    prStore.setCollaborators(
                        msg.collaborators as { login: string; avatarUrl: string }[],
                    );
                    break;
                }
                case 'prRequestingReview': {
                    const prStore = usePRStore.getState();
                    prStore.setRequestingReview(true);
                    break;
                }
                case 'prReviewRequested': {
                    const prStore = usePRStore.getState();
                    prStore.updateRequestedReviewers(
                        msg.reviewers as { login: string; avatarUrl: string }[],
                    );
                    break;
                }
                case 'prReviewRequestRemoved': {
                    const prStore = usePRStore.getState();
                    const detail = prStore.selectedPRDetail;
                    if (detail) {
                        const updated = detail.requestedReviewers.filter(
                            (r) => r.login !== (msg.reviewer as string),
                        );
                        prStore.updateRequestedReviewers(updated);
                    }
                    break;
                }

                // ─── Deep-link: open a specific PR ───
                case 'openPR':
                    appStore.setActiveTab('prs');
                    if (msg.prNumber) {
                        const prStore = usePRStore.getState();
                        prStore.selectPR(msg.prNumber as number);
                        postMessage('prs.getComments', { prNumber: msg.prNumber });
                    }
                    break;

                // ─── Issue messages ───
                case 'issuesData': {
                    const issueStore = useIssueStore.getState();
                    issueStore.setIssues(msg.payload as IssueData[]);
                    break;
                }
                case 'issuesLoading': {
                    const issueStore = useIssueStore.getState();
                    issueStore.setLoading(true);
                    break;
                }
                case 'issueRepoNotFound': {
                    const issueStore = useIssueStore.getState();
                    issueStore.setRepoNotFound(true);
                    break;
                }
                case 'issueComments': {
                    const issueStore = useIssueStore.getState();
                    if (msg.issueDetail) {
                        issueStore.setIssueDetail(msg.issueDetail as IssueData);
                    }
                    issueStore.setComments(msg.comments as IssueCommentData[]);
                    break;
                }
                case 'issueCommentsLoading': {
                    const issueStore = useIssueStore.getState();
                    issueStore.setCommentsLoading(true);
                    break;
                }
                case 'issueCommentSaving': {
                    const issueStore = useIssueStore.getState();
                    issueStore.setCommentSaving(true);
                    break;
                }
                case 'issueCommentCreated': {
                    const issueStore = useIssueStore.getState();
                    issueStore.addComment(msg.comment as IssueCommentData);
                    break;
                }
                case 'issueStateChanged': {
                    const issueStore = useIssueStore.getState();
                    issueStore.updateIssueState(
                        msg.issueNumber as number,
                        msg.state as 'open' | 'closed',
                    );
                    break;
                }
                case 'issueError': {
                    const issueStore = useIssueStore.getState();
                    issueStore.setLoading(false);
                    issueStore.setCommentsLoading(false);
                    issueStore.setCommentSaving(false);
                    break;
                }

                // ─── Deep-link: open a specific issue ───
                case 'openIssue':
                    appStore.setActiveTab('issues');
                    if (msg.issueNumber) {
                        const issueStore = useIssueStore.getState();
                        issueStore.selectIssue(msg.issueNumber as number);
                        postMessage('issues.getComments', { issueNumber: msg.issueNumber });
                    }
                    break;
            }
        });

        // Request initial data
        postMessage('ready');

        return dispose;
    }, []);

    return (
        <div className="h-screen bg-bg text-fg text-[13px] flex flex-col">
            <TabBar />
            <div className="flex-1 overflow-hidden">
                {activeTab === 'stashes' ? (
                    <StashesTab />
                ) : activeTab === 'notes' ? (
                    <NotesTab />
                ) : activeTab === 'prs' ? (
                    <PRsTab />
                ) : (
                    <IssuesTab />
                )}
            </div>
        </div>
    );
};
