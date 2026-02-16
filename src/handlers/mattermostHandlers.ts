import * as vscode from 'vscode';
import { MattermostService } from '../mattermostService';
import { extractErrorMessage } from '../utils';
import type { HandlerContext, MessageHandler } from './types';

/** Handle all `mattermost.*` messages from the webview. */
export const handleMattermostMessage: MessageHandler = async (ctx, msg) => {
    switch (msg.type) {
        case 'mattermost.refresh':
            await ctx.refreshMattermost();
            return true;

        case 'mattermost.signIn': {
            if (!ctx.mattermostService) { return true; }
            const signedIn = await ctx.mattermostService.signIn();
            if (signedIn) {
                await ctx.refreshMattermost();
            }
            return true;
        }

        case 'mattermost.signInWithPassword': {
            if (!ctx.mattermostService) { return true; }
            const pwSuccess = await ctx.mattermostService.signInWithPassword();
            if (pwSuccess) {
                await ctx.refreshMattermost();
            }
            return true;
        }

        case 'mattermost.signInWithToken': {
            if (!ctx.mattermostService) { return true; }
            const tokenSuccess = await ctx.mattermostService.signInWithToken();
            if (tokenSuccess) {
                await ctx.refreshMattermost();
            }
            return true;
        }

        case 'mattermost.signInWithSessionToken': {
            if (!ctx.mattermostService) { return true; }
            const sessionSuccess = await ctx.mattermostService.signInWithSessionToken();
            if (sessionSuccess) {
                await ctx.refreshMattermost();
            }
            return true;
        }

        case 'mattermost.signOut': {
            if (!ctx.mattermostService) { return true; }
            // Disconnect WebSocket before signing out
            const ws = ctx.getMmWebSocket();
            if (ws) {
                ws.disconnect();
                ws.dispose();
                ctx.setMmWebSocket(undefined);
            }
            await ctx.mattermostService.signOut();
            ctx.postMessage({ type: 'mattermostConfigured', configured: false });
            ctx.postMessage({ type: 'mattermostConnectionStatus', connected: false });
            return true;
        }

        case 'mattermost.getChannels': {
            if (!ctx.mattermostService || !msg.teamId) { return true; }
            try {
                const page = msg.page ?? 0;
                if (page === 0) {
                    ctx.postMessage({ type: 'mattermostChannelsLoading' });
                }
                // Use getAllMyChannels with pagination to handle large servers
                const { channels, dmChannels, groupChannels, hasMore } =
                    await ctx.mattermostService.getAllMyChannels(msg.teamId, page, 100);
                const channelsPayload = channels.map((c) => MattermostService.toChannelData(c));
                ctx.postMessage({
                    type: page === 0 ? 'mattermostChannels' : 'mattermostChannelsAppend',
                    payload: channelsPayload,
                    hasMoreChannels: hasMore,
                });

                // Also send DM channels
                const me = await ctx.mattermostService.getMe();
                const dmPayload = await _resolveDmChannelPayloads(ctx, [...dmChannels, ...groupChannels], me.id);
                ctx.postMessage({
                    type: page === 0 ? 'mattermostDmChannels' : 'mattermostDmChannelsAppend',
                    payload: dmPayload,
                });

                // Auto-fetch next page if there are more channels
                if (hasMore) {
                    // Recursively handle next page
                    await handleMattermostMessage(ctx, {
                        type: 'mattermost.getChannels',
                        teamId: msg.teamId,
                        page: page + 1,
                    });
                } else if (page === 0) {
                    // Fetch custom emoji list on first page load (fire-and-forget)
                    ctx.mattermostService.getCustomEmojis().then((customEmojis) => {
                        ctx.postMessage({ type: 'mattermostCustomEmojis', payload: customEmojis });
                    }).catch(() => { /* non-critical — custom emojis just won't render */ });
                }
            } catch (e: unknown) {
                const m = extractErrorMessage(e);
                ctx.postMessage({ type: 'mattermostError', message: m });
            }
            return true;
        }

        case 'mattermost.getPosts': {
            if (!ctx.mattermostService || !msg.channelId) { return true; }
            try {
                const page = msg.page ?? 0;
                ctx.postMessage({ type: 'mattermostPostsLoading' });
                const posts = await ctx.mattermostService.getChannelPosts(msg.channelId, page);
                const usernames = await ctx.mattermostService.resolveUsernames(posts);

                // Resolve file attachments inline before sending posts
                const payload = await Promise.all(posts.map(async (p) => {
                    let files: import('../mattermostService').MattermostFileInfoData[] | undefined;
                    if (p.fileIds.length > 0) {
                        try {
                            files = await ctx.mattermostService!.resolveFileInfos(p.fileIds);
                        } catch { /* ignore file resolution errors */ }
                    }
                    return MattermostService.toPostData(p, usernames.get(p.userId) ?? p.userId, files);
                }));
                ctx.postMessage({
                    type: page > 0 ? 'mattermostOlderPosts' : 'mattermostPosts',
                    payload,
                    hasMore: posts.length === 30,
                });

                // Fetch reactions and user statuses for the loaded posts (non-blocking)
                const postIds = posts.map((p) => p.id);
                const uniqueUserIds = [...new Set(posts.map((p) => p.userId))];
                if (postIds.length > 0) {
                    ctx.mattermostService.getBulkReactions(postIds).then((reactionsMap) => {
                        const allReactions: Array<{ userId: string; postId: string; emojiName: string; username: string }> = [];
                        for (const [pid, reactions] of reactionsMap) {
                            for (const r of reactions) {
                                allReactions.push({
                                    userId: r.userId,
                                    postId: pid,
                                    emojiName: r.emojiName,
                                    username: usernames.get(r.userId) ?? r.userId,
                                });
                            }
                        }
                        if (allReactions.length > 0) {
                            ctx.postMessage({ type: 'mattermostBulkReactions', payload: allReactions });
                        }
                    }).catch(() => { /* ignore reaction fetch errors */ });
                }
                if (uniqueUserIds.length > 0) {
                    ctx.mattermostService.getUserStatuses(uniqueUserIds).then((statuses) => {
                        const statusPayload = statuses.map((s) => MattermostService.toUserStatusData(s));
                        ctx.postMessage({ type: 'mattermostUserStatuses', payload: statusPayload });
                    }).catch(() => { /* ignore status fetch errors */ });

                    // Fetch user avatars in background
                    ctx.mattermostService.getUserProfileImages(uniqueUserIds).then((avatars) => {
                        if (Object.keys(avatars).length > 0) {
                            ctx.postMessage({ type: 'mattermostUserAvatars', payload: avatars });
                        }
                    }).catch(() => { /* ignore avatar fetch errors */ });
                }
            } catch (e: unknown) {
                const m = extractErrorMessage(e);
                ctx.postMessage({ type: 'mattermostError', message: m });
            }
            return true;
        }

        case 'mattermost.sendPost': {
            if (!ctx.mattermostService || !msg.channelId || !msg.message) { return true; }
            const pendingId = msg.pendingId;
            try {
                const post = await ctx.mattermostService.createPost(msg.channelId, msg.message, msg.rootId, msg.fileIds);
                const username = await ctx.mattermostService.resolveUsername(post.userId);
                let files: import('../mattermostService').MattermostFileInfoData[] | undefined;
                if (post.fileIds.length > 0) {
                    try {
                        files = await ctx.mattermostService!.resolveFileInfos(post.fileIds);
                    } catch { /* ignore */ }
                }
                const postData = MattermostService.toPostData(post, username, files);
                if (pendingId) {
                    ctx.postMessage({ type: 'mattermostPostConfirmed', pendingId, post: postData });
                } else {
                    ctx.postMessage({ type: 'mattermostPostCreated', post: postData });
                }
            } catch (e: unknown) {
                const m = extractErrorMessage(e);
                if (pendingId) {
                    ctx.postMessage({ type: 'mattermostPostFailed', pendingId, error: m });
                } else {
                    ctx.postMessage({ type: 'mattermostError', message: m });
                }
            }
            return true;
        }

        case 'mattermost.openInBrowser': {
            if (!ctx.mattermostService || !msg.channelId) { return true; }
            const serverUrl = await ctx.mattermostService.getServerUrl();
            if (serverUrl) {
                await vscode.env.openExternal(vscode.Uri.parse(serverUrl));
            }
            return true;
        }

        case 'mattermostOpenExternal': {
            if (msg.url && typeof msg.url === 'string') {
                await vscode.env.openExternal(vscode.Uri.parse(msg.url));
            }
            return true;
        }

        // ─── Thread Handlers ──────────────────────────────────

        case 'mattermost.getThread': {
            if (!ctx.mattermostService || !msg.postId) { return true; }
            try {
                ctx.postMessage({ type: 'mattermostThreadLoading', postId: msg.postId });
                const posts = await ctx.mattermostService.getPostThread(msg.postId);
                const usernames = await ctx.mattermostService.resolveUsernames(posts);
                const payload = await Promise.all(posts.map(async (p) => {
                    let files: import('../mattermostService').MattermostFileInfoData[] | undefined;
                    if (p.fileIds.length > 0) {
                        try {
                            files = await ctx.mattermostService!.resolveFileInfos(p.fileIds);
                        } catch { /* ignore */ }
                    }
                    return MattermostService.toPostData(p, usernames.get(p.userId) ?? p.userId, files);
                }));
                ctx.postMessage({
                    type: 'mattermostThread',
                    rootId: msg.postId,
                    payload,
                });
            } catch (e: unknown) {
                const m = extractErrorMessage(e);
                ctx.postMessage({ type: 'mattermostError', message: m });
            }
            return true;
        }

        case 'mattermost.sendReply': {
            if (!ctx.mattermostService || !msg.channelId || !msg.message || !msg.rootId) { return true; }
            try {
                ctx.postMessage({ type: 'mattermostSendingPost' });
                const post = await ctx.mattermostService.createPost(msg.channelId, msg.message, msg.rootId, msg.fileIds);
                const username = await ctx.mattermostService.resolveUsername(post.userId);
                let files: import('../mattermostService').MattermostFileInfoData[] | undefined;
                if (post.fileIds.length > 0) {
                    try {
                        files = await ctx.mattermostService!.resolveFileInfos(post.fileIds);
                    } catch { /* ignore */ }
                }
                const postData = MattermostService.toPostData(post, username, files);
                ctx.postMessage({ type: 'mattermostPostCreated', post: postData });
            } catch (e: unknown) {
                const m = extractErrorMessage(e);
                ctx.postMessage({ type: 'mattermostError', message: m });
            }
            return true;
        }

        // ─── Reaction Handlers ────────────────────────────────

        case 'mattermost.addReaction': {
            if (!ctx.mattermostService || !msg.postId || !msg.emojiName) { return true; }
            try {
                await ctx.mattermostService.addReaction(msg.postId, msg.emojiName);
                // WebSocket will relay the reaction_added event
            } catch (e: unknown) {
                const m = extractErrorMessage(e);
                ctx.postMessage({ type: 'mattermostError', message: m });
            }
            return true;
        }

        case 'mattermost.removeReaction': {
            if (!ctx.mattermostService || !msg.postId || !msg.emojiName) { return true; }
            try {
                await ctx.mattermostService.removeReaction(msg.postId, msg.emojiName);
                // WebSocket will relay the reaction_removed event
            } catch (e: unknown) {
                const m = extractErrorMessage(e);
                ctx.postMessage({ type: 'mattermostError', message: m });
            }
            return true;
        }

        case 'mattermost.getReactions': {
            if (!ctx.mattermostService || !msg.postId) { return true; }
            try {
                const reactions = await ctx.mattermostService.getPostReactions(msg.postId);
                const userIds = [...new Set(reactions.map((r) => r.userId))];
                const usernames = new Map<string, string>();
                for (const uid of userIds) {
                    usernames.set(uid, await ctx.mattermostService.resolveUsername(uid));
                }
                const payload = reactions.map((r) =>
                    MattermostService.toReactionData(r, usernames.get(r.userId) ?? r.userId),
                );
                ctx.postMessage({
                    type: 'mattermostReactions',
                    postId: msg.postId,
                    payload,
                });
            } catch (e: unknown) {
                const m = extractErrorMessage(e);
                ctx.postMessage({ type: 'mattermostError', message: m });
            }
            return true;
        }

        // ─── DM Handlers ─────────────────────────────────────

        case 'mattermost.createDM': {
            if (!ctx.mattermostService || !msg.targetUserId) { return true; }
            try {
                const channel = await ctx.mattermostService.createDirectChannel(msg.targetUserId);
                const channelData = MattermostService.toChannelData(channel);
                ctx.postMessage({ type: 'mattermostDmCreated', channel: channelData });
            } catch (e: unknown) {
                const m = extractErrorMessage(e);
                ctx.postMessage({ type: 'mattermostError', message: m });
            }
            return true;
        }

        case 'mattermost.createGroupDM': {
            if (!ctx.mattermostService || !msg.userIds || msg.userIds.length === 0) { return true; }
            try {
                const channel = await ctx.mattermostService.createGroupChannel(msg.userIds);
                const channelData = MattermostService.toChannelData(channel);
                ctx.postMessage({ type: 'mattermostDmCreated', channel: channelData });
            } catch (e: unknown) {
                const m = extractErrorMessage(e);
                ctx.postMessage({ type: 'mattermostError', message: m });
            }
            return true;
        }

        case 'mattermost.searchUsers': {
            if (!ctx.mattermostService || !msg.term) { return true; }
            try {
                const users = await ctx.mattermostService.searchUsers(msg.term);
                const payload = users.map((u) => MattermostService.toUserData(u));
                ctx.postMessage({ type: 'mattermostUserSearchResults', payload });
            } catch (e: unknown) {
                const m = extractErrorMessage(e);
                ctx.postMessage({ type: 'mattermostError', message: m });
            }
            return true;
        }

        // ─── Channel & Status Handlers ────────────────────────

        case 'mattermost.getAllChannels': {
            if (!ctx.mattermostService || !msg.teamId) { return true; }
            try {
                ctx.postMessage({ type: 'mattermostChannelsLoading' });
                const { channels, dmChannels, groupChannels } = await ctx.mattermostService.getAllMyChannels(msg.teamId);
                const channelsPayload = channels.map((c) => MattermostService.toChannelData(c));

                // Resolve DM display names and other-user IDs
                const me = await ctx.mattermostService.getMe();
                const dmPayload = await _resolveDmChannelPayloads(ctx, [...dmChannels, ...groupChannels], me.id);
                ctx.postMessage({ type: 'mattermostChannels', payload: channelsPayload });
                ctx.postMessage({ type: 'mattermostDmChannels', payload: dmPayload });

                // Fetch bulk unreads for all channels (non-blocking)
                const allChannelIds = [
                    ...channels.map((c) => c.id),
                    ...dmChannels.map((c) => c.id),
                    ...groupChannels.map((c) => c.id),
                ];
                _fetchBulkUnreads(ctx, allChannelIds).catch(() => { /* ignore */ });
            } catch (e: unknown) {
                const m = extractErrorMessage(e);
                ctx.postMessage({ type: 'mattermostError', message: m });
            }
            return true;
        }

        case 'mattermost.getUserStatuses': {
            if (!ctx.mattermostService || !msg.userIds || msg.userIds.length === 0) { return true; }
            try {
                const statuses = await ctx.mattermostService.getUserStatuses(msg.userIds);
                const payload = statuses.map((s) => MattermostService.toUserStatusData(s));
                ctx.postMessage({ type: 'mattermostUserStatuses', payload });
            } catch (e: unknown) {
                const m = extractErrorMessage(e);
                ctx.postMessage({ type: 'mattermostError', message: m });
            }
            return true;
        }

        case 'mattermost.getUnread': {
            if (!ctx.mattermostService || !msg.channelId) { return true; }
            try {
                const unread = await ctx.mattermostService.getChannelUnread(msg.channelId);
                ctx.postMessage({
                    type: 'mattermostUnread',
                    payload: MattermostService.toChannelUnreadData(unread),
                });
            } catch (e: unknown) {
                const m = extractErrorMessage(e);
                ctx.postMessage({ type: 'mattermostError', message: m });
            }
            return true;
        }

        case 'mattermost.markRead': {
            if (!ctx.mattermostService || !msg.channelId) { return true; }
            try {
                await ctx.mattermostService.markChannelAsRead(msg.channelId);
                ctx.postMessage({
                    type: 'mattermostMarkedRead',
                    channelId: msg.channelId,
                });
            } catch (e: unknown) {
                const m = extractErrorMessage(e);
                ctx.postMessage({ type: 'mattermostError', message: m });
            }
            return true;
        }

        // ─── Edit / Delete / Pin ──────────────────────────────

        case 'mattermost.editPost': {
            if (!ctx.mattermostService || !msg.postId || typeof msg.message !== 'string') { return true; }
            try {
                const post = await ctx.mattermostService.editPost(msg.postId, msg.message);
                const username = await ctx.mattermostService.resolveUsername(post.userId);
                const postData = MattermostService.toPostData(post, username);
                ctx.postMessage({ type: 'mattermostPostEdited', post: postData });
            } catch (e: unknown) {
                const m = extractErrorMessage(e);
                ctx.postMessage({ type: 'mattermostError', message: m });
            }
            return true;
        }

        case 'mattermost.deletePost': {
            if (!ctx.mattermostService || !msg.postId) { return true; }
            try {
                await ctx.mattermostService.deletePost(msg.postId);
                ctx.postMessage({ type: 'mattermostPostDeleted', postId: msg.postId });
            } catch (e: unknown) {
                const m = extractErrorMessage(e);
                ctx.postMessage({ type: 'mattermostError', message: m });
            }
            return true;
        }

        case 'mattermost.pinPost': {
            if (!ctx.mattermostService || !msg.postId) { return true; }
            try {
                await ctx.mattermostService.pinPost(msg.postId);
                ctx.postMessage({
                    type: 'mattermostPostPinToggled',
                    postId: msg.postId,
                    isPinned: true,
                });
            } catch (e: unknown) {
                const m = extractErrorMessage(e);
                ctx.postMessage({ type: 'mattermostError', message: m });
            }
            return true;
        }

        case 'mattermost.unpinPost': {
            if (!ctx.mattermostService || !msg.postId) { return true; }
            try {
                await ctx.mattermostService.unpinPost(msg.postId);
                ctx.postMessage({
                    type: 'mattermostPostPinToggled',
                    postId: msg.postId,
                    isPinned: false,
                });
            } catch (e: unknown) {
                const m = extractErrorMessage(e);
                ctx.postMessage({ type: 'mattermostError', message: m });
            }
            return true;
        }

        // ─── Search ───────────────────────────────────────────

        case 'mattermost.searchPosts': {
            if (!ctx.mattermostService || !msg.terms || !msg.teamId) { return true; }
            try {
                ctx.postMessage({ type: 'mattermostSearchLoading' });
                const posts = await ctx.mattermostService.searchPosts(msg.teamId, msg.terms);
                const usernames = await ctx.mattermostService.resolveUsernames(posts);
                const payload = await Promise.all(posts.map(async (p) => {
                    let files: import('../mattermostService').MattermostFileInfoData[] | undefined;
                    if (p.fileIds.length > 0) {
                        try {
                            files = await ctx.mattermostService!.resolveFileInfos(p.fileIds);
                        } catch { /* ignore */ }
                    }
                    return MattermostService.toPostData(p, usernames.get(p.userId) ?? p.userId, files);
                }));
                ctx.postMessage({ type: 'mattermostSearchResults', payload });
            } catch (e: unknown) {
                const m = extractErrorMessage(e);
                ctx.postMessage({ type: 'mattermostError', message: m });
            }
            return true;
        }

        // ─── Flagged/Saved Posts ──────────────────────────────

        case 'mattermost.getFlaggedPosts': {
            if (!ctx.mattermostService) { return true; }
            try {
                const posts = await ctx.mattermostService.getFlaggedPosts(msg.teamId);
                ctx.postMessage({
                    type: 'mattermostFlaggedPostIds',
                    payload: posts.map((p) => p.id),
                });
            } catch (e: unknown) {
                const m = extractErrorMessage(e);
                ctx.postMessage({ type: 'mattermostError', message: m });
            }
            return true;
        }

        case 'mattermost.flagPost': {
            if (!ctx.mattermostService || !msg.postId) { return true; }
            try {
                await ctx.mattermostService.flagPost(msg.postId);
                ctx.postMessage({
                    type: 'mattermostPostFlagged',
                    postId: msg.postId,
                    flagged: true,
                });
            } catch (e: unknown) {
                const m = extractErrorMessage(e);
                ctx.postMessage({ type: 'mattermostError', message: m });
            }
            return true;
        }

        case 'mattermost.unflagPost': {
            if (!ctx.mattermostService || !msg.postId) { return true; }
            try {
                await ctx.mattermostService.unflagPost(msg.postId);
                ctx.postMessage({
                    type: 'mattermostPostFlagged',
                    postId: msg.postId,
                    flagged: false,
                });
            } catch (e: unknown) {
                const m = extractErrorMessage(e);
                ctx.postMessage({ type: 'mattermostError', message: m });
            }
            return true;
        }

        // ─── User Status (set own) ───────────────────────────

        case 'mattermost.setOwnStatus': {
            if (!ctx.mattermostService || !msg.status) { return true; }
            try {
                await ctx.mattermostService.setOwnStatus(msg.status as 'online' | 'away' | 'offline' | 'dnd', msg.dndEndTime);
                // WebSocket will relay the status_change event
            } catch (e: unknown) {
                const m = extractErrorMessage(e);
                ctx.postMessage({ type: 'mattermostError', message: m });
            }
            return true;
        }

        // ─── User Profile ─────────────────────────────────────

        case 'mattermost.getUserProfile': {
            if (!ctx.mattermostService || !msg.userId) { return true; }
            try {
                const user = await ctx.mattermostService.getUserProfile(msg.userId);
                const userData = MattermostService.toUserData(user);
                let avatarUrl: string | undefined;
                try {
                    avatarUrl = await ctx.mattermostService.getUserProfileImage(msg.userId);
                } catch { /* ignore — avatar is optional */ }
                ctx.postMessage({
                    type: 'mattermostUserProfile',
                    user: userData,
                    avatarUrl,
                });
            } catch (e: unknown) {
                const m = extractErrorMessage(e);
                ctx.postMessage({ type: 'mattermostError', message: m });
            }
            return true;
        }

        // ─── Channel Info ─────────────────────────────────────

        case 'mattermost.getChannelInfo': {
            if (!ctx.mattermostService || !msg.channelId) { return true; }
            try {
                const channel = await ctx.mattermostService.getChannel(msg.channelId);
                ctx.postMessage({
                    type: 'mattermostChannelInfo',
                    payload: MattermostService.toChannelData(channel),
                });
            } catch (e: unknown) {
                const m = extractErrorMessage(e);
                ctx.postMessage({ type: 'mattermostError', message: m });
            }
            return true;
        }

        // ─── File Upload ──────────────────────────────────────

        case 'mattermost.uploadFiles': {
            if (!ctx.mattermostService || !msg.channelId) { return true; }
            try {
                const uris = await vscode.window.showOpenDialog({
                    canSelectMany: true,
                    openLabel: 'Upload',
                    title: 'Select files to upload to Mattermost',
                });
                if (!uris || uris.length === 0) {
                    // User cancelled — no-op
                    return true;
                }

                ctx.postMessage({ type: 'mattermostFileUploading', count: uris.length });

                const fileBuffers: { name: string; data: Buffer; mimeType: string }[] = [];
                for (const uri of uris) {
                    const data = Buffer.from(await vscode.workspace.fs.readFile(uri));
                    const name = uri.path.split('/').pop() ?? 'file';
                    // Infer mime type from extension
                    const ext = name.split('.').pop()?.toLowerCase() ?? '';
                    const mimeMap: Record<string, string> = {
                        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
                        gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
                        pdf: 'application/pdf', zip: 'application/zip',
                        txt: 'text/plain', md: 'text/markdown',
                        json: 'application/json', xml: 'application/xml',
                        csv: 'text/csv', html: 'text/html',
                        js: 'application/javascript', ts: 'text/typescript',
                        py: 'text/x-python', go: 'text/x-go',
                        rs: 'text/x-rust', java: 'text/x-java',
                        mp4: 'video/mp4', mp3: 'audio/mpeg',
                    };
                    const mimeType = mimeMap[ext] ?? 'application/octet-stream';
                    fileBuffers.push({ name, data, mimeType });
                }

                const fileInfos = await ctx.mattermostService.uploadFiles(msg.channelId, fileBuffers);
                const fileIds = fileInfos.map((f) => f.id);
                const fileInfoDatas = await ctx.mattermostService.resolveFileInfos(fileIds);

                ctx.postMessage({
                    type: 'mattermostFilesUploaded',
                    fileIds,
                    files: fileInfoDatas,
                });
            } catch (e: unknown) {
                const m = extractErrorMessage(e);
                ctx.postMessage({ type: 'mattermostError', message: m });
                ctx.postMessage({ type: 'mattermostFileUploadFailed' });
            }
            return true;
        }

        // ─── Emoji Handlers ───────────────────────────────────

        case 'mattermost.emojiAutocomplete': {
            if (!ctx.mattermostService || !msg.term) { return true; }
            try {
                const emojis = await ctx.mattermostService.getEmojiAutocomplete(msg.term);
                const payload: Array<{ id: string; name: string; isCustom: boolean; imageUrl?: string }> = [];
                for (const e of emojis) {
                    const isCustom = e.creatorId !== '';
                    let imageUrl: string | undefined;
                    if (isCustom) {
                        imageUrl = await ctx.mattermostService.getCustomEmojiImageUrl(e.id);
                    }
                    payload.push({ id: e.id, name: e.name, isCustom, imageUrl });
                }
                ctx.postMessage({ type: 'mattermostEmojiAutocomplete', payload });
            } catch (e: unknown) {
                const m = extractErrorMessage(e);
                ctx.postMessage({ type: 'mattermostError', message: m });
            }
            return true;
        }

        // ─── Typing Indicator ─────────────────────────────────

        case 'mattermost.sendTyping': {
            // Send a typing indicator via WebSocket (not REST)
            const ws = ctx.getMmWebSocket();
            if (ws?.isConnected && msg.channelId) {
                ws.sendTyping(msg.channelId, msg.rootId);
            }
            return true;
        }

        // ─── Channel Export ───────────────────────────────────

        case 'mattermost.exportChannel': {
            if (!ctx.mattermostService || !msg.channelId) { return true; }
            try {
                const channelId = msg.channelId as string;
                const channelName = (msg.channelName as string) || 'channel';

                // Show progress while fetching all messages
                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: `Exporting messages from #${channelName}…`,
                        cancellable: false,
                    },
                    async (progress) => {
                        progress.report({ message: 'Fetching messages…' });

                        const entries = await ctx.mattermostService!.exportChannelMessages(
                            channelId,
                            (fetched) => {
                                progress.report({ message: `${fetched} messages fetched…` });
                            },
                        );

                        if (entries.length === 0) {
                            vscode.window.showInformationMessage('No messages to export.');
                            return;
                        }

                        progress.report({ message: 'Saving file…' });

                        // Prompt user for save location
                        const configDir = vscode.workspace
                            .getConfiguration('superprompt-forge.mattermost')
                            .get<string>('exportDirectory', '')
                            .trim();
                        const baseDir = configDir || require('path').join(require('os').homedir(), 'Downloads');
                        const fileName = `${channelName}-export-${new Date().toISOString().slice(0, 10)}.json`;
                        const uri = await vscode.window.showSaveDialog({
                            defaultUri: vscode.Uri.file(`${baseDir}/${fileName}`),
                            filters: { 'JSON Files': ['json'] },
                            title: 'Export Mattermost Messages',
                        });

                        if (uri) {
                            const json = JSON.stringify(entries, null, 2);
                            await vscode.workspace.fs.writeFile(uri, Buffer.from(json, 'utf-8'));
                            vscode.window.showInformationMessage(
                                `Exported ${entries.length} messages to ${uri.fsPath}`,
                            );
                        }
                    },
                );
            } catch (e: unknown) {
                const m = extractErrorMessage(e);
                vscode.window.showErrorMessage(`Export failed: ${m}`);
            }
            return true;
        }

        default:
            return false;
    }
};

