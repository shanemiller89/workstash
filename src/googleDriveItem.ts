import * as vscode from 'vscode';

/** Tree item representing a Google Drive file or folder in the sidebar */
export class DriveFileItem extends vscode.TreeItem {
    constructor(
        public readonly fileId: string,
        public readonly fileName: string,
        public readonly mimeType: string,
        public readonly isFolder: boolean,
        public readonly webViewLink?: string,
    ) {
        super(
            fileName,
            isFolder
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None,
        );

        this.contextValue = isFolder ? 'driveFolder' : 'driveFile';
        this.tooltip = fileName;
        this.iconPath = isFolder
            ? new vscode.ThemeIcon('folder')
            : DriveFileItem._getFileIcon(mimeType);

        if (!isFolder) {
            this.command = {
                command: 'superprompt-forge.drive.openFile',
                title: 'Open in Browser',
                arguments: [this],
            };
        }
    }

    private static _getFileIcon(mimeType: string): vscode.ThemeIcon {
        if (mimeType.startsWith('image/')) {
            return new vscode.ThemeIcon('file-media');
        }
        if (mimeType.startsWith('video/') || mimeType.startsWith('audio/')) {
            return new vscode.ThemeIcon('file-media');
        }
        if (mimeType.includes('pdf')) {
            return new vscode.ThemeIcon('file-pdf');
        }
        if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) {
            return new vscode.ThemeIcon('table');
        }
        if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) {
            return new vscode.ThemeIcon('preview');
        }
        if (mimeType.includes('document') || mimeType.includes('word')) {
            return new vscode.ThemeIcon('file-text');
        }
        if (mimeType.startsWith('text/') || mimeType.includes('json') || mimeType.includes('javascript') || mimeType.includes('typescript')) {
            return new vscode.ThemeIcon('file-code');
        }
        if (mimeType.includes('zip') || mimeType.includes('archive') || mimeType.includes('tar') || mimeType.includes('gzip')) {
            return new vscode.ThemeIcon('file-zip');
        }
        return new vscode.ThemeIcon('file');
    }
}

/** Tree item representing a shared drive */
export class SharedDriveItem extends vscode.TreeItem {
    constructor(
        public readonly driveId: string,
        public readonly driveName: string,
    ) {
        super(driveName, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'sharedDrive';
        this.iconPath = new vscode.ThemeIcon('database');
        this.tooltip = `Shared Drive: ${driveName}`;
    }
}

/** Tree item for category headers (Starred, Recent, Shared Drives) */
export class DriveSectionItem extends vscode.TreeItem {
    constructor(
        public readonly sectionId: string,
        label: string,
        icon: string,
    ) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'driveSection';
        this.iconPath = new vscode.ThemeIcon(icon);
    }
}
