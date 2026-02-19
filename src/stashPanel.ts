import * as vscode from 'vscode';
import { type GitService, type StashEntry, type StashFileEntry } from './gitService';
import { type AuthService } from './authService';
import { GistService } from './gistService';
import { PrService } from './prService';
import { IssueService } from './issueService';
import { MattermostService, type MattermostPostData, type MattermostChannelData, type MattermostFileInfoData, type MattermostChannel } from './mattermostService';
import { MattermostWebSocket, type MmWsPostedData, type MmWsReactionData, type MmWsStatusChangeData, type MmWsTypingData } from './mattermostWebSocket';
import { ProjectService } from './projectService';
import { type GoogleDriveService } from './googleDriveService';
import { type GoogleCalendarService } from './calendarService';
import { WikiService } from './wikiService';
import { AiService } from './aiService';
import { formatRelativeTime, extractErrorMessage } from './utils';
import { type PanelServices } from './panelContext';
import { handlerRegistry, type HandlerContext } from './handlers';

// ─── GitHub Image URL Authentication ──────────────────────────────
// GitHub-hosted images in PR bodies/comments (user-attachments, private-user-images)
// require authentication to load. Since webview <img> tags can't send auth headers,
// we follow redirects with the token to get the pre-signed URL that works without auth.

/** Regex matching GitHub image URLs that may require authentication. */
const GITHUB_IMAGE_URL_RE = /https:\/\/github\.com\/[^/]+\/[^/]+\/assets\/[^\s)"']+|https:\/\/private-user-images\.githubusercontent\.com\/[^\s)"']+/g;

/**
 * Rewrite GitHub image URLs in markdown/HTML content to use authenticated (pre-signed) URLs.
 * GitHub's `/assets/` URLs redirect to a CDN with a JWT token when accessed with auth headers.
 * We follow that redirect to get the final URL which is publicly accessible (time-limited).
 */
async function authenticateGitHubImageUrls(
    content: string,
    token: string,
    outputChannel: vscode.OutputChannel,
): Promise<string> {
    const matches = content.match(GITHUB_IMAGE_URL_RE);
    if (!matches) { return content; }

    // Deduplicate URLs
    const uniqueUrls = [...new Set(matches)];
    const urlMap = new Map<string, string>();

    await Promise.all(
        uniqueUrls.map(async (url) => {
            try {
                // Follow redirects with auth to get the pre-signed CDN URL
                const response = await fetch(url, {
                    method: 'HEAD',
                    headers: { Authorization: `Bearer ${token}` },
                    redirect: 'follow',
                });
                if (response.ok && response.url !== url) {
                    urlMap.set(url, response.url);
                }
            } catch (e: unknown) {
                outputChannel.appendLine(`[PR] Failed to authenticate image URL: ${url} — ${extractErrorMessage(e)}`);
            }
        }),
    );

    if (urlMap.size === 0) { return content; }

    let result = content;
    for (const [original, authenticated] of urlMap) {
        // Replace all occurrences of the original URL with the authenticated one
        result = result.split(original).join(authenticated);
    }
    return result;
}

/**
 * Manages the Superprompt Forge webview panel — a rich, interactive stash explorer
 * that opens as an editor tab, powered by a React + Zustand + Tailwind UI.
 */
export class StashPanel {
    public static readonly viewType = 'superprompt-forge.panel';

    private static _instance: StashPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _gitService: GitService;
    private readonly _authService: AuthService | undefined;
    private readonly _gistService: GistService | undefined;
    private readonly _prService: PrService | undefined;
    private readonly _issueService: IssueService | undefined;
    private readonly _mattermostService: MattermostService | undefined;
    private readonly _projectService: ProjectService | undefined;
    private readonly _driveService: GoogleDriveService | undefined;
    private readonly _calendarService: GoogleCalendarService | undefined;
    private readonly _wikiService: WikiService | undefined;
    private readonly _aiService: AiService;
    private readonly _extensionUri: vscode.Uri;
    private readonly _outputChannel: vscode.OutputChannel;
    private _disposables: vscode.Disposable[] = [];
    private _isReady = false;
    private _mmWebSocket: MattermostWebSocket | undefined;
    /** Queued deep-link messages to send once the webview is ready */
    private _pendingDeepLinks: Array<Record<string, unknown>> = [];

    /**
     * Optional repo override chosen by the user in the webview.
     * When set, GitHub-related tabs (PRs, Issues, Projects) use this
     * instead of auto-detecting from the git origin remote.
     */
    private _repoOverride: { owner: string; repo: string } | undefined;

    /** Access the current panel instance (e.g. for openNote deep-links). */
    public static get currentPanel(): StashPanel | undefined {
        return StashPanel._instance;
    }

    /**
     * 8b-iii: Refresh the webview panel if it is currently open.
     * Called from StashProvider.refresh() so tree + webview stay in sync.
     */
    public static refreshIfOpen(): void {
        if (StashPanel._instance && StashPanel._instance._isReady) {
            StashPanel._instance._refresh();
        }
    }

    /**
     * Resolve the active GitHub repo — uses the user's webview override
     * if set, otherwise falls back to auto-detecting from the git origin.
     */
    private async _getRepoInfo(): Promise<{ owner: string; repo: string } | undefined> {
        if (this._repoOverride) {
            return this._repoOverride;
        }
        return this._gitService.getGitHubRepo();
    }

    /**
     * Send the current repo context + all available GitHub remotes to the
     * webview so it can render the repo switcher.
     */
    private async _sendRepoContext(): Promise<void> {
        try {
            const current = await this._getRepoInfo();
            const allRemotes = await this._gitService.getAllGitHubRemotes();
            const repos = allRemotes.map((r) => ({
                owner: r.owner,
                repo: r.repo,
                remote: r.remote,
            }));
            this._panel.webview.postMessage({
                type: 'repoContext',
                current: current ? { owner: current.owner, repo: current.repo } : null,
                repos,
            });
        } catch (e: unknown) {
            this._outputChannel.appendLine(`[RepoContext] Error: ${extractErrorMessage(e)}`);
        }
    }

    /**
     * Fetch the user's repos grouped by owner (personal + orgs) via GitHub API
     * and send to the webview for the repo switcher.
     */
    private async _fetchUserRepos(): Promise<void> {
        if (!this._prService || !this._authService) {
            return;
        }
        try {
            const isAuth = await this._authService.isAuthenticated();
            if (!isAuth) {
                return;
            }

            this._panel.webview.postMessage({ type: 'repoGroupsLoading' });

            const groups = await this._prService.getUserRepoGroups();
            this._panel.webview.postMessage({
                type: 'repoGroups',
                payload: groups,
            });
        } catch (e: unknown) {
            this._outputChannel.appendLine(
                `[RepoSwitcher] Failed to fetch user repos: ${extractErrorMessage(e)}`,
            );
        }
    }

    public static createOrShow(
        extensionUri: vscode.Uri,
        services: PanelServices,
    ): StashPanel {
        const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

        if (StashPanel._instance) {
            StashPanel._instance._panel.reveal(column);
            StashPanel._instance._refresh();
            return StashPanel._instance;
        }

        const panel = vscode.window.createWebviewPanel(StashPanel.viewType, 'Superprompt Forge', column, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
        });

        StashPanel._instance = new StashPanel(panel, extensionUri, services);
        return StashPanel._instance;
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        services: PanelServices,
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._gitService = services.gitService;
        this._outputChannel = services.outputChannel;
        this._authService = services.authService;
        this._gistService = services.gistService;
        this._prService = services.prService;
        this._issueService = services.issueService;
        this._mattermostService = services.mattermostService;
        this._projectService = services.projectService;
        this._driveService = services.driveService;
        this._calendarService = services.calendarService;
        this._wikiService = services.wikiService;
        this._aiService = new AiService(services.outputChannel);

        this._panel.iconPath = new vscode.ThemeIcon('archive');
        this._panel.webview.html = this._getHtml();

        // Handle messages from the React webview
        this._panel.webview.onDidReceiveMessage(
            async (msg) => {
                try {
                    await this._handleMessage(msg);
                } catch (e: unknown) {
                    const m = extractErrorMessage(e);
                    this._outputChannel.appendLine(`[Message] Unhandled error for "${msg?.type}": ${m}`);
                }
            },
            null,
            this._disposables,
        );

