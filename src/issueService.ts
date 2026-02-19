import type * as vscode from 'vscode';
import { type AuthService } from './authService';

// ─── Data Models ──────────────────────────────────────────────────

export type IssueState = 'open' | 'closed';

export interface Issue {
    number: number;
    title: string;
    state: IssueState;
    htmlUrl: string;
    body: string;
    author: string;
    authorAvatarUrl: string;
    createdAt: Date;
    updatedAt: Date;
    closedAt: Date | null;
    commentsCount: number;
    labels: { name: string; color: string }[];
    assignees: { login: string; avatarUrl: string }[];
    milestone: { title: string; number: number } | null;
    isPullRequest: boolean;
    /** Repository slug (owner/repo) — populated for org-scoped queries */
    repoFullName?: string;
}

export interface IssueComment {
    id: number;
    body: string;
    author: string;
    authorAvatarUrl: string;
    createdAt: Date;
    updatedAt: Date;
    htmlUrl: string;
}

/** Lightweight version sent to webview (dates as ISO strings) */
export interface IssueData {
    number: number;
    title: string;
    state: IssueState;
    htmlUrl: string;
    body: string;
    author: string;
    authorAvatarUrl: string;
    createdAt: string;
    updatedAt: string;
    closedAt: string | null;
    commentsCount: number;
    labels: { name: string; color: string }[];
    assignees: { login: string; avatarUrl: string }[];
    milestone: { title: string; number: number } | null;
    /** Repository slug (owner/repo) — present when loaded in org-wide mode */
    repoFullName?: string;
}

export interface IssueCommentData {
    id: number;
    body: string;
    author: string;
    authorAvatarUrl: string;
    createdAt: string;
    updatedAt: string;
    htmlUrl: string;
}

// ─── GitHub API Response Types ────────────────────────────────────

interface GitHubIssue {
    number: number;
    title: string;
    state: 'open' | 'closed';
    html_url: string;
    body: string | null;
    user: { login: string; avatar_url: string } | null;
    created_at: string;
    updated_at: string;
    closed_at: string | null;
    comments: number;
    labels: { name: string; color: string }[];
    assignees: { login: string; avatar_url: string }[];
    milestone: { title: string; number: number } | null;
    pull_request?: unknown;
}

interface GitHubComment {
    id: number;
    body: string;
    html_url: string;
    user: { login: string; avatar_url: string } | null;
    created_at: string;
    updated_at: string;
}

/** Shape returned by the GitHub Search API for issues */
interface GitHubSearchIssue extends GitHubIssue {
    repository_url: string;
}

// ─── Constants ────────────────────────────────────────────────────

const API_BASE = 'https://api.github.com';
const PER_PAGE = 30;

// ─── Types ────────────────────────────────────────────────────────

/** Injectable fetch function signature for testability */
export type FetchFn = typeof globalThis.fetch;

// ─── IssueService ─────────────────────────────────────────────────

/**
 * REST API wrapper for GitHub Issue operations.
 * Follows the same pattern as PrService.
 */
export class IssueService {
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

    private async _request<T>(
        method: string,
        path: string,
        body?: unknown,
    ): Promise<{ data: T; headers: Headers }> {
        const token = await this._getToken();
        const url = path.startsWith('http') ? path : `${API_BASE}${path}`;

        this._outputChannel.appendLine(`[Issues] ${method} ${path}`);

        const headers: Record<string, string> = {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
        };
        if (body) {
            headers['Content-Type'] = 'application/json';
        }

        const response = await this._fetchFn(url, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
        });

        this._checkRateLimit(response.headers);
        this._outputChannel.appendLine(`[Issues] ${method} ${path} → ${response.status}`);

        if (!response.ok) {
            await this._handleHttpError(response);
        }

        if (response.status === 204) {
            return { data: undefined as T, headers: response.headers };
        }

