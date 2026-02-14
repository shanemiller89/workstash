import { create } from 'zustand';

// ─── Data Shapes (mirror projectService webview types) ────────────

export interface ProjectFieldOption {
    id: string;
    name: string;
    color?: string;
    description?: string;
}

export interface ProjectIteration {
    id: string;
    title: string;
    startDate: string;
    duration: number;
}

export interface ProjectFieldData {
    id: string;
    name: string;
    dataType: string;
    options?: ProjectFieldOption[];
    iterations?: ProjectIteration[];
}

export interface ProjectFieldValueData {
    fieldId: string;
    fieldName: string;
    fieldType: string;
    text?: string;
    number?: number;
    date?: string;
    singleSelectOptionId?: string;
    singleSelectOptionName?: string;
    iterationId?: string;
    iterationTitle?: string;
    iterationStartDate?: string;
    labels?: { name: string; color: string }[];
    users?: { login: string; avatarUrl: string }[];
    milestoneTitle?: string;
}

export interface ProjectItemContent {
    type: 'Issue' | 'PullRequest' | 'DraftIssue';
    nodeId: string;
    number?: number;
    title: string;
    state?: string;
    url?: string;
    body?: string;
    author?: string;
    authorAvatarUrl?: string;
    labels?: { name: string; color: string }[];
    assignees?: { login: string; avatarUrl: string }[];
}

export interface ProjectItemData {
    id: string;
    type: 'ISSUE' | 'PULL_REQUEST' | 'DRAFT_ISSUE' | 'REDACTED';
    isArchived: boolean;
    createdAt: string;
    updatedAt: string;
    fieldValues: ProjectFieldValueData[];
    content?: ProjectItemContent;
}

export interface ProjectViewData {
    id: string;
    number: number;
    name: string;
    layout: 'TABLE' | 'BOARD' | 'ROADMAP';
    filter?: string;
    /** Field IDs used for column grouping (Board view) */
    groupByFieldIds?: string[];
    /** Field IDs used for vertical grouping / swimlanes */
    verticalGroupByFieldIds?: string[];
}

export interface ProjectSummary {
    id: string;
    number: number;
    title: string;
    closed: boolean;
    url: string;
}

export interface ProjectData {
    id: string;
    number: number;
    title: string;
    shortDescription: string | null;
    url: string;
    closed: boolean;
    public: boolean;
    fields: ProjectFieldData[];
    views: ProjectViewData[];
    totalItemCount: number;
}

// ─── Board Column Type ────────────────────────────────────────────

export interface BoardColumn {
    id: string;       // option id or '__none__'
    name: string;
    color?: string;
    items: ProjectItemData[];
}

// ─── Store ────────────────────────────────────────────────────────

interface ProjectStore {
    // Available projects for the repo
    availableProjects: ProjectSummary[];
    selectedProjectId: string | null;
    selectedProject: ProjectData | null;

    // Items & fields
    items: ProjectItemData[];
    fields: ProjectFieldData[];

    // Selected item
    selectedItemId: string | null;

    // View selection
    selectedViewId: string | null;

    // Filters
    statusFilter: string; // 'all' or option name
    searchQuery: string;
    myIssuesOnly: boolean;

    // Loading states
    isLoading: boolean;
    isItemsLoading: boolean;
    isFieldUpdating: boolean;
    isRepoNotFound: boolean;

    // Actions
    setAvailableProjects: (projects: ProjectSummary[]) => void;
    setSelectedProject: (project: ProjectData) => void;
    setItems: (items: ProjectItemData[]) => void;
    setFields: (fields: ProjectFieldData[]) => void;
    selectItem: (itemId: string) => void;
    clearSelection: () => void;
    setStatusFilter: (filter: string) => void;
    setSearchQuery: (query: string) => void;
    setMyIssuesOnly: (on: boolean) => void;
    setSelectedViewId: (viewId: string | null) => void;
    setLoading: (loading: boolean) => void;
    setItemsLoading: (loading: boolean) => void;
    setFieldUpdating: (updating: boolean) => void;
    setRepoNotFound: (notFound: boolean) => void;
    updateItemFieldValue: (itemId: string, fieldId: string, value: ProjectFieldValueData) => void;
    removeItem: (itemId: string) => void;
    addItem: (item: ProjectItemData) => void;

    // Selectors
    filteredItems: () => ProjectItemData[];
    selectedItem: () => ProjectItemData | undefined;
    statusOptions: () => ProjectFieldOption[];
    activeView: () => ProjectViewData | undefined;
    boardColumns: () => BoardColumn[];
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
    availableProjects: [],
    selectedProjectId: null,
    selectedProject: null,
    items: [],
    fields: [],
    selectedItemId: null,
    selectedViewId: '__simple__',
    statusFilter: 'all',
    searchQuery: '',
    myIssuesOnly: false,
    isLoading: false,
    isItemsLoading: false,
    isFieldUpdating: false,
    isRepoNotFound: false,

    setAvailableProjects: (projects) => set({ availableProjects: projects }),

    setSelectedProject: (project) =>
        set({
            selectedProject: project,
            selectedProjectId: project.id,
            fields: project.fields,
            selectedItemId: null,
            selectedViewId: '__simple__',
            statusFilter: 'all',
            searchQuery: '',
            myIssuesOnly: false,
        }),

