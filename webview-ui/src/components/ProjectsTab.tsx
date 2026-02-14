import React, { useCallback, useMemo } from 'react';
import { useProjectStore } from '../projectStore';
import { useNotesStore } from '../notesStore';
import { postMessage } from '../vscode';
import { ProjectList } from './ProjectList';
import { ProjectDetail } from './ProjectDetail';
import { ProjectBoardView } from './ProjectBoardView';
import { ProjectTableView } from './ProjectTableView';
import { ResizableLayout } from './ResizableLayout';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
    LayoutGrid,
    Table,
    List,
    Kanban,
    Search,
    RefreshCw,
    ChevronDown,
    User,
} from 'lucide-react';

// Synthetic view id for the built-in simple list view
const SIMPLE_VIEW_ID = '__simple__';

export const ProjectsTab: React.FC = () => {
    const selectedItemId = useProjectStore((s) => s.selectedItemId);
    const clearSelection = useProjectStore((s) => s.clearSelection);
    const selectedProject = useProjectStore((s) => s.selectedProject);
    const selectedViewId = useProjectStore((s) => s.selectedViewId);
    const setSelectedViewId = useProjectStore((s) => s.setSelectedViewId);
    const myIssuesOnly = useProjectStore((s) => s.myIssuesOnly);
    const setMyIssuesOnly = useProjectStore((s) => s.setMyIssuesOnly);
    const isAuthenticated = useNotesStore((s) => s.isAuthenticated);
    const authUsername = useNotesStore((s) => s.authUsername);
    const isRepoNotFound = useProjectStore((s) => s.isRepoNotFound);
    const isLoading = useProjectStore((s) => s.isLoading);
    const isItemsLoading = useProjectStore((s) => s.isItemsLoading);
    const availableProjects = useProjectStore((s) => s.availableProjects);
    const statusFilter = useProjectStore((s) => s.statusFilter);
    const setStatusFilter = useProjectStore((s) => s.setStatusFilter);
    const searchQuery = useProjectStore((s) => s.searchQuery);
    const setSearchQuery = useProjectStore((s) => s.setSearchQuery);
    const fields = useProjectStore((s) => s.fields);

    const views = selectedProject?.views;

    // Derive active view from raw data — must depend on selectedViewId & views
    const currentView = useMemo(() => {
        if (!views?.length) {
            return undefined;
        }
        if (selectedViewId && selectedViewId !== SIMPLE_VIEW_ID) {
            const found = views.find((v) => v.id === selectedViewId);
            if (found) {
                return found;
            }
        }
        return views[0];
    }, [views, selectedViewId]);

    const currentStatusOptions = useMemo(() => {
        const statusField = fields.find(
            (f) => f.name === 'Status' && f.dataType === 'SINGLE_SELECT',
        );
        return statusField?.options ?? [];
    }, [fields]);

    const handleCloseDetail = useCallback(() => {
        clearSelection();
    }, [clearSelection]);

    const handleRefresh = useCallback(() => {
        postMessage('projects.refresh');
    }, []);

    const handleProjectSwitch = useCallback((projectId: string) => {
        postMessage('projects.selectProject', { projectId });
    }, []);

    const hasSelection = selectedItemId !== null;
    const isSimple = selectedViewId === SIMPLE_VIEW_ID;
    const layout = isSimple ? 'SIMPLE' : (currentView?.layout ?? 'TABLE');
    const loading = isLoading || isItemsLoading;

    // ─── Auth / repo-not-found guard ──────────────────────────────
    if (!isAuthenticated) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
                <Kanban size={32} className="text-fg/30" />
                <p className="text-fg/60 text-[12px]">
                    Sign in to GitHub to see your projects.
                </p>
                <Button onClick={() => postMessage('projects.signIn')}>
                    Sign In to GitHub
                </Button>
            </div>
        );
    }

    if (isRepoNotFound) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
                <Kanban size={32} className="text-fg/30" />
                <p className="text-fg/60 text-[12px]">
                    Not a GitHub repository. Projects require a GitHub remote.
                </p>
            </div>
        );
    }

    // ─── Determine back label per layout ──────────────────────────
    const backLabel =
        layout === 'BOARD'
            ? 'Back to Board'
            : layout === 'TABLE'
              ? 'Back to Table'
              : 'Back to Project';

    // ─── Render view content (what goes in the list slot) ─────────
    const renderViewContent = () => {
        if (loading) {
            return (
                <div className="flex items-center justify-center h-full text-fg/40 text-[11px]">
                    Loading project items…
                </div>
            );
        }

        switch (layout) {
            case 'BOARD':
                return <ProjectBoardView />;
            case 'TABLE':
                return <ProjectTableView />;
            case 'SIMPLE':
            default:
                return <ProjectList />;
        }
    };

    return (
        <div className="h-full flex flex-col">
            {/* ── Shared header ─────────────────────────────────── */}
            <div className="flex-shrink-0 border-b border-border">
                {/* Project selector */}
                {availableProjects.length > 1 && (
                    <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border">
                        <span className="text-[10px] text-fg/40">Project:</span>
                        <select
                            className="bg-transparent text-[11px] text-fg border-none outline-none cursor-pointer flex-1 min-w-0"
                            value={selectedProject?.id ?? ''}
                            onChange={(e) => handleProjectSwitch(e.target.value)}
                        >
                            {availableProjects.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.title}
                                </option>
                            ))}
                        </select>
                        <ChevronDown size={11} className="text-fg/30" />
                    </div>
                )}

                {/* View switcher (always shown when project has views) */}
                {selectedProject && (
                    <ViewSwitcher
                        views={views ?? []}
                        selectedViewId={selectedViewId}
                        onSelectView={setSelectedViewId}
                    />
                )}

                {/* Status filter pills + refresh (for non-board views — board shows columns) */}
                {layout !== 'BOARD' && (
                    <div className="flex items-center gap-1 px-3 py-2 flex-wrap">
                        <Button
                            variant={statusFilter === 'all' ? 'default' : 'secondary'}
                            size="sm"
                            className="h-auto px-2.5 py-1 text-[11px] rounded-full"
                            onClick={() => setStatusFilter('all')}
                        >
                            All
                        </Button>
                        {authUsername && (
                            <Button
                                variant={myIssuesOnly ? 'default' : 'secondary'}
                                size="sm"
                                className="h-auto px-2.5 py-1 text-[11px] rounded-full gap-1"
                                onClick={() => setMyIssuesOnly(!myIssuesOnly)}
                            >
                                <User size={10} />
                                My Issues
                            </Button>
                        )}
                        {currentStatusOptions.map((opt) => (
                            <Button
                                key={opt.id}
                                variant={statusFilter === opt.name ? 'default' : 'secondary'}
                                size="sm"
                                className="h-auto px-2.5 py-1 text-[11px] rounded-full"
                                onClick={() => setStatusFilter(opt.name)}
                            >
                                {opt.name}
                            </Button>
                        ))}
                        <div className="flex-1" />
                        <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={handleRefresh}
                            title="Refresh"
                        >
                            <RefreshCw size={13} />
                        </Button>
                    </div>
                )}

                {/* Search bar */}
                <div className="px-3 pb-2 flex items-center gap-1.5">
                    <div className="relative flex-1">
                        <Search
                            size={12}
                            className="absolute left-2 top-1/2 -translate-y-1/2 text-fg/30"
                        />
                        <Input
                            type="text"
                            placeholder="Search items..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-7 text-[11px]"
                        />
                    </div>
                    {/* Refresh for board views (no status bar to hold the button) */}
                    {layout === 'BOARD' && (
                        <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={handleRefresh}
                            title="Refresh"
                        >
                            <RefreshCw size={13} />
                        </Button>
                    )}
                </div>
            </div>

            {/* ── View content ──────────────────────────────────── */}
            <div className="flex-1 min-h-0">
                {layout === 'BOARD' && !hasSelection ? (
                    renderViewContent()
                ) : layout === 'SIMPLE' ? (
                    <ResizableLayout
                        storageKey="projects"
                        hasSelection={hasSelection}
                        backLabel={backLabel}
                        onBack={handleCloseDetail}
                        listContent={renderViewContent()}
                        detailContent={<ProjectDetail onClose={handleCloseDetail} />}
                    />
                ) : (
                    <ResizableLayout
                        storageKey={`projects-${layout.toLowerCase()}`}
                        hasSelection={hasSelection}
                        backLabel={backLabel}
                        onBack={handleCloseDetail}
                        listContent={renderViewContent()}
                        detailContent={<ProjectDetail onClose={handleCloseDetail} />}
                    />
                )}
            </div>
        </div>
    );
};

