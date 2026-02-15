import * as vscode from 'vscode';
import { GoogleDriveService } from './googleDriveService';
import { DriveFileItem, SharedDriveItem, DriveSectionItem } from './googleDriveItem';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

/**
 * TreeDataProvider for the Google Drive sidebar view.
 * Shows: My Drive (root), Starred, Shared Drives as top-level sections.
 */
export class GoogleDriveProvider implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
    private readonly _driveService: GoogleDriveService;
    private readonly _outputChannel: vscode.OutputChannel;
    private _treeView: vscode.TreeView<vscode.TreeItem> | undefined;
    private readonly _disposables: vscode.Disposable[] = [];

    private readonly _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(driveService: GoogleDriveService, outputChannel: vscode.OutputChannel) {
        this._driveService = driveService;
        this._outputChannel = outputChannel;
    }

    setTreeView(treeView: vscode.TreeView<vscode.TreeItem>): void {
        this._treeView = treeView;
    }

    refresh(reason?: string): void {
        if (reason) {
            this._outputChannel.appendLine(`[DriveProvider] Refresh: ${reason}`);
        }
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        const isAuth = await this._driveService.isAuthenticated();
        if (!isAuth) {
            return [];
        }

        try {
            // Root level — show sections
            if (!element) {
                return [
                    new DriveSectionItem('myDrive', 'My Drive', 'home'),
                    new DriveSectionItem('starred', 'Starred', 'star-full'),
                    new DriveSectionItem('sharedDrives', 'Shared Drives', 'database'),
                ];
            }

            // Section items
            if (element instanceof DriveSectionItem) {
                switch (element.sectionId) {
                    case 'myDrive':
                        return this._listFolder('root');
                    case 'starred':
                        return this._listStarred();
                    case 'sharedDrives':
                        return this._listSharedDrives();
                    default:
                        return [];
                }
            }

            // Shared drive — list its root files
            if (element instanceof SharedDriveItem) {
                return this._listSharedDriveFolder(element.driveId);
            }

            // Folder — list its children
            if (element instanceof DriveFileItem && element.isFolder) {
                return this._listFolder(element.fileId);
            }

            return [];
        } catch (e: unknown) {
            this._outputChannel.appendLine(
                `[DriveProvider] Error: ${e instanceof Error ? e.message : e}`,
            );
            return [];
        }
    }

    private async _listFolder(folderId: string): Promise<DriveFileItem[]> {
        const result = await this._driveService.listFiles(folderId);
        return result.files.map(
            (f) =>
                new DriveFileItem(
                    f.id,
                    f.name,
                    f.mimeType,
                    f.mimeType === FOLDER_MIME,
                    f.webViewLink,
                ),
        );
    }

    private async _listStarred(): Promise<DriveFileItem[]> {
        const result = await this._driveService.getStarredFiles();
        return result.files.map(
            (f) =>
                new DriveFileItem(
                    f.id,
                    f.name,
                    f.mimeType,
                    f.mimeType === FOLDER_MIME,
                    f.webViewLink,
                ),
        );
    }

    private async _listSharedDrives(): Promise<SharedDriveItem[]> {
        const result = await this._driveService.listSharedDrives();
        return result.drives.map((d) => new SharedDriveItem(d.id, d.name));
    }

    private async _listSharedDriveFolder(driveId: string, folderId?: string): Promise<DriveFileItem[]> {
        const result = await this._driveService.listSharedDriveFiles(driveId, folderId);
        return result.files.map(
            (f) =>
                new DriveFileItem(
                    f.id,
                    f.name,
                    f.mimeType,
                    f.mimeType === FOLDER_MIME,
                    f.webViewLink,
                ),
        );
    }

    dispose(): void {
        this._onDidChangeTreeData.dispose();
        for (const d of this._disposables) {
            d.dispose();
        }
    }
}