        const data = (await response.json()) as T;
        return { data, headers: response.headers };
    }

    private _checkRateLimit(headers: Headers): void {
        const remaining = headers.get('X-RateLimit-Remaining');
        if (remaining !== null) {
            const count = parseInt(remaining, 10);
            if (count <= 10 && count > 0) {
                this._outputChannel.appendLine(
                    `[Issues] ⚠ Rate limit low: ${count} requests remaining`,
                );
            } else if (count === 0) {
                const resetHeader = headers.get('X-RateLimit-Reset');
                const resetTime = resetHeader
                    ? new Date(parseInt(resetHeader, 10) * 1000).toLocaleTimeString()
                    : 'soon';
                this._outputChannel.appendLine(
                    `[Issues] ⚠ Rate limit exhausted, resets at ${resetTime}`,
                );
            }
        }
    }

    private async _handleHttpError(response: Response): Promise<never> {
        let detail = '';
        try {
            const body = (await response.json()) as { message?: string };
            detail = body.message ?? '';
        } catch {
            /* ignore parse failure */
        }

        switch (response.status) {
            case 401:
                throw new Error('GitHub session expired. Please sign in again.');
            case 403:
                throw new Error(
                    detail.includes('rate limit')
                        ? 'GitHub API rate limit exceeded. Try again later.'
                        : `Access denied: ${detail}`,
                );
            case 404:
                throw new Error(`Not found: ${detail || 'resource does not exist'}`);
            default:
                throw new Error(`GitHub API error ${response.status}: ${detail}`);
        }
    }

    // ─── Parsing ──────────────────────────────────────────────────

    private _parseIssue(issue: GitHubIssue, repoFullName?: string): Issue {
        return {
            number: issue.number,
            title: issue.title,
            state: issue.state,
            htmlUrl: issue.html_url,
            body: issue.body ?? '',
            author: issue.user?.login ?? 'unknown',
            authorAvatarUrl: issue.user?.avatar_url ?? '',
            createdAt: new Date(issue.created_at),
            updatedAt: new Date(issue.updated_at),
            closedAt: issue.closed_at ? new Date(issue.closed_at) : null,
            commentsCount: issue.comments ?? 0,
            labels: issue.labels.map((l) => ({ name: l.name, color: l.color })),
            assignees: (issue.assignees ?? []).map((a) => ({
                login: a.login,
                avatarUrl: a.avatar_url,
            })),
            milestone: issue.milestone
                ? { title: issue.milestone.title, number: issue.milestone.number }
                : null,
            isPullRequest: !!issue.pull_request,
            repoFullName,
        };
    }

    private _parseComment(comment: GitHubComment): IssueComment {
        return {
            id: comment.id,
            body: comment.body,
            author: comment.user?.login ?? 'unknown',
            authorAvatarUrl: comment.user?.avatar_url ?? '',
            createdAt: new Date(comment.created_at),
            updatedAt: new Date(comment.updated_at),
            htmlUrl: comment.html_url,
        };
    }

    // ─── Public API ───────────────────────────────────────────────

    /**
     * List issues for a repository (excludes pull requests).
     */
    async listIssues(
        owner: string,
        repo: string,
        state: IssueState | 'all' = 'open',
        assignee?: string,
    ): Promise<Issue[]> {
        let url = `/repos/${owner}/${repo}/issues?state=${state}&sort=updated&direction=desc&per_page=${PER_PAGE}`;
        if (assignee) {
            url += `&assignee=${encodeURIComponent(assignee)}`;
        }

        const { data } = await this._request<GitHubIssue[]>('GET', url);

        // GitHub's issues endpoint includes PRs — filter them out
        return data
            .filter((issue) => !issue.pull_request)
            .map((issue) => this._parseIssue(issue));
    }

    /**
     * List issues across all repositories in a GitHub organization.
     * Uses the GitHub Search API (GET /search/issues) so each returned Issue
     * has `repoFullName` populated (e.g. "myorg/myrepo").
     *
     * @param org         GitHub org login.
     * @param state       Issue state filter ('open' | 'closed' | 'all').
     * @param repoFilter  Optional repo name (without owner) to narrow results.
     */
    async listOrgIssues(
        org: string,
        state: IssueState | 'all' = 'open',
        repoFilter?: string,
    ): Promise<Issue[]> {
        const stateQ = state === 'all' ? '' : `+is:${state}`;
        const repoQ = repoFilter ? `+repo:${org}/${repoFilter}` : `+org:${org}`;
        const url = `/search/issues?q=is:issue${stateQ}${repoQ}&sort=updated&order=desc&per_page=50`;
        const { data } = await this._request<{ items: GitHubSearchIssue[] }>('GET', url);
        return data.items
            .filter((issue) => !issue.pull_request)
            .map((issue) => {
                // repository_url = "https://api.github.com/repos/{owner}/{repo}"
                const repoFullName = issue.repository_url.replace(
                    'https://api.github.com/repos/',
                    '',
                );
                return this._parseIssue(issue, repoFullName);
            });
    }

    /**
     * Get a single issue with full detail.
     */
    async getIssue(owner: string, repo: string, issueNumber: number): Promise<Issue> {
        const { data } = await this._request<GitHubIssue>(
            'GET',
            `/repos/${owner}/${repo}/issues/${issueNumber}`,
        );
        return this._parseIssue(data);
    }

    /**
     * Get comments on an issue.
     */
    async getComments(
        owner: string,
        repo: string,
        issueNumber: number,
    ): Promise<IssueComment[]> {
        const { data } = await this._request<GitHubComment[]>(
            'GET',
            `/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100&sort=created&direction=asc`,
        );
        return data.map((c) => this._parseComment(c));
    }

    /**
     * Post a comment on an issue.
     */
    async createComment(
        owner: string,
        repo: string,
        issueNumber: number,
        body: string,
    ): Promise<IssueComment> {
        const { data } = await this._request<GitHubComment>(
            'POST',
            `/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
            { body },
        );
        return this._parseComment(data);
    }

    /**
     * Close an issue.
     */
    async closeIssue(
        owner: string,
        repo: string,
        issueNumber: number,
        stateReason: 'completed' | 'not_planned' = 'completed',
    ): Promise<Issue> {
        const { data } = await this._request<GitHubIssue>(
            'PATCH',
            `/repos/${owner}/${repo}/issues/${issueNumber}`,
            { state: 'closed', state_reason: stateReason },
        );
        return this._parseIssue(data);
    }

    /**
     * Reopen a closed issue.
     */
    async reopenIssue(
        owner: string,
        repo: string,
        issueNumber: number,
    ): Promise<Issue> {
        const { data } = await this._request<GitHubIssue>(
            'PATCH',
            `/repos/${owner}/${repo}/issues/${issueNumber}`,
            { state: 'open' },
        );
        return this._parseIssue(data);
    }

    /**
     * Get the authenticated user's GitHub login name.
     */
    async getAuthenticatedUser(): Promise<string> {
        const { data } = await this._request<{ login: string }>('GET', '/user');
        return data.login;
    }

    // ─── Static Converters ────────────────────────────────────────

    /** Convert an Issue to its webview-safe data shape. */
    static toData(issue: Issue): IssueData {
        return {
            number: issue.number,
            title: issue.title,
            state: issue.state,
            htmlUrl: issue.htmlUrl,
            body: issue.body,
            author: issue.author,
            authorAvatarUrl: issue.authorAvatarUrl,
            createdAt: issue.createdAt.toISOString(),
            updatedAt: issue.updatedAt.toISOString(),
            closedAt: issue.closedAt?.toISOString() ?? null,
            commentsCount: issue.commentsCount,
            labels: issue.labels,
            assignees: issue.assignees,
            milestone: issue.milestone,
            repoFullName: issue.repoFullName,
        };
    }

    /** Convert an IssueComment to its webview-safe data shape. */
    static toCommentData(comment: IssueComment): IssueCommentData {
        return {
            id: comment.id,
            body: comment.body,
            author: comment.author,
            authorAvatarUrl: comment.authorAvatarUrl,
            createdAt: comment.createdAt.toISOString(),
            updatedAt: comment.updatedAt.toISOString(),
            htmlUrl: comment.htmlUrl,
        };
    }
}