        this._panel.onDidDispose(() => this._dispose(), null, this._disposables);
    }

    /** Deep-link: switch to Notes tab and select a specific note. */
    public openNote(noteId: string): void {
        const msg = { type: 'openNote', noteId };
        if (this._isReady) {
            this._panel.webview.postMessage(msg);
        } else {
            this._pendingDeepLinks.push(msg);
        }
    }

    /** Deep-link: switch to PRs tab and select a specific PR. */
    public openPR(prNumber: number): void {
        const msg = { type: 'openPR', prNumber };
        if (this._isReady) {
            this._panel.webview.postMessage(msg);
        } else {
            this._pendingDeepLinks.push(msg);
        }
    }

    /** Deep-link: switch to Issues tab and select a specific issue. */
    public openIssue(issueNumber: number): void {
        const msg = { type: 'openIssue', issueNumber };
        if (this._isReady) {
            this._panel.webview.postMessage(msg);
        } else {
            this._pendingDeepLinks.push(msg);
        }
    }

    /** Deep-link: switch to Mattermost tab and open a specific channel. */
    public openChannel(channelId: string, channelName: string): void {
        const msg = { type: 'openChannel', channelId, channelName };
        if (this._isReady) {
            this._panel.webview.postMessage(msg);
        } else {
            this._pendingDeepLinks.push(msg);
        }
    }

    /** Deep-link: switch to Projects tab and select a specific item. */
    public openProjectItem(itemId: string): void {
        const msg = { type: 'openProjectItem', itemId };
        if (this._isReady) {
            this._panel.webview.postMessage(msg);
        } else {
            this._pendingDeepLinks.push(msg);
        }
    }

    /** Gather stash data and post it to the webview as a single message. */
    private async _refresh(): Promise<void> {
        // Tell webview we're loading
        this._panel.webview.postMessage({ type: 'loading' });

        try {
            const stashes = await this._gitService.getStashList();
            const payload = await this._buildPayload(stashes);
            this._panel.webview.postMessage({ type: 'stashData', payload });

            // 8b-vi: Update panel title with stash count
            this._panel.title = stashes.length > 0 ? `Superprompt Forge (${stashes.length})` : 'Superprompt Forge';
        } catch {
            this._panel.webview.postMessage({ type: 'stashData', payload: [] });
            this._panel.title = 'Superprompt Forge';
        }
    }

    private async _buildPayload(stashes: StashEntry[]): Promise<unknown[]> {
        const result: unknown[] = [];

        for (const entry of stashes) {
            let files: StashFileEntry[] = [];
            try {
                files = await this._gitService.getStashFilesWithStatus(entry.index);
            } catch {
                /* non-critical */
            }

            try {
                const stats = await this._gitService.getStashStats(entry.index);
                if (stats) {
                    entry.stats = stats;
                }
            } catch {
                /* optional */
            }

            let numstat: { path: string; insertions: number; deletions: number }[] = [];
            try {
                numstat = await this._gitService.getStashFileNumstat(entry.index);
            } catch {
                /* optional */
            }

            result.push({
                index: entry.index,
                name: entry.name,
                branch: entry.branch,
                message: entry.message,
                date: entry.date.toISOString(),
                relativeDate: formatRelativeTime(entry.date),
                stats: entry.stats,
                files: files.map((f) => ({ path: f.path, status: f.status })),
                numstat: numstat.map((n) => ({
                    path: n.path,
                    insertions: n.insertions,
                    deletions: n.deletions,
                })),
            });
        }
        return result;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async _handleMessage(msg: { type: string } & Record<string, any>): Promise<void> {
        // ─── 'ready' stays inline — it mutates panel-level state ──────
        if (msg.type === 'ready') {
            this._isReady = true;
            this._outputChannel.appendLine('[Init] Webview ready — starting initialisation...');
            const initSteps: Array<{ label: string; fn: () => Promise<void> }> = [
                { label: 'refresh', fn: () => this._refresh() },
                { label: 'authStatus', fn: () => this._sendAuthStatus() },
                { label: 'repoContext', fn: () => this._sendRepoContext() },
                { label: 'notes', fn: () => this._refreshNotes() },
                { label: 'PRs', fn: () => this._refreshPRs() },
                { label: 'issues', fn: () => this._refreshIssues() },
                { label: 'projects', fn: () => this._refreshProjects() },
                { label: 'mattermost', fn: () => this._refreshMattermost() },
                { label: 'driveAuth', fn: () => this._sendDriveAuthStatus() },
                { label: 'calendarAuth', fn: () => this._sendCalendarAuthStatus() },
                { label: 'wiki', fn: () => this._refreshWiki() },
            ];
            for (const step of initSteps) {
                try {
                    await step.fn();
                    this._outputChannel.appendLine(`[Init] ✓ ${step.label}`);
                } catch (e: unknown) {
                    const m = extractErrorMessage(e);
                    this._outputChannel.appendLine(`[Init] ⚠ ${step.label} failed: ${m}`);
                }
            }
            this._outputChannel.appendLine('[Init] All init steps complete');
            // Fire-and-forget: pre-fetch user repos for the repo switcher
            this._fetchUserRepos();
            // Inform webview whether AI features are available and which provider
            this._panel.webview.postMessage({
                type: 'aiAvailable',
                available: AiService.isAvailable(),
                provider: AiService.activeProvider(),
            });
            // Send agent template default prompts (single source of truth)
            this._panel.webview.postMessage({
                type: 'aiAgentTemplates',
                templates: AiService.AGENT_TEMPLATES,
            });
            // Flush any deep-link messages that were queued before the webview was ready
            for (const deepLink of this._pendingDeepLinks) {
                this._panel.webview.postMessage(deepLink);
            }
            this._pendingDeepLinks = [];
            return;
        }

        // ─── Dispatch to domain handlers ──────────────────────────────
        const ctx = this._buildHandlerContext();
        for (const handler of handlerRegistry) {
            if (await handler(ctx, msg)) {
                return;
            }
        }

        this._outputChannel.appendLine(`[Message] Unhandled message type: ${msg.type}`);
    }

    /**
     * Build a HandlerContext from the panel's private fields so that
     * domain handlers never need to import StashPanel.
     */
    private _buildHandlerContext(): HandlerContext {
        return {
            postMessage: (m) => this._panel.webview.postMessage(m),
            outputChannel: this._outputChannel,

            // Services
            gitService: this._gitService,
            authService: this._authService,
            gistService: this._gistService,
            prService: this._prService,
            issueService: this._issueService,
            mattermostService: this._mattermostService,
            projectService: this._projectService,
            driveService: this._driveService,
            calendarService: this._calendarService,
            wikiService: this._wikiService,
            aiService: this._aiService,

            // Panel helpers
            getRepoInfo: () => this._getRepoInfo(),
            refresh: () => this._refresh(),
            sendAuthStatus: () => this._sendAuthStatus(),
            sendRepoContext: () => this._sendRepoContext(),
            fetchUserRepos: () => this._fetchUserRepos(),

            // Domain refresh helpers
            refreshNotes: () => this._refreshNotes(),
            refreshPRs: (state, authorFilter) => this._refreshPRs(state, authorFilter),
            sendPRComments: (prNumber) => this._sendPRComments(prNumber),
            refreshIssues: (state) => this._refreshIssues(state),
            sendIssueComments: (issueNumber) => this._sendIssueComments(issueNumber),
            refreshProjects: () => this._refreshProjects(),
            refreshProjectItems: (projectId) => this._refreshProjectItems(projectId),
            refreshMattermost: () => this._refreshMattermost(),
            refreshWiki: () => this._refreshWiki(),
            sendDriveAuthStatus: () => this._sendDriveAuthStatus(),
            sendCalendarAuthStatus: () => this._sendCalendarAuthStatus(),
            gatherContext: (tabKey) => this._gatherContext(tabKey),

            // Mattermost WebSocket
            getMmWebSocket: () => this._mmWebSocket,
            setMmWebSocket: (ws) => { this._mmWebSocket = ws; },
            connectMattermostWebSocket: () => this._connectMattermostWebSocket(),

            // Deep-link helpers
            getRepoOverride: () => this._repoOverride,
            setRepoOverride: (o) => { this._repoOverride = o; },
        };
    }

    /**
     * Gather context data from services for AI summarization / chat.
     * If tabKey is provided, only gather data for that specific tab.
     * Otherwise gather a snapshot of all tabs for the chat context.
     */
    private async _gatherContext(tabKey?: string): Promise<string> {
        this._outputChannel.appendLine(`[AI] Gathering context${tabKey ? ` for tab: ${tabKey}` : ' for all tabs'}`);
        const shouldInclude = (key: string) => !tabKey || tabKey === key;

        // Read AI privacy settings
        const aiConfig = vscode.workspace.getConfiguration('superprompt-forge.ai');
        const includeSecretGists = aiConfig.get<boolean>('includeSecretGists', false);
        const includePrivateMessages = aiConfig.get<boolean>('includePrivateMessages', false);

        // §6d — Run independent data sources in parallel
        type SectionResult = { key: string; order: number; text: string };

        const tasks: Array<Promise<SectionResult | null>> = [];

        // ─── Stashes ─────────────────────────────────────────
        if (shouldInclude('stashes')) {
            tasks.push((async (): Promise<SectionResult> => {
                try {
                    const stashes = await this._gitService.getStashList();
                    if (stashes.length === 0) {
                        return { key: 'stashes', order: 0, text: '## Stashes\nNo stashes found.' };
                    }
                    const lines = stashes.map((s) => {
                        const statsStr = s.stats
                            ? ` — ${s.stats.filesChanged} file(s), +${s.stats.insertions}/-${s.stats.deletions}`
                            : '';
                        return `- stash@{${s.index}}: "${s.message}" (branch: ${s.branch}, ${formatRelativeTime(s.date)}${statsStr})`;
                    });
                    return { key: 'stashes', order: 0, text: `## Stashes (${stashes.length})\n${lines.join('\n')}` };
                } catch {
                    return { key: 'stashes', order: 0, text: '## Stashes\nUnable to fetch stash data.' };
                }
            })());
        }

        // ─── Pull Requests ───────────────────────────────────
        if (shouldInclude('prs') && this._prService && this._authService) {
            tasks.push((async (): Promise<SectionResult | null> => {
                try {
                    const repoInfo = await this._getRepoInfo();
                    if (!repoInfo) {return null;}
                    let username: string | undefined;
                    try { username = await this._prService!.getAuthenticatedUser(); } catch { /* ok */ }
                    const prList = await this._prService!.listPullRequests(
                        repoInfo.owner, repoInfo.repo, 'open', username,
                    );
                    if (prList.length === 0) {
                        return { key: 'prs', order: 1, text: '## Pull Requests\nNo open PRs.' };
                    }

                    // The list endpoint doesn't return additions/deletions/changed_files/comments.
                    // Fetch full details + reviews for each PR in parallel for accurate data.
                    const prDetailResults = await Promise.allSettled(
                        prList.map(async (listPr) => {
                            const [fullPr, reviews] = await Promise.all([
                                this._prService!.getPullRequest(
                                    repoInfo.owner, repoInfo.repo, listPr.number,
                                ).catch(() => listPr), // fall back to list data on error
                                this._prService!.getReviews(
                                    repoInfo.owner, repoInfo.repo, listPr.number,
                                ).catch(() => [] as Awaited<ReturnType<PrService['getReviews']>>),
                            ]);
                            return { pr: fullPr, reviews };
                        }),
                    );

                    const prLines: string[] = [];
                    for (const result of prDetailResults) {
                        if (result.status !== 'fulfilled') { continue; }
                        const { pr, reviews } = result.value;
                        const data = PrService.toData(pr);
                        const parts: string[] = [
                            `### PR #${data.number}: ${data.title}`,
                            `- **Author**: ${data.author}${data.isDraft ? ' (DRAFT)' : ''}`,
                            `- **State**: ${data.state} | **Branch**: ${data.branch} → ${data.baseBranch}`,
                            `- **Size**: +${data.additions}/-${data.deletions} across ${data.changedFiles} file(s), ${data.commentsCount} comment(s)`,
                            `- **Created**: ${formatRelativeTime(new Date(data.createdAt))} | **Updated**: ${formatRelativeTime(new Date(data.updatedAt))}`,
                        ];
                        if (data.labels.length > 0) {
                            parts.push(`- **Labels**: ${data.labels.map((l) => l.name).join(', ')}`);
                        }
                        if (data.assignees.length > 0) {
                            parts.push(`- **Assignees**: ${data.assignees.map((a) => a.login).join(', ')}`);
                        }
                        if (data.requestedReviewers.length > 0) {
                            parts.push(`- **Reviewers requested**: ${data.requestedReviewers.map((r) => r.login).join(', ')}`);
                        }
                        if (data.body) {
                            const bodyPreview = data.body.length > 300
                                ? data.body.slice(0, 300) + '…'
                                : data.body;
                            parts.push(`- **Description**: ${bodyPreview}`);
                        }
                        // Include review decisions
                        const meaningful = reviews.filter((r) =>
                            r.state === 'APPROVED' || r.state === 'CHANGES_REQUESTED',
                        );
                        if (meaningful.length > 0) {
                            const reviewStrs = meaningful.map((r) =>
                                `${r.user}: ${r.state}`,
                            );
                            parts.push(`- **Reviews**: ${reviewStrs.join(', ')}`);
                        }
                        prLines.push(parts.join('\n'));
                    }
                    return { key: 'prs', order: 1, text: `## Pull Requests (${prList.length} open)\n${prLines.join('\n\n')}` };
                } catch {
                    return { key: 'prs', order: 1, text: '## Pull Requests\nUnable to fetch PR data.' };
                }
            })());
        }

        // ─── Issues ──────────────────────────────────────────
        if (shouldInclude('issues') && this._issueService && this._authService) {
            tasks.push((async (): Promise<SectionResult | null> => {
                try {
                    const repoInfo = await this._getRepoInfo();
                    if (!repoInfo) {return null;}
                    const issues = await this._issueService!.listIssues(
                        repoInfo.owner, repoInfo.repo, 'open',
                    );
                    if (issues.length === 0) {
                        return { key: 'issues', order: 2, text: '## Issues\nNo open issues.' };
                    }
                    const issueLines: string[] = [];
                    for (const i of issues) {
                        const data = IssueService.toData(i);
                        const parts: string[] = [
                            `### Issue #${data.number}: ${data.title}`,
                            `- **Author**: ${data.author} | **State**: ${data.state} | **Comments**: ${data.commentsCount}`,
                            `- **Created**: ${formatRelativeTime(new Date(data.createdAt))} | **Updated**: ${formatRelativeTime(new Date(data.updatedAt))}`,
                        ];
                        if (data.labels.length > 0) {
                            parts.push(`- **Labels**: ${data.labels.map((l) => l.name).join(', ')}`);
                        }
                        if (data.assignees.length > 0) {
                            parts.push(`- **Assignees**: ${data.assignees.map((a) => a.login).join(', ')}`);
                        }
                        if (data.milestone) {
                            parts.push(`- **Milestone**: ${data.milestone.title}`);
                        }
                        if (data.body) {
                            const bodyPreview = data.body.length > 300
                                ? data.body.slice(0, 300) + '…'
                                : data.body;
                            parts.push(`- **Description**: ${bodyPreview}`);
                        }
                        issueLines.push(parts.join('\n'));
                    }
                    return { key: 'issues', order: 2, text: `## Issues (${issues.length} open)\n${issueLines.join('\n\n')}` };
                } catch {
                    return { key: 'issues', order: 2, text: '## Issues\nUnable to fetch issue data.' };
                }
            })());
        }

        // ─── Projects ────────────────────────────────────────
        if (shouldInclude('projects') && this._projectService && this._authService) {
            tasks.push((async (): Promise<SectionResult | null> => {
                try {
                    const repoInfo = await this._getRepoInfo();
                    if (!repoInfo) {return null;}
                    const projects = await this._projectService!.listRepositoryProjects(
                        repoInfo.owner, repoInfo.repo,
                    );
                    if (projects.length === 0) {
                        return { key: 'projects', order: 3, text: '## Projects\nNo projects found.' };
                    }
                    const projSections: string[] = [];
                    for (const p of projects.slice(0, 5)) {
                        const projParts: string[] = [];
                        // Fetch full project details (views, fields, description)
                        let fullProject: import('./projectService').Project | undefined;
                        try {
                            fullProject = await this._projectService!.getProject(
                                repoInfo.owner, p.number,
                            );
                        } catch { /* ok — fall back to lightweight data */ }

                        if (fullProject) {
                            projParts.push(
                                `### ${fullProject.title}${fullProject.shortDescription ? ` — ${fullProject.shortDescription}` : ''}`,
                                `- **Status**: ${fullProject.closed ? 'Closed' : 'Open'} | **Visibility**: ${fullProject.public ? 'Public' : 'Private'} | **Total items**: ${fullProject.totalItemCount}`,
                            );
                            if (fullProject.views.length > 0) {
                                projParts.push(`- **Views**: ${fullProject.views.map((v) => `${v.name} (${v.layout})`).join(', ')}`);
                            }
                            if (fullProject.fields.length > 0) {
                                const customFields = fullProject.fields.filter((f) =>
                                    !['Title', 'Assignees', 'Labels', 'Milestone', 'Repository', 'Linked pull requests', 'Reviewers', 'Tracks', 'Tracked by'].includes(f.name),
                                );
                                if (customFields.length > 0) {
                                    projParts.push(`- **Custom fields**: ${customFields.map((f) => {
                                        if (f.options && f.options.length > 0) {
                                            return `${f.name} (${f.dataType}: ${f.options.map((o) => o.name).join('/')})`;
                                        }
                                        return `${f.name} (${f.dataType})`;
                                    }).join(', ')}`);
                                }
                            }
                        } else {
                            projParts.push(
                                `### ${p.title}`,
                                `- **Status**: ${p.closed ? 'Closed' : 'Open'}`,
                            );
                        }
                        try {
                            const itemResult = await this._projectService!.listProjectItems(p.id);
                            const activeItems = itemResult.items.filter((item) => !item.isArchived);
                            if (!fullProject) {
                                projParts[1] += ` | **Items**: ${activeItems.length}${activeItems.length < itemResult.items.length ? ` (${itemResult.items.length - activeItems.length} archived)` : ''}`;
                            }
                            // Group items by status field value
                            const statusGroups: Record<string, string[]> = {};
                            for (const item of activeItems.slice(0, 30)) {
                                const statusFv = item.fieldValues.find((fv) => fv.fieldName === 'Status');
                                const status = statusFv?.singleSelectOptionName ?? 'No Status';
                                const title = item.content?.title ?? '(untitled)';
                                const typeTag = item.type === 'PULL_REQUEST' ? ' [PR]' : item.type === 'DRAFT_ISSUE' ? ' [Draft]' : '';
                                const num = item.content?.number ? `#${item.content.number}` : '';
                                const assigneeFv = item.fieldValues.find((fv) => fv.fieldName === 'Assignees');
                                const assigneeStr = assigneeFv?.users && assigneeFv.users.length > 0
                                    ? ` (${assigneeFv.users.map((u) => u.login).join(', ')})`
                                    : '';
                                if (!statusGroups[status]) { statusGroups[status] = []; }
                                statusGroups[status].push(`  - ${num} ${title}${typeTag}${assigneeStr}`);
                            }
                            for (const [status, items] of Object.entries(statusGroups)) {
                                projParts.push(`\n**${status}** (${items.length})`);
                                projParts.push(...items);
                            }
                            if (activeItems.length > 30) {
                                projParts.push(`\n…and ${activeItems.length - 30} more items.`);
                            }
                        } catch {
                            projParts.push('- Unable to load items');
                        }
                        projSections.push(projParts.join('\n'));
                    }
                    return { key: 'projects', order: 3, text: `## Projects (${projects.length})\n${projSections.join('\n\n')}` };
                } catch {
                    return { key: 'projects', order: 3, text: '## Projects\nUnable to fetch project data.' };
                }
            })());
        }

        // ─── Notes ───────────────────────────────────────────
        if (shouldInclude('notes') && this._gistService && this._authService) {
            tasks.push((async (): Promise<SectionResult | null> => {
                try {
                    const isAuth = await this._authService!.isAuthenticated();
                    if (!isAuth) {return null;}
                    const notes = await this._gistService!.listNotes();
                    if (notes.length === 0) {
                        return { key: 'notes', order: 4, text: '## Notes\nNo notes found.' };
                    }
                    const filteredNotes = includeSecretGists
                        ? notes
                        : notes.filter((n) => n.isPublic);
                    if (filteredNotes.length === 0) {
                        return { key: 'notes', order: 4, text: '## Notes\nNo public notes found. Enable "Include Secret Gists" in settings to include secret notes.' };
                    }
                    const noteLines: string[] = [];
                    for (const n of filteredNotes.slice(0, 10)) {
                        try {
                            const full = await this._gistService!.getNote(n.id);
                            const content = full.content.trim();
                            const preview = content.length > 500
                                ? content.slice(0, 500) + '…'
                                : content;
                            noteLines.push(
                                `### "${full.title}" (${full.isPublic ? 'public' : 'secret'})\n${preview}`,
                            );
                        } catch {
                            noteLines.push(
                                `### "${n.title}" (${n.isPublic ? 'public' : 'secret'})\nUnable to load content.`,
                            );
                        }
                    }
                    if (filteredNotes.length > 10) {
                        noteLines.push(`…and ${filteredNotes.length - 10} more notes.`);
                    }
                    const secretNote = includeSecretGists ? '' : ' (public only)';
                    return { key: 'notes', order: 4, text: `## Notes (${filteredNotes.length})${secretNote}\n${noteLines.join('\n\n')}` };
                } catch {
                    return { key: 'notes', order: 4, text: '## Notes\nUnable to fetch notes.' };
                }
            })());
        }

        // ─── Mattermost ─────────────────────────────────────
        if (shouldInclude('mattermost') && this._mattermostService) {
            tasks.push((async (): Promise<SectionResult> => {
                try {
                    const configured = await this._mattermostService!.isConfigured();
                    if (!configured) {
                        return { key: 'mattermost', order: 5, text: '## Mattermost\nNot configured.' };
                    }
                    const teams = await this._mattermostService!.getMyTeams();
                    const teamNames = teams.map((t) => t.displayName).join(', ');
                    const mmLines: string[] = [`Connected to teams: ${teamNames}`];

                    if (teams.length > 0) {
                        try {
                            const channels = await this._mattermostService!.getMyChannels(teams[0].id);
                            const eligibleChannels = includePrivateMessages
                                ? channels
                                : channels.filter((c) => c.type === 'O' || c.type === 'P');
                            const activeChannels = eligibleChannels
                                .filter((c) => c.lastPostAt > 0)
                                .sort((a, b) => b.lastPostAt - a.lastPostAt)
                                .slice(0, 8);

                            const channelTypeName = (t: string) => {
                                switch (t) {
                                    case 'O': return 'public';
                                    case 'P': return 'private';
                                    case 'D': return 'DM';
                                    case 'G': return 'group DM';
                                    default: return t;
                                }
                            };
                            mmLines.push(`\n${channels.length} channels total, showing ${activeChannels.length} most active:`);

                            for (const ch of activeChannels) {
                                try {
                                    const posts = await this._mattermostService!.getChannelPosts(
                                        ch.id, 0, 35,
                                    );
                                    if (posts.length > 0) {
                                        // Resolve usernames for posts
                                        const userMap = await this._mattermostService!.resolveUsernames(posts);
                                        const postLines = posts.map((p) => {
                                            const time = new Date(p.createAt).toLocaleString();
                                            const author = userMap.get(p.userId) ?? p.userId;
                                            const msg = p.message.length > 750
                                                ? p.message.slice(0, 750) + '…'
                                                : p.message;
                                            const threadTag = p.rootId ? ' (reply)' : '';
                                            const pinTag = p.isPinned ? ' 📌' : '';
                                            return `  - [${time}] @${author}: ${msg}${threadTag}${pinTag}`;
                                        });
                                        mmLines.push(`\n### #${ch.displayName} (${channelTypeName(ch.type)})\n${postLines.join('\n')}`);
                                    } else {
                                        mmLines.push(`\n### #${ch.displayName} (${channelTypeName(ch.type)})\nNo recent posts.`);
                                    }
                                } catch {
                                    mmLines.push(`\n### #${ch.displayName}\nUnable to load posts.`);
                                }
                            }
                        } catch { /* ok */ }
                    }
                    return { key: 'mattermost', order: 5, text: `## Mattermost\n${mmLines.join('\n')}` };
                } catch {
                    return { key: 'mattermost', order: 5, text: '## Mattermost\nUnable to fetch Mattermost data.' };
                }
            })());
        }

        // ─── Google Drive ────────────────────────────────────
        if (shouldInclude('drive') && this._driveService) {
            tasks.push((async (): Promise<SectionResult> => {
                try {
                    const isGoogleAuth = await this._driveService!.isAuthenticated();
                    if (!isGoogleAuth) {
                        return { key: 'drive', order: 6, text: '## Google Drive\nNot signed in.' };
                    }
                    const driveLines: string[] = [];

                    const formatDriveFile = (f: { name: string; mimeType: string; modifiedTime: string; size?: string; shared: boolean; owners?: { displayName: string }[] }) => {
                        const modified = new Date(f.modifiedTime).toLocaleDateString();
                        const typeLabel = f.mimeType.split('.').pop() ?? f.mimeType;
                        const sizeStr = f.size ? `, ${(parseInt(f.size, 10) / 1024).toFixed(0)} KB` : '';
                        const sharedStr = f.shared ? ', shared' : '';
                        const ownerStr = f.owners && f.owners.length > 0
                            ? `, owner: ${f.owners[0].displayName}`
                            : '';
                        return `- "${f.name}" (${typeLabel}${sizeStr}, modified ${modified}${sharedStr}${ownerStr})`;
                    };

                    try {
                        const recent = await this._driveService!.getRecentFiles(20);
                        if (recent.files.length > 0) {
                            driveLines.push('### Recent Files');
                            for (const f of recent.files) {
                                driveLines.push(formatDriveFile(f));
                            }
                        }
                    } catch { /* ok */ }

                    try {
                        const starred = await this._driveService!.getStarredFiles(15);
                        if (starred.files.length > 0) {
                            driveLines.push('### Starred/Pinned Files');
                            for (const f of starred.files) {
                                driveLines.push(formatDriveFile(f));
                            }
                        }
                    } catch { /* ok */ }

                    if (driveLines.length > 0) {
                        return { key: 'drive', order: 6, text: `## Google Drive\n${driveLines.join('\n')}` };
                    }
                    return { key: 'drive', order: 6, text: '## Google Drive\nConnected but no recent or starred files.' };
                } catch {
                    return { key: 'drive', order: 6, text: '## Google Drive\nUnable to fetch Drive data.' };
                }
            })());
        }

        // ─── Google Calendar ─────────────────────────────────
        if (shouldInclude('calendar') && this._calendarService) {
            tasks.push((async (): Promise<SectionResult> => {
                try {
                    const isGoogleAuth = await this._calendarService!.isAuthenticated();
                    if (!isGoogleAuth) {
                        return { key: 'calendar', order: 7, text: '## Google Calendar\nNot signed in.' };
                    }
                    const calLines: string[] = [];
                    const now = new Date();
                    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                    const timeMin = now.toISOString();
                    const timeMax = weekFromNow.toISOString();

                    try {
                        const calendars = await this._calendarService!.listCalendars();
                        calLines.push(`${calendars.length} calendar(s) connected`);

                        let totalEvents = 0;
                        for (const cal of calendars.slice(0, 5)) {
                            try {
                                const eventsResp = await this._calendarService!.listEvents(
                                    cal.id, timeMin, timeMax, 20,
                                );
                                const items = eventsResp.items ?? [];
                                totalEvents += items.length;
                                if (items.length > 0) {
                                    calLines.push(`\n### ${cal.summary}`);
                                    for (const ev of items) {
                                        const start = ev.start.dateTime
                                            ? new Date(ev.start.dateTime).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                                            : ev.start.date ?? '';
                                        const allDay = !ev.start.dateTime && !!ev.start.date;
                                        const timeStr = allDay ? `${start} (all day)` : start;
                                        const summary = ev.summary ?? '(No title)';
                                        const location = ev.location ? ` @ ${ev.location}` : '';
                                        const extras: string[] = [];
                                        // Attendees
                                        if (ev.attendees && ev.attendees.length > 0) {
                                            const attendeeNames = ev.attendees.slice(0, 8).map((a) =>
                                                a.displayName ?? a.email,
                                            );
                                            const attendeeStr = ev.attendees.length > 8
                                                ? `${attendeeNames.join(', ')} +${ev.attendees.length - 8} more`
                                                : attendeeNames.join(', ');
                                            extras.push(`  - Attendees: ${attendeeStr}`);
                                        }
                                        // Conference link
                                        if (ev.hangoutLink) {
                                            extras.push(`  - Meet: ${ev.hangoutLink}`);
                                        } else if (ev.conferenceData?.entryPoints?.[0]) {
                                            extras.push(`  - Conference: ${ev.conferenceData.entryPoints[0].uri}`);
                                        }
                                        // Status
                                        if (ev.status && ev.status !== 'confirmed') {
                                            extras.push(`  - Status: ${ev.status}`);
                                        }
                                        // Description snippet
                                        if (ev.description) {
                                            const descPreview = ev.description.length > 200
                                                ? ev.description.slice(0, 200) + '…'
                                                : ev.description;
                                            extras.push(`  - Description: ${descPreview}`);
                                        }
                                        calLines.push(`- ${timeStr}: "${summary}"${location}`);
                                        if (extras.length > 0) {
                                            calLines.push(...extras);
                                        }
                                    }
                                }
                            } catch { /* ok — skip individual calendar errors */ }
                        }

                        if (totalEvents === 0) {
                            calLines.push('No upcoming events in the next 7 days.');
                        }
                    } catch {
                        calLines.push('Unable to list calendars.');
                    }

                    return { key: 'calendar', order: 7, text: `## Google Calendar (next 7 days)\n${calLines.join('\n')}` };
                } catch {
                    return { key: 'calendar', order: 7, text: '## Google Calendar\nUnable to fetch calendar data.' };
                }
            })());
        }

        // ─── Wiki ────────────────────────────────────────────
        if (shouldInclude('wiki') && this._wikiService && this._authService) {
            tasks.push((async (): Promise<SectionResult | null> => {
                try {
                    const repoInfo = await this._getRepoInfo();
                    if (!repoInfo) {return null;}
                    const hasWiki = await this._wikiService!.hasWiki(repoInfo.owner, repoInfo.repo);
                    if (!hasWiki) {
                        return { key: 'wiki', order: 8, text: '## Wiki\nNo wiki found for this repository.' };
                    }
                    const pages = await this._wikiService!.listPages(repoInfo.owner, repoInfo.repo);
                    if (pages.length === 0) {
                        return { key: 'wiki', order: 8, text: '## Wiki\nWiki exists but has no pages.' };
                    }
                    const wikiLines: string[] = [];
                    // Fetch content from the most important pages
                    const homePage = pages.find((p) => p.title === 'Home');
                    const contentPages = homePage
                        ? [homePage, ...pages.filter((p) => p.title !== 'Home').slice(0, 9)]
                        : pages.slice(0, 10);
                    for (const page of contentPages) {
                        try {
                            const content = await this._wikiService!.getPageContent(
                                repoInfo.owner, repoInfo.repo, page.filename,
                            );
                            const preview = content.content.length > 800
                                ? content.content.slice(0, 800) + '…'
                                : content.content;
                            wikiLines.push(`### ${page.title}\n${preview}`);
                        } catch {
                            wikiLines.push(`### ${page.title}\nUnable to load content.`);
                        }
                    }
                    const remainingPages = pages.length - contentPages.length;
                    if (remainingPages > 0) {
                        const remaining = pages.slice(contentPages.length);
                        wikiLines.push('\n### Other Pages');
                        for (const p of remaining.slice(0, 20)) {
                            wikiLines.push(`- ${p.title}`);
                        }
                        if (remaining.length > 20) {
                            wikiLines.push(`…and ${remaining.length - 20} more pages.`);
                        }
                    }
                    return { key: 'wiki', order: 8, text: `## Wiki (${pages.length} pages)\n${wikiLines.join('\n')}` };
                } catch {
                    return { key: 'wiki', order: 8, text: '## Wiki\nUnable to fetch wiki data.' };
                }
            })());
        }

        // Wait for all tasks to settle, then assemble in stable order
        const results = await Promise.allSettled(tasks);
        const sections: string[] = [];
        const resolved: SectionResult[] = [];
        for (const r of results) {
            if (r.status === 'fulfilled' && r.value) {
                resolved.push(r.value);
            }
        }
        resolved.sort((a, b) => a.order - b.order);
        for (const s of resolved) {
            sections.push(s.text);
        }

        return sections.join('\n\n');
    }

    /** Send current auth status to the webview. */
    private async _sendAuthStatus(): Promise<void> {
        if (!this._authService) {
            this._outputChannel.appendLine('[Auth] Skipped: authService not available');
            return;
        }
        try {
            const isAuth = await this._authService.isAuthenticated();
            const session = isAuth ? await this._authService.getSession() : null;
            this._outputChannel.appendLine(`[Auth] authenticated=${isAuth}, user=${session?.account.label ?? '(none)'}`);
            this._panel.webview.postMessage({
                type: 'authStatus',
                authenticated: isAuth,
                username: session?.account.label ?? null,
            });
        } catch {
            this._panel.webview.postMessage({
                type: 'authStatus',
                authenticated: false,
                username: null,
            });
        }
    }

    /** Refresh wiki pages for the current repo and send to webview. */
    private async _refreshWiki(): Promise<void> {
        if (!this._wikiService || !this._authService) {
            this._outputChannel.appendLine('[Wiki] Skipped: service not available');
            return;
        }
        try {
            const isAuth = await this._authService.isAuthenticated();
            if (!isAuth) {
                this._outputChannel.appendLine('[Wiki] Not authenticated, sending authRequired');
                // Let the webview know auth is needed so it can show the sign-in prompt
                this._panel.webview.postMessage({ type: 'wikiAuthRequired' });
                return;
            }

            const repoInfo = await this._getRepoInfo();
            if (!repoInfo) {
                this._outputChannel.appendLine('[Wiki] No repo info available');
                this._panel.webview.postMessage({ type: 'wikiError', message: 'No GitHub repository detected. Open a repo or use the repo switcher.' });
                return;
            }

            this._outputChannel.appendLine(`[Wiki] Checking wiki for ${repoInfo.owner}/${repoInfo.repo}`);
            this._panel.webview.postMessage({ type: 'wikiLoading' });

            const hasWiki = await this._wikiService.hasWiki(repoInfo.owner, repoInfo.repo);
            if (!hasWiki) {
                this._outputChannel.appendLine('[Wiki] No wiki found');
                this._panel.webview.postMessage({ type: 'wikiNoWiki' });
                return;
            }

            const pages = await this._wikiService.listPages(repoInfo.owner, repoInfo.repo);
            this._outputChannel.appendLine(`[Wiki] Loaded ${pages.length} pages`);
            this._panel.webview.postMessage({
                type: 'wikiPages',
                pages: pages.map(WikiService.toSummaryData),
            });
        } catch (e: unknown) {
            const m = extractErrorMessage(e);
            this._outputChannel.appendLine(`[Wiki] Error refreshing: ${m}`);
            this._panel.webview.postMessage({ type: 'wikiError', message: m });
        }
    }

    /** Send Google Drive authentication status to the webview */
    private async _sendDriveAuthStatus(): Promise<void> {
        if (!this._driveService) {
            return;
        }
        try {
            const isAuth = await this._driveService.isAuthenticated();
            let email: string | null = null;
            if (isAuth) {
                const session = await vscode.authentication.getSession('superprompt-forge-google', [], { createIfNone: false });
                email = session?.account?.label ?? null;
            }
            this._panel.webview.postMessage({
                type: 'driveAuth',
                authenticated: isAuth,
                email,
            });
        } catch {
            this._panel.webview.postMessage({
                type: 'driveAuth',
                authenticated: false,
                email: null,
            });
        }
    }

    private async _sendCalendarAuthStatus(): Promise<void> {
        if (!this._calendarService) {
            return;
        }
        try {
            const isAuth = await this._calendarService.isAuthenticated();
            let email: string | null = null;
            if (isAuth) {
                const session = await vscode.authentication.getSession('superprompt-forge-google', [], { createIfNone: false });
                email = session?.account?.label ?? null;
            }
            this._panel.webview.postMessage({
                type: 'calendarAuth',
                authenticated: isAuth,
                email,
            });
        } catch {
            this._panel.webview.postMessage({
                type: 'calendarAuth',
                authenticated: false,
                email: null,
            });
        }
    }

    /** Fetch notes from GistService and send to webview. */
    private async _refreshNotes(): Promise<void> {
        if (!this._gistService || !this._authService) {
            this._outputChannel.appendLine('[Notes] Skipped: service not available');
            return;
        }
        try {
            const isAuth = await this._authService.isAuthenticated();
            if (!isAuth) {
                this._outputChannel.appendLine('[Notes] Skipped: not authenticated');
                return;
            }

            // Send current repo context for workspace filtering
            const repoInfo = await this._getRepoInfo();
            const repoSlug = repoInfo ? `${repoInfo.owner}/${repoInfo.repo}` : null;
            this._panel.webview.postMessage({ type: 'notesCurrentRepo', repo: repoSlug });

            this._panel.webview.postMessage({ type: 'notesLoading' });
            const notes = await this._gistService.listNotes();
            this._outputChannel.appendLine(`[Notes] Loaded ${notes.length} notes`);
            const payload = notes.map((n) => GistService.toData(n));
            this._panel.webview.postMessage({ type: 'notesData', payload });
        } catch (e: unknown) {
            const m = extractErrorMessage(e);
            this._outputChannel.appendLine(`[Notes] Error: ${m}`);
            this._panel.webview.postMessage({ type: 'notesError', message: m });
        }
    }

    /** Fetch PRs from PrService and send to webview. */
    private async _refreshPRs(state?: 'open' | 'closed' | 'merged' | 'all', authorFilter?: 'all' | 'authored' | 'assigned' | 'review-requested'): Promise<void> {
        if (!this._prService || !this._authService) {
            this._outputChannel.appendLine('[PRs] Skipped: service not available');
            return;
        }
        try {
            const isAuth = await this._authService.isAuthenticated();
            if (!isAuth) {
                this._outputChannel.appendLine('[PRs] Skipped: not authenticated');
                return;
            }

            const repoInfo = await this._getRepoInfo();
            if (!repoInfo) {
                this._outputChannel.appendLine('[PRs] No repo info — sending prRepoNotFound');
                this._panel.webview.postMessage({ type: 'prRepoNotFound' });
                return;
            }

            this._outputChannel.appendLine(`[PRs] Fetching PRs for ${repoInfo.owner}/${repoInfo.repo} (state=${state ?? 'open'})`);
            this._panel.webview.postMessage({ type: 'prsLoading' });

            let username: string | undefined;
            try {
                username = await this._prService.getAuthenticatedUser();
            } catch {
                /* fallback: no author filter */
            }

            const prs = await this._prService.listPullRequests(
                repoInfo.owner,
                repoInfo.repo,
                state ?? 'open',
                username,
                authorFilter ?? 'all',
            );
            this._outputChannel.appendLine(`[PRs] Loaded ${prs.length} PRs`);
            const payload = prs.map((pr) => PrService.toData(pr));
            this._panel.webview.postMessage({ type: 'prsData', payload });
        } catch (e: unknown) {
            const m = extractErrorMessage(e);
            this._outputChannel.appendLine(`[PRs] Error: ${m}`);
            this._panel.webview.postMessage({ type: 'prError', message: m });
        }
    }

    /** Fetch comments for a specific PR and send to webview. */
    private async _sendPRComments(prNumber: number): Promise<void> {
        if (!this._prService) {
            return;
        }
        try {
            const repoInfo = await this._getRepoInfo();
            if (!repoInfo) {
                return;
            }

            this._panel.webview.postMessage({ type: 'prCommentsLoading', prNumber });

            // Get the full PR detail, comments (with thread data), AND reviews in parallel
            const [pr, comments, reviews] = await Promise.all([
                this._prService.getPullRequest(repoInfo.owner, repoInfo.repo, prNumber),
                this._prService.getCommentsWithThreads(repoInfo.owner, repoInfo.repo, prNumber),
                this._prService.getReviews(repoInfo.owner, repoInfo.repo, prNumber),
            ]);

            // Authenticate GitHub image URLs in body and comments
            const token = await this._authService?.getToken();
            const prData = PrService.toData(pr);
            if (token) {
                prData.body = await authenticateGitHubImageUrls(prData.body, token, this._outputChannel);
            }

            const commentData = comments.map((c) => PrService.toCommentData(c));
            if (token) {
                for (const c of commentData) {
                    c.body = await authenticateGitHubImageUrls(c.body, token, this._outputChannel);
                }
            }

            this._panel.webview.postMessage({
                type: 'prComments',
                prNumber,
                prDetail: prData,
                comments: commentData,
            });

            // Send reviews so the conversation tab shows approval status immediately
            this._panel.webview.postMessage({
                type: 'prReviews',
                reviews: reviews.map(PrService.toReviewData),
            });
        } catch (e: unknown) {
            const m = extractErrorMessage(e);
            this._panel.webview.postMessage({ type: 'prError', message: m });
        }
    }

    /** Fetch issues from IssueService and send to webview. */
    private async _refreshIssues(state?: 'open' | 'closed' | 'all'): Promise<void> {
        if (!this._issueService || !this._authService) {
            this._outputChannel.appendLine('[Issues] Skipped: service not available');
            return;
        }
        try {
            const isAuth = await this._authService.isAuthenticated();
            if (!isAuth) {
                this._outputChannel.appendLine('[Issues] Skipped: not authenticated');
                return;
            }

            const repoInfo = await this._getRepoInfo();
            if (!repoInfo) {
                this._outputChannel.appendLine('[Issues] No repo info — sending issueRepoNotFound');
                this._panel.webview.postMessage({ type: 'issueRepoNotFound' });
                return;
            }

            this._outputChannel.appendLine(`[Issues] Fetching issues for ${repoInfo.owner}/${repoInfo.repo} (state=${state ?? 'open'})`);
            this._panel.webview.postMessage({ type: 'issuesLoading' });

            const issues = await this._issueService.listIssues(
                repoInfo.owner,
                repoInfo.repo,
                state ?? 'open',
            );
            this._outputChannel.appendLine(`[Issues] Loaded ${issues.length} issues`);
            const payload = issues.map((i) => IssueService.toData(i));
            this._panel.webview.postMessage({ type: 'issuesData', payload });
        } catch (e: unknown) {
            const m = extractErrorMessage(e);
            this._outputChannel.appendLine(`[Issues] Error: ${m}`);
            this._panel.webview.postMessage({ type: 'issueError', message: m });
        }
    }

    /** Fetch comments for a specific issue and send to webview. */
    private async _sendIssueComments(issueNumber: number): Promise<void> {
        if (!this._issueService) {
            return;
        }
        try {
            const repoInfo = await this._getRepoInfo();
            if (!repoInfo) {
                return;
            }

            this._panel.webview.postMessage({ type: 'issueCommentsLoading', issueNumber });

            const [issue, comments] = await Promise.all([
                this._issueService.getIssue(repoInfo.owner, repoInfo.repo, issueNumber),
                this._issueService.getComments(repoInfo.owner, repoInfo.repo, issueNumber),
            ]);

            // Authenticate GitHub image URLs in body and comments
            const token = await this._authService?.getToken();
            const issueData = IssueService.toData(issue);
            if (token) {
                issueData.body = await authenticateGitHubImageUrls(issueData.body, token, this._outputChannel);
            }

            const commentData = comments.map((c) => IssueService.toCommentData(c));
            if (token) {
                for (const c of commentData) {
                    c.body = await authenticateGitHubImageUrls(c.body, token, this._outputChannel);
                }
            }

            this._panel.webview.postMessage({
                type: 'issueComments',
                issueNumber,
                issueDetail: issueData,
                comments: commentData,
            });
        } catch (e: unknown) {
            const m = extractErrorMessage(e);
            this._panel.webview.postMessage({ type: 'issueError', message: m });
        }
    }

    /** Discover projects for the current repo and load the first one. */
    private async _refreshProjects(): Promise<void> {
        if (!this._projectService || !this._authService) {
            this._outputChannel.appendLine('[Projects] Skipped: service not available');
            return;
        }
        try {
            const isAuth = await this._authService.isAuthenticated();
            if (!isAuth) {
                this._outputChannel.appendLine('[Projects] Skipped: not authenticated');
                return;
            }

            const repoInfo = await this._getRepoInfo();
            if (!repoInfo) {
                this._outputChannel.appendLine('[Projects] No repo info — sending projectsRepoNotFound');
                this._panel.webview.postMessage({ type: 'projectsRepoNotFound' });
                return;
            }

            this._panel.webview.postMessage({ type: 'projectsLoading' });

            // Discover projects linked to this repo
            const projects = await this._projectService.listRepositoryProjects(
                repoInfo.owner,
                repoInfo.repo,
            );
            this._panel.webview.postMessage({ type: 'projectsAvailable', payload: projects });

            if (projects.length === 0) {
                this._panel.webview.postMessage({ type: 'projectItemsData', payload: [] });
                return;
            }

            // Auto-select first open project
            const firstOpen = projects.find((p) => !p.closed) ?? projects[0];
            const project = await this._projectService.getProjectById(firstOpen.id);
            const projectData = ProjectService.toData(project);
            this._panel.webview.postMessage({ type: 'projectData', payload: projectData });

            // Load items
            const result = await this._projectService.listProjectItems(project.id);
            const items = result.items.map((i) => ProjectService.toItemData(i));
            this._panel.webview.postMessage({ type: 'projectItemsData', payload: items });
        } catch (e: unknown) {
            const m = extractErrorMessage(e);
            this._panel.webview.postMessage({ type: 'projectError', message: m });
        }
    }

    /** Refresh items for a specific project (e.g. after mutation). */
    private async _refreshProjectItems(projectId: string): Promise<void> {
        if (!this._projectService) {
            return;
        }
        try {
            this._panel.webview.postMessage({ type: 'projectsItemsLoading' });
            const result = await this._projectService.listProjectItems(projectId);
            const items = result.items.map((i) => ProjectService.toItemData(i));
            this._panel.webview.postMessage({ type: 'projectItemsData', payload: items });
        } catch (e: unknown) {
            const m = extractErrorMessage(e);
            this._panel.webview.postMessage({ type: 'projectError', message: m });
        }
    }

    /** Send Mattermost config status and teams to webview. */
    private async _refreshMattermost(): Promise<void> {
        if (!this._mattermostService) {
            return;
        }
        try {
            const configured = await this._mattermostService.isConfigured();
            this._panel.webview.postMessage({ type: 'mattermostConfigured', configured });

            if (!configured) {
                // Disconnect WebSocket if signing out or not configured
                this._mmWebSocket?.disconnect();
                this._mmWebSocket = undefined;
                return;
            }

            // Send current user info
            const me = await this._mattermostService.getMe();
            this._panel.webview.postMessage({
                type: 'mattermostUser',
                user: MattermostService.toUserData(me),
            });

            // Send teams
            const teams = await this._mattermostService.getMyTeams();
            const teamsPayload = teams.map((t) => MattermostService.toTeamData(t));
            this._panel.webview.postMessage({ type: 'mattermostTeams', payload: teamsPayload });

            // Auto-select first team and load its channels (including DMs)
            if (teams.length > 0) {
                const firstTeamId = teams[0].id;
                const { channels, dmChannels, groupChannels } = await this._mattermostService.getAllMyChannels(firstTeamId);
                const channelsPayload = channels.map((c) => MattermostService.toChannelData(c));

                // Resolve DM display names and other-user IDs
                const myUserId = me.id;
                const dmPayload = await this._resolveDmChannelPayloads(
                    [...dmChannels, ...groupChannels],
                    myUserId,
                );
                this._panel.webview.postMessage({
                    type: 'mattermostChannels',
                    payload: channelsPayload,
                    teamId: firstTeamId,
                });
                this._panel.webview.postMessage({
                    type: 'mattermostDmChannels',
                    payload: dmPayload,
                    teamId: firstTeamId,
                });

                // Fetch bulk unreads for all channels (non-blocking)
                const allChannelIds = [
                    ...channels.map((c) => c.id),
                    ...dmChannels.map((c) => c.id),
                    ...groupChannels.map((c) => c.id),
                ];
                this._fetchBulkUnreads(allChannelIds).catch(() => { /* ignore */ });
            }

            // Connect WebSocket for real-time events
            await this._connectMattermostWebSocket();
        } catch (e: unknown) {
            const m = extractErrorMessage(e);
            this._panel.webview.postMessage({ type: 'mattermostError', message: m });
        }
    }

    /** Resolve DM display names and other-user IDs for a list of DM/group channels. */
    private async _resolveDmChannelPayloads(
        dmChannels: MattermostChannel[],
        myUserId: string,
    ): Promise<MattermostChannelData[]> {
        if (!this._mattermostService) { return []; }
        const results: MattermostChannelData[] = [];
        for (const c of dmChannels) {
            if (c.type === 'D') {
                const otherUserId = this._mattermostService.getDmOtherUserId(c, myUserId);
                const displayName = await this._mattermostService.resolveDmDisplayName(c, myUserId);
                const data = MattermostService.toChannelData(
                    { ...c, displayName },
                    otherUserId,
                );
                results.push(data);
            } else {
                results.push(MattermostService.toChannelData(c));
            }
        }
        return results;
    }

    /** Fetch unreads for all channel IDs and send as bulk to webview. */
    private async _fetchBulkUnreads(channelIds: string[]): Promise<void> {
        if (!this._mattermostService || channelIds.length === 0) { return; }
        const bulkUnreads: Array<{ channelId: string; msgCount: number; mentionCount: number }> = [];
        // Fetch in parallel batches to avoid overwhelming the server
        const batchSize = 10;
        for (let i = 0; i < channelIds.length; i += batchSize) {
            const batch = channelIds.slice(i, i + batchSize);
            const results = await Promise.allSettled(
                batch.map((id) => this._mattermostService!.getChannelUnread(id)),
            );
            for (const r of results) {
                if (r.status === 'fulfilled') {
                    bulkUnreads.push(MattermostService.toChannelUnreadData(r.value));
                }
            }
        }
        if (bulkUnreads.length > 0) {
            this._panel.webview.postMessage({
                type: 'mattermostBulkUnreads',
                payload: bulkUnreads,
            });
        }
    }

    /** Establish or re-establish the Mattermost WebSocket connection and wire events to webview. */
    private async _connectMattermostWebSocket(): Promise<void> {
        if (!this._mattermostService) { return; }

        // Tear down previous WebSocket if any
        if (this._mmWebSocket) {
            this._mmWebSocket.disconnect();
            this._mmWebSocket.dispose();
            this._mmWebSocket = undefined;
        }

        const serverUrl = await this._mattermostService.getServerUrl();
        const token = await this._mattermostService.getToken();
        if (!serverUrl || !token) { return; }

        const ws = new MattermostWebSocket(this._outputChannel);
        this._mmWebSocket = ws;

        // Connection status → webview banner
        ws.onConnectionChange((connected) => {
            this._panel.webview.postMessage({
                type: 'mattermostConnectionStatus',
                connected,
                reconnectAttempt: connected ? 0 : ws.reconnectAttempts,
            });
        });

        // New post → relay to webview
        ws.onPosted(async (evt) => {
            if (!this._mattermostService) { return; }
            try {
                const data = evt.data as unknown as MmWsPostedData;
                const rawPost = JSON.parse(data.post) as {
                    id: string; channel_id: string; user_id: string; message: string;
                    create_at: number; update_at: number; delete_at: number;
                    root_id: string; type: string; props: Record<string, unknown>;
                    is_pinned?: boolean;
                    file_ids?: string[];
                };
                const username = data.sender_name?.replace(/^@/, '') ??
                    await this._mattermostService.resolveUsername(rawPost.user_id);

                const postData: MattermostPostData = {
                    id: rawPost.id,
                    channelId: rawPost.channel_id,
                    userId: rawPost.user_id,
                    username,
                    message: rawPost.message,
                    createAt: new Date(rawPost.create_at).toISOString(),
                    updateAt: new Date(rawPost.update_at).toISOString(),
                    rootId: rawPost.root_id,
                    type: rawPost.type,
                    isPinned: rawPost.is_pinned ?? false,
                };

                // Send the post to webview immediately (no waiting for file resolution)
                this._panel.webview.postMessage({ type: 'mattermostNewPost', post: postData });

                // Also tell webview to increment unread for non-active channels
                this._panel.webview.postMessage({
                    type: 'mattermostNewPostUnread',
                    channelId: rawPost.channel_id,
                });

                // Resolve file attachments asynchronously and send an update if present
                if (rawPost.file_ids && rawPost.file_ids.length > 0) {
                    try {
                        const files = await this._mattermostService.resolveFileInfos(rawPost.file_ids);
                        if (files && files.length > 0) {
                            this._panel.webview.postMessage({
                                type: 'mattermostPostEdited',
                                post: { ...postData, files },
                            });
                        }
                    } catch { /* ignore file resolution failures */ }
                }

                // Desktop notification: check if message mentions the current user
                try {
                    const me = await this._mattermostService.getMe();
                    const mentionPatterns = [
                        `@${me.username}`,
                        '@here',
                        '@channel',
                        '@all',
                    ];
                    const hasMention = mentionPatterns.some((p) =>
                        rawPost.message.toLowerCase().includes(p.toLowerCase()),
                    );
                    if (hasMention && rawPost.user_id !== me.id) {
                        const channelName = data.channel_display_name || 'a channel';
                        vscode.window.showInformationMessage(
                            `💬 @${username} mentioned you in ${channelName}: ${rawPost.message.substring(0, 100)}${rawPost.message.length > 100 ? '…' : ''}`,
                            'Open Channel',
                        ).then((action) => {
                            if (action === 'Open Channel') {
                                this._panel.webview.postMessage({
                                    type: 'openChannel',
                                    channelId: rawPost.channel_id,
                                    channelName: data.channel_display_name,
                                });
                            }
                        });
                    }
                } catch { /* ignore notification errors */ }
            } catch (e) {
                this._outputChannel.appendLine(`[MM WS] Error handling posted event: ${e}`);
            }
        });

        // Post edited → relay
        ws.onPostEdited(async (evt) => {
            if (!this._mattermostService) { return; }
            try {
                const rawStr = evt.data.post as string;
                const rawPost = JSON.parse(rawStr) as {
                    id: string; channel_id: string; user_id: string; message: string;
                    create_at: number; update_at: number; delete_at: number;
                    root_id: string; type: string; props: Record<string, unknown>;
                    is_pinned?: boolean;
                    file_ids?: string[];
                };
                const username = await this._mattermostService.resolveUsername(rawPost.user_id);

                // Resolve file attachments if present
                let files: MattermostFileInfoData[] | undefined;
                if (rawPost.file_ids && rawPost.file_ids.length > 0) {
                    try {
                        files = await this._mattermostService.resolveFileInfos(rawPost.file_ids);
                    } catch { /* ignore */ }
                }

                const postData: MattermostPostData = {
                    id: rawPost.id,
                    channelId: rawPost.channel_id,
                    userId: rawPost.user_id,
                    username,
                    message: rawPost.message,
                    createAt: new Date(rawPost.create_at).toISOString(),
                    updateAt: new Date(rawPost.update_at).toISOString(),
                    rootId: rawPost.root_id,
                    type: rawPost.type,
                    isPinned: rawPost.is_pinned ?? false,
                    files: files && files.length > 0 ? files : undefined,
                };
                this._panel.webview.postMessage({ type: 'mattermostPostEdited', post: postData });
            } catch (e) {
                this._outputChannel.appendLine(`[MM WS] Error handling post_edited event: ${e}`);
            }
        });

        // Post deleted → relay
        ws.onPostDeleted((evt) => {
            try {
                const rawStr = evt.data.post as string;
                const rawPost = JSON.parse(rawStr) as { id: string; channel_id: string };
                this._panel.webview.postMessage({
                    type: 'mattermostPostDeleted',
                    postId: rawPost.id,
                    channelId: rawPost.channel_id,
                });
            } catch (e) {
                this._outputChannel.appendLine(`[MM WS] Error handling post_deleted event: ${e}`);
            }
        });

        // Typing indicator
        ws.onTyping(async (evt) => {
            const data = evt.data as unknown as MmWsTypingData;
            let username = data.user_id;
            try {
                if (this._mattermostService) {
                    username = await this._mattermostService.resolveUsername(data.user_id);
                }
            } catch { /* fallback to userId */ }
            this._panel.webview.postMessage({
                type: 'mattermostTyping',
                userId: data.user_id,
                username,
                channelId: evt.broadcast.channel_id,
                parentId: data.parent_id,
            });
        });

        // User status change (online/away/offline/dnd)
        ws.onStatusChange((evt) => {
            const data = evt.data as unknown as MmWsStatusChangeData;
            this._panel.webview.postMessage({
                type: 'mattermostStatusChange',
                userId: data.user_id,
                status: data.status,
            });
        });

        // Reaction added
        ws.onReactionAdded(async (evt) => {
            if (!this._mattermostService) { return; }
            try {
                const data = evt.data as unknown as MmWsReactionData;
                const raw = JSON.parse(data.reaction) as {
                    user_id: string; post_id: string; emoji_name: string;
                };
                const username = await this._mattermostService.resolveUsername(raw.user_id);
                this._panel.webview.postMessage({
                    type: 'mattermostReactionAdded',
                    reaction: {
                        userId: raw.user_id,
                        postId: raw.post_id,
                        emojiName: raw.emoji_name,
                        username,
                    },
                });
            } catch (e) {
                this._outputChannel.appendLine(`[MM WS] Error handling reaction_added: ${e}`);
            }
        });

        // Reaction removed
        ws.onReactionRemoved(async (evt) => {
            if (!this._mattermostService) { return; }
            try {
                const data = evt.data as unknown as MmWsReactionData;
                const raw = JSON.parse(data.reaction) as {
                    user_id: string; post_id: string; emoji_name: string;
                };
                const username = await this._mattermostService.resolveUsername(raw.user_id);
                this._panel.webview.postMessage({
                    type: 'mattermostReactionRemoved',
                    reaction: {
                        userId: raw.user_id,
                        postId: raw.post_id,
                        emojiName: raw.emoji_name,
                        username,
                    },
                });
            } catch (e) {
                this._outputChannel.appendLine(`[MM WS] Error handling reaction_removed: ${e}`);
            }
        });

        // Channel viewed — clear unread counts when viewed on another client
        ws.onChannelViewed((evt) => {
            const channelId = evt.broadcast.channel_id || (evt.data as Record<string, unknown>).channel_id as string;
            if (channelId) {
                this._panel.webview.postMessage({
                    type: 'mattermostMarkedRead',
                    channelId,
                });
            }
        });

        // Direct/group message channel created — refresh DM list so new DMs appear instantly
        ws.onDirectAdded(async (evt) => {
            if (!this._mattermostService) { return; }
            try {
                const channelId = (evt.data as Record<string, unknown>).channel_id as string
                    ?? evt.broadcast.channel_id;
                if (!channelId) { return; }

                const channel = await this._mattermostService.getChannel(channelId);
                const me = await this._mattermostService.getMe();
                const channelData = MattermostService.toChannelData(channel);

                // For DMs, resolve the other user's display name
                if (channel.type === 'D') {
                    const otherUserId = this._mattermostService.getDmOtherUserId(channel, me.id);
                    const displayName = await this._mattermostService.resolveDmDisplayName(channel, me.id);
                    this._panel.webview.postMessage({
                        type: 'mattermostDmChannelAdded',
                        channel: { ...channelData, displayName, otherUserId },
                    });
                } else {
                    this._panel.webview.postMessage({
                        type: 'mattermostDmChannelAdded',
                        channel: channelData,
                    });
                }
            } catch (e) {
                this._outputChannel.appendLine(`[MM WS] Error handling direct_added: ${e}`);
            }
        });

        // Channel updated — relay metadata changes (header, purpose, etc.)
        ws.onChannelUpdated((evt) => {
            try {
                const rawChannel = evt.data.channel as string;
                if (rawChannel) {
                    const parsed = JSON.parse(rawChannel) as {
                        id: string; team_id: string; name: string; display_name: string;
                        type: string; header: string; purpose: string;
                    };
                    this._panel.webview.postMessage({
                        type: 'mattermostChannelUpdated',
                        channel: {
                            id: parsed.id,
                            teamId: parsed.team_id,
                            name: parsed.name,
                            displayName: parsed.display_name,
                            type: parsed.type,
                            header: parsed.header,
                            purpose: parsed.purpose,
                        },
                    });
                }
            } catch (e) {
                this._outputChannel.appendLine(`[MM WS] Error handling channel_updated: ${e}`);
            }
        });

        // Start the connection
        ws.connect(serverUrl, token);
    }

    /** Build the shell HTML that loads the bundled React app + Tailwind CSS. */
    private _getHtml(): string {
        const webview = this._panel.webview;
        const nonce = _getNonce();

        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js'),
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.css'),
        );

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; img-src https: http: data: ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src https: http:;">
    <link rel="stylesheet" href="${styleUri}">
    <title>Superprompt Forge</title>
</head>
<body>
    <div id="root"></div>
    <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
    }

    private _dispose(): void {
        StashPanel._instance = undefined;

        // Disconnect Mattermost WebSocket
        if (this._mmWebSocket) {
            this._mmWebSocket.disconnect();
            this._mmWebSocket.dispose();
            this._mmWebSocket = undefined;
        }

        this._panel.dispose();
        for (const d of this._disposables) {
            d.dispose();
        }
        this._disposables = [];
    }
}

function _getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 32; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}
