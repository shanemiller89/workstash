import React, { useRef, useCallback, useState, useEffect } from 'react';
import { useStashStore } from '../store';
import { StashCard } from './StashCard';
import { postMessage } from '../vscode';
import { Archive, Plus, RefreshCw } from 'lucide-react';

/** Animated skeleton card shown while stashes are loading */
const SkeletonCard: React.FC = () => (
    <div className="rounded-md border border-border bg-card animate-pulse p-3">
        <div className="flex items-center gap-2.5">
            <div className="w-1 h-8 rounded-full bg-border" />
            <div className="flex-1 space-y-2">
                <div className="h-3 bg-border rounded w-3/4" />
                <div className="h-2 bg-border rounded w-1/2" />
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
            <input
                ref={inputRef}
                type="text"
                placeholder="Stash message (optional)"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                className="bg-input-bg border border-input-border text-input-fg rounded px-2 py-1 text-[12px] outline-none focus:border-accent placeholder:opacity-40 w-full"
            />
            <div className="flex items-center gap-1.5 text-[11px]">
                {(['all', 'staged', 'untracked'] as const).map((m) => (
                    <button
                        key={m}
                        className={`rounded px-2 py-0.5 border transition-colors ${
                            mode === m
                                ? 'bg-accent text-button-fg border-accent'
                                : 'bg-transparent border-border text-fg opacity-70 hover:opacity-100 hover:border-accent'
                        }`}
                        onClick={() => setMode(m)}
                    >
                        {m === 'all'
                            ? 'All Changes'
                            : m === 'staged'
                              ? 'Staged Only'
                              : 'Include Untracked'}
                    </button>
                ))}
            </div>
            <div className="flex items-center gap-1.5 justify-end">
                <button
                    className="text-[11px] opacity-60 hover:opacity-100 px-2 py-0.5"
                    onClick={onClose}
                >
                    Cancel
                </button>
                <button
                    className="bg-button-bg text-button-fg rounded px-3 py-0.5 text-[11px] font-medium hover:bg-button-hover"
                    onClick={handleSubmit}
                >
                    Stash
                </button>
            </div>
        </div>
    );
};

export const StashList: React.FC = () => {
    const loading = useStashStore((s) => s.loading);
    const searchQuery = useStashStore((s) => s.searchQuery);
    const setSearchQuery = useStashStore((s) => s.setSearchQuery);
    const stashes = useStashStore((s) => s.filteredStashes());
    const showCreateForm = useStashStore((s) => s.showCreateForm);
    const setShowCreateForm = useStashStore((s) => s.setShowCreateForm);

    // 8b-v: Roving tabindex keyboard navigation
    const [focusedIndex, setFocusedIndex] = useState(-1);
    const listRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    const handleListKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (stashes.length === 0) return;

            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    setFocusedIndex((prev) => Math.min(prev + 1, stashes.length - 1));
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    setFocusedIndex((prev) => {
                        if (prev <= 0) {
                            searchRef.current?.focus();
                            return -1;
                        }
                        return prev - 1;
                    });
                    break;
                case 'Home':
                    e.preventDefault();
                    setFocusedIndex(0);
                    break;
                case 'End':
                    e.preventDefault();
                    setFocusedIndex(stashes.length - 1);
                    break;
                case 'Escape':
                    e.preventDefault();
                    if (searchQuery) {
                        setSearchQuery('');
                    } else {
                        searchRef.current?.focus();
                        setFocusedIndex(-1);
                    }
                    break;
            }
        },
        [stashes.length, searchQuery, setSearchQuery],
    );

    // Move focus to the card element when focusedIndex changes
    useEffect(() => {
        if (focusedIndex >= 0 && listRef.current) {
            const cards = listRef.current.querySelectorAll<HTMLElement>('[data-stash-card]');
            cards[focusedIndex]?.focus();
        }
    }, [focusedIndex]);

    // Reset focus when stashes change
    useEffect(() => {
        setFocusedIndex(-1);
    }, [stashes.length]);

    return (
        <div className="flex flex-col h-full">
            {/* Search bar + Create button */}
            <div className="px-3 py-2 border-b border-border">
                <div className="flex items-center gap-2">
                    <input
                        ref={searchRef}
                        type="text"
                        placeholder="Search stashes…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'ArrowDown' && stashes.length > 0) {
                                e.preventDefault();
                                setFocusedIndex(0);
                            } else if (e.key === 'Escape' && searchQuery) {
                                setSearchQuery('');
                            }
                        }}
                        className="flex-1 bg-input-bg border border-input-border text-input-fg rounded px-2 py-1 text-[12px] outline-none focus:border-accent placeholder:opacity-40"
                    />
                    <button
                        className="bg-button-bg text-button-fg text-[11px] rounded px-2 py-1 font-medium hover:bg-button-hover flex-shrink-0"
                        onClick={() => setShowCreateForm(!showCreateForm)}
                        title="Create Stash"
                    >
                        <Plus size={14} />
                    </button>
                    <button
                        className="bg-button-bg text-button-fg text-[11px] rounded px-2 py-1 font-medium hover:bg-button-hover flex-shrink-0"
                        onClick={() => postMessage('refresh')}
                        title="Refresh"
                    >
                        <RefreshCw size={14} />
                    </button>
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
                role="listbox"
                aria-label="Stash list"
                onKeyDown={handleListKeyDown}
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
                                <button
                                    className="bg-button-bg text-button-fg rounded px-3 py-1 text-[11px] font-medium hover:bg-button-hover mt-1"
                                    onClick={() => setShowCreateForm(true)}
                                >
                                    Create Stash
                                </button>
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
                    <button
                        className="text-danger hover:underline cursor-pointer"
                        onClick={() => postMessage('clearStashes')}
                    >
                        Clear All
                    </button>
                </div>
            )}
        </div>
    );
};
