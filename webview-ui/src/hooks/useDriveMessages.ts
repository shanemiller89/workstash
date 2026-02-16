/**
 * useDriveMessages — dispatches extension→webview Google Drive messages to the store.
 */
import { useDriveStore, type DriveFileData, type SharedDriveData, type PinnedDocData } from '../driveStore';

type Msg = { type: string; [key: string]: unknown };

export function handleDriveMessage(msg: Msg): boolean {
    const s = useDriveStore.getState();

    switch (msg.type) {
        case 'driveAuth':
            s.setAuthenticated(
                msg.authenticated as boolean,
                msg.email as string | null,
            );
            return true;
        case 'driveFiles':
            s.setFiles(
                msg.files as DriveFileData[],
                msg.nextPageToken as string | undefined,
            );
            return true;
        case 'driveSearchResults':
            s.setSearchResults(msg.files as DriveFileData[]);
            return true;
        case 'driveStarredFiles':
            s.setStarredFiles(msg.files as DriveFileData[]);
            return true;
        case 'driveRecentFiles':
            s.setRecentFiles(msg.files as DriveFileData[]);
            return true;
        case 'driveSharedDrives':
            s.setSharedDrives(msg.drives as SharedDriveData[]);
            return true;
        case 'driveSharedDriveFiles':
            s.setSharedDriveFiles(msg.files as DriveFileData[]);
            return true;
        case 'drivePinnedDocs':
            s.setPinnedDocs(msg.docs as PinnedDocData[]);
            return true;
        case 'driveUploadStart':
            s.setUploading(true, msg.fileName as string);
            return true;
        case 'driveUploadDone':
            s.setUploading(false);
            return true;
        case 'driveFileStarred': {
            const fileId = msg.fileId as string;
            const starred = msg.starred as boolean;
            const updateStar = (files: DriveFileData[]) =>
                files.map((f) => (f.id === fileId ? { ...f, starred } : f));
            s.setFiles(updateStar(s.files), s.nextPageToken);
            if (s.selectedFile?.id === fileId) {
                s.selectFile({ ...s.selectedFile, starred });
            }
            return true;
        }
        default:
            return false;
    }
}
