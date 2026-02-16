import React, { useCallback } from 'react';
import { useProjectStore } from '../projectStore';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ErrorState } from './ErrorState';
import { useRovingTabIndex } from '../hooks/useRovingTabIndex';
import {
    CircleDot,
    CheckCircle2,
    GitPullRequest,
    GitMerge,
    StickyNote,
    Lock,
} from 'lucide-react';

function formatRelative(iso: string): string {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) {
        return 'just now';
    }
    if (diffMins < 60) {
        return `${diffMins}m ago`;
    }
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) {
        return `${diffHours}h ago`;
    }
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) {
        return `${diffDays}d ago`;
    }
    return date.toLocaleDateString();
}

function ItemTypeIcon({
    type,
    state,
    size = 14,
}: {
    type: string;
    state?: string;
    size?: number;
}) {
    switch (type) {
        case 'ISSUE':
            if (state === 'CLOSED') {
                return <CheckCircle2 size={size} className="text-purple-400" />;
            }
            return <CircleDot size={size} className="text-green-400" />;
        case 'PULL_REQUEST':
            if (state === 'MERGED') {
                return <GitMerge size={size} className="text-purple-400" />;
            }
            if (state === 'CLOSED') {
                return <GitPullRequest size={size} className="text-red-400" />;
            }
            return <GitPullRequest size={size} className="text-green-400" />;
        case 'DRAFT_ISSUE':
            return <StickyNote size={size} className="text-fg/50" />;
        case 'REDACTED':
            return <Lock size={size} className="text-fg/30" />;
        default:
            return <CircleDot size={size} className="text-fg/50" />;
    }
}

/**
 * Simple list view — just the scrollable item list.
 * Header / project selector / filters / auth guards are in ProjectsTab.
 */
export const ProjectList: React.FC = () => {
    const items = useProjectStore((s) => s.items);
    const searchQuery = useProjectStore((s) => s.searchQuery);
    const selectItem = useProjectStore((s) => s.selectItem);
    const selectedItemId = useProjectStore((s) => s.selectedItemId);
    const selectedProject = useProjectStore((s) => s.selectedProject);
    const error = useProjectStore((s) => s.error);
    const filteredItemsFn = useProjectStore((s) => s.filteredItems);

    // Use the store's consolidated filteredItems (includes archive, myIssuesOnly, status, search)
    const filteredItems = filteredItemsFn();

    const handleSelectItem = useCallback(
        (itemId: string) => {
            selectItem(itemId);
        },
        [selectItem],
    );

    // Keyboard navigation (§7f)
    const onProjectItemSelect = useCallback(
        (index: number) => {
            const item = filteredItems[index];
            if (item) handleSelectItem(item.id);
        },
        [filteredItems, handleSelectItem],
    );
    const { listRef, containerProps, getItemProps } =
        useRovingTabIndex({ itemCount: filteredItems.length, onSelect: onProjectItemSelect });

    if (error) {
        return (
            <ErrorState
                message={error}
                onRetry={() => useProjectStore.getState().setError(null)}
            />
        );
    }

    if (filteredItems.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-2">
                <p className="text-fg/40 text-[11px]">
                    {items.length === 0
                        ? selectedProject
                            ? 'No items in this project'
                            : 'No projects found for this repository'
                        : `No items matching "${searchQuery}"`}
                </p>
            </div>
        );
    }

    return (
        <div ref={listRef} className="h-full overflow-y-auto" {...containerProps} aria-label="Project items list">
            {filteredItems.map((item, i) => {
                const isSelected = selectedItemId === item.id;
                const title = item.content?.title ?? 'Untitled';
                const statusFv = item.fieldValues.find(
                    (fv) =>
                        fv.fieldName === 'Status' &&
                        fv.fieldType === 'SINGLE_SELECT',
                );

                return (
                    <Button
                        key={item.id}
                        variant="ghost"
                        className={`w-full justify-start h-auto px-3 py-2.5 rounded-none border-b border-border ${
                            isSelected
                                ? 'bg-accent/10 border-l-2 border-l-accent'
                                : 'border-l-2 border-l-transparent'
                        }`}
                        onClick={() => handleSelectItem(item.id)}
                        {...getItemProps(i)}
                    >
                        <div className="flex items-start gap-2">
                            <div className="mt-0.5 shrink-0">
                                <ItemTypeIcon
                                    type={item.type}
                                    state={item.content?.state}
                                />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                    {item.content?.number && (
                                        <span className="text-fg/40 text-[11px] shrink-0">
                                            #{item.content.number}
                                        </span>
                                    )}
                                    <span className="text-[12px] font-medium truncate">
                                        {title}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-fg/40">
                                    {item.content?.author && (
                                        <span className="truncate">
                                            by {item.content.author}
                                        </span>
                                    )}
                                    {statusFv?.singleSelectOptionName && (
                                        <>
                                            <span>·</span>
                                            <span className="shrink-0">
                                                {statusFv.singleSelectOptionName}
                                            </span>
                                        </>
                                    )}
                                    <span>·</span>
                                    <span className="shrink-0">
                                        {formatRelative(item.updatedAt)}
                                    </span>
                                </div>
                                {item.content?.labels &&
                                    item.content.labels.length > 0 && (
                                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                                            {item.content.labels.slice(0, 4).map((l) => (
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
                            {item.content?.assignees &&
                                item.content.assignees.length > 0 && (
                                    <div className="shrink-0 flex -space-x-1">
                                        {item.content.assignees.slice(0, 3).map((a) => (
                                            <img
                                                key={a.login}
                                                src={a.avatarUrl}
                                                alt={a.login}
                                                title={a.login}
                                                className="w-4 h-4 rounded-full border border-bg"
                                            />
                                        ))}
                                    </div>
                                )}
                        </div>
                    </Button>
                );
            })}
        </div>
    );
};
