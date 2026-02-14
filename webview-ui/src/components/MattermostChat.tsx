import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useMattermostStore, type MattermostPostData, type MattermostChannelData } from '../mattermostStore';
import { postMessage } from '../vscode';
import { EmojiPickerButton, ComposeEmojiPickerButton } from './EmojiPicker';
import { useEmojiAutocomplete, EmojiAutocompleteDropdown } from './useEmojiAutocomplete';
import { MarkdownBody } from './MarkdownBody';
import { ReactionBar } from './ReactionBar';
import { FileAttachments } from './FileAttachments';
import { LinkPreview } from './LinkPreview';
import {
    InputGroup,
    InputGroupTextarea,
    InputGroupAddon,
} from './ui/input-group';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from './ui/alert-dialog';
import {
    Send,
    ArrowLeft,
    RefreshCw,
    ChevronUp,
    ChevronDown,
    ChevronRight,
    Copy,
    Check,
    MessageSquare,
    WifiOff,
    X,
    ExternalLink,
    Pencil,
    Trash2,
    Pin,
    PinOff,
    Bookmark,
    BookmarkCheck,
    Search,
    Info,
    Paperclip,
    Loader2,
    Eye,
    LogIn,
    LogOut,
    UserPlus,
    UserMinus,
    Settings,
    ArrowRightLeft,
    AlertTriangle,
    RotateCcw,
} from 'lucide-react';

function formatTime(iso: string): string {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    const timeStr = date.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
    });

    if (diffDays === 0) { return timeStr; }
    if (diffDays === 1) { return `Yesterday ${timeStr}`; }
    if (diffDays < 7) { return `${date.toLocaleDateString(undefined, { weekday: 'short' })} ${timeStr}`; }
    return `${date.toLocaleDateString()} ${timeStr}`;
}

/** Small coloured status dot for message avatars */
function StatusDot({ userId }: { userId: string }) {
    const status = useMattermostStore((s) => s.userStatuses[userId]);
    const color = (() => {
        switch (status) {
            case 'online':  return '#22c55e';
            case 'away':    return '#f59e0b';
            case 'dnd':     return '#ef4444';
            default:        return undefined;
        }
    })();
    if (!color) { return null; }
    return (
        <span
            className="absolute bottom-px right-px w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: color, boxShadow: '0 0 0 1.5px var(--vscode-editor-background)' }}
        />
    );
}

/** Group posts by date for visual separation */
function groupPostsByDate(posts: MattermostPostData[]): { date: string; posts: MattermostPostData[] }[] {
    const groups: { date: string; posts: MattermostPostData[] }[] = [];
    let currentDate = '';

    // Posts come newest-first, we want to display oldest-first
    const chronological = [...posts].reverse();

    for (const post of chronological) {
        const postDate = new Date(post.createAt).toLocaleDateString();
        if (postDate !== currentDate) {
            currentDate = postDate;
            groups.push({ date: postDate, posts: [] });
        }
        groups[groups.length - 1].posts.push(post);
    }

    return groups;
}

// ─── User Avatar ──────────────────────────────────────────────────

/** Renders a real profile image or a letter-initial fallback */
const UserAvatar: React.FC<{
    userId: string;
    username: string;
    isOwn?: boolean;
    size?: number;
    onClick?: () => void;
}> = ({ userId, username, isOwn, size = 8, onClick }) => {
    const avatarUrl = useMattermostStore((s) => s.userAvatars[userId]);
    const sizeClass = `w-${size} h-${size}`;

    if (avatarUrl) {
        return (
            <img
                src={avatarUrl}
                alt={username}
                className={`${sizeClass} rounded-full object-cover cursor-pointer`}
                onClick={onClick}
                title={`View profile: ${username}`}
            />
        );
    }
    return (
        <div
            className={`${sizeClass} rounded-full flex items-center justify-center text-xs font-bold cursor-pointer ${
                isOwn
                    ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
                    : 'bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]'
            }`}
            onClick={onClick}
            title={`View profile: ${username}`}
        >
            {username.charAt(0).toUpperCase()}
        </div>
    );
};

// ─── System Message ───────────────────────────────────────────────

/** System messages (join, leave, header change, etc.) with icon + italic styling */
const SystemMessage: React.FC<{ post: MattermostPostData }> = ({ post }) => {
    const iconMap: Record<string, React.ReactNode> = {
        'system_join_channel': <LogIn size={12} className="text-green-400" />,
        'system_add_to_channel': <UserPlus size={12} className="text-green-400" />,
        'system_leave_channel': <LogOut size={12} className="text-red-400" />,
        'system_remove_from_channel': <UserMinus size={12} className="text-red-400" />,
        'system_header_change': <Settings size={12} className="text-fg/40" />,
        'system_purpose_change': <Settings size={12} className="text-fg/40" />,
        'system_displayname_change': <ArrowRightLeft size={12} className="text-fg/40" />,
    };

    const icon = iconMap[post.type] ?? <Info size={12} className="text-fg/30" />;

    return (
        <div className="flex items-center justify-center gap-2 py-1.5 px-4">
            <div className="flex items-center gap-1.5 text-xs text-fg/40 italic">
                {icon}
                <span>{post.message}</span>
            </div>
        </div>
    );
};

// ─── Inline Edit Form ─────────────────────────────────────────────

