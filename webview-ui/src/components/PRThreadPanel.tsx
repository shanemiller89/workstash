import React, { useState, useCallback, useRef } from 'react';
import { usePRStore, type PRCommentData } from '../prStore';
import { postMessage } from '../vscode';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { MarkdownBody } from './MarkdownBody';
import {
    X,
    FileCode,
    Send,
    CheckCircle2,
    Circle,
    MessageSquare,
} from 'lucide-react';

function formatDate(iso: string): string {
    return new Date(iso).toLocaleString();
}

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

/** Render a diff hunk with basic syntax coloring */
const DiffHunk: React.FC<{ hunk: string }> = ({ hunk }) => {
    const lines = hunk.split('\n');
    return (
        <pre className="text-[10px] leading-[1.6] font-mono overflow-x-auto bg-[var(--vscode-textCodeBlock-background,rgba(127,127,127,0.1))] rounded p-2">
            {lines.map((line, i) => {
                let color = 'text-fg/60';
                if (line.startsWith('+')) {
                    color = 'text-green-400';
                } else if (line.startsWith('-')) {
                    color = 'text-red-400';
                } else if (line.startsWith('@@')) {
                    color = 'text-blue-400';
                }
                return (
                    <div key={i} className={color}>
                        {line}
                    </div>
                );
            })}
        </pre>
    );
};

/** A single message bubble within the thread panel */
const ThreadMessage: React.FC<{ comment: PRCommentData }> = ({ comment }) => (
    <div className="px-3 py-2 hover:bg-fg/[0.02]">
        <div className="flex items-center gap-2 mb-1">
            {comment.authorAvatarUrl && (
                <img
                    src={comment.authorAvatarUrl}
                    alt={comment.author}
                    className="w-5 h-5 rounded-full flex-shrink-0"
                />
            )}
            <span className="text-[11px] font-medium">{comment.author}</span>
            <span
                className="text-[10px] text-fg/30"
                title={formatDate(comment.createdAt)}
            >
                {formatRelative(comment.createdAt)}
            </span>
        </div>
        <div className="pl-7">
            <MarkdownBody content={comment.body} />
        </div>
    </div>
);

export const PRThreadPanel: React.FC = () => {
    const activeThread = usePRStore((s) => s.activeThread());
    const closeThread = usePRStore((s) => s.closeThread);
    const selectedPRNumber = usePRStore((s) => s.selectedPRNumber);
    const isCommentSaving = usePRStore((s) => s.isCommentSaving);

    const [replyText, setReplyText] = useState('');
    const replyRef = useRef<HTMLTextAreaElement>(null);

    const handleSubmitReply = useCallback(() => {
        if (!replyText.trim() || !activeThread || selectedPRNumber === null) return;
        postMessage('prs.replyToComment', {
            prNumber: selectedPRNumber,
            commentId: activeThread.rootComment.id,
            body: replyText.trim(),
            threadId: activeThread.threadId,
            isResolved: activeThread.isResolved,
            resolvedBy: activeThread.resolvedBy,
        });
        setReplyText('');
    }, [replyText, activeThread, selectedPRNumber]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSubmitReply();
            }
        },
        [handleSubmitReply],
    );

    const handleToggleResolved = useCallback(() => {
        if (!activeThread) return;
        if (activeThread.isResolved) {
            postMessage('prs.unresolveThread', { threadId: activeThread.threadId });
        } else {
            postMessage('prs.resolveThread', { threadId: activeThread.threadId });
        }
    }, [activeThread]);

    if (!activeThread) {
        return (
            <div className="h-full flex items-center justify-center text-fg/30 text-[11px]">
                <MessageSquare size={20} className="mr-2" />
                Select a review thread to view
            </div>
        );
    }

    const { rootComment, replies, isResolved, resolvedBy, path, line } = activeThread;
    const replyCount = replies.length;

    return (
        <div className="h-full flex flex-col border-l border-border">
            {/* Header */}
            <div className="flex-shrink-0 border-b border-border px-3 py-2 flex items-center gap-2">
                <MessageSquare size={12} className="text-fg/40 flex-shrink-0" />
                <span className="text-[11px] font-medium truncate">
                    Thread
                </span>
                <span className="text-[10px] text-fg/30">
                    {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
                </span>
                <div className="flex-1" />
                {/* Resolved status */}
                <Button
                    variant="ghost"
                    size="icon-xs"
                    className={
                        isResolved
                            ? 'text-green-400 hover:text-fg/50'
                            : 'text-fg/30 hover:text-green-400'
                    }
                    onClick={handleToggleResolved}
                    title={isResolved ? 'Unresolve thread' : 'Resolve thread'}
                >
                    {isResolved ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                </Button>
                <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-fg/30 hover:text-fg"
                    onClick={closeThread}
                    title="Close thread panel"
                >
                    <X size={14} />
                </Button>
            </div>

            {/* File context */}
            {path && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--vscode-textCodeBlock-background,rgba(127,127,127,0.08))] border-b border-border text-[10px] text-fg/50">
                    <FileCode size={10} className="shrink-0" />
                    <span className="font-mono truncate">{path}</span>
                    {line != null && <span className="shrink-0">:{line}</span>}
                    {isResolved && (
                        <Badge
                            variant="outline"
                            className="ml-auto text-[9px] px-1.5 py-0.5 bg-green-400/15 text-green-400 border-green-400/30 gap-0.5"
                        >
                            <CheckCircle2 size={8} /> Resolved
                            {resolvedBy && ` by ${resolvedBy}`}
                        </Badge>
                    )}
                </div>
            )}

            {/* Diff hunk from root comment */}
            {rootComment.diffHunk && (
                <div className="border-b border-border px-2 py-1.5 max-h-40 overflow-y-auto flex-shrink-0">
                    <DiffHunk hunk={rootComment.diffHunk} />
                </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto">
                {/* Root comment */}
                <ThreadMessage comment={rootComment} />

                {/* Separator */}
                {replyCount > 0 && (
                    <div className="flex items-center gap-2 px-3 py-1">
                        <div className="flex-1 border-t border-border" />
                        <span className="text-[9px] text-fg/20">
                            {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
                        </span>
                        <div className="flex-1 border-t border-border" />
                    </div>
                )}

                {/* Replies */}
                {replies.map((reply) => (
                    <ThreadMessage key={reply.id} comment={reply} />
                ))}
            </div>

            {/* Reply composer */}
            <div className="flex-shrink-0 border-t border-border p-3">
                <div className="flex gap-2">
                    <Textarea
                        ref={replyRef}
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Reply to thread… (⌘+Enter)"
                        rows={2}
                        className="flex-1 text-[11px]"
                    />
                    <Button
                        className="self-end"
                        size="icon"
                        onClick={handleSubmitReply}
                        disabled={!replyText.trim() || isCommentSaving}
                        title="Send reply"
                    >
                        <Send size={13} />
                    </Button>
                </div>
                {isCommentSaving && (
                    <div className="text-[10px] text-fg/40 mt-1">Posting…</div>
                )}
            </div>
        </div>
    );
};
