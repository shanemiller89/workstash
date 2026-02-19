import type * as vscode from 'vscode';
import { type AuthService } from './authService';

// ─── Data Models ──────────────────────────────────────────────────

export type ProjectItemType = 'ISSUE' | 'PULL_REQUEST' | 'DRAFT_ISSUE' | 'REDACTED';

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

export type ProjectFieldType =
    | 'TEXT'
    | 'NUMBER'
    | 'DATE'
    | 'SINGLE_SELECT'
    | 'ITERATION'
    | 'ASSIGNEES'
    | 'LABELS'
    | 'MILESTONE'
    | 'REPOSITORY'
    | 'LINKED_PULL_REQUESTS'
    | 'REVIEWERS'
    | 'TRACKS'
    | 'TRACKED_BY';

export interface ProjectField {
    id: string;
    name: string;
    dataType: ProjectFieldType;
    options?: ProjectFieldOption[];
    iterations?: ProjectIteration[];
}

export interface ProjectFieldValue {
    fieldId: string;
    fieldName: string;
    fieldType: ProjectFieldType;
    /** For TEXT fields */
    text?: string;
    /** For NUMBER fields */
    number?: number;
    /** For DATE fields */
    date?: string;
    /** For SINGLE_SELECT fields */
    singleSelectOptionId?: string;
    singleSelectOptionName?: string;
    /** For ITERATION fields */
    iterationId?: string;
    iterationTitle?: string;
    iterationStartDate?: string;
    /** For LABELS (read-only) */
    labels?: { name: string; color: string }[];
    /** For ASSIGNEES (read-only) */
    users?: { login: string; avatarUrl: string }[];
    /** For MILESTONE (read-only) */
    milestoneTitle?: string;
}

export interface ProjectItem {
    id: string;
    type: ProjectItemType;
    isArchived: boolean;
    createdAt: string;
    updatedAt: string;
    fieldValues: ProjectFieldValue[];
    /** Content details — populated for Issues and PRs */
    content?: {
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
    };
}

export interface ProjectView {
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

export interface Project {
    id: string;
    number: number;
    title: string;
    shortDescription: string | null;
    url: string;
    closed: boolean;
    public: boolean;
    fields: ProjectField[];
    views: ProjectView[];
    /** total item count (may differ from loaded items) */
    totalItemCount: number;
}

// ─── Webview Data Shapes (serializable) ───────────────────────────

export interface ProjectData {
    id: string;
    number: number;
    title: string;
    shortDescription: string | null;
    url: string;
    closed: boolean;
    public: boolean;
    fields: ProjectField[];
    views: ProjectView[];
    totalItemCount: number;
}

export interface ProjectItemData {
    id: string;
    type: ProjectItemType;
    isArchived: boolean;
    createdAt: string;
    updatedAt: string;
    fieldValues: ProjectFieldValue[];
    content?: ProjectItem['content'];
}

// ─── Injectable fetch ─────────────────────────────────────────────

export type FetchFn = typeof globalThis.fetch;

// ─── Raw GraphQL Response Shapes ──────────────────────────────────

/** Shape returned by the ProjectV2 field nodes in GraphQL. */
interface RawFieldNode {
    id: string;
    name: string;
    dataType: string;
    options?: { id: string; name: string; color?: string; description?: string }[];
    configuration?: {
        iterations: {
            id: string;
            title: string;
            startDate: string;
            duration: number;
        }[];
    };
}

/** Shape returned by the ProjectV2 view nodes in GraphQL. */
interface RawViewNode {
    id: string;
    number: number;
    name: string;
    layout: string;
    filter: string | null;
    groupByFields?: { nodes: { id: string }[] };
    verticalGroupByFields?: { nodes: { id: string }[] };
}

/** Top-level shape of a ProjectV2 GraphQL response. */
interface RawProjectGQL {
    id: string;
    number: number;
    title: string;
    shortDescription: string | null;
    url: string;
    closed: boolean;
    public: boolean;
    items: { totalCount: number };
    fields: { nodes: (RawFieldNode | null)[] };
    views: { nodes: RawViewNode[] };
}

/** Shape of a single user/assignee node returned by GraphQL. */
interface RawUserNode {
    login: string;
    avatarUrl: string;
}

/** Shape of a single label node returned by GraphQL. */
interface RawLabelNode {
    name: string;
    color: string;
}

/** Shape of a single field value node (union of all field value types). */
interface RawFieldValueNode {
    field?: { id: string; name: string };
    text?: string;
    number?: number;
    date?: string;
    name?: string;
    optionId?: string;
    title?: string;
    iterationId?: string;
    startDate?: string;
    labels?: { nodes: RawLabelNode[] };
    users?: { nodes: RawUserNode[] };
    milestone?: { title: string };
}

/** Shape of a single item node from the ProjectV2 items query. */
interface RawProjectItemNode {
    id: string;
    type: string;
    isArchived?: boolean;
    createdAt: string;
    updatedAt: string;
    fieldValues?: { nodes: (RawFieldValueNode | null)[] };
    content?: {
        id?: string;
        number?: number;
        title?: string;
        state?: string;
        url?: string;
        body?: string;
        author?: { login: string; avatarUrl: string };
        labels?: { nodes: RawLabelNode[] };
        assignees?: { nodes: RawUserNode[] };
    };
}

/** Response shape from the listProjectItems query. */
interface RawProjectItemsResponse {
    node: {
        items: {
            pageInfo: { hasNextPage: boolean; endCursor: string | null };
            nodes: RawProjectItemNode[];
        };
    };
}

// ─── ProjectService ───────────────────────────────────────────────

/**
 * GraphQL-only service for GitHub Projects V2 operations.
 * Modeled on PrService._graphql() pattern.
 */
export class ProjectService {
    private readonly _authService: AuthService;
    private readonly _outputChannel: vscode.OutputChannel;
    private readonly _fetchFn: FetchFn;

