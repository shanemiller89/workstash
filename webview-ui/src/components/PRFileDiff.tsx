import React, { useState, useCallback, useMemo, useRef } from 'react';
import { usePRStore, type PRFileData, type PendingInlineComment } from '../prStore';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { cn } from '@/lib/utils';
import {
    File,
    Plus,
    X,
    Send,
    MessageSquare,
    ArrowRight,
} from 'lucide-react';

/** Status badge config */
const statusConfig: Record<string, { label: string; fullLabel: string; color: string; bg: string }> = {
    added: { label: 'A', fullLabel: 'Added', color: 'text-added', bg: 'bg-added/15' },
    removed: { label: 'D', fullLabel: 'Deleted', color: 'text-deleted', bg: 'bg-deleted/15' },
    modified: { label: 'M', fullLabel: 'Modified', color: 'text-modified', bg: 'bg-modified/15' },
    renamed: { label: 'R', fullLabel: 'Renamed', color: 'text-accent', bg: 'bg-accent/15' },
    copied: { label: 'C', fullLabel: 'Copied', color: 'text-added', bg: 'bg-added/15' },
    changed: { label: 'M', fullLabel: 'Changed', color: 'text-modified', bg: 'bg-modified/15' },
    unchanged: { label: 'U', fullLabel: 'Unchanged', color: 'text-fg/30', bg: 'bg-fg/5' },
};

interface DiffLine {
    type: 'add' | 'del' | 'context' | 'hunk';
    content: string;
    oldLineNo?: number;
    newLineNo?: number;
}

function parseDiff(raw: string): DiffLine[] {
    if (!raw.trim()) { return []; }

    const lines = raw.split('\n');
    const result: DiffLine[] = [];
    let oldLine = 0;
    let newLine = 0;

    for (const line of lines) {
        if (
            line.startsWith('diff --git') ||
            line.startsWith('index ') ||
            line.startsWith('---') ||
            line.startsWith('+++')
        ) {
            continue;
        }

        if (line.startsWith('@@')) {
            const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/);
            oldLine = match ? parseInt(match[1], 10) : 0;
            newLine = match ? parseInt(match[2], 10) : 0;
            const context = match?.[3]?.trim() ?? '';
            result.push({ type: 'hunk', content: context ? `@@ ${context}` : '@@' });
            continue;
        }

        if (line.startsWith('+')) {
            result.push({ type: 'add', content: line.slice(1), newLineNo: newLine });
            newLine++;
        } else if (line.startsWith('-')) {
            result.push({ type: 'del', content: line.slice(1), oldLineNo: oldLine });
            oldLine++;
        } else if (line.startsWith(' ') || line === '') {
            result.push({
                type: 'context',
                content: line.slice(1) || '',
                oldLineNo: oldLine,
                newLineNo: newLine,
            });
            oldLine++;
            newLine++;
        }
    }

    return result;
}

/** Inline comment form that appears below a diff line */
const InlineCommentForm: React.FC<{
    filePath: string;
    line: number;
    onSubmit: (comment: PendingInlineComment) => void;
    onCancel: () => void;
}> = ({ filePath, line, onSubmit, onCancel }) => {
    const [body, setBody] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    React.useEffect(() => {
        textareaRef.current?.focus();
    }, []);

    const handleSubmit = useCallback(() => {
        if (!body.trim()) { return; }
        onSubmit({ path: filePath, line, body: body.trim() });
        setBody('');
    }, [body, filePath, line, onSubmit]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSubmit();
            }
            if (e.key === 'Escape') {
                onCancel();
            }
        },
        [handleSubmit, onCancel],
    );

    return (
        <div className="border border-accent/30 rounded mx-2 my-1 bg-card">
            <div className="flex items-center gap-1.5 px-2 py-1 border-b border-border text-[10px] text-fg/40">
                <MessageSquare size={10} />
                <span>Comment on line {line}</span>
                <span className="font-mono truncate">{filePath}</span>
            </div>
            <div className="p-2">
                <Textarea
                    ref={textareaRef}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Add a review comment… (⌘+Enter to add, Esc to cancel)"
                    rows={2}
                    className="text-[11px]"
                />
                <div className="flex items-center gap-2 mt-1.5">
                    <Button
                        size="sm"
                        className="h-6 text-[10px] gap-1"
                        onClick={handleSubmit}
                        disabled={!body.trim()}
                    >
                        <Send size={10} />
                        Add comment
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] text-fg/50"
                        onClick={onCancel}
                    >
                        Cancel
                    </Button>
                </div>
            </div>
        </div>
    );
};

