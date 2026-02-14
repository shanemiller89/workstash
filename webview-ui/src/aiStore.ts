import { create } from 'zustand';

// ─── Types ────────────────────────────────────────────────────────

export interface AISummary {
    tabKey: string;
    content: string;
    updatedAt: string;
    isLoading: boolean;
    error?: string;
}

export interface AIChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    isStreaming?: boolean;
}

export interface AIModelInfo {
    id: string;
    name: string;
    vendor: string;
    family: string;
}

// ─── Store ────────────────────────────────────────────────────────

interface AIStore {
    // Whether the VS Code LM API is available (false in Cursor/Windsurf/etc)
    aiAvailable: boolean;
    // Which AI provider is active: 'copilot', 'gemini', or 'none'
    aiProvider: 'copilot' | 'gemini' | 'none';

    // Floating chat panel
    chatPanelOpen: boolean;

    // Summary right pane — which tab's summary is shown (null = closed)
    summaryPaneTabKey: string | null;

    // Summaries
    summaries: Record<string, AISummary>;
    /** Per-tab custom system prompts (tabKey → prompt text) */
    customPrompts: Record<string, string>;

    // Chat
    chatMessages: AIChatMessage[];
    chatInput: string;
    isChatLoading: boolean;
    webSearchEnabled: boolean;

    // Agent
    agentTemplate: string;
    agentPrompt: string;
    /** Per-template custom system prompt overrides (template key → prompt text) */
    agentSystemPrompts: Record<string, string>;
    agentResult: string;
    agentIsStreaming: boolean;
    agentError: string | null;
    /** Whether the agent results pane is open on the right */
    agentPaneOpen: boolean;
    /** Width of the agent results pane in pixels */
    agentPaneWidth: number;

    // Models
    availableModels: AIModelInfo[];
    modelAssignments: Record<string, string>; // purpose → model id

    // Actions
    setAiAvailable: (available: boolean, provider?: 'copilot' | 'gemini' | 'none') => void;
    toggleChatPanel: () => void;
    setChatPanelOpen: (open: boolean) => void;
    toggleSummaryPane: (tabKey: string) => void;
    setSummaryPaneTabKey: (tabKey: string | null) => void;

    // Summary actions
    setSummaryLoading: (tabKey: string) => void;
    setSummaryContent: (tabKey: string, content: string) => void;
    setSummaryError: (tabKey: string, error: string) => void;
    setCustomPrompt: (tabKey: string, prompt: string) => void;

    // Chat actions
    setChatInput: (input: string) => void;
    addUserMessage: (content: string) => string;
    addAssistantMessage: (id: string) => void;
    appendToAssistantMessage: (id: string, chunk: string) => void;
    finishAssistantMessage: (id: string) => void;
    setAssistantError: (id: string, error: string) => void;
    setChatLoading: (loading: boolean) => void;
    clearChat: () => void;
    setWebSearchEnabled: (enabled: boolean) => void;

    // Agent actions
    setAgentTemplate: (template: string) => void;
    setAgentPrompt: (prompt: string) => void;
    setAgentSystemPrompt: (template: string, prompt: string) => void;
    agentStarted: () => void;
    agentAppendChunk: (chunk: string) => void;
    agentDone: (content: string) => void;
    agentFailed: (error: string) => void;
    clearAgent: () => void;
    setAgentPaneOpen: (open: boolean) => void;
    setAgentPaneWidth: (width: number) => void;

    // Model actions
    setModelList: (models: AIModelInfo[], assignments: Record<string, string>) => void;
}

let _nextId = 0;
function genId(): string {
    return `msg_${Date.now()}_${_nextId++}`;
}

