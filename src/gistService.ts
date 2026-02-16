import * as vscode from 'vscode';
import { AuthService } from './authService';

// ─── Data Model (16b) ────────────────────────────────────────────

export interface GistNote {
    id: string; // GitHub gist ID
    title: string; // Derived from the .md filename
    content: string; // Markdown body
    isPublic: boolean; // Secret vs public
    createdAt: Date;
    updatedAt: Date;
    htmlUrl: string; // Gist URL for sharing
    description: string; // Gist description (contains "[Superprompt Forge]" marker)
    linkedRepo: string | null; // "owner/repo" if linked to a workspace, null otherwise
}

/** Lightweight version sent to webview (dates as ISO strings) */
export interface GistNoteData {
    id: string;
    title: string;
    content: string;
    isPublic: boolean;
    createdAt: string;
    updatedAt: string;
    htmlUrl: string;
    linkedRepo: string | null;
    /** true when the gist description starts with [Superprompt Forge] */
    hasSpfMarker: boolean;
}

// ─── Convention Constants (16c) ───────────────────────────────────

/** Prefix in gist description to identify Superprompt Forge notes */
const MARKER_PREFIX = '[Superprompt Forge] ';

/** Legacy prefix from before the extension was renamed */
const LEGACY_MARKER_PREFIX = '[Workstash] ';

/** All accepted description prefixes (newest first) */
const ACCEPTED_PREFIXES = [MARKER_PREFIX, LEGACY_MARKER_PREFIX];

/** Marker file included in every Superprompt Forge note gist for discovery */
const MARKER_FILENAME = '.superprompt-forge-note';

/** Legacy marker filename from before the extension was renamed */
const LEGACY_MARKER_FILENAME = '.workstash-note';

/** All accepted marker filenames (newest first) */
const ACCEPTED_MARKER_FILENAMES = [MARKER_FILENAME, LEGACY_MARKER_FILENAME];

/** Marker file content — JSON metadata for forward-compatible versioning */
const MARKER_CONTENT = JSON.stringify({ v: 1 });

/** Build marker file content with optional workspace link */
function buildMarkerContent(linkedRepo?: string | null): string {
    const meta: { v: number; repo?: string } = { v: 1 };
    if (linkedRepo) {
        meta.repo = linkedRepo;
    }
    return JSON.stringify(meta);
}

/** Parse marker file content to extract linked repo */
function parseMarkerContent(content?: string): string | null {
    if (!content) { return null; }
    try {
        const meta = JSON.parse(content) as { v?: number; repo?: string };
        return meta.repo ?? null;
    } catch {
        return null;
    }
}

/** GitHub API base URL */
const API_BASE = 'https://api.github.com';

/** Max notes to fetch (capped pagination: 2 pages × 100) */
const MAX_PAGES = 2;
const PER_PAGE = 100;

// ─── Types ────────────────────────────────────────────────────────

/** Injectable fetch function signature for testability */
export type FetchFn = typeof globalThis.fetch;

/** Raw GitHub Gist API response shape (partial — only fields we use) */
interface GitHubGist {
    id: string;
    description: string | null;
    public: boolean;
    html_url: string;
    created_at: string;
    updated_at: string;
    files: Record<string, { filename: string; content?: string; raw_url?: string } | undefined>;
}

// ─── GistService (16a) ───────────────────────────────────────────

/**
 * REST API wrapper for GitHub Gist CRUD operations.
 * Uses Node built-in `fetch` (Node 18+). No runtime dependencies.
 * All calls go through `AuthService` for token.
 */
export class GistService {
    private readonly _authService: AuthService;
    private readonly _outputChannel: vscode.OutputChannel;
    private readonly _fetchFn: FetchFn;

    /**
     * @param authService   AuthService for GitHub tokens.
     * @param outputChannel VS Code output channel for diagnostics.
     * @param fetchFn       Custom fetch implementation for unit testing (optional).
     */
    constructor(authService: AuthService, outputChannel: vscode.OutputChannel, fetchFn?: FetchFn) {
        this._authService = authService;
        this._outputChannel = outputChannel;
        this._fetchFn = fetchFn ?? globalThis.fetch.bind(globalThis);
    }

