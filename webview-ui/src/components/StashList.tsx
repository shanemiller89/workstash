import React from 'react';
import { useStashStore } from '../store';
import { StashCard } from './StashCard';
import { postMessage } from '../vscode';

export const StashList: React.FC = () => {
    const loading = useStashStore((s) => s.loading);
    const searchQuery = useStashStore((s) => s.searchQuery);
    const setSearchQuery = useStashStore((s) => s.setSearchQuery);
    const stashes = useStashStore((s) => s.filteredStashes());

    return (
        <div className="flex flex-col h-full">
            {/* Search bar */}
            <div className="px-3 py-2 border-b border-border">
                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        placeholder="Search stashes…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="flex-1 bg-input-bg border border-input-border text-input-fg rounded px-2 py-1 text-[12px] outline-none focus:border-accent placeholder:opacity-40"
                    />
                    <button
                        className="bg-button-bg text-button-fg text-[11px] rounded px-2 py-1 font-medium hover:bg-button-hover flex-shrink-0"
                        onClick={() => postMessage('refresh')}
                        title="Refresh"
                    >
                        ↻
                    </button>
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto px-2 py-2 flex flex-col gap-1.5">
                {loading && stashes.length === 0 && (
                    <div className="flex items-center justify-center h-24 text-[12px] opacity-40">
                        Loading stashes…
                    </div>
                )}

                {!loading && stashes.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-32 gap-2 opacity-50 text-[12px]">
                        <span className="text-xl">📦</span>
                        {searchQuery ? (
                            <span>No stashes match "{searchQuery}"</span>
                        ) : (
                            <>
                                <span>No stashes yet</span>
                                <button
                                    className="bg-button-bg text-button-fg rounded px-3 py-1 text-[11px] font-medium hover:bg-button-hover mt-1"
                                    onClick={() => postMessage('createStash')}
                                >
                                    Create Stash
                                </button>
                            </>
                        )}
                    </div>
                )}

                {stashes.map((stash) => (
                    <StashCard key={stash.index} stash={stash} />
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
