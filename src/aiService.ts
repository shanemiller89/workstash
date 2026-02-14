import * as vscode from 'vscode';
import { GeminiService } from './geminiService';

/** Lightweight model descriptor safe for serialization to the webview. */
export interface AiModelInfo {
    id: string;
    name: string;
    vendor: string;
    family: string;
}

/** Which AI provider is active. */
export type AiProvider = 'copilot' | 'gemini' | 'none';

/** Which purpose a model is assigned to. */
export type AiModelPurpose = 'summary' | 'chat' | 'agent';

/**
 * AiService — uses the VS Code Language Model API (Copilot) or the Gemini REST
 * API to generate summaries and answer questions about workspace data.
 *
 * Provider priority:
 *   1. `vscode.lm` (GitHub Copilot) — preferred, zero-config
 *   2. Gemini API key — fallback for Cursor / Windsurf / Antigravity
 */
export class AiService {
    private readonly _outputChannel: vscode.OutputChannel;
    private readonly _geminiService: GeminiService;

    /** Per-purpose model overrides. Key = purpose, value = model id. */
    private _modelOverrides: Record<string, string> = {};

    constructor(outputChannel: vscode.OutputChannel) {
        this._outputChannel = outputChannel;
        this._geminiService = new GeminiService(outputChannel);

        // Load persisted model overrides from VS Code settings
        const aiConfig = vscode.workspace.getConfiguration('workstash.ai');
        for (const purpose of ['summary', 'chat', 'agent'] as const) {
            const saved = aiConfig.get<string>(`modelOverride.${purpose}`, '');
            if (saved) {
                this._modelOverrides[purpose] = saved;
            }
        }
    }

    // ─── Provider detection ───────────────────────────────────────

    /**
     * Check whether the VS Code Language Model API is available.
     * This is false in editors like Cursor / Windsurf that don't implement `vscode.lm`.
     */
    static isCopilotAvailable(): boolean {
        try {
            return typeof vscode.lm !== 'undefined' && typeof vscode.lm.selectChatModels === 'function';
        } catch {
            return false;
        }
    }

    /** Legacy alias for isCopilotAvailable(). */
    static isAvailable(): boolean {
        return AiService.isCopilotAvailable() || GeminiService.isConfigured();
    }

    /** Determine which provider is active. */
    static activeProvider(): AiProvider {
        if (AiService.isCopilotAvailable()) { return 'copilot'; }
        if (GeminiService.isConfigured()) { return 'gemini'; }
        return 'none';
    }

    // ─── Model management ─────────────────────────────────────────

    /** List all available chat models. */
    async listModels(): Promise<AiModelInfo[]> {
        const provider = AiService.activeProvider();

        if (provider === 'copilot') {
            try {
                const models = await vscode.lm.selectChatModels();
                return models.map((m) => ({
                    id: m.id,
                    name: m.name,
                    vendor: m.vendor,
                    family: m.family,
                }));
            } catch (e: unknown) {
                this._outputChannel.appendLine(
                    `[AI] Failed to list Copilot models: ${e instanceof Error ? e.message : e}`,
                );
                return [];
            }
        }

        if (provider === 'gemini') {
            return this._geminiService.listModels().map((m) => ({
                id: m.id,
                name: m.name,
                vendor: 'google',
                family: 'gemini',
            }));
        }

        return [];
    }

    /** Set a model override for a specific purpose. Pass empty string to clear. Persisted to VS Code settings. */
    setModel(purpose: AiModelPurpose, modelId: string): void {
        if (modelId) {
            this._modelOverrides[purpose] = modelId;
            this._outputChannel.appendLine(`[AI] Model for ${purpose} set to: ${modelId}`);
        } else {
            delete this._modelOverrides[purpose];
            this._outputChannel.appendLine(`[AI] Model for ${purpose} reset to default`);
        }
        // Persist to VS Code settings
        vscode.workspace
            .getConfiguration('workstash.ai')
            .update(`modelOverride.${purpose}`, modelId || undefined, vscode.ConfigurationTarget.Global);
    }

