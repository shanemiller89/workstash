import { create } from 'zustand';

/** Lightweight PR data shape received from the extension */
export interface PullRequestData {
    number: number;
    title: string;
    state: 'open' | 'closed' | 'merged';
    htmlUrl: string;
    body: string;
    author: string;
    authorAvatarUrl: string;
    branch: string;
    baseBranch: string;
    createdAt: string;
    updatedAt: string;
    mergedAt: string | null;
    closedAt: string | null;
    commentsCount: number;
    additions: number;
    deletions: number;
    changedFiles: number;
    labels: { name: string; color: string }[];
    isDraft: boolean;
    requestedReviewers: { login: string; avatarUrl: string }[];
}

export interface PRCommentData {
    id: number;
    body: string;
    author: string;
    authorAvatarUrl: string;
    createdAt: string;
    updatedAt: string;
    htmlUrl: string;
    /** Review-comment fields (absent for issue comments) */
    isReviewComment: boolean;
    path?: string;
    line?: number | null;
    diffHunk?: string;
    /** Threading: the review comment this is a reply to (review comments only) */
    inReplyToId?: number;
    /** The GraphQL node ID of the review thread this comment belongs to */
    threadId?: string;
    /** Whether this comment's thread is resolved (null for issue comments) */
    isResolved?: boolean | null;
    /** Who resolved the thread */
    resolvedBy?: string | null;
}

export type PRStateFilter = 'open' | 'closed' | 'merged' | 'all';
export type CommentResolvedFilter = 'all' | 'resolved' | 'unresolved';

/** A group of comments sharing the same author */
export interface CommentGroup {
    author: string;
    authorAvatarUrl: string;
    comments: PRCommentData[];
}

/** A review thread: root comment + replies */
export interface ReviewThread {
    threadId: string;
    rootComment: PRCommentData;
    replies: PRCommentData[];
    isResolved: boolean;
    resolvedBy: string | null;
    path?: string;
    line?: number | null;
}

interface PRStore {
    prs: PullRequestData[];
    selectedPRNumber: number | null;
    selectedPRDetail: PullRequestData | null;
    comments: PRCommentData[];
    stateFilter: PRStateFilter;
    isLoading: boolean;
    isCommentsLoading: boolean;
    isCommentSaving: boolean;
    isRepoNotFound: boolean;
    searchQuery: string;

    // Comment filter / grouping state
    commentUserFilter: string[];
    commentResolvedFilter: CommentResolvedFilter;
    commentGroupByUser: boolean;

    // Thread panel state
    activeThreadId: string | null;

    // Reviewer state
    collaborators: { login: string; avatarUrl: string }[];
    isRequestingReview: boolean;

    // Create PR state
    isCreatingPR: boolean;
    showCreatePR: boolean;
    branches: string[];
    currentBranch: string | null;
    isGeneratingSummary: boolean;
    generatedSummary: string | null;
    summaryError: string | null;
    createError: string | null;
    prSummarySystemPrompt: string;

    // Actions
    setPRs: (prs: PullRequestData[]) => void;
    selectPR: (prNumber: number) => void;
    clearSelection: () => void;
    setPRDetail: (pr: PullRequestData) => void;
    setComments: (comments: PRCommentData[]) => void;
    addComment: (comment: PRCommentData) => void;
    updateComment: (id: number, patch: Partial<PRCommentData>) => void;
    updateThreadResolved: (threadId: string, isResolved: boolean, resolvedBy: string | null) => void;
    setStateFilter: (filter: PRStateFilter) => void;
    setLoading: (loading: boolean) => void;
    setCommentsLoading: (loading: boolean) => void;
    setCommentSaving: (saving: boolean) => void;
    setRepoNotFound: (notFound: boolean) => void;
    setSearchQuery: (query: string) => void;
    setCommentUserFilter: (users: string[]) => void;
    setCommentResolvedFilter: (filter: CommentResolvedFilter) => void;
    setCommentGroupByUser: (grouped: boolean) => void;
    setCollaborators: (collaborators: { login: string; avatarUrl: string }[]) => void;
    setRequestingReview: (requesting: boolean) => void;
    updateRequestedReviewers: (reviewers: { login: string; avatarUrl: string }[]) => void;
    filteredPRs: () => PullRequestData[];
    selectedPR: () => PullRequestData | undefined;

    // Thread actions
    openThread: (threadId: string) => void;
    closeThread: () => void;