export const useAIStore = create<AIStore>((set, get) => ({
    aiAvailable: false,
    aiProvider: 'none' as const,
    chatPanelOpen: false,
    summaryPaneTabKey: null,
    summaries: {},
    customPrompts: {},
    chatMessages: [],
    chatInput: '',
    isChatLoading: false,
    webSearchEnabled: false,
    agentTemplate: 'sprint',
    agentPrompt: '',
    agentSystemPrompts: {},
    agentResult: '',
    agentIsStreaming: false,
    agentError: null,
    agentPaneOpen: false,
    agentPaneWidth: 380,
    availableModels: [],
    modelAssignments: {},

    setAiAvailable: (aiAvailable, provider) => set({ aiAvailable, aiProvider: provider ?? (aiAvailable ? 'copilot' : 'none') }),
    toggleChatPanel: () => set((s) => ({ chatPanelOpen: !s.chatPanelOpen })),
    setChatPanelOpen: (chatPanelOpen) => set({ chatPanelOpen }),
    toggleSummaryPane: (tabKey) =>
        set((s) => ({
            summaryPaneTabKey: s.summaryPaneTabKey === tabKey ? null : tabKey,
        })),
    setSummaryPaneTabKey: (summaryPaneTabKey) => set({ summaryPaneTabKey }),

    // ─── Summaries ────────────────────────────────────────────
    setSummaryLoading: (tabKey) =>
        set((s) => ({
            summaries: {
                ...s.summaries,
                [tabKey]: {
                    tabKey,
                    content: s.summaries[tabKey]?.content ?? '',
                    updatedAt: s.summaries[tabKey]?.updatedAt ?? '',
                    isLoading: true,
                    error: undefined,
                },
            },
        })),

    setSummaryContent: (tabKey, content) =>
        set((s) => ({
            summaries: {
                ...s.summaries,
                [tabKey]: {
                    tabKey,
                    content,
                    updatedAt: new Date().toISOString(),
                    isLoading: false,
                    error: undefined,
                },
            },
        })),

    setSummaryError: (tabKey, error) =>
        set((s) => ({
            summaries: {
                ...s.summaries,
                [tabKey]: {
                    tabKey,
                    content: s.summaries[tabKey]?.content ?? '',
                    updatedAt: s.summaries[tabKey]?.updatedAt ?? '',
                    isLoading: false,
                    error,
                },
            },
        })),

    setCustomPrompt: (tabKey, prompt) =>
        set((s) => ({
            customPrompts: { ...s.customPrompts, [tabKey]: prompt },
        })),

    // ─── Chat ────────────────────────────────────────────────
    setChatInput: (chatInput) => set({ chatInput }),

    addUserMessage: (content) => {
        const id = genId();
        set((s) => ({
            chatMessages: [
                ...s.chatMessages,
                {
                    id,
                    role: 'user' as const,
                    content,
                    timestamp: new Date().toISOString(),
                },
            ],
            chatInput: '',
            isChatLoading: true,
        }));
        return id;
    },

    addAssistantMessage: (id) => {
        set((s) => ({
            chatMessages: [
                ...s.chatMessages,
                {
                    id,
                    role: 'assistant' as const,
                    content: '',
                    timestamp: new Date().toISOString(),
                    isStreaming: true,
                },
            ],
        }));
    },

    appendToAssistantMessage: (id, chunk) => {
        set((s) => ({
            chatMessages: s.chatMessages.map((m) =>
                m.id === id ? { ...m, content: m.content + chunk } : m,
            ),
        }));
    },

    finishAssistantMessage: (id) => {
        set((s) => ({
            chatMessages: s.chatMessages.map((m) =>
                m.id === id ? { ...m, isStreaming: false } : m,
            ),
            isChatLoading: false,
        }));
    },

    setAssistantError: (id, error) => {
        set((s) => ({
            chatMessages: s.chatMessages.map((m) =>
                m.id === id ? { ...m, content: `⚠️ ${error}`, isStreaming: false } : m,
            ),
            isChatLoading: false,
        }));
    },

    setChatLoading: (isChatLoading) => set({ isChatLoading }),

    clearChat: () => set({ chatMessages: [], isChatLoading: false }),
    setWebSearchEnabled: (webSearchEnabled) => set({ webSearchEnabled }),

    // ─── Agent ───────────────────────────────────────────────
    setAgentTemplate: (agentTemplate) => set({ agentTemplate }),
    setAgentPrompt: (agentPrompt) => set({ agentPrompt }),
    setAgentSystemPrompt: (template, prompt) =>
        set((s) => ({
            agentSystemPrompts: { ...s.agentSystemPrompts, [template]: prompt },
        })),
    agentStarted: () => set({ agentIsStreaming: true, agentResult: '', agentError: null, agentPaneOpen: true }),
    agentAppendChunk: (chunk) => set((s) => ({ agentResult: s.agentResult + chunk })),
    agentDone: (content) => set({ agentResult: content, agentIsStreaming: false }),
    agentFailed: (error) => set({ agentError: error, agentIsStreaming: false }),
    clearAgent: () => set({ agentResult: '', agentError: null, agentIsStreaming: false, agentPaneOpen: false }),
    setAgentPaneOpen: (agentPaneOpen) => set({ agentPaneOpen }),
    setAgentPaneWidth: (agentPaneWidth) => set({ agentPaneWidth }),

    // ─── Models ──────────────────────────────────────────────
    setModelList: (models, assignments) => set({ availableModels: models, modelAssignments: assignments }),
}));
