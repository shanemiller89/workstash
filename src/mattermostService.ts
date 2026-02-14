import * as vscode from 'vscode';

// ─── Data Models ──────────────────────────────────────────────────

export interface MattermostTeam {
    id: string;
    name: string;
    displayName: string;
    description: string;
    type: 'O' | 'I'; // Open or Invite-only
}

export interface MattermostChannel {
    id: string;
    teamId: string;
    name: string;
    displayName: string;
    type: 'O' | 'P' | 'D' | 'G'; // Open, Private, Direct, Group
    header: string;
    purpose: string;
    totalMsgCount: number;
    lastPostAt: number; // epoch ms
}

export interface MattermostLinkPreview {
    url: string;
    title?: string;
    description?: string;
    siteName?: string;
    imageUrl?: string;
}

export interface MattermostPost {
    id: string;
    channelId: string;
    userId: string;
    message: string;
    createAt: number; // epoch ms
    updateAt: number;
    deleteAt: number;
    rootId: string; // parent post ID for threads
    type: string;
    props: Record<string, unknown>;
    isPinned: boolean;
    fileIds: string[];
    linkPreviews: MattermostLinkPreview[];
}

export interface MattermostFileInfo {
    id: string;
    name: string;
    extension: string;
    size: number;
    mimeType: string;
    width?: number;
    height?: number;
    hasPreview: boolean;
    /** Full URL to fetch the file (includes auth via proxy or token) */
    url?: string;
}

export interface MattermostUser {
    id: string;
    username: string;
    email: string;
    firstName: string;
    lastName: string;
    nickname: string;
}

export interface MattermostUserStatus {
    userId: string;
    status: 'online' | 'away' | 'offline' | 'dnd';
    lastActivityAt: number;
    manual: boolean;
}

export interface MattermostReaction {
    userId: string;
    postId: string;
    emojiName: string;
    createAt: number;
}

export interface MattermostEmoji {
    id: string;
    creatorId: string;
    name: string;
}

export interface MattermostChannelUnread {
    channelId: string;
    teamId: string;
    msgCount: number;
    mentionCount: number;
}

/** Lightweight data sent to webview (safe for serialization) */
export interface MattermostTeamData {
    id: string;
    name: string;
    displayName: string;
    description: string;
    type: 'O' | 'I';
}

export interface MattermostChannelData {
    id: string;
    teamId: string;
    name: string;
    displayName: string;
    type: 'O' | 'P' | 'D' | 'G';
    header: string;
    purpose: string;
    lastPostAt: string; // ISO string
    otherUserId?: string; // For DM channels: the other user's ID
}

export interface MattermostFileInfoData {
    id: string;
    name: string;
    extension: string;
    size: number;
    mimeType: string;
    width?: number;
    height?: number;
    hasPreview: boolean;
    url: string;
}

export interface MattermostLinkPreviewData {
    url: string;
    title?: string;
    description?: string;
    siteName?: string;
    imageUrl?: string;
}

export interface MattermostPostData {
    id: string;
    channelId: string;
    userId: string;
    username: string; // resolved by service
    message: string;
    createAt: string; // ISO string
    updateAt: string;
    rootId: string;
    type: string;
    isPinned: boolean;
    files?: MattermostFileInfoData[];
    linkPreviews?: MattermostLinkPreviewData[];
    /** Client-only: true while message is being sent (optimistic) */
    _pending?: boolean;
    /** Client-only: error message if send failed */
    _failedError?: string;
    /** Client-only: original send params for retry */
    _sendParams?: {
        channelId: string;
        message: string;
        rootId?: string;
        fileIds?: string[];
    };
}

export interface MattermostUserData {
    id: string;
    username: string;
    email: string;
    firstName: string;
    lastName: string;
    nickname: string;
}

export interface MattermostUserStatusData {
    userId: string;
    status: 'online' | 'away' | 'offline' | 'dnd';
}

export interface MattermostReactionData {
    userId: string;
    postId: string;
    emojiName: string;
    username: string;
}

export interface MattermostEmojiData {
    id: string;
    name: string;
    isCustom: boolean;
    imageUrl?: string; // only for custom emojis
}

export interface MattermostChannelUnreadData {
    channelId: string;
    msgCount: number;
    mentionCount: number;
}

// ─── GitHub-style API types → Mattermost raw API shapes ──────────

interface MmApiTeam {
    id: string;
    name: string;
    display_name: string;
    description: string;
    type: 'O' | 'I';
}

interface MmApiChannel {
    id: string;
    team_id: string;
    name: string;
    display_name: string;
    type: 'O' | 'P' | 'D' | 'G';
    header: string;
    purpose: string;
    total_msg_count: number;
    last_post_at: number;
}

interface MmApiPost {
    id: string;
    channel_id: string;
    user_id: string;
    message: string;
    create_at: number;
    update_at: number;
    delete_at: number;
    root_id: string;
    type: string;
    props: Record<string, unknown>;
    is_pinned: boolean;
    file_ids?: string[];
    metadata?: {
        files?: MmApiFileInfo[];
        embeds?: MmApiEmbed[];
    };
}

interface MmApiEmbed {
    type: string; // 'opengraph' | 'link' | 'image' | 'message_attachment'
    url: string;
    data?: {
        type?: string;
        url?: string;
        title?: string;
        description?: string;
        site_name?: string;
        images?: Array<{
            url?: string;
            secure_url?: string;
            width?: number;
            height?: number;
        }>;
    };
}

interface MmApiFileInfo {
    id: string;
    name: string;
    extension: string;
    size: number;
    mime_type: string;
    width?: number;
    height?: number;
    has_preview_image?: boolean;
}

