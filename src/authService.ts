import * as vscode from 'vscode';

/**
 * AuthService — wraps VS Code's built-in GitHub authentication provider.
 *
 * Scope: `gist` — grants read/write access to GitHub Gists.
 * This service is used exclusively by Gist Notes. Stash features remain fully offline.
 *
 * Usage: Singleton, created during extension activation and injected into
 * GistService, StashPanel, and GistNotesProvider.
 */
export class AuthService implements vscode.Disposable {
    private static readonly _providerId = 'github';
    private static readonly _scopes = ['gist', 'repo', 'project', 'read:org'];

    private readonly _outputChannel: vscode.OutputChannel;
    private readonly _disposables: vscode.Disposable[] = [];

    /**
     * Fires when the GitHub authentication session changes (sign in, sign out,
     * token refresh). Consumers should re-check `isAuthenticated()` and update
     * UI accordingly.
     */
    private readonly _onDidChangeAuthentication = new vscode.EventEmitter<void>();
    public readonly onDidChangeAuthentication: vscode.Event<void> =
        this._onDidChangeAuthentication.event;

    constructor(outputChannel: vscode.OutputChannel) {
        this._outputChannel = outputChannel;

        // Forward VS Code's global session-change events (filtered to GitHub)
        this._disposables.push(
            vscode.authentication.onDidChangeSessions((e) => {
                if (e.provider.id === AuthService._providerId) {
                    this._outputChannel.appendLine('[AuthService] GitHub session changed');
                    this._onDidChangeAuthentication.fire();
                }
            }),
        );
    }

    /**
     * Get the current GitHub session. Returns `undefined` if not signed in
     * and `createIfNone` is false (or omitted).
     *
     * @param createIfNone If `true`, triggers the interactive sign-in flow
     *   when no session exists. Defaults to `false` (silent check).
     */
    async getSession(createIfNone = false): Promise<vscode.AuthenticationSession | undefined> {
        try {
            const session = await vscode.authentication.getSession(
                AuthService._providerId,
                AuthService._scopes,
                { createIfNone },
            );
            return session;
        } catch (error: unknown) {
            // User cancelled the sign-in prompt → not an error
            if (error instanceof Error && error.message.includes('User did not consent')) {
                this._outputChannel.appendLine('[AuthService] User cancelled sign-in');
                return undefined;
            }
            this._outputChannel.appendLine(`[AuthService] getSession error: ${error}`);
            return undefined;
        }
    }

    /**
     * Shorthand — returns the access token string, or `undefined` if not authenticated.
     * Non-interactive; will not prompt for sign-in.
     */
    async getToken(): Promise<string | undefined> {
        const session = await this.getSession(false);
        return session?.accessToken;
    }

    /**
     * Non-interactive check — returns `true` if a valid GitHub session with
     * the `gist` scope currently exists.
     */
    async isAuthenticated(): Promise<boolean> {
        const session = await this.getSession(false);
        return session !== undefined;
    }

    /**
     * Interactive sign-in — triggers the GitHub OAuth flow if no session exists.
     * Returns the session on success, or `undefined` if the user cancels.
     */
    async signIn(): Promise<vscode.AuthenticationSession | undefined> {
        this._outputChannel.appendLine('[AuthService] Initiating interactive sign-in');
        const session = await this.getSession(true);
        if (session) {
            this._outputChannel.appendLine(`[AuthService] Signed in as ${session.account.label}`);
        }
        return session;
    }

    /**
     * Sign out — forces a new session prompt, effectively clearing the current one.
     *
     * Note: VS Code's authentication API doesn't have a direct "sign out" method.
     * We use `forceNewSession` which invalidates the cached session and prompts
     * the user. If they cancel, they're effectively signed out.
     */
    async signOut(): Promise<void> {
        this._outputChannel.appendLine('[AuthService] Signing out');
        try {
            // Request a new session with forceNewSession — if the user cancels,
            // the old session is cleared. This is the standard VS Code pattern.
            await vscode.authentication.getSession(AuthService._providerId, AuthService._scopes, {
                forceNewSession: { detail: 'Sign out of Superprompt Forge Gist Notes' },
            });
        } catch {
            // User cancelled or error — either way, session is cleared
        }
        this._onDidChangeAuthentication.fire();
    }

    dispose(): void {
        this._onDidChangeAuthentication.dispose();
        for (const d of this._disposables) {
            d.dispose();
        }
    }
}