/** Display a pending inline comment that's been added */
const PendingCommentBadge: React.FC<{
    comment: PendingInlineComment;
    index: number;
    onRemove: (index: number) => void;
}> = ({ comment, index, onRemove }) => (
    <div className="flex items-center gap-2 mx-2 my-1 px-2 py-1.5 rounded border border-yellow-400/30 bg-yellow-400/[0.05] text-[11px]">
        <MessageSquare size={10} className="text-yellow-400 shrink-0" />
        <span className="truncate text-fg/70">{comment.body}</span>
        <Badge
            variant="outline"
            className="text-[8px] px-1 py-0 shrink-0 border-yellow-400/30 text-yellow-400 bg-yellow-400/10"
        >
            Pending
        </Badge>
        <Button
            variant="ghost"
            size="icon-xs"
            className="ml-auto text-fg/30 hover:text-red-400 shrink-0"
            onClick={() => onRemove(index)}
            title="Remove comment"
        >
            <X size={10} />
        </Button>
    </div>
);

export const PRFileDiff: React.FC = () => {
    const prFiles = usePRStore((s) => s.prFiles);
    const selectedFilePath = usePRStore((s) => s.selectedFilePath);
    const pendingComments = usePRStore((s) => s.pendingReviewComments);
    const addPendingComment = usePRStore((s) => s.addPendingComment);
    const removePendingComment = usePRStore((s) => s.removePendingComment);

    // Track which line has the inline comment form open
    const [commentLine, setCommentLine] = useState<number | null>(null);

    const file = useMemo(
        () => prFiles.find((f) => f.filename === selectedFilePath),
        [prFiles, selectedFilePath],
    );

    const diffLines = useMemo(() => {
        if (!file?.patch) { return []; }
        return parseDiff(file.patch);
    }, [file]);

    // Pending comments for this file, with their original indices
    const fileComments = useMemo(() => {
        if (!file) { return []; }
        return pendingComments
            .map((c, i) => ({ comment: c, index: i }))
            .filter((c) => c.comment.path === file.filename);
    }, [pendingComments, file]);

    // Map of line → pending comment indices for highlighting
    const commentLineMap = useMemo(() => {
        const map = new Map<number, number[]>();
        for (const { comment, index } of fileComments) {
            const existing = map.get(comment.line) ?? [];
            existing.push(index);
            map.set(comment.line, existing);
        }
        return map;
    }, [fileComments]);

    const handleAddComment = useCallback(
        (comment: PendingInlineComment) => {
            addPendingComment(comment);
            setCommentLine(null);
        },
        [addPendingComment],
    );

    if (!file) {
        return (
            <div className="h-full flex items-center justify-center text-fg/30 text-[11px]">
                Select a file to view diff
            </div>
        );
    }

    const cfg = statusConfig[file.status] ?? statusConfig.changed;

    // Calculate gutter width based on max line number
    const maxLineNo = diffLines.reduce((max, l) => {
        return Math.max(max, l.oldLineNo ?? 0, l.newLineNo ?? 0);
    }, 0);
    const gutterWidth = Math.max(String(maxLineNo).length, 3);

    return (
        <div className="h-full flex flex-col">
            {/* File header */}
            <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border bg-card">
                <File size={12} className="text-fg/40 shrink-0" />
                <span className="text-[11px] font-mono truncate">
                    {file.previousFilename && (
                        <>
                            <span className="text-fg/40">{file.previousFilename}</span>
                            <ArrowRight size={10} className="inline mx-1 text-fg/30" />
                        </>
                    )}
                    {file.filename}
                </span>
                <Badge
                    variant="outline"
                    className={cn(
                        'text-[9px] px-1.5 py-0 border-none font-medium shrink-0',
                        cfg.color,
                        cfg.bg,
                    )}
                >
                    {cfg.fullLabel}
                </Badge>
                <div className="flex-1" />
                <span className="text-[10px] text-added shrink-0">+{file.additions}</span>
                <span className="text-[10px] text-deleted shrink-0">-{file.deletions}</span>
                {fileComments.length > 0 && (
                    <Badge
                        variant="outline"
                        className="text-[9px] px-1.5 py-0 border-yellow-400/30 text-yellow-400 bg-yellow-400/10 gap-0.5 shrink-0"
                    >
                        <MessageSquare size={8} />
                        {fileComments.length}
                    </Badge>
                )}
            </div>

            {/* Diff content */}
            <div className="flex-1 overflow-y-auto">
                {!file.patch ? (
                    <div className="px-3 py-4 text-[11px] text-fg/30 italic text-center">
                        {file.status === 'removed'
                            ? 'File was deleted'
                            : 'Binary file or no diff available'}
                    </div>
                ) : (
                    <div className="text-[11px] font-mono leading-[18px]">
                        {diffLines.map((line, i) => {
                            // The effective line number for inline comments
                            const lineNo = line.newLineNo ?? line.oldLineNo;
                            const hasComments = lineNo !== undefined && commentLineMap.has(lineNo);

                            if (line.type === 'hunk') {
                                return (
                                    <div
                                        key={i}
                                        className="bg-accent/10 text-accent px-3 py-0.5 text-[10px] select-none border-y border-border/30"
                                    >
                                        {line.content}
                                    </div>
                                );
                            }

                            const bgClass =
                                line.type === 'add'
                                    ? hasComments
                                        ? 'bg-yellow-400/15'
                                        : 'bg-added/10'
                                    : line.type === 'del'
                                      ? hasComments
                                          ? 'bg-yellow-400/15'
                                          : 'bg-deleted/10'
                                      : hasComments
                                        ? 'bg-yellow-400/[0.07]'
                                        : '';

                            const textClass =
                                line.type === 'add'
                                    ? 'text-added'
                                    : line.type === 'del'
                                      ? 'text-deleted'
                                      : 'text-fg';

                            const prefix = line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' ';

                            const oldNo =
                                line.oldLineNo !== undefined
                                    ? String(line.oldLineNo).padStart(gutterWidth)
                                    : ' '.repeat(gutterWidth);
                            const newNo =
                                line.newLineNo !== undefined
                                    ? String(line.newLineNo).padStart(gutterWidth)
                                    : ' '.repeat(gutterWidth);

                            return (
                                <React.Fragment key={i}>
                                    <div className={`group/line flex ${bgClass}`}>
                                        {/* Comment gutter button */}
                                        <span
                                            className="w-4 shrink-0 flex items-center justify-center cursor-pointer"
                                            onClick={() => {
                                                if (lineNo !== undefined) {
                                                    setCommentLine(
                                                        commentLine === lineNo ? null : lineNo,
                                                    );
                                                }
                                            }}
                                        >
                                            <Plus
                                                size={10}
                                                className="text-accent opacity-0 group-hover/line:opacity-70 transition-opacity"
                                            />
                                        </span>
                                        {/* Line numbers */}
                                        <span
                                            className="opacity-30 select-none pr-1 text-right shrink-0"
                                            style={{ minWidth: `${gutterWidth + 1}ch` }}
                                        >
                                            {line.type === 'del'
                                                ? oldNo
                                                : line.type === 'add'
                                                  ? ''
                                                  : oldNo}
                                        </span>
                                        <span
                                            className="opacity-30 select-none pr-2 text-right shrink-0"
                                            style={{ minWidth: `${gutterWidth + 1}ch` }}
                                        >
                                            {line.type === 'add'
                                                ? newNo
                                                : line.type === 'del'
                                                  ? ''
                                                  : newNo}
                                        </span>
                                        <span
                                            className={`opacity-50 select-none w-3 shrink-0 text-center ${textClass}`}
                                        >
                                            {prefix}
                                        </span>
                                        <span className={`${textClass} whitespace-pre`}>
                                            {line.content}
                                        </span>
                                    </div>

                                    {/* Inline comment form */}
                                    {commentLine === lineNo && lineNo !== undefined && (
                                        <InlineCommentForm
                                            filePath={file.filename}
                                            line={lineNo}
                                            onSubmit={handleAddComment}
                                            onCancel={() => setCommentLine(null)}
                                        />
                                    )}

                                    {/* Pending comments on this line */}
                                    {lineNo !== undefined &&
                                        commentLineMap.get(lineNo)?.map((idx) => (
                                            <PendingCommentBadge
                                                key={idx}
                                                comment={pendingComments[idx]}
                                                index={idx}
                                                onRemove={removePendingComment}
                                            />
                                        ))}
                                </React.Fragment>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};
