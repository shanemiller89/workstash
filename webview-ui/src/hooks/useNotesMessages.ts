/**
 * useNotesMessages — dispatches extension→webview notes messages to the store.
 */
import { useNotesStore, type GistNoteData } from '../notesStore';
import { useAppStore } from '../appStore';

type Msg = { type: string; [key: string]: unknown };

export function handleNotesMessage(msg: Msg): boolean {
    const s = useNotesStore.getState();

    switch (msg.type) {
        case 'notesData':
            s.setNotes(msg.payload as GistNoteData[]);
            return true;
        case 'notesLoading':
            s.setLoading(true);
            s.setError(null);
            return true;
        case 'notesSaving':
            s.setSaving(true);
            return true;
        case 'noteContent': {
            const ncNoteId = msg.noteId as string;
            const ncContent = msg.content as string;
            const ncTitle = msg.title as string | undefined;
            s.updateNoteInList(ncNoteId, {
                content: ncContent,
                ...(ncTitle !== undefined ? { title: ncTitle } : {}),
            });
            if (s.selectedNoteId === ncNoteId) {
                s.loadNoteContent(ncContent, ncTitle);
            }
            return true;
        }
        case 'noteSaved':
            s.setSaving(false);
            s.setDirty(false);
            if (msg.noteId) {
                s.updateNoteInList(msg.noteId as string, {
                    ...(msg.title !== undefined ? { title: msg.title as string } : {}),
                    ...(msg.content !== undefined ? { content: msg.content as string } : {}),
                    ...(msg.updatedAt ? { updatedAt: msg.updatedAt as string } : {}),
                });
            }
            return true;
        case 'noteCreated': {
            const newNote = msg.note as GistNoteData;
            s.addNoteToList(newNote);
            s.selectNote(newNote.id);
            return true;
        }
        case 'noteDeleted':
            s.removeNoteFromList(msg.noteId as string);
            return true;
        case 'noteVisibilityChanged': {
            const oldId = msg.oldNoteId as string;
            const newNote = msg.note as GistNoteData;
            s.removeNoteFromList(oldId);
            s.addNoteToList(newNote);
            s.selectNote(newNote.id);
            s.setLoading(false);
            return true;
        }
        case 'authStatus':
            s.setAuthenticated(
                msg.authenticated as boolean,
                (msg.username as string) ?? null,
            );
            return true;
        case 'notesError':
            s.setLoading(false);
            s.setSaving(false);
            s.setError((msg.message as string) ?? 'An unknown error occurred');
            return true;

        // ─── Deep-link: open a specific note ───
        case 'openNote':
            useAppStore.getState().setActiveTab('notes');
            if (msg.noteId) {
                s.selectNote(msg.noteId as string);
            }
            return true;

        // ─── Dirty switch confirmation result ───
        case 'confirmDirtySwitchResult':
            if (msg.confirmed && msg.targetNoteId) {
                s.setDirty(false);
                s.selectNote(msg.targetNoteId as string);
            }
            return true;

        // ─── Notes workspace linking ───
        case 'notesCurrentRepo':
            s.setCurrentRepo((msg.repo as string) ?? null);
            return true;
        case 'noteLinked':
            s.updateNoteInList(msg.noteId as string, {
                linkedRepo: (msg.linkedRepo as string) ?? null,
            });
            return true;
        case 'noteMigrated': {
            const migratedNote = msg.note as GistNoteData;
            s.updateNoteInList(migratedNote.id, migratedNote);
            return true;
        }
        default:
            return false;
    }
}
