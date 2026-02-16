import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useMattermostStore, type MattermostChannelData } from '../mattermostStore';
import { postMessage } from '../vscode';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from './ui/select';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Collapsible, CollapsibleContent } from './ui/collapsible';
import {
    Globe,
    Lock,
    Search,
    RefreshCw,
    ChevronDown,
    ChevronRight,
    MessageCircle,
    Users,
    Plus,
    X,
    Circle,
    CheckCheck,
    Star,
} from 'lucide-react';
import { useRovingTabIndex } from '../hooks/useRovingTabIndex';

function ChannelIcon({ type, size = 14 }: { type: string; size?: number }) {
    switch (type) {
        case 'O':
            return <Globe size={size} className="text-fg/50 shrink-0" />;
        case 'P':
            return <Lock size={size} className="text-yellow-400 shrink-0" />;
        case 'D':
            return <MessageCircle size={size} className="text-blue-400 shrink-0" />;
        case 'G':
            return <Users size={size} className="text-purple-400 shrink-0" />;
        default:
            return <Globe size={size} className="text-fg/50 shrink-0" />;
    }
}

/** Small coloured status dot */
function StatusDot({ status, size = 8 }: { status?: string; size?: number }) {
    const color = (() => {
        switch (status) {
            case 'online':  return '#22c55e'; // green
            case 'away':    return '#f59e0b'; // amber
            case 'dnd':     return '#ef4444'; // red
            default:        return 'transparent';
        }
    })();
    if (!status || status === 'offline') {
        return (
            <Circle
                size={size}
                className="shrink-0 text-fg/30"
                strokeWidth={2}
            />
        );
    }
    return (
        <Circle
            size={size}
            className="shrink-0"
            fill={color}
            stroke={color}
            strokeWidth={0}
        />
    );
}

function UnreadBadge({ count, mentions }: { count: number; mentions: number }) {
    if (count <= 0 && mentions <= 0) { return null; }
    if (mentions > 0) {
        return (
            <span className="ml-auto shrink-0 bg-[var(--vscode-notificationsErrorIcon-foreground,#f14c4c)] text-white text-[10px] font-bold leading-none rounded-full px-1.5 py-0.5 min-w-4 text-center">
                {mentions}
            </span>
        );
    }
    return (
        <span className="ml-auto shrink-0 w-2 h-2 rounded-full bg-[var(--vscode-notificationsInfoIcon-foreground,#3794ff)]" />
    );
}

function formatLastPost(iso: string): string {
    if (!iso) { return ''; }
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) { return 'just now'; }
    if (diffMins < 60) { return `${diffMins}m ago`; }
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) { return `${diffHours}h ago`; }
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) { return `${diffDays}d ago`; }
    return date.toLocaleDateString();
}

