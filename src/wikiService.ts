import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execFile } from 'child_process';
import { AuthService } from './authService';

// ─── Data Models ──────────────────────────────────────────────────

export interface WikiPage {
    /** Page title (derived from filename, e.g. "Home" from "Home.md") */
    title: string;
    /** Filename in the wiki repo, e.g. "Home.md" */
    filename: string;
    /** Raw markdown content of the page */
    content: string;
    /** SHA of the blob (for caching) */
    sha: string;
}

/** Lightweight list-only version (no content yet) */
export interface WikiPageSummary {
    title: string;
    filename: string;
    sha: string;
    /** File size in bytes */
    size: number;
}

/** Webview-safe shape sent via postMessage */
export interface WikiPageData {
    title: string;
    filename: string;
    content: string;
    sha: string;
}

export interface WikiPageSummaryData {
    title: string;
    filename: string;
    sha: string;
    size: number;
}

// ─── GitHub API Response Types ────────────────────────────────────

interface GitHubTreeItem {
    path: string;
    mode: string;
    type: 'blob' | 'tree';
    sha: string;
    size?: number;
    url: string;
}

interface GitHubTreeResponse {
    sha: string;
    url: string;
    tree: GitHubTreeItem[];
    truncated: boolean;
}

interface GitHubBlobResponse {
    sha: string;
    node_id: string;
    size: number;
    url: string;
    content: string;
    encoding: 'base64' | 'utf-8';
}

interface GitHubContentResponse {
    name: string;
    path: string;
    sha: string;
    size: number;
    type: 'file' | 'dir';
    content?: string;
    encoding?: string;
    download_url: string | null;
    html_url: string;
}

// ─── Constants ────────────────────────────────────────────────────

const API_BASE = 'https://api.github.com';
const RAW_BASE = 'https://raw.githubusercontent.com/wiki';

/** File extensions that are valid wiki page formats */
const WIKI_EXTENSIONS = new Set(['.md', '.markdown', '.mediawiki', '.textile', '.rdoc', '.org', '.creole', '.pod', '.asciidoc', '.rst']);

// ─── Types ────────────────────────────────────────────────────────

/** Injectable fetch function signature for testability */
export type FetchFn = typeof globalThis.fetch;

// ─── WikiService ──────────────────────────────────────────────────

/**
 * REST API wrapper for reading GitHub Wiki pages.
 *
 * GitHub wikis are stored in a separate git repo (`owner/repo.wiki`).
 * We use the Git Trees API and raw content fetches to list and read pages
 * without cloning the wiki repo locally.
 */
