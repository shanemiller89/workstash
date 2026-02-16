import * as vscode from 'vscode';
import { AiService } from '../aiService';
import { extractErrorMessage } from '../utils';
import type { HandlerContext, MessageHandler } from './types';

/** Handle all `ai.*` messages from the webview. */
export const handleAiMessage: MessageHandler = async (ctx, msg) => {
    switch (msg.type) {
        case 'ai.listModels': {
            if (!AiService.isAvailable()) {
                ctx.postMessage({ type: 'aiModelList', models: [], assignments: {} });
                return true;
            }
            try {
                const models = await ctx.aiService.listModels();
                const assignments = ctx.aiService.getModelAssignments();
                ctx.postMessage({
                    type: 'aiModelList',
                    models,
                    assignments,
                });
            } catch (e: unknown) {
                ctx.outputChannel.appendLine(
                    `[AI] Failed to list models: ${extractErrorMessage(e)}`,
                );
            }
            return true;
        }

        case 'ai.setModel': {
            if (!AiService.isAvailable()) { return true; }
            const purpose = msg.purpose as string | undefined;
            const modelId = msg.modelId as string | undefined;
            if (purpose) {
                ctx.aiService.setModel(
                    purpose as import('../aiService').AiModelPurpose,
                    modelId ?? '',
                );
                // Send back updated assignments
                const models = await ctx.aiService.listModels();
                const assignments = ctx.aiService.getModelAssignments();
                ctx.postMessage({
                    type: 'aiModelList',
                    models,
                    assignments,
                });
            }
            return true;
        }

        case 'ai.summarize': {
            if (!AiService.isAvailable()) {
                ctx.postMessage({ type: 'aiSummaryError', tabKey: msg.tabKey, error: 'AI features require GitHub Copilot' });
                return true;
            }
            if (!msg.tabKey) { return true; }
            const tabKey = msg.tabKey;
            const customPrompt = msg.customPrompt as string | undefined;
            try {
                const contextData = await ctx.gatherContext(tabKey);
                ctx.outputChannel.appendLine(`[AI] Summarize ${tabKey} — context length: ${contextData.length} chars${customPrompt ? ' (custom prompt)' : ''}`);
                const result = await ctx.aiService.summarize(tabKey, contextData, customPrompt);
                ctx.postMessage({
                    type: 'aiSummaryResult',
                    tabKey,
                    content: result,
                });
            } catch (e: unknown) {
                const m = extractErrorMessage(e);
                ctx.postMessage({
                    type: 'aiSummaryError',
                    tabKey,
                    error: m,
                });
            }
            return true;
        }

        case 'ai.chat': {
            if (!AiService.isAvailable()) {
                ctx.postMessage({ type: 'aiChatError', messageId: '', error: 'AI features require GitHub Copilot' });
                return true;
            }
            if (!msg.question) { return true; }
            const question = msg.question;
            const history = msg.history ?? [];
            const webSearch = msg.webSearch === true;
            const assistantMsgId = `assist_${Date.now()}`;

            try {
                // Gather context from all tabs
                const contextData = await ctx.gatherContext();
                ctx.outputChannel.appendLine(`[AI] Chat — context length: ${contextData.length} chars, history: ${history.length} msgs, webSearch: ${webSearch}`);
                if (contextData.length < 50) {
                    ctx.outputChannel.appendLine(`[AI] Warning: context is very short: "${contextData}"`);
                }
                // Tell webview an assistant message is starting
                ctx.postMessage({
                    type: 'aiChatStarted',
                    messageId: assistantMsgId,
                });

                await ctx.aiService.chat(
                    question,
                    contextData,
                    history,
                    (chunk) => {
                        ctx.postMessage({
                            type: 'aiChatChunk',
                            messageId: assistantMsgId,
                            chunk,
                        });
                    },
                    undefined,
                    webSearch,
                );

                ctx.postMessage({
                    type: 'aiChatDone',
                    messageId: assistantMsgId,
                });
            } catch (e: unknown) {
                const m = extractErrorMessage(e);
                ctx.postMessage({
                    type: 'aiChatError',
                    messageId: assistantMsgId,
                    error: m,
                });
            }
            return true;
        }

        case 'ai.agent': {
            if (!AiService.isAvailable()) {
                ctx.postMessage({ type: 'aiAgentError', error: 'AI features require GitHub Copilot' });
                return true;
            }
            const prompt = (msg.body as string | undefined) ?? '';
            const template = (msg.mode as string | undefined) ?? 'custom';
            const customSystemPrompt = (msg.systemPrompt as string | undefined) ?? '';
            try {
                const contextData = await ctx.gatherContext();
                ctx.outputChannel.appendLine(
                    `[AI] Agent run — template: ${template}, prompt length: ${prompt.length}, context: ${contextData.length} chars${customSystemPrompt ? ' (custom system prompt)' : ''}`,
                );
                ctx.postMessage({ type: 'aiAgentStarted' });

                const result = await ctx.aiService.agentAnalysis(
                    template,
                    prompt,
                    contextData,
                    (chunk) => {
                        ctx.postMessage({
                            type: 'aiAgentChunk',
                            chunk,
                        });
                    },
                    undefined,
                    customSystemPrompt || undefined,
                );

                ctx.postMessage({
                    type: 'aiAgentDone',
                    content: result,
                });
            } catch (e: unknown) {
                const m = extractErrorMessage(e);
                ctx.postMessage({
                    type: 'aiAgentError',
                    error: m,
                });
            }
            return true;
        }

        case 'ai.configureGeminiKey': {
            // Open the settings UI focused on the Gemini API key setting
            await vscode.commands.executeCommand(
                'workbench.action.openSettings',
                'superprompt-forge.ai.geminiApiKey',
            );
            return true;
        }

        default:
            return false;
    }
};
