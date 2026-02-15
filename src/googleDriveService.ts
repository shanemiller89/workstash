import * as vscode from 'vscode';
import { GoogleAuthProvider } from './googleAuthProvider';

// ─── Data Models ──────────────────────────────────────────────────

export interface DriveFile {
    id: string;
    name: string;
    mimeType: string;
    size?: string;
    modifiedTime: string;
    createdTime: string;
    iconLink?: string;
    thumbnailLink?: string;
    webViewLink?: string;
    webContentLink?: string;
    parents?: string[];
    shared: boolean;
    starred: boolean;
    trashed: boolean;
    owners?: { displayName: string; emailAddress: string; photoLink?: string }[];
    capabilities?: {
        canDownload?: boolean;
        canEdit?: boolean;
        canDelete?: boolean;
    };
}

export interface DriveFileList {
    files: DriveFile[];
    nextPageToken?: string;
}

export interface SharedDrive {
    id: string;
    name: string;
    colorRgb?: string;
    createdTime: string;
}

export interface SharedDriveList {
    drives: SharedDrive[];
    nextPageToken?: string;
}

export interface DriveUploadResult {
    id: string;
    name: string;
    mimeType: string;
    webViewLink?: string;
}

/** Workspace pinned doc stored in extension globalState */
export interface PinnedDoc {
    fileId: string;
    name: string;
    mimeType: string;
    webViewLink?: string;
}

// ─── Constants ────────────────────────────────────────────────────

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

/** Standard fields to request for file metadata */
const FILE_FIELDS = 'id,name,mimeType,size,modifiedTime,createdTime,iconLink,thumbnailLink,webViewLink,webContentLink,parents,shared,starred,trashed,owners,capabilities';
const LIST_FIELDS = `nextPageToken,files(${FILE_FIELDS})`;

const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** GlobalState key for pinned workspace docs */
const PINNED_DOCS_KEY = 'corenexus.drive.pinnedDocs';

// ─── Service ──────────────────────────────────────────────────────

export class GoogleDriveService {
    private readonly _authProvider: GoogleAuthProvider;
    private readonly _outputChannel: vscode.OutputChannel;
    private readonly _globalState: vscode.Memento;

    private readonly _onDidChangeAuth = new vscode.EventEmitter<void>();
    readonly onDidChangeAuth = this._onDidChangeAuth.event;

    constructor(
        authProvider: GoogleAuthProvider,
        outputChannel: vscode.OutputChannel,
        globalState: vscode.Memento,
    ) {
        this._authProvider = authProvider;
        this._outputChannel = outputChannel;
        this._globalState = globalState;
    }

    // ─── Auth helpers ─────────────────────────────────────────────

    async isAuthenticated(): Promise<boolean> {
        return this._authProvider.isAuthenticated();
    }

    async signIn(): Promise<void> {
        await vscode.authentication.getSession(GoogleAuthProvider.id, [], { createIfNone: true });
        this._onDidChangeAuth.fire();
    }

    async signOut(): Promise<void> {
        const sessions = await this._authProvider.getSessions();
        for (const session of sessions) {
            await this._authProvider.removeSession(session.id);
        }
        this._onDidChangeAuth.fire();
    }

    // ─── File browsing ────────────────────────────────────────────

    /**
     * List files in a folder (defaults to 'root').
     * Returns a page of results + optional next page token.
     */
    async listFiles(
        folderId = 'root',
        pageSize = 50,
        pageToken?: string,
        orderBy = 'folder,name',
    ): Promise<DriveFileList> {
        const q = `'${folderId}' in parents and trashed = false`;
        const params = new URLSearchParams({
            q,
            fields: LIST_FIELDS,
            pageSize: String(pageSize),
            orderBy,
            includeItemsFromAllDrives: 'true',
            supportsAllDrives: 'true',
        });
        if (pageToken) {
            params.set('pageToken', pageToken);
        }

        return this._get<DriveFileList>(`/files?${params}`);
    }

    /**
     * Search for files by name across the entire drive.
     */
    async searchFiles(
        query: string,
        pageSize = 30,
        pageToken?: string,
    ): Promise<DriveFileList> {
        const q = `name contains '${query.replace(/'/g, "\\'")}' and trashed = false`;
        const params = new URLSearchParams({
            q,
            fields: LIST_FIELDS,
            pageSize: String(pageSize),
            orderBy: 'modifiedTime desc',
            includeItemsFromAllDrives: 'true',
            supportsAllDrives: 'true',
        });
        if (pageToken) {
            params.set('pageToken', pageToken);
        }

        return this._get<DriveFileList>(`/files?${params}`);
    }

    /** Get starred (pinned) files */
    async getStarredFiles(pageSize = 50): Promise<DriveFileList> {
        const q = 'starred = true and trashed = false';
        const params = new URLSearchParams({
            q,
            fields: LIST_FIELDS,
            pageSize: String(pageSize),
            orderBy: 'modifiedTime desc',
            includeItemsFromAllDrives: 'true',
            supportsAllDrives: 'true',
        });

        return this._get<DriveFileList>(`/files?${params}`);
    }