/** Collapsible section header */
function SectionHeader({
    title,
    isOpen,
    onToggle,
    action,
}: {
    title: string;
    isOpen: boolean;
    onToggle: () => void;
    action?: React.ReactNode;
}) {
    return (
        <div className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg/50 select-none">
            <Button variant="ghost" size="sm" onClick={onToggle} className="flex items-center gap-1 h-auto px-0 py-0 text-[11px] font-semibold uppercase tracking-wider text-fg/50 hover:text-fg/80">
                {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                {title}
            </Button>
            {action && <div className="ml-auto">{action}</div>}
        </div>
    );
}

/** New DM dialog — searches users and starts a DM */
function NewDmDialog({ onClose }: { onClose: () => void }) {
    const [searchTerm, setSearchTerm] = useState('');
    const userSearchResults = useMattermostStore((s) => s.userSearchResults);
    const isSearchingUsers = useMattermostStore((s) => s.isSearchingUsers);
    const clearUserSearchResults = useMattermostStore((s) => s.clearUserSearchResults);
    const setIsSearchingUsers = useMattermostStore((s) => s.setIsSearchingUsers);

    const handleSearch = useCallback((term: string) => {
        setSearchTerm(term);
        if (term.trim().length >= 2) {
            setIsSearchingUsers(true);
            postMessage('mattermost.searchUsers', { term: term.trim() });
        } else {
            clearUserSearchResults();
        }
    }, [clearUserSearchResults, setIsSearchingUsers]);

    const handleSelectUser = useCallback((userId: string) => {
        postMessage('mattermost.createDM', { targetUserId: userId });
        clearUserSearchResults();
        onClose();
    }, [clearUserSearchResults, onClose]);

    return (
        <div className="px-3 py-2 border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-input-background)]">
            <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium text-fg/70">New Direct Message</span>
                <Button variant="ghost" size="icon-xs" onClick={onClose} className="ml-auto">
                    <X size={12} />
                </Button>
            </div>
            <Input
                type="text"
                placeholder="Search users…"
                autoFocus
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
            />
            {isSearchingUsers && (
                <div className="mt-1 text-xs text-fg/50 px-1">Searching…</div>
            )}
            {!isSearchingUsers && userSearchResults.length > 0 && (
                <div className="mt-1 max-h-40 overflow-y-auto">
                    {userSearchResults.map((u) => (
                        <Button
                            key={u.id}
                            variant="ghost"
                            onClick={() => handleSelectUser(u.id)}
                            className="w-full justify-start h-auto px-2 py-1.5 text-sm rounded flex items-center gap-2"
                        >
                            <MessageCircle size={12} className="text-blue-400 shrink-0" />
                            <span className="font-medium">{u.username}</span>
                            {(u.firstName || u.lastName) && (
                                <span className="text-fg/50 text-xs truncate">
                                    {u.firstName} {u.lastName}
                                </span>
                            )}
                        </Button>
                    ))}
                </div>
            )}
        </div>
    );
}

export const MattermostChannelList: React.FC = () => {
    const teams = useMattermostStore((s) => s.teams);
    const allChannels = useMattermostStore((s) => s.channels);
    const allDmChannels = useMattermostStore((s) => s.dmChannels);
    const isConfigured = useMattermostStore((s) => s.isConfigured);
    const isLoadingChannels = useMattermostStore((s) => s.isLoadingChannels);
    const selectedTeamId = useMattermostStore((s) => s.selectedTeamId);
    const selectedChannelId = useMattermostStore((s) => s.selectedChannelId);
    const selectTeam = useMattermostStore((s) => s.selectTeam);
    const selectChannel = useMattermostStore((s) => s.selectChannel);
    const searchQuery = useMattermostStore((s) => s.searchQuery);
    const setSearchQuery = useMattermostStore((s) => s.setSearchQuery);
    const unreads = useMattermostStore((s) => s.unreads);
    const userStatuses = useMattermostStore((s) => s.userStatuses);
    const favoriteChannelIds = useMattermostStore((s) => s.favoriteChannelIds);
    const toggleFavoriteChannel = useMattermostStore((s) => s.toggleFavoriteChannel);

    const [favoritesOpen, setFavoritesOpen] = useState(true);
    const [publicOpen, setPublicOpen] = useState(true);
    const [privateOpen, setPrivateOpen] = useState(true);
    const [dmsOpen, setDmsOpen] = useState(true);
    const [showNewDm, setShowNewDm] = useState(false);

    const channels = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) { return allChannels; }
        return allChannels.filter(
            (c) =>
                c.displayName.toLowerCase().includes(q) ||
                c.name.toLowerCase().includes(q),
        );
    }, [allChannels, searchQuery]);

    // Split channels into favorites, public, and private
    const favoriteChannels = useMemo(() => {
        return [...channels, ...allDmChannels].filter(
            (c) => favoriteChannelIds.has(c.id),
        );
    }, [channels, allDmChannels, favoriteChannelIds]);

    const publicChannels = useMemo(() => {
        return channels.filter((c) => c.type === 'O' && !favoriteChannelIds.has(c.id));
    }, [channels, favoriteChannelIds]);

    const privateChannels = useMemo(() => {
        return channels.filter((c) => c.type === 'P' && !favoriteChannelIds.has(c.id));
    }, [channels, favoriteChannelIds]);

    const dmChannels = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        let dms = allDmChannels;
        if (q) {
            dms = dms.filter(
                (c) =>
                    c.displayName.toLowerCase().includes(q) ||
                    c.name.toLowerCase().includes(q),
            );
        }
        return dms.filter((c) => !favoriteChannelIds.has(c.id));
    }, [allDmChannels, searchQuery, favoriteChannelIds]);

    const selectedTeam = useMemo(
        () => teams.find((t) => t.id === selectedTeamId),
        [teams, selectedTeamId],
    );

    // Flatten all visible (open-section) channels for keyboard navigation (§7e)
    const visibleChannels = useMemo(() => {
        const list: MattermostChannelData[] = [];
        if (favoritesOpen) list.push(...favoriteChannels);
        if (publicOpen) list.push(...publicChannels);
        if (privateOpen) list.push(...privateChannels);
        if (dmsOpen) list.push(...dmChannels);
        return list;
    }, [favoritesOpen, publicOpen, privateOpen, dmsOpen, favoriteChannels, publicChannels, privateChannels, dmChannels]);

    const channelSearchRef = useRef<HTMLInputElement>(null);

    const handleTeamSelect = useCallback(
        (teamId: string) => {
            selectTeam(teamId);
            postMessage('mattermost.getAllChannels', { teamId });
        },
        [selectTeam],
    );

    const handleChannelSelect = useCallback(
        (channel: MattermostChannelData) => {
            selectChannel(channel.id, channel.displayName);
            postMessage('mattermost.getPosts', { channelId: channel.id });
            postMessage('mattermost.markRead', { channelId: channel.id });
        },
        [selectChannel],
    );

    const onChannelSelect = useCallback(
        (index: number) => {
            const ch = visibleChannels[index];
            if (ch) handleChannelSelect(ch);
        },
        [visibleChannels, handleChannelSelect],
    );
    const { listRef: channelListRef, containerProps: channelContainerProps, getItemProps: getChannelItemProps, handleSearchKeyDown: rovingChannelSearchKeyDown } =
        useRovingTabIndex({ itemCount: visibleChannels.length, onSelect: onChannelSelect, searchRef: channelSearchRef });

    const handleRefresh = useCallback(() => {
        if (selectedTeamId) {
            postMessage('mattermost.getAllChannels', { teamId: selectedTeamId });
        } else {
            postMessage('mattermost.refresh');
        }
    }, [selectedTeamId]);

    const handleMarkChannelRead = useCallback((channelId: string) => {
        postMessage('mattermost.markRead', { channelId });
    }, []);

    const handleSetStatus = useCallback((status: string) => {
        postMessage('mattermost.setOwnStatus', { status });
    }, []);

    const handleSignInWithPassword = useCallback(() => {
        postMessage('mattermost.signInWithPassword');
    }, []);

    const handleSignInWithToken = useCallback(() => {
        postMessage('mattermost.signInWithToken');
    }, []);

    const handleSignInWithSessionToken = useCallback(() => {
        postMessage('mattermost.signInWithSessionToken');
    }, []);

    // Render a single channel row (flatIdx is the index within visibleChannels for keyboard nav)
    const renderChannel = (channel: MattermostChannelData, _sectionIdx: number, flatIdx: number) => {
        const unread = unreads[channel.id];
        const hasUnread = unread && (unread.msgCount > 0 || unread.mentionCount > 0);
        const isDm = channel.type === 'D';
        const dmStatus = isDm && channel.otherUserId ? userStatuses[channel.otherUserId] : undefined;
        const isFav = favoriteChannelIds.has(channel.id);
        return (
            <div key={channel.id} className="group/ch flex items-center" {...getChannelItemProps(flatIdx)}>
                <Button
                    variant="ghost"
                    onClick={() => handleChannelSelect(channel)}
                    className={`flex flex-1 justify-start text-left h-auto px-3 py-2 rounded-none gap-2 ${
                        selectedChannelId === channel.id
                            ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]'
                            : ''
                    } ${hasUnread ? 'font-semibold' : ''}`}
                >
                    {isDm ? (
                        <StatusDot status={dmStatus} size={10} />
                    ) : (
                        <ChannelIcon type={channel.type} size={14} />
                    )}
                    <span className="text-sm truncate flex-1">
                        {channel.displayName}
                    </span>
                    {unread && (
                        <UnreadBadge count={unread.msgCount} mentions={unread.mentionCount} />
                    )}
                </Button>
                <div className="flex items-center opacity-0 group-hover/ch:opacity-100 transition-opacity mr-1 shrink-0">
                    <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={(e) => { e.stopPropagation(); toggleFavoriteChannel(channel.id); }}
                        title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                    >
                        <Star size={12} className={isFav ? 'text-yellow-400 fill-yellow-400' : ''} />
                    </Button>
                    {hasUnread && (
                        <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={(e) => { e.stopPropagation(); handleMarkChannelRead(channel.id); }}
                            title="Mark as read"
                        >
                            <CheckCheck size={12} />
                        </Button>
                    )}
                </div>
            </div>
        );
    };

    // Not configured state
    if (!isConfigured) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4 p-6 text-center">
                <div className="text-fg/40 mb-1">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                </div>
                <p className="text-sm text-fg/60">
                    Sign in to Mattermost to view your channels.
                </p>
                <div className="flex flex-col gap-2 w-full max-w-55">
                    <Button
                        onClick={handleSignInWithPassword}
                    >
                        Sign In with Password
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={handleSignInWithSessionToken}
                    >
                        Use Session Token
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={handleSignInWithToken}
                    >
                        Use Access Token
                    </Button>
                </div>
                <p className="text-xs text-fg/40 mt-1">
                    Supports MFA/2FA. Access tokens require admin setup.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Team selector + status */}
            <div className="flex items-center gap-2 p-3 border-b border-[var(--vscode-panel-border)]">
                {teams.length > 1 ? (
                    <Select value={selectedTeamId ?? ''} onValueChange={(v) => { if (v) handleTeamSelect(v); }}>
                        <SelectTrigger className="flex-1 h-8 text-sm">
                            <SelectValue placeholder="Select team" />
                        </SelectTrigger>
                        <SelectContent>
                            {teams.map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                    {t.displayName}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ) : selectedTeam ? (
                    <span className="flex-1 text-sm font-medium truncate">
                        {selectedTeam.displayName}
                    </span>
                ) : null}

                {/* Set status dropdown */}
                <DropdownMenu>
                    <DropdownMenuTrigger render={
                        <Button variant="ghost" size="icon-xs" title="Set status">
                            <Circle size={14} fill="#6b7280" stroke="#6b7280" />
                        </Button>
                    } />
                    <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => handleSetStatus('online')}>
                            <Circle size={10} fill="#22c55e" stroke="#22c55e" className="mr-2" />
                            Online
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleSetStatus('away')}>
                            <Circle size={10} fill="#f59e0b" stroke="#f59e0b" className="mr-2" />
                            Away
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleSetStatus('dnd')}>
                            <Circle size={10} fill="#ef4444" stroke="#ef4444" className="mr-2" />
                            Do Not Disturb
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleSetStatus('offline')}>
                            <Circle size={10} className="mr-2 text-fg/30" strokeWidth={2} />
                            Offline
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={handleRefresh}
                    title="Refresh"
                >
                    <RefreshCw size={14} className={isLoadingChannels ? 'animate-spin' : ''} />
                </Button>
            </div>

            {/* Search */}
            <div className="px-3 py-2 border-b border-[var(--vscode-panel-border)]">
                <div className="relative">
                    <Search
                        size={14}
                        className="absolute left-2 top-1/2 -translate-y-1/2 text-fg/40"
                    />
                    <Input
                        type="text"
                        placeholder="Search channels…"
                        ref={channelSearchRef}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={rovingChannelSearchKeyDown}
                        className="pl-7"
                    />
                </div>
            </div>

            {/* New DM dialog */}
            {showNewDm && <NewDmDialog onClose={() => setShowNewDm(false)} />}

            {/* Channel list with sections */}
            <div ref={channelListRef} className="flex-1 overflow-y-auto" {...channelContainerProps} aria-label="Channels list">
                {isLoadingChannels ? (
                    <div className="flex items-center justify-center h-24 text-sm text-fg/50">
                        Loading channels…
                    </div>
                ) : (
                    (() => {
                        // Compute flat offsets matching visibleChannels ordering
                        let offset = 0;
                        const favOffset = offset;
                        if (favoritesOpen) offset += favoriteChannels.length;
                        const pubOffset = offset;
                        if (publicOpen) offset += publicChannels.length;
                        const privOffset = offset;
                        if (privateOpen) offset += privateChannels.length;
                        const dmOffset = offset;

                        return (
                            <>
                                {/* Favorites section */}
                                {favoriteChannels.length > 0 && (
                                    <Collapsible open={favoritesOpen} onOpenChange={setFavoritesOpen}>
                                        <SectionHeader
                                            title="Favorites"
                                            isOpen={favoritesOpen}
                                            onToggle={() => setFavoritesOpen((v) => !v)}
                                        />
                                        <CollapsibleContent>
                                            {favoriteChannels.map((ch, i) => renderChannel(ch, i, favOffset + i))}
                                        </CollapsibleContent>
                                    </Collapsible>
                                )}

                                {/* Public Channels section */}
                                <Collapsible open={publicOpen} onOpenChange={setPublicOpen}>
                                    <SectionHeader
                                        title="Public Channels"
                                        isOpen={publicOpen}
                                        onToggle={() => setPublicOpen((v) => !v)}
                                    />
                                    <CollapsibleContent>
                                        {publicChannels.length === 0 ? (
                                            <div className="px-3 py-2 text-xs text-fg/40">
                                                {searchQuery ? 'No matching channels' : 'No public channels'}
                                            </div>
                                        ) : (
                                            publicChannels.map((ch, i) => renderChannel(ch, i, pubOffset + i))
                                        )}
                                    </CollapsibleContent>
                                </Collapsible>

                                {/* Private Channels section */}
                                {privateChannels.length > 0 && (
                                    <Collapsible open={privateOpen} onOpenChange={setPrivateOpen}>
                                        <SectionHeader
                                            title="Private Channels"
                                            isOpen={privateOpen}
                                            onToggle={() => setPrivateOpen((v) => !v)}
                                        />
                                        <CollapsibleContent>
                                            {privateChannels.map((ch, i) => renderChannel(ch, i, privOffset + i))}
                                        </CollapsibleContent>
                                    </Collapsible>
                                )}

                                {/* Direct Messages section */}
                                <Collapsible open={dmsOpen} onOpenChange={setDmsOpen}>
                                    <SectionHeader
                                        title="Direct Messages"
                                        isOpen={dmsOpen}
                                        onToggle={() => setDmsOpen((v) => !v)}
                                        action={
                                            <Button
                                                variant="ghost"
                                                size="icon-xs"
                                                onClick={(e) => { e.stopPropagation(); setShowNewDm(true); }}
                                                title="New Direct Message"
                                            >
                                                <Plus size={12} />
                                            </Button>
                                        }
                                    />
                                    <CollapsibleContent>
                                        {dmChannels.length === 0 ? (
                                            <div className="px-3 py-2 text-xs text-fg/40">
                                                {searchQuery ? 'No matching DMs' : 'No direct messages'}
                                            </div>
                                        ) : (
                                            dmChannels.map((ch, i) => renderChannel(ch, i, dmOffset + i))
                                        )}
                                    </CollapsibleContent>
                                </Collapsible>
                            </>
                        );
                    })()
                )}
            </div>
        </div>
    );
};