    // Create PR actions
    setShowCreatePR: (show: boolean) => void;
    setBranches: (branches: string[], currentBranch: string | null) => void;
    setCreatingPR: (creating: boolean) => void;
    setGeneratingSummary: (generating: boolean) => void;
    setGeneratedSummary: (summary: string | null) => void;
    setSummaryError: (error: string | null) => void;
    setCreateError: (error: string | null) => void;
    setPRSummarySystemPrompt: (prompt: string) => void;

    // Comment selectors
    commentAuthors: () => string[];
    filteredComments: () => PRCommentData[];
    groupedComments: () => CommentGroup[];
    /** Build review threads from filtered comments */
    reviewThreads: () => ReviewThread[];
    /** Get only issue-level (non-review) comments */
    issueComments: () => PRCommentData[];
    /** Get the thread for the active thread panel */
    activeThread: () => ReviewThread | null;
}

export const usePRStore = create<PRStore>((set, get) => ({
    prs: [],
    selectedPRNumber: null,
    selectedPRDetail: null,
    comments: [],
    stateFilter: 'open',
    isLoading: false,
    isCommentsLoading: false,
    isCommentSaving: false,
    isRepoNotFound: false,
    searchQuery: '',
    commentUserFilter: [],
    commentResolvedFilter: 'all',
    commentGroupByUser: false,
    collaborators: [],
    isRequestingReview: false,

    // Thread panel state
    activeThreadId: null,

    // Create PR state
    isCreatingPR: false,
    showCreatePR: false,
    branches: [],
    currentBranch: null,
    createError: null,

    // AI summary state
    isGeneratingSummary: false,
    generatedSummary: null,
    summaryError: null,
    prSummarySystemPrompt: '',

    setPRs: (prs) => {
        const { selectedPRNumber } = get();
        const stillExists =
            selectedPRNumber !== null && prs.some((pr) => pr.number === selectedPRNumber);
        set({
            prs,
            isLoading: false,
            ...(stillExists
                ? {}
                : {
                      selectedPRNumber: null,
                      selectedPRDetail: null,
                      comments: [],
                  }),
        });
    },

    selectPR: (prNumber) => {
        const { selectedPRNumber } = get();
        if (prNumber === selectedPRNumber) return;
        set({
            selectedPRNumber: prNumber,
            selectedPRDetail: null,
            comments: [],
            isCommentsLoading: true,
        });
    },

    clearSelection: () =>
        set({
            selectedPRNumber: null,
            selectedPRDetail: null,
            comments: [],
            isCommentsLoading: false,
            commentUserFilter: [],
            commentResolvedFilter: 'all',
        }),

    setPRDetail: (pr) => set({ selectedPRDetail: pr }),

    setComments: (comments) => set({ comments, isCommentsLoading: false }),

    addComment: (comment) =>
        set((state) => ({
            comments: [...state.comments, comment],
            isCommentSaving: false,
        })),

    updateComment: (id, patch) =>
        set((state) => ({
            comments: state.comments.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),

    updateThreadResolved: (threadId, isResolved, resolvedBy) =>
        set((state) => ({
            comments: state.comments.map((c) =>
                c.threadId === threadId ? { ...c, isResolved, resolvedBy } : c,
            ),
        })),

    setStateFilter: (stateFilter) =>
        set({
            stateFilter,
            selectedPRNumber: null,
            selectedPRDetail: null,
            comments: [],
            prs: [],
            isLoading: true,
        }),

    setLoading: (loading) => set({ isLoading: loading }),
    setCommentsLoading: (loading) => set({ isCommentsLoading: loading }),
    setCommentSaving: (saving) => set({ isCommentSaving: saving }),
    setRepoNotFound: (notFound) => set({ isRepoNotFound: notFound, isLoading: false }),

    setSearchQuery: (searchQuery) => set({ searchQuery }),

    setCommentUserFilter: (commentUserFilter) => set({ commentUserFilter }),
    setCommentResolvedFilter: (commentResolvedFilter) => set({ commentResolvedFilter }),
    setCommentGroupByUser: (commentGroupByUser) => set({ commentGroupByUser }),

    setCollaborators: (collaborators) => set({ collaborators }),
    setRequestingReview: (isRequestingReview) => set({ isRequestingReview }),
    updateRequestedReviewers: (reviewers) => {
        const { selectedPRDetail } = get();
        if (selectedPRDetail) {
            set({
                selectedPRDetail: { ...selectedPRDetail, requestedReviewers: reviewers },
                isRequestingReview: false,
            });
        } else {
            set({ isRequestingReview: false });
        }
    },

    // ─── Thread actions ───
    openThread: (threadId) => set({ activeThreadId: threadId }),
    closeThread: () => set({ activeThreadId: null }),

    // ─── Create PR actions ───
    setShowCreatePR: (show) => set({ showCreatePR: show, createError: null }),
    setBranches: (branches, currentBranch) => set({ branches, currentBranch }),
    setCreatingPR: (creating) => set({ isCreatingPR: creating }),
    setGeneratingSummary: (generating) => set({ isGeneratingSummary: generating }),
    setGeneratedSummary: (summary) => set({ generatedSummary: summary, isGeneratingSummary: false }),
    setSummaryError: (error) => set({ summaryError: error, isGeneratingSummary: false }),
    setCreateError: (error) => set({ createError: error, isCreatingPR: false }),
    setPRSummarySystemPrompt: (prompt) => set({ prSummarySystemPrompt: prompt }),

    filteredPRs: () => {
        const { prs, searchQuery } = get();
        const q = searchQuery.trim().toLowerCase();
        if (!q) return prs;
        return prs.filter(
            (pr) =>
                pr.title.toLowerCase().includes(q) ||
                `#${pr.number}`.includes(q) ||
                pr.branch.toLowerCase().includes(q),
        );
    },

    selectedPR: () => {
        const { prs, selectedPRNumber } = get();
        if (selectedPRNumber === null) return undefined;
        return prs.find((pr) => pr.number === selectedPRNumber);
    },

    /** Unique sorted list of comment authors */
    commentAuthors: () => {
        const { comments } = get();
        const authors = [...new Set(comments.map((c) => c.author))];
        return authors.sort((a, b) => a.localeCompare(b));
    },

    /** Comments after applying user + resolved filters */
    filteredComments: () => {
        const { comments, commentUserFilter, commentResolvedFilter } = get();
        let result = comments;

        // User filter (multiselect — empty = show all)
        if (commentUserFilter.length > 0) {
            result = result.filter((c) => commentUserFilter.includes(c.author));
        }

        // Resolved filter
        if (commentResolvedFilter === 'resolved') {
            result = result.filter((c) => c.isResolved === true);
        } else if (commentResolvedFilter === 'unresolved') {
            // Show issue comments (isResolved is null/undefined) + unresolved review threads
            result = result.filter((c) => c.isResolved !== true);
        }

        return result;
    },

    /** Filtered comments grouped by author, preserving chronological order within groups */
    groupedComments: () => {
        const filtered = get().filteredComments();
        const groupMap = new Map<string, CommentGroup>();

        for (const comment of filtered) {
            const existing = groupMap.get(comment.author);
            if (existing) {
                existing.comments.push(comment);
            } else {
                groupMap.set(comment.author, {
                    author: comment.author,
                    authorAvatarUrl: comment.authorAvatarUrl,
                    comments: [comment],
                });
            }
        }

        return [...groupMap.values()];
    },

    /** Build review threads from filtered review comments */
    reviewThreads: () => {
        const filtered = get().filteredComments();
        // Only review comments have threadId
        const reviewComments = filtered.filter((c) => c.threadId);
        const threadMap = new Map<string, ReviewThread>();

        for (const comment of reviewComments) {
            const tid = comment.threadId!;
            const existing = threadMap.get(tid);
            if (existing) {
                existing.replies.push(comment);
            } else {
                threadMap.set(tid, {
                    threadId: tid,
                    rootComment: comment,
                    replies: [],
                    isResolved: comment.isResolved ?? false,
                    resolvedBy: comment.resolvedBy ?? null,
                    path: comment.path,
                    line: comment.line,
                });
            }
        }

        // Sort replies chronologically within each thread
        for (const thread of threadMap.values()) {
            thread.replies.sort(
                (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
            );
        }

        // Sort threads: unresolved first, then by root comment date
        return [...threadMap.values()].sort((a, b) => {
            if (a.isResolved !== b.isResolved) return a.isResolved ? 1 : -1;
            return (
                new Date(a.rootComment.createdAt).getTime() -
                new Date(b.rootComment.createdAt).getTime()
            );
        });
    },

    /** Get only issue-level (non-review) comments */
    issueComments: () => {
        const filtered = get().filteredComments();
        return filtered.filter((c) => !c.threadId);
    },

    /** Get the thread for the active thread panel */
    activeThread: () => {
        const { activeThreadId } = get();
        if (!activeThreadId) return null;
        const threads = get().reviewThreads();
        return threads.find((t) => t.threadId === activeThreadId) ?? null;
    },
}));
