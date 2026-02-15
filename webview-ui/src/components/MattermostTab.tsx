import React, { useCallback, useRef, useState, useEffect } from 'react';
import { Group, Panel, Separator, type Layout } from 'react-resizable-panels';
import { useMattermostStore } from '../mattermostStore';
import { MattermostChannelList } from './MattermostChannelList';
import { MattermostChat } from './MattermostChat';
import { MattermostThreadPanel } from './MattermostThreadPanel';
import { ErrorBoundary } from './ErrorBoundary';
import { TabWithSummary } from './TabWithSummary';
import { MessageSquare } from 'lucide-react';

const NARROW_BREAKPOINT = 640;

/** Persist thread panel size */
function getPersistedThreadSize(): number {
    try {
        const raw = localStorage.getItem('resizable-mattermost-thread');
        if (raw) { return JSON.parse(raw) as number; }
    } catch { /* ignore */ }
    return 40;
}
function persistThreadSize(size: number): void {
    try {
        localStorage.setItem('resizable-mattermost-thread', JSON.stringify(size));
    } catch { /* ignore */ }
}

/** Persist list panel size */
function getPersistedListSize(): number {
    try {
        const raw = localStorage.getItem('resizable-mattermost');
        if (raw) { return JSON.parse(raw) as number; }
    } catch { /* ignore */ }
    return 28;
}
function persistListSize(size: number): void {
    try {
        localStorage.setItem('resizable-mattermost', JSON.stringify(size));
    } catch { /* ignore */ }
}

/**
 * Chat + Thread horizontal split.
 * When a thread is open, the chat area splits into Chat | ThreadPanel
 * using react-resizable-panels for a Slack-style layout.
 */
const ChatWithThread: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const activeThreadRootId = useMattermostStore((s) => s.activeThreadRootId);
    const hasThread = activeThreadRootId !== null;

    const threadDefaultSize = getPersistedThreadSize();

    const handleThreadLayoutChanged = useCallback((layout: Layout) => {
        const threadSize = layout['thread'];
        if (threadSize !== undefined) {
            persistThreadSize(threadSize);
        }
    }, []);

    if (!hasThread) {
        return <MattermostChat onClose={onClose} />;
    }

    return (
        <Group
            id="superprompt-forge-mattermost-thread"
            orientation="horizontal"
            onLayoutChanged={handleThreadLayoutChanged}
        >
            <Panel
                id="chat"
                defaultSize={`${100 - threadDefaultSize}%`}
                minSize="30%"
            >
                <div className="h-full overflow-hidden">
                    <ErrorBoundary label="Chat">
                        <MattermostChat onClose={onClose} />
                    </ErrorBoundary>
                </div>
            </Panel>
            <Separator className="resize-handle" />
            <Panel
                id="thread"
                defaultSize={`${threadDefaultSize}%`}
                minSize="20%"
            >
                <div className="h-full overflow-hidden">
                    <ErrorBoundary label="Thread">
                        <MattermostThreadPanel />
                    </ErrorBoundary>
                </div>
            </Panel>
        </Group>
    );
};

/** Empty state shown when no channel is selected */
const EmptyChat: React.FC = () => (
    <div className="h-full flex flex-col items-center justify-center gap-3 text-fg/30">
        <MessageSquare size={32} strokeWidth={1.5} />
        <p className="text-sm">Select a channel to start chatting</p>
    </div>
);

export const MattermostTab: React.FC = () => {
    const selectedChannelId = useMattermostStore((s) => s.selectedChannelId);
    const clearChannelSelection = useMattermostStore((s) => s.clearChannelSelection);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isNarrow, setIsNarrow] = useState(false);

    const handleCloseDetail = useCallback(() => {
        clearChannelSelection();
    }, [clearChannelSelection]);

    const hasSelection = selectedChannelId !== null;
    const defaultListPercent = getPersistedListSize();

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setIsNarrow(entry.contentRect.width < NARROW_BREAKPOINT);
            }
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    const handleLayoutChanged = useCallback((layout: Layout) => {
        const listSize = layout['list'];
        if (listSize !== undefined) {
            persistListSize(listSize);
        }
    }, []);

    // Narrow mode: show either list OR chat
    if (isNarrow) {
        return (
            <TabWithSummary tabKey="mattermost">
                <div ref={containerRef} className="h-full flex flex-col bg-bg text-fg text-[13px]">
                    {hasSelection ? (
                        <ChatWithThread onClose={handleCloseDetail} />
                    ) : (
                        <ErrorBoundary label="Channel List">
                            <MattermostChannelList />
                        </ErrorBoundary>
                    )}
                </div>
            </TabWithSummary>
        );
    }

    // Wide mode: always show list + detail (chat or empty state)
    return (
        <TabWithSummary tabKey="mattermost">
            <div ref={containerRef} className="h-full flex flex-col bg-bg text-fg text-[13px]">
                <Group
                    id="superprompt-forge-mattermost"
                    orientation="horizontal"
                    onLayoutChanged={handleLayoutChanged}
                >
                    <Panel
                        id="list"
                        defaultSize={`${defaultListPercent}%`}
                        minSize="15%"
                    >
                        <div className="h-full overflow-hidden">
                            <ErrorBoundary label="Channel List">
                                <MattermostChannelList />
                            </ErrorBoundary>
                        </div>
                    </Panel>
                    <Separator className="resize-handle" />
                    <Panel
                        id="detail"
                        defaultSize={`${100 - defaultListPercent}%`}
                        minSize="30%"
                    >
                        <div className="h-full overflow-hidden">
                            {hasSelection ? (
                                <ErrorBoundary label="Chat">
                                    <ChatWithThread onClose={handleCloseDetail} />
                                </ErrorBoundary>
                            ) : (
                                <EmptyChat />
                            )}
                        </div>
                    </Panel>
                </Group>
            </div>
        </TabWithSummary>
    );
};
