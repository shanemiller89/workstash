import * as vscode from 'vscode';
import { extractErrorMessage } from '../utils';
import { ensureGoogleCredentials } from '../panelContext';
import type { HandlerContext, MessageHandler } from './types';

/** Handle all `drive.*` messages from the webview. */
export const handleDriveMessage: MessageHandler = async (ctx, msg) => {
    switch (msg.type) {
        case 'drive.signIn': {
            if (ctx.driveService) {
                const configured = await ensureGoogleCredentials();
                if (!configured) { return true; }

                try {
                    await ctx.driveService.signIn();
                    await ctx.sendDriveAuthStatus();
                } catch (e: unknown) {
                    vscode.window.showErrorMessage(
                        `Google sign-in failed: ${extractErrorMessage(e)}`,
                    );
                }
            }
            return true;
        }

        case 'drive.signOut': {
            if (ctx.driveService) {
                await ctx.driveService.signOut();
                await ctx.sendDriveAuthStatus();
            }
            return true;
        }

        case 'drive.listFiles': {
            if (ctx.driveService) {
                try {
                    const result = await ctx.driveService.listFiles(msg.folderId ?? 'root');
                    ctx.postMessage({
                        type: 'driveFiles',
                        files: result.files,
                        nextPageToken: result.nextPageToken,
                    });
                } catch (e: unknown) {
                    const m = extractErrorMessage(e);
                    ctx.outputChannel.appendLine(
                        `[Drive] listFiles error: ${m}`,
                    );
                    ctx.postMessage({ type: 'driveError', message: m });
                    ctx.postMessage({
                        type: 'driveFiles',
                        files: [],
                    });
                }
            }
            return true;
        }

        case 'drive.search': {
            if (ctx.driveService && msg.query) {
                try {
                    const result = await ctx.driveService.searchFiles(msg.query);
                    ctx.postMessage({
                        type: 'driveSearchResults',
                        files: result.files,
                    });
                } catch (e: unknown) {
                    const m = extractErrorMessage(e);
                    ctx.outputChannel.appendLine(
                        `[Drive] search error: ${m}`,
                    );
                    ctx.postMessage({ type: 'driveError', message: m });
                    ctx.postMessage({
                        type: 'driveSearchResults',
                        files: [],
                    });
                }
            }
            return true;
        }

        case 'drive.getStarred': {
            if (ctx.driveService) {
                try {
                    const result = await ctx.driveService.getStarredFiles();
                    ctx.postMessage({
                        type: 'driveStarredFiles',
                        files: result.files,
                    });
                } catch (e: unknown) {
                    const m = extractErrorMessage(e);
                    ctx.outputChannel.appendLine(
                        `[Drive] getStarred error: ${m}`,
                    );
                    ctx.postMessage({ type: 'driveError', message: m });
                    ctx.postMessage({
                        type: 'driveStarredFiles',
                        files: [],
                    });
                }
            }
            return true;
        }

        case 'drive.getRecent': {
            if (ctx.driveService) {
                try {
                    const result = await ctx.driveService.getRecentFiles();
                    ctx.postMessage({
                        type: 'driveRecentFiles',
                        files: result.files,
                    });
                } catch (e: unknown) {
                    const m = extractErrorMessage(e);
                    ctx.outputChannel.appendLine(
                        `[Drive] getRecent error: ${m}`,
                    );
                    ctx.postMessage({ type: 'driveError', message: m });
                    ctx.postMessage({
                        type: 'driveRecentFiles',
                        files: [],
                    });
                }
            }
            return true;
        }

        case 'drive.getSharedDrives': {
            if (ctx.driveService) {
                try {
                    const result = await ctx.driveService.listSharedDrives();
                    ctx.postMessage({
                        type: 'driveSharedDrives',
                        drives: result.drives,
                    });
                } catch (e: unknown) {
                    const m = extractErrorMessage(e);
                    ctx.outputChannel.appendLine(
                        `[Drive] getSharedDrives error: ${m}`,
                    );
                    ctx.postMessage({ type: 'driveError', message: m });
                    ctx.postMessage({
                        type: 'driveSharedDrives',
                        drives: [],
                    });
                }
            }
            return true;
        }

        case 'drive.listSharedDriveFiles': {
            if (ctx.driveService && msg.driveId) {
                try {
                    const result = await ctx.driveService.listSharedDriveFiles(msg.driveId, msg.folderId);
                    ctx.postMessage({
                        type: 'driveSharedDriveFiles',
                        files: result.files,
                    });
                } catch (e: unknown) {
                    const m = extractErrorMessage(e);
                    ctx.outputChannel.appendLine(
                        `[Drive] listSharedDriveFiles error: ${m}`,
                    );
                    ctx.postMessage({ type: 'driveError', message: m });
                    ctx.postMessage({
                        type: 'driveSharedDriveFiles',
                        files: [],
                    });
                }
            }
            return true;
        }

        case 'drive.openInBrowser': {
            if (ctx.driveService && msg.fileId) {
                try {
                    await ctx.driveService.openInBrowser(msg.fileId);
                } catch (e: unknown) {
                    vscode.window.showErrorMessage(
                        `Failed to open file: ${extractErrorMessage(e)}`,
                    );
                }
            }
            return true;
        }

        case 'drive.download': {
            if (ctx.driveService && msg.fileId) {
                try {
                    // Let user pick a folder
                    const folders = await vscode.window.showOpenDialog({
                        canSelectFiles: false,
                        canSelectFolders: true,
                        canSelectMany: false,
                        title: 'Download to folder',
                        defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
                    });
                    if (folders && folders[0]) {
                        const localUri = await vscode.window.withProgress(
                            {
                                location: vscode.ProgressLocation.Notification,
                                title: 'Downloading from Google Drive…',
                            },
                            () => ctx.driveService!.downloadFile(msg.fileId!, folders[0]),
                        );
                        const openAction = await vscode.window.showInformationMessage(
                            `Downloaded: ${localUri.fsPath}`,
                            'Open File',
                        );
                        if (openAction === 'Open File') {
                            await vscode.commands.executeCommand('vscode.open', localUri);
                        }
                    }
                } catch (e: unknown) {
                    vscode.window.showErrorMessage(
                        `Download failed: ${extractErrorMessage(e)}`,
                    );
                }
            }
            return true;
        }

        case 'drive.upload': {
            if (ctx.driveService) {
                try {
                    const files = await vscode.window.showOpenDialog({
                        canSelectFiles: true,
                        canSelectFolders: false,
                        canSelectMany: false,
                        title: 'Select file to upload to Google Drive',
                    });
                    if (files && files[0]) {
                        const fileName = files[0].fsPath.split('/').pop() ?? 'file';
                        ctx.postMessage({
                            type: 'driveUploadStart',
                            fileName,
                        });
                        await vscode.window.withProgress(
                            {
                                location: vscode.ProgressLocation.Notification,
                                title: `Uploading ${fileName} to Google Drive…`,
                            },
                            () => ctx.driveService!.uploadFile(
                                files[0].fsPath,
                                msg.folderId ?? 'root',
                            ),
                        );
                        ctx.postMessage({ type: 'driveUploadDone' });
                        vscode.window.showInformationMessage(`Uploaded ${fileName} to Google Drive`);
                        // Refresh the current folder
                        const result = await ctx.driveService.listFiles(msg.folderId ?? 'root');
                        ctx.postMessage({
                            type: 'driveFiles',
                            files: result.files,
                            nextPageToken: result.nextPageToken,
                        });
                    }
                } catch (e: unknown) {
                    ctx.postMessage({ type: 'driveUploadDone' });
                    vscode.window.showErrorMessage(
                        `Upload failed: ${extractErrorMessage(e)}`,
                    );
                }
            }
            return true;
        }

        case 'drive.toggleStar': {
            if (ctx.driveService && msg.fileId !== undefined && msg.starred !== undefined) {
                try {
                    await ctx.driveService.toggleStar(msg.fileId, msg.starred);
                    ctx.postMessage({
                        type: 'driveFileStarred',
                        fileId: msg.fileId,
                        starred: msg.starred,
                    });
                } catch (e: unknown) {
                    vscode.window.showErrorMessage(
                        `Failed to update star: ${extractErrorMessage(e)}`,
                    );
                }
            }
            return true;
        }

        case 'drive.getPinnedDocs': {
            if (ctx.driveService) {
                ctx.postMessage({
                    type: 'drivePinnedDocs',
                    docs: ctx.driveService.getPinnedDocs(),
                });
            }
            return true;
        }

        case 'drive.pinDoc': {
            if (ctx.driveService && msg.fileId) {
                await ctx.driveService.pinDoc({
                    fileId: msg.fileId,
                    name: msg.name ?? 'Untitled',
                    mimeType: msg.mimeType ?? 'application/octet-stream',
                    webViewLink: msg.webViewLink,
                });
                ctx.postMessage({
                    type: 'drivePinnedDocs',
                    docs: ctx.driveService.getPinnedDocs(),
                });
            }
            return true;
        }

        case 'drive.unpinDoc': {
            if (ctx.driveService && msg.fileId) {
                await ctx.driveService.unpinDoc(msg.fileId);
                ctx.postMessage({
                    type: 'drivePinnedDocs',
                    docs: ctx.driveService.getPinnedDocs(),
                });
            }
            return true;
        }

        default:
            return false;
    }
};