const InlineEditForm: React.FC<{
    postId: string;
    initialMessage: string;
    onCancel: () => void;
}> = ({ postId, initialMessage, onCancel }) => {
    const [editText, setEditText] = useState(initialMessage);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        textareaRef.current?.focus();
        if (textareaRef.current) {
            textareaRef.current.selectionStart = textareaRef.current.value.length;
        }
    }, []);

    const handleSave = useCallback(() => {
        const text = editText.trim();
        if (!text) { return; }
        postMessage('mattermost.editPost', { postId, message: text });
        onCancel();
    }, [editText, postId, onCancel]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSave();
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
        }
    }, [handleSave, onCancel]);

    return (
        <div className="mt-1 flex flex-col gap-1">
            <InputGroup>
                <InputGroupTextarea
                    ref={textareaRef}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={2}
                    className="text-sm"
                />
            </InputGroup>
            <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={onCancel} className="h-6 text-xs">
                    Cancel
                </Button>
                <Button size="sm" onClick={handleSave} disabled={!editText.trim()} className="h-6 text-xs">
                    Save
                </Button>
                <span className="text-[10px] text-fg/40 ml-1">Enter to save, Esc to cancel</span>
            </div>
        </div>
    );
};

// ─── Channel Info Panel ───────────────────────────────────────────

const ChannelInfoPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const selectedChannelId = useMattermostStore((s) => s.selectedChannelId);
    const channels = useMattermostStore((s) => s.channels);
    const dmChannels = useMattermostStore((s) => s.dmChannels);
    const [channelInfo, setChannelInfo] = useState<MattermostChannelData | null>(null);

    const localInfo = useMemo(() => {
        return [...channels, ...dmChannels].find((c) => c.id === selectedChannelId) ?? null;
    }, [channels, dmChannels, selectedChannelId]);

    useEffect(() => {
        if (!selectedChannelId) { return; }
        postMessage('mattermost.getChannelInfo', { channelId: selectedChannelId });

        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail as MattermostChannelData;
            if (detail.id === selectedChannelId) {
                setChannelInfo(detail);
            }
        };
        window.addEventListener('mattermost-channel-info', handler);
        return () => window.removeEventListener('mattermost-channel-info', handler);
    }, [selectedChannelId]);

    const info = channelInfo ?? localInfo;
    if (!info) { return null; }

    return (
        <div className="border-b border-[var(--vscode-panel-border)] px-3 py-2 bg-[var(--vscode-editor-background)]">
            <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-fg/70">Channel Info</span>
                <Button variant="ghost" size="icon-xs" onClick={onClose} title="Close">
                    <X size={12} />
                </Button>
            </div>
            {info.header && (
                <div className="text-xs text-fg/60 mb-1">
                    <span className="font-medium text-fg/50">Header: </span>
                    <MarkdownBody content={info.header} />
                </div>
            )}
            {info.purpose && (
                <div className="text-xs text-fg/60">
                    <span className="font-medium text-fg/50">Purpose: </span>
                    {info.purpose}
                </div>
            )}
            {!info.header && !info.purpose && (
                <div className="text-xs text-fg/40 italic">No header or purpose set</div>
            )}
        </div>
    );
};

// ─── User Profile Popover ─────────────────────────────────────────

interface UserProfileData {
    user: { id: string; username: string; email: string; firstName: string; lastName: string; nickname: string };
    avatarUrl?: string;
}

const UserProfilePopover: React.FC<{
    userId: string;
    onClose: () => void;
    onStartDM: (userId: string) => void;
}> = ({ userId, onClose, onStartDM }) => {
    const [profile, setProfile] = useState<UserProfileData | null>(null);
    const userStatuses = useMattermostStore((s) => s.userStatuses);

    useEffect(() => {
        postMessage('mattermost.getUserProfile', { userId });

        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail as UserProfileData;
            if (detail.user.id === userId) {
                setProfile(detail);
            }
        };
        window.addEventListener('mattermost-user-profile', handler);
        return () => window.removeEventListener('mattermost-user-profile', handler);
    }, [userId]);

    const status = userStatuses[userId];
    const statusLabel = status === 'dnd' ? 'Do Not Disturb' : status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Offline';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
            <div
                className="bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] rounded-lg shadow-lg p-4 w-72"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center gap-3 mb-3">
                    {profile?.avatarUrl ? (
                        <img src={profile.avatarUrl} alt="" className="w-12 h-12 rounded-full" />
                    ) : (
                        <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]">
                            {profile?.user.username.charAt(0).toUpperCase() ?? '?'}
                        </div>
                    )}
                    <div>
                        <div className="font-semibold text-sm">
                            {profile?.user.firstName && profile?.user.lastName
                                ? `${profile.user.firstName} ${profile.user.lastName}`
                                : profile?.user.username ?? 'Loading…'}
                        </div>
                        <div className="text-xs text-fg/50">@{profile?.user.username ?? '…'}</div>
                        {profile?.user.nickname && (
                            <div className="text-xs text-fg/40">"{profile.user.nickname}"</div>
                        )}
                    </div>
                </div>
                <div className="text-xs text-fg/60 mb-3 flex items-center gap-1.5">
                    <span
                        className="w-2 h-2 rounded-full inline-block"
                        style={{
                            backgroundColor: status === 'online' ? '#22c55e' : status === 'away' ? '#f59e0b' : status === 'dnd' ? '#ef4444' : '#6b7280',
                        }}
                    />
                    {statusLabel}
                </div>
                <div className="flex gap-2">
                    <Button size="sm" onClick={() => { onStartDM(userId); onClose(); }} className="flex-1">
                        <MessageSquare size={12} className="mr-1" />
                        Message
                    </Button>
                    <Button variant="ghost" size="sm" onClick={onClose}>
                        Close
                    </Button>
                </div>
            </div>
        </div>
    );
};

