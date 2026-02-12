import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useNotesStore } from '../notesStore';
import { postMessage } from '../vscode';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import { Globe, Lock, Link2, Trash2, X, StickyNote, ToggleLeft, ToggleRight } from 'lucide-react';

// ─── Markdown-it Configuration ────────────────────────────────────

/** Escape HTML entities in a string */
function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

const md = new MarkdownIt({
    html: false, // Disable raw HTML for safety
    linkify: true, // Autoconvert URLs to links
    typographer: true, // Smart quotes, dashes
    highlight: (str: string, lang: string): string => {
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
        },
        [editingContent, setEditingContent, tabSize],
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
                    <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        placeholder="Note title…"
                        className="flex-1 bg-transparent text-[14px] font-semibold outline-none placeholder:opacity-40"
                    />
                    {onClose && (
                        <button
                            className="opacity-40 hover:opacity-100 px-1"
                            onClick={onClose}
                            title="Close"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>

                {/* Toolbar row */}
                <div className="flex items-center gap-2 text-[11px]">
                    {/* Edit / Preview toggle */}
                    <div className="flex rounded border border-border overflow-hidden">
                        <button
                            className={`px-2 py-0.5 transition-colors ${
                                !previewMode ? 'bg-accent text-button-fg' : 'hover:bg-hover'
                            }`}
                            onClick={() => setPreviewMode(false)}
                        >
                            Edit
                        </button>
                        <button
                            className={`px-2 py-0.5 transition-colors ${
                                previewMode ? 'bg-accent text-button-fg' : 'hover:bg-hover'
                            }`}
                            onClick={() => setPreviewMode(true)}
                        >
                            Preview
                        </button>
                    </div>

                    {/* Save button with dirty indicator */}
                    <button
                        className={`flex items-center gap-1 px-2 py-0.5 rounded ${
                            isDirty
                                ? 'bg-button-bg text-button-fg hover:bg-button-hover'
                                : 'opacity-40 cursor-default'
                        }`}
                        onClick={handleSave}
                        disabled={!isDirty || isSaving}
                        title={isDirty ? 'Save (Cmd+S)' : 'No unsaved changes'}
                    >
                        {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-warning" />}
                        {isSaving ? 'Saving…' : 'Save'}
                    </button>

                    {/* Autosave countdown */}
                    {autosaveCountdown !== null && autosaveCountdown > 0 && (
                        <span className="opacity-30 text-[10px]">
                            Autosave in {autosaveCountdown}s
                        </span>
                    )}

                    <div className="flex-1" />

                    {/* Visibility toggle */}
                    <button
                        className="opacity-50 hover:opacity-100 flex items-center gap-1 transition-colors"
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
                    </button>

                    {/* Copy link */}
                    <button
                        className="opacity-50 hover:opacity-100"
                        onClick={() => postMessage('notes.copyLink', { noteId: note.id })}
                        title="Copy gist URL"
                    >
                        <Link2 size={12} />
                    </button>

                    {/* Delete */}
                    <button
                        className="opacity-50 hover:opacity-100 text-danger"
                        onClick={() => postMessage('notes.delete', { noteId: note.id })}
                        title="Delete note"
                    >
                        <Trash2 size={12} />
                    </button>
                </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-auto">
                {previewMode ? (
                    <div
                        className="markdown-body px-4 py-3"
                        dangerouslySetInnerHTML={{ __html: renderedHtml }}
                    />
                ) : (
                    <textarea
                        ref={textareaRef}
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                        onKeyDown={handleTextareaKeyDown}
                        className="w-full h-full bg-transparent text-fg font-mono text-[12px] leading-[20px] px-4 py-3 outline-none resize-none"
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
