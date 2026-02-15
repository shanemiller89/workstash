import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Group, Panel, Separator, type Layout } from 'react-resizable-panels';
import { ErrorBoundary } from './ErrorBoundary';
import { Button } from './ui/button';

const NARROW_BREAKPOINT = 640;

interface ResizableLayoutProps {
    /** Unique key for persisting panel sizes (e.g. 'stashes', 'notes', 'prs') */
    storageKey: string;
    /** Whether an item is currently selected */
    hasSelection: boolean;
    /** Back button label in narrow mode */
    backLabel: string;
    /** Called when user clicks back in narrow mode */
    onBack: () => void;
    /** The list panel content */
    listContent: React.ReactNode;
    /** The detail panel content */
    detailContent: React.ReactNode;
    /** Default list panel width percent when no persisted size exists (default 50) */
    defaultListSize?: number;
}

/** Persisted layout sizes via localStorage */
function getPersistedSize(key: string): number | null {
    try {
        const raw = localStorage.getItem(`resizable-${key}`);
        if (raw) return JSON.parse(raw) as number;
    } catch { /* ignore */ }
    return null;
}

function persistSize(key: string, size: number): void {
    try {
        localStorage.setItem(`resizable-${key}`, JSON.stringify(size));
    } catch { /* ignore */ }
}

/**
 * Shared resizable master-detail layout.
 * In narrow mode (< 640px) shows list OR detail.
 * In wide mode shows a draggable split with a resize handle.
 */
export const ResizableLayout: React.FC<ResizableLayoutProps> = ({
    storageKey,
    hasSelection,
    backLabel,
    onBack,
    listContent,
    detailContent,
    defaultListSize = 50,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isNarrow, setIsNarrow] = useState(false);

    const defaultListPercent = getPersistedSize(storageKey) ?? defaultListSize;

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

    const handleLayoutChanged = useCallback(
        (layout: Layout) => {
            const listSize = layout['list'];
            if (listSize !== undefined) {
                persistSize(storageKey, listSize);
            }
        },
        [storageKey],
    );

    // Narrow mode: show either list OR detail
    if (isNarrow) {
        return (
            <div ref={containerRef} className="h-full bg-bg text-fg text-[13px]">
                {hasSelection ? (
                    <div className="h-full flex flex-col">
                        <div className="px-3 py-1.5 border-b border-border flex-shrink-0">
                            <Button
                                variant="link"
                                size="sm"
                                className="h-auto p-0 text-[11px] gap-1"
                                onClick={onBack}
                            >
                                ← {backLabel}
                            </Button>
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <ErrorBoundary label="Detail">
                                {detailContent}
                            </ErrorBoundary>
                        </div>
                    </div>
                ) : (
                    <ErrorBoundary label="List">
                        {listContent}
                    </ErrorBoundary>
                )}
            </div>
        );
    }

    // Wide mode: resizable split
    return (
        <div ref={containerRef} className="h-full bg-bg text-fg text-[13px]">
            <Group
                id={`superprompt-forge-${storageKey}`}
                orientation="horizontal"
                onLayoutChanged={handleLayoutChanged}
            >
                <Panel
                    id="list"
                    defaultSize={hasSelection ? `${defaultListPercent}%` : '100%'}
                    minSize="20%"
                >
                    <div className="h-full overflow-hidden">
                        <ErrorBoundary label="List">
                            {listContent}
                        </ErrorBoundary>
                    </div>
                </Panel>

                {hasSelection && (
                    <>
                        <Separator className="resize-handle" />
                        <Panel
                            id="detail"
                            defaultSize={`${100 - defaultListPercent}%`}
                            minSize="25%"
                        >
                            <div className="h-full overflow-hidden">
                                <ErrorBoundary label="Detail">
                                    {detailContent}
                                </ErrorBoundary>
                            </div>
                        </Panel>
                    </>
                )}
            </Group>
        </div>
    );
};
