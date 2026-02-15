import React, { useCallback, useState, useRef, useEffect } from 'react';
import { useDriveStore, type DriveFileData, type DriveViewMode } from '../driveStore';
import { postMessage } from '../vscode';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Skeleton } from './ui/skeleton';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import {
    Folder,
    File,
    FileText,
    FileSpreadsheet,
    Presentation,
    Image,
    Film,
    FileCode,
    FileArchive,
    Search,
    ChevronRight,
    Home,
    Star,
    Clock,
    HardDrive,
    Pin,
    Upload,
    ArrowLeft,
    RefreshCw,
    MoreHorizontal,
    ExternalLink,
    Download,
    StarOff,
} from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from './ui/tooltip';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

// ─── File icon helper ─────────────────────────────────────────────

function FileIcon({ mimeType, size = 16 }: { mimeType: string; size?: number }) {
    if (mimeType === FOLDER_MIME) {return <Folder size={size} className="text-yellow-500" />;}
    if (mimeType.startsWith('image/')) {return <Image size={size} className="text-purple-400" />;}
    if (mimeType.startsWith('video/') || mimeType.startsWith('audio/')) {return <Film size={size} className="text-pink-400" />;}
    if (mimeType.includes('pdf')) {return <FileText size={size} className="text-red-400" />;}
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) {return <FileSpreadsheet size={size} className="text-green-400" />;}
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) {return <Presentation size={size} className="text-orange-400" />;}
    if (mimeType.includes('document') || mimeType.includes('word')) {return <FileText size={size} className="text-blue-400" />;}
    if (mimeType.startsWith('text/') || mimeType.includes('json') || mimeType.includes('javascript')) {return <FileCode size={size} className="text-cyan-400" />;}
    if (mimeType.includes('zip') || mimeType.includes('archive')) {return <FileArchive size={size} className="text-gray-400" />;}
    return <File size={size} className="text-fg/50" />;
}

// ─── Format helpers ───────────────────────────────────────────────

