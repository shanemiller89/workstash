import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { usePRStore, type PRCommentData, type CommentResolvedFilter, type CommentGroup } from '../prStore';
import { postMessage } from '../vscode';
import {
    GitPullRequest,
    GitMerge,
    XCircle,
    ExternalLink,
    Copy,
    CopyCheck,
    Send,
    X,
    MessageSquare,
    FileDiff,
    Clock,
    GitBranch,
    FileCode,
    Reply,
    CheckCircle2,
    Circle,
    ChevronDown,
    ChevronRight,
    Users,
    Filter,
    UserPlus,
    Loader2,
    Bot,
} from 'lucide-react';
import { MarkdownBody } from './MarkdownBody';

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

function StateIcon({ state, isDraft }: { state: string; isDraft: boolean }) {
    if (isDraft) return <GitPullRequest size={16} className="text-fg/40" />;
    switch (state) {
        case 'open':
            return <GitPullRequest size={16} className="text-green-400" />;
        case 'merged':
            return <GitMerge size={16} className="text-purple-400" />;
        case 'closed':
            return <XCircle size={16} className="text-red-400" />;
        default:
            return <GitPullRequest size={16} className="text-fg/50" />;
    }
}

function StateBadge({ state, isDraft }: { state: string; isDraft: boolean }) {
    const colors = isDraft
        ? 'bg-fg/10 text-fg/50'
        : state === 'open'
          ? 'bg-green-400/15 text-green-400'
          : state === 'merged'
            ? 'bg-purple-400/15 text-purple-400'
            : 'bg-red-400/15 text-red-400';
    const label = isDraft ? 'Draft' : state.charAt(0).toUpperCase() + state.slice(1);
    return (
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${colors}`}>
            {label}
        </span>
    );
}

/** Render a diff hunk with basic syntax coloring */
const DiffHunk: React.FC<{ hunk: string }> = ({ hunk }) => {
    const lines = hunk.split('\n');
    return (
        <pre className="text-[10px] leading-[1.6] font-mono overflow-x-auto bg-[var(--vscode-textCodeBlock-background,rgba(127,127,127,0.1))] rounded p-2 my-1">
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

/** Single comment card with reply + resolve + collapse support */
const CommentCard: React.FC<{ comment: PRCommentData; prNumber: number }> = ({ comment, prNumber }) => {
    const [copied, setCopied] = useState(false);
    const [showReply, setShowReply] = useState(false);
    const [replyText, setReplyText] = useState('');
    const [collapsed, setCollapsed] = useState(false);
    const isCommentSaving = usePRStore((s) => s.isCommentSaving);
    const replyRef = useRef<HTMLTextAreaElement>(null);

    const handleCopy = useCallback(() => {
        postMessage('prs.copyComment', { body: comment.body });
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [comment.body]);

    const handleReply = useCallback(() => {
        setShowReply(true);
        setTimeout(() => replyRef.current?.focus(), 50);
    }, []);

    const handleSubmitReply = useCallback(() => {
        if (!replyText.trim()) return;
        postMessage('prs.replyToComment', {
            prNumber,
            commentId: comment.id,
            body: replyText.trim(),
            threadId: comment.threadId,
            isResolved: comment.isResolved,
            resolvedBy: comment.resolvedBy,
        });
        setReplyText('');
        setShowReply(false);
    }, [replyText, prNumber, comment]);

    const handleReplyKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSubmitReply();
            }
            if (e.key === 'Escape') {
                setShowReply(false);
                setReplyText('');
            }
        },
        [handleSubmitReply],
    );

    const handleToggleResolved = useCallback(() => {
        if (!comment.threadId) return;
        if (comment.isResolved) {
            postMessage('prs.unresolveThread', { threadId: comment.threadId });
        } else {
            postMessage('prs.resolveThread', { threadId: comment.threadId });
        }
    }, [comment]);

    return (
        <div className={`border rounded overflow-hidden ${comment.isResolved ? 'border-green-400/30 bg-green-400/[0.03]' : 'border-border'}`}>
            {/* Review comment file context */}
            {comment.isReviewComment && comment.path && (
                <div className="flex items-center gap-1.5 px-3 py-1 bg-[var(--vscode-textCodeBlock-background,rgba(127,127,127,0.08))] border-b border-border text-[10px] text-fg/50">
                    <FileCode size={10} className="shrink-0" />
                    <span className="font-mono truncate">{comment.path}</span>
                    {comment.line != null && (
                        <span className="shrink-0">:{comment.line}</span>
                    )}
                    {/* Resolved badge */}
                    {comment.isReviewComment && comment.threadId && comment.isResolved && (
                        <span className="ml-auto text-[9px] px-1.5 py-0.5 bg-green-400/15 text-green-400 rounded-full flex items-center gap-0.5">
                            <CheckCircle2 size={8} /> Resolved
                        </span>
                    )}
                </div>
            )}
            {/* Diff hunk */}
            {comment.isReviewComment && comment.diffHunk && (
                <div className="border-b border-border px-2 py-1 max-h-32 overflow-y-auto">
                    <DiffHunk hunk={comment.diffHunk} />
                </div>
            )}
            {/* Comment header */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-card border-b border-border">
                {comment.authorAvatarUrl && (
                    <img
                        src={comment.authorAvatarUrl}
                        alt={comment.author}
                        className="w-4 h-4 rounded-full"
                    />
                )}
                <span className="text-[11px] font-medium">{comment.author}</span>
                {comment.isReviewComment && (
                    <span className="text-[9px] px-1 py-0.5 bg-blue-400/10 text-blue-400 rounded">review</span>
                )}
                {comment.inReplyToId && (
                    <span className="text-[9px] px-1 py-0.5 bg-fg/10 text-fg/50 rounded">reply</span>
                )}
                <span className="text-[10px] text-fg/40" title={formatDate(comment.createdAt)}>
                    {formatRelative(comment.createdAt)}
                </span>
                <div className="flex-1" />
                {/* Resolve toggle (only for review comments with a thread) */}
                {comment.isReviewComment && comment.threadId && !comment.inReplyToId && (
                    <button
                        className={`p-0.5 transition-colors ${comment.isResolved ? 'text-green-400 hover:text-fg/50' : 'text-fg/30 hover:text-green-400'}`}
                        onClick={handleToggleResolved}
                        title={comment.isResolved ? 'Unresolve thread' : 'Resolve thread'}
                    >
                        {comment.isResolved ? <CheckCircle2 size={12} /> : <Circle size={12} />}
                    </button>
                )}
                {/* Reply button (only for review comments) */}
                {comment.isReviewComment && (
                    <button
                        className="p-0.5 text-fg/30 hover:text-fg transition-colors"
                        onClick={handleReply}
                        title="Reply to this comment"
                    >
                        <Reply size={11} />
                    </button>
                )}
                <button
                    className="p-0.5 text-fg/30 hover:text-fg transition-colors"
                    onClick={handleCopy}
                    title="Copy comment"
                >
                    {copied ? <CopyCheck size={11} /> : <Copy size={11} />}
                </button>
                <button
                    className="p-0.5 text-fg/30 hover:text-fg transition-colors"
                    onClick={() => setCollapsed(!collapsed)}
                    title={collapsed ? 'Expand comment' : 'Collapse comment'}
                >
                    {collapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                </button>
            </div>
            {/* Collapsible content */}
            {!collapsed && (
                <>
                    {/* Comment body — rendered as markdown */}
                    <div className="px-3 py-2">
                        <MarkdownBody content={comment.body} />
                    </div>
                    {/* Inline reply area */}
                    {showReply && (
                        <div className="border-t border-border px-3 py-2 bg-card">
                            <textarea
                                ref={replyRef}
                                value={replyText}
                                onChange={(e) => setReplyText(e.target.value)}
                                onKeyDown={handleReplyKeyDown}
                                placeholder="Write a reply… (⌘+Enter to submit, Esc to cancel)"
                                rows={2}
                                className="w-full px-2 py-1.5 text-[11px] bg-input border border-border rounded resize-none focus:border-accent focus:outline-none"
                            />
                            <div className="flex items-center gap-2 mt-1.5">
                                <button
                                    className="px-2 py-1 text-[10px] bg-accent text-white rounded hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                                    onClick={handleSubmitReply}
                                    disabled={!replyText.trim() || isCommentSaving}
                                >
                                    Reply
                                </button>
                                <button
                                    className="px-2 py-1 text-[10px] text-fg/50 hover:text-fg transition-colors"
                                    onClick={() => { setShowReply(false); setReplyText(''); }}
                                >
                                    Cancel
                                </button>
                                {isCommentSaving && (
                                    <span className="text-[10px] text-fg/40">Posting…</span>
                                )}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

/** Multiselect user filter dropdown */
const UserFilterDropdown: React.FC = () => {
    const [open, setOpen] = useState(false);
    const comments = usePRStore((s) => s.comments);
    const authors = useMemo(() => {
        const set = [...new Set(comments.map((c) => c.author))];
        return set.sort((a, b) => a.localeCompare(b));
    }, [comments]);
    const userFilter = usePRStore((s) => s.commentUserFilter);
    const setUserFilter = usePRStore((s) => s.setCommentUserFilter);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const toggle = (author: string) => {
        if (userFilter.includes(author)) {
            setUserFilter(userFilter.filter((a) => a !== author));
        } else {
            setUserFilter([...userFilter, author]);
        }
    };

    if (authors.length === 0) return null;

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                className={`flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded border transition-colors ${
                    userFilter.length > 0
                        ? 'border-accent text-accent bg-accent/10'
                        : 'border-border text-fg/50 hover:text-fg'
                }`}
                onClick={() => setOpen(!open)}
                title="Filter by user"
            >
                <Users size={10} />
                {userFilter.length > 0 ? `${userFilter.length} selected` : 'Users'}
                <ChevronDown size={8} />
            </button>
            {open && (
                <div className="absolute left-0 top-full mt-1 z-20 bg-card border border-border rounded shadow-lg min-w-[150px] max-h-48 overflow-y-auto">
                    {userFilter.length > 0 && (
                        <button
                            className="w-full text-left px-2 py-1 text-[10px] text-fg/40 hover:bg-fg/5 border-b border-border"
                            onClick={() => setUserFilter([])}
                        >
                            Clear all
                        </button>
                    )}
                    {authors.map((author) => (
                        <label
                            key={author}
                            className="flex items-center gap-2 px-2 py-1 text-[10px] hover:bg-fg/5 cursor-pointer"
                        >
                            <input
                                type="checkbox"
                                checked={userFilter.includes(author)}
                                onChange={() => toggle(author)}
                                className="w-3 h-3 rounded"
                            />
                            <span>{author}</span>
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
};

/** Resolved/unresolved filter pills */
const ResolvedFilter: React.FC = () => {
    const filter = usePRStore((s) => s.commentResolvedFilter);
    const setFilter = usePRStore((s) => s.setCommentResolvedFilter);

    const pills: { value: CommentResolvedFilter; label: string }[] = [
        { value: 'all', label: 'All' },
        { value: 'unresolved', label: 'Unresolved' },
        { value: 'resolved', label: 'Resolved' },
    ];

    return (
        <div className="flex items-center gap-0.5">
            {pills.map((p) => (
                <button
                    key={p.value}
                    className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
                        filter === p.value
                            ? 'bg-accent/15 text-accent'
                            : 'text-fg/40 hover:text-fg/70'
                    }`}
                    onClick={() => setFilter(p.value)}
                >
                    {p.label}
                </button>
            ))}
        </div>
    );
};

