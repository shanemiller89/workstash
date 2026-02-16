import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useNotesStore } from '../notesStore';
import { postMessage } from '../vscode';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import taskLists from 'markdown-it-task-lists';
import mermaid from 'mermaid';
import {
    Globe,
    Lock,
    Link2,
    Trash2,
    X,
    StickyNote,
    ToggleLeft,
    ToggleRight,
    Bold,
    Italic,
    Strikethrough,
    Heading1,
    Heading2,
    Heading3,
    Code,
    List,
    ListOrdered,
    ListChecks,
    Quote,
    Minus,
    ImageIcon,
    Link as LinkIcon,
    Table,
    WrapText,
    FolderGit2,
    Unlink,
    Stamp,
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Separator } from './ui/separator';

// ─── Mermaid Initialization ───────────────────────────────────────

mermaid.initialize({
    startOnLoad: false,
    theme: document.body.classList.contains('vscode-light') ? 'default' : 'dark',
    securityLevel: 'loose',
    fontFamily: 'var(--vscode-font-family)',
});

// ─── Markdown-it Configuration ────────────────────────────────────

/** Escape HTML entities in a string */
function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Monotonically increasing counter for unique mermaid diagram IDs */
let mermaidCounter = 0;

const md = new MarkdownIt({
    html: false, // Disable raw HTML for safety
    linkify: true, // Autoconvert URLs to links
    typographer: true, // Smart quotes, dashes
    highlight: (str: string, lang: string): string => {
        // Mermaid code blocks → render as diagram placeholder
        if (lang === 'mermaid') {
            const id = `mermaid-${++mermaidCounter}`;
            return `<div class="mermaid-block" data-mermaid-id="${id}">${escapeHtml(str)}</div>`;
        }
        if (lang && hljs.getLanguage(lang)) {
            try {
                return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang }).value}</code></pre>`;
            } catch {
                /* fallback */
            }
        }
        return `<pre class="hljs"><code>${escapeHtml(str)}</code></pre>`;
    },
});

// Enable GFM task lists
md.use(taskLists, { enabled: true, label: true, labelAfter: true });

// ─── Component ────────────────────────────────────────────────────

export const NoteEditor: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
    const note = useNotesStore((s) => s.selectedNote());
    const editingContent = useNotesStore((s) => s.editingContent);
    const editingTitle = useNotesStore((s) => s.editingTitle);
    const isDirty = useNotesStore((s) => s.isDirty);
    const isSaving = useNotesStore((s) => s.isSaving);
    const isLoading = useNotesStore((s) => s.isLoading);
    const previewMode = useNotesStore((s) => s.previewMode);
    const setEditingContent = useNotesStore((s) => s.setEditingContent);
    const setEditingTitle = useNotesStore((s) => s.setEditingTitle);
    const setPreviewMode = useNotesStore((s) => s.setPreviewMode);
    const setLoading = useNotesStore((s) => s.setLoading);
    const currentRepo = useNotesStore((s) => s.currentRepo);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [autosaveCountdown, setAutosaveCountdown] = useState<number | null>(null);
    const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const contentRequestedRef = useRef<string | null>(null);

    // Read editor.tabSize setting (posted from extension, fallback to 4)
    const [tabSize] = useState(4); // Will be updated via message from extension

    // ─── Lazy Content Fetch ───────────────────────────────────────
    // When a note is selected but has no content (list API doesn't include it),
    // request the full content from the extension host.
    useEffect(() => {
        if (note && !note.content && !isDirty && contentRequestedRef.current !== note.id) {
            contentRequestedRef.current = note.id;
            setLoading(true);
            postMessage('notes.loadNote', { noteId: note.id });
        } else if (note && note.content && contentRequestedRef.current === note.id) {
            // Content arrived — clear the request flag
            contentRequestedRef.current = null;
        }
    }, [note, note?.id, note?.content, isDirty, setLoading]);

    // ─── Autosave Logic ───────────────────────────────────────────

    const triggerSave = useCallback(() => {
        if (!note || !isDirty) return;
        postMessage('notes.save', {
            noteId: note.id,
            title: editingTitle,
            content: editingContent,
        });
    }, [note, isDirty, editingTitle, editingContent]);

    const resetAutosave = useCallback(() => {
        // Clear existing timers
        if (autosaveTimerRef.current) {
            clearTimeout(autosaveTimerRef.current);
        }
        if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
        }

        if (!isDirty || !note) {
            setAutosaveCountdown(null);
            return;
        }

        // Start 30-second countdown
        let remaining = 30;
        setAutosaveCountdown(remaining);

        countdownIntervalRef.current = setInterval(() => {
            remaining--;
            setAutosaveCountdown(remaining > 0 ? remaining : null);
            if (remaining <= 0 && countdownIntervalRef.current) {
                clearInterval(countdownIntervalRef.current);
            }
        }, 1000);

        autosaveTimerRef.current = setTimeout(() => {
            triggerSave();
        }, 30_000);
    }, [isDirty, note, triggerSave]);

    // Reset autosave when content changes
    useEffect(() => {
        if (isDirty) {
            resetAutosave();
        }
        return () => {
            if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        };
    }, [editingContent, editingTitle]);

    // ─── Formatting Toolbar Helpers ───────────────────────────────

    /** Insert markdown formatting around the current selection or at cursor */
    const insertFormatting = useCallback(
        (before: string, after: string = '', placeholder: string = '') => {
            const textarea = textareaRef.current;
            if (!textarea) return;

            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const selected = editingContent.slice(start, end);
            const text = selected || placeholder;
            const newValue =
                editingContent.slice(0, start) + before + text + after + editingContent.slice(end);
            setEditingContent(newValue);

            // Position cursor / selection after React re-render
            requestAnimationFrame(() => {
                textarea.focus();
                if (selected) {
                    // Select the wrapped text
                    textarea.selectionStart = start + before.length;
                    textarea.selectionEnd = start + before.length + text.length;
                } else {
                    // Select the placeholder
                    textarea.selectionStart = start + before.length;
                    textarea.selectionEnd = start + before.length + placeholder.length;
                }
            });
        },
        [editingContent, setEditingContent],
    );

    /** Insert markdown at the start of the current line */
    const insertLinePrefix = useCallback(
        (prefix: string) => {
            const textarea = textareaRef.current;
            if (!textarea) return;

            const start = textarea.selectionStart;
            // Find the start of the current line
            const lineStart = editingContent.lastIndexOf('\n', start - 1) + 1;
            const newValue =
                editingContent.slice(0, lineStart) + prefix + editingContent.slice(lineStart);
            setEditingContent(newValue);

            requestAnimationFrame(() => {
                textarea.focus();
                textarea.selectionStart = textarea.selectionEnd = start + prefix.length;
            });
        },
        [editingContent, setEditingContent],
    );

    /** Insert a table template */
    const insertTable = useCallback(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const table = '\n| Header | Header |\n| ------ | ------ |\n| Cell   | Cell   |\n';
        const newValue = editingContent.slice(0, start) + table + editingContent.slice(start);
        setEditingContent(newValue);

        requestAnimationFrame(() => {
            textarea.focus();
            // Select first "Header"
            textarea.selectionStart = start + 3;
            textarea.selectionEnd = start + 9;
        });
    }, [editingContent, setEditingContent]);

    // ─── Tab Key Handling ─────────────────────────────────────────

    const handleTextareaKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const textarea = textareaRef.current;
                if (!textarea) return;

                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const spaces = ' '.repeat(tabSize);
                const newValue =
                    editingContent.slice(0, start) + spaces + editingContent.slice(end);
                setEditingContent(newValue);

                // Restore cursor position after React re-render
                requestAnimationFrame(() => {
                    textarea.selectionStart = textarea.selectionEnd = start + tabSize;
                });
            }

            // Cmd/Ctrl+B → bold
            if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
                e.preventDefault();
                insertFormatting('**', '**', 'bold');
            }

            // Cmd/Ctrl+I → italic
            if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
                e.preventDefault();
                insertFormatting('*', '*', 'italic');
            }
        },
        [editingContent, setEditingContent, tabSize, insertFormatting],
    );

    // ─── Manual Save ──────────────────────────────────────────────

    const handleSave = useCallback(() => {
        if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        setAutosaveCountdown(null);
        triggerSave();
    }, [triggerSave]);

    // ─── Rendered Markdown ────────────────────────────────────────

    const renderedHtml = useMemo(() => {
        if (!previewMode) return '';
        return md.render(editingContent);
    }, [previewMode, editingContent]);

    // ─── Mermaid Diagram Rendering ────────────────────────────────

    const previewContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!previewMode || !previewContainerRef.current) return;

        const blocks = previewContainerRef.current.querySelectorAll('.mermaid-block');
        if (blocks.length === 0) return;

        blocks.forEach(async (block) => {
            const id = block.getAttribute('data-mermaid-id');
            const code = block.textContent || '';
            if (!id || !code.trim()) return;

            try {
                const { svg } = await mermaid.render(id, code.trim());
                block.innerHTML = svg;
                block.classList.add('mermaid-rendered');
            } catch {
                block.innerHTML = `<pre class="mermaid-error"><code>${escapeHtml(code)}</code></pre>`;
                block.classList.add('mermaid-error-block');
            }
        });
    }, [previewMode, renderedHtml]);

    // ─── Keyboard Shortcut ────────────────────────────────────────

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            // Cmd/Ctrl+S → save
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                handleSave();
            }
            // Escape → close
            if (e.key === 'Escape' && onClose) {
                e.preventDefault();
                onClose();
            }
        },
        [handleSave, onClose],
    );

    if (!note) {
        return (
            <div className="flex items-center justify-center h-full text-[12px] opacity-40">
                <div className="text-center space-y-2">
                    <span className="block">
                        <StickyNote size={24} className="mx-auto opacity-60" />
                    </span>
                    <span>Select a note to edit</span>
                </div>
            </div>
        );
    }

    if (isLoading && !editingContent) {
        return (
            <div className="flex items-center justify-center h-full text-[12px] opacity-40">
                <div className="text-center space-y-2">
                    <span className="block animate-pulse">
                        <StickyNote size={24} className="mx-auto opacity-60" />
                    </span>
                    <span>Loading note…</span>
                </div>
            </div>
        );
    }

    const lastSavedTime = new Date(note.updatedAt).toLocaleTimeString();

    return (
        <div
            className="flex flex-col h-full overflow-hidden"
            onKeyDown={handleKeyDown}
            tabIndex={-1}
        >
            {/* Header */}
            <div className="px-3 py-2 border-b border-border flex-shrink-0 space-y-2">
                {/* Title row */}
                <div className="flex items-center gap-2">
                    <Input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        placeholder="Note title…"
                        className="flex-1 border-none bg-transparent text-[14px] font-semibold shadow-none focus-visible:ring-0 placeholder:opacity-40"
                    />
                    {onClose && (
                        <Button
                            variant="ghost"
                            size="icon-xs"
                            className="opacity-40 hover:opacity-100"
                            onClick={onClose}
                            title="Close"
                        >
                            <X size={14} />
                        </Button>
                    )}
                </div>

                {/* Toolbar row */}
                <div className="flex items-center gap-2 text-[11px]">
                    {/* Edit / Preview toggle */}
                    <div className="flex rounded border border-border overflow-hidden">
                        <Button
                            variant={!previewMode ? 'default' : 'ghost'}
                            size="sm"
                            className="h-auto px-2 py-0.5 text-[11px] rounded-none"
                            onClick={() => setPreviewMode(false)}
                        >
                            Edit
                        </Button>
                        <Button
                            variant={previewMode ? 'default' : 'ghost'}
                            size="sm"
                            className="h-auto px-2 py-0.5 text-[11px] rounded-none"
                            onClick={() => setPreviewMode(true)}
                        >
                            Preview
                        </Button>
                    </div>

                    {/* Save button with dirty indicator */}
                    <Button
                        variant={isDirty ? 'default' : 'ghost'}
                        size="sm"
                        className="h-auto px-2 py-0.5 text-[11px] gap-1"
                        onClick={handleSave}
                        disabled={!isDirty || isSaving}
                        title={isDirty ? 'Save (Cmd+S)' : 'No unsaved changes'}
                    >
                        {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-warning" />}
                        {isSaving ? 'Saving…' : 'Save'}
                    </Button>

                    {/* Autosave countdown */}
                    {autosaveCountdown !== null && autosaveCountdown > 0 && (
                        <span className="opacity-30 text-[10px]">
                            Autosave in {autosaveCountdown}s
                        </span>
                    )}

                    <div className="flex-1" />

                    {/* Visibility toggle */}
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto px-1 py-0.5 text-[11px] gap-1 opacity-50 hover:opacity-100"
                        onClick={() => postMessage('notes.toggleVisibility', { noteId: note.id })}
                        title={
                            note.isPublic
                                ? 'Public gist — click to make secret'
                                : 'Secret gist — click to make public'
                        }
                    >
                        {note.isPublic ? (
                            <>
                                <Globe size={12} /> <span>Public</span>{' '}
                                <ToggleRight size={14} className="text-accent" />
                            </>
                        ) : (
                            <>
                                <Lock size={12} /> <span>Secret</span> <ToggleLeft size={14} />
                            </>
                        )}
                    </Button>

                    {/* Link / Unlink workspace */}
                    {note.linkedRepo ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-auto px-1 py-0.5 text-[11px] gap-1 opacity-50 hover:opacity-100"
                            onClick={() => postMessage('notes.unlinkFromRepo', { noteId: note.id })}
                            title={`Linked to ${note.linkedRepo} — click to unlink`}
                        >
                            <FolderGit2 size={12} className="text-accent" />
                            <span className="max-w-[80px] truncate">{note.linkedRepo.split('/')[1]}</span>
                            <Unlink size={10} />
                        </Button>
                    ) : currentRepo ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-auto px-1 py-0.5 text-[11px] gap-1 opacity-50 hover:opacity-100"
                            onClick={() => postMessage('notes.linkToRepo', { noteId: note.id })}
                            title={`Link this note to ${currentRepo}`}
                        >
                            <FolderGit2 size={12} />
                            <span>Link</span>
                        </Button>
                    ) : null}

                    {/* Add SPF marker */}
                    {!note.hasSpfMarker && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-auto px-1 py-0.5 text-[11px] gap-1 opacity-50 hover:opacity-100"
                            onClick={() => postMessage('notes.migrate', { noteId: note.id })}
                            title="Add SPF marker — migrates to Superprompt Forge naming"
                        >
                            <Stamp size={12} />
                            <span>Add SPF Marker</span>
                        </Button>
                    )}

                    {/* Copy link */}
                    <Button
                        variant="ghost"
                        size="icon-xs"
                        className="opacity-50 hover:opacity-100"
                        onClick={() => postMessage('notes.copyLink', { noteId: note.id })}
                        title="Copy gist URL"
                    >
                        <Link2 size={12} />
                    </Button>

                    {/* Delete */}
                    <Button
                        variant="ghost"
                        size="icon-xs"
                        className="opacity-50 hover:opacity-100 text-danger"
                        onClick={() => postMessage('notes.delete', { noteId: note.id })}
                        title="Delete note"
                    >
                        <Trash2 size={12} />
                    </Button>
                </div>
            </div>

            {/* Formatting toolbar — edit mode only */}
            {!previewMode && (
                <div className="px-3 py-1 border-b border-border flex-shrink-0 flex items-center gap-0.5 flex-wrap">
                    <Button
                        variant="ghost"
                        size="icon-xs"
                        title="Bold (⌘B)"
                        onClick={() => insertFormatting('**', '**', 'bold')}
                    >
                        <Bold size={14} />
                    </Button>

                    <Button
                        variant="ghost"
                        size="icon-xs"
                        title="Italic (⌘I)"
                        onClick={() => insertFormatting('*', '*', 'italic')}
                    >
                        <Italic size={14} />
                    </Button>

                    <Button
                        variant="ghost"
                        size="icon-xs"
                        title="Strikethrough"
                        onClick={() => insertFormatting('~~', '~~', 'strikethrough')}
                    >
                        <Strikethrough size={14} />
                    </Button>

                    <Separator orientation="vertical" className="h-4 mx-1" />

                    <Button
                        variant="ghost"
                        size="icon-xs"
                        title="Heading 1"
                        onClick={() => insertLinePrefix('# ')}
                    >
                        <Heading1 size={14} />
                    </Button>

                    <Button
                        variant="ghost"
                        size="icon-xs"
                        title="Heading 2"
                        onClick={() => insertLinePrefix('## ')}
                    >
                        <Heading2 size={14} />
                    </Button>

                    <Button
                        variant="ghost"
                        size="icon-xs"
                        title="Heading 3"
                        onClick={() => insertLinePrefix('### ')}
                    >
                        <Heading3 size={14} />
                    </Button>

                    <Separator orientation="vertical" className="h-4 mx-1" />

                    <Button
                        variant="ghost"
                        size="icon-xs"
                        title="Inline code"
                        onClick={() => insertFormatting('`', '`', 'code')}
                    >
                        <Code size={14} />
                    </Button>

                    <Button
                        variant="ghost"
                        size="icon-xs"
                        title="Code block"
                        onClick={() => insertFormatting('```\n', '\n```', 'code block')}
                    >
                        <WrapText size={14} />
                    </Button>

                    <Separator orientation="vertical" className="h-4 mx-1" />

                    <Button
                        variant="ghost"
                        size="icon-xs"
                        title="Bullet list"
                        onClick={() => insertLinePrefix('- ')}
                    >
                        <List size={14} />
                    </Button>

                    <Button
                        variant="ghost"
                        size="icon-xs"
                        title="Numbered list"
                        onClick={() => insertLinePrefix('1. ')}
                    >
                        <ListOrdered size={14} />
                    </Button>

                    <Button
                        variant="ghost"
                        size="icon-xs"
                        title="Task list"
                        onClick={() => insertLinePrefix('- [ ] ')}
                    >
                        <ListChecks size={14} />
                    </Button>

                    <Separator orientation="vertical" className="h-4 mx-1" />

                    <Button
                        variant="ghost"
                        size="icon-xs"
                        title="Blockquote"
                        onClick={() => insertLinePrefix('> ')}
                    >
                        <Quote size={14} />
                    </Button>

                    <Button
                        variant="ghost"
                        size="icon-xs"
                        title="Horizontal rule"
                        onClick={() => insertFormatting('\n---\n', '', '')}
                    >
                        <Minus size={14} />
                    </Button>

                    <Separator orientation="vertical" className="h-4 mx-1" />

                    <Button
                        variant="ghost"
                        size="icon-xs"
                        title="Link"
                        onClick={() => insertFormatting('[', '](url)', 'link text')}
                    >
                        <LinkIcon size={14} />
                    </Button>

                    <Button
                        variant="ghost"
                        size="icon-xs"
                        title="Image"
                        onClick={() => insertFormatting('![', '](url)', 'alt text')}
                    >
                        <ImageIcon size={14} />
                    </Button>

                    <Button
                        variant="ghost"
                        size="icon-xs"
                        title="Table"
                        onClick={insertTable}
                    >
                        <Table size={14} />
                    </Button>
                </div>
            )}

            {/* Body */}
            <div className="flex-1 overflow-auto">
                {previewMode ? (
                    <div
                        ref={previewContainerRef}
                        className="markdown-body px-4 py-3"
                        dangerouslySetInnerHTML={{ __html: renderedHtml }}
                    />
                ) : (
                    <Textarea
                        ref={textareaRef}
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                        onKeyDown={handleTextareaKeyDown}
                        className="w-full h-full bg-transparent text-fg font-mono text-[12px] leading-[20px] px-4 py-3 border-none shadow-none focus-visible:ring-0 resize-none rounded-none"
                        placeholder="Write your note in Markdown…"
                        spellCheck={false}
                    />
                )}
            </div>

            {/* Footer */}
            <div className="px-3 py-1 border-t border-border text-[10px] opacity-30 flex items-center gap-3 flex-shrink-0">
                <span>Last saved: {lastSavedTime}</span>
                <span className="truncate flex-1 text-right">
                    <a
                        className="hover:underline cursor-pointer"
                        onClick={() => postMessage('notes.copyLink', { noteId: note.id })}
                    >
                        {note.htmlUrl}
                    </a>
                </span>
            </div>
        </div>
    );
};
