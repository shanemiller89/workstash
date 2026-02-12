import React from 'react';
import { useStashStore, type StashData } from '../store';
import { postMessage } from '../vscode';
import { StashFiles } from './StashFiles';

export const StashCard: React.FC<{ stash: StashData }> = ({ stash }) => {
    const { expandedIndices, toggleExpanded } = useStashStore();
    const isExpanded = expandedIndices.has(stash.index);
    const isWip = stash.message.toLowerCase().startsWith('wip');

    return (
        <div className="group rounded-md border border-border bg-card hover:border-accent transition-colors">
            {/* Header */}
            <div
                className="flex items-stretch gap-2.5 p-3 cursor-pointer select-none min-h-[52px]"
                onClick={() => toggleExpanded(stash.index)}
            >
                {/* Color indicator */}
                <div
                    className={`w-1 rounded-full flex-shrink-0 ${
                        isWip ? 'bg-warning' : 'bg-accent'
                    }`}
                />

                {/* Info */}
                <div className="flex-1 min-w-0 self-center">
                    <div className="font-semibold text-[13px] truncate">
                        {stash.message || '(no message)'}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] opacity-75">
                        <span className="opacity-60">{stash.name}</span>
                        <span className="inline-flex items-center gap-1 bg-badge-bg text-badge-fg px-1.5 py-0.5 rounded text-[10px] font-medium">
                            ⎇ {stash.branch}
                        </span>
                        <span>⏱ {stash.relativeDate}</span>
                        {stash.stats && <StashStats stats={stash.stats} />}
                    </div>
                </div>

                {/* Actions — visible on hover */}
                <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ActionButton
                        label="Apply"
                        icon="✓"
                        className="hover:text-success"
                        onClick={() => postMessage('apply', { index: stash.index })}
                    />
                    <ActionButton
                        label="Pop"
                        icon="↑"
                        onClick={() => postMessage('pop', { index: stash.index })}
                    />
                    <ActionButton
                        label="Drop"
                        icon="✕"
                        className="hover:text-danger"
                        onClick={() => postMessage('drop', { index: stash.index })}
                    />
                </div>

                {/* Chevron */}
                <span
                    className={`text-[10px] opacity-40 transition-transform self-center ${
                        isExpanded ? 'rotate-90' : ''
                    }`}
                >
                    ▶
                </span>
            </div>

            {/* File list */}
            {isExpanded && stash.files.length > 0 && (
                <StashFiles files={stash.files} stashIndex={stash.index} />
            )}
        </div>
    );
};

const StashStats: React.FC<{
    stats: { filesChanged: number; insertions: number; deletions: number };
}> = ({ stats }) => (
    <span className="inline-flex items-center gap-1.5">
        <span className="opacity-60">
            {stats.filesChanged} file{stats.filesChanged !== 1 ? 's' : ''}
        </span>
        {stats.insertions > 0 && (
            <span className="text-added font-medium">+{stats.insertions}</span>
        )}
        {stats.deletions > 0 && (
            <span className="text-deleted font-medium">-{stats.deletions}</span>
        )}
    </span>
);

const ActionButton: React.FC<{
    label: string;
    icon: string;
    className?: string;
    onClick: () => void;
}> = ({ label, icon, className = '', onClick }) => (
    <button
        className={`bg-transparent border border-transparent rounded px-1.5 py-0.5 text-[12px] text-fg cursor-pointer hover:bg-hover hover:border-border whitespace-nowrap ${className}`}
        title={label}
        onClick={(e) => {
            e.stopPropagation();
            onClick();
        }}
    >
        {icon} {label}
    </button>
);
