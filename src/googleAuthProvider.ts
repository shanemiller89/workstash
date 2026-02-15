import * as vscode from 'vscode';
import * as http from 'http';
import * as crypto from 'crypto';

// ─── Constants ────────────────────────────────────────────────────

const PROVIDER_ID = 'corenexus-google';
const PROVIDER_LABEL = 'Google (CoreNexus)';

/** Google OAuth 2.0 endpoints */
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

/** Scopes for Google Drive read/write + user profile */
const SCOPES = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
];

const LOCALHOST_REDIRECT = 'http://localhost';
const CALLBACK_PORT_RANGE = [32100, 32200] as const;

// Secret storage keys
const SECRET_ACCESS_TOKEN = 'corenexus.google.accessToken';
const SECRET_REFRESH_TOKEN = 'corenexus.google.refreshToken';
const SECRET_ACCOUNT = 'corenexus.google.account';
const SECRET_EXPIRY = 'corenexus.google.expiry';

// ─── Types ────────────────────────────────────────────────────────

interface GoogleTokenResponse {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
    scope: string;
}

interface GoogleUserInfo {
    id: string;
    email: string;
    name: string;
    picture?: string;
}

// ─── Provider ─────────────────────────────────────────────────────

/**
 * Custom VS Code AuthenticationProvider for Google OAuth 2.0.
 *
 * Uses a localhost redirect (PKCE / authorization code flow) to obtain
 * access + refresh tokens, stored in VS Code SecretStorage.
 *
 * The user must configure `corenexus.google.clientId` and optionally
 * `corenexus.google.clientSecret` in settings, pointing to their own
 * Google Cloud project OAuth credentials.
 */
export class GoogleAuthProvider implements vscode.AuthenticationProvider, vscode.Disposable {
    static readonly id = PROVIDER_ID;

    private readonly _secrets: vscode.SecretStorage;
    private readonly _outputChannel: vscode.OutputChannel;
    private readonly _disposables: vscode.Disposable[] = [];

    private readonly _onDidChangeSessions = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
    readonly onDidChangeSessions = this._onDidChangeSessions.event;

    /** Cached session to avoid reading SecretStorage on every call */
    private _cachedSession: vscode.AuthenticationSession | undefined;

    constructor(
        context: vscode.ExtensionContext,
        outputChannel: vscode.OutputChannel,
    ) {
        this._secrets = context.secrets;
        this._outputChannel = outputChannel;

        // Register ourselves as an authentication provider
        this._disposables.push(
            vscode.authentication.registerAuthenticationProvider(
                PROVIDER_ID,
                PROVIDER_LABEL,
                this,
                { supportsMultipleAccounts: false },
            ),
        );

        this._outputChannel.appendLine('[GoogleAuth] Provider registered');
    }

    // ─── AuthenticationProvider interface ──────────────────────────

    async getSessions(
        _scopes?: readonly string[],
    ): Promise<vscode.AuthenticationSession[]> {
        const session = await this._loadSession();
        return session ? [session] : [];
    }

    async createSession(
        _scopes: readonly string[],
    ): Promise<vscode.AuthenticationSession> {
        const clientId = this._getClientId();
        if (!clientId) {
            throw new Error(
                'Google OAuth client ID not configured. Set corenexus.google.clientId in settings.',
            );
        }

        this._outputChannel.appendLine('[GoogleAuth] Starting OAuth flow…');

        // 1. Generate PKCE code verifier/challenge
        const codeVerifier = crypto.randomBytes(32).toString('base64url');
        const codeChallenge = crypto
            .createHash('sha256')
            .update(codeVerifier)
            .digest('base64url');

        // 2. Start local HTTP server for redirect
        const { port, server } = await this._startCallbackServer();
        const redirectUri = `${LOCALHOST_REDIRECT}:${port}`;

        try {
            // 3. Build authorization URL
            const state = crypto.randomBytes(16).toString('hex');
            const params = new URLSearchParams({
                client_id: clientId,
                redirect_uri: redirectUri,
                response_type: 'code',
                scope: SCOPES.join(' '),
                access_type: 'offline',
                prompt: 'consent',
                state,
                code_challenge: codeChallenge,
                code_challenge_method: 'S256',
            });
            const authUrl = `${AUTH_URL}?${params.toString()}`;

            // 4. Open browser
            await vscode.env.openExternal(vscode.Uri.parse(authUrl));

            // 5. Wait for callback
            const code = await this._waitForCallback(server, state);

            // 6. Exchange code for tokens
            const clientSecret = this._getClientSecret();
            const tokenBody: Record<string, string> = {
                code,
                client_id: clientId,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code',
                code_verifier: codeVerifier,
            };
            if (clientSecret) {
                tokenBody.client_secret = clientSecret;
            }

            const tokenResponse = await this._fetchToken(tokenBody);

            // 7. Get user info
            const userInfo = await this._fetchUserInfo(tokenResponse.access_token);

            // 8. Store tokens
            const expiresAt = Date.now() + tokenResponse.expires_in * 1000;
            await this._secrets.store(SECRET_ACCESS_TOKEN, tokenResponse.access_token);
            if (tokenResponse.refresh_token) {
                await this._secrets.store(SECRET_REFRESH_TOKEN, tokenResponse.refresh_token);
            }
            await this._secrets.store(SECRET_ACCOUNT, JSON.stringify({
                id: userInfo.id,
                label: userInfo.email,
                name: userInfo.name,
            }));
            await this._secrets.store(SECRET_EXPIRY, String(expiresAt));

            // 9. Build session
            const session: vscode.AuthenticationSession = {
                id: `google-${userInfo.id}`,
                accessToken: tokenResponse.access_token,
                account: { id: userInfo.id, label: userInfo.email },
                scopes: SCOPES,
            };

            this._cachedSession = session;
            this._onDidChangeSessions.fire({
                added: [session],
                removed: [],
                changed: [],
            });

            this._outputChannel.appendLine(`[GoogleAuth] Signed in as ${userInfo.email}`);
            return session;
        } finally {
            server.close();
        }
    }