function formatFileSize(bytes?: string): string {
    if (!bytes) {return '';}
    const b = parseInt(bytes, 10);
    if (isNaN(b)) {return '';}
    if (b < 1024) {return `${b} B`;}
    if (b < 1024 * 1024) {return `${(b / 1024).toFixed(1)} KB`;}
    if (b < 1024 * 1024 * 1024) {return `${(b / (1024 * 1024)).toFixed(1)} MB`;}
    return `${(b / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(isoStr: string): string {
    const d = new Date(isoStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) {return 'just now';}
    if (mins < 60) {return `${mins}m ago`;}
    const hours = Math.floor(mins / 60);
    if (hours < 24) {return `${hours}h ago`;}
    const days = Math.floor(hours / 24);
    if (days < 7) {return `${days}d ago`;}
    return d.toLocaleDateString();
}

// ─── View mode tabs ───────────────────────────────────────────────

const viewModes: { key: DriveViewMode; label: string; Icon: React.FC<{ size?: number }> }[] = [
    { key: 'browser', label: 'My Drive', Icon: Home },
    { key: 'starred', label: 'Starred', Icon: Star },
    { key: 'recent', label: 'Recent', Icon: Clock },
    { key: 'shared', label: 'Shared', Icon: HardDrive },
    { key: 'pinned', label: 'Pinned', Icon: Pin },
];

// ─── Main Component ───────────────────────────────────────────────

export const DriveFileList: React.FC = () => {
    const viewMode = useDriveStore((s) => s.viewMode);
    const setViewMode = useDriveStore((s) => s.setViewMode);
    const files = useDriveStore((s) => s.files);
    const isLoading = useDriveStore((s) => s.isLoading);
    const breadcrumbs = useDriveStore((s) => s.breadcrumbs);
    const navigateToFolder = useDriveStore((s) => s.navigateToFolder);
    const navigateBack = useDriveStore((s) => s.navigateBack);
    const navigateToRoot = useDriveStore((s) => s.navigateToRoot);
    const currentFolderId = useDriveStore((s) => s.currentFolderId);
    const searchQuery = useDriveStore((s) => s.searchQuery);
    const setSearchQuery = useDriveStore((s) => s.setSearchQuery);
    const searchResults = useDriveStore((s) => s.searchResults);
    const isSearching = useDriveStore((s) => s.isSearching);
    const starredFiles = useDriveStore((s) => s.starredFiles);
    const recentFiles = useDriveStore((s) => s.recentFiles);
    const sharedDrives = useDriveStore((s) => s.sharedDrives);
    const selectedSharedDriveId = useDriveStore((s) => s.selectedSharedDriveId);
    const sharedDriveFiles = useDriveStore((s) => s.sharedDriveFiles);
    const selectSharedDrive = useDriveStore((s) => s.selectSharedDrive);
    const pinnedDocs = useDriveStore((s) => s.pinnedDocs);
    const selectFile = useDriveStore((s) => s.selectFile);
    const isUploading = useDriveStore((s) => s.isUploading);
    const uploadProgress = useDriveStore((s) => s.uploadProgress);
    const accountEmail = useDriveStore((s) => s.accountEmail);

    const [showSearch, setShowSearch] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    // Focus search on show
    useEffect(() => {
        if (showSearch && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [showSearch]);

    const handleViewModeChange = useCallback(
        (mode: DriveViewMode) => {
            setViewMode(mode);
            if (mode === 'browser') {
                postMessage('drive.listFiles', { folderId: currentFolderId() });
            } else if (mode === 'starred') {
                postMessage('drive.getStarred');
            } else if (mode === 'recent') {
                postMessage('drive.getRecent');
            } else if (mode === 'shared') {
                postMessage('drive.getSharedDrives');
            } else if (mode === 'pinned') {
                postMessage('drive.getPinnedDocs');
            }
        },
        [setViewMode, currentFolderId],
    );

    const handleFolderClick = useCallback(
        (file: DriveFileData) => {
            navigateToFolder(file.id, file.name);
            postMessage('drive.listFiles', { folderId: file.id });
        },
        [navigateToFolder],
    );

    const handleFileClick = useCallback(
        (file: DriveFileData) => {
            selectFile(file);
        },
        [selectFile],
    );

    const handleSearchChange = useCallback(
        (value: string) => {
            setSearchQuery(value);
            if (searchDebounceRef.current) {
                clearTimeout(searchDebounceRef.current);
            }
            if (value.trim().length >= 2) {
                searchDebounceRef.current = setTimeout(() => {
                    postMessage('drive.search', { query: value.trim() });
                }, 400);
            }
        },
        [setSearchQuery],
    );

    const handleUpload = useCallback(() => {
        postMessage('drive.upload', { folderId: currentFolderId() });
    }, [currentFolderId]);

    const handleRefresh = useCallback(() => {
        if (viewMode === 'browser') {
            postMessage('drive.listFiles', { folderId: currentFolderId() });
        } else if (viewMode === 'starred') {
            postMessage('drive.getStarred');
        } else if (viewMode === 'recent') {
            postMessage('drive.getRecent');
        } else if (viewMode === 'shared') {
            postMessage('drive.getSharedDrives');
        } else if (viewMode === 'pinned') {
            postMessage('drive.getPinnedDocs');
        }
    }, [viewMode, currentFolderId]);

    const handleBreadcrumbClick = useCallback(
        (index: number) => {
            const target = breadcrumbs[index];
            if (!target) {return;}
            // Navigate to that breadcrumb by slicing and re-requesting
            const newCrumbs = breadcrumbs.slice(0, index + 1);
            useDriveStore.setState({
                breadcrumbs: newCrumbs,
                files: [],
                isLoading: true,
                selectedFile: null,
            });
            postMessage('drive.listFiles', { folderId: target.id });
        },
        [breadcrumbs],
    );

    // Determine which files to show based on view mode
    const displayFiles =
        showSearch && searchQuery.trim()
            ? searchResults
            : viewMode === 'browser'
              ? files
              : viewMode === 'starred'
                ? starredFiles
                : viewMode === 'recent'
                  ? recentFiles
                  : viewMode === 'shared'
                    ? sharedDriveFiles
                    : [];

    const showingLoading = isLoading || isSearching;

    return (
        <div className="h-full flex flex-col bg-bg text-fg text-[13px]">
            {/* Header */}
            <div className="flex-shrink-0 p-2 space-y-2">
                {/* Account + Actions */}
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs text-fg/50 truncate">{accountEmail}</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger
                                    render={
                                        <Button
                                            variant="ghost"
                                            size="icon-xs"
                                            onClick={() => setShowSearch(!showSearch)}
                                        />
                                    }
                                >
                                    <Search size={14} />
                                </TooltipTrigger>
                                <TooltipContent>Search files</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger
                                    render={
                                        <Button
                                            variant="ghost"
                                            size="icon-xs"
                                            onClick={handleUpload}
                                            disabled={isUploading}
                                        />
                                    }
                                >
                                    <Upload size={14} />
                                </TooltipTrigger>
                                <TooltipContent>Upload file</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger
                                    render={
                                        <Button
                                            variant="ghost"
                                            size="icon-xs"
                                            onClick={handleRefresh}
                                        />
                                    }
                                >
                                    <RefreshCw size={14} />
                                </TooltipTrigger>
                                <TooltipContent>Refresh</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                </div>

                {/* Search bar */}
                {showSearch && (
                    <Input
                        ref={searchInputRef}
                        placeholder="Search Google Drive..."
                        value={searchQuery}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        className="h-7 text-xs"
                    />
                )}

                {/* Upload progress */}
                {isUploading && (
                    <div className="text-xs text-fg/60 flex items-center gap-2">
                        <RefreshCw size={12} className="animate-spin" />
                        {uploadProgress ?? 'Uploading…'}
                    </div>
                )}

                {/* View mode tabs */}
                <div className="flex gap-1 overflow-x-auto">
                    {viewModes.map(({ key, label, Icon }) => (
                        <Button
                            key={key}
                            variant={viewMode === key && !showSearch ? 'secondary' : 'ghost'}
                            size="sm"
                            className="text-[11px] h-6 px-2 gap-1 flex-shrink-0"
                            onClick={() => {
                                setShowSearch(false);
                                setSearchQuery('');
                                handleViewModeChange(key);
                            }}
                        >
                            <Icon size={12} />
                            {label}
                        </Button>
                    ))}
                </div>

                {/* Breadcrumbs (browser mode only) */}
                {viewMode === 'browser' && !showSearch && breadcrumbs.length > 1 && (
                    <div className="flex items-center gap-0.5 text-xs text-fg/60 overflow-x-auto">
                        {breadcrumbs.map((crumb, i) => (
                            <React.Fragment key={crumb.id}>
                                {i > 0 && <ChevronRight size={10} className="flex-shrink-0" />}
                                <button
                                    className={`hover:text-fg px-1 py-0.5 rounded whitespace-nowrap ${
                                        i === breadcrumbs.length - 1 ? 'text-fg font-medium' : ''
                                    }`}
                                    onClick={() => handleBreadcrumbClick(i)}
                                >
                                    {i === 0 ? <Home size={12} /> : crumb.name}
                                </button>
                            </React.Fragment>
                        ))}
                    </div>
                )}

                {/* Back button for nested folders */}
                {viewMode === 'browser' && !showSearch && breadcrumbs.length > 1 && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-[11px] h-6 px-2 gap-1"
                        onClick={() => {
                            navigateBack();
                            const parent = breadcrumbs[breadcrumbs.length - 2];
                            if (parent) {
                                postMessage('drive.listFiles', { folderId: parent.id });
                            }
                        }}
                    >
                        <ArrowLeft size={12} />
                        Back
                    </Button>
                )}
            </div>

            <Separator />

            {/* Pinned docs view */}
            {viewMode === 'pinned' && !showSearch && (
                <ScrollArea className="flex-1 overflow-y-auto">
                    <div className="p-1">
                        {pinnedDocs.length === 0 ? (
                            <div className="text-center text-fg/40 text-xs py-8">
                                <Pin size={24} className="mx-auto mb-2 opacity-50" />
                                <p>No pinned docs yet.</p>
                                <p className="mt-1">Pin files from the file browser to quick-access them here.</p>
                            </div>
                        ) : (
                            pinnedDocs.map((doc) => (
                                <button
                                    key={doc.fileId}
                                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-card text-left group"
                                    onClick={() =>
                                        selectFile({
                                            id: doc.fileId,
                                            name: doc.name,
                                            mimeType: doc.mimeType,
                                            webViewLink: doc.webViewLink,
                                            shared: false,
                                            starred: false,
                                            modifiedTime: '',
                                            createdTime: '',
                                        })
                                    }
                                >
                                    <FileIcon mimeType={doc.mimeType} size={14} />
                                    <span className="truncate flex-1">{doc.name}</span>
                                    <Button
                                        variant="ghost"
                                        size="icon-xs"
                                        className="opacity-0 group-hover:opacity-100"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            postMessage('drive.unpinDoc', { fileId: doc.fileId });
                                        }}
                                    >
                                        <Pin size={12} />
                                    </Button>
                                </button>
                            ))
                        )}
                    </div>
                </ScrollArea>
            )}

            {/* Shared drives list */}
            {viewMode === 'shared' && !selectedSharedDriveId && !showSearch && (
                <ScrollArea className="flex-1 overflow-y-auto">
                    <div className="p-1">
                        {showingLoading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="flex items-center gap-2 px-2 py-1.5">
                                    <Skeleton className="w-4 h-4 rounded" />
                                    <Skeleton className="h-3 flex-1 rounded" />
                                </div>
                            ))
                        ) : sharedDrives.length === 0 ? (
                            <div className="text-center text-fg/40 text-xs py-8">
                                <HardDrive size={24} className="mx-auto mb-2 opacity-50" />
                                <p>No shared drives found.</p>
                            </div>
                        ) : (
                            sharedDrives.map((drive) => (
                                <button
                                    key={drive.id}
                                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-card text-left"
                                    onClick={() => {
                                        selectSharedDrive(drive.id);
                                        postMessage('drive.listSharedDriveFiles', { driveId: drive.id });
                                    }}
                                >
                                    <HardDrive size={14} className="text-blue-400" />
                                    <span className="truncate flex-1">{drive.name}</span>
                                </button>
                            ))
                        )}
                    </div>
                </ScrollArea>
            )}

            {/* Shared drive back button */}
            {viewMode === 'shared' && selectedSharedDriveId && !showSearch && (
                <div className="flex-shrink-0 px-2 py-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-[11px] h-6 px-2 gap-1"
                        onClick={() => selectSharedDrive(null)}
                    >
                        <ArrowLeft size={12} />
                        All shared drives
                    </Button>
                </div>
            )}

            {/* File list */}
            {(viewMode !== 'pinned' && (viewMode !== 'shared' || selectedSharedDriveId)) && (
                <ScrollArea className="flex-1 overflow-y-auto">
                    <div className="p-1">
                        {showingLoading ? (
                            Array.from({ length: 8 }).map((_, i) => (
                                <div key={i} className="flex items-center gap-2 px-2 py-1.5">
                                    <Skeleton className="w-4 h-4 rounded" />
                                    <Skeleton className="h-3 flex-1 rounded" />
                                    <Skeleton className="h-3 w-12 rounded" />
                                </div>
                            ))
                        ) : displayFiles.length === 0 ? (
                            <div className="text-center text-fg/40 text-xs py-8">
                                {showSearch && searchQuery.trim() ? (
                                    <>
                                        <Search size={24} className="mx-auto mb-2 opacity-50" />
                                        <p>No results for &quot;{searchQuery}&quot;</p>
                                    </>
                                ) : (
                                    <>
                                        <Folder size={24} className="mx-auto mb-2 opacity-50" />
                                        <p>This folder is empty.</p>
                                    </>
                                )}
                            </div>
                        ) : (
                            displayFiles.map((file) => (
                                <FileRow
                                    key={file.id}
                                    file={file}
                                    onFolderClick={handleFolderClick}
                                    onFileClick={handleFileClick}
                                />
                            ))
                        )}
                    </div>
                </ScrollArea>
            )}
        </div>
    );
};

// ─── File Row ─────────────────────────────────────────────────────

const FileRow: React.FC<{
    file: DriveFileData;
    onFolderClick: (file: DriveFileData) => void;
    onFileClick: (file: DriveFileData) => void;
}> = ({ file, onFolderClick, onFileClick }) => {
    const isFolder = file.mimeType === FOLDER_MIME;

    return (
        <button
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-card text-left group"
            onClick={() => (isFolder ? onFolderClick(file) : onFileClick(file))}
        >
            <FileIcon mimeType={file.mimeType} size={14} />
            <span className="truncate flex-1 min-w-0">{file.name}</span>
            <div className="flex items-center gap-1 flex-shrink-0">
                {file.shared && (
                    <Badge variant="outline" className="text-[10px] h-4 px-1">
                        Shared
                    </Badge>
                )}
                {file.starred && <Star size={10} className="text-yellow-500 fill-yellow-500" />}
                {!isFolder && file.size && (
                    <span className="text-[10px] text-fg/40 w-14 text-right">
                        {formatFileSize(file.size)}
                    </span>
                )}
                <span className="text-[10px] text-fg/30 w-14 text-right">
                    {file.modifiedTime ? formatDate(file.modifiedTime) : ''}
                </span>
                {/* Context menu */}
                <DropdownMenu>
                    <DropdownMenuTrigger>
                        <Button
                            variant="ghost"
                            size="icon-xs"
                            className="opacity-0 group-hover:opacity-100 h-5 w-5"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <MoreHorizontal size={12} />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                        {file.webViewLink && (
                            <DropdownMenuItem
                                onSelect={() =>
                                    postMessage('drive.openInBrowser', { fileId: file.id })
                                }
                            >
                                <ExternalLink size={14} />
                                Open in browser
                            </DropdownMenuItem>
                        )}
                        {!isFolder && (
                            <DropdownMenuItem
                                onSelect={() =>
                                    postMessage('drive.download', { fileId: file.id })
                                }
                            >
                                <Download size={14} />
                                Download
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                            onSelect={() =>
                                postMessage('drive.toggleStar', {
                                    fileId: file.id,
                                    starred: !file.starred,
                                })
                            }
                        >
                            {file.starred ? <StarOff size={14} /> : <Star size={14} />}
                            {file.starred ? 'Remove star' : 'Add star'}
                        </DropdownMenuItem>
                        {!isFolder && (
                            <DropdownMenuItem
                                onSelect={() =>
                                    postMessage('drive.pinDoc', {
                                        fileId: file.id,
                                        name: file.name,
                                        mimeType: file.mimeType,
                                        webViewLink: file.webViewLink,
                                    })
                                }
                            >
                                <Pin size={14} />
                                Pin to workspace
                            </DropdownMenuItem>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </button>
    );
};
