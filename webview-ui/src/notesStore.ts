import { create } from 'zustand';

/** Lightweight note data shape received from the extension */
export interface GistNoteData {
    id: string;
    title: string;
    content: string;
    isPublic: boolean;
    createdAt: string;
    updatedAt: string;
    htmlUrl: string;
    linkedRepo: string | null;
    hasSpfMarker: boolean;
}

export type NotesFilterMode = 'all' | 'workspace';

interface NotesStore {
    notes: GistNoteData[];
    selectedNoteId: string | null;
    editingContent: string;
    editingTitle: string;
    isLoading: boolean;
    isSaving: boolean;
    isDirty: boolean;
    isAuthenticated: boolean;
    authUsername: string | null;
    searchQuery: string;
    previewMode: boolean;
    filterMode: NotesFilterMode;
    currentRepo: string | null;
    error: string | null;

    // Actions
    setNotes: (notes: GistNoteData[]) => void;
    setError: (error: string | null) => void;
    selectNote: (id: string) => void;
    clearSelection: () => void;
    setEditingContent: (content: string) => void;
    setEditingTitle: (title: string) => void;
    setLoading: (loading: boolean) => void;
    setSaving: (saving: boolean) => void;
    setDirty: (dirty: boolean) => void;
    setAuthenticated: (auth: boolean, username?: string | null) => void;
    setSearchQuery: (query: string) => void;
    setPreviewMode: (preview: boolean) => void;
    setFilterMode: (mode: NotesFilterMode) => void;
    setCurrentRepo: (repo: string | null) => void;
    /** Atomically set editor content/title without marking dirty (used when loading from extension) */
    loadNoteContent: (content: string, title?: string) => void;
    filteredNotes: () => GistNoteData[];
    selectedNote: () => GistNoteData | undefined;
    updateNoteInList: (noteId: string, updates: Partial<GistNoteData>) => void;
    removeNoteFromList: (noteId: string) => void;
    addNoteToList: (note: GistNoteData) => void;
}

export const useNotesStore = create<NotesStore>((set, get) => ({
    notes: [],
    selectedNoteId: null,
    editingContent: '',
    editingTitle: '',
    isLoading: false,
    isSaving: false,
    isDirty: false,
    isAuthenticated: false,
    authUsername: null,
    searchQuery: '',
    previewMode: true,
    filterMode: 'all',
    currentRepo: null,
    error: null,

    setNotes: (notes) => {
        const { selectedNoteId } = get();
        const stillExists = selectedNoteId !== null && notes.some((n) => n.id === selectedNoteId);
        set({
            notes,
            isLoading: false,
            error: null,
            ...(stillExists
                ? {}
                : {
                      selectedNoteId: null,
                      editingContent: '',
                      editingTitle: '',
                      isDirty: false,
                  }),
        });
    },

    setError: (error) => set({ error, isLoading: false }),

    selectNote: (id) => {
        const { notes, selectedNoteId, isDirty } = get();
        if (id === selectedNoteId) return;
        // If dirty, the caller should handle the save prompt
        const note = notes.find((n) => n.id === id);
        if (!note) return;
        set({
            selectedNoteId: id,
            editingContent: note.content,
            editingTitle: note.title,
            isDirty: false,
            previewMode: true,
        });
    },

    clearSelection: () =>
        set({
            selectedNoteId: null,
            editingContent: '',
            editingTitle: '',
            isDirty: false,
            previewMode: true,
        }),

    setEditingContent: (content) => set({ editingContent: content, isDirty: true }),
    setEditingTitle: (title) => set({ editingTitle: title, isDirty: true }),
    setLoading: (isLoading) => set({ isLoading }),
    setSaving: (isSaving) => set({ isSaving }),
    setDirty: (isDirty) => set({ isDirty }),
    setAuthenticated: (auth, username) =>
        set({ isAuthenticated: auth, authUsername: username ?? null }),
    setSearchQuery: (searchQuery) => set({ searchQuery }),
    setPreviewMode: (previewMode) => set({ previewMode }),
    setFilterMode: (filterMode) => set({ filterMode }),
    setCurrentRepo: (currentRepo) => set({ currentRepo }),

    loadNoteContent: (content, title) =>
        set({
            editingContent: content,
            ...(title !== undefined ? { editingTitle: title } : {}),
            isLoading: false,
            isDirty: false,
        }),

    filteredNotes: () => {
        const { notes, searchQuery, filterMode, currentRepo } = get();
        let filtered = notes;

        // Apply workspace filter
        if (filterMode === 'workspace' && currentRepo) {
            filtered = filtered.filter((n) => n.linkedRepo === currentRepo);
        }

        // Apply search filter
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(
                (n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q),
            );
        }

        return filtered;
    },

    selectedNote: () => {
        const { notes, selectedNoteId } = get();
        if (!selectedNoteId) return undefined;
        return notes.find((n) => n.id === selectedNoteId);
    },

    updateNoteInList: (noteId, updates) =>
        set((state) => ({
            notes: state.notes.map((n) => (n.id === noteId ? { ...n, ...updates } : n)),
        })),

    removeNoteFromList: (noteId) =>
        set((state) => {
            const cleared = state.selectedNoteId === noteId;
            return {
                notes: state.notes.filter((n) => n.id !== noteId),
                ...(cleared
                    ? {
                          selectedNoteId: null,
                          editingContent: '',
                          editingTitle: '',
                          isDirty: false,
                      }
                    : {}),
            };
        }),

    addNoteToList: (note) =>
        set((state) => ({
            notes: [note, ...state.notes],
        })),
}));
