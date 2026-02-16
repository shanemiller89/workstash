import React, { useCallback, useMemo } from 'react';
import { useProjectStore, type ProjectItemData, type ProjectFieldData } from '../projectStore';
import { useNotesStore } from '../notesStore';
import { Badge } from './ui/badge';
import {
    CircleDot,
    CheckCircle2,
    GitPullRequest,
    GitMerge,
    StickyNote,
    Lock,
} from 'lucide-react';

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

// ─── Field Value Cell ─────────────────────────────────────────────

function FieldValueCell({
    item,
    field,
}: {
    item: ProjectItemData;
    field: ProjectFieldData;
}) {
    const fv = item.fieldValues.find((v) => v.fieldId === field.id);
    if (!fv) {
        return <span className="text-fg/15">—</span>;
    }

    switch (field.dataType) {
        case 'SINGLE_SELECT': {
            const optName = fv.singleSelectOptionName;
            if (!optName) {
                return <span className="text-fg/15">—</span>;
            }
            const opt = field.options?.find((o) => o.id === fv.singleSelectOptionId);
            return (
                <Badge
                    variant="outline"
                    className="text-[9px] px-1.5 py-0"
                    style={
                        opt?.color
                            ? {
                                  borderColor: `var(--gh-${opt.color.toLowerCase()}, currentColor)`,
                              }
                            : undefined
                    }
                >
                    {optName}
                </Badge>
            );
        }

        case 'ITERATION':
            return (
                <span className="text-[10px] text-fg/70">{fv.iterationTitle ?? '—'}</span>
            );

        case 'DATE':
            if (!fv.date) {
                return <span className="text-fg/15">—</span>;
            }
            return (
                <span className="text-[10px] text-fg/70">
                    {new Date(fv.date).toLocaleDateString()}
                </span>
            );

        case 'NUMBER':
            return (
                <span className="text-[10px] text-fg/70 font-mono">
                    {fv.number ?? '—'}
                </span>
            );

        case 'TEXT':
            return (
                <span className="text-[10px] text-fg/70 truncate max-w-30 inline-block">
                    {fv.text ?? '—'}
                </span>
            );

        case 'LABELS':
            if (!fv.labels?.length) {
                return <span className="text-fg/15">—</span>;
            }
            return (
                <div className="flex gap-0.5 flex-wrap">
                    {fv.labels.slice(0, 3).map((l) => (
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
            );

        case 'REVIEWERS':
        case 'ASSIGNEES':
            if (!fv.users?.length) {
                return <span className="text-fg/15">—</span>;
            }
            return (
                <div className="flex -space-x-1">
                    {fv.users.slice(0, 4).map((u) => (
                        <img
                            key={u.login}
                            src={u.avatarUrl}
                            alt={u.login}
                            title={u.login}
                            className="w-4 h-4 rounded-full border border-bg"
                        />
                    ))}
                </div>
            );

        case 'MILESTONE':
            return (
                <span className="text-[10px] text-fg/70">
                    {fv.milestoneTitle ?? '—'}
                </span>
            );

        default:
            return <span className="text-fg/15">—</span>;
    }
}

// ─── Table View ───────────────────────────────────────────────────

/** Fields to exclude from the table columns (shown inline in the title column) */
const EXCLUDED_FIELD_NAMES = new Set(['Title']);

export const ProjectTableView: React.FC = () => {
    const fields = useProjectStore((s) => s.fields);
    const rawItems = useProjectStore((s) => s.items);
    const statusFilter = useProjectStore((s) => s.statusFilter);
    const searchQuery = useProjectStore((s) => s.searchQuery);
    const myIssuesOnly = useProjectStore((s) => s.myIssuesOnly);
    const selectItem = useProjectStore((s) => s.selectItem);
    const selectedItemId = useProjectStore((s) => s.selectedItemId);
    const authUsername = useNotesStore((s) => s.authUsername);

    const items = useMemo(() => {
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

        return filtered;
    }, [rawItems, statusFilter, searchQuery, myIssuesOnly, authUsername]);

    // Pick visible columns: filter out Title (always shown), keep only useful types
    const visibleFields = useMemo(() => {
        return fields.filter(
            (f) => !EXCLUDED_FIELD_NAMES.has(f.name) && f.dataType !== 'TRACKED_BY' && f.dataType !== 'TRACKS',
        );
    }, [fields]);

    const handleSelectItem = useCallback(
        (itemId: string) => {
            selectItem(itemId);
        },
        [selectItem],
    );

    if (items.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-fg/40 text-[11px]">
                No items to display
            </div>
        );
    }

    return (
        <div className="h-full overflow-auto">
            <table className="w-full text-left border-collapse min-w-max">
                <thead className="sticky top-0 z-10 bg-[var(--vscode-sideBar-background)]">
                    <tr className="border-b border-border">
                        {/* Title column */}
                        <th className="text-[10px] font-semibold text-fg/50 uppercase tracking-wider px-3 py-2 whitespace-nowrap">
                            Title
                        </th>
                        {visibleFields.map((field) => (
                            <th
                                key={field.id}
                                className="text-[10px] font-semibold text-fg/50 uppercase tracking-wider px-3 py-2 whitespace-nowrap"
                            >
                                {field.name}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {items.map((item) => {
                        const isSelected = selectedItemId === item.id;
                        const title = item.content?.title ?? 'Untitled';

                        return (
                            <tr
                                key={item.id}
                                onClick={() => handleSelectItem(item.id)}
                                className={`border-b border-border cursor-pointer transition-colors ${
                                    isSelected
                                        ? 'bg-accent/10'
                                        : 'hover:bg-[var(--vscode-list-hoverBackground)]'
                                }`}
                            >
                                {/* Title cell */}
                                <td className="px-3 py-2 max-w-75">
                                    <div className="flex items-center gap-1.5">
                                        <div className="shrink-0">
                                            <ItemTypeIcon
                                                type={item.type}
                                                state={item.content?.state}
                                                size={13}
                                            />
                                        </div>
                                        {item.content?.number && (
                                            <span className="text-fg/40 text-[10px] shrink-0">
                                                #{item.content.number}
                                            </span>
                                        )}
                                        <span className="text-[11px] font-medium truncate">
                                            {title}
                                        </span>
                                    </div>
                                </td>
                                {/* Field value cells */}
                                {visibleFields.map((field) => (
                                    <td key={field.id} className="px-3 py-2">
                                        <FieldValueCell item={item} field={field} />
                                    </td>
                                ))}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};
