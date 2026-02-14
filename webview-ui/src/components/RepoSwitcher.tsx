import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { useAppStore, type RepoInfo, type RepoGroup } from '../appStore';
import { postMessage } from '../vscode';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Input } from './ui/input';
import { Separator } from './ui/separator';
import { ScrollArea } from './ui/scroll-area';
import { GitBranch, ChevronDown, Check, Globe, Lock, Loader2 } from 'lucide-react';

/**
 * Compact repo switcher displayed in the TabBar.
 * Uses a Popover (not DropdownMenu) so that the search input is fully typeable.
 * Shows pre-fetched GitHub repos grouped by owner, plus discovered git remotes,
 * with a search/filter input and a custom owner/repo entry.
 */
export const RepoSwitcher: React.FC = () => {
    const currentRepo = useAppStore((s) => s.currentRepo);
    const availableRepos = useAppStore((s) => s.availableRepos);
    const repoGroups = useAppStore((s) => s.repoGroups);
    const repoGroupsLoading = useAppStore((s) => s.repoGroupsLoading);

    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [showCustomInput, setShowCustomInput] = useState(false);
    const [customInput, setCustomInput] = useState('');
    const searchRef = useRef<HTMLInputElement>(null);

    const currentKey = currentRepo
        ? `${currentRepo.owner}/${currentRepo.repo}`
        : null;

    // Focus search input when popover opens
    useEffect(() => {
        if (open) {
            // Small delay to let the popover render
            const t = setTimeout(() => searchRef.current?.focus(), 50);
            return () => clearTimeout(t);
        } else {
            // Reset state when closing
            setSearch('');
            setShowCustomInput(false);
            setCustomInput('');
        }
    }, [open]);

    const handleSelect = useCallback(
        (owner: string, repo: string) => {
            postMessage('switchRepo', { owner, repo });
            setOpen(false);
        },
        [],
    );

    const handleCustomSubmit = useCallback(() => {
        const trimmed = customInput.trim();
        const match = trimmed.match(/^([^/\s]+)\/([^/\s]+)$/);
        if (match) {
            postMessage('switchRepo', { owner: match[1], repo: match[2] });
            setCustomInput('');
            setShowCustomInput(false);
            setOpen(false);
        }
    }, [customInput]);

    const handleCustomKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleCustomSubmit();
            }
            if (e.key === 'Escape') {
                setShowCustomInput(false);
                setCustomInput('');
            }
        },
        [handleCustomSubmit],
    );

    // Build filtered groups: merge pre-fetched repoGroups with local git remotes
    const filteredGroups = useMemo(() => {
        const lowerSearch = search.toLowerCase();

        if (repoGroups.length > 0) {
            // Filter repos within each group by search term
            const filtered = repoGroups
                .map((group) => ({
                    ...group,
                    repos: group.repos.filter((r) =>
                        r.fullName.toLowerCase().includes(lowerSearch),
                    ),
                }))
                .filter((group) => group.repos.length > 0);
            return filtered;
        }

        // Fallback: group availableRepos by owner
        if (availableRepos.length > 0) {
            const byOwner = new Map<string, { owner: string; repos: { name: string; fullName: string; isPrivate: boolean; remote: string }[] }>();
            for (const r of availableRepos) {
                const key = r.owner.toLowerCase();
                if (!byOwner.has(key)) {
                    byOwner.set(key, { owner: r.owner, repos: [] });
                }
                byOwner.get(key)!.repos.push({
                    name: r.repo,
                    fullName: `${r.owner}/${r.repo}`,
                    isPrivate: false,
                    remote: r.remote,
                });
            }
            return Array.from(byOwner.values())
                .map((g) => ({
                    ...g,
                    avatarUrl: '',
                    repos: g.repos.filter((r) =>
                        r.fullName.toLowerCase().includes(lowerSearch),
                    ),
                }))
                .filter((g) => g.repos.length > 0);
        }

        // If current repo exists but not in any list, show it solo
        if (currentRepo) {
            const fullName = `${currentRepo.owner}/${currentRepo.repo}`;
            if (fullName.toLowerCase().includes(lowerSearch)) {
                return [{
                    owner: currentRepo.owner,
                    avatarUrl: '',
                    repos: [{ name: currentRepo.repo, fullName, isPrivate: false }],
                }];
            }
        }

        return [];
    }, [repoGroups, availableRepos, currentRepo, search]);

    // Only show the switcher when there's repo context available
    const hasContext = currentRepo || availableRepos.length > 0;
    if (!hasContext) {
        return null;
    }

    const triggerLabel = currentKey ?? 'No repo';

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
                render={
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 gap-1 px-2 text-[11px] font-normal text-fg/60 hover:text-fg/90 max-w-[200px]"
                    >
                        <GitBranch size={12} className="shrink-0" />
                        <span className="truncate">{triggerLabel}</span>
                        <ChevronDown size={10} className="shrink-0 opacity-50" />
                    </Button>
                }
            />
            <PopoverContent
                align="end"
                sideOffset={4}
                className="w-[280px] p-0 gap-0"
            >
                {/* Search input */}
                <div className="p-2 pb-0">
                    <Input
                        ref={searchRef}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search repositories…"
                        className="h-7 text-[12px]"
                    />
                </div>

                {/* Grouped repo list */}
                <ScrollArea className="max-h-[300px] overflow-y-auto">
                    <div className="p-1">
                        {repoGroupsLoading && filteredGroups.length === 0 && (
                            <div className="flex items-center justify-center gap-2 py-4 text-[12px] text-[var(--vscode-descriptionForeground)]">
                                <Loader2 size={14} className="animate-spin" />
                                <span>Loading repos…</span>
                            </div>
                        )}

                        {!repoGroupsLoading && filteredGroups.length === 0 && search && (
                            <div className="py-4 text-center text-[12px] text-[var(--vscode-descriptionForeground)]">
                                No repositories match &ldquo;{search}&rdquo;
                            </div>
                        )}

                        {filteredGroups.map((group, gi) => (
                            <div key={group.owner}>
                                {gi > 0 && <Separator className="my-1" />}
                                {/* Owner header */}
                                <div className="flex items-center gap-1.5 px-2 py-1">
                                    {group.avatarUrl ? (
                                        <img
                                            src={group.avatarUrl}
                                            alt={group.owner}
                                            className="w-4 h-4 rounded-full"
                                        />
                                    ) : (
                                        <div className="w-4 h-4 rounded-full bg-[var(--vscode-badge-background)] flex items-center justify-center text-[8px] font-bold text-[var(--vscode-badge-foreground)]">
                                            {group.owner.charAt(0).toUpperCase()}
                                        </div>
                                    )}
                                    <span className="text-[11px] font-medium text-[var(--vscode-descriptionForeground)]">
                                        {group.owner}
                                    </span>
                                </div>
                                {/* Repo items */}
                                {group.repos.map((r) => {
                                    const [owner, repo] = r.fullName.split('/');
                                    const isActive =
                                        currentRepo &&
                                        owner.toLowerCase() === currentRepo.owner.toLowerCase() &&
                                        repo.toLowerCase() === currentRepo.repo.toLowerCase();
                                    return (
                                        <button
                                            key={r.fullName}
                                            className="flex items-center gap-2 w-full px-2 py-1 rounded text-left text-[12px] hover:bg-[var(--vscode-list-hoverBackground)] cursor-pointer"
                                            onClick={() => handleSelect(owner, repo)}
                                        >
                                            {isActive ? (
                                                <Check size={12} className="shrink-0 text-[var(--vscode-focusBorder)]" />
                                            ) : (
                                                <div className="w-3 shrink-0" />
                                            )}
                                            <span className="truncate font-medium">{r.name}</span>
                                            {r.isPrivate && (
                                                <Lock size={10} className="shrink-0 text-fg/40" />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </ScrollArea>

                {/* Custom repo input section */}
                <Separator />
                {showCustomInput ? (
                    <div className="p-2">
                        <Input
                            value={customInput}
                            onChange={(e) => setCustomInput(e.target.value)}
                            onKeyDown={handleCustomKeyDown}
                            placeholder="owner/repo"
                            className="h-6 text-[11px]"
                            autoFocus
                        />
                        <div className="mt-1 flex gap-1">
                            <Button
                                variant="default"
                                size="sm"
                                className="h-5 text-[10px] px-2 flex-1"
                                onClick={handleCustomSubmit}
                                disabled={!customInput.trim().match(/^[^/\s]+\/[^/\s]+$/)}
                            >
                                Switch
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 text-[10px] px-2"
                                onClick={() => {
                                    setShowCustomInput(false);
                                    setCustomInput('');
                                }}
                            >
                                Cancel
                            </Button>
                        </div>
                    </div>
                ) : (
                    <button
                        className="flex items-center gap-2 w-full px-3 py-2 text-[12px] hover:bg-[var(--vscode-list-hoverBackground)] cursor-pointer"
                        onClick={() => setShowCustomInput(true)}
                    >
                        <Globe size={12} className="shrink-0 text-fg/50" />
                        <span>Other repository…</span>
                    </button>
                )}
            </PopoverContent>
        </Popover>
    );
};
