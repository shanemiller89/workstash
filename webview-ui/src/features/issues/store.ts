import { create } from 'zustand';

/** Lightweight issue data shape received from the extension */
export interface IssueData {
    number: number;
    title: string;
    state: 'open' | 'closed';
    htmlUrl: string;
    body: string;
    author: string;
    authorAvatarUrl: string;
    createdAt: string;
    updatedAt: string;
    closedAt: string | null;
    commentsCount: number;
    labels: { name: string; color: string }[];
    assignees: { login: string; avatarUrl: string }[];
    milestone: { title: string; number: number } | null;
    /** Populated in org mode: "owner/repo" slug */
    repoFullName?: string;
}

export interface IssueCommentData {
    id: number;
    body: string;
    author: string;
    authorAvatarUrl: string;
    createdAt: string;
    updatedAt: string;
    htmlUrl: string;
}

export type IssueStateFilter = 'open' | 'closed' | 'all';

interface IssueStore {
    issues: IssueData[];
    selectedIssueNumber: number | null;
    selectedIssueDetail: IssueData | null;
    comments: IssueCommentData[];
    stateFilter: IssueStateFilter;
    isLoading: boolean;
    isCommentsLoading: boolean;
    isCommentSaving: boolean;
    isRepoNotFound: boolean;
    error: string | null;
    searchQuery: string;
    /** Whether the Issues tab is showing org-wide issues (true) or repo issues (false) */
    isOrgMode: boolean;
    /** The org login used when isOrgMode is true */
    orgLogin: string | null;
    /** Optional repo filter within org mode ("owner/repo" slug or just "repo") */
    orgRepoFilter: string | null;

    // Actions
    setIssues: (issues: IssueData[]) => void;
    selectIssue: (issueNumber: number) => void;
    clearSelection: () => void;
    setIssueDetail: (issue: IssueData) => void;
    setComments: (comments: IssueCommentData[]) => void;
    addComment: (comment: IssueCommentData) => void;
    setStateFilter: (filter: IssueStateFilter) => void;
    setLoading: (loading: boolean) => void;
    setCommentsLoading: (loading: boolean) => void;
    setCommentSaving: (saving: boolean) => void;
    setRepoNotFound: (notFound: boolean) => void;
    setError: (error: string | null) => void;
    setSearchQuery: (query: string) => void;
    updateIssueState: (issueNumber: number, state: 'open' | 'closed') => void;
    setOrgMode: (enabled: boolean, orgLogin: string | null) => void;
    setOrgRepoFilter: (repo: string | null) => void;

    // Selectors
    filteredIssues: () => IssueData[];
    selectedIssue: () => IssueData | undefined;
}

export const useIssueStore = create<IssueStore>((set, get) => ({
    issues: [],
    selectedIssueNumber: null,
    selectedIssueDetail: null,
    comments: [],
    stateFilter: 'open',
    isLoading: false,
    isCommentsLoading: false,
    isCommentSaving: false,
    isRepoNotFound: false,
    error: null,
    searchQuery: '',
    isOrgMode: false,
    orgLogin: null,
    orgRepoFilter: null,

    setIssues: (issues) => {
        const { selectedIssueNumber } = get();
        const stillExists =
            selectedIssueNumber !== null && issues.some((i) => i.number === selectedIssueNumber);
        set({
            issues,
            isLoading: false,
            error: null,
            ...(stillExists
                ? {}
                : {
                      selectedIssueNumber: null,
                      selectedIssueDetail: null,
                      comments: [],
                  }),
        });
    },

    selectIssue: (issueNumber) => {
        const { selectedIssueNumber } = get();
        if (issueNumber === selectedIssueNumber) {return;}
        set({
            selectedIssueNumber: issueNumber,
            selectedIssueDetail: null,
            comments: [],
            isCommentsLoading: true,
        });
    },

    clearSelection: () =>
        set({
            selectedIssueNumber: null,
            selectedIssueDetail: null,
            comments: [],
            isCommentsLoading: false,
        }),

    setIssueDetail: (issue) => set({ selectedIssueDetail: issue }),

    setComments: (comments) => set({ comments, isCommentsLoading: false }),

    addComment: (comment) =>
        set((state) => ({
            comments: [...state.comments, comment],
            isCommentSaving: false,
        })),

    setStateFilter: (stateFilter) =>
        set({
            stateFilter,
            selectedIssueNumber: null,
            selectedIssueDetail: null,
            comments: [],
            issues: [],
            isLoading: true,
        }),

    setLoading: (loading) => set({ isLoading: loading }),
    setCommentsLoading: (loading) => set({ isCommentsLoading: loading }),
    setCommentSaving: (saving) => set({ isCommentSaving: saving }),
    setRepoNotFound: (notFound) => set({ isRepoNotFound: notFound, isLoading: false }),
    setError: (error) => set({ error, isLoading: false }),

    setSearchQuery: (searchQuery) => set({ searchQuery }),

    setOrgMode: (enabled, orgLogin) =>
        set({
            isOrgMode: enabled,
            orgLogin: enabled ? orgLogin : null,
            orgRepoFilter: null,
            // Clear issue list when switching modes — a fresh load is coming
            issues: [],
            selectedIssueNumber: null,
            selectedIssueDetail: null,
            comments: [],
            isLoading: true,
        }),

    setOrgRepoFilter: (repo) => set({ orgRepoFilter: repo }),

    updateIssueState: (issueNumber, state) => {
        set((s) => ({
            issues: s.issues.map((i) =>
                i.number === issueNumber ? { ...i, state } : i,
            ),
            selectedIssueDetail: s.selectedIssueDetail?.number === issueNumber
                ? { ...s.selectedIssueDetail, state }
                : s.selectedIssueDetail,
        }));
    },

    filteredIssues: () => {
        const { issues, searchQuery, orgRepoFilter } = get();
        let result = issues;
        // In org mode, optionally narrow to a single repo
        if (orgRepoFilter) {
            const filter = orgRepoFilter.toLowerCase();
            result = result.filter(
                (issue) =>
                    issue.repoFullName?.toLowerCase() === filter ||
                    issue.repoFullName?.toLowerCase().endsWith(`/${filter}`),
            );
        }
        const q = searchQuery.trim().toLowerCase();
        if (!q) {return result;}
        return result.filter(
            (issue) =>
                issue.title.toLowerCase().includes(q) ||
                `#${issue.number}`.includes(q) ||
                issue.labels.some((l) => l.name.toLowerCase().includes(q)),
        );
    },

    selectedIssue: () => {
        const { issues, selectedIssueNumber } = get();
        if (selectedIssueNumber === null) {return undefined;}
        return issues.find((i) => i.number === selectedIssueNumber);
    },
}));
