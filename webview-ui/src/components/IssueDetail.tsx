import React, { useState, useCallback, useMemo } from 'react';
import { useIssueStore, type IssueCommentData } from '../issueStore';
import { postMessage } from '../vscode';
import { MarkdownBody } from './MarkdownBody';
import {
    CircleDot,
    CheckCircle2,
    ExternalLink,
    X,
    Send,
    ChevronRight,
    Copy,
    XCircle,
    RotateCcw,
} from 'lucide-react';

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

/** Single comment card */
const CommentCard: React.FC<{ comment: IssueCommentData }> = ({ comment }) => {
    const [collapsed, setCollapsed] = useState(false);

    const handleCopy = useCallback(() => {
        postMessage('issues.copyComment', { body: comment.body });
    }, [comment.body]);

    return (
        <div className="border border-border rounded-md overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-card border-b border-border">
                <button
                    className="p-0.5 text-fg/30 hover:text-fg transition-colors"
                    onClick={() => setCollapsed(!collapsed)}
                    title={collapsed ? 'Expand' : 'Collapse'}
                >
                    <ChevronRight
                        size={12}
                        className={`transition-transform ${collapsed ? '' : 'rotate-90'}`}
                    />
                </button>
                {comment.authorAvatarUrl && (
                    <img
                        src={comment.authorAvatarUrl}
                        alt={comment.author}
                        className="w-4 h-4 rounded-full"
                    />
                )}
                <span className="text-[11px] font-medium">{comment.author}</span>
                <span className="text-[10px] text-fg/40">
                    {formatRelative(comment.createdAt)}
                </span>
                <div className="flex-1" />
                <button
                    className="p-0.5 text-fg/30 hover:text-fg transition-colors"
                    onClick={handleCopy}
                    title="Copy comment"
                >
                    <Copy size={11} />
                </button>
            </div>
            {/* Body */}
            {!collapsed && (
                <div className="px-3 py-2 text-[12px]">
                    <MarkdownBody content={comment.body} />
                </div>
            )}
        </div>
    );
};

interface IssueDetailProps {
    onClose: () => void;
}