    /** Get the current model assignments. */
    getModelAssignments(): Record<string, string> {
        return { ...this._modelOverrides };
    }

    /** Get the currently selected Gemini model id for a purpose. */
    private _getGeminiModel(purpose?: AiModelPurpose): string {
        const overrideId = purpose ? this._modelOverrides[purpose] : undefined;
        if (overrideId && this._geminiService.listModels().some((m) => m.id === overrideId)) {
            return overrideId;
        }
        // Fall back to the user's configured default, then 'gemini-2.5-flash'
        return vscode.workspace.getConfiguration('workstash.ai').get<string>('geminiModel', 'gemini-2.5-flash');
    }

    /**
     * Select a Copilot chat model for a specific purpose.
     * Uses the per-purpose override if set, otherwise falls back to gpt-4o → any copilot.
     */
    private async _selectCopilotModel(purpose?: AiModelPurpose): Promise<vscode.LanguageModelChat | undefined> {
        try {
            // Check for per-purpose override
            const overrideId = purpose ? this._modelOverrides[purpose] : undefined;
            if (overrideId) {
                const byId = await vscode.lm.selectChatModels({ id: overrideId });
                if (byId.length > 0) {
                    this._outputChannel.appendLine(`[AI] Using override model for ${purpose}: ${byId[0].name}`);
                    return byId[0];
                }
                this._outputChannel.appendLine(`[AI] Override model ${overrideId} not found, falling back`);
            }

            // Try gpt-4o first
            const preferred = await vscode.lm.selectChatModels({
                vendor: 'copilot',
                family: 'gpt-4o',
            });
            if (preferred.length > 0) {
                return preferred[0];
            }

            // Fall back to any copilot model
            const fallback = await vscode.lm.selectChatModels({ vendor: 'copilot' });
            if (fallback.length > 0) {
                return fallback[0];
            }

            this._outputChannel.appendLine('[AI] No Copilot language models available');
            return undefined;
        } catch (e: unknown) {
            this._outputChannel.appendLine(
                `[AI] Failed to select Copilot model: ${e instanceof Error ? e.message : e}`,
            );
            return undefined;
        }
    }

    /**
     * Find the Copilot web search tool from available LM tools.
     * Looks for tools with common web search names/tags.
     */
    private _findWebSearchTool(): vscode.LanguageModelChatTool | undefined {
        const tools = vscode.lm.tools;
        // Look for the Copilot web search tool by known name patterns
        const webSearchTool = tools.find(
            (t) =>
                t.name.toLowerCase().includes('websearch') ||
                t.name.toLowerCase().includes('web_search') ||
                t.name.toLowerCase() === 'copilot_websearch',
        );
        if (webSearchTool) {
            return webSearchTool;
        }
        // Fallback: look by tags
        const byTag = tools.find(
            (t) => t.tags.some((tag) => tag.includes('search') || tag.includes('web')),
        );
        return byTag;
    }

