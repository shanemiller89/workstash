import { create } from 'zustand';

/** App-level UI state shared across tabs */
type TabKey = 'stashes' | 'notes' | 'prs' | 'issues' | 'projects' | 'mattermost' | 'drive' | 'agent' | 'settings';

export interface RepoInfo {
    owner: string;
    repo: string;
}

export interface AvailableRepo extends RepoInfo {
    remote: string;
}

/** A group of repos belonging to a single GitHub owner (user or org) */
export interface RepoGroup {
    owner: string;
    avatarUrl: string;
    repos: { name: string; fullName: string; isPrivate: boolean }[];
}

interface AppStore {
    activeTab: TabKey;
    setActiveTab: (tab: TabKey) => void;
    /** Deep-link: note ID to open when switching to notes tab */
    pendingNoteId: string | null;
    setPendingNoteId: (id: string | null) => void;
    /** Deep-link: PR number to open when switching to prs tab */
    pendingPRNumber: number | null;
    setPendingPRNumber: (num: number | null) => void;
    /** Deep-link: Issue number to open when switching to issues tab */
    pendingIssueNumber: number | null;
    setPendingIssueNumber: (num: number | null) => void;
    /** Deep-link: Mattermost channel to open when switching to mattermost tab */
    pendingChannelId: string | null;
    pendingChannelName: string | null;
    setPendingChannel: (id: string | null, name: string | null) => void;
    /** Deep-link: Project item ID to open when switching to projects tab */
    pendingProjectItemId: string | null;
    setPendingProjectItemId: (id: string | null) => void;

    // ─── Repo switcher ───
    /** Currently active repo (auto-detected or user-overridden) */
    currentRepo: RepoInfo | null;
    /** All GitHub repos discovered from git remotes */
    availableRepos: AvailableRepo[];
    setRepoContext: (current: RepoInfo | null, repos: AvailableRepo[]) => void;
    /** Pre-fetched repos grouped by owner (user + orgs) */
    repoGroups: RepoGroup[];
    repoGroupsLoading: boolean;
    setRepoGroups: (groups: RepoGroup[]) => void;
    setRepoGroupsLoading: (loading: boolean) => void;
}

export const useAppStore = create<AppStore>((set) => ({
    activeTab: 'mattermost',
    setActiveTab: (activeTab) => set({ activeTab }),
    pendingNoteId: null,
    setPendingNoteId: (pendingNoteId) => set({ pendingNoteId }),
    pendingPRNumber: null,
    setPendingPRNumber: (pendingPRNumber) => set({ pendingPRNumber }),
    pendingIssueNumber: null,
    setPendingIssueNumber: (pendingIssueNumber) => set({ pendingIssueNumber }),
    pendingChannelId: null,
    pendingChannelName: null,
    setPendingChannel: (pendingChannelId, pendingChannelName) =>
        set({ pendingChannelId, pendingChannelName }),
    pendingProjectItemId: null,
    setPendingProjectItemId: (pendingProjectItemId) => set({ pendingProjectItemId }),
    currentRepo: null,
    availableRepos: [],
    setRepoContext: (currentRepo, availableRepos) => set({ currentRepo, availableRepos }),
    repoGroups: [],
    repoGroupsLoading: false,
    setRepoGroups: (repoGroups) => set({ repoGroups, repoGroupsLoading: false }),
    setRepoGroupsLoading: (repoGroupsLoading) => set({ repoGroupsLoading }),
}));