interface MmApiUser {
    id: string;
    username: string;
    email: string;
    first_name: string;
    last_name: string;
    nickname: string;
}

interface MmApiPostList {
    order: string[];
    posts: Record<string, MmApiPost>;
}

interface MmApiUserStatus {
    user_id: string;
    status: 'online' | 'away' | 'offline' | 'dnd';
    last_activity_at: number;
    manual: boolean;
}

interface MmApiReaction {
    user_id: string;
    post_id: string;
    emoji_name: string;
    create_at: number;
}

interface MmApiEmoji {
    id: string;
    creator_id: string;
    name: string;
}

interface MmApiChannelUnread {
    team_id: string;
    channel_id: string;
    msg_count: number;
    mention_count: number;
}

// ─── Secret Storage Keys ──────────────────────────────────────────

const SECRET_KEY_TOKEN = 'workstash.mattermost.token';
const SECRET_KEY_URL = 'workstash.mattermost.serverUrl';
const SECRET_KEY_AUTH_METHOD = 'workstash.mattermost.authMethod';

/** How the user authenticated with Mattermost */
export type MattermostAuthMethod = 'pat' | 'password' | 'session';

// ─── Service ──────────────────────────────────────────────────────

type FetchFn = typeof globalThis.fetch;

/**
 * REST API wrapper for Mattermost operations.
 * Authenticates via Personal Access Token stored in VS Code SecretStorage.
 * All calls go through `_request()` with consistent error handling.
 */
export class MattermostService {
    private readonly _outputChannel: vscode.OutputChannel;
    private readonly _secrets: vscode.SecretStorage;
    private readonly _fetchFn: FetchFn;

    /** Fires when auth state changes (sign in / sign out / server URL change) */
    private readonly _onDidChangeAuth = new vscode.EventEmitter<void>();
    public readonly onDidChangeAuth: vscode.Event<void> = this._onDidChangeAuth.event;

    /** In-memory user cache: userId → username */
    private readonly _userCache = new Map<string, string>();

    constructor(
        outputChannel: vscode.OutputChannel,
        secrets: vscode.SecretStorage,
        fetchFn?: FetchFn,
    ) {
        this._outputChannel = outputChannel;
        this._secrets = secrets;
        this._fetchFn = fetchFn ?? globalThis.fetch.bind(globalThis);
    }

    // ─── Auth / Configuration ─────────────────────────────────────

    /** Get the configured Mattermost server URL (no trailing slash).
     *  Priority: VS Code setting → SecretStorage (stored during sign-in). */
    async getServerUrl(): Promise<string | undefined> {
        // Check VS Code setting first
        const settingUrl = vscode.workspace
            .getConfiguration('workstash.mattermost')
            .get<string>('serverUrl');
        if (settingUrl?.trim()) {
            return settingUrl.trim().replace(/\/+$/, '');
        }
        // Fall back to SecretStorage (stored during sign-in flow)
        return this._secrets.get(SECRET_KEY_URL);
    }

    /** Get the stored personal access token */
    async getToken(): Promise<string | undefined> {
        return this._secrets.get(SECRET_KEY_TOKEN);
    }

    /** Check if we have both a server URL and token configured */
    async isConfigured(): Promise<boolean> {
        const [url, token] = await Promise.all([this.getServerUrl(), this.getToken()]);
        return !!url && !!token;
    }

    /** Get the stored auth method */
    async getAuthMethod(): Promise<MattermostAuthMethod | undefined> {
        const method = await this._secrets.get(SECRET_KEY_AUTH_METHOD);
        return method as MattermostAuthMethod | undefined;
    }

    /**
     * Interactive sign-in — shows a QuickPick for the user to choose
     * between Personal Access Token and username/password authentication.
     */
    async signIn(): Promise<boolean> {
        const choice = await vscode.window.showQuickPick(
            [
                {
                    label: '$(key) Username & Password',
                    description: 'Sign in with your Mattermost credentials',
                    method: 'password' as const,
                },
                {
                    label: '$(shield) Personal Access Token',
                    description: 'Use a PAT (must be enabled by your admin)',
                    method: 'pat' as const,
                },
                {
                    label: '$(plug) Session Token',
                    description: 'Paste a session/bearer token directly',
                    method: 'session' as const,
                },
            ],
            {
                title: 'Mattermost — Choose Sign-In Method',
                placeHolder: 'How would you like to authenticate?',
            },
        );
        if (!choice) { return false; }

        switch (choice.method) {
            case 'password': return this.signInWithPassword();
            case 'pat': return this.signInWithToken();
            case 'session': return this.signInWithSessionToken();
        }
    }

