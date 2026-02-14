import React, { useEffect, useCallback } from 'react';
import { useStashStore, type StashData } from './store';
import { useNotesStore, type GistNoteData } from './notesStore';
import { usePRStore, type PullRequestData, type PRCommentData } from './prStore';
import { useIssueStore, type IssueData, type IssueCommentData } from './issueStore';
import {
    useMattermostStore,
    type MattermostTeamData,
    type MattermostChannelData,
    type MattermostPostData,
    type MattermostUserData,
    type MattermostReactionData,
    type MattermostUserStatusData,
    type MattermostChannelUnreadData,
    type MattermostEmojiData,
    type MattermostFileInfoData,
} from './mattermostStore';
import { useAppStore } from './appStore';
import { onMessage, postMessage } from './vscode';
import { StashList } from './components/StashList';
import { StashDetail } from './components/StashDetail';
import { TabBar } from './components/TabBar';
import { NotesTab } from './components/NotesTab';
import { PRsTab } from './components/PRsTab';
import { IssuesTab } from './components/IssuesTab';
import { MattermostTab } from './components/MattermostTab';
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
                    // Use loadNoteContent to set content+title without marking dirty
                    if (notesStore.selectedNoteId === ncNoteId) {
                        notesStore.loadNoteContent(ncContent, ncTitle);
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

                // ─── Mattermost messages ───
                case 'mattermostConfigured': {
                    const mmStore = useMattermostStore.getState();
                    mmStore.setConfigured(msg.configured as boolean);
                    if (!msg.configured) {
                        mmStore.setLoadingChannels(false);
                    }
                    break;
                }
                case 'mattermostUser': {
                    const mmStore = useMattermostStore.getState();
                    mmStore.setCurrentUser(msg.user as MattermostUserData);
                    break;
                }
                case 'mattermostTeams': {
                    const mmStore = useMattermostStore.getState();
                    mmStore.setTeams(msg.payload as MattermostTeamData[]);
                    break;
                }
                case 'mattermostChannels': {
                    const mmStore = useMattermostStore.getState();
                    mmStore.setChannels(msg.payload as MattermostChannelData[]);
                    if (msg.teamId) {
                        mmStore.selectTeam(msg.teamId as string);
                        // Re-set channels since selectTeam clears them
                        mmStore.setChannels(msg.payload as MattermostChannelData[]);
                    }
                    mmStore.setLoadingChannels(false);
                    break;
                }
                case 'mattermostChannelsAppend': {
                    const mmStore = useMattermostStore.getState();
                    mmStore.appendChannels(msg.payload as MattermostChannelData[]);
                    break;
                }
                case 'mattermostChannelsLoading': {
                    const mmStore = useMattermostStore.getState();
                    mmStore.setLoadingChannels(true);
                    break;
                }
                case 'mattermostData': {
                    const mmStore = useMattermostStore.getState();
                    mmStore.setConfigured(true);
                    if (msg.currentUser) {
                        mmStore.setCurrentUser(msg.currentUser as MattermostUserData);
                    }
                    if (msg.teams) {
                        mmStore.setTeams(msg.teams as MattermostTeamData[]);
                    }
                    if (msg.channels) {
                        mmStore.setChannels(msg.channels as MattermostChannelData[]);
                    }
                    mmStore.setLoadingChannels(false);
                    break;
                }
                case 'mattermostLoading': {
                    const mmStore = useMattermostStore.getState();
                    mmStore.setLoadingChannels(true);
                    break;
                }
                case 'mattermostPosts': {
                    const mmStore = useMattermostStore.getState();
                    const posts = (msg.payload ?? msg.posts) as MattermostPostData[];
                    mmStore.setPosts(posts);
                    mmStore.setHasMorePosts(msg.hasMore as boolean ?? false);
                    mmStore.setLoadingPosts(false);
                    break;
                }
                case 'mattermostOlderPosts': {
                    const mmStore = useMattermostStore.getState();
                    const olderPosts = (msg.payload ?? msg.posts) as MattermostPostData[];
                    mmStore.appendOlderPosts(olderPosts);
                    mmStore.setHasMorePosts(msg.hasMore as boolean ?? false);
                    mmStore.setLoadingPosts(false);
                    break;
                }
                case 'mattermostPostsLoading': {
                    const mmStore = useMattermostStore.getState();
                    mmStore.setLoadingPosts(true);
                    break;
                }
                case 'mattermostSendingPost': {
                    const mmStore = useMattermostStore.getState();
                    mmStore.setSendingMessage(true);
                    break;
                }
                case 'mattermostPostConfirmed': {
                    // Optimistic post confirmed by server — replace pending with real
                    const mmStore = useMattermostStore.getState();
                    if (msg.pendingId && msg.post) {
                        mmStore.confirmPendingPost(msg.pendingId as string, msg.post as MattermostPostData);
                    }
                    mmStore.setSendingMessage(false);
                    break;
                }
                case 'mattermostPostFailed': {
                    // Optimistic post failed — mark as failed with error
                    const mmStore = useMattermostStore.getState();
                    if (msg.pendingId) {
                        mmStore.failPendingPost(msg.pendingId as string, (msg.error as string) ?? 'Send failed');
                    }
                    mmStore.setSendingMessage(false);
                    break;
                }
                case 'mattermostPostSent':
                case 'mattermostPostCreated': {
                    const mmStore = useMattermostStore.getState();
                    if (msg.post) {
                        const createdPost = msg.post as MattermostPostData;
                        mmStore.prependNewPost(createdPost);
                        // If this post is a thread reply in the active thread, add to thread too
                        if (createdPost.rootId && createdPost.rootId === mmStore.activeThreadRootId) {
                            mmStore.appendThreadPost(createdPost);
                        }
                    }
                    mmStore.setSendingMessage(false);
                    break;
                }
                case 'mattermostNotConfigured': {
                    const mmStore = useMattermostStore.getState();
                    mmStore.setConfigured(false);
                    mmStore.setLoadingChannels(false);
                    break;
                }
                case 'mattermostError': {
                    const mmStore = useMattermostStore.getState();
                    mmStore.setLoadingChannels(false);
                    mmStore.setLoadingPosts(false);
                    mmStore.setSendingMessage(false);
                    mmStore.setLoadingThread(false);
                    break;
                }

                // ─── Mattermost DM channels ───
                case 'mattermostDmChannels': {
                    const mmStore = useMattermostStore.getState();
                    mmStore.setDmChannels(msg.payload as MattermostChannelData[]);
                    break;
                }
                case 'mattermostDmChannelsAppend': {
                    const mmStore = useMattermostStore.getState();
                    mmStore.appendDmChannels(msg.payload as MattermostChannelData[]);
                    break;
                }

                // ─── Mattermost WebSocket real-time events ───
                case 'mattermostConnectionStatus': {
                    const mmStore = useMattermostStore.getState();
                    mmStore.setConnected(msg.connected as boolean);
                    if (typeof msg.reconnectAttempt === 'number') {
                        mmStore.setReconnectAttempt(msg.reconnectAttempt as number);
                    }
                    break;
                }

                case 'mattermostNewPost': {
                    const mmStore = useMattermostStore.getState();
                    const newPost = msg.post as MattermostPostData;
                    // Skip if we already have this post (e.g., from optimistic send)
                    const alreadyExists = mmStore.posts.some((p) => p.id === newPost.id);
                    // Add to main channel feed if it belongs to the selected channel
                    if (newPost.channelId === mmStore.selectedChannelId && !alreadyExists) {
                        mmStore.prependNewPost(newPost);
                    }
                    // Also add to thread panel if this is a reply in the active thread
                    if (newPost.rootId && newPost.rootId === mmStore.activeThreadRootId) {
                        const alreadyInThread = mmStore.threadPosts.some((p) => p.id === newPost.id);
                        if (!alreadyInThread) {
                            mmStore.appendThreadPost(newPost);
                        }
                    }
                    break;
                }

                case 'mattermostPostEdited': {
                    const mmStore = useMattermostStore.getState();
                    mmStore.updatePost(msg.post as MattermostPostData);
                    break;
                }

                case 'mattermostPostDeleted': {
                    const mmStore = useMattermostStore.getState();
                    mmStore.removePost(msg.postId as string);
                    break;
                }

                case 'mattermostTyping': {
                    const mmStore = useMattermostStore.getState();
                    mmStore.addTyping(msg.userId as string, msg.username as string ?? msg.userId as string, msg.channelId as string);
                    break;
                }

                case 'mattermostStatusChange': {
                    const mmStore = useMattermostStore.getState();
                    mmStore.updateUserStatus(
                        msg.userId as string,
                        msg.status as 'online' | 'away' | 'offline' | 'dnd',
                    );
                    break;
                }

                // ─── Mattermost User Avatars ───
                case 'mattermostUserAvatars': {
                    const mmStore = useMattermostStore.getState();
                    mmStore.mergeUserAvatars(msg.payload as Record<string, string>);
                    break;
                }

                case 'mattermostReactionAdded': {
                    const mmStore = useMattermostStore.getState();
                    mmStore.addReaction(msg.reaction as MattermostReactionData);
                    break;
                }

                case 'mattermostReactionRemoved': {
                    const mmStore = useMattermostStore.getState();
                    const r = msg.reaction as MattermostReactionData;
                    mmStore.removeReaction(r.userId, r.postId, r.emojiName);
                    break;
                }

                // ─── Mattermost Thread ───
                case 'mattermostThreadLoading': {
                    const mmStore = useMattermostStore.getState();
                    mmStore.setLoadingThread(true);
                    break;
                }

                case 'mattermostThread': {
                    const mmStore = useMattermostStore.getState();
                    mmStore.setThreadPosts(msg.payload as MattermostPostData[]);
                    break;
                }

                // ─── Mattermost User Statuses ───
                case 'mattermostUserStatuses': {
                    const mmStore = useMattermostStore.getState();
                    mmStore.setUserStatuses(msg.payload as MattermostUserStatusData[]);
                    break;
                }

                // ─── Mattermost Reactions (bulk) ───
                case 'mattermostBulkReactions': {
                    const mmStore = useMattermostStore.getState();
                    mmStore.setBulkReactions(msg.payload as MattermostReactionData[]);
                    break;
                }

                case 'mattermostReactions': {
                    const mmStore = useMattermostStore.getState();
                    mmStore.setReactionsForPost(
                        msg.postId as string,
                        msg.payload as MattermostReactionData[],
                    );
                    break;
                }

                // ─── Mattermost Unread ───
                case 'mattermostUnread': {
                    const mmStore = useMattermostStore.getState();
                    mmStore.setUnread(msg.payload as MattermostChannelUnreadData);
                    break;
                }

                case 'mattermostBulkUnreads': {
                    const mmStore = useMattermostStore.getState();
                    mmStore.setBulkUnreads(msg.payload as MattermostChannelUnreadData[]);
                    break;
                }

                case 'mattermostNewPostUnread': {
                    // Increment unread count for channels that aren't currently selected
                    const mmStore = useMattermostStore.getState();
                    const channelId = msg.channelId as string;
                    if (channelId !== mmStore.selectedChannelId) {
                        mmStore.incrementUnread(channelId);
                    }
                    break;
                }

                case 'mattermostMarkedRead': {
                    const mmStore = useMattermostStore.getState();
                    mmStore.markChannelRead(msg.channelId as string);
                    break;
                }

                // ─── Mattermost Edit / Delete / Pin ───
                case 'mattermostPostPinToggled': {
                    const mmStore = useMattermostStore.getState();
                    mmStore.togglePostPin(msg.postId as string, msg.isPinned as boolean);
                    break;
                }

                // ─── Mattermost Search Results ───
                case 'mattermostSearchLoading': {
                    const mmStore = useMattermostStore.getState();
                    mmStore.setIsSearchingMessages(true);
                    break;
                }

                case 'mattermostSearchResults': {
                    const mmStore = useMattermostStore.getState();
                    mmStore.setSearchResults(msg.payload as MattermostPostData[]);
                    break;
                }

                // ─── Mattermost Flagged Posts ───
                case 'mattermostFlaggedPostIds': {
                    const mmStore = useMattermostStore.getState();
                    mmStore.setFlaggedPostIds(msg.payload as string[]);
                    break;
                }

                case 'mattermostPostFlagged': {
                    const mmStore = useMattermostStore.getState();
                    if (msg.flagged) {
                        mmStore.addFlaggedPostId(msg.postId as string);
                    } else {
                        mmStore.removeFlaggedPostId(msg.postId as string);
                    }
                    break;
                }

                // ─── Mattermost User Profile ───
                case 'mattermostUserProfile': {
                    // This is handled by the component that requested it
                    // We use a custom event to deliver it
                    window.dispatchEvent(new CustomEvent('mattermost-user-profile', {
                        detail: { user: msg.user, avatarUrl: msg.avatarUrl },
                    }));
                    break;
                }

                // ─── Mattermost Channel Info ───
                case 'mattermostChannelInfo': {
                    // Dispatch to the requesting component
                    window.dispatchEvent(new CustomEvent('mattermost-channel-info', {
                        detail: msg.payload,
                    }));
                    break;
                }

                // ─── Mattermost File Upload ───
                case 'mattermostFileUploading': {
                    const mmStore = useMattermostStore.getState();
                    mmStore.setIsUploadingFiles(true);
                    break;
                }

                case 'mattermostFilesUploaded': {
                    const mmStore = useMattermostStore.getState();
                    mmStore.setPendingFiles(
                        msg.fileIds as string[],
                        msg.files as MattermostFileInfoData[],
                    );
                    break;
                }

                case 'mattermostFileUploadFailed': {
                    const mmStore = useMattermostStore.getState();
                    mmStore.clearPendingFiles();
                    break;
                }

                // ─── Mattermost DM ───
                case 'mattermostDmCreated': {
                    const mmStore = useMattermostStore.getState();
                    const newDm = msg.channel as MattermostChannelData;
                    // Add to DM channel list and auto-select it
                    mmStore.setDmChannels([...mmStore.dmChannels, newDm]);
                    mmStore.selectChannel(newDm.id, newDm.displayName);
                    postMessage('mattermost.getPosts', { channelId: newDm.id });
                    break;
                }

                case 'mattermostUserSearchResults': {
                    const mmStore = useMattermostStore.getState();
                    mmStore.setIsSearchingUsers(false);
                    mmStore.setUserSearchResults(msg.payload as MattermostUserData[]);
                    break;
                }

                // ─── Mattermost Emoji Autocomplete ───
                case 'mattermostEmojiAutocomplete': {
                    const mmStore = useMattermostStore.getState();
                    mmStore.setEmojiSuggestions(msg.payload as MattermostEmojiData[]);
                    break;
                }

                // ─── Mattermost Custom Emoji list ───
                case 'mattermostCustomEmojis': {
                    const mmStore = useMattermostStore.getState();
                    mmStore.setCustomEmojis(msg.payload as Record<string, string>);
                    break;
                }

                // ─── Deep-link: open a specific Mattermost channel ───
                case 'openChannel':
                    appStore.setActiveTab('mattermost');
                    if (msg.channelId) {
                        const mmStore = useMattermostStore.getState();
                        mmStore.selectChannel(
                            msg.channelId as string,
                            (msg.channelName as string) ?? 'Channel',
                        );
                        postMessage('mattermost.getPosts', {
                            channelId: msg.channelId,
                        });
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
                ) : activeTab === 'issues' ? (
                    <IssuesTab />
                ) : (
                    <MattermostTab />
                )}
            </div>
        </div>
    );
};
