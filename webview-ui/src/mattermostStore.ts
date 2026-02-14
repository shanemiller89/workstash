import { create } from 'zustand';

/** Lightweight data shapes received from the extension */
export interface MattermostTeamData {
    id: string;
    name: string;
    displayName: string;
    description: string;
    type: 'O' | 'I';
}

export interface MattermostChannelData {
    id: string;
    teamId: string;
    name: string;
    displayName: string;
    type: 'O' | 'P' | 'D' | 'G';
    header: string;
    purpose: string;
    lastPostAt: string;
    otherUserId?: string; // For DM channels: the other user's ID
}

export interface MattermostFileInfoData {
    id: string;
    name: string;
    extension: string;
    size: number;
    mimeType: string;
    width?: number;
    height?: number;
    hasPreview: boolean;
    url: string;
}

export interface MattermostPostData {
    id: string;
    channelId: string;
    userId: string;
    username: string;
    message: string;
    createAt: string;
    updateAt: string;
    rootId: string;
    type: string;
    files?: MattermostFileInfoData[];
}

export interface MattermostUserData {
    id: string;
    username: string;
    email: string;
    firstName: string;
    lastName: string;
    nickname: string;
}

export interface MattermostReactionData {
    userId: string;
    postId: string;
    emojiName: string;
    username: string;
}

export interface MattermostUserStatusData {
    userId: string;
    status: 'online' | 'away' | 'offline' | 'dnd';
}

export interface MattermostChannelUnreadData {
    channelId: string;
    msgCount: number;
    mentionCount: number;
}

export interface MattermostEmojiData {
    id: string;
    name: string;
    isCustom: boolean;
    imageUrl?: string;
}

/** Typing indicator entry — auto-cleared after timeout */
interface TypingEntry {
    userId: string;
    channelId: string;
    /** Timestamp when the typing event was received */
    timestamp: number;
}

interface MattermostStore {
    // Auth / config state
    isConfigured: boolean;
    currentUser: MattermostUserData | null;

    // Connection status (WebSocket)
    isConnected: boolean;

    // Teams & Channels
    teams: MattermostTeamData[];
    channels: MattermostChannelData[]; // public/private channels for the selected team
    dmChannels: MattermostChannelData[]; // DM + group DM channels
    selectedTeamId: string | null;
    selectedChannelId: string | null;
    selectedChannelName: string | null;

    // Messages
    posts: MattermostPostData[];
    isLoadingPosts: boolean;
    isLoadingChannels: boolean;
    isSendingMessage: boolean;
    hasMorePosts: boolean;

    // Search
    searchQuery: string;

    // Threads
    /** The root post ID of the currently open thread panel (null = closed) */
    activeThreadRootId: string | null;
    /** Posts for the active thread (root + replies), sorted oldest first */
    threadPosts: MattermostPostData[];
    isLoadingThread: boolean;

    // User statuses (online/away/offline/dnd)
    userStatuses: Record<string, 'online' | 'away' | 'offline' | 'dnd'>;

    // Reactions: postId → reactions array
    reactions: Record<string, MattermostReactionData[]>;

    // Typing indicators
    typingEntries: TypingEntry[];

    // Unread counts: channelId → unread data
    unreads: Record<string, MattermostChannelUnreadData>;

    // Emoji autocomplete results
    emojiSuggestions: MattermostEmojiData[];

    // Reply-to mode: when set, main compose sends a threaded reply
    replyToPostId: string | null;
    replyToUsername: string | null;

    // User search loading state
    isSearchingUsers: boolean;

    // User search results (for New DM)
    userSearchResults: MattermostUserData[];

    // Actions — config / auth
    setConfigured: (configured: boolean) => void;
    setCurrentUser: (user: MattermostUserData | null) => void;
    setConnected: (connected: boolean) => void;

    // Actions — teams / channels
    setTeams: (teams: MattermostTeamData[]) => void;
    setChannels: (channels: MattermostChannelData[]) => void;
    setDmChannels: (channels: MattermostChannelData[]) => void;
    selectTeam: (teamId: string) => void;
    selectChannel: (channelId: string, channelName: string) => void;
    clearChannelSelection: () => void;

    // Actions — posts
    setPosts: (posts: MattermostPostData[]) => void;
    appendOlderPosts: (posts: MattermostPostData[]) => void;
    prependNewPost: (post: MattermostPostData) => void;
    updatePost: (post: MattermostPostData) => void;
    removePost: (postId: string) => void;
    setLoadingPosts: (loading: boolean) => void;
    setLoadingChannels: (loading: boolean) => void;
    setSendingMessage: (sending: boolean) => void;
    setHasMorePosts: (hasMore: boolean) => void;
    setSearchQuery: (query: string) => void;

    // Actions — threads
    openThread: (rootId: string) => void;
    closeThread: () => void;
    setThreadPosts: (posts: MattermostPostData[]) => void;
    appendThreadPost: (post: MattermostPostData) => void;
    setLoadingThread: (loading: boolean) => void;