    async removeSession(sessionId: string): Promise<void> {
        const session = await this._loadSession();
        if (!session || session.id !== sessionId) {
            return;
        }

        // Revoke the token with Google
        try {
            const token = await this._secrets.get(SECRET_ACCESS_TOKEN);
            if (token) {
                await fetch(`${REVOKE_URL}?token=${token}`, { method: 'POST' });
            }
        } catch {
            // Best-effort revoke
        }

        // Clear stored tokens
        await this._secrets.delete(SECRET_ACCESS_TOKEN);
        await this._secrets.delete(SECRET_REFRESH_TOKEN);
        await this._secrets.delete(SECRET_ACCOUNT);
        await this._secrets.delete(SECRET_EXPIRY);

        this._cachedSession = undefined;
        this._onDidChangeSessions.fire({
            added: [],
            removed: [session],
            changed: [],
        });

        this._outputChannel.appendLine('[GoogleAuth] Signed out');
    }

    // ─── Public helpers ───────────────────────────────────────────

    /**
     * Get a valid access token, refreshing if expired.
     * Returns undefined if not signed in.
     */
    async getAccessToken(): Promise<string | undefined> {
        const session = await this._loadSession();
        if (!session) {
            return undefined;
        }

        // Check expiry
        const expiryStr = await this._secrets.get(SECRET_EXPIRY);
        const expiresAt = expiryStr ? parseInt(expiryStr, 10) : 0;
        const now = Date.now();

        // Refresh if within 5 minutes of expiry
        if (now > expiresAt - 5 * 60 * 1000) {
            const refreshed = await this._refreshAccessToken();
            if (refreshed) {
                return refreshed;
            }
            // Refresh failed — return stale token and let caller handle 401
            return session.accessToken;
        }

        return session.accessToken;
    }

    /** Check if user is authenticated (non-interactive) */
    async isAuthenticated(): Promise<boolean> {
        const session = await this._loadSession();
        return session !== undefined;
    }

    // ─── Private helpers ──────────────────────────────────────────

    private _getClientId(): string | undefined {
        return vscode.workspace
            .getConfiguration('corenexus.google')
            .get<string>('clientId', '')
            .trim() || undefined;
    }

    private _getClientSecret(): string | undefined {
        return vscode.workspace
            .getConfiguration('corenexus.google')
            .get<string>('clientSecret', '')
            .trim() || undefined;
    }

    /** Load session from SecretStorage */
    private async _loadSession(): Promise<vscode.AuthenticationSession | undefined> {
        if (this._cachedSession) {
            return this._cachedSession;
        }

        const token = await this._secrets.get(SECRET_ACCESS_TOKEN);
        const accountJson = await this._secrets.get(SECRET_ACCOUNT);
        if (!token || !accountJson) {
            return undefined;
        }

        try {
            const account = JSON.parse(accountJson);
            const session: vscode.AuthenticationSession = {
                id: `google-${account.id}`,
                accessToken: token,
                account: { id: account.id, label: account.label },
                scopes: SCOPES,
            };
            this._cachedSession = session;
            return session;
        } catch {
            return undefined;
        }
    }

