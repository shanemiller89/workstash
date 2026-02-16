import React, { useCallback } from 'react';
import { Group, Panel, Separator, type Layout } from 'react-resizable-panels';
import { usePRStore } from '../prStore';
import { PRList } from './PRList';
import { PRDetail } from './PRDetail';
import { PRThreadPanel } from './PRThreadPanel';
import { CreatePRForm } from './CreatePRForm';
import { ResizableLayout } from './ResizableLayout';
import { ErrorBoundary } from './ErrorBoundary';
import { TabWithSummary } from './TabWithSummary';

/** Persist thread panel size */
function getPersistedThreadSize(): number {
    try {
        const raw = localStorage.getItem('resizable-pr-thread');
        if (raw) {
            return JSON.parse(raw) as number;
        }
    } catch {
        /* ignore */
    }
    return 40;
}
function persistThreadSize(size: number): void {
    try {
        localStorage.setItem('resizable-pr-thread', JSON.stringify(size));
    } catch {
        /* ignore */
    }
}

/** PR Detail + Thread panel horizontal split */
const DetailWithThread: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const activeThreadId = usePRStore((s) => s.activeThreadId);
    const hasThread = activeThreadId !== null;
    const threadDefaultSize = getPersistedThreadSize();

    const handleThreadLayoutChanged = useCallback((layout: Layout) => {
        const threadSize = layout['pr-thread'];
        if (threadSize !== undefined) {
            persistThreadSize(threadSize);
        }
    }, []);

    if (!hasThread) {
        return <PRDetail onClose={onClose} />;
    }

    return (
        <Group
            id="superprompt-forge-pr-thread"
            orientation="horizontal"
            onLayoutChanged={handleThreadLayoutChanged}
        >
            <Panel
                id="pr-detail"
                defaultSize={`${100 - threadDefaultSize}%`}
                minSize="30%"
            >
                <div className="h-full overflow-hidden">
                    <ErrorBoundary label="PR Detail">
                        <PRDetail onClose={onClose} />
                    </ErrorBoundary>
                </div>
            </Panel>
            <Separator className="resize-handle" />
            <Panel
                id="pr-thread"
                defaultSize={`${threadDefaultSize}%`}
                minSize="20%"
            >
                <div className="h-full overflow-hidden">
                    <ErrorBoundary label="Thread">
                        <PRThreadPanel />
                    </ErrorBoundary>
                </div>
            </Panel>
        </Group>
    );
};

export const PRsTab: React.FC = () => {
    const selectedPRNumber = usePRStore((s) => s.selectedPRNumber);
    const showCreatePR = usePRStore((s) => s.showCreatePR);
    const setShowCreatePR = usePRStore((s) => s.setShowCreatePR);
    const clearSelection = usePRStore((s) => s.clearSelection);
    const closeThread = usePRStore((s) => s.closeThread);

    const handleCloseDetail = useCallback(() => {
        closeThread();
        clearSelection();
    }, [clearSelection, closeThread]);

    const handleBackFromCreate = useCallback(() => {
        setShowCreatePR(false);
    }, [setShowCreatePR]);

    // Show create PR form
    if (showCreatePR) {
        return (
            <TabWithSummary tabKey="prs">
                <CreatePRForm onBack={handleBackFromCreate} />
            </TabWithSummary>
        );
    }

    const hasSelection = selectedPRNumber !== null;

    return (
        <TabWithSummary tabKey="prs">
            <ResizableLayout
                storageKey="prs"
                hasSelection={hasSelection}
                backLabel="Back to PRs"
                onBack={handleCloseDetail}
                listContent={<PRList />}
                detailContent={<DetailWithThread onClose={handleCloseDetail} />}
            />
        </TabWithSummary>
    );
};