    /** Get recently modified files */
    async getRecentFiles(pageSize = 30): Promise<DriveFileList> {
        const q = 'trashed = false';
        const params = new URLSearchParams({
            q,
            fields: LIST_FIELDS,
            pageSize: String(pageSize),
            orderBy: 'viewedByMeTime desc,modifiedTime desc',
            includeItemsFromAllDrives: 'true',
            supportsAllDrives: 'true',
        });

        return this._get<DriveFileList>(`/files?${params}`);
    }

    /** Get file metadata */
    async getFile(fileId: string): Promise<DriveFile> {
        const params = new URLSearchParams({
            fields: FILE_FIELDS,
            supportsAllDrives: 'true',
        });
        return this._get<DriveFile>(`/files/${fileId}?${params}`);
    }

    // ─── Shared Drives ───────────────────────────────────────────

    /** List shared drives the user has access to */
    async listSharedDrives(pageSize = 50): Promise<SharedDriveList> {
        const params = new URLSearchParams({
            pageSize: String(pageSize),
            fields: 'nextPageToken,drives(id,name,colorRgb,createdTime)',
        });
        return this._get<SharedDriveList>(`/drives?${params}`);
    }

    /** List files in a shared drive */
    async listSharedDriveFiles(
        driveId: string,
        folderId?: string,
        pageSize = 50,
        pageToken?: string,
    ): Promise<DriveFileList> {
        const parent = folderId ?? driveId;
        const q = `'${parent}' in parents and trashed = false`;
        const params = new URLSearchParams({
            q,
            fields: LIST_FIELDS,
            pageSize: String(pageSize),
            orderBy: 'folder,name',
            corpora: 'drive',
            driveId,
            includeItemsFromAllDrives: 'true',
            supportsAllDrives: 'true',
        });
        if (pageToken) {
            params.set('pageToken', pageToken);
        }

        return this._get<DriveFileList>(`/files?${params}`);
    }

    // ─── Upload ───────────────────────────────────────────────────

