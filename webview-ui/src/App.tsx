import React, { useEffect, useCallback } from 'react';
import { useStashStore } from './store';
import { useAppStore } from './appStore';
import { onMessage, postMessage } from './vscode';
import { StashList } from './components/StashList';
import { StashDetail } from './components/StashDetail';
import { TabBar } from './components/TabBar';
import { NotesTab } from './components/NotesTab';
import { PRsTab } from './components/PRsTab';
import { IssuesTab } from './components/IssuesTab';
import { ProjectsTab } from './components/ProjectsTab';
import { MattermostTab } from './components/MattermostTab';
import { ResizableLayout } from './components/ResizableLayout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useAIStore } from './aiStore';
import { FloatingChat } from './components/FloatingChat';
import { AgentTab } from './components/AgentTab';
import { SettingsTab } from './components/SettingsTab';
import { TabWithSummary } from './components/TabWithSummary';
import { DriveTab } from './components/DriveTab';
import { CalendarTab } from './components/CalendarTab';
import { WikiTab } from './components/WikiTab';
import { handlerRegistry } from './hooks';

/** Stash master-detail pane (extracted from old App root) */
const StashesTab: React.FC = () => {
    const selectedStashIndex = useStashStore((s) => s.selectedStashIndex);
    const clearSelection = useStashStore((s) => s.clearSelection);

    const handleCloseDetail = useCallback(() => {
        clearSelection();
    }, [clearSelection]);

    const hasSelection = selectedStashIndex !== null;

    return (
        <TabWithSummary tabKey="stashes">
            <ResizableLayout
                storageKey="stashes"
                hasSelection={hasSelection}
                backLabel="Back to list"
                onBack={handleCloseDetail}
                listContent={<StashList />}
                detailContent={<StashDetail onClose={handleCloseDetail} />}
            />
        </TabWithSummary>
    );
};

export const App: React.FC = () => {
    const activeTab = useAppStore((s) => s.activeTab);

    // Listen for all messages from the extension — dispatched to per-domain handlers
    useEffect(() => {
        const dispose = onMessage((msg) => {
            for (const handler of handlerRegistry) {
                if (handler(msg)) {
                    return;
                }
            }
        });

        // Request initial data
        postMessage('ready');

        return dispose;
    }, []);


    const chatPanelOpen = useAIStore((s) => s.chatPanelOpen);

    return (
        <div className="h-screen bg-bg text-fg text-[13px] flex flex-col">
            <ErrorBoundary label="TabBar">
                <TabBar />
            </ErrorBoundary>
            <div className="flex-1 min-h-0 overflow-hidden relative">
                <div className="h-full overflow-hidden">
                    {activeTab === 'stashes' ? (
                        <ErrorBoundary key="stashes" label="Stashes">
                            <StashesTab />
                        </ErrorBoundary>
                    ) : activeTab === 'notes' ? (
                        <ErrorBoundary key="notes" label="Notes">
                            <NotesTab />
                        </ErrorBoundary>
                    ) : activeTab === 'prs' ? (
                        <ErrorBoundary key="prs" label="Pull Requests">
                            <PRsTab />
                        </ErrorBoundary>
                    ) : activeTab === 'issues' ? (
                        <ErrorBoundary key="issues" label="Issues">
                            <IssuesTab />
                        </ErrorBoundary>
                    ) : activeTab === 'projects' ? (
                        <ErrorBoundary key="projects" label="Projects">
                            <ProjectsTab />
                        </ErrorBoundary>
                    ) : activeTab === 'settings' ? (
                        <ErrorBoundary key="settings" label="Settings">
                            <SettingsTab />
                        </ErrorBoundary>
                    ) : activeTab === 'drive' ? (
                        <ErrorBoundary key="drive" label="Google Drive">
                            <DriveTab />
                        </ErrorBoundary>
                    ) : activeTab === 'calendar' ? (
                        <ErrorBoundary key="calendar" label="Google Calendar">
                            <CalendarTab />
                        </ErrorBoundary>
                    ) : activeTab === 'wiki' ? (
                        <ErrorBoundary key="wiki" label="Wiki">
                            <WikiTab />
                        </ErrorBoundary>
                    ) : activeTab === 'agent' ? (
                        <ErrorBoundary key="agent" label="Agent">
                            <AgentTab />
                        </ErrorBoundary>
                    ) : (
                        <ErrorBoundary key="mattermost" label="Mattermost">
                            <MattermostTab />
                        </ErrorBoundary>
                    )}
                </div>
                {chatPanelOpen && (
                    <ErrorBoundary label="AI Chat">
                        <FloatingChat />
                    </ErrorBoundary>
                )}
            </div>
        </div>
    );
};
