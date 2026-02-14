import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMattermostStore, type MattermostPostData } from '../mattermostStore';
import { postMessage } from '../vscode';
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
    X,
    Send,
    Copy,
    Check,
    Loader2,
    ChevronUp,
    Pencil,
    Trash2,
    Pin,
    PinOff,
    Bookmark,
    BookmarkCheck,
    Paperclip,
    AlertTriangle,
    RotateCcw,
} from 'lucide-react';
import { EmojiPickerButton, ComposeEmojiPickerButton } from './EmojiPicker';
import { useEmojiAutocomplete, EmojiAutocompleteDropdown } from './useEmojiAutocomplete';

function formatTime(iso: string): string {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 0) { return timeStr; }
    if (diffDays === 1) { return `Yesterday ${timeStr}`; }
    if (diffDays < 7) { return `${date.toLocaleDateString(undefined, { weekday: 'short' })} ${timeStr}`; }
    return `${date.toLocaleDateString()} ${timeStr}`;
}

/** Small status dot for avatars */
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
            className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[var(--vscode-editor-background)]"
            style={{ backgroundColor: color }}
        />
    );
}

/** User avatar with real profile image or letter fallback */
const ThreadUserAvatar: React.FC<{
    userId: string;
    username: string;
    isOwn?: boolean;
}> = ({ userId, username, isOwn }) => {
    const avatarUrl = useMattermostStore((s) => s.userAvatars[userId]);

    if (avatarUrl) {
        return (
            <img
                src={avatarUrl}
                alt={username}
                className="w-7 h-7 rounded-full object-cover"
                title={username}
            />
        );
    }
    return (
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${
            isOwn
                ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
                : 'bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]'
        }`}>
            {username.charAt(0).toUpperCase()}
        </div>
    );
};

/** Inline edit form for thread messages */
const ThreadInlineEditForm: React.FC<{
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
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave(); }
        if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
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
                <Button variant="ghost" size="sm" onClick={onCancel} className="h-6 text-xs">Cancel</Button>
                <Button size="sm" onClick={handleSave} disabled={!editText.trim()} className="h-6 text-xs">Save</Button>
                <span className="text-[10px] text-fg/40 ml-1">Enter to save, Esc to cancel</span>
            </div>
        </div>
    );
};

/** Thread post (root or reply) */
const ThreadMessage: React.FC<{
    post: MattermostPostData;
    isRoot: boolean;
    currentUserId: string | null;
    currentUsername: string | null;
}> = ({ post, isRoot, currentUserId, currentUsername }) => {
    const [copied, setCopied] = useState(false);
    const editingPostId = useMattermostStore((s) => s.editingPostId);
    const startEditing = useMattermostStore((s) => s.startEditing);
    const cancelEditing = useMattermostStore((s) => s.cancelEditing);
    const flaggedPostIds = useMattermostStore((s) => s.flaggedPostIds);
    const retryPost = useMattermostStore((s) => s.retryPost);
    const discardFailedPost = useMattermostStore((s) => s.discardFailedPost);

    const isOwn = currentUsername !== null && post.username === currentUsername;
    const isPending = post._pending === true;
    const isFailed = !!post._failedError;
    const isEditing = editingPostId === post.id;
    const isFlagged = flaggedPostIds.has(post.id);
    const isEdited = post.updateAt !== post.createAt;

    const handleRetry = useCallback(() => {
        retryPost(post.id);
        if (post._sendParams) {
            postMessage('mattermost.sendPost', {
                channelId: post._sendParams.channelId,
                message: post._sendParams.message,
                rootId: post._sendParams.rootId,
                fileIds: post._sendParams.fileIds,
                pendingId: post.id,
            });
        }
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

    return (
        <div className={`group flex gap-2 px-3 py-2 hover:bg-[var(--vscode-list-hoverBackground)] ${isRoot ? 'border-b border-[var(--vscode-panel-border)] pb-3' : ''} ${isPending ? 'opacity-50' : ''}`}>
            <div className="relative shrink-0">
                <ThreadUserAvatar userId={post.userId} username={post.username} isOwn={isOwn} />
                <StatusDot userId={post.userId} />
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[var(--vscode-textLink-foreground)]">
                        {post.username}
                    </span>
                    <span className="text-[10px] text-fg/40">{formatTime(post.createAt)}</span>
                    {isEdited && <span className="text-[10px] text-fg/30">(edited)</span>}
                    {post.isPinned && (
                        <span title="Pinned"><Pin size={9} className="text-yellow-500 shrink-0" /></span>
                    )}
                    {isPending && (
                        <span className="flex items-center gap-1 text-[10px] text-fg/40">
                            <Loader2 size={10} className="animate-spin" /> Sending…
                        </span>
                    )}
                    {!isPending && !isFailed && <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
                        <Button variant="ghost" size="icon-xs" onClick={handleCopy} title="Copy">
                            {copied ? <Check size={10} /> : <Copy size={10} />}
                        </Button>
                        <EmojiPickerButton postId={post.id} />
                        <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={handlePin}
                            title={post.isPinned ? 'Unpin' : 'Pin'}
                        >
                            {post.isPinned ? <PinOff size={10} /> : <Pin size={10} />}
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={handleFlag}
                            title={isFlagged ? 'Unsave' : 'Save'}
                        >
                            {isFlagged ? <BookmarkCheck size={10} className="text-yellow-500" /> : <Bookmark size={10} />}
                        </Button>
                        {isOwn && (
                            <>
                                <Button variant="ghost" size="icon-xs" onClick={handleEdit} title="Edit">
                                    <Pencil size={10} />
                                </Button>
                                <AlertDialog>
                                    <AlertDialogTrigger render={
                                        <Button variant="ghost" size="icon-xs" title="Delete">
                                            <Trash2 size={10} className="text-red-400" />
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
                    </div>}
                </div>
                {isFailed && (
                    <div className="flex items-center gap-2 mt-1 px-2 py-1 rounded text-xs bg-red-500/10 text-red-400">
                        <AlertTriangle size={12} className="shrink-0" />
                        <span className="flex-1 truncate">{post._failedError}</span>
                        <Button variant="ghost" size="icon-xs" onClick={handleRetry} title="Retry">
                            <RotateCcw size={10} />
                        </Button>
                        <Button variant="ghost" size="icon-xs" onClick={handleDiscard} title="Discard">
                            <X size={10} />
                        </Button>
                    </div>
                )}
                {/* Message body or inline edit */}
                {isEditing ? (
                    <ThreadInlineEditForm
                        postId={post.id}
                        initialMessage={post.message}
                        onCancel={cancelEditing}
                    />
                ) : (
                    <div className="text-sm mt-0.5">
                        <MarkdownBody content={post.message} currentUsername={currentUsername} />
                    </div>
                )}
                <FileAttachments files={post.files} />
                <LinkPreview previews={post.linkPreviews} />
                <ReactionBar postId={post.id} currentUserId={currentUserId} />
            </div>
        </div>
    );
};

export const MattermostThreadPanel: React.FC = () => {
    const activeThreadRootId = useMattermostStore((s) => s.activeThreadRootId);
    const threadPosts = useMattermostStore((s) => s.threadPosts);
    const isLoadingThread = useMattermostStore((s) => s.isLoadingThread);
    const closeThread = useMattermostStore((s) => s.closeThread);
    const currentUser = useMattermostStore((s) => s.currentUser);
    const selectedChannelId = useMattermostStore((s) => s.selectedChannelId);
    const isSendingMessage = useMattermostStore((s) => s.isSendingMessage);
    const pendingFileIds = useMattermostStore((s) => s.pendingFileIds);
    const pendingFiles = useMattermostStore((s) => s.pendingFiles);
    const isUploadingFiles = useMattermostStore((s) => s.isUploadingFiles);
    const clearPendingFiles = useMattermostStore((s) => s.clearPendingFiles);

    const [replyText, setReplyText] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const replyTextareaRef = useRef<HTMLTextAreaElement>(null);

    const currentUserId = currentUser?.id ?? null;
    const currentUsername = currentUser?.username ?? null;

    // Emoji shortcode autocomplete for thread reply
    const {
        suggestions: emojiSuggestions,
        selectedIndex: emojiSelectedIndex,
        isOpen: emojiAutocompleteOpen,
        handleKeyDown: emojiKeyDown,
        handleChange: emojiHandleChange,
        acceptSuggestion: emojiAcceptSuggestion,
    } = useEmojiAutocomplete(replyTextareaRef, replyText, setReplyText);

    // Auto-scroll on new thread posts
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [threadPosts]);

    // Clear reply when thread changes
    useEffect(() => {
        setReplyText('');
    }, [activeThreadRootId]);

    const handleInsertEmoji = useCallback((shortcode: string) => {
        setReplyText((prev) => prev + shortcode);
        replyTextareaRef.current?.focus();
    }, []);

    const rootPost = useMemo(() => {
        if (!activeThreadRootId || threadPosts.length === 0) { return null; }
        return threadPosts.find((p) => p.id === activeThreadRootId) ?? null;
    }, [activeThreadRootId, threadPosts]);

    const replies = useMemo(() => {
        if (!activeThreadRootId) { return []; }
        return threadPosts.filter((p) => p.id !== activeThreadRootId);
    }, [activeThreadRootId, threadPosts]);

    const handleSendReply = useCallback(() => {
        const text = replyText.trim();
        if ((!text && pendingFileIds.length === 0) || !selectedChannelId || !activeThreadRootId || !currentUser) { return; }

        const pendingId = `_pending_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const now = new Date().toISOString();
        const sendParams = {
            channelId: selectedChannelId,
            message: text || ' ',
            rootId: activeThreadRootId,
            fileIds: pendingFileIds.length > 0 ? pendingFileIds : undefined,
        };

        // Create optimistic post
        const optimisticPost: MattermostPostData = {
            id: pendingId,
            channelId: selectedChannelId,
            userId: currentUser.id,
            username: currentUser.username,
            message: text || ' ',
            createAt: now,
            updateAt: now,
            rootId: activeThreadRootId,
            type: '',
            isPinned: false,
            _pending: true,
            _sendParams: sendParams,
        };

        const mmStore = useMattermostStore.getState();
        mmStore.appendThreadPost(optimisticPost);
        mmStore.prependNewPost(optimisticPost);

        postMessage('mattermost.sendPost', { ...sendParams, pendingId });
        setReplyText('');
        clearPendingFiles();
        if (replyTextareaRef.current) { replyTextareaRef.current.style.height = 'auto'; }
    }, [replyText, selectedChannelId, activeThreadRootId, pendingFileIds, clearPendingFiles, currentUser]);

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
                handleSendReply();
            }
        },
        [handleSendReply, emojiAutocompleteOpen, emojiKeyDown],
    );

    if (!activeThreadRootId) { return null; }

    return (
        <div className="flex flex-col h-full border-l border-[var(--vscode-panel-border)]">
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--vscode-panel-border)] shrink-0">
                <span className="text-sm font-semibold flex-1">Thread</span>
                <span className="text-xs text-fg/40">
                    {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
                </span>
                <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={closeThread}
                    title="Close thread"
                >
                    <X size={14} />
                </Button>
            </div>

            {/* Thread messages */}
            <div className="flex-1 overflow-y-auto py-1">
                {isLoadingThread ? (
                    <div className="flex items-center justify-center h-20 text-sm text-fg/50">
                        <Loader2 size={14} className="animate-spin mr-2" />
                        Loading thread…
                    </div>
                ) : (
                    <>
                        {rootPost && (
                            <ThreadMessage post={rootPost} isRoot={true} currentUserId={currentUserId} currentUsername={currentUsername} />
                        )}
                        {replies.map((post) => (
                            <ThreadMessage key={post.id} post={post} isRoot={false} currentUserId={currentUserId} currentUsername={currentUsername} />
                        ))}
                    </>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Reply compose */}
            <div className="shrink-0 border-t border-[var(--vscode-panel-border)] p-2">
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
                    {/* Emoji autocomplete dropdown */}
                    <EmojiAutocompleteDropdown
                        suggestions={emojiSuggestions}
                        selectedIndex={emojiSelectedIndex}
                        onSelect={emojiAcceptSuggestion}
                    />
                    <InputGroup>
                        <InputGroupTextarea
                            ref={replyTextareaRef}
                            value={replyText}
                            onChange={(e) => {
                                emojiHandleChange(e);
                                // Auto-resize up to ~6 rows
                                const ta = e.target;
                                ta.style.height = 'auto';
                                const maxHeight = 6 * 20;
                                ta.style.height = `${Math.min(ta.scrollHeight, maxHeight)}px`;
                            }}
                            onKeyDown={handleKeyDown}
                            placeholder="Reply… (Shift+Enter for new line)"
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
                            <ComposeEmojiPickerButton onInsert={handleInsertEmoji} />
                            <Button
                                size="icon-sm"
                                onClick={handleSendReply}
                                disabled={(!replyText.trim() && pendingFileIds.length === 0) || isSendingMessage}
                                className="ml-auto"
                                title="Send reply (Enter)"
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
