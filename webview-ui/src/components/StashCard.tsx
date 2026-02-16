import React from 'react';
import { useStashStore, type StashData } from '../store';
import { postMessage } from '../vscode';
import { StashFiles } from './StashFiles';
import { Check, ArrowUp, X, ChevronRight, GitBranch, Clock } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';

export const StashCard: React.FC<{
    stash: StashData;
    tabIndex?: number;
    isFocused?: boolean;
}> = ({ stash, tabIndex = -1, isFocused = false }) => {
    const expandedIndices = useStashStore((s) => s.expandedIndices);
    const toggleExpanded = useStashStore((s) => s.toggleExpanded);
    const selectStash = useStashStore((s) => s.selectStash);
    const selectedStashIndex = useStashStore((s) => s.selectedStashIndex);
    const isExpanded = expandedIndices.has(stash.index);
    const isSelected = selectedStashIndex === stash.index;
    const isWip = stash.message.toLowerCase().startsWith('wip');

    const handleKeyDown = (e: React.KeyboardEvent) => {
        switch (e.key) {
            case 'Enter':
                e.preventDefault();
                selectStash(stash.index);
                break;
            case ' ':
                e.preventDefault();
                toggleExpanded(stash.index);
                break;
            case 'a':
                e.preventDefault();
                postMessage('apply', { index: stash.index });
                break;
            case 'p':
                e.preventDefault();
                postMessage('pop', { index: stash.index });
                break;
            case 'd':
                e.preventDefault();
                postMessage('drop', { index: stash.index });
                break;
        }
    };

    return (
        <div
            className={`group rounded-md border bg-card transition-colors outline-none ${
                isSelected
                    ? 'border-accent ring-1 ring-accent bg-accent/5'
                    : isFocused
                      ? 'border-accent ring-1 ring-accent'
                      : 'border-border hover:border-accent'
            }`}
            data-stash-card
            tabIndex={tabIndex}
            role="option"
            aria-selected={isSelected}
            aria-expanded={isExpanded}
            onKeyDown={handleKeyDown}
        >
            {/* Header */}
            <div
                className="flex items-stretch gap-2.5 p-3 cursor-pointer select-none min-h-[52px] leading-normal"
                onClick={() => {
                    toggleExpanded(stash.index);
                    selectStash(stash.index);
                }}
            >
                {/* Color indicator */}
                <div
                    className={`w-1 rounded-full shrink-0 self-stretch ${
                        isWip ? 'bg-warning' : 'bg-accent'
                    }`}
                />

                {/* Info */}
                <div className="flex-1 min-w-0 self-center">
                    <div className="font-semibold text-[13px] leading-[18px] truncate">
                        {stash.message || '(no message)'}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] leading-[16px] opacity-75">
                        <span className="opacity-60">{stash.name}</span>
                        <Badge variant="secondary" className="gap-1 px-1.5 py-0.5 text-[10px]">
                            <GitBranch size={10} /> {stash.branch}
                        </Badge>
                        <span className="inline-flex items-center gap-0.5">
                            <Clock size={10} /> {stash.relativeDate}
                        </span>
                        {stash.stats && <StashStats stats={stash.stats} />}
                    </div>
                </div>

                {/* Actions — visible on hover */}
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
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

                {/* Chevron — toggles inline expand */}
                <Button
                    variant="ghost"
                    size="icon-xs"
                    className={`transition-transform self-center opacity-40 hover:opacity-80 ${isExpanded ? 'rotate-90' : ''}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        toggleExpanded(stash.index);
                    }}
                    title={isExpanded ? 'Collapse files' : 'Expand files'}
                >
                    <ChevronRight size={12} />
                </Button>
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
    icon: React.ReactNode;
    className?: string;
    onClick: () => void;
}> = ({ label, icon, className = '', onClick }) => (
    <Button
        variant="ghost"
        size="sm"
        className={`h-auto px-1.5 py-0.5 text-[12px] gap-1 ${className}`}
        title={label}
        onClick={(e) => {
            e.stopPropagation();
            onClick();
        }}
    >
        {icon} {label}
    </Button>
);
