import React, { useCallback, useMemo, useRef } from 'react';
import { usePRStore, type PRStateFilter, type PRAuthorFilter } from '../prStore';
import { useNotesStore } from '../notesStore';
import { postMessage } from '../vscode';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { ErrorState } from './ErrorState';
import { useRovingTabIndex } from '../hooks/useRovingTabIndex';
import {
    GitPullRequest,
    GitMerge,
    XCircle,
    Search,
    RefreshCw,
    ExternalLink,
    Plus,
} from 'lucide-react';

const stateFilters: { key: PRStateFilter; label: string }[] = [
    { key: 'open', label: 'Open' },
    { key: 'merged', label: 'Merged' },
    { key: 'closed', label: 'Closed' },
    { key: 'all', label: 'All' },
];

const authorFilters: { key: PRAuthorFilter; label: string }[] = [
    { key: 'all', label: 'All PRs' },
    { key: 'authored', label: 'Mine' },
    { key: 'assigned', label: 'Assigned' },
    { key: 'review-requested', label: 'Review' },
];

function formatRelative(iso: string): string {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays}d ago`;
    return date.toLocaleDateString();
}

function StateIcon({
    state,
    isDraft,
    size = 14,
}: {
    state: string;
    isDraft: boolean;
    size?: number;
}) {
    if (isDraft) {
        return <GitPullRequest size={size} className="text-fg/40" />;
    }
    switch (state) {
        case 'open':
            return <GitPullRequest size={size} className="text-green-400" />;
        case 'merged':
            return <GitMerge size={size} className="text-purple-400" />;
        case 'closed':
            return <XCircle size={size} className="text-red-400" />;
        default:
            return <GitPullRequest size={size} className="text-fg/50" />;
    }
}

export const PRList: React.FC = () => {
    const allPRs = usePRStore((s) => s.prs);
    const searchQuery = usePRStore((s) => s.searchQuery);
    const isLoading = usePRStore((s) => s.isLoading);
    const error = usePRStore((s) => s.error);
    const isRepoNotFound = usePRStore((s) => s.isRepoNotFound);
    const stateFilter = usePRStore((s) => s.stateFilter);
    const authorFilter = usePRStore((s) => s.authorFilter);
    const setStateFilter = usePRStore((s) => s.setStateFilter);
    const setAuthorFilter = usePRStore((s) => s.setAuthorFilter);
    const selectPR = usePRStore((s) => s.selectPR);
    const selectedPRNumber = usePRStore((s) => s.selectedPRNumber);
    const setSearchQuery = usePRStore((s) => s.setSearchQuery);
    const setShowCreatePR = usePRStore((s) => s.setShowCreatePR);
    const isAuthenticated = useNotesStore((s) => s.isAuthenticated);

    const prs = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return allPRs;
        return allPRs.filter(
            (pr) =>
                pr.title.toLowerCase().includes(q) ||
                `#${pr.number}`.includes(q) ||
                pr.branch.toLowerCase().includes(q),
        );
    }, [allPRs, searchQuery]);

    const handleFilterChange = useCallback(
        (filter: PRStateFilter) => {
            setStateFilter(filter);
            postMessage('prs.filter', { state: filter, authorFilter: usePRStore.getState().authorFilter });
        },
        [setStateFilter],
    );

    const handleAuthorFilterChange = useCallback(
        (filter: PRAuthorFilter) => {
            setAuthorFilter(filter);
            postMessage('prs.filter', { state: usePRStore.getState().stateFilter, authorFilter: filter });
        },
        [setAuthorFilter],
    );

    const handleRefresh = useCallback(() => {
        postMessage('prs.refresh');
    }, []);

    const handleSelectPR = useCallback(
        (prNumber: number) => {
            selectPR(prNumber);
            postMessage('prs.getComments', { prNumber });
        },
        [selectPR],
    );

    // Keyboard navigation (§7b)
    const searchRef = useRef<HTMLInputElement>(null);
    const onPRSelect = useCallback(
        (index: number) => {
            const pr = prs[index];
            if (pr) handleSelectPR(pr.number);
        },
        [prs, handleSelectPR],
    );
    const { listRef, containerProps, getItemProps, handleSearchKeyDown: rovingSearchKeyDown } =
        useRovingTabIndex({ itemCount: prs.length, onSelect: onPRSelect, searchRef });

    // Not authenticated
    if (!isAuthenticated) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
                <GitPullRequest size={32} className="text-fg/30" />
                <p className="text-fg/60 text-[12px]">
                    Sign in to GitHub to see your pull requests.
                </p>
                <Button
                    onClick={() => postMessage('prs.signIn')}
                >
                    Sign In to GitHub
                </Button>
            </div>
        );
    }

    // Not a GitHub repo
    if (isRepoNotFound) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
                <GitPullRequest size={32} className="text-fg/30" />
                <p className="text-fg/60 text-[12px]">
                    Not a GitHub repository. Pull requests require a GitHub remote.
                </p>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            {/* Header: filter pills + search + refresh */}
            <div className="shrink-0 border-b border-border">
                {/* State filter pills */}
                <div className="flex items-center gap-1 px-3 py-2">
                    {stateFilters.map((f) => (
                        <Button
                            key={f.key}
                            variant={stateFilter === f.key ? 'default' : 'secondary'}
                            size="sm"
                            className="h-auto px-2.5 py-1 text-[11px] rounded-full"
                            onClick={() => handleFilterChange(f.key)}
                        >
                            {f.label}
                        </Button>
                    ))}
                    <div className="flex-1" />
                    <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setShowCreatePR(true)}
                        title="Create Pull Request"
                    >
                        <Plus size={13} />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={handleRefresh}
                        title="Refresh"
                    >
                        <RefreshCw size={13} />
                    </Button>
                </div>

                {/* Author filter pills */}
                <div className="flex items-center gap-1 px-3 pb-2">
                    {authorFilters.map((f) => (
                        <Button
                            key={f.key}
                            variant={authorFilter === f.key ? 'outline' : 'ghost'}
                            size="sm"
                            className="h-auto px-2 py-0.5 text-[10px] rounded-full"
                            onClick={() => handleAuthorFilterChange(f.key)}
                        >
                            {f.label}
                        </Button>
                    ))}
                </div>

                {/* Search bar */}
                <div className="px-3 pb-2">
                    <div className="relative">
                        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-fg/30" />
                        <Input
                            ref={searchRef}
                            type="text"
                            placeholder="Search PRs..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={rovingSearchKeyDown}
                            className="pl-7 text-[11px]"
                        />
                    </div>
                </div>
            </div>

            {/* PR List */}
            <div ref={listRef} className="flex-1 overflow-y-auto" {...containerProps} aria-label="Pull request list">
                {isLoading ? (
                    <div className="flex items-center justify-center py-8 text-fg/40 text-[11px]">
                        Loading pull requests…
                    </div>
                ) : error ? (
                    <ErrorState
                        message={error}
                        onRetry={() => {
                            usePRStore.getState().setError(null);
                            handleRefresh();
                        }}
                    />
                ) : prs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-2">
                        <p className="text-fg/40 text-[11px]">
                            {allPRs.length === 0
                                ? 'No pull requests found'
                                : `No PRs matching "${searchQuery}"`}
                        </p>
                    </div>
                ) : (
                    prs.map((pr, i) => {
                        const isSelected = selectedPRNumber === pr.number;
                        return (
                            <Button
                                key={pr.number}
                                variant="ghost"
                                className={`w-full justify-start h-auto px-3 py-2.5 rounded-none border-b border-border ${
                                    isSelected
                                        ? 'bg-accent/10 border-l-2 border-l-accent'
                                        : 'border-l-2 border-l-transparent'
                                }`}
                                onClick={() => handleSelectPR(pr.number)}
                                {...getItemProps(i)}
                            >
                                <div className="flex items-start gap-2">
                                    <div className="mt-0.5 shrink-0">
                                        <StateIcon state={pr.state} isDraft={pr.isDraft} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-fg/40 text-[11px] shrink-0">
                                                #{pr.number}
                                            </span>
                                            <span className="text-[12px] font-medium truncate">
                                                {pr.title}
                                            </span>
                                            {pr.isDraft && (
                                                <Badge variant="outline" className="text-[9px] px-1 py-0.5 bg-fg/10 text-fg/50 border-fg/10 shrink-0">
                                                    Draft
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-fg/40">
                                            <span className="truncate">
                                                {pr.branch} → {pr.baseBranch}
                                            </span>
                                            <span>·</span>
                                            <span className="shrink-0">
                                                {formatRelative(pr.updatedAt)}
                                            </span>
                                        </div>
                                        {pr.labels.length > 0 && (
                                            <div className="flex items-center gap-1 mt-1 flex-wrap">
                                                {pr.labels.slice(0, 3).map((l) => (
                                                    <Badge
                                                        key={l.name}
                                                        variant="outline"
                                                        className="text-[9px] px-1.5 py-0.5"
                                                        style={{
                                                            backgroundColor: `#${l.color}20`,
                                                            color: `#${l.color}`,
                                                            borderColor: `#${l.color}40`,
                                                        }}
                                                    >
                                                        {l.name}
                                                    </Badge>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className="shrink-0 flex items-center gap-1 text-[10px] text-fg/30">
                                        {pr.commentsCount > 0 && (
                                            <span title={`${pr.commentsCount} comments`}>
                                                💬 {pr.commentsCount}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </Button>
                        );
                    })
                )}
            </div>
        </div>
    );
};
