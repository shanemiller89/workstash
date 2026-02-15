import React, { useCallback } from 'react';
import { useDriveStore } from '../driveStore';
import { postMessage } from '../vscode';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { ScrollArea } from './ui/scroll-area';
import {
    Folder,
    File,
    FileText,
    FileSpreadsheet,
    Image,
    Film,
    FileCode,
    FileArchive,
    ExternalLink,
    Download,
    Star,
    StarOff,
    Pin,
    PinOff,
    X,
    Users,
    Calendar,
    HardDrive as HardDriveIcon,
} from 'lucide-react';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

function FileIcon({ mimeType, size = 32 }: { mimeType: string; size?: number }) {
    if (mimeType === FOLDER_MIME) {return <Folder size={size} className="text-yellow-500" />;}
    if (mimeType.startsWith('image/')) {return <Image size={size} className="text-purple-400" />;}
    if (mimeType.startsWith('video/') || mimeType.startsWith('audio/')) {return <Film size={size} className="text-pink-400" />;}
    if (mimeType.includes('pdf')) {return <FileText size={size} className="text-red-400" />;}
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) {return <FileSpreadsheet size={size} className="text-green-400" />;}
    if (mimeType.includes('document') || mimeType.includes('word')) {return <FileText size={size} className="text-blue-400" />;}
    if (mimeType.startsWith('text/') || mimeType.includes('json')) {return <FileCode size={size} className="text-cyan-400" />;}
    if (mimeType.includes('zip') || mimeType.includes('archive')) {return <FileArchive size={size} className="text-gray-400" />;}
    return <File size={size} className="text-fg/50" />;
}