export const IssueDetail: React.FC<IssueDetailProps> = ({ onClose }) => {
    const selectedIssueNumber = useIssueStore((s) => s.selectedIssueNumber);
    const selectedIssueDetail = useIssueStore((s) => s.selectedIssueDetail);
    const allIssues = useIssueStore((s) => s.issues);
    const comments = useIssueStore((s) => s.comments);
    const isCommentsLoading = useIssueStore((s) => s.isCommentsLoading);
    const isCommentSaving = useIssueStore((s) => s.isCommentSaving);

    const [commentBody, setCommentBody] = useState('');

    // Stable derived state — avoid Zustand function-call selectors
    const issue = useMemo(() => {
        if (selectedIssueDetail) return selectedIssueDetail;
        if (selectedIssueNumber === null) return undefined;
        return allIssues.find((i) => i.number === selectedIssueNumber);
    }, [selectedIssueDetail, selectedIssueNumber, allIssues]);

    const handleOpenInBrowser = useCallback(() => {
        if (issue) {
            postMessage('issues.openInBrowser', { issueNumber: issue.number });
        }
    }, [issue]);

    const handleSubmitComment = useCallback(() => {
        if (!commentBody.trim() || !issue) return;
        postMessage('issues.createComment', {
            issueNumber: issue.number,
            body: commentBody.trim(),
        });
        setCommentBody('');
    }, [commentBody, issue]);

    const handleCloseIssue = useCallback(() => {
        if (!issue) return;
        postMessage('issues.close', { issueNumber: issue.number });
    }, [issue]);

    const handleReopenIssue = useCallback(() => {
        if (!issue) return;
        postMessage('issues.reopen', { issueNumber: issue.number });
    }, [issue]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSubmitComment();
            }
        },
        [handleSubmitComment],
    );

    // No selection
    if (!selectedIssueNumber) {
        return (
            <div className="h-full flex items-center justify-center text-fg/30 text-[12px]">
                Select an issue to view details
            </div>
        );
    }

    // Loading
    if (!issue) {
        return (
            <div className="h-full flex items-center justify-center text-fg/40 text-[11px]">
                Loading issue…
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="flex-shrink-0 border-b border-border px-4 py-3">
                <div className="flex items-start gap-2">
                    <div className="mt-0.5 flex-shrink-0">
                        {issue.state === 'open' ? (
                            <CircleDot size={16} className="text-green-400" />
                        ) : (
                            <CheckCircle2 size={16} className="text-purple-400" />
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="text-[14px] font-semibold leading-tight">
                            {issue.title}
                        </h2>
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-fg/40">
                            <span className="text-fg/50">#{issue.number}</span>
                            <span>·</span>
                            <span>by {issue.author}</span>
                            <span>·</span>
                            <span>{formatRelative(issue.createdAt)}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                            className="p-1 text-fg/30 hover:text-fg transition-colors"
                            onClick={handleOpenInBrowser}
                            title="Open in browser"
                        >
                            <ExternalLink size={14} />
                        </button>
                        <button
                            className="p-1 text-fg/30 hover:text-fg transition-colors"
                            onClick={onClose}
                            title="Close detail"
                        >
                            <X size={14} />
                        </button>
                    </div>
                </div>

                {/* Labels */}
                {issue.labels.length > 0 && (
                    <div className="flex items-center gap-1 mt-2 flex-wrap">
                        {issue.labels.map((l) => (
                            <span
                                key={l.name}
                                className="text-[9px] px-1.5 py-0.5 rounded-full"
                                style={{
                                    backgroundColor: `#${l.color}20`,
                                    color: `#${l.color}`,
                                    border: `1px solid #${l.color}40`,
                                }}
                            >
                                {l.name}
                            </span>
                        ))}
                    </div>
                )}

                {/* Assignees + Milestone */}
                <div className="flex items-center gap-3 mt-2 text-[10px] text-fg/40">
                    {issue.assignees.length > 0 && (
                        <span>
                            Assigned to:{' '}
                            {issue.assignees.map((a, i) => (
                                <span key={a.login}>
                                    {a.avatarUrl && (
                                        <img
                                            src={a.avatarUrl}
                                            alt={a.login}
                                            className="w-3.5 h-3.5 rounded-full inline-block mr-0.5 -mt-0.5"
                                        />
                                    )}
                                    {a.login}
                                    {i < issue.assignees.length - 1 ? ', ' : ''}
                                </span>
                            ))}
                        </span>
                    )}
                    {issue.milestone && (
                        <span>🎯 {issue.milestone.title}</span>
                    )}
                </div>

                {/* Close/Reopen button */}
                <div className="mt-2">
                    {issue.state === 'open' ? (
                        <button
                            className="flex items-center gap-1 px-2 py-1 text-[10px] bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition-colors"
                            onClick={handleCloseIssue}
                            title="Close issue"
                        >
                            <XCircle size={11} />
                            Close Issue
                        </button>
                    ) : (
                        <button
                            className="flex items-center gap-1 px-2 py-1 text-[10px] bg-green-500/10 text-green-400 rounded hover:bg-green-500/20 transition-colors"
                            onClick={handleReopenIssue}
                            title="Reopen issue"
                        >
                            <RotateCcw size={11} />
                            Reopen Issue
                        </button>
                    )}
                </div>
            </div>

            {/* Scrollable body + comments */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {/* Issue body */}
                {issue.body && (
                    <div className="border border-border rounded-md overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-card border-b border-border">
                            {issue.authorAvatarUrl && (
                                <img
                                    src={issue.authorAvatarUrl}
                                    alt={issue.author}
                                    className="w-4 h-4 rounded-full"
                                />
                            )}
                            <span className="text-[11px] font-medium">{issue.author}</span>
                            <span className="text-[10px] text-fg/40">
                                {formatRelative(issue.createdAt)}
                            </span>
                        </div>
                        <div className="px-3 py-2 text-[12px]">
                            <MarkdownBody content={issue.body} />
                        </div>
                    </div>
                )}

                {/* Comments */}
                {isCommentsLoading ? (
                    <div className="text-center text-fg/40 text-[11px] py-4">
                        Loading comments…
                    </div>
                ) : comments.length === 0 ? (
                    <div className="text-center text-fg/30 text-[11px] py-4">
                        No comments yet
                    </div>
                ) : (
                    comments.map((c) => <CommentCard key={c.id} comment={c} />)
                )}
            </div>

            {/* Comment input */}
            <div className="flex-shrink-0 border-t border-border p-3">
                <div className="flex gap-2">
                    <textarea
                        className="flex-1 bg-input border border-border rounded px-2 py-1.5 text-[11px] resize-none focus:border-accent focus:outline-none"
                        placeholder="Add a comment… (⌘+Enter to send)"
                        rows={2}
                        value={commentBody}
                        onChange={(e) => setCommentBody(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={isCommentSaving}
                    />
                    <button
                        className="self-end p-1.5 bg-accent text-white rounded hover:opacity-90 transition-opacity disabled:opacity-40"
                        onClick={handleSubmitComment}
                        disabled={!commentBody.trim() || isCommentSaving}
                        title="Send comment"
                    >
                        <Send size={13} />
                    </button>
                </div>
            </div>
        </div>
    );
};
