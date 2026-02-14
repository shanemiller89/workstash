import React, { useCallback, useMemo } from 'react';
import { useProjectStore, type BoardColumn, type ProjectItemData } from '../projectStore';
import { useNotesStore } from '../notesStore';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import {
    CircleDot,
    CheckCircle2,
    GitPullRequest,
    GitMerge,
    StickyNote,
    Lock,
} from 'lucide-react';

// ─── GitHub Project color → CSS mapping ───────────────────────────

const GITHUB_COLOR_MAP: Record<string, { bg: string; border: string; text: string; dot: string }> = {
    GRAY:   { bg: 'bg-[#8b8a8a20]', border: 'border-[#8b8a8a40]', text: 'text-[#8b8a8a]', dot: '#8b8a8a' },
    BLUE:   { bg: 'bg-[#58a6ff20]', border: 'border-[#58a6ff40]', text: 'text-[#58a6ff]', dot: '#58a6ff' },
    GREEN:  { bg: 'bg-[#3fb95020]', border: 'border-[#3fb95040]', text: 'text-[#3fb950]', dot: '#3fb950' },
    YELLOW: { bg: 'bg-[#d2992220]', border: 'border-[#d2992240]', text: 'text-[#d29922]', dot: '#d29922' },
    ORANGE: { bg: 'bg-[#db6d2820]', border: 'border-[#db6d2840]', text: 'text-[#db6d28]', dot: '#db6d28' },
    RED:    { bg: 'bg-[#f8514920]', border: 'border-[#f8514940]', text: 'text-[#f85149]', dot: '#f85149' },
    PINK:   { bg: 'bg-[#db61a220]', border: 'border-[#db61a240]', text: 'text-[#db61a2]', dot: '#db61a2' },
    PURPLE: { bg: 'bg-[#a371f720]', border: 'border-[#a371f740]', text: 'text-[#a371f7]', dot: '#a371f7' },
};

function getColumnColorClasses(color?: string): { bg: string; border: string; text: string; dot: string } {
    if (!color) {
        return GITHUB_COLOR_MAP.GRAY;
    }
    return GITHUB_COLOR_MAP[color] ?? GITHUB_COLOR_MAP.GRAY;
}

// ─── Shared ItemTypeIcon ──────────────────────────────────────────

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

// ─── Board Card ───────────────────────────────────────────────────

interface BoardCardProps {
    item: ProjectItemData;
    isSelected: boolean;
    onClick: () => void;
}