    /** Refresh the access token using the stored refresh token */
    private async _refreshAccessToken(): Promise<string | undefined> {
        const refreshToken = await this._secrets.get(SECRET_REFRESH_TOKEN);
        const clientId = this._getClientId();
        if (!refreshToken || !clientId) {
            return undefined;
        }

        try {
            this._outputChannel.appendLine('[GoogleAuth] Refreshing access token…');
            const body: Record<string, string> = {
                refresh_token: refreshToken,
                client_id: clientId,
                grant_type: 'refresh_token',
            };
            const clientSecret = this._getClientSecret();
            if (clientSecret) {
                body.client_secret = clientSecret;
            }

            const tokenResponse = await this._fetchToken(body);
            const expiresAt = Date.now() + tokenResponse.expires_in * 1000;

            await this._secrets.store(SECRET_ACCESS_TOKEN, tokenResponse.access_token);
            await this._secrets.store(SECRET_EXPIRY, String(expiresAt));

            // Update refresh token if a new one was issued
            if (tokenResponse.refresh_token) {
                await this._secrets.store(SECRET_REFRESH_TOKEN, tokenResponse.refresh_token);
            }

            // Update cached session
            if (this._cachedSession) {
                this._cachedSession = {
                    ...this._cachedSession,
                    accessToken: tokenResponse.access_token,
                };
                this._onDidChangeSessions.fire({
                    added: [],
                    removed: [],
                    changed: [this._cachedSession],
                });
            }

            this._outputChannel.appendLine('[GoogleAuth] Token refreshed successfully');
            return tokenResponse.access_token;
        } catch (e: unknown) {
            this._outputChannel.appendLine(
                `[GoogleAuth] Token refresh failed: ${e instanceof Error ? e.message : e}`,
            );
            return undefined;
        }
    }

    /** Exchange code or refresh token for access token */
    private async _fetchToken(
        body: Record<string, string>,
    ): Promise<GoogleTokenResponse> {
        const response = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(body).toString(),
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Token exchange failed (${response.status}): ${text}`);
        }

        return response.json() as Promise<GoogleTokenResponse>;
    }

    /** Fetch Google user info for the signed-in user */
    private async _fetchUserInfo(accessToken: string): Promise<GoogleUserInfo> {
        const response = await fetch(USERINFO_URL, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch user info (${response.status})`);
        }

        return response.json() as Promise<GoogleUserInfo>;
    }

    /** Start a localhost HTTP server on an available port for the OAuth callback */
    private _startCallbackServer(): Promise<{ port: number; server: http.Server }> {
        return new Promise((resolve, reject) => {
            const server = http.createServer();
            const tryPort = (port: number) => {
                if (port > CALLBACK_PORT_RANGE[1]) {
                    reject(new Error('No available port for OAuth callback'));
                    return;
                }
                server.once('error', () => tryPort(port + 1));
                server.listen(port, '127.0.0.1', () => {
                    resolve({ port, server });
                });
            };
            tryPort(CALLBACK_PORT_RANGE[0]);
        });
    }

    /** Wait for the OAuth callback with the authorization code */
    private _waitForCallback(
        server: http.Server,
        expectedState: string,
    ): Promise<string> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                server.close();
                reject(new Error('OAuth callback timed out after 2 minutes'));
            }, 120_000);

            server.on('request', (req, res) => {
                const url = new URL(req.url ?? '/', `http://localhost`);
                const code = url.searchParams.get('code');
                const state = url.searchParams.get('state');
                const error = url.searchParams.get('error');

                if (error) {
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end('<html><body><h2>Authentication failed</h2><p>You can close this tab.</p></body></html>');
                    clearTimeout(timeout);
                    reject(new Error(`OAuth error: ${error}`));
                    return;
                }

                if (state !== expectedState) {
                    res.writeHead(400, { 'Content-Type': 'text/html' });
                    res.end('<html><body><h2>Invalid state</h2></body></html>');
                    return;
                }

                if (!code) {
                    res.writeHead(400, { 'Content-Type': 'text/html' });
                    res.end('<html><body><h2>No authorization code</h2></body></html>');
                    return;
                }

                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(
                    '<html><body style="font-family:system-ui;text-align:center;padding:60px">' +
                    '<h2>✅ Signed in to Google</h2>' +
                    '<p>You can close this tab and return to VS Code.</p>' +
                    '</body></html>',
                );

                clearTimeout(timeout);
                resolve(code);
            });
        });
    }

    dispose(): void {
        this._onDidChangeSessions.dispose();
        for (const d of this._disposables) {
            d.dispose();
        }
    }
}