    // Actions — statuses
    setUserStatuses: (statuses: MattermostUserStatusData[]) => void;
    updateUserStatus: (userId: string, status: 'online' | 'away' | 'offline' | 'dnd') => void;

    // Actions — reactions
    setReactionsForPost: (postId: string, reactions: MattermostReactionData[]) => void;
    setBulkReactions: (reactions: MattermostReactionData[]) => void;
    addReaction: (reaction: MattermostReactionData) => void;
    removeReaction: (userId: string, postId: string, emojiName: string) => void;

    // Actions — typing
    addTyping: (userId: string, channelId: string) => void;
    clearStaleTyping: () => void;

    // Actions — unreads
    setUnread: (data: MattermostChannelUnreadData) => void;
    setBulkUnreads: (data: MattermostChannelUnreadData[]) => void;
    incrementUnread: (channelId: string) => void;
    markChannelRead: (channelId: string) => void;

    // Actions — emoji
    setEmojiSuggestions: (emojis: MattermostEmojiData[]) => void;

    // Actions — reply-to
    setReplyTo: (postId: string, username: string) => void;
    clearReplyTo: () => void;

    // Actions — user search
    setIsSearchingUsers: (searching: boolean) => void;
    setUserSearchResults: (users: MattermostUserData[]) => void;
    clearUserSearchResults: () => void;
}

const EMPTY_TEAMS: MattermostTeamData[] = [];
const EMPTY_CHANNELS: MattermostChannelData[] = [];
const EMPTY_POSTS: MattermostPostData[] = [];
const EMPTY_EMOJIS: MattermostEmojiData[] = [];
const EMPTY_USERS: MattermostUserData[] = [];
const TYPING_TIMEOUT_MS = 5_000;