// ─── Private helpers (moved from StashPanel) ─────────────────

import type { MattermostChannelData } from '../mattermostService';
import type { MattermostChannel } from '../mattermostService';

/** Resolve DM display names and other-user IDs for DM/group channels. */
async function _resolveDmChannelPayloads(
    ctx: HandlerContext,
    dmChannels: MattermostChannel[],
    myUserId: string,
): Promise<MattermostChannelData[]> {
    if (!ctx.mattermostService) { return []; }
    const results: MattermostChannelData[] = [];
    for (const c of dmChannels) {
        if (c.type === 'D') {
            const otherUserId = ctx.mattermostService.getDmOtherUserId(c, myUserId);
            const displayName = await ctx.mattermostService.resolveDmDisplayName(c, myUserId);
            const data = MattermostService.toChannelData(
                { ...c, displayName },
                otherUserId,
            );
            results.push(data);
        } else {
            results.push(MattermostService.toChannelData(c));
        }
    }
    return results;
}

/** Fetch unreads for all channel IDs and send as bulk to webview. */
async function _fetchBulkUnreads(ctx: HandlerContext, channelIds: string[]): Promise<void> {
    if (!ctx.mattermostService || channelIds.length === 0) { return; }
    const bulkUnreads: Array<{ channelId: string; msgCount: number; mentionCount: number }> = [];
    // Fetch in parallel batches to avoid overwhelming the server
    const batchSize = 10;
    for (let i = 0; i < channelIds.length; i += batchSize) {
        const batch = channelIds.slice(i, i + batchSize);
        const results = await Promise.allSettled(
            batch.map((id) => ctx.mattermostService!.getChannelUnread(id)),
        );
        for (const r of results) {
            if (r.status === 'fulfilled') {
                bulkUnreads.push(MattermostService.toChannelUnreadData(r.value));
            }
        }
    }
    if (bulkUnreads.length > 0) {
        ctx.postMessage({
            type: 'mattermostBulkUnreads',
            payload: bulkUnreads,
        });
    }
}