export class WikiService {
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
    ): Promise<{ data: T; headers: Headers }> {
        const token = await this._getToken();
        const url = path.startsWith('http') ? path : `${API_BASE}${path}`;

        this._outputChannel.appendLine(`[Wiki] ${method} ${path}`);

        const headers: Record<string, string> = {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
        };

        const response = await this._fetchFn(url, { method, headers });

        this._checkRateLimit(response.headers);
        this._outputChannel.appendLine(`[Wiki] ${method} ${path} → ${response.status}`);

        if (!response.ok) {
            await this._handleHttpError(response);
        }

        const data = (await response.json()) as T;
        return { data, headers: response.headers };
    }

    private async _requestRaw(url: string): Promise<string> {
        const token = await this._getToken();

        this._outputChannel.appendLine(`[Wiki] GET (raw) ${url}`);

        const response = await this._fetchFn(url, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github.raw+json',
                'X-GitHub-Api-Version': '2022-11-28',
            },
        });

        this._outputChannel.appendLine(`[Wiki] GET (raw) ${url} → ${response.status}`);

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('Wiki page not found.');
            }
            await this._handleHttpError(response);
        }

        return response.text();
    }

    private _checkRateLimit(headers: Headers): void {
        const remaining = headers.get('X-RateLimit-Remaining');
        if (remaining !== null) {
            const count = parseInt(remaining, 10);
            if (count <= 10 && count > 0) {
                this._outputChannel.appendLine(
                    `[Wiki] ⚠ Rate limit low: ${count} requests remaining`,
                );
            } else if (count === 0) {
                const resetHeader = headers.get('X-RateLimit-Reset');
                const resetTime = resetHeader
                    ? new Date(parseInt(resetHeader, 10) * 1000).toLocaleTimeString()
                    : 'soon';
                this._outputChannel.appendLine(
                    `[Wiki] ⚠ Rate limit exhausted, resets at ${resetTime}`,
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
                throw new Error('Wiki not found. This repository may not have a wiki enabled.');
            default:
                throw new Error(`GitHub API error ${response.status}: ${detail}`);
        }
    }

    /** Extract a human-readable title from a wiki filename */
    private _titleFromFilename(filename: string): string {
        // Remove the extension, then replace hyphens and underscores with spaces
        const dotIdx = filename.lastIndexOf('.');
        const base = dotIdx > 0 ? filename.substring(0, dotIdx) : filename;
        return base.replace(/[-_]/g, ' ');
    }

    /** Check if a filename is a valid wiki page (by extension) */
    private _isWikiPage(filename: string): boolean {
        const dotIdx = filename.lastIndexOf('.');
        if (dotIdx <= 0) { return false; }
        const ext = filename.substring(dotIdx).toLowerCase();
        return WIKI_EXTENSIONS.has(ext);
    }

    // ─── Public API ───────────────────────────────────────────────

    /**
     * Check whether a wiki exists for the given repository.
     * Returns `true` if the wiki repo has at least one page.
     */
    async hasWiki(owner: string, repo: string): Promise<boolean> {
        try {
            const pages = await this.listPages(owner, repo);
            return pages.length > 0;
        } catch {
            return false;
        }
    }

    /**
     * List all wiki pages for a repository.
     * Tries the REST API first (Git Trees), falls back to a shallow
     * git clone when the API returns 404 (common with private repos).
     */
    async listPages(owner: string, repo: string): Promise<WikiPageSummary[]> {
        try {
            return await this._listPagesViaApi(owner, repo);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : '';
            // Fall back for 404 / "not found" / access-denied-masking-404 (common with private repos)
            const is404 = msg.includes('not found') || msg.includes('Not Found') || msg.includes('404');
            if (!is404) {
                throw e;
            }
            this._outputChannel.appendLine(`[Wiki] REST API 404 for ${owner}/${repo}.wiki — falling back to git clone`);
            return this._listPagesViaGit(owner, repo);
        }
    }

    /**
     * Fetch the raw markdown content of a specific wiki page.
     * Tries the Contents API first, falls back to the local git clone.
     */
    async getPageContent(owner: string, repo: string, filename: string): Promise<WikiPage> {
        try {
            return await this._getPageContentViaApi(owner, repo, filename);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : '';
            const is404 = msg.includes('not found') || msg.includes('Not Found') || msg.includes('404');
            if (!is404) {
                throw e;
            }
            this._outputChannel.appendLine(`[Wiki] REST API 404 for page content — falling back to git clone`);
            return this._getPageContentViaGit(owner, repo, filename);
        }
    }

    // ─── REST API Implementations ─────────────────────────────────

    /** List pages via the Git Trees REST API. */
    private async _listPagesViaApi(owner: string, repo: string): Promise<WikiPageSummary[]> {
        // The wiki repo is {owner}/{repo}.wiki — we use its git tree
        const { data } = await this._request<GitHubTreeResponse>(
            'GET',
            `/repos/${owner}/${repo}.wiki/git/trees/HEAD?recursive=1`,
        );

        const pages: WikiPageSummary[] = [];

        for (const item of data.tree) {
            if (item.type !== 'blob') { continue; }
            if (!this._isWikiPage(item.path)) { continue; }

            // Skip files in subdirectories like _Sidebar.md, _Footer.md (convention)
            // but include them if they're top-level content pages
            const filename = item.path;
            pages.push({
                title: this._titleFromFilename(filename),
                filename,
                sha: item.sha,
                size: item.size ?? 0,
            });
        }

        // Sort: Home first, then alphabetical by title
        pages.sort((a, b) => {
            if (a.title === 'Home') { return -1; }
            if (b.title === 'Home') { return 1; }
            return a.title.localeCompare(b.title);
        });

        return pages;
    }

    /** Fetch page content via the Contents REST API. */
    private async _getPageContentViaApi(owner: string, repo: string, filename: string): Promise<WikiPage> {
        const encodedPath = encodeURIComponent(filename);
        const { data } = await this._request<GitHubContentResponse>(
            'GET',
            `/repos/${owner}/${repo}.wiki/contents/${encodedPath}`,
        );

        let content: string;
        if (data.content && data.encoding === 'base64') {
            content = Buffer.from(data.content, 'base64').toString('utf-8');
        } else if (data.download_url) {
            // Fall back to raw download for large files
            content = await this._requestRaw(data.download_url);
        } else {
            content = '';
        }

        return {
            title: this._titleFromFilename(filename),
            filename,
            content,
            sha: data.sha,
        };
    }

    // ─── Git CLI Fallback ─────────────────────────────────────────

    /** Cache of cloned wiki directories keyed by "owner/repo" */
    private _cloneCache = new Map<string, string>();

    /**
     * Run a git command and return stdout.
     * Injects the GitHub token into the clone URL for auth.
     */
    private async _execGit(args: string[], cwd?: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const opts: { cwd?: string; maxBuffer: number; env: NodeJS.ProcessEnv } = {
                maxBuffer: 10 * 1024 * 1024, // 10 MB
                env: {
                    ...process.env,
                    GIT_TERMINAL_PROMPT: '0',
                },
            };
            if (cwd) { opts.cwd = cwd; }

            execFile('git', args, opts, (err, stdout, stderr) => {
                if (err) {
                    this._outputChannel.appendLine(`[Wiki/git] Error: ${stderr || err.message}`);
                    reject(new Error(stderr || err.message));
                } else {
                    resolve(stdout);
                }
            });
        });
    }

    /**
     * Ensure a shallow clone of the wiki repo exists in a temp directory.
     * Re-uses cached clones within the same session, pulls latest on subsequent calls.
     */
    private async _ensureWikiClone(owner: string, repo: string): Promise<string> {
        const key = `${owner}/${repo}`;
        const cached = this._cloneCache.get(key);

        // If we already have a clone, pull latest
        if (cached && fs.existsSync(cached)) {
            this._outputChannel.appendLine(`[Wiki/git] Pulling latest for ${key}`);
            try {
                await this._execGit(['pull', '--ff-only'], cached);
            } catch {
                // Pull failed (e.g., force-pushed wiki) — re-clone
                this._outputChannel.appendLine(`[Wiki/git] Pull failed, re-cloning ${key}`);
                fs.rmSync(cached, { recursive: true, force: true });
                this._cloneCache.delete(key);
                return this._ensureWikiClone(owner, repo);
            }
            return cached;
        }

        // Fresh shallow clone
        const token = await this._getToken();
        const tmpDir = path.join(os.tmpdir(), 'superprompt-forge-wiki', `${owner}--${repo}`);

        // Clean up any stale directory
        if (fs.existsSync(tmpDir)) {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
        fs.mkdirSync(tmpDir, { recursive: true });

        const cloneUrl = `https://x-access-token:${token}@github.com/${owner}/${repo}.wiki.git`;
        this._outputChannel.appendLine(`[Wiki/git] Cloning wiki for ${key} into ${tmpDir}`);

        await this._execGit(['clone', '--depth', '1', cloneUrl, tmpDir]);
        this._cloneCache.set(key, tmpDir);
        return tmpDir;
    }

    /** List wiki pages from the local git clone. */
    private async _listPagesViaGit(owner: string, repo: string): Promise<WikiPageSummary[]> {
        const wikiDir = await this._ensureWikiClone(owner, repo);

        // List all files in the wiki directory
        const entries = fs.readdirSync(wikiDir, { withFileTypes: true });
        const pages: WikiPageSummary[] = [];

        for (const entry of entries) {
            if (!entry.isFile()) { continue; }
            if (entry.name.startsWith('.')) { continue; } // skip .git etc.
            if (!this._isWikiPage(entry.name)) { continue; }

            const filePath = path.join(wikiDir, entry.name);
            const stats = fs.statSync(filePath);

            pages.push({
                title: this._titleFromFilename(entry.name),
                filename: entry.name,
                sha: '', // No SHA available from local clone listing
                size: stats.size,
            });
        }

        // Sort: Home first, then alphabetical by title
        pages.sort((a, b) => {
            if (a.title === 'Home') { return -1; }
            if (b.title === 'Home') { return 1; }
            return a.title.localeCompare(b.title);
        });

        this._outputChannel.appendLine(`[Wiki/git] Found ${pages.length} pages via git clone`);
        return pages;
    }

    /** Read wiki page content from the local git clone. */
    private async _getPageContentViaGit(owner: string, repo: string, filename: string): Promise<WikiPage> {
        const wikiDir = await this._ensureWikiClone(owner, repo);
        const filePath = path.join(wikiDir, filename);

        if (!fs.existsSync(filePath)) {
            throw new Error(`Wiki page not found: ${filename}`);
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const stats = fs.statSync(filePath);

        // Try to get the blob SHA from git
        let sha = '';
        try {
            const lsTree = await this._execGit(['ls-tree', 'HEAD', filename], wikiDir);
            const parts = lsTree.trim().split(/\s+/);
            if (parts.length >= 3) { sha = parts[2]; }
        } catch { /* sha is optional */ }

        return {
            title: this._titleFromFilename(filename),
            filename,
            content,
            sha,
        };
    }

    /**
     * Invalidate the cached wiki clone for a repo (e.g. on repo switch).
     */
    invalidateCache(owner: string, repo: string): void {
        const key = `${owner}/${repo}`;
        const cached = this._cloneCache.get(key);
        if (cached) {
            this._cloneCache.delete(key);
            // Clean up async, don't block
            try { fs.rmSync(cached, { recursive: true, force: true }); } catch { /* ignore */ }
        }
    }

    /**
     * Get the URL to view a wiki page on GitHub.com.
     */
    getPageUrl(owner: string, repo: string, filename: string): string {
        const dotIdx = filename.lastIndexOf('.');
        const slug = dotIdx > 0 ? filename.substring(0, dotIdx) : filename;
        return `https://github.com/${owner}/${repo}/wiki/${slug}`;
    }

    /**
     * Get the URL to the wiki home page on GitHub.com.
     */
    getWikiUrl(owner: string, repo: string): string {
        return `https://github.com/${owner}/${repo}/wiki`;
    }

    // ─── Static Converters ────────────────────────────────────────

    /** Convert a WikiPageSummary to its webview-safe data shape. */
    static toSummaryData(page: WikiPageSummary): WikiPageSummaryData {
        return {
            title: page.title,
            filename: page.filename,
            sha: page.sha,
            size: page.size,
        };
    }

    /** Convert a WikiPage to its webview-safe data shape. */
    static toPageData(page: WikiPage): WikiPageData {
        return {
            title: page.title,
            filename: page.filename,
            content: page.content,
            sha: page.sha,
        };
    }
}