// ─── Message Search Panel ─────────────────────────────────────────

const MessageSearchPanel: React.FC<{
    onClose: () => void;
    currentUsername: string | null;
    currentUserId: string | null;
}> = ({ onClose, currentUsername, currentUserId }) => {
    const selectedTeamId = useMattermostStore((s) => s.selectedTeamId);
    const searchResults = useMattermostStore((s) => s.searchResults);
    const isSearching = useMattermostStore((s) => s.isSearchingMessages);
    const messageSearchQuery = useMattermostStore((s) => s.messageSearchQuery);
    const setMessageSearchQuery = useMattermostStore((s) => s.setMessageSearchQuery);
    const [localQuery, setLocalQuery] = useState(messageSearchQuery);

    const handleSearch = useCallback(() => {
        const q = localQuery.trim();
        if (!q || !selectedTeamId) { return; }
        setMessageSearchQuery(q);
        postMessage('mattermost.searchPosts', { teamId: selectedTeamId, terms: q });
    }, [localQuery, selectedTeamId, setMessageSearchQuery]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSearch();
        }
        if (e.key === 'Escape') { onClose(); }
    }, [handleSearch, onClose]);

    return (
        <div className="border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)]">
            <div className="flex items-center gap-2 px-3 py-2">
                <Search size={14} className="text-fg/40 shrink-0" />
                <Input
                    value={localQuery}
                    onChange={(e) => setLocalQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Search messages… (Enter to search)"
                    autoFocus
                    className="flex-1 h-7 text-sm"
                />
                <Button variant="ghost" size="icon-xs" onClick={onClose} title="Close search">
                    <X size={14} />
                </Button>
            </div>
            {/* Show search results inline below the search bar */}
            {(isSearching || searchResults.length > 0 || messageSearchQuery) && (
                <div className="max-h-60 overflow-y-auto border-t border-[var(--vscode-panel-border)]">
                    {isSearching ? (
                        <div className="flex items-center justify-center h-16 text-xs text-fg/50">
                            Searching…
                        </div>
                    ) : searchResults.length === 0 && messageSearchQuery ? (
                        <div className="flex items-center justify-center h-16 text-xs text-fg/40">
                            No results found
                        </div>
                    ) : (
                        <div className="py-1">
                            <div className="px-3 py-1 text-[10px] text-fg/40 font-medium uppercase tracking-wider">
                                {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
                            </div>
                            {searchResults.map((post) => (
                                <div key={post.id} className="flex gap-2 px-3 py-1.5 hover:bg-[var(--vscode-list-hoverBackground)] text-xs">
                                    <span className="font-semibold text-[var(--vscode-textLink-foreground)] shrink-0">{post.username}</span>
                                    <span className="text-fg/70 truncate flex-1">{post.message}</span>
                                    <span className="text-fg/30 shrink-0">{formatTime(post.createAt)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

/** Individual message bubble */
const MessageBubble: React.FC<{
    post: MattermostPostData;
    currentUsername: string | null;
    currentUserId: string | null;
    onOpenThread: (rootId: string) => void;
    onClickUsername?: (userId: string) => void;
    isThreadReply?: boolean;
}> = ({ post, currentUsername, currentUserId, onOpenThread, onClickUsername, isThreadReply }) => {
    const [copied, setCopied] = useState(false);
    const editingPostId = useMattermostStore((s) => s.editingPostId);
    const startEditing = useMattermostStore((s) => s.startEditing);
    const cancelEditing = useMattermostStore((s) => s.cancelEditing);
    const flaggedPostIds = useMattermostStore((s) => s.flaggedPostIds);

    const isOwn = currentUsername !== null && post.username === currentUsername;
    const isEditing = editingPostId === post.id;
    const isFlagged = flaggedPostIds.has(post.id);
    const isEdited = post.updateAt !== post.createAt;
    const isPending = post._pending === true;
    const isFailed = !!post._failedError;

    const retryPost = useMattermostStore((s) => s.retryPost);
    const discardFailedPost = useMattermostStore((s) => s.discardFailedPost);

    const handleRetry = useCallback(() => {
        if (!post._sendParams) { return; }
        retryPost(post.id);
        postMessage('mattermost.sendPost', { ...post._sendParams, pendingId: post.id });
    }, [post.id, post._sendParams, retryPost]);

    const handleDiscard = useCallback(() => {
        discardFailedPost(post.id);
    }, [post.id, discardFailedPost]);

    const handleCopy = useCallback(() => {
        void navigator.clipboard.writeText(post.message);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    }, [post.message]);

    const handleEdit = useCallback(() => {
        startEditing(post.id, post.message);
    }, [post.id, post.message, startEditing]);

    const handleDelete = useCallback(() => {
        postMessage('mattermost.deletePost', { postId: post.id });
    }, [post.id]);

    const handlePin = useCallback(() => {
        if (post.isPinned) {
            postMessage('mattermost.unpinPost', { postId: post.id });
        } else {
            postMessage('mattermost.pinPost', { postId: post.id });
        }
    }, [post.id, post.isPinned]);

    const handleFlag = useCallback(() => {
        if (isFlagged) {
            postMessage('mattermost.unflagPost', { postId: post.id });
        } else {
            postMessage('mattermost.flagPost', { postId: post.id });
        }
    }, [post.id, isFlagged]);

    const handleUsernameClick = useCallback(() => {
        if (onClickUsername) { onClickUsername(post.userId); }
    }, [post.userId, onClickUsername]);

    // Skip system messages — render with special styling
    if (post.type && post.type !== '') {
        return <SystemMessage post={post} />;
    }

    // Reply detection (used for styling inline thread replies)
    const isReply = post.rootId && post.rootId !== '';

    return (
        <div className={`group flex gap-2 px-3 py-1.5 hover:bg-[var(--vscode-list-hoverBackground)] ${isThreadReply ? 'ml-8 border-l-2 border-[var(--vscode-panel-border)] pl-2' : ''} ${isPending ? 'opacity-50' : ''} ${isFailed ? 'opacity-80' : ''}`}>
            {/* Avatar with status dot */}
            <div className="relative shrink-0 w-8 h-8">
                <UserAvatar userId={post.userId} username={post.username} isOwn={isOwn} onClick={handleUsernameClick} />
                <StatusDot userId={post.userId} />
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span
                        className="text-xs font-semibold text-[var(--vscode-textLink-foreground)] cursor-pointer hover:underline"
                        onClick={handleUsernameClick}
                        title={`View profile: ${post.username}`}
                    >
                        {post.username}
                    </span>
                    <span className="text-xs text-fg/40">{formatTime(post.createAt)}</span>
                    {isPending && (
                        <span className="flex items-center gap-1 text-[10px] text-fg/40">
                            <Loader2 size={10} className="animate-spin" />
                            Sending…
                        </span>
                    )}
                    {isEdited && !isPending && <span className="text-[10px] text-fg/30">(edited)</span>}
                    {post.isPinned && (
                        <span title="Pinned"><Pin size={10} className="text-yellow-500 shrink-0" /></span>
                    )}

                    {/* Action buttons — visible on hover (hidden for pending/failed) */}
                    {!isPending && !isFailed && (
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
                        <Button variant="ghost" size="icon-xs" onClick={handleCopy} title="Copy message">
                            {copied ? <Check size={12} /> : <Copy size={12} />}
                        </Button>
                        <EmojiPickerButton postId={post.id} />
                        {!isReply && (
                            <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={() => onOpenThread(post.id)}
                                title="Reply in thread"
                            >
                                <MessageSquare size={12} />
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={handlePin}
                            title={post.isPinned ? 'Unpin message' : 'Pin message'}
                        >
                            {post.isPinned ? <PinOff size={12} /> : <Pin size={12} />}
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={handleFlag}
                            title={isFlagged ? 'Unsave message' : 'Save message'}
                        >
                            {isFlagged ? <BookmarkCheck size={12} className="text-yellow-500" /> : <Bookmark size={12} />}
                        </Button>
                        {isOwn && (
                            <>
                                <Button variant="ghost" size="icon-xs" onClick={handleEdit} title="Edit message">
                                    <Pencil size={12} />
                                </Button>
                                <AlertDialog>
                                    <AlertDialogTrigger render={
                                        <Button variant="ghost" size="icon-xs" title="Delete message">
                                            <Trash2 size={12} className="text-red-400" />
                                        </Button>
                                    } />
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Delete Message</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                Are you sure you want to delete this message? This cannot be undone.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction variant="destructive" onClick={handleDelete}>Delete</AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </>
                        )}
                    </div>
                    )}
                </div>

                {/* Failed message error bar */}
                {isFailed && (
                    <div className="flex items-center gap-2 mt-1 px-2 py-1 rounded bg-red-500/10 border border-red-500/30 text-xs text-red-500">
                        <AlertTriangle size={12} className="shrink-0" />
                        <span className="flex-1 truncate">{post._failedError}</span>
                        <Button variant="ghost" size="icon-xs" onClick={handleRetry} title="Retry sending">
                            <RotateCcw size={12} />
                        </Button>
                        <Button variant="ghost" size="icon-xs" onClick={handleDiscard} title="Discard message">
                            <X size={12} />
                        </Button>
                    </div>
                )}

                {/* Message body or inline edit form */}
                {isEditing ? (
                    <InlineEditForm
                        postId={post.id}
                        initialMessage={post.message}
                        onCancel={cancelEditing}
                    />
                ) : (
                    <div className="text-sm mt-0.5">
                        <MarkdownBody content={post.message} currentUsername={currentUsername} />
                    </div>
                )}

                {/* File attachments */}
                <FileAttachments files={post.files} />

                {/* Link previews */}
                <LinkPreview previews={post.linkPreviews} />

                {/* Reaction bar */}
                <ReactionBar postId={post.id} currentUserId={currentUserId} />


            </div>
        </div>
    );
};

/** Typing indicator (Slack-style) */
const TypingIndicator: React.FC<{ channelId: string }> = ({ channelId }) => {
    const typingEntries = useMattermostStore((s) => s.typingEntries);
    const currentUser = useMattermostStore((s) => s.currentUser);
    const clearStaleTyping = useMattermostStore((s) => s.clearStaleTyping);

    // Clear stale entries every second
    useEffect(() => {
        const timer = setInterval(clearStaleTyping, 1000);
        return () => clearInterval(timer);
    }, [clearStaleTyping]);

    const typingUsers = useMemo(() => {
        return typingEntries
            .filter((e) => e.channelId === channelId && e.userId !== currentUser?.id)
            .map((e) => e.username || e.userId);
    }, [typingEntries, channelId, currentUser]);

    if (typingUsers.length === 0) { return null; }

    const typingLabel = (() => {
        if (typingUsers.length === 1) { return `${typingUsers[0]} is typing…`; }
        if (typingUsers.length === 2) { return `${typingUsers[0]} and ${typingUsers[1]} are typing…`; }
        return `${typingUsers[0]} and ${typingUsers.length - 1} others are typing…`;
    })();

    return (
        <div className="px-3 py-1 text-xs text-fg/50 flex items-center gap-1.5">
            <span className="flex gap-0.5">
                <span className="w-1.5 h-1.5 bg-fg/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-fg/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-fg/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
            {typingLabel}
        </div>
    );
};

/** Reconnecting banner with attempt count */
const ConnectionBanner: React.FC = () => {
    const isConnected = useMattermostStore((s) => s.isConnected);
    const isConfigured = useMattermostStore((s) => s.isConfigured);
    const reconnectAttempt = useMattermostStore((s) => s.reconnectAttempt);
    if (isConnected || !isConfigured) { return null; }
    return (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500/10 border-b border-yellow-500/30 text-yellow-600 dark:text-yellow-400 text-xs">
            <WifiOff size={12} />
            <span className="flex-1">
                Reconnecting{reconnectAttempt > 1 ? ` (attempt ${reconnectAttempt})` : ''}…
            </span>
            <Loader2 size={12} className="animate-spin" />
        </div>
    );
};

export const MattermostChat: React.FC<{
    onClose: () => void;
}> = ({ onClose }) => {
    const selectedChannelId = useMattermostStore((s) => s.selectedChannelId);
    const selectedChannelName = useMattermostStore((s) => s.selectedChannelName);
    const posts = useMattermostStore((s) => s.posts);
    const isLoadingPosts = useMattermostStore((s) => s.isLoadingPosts);
    const isSendingMessage = useMattermostStore((s) => s.isSendingMessage);
    const hasMorePosts = useMattermostStore((s) => s.hasMorePosts);
    const currentUser = useMattermostStore((s) => s.currentUser);
    const openThread = useMattermostStore((s) => s.openThread);
    const replyToPostId = useMattermostStore((s) => s.replyToPostId);
    const replyToUsername = useMattermostStore((s) => s.replyToUsername);
    const setReplyTo = useMattermostStore((s) => s.setReplyTo);
    const clearReplyTo = useMattermostStore((s) => s.clearReplyTo);
    const showChannelInfo = useMattermostStore((s) => s.showChannelInfo);
    const setShowChannelInfo = useMattermostStore((s) => s.setShowChannelInfo);
    const pendingFileIds = useMattermostStore((s) => s.pendingFileIds);
    const pendingFiles = useMattermostStore((s) => s.pendingFiles);
    const isUploadingFiles = useMattermostStore((s) => s.isUploadingFiles);
    const clearPendingFiles = useMattermostStore((s) => s.clearPendingFiles);
    const lastReadPostIds = useMattermostStore((s) => s.lastReadPostIds);
    const setLastReadPostId = useMattermostStore((s) => s.setLastReadPostId);

    const [messageText, setMessageText] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [profileUserId, setProfileUserId] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const currentUsername = useMemo(
        () => currentUser?.username ?? null,
        [currentUser],
    );
    const currentUserId = useMemo(
        () => currentUser?.id ?? null,
        [currentUser],
    );

    const dateGroups = useMemo(() => groupPostsByDate(posts), [posts]);

    // Track which threads are expanded (default = all collapsed)
    const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());

    const toggleThread = useCallback((rootId: string) => {
        setExpandedThreads((prev) => {
            const next = new Set(prev);
            if (next.has(rootId)) {
                next.delete(rootId);
            } else {
                next.add(rootId);
            }
            return next;
        });
    }, []);

    // Group posts: root posts in order, with their inline replies collected
    const threadedGroups = useMemo(() => {
        return dateGroups.map((group) => {
            const rootPosts: { root: MattermostPostData; replies: MattermostPostData[] }[] = [];
            const replyMap = new Map<string, MattermostPostData[]>();

            // First pass: collect replies by rootId
            for (const post of group.posts) {
                if (post.rootId && post.rootId !== '') {
                    const existing = replyMap.get(post.rootId) ?? [];
                    existing.push(post);
                    replyMap.set(post.rootId, existing);
                }
            }

            // Second pass: build root + replies groups (skip standalone replies whose root is in a different date group)
            for (const post of group.posts) {
                if (!post.rootId || post.rootId === '') {
                    rootPosts.push({
                        root: post,
                        replies: replyMap.get(post.id) ?? [],
                    });
                }
            }

            // Also include orphan replies (root post is in a different date group)
            const usedReplyIds = new Set(rootPosts.flatMap((rp) => rp.replies.map((r) => r.id)));
            for (const post of group.posts) {
                if (post.rootId && post.rootId !== '' && !usedReplyIds.has(post.id)) {
                    // Check if the root is in this group
                    const rootInGroup = group.posts.some((p) => p.id === post.rootId);
                    if (!rootInGroup) {
                        // Show as standalone reply bubble
                        rootPosts.push({ root: post, replies: [] });
                    }
                }
            }

            return { date: group.date, threads: rootPosts };
        });
    }, [dateGroups]);

    // Auto-scroll to bottom when new posts arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [posts]);

    // Track last read post for unread separator
    const lastReadPostId = selectedChannelId ? lastReadPostIds[selectedChannelId] : undefined;

    // When posts arrive, snapshot the oldest NEW post as the read marker (before it gets updated)
    useEffect(() => {
        if (!selectedChannelId || posts.length === 0) { return; }
        // Set the last read post to the newest post when the user views the channel
        // (the first item in the array is newest since posts come newest-first)
        const newestPostId = posts[0].id;
        // Use a timeout to let the separator render before updating the read marker
        const timer = setTimeout(() => {
            setLastReadPostId(selectedChannelId, newestPostId);
        }, 2000);
        return () => clearTimeout(timer);
    }, [selectedChannelId]); // Only on channel switch, not on every new post

    // Auto mark channel as read + fetch flagged posts on channel enter
    useEffect(() => {
        if (selectedChannelId) {
            postMessage('mattermost.markRead', { channelId: selectedChannelId });
            postMessage('mattermost.getFlaggedPosts', {});
        }
    }, [selectedChannelId]);

    const handleOpenThread = useCallback((rootId: string) => {
        openThread(rootId);
        postMessage('mattermost.getThread', { postId: rootId });
    }, [openThread]);

    const handleInsertEmoji = useCallback((shortcode: string) => {
        setMessageText((prev) => prev + shortcode);
        textareaRef.current?.focus();
    }, []);

    const handleClickUsername = useCallback((userId: string) => {
        setProfileUserId(userId);
    }, []);

    const handleStartDM = useCallback((userId: string) => {
        postMessage('mattermost.createDM', { targetUserId: userId });
    }, []);

    // Emoji shortcode autocomplete
    const {
        suggestions: emojiSuggestions,
        selectedIndex: emojiSelectedIndex,
        isOpen: emojiAutocompleteOpen,
        handleKeyDown: emojiKeyDown,
        handleChange: emojiHandleChange,
        acceptSuggestion: emojiAcceptSuggestion,
    } = useEmojiAutocomplete(textareaRef, messageText, setMessageText);

    // Send typing indicator (throttled)
    const sendTypingIndicator = useCallback(() => {
        if (!selectedChannelId) { return; }
        if (typingTimerRef.current) { return; } // Already sent recently
        postMessage('mattermost.sendTyping', { channelId: selectedChannelId });
        typingTimerRef.current = setTimeout(() => {
            typingTimerRef.current = null;
        }, 3000);
    }, [selectedChannelId]);

    const handleSend = useCallback(() => {
        const text = messageText.trim();
        if ((!text && pendingFileIds.length === 0) || !selectedChannelId || !currentUser) { return; }

        // Generate a temporary pending ID
        const pendingId = `_pending_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const now = new Date().toISOString();
        const sendParams = {
            channelId: selectedChannelId,
            message: text || ' ',
            rootId: replyToPostId ?? undefined,
            fileIds: pendingFileIds.length > 0 ? pendingFileIds : undefined,
        };

        // Create optimistic post and insert immediately
        const optimisticPost: MattermostPostData = {
            id: pendingId,
            channelId: selectedChannelId,
            userId: currentUser.id,
            username: currentUser.username,
            message: text || ' ',
            createAt: now,
            updateAt: now,
            rootId: replyToPostId ?? '',
            type: '',
            isPinned: false,
            _pending: true,
            _sendParams: sendParams,
        };

        const mmStore = useMattermostStore.getState();
        mmStore.prependNewPost(optimisticPost);
        if (optimisticPost.rootId && optimisticPost.rootId === mmStore.activeThreadRootId) {
            mmStore.appendThreadPost(optimisticPost);
        }

        // Send to extension host with pendingId for correlation
        postMessage('mattermost.sendPost', { ...sendParams, pendingId });

        setMessageText('');
        clearReplyTo();
        clearPendingFiles();
        setShowPreview(false);
        // Reset textarea height
        if (textareaRef.current) { textareaRef.current.style.height = 'auto'; }
    }, [messageText, selectedChannelId, replyToPostId, clearReplyTo, pendingFileIds, clearPendingFiles, currentUser]);

    const handleUploadClick = useCallback(() => {
        if (!selectedChannelId) { return; }
        postMessage('mattermost.uploadFiles', { channelId: selectedChannelId });
    }, [selectedChannelId]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            // Let emoji autocomplete handle keys first if it's open
            if (emojiAutocompleteOpen) {
                emojiKeyDown(e);
                if (e.defaultPrevented) { return; }
            }
            // Enter sends, Shift+Enter inserts newline
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        },
        [handleSend, emojiAutocompleteOpen, emojiKeyDown],
    );

    const handleInputChange = useCallback(
        (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            emojiHandleChange(e);
            sendTypingIndicator();

            // Auto-resize textarea up to ~6 rows
            const ta = e.target;
            ta.style.height = 'auto';
            const maxHeight = 6 * 20; // ~6 rows at ~20px line-height
            ta.style.height = `${Math.min(ta.scrollHeight, maxHeight)}px`;
        },
        [sendTypingIndicator],
    );

    const handleLoadMore = useCallback(() => {
        if (!selectedChannelId || isLoadingPosts) { return; }
        const page = Math.ceil(posts.length / 30);
        postMessage('mattermost.getPosts', {
            channelId: selectedChannelId,
            page,
        });
    }, [selectedChannelId, isLoadingPosts, posts.length]);

    const handleRefresh = useCallback(() => {
        if (!selectedChannelId) { return; }
        postMessage('mattermost.getPosts', { channelId: selectedChannelId });
    }, [selectedChannelId]);

    if (!selectedChannelId) {
        return (
            <div className="flex items-center justify-center h-full text-sm text-fg/50">
                Select a channel to start chatting
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* User profile popover */}
            {profileUserId && (
                <UserProfilePopover
                    userId={profileUserId}
                    onClose={() => setProfileUserId(null)}
                    onStartDM={handleStartDM}
                />
            )}

            {/* Connection banner */}
            <ConnectionBanner />

            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--vscode-panel-border)] shrink-0">
                <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={onClose}
                    className="md:hidden"
                    title="Back to channels"
                >
                    <ArrowLeft size={16} />
                </Button>
                <span className="text-sm font-semibold truncate flex-1">
                    # {selectedChannelName}
                </span>
                <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setShowSearch(!showSearch)}
                    title="Search messages"
                >
                    <Search size={14} />
                </Button>
                <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setShowChannelInfo(!showChannelInfo)}
                    title="Channel info"
                >
                    <Info size={14} />
                </Button>
                <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={handleRefresh}
                    title="Refresh"
                >
                    <RefreshCw size={14} className={isLoadingPosts ? 'animate-spin' : ''} />
                </Button>
            </div>

            {/* Channel info panel */}
            {showChannelInfo && (
                <ChannelInfoPanel onClose={() => setShowChannelInfo(false)} />
            )}

            {/* Search panel */}
            {showSearch && (
                <MessageSearchPanel
                    onClose={() => setShowSearch(false)}
                    currentUsername={currentUsername}
                    currentUserId={currentUserId}
                />
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto py-2">
                {/* Load more */}
                {hasMorePosts && posts.length > 0 && (
                    <div className="text-center py-2">
                        <Button
                            variant="link"
                            size="sm"
                            onClick={handleLoadMore}
                            disabled={isLoadingPosts}
                            className="inline-flex items-center gap-1"
                        >
                            <ChevronUp size={12} />
                            {isLoadingPosts ? 'Loading…' : 'Load older messages'}
                        </Button>
                    </div>
                )}

                {isLoadingPosts && posts.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-sm text-fg/50">
                        Loading messages…
                    </div>
                ) : posts.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-sm text-fg/50">
                        No messages yet. Start the conversation!
                    </div>
                ) : (
                    threadedGroups.map((group) => (
                        <div key={group.date}>
                            {/* Date separator */}
                            <div className="flex items-center gap-2 px-3 py-2">
                                <div className="flex-1 h-px bg-[var(--vscode-panel-border)]" />
                                <span className="text-xs text-fg/40 whitespace-nowrap">
                                    {group.date}
                                </span>
                                <div className="flex-1 h-px bg-[var(--vscode-panel-border)]" />
                            </div>
                            {group.threads.map(({ root, replies }) => (
                                <div key={root.id}>
                                    {/* Unread separator — shown after the last-read post */}
                                    {lastReadPostId && root.id !== lastReadPostId && (() => {
                                        // Check if this post is newer than lastReadPostId
                                        // We render the separator before the first post that comes AFTER lastReadPostId in chronological order
                                        const allGroupPostIds = group.threads.map((t) => t.root.id);
                                        const readIdx = allGroupPostIds.indexOf(lastReadPostId);
                                        const curIdx = allGroupPostIds.indexOf(root.id);
                                        if (readIdx >= 0 && curIdx === readIdx + 1) {
                                            return (
                                                <div className="unread-separator flex items-center gap-2 px-3 py-1 my-1">
                                                    <div className="flex-1 h-px bg-[var(--vscode-notificationsErrorIcon-foreground,#f14c4c)]" />
                                                    <span className="text-[10px] font-semibold text-[var(--vscode-notificationsErrorIcon-foreground,#f14c4c)] uppercase tracking-wider whitespace-nowrap">
                                                        New Messages
                                                    </span>
                                                    <div className="flex-1 h-px bg-[var(--vscode-notificationsErrorIcon-foreground,#f14c4c)]" />
                                                </div>
                                            );
                                        }
                                        return null;
                                    })()}
                                    {/* Root post */}
                                    <MessageBubble
                                        post={root}
                                        currentUsername={currentUsername}
                                        currentUserId={currentUserId}
                                        onOpenThread={handleOpenThread}
                                        onClickUsername={handleClickUsername}
                                    />

                                    {/* Collapsible inline thread replies */}
                                    {replies.length > 0 && (
                                        <div className="ml-4">
                                            <div className="flex items-center gap-1 px-3 py-0.5">
                                                <Button
                                                    variant="link"
                                                    size="sm"
                                                    onClick={() => toggleThread(root.id)}
                                                    className="h-auto p-0 gap-1 text-xs no-underline hover:underline"
                                                >
                                                    {expandedThreads.has(root.id) ? (
                                                        <ChevronDown size={12} />
                                                    ) : (
                                                        <ChevronRight size={12} />
                                                    )}
                                                    {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon-xs"
                                                    onClick={() => handleOpenThread(root.id)}
                                                    title="Open thread"
                                                >
                                                    <ExternalLink size={11} />
                                                </Button>
                                            </div>
                                            {expandedThreads.has(root.id) && (
                                                <div>
                                                    {replies.map((reply) => (
                                                        <MessageBubble
                                                            key={reply.id}
                                                            post={reply}
                                                            currentUsername={currentUsername}
                                                            currentUserId={currentUserId}
                                                            onOpenThread={handleOpenThread}
                                                            onClickUsername={handleClickUsername}
                                                            isThreadReply
                                                        />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ))
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Typing indicator */}
            {selectedChannelId && <TypingIndicator channelId={selectedChannelId} />}

            {/* Compose area */}
            <div className="shrink-0 border-t border-[var(--vscode-panel-border)] p-3">
                {/* Reply-to indicator */}
                {replyToPostId && (
                    <div className="flex items-center gap-2 mb-2 px-1 text-xs text-fg/60">
                        <MessageSquare size={12} className="text-[var(--vscode-textLink-foreground)]" />
                        <span>
                            Replying to <span className="font-semibold text-[var(--vscode-textLink-foreground)]">@{replyToUsername}</span>
                        </span>
                        <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={clearReplyTo}
                            className="ml-auto"
                            title="Cancel reply"
                        >
                            <X size={12} />
                        </Button>
                    </div>
                )}

                {/* Pending file attachments preview */}
                {(pendingFiles.length > 0 || isUploadingFiles) && (
                    <div className="flex flex-wrap items-center gap-2 mb-2 px-1">
                        {isUploadingFiles && (
                            <div className="flex items-center gap-1.5 text-xs text-fg/60">
                                <Loader2 size={12} className="animate-spin" />
                                Uploading…
                            </div>
                        )}
                        {pendingFiles.map((f) => (
                            <div
                                key={f.id}
                                className="flex items-center gap-1.5 px-2 py-1 rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-input-background)] text-xs max-w-40"
                                title={f.name}
                            >
                                <Paperclip size={10} className="shrink-0 text-fg/50" />
                                <span className="truncate">{f.name}</span>
                            </div>
                        ))}
                        {pendingFiles.length > 0 && (
                            <Button
                                variant="ghost"
                                size="icon-xs"
                                onClick={clearPendingFiles}
                                title="Remove attached files"
                            >
                                <X size={12} />
                            </Button>
                        )}
                    </div>
                )}

                <div className="relative">
                    {/* Markdown preview panel */}
                    {showPreview && messageText.trim() && (
                        <div className="mb-2 rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] p-2 max-h-40 overflow-y-auto">
                            <div className="text-[10px] text-fg/40 mb-1 uppercase tracking-wider font-semibold">Preview</div>
                            <div className="text-sm">
                                <MarkdownBody content={messageText} currentUsername={currentUsername} />
                            </div>
                        </div>
                    )}
                    {/* Emoji autocomplete dropdown */}
                    <EmojiAutocompleteDropdown
                        suggestions={emojiSuggestions}
                        selectedIndex={emojiSelectedIndex}
                        onSelect={emojiAcceptSuggestion}
                    />
                    <InputGroup>
                        <InputGroupTextarea
                            ref={textareaRef}
                            value={messageText}
                            onChange={handleInputChange}
                            onKeyDown={handleKeyDown}
                            placeholder={replyToPostId ? "Reply… (Shift+Enter for new line)" : "Type a message… (Shift+Enter for new line)"}
                            rows={1}
                            style={{ overflow: 'hidden' }}
                        />
                        <InputGroupAddon align="block-end">
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={handleUploadClick}
                                disabled={isUploadingFiles}
                                title="Attach files"
                            >
                                <Paperclip size={14} />
                                <span className="sr-only">Attach</span>
                            </Button>
                            <Button
                                variant={showPreview ? 'default' : 'ghost'}
                                size="icon-sm"
                                onClick={() => setShowPreview((v) => !v)}
                                title={showPreview ? 'Hide preview' : 'Preview message'}
                            >
                                <Eye size={14} />
                                <span className="sr-only">Preview</span>
                            </Button>
                            <ComposeEmojiPickerButton onInsert={handleInsertEmoji} />
                            <Button
                                size="icon-sm"
                                onClick={handleSend}
                                disabled={(!messageText.trim() && pendingFileIds.length === 0) || isSendingMessage}
                                className="ml-auto"
                                title="Send message (Enter)"
                            >
                                <Send size={14} />
                                <span className="sr-only">Send</span>
                            </Button>
                        </InputGroupAddon>
                    </InputGroup>
                </div>
            </div>
        </div>
    );
};
