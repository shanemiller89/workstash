/**
 * useMattermostMessages — dispatches extension→webview Mattermost messages to the store.
 */
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
} from '../mattermostStore';
import { useAppStore } from '../appStore';
import { postMessage } from '../vscode';

type Msg = { type: string; [key: string]: unknown };

export function handleMattermostMessage(msg: Msg): boolean {
    const s = useMattermostStore.getState();

    switch (msg.type) {
        // ─── Configuration & Auth ───
        case 'mattermostConfigured':
            s.setConfigured(msg.configured as boolean);
            if (!msg.configured) { s.setLoadingChannels(false); }
            return true;
        case 'mattermostUser':
            s.setCurrentUser(msg.user as MattermostUserData);
            return true;
        case 'mattermostTeams':
            s.setTeams(msg.payload as MattermostTeamData[]);
            return true;
        case 'mattermostNotConfigured':
            s.setConfigured(false);
            s.setLoadingChannels(false);
            return true;

        // ─── Channels ───
        case 'mattermostChannels':
            s.setChannels(msg.payload as MattermostChannelData[]);
            if (msg.teamId) {
                s.selectTeam(msg.teamId as string);
                // Re-set channels since selectTeam clears them
                s.setChannels(msg.payload as MattermostChannelData[]);
            }
            s.setLoadingChannels(false);
            return true;
        case 'mattermostChannelsAppend':
            s.appendChannels(msg.payload as MattermostChannelData[]);
            return true;
        case 'mattermostChannelsLoading':
            s.setLoadingChannels(true);
            return true;
        case 'mattermostData':
            s.setConfigured(true);
            if (msg.currentUser) { s.setCurrentUser(msg.currentUser as MattermostUserData); }
            if (msg.teams) { s.setTeams(msg.teams as MattermostTeamData[]); }
            if (msg.channels) { s.setChannels(msg.channels as MattermostChannelData[]); }
            s.setLoadingChannels(false);
            return true;
        case 'mattermostLoading':
            s.setLoadingChannels(true);
            return true;

        // ─── Posts ───
        case 'mattermostPosts': {
            const posts = (msg.payload ?? msg.posts) as MattermostPostData[];
            s.setPosts(posts);
            s.setHasMorePosts(msg.hasMore as boolean ?? false);
            s.setLoadingPosts(false);
            return true;
        }
        case 'mattermostOlderPosts': {
            const olderPosts = (msg.payload ?? msg.posts) as MattermostPostData[];
            s.appendOlderPosts(olderPosts);
            s.setHasMorePosts(msg.hasMore as boolean ?? false);
            s.setLoadingPosts(false);
            return true;
        }
        case 'mattermostPostsLoading':
            s.setLoadingPosts(true);
            return true;
        case 'mattermostSendingPost':
            s.setSendingMessage(true);
            return true;

        // ─── Optimistic Post Handling ───
        case 'mattermostPostConfirmed':
            if (msg.pendingId && msg.post) {
                s.confirmPendingPost(msg.pendingId as string, msg.post as MattermostPostData);
            }
            s.setSendingMessage(false);
            return true;
        case 'mattermostPostFailed':
            if (msg.pendingId) {
                s.failPendingPost(msg.pendingId as string, (msg.error as string) ?? 'Send failed');
            }
            s.setSendingMessage(false);
            return true;
        case 'mattermostPostSent':
        case 'mattermostPostCreated': {
            if (msg.post) {
                const createdPost = msg.post as MattermostPostData;
                // Add to main posts array (threadedGroups handles display filtering)
                s.prependNewPost(createdPost);
                // Also add to thread panel if it's a reply to the active thread
                if (createdPost.rootId && createdPost.rootId === s.activeThreadRootId) {
                    s.appendThreadPost(createdPost);
                }
            }
            s.setSendingMessage(false);
            return true;
        }

        // ─── Error ───
        case 'mattermostError':
            s.setLoadingChannels(false);
            s.setLoadingPosts(false);
            s.setSendingMessage(false);
            s.setLoadingThread(false);
            return true;

        // ─── DM Channels ───
        case 'mattermostDmChannels':
            s.setDmChannels(msg.payload as MattermostChannelData[]);
            return true;
        case 'mattermostDmChannelsAppend':
            s.appendDmChannels(msg.payload as MattermostChannelData[]);
            return true;

        // ─── WebSocket Real-Time Events ───
        case 'mattermostConnectionStatus':
            s.setConnected(msg.connected as boolean);
            if (typeof msg.reconnectAttempt === 'number') {
                s.setReconnectAttempt(msg.reconnectAttempt as number);
            }
            return true;
        case 'mattermostNewPost': {
            const newPost = msg.post as MattermostPostData;
            const isThreadReply = newPost.rootId && newPost.rootId !== '';

            if (newPost.channelId === s.selectedChannelId) {
                if (!isThreadReply) {
                    // Root-level post — add to main channel feed
                    const alreadyExists = s.posts.some((p) => p.id === newPost.id);
                    if (!alreadyExists) {
                        // Check for pending optimistic match
                        const pendingMatch = s.posts.find(
                            (p) =>
                                p._pending &&
                                p.userId === newPost.userId &&
                                p.channelId === newPost.channelId &&
                                p.message === newPost.message &&
                                (p.rootId ?? '') === (newPost.rootId ?? ''),
                        );
                        if (pendingMatch) {
                            s.confirmPendingPost(pendingMatch.id, newPost);
                        } else {
                            s.prependNewPost(newPost);
                        }
                    }
                }
                // Thread replies do NOT go into the main posts array.
                // They will appear inline when the user expands the thread.
            }

            // Add to thread panel if it's a reply to the active thread
            if (isThreadReply && newPost.rootId === s.activeThreadRootId) {
                const alreadyInThread = s.threadPosts.some((p) => p.id === newPost.id);
                if (!alreadyInThread) {
                    // Check for pending match in thread posts
                    const pendingThreadMatch = s.threadPosts.find(
                        (p) =>
                            p._pending &&
                            p.userId === newPost.userId &&
                            p.channelId === newPost.channelId &&
                            p.message === newPost.message &&
                            (p.rootId ?? '') === (newPost.rootId ?? ''),
                    );
                    if (pendingThreadMatch) {
                        s.confirmPendingPost(pendingThreadMatch.id, newPost);
                    } else {
                        s.appendThreadPost(newPost);
                    }
                }
            }
            return true;
        }
        case 'mattermostPostEdited':
            s.updatePost(msg.post as MattermostPostData);
            return true;
        case 'mattermostPostDeleted':
            s.removePost(msg.postId as string);
            return true;
        case 'mattermostTyping':
            s.addTyping(
                msg.userId as string,
                msg.username as string ?? msg.userId as string,
                msg.channelId as string,
            );
            return true;
        case 'mattermostStatusChange':
            s.updateUserStatus(
                msg.userId as string,
                msg.status as 'online' | 'away' | 'offline' | 'dnd',
            );
            return true;

        // ─── User Avatars ───
        case 'mattermostUserAvatars':
            s.mergeUserAvatars(msg.payload as Record<string, string>);
            return true;

        // ─── Reactions ───
        case 'mattermostReactionAdded':
            s.addReaction(msg.reaction as MattermostReactionData);
            return true;
        case 'mattermostReactionRemoved': {
            const r = msg.reaction as MattermostReactionData;
            s.removeReaction(r.userId, r.postId, r.emojiName);
            return true;
        }
        case 'mattermostBulkReactions':
            s.setBulkReactions(msg.payload as MattermostReactionData[]);
            return true;
        case 'mattermostReactions':
            s.setReactionsForPost(
                msg.postId as string,
                msg.payload as MattermostReactionData[],
            );
            return true;

        // ─── Thread ───
        case 'mattermostThreadLoading':
            s.setLoadingThread(true);
            return true;
        case 'mattermostThread':
            s.setThreadPosts(msg.payload as MattermostPostData[]);
            return true;

        // ─── User Statuses ───
        case 'mattermostUserStatuses':
            s.setUserStatuses(msg.payload as MattermostUserStatusData[]);
            return true;

        // ─── Unread ───
        case 'mattermostUnread':
            s.setUnread(msg.payload as MattermostChannelUnreadData);
            return true;
        case 'mattermostBulkUnreads':
            s.setBulkUnreads(msg.payload as MattermostChannelUnreadData[]);
            return true;
        case 'mattermostNewPostUnread': {
            const channelId = msg.channelId as string;
            if (channelId !== s.selectedChannelId) {
                s.incrementUnread(channelId);
            }
            return true;
        }
        case 'mattermostMarkedRead':
            s.markChannelRead(msg.channelId as string);
            return true;

        // ─── DM Channel Added (via WebSocket direct_added / group_added) ───
        case 'mattermostDmChannelAdded': {
            const newDmChannel = msg.channel as MattermostChannelData;
            // Avoid duplicates
            const exists = s.dmChannels.some((c) => c.id === newDmChannel.id);
            if (!exists) {
                s.appendDmChannels([newDmChannel]);
            }
            return true;
        }

        // ─── Channel Updated (metadata change via WebSocket) ───
        case 'mattermostChannelUpdated': {
            const updated = msg.channel as Partial<MattermostChannelData> & { id: string };
            // Update in channels list
            const updatedChannels = s.channels.map((c) =>
                c.id === updated.id ? { ...c, ...updated } : c,
            );
            s.setChannels(updatedChannels);
            // Also update DM channels in case it's a group DM
            const updatedDms = s.dmChannels.map((c) =>
                c.id === updated.id ? { ...c, ...updated } : c,
            );
            s.setDmChannels(updatedDms);
            return true;
        }

        // ─── Edit / Delete / Pin ───
        case 'mattermostPostPinToggled':
            s.togglePostPin(msg.postId as string, msg.isPinned as boolean);
            return true;

        // ─── Search Results ───
        case 'mattermostSearchLoading':
            s.setIsSearchingMessages(true);
            return true;
        case 'mattermostSearchResults':
            s.setSearchResults(msg.payload as MattermostPostData[]);
            return true;

        // ─── Flagged Posts ───
        case 'mattermostFlaggedPostIds':
            s.setFlaggedPostIds(msg.payload as string[]);
            return true;
        case 'mattermostPostFlagged':
            if (msg.flagged) {
                s.addFlaggedPostId(msg.postId as string);
            } else {
                s.removeFlaggedPostId(msg.postId as string);
            }
            return true;

        // ─── User Profile ───
        case 'mattermostUserProfile':
            window.dispatchEvent(new CustomEvent('mattermost-user-profile', {
                detail: { user: msg.user, avatarUrl: msg.avatarUrl },
            }));
            return true;

        // ─── Channel Info ───
        case 'mattermostChannelInfo':
            window.dispatchEvent(new CustomEvent('mattermost-channel-info', {
                detail: msg.payload,
            }));
            return true;

        // ─── File Upload ───
        case 'mattermostFileUploading':
            s.setIsUploadingFiles(true);
            return true;
        case 'mattermostFilesUploaded':
            s.setPendingFiles(
                msg.fileIds as string[],
                msg.files as MattermostFileInfoData[],
            );
            return true;
        case 'mattermostFileUploadFailed':
            s.clearPendingFiles();
            return true;

        // ─── DM Created ───
        case 'mattermostDmCreated': {
            const newDm = msg.channel as MattermostChannelData;
            s.setDmChannels([...s.dmChannels, newDm]);
            s.selectChannel(newDm.id, newDm.displayName);
            postMessage('mattermost.getPosts', { channelId: newDm.id });
            return true;
        }

        // ─── User Search ───
        case 'mattermostUserSearchResults':
            s.setIsSearchingUsers(false);
            s.setUserSearchResults(msg.payload as MattermostUserData[]);
            return true;

        // ─── Emoji ───
        case 'mattermostEmojiAutocomplete':
            s.setEmojiSuggestions(msg.payload as MattermostEmojiData[]);
            return true;
        case 'mattermostCustomEmojis':
            s.setCustomEmojis(msg.payload as Record<string, string>);
            return true;

        // ─── Deep-link: open a specific Mattermost channel ───
        case 'openChannel':
            useAppStore.getState().setActiveTab('mattermost');
            if (msg.channelId) {
                s.selectChannel(
                    msg.channelId as string,
                    (msg.channelName as string) ?? 'Channel',
                );
                postMessage('mattermost.getPosts', { channelId: msg.channelId as string });
            }
            return true;

        default:
            return false;
    }
}