    // ─── Private Helpers ──────────────────────────────────────────

    /** Get auth token or throw with user-friendly message. */
    private async _getToken(): Promise<string> {
        const token = await this._authService.getToken();
        if (!token) {
            throw new Error('Not authenticated. Please sign in to GitHub first.');
        }
        return token;
    }

    /** Execute a fetch request with auth headers, logging, and error mapping. */
    private async _request<T>(
        method: string,
        path: string,
        body?: unknown,
    ): Promise<{ data: T; headers: Headers }> {
        const token = await this._getToken();
        const url = `${API_BASE}${path}`;

        this._outputChannel.appendLine(`[GIST] ${method} ${path}`);

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

        // 16e: Check rate limiting
        this._checkRateLimit(response.headers);

        this._outputChannel.appendLine(`[GIST] ${method} ${path} → ${response.status}`);

        if (!response.ok) {
            await this._handleHttpError(response);
        }

        // DELETE returns 204 No Content
        if (response.status === 204) {
            return { data: undefined as T, headers: response.headers };
        }

        const data = (await response.json()) as T;
        return { data, headers: response.headers };
    }

    /** 16e: Check rate limit headers and warn when low. */
    private _checkRateLimit(headers: Headers): void {
        const remaining = headers.get('X-RateLimit-Remaining');
        if (remaining !== null) {
            const count = parseInt(remaining, 10);
            if (count <= 10 && count > 0) {
                this._outputChannel.appendLine(
                    `[GIST] ⚠ Rate limit low: ${count} requests remaining`,
                );
                vscode.window.showWarningMessage(
                    `GitHub API rate limit low: ${count} requests remaining.`,
                );
            } else if (count === 0) {
                const resetHeader = headers.get('X-RateLimit-Reset');
                const resetTime = resetHeader
                    ? new Date(parseInt(resetHeader, 10) * 1000).toLocaleTimeString()
                    : 'soon';
                this._outputChannel.appendLine(
                    `[GIST] ⚠ Rate limit exhausted, resets at ${resetTime}`,
                );
            }
        }
    }