/** Collapsible user group */
const UserGroup: React.FC<{
    author: string;
    avatarUrl: string;
    comments: PRCommentData[];
    prNumber: number;
}> = ({ author, avatarUrl, comments, prNumber }) => {
    const [collapsed, setCollapsed] = useState(false);

    return (
        <div className="border border-border rounded overflow-hidden">
            <button
                className="w-full flex items-center gap-2 px-3 py-1.5 bg-card hover:bg-fg/5 transition-colors"
                onClick={() => setCollapsed(!collapsed)}
            >
                {collapsed ? <ChevronRight size={12} className="text-fg/40" /> : <ChevronDown size={12} className="text-fg/40" />}
                {avatarUrl && (
                    <img src={avatarUrl} alt={author} className="w-4 h-4 rounded-full" />
                )}
                <span className="text-[11px] font-medium">{author}</span>
                <span className="text-[10px] text-fg/40">({comments.length})</span>
            </button>
            {!collapsed && (
                <div className="flex flex-col gap-2 p-2 border-t border-border">
                    {comments.map((c) => (
                        <CommentCard key={c.id} comment={c} prNumber={prNumber} />
                    ))}
                </div>
            )}
        </div>
    );
};

const EMPTY_REVIEWERS: { login: string; avatarUrl: string }[] = [];

