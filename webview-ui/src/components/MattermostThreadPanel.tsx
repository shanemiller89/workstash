import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMattermostStore, type MattermostPostData, type MattermostReactionData } from '../mattermostStore';
import { postMessage } from '../vscode';
import { MarkdownBody } from './MarkdownBody';
import {
    X,
    Send,
    Copy,
    Check,
    Loader2,
} from 'lucide-react';
import { EmojiPickerButton } from './EmojiPicker';
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

/** Compact reaction bar */
const ReactionBar: React.FC<{ postId: string; currentUserId: string | null }> = ({ postId, currentUserId }) => {
    const reactions = useMattermostStore((s) => s.reactions[postId]);
    if (!reactions || reactions.length === 0) { return null; }

    const grouped = useMemo(() => {
        const map = new Map<string, MattermostReactionData[]>();
        for (const r of reactions) {
            const list = map.get(r.emojiName) ?? [];
            list.push(r);
            map.set(r.emojiName, list);
        }
        return Array.from(map.entries());
    }, [reactions]);

    return (
        <div className="flex flex-wrap gap-1 mt-1">
            {grouped.map(([emoji, users]) => {
                const myReaction = users.some((u) => u.userId === currentUserId);
                return (
                    <button
                        key={emoji}
                        onClick={() => {
                            if (myReaction) {
                                postMessage('mattermost.removeReaction', { postId, emojiName: emoji });
                            } else {
                                postMessage('mattermost.addReaction', { postId, emojiName: emoji });
                            }
                        }}
                        title={users.map((u) => u.username).join(', ')}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] border transition-colors ${
                            myReaction
                                ? 'border-[var(--vscode-textLink-foreground)] bg-[var(--vscode-textLink-foreground)]/10 text-[var(--vscode-textLink-foreground)]'
                                : 'border-[var(--vscode-panel-border)] text-fg/60 hover:bg-[var(--vscode-list-hoverBackground)]'
                        }`}
                    >
                        <span>:{emoji}:</span>
                        <span className="font-medium">{users.length}</span>
                    </button>
                );
            })}
        </div>
    );
};

/** Thread post (root or reply) */
const ThreadMessage: React.FC<{
    post: MattermostPostData;
    isRoot: boolean;
    currentUserId: string | null;
}> = ({ post, isRoot, currentUserId }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(() => {
        void navigator.clipboard.writeText(post.message);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    }, [post.message]);

    return (
        <div className={`group flex gap-2 px-3 py-2 hover:bg-[var(--vscode-list-hoverBackground)] ${isRoot ? 'border-b border-[var(--vscode-panel-border)] pb-3' : ''}`}>
            <div className="relative shrink-0">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)]">
                    {post.username.charAt(0).toUpperCase()}
                </div>
                <StatusDot userId={post.userId} />
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[var(--vscode-textLink-foreground)]">
                        {post.username}
                    </span>
                    <span className="text-[10px] text-fg/40">{formatTime(post.createAt)}</span>
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
                        <button onClick={handleCopy} className="p-0.5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] text-fg/40" title="Copy">
                            {copied ? <Check size={10} /> : <Copy size={10} />}
                        </button>
                        <EmojiPickerButton postId={post.id} />
                    </div>
                </div>
                <div className="text-sm mt-0.5">
                    <MarkdownBody content={post.message} />
                </div>
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

    const [replyText, setReplyText] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const replyTextareaRef = useRef<HTMLTextAreaElement>(null);

    const currentUserId = currentUser?.id ?? null;

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
        if (!text || !selectedChannelId || !activeThreadRootId) { return; }
        postMessage('mattermost.sendReply', {
            channelId: selectedChannelId,
            message: text,
            rootId: activeThreadRootId,
        });
        setReplyText('');
    }, [replyText, selectedChannelId, activeThreadRootId]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            // Let emoji autocomplete handle keys first if it's open
            if (emojiAutocompleteOpen) {
                emojiKeyDown(e);
                if (e.defaultPrevented) { return; }
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
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
                <button
                    onClick={closeThread}
                    className="p-1 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] text-fg/60"
                    title="Close thread"
                >
                    <X size={14} />
                </button>
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
                            <ThreadMessage post={rootPost} isRoot={true} currentUserId={currentUserId} />
                        )}
                        {replies.map((post) => (
                            <ThreadMessage key={post.id} post={post} isRoot={false} currentUserId={currentUserId} />
                        ))}
                    </>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Reply compose */}
            <div className="shrink-0 border-t border-[var(--vscode-panel-border)] p-2">
                <div className="relative flex gap-2">
                    {/* Emoji autocomplete dropdown */}
                    <EmojiAutocompleteDropdown
                        suggestions={emojiSuggestions}
                        selectedIndex={emojiSelectedIndex}
                        onSelect={emojiAcceptSuggestion}
                    />
                    <textarea
                        ref={replyTextareaRef}
                        value={replyText}
                        onChange={emojiHandleChange}
                        onKeyDown={handleKeyDown}
                        placeholder="Reply… (⌘+Enter)"
                        rows={2}
                        className="flex-1 px-2 py-1.5 text-sm rounded-md resize-none
                            bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)]
                            border border-[var(--vscode-input-border)]
                            focus:outline-none focus:border-[var(--vscode-focusBorder)]
                            placeholder:text-fg/40"
                    />
                    <button
                        onClick={handleSendReply}
                        disabled={!replyText.trim() || isSendingMessage}
                        className="self-end p-1.5 rounded-md bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Send reply (⌘+Enter)"
                    >
                        <Send size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
};