function formatFileSize(bytes?: string): string {
    if (!bytes) {return '—';}
    const b = parseInt(bytes, 10);
    if (isNaN(b)) {return '—';}
    if (b < 1024) {return `${b} B`;}
    if (b < 1024 * 1024) {return `${(b / 1024).toFixed(1)} KB`;}
    if (b < 1024 * 1024 * 1024) {return `${(b / (1024 * 1024)).toFixed(1)} MB`;}
    return `${(b / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatFullDate(isoStr?: string): string {
    if (!isoStr) {return '—';}
    return new Date(isoStr).toLocaleString();
}

function getFriendlyMimeType(mimeType: string): string {
    if (mimeType === FOLDER_MIME) {return 'Folder';}
    if (mimeType.includes('google-apps.document')) {return 'Google Doc';}
    if (mimeType.includes('google-apps.spreadsheet')) {return 'Google Sheet';}
    if (mimeType.includes('google-apps.presentation')) {return 'Google Slides';}
    if (mimeType.includes('google-apps.drawing')) {return 'Google Drawing';}
    if (mimeType.includes('google-apps.form')) {return 'Google Form';}
    if (mimeType.includes('pdf')) {return 'PDF';}
    if (mimeType.startsWith('image/')) {return 'Image';}
    if (mimeType.startsWith('video/')) {return 'Video';}
    if (mimeType.startsWith('audio/')) {return 'Audio';}
    if (mimeType.startsWith('text/')) {return 'Text';}
    if (mimeType.includes('json')) {return 'JSON';}
    if (mimeType.includes('zip')) {return 'Archive';}
    const parts = mimeType.split('/');
    return parts[parts.length - 1] ?? mimeType;
}

export const DriveFileDetail: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const file = useDriveStore((s) => s.selectedFile);
    const pinnedDocs = useDriveStore((s) => s.pinnedDocs);

    const isPinned = file ? pinnedDocs.some((d) => d.fileId === file.id) : false;
    const isFolder = file?.mimeType === FOLDER_MIME;

    const handleOpenInBrowser = useCallback(() => {
        if (file) {
            postMessage('drive.openInBrowser', { fileId: file.id });
        }
    }, [file]);

    const handleDownload = useCallback(() => {
        if (file) {
            postMessage('drive.download', { fileId: file.id });
        }
    }, [file]);

    const handleToggleStar = useCallback(() => {
        if (file) {
            postMessage('drive.toggleStar', { fileId: file.id, starred: !file.starred });
        }
    }, [file]);

    const handleTogglePin = useCallback(() => {
        if (!file) {return;}
        if (isPinned) {
            postMessage('drive.unpinDoc', { fileId: file.id });
        } else {
            postMessage('drive.pinDoc', {
                fileId: file.id,
                name: file.name,
                mimeType: file.mimeType,
                webViewLink: file.webViewLink,
            });
        }
    }, [file, isPinned]);

    if (!file) {
        return (
            <div className="h-full flex items-center justify-center text-fg/30 text-xs">
                Select a file to view details
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-bg text-fg text-[13px]">
            {/* Header */}
            <div className="flex-shrink-0 p-3 pb-2">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3 min-w-0">
                        <FileIcon mimeType={file.mimeType} size={28} />
                        <div className="min-w-0">
                            <h3 className="font-semibold text-sm leading-tight truncate">{file.name}</h3>
                            <p className="text-xs text-fg/50 mt-0.5">{getFriendlyMimeType(file.mimeType)}</p>
                        </div>
                    </div>
                    <Button variant="ghost" size="icon-xs" onClick={onClose}>
                        <X size={14} />
                    </Button>
                </div>
            </div>

            {/* Actions */}
            <div className="flex-shrink-0 px-3 pb-2 flex flex-wrap gap-1.5">
                {file.webViewLink && (
                    <Button
                        variant="default"
                        size="sm"
                        className="text-xs h-7 gap-1.5"
                        onClick={handleOpenInBrowser}
                    >
                        <ExternalLink size={12} />
                        Open
                    </Button>
                )}
                {!isFolder && (
                    <Button
                        variant="secondary"
                        size="sm"
                        className="text-xs h-7 gap-1.5"
                        onClick={handleDownload}
                    >
                        <Download size={12} />
                        Download
                    </Button>
                )}
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7 gap-1.5"
                    onClick={handleToggleStar}
                >
                    {file.starred ? (
                        <>
                            <StarOff size={12} />
                            Unstar
                        </>
                    ) : (
                        <>
                            <Star size={12} />
                            Star
                        </>
                    )}
                </Button>
                {!isFolder && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7 gap-1.5"
                        onClick={handleTogglePin}
                    >
                        {isPinned ? (
                            <>
                                <PinOff size={12} />
                                Unpin
                            </>
                        ) : (
                            <>
                                <Pin size={12} />
                                Pin
                            </>
                        )}
                    </Button>
                )}
            </div>

            <Separator />

            {/* Details */}
            <ScrollArea className="flex-1 overflow-y-auto">
                <div className="p-3 space-y-3">
                    {/* Thumbnail/Preview */}
                    {file.thumbnailLink && (
                        <div className="rounded-md overflow-hidden border border-border bg-card">
                            <img
                                src={file.thumbnailLink}
                                alt={file.name}
                                className="w-full h-auto max-h-48 object-contain"
                                loading="lazy"
                            />
                        </div>
                    )}

                    {/* Metadata */}
                    <div className="space-y-2 text-xs">
                        {!isFolder && file.size && (
                            <MetadataRow
                                icon={<HardDriveIcon size={12} />}
                                label="Size"
                                value={formatFileSize(file.size)}
                            />
                        )}
                        <MetadataRow
                            icon={<Calendar size={12} />}
                            label="Modified"
                            value={formatFullDate(file.modifiedTime)}
                        />
                        <MetadataRow
                            icon={<Calendar size={12} />}
                            label="Created"
                            value={formatFullDate(file.createdTime)}
                        />
                        {file.owners && file.owners.length > 0 && (
                            <MetadataRow
                                icon={<Users size={12} />}
                                label="Owner"
                                value={file.owners.map((o) => o.displayName || o.emailAddress).join(', ')}
                            />
                        )}
                    </div>

                    {/* Badges */}
                    <div className="flex flex-wrap gap-1">
                        {file.shared && <Badge variant="outline">Shared</Badge>}
                        {file.starred && (
                            <Badge variant="outline" className="gap-1">
                                <Star size={10} className="fill-yellow-500 text-yellow-500" />
                                Starred
                            </Badge>
                        )}
                        {isPinned && (
                            <Badge variant="outline" className="gap-1">
                                <Pin size={10} />
                                Pinned
                            </Badge>
                        )}
                        {file.capabilities?.canEdit && (
                            <Badge variant="success">Can edit</Badge>
                        )}
                        {file.capabilities?.canDownload === false && (
                            <Badge variant="warning">No download</Badge>
                        )}
                    </div>
                </div>
            </ScrollArea>
        </div>
    );
};

const MetadataRow: React.FC<{
    icon: React.ReactNode;
    label: string;
    value: string;
}> = ({ icon, label, value }) => (
    <div className="flex items-center gap-2">
        <span className="text-fg/40">{icon}</span>
        <span className="text-fg/50 w-16 flex-shrink-0">{label}</span>
        <span className="text-fg/80 truncate">{value}</span>
    </div>
);