    /** 16e: Map HTTP errors to user-friendly messages. */
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
                throw new Error('Rate limit exceeded. Try again later.');
            case 404:
                throw new Error('Note not found — it may have been deleted.');
            case 422:
                throw new Error(`Invalid note content${detail ? `: ${detail}` : ''}.`);
            default:
                throw new Error(
                    `GitHub API error ${response.status}${detail ? `: ${detail}` : ''}`,
                );
        }
    }

    /** Parse a raw GitHub Gist into our GistNote model. */
    private _parseGist(gist: GitHubGist): GistNote | undefined {
        // Must have a marker file (accept both current and legacy filenames)
        const markerFile = ACCEPTED_MARKER_FILENAMES
            .map((fn) => gist.files[fn])
            .find((f) => f !== undefined);
        if (!markerFile) {
            return undefined;
        }

        // Extract title from description — strip any known prefix, otherwise use full description
        const description = gist.description ?? '';
        const matchedPrefix = ACCEPTED_PREFIXES.find((p) => description.startsWith(p));
        const title = matchedPrefix
            ? description.slice(matchedPrefix.length)
            : description || 'Untitled';

        // Find the .md content file (exclude all known marker filenames)
        const markerNames = new Set(ACCEPTED_MARKER_FILENAMES);
        const mdFile = Object.values(gist.files).find(
            (f) => f && !markerNames.has(f.filename) && f.filename.endsWith('.md'),
        );

        // Extract linked repo from marker file content
        const linkedRepo = parseMarkerContent(markerFile.content);

        return {
            id: gist.id,
            title,
            content: mdFile?.content ?? '',
            isPublic: gist.public,
            createdAt: new Date(gist.created_at),
            updatedAt: new Date(gist.updated_at),
            htmlUrl: gist.html_url,
            description,
            linkedRepo,
        };
    }

    /** Convert a title to a safe filename. */
    private _titleToFilename(title: string): string {
        const safe = title
            .replace(/[^a-zA-Z0-9\s_-]/g, '')
            .replace(/\s+/g, '-')
            .slice(0, 100);
        return `${safe || 'note'}.md`;
    }

    /**
     * Detect which marker filename a gist uses (legacy or current).
     * Returns the current MARKER_FILENAME for new gists or if detection fails.
     */
    private _detectMarkerFilename(gist: GitHubGist): string {
        for (const fn of ACCEPTED_MARKER_FILENAMES) {
            if (gist.files[fn]) {
                return fn;
            }
        }
        return MARKER_FILENAME;
    }

    // ─── CRUD Methods (16d) ───────────────────────────────────────

    /**
     * List all Superprompt Forge notes (capped at MAX_PAGES × PER_PAGE = 200).
     * Filters gists by marker file presence.
     */
    async listNotes(): Promise<GistNote[]> {
        const notes: GistNote[] = [];

        for (let page = 1; page <= MAX_PAGES; page++) {
            const { data } = await this._request<GitHubGist[]>(
                'GET',
                `/gists?per_page=${PER_PAGE}&page=${page}`,
            );

            if (!data || data.length === 0) {
                break; // No more gists
            }

            for (const gist of data) {
                const note = this._parseGist(gist);
                if (note) {
                    notes.push(note);
                }
            }

            // If we got fewer than PER_PAGE results, we've reached the end
            if (data.length < PER_PAGE) {
                break;
            }
        }

        return notes;
    }

    /** Get a single note by gist ID. */
    async getNote(id: string): Promise<GistNote> {
        const { data } = await this._request<GitHubGist>('GET', `/gists/${id}`);
        const note = this._parseGist(data);
        if (!note) {
            throw new Error('Gist is not a Superprompt Forge note.');
        }
        return note;
    }

    /** Create a new note gist. */
    async createNote(title: string, content: string, isPublic = false, linkedRepo?: string): Promise<GistNote> {
        const filename = this._titleToFilename(title);
        const { data } = await this._request<GitHubGist>('POST', '/gists', {
            description: `${MARKER_PREFIX}${title}`,
            public: isPublic,
            files: {
                [filename]: { content: content || '# ' + title + '\n' },
                [MARKER_FILENAME]: { content: buildMarkerContent(linkedRepo) },
            },
        });

        const note = this._parseGist(data);
        if (!note) {
            throw new Error('Failed to parse created note.');
        }
        return note;
    }

    /** Update an existing note (title and/or content). */
    async updateNote(id: string, title: string, content: string): Promise<GistNote> {
        // Fetch the raw gist to find the old .md filename and detect marker filename
        const { data: rawGist } = await this._request<GitHubGist>('GET', `/gists/${id}`);
        const current = this._parseGist(rawGist);
        if (!current) {
            throw new Error('Gist is not a Superprompt Forge note.');
        }
        const actualMarker = this._detectMarkerFilename(rawGist);
        const oldFilename = this._titleToFilename(current.title);
        const newFilename = this._titleToFilename(title);

        const files: Record<string, { content: string } | null> = {
            [newFilename]: { content },
            [actualMarker]: { content: buildMarkerContent(current.linkedRepo) },
        };

        // If the title changed, delete the old file
        if (oldFilename !== newFilename) {
            files[oldFilename] = null;
        }

        const { data } = await this._request<GitHubGist>('PATCH', `/gists/${id}`, {
            description: `${MARKER_PREFIX}${title}`,
            files,
        });

        const note = this._parseGist(data);
        if (!note) {
            throw new Error('Failed to parse updated note.');
        }
        return note;
    }

    /** Delete a note gist permanently. */
    async deleteNote(id: string): Promise<void> {
        await this._request<void>('DELETE', `/gists/${id}`);
    }

    /**
     * Toggle note visibility between public and secret.
     * ⚠️ GitHub API doesn't support in-place visibility change.
     * This deletes and re-creates the gist — the gist ID, comments, stars, and forks are lost.
     */
    async toggleVisibility(id: string): Promise<GistNote> {
        const current = await this.getNote(id);
        const newVisibility = !current.isPublic;

        this._outputChannel.appendLine(
            `[GIST] Toggling visibility: ${current.isPublic ? 'public→secret' : 'secret→public'} (delete + re-create)`,
        );

        // Delete the old gist
        await this.deleteNote(id);

        // Re-create with opposite visibility (preserve linked repo)
        return this.createNote(current.title, current.content, newVisibility, current.linkedRepo ?? undefined);
    }

    /** Link a note to a workspace repository. */
    async linkToRepo(id: string, repoSlug: string): Promise<GistNote> {
        this._outputChannel.appendLine(`[GIST] Linking note ${id} to repo ${repoSlug}`);
        // Detect which marker filename the gist uses (legacy or current)
        const { data: rawGist } = await this._request<GitHubGist>('GET', `/gists/${id}`);
        const actualMarker = this._detectMarkerFilename(rawGist);
        await this._request('PATCH', `/gists/${id}`, {
            files: {
                [actualMarker]: { content: buildMarkerContent(repoSlug) },
            },
        });
        return this.getNote(id);
    }

    /** Unlink a note from its workspace repository. */
    async unlinkFromRepo(id: string): Promise<GistNote> {
        this._outputChannel.appendLine(`[GIST] Unlinking note ${id} from repo`);
        // Detect which marker filename the gist uses (legacy or current)
        const { data: rawGist } = await this._request<GitHubGist>('GET', `/gists/${id}`);
        const actualMarker = this._detectMarkerFilename(rawGist);
        await this._request('PATCH', `/gists/${id}`, {
            files: {
                [actualMarker]: { content: buildMarkerContent(null) },
            },
        });
        return this.getNote(id);
    }

    /**
     * Migrate a legacy note to the current Superprompt Forge naming convention.
     * Updates description prefix to [Superprompt Forge] and ensures the current
     * marker filename is present (adds it if only the legacy one exists).
     */
    async migrateToSpf(id: string): Promise<GistNote> {
        this._outputChannel.appendLine(`[GIST] Migrating note ${id} to SPF marker`);
        const { data: rawGist } = await this._request<GitHubGist>('GET', `/gists/${id}`);
        const note = this._parseGist(rawGist);
        if (!note) {
            throw new Error('Gist is not a recognized note.');
        }

        const files: Record<string, { content: string } | null> = {};

        // If using the legacy marker filename, add the current one and remove the old
        const oldMarker = this._detectMarkerFilename(rawGist);
        if (oldMarker !== MARKER_FILENAME) {
            files[MARKER_FILENAME] = { content: rawGist.files[oldMarker]?.content ?? MARKER_CONTENT };
            files[oldMarker] = null; // delete legacy marker file
        }

        // Update description to use current prefix
        const newDescription = `${MARKER_PREFIX}${note.title}`;

        await this._request('PATCH', `/gists/${id}`, {
            description: newDescription,
            ...(Object.keys(files).length > 0 ? { files } : {}),
        });

        return this.getNote(id);
    }

    /** Convert a GistNote to the lightweight data shape sent to the webview. */
    static toData(note: GistNote): GistNoteData {
        return {
            id: note.id,
            title: note.title,
            content: note.content,
            isPublic: note.isPublic,
            createdAt: note.createdAt.toISOString(),
            updatedAt: note.updatedAt.toISOString(),
            htmlUrl: note.htmlUrl,
            linkedRepo: note.linkedRepo,
            hasSpfMarker: note.description.startsWith(MARKER_PREFIX),
        };
    }
}
