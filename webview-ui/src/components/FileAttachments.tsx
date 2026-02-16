import React, { useState } from 'react';
import type { MattermostFileInfoData } from '../mattermostStore';
import { FileText, Download, X } from 'lucide-react';
import { Button } from './ui/button';

// ─── Helpers ──────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
    if (bytes < 1024) { return `${bytes} B`; }
    if (bytes < 1024 * 1024) { return `${(bytes / 1024).toFixed(1)} KB`; }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageMime(mimeType: string): boolean {
    return mimeType.startsWith('image/');
}

// ─── Image Lightbox ───────────────────────────────────────────────

const ImageLightbox: React.FC<{
    file: MattermostFileInfoData;
    onClose: () => void;
}> = ({ file, onClose }) => (
    <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
        onClick={onClose}
    >
        <div
            className="relative max-w-[90vw] max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
        >
            <Button
                variant="ghost"
                size="icon-xs"
                onClick={onClose}
                className="absolute -top-3 -right-3 rounded-full bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] z-10"
                title="Close"
            >
                <X size={14} />
            </Button>
            <img
                src={file.url}
                alt={file.name}
                className="max-w-full max-h-[85vh] rounded-md object-contain"
            />
            <div className="mt-2 text-center text-xs text-fg/50">
                {file.name} · {formatFileSize(file.size)}
            </div>
        </div>
    </div>
);

// ─── Image Thumbnail ──────────────────────────────────────────────

const ImageAttachment: React.FC<{
    file: MattermostFileInfoData;
}> = ({ file }) => {
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const [loadError, setLoadError] = useState(false);

    if (loadError) {
        // Fallback to generic file attachment if image fails to load
        return <GenericFileAttachment file={file} />;
    }

    return (
        <>
            <Button
                variant="ghost"
                onClick={() => setLightboxOpen(true)}
                className="block rounded-md overflow-clip border border-[var(--vscode-panel-border)] hover:border-[var(--vscode-focusBorder)] p-0 h-auto"
                title={`${file.name} (${formatFileSize(file.size)})`}
            >
                <img
                    src={file.url}
                    alt={file.name}
                    className="max-w-70 max-h-50 object-contain bg-black/10"
                    onError={() => setLoadError(true)}
                />
            </Button>
            {lightboxOpen && (
                <ImageLightbox file={file} onClose={() => setLightboxOpen(false)} />
            )}
        </>
    );
};

// ─── Generic File Attachment ──────────────────────────────────────

const GenericFileAttachment: React.FC<{
    file: MattermostFileInfoData;
}> = ({ file }) => (
    <a
        href={file.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-[var(--vscode-panel-border)] hover:border-[var(--vscode-focusBorder)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors text-xs max-w-70"
        title={`Download ${file.name}`}
    >
        <FileText size={16} className="shrink-0 text-fg/50" />
        <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-[var(--vscode-textLink-foreground)]">
                {file.name}
            </div>
            <div className="text-fg/40">
                {file.extension.toUpperCase()} · {formatFileSize(file.size)}
            </div>
        </div>
        <Download size={12} className="shrink-0 text-fg/40" />
    </a>
);

// ─── Main Component ───────────────────────────────────────────────

export const FileAttachments: React.FC<{
    files?: MattermostFileInfoData[];
}> = ({ files }) => {
    if (!files || files.length === 0) { return null; }

    const images = files.filter((f) => isImageMime(f.mimeType));
    const otherFiles = files.filter((f) => !isImageMime(f.mimeType));

    return (
        <div className="mt-1 flex flex-col gap-1.5">
            {/* Image grid */}
            {images.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {images.map((file) => (
                        <ImageAttachment key={file.id} file={file} />
                    ))}
                </div>
            )}

            {/* Non-image files */}
            {otherFiles.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {otherFiles.map((file) => (
                        <GenericFileAttachment key={file.id} file={file} />
                    ))}
                </div>
            )}
        </div>
    );
};
