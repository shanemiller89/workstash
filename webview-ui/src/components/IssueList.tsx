import React, { useCallback, useMemo, useRef } from 'react';
import { useIssueStore, type IssueStateFilter } from '../issueStore';
import { useNotesStore } from '../notesStore';
import { postMessage } from '../vscode';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { ErrorState } from './ErrorState';
import { useRovingTabIndex } from '../hooks/useRovingTabIndex';
import {
    CircleDot,
    CheckCircle2,
    Search,
    RefreshCw,
} from 'lucide-react';

const stateFilters: { key: IssueStateFilter; label: string }[] = [
    { key: 'open', label: 'Open' },
    { key: 'closed', label: 'Closed' },
    { key: 'all', label: 'All' },
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
    size = 14,
}: {
    state: string;
    size?: number;
}) {
    switch (state) {
        case 'open':
            return <CircleDot size={size} className="text-green-400" />;
        case 'closed':
            return <CheckCircle2 size={size} className="text-purple-400" />;
        default:
            return <CircleDot size={size} className="text-fg/50" />;
    }
}

export const IssueList: React.FC = () => {
    const allIssues = useIssueStore((s) => s.issues);
    const searchQuery = useIssueStore((s) => s.searchQuery);
    const isLoading = useIssueStore((s) => s.isLoading);
    const error = useIssueStore((s) => s.error);
    const isRepoNotFound = useIssueStore((s) => s.isRepoNotFound);
    const stateFilter = useIssueStore((s) => s.stateFilter);
    const setStateFilter = useIssueStore((s) => s.setStateFilter);
    const selectIssue = useIssueStore((s) => s.selectIssue);
    const selectedIssueNumber = useIssueStore((s) => s.selectedIssueNumber);
    const setSearchQuery = useIssueStore((s) => s.setSearchQuery);
    const isAuthenticated = useNotesStore((s) => s.isAuthenticated);

    const issues = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return allIssues;
        return allIssues.filter(
            (issue) =>
                issue.title.toLowerCase().includes(q) ||
                `#${issue.number}`.includes(q) ||
                issue.labels.some((l) => l.name.toLowerCase().includes(q)),
        );
    }, [allIssues, searchQuery]);

    const handleFilterChange = useCallback(
        (filter: IssueStateFilter) => {
            setStateFilter(filter);
            postMessage('issues.filter', { state: filter });
        },
        [setStateFilter],
    );

    const handleRefresh = useCallback(() => {
        postMessage('issues.refresh');
    }, []);

    const handleSelectIssue = useCallback(
        (issueNumber: number) => {
            selectIssue(issueNumber);
            postMessage('issues.getComments', { issueNumber });
        },
        [selectIssue],
    );

    // Keyboard navigation (§7c)
    const searchRef = useRef<HTMLInputElement>(null);
    const onIssueSelect = useCallback(
        (index: number) => {
            const issue = issues[index];
            if (issue) handleSelectIssue(issue.number);
        },
        [issues, handleSelectIssue],
    );
    const { listRef, containerProps, getItemProps, handleSearchKeyDown: rovingSearchKeyDown } =
        useRovingTabIndex({ itemCount: issues.length, onSelect: onIssueSelect, searchRef });

    // Not authenticated
    if (!isAuthenticated) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
                <CircleDot size={32} className="text-fg/30" />
                <p className="text-fg/60 text-[12px]">
                    Sign in to GitHub to see repository issues.
                </p>
                <Button
                    onClick={() => postMessage('issues.signIn')}
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
                <CircleDot size={32} className="text-fg/30" />
                <p className="text-fg/60 text-[12px]">
                    Not a GitHub repository. Issues require a GitHub remote.
                </p>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            {/* Header: filter pills + search + refresh */}
            <div className="shrink-0 border-b border-border">
                {/* Filter pills */}
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
                        onClick={handleRefresh}
                        title="Refresh"
                    >
                        <RefreshCw size={13} />
                    </Button>
                </div>

                {/* Search bar */}
                <div className="px-3 pb-2">
                    <div className="relative">
                        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-fg/30" />
                        <Input
                            ref={searchRef}
                            type="text"
                            placeholder="Search issues..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={rovingSearchKeyDown}
                            className="pl-7 text-[11px]"
                        />
                    </div>
                </div>
            </div>

            {/* Issue List */}
            <div ref={listRef} className="flex-1 overflow-y-auto" {...containerProps} aria-label="Issue list">
                {isLoading ? (
                    <div className="flex items-center justify-center py-8 text-fg/40 text-[11px]">
                        Loading issues…
                    </div>
                ) : error ? (
                    <ErrorState
                        message={error}
                        onRetry={() => {
                            useIssueStore.getState().setError(null);
                            handleRefresh();
                        }}
                    />
                ) : issues.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-2">
                        <p className="text-fg/40 text-[11px]">
                            {allIssues.length === 0
                                ? 'No issues found'
                                : `No issues matching "${searchQuery}"`}
                        </p>
                    </div>
                ) : (
                    issues.map((issue, i) => {
                        const isSelected = selectedIssueNumber === issue.number;
                        return (
                            <Button
                                key={issue.number}
                                variant="ghost"
                                className={`w-full justify-start h-auto px-3 py-2.5 rounded-none border-b border-border ${
                                    isSelected
                                        ? 'bg-accent/10 border-l-2 border-l-accent'
                                        : 'border-l-2 border-l-transparent'
                                }`}
                                onClick={() => handleSelectIssue(issue.number)}
                                {...getItemProps(i)}
                            >
                                <div className="flex items-start gap-2">
                                    <div className="mt-0.5 shrink-0">
                                        <StateIcon state={issue.state} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-fg/40 text-[11px] shrink-0">
                                                #{issue.number}
                                            </span>
                                            <span className="text-[12px] font-medium truncate">
                                                {issue.title}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-fg/40">
                                            <span className="truncate">
                                                by {issue.author}
                                            </span>
                                            {issue.assignees.length > 0 && (
                                                <>
                                                    <span>·</span>
                                                    <span className="truncate">
                                                        → {issue.assignees.map((a) => a.login).join(', ')}
                                                    </span>
                                                </>
                                            )}
                                            <span>·</span>
                                            <span className="shrink-0">
                                                {formatRelative(issue.updatedAt)}
                                            </span>
                                        </div>
                                        {issue.labels.length > 0 && (
                                            <div className="flex items-center gap-1 mt-1 flex-wrap">
                                                {issue.labels.slice(0, 4).map((l) => (
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
                                        {issue.commentsCount > 0 && (
                                            <span title={`${issue.commentsCount} comments`}>
                                                💬 {issue.commentsCount}
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