// ─── View Switcher ────────────────────────────────────────────────

function ViewLayoutIcon({ layout }: { layout: string }) {
    switch (layout) {
        case 'BOARD':
            return <LayoutGrid size={11} />;
        case 'TABLE':
            return <Table size={11} />;
        default:
            return <List size={11} />;
    }
}

interface ViewSwitcherProps {
    views: { id: string; name: string; layout: string }[];
    selectedViewId: string | null;
    onSelectView: (viewId: string | null) => void;
}

const ViewSwitcher: React.FC<ViewSwitcherProps> = ({ views, selectedViewId, onSelectView }) => {
    return (
        <div className="flex-shrink-0 flex items-center gap-0.5 px-3 py-1.5 border-b border-border overflow-x-auto">
            {/* Simple view — first / default */}
            <Button
                variant={selectedViewId === SIMPLE_VIEW_ID ? 'default' : 'ghost'}
                size="sm"
                className="h-auto px-2.5 py-1 text-[10px] gap-1 flex-shrink-0"
                onClick={() => onSelectView(SIMPLE_VIEW_ID)}
            >
                <List size={11} />
                Simple
            </Button>
            {views.map((view) => {
                const isActive = view.id === selectedViewId;
                return (
                    <Button
                        key={view.id}
                        variant={isActive ? 'default' : 'ghost'}
                        size="sm"
                        className="h-auto px-2.5 py-1 text-[10px] gap-1 flex-shrink-0"
                        onClick={() => onSelectView(view.id)}
                    >
                        <ViewLayoutIcon layout={view.layout} />
                        {view.name}
                    </Button>
                );
            })}
        </div>
    );
};
