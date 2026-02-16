import * as vscode from 'vscode';
import { GistService } from '../gistService';
import { extractErrorMessage } from '../utils';
import type { HandlerContext, MessageHandler } from './types';

/** Handle all `notes.*` messages from the webview. */
export const handleNotesMessage: MessageHandler = async (ctx, msg) => {
    switch (msg.type) {
        case 'notes.signIn':
            await vscode.commands.executeCommand('superprompt-forge.notes.signIn');
            await ctx.sendAuthStatus();
            await ctx.refreshNotes();
            return true;

        case 'notes.signOut':
            await vscode.commands.executeCommand('superprompt-forge.notes.signOut');
            await ctx.sendAuthStatus();
            return true;

        case 'notes.refresh':
            await ctx.refreshNotes();
            return true;

        case 'notes.create':
            if (msg.title && ctx.gistService) {
                try {
                    ctx.postMessage({ type: 'notesLoading' });
                    // Auto-link to current workspace
                    const repoInfo = await ctx.getRepoInfo();
                    const linkedRepo = repoInfo ? `${repoInfo.owner}/${repoInfo.repo}` : undefined;
                    const note = await ctx.gistService.createNote(
                        msg.title,
                        msg.content ?? '',
                        msg.isPublic ?? false,
                        linkedRepo,
                    );
                    ctx.postMessage({
                        type: 'noteCreated',
                        note: GistService.toData(note),
                    });
                } catch (e: unknown) {
                    const m = extractErrorMessage(e);
                    vscode.window.showErrorMessage(`Failed to create note: ${m}`);
                    ctx.postMessage({ type: 'notesError', message: m });
                }
            }
            return true;

        case 'notes.save':
            if (msg.noteId && ctx.gistService) {
                try {
                    ctx.postMessage({ type: 'notesSaving' });
                    const saved = await ctx.gistService.updateNote(
                        msg.noteId,
                        msg.title ?? '',
                        msg.content ?? '',
                    );
                    ctx.postMessage({
                        type: 'noteSaved',
                        noteId: msg.noteId,
                        title: saved.title,
                        content: saved.content,
                        updatedAt: saved.updatedAt.toISOString(),
                    });
                } catch (e: unknown) {
                    const m = extractErrorMessage(e);
                    vscode.window.showErrorMessage(`Failed to save note: ${m}`);
                    ctx.postMessage({ type: 'notesError', message: m });
                }
            }
            return true;

        case 'notes.delete':
            if (msg.noteId && ctx.gistService) {
                const confirm = await vscode.window.showWarningMessage(
                    'Delete this note? This cannot be undone.',
                    { modal: true },
                    'Delete',
                    'Cancel',
                );
                if (confirm !== 'Delete') {
                    return true;
                }
                try {
                    await ctx.gistService.deleteNote(msg.noteId);
                    ctx.postMessage({
                        type: 'noteDeleted',
                        noteId: msg.noteId,
                    });
                } catch (e: unknown) {
                    const m = extractErrorMessage(e);
                    vscode.window.showErrorMessage(`Failed to delete note: ${m}`);
                    ctx.postMessage({ type: 'notesError', message: m });
                }
            }
            return true;

        case 'notes.copyLink':
            if (msg.noteId && ctx.gistService) {
                try {
                    const note = await ctx.gistService.getNote(msg.noteId);
                    if (note) {
                        await vscode.env.clipboard.writeText(note.htmlUrl);
                        vscode.window.showInformationMessage('Gist link copied to clipboard');
                    }
                } catch {
                    vscode.window.showErrorMessage('Failed to copy link');
                }
            }
            return true;

        case 'notes.loadNote':
            if (msg.noteId && ctx.gistService) {
                try {
                    const fullNote = await ctx.gistService.getNote(msg.noteId);
                    ctx.postMessage({
                        type: 'noteContent',
                        noteId: fullNote.id,
                        title: fullNote.title,
                        content: fullNote.content,
                    });
                } catch (e: unknown) {
                    const m = extractErrorMessage(e);
                    ctx.postMessage({ type: 'notesError', message: m });
                }
            }
            return true;

        case 'notes.toggleVisibility':
            if (msg.noteId && ctx.gistService) {
                const choice = await vscode.window.showWarningMessage(
                    'Toggling visibility deletes and re-creates the gist. The gist ID, comments, and stars will be lost. Continue?',
                    { modal: true },
                    'Toggle',
                    'Cancel',
                );
                if (choice !== 'Toggle') {
                    return true;
                }
                try {
                    ctx.postMessage({ type: 'notesLoading' });
                    const toggled = await ctx.gistService.toggleVisibility(msg.noteId);
                    ctx.postMessage({
                        type: 'noteVisibilityChanged',
                        oldNoteId: msg.noteId,
                        note: GistService.toData(toggled),
                    });
                } catch (e: unknown) {
                    const m = extractErrorMessage(e);
                    vscode.window.showErrorMessage(`Failed to toggle visibility: ${m}`);
                    ctx.postMessage({ type: 'notesError', message: m });
                }
            }
            return true;

        case 'notes.getTabSize': {
            const tabSize = vscode.workspace
                .getConfiguration('editor')
                .get<number>('tabSize', 4);
            ctx.postMessage({ type: 'tabSize', tabSize });
            return true;
        }

        case 'notes.confirmDirtySwitch':
            if (msg.targetNoteId) {
                const choice = await vscode.window.showWarningMessage(
                    'You have unsaved changes. Discard them?',
                    'Discard',
                    'Cancel',
                );
                ctx.postMessage({
                    type: 'confirmDirtySwitchResult',
                    confirmed: choice === 'Discard',
                    targetNoteId: msg.targetNoteId,
                });
            }
            return true;

        case 'notes.linkToRepo':
            if (msg.noteId && ctx.gistService) {
                try {
                    const repoInfo = await ctx.getRepoInfo();
                    if (!repoInfo) {
                        vscode.window.showErrorMessage('No repository detected for this workspace.');
                        return true;
                    }
                    const repoSlug = `${repoInfo.owner}/${repoInfo.repo}`;
                    const linked = await ctx.gistService.linkToRepo(msg.noteId, repoSlug);
                    ctx.postMessage({
                        type: 'noteLinked',
                        noteId: msg.noteId,
                        linkedRepo: linked.linkedRepo,
                    });
                    vscode.window.showInformationMessage(`Note linked to ${repoSlug}`);
                } catch (e: unknown) {
                    const m = extractErrorMessage(e);
                    vscode.window.showErrorMessage(`Failed to link note: ${m}`);
                }
            }
            return true;

        case 'notes.unlinkFromRepo':
            if (msg.noteId && ctx.gistService) {
                try {
                    const unlinked = await ctx.gistService.unlinkFromRepo(msg.noteId);
                    ctx.postMessage({
                        type: 'noteLinked',
                        noteId: msg.noteId,
                        linkedRepo: unlinked.linkedRepo,
                    });
                    vscode.window.showInformationMessage('Note unlinked from workspace');
                } catch (e: unknown) {
                    const m = extractErrorMessage(e);
                    vscode.window.showErrorMessage(`Failed to unlink note: ${m}`);
                }
            }
            return true;

        case 'notes.migrate':
            if (msg.noteId && ctx.gistService) {
                try {
                    const migrated = await ctx.gistService.migrateToSpf(msg.noteId);
                    ctx.postMessage({
                        type: 'noteMigrated',
                        note: GistService.toData(migrated),
                    });
                    vscode.window.showInformationMessage('Note migrated to SPF format');
                } catch (e: unknown) {
                    const m = extractErrorMessage(e);
                    vscode.window.showErrorMessage(`Failed to migrate note: ${m}`);
                }
            }
            return true;

        default:
            return false;
    }
};
