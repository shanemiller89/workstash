import React, { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import { useStashStore } from '../store';
import { StashCard } from './StashCard';
import { postMessage } from '../vscode';
import { Archive, Plus, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Skeleton } from './ui/skeleton';
import { useRovingTabIndex } from '../hooks/useRovingTabIndex';

/** Animated skeleton card shown while stashes are loading */
const SkeletonCard: React.FC = () => (
    <div className="rounded-md border border-border bg-card p-3">
        <div className="flex items-center gap-2.5">
            <Skeleton className="w-1 h-8 rounded-full" />
            <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-2 w-1/2" />
            </div>
        </div>
    </div>
);

/** 8b-ii: Inline stash creation form */
const CreateStashForm: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [message, setMessage] = useState('');
    const [mode, setMode] = useState<'all' | 'staged' | 'untracked'>('all');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const handleSubmit = () => {
        postMessage('createStashInline', { message: message.trim(), mode });
        setMessage('');
        onClose();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSubmit();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
        }
    };

    return (
        <div className="rounded-md border border-accent bg-card p-3 flex flex-col gap-2">
            <div className="text-[12px] font-semibold opacity-80">Create Stash</div>
            <Input
                ref={inputRef}
                type="text"
                placeholder="Stash message (optional)"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                className="text-[12px]"
            />
            <div className="flex items-center gap-1.5 text-[11px]">
                {(['all', 'staged', 'untracked'] as const).map((m) => (
                    <Button
                        key={m}
                        variant={mode === m ? 'default' : 'outline'}
                        size="sm"
                        className="h-auto px-2 py-0.5 text-[11px]"
                        onClick={() => setMode(m)}
                    >
                        {m === 'all'
                            ? 'All Changes'
                            : m === 'staged'
                              ? 'Staged Only'
                              : 'Include Untracked'}
                    </Button>
                ))}
            </div>
            <div className="flex items-center gap-1.5 justify-end">
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto text-[11px] px-2 py-0.5"
                    onClick={onClose}
                >
                    Cancel
                </Button>
                <Button
                    size="sm"
                    className="h-auto text-[11px] px-3 py-0.5"
                    onClick={handleSubmit}
                >
                    Stash
                </Button>
            </div>
        </div>
    );
};

export const StashList: React.FC = () => {
    const loading = useStashStore((s) => s.loading);
    const searchQuery = useStashStore((s) => s.searchQuery);
    const setSearchQuery = useStashStore((s) => s.setSearchQuery);
    const allStashes = useStashStore((s) => s.stashes);
    const filteredStashesFn = useStashStore((s) => s.filteredStashes);
    const showCreateForm = useStashStore((s) => s.showCreateForm);
    const setShowCreateForm = useStashStore((s) => s.setShowCreateForm);

    const stashes = useMemo(() => filteredStashesFn(), [filteredStashesFn, allStashes, searchQuery]);

    // Roving tabindex keyboard navigation (§7a)
    const searchRef = useRef<HTMLInputElement>(null);
    const onStashSelect = useCallback(
        (index: number) => {
            const stash = stashes[index];
            if (stash) {
                useStashStore.getState().selectStash(stash.index);
            }
        },
        [stashes],
    );
    const onStashEscape = useCallback(() => {
        if (searchQuery) {
            setSearchQuery('');
        } else {
            searchRef.current?.focus();
        }
    }, [searchQuery, setSearchQuery]);

    const { focusedIndex, listRef, containerProps, getItemProps, handleSearchKeyDown: rovingSearchKeyDown } =
        useRovingTabIndex({
            itemCount: stashes.length,
            onSelect: onStashSelect,
            searchRef,
            onEscape: onStashEscape,
            itemSelector: 'data-stash-card',
        });

    return (
        <div className="flex flex-col h-full">
            {/* Search bar + Create button */}
            <div className="px-3 py-2 border-b border-border">
                <div className="flex items-center gap-2">
                    <Input
                        ref={searchRef}
                        type="text"
                        placeholder="Search stashes…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                            rovingSearchKeyDown(e);
                            if (e.key === 'Escape' && searchQuery) {
                                setSearchQuery('');
                            }
                        }}
                        className="flex-1 text-[12px]"
                    />
                    <Button
                        size="icon-sm"
                        onClick={() => setShowCreateForm(!showCreateForm)}
                        title="Create Stash"
                    >
                        <Plus size={14} />
                    </Button>
                    <Button
                        size="icon-sm"
                        onClick={() => postMessage('refresh')}
                        title="Refresh"
                    >
                        <RefreshCw size={14} />
                    </Button>
                </div>
            </div>

            {/* Inline create form */}
            {showCreateForm && (
                <div className="px-2 pt-2">
                    <CreateStashForm onClose={() => setShowCreateForm(false)} />
                </div>
            )}

            {/* List */}
            <div
                ref={listRef}
                className="flex-1 overflow-y-auto px-2 py-2 flex flex-col gap-1.5"
                aria-label="Stash list"
                {...containerProps}
            >
                {loading && stashes.length === 0 && (
                    <div className="flex flex-col gap-1.5">
                        <SkeletonCard />
                        <SkeletonCard />
                        <SkeletonCard />
                    </div>
                )}

                {!loading && stashes.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-32 gap-2 opacity-50 text-[12px]">
                        <Archive size={24} className="opacity-60" />
                        {searchQuery ? (
                            <span>No stashes match &quot;{searchQuery}&quot;</span>
                        ) : (
                            <>
                                <span>No stashes yet</span>
                                <Button
                                    size="sm"
                                    className="h-auto px-3 py-1 text-[11px] mt-1"
                                    onClick={() => setShowCreateForm(true)}
                                >
                                    Create Stash
                                </Button>
                            </>
                        )}
                    </div>
                )}

                {stashes.map((stash, i) => (
                    <StashCard
                        key={stash.index}
                        stash={stash}
                        tabIndex={i === focusedIndex ? 0 : -1}
                        isFocused={i === focusedIndex}
                    />
                ))}
            </div>

            {/* Footer */}
            {stashes.length > 0 && (
                <div className="px-3 py-1.5 border-t border-border flex items-center justify-between text-[11px] opacity-50">
                    <span>
                        {stashes.length} stash{stashes.length !== 1 ? 'es' : ''}
                    </span>
                    <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-danger text-[11px]"
                        onClick={() => postMessage('clearStashes')}
                    >
                        Clear All
                    </Button>
                </div>
            )}
        </div>
    );
};
