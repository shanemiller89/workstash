import * as https from 'https';
import * as vscode from 'vscode';

/**
 * GeminiService — direct REST API client for the Google Gemini API.
 * Used as a fallback when the VS Code Language Model API (`vscode.lm`) is not
 * available (e.g. Cursor, Windsurf, Antigravity).
 *
 * Uses raw `https` — zero npm dependencies.
 */

/** A single message part in the Gemini format. */
interface GeminiPart {
    text: string;
}

/** A Gemini content message (role + parts). */
interface GeminiContent {
    role: 'user' | 'model';
    parts: GeminiPart[];
}

/** Shape of a single streaming SSE chunk from Gemini. */
interface GeminiStreamChunk {
    candidates?: Array<{
        content?: {
            parts?: Array<{ text?: string }>;
        };
        finishReason?: string;
    }>;
    error?: { message?: string; code?: number };
}

/** Gemini model descriptor. */
export interface GeminiModelInfo {
    id: string;
    name: string;
    displayName: string;
}

/** Available Gemini models that support generateContent. */
const GEMINI_MODELS: GeminiModelInfo[] = [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', displayName: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', displayName: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', displayName: 'Gemini 2.0 Flash' },
    { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite', displayName: 'Gemini 2.0 Flash Lite' },
];

const API_BASE = 'generativelanguage.googleapis.com';
const API_VERSION = 'v1beta';

export class GeminiService {
    private readonly _outputChannel: vscode.OutputChannel;

    constructor(outputChannel: vscode.OutputChannel) {
        this._outputChannel = outputChannel;
    }

    /** Read the API key from settings. Returns empty string if not set. */
    static getApiKey(): string {
        return vscode.workspace.getConfiguration('superprompt-forge.ai').get<string>('geminiApiKey', '');
    }

    /** Whether a Gemini API key is configured. */
    static isConfigured(): boolean {
        return GeminiService.getApiKey().length > 0;
    }

    /** Return the list of available Gemini models. */
    listModels(): GeminiModelInfo[] {
        return [...GEMINI_MODELS];
    }

    /**
     * Generate content (non-streaming) from Gemini.
     */
    async generateContent(
        model: string,
        messages: Array<{ role: 'user' | 'model'; content: string }>,
        _token?: vscode.CancellationToken,
    ): Promise<string> {
        const apiKey = GeminiService.getApiKey();
        if (!apiKey) {
            throw new Error('Gemini API key not configured. Set it in Settings → Superprompt Forge → AI → Gemini API Key.');
        }

        const contents: GeminiContent[] = messages.map((m) => ({
            role: m.role,
            parts: [{ text: m.content }],
        }));

        const body = JSON.stringify({ contents });
        const path = `/${API_VERSION}/models/${model}:generateContent?key=${apiKey}`;

        return new Promise<string>((resolve, reject) => {
            const req = https.request(
                {
                    hostname: API_BASE,
                    path,
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                },
                (res) => {
                    let data = '';
                    res.on('data', (chunk: Buffer) => {
                        data += chunk.toString();
                    });
                    res.on('end', () => {
                        try {
                            const json = JSON.parse(data) as GeminiStreamChunk & Record<string, unknown>;
                            if (json.error) {
                                reject(new Error(`Gemini API error: ${json.error.message ?? 'Unknown error'} (code ${json.error.code ?? '?'})`));
                                return;
                            }
                            const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
                            resolve(text);
                        } catch (e: unknown) {
                            reject(new Error(`Failed to parse Gemini response: ${e instanceof Error ? e.message : e}`));
                        }
                    });
                },
            );

            req.on('error', (e) => reject(new Error(`Gemini request failed: ${e.message}`)));
            req.write(body);
            req.end();
        });
    }

    /**
     * Stream content from Gemini using SSE.
     * Calls `onChunk` for each text fragment as it arrives.
     */
    async streamContent(
        model: string,
        messages: Array<{ role: 'user' | 'model'; content: string }>,
        onChunk: (chunk: string) => void,
        token?: vscode.CancellationToken,
    ): Promise<string> {
        const apiKey = GeminiService.getApiKey();
        if (!apiKey) {
            throw new Error('Gemini API key not configured. Set it in Settings → Superprompt Forge → AI → Gemini API Key.');
        }

        const contents: GeminiContent[] = messages.map((m) => ({
            role: m.role,
            parts: [{ text: m.content }],
        }));

        const body = JSON.stringify({ contents });
        const path = `/${API_VERSION}/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

        return new Promise<string>((resolve, reject) => {
            const req = https.request(
                {
                    hostname: API_BASE,
                    path,
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                },
                (res) => {
                    if (res.statusCode && res.statusCode >= 400) {
                        let errData = '';
                        res.on('data', (chunk: Buffer) => {
                            errData += chunk.toString();
                        });
                        res.on('end', () => {
                            try {
                                const errJson = JSON.parse(errData) as { error?: { message?: string; code?: number } };
                                reject(new Error(`Gemini API error (${res.statusCode}): ${errJson.error?.message ?? errData}`));
                            } catch {
                                reject(new Error(`Gemini API error (${res.statusCode}): ${errData}`));
                            }
                        });
                        return;
                    }

                    let result = '';
                    let buffer = '';

                    res.on('data', (chunk: Buffer) => {
                        buffer += chunk.toString();

                        // Parse SSE lines
                        const lines = buffer.split('\n');
                        buffer = lines.pop() ?? ''; // Keep the incomplete last line

                        for (const line of lines) {
                            if (!line.startsWith('data: ')) {
                                continue;
                            }
                            const jsonStr = line.slice(6).trim();
                            if (!jsonStr || jsonStr === '[DONE]') {
                                continue;
                            }
                            try {
                                const parsed = JSON.parse(jsonStr) as GeminiStreamChunk;
                                if (parsed.error) {
                                    reject(new Error(`Gemini stream error: ${parsed.error.message ?? 'Unknown'}`));
                                    req.destroy();
                                    return;
                                }
                                const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
                                if (text) {
                                    result += text;
                                    onChunk(text);
                                }
                            } catch {
                                // Skip malformed SSE lines
                                this._outputChannel.appendLine(`[Gemini] Skipping malformed SSE line: ${jsonStr.substring(0, 100)}`);
                            }
                        }
                    });

                    res.on('end', () => {
                        resolve(result);
                    });

                    res.on('error', (e) => {
                        reject(new Error(`Gemini stream error: ${e.message}`));
                    });
                },
            );

            // Handle cancellation
            if (token) {
                token.onCancellationRequested(() => {
                    req.destroy();
                    reject(new Error('Gemini request cancelled'));
                });
            }

            req.on('error', (e) => reject(new Error(`Gemini request failed: ${e.message}`)));
            req.write(body);
            req.end();
        });
    }
}
