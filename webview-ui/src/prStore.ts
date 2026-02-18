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
    assignees: { login: string; avatarUrl: string }[];
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
export type PRAuthorFilter = 'all' | 'authored' | 'assigned' | 'review-requested';
export type CommentResolvedFilter = 'all' | 'resolved' | 'unresolved';

/** A file changed in a pull request. */
export interface PRFileData {
    filename: string;
    status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged';
    additions: number;
    deletions: number;
    changes: number;
    patch?: string;
    sha: string;
    previousFilename?: string;
}

/** A review submitted on a pull request. */
export interface PRReviewData {
    id: number;
    user: string;
    userAvatarUrl: string;
    state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING';
    body: string;
    submittedAt: string | null;
    htmlUrl: string;
}

/** Review event types for submitting a PR review. */
export type PRReviewEvent = 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';

/** Merge method options. */
export type PRMergeMethod = 'merge' | 'squash' | 'rebase';

/** An inline comment to include when submitting a review. */
export interface PendingInlineComment {
    path: string;
    line: number;
    side?: 'LEFT' | 'RIGHT';
    body: string;
}

/** The active sub-tab in the PR detail view. */
export type PRDetailTab = 'conversation' | 'files';

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
    authorFilter: PRAuthorFilter;
    isLoading: boolean;
    isCommentsLoading: boolean;
    isCommentSaving: boolean;
    isRepoNotFound: boolean;
    error: string | null;
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

    // Body editing state
    isEditingBody: boolean;
    isBodySaving: boolean;

    // PR files & review state
    prFiles: PRFileData[];
    isFilesLoading: boolean;
    filesError: string | null;
    selectedFilePath: string | null;
    reviews: PRReviewData[];
    pendingReviewComments: PendingInlineComment[];
    isSubmittingReview: boolean;
    reviewError: string | null;
    isMerging: boolean;
    mergeError: string | null;
    detailTab: PRDetailTab;

    // File change AI summary state
    filesSummary: string | null;
    isFilesSummaryLoading: boolean;
    filesSummaryError: string | null;
    fileReviewSystemPrompt: string;

    // PR summary pane state
    prSummaryPaneOpen: boolean;
    prSummaryPaneWidth: number;

    // Files summary pane state
    filesSummaryPaneOpen: boolean;
    filesSummaryPaneWidth: number;

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
    setAuthorFilter: (filter: PRAuthorFilter) => void;
    setLoading: (loading: boolean) => void;
    setCommentsLoading: (loading: boolean) => void;
    setCommentSaving: (saving: boolean) => void;
    setRepoNotFound: (notFound: boolean) => void;
    setError: (error: string | null) => void;
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

    // Body editing actions
    setEditingBody: (editing: boolean) => void;
    setBodySaving: (saving: boolean) => void;

    // PR files & review actions
    setPRFiles: (files: PRFileData[]) => void;
    setFilesLoading: (loading: boolean) => void;
    setFilesError: (error: string | null) => void;
    selectFile: (filePath: string | null) => void;
    setReviews: (reviews: PRReviewData[]) => void;
    addReview: (review: PRReviewData) => void;
    setSubmittingReview: (submitting: boolean) => void;
    setReviewError: (error: string | null) => void;
    addPendingComment: (comment: PendingInlineComment) => void;
    removePendingComment: (index: number) => void;
    clearPendingComments: () => void;
    setMerging: (merging: boolean) => void;
    setMergeError: (error: string | null) => void;
    setDetailTab: (tab: PRDetailTab) => void;

    // File change AI summary actions
    setFilesSummaryLoading: (loading: boolean) => void;
    setFilesSummary: (summary: string | null) => void;
    setFilesSummaryError: (error: string | null) => void;
    setFileReviewSystemPrompt: (prompt: string) => void;

    // PR summary pane actions
    setPRSummaryPaneOpen: (open: boolean) => void;
    setPRSummaryPaneWidth: (width: number) => void;

    // Files summary pane actions
    setFilesSummaryPaneOpen: (open: boolean) => void;
    setFilesSummaryPaneWidth: (width: number) => void;

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
    authorFilter: 'all',
    isLoading: false,
    isCommentsLoading: false,
    isCommentSaving: false,
    isRepoNotFound: false,
    error: null,
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

    // Body editing state
    isEditingBody: false,
    isBodySaving: false,

    // PR files & review state
    prFiles: [],
    isFilesLoading: false,
    filesError: null,
    selectedFilePath: null,
    reviews: [],
    pendingReviewComments: [],
    isSubmittingReview: false,
    reviewError: null,
    isMerging: false,
    mergeError: null,
    detailTab: 'conversation',

    // File change AI summary state
    filesSummary: null,
    isFilesSummaryLoading: false,
    filesSummaryError: null,
    fileReviewSystemPrompt: '',

    // PR summary pane state
    prSummaryPaneOpen: false,
    prSummaryPaneWidth: 350,

    // Files summary pane state
    filesSummaryPaneOpen: false,
    filesSummaryPaneWidth: 380,

    setPRs: (prs) => {
        const { selectedPRNumber } = get();
        const stillExists =
            selectedPRNumber !== null && prs.some((pr) => pr.number === selectedPRNumber);
        set({
            prs,
            isLoading: false,
            error: null,
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
        if (prNumber === selectedPRNumber) {return;}
        set({
            selectedPRNumber: prNumber,
            selectedPRDetail: null,
            comments: [],
            reviews: [],
            prFiles: [],
            filesError: null,
            selectedFilePath: null,
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
            prFiles: [],
            isFilesLoading: false,
            filesError: null,
            selectedFilePath: null,
            reviews: [],
            pendingReviewComments: [],
            isSubmittingReview: false,
            reviewError: null,
            isMerging: false,
            mergeError: null,
            detailTab: 'conversation',
            filesSummary: null,
            isFilesSummaryLoading: false,
            filesSummaryError: null,
            prSummaryPaneOpen: false,
            filesSummaryPaneOpen: false,
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

    setAuthorFilter: (authorFilter) =>
        set({
            authorFilter,
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
    setError: (error) => set({ error, isLoading: false }),

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

    // Body editing actions
    setEditingBody: (editing) => set({ isEditingBody: editing, generatedSummary: null, summaryError: null }),
    setBodySaving: (saving) => set({ isBodySaving: saving }),

    // PR files & review actions
    setPRFiles: (prFiles) => set({ prFiles, isFilesLoading: false, filesError: null }),
    setFilesLoading: (loading) => set({ isFilesLoading: loading }),
    setFilesError: (error) => set({ filesError: error, isFilesLoading: false }),
    selectFile: (filePath) => set({ selectedFilePath: filePath }),
    setReviews: (reviews) => set({ reviews }),
    addReview: (review) => set((state) => ({ reviews: [...state.reviews, review], isSubmittingReview: false, reviewError: null, pendingReviewComments: [] })),
    setSubmittingReview: (submitting) => set({ isSubmittingReview: submitting }),
    setReviewError: (error) => set({ reviewError: error, isSubmittingReview: false }),
    addPendingComment: (comment) => set((state) => ({ pendingReviewComments: [...state.pendingReviewComments, comment] })),
    removePendingComment: (index) => set((state) => ({ pendingReviewComments: state.pendingReviewComments.filter((_, i) => i !== index) })),
    clearPendingComments: () => set({ pendingReviewComments: [] }),
    setMerging: (merging) => set({ isMerging: merging }),
    setMergeError: (error) => set({ mergeError: error, isMerging: false }),
    setDetailTab: (tab) => set({ detailTab: tab }),

    // File change AI summary actions — auto-open pane on result
    setFilesSummaryLoading: (loading) => set({ isFilesSummaryLoading: loading, filesSummaryError: null }),
    setFilesSummary: (summary) => set({ filesSummary: summary, isFilesSummaryLoading: false, filesSummaryError: null, filesSummaryPaneOpen: !!summary }),
    setFilesSummaryError: (error) => set({ filesSummaryError: error, isFilesSummaryLoading: false }),
    setFileReviewSystemPrompt: (prompt) => set({ fileReviewSystemPrompt: prompt }),

    // PR summary pane actions
    setPRSummaryPaneOpen: (open) => set({ prSummaryPaneOpen: open }),
    setPRSummaryPaneWidth: (width) => set({ prSummaryPaneWidth: width }),

    // Files summary pane actions
    setFilesSummaryPaneOpen: (open) => set({ filesSummaryPaneOpen: open }),
    setFilesSummaryPaneWidth: (width) => set({ filesSummaryPaneWidth: width }),

    filteredPRs: () => {
        const { prs, searchQuery } = get();
        const q = searchQuery.trim().toLowerCase();
        if (!q) {return prs;}
        return prs.filter(
            (pr) =>
                pr.title.toLowerCase().includes(q) ||
                `#${pr.number}`.includes(q) ||
                pr.branch.toLowerCase().includes(q),
        );
    },

    selectedPR: () => {
        const { prs, selectedPRNumber } = get();
        if (selectedPRNumber === null) {return undefined;}
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
            if (a.isResolved !== b.isResolved) {return a.isResolved ? 1 : -1;}
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
        if (!activeThreadId) {return null;}
        const threads = get().reviewThreads();
        return threads.find((t) => t.threadId === activeThreadId) ?? null;
    },
}));
