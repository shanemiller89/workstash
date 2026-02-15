import React, { useCallback, useEffect } from 'react';
import { useDriveStore } from '../driveStore';
import { DriveFileList } from './DriveFileList';
import { DriveFileDetail } from './DriveFileDetail';
import { ResizableLayout } from './ResizableLayout';
import { postMessage } from '../vscode';

export const DriveTab: React.FC = () => {
    const isAuthenticated = useDriveStore((s) => s.isAuthenticated);
    const selectedFile = useDriveStore((s) => s.selectedFile);
    const selectFile = useDriveStore((s) => s.selectFile);

    const handleCloseDetail = useCallback(() => {
        selectFile(null);
    }, [selectFile]);

    // Request drive data when tab mounts
    useEffect(() => {
        if (isAuthenticated) {
            postMessage('drive.listFiles', { folderId: 'root' });
            postMessage('drive.getPinnedDocs');
        }
    }, [isAuthenticated]);

    // Not authenticated — show sign-in prompt
    if (!isAuthenticated) {
        return (
            <div className="h-full bg-bg text-fg text-[13px] flex items-center justify-center">
                <div className="text-center space-y-4 max-w-sm">
                    <div className="text-4xl">☁️</div>
                    <h2 className="text-lg font-semibold">Google Drive</h2>
                    <p className="text-fg/60 text-sm">
                        Sign in with your Google account to browse, upload, and manage files.
                    </p>
                    <p className="text-fg/40 text-xs">
                        Requires a Google Cloud OAuth Client ID configured in settings.
                    </p>
                    <button
                        className="inline-flex items-center gap-2 px-4 py-2 rounded bg-accent text-accent-foreground hover:bg-accent/90 text-sm font-medium"
                        onClick={() => postMessage('drive.signIn')}
                    >
                        Sign in to Google
                    </button>
                </div>
            </div>
        );
    }

    const hasSelection = selectedFile !== null;

    return (
        <ResizableLayout
            storageKey="drive"
            hasSelection={hasSelection}
            backLabel="Back to files"
            onBack={handleCloseDetail}
            listContent={<DriveFileList />}
            detailContent={<DriveFileDetail onClose={handleCloseDetail} />}
        />
    );
};
