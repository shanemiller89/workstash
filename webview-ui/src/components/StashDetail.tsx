import React, { useCallback } from 'react';
import { useStashStore, type StashData, type StashFileData } from '../store';
import { postMessage } from '../vscode';
import { DiffView } from './DiffView';
import {
    Check,
    ArrowUp,
    X,
    ChevronRight,
    GitBranch,
    Clock,
    ExternalLink,
    Archive,
} from 'lucide-react';

const statusConfig: Record<string, { label: string; color: string; fullLabel: string }> = {
    M: { label: 'M', color: 'text-modified', fullLabel: 'Modified' },
    A: { label: 'A', color: 'text-added', fullLabel: 'Added' },
    D: { label: 'D', color: 'text-deleted', fullLabel: 'Deleted' },
    R: { label: 'R', color: 'text-accent', fullLabel: 'Renamed' },
    C: { label: 'C', color: 'text-added', fullLabel: 'Copied' },
};

export const StashDetail: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const stash = useStashStore((s) => s.selectedStash());
    const fileDiffs = useStashStore((s) => s.fileDiffs);
    const fileDiffLoading = useStashStore((s) => s.fileDiffLoading);
    const expandedDetailFiles = useStashStore((s) => s.expandedDetailFiles);
    const toggleDetailFile = useStashStore((s) => s.toggleDetailFile);
    const setFileDiffLoading = useStashStore((s) => s.setFileDiffLoading);

    const handleToggleFile = useCallback(
        (file: StashFileData) => {
            if (!stash) return;
            const key = `${stash.index}:${file.path}`;
            toggleDetailFile(key);

            // Lazy-fetch the diff if not already loaded
            if (!fileDiffs.has(key) && !fileDiffLoading.has(key)) {
                setFileDiffLoading(key, true);
                postMessage('getFileDiff', { index: stash.index, filePath: file.path });
            }
        },
        [stash, fileDiffs, fileDiffLoading, toggleDetailFile, setFileDiffLoading],
    );

    const handleOpenNativeDiff = useCallback(
        (file: StashFileData) => {
            if (!stash) return;
            postMessage('showFile', { index: stash.index, filePath: file.path });
        },
        [stash],
    );

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
        },
        [onClose],
    );

    if (!stash) {
        return (
            <div className="flex items-center justify-center h-full text-[12px] opacity-40">
                <div className="text-center space-y-2">
                    <span className="block">
                        <Archive size={24} className="mx-auto opacity-60" />
                    </span>
                    <span>Select a stash to view details</span>
                </div>
            </div>
        );
    }

    const fullDate = new Date(stash.date).toLocaleString();
    const isWip = stash.message.toLowerCase().startsWith('wip');

    // Build a lookup of numstat by path
    const numstatMap = new Map((stash.numstat ?? []).map((n) => [n.path, n]));

    return (
        <div
            className="flex flex-col h-full overflow-hidden"
            onKeyDown={handleKeyDown}
            tabIndex={-1}
        >
            {/* Header */}
            <div className="px-4 py-3 border-b border-border flex-shrink-0">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <div
                                className={`w-1.5 h-5 rounded-full flex-shrink-0 ${
                                    isWip ? 'bg-warning' : 'bg-accent'
                                }`}
                            />
                            <h2 className="text-[15px] font-semibold leading-tight truncate">
                                {stash.message || '(no message)'}
                            </h2>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 ml-3.5 text-[11px] opacity-70">
                            <span className="opacity-60">{stash.name}</span>
                            <span className="inline-flex items-center gap-1 bg-badge-bg text-badge-fg px-1.5 py-0.5 rounded text-[10px] font-medium">
                                <GitBranch size={10} /> {stash.branch}
                            </span>
                            <span className="inline-flex items-center gap-0.5" title={fullDate}>
                                <Clock size={10} /> {stash.relativeDate}
                            </span>
                        </div>
                    </div>
                    <button
                        className="text-fg opacity-40 hover:opacity-100 p-1 shrink-0"
                        onClick={onClose}
                        title="Close detail pane"
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>

            {/* Stats bar */}
            {stash.stats && (
                <div className="px-4 py-2 border-b border-border flex items-center gap-4 text-[11px] flex-shrink-0">
                    <span className="opacity-60">
                        {stash.stats.filesChanged} file{stash.stats.filesChanged !== 1 ? 's' : ''}{' '}
                        changed
                    </span>
                    {stash.stats.insertions > 0 && (
                        <span className="text-added font-medium">+{stash.stats.insertions}</span>
                    )}
                    {stash.stats.deletions > 0 && (
                        <span className="text-deleted font-medium">-{stash.stats.deletions}</span>
                    )}
                </div>
            )}

            {/* Actions */}
            <div className="px-4 py-2 border-b border-border flex items-center gap-1.5 flex-shrink-0">
                <ActionButton
                    label="Apply"
                    icon={<Check size={12} />}
                    className="hover:text-success"
                    onClick={() => postMessage('apply', { index: stash.index })}
                />
                <ActionButton
                    label="Pop"
                    icon={<ArrowUp size={12} />}
                    onClick={() => postMessage('pop', { index: stash.index })}
                />
                <ActionButton
                    label="Drop"
                    icon={<X size={12} />}
                    className="hover:text-danger"
                    onClick={() => postMessage('drop', { index: stash.index })}
                />
            </div>

            {/* File list with expandable diffs */}
            <div className="flex-1 overflow-y-auto">
                <div className="px-4 py-2 text-[11px] font-semibold opacity-50 uppercase tracking-wider flex-shrink-0">
                    Changed Files
                </div>
                {stash.files.map((file) => {
                    const key = `${stash.index}:${file.path}`;
                    const isExpanded = expandedDetailFiles.has(key);
                    const isLoading = fileDiffLoading.has(key);
                    const diff = fileDiffs.get(key);
                    const cfg = statusConfig[file.status] ?? {
                        label: '?',
                        color: 'opacity-50',
                        fullLabel: 'Unknown',
                    };
                    const parts = file.path.split('/');
                    const name = parts.pop() ?? file.path;
                    const dir = parts.join('/');
                    const ns = numstatMap.get(file.path);

                    return (
                        <div key={file.path} className="border-b border-border/40">
                            {/* File header */}
                            <div
                                className="flex items-center gap-1.5 px-4 py-1.5 cursor-pointer hover:bg-hover text-[12px] group"
                                onClick={() => handleToggleFile(file)}
                            >
                                <span
                                    className={`transition-transform ${
                                        isExpanded ? 'rotate-90' : ''
                                    } opacity-40`}
                                >
                                    <ChevronRight size={12} />
                                </span>
                                <span
                                    className={`w-4 text-center text-[10px] font-bold flex-shrink-0 ${cfg.color}`}
                                    title={cfg.fullLabel}
                                >
                                    {cfg.label}
                                </span>
                                <span className="font-medium text-fg font-mono text-[12px]">
                                    {name}
                                </span>
                                {dir && (
                                    <span className="opacity-30 text-[11px] font-mono">{dir}</span>
                                )}

                                {/* Per-file numstat */}
                                {ns && (
                                    <span className="ml-auto flex items-center gap-1.5 text-[10px] opacity-60">
                                        {ns.insertions > 0 && (
                                            <span className="text-added">+{ns.insertions}</span>
                                        )}
                                        {ns.deletions > 0 && (
                                            <span className="text-deleted">-{ns.deletions}</span>
                                        )}
                                    </span>
                                )}

                                {/* Open in native diff button */}
                                <button
                                    className="ml-2 opacity-0 group-hover:opacity-60 hover:!opacity-100 text-accent shrink-0"
                                    title="Open in VS Code diff editor"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenNativeDiff(file);
                                    }}
                                >
                                    <ExternalLink size={12} />
                                </button>
                            </div>

                            {/* Expandable diff */}
                            {isExpanded && (
                                <div className="bg-bg border-t border-border/30">
                                    {isLoading ? (
                                        <div className="px-4 py-3 text-[11px] opacity-40 animate-pulse">
                                            Loading diff…
                                        </div>
                                    ) : diff !== undefined ? (
                                        <DiffView diff={diff} />
                                    ) : null}
                                </div>
                            )}
                        </div>
                    );
                })}

                {stash.files.length === 0 && (
                    <div className="px-4 py-4 text-[11px] opacity-40 text-center">
                        No files in this stash
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="px-4 py-1.5 border-t border-border text-[10px] opacity-30 flex-shrink-0">
                {fullDate}
            </div>
        </div>
    );
};

const ActionButton: React.FC<{
    label: string;
    icon: React.ReactNode;
    className?: string;
    onClick: () => void;
}> = ({ label, icon, className = '', onClick }) => (
    <button
        className={`bg-transparent border border-border rounded px-2.5 py-1 text-[11px] text-fg cursor-pointer hover:bg-hover hover:border-accent whitespace-nowrap transition-colors flex items-center gap-1 ${className}`}
        onClick={onClick}
    >
        {icon} {label}
    </button>
);