    /**
     * Generate a summary for a specific tab's data.
     */
    async summarize(
        tabKey: string,
        contextData: string,
        customSystemPrompt?: string,
        token?: vscode.CancellationToken,
    ): Promise<string> {
        const provider = AiService.activeProvider();
        if (provider === 'none') {
            throw new Error('No AI provider available. Install GitHub Copilot or configure a Gemini API key.');
        }

        const systemPrompt = customSystemPrompt?.trim() ||
            `You are a concise development assistant embedded in a VS Code extension called WorkStash. 
Your job is to summarize workspace data into a brief, actionable status card.
Use short, scannable bullet points — not full sentences. Use emoji sparingly for visual cues.
Focus on what's actionable: what needs attention, what changed recently, key stats.
You may use **bold** for emphasis and bullet lists. Keep it under 150 words.
Do NOT use markdown headers (##) in brief summaries.`;

        const userPrompt = this._buildSummaryPrompt(tabKey, contextData);

        if (provider === 'gemini') {
            return this._geminiService.generateContent(
                this._getGeminiModel('summary'),
                [
                    { role: 'user', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                token,
            );
        }

        // Copilot path
        const model = await this._selectCopilotModel('summary');
        if (!model) {
            throw new Error('No AI model available. Make sure GitHub Copilot is installed and signed in.');
        }

        const messages = [
            vscode.LanguageModelChatMessage.User(systemPrompt),
            vscode.LanguageModelChatMessage.User(userPrompt),
        ];

        try {
            const response = await model.sendRequest(messages, {}, token);
            let result = '';
            for await (const chunk of response.text) {
                result += chunk;
            }
            return result.trim();
        } catch (e: unknown) {
            if (e instanceof vscode.LanguageModelError) {
                this._outputChannel.appendLine(`[AI] LM error: ${e.message} (${e.code})`);
                throw new Error(`AI request failed: ${e.message}`);
            }
            throw e;
        }
    }

    /**
     * Chat: answer a user question using all available workspace context.
     * Streams the response back via a callback.
     * When `webSearch` is true, the web search tool is offered to the model (Copilot only).
     */
    async chat(
        question: string,
        contextData: string,
        history: Array<{ role: 'user' | 'assistant'; content: string }>,
        onChunk: (chunk: string) => void,
        token?: vscode.CancellationToken,
        webSearch?: boolean,
    ): Promise<string> {
        const provider = AiService.activeProvider();
        if (provider === 'none') {
            throw new Error('No AI provider available. Install GitHub Copilot or configure a Gemini API key.');
        }

        const systemPrompt = `You are a helpful development assistant embedded in a VS Code extension called WorkStash.
You have access to the user's workspace data: git stashes, GitHub PRs, Issues, Projects, Gist notes, and Mattermost chat.
Answer questions about this data concisely and accurately. Reference specific items by number/name when relevant.
If the data doesn't contain the answer, say so. Use markdown formatting for readability.
Keep answers focused and under 300 words unless the user asks for detail.${webSearch && provider === 'copilot' ? '\nYou also have access to a web search tool. Use it when the user asks about external information, documentation, or anything not in the workspace data.' : ''}`;

        // ─── Gemini path ─────────────────────────────────────
        if (provider === 'gemini') {
            const messages: Array<{ role: 'user' | 'model'; content: string }> = [
                { role: 'user', content: systemPrompt },
                { role: 'user', content: `Here is the current workspace data:\n\n${contextData}\n\nUse this data to answer the user's questions.` },
            ];
            for (const msg of history.slice(-10)) {
                messages.push({
                    role: msg.role === 'user' ? 'user' : 'model',
                    content: msg.content,
                });
            }
            messages.push({ role: 'user', content: question });

            return this._geminiService.streamContent(
                this._getGeminiModel('chat'),
                messages,
                onChunk,
                token,
            );
        }

        // ─── Copilot path ────────────────────────────────────
        const model = await this._selectCopilotModel('chat');
        if (!model) {
            throw new Error('No AI model available. Make sure GitHub Copilot is installed and signed in.');
        }

        const messages: vscode.LanguageModelChatMessage[] = [
            vscode.LanguageModelChatMessage.User(systemPrompt),
            vscode.LanguageModelChatMessage.User(
                `Here is the current workspace data:\n\n${contextData}\n\nUse this data to answer the user's questions.`,
            ),
        ];

        // Add conversation history
        for (const msg of history.slice(-10)) {
            if (msg.role === 'user') {
                messages.push(vscode.LanguageModelChatMessage.User(msg.content));
            } else {
                messages.push(vscode.LanguageModelChatMessage.Assistant(msg.content));
            }
        }

        // Add current question
        messages.push(vscode.LanguageModelChatMessage.User(question));

        // Resolve web search tool if enabled
        const requestOptions: vscode.LanguageModelChatRequestOptions = {};
        if (webSearch) {
            const webSearchTool = this._findWebSearchTool();
            if (webSearchTool) {
                requestOptions.tools = [webSearchTool];
                this._outputChannel.appendLine(`[AI] Web search tool enabled: ${webSearchTool.name}`);
            } else {
                this._outputChannel.appendLine('[AI] Web search requested but no web search tool found');
            }
        }

        try {
            let result = '';
            const maxToolRounds = 5;

            for (let round = 0; round <= maxToolRounds; round++) {
                const response = await model.sendRequest(messages, requestOptions, token);
                const toolCalls: vscode.LanguageModelToolCallPart[] = [];
                let responseStr = '';

                for await (const part of response.stream) {
                    if (part instanceof vscode.LanguageModelTextPart) {
                        responseStr += part.value;
                        result += part.value;
                        onChunk(part.value);
                    } else if (part instanceof vscode.LanguageModelToolCallPart) {
                        toolCalls.push(part);
                    }
                }

                // If no tool calls, we're done
                if (toolCalls.length === 0) {
                    break;
                }

                this._outputChannel.appendLine(`[AI] Model requested ${toolCalls.length} tool call(s) in round ${round + 1}`);

                // Add assistant message with tool calls
                messages.push(
                    vscode.LanguageModelChatMessage.Assistant([
                        ...(responseStr ? [new vscode.LanguageModelTextPart(responseStr)] : []),
                        ...toolCalls,
                    ]),
                );

                // Invoke each tool and add results
                for (const toolCall of toolCalls) {
                    try {
                        this._outputChannel.appendLine(`[AI] Invoking tool: ${toolCall.name} (${toolCall.callId})`);
                        const toolResult = await vscode.lm.invokeTool(
                            toolCall.name,
                            { input: toolCall.input, toolInvocationToken: undefined },
                            token ?? new vscode.CancellationTokenSource().token,
                        );

                        messages.push(
                            vscode.LanguageModelChatMessage.User([
                                new vscode.LanguageModelToolResultPart(toolCall.callId, toolResult.content),
                            ]),
                        );
                    } catch (toolErr: unknown) {
                        const errMsg = toolErr instanceof Error ? toolErr.message : 'Tool invocation failed';
                        this._outputChannel.appendLine(`[AI] Tool error: ${errMsg}`);
                        messages.push(
                            vscode.LanguageModelChatMessage.User([
                                new vscode.LanguageModelToolResultPart(toolCall.callId, [
                                    new vscode.LanguageModelTextPart(`Error: ${errMsg}`),
                                ]),
                            ]),
                        );
                    }
                }
            }

            return result.trim();
        } catch (e: unknown) {
            if (e instanceof vscode.LanguageModelError) {
                this._outputChannel.appendLine(`[AI] LM error: ${e.message} (${e.code})`);
                throw new Error(`AI request failed: ${e.message}`);
            }
            throw e;
        }
    }

    /**
     * Build a tab-specific summary prompt.
     */
    private _buildSummaryPrompt(tabKey: string, contextData: string): string {
        const tabLabels: Record<string, string> = {
            stashes: 'Git Stashes',
            prs: 'Pull Requests',
            issues: 'Issues',
            projects: 'Projects',
            notes: 'Gist Notes',
            mattermost: 'Mattermost Chat',
        };

        const label = tabLabels[tabKey] ?? tabKey;

        return `Summarize the current state of the user's ${label} data into a brief status card.
Focus on: counts, what needs attention, recent activity, and any actionable items.

Data:
${contextData}`;
    }

    // ─── Agent templates ──────────────────────────────────────────

    private static readonly AGENT_TEMPLATES: Record<string, string> = {
        sprint: `You are a senior engineering manager creating a sprint status report.
Analyze ALL the workspace data provided and produce a comprehensive sprint overview with these sections:
## Sprint Overview
- Overall velocity and health assessment
## Pull Requests
- PRs ready to merge, PRs needing review, stale PRs
## Issues & Projects
- Open issues by priority/label, project board status, blockers
## Code Activity
- Stash activity (work-in-progress indicators), branch patterns
## Team Communication
- Mattermost highlights, unread threads, action items from chat
## Recommendations
- Top 3 actions the team should take today

Use markdown formatting. Be specific — reference PR numbers, issue titles, etc.`,

        review: `You are a senior code reviewer analyzing the workspace for code review status.
Produce a detailed code review report:
## Review Dashboard
- PRs awaiting review (list each with age, author, size)
- PRs with unresolved comments
- PRs with requested changes
## Risk Assessment
- Large PRs (high additions/deletions) that need careful review
- PRs that have been open longest
- Draft PRs that might need help
## Suggested Review Order
- Prioritized list of which PRs to review first and why
## Related Issues
- Link PRs to their related issues where possible

Be specific with PR numbers and issue references.`,

        activity: `You are a team activity analyst reviewing the workspace.
Produce a team activity summary:
## Today's Snapshot
- What changed recently across all data sources
- New PRs, closed issues, updated projects
## Work In Progress
- Active stashes (uncommitted work)
- Open draft PRs
- Issues in progress
## Communication
- Mattermost channel activity, any mentions or urgent messages
- Notes recently updated
## Attention Needed
- Items that may be blocked or stale
- Anything that looks unusual or needs follow-up

Keep it scannable with bullet points.`,

        custom: `You are an expert development assistant with deep knowledge of software workflows.
Analyze the workspace data provided and respond to the user's custom prompt.
Be thorough, specific, and reference actual data items by name/number.
Use markdown formatting with clear sections.`,
    };

    /**
     * Agent: deep analysis using a template or custom prompt.
     * Streams the response back via a callback.
     */
    async agentAnalysis(
        template: string,
        customPrompt: string,
        contextData: string,
        onChunk: (chunk: string) => void,
        token?: vscode.CancellationToken,
        customSystemPrompt?: string,
    ): Promise<string> {
        const provider = AiService.activeProvider();
        if (provider === 'none') {
            throw new Error('No AI provider available. Install GitHub Copilot or configure a Gemini API key.');
        }

        const systemPrompt = customSystemPrompt?.trim() ||
            AiService.AGENT_TEMPLATES[template] ||
            AiService.AGENT_TEMPLATES['custom'];

        // ─── Gemini path ─────────────────────────────────────
        if (provider === 'gemini') {
            const messages: Array<{ role: 'user' | 'model'; content: string }> = [
                { role: 'user', content: systemPrompt },
                { role: 'user', content: `Here is the complete workspace data to analyze:\n\n${contextData}` },
            ];
            if (customPrompt.trim()) {
                messages.push({ role: 'user', content: `Additional instructions from the user:\n${customPrompt}` });
            }

            return this._geminiService.streamContent(
                this._getGeminiModel('agent'),
                messages,
                onChunk,
                token,
            );
        }

        // ─── Copilot path ────────────────────────────────────
        const model = await this._selectCopilotModel('agent');
        if (!model) {
            throw new Error('No AI model available. Make sure GitHub Copilot is installed and signed in.');
        }

        const messages: vscode.LanguageModelChatMessage[] = [
            vscode.LanguageModelChatMessage.User(systemPrompt),
            vscode.LanguageModelChatMessage.User(
                `Here is the complete workspace data to analyze:\n\n${contextData}`,
            ),
        ];

        if (customPrompt.trim()) {
            messages.push(
                vscode.LanguageModelChatMessage.User(
                    `Additional instructions from the user:\n${customPrompt}`,
                ),
            );
        }

        try {
            const response = await model.sendRequest(messages, {}, token);
            let result = '';
            for await (const chunk of response.text) {
                result += chunk;
                onChunk(chunk);
            }
            return result.trim();
        } catch (e: unknown) {
            if (e instanceof vscode.LanguageModelError) {
                this._outputChannel.appendLine(`[AI] Agent LM error: ${e.message} (${e.code})`);
                throw new Error(`AI request failed: ${e.message}`);
            }
            throw e;
        }
    }
}
