import * as vscode from 'vscode';

// ─── WebSocket Event Types ────────────────────────────────────────

export interface MmWsEvent {
    event: string;
    data: Record<string, unknown>;
    broadcast: {
        omit_users: Record<string, boolean> | null;
        user_id: string;
        channel_id: string;
        team_id: string;
    };
    seq: number;
}

export interface MmWsPostedData {
    channel_display_name: string;
    channel_name: string;
    channel_type: string;
    post: string; // JSON-encoded MmApiPost
    sender_name: string;
    team_id: string;
}

export interface MmWsTypingData {
    parent_id: string;
    user_id: string;
}

export interface MmWsStatusChangeData {
    status: 'online' | 'away' | 'offline' | 'dnd';
    user_id: string;
}

export interface MmWsReactionData {
    reaction: string; // JSON-encoded { user_id, post_id, emoji_name, create_at }
}

// ─── WebSocket Client ─────────────────────────────────────────────

/**
 * Persistent WebSocket connection to a Mattermost server.
 * Handles authentication, reconnection with exponential backoff,
 * and dispatches events via VS Code EventEmitters.
 */
export class MattermostWebSocket implements vscode.Disposable {
    private _ws: WebSocket | undefined;
    private _seq = 1;
    private _lastSeq = 0;
    private _reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    private _reconnectAttempts = 0;
    private _disposed = false;
    private _connected = false;
    private _serverUrl = '';
    private _token = '';
    private _heartbeatTimer: ReturnType<typeof setInterval> | undefined;

    private static readonly MAX_RECONNECT_DELAY_MS = 30_000;
    private static readonly BASE_RECONNECT_DELAY_MS = 1_000;
    private static readonly HEARTBEAT_INTERVAL_MS = 30_000;

    // ─── Events ───────────────────────────────────────────────────

    private readonly _onPosted = new vscode.EventEmitter<MmWsEvent>();
    readonly onPosted = this._onPosted.event;

    private readonly _onPostEdited = new vscode.EventEmitter<MmWsEvent>();
    readonly onPostEdited = this._onPostEdited.event;

    private readonly _onPostDeleted = new vscode.EventEmitter<MmWsEvent>();
    readonly onPostDeleted = this._onPostDeleted.event;

    private readonly _onTyping = new vscode.EventEmitter<MmWsEvent>();
    readonly onTyping = this._onTyping.event;

    private readonly _onStatusChange = new vscode.EventEmitter<MmWsEvent>();
    readonly onStatusChange = this._onStatusChange.event;

    private readonly _onReactionAdded = new vscode.EventEmitter<MmWsEvent>();
    readonly onReactionAdded = this._onReactionAdded.event;

    private readonly _onReactionRemoved = new vscode.EventEmitter<MmWsEvent>();
    readonly onReactionRemoved = this._onReactionRemoved.event;

    private readonly _onChannelViewed = new vscode.EventEmitter<MmWsEvent>();
    readonly onChannelViewed = this._onChannelViewed.event;

    private readonly _onConnectionChange = new vscode.EventEmitter<boolean>();
    /** Fires `true` on connect, `false` on disconnect */
    readonly onConnectionChange = this._onConnectionChange.event;

    constructor(private readonly _outputChannel: vscode.OutputChannel) {}

    // ─── Public API ───────────────────────────────────────────────

    get isConnected(): boolean {
        return this._connected;
    }

    get reconnectAttempts(): number {
        return this._reconnectAttempts;
    }

    /**
     * Connect (or reconnect) to the Mattermost WebSocket endpoint.
     * @param serverUrl  Base URL, e.g. `https://mattermost.example.com`
     * @param token      Auth token (PAT, session, or password-derived)
     */
    connect(serverUrl: string, token: string): void {
        this._serverUrl = serverUrl;
        this._token = token;
        this._reconnectAttempts = 0;
        this._doConnect();
    }

    /** Disconnect and stop reconnecting. */
    disconnect(): void {
        this._clearReconnect();
        this._clearHeartbeat();
        if (this._ws) {
            try {
                this._ws.close(1000, 'Client disconnect');
            } catch { /* ignore */ }
            this._ws = undefined;
        }
        if (this._connected) {
            this._connected = false;
            this._onConnectionChange.fire(false);
        }
    }

    /** Send a `user_typing` action for the given channel. */
    sendTyping(channelId: string, parentId = ''): void {
        this._send({
            action: 'user_typing',
            seq: this._seq++,
            data: { channel_id: channelId, parent_id: parentId },
        });
    }

    // ─── Internal ─────────────────────────────────────────────────

