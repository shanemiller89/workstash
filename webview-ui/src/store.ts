import { create } from 'zustand';

/** Types matching what the extension sends */
export interface StashFileData {
    path: string;
    status: 'M' | 'A' | 'D' | 'R' | 'C';
}

export interface StashFileNumstat {
    path: string;
    insertions: number;
    deletions: number;
}

export interface StashData {
    index: number;
    name: string;
    branch: string;
    message: string;
    date: string;
    relativeDate: string;
    stats?: {
        filesChanged: number;
        insertions: number;
        deletions: number;
    };
    files: StashFileData[];
    numstat?: StashFileNumstat[];
}

interface StashStore {
    stashes: StashData[];
    /**
     * NOTE: `Set` and `Map` are intentionally used here for O(1) lookup performance.
     * Trade-off: they are not JSON-serializable, which blocks Zustand devtools/persist
     * middleware. If devtools support is needed later, migrate to `Record<string, T>`
     * / `string[]` and adjust the `.has()` / `.get()` call sites.
     */
    expandedIndices: Set<number>;
    loading: boolean;
    searchQuery: string;
    showCreateForm: boolean;

    // Detail pane state
    selectedStashIndex: number | null;
    fileDiffs: Map<string, string>;
    fileDiffLoading: Set<string>;
    expandedDetailFiles: Set<string>;

    setStashes: (stashes: StashData[]) => void;
    setLoading: (loading: boolean) => void;
    setSearchQuery: (query: string) => void;
    toggleExpanded: (index: number) => void;
    setShowCreateForm: (show: boolean) => void;
    filteredStashes: () => StashData[];

    // Detail pane actions
    selectStash: (index: number) => void;
    clearSelection: () => void;
    setFileDiff: (key: string, diff: string) => void;
    setFileDiffLoading: (key: string, loading: boolean) => void;
    toggleDetailFile: (key: string) => void;
    selectedStash: () => StashData | undefined;
}

export const useStashStore = create<StashStore>((set, get) => ({
    stashes: [],
    expandedIndices: new Set(),
    loading: true,
    searchQuery: '',
    showCreateForm: false,

    // Detail pane state
    selectedStashIndex: null,
    fileDiffs: new Map(),
    fileDiffLoading: new Set(),
    expandedDetailFiles: new Set(),

    setStashes: (stashes) => {
        const { selectedStashIndex } = get();
        // If the selected stash no longer exists after refresh, clear selection
        const stillExists =
            selectedStashIndex !== null && stashes.some((s) => s.index === selectedStashIndex);
        set({
            stashes,
            loading: false,
            selectedStashIndex: stillExists ? selectedStashIndex : null,
            ...(stillExists
                ? {}
                : {
                      fileDiffs: new Map(),
                      fileDiffLoading: new Set(),
                      expandedDetailFiles: new Set(),
                  }),
        });
    },
    setLoading: (loading) => set({ loading }),
    setSearchQuery: (searchQuery) => set({ searchQuery }),
    setShowCreateForm: (show) => set({ showCreateForm: show }),

    toggleExpanded: (index) =>
        set((state) => {
            const next = new Set(state.expandedIndices);
            if (next.has(index)) {
                next.delete(index);
            } else {
                next.add(index);
            }
            return { expandedIndices: next };
        }),

    filteredStashes: () => {
        const { stashes, searchQuery } = get();
        if (!searchQuery.trim()) {return stashes;}
        const q = searchQuery.toLowerCase();
        return stashes.filter(
            (s) =>
                s.message.toLowerCase().includes(q) ||
                s.branch.toLowerCase().includes(q) ||
                s.name.toLowerCase().includes(q) ||
                s.files.some((f) => f.path.toLowerCase().includes(q)),
        );
    },

    // Detail pane actions
    selectStash: (index) =>
        set((state) => {
            // If already selected, keep existing detail state
            if (state.selectedStashIndex === index) {
                return {};
            }
            return {
                selectedStashIndex: index,
                fileDiffs: new Map(),
                fileDiffLoading: new Set(),
                expandedDetailFiles: new Set(),
            };
        }),

    clearSelection: () =>
        set({
            selectedStashIndex: null,
            fileDiffs: new Map(),
            fileDiffLoading: new Set(),
            expandedDetailFiles: new Set(),
        }),

    setFileDiff: (key, diff) =>
        set((state) => {
            const next = new Map(state.fileDiffs);
            next.set(key, diff);
            const nextLoading = new Set(state.fileDiffLoading);
            nextLoading.delete(key);
            return { fileDiffs: next, fileDiffLoading: nextLoading };
        }),

    setFileDiffLoading: (key, loading) =>
        set((state) => {
            const next = new Set(state.fileDiffLoading);
            if (loading) {
                next.add(key);
            } else {
                next.delete(key);
            }
            return { fileDiffLoading: next };
        }),

    toggleDetailFile: (key) =>
        set((state) => {
            const next = new Set(state.expandedDetailFiles);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return { expandedDetailFiles: next };
        }),

    selectedStash: () => {
        const { stashes, selectedStashIndex } = get();
        if (selectedStashIndex === null) {return undefined;}
        return stashes.find((s) => s.index === selectedStashIndex);
    },
}));
