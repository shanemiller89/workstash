import React from 'react';
import { useAIStore } from '../aiStore';
import { SummaryPane } from './SummaryPane';
import { TabSummaryButton } from './TabSummary';
import { ErrorBoundary } from './ErrorBoundary';

// ─── Tab label map ────────────────────────────────────────────────

const TAB_LABELS: Record<string, string> = {
    stashes: 'Stashes',
    prs: 'Pull Requests',
    issues: 'Issues',
    notes: 'Notes',
    mattermost: 'Mattermost',
    projects: 'Projects',
};

// ─── Component ────────────────────────────────────────────────────

interface TabWithSummaryProps {
    tabKey: string;
    children: React.ReactNode;
    /** Optional label override (defaults to TAB_LABELS lookup) */
    label?: string;
}

/**
 * Wraps a tab's content in a horizontal split layout.
 * Includes a fixed sparkles toggle in the top-right corner
 * and a summary right pane that appears when toggled.
 */
export const TabWithSummary: React.FC<TabWithSummaryProps> = ({ tabKey, children, label }) => {
    const summaryPaneTabKey = useAIStore((s) => s.summaryPaneTabKey);
    const aiAvailable = useAIStore((s) => s.aiAvailable);
    const isOpen = summaryPaneTabKey === tabKey;
    const displayLabel = label ?? TAB_LABELS[tabKey] ?? tabKey;

    return (
        <div className="flex h-full">
            {/* Main tab content */}
            <div className="flex-1 min-w-0 overflow-hidden relative">
                {children}
                {/* Floating toggle button — top-right of content area (only when AI available) */}
                {aiAvailable && (
                    <div className="absolute top-1 right-1 z-10">
                        <TabSummaryButton tabKey={tabKey} />
                    </div>
                )}
            </div>

            {/* Right pane */}
            {isOpen && (
                <div className="w-[280px] flex-shrink-0 overflow-hidden">
                    <ErrorBoundary label="AI Summary">
                        <SummaryPane tabKey={tabKey} label={displayLabel} />
                    </ErrorBoundary>
                </div>
            )}
        </div>
    );
};

// Re-export TabSummaryButton for convenience
export { TabSummaryButton };