    /**
     * Sign in with username & password.
     * Calls POST /api/v4/users/login and stores the session token from the response.
     */
    async signInWithPassword(): Promise<boolean> {
        // Step 1: Get server URL
        const cleanUrl = await this._promptServerUrl();
        if (!cleanUrl) { return false; }

        // Step 2: Get username
        const loginId = await vscode.window.showInputBox({
            prompt: 'Mattermost Username or Email',
            placeHolder: 'username or user@example.com',
            validateInput: (v) => v.trim() ? undefined : 'Username is required',
        });
        if (!loginId) { return false; }

        // Step 3: Get password
        const password = await vscode.window.showInputBox({
            prompt: 'Mattermost Password',
            placeHolder: 'Enter your password',
            password: true,
            validateInput: (v) => v.trim() ? undefined : 'Password is required',
        });
        if (!password) { return false; }

        // Step 4: POST /api/v4/users/login
        try {
            const loginBody: { login_id: string; password: string; token?: string } = {
                login_id: loginId.trim(),
                password,
            };

            let response = await this._fetchFn(`${cleanUrl}/api/v4/users/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(loginBody),
            });

            // Step 4a: Handle MFA challenge
            if (!response.ok) {
                const errorBody = await this._parseErrorBodyFull(response);
                if (errorBody.id === 'mfa.validate_token.authenticate.app_error') {
                    // MFA is required — prompt for TOTP code
                    const mfaToken = await vscode.window.showInputBox({
                        prompt: 'Enter your two-factor authentication code',
                        placeHolder: '6-digit code from your authenticator app',
                        validateInput: (v) => {
                            const trimmed = v.trim();
                            if (!trimmed) { return 'MFA code is required'; }
                            if (!/^\d{6}$/.test(trimmed)) { return 'Enter a 6-digit code'; }
                            return undefined;
                        },
                    });
                    if (!mfaToken) { return false; }

                    // Retry with MFA token
                    loginBody.token = mfaToken.trim();
                    response = await this._fetchFn(`${cleanUrl}/api/v4/users/login`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(loginBody),
                    });

                    if (!response.ok) {
                        const retryError = await this._parseErrorBodyFull(response);
                        const hint = retryError.id === 'api.user.check_user_mfa.bad_code.app_error'
                            ? 'Invalid MFA code. Please try again.'
                            : retryError.message || `Login failed (${response.status})`;
                        vscode.window.showErrorMessage(`Mattermost: ${hint}`);
                        return false;
                    }
                } else {
                    vscode.window.showErrorMessage(
                        `Mattermost login failed (${response.status})${errorBody.message ? `: ${errorBody.message}` : ''}`,
                    );
                    return false;
                }
            }

            // Session token comes back in the Token header
            const sessionToken = response.headers.get('Token');
            if (!sessionToken) {
                vscode.window.showErrorMessage(
                    'Mattermost login succeeded but no session token was returned.',
                );
                return false;
            }

            const user = (await response.json()) as MmApiUser;
            this._outputChannel.appendLine(
                `[Mattermost] Signed in as ${user.username} on ${cleanUrl} (password auth)`,
            );

            // Step 5: Store credentials
            await this._secrets.store(SECRET_KEY_URL, cleanUrl);
            await this._secrets.store(SECRET_KEY_TOKEN, sessionToken);
            await this._secrets.store(SECRET_KEY_AUTH_METHOD, 'password');
            this._userCache.clear();
            this._onDidChangeAuth.fire();

            vscode.window.showInformationMessage(
                `Signed in to Mattermost as ${user.username}.`,
            );
            return true;
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Cannot reach Mattermost server: ${msg}`);
            return false;
        }
    }

    /**
     * Sign in with a Personal Access Token.
     * Validates the token by hitting /api/v4/users/me before storing.
     */
    async signInWithToken(): Promise<boolean> {
        // Step 1: Get server URL
        const cleanUrl = await this._promptServerUrl();
        if (!cleanUrl) { return false; }

        // Step 2: Get personal access token
        const token = await vscode.window.showInputBox({
            prompt: 'Mattermost Personal Access Token',
            placeHolder: 'Paste your personal access token',
            password: true,
            validateInput: (v) => v.trim() ? undefined : 'Token is required',
        });
        if (!token) { return false; }

        const cleanToken = token.trim();

        // Step 3: Validate by hitting /users/me
        try {
            const response = await this._fetchFn(`${cleanUrl}/api/v4/users/me`, {
                method: 'GET',
                headers: { Authorization: `Bearer ${cleanToken}` },
            });

            if (!response.ok) {
                const detail = await this._parseErrorBody(response);
                vscode.window.showErrorMessage(
                    `Mattermost authentication failed (${response.status})${detail ? `: ${detail}` : ''}`,
                );
                return false;
            }

            const user = (await response.json()) as MmApiUser;
            this._outputChannel.appendLine(
                `[Mattermost] Signed in as ${user.username} on ${cleanUrl} (PAT auth)`,
            );
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Cannot reach Mattermost server: ${msg}`);
            return false;
        }

        // Step 4: Store credentials
        await this._secrets.store(SECRET_KEY_URL, cleanUrl);
        await this._secrets.store(SECRET_KEY_TOKEN, cleanToken);
        await this._secrets.store(SECRET_KEY_AUTH_METHOD, 'pat');
        this._userCache.clear();
        this._onDidChangeAuth.fire();

        vscode.window.showInformationMessage('Signed in to Mattermost successfully.');
        return true;
    }

    /**
     * Sign in with a raw session/bearer token.
     * Useful when PATs are disabled and the user has a token from another source
     * (e.g., browser dev tools, CLI, or an existing session).
     */
    async signInWithSessionToken(): Promise<boolean> {
        // Step 1: Get server URL
        const cleanUrl = await this._promptServerUrl();
        if (!cleanUrl) { return false; }

        // Step 2: Get session token
        const token = await vscode.window.showInputBox({
            prompt: 'Mattermost Session / Bearer Token',
            placeHolder: 'Paste your session token',
            password: true,
            validateInput: (v) => v.trim() ? undefined : 'Token is required',
        });
        if (!token) { return false; }

        const cleanToken = token.trim();

        // Step 3: Validate by hitting /users/me
        try {
            const response = await this._fetchFn(`${cleanUrl}/api/v4/users/me`, {
                method: 'GET',
                headers: { Authorization: `Bearer ${cleanToken}` },
            });

            if (!response.ok) {
                const detail = await this._parseErrorBody(response);
                vscode.window.showErrorMessage(
                    `Mattermost authentication failed (${response.status})${detail ? `: ${detail}` : ''}`,
                );
                return false;
            }

            const user = (await response.json()) as MmApiUser;
            this._outputChannel.appendLine(
                `[Mattermost] Signed in as ${user.username} on ${cleanUrl} (session token)`,
            );
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Cannot reach Mattermost server: ${msg}`);
            return false;
        }