    setItems: (items) => {
        const { selectedItemId } = get();
        const stillExists = selectedItemId !== null && items.some((i) => i.id === selectedItemId);
        set({
            items,
            isItemsLoading: false,
            isLoading: false,
            ...(stillExists ? {} : { selectedItemId: null }),
        });
    },

    setFields: (fields) => set({ fields }),

    selectItem: (itemId) => {
        const { selectedItemId } = get();
        if (itemId === selectedItemId) {
            return;
        }
        set({ selectedItemId: itemId });
    },

    clearSelection: () => set({ selectedItemId: null }),

    setStatusFilter: (statusFilter) =>
        set({ statusFilter }),

    setSearchQuery: (searchQuery) => set({ searchQuery }),

    setMyIssuesOnly: (myIssuesOnly) => set({ myIssuesOnly }),

    setSelectedViewId: (viewId) => set({ selectedViewId: viewId }),

    setLoading: (loading) => set({ isLoading: loading }),
    setItemsLoading: (loading) => set({ isItemsLoading: loading }),
    setFieldUpdating: (updating) => set({ isFieldUpdating: updating }),
    setRepoNotFound: (notFound) => set({ isRepoNotFound: notFound, isLoading: false }),

    updateItemFieldValue: (itemId, fieldId, value) => {
        set((state) => ({
            items: state.items.map((item) => {
                if (item.id !== itemId) {
                    return item;
                }
                const existingIdx = item.fieldValues.findIndex((fv) => fv.fieldId === fieldId);
                const newFieldValues = [...item.fieldValues];
                if (existingIdx >= 0) {
                    newFieldValues[existingIdx] = value;
                } else {
                    newFieldValues.push(value);
                }
                return { ...item, fieldValues: newFieldValues };
            }),
            isFieldUpdating: false,
        }));
    },

    removeItem: (itemId) => {
        set((state) => ({
            items: state.items.filter((i) => i.id !== itemId),
            selectedItemId: state.selectedItemId === itemId ? null : state.selectedItemId,
        }));
    },

    addItem: (item) => {
        set((state) => ({
            items: [item, ...state.items],
        }));
    },

    filteredItems: () => {
        const { items, statusFilter, searchQuery } = get();

        let filtered = items.filter((i) => !i.isArchived);

        // Status filter
        if (statusFilter !== 'all') {
            filtered = filtered.filter((item) => {
                const statusFv = item.fieldValues.find(
                    (fv) => fv.fieldName === 'Status' && fv.fieldType === 'SINGLE_SELECT',
                );
                return statusFv?.singleSelectOptionName === statusFilter;
            });
        }

        // Search filter
        const q = searchQuery.trim().toLowerCase();
        if (q) {
            filtered = filtered.filter((item) => {
                const title = item.content?.title?.toLowerCase() ?? '';
                const number = item.content?.number ? `#${item.content.number}` : '';
                const labels = item.content?.labels?.map((l) => l.name.toLowerCase()).join(' ') ?? '';
                return title.includes(q) || number.includes(q) || labels.includes(q);
            });
        }

        return filtered;
    },

    selectedItem: () => {
        const { items, selectedItemId } = get();
        if (!selectedItemId) {
            return undefined;
        }
        return items.find((i) => i.id === selectedItemId);
    },

    statusOptions: () => {
        const { fields } = get();
        const statusField = fields.find(
            (f) => f.name === 'Status' && f.dataType === 'SINGLE_SELECT',
        );
        return statusField?.options ?? [];
    },

    activeView: () => {
        const { selectedProject, selectedViewId } = get();
        if (!selectedProject?.views?.length) {
            return undefined;
        }
        if (selectedViewId) {
            const found = selectedProject.views.find((v) => v.id === selectedViewId);
            if (found) {
                return found;
            }
        }
        return selectedProject.views[0];
    },

    boardColumns: () => {
        const { fields, selectedProject, selectedViewId } = get();
        const filteredItems = get().filteredItems();

        // Determine the groupBy field
        let groupByFieldId: string | undefined;
        if (selectedProject?.views) {
            const view = selectedViewId
                ? selectedProject.views.find((v) => v.id === selectedViewId)
                : selectedProject.views.find((v) => v.layout === 'BOARD');
            groupByFieldId = view?.groupByFieldIds?.[0];
        }

        // Find the field definition
        let groupField = groupByFieldId ? fields.find((f) => f.id === groupByFieldId) : undefined;

        // Default to Status field if no groupBy is configured
        if (!groupField) {
            groupField = fields.find(
                (f) => f.name === 'Status' && f.dataType === 'SINGLE_SELECT',
            );
        }

        if (!groupField?.options) {
            // Can't group — return a single column with all items
            return [{ id: '__all__', name: 'All Items', items: filteredItems }];
        }

        const columns: BoardColumn[] = [];
        const assignedItemIds = new Set<string>();

        for (const opt of groupField.options) {
            const colItems = filteredItems.filter((item) => {
                const fv = item.fieldValues.find((v) => v.fieldId === groupField!.id);
                return fv?.singleSelectOptionId === opt.id;
            });
            colItems.forEach((i) => assignedItemIds.add(i.id));
            columns.push({
                id: opt.id,
                name: opt.name,
                color: opt.color,
                items: colItems,
            });
        }

        // Add "No status" column for items without a value
        const unassigned = filteredItems.filter((i) => !assignedItemIds.has(i.id));
        if (unassigned.length > 0) {
            columns.unshift({
                id: '__none__',
                name: 'No ' + groupField.name,
                items: unassigned,
            });
        }

        return columns;
    },
}));
