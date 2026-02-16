import { create } from 'zustand';

// ─── Data types (mirrors extension-side models) ───────────────────

export interface DriveFileData {
    id: string;
    name: string;
    mimeType: string;
    size?: string;
    modifiedTime: string;
    createdTime: string;
    iconLink?: string;
    thumbnailLink?: string;
    webViewLink?: string;
    webContentLink?: string;
    parents?: string[];
    shared: boolean;
    starred: boolean;
    owners?: { displayName: string; emailAddress: string; photoLink?: string }[];
    capabilities?: {
        canDownload?: boolean;
        canEdit?: boolean;
        canDelete?: boolean;
    };
}

export interface SharedDriveData {
    id: string;
    name: string;
    colorRgb?: string;
}

export interface PinnedDocData {
    fileId: string;
    name: string;
    mimeType: string;
    webViewLink?: string;
}

export interface BreadcrumbItem {
    id: string;
    name: string;
}

export type DriveViewMode = 'browser' | 'search' | 'starred' | 'recent' | 'shared' | 'pinned';

// ─── Store ────────────────────────────────────────────────────────

interface DriveStore {
    // Auth
    isAuthenticated: boolean;
    accountEmail: string | null;
    setAuthenticated: (auth: boolean, email?: string | null) => void;

    // View mode
    viewMode: DriveViewMode;
    setViewMode: (mode: DriveViewMode) => void;

    // File browser
    files: DriveFileData[];
    isLoading: boolean;
    error: string | null;
    nextPageToken: string | null;
    breadcrumbs: BreadcrumbItem[];
    setFiles: (files: DriveFileData[], nextPageToken?: string | null) => void;
    appendFiles: (files: DriveFileData[], nextPageToken?: string | null) => void;
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;

    // Navigation
    navigateToFolder: (folderId: string, folderName: string) => void;
    navigateBack: () => void;
    navigateToRoot: () => void;
    currentFolderId: () => string;

    // Search
    searchQuery: string;
    searchResults: DriveFileData[];
    isSearching: boolean;
    setSearchQuery: (query: string) => void;
    setSearchResults: (files: DriveFileData[]) => void;
    setSearching: (searching: boolean) => void;

    // Starred
    starredFiles: DriveFileData[];
    setStarredFiles: (files: DriveFileData[]) => void;

    // Recent
    recentFiles: DriveFileData[];
    setRecentFiles: (files: DriveFileData[]) => void;

    // Shared drives
    sharedDrives: SharedDriveData[];
    selectedSharedDriveId: string | null;
    sharedDriveFiles: DriveFileData[];
    setSharedDrives: (drives: SharedDriveData[]) => void;
    selectSharedDrive: (driveId: string | null) => void;
    setSharedDriveFiles: (files: DriveFileData[]) => void;

    // Pinned workspace docs
    pinnedDocs: PinnedDocData[];
    setPinnedDocs: (docs: PinnedDocData[]) => void;

    // File detail
    selectedFile: DriveFileData | null;
    selectFile: (file: DriveFileData | null) => void;

    // Upload
    isUploading: boolean;
    uploadProgress: string | null;
    setUploading: (uploading: boolean, progress?: string | null) => void;
}

export const useDriveStore = create<DriveStore>((set, get) => ({
    // Auth
    isAuthenticated: false,
    accountEmail: null,
    setAuthenticated: (auth, email) =>
        set({ isAuthenticated: auth, accountEmail: email ?? null }),

    // View mode
    viewMode: 'browser',
    setViewMode: (viewMode) => set({ viewMode }),

    // File browser
    files: [],
    isLoading: false,
    error: null,
    nextPageToken: null,
    breadcrumbs: [{ id: 'root', name: 'My Drive' }],
    setFiles: (files, nextPageToken) =>
        set({ files, nextPageToken: nextPageToken ?? null, isLoading: false, error: null }),
    appendFiles: (newFiles, nextPageToken) =>
        set((state) => ({
            files: [...state.files, ...newFiles],
            nextPageToken: nextPageToken ?? null,
            isLoading: false,
        })),
    setLoading: (isLoading) => set({ isLoading }),
    setError: (error) => set({ error, isLoading: false }),

    // Navigation
    navigateToFolder: (folderId, folderName) =>
        set((state) => ({
            breadcrumbs: [...state.breadcrumbs, { id: folderId, name: folderName }],
            files: [],
            isLoading: true,
            nextPageToken: null,
            selectedFile: null,
        })),
    navigateBack: () =>
        set((state) => {
            if (state.breadcrumbs.length <= 1) { return state; }
            return {
                breadcrumbs: state.breadcrumbs.slice(0, -1),
                files: [],
                isLoading: true,
                nextPageToken: null,
                selectedFile: null,
            };
        }),
    navigateToRoot: () =>
        set({
            breadcrumbs: [{ id: 'root', name: 'My Drive' }],
            files: [],
            isLoading: true,
            nextPageToken: null,
            selectedFile: null,
        }),
    currentFolderId: () => {
        const { breadcrumbs } = get();
        return breadcrumbs[breadcrumbs.length - 1]?.id ?? 'root';
    },

    // Search
    searchQuery: '',
    searchResults: [],
    isSearching: false,
    setSearchQuery: (searchQuery) => set({ searchQuery }),
    setSearchResults: (searchResults) => set({ searchResults, isSearching: false }),
    setSearching: (isSearching) => set({ isSearching }),

    // Starred
    starredFiles: [],
    setStarredFiles: (starredFiles) => set({ starredFiles, isLoading: false }),

    // Recent
    recentFiles: [],
    setRecentFiles: (recentFiles) => set({ recentFiles, isLoading: false }),

    // Shared drives
    sharedDrives: [],
    selectedSharedDriveId: null,
    sharedDriveFiles: [],
    setSharedDrives: (sharedDrives) => set({ sharedDrives, isLoading: false }),
    selectSharedDrive: (selectedSharedDriveId) =>
        set({ selectedSharedDriveId, sharedDriveFiles: [], isLoading: true }),
    setSharedDriveFiles: (sharedDriveFiles) =>
        set({ sharedDriveFiles, isLoading: false }),

    // Pinned workspace docs
    pinnedDocs: [],
    setPinnedDocs: (pinnedDocs) => set({ pinnedDocs }),

    // File detail
    selectedFile: null,
    selectFile: (selectedFile) => set({ selectedFile }),

    // Upload
    isUploading: false,
    uploadProgress: null,
    setUploading: (isUploading, uploadProgress) =>
        set({ isUploading, uploadProgress: uploadProgress ?? null }),
}));