    /**
     * Upload a file from the workspace to Google Drive.
     *
     * Uses simple upload for small files (<5MB), multipart for larger.
     */
    async uploadFile(
        localPath: string,
        parentFolderId = 'root',
        name?: string,
    ): Promise<DriveUploadResult> {
        const fileUri = vscode.Uri.file(localPath);
        const content = await vscode.workspace.fs.readFile(fileUri);
        const fileName = name ?? localPath.split('/').pop() ?? 'untitled';

        // Detect mime type from extension
        const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
        const mimeType = this._guessMimeType(ext);

        const token = await this._getToken();

        // Use multipart upload
        const boundary = '----CoreNexusBoundary' + Date.now();
        const metadata = JSON.stringify({
            name: fileName,
            parents: [parentFolderId],
        });

        const bodyParts = [
            `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
            `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
        ];

        // Build multipart body
        const encoder = new TextEncoder();
        const part1 = encoder.encode(bodyParts[0]);
        const part2 = encoder.encode(bodyParts[1]);
        const ending = encoder.encode(`\r\n--${boundary}--`);

        const bodyBuffer = new Uint8Array(part1.length + part2.length + content.length + ending.length);
        bodyBuffer.set(part1, 0);
        bodyBuffer.set(part2, part1.length);
        bodyBuffer.set(content, part1.length + part2.length);
        bodyBuffer.set(ending, part1.length + part2.length + content.length);

        const response = await fetch(
            `${UPLOAD_API}/files?uploadType=multipart&fields=id,name,mimeType,webViewLink&supportsAllDrives=true`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': `multipart/related; boundary=${boundary}`,
                },
                body: bodyBuffer,
            },
        );

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Upload failed (${response.status}): ${text}`);
        }

        const result = await response.json() as DriveUploadResult;
        this._outputChannel.appendLine(`[Drive] Uploaded ${fileName} → ${result.id}`);
        return result;
    }

    // ─── Download ─────────────────────────────────────────────────

    /**
     * Download a file and save it to the workspace or temp dir.
     * Returns the local URI of the downloaded file.
     */
    async downloadFile(fileId: string, targetDir?: vscode.Uri): Promise<vscode.Uri> {
        const file = await this.getFile(fileId);
        const token = await this._getToken();

        let downloadUrl: string;
        let fileName = file.name;

        // Google Docs export vs binary download
        if (file.mimeType.startsWith('application/vnd.google-apps.')) {
            const { exportMime, extension } = this._getExportFormat(file.mimeType);
            downloadUrl = `${DRIVE_API}/files/${fileId}/export?mimeType=${encodeURIComponent(exportMime)}`;
            if (!fileName.endsWith(extension)) {
                fileName += extension;
            }
        } else {
            downloadUrl = `${DRIVE_API}/files/${fileId}?alt=media&supportsAllDrives=true`;
        }

        const response = await fetch(downloadUrl, {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
            throw new Error(`Download failed (${response.status})`);
        }

        const buffer = new Uint8Array(await response.arrayBuffer());

        // Determine target directory
        const dir = targetDir ?? this._getDefaultDownloadDir();
        const targetUri = vscode.Uri.joinPath(dir, fileName);

        await vscode.workspace.fs.writeFile(targetUri, buffer);
        this._outputChannel.appendLine(`[Drive] Downloaded ${fileName} → ${targetUri.fsPath}`);

        return targetUri;
    }

    /**
     * Open a Google Drive file in the browser (webViewLink).
     */
    async openInBrowser(fileId: string): Promise<void> {
        const file = await this.getFile(fileId);
        if (file.webViewLink) {
            await vscode.env.openExternal(vscode.Uri.parse(file.webViewLink));
        } else {
            throw new Error('No web view link available for this file');
        }
    }

    // ─── Star / pin ───────────────────────────────────────────────

    /** Toggle starred state on Google Drive */
    async toggleStar(fileId: string, starred: boolean): Promise<void> {
        const token = await this._getToken();
        const response = await fetch(
            `${DRIVE_API}/files/${fileId}?supportsAllDrives=true`,
            {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ starred }),
            },
        );

        if (!response.ok) {
            throw new Error(`Failed to update star (${response.status})`);
        }
    }

    // ─── Workspace pinned docs (local storage) ───────────────────

    getPinnedDocs(): PinnedDoc[] {
        return this._globalState.get<PinnedDoc[]>(PINNED_DOCS_KEY, []);
    }

    async pinDoc(doc: PinnedDoc): Promise<void> {
        const pinned = this.getPinnedDocs().filter((d) => d.fileId !== doc.fileId);
        pinned.unshift(doc);
        await this._globalState.update(PINNED_DOCS_KEY, pinned);
    }

    async unpinDoc(fileId: string): Promise<void> {
        const pinned = this.getPinnedDocs().filter((d) => d.fileId !== fileId);
        await this._globalState.update(PINNED_DOCS_KEY, pinned);
    }

    isPinned(fileId: string): boolean {
        return this.getPinnedDocs().some((d) => d.fileId === fileId);
    }

    // ─── Private helpers ──────────────────────────────────────────

    private async _getToken(): Promise<string> {
        const token = await this._authProvider.getAccessToken();
        if (!token) {
            throw new Error('Not authenticated with Google. Please sign in first.');
        }
        return token;
    }

    private async _get<T>(path: string): Promise<T> {
        const token = await this._getToken();
        const url = path.startsWith('http') ? path : `${DRIVE_API}${path}`;

        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (response.status === 401) {
            // Token expired — try once more after refresh
            const freshToken = await this._authProvider.getAccessToken();
            if (freshToken && freshToken !== token) {
                const retry = await fetch(url, {
                    headers: { Authorization: `Bearer ${freshToken}` },
                });
                if (!retry.ok) {
                    throw new Error(`Drive API error (${retry.status})`);
                }
                return retry.json() as Promise<T>;
            }
            throw new Error('Authentication expired. Please sign in again.');
        }

        if (!response.ok) {
            const text = await response.text();
            this._outputChannel.appendLine(`[Drive] API error: ${response.status} ${text}`);
            throw new Error(`Drive API error (${response.status}): ${text}`);
        }

        return response.json() as Promise<T>;
    }

    private _getDefaultDownloadDir(): vscode.Uri {
        const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
        if (wsRoot) {
            return wsRoot;
        }
        // Fallback to home Downloads
        const home = process.env.HOME || process.env.USERPROFILE || '/tmp';
        return vscode.Uri.file(`${home}/Downloads`);
    }

    /** Map Google Apps MIME types to export formats */
    private _getExportFormat(mimeType: string): { exportMime: string; extension: string } {
        const map: Record<string, { exportMime: string; extension: string }> = {
            'application/vnd.google-apps.document': { exportMime: 'application/pdf', extension: '.pdf' },
            'application/vnd.google-apps.spreadsheet': { exportMime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: '.xlsx' },
            'application/vnd.google-apps.presentation': { exportMime: 'application/pdf', extension: '.pdf' },
            'application/vnd.google-apps.drawing': { exportMime: 'image/png', extension: '.png' },
        };
        return map[mimeType] ?? { exportMime: 'application/pdf', extension: '.pdf' };
    }

    private _guessMimeType(ext: string): string {
        const map: Record<string, string> = {
            pdf: 'application/pdf',
            doc: 'application/msword',
            docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            xls: 'application/vnd.ms-excel',
            xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            ppt: 'application/vnd.ms-powerpoint',
            pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            gif: 'image/gif',
            svg: 'image/svg+xml',
            txt: 'text/plain',
            md: 'text/markdown',
            json: 'application/json',
            js: 'text/javascript',
            ts: 'text/typescript',
            html: 'text/html',
            css: 'text/css',
            csv: 'text/csv',
            zip: 'application/zip',
        };
        return map[ext] ?? 'application/octet-stream';
    }
}