    private _doConnect(): void {
        if (this._disposed) { return; }

        // Build ws:// or wss:// URL from the http(s) server URL
        const wsUrl = this._serverUrl
            .replace(/^https:/, 'wss:')
            .replace(/^http:/, 'ws:')
            .replace(/\/+$/, '') + '/api/v4/websocket';

        this._outputChannel.appendLine(`[MM-WS] Connecting to ${wsUrl}`);

        try {
            this._ws = new WebSocket(wsUrl);
        } catch (err: unknown) {
            this._outputChannel.appendLine(
                `[MM-WS] Failed to create WebSocket: ${err instanceof Error ? err.message : err}`,
            );
            this._scheduleReconnect();
            return;
        }

        this._ws.onopen = () => {
            this._outputChannel.appendLine('[MM-WS] Connected, sending auth challenge');
            this._send({
                seq: this._seq++,
                action: 'authentication_challenge',
                data: { token: this._token },
            });
        };

        this._ws.onmessage = (event) => {
            this._handleRawMessage(event.data as string);
        };

        this._ws.onerror = () => {
            this._outputChannel.appendLine('[MM-WS] WebSocket error occurred');
        };

        this._ws.onclose = (event) => {
            this._outputChannel.appendLine(
                `[MM-WS] Closed: code=${event.code} reason=${event.reason}`,
            );
            this._clearHeartbeat();
            if (this._connected) {
                this._connected = false;
                this._onConnectionChange.fire(false);
            }
            if (!this._disposed) {
                this._scheduleReconnect();
            }
        };
    }

    private _handleRawMessage(raw: string): void {
        let msg: Record<string, unknown>;
        try {
            msg = JSON.parse(raw) as Record<string, unknown>;
        } catch {
            return;
        }

        // Auth success response
        if (msg.status === 'OK' && msg.seq_reply !== undefined) {
            this._outputChannel.appendLine('[MM-WS] Authenticated successfully');
            this._connected = true;
            this._reconnectAttempts = 0;
            this._onConnectionChange.fire(true);
            this._startHeartbeat();
            return;
        }

        // Auth failure
        if (msg.status === 'FAIL') {
            this._outputChannel.appendLine(
                `[MM-WS] Auth failed: ${JSON.stringify(msg.error ?? '')}`,
            );
            return;
        }

        // Server hello
        if (msg.event === 'hello') {
            this._outputChannel.appendLine(
                `[MM-WS] Server hello — version ${(msg.data as Record<string, unknown>)?.server_version ?? '?'}`,
            );
            return;
        }

        const event = msg as unknown as MmWsEvent;
        if (event.seq !== undefined) {
            this._lastSeq = event.seq;
        }

        this._dispatchEvent(event);
    }

    private _dispatchEvent(event: MmWsEvent): void {
        switch (event.event) {
            case 'posted':
                this._onPosted.fire(event);
                break;
            case 'post_edited':
                this._onPostEdited.fire(event);
                break;
            case 'post_deleted':
                this._onPostDeleted.fire(event);
                break;
            case 'typing':
                this._onTyping.fire(event);
                break;
            case 'status_change':
                this._onStatusChange.fire(event);
                break;
            case 'reaction_added':
                this._onReactionAdded.fire(event);
                break;
            case 'reaction_removed':
                this._onReactionRemoved.fire(event);
                break;
            case 'channel_viewed':
                this._onChannelViewed.fire(event);
                break;
            // Other events logged for debugging
            default:
                this._outputChannel.appendLine(`[MM-WS] Event: ${event.event}`);
                break;
        }
    }

    private _send(data: unknown): void {
        if (this._ws && this._ws.readyState === WebSocket.OPEN) {
            this._ws.send(JSON.stringify(data));
        }
    }

    private _startHeartbeat(): void {
        this._clearHeartbeat();
        this._heartbeatTimer = setInterval(() => {
            // Mattermost expects pings to keep connection alive
            if (this._ws && this._ws.readyState === WebSocket.OPEN) {
                this._send({ action: 'ping', seq: this._seq++ });
            }
        }, MattermostWebSocket.HEARTBEAT_INTERVAL_MS);
    }

    private _clearHeartbeat(): void {
        if (this._heartbeatTimer) {
            clearInterval(this._heartbeatTimer);
            this._heartbeatTimer = undefined;
        }
    }

    private _scheduleReconnect(): void {
        if (this._disposed || this._reconnectTimer) { return; }

        const delay = Math.min(
            MattermostWebSocket.BASE_RECONNECT_DELAY_MS * Math.pow(2, this._reconnectAttempts),
            MattermostWebSocket.MAX_RECONNECT_DELAY_MS,
        );
        this._reconnectAttempts++;

        this._outputChannel.appendLine(
            `[MM-WS] Reconnecting in ${delay}ms (attempt ${this._reconnectAttempts})`,
        );

        this._reconnectTimer = setTimeout(() => {
            this._reconnectTimer = undefined;
            this._doConnect();
        }, delay);
    }

    private _clearReconnect(): void {
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = undefined;
        }
    }

    // ─── Dispose ──────────────────────────────────────────────────

    dispose(): void {
        this._disposed = true;
        this.disconnect();
        this._onPosted.dispose();
        this._onPostEdited.dispose();
        this._onPostDeleted.dispose();
        this._onTyping.dispose();
        this._onStatusChange.dispose();
        this._onReactionAdded.dispose();
        this._onReactionRemoved.dispose();
        this._onChannelViewed.dispose();
        this._onConnectionChange.dispose();
    }
}
