import type * as vscode from 'vscode';
import { type GitService } from '../gitService';
import { type AuthService } from '../authService';
import { type GistService } from '../gistService';
import { type PrService } from '../prService';
import { type IssueService } from '../issueService';
import { type MattermostService } from '../mattermostService';
import { type MattermostWebSocket } from '../mattermostWebSocket';
import { type ProjectService } from '../projectService';
import { type GoogleDriveService } from '../googleDriveService';
import { type GoogleCalendarService } from '../calendarService';
import { type WikiService } from '../wikiService';
import { type AiService } from '../aiService';

// ─── Handler Context ─────────────────────────────────────────────
// Everything a domain handler needs to do its job.  Passed by the
// StashPanel dispatcher so handlers never import the panel class.

export interface HandlerContext {
    /** Post a message to the React webview. */
    postMessage(msg: Record<string, unknown>): void;

    /** Extension-wide output channel for diagnostics. */
    outputChannel: vscode.OutputChannel;

    // ─── Services ─────────────────────────────────────────
    gitService: GitService;
    authService: AuthService | undefined;
    gistService: GistService | undefined;
    prService: PrService | undefined;
    issueService: IssueService | undefined;
    mattermostService: MattermostService | undefined;
    projectService: ProjectService | undefined;
    driveService: GoogleDriveService | undefined;
    calendarService: GoogleCalendarService | undefined;
    wikiService: WikiService | undefined;
    aiService: AiService;

    // ─── Panel helpers ────────────────────────────────────
    /** Resolve the active GitHub repo (user override or auto-detect). */
    getRepoInfo(): Promise<{ owner: string; repo: string } | undefined>;

    /** Refresh stash data and send to webview. */
    refresh(): Promise<void>;

    /** Send current GitHub auth status to webview. */
    sendAuthStatus(): Promise<void>;

    /** Send current repo context + remotes to webview. */
    sendRepoContext(): Promise<void>;

    /** Fetch user repos for the repo switcher dropdown. */
    fetchUserRepos(): Promise<void>;

    // ─── Domain refresh helpers ───────────────────────────
    refreshNotes(): Promise<void>;
    refreshPRs(state?: 'open' | 'closed' | 'merged' | 'all', authorFilter?: 'all' | 'authored' | 'assigned' | 'review-requested'): Promise<void>;
    sendPRComments(prNumber: number): Promise<void>;
    refreshIssues(state?: 'open' | 'closed' | 'all', orgMode?: boolean): Promise<void>;
    sendIssueComments(issueNumber: number): Promise<void>;
    refreshProjects(): Promise<void>;
    refreshProjectItems(projectId: string): Promise<void>;
    refreshMattermost(): Promise<void>;
    refreshWiki(): Promise<void>;
    sendDriveAuthStatus(): Promise<void>;
    sendCalendarAuthStatus(): Promise<void>;
    gatherContext(tabKey?: string): Promise<string>;

    // ─── Mattermost WebSocket ─────────────────────────────
    getMmWebSocket(): MattermostWebSocket | undefined;
    setMmWebSocket(ws: MattermostWebSocket | undefined): void;
    connectMattermostWebSocket(): Promise<void>;

    // ─── Deep-link helpers ────────────────────────────────
    /** Get/set the repo override chosen via the webview repo switcher. */
    getRepoOverride(): { owner: string; repo: string } | undefined;
    setRepoOverride(override: { owner: string; repo: string } | undefined): void;
}

// ─── Message Handler ─────────────────────────────────────────────
// Each domain module exports a single function matching this signature.
// Returns `true` if the message was handled, `false` otherwise.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WebviewMessage = { type: string } & Record<string, any>;

export type MessageHandler = (
    ctx: HandlerContext,
    msg: WebviewMessage,
) => Promise<boolean>;