/** Reviewer request picker + current reviewer list */
const ReviewerSection: React.FC<{ prNumber: number; prAuthor: string }> = ({ prNumber, prAuthor }) => {
    const requestedReviewers = usePRStore((s) => s.selectedPRDetail?.requestedReviewers ?? EMPTY_REVIEWERS);
    const collaborators = usePRStore((s) => s.collaborators);
    const isRequestingReview = usePRStore((s) => s.isRequestingReview);
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Fetch collaborators when dropdown opens
    const handleOpen = useCallback(() => {
        if (!open) {
            postMessage('prs.getCollaborators', {});
        }
        setOpen(!open);
        setSearch('');
        setTimeout(() => inputRef.current?.focus(), 50);
    }, [open]);

    // Close on click outside
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const handleRequestReview = useCallback(
        (login: string) => {
            postMessage('prs.requestReview', { prNumber, reviewers: [login] });
            setOpen(false);
            setSearch('');
        },
        [prNumber],
    );

    const handleRemoveReviewer = useCallback(
        (login: string) => {
            postMessage('prs.removeReviewRequest', { prNumber, reviewer: login });
        },
        [prNumber],
    );

    // Filter out already-requested reviewers and the PR author from the picker
    const requestedLogins = new Set(requestedReviewers.map((r) => r.login));
    const available = collaborators.filter(
        (c) =>
            !requestedLogins.has(c.login) &&
            c.login.toLowerCase() !== prAuthor.toLowerCase() &&
            (search === '' || c.login.toLowerCase().includes(search.toLowerCase())),
    );

    return (
        <div className="flex items-center gap-2 flex-wrap mt-2">
            <span className="text-[10px] text-fg/40 flex items-center gap-1">
                <Users size={10} />
                Reviewers:
            </span>
            {/* Current requested reviewers */}
            {requestedReviewers.map((r) => (
                <span
                    key={r.login}
                    className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 rounded-full"
                >
                    {r.avatarUrl && (
                        <img src={r.avatarUrl} alt={r.login} className="w-3 h-3 rounded-full" />
                    )}
                    {r.login}
                    <button
                        className="ml-0.5 hover:text-red-400 transition-colors"
                        onClick={() => handleRemoveReviewer(r.login)}
                        title={`Remove ${r.login}`}
                    >
                        <X size={8} />
                    </button>
                </span>
            ))}
            {requestedReviewers.length === 0 && (
                <span className="text-[10px] text-fg/20">None</span>
            )}

            {/* Add reviewer button + dropdown */}
            <div className="relative" ref={dropdownRef}>
                <button
                    className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-fg/40 hover:text-fg border border-border rounded transition-colors"
                    onClick={handleOpen}
                    title="Request review"
                    disabled={isRequestingReview}
                >
                    {isRequestingReview ? (
                        <Loader2 size={10} className="animate-spin" />
                    ) : (
                        <UserPlus size={10} />
                    )}
                    Request
                </button>
                {open && (
                    <div className="absolute right-0 top-full mt-1 z-20 bg-card border border-border rounded shadow-lg min-w-[200px] max-h-60 flex flex-col">
                        <div className="p-1.5 border-b border-border">
                            <input
                                ref={inputRef}
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search users…"
                                className="w-full px-2 py-1 text-[10px] bg-input border border-border rounded focus:border-accent focus:outline-none"
                            />
                        </div>
                        <div className="overflow-y-auto flex-1">
                            {collaborators.length === 0 ? (
                                <div className="px-2 py-3 text-[10px] text-fg/30 text-center">
                                    Loading collaborators…
                                </div>
                            ) : available.length === 0 ? (
                                <div className="px-2 py-3 text-[10px] text-fg/30 text-center">
                                    {search ? 'No matching users' : 'All collaborators already requested'}
                                </div>
                            ) : (
                                available.map((c) => (
                                    <button
                                        key={c.login}
                                        className="w-full flex items-center gap-2 px-2 py-1.5 text-[10px] hover:bg-fg/5 transition-colors text-left"
                                        onClick={() => handleRequestReview(c.login)}
                                    >
                                        {c.avatarUrl && (
                                            <img
                                                src={c.avatarUrl}
                                                alt={c.login}
                                                className="w-4 h-4 rounded-full"
                                            />
                                        )}
                                        <span>{c.login}</span>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Copilot review button — only if not already requested */}
            {!requestedLogins.has('copilot') && (
                <button
                    className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-purple-400/70 hover:text-purple-400 border border-purple-400/20 hover:border-purple-400/40 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    onClick={() => handleRequestReview('copilot')}
                    title="Request Copilot code review"
                    disabled={isRequestingReview}
                >
                    <Bot size={10} />
                    Copilot
                </button>
            )}
        </div>
    );
};

/** Comment filter bar */
const CommentFilterBar: React.FC<{ totalComments: number; filteredCount: number }> = ({ totalComments, filteredCount }) => {
    const groupByUser = usePRStore((s) => s.commentGroupByUser);
    const setGroupByUser = usePRStore((s) => s.setCommentGroupByUser);

    return (
        <div className="flex items-center gap-2 flex-wrap">
            <Filter size={10} className="text-fg/40" />
            <UserFilterDropdown />
            <ResolvedFilter />
            <div className="h-3 w-px bg-border" />
            <button
                className={`flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded border transition-colors ${
                    groupByUser
                        ? 'border-accent text-accent bg-accent/10'
                        : 'border-border text-fg/50 hover:text-fg'
                }`}
                onClick={() => setGroupByUser(!groupByUser)}
                title="Group comments by user"
            >
                <Users size={10} />
                Group
            </button>
            {filteredCount !== totalComments && (
                <span className="text-[9px] text-fg/30">
                    {filteredCount}/{totalComments}
                </span>
            )}
        </div>
    );
};

interface PRDetailProps {
    onClose: () => void;
}

export const PRDetail: React.FC<PRDetailProps> = ({ onClose }) => {
    const prs = usePRStore((s) => s.prs);
    const selectedPRNumber = usePRStore((s) => s.selectedPRNumber);
    const selectedPRDetail = usePRStore((s) => s.selectedPRDetail);
    const comments = usePRStore((s) => s.comments);
    const commentUserFilter = usePRStore((s) => s.commentUserFilter);
    const commentResolvedFilter = usePRStore((s) => s.commentResolvedFilter);
    const groupByUser = usePRStore((s) => s.commentGroupByUser);
    const isCommentsLoading = usePRStore((s) => s.isCommentsLoading);
    const isCommentSaving = usePRStore((s) => s.isCommentSaving);

    const selectedPR = useMemo(() => {
        if (selectedPRNumber === null) return undefined;
        return prs.find((pr) => pr.number === selectedPRNumber);
    }, [prs, selectedPRNumber]);

    const filteredComments = useMemo(() => {
        let result = comments;
        if (commentUserFilter.length > 0) {
            result = result.filter((c) => commentUserFilter.includes(c.author));
        }
        if (commentResolvedFilter === 'resolved') {
            result = result.filter((c) => c.isResolved === true);
        } else if (commentResolvedFilter === 'unresolved') {
            result = result.filter((c) => c.isResolved !== true);
        }
        return result;
    }, [comments, commentUserFilter, commentResolvedFilter]);

    const groupedComments = useMemo(() => {
        const groupMap = new Map<string, CommentGroup>();
        for (const comment of filteredComments) {
            const existing = groupMap.get(comment.author);
            if (existing) {
                existing.comments.push(comment);
            } else {
                groupMap.set(comment.author, {
                    author: comment.author,
                    authorAvatarUrl: comment.authorAvatarUrl,
                    comments: [comment],
                });
            }
        }
        return [...groupMap.values()];
    }, [filteredComments]);

    const [newComment, setNewComment] = useState('');

    // Use detail (full) data if available, otherwise fall back to list data
    const pr = selectedPRDetail ?? selectedPR;

    const handleOpenInBrowser = useCallback(() => {
        if (pr) {
            postMessage('prs.openInBrowser', { prNumber: pr.number });
        }
    }, [pr]);

    const handleCopyAll = useCallback(() => {
        if (filteredComments.length === 0) return;

        const title = pr ? `# PR #${pr.number}: ${pr.title}` : '# PR Comments';
        const commentBlocks = filteredComments.map((c) => {
            if (c.isReviewComment) {
                const parts: string[] = [];
                // Header with author and status badge
                const status = c.isResolved
                    ? ` — ✅ Resolved${c.resolvedBy ? ` by ${c.resolvedBy}` : ''}`
                    : '';
                parts.push(`### **${c.author}**${status}`);

                // File location
                if (c.path) {
                    const loc = c.line != null ? `${c.path}:${c.line}` : c.path;
                    parts.push(`> 📄 \`${loc}\``);
                }

                // Comment body
                parts.push(c.body);

                // Code snippet from diff hunk
                if (c.diffHunk) {
                    const lines = c.diffHunk.split('\n');
                    const snippet = lines.slice(-5).join('\n');
                    parts.push(`\`\`\`diff\n${snippet}\n\`\`\``);
                }

                return parts.join('\n\n');
            } else {
                // Issue comment
                return `### **${c.author}** · ${formatRelative(c.createdAt)}\n\n${c.body}`;
            }
        });

        const formatted = [title, '', ...commentBlocks].join('\n\n---\n\n');
        postMessage('prs.copyAllComments', { body: formatted });
    }, [filteredComments, pr]);

    const handleSubmitComment = useCallback(() => {
        if (!pr || !newComment.trim()) return;
        postMessage('prs.createComment', { prNumber: pr.number, body: newComment.trim() });
        setNewComment('');
    }, [pr, newComment]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSubmitComment();
            }
        },
        [handleSubmitComment],
    );

    if (!pr) {
        return (
            <div className="h-full flex items-center justify-center text-fg/30 text-[11px]">
                Select a PR to view details
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="flex-shrink-0 border-b border-border p-3">
                <div className="flex items-start gap-2">
                    <StateIcon state={pr.state} isDraft={pr.isDraft} />
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[13px] font-medium">{pr.title}</span>
                            <span className="text-fg/40 text-[11px]">#{pr.number}</span>
                            <StateBadge state={pr.state} isDraft={pr.isDraft} />
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-fg/40 flex-wrap">
                            <span className="flex items-center gap-1">
                                <GitBranch size={10} />
                                {pr.branch} → {pr.baseBranch}
                            </span>
                            <span className="flex items-center gap-1">
                                <Clock size={10} />
                                {formatRelative(pr.updatedAt)}
                            </span>
                            {selectedPRDetail && (
                                <span className="flex items-center gap-1">
                                    <FileDiff size={10} />
                                    <span className="text-green-400">+{pr.additions}</span>
                                    <span className="text-red-400">-{pr.deletions}</span>
                                    <span>· {pr.changedFiles} files</span>
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                            className="p-1 text-fg/40 hover:text-fg transition-colors"
                            onClick={handleOpenInBrowser}
                            title="Open in browser"
                        >
                            <ExternalLink size={13} />
                        </button>
                        <button
                            className="p-1 text-fg/40 hover:text-fg transition-colors"
                            onClick={onClose}
                            title="Close"
                        >
                            <X size={13} />
                        </button>
                    </div>
                </div>

                {/* Labels */}
                {pr.labels.length > 0 && (
                    <div className="flex items-center gap-1 mt-2 flex-wrap">
                        {pr.labels.map((l) => (
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

                {/* Reviewers (open PRs only) */}
                {pr.state === 'open' && (
                    <ReviewerSection prNumber={pr.number} prAuthor={pr.author} />
                )}
            </div>

            {/* Body + Comments scrollable area */}
            <div className="flex-1 overflow-y-auto">
                {/* PR description */}
                {pr.body && (
                    <div className="px-3 py-3 border-b border-border">
                        <div className="text-[10px] text-fg/40 uppercase tracking-wider mb-1.5 font-medium">
                            Description
                        </div>
                        <MarkdownBody content={pr.body} className="text-fg/80" />
                    </div>
                )}

                {/* Comments section */}
                <div className="px-3 py-3">
                    <div className="flex items-center gap-2 mb-2">
                        <MessageSquare size={12} className="text-fg/40" />
                        <span className="text-[10px] text-fg/40 uppercase tracking-wider font-medium">
                            Comments ({comments.length})
                        </span>
                        <div className="flex-1" />
                        {filteredComments.length > 0 && (
                            <button
                                className="flex items-center gap-1 text-[10px] text-fg/40 hover:text-fg transition-colors"
                                onClick={handleCopyAll}
                                title="Copy all filtered comments"
                            >
                                <Copy size={10} />
                                Copy all
                            </button>
                        )}
                    </div>

                    {/* Filter bar */}
                    {comments.length > 0 && (
                        <div className="mb-3">
                            <CommentFilterBar totalComments={comments.length} filteredCount={filteredComments.length} />
                        </div>
                    )}

                    {isCommentsLoading ? (
                        <div className="text-center py-4 text-fg/40 text-[11px]">
                            Loading comments…
                        </div>
                    ) : comments.length === 0 ? (
                        <div className="text-center py-4 text-fg/30 text-[11px]">
                            No comments yet
                        </div>
                    ) : filteredComments.length === 0 ? (
                        <div className="text-center py-4 text-fg/30 text-[11px]">
                            No comments match filters
                        </div>
                    ) : groupByUser ? (
                        <div className="flex flex-col gap-2">
                            {groupedComments.map((group) => (
                                <UserGroup
                                    key={group.author}
                                    author={group.author}
                                    avatarUrl={group.authorAvatarUrl}
                                    comments={group.comments}
                                    prNumber={pr!.number}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {filteredComments.map((c) => (
                                <CommentCard key={c.id} comment={c} prNumber={pr!.number} />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* New comment input */}
            <div className="flex-shrink-0 border-t border-border p-3">
                <div className="flex gap-2">
                    <textarea
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Leave a comment… (⌘+Enter to submit)"
                        rows={2}
                        className="flex-1 px-2 py-1.5 text-[11px] bg-input border border-border rounded resize-none focus:border-accent focus:outline-none"
                    />
                    <button
                        className="self-end p-2 bg-accent text-white rounded hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                        onClick={handleSubmitComment}
                        disabled={!newComment.trim() || isCommentSaving}
                        title="Post comment"
                    >
                        <Send size={13} />
                    </button>
                </div>
                {isCommentSaving && (
                    <div className="text-[10px] text-fg/40 mt-1">Posting comment…</div>
                )}
            </div>
        </div>
    );
};
