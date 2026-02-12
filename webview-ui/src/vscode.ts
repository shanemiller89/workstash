/** Type-safe wrapper for VS Code webview messaging */

interface VsCodeApi {
    postMessage(message: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

let _api: VsCodeApi | undefined;

function getApi(): VsCodeApi {
    if (!_api) {
        _api = acquireVsCodeApi();
    }
    return _api;
}

export function postMessage(type: string, data?: Record<string, unknown>): void {
    getApi().postMessage({ type, ...data });
}

export function onMessage(handler: (msg: { type: string; [key: string]: unknown }) => void): () => void {
    const listener = (event: MessageEvent) => {
        handler(event.data);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
}
