import React, { useCallback } from 'react';
import { ExternalLink } from 'lucide-react';
import type { MattermostLinkPreviewData } from '../mattermostStore';
import { postMessage } from '../vscode';

interface LinkPreviewProps {
    previews?: MattermostLinkPreviewData[];
}

/** Renders OpenGraph link preview cards below a message */
export const LinkPreview: React.FC<LinkPreviewProps> = ({ previews }) => {
    if (!previews || previews.length === 0) {
        return null;
    }

    return (
        <div className="mt-1.5 flex flex-col gap-1.5">
            {previews.map((preview, i) => (
                <LinkPreviewCard key={`${preview.url}-${i}`} preview={preview} />
            ))}
        </div>
    );
};

const LinkPreviewCard: React.FC<{ preview: MattermostLinkPreviewData }> = ({ preview }) => {
    const handleClick = useCallback(() => {
        postMessage('mattermostOpenExternal', { url: preview.url });
    }, [preview.url]);

    const hasContent = preview.title || preview.description;
    if (!hasContent && !preview.imageUrl) {
        return null;
    }

    return (
        <button
            type="button"
            onClick={handleClick}
            className="block w-full max-w-md text-left border border-[var(--vscode-panel-border)] rounded-md overflow-hidden hover:bg-[var(--vscode-list-hoverBackground)] transition-colors cursor-pointer"
        >
            <div className="flex">
                {/* Text content */}
                <div className="flex-1 min-w-0 p-2.5">
                    {preview.siteName && (
                        <div className="text-[10px] text-[var(--vscode-descriptionForeground)] uppercase tracking-wider mb-0.5 truncate">
                            {preview.siteName}
                        </div>
                    )}
                    {preview.title && (
                        <div className="text-xs font-medium text-[var(--vscode-textLink-foreground)] leading-snug line-clamp-2">
                            {preview.title}
                        </div>
                    )}
                    {preview.description && (
                        <div className="text-[11px] text-[var(--vscode-descriptionForeground)] leading-relaxed mt-0.5 line-clamp-2">
                            {preview.description}
                        </div>
                    )}
                    <div className="flex items-center gap-1 mt-1 text-[10px] text-[var(--vscode-descriptionForeground)]">
                        <ExternalLink size={10} />
                        <span className="truncate">{new URL(preview.url).hostname}</span>
                    </div>
                </div>

                {/* Thumbnail */}
                {preview.imageUrl && (
                    <div className="flex-shrink-0 w-20 h-20 bg-[var(--vscode-editor-background)]">
                        <img
                            src={preview.imageUrl}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                            onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                            }}
                        />
                    </div>
                )}
            </div>
        </button>
    );
};
