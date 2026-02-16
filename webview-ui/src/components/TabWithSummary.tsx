import React, { useCallback } from 'react';
import { Group, Panel, Separator, type Layout } from 'react-resizable-panels';
import { useAIStore } from '../aiStore';
import { SummaryPane } from './SummaryPane';
import { ErrorBoundary } from './ErrorBoundary';

// ─── Tab label map ────────────────────────────────────────────────

const TAB_LABELS: Record<string, string> = {
    stashes: 'Stashes',
    prs: 'Pull Requests',
    issues: 'Issues',
    notes: 'Notes',
    mattermost: 'Mattermost',
    projects: 'Projects',
    drive: 'Google Drive',
    calendar: 'Google Calendar',
    wiki: 'Wiki',
};

// ─── Persistence helpers ──────────────────────────────────────────

function getPersistedSummarySize(tabKey: string): number | null {
    try {
        const raw = localStorage.getItem(`resizable-summary-${tabKey}`);
        if (raw) {
            return JSON.parse(raw) as number;
        }
    } catch { /* ignore */ }
    return null;
}

function persistSummarySize(tabKey: string, size: number): void {
    try {
        localStorage.setItem(`resizable-summary-${tabKey}`, JSON.stringify(size));
    } catch { /* ignore */ }
}

// ─── Component ────────────────────────────────────────────────────

/** Default summary pane width as a percentage */
const DEFAULT_SUMMARY_PERCENT = 30;

interface TabWithSummaryProps {
    tabKey: string;
    children: React.ReactNode;
    /** Optional label override (defaults to TAB_LABELS lookup) */
    label?: string;
}

/**
 * Wraps a tab's content in a horizontal split layout.
 * When the AI summary pane is toggled open (via the TabBar sparkles button),
 * a resizable summary right pane appears alongside the tab content.
 */
export const TabWithSummary: React.FC<TabWithSummaryProps> = ({ tabKey, children, label }) => {
    const summaryPaneTabKey = useAIStore((s) => s.summaryPaneTabKey);
    const isOpen = summaryPaneTabKey === tabKey;
    const displayLabel = label ?? TAB_LABELS[tabKey] ?? tabKey;

    const savedSummaryPercent = getPersistedSummarySize(tabKey) ?? DEFAULT_SUMMARY_PERCENT;

    const handleLayoutChanged = useCallback(
        (layout: Layout) => {
            const summarySize = layout['summary'];
            if (summarySize !== undefined) {
                persistSummarySize(tabKey, summarySize);
            }
        },
        [tabKey],
    );

    return (
        <div className="flex h-full">
            {isOpen ? (
                <Group
                    id={`superprompt-forge-summary-${tabKey}`}
                    orientation="horizontal"
                    onLayoutChanged={handleLayoutChanged}
                >
                    <Panel id="content" defaultSize={`${100 - savedSummaryPercent}%`} minSize="40%">
                        <div className="h-full min-w-0 overflow-clip">
                            {children}
                        </div>
                    </Panel>
                    <Separator className="resize-handle" />
                    <Panel id="summary" defaultSize={`${savedSummaryPercent}%`} minSize="15%" maxSize="50%">
                        <div className="h-full overflow-clip">
                            <ErrorBoundary label="AI Summary">
                                <SummaryPane tabKey={tabKey} label={displayLabel} />
                            </ErrorBoundary>
                        </div>
                    </Panel>
                </Group>
            ) : (
                <div className="flex-1 min-w-0 overflow-clip">
                    {children}
                </div>
            )}
        </div>
    );
};
