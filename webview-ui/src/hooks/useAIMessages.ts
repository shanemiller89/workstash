/**
 * useAIMessages — dispatches extension→webview AI messages to the store.
 */
import { useAIStore, type AIModelInfo } from '../aiStore';

type Msg = { type: string; [key: string]: unknown };

export function handleAIMessage(msg: Msg): boolean {
    const s = useAIStore.getState();

    switch (msg.type) {
        case 'aiAvailable':
            s.setAiAvailable(
                msg.available as boolean,
                (msg.provider as 'copilot' | 'gemini' | 'none') ?? 'none',
            );
            return true;
        case 'aiSummaryResult':
            s.setSummaryContent(msg.tabKey as string, msg.content as string);
            return true;
        case 'aiSummaryError':
            s.setSummaryError(msg.tabKey as string, msg.error as string);
            return true;
        case 'aiChatChunk':
            s.appendToAssistantMessage(msg.messageId as string, msg.chunk as string);
            return true;
        case 'aiChatDone':
            s.finishAssistantMessage(msg.messageId as string);
            return true;
        case 'aiChatError':
            s.setAssistantError(msg.messageId as string, msg.error as string);
            return true;
        case 'aiChatStarted':
            s.addAssistantMessage(msg.messageId as string);
            return true;
        case 'aiAgentStarted':
            s.agentStarted();
            return true;
        case 'aiAgentChunk':
            s.agentAppendChunk(msg.chunk as string);
            return true;
        case 'aiAgentDone':
            s.agentDone(msg.content as string);
            return true;
        case 'aiAgentError':
            s.agentFailed(msg.error as string);
            return true;
        case 'aiModelList':
            s.setModelList(
                msg.models as AIModelInfo[],
                msg.assignments as Record<string, string>,
            );
            return true;
        default:
            return false;
    }
}