export const useMattermostStore = create<MattermostStore>((set) => ({
    isConfigured: false,
    currentUser: null,
    isConnected: false,
    teams: EMPTY_TEAMS,
    channels: EMPTY_CHANNELS,
    dmChannels: EMPTY_CHANNELS,
    selectedTeamId: null,
    selectedChannelId: null,
    selectedChannelName: null,
    posts: EMPTY_POSTS,
    isLoadingPosts: false,
    isLoadingChannels: false,
    isSendingMessage: false,
    hasMorePosts: true,
    searchQuery: '',
    activeThreadRootId: null,
    threadPosts: EMPTY_POSTS,
    isLoadingThread: false,
    userStatuses: {},
    reactions: {},
    typingEntries: [],
    unreads: {},
    emojiSuggestions: EMPTY_EMOJIS,
    replyToPostId: null,
    replyToUsername: null,
    isSearchingUsers: false,
    userSearchResults: EMPTY_USERS,

    // ─── Config / Auth ────────────────────────────────────────────
    setConfigured: (isConfigured) => set({ isConfigured }),
    setCurrentUser: (currentUser) => set({ currentUser }),
    setConnected: (isConnected) => set({ isConnected }),

    // ─── Teams / Channels ─────────────────────────────────────────
    setTeams: (teams) => set({ teams }),
    setChannels: (channels) => set({ channels }),
    setDmChannels: (dmChannels) => set({ dmChannels }),
    selectTeam: (teamId) =>
        set({
            selectedTeamId: teamId,
            selectedChannelId: null,
            selectedChannelName: null,
            posts: EMPTY_POSTS,
            channels: EMPTY_CHANNELS,
            dmChannels: EMPTY_CHANNELS,
            activeThreadRootId: null,
            threadPosts: EMPTY_POSTS,
        }),
    selectChannel: (channelId, channelName) =>
        set({
            selectedChannelId: channelId,
            selectedChannelName: channelName,
            posts: EMPTY_POSTS,
            hasMorePosts: true,
            activeThreadRootId: null,
            threadPosts: EMPTY_POSTS,
            reactions: {},
            replyToPostId: null,
            replyToUsername: null,
        }),
    clearChannelSelection: () =>
        set({
            selectedChannelId: null,
            selectedChannelName: null,
            posts: EMPTY_POSTS,
            activeThreadRootId: null,
            threadPosts: EMPTY_POSTS,
        }),

    // ─── Posts ────────────────────────────────────────────────────
    setPosts: (posts) => set({ posts }),
    appendOlderPosts: (olderPosts) =>
        set((state) => ({
            posts: [...state.posts, ...olderPosts],
        })),
    prependNewPost: (post) =>
        set((state) => ({
            posts: [post, ...state.posts],
        })),
    updatePost: (updatedPost) =>
        set((state) => ({
            posts: state.posts.map((p) => (p.id === updatedPost.id ? updatedPost : p)),
            threadPosts: state.threadPosts.map((p) => (p.id === updatedPost.id ? updatedPost : p)),
        })),
    removePost: (postId) =>
        set((state) => ({
            posts: state.posts.filter((p) => p.id !== postId),
            threadPosts: state.threadPosts.filter((p) => p.id !== postId),
        })),
    setLoadingPosts: (isLoadingPosts) => set({ isLoadingPosts }),
    setLoadingChannels: (isLoadingChannels) => set({ isLoadingChannels }),
    setSendingMessage: (isSendingMessage) => set({ isSendingMessage }),
    setHasMorePosts: (hasMorePosts) => set({ hasMorePosts }),
    setSearchQuery: (searchQuery) => set({ searchQuery }),

    // ─── Threads ──────────────────────────────────────────────────
    openThread: (rootId) =>
        set({
            activeThreadRootId: rootId,
            threadPosts: EMPTY_POSTS,
            isLoadingThread: true,
        }),
    closeThread: () =>
        set({
            activeThreadRootId: null,
            threadPosts: EMPTY_POSTS,
            isLoadingThread: false,
        }),
    setThreadPosts: (threadPosts) => set({ threadPosts, isLoadingThread: false }),
    appendThreadPost: (post) =>
        set((state) => ({
            threadPosts: [...state.threadPosts, post],
        })),
    setLoadingThread: (isLoadingThread) => set({ isLoadingThread }),

    // ─── Statuses ─────────────────────────────────────────────────
    setUserStatuses: (statuses) =>
        set((state) => {
            const next = { ...state.userStatuses };
            for (const s of statuses) {
                next[s.userId] = s.status;
            }
            return { userStatuses: next };
        }),
    updateUserStatus: (userId, status) =>
        set((state) => ({
            userStatuses: { ...state.userStatuses, [userId]: status },
        })),

    // ─── Reactions ────────────────────────────────────────────────
    setReactionsForPost: (postId, reactions) =>
        set((state) => ({
            reactions: { ...state.reactions, [postId]: reactions },
        })),
    setBulkReactions: (reactionsList) =>
        set((state) => {
            const next = { ...state.reactions };
            for (const r of reactionsList) {
                if (!next[r.postId]) { next[r.postId] = []; }
                next[r.postId] = [...next[r.postId], r];
            }
            return { reactions: next };
        }),
    addReaction: (reaction) =>
        set((state) => {
            const postReactions = state.reactions[reaction.postId] ?? [];
            return {
                reactions: {
                    ...state.reactions,
                    [reaction.postId]: [...postReactions, reaction],
                },
            };
        }),
    removeReaction: (userId, postId, emojiName) =>
        set((state) => {
            const postReactions = state.reactions[postId] ?? [];
            return {
                reactions: {
                    ...state.reactions,
                    [postId]: postReactions.filter(
                        (r) => !(r.userId === userId && r.emojiName === emojiName),
                    ),
                },
            };
        }),

    // ─── Typing ───────────────────────────────────────────────────
    addTyping: (userId, channelId) =>
        set((state) => {
            const now = Date.now();
            // Remove existing entry for same user+channel, then add fresh one
            const filtered = state.typingEntries.filter(
                (e) => !(e.userId === userId && e.channelId === channelId),
            );
            return { typingEntries: [...filtered, { userId, channelId, timestamp: now }] };
        }),
    clearStaleTyping: () =>
        set((state) => {
            const cutoff = Date.now() - TYPING_TIMEOUT_MS;
            const fresh = state.typingEntries.filter((e) => e.timestamp > cutoff);
            return fresh.length !== state.typingEntries.length
                ? { typingEntries: fresh }
                : state;
        }),

    // ─── Unreads ──────────────────────────────────────────────────
    setUnread: (data) =>
        set((state) => ({
            unreads: { ...state.unreads, [data.channelId]: data },
        })),
    setBulkUnreads: (dataList) =>
        set((state) => {
            const next = { ...state.unreads };
            for (const d of dataList) {
                next[d.channelId] = d;
            }
            return { unreads: next };
        }),
    incrementUnread: (channelId) =>
        set((state) => {
            const existing = state.unreads[channelId] ?? { channelId, msgCount: 0, mentionCount: 0 };
            return {
                unreads: {
                    ...state.unreads,
                    [channelId]: { ...existing, msgCount: existing.msgCount + 1 },
                },
            };
        }),
    markChannelRead: (channelId) =>
        set((state) => ({
            unreads: {
                ...state.unreads,
                [channelId]: { channelId, msgCount: 0, mentionCount: 0 },
            },
        })),

    // ─── Emoji ────────────────────────────────────────────────────
    setEmojiSuggestions: (emojiSuggestions) => set({ emojiSuggestions }),

    // ─── Reply-to ─────────────────────────────────────────────────
    setReplyTo: (postId, username) => set({ replyToPostId: postId, replyToUsername: username }),
    clearReplyTo: () => set({ replyToPostId: null, replyToUsername: null }),

    // ─── User Search ──────────────────────────────────────────────
    setIsSearchingUsers: (isSearchingUsers) => set({ isSearchingUsers }),
    setUserSearchResults: (userSearchResults) => set({ userSearchResults }),
    clearUserSearchResults: () => set({ userSearchResults: EMPTY_USERS, isSearchingUsers: false }),
}));
