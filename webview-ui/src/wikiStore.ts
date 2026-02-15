import { create } from 'zustand';

/** Lightweight wiki page summary received from the extension */
export interface WikiPageSummaryData {
    title: string;
    filename: string;
    sha: string;
    size: number;
}

/** Full wiki page data with content */
export interface WikiPageData {
    title: string;
    filename: string;
    content: string;
    sha: string;
}

interface WikiStore {
    /** All wiki pages (list only, no content) */
    pages: WikiPageSummaryData[];
    /** Currently selected page filename */
    selectedFilename: string | null;
    /** Full page data for the selected page (including content) */
    selectedPage: WikiPageData | null;
    /** Loading states */
    isLoading: boolean;
    isPageLoading: boolean;
    /** Error message */
    error: string | null;
    /** Whether the repo has no wiki */
    noWiki: boolean;
    /** Whether GitHub auth is required */
    authRequired: boolean;
    /** Search query for filtering pages */
    searchQuery: string;

    // ─── Actions ──────────────────────────────────────────────
    setPages: (pages: WikiPageSummaryData[]) => void;
    selectPage: (filename: string) => void;
    clearSelection: () => void;
    setSelectedPage: (page: WikiPageData) => void;
    setLoading: (loading: boolean) => void;
    setPageLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;
    setNoWiki: (noWiki: boolean) => void;
    setAuthRequired: (required: boolean) => void;
    setSearchQuery: (query: string) => void;

    // ─── Selectors ────────────────────────────────────────────
    filteredPages: () => WikiPageSummaryData[];
}

export const useWikiStore = create<WikiStore>((set, get) => ({
    pages: [],
    selectedFilename: null,
    selectedPage: null,
    isLoading: false,
    isPageLoading: false,
    error: null,
    noWiki: false,
    authRequired: false,
    searchQuery: '',

    setPages: (pages) => {
        const { selectedFilename } = get();
        const stillExists =
            selectedFilename !== null && pages.some((p) => p.filename === selectedFilename);
        set({
            pages,
            isLoading: false,
            error: null,
            noWiki: false,
            authRequired: false,
            ...(stillExists
                ? {}
                : {
                      selectedFilename: null,
                      selectedPage: null,
                  }),
        });
    },

    selectPage: (filename) => {
        const { selectedFilename } = get();
        if (filename === selectedFilename) { return; }
        set({
            selectedFilename: filename,
            selectedPage: null,
            isPageLoading: true,
        });
    },

    clearSelection: () => {
        set({
            selectedFilename: null,
            selectedPage: null,
            isPageLoading: false,
        });
    },

    setSelectedPage: (page) => {
        set({
            selectedPage: page,
            isPageLoading: false,
        });
    },

    setLoading: (loading) => set({ isLoading: loading }),

    setPageLoading: (loading) => set({ isPageLoading: loading }),

    setError: (error) => set({ error, isLoading: false, isPageLoading: false }),

    setNoWiki: (noWiki) => set({ noWiki, isLoading: false }),

    setAuthRequired: (authRequired) => set({ authRequired, isLoading: false }),

    setSearchQuery: (query) => set({ searchQuery: query }),

    filteredPages: () => {
        const { pages, searchQuery } = get();
        if (!searchQuery.trim()) { return pages; }
        const q = searchQuery.toLowerCase();
        return pages.filter((p) => p.title.toLowerCase().includes(q));
    },
}));
