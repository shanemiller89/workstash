import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useStashStore, type StashData } from './store';
import { useNotesStore, type GistNoteData } from './notesStore';
import { useAppStore } from './appStore';
import { onMessage, postMessage } from './vscode';
import { StashList } from './components/StashList';
import { StashDetail } from './components/StashDetail';
import { TabBar } from './components/TabBar';
import { NotesTab } from './components/NotesTab';

/** Breakpoint: below this the layout switches to narrow (replace) mode */
const NARROW_BREAKPOINT = 640;

/** Stash master-detail pane (extracted from old App root) */
const StashesTab: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isNarrow, setIsNarrow] = useState(false);
    const selectedStashIndex = useStashStore((s) => s.selectedStashIndex);
    const clearSelection = useStashStore((s) => s.clearSelection);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setIsNarrow(entry.contentRect.width < NARROW_BREAKPOINT);
            }
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    const handleCloseDetail = useCallback(() => {
        clearSelection();
    }, [clearSelection]);

    const hasSelection = selectedStashIndex !== null;

    if (isNarrow) {
        return (
            <div ref={containerRef} className="h-full bg-bg text-fg text-[13px]">
                {hasSelection ? (
                    <div className="h-full flex flex-col">
                        <div className="px-3 py-1.5 border-b border-border flex-shrink-0">
                            <button
                                className="text-[11px] text-accent hover:underline flex items-center gap-1"
                                onClick={handleCloseDetail}
                            >
                                ← Back to list
                            </button>
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <StashDetail onClose={handleCloseDetail} />
                        </div>
                    </div>
                ) : (
                    <StashList />
                )}
            </div>
        );
    }

    return (
        <div ref={containerRef} className="h-full bg-bg text-fg text-[13px] flex">
            <div
                className={`h-full overflow-hidden flex-shrink-0 transition-all duration-200 ${
                    hasSelection ? 'w-1/2 border-r border-border' : 'w-full'
                }`}
            >
                <StashList />
            </div>
            {hasSelection && (
                <div className="w-1/2 h-full overflow-hidden">
                    <StashDetail onClose={handleCloseDetail} />
                </div>
            )}
        </div>
    );
};

export const App: React.FC = () => {
    const activeTab = useAppStore((s) => s.activeTab);

    // Listen for all messages from the extension
    useEffect(() => {
        const dispose = onMessage((msg) => {
            const stashStore = useStashStore.getState();
            const notesStore = useNotesStore.getState();
            const appStore = useAppStore.getState();

            switch (msg.type) {
                // ─── Stash messages ───
                case 'stashData':
                    stashStore.setStashes(msg.payload as StashData[]);
                    stashStore.setLoading(false);
                    break;
                case 'loading':
                    stashStore.setLoading(true);
                    break;
                case 'fileDiff':
                    stashStore.setFileDiff(msg.key as string, msg.diff as string);
                    break;

                // ─── Notes messages ───
                case 'notesData':
                    notesStore.setNotes(msg.payload as GistNoteData[]);
                    break;
                case 'notesLoading':
                    notesStore.setLoading(true);
                    break;
                case 'notesSaving':
                    notesStore.setSaving(true);
                    break;
                case 'noteContent': {
                    const ncNoteId = msg.noteId as string;
                    const ncContent = msg.content as string;
                    const ncTitle = msg.title as string | undefined;
                    // Update content in the notes list
                    notesStore.updateNoteInList(ncNoteId, {
                        content: ncContent,
                        ...(ncTitle !== undefined ? { title: ncTitle } : {}),
                    });
                    // If this note is currently selected, populate the editor
                    if (notesStore.selectedNoteId === ncNoteId) {
                        notesStore.setEditingContent(ncContent);
                        notesStore.setLoading(false);
                        notesStore.setDirty(false);
                        if (ncTitle !== undefined) {
                            notesStore.setEditingTitle(ncTitle);
                        }
                    }
                    break;
                }
                case 'noteSaved':
                    notesStore.setSaving(false);
                    notesStore.setDirty(false);
                    if (msg.noteId) {
                        notesStore.updateNoteInList(msg.noteId as string, {
                            ...(msg.title !== undefined ? { title: msg.title as string } : {}),
                            ...(msg.content !== undefined
                                ? { content: msg.content as string }
                                : {}),
                            ...(msg.updatedAt ? { updatedAt: msg.updatedAt as string } : {}),
                        });
                    }
                    break;
                case 'noteCreated': {
                    const newNote = msg.note as GistNoteData;
                    notesStore.addNoteToList(newNote);
                    notesStore.selectNote(newNote.id);
                    break;
                }
                case 'noteDeleted':
                    notesStore.removeNoteFromList(msg.noteId as string);
                    break;
                case 'noteVisibilityChanged': {
                    // Visibility toggle deletes + re-creates the gist, so the ID changes
                    const oldId = msg.oldNoteId as string;
                    const newNote = msg.note as GistNoteData;
                    notesStore.removeNoteFromList(oldId);
                    notesStore.addNoteToList(newNote);
                    notesStore.selectNote(newNote.id);
                    notesStore.setLoading(false);
                    break;
                }
                case 'authStatus':
                    notesStore.setAuthenticated(
                        msg.authenticated as boolean,
                        (msg.username as string) ?? null,
                    );
                    break;
                case 'notesError':
                    notesStore.setLoading(false);
                    notesStore.setSaving(false);
                    break;

                // ─── Deep-link: open a specific note ───
                case 'openNote':
                    appStore.setActiveTab('notes');
                    if (msg.noteId) {
                        notesStore.selectNote(msg.noteId as string);
                    }
                    break;

                // ─── Dirty switch confirmation result ───
                case 'confirmDirtySwitchResult':
                    if (msg.confirmed && msg.targetNoteId) {
                        notesStore.setDirty(false);
                        notesStore.selectNote(msg.targetNoteId as string);
                    }
                    break;
            }
        });

        // Request initial data
        postMessage('ready');

        return dispose;
    }, []);

    return (
        <div className="h-screen bg-bg text-fg text-[13px] flex flex-col">
            <TabBar />
            <div className="flex-1 overflow-hidden">
                {activeTab === 'stashes' ? <StashesTab /> : <NotesTab />}
            </div>
        </div>
    );
};
