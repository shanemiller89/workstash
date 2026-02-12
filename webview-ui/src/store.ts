import { create } from 'zustand';

/** Types matching what the extension sends */
export interface StashFileData {
    path: string;
    status: 'M' | 'A' | 'D' | 'R' | 'C';
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
}

interface StashStore {
    stashes: StashData[];
    expandedIndices: Set<number>;
    loading: boolean;
    searchQuery: string;

    setStashes: (stashes: StashData[]) => void;
    setLoading: (loading: boolean) => void;
    setSearchQuery: (query: string) => void;
    toggleExpanded: (index: number) => void;
    filteredStashes: () => StashData[];
}

export const useStashStore = create<StashStore>((set, get) => ({
    stashes: [],
    expandedIndices: new Set(),
    loading: true,
    searchQuery: '',

    setStashes: (stashes) => set({ stashes, loading: false }),
    setLoading: (loading) => set({ loading }),
    setSearchQuery: (searchQuery) => set({ searchQuery }),

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
        if (!searchQuery.trim()) return stashes;
        const q = searchQuery.toLowerCase();
        return stashes.filter(
            (s) =>
                s.message.toLowerCase().includes(q) ||
                s.branch.toLowerCase().includes(q) ||
                s.name.toLowerCase().includes(q) ||
                s.files.some((f) => f.path.toLowerCase().includes(q))
        );
    },
}));