        // Step 4: Store credentials
        await this._secrets.store(SECRET_KEY_URL, cleanUrl);
        await this._secrets.store(SECRET_KEY_TOKEN, cleanToken);
        await this._secrets.store(SECRET_KEY_AUTH_METHOD, 'session');
        this._userCache.clear();
        this._onDidChangeAuth.fire();

        vscode.window.showInformationMessage('Signed in to Mattermost successfully.');
        return true;
    }

    /** Shared prompt for server URL (used by all sign-in methods).
     *  Pre-fills from VS Code setting or SecretStorage. */
    private async _promptServerUrl(): Promise<string | undefined> {
        const currentUrl = await this.getServerUrl();
        const serverUrl = await vscode.window.showInputBox({
            prompt: 'Mattermost Server URL (e.g., https://mattermost.example.com)',
            placeHolder: 'https://mattermost.example.com',
            value: currentUrl ?? '',
            validateInput: (value) => {
                if (!value.trim()) {
                    return 'Server URL is required';
                }
                try {
                    new URL(value.trim());
                    return undefined;
                } catch {
                    return 'Please enter a valid URL';
                }
            },
        });
        if (!serverUrl) { return undefined; }
        return serverUrl.trim().replace(/\/+$/, '');
    }

    /** Sign out — clear stored credentials */
    async signOut(): Promise<void> {
        await this._secrets.delete(SECRET_KEY_TOKEN);
        await this._secrets.delete(SECRET_KEY_URL);
        await this._secrets.delete(SECRET_KEY_AUTH_METHOD);
        this._userCache.clear();
        this._onDidChangeAuth.fire();
        this._outputChannel.appendLine('[Mattermost] Signed out');
    }

    // ─── Private Helpers ──────────────────────────────────────────

    private async _getTokenOrThrow(): Promise<string> {
        const token = await this.getToken();
        if (!token) {
            throw new Error('Not configured. Please sign in to Mattermost first.');
        }
        return token;
    }

    /**
     * Fetch a binary resource (image, file) using Bearer auth and return a data: URI.
     * This avoids appending access_token as a query param, which Mattermost rejects
     * for session (non-OAuth) tokens.
     */
    private async _fetchAsDataUri(apiPath: string): Promise<string> {
        const token = await this._getTokenOrThrow();
        const baseUrl = await this._getBaseUrl();
        const url = `${baseUrl}${apiPath}`;
        const response = await this._fetchFn(url, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch ${apiPath}: ${response.status}`);
        }
        const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
        const buf = Buffer.from(await response.arrayBuffer());
        return `data:${contentType};base64,${buf.toString('base64')}`;
    }

    private async _getBaseUrl(): Promise<string> {
        const url = await this.getServerUrl();
        if (!url) {
            throw new Error('Server URL not configured. Please sign in to Mattermost first.');
        }
        return `${url}/api/v4`;
    }

    private async _request<T>(method: string, path: string, body?: unknown): Promise<T> {
        const token = await this._getTokenOrThrow();
        const baseUrl = await this._getBaseUrl();
        const url = `${baseUrl}${path}`;

        this._outputChannel.appendLine(`[Mattermost] ${method} ${path}`);

        const headers: Record<string, string> = {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
        };
        if (body) {
            headers['Content-Type'] = 'application/json';
        }

        const response = await this._fetchFn(url, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
        });

        this._outputChannel.appendLine(`[Mattermost] ${method} ${path} → ${response.status}`);

        if (!response.ok) {
            await this._handleHttpError(response);
        }

        if (response.status === 204) {
            return undefined as T;
        }

        return (await response.json()) as T;
    }

    private async _handleHttpError(response: Response): Promise<never> {
        const detail = await this._parseErrorBody(response);

        switch (response.status) {
            case 401: {
                const method = await this.getAuthMethod();
                const hint = method === 'password' || method === 'session'
                    ? ' Session tokens expire — please sign in again.'
                    : ' Please check your personal access token.';
                throw new Error(`Mattermost authentication failed.${hint}`);
            }
            case 403:
                throw new Error(`Forbidden${detail ? `: ${detail}` : ''}`);
            case 404:
                throw new Error(`Not found${detail ? `: ${detail}` : ''}`);
            case 429:
                throw new Error('Rate limit exceeded. Try again later.');
            default:
                throw new Error(
                    `Mattermost API error ${response.status}${detail ? `: ${detail}` : ''}`,
                );
        }
    }

    private async _parseErrorBody(response: Response): Promise<string> {
        const full = await this._parseErrorBodyFull(response);
        return full.message;
    }

    /** Parse a Mattermost error response, returning both `id` and `message`. */
    private async _parseErrorBodyFull(
        response: Response,
    ): Promise<{ id: string; message: string }> {
        try {
            const body = (await response.json()) as { id?: string; message?: string };
            return { id: body.id ?? '', message: body.message ?? '' };
        } catch {
            return { id: '', message: '' };
        }
    }

    // ─── Users ────────────────────────────────────────────────────

    /** Get the authenticated user's profile */
    async getMe(): Promise<MattermostUser> {
        const raw = await this._request<MmApiUser>('GET', '/users/me');
        return this._parseUser(raw);
    }

    /** Get a user by ID (cached) */
    async getUser(userId: string): Promise<MattermostUser> {
        const raw = await this._request<MmApiUser>('GET', `/users/${userId}`);
        const user = this._parseUser(raw);
        this._userCache.set(userId, user.username);
        return user;
    }

    /** Resolve a userId to a username (uses cache when available) */
    async resolveUsername(userId: string): Promise<string> {
        const cached = this._userCache.get(userId);
        if (cached) { return cached; }

        try {
            const user = await this.getUser(userId);
            return user.username;
        } catch {
            return userId; // fallback to raw ID
        }
    }

    /** Bulk-resolve user IDs to usernames for a list of posts */
    async resolveUsernames(posts: MattermostPost[]): Promise<Map<string, string>> {
        const uniqueIds = [...new Set(posts.map((p) => p.userId))];
        const uncached = uniqueIds.filter((id) => !this._userCache.has(id));

        if (uncached.length > 0) {
            // Mattermost supports bulk user fetch
            try {
                const users = await this._request<MmApiUser[]>('POST', '/users/ids', uncached);
                for (const u of users) {
                    this._userCache.set(u.id, u.username);
                }
            } catch {
                // Fallback: resolve individually (slower but more resilient)
                for (const id of uncached) {
                    await this.resolveUsername(id);
                }
            }
        }

        const result = new Map<string, string>();
        for (const id of uniqueIds) {
            result.set(id, this._userCache.get(id) ?? id);
        }
        return result;
    }

    // ─── Teams ────────────────────────────────────────────────────

    /** List all teams the authenticated user is a member of */
    async getMyTeams(): Promise<MattermostTeam[]> {
        const raw = await this._request<MmApiTeam[]>('GET', '/users/me/teams');
        return raw.map((t) => this._parseTeam(t));
    }

    // ─── Channels ─────────────────────────────────────────────────

    /** List public/private channels the authenticated user is a member of in a given team */
    async getMyChannels(teamId: string): Promise<MattermostChannel[]> {
        const raw = await this._request<MmApiChannel[]>(
            'GET',
            `/users/me/teams/${teamId}/channels`,
        );
        return raw
            .filter((c) => c.type === 'O' || c.type === 'P')
            .map((c) => this._parseChannel(c))
            .sort((a, b) => a.displayName.localeCompare(b.displayName));
    }

    /** List ALL channels (including DMs/Groups) the user is a member of in a team */
    async getAllMyChannels(teamId: string, page = 0, perPage = 100): Promise<{
        channels: MattermostChannel[];
        dmChannels: MattermostChannel[];
        groupChannels: MattermostChannel[];
        hasMore: boolean;
    }> {
        const raw = await this._request<MmApiChannel[]>(
            'GET',
            `/users/me/teams/${teamId}/channels?page=${page}&per_page=${perPage}`,
        );
        const all = raw.map((c) => this._parseChannel(c));
        return {
            channels: all
                .filter((c) => c.type === 'O' || c.type === 'P')
                .sort((a, b) => a.displayName.localeCompare(b.displayName)),
            dmChannels: all
                .filter((c) => c.type === 'D')
                .sort((a, b) => b.lastPostAt - a.lastPostAt),
            groupChannels: all
                .filter((c) => c.type === 'G')
                .sort((a, b) => b.lastPostAt - a.lastPostAt),
            hasMore: raw.length === perPage,
        };
    }

    /** Create a direct message channel between the current user and another user */
    async createDirectChannel(otherUserId: string): Promise<MattermostChannel> {
        const me = await this.getMe();
        const raw = await this._request<MmApiChannel>('POST', '/channels/direct', [
            me.id,
            otherUserId,
        ]);
        return this._parseChannel(raw);
    }

    /** Create a group message channel */
    async createGroupChannel(userIds: string[]): Promise<MattermostChannel> {
        const raw = await this._request<MmApiChannel>('POST', '/channels/group', userIds);
        return this._parseChannel(raw);
    }

    /**
     * Resolve display name for a DM channel.
     * DM channel `name` is `userId1__userId2` — find the other user's username.
     */
    async resolveDmDisplayName(channel: MattermostChannel, myUserId: string): Promise<string> {
        const parts = channel.name.split('__');
        const otherUserId = parts.find((p) => p !== myUserId) ?? parts[0];
        try {
            const user = await this.getUser(otherUserId);
            const display = user.firstName && user.lastName
                ? `${user.firstName} ${user.lastName}`
                : user.username;
            return display;
        } catch {
            return otherUserId;
        }
    }

    /**
     * Get the "other user" ID from a DM channel name.
     */
    getDmOtherUserId(channel: MattermostChannel, myUserId: string): string {
        const parts = channel.name.split('__');
        return parts.find((p) => p !== myUserId) ?? parts[0];
    }

    /** Get a single channel by ID */
    async getChannel(channelId: string): Promise<MattermostChannel> {
        const raw = await this._request<MmApiChannel>('GET', `/channels/${channelId}`);
        return this._parseChannel(raw);
    }

    // ─── Posts ─────────────────────────────────────────────────────

    /**
     * Get posts in a channel, paginated.
     * Returns newest first. `page` is 0-indexed.
     */
    async getChannelPosts(
        channelId: string,
        page = 0,
        perPage = 30,
    ): Promise<MattermostPost[]> {
        const raw = await this._request<MmApiPostList>(
            'GET',
            `/channels/${channelId}/posts?page=${page}&per_page=${perPage}`,
        );
        return raw.order
            .map((id) => raw.posts[id])
            .filter((p) => p && p.delete_at === 0) // skip deleted
            .map((p) => this._parsePost(p));
    }

    /** Create a new post in a channel */
    async createPost(channelId: string, message: string, rootId?: string, fileIds?: string[]): Promise<MattermostPost> {
        const body: { channel_id: string; message: string; root_id?: string; file_ids?: string[] } = {
            channel_id: channelId,
            message,
        };
        if (rootId) {
            body.root_id = rootId;
        }
        if (fileIds && fileIds.length > 0) {
            body.file_ids = fileIds;
        }
        const raw = await this._request<MmApiPost>('POST', '/posts', body);
        return this._parsePost(raw);
    }

    /** Edit an existing post's message */
    async editPost(postId: string, message: string): Promise<MattermostPost> {
        const raw = await this._request<MmApiPost>('PUT', `/posts/${postId}/patch`, {
            message,
        });
        return this._parsePost(raw);
    }

    /** Delete a post */
    async deletePost(postId: string): Promise<void> {
        await this._request('DELETE', `/posts/${postId}`);
    }

    /** Pin a post to its channel */
    async pinPost(postId: string): Promise<void> {
        await this._request('POST', `/posts/${postId}/pin`);
    }

    /** Unpin a post from its channel */
    async unpinPost(postId: string): Promise<void> {
        await this._request('POST', `/posts/${postId}/unpin`);
    }

    /** Search posts in a team */
    async searchPosts(
        teamId: string,
        terms: string,
        isOrSearch = false,
    ): Promise<MattermostPost[]> {
        const raw = await this._request<MmApiPostList>(
            'POST',
            `/teams/${teamId}/posts/search`,
            { terms, is_or_search: isOrSearch },
        );
        return raw.order
            .map((id) => raw.posts[id])
            .filter((p) => p && p.delete_at === 0)
            .map((p) => this._parsePost(p));
    }

    /** Get flagged/saved posts for the current user */
    async getFlaggedPosts(teamId?: string): Promise<MattermostPost[]> {
        const me = await this.getMe();
        const teamParam = teamId ? `&team_id=${teamId}` : '';
        const raw = await this._request<MmApiPostList>(
            'GET',
            `/users/${me.id}/posts/flagged?per_page=50${teamParam}`,
        );
        return raw.order
            .map((id) => raw.posts[id])
            .filter((p) => p && p.delete_at === 0)
            .map((p) => this._parsePost(p));
    }

    /** Flag/save a post */
    async flagPost(postId: string): Promise<void> {
        const me = await this.getMe();
        await this._request('PUT', `/users/${me.id}/preferences`, [
            { user_id: me.id, category: 'flagged_post', name: postId, value: 'true' },
        ]);
    }

    /** Unflag/unsave a post */
    async unflagPost(postId: string): Promise<void> {
        const me = await this.getMe();
        await this._request('POST', `/users/${me.id}/preferences/delete`, [
            { user_id: me.id, category: 'flagged_post', name: postId, value: 'true' },
        ]);
    }

    // ─── User Status (set own) ────────────────────────────────────

    /** Set the current user's status */
    async setOwnStatus(
        status: 'online' | 'away' | 'offline' | 'dnd',
        dndEndTime?: number,
    ): Promise<void> {
        const me = await this.getMe();
        await this._request('PUT', `/users/${me.id}/status`, {
            user_id: me.id,
            status,
            dnd_end_time: dndEndTime ?? 0,
        });
    }

    /** Get a single user's profile by ID */
    async getUserProfile(userId: string): Promise<MattermostUser> {
        return this.getUser(userId);
    }

    /** Get a user's profile image as a data URI */
    async getUserProfileImage(userId: string): Promise<string> {
        return this._fetchAsDataUri(`/users/${userId}/image`);
    }

    /** Batch-fetch profile images for a list of user IDs. Returns userId → data URI map. */
    async getUserProfileImages(userIds: string[]): Promise<Record<string, string>> {
        const result: Record<string, string> = {};
        // Fetch concurrently with a concurrency limit of 5
        const batchSize = 5;
        for (let i = 0; i < userIds.length; i += batchSize) {
            const batch = userIds.slice(i, i + batchSize);
            const settled = await Promise.allSettled(
                batch.map(async (uid) => {
                    const dataUri = await this.getUserProfileImage(uid);
                    return { uid, dataUri };
                }),
            );
            for (const r of settled) {
                if (r.status === 'fulfilled') {
                    result[r.value.uid] = r.value.dataUri;
                }
            }
        }
        return result;
    }

    // ─── Threads ──────────────────────────────────────────────────

    /** Get all posts in a thread (root post + replies) */
    async getPostThread(postId: string): Promise<MattermostPost[]> {
        const raw = await this._request<MmApiPostList>(
            'GET',
            `/posts/${postId}/thread`,
        );
        return raw.order
            .map((id) => raw.posts[id])
            .filter((p) => p && p.delete_at === 0)
            .map((p) => this._parsePost(p));
    }

    // ─── User Status ──────────────────────────────────────────────

    // ─── File Upload ──────────────────────────────────────────────

    /** Upload files to a channel. Returns file info objects with IDs to attach to a post. */
    async uploadFiles(
        channelId: string,
        files: { name: string; data: Buffer; mimeType: string }[],
    ): Promise<MattermostFileInfo[]> {
        const token = await this._getTokenOrThrow();
        const baseUrl = await this._getBaseUrl();
        const url = `${baseUrl}/files`;

        // Build multipart/form-data manually using a boundary
        const boundary = `----WorkStashUpload${Date.now()}`;
        const parts: Buffer[] = [];

        // Add channel_id field
        parts.push(Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="channel_id"\r\n\r\n${channelId}\r\n`,
        ));

        // Add each file
        for (const file of files) {
            parts.push(Buffer.from(
                `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${file.name}"\r\nContent-Type: ${file.mimeType}\r\n\r\n`,
            ));
            parts.push(file.data);
            parts.push(Buffer.from('\r\n'));
        }

        // Close boundary
        parts.push(Buffer.from(`--${boundary}--\r\n`));

        const body = Buffer.concat(parts);

        this._outputChannel.appendLine(`[Mattermost] POST /files (${files.length} file(s), ${body.length} bytes)`);

        const response = await this._fetchFn(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
            },
            body,
        });

        this._outputChannel.appendLine(`[Mattermost] POST /files → ${response.status}`);

        if (!response.ok) {
            await this._handleHttpError(response);
        }

        const result = (await response.json()) as { file_infos: MmApiFileInfo[] };
        return result.file_infos.map((f) => this._parseFileInfo(f));
    }

    // ─── File Attachments ─────────────────────────────────────────

    /** Get file info for a single file ID */
    async getFileInfo(fileId: string): Promise<MattermostFileInfo> {
        const raw = await this._request<MmApiFileInfo>(
            'GET',
            `/files/${fileId}/info`,
        );
        return this._parseFileInfo(raw);
    }

    /** Fetch file content as a data URI for the webview to display */
    async getFileUrl(fileId: string): Promise<string> {
        return this._fetchAsDataUri(`/files/${fileId}`);
    }

    /** Fetch thumbnail as a data URI for image previews */
    async getFileThumbnailUrl(fileId: string): Promise<string> {
        return this._fetchAsDataUri(`/files/${fileId}/thumbnail`);
    }

    /** Resolve file metadata + URLs for a list of file IDs */
    async resolveFileInfos(fileIds: string[]): Promise<MattermostFileInfoData[]> {
        if (fileIds.length === 0) { return []; }
        const results: MattermostFileInfoData[] = [];
        for (const fid of fileIds) {
            try {
                const info = await this.getFileInfo(fid);
                const isImage = info.mimeType.startsWith('image/');
                // For images, use preview if available; otherwise full file
                const apiPath = isImage && info.hasPreview
                    ? `/files/${fid}/preview`
                    : `/files/${fid}`;
                const url = await this._fetchAsDataUri(apiPath);
                results.push({
                    id: info.id,
                    name: info.name,
                    extension: info.extension,
                    size: info.size,
                    mimeType: info.mimeType,
                    width: info.width,
                    height: info.height,
                    hasPreview: info.hasPreview,
                    url,
                });
            } catch {
                // Skip files we can't resolve
            }
        }
        return results;
    }

    // ─── User Status (continued) ──────────────────────────────────

    /** Bulk-fetch user statuses by IDs */
    async getUserStatuses(userIds: string[]): Promise<MattermostUserStatus[]> {
        if (userIds.length === 0) { return []; }
        const raw = await this._request<MmApiUserStatus[]>(
            'POST',
            '/users/status/ids',
            userIds,
        );
        return raw.map((s) => ({
            userId: s.user_id,
            status: s.status,
            lastActivityAt: s.last_activity_at,
            manual: s.manual,
        }));
    }

    // ─── Reactions ────────────────────────────────────────────────

    /** Get reactions for a single post */
    async getPostReactions(postId: string): Promise<MattermostReaction[]> {
        const raw = await this._request<MmApiReaction[]>(
            'GET',
            `/posts/${postId}/reactions`,
        );
        return raw.map((r) => this._parseReaction(r));
    }

    /** Bulk-fetch reactions for multiple posts */
    async getBulkReactions(postIds: string[]): Promise<Map<string, MattermostReaction[]>> {
        if (postIds.length === 0) { return new Map(); }
        const raw = await this._request<Record<string, MmApiReaction[]>>(
            'POST',
            '/posts/ids/reactions',
            postIds,
        );
        const result = new Map<string, MattermostReaction[]>();
        for (const [postId, reactions] of Object.entries(raw)) {
            result.set(postId, reactions.map((r) => this._parseReaction(r)));
        }
        return result;
    }

    /** Add a reaction to a post */
    async addReaction(postId: string, emojiName: string): Promise<void> {
        const me = await this.getMe();
        await this._request('POST', '/reactions', {
            user_id: me.id,
            post_id: postId,
            emoji_name: emojiName,
        });
    }

    /** Remove a reaction from a post */
    async removeReaction(postId: string, emojiName: string): Promise<void> {
        const me = await this.getMe();
        await this._request(
            'DELETE',
            `/users/${me.id}/posts/${postId}/reactions/${emojiName}`,
        );
    }

    // ─── Unread Counts ────────────────────────────────────────────

    /** Get unread info for a specific channel */
    async getChannelUnread(channelId: string): Promise<MattermostChannelUnread> {
        const me = await this.getMe();
        const raw = await this._request<MmApiChannelUnread>(
            'GET',
            `/users/${me.id}/channels/${channelId}/unread`,
        );
        return {
            channelId: raw.channel_id,
            teamId: raw.team_id,
            msgCount: raw.msg_count,
            mentionCount: raw.mention_count,
        };
    }

    /** Mark a channel as read */
    async markChannelAsRead(channelId: string): Promise<void> {
        const me = await this.getMe();
        await this._request('POST', `/channels/members/${me.id}/view`, {
            channel_id: channelId,
        });
    }

    // ─── User Search ──────────────────────────────────────────────

    /** Search users by term (username, email, first/last name) */
    async searchUsers(term: string): Promise<MattermostUser[]> {
        const raw = await this._request<MmApiUser[]>('POST', '/users/search', {
            term,
            limit: 25,
        });
        return raw.map((u) => this._parseUser(u));
    }

    // ─── Emoji ────────────────────────────────────────────────────

    /** Autocomplete emoji by name prefix */
    async getEmojiAutocomplete(name: string): Promise<MattermostEmoji[]> {
        const raw = await this._request<MmApiEmoji[]>(
            'GET',
            `/emoji/autocomplete?name=${encodeURIComponent(name)}`,
        );
        return raw.map((e) => ({ id: e.id, creatorId: e.creator_id, name: e.name }));
    }

    /** Fetch a custom emoji image as a data URI */
    async getCustomEmojiImageUrl(emojiId: string): Promise<string> {
        return this._fetchAsDataUri(`/emoji/${emojiId}/image`);
    }

    /** Fetch all custom emojis from the server, returning name→dataUri map */
    async getCustomEmojis(): Promise<Record<string, string>> {
        const result: Record<string, string> = {};
        let page = 0;
        const perPage = 200;
        const allEmojis: MmApiEmoji[] = [];
        while (true) {
            const batch = await this._request<MmApiEmoji[]>(
                'GET',
                `/emoji?page=${page}&per_page=${perPage}`,
            );
            allEmojis.push(...batch);
            if (batch.length < perPage) { break; }
            page++;
        }
        // Fetch images in parallel (batches of 10 to avoid overwhelming the server)
        const batchSize = 10;
        for (let i = 0; i < allEmojis.length; i += batchSize) {
            const chunk = allEmojis.slice(i, i + batchSize);
            const settled = await Promise.allSettled(
                chunk.map(async (e) => {
                    const dataUri = await this._fetchAsDataUri(`/emoji/${e.id}/image`);
                    return { name: e.name, dataUri };
                }),
            );
            for (const s of settled) {
                if (s.status === 'fulfilled') {
                    result[s.value.name] = s.value.dataUri;
                }
            }
        }
        return result;
    }

    // ─── Parsers ──────────────────────────────────────────────────

    private _parseTeam(t: MmApiTeam): MattermostTeam {
        return {
            id: t.id,
            name: t.name,
            displayName: t.display_name,
            description: t.description,
            type: t.type,
        };
    }

    private _parseChannel(c: MmApiChannel): MattermostChannel {
        return {
            id: c.id,
            teamId: c.team_id,
            name: c.name,
            displayName: c.display_name,
            type: c.type,
            header: c.header,
            purpose: c.purpose,
            totalMsgCount: c.total_msg_count,
            lastPostAt: c.last_post_at,
        };
    }

    private _parsePost(p: MmApiPost): MattermostPost {
        const linkPreviews: MattermostLinkPreview[] = [];
        if (p.metadata?.embeds) {
            for (const embed of p.metadata.embeds) {
                if (embed.type === 'opengraph' && embed.data) {
                    const img = embed.data.images?.[0];
                    linkPreviews.push({
                        url: embed.url,
                        title: embed.data.title,
                        description: embed.data.description,
                        siteName: embed.data.site_name,
                        imageUrl: img?.secure_url || img?.url,
                    });
                }
            }
        }
        return {
            id: p.id,
            channelId: p.channel_id,
            userId: p.user_id,
            message: p.message,
            createAt: p.create_at,
            updateAt: p.update_at,
            deleteAt: p.delete_at,
            rootId: p.root_id,
            type: p.type,
            props: p.props,
            isPinned: p.is_pinned ?? false,
            fileIds: p.file_ids ?? [],
            linkPreviews,
        };
    }

    private _parseFileInfo(f: MmApiFileInfo): MattermostFileInfo {
        return {
            id: f.id,
            name: f.name,
            extension: f.extension,
            size: f.size,
            mimeType: f.mime_type,
            width: f.width,
            height: f.height,
            hasPreview: f.has_preview_image ?? false,
        };
    }

    private _parseUser(u: MmApiUser): MattermostUser {
        return {
            id: u.id,
            username: u.username,
            email: u.email,
            firstName: u.first_name,
            lastName: u.last_name,
            nickname: u.nickname,
        };
    }

    private _parseReaction(r: MmApiReaction): MattermostReaction {
        return {
            userId: r.user_id,
            postId: r.post_id,
            emojiName: r.emoji_name,
            createAt: r.create_at,
        };
    }

    // ─── Converters (for webview) ─────────────────────────────────

    static toTeamData(team: MattermostTeam): MattermostTeamData {
        return {
            id: team.id,
            name: team.name,
            displayName: team.displayName,
            description: team.description,
            type: team.type,
        };
    }

    static toChannelData(channel: MattermostChannel, otherUserId?: string): MattermostChannelData {
        return {
            id: channel.id,
            teamId: channel.teamId,
            name: channel.name,
            displayName: channel.displayName,
            type: channel.type,
            header: channel.header,
            purpose: channel.purpose,
            lastPostAt: channel.lastPostAt
                ? new Date(channel.lastPostAt).toISOString()
                : '',
            otherUserId,
        };
    }

    static toPostData(
        post: MattermostPost,
        username: string,
        files?: MattermostFileInfoData[],
    ): MattermostPostData {
        return {
            id: post.id,
            channelId: post.channelId,
            userId: post.userId,
            username,
            message: post.message,
            createAt: new Date(post.createAt).toISOString(),
            updateAt: new Date(post.updateAt).toISOString(),
            rootId: post.rootId,
            type: post.type,
            isPinned: post.isPinned,
            files: files && files.length > 0 ? files : undefined,
            linkPreviews: post.linkPreviews.length > 0 ? post.linkPreviews : undefined,
        };
    }

    static toUserData(user: MattermostUser): MattermostUserData {
        return {
            id: user.id,
            username: user.username,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            nickname: user.nickname,
        };
    }

    static toUserStatusData(status: MattermostUserStatus): MattermostUserStatusData {
        return {
            userId: status.userId,
            status: status.status,
        };
    }

    static toReactionData(
        reaction: MattermostReaction,
        username: string,
    ): MattermostReactionData {
        return {
            userId: reaction.userId,
            postId: reaction.postId,
            emojiName: reaction.emojiName,
            username,
        };
    }

    static toChannelUnreadData(unread: MattermostChannelUnread): MattermostChannelUnreadData {
        return {
            channelId: unread.channelId,
            msgCount: unread.msgCount,
            mentionCount: unread.mentionCount,
        };
    }
}