    constructor(authService: AuthService, outputChannel: vscode.OutputChannel, fetchFn?: FetchFn) {
        this._authService = authService;
        this._outputChannel = outputChannel;
        this._fetchFn = fetchFn ?? globalThis.fetch.bind(globalThis);
    }

    // ─── Private Helpers ──────────────────────────────────────────

    private async _getToken(): Promise<string> {
        const token = await this._authService.getToken();
        if (!token) {
            throw new Error('Not authenticated. Please sign in to GitHub first.');
        }
        return token;
    }

    private async _graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
        const token = await this._getToken();

        this._outputChannel.appendLine(
            `[Projects-GQL] query (${query.slice(0, 60).replace(/\n/g, ' ')}…)`,
        );

        const response = await this._fetchFn('https://api.github.com/graphql', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query, variables }),
        });

        if (!response.ok) {
            const detail = await this._extractErrorDetail(response);
            throw new Error(`GitHub API error (${response.status}): ${detail}`);
        }

        const json = (await response.json()) as { data?: T; errors?: { message: string }[] };
        if (json.errors?.length) {
            const msg = json.errors.map((e) => e.message).join('; ');
            this._outputChannel.appendLine(`[Projects-GQL] Error: ${msg}`);
            throw new Error(`GraphQL error: ${msg}`);
        }

        return json.data as T;
    }

    private async _extractErrorDetail(response: Response): Promise<string> {
        try {
            const body = (await response.json()) as { message?: string };
            return body.message ?? response.statusText;
        } catch {
            return response.statusText;
        }
    }

    // ─── Project Discovery ────────────────────────────────────────

    /**
     * List projects linked to a repository.
     * Returns open projects by default.
     */
    async listRepositoryProjects(
        owner: string,
        repo: string,
        first = 20,
    ): Promise<{ id: string; number: number; title: string; closed: boolean; url: string; ownerType: 'repo' | 'org' }[]> {
        const query = `
            query($owner: String!, $repo: String!, $first: Int!) {
                repository(owner: $owner, name: $repo) {
                    projectsV2(first: $first, orderBy: { field: UPDATED_AT, direction: DESC }) {
                        nodes {
                            id
                            number
                            title
                            closed
                            url
                        }
                    }
                }
            }
        `;

        interface Result {
            repository: {
                projectsV2: {
                    nodes: { id: string; number: number; title: string; closed: boolean; url: string }[];
                };
            };
        }

        const data = await this._graphql<Result>(query, { owner, repo, first });
        return data.repository.projectsV2.nodes.map((n) => ({ ...n, ownerType: 'repo' as const }));
    }

    /**
     * List projects owned directly by an organization (org-level boards).
     * These are not necessarily linked to any specific repository.
     */
    async listOrgProjects(
        org: string,
        first = 20,
    ): Promise<{ id: string; number: number; title: string; closed: boolean; url: string; ownerType: 'repo' | 'org' }[]> {
        const query = `
            query($org: String!, $first: Int!) {
                organization(login: $org) {
                    projectsV2(first: $first, orderBy: { field: UPDATED_AT, direction: DESC }) {
                        nodes {
                            id
                            number
                            title
                            closed
                            url
                        }
                    }
                }
            }
        `;

        interface Result {
            organization: {
                projectsV2: {
                    nodes: { id: string; number: number; title: string; closed: boolean; url: string }[];
                };
            };
        }

        const data = await this._graphql<Result>(query, { org, first });
        return data.organization.projectsV2.nodes.map((n) => ({ ...n, ownerType: 'org' as const }));
    }

    /**
     * List all GitHub organizations the authenticated user belongs to.
     */
    async listUserOrgs(): Promise<{ login: string; avatarUrl: string; name: string | null }[]> {
        const query = `
            query {
                viewer {
                    organizations(first: 100) {
                        nodes {
                            login
                            name
                            avatarUrl
                        }
                    }
                }
            }
        `;
        interface Result {
            viewer: {
                organizations: {
                    nodes: { login: string; name: string | null; avatarUrl: string }[];
                };
            };
        }
        const data = await this._graphql<Result>(query);
        return data.viewer.organizations.nodes;
    }

    /**
     * Get a project by owner + number (for org or user projects).
     * Includes full field definitions.
     */
    async getProject(owner: string, projectNumber: number): Promise<Project> {
        // We try repo-scoped first via the caller's resolved owner/repo
        // But the primary use case is org/user scoped
        const query = `
            query($owner: String!, $number: Int!) {
                user(login: $owner) {
                    projectV2(number: $number) {
                        ...ProjectFragment
                    }
                }
            }

            fragment ProjectFragment on ProjectV2 {
                id
                number
                title
                shortDescription
                url
                closed
                public
                items {
                    totalCount
                }
                fields(first: 50) {
                    nodes {
                        ... on ProjectV2Field {
                            id
                            name
                            dataType
                        }
                        ... on ProjectV2SingleSelectField {
                            id
                            name
                            dataType
                            options {
                                id
                                name
                                color
                                description
                            }
                        }
                        ... on ProjectV2IterationField {
                            id
                            name
                            dataType
                            configuration {
                                iterations {
                                    id
                                    title
                                    startDate
                                    duration
                                }
                            }
                        }
                    }
                }
                views(first: 20) {
                    nodes {
                        id
                        number
                        name
                        layout
                        filter
                        groupByFields(first: 5) {
                            nodes {
                                ... on ProjectV2Field { id }
                                ... on ProjectV2SingleSelectField { id }
                                ... on ProjectV2IterationField { id }
                            }
                        }
                        verticalGroupByFields(first: 5) {
                            nodes {
                                ... on ProjectV2Field { id }
                                ... on ProjectV2SingleSelectField { id }
                                ... on ProjectV2IterationField { id }
                            }
                        }
                    }
                }
            }
        `;

        // Try user first, then organization
        try {
            const data = await this._graphql<{ user: { projectV2: RawProjectGQL } }>(query, {
                owner,
                number: projectNumber,
            });
            return this._parseProject(data.user.projectV2);
        } catch {
            // Fall back to organization query
            const orgQueryFinal = `
                query($owner: String!, $number: Int!) {
                    organization(login: $owner) {
                        projectV2(number: $number) {
                            ...ProjectFragment
                        }
                    }

                    fragment ProjectFragment on ProjectV2 {
                        id
                        number
                        title
                        shortDescription
                        url
                        closed
                        public
                        items {
                            totalCount
                        }
                        fields(first: 50) {
                            nodes {
                                ... on ProjectV2Field {
                                    id
                                    name
                                    dataType
                                }
                                ... on ProjectV2SingleSelectField {
                                    id
                                    name
                                    dataType
                                    options {
                                        id
                                        name
                                        color
                                        description
                                    }
                                }
                                ... on ProjectV2IterationField {
                                    id
                                    name
                                    dataType
                                    configuration {
                                        iterations {
                                            id
                                            title
                                            startDate
                                            duration
                                        }
                                    }
                                }
                            }
                        }
                        views(first: 20) {
                            nodes {
                                id
                                number
                                name
                                layout
                                filter
                                groupByFields(first: 5) {
                                    nodes {
                                        ... on ProjectV2Field { id }
                                        ... on ProjectV2SingleSelectField { id }
                                        ... on ProjectV2IterationField { id }
                                    }
                                }
                                verticalGroupByFields(first: 5) {
                                    nodes {
                                        ... on ProjectV2Field { id }
                                        ... on ProjectV2SingleSelectField { id }
                                        ... on ProjectV2IterationField { id }
                                    }
                                }
                            }
                        }
                    }
                `;
            const data = await this._graphql<{ organization: { projectV2: RawProjectGQL } }>(
                orgQueryFinal,
                { owner, number: projectNumber },
            );
            return this._parseProject(data.organization.projectV2);
        }
    }

    /**
     * Get project by its node ID (useful when we already have the ID from repository discovery).
     */
    async getProjectById(projectNodeId: string): Promise<Project> {
        const query = `
            query($id: ID!) {
                node(id: $id) {
                    ... on ProjectV2 {
                        id
                        number
                        title
                        shortDescription
                        url
                        closed
                        public
                        items {
                            totalCount
                        }
                        fields(first: 50) {
                            nodes {
                                ... on ProjectV2Field {
                                    id
                                    name
                                    dataType
                                }
                                ... on ProjectV2SingleSelectField {
                                    id
                                    name
                                    dataType
                                    options {
                                        id
                                        name
                                        color
                                        description
                                    }
                                }
                                ... on ProjectV2IterationField {
                                    id
                                    name
                                    dataType
                                    configuration {
                                        iterations {
                                            id
                                            title
                                            startDate
                                            duration
                                        }
                                    }
                                }
                            }
                        }
                        views(first: 20) {
                            nodes {
                                id
                                number
                                name
                                layout
                                filter
                                groupByFields(first: 5) {
                                    nodes {
                                        ... on ProjectV2Field { id }
                                        ... on ProjectV2SingleSelectField { id }
                                        ... on ProjectV2IterationField { id }
                                    }
                                }
                                verticalGroupByFields(first: 5) {
                                    nodes {
                                        ... on ProjectV2Field { id }
                                        ... on ProjectV2SingleSelectField { id }
                                        ... on ProjectV2IterationField { id }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        `;

        const data = await this._graphql<{ node: RawProjectGQL }>(query, { id: projectNodeId });
        return this._parseProject(data.node);
    }

    // ─── Items ────────────────────────────────────────────────────

    /**
     * List items in a project with field values.
     */
    async listProjectItems(
        projectNodeId: string,
        first = 50,
        after?: string,
    ): Promise<{ items: ProjectItem[]; hasNextPage: boolean; endCursor: string | null }> {
        const query = `
            query($id: ID!, $first: Int!, $after: String) {
                node(id: $id) {
                    ... on ProjectV2 {
                        items(first: $first, after: $after) {
                            pageInfo {
                                hasNextPage
                                endCursor
                            }
                            nodes {
                                id
                                type
                                isArchived
                                createdAt
                                updatedAt
                                fieldValues(first: 20) {
                                    nodes {
                                        ... on ProjectV2ItemFieldTextValue {
                                            text
                                            field { ... on ProjectV2FieldCommon { id name } }
                                        }
                                        ... on ProjectV2ItemFieldNumberValue {
                                            number
                                            field { ... on ProjectV2FieldCommon { id name } }
                                        }
                                        ... on ProjectV2ItemFieldDateValue {
                                            date
                                            field { ... on ProjectV2FieldCommon { id name } }
                                        }
                                        ... on ProjectV2ItemFieldSingleSelectValue {
                                            name
                                            optionId
                                            field { ... on ProjectV2FieldCommon { id name } }
                                        }
                                        ... on ProjectV2ItemFieldIterationValue {
                                            title
                                            iterationId
                                            startDate
                                            field { ... on ProjectV2FieldCommon { id name } }
                                        }
                                        ... on ProjectV2ItemFieldLabelValue {
                                            labels(first: 10) {
                                                nodes { name color }
                                            }
                                            field { ... on ProjectV2FieldCommon { id name } }
                                        }
                                        ... on ProjectV2ItemFieldUserValue {
                                            users(first: 10) {
                                                nodes { login avatarUrl }
                                            }
                                            field { ... on ProjectV2FieldCommon { id name } }
                                        }
                                        ... on ProjectV2ItemFieldMilestoneValue {
                                            milestone { title }
                                            field { ... on ProjectV2FieldCommon { id name } }
                                        }
                                    }
                                }
                                content {
                                    ... on DraftIssue {
                                        title
                                        body
                                    }
                                    ... on Issue {
                                        id
                                        number
                                        title
                                        state
                                        url
                                        body
                                        author { login avatarUrl }
                                        labels(first: 10) {
                                            nodes { name color }
                                        }
                                        assignees(first: 10) {
                                            nodes { login avatarUrl }
                                        }
                                    }
                                    ... on PullRequest {
                                        id
                                        number
                                        title
                                        state
                                        url
                                        body
                                        author { login avatarUrl }
                                        labels(first: 10) {
                                            nodes { name color }
                                        }
                                        assignees(first: 10) {
                                            nodes { login avatarUrl }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        `;

        const data = await this._graphql<RawProjectItemsResponse>(query, {
            id: projectNodeId,
            first,
            after: after ?? null,
        });

        const itemsNode = data.node.items;
        const items = itemsNode.nodes.map((n) => this._parseProjectItem(n));

        return {
            items,
            hasNextPage: itemsNode.pageInfo.hasNextPage as boolean,
            endCursor: itemsNode.pageInfo.endCursor as string | null,
        };
    }

    // ─── Mutations ────────────────────────────────────────────────

    /**
     * Add an existing issue or PR to a project.
     */
    async addItemToProject(projectId: string, contentId: string): Promise<string> {
        const query = `
            mutation($projectId: ID!, $contentId: ID!) {
                addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
                    item { id }
                }
            }
        `;

        const data = await this._graphql<{
            addProjectV2ItemById: { item: { id: string } };
        }>(query, { projectId, contentId });

        return data.addProjectV2ItemById.item.id;
    }

    /**
     * Add a draft issue to a project.
     */
    async addDraftIssue(
        projectId: string,
        title: string,
        body?: string,
    ): Promise<string> {
        const query = `
            mutation($projectId: ID!, $title: String!, $body: String) {
                addProjectV2DraftIssue(input: { projectId: $projectId, title: $title, body: $body }) {
                    projectItem { id }
                }
            }
        `;

        const data = await this._graphql<{
            addProjectV2DraftIssue: { projectItem: { id: string } };
        }>(query, { projectId, title, body: body ?? null });

        return data.addProjectV2DraftIssue.projectItem.id;
    }

    /**
     * Update a text, number, or date field value.
     */
    async updateFieldValue(
        projectId: string,
        itemId: string,
        fieldId: string,
        value: { text?: string; number?: number; date?: string; singleSelectOptionId?: string; iterationId?: string },
    ): Promise<void> {
        const query = `
            mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: ProjectV2FieldValue!) {
                updateProjectV2ItemFieldValue(
                    input: { projectId: $projectId, itemId: $itemId, fieldId: $fieldId, value: $value }
                ) {
                    projectV2Item { id }
                }
            }
        `;

        await this._graphql<unknown>(query, {
            projectId,
            itemId,
            fieldId,
            value,
        });
    }

    /**
     * Delete an item from a project.
     */
    async deleteItem(projectId: string, itemId: string): Promise<void> {
        const query = `
            mutation($projectId: ID!, $itemId: ID!) {
                deleteProjectV2Item(input: { projectId: $projectId, itemId: $itemId }) {
                    deletedItemId
                }
            }
        `;

        await this._graphql<unknown>(query, { projectId, itemId });
    }

    // ─── Static Converters ────────────────────────────────────────

    static toData(project: Project): ProjectData {
        return {
            id: project.id,
            number: project.number,
            title: project.title,
            shortDescription: project.shortDescription,
            url: project.url,
            closed: project.closed,
            public: project.public,
            fields: project.fields,
            views: project.views,
            totalItemCount: project.totalItemCount,
        };
    }

    static toItemData(item: ProjectItem): ProjectItemData {
        return {
            id: item.id,
            type: item.type,
            isArchived: item.isArchived,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            fieldValues: item.fieldValues,
            content: item.content,
        };
    }

    // ─── Private Parsers ──────────────────────────────────────────

    private _parseProject(raw: RawProjectGQL): Project {
        const fields: ProjectField[] = (raw.fields?.nodes ?? [])
            .filter((f): f is RawFieldNode => f !== null)
            .map((f) => {
                const field: ProjectField = {
                    id: f.id,
                    name: f.name,
                    dataType: f.dataType as ProjectFieldType,
                };
                if (f.options) {
                    field.options = f.options;
                }
                if (f.configuration?.iterations) {
                    field.iterations = f.configuration.iterations;
                }
                return field;
            });

        const views: ProjectView[] = (raw.views?.nodes ?? []).map(
            (v) => {
                const view: ProjectView = {
                    id: v.id,
                    number: v.number,
                    name: v.name,
                    layout: v.layout as ProjectView['layout'],
                    filter: v.filter ?? undefined,
                };
                const gbIds = (v.groupByFields?.nodes ?? []).map((n) => n.id).filter(Boolean);
                if (gbIds.length > 0) {
                    view.groupByFieldIds = gbIds;
                }
                const vgbIds = (v.verticalGroupByFields?.nodes ?? []).map((n) => n.id).filter(Boolean);
                if (vgbIds.length > 0) {
                    view.verticalGroupByFieldIds = vgbIds;
                }
                return view;
            },
        );

        return {
            id: raw.id,
            number: raw.number,
            title: raw.title,
            shortDescription: raw.shortDescription ?? null,
            url: raw.url,
            closed: raw.closed,
            public: raw.public,
            fields,
            views,
            totalItemCount: raw.items?.totalCount ?? 0,
        };
    }

    private _parseProjectItem(raw: RawProjectItemNode): ProjectItem {
        const fieldValues: ProjectFieldValue[] = [];

        for (const fv of raw.fieldValues?.nodes ?? []) {
            if (!fv || !fv.field) {
                continue;
            }
            const base: ProjectFieldValue = {
                fieldId: fv.field.id,
                fieldName: fv.field.name,
                fieldType: 'TEXT', // will be overridden
            };

            if (fv.text !== undefined) {
                base.fieldType = 'TEXT';
                base.text = fv.text;
            } else if (fv.number !== undefined) {
                base.fieldType = 'NUMBER';
                base.number = fv.number;
            } else if (fv.date !== undefined) {
                base.fieldType = 'DATE';
                base.date = fv.date;
            } else if (fv.optionId !== undefined) {
                base.fieldType = 'SINGLE_SELECT';
                base.singleSelectOptionId = fv.optionId;
                base.singleSelectOptionName = fv.name;
            } else if (fv.iterationId !== undefined) {
                base.fieldType = 'ITERATION';
                base.iterationId = fv.iterationId;
                base.iterationTitle = fv.title;
                base.iterationStartDate = fv.startDate;
            } else if (fv.labels) {
                base.fieldType = 'LABELS';
                base.labels = (fv.labels.nodes ?? []).map(
                    (l) => ({ name: l.name, color: l.color }),
                );
            } else if (fv.users) {
                base.fieldType = 'ASSIGNEES';
                base.users = (fv.users.nodes ?? []).map(
                    (u) => ({ login: u.login, avatarUrl: u.avatarUrl }),
                );
            } else if (fv.milestone) {
                base.fieldType = 'MILESTONE';
                base.milestoneTitle = fv.milestone.title;
            } else {
                // Unknown field type — skip
                continue;
            }

            fieldValues.push(base);
        }

        let content: ProjectItem['content'];
        const c = raw.content;
        if (c) {
            if (c.number !== undefined && c.state !== undefined) {
                // Issue or PR
                const type = raw.type === 'PULL_REQUEST' ? 'PullRequest' : 'Issue';
                content = {
                    type: type as 'Issue' | 'PullRequest',
                    nodeId: c.id ?? '',
                    number: c.number,
                    title: c.title ?? '',
                    state: c.state,
                    url: c.url,
                    body: c.body ?? undefined,
                    author: c.author?.login,
                    authorAvatarUrl: c.author?.avatarUrl,
                    labels: (c.labels?.nodes ?? []).map(
                        (l) => ({ name: l.name, color: l.color }),
                    ),
                    assignees: (c.assignees?.nodes ?? []).map(
                        (a) => ({ login: a.login, avatarUrl: a.avatarUrl }),
                    ),
                };
            } else if (c.title !== undefined) {
                // Draft issue
                content = {
                    type: 'DraftIssue',
                    nodeId: '', // drafts don't have a stable node ID in the content query
                    title: c.title,
                    body: c.body ?? undefined,
                };
            }
        }

        return {
            id: raw.id,
            type: raw.type as ProjectItemType,
            isArchived: raw.isArchived ?? false,
            createdAt: raw.createdAt,
            updatedAt: raw.updatedAt,
            fieldValues,
            content,
        };
    }
}