const BoardCard: React.FC<BoardCardProps> = React.memo(({ item, isSelected, onClick }) => {
    const title = item.content?.title ?? 'Untitled';

    return (
        <button
            type="button"
            onClick={onClick}
            className={`w-full text-left rounded-md p-2.5 border transition-colors cursor-pointer ${
                isSelected
                    ? 'bg-accent/15 border-accent'
                    : 'bg-[var(--vscode-editor-background)] border-border hover:border-fg/20'
            }`}
        >
            <div className="flex items-start gap-1.5">
                <div className="mt-0.5 flex-shrink-0">
                    <ItemTypeIcon type={item.type} state={item.content?.state} />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                        {item.content?.number && (
                            <span className="text-fg/40 text-[10px] flex-shrink-0">
                                #{item.content.number}
                            </span>
                        )}
                        <span className="text-[11px] font-medium leading-snug line-clamp-2">
                            {title}
                        </span>
                    </div>
                    {/* Labels */}
                    {item.content?.labels && item.content.labels.length > 0 && (
                        <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                            {item.content.labels.slice(0, 3).map((l) => (
                                <Badge
                                    key={l.name}
                                    variant="outline"
                                    className="text-[8px] px-1 py-0"
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
            </div>
            {/* Bottom row: author + assignees */}
            <div className="flex items-center justify-between mt-1.5">
                <span className="text-[9px] text-fg/30 truncate">
                    {item.content?.author ?? ''}
                </span>
                {item.content?.assignees && item.content.assignees.length > 0 && (
                    <div className="flex-shrink-0 flex -space-x-1">
                        {item.content.assignees.slice(0, 3).map((a) => (
                            <img
                                key={a.login}
                                src={a.avatarUrl}
                                alt={a.login}
                                title={a.login}
                                className="w-3.5 h-3.5 rounded-full border border-bg"
                            />
                        ))}
                    </div>
                )}
            </div>
        </button>
    );
});

BoardCard.displayName = 'BoardCard';

// ─── Board Column ─────────────────────────────────────────────────

interface BoardColumnProps {
    column: BoardColumn;
    selectedItemId: string | null;
    onSelectItem: (itemId: string) => void;
}

const BoardColumnComponent: React.FC<BoardColumnProps> = React.memo(
    ({ column, selectedItemId, onSelectItem }) => {
        const colors = getColumnColorClasses(column.color);

        return (
            <div className="flex-shrink-0 w-[260px] flex flex-col rounded-lg border border-border bg-[var(--vscode-sideBar-background)] overflow-hidden">
                {/* Column header */}
                <div
                    className={`flex items-center gap-2 px-3 py-2 border-b border-border ${colors.bg}`}
                >
                    <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: colors.dot }}
                    />
                    <span className={`text-[11px] font-semibold truncate ${colors.text}`}>
                        {column.name}
                    </span>
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 ml-auto">
                        {column.items.length}
                    </Badge>
                </div>

                {/* Column body */}
                <ScrollArea className="flex-1 min-h-0">
                    <div className="flex flex-col gap-1.5 p-2">
                        {column.items.length === 0 ? (
                            <div className="text-fg/20 text-[10px] text-center py-4">
                                No items
                            </div>
                        ) : (
                            column.items.map((item) => (
                                <BoardCard
                                    key={item.id}
                                    item={item}
                                    isSelected={selectedItemId === item.id}
                                    onClick={() => onSelectItem(item.id)}
                                />
                            ))
                        )}
                    </div>
                </ScrollArea>
            </div>
        );
    },
);

BoardColumnComponent.displayName = 'BoardColumnComponent';

// ─── Board View ───────────────────────────────────────────────────

export const ProjectBoardView: React.FC = () => {
    const fields = useProjectStore((s) => s.fields);
    const rawItems = useProjectStore((s) => s.items);
    const statusFilter = useProjectStore((s) => s.statusFilter);
    const searchQuery = useProjectStore((s) => s.searchQuery);
    const myIssuesOnly = useProjectStore((s) => s.myIssuesOnly);
    const selectedProject = useProjectStore((s) => s.selectedProject);
    const selectedViewId = useProjectStore((s) => s.selectedViewId);
    const selectItem = useProjectStore((s) => s.selectItem);
    const selectedItemId = useProjectStore((s) => s.selectedItemId);
    const authUsername = useNotesStore((s) => s.authUsername);

    const columns = useMemo(() => {
        // First compute filtered items
        let filtered = rawItems.filter((i) => !i.isArchived);

        if (myIssuesOnly && authUsername) {
            filtered = filtered.filter((item) =>
                item.content?.assignees?.some(
                    (a) => a.login.toLowerCase() === authUsername.toLowerCase(),
                ),
            );
        }

        if (statusFilter !== 'all') {
            filtered = filtered.filter((item) => {
                const statusFv = item.fieldValues.find(
                    (fv) => fv.fieldName === 'Status' && fv.fieldType === 'SINGLE_SELECT',
                );
                return statusFv?.singleSelectOptionName === statusFilter;
            });
        }

        const q = searchQuery.trim().toLowerCase();
        if (q) {
            filtered = filtered.filter((item) => {
                const title = item.content?.title?.toLowerCase() ?? '';
                const number = item.content?.number ? `#${item.content.number}` : '';
                const labels = item.content?.labels?.map((l) => l.name.toLowerCase()).join(' ') ?? '';
                return title.includes(q) || number.includes(q) || labels.includes(q);
            });
        }

        // Determine groupBy field
        let groupByFieldId: string | undefined;
        if (selectedProject?.views) {
            const view = selectedViewId
                ? selectedProject.views.find((v) => v.id === selectedViewId)
                : selectedProject.views.find((v) => v.layout === 'BOARD');
            groupByFieldId = view?.groupByFieldIds?.[0];
        }

        let groupField = groupByFieldId ? fields.find((f) => f.id === groupByFieldId) : undefined;
        if (!groupField) {
            groupField = fields.find(
                (f) => f.name === 'Status' && f.dataType === 'SINGLE_SELECT',
            );
        }

        if (!groupField?.options) {
            return [{ id: '__all__', name: 'All Items', items: filtered }] as BoardColumn[];
        }

        const cols: BoardColumn[] = [];
        const assignedIds = new Set<string>();

        for (const opt of groupField.options) {
            const colItems = filtered.filter((item) => {
                const fv = item.fieldValues.find((v) => v.fieldId === groupField!.id);
                return fv?.singleSelectOptionId === opt.id;
            });
            colItems.forEach((i) => assignedIds.add(i.id));
            cols.push({ id: opt.id, name: opt.name, color: opt.color, items: colItems });
        }

        const unassigned = filtered.filter((i) => !assignedIds.has(i.id));
        if (unassigned.length > 0) {
            cols.unshift({ id: '__none__', name: 'No ' + groupField.name, items: unassigned });
        }

        return cols;
    }, [rawItems, statusFilter, searchQuery, myIssuesOnly, authUsername, fields, selectedProject, selectedViewId]);

    const handleSelectItem = useCallback(
        (itemId: string) => {
            selectItem(itemId);
        },
        [selectItem],
    );

    if (columns.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-fg/40 text-[11px]">
                No columns to display
            </div>
        );
    }

    return (
        <div className="h-full overflow-x-auto">
            <div className="flex gap-3 p-3 h-full min-w-max">
                {columns.map((col) => (
                    <BoardColumnComponent
                        key={col.id}
                        column={col}
                        selectedItemId={selectedItemId}
                        onSelectItem={handleSelectItem}
                    />
                ))}
            </div>
        </div>
    );
};
